// ============================================================
// 星露谷物语 - 像素农场  |  完整重写版
// 单文件架构：配置 → 素材加载 → 地图生成 → 游戏状态 → 渲染 → 输入 → 主循环
// ============================================================

'use strict';

// ==================== 常量配置 ====================
const TILE = 48;           // 每格像素 (16x16 * 3)
const MAP_W = 200;         // 地图宽(格)
const MAP_H = 200;         // 地图高(格)
const CHUNK = 20;          // 区块大小
const PLAYER_SPEED = 2.4;  // 像素/帧
const SPRITE_SCALE = 3;    // 精灵缩放

// 瓦片类型
const T = {
  GRASS: 0, DIRT: 1, TILLED: 2, WATERED: 3, PATH: 4, WATER: 5,
  FLOWER: 6, HOUSE: 7, DOOR: 8, STONE: 9, TREE: 10, BRIDGE: 11,
  ROCK: 12, FISH_SPOT: 13, WILD_GRASS: 14, SAND: 15, CAVE_WALL: 16,
  CAVE_FLOOR: 17, CLIFF: 18, FENCE: 19, NPC_HOUSE: 20
};

// 不可通过的瓦片
const SOLID = new Set([T.WATER, T.HOUSE, T.STONE, T.TREE, T.ROCK, T.CAVE_WALL, T.CLIFF, T.FENCE, T.NPC_HOUSE]);

// 季节
const SEASONS = ['spring', 'summer', 'fall', 'winter'];
const SEASON_NAMES = { spring: '春天', summer: '夏天', fall: '秋天', winter: '冬天' };
const SEASON_ICONS = { spring: '🌸', summer: '☀️', fall: '🍂', winter: '❄️' };
const SEASON_GRASS = {
  spring: '#5a9e3e', summer: '#4a8e2e', fall: '#8e7e3e', winter: '#7a8a7a'
};

// 区域定义
const ZONES = {
  FARM:   { x1: 60, y1: 60, x2: 140, y2: 130, name: '农场' },
  TOWN:   { x1: 110, y1: 130, x2: 160, y2: 175, name: '小镇' },
  FOREST: { x1: 5, y1: 5, x2: 55, y2: 55, name: '森林' },
  MINE:   { x1: 145, y1: 5, x2: 195, y2: 55, name: '矿区' },
  LAKE:   { x1: 5, y1: 90, x2: 50, y2: 155, name: '湖畔' },
  WILD:   { x1: 0, y1: 0, x2: 200, y2: 200, name: '荒野' }
};

// 工具定义
const TOOLS = [
  { id: 'hoe', name: '锄头', desc: '翻耕土地', key: '1' },
  { id: 'water', name: '水壶', desc: '浇水', key: '2' },
  { id: 'axe', name: '斧头', desc: '砍树', key: '3' },
  { id: 'pickaxe', name: '镐子', desc: '采矿', key: '4' },
  { id: 'sword', name: '剑', desc: '战斗', key: '5' },
  { id: 'rod', name: '鱼竿', desc: '钓鱼', key: '6' }
];

// 作物定义
const CROPS = {
  potato:     { name: '土豆', seasons: ['spring'], growTime: 4, sellPrice: 80, seedPrice: 20, cropCol: 0 },
  carrot:     { name: '胡萝卜', seasons: ['spring'], growTime: 3, sellPrice: 60, seedPrice: 15, cropCol: 1 },
  tomato:     { name: '番茄', seasons: ['summer'], growTime: 6, sellPrice: 120, seedPrice: 30, cropCol: 2 },
  melon:      { name: '西瓜', seasons: ['summer'], growTime: 8, sellPrice: 200, seedPrice: 40, cropCol: 3 },
  pumpkin:    { name: '南瓜', seasons: ['fall'], growTime: 10, sellPrice: 320, seedPrice: 60, cropCol: 4 },
  corn:       { name: '玉米', seasons: ['summer', 'fall'], growTime: 8, sellPrice: 150, seedPrice: 40, cropCol: 5 },
  strawberry: { name: '草莓', seasons: ['spring'], growTime: 5, sellPrice: 100, seedPrice: 30, cropCol: 6 },
  blueberry:  { name: '蓝莓', seasons: ['summer'], growTime: 7, sellPrice: 180, seedPrice: 50, cropCol: 7 }
};

// NPC定义
const NPC_DEFS = [
  {
    id: 'pierre', name: '皮埃尔', color: '#8B4513',
    x: 130, y: 148, zone: 'TOWN',
    dialog: ['欢迎光临皮埃尔杂货店！', '今天有新鲜的种子，要不要看看？', '种出好作物，卖给我换金币！'],
    shop: true
  },
  {
    id: 'maria', name: '玛丽亚', color: '#FF69B4',
    x: 140, y: 145, zone: 'TOWN',
    dialog: ['你好呀！今天的天气真好。', '你在农场过得怎么样？', '有空来镇上逛逛吧！']
  },
  {
    id: 'oldman', name: '老王', color: '#696969',
    x: 35, y: 35, zone: 'FOREST',
    dialog: ['森林深处有宝贝哦...', '小心迷路了。', '我年轻时也是个冒险家。']
  },
  {
    id: 'miner', name: '矿工杰克', color: '#CD853F',
    x: 165, y: 30, zone: 'MINE',
    dialog: ['矿洞里有很多矿石！', '带把镐子来，你会收获满满。', '小心别挖太深...']
  }
];

// ==================== 素材管理 ====================
const assets = {};

const ASSET_LIST = [
  // 角色精灵 - Tiny Adventure Pack (Char_one)
  'assets/chars/adventure/Tiny Adventure Pack/Char_one/Walk/Char_walk_down.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_one/Walk/Char_walk_up.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_one/Walk/Char_walk_left.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_one/Walk/Char_walk_right.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_one/Idle/Char_idle_down.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_one/Idle/Char_idle_up.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_one/Idle/Char_idle_left.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_one/Idle/Char_idle_right.png',
  // NPC角色 - Char_two
  'assets/chars/adventure/Tiny Adventure Pack/Char_two/Idle/Char2_idle_down.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_two/Walk/Char2_walk_down.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_two/Walk/Char2_walk_up.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_two/Walk/Char2_walk_left.png',
  'assets/chars/adventure/Tiny Adventure Pack/Char_two/Walk/Char2_walk_right.png',
  // 地形瓦片
  'assets/tiles/grass.png',
  'assets/tiles/path.png',
  'assets/tiles/farmland.png',
  'assets/tiles/farm_tiles.png',
  'assets/tiles/water.png',
  'assets/tiles/ocean.png',
  'assets/tiles/sand.png',
  'assets/tiles/dirtgrass.png',
  'assets/tiles/dryland.png',
  // 森林瓦片集
  'assets/tiles/forest_tileset/sprites/trees.png',
  'assets/tiles/forest_tileset/sprites/bushes.png',
  'assets/tiles/forest_tileset/sprites/stones.png',
  'assets/tiles/forest_tileset/sprites/grass.png',
  'assets/tiles/forest_tileset/sprites/grass_dirt.png',
  // 农作物
  'assets/crops/lpc_crops/crops-v2/crops.png',
  'assets/crops/farming set opengameart/Vegetables.png',
  'assets/crops/farming set opengameart/Fruits.png',
  'assets/crops/farming set opengameart/Seeds_Cereals.png',
  // 工具图标
  'assets/icons/stone_axe.png',
  'assets/icons/iron_axe.png',
  'assets/icons/diamond_axe.png',
  // Cozy Pack (建筑用)
  'assets/tiles/cozy_pack/top-down-pack-2.png',
  // 洞穴
  'assets/tiles/cave wall.png',
  'assets/tiles/cave gravel.png',
  'assets/tiles/cliff.png',
  // 其他地形
  'assets/tiles/mud.png',
  'assets/tiles/highland.png',
  'assets/tiles/lilypad.png',
];

function loadAssets() {
  return new Promise((resolve) => {
    let loaded = 0;
    const total = ASSET_LIST.length;
    const bar = document.getElementById('load-bar');
    const text = document.getElementById('load-text');

    ASSET_LIST.forEach((url, i) => {
      const img = new Image();
      img.onload = () => {
        // 用文件名作为key
        const key = url.split('/').pop().replace(/\s/g, '_');
        assets[key] = img;
        loaded++;
        const pct = Math.round((loaded / total) * 100);
        bar.style.width = pct + '%';
        text.textContent = `加载素材中... ${loaded}/${total}`;
        if (loaded === total) resolve();
      };
      img.onerror = () => {
        loaded++;
        if (loaded === total) resolve();
      };
      img.src = url;
    });
  });
}

// ==================== 噪声函数(简单Value Noise) ====================
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) & 0x7fffffff;
}

function noise2D(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash(ix, iy) / 0x7fffffff;
  const n10 = hash(ix + 1, iy) / 0x7fffffff;
  const n01 = hash(ix, iy + 1) / 0x7fffffff;
  const n11 = hash(ix + 1, iy + 1) / 0x7fffffff;
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

function fbm(x, y, octaves = 4) {
  let val = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += noise2D(x * freq, y * freq) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val / max;
}

// ==================== 地图生成 ====================
const map = [];
const cropMap = [];    // [y][x] = { type, stage, day, watered }
const objectMap = [];  // [y][x] = { type, hp, ... }

function generateMap() {
  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    cropMap[y] = [];
    objectMap[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      map[y][x] = generateTile(x, y);
      cropMap[y][x] = null;
      objectMap[y][x] = null;
    }
  }
}

function getZone(tx, ty) {
  for (const [id, z] of Object.entries(ZONES)) {
    if (id === 'WILD') continue;
    if (tx >= z.x1 && tx <= z.x2 && ty >= z.y1 && ty <= z.y2) return id;
  }
  return 'WILD';
}

function generateTile(x, y) {
  const zone = getZone(x, y);
  const n = fbm(x * 0.08, y * 0.08, 3);
  const n2 = hash(x, y) / 0x7fffffff;

  switch (zone) {
    case 'FARM': return genFarm(x, y, n, n2);
    case 'TOWN': return genTown(x, y, n, n2);
    case 'FOREST': return genForest(x, y, n, n2);
    case 'MINE': return genMine(x, y, n, n2);
    case 'LAKE': return genLake(x, y, n, n2);
    default: return genWild(x, y, n, n2);
  }
}

function genFarm(x, y, n, n2) {
  const z = ZONES.FARM;
  // 边界是路径
  if (x === z.x1 || x === z.x2 || y === z.y1 || y === z.y2) return T.PATH;
  // 农场入口
  if (x >= 95 && x <= 105 && y === z.y2) return T.PATH;
  // 房子区域(左上角)
  if (x >= 65 && x <= 72 && y >= 63 && y <= 68) {
    if (x === 68 && y === 68) return T.DOOR;
    if (x >= 66 && x <= 71 && y >= 64 && y <= 67) return T.HOUSE;
  }
  // 池塘(右下)
  const dx = x - 125, dy = y - 115;
  if (dx * dx + dy * dy < 20) return T.WATER;
  // 随机花草(稀疏)
  if (n2 > 0.93) return T.FLOWER;
  // 路径(十字)
  if ((x >= 90 && x <= 110 && y % 20 < 2) || (y >= 80 && y <= 110 && x % 20 < 2)) return T.PATH;
  return T.GRASS;
}

function genTown(x, y, n, n2) {
  const z = ZONES.TOWN;
  // 边界
  if (x === z.x1 || x === z.x2 || y === z.y1 || y === z.y2) return T.PATH;
  // 广场中心路径
  if (x >= 125 && x <= 145 && y >= 140 && y <= 155) return T.PATH;
  // NPC房子
  if (x >= 128 && x <= 133 && y >= 132 && y <= 136) return T.NPC_HOUSE;
  if (x >= 138 && x <= 143 && y >= 132 && y <= 136) return T.NPC_HOUSE;
  if (x >= 148 && x <= 153 && y >= 140 && y <= 144) return T.NPC_HOUSE;
  // 装饰树
  if (n2 > 0.92) return T.TREE;
  if (n2 > 0.88) return T.FLOWER;
  return T.GRASS;
}

function genForest(x, y, n, n2) {
  const z = ZONES.FOREST;
  if (x === z.x1 || x === z.x2 || y === z.y1 || y === z.y2) return T.PATH;
  // 密集树木
  if (n2 > 0.45) return T.TREE;
  // 灌木
  if (n2 > 0.35) return T.WILD_GRASS;
  // 石头
  if (n2 > 0.30) return T.STONE;
  // 小路
  if (Math.abs(x - 30) < 2 || Math.abs(y - 30) < 2) return T.PATH;
  return T.GRASS;
}

function genMine(x, y, n, n2) {
  const z = ZONES.MINE;
  if (x === z.x1 || x === z.x2 || y === z.y1 || y === z.y2) return T.PATH;
  // 矿洞入口区域
  if (x >= 165 && x <= 175 && y >= 20 && y <= 30) {
    if (n2 > 0.5) return T.CAVE_WALL;
    return T.CAVE_FLOOR;
  }
  // 岩石
  if (n2 > 0.7) return T.ROCK;
  if (n2 > 0.6) return T.STONE;
  // 悬崖
  if (n > 0.6 && n2 > 0.5) return T.CLIFF;
  return T.GRASS;
}

function genLake(x, y, n, n2) {
  const z = ZONES.LAKE;
  if (x === z.x1 || x === z.x2 || y === z.y1 || y === z.y2) return T.PATH;
  // 湖水(椭圆)
  const cx = 28, cy = 122;
  const dx = (x - cx) / 18, dy = (y - cy) / 25;
  if (dx * dx + dy * dy < 1) return T.WATER;
  // 沙滩
  if (dx * dx + dy * dy < 1.3) return T.SAND;
  // 钓鱼点
  if (Math.abs(x - 28) < 3 && Math.abs(y - 100) < 2) return T.FISH_SPOT;
  // 岸边树
  if (n2 > 0.8) return T.TREE;
  return T.GRASS;
}

function genWild(x, y, n, n2) {
  // 荒野 - 连接各区域
  // 先检查是否在路径上
  if (isBetweenZones(x, y)) return T.PATH;
  // 路径附近不放树
  const nearPath = isNearPath(x, y);
  if (nearPath) return T.GRASS;
  if (n2 > 0.85) return T.TREE;
  if (n2 > 0.80) return T.WILD_GRASS;
  if (n2 > 0.78) return T.STONE;
  return T.GRASS;
}

function isNearPath(x, y) {
  // 检查周围3格内是否有路径
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
      if (isBetweenZones(nx, ny)) return true;
    }
  }
  return false;
}

function isBetweenZones(x, y) {
  // 农场到小镇(南边连接)
  if (x >= 95 && x <= 105 && y >= 125 && y <= 135) return true;
  // 农场到森林(西北连接)
  if (x >= 55 && x <= 65 && y >= 55 && y <= 65) return true;
  // 农场到湖畔(西边连接)
  if (x >= 50 && x <= 60 && y >= 90 && y <= 100) return true;
  // 农场到矿区(东北连接)
  if (x >= 135 && x <= 145 && y >= 55 && y <= 65) return true;
  // 小镇到矿区(东边连接)
  if (x >= 155 && x <= 165 && y >= 55 && y <= 65) return true;
  // 森林到湖畔(南边连接)
  if (x >= 20 && x <= 35 && y >= 55 && y <= 90) return true;
  // 湖畔到小镇(东边连接)
  if (x >= 45 && x <= 60 && y >= 140 && y <= 160) return true;
  return false;
}

// ==================== 游戏状态 ====================
const state = {
  // 玩家
  px: 68 * TILE, py: 70 * TILE,  // 像素坐标(房子门口)
  dir: 'down',                       // 朝向
  frame: 0, frameTimer: 0,
  moving: false,
  energy: 100, maxEnergy: 100,
  gold: 500,
  
  // 时间
  time: 360,       // 分钟 (6:00 AM = 360)
  day: 1,
  season: 'spring',
  year: 1,
  timeSpeed: 0.15,  // 每帧增加的分钟数(约27秒=游戏1小时)
  
  // 工具
  activeTool: 0,
  
  // 背包 [{id, count, type}]
  inventory: [],
  maxInv: 32,
  
  // NPC
  npcs: [],
  
  // UI状态
  dialogOpen: false,
  dialogLines: [],
  dialogIdx: 0,
  dialogCharIdx: 0,
  dialogTimer: 0,
  invOpen: false,
  shopOpen: false,
  shopNpc: null,
  
  // 浮动文字
  floatTexts: [],
  
  // 粒子效果
  particles: [],
  
  // 游戏状态
  paused: false,
  started: false,
  
  // 相机
  camX: 0, camY: 0
};

function initPlayer() {
  // 给玩家一些初始物品
  state.inventory = [
    { id: 'potato_seeds', count: 15, type: 'seed' },
    { id: 'carrot_seeds', count: 10, type: 'seed' },
    { id: 'stone_axe', count: 1, type: 'tool' }
  ];
}

function initNPCs() {
  state.npcs = NPC_DEFS.map(def => ({
    ...def,
    px: def.x * TILE,
    py: def.y * TILE,
    dir: 'down',
    frame: 0,
    frameTimer: 0,
    moving: false,
    moveTimer: 0,
    targetX: def.x * TILE,
    targetY: def.y * TILE,
    talked: false
  }));
}

// ==================== 碰撞检测 ====================
function canMoveTo(px, py) {
  // 检查角色四个角
  const hw = 12, hh = 8; // 碰撞半宽半高
  const corners = [
    [px - hw, py - hh], [px + hw, py - hh],
    [px - hw, py + hh], [px + hw, py + hh]
  ];
  for (const [cx, cy] of corners) {
    const tx = Math.floor(cx / TILE);
    const ty = Math.floor(cy / TILE);
    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
    if (SOLID.has(map[ty][tx])) return false;
  }
  return true;
}

// ==================== 游戏逻辑 ====================
function updatePlayer() {
  if (state.dialogOpen || state.invOpen || state.shopOpen || state.paused) return;

  let dx = 0, dy = 0;
  if (keys['ArrowUp'] || keys['w'] || keys['W'] || touchDir.up) dy = -1;
  if (keys['ArrowDown'] || keys['s'] || keys['S'] || touchDir.down) dy = 1;
  if (keys['ArrowLeft'] || keys['a'] || keys['A'] || touchDir.left) dx = -1;
  if (keys['ArrowRight'] || keys['d'] || keys['D'] || touchDir.right) dx = 1;

  state.moving = dx !== 0 || dy !== 0;

  if (state.moving) {
    // 朝向
    if (dy < 0) state.dir = 'up';
    else if (dy > 0) state.dir = 'down';
    else if (dx < 0) state.dir = 'left';
    else if (dx > 0) state.dir = 'right';

    // 归一化对角移动
    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    const nx = state.px + dx * PLAYER_SPEED;
    const ny = state.py + dy * PLAYER_SPEED;

    // 分轴碰撞
    if (canMoveTo(nx, state.py)) state.px = nx;
    if (canMoveTo(state.px, ny)) state.py = ny;

    // 动画帧
    state.frameTimer++;
    if (state.frameTimer > 8) {
      state.frame = (state.frame + 1) % 4;
      state.frameTimer = 0;
    }
  } else {
    state.frame = 0;
    state.frameTimer = 0;
  }
}

function updateNPCs() {
  for (const npc of state.npcs) {
    npc.moveTimer++;
    // 简单AI: 随机走动
    if (npc.moveTimer > 120 && !npc.moving) {
      if (Math.random() < 0.3) {
        const angle = Math.random() * Math.PI * 2;
        npc.targetX = npc.px + Math.cos(angle) * TILE * 3;
        npc.targetY = npc.py + Math.sin(angle) * TILE * 3;
        // 限制在区域内
        const z = ZONES[npc.zone];
        npc.targetX = Math.max(z.x1 * TILE, Math.min(z.x2 * TILE, npc.targetX));
        npc.targetY = Math.max(z.y1 * TILE, Math.min(z.y2 * TILE, npc.targetY));
        npc.moving = true;
      }
      npc.moveTimer = 0;
    }

    if (npc.moving) {
      const dx = npc.targetX - npc.px;
      const dy = npc.targetY - npc.py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 4) {
        npc.moving = false;
      } else {
        const speed = 1.2;
        npc.px += (dx / dist) * speed;
        npc.py += (dy / dist) * speed;
        if (Math.abs(dx) > Math.abs(dy)) npc.dir = dx > 0 ? 'right' : 'left';
        else npc.dir = dy > 0 ? 'down' : 'up';
        npc.frameTimer++;
        if (npc.frameTimer > 12) {
          npc.frame = (npc.frame + 1) % 4;
          npc.frameTimer = 0;
        }
      }
    } else {
      npc.frame = 0;
    }
  }
}

function updateTime() {
  if (state.paused) return;
  state.time += state.timeSpeed;
  
  // 新的一天
  if (state.time >= 1440) { // 24:00
    state.time = 360; // 6:00 AM
    advanceDay();
  }
}

function advanceDay() {
  state.day++;
  
  // 作物生长
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const crop = cropMap[y][x];
      if (crop && crop.stage < 5) {
        crop.day++;
        if (crop.day >= crop.growTime) {
          crop.stage = Math.min(5, crop.stage + 1);
          crop.day = 0;
        }
      }
      // 浇水的地变回tilled
      if (map[y][x] === T.WATERED) {
        map[y][x] = T.TILLED;
      }
    }
  }

  // 季节变化(每28天)
  if (state.day > 28) {
    state.day = 1;
    const idx = SEASONS.indexOf(state.season);
    state.season = SEASONS[(idx + 1) % 4];
    if (state.season === 'spring') state.year++;
  }

  // 恢复体力
  state.energy = state.maxEnergy;
}

function useTool() {
  if (state.dialogOpen || state.invOpen || state.shopOpen) return;
  if (state.energy <= 0) {
    showToast('体力不足！');
    return;
  }

  const tool = TOOLS[state.activeTool];
  // 面前的格子
  const offsets = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
  const [ox, oy] = offsets[state.dir];
  const tx = Math.floor(state.px / TILE) + ox;
  const ty = Math.floor(state.py / TILE) + oy;

  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;

  const tile = map[ty][tx];

  switch (tool.id) {
    case 'hoe':
      if (tile === T.GRASS || tile === T.WILD_GRASS) {
        map[ty][tx] = T.TILLED;
        state.energy -= 2;
        spawnParticles(tx * TILE + TILE/2, ty * TILE + TILE/2, '#8B6914', 8, 'burst');
        showToast('翻耕了土地');
      }
      break;

    case 'water':
      if (tile === T.TILLED) {
        map[ty][tx] = T.WATERED;
        state.energy -= 1;
        spawnParticles(tx * TILE + TILE/2, ty * TILE + TILE/2, '#4488CC', 10, 'rise');
      } else if (tile === T.WATERED) {
        showToast('已经浇过水了');
      }
      break;

    case 'axe':
      if (tile === T.TREE) {
        map[ty][tx] = T.GRASS;
        state.energy -= 5;
        addToInventory('wood', 3);
        spawnParticles(tx * TILE + TILE/2, ty * TILE + TILE/2, '#5a9e3e', 12, 'burst');
        showToast('+3 木材');
      }
      break;

    case 'pickaxe':
      if (tile === T.ROCK || tile === T.STONE) {
        map[ty][tx] = T.GRASS;
        state.energy -= 5;
        addToInventory('stone', 2);
        spawnParticles(tx * TILE + TILE/2, ty * TILE + TILE/2, '#808080', 10, 'burst');
        showToast('+2 石头');
      }
      break;

    case 'rod':
      if (tile === T.FISH_SPOT || tile === T.WATER) {
        state.energy -= 3;
        spawnParticles(tx * TILE + TILE/2, ty * TILE + TILE/2, '#4488CC', 6, 'rise');
        const fish = Math.random();
        if (fish > 0.3) {
          addToInventory('fish', 1);
          showToast('钓到了一条鱼！');
        } else {
          showToast('鱼跑了...');
        }
      }
      break;

    case 'sword':
      state.energy -= 1;
      break;
  }
}

function plantCrop() {
  if (state.dialogOpen || state.invOpen || state.shopOpen) return;

  const offsets = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
  const [ox, oy] = offsets[state.dir];
  const tx = Math.floor(state.px / TILE) + ox;
  const ty = Math.floor(state.py / TILE) + oy;

  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;

  const tile = map[ty][tx];
  if (tile !== T.TILLED && tile !== T.WATERED) {
    showToast('需要在耕地上种植');
    return;
  }
  if (cropMap[ty][tx]) {
    showToast('这里已经有作物了');
    return;
  }

  // 找到背包中的种子
  const seedItem = state.inventory.find(i => i.type === 'seed' && i.count > 0);
  if (!seedItem) {
    showToast('没有种子了');
    return;
  }

  // 检查季节
  const cropType = seedItem.id.replace('_seeds', '');
  const cropDef = CROPS[cropType];
  if (!cropDef) return;

  if (!cropDef.seasons.includes(state.season)) {
    showToast(`${cropDef.name}不能在${SEASON_NAMES[state.season]}种植`);
    return;
  }

  // 种植
  seedItem.count--;
  if (seedItem.count <= 0) {
    state.inventory = state.inventory.filter(i => i.count > 0);
  }

  cropMap[ty][tx] = {
    type: cropType,
    stage: 0,
    day: 0,
    watered: tile === T.WATERED,
    growTime: cropDef.growTime
  };

  showToast(`种下了${cropDef.name}`);
}

function harvestCrop() {
  const offsets = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
  const [ox, oy] = offsets[state.dir];
  const tx = Math.floor(state.px / TILE) + ox;
  const ty = Math.floor(state.py / TILE) + oy;

  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;

  const crop = cropMap[ty][tx];
  if (!crop || crop.stage < 4) return;

  const def = CROPS[crop.type];
  addToInventory(crop.type, 1);
  spawnParticles(tx * TILE + TILE/2, ty * TILE + TILE/2, '#FFD700', 15, 'burst');
  showToast(`收获了${def.name}！`);
  cropMap[ty][tx] = null;
  map[ty][tx] = T.TILLED;
}

function interactNPC() {
  if (state.dialogOpen) {
    advanceDialog();
    return;
  }

  // 检查附近的NPC
  for (const npc of state.npcs) {
    const dx = state.px - npc.px;
    const dy = state.py - npc.py;
    if (Math.sqrt(dx * dx + dy * dy) < TILE * 2) {
      if (npc.shop) {
        openShop(npc);
      } else {
        openDialog(npc.name, npc.dialog);
      }
      return;
    }
  }
}

// ==================== 背包系统 ====================
function addToInventory(id, count) {
  const existing = state.inventory.find(i => i.id === id);
  if (existing) {
    existing.count += count;
  } else if (state.inventory.length < state.maxInv) {
    state.inventory.push({ id, count, type: getItemType(id) });
  } else {
    showToast('背包已满！');
  }
}

function removeFromInventory(id, count) {
  const item = state.inventory.find(i => i.id === id);
  if (!item || item.count < count) return false;
  item.count -= count;
  if (item.count <= 0) {
    state.inventory = state.inventory.filter(i => i.count > 0);
  }
  return true;
}

function getItemType(id) {
  if (id.endsWith('_seeds')) return 'seed';
  if (['wood', 'stone', 'fiber'].includes(id)) return 'material';
  if (CROPS[id]) return 'crop';
  if (id === 'fish') return 'fish';
  return 'item';
}

function getItemName(id) {
  if (id.endsWith('_seeds')) {
    const cropType = id.replace('_seeds', '');
    return CROPS[cropType] ? CROPS[cropType].name + '种子' : id;
  }
  if (CROPS[id]) return CROPS[id].name;
  const names = {
    wood: '木材', stone: '石头', fiber: '纤维',
    fish: '鱼', stone_axe: '石斧', iron_axe: '铁斧'
  };
  return names[id] || id;
}

function getItemPrice(id) {
  if (CROPS[id]) return CROPS[id].sellPrice;
  const prices = { wood: 5, stone: 3, fiber: 2, fish: 30 };
  return prices[id] || 0;
}

// ==================== UI系统 ====================
function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function addFloatText(text, x, y) {
  state.floatTexts.push({ text, x, y, life: 60 });
}

// ---- 粒子系统 ----
function spawnParticles(x, y, color, count, type = 'burst') {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = type === 'burst' ? 1 + Math.random() * 3 : 0.5 + Math.random() * 1;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: type === 'rise' ? -1 - Math.random() * 2 : Math.sin(angle) * speed - 1,
      life: 30 + Math.random() * 30,
      maxLife: 60,
      color,
      size: 2 + Math.random() * 3
    });
  }
}

function updateParticles() {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05; // 重力
    p.life--;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of state.particles) {
    const sx = p.x - state.camX;
    const sy = p.y - state.camY;
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(sx - p.size / 2, sy - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function openDialog(speaker, lines) {
  state.dialogOpen = true;
  state.dialogLines = lines;
  state.dialogIdx = 0;
  state.dialogCharIdx = 0;
  state.dialogTimer = 0;
  document.getElementById('dialog-speaker').textContent = speaker;
  document.getElementById('dialog-text').textContent = '';
  document.getElementById('dialog').classList.add('open');
}

function advanceDialog() {
  state.dialogIdx++;
  if (state.dialogIdx >= state.dialogLines.length) {
    state.dialogOpen = false;
    document.getElementById('dialog').classList.remove('open');
    return;
  }
  state.dialogCharIdx = 0;
  state.dialogTimer = 0;
}

function updateDialog() {
  if (!state.dialogOpen) return;
  const line = state.dialogLines[state.dialogIdx];
  if (state.dialogCharIdx < line.length) {
    state.dialogTimer++;
    if (state.dialogTimer > 1) {
      state.dialogCharIdx++;
      state.dialogTimer = 0;
    }
  }
  document.getElementById('dialog-text').textContent = line.substring(0, state.dialogCharIdx);
}

function toggleInventory() {
  state.invOpen = !state.invOpen;
  const el = document.getElementById('inventory');
  if (state.invOpen) {
    el.classList.add('open');
    renderInventoryUI();
  } else {
    el.classList.remove('open');
  }
}

function renderInventoryUI() {
  const grid = document.getElementById('inv-grid');
  grid.innerHTML = '';
  for (let i = 0; i < state.maxInv; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    if (i < state.inventory.length) {
      const item = state.inventory[i];
      const name = getItemName(item.id);
      slot.innerHTML = `<span style="font-size:11px;color:#E8D5A3">${name.substring(0, 2)}</span>`;
      if (item.count > 1) {
        slot.innerHTML += `<span class="count">${item.count}</span>`;
      }
      slot.innerHTML += `<span class="item-name">${name}</span>`;
      // 右键出售
      slot.oncontextmenu = (e) => {
        e.preventDefault();
        sellItem(i);
      };
    }
    grid.appendChild(slot);
  }
}

function sellItem(idx) {
  const item = state.inventory[idx];
  if (!item) return;
  const price = getItemPrice(item.id);
  if (price <= 0) return;
  state.gold += price;
  item.count--;
  if (item.count <= 0) {
    state.inventory.splice(idx, 1);
  }
  showToast(`卖出 ${getItemName(item.id)} +${price}G`);
  renderInventoryUI();
}

function openShop(npc) {
  state.shopOpen = true;
  state.shopNpc = npc;
  const el = document.getElementById('shop');
  el.classList.add('open');
  document.getElementById('shop-title').textContent = npc.name + '的商店';

  const list = document.getElementById('shop-list');
  list.innerHTML = '';

  // 种子商品
  for (const [id, crop] of Object.entries(CROPS)) {
    if (!crop.seasons.includes(state.season)) continue;
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.innerHTML = `
      <div class="item-icon" style="background:#5a9e3e;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px">🌱</div>
      <div class="item-info">
        <div class="item-name">${crop.name}种子</div>
        <div class="item-desc">生长${crop.growTime}天 · 售价${crop.sellPrice}G</div>
      </div>
      <div class="item-price">${crop.seedPrice}G</div>
    `;
    div.onclick = () => buyItem(id + '_seeds', crop.seedPrice, crop.name + '种子');
    list.appendChild(div);
  }
}

function buyItem(id, price, name) {
  if (state.gold < price) {
    showToast('金币不足！');
    return;
  }
  if (state.inventory.length >= state.maxInv && !state.inventory.find(i => i.id === id)) {
    showToast('背包已满！');
    return;
  }
  state.gold -= price;
  addToInventory(id, 1);
  showToast(`购买了${name}`);
}

function closeShop() {
  state.shopOpen = false;
  state.shopNpc = null;
  document.getElementById('shop').classList.remove('open');
}

// ==================== 工具栏UI ====================
function buildToolbar() {
  const toolbar = document.getElementById('toolbar');
  toolbar.innerHTML = '';
  TOOLS.forEach((tool, i) => {
    const slot = document.createElement('div');
    slot.className = 'tool-slot' + (i === state.activeTool ? ' active' : '');
    slot.innerHTML = `
      <canvas width="32" height="32"></canvas>
      <span class="tool-name">${tool.name}</span>
      <span class="hotkey">${tool.key}</span>
    `;
    // 画工具图标
    const c = slot.querySelector('canvas');
    const ctx = c.getContext('2d');
    drawToolIcon(ctx, tool.id, 32);
    
    slot.onclick = () => {
      state.activeTool = i;
      buildToolbar();
    };
    toolbar.appendChild(slot);
  });
}

function drawToolIcon(ctx, toolId, size) {
  ctx.clearRect(0, 0, size, size);
  const s = size * 0.7;
  const cx = size / 2, cy = size / 2;

  ctx.save();
  switch (toolId) {
    case 'hoe':
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.4);
      ctx.lineTo(cx, cy + s * 0.4);
      ctx.stroke();
      ctx.fillStyle = '#A0A0A0';
      ctx.fillRect(cx - s * 0.3, cy - s * 0.4, s * 0.6, s * 0.2);
      break;
    case 'water':
      ctx.fillStyle = '#4488CC';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.3);
      ctx.bezierCurveTo(cx + s * 0.4, cy - s * 0.1, cx + s * 0.3, cy + s * 0.3, cx, cy + s * 0.4);
      ctx.bezierCurveTo(cx - s * 0.3, cy + s * 0.3, cx - s * 0.4, cy - s * 0.1, cx, cy - s * 0.3);
      ctx.fill();
      break;
    case 'axe':
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.1, cy - s * 0.4);
      ctx.lineTo(cx + s * 0.1, cy + s * 0.4);
      ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.1, cy - s * 0.4);
      ctx.lineTo(cx - s * 0.35, cy - s * 0.2);
      ctx.lineTo(cx - s * 0.1, cy);
      ctx.fill();
      break;
    case 'pickaxe':
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.2, cy + s * 0.4);
      ctx.stroke();
      ctx.fillStyle = '#AAA';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.2, cy - s * 0.3);
      ctx.lineTo(cx, cy - s * 0.1);
      ctx.fill();
      break;
    case 'sword':
      ctx.fillStyle = '#CCC';
      ctx.fillRect(cx - 2, cy - s * 0.4, 4, s * 0.6);
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(cx - s * 0.15, cy + s * 0.1, s * 0.3, s * 0.15);
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(cx - s * 0.08, cy - s * 0.4, s * 0.16, s * 0.1);
      break;
    case 'rod':
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.4);
      ctx.lineTo(cx + s * 0.3, cy - s * 0.3);
      ctx.stroke();
      ctx.strokeStyle = '#888';
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.3, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.1, cy - s * 0.1);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

// ==================== HUD更新 ====================
function updateHUD() {
  // 时间
  const hours = Math.floor(state.time / 60);
  const mins = Math.floor(state.time % 60);
  document.getElementById('hud-time').textContent = 
    `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

  // 日期
  document.getElementById('hud-day').textContent = `第 ${state.day} 天`;

  // 金币
  document.getElementById('hud-gold').textContent = `${state.gold}G`;

  // 区域
  const tx = Math.floor(state.px / TILE);
  const ty = Math.floor(state.py / TILE);
  const zone = getZone(tx, ty);
  document.getElementById('hud-area').textContent = ZONES[zone].name;

  // 体力
  document.getElementById('hud-energy').textContent = `${state.energy}/${state.maxEnergy}`;

  // 季节
  document.getElementById('season-icon').textContent = SEASON_ICONS[state.season];
  document.getElementById('season-name').textContent = SEASON_NAMES[state.season];
  document.getElementById('year-num').textContent = `第 ${state.year} 年`;
}

// ==================== 渲染引擎 ====================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function updateCamera() {
  state.camX = state.px - canvas.width / 2;
  state.camY = state.py - canvas.height / 2;
  // 限制相机范围
  state.camX = Math.max(0, Math.min(MAP_W * TILE - canvas.width, state.camX));
  state.camY = Math.max(0, Math.min(MAP_H * TILE - canvas.height, state.camY));
}

function render() {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  updateCamera();

  // 计算可见范围
  const startTX = Math.max(0, Math.floor(state.camX / TILE) - 1);
  const startTY = Math.max(0, Math.floor(state.camY / TILE) - 1);
  const endTX = Math.min(MAP_W, Math.ceil((state.camX + canvas.width) / TILE) + 1);
  const endTY = Math.min(MAP_H, Math.ceil((state.camY + canvas.height) / TILE) + 1);

  // 收集所有需要Y排序渲染的对象
  const renderList = [];

  // 地面层
  for (let ty = startTY; ty < endTY; ty++) {
    for (let tx = startTX; tx < endTX; tx++) {
      const sx = tx * TILE - state.camX;
      const sy = ty * TILE - state.camY;
      drawTile(tx, ty, sx, sy);

      // 作物
      if (cropMap[ty] && cropMap[ty][tx]) {
        renderList.push({
          type: 'crop',
          y: ty * TILE + TILE,
          tx, ty, sx, sy
        });
      }
    }
  }

  // NPC
  for (const npc of state.npcs) {
    const sx = npc.px - state.camX;
    const sy = npc.py - state.camY;
    if (sx > -TILE * 2 && sx < canvas.width + TILE * 2 &&
        sy > -TILE * 2 && sy < canvas.height + TILE * 2) {
      renderList.push({
        type: 'npc',
        y: npc.py + 16,
        npc, sx, sy
      });
    }
  }

  // 玩家
  renderList.push({
    type: 'player',
    y: state.py + 16,
    sx: state.px - state.camX,
    sy: state.py - state.camY
  });

  // Y排序渲染
  renderList.sort((a, b) => a.y - b.y);
  for (const obj of renderList) {
    switch (obj.type) {
      case 'crop': drawCrop(obj.tx, obj.ty, obj.sx, obj.sy); break;
      case 'npc': drawCharacter(obj.npc, obj.sx, obj.sy, true); break;
      case 'player': drawCharacter(state, obj.sx, obj.sy, false); break;
    }
  }

  // 日夜光照
  drawDayNightOverlay();

  // 浮动文字
  drawFloatTexts();

  // 粒子效果
  drawParticles();

  // NPC互动提示
  drawNPCPrompts();

  // 当前工具/物品提示
  drawActionHint();
}

function drawTile(tx, ty, sx, sy) {
  const tile = map[ty][tx];
  const season = state.season;

  switch (tile) {
    case T.GRASS:
    case T.WILD_GRASS:
      drawGrassTile(sx, sy, tx, ty);
      break;
    case T.DIRT:
      ctx.fillStyle = '#8B7355';
      ctx.fillRect(sx, sy, TILE, TILE);
      break;
    case T.TILLED:
      drawTilledTile(sx, sy);
      break;
    case T.WATERED:
      drawWateredTile(sx, sy);
      break;
    case T.PATH:
      drawPathTile(sx, sy, tx, ty);
      break;
    case T.WATER:
      drawWaterTile(sx, sy, tx, ty);
      break;
    case T.FLOWER:
      drawGrassTile(sx, sy, tx, ty);
      drawFlower(sx, sy, tx, ty);
      break;
    case T.HOUSE:
      drawHouse(sx, sy, tx, ty);
      break;
    case T.DOOR:
      drawDoor(sx, sy);
      break;
    case T.STONE:
      drawGrassTile(sx, sy, tx, ty);
      drawStone(sx, sy, tx, ty);
      break;
    case T.TREE:
      drawGrassTile(sx, sy, tx, ty);
      drawTree(sx, sy, tx, ty);
      break;
    case T.ROCK:
      drawGrassTile(sx, sy, tx, ty);
      drawRock(sx, sy, tx, ty);
      break;
    case T.BRIDGE:
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = '#A0782C';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(sx + i * 12, sy, 2, TILE);
      }
      break;
    case T.FISH_SPOT:
      drawWaterTile(sx, sy, tx, ty);
      // 钓鱼标记
      ctx.fillStyle = '#FFD700';
      ctx.font = '16px sans-serif';
      ctx.fillText('🎣', sx + 14, sy + 32);
      break;
    case T.SAND:
      drawSandTile(sx, sy, tx, ty);
      break;
    case T.CAVE_WALL:
      drawCaveWall(sx, sy);
      break;
    case T.CAVE_FLOOR:
      drawCaveFloor(sx, sy);
      break;
    case T.CLIFF:
      drawCliff(sx, sy);
      break;
    case T.FENCE:
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(sx + 4, sy + 8, 4, 32);
      ctx.fillRect(sx + TILE - 8, sy + 8, 4, 32);
      ctx.fillRect(sx + 2, sy + 12, TILE - 4, 4);
      break;
    case T.NPC_HOUSE:
      drawNPCHouse(sx, sy, tx, ty);
      break;
  }
}

// ---- 瓦片绘制函数 ----

function drawGrassTile(sx, sy, tx, ty) {
  const base = SEASON_GRASS[state.season];
  const n = hash(tx, ty) / 0x7fffffff;
  // 微小变化
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  const variation = (n - 0.5) * 20;
  ctx.fillStyle = `rgb(${r + variation}, ${g + variation}, ${b + variation})`;
  ctx.fillRect(sx, sy, TILE, TILE);
  
  // 草的细节
  if (n > 0.7) {
    ctx.fillStyle = `rgba(${r - 20}, ${g + 15}, ${b - 10}, 0.5)`;
    ctx.fillRect(sx + n * 20, sy + n * 15, 3, 6);
    ctx.fillRect(sx + n * 30 + 5, sy + n * 25, 2, 5);
  }
}

function drawTilledTile(sx, sy) {
  ctx.fillStyle = '#6B4226';
  ctx.fillRect(sx, sy, TILE, TILE);
  // 犁沟
  ctx.fillStyle = '#5A3520';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(sx + 2, sy + 4 + i * 12, TILE - 4, 3);
  }
}

function drawWateredTile(sx, sy) {
  ctx.fillStyle = '#4A2E18';
  ctx.fillRect(sx, sy, TILE, TILE);
  ctx.fillStyle = '#3A2515';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(sx + 2, sy + 4 + i * 12, TILE - 4, 3);
  }
  // 湿润效果
  ctx.fillStyle = 'rgba(60, 100, 150, 0.2)';
  ctx.fillRect(sx, sy, TILE, TILE);
}

function drawPathTile(sx, sy, tx, ty) {
  const n = hash(tx, ty) / 0x7fffffff;
  ctx.fillStyle = n > 0.5 ? '#C4A46C' : '#B89860';
  ctx.fillRect(sx, sy, TILE, TILE);
  // 路面纹理
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  if (n > 0.6) ctx.fillRect(sx + 10, sy + 15, 8, 6);
  if (n > 0.3) ctx.fillRect(sx + 28, sy + 30, 6, 5);
}

function drawWaterTile(sx, sy, tx, ty) {
  const t = Date.now() / 1000;
  const wave = Math.sin(t * 2 + tx * 0.5 + ty * 0.3) * 0.1;
  const r = 40 + wave * 30;
  const g = 100 + wave * 20;
  const b = 180 + wave * 20;
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(sx, sy, TILE, TILE);
  // 波纹
  ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + wave * 0.05})`;
  const wx = (Math.sin(t + tx) + 1) * 15;
  ctx.fillRect(sx + wx, sy + 10, 12, 2);
  ctx.fillRect(sx + wx + 8, sy + 28, 10, 2);
}

function drawSandTile(sx, sy, tx, ty) {
  const n = hash(tx, ty) / 0x7fffffff;
  ctx.fillStyle = n > 0.5 ? '#E8D5A3' : '#DEC896';
  ctx.fillRect(sx, sy, TILE, TILE);
}

function drawFlower(sx, sy, tx, ty) {
  const n = hash(tx * 7, ty * 13) / 0x7fffffff;
  const colors = ['#FF6B9D', '#FFD700', '#FF4500', '#DA70D6', '#87CEEB'];
  const color = colors[Math.floor(n * colors.length)];
  const fx = sx + 12 + n * 20;
  const fy = sy + 10 + (n * 37 % 20);
  // 茎
  ctx.fillStyle = '#3a7a2a';
  ctx.fillRect(fx + 3, fy + 6, 2, 10);
  // 花瓣
  ctx.fillStyle = color;
  ctx.fillRect(fx, fy, 4, 4);
  ctx.fillRect(fx + 4, fy, 4, 4);
  ctx.fillRect(fx, fy + 4, 4, 4);
  ctx.fillRect(fx + 4, fy + 4, 4, 4);
  // 花心
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(fx + 2, fy + 2, 4, 4);
}

function drawStone(sx, sy, tx, ty) {
  const n = hash(tx, ty) / 0x7fffffff;
  const size = 16 + n * 12;
  ctx.fillStyle = '#808080';
  ctx.beginPath();
  ctx.ellipse(sx + TILE / 2, sy + TILE / 2 + 4, size / 2, size / 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#909090';
  ctx.beginPath();
  ctx.ellipse(sx + TILE / 2 - 2, sy + TILE / 2, size / 2 - 2, size / 3 - 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTree(sx, sy, tx, ty) {
  const n = hash(tx, ty) / 0x7fffffff;
  const season = state.season;
  
  // 树干
  ctx.fillStyle = '#6B4226';
  ctx.fillRect(sx + 18, sy + 20, 12, 28);
  
  // 树冠颜色根据季节变化
  let leafColor;
  switch (season) {
    case 'spring': leafColor = '#4CAF50'; break;
    case 'summer': leafColor = '#2E7D32'; break;
    case 'fall': leafColor = n > 0.5 ? '#FF8C00' : '#DAA520'; break;
    case 'winter': leafColor = '#87CEEB'; break;
  }
  
  // 树冠
  ctx.fillStyle = leafColor;
  ctx.beginPath();
  ctx.arc(sx + 24, sy + 16, 18, 0, Math.PI * 2);
  ctx.fill();
  
  // 高光
  ctx.fillStyle = season === 'winter' ? '#FFFFFF' : 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(sx + 20, sy + 12, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawRock(sx, sy, tx, ty) {
  ctx.fillStyle = '#696969';
  ctx.fillRect(sx + 6, sy + 12, 36, 28);
  ctx.fillStyle = '#808080';
  ctx.fillRect(sx + 8, sy + 10, 32, 24);
  ctx.fillStyle = '#909090';
  ctx.fillRect(sx + 10, sy + 8, 16, 12);
  // 矿石闪光
  const t = Date.now() / 500;
  if (Math.sin(t + tx + ty) > 0.7) {
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(sx + 20, sy + 18, 4, 4);
  }
}

function drawHouse(sx, sy, tx, ty) {
  const z = ZONES.FARM;
  const hx1 = 65, hy1 = 63, hx2 = 72, hy2 = 68;
  
  // 只在房子左上角绘制完整建筑
  if (tx === hx1 && ty === hy1) {
    const w = (hx2 - hx1 + 1) * TILE;
    const h = (hy2 - hy1 + 1) * TILE;
    const bx = sx;
    const by = sy;
    
    // 墙壁
    ctx.fillStyle = '#D2B48C';
    ctx.fillRect(bx, by + 24, w, h - 24);
    
    // 屋顶(三角形)
    ctx.fillStyle = '#8B0000';
    ctx.beginPath();
    ctx.moveTo(bx - 8, by + 28);
    ctx.lineTo(bx + w / 2, by - 10);
    ctx.lineTo(bx + w + 8, by + 28);
    ctx.closePath();
    ctx.fill();
    
    // 屋顶高光
    ctx.fillStyle = '#A52A2A';
    ctx.beginPath();
    ctx.moveTo(bx - 4, by + 28);
    ctx.lineTo(bx + w / 2, by - 4);
    ctx.lineTo(bx + w / 2, by + 28);
    ctx.closePath();
    ctx.fill();
    
    // 烟囱
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(bx + w * 0.7, by - 5, 16, 25);
    
    // 窗户(两行两列)
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(bx + 20, by + 44, 28, 24);
    ctx.fillRect(bx + w - 48, by + 44, 28, 24);
    // 窗框
    ctx.fillStyle = '#5A3A1A';
    ctx.fillRect(bx + 33, by + 44, 2, 24);
    ctx.fillRect(bx + 20, by + 55, 28, 2);
    ctx.fillRect(bx + w - 35, by + 44, 2, 24);
    ctx.fillRect(bx + w - 48, by + 55, 28, 2);
    
    // 门
    ctx.fillStyle = '#5A3A1A';
    ctx.fillRect(bx + w / 2 - 14, by + h - 40, 28, 40);
    // 门把手
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(bx + w / 2 + 6, by + h - 20, 4, 4);
    // 门上方的灯
    ctx.fillStyle = '#FFE4B5';
    ctx.fillRect(bx + w / 2 - 6, by + h - 44, 12, 8);
  } else {
    // 其他格子只画墙壁
    ctx.fillStyle = '#D2B48C';
    ctx.fillRect(sx, sy, TILE, TILE);
  }
}

function drawDoor(sx, sy) {
  // 门已经整合到drawHouse中了，这里只画地面
  ctx.fillStyle = '#C4A46C';
  ctx.fillRect(sx, sy, TILE, TILE);
  // 门口台阶
  ctx.fillStyle = '#A08050';
  ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
}

function drawNPCHouse(sx, sy, tx, ty) {
  // 不同颜色的房子 - 检查是否是左上角
  const isTopLeft = (tx === 128 && ty === 132) || (tx === 138 && ty === 132) || (tx === 148 && ty === 140);
  
  if (isTopLeft) {
    const n = hash(tx, ty) / 0x7fffffff;
    const wallColors = ['#E8D5A3', '#C4A46C', '#B8C4A0', '#D4B896'];
    const roofColors = ['#8B4513', '#A0522D', '#6B8E23', '#4682B4'];
    const w = 6 * TILE; // 6格宽
    const h = 5 * TILE; // 5格高
    
    const wallColor = wallColors[Math.floor(n * wallColors.length)];
    const roofColor = roofColors[Math.floor(n * roofColors.length)];
    
    // 墙壁
    ctx.fillStyle = wallColor;
    ctx.fillRect(sx, sy + 20, w, h - 20);
    
    // 屋顶
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy + 24);
    ctx.lineTo(sx + w / 2, sy - 8);
    ctx.lineTo(sx + w + 4, sy + 24);
    ctx.closePath();
    ctx.fill();
    
    // 窗户
    ctx.fillStyle = '#FFE4B5';
    ctx.fillRect(sx + 24, sy + 40, 20, 16);
    ctx.fillRect(sx + w - 44, sy + 40, 20, 16);
    
    // 门
    ctx.fillStyle = '#5A3A1A';
    ctx.fillRect(sx + w / 2 - 10, sy + h - 32, 20, 32);
  } else {
    // 非左上角只画墙壁
    const n = hash(Math.floor(tx / 6) * 6, Math.floor(ty / 5) * 5) / 0x7fffffff;
    const wallColors = ['#E8D5A3', '#C4A46C', '#B8C4A0', '#D4B896'];
    ctx.fillStyle = wallColors[Math.floor(n * wallColors.length)];
    ctx.fillRect(sx, sy, TILE, TILE);
  }
}

function drawCaveWall(sx, sy) {
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(sx, sy, TILE, TILE);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(sx + 4, sy + 4, 8, 8);
  ctx.fillRect(sx + 24, sy + 20, 10, 10);
  ctx.fillRect(sx + 14, sy + 32, 6, 6);
}

function drawCaveFloor(sx, sy) {
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(sx, sy, TILE, TILE);
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(sx + 8, sy + 12, 4, 4);
  ctx.fillRect(sx + 28, sy + 30, 6, 4);
}

function drawCliff(sx, sy) {
  ctx.fillStyle = '#696969';
  ctx.fillRect(sx, sy, TILE, TILE);
  ctx.fillStyle = '#808080';
  ctx.fillRect(sx, sy, TILE, 8);
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(sx + 10, sy + 16, 8, 6);
  ctx.fillRect(sx + 30, sy + 28, 6, 8);
}

// ---- 作物绘制 ----
function drawCrop(tx, ty, sx, sy) {
  const crop = cropMap[ty][tx];
  if (!crop) return;
  
  const def = CROPS[crop.type];
  if (!def) return;
  
  // 根据生长阶段绘制
  const stage = crop.stage;
  const cx = sx + TILE / 2;
  const baseY = sy + TILE - 4;

  if (stage === 0) {
    // 种子 - 小点
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(cx - 2, baseY - 4, 4, 4);
  } else if (stage === 1) {
    // 发芽
    ctx.fillStyle = '#3a7a2a';
    ctx.fillRect(cx - 1, baseY - 10, 2, 10);
    ctx.fillStyle = '#5a9e3e';
    ctx.fillRect(cx - 4, baseY - 12, 8, 4);
  } else if (stage === 2) {
    // 小苗
    ctx.fillStyle = '#3a7a2a';
    ctx.fillRect(cx - 1, baseY - 18, 2, 18);
    ctx.fillStyle = '#5a9e3e';
    ctx.fillRect(cx - 6, baseY - 20, 12, 6);
    ctx.fillRect(cx - 8, baseY - 16, 6, 4);
  } else if (stage === 3) {
    // 成长
    ctx.fillStyle = '#3a7a2a';
    ctx.fillRect(cx - 1, baseY - 26, 2, 26);
    ctx.fillStyle = '#5a9e3e';
    ctx.fillRect(cx - 10, baseY - 28, 20, 8);
    ctx.fillRect(cx - 12, baseY - 22, 8, 6);
    ctx.fillRect(cx + 4, baseY - 22, 8, 6);
  } else if (stage === 4) {
    // 成熟 - 带果实
    ctx.fillStyle = '#3a7a2a';
    ctx.fillRect(cx - 1, baseY - 30, 2, 30);
    ctx.fillStyle = '#5a9e3e';
    ctx.fillRect(cx - 12, baseY - 32, 24, 10);
    ctx.fillRect(cx - 14, baseY - 26, 10, 8);
    ctx.fillRect(cx + 4, baseY - 26, 10, 8);
    // 果实
    const fruitColors = {
      potato: '#C4A46C', carrot: '#FF8C00', tomato: '#FF6347',
      melon: '#2E8B57', pumpkin: '#FF8C00', corn: '#FFD700',
      strawberry: '#FF6B9D', blueberry: '#4169E1'
    };
    ctx.fillStyle = fruitColors[crop.type] || '#FF6347';
    ctx.beginPath();
    ctx.arc(cx, baseY - 34, 6, 0, Math.PI * 2);
    ctx.fill();
    // 闪光提示可收获
    const t = Date.now() / 400;
    if (Math.sin(t) > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(cx, baseY - 34, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---- 角色绘制 ----
function drawCharacter(charState, sx, sy, isNpc) {
  ctx.save();
  const dir = charState.dir;
  const frame = charState.frame;

  // 角色阴影
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 20, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isNpc) {
    // NPC用不同颜色
    drawPixelChar(ctx, sx, sy, dir, frame, charState.color || '#8B4513', true);
    // 名字
    ctx.fillStyle = '#FFD700';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(charState.name, sx, sy - 24);
    ctx.textAlign = 'left';
  } else {
    // 玩家
    drawPixelChar(ctx, sx, sy, dir, frame, '#4169E1', false);
  }

  ctx.restore();
}

function drawPixelChar(ctx, sx, sy, dir, frame, mainColor, isNpc) {
  // 简单像素角色 (16x24 逻辑像素, 缩放3x)
  const s = 3; // 缩放
  const ox = sx - 12; // 居中偏移
  const oy = sy - 18;

  // 头发颜色
  const hairColor = isNpc ? '#5A3A1A' : '#FFD700';
  // 皮肤
  const skinColor = '#FFDAB9';
  // 衣服
  const shirtColor = mainColor;
  // 裤子
  const pantsColor = isNpc ? '#4A4A4A' : '#1E3A5F';
  // 鞋
  const shoeColor = '#5A3A1A';

  // 身体偏移(行走动画)
  let bodyOffY = 0;
  let legFrame = 0;
  if (frame > 0) {
    bodyOffY = Math.sin(frame * Math.PI / 2) * -1;
    legFrame = frame % 4;
  }

  // 根据方向绘制
  const facing = dir === 'up' || dir === 'down';

  // 头
  ctx.fillStyle = skinColor;
  ctx.fillRect(ox + 4 * s, oy + bodyOffY, 8 * s, 8 * s);

  // 头发
  ctx.fillStyle = hairColor;
  if (dir === 'down' || dir === 'left' || dir === 'right') {
    ctx.fillRect(ox + 4 * s, oy + bodyOffY, 8 * s, 3 * s);
    if (dir === 'left') ctx.fillRect(ox + 3 * s, oy + bodyOffY, 2 * s, 6 * s);
    if (dir === 'right') ctx.fillRect(ox + 11 * s, oy + bodyOffY, 2 * s, 6 * s);
  } else { // up
    ctx.fillRect(ox + 4 * s, oy + bodyOffY, 8 * s, 8 * s);
  }

  // 眼睛(正面和侧面)
  if (dir === 'down') {
    ctx.fillStyle = '#000';
    ctx.fillRect(ox + 5 * s, oy + 4 * s + bodyOffY, s, s);
    ctx.fillRect(ox + 10 * s, oy + 4 * s + bodyOffY, s, s);
  } else if (dir === 'left') {
    ctx.fillStyle = '#000';
    ctx.fillRect(ox + 5 * s, oy + 4 * s + bodyOffY, s, s);
  } else if (dir === 'right') {
    ctx.fillStyle = '#000';
    ctx.fillRect(ox + 10 * s, oy + 4 * s + bodyOffY, s, s);
  }

  // 身体/衣服
  ctx.fillStyle = shirtColor;
  ctx.fillRect(ox + 4 * s, oy + 8 * s + bodyOffY, 8 * s, 6 * s);

  // 手臂
  ctx.fillStyle = skinColor;
  if (dir === 'down' || dir === 'up') {
    ctx.fillRect(ox + 2 * s, oy + 8 * s + bodyOffY, 2 * s, 5 * s);
    ctx.fillRect(ox + 12 * s, oy + 8 * s + bodyOffY, 2 * s, 5 * s);
  } else {
    ctx.fillRect(ox + (dir === 'left' ? 2 : 12) * s, oy + 8 * s + bodyOffY, 2 * s, 5 * s);
  }

  // 裤子
  ctx.fillStyle = pantsColor;
  ctx.fillRect(ox + 4 * s, oy + 14 * s + bodyOffY, 8 * s, 4 * s);

  // 腿(行走动画)
  ctx.fillStyle = pantsColor;
  if (legFrame === 1 || legFrame === 3) {
    ctx.fillRect(ox + 4 * s, oy + 14 * s + bodyOffY, 3 * s, 5 * s);
    ctx.fillRect(ox + 9 * s, oy + 14 * s + bodyOffY, 3 * s, 5 * s);
  } else {
    ctx.fillRect(ox + 5 * s, oy + 14 * s + bodyOffY, 3 * s, 5 * s);
    ctx.fillRect(ox + 8 * s, oy + 14 * s + bodyOffY, 3 * s, 5 * s);
  }

  // 鞋
  ctx.fillStyle = shoeColor;
  if (legFrame === 1) {
    ctx.fillRect(ox + 3 * s, oy + 19 * s + bodyOffY, 4 * s, 2 * s);
    ctx.fillRect(ox + 9 * s, oy + 19 * s + bodyOffY, 4 * s, 2 * s);
  } else if (legFrame === 3) {
    ctx.fillRect(ox + 5 * s, oy + 19 * s + bodyOffY, 4 * s, 2 * s);
    ctx.fillRect(ox + 7 * s, oy + 19 * s + bodyOffY, 4 * s, 2 * s);
  } else {
    ctx.fillRect(ox + 4 * s, oy + 19 * s + bodyOffY, 4 * s, 2 * s);
    ctx.fillRect(ox + 8 * s, oy + 19 * s + bodyOffY, 4 * s, 2 * s);
  }
}

// ---- 日夜光照 ----
function drawDayNightOverlay() {
  const hour = state.time / 60;
  let alpha = 0;

  if (hour < 6) alpha = 0.6;           // 深夜
  else if (hour < 7) alpha = 0.6 - (hour - 6) * 0.6;  // 日出
  else if (hour < 18) alpha = 0;       // 白天
  else if (hour < 20) alpha = (hour - 18) * 0.3;  // 黄昏
  else alpha = 0.6;                     // 夜晚

  if (alpha > 0) {
    ctx.fillStyle = `rgba(10, 10, 40, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// ---- 浮动文字 ----
function drawFloatTexts() {
  for (let i = state.floatTexts.length - 1; i >= 0; i--) {
    const ft = state.floatTexts[i];
    ft.life--;
    ft.y -= 0.5;
    if (ft.life <= 0) {
      state.floatTexts.splice(i, 1);
      continue;
    }
    const alpha = ft.life / 60;
    const sx = ft.x - state.camX;
    const sy = ft.y - state.camY;
    ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, sx, sy);
    ctx.textAlign = 'left';
  }
}

// ---- NPC互动提示 ----
function drawNPCPrompts() {
  for (const npc of state.npcs) {
    const dx = state.px - npc.px;
    const dy = state.py - npc.py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < TILE * 2.5) {
      const sx = npc.px - state.camX;
      const sy = npc.py - state.camY;
      // 互动气泡
      const bobY = Math.sin(Date.now() / 300) * 3;
      ctx.fillStyle = 'rgba(30, 20, 10, 0.8)';
      ctx.beginPath();
      ctx.roundRect(sx - 28, sy - 44 + bobY, 56, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#FFD700';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(npc.shop ? 'Q 商店' : 'Q 对话', sx, sy - 30 + bobY);
      ctx.textAlign = 'left';
    }
  }
}

// ---- 操作提示 ----
function drawActionHint() {
  if (state.dialogOpen || state.invOpen || state.shopOpen) return;
  
  const offsets = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
  const [ox, oy] = offsets[state.dir];
  const tx = Math.floor(state.px / TILE) + ox;
  const ty = Math.floor(state.py / TILE) + oy;

  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
  
  const tile = map[ty][tx];
  const tool = TOOLS[state.activeTool];
  let hint = '';

  if (tool.id === 'hoe' && (tile === T.GRASS || tile === T.WILD_GRASS)) hint = '空格 翻地';
  else if (tool.id === 'water' && tile === T.TILLED) hint = '空格 浇水';
  else if (tool.id === 'axe' && tile === T.TREE) hint = '空格 砍树';
  else if (tool.id === 'pickaxe' && (tile === T.ROCK || tile === T.STONE)) hint = '空格 采石';
  else if (tool.id === 'rod' && (tile === T.WATER || tile === T.FISH_SPOT)) hint = '空格 钓鱼';
  else if (cropMap[ty][tx] && cropMap[ty][tx].stage >= 4) hint = 'E 收获';
  else if ((tile === T.TILLED || tile === T.WATERED) && !cropMap[ty][tx]) {
    const seedItem = state.inventory.find(i => i.type === 'seed' && i.count > 0);
    if (seedItem) hint = 'E 种植';
  }

  if (hint) {
    const sx = tx * TILE + TILE / 2 - state.camX;
    const sy = ty * TILE - 8 - state.camY;
    ctx.fillStyle = 'rgba(30, 20, 10, 0.7)';
    ctx.beginPath();
    ctx.roundRect(sx - 30, sy - 8, 60, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#E8D5A3';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(hint, sx, sy + 4);
    ctx.textAlign = 'left';
  }
}

// ---- 小地图 ----
function renderMinimap() {
  const mc = document.getElementById('minimap');
  const mctx = mc.getContext('2d');
  const mw = mc.width, mh = mc.height;
  mctx.imageSmoothingEnabled = false;
  mctx.clearRect(0, 0, mw, mh);

  const scale = mw / MAP_W;

  // 绘制区域颜色
  for (const [id, z] of Object.entries(ZONES)) {
    if (id === 'WILD') continue;
    const colors = {
      FARM: '#5a9e3e', TOWN: '#C4A46C', FOREST: '#2E7D32',
      MINE: '#696969', LAKE: '#4488CC'
    };
    mctx.fillStyle = colors[id] || '#5a9e3e';
    mctx.fillRect(z.x1 * scale, z.y1 * scale, (z.x2 - z.x1) * scale, (z.y2 - z.y1) * scale);
  }

  // 玩家位置
  const px = (state.px / TILE) * scale;
  const py = (state.py / TILE) * scale;
  mctx.fillStyle = '#FF0000';
  mctx.fillRect(px - 2, py - 2, 4, 4);

  // NPC位置
  for (const npc of state.npcs) {
    const nx = (npc.px / TILE) * scale;
    const ny = (npc.py / TILE) * scale;
    mctx.fillStyle = '#FFD700';
    mctx.fillRect(nx - 1, ny - 1, 3, 3);
  }
}

// ==================== 输入系统 ====================
const keys = {};
const touchDir = { up: false, down: false, left: false, right: false };

document.addEventListener('keydown', (e) => {
  keys[e.key] = true;

  // 工具切换
  if (e.key >= '1' && e.key <= '6') {
    state.activeTool = parseInt(e.key) - 1;
    buildToolbar();
  }

  // 空格 - 使用工具/互动
  if (e.key === ' ') {
    e.preventDefault();
    if (state.dialogOpen) {
      advanceDialog();
    } else {
      useTool();
    }
  }

  // E - 种植/收获
  if (e.key === 'e' || e.key === 'E') {
    harvestCrop();
    plantCrop();
  }

  // I - 背包
  if (e.key === 'i' || e.key === 'I') {
    toggleInventory();
  }

  // ESC - 关闭面板
  if (e.key === 'Escape') {
    if (state.shopOpen) closeShop();
    else if (state.invOpen) toggleInventory();
    else if (state.dialogOpen) {
      state.dialogOpen = false;
      document.getElementById('dialog').classList.remove('open');
    }
  }

  // Q - 互动NPC
  if (e.key === 'q' || e.key === 'Q') {
    interactNPC();
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// 触摸控制
document.querySelectorAll('.dpad-btn').forEach(btn => {
  const dir = btn.dataset.dir;
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); touchDir[dir] = true; });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); touchDir[dir] = false; });
  btn.addEventListener('touchcancel', (e) => { touchDir[dir] = false; });
});

// 防止触摸滚动
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// ==================== 主循环 ====================
let lastTime = 0;
let minimapTimer = 0;

function gameLoop(timestamp) {
  if (!state.started) return;

  // 更新
  updatePlayer();
  updateNPCs();
  updateTime();
  updateDialog();
  updateParticles();

  // 渲染
  render();

  // HUD (每10帧更新一次)
  if (timestamp - lastTime > 100) {
    updateHUD();
    lastTime = timestamp;
  }

  // 小地图 (每30帧更新一次)
  minimapTimer++;
  if (minimapTimer > 30) {
    renderMinimap();
    minimapTimer = 0;
  }

  requestAnimationFrame(gameLoop);
}

// ==================== 初始化 ====================
async function init() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // 加载素材
  await loadAssets();

  // 生成地图
  generateMap();

  // 初始化玩家
  initPlayer();

  // 初始化NPC
  initNPCs();

  // 构建工具栏
  buildToolbar();

  // 隐藏加载画面，显示游戏
  document.getElementById('loading').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('season-badge').style.display = 'block';
  document.getElementById('toolbar').style.display = 'flex';
  document.getElementById('minimap-container').style.display = 'block';

  // 开始游戏
  state.started = true;

  // 欢迎对话
  setTimeout(() => {
    openDialog('系统', [
      '欢迎来到星露谷！',
      '这里是你继承的农场，虽然有些荒废...',
      '用 锄头(1) 翻地，水壶(2) 浇水，然后种下种子(E)',
      '作物成熟后按 E 收获，到镇上找皮埃尔卖掉换金币！',
      'WASD/方向键移动，空格使用工具，Q与NPC对话',
      '祝你在这里过上好日子！'
    ]);
  }, 500);

  requestAnimationFrame(gameLoop);
}

// 启动
init().catch(err => {
  console.error('初始化失败:', err);
  document.getElementById('load-text').textContent = '加载失败: ' + err.message;
});
