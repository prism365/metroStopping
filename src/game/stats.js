// 运行统计与遥测：单次运行的评分输入统计 + 供渲染/UI 读取的遥测快照
// 每次运行一个 RunStats 实例（flow.resetFull 创建，beginRun 时 reset），与 env/atc 实例化模式一致。
// 写者：sim.js（maxDecel/currentAccel/entryTime/timer/didRelease/lastRelease*/windSpeed/stopTimer/deviation）、
//       input.js（brakeCount/handleChanges）、flow.js（prevSpeed）
// 读者：flow.js（评分输入）、render.js / ui.js（遥测）
import { MAX_DECEL_RECORD_SPEED, PLATFORM_START } from './data.js';

// ---------- 纯函数：统计写入 ----------
// 作用于任意 stats 对象（RunStats 实例 / sim.js 的 state.stats / 对拍脚本的 plain object）。
// 顺序敏感：recordAccel 调用前需先完成 speed<0 钳制（与旧 physicsUpdate 逐行等价）。
export function recordAccel(stats, accel, speed) {
    stats.currentAccel = accel;
    if (accel < 0 && speed > MAX_DECEL_RECORD_SPEED) {
        const decel = -accel;
        if (decel > stats.maxDecel) stats.maxDecel = decel;
    }
}

// 进站计时：越过 PLATFORM_START 首次记录 entryTime，此后持续更新 timer
export function recordEntry(stats, pos, gameTime) {
    if (pos >= PLATFORM_START && stats.entryTime === null) {
        stats.entryTime = gameTime;
    }
    if (stats.entryTime !== null) {
        stats.timer = gameTime - stats.entryTime;
    }
}

export class RunStats {
    constructor() {
        this.maxDecel = 0;            // 本运行最大减速度（评分/成就）
        this.brakeCount = 0;          // 制动次数（input.js 写入）
        this.handleChanges = 0;       // 手柄变动次数（input.js 写入）
        this.didRelease = false;      // 停稳前是否缓解制动
        this.lastReleaseTime = null;  // 最后一次缓解制动的时间
        this.lastReleasePos = null;   // 最后一次缓解制动的位置
        this.lastReleaseSpeed = null; // 最后一次缓解制动时的速度
        this.stopTimer = 0;           // 停稳计时（physics.js 内部）
        this.prevSpeed = 0;           // 上一帧速度（flow.js 写入；暂无消费方，保留对齐旧结构）
        this.currentAccel = 0;        // 本帧合成加速度（渲染展示）
        this.entryTime = null;        // 车头进入站台时刻
        this.timer = 0;               // 进站后经过时间（停靠计时）
        this.deviation = null;        // 停车偏差
        this.windSpeed = 0;           // 本帧合成风速（渲染/UI 展示）
    }

    // 委托给同名的导出纯函数（sim.js 可直接调实例方法）
    recordAccel(accel, speed) { recordAccel(this, accel, speed); }
    recordEntry(pos, gameTime) { recordEntry(this, pos, gameTime); }

    // 一次运行开始前的归零（beginRun 复用 resetFull 创建的实例时调用）
    reset() {
        this.maxDecel = 0;
        this.brakeCount = 0;
        this.handleChanges = 0;
        this.didRelease = false;
        this.lastReleaseTime = null;
        this.lastReleasePos = null;
        this.lastReleaseSpeed = null;
        this.stopTimer = 0;
        this.prevSpeed = 0;
        this.currentAccel = 0;
        this.entryTime = null;
        this.timer = 0;
        this.deviation = null;
        this.windSpeed = 0;
    }
}
