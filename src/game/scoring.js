// 评分与结算结果计算（纯函数，无 DOM 依赖）
import { SCORING } from './data.js';

// 汇总一次停靠的质量指标（结算与乘客评价共用）
export function evaluateStopMetrics(maxDecel, stopTime, handleChanges) {
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

// 结算核心：由停靠指标计算 分数 / 文案 / 图标 / 是否合格（纯函数）
export function computeResult({ deviation, stopTime, maxDecel, handleChanges, reason }) {
    const d = Math.abs(deviation);
    const isPass = (reason !== 'overshoot') && (d <= SCORING.PASS_DEV);
    const m = evaluateStopMetrics(maxDecel, stopTime, handleChanges);

    let score, label, icon, detail;

    if (reason === 'overshoot') {
        score = 0;
        label = '冲出站台';
        icon = '🚀';
        detail = '列车冲出站台，请重新驾驶！';
    } else if (!isPass) {
        const raw = 60 - (d - 1) * 20;
        score = Math.max(0, Math.min(59, Math.floor(raw)));
        label = '停靠失败';
        icon = '❌';
        detail = `偏差 ${d.toFixed(2)} m 超过1m，无法下车！`;
    } else {
        let baseScore = 0;
        if (d <= SCORING.PERFECT_DEV) baseScore = SCORING.BASE_PERFECT;
        else if (d <= SCORING.GOOD_DEV) baseScore = SCORING.BASE_GOOD;
        else if (d <= SCORING.FAIR_DEV) baseScore = SCORING.BASE_FAIR;
        else baseScore = SCORING.BASE_PASS;

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
    }

    return { score, label, icon, detail, isPass };
}
