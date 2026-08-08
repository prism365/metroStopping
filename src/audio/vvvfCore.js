// src/audio/vvvfCore.js
// VVVF 声效核心纯函数库：无 DOM / 无 WebAudio 依赖，可在 Node 直接 import 单测。
//
// 以 VVVF-Simulator 调制理论为基准（Common.ModulateSignal / Carrier.RandomFrequency）：
//   逐样本比较「基波 vs 载波」→ 三相开关电平 → 线电压 (U−V)/2 → PCM 采样。
//
// 频率映射（2026-08-07 需求确认）：f_elec = freqScale·speed + slipByHandle·handle
//   —— 速度驱动基频（音高随车速自然升降），手柄叠加滑差（牵引抬频、制动降频）。
//
// 分级变频 + 变调制比（2026-08-08 需求确认）：模拟地铁真实牵引的分段调制
//   —— 低速异步段（fc 固定+随机抖动）→ 中高速同步段（fc=N·f_elec，N=15/9/6/3 分档）
//      → 最高速 180° 方波（无载波）；调制比 m 随 f_elec 分段线性上升（恒压频比），跨段连续。
//   分档切换：过零切换（基波过零时应用新档）+ 滞回（升降频双边界防抖）+ fc 瞬时跳变。
//   —— 无 syncStages 时退化为旧行为（async 固定载波 + m=1），保证旧测试/配置兼容。

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
//   async: { base, randomRange, randomInterval, wave? }   异步段载波（旧 carrier 字段自动迁移）
//   freqScale: 速度→电气频率换算（Hz/(m/s)）
//   slipByHandle: 手柄→滑差（Hz/手柄档）
//   coastGain: 惰行激励（0=静音）
//   minSpeed: 停稳判定速度（m/s）
//   syncStages: [{ fFrom, n, mFrom, mTo }]  同步段分档表（f_elec 进入点 / 载波比 / 段首尾调制比）
//   squareFreq: 方波进入点（f_elec ≥ 该值 → 180° 方波；缺省 Infinity=无方波）
//   mMin: 异步段起点调制比
//   hysteresis: 降档滞回带宽（Hz，升降频双边界防抖）
//   volume: 混音音量（dB）
//   filters: 车厢滤波预设（P5 用，透传）
//   ir: 车体脉冲响应（'synthetic' 或预留 AudioBuffer，P5 用，透传）
// 兼容：旧 carrier 字段 → 迁移为 async；无 syncStages → 旧行为（async 固定载波 + m=1）
export function normalizeProfile(profile = {}) {
    const oldCarrier = profile.carrier ?? {};
    const async = {
        base: 2000, randomRange: 0, randomInterval: 0, wave: 'Triangle',
        ...oldCarrier,
        ...(profile.async ?? {}),
    };
    return {
        async,
        freqScale: profile.freqScale ?? 4.5,
        slipByHandle: profile.slipByHandle ?? 0.6,
        coastGain: profile.coastGain ?? 0,
        minSpeed: profile.minSpeed ?? 0.01,
        volume: profile.volume ?? 0,
        filters: profile.filters ?? [],
        ir: profile.ir ?? null,
        syncStages: (profile.syncStages ?? []).map((s) => ({
            fFrom: s.fFrom, n: s.n, mFrom: s.mFrom ?? 0.5, mTo: s.mTo ?? 0.9,
        })),
        squareFreq: profile.squareFreq ?? Infinity,
        mMin: profile.mMin ?? 0.2,
        hysteresis: profile.hysteresis ?? 0,
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
// 仅用于异步段（同步段 fc = N·f_elec 严格整数比，不随机）。
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

// ---------- 分段（分级变频）----------
// 档位：async（f_elec < 首档 fFrom）→ sync N 分档 → square（f_elec ≥ squareFreq）。
// 纯函数目标档（无滞回），供控制器与测试使用。
export function stageForFreq(f, profile) {
    const p = normalizeProfile(profile);
    const stages = p.syncStages;
    if (!stages.length) return { mode: 'async', n: 0 };
    if (f < stages[0].fFrom) return { mode: 'async', n: 0 };
    if (f >= p.squareFreq) return { mode: 'square', n: 1 };
    for (let i = 0; i < stages.length; i++) {
        if (f < stages[i].fFrom) return { mode: 'sync', n: stages[i - 1].n };
    }
    return { mode: 'sync', n: stages[stages.length - 1].n };
}

// ---------- 变调制比（恒压频比，跨段连续）----------
// m(f)：异步段 mMin→首档 mFrom（线性）；各同步段 mFrom→mTo（线性，档边界连续）；
//       ≥squareFreq → 1.0。无 syncStages → 恒 1（旧行为）。
export function modulationIndex(f, profile) {
    const p = normalizeProfile(profile);
    const stages = p.syncStages;
    if (!stages.length) return 1;
    if (f <= 0) return p.mMin;
    if (f < stages[0].fFrom) {
        const s0 = stages[0];
        return p.mMin + (s0.mFrom - p.mMin) * (f / s0.fFrom);
    }
    for (let i = 0; i < stages.length; i++) {
        const s = stages[i];
        const fNext = i + 1 < stages.length ? stages[i + 1].fFrom : p.squareFreq;
        if (f < fNext) {
            const span = fNext - s.fFrom;
            const t = span > 0 ? (f - s.fFrom) / span : 0;
            return s.mFrom + (s.mTo - s.mFrom) * t;
        }
    }
    return 1;
}

// ---------- 档位载波频率（纯函数）----------
// async → asyncCarrier.freq(time)（无则 base）；sync → n·f；square → null（无载波）。
export function carrierFreqForStage(f, stage, profile, time = 0, asyncCarrier = null) {
    const p = normalizeProfile(profile);
    if (stage.mode === 'sync') return stage.n * f;
    if (stage.mode === 'async') return asyncCarrier ? asyncCarrier.freq(time) : p.async.base;
    return null;
}

// ---------- 分档切换控制器（有状态；过零切换 + 滞回 + fc 瞬时跳变）----------
// 模拟真实牵引：切换指令在基波电压过零（basePhase 跨 π 整数倍）时应用，
// 升档立即排队、降档受滞回（f < 当前档下界 - hysteresis 才允许）。
// 切到同步档时返回 phaseReset = n·basePhase（载波相位对齐新 N 网格）。
// 返回复用对象（热路径零分配），每次调用改写字段。
export function createStageController(profile) {
    const p = normalizeProfile(profile);
    const stages = p.syncStages;
    const hasStages = stages.length > 0;
    let current = -1;          // -1=async, 0..len-1=sync, len=square
    let pending = -2;          // -2=无待切换, 其他=目标档
    let lastZeroIndex = 0;     // 上次 floor(basePhase/π)
    const result = { mode: 'async', n: 0, m: 1, phaseReset: null };

    function targetIndex(f) {
        if (!hasStages) return -1;
        if (f < stages[0].fFrom) return -1;
        if (f >= p.squareFreq) return stages.length;
        for (let i = 0; i < stages.length; i++) {
            if (f < stages[i].fFrom) return i - 1;
        }
        return stages.length - 1;
    }

    function stageOf(idx) {
        // 直接写复用 result 对象（热路径零分配，勿返回新对象）
        if (idx === -1) { result.mode = 'async'; result.n = 0; return; }
        if (idx >= stages.length) { result.mode = 'square'; result.n = 1; return; }
        result.mode = 'sync'; result.n = stages[idx].n;
    }

    return {
        // 每样本调用：返回当前生效档 {mode,n,m,phaseReset}（复用对象，勿跨样本保存引用）
        step(f, basePhase) {
            if (!hasStages) {
                result.mode = 'async'; result.n = 0; result.m = 1; result.phaseReset = null;
                return result;
            }
            const target = targetIndex(f);
            // 滞回：降档仅当 f 低于当前档下界 - hysteresis 才放行
            let effective = target;
            if (target < current) {
                const lower = current <= 0 ? 0 : (current >= stages.length ? p.squareFreq : stages[current].fFrom);
                if (f >= lower - p.hysteresis) effective = current;
            }
            // 排队切换
            if (effective !== current && effective !== pending) pending = effective;
            // 过零应用
            const zi = Math.floor(basePhase / Math.PI);
            if (zi !== lastZeroIndex) {
                lastZeroIndex = zi;
                if (pending !== -2) {
                    if (pending !== -1) current = pending;
                    pending = -2;
                }
            }
            stageOf(current);
            result.m = hasStages ? modulationIndex(f, p) : 1;
            result.phaseReset = result.mode === 'sync' ? result.n * basePhase : null;
            return result;
        },
    };
}

// ---------- PCM 渲染（ASYNC/同步/方波 分段调制，线电压输出）----------
// state：静态 {speed, handle} 或 (tSec)=>({speed, handle})（profile 须恒定，取入参）。
// 逐样本：频率映射 → 分档控制器（滞回+过零切换）→ 调制比 → 相位累加（相位连续、fc 瞬时跳变）
//   → async: 固定载波+随机抖动 / sync: fc=N·f_elec（相位对齐） / square: 180°方波（无载波）
//   → 线电压 → ×激励。
// 无 syncStages 时退化为旧行为（async 固定载波 + m=1）。
export function renderPcm({ profile, state, sampleRate = 48000, numSamples, seed = 1, carrierWave }) {
    const p = normalizeProfile(profile);
    const rng = createRng(seed);
    const asyncCarrier = createCarrierRandomizer(p.async, rng);
    const wave = (carrierWave ?? p.async.wave ?? 'Triangle') === 'Saw' ? saw : triangle;
    const hasStages = p.syncStages.length > 0;
    const controller = hasStages ? createStageController(p) : null;
    const out = new Float32Array(numSamples);
    let basePhase = 0;
    let carrierPhase = 0;

    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const s = typeof state === 'function' ? state(t) : state;
        const freq = s.speed <= p.minSpeed ? 0 : p.freqScale * s.speed + p.slipByHandle * s.handle;
        const exc = getExcitation(p, s);
        const f = Math.max(0, freq);

        basePhase += (TWO_PI * f) / sampleRate;

        let mode = 'async';
        let n = 0;
        let m = 1;
        let phaseReset = null;
        if (controller) {
            const st = controller.step(f, basePhase);
            mode = st.mode; n = st.n; m = st.m; phaseReset = st.phaseReset;
        } else {
            m = modulationIndex(f, p);
        }

        // 载波相位推进（同步段 fc=N·f 瞬时跳变；异步段随机抖动）
        if (mode === 'async') {
            carrierPhase += (TWO_PI * asyncCarrier.freq(t)) / sampleRate;
        } else if (mode === 'sync') {
            carrierPhase += (TWO_PI * n * f) / sampleRate;
        }
        if (phaseReset !== null) carrierPhase = phaseReset;

        let u, v;
        if (mode === 'square') {
            // 180° 方波：无载波，每半基波周期一次开关，相电压 {0,2}，线电压 ∈ {-1,0,1}
            u = sine(basePhase) >= 0 ? 2 : 0;
            v = sine(basePhase - TWO_PI / 3) >= 0 ? 2 : 0;
        } else {
            const cw = wave(carrierPhase);
            const baseU = sine(basePhase) * m;      // 基波幅度 × 调制比
            const baseV = sine(basePhase - TWO_PI / 3) * m;
            u = modulateSignal(baseU, cw) * 2;      // {0, 2} 两电平相电压
            v = modulateSignal(baseV, cw) * 2;
        }
        out[i] = ((u - v) / 2) * exc;               // 线电压，乘激励
    }
    return out;
}
