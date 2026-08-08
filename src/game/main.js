// 入口模块：游戏循环、菜单按钮绑定、初始化
// （输入/手柄/Konami 已移至 input.js，重置存档/结算动作已移至 flow.js）
import { state, playerProgress, getVehicleParams } from './state.js';
import { LEVELS, VEHICLES } from './data.js';
import { loadProgress, loadAchievements, saveProgress } from './progress.js';
import { stepGame } from './sim.js';
import { drawScene } from './render.js';
import {
    updateUI, showToast, showConfirmDialog, showMainMenu, closeView, closeSettingsSubview,
    showLevelView, showVehicleView, showSettingsView, showAboutView,
    showVisualSettingsView, showAudioSettingsView, showDevSettingsView, showAchievementView,
    renderLevelGrid, renderVehicleGrid, renderSettingsControls,
} from './ui.js';
import { resetFull, startGame, returnToMenu, resetAllProgress, handleResultAction, endGame } from './flow.js';
import { loadSettings, saveSettings, settings, resetToDefaults } from './settings.js';
import {
    init as initAudio, setProfile as setAudioProfile, update as updateAudio,
    start as startAudio, stop as stopAudio, handleVisibilityChange,
    setSoundEnabled, setPostEnabled, setVolume, setMonitorEnabled,
    __audioDebug,
} from '../audio/audioDriver.js';
import { initMonitor, setMonitorVisible, updateMonitor } from './monitor.js';
import './input.js'; // 输入绑定（键盘/触屏/Konami）
import {
    mainMenu, levelView, vehicleView, settingsView, aboutView, visualSettingsView, audioSettingsView, devSettingsView,
    achievementView,
    startGameBtn, levelMenuBtn, vehicleMenuBtn, achievementMenuBtn, settingsMenuBtn,
    closeLevelBtn, closeLevelViewBtn, closeVehicleBtn, closeVehicleViewBtn,
    closeSettingsBtn, closeSettingsViewBtn,
    closeAboutBtn, closeAboutViewBtn,
    closeVisualSettingsBtn, closeVisualSettingsViewBtn,
    closeAudioSettingsBtn, closeAudioSettingsViewBtn,
    closeDevSettingsBtn, closeDevSettingsViewBtn,
    closeAchievementBtn, closeAchievementViewBtn,
    settingsAboutItem, settingsVisualItem, settingsAudioItem, settingsDevItem,
    restoreDefaultsBtn, resetStorageBtn, resultBtn, menuReturnBtn, resetBtn, canvas,
} from './dom.js';

// ---------- 游戏循环 ----------
let lastTime = 0;
let audioWasRunning = false; // 音频生命周期：游玩态翻转时 start/stop（菜单/结算/后台挂起）

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

    // 音频生命周期：仅游玩时有声；离开游玩态挂起
    const isRunning = state.running && !state.ended;
    if (isRunning !== audioWasRunning) {
        audioWasRunning = isRunning;
        if (isRunning) startAudio(); else stopAudio();
    }
    updateAudio({ speed: state.speed, handle: state.handle, running: isRunning });
    updateMonitor();

    if (state.running) drawScene();
    updateUI();
    requestAnimationFrame(gameLoop);
}

// ---------- 从主菜单开始游戏 ----------
function startGameFromMenu() {
    mainMenu.classList.add('hidden');
    startGame();
    startAudio(); // 按钮点击即手势：尽早 resume，规避 autoplay 策略
}

// ---------- 菜单按钮绑定 ----------
startGameBtn.addEventListener('click', startGameFromMenu);
levelMenuBtn.addEventListener('click', showLevelView);
vehicleMenuBtn.addEventListener('click', showVehicleView);
achievementMenuBtn.addEventListener('click', showAchievementView);
settingsMenuBtn.addEventListener('click', showSettingsView);

// 设置多级菜单：列表 → 子页
settingsAboutItem.addEventListener('click', showAboutView);
settingsVisualItem.addEventListener('click', showVisualSettingsView);
settingsAudioItem.addEventListener('click', showAudioSettingsView);
settingsDevItem.addEventListener('click', showDevSettingsView);

// 关闭按钮（X 与 返回 共用同一动作）：一级视图关闭回主菜单
const closePairs = [
    [closeLevelBtn, closeLevelViewBtn, levelView],
    [closeVehicleBtn, closeVehicleViewBtn, vehicleView],
    [closeSettingsBtn, closeSettingsViewBtn, settingsView],
    [closeAchievementBtn, closeAchievementViewBtn, achievementView],
];
closePairs.forEach(([xBtn, backBtn, view]) => {
    xBtn.addEventListener('click', () => closeView(view));
    backBtn.addEventListener('click', () => closeView(view));
});

// 设置子页关闭（X 与 返回）→ 回设置列表
const subviewPairs = [
    [closeAboutBtn, closeAboutViewBtn, aboutView],
    [closeVisualSettingsBtn, closeVisualSettingsViewBtn, visualSettingsView],
    [closeAudioSettingsBtn, closeAudioSettingsViewBtn, audioSettingsView],
    [closeDevSettingsBtn, closeDevSettingsViewBtn, devSettingsView],
];
subviewPairs.forEach(([xBtn, backBtn, view]) => {
    xBtn.addEventListener('click', () => closeSettingsSubview(view));
    backBtn.addEventListener('click', () => closeSettingsSubview(view));
});

resetStorageBtn.addEventListener('click', async () => {
    const firstConfirm = await showConfirmDialog('确定要重置存档吗？这将清除所有本地进度和成就。', '确认重置', '确认', '取消');
    if (!firstConfirm) return;
    const secondConfirm = await showConfirmDialog('所有游戏进度将无法恢复！确定要继续？', '再次确认', '确认重置', '取消');
    if (!secondConfirm) return;
    resetAllProgress();
});

// 恢复默认设置：单次确认（低风险，不涉及进度数据）→ 重置 + 保存 + 控件刷新 + 应用音频
restoreDefaultsBtn.addEventListener('click', async () => {
    const confirmed = await showConfirmDialog('确定要恢复默认设置吗？将重置所有音频设置。', '恢复默认设置', '确认', '取消');
    if (!confirmed) return;
    resetToDefaults();
    renderSettingsControls();
    setSoundEnabled(settings.soundEnabled);
    setPostEnabled(settings.postEnabled);
    setVolume(settings.volume);
    setMonitorEnabled(settings.vvvfMonitor);
    setMonitorVisible(settings.vvvfMonitor);
    showToast('⚙️ 已恢复默认设置');
});

// 设置项变更（ui.js 上抛意图）→ 持久化 + 应用 audioDriver
// （同选关/选车模式：本入口统一编排，ui 不依赖 audio/flow）
document.addEventListener('settings-changed', (e) => {
    const { key, value } = e.detail;
    settings[key] = value;
    saveSettings();
    if (key === 'soundEnabled') setSoundEnabled(value);
    else if (key === 'postEnabled') setPostEnabled(value);
    else if (key === 'volume') setVolume(value);
    else if (key === 'vvvfMonitor') { setMonitorEnabled(value); setMonitorVisible(value); }
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
    setAudioProfile(VEHICLES[id].vvvf);
    showToast(`🚆 切换至 ${VEHICLES[id].name}`);
    renderVehicleGrid();
    closeView(vehicleView);
});

resultBtn.addEventListener('click', handleResultAction);

// ---------- 初始化 ----------
loadProgress();
loadAchievements();
loadSettings();
resetFull();
showMainMenu();
drawScene();
initAudio();
setAudioProfile(getVehicleParams().vvvf);
// 应用已存设置（audioDriver 未完成 init 时 setter 仅存值，init/rebuild 时生效）
setSoundEnabled(settings.soundEnabled);
setPostEnabled(settings.postEnabled);
setVolume(settings.volume);
setMonitorEnabled(settings.vvvfMonitor);
setMonitorVisible(settings.vvvfMonitor);
initMonitor();
// e2e 调试钩子 + 后台标签页挂起
window.__vvvfAudioDebug = __audioDebug;
document.addEventListener('visibilitychange', () => handleVisibilityChange(document.hidden));
requestAnimationFrame(gameLoop);

canvas.addEventListener('click', () => canvas.focus());
canvas.setAttribute('tabindex', '0');
