// Storage helpers for achievements and progress.
(function() {
    const ACHIEVEMENT_KEY = 'trainAchievements';
    const PROGRESS_KEY = 'trainProgress';

    function loadAchievements() {
        const saved = localStorage.getItem(ACHIEVEMENT_KEY);
        if (!saved) return null;
        try { return JSON.parse(saved); } catch (e) { return null; }
    }

    function saveAchievements(payload) {
        localStorage.setItem(ACHIEVEMENT_KEY, JSON.stringify(payload));
    }

    function loadProgress() {
        const saved = localStorage.getItem(PROGRESS_KEY);
        if (!saved) return null;
        try { return JSON.parse(saved); } catch (e) { return null; }
    }

    function saveProgress(payload) {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(payload));
    }

    window.GameStorage = { loadAchievements, saveAchievements, loadProgress, saveProgress };
})();
