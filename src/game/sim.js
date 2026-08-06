// 帧模拟编排：stepGame —— 环境 → 控制 → 物理 → 统计 → 事件
// 纯物理公式在 physics.js（computeAcceleration / integrate / evaluateTermination）；
// 控制分支复用 control.js（smoothHandle / getManualRate）、atc.js（ATCController）；
// 统计写入收拢于 stats.js（recordAccel / recordEntry）；stopTimer / deviation 由 stepGame 落地（physics 纯函数返回值）。
// 不依赖 flow.js / ui.js / render.js：终局与 UI 事件以返回值上抛给 main.js 统一调度。
import { state, getVehicleParams } from './state.js';
import { computeAcceleration, integrate, evaluateTermination } from './physics.js';
import { smoothHandle, getManualRate } from './control.js';
import { recordAccel, recordEntry } from './stats.js';
import { MAX_DT, MAX_PLAYER_HANDLE } from './data.js';

// 返回 null（正常运行）或事件对象：
//   { atcActivated: true }                  —— ATC 本帧激活（由 main.js 弹提示）
//   { ended: true, reason, deviation }      —— 运行结束（由 main.js 调 endGame）
export function stepGame(dt) {
    if (!state.running || state.ended) return null;
    if (!state.env || !state.stats) {
        console.error('stepGame: state.env / state.stats 未初始化（需先 resetFull）');
        return null;
    }
    if (dt > MAX_DT) dt = MAX_DT;

    const vehicle = getVehicleParams();
    const isATC = vehicle.isATC || false;
    const stats = state.stats;
    const maxSpeed = vehicle.maxSpeed || 28.0;

    let events = null;

    // 每帧计算一次环境快照（ATC 前馈与物理外力共用，消除重复计算）
    const env = state.env.update({ pos: state.pos, speed: state.speed, gameTime: state.gameTime });
    stats.windSpeed = env.windSpeed; // 发布给渲染/UI 读取

    // 控制器分支：统一手柄响应平滑（ATC 激活判定已内聚于 atc.js）
    if (isATC && state.atc) {
        const cmd = state.atc.update({ pos: state.pos, speed: state.speed, dt, env });
        if (cmd) {
            if (cmd.atcActivated) events = { atcActivated: true };
            state.handle = smoothHandle({
                current: state.handle,
                target: cmd.targetHandle,
                dt,
                maxAbs: state.atc.maxHandle,
                getRate: () => state.atc.handleRate,
            });
        }
    } else if (!isATC) {
        const prevHandle = state.handle;
        state.handle = smoothHandle({
            current: state.handle,
            target: state.targetHandle,
            dt,
            maxAbs: MAX_PLAYER_HANDLE,
            getRate: getManualRate,
        });
        if (prevHandle < 0 && state.handle >= 0) {
            stats.didRelease = true;
            stats.lastReleaseTime = state.gameTime;
            stats.lastReleasePos = state.pos;
            stats.lastReleaseSpeed = state.speed;
        }
    }

    // 物理（纯函数）：加速度合成 → 统计 → 积分
    const accel = computeAcceleration({ handle: state.handle, speed: state.speed, vehicle, env });
    if (state.speed < 0) state.speed = 0; // 积分前钳制（须先于 recordAccel，与旧逻辑等价）
    recordAccel(stats, accel, state.speed);
    const { pos, speed } = integrate({ pos: state.pos, speed: state.speed, accel, dt, maxSpeed });
    state.pos = pos;
    state.speed = speed;
    state.gameTime += dt;

    // 进站计时 + 终局判定（physics 纯函数；stopTimer/deviation 落地到 stats 由编排层完成）
    recordEntry(stats, state.pos, state.gameTime);
    const term = evaluateTermination({ pos: state.pos, speed: state.speed, dt, stopTimer: stats.stopTimer });
    stats.stopTimer = term.stopTimer;
    // 冲标帧不发布 deviation（旧语义：终局偏差由 endGame 统一写入）
    if (term.reason !== 'overshoot') stats.deviation = term.deviation;
    if (term.ended) {
        return { ...events, ended: true, reason: term.reason, deviation: term.deviation };
    }
    state.pos = term.pos;

    return events;
}
