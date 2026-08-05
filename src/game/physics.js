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
    MAX_DT,
    BRAKE_SPEED_REF,
    SPEED_EPSILON,
    MAX_DECEL_RECORD_SPEED,
    ACCEL_LIMIT,
    OVERSHOOT_LIMIT,
    STOP_CONFIRM_TIME,
    POS_CLAMP_MAX_OFFSET,
    POS_CLAMP_MIN,
} from './data.js';
import { state, getVehicleParams } from './state.js';
import { smoothHandle, getManualRate } from './control.js';

// ---------- 纯函数：加速度合成 ----------
// 由手柄、速度、车辆参数与环境快照合成当前帧加速度
// （含摩擦/空气阻力/坡度/积水/停稳置零/clamp）。与旧内联逻辑逐行等价，供验证脚本对拍。
export function computeAcceleration({ handle, speed, vehicle, env }) {
    let accel = 0;
    const trac = handle > 0 ? handle : 0;
    const brake = handle < 0 ? -handle : 0;
    const tracFactor = vehicle.tractionFactor || 1.0;
    const brakeFactor = vehicle.brakeFactor || 1.0;

    if (trac > 0) accel += trac * BASE_TRACTION_ACCEL * tracFactor;
    if (brake > 0) {
        const speedFactor = Math.min(1.0, speed / BRAKE_SPEED_REF);
        const brakeAccel = brake * BASE_BRAKE_ACCEL * brakeFactor * (0.5 + 0.5 * speedFactor);
        accel -= brakeAccel;
    }

    const frictionDecel = BASE_FRICTION_DECEL * (vehicle.frictionFactor || 1.0);
    accel -= env.airDrag;
    if (speed > SPEED_EPSILON) accel -= frictionDecel;
    else if (speed < -SPEED_EPSILON) accel += frictionDecel;

    // 路况外力统一施加（ATC 与手动一致；ATC 通过控制器前馈主动补偿，物理侧不区分模式）
    if (env.totalGradient !== 0) {
        accel -= 9.8 * env.totalGradient;
    }
    if (env.totalWaterResist > 0) {
        accel -= env.totalWaterResist * speed * speed;
    }

    if (Math.abs(speed) < SPEED_EPSILON && accel < 0) accel = 0;

    return Math.min(ACCEL_LIMIT, Math.max(-ACCEL_LIMIT, accel));
}

// ---------- 纯函数：终局判定与位置钳制 ----------
// 返回 { ended: true, reason, deviation } 或 { ended: false, pos }（钳制后的位置）。
// stopTimer 累积与 deviation 发布写入 stats，与旧逻辑等价。
export function evaluateTermination({ pos, speed, stats, dt }) {
    if (pos > PLATFORM_END + OVERSHOOT_LIMIT) {
        return { ended: true, reason: 'overshoot', deviation: pos - TARGET_HEAD_POS };
    }

    const deviation = pos - TARGET_HEAD_POS;
    stats.deviation = deviation;

    if (Math.abs(speed) < MIN_SPEED) {
        stats.stopTimer += dt;
        if (stats.stopTimer >= STOP_CONFIRM_TIME) {
            return { ended: true, reason: 'normal', deviation };
        }
    } else {
        stats.stopTimer = 0;
    }

    let clampedPos = pos;
    if (clampedPos > PLATFORM_END + POS_CLAMP_MAX_OFFSET) clampedPos = PLATFORM_END + POS_CLAMP_MAX_OFFSET;
    if (clampedPos < POS_CLAMP_MIN) clampedPos = POS_CLAMP_MIN;
    return { ended: false, pos: clampedPos };
}

// ---------- 物理更新 ----------
// 返回 null（正常运行）或事件对象：
//   { atcActivated: true }                  —— ATC 本帧激活（由 main.js 弹提示）
//   { ended: true, reason, deviation }      —— 运行结束（由 main.js 调 endGame）
export function physicsUpdate(dt) {
    if (!state.running || state.ended) return null;
    if (!state.env || !state.stats) {
        console.error('physicsUpdate: state.env / state.stats 未初始化（需先 resetFull）');
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

    // 加速度合成（纯函数）
    const accel = computeAcceleration({ handle: state.handle, speed: state.speed, vehicle, env });
    stats.currentAccel = accel;

    if (state.speed < 0) state.speed = 0;

    if (accel < 0 && state.speed > MAX_DECEL_RECORD_SPEED) {
        const decel = -accel;
        if (decel > stats.maxDecel) stats.maxDecel = decel;
    }

    state.speed += accel * dt;
    if (state.speed < 0) state.speed = 0;
    if (state.speed > maxSpeed) state.speed = maxSpeed;

    state.pos += state.speed * dt;
    state.gameTime += dt;

    if (state.pos >= PLATFORM_START && stats.entryTime === null) {
        stats.entryTime = state.gameTime;
    }
    if (stats.entryTime !== null) {
        stats.timer = state.gameTime - stats.entryTime;
    }

    const term = evaluateTermination({ pos: state.pos, speed: state.speed, stats, dt });
    if (term.ended) {
        return { ...events, ended: true, reason: term.reason, deviation: term.deviation };
    }
    state.pos = term.pos;

    return events;
}
