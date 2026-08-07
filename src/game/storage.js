// Storage helpers for achievements, progress and settings.
export const ACHIEVEMENT_KEY = 'trainAchievements';
export const PROGRESS_KEY = 'trainProgress';
export const SETTINGS_KEY = 'trainSettings';

export function loadAchievements() {
    const saved = localStorage.getItem(ACHIEVEMENT_KEY);
    if (!saved) return null;
    try { return JSON.parse(saved); } catch (e) { return null; }
}

export function saveAchievements(payload) {
    localStorage.setItem(ACHIEVEMENT_KEY, JSON.stringify(payload));
}

export function loadProgress() {
    const saved = localStorage.getItem(PROGRESS_KEY);
    if (!saved) return null;
    try { return JSON.parse(saved); } catch (e) { return null; }
}

export function saveProgress(payload) {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(payload));
}

export function clearAll() {
    localStorage.removeItem(ACHIEVEMENT_KEY);
    localStorage.removeItem(PROGRESS_KEY);
    // 注意：设置（SETTINGS_KEY）与存档解耦，重置存档不清设置
}

export function loadSettings() {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return null;
    try { return JSON.parse(saved); } catch (e) { return null; }
}

export function saveSettings(payload) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
}

// 「恢复默认设置」：移除 key，等同新用户无 key 状态
export function removeSettings() {
    localStorage.removeItem(SETTINGS_KEY);
}
