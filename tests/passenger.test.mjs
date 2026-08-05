// passenger.js 纯函数单测：generatePassengerComment 各分支（node:test，无 DOM 依赖）
// 运行：npm test（= node --test tests/）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePassengerComment } from '../src/game/passenger.js';

// 未通过停靠
test('未通过：ATC 失误', () => {
    assert.equal(generatePassengerComment(2, 1, 10, 0, 0, false, true), 'ATC自动驾驶失误，乘客表示惊讶 😱 ');
});

test('未通过：达速跨站（偏差≥10 且 时间<8s）', () => {
    assert.equal(generatePassengerComment(12, 1, 5, 0, 0, false, false), '达速跨站？！😮 ');
});

test('未通过：偏差≥10 → 起飞', () => {
    assert.equal(generatePassengerComment(12, 1, 10, 0, 0, false, false), '师傅，您这是要起飞吗？ 😂 ');
});

test('未通过：偏差>5m / >2m / 其余', () => {
    assert.equal(generatePassengerComment(6, 1, 10, 0, 0, false, false), '师傅，我要在这里下车吗？😱');
    assert.equal(generatePassengerComment(3, 1, 10, 0, 0, false, false), '师傅，您这是开哪儿去了啊？😵');
    assert.equal(generatePassengerComment(1.5, 1, 10, 0, 0, false, false), '师傅，挤不出去啊 😅 ');
});

// 通过停靠
test('通过：ATC 完美执行（无附加句）', () => {
    // stopTime=15 非完美时间非快，maxDecel=1.5 非平滑 → 无追加
    assert.equal(generatePassengerComment(0.1, 1.5, 15, 0, 0, true, true), 'ATC自动驾驶完美执行，乘客表示很安心 🤖');
});

test('通过：精准 + 平稳 + 完美时间 → 优雅（含时间节奏追加）', () => {
    // 17s 为完美时间且偏差≤0.4 → 追加「时间节奏完美」
    assert.equal(generatePassengerComment(0.1, 0.5, 17, 2, 0, true, false),
        '优雅，太优雅了！ 👏 时间节奏完美，老司机稳如泰山！ ⏱️ ');
});

test('通过：精准 + 平稳（非完美时间）', () => {
    assert.equal(generatePassengerComment(0.1, 0.5, 15, 2, 0, true, false), '精准而平稳的停靠！ 😊 ');
});

test('通过：精准 + 抖动', () => {
    assert.equal(generatePassengerComment(0.1, 1.6, 15, 13, 0, true, false), '豪意值拉满的停车 🤪 ');
});

test('通过：精准（默认）', () => {
    assert.equal(generatePassengerComment(0.1, 1.5, 15, 0, 0, true, false), '先生，您准得像机器一样 🤖 ');
});

test('通过：偏差≤0.6 + 平稳', () => {
    assert.equal(generatePassengerComment(0.5, 0.5, 15, 2, 0, true, false), '一般般 👍  ');
});

test('通过：偏差≤0.6 默认（含闪电进站追加）', () => {
    // stopTime=13 < 14 → isFast → 追加「闪电进站」
    assert.equal(generatePassengerComment(0.5, 1.5, 13, 0, 0, true, false),
        '寻常的停靠，寻常的生活 🏙️  闪电进站！ ⚡');
});

test('通过：偏差≤0.6 默认（含点刹追加）', () => {
    // brakeCount>4 且 偏差≤0.3 → 追加「点刹」
    assert.equal(generatePassengerComment(0.2, 1.5, 15, 0, 5, true, false),
        '寻常的停靠，寻常的生活 🏙️ 点刹摇啊摇，摇到外婆桥 😵 ');
});

test('通过：0.6<偏差≤0.8 默认', () => {
    assert.equal(generatePassengerComment(0.7, 1.5, 15, 0, 0, true, false), '只能说能下车 😅 ');
});

test('通过：0.8<偏差≤1.0', () => {
    assert.equal(generatePassengerComment(0.9, 1.5, 15, 0, 0, true, false), '极限！这在给乘客练瑜伽？ 🧘 ');
});
