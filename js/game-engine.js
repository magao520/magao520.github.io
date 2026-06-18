/**
 * 星露谷风格 2D 游戏引擎 - 大世界版
 * 200x200 程序化生成地图 + 分块加载
 * 种植 / 钓鱼 / 挖矿 / 采集 / NPC商店
 */

// ===== 常量 =====
const TILE = 48;                 // 每个图块像素大小
const MAP_W = 200, MAP_H = 200;  // 地图尺寸(图块数)
const PLAYER_SPEED = 2.5;         // 角色速度
const CROP_TICK = 1000;           // 作物生长间隔ms
const CHUNK_SIZE = 20;           // 每个区块 20x20

// ===== 地块类型 =====
const T = {
    GRASS: 0, DIRT: 1, TILLED: 2, WATERED: 3,
    PATH: 4, FENCE: 5, WATER: 6, FLOWER: 7,
    HOUSE: 8, DOOR: 9, BRIDGE: 10, STONE: 11,
    TREE: 13, ROCK_MINE: 14, FISH_SPOT: 15, WILD_CROP: 16, NPC_HOUSE: 17
};

// ===== 工具类型 =====
const TOOLS = ['hoe', 'water', 'seed', 'harvest', 'remove'];

// ===== 季节颜色 =====
const SEASON_COLORS = {
    spring: { grass: '#5da843', grassDark: '#4a8c36', tree: '#3d8b37', flower: '#ff69b4' },
    summer: { grass: '#4caf50', grassDark: '#388e3c', tree: '#2e7d32', flower: '#ffeb3b' },
    fall:   { grass: '#c68a3f', grassDark: '#a67330', tree: '#d4552a', flower: '#ff9800' },
    winter: { grass: '#d0d8e0', grassDark: '#b0b8c0', tree: '#607080', flower: '#e0e8f0' }
};

// ===== NPC 类型 =====
const NPC_TYPES = [
    { name: '皮埃尔', role: '种子商人', house: [120, 140], emoji: '👨‍🌾' },
    { name: '克林特', role: '铁匠', house: [130, 140], emoji: '👨‍🔧' },
    { name: '玛妮', role: '杂货商', house: [140, 140], emoji: '👩‍🦰' },
    { name: '威利', role: '渔夫', house: [150, 140], emoji: '👴' },
];

// ===== 鱼类数据 =====
const FISH_TYPES = [
    { name: '鲤鱼', emoji: '🐟', value: 10, weight: 40 },
    { name: '鲈鱼', emoji: '🐠', value: 25, weight: 30 },
    { name: '金枪鱼', emoji: '🐡', value: 50, weight: 20 },
    { name: '传说鱼', emoji: '🦈', value: 200, weight: 10 },
];

// ===== 矿物数据 =====
const MINE_RESULTS = [
    { name: '石头', emoji: '🪨', value: 5, weight: 35 },
    { name: '铜矿', emoji: '🟤', value: 20, weight: 30 },
    { name: '铁矿', emoji: '⬛', value: 50, weight: 20 },
    { name: '金矿', emoji: '🟡', value: 100, weight: 12 },
    { name: '钻石', emoji: '💎', value: 500, weight: 3 },
];

// ===== 采集物数据 =====
const FORAGE_ITEMS = [
    { name: '木材', emoji: '🪵', value: 3, weight: 30, fromTree: true },
    { name: '蘑菇', emoji: '🍄', value: 15, weight: 25, fromTree: false },
    { name: '浆果', emoji: '🫐', value: 10, weight: 25, fromTree: false },
    { name: '野花', emoji: '🌸', value: 5, weight: 20, fromTree: false },
];

// ===== 品质系统 =====
const QUALITY = [
    { name: '普通', prefix: '', color: '#fff', multiplier: 1 },
    { name: '银星', prefix: '★', color: '#c0c0c0', multiplier: 1.25 },
    { name: '金星', prefix: '★★', color: '#ffd700', multiplier: 1.5 },
];

// ===== 商店物品 =====
const SHOP_ITEMS = [
    // 种子 (索引对应 CONFIG.CROPS)
    { type: 'seed', cropIndex: 0, name: '胡萝卜种子', emoji: '🥕', price: 10, desc: '生长快，适合新手' },
    { type: 'seed', cropIndex: 1, name: '番茄种子', emoji: '🍅', price: 20, desc: '产量稳定' },
    { type: 'seed', cropIndex: 2, name: '玉米种子', emoji: '🌽', price: 30, desc: '高价值作物' },
    { type: 'seed', cropIndex: 3, name: '茄子种子', emoji: '🍆', price: 40, desc: '需要耐心' },
    { type: 'seed', cropIndex: 4, name: '南瓜种子', emoji: '🎃', price: 50, desc: '秋季明星' },
    { type: 'seed', cropIndex: 5, name: '草莓种子', emoji: '🍓', price: 60, desc: '甜美多汁' },
    { type: 'seed', cropIndex: 6, name: '西瓜种子', emoji: '🍉', price: 80, desc: '夏日消暑' },
    { type: 'seed', cropIndex: 7, name: '向日葵种子', emoji: '🌻', price: 100, desc: '价值最高' },
    // 鱼饵
    { type: 'bait', name: '鱼饵', emoji: '🪱', price: 10, desc: '提高钓鱼成功率' },
    // 矿镐升级
    { type: 'upgrade', name: '矿镐升级', emoji: '⛏️', price: 200, desc: '挖矿效率翻倍' },
];

// ===== 区域定义 =====
const ZONES = {
    FARM:  { x1: 60, y1: 70, x2: 140, y2: 130 },   // 农场区 (中心, 80x60)
    TOWN:  { x1: 110, y1: 130, x2: 150, y2: 170 },  // 小镇 (东南, 40x40)
    FOREST:{ x1: 10, y1: 10, x2: 60, y2: 60 },       // 森林 (西北, 50x50)
    MINE:  { x1: 150, y1: 10, x2: 190, y2: 50 },     // 矿区 (东北, 40x40)
    LAKE:  { x1: 10, y1: 140, x2: 40, y2: 170 },     // 湖畔 (西南, 30x30)
};

// ===== 游戏状态 =====
class GameState {
    constructor() {
        this.playerName = '';
        this.roomId = '';
        this.coins = 100;
        this.day = 1;
        this.season = 'spring';
        this.seasonIndex = 0;
        this.time = 360;  // 分钟 (6:00 AM = 360)
        this.weather = 'sunny';
        this.currentTool = 0;
        this.selectedSeed = 0;
        this.map = [];
        this.crops = {};   // key: "x,y" -> crop data
        this.playerX = 100 * TILE;
        this.playerY = 100 * TILE;
        this.playerDir = 0; // 0=down 1=up 2=left 3=right
        this.playerFrame = 0;
        this.playerMoving = false;
        this.moveTimer = 0;
        this.particles = [];
        this.floatingTexts = [];
        this.npcs = [];
        this.running = false;
        this.cameraX = 0;
        this.cameraY = 0;
        this.showMinimap = false;

        // 新增属性
        this.inventory = [];          // 背包: [{id, name, emoji, qty, type, value}]
        this.maxInventory = 36;
        this.energy = 100;
        this.maxEnergy = 100;
        this.fishing = false;          // 是否在钓鱼
        this.fishProgress = 0;         // 钓鱼进度 (0~1)
        this.fishBarPos = 0.5;         // 钓鱼条位置 (0~1)
        this.fishBarDir = 1;           // 钓鱼条移动方向
        this.fishBarSpeed = 0.02;      // 钓鱼条速度
        this.fishTarget = 0.5;        // 钓鱼目标区域中心
        this.fishTargetSize = 0.25;    // 钓鱼目标区域大小
        this.shopOpen = false;         // 商店是否打开
        this.miningProgress = {};      // 挖矿进度 {x,y: progress}
        this.worldSeed = Math.random() * 10000;
        this.generatedChunks = new Set();
        this.achievements = [];
        this.hasPickaxeUpgrade = false;
        this.baitCount = 0;
        this.totalHarvested = 0;
        this.totalFishCaught = 0;
        this.totalMined = 0;
        this.totalForaged = 0;
    }
}

// ===== 程序化噪声函数 =====
function noise(x, y, seed) {
    let val = 0;
    val += Math.sin(x * 0.1 + seed) * 0.5;
    val += Math.sin(y * 0.1 + seed * 1.3) * 0.5;
    val += Math.sin((x + y) * 0.07 + seed * 0.7) * 0.3;
    val += Math.sin(x * 0.2 - y * 0.15 + seed * 2.1) * 0.2;
    return val;
}

// ===== 区域判断 =====
function getZone(x, y) {
    if (x >= ZONES.FARM.x1 && x <= ZONES.FARM.x2 && y >= ZONES.FARM.y1 && y <= ZONES.FARM.y2) return 'FARM';
    if (x >= ZONES.TOWN.x1 && x <= ZONES.TOWN.x2 && y >= ZONES.TOWN.y1 && y <= ZONES.TOWN.y2) return 'TOWN';
    if (x >= ZONES.FOREST.x1 && x <= ZONES.FOREST.x2 && y >= ZONES.FOREST.y1 && y <= ZONES.FOREST.y2) return 'FOREST';
    if (x >= ZONES.MINE.x1 && x <= ZONES.MINE.x2 && y >= ZONES.MINE.y1 && y <= ZONES.MINE.y2) return 'MINE';
    if (x >= ZONES.LAKE.x1 && x <= ZONES.LAKE.x2 && y >= ZONES.LAKE.y1 && y <= ZONES.LAKE.y2) return 'LAKE';
    return 'WILD';
}

// ===== 根据位置和噪声生成地形 =====
function getTileAtPosition(x, y, seed) {
    const zone = getZone(x, y);
    const n = noise(x, y, seed);

    switch (zone) {
        case 'FARM': return getFarmTile(x, y, n);
        case 'TOWN': return getTownTile(x, y, n);
        case 'FOREST': return getForestTile(x, y, n);
        case 'MINE': return getMineTile(x, y, n);
        case 'LAKE': return getLakeTile(x, y, n);
        default: return getWildTile(x, y, n);
    }
}

function getFarmTile(x, y, n) {
    const z = ZONES.FARM;

    // 围栏边界
    if (x === z.x1 || x === z.x2 || y === z.y1 || y === z.y2) return T.FENCE;

    // 入口 (南面中间留缺口)
    if (y === z.y2 && x >= 95 && x <= 105) return T.PATH;

    // 谷仓 (农场内偏北)
    if (x >= 95 && x <= 105 && y >= 75 && y <= 80) {
        if (x === 100 && y === 80) return T.DOOR;
        return T.HOUSE;
    }

    // 农田区域 (中间)
    if (x >= 75 && x <= 125 && y >= 90 && y <= 120) {
        // 小路贯穿
        if (x === 100 && y >= 85 && y <= 125) return T.PATH;
        if (y === 105 && x >= 75 && x <= 125) return T.PATH;
        return T.TILLED;
    }

    // 小路从入口到农田
    if (x === 100 && y >= z.y2 && y <= 130) return T.PATH;

    // 花园装饰
    if (x >= 65 && x <= 70 && y >= 75 && y <= 78) return T.FLOWER;
    if (x >= 130 && x <= 135 && y >= 75 && y <= 78) return T.FLOWER;

    // 草地
    return T.GRASS;
}

function getTownTile(x, y, n) {
    const z = ZONES.TOWN;

    // 小镇边界 - 路径
    if (x === z.x1 || x === z.x2 || y === z.y1 || y === z.y2) return T.PATH;

    // NPC 房屋
    for (const npc of NPC_TYPES) {
        const [hx, hy] = npc.house;
        if (x >= hx - 2 && x <= hx + 2 && y >= hy - 2 && y <= hy + 2) {
            if (x === hx && y === hy + 2) return T.DOOR;
            return T.NPC_HOUSE;
        }
    }

    // 小镇广场 (中心)
    if (x >= 125 && x <= 135 && y >= 145 && y <= 155) return T.PATH;

    // 小镇道路
    if (x === 130 && y >= z.y1 && y <= z.y2) return T.PATH;
    if (y === 150 && x >= z.x1 && x <= z.x2) return T.PATH;

    // 装饰花
    if (n > 0.5 && (x < z.x1 + 5 || x > z.x2 - 5)) return T.FLOWER;

    return T.GRASS;
}

function getForestTile(x, y, n) {
    const z = ZONES.FOREST;

    // 森林边界
    if (x === z.x1 || x === z.x2 || y === z.y1 || y === z.y2) {
        return T.TREE;
    }

    // 小路穿过森林
    if (x === 35 && y >= z.y1 && y <= z.y2) return T.PATH;

    // 密集树木区域 (噪声决定)
    if (n > 0.3) return T.TREE;

    // 采集物
    if (n > -0.2 && n <= 0.3) return T.WILD_CROP;

    // 偶尔石头
    if (n < -0.5 && Math.abs(noise(x * 3, y * 3, 42)) > 0.8) return T.STONE;

    return T.GRASS;
}

function getMineTile(x, y, n) {
    const z = ZONES.MINE;

    // 矿区边界
    if (x === z.x1 || x === z.x2 || y === z.y1 || y === z.y2) {
        return T.STONE;
    }

    // 入口路径
    if (x === 170 && y >= z.y2 && y <= z.y2 + 5) return T.PATH;

    // 矿岩 (噪声决定分布)
    if (n > 0.1) return T.ROCK_MINE;

    // 碎石地面
    if (n > -0.3) return T.DIRT;

    // 偶尔空地
    return T.GRASS;
}

function getLakeTile(x, y, n) {
    const z = ZONES.LAKE;

    // 湖畔边界
    if (x === z.x1 || x === z.x2 || y === z.y1 || y === z.y2) {
        return T.TREE;
    }

    // 湖心 (椭圆水域)
    const cx = (z.x1 + z.x2) / 2;
    const cy = (z.y1 + z.y2) / 2;
    const rx = (z.x2 - z.x1) / 2 - 3;
    const ry = (z.y2 - z.y1) / 2 - 3;
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    const dist = dx * dx + dy * dy;

    if (dist < 0.7) return T.WATER;

    // 湖边浅水区 + 钓鱼点
    if (dist < 0.9) {
        // 钓鱼点 (特定位置)
        if ((x === 20 && y === 145) || (x === 30 && y === 155) || (x === 15 && y === 160)) {
            return T.FISH_SPOT;
        }
        return T.WATER;
    }

    // 湖畔草地
    if (n > 0.3) return T.TREE;
    if (n > 0) return T.WILD_CROP;

    return T.GRASS;
}

function getWildTile(x, y, n) {
    // 荒野 - 野草、随机石头和花

    // 区域间连接路径
    // 农场到小镇
    if (x === 100 && y >= 130 && y <= 170) return T.PATH;
    // 农场到森林
    if (y === 60 && x >= 35 && x <= 100) return T.PATH;
    // 农场到矿区
    if (x === 150 && y >= 50 && y <= 70) return T.PATH;
    // 农场到湖畔
    if (y === 140 && x >= 40 && x <= 60) return T.PATH;
    // 小镇到湖畔
    if (x === 110 && y >= 140 && y <= 170) return T.PATH;

    // 随机散布
    if (n > 0.6) return T.TREE;
    if (n > 0.4) return T.FLOWER;
    if (n < -0.6) return T.STONE;
    if (n < -0.4 && Math.abs(noise(x * 2, y * 2, 77)) > 0.7) return T.WILD_CROP;

    return T.GRASS;
}

// ===== 分块加载 =====
function generateChunk(state, cx, cy) {
    const chunkKey = `${cx},${cy}`;
    if (state.generatedChunks.has(chunkKey)) return;
    state.generatedChunks.add(chunkKey);

    const startX = cx * CHUNK_SIZE;
    const startY = cy * CHUNK_SIZE;

    for (let y = startY; y < Math.min(startY + CHUNK_SIZE, MAP_H); y++) {
        for (let x = startX; x < Math.min(startX + CHUNK_SIZE, MAP_W); x++) {
            state.map[y][x] = getTileAtPosition(x, y, state.worldSeed);
        }
    }
}

function ensureChunksAroundPlayer(state) {
    const px = Math.floor(state.playerX / TILE);
    const py = Math.floor(state.playerY / TILE);

    // 生成玩家周围 3x3 个区块 (每个区块 20x20, 覆盖 60x60)
    const chunkCX = Math.floor(px / CHUNK_SIZE);
    const chunkCY = Math.floor(py / CHUNK_SIZE);

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const cx = chunkCX + dx;
            const cy = chunkCY + dy;
            if (cx >= 0 && cx < Math.ceil(MAP_W / CHUNK_SIZE) &&
                cy >= 0 && cy < Math.ceil(MAP_H / CHUNK_SIZE)) {
                generateChunk(state, cx, cy);
            }
        }
    }
}

// ===== 地图初始化 (创建空地图 + 生成初始区块) =====
function generateMap(state) {
    // 创建 200x200 空地图
    state.map = [];
    for (let y = 0; y < MAP_H; y++) {
        state.map[y] = new Array(MAP_W).fill(T.GRASS);
    }

    // 生成玩家周围的区块
    ensureChunksAroundPlayer(state);

    // 初始化 NPC
    initNPCs(state);
}

// ===== NPC 初始化 =====
function initNPCs(state) {
    state.npcs = NPC_TYPES.map(npc => ({
        name: npc.name,
        role: npc.role,
        emoji: npc.emoji,
        x: npc.house[0] * TILE,
        y: npc.house[1] * TILE,
        dir: 0,
        moving: false,
        moveTimer: 0,
        homeX: npc.house[0] * TILE,
        homeY: npc.house[1] * TILE,
        wanderTimer: Math.random() * 5,
    }));
}

// ===== NPC 更新 =====
function updateNPCs(state, dt) {
    for (const npc of state.npcs) {
        npc.wanderTimer -= dt;
        if (npc.wanderTimer <= 0) {
            npc.wanderTimer = 3 + Math.random() * 5;
            // 随机决定是否移动
            if (Math.random() < 0.4) {
                npc.moving = true;
                npc.dir = Math.floor(Math.random() * 4);
                npc.moveTimer = 0.5 + Math.random();
            } else {
                npc.moving = false;
            }
        }

        if (npc.moving) {
            npc.moveTimer -= dt;
            if (npc.moveTimer <= 0) {
                npc.moving = false;
            } else {
                const speed = 1;
                const dx = [0, 0, -1, 1][npc.dir];
                const dy = [1, -1, 0, 0][npc.dir];
                const nx = npc.x + dx * speed;
                const ny = npc.y + dy * speed;

                // NPC 不离开小镇区域
                const z = ZONES.TOWN;
                const tx = Math.floor(nx / TILE);
                const ty = Math.floor(ny / TILE);
                if (tx >= z.x1 + 1 && tx <= z.x2 - 1 && ty >= z.y1 + 1 && ty <= z.y2 - 1) {
                    npc.x = nx;
                    npc.y = ny;
                } else {
                    npc.moving = false;
                }
            }
        }
    }
}

// ===== 作物数据 =====
function getCropData(cropId) {
    return CONFIG.CROPS[cropId] || null;
}

// ===== 游戏逻辑 =====
function tickCrops(state, dt) {
    const keys = Object.keys(state.crops);
    for (const key of keys) {
        const crop = state.crops[key];
        if (!crop || crop.growth >= 100) continue;

        const [x, y] = key.split(',').map(Number);
        const tile = state.map[y]?.[x];

        // 水分衰减
        crop.water = Math.max(0, crop.water - 0.03 * dt);

        // 生长
        if (crop.water > 10) {
            const cropData = getCropData(crop.cropId);
            if (cropData) {
                let rate = 0.5 * dt;
                if (crop.fertilized) rate *= 1.5;
                crop.growth = Math.min(100, crop.growth + rate);
            }
        }

        // 更新地块显示
        if (tile === T.TILLED && crop.water > 0) {
            state.map[y][x] = T.WATERED;
        } else if (tile === T.WATERED && crop.water <= 0) {
            state.map[y][x] = T.TILLED;
        }
    }
}

function tickTime(state, dt) {
    state.time += dt * 0.5; // 游戏内1秒 = 0.5分钟

    if (state.time >= 1440) { // 24小时
        state.time = 360; // 6:00 AM
        state.day++;

        // 每28天换季
        if (state.day % 28 === 0) {
            const seasons = ['spring', 'summer', 'fall', 'winter'];
            state.seasonIndex = (state.seasonIndex + 1) % 4;
            state.season = seasons[state.seasonIndex];
        }

        // 每天恢复体力
        state.energy = state.maxEnergy;

        // 野生作物重新生长
        regenerateWildCrops(state);
    }
}

// ===== 野生作物重生 =====
function regenerateWildCrops(state) {
    const px = Math.floor(state.playerX / TILE);
    const py = Math.floor(state.playerY / TILE);
    const range = 30;

    for (let y = py - range; y <= py + range; y++) {
        for (let x = px - range; x <= px + range; x++) {
            if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
            // 远离玩家的野生作物位置重新生长
            const zone = getZone(x, y);
            if (zone === 'FOREST' || zone === 'LAKE' || zone === 'WILD') {
                if (state.map[y][x] === T.GRASS && noise(x, y, state.worldSeed + state.day) > 0) {
                    state.map[y][x] = T.WILD_CROP;
                }
            }
        }
    }
}

function getTimeString(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function isNight(minutes) {
    const h = minutes / 60;
    return h < 6 || h > 20;
}

function getDaylightAlpha(minutes) {
    const h = minutes / 60;
    if (h >= 7 && h <= 18) return 0;
    if (h >= 20 || h <= 5) return 0.45;
    if (h > 5 && h < 7) return 0.45 * (1 - (h - 5) / 2);
    return 0.45 * ((h - 18) / 2);
}

// ===== 加权随机选择 =====
function weightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const item of items) {
        roll -= item.weight;
        if (roll <= 0) return item;
    }
    return items[items.length - 1];
}

// ===== 品质随机 =====
function getRandomQuality() {
    const roll = Math.random();
    if (roll < 0.05) return QUALITY[2]; // 5% 金星
    if (roll < 0.20) return QUALITY[1]; // 15% 银星
    return QUALITY[0];                   // 80% 普通
}

// ===== 背包操作 =====
function addToInventory(state, item) {
    // 查找已有同类物品
    const existing = state.inventory.find(i => i.name === item.name && i.type === item.type);
    if (existing) {
        existing.qty += (item.qty || 1);
    } else {
        if (state.inventory.length >= state.maxInventory) {
            showToast('背包已满！');
            return false;
        }
        state.inventory.push({
            id: Date.now() + Math.random(),
            name: item.name,
            emoji: item.emoji,
            qty: item.qty || 1,
            type: item.type || 'item',
            value: item.value || 0,
            quality: item.quality || QUALITY[0],
        });
    }
    return true;
}

function removeFromInventory(state, name, qty) {
    const item = state.inventory.find(i => i.name === name);
    if (!item || item.qty < qty) return false;
    item.qty -= qty;
    if (item.qty <= 0) {
        state.inventory = state.inventory.filter(i => i !== item);
    }
    return true;
}

function countInInventory(state, name) {
    const item = state.inventory.find(i => i.name === name);
    return item ? item.qty : 0;
}

// ===== 消耗体力 =====
function useEnergy(state, amount) {
    if (state.energy < amount) {
        showToast('体力不足！回去睡觉恢复体力');
        return false;
    }
    state.energy = Math.max(0, state.energy - amount);
    return true;
}

// ===== 成就检查 =====
function checkAchievements(state) {
    const checks = [
        { id: 'first_harvest', name: '初次收获', desc: '第一次收获作物', condition: state.totalHarvested >= 1 },
        { id: 'farmer', name: '勤劳农夫', desc: '收获10次', condition: state.totalHarvested >= 10 },
        { id: 'fisher', name: '钓鱼达人', desc: '钓到5条鱼', condition: state.totalFishCaught >= 5 },
        { id: 'miner', name: '矿工', desc: '挖到10个矿石', condition: state.totalMined >= 10 },
        { id: 'forager', name: '采集者', desc: '采集20次', condition: state.totalForaged >= 20 },
        { id: 'rich', name: '小富翁', desc: '拥有1000金币', condition: state.coins >= 1000 },
    ];

    for (const ach of checks) {
        if (ach.condition && !state.achievements.find(a => a.id === ach.id)) {
            state.achievements.push(ach);
            showToast(`🏆 成就解锁: ${ach.name} - ${ach.desc}`);
        }
    }
}

// ===== 玩家交互 (核心扩展) =====
function interact(state) {
    // 如果商店打开，不处理其他交互
    if (state.shopOpen) return false;

    // 如果在钓鱼中，处理钓鱼操作
    if (state.fishing) {
        return handleFishingInput(state);
    }

    const px = Math.floor((state.playerX + TILE / 2) / TILE);
    const py = Math.floor((state.playerY + TILE / 2) / TILE);

    // 面朝方向的前方一格
    const dx = [0, 0, -1, 1][state.playerDir];
    const dy = [1, -1, 0, 0][state.playerDir];
    const tx = px + dx;
    const ty = py + dy;

    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;

    // 确保目标区块已生成
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    generateChunk(state, cx, cy);

    const tile = state.map[ty][tx];
    const key = `${tx},${ty}`;
    const tool = TOOLS[state.currentTool];

    // ===== 钓鱼点交互 (任何工具都可以钓鱼) =====
    if (tile === T.FISH_SPOT) {
        if (state.energy < 5) {
            showToast('体力不足！');
            return false;
        }
        startFishing(state, tx, ty);
        return true;
    }

    // ===== NPC 房屋交互 (任何工具都可以) =====
    if (tile === T.NPC_HOUSE) {
        // 检查是否面朝门
        if (ty + 1 < MAP_H && state.map[ty + 1][tx] === T.DOOR) {
            openShop(state, tx, ty);
            return true;
        }
        // 直接对NPC房屋交互
        openShop(state, tx, ty);
        return true;
    }

    // ===== 树木交互 (砍树) =====
    if (tile === T.TREE) {
        return handleTreeInteract(state, tx, ty);
    }

    // ===== 矿岩交互 (挖矿) =====
    if (tile === T.ROCK_MINE) {
        return handleMiningInteract(state, tx, ty);
    }

    // ===== 野生采集物交互 =====
    if (tile === T.WILD_CROP) {
        return handleForageInteract(state, tx, ty);
    }

    // ===== 工具交互 (原有逻辑) =====
    switch (tool) {
        case 'hoe':
            if (tile === T.GRASS) {
                if (!useEnergy(state, 2)) return false;
                state.map[ty][tx] = T.TILLED;
                spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '🟫', 3);
                return true;
            }
            break;

        case 'water':
            if (state.crops[key]) {
                state.crops[key].water = 100;
                state.map[ty][tx] = T.WATERED;
                spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '💧', 5);
                return true;
            } else if (tile === T.TILLED) {
                state.map[ty][tx] = T.WATERED;
                spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '💧', 5);
                return true;
            }
            break;

        case 'seed':
            if (tile === T.TILLED || tile === T.WATERED) {
                const cropData = getCropData(state.selectedSeed);
                if (cropData && state.coins >= cropData.price) {
                    state.coins -= cropData.price;
                    state.crops[key] = {
                        cropId: state.selectedSeed,
                        growth: 0,
                        water: tile === T.WATERED ? 80 : 50,
                        fertilized: false,
                        plantedDay: state.day
                    };
                    spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '🌱', 3);
                    addFloatingText(state, tx * TILE, ty * TILE, `-${cropData.price}💰`, '#ff6b6b');
                    return true;
                } else {
                    showToast('金币不足！');
                }
            }
            break;

        case 'harvest':
            if (state.crops[key] && state.crops[key].growth >= 100) {
                return handleHarvest(state, tx, ty, key);
            }
            break;

        case 'remove':
            if (state.crops[key]) {
                delete state.crops[key];
                state.map[ty][tx] = T.TILLED;
                spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '🍂', 4);
                return true;
            }
            if (tile === T.TILLED || tile === T.WATERED) {
                state.map[ty][tx] = T.GRASS;
                return true;
            }
            break;
    }

    return false;
}

// ===== 收获处理 (带品质系统) =====
function handleHarvest(state, tx, ty, key) {
    const crop = state.crops[key];
    const cropData = getCropData(crop.cropId);
    if (!cropData) return false;

    const quality = getRandomQuality();
    const sellPrice = Math.floor(cropData.sellPrice * quality.multiplier * (crop.fertilized ? 1.2 : 1));

    // 加入背包
    addToInventory(state, {
        name: cropData.name,
        emoji: cropData.emoji,
        qty: 1,
        type: 'crop',
        value: sellPrice,
        quality: quality,
    });

    state.totalHarvested++;
    delete state.crops[key];
    state.map[ty][tx] = T.TILLED;

    spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '✨', 8);

    const qualityText = quality.prefix ? ` [${quality.prefix}]` : '';
    addFloatingText(state, tx * TILE, ty * TILE, `+${cropData.emoji}${qualityText}`, quality.color);

    showToast(`收获了 ${quality.prefix}${cropData.name}！价值 ${sellPrice}💰`);
    checkAchievements(state);
    return true;
}

// ===== 钓鱼系统 =====
function startFishing(state, tx, ty) {
    state.fishing = true;
    state.fishProgress = 0;
    state.fishBarPos = 0.5;
    state.fishBarDir = 1;
    state.fishBarSpeed = 0.015 + Math.random() * 0.01;

    // 随机目标区域
    state.fishTarget = 0.2 + Math.random() * 0.6;
    state.fishTargetSize = state.baitCount > 0 ? 0.30 : 0.22;

    // 消耗鱼饵
    if (state.baitCount > 0) {
        state.baitCount--;
    }

    showToast('🎣 钓鱼中！按空格在绿色区域停下');
}

function handleFishingInput(state) {
    // 检查是否在绿色区域内
    const dist = Math.abs(state.fishBarPos - state.fishTarget);
    if (dist <= state.fishTargetSize / 2) {
        // 成功！
        const fish = weightedRandom(FISH_TYPES);
        const quality = getRandomQuality();
        const value = Math.floor(fish.value * quality.multiplier);

        addToInventory(state, {
            name: fish.name,
            emoji: fish.emoji,
            qty: 1,
            type: 'fish',
            value: value,
            quality: quality,
        });

        state.totalFishCaught++;
        state.energy -= 5;
        spawnParticles(state, state.playerX + TILE / 2, state.playerY, '💧', 8);
        addFloatingText(state, state.playerX, state.playerY - 20, `+${fish.emoji} ${quality.prefix}${fish.name}`, quality.color);
        showToast(`钓到了 ${quality.prefix}${fish.name}！价值 ${value}💰`);
    } else {
        // 失败
        state.energy -= 3;
        showToast('鱼跑了...再试试！');
    }

    state.fishing = false;
    checkAchievements(state);
    return true;
}

function updateFishing(state, dt) {
    if (!state.fishing) return;

    // 移动钓鱼条
    state.fishBarPos += state.fishBarDir * state.fishBarSpeed;
    if (state.fishBarPos >= 1) {
        state.fishBarPos = 1;
        state.fishBarDir = -1;
    } else if (state.fishBarPos <= 0) {
        state.fishBarPos = 0;
        state.fishBarDir = 1;
    }

    // 超时自动结束 (10秒)
    state.fishProgress += dt;
    if (state.fishProgress > 10) {
        state.fishing = false;
        showToast('钓鱼超时...');
    }
}

// ===== 挖矿系统 =====
function handleMiningInteract(state, tx, ty) {
    if (!useEnergy(state, 5)) return false;

    const key = `${tx},${ty}`;
    const neededHits = state.hasPickaxeUpgrade ? 2 : 4;

    if (!state.miningProgress[key]) {
        state.miningProgress[key] = 0;
    }

    state.miningProgress[key]++;

    spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '💥', 4);
    addFloatingText(state, tx * TILE, ty * TILE, `⛏️ ${state.miningProgress[key]}/${neededHits}`, '#aaa');

    if (state.miningProgress[key] >= neededHits) {
        // 挖掘成功
        const ore = weightedRandom(MINE_RESULTS);
        const quality = getRandomQuality();
        const value = Math.floor(ore.value * quality.multiplier);

        addToInventory(state, {
            name: ore.name,
            emoji: ore.emoji,
            qty: 1,
            type: 'ore',
            value: value,
            quality: quality,
        });

        state.totalMined++;
        delete state.miningProgress[key];

        // 矿岩变为碎石或空地
        state.map[ty][tx] = T.DIRT;

        spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '✨', 6);
        addFloatingText(state, tx * TILE, ty * TILE - 10, `+${ore.emoji} ${quality.prefix}${ore.name}`, quality.color);
        showToast(`挖到了 ${quality.prefix}${ore.name}！价值 ${value}💰`);
        checkAchievements(state);
    }

    return true;
}

// ===== 采集系统 =====
function handleForageInteract(state, tx, ty) {
    if (!useEnergy(state, 2)) return false;

    const item = weightedRandom(FORAGE_ITEMS);
    const quality = getRandomQuality();
    const value = Math.floor(item.value * quality.multiplier);

    addToInventory(state, {
        name: item.name,
        emoji: item.emoji,
        qty: 1,
        type: 'forage',
        value: value,
        quality: quality,
    });

    state.totalForaged++;
    state.map[ty][tx] = T.GRASS; // 采集后变为草地

    spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '🌿', 4);
    addFloatingText(state, tx * TILE, ty * TILE, `+${item.emoji} ${quality.prefix}${item.name}`, quality.color);
    showToast(`采集了 ${quality.prefix}${item.name}！`);
    checkAchievements(state);
    return true;
}

// ===== 砍树系统 =====
function handleTreeInteract(state, tx, ty) {
    if (!useEnergy(state, 4)) return false;

    const key = `${tx},${ty}`;
    const neededHits = 3;

    if (!state.miningProgress[key]) {
        state.miningProgress[key] = 0;
    }

    state.miningProgress[key]++;

    spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '🪓', 3);
    addFloatingText(state, tx * TILE, ty * TILE, `🪓 ${state.miningProgress[key]}/${neededHits}`, '#8b4513');

    if (state.miningProgress[key] >= neededHits) {
        // 砍树成功
        const woodCount = 1 + Math.floor(Math.random() * 3);

        addToInventory(state, {
            name: '木材',
            emoji: '🪵',
            qty: woodCount,
            type: 'wood',
            value: 3,
            quality: QUALITY[0],
        });

        state.totalForaged++;
        delete state.miningProgress[key];
        state.map[ty][tx] = T.GRASS;

        spawnParticles(state, tx * TILE + TILE / 2, ty * TILE + TILE / 2, '🍃', 8);
        addFloatingText(state, tx * TILE, ty * TILE - 10, `+${woodCount}🪵`, '#8b4513');
        showToast(`获得了 ${woodCount} 个木材！`);
        checkAchievements(state);
    }

    return true;
}

// ===== NPC 商店系统 =====
function openShop(state, tx, ty) {
    // 找到对应的NPC
    let npc = null;
    for (const n of NPC_TYPES) {
        const [hx, hy] = n.house;
        if (Math.abs(tx - hx) <= 3 && Math.abs(ty - hy) <= 3) {
            npc = n;
            break;
        }
    }
    if (!npc) return false;

    state.shopOpen = true;
    state.currentNPC = npc;

    // 使用对话框显示商店
    const dialogBox = document.getElementById('dialog-box');
    const speaker = document.getElementById('dialog-speaker');
    const text = document.getElementById('dialog-text');

    speaker.textContent = `${npc.emoji} ${npc.name} (${npc.role})`;

    let html = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">';

    // 出售按钮
    html += `<button onclick="sellAllItems()" style="padding:6px 12px;background:#4caf50;border:2px solid #2e7d32;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;">💰 出售全部物品</button>`;

    // 购买物品
    for (const item of SHOP_ITEMS) {
        if (item.type === 'seed') {
            const crop = CONFIG.CROPS[item.cropIndex];
            html += `<button onclick="buyItem('${item.type}', ${item.cropIndex}, ${item.price})" style="padding:6px 12px;background:#2196f3;border:2px solid #1565c0;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;">${item.emoji} ${item.name} (${item.price}💰)</button>`;
        } else if (item.type === 'bait') {
            html += `<button onclick="buyItem('${item.type}', 0, ${item.price})" style="padding:6px 12px;background:#2196f3;border:2px solid #1565c0;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;">${item.emoji} ${item.name} (${item.price}💰) [x${window.state ? window.state.baitCount : 0}]</button>`;
        } else if (item.type === 'upgrade') {
            const owned = window.state ? window.state.hasPickaxeUpgrade : false;
            if (!owned) {
                html += `<button onclick="buyItem('${item.type}', 0, ${item.price})" style="padding:6px 12px;background:#ff9800;border:2px solid #e65100;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;">${item.emoji} ${item.name} (${item.price}💰)</button>`;
            } else {
                html += `<span style="padding:6px 12px;background:#666;border:2px solid #444;color:#aaa;font-size:13px;">${item.emoji} 已升级</span>`;
            }
        }
    }

    html += '</div>';
    html += '<div style="margin-top:8px;font-size:12px;color:#aaa;">按 ESC 或空格关闭商店</div>';

    // 显示背包物品
    if (state.inventory.length > 0) {
        html += '<div style="margin-top:8px;font-size:12px;color:#c4a96a;">背包:</div>';
        html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">';
        for (const inv of state.inventory) {
            const qText = inv.quality && inv.quality.prefix ? inv.quality.prefix : '';
            html += `<span style="background:#3d2b1f;border:1px solid #5c3d1e;padding:2px 6px;font-size:11px;color:#f4e8c1;">${inv.emoji}${qText}${inv.name}x${inv.qty} (${inv.value}💰)</span>`;
        }
        html += '</div>';
    }

    text.innerHTML = html;
    dialogBox.classList.add('active');

    showToast(`${npc.emoji} ${npc.name}: 欢迎光临！`);
    return true;
}

function closeShop(state) {
    state.shopOpen = false;
    state.currentNPC = null;
    const dialogBox = document.getElementById('dialog-box');
    dialogBox.classList.remove('active');
}

// ===== 全局商店操作函数 =====
function buyItem(type, index, price) {
    const state = window.state;
    if (!state) return;

    if (state.coins < price) {
        showToast('金币不足！');
        return;
    }

    state.coins -= price;

    if (type === 'seed') {
        const crop = CONFIG.CROPS[index];
        addToInventory(state, {
            name: crop.name + '种子',
            emoji: crop.emoji,
            qty: 1,
            type: 'seed',
            value: crop.price,
            quality: QUALITY[0],
            cropIndex: index,
        });
        showToast(`购买了 ${crop.emoji} ${crop.name}种子`);
    } else if (type === 'bait') {
        state.baitCount += 5;
        showToast(`购买了 5个鱼饵！`);
    } else if (type === 'upgrade') {
        state.hasPickaxeUpgrade = true;
        showToast('⛏️ 矿镐已升级！挖矿效率翻倍！');
    }

    // 刷新商店显示
    if (state.shopOpen && state.currentNPC) {
        // 重新打开商店以刷新UI
        const npc = state.currentNPC;
        closeShop(state);
        state.shopOpen = true;
        state.currentNPC = npc;
        // 简单刷新
        const dialogBox = document.getElementById('dialog-box');
        const speaker = document.getElementById('dialog-speaker');
        const text = document.getElementById('dialog-text');
        speaker.textContent = `${npc.emoji} ${npc.name} (${npc.role})`;

        let html = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">';
        html += `<button onclick="sellAllItems()" style="padding:6px 12px;background:#4caf50;border:2px solid #2e7d32;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;">💰 出售全部物品</button>`;

        for (const item of SHOP_ITEMS) {
            if (item.type === 'seed') {
                const crop = CONFIG.CROPS[item.cropIndex];
                html += `<button onclick="buyItem('${item.type}', ${item.cropIndex}, ${item.price})" style="padding:6px 12px;background:#2196f3;border:2px solid #1565c0;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;">${item.emoji} ${item.name} (${item.price}💰)</button>`;
            } else if (item.type === 'bait') {
                html += `<button onclick="buyItem('${item.type}', 0, ${item.price})" style="padding:6px 12px;background:#2196f3;border:2px solid #1565c0;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;">${item.emoji} ${item.name} (${item.price}💰) [x${state.baitCount}]</button>`;
            } else if (item.type === 'upgrade') {
                if (!state.hasPickaxeUpgrade) {
                    html += `<button onclick="buyItem('${item.type}', 0, ${item.price})" style="padding:6px 12px;background:#ff9800;border:2px solid #e65100;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;">${item.emoji} ${item.name} (${item.price}💰)</button>`;
                } else {
                    html += `<span style="padding:6px 12px;background:#666;border:2px solid #444;color:#aaa;font-size:13px;">${item.emoji} 已升级</span>`;
                }
            }
        }
        html += '</div>';
        html += '<div style="margin-top:8px;font-size:12px;color:#aaa;">按 ESC 或空格关闭商店</div>';

        if (state.inventory.length > 0) {
            html += '<div style="margin-top:8px;font-size:12px;color:#c4a96a;">背包:</div>';
            html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">';
            for (const inv of state.inventory) {
                const qText = inv.quality && inv.quality.prefix ? inv.quality.prefix : '';
                html += `<span style="background:#3d2b1f;border:1px solid #5c3d1e;padding:2px 6px;font-size:11px;color:#f4e8c1;">${inv.emoji}${qText}${inv.name}x${inv.qty} (${inv.value}💰)</span>`;
            }
            html += '</div>';
        }

        text.innerHTML = html;
        dialogBox.classList.add('active');
    }
}

function sellAllItems() {
    const state = window.state;
    if (!state) return;

    let totalValue = 0;
    let soldCount = 0;

    for (const item of state.inventory) {
        totalValue += item.value * item.qty;
        soldCount += item.qty;
    }

    if (soldCount === 0) {
        showToast('背包是空的！');
        return;
    }

    state.coins += totalValue;
    state.inventory = [];

    showToast(`出售了 ${soldCount} 个物品，获得 ${totalValue}💰！`);
    addFloatingText(state, state.playerX, state.playerY - 30, `+${totalValue}💰`, '#ffd93d');

    // 刷新商店
    if (state.shopOpen && state.currentNPC) {
        const npc = state.currentNPC;
        closeShop(state);
        openShop(state, npc.house[0], npc.house[1] - 3);
    }
}

// ===== 粒子系统 =====
function spawnParticles(state, x, y, emoji, count) {
    for (let i = 0; i < count; i++) {
        state.particles.push({
            x: x + (Math.random() - 0.5) * 20,
            y: y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 2,
            vy: -Math.random() * 3 - 1,
            emoji: emoji,
            life: 1,
            decay: 0.02 + Math.random() * 0.02,
            size: 14 + Math.random() * 10
        });
    }
}

function addFloatingText(state, x, y, text, color) {
    state.floatingTexts.push({
        x, y, text, color,
        life: 1,
        decay: 0.015
    });
}

function updateParticles(state, dt) {
    state.particles = state.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= p.decay;
        return p.life > 0;
    });

    state.floatingTexts = state.floatingTexts.filter(t => {
        t.y -= 0.8;
        t.life -= t.decay;
        return t.life > 0;
    });
}

// ===== 碰撞检测 =====
function canMove(state, nx, ny) {
    // 检查角色四个角
    const margin = 8;
    const points = [
        [nx + margin, ny + margin],
        [nx + TILE - margin, ny + margin],
        [nx + margin, ny + TILE - margin],
        [nx + TILE - margin, ny + TILE - margin]
    ];

    for (const [px, py] of points) {
        const tx = Math.floor(px / TILE);
        const ty = Math.floor(py / TILE);

        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;

        // 确保区块已生成
        const cx = Math.floor(tx / CHUNK_SIZE);
        const cy = Math.floor(ty / CHUNK_SIZE);
        generateChunk(state, cx, cy);

        const tile = state.map[ty][tx];
        // 不可通过的地块
        if (tile === T.FENCE || tile === T.HOUSE || tile === T.DOOR ||
            tile === T.WATER || tile === T.STONE || tile === T.TREE ||
            tile === T.ROCK_MINE || tile === T.NPC_HOUSE) {
            return false;
        }
        // 钓鱼点不可通过 (需要站在岸边)
        if (tile === T.FISH_SPOT) return false;
    }

    return true;
}

// ===== Toast =====
let toastTimer = null;
function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ===== 导出 (兼容) =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameState, generateMap, interact, canMove, TILE, MAP_W, MAP_H, T, TOOLS, SEASON_COLORS };
}
