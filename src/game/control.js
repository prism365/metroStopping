// 手柄响应：手动 / ATC 共用的统一平滑
// 通过 getRate 参数化，逐行为等价于原 physics.js 中的两处独立实现，手感严格不变。
import { HANDLE_RESPONSE_RATE_UP, HANDLE_RESPONSE_RATE_DOWN, HANDLE_RELEASE_RATE } from './data.js';

// 手动模式速率选择（原 physicsUpdate 手动分支逻辑）
export function getManualRate(target, current) {
    const isRelease = (target * current < 0) || (Math.abs(target) < Math.abs(current));
    if (isRelease) return HANDLE_RELEASE_RATE;
    return target > 0 ? HANDLE_RESPONSE_RATE_UP : HANDLE_RESPONSE_RATE_DOWN;
}

// 统一手柄平滑：向目标手柄收敛（速率 * dt，超量截断到剩余差值），并限幅到 ±maxAbs
export function smoothHandle({ current, target, dt, maxAbs, getRate }) {
    let next = current;
    if (Math.abs(target - current) > 0.01) {
        const dir = Math.sign(target - current);
        const rate = getRate(target, current);
        let delta = dir * rate * dt;
        if (Math.abs(delta) > Math.abs(target - current)) delta = target - current;
        next = current + delta;
    } else {
        next = target;
    }
    return Math.min(maxAbs, Math.max(-maxAbs, next));
}
