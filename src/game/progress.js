// 成就与玩家进度逻辑（纯逻辑 + 持久化，不依赖 UI；成就解锁的 toast 反馈由调用方 flow.js 统一处理）
import { LEVELS, VEHICLES, TARGET_HEAD_POS, ACHIEVEMENT_RULES } from './data.js';
import * as storage from './storage.js';
import { playerProgress, achievements } from './state.js';

// ---------- 成就 ----------
export function loadAchievements() {
    const saved = storage.loadAchievements();
    if (saved) {
        for (let key in achievements.map) {
            if (saved[key] !== undefined) achievements.map[key].unlocked = saved[key];
        }
        if (saved.gameCount !== undefined) achievements.gameCount = saved.gameCount;
    }
}

export function saveAchievements() {
    const data = {};
    for (let key in achievements.map) data[key] = achievements.map[key].unlocked;
    data.gameCount = achievements.gameCount;
    storage.saveAchievements(data);
}

// 解锁单个成就：成功返回成就对象（供调用方弹提示），已解锁/不存在返回 null
// （不再直接弹 toast —— 表现反馈上移，本模块保持纯逻辑）
export function unlockAchievement(id) {
    const ach = achievements.map[id];
    if (!ach || ach.unlocked) return null;
    ach.unlocked = true;
    achievements.unlockedThisRun.push(id);
    saveAchievements();
    return ach;
}

// 检查并解锁成就；返回本次新解锁的成就对象数组（空数组表示无，调用方据此弹 toast）
export function checkAchievements(data) {
    if (playerProgress.currentVehicle === 'ATC') return [];

    const newlyUnlocked = [];
    const tryUnlock = (id) => {
        const ach = unlockAchievement(id);
        if (ach) newlyUnlocked.push(ach);
    };

    const dev = Math.abs(data.deviation);
    const isPerfectTime = data.stopTime >= ACHIEVEMENT_RULES.TIME_MASTER_MIN && data.stopTime <= ACHIEVEMENT_RULES.TIME_MASTER_MAX;
    achievements.gameCount++;

    if (dev <= ACHIEVEMENT_RULES.PRECISION_DEV) tryUnlock('precision');
    if (data.maxDecel < ACHIEVEMENT_RULES.SMOOTH_MAX_DECEL) tryUnlock('smooth');
    if (isPerfectTime) tryUnlock('time_master');
    // 更精细的“缓解制动”判定：
    // 条件示例：发生释放动作且释放到停稳间隔 <= 3s，释放位置距停靠点 <= 5m，且释放时速度 <= 3 m/s
    if (data.didRelease && data.releaseToStop != null) {
        const dt = data.releaseToStop;
        const relPos = (typeof data.lastReleasePos === 'number') ? Math.abs(data.lastReleasePos - TARGET_HEAD_POS) : null;
        const relSpeed = (typeof data.lastReleaseSpeed === 'number') ? data.lastReleaseSpeed : null;
        if (dt <= ACHIEVEMENT_RULES.RELEASE_MAX_DT && (relPos === null || relPos <= ACHIEVEMENT_RULES.RELEASE_MAX_POS) && (relSpeed === null || relSpeed <= ACHIEVEMENT_RULES.RELEASE_MAX_SPEED)) {
            tryUnlock('release');
        }
    }
    if (data.brakeCount === 1 && data.handleChanges <= ACHIEVEMENT_RULES.ONE_BRAKE_MAX_CHANGES) tryUnlock('one_brake');
    if (achievements.gameCount >= ACHIEVEMENT_RULES.VETERAN_GAMES) tryUnlock('veteran');

    saveAchievements();
    return newlyUnlocked;
}

// ---------- 玩家进度 ----------
export function loadProgress() {
    const saved = storage.loadProgress();
    if (saved) {
        if (saved.unlockedLevels) playerProgress.unlockedLevels = saved.unlockedLevels;
        if (saved.currentLevel !== undefined) playerProgress.currentLevel = saved.currentLevel;
        if (saved.currentVehicle) playerProgress.currentVehicle = saved.currentVehicle;
        if (saved.unlockedVehicles) playerProgress.unlockedVehicles = saved.unlockedVehicles;
        if (saved.levelStars) playerProgress.levelStars = saved.levelStars;
    }
}

export function saveProgress() {
    storage.saveProgress(playerProgress);
}

export function isLevelUnlocked(levelId) {
    return playerProgress.unlockedLevels.includes(levelId);
}

export function isVehicleUnlocked(vehicleId) {
    return playerProgress.unlockedVehicles.includes(vehicleId);
}

export function completeLevel(levelId, score) {
    if (!playerProgress.levelStars[levelId] || playerProgress.levelStars[levelId] < score) {
        playerProgress.levelStars[levelId] = score;
    }
    const level = LEVELS.find(l => l.id === levelId);
    if (level && level.unlockVehicle) {
        const vehicleId = level.unlockVehicle;
        if (VEHICLES[vehicleId] && !isVehicleUnlocked(vehicleId)) {
            playerProgress.unlockedVehicles.push(vehicleId);
        }
    }
    const nextLevel = LEVELS.find(l => l.id === levelId + 1);
    if (nextLevel) {
        const allPrereq = nextLevel.prerequisites.every(id => playerProgress.unlockedLevels.includes(id));
        if (allPrereq && !isLevelUnlocked(nextLevel.id)) {
            playerProgress.unlockedLevels.push(nextLevel.id);
            playerProgress.unlockedLevels.sort((a, b) => a - b);
        }
    }
    saveProgress();
}
