// src/audio/vvvfWorklet.js
// AudioWorklet 处理器：逐样本比较器（VVVF 声核的浏览器实时宿主）。
// - 热路径零分配（无 new / 无数组创建；分档控制器复用对象）
// - 频率平滑在音频线程（一阶低通），避免主线程 60fps 控制跳变产生 zipper
// - 相位累加器保证相位连续
// 算法与 vvvfCore.renderPcm 一致（ASYNC/同步/方波 分段调制，线电压 U−V）。
// 消息协议：{ profile } 下发完整配置（async/syncStages/squareFreq/mMin/hysteresis），
//   { freq, excitation } 每帧控制量。
import { sine, triangle, saw, modulateSignal, createRng, createCarrierRandomizer, normalizeProfile, createStageController, TWO_PI } from './vvvfCore.js';

class VvvfSoundProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.freq = 0;
        this.targetFreq = 0;
        this.excitation = 0;
        this.smoothK = 0.0007;          // 一阶平滑系数（τ≈30ms @48k）
        this.basePhase = 0;
        this.carrierPhase = 0;
        this.wave = triangle;           // 载波波形（异步段）
        this.asyncCarrier = null;       // 异步段载波随机器
        this.controller = null;         // 分档切换控制器（有 syncStages 时）
        this.hasStages = false;
        this.p = null;                  // 归一化 profile
        this.sampleTime = 0;
        // VVVF 波形监视（开发人员选项）：环形缓冲 + 元信息（关闭时热路径零分配不变）
        this.monitor = false;
        this.monitorBuf = new Float32Array(1024);
        this.monitorIdx = 0;
        this.monitorFrame = 0;
        this.monitorOut = new Float32Array(512);
        this.metaF = 0;
        this.metaMode = 'async';
        this.metaN = 0;
        this.metaCf = 0;
        this.metaM = 1;
        this.port.onmessage = (e) => this.applyMessage(e.data);
    }

    applyMessage(d) {
        if (d.profile) {
            this.p = normalizeProfile(d.profile);
            this.hasStages = this.p.syncStages.length > 0;
            this.asyncCarrier = createCarrierRandomizer(this.p.async, createRng(d.seed ?? 1));
            this.wave = this.p.async.wave === 'Saw' ? saw : triangle;
            this.controller = this.hasStages ? createStageController(this.p) : null;
            this.port.postMessage({ ack: true });   // 配置确认（e2e 离线渲染前等待，规避投递竞态）
        }
        if (d.freq !== undefined) this.targetFreq = Math.max(0, d.freq);
        if (d.excitation !== undefined) this.excitation = Math.min(1, Math.max(0, d.excitation));
        if (d.smoothK !== undefined) this.smoothK = d.smoothK;
        if (d.monitor !== undefined) this.monitor = !!d.monitor;
    }

    process(inputs, outputs) {
        const ch = outputs[0] && outputs[0][0];
        if (!ch) return true;
        const n = ch.length;
        const dt = 1 / sampleRate;
        const mon = this.monitor;
        const buf = this.monitorBuf;
        let idx = this.monitorIdx;
        for (let i = 0; i < n; i++) {
            this.freq += (this.targetFreq - this.freq) * this.smoothK;
            const f = this.freq;
            this.basePhase += (TWO_PI * f) * dt;

            // 分档（滞回+过零切换，复用对象零分配）
            let mode = 'async';
            let nSync = 0;
            let m = 1;
            let phaseReset = null;
            if (this.controller) {
                const st = this.controller.step(f, this.basePhase);
                mode = st.mode; nSync = st.n; m = st.m; phaseReset = st.phaseReset;
            }

            // 载波相位推进（同步段 fc=N·f 瞬时跳变；异步段随机抖动）
            let cf = 0;
            if (mode === 'async') {
                cf = this.asyncCarrier ? this.asyncCarrier.freq(this.sampleTime) : 0;
                this.carrierPhase += (TWO_PI * cf) * dt;
            } else if (mode === 'sync') {
                cf = nSync * f;
                this.carrierPhase += (TWO_PI * cf) * dt;
            }
            if (phaseReset !== null) this.carrierPhase = phaseReset;

            let u, v;
            if (mode === 'square') {
                // 180° 方波：无载波，相电压 {0,2}，线电压 ∈ {-1,0,1}
                u = sine(this.basePhase) >= 0 ? 2 : 0;
                v = sine(this.basePhase - TWO_PI / 3) >= 0 ? 2 : 0;
            } else {
                const cw = this.wave(this.carrierPhase);
                const baseU = sine(this.basePhase) * m;      // 基波幅度 × 调制比
                const baseV = sine(this.basePhase - TWO_PI / 3) * m;
                u = modulateSignal(baseU, cw) * 2;          // {0, 2} 两电平相电压
                v = modulateSignal(baseV, cw) * 2;
            }
            ch[i] = ((u - v) / 2) * this.excitation;
            if (mon) {
                buf[idx++] = ch[i];
                if (idx >= buf.length) idx = 0;
                this.metaF = f; this.metaMode = mode; this.metaN = nSync; this.metaCf = cf; this.metaM = m;
            }
            this.sampleTime += dt;
        }
        if (mon) {
            this.monitorIdx = idx;
            if (++this.monitorFrame >= 4) {
                this.monitorFrame = 0;
                // 拷贝最近 512 采样（环形缓冲回绕）→ 回传主线程
                const out = this.monitorOut;
                const len = buf.length;
                const start = (idx - out.length + len) % len;
                for (let j = 0; j < out.length; j++) out[j] = buf[(start + j) % len];
                this.port.postMessage({
                    wave: out, freq: this.metaF, mode: this.metaMode,
                    n: this.metaN, carrierFreq: this.metaCf, m: this.metaM,
                });
            }
        }
        return true;
    }
}

registerProcessor('vvvf-sound', VvvfSoundProcessor);
