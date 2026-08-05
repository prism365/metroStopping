// scoring.js 纯函数单测：evaluateStopMetrics / computeResult（node:test，无 DOM 依赖）
// 运行：npm test（= node --test tests/）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStopMetrics, computeResult } from '../src/game/scoring.js';

test('evaluateStopMetrics：平滑判定边界（maxDecel<1 且 handleChanges<=4）', () => {
    assert.equal(evaluateStopMetrics(0.9, 16, 4).isSmooth, true);
    assert.equal(evaluateStopMetrics(1.0, 16, 4).isSmooth, false); // maxDecel 不 < 1
    assert.equal(evaluateStopMetrics(0.9, 16, 5).isSmooth, false); // changes 不 <= 4
});

test('evaluateStopMetrics：急刹/抖动/快慢/完美时间边界', () => {
    assert.equal(evaluateStopMetrics(2.1, 16, 0).isHardBrake, true);
    assert.equal(evaluateStopMetrics(2.0, 16, 0).isHardBrake, false);
    assert.equal(evaluateStopMetrics(1.6, 16, 13).isJerky, true);
    assert.equal(evaluateStopMetrics(1.5, 16, 13).isJerky, false); // maxDecel 不 > 1.5
    assert.equal(evaluateStopMetrics(1.6, 16, 12).isJerky, false); // changes 不 > 12
    assert.equal(evaluateStopMetrics(1.0, 20.1, 0).isTooSlow, true);
    assert.equal(evaluateStopMetrics(1.0, 20.0, 0).isTooSlow, false);
    assert.equal(evaluateStopMetrics(1.0, 13.9, 0).isFast, true);
    assert.equal(evaluateStopMetrics(1.0, 14.0, 0).isFast, false);
    assert.equal(evaluateStopMetrics(1.0, 15.5, 0).isPerfectTime, true);
    assert.equal(evaluateStopMetrics(1.0, 18.5, 0).isPerfectTime, true);
    assert.equal(evaluateStopMetrics(1.0, 15.4, 0).isPerfectTime, false);
    assert.equal(evaluateStopMetrics(1.0, 18.6, 0).isPerfectTime, false);
});

test('computeResult：冲标 = 0 分，失败', () => {
    const r = computeResult({ deviation: 3, stopTime: 10, maxDecel: 1, handleChanges: 0, reason: 'overshoot' });
    assert.equal(r.score, 0);
    assert.equal(r.isPass, false);
    assert.equal(r.label, '冲出站台');
    assert.equal(r.icon, '🚀');
    assert.equal(r.detail, '列车冲出站台，请重新驾驶！');
});

test('computeResult：偏差超 1m 停靠失败，分数随偏差下降且下限 0', () => {
    const r = computeResult({ deviation: 2.0, stopTime: 16, maxDecel: 1, handleChanges: 0, reason: 'normal' });
    assert.equal(r.isPass, false);
    assert.equal(r.score, 40); // floor(60 - (2-1)*20)
    assert.equal(r.label, '停靠失败');
    const r2 = computeResult({ deviation: 5.0, stopTime: 16, maxDecel: 1, handleChanges: 0, reason: 'normal' });
    assert.equal(r2.score, 0); // 负分取 0
});

test('computeResult：完美停靠 + 平稳 + 完美时间 → 封顶 100', () => {
    const r = computeResult({ deviation: 0.1, stopTime: 17, maxDecel: 0.5, handleChanges: 2, reason: 'normal' });
    assert.equal(r.isPass, true);
    assert.equal(r.score, 100); // 95 + 8 = 103 → clamp 100
    assert.equal(r.label, '完美停靠');
    assert.equal(r.icon, '🌟');
});

test('computeResult：偏差 1.0 恰好合格 → 基础分 50 + 完美时间加成 4', () => {
    const r = computeResult({ deviation: 1.0, stopTime: 16, maxDecel: 1.5, handleChanges: 0, reason: 'normal' });
    assert.equal(r.isPass, true);
    assert.equal(r.score, 54);
    assert.equal(r.label, '停靠成功');
    assert.equal(r.icon, '✅');
});

test('computeResult：良好偏差带 → 优秀停靠', () => {
    const r = computeResult({ deviation: 0.3, stopTime: 15, maxDecel: 1.5, handleChanges: 0, reason: 'normal' });
    assert.equal(r.score, 80);
    assert.equal(r.label, '优秀停靠');
});

test('computeResult：及格偏差带 → 良好停靠', () => {
    const r = computeResult({ deviation: 0.5, stopTime: 15, maxDecel: 1.0, handleChanges: 0, reason: 'normal' });
    assert.equal(r.score, 65);
    assert.equal(r.label, '良好停靠');
});
