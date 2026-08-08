// scopeMath.js 单测：相位锁定 + 频率跟随（用真实 renderPcm 数据验证）
// 运行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPcm, normalizeProfile } from '../../src/audio/vvvfCore.js';
import { computeScopeWindow } from '../../src/game/scopeMath.js';

const SR = 48000;

// 与游戏 6 车同构的分级变频 profile（f=50Hz 落 N=9 同步段）
const PROFILE = normalizeProfile({
    freqScale: 4.5, slipByHandle: 0.6,
    async: { base: 2000, randomRange: 0, randomInterval: 0 },
    syncStages: [
        { fFrom: 25, n: 15, mFrom: 0.4, mTo: 0.6 },
        { fFrom: 45, n: 9, mFrom: 0.6, mTo: 0.8 },
        { fFrom: 75, n: 6, mFrom: 0.8, mTo: 0.95 },
        { fFrom: 112, n: 3, mFrom: 0.95, mTo: 1.0 },
    ],
    squareFreq: 157, mMin: 0.2, hysteresis: 3,
});

// 生成确定周期信号（freq 取 SR/period 为整数的值，保证样本级精确周期）
function gen(freq, numSamples) {
    const speed = freq / PROFILE.freqScale;
    return renderPcm({ profile: PROFILE, state: { speed, handle: 0 }, sampleRate: SR, numSamples, seed: 1 });
}

// 模拟滚动缓冲快照：roll 尾部对应信号 [tail-count, tail)
function snapshot(sig, tail) {
    const roll = new Float32Array(8192);
    const count = Math.min(roll.length, tail);
    for (let i = 0; i < count; i++) roll[i] = sig[tail - count + i];
    return { roll, count };
}

test('停稳/无数据：freq=0 → 空窗口', () => {
    const { roll, count } = snapshot(gen(50, 2000), 2000);
    const r = computeScopeWindow({ buf: roll, count, freq: 0, sampleRate: SR });
    assert.deepEqual(r, { start: 0, win: 0 });
});

test('相位锁定：不同缓冲偏移的窗口内容逐样本一致（波形稳定不抖动）', () => {
    const freq = 50;                 // period = 48000/50 = 960（整数，信号样本级周期）
    const period = SR / freq;
    const sig = gen(freq, 30000);
    const a = snapshot(sig, 4000);
    const b = snapshot(sig, 8000);
    const wa = computeScopeWindow({ buf: a.roll, count: a.count, freq, sampleRate: SR });
    const wb = computeScopeWindow({ buf: b.roll, count: b.count, freq, sampleRate: SR });
    assert.ok(wa.win > 0 && wb.win > 0);
    // 窗口 = 2 基波周期
    assert.ok(Math.abs(wa.win - 2 * period) <= 2, `win=${wa.win}, 2*period=${2 * period}`);
    // 两帧窗口对齐同一信号相位 → 内容一致（允许 ±1 采样触发抖动：相关性相位估计的浮点噪声，960 周期内 ≈0.75px 不可见）
    let maxDiff = 0;
    const n = Math.min(wa.win, wb.win);
    for (let i = 0; i < n; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(a.roll[wa.start + i] - b.roll[wb.start + i]));
    }
    assert.ok(maxDiff <= 1, `窗口内容不一致 maxDiff=${maxDiff}`);
});

test('频率跟随：窗口随频率自适应（始终 2 周期）', () => {
    const cases = [
        { freq: 25, period: 1920 },   // N=15 同步段
        { freq: 50, period: 960 },    // N=9
        { freq: 100, period: 480 },   // N=3（<112 段）
    ];
    for (const { freq, period } of cases) {
        const sig = gen(freq, 12000);
        const { roll, count } = snapshot(sig, 8000);
        const w = computeScopeWindow({ buf: roll, count, freq, sampleRate: SR });
        assert.ok(Math.abs(w.win - 2 * period) <= 2, `freq=${freq} win=${w.win}, 2*period=${2 * period}`);
        assert.ok(w.start >= 0 && w.start + w.win <= count, `窗口越界 start=${w.start} win=${w.win} count=${count}`);
    }
});

test('缓冲不足一个周期：不越界，窗口取可用上限', () => {
    const freq = 50;
    const sig = gen(freq, 3000);
    const { roll, count } = snapshot(sig, 300);
    const w = computeScopeWindow({ buf: roll, count, freq, sampleRate: SR });
    assert.ok(w.start >= 0);
    assert.ok(w.start + w.win <= count);
    assert.ok(w.win >= 64);
});
