// src/game/monitor.js
// VVVF 波形监视面板（开发人员选项）
// 纯 UI 模块：读取 audioDriver 回传的原始 PWM 波形绘制 + 面板拖拽/缩放 + 布局持久化。
// - 波形数据来自 worklet 音频线程（无后处理）；元信息含档位/频率/调制比。
// - 显示用相位锁定（基波零相位触发）+ 频率自适应窗口（固定 2 基波周期），波形稳定不抖动。
// - 画布背板动态对齐显示尺寸（含 DPR），消除拉伸变形。
// - 面板在 .canvas-wrapper 内绝对定位，默认右上角；拖动/缩放用 Pointer Events + 捕获。
// - 布局独立持久化（localStorage 'vvvfMonitorLayout'），不受「恢复默认设置」影响。
import { getLatestMeta, getSampleRate, readRollingWave } from '../audio/audioDriver.js';
import { computeScopeWindow } from './scopeMath.js';
import { vvvfMonitor, vvvfMonitorCanvas, vvvfMonitorInfo, vvvfMonitorHead, vvvfMonitorResize } from './dom.js';

const LAYOUT_KEY = 'vvvfMonitorLayout';
const MIN_W = 220;
const MIN_H = 90;
const ROLL_CAP = 8192;   // 与 audioDriver 滚动缓冲一致

const ctx = vvvfMonitorCanvas.getContext('2d');
const scratch = new Float32Array(ROLL_CAP);   // 滚动缓冲读取暂存

// ---------- 布局持久化 ----------
function loadLayout() {
    try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        if (!raw) return null;
        const l = JSON.parse(raw);
        if (typeof l.x !== 'number' || typeof l.y !== 'number' || typeof l.w !== 'number' || typeof l.h !== 'number') return null;
        return l;
    } catch { return null; }
}

function saveLayout() {
    try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({
            x: vvvfMonitor.offsetLeft,
            y: vvvfMonitor.offsetTop,
            w: vvvfMonitor.offsetWidth,
            h: vvvfMonitor.offsetHeight,
        }));
    } catch { /* 持久化失败不阻断（隐私模式等） */ }
}

function applyLayout(l) {
    const wrap = vvvfMonitor.parentElement;
    const w = Math.max(MIN_W, Math.min(l.w, wrap.clientWidth));
    const h = Math.max(MIN_H, Math.min(l.h, wrap.clientHeight));
    const x = Math.max(0, Math.min(l.x, wrap.clientWidth - w));
    const y = Math.max(0, Math.min(l.y, wrap.clientHeight - h));
    vvvfMonitor.style.left = x + 'px';
    vvvfMonitor.style.top = y + 'px';
    vvvfMonitor.style.width = w + 'px';
    vvvfMonitor.style.height = h + 'px';
}

// ---------- 可见性（由 main.js 依设置开关调用）----------
export function setMonitorVisible(visible) {
    vvvfMonitor.hidden = !visible;
}

// ---------- 拖拽 / 缩放（Pointer Events + 捕获）----------
let dragState = null;   // {mode:'drag'|'resize', startX, startY, origLeft, origTop, origW, origH}

function onPointerMove(e) {
    if (!dragState) return;
    const wrap = vvvfMonitor.parentElement;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (dragState.mode === 'drag') {
        const maxX = wrap.clientWidth - vvvfMonitor.offsetWidth;
        const maxY = wrap.clientHeight - vvvfMonitor.offsetHeight;
        vvvfMonitor.style.left = Math.max(0, Math.min(maxX, dragState.origLeft + dx)) + 'px';
        vvvfMonitor.style.top = Math.max(0, Math.min(maxY, dragState.origTop + dy)) + 'px';
    } else {
        const w = Math.max(MIN_W, Math.min(wrap.clientWidth, dragState.origW + dx));
        const h = Math.max(MIN_H, Math.min(wrap.clientHeight, dragState.origH + dy));
        vvvfMonitor.style.width = w + 'px';
        vvvfMonitor.style.height = h + 'px';
        // 右/下边界钳制：宽高增大时保持面板不越出容器
        const maxX = wrap.clientWidth - w;
        if (vvvfMonitor.offsetLeft > maxX) vvvfMonitor.style.left = maxX + 'px';
        const maxY = wrap.clientHeight - h;
        if (vvvfMonitor.offsetTop > maxY) vvvfMonitor.style.top = maxY + 'px';
    }
}

function onPointerEnd() {
    if (!dragState) return;
    dragState = null;
    saveLayout();
}

function initDrag() {
    vvvfMonitorHead.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        vvvfMonitor.setPointerCapture(e.pointerId);
        dragState = {
            mode: 'drag', startX: e.clientX, startY: e.clientY,
            origLeft: vvvfMonitor.offsetLeft, origTop: vvvfMonitor.offsetTop,
        };
    });
    vvvfMonitorResize.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        vvvfMonitor.setPointerCapture(e.pointerId);
        dragState = {
            mode: 'resize', startX: e.clientX, startY: e.clientY,
            origW: vvvfMonitor.offsetWidth, origH: vvvfMonitor.offsetHeight,
        };
    });
    vvvfMonitor.addEventListener('pointermove', onPointerMove);
    vvvfMonitor.addEventListener('pointerup', onPointerEnd);
    vvvfMonitor.addEventListener('pointercancel', onPointerEnd);
}

// ---------- 绘制 ----------
// 画布背板与显示尺寸对齐（含 DPR），避免拉伸变形（波形大小与窗口匹配）
// 上限 4096 防御：可替换元素固有尺寸不得反向影响 CSS 布局（flex 已解耦，此处仅兜底）
function syncCanvasSize() {
    const rect = vvvfMonitorCanvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.min(4096, Math.round(rect.width * dpr)));
    const h = Math.max(1, Math.min(4096, Math.round(rect.height * dpr)));
    if (vvvfMonitorCanvas.width !== w || vvvfMonitorCanvas.height !== h) {
        vvvfMonitorCanvas.width = w;
        vvvfMonitorCanvas.height = h;
    }
}

// 网格：中线 + ±0.5 水平参考 + 四等分垂直线
function drawGrid(W, H) {
    const mid = H / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid); ctx.lineTo(W, mid);
    const q = H * 0.25;
    ctx.moveTo(0, q); ctx.lineTo(W, q);
    ctx.moveTo(0, H - q); ctx.lineTo(W, H - q);
    for (let i = 1; i < 4; i++) {
        const x = (W / 4) * i;
        ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    ctx.stroke();
}

// 相位锁定 + 频率自适应窗口：computeScopeWindow 算触发点，窗口固定 2 基波周期铺满全宽
function drawScope(buf, count, freq, sampleRate) {
    const W = vvvfMonitorCanvas.width;
    const H = vvvfMonitorCanvas.height;
    ctx.clearRect(0, 0, W, H);
    drawGrid(W, H);
    const mid = H / 2;
    const { start, win } = computeScopeWindow({ buf, count, freq, sampleRate });
    if (win < 2) return;   // 停稳/无数据：仅网格与中线
    const amp = H / 2 - 6;
    ctx.strokeStyle = '#7ee2a8';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
        const idx = start + (x / W) * (win - 1);
        const i0 = Math.floor(idx);
        const frac = idx - i0;
        const s0 = buf[i0];
        const s1 = i0 + 1 < count ? buf[i0 + 1] : s0;
        const y = mid - (s0 + (s1 - s0) * frac) * amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function modeLabel(mode, n) {
    if (mode === 'sync') return `同步 N=${n}`;
    if (mode === 'square') return '方波';
    return '异步';
}

// 每帧调用（main.js gameLoop）：面板隐藏时立即返回，无开销
// 读取滚动缓冲 → 相位锁定绘制；元信息文本脏值缓存
let lastInfoText = null;
export function updateMonitor() {
    if (vvvfMonitor.hidden) return;
    const meta = getLatestMeta();
    const txt = meta
        ? `${modeLabel(meta.mode, meta.n)} · f=${meta.freq.toFixed(1)}Hz · fc=${meta.carrierFreq ? meta.carrierFreq.toFixed(0) : '—'}Hz · m=${meta.m !== undefined ? meta.m.toFixed(2) : '—'}`
        : '--';
    if (txt !== lastInfoText) {
        vvvfMonitorInfo.textContent = txt;
        lastInfoText = txt;
    }
    syncCanvasSize();
    const count = readRollingWave(scratch);
    drawScope(scratch, count, meta ? meta.freq : 0, getSampleRate());
}

// ---------- 初始化（main.js 调用一次）----------
export function initMonitor() {
    const layout = loadLayout();
    if (layout) applyLayout(layout);
    initDrag();
}
