// 入口模块：游戏循环、菜单按钮绑定、初始化
// （输入/手柄/Konami 已移至 input.js，重置存档/结算动作已移至 flow.js）
import { state, playerProgress } from './state.js';
import { LEVELS, VEHICLES } from './data.js';
import { loadProgress, loadAchievements, saveProgress } from './progress.js';
import { stepGame } from './sim.js';
import { drawScene } from './render.js';
import {
    updateUI, showToast, showConfirmDialog, showMainMenu, closeView,
    showLevelView, showVehicleView, showAboutView, showAchievementView,
    renderLevelGrid, renderVehicleGrid,
} from './ui.js';
import { resetFull, startGame, returnToMenu, resetAllProgress, handleResultAction, endGame } from './flow.js';
import './input.js'; // 输入绑定（键盘/触屏/Konami）
import {
    mainMenu, levelView, vehicleView, aboutView, achievementView,
    startGameBtn, levelMenuBtn, vehicleMenuBtn, achievementMenuBtn, aboutMenuBtn,
    closeLevelBtn, closeLevelViewBtn, closeVehicleBtn, closeVehicleViewBtn,
    closeAboutBtn, closeAboutViewBtn, closeAchievementBtn, closeAchievementViewBtn,
    resetStorageBtn, resultBtn, menuReturnBtn, resetBtn, canvas,
} from './dom.js';

// ---------- 游戏循环 ----------
let lastTime = 0;

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (state.running && !state.ended) {
        const result = stepGame(dt);
        if (result) {
            if (result.atcActivated) showToast('🤖 ATC自动驾驶已激活');
            if (result.ended) endGame(result.deviation, result.reason);
        }
    }
    
    if (state.running) drawScene();
    updateUI();
    requestAnimationFrame(gameLoop);
}

// ---------- 从主菜单开始游戏 ----------
function startGameFromMenu() {
    mainMenu.classList.add('hidden');
    startGame();
}

// ---------- 菜单按钮绑定 ----------
startGameBtn.addEventListener('click', startGameFromMenu);
levelMenuBtn.addEventListener('click', showLevelView);
vehicleMenuBtn.addEventListener('click', showVehicleView);
achievementMenuBtn.addEventListener('click', showAchievementView);
aboutMenuBtn.addEventListener('click', showAboutView);

// 关闭按钮（X 与 返回 共用同一动作）
const closePairs = [
    [closeLevelBtn, closeLevelViewBtn, levelView],
    [closeVehicleBtn, closeVehicleViewBtn, vehicleView],
    [closeAboutBtn, closeAboutViewBtn, aboutView],
    [closeAchievementBtn, closeAchievementViewBtn, achievementView],
];
closePairs.forEach(([xBtn, backBtn, view]) => {
    xBtn.addEventListener('click', () => closeView(view));
    backBtn.addEventListener('click', () => closeView(view));
});

resetStorageBtn.addEventListener('click', async () => {
    const firstConfirm = await showConfirmDialog('确定要重置存档吗？这将清除所有本地进度和成就。', '确认重置', '确认', '取消');
    if (!firstConfirm) return;
    const secondConfirm = await showConfirmDialog('所有游戏进度将无法恢复！确定要继续？', '再次确认', '确认重置', '取消');
    if (!secondConfirm) return;
    resetAllProgress();
});

menuReturnBtn.addEventListener('click', returnToMenu);

resetBtn.addEventListener('click', returnToMenu);

// ---------- 选关 / 选车（ui.js 上抛事件，本模块统一编排：存档 → 重置 → 提示 → 刷新 → 关视图回菜单）----------
document.addEventListener('level-selected', (e) => {
    const id = e.detail.id;
    playerProgress.currentLevel = id;
    saveProgress();
    resetFull();
    showToast(`🗺️ 切换到 ${LEVELS.find(l => l.id === id).name}`);
    renderLevelGrid();
    closeView(levelView);
});

document.addEventListener('vehicle-selected', (e) => {
    const id = e.detail.id;
    playerProgress.currentVehicle = id;
    saveProgress();
    resetFull();
    showToast(`🚆 切换至 ${VEHICLES[id].name}`);
    renderVehicleGrid();
    closeView(vehicleView);
});

resultBtn.addEventListener('click', handleResultAction);

// ---------- 初始化 ----------
loadProgress();
loadAchievements();
resetFull();
showMainMenu();
drawScene();
requestAnimationFrame(gameLoop);

canvas.addEventListener('click', () => canvas.focus());
canvas.setAttribute('tabindex', '0');
