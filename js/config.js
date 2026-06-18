/**
 * 游戏配置
 */
const CONFIG = {
    // 游戏设置
    GAME: {
        GRID_ROWS: 4,
        GRID_COLS: 6,
        TICK_INTERVAL: 1000,      // 游戏心跳间隔(ms)
        WATER_DECAY: 5,           // 水分每秒衰减
        GROWTH_RATE: 2,           // 生长速度
        INITIAL_COINS: 100,       // 初始金币
        MAX_WATER: 100,           // 最大水分
        MAX_GROWTH: 100           // 最大生长值
    },

    // 作物配置
    CROPS: [
        { id: 'carrot', name: '胡萝卜', emoji: '🥕', price: 10, sellPrice: 25, growTime: 30, waterNeed: 30 },
        { id: 'tomato', name: '番茄', emoji: '🍅', price: 20, sellPrice: 50, growTime: 60, waterNeed: 40 },
        { id: 'corn', name: '玉米', emoji: '🌽', price: 30, sellPrice: 80, growTime: 90, waterNeed: 50 },
        { id: 'eggplant', name: '茄子', emoji: '🍆', price: 40, sellPrice: 100, growTime: 120, waterNeed: 45 },
        { id: 'pumpkin', name: '南瓜', emoji: '🎃', price: 50, sellPrice: 150, growTime: 180, waterNeed: 60 },
        { id: 'strawberry', name: '草莓', emoji: '🍓', price: 60, sellPrice: 180, growTime: 240, waterNeed: 55 },
        { id: 'watermelon', name: '西瓜', emoji: '🍉', price: 80, sellPrice: 250, growTime: 300, waterNeed: 70 },
        { id: 'sunflower', name: '向日葵', emoji: '🌻', price: 100, sellPrice: 350, growTime: 360, waterNeed: 50 }
    ],

    // 工具配置
    TOOLS: {
        water: { name: '浇水', cost: 0, effect: 30 },
        fertilize: { name: '施肥', cost: 5, effect: 20 },
        harvest: { name: '收获', cost: 0 },
        remove: { name: '铲除', cost: 0 }
    },

    // GitHub API 配置
    GITHUB: {
        API_BASE: 'https://api.github.com',
        ISSUES_PER_PAGE: 100
    },

    // WebRTC 配置
    WEBRTC: {
        ICE_SERVERS: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ],
        CHANNEL_NAME: 'farm-game-data'
    },

    // 本地存储键名
    STORAGE: {
        PLAYER: 'farm_player',
        FARM: 'farm_data',
        ROOM: 'farm_room'
    }
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
