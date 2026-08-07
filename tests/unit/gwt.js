// tests/unit/gwt.js
// 轻量 BDD(GWT) 帮助函数：零依赖，配合 node --test 使用。
// 用法：
//   feature('F1 频率映射', {
//     '速度驱动基频': {
//       given: () => ({ speed: 10, handle: 0, profile }),
//       when: ({ speed, handle, profile }) => freqFromState({ speed, handle, profile }),
//       then: (ctx, result) => { assert.equal(result.freq, 45); },
//     },
//   });
// given/when/then 均可为同步或异步；given 也可直接给普通对象（非函数）。
import { test } from 'node:test';

export async function feature(name, scenarios) {
    await test(`Feature: ${name}`, async (t) => {
        for (const [title, def] of Object.entries(scenarios)) {
            await t.test(`Scenario: ${title}`, async () => {
                const ctx = typeof def.given === 'function' ? await def.given() : (def.given ?? {});
                const result = typeof def.when === 'function' ? await def.when(ctx) : def.when;
                await def.then(ctx, result);
            });
        }
    });
}
