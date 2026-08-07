// settings.js 单测：默认值 / 无 key 老用户兼容 / 损坏 JSON / round-trip / resetToDefaults
// 运行：npm test（= node --test tests/unit/）
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

import { settings, DEFAULT_SETTINGS, loadSettings, saveSettings, resetToDefaults } from '../../src/game/settings.js';

// 用例间重置单例（settings 为模块级共享状态）
beforeEach(() => {
    store.clear();
    resetToDefaults();
});

test('无 key（老用户）：loadSettings 回退默认值', () => {
    loadSettings();
    assert.deepEqual({ ...settings }, DEFAULT_SETTINGS);
});

test('保存后再加载：round-trip 一致', () => {
    settings.soundEnabled = false;
    settings.postEnabled = false;
    settings.volume = 30;
    saveSettings();
    loadSettings();
    assert.equal(settings.soundEnabled, false);
    assert.equal(settings.postEnabled, false);
    assert.equal(settings.volume, 30);
});

test('损坏 JSON：回退默认值且不抛错', () => {
    store.set('trainSettings', '{oops');
    loadSettings();
    assert.deepEqual({ ...settings }, DEFAULT_SETTINGS);
});

test('部分字段缺失：仅回退缺失字段（向前兼容）', () => {
    store.set('trainSettings', JSON.stringify({ volume: 20 }));
    loadSettings();
    assert.equal(settings.volume, 20);
    assert.equal(settings.soundEnabled, true);
    assert.equal(settings.postEnabled, true);
});

test('字段类型不匹配：回退默认', () => {
    store.set('trainSettings', JSON.stringify({ soundEnabled: 'yes', volume: 'loud' }));
    loadSettings();
    assert.equal(settings.soundEnabled, true);
    assert.equal(settings.volume, 70);
});

test('resetToDefaults：对象回默认且移除 key', () => {
    settings.volume = 10;
    settings.soundEnabled = false;
    saveSettings();
    assert.equal(store.has('trainSettings'), true);
    resetToDefaults();
    assert.deepEqual({ ...settings }, DEFAULT_SETTINGS);
    assert.equal(store.has('trainSettings'), false);
});
