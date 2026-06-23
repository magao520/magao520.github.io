// ============================================================
// 废土交易所 v30.0 - 终极版
// 集成：狸猫动画、粒子特效、物理引擎、音效、地图生成
// ============================================================
'use strict';

// 加载外部库
const LIBS = {
  matter: 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js',
  howler: 'https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.3/howler.min.js'
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ========== 粒子系统 ==========
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.maxParticles = 200;
  }

  emit(type, x, y, options = {}) {
    const count = options.count || 1;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      this.particles.push(this.createParticle(type, x, y, options));
    }
  }

  createParticle(type, x, y, options) {
    const configs = {
      muzzle: {
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() - 0.5) * 200,
        life: 0.15,
        size: 3 + Math.random() * 4,
        color: `hsl(${30 + Math.random() * 30}, 100%, ${50 + Math.random() * 30}%)`,
        gravity: 0,
        decay: 0.9
      },
      explosion: {
        vx: (Math.random() - 0.5) * 300,
        vy: (Math.random() - 0.5) * 300,
        life: 0.5,
        size: 5 + Math.random() * 8,
        color: `hsl(${10 + Math.random() * 40}, 100%, 50%)`,
        gravity: 100,
        decay: 0.95
      },
      blood: {
        vx: (Math.random() - 0.5) * 150,
        vy: (Math.random() - 0.5) * 150,
        life: 0.4,
        size: 2 + Math.random() * 3,
        color: `hsl(${0 + Math.random() * 10}, 90%, ${30 + Math.random() * 20}%)`,
        gravity: 50,
        decay: 0.92
      },
      shell: {
        vx: (Math.random() - 0.5) * 100 + (options.faceDir > 0 ? -80 : 80),
        vy: -100 - Math.random() * 100,
        life: 0.6,
        size: 2,
        color: '#ccaa44',
        gravity: 300,
        decay: 0.98,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10
      },
      smoke: {
        vx: (Math.random() - 0.5) * 30,
        vy: -50 - Math.random() * 30,
        life: 1.0,
        size: 5 + Math.random() * 10,
        color: `rgba(100, 100, 100, ${0.3 + Math.random() * 0.3})`,
        gravity: -20,
        decay: 0.97,
        grow: true
      },
      dust: {
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 40,
        life: 0.3,
        size: 1 + Math.random() * 2,
        color: `rgba(150, 140, 120, ${0.4 + Math.random() * 0.4})`,
        gravity: 0,
        decay: 0.9
      }
    };

    const cfg = configs[type] || configs.dust;
    return {
      x, y,
      vx: cfg.vx,
      vy: cfg.vy,
      life: cfg.life,
      maxLife: cfg.life,
      size: cfg.size,
      color: cfg.color,
      gravity: cfg.gravity,
      decay: cfg.decay,
      rotation: cfg.rotation || 0,
      rotSpeed: cfg.rotSpeed || 0,
      grow: cfg.grow || false
    };
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= p.decay;
      p.vy *= p.decay;
      p.rotation += (p.rotSpeed || 0) * dt;
      if (p.grow) p.size += dt * 5;
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

// ========== 音效系统 ==========
class SoundSystem {
  constructor() {
    this.enabled = true;
    this.sounds = {};
    this.init();
  }

  init() {
    // 使用 Web Audio API 生成简单音效
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  play(type) {
    if (!this.enabled || !this.audioCtx) return;
    
    const configs = {
      shoot: { freq: 800, type: 'square', duration: 0.1, slide: -400 },
      explosion: { freq: 100, type: 'sawtooth', duration: 0.3, slide: -50 },
      hurt: { freq: 200, type: 'sawtooth', duration: 0.2, slide: -100 },
      reload: { freq: 400, type: 'sine', duration: 0.5, slide: 0 },
      step: { freq: 60, type: 'triangle', duration: 0.05, slide: 0 },
      hit: { freq: 1000, type: 'square', duration: 0.05, slide: -500 }
    };

    const cfg = configs[type];
    if (!cfg) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = cfg.type;
    osc.frequency.setValueAtTime(cfg.freq, this.audioCtx.currentTime);
    if (cfg.slide) {
      osc.frequency.exponentialRampToValueAtTime(
        cfg.freq + cfg.slide,
        this.audioCtx.currentTime + cfg.duration
      );
    }
    gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + cfg.duration);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start();
    osc.stop(this.audioCtx.currentTime + cfg.duration);
  }
}

// ========== 地图生成器 ==========
class MapGenerator {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.objects = [];
    this.generate();
  }

  generate() {
    // 生成地面
    for (let x = 0; x < this.width; x += 32) {
      for (let y = 0; y < this.height; y += 32) {
        const isRoad = this.isRoad(x, y);
        this.tiles.push({
          x, y,
          type: isRoad ? 'road' : 'grass',
          color: isRoad ? this.roadColor(x, y) : this.grassColor(x, y)
        });
      }
    }

    // 生成房屋
    for (let i = 0; i < 5; i++) {
      this.objects.push(this.createHouse());
    }

    // 生成树木
    for (let i = 0; i < 40; i++) {
      this.objects.push(this.createTree());
    }

    // 生成石头
    for (let i = 0; i < 20; i++) {
      this.objects.push(this.createRock());
    }

    // 生成牌桌
    this.objects.push({ type: 'table', x: 300, y: 200, label: '骰子桌', game: 'dice' });
    this.objects.push({ type: 'table', x: 600, y: 250, label: '炸金花桌', game: 'zjh' });
    this.objects.push({ type: 'table', x: 200, y: 450, label: '21点桌', game: 'blackjack' });
    this.objects.push({ type: 'table', x: 500, y: 500, label: '德州扑克桌', game: 'texas' });
  }

  isRoad(x, y) {
    // 十字道路
    const cx = this.width / 2;
    const cy = this.height / 2;
    const roadWidth = 60;
    return (Math.abs(x - cx) < roadWidth || Math.abs(y - cy) < roadWidth);
  }

  roadColor(x, y) {
    const n = Math.sin(x * 0.1) * Math.cos(y * 0.1);
    const base = n > 0 ? 0x3a3a3a : 0x353535;
    return '#' + base.toString(16).padStart(6, '0');
  }

  grassColor(x, y) {
    const n = Math.sin(x * 0.05) * Math.cos(y * 0.05);
    const r = 0x2a + Math.floor(n * 8);
    const g = 0x2a + Math.floor(n * 12);
    const b = 0x1a + Math.floor(n * 4);
    return `rgb(${r},${g},${b})`;
  }

  createHouse() {
    const x = 100 + Math.random() * (this.width - 200);
    const y = 100 + Math.random() * (this.height - 200);
    return {
      type: 'house',
      x, y,
      w: 80 + Math.random() * 40,
      h: 60 + Math.random() * 30,
      color: `hsl(${20 + Math.random() * 20}, 40%, ${20 + Math.random() * 15}%)`,
      roofColor: `hsl(${0 + Math.random() * 20}, 60%, ${30 + Math.random() * 10}%)`
    };
  }

  createTree() {
    return {
      type: 'tree',
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      size: 15 + Math.random() * 20,
      color: `hsl(${100 + Math.random() * 40}, 50%, ${20 + Math.random() * 15}%)`
    };
  }

  createRock() {
    return {
      type: 'rock',
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      size: 8 + Math.random() * 12,
      color: `hsl(${0}, 0%, ${30 + Math.random() * 20}%)`
    };
  }

  async loadImages() {
    const imageUrls = {
      house: 'assets/pixel/house.jpg',
      tree: 'assets/pixel/tree.jpg',
      rock: 'assets/pixel/rock.jpg',
      table: 'assets/pixel/table.jpg'
    };

    this.images = {};
    for (const [key, url] of Object.entries(imageUrls)) {
      this.images[key] = await this.loadImage(url);
    }
  }

  loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  draw(ctx, camera) {
    // 只绘制视口内的瓦片
    const viewLeft = camera.x - camera.width / 2 - 64;
    const viewRight = camera.x + camera.width / 2 + 64;
    const viewTop = camera.y - camera.height / 2 - 64;
    const viewBottom = camera.y + camera.height / 2 + 64;

    for (const tile of this.tiles) {
      if (tile.x < viewLeft || tile.x > viewRight || tile.y < viewTop || tile.y > viewBottom) continue;
      this.drawTile(ctx, tile);
    }

    for (const obj of this.objects) {
      if (obj.x < viewLeft || obj.x > viewRight || obj.y < viewTop || obj.y > viewBottom) continue;
      this.drawObject(ctx, obj);
    }
  }

  drawTile(ctx, tile) {
    const x = tile.x;
    const y = tile.y;

    if (tile.type === 'road') {
      // 道路 - 沥青质感
      ctx.fillStyle = tile.color;
      ctx.fillRect(x, y, 32, 32);
      // 沥青颗粒
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(x + Math.random() * 30, y + Math.random() * 30, 1, 1);
      }
      // 道路标线
      if ((x + y) % 128 < 64) {
        ctx.fillStyle = 'rgba(200,180,100,0.3)';
        ctx.fillRect(x + 14, y, 4, 32);
      }
    } else {
      // 草地 - 自然纹理
      ctx.fillStyle = tile.color;
      ctx.fillRect(x, y, 32, 32);
      // 草叶纹理
      ctx.fillStyle = 'rgba(100,160,60,0.1)';
      for (let i = 0; i < 5; i++) {
        const gx = x + 4 + (i * 6) % 28;
        const gy = y + 4 + ((i * 7) % 28);
        ctx.fillRect(gx, gy, 2, 3);
      }
      // 随机小花
      if (Math.abs(Math.sin(x * 0.1 + y * 0.2) * Math.cos(x * 0.2 - y * 0.1)) > 0.85) {
        const flowerColors = ['#ff6b6b', '#ffd93d', '#6bcf7f', '#4d96ff'];
        ctx.fillStyle = flowerColors[Math.floor(Math.abs(x * y) % 4)];
        ctx.fillRect(x + 12, y + 12, 3, 3);
        ctx.fillRect(x + 17, y + 12, 3, 3);
        ctx.fillRect(x + 12, y + 17, 3, 3);
        ctx.fillRect(x + 17, y + 17, 3, 3);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 14, y + 14, 4, 4);
      }
    }
  }

  drawObject(ctx, obj) {
    const img = this.images ? this.images[obj.type] : null;
    if (img) {
      // 使用真实图片
      const size = obj.type === 'house' ? 80 : obj.type === 'tree' ? 60 : obj.type === 'table' ? 70 : 40;
      ctx.drawImage(img, obj.x - size / 2, obj.y - size / 2, size, size);
    } else {
      // 备用：像素绘制
      switch (obj.type) {
        case 'house': this.drawPixelHouse(ctx, obj); break;
        case 'tree': this.drawPixelTree(ctx, obj); break;
        case 'rock': this.drawPixelRock(ctx, obj); break;
        case 'table': this.drawPixelTable(ctx, obj); break;
      }
    }
  }

  drawPixelHouse(ctx, obj) {
    const x = obj.x - obj.w / 2;
    const y = obj.y - obj.h / 2;
    const w = obj.w;
    const h = obj.h;

    // 墙壁纹理 - 砖块效果
    ctx.fillStyle = obj.color;
    ctx.fillRect(x, y, w, h);
    // 砖块线条
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let by = y + 8; by < y + h; by += 16) {
      ctx.fillRect(x, by, w, 1);
      const offset = ((by - y) / 16 % 2) * 16;
      for (let bx = x + offset; bx < x + w; bx += 32) {
        ctx.fillRect(bx, by - 8, 1, 16);
      }
    }

    // 屋顶 - 瓦片效果
    ctx.fillStyle = obj.roofColor;
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(obj.x, y - 30);
    ctx.lineTo(x + w + 8, y);
    ctx.closePath();
    ctx.fill();
    // 屋顶瓦片线条
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const ry = y - 25 + i * 6;
      const rw = (w + 16) * (1 - i * 0.15);
      ctx.beginPath();
      ctx.moveTo(obj.x - rw / 2, ry);
      ctx.lineTo(obj.x + rw / 2, ry);
      ctx.stroke();
    }

    // 窗户
    ctx.fillStyle = '#2a3a4a';
    ctx.fillRect(x + 8, y + 10, 14, 14);
    ctx.fillRect(x + w - 22, y + 10, 14, 14);
    // 窗框
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 8, y + 10, 14, 14);
    ctx.strokeRect(x + w - 22, y + 10, 14, 14);
    // 窗户反光
    ctx.fillStyle = 'rgba(200,220,255,0.3)';
    ctx.fillRect(x + 10, y + 12, 4, 4);
    ctx.fillRect(x + w - 20, y + 12, 4, 4);

    // 门
    ctx.fillStyle = '#3a2a0a';
    ctx.fillRect(obj.x - 10, y + h - 28, 20, 28);
    // 门框
    ctx.strokeStyle = '#5a4a2a';
    ctx.lineWidth = 2;
    ctx.strokeRect(obj.x - 10, y + h - 28, 20, 28);
    // 门把手
    ctx.fillStyle = '#b8960f';
    ctx.beginPath();
    ctx.arc(obj.x + 6, y + h - 14, 2, 0, Math.PI * 2);
    ctx.fill();

    // 烟囱
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(x + w - 20, y - 25, 12, 20);
    // 烟雾
    if (Math.random() > 0.95) {
      ctx.fillStyle = 'rgba(150,150,150,0.3)';
      ctx.beginPath();
      ctx.arc(x + w - 14, y - 30, 4 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPixelTree(ctx, obj) {
    const x = obj.x;
    const y = obj.y;
    const s = obj.size;

    // 树干 - 更粗的像素风格
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(x - 4, y, 8, s);
    // 树皮纹理
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(x - 2, y + 4, 4, s - 8);

    // 树冠 - 多层圆形营造立体感
    const cy = y - s * 0.3;
    // 阴影层
    ctx.fillStyle = '#1a3a1a';
    ctx.beginPath();
    ctx.arc(x + 3, cy + 3, s * 0.9, 0, Math.PI * 2);
    ctx.fill();
    // 主层
    ctx.fillStyle = obj.color;
    ctx.beginPath();
    ctx.arc(x, cy, s * 0.8, 0, Math.PI * 2);
    ctx.fill();
    // 高光层
    ctx.fillStyle = 'rgba(100,180,80,0.3)';
    ctx.beginPath();
    ctx.arc(x - 3, cy - 3, s * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // 树叶细节
    ctx.fillStyle = 'rgba(80,160,60,0.5)';
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const lx = x + Math.cos(angle) * s * 0.5;
      const ly = cy + Math.sin(angle) * s * 0.4;
      ctx.fillRect(lx - 2, ly - 2, 4, 4);
    }
  }

  drawPixelRock(ctx, obj) {
    const x = obj.x;
    const y = obj.y;
    const s = obj.size;

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + s * 0.3, s * 0.9, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 石头主体 - 不规则形状
    ctx.fillStyle = obj.color;
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x - s * 0.6, y - s * 0.8);
    ctx.lineTo(x + s * 0.3, y - s);
    ctx.lineTo(x + s * 0.9, y - s * 0.4);
    ctx.lineTo(x + s, y + s * 0.3);
    ctx.lineTo(x + s * 0.4, y + s * 0.6);
    ctx.lineTo(x - s * 0.4, y + s * 0.5);
    ctx.closePath();
    ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, y - s * 0.8);
    ctx.lineTo(x + s * 0.3, y - s);
    ctx.lineTo(x + s * 0.1, y - s * 0.5);
    ctx.lineTo(x - s * 0.4, y - s * 0.4);
    ctx.closePath();
    ctx.fill();

    // 裂缝
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.3, y - s * 0.3);
    ctx.lineTo(x + s * 0.2, y + s * 0.1);
    ctx.stroke();
  }

  drawPixelTable(ctx, obj) {
    const x = obj.x;
    const y = obj.y;

    // 桌子阴影
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x - 32, y + 18, 64, 8);

    // 桌腿
    ctx.fillStyle = '#3a2a0a';
    ctx.fillRect(x - 25, y - 5, 6, 25);
    ctx.fillRect(x + 19, y - 5, 6, 25);
    ctx.fillRect(x - 25, y - 20, 6, 15);
    ctx.fillRect(x + 19, y - 20, 6, 15);

    // 桌面
    ctx.fillStyle = '#6a4a2a';
    ctx.fillRect(x - 32, y - 22, 64, 20);
    // 桌面纹理
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x - 30, y - 20, 60, 2);
    ctx.fillRect(x - 30, y - 14, 60, 1);
    ctx.fillRect(x - 30, y - 8, 60, 2);

    // 桌边
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 32, y - 22, 64, 20);

    // 椅子
    const chairPositions = [
      { x: x - 42, y: y - 8 },
      { x: x + 30, y: y - 8 },
      { x: x - 8, y: y - 38 },
      { x: x - 8, y: y + 18 }
    ];
    for (const cp of chairPositions) {
      // 椅腿
      ctx.fillStyle = '#3a2a0a';
      ctx.fillRect(cp.x + 2, cp.y + 2, 2, 10);
      ctx.fillRect(cp.x + 10, cp.y + 2, 2, 10);
      // 椅面
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(cp.x, cp.y, 14, 4);
      // 椅背
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(cp.x, cp.y - 8, 14, 8);
    }

    // 标签背景
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 35, y - 42, 70, 14);
    // 标签文字
    ctx.fillStyle = '#b8960f';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(obj.label, x, y - 32);

    // 扑克牌装饰
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 8, y - 18, 6, 8);
    ctx.fillRect(x + 2, y - 18, 6, 8);
    ctx.strokeStyle = '#c4463a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 8, y - 18, 6, 8);
    ctx.strokeRect(x + 2, y - 18, 6, 8);
  }
}

// ========== 玩家动画系统 ==========
class PlayerAnimator {
  constructor() {
    this.frames = {};
    this.currentAnim = 'idle';
    this.frameIndex = 0;
    this.frameTime = 0;
    this.loaded = false;
  }

  async load() {
    // 加载生成的角色图片
    try {
      const img = new Image();
      img.src = 'assets/pixel/player.jpg';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      this.playerImg = img;
    } catch (e) {
      console.warn('Failed to load player image');
    }

    // 加载枪械图片
    try {
      const img = new Image();
      img.src = 'assets/pixel/gun_pistol.jpg';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      this.gunImg = img;
    } catch (e) {
      console.warn('Failed to load gun image');
    }

    this.loaded = true;
  }

  draw(ctx, x, y, anim, frameTime, faceDir, scale = 0.5) {
    if (this.playerImg) {
      // 使用生成的角色图片
      const size = 48;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(faceDir * 0.8, 0.8);
      ctx.drawImage(this.playerImg, -size / 2, -size, size, size * 1.5);
      ctx.restore();
    } else {
      // 备用：绘制简单矩形
      ctx.fillStyle = '#4a7a3a';
      ctx.fillRect(x - 15, y - 15, 30, 30);
    }
  }

  drawGun(ctx, x, y, faceDir) {
    if (this.gunImg) {
      const size = 24;
      ctx.save();
      ctx.translate(x + faceDir * 20, y + 5);
      ctx.scale(faceDir * 0.3, 0.3);
      ctx.drawImage(this.gunImg, -size, -size / 2, size * 2, size);
      ctx.restore();
    } else {
      ctx.fillStyle = '#6a6a6a';
      ctx.fillRect(x + faceDir * 15, y, 20, 6);
    }
  }
}

// ========== 主游戏类 ==========
class GameV2 {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.width = 1600;
    this.height = 1200;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.camera = { x: 800, y: 600, width: window.innerWidth, height: window.innerHeight };
    this.map = new MapGenerator(this.width, this.height);
    this.particles = new ParticleSystem();
    this.sounds = new SoundSystem();
    this.animator = new PlayerAnimator();

    this.me = {
      x: 800, y: 600,
      vx: 0, vy: 0,
      hp: 100, maxHp: 100,
      dead: false, deadTimer: 0,
      faceDir: 1,
      state: 'idle',
      gun: 0,
      ammo: [30, 60, 20, 10, 200],
      lastFire: 0
    };

    this.guns = [
      { name: '手枪', damage: 15, fireRate: 0.3, speed: 600, spread: 0.05, count: 1, color: '#ffdd44' },
      { name: 'AK47', damage: 12, fireRate: 0.1, speed: 700, spread: 0.08, count: 1, color: '#ffdd44' },
      { name: '霰弹枪', damage: 8, fireRate: 0.8, speed: 500, spread: 0.2, count: 5, color: '#ffdd44' },
      { name: '狙击枪', damage: 50, fireRate: 1.5, speed: 1000, spread: 0.01, count: 1, color: '#ffdd44' },
      { name: '加特林', damage: 6, fireRate: 0.05, speed: 800, spread: 0.15, count: 1, color: '#ffdd44' }
    ];

    this.bullets = [];
    this.others = new Map();
    this.keys = {};
    this.joystick = { active: false, dx: 0, dy: 0 };
    this.time = 0;
    this.dayTime = 0;

    this.setupInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setupInput() {
    window.addEventListener('keydown', e => this.keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', e => this.keys[e.key.toLowerCase()] = false);

    // 触摸/摇杆
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
      const dist = Math.sqrt(dx * dx + dy * dy);
      const max = 50;
      this.joystick.dx = dist > max ? dx / dist : dx / max;
      this.joystick.dy = dist > max ? dy / dist : dy / max;
    });

    this.canvas.addEventListener('touchend', () => {
      this.joystick.active = false;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
    });

    // 鼠标射击
    this.canvas.addEventListener('mousedown', () => this.fire());
    this.canvas.addEventListener('touchstart', e => {
      if (e.touches[0].clientX > window.innerWidth * 0.5) this.fire();
    });
  }

  resize() {
    this.camera.width = window.innerWidth;
    this.camera.height = window.innerHeight;
  }

  fire() {
    if (this.me.dead) return;
    const now = performance.now() / 1000;
    const gun = this.guns[this.me.gun];
    if (now - this.me.lastFire < gun.fireRate) return;
    if (this.me.ammo[this.me.gun] <= 0) return;

    this.me.lastFire = now;
    this.me.ammo[this.me.gun]--;

    const fd = this.me.faceDir;
    for (let i = 0; i < gun.count; i++) {
      const angle = (fd > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * gun.spread * 2;
      this.bullets.push({
        x: this.me.x + fd * 25,
        y: this.me.y,
        vx: Math.cos(angle) * gun.speed,
        vy: Math.sin(angle) * gun.speed,
        life: 1.5,
        damage: gun.damage,
        color: gun.color
      });
    }

    // 枪口火焰
    this.particles.emit('muzzle', this.me.x + fd * 25, this.me.y, { count: 5 });
    // 弹壳
    this.particles.emit('shell', this.me.x, this.me.y, { faceDir: fd });
    // 音效
    this.sounds.play('shoot');
    // 屏幕震动
    this.shakeCamera(3, 0.05);
  }

  shakeCamera(amount, duration) {
    this.camera.shakeAmount = amount;
    this.camera.shakeDuration = duration;
  }

  update(dt) {
    this.time += dt;
    this.dayTime += dt;

    // 玩家移动
    if (!this.me.dead) {
      let dx = 0, dy = 0;
      if (this.keys['a'] || this.keys['arrowleft']) dx = -1;
      if (this.keys['d'] || this.keys['arrowright']) dx = 1;
      if (this.keys['w'] || this.keys['arrowup']) dy = -1;
      if (this.keys['s'] || this.keys['arrowdown']) dy = 1;

      if (this.joystick.active) {
        dx = this.joystick.dx;
        dy = this.joystick.dy;
      }

      const speed = this.keys['shift'] ? 300 : 200;
      const moving = dx !== 0 || dy !== 0;
      if (moving) {
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 1) { dx /= len; dy /= len; }
        this.me.x += dx * speed * dt;
        this.me.y += dy * speed * dt;
        this.me.faceDir = dx < 0 ? -1 : 1;
        this.me.state = this.keys['shift'] ? 'run' : 'walk';

        // 脚步声粒子
        if (Math.random() < 0.3) {
          this.particles.emit('dust', this.me.x, this.me.y + 15, { count: 1 });
        }
      } else {
        this.me.state = 'idle';
      }

      // 边界限制
      this.me.x = Math.max(20, Math.min(this.width - 20, this.me.x));
      this.me.y = Math.max(20, Math.min(this.height - 20, this.me.y));
    }

    // 死亡/复活
    if (this.me.dead) {
      this.me.deadTimer -= dt;
      if (this.me.deadTimer <= 0) {
        this.me.dead = false;
        this.me.hp = this.me.maxHp;
        this.me.state = 'idle';
      }
    }

    // 子弹更新
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.x > this.width || b.y < 0 || b.y > this.height) {
        this.bullets.splice(i, 1);
      }
    }

    // 粒子更新
    this.particles.update(dt);

    // 相机跟随
    this.camera.x += (this.me.x - this.camera.x) * 0.1;
    this.camera.y += (this.me.y - this.camera.y) * 0.1;

    // 相机震动
    if (this.camera.shakeDuration > 0) {
      this.camera.shakeDuration -= dt;
      this.camera.x += (Math.random() - 0.5) * this.camera.shakeAmount;
      this.camera.y += (Math.random() - 0.5) * this.camera.shakeAmount;
    }

    // 日夜循环
    const hour = (this.dayTime / 60) % 24;
    this.dayAlpha = hour >= 20 || hour < 6 ? 0.5 : hour >= 18 ? (hour - 18) / 4 * 0.5 : 0;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(this.camera.width / 2 - this.camera.x, this.camera.height / 2 - this.camera.y);

    // 绘制地图
    this.map.draw(ctx, this.camera);

    // 绘制子弹
    for (const b of this.bullets) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 绘制粒子
    this.particles.draw(ctx);

    // 绘制玩家
    this.animator.draw(ctx, this.me.x, this.me.y, this.me.state, 1 / 60, this.me.faceDir);

    // 绘制枪
    this.animator.drawGun(ctx, this.me.x, this.me.y, this.me.faceDir);

    ctx.restore();

    // 日夜遮罩
    if (this.dayAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 50, ${this.dayAlpha})`;
      ctx.fillRect(0, 0, this.camera.width, this.camera.height);
    }

    // HUD
    this.drawHUD(ctx);
  }

  drawHUD(ctx) {
    // 血条
    const hpRatio = this.me.hp / this.me.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(20, 20, 204, 14);
    ctx.fillStyle = hpRatio > 0.5 ? '#4a7a3a' : hpRatio > 0.25 ? '#b8960f' : '#c4463a';
    ctx.fillRect(22, 22, 200 * hpRatio, 10);

    // 弹药
    ctx.fillStyle = '#b8960f';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${this.guns[this.me.gun].name}: ${this.me.ammo[this.me.gun]}`, 20, 55);

    // 小地图
    const mmX = this.camera.width - 80;
    const mmY = 60;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(mmX - 50, mmY - 40, 100, 80);
    ctx.strokeStyle = '#4a3828';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX - 50, mmY - 40, 100, 80);

    // 玩家点
    ctx.fillStyle = '#4a7a3a';
    ctx.beginPath();
    ctx.arc(mmX + (this.me.x / this.width - 0.5) * 90, mmY + (this.me.y / this.height - 0.5) * 70, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  loop() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.update(dt);
    this.draw();

    requestAnimationFrame(() => this.loop());
  }

  async start() {
    this.lastTime = performance.now();
    // 加载地图图片
    await this.map.loadImages();
    // 加载角色动画
    await this.animator.load();
    this.loop();
  }
}

// 启动
window.GameV2 = GameV2;
