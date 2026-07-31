// UI 更新、导航、弹窗与列表渲染
import { LEVELS, VEHICLES } from './data.js';
import { state, playerProgress, achievements, getLevelParams, getVehicleParams } from './state.js';
import { isLevelUnlocked, isVehicleUnlocked, saveProgress } from './progress.js';
// 注：与 flow.js / progress.js 存在运行期双向引用（本模块调用 resetFull，
// flow.js 调用本模块的 updateUI/showToast 等，progress.js 调用 showToast/renderLevelGrid），
// 均为事件/流程期调用，ESM live binding 安全。
import { resetFull } from './flow.js';
import {
    speedDisplay, deviationDisplay, statusBadge, levelDisplay, handleValue, routeInfo,
    mainMenu, levelView, vehicleView, aboutView, achievementView, countdownOverlay, resultOverlay,
    levelGridContainer, vehicleGridContainer, achievementListContainer,
    toast, confirmModal, confirmTitle, confirmMessage, confirmOkBtn, confirmCancelBtn,
} from './dom.js';

// ---------- UI 更新 ----------
export function updateUI() {
    const kmh = (state.speed * 3.6);
    speedDisplay.textContent = kmh.toFixed(0);
    if (state.deviation !== null) {
        const d = Math.abs(state.deviation);
        deviationDisplay.textContent = d.toFixed(2);
        let cls = 'deviation';
        if (d < 0.2) cls += ' perfect';
        else if (d < 0.6) cls += ' good';
        else if (d < 1.2) cls += ' fair';
        else cls += ' poor';
        deviationDisplay.className = 'val ' + cls;
    } else {
        deviationDisplay.textContent = '--';
        deviationDisplay.className = 'val deviation';
    }
    const h = state.handle;
    handleValue.textContent = h.toFixed(0);
    if (h > 0.1) handleValue.className = 'handle-value traction';
    else if (h < -0.1) handleValue.className = 'handle-value brake';
    else handleValue.className = 'handle-value neutral';

    if (state.countdownActive && !state.running) {
        statusBadge.textContent = '⏳ 准备 ' + (state.countdown > 0 ? state.countdown : 'GO');
        statusBadge.className = 'status-badge ready';
    } else if (state.running) {
        statusBadge.textContent = '🚆 行驶中';
        statusBadge.className = 'status-badge running';
    } else if (state.ended) {
        // handled
    } else {
        statusBadge.textContent = '⏸ 待发车';
        statusBadge.className = 'status-badge';
    }
    const level = getLevelParams();
    levelDisplay.textContent = `第${playerProgress.currentLevel + 1}关 · ${level.name}`;
}

// ---------- 路况信息 ----------
export function updateRouteInfo() {
    const level = getLevelParams();
    const zones = level.zones || [];
    let info = '';
    if (zones.length === 0) {
        info = '🏙️ 平地';
    } else {
        const types = zones.map(z => {
            if (z.type === 'gradient') return z.value > 0 ? '⬆上坡' : '⬇下坡';
            if (z.type === 'water') return '💧积水';
            if (z.type === 'wind') return '💨大风';
            return '';
        });
        info = types.join(' · ');
    }
    routeInfo.textContent = '🚧 路况：' + info;
}

// ---------- Toast ----------
let toastTimeout = null;

export function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// ---------- 确认弹窗 ----------
let pendingConfirmResolver = null;

export function showConfirmDialog(message, title = '确认操作', confirmText = '确认', cancelText = '取消') {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmText;
    confirmCancelBtn.textContent = cancelText;
    confirmModal.classList.remove('hidden');
    return new Promise(resolve => {
        pendingConfirmResolver = resolve;
    });
}

function closeConfirmDialog(result) {
    confirmModal.classList.add('hidden');
    if (pendingConfirmResolver) {
        pendingConfirmResolver(result);
        pendingConfirmResolver = null;
    }
}

confirmCancelBtn.addEventListener('click', () => closeConfirmDialog(false));
confirmOkBtn.addEventListener('click', () => closeConfirmDialog(true));

// ---------- UI 导航 ----------
export function showMainMenu() {
    mainMenu.classList.remove('hidden');
    levelView.classList.add('hidden');
    vehicleView.classList.add('hidden');
    achievementView.classList.add('hidden');
    aboutView.classList.add('hidden');
    countdownOverlay.classList.add('hidden');
    resultOverlay.classList.remove('show');
}

export function closeView(view) {
    view.classList.add('hidden');
    mainMenu.classList.remove('hidden');
}

export function showLevelView() {
    mainMenu.classList.add('hidden');
    levelView.classList.remove('hidden');
    renderLevelGrid();
}

export function showVehicleView() {
    mainMenu.classList.add('hidden');
    vehicleView.classList.remove('hidden');
    renderVehicleGrid();
}

export function showAboutView() {
    mainMenu.classList.add('hidden');
    aboutView.classList.remove('hidden');
}

export function showAchievementView() {
    mainMenu.classList.add('hidden');
    achievementView.classList.remove('hidden');
    renderAchievementList();
}

// ---------- 列表渲染 ----------
export function renderLevelGrid() {
    let html = '';
    LEVELS.forEach(level => {
        const unlocked = isLevelUnlocked(level.id);
        const isCurrent = level.id === playerProgress.currentLevel;
        const stars = playerProgress.levelStars[level.id] || 0;
        const starStr = stars >= 90 ? '⭐' : stars >= 70 ? '🌟' : '';
        const cls = unlocked ? 'level-card unlocked' : 'level-card locked';
        html += `
            <div class="${cls}" data-level="${level.id}">
                <div class="lv-icon">${level.icon}</div>
                <div class="lv-name">${level.name}</div>
                <div class="lv-desc">${level.desc}</div>
                <div class="lv-status">${unlocked ? (isCurrent ? '🟢 当前' : starStr || '✅') : '🔒 未解锁'}</div>
            </div>
        `;
    });
    levelGridContainer.innerHTML = html;

    levelGridContainer.querySelectorAll('.level-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.level);
            if (isLevelUnlocked(id)) {
                playerProgress.currentLevel = id;
                saveProgress();
                resetFull();
                showToast(`🗺️ 切换到 ${LEVELS.find(l => l.id === id).name}`);
                renderLevelGrid();
                levelView.classList.add('hidden');
                mainMenu.classList.remove('hidden');
            }
        });
    });
}

export function renderVehicleGrid() {
    let html = '';
    for (let key in VEHICLES) {
        const veh = VEHICLES[key];
        const unlocked = isVehicleUnlocked(key);
        const cls = unlocked ? 'vehicle-card unlocked' : 'vehicle-card locked';
        const isCurrent = key === playerProgress.currentVehicle;
        const unlockText = veh.unlockText || '默认解锁';

        html += `
            <div class="${cls}" data-vehicle="${key}">
                <div class="v-icon">${veh.icon}</div>
                <div class="v-name">${veh.name} ${isCurrent ? '🟢' : ''}</div>
                <div class="v-desc">${veh.desc}<br><span style="color:#7fc8ff;font-size:10px;">${unlockText}</span></div>
                <div class="v-status">${unlocked ? '✅ 已解锁' : '🔒 未解锁'}</div>
            </div>
        `;
    }
    vehicleGridContainer.innerHTML = html;

    vehicleGridContainer.querySelectorAll('.vehicle-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.vehicle;
            if (isVehicleUnlocked(id)) {
                playerProgress.currentVehicle = id;
                saveProgress();
                resetFull();
                showToast(`🚆 切换至 ${VEHICLES[id].name}`);
                renderVehicleGrid();
                vehicleView.classList.add('hidden');
                mainMenu.classList.remove('hidden');
            }
        });
    });
}

export function renderAchievementList() {
    let html = '';
    for (let key in achievements.map) {
        const ach = achievements.map[key];
        const cls = ach.unlocked ? 'achievement-item unlocked' : 'achievement-item';
        html += `
            <div class="${cls}">
                <span class="ach-icon">${ach.icon}</span>
                <span class="ach-name">${ach.name}</span>
                <span class="ach-desc">${ach.unlocked ? '✅' : ach.desc}</span>
            </div>
        `;
    }
    achievementListContainer.innerHTML = html;
}
