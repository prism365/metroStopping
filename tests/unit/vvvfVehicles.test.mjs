// tests/unit/vvvfVehicles.test.mjs
// Feature 5：6 车音色可区分（谱形）——载波基频不同的车，载波区能量质心应可区分。
import assert from 'node:assert/strict';
import { feature } from './gwt.js';
import { VEHICLES } from '../../src/game/data.js';
import { renderPcm, normalizeProfile } from '../../src/audio/vvvfCore.js';
import { fftMagnitude, regionStats } from '../../src/audio/fft.js';

const SR = 48000;
const N = 65536;                 // 1.365s，bin ≈ 0.732Hz
const STATE = { speed: 10, handle: 3 };
const KEYS = Object.keys(VEHICLES);

function carrierStats(profile, seed) {
    const pcm = renderPcm({ profile, state: STATE, sampleRate: SR, numSamples: N, seed });
    const mag = fftMagnitude(pcm);
    const base = profile.carrier.base;
    return { ...regionStats(mag, SR, base - 400, base + 400), base };
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
    '载波基频不同的车辆：能量质心可区分': {
        given: () => KEYS,
        when: (keys) => Object.fromEntries(keys.map((k) => [k, carrierStats(normalizeProfile(VEHICLES[k].vvvf), 1)])),
        then: (ctx, stats) => {
            // 自洽：各车质心落回自身载波基频附近
            for (const [k, s] of Object.entries(stats)) {
                assert.ok(Math.abs(s.centroidHz - s.base) <= 40,
                    `${k} 质心应≈base ${s.base}Hz：实测 ${s.centroidHz.toFixed(1)}Hz`);
            }
            // 可区分：不同载波基频的车，质心差应显著（实测最小间距 200Hz）
            const pairs = [['STANDARD', 'PERFORMANCE'], ['STANDARD', 'ACCEL'], ['ACCEL', 'BRAKE'], ['HYBRID', 'ATC'], ['BRAKE', 'HYBRID']];
            for (const [a, b] of pairs) {
                const d = Math.abs(stats[a].centroidHz - stats[b].centroidHz);
                assert.ok(d >= 150, `${a}(${stats[a].base}) 与 ${b}(${stats[b].base}) 谱应可区分：质心差 ${d.toFixed(1)}Hz`);
            }
        },
    },
});
