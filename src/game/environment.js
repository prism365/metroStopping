// 环境模块：路况（坡度/积水/风）与空气阻力的合成计算
// 每次运行一个 Environment 实例（flow.resetFull 创建），内部持有风基底缓存，无全局状态残留。
import { TRAIN_LENGTH, WIND, BASE_AIR_RESISTANCE } from './data.js';

// 计算列车车身与路况区域的重叠比例加权效应（Environment.update 内部使用）
function computeZoneEffects(trainHead, trainTail, zones, trainLength) {
    let totalGradient = 0;
    let totalWaterResist = 0;
    for (const zone of zones) {
        const zStart = zone.start;
        const zEnd = zone.end;
        const overlapStart = Math.max(trainTail, zStart);
        const overlapEnd = Math.min(trainHead, zEnd);
        if (overlapEnd > overlapStart) {
            const overlapLen = overlapEnd - overlapStart;
            const ratio = overlapLen / trainLength;
            if (zone.type === 'gradient') {
                totalGradient += zone.value * ratio;
            } else if (zone.type === 'water') {
                totalWaterResist += zone.value * ratio;
            }
        }
    }
    return { totalGradient, totalWaterResist };
}

// 运行期环境上下文：计算当前 tick 的合成环境快照（坡度/积水/风/空气阻力）
export class Environment {
    constructor({ zones = [], vehicle = {}, trainLength = TRAIN_LENGTH }) {
        this.zones = zones;
        this.vehicle = vehicle;
        this.trainLength = trainLength;
        this.windBases = {}; // 原 state.windBases（风区随机基底缓存，随实例重建）
        this.windSpeed = 0;  // 本 tick 合成风速（由调用方发布到 state.stats.windSpeed 供渲染读取）
    }

    // 返回 { totalGradient, totalWaterResist, windSpeed, airDrag }
    // 同一帧 ATC 前馈与物理外力共用该快照，消除重复计算。
    update({ pos, speed, gameTime }) {
        const trainHead = pos;
        const trainTail = pos - this.trainLength;
        const { totalGradient, totalWaterResist } = computeZoneEffects(trainHead, trainTail, this.zones, this.trainLength);
        const windSpeed = this.computeWind(trainHead, trainTail, gameTime);
        const airResistanceFactor = this.vehicle.airResistanceFactor || 1.0;
        const relativeSpeed = speed + windSpeed;
        const airDrag = BASE_AIR_RESISTANCE * airResistanceFactor * relativeSpeed * Math.abs(relativeSpeed);
        return { totalGradient, totalWaterResist, windSpeed, airDrag };
    }

    // 计算列车覆盖的风区合成风速（随机基底缓存 + 正弦波动）
    computeWind(trainHead, trainTail, gameTime) {
        let wind = 0;
        let totalOverlap = 0;
        let windSum = 0;

        for (const zone of this.zones) {
            if (zone.type !== 'wind') continue;
            const zStart = zone.start;
            const zEnd = zone.end;
            const overlapStart = Math.max(trainTail, zStart);
            const overlapEnd = Math.min(trainHead, zEnd);
            if (overlapEnd > overlapStart) {
                const overlapLen = overlapEnd - overlapStart;
                totalOverlap += overlapLen;
                const zoneKey = zone.id || `${zone.start}:${zone.end}:${zone.type}`;
                let baseWind = this.windBases[zoneKey] || 0;
                if (baseWind === 0) {
                    const magnitude = WIND.baseMagnitude + Math.random() * WIND.randomRange;
                    const sign = Math.random() > 0.5 ? 1 : -1;
                    baseWind = sign * magnitude;
                    this.windBases[zoneKey] = baseWind;
                }
                const amp = Math.abs(baseWind) * 0.2;
                const phase = ((zone.start % 100) + (zone.end - zone.start) * 0.1) * 0.1 + 1.7;
                const wave = Math.sin(gameTime * 0.5 + phase) * amp;
                const instantWind = baseWind + wave;
                windSum += instantWind * overlapLen;
            }
        }

        if (totalOverlap > 0) {
            wind = windSum / totalOverlap;
        }
        this.windSpeed = wind;
        return wind;
    }
}
