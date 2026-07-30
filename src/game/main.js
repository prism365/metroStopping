
    (function() {
        // ---------- DOM refs ----------
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const speedDisplay = document.getElementById('speedDisplay');
        const deviationDisplay = document.getElementById('deviationDisplay');
        const statusBadge = document.getElementById('statusBadge');
        const levelDisplay = document.getElementById('levelDisplay');
        const resultOverlay = document.getElementById('resultOverlay');
        const resultIcon = document.getElementById('resultIcon');
        const resultTitle = document.getElementById('resultTitle');
        const resultDetail = document.getElementById('resultDetail');
        const resultScore = document.getElementById('resultScore');
        const resultAchievements = document.getElementById('resultAchievements');
        const resultBtn = document.getElementById('resultBtn');
        const resetBtn = document.getElementById('resetBtn');
        const upBtn = document.getElementById('upBtn');
        const downBtn = document.getElementById('downBtn');
        const handleValue = document.getElementById('handleValue');
        const menuReturnBtn = document.getElementById('menuReturnBtn');
        const routeInfo = document.getElementById('routeInfo');

        const mainMenu = document.getElementById('mainMenu');
        const levelView = document.getElementById('levelView');
        const vehicleView = document.getElementById('vehicleView');
        const aboutView = document.getElementById('aboutView');
        const achievementView2 = document.getElementById('achievementView2');
        const countdownOverlay = document.getElementById('countdownOverlay');
        const countdownIcon = document.getElementById('countdownIcon');
        const countdownText = document.getElementById('countdownText');
        const countdownSub = document.getElementById('countdownSub');
        const levelGridContainer = document.getElementById('levelGridContainer');
        const vehicleGridContainer = document.getElementById('vehicleGridContainer');
        const achievementListContainer2 = document.getElementById('achievementListContainer2');

        const startGameBtn = document.getElementById('startGameBtn');
        const levelMenuBtn = document.getElementById('levelMenuBtn');
        const vehicleMenuBtn = document.getElementById('vehicleMenuBtn');
        const achievementMenuBtn2 = document.getElementById('achievementMenuBtn2');
        const aboutMenuBtn = document.getElementById('aboutMenuBtn');
        const closeLevelBtn = document.getElementById('closeLevelBtn');
        const closeLevelViewBtn = document.getElementById('closeLevelViewBtn');
        const closeVehicleBtn = document.getElementById('closeVehicleBtn');
        const closeVehicleViewBtn = document.getElementById('closeVehicleViewBtn');
        const closeAboutBtn = document.getElementById('closeAboutBtn');
        const closeAboutViewBtn = document.getElementById('closeAboutViewBtn');
        const closeAchievementBtn2 = document.getElementById('closeAchievementBtn2');
        const closeAchievementView2Btn = document.getElementById('closeAchievementView2Btn');
        const resetStorageBtn = document.getElementById('resetStorageBtn');

        const toast = document.getElementById('toast');
        const confirmModal = document.getElementById('confirmModal');
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmMessage = document.getElementById('confirmMessage');
        const confirmCancelBtn = document.getElementById('confirmCancelBtn');
        const confirmOkBtn = document.getElementById('confirmOkBtn');
        let toastTimeout = null;
        let pendingConfirmResolver = null;

        const { ACHIEVEMENTS: ACHIEVEMENT_DEFS = {}, LEVELS: LEVEL_DEFS = [], VEHICLES: VEHICLE_DEFS = {}, PHYSICS: PHYSICS_CONFIG = {} } = window.GAME_DATA || {};

        // ---------- 成就列表 ----------
        const ACHIEVEMENTS = Object.fromEntries(
            Object.entries(ACHIEVEMENT_DEFS).map(([key, value]) => [key, { ...value, unlocked: false }])
        );
        let gameCount = 0;
        let unlockedThisRun = [];

        function loadAchievements() {
            const saved = window.GameStorage?.loadAchievements ? window.GameStorage.loadAchievements() : null;
            if (saved) {
                for (let key in ACHIEVEMENTS) {
                    if (saved[key] !== undefined) ACHIEVEMENTS[key].unlocked = saved[key];
                }
                if (saved.gameCount !== undefined) gameCount = saved.gameCount;
            }
        }

        function saveAchievements() {
            const data = {};
            for (let key in ACHIEVEMENTS) data[key] = ACHIEVEMENTS[key].unlocked;
            data.gameCount = gameCount;
            if (window.GameStorage?.saveAchievements) {
                window.GameStorage.saveAchievements(data);
            } else {
                localStorage.setItem('trainAchievements', JSON.stringify(data));
            }
        }

        function unlockAchievement(id) {
            const ach = ACHIEVEMENTS[id];
            if (!ach || ach.unlocked) return false;
            ach.unlocked = true;
            unlockedThisRun.push(id);
            saveAchievements();
            showToast(`🏆 解锁成就：${ach.icon} ${ach.name}`);
            return true;
        }

        function checkAchievements(data) {
            if (playerProgress.currentVehicle === 'ATC') return;

            const dev = Math.abs(data.deviation);
            const isPerfectTime = data.stopTime >= 16.0 && data.stopTime <= 17.0;
            gameCount++;

            if (dev <= 0.15) unlockAchievement('precision');
            if (data.maxDecel < 1.0) unlockAchievement('smooth');
            if (isPerfectTime) unlockAchievement('time_master');
            // 更精细的“缓解制动”判定：
            // 条件示例：发生释放动作且释放到停稳间隔 <= 3s，释放位置距停靠点 <= 5m，且释放时速度 <= 3 m/s
            if (data.didRelease && data.releaseToStop != null) {
                const dt = data.releaseToStop;
                const relPos = (typeof data.lastReleasePos === 'number') ? Math.abs(data.lastReleasePos - TARGET_HEAD_POS) : null;
                const relSpeed = (typeof data.lastReleaseSpeed === 'number') ? data.lastReleaseSpeed : null;
                if (dt <= 3.0 && (relPos === null || relPos <= 5.0) && (relSpeed === null || relSpeed <= 3.0)) {
                    unlockAchievement('release');
                }
            }
            if (data.brakeCount === 1 && data.handleChanges <= 5) unlockAchievement('one_brake');
            if (gameCount >= 20) unlockAchievement('veteran');

            saveAchievements();
        }

        // ---------- 关卡系统 ----------
        const LEVELS = Array.isArray(LEVEL_DEFS) ? LEVEL_DEFS.map((level) => ({ ...level })) : [];

        // ---------- 车辆系统 ----------
        const VEHICLES = Object.fromEntries(
            Object.entries(VEHICLE_DEFS).map(([key, value]) => [key, { ...value }])
        );

        // ---------- 玩家进度 ----------
        let playerProgress = {
            unlockedLevels: [0],
            currentLevel: 0,
            currentVehicle: 'STANDARD',
            unlockedVehicles: ['STANDARD'],
            levelStars: {},
        };

        function loadProgress() {
            const saved = window.GameStorage?.loadProgress ? window.GameStorage.loadProgress() : null;
            if (saved) {
                if (saved.unlockedLevels) playerProgress.unlockedLevels = saved.unlockedLevels;
                if (saved.currentLevel !== undefined) playerProgress.currentLevel = saved.currentLevel;
                if (saved.currentVehicle) playerProgress.currentVehicle = saved.currentVehicle;
                if (saved.unlockedVehicles) playerProgress.unlockedVehicles = saved.unlockedVehicles;
                if (saved.levelStars) playerProgress.levelStars = saved.levelStars;
            }
        }

        function saveProgress() {
            if (window.GameStorage?.saveProgress) {
                window.GameStorage.saveProgress(playerProgress);
            } else {
                localStorage.setItem('trainProgress', JSON.stringify(playerProgress));
            }
        }

        function isLevelUnlocked(levelId) {
            return playerProgress.unlockedLevels.includes(levelId);
        }

        function unlockLevel(levelId) {
            if (!playerProgress.unlockedLevels.includes(levelId)) {
                playerProgress.unlockedLevels.push(levelId);
                playerProgress.unlockedLevels.sort((a, b) => a - b);
                saveProgress();
                return true;
            }
            return false;
        }

        function isVehicleUnlocked(vehicleId) {
            return playerProgress.unlockedVehicles.includes(vehicleId);
        }

        function unlockVehicle(vehicleId) {
            if (!playerProgress.unlockedVehicles.includes(vehicleId)) {
                playerProgress.unlockedVehicles.push(vehicleId);
                saveProgress();
                return true;
            }
            return false;
        }

        function completeLevel(levelId, score) {
            if (!playerProgress.levelStars[levelId] || playerProgress.levelStars[levelId] < score) {
                playerProgress.levelStars[levelId] = score;
            }
            const level = LEVELS.find(l => l.id === levelId);
            if (level && level.unlockVehicle) {
                const vehicleId = level.unlockVehicle;
                if (VEHICLES[vehicleId] && !isVehicleUnlocked(vehicleId)) {
                    playerProgress.unlockedVehicles.push(vehicleId);
                }
            }
            const nextLevel = LEVELS.find(l => l.id === levelId + 1);
            if (nextLevel) {
                const allPrereq = nextLevel.prerequisites.every(id => playerProgress.unlockedLevels.includes(id));
                if (allPrereq && !isLevelUnlocked(nextLevel.id)) {
                    playerProgress.unlockedLevels.push(nextLevel.id);
                    playerProgress.unlockedLevels.sort((a, b) => a - b);
                }
            }
            saveProgress();
            if (!levelView.classList.contains('hidden')) {
                renderLevelGrid();
            }
        }

        // ---------- 物理常量 ----------
        const BASE_TRACTION_ACCEL = PHYSICS_CONFIG.BASE_TRACTION_ACCEL ?? 0.85;
        const BASE_BRAKE_ACCEL = PHYSICS_CONFIG.BASE_BRAKE_ACCEL ?? 0.90;
        const BASE_FRICTION_DECEL = PHYSICS_CONFIG.BASE_FRICTION_DECEL ?? 0.06;
        const BASE_AIR_RESISTANCE = PHYSICS_CONFIG.BASE_AIR_RESISTANCE ?? 0.004;
        const MAX_PLAYER_HANDLE = PHYSICS_CONFIG.MAX_PLAYER_HANDLE ?? 5;
        const MAX_ATC_HANDLE = PHYSICS_CONFIG.MAX_ATC_HANDLE ?? 3;
        const MIN_SPEED = PHYSICS_CONFIG.MIN_SPEED ?? 0.01;
        const PLATFORM_START = PHYSICS_CONFIG.PLATFORM_START ?? 0;
        const PLATFORM_END = PHYSICS_CONFIG.PLATFORM_END ?? 100;
        const TRAIN_LENGTH = PHYSICS_CONFIG.TRAIN_LENGTH ?? 100;
        const NUM_CARS = PHYSICS_CONFIG.NUM_CARS ?? 10;
        const CAR_LENGTH = TRAIN_LENGTH / NUM_CARS;
        const DOORS_PER_CAR = PHYSICS_CONFIG.DOORS_PER_CAR ?? 2;
        const TOTAL_DOORS = NUM_CARS * DOORS_PER_CAR;
        const DOOR_SPACING = CAR_LENGTH / DOORS_PER_CAR;
        const DOOR_OFFSETS = [];
        for (let i = 0; i < TOTAL_DOORS; i++) {
            DOOR_OFFSETS.push(DOOR_SPACING / 2 + i * DOOR_SPACING);
        }
        const TARGET_HEAD_POS = PHYSICS_CONFIG.TARGET_HEAD_POS ?? PLATFORM_END;
        const VIEWPORT_WIDTH_METERS = PHYSICS_CONFIG.VIEWPORT_WIDTH_METERS ?? 95;
        const BASE_SPEED = PHYSICS_CONFIG.BASE_SPEED ?? 15.0;
        const SPEED_RANDOM_RANGE = PHYSICS_CONFIG.SPEED_RANDOM_RANGE ?? 2.78;

        const HANDLE_RESPONSE_RATE_UP = PHYSICS_CONFIG.HANDLE_RESPONSE_RATE_UP ?? 4.0;
        const HANDLE_RESPONSE_RATE_DOWN = PHYSICS_CONFIG.HANDLE_RESPONSE_RATE_DOWN ?? 1.2;
        const HANDLE_RELEASE_RATE = PHYSICS_CONFIG.HANDLE_RELEASE_RATE ?? 4.0;

        // ---------- ATC 参数 ----------
        const ATC = {
            cruiseDist: 150,
            midDist: 50,
            finalDist: 5,
            cruiseSpeed: 15.0,
            midSpeed: 11.8,
            finalSpeed: 1.8,
            Kp: 0.85,
            Ki: 0.05,
            Kd: 0.2,
            integralLimit: 1.5,
            accelLimit: 3.5,
            handleResponseDelay: 0.08,
        };

        // ---------- 状态 ----------
        let state = {
            pos: -100,
            speed: 15.0,
            handle: 0,
            targetHandle: 0,
            running: false,
            ended: false,
            score: null,
            deviation: null,
            entryTime: null,
            gameTime: 0,
            timer: 0,
            countdown: 3,
            countdownActive: false,
            stopTimer: 0,
            lastTimestamp: 0,
            maxDecel: 0,
            brakeCount: 0,
            handleChanges: 0,
            prevHandle: 0,
            prevSpeed: 0,
            currentAccel: 0,
            started: false,
            didRelease: false,
            lastReleaseTime: null,
            lastReleasePos: null,
            lastReleaseSpeed: null,
            brakeStartHandle: 0,
            windSpeed: 0,
            atcActive: false,
            atcBrakeApplied: false,
            atcIntegral: 0,
            atcPrevError: 0,
            atcTargetSpeed: 0,
            windBases: {},
            arcadeZones: null,
        };

        // ---------- 街机模式随机路况生成 ----------
        function generateArcadeZones() {
            const zones = [];
            const types = ['gradient', 'water', 'wind'];
            const numZones = 2 + Math.floor(Math.random() * 2);
            let usedStarts = [];
            const minGap = 10;
            for (let i = 0; i < numZones; i++) {
                let type;
                if (i > 0 && zones[i-1]?.type === types[i % types.length]) {
                    type = types[(i + 1) % types.length];
                } else {
                    type = types[i % types.length];
                }
                let start, end;
                let attempts = 0;
                // 地形位置、长度调整
                do {
                    start = -40 - Math.random() * 60;
                    end = start + 20 + Math.random() * 50;
                    attempts++;
                } while (attempts < 30 && usedStarts.some(s => Math.abs(s - start) < minGap));
                usedStarts.push(start);
                end = Math.min(end, -5);
                if (end - start < 15) end = start + 20;
                const zone = { start, end, type };
                if (type === 'gradient') {
                    zone.value = (Math.random() > 0.5 ? 1 : -1) * (0.02 + Math.random() * 0.02);
                } else if (type === 'water') {
                    zone.value = 0.005 + Math.random() * 0.006;
                }
                zones.push(zone);
            }
            zones.sort((a, b) => a.start - b.start);
            return zones;
        }

        // ---------- 获取当前参数 ----------
        function getLevelParams() {
            const level = LEVELS.find(l => l.id === playerProgress.currentLevel) || LEVELS[0];
            if (level.id === 8) {
                if (!state.arcadeZones) {
                    state.arcadeZones = generateArcadeZones();
                }
                return { ...level, zones: state.arcadeZones };
            }
            return level;
        }

        function getVehicleParams() {
            return VEHICLES[playerProgress.currentVehicle] || VEHICLES.STANDARD;
        }

        // ---------- 重置 ----------
        function resetFull() {
            const level = getLevelParams();
            const vehicle = getVehicleParams();
            const initOffset = level.initialOffset || 100;
            const randOffset = (Math.random() - 0.5) * 2 * SPEED_RANDOM_RANGE;
            let initSpeed = Math.min(vehicle.maxSpeed, Math.max(0.1, BASE_SPEED + randOffset));
            state.pos = -initOffset;
            state.speed = initSpeed;
            state.handle = 0;
            state.targetHandle = 0;
            state.prevHandle = 0;
            state.prevSpeed = initSpeed;
            state.running = false;
            state.ended = false;
            state.score = null;
            state.deviation = null;
            state.entryTime = null;
            state.gameTime = 0;
            state.timer = 0;
            state.countdown = 3;
            state.countdownActive = false;
            state.stopTimer = 0;
            state.maxDecel = 0;
            state.brakeCount = 0;
            state.handleChanges = 0;
            state.currentAccel = 0;
            state.started = false;
            state.didRelease = false;
            state.lastReleaseTime = null;
            state.lastReleasePos = null;
            state.lastReleaseSpeed = null;
            state.brakeStartHandle = 0;
            state.windSpeed = 0;
            state.atcActive = false;
            state.atcBrakeApplied = false;
            state.atcIntegral = 0;
            state.atcPrevError = 0;
            state.atcTargetSpeed = 0;
            state.windBases = {};
            if (playerProgress.currentLevel === 8) {
                state.arcadeZones = null;
            }
            resultOverlay.classList.remove('show');
            countdownOverlay.classList.add('hidden');
            updateUI();
            drawScene();
            statusBadge.textContent = '⏳ 准备';
            statusBadge.className = 'status-badge ready';
            levelDisplay.textContent = `第${playerProgress.currentLevel+1}关 · ${level.name}`;
            updateRouteInfo();
        }

        // ---------- 路况信息 ----------
        function updateRouteInfo() {
            const level = getLevelParams();
            const zones = level.zones || [];
            let info = '';
            if (zones.length === 0) {
                info = '🏙️ 平地';
            } else {
                const types = zones.map(z => {
                    if (z.type === 'gradient') return z.value > 0 ? '⬆上坡' : '⬇下坡';
                    if (z.type === 'water') return '💧积水';
                    if (z.type === 'wind') return '💨大风';
                    return '';
                });
                info = types.join(' · ');
            }
            routeInfo.textContent = '🚧 路况：' + info;
        }

        // ---------- 倒计时 ----------
        let countdownInterval = null;

        function startCountdownProcess() {
            if (state.running || state.ended) return;
            if (state.countdownActive) return;
            state.countdownActive = true;
            state.countdown = 3;
            countdownOverlay.classList.remove('hidden');
            countdownIcon.textContent = '🚇';
            countdownText.textContent = '准备';
            countdownSub.textContent = '3';
            updateRouteInfo();
            updateUI();
            drawScene();

            clearInterval(countdownInterval);
            countdownInterval = setInterval(() => {
                if (!state.countdownActive) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                    return;
                }
                state.countdown -= 1;
                if (state.countdown <= 0) {
                    state.countdown = 0;
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                    countdownOverlay.classList.add('hidden');
                    beginRun();
                } else {
                    countdownSub.textContent = state.countdown;
                    updateUI();
                    drawScene();
                }
            }, 1000);
        }

        function beginRun() {
            state.running = true;
            state.countdownActive = false;
            state.ended = false;
            state.gameTime = 0;
            state.timer = 0;
            state.entryTime = null;
            state.stopTimer = 0;
            state.maxDecel = 0;
            state.brakeCount = 0;
            state.handleChanges = 0;
            state.prevHandle = 0;
            state.prevSpeed = state.speed;
            state.currentAccel = 0;
            state.didRelease = false;
            state.lastReleaseTime = null;
            state.lastReleasePos = null;
            state.lastReleaseSpeed = null;
            state.brakeStartHandle = 0;
            state.windSpeed = 0;
            state.atcActive = false;
            state.atcBrakeApplied = false;
            state.atcIntegral = 0;
            state.atcPrevError = 0;
            state.atcTargetSpeed = 0;
            state.windBases = {};
            statusBadge.textContent = '🚆 行驶中';
            statusBadge.className = 'status-badge running';
            resultOverlay.classList.remove('show');
            unlockedThisRun = [];
            updateUI();
            drawScene();
        }

        // ---------- 乘客评价 ----------
        function generatePassengerComment(deviation, maxDecel, stopTime, handleChanges, brakeCount, isPass, isATC) {

            const d = Math.abs(deviation);

            if (!isPass) {
                if (isATC) return 'ATC自动驾驶失误，乘客表示惊讶 😱 ';

                if (deviation >= 10.0 && stopTime < 8.0) return '达速跨站？！😮 ';
                if (deviation >= 10.0) return '师傅，您这是要起飞吗？ 😂 ';

                if (d > 5.0) return '师傅，我要在这里下车吗？😱';
                else if (d > 2.0) return '师傅，您这是开哪儿去了啊？😵';
                else return '师傅，挤不出去啊 😅 ';
            }

            const isSmooth = maxDecel < 1.0 && handleChanges <= 4;
            const isHardBrake = maxDecel > 2.0;
            const isJerky = handleChanges > 12 && maxDecel > 1.5;

            const isTooSlow = stopTime > 20.0;
            const isFast = stopTime < 14.0;
            const isPerfectTime = stopTime >= 15.5 && stopTime <= 18.5;

            const isPrecise = d <= 0.15;

            let comment = '';

            if (isATC) {
                comment = 'ATC自动驾驶完美执行，乘客表示很安心 🤖';

            } else if (isPrecise && isSmooth && isPerfectTime) {
                comment = '优雅，太优雅了！ 👏 ';
            } else if (isPrecise && isSmooth) {
                comment = '精准而平稳的停靠！ 😊 ';
            } else if (isPrecise && isHardBrake) {
                comment = '到站叫醒服务！ 😂';
            } else if (isPrecise && isJerky) {
                comment = '豪意值拉满的停车 🤪 ';
            } else if (isPrecise && isTooSlow) {
                comment = '完美主义者 ⏳ ';
            } else if (isPrecise) {
                comment = '先生，您准得像机器一样 🤖 ';

            } else if (d <= 0.6 && isSmooth) {
                comment = '一般般 👍  ';
            } else if (d <= 0.6 && isHardBrake) {
                comment = '过山车哦，头晕晕哦…… 😵 ';
            } else if (d <= 0.6 && isJerky) {
                comment = '手忙脚乱中…… 😬 ';
            } else if (d <= 0.6 && isTooSlow) {
                comment = '乘客已经刷完整部剧了 📱 ';
            } else if (d <= 0.6) {
                comment = '寻常的停靠，寻常的生活 🏙️ ';

            } else if (d <= 0.8 && isSmooth) {
                comment = '我的行李箱卡住啦 😱 ';
            } else if (d <= 0.8 && isHardBrake) {
                comment = '这里可以投诉吗？ 😡 ';
            } else if (d <= 0.8 && isTooSlow) {
                comment = '您是在思考人生吗？ 🤔 ';
            } else if (d <= 0.8) {
                comment = '只能说能下车 😅 ';

            } else if (d <= 1.0 && d > 0.8) {
                comment = '极限！这在给乘客练瑜伽？ 🧘 ';
            }

            if (isPerfectTime && d <= 0.4) comment += '时间节奏完美，老司机稳如泰山！ ⏱️ ';
            if (isFast) comment += ' 闪电进站！ ⚡';
            if (brakeCount > 4 && d <= 0.3) comment += '点刹摇啊摇，摇到外婆桥 😵 ';

            return comment;
        }

        // ---------- 结算 ----------
        function endGame(deviation, reason) {
            if (state.ended) return;
            state.ended = true;
            state.running = false;
            state.deviation = deviation;
            const d = Math.abs(deviation);
            const maxDecel = state.maxDecel || 0;
            const brakeCount = state.brakeCount || 0;
            const handleChanges = state.handleChanges || 0;
            const stopTime = state.timer || 0;
            const didRelease = state.didRelease;
            const releaseToStop = (state.lastReleaseTime != null) ? (state.gameTime - state.lastReleaseTime) : null;

            const vehicle = getVehicleParams();
            const isATC = vehicle.isATC || false;
            const isPass = (reason !== 'overshoot') && (d <= 1.0);

            let score, label, icon, detail, passengerComment = '';

            if (reason === 'overshoot') {
                score = 0;
                label = '冲出站台';
                icon = '🚀';
                detail = '列车冲出站台，请重新驾驶！';
                passengerComment = generatePassengerComment(deviation, maxDecel, stopTime, handleChanges, brakeCount, false, isATC);
            } else if (!isPass) {
                const raw = 60 - (d - 1) * 20;
                score = Math.max(0, Math.min(59, Math.floor(raw)));
                label = '停靠失败';
                icon = '❌';
                detail = `偏差 ${d.toFixed(2)} m 超过1m，无法下车！`;
                passengerComment = generatePassengerComment(deviation, maxDecel, stopTime, handleChanges, brakeCount, false, isATC);
            } else {
                let baseScore = 0;
                if (d <= 0.15) baseScore = 95;
                else if (d <= 0.4) baseScore = 80;
                else if (d <= 0.8) baseScore = 65;
                else baseScore = 50;

                const isSmooth = maxDecel < 1.0 && handleChanges <= 4;
                const isHardBrake = maxDecel > 2.0;
                const isTooSlow = stopTime > 20.0;
                const isFast = stopTime < 14.0;
                const isPerfectTime = stopTime >= 15.5 && stopTime <= 18.5;
                const isJerky = handleChanges > 12 && maxDecel > 1.5;

                let styleBonus = 0;
                if (isSmooth && isPerfectTime) styleBonus = 8;
                else if (isSmooth) styleBonus = 4;
                else if (isPerfectTime) styleBonus = 4;
                else if (isFast) styleBonus = 2;
                else if (isHardBrake) styleBonus = -8;
                else if (isTooSlow) styleBonus = -5;
                else if (isJerky) styleBonus = -10;

                let totalScore = Math.min(100, Math.max(0, baseScore + styleBonus));
                score = Math.floor(totalScore);

                if (score >= 90) { label = '完美停靠';
                    icon = '🌟'; } else if (score >= 75) { label = '优秀停靠';
                    icon = '👏'; } else if (score >= 60) { label = '良好停靠';
                    icon = '😊'; } else { label = '停靠成功';
                    icon = '✅'; }

                detail = `偏差 ${d.toFixed(2)} m · 停靠 ${stopTime.toFixed(1)}s`;
                passengerComment = generatePassengerComment(deviation, maxDecel, stopTime, handleChanges, brakeCount, true, isATC);
            }

            state.score = score;

            resultIcon.textContent = icon;
            resultTitle.textContent = label + '！';
            resultScore.textContent = score;
            resultScore.className = 'result-score' + (score >= 90 ? ' perfect' : (score < 60 ? ' fail' : ''));

            resultDetail.innerHTML = `${detail}<br><span style="font-size:13px; opacity:0.8;">💬 ${passengerComment}</span>`;

            // 成就检查
            if (!isATC && isPass) {
                checkAchievements({
                    deviation: d,
                    maxDecel,
                    stopTime,
                    brakeCount,
                    handleChanges,
                    didRelease,
                    releaseToStop,
                    lastReleasePos: state.lastReleasePos,
                    lastReleaseSpeed: state.lastReleaseSpeed
                });
            }

            let achHtml = '';
            if (unlockedThisRun.length > 0) {
                unlockedThisRun.forEach(id => {
                    const ach = ACHIEVEMENTS[id];
                    if (ach) achHtml += `<span class="result-ach">${ach.icon} ${ach.name}</span>`;
                });
            } else {
                achHtml = `<span style="color:#5a8aaa; font-size:13px;">${isATC ? '🚫 ATC模式不计成就' : '暂无新成就'}</span>`;
            }
            resultAchievements.innerHTML = achHtml;

            const currentLevelId = playerProgress.currentLevel;
            const alreadyPassed = playerProgress.levelStars[currentLevelId] !== undefined;

            if (isPass && !alreadyPassed && reason !== 'overshoot') {
                completeLevel(currentLevelId, score);
            } else if (isPass && alreadyPassed) {
                if (playerProgress.levelStars[currentLevelId] < score) {
                    playerProgress.levelStars[currentLevelId] = score;
                    saveProgress();
                }
            }

            if (isPass && reason !== 'overshoot' && score > 0) {
                if (currentLevelId === 8) {
                    resultBtn.textContent = '🎮 再玩一次';
                } else {
                    const nextLevel = LEVELS.find(l => l.id === currentLevelId + 1);
                    if (nextLevel && isLevelUnlocked(nextLevel.id)) {
                        resultBtn.textContent = '➡️ 下一关';
                    } else {
                        resultBtn.textContent = '🔄 重试';
                    }
                }
            } else {
                resultBtn.textContent = '🔄 重试';
            }

            resultOverlay.classList.add('show');

            statusBadge.textContent = isPass ? '✅ 停靠成功' : '❌ 停靠失败';
            statusBadge.className = isPass ? 'status-badge stopped' : 'status-badge fail';
            updateUI();
            drawScene();
        }

        // ---------- ATC 速度曲线 ----------
        function computeTargetSpeed(distToTarget) {
            if (distToTarget > ATC.cruiseDist) return ATC.cruiseSpeed;
            else if (distToTarget > ATC.midDist) {
                const ratio = (distToTarget - ATC.midDist) / (ATC.cruiseDist - ATC.midDist);
                return ATC.midSpeed + (ATC.cruiseSpeed - ATC.midSpeed) * ratio;
            } else if (distToTarget > ATC.finalDist) {
                const ratio = (distToTarget - ATC.finalDist) / (ATC.midDist - ATC.finalDist);
                return ATC.finalSpeed + (ATC.midSpeed - ATC.finalSpeed) * ratio;
            } else {
                const ratio = distToTarget / ATC.finalDist;
                return ATC.finalSpeed * ratio;
            }
        }

        function getWindSpeedForZones(zones, trainHead, trainTail) {
            let wind = 0;
            let totalOverlap = 0;
            let windSum = 0;

            for (const zone of zones) {
                if (zone.type !== 'wind') continue;
                const zStart = zone.start;
                const zEnd = zone.end;
                const overlapStart = Math.max(trainTail, zStart);
                const overlapEnd = Math.min(trainHead, zEnd);
                if (overlapEnd > overlapStart) {
                    const overlapLen = overlapEnd - overlapStart;
                    totalOverlap += overlapLen;
                    const zoneKey = zone.id || `${zone.start}:${zone.end}:${zone.type}`;
                    let baseWind = state.windBases[zoneKey] || 0;
                    if (baseWind === 0) {
                        const magnitude = 8.0 + Math.random() * 6.0;
                        const sign = Math.random() > 0.5 ? 1 : -1;
                        baseWind = sign * magnitude;
                        state.windBases[zoneKey] = baseWind;
                    }
                    const amp = Math.abs(baseWind) * 0.2;
                    const phase = ((zone.start % 100) + (zone.end - zone.start) * 0.1) * 0.1 + 1.7;
                    const wave = Math.sin(state.gameTime * 0.5 + phase) * amp;
                    const instantWind = baseWind + wave;
                    windSum += instantWind * overlapLen;
                }
            }

            if (totalOverlap > 0) {
                wind = windSum / totalOverlap;
            }
            state.windSpeed = wind;
            return wind;
        }

        // ---------- ATC 控制更新 ----------
        function updateATC(dt) {
            if (!state.atcActive) return;
            const level = getLevelParams();
            const vehicle = getVehicleParams();
            const distToTarget = Math.max(0, state.atcTargetPos - state.pos);
            const targetSpeed = computeTargetSpeed(distToTarget);
            state.atcTargetSpeed = targetSpeed;

            const error = targetSpeed - state.speed;
            const Kp = ATC.Kp, Ki = ATC.Ki, Kd = ATC.Kd;
            state.atcIntegral += error * dt;
            state.atcIntegral = Math.min(ATC.integralLimit, Math.max(-ATC.integralLimit, state.atcIntegral));
            const derivative = (error - state.atcPrevError) / dt;
            state.atcPrevError = error;

            let accelCmd = Kp * error + Ki * state.atcIntegral + Kd * derivative;

            // 前馈补偿
            const zones = level.zones || [];
            const trainHead = state.pos;
            const trainTail = state.pos - TRAIN_LENGTH;
            let totalGradient = 0;
            let totalWaterResist = 0;
            const wind = getWindSpeedForZones(zones, trainHead, trainTail);

            for (const zone of zones) {
                const zStart = zone.start;
                const zEnd = zone.end;
                const overlapStart = Math.max(trainTail, zStart);
                const overlapEnd = Math.min(trainHead, zEnd);
                if (overlapEnd > overlapStart) {
                    const overlapLen = overlapEnd - overlapStart;
                    const ratio = overlapLen / TRAIN_LENGTH;
                    if (zone.type === 'gradient') {
                        totalGradient += zone.value * ratio;
                    } else if (zone.type === 'water') {
                        totalWaterResist += zone.value * ratio;
                    }
                }
            }

            let feedforward = 0;
            if (totalGradient !== 0) feedforward += 9.8 * totalGradient;
            if (totalWaterResist > 0) feedforward += totalWaterResist * state.speed * state.speed;
            if (Math.abs(wind) > 0.01) {
                const relativeSpeed = state.speed + wind;
                const airDrag = BASE_AIR_RESISTANCE * (vehicle.airResistanceFactor || 1.0) * relativeSpeed * Math.abs(relativeSpeed);
                feedforward += 0.25 * airDrag; // “大风”前馈补偿系数调整
            }

            accelCmd += feedforward;
            accelCmd = Math.min(ATC.accelLimit, Math.max(-ATC.accelLimit, accelCmd));

            let handleOut = 0;
            if (accelCmd > 0.1) {
                handleOut = Math.min(MAX_ATC_HANDLE, Math.round(accelCmd / BASE_TRACTION_ACCEL));
            } else if (accelCmd < -0.1) {
                handleOut = Math.max(-MAX_ATC_HANDLE, Math.round(accelCmd / BASE_BRAKE_ACCEL));
            }

            // 末段强制制动
            if (distToTarget < 0.35 && state.speed > 0.1) {
                handleOut = -3;
            }

            const currentHandle = state.handle;
            const targetHandle = handleOut;
            const delta = targetHandle - currentHandle;
            
            if (Math.abs(delta) > 0.01) {
                const maxChange = ATC.handleResponseDelay * 10;
                const change = Math.sign(delta) * Math.min(Math.abs(delta), maxChange * dt);
                state.handle += change;
            } else {
                state.handle = targetHandle;
            }
            state.handle = Math.min(MAX_ATC_HANDLE, Math.max(-MAX_ATC_HANDLE, state.handle));

            state.atcBrakeApplied = (state.handle < 0);
        }

        // ---------- 物理更新 ----------
        function physicsUpdate(dt) {
            if (!state.running || state.ended) return;
            if (dt > 0.05) dt = 0.05;

            const level = getLevelParams();
            const vehicle = getVehicleParams();
            const isATC = vehicle.isATC || false;

            if (isATC && !state.atcActive) {
                if (state.pos >= (-ATC.cruiseDist)) {
                    state.atcActive = true;
                    state.atcTargetPos = TARGET_HEAD_POS;
                    showToast('🤖 ATC自动驾驶已激活');
                }
            }

            if (isATC && state.atcActive) {
                updateATC(dt);
            } else if (!isATC) {
                const current = state.handle;
                const target = state.targetHandle;
                let deltaHandle = 0;
                if (Math.abs(target - current) > 0.01) {
                    const dir = Math.sign(target - current);
                    const isRelease = (target * current < 0) || (Math.abs(target) < Math.abs(current));
                    let rate;
                    if (isRelease) rate = HANDLE_RELEASE_RATE;
                    else {
                        if (target > 0) rate = HANDLE_RESPONSE_RATE_UP;
                        else rate = HANDLE_RESPONSE_RATE_DOWN;
                    }
                    deltaHandle = dir * rate * dt;
                    if (Math.abs(deltaHandle) > Math.abs(target - current)) deltaHandle = target - current;
                    state.handle += deltaHandle;
                    if (current < 0 && state.handle >= 0) {
                        state.didRelease = true;
                        state.lastReleaseTime = state.gameTime;
                        state.lastReleasePos = state.pos;
                        state.lastReleaseSpeed = state.speed;
                    }
                } else {
                    state.handle = target;
                }
                state.handle = Math.min(MAX_PLAYER_HANDLE, Math.max(-MAX_PLAYER_HANDLE, state.handle));
            }

            let accel = 0;
            const trac = state.handle > 0 ? state.handle : 0;
            const brake = state.handle < 0 ? -state.handle : 0;
            const tracFactor = vehicle.tractionFactor || 1.0;
            const brakeFactor = vehicle.brakeFactor || 1.0;
            const maxSpeed = vehicle.maxSpeed || 28.0;

            if (trac > 0) accel += trac * BASE_TRACTION_ACCEL * tracFactor;
            if (brake > 0) {
                const speedFactor = Math.min(1.0, state.speed / 15.0);
                const brakeAccel = brake * BASE_BRAKE_ACCEL * brakeFactor * (0.5 + 0.5 * speedFactor);
                accel -= brakeAccel;
            }

            const frictionDecel = BASE_FRICTION_DECEL * (vehicle.frictionFactor || 1.0);
            const zones = level.zones || [];
            const trainHead = state.pos;
            const trainTail = state.pos - TRAIN_LENGTH;
            if (!isATC || !state.atcActive) {
                getWindSpeedForZones(zones, trainHead, trainTail);
            }
            const relativeSpeed = state.speed + state.windSpeed;
            const airDrag = BASE_AIR_RESISTANCE * (vehicle.airResistanceFactor || 1.0) * relativeSpeed * Math.abs(relativeSpeed);
            accel -= airDrag;
            if (state.speed > 0.01) accel -= frictionDecel;
            else if (state.speed < -0.01) accel += frictionDecel;

            if (!isATC || !state.atcActive) {
                let totalGradient = 0;
                let totalWaterResist = 0;
                for (const zone of zones) {
                    if (zone.type === 'gradient') {
                        const zStart = zone.start;
                        const zEnd = zone.end;
                        const overlapStart = Math.max(trainTail, zStart);
                        const overlapEnd = Math.min(trainHead, zEnd);
                        if (overlapEnd > overlapStart) {
                            const overlapLen = overlapEnd - overlapStart;
                            const ratio = overlapLen / TRAIN_LENGTH;
                            totalGradient += zone.value * ratio;
                        }
                    } else if (zone.type === 'water') {
                        const zStart = zone.start;
                        const zEnd = zone.end;
                        const overlapStart = Math.max(trainTail, zStart);
                        const overlapEnd = Math.min(trainHead, zEnd);
                        if (overlapEnd > overlapStart) {
                            const overlapLen = overlapEnd - overlapStart;
                            const ratio = overlapLen / TRAIN_LENGTH;
                            totalWaterResist += zone.value * ratio;
                        }
                    }
                }
                if (totalGradient !== 0) {
                    const g = 9.8;
                    accel -= g * totalGradient;
                }
                if (totalWaterResist > 0) {
                    accel -= totalWaterResist * state.speed * state.speed;
                }
            }

            if (state.speed < 0.01 && accel < 0) accel = 0;
            if (Math.abs(state.speed) < 0.01 && accel < 0) accel = 0;
            if (state.speed < 0) state.speed = 0;

            accel = Math.min(2.0, Math.max(-2.0, accel));
            state.currentAccel = accel;

            if (accel < 0 && state.speed > 0.1) {
                const decel = -accel;
                if (decel > state.maxDecel) state.maxDecel = decel;
            }

            state.speed += accel * dt;
            if (state.speed < 0) state.speed = 0;
            if (state.speed > maxSpeed) state.speed = maxSpeed;

            state.pos += state.speed * dt;
            state.gameTime += dt;

            if (state.pos >= PLATFORM_START && state.entryTime === null) {
                state.entryTime = state.gameTime;
            }
            if (state.entryTime !== null) {
                state.timer = state.gameTime - state.entryTime;
            }

            if (state.pos > PLATFORM_END + 10) {
                endGame(state.pos - TARGET_HEAD_POS, 'overshoot');
                return;
            }

            const deviation = state.pos - TARGET_HEAD_POS;
            state.deviation = deviation;

            if (Math.abs(state.speed) < MIN_SPEED) {
                state.stopTimer += dt;
                if (state.stopTimer >= 0.5) {
                    endGame(deviation, 'normal');
                    return;
                }
            } else {
                state.stopTimer = 0;
            }

            if (state.pos > PLATFORM_END + 50) state.pos = PLATFORM_END + 50;
            if (state.pos < -200) state.pos = -200;

            updateUI();
            drawScene();
        }

        // ---------- 绘制函数 ----------
        function drawScene() {
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
            if (Math.abs(accel) < 0.05) { r = 0.4;
                g = 0.6;
                b = 0.8; } else if (accel > 0) {
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
            const baseColor = `rgb(${r*255|0}, ${g*255|0}, ${b*255|0})`;

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

        // ---------- UI更新 ----------
        function updateUI() {
            const kmh = (state.speed * 3.6);
            speedDisplay.textContent = kmh.toFixed(0);
            if (state.deviation !== null) {
                const d = Math.abs(state.deviation);
                deviationDisplay.textContent = d.toFixed(2);
                let cls = 'deviation';
                if (d < 0.2) cls += ' perfect';
                else if (d < 0.6) cls += ' good';
                else if (d < 1.2) cls += ' fair';
                else cls += ' poor';
                deviationDisplay.className = 'val ' + cls;
            } else {
                deviationDisplay.textContent = '--';
                deviationDisplay.className = 'val deviation';
            }
            const h = state.handle;
            handleValue.textContent = h.toFixed(0);
            if (h > 0.1) handleValue.className = 'handle-value traction';
            else if (h < -0.1) handleValue.className = 'handle-value brake';
            else handleValue.className = 'handle-value neutral';

            if (state.countdownActive && !state.running) {
                statusBadge.textContent = '⏳ 准备 ' + (state.countdown > 0 ? state.countdown : 'GO');
                statusBadge.className = 'status-badge ready';
            } else if (state.running) {
                statusBadge.textContent = '🚆 行驶中';
                statusBadge.className = 'status-badge running';
            } else if (state.ended) {
                // handled
            } else {
                statusBadge.textContent = '⏸ 待发车';
                statusBadge.className = 'status-badge';
            }
            const level = getLevelParams();
            levelDisplay.textContent = `第${playerProgress.currentLevel+1}关 · ${level.name}`;
        }

        // ---------- 手柄控制 ----------
        function changeHandle(delta) {
            if (!state.running || state.ended) return;
            const vehicle = getVehicleParams();
            if (vehicle.isATC) return;
            let newTarget = state.targetHandle + delta;
            if (newTarget > MAX_PLAYER_HANDLE) newTarget = MAX_PLAYER_HANDLE;
            if (newTarget < -MAX_PLAYER_HANDLE) newTarget = -MAX_PLAYER_HANDLE;
            state.targetHandle = newTarget;
            if (Math.abs(newTarget - state.handle) > 0.1) {
                state.handleChanges++;
                if (newTarget < 0 && state.handle >= 0) state.brakeCount++;
            }
            updateUI();
        }

        function resetHandleToZero() {
            if (!state.running || state.ended) return;
            const vehicle = getVehicleParams();
            if (vehicle.isATC) return;
            state.targetHandle = 0;
            updateUI();
        }

        // ---------- 游戏循环 ----------
        let lastTime = 0;

        function gameLoop(timestamp) {
            if (!lastTime) lastTime = timestamp;
            const dt = (timestamp - lastTime) / 1000;
            lastTime = timestamp;
            if (state.running && !state.ended) {
                physicsUpdate(dt);
            } else {
                drawScene();
                updateUI();
            }
            requestAnimationFrame(gameLoop);
        }

        // ---------- UI导航 ----------
        function showMainMenu() {
            mainMenu.classList.remove('hidden');
            levelView.classList.add('hidden');
            vehicleView.classList.add('hidden');
            achievementView2.classList.add('hidden');
            aboutView.classList.add('hidden');
            countdownOverlay.classList.add('hidden');
            resultOverlay.classList.remove('show');
        }

        function startGameFromMenu() {
            mainMenu.classList.add('hidden');
            resetFull();
            startCountdownProcess();
        }

        function showLevelView() {
            mainMenu.classList.add('hidden');
            levelView.classList.remove('hidden');
            renderLevelGrid();
        }

        function showVehicleView() {
            mainMenu.classList.add('hidden');
            vehicleView.classList.remove('hidden');
            renderVehicleGrid();
        }

        function showAboutView() {
            mainMenu.classList.add('hidden');
            aboutView.classList.remove('hidden');
        }

        function showAchievementView2() {
            mainMenu.classList.add('hidden');
            achievementView2.classList.remove('hidden');
            renderAchievementList2();
        }

        function renderLevelGrid() {
            let html = '';
            LEVELS.forEach(level => {
                const unlocked = isLevelUnlocked(level.id);
                const isCurrent = level.id === playerProgress.currentLevel;
                const stars = playerProgress.levelStars[level.id] || 0;
                const starStr = stars >= 90 ? '⭐' : stars >= 70 ? '🌟' : '';
                const cls = unlocked ? 'level-card unlocked' : 'level-card locked';
                html += `
                    <div class="${cls}" data-level="${level.id}">
                        <div class="lv-icon">${level.icon}</div>
                        <div class="lv-name">${level.name}</div>
                        <div class="lv-desc">${level.desc}</div>
                        <div class="lv-status">${unlocked ? (isCurrent ? '🟢 当前' : starStr || '✅') : '🔒 未解锁'}</div>
                    </div>
                `;
            });
            levelGridContainer.innerHTML = html;

            levelGridContainer.querySelectorAll('.level-card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = parseInt(card.dataset.level);
                    if (isLevelUnlocked(id)) {
                        playerProgress.currentLevel = id;
                        saveProgress();
                        resetFull();
                        showToast(`🗺️ 切换到 ${LEVELS.find(l=>l.id===id).name}`);
                        renderLevelGrid();
                        levelView.classList.add('hidden');
                        mainMenu.classList.remove('hidden');
                    }
                });
            });
        }

        function renderVehicleGrid() {
            let html = '';
            for (let key in VEHICLES) {
                const veh = VEHICLES[key];
                const unlocked = isVehicleUnlocked(key);
                const cls = unlocked ? 'vehicle-card unlocked' : 'vehicle-card locked';
                const isCurrent = key === playerProgress.currentVehicle;
                const unlockText = veh.unlockText || '默认解锁';

                html += `
                    <div class="${cls}" data-vehicle="${key}">
                        <div class="v-icon">${veh.icon}</div>
                        <div class="v-name">${veh.name} ${isCurrent ? '🟢' : ''}</div>
                        <div class="v-desc">${veh.desc}<br><span style="color:#7fc8ff;font-size:10px;">${unlockText}</span></div>
                        <div class="v-status">${unlocked ? '✅ 已解锁' : '🔒 未解锁'}</div>
                    </div>
                `;
            }
            vehicleGridContainer.innerHTML = html;

            vehicleGridContainer.querySelectorAll('.vehicle-card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.dataset.vehicle;
                    if (isVehicleUnlocked(id)) {
                        playerProgress.currentVehicle = id;
                        saveProgress();
                        resetFull();
                        showToast(`🚆 切换至 ${VEHICLES[id].name}`);
                        renderVehicleGrid();
                        vehicleView.classList.add('hidden');
                        mainMenu.classList.remove('hidden');
                    }
                });
            });
        }

        function renderAchievementList2() {
            let html = '';
            for (let key in ACHIEVEMENTS) {
                const ach = ACHIEVEMENTS[key];
                const cls = ach.unlocked ? 'achievement-item unlocked' : 'achievement-item';
                html += `
                    <div class="${cls}">
                        <span class="ach-icon">${ach.icon}</span>
                        <span class="ach-name">${ach.name}</span>
                        <span class="ach-desc">${ach.unlocked ? '✅' : ach.desc}</span>
                    </div>
                `;
            }
            achievementListContainer2.innerHTML = html;
        }

        // ---------- Toast ----------
        function showToast(msg) {
            toast.textContent = msg;
            toast.classList.add('show');
            clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => {
                toast.classList.remove('show');
            }, 2500);
        }

        function showConfirmDialog(message, title = '确认操作', confirmText = '确认', cancelText = '取消') {
            confirmTitle.textContent = title;
            confirmMessage.textContent = message;
            confirmOkBtn.textContent = confirmText;
            confirmCancelBtn.textContent = cancelText;
            confirmModal.classList.remove('hidden');
            return new Promise(resolve => {
                pendingConfirmResolver = resolve;
            });
        }

        function closeConfirmDialog(result) {
            confirmModal.classList.add('hidden');
            if (pendingConfirmResolver) {
                pendingConfirmResolver(result);
                pendingConfirmResolver = null;
            }
        }

        confirmCancelBtn.addEventListener('click', () => closeConfirmDialog(false));
        confirmOkBtn.addEventListener('click', () => closeConfirmDialog(true));

        // ---------- 事件绑定 ----------
        function setupButton(btn, action) {
            btn.addEventListener('click', (e) => { e.preventDefault();
                action(); });
            btn.addEventListener('touchstart', (e) => { e.preventDefault();
                action(); }, { passive: false });
        }

        // ---------- 测试后门 ----------
        const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'];
        let konamiCode = [];

        function checkKonami() {
            if (konamiCode.length === konamiSequence.length) {
                let match = true;
                for (let i = 0; i < konamiSequence.length; i++) {
                    if (konamiCode[i] !== konamiSequence[i]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    const allLevelIds = LEVELS.map(l => l.id);
                    allLevelIds.forEach(id => {
                        if (!isLevelUnlocked(id)) {
                            playerProgress.unlockedLevels.push(id);
                        }
                    });
                    playerProgress.unlockedLevels.sort((a, b) => a - b);
                    for (let key in VEHICLES) {
                        if (!isVehicleUnlocked(key)) {
                            playerProgress.unlockedVehicles.push(key);
                        }
                    }
                    saveProgress();
                    showToast('🎮 后门已激活，所有内容已解锁！');
                    if (!levelView.classList.contains('hidden')) renderLevelGrid();
                    if (!vehicleView.classList.contains('hidden')) renderVehicleGrid();
                    konamiCode = [];
                    return true;
                }
            }
            return false;
        }

        function pushKonami(key) {
            konamiCode.push(key);
            if (konamiCode.length > konamiSequence.length) {
                konamiCode.shift();
            }
            checkKonami();
        }

        // 键盘事件
        document.addEventListener('keydown', (e) => {
            const key = e.key;
            if (!mainMenu.classList.contains('hidden') && (key === 'ArrowUp' || key === 'ArrowDown')) {
                pushKonami(key);
            }
            if (state.running && !state.ended) {
                if (key === 'ArrowUp' || key === 'w' || key === 'W') {
                    e.preventDefault();
                    changeHandle(1);
                } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
                    e.preventDefault();
                    changeHandle(-1);
                } else if (key === ' ' || key === 'Space') {
                    e.preventDefault();
                    resetHandleToZero();
                } else if (key === 'r' || key === 'R') {
                    resetFull();
                    showMainMenu();
                } else if (key === 'm' || key === 'M') {
                    resetFull();
                    showMainMenu();
                }
            } else {
                if (key === 'r' || key === 'R') {
                    resetFull();
                    showMainMenu();
                } else if (key === 'm' || key === 'M') {
                    resetFull();
                    showMainMenu();
                }
            }
        });

        // 虚拟按键触发后门
        function setupButtonWithKonami(btn, key) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (state.running && !state.ended) {
                    const vehicle = getVehicleParams();
                    if (!vehicle.isATC) {
                        const delta = key === 'ArrowUp' ? 1 : -1;
                        changeHandle(delta);
                    }
                }
                if (!mainMenu.classList.contains('hidden')) {
                    pushKonami(key);
                }
            });
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (state.running && !state.ended) {
                    const vehicle = getVehicleParams();
                    if (!vehicle.isATC) {
                        const delta = key === 'ArrowUp' ? 1 : -1;
                        changeHandle(delta);
                    }
                }
                if (!mainMenu.classList.contains('hidden')) {
                    pushKonami(key);
                }
            }, { passive: false });
        }

        setupButtonWithKonami(upBtn, 'ArrowUp');
        setupButtonWithKonami(downBtn, 'ArrowDown');

        // 其他按钮
        startGameBtn.addEventListener('click', startGameFromMenu);
        levelMenuBtn.addEventListener('click', showLevelView);
        vehicleMenuBtn.addEventListener('click', showVehicleView);
        achievementMenuBtn2.addEventListener('click', showAchievementView2);
        aboutMenuBtn.addEventListener('click', showAboutView);

        closeLevelBtn.addEventListener('click', () => { levelView.classList.add('hidden');
            mainMenu.classList.remove('hidden'); });
        closeLevelViewBtn.addEventListener('click', () => { levelView.classList.add('hidden');
            mainMenu.classList.remove('hidden'); });
        closeVehicleBtn.addEventListener('click', () => { vehicleView.classList.add('hidden');
            mainMenu.classList.remove('hidden'); });
        closeVehicleViewBtn.addEventListener('click', () => { vehicleView.classList.add('hidden');
            mainMenu.classList.remove('hidden'); });
        closeAboutBtn.addEventListener('click', () => { aboutView.classList.add('hidden');
            mainMenu.classList.remove('hidden'); });
        closeAboutViewBtn.addEventListener('click', () => { aboutView.classList.add('hidden');
            mainMenu.classList.remove('hidden'); });
        closeAchievementBtn2.addEventListener('click', () => { achievementView2.classList.add('hidden');
            mainMenu.classList.remove('hidden'); });
        closeAchievementView2Btn.addEventListener('click', () => { achievementView2.classList.add('hidden');
            mainMenu.classList.remove('hidden'); });

        resetStorageBtn.addEventListener('click', async () => {
            const firstConfirm = await showConfirmDialog('确定要重置存档吗？这将清除所有本地进度和成就。', '确认重置', '确认', '取消');
            if (!firstConfirm) return;
            const secondConfirm = await showConfirmDialog('所有游戏进度将无法恢复！确定要继续？', '再次确认', '确认重置', '取消');
            if (!secondConfirm) return;
            localStorage.removeItem('trainProgress');
            localStorage.removeItem('trainAchievements');
            playerProgress = {
                unlockedLevels: [0],
                currentLevel: 0,
                currentVehicle: 'STANDARD',
                unlockedVehicles: ['STANDARD'],
                levelStars: {},
            };
            for (let key in ACHIEVEMENTS) {
                ACHIEVEMENTS[key].unlocked = false;
            }
            gameCount = 0;
            resetFull();
            showMainMenu();
            showToast('🗑️ 存档已重置');
        });

        menuReturnBtn.addEventListener('click', () => {
            resetFull();
            showMainMenu();
        });

        resultBtn.addEventListener('click', () => {
            const currentLevelId = playerProgress.currentLevel;
            const btnText = resultBtn.textContent;

            if (btnText.includes('再玩一次')) {
                state.arcadeZones = null;
                resetFull();
                startCountdownProcess();
                return;
            }

            if (btnText.includes('下一关')) {
                const nextLevel = LEVELS.find(l => l.id === currentLevelId + 1);
                if (nextLevel && isLevelUnlocked(nextLevel.id)) {
                    playerProgress.currentLevel = nextLevel.id;
                    saveProgress();
                    resetFull();
                    startCountdownProcess();
                } else {
                    resetFull();
                    startCountdownProcess();
                }
                return;
            }

            resetFull();
            startCountdownProcess();
        });

        resetBtn.addEventListener('click', () => {
            resetFull();
            showMainMenu();
        });

        // 允许列表滚动（触屏）
        document.addEventListener('touchmove', (e) => {
            const target = e.target;
            if (target.closest('.level-grid') || target.closest('.vehicle-grid') || target.closest('.achievement-list')) {
                return;
            }
            if (e.target.closest('.game-container')) {
                e.preventDefault();
            }
        }, { passive: false });

        // ---------- 初始化 ----------
        loadProgress();
        loadAchievements();
        resetFull();
        showMainMenu();
        drawScene();
        requestAnimationFrame(gameLoop);

        canvas.addEventListener('click', () => canvas.focus());
        canvas.setAttribute('tabindex', '0');
    })();
