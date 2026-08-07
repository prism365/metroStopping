// scripts/verify-vvvf.mjs — VVVF 声效频谱自洽回归（无外部 WAV，理论反推频点）
// 用法：node scripts/verify-vvvf.mjs
// 判定：全部 ✅ 通过 → 退出码 0；任一 ✗ → 退出码 1
// 理论依据（VVVF-Simulator 调制理论）：PWM 输出含基波 f_b 与载波 f_c 及其对称边带 f_c ± n·f_b，
// 故「载波区能量质心 ≈ f_c」是理论鲁棒的频点判据。
import { renderPcm, normalizeProfile } from '../src/audio/vvvfCore.js';
import { fftMagnitude, regionStats } from '../src/audio/fft.js';
import { VEHICLES } from '../src/game/data.js';

const SR = 48000;
const N = 65536; // 1.365s，bin ≈ 0.732Hz
const STATE = { speed: 10, handle: 3 };
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

// 1. 载波固定：质心 ≈ fc（自洽频点）
{
    const profile = normalizeProfile({ freqScale: 4.5, slipByHandle: 0.6, carrier: { base: 2000, randomRange: 0, randomInterval: 0 } });
    const mag = fftMagnitude(renderPcm({ profile, state: STATE, sampleRate: SR, numSamples: N, seed: 1 }));
    const s = regionStats(mag, SR, 1600, 2400);
    check('载波固定：能量质心≈2000Hz', Math.abs(s.centroidHz - 2000) <= 30, `实测 ${s.centroidHz.toFixed(1)}Hz`);
}

// 2. 6 车：非静音 + 质心自洽
for (const key of Object.keys(VEHICLES)) {
    const profile = normalizeProfile(VEHICLES[key].vvvf);
    const pcm = renderPcm({ profile, state: STATE, sampleRate: SR, numSamples: N, seed: 1 });
    check(`车辆 ${key} 非静音`, pcm.some((v) => v !== 0));
    const mag = fftMagnitude(pcm);
    const base = profile.carrier.base;
    const s = regionStats(mag, SR, base - 400, base + 400);
    check(`车辆 ${key} 质心≈${base}Hz`, Math.abs(s.centroidHz - base) <= 40, `实测 ${s.centroidHz.toFixed(1)}Hz`);
}

console.log(`\n${fail === 0 ? '✅ 全部对拍通过' : `❌ ${fail} 项未通过`}`);
process.exit(fail === 0 ? 0 : 1);
