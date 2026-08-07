// tests/unit/vvvfPcm.test.mjs
// Feature 3：声核输出 PCM——值域 / 三电平 / 确定性 / 激励门控，纯时域断言。
import assert from 'node:assert/strict';
import { feature } from './gwt.js';
import { renderPcm, normalizeProfile } from '../../src/audio/vvvfCore.js';

const profile = normalizeProfile({ freqScale: 4.5, slipByHandle: 0.6, carrier: { base: 2000, randomRange: 0, randomInterval: 0 } });
const SR = 48000;

feature('F3 声核输出 PCM', {
    '输出为合法 PCM：长度正确、值域 [-1,1]、非全零': {
        given: () => ({
            profile, sampleRate: SR, numSamples: 4800, seed: 7,
            state: { speed: 10, handle: 3 },
        }),
        when: ({ profile, state, sampleRate, numSamples, seed }) =>
            renderPcm({ profile, state, sampleRate, numSamples, seed }),
        then: (ctx, out) => {
            assert.equal(out.length, ctx.numSamples);
            for (const s of out) {
                assert.ok(s >= -1 && s <= 1, `样本越界: ${s}`);
            }
            assert.ok(out.some((v) => v !== 0), '输出不应全零');
        },
    },
    '线电压三电平特征：输出仅含 {-1, 0, 1} 且波形随时间变化': {
        given: () => ({
            profile, sampleRate: SR, numSamples: 4800, seed: 7,
            state: { speed: 10, handle: 3 },
        }),
        when: ({ profile, state, sampleRate, numSamples, seed }) =>
            renderPcm({ profile, state, sampleRate, numSamples, seed }),
        then: (ctx, out) => {
            const levels = new Set(out);
            assert.ok([...levels].every((v) => v === -1 || v === 0 || v === 1), `出现非法电平: ${[...levels]}`);
            assert.ok(levels.size > 1, '不应是恒定电平');
            assert.ok(out.some((v, i) => i + 1 < out.length && v !== out[i + 1]), '波形应随时间切换');
        },
    },
    '同 seed 确定性：两次渲染逐样本一致': {
        given: () => ({
            profile, sampleRate: SR, numSamples: 4800, seed: 42,
            state: { speed: 10, handle: 3 },
        }),
        when: (ctx) => [
            renderPcm(ctx),
            renderPcm({ profile: ctx.profile, state: ctx.state, sampleRate: ctx.sampleRate, numSamples: ctx.numSamples, seed: ctx.seed }),
        ],
        then: (ctx, [a, b]) => {
            assert.deepEqual([...a], [...b]);
        },
    },
    '激励门控：惰行(handle==0) 持续发声（非静音，2026-08-07 去除惰行静音）': {
        given: () => ({
            profile, sampleRate: SR, numSamples: 4800, seed: 1,
            state: { speed: 10, handle: 0 },
        }),
        when: ({ profile, state, sampleRate, numSamples, seed }) =>
            renderPcm({ profile, state, sampleRate, numSamples, seed }),
        then: (ctx, out) => {
            assert.ok(out.some((v) => v !== 0), '惰行应持续发声（非静音）');
        },
    },
    '激励门控：停稳(speed==0) 输出全零': {
        given: () => ({
            profile, sampleRate: SR, numSamples: 4800, seed: 1,
            state: { speed: 0, handle: 5 },
        }),
        when: ({ profile, state, sampleRate, numSamples, seed }) =>
            renderPcm({ profile, state, sampleRate, numSamples, seed }),
        then: (ctx, out) => {
            assert.ok(out.every((v) => v === 0), '停稳应静音');
        },
    },
});
