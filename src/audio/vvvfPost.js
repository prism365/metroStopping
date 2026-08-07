// src/audio/vvvfPost.js
// VVVF 后处理纯函数库（无 DOM / 无 WebAudio 依赖，可在 Node 直接 import 单测）。
// 浏览器侧用原生节点（BiquadFilterNode / ConvolverNode / DynamicsCompressorNode），
// 本模块提供同参数的纯函数实现，用于单测验证「参数 → 频响行为」与浏览器节点自洽。

// ---------- RBJ Biquad 系数（对照浏览器 BiquadFilterNode 的 cookbook）----------
export function biquadCoeffs({ type, freq, q, gain = 0, sampleRate }) {
    const A = Math.pow(10, gain / 40);
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const cosw = Math.cos(w0);
    const sinw = Math.sin(w0);
    const alpha = sinw / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
        case 'lowpass':
            b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = b0;
            a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
            break;
        case 'highpass':
            b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = b0;
            a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
            break;
        case 'peaking':
            b0 = 1 + alpha * A; b1 = -2 * cosw; b2 = 1 - alpha * A;
            a0 = 1 + alpha / A; a1 = -2 * cosw; a2 = 1 - alpha / A;
            break;
        case 'notch':
            b0 = 1; b1 = -2 * cosw; b2 = 1;
            a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
            break;
        default:
            throw new Error(`未知滤波器类型: ${type}`);
    }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

// ---------- Biquad 处理（直接 I 型，逐样本状态）----------
export function biquadProcess(samples, c) {
    const out = new Float32Array(samples.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < samples.length; i++) {
        const x = samples[i];
        const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
        x2 = x1; x1 = x;
        y2 = y1; y1 = y;
        out[i] = y;
    }
    return out;
}

// ---------- 卷积（朴素实现，测试/短 IR 用）----------
export function convolve(samples, ir) {
    const n = samples.length;
    const m = ir.length;
    const out = new Float32Array(n + m - 1);
    for (let i = 0; i < n; i++) {
        const x = samples[i];
        if (x === 0) continue;
        for (let j = 0; j < m; j++) out[i + j] += x * ir[j];
    }
    return out;
}

// ---------- 软限幅（防削波；对应 DynamicsCompressorNode 的兜底）----------
export function softClip(samples, threshold = 0.9) {
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        out[i] = Math.tanh(samples[i] / threshold) * threshold;
    }
    return out;
}

// ---------- 合成车体脉冲响应（车厢/车体结构共振占位，供 ConvolverNode）----------
// 无外部 IR 资产时生成：若干阻尼正弦共振（车体地板/侧墙模态的简化）。
export function syntheticBodyIr(sampleRate, { seconds = 0.25, resonances = [{ freq: 320, q: 18, gain: 0.8 }, { freq: 780, q: 22, gain: 0.5 }] } = {}) {
    const n = Math.max(1, Math.floor(seconds * sampleRate));
    const ir = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        let v = 0;
        for (const r of resonances) {
            const decay = Math.exp(-t * (sampleRate / (2 * r.q * r.freq)));
            v += r.gain * Math.sin(2 * Math.PI * r.freq * t) * decay;
        }
        ir[i] = v * Math.exp(-t * 12);   // 整体快速衰减
    }
    let max = 0;
    for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(ir[i]));
    if (max > 0) for (let i = 0; i < n; i++) ir[i] /= max;
    return ir;
}
