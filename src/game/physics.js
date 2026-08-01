// 物理模拟与 ATC 自动驾驶
import {
    BASE_TRACTION_ACCEL,
    BASE_BRAKE_ACCEL,
    BASE_FRICTION_DECEL,
    BASE_AIR_RESISTANCE,
    MAX_PLAYER_HANDLE,
    MAX_ATC_HANDLE,
    HANDLE_RESPONSE_RATE_UP,
    HANDLE_RESPONSE_RATE_DOWN,
    HANDLE_RELEASE_RATE,
    PLATFORM_START,
    PLATFORM_END,
    TARGET_HEAD_POS,
    TRAIN_LENGTH,
    MIN_SPEED,
    ATC,
    WIND,
} from './data.js';
import { state, getLevelParams, getVehicleParams } from './state.js';
// 注：与 flow.js 存在运行期单向引用（physicsUpdate 调用 endGame），ESM live binding 安全。
import { endGame } from './flow.js';
import { showToast, updateUI } from './ui.js';
import { drawScene } from './render.js';

// 大风区随机风速幅度（参数集中在 data.js WIND）

// ---------- 路况重叠效应（坡度、积水）----------
// 计算列车车身与路况区域的重叠比例加权效应（physicsUpdate / updateATC 共用）
function computeZoneEffects(trainHead, trainTail, zones) {
    let totalGradient = 0;
    let totalWaterResist = 0;
    for (const zone of zones) {
        const zStart = zone.start;
        const zEnd = zone.end;
        const overlapStart = Math.max(trainTail, zStart);
        const overlapEnd = Math.min(trainHead, zEnd);
        if (overlapEnd > overlapStart) {
            const overlapLen = overlapEnd - overlapStart;
            const ratio = overlapLen / TRAIN_LENGTH;
            if (zone.type === 'gradient') {
                totalGradient += zone.value * ratio;
            } else if (zone.type === 'water') {
                totalWaterResist += zone.value * ratio;
            }
        }
    }
    return { totalGradient, totalWaterResist };
}

// ---------- ATC 速度曲线 ----------
function computeTargetSpeed(distToTarget) {
    if (distToTarget > ATC.cruiseDist) return ATC.cruiseSpeed;
    else if (distToTarget > ATC.midDist) {
        const ratio = (distToTarget - ATC.midDist) / (ATC.cruiseDist - ATC.midDist);
        return ATC.midSpeed + (ATC.cruiseSpeed - ATC.midSpeed) * ratio;
    } else if (distToTarget > ATC.finalDist) {
        const ratio = (distToTarget - ATC.finalDist) / (ATC.midDist - ATC.finalDist);
        return ATC.finalSpeed + (ATC.midSpeed - ATC.finalSpeed) * ratio;
    } else {
        const ratio = distToTarget / ATC.finalDist;
        return ATC.finalSpeed * ratio;
    }
}

// 计算列车覆盖的风区合成风速
function getWindSpeedForZones(zones, trainHead, trainTail) {
    let wind = 0;
    let totalOverlap = 0;
    let windSum = 0;

    for (const zone of zones) {
        if (zone.type !== 'wind') continue;
        const zStart = zone.start;
        const zEnd = zone.end;
        const overlapStart = Math.max(trainTail, zStart);
        const overlapEnd = Math.min(trainHead, zEnd);
        if (overlapEnd > overlapStart) {
            const overlapLen = overlapEnd - overlapStart;
            totalOverlap += overlapLen;
            const zoneKey = zone.id || `${zone.start}:${zone.end}:${zone.type}`;
            let baseWind = state.windBases[zoneKey] || 0;
            if (baseWind === 0) {
                const magnitude = WIND.baseMagnitude + Math.random() * WIND.randomRange;
                const sign = Math.random() > 0.5 ? 1 : -1;
                baseWind = sign * magnitude;
                state.windBases[zoneKey] = baseWind;
            }
            const amp = Math.abs(baseWind) * 0.2;
            const phase = ((zone.start % 100) + (zone.end - zone.start) * 0.1) * 0.1 + 1.7;
            const wave = Math.sin(state.gameTime * 0.5 + phase) * amp;
            const instantWind = baseWind + wave;
            windSum += instantWind * overlapLen;
        }
    }

    if (totalOverlap > 0) {
        wind = windSum / totalOverlap;
    }
    state.windSpeed = wind;
    return wind;
}

// ---------- ATC 控制更新 ----------
function updateATC(dt) {
    if (!state.atcActive) return;
    const level = getLevelParams();
    const vehicle = getVehicleParams();
    const distToTarget = Math.max(0, state.atcTargetPos - state.pos);
    const targetSpeed = computeTargetSpeed(distToTarget);
    state.atcTargetSpeed = targetSpeed;

    const error = targetSpeed - state.speed;
    const Kp = ATC.Kp, Ki = ATC.Ki, Kd = ATC.Kd;
    state.atcIntegral += error * dt;
    state.atcIntegral = Math.min(ATC.integralLimit, Math.max(-ATC.integralLimit, state.atcIntegral));
    const derivative = (error - state.atcPrevError) / dt;
    state.atcPrevError = error;

    let accelCmd = Kp * error + Ki * state.atcIntegral + Kd * derivative;

    // 前馈补偿
    const zones = level.zones || [];
    const trainHead = state.pos;
    const trainTail = state.pos - TRAIN_LENGTH;
    const { totalGradient, totalWaterResist } = computeZoneEffects(trainHead, trainTail, zones);
    const wind = getWindSpeedForZones(zones, trainHead, trainTail);

    let feedforward = 0;
    if (totalGradient !== 0) feedforward += 9.8 * totalGradient;
    if (totalWaterResist > 0) feedforward += totalWaterResist * state.speed * state.speed;
    if (Math.abs(wind) > 0.01) {
        const relativeSpeed = state.speed + wind;
        const airDrag = BASE_AIR_RESISTANCE * (vehicle.airResistanceFactor || 1.0) * relativeSpeed * Math.abs(relativeSpeed);
        feedforward += 0.25 * airDrag; // “大风”前馈补偿系数调整
    }

    accelCmd += feedforward;
    accelCmd = Math.min(ATC.accelLimit, Math.max(-ATC.accelLimit, accelCmd));

    let handleOut = 0;
    if (accelCmd > 0.1) {
        handleOut = Math.min(MAX_ATC_HANDLE, Math.round(accelCmd / BASE_TRACTION_ACCEL));
    } else if (accelCmd < -0.1) {
        handleOut = Math.max(-MAX_ATC_HANDLE, Math.round(accelCmd / BASE_BRAKE_ACCEL));
    }

    // 末段强制制动
    if (distToTarget < 0.35 && state.speed > 0.1) {
        handleOut = -3;
    }

    const currentHandle = state.handle;
    const targetHandle = handleOut;
    const delta = targetHandle - currentHandle;

    if (Math.abs(delta) > 0.01) {
        const maxChange = ATC.handleResponseDelay * 20;
        const change = Math.sign(delta) * Math.min(Math.abs(delta), maxChange * dt);
        state.handle += change;
    } else {
        state.handle = targetHandle;
    }
    state.handle = Math.min(MAX_ATC_HANDLE, Math.max(-MAX_ATC_HANDLE, state.handle));
}

// ---------- 物理更新 ----------
export function physicsUpdate(dt) {
    if (!state.running || state.ended) return;
    if (dt > 0.05) dt = 0.05;

    const level = getLevelParams();
    const vehicle = getVehicleParams();
    const isATC = vehicle.isATC || false;

    if (isATC && !state.atcActive) {
        if (state.pos >= (-ATC.cruiseDist)) {
            state.atcActive = true;
            state.atcTargetPos = TARGET_HEAD_POS;
            showToast('🤖 ATC自动驾驶已激活');
        }
    }

    if (isATC && state.atcActive) {
        updateATC(dt);
    } else if (!isATC) {
        const current = state.handle;
        const target = state.targetHandle;
        let deltaHandle = 0;
        if (Math.abs(target - current) > 0.01) {
            const dir = Math.sign(target - current);
            const isRelease = (target * current < 0) || (Math.abs(target) < Math.abs(current));
            let rate;
            if (isRelease) rate = HANDLE_RELEASE_RATE;
            else {
                if (target > 0) rate = HANDLE_RESPONSE_RATE_UP;
                else rate = HANDLE_RESPONSE_RATE_DOWN;
            }
            deltaHandle = dir * rate * dt;
            if (Math.abs(deltaHandle) > Math.abs(target - current)) deltaHandle = target - current;
            state.handle += deltaHandle;
            if (current < 0 && state.handle >= 0) {
                state.didRelease = true;
                state.lastReleaseTime = state.gameTime;
                state.lastReleasePos = state.pos;
                state.lastReleaseSpeed = state.speed;
            }
        } else {
            state.handle = target;
        }
        state.handle = Math.min(MAX_PLAYER_HANDLE, Math.max(-MAX_PLAYER_HANDLE, state.handle));
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
    const zones = level.zones || [];
    const trainHead = state.pos;
    const trainTail = state.pos - TRAIN_LENGTH;
    if (!isATC || !state.atcActive) {
        getWindSpeedForZones(zones, trainHead, trainTail);
    }
    const relativeSpeed = state.speed + state.windSpeed;
    const airDrag = BASE_AIR_RESISTANCE * (vehicle.airResistanceFactor || 1.0) * relativeSpeed * Math.abs(relativeSpeed);
    accel -= airDrag;
    if (state.speed > 0.01) accel -= frictionDecel;
    else if (state.speed < -0.01) accel += frictionDecel;

    if (!isATC || !state.atcActive) {
        const { totalGradient, totalWaterResist } = computeZoneEffects(trainHead, trainTail, zones);
        if (totalGradient !== 0) {
            accel -= 9.8 * totalGradient;
        }
        if (totalWaterResist > 0) {
            accel -= totalWaterResist * state.speed * state.speed;
        }
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
        endGame(state.pos - TARGET_HEAD_POS, 'overshoot');
        return;
    }

    const deviation = state.pos - TARGET_HEAD_POS;
    state.deviation = deviation;

    if (Math.abs(state.speed) < MIN_SPEED) {
        state.stopTimer += dt;
        if (state.stopTimer >= 0.5) {
            endGame(deviation, 'normal');
            return;
        }
    } else {
        state.stopTimer = 0;
    }

    if (state.pos > PLATFORM_END + 50) state.pos = PLATFORM_END + 50;
    if (state.pos < -200) state.pos = -200;

    updateUI();
    drawScene();
}
