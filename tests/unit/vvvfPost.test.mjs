// tests/unit/vvvfPost.test.mjs
// Feature 4：后处理纯函数（Biquad 滤波 / 卷积 / 软限幅 / 合成车体 IR）。
// 与浏览器原生节点（BiquadFilterNode / ConvolverNode / DynamicsCompressorNode）同参数自洽。
import assert from 'node:assert/strict';
import { feature } from './gwt.js';
import {
    biquadCoeffs, biquadProcess, convolve, softClip, syntheticBodyIr,
} from '../../src/audio/vvvfPost.js';
import { fftMagnitude, regionStats, globalMax } from '../../src/audio/fft.js';

const SR = 48000;
const N = 8192;   // 0.17s，bin ≈ 5.86Hz

function bandEnergy(mag, sr, n, loHz, hiHz) {
    const lo = Math.max(0, Math.round((loHz * n) / sr));
    const hi = Math.min(n / 2, Math.round((hiHz * n) / sr));
    let e = 0;
    for (let i = lo; i <= hi; i++) e += mag[i] * mag[i];
    return e;
}

feature('F4 后处理纯函数', {
    '低通滤波：衰减高频带、保留低频带': {
        given: () => ({ n: N, sr: SR }),
        when: ({ n, sr }) => {
            const t = (i) => i / sr;
            const pcm = Float32Array.from({ length: n },
                (_, i) => Math.sin(2 * Math.PI * 200 * t(i)) + 0.5 * Math.sin(2 * Math.PI * 4000 * t(i)));
            const c = biquadCoeffs({ type: 'lowpass', freq: 500, q: 0.707, sampleRate: sr });
            const out = biquadProcess(pcm, c);
            const before = fftMagnitude(pcm);
            const after = fftMagnitude(out);
            return {
                eLowB: bandEnergy(before, sr, n, 100, 300),
                eLowA: bandEnergy(after, sr, n, 100, 300),
                eHiB: bandEnergy(before, sr, n, 3500, 4500),
                eHiA: bandEnergy(after, sr, n, 3500, 4500),
            };
        },
        then: (ctx, { eLowB, eLowA, eHiB, eHiA }) => {
            assert.ok(eHiA < eHiB * 0.1, `高频带应显著衰减：${eHiA.toFixed(1)} vs ${eHiB.toFixed(1)}`);
            assert.ok(eLowA > eLowB * 0.5, `低频带应基本保留：${eLowA.toFixed(1)} vs ${eLowB.toFixed(1)}`);
        },
    },
    '卷积：在 IR 共振频率处增益增强': {
        given: () => ({ n: N, sr: SR }),
        when: ({ n, sr }) => {
            const t = (i) => i / sr;
            const pcm = Float32Array.from({ length: n },
                (_, i) => Math.sin(2 * Math.PI * 400 * t(i)) + Math.sin(2 * Math.PI * 600 * t(i)));
            const ir = syntheticBodyIr(sr, { seconds: 0.1, resonances: [{ freq: 600, q: 30, gain: 1 }] });
            const out = convolve(pcm, ir).slice(0, n);
            const mag = fftMagnitude(out);
            return {
                e400: bandEnergy(mag, sr, n, 360, 440),
                e600: bandEnergy(mag, sr, n, 560, 640),
            };
        },
        then: (ctx, { e400, e600 }) => {
            assert.ok(e600 > e400, `共振频率 600Hz 能量应强于 400Hz：${e600.toFixed(1)} vs ${e400.toFixed(1)}`);
        },
    },
    '软限幅：输出保持在 [-1,1]': {
        given: () => Float32Array.from({ length: 200 }, (_, i) => ((i % 7) - 3) * 1.2),
        when: (pcm) => softClip(pcm, 0.9),
        then: (ctx, out) => {
            assert.equal(out.length, ctx.length);
            for (const s of out) assert.ok(s >= -1 && s <= 1, `越界: ${s}`);
        },
    },
    '合成 IR：长度正确且频谱含共振峰': {
        given: () => ({ sr: SR, seconds: 0.25, reso: 320 }),
        when: ({ sr, seconds, reso }) => {
            const ir = syntheticBodyIr(sr, { seconds, resonances: [{ freq: reso, q: 20, gain: 1 }] });
            const padded = new Float64Array(16384);   // FFT 需 2 的幂
            padded.set(ir);
            const mag = fftMagnitude(padded);
            const g = globalMax(mag);
            const s = regionStats(mag, sr, reso - 80, reso + 80);
            return { ir, g, s };
        },
        then: (ctx, { ir, g, s }) => {
            assert.equal(ir.length, Math.floor(ctx.seconds * ctx.sr));
            assert.ok(Math.abs(s.peakFreqHz - ctx.reso) < 30,
                `共振峰应在 ${ctx.reso}Hz 附近：实测 ${s.peakFreqHz.toFixed(1)}Hz`);
            assert.ok(s.peakMag / g > 0.5, '共振峰应为主导谱线');
        },
    },
});
