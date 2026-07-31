// 入口模块：输入/事件绑定、测试后门、游戏循环、初始化
import * as storage from './storage.js';
import { LEVELS, VEHICLES, MAX_PLAYER_HANDLE } from './data.js';
import { state, playerProgress, achievements, getVehicleParams } from './state.js';
import { loadProgress, saveProgress, loadAchievements, isLevelUnlocked, isVehicleUnlocked } from './progress.js';
import { physicsUpdate } from './physics.js';
import { drawScene } from './render.js';
import {
    updateUI, showToast, showConfirmDialog, showMainMenu, closeView,
    showLevelView, showVehicleView, showAboutView, showAchievementView,
    renderLevelGrid, renderVehicleGrid,
} from './ui.js';
import { resetFull, startCountdownProcess } from './flow.js';
import {
    mainMenu, levelView, vehicleView, aboutView, achievementView,
    startGameBtn, levelMenuBtn, vehicleMenuBtn, achievementMenuBtn, aboutMenuBtn,
    closeLevelBtn, closeLevelViewBtn, closeVehicleBtn, closeVehicleViewBtn,
    closeAboutBtn, closeAboutViewBtn, closeAchievementBtn, closeAchievementViewBtn,
    resetStorageBtn, resultBtn, upBtn, downBtn, menuReturnBtn, resetBtn, canvas,
} from './dom.js';

// ---------- 手柄控制 ----------
function changeHandle(delta) {
    if (!state.running || state.ended) return;
    const vehicle = getVehicleParams();
    if (vehicle.isATC) return;
    let newTarget = state.targetHandle + delta;
    if (newTarget > MAX_PLAYER_HANDLE) newTarget = MAX_PLAYER_HANDLE;
    if (newTarget < -MAX_PLAYER_HANDLE) newTarget = -MAX_PLAYER_HANDLE;
    state.targetHandle = newTarget;
    if (Math.abs(newTarget - state.handle) > 0.1) {
        state.handleChanges++;
        if (newTarget < 0 && state.handle >= 0) state.brakeCount++;
    }
    updateUI();
}

function resetHandleToZero() {
    if (!state.running || state.ended) return;
    const vehicle = getVehicleParams();
    if (vehicle.isATC) return;
    state.targetHandle = 0;
    updateUI();
}

// ---------- 游戏循环 ----------
let lastTime = 0;

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (state.running && !state.ended) {
        physicsUpdate(dt);
    } else {
        drawScene();
        updateUI();
    }
    requestAnimationFrame(gameLoop);
}

// ---------- 从主菜单开始游戏 ----------
function startGameFromMenu() {
    mainMenu.classList.add('hidden');
    resetFull();
    startCountdownProcess();
}

// ---------- 测试后门 ----------
const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'];
let konamiCode = [];

function checkKonami() {
    if (konamiCode.length === konamiSequence.length) {
        let match = true;
        for (let i = 0; i < konamiSequence.length; i++) {
            if (konamiCode[i] !== konamiSequence[i]) {
                match = false;
                break;
            }
        }
        if (match) {
            const allLevelIds = LEVELS.map(l => l.id);
            allLevelIds.forEach(id => {
                if (!isLevelUnlocked(id)) {
                    playerProgress.unlockedLevels.push(id);
                }
            });
            playerProgress.unlockedLevels.sort((a, b) => a - b);
            for (let key in VEHICLES) {
                if (!isVehicleUnlocked(key)) {
                    playerProgress.unlockedVehicles.push(key);
                }
            }
            saveProgress();
            showToast('🎮 后门已激活，所有内容已解锁！');
            if (!levelView.classList.contains('hidden')) renderLevelGrid();
            if (!vehicleView.classList.contains('hidden')) renderVehicleGrid();
            konamiCode = [];
            return true;
        }
    }
    return false;
}

function pushKonami(key) {
    konamiCode.push(key);
    if (konamiCode.length > konamiSequence.length) {
        konamiCode.shift();
    }
    checkKonami();
}

// 键盘事件（r/m 统一处理）
document.addEventListener('keydown', (e) => {
    const key = e.key;
    if (!mainMenu.classList.contains('hidden') && (key === 'ArrowUp' || key === 'ArrowDown')) {
        pushKonami(key);
    }
    if (state.running && !state.ended) {
        if (key === 'ArrowUp' || key === 'w' || key === 'W') {
            e.preventDefault();
            changeHandle(1);
        } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
            e.preventDefault();
            changeHandle(-1);
        } else if (key === ' ' || key === 'Space') {
            e.preventDefault();
            resetHandleToZero();
        } else if (key === 'r' || key === 'R' || key === 'm' || key === 'M') {
            resetFull();
            showMainMenu();
        }
    } else if (key === 'r' || key === 'R' || key === 'm' || key === 'M') {
        resetFull();
        showMainMenu();
    }
});

// 虚拟按键触发后门
function setupButtonWithKonami(btn, key) {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.running && !state.ended) {
            const vehicle = getVehicleParams();
            if (!vehicle.isATC) {
                const delta = key === 'ArrowUp' ? 1 : -1;
                changeHandle(delta);
            }
        }
        if (!mainMenu.classList.contains('hidden')) {
            pushKonami(key);
        }
    });
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (state.running && !state.ended) {
            const vehicle = getVehicleParams();
            if (!vehicle.isATC) {
                const delta = key === 'ArrowUp' ? 1 : -1;
                changeHandle(delta);
            }
        }
        if (!mainMenu.classList.contains('hidden')) {
            pushKonami(key);
        }
    }, { passive: false });
}

setupButtonWithKonami(upBtn, 'ArrowUp');
setupButtonWithKonami(downBtn, 'ArrowDown');

// ---------- 其他按钮 ----------
startGameBtn.addEventListener('click', startGameFromMenu);
levelMenuBtn.addEventListener('click', showLevelView);
vehicleMenuBtn.addEventListener('click', showVehicleView);
achievementMenuBtn.addEventListener('click', showAchievementView);
aboutMenuBtn.addEventListener('click', showAboutView);

closeLevelBtn.addEventListener('click', () => closeView(levelView));
closeLevelViewBtn.addEventListener('click', () => closeView(levelView));
closeVehicleBtn.addEventListener('click', () => closeView(vehicleView));
closeVehicleViewBtn.addEventListener('click', () => closeView(vehicleView));
closeAboutBtn.addEventListener('click', () => closeView(aboutView));
closeAboutViewBtn.addEventListener('click', () => closeView(aboutView));
closeAchievementBtn.addEventListener('click', () => closeView(achievementView));
closeAchievementViewBtn.addEventListener('click', () => closeView(achievementView));

resetStorageBtn.addEventListener('click', async () => {
    const firstConfirm = await showConfirmDialog('确定要重置存档吗？这将清除所有本地进度和成就。', '确认重置', '确认', '取消');
    if (!firstConfirm) return;
    const secondConfirm = await showConfirmDialog('所有游戏进度将无法恢复！确定要继续？', '再次确认', '确认重置', '取消');
    if (!secondConfirm) return;
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
});

menuReturnBtn.addEventListener('click', () => {
    resetFull();
    showMainMenu();
});

resultBtn.addEventListener('click', () => {
    const currentLevelId = playerProgress.currentLevel;
    const btnText = resultBtn.textContent;

    if (btnText.includes('再玩一次')) {
        state.arcadeZones = null;
        resetFull();
        startCountdownProcess();
        return;
    }

    if (btnText.includes('下一关')) {
        const nextLevel = LEVELS.find(l => l.id === currentLevelId + 1);
        if (nextLevel && isLevelUnlocked(nextLevel.id)) {
            playerProgress.currentLevel = nextLevel.id;
            saveProgress();
        }
        resetFull();
        startCountdownProcess();
        return;
    }

    resetFull();
    startCountdownProcess();
});

resetBtn.addEventListener('click', () => {
    resetFull();
    showMainMenu();
});

// 允许列表滚动（触屏）
document.addEventListener('touchmove', (e) => {
    const target = e.target;
    if (target.closest('.level-grid') || target.closest('.vehicle-grid') || target.closest('.achievement-list')) {
        return;
    }
    if (e.target.closest('.game-container')) {
        e.preventDefault();
    }
}, { passive: false });

// ---------- 初始化 ----------
loadProgress();
loadAchievements();
resetFull();
showMainMenu();
drawScene();
requestAnimationFrame(gameLoop);

canvas.addEventListener('click', () => canvas.focus());
canvas.setAttribute('tabindex', '0');
