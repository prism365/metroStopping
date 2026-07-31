// 成就与玩家进度逻辑
import { LEVELS, VEHICLES, TARGET_HEAD_POS, ACHIEVEMENT_RULES } from './data.js';
import * as storage from './storage.js';
import { playerProgress, achievements } from './state.js';
// 注：与 ui.js 存在运行期双向引用（本模块调用 showToast/renderLevelGrid，
// ui.js 调用本模块的 isLevelUnlocked 等），均为事件/流程期调用，ESM live binding 安全。
import { showToast, renderLevelGrid } from './ui.js';
import { levelView } from './dom.js';

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

export function unlockAchievement(id) {
    const ach = achievements.map[id];
    if (!ach || ach.unlocked) return false;
    ach.unlocked = true;
    achievements.unlockedThisRun.push(id);
    saveAchievements();
    showToast(`🏆 解锁成就：${ach.icon} ${ach.name}`);
    return true;
}

export function checkAchievements(data) {
    if (playerProgress.currentVehicle === 'ATC') return;

    const dev = Math.abs(data.deviation);
    const isPerfectTime = data.stopTime >= ACHIEVEMENT_RULES.TIME_MASTER_MIN && data.stopTime <= ACHIEVEMENT_RULES.TIME_MASTER_MAX;
    achievements.gameCount++;

    if (dev <= ACHIEVEMENT_RULES.PRECISION_DEV) unlockAchievement('precision');
    if (data.maxDecel < ACHIEVEMENT_RULES.SMOOTH_MAX_DECEL) unlockAchievement('smooth');
    if (isPerfectTime) unlockAchievement('time_master');
    // 更精细的“缓解制动”判定：
    // 条件示例：发生释放动作且释放到停稳间隔 <= 3s，释放位置距停靠点 <= 5m，且释放时速度 <= 3 m/s
    if (data.didRelease && data.releaseToStop != null) {
        const dt = data.releaseToStop;
        const relPos = (typeof data.lastReleasePos === 'number') ? Math.abs(data.lastReleasePos - TARGET_HEAD_POS) : null;
        const relSpeed = (typeof data.lastReleaseSpeed === 'number') ? data.lastReleaseSpeed : null;
        if (dt <= ACHIEVEMENT_RULES.RELEASE_MAX_DT && (relPos === null || relPos <= ACHIEVEMENT_RULES.RELEASE_MAX_POS) && (relSpeed === null || relSpeed <= ACHIEVEMENT_RULES.RELEASE_MAX_SPEED)) {
            unlockAchievement('release');
        }
    }
    if (data.brakeCount === 1 && data.handleChanges <= ACHIEVEMENT_RULES.ONE_BRAKE_MAX_CHANGES) unlockAchievement('one_brake');
    if (achievements.gameCount >= ACHIEVEMENT_RULES.VETERAN_GAMES) unlockAchievement('veteran');

    saveAchievements();
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
    if (!levelView.classList.contains('hidden')) {
        renderLevelGrid();
    }
}
