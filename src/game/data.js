// 成就设计
export const ACHIEVEMENTS = {
    precision: { id: 'precision', name: '精准停靠', icon: '🎯', desc: '偏差 ≤ 0.15m', unlocked: false },
    one_brake: { id: 'one_brake', name: '一把闸', icon: '🛑', desc: '一次制动到位', unlocked: false },
    smooth: { id: 'smooth', name: '平稳大师', icon: '🧘', desc: '最大减速度 < 1.0 m/s²', unlocked: false },
    time_master: { id: 'time_master', name: '准时宝', icon: '⏱️', desc: '停靠时间 16.0~17.0s', unlocked: false },
    release: { id: 'release', name: '缓解制动', icon: '🔄', desc: '停稳前缓解制动', unlocked: false },
    veteran: { id: 'veteran', name: '老司机', icon: '🚇', desc: '手动完成20次驾驶', unlocked: false },
};

// 关卡设计
export const LEVELS = [{
    id: 0,
    name: '训练场',
    desc: '平地，无特殊',
    icon: '🏙️',
    zones: [],
    initialOffset: 100,
    unlockVehicle: null,
    prerequisites: []
}, {
    id: 1,
    name: '上坡道',
    desc: '3% 上坡',
    icon: '⛰️',
    zones: [{ start: -80, end: -10, type: 'gradient', value: 0.03 }],
    initialOffset: 100,
    unlockVehicle: 'ACCEL',
    prerequisites: [0]
}, {
    id: 2,
    name: '下坡道',
    desc: '3% 下坡',
    icon: '⛰️',
    zones: [{ start: -80, end: -10, type: 'gradient', value: -0.03 }],
    initialOffset: 100,
    unlockVehicle: 'BRAKE',
    prerequisites: [1]
}, {
    id: 3,
    name: '积水路段',
    desc: '隧道积水，阻力增大',
    icon: '🌊',
    zones: [{ start: -60, end: -5, type: 'water', value: 0.008 }],
    initialOffset: 100,
    unlockVehicle: null,
    prerequisites: [2]
}, {
    id: 4,
    name: '上坡+积水',
    desc: '3%上坡 & 积水',
    icon: '⛰️🌊',
    zones: [
        { start: -80, end: -10, type: 'gradient', value: 0.03 },
        { start: -60, end: -5, type: 'water', value: 0.006 }
    ],
    initialOffset: 120,
    unlockVehicle: 'HYBRID',
    prerequisites: [3]
}, {
    id: 5,
    name: '下坡+积水',
    desc: '3%下坡 & 积水',
    icon: '⛰️🌊',
    zones: [
        { start: -80, end: -10, type: 'gradient', value: -0.03 },
        { start: -60, end: -5, type: 'water', value: 0.006 }
    ],
    initialOffset: 120,
    unlockVehicle: null,
    prerequisites: [4]
}, {
    id: 6,
    name: '复合路况+大风',
    desc: '上下坡+积水+随机风',
    icon: '🌪️',
    zones: [
        { start: -90, end: -40, type: 'gradient', value: 0.02 },
        { start: -40, end: -5, type: 'gradient', value: -0.02 },
        { start: -70, end: -15, type: 'water', value: 0.005 },
        { start: -80, end: -20, type: 'wind' }
    ],
    initialOffset: 160,
    unlockVehicle: 'PERFORMANCE',
    prerequisites: [5]
}, {
    id: 7,
    name: '终极挑战',
    desc: '全地形+随机强风',
    icon: '🔥',
    zones: [
        { start: -100, end: -50, type: 'gradient', value: 0.025 },
        { start: -50, end: -5, type: 'gradient', value: -0.025 },
        { start: -80, end: -20, type: 'water', value: 0.007 },
        { start: -90, end: -10, type: 'wind' }
    ],
    initialOffset: 180,
    unlockVehicle: 'ATC',
    prerequisites: [6]
}, {
    id: 8,
    name: '街机模式',
    desc: '随机路况 · 无限挑战',
    icon: '🎮',
    zones: [],
    initialOffset: 160,
    unlockVehicle: null,
    prerequisites: [7]
}];


// 车辆数值
export const VEHICLES = {
    STANDARD: {
        id: 'STANDARD',
        name: '标准型',
        icon: '🚇',
        desc: '均衡性能',
        unlockText: '默认解锁',
        tractionFactor: 1.0,
        brakeFactor: 1.0,
        frictionFactor: 1.0,
        airResistanceFactor: 1.0,
        maxSpeed: 28.0,
        unlockCondition: null
    },
    ACCEL: {
        id: 'ACCEL',
        name: '加速型',
        icon: '⚡',
        desc: '牵引力+40%，制动力-10%，摩擦+5%',
        unlockText: '通关第2关解锁',
        tractionFactor: 1.4,
        brakeFactor: 0.9,
        frictionFactor: 1.05,
        airResistanceFactor: 1.0,
        maxSpeed: 30.0,
        unlockCondition: 'level1'
    },
    BRAKE: {
        id: 'BRAKE',
        name: '制动型',
        icon: '🛑',
        desc: '制动力+40%，牵引力-10%，摩擦-5%',
        unlockText: '通关第3关解锁',
        tractionFactor: 0.9,
        brakeFactor: 1.4,
        frictionFactor: 0.95,
        airResistanceFactor: 1.0,
        maxSpeed: 26.0,
        unlockCondition: 'level2'
    },
    HYBRID: {
        id: 'HYBRID',
        name: '混合型',
        icon: '🔧',
        desc: '牵引+40%，制动+40%，阻力-10%',
        unlockText: '通关第5关解锁',
        tractionFactor: 1.4,
        brakeFactor: 1.4,
        frictionFactor: 0.9,
        airResistanceFactor: 0.9,
        maxSpeed: 29.0,
        unlockCondition: 'level4'
    },
    PERFORMANCE: {
        id: 'PERFORMANCE',
        name: '高性能',
        icon: '🏎️',
        desc: '牵引+80%，制动+80%，阻力-40%',
        unlockText: '通关第7关解锁',
        tractionFactor: 1.8,
        brakeFactor: 1.8,
        frictionFactor: 0.6,
        airResistanceFactor: 0.6,
        maxSpeed: 35.0,
        unlockCondition: 'level6'
    },
    ATC: {
        id: 'ATC',
        name: 'ATC自动驾驶',
        icon: '🤖',
        desc: '自动精准停靠（不计入成就）',
        unlockText: '通关第8关解锁',
        tractionFactor: 1.8,
        brakeFactor: 1.8,
        frictionFactor: 0.6,
        airResistanceFactor: 0.6,
        maxSpeed: 35.0,
        unlockCondition: 'level7',
        isATC: true
    }
};

// 物理常数
export const BASE_TRACTION_ACCEL = 0.85;
export const BASE_BRAKE_ACCEL = 0.90;
export const BASE_FRICTION_DECEL = 0.06;
export const BASE_AIR_RESISTANCE = 0.004;

// 物理仿真参数
export const MAX_DT = 0.05;               // 单帧时间步上限（秒）
export const BRAKE_SPEED_REF = 15.0;      // 制动减速度的速度因子参考速度（语义独立于 BASE_SPEED）
export const SPEED_EPSILON = 0.001;       // 摩擦方向判定的速度阈值
export const MAX_DECEL_RECORD_SPEED = 0.1; // 记录最大减速度所需的最低速度
export const ACCEL_LIMIT = 2.0;           // 加速度钳制幅度（m/s²）
export const OVERSHOOT_LIMIT = 10;        // 越过站台末端该值（米）判定为冲标
export const STOP_CONFIRM_TIME = 0.5;     // 停稳确认时间（秒）
export const POS_CLAMP_MAX_OFFSET = 50;   // 位置钳制上限 = PLATFORM_END + 该值
export const POS_CLAMP_MIN = -200;        // 位置钳制下限
export const MIN_SPEED = 0.01;            // 速度下限（低于该值视为静止）

// 玩家手柄操作范围
export const MAX_PLAYER_HANDLE = 5;
export const MAX_ATC_HANDLE = 5;

// 手柄响应速率
export const HANDLE_RESPONSE_RATE_UP = 4.0;
export const HANDLE_RESPONSE_RATE_DOWN = 1.2;
export const HANDLE_RELEASE_RATE = 4.0;

// 站台参数
export const PLATFORM_START = 0;
export const PLATFORM_END = 100;

// 列车几何参数
export const TRAIN_LENGTH = 100;
export const NUM_CARS = 10;
export const CAR_LENGTH = TRAIN_LENGTH / NUM_CARS;
export const DOORS_PER_CAR = 2;
export const TOTAL_DOORS = NUM_CARS * DOORS_PER_CAR;
export const DOOR_SPACING = CAR_LENGTH / DOORS_PER_CAR;
export const TARGET_HEAD_POS = PLATFORM_END;

// 屏蔽门位置偏移（相对车头）
export const DOOR_OFFSETS = [];
for (let i = 0; i < TOTAL_DOORS; i++) {
    DOOR_OFFSETS.push(DOOR_SPACING / 2 + i * DOOR_SPACING);
}

// 游戏视口与初始速度
export const VIEWPORT_WIDTH_METERS = 95;
export const BASE_SPEED = 15.0;
export const SPEED_RANDOM_RANGE = 2.78;

// 画布渲染布局常量（render.js 使用）
export const RENDER = {
    trackY: 328,
    zoneHeight: 26,
    zoneOffsetY: 70,
    platY: 238,
    platH: 90,
    trainHeight: 3.4,
    headW: 12,
    headLen: 20,
    doorW: 0.9,
    doorH: 1.8,
};

// ATC 自动驾驶参数
export const ATC = {
    cruiseDist: 150,
    midDist: 50,
    finalDist: 5,

    // ATC列车性能发生变化时，注意速度曲线也要相应调整，以避免超出列车性能范围。
    cruiseSpeed: 15.0,
    midSpeed: 11.8,
    finalSpeed: 1.8,

    // PID 控制器参数
    Kp: 1.53,
    Ki: 0.09,
    Kd: 0.36,
    integralLimit: 1.5,
    accelLimit: 6.5,

    // 手柄换算常数
    tractionAccel: BASE_TRACTION_ACCEL * VEHICLES.ATC.tractionFactor,
    brakeAccel: BASE_BRAKE_ACCEL * VEHICLES.ATC.brakeFactor,
    maxHandle: MAX_ATC_HANDLE,

    // 手柄响应速率
    handleRate: 0.8,
};

// 风区随机幅度（physics.js 使用）
export const WIND = {
    baseMagnitude: 8.0,
    randomRange: 6.0,
};

// 评分与乘客评价阈值
export const SCORING = {
    PERFECT_DEV: 0.15,
    GOOD_DEV: 0.4,
    FAIR_DEV: 0.8,
    PASS_DEV: 1.0,

    BASE_PERFECT: 95,
    BASE_GOOD: 80,
    BASE_FAIR: 65,
    BASE_PASS: 50,

    SMOOTH_MAX_DECEL: 1.0,
    SMOOTH_MAX_CHANGES: 4,
    HARD_BRAKE_DECEL: 2.0,
    JERKY_CHANGES: 12,
    JERKY_DECEL: 1.5,

    SLOW_TIME: 20.0,
    FAST_TIME: 14.0,
    PERFECT_TIME_MIN: 15.5,
    PERFECT_TIME_MAX: 18.5,

    STYLE_BONUS_SMOOTH_PERFECT: 8,
    STYLE_BONUS_SMOOTH: 4,
    STYLE_BONUS_PERFECT_TIME: 4,
    STYLE_BONUS_FAST: 2,
    STYLE_BONUS_HARD_BRAKE: -8,
    STYLE_BONUS_SLOW: -5,
    STYLE_BONUS_JERKY: -10,
};

// 成就判定阈值
export const ACHIEVEMENT_RULES = {
    PRECISION_DEV: 0.15,
    SMOOTH_MAX_DECEL: 1.0,
    TIME_MASTER_MIN: 16.0,
    TIME_MASTER_MAX: 17.0,
    RELEASE_MAX_DT: 3.0,
    RELEASE_MAX_POS: 5.0,
    RELEASE_MAX_SPEED: 3.0,
    ONE_BRAKE_MAX_CHANGES: 5,
    VETERAN_GAMES: 20,
};
