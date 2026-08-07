// scripts/verify-vvvf.mjs — VVVF 声效频谱自洽回归（无外部 WAV，理论反推频点）
// 用法：node scripts/verify-vvvf.mjs
// 判定：全部 ✅ 通过 → 退出码 0；任一 ✗ → 退出码 1
// 理论依据（VVVF-Simulator 调制理论）：PWM 输出含基波 f_b 与载波 f_c 及其对称边带 f_c ± n·f_b。
// 2026-08-07 解耦音效参数：分析窗收窄到「载波带」base±(randomRange+margin)，排除随 freqScale
// 变化的边带（宽窗会纳入不对称边带导致质心偏移），容差随 randomRange 自适应 → 不依赖具体参数值。
import { renderPcm, normalizeProfile } from '../src/audio/vvvfCore.js';
import { fftMagnitude, carrierBand } from '../src/audio/fft.js';
import { VEHICLES } from '../src/game/data.js';

const SR = 48000;
const N = 65536; // 1.365s，bin ≈ 0.732Hz
const STATE = { speed: 10, handle: 3 };
const MARGIN = 40; // 载波带外扩（覆盖 bin 分辨率 / 窗口边缘效应）
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

// 1. 载波固定：载波带质心 ≈ fc（内联 profile，自洽频点）
{
    const profile = normalizeProfile({ freqScale: 4.5, slipByHandle: 0.6, carrier: { base: 2000, randomRange: 0, randomInterval: 0 } });
    const mag = fftMagnitude(renderPcm({ profile, state: STATE, sampleRate: SR, numSamples: N, seed: 1 }));
    const s = carrierBand(mag, SR, 2000, 0, MARGIN);
    check('载波固定：能量质心≈2000Hz', Math.abs(s.centroidHz - 2000) <= 40, `实测 ${s.centroidHz.toFixed(1)}Hz`);
}

// 2. 6 车：非静音 + 载波带质心自洽（容差 = randomRange + margin，随参数自适应）
for (const key of Object.keys(VEHICLES)) {
    const profile = normalizeProfile(VEHICLES[key].vvvf);
    const pcm = renderPcm({ profile, state: STATE, sampleRate: SR, numSamples: N, seed: 1 });
    check(`车辆 ${key} 非静音`, pcm.some((v) => v !== 0));
    const mag = fftMagnitude(pcm);
    const base = profile.carrier.base;
    const tol = profile.carrier.randomRange + MARGIN;
    const s = carrierBand(mag, SR, base, profile.carrier.randomRange, MARGIN);
    check(`车辆 ${key} 质心≈${base}Hz（±${tol}）`, Math.abs(s.centroidHz - base) <= tol, `实测 ${s.centroidHz.toFixed(1)}Hz`);
}

console.log(`\n${fail === 0 ? '✅ 全部对拍通过' : `❌ ${fail} 项未通过`}`);
process.exit(fail === 0 ? 0 : 1);
