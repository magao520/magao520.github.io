// ============================================================
// 废土交易所 v31.0 - Project Zomboid 风格
// 核心特性: Y轴排序 | 黑暗视野 | 拾取交互 | 僵尸敌人
// ============================================================
'use strict';

// ========== 游戏配置 ==========
const CONFIG = {
  MAP_W: 1600,
  MAP_H: 1200,
  TILE: 32,
  PLAYER_SPEED: 120,
  SPRINT_SPEED: 200,
  ZOMBIE_SPEED: 20,
  VISION_RADIUS: 180,
  PICKUP_RANGE: 48,
  RAY_LENGTH: 40
};

// ========== Y轴排序渲染器 ==========
class YSortRenderer {
  constructor() {
    this.renderList = [];
  }

  add(obj) {
    this.renderList.push(obj);
  }

  clear() {
    this.renderList = [];
  }

  sort() {
    // 按脚底Y值排序（Y大的在后面=在前面遮挡）
    this.renderList.sort((a, b) => {
      const ya = a.y + (a.footOffset || 0);
      const yb = b.y + (b.footOffset || 0);
      return ya - yb;
    });
  }

  draw(ctx) {
    this.sort();
    for (const obj of this.renderList) {
      obj.draw(ctx);
    }
  }
}

// ========== 粒子系统 ==========
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.max = 150;
  }

  emit(type, x, y, opts = {}) {
    const count = opts.count || 1;
    for (let i = 0; i < count && this.particles.length < this.max; i++) {
      this.particles.push(this.create(type, x, y, opts));
    }
  }

  create(type, x, y, opts) {
    const configs = {
      muzzle: { vx: (Math.random()-0.5)*150, vy: (Math.random()-0.5)*150, life: 0.12, size: 4, color: '#ff8800', decay: 0.85 },
      blood: { vx: (Math.random()-0.5)*80, vy: (Math.random()-0.5)*80, life: 0.5, size: 3, color: '#8b2020', decay: 0.9 },
      dust: { vx: (Math.random()-0.5)*30, vy: -20-Math.random()*20, life: 0.8, size: 2, color: 'rgba(100,90,70,0.4)', decay: 0.95 },
      smoke: { vx: (Math.random()-0.5)*20, vy: -30-Math.random()*20, life: 1.5, size: 8, color: 'rgba(80,80,80,0.3)', decay: 0.97 }
    };
    const c = configs[type] || configs.dust;
    return { x, y, vx: c.vx, vy: c.vy, life: c.life, maxLife: c.life, size: c.size, color: c.color, decay: c.decay };
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.decay;
      p.vy *= p.decay;
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ========== 地图 ==========
class GameMap {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.tiles = [];
    this.objects = [];
    this.pillars = []; // 测试立柱
    this.items = []; // 可拾取物品
    this.generate();
  }

  generate() {
    // 地面
    for (let x = 0; x < this.w; x += CONFIG.TILE) {
      for (let y = 0; y < this.h; y += CONFIG.TILE) {
        const road = Math.abs(x - this.w/2) < 50 || Math.abs(y - this.h/2) < 50;
        this.tiles.push({
          x, y,
          color: road ? this.roadColor(x,y) : this.groundColor(x,y)
        });
      }
    }

    // 房屋
    for (let i = 0; i < 6; i++) {
      this.objects.push({
        type: 'house', x: 150+Math.random()*(this.w-300), y: 150+Math.random()*(this.h-300),
        w: 80+Math.random()*40, h: 60+Math.random()*30,
        footOffset: 30 // 脚底在房屋底部
      });
    }

    // 树木
    for (let i = 0; i < 30; i++) {
      this.objects.push({
        type: 'tree', x: Math.random()*this.w, y: Math.random()*this.h,
        size: 20+Math.random()*15, footOffset: 15
      });
    }

    // 石头
    for (let i = 0; i < 15; i++) {
      this.objects.push({
        type: 'rock', x: Math.random()*this.w, y: Math.random()*this.h,
        size: 8+Math.random()*10, footOffset: 5
      });
    }

    // 牌桌
    const tables = [
      { x: 300, y: 200, label: '骰子桌' },
      { x: 600, y: 250, label: '炸金花桌' },
      { x: 200, y: 450, label: '21点桌' },
      { x: 500, y: 500, label: '德州桌' }
    ];
    for (const t of tables) {
      this.objects.push({ type: 'table', ...t, footOffset: 10 });
    }

    // 测试立柱（32x64，用于验证Y轴排序）
    this.pillars.push({ x: 400, y: 300, w: 32, h: 64, footOffset: 32 });
    this.pillars.push({ x: 500, y: 400, w: 32, h: 64, footOffset: 32 });
    this.pillars.push({ x: 600, y: 350, w: 32, h: 64, footOffset: 32 });

    // 可拾取物品
    this.items.push({ x: 350, y: 280, type: 'medkit', name: '急救包', icon: '💊' });
    this.items.push({ x: 550, y: 380, type: 'ammo', name: '弹药', icon: '🔫' });
    this.items.push({ x: 450, y: 320, type: 'food', name: '罐头', icon: '🥫' });
  }

  roadColor(x,y) {
    const n = Math.sin(x*0.1)*0.5+0.5;
    return `rgb(${45+n*10},${45+n*10},${42+n*8})`;
  }

  groundColor(x,y) {
    const n = Math.sin(x*0.05)*Math.cos(y*0.05);
    return `rgb(${35+n*5},${32+n*8},${22+n*4})`;
  }

  drawGround(ctx, cam) {
    const vl = cam.x - cam.w/2 - CONFIG.TILE;
    const vr = cam.x + cam.w/2 + CONFIG.TILE;
    const vt = cam.y - cam.h/2 - CONFIG.TILE;
    const vb = cam.y + cam.h/2 + CONFIG.TILE;

    for (const t of this.tiles) {
      if (t.x < vl || t.x > vr || t.y < vt || t.y > vb) continue;
      ctx.fillStyle = t.color;
      ctx.fillRect(t.x, t.y, CONFIG.TILE, CONFIG.TILE);
    }
  }

  drawPillar(ctx, p) {
    // 立柱阴影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(p.x - p.w/2 + 4, p.y + p.h/2 - 8, p.w, 8);
    // 柱体
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(p.x - p.w/2, p.y - p.h/2, p.w, p.h);
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(p.x - p.w/2 + 2, p.y - p.h/2, 6, p.h);
    // 裂缝
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.h/2 + 10);
    ctx.lineTo(p.x + 5, p.y + p.h/2 - 15);
    ctx.stroke();
  }

  drawItem(ctx, item) {
    // 物品发光
    ctx.fillStyle = 'rgba(200,180,50,0.2)';
    ctx.beginPath();
    ctx.arc(item.x, item.y, 12, 0, Math.PI*2);
    ctx.fill();
    // 物品图标
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(item.icon, item.x, item.y + 5);
    // 名称
    ctx.fillStyle = '#b8960f';
    ctx.font = '8px monospace';
    ctx.fillText(item.name, item.x, item.y - 12);
  }
}

// ========== 玩家 ==========
class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.faceDir = 1;
    this.state = 'idle';
    this.dead = false;
    this.footOffset = 0; // 脚底在y位置
    this.width = 24;
    this.height = 48;
  }

  update(dt, keys, joystick) {
    if (this.dead) return;

    let dx = 0, dy = 0;
    if (keys['a'] || keys['arrowleft']) dx = -1;
    if (keys['d'] || keys['arrowright']) dx = 1;
    if (keys['w'] || keys['arrowup']) dy = -1;
    if (keys['s'] || keys['arrowdown']) dy = 1;

    if (joystick.active) {
      dx = joystick.dx;
      dy = joystick.dy;
    }

    const speed = keys['shift'] ? CONFIG.SPRINT_SPEED : CONFIG.PLAYER_SPEED;
    const moving = dx !== 0 || dy !== 0;

    if (moving) {
      const len = Math.sqrt(dx*dx + dy*dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.x += dx * speed * dt;
      this.y += dy * speed * dt;
      this.faceDir = dx < 0 ? -1 : 1;
      this.state = keys['shift'] ? 'run' : 'walk';
    } else {
      this.state = 'idle';
    }

    // 边界
    this.x = Math.max(20, Math.min(CONFIG.MAP_W - 20, this.x));
    this.y = Math.max(20, Math.min(CONFIG.MAP_H - 20, this.y));
  }

  draw(ctx) {
    if (this.dead) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 20, 12, 4, 0, 0, Math.PI*2);
    ctx.fill();

    // 身体
    ctx.fillStyle = '#4a5a3a';
    ctx.fillRect(-10, -20, 20, 35);

    // 头
    ctx.fillStyle = '#c4a882';
    ctx.fillRect(-8, -32, 16, 14);

    // 帽子
    ctx.fillStyle = '#3a3a2a';
    ctx.fillRect(-10, -36, 20, 6);
    ctx.fillRect(-12, -34, 24, 3);

    // 眼睛
    ctx.fillStyle = '#1a1a1a';
    const eyeX = this.faceDir > 0 ? 3 : -5;
    ctx.fillRect(eyeX, -28, 3, 3);
    ctx.fillRect(eyeX + 5, -28, 3, 3);

    // 枪
    ctx.fillStyle = '#4a4a4a';
    const gx = this.faceDir * 14;
    ctx.fillRect(gx - 8, -5, 16, 5);

    ctx.restore();
  }
}

// ========== 僵尸 ==========
class Zombie {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.hp = 60;
    this.maxHp = 60;
    this.speed = CONFIG.ZOMBIE_SPEED;
    this.footOffset = 0;
    this.radius = 40; // 碰撞半径
    this.dead = false;
    this.animOffset = Math.random() * 100;
  }

  update(dt, player) {
    if (this.dead) return;

    // 向玩家移动
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist > 10) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    }

    // 碰撞检测
    if (dist < this.radius + 15) {
      player.hp -= 10 * dt;
      if (player.hp <= 0) player.dead = true;
    }
  }

  draw(ctx) {
    if (this.dead) return;

    const wobble = Math.sin(Date.now() * 0.005 + this.animOffset) * 2;

    ctx.save();
    ctx.translate(this.x + wobble, this.y);

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 14, 5, 0, 0, Math.PI*2);
    ctx.fill();

    // 身体 - 红色方块
    ctx.fillStyle = '#8b2020';
    ctx.fillRect(-14, -18, 28, 36);

    // 血迹
    ctx.fillStyle = '#5a1010';
    ctx.fillRect(-8, -5, 16, 10);
    ctx.fillRect(-4, 5, 8, 12);

    // 头
    ctx.fillStyle = '#6a8a5a';
    ctx.fillRect(-10, -30, 20, 14);

    // 眼睛 - 空洞
    ctx.fillStyle = '#000';
    ctx.fillRect(-6, -26, 4, 4);
    ctx.fillRect(2, -26, 4, 4);
    // 眼白
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(-5, -25, 2, 2);
    ctx.fillRect(3, -25, 2, 2);

    // 手臂 - 向前伸
    ctx.fillStyle = '#6a8a5a';
    ctx.fillRect(-22, -8, 8, 20);
    ctx.fillRect(14, -8, 8, 20);

    ctx.restore();
  }
}

// ========== 视野系统 ==========
class VisionSystem {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  draw(ctx, playerX, playerY, camW, camH) {
    const cx = camW / 2;
    const cy = camH / 2;

    // 创建径向渐变 - 角色周围亮，四周黑
    const gradient = ctx.createRadialGradient(cx, cy, 30, cx, cy, CONFIG.VISION_RADIUS);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.3, 'rgba(0,0,0,0.1)');
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.6)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.95)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, camW, camH);

    // 外围全黑
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, camW, camH);
  }
}

// ========== 交互系统 ==========
class InteractionSystem {
  constructor() {
    this.hoveredItem = null;
  }

  // 射线检测 - 面向方向发射射线
  raycast(player, items, map) {
    const rayLen = CONFIG.RAY_LENGTH;
    const angle = player.faceDir > 0 ? 0 : Math.PI;
    const endX = player.x + Math.cos(angle) * rayLen;
    const endY = player.y + Math.sin(angle) * rayLen;

    // 检测物品
    for (const item of items) {
      const dx = item.x - player.x;
      const dy = item.y - player.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < CONFIG.PICKUP_RANGE) {
        // 检查是否在面朝方向
        const itemAngle = Math.atan2(dy, dx);
        const angleDiff = Math.abs(itemAngle - angle);
        if (angleDiff < Math.PI / 3 || angleDiff > Math.PI * 5 / 3) {
          return item;
        }
      }
    }

    return null;
  }

  drawPrompt(ctx, item, camW, camH) {
    if (!item) return;

    // 绘制拾取提示
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(camW/2 - 60, camH/2 + 40, 120, 28);
    ctx.strokeStyle = '#b8960f';
    ctx.lineWidth = 1;
    ctx.strokeRect(camW/2 - 60, camH/2 + 40, 120, 28);

    ctx.fillStyle = '#b8960f';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`按 E 拾取 ${item.name}`, camW/2, camH/2 + 58);
  }
}

// ========== 主游戏 ==========
class ProjectZomboidGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    this.camera = { x: CONFIG.MAP_W/2, y: CONFIG.MAP_H/2, w: this.canvas.width, h: this.canvas.height };
    this.map = new GameMap(CONFIG.MAP_W, CONFIG.MAP_H);
    this.renderer = new YSortRenderer();
    this.particles = new ParticleSystem();
    this.vision = new VisionSystem();
    this.interaction = new InteractionSystem();

    this.player = new Player(CONFIG.MAP_W/2, CONFIG.MAP_H/2);
    this.zombies = [
      new Zombie(200, 200),
      new Zombie(600, 400),
      new Zombie(400, 600)
    ];

    this.keys = {};
    this.joystick = { active: false, dx: 0, dy: 0 };
    this.setupInput();

    window.addEventListener('resize', () => this.resize());
  }

  setupInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'e') this.tryPickup();
    });
    window.addEventListener('keyup', e => this.keys[e.key.toLowerCase()] = false);

    // 触摸摇杆
    this.canvas.addEventListener('touchstart', e => {
      const t = e.touches[0];
      if (t.clientX < window.innerWidth * 0.4) {
        this.joystick.active = true;
        this.joystick.startX = t.clientX;
        this.joystick.startY = t.clientY;
      }
    });
    this.canvas.addEventListener('touchmove', e => {
      if (!this.joystick.active) return;
      const t = e.touches[0];
      const dx = t.clientX - this.joystick.startX;
      const dy = t.clientY - this.joystick.startY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const max = 50;
      this.joystick.dx = dist > max ? dx/dist : dx/max;
      this.joystick.dy = dist > max ? dy/dist : dy/max;
    });
    this.canvas.addEventListener('touchend', () => {
      this.joystick.active = false;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
    });

    // 射击
    this.canvas.addEventListener('mousedown', () => this.shoot());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.camera.w = this.canvas.width;
    this.camera.h = this.canvas.height;
  }

  shoot() {
    if (this.player.dead) return;
    this.particles.emit('muzzle', this.player.x + this.player.faceDir*20, this.player.y - 5, { count: 3 });

    // 检测击中僵尸
    for (const z of this.zombies) {
      if (z.dead) continue;
      const dx = z.x - this.player.x;
      const dy = z.y - this.player.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 200 && Math.abs(Math.atan2(dy,dx) - (this.player.faceDir>0?0:Math.PI)) < 0.5) {
        z.hp -= 20;
        this.particles.emit('blood', z.x, z.y, { count: 5 });
        if (z.hp <= 0) z.dead = true;
      }
    }
  }

  tryPickup() {
    const item = this.interaction.raycast(this.player, this.map.items, this.map);
    if (item) {
      // 拾取物品
      const idx = this.map.items.indexOf(item);
      if (idx > -1) {
        this.map.items.splice(idx, 1);
        this.showToast(`拾取了 ${item.name}`);
      }
    }
  }

  showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  update(dt) {
    this.player.update(dt, this.keys, this.joystick);

    // 更新僵尸
    for (const z of this.zombies) {
      z.update(dt, this.player);
    }

    // 粒子
    this.particles.update(dt);

    // 相机跟随
    this.camera.x += (this.player.x - this.camera.x) * 0.1;
    this.camera.y += (this.player.y - this.camera.y) * 0.1;

    // 交互检测
    this.interaction.hoveredItem = this.interaction.raycast(this.player, this.map.items, this.map);
  }

  draw() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    // 相机变换
    ctx.save();
    ctx.translate(cw/2 - this.camera.x, ch/2 - this.camera.y);

    // 绘制地面
    this.map.drawGround(ctx, this.camera);

    // 收集所有需要Y排序的物体
    this.renderer.clear();

    // 物品
    for (const item of this.map.items) {
      this.renderer.add({
        y: item.y, footOffset: 0,
        draw: (ctx) => this.map.drawItem(ctx, item)
      });
    }

    // 立柱
    for (const p of this.map.pillars) {
      this.renderer.add({
        y: p.y, footOffset: p.footOffset,
        draw: (ctx) => this.map.drawPillar(ctx, p)
      });
    }

    // 地图对象
    for (const obj of this.map.objects) {
      this.renderer.add({
        y: obj.y, footOffset: obj.footOffset || 0,
        draw: (ctx) => this.drawMapObject(ctx, obj)
      });
    }

    // 僵尸
    for (const z of this.zombies) {
      if (!z.dead) {
        this.renderer.add({
          y: z.y, footOffset: z.footOffset,
          draw: (ctx) => z.draw(ctx)
        });
      }
    }

    // 玩家
    this.renderer.add({
      y: this.player.y, footOffset: this.player.footOffset,
      draw: (ctx) => this.player.draw(ctx)
    });

    // 粒子
    this.renderer.add({
      y: -999999, footOffset: 0,
      draw: (ctx) => this.particles.draw(ctx)
    });

    // Y排序渲染
    this.renderer.draw(ctx);

    ctx.restore();

    // 视野遮罩
    this.vision.draw(ctx, this.player.x, this.player.y, cw, ch);

    // HUD
    this.drawHUD(ctx, cw, ch);

    // 交互提示
    this.interaction.drawPrompt(ctx, this.interaction.hoveredItem, cw, ch);
  }

  drawMapObject(ctx, obj) {
    switch (obj.type) {
      case 'house': this.drawHouse(ctx, obj); break;
      case 'tree': this.drawTree(ctx, obj); break;
      case 'rock': this.drawRock(ctx, obj); break;
      case 'table': this.drawTable(ctx, obj); break;
    }
  }

  drawHouse(ctx, obj) {
    const x = obj.x - obj.w/2;
    const y = obj.y - obj.h/2;
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(x, y, obj.w, obj.h);
    ctx.fillStyle = '#8b2020';
    ctx.beginPath();
    ctx.moveTo(x-8, y);
    ctx.lineTo(obj.x, y-25);
    ctx.lineTo(x+obj.w+8, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a2a0a';
    ctx.fillRect(obj.x-8, y+obj.h-22, 16, 22);
  }

  drawTree(ctx, obj) {
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(obj.x-3, obj.y, 6, obj.size);
    ctx.fillStyle = '#2a4a1a';
    ctx.beginPath();
    ctx.arc(obj.x, obj.y-obj.size*0.3, obj.size*0.8, 0, Math.PI*2);
    ctx.fill();
  }

  drawRock(ctx, obj) {
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, obj.size, 0, Math.PI*2);
    ctx.fill();
  }

  drawTable(ctx, obj) {
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(obj.x-28, obj.y-18, 56, 36);
    ctx.strokeStyle = '#6a5a4a';
    ctx.strokeRect(obj.x-28, obj.y-18, 56, 36);
    ctx.fillStyle = '#b8960f';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(obj.label, obj.x, obj.y-24);
  }

  drawHUD(ctx, cw, ch) {
    // 血条
    const hp = this.player.hp / this.player.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(20, 20, 204, 16);
    ctx.fillStyle = hp > 0.5 ? '#4a7a3a' : hp > 0.25 ? '#b8960f' : '#c4463a';
    ctx.fillRect(22, 22, 200 * hp, 12);
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`HP: ${Math.ceil(this.player.hp)}`, 24, 32);

    // 僵尸数量
    const aliveZombies = this.zombies.filter(z => !z.dead).length;
    ctx.fillStyle = '#c4463a';
    ctx.fillText(`僵尸: ${aliveZombies}`, 20, 55);

    // 操作提示
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(20, ch - 60, 200, 45);
    ctx.fillStyle = '#7a7060';
    ctx.font = '9px monospace';
    ctx.fillText('WASD:移动 | Shift:奔跑', 25, ch - 45);
    ctx.fillText('鼠标:射击 | E:拾取', 25, ch - 30);
  }

  loop() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.update(dt);
    this.draw();

    requestAnimationFrame(() => this.loop());
  }

  start() {
    this.lastTime = performance.now();
    this.loop();
  }
}

window.ProjectZomboidGame = ProjectZomboidGame;
