// tests/e2e/vvvf.spec.js — VVVF 声效生命周期（需求 R6）
// 约定：仅在游玩时有声；菜单/结算/后台标签页挂起；ATC 也有声（非静音）。
// 非静音验证：页面内 OfflineAudioContext 加载 worklet 渲染确定性 PCM，统计非零采样数。
import { test, expect } from '@playwright/test';
import {
    attachErrorCapture, expectNoErrors, startGame, waitForCountdownDone, pressKonami, selectVehicle,
} from './helpers.js';

async function openApp(page) {
    const errors = attachErrorCapture(page);
    await page.goto('/');
    await expect(page.locator('#mainMenu')).toBeVisible();
    return errors;
}

// 测试用 profile：含 syncStages（分级变频），freq=45Hz 落在 N=9 同步段 → 非静音
const TEST_PROFILE = {
    freqScale: 4.5, slipByHandle: 0.6,
    async: { base: 2000, randomRange: 0, randomInterval: 0 },
    syncStages: [
        { fFrom: 25, n: 15, mFrom: 0.4, mTo: 0.6 },
        { fFrom: 45, n: 9, mFrom: 0.6, mTo: 0.8 },
        { fFrom: 75, n: 6, mFrom: 0.8, mTo: 0.95 },
        { fFrom: 112, n: 3, mFrom: 0.95, mTo: 1.0 },
    ],
    squareFreq: 157, mMin: 0.2, hysteresis: 3,
};

// 页面内用 OfflineAudioContext 渲染 worklet，返回非零采样数
async function renderNonSilentSamples(page, profile) {
    return page.evaluate(async (profile) => {
        const SR = 48000;
        const len = 24000; // 0.5s
        const oc = new OfflineAudioContext(1, len, SR);
        await oc.audioWorklet.addModule('/src/audio/vvvfWorklet.js');
        const node = new AudioWorkletNode(oc, 'vvvf-sound');
        // 等处理器确认收到配置（规避 OfflineAudioContext 的消息投递竞态）
        const ready = new Promise((resolve) => { node.port.onmessage = () => resolve(); });
        node.port.postMessage({ profile, seed: 1 });
        node.port.postMessage({ freq: 45, excitation: 1 });   // 45Hz → N=9 同步段
        await ready;
        node.connect(oc.destination);
        const buf = await oc.startRendering();
        const ch = buf.getChannelData(0);
        let nz = 0;
        for (let i = 0; i < ch.length; i++) if (ch[i] !== 0) nz++;
        return nz;
    }, profile);
}

test('vvvf1 主菜单：音频上下文挂起（无声）', async ({ page }) => {
    const errors = await openApp(page);
    await page.waitForFunction(() => window.__vvvfAudioDebug().contextState !== 'none'); // 等待音频初始化完成
    const dbg = await page.evaluate(() => window.__vvvfAudioDebug());
    expect(dbg.audioActive).toBe(false);
    expect(dbg.contextState).toBe('suspended');
    expectNoErrors(errors);
});

test('vvvf2 游玩中：音频激活且 worklet 输出非静音', async ({ page }) => {
    const errors = await openApp(page);
    await startGame(page);
    await waitForCountdownDone(page);
    await expect(page.locator('#statusBadge')).toContainText('行驶中');
    const dbg = await page.evaluate(() => window.__vvvfAudioDebug());
    expect(dbg.audioActive).toBe(true);
    expect(dbg.hasStages).toBe(true);
    const nz = await renderNonSilentSamples(page, TEST_PROFILE);
    expect(nz).toBeGreaterThan(0);
    expectNoErrors(errors);
});

test('vvvf3 离开游玩态（返回菜单）：音频挂起', async ({ page }) => {
    const errors = await openApp(page);
    await startGame(page);
    await waitForCountdownDone(page);
    await expect(page.locator('#statusBadge')).toContainText('行驶中');
    await page.keyboard.press('r'); // 返回主菜单（running=false → 挂起）
    await expect(page.locator('#mainMenu')).toBeVisible();
    // 音频挂起由 gameLoop 下一帧驱动（异步），轮询等待状态翻转
    await page.waitForFunction(() => {
        const d = window.__vvvfAudioDebug();
        return d.audioActive === false && d.contextState === 'suspended';
    });
    expectNoErrors(errors);
});

test('vvvf4 ATC 也有声（非静音）', async ({ page }) => {
    const errors = await openApp(page);
    await pressKonami(page); // 解锁 ATC
    await selectVehicle(page, 'ATC');
    await startGame(page);
    await waitForCountdownDone(page);
    await expect(page.locator('#statusBadge')).toContainText('行驶中');
    const nz = await renderNonSilentSamples(page, { ...TEST_PROFILE, async: { base: 1500, randomRange: 20, randomInterval: 0.15 } });
    expect(nz).toBeGreaterThan(0);
    expectNoErrors(errors);
});

test('vvvf5 后台标签页：挂起，回前台恢复', async ({ page }) => {
    const errors = await openApp(page);
    await startGame(page);
    await waitForCountdownDone(page);
    await expect(page.locator('#statusBadge')).toContainText('行驶中');
    // 模拟隐藏
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    let dbg = await page.evaluate(() => window.__vvvfAudioDebug());
    expect(dbg.contextState).toBe('suspended');
    // 恢复前台
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => window.__vvvfAudioDebug().contextState === 'running');
    dbg = await page.evaluate(() => window.__vvvfAudioDebug());
    expect(dbg.audioActive).toBe(true);
    expectNoErrors(errors);
});

test('vvvf6 波形监视：开启后 worklet 回传波形且面板可见', async ({ page }) => {
    const errors = await openApp(page);
    // 开发人员选项 → 开启 VVVF 波形监视
    await page.click('#settingsMenuBtn');
    await page.click('#settingsDevItem');
    await expect(page.locator('#vvvfMonitorToggle')).not.toBeChecked();
    await page.locator('#vvvfMonitorToggle').check();
    await page.click('#closeDevSettingsViewBtn');
    await page.click('#closeSettingsViewBtn');
    // 开局（游戏进行中音频上下文 running，worklet 回传波形）
    await startGame(page);
    await waitForCountdownDone(page);
    await expect(page.locator('#statusBadge')).toContainText('行驶中');
    // worklet 回传链路端到端：latestWaveLen > 0
    await page.waitForFunction(() => window.__vvvfAudioDebug().latestWaveLen > 0);
    const dbg = await page.evaluate(() => window.__vvvfAudioDebug());
    expect(dbg.monitorEnabled).toBe(true);
    expect(dbg.latestWaveLen).toBe(512);
    // 监视面板可见
    await expect(page.locator('#vvvfMonitor')).toBeVisible();
    expectNoErrors(errors);
});
