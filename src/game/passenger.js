// 乘客评价（纯函数，依赖评分指标）
import { SCORING } from './data.js';
import { evaluateStopMetrics } from './scoring.js';

export function generatePassengerComment(deviation, maxDecel, stopTime, handleChanges, brakeCount, isPass, isATC) {
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
