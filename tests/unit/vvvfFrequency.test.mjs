// tests/unit/vvvfFrequency.test.mjs
// Feature 1：频率映射（速度驱动 + 滑差）——纯时域/公式断言，不依赖 FFT。
import assert from 'node:assert/strict';
import { feature } from './gwt.js';
import { freqFromState, normalizeProfile } from '../../src/audio/vvvfCore.js';

const profile = normalizeProfile({ freqScale: 4.5, slipByHandle: 0.6 });

feature('F1 频率映射（速度驱动 + 滑差）', {
    '速度驱动基频：f_elec = freqScale·speed，且随速度单调递增': {
        given: () => ({ speed: 10, handle: 0, profile }),
        when: ({ speed, handle, profile }) => freqFromState({ speed, handle, profile }),
        then: (ctx, r) => {
            assert.equal(r.freq, 4.5 * ctx.speed);            // 45 Hz
            assert.equal(r.excitation, 1);                    // 惰行持续发声（2026-08-07 去除惰行静音）
            const faster = freqFromState({ speed: 15, handle: 0, profile: ctx.profile });
            assert.ok(faster.freq > r.freq, '更快速度应产生更高频率');
        },
    },
    '手柄产生滑差：牵引抬频、制动降频': {
        given: () => ({ speed: 10, handle: 5, profile }),
        when: ({ speed, handle, profile }) => freqFromState({ speed, handle, profile }),
        then: (ctx, r) => {
            assert.equal(r.freq, 45 + 0.6 * 5);               // 牵引：48 Hz
            assert.equal(r.excitation, 1);
            const brake = freqFromState({ speed: 10, handle: -5, profile: ctx.profile });
            assert.equal(brake.freq, 45 - 0.6 * 5);           // 制动：42 Hz
            assert.equal(brake.excitation, 1);
        },
    },
    '惰行：handle==0 且速度>0 → 持续发声（去除惰行静音）': {
        given: () => ({ speed: 10, handle: 0, profile }),
        when: ({ speed, handle, profile }) => freqFromState({ speed, handle, profile }),
        then: (ctx, r) => {
            assert.equal(r.freq, 45);                         // 频率仍在（物理上电机仍随转子转）
            assert.equal(r.excitation, 1);                    // 惰行持续发声
        },
    },
    '停稳：speed≤minSpeed → 频率与激励均归零': {
        given: () => ({ speed: 0, handle: 5, profile }),
        when: ({ speed, handle, profile }) => freqFromState({ speed, handle, profile }),
        then: (ctx, r) => {
            assert.equal(r.freq, 0);
            assert.equal(r.excitation, 0);
        },
    },
});
