// tests/e2e/helpers.js — Playwright 冒烟测试公共设施
// 固化 test-flow.md「浏览器手动回归（交互层）」清单的公共步骤
import { expect } from '@playwright/test';

// 收集页面运行时错误（pageerror + console error）
// 固化手动清单末条「DevTools Console 无红色报错」
export function attachErrorCapture(page) {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    return errors;
}

export function expectNoErrors(errors) {
    expect(errors, '页面不应出现 pageerror / console.error').toEqual([]);
}

// 项目 overlay 隐藏靠 .hidden 类（opacity:0 + pointer-events:none，元素仍占位），
// Playwright 会把 opacity:0 的元素判为 visible，因此用 class 断言替代 toBeHidden
// （.overlay.hidden / .modal-overlay.hidden 均为隐藏态）
export async function expectHidden(page, selector, options) {
    await expect(page.locator(selector)).toHaveClass(/hidden/, options);
}

// 断言 toast 出现（#toast 加 'show' 类，3 秒后消失，须用轮询抓住窗口期）
export async function expectToast(page, text, { timeout = 5_000 } = {}) {
    await page.waitForFunction(
        (t) => {
            const el = document.querySelector('#toast');
            return !!el && el.classList.contains('show') && el.textContent.includes(t);
        },
        text,
        { timeout },
    );
}

// 开局：主菜单 → 开始驾驶（进入倒计时即返回）
export async function startGame(page) {
    await page.click('#startGameBtn');
    await expectHidden(page, '#mainMenu');
    await expect(page.locator('#countdownOverlay')).toBeVisible();
}

// 等待倒计时结束（发车：countdownOverlay 隐藏）
export async function waitForCountdownDone(page, { timeout = 15_000 } = {}) {
    await expectHidden(page, '#countdownOverlay', { timeout });
}

// Konami 测试后门：↑↑↑↑↓↓↓↓（须在主菜单可见时输入，input.js 绑定）
export async function pressKonami(page) {
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
}

// 通过真实 UI 选关：打开关卡视图 → 点击第 idx 张卡片
export async function selectLevel(page, idx = 0) {
    await page.click('#levelMenuBtn');
    await expect(page.locator('#levelView')).toBeVisible();
    await page.locator('#levelGridContainer .level-card').nth(idx).click();
}

// 通过真实 UI 选车：打开车辆视图 → 点击指定车辆卡片
export async function selectVehicle(page, vehicleId) {
    await page.click('#vehicleMenuBtn');
    await expect(page.locator('#vehicleView')).toBeVisible();
    await page.locator(`#vehicleGridContainer .vehicle-card[data-vehicle="${vehicleId}"]`).click();
}
