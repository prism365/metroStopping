// 游戏流程：重置、发车、倒计时、结算与乘客评价
import { SCORING, LEVELS, BASE_SPEED, SPEED_RANDOM_RANGE } from './data.js';
import { state, playerProgress, achievements, resetRunFields, getLevelParams, getVehicleParams } from './state.js';
import { completeLevel, saveProgress, isLevelUnlocked, checkAchievements } from './progress.js';
import { drawScene } from './render.js';
import { updateUI, showToast, updateRouteInfo } from './ui.js';
import {
    resultOverlay, countdownOverlay, countdownIcon, countdownText, countdownSub,
    statusBadge, levelDisplay, resultIcon, resultTitle, resultDetail, resultScore,
    resultAchievements, resultBtn,
} from './dom.js';

// 汇总一次停靠的质量指标（结算与乘客评价共用）
function evaluateStopMetrics(maxDecel, stopTime, handleChanges) {
    const S = SCORING;
    return {
        isSmooth: maxDecel < S.SMOOTH_MAX_DECEL && handleChanges <= S.SMOOTH_MAX_CHANGES,
        isHardBrake: maxDecel > S.HARD_BRAKE_DECEL,
        isJerky: handleChanges > S.JERKY_CHANGES && maxDecel > S.JERKY_DECEL,
        isTooSlow: stopTime > S.SLOW_TIME,
        isFast: stopTime < S.FAST_TIME,
        isPerfectTime: stopTime >= S.PERFECT_TIME_MIN && stopTime <= S.PERFECT_TIME_MAX,
    };
}

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
    resultOverlay.classList.remove('show');
    countdownOverlay.classList.add('hidden');
    updateUI();
    drawScene();
    statusBadge.textContent = '⏳ 准备';
    statusBadge.className = 'status-badge ready';
    levelDisplay.textContent = `第${playerProgress.currentLevel + 1}关 · ${level.name}`;
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
    statusBadge.textContent = '🚆 行驶中';
    statusBadge.className = 'status-badge running';
    resultOverlay.classList.remove('show');
    achievements.unlockedThisRun = [];
    updateUI();
    drawScene();
}

// ---------- 乘客评价 ----------
function generatePassengerComment(deviation, maxDecel, stopTime, handleChanges, brakeCount, isPass, isATC) {
    const d = Math.abs(deviation);

    if (!isPass) {
        if (isATC) return 'ATC自动驾驶失误，乘客表示惊讶 😱 ';

        if (deviation >= 10.0 && stopTime < 8.0) return '达速跨站？！😮 ';
        if (deviation >= 10.0) return '师傅，您这是要起飞吗？ 😂 ';

        if (d > 5.0) return '师傅，我要在这里下车吗？😱';
        else if (d > 2.0) return '师傅，您这是开哪儿去了啊？😵';
        else return '师傅，挤不出去啊 😅 ';
    }

    const m = evaluateStopMetrics(maxDecel, stopTime, handleChanges);
    const isPrecise = d <= SCORING.PERFECT_DEV;

    let comment = '';

    if (isATC) {
        comment = 'ATC自动驾驶完美执行，乘客表示很安心 🤖';

    } else if (isPrecise && m.isSmooth && m.isPerfectTime) {
        comment = '优雅，太优雅了！ 👏 ';
    } else if (isPrecise && m.isSmooth) {
        comment = '精准而平稳的停靠！ 😊 ';
    } else if (isPrecise && m.isHardBrake) {
        comment = '到站叫醒服务！ 😂';
    } else if (isPrecise && m.isJerky) {
        comment = '豪意值拉满的停车 🤪 ';
    } else if (isPrecise && m.isTooSlow) {
        comment = '完美主义者 ⏳ ';
    } else if (isPrecise) {
        comment = '先生，您准得像机器一样 🤖 ';

    } else if (d <= 0.6 && m.isSmooth) {
        comment = '一般般 👍  ';
    } else if (d <= 0.6 && m.isHardBrake) {
        comment = '过山车哦，头晕晕哦…… 😵 ';
    } else if (d <= 0.6 && m.isJerky) {
        comment = '手忙脚乱中…… 😬 ';
    } else if (d <= 0.6 && m.isTooSlow) {
        comment = '乘客已经刷完整部剧了 📱 ';
    } else if (d <= 0.6) {
        comment = '寻常的停靠，寻常的生活 🏙️ ';

    } else if (d <= 0.8 && m.isSmooth) {
        comment = '我的行李箱卡住啦 😱 ';
    } else if (d <= 0.8 && m.isHardBrake) {
        comment = '这里可以投诉吗？ 😡 ';
    } else if (d <= 0.8 && m.isTooSlow) {
        comment = '您是在思考人生吗？ 🤔 ';
    } else if (d <= 0.8) {
        comment = '只能说能下车 😅 ';

    } else if (d <= 1.0 && d > 0.8) {
        comment = '极限！这在给乘客练瑜伽？ 🧘 ';
    }

    if (m.isPerfectTime && d <= 0.4) comment += '时间节奏完美，老司机稳如泰山！ ⏱️ ';
    if (m.isFast) comment += ' 闪电进站！ ⚡';
    if (brakeCount > 4 && d <= 0.3) comment += '点刹摇啊摇，摇到外婆桥 😵 ';

    return comment;
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
    const isPass = (reason !== 'overshoot') && (d <= SCORING.PASS_DEV);

    let score, label, icon, detail, passengerComment = '';

    if (reason === 'overshoot') {
        score = 0;
        label = '冲出站台';
        icon = '🚀';
        detail = '列车冲出站台，请重新驾驶！';
        passengerComment = generatePassengerComment(deviation, maxDecel, stopTime, handleChanges, brakeCount, false, isATC);
    } else if (!isPass) {
        const raw = 60 - (d - 1) * 20;
        score = Math.max(0, Math.min(59, Math.floor(raw)));
        label = '停靠失败';
        icon = '❌';
        detail = `偏差 ${d.toFixed(2)} m 超过1m，无法下车！`;
        passengerComment = generatePassengerComment(deviation, maxDecel, stopTime, handleChanges, brakeCount, false, isATC);
    } else {
        let baseScore = 0;
        if (d <= SCORING.PERFECT_DEV) baseScore = SCORING.BASE_PERFECT;
        else if (d <= SCORING.GOOD_DEV) baseScore = SCORING.BASE_GOOD;
        else if (d <= SCORING.FAIR_DEV) baseScore = SCORING.BASE_FAIR;
        else baseScore = SCORING.BASE_PASS;

        const m = evaluateStopMetrics(maxDecel, stopTime, handleChanges);

        let styleBonus = 0;
        if (m.isSmooth && m.isPerfectTime) styleBonus = SCORING.STYLE_BONUS_SMOOTH_PERFECT;
        else if (m.isSmooth) styleBonus = SCORING.STYLE_BONUS_SMOOTH;
        else if (m.isPerfectTime) styleBonus = SCORING.STYLE_BONUS_PERFECT_TIME;
        else if (m.isFast) styleBonus = SCORING.STYLE_BONUS_FAST;
        else if (m.isHardBrake) styleBonus = SCORING.STYLE_BONUS_HARD_BRAKE;
        else if (m.isTooSlow) styleBonus = SCORING.STYLE_BONUS_SLOW;
        else if (m.isJerky) styleBonus = SCORING.STYLE_BONUS_JERKY;

        const totalScore = Math.min(100, Math.max(0, baseScore + styleBonus));
        score = Math.floor(totalScore);

        if (score >= 90) {
            label = '完美停靠';
            icon = '🌟';
        } else if (score >= 75) {
            label = '优秀停靠';
            icon = '👏';
        } else if (score >= 60) {
            label = '良好停靠';
            icon = '😊';
        } else {
            label = '停靠成功';
            icon = '✅';
        }

        detail = `偏差 ${d.toFixed(2)} m · 停靠 ${stopTime.toFixed(1)}s`;
        passengerComment = generatePassengerComment(deviation, maxDecel, stopTime, handleChanges, brakeCount, true, isATC);
    }

    state.score = score;

    resultIcon.textContent = icon;
    resultTitle.textContent = label + '！';
    resultScore.textContent = score;
    resultScore.className = 'result-score' + (score >= 90 ? ' perfect' : (score < 60 ? ' fail' : ''));

    resultDetail.innerHTML = `${detail}<br><span class="result-comment">💬 ${passengerComment}</span>`;

    // 成就检查
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

    let achHtml = '';
    if (achievements.unlockedThisRun.length > 0) {
        achievements.unlockedThisRun.forEach(id => {
            const ach = achievements.map[id];
            if (ach) achHtml += `<span class="result-ach">${ach.icon} ${ach.name}</span>`;
        });
    } else {
        achHtml = `<span class="result-ach-none">${isATC ? '🚫 ATC模式不计成就' : '暂无新成就'}</span>`;
    }
    resultAchievements.innerHTML = achHtml;

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

    if (isPass && score > 0) {
        if (currentLevelId === 8) {
            resultBtn.textContent = '🎮 再玩一次';
        } else {
            const nextLevel = LEVELS.find(l => l.id === currentLevelId + 1);
            if (nextLevel && isLevelUnlocked(nextLevel.id)) {
                resultBtn.textContent = '➡️ 下一关';
            } else {
                resultBtn.textContent = '🔄 重试';
            }
        }
    } else {
        resultBtn.textContent = '🔄 重试';
    }

    resultOverlay.classList.add('show');

    statusBadge.textContent = isPass ? '✅ 停靠成功' : '❌ 停靠失败';
    statusBadge.className = isPass ? 'status-badge stopped' : 'status-badge fail';
    updateUI();
    drawScene();
}
