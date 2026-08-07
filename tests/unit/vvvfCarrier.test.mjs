// tests/unit/vvvfCarrier.test.mjs
// Feature 2：载波与随机调制。
// 频谱断言设计（避免脆弱）：
//   - 用「载波区能量质心」断言载波频率——PWM 边带关于 fc 对称，质心=fc（理论鲁棒，实测 1999.2Hz）；
//   - 用「峰值频率有界 + 峰值/全局比摊开」断言随机调制生效——避免单根最强谱线抖动。
//   - 随机间隔/确定性直接单测 createCarrierRandomizer（纯函数，最稳）。
import assert from 'node:assert/strict';
import { feature } from './gwt.js';
import {
    renderPcm, normalizeProfile, createRng, createCarrierRandomizer,
} from '../../src/audio/vvvfCore.js';
import { fftMagnitude, regionStats, globalMax } from '../../src/audio/fft.js';

const SR = 48000;
const N = 65536;               // 1.365s，bin ≈ 0.732Hz
const BASE = 2000;
const STATE = { speed: 10, handle: 3 };   // 基波 = 4.5·10 + 0.6·3 = 46.8Hz
const CENTROID_TOL = 30;       // 理论=fc；实测 1999.2，容差宽裕
const PEAK_RATIO_MIN = 0.10;   // 载波区应被激励（相对全局峰值）

function render(profile, seed) {
    return renderPcm({ profile, state: STATE, sampleRate: SR, numSamples: N, seed });
}

feature('F2 载波与随机调制', {
    '载波基频固定：能量质心落在 fc，且载波区被激励': {
        given: () => normalizeProfile({
            freqScale: 4.5, slipByHandle: 0.6,
            carrier: { base: BASE, randomRange: 0, randomInterval: 0 },
        }),
        when: (profile) => {
            const mag = fftMagnitude(render(profile, 3));
            return { g: globalMax(mag), s: regionStats(mag, SR, BASE - 400, BASE + 400) };
        },
        then: (ctx, { g, s }) => {
            assert.ok(Math.abs(s.centroidHz - BASE) <= CENTROID_TOL,
                `载波区能量质心应≈${BASE}Hz：实测 ${s.centroidHz.toFixed(1)}Hz`);
            assert.ok(s.peakMag / g >= PEAK_RATIO_MIN,
                `载波区应被激励（峰值/全局≥${PEAK_RATIO_MIN}）：实测 ${((s.peakMag / g) * 100).toFixed(1)}%`);
        },
    },
    '随机调制展宽载波谱且峰值有界': {
        given: () => ({
            fixed: normalizeProfile({ freqScale: 4.5, slipByHandle: 0.6, carrier: { base: BASE, randomRange: 0, randomInterval: 0 } }),
            rand: normalizeProfile({ freqScale: 4.5, slipByHandle: 0.6, carrier: { base: BASE, randomRange: 60, randomInterval: 0.01 } }),
        }),
        when: ({ fixed, rand }) => {
            const fixedMag = fftMagnitude(render(fixed, 3));
            const randMag = fftMagnitude(render(rand, 3));
            const g = globalMax(fixedMag);
            return {
                g,
                sf: regionStats(fixedMag, SR, BASE - 400, BASE + 400),
                sr: regionStats(randMag, SR, BASE - 400, BASE + 400),
            };
        },
        then: (ctx, { g, sf, sr }) => {
            // 随机调制有界：载波峰值不越出 ±(randomRange+容差)
            const tol = 50;
            assert.ok(sr.peakFreqHz >= BASE - 60 - tol && sr.peakFreqHz <= BASE + 60 + tol,
                `载波峰值应≈fc±60：实测 ${sr.peakFreqHz.toFixed(1)}Hz`);
            // 随机调制生效：载波区能量被摊开 → 峰值/全局比显著下降
            assert.ok((sr.peakMag / g) < 0.6 * (sf.peakMag / g),
                `随机调制应摊开峰值：实测 ${((sr.peakMag / g) * 100).toFixed(1)}% vs 固定 ${((sf.peakMag / g) * 100).toFixed(1)}%`);
        },
    },
    '随机间隔生效（单元直测 randomizer）：频率有界且只在间隔边界跳变': {
        given: () => createCarrierRandomizer({ base: BASE, randomRange: 60, randomInterval: 0.4 }, createRng(5)),
        when: (carrier) => {
            const freq = [];
            for (let t = 0; t <= 2.0; t += 0.05) freq.push(carrier.freq(t));
            return freq;
        },
        then: (ctx, freq) => {
            for (const f of freq) {
                assert.ok(f >= BASE - 60 && f <= BASE + 60, `随机载波越界: ${f}Hz`);
            }
            // 0.4s 间隔 → 2s 内至多 ~5 次跳变 → 去重频点 ≤ 6
            const distinct = new Set(freq.map((f) => Math.round(f * 10) / 10));
            assert.ok(distinct.size <= 6, `跳变过于频繁：去重频点 ${distinct.size} 个`);
        },
    },
    '随机调制确定性：同 seed 产生同频率序列': {
        given: () => ({ seed: 9, times: Array.from({ length: 50 }, (_, i) => i * 0.1) }),
        when: ({ seed, times }) => {
            const a = createCarrierRandomizer({ base: BASE, randomRange: 60, randomInterval: 0.05 }, createRng(seed));
            const b = createCarrierRandomizer({ base: BASE, randomRange: 60, randomInterval: 0.05 }, createRng(seed));
            return { fa: times.map((t) => a.freq(t)), fb: times.map((t) => b.freq(t)) };
        },
        then: (ctx, { fa, fb }) => {
            assert.deepEqual(fa, fb);
        },
    },
});
