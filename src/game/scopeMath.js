// src/game/scopeMath.js
// 示波器显示窗口计算（纯函数，无 DOM，可 Node 单测）。
// 输入：滚动采样缓冲（真实 worklet 回传波形）+ 遥测基频 freq。
// 输出：相位锁定的显示窗口 {start, win}。
// - 相位锁定：以 freq 为基频做相关性估计基波相位，取「基波上升过零」为触发点，
//   显示起始对齐到基波零相位 → 波形稳定不抖动（等同示波器 Auto 触发）。
// - 频率跟随：窗口固定 winPeriods 个基波周期，随频率自适应缩放。
export function computeScopeWindow({ buf, count, freq, sampleRate = 48000, winPeriods = 2 }) {
    const WIN_MIN = 64;
    if (freq < 0.5 || count < WIN_MIN) return { start: 0, win: 0 };

    const period = Math.max(1, Math.round(sampleRate / freq));
    let win = Math.round(winPeriods * period);
    win = Math.max(WIN_MIN, Math.min(win, count));

    // 基波相位估计：对最近 ≤winPeriods 周期做 sin/cos 相关性（PWM 基波即 f_elec，谐波/载波分量正交被抑制）
    const corrLen = Math.min(count, Math.round(winPeriods * period));
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const c0 = count - corrLen;
    let S = 0;
    let C = 0;
    for (let i = 0; i < corrLen; i++) {
        const ph = w0 * (i - c0);
        const x = buf[c0 + i];
        S += x * Math.sin(ph);
        C += x * Math.cos(ph);
    }
    const phi = Math.atan2(S, C);
    // 触发点：sin=0 且 cos>0（基波上升过零），取 ≤ count-1 的最后一次
    const trigPhase = (((-phi) / w0) % period + period) % period;
    let start = Math.round(count - 1 - trigPhase);
    while (start + win > count) start -= period;
    while (start < 0) start += period;
    // 兜底：缓冲不足 1 周期时窗口无法按触发点放置 → 末端对齐
    if (start < 0 || start + win > count) start = Math.max(0, count - win);
    return { start, win };
}
