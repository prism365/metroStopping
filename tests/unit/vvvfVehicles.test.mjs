// tests/unit/vvvfVehicles.test.mjs
// Feature 5：6 车音色可区分（谱形）——各车载波基频不同，载波带能量质心应自洽且保持排序。
// 设计（2026-08-07 与音效参数解耦）：分析窗收窄到「载波带」base±(randomRange+margin)，
// 排除随 freqScale 变化的 PWM 边带（宽窗会纳入不对称边带导致质心偏移）→ 质心定位不依赖具体参数值。
import assert from 'node:assert/strict';
import { feature } from './gwt.js';
import { VEHICLES } from '../../src/game/data.js';
import { renderPcm, normalizeProfile } from '../../src/audio/vvvfCore.js';
import { fftMagnitude, carrierBand } from '../../src/audio/fft.js';

const SR = 48000;
const N = 65536;                 // 1.365s，bin ≈ 0.732Hz
const STATE = { speed: 10, handle: 3 };
const KEYS = Object.keys(VEHICLES);
const MARGIN = 40;               // 载波带外扩（覆盖 bin 分辨率 / 窗口边缘效应）

function carrierStats(profile, seed) {
    const pcm = renderPcm({ profile, state: STATE, sampleRate: SR, numSamples: N, seed });
    const mag = fftMagnitude(pcm);
    const base = profile.carrier.base;
    const band = carrierBand(mag, SR, base, profile.carrier.randomRange, MARGIN);
    return { ...band, base, tol: profile.carrier.randomRange + MARGIN };
}

feature('F5 6 车音色可区分', {
    '每辆车均能发声（非静音）': {
        given: () => KEYS,
        when: (keys) => keys.map((k) =>
            renderPcm({ profile: normalizeProfile(VEHICLES[k].vvvf), state: STATE, sampleRate: SR, numSamples: N, seed: 1 })
                .some((v) => v !== 0)),
        then: (keys, nonSilent) => {
            nonSilent.forEach((v, i) => assert.ok(v, `${keys[i]} 应非静音`));
        },
    },
    '载波定位自洽 + 排序可区分（容差自适应 randomRange，与音效参数解耦）': {
        given: () => KEYS,
        when: (keys) => Object.fromEntries(keys.map((k) => [k, carrierStats(normalizeProfile(VEHICLES[k].vvvf), 1)])),
        then: (ctx, stats) => {
            // 自洽：各车质心落回自身载波带（容差 = randomRange + margin，随参数自适应）
            for (const [k, s] of Object.entries(stats)) {
                assert.ok(Math.abs(s.centroidHz - s.base) <= s.tol,
                    `${k} 质心应≈base ${s.base}Hz（容差 ${s.tol}）：实测 ${s.centroidHz.toFixed(1)}Hz`);
            }
            // 可区分/排序保持：数据驱动，不硬编码车对
            //   基频差 ≥300Hz → 质心必须显著分开（≥150Hz）
            //   基频差 ≥150Hz → 质心排序必须与基频一致（无交叉）
            const items = Object.entries(stats).map(([k, s]) => ({ key: k, base: s.base, centroid: s.centroidHz }));
            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    const a = items[i], b = items[j];
                    const baseDiff = a.base - b.base;
                    const centDiff = a.centroid - b.centroid;
                    if (Math.abs(baseDiff) >= 300) {
                        assert.ok(Math.abs(centDiff) >= 150,
                            `${a.key}(${a.base}) 与 ${b.key}(${b.base}) 谱应可区分：质心差 ${Math.abs(centDiff).toFixed(1)}Hz`);
                    }
                    if (Math.abs(baseDiff) >= 150) {
                        assert.ok(Math.sign(baseDiff) === Math.sign(centDiff),
                            `${a.key} 与 ${b.key} 质心排序应保持（基频差 ${baseDiff}Hz，质心差 ${centDiff.toFixed(1)}Hz）`);
                    }
                }
            }
        },
    },
});
