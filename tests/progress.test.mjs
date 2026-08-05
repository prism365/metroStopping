// progress.js 单测：成就解锁 / 关卡与车辆解锁 / 星级（需要 mock localStorage）
// 运行：npm test（= node --test tests/）
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- localStorage mock（storage.js 仅在函数内引用 localStorage，导入本身无 DOM 依赖）----
const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
};

import { playerProgress, achievements } from '../src/game/state.js';
import { checkAchievements, completeLevel, isLevelUnlocked, isVehicleUnlocked } from '../src/game/progress.js';

// 用例间重置单例（achievements.map / playerProgress 为模块级共享状态）
beforeEach(() => {
    store.clear();
    for (const key of Object.keys(achievements.map)) achievements.map[key].unlocked = false;
    achievements.gameCount = 0;
    achievements.unlockedThisRun.length = 0;
    playerProgress.unlockedLevels = [0];
    playerProgress.currentLevel = 0;
    playerProgress.currentVehicle = 'STANDARD';
    playerProgress.unlockedVehicles = ['STANDARD'];
    playerProgress.levelStars = {};
});

// ---------- 成就 ----------
test('ATC 车辆不判定成就（且不计 gameCount）', () => {
    playerProgress.currentVehicle = 'ATC';
    const result = checkAchievements({ deviation: 0.1, maxDecel: 0.5, stopTime: 16.5, brakeCount: 1, handleChanges: 2, didRelease: false, releaseToStop: null });
    assert.deepEqual(result, []);
    assert.equal(achievements.gameCount, 0);
});

test('完美停靠解锁 precision/smooth/time_master/release/one_brake', () => {
    const data = {
        deviation: 0.1, maxDecel: 0.5, stopTime: 16.5,
        brakeCount: 1, handleChanges: 2,
        didRelease: true, releaseToStop: 1.0,
        lastReleasePos: 98.0, // 相对车头目标位（100m）偏移 2m ≤ 5m
        lastReleaseSpeed: 2.0,
    };
    const result = checkAchievements(data);
    const ids = result.map(a => a.id).sort();
    assert.deepEqual(ids, ['one_brake', 'precision', 'release', 'smooth', 'time_master']);
    assert.equal(achievements.gameCount, 1);
});

test('边界：偏差 0.16 不解锁 precision；maxDecel=1.0 不解锁 smooth', () => {
    const r = checkAchievements({ deviation: 0.16, maxDecel: 1.0, stopTime: 16.5, brakeCount: 1, handleChanges: 2, didRelease: false, releaseToStop: null });
    assert.ok(!r.some(a => a.id === 'precision'));
    assert.ok(!r.some(a => a.id === 'smooth'));
});

test('边界：stopTime 15.9 / 17.1 不解锁 time_master', () => {
    const r1 = checkAchievements({ deviation: 0.1, maxDecel: 0.5, stopTime: 15.9, brakeCount: 1, handleChanges: 2, didRelease: false, releaseToStop: null });
    assert.ok(!r1.some(a => a.id === 'time_master'));
    const r2 = checkAchievements({ deviation: 0.1, maxDecel: 0.5, stopTime: 17.1, brakeCount: 1, handleChanges: 2, didRelease: false, releaseToStop: null });
    assert.ok(!r2.some(a => a.id === 'time_master'));
});

test('缓解制动判定：releaseToStop 超 3s 不解锁 release', () => {
    const r = checkAchievements({ deviation: 0.1, maxDecel: 0.5, stopTime: 16.5, brakeCount: 1, handleChanges: 2, didRelease: true, releaseToStop: 3.5, lastReleasePos: 98, lastReleaseSpeed: 2 });
    assert.ok(!r.some(a => a.id === 'release'));
});

test('一把闸判定：brakeCount>1 不解锁 one_brake', () => {
    const r = checkAchievements({ deviation: 0.1, maxDecel: 0.5, stopTime: 16.5, brakeCount: 2, handleChanges: 2, didRelease: false, releaseToStop: null });
    assert.ok(!r.some(a => a.id === 'one_brake'));
});

test('老司机：gameCount 达 20 解锁 veteran', () => {
    achievements.gameCount = 19;
    const r = checkAchievements({ deviation: 0.1, maxDecel: 0.5, stopTime: 16.5, brakeCount: 1, handleChanges: 2, didRelease: false, releaseToStop: null });
    assert.ok(r.some(a => a.id === 'veteran'));
    assert.equal(achievements.gameCount, 20);
});

test('成就解锁只触发一次（重复判定不重复返回）', () => {
    const data = { deviation: 0.1, maxDecel: 0.5, stopTime: 16.5, brakeCount: 1, handleChanges: 2, didRelease: false, releaseToStop: null };
    const first = checkAchievements(data);
    const second = checkAchievements(data);
    assert.ok(first.length > 0);
    assert.equal(second.length, 0);
});

// ---------- 关卡 / 车辆 / 星级 ----------
test('completeLevel：记录最高星级并解锁下一关', () => {
    completeLevel(0, 85);
    assert.equal(playerProgress.levelStars[0], 85);
    assert.ok(isLevelUnlocked(1));
    completeLevel(0, 70); // 更低分数不覆盖
    assert.equal(playerProgress.levelStars[0], 85);
    completeLevel(0, 95);
    assert.equal(playerProgress.levelStars[0], 95);
});

test('completeLevel：按前置链解锁车辆与关卡', () => {
    playerProgress.unlockedLevels = [0, 1];
    completeLevel(1, 90);
    assert.ok(isVehicleUnlocked('ACCEL'));
    assert.ok(isLevelUnlocked(2));

    playerProgress.unlockedLevels = [0, 1, 2, 3, 4, 5, 6, 7];
    completeLevel(7, 100);
    assert.ok(isVehicleUnlocked('ATC'));
    assert.ok(isLevelUnlocked(8));
});

test('completeLevel：前置未满足不解锁下一关', () => {
    playerProgress.unlockedLevels = [];
    completeLevel(0, 90);
    assert.ok(!isLevelUnlocked(1)); // 关卡 1 前置 [0] 未满足
});

test('completeLevel：重复完成不重复解锁车辆/关卡', () => {
    playerProgress.unlockedLevels = [0, 1];
    completeLevel(1, 90);
    assert.equal(playerProgress.unlockedVehicles.filter(v => v === 'ACCEL').length, 1);
    completeLevel(1, 95);
    assert.equal(playerProgress.unlockedVehicles.filter(v => v === 'ACCEL').length, 1);
    assert.equal(playerProgress.unlockedLevels.filter(l => l === 2).length, 1);
});
