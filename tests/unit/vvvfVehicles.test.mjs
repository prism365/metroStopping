// tests/unit/vvvfVehicles.test.mjs
// Feature 5：6 车音色可区分（谱形）+ 同步段质心自洽。
// 设计（2026-08-07 与音效参数解耦）：分析窗收窄到「载波带」base±(randomRange+margin)。
// 2026-08-08 分级变频：载波按 f_elec 分段——异步段（低速）fc=async.base 用于谱区分；
//   同步段（中高速）fc=N·f_elec 由电气频率决定（各车相同），只测质心自洽。
import assert from 'node:assert/strict';
import { feature } from './gwt.js';
import { VEHICLES } from '../../src/game/data.js';
import { renderPcm, normalizeProfile, stageForFreq } from '../../src/audio/vvvfCore.js';
import { fftMagnitude, carrierBand } from '../../src/audio/fft.js';

const SR = 48000;
const N = 65536;                 // 1.365s，bin ≈ 0.732Hz
const KEYS = Object.keys(VEHICLES);
const MARGIN = 40;               // 载波带外扩（覆盖 bin 分辨率 / 窗口边缘效应）
const ASYNC_STATE = { speed: 2, handle: 0 };   // f_elec = 9Hz（异步段 f<25，fc=async.base）
const SYNC_STATE = { speed: 12, handle: 0 };   // f_elec = 54Hz（同步段 N=9，fc = 9·54 = 486Hz）

function carrierStats(profile, seed, state, base, randomRange) {
    const pcm = renderPcm({ profile, state, sampleRate: SR, numSamples: N, seed });
    const mag = fftMagnitude(pcm);
    const band = carrierBand(mag, SR, base, randomRange, MARGIN);
    return { ...band, base, tol: randomRange + MARGIN };
}

function assertCentroid(assert, k, s) {
    assert.ok(Math.abs(s.centroidHz - s.base) <= s.tol,
        `${k} 质心应≈base ${s.base}Hz（容差 ${s.tol}）：实测 ${s.centroidHz.toFixed(1)}Hz`);
}

feature('F5 6 车音色可区分', {
    '每辆车均能发声（非静音）': {
        given: () => KEYS,
        when: (keys) => keys.map((k) =>
            renderPcm({ profile: normalizeProfile(VEHICLES[k].vvvf), state: ASYNC_STATE, sampleRate: SR, numSamples: N, seed: 1 })
                .some((v) => v !== 0)),
        then: (keys, nonSilent) => {
            nonSilent.forEach((v, i) => assert.ok(v, `${keys[i]} 应非静音`));
        },
    },
    '异步段载波定位自洽 + 排序可区分（容差自适应 randomRange，与音效参数解耦）': {
        given: () => KEYS,
        when: (keys) => Object.fromEntries(keys.map((k) => {
            const p = normalizeProfile(VEHICLES[k].vvvf);
            return [k, carrierStats(p, 1, ASYNC_STATE, p.async.base, p.async.randomRange)];
        })),
        then: (ctx, stats) => {
            // 自洽：各车质心落回自身异步段载波带（容差 = randomRange + margin，随参数自适应）
            for (const [k, s] of Object.entries(stats)) assertCentroid(assert, k, s);
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
    '同步段（N=9）载波质心自洽：fc = N·f_elec': {
        given: () => KEYS,
        when: (keys) => Object.fromEntries(keys.map((k) => {
            const p = normalizeProfile(VEHICLES[k].vvvf);
            const f = p.freqScale * SYNC_STATE.speed + p.slipByHandle * SYNC_STATE.handle;
            const stage = stageForFreq(f, p);
            assert.ok(stage.mode === 'sync' && stage.n === 9, `${k} 应处于 N=9 同步段`);
            return [k, carrierStats(p, 1, SYNC_STATE, stage.n * f, 0)];
        })),
        then: (ctx, stats) => {
            for (const [k, s] of Object.entries(stats)) assertCentroid(assert, k, s);
        },
    },
});
