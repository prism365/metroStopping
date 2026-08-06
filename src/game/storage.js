// Storage helpers for achievements and progress.
export const ACHIEVEMENT_KEY = 'trainAchievements';
export const PROGRESS_KEY = 'trainProgress';

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
}
