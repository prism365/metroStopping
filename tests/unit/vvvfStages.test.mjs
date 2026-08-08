// tests/unit/vvvfStages.test.mjs
// Feature 6/7/8：分级变频 + 变调制比 + 分档切换（过零/滞回）。
// 频谱断言防脆弱政策：载波定位用「能量质心≈fc」（PWM 对称边带理论鲁棒）；
//   方波用「峰值落在基波奇次谐波」（180° 方波频谱特征）；调制比/切换用纯函数直测（最稳）。
import assert from 'node:assert/strict';
import { feature } from './gwt.js';
import {
    normalizeProfile, stageForFreq, modulationIndex, createStageController, renderPcm, TWO_PI,
} from '../../src/audio/vvvfCore.js';
import { fftMagnitude, regionStats, globalMax } from '../../src/audio/fft.js';

const SR = 48000;
const N = 65536;                 // 1.365s，bin ≈ 0.732Hz
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

function render(speed) {
    return renderPcm({ profile: PROFILE, state: { speed, handle: 0 }, sampleRate: SR, numSamples: N, seed: 1 });
}

function bandCentroid(speed, centerHz, halfHz) {
    const mag = fftMagnitude(render(speed));
    return regionStats(mag, SR, centerHz - halfHz, centerHz + halfHz).centroidHz;
}

function fundamentalMag(speed) {
    const mag = fftMagnitude(render(speed));
    const f = PROFILE.freqScale * speed;
    const bin = Math.round(f / (SR / N));
    return mag[bin];
}

feature('F6 分级变频：载波随 f_elec 分段', {
    '异步段：fc = async.base（f_elec < 25Hz）': {
        given: () => ({ speed: 3 }),   // f_elec = 13.5Hz
        when: ({ speed }) => {
            const f = PROFILE.freqScale * speed;
            const st = stageForFreq(f, PROFILE);
            return { st, c: bandCentroid(speed, 2000, 400) };
        },
        then: (ctx, r) => {
            assert.equal(r.st.mode, 'async');
            assert.ok(Math.abs(r.c - 2000) <= 40, `异步段质心≈2000：实测 ${r.c.toFixed(1)}Hz`);
        },
    },
    '同步段：fc = N·f_elec 质心自洽（N=15/9/6/3）': {
        given: () => [[8, 15], [12, 9], [20, 6], [30, 3]],   // f_elec = 36/54/90/135Hz
        when: (cases) => cases.map(([speed, n]) => {
            const f = PROFILE.freqScale * speed;
            const st = stageForFreq(f, PROFILE);
            assert.equal(st.n, n, `speed=${speed} 应 N=${n}`);
            // 窗口策略：N=15/9/6 宽窗 ±2.5f 覆盖主边带（质心极准）；N=3 窄窗 ±0.75f 避开基波
            const half = n <= 3 ? 0.75 * f : 2.5 * f;
            const c = regionStats(fftMagnitude(render(speed)), SR, Math.max(0, n * f - half), n * f + half).centroidHz;
            return { f, n, c, tol: n <= 3 ? 30 : 25 };
        }),
        then: (ctx, rs) => {
            for (const r of rs) {
                assert.ok(Math.abs(r.c - r.n * r.f) <= r.tol,
                    `N=${r.n} fc=${r.n * r.f}Hz：实测质心 ${r.c.toFixed(1)}Hz（容差 ${r.tol}）`);
            }
        },
    },
    '方波段：无载波，峰值落在基波奇次谐波': {
        given: () => ({ speed: 40 }),   // f_elec = 180Hz
        when: ({ speed }) => {
            const f = PROFILE.freqScale * speed;
            const st = stageForFreq(f, PROFILE);
            const s = regionStats(fftMagnitude(render(speed)), SR, 200, 4000);
            const odd = [1, 3, 5, 7, 9, 11, 13, 15].map((k) => f * k);
            return { st, peak: s.peakFreqHz, odd, g: globalMax(fftMagnitude(render(speed))) };
        },
        then: (ctx, r) => {
            assert.equal(r.st.mode, 'square');
            assert.ok(r.odd.some((o) => Math.abs(r.peak - o) <= 10),
                `峰值应落在基波奇次谐波：实测 ${r.peak.toFixed(1)}Hz`);
        },
    },
});

feature('F7 变调制比：m 随 f_elec 上升（恒压频比）', {
    'm 单调递增且跨段连续': {
        given: () => [0, 12.5, 25, 45, 75, 112, 157, 170],
        when: (fs) => fs.map((f) => modulationIndex(f, PROFILE)),
        then: (ctx, ms) => {
            for (let i = 1; i < ms.length; i++) {
                assert.ok(ms[i] >= ms[i - 1], `m 应单调：${ms[i - 1]}→${ms[i]}`);
            }
            // 跨段连续：档边界处 m 精确等于表值（mFrom/mTo 衔接）
            assert.ok(Math.abs(ms[2] - 0.4) < 1e-9);    // f=25 → N15.mFrom
            assert.ok(Math.abs(ms[3] - 0.6) < 1e-9);    // f=45 → N9.mFrom
            assert.ok(Math.abs(ms[4] - 0.8) < 1e-9);    // f=75 → N6.mFrom
            assert.ok(Math.abs(ms[5] - 0.95) < 1e-9);   // f=112 → N3.mFrom
            assert.ok(Math.abs(ms[6] - 1.0) < 1e-9);    // f=157 → 方波 m=1
        },
    },
    '基波分量幅度随 m 增大（调制比抬升输出）': {
        given: () => [8, 20, 30],   // f_elec = 36(m≈0.51) / 90(m≈0.86) / 135(m≈0.98)
        when: (speeds) => speeds.map((s) => ({ s, m: modulationIndex(PROFILE.freqScale * s, PROFILE), mag: fundamentalMag(s) })),
        then: (ctx, rs) => {
            for (let i = 1; i < rs.length; i++) {
                assert.ok(rs[i].m > rs[i - 1].m, 'm 应递增');
                assert.ok(rs[i].mag > rs[i - 1].mag,
                    `基波幅度应随 m 增大：m=${rs[i - 1].m.toFixed(3)}(${rs[i - 1].mag.toFixed(1)}) → m=${rs[i].m.toFixed(3)}(${rs[i].mag.toFixed(1)})`);
            }
        },
    },
});

feature('F8 分档切换：过零应用 + 滞回', {
    '升档在基波过零后应用，档位正确': {
        given: () => createStageController(PROFILE),
        when: (ctrl) => {
            const dt = 1 / SR;
            let bp = 0;
            const f = 30;   // 目标 N=15
            const modes = [];
            for (let i = 0; i < SR; i++) {   // 1s
                bp += TWO_PI * f * dt;
                modes.push(ctrl.step(f, bp).mode);
            }
            return modes;
        },
        then: (ctx, modes) => {
            const idx = modes.indexOf('sync');
            assert.ok(idx > 0, '起始 async，过零后才切 sync');
            assert.ok(modes.slice(idx).every((m) => m === 'sync'), '切换后保持 sync');
        },
    },
    '滞回：下界附近降频延迟降档': {
        given: () => createStageController(PROFILE),
        when: (ctrl) => {
            const dt = 1 / SR;
            let bp = 0;
            // 加速到 N=9（f=60）
            for (let i = 0; i < SR * 0.5; i++) { bp += TWO_PI * 60 * dt; ctrl.step(60, bp); }
            // f=44：目标 N=15，但 44 ≥ 45-3=42 → 滞回保持 N=9
            const hold = [];
            for (let i = 0; i < SR * 0.5; i++) { bp += TWO_PI * 44 * dt; hold.push(ctrl.step(44, bp).n); }
            // f=40：40 < 42 → 放行降档 N=15
            const down = [];
            for (let i = 0; i < SR * 0.5; i++) { bp += TWO_PI * 40 * dt; down.push(ctrl.step(40, bp).n); }
            return { hold, down };
        },
        then: (ctx, r) => {
            assert.ok(r.hold.every((n) => n === 9), 'f=44 应保持 N=9（滞回）');
            assert.equal(r.down.slice(-1)[0], 15, 'f=40 应降档到 N=15');
        },
    },
    '方波进入：f ≥ squareFreq → square': {
        given: () => createStageController(PROFILE),
        when: (ctrl) => {
            const dt = 1 / SR;
            let bp = 0;
            let mode = '';
            for (let i = 0; i < SR * 0.5; i++) {
                bp += TWO_PI * 160 * dt;
                mode = ctrl.step(160, bp).mode;
            }
            return mode;
        },
        then: (ctx, mode) => assert.equal(mode, 'square'),
    },
});
