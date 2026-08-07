// 设置模块（纯逻辑 + 持久化，不依赖 DOM/WebAudio）
// 应用侧（audioDriver/render）由 main.js 统一编排；本模块仅持有设置状态与读写。
// 与 progress.js 同模式：可 Node 单测（mock globalThis.localStorage）。
import * as storage from './storage.js';

export const DEFAULT_SETTINGS = {
    soundEnabled: true,   // VVVF 音效总开关
    postEnabled: true,    // 音效后处理（二级开关，依赖 soundEnabled）
    volume: 70,           // 音量 0-100
};

// 运行时设置对象（模块级单例，同 playerProgress 模式）
export const settings = { ...DEFAULT_SETTINGS };

// 合并默认值：只取已知字段且类型匹配，未知/缺失字段回默认（向前兼容：未来新增字段不破坏旧存档）
function mergeDefaults(saved) {
    const merged = { ...DEFAULT_SETTINGS };
    if (saved && typeof saved === 'object') {
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            if (typeof saved[key] === typeof DEFAULT_SETTINGS[key]) merged[key] = saved[key];
        }
    }
    return merged;
}

// 加载设置：key 缺失（老用户）或 JSON 损坏 → 回退默认，不抛错
export function loadSettings() {
    const merged = mergeDefaults(storage.loadSettings());
    Object.assign(settings, merged);
    return settings;
}

export function saveSettings() {
    storage.saveSettings(settings);
}

// 恢复默认设置：对象回默认 + 移除 key（等同新用户无 key 状态）
export function resetToDefaults() {
    Object.assign(settings, DEFAULT_SETTINGS);
    storage.removeSettings();
    return settings;
}
