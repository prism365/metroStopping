// src/audio/audioDriver.js
// 浏览器音频 IO 层：AudioContext / AudioWorklet 节点 / 后处理节点链 / 生命周期。
// 不放算法：逐样本合成在 vvvfWorklet，频率映射在 vvvfCore，滤波/IR/限幅用浏览器原生节点。
// 生命周期（需求 R6）：仅游玩时有声；菜单/结算/后台标签页挂起；ATC 也有声。
import { freqFromState, normalizeProfile } from './vvvfCore.js';
import { syntheticBodyIr } from './vvvfPost.js';

let ctx = null;
let workletNode = null;
let compressor = null;
let master = null;
let currentProfile = null;
let audioActive = false;   // 游玩态（是否驱动发声）

// e2e 调试钩子（Playwright 只读断言用；main.js 挂到 window）
export const __audioDebug = () => ({
    contextState: ctx ? ctx.state : 'none',
    audioActive,
    carrierBase: currentProfile ? currentProfile.carrier.base : null,
});

// ---------- 惰性初始化（主菜单空闲时预加载，避免首局卡顿）----------
export async function init() {
    if (ctx) return;
    try {
        ctx = new AudioContext();
    } catch {
        ctx = null;
        return;
    }
    await ctx.audioWorklet.addModule(new URL('./vvvfWorklet.js', import.meta.url));
    workletNode = new AudioWorkletNode(ctx, 'vvvf-sound');

    // 后处理链：worklet → [biquads] → [convolver] → compressor → master → destination
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 20;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    master = ctx.createGain();
    master.gain.value = 0.9;
    compressor.connect(master);
    master.connect(ctx.destination);
    workletNode.connect(compressor);

    // 若 setProfile 先于 init 完成，补发配置
    if (currentProfile) {
        workletNode.port.postMessage({ carrier: currentProfile.carrier, seed: 1 });
        rebuildPostChain();
    }
}

// ---------- 后处理链重建（车辆切换 / 配置变化时调用）----------
// 防御：音频节点配置失败绝不影响游戏主流程（try/catch 吞掉并回到直达链）。
function rebuildPostChain() {
    if (!ctx || !workletNode) return;
    try {
        workletNode.disconnect();
        let prev = workletNode;
        for (const f of currentProfile.filters ?? []) {
            const bq = ctx.createBiquadFilter();
            bq.type = f.type;                          // 'lowpass'|'highpass'|'peaking'|'notch'
            bq.frequency.value = f.freq ?? 1000;
            bq.Q.value = f.q ?? 0.707;
            if (f.gain !== undefined) bq.gain.value = f.gain;
            prev.connect(bq);
            prev = bq;
        }
        if (currentProfile.ir) {
            const conv = ctx.createConvolver();
            if (currentProfile.ir === 'synthetic') {
                const ir = syntheticBodyIr(ctx.sampleRate);
                const buf = ctx.createBuffer(1, ir.length, ctx.sampleRate);
                buf.getChannelData(0).set(ir);
                conv.buffer = buf;                     // ConvolverNode.buffer 须为 AudioBuffer
            } else {
                conv.buffer = currentProfile.ir;
            }
            prev.connect(conv);
            prev = conv;
        }
        prev.connect(compressor);
        if (master) master.gain.value = Math.pow(10, (currentProfile.volume ?? 0) / 20) * 0.9;
    } catch (err) {
        // 音频后处理失败不阻断游戏：回退到 worklet → compressor 直达
        console.warn('[audio] 后处理链配置失败，已回退直达链:', err);
        try { workletNode.disconnect(); } catch { /* noop */ }
        workletNode.connect(compressor);
    }
}

// ---------- 车辆音色切换 ----------
export function setProfile(profile) {
    currentProfile = normalizeProfile(profile ?? {});
    if (ctx && workletNode) {
        workletNode.port.postMessage({ carrier: currentProfile.carrier, seed: 1 });
        rebuildPostChain();
    }
}

// ---------- 每帧同步（主线程只发低频控制量，平滑在音频线程）----------
export function update({ speed, handle, running }) {
    if (!workletNode) return;
    audioActive = !!running;
    if (!audioActive) {
        workletNode.port.postMessage({ freq: 0, excitation: 0 });
        return;
    }
    const { freq, excitation } = freqFromState({ speed, handle, profile: currentProfile });
    workletNode.port.postMessage({ freq, excitation });
}

// ---------- 生命周期 ----------
export async function start() {
    if (!ctx) return;
    if (ctx.state !== 'running') await ctx.resume();
}

export async function stop() {
    if (!ctx) return;
    if (ctx.state === 'running') await ctx.suspend();
}

export function dispose() {
    if (ctx) {
        ctx.close().catch(() => {});
        ctx = null;
        workletNode = null;
    }
}

// 手势解锁（移动端 autoplay 策略）：游玩中任意交互时 resume
export async function resumeFromGesture() {
    if (!ctx || !audioActive) return;
    if (ctx.state !== 'running') await ctx.resume();
}

// 后台标签页挂起/恢复（visibilitychange 由 main.js 注册）
export function handleVisibilityChange(hidden) {
    if (hidden) {
        stop();
    } else if (audioActive) {
        start();
    }
}
