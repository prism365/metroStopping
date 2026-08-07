// tests/e2e/smoke.spec.js — Playwright 冒烟测试
// 固化 test-flow.md「浏览器手动回归用例清单」：
// 开局 / 选关选车 / 返回重置 / 重置存档 / 结算 / ATC / 偏差分级 / Konami / Console 无报错
// 运行：npm run test:e2e（webServer 自动起 scripts/serve.py 8000）
import { test, expect } from '@playwright/test';
import {
    attachErrorCapture, expectNoErrors, expectToast, expectHidden,
    startGame, waitForCountdownDone, pressKonami, selectLevel, selectVehicle,
} from './helpers.js';

// 打开应用并挂载错误捕获（须在 goto 之前挂监听，才能抓到模块加载期错误）
async function openApp(page) {
    const errors = attachErrorCapture(page);
    await page.goto('/');
    await expect(page.locator('#mainMenu')).toBeVisible();
    return errors;
}

// ---------- 1. 页面启动 ----------
test('冒烟1 页面启动：主菜单可见 + canvas 存在 + 无控制台报错', async ({ page }) => {
    const errors = await openApp(page);
    await expect(page).toHaveTitle(/地铁停靠/);
    await expect(page.locator('#gameCanvas')).toBeVisible();
    expectNoErrors(errors);
});

// ---------- 2. 开局发车 ----------
test('冒烟2 开局发车：倒计时递减后进入行驶', async ({ page }) => {
    const errors = await openApp(page);
    await page.click('#startGameBtn');
    await expectHidden(page, '#mainMenu');
    await expect(page.locator('#countdownOverlay')).toBeVisible();
    // 倒计时数字从 3 递减（观察到 ≠ 3 即覆盖 3→2→1 的变化链路）
    await page.waitForFunction(
        () => {
            const t = document.querySelector('#countdownSub');
            return !!t && t.textContent !== '3';
        },
        undefined,
        { timeout: 5_000 },
    );
    await waitForCountdownDone(page);
    await expect(page.locator('#statusBadge')).toContainText('行驶中');
    expectNoErrors(errors);
});

// ---------- 3. 手动驾驶 ----------
test('冒烟3 手动驾驶：升档牵引 → 速度上升 → 复位归零', async ({ page }) => {
    const errors = await openApp(page);
    await startGame(page);
    await waitForCountdownDone(page);
    const speedBefore = parseInt(await page.locator('#speedDisplay').textContent());
    // 手柄为档位式（每次按 ↑ 升一档，无 keyup 处理），复位用 Space
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');          // 升到 2 档，避开 1 档平衡速度死区
    await expect(page.locator('#handleValue')).toHaveClass(/traction/, { timeout: 5_000 });
    // 牵引生效后速度应上升（2 档平衡速度 ~73km/h > 随机初速上限 64km/h）
    await page.waitForFunction(
        (prev) => parseInt(document.querySelector('#speedDisplay').textContent) > prev + 3,
        speedBefore,
        { timeout: 8_000 },
    );
    await page.keyboard.press('Space');
    await expect(page.locator('#handleValue')).toHaveClass(/neutral/, { timeout: 5_000 });
    expectNoErrors(errors);
});

// ---------- 4. 选关 / 选车 ----------
test('冒烟4 选关/选车：卡片点击 → toast + 关视图回主菜单', async ({ page }) => {
    const errors = await openApp(page);
    await selectLevel(page, 0);
    await expectToast(page, '切换到');
    await expectHidden(page, '#levelView');
    await expect(page.locator('#mainMenu')).toBeVisible();

    await selectVehicle(page, 'STANDARD');
    await expectToast(page, '切换至');
    await expectHidden(page, '#vehicleView');
    await expect(page.locator('#mainMenu')).toBeVisible();
    expectNoErrors(errors);
});

// ---------- 5. 返回 / 重置 ----------
test('冒烟5 返回/重置：🏠 与 ⟳ 按钮回主菜单', async ({ page }) => {
    const errors = await openApp(page);
    await startGame(page);
    await waitForCountdownDone(page);
    await page.click('#menuReturnBtn');
    await expect(page.locator('#mainMenu')).toBeVisible();

    await startGame(page);
    await waitForCountdownDone(page);
    await page.click('#resetBtn');
    await expect(page.locator('#mainMenu')).toBeVisible();
    expectNoErrors(errors);
});

// ---------- 6. 重置存档（双确认）----------
test('冒烟6 重置存档：双确认 → 清空进度/成就，保留设置', async ({ page }) => {
    const errors = await openApp(page);
    // 先制造存档（Konami 解锁会写入 localStorage）
    await pressKonami(page);
    await expectToast(page, '后门已激活');
    const hasData = await page.evaluate(() => localStorage.getItem('trainProgress') !== null);
    expect(hasData).toBe(true);

    // 先改一项设置（音频子页），验证重置存档不清设置（存档与设置解耦）
    await page.click('#settingsMenuBtn');
    await expect(page.locator('#settingsView')).toBeVisible();
    await page.click('#settingsAudioItem');
    await expect(page.locator('#audioSettingsView')).toBeVisible();
    await page.locator('#volumeSlider').fill('20');
    await expect(page.locator('#volumeValue')).toHaveText('20');
    await page.click('#closeAudioSettingsViewBtn');
    await expect(page.locator('#settingsView')).toBeVisible();

    // 设置列表（底部数据管理）→ 重置存档 → 两次确认
    await page.click('#resetStorageBtn');
    await expect(page.locator('#confirmModal')).toBeVisible();
    await page.click('#confirmOkBtn');
    await expect(page.locator('#confirmModal')).toBeVisible();
    await page.click('#confirmOkBtn');
    await expectToast(page, '存档已重置');

    const cleared = await page.evaluate(
        () => localStorage.getItem('trainProgress') === null
            && localStorage.getItem('trainAchievements') === null
            && localStorage.getItem('trainSettings') !== null, // 设置与存档解耦，保留
    );
    expect(cleared).toBe(true);
    expectNoErrors(errors);
});

// ---------- 7. ATC 激活 ----------
test('冒烟7 ATC 激活：后门解锁 → 选 ATC 车 → 自动激活提示', async ({ page }) => {
    const errors = await openApp(page);
    await pressKonami(page);
    await expectToast(page, '后门已激活');
    // 提前挂 toast 轮询，避免错过 3 秒显示窗口
    const atcToast = page.waitForFunction(
        () => {
            const el = document.querySelector('#toast');
            return !!el && el.classList.contains('show') && el.textContent.includes('ATC自动驾驶已激活');
        },
        undefined,
        { timeout: 15_000 },
    );
    await selectVehicle(page, 'ATC');
    await startGame(page);
    await waitForCountdownDone(page);
    await atcToast;
    expectNoErrors(errors);
});

// ---------- 8. 结算成功（ATC 确定性停靠）----------
test('冒烟8 结算成功：ATC 自动停靠 → 结算面板 + 偏差分级徽章', async ({ page }) => {
    const errors = await openApp(page);
    await pressKonami(page);
    await expectToast(page, '后门已激活');
    await selectVehicle(page, 'ATC');
    await startGame(page);
    // ATC 自动停靠（物理确定性已由 verify-physics 保证），等结算面板出现
    await expect(page.locator('#resultOverlay')).toHaveClass(/show/, { timeout: 60_000 });
    await expect(page.locator('#statusBadge')).toContainText('✅ 停靠成功');
    await expect(page.locator('#deviationDisplay')).toHaveClass(/perfect|good|fair|poor/);
    await expect(page.locator('#resultBtn')).toBeVisible();
    expectNoErrors(errors);
});

// ---------- 9. 冲标失败 ----------
test('冒烟9 冲标：持续牵引冲出站台 → 失败结算', async ({ page }) => {
    const errors = await openApp(page);
    await startGame(page);
    await waitForCountdownDone(page);
    await page.keyboard.down('ArrowUp');
    await expect(page.locator('#resultOverlay')).toHaveClass(/show/, { timeout: 40_000 });
    await page.keyboard.up('ArrowUp');
    await expect(page.locator('#statusBadge')).toContainText('❌ 停靠失败');
    await expect(page.locator('#resultTitle')).toContainText('冲出站台');
    expectNoErrors(errors);
});

// ---------- 10. 设置多级菜单 ----------
test('冒烟10 设置多级：列表→各子页导航 → VVVF 联动 → 音量 → 刷新持久化', async ({ page }) => {
    const errors = await openApp(page);
    // 设置列表页：三个子页入口可见
    await page.click('#settingsMenuBtn');
    await expect(page.locator('#settingsView')).toBeVisible();
    await expect(page.locator('#settingsAboutItem')).toBeVisible();
    await expect(page.locator('#settingsVisualItem')).toBeVisible();
    await expect(page.locator('#settingsAudioItem')).toBeVisible();

    // 关于子页 → 返回列表
    await page.click('#settingsAboutItem');
    await expect(page.locator('#aboutView')).toBeVisible();
    await page.click('#closeAboutViewBtn');
    await expect(page.locator('#settingsView')).toBeVisible();

    // 画面子页 → 返回列表
    await page.click('#settingsVisualItem');
    await expect(page.locator('#visualSettingsView')).toBeVisible();
    await page.click('#closeVisualSettingsViewBtn');
    await expect(page.locator('#settingsView')).toBeVisible();

    // 音频子页：默认 VVVF 开、后处理可用、音量 70
    await page.click('#settingsAudioItem');
    await expect(page.locator('#audioSettingsView')).toBeVisible();
    await expect(page.locator('#vvvfSoundToggle')).toBeChecked();
    await expect(page.locator('#postFxToggle')).toBeChecked();
    await expect(page.locator('#postFxToggle')).toBeEnabled();
    await expect(page.locator('#volumeValue')).toHaveText('70');

    // 关 VVVF → 后处理二级开关置灰
    await page.locator('#vvvfSoundToggle').uncheck();
    await expect(page.locator('#postFxToggle')).toBeDisabled();

    // 拖音量 → 数值联动
    await page.locator('#volumeSlider').fill('30');
    await expect(page.locator('#volumeValue')).toHaveText('30');

    // 刷新后持久化（trainSettings 已写入）→ 重新进入音频子页验证
    await page.reload();
    await expect(page.locator('#mainMenu')).toBeVisible();
    await page.click('#settingsMenuBtn');
    await page.click('#settingsAudioItem');
    await expect(page.locator('#vvvfSoundToggle')).not.toBeChecked();
    await expect(page.locator('#postFxToggle')).toBeDisabled();
    await expect(page.locator('#volumeValue')).toHaveText('30');
    expectNoErrors(errors);
});

// ---------- 11. 恢复默认设置 ----------
test('冒烟11 恢复默认设置：改设置 → 恢复默认 → 键移除且控件回默认 → 刷新仍默认', async ({ page }) => {
    const errors = await openApp(page);
    // 先改设置并写入（音频子页）
    await page.click('#settingsMenuBtn');
    await page.click('#settingsAudioItem');
    await page.locator('#vvvfSoundToggle').uncheck();
    await page.locator('#volumeSlider').fill('15');
    const hasSettings = await page.evaluate(() => localStorage.getItem('trainSettings') !== null);
    expect(hasSettings).toBe(true);

    // 回设置列表 → 底部数据管理 → 恢复默认设置：单次确认
    await page.click('#closeAudioSettingsViewBtn');
    await expect(page.locator('#settingsView')).toBeVisible();
    await page.click('#restoreDefaultsBtn');
    await expect(page.locator('#confirmModal')).toBeVisible();
    await page.click('#confirmOkBtn');
    await expectToast(page, '已恢复默认设置');

    // 键被移除
    const removed = await page.evaluate(() => localStorage.getItem('trainSettings') === null);
    expect(removed).toBe(true);

    // 回音频子页：控件回默认
    await page.click('#settingsAudioItem');
    await expect(page.locator('#vvvfSoundToggle')).toBeChecked();
    await expect(page.locator('#postFxToggle')).toBeEnabled();
    await expect(page.locator('#volumeValue')).toHaveText('70');

    // 刷新后仍默认（等同新用户）
    await page.reload();
    await expect(page.locator('#mainMenu')).toBeVisible();
    await page.click('#settingsMenuBtn');
    await page.click('#settingsAudioItem');
    await expect(page.locator('#vvvfSoundToggle')).toBeChecked();
    await expect(page.locator('#volumeValue')).toHaveText('70');
    expectNoErrors(errors);
});

// ---------- 12. 设置列表触屏滚动（touchmove 白名单回归）----------
test('冒烟12 设置列表触屏可滚动：touchmove 白名单须含 .settings-menu', async ({ browser }) => {
    // 触屏上下文（hasTouch + isMobile），验证手指拖动可滚动设置列表
    const ctx = await browser.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    const errors = attachErrorCapture(page);
    await page.goto('/');
    await expect(page.locator('#mainMenu')).toBeVisible();
    await page.tap('#settingsMenuBtn');
    await expect(page.locator('#settingsView')).toBeVisible();

    // 内容应溢出（触发滚动的前提）
    const overflow = await page.evaluate(() => {
        const m = document.querySelector('.settings-menu');
        return m.scrollHeight > m.clientHeight;
    });
    expect(overflow).toBe(true);

    // CDP 触屏手势：手指上滑（增量 touchMove 才能触发原生滚动）
    const cdp = await ctx.newCDPSession(page);
    const box = await page.locator('.settings-menu').boundingBox();
    const cx = box.x + box.width / 2;
    const y0 = box.y + box.height - 20;
    const y1 = box.y + 20;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: y0 }] });
    for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: cx, y: y0 + ((y1 - y0) * i) / 12 }],
        });
        await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // 触屏滚动生效：scrollTop > 0
    await page.waitForFunction(
        () => document.querySelector('.settings-menu').scrollTop > 0,
        undefined,
        { timeout: 3_000 },
    );
    // 滚动后菜单项仍可点击
    await page.tap('#settingsAudioItem');
    await expect(page.locator('#audioSettingsView')).toBeVisible();
    expectNoErrors(errors);
    await ctx.close();
});
