// UI 更新、导航、弹窗与列表渲染
// 选关/选车仅上抛意图（CustomEvent），业务编排由 main.js 统一处理（本模块不再依赖 flow.js）
import { LEVELS, VEHICLES, DEVIATION_BANDS } from './data.js';
import { state, playerProgress, achievements, getLevelParams } from './state.js';
import { isLevelUnlocked, isVehicleUnlocked } from './progress.js';
import { settings } from './settings.js';
import { ZONE_STYLES } from './render.js';
import { APP_VERSION } from './version.js';
import {
    speedDisplay, deviationDisplay, statusBadge, levelDisplay, handleValue, routeInfo,
    mainMenu, levelView, vehicleView, settingsView, aboutView, visualSettingsView, audioSettingsView,
    achievementView, countdownOverlay, resultOverlay,
    levelGridContainer, vehicleGridContainer, achievementListContainer,
    vvvfSoundToggle, postFxToggle, volumeSlider, volumeValue,
    toast, confirmModal, confirmTitle, confirmMessage, confirmOkBtn, confirmCancelBtn,
} from './dom.js';

// ---------- UI 更新 ----------
// 脏值缓存：仅在值变化时写 DOM（游戏循环每帧调用，减少无谓的 DOM 写入）
let lastSpeedText = null;
let lastDevText = null;
let lastDevCls = null;
let lastHandleText = null;
let lastHandleCls = null;
let lastBadgeText = null;
let lastBadgeCls = null;
let lastLevelText = null;

export function updateUI() {
    const kmh = (state.speed * 3.6);
    const speedText = kmh.toFixed(0);
    if (speedText !== lastSpeedText) {
        speedDisplay.textContent = speedText;
        lastSpeedText = speedText;
    }
    if (state.stats.deviation !== null) {
        const d = Math.abs(state.stats.deviation);
        const devText = d.toFixed(2);
        let cls = 'deviation';
        if (d < DEVIATION_BANDS.perfect) cls += ' perfect';
        else if (d < DEVIATION_BANDS.good) cls += ' good';
        else if (d < DEVIATION_BANDS.fair) cls += ' fair';
        else cls += ' poor';
        const devCls = 'val ' + cls;
        if (devText !== lastDevText) {
            deviationDisplay.textContent = devText;
            lastDevText = devText;
        }
        if (devCls !== lastDevCls) {
            deviationDisplay.className = devCls;
            lastDevCls = devCls;
        }
    } else {
        if (lastDevText !== '--') {
            deviationDisplay.textContent = '--';
            lastDevText = '--';
        }
        if (lastDevCls !== 'val deviation') {
            deviationDisplay.className = 'val deviation';
            lastDevCls = 'val deviation';
        }
    }
    const h = state.handle;
    const handleText = h.toFixed(0);
    let handleCls;
    if (h > 0.1) handleCls = 'handle-value traction';
    else if (h < -0.1) handleCls = 'handle-value brake';
    else handleCls = 'handle-value neutral';
    if (handleText !== lastHandleText) {
        handleValue.textContent = handleText;
        lastHandleText = handleText;
    }
    if (handleCls !== lastHandleCls) {
        handleValue.className = handleCls;
        lastHandleCls = handleCls;
    }

    let badgeText;
    let badgeCls;
    if (state.countdownActive && !state.running) {
        badgeText = '⏳ 准备 ' + (state.countdown > 0 ? state.countdown : 'GO');
        badgeCls = 'status-badge ready';
    } else if (state.running) {
        badgeText = '🚆 行驶中';
        badgeCls = 'status-badge running';
    } else if (state.ended) {
        // 结算结果由 flow.endGame 写入 state.resultStatus（数据驱动，避免重复 DOM 赋值）
        if (state.resultStatus) {
            badgeText = state.resultStatus.text;
            badgeCls = 'status-badge ' + state.resultStatus.cls;
        }
    } else {
        badgeText = '⏸ 待发车';
        badgeCls = 'status-badge';
    }
    // ended 且无 resultStatus 时保持旧徽章（与原逻辑一致：不写 DOM）
    if (badgeText !== undefined && badgeText !== lastBadgeText) {
        statusBadge.textContent = badgeText;
        lastBadgeText = badgeText;
    }
    if (badgeCls !== undefined && badgeCls !== lastBadgeCls) {
        statusBadge.className = badgeCls;
        lastBadgeCls = badgeCls;
    }

    const level = getLevelParams();
    const levelText = `第${playerProgress.currentLevel + 1}关 · ${level.name}`;
    if (levelText !== lastLevelText) {
        levelDisplay.textContent = levelText;
        lastLevelText = levelText;
    }
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
            const style = ZONE_STYLES[z.type];
            if (!style) return '';
            if (z.type === 'gradient') return z.value > 0 ? style.routeUp : style.routeDown;
            return style.route;
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
    settingsView.classList.add('hidden');
    aboutView.classList.add('hidden');
    visualSettingsView.classList.add('hidden');
    audioSettingsView.classList.add('hidden');
    countdownOverlay.classList.add('hidden');
    resultOverlay.classList.remove('show');
}

// 关闭视图回主菜单（设置列表 / 关卡 / 车辆 / 成就 用）
export function closeView(view) {
    view.classList.add('hidden');
    mainMenu.classList.remove('hidden');
}

// 设置子页关闭 → 回设置列表（多级导航）
export function closeSettingsSubview(view) {
    view.classList.add('hidden');
    settingsView.classList.remove('hidden');
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

// 设置列表页（多级菜单一级）
export function showSettingsView() {
    mainMenu.classList.add('hidden');
    aboutView.classList.add('hidden');
    visualSettingsView.classList.add('hidden');
    audioSettingsView.classList.add('hidden');
    settingsView.classList.remove('hidden');
}

// 设置子页（多级菜单二级）
export function showAboutView() {
    mainMenu.classList.add('hidden');
    settingsView.classList.add('hidden');
    aboutView.classList.remove('hidden');
    aboutVersion.textContent = APP_VERSION;
}

export function showVisualSettingsView() {
    mainMenu.classList.add('hidden');
    settingsView.classList.add('hidden');
    visualSettingsView.classList.remove('hidden');
}

export function showAudioSettingsView() {
    mainMenu.classList.add('hidden');
    settingsView.classList.add('hidden');
    audioSettingsView.classList.remove('hidden');
    renderSettingsControls();
}

// 设置控件回填：初值 + 二级开关（音效后处理）随 VVVF 总开关置灰联动
// （导出供 main.js 在「恢复默认设置」后刷新回填）
export function renderSettingsControls() {
    vvvfSoundToggle.checked = settings.soundEnabled;
    postFxToggle.checked = settings.postEnabled;
    postFxToggle.disabled = !settings.soundEnabled;
    volumeSlider.value = settings.volume;
    volumeValue.textContent = settings.volume;
}

// 设置项变更 → 仅上抛意图（main.js 统一编排：持久化 + 应用 audioDriver）
vvvfSoundToggle.addEventListener('change', () => {
    postFxToggle.disabled = !vvvfSoundToggle.checked;
    document.dispatchEvent(new CustomEvent('settings-changed', { detail: { key: 'soundEnabled', value: vvvfSoundToggle.checked } }));
});
postFxToggle.addEventListener('change', () => {
    document.dispatchEvent(new CustomEvent('settings-changed', { detail: { key: 'postEnabled', value: postFxToggle.checked } }));
});
volumeSlider.addEventListener('input', () => {
    volumeValue.textContent = volumeSlider.value;
    document.dispatchEvent(new CustomEvent('settings-changed', { detail: { key: 'volume', value: parseInt(volumeSlider.value, 10) } }));
});

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
                // 仅上抛选关意图，具体编排（存档/重置/提示/关视图）由 main.js 监听执行
                document.dispatchEvent(new CustomEvent('level-selected', { detail: { id } }));
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
                // 仅上抛选车意图，具体编排（存档/重置/提示/关视图）由 main.js 监听执行
                document.dispatchEvent(new CustomEvent('vehicle-selected', { detail: { id } }));
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
