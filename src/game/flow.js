// 游戏流程：重置、发车、倒计时、结算与乘客评价
import { LEVELS, BASE_SPEED, SPEED_RANDOM_RANGE, TARGET_HEAD_POS } from './data.js';
import { state, playerProgress, achievements, resetRunFields, getLevelParams, getVehicleParams } from './state.js';
import { Environment } from './environment.js';
import { ATCController } from './atc.js';
import { completeLevel, saveProgress, isLevelUnlocked, checkAchievements } from './progress.js';
import * as storage from './storage.js';
import { drawScene } from './render.js';
import { updateUI, showToast, updateRouteInfo, showMainMenu } from './ui.js';
import { computeResult } from './scoring.js';
import { generatePassengerComment } from './passenger.js';
import { renderResultPanel } from './resultView.js';
import {
    resultOverlay, countdownOverlay, countdownIcon, countdownText, countdownSub,
} from './dom.js';

// ---------- 重置 ----------
export function resetFull() {
    const level = getLevelParams();
    const vehicle = getVehicleParams();
    const initOffset = level.initialOffset || 100;
    const randOffset = (Math.random() - 0.5) * 2 * SPEED_RANDOM_RANGE;
    const initSpeed = Math.min(vehicle.maxSpeed, Math.max(0.1, BASE_SPEED + randOffset));
    state.pos = -initOffset;
    state.speed = initSpeed;
    state.prevSpeed = initSpeed;
    state.running = false;
    state.ended = false;
    state.gameTime = 0;
    state.countdown = 3;
    state.countdownActive = false;
    resetRunFields();
    if (playerProgress.currentLevel === 8) {
        state.arcadeZones = null;
    }
    // 运行期上下文实例：环境 + ATC 控制器（每次运行重建，杜绝状态残留）。
    // 必须在 arcadeZones 置空之后再创建：街机模式随后由 getLevelParams 重新生成随机路况，
    // 保证物理所用环境快照与渲染/路况提示一致。
    const envLevel = getLevelParams();
    state.env = new Environment({ zones: envLevel.zones || [], vehicle });
    state.atc = vehicle.isATC ? new ATCController({ vehicle, targetPos: TARGET_HEAD_POS }) : null;
    resultOverlay.classList.remove('show');
    countdownOverlay.classList.add('hidden');
    updateUI();
    drawScene();
    updateRouteInfo();
}

// ---------- 倒计时 ----------
let countdownInterval = null;

export function startCountdownProcess() {
    if (state.running || state.ended) return;
    if (state.countdownActive) return;
    state.countdownActive = true;
    state.countdown = 3;
    countdownOverlay.classList.remove('hidden');
    countdownIcon.textContent = '🚇';
    countdownText.textContent = '准备';
    countdownSub.textContent = '3';
    updateRouteInfo();
    updateUI();
    drawScene();

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        if (!state.countdownActive) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            return;
        }
        state.countdown -= 1;
        if (state.countdown <= 0) {
            state.countdown = 0;
            clearInterval(countdownInterval);
            countdownInterval = null;
            countdownOverlay.classList.add('hidden');
            beginRun();
        } else {
            countdownSub.textContent = state.countdown;
            updateUI();
            drawScene();
        }
    }, 1000);
}

// ---------- 发车 ----------
function beginRun() {
    state.running = true;
    state.countdownActive = false;
    state.ended = false;
    state.gameTime = 0;
    state.prevSpeed = state.speed;
    resetRunFields();
    resultOverlay.classList.remove('show');
    achievements.unlockedThisRun = [];
    updateUI();
    drawScene();
}

// ---------- 结算 ----------
export function endGame(deviation, reason) {
    if (state.ended) return;
    state.ended = true;
    state.running = false;
    state.deviation = deviation;
    const d = Math.abs(deviation);
    const maxDecel = state.maxDecel || 0;
    const brakeCount = state.brakeCount || 0;
    const handleChanges = state.handleChanges || 0;
    const stopTime = state.timer || 0;
    const didRelease = state.didRelease;
    const releaseToStop = (state.lastReleaseTime != null) ? (state.gameTime - state.lastReleaseTime) : null;

    const vehicle = getVehicleParams();
    const isATC = vehicle.isATC || false;

    // 纯计算：评分 + 乘客评价
    const result = computeResult({ deviation, stopTime, maxDecel, handleChanges, reason });
    const { score, label, icon, detail, isPass } = result;
    const passengerComment = generatePassengerComment(deviation, maxDecel, stopTime, handleChanges, brakeCount, isPass, isATC);

    state.score = score;
    state.resultStatus = { text: isPass ? '✅ 停靠成功' : '❌ 停靠失败', cls: isPass ? 'stopped' : 'fail' };

    // 成就检查（仅手动模式通过时）
    if (!isATC && isPass) {
        checkAchievements({
            deviation: d,
            maxDecel,
            stopTime,
            brakeCount,
            handleChanges,
            didRelease,
            releaseToStop,
            lastReleasePos: state.lastReleasePos,
            lastReleaseSpeed: state.lastReleaseSpeed
        });
    }

    // 关卡推进
    const currentLevelId = playerProgress.currentLevel;
    const alreadyPassed = playerProgress.levelStars[currentLevelId] !== undefined;
    if (isPass && !alreadyPassed) {
        completeLevel(currentLevelId, score);
    } else if (isPass && alreadyPassed) {
        if (playerProgress.levelStars[currentLevelId] < score) {
            playerProgress.levelStars[currentLevelId] = score;
            saveProgress();
        }
    }

    // 渲染结算面板 + 按钮动作
    renderResultPanel({ score, label, icon, detail, isPass, isATC, passengerComment });
    updateUI();
    drawScene();
}

// ---------- 结算按钮动作（基于 state.pendingAction 派发，不再解析按钮文本）----------
export function handleResultAction() {
    const action = state.pendingAction || 'retry';
    if (action === 'next') {
        const nextLevel = LEVELS.find(l => l.id === playerProgress.currentLevel + 1);
        if (nextLevel && isLevelUnlocked(nextLevel.id)) {
            playerProgress.currentLevel = nextLevel.id;
            saveProgress();
        }
    }
    resetFull();
    startCountdownProcess();
}

// ---------- 重置全部存档（重置存档按钮专用）----------
export function resetAllProgress() {
    storage.clearAll();
    playerProgress.unlockedLevels = [0];
    playerProgress.currentLevel = 0;
    playerProgress.currentVehicle = 'STANDARD';
    playerProgress.unlockedVehicles = ['STANDARD'];
    playerProgress.levelStars = {};
    for (let key in achievements.map) {
        achievements.map[key].unlocked = false;
    }
    achievements.gameCount = 0;
    resetFull();
    showMainMenu();
    showToast('🗑️ 存档已重置');
}
