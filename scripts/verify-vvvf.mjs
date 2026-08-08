// scripts/verify-vvvf.mjs — VVVF 声效频谱自洽回归（无外部 WAV，理论反推频点）
// 用法：node scripts/verify-vvvf.mjs
// 判定：全部 ✅ 通过 → 退出码 0；任一 ✗ → 退出码 1
// 理论依据（VVVF-Simulator 调制理论）：PWM 输出含基波 f_b 与载波 f_c 及其对称边带 f_c ± n·f_b。
// 2026-08-07 解耦音效参数：分析窗收窄到「载波带」base±(randomRange+margin)，排除随 freqScale
// 变化的边带（宽窗会纳入不对称边带导致质心偏移），容差随 randomRange 自适应 → 不依赖具体参数值。
// 2026-08-08 分级变频：载波按 f_elec 分段——异步段 fc=async.base / 同步段 fc=N·f_elec / 方波无载波。
import { renderPcm, normalizeProfile } from '../src/audio/vvvfCore.js';
import { fftMagnitude, carrierBand } from '../src/audio/fft.js';
import { VEHICLES } from '../src/game/data.js';

const SR = 48000;
const N = 65536; // 1.365s，bin ≈ 0.732Hz
const MARGIN = 40; // 载波带外扩（覆盖 bin 分辨率 / 窗口边缘效应）
// 分级变频状态点：异步段(speed=2 → f=9Hz <25Hz) / N=9 同步段(speed=12 → f=54Hz) / 方波(speed=40 → f=180Hz)
const SYNC_PROFILE = normalizeProfile({
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
let pass = 0;
let fail = 0;

function check(name, cond, detail = '') {
    if (cond) {
        pass++;
        console.log(`✅ ${name}${detail ? ' — ' + detail : ''}`);
    } else {
        fail++;
        console.log(`✗ ${name}${detail ? ' — ' + detail : ''}`);
    }
}

// 1. 异步段：载波带质心 ≈ async.base（f_elec < 25Hz，fc=2000Hz）
{
    const mag = fftMagnitude(renderPcm({ profile: SYNC_PROFILE, state: { speed: 2, handle: 0 }, sampleRate: SR, numSamples: N, seed: 1 }));
    const s = carrierBand(mag, SR, 2000, 0, MARGIN);
    check('异步段：能量质心≈2000Hz', Math.abs(s.centroidHz - 2000) <= 40, `实测 ${s.centroidHz.toFixed(1)}Hz`);
}

// 2. 同步段 N=9：载波带质心 ≈ 9·f_elec（speed=12 → f=54Hz → fc=486Hz）
{
    const f = 4.5 * 12;
    const mag = fftMagnitude(renderPcm({ profile: SYNC_PROFILE, state: { speed: 12, handle: 0 }, sampleRate: SR, numSamples: N, seed: 1 }));
    const s = carrierBand(mag, SR, 9 * f, 0, MARGIN);
    check('同步段 N=9：质心≈486Hz', Math.abs(s.centroidHz - 9 * f) <= 40, `实测 ${s.centroidHz.toFixed(1)}Hz`);
}

// 3. 方波：峰值落在基波奇次谐波（speed=40 → f=180Hz，无载波）
{
    const f = 4.5 * 40;
    const mag = fftMagnitude(renderPcm({ profile: SYNC_PROFILE, state: { speed: 40, handle: 0 }, sampleRate: SR, numSamples: N, seed: 1 }));
    const s = carrierBand(mag, SR, 1500, 0, 1500);   // 宽窗 [0,3000] 找全局峰
    const odd = [1, 3, 5, 7, 9, 11, 13, 15].map((k) => f * k);
    check('方波段：峰值≈基波奇次谐波', odd.some((o) => Math.abs(s.peakFreqHz - o) <= 10), `实测 ${s.peakFreqHz.toFixed(1)}Hz`);
}

// 4. 6 车：非静音 + 异步段载波带质心自洽（容差 = randomRange + margin，随参数自适应）
for (const key of Object.keys(VEHICLES)) {
    const profile = normalizeProfile(VEHICLES[key].vvvf);
    const pcm = renderPcm({ profile, state: { speed: 2, handle: 0 }, sampleRate: SR, numSamples: N, seed: 1 });
    check(`车辆 ${key} 非静音`, pcm.some((v) => v !== 0));
    const mag = fftMagnitude(pcm);
    const base = profile.async.base;
    const tol = profile.async.randomRange + MARGIN;
    const s = carrierBand(mag, SR, base, profile.async.randomRange, MARGIN);
    check(`车辆 ${key} 异步段质心≈${base}Hz（±${tol}）`, Math.abs(s.centroidHz - base) <= tol, `实测 ${s.centroidHz.toFixed(1)}Hz`);
}

// 5. 旧配置兼容：无 syncStages → 固定载波（carrier→async）+ m=1
{
    const profile = normalizeProfile({ freqScale: 4.5, slipByHandle: 0.6, carrier: { base: 2000, randomRange: 0, randomInterval: 0 } });
    const mag = fftMagnitude(renderPcm({ profile, state: { speed: 10, handle: 3 }, sampleRate: SR, numSamples: N, seed: 1 }));
    const s = carrierBand(mag, SR, 2000, 0, MARGIN);
    check('旧配置兼容：无 stages 质心≈2000Hz', Math.abs(s.centroidHz - 2000) <= 40, `实测 ${s.centroidHz.toFixed(1)}Hz`);
}

console.log(`\n${fail === 0 ? '✅ 全部对拍通过' : `❌ ${fail} 项未通过`}`);
process.exit(fail === 0 ? 0 : 1);
