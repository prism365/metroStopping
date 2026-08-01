// 输入模块：键盘/触屏手柄控制、Konami 测试后门（模块加载时自动绑定）
import { LEVELS, VEHICLES, MAX_PLAYER_HANDLE } from './data.js';
import { state, playerProgress, getVehicleParams } from './state.js';
import { saveProgress, isLevelUnlocked, isVehicleUnlocked } from './progress.js';
import { updateUI, showToast, showMainMenu, renderLevelGrid, renderVehicleGrid } from './ui.js';
import { resetFull } from './flow.js';
import { mainMenu, levelView, vehicleView, upBtn, downBtn } from './dom.js';

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

// ---------- 测试后门（Konami）----------
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
