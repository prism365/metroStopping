// 纯物理工具库：加速度合成 / 积分 / 终局判定（无状态、无副作用）
// 帧编排（环境快照 / 控制分支 / 统计 / 事件）在 sim.js 的 stepGame 中完成；
// ATC 控制 / 环境（路况·风·阻力）/ 手柄响应分别由 atc.js / environment.js / control.js 提供。
import {
    BASE_TRACTION_ACCEL,
    BASE_BRAKE_ACCEL,
    BASE_FRICTION_DECEL,
    PLATFORM_END,
    TARGET_HEAD_POS,
    MIN_SPEED,
    BRAKE_SPEED_REF,
    SPEED_EPSILON,
    ACCEL_LIMIT,
    OVERSHOOT_LIMIT,
    STOP_CONFIRM_TIME,
    POS_CLAMP_MAX_OFFSET,
    POS_CLAMP_MIN,
} from './data.js';

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

// ---------- 纯函数：运动学积分 ----------
// 由加速度推进速度与位置（含负速归零、超速截断）。与旧 physicsUpdate 内联积分逐行等价，供验证脚本对拍。
export function integrate({ pos, speed, accel, dt, maxSpeed }) {
    let v = speed + accel * dt;
    if (v < 0) v = 0;
    if (v > maxSpeed) v = maxSpeed;
    return { pos: pos + v * dt, speed: v };
}

// ---------- 纯函数：终局判定与位置钳制 ----------
// 无副作用：stopTimer 入参、返回新值；deviation 随返回值携带，由调用方（sim.js）写入 stats。
// 返回 { ended: true, reason, deviation, stopTimer } 或 { ended: false, pos, deviation, stopTimer }。
export function evaluateTermination({ pos, speed, dt, stopTimer }) {
    if (pos > PLATFORM_END + OVERSHOOT_LIMIT) {
        return { ended: true, reason: 'overshoot', deviation: pos - TARGET_HEAD_POS, stopTimer };
    }

    const deviation = pos - TARGET_HEAD_POS;

    if (Math.abs(speed) < MIN_SPEED) {
        stopTimer += dt;
        if (stopTimer >= STOP_CONFIRM_TIME) {
            return { ended: true, reason: 'normal', deviation, stopTimer };
        }
    } else {
        stopTimer = 0;
    }

    let clampedPos = pos;
    if (clampedPos > PLATFORM_END + POS_CLAMP_MAX_OFFSET) clampedPos = PLATFORM_END + POS_CLAMP_MAX_OFFSET;
    if (clampedPos < POS_CLAMP_MIN) clampedPos = POS_CLAMP_MIN;
    return { ended: false, pos: clampedPos, deviation, stopTimer };
}


