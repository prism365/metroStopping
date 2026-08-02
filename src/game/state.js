// 共享运行时状态：单次运行状态、玩家进度、成就解锁状态、当前关卡/车辆解析
import { ACHIEVEMENTS as ACHIEVEMENT_DEFS, LEVELS, VEHICLES } from './data.js';

// 单次运行状态
export const state = {
    pos: -100,
    speed: 15.0,
    handle: 0,
    targetHandle: 0,
    running: false,
    ended: false,
    score: null,
    deviation: null,
    entryTime: null,
    gameTime: 0,
    timer: 0,
    countdown: 3,
    countdownActive: false,
    stopTimer: 0,
    maxDecel: 0,
    brakeCount: 0,
    handleChanges: 0,
    prevSpeed: 0,
    currentAccel: 0,
    didRelease: false,
    lastReleaseTime: null,
    lastReleasePos: null,
    lastReleaseSpeed: null,
    windSpeed: 0,
    pendingAction: null,
    resultStatus: null,
    // 运行期上下文实例（flow.resetFull 创建，内部可变成分封装，不再平铺全局）
    env: null, // Environment：路况/风/阻力快照
    atc: null, // ATCController：仅 ATC 车辆创建
    arcadeZones: null,
};

// 玩家持久化进度
export const playerProgress = {
    unlockedLevels: [0],
    currentLevel: 0,
    currentVehicle: 'STANDARD',
    unlockedVehicles: ['STANDARD'],
    levelStars: {},
};

// 成就运行时状态（map 为解锁状态副本）
export const achievements = {
    map: Object.fromEntries(
        Object.entries(ACHIEVEMENT_DEFS).map(([key, value]) => [key, { ...value, unlocked: false }])
    ),
    gameCount: 0,
    unlockedThisRun: [],
};

// 重置一次运行中会变化的字段（resetFull / beginRun 共用）
export function resetRunFields() {
    state.handle = 0;
    state.targetHandle = 0;
    state.score = null;
    state.deviation = null;
    state.entryTime = null;
    state.timer = 0;
    state.stopTimer = 0;
    state.maxDecel = 0;
    state.brakeCount = 0;
    state.handleChanges = 0;
    state.currentAccel = 0;
    state.didRelease = false;
    state.lastReleaseTime = null;
    state.lastReleasePos = null;
    state.lastReleaseSpeed = null;
    state.windSpeed = 0;
    state.pendingAction = null;
    state.resultStatus = null;
    // 注意：state.env / state.atc 不在此重置 —— 由 resetFull 每次运行重建，
    // beginRun 复用的是 resetFull 刚创建的实例。
}

// ---------- 街机模式随机路况生成 ----------
function generateArcadeZones() {
    const zones = [];
    const types = ['gradient', 'water', 'wind'];
    const numZones = 2 + Math.floor(Math.random() * 2);
    const usedStarts = [];
    const minGap = 10;
    for (let i = 0; i < numZones; i++) {
        let type;
        if (i > 0 && zones[i - 1]?.type === types[i % types.length]) {
            type = types[(i + 1) % types.length];
        } else {
            type = types[i % types.length];
        }
        let start, end;
        let attempts = 0;
        // 地形位置、长度调整
        do {
            start = -40 - Math.random() * 60;
            end = start + 20 + Math.random() * 50;
            attempts++;
        } while (attempts < 30 && usedStarts.some(s => Math.abs(s - start) < minGap));
        usedStarts.push(start);
        end = Math.min(end, -5);
        if (end - start < 15) end = start + 20;
        const zone = { start, end, type };
        if (type === 'gradient') {
            zone.value = (Math.random() > 0.5 ? 1 : -1) * (0.02 + Math.random() * 0.02);
        } else if (type === 'water') {
            zone.value = 0.005 + Math.random() * 0.006;
        }
        zones.push(zone);
    }
    zones.sort((a, b) => a.start - b.start);
    return zones;
}

// 当前关卡参数（街机模式会缓存随机路况）
export function getLevelParams() {
    const level = LEVELS.find(l => l.id === playerProgress.currentLevel) || LEVELS[0];
    if (level.id === 8) {
        if (!state.arcadeZones) {
            state.arcadeZones = generateArcadeZones();
        }
        return { ...level, zones: state.arcadeZones };
    }
    return level;
}

// 当前车辆参数
export function getVehicleParams() {
    return VEHICLES[playerProgress.currentVehicle] || VEHICLES.STANDARD;
}
