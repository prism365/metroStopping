// src/audio/fft.js
// radix-2 FFT（纯函数，零依赖）：vvvf 频谱断言与 verify-vvvf 回归共用。
// 输入：实数信号数组（长度必须为 2 的幂）；输出：单边幅度谱 mag[0..N/2]，
// 索引 i 对应频率 f = i·sampleRate/N。
export function fftMagnitude(signal) {
    const N = signal.length;
    if (N === 0 || (N & (N - 1)) !== 0) {
        throw new Error('fftMagnitude: 长度必须是 2 的幂');
    }
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = signal[i];

    // 位反转重排
    for (let i = 1, j = 0; i < N; i++) {
        let bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            const tr = re[i]; re[i] = re[j]; re[j] = tr;
        }
    }

    // 蝶形
    for (let len = 2; len <= N; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wRe = Math.cos(ang);
        const wIm = Math.sin(ang);
        for (let i = 0; i < N; i += len) {
            let curRe = 1;
            let curIm = 0;
            for (let k = 0; k < len / 2; k++) {
                const uRe = re[i + k];
                const uIm = im[i + k];
                const tRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
                const tIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
                re[i + k] = uRe + tRe;
                im[i + k] = uIm + tIm;
                re[i + k + len / 2] = uRe - tRe;
                im[i + k + len / 2] = uIm - tIm;
                const nRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = nRe;
            }
        }
    }

    const half = N / 2;
    const mag = new Float64Array(half + 1);
    for (let i = 0; i <= half; i++) {
        mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    }
    return mag;
}

// 在 [minBin, maxBin] 内找幅度最大的谱线，返回 { bin, freq, magnitude }。
export function findPeak(mag, sampleRate, minBin, maxBin) {
    const N = 2 * (mag.length - 1);
    let bestBin = minBin;
    let bestV = -1;
    for (let i = minBin; i <= maxBin; i++) {
        if (mag[i] > bestV) { bestV = mag[i]; bestBin = i; }
    }
    return { bin: bestBin, freq: (bestBin * sampleRate) / N, magnitude: bestV };
}

// 找全局最大幅度（用于相对阈值判断）。
export function globalMax(mag) {
    let m = 0;
    for (let i = 0; i < mag.length; i++) if (mag[i] > m) m = mag[i];
    return m;
}

// 载波带分析：自适应窗口 [base ± (randomRange+margin)]，返回该带的 regionStats。
// PWM 边带位于 base±n·f_elec（间距随 freqScale 变化），宽窗会纳入不对称边带导致质心偏移；
// 收窄到载波带可排除边带，使「质心≈base」断言与音效参数（freqScale/基频）调优解耦。
export function carrierBand(mag, sampleRate, base, randomRange = 0, margin = 40) {
    return regionStats(mag, sampleRate, base - randomRange - margin, base + randomRange + margin);
}

// 频带统计：能量加权质心 / RMS 带宽 / 峰值谱线。
// 用于「载波区」断言：PWM 的载波边带关于 fc 对称，故能量质心 ≈ fc（理论鲁棒）。
export function regionStats(mag, sampleRate, loHz, hiHz) {
    const N = 2 * (mag.length - 1);
    const lo = Math.max(1, Math.round((loHz * N) / sampleRate));
    const hi = Math.min(N / 2, Math.round((hiHz * N) / sampleRate));
    let wsum = 0;
    let csum = 0;
    let bsum = 0;
    let peakMag = -1;
    let peakBin = lo;
    for (let i = lo; i <= hi; i++) {
        const e = mag[i] * mag[i];
        wsum += e;
        csum += e * i;
        if (mag[i] > peakMag) { peakMag = mag[i]; peakBin = i; }
    }
    const centroidHz = (csum / wsum) * (sampleRate / N);
    for (let i = lo; i <= hi; i++) {
        const f = (i * sampleRate) / N;
        const e = mag[i] * mag[i];
        bsum += e * (f - centroidHz) * (f - centroidHz);
    }
    return {
        centroidHz,
        rmsBandwidthHz: Math.sqrt(bsum / wsum),
        peakFreqHz: (peakBin * sampleRate) / N,
        peakMag,
    };
}
