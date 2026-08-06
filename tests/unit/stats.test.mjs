// stats.js 纯函数单测：recordAccel / recordEntry（node:test，无 DOM 依赖）
// 运行：npm test（= node --test tests/unit/）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordAccel, recordEntry } from '../../src/game/stats.js';
import { MAX_DECEL_RECORD_SPEED, PLATFORM_START } from '../../src/game/data.js';

test('recordAccel：非减速只更新 currentAccel，不记录 maxDecel', () => {
    const s = { currentAccel: 0, maxDecel: 0 };
    recordAccel(s, 1.2, 20);
    assert.equal(s.currentAccel, 1.2);
    assert.equal(s.maxDecel, 0);
});

test('recordAccel：低速减速（speed ≤ 阈值）不记录 maxDecel', () => {
    const s = { currentAccel: 0, maxDecel: 0 };
    recordAccel(s, -0.5, MAX_DECEL_RECORD_SPEED); // 恰为阈值：需 speed > 阈值
    assert.equal(s.maxDecel, 0);
    recordAccel(s, -0.5, 0.05); // 低于阈值
    assert.equal(s.maxDecel, 0);
});

test('recordAccel：高速减速记录 maxDecel = -accel', () => {
    const s = { currentAccel: 0, maxDecel: 0 };
    recordAccel(s, -1.8, 20);
    assert.equal(s.currentAccel, -1.8);
    assert.equal(s.maxDecel, 1.8);
});

test('recordAccel：maxDecel 只增不减（保留历史最大）', () => {
    const s = { currentAccel: 0, maxDecel: 0 };
    recordAccel(s, -2.5, 20);
    recordAccel(s, -1.0, 20);
    recordAccel(s, -3.0, 20);
    assert.equal(s.maxDecel, 3.0);
});

test('recordEntry：未进入站台不记录 entryTime', () => {
    const s = { entryTime: null, timer: 0 };
    recordEntry(s, PLATFORM_START - 1, 5);
    assert.equal(s.entryTime, null);
    assert.equal(s.timer, 0);
});

test('recordEntry：首次越过站台起点记录 entryTime，timer 从 0 累计', () => {
    const s = { entryTime: null, timer: 0 };
    recordEntry(s, PLATFORM_START, 5.0);
    assert.equal(s.entryTime, 5.0);
    assert.equal(s.timer, 0);
    recordEntry(s, 10, 7.5);
    assert.equal(s.entryTime, 5.0); // 不再更新
    assert.equal(s.timer, 2.5);
});

test('recordEntry：entryTime 只记首次，后续仅更新 timer', () => {
    const s = { entryTime: 3, timer: 0 };
    recordEntry(s, 50, 10);
    assert.equal(s.entryTime, 3);
    assert.equal(s.timer, 7);
});
