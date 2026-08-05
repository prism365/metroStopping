// verify-physics.mjs — 零依赖 Node 回归脚本
// 对拍「重构后 physics.js」与「重构前旧内联逻辑」，验证严格行为等价。
// 运行：node scripts/verify-physics.mjs
// 说明：仓库根 package.json 声明 "type": "module"，Node 可直接 import src/game/*.js（均为纯 ESM，无 DOM 依赖）。
import {
    BASE_TRACTION_ACCEL,
    BASE_BRAKE_ACCEL,
    BASE_FRICTION_DECEL,
    MAX_PLAYER_HANDLE,
    PLATFORM_START,
    PLATFORM_END,
    TARGET_HEAD_POS,
    MIN_SPEED,
    VEHICLES,
} from '../src/game/data.js';
import { computeAcceleration, integrate, evaluateTermination } from '../src/game/physics.js';
import { smoothHandle, getManualRate } from '../src/game/control.js';
import { recordAccel, recordEntry } from '../src/game/stats.js';
import { Environment } from '../src/game/environment.js';
import { ATCController } from '../src/game/atc.js';

// ---------- 断言 ----------
let failures = 0;
function assert(cond, msg) {
    if (!cond) {
        failures++;
        console.error('  ✗ ' + msg);
    }
}

// ---------- 可复现 PRNG（mulberry32）----------
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------- 参考实现：重构前 physics.js 旧内联逻辑（硬编码原值，独立于新常量）----------
function refComputeAcceleration({ handle, speed, vehicle, env }) {
    let accel = 0;
    const trac = handle > 0 ? handle : 0;
    const brake = handle < 0 ? -handle : 0;
    const tracFactor = vehicle.tractionFactor || 1.0;
    const brakeFactor = vehicle.brakeFactor || 1.0;
    if (trac > 0) accel += trac * BASE_TRACTION_ACCEL * tracFactor;
    if (brake > 0) {
        const speedFactor = Math.min(1.0, speed / 15.0);
        const brakeAccel = brake * BASE_BRAKE_ACCEL * brakeFactor * (0.5 + 0.5 * speedFactor);
        accel -= brakeAccel;
    }
    const frictionDecel = BASE_FRICTION_DECEL * (vehicle.frictionFactor || 1.0);
    accel -= env.airDrag;
    if (speed > 0.001) accel -= frictionDecel;
    else if (speed < -0.001) accel += frictionDecel;
    if (env.totalGradient !== 0) accel -= 9.8 * env.totalGradient;
    if (env.totalWaterResist > 0) accel -= env.totalWaterResist * speed * speed;
    if (Math.abs(speed) < 0.001 && accel < 0) accel = 0;
    accel = Math.min(2.0, Math.max(-2.0, accel));
    return accel;
}

function refEvaluateTermination({ pos, speed, stats, dt }) {
    if (pos > PLATFORM_END + 10) {
        return { ended: true, reason: 'overshoot', deviation: pos - TARGET_HEAD_POS };
    }
    const deviation = pos - TARGET_HEAD_POS;
    stats.deviation = deviation;
    if (Math.abs(speed) < MIN_SPEED) {
        stats.stopTimer += dt;
        if (stats.stopTimer >= 0.5) return { ended: true, reason: 'normal', deviation };
    } else {
        stats.stopTimer = 0;
    }
    let p = pos;
    if (p > PLATFORM_END + 50) p = PLATFORM_END + 50;
    if (p < -200) p = -200;
    return { ended: false, pos: p };
}

// 旧版一帧：激活判定在物理层（先置 active 再调 update，与重构前 physicsUpdate 一致）
function refStep(st, dt) {
    const vehicle = st.vehicle;
    const isATC = vehicle.isATC || false;
    let events = null;
    if (isATC && st.atc && !st.atc.active && st.atc.shouldActivate(st.pos)) {
        st.atc.active = true;
        events = { atcActivated: true };
    }
    const atcEngaged = isATC && !!st.atc && st.atc.active;
    const env = st.env.update({ pos: st.pos, speed: st.speed, gameTime: st.gameTime });
    st.windSpeed = env.windSpeed;
    if (atcEngaged) {
        const cmd = st.atc.update({ pos: st.pos, speed: st.speed, dt, env });
        st.handle = smoothHandle({ current: st.handle, target: cmd.targetHandle, dt, maxAbs: st.atc.maxHandle, getRate: () => st.atc.handleRate });
    } else if (!isATC) {
        const prevHandle = st.handle;
        st.handle = smoothHandle({ current: st.handle, target: st.targetHandle, dt, maxAbs: MAX_PLAYER_HANDLE, getRate: getManualRate });
        if (prevHandle < 0 && st.handle >= 0) {
            st.didRelease = true;
            st.lastReleaseTime = st.gameTime;
            st.lastReleasePos = st.pos;
            st.lastReleaseSpeed = st.speed;
        }
    }
    const accel = refComputeAcceleration({ handle: st.handle, speed: st.speed, vehicle, env });
    const maxSpeed = vehicle.maxSpeed || 28.0;
    if (st.speed < 0) st.speed = 0;
    st.currentAccel = accel;
    if (accel < 0 && st.speed > 0.1) {
        const decel = -accel;
        if (decel > st.maxDecel) st.maxDecel = decel;
    }
    st.speed += accel * dt;
    if (st.speed < 0) st.speed = 0;
    if (st.speed > maxSpeed) st.speed = maxSpeed;
    st.pos += st.speed * dt;
    st.gameTime += dt;
    if (st.pos >= PLATFORM_START && st.entryTime === null) st.entryTime = st.gameTime;
    if (st.entryTime !== null) st.timer = st.gameTime - st.entryTime;
    const term = refEvaluateTermination({ pos: st.pos, speed: st.speed, stats: st, dt });
    if (term.ended) return { events, ended: true, reason: term.reason, deviation: term.deviation };
    st.pos = term.pos;
    return { events, ended: false };
}

// 新版一帧：激活判定内聚于 atc.js，编排与重构后 sim.js stepGame 一致（统计/积分走生产纯函数）
function newStep(st, dt) {
    const vehicle = st.vehicle;
    const isATC = vehicle.isATC || false;
    let events = null;
    const env = st.env.update({ pos: st.pos, speed: st.speed, gameTime: st.gameTime });
    st.windSpeed = env.windSpeed;
    if (isATC && st.atc) {
        const cmd = st.atc.update({ pos: st.pos, speed: st.speed, dt, env });
        if (cmd) {
            if (cmd.atcActivated) events = { atcActivated: true };
            st.handle = smoothHandle({ current: st.handle, target: cmd.targetHandle, dt, maxAbs: st.atc.maxHandle, getRate: () => st.atc.handleRate });
        }
    } else if (!isATC) {
        const prevHandle = st.handle;
        st.handle = smoothHandle({ current: st.handle, target: st.targetHandle, dt, maxAbs: MAX_PLAYER_HANDLE, getRate: getManualRate });
        if (prevHandle < 0 && st.handle >= 0) {
            st.didRelease = true;
            st.lastReleaseTime = st.gameTime;
            st.lastReleasePos = st.pos;
            st.lastReleaseSpeed = st.speed;
        }
    }
    const accel = computeAcceleration({ handle: st.handle, speed: st.speed, vehicle, env });
    const maxSpeed = vehicle.maxSpeed || 28.0;
    if (st.speed < 0) st.speed = 0;
    recordAccel(st, accel, st.speed);
    const stepped = integrate({ pos: st.pos, speed: st.speed, accel, dt, maxSpeed });
    st.pos = stepped.pos;
    st.speed = stepped.speed;
    st.gameTime += dt;
    recordEntry(st, st.pos, st.gameTime);
    const term = evaluateTermination({ pos: st.pos, speed: st.speed, dt, stopTimer: st.stopTimer });
    st.stopTimer = term.stopTimer;
    if (term.reason !== 'overshoot') st.deviation = term.deviation; // 镜像 sim.js：冲标帧不发布 deviation
    if (term.ended) return { events, ended: true, reason: term.reason, deviation: term.deviation };
    st.pos = term.pos;
    return { events, ended: false };
}

// ---------- 对拍 1：computeAcceleration 随机输入扫描 ----------
function testComputeAccelerationSweep() {
    console.log('对拍 1：computeAcceleration 随机输入扫描');
    const ids = Object.keys(VEHICLES);
    const rand = mulberry32(20260805);
    for (let i = 0; i < 200000; i++) {
        const handle = rand() * 10 - 5;
        const speed = rand() * 35;
        const vehicle = VEHICLES[ids[Math.floor(rand() * ids.length)]];
        const env = {
            airDrag: rand() * 0.5,
            totalGradient: rand() < 0.3 ? 0 : (rand() * 0.08 - 0.04),
            totalWaterResist: rand() < 0.5 ? rand() * 0.02 : 0,
        };
        const old = refComputeAcceleration({ handle, speed, vehicle, env });
        const neo = computeAcceleration({ handle, speed, vehicle, env });
        assert(Math.abs(old - neo) < 1e-9,
            `i=${i} handle=${handle.toFixed(3)} speed=${speed.toFixed(3)} veh=${vehicle.id} env=${JSON.stringify(env)} old=${old} new=${neo}`);
    }
}

// ---------- 对拍 2：evaluateTermination 随机输入扫描 ----------
function testEvaluateTerminationSweep() {
    console.log('对拍 2：evaluateTermination 随机输入扫描');
    const rand = mulberry32(775533);
    for (let i = 0; i < 100000; i++) {
        const pos = -250 + rand() * 400;
        const speed = rand() * 30;
        const dt = 0.016;
        // 旧版：接收 stats 可变对象并就地累积（refXxx 冻结）
        // 注意：初始 stopTimer 必须先保存，旧版调用会就地改写 stOld.stopTimer，
        // 新版需以同一初始值入参（纯函数不修改入参）。
        const initialStopTimer = rand() * 1.5;
        const stOld = { deviation: null, stopTimer: initialStopTimer };
        const old = refEvaluateTermination({ pos, speed, stats: stOld, dt });
        // 新版：纯函数，stopTimer 入参、返回值携带（调用方再写入 stats）
        const neo = evaluateTermination({ pos, speed, dt, stopTimer: initialStopTimer });
        assert(old.ended === neo.ended, `i=${i} ended: ${old.ended} vs ${neo.ended}`);
        if (old.ended) {
            assert(old.reason === neo.reason, `i=${i} reason: ${old.reason} vs ${neo.reason}`);
            assert(Math.abs(old.deviation - neo.deviation) < 1e-9, `i=${i} deviation: ${old.deviation} vs ${neo.deviation}`);
        } else {
            assert(Math.abs(old.pos - neo.pos) < 1e-9, `i=${i} pos: ${old.pos} vs ${neo.pos}`);
        }
        assert(Math.abs(neo.stopTimer - stOld.stopTimer) < 1e-9, `i=${i} stats.stopTimer 差异`);
        // 冲标帧旧语义不发布 deviation（由 endGame 统一写入），仅非冲标帧对比
        if (!old.ended || old.reason !== 'overshoot') {
            assert(Math.abs(neo.deviation - stOld.deviation) < 1e-9, `i=${i} stats.deviation 差异`);
        }
    }
}

// ---------- 对拍 3：ATC 激活时序单元测试 ----------
function testAtcActivation() {
    console.log('对拍 3：ATC 激活时序单元测试');
    const env0 = { totalGradient: 0, totalWaterResist: 0, windSpeed: 0, airDrag: 0 };
    const atc = new ATCController({ vehicle: VEHICLES.ATC, targetPos: TARGET_HEAD_POS });
    // 未到激活点（cruiseDist=150 → 激活点 pos >= -150）
    const r1 = atc.update({ pos: -200, speed: 15, dt: 0.016, env: env0 });
    assert(r1 === null, '未激活时应返回 null');
    assert(atc.active === false, '未激活时 active 应为 false');
    // 激活帧
    const r2 = atc.update({ pos: -149, speed: 15, dt: 0.016, env: env0 });
    assert(r2 !== null && r2.atcActivated === true, '激活帧应返回 atcActivated: true');
    assert(atc.active === true, '激活后 active 应为 true');
    assert(typeof r2.targetHandle === 'number', '激活帧应含 targetHandle');
    // 已激活帧
    const r3 = atc.update({ pos: -100, speed: 15, dt: 0.016, env: env0 });
    assert(r3 !== null && r3.atcActivated === false, '已激活帧 atcActivated 应为 false');
}

// ---------- 对拍 4：完整运行轨迹对比 ----------
const DT = 0.016;

function brakingCommand(st) {
    if (st.pos > PLATFORM_START - 20) {
        if (st.speed > 0.5) return -5;
        if (st.speed < -0.5) return 5;
        return 0;
    }
    if (st.speed < 18) return 5;
    return 0;
}

function snapshot(st, events) {
    return {
        pos: st.pos, speed: st.speed, handle: st.handle,
        windSpeed: st.windSpeed, currentAccel: st.currentAccel,
        maxDecel: st.maxDecel, didRelease: st.didRelease,
        entryTime: st.entryTime, timer: st.timer,
        deviation: st.deviation, stopTimer: st.stopTimer,
        events: events ? { atcActivated: !!events.atcActivated } : null,
    };
}

const NUMERIC_KEYS = ['pos', 'speed', 'handle', 'windSpeed', 'currentAccel', 'maxDecel', 'stopTimer', 'timer'];
const NULLABLE_KEYS = ['entryTime', 'deviation'];

function compareTraces(name, refTrace, newTrace, refEnd, newEnd) {
    if (refTrace.length !== newTrace.length) {
        assert(false, `${name}: 帧数不一致 ref=${refTrace.length} new=${newTrace.length}`);
        return;
    }
    for (let i = 0; i < refTrace.length; i++) {
        const a = refTrace[i];
        const b = newTrace[i];
        for (const k of NUMERIC_KEYS) {
            assert(Math.abs(a[k] - b[k]) < 1e-9, `${name} 帧${i} ${k}: ${a[k]} vs ${b[k]}`);
        }
        for (const k of NULLABLE_KEYS) {
            if (a[k] === null || b[k] === null) {
                assert(a[k] === b[k], `${name} 帧${i} ${k}: ${a[k]} vs ${b[k]}`);
            } else {
                assert(Math.abs(a[k] - b[k]) < 1e-9, `${name} 帧${i} ${k}: ${a[k]} vs ${b[k]}`);
            }
        }
        assert(a.didRelease === b.didRelease, `${name} 帧${i} didRelease: ${a.didRelease} vs ${b.didRelease}`);
        const ea = a.events;
        const eb = b.events;
        assert(!!ea === !!eb, `${name} 帧${i} 事件: ${JSON.stringify(ea)} vs ${JSON.stringify(eb)}`);
        if (ea && eb) assert(ea.atcActivated === eb.atcActivated, `${name} 帧${i} atcActivated: ${ea.atcActivated} vs ${eb.atcActivated}`);
    }
    assert(JSON.stringify(refEnd) === JSON.stringify(newEnd), `${name}: 终局 ref=${JSON.stringify(refEnd)} new=${JSON.stringify(newEnd)}`);
    if (refTrace.length > 0) {
        assert(refTrace[refTrace.length - 1].pos > 0, `${name}: 运行未推进（输入序列可能无效）`);
    }
}

function runScenario({ name, vehicleId, zones, frames, seed, command }) {
    const vehicle = VEHICLES[vehicleId];
    const makeState = () => ({
        pos: -100, speed: 15.0, handle: 0, targetHandle: 0, gameTime: 0,
        windSpeed: 0, currentAccel: 0, maxDecel: 0, didRelease: false,
        lastReleaseTime: null, lastReleasePos: null, lastReleaseSpeed: null,
        stopTimer: 0, entryTime: null, timer: 0, deviation: null, vehicle,
    });

    // 旧版运行
    const refSt = makeState();
    refSt.env = new Environment({ zones, vehicle });
    refSt.atc = vehicle.isATC ? new ATCController({ vehicle, targetPos: TARGET_HEAD_POS }) : null;
    Math.random = mulberry32(seed);
    const refTrace = [];
    let refEnd = null;
    for (let f = 0; f < frames; f++) {
        refSt.targetHandle = command(refSt);
        const res = refStep(refSt, DT);
        refTrace.push(snapshot(refSt, res.events));
        if (res.ended) {
            refEnd = { reason: res.reason, deviation: res.deviation };
            break;
        }
    }

    // 新版运行（同一 seed，保证环境随机序列一致）
    const newSt = makeState();
    newSt.env = new Environment({ zones, vehicle });
    newSt.atc = vehicle.isATC ? new ATCController({ vehicle, targetPos: TARGET_HEAD_POS }) : null;
    Math.random = mulberry32(seed);
    const newTrace = [];
    let newEnd = null;
    for (let f = 0; f < frames; f++) {
        newSt.targetHandle = command(newSt);
        const res = newStep(newSt, DT);
        newTrace.push(snapshot(newSt, res.events));
        if (res.ended) {
            newEnd = { reason: res.reason, deviation: res.deviation };
            break;
        }
    }

    compareTraces(name, refTrace, newTrace, refEnd, newEnd);
}

function testFullRun() {
    console.log('对拍 4：完整运行轨迹对比');
    runScenario({
        name: '训练场(STANDARD, 平地)',
        vehicleId: 'STANDARD', zones: [], frames: 4000, seed: 101,
        command: brakingCommand,
    });
    runScenario({
        name: '上坡(ACCEL, 3%坡)',
        vehicleId: 'ACCEL', zones: [{ start: -80, end: -10, type: 'gradient', value: 0.03 }], frames: 4000, seed: 202,
        command: brakingCommand,
    });
    runScenario({
        name: '积水+风(PERFORMANCE)',
        vehicleId: 'PERFORMANCE', zones: [
            { start: -60, end: -5, type: 'water', value: 0.008 },
            { start: -80, end: -20, type: 'wind' },
        ], frames: 4000, seed: 303,
        command: brakingCommand,
    });
    runScenario({
        name: 'ATC(全地形+风)',
        vehicleId: 'ATC', zones: [
            { start: -80, end: -40, type: 'gradient', value: 0.02 },
            { start: -40, end: -5, type: 'gradient', value: -0.02 },
            { start: -70, end: -15, type: 'water', value: 0.005 },
            { start: -80, end: -20, type: 'wind' },
        ], frames: 4000, seed: 404,
        command: brakingCommand,
    });
}

// ---------- 主流程 ----------
testComputeAccelerationSweep();
testEvaluateTerminationSweep();
testAtcActivation();
testFullRun();

if (failures === 0) {
    console.log('✅ 全部对拍通过：重构前后行为等价');
} else {
    console.error(`❌ ${failures} 处断言失败`);
    process.exit(1);
}
