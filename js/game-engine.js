/**
 * 星露谷风格 2D 游戏引擎
 * Canvas 渲染 + 角色移动 + 农场交互
 */

// ===== 常量 =====
const TILE = 48;                // 每个图块像素大小
const MAP_W = 30, MAP_H = 25;   // 地图尺寸(图块数)
const PLAYER_SPEED = 2.5;       // 角色速度
const CROP_TICK = 1000;          // 作物生长间隔ms

// ===== 地块类型 =====
const T = {
    GRASS: 0, DIRT: 1, TILLED: 2, WATERED: 3,
    PATH: 4, FENCE: 5, WATER: 6, FLOWER: 7,
    HOUSE: 8, DOOR: 9, BRIDGE: 10, STONE: 11
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

// ===== 游戏状态 =====
class GameState {
    constructor() {
        this.playerName = '';
        this.roomId = '';
        this.coins = 500;
        this.day = 1;
        this.season = 'spring';
        this.seasonIndex = 0;
        this.time = 360;  // 分钟 (6:00 AM = 360)
        this.weather = 'sunny';
        this.currentTool = 0;
        this.selectedSeed = 0;
        this.map = [];
        this.crops = {};   // key: "x,y" -> crop data
        this.playerX = 15 * TILE;
        this.playerY = 20 * TILE;
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
    }
}

// ===== 作物数据 =====
function getCropData(cropId) {
    return CONFIG.CROPS[cropId] || null;
}

// ===== 地图生成 =====
function generateMap(state) {
    state.map = [];
    for (let y = 0; y < MAP_H; y++) {
        state.map[y] = [];
        for (let x = 0; x < MAP_W; x++) {
            // 默认草地
            let tile = T.GRASS;
            
            // 农田区域 (中间)
            if (x >= 8 && x <= 22 && y >= 8 && y <= 18) {
                tile = T.TILLED;
            }
            
            // 小路
            if (x === 15 && y >= 5 && y <= 20) tile = T.PATH;
            if (y === 20 && x >= 8 && x <= 22) tile = T.PATH;
            
            // 围栏
            if ((x === 7 || x === 23) && y >= 7 && y <= 19) tile = T.FENCE;
            if ((y === 7 || y === 19) && x >= 7 && x <= 23) tile = T.FENCE;
            
            // 房子区域
            if (x >= 2 && x <= 6 && y >= 2 && y <= 5) tile = T.HOUSE;
            if (x === 4 && y === 5) tile = T.DOOR;
            
            // 池塘
            const dx = x - 25, dy = y - 12;
            if (dx*dx + dy*dy < 6) tile = T.WATER;
            
            // 花园
            if (x >= 1 && x <= 3 && y >= 7 && y <= 9) tile = T.FLOWER;
            
            // 石头装饰
            if ((x === 10 && y === 10) || (x === 20 && y === 15)) tile = T.STONE;
            
            state.map[y][x] = tile;
        }
    }
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
        crop.water = Math.max(0, crop.water - 0.05 * dt);
        
        // 生长
        if (crop.water > 10) {
            const cropData = getCropData(crop.cropId);
            if (cropData) {
                let rate = 0.02 * dt;
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
        
        // 每7天换季
        if (state.day % 28 === 0) {
            const seasons = ['spring', 'summer', 'fall', 'winter'];
            state.seasonIndex = (state.seasonIndex + 1) % 4;
            state.season = seasons[state.seasonIndex];
        }
    }
}

function getTimeString(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
}

function isNight(minutes) {
    const h = minutes / 60;
    return h < 6 || h > 20;
}

function getDaylightAlpha(minutes) {
    const h = minutes / 60;
    if (h >= 7 && h <= 18) return 0;        // 白天
    if (h >= 20 || h <= 5) return 0.45;       // 夜晚
    if (h > 5 && h < 7) return 0.45 * (1 - (h - 5) / 2);  // 日出
    return 0.45 * ((h - 18) / 2);            // 日落
}

// ===== 玩家交互 =====
function interact(state) {
    const px = Math.floor((state.playerX + TILE/2) / TILE);
    const py = Math.floor((state.playerY + TILE/2) / TILE);
    
    // 面朝方向的前方一格
    const dx = [0, 0, -1, 1][state.playerDir];
    const dy = [1, -1, 0, 0][state.playerDir];
    const tx = px + dx;
    const ty = py + dy;
    
    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
    
    const tile = state.map[ty][tx];
    const key = `${tx},${ty}`;
    const tool = TOOLS[state.currentTool];
    
    switch (tool) {
        case 'hoe':
            if (tile === T.GRASS) {
                state.map[ty][tx] = T.TILLED;
                spawnParticles(state, tx * TILE + TILE/2, ty * TILE + TILE/2, '🟫', 3);
                return true;
            }
            break;
            
        case 'water':
            if (state.crops[key]) {
                state.crops[key].water = 100;
                state.map[ty][tx] = T.WATERED;
                spawnParticles(state, tx * TILE + TILE/2, ty * TILE + TILE/2, '💧', 5);
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
                    spawnParticles(state, tx * TILE + TILE/2, ty * TILE + TILE/2, '🌱', 3);
                    addFloatingText(state, tx * TILE, ty * TILE, `-${cropData.price}💰`, '#ff6b6b');
                    return true;
                } else {
                    showToast('金币不足！');
                }
            }
            break;
            
        case 'harvest':
            if (state.crops[key] && state.crops[key].growth >= 100) {
                const crop = state.crops[key];
                const cropData = getCropData(crop.cropId);
                const sellPrice = crop.fertilized ? Math.floor(cropData.sellPrice * 1.2) : cropData.sellPrice;
                state.coins += sellPrice;
                delete state.crops[key];
                state.map[ty][tx] = T.TILLED;
                spawnParticles(state, tx * TILE + TILE/2, ty * TILE + TILE/2, '✨', 8);
                addFloatingText(state, tx * TILE, ty * TILE, `+${sellPrice}💰`, '#ffd93d');
                return true;
            }
            break;
            
        case 'remove':
            if (state.crops[key]) {
                delete state.crops[key];
                state.map[ty][tx] = T.TILLED;
                spawnParticles(state, tx * TILE + TILE/2, ty * TILE + TILE/2, '🍂', 4);
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
        
        const tile = state.map[ty][tx];
        if (tile === T.FENCE || tile === T.HOUSE || tile === T.WATER || tile === T.STONE) {
            return false;
        }
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
