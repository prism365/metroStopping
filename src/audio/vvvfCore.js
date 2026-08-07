// src/audio/vvvfCore.js
// VVVF 声效核心纯函数库：无 DOM / 无 WebAudio 依赖，可在 Node 直接 import 单测。
//
// 以 VVVF-Simulator 调制理论为基准（Common.ModulateSignal / Carrier.RandomFrequency）：
//   逐样本比较「基波 vs 载波」→ 三相开关电平 → 线电压 (U−V)/2 → PCM 采样。
//
// 频率映射（2026-08-07 需求确认）：f_elec = freqScale·speed + slipByHandle·handle
//   —— 速度驱动基频（音高随车速自然升降），手柄叠加滑差（牵引抬频、制动降频）。

export const TWO_PI = Math.PI * 2;

// ---------- 可播种 RNG（mulberry32）----------
// 载波随机调制需要确定性：同 seed → 同输出，保证 FFT/统计断言可复现。
export function createRng(seed) {
    let a = seed >>> 0;
    return function next() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------- 波形函数（周期 2π，输出 [-1,1]；对照仓库 MyMath.Functions）----------
export function sine(x) {
    return Math.sin(x);
}

// 三角波：+1 → -1 → +1（每 2π 两个线性段）
export function triangle(x) {
    const f = x / TWO_PI - Math.floor(x / TWO_PI);
    return 4 * Math.abs(f - 0.5) - 1;
}

// 锯齿波（上升）：-1 → +1
export function saw(x) {
    const f = x / TWO_PI - Math.floor(x / TWO_PI);
    return 2 * f - 1;
}

// ---------- 比较器（VVVF-Simulator Common.ModulateSignal：Signal > Carrier ? 1 : 0）----------
export function modulateSignal(signal, carrier) {
    return signal > carrier ? 1 : 0;
}

// ---------- 配置归一化 ----------
// profile 契约（data.js VEHICLES[i].vvvf 字段）：
//   carrier: { base, randomRange, randomInterval, wave? }   载波基频 Hz / 随机幅度 Hz / 随机间隔 s / 载波波形
//   freqScale: 速度→电气频率换算（Hz/(m/s)）
//   slipByHandle: 手柄→滑差（Hz/手柄档）
//   minSpeed: 停稳判定速度（m/s）
//   volume: 混音音量（dB）
//   filters: 车厢滤波预设（P5 用，透传）
//   ir: 车体脉冲响应（'synthetic' 或预留 AudioBuffer，P5 用，透传）
export function normalizeProfile(profile = {}) {
    return {
        carrier: { base: 2000, randomRange: 0, randomInterval: 0, ...(profile.carrier ?? {}) },
        freqScale: profile.freqScale ?? 4.5,
        slipByHandle: profile.slipByHandle ?? 0.6,
        minSpeed: profile.minSpeed ?? 0.01,
        volume: profile.volume ?? 0,
        filters: profile.filters ?? [],
        ir: profile.ir ?? null,
    };
}

// ---------- 激励门控 ----------
// 停稳(≤minSpeed) → 0；否则持续发声（2026-08-07 去除惰行静音：惰行/牵引/制动均发声）。
function getExcitation(p, { speed }) {
    if (speed <= p.minSpeed) return 0;
    return 1;
}

// ---------- 频率映射（F1 被测对象）----------
// 返回 { freq: 电气频率 Hz, excitation: 0..1 激励幅度 }
export function freqFromState({ speed, handle, profile }) {
    const p = normalizeProfile(profile);
    const freq = speed <= p.minSpeed ? 0 : p.freqScale * speed + p.slipByHandle * handle;
    return { freq: Math.max(0, freq), excitation: getExcitation(p, { speed, handle }) };
}

// ---------- 载波随机化（对照仓库 Carrier.RandomFrequency）----------
// 每隔 randomInterval 秒，在 ±randomRange Hz 内随机抖动载波频率；区间内频率恒定。
export function createCarrierRandomizer({ base, randomRange, randomInterval }, rng = Math.random) {
    let lastRange = 0;
    let lastUpdateTime = 0;
    return {
        freq(time) {
            if (randomInterval > 0 && lastUpdateTime + randomInterval < time) {
                lastRange = (rng() * 2 - 1) * randomRange;
                lastUpdateTime = time;
            }
            return base + lastRange;
        },
    };
}

// ---------- PCM 渲染（ASYNC 调制，线电压输出）----------
// state：静态 {speed, handle} 或 (tSec)=>({speed, handle})（profile 须恒定，取入参）。
// 逐样本：相位累加器推进基波/载波相位（相位连续、频率可跳变）→ 比较 → 线电压 → ×激励。
export function renderPcm({ profile, state, sampleRate = 48000, numSamples, seed = 1, carrierWave }) {
    const p = normalizeProfile(profile);
    const rng = createRng(seed);
    const carrier = createCarrierRandomizer(p.carrier, rng);
    const wave = (carrierWave ?? p.carrier.wave ?? 'Triangle') === 'Saw' ? saw : triangle;
    const out = new Float32Array(numSamples);
    let basePhase = 0;
    let carrierPhase = 0;

    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const s = typeof state === 'function' ? state(t) : state;
        const freq = s.speed <= p.minSpeed ? 0 : p.freqScale * s.speed + p.slipByHandle * s.handle;
        const exc = getExcitation(p, s);

        const carrierFreq = carrier.freq(t);
        basePhase += (TWO_PI * Math.max(0, freq)) / sampleRate;
        carrierPhase += (TWO_PI * carrierFreq) / sampleRate;

        const baseU = sine(basePhase);
        const baseV = sine(basePhase - TWO_PI / 3);
        const cw = wave(carrierPhase);

        const u = modulateSignal(baseU, cw) * 2;   // {0, 2} 两电平相电压
        const v = modulateSignal(baseV, cw) * 2;
        out[i] = ((u - v) / 2) * exc;              // 线电压 ∈ {-1, 0, 1}，乘激励
    }
    return out;
}
