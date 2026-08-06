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
test('冒烟6 重置存档：双确认 → localStorage 清空', async ({ page }) => {
    const errors = await openApp(page);
    // 先制造存档（Konami 解锁会写入 localStorage）
    await pressKonami(page);
    await expectToast(page, '后门已激活');
    const hasData = await page.evaluate(() => localStorage.getItem('trainProgress') !== null);
    expect(hasData).toBe(true);

    // 关于页 → 重置存档 → 两次确认
    await page.click('#aboutMenuBtn');
    await expect(page.locator('#aboutView')).toBeVisible();
    await page.click('#resetStorageBtn');
    await expect(page.locator('#confirmModal')).toBeVisible();
    await page.click('#confirmOkBtn');
    await expect(page.locator('#confirmModal')).toBeVisible();
    await page.click('#confirmOkBtn');
    await expectToast(page, '存档已重置');

    const cleared = await page.evaluate(
        () => localStorage.getItem('trainProgress') === null && localStorage.getItem('trainAchievements') === null,
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
