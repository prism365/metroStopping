// 画布渲染
import {
    PLATFORM_START,
    PLATFORM_END,
    TARGET_HEAD_POS,
    TRAIN_LENGTH,
    NUM_CARS,
    CAR_LENGTH,
    DOOR_SPACING,
    TOTAL_DOORS,
    DOOR_OFFSETS,
    VIEWPORT_WIDTH_METERS,
} from './data.js';
import { state, getLevelParams, getVehicleParams } from './state.js';
import { canvas, ctx } from './dom.js';

// ---------- 绘制函数 ----------
export function drawScene() {
    const W = canvas.width,
        H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const pxPerM = W / VIEWPORT_WIDTH_METERS;
    const offsetX = W / 2 - state.pos * pxPerM;
    const trackY = 328;
    const level = getLevelParams();
    const zones = level.zones || [];

    // 路况标识 (放在轨道上方)
    let zoneYOffset = 0;
    const zoneHeight = 26;
    const startY = trackY - 70;

    for (const zone of zones) {
        const zStart = zone.start;
        const zEnd = zone.end;
        const sx1 = zStart * pxPerM + offsetX;
        const sx2 = zEnd * pxPerM + offsetX;
        if (sx2 < -10 || sx1 > W + 10) continue;

        const yPos = startY - zoneYOffset;
        const colors = {
            gradient: 'rgba(255,215,0,0.15)',
            water: 'rgba(0,150,255,0.15)',
            wind: 'rgba(200,230,255,0.15)'
        };
        ctx.fillStyle = colors[zone.type] || 'rgba(255,255,255,0.1)';
        ctx.fillRect(Math.max(0, sx1), yPos, Math.min(W, sx2) - Math.max(0, sx1), zoneHeight);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.max(0, sx1), yPos, Math.min(W, sx2) - Math.max(0, sx1), zoneHeight);

        ctx.fillStyle = '#ffd866';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let label = '';
        if (zone.type === 'gradient') {
            label = zone.value > 0 ? '⬆ 上坡' : '⬇ 下坡';
        } else if (zone.type === 'water') {
            label = '💧 积水';
        } else if (zone.type === 'wind') {
            if (Math.abs(state.windSpeed) < 0.3) {
                label = '💨 无风';
            } else {
                label = state.windSpeed > 0 ? '💨 逆风' : '💨 顺风';
            }
        }
        ctx.fillText(label, (Math.max(0, sx1) + Math.min(W, sx2)) / 2, yPos + zoneHeight / 2);

        zoneYOffset += zoneHeight;
        if (zoneYOffset > 120) zoneYOffset = 0;
    }

    // 轨道
    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(0, trackY - 4, W, 8);
    ctx.fillStyle = '#2a4a5a';
    ctx.fillRect(0, trackY - 2, W, 4);
    for (let i = -20; i < 120; i += 6) {
        const wx = i;
        const sx = wx * pxPerM + offsetX;
        if (sx > -20 && sx < W + 20) {
            ctx.fillStyle = 'rgba(60,80,100,0.2)';
            ctx.fillRect(sx - 2, trackY + 2, 4, 10);
        }
    }

    // 站台
    const platY = 238;
    const platH = 90;
    const platX1 = PLATFORM_START * pxPerM + offsetX;
    const platX2 = PLATFORM_END * pxPerM + offsetX;
    if (platX2 > -10 && platX1 < W + 10) {
        const grad = ctx.createLinearGradient(0, platY, 0, platY + platH);
        grad.addColorStop(0, '#2a4058');
        grad.addColorStop(0.6, '#1e3348');
        grad.addColorStop(1, '#152a3a');
        ctx.fillStyle = grad;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 15;
        ctx.fillRect(Math.max(0, platX1), platY, Math.min(W, platX2) - Math.max(0, platX1), platH);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,215,0,0.2)';
        ctx.fillRect(Math.max(0, platX1 + 4), platY + platH - 8, Math.min(W, platX2 - 4) - Math.max(0, platX1 + 4), 3);
        ctx.setLineDash([8, 12]);
        ctx.strokeStyle = 'rgba(255,215,0,0.12)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, platX1 + 8), platY + platH - 18);
        ctx.lineTo(Math.min(W, platX2 - 8), platY + platH - 18);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let m = 0; m <= 100; m += 5) {
            const sx = m * pxPerM + offsetX;
            if (sx > 0 && sx < W) {
                ctx.fillStyle = 'rgba(200,230,255,0.06)';
                ctx.fillRect(sx - 0.5, platY + 24, 1, platH - 40);
                if (m % 10 === 0) {
                    ctx.fillStyle = 'rgba(200,230,255,0.12)';
                    ctx.font = '9px monospace';
                    ctx.fillText(m + 'm', sx - 6, platY + platH - 12);
                }
            }
        }
        for (let m = 10; m < 100; m += 20) {
            const sx = m * pxPerM + offsetX;
            if (sx > 0 && sx < W) {
                ctx.fillStyle = 'rgba(60,100,140,0.15)';
                ctx.fillRect(sx - 3, platY + 12, 6, platH - 30);
                ctx.fillStyle = 'rgba(100,180,255,0.04)';
                ctx.fillRect(sx - 1, platY + 14, 2, platH - 34);
            }
        }

        // 对标点
        const targetX = TARGET_HEAD_POS * pxPerM + offsetX;
        if (targetX > 0 && targetX < W) {
            const grd = ctx.createRadialGradient(targetX, platY + 16, 4, targetX, platY + 16, 30);
            grd.addColorStop(0, 'rgba(255,80,80,0.5)');
            grd.addColorStop(1, 'rgba(255,80,80,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(targetX - 30, platY - 14, 60, 60);
            ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
            ctx.shadowColor = 'rgba(255,80,80,0.5)';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.moveTo(targetX, platY + 6);
            ctx.lineTo(targetX - 14, platY + 30);
            ctx.lineTo(targetX + 14, platY + 30);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255, 220, 100, 0.9)';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('停车对位', targetX, platY + 2);
        }

        // 屏蔽门
        for (let i = 0; i < TOTAL_DOORS; i++) {
            const doorOffset = DOOR_OFFSETS[i];
            const doorWorldX = TARGET_HEAD_POS - doorOffset;
            const doorScreenX = doorWorldX * pxPerM + offsetX;
            if (doorScreenX > -30 && doorScreenX < W + 30) {
                const doorW = 0.9 * pxPerM;
                const doorH = 1.8 * pxPerM;
                const doorY = platY + platH - doorH - 6;
                const isAligned = state.ended && Math.abs(state.deviation || 0) < 0.2;
                ctx.shadowColor = isAligned ? 'rgba(125,255,179,0.3)' : 'rgba(100,200,255,0.1)';
                ctx.shadowBlur = isAligned ? 20 : 10;
                ctx.fillStyle = isAligned ? 'rgba(125,255,179,0.08)' : 'rgba(100,200,255,0.04)';
                ctx.fillRect(doorScreenX - 6, doorY - 6, doorW + 12, doorH + 12);
                ctx.shadowBlur = 0;
                const gradDoor = ctx.createLinearGradient(doorScreenX, doorY, doorScreenX + doorW, doorY);
                gradDoor.addColorStop(0, '#3a7a9a');
                gradDoor.addColorStop(0.5, '#4a8aaa');
                gradDoor.addColorStop(1, '#3a7a9a');
                ctx.fillStyle = gradDoor;
                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                ctx.shadowBlur = 8;
                ctx.fillRect(doorScreenX, doorY, doorW, doorH);
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'rgba(100,200,255,0.2)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(doorScreenX, doorY, doorW, doorH);
                ctx.fillStyle = 'rgba(200,230,255,0.15)';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🚪', doorScreenX + doorW / 2, doorY + doorH / 2);
            }
        }
    }

    // 列车
    const trainY = trackY - 3.4 * pxPerM - 4;
    const totalLen = TRAIN_LENGTH;
    const startX = state.pos * pxPerM + offsetX - totalLen * pxPerM;
    const accel = state.currentAccel || 0;
    let r, g, b;
    if (Math.abs(accel) < 0.05) {
        r = 0.4;
        g = 0.6;
        b = 0.8;
    } else if (accel > 0) {
        const intensity = Math.min(1, accel / 1.5);
        r = 0.4 - 0.2 * intensity;
        g = 0.6 + 0.3 * intensity;
        b = 0.4 - 0.2 * intensity;
    } else {
        const intensity = Math.min(1, -accel / 1.5);
        r = 0.4 + 0.4 * intensity;
        g = 0.6 - 0.3 * intensity;
        b = 0.4 - 0.2 * intensity;
    }
    r = Math.min(1, Math.max(0, r));
    g = Math.min(1, Math.max(0, g));
    b = Math.min(1, Math.max(0, b));
    const baseColor = `rgb(${r * 255 | 0}, ${g * 255 | 0}, ${b * 255 | 0})`;

    if (startX > -totalLen * pxPerM - 20 && startX < W + 20) {
        for (let c = 0; c < NUM_CARS; c++) {
            const carX = startX + c * CAR_LENGTH * pxPerM;
            const carW = CAR_LENGTH * pxPerM;
            ctx.shadowColor = 'rgba(0,0,0,0.4)';
            ctx.shadowBlur = 20;
            ctx.shadowOffsetY = 6;
            ctx.fillStyle = baseColor;
            const r2 = 4;
            ctx.beginPath();
            ctx.moveTo(carX + r2, trainY);
            ctx.arcTo(carX + carW, trainY, carX + carW, trainY + 3.4 * pxPerM, r2);
            ctx.arcTo(carX + carW, trainY + 3.4 * pxPerM, carX, trainY + 3.4 * pxPerM, r2);
            ctx.arcTo(carX, trainY + 3.4 * pxPerM, carX, trainY, r2);
            ctx.arcTo(carX, trainY, carX + carW, trainY, r2);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            const winY2 = trainY + 8;
            const winH2 = 3.4 * pxPerM - 24;
            ctx.fillStyle = 'rgba(180,230,255,0.12)';
            for (let w = 0; w < 3; w++) {
                const wx = carX + 10 + w * (carW - 20) / 3;
                ctx.fillRect(wx, winY2, 10, winH2);
                ctx.strokeStyle = 'rgba(200,240,255,0.05)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(wx, winY2, 10, winH2);
            }
            const doorOffset1 = DOOR_SPACING / 2 + c * CAR_LENGTH;
            const doorOffset2 = doorOffset1 + DOOR_SPACING;
            const doorPos1 = state.pos - doorOffset1;
            const doorPos2 = state.pos - doorOffset2;
            const doorScreenX1 = doorPos1 * pxPerM + offsetX;
            const doorScreenX2 = doorPos2 * pxPerM + offsetX;
            const doorW2 = 0.8 * pxPerM;
            const doorY2 = trainY + 3.4 * pxPerM - 1.1 * pxPerM - 4;
            ctx.fillStyle = '#5a7a8a';
            ctx.shadowColor = 'rgba(0,0,0,0.2)';
            ctx.shadowBlur = 8;
            ctx.fillRect(doorScreenX1 - doorW2 / 2, doorY2, doorW2, 1.1 * pxPerM);
            ctx.fillRect(doorScreenX2 - doorW2 / 2, doorY2, doorW2, 1.1 * pxPerM);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(200,230,255,0.1)';
            ctx.lineWidth = 1;
            ctx.strokeRect(doorScreenX1 - doorW2 / 2, doorY2, doorW2, 1.1 * pxPerM);
            ctx.strokeRect(doorScreenX2 - doorW2 / 2, doorY2, doorW2, 1.1 * pxPerM);
            ctx.fillStyle = 'rgba(200,230,255,0.05)';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🚪', doorScreenX1, doorY2 + 0.55 * pxPerM);
            ctx.fillText('🚪', doorScreenX2, doorY2 + 0.55 * pxPerM);
        }

        // 车头
        const headX = state.pos * pxPerM + offsetX;
        const headW = 12;
        const baseW = 3.4 * pxPerM * 0.8;
        const headLen = 20;
        ctx.fillStyle = baseColor;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(headX - headLen, trainY + (3.4 * pxPerM - baseW) / 2);
        ctx.lineTo(headX, trainY + (3.4 * pxPerM - headW) / 2);
        ctx.lineTo(headX, trainY + (3.4 * pxPerM + headW) / 2);
        ctx.lineTo(headX - headLen, trainY + (3.4 * pxPerM + baseW) / 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(180,230,255,0.3)';
        ctx.fillRect(headX - 6, trainY + (3.4 * pxPerM - 14) / 2, 4, 14);
        ctx.fillStyle = 'rgba(200,240,255,0.1)';
        ctx.fillRect(headX - 8, trainY + (3.4 * pxPerM - 10) / 2, 2, 10);
        ctx.fillStyle = 'rgba(255,220,140,0.6)';
        ctx.fillRect(headX - 4, trainY + 3.4 * pxPerM - 12, 6, 6);
        ctx.fillRect(headX - 4, trainY + 6, 6, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('司机室', headX - 10, trainY + 3.4 * pxPerM - 6);
    }

    // 偏差
    if (state.running || state.ended) {
        const dev = state.deviation;
        if (dev !== null && state.pos > PLATFORM_START - 5) {
            const devAbs = Math.abs(dev);
            let color = '#ffd866';
            if (devAbs < 0.2) color = '#7dffb3';
            else if (devAbs < 0.6) color = '#aaffaa';
            else if (devAbs < 1.2) color = '#ffa94d';
            else color = '#ff6b6b';
            ctx.fillStyle = color;
            ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const label = `偏差 ${dev.toFixed(2)} m`;
            ctx.fillText(label, W / 2, 12);
        }
    }

    // 进站计时
    if (state.entryTime !== null && state.running) {
        ctx.fillStyle = 'rgba(200,230,255,0.2)';
        ctx.font = '12px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`进站 ${state.timer.toFixed(1)}s`, W - 10, H - 10);
    }

    // 风速
    if (state.running && Math.abs(state.windSpeed) > 0.1) {
        ctx.fillStyle = 'rgba(200,230,255,0.2)';
        ctx.font = '12px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        const dir = state.windSpeed > 0 ? '逆风' : '顺风';
        ctx.fillText(`风速 ${Math.abs(state.windSpeed).toFixed(1)} m/s ${dir}`, W - 10, H - 26);
    }

    // 底部信息
    ctx.fillStyle = 'rgba(200,230,255,0.15)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const kmh = (state.speed * 3.6).toFixed(0);
    const veh = getVehicleParams();
    const atcLabel = veh.isATC ? ' 🤖 ATC' : '';
    ctx.fillText(`车速 ${kmh} km/h  |  车头 ${state.pos.toFixed(1)} m  |  手柄 ${state.handle.toFixed(0)}  |  ${veh.name}${atcLabel}`, 10, H - 10);
}
