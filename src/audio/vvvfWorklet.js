// src/audio/vvvfWorklet.js
// AudioWorklet 处理器：逐样本比较器（VVVF 声核的浏览器实时宿主）。
// - 热路径零分配（无 new / 无数组创建）
// - 频率平滑在音频线程（一阶低通），避免主线程 60fps 控制跳变产生 zipper
// - 相位累加器保证相位连续
// 算法与 vvvfCore.renderPcm 一致（线电压 U−V，ASYNC 随机载波调制）。
import { sine, triangle, saw, modulateSignal, createRng, createCarrierRandomizer, TWO_PI } from './vvvfCore.js';

class VvvfSoundProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.freq = 0;
        this.targetFreq = 0;
        this.excitation = 0;
        this.smoothK = 0.0007;          // 一阶平滑系数（τ≈30ms @48k）
        this.basePhase = 0;
        this.carrierPhase = 0;
        this.carrierWave = 'Triangle';
        this.carrier = null;
        this.sampleTime = 0;
        this.port.onmessage = (e) => this.applyMessage(e.data);
    }

    applyMessage(d) {
        if (d.carrier) {
            this.carrier = createCarrierRandomizer(d.carrier, createRng(d.seed ?? 1));
            this.carrierWave = d.carrier.wave ?? 'Triangle';
            this.port.postMessage({ ack: true });   // 配置确认（e2e 离线渲染前等待，规避投递竞态）
        }
        if (d.freq !== undefined) this.targetFreq = Math.max(0, d.freq);
        if (d.excitation !== undefined) this.excitation = Math.min(1, Math.max(0, d.excitation));
        if (d.smoothK !== undefined) this.smoothK = d.smoothK;
    }

    process(inputs, outputs) {
        const ch = outputs[0] && outputs[0][0];
        if (!ch) return true;
        const n = ch.length;
        const dt = 1 / sampleRate;
        const wave = this.carrierWave === 'Saw' ? saw : triangle;
        for (let i = 0; i < n; i++) {
            this.freq += (this.targetFreq - this.freq) * this.smoothK;
            const carrierFreq = this.carrier ? this.carrier.freq(this.sampleTime) : 0;
            this.basePhase += (TWO_PI * this.freq) * dt;
            this.carrierPhase += (TWO_PI * carrierFreq) * dt;
            const cw = wave(this.carrierPhase);
            const u = modulateSignal(sine(this.basePhase), cw) * 2;
            const v = modulateSignal(sine(this.basePhase - TWO_PI / 3), cw) * 2;
            ch[i] = ((u - v) / 2) * this.excitation;
            this.sampleTime += dt;
        }
        return true;
    }
}

registerProcessor('vvvf-sound', VvvfSoundProcessor);
