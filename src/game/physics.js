// 物理模拟：唯一职责 = 状态积分
// ATC 控制 / 环境（路况·风·阻力）/ 手柄响应 分别由 atc.js / environment.js / control.js 提供。
// 不再依赖 flow.js / ui.js / render.js：终局与 UI 事件以返回值上抛给 main.js 统一调度。
import {
    BASE_TRACTION_ACCEL,
    BASE_BRAKE_ACCEL,
    BASE_FRICTION_DECEL,
    MAX_PLAYER_HANDLE,
    PLATFORM_START,
    PLATFORM_END,
    TARGET_HEAD_POS,
    MIN_SPEED,
} from './data.js';
import { state, getVehicleParams } from './state.js';
import { smoothHandle, getManualRate } from './control.js';

// ---------- 物理更新 ----------
// 返回 null（正常运行）或事件对象：
//   { atcActivated: true }                  —— ATC 本帧激活（由 main.js 弹提示）
//   { ended: true, reason, deviation }      —— 运行结束（由 main.js 调 endGame）
export function physicsUpdate(dt) {
    if (!state.running || state.ended) return null;
    if (!state.env) return null;
    if (dt > 0.05) dt = 0.05;

    const vehicle = getVehicleParams();
    const isATC = vehicle.isATC || false;

    let events = null;

    // ATC 激活（位置越过激活点后接管；激活提示由 main.js 处理）
    if (isATC && state.atc && !state.atc.active && state.atc.shouldActivate(state.pos)) {
        state.atc.active = true;
        events = { atcActivated: true };
    }
    const atcEngaged = isATC && !!state.atc && state.atc.active;

    // 每帧计算一次环境快照（ATC 前馈与物理外力共用，消除重复计算）
    const env = state.env.update({ pos: state.pos, speed: state.speed, gameTime: state.gameTime });
    state.windSpeed = env.windSpeed; // 发布给渲染/UI 读取

    // 控制器分支：统一手柄响应平滑
    if (atcEngaged) {
        const cmd = state.atc.update({ pos: state.pos, speed: state.speed, dt, env });
        state.handle = smoothHandle({
            current: state.handle,
            target: cmd.targetHandle,
            dt,
            maxAbs: state.atc.maxHandle,
            getRate: () => state.atc.handleRate,
        });
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
            state.didRelease = true;
            state.lastReleaseTime = state.gameTime;
            state.lastReleasePos = state.pos;
            state.lastReleaseSpeed = state.speed;
        }
    }

    let accel = 0;
    const trac = state.handle > 0 ? state.handle : 0;
    const brake = state.handle < 0 ? -state.handle : 0;
    const tracFactor = vehicle.tractionFactor || 1.0;
    const brakeFactor = vehicle.brakeFactor || 1.0;
    const maxSpeed = vehicle.maxSpeed || 28.0;

    if (trac > 0) accel += trac * BASE_TRACTION_ACCEL * tracFactor;
    if (brake > 0) {
        const speedFactor = Math.min(1.0, state.speed / 15.0);
        const brakeAccel = brake * BASE_BRAKE_ACCEL * brakeFactor * (0.5 + 0.5 * speedFactor);
        accel -= brakeAccel;
    }

    const frictionDecel = BASE_FRICTION_DECEL * (vehicle.frictionFactor || 1.0);
    accel -= env.airDrag;
    if (state.speed > 0.01) accel -= frictionDecel;
    else if (state.speed < -0.01) accel += frictionDecel;

    // 路况外力统一施加（ATC 与手动一致；ATC 通过控制器前馈主动补偿，物理侧不区分模式）
    if (env.totalGradient !== 0) {
        accel -= 9.8 * env.totalGradient;
    }
    if (env.totalWaterResist > 0) {
        accel -= env.totalWaterResist * state.speed * state.speed;
    }

    if (Math.abs(state.speed) < 0.01 && accel < 0) accel = 0;
    if (state.speed < 0) state.speed = 0;

    accel = Math.min(2.0, Math.max(-2.0, accel));
    state.currentAccel = accel;

    if (accel < 0 && state.speed > 0.1) {
        const decel = -accel;
        if (decel > state.maxDecel) state.maxDecel = decel;
    }

    state.speed += accel * dt;
    if (state.speed < 0) state.speed = 0;
    if (state.speed > maxSpeed) state.speed = maxSpeed;

    state.pos += state.speed * dt;
    state.gameTime += dt;

    if (state.pos >= PLATFORM_START && state.entryTime === null) {
        state.entryTime = state.gameTime;
    }
    if (state.entryTime !== null) {
        state.timer = state.gameTime - state.entryTime;
    }

    if (state.pos > PLATFORM_END + 10) {
        return { ...events, ended: true, reason: 'overshoot', deviation: state.pos - TARGET_HEAD_POS };
    }

    const deviation = state.pos - TARGET_HEAD_POS;
    state.deviation = deviation;

    if (Math.abs(state.speed) < MIN_SPEED) {
        state.stopTimer += dt;
        if (state.stopTimer >= 0.5) {
            return { ...events, ended: true, reason: 'normal', deviation };
        }
    } else {
        state.stopTimer = 0;
    }

    if (state.pos > PLATFORM_END + 50) state.pos = PLATFORM_END + 50;
    if (state.pos < -200) state.pos = -200;

    return events;
}
