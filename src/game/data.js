// 成就设计
const ACHIEVEMENTS = {
    precision: { id: 'precision', name: '精准停靠', icon: '🎯', desc: '偏差 ≤ 0.15m', unlocked: false },
    one_brake: { id: 'one_brake', name: '一把闸', icon: '🛑', desc: '一次制动到位', unlocked: false },
    smooth: { id: 'smooth', name: '平稳大师', icon: '🧘', desc: '最大减速度 < 1.0 m/s²', unlocked: false },
    time_master: { id: 'time_master', name: '准时宝', icon: '⏱️', desc: '停靠时间 16.0~17.0s', unlocked: false },
    release: { id: 'release', name: '缓解制动', icon: '🔄', desc: '停稳前缓解制动', unlocked: false },
    veteran: { id: 'veteran', name: '老司机', icon: '🚇', desc: '手动完成20次驾驶', unlocked: false },
};

// 关卡设计
const LEVELS = [{
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
const VEHICLES = {
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
        desc: '牵引力+40%，摩擦+5%',
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
        desc: '制动力+40%，摩擦-5%',
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
        desc: '牵引+40%，制动+40%，阻力略降',
        unlockText: '通关第5关解锁',
        tractionFactor: 1.4,
        brakeFactor: 1.4,
        frictionFactor: 0.98,
        airResistanceFactor: 0.98,
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
const BASE_TRACTION_ACCEL = 0.85;
const BASE_BRAKE_ACCEL = 0.90;
const BASE_FRICTION_DECEL = 0.06;
const BASE_AIR_RESISTANCE = 0.004;

// 手柄操作范围
const MAX_PLAYER_HANDLE = 5;
const MAX_ATC_HANDLE = 3;

// 手柄响应速率
const HANDLE_RESPONSE_RATE_UP = 4.0;
const HANDLE_RESPONSE_RATE_DOWN = 1.2;
const HANDLE_RELEASE_RATE = 4.0;

// 站台参数
const PLATFORM_START = 0;
const PLATFORM_END = 100;

// 列车几何参数
const TRAIN_LENGTH = 100;
const NUM_CARS = 10;
const CAR_LENGTH = TRAIN_LENGTH / NUM_CARS;
const DOORS_PER_CAR = 2;
const TOTAL_DOORS = NUM_CARS * DOORS_PER_CAR;
const DOOR_SPACING = CAR_LENGTH / DOORS_PER_CAR;
const TARGET_HEAD_POS = PLATFORM_END;

// 游戏视口与初始速度、停止速度参数
const VIEWPORT_WIDTH_METERS = 95;
const BASE_SPEED = 15.0;
const SPEED_RANDOM_RANGE = 2.78;
const MIN_SPEED = 0.01;

// 全局数据出口
window.GAME_DATA = {
    ACHIEVEMENTS,
    LEVELS,
    VEHICLES,
    PHYSICS: {
        BASE_TRACTION_ACCEL,
        BASE_BRAKE_ACCEL,
        BASE_FRICTION_DECEL,
        BASE_AIR_RESISTANCE,
        MAX_PLAYER_HANDLE,
        MAX_ATC_HANDLE,
        MIN_SPEED,
        PLATFORM_START,
        PLATFORM_END,
        TRAIN_LENGTH,
        NUM_CARS,
        CAR_LENGTH,
        DOORS_PER_CAR,
        TOTAL_DOORS,
        DOOR_SPACING,
        TARGET_HEAD_POS,
        VIEWPORT_WIDTH_METERS,
        BASE_SPEED,
        SPEED_RANDOM_RANGE,
        HANDLE_RESPONSE_RATE_UP,
        HANDLE_RESPONSE_RATE_DOWN,
        HANDLE_RELEASE_RATE
    }
};
