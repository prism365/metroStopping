// 结算面板渲染（DOM 写入 + 结果按钮状态）
import { LEVELS } from './data.js';
import { state, playerProgress, achievements } from './state.js';
import { isLevelUnlocked } from './progress.js';
import {
    resultOverlay, resultIcon, resultTitle, resultScore, resultDetail,
    resultAchievements, resultBtn,
} from './dom.js';

export function renderResultPanel({ score, label, icon, detail, isPass, isATC, passengerComment }) {
    resultIcon.textContent = icon;
    resultTitle.textContent = label + '！';
    resultScore.textContent = score;
    resultScore.className = 'result-score' + (score >= 90 ? ' perfect' : (score < 60 ? ' fail' : ''));

    resultDetail.innerHTML = `${detail}<br><span class="result-comment">💬 ${passengerComment}</span>`;

    // 成就展示
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

    // 按钮文案与下次动作（由 state.pendingAction 驱动，不再解析按钮文本）
    let action = 'retry';
    if (isPass && score > 0) {
        if (playerProgress.currentLevel === 8) {
            resultBtn.textContent = '🎮 再玩一次';
            action = 'replay';
        } else {
            const nextLevel = LEVELS.find(l => l.id === playerProgress.currentLevel + 1);
            if (nextLevel && isLevelUnlocked(nextLevel.id)) {
                resultBtn.textContent = '➡️ 下一关';
                action = 'next';
            } else {
                resultBtn.textContent = '🔄 重试';
            }
        }
    } else {
        resultBtn.textContent = '🔄 重试';
    }
    state.pendingAction = action;

    resultOverlay.classList.add('show');
}
