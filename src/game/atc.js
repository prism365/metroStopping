// ATC 自动驾驶控制器：PID + 前馈补偿 → 目标手柄命令
// 内部状态（积分、误差、目标速度、激活标志）封装在实例中，不再散落全局 state。
// 换算常数（tractionAccel / brakeAccel / maxHandle / handleRate）由 data.js ATC 配置注入，与物理实现解耦。
import { ATC } from './data.js';

// 目标速度曲线（按剩余距离分段线性插值）
function computeTargetSpeed(distToTarget, config) {
    if (distToTarget > config.cruiseDist) return config.cruiseSpeed;
    else if (distToTarget > config.midDist) {
        const ratio = (distToTarget - config.midDist) / (config.cruiseDist - config.midDist);
        return config.midSpeed + (config.cruiseSpeed - config.midSpeed) * ratio;
    } else if (distToTarget > config.finalDist) {
        const ratio = (distToTarget - config.finalDist) / (config.midDist - config.finalDist);
        return config.finalSpeed + (config.midSpeed - config.finalSpeed) * ratio;
    } else {
        const ratio = distToTarget / config.finalDist;
        return config.finalSpeed * ratio;
    }
}

export class ATCController {
    constructor({ config = ATC, vehicle = {}, targetPos }) {
        this.config = config;
        this.vehicle = vehicle;
        this.targetPos = targetPos;
        this.active = false;   // 原 state.atcActive
        this.integral = 0;     // 原 state.atcIntegral
        this.prevError = 0;    // 原 state.atcPrevError
        this.targetSpeed = 0;  // 原 state.atcTargetSpeed
        // 物理层读取的手柄域参数（来自 ATC 配置，见 data.js）
        this.maxHandle = config.maxHandle;
        this.handleRate = config.handleRate;
    }

    // 是否达到激活点（位置越过激活点后接管；阈值来自 ATC 配置，物理层无需感知）
    shouldActivate(pos) {
        return pos >= -this.config.cruiseDist;
    }

    // 控制器步进：输入仿真状态与环境快照，输出目标手柄命令（不含手柄响应平滑，由物理层统一处理）
    update({ pos, speed, dt, env }) {
        const cfg = this.config;
        const distToTarget = Math.max(0, this.targetPos - pos);
        this.targetSpeed = computeTargetSpeed(distToTarget, cfg);
        const error = this.targetSpeed - speed;

        this.integral += error * dt;
        this.integral = Math.min(cfg.integralLimit, Math.max(-cfg.integralLimit, this.integral));
        const derivative = (error - this.prevError) / dt;
        this.prevError = error;

        let accelCmd = cfg.Kp * error + cfg.Ki * this.integral + cfg.Kd * derivative;

        // 前馈补偿（使用物理层同一帧的环境快照）
        let feedforward = 0;
        if (env.totalGradient !== 0) feedforward += 9.8 * env.totalGradient;
        if (env.totalWaterResist > 0) feedforward += env.totalWaterResist * speed * speed;
        if (Math.abs(env.windSpeed) > 0.01) {
            feedforward += 0.75 * env.airDrag; // “大风”前馈补偿系数
        }
        accelCmd += feedforward;
        accelCmd = Math.min(cfg.accelLimit, Math.max(-cfg.accelLimit, accelCmd));

        // 加速度命令 → 目标手柄（换算常数由配置注入，解耦物理内部实现）
        let handleOut = 0;
        if (accelCmd > 0.1) {
            handleOut = Math.min(cfg.maxHandle, Math.round(accelCmd / cfg.tractionAccel));
        } else if (accelCmd < -0.1) {
            handleOut = Math.max(-cfg.maxHandle, Math.round(accelCmd / cfg.brakeAccel));
        }

        // 末段强制制动
        if (distToTarget < 0.35 && speed > 0.1) {
            handleOut = -cfg.maxHandle;
        }

        return { targetHandle: handleOut };
    }
}
