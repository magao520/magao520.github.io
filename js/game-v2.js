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

  draw(ctx, camera) {
    // 只绘制视口内的瓦片
    const viewLeft = camera.x - camera.width / 2 - 32;
    const viewRight = camera.x + camera.width / 2 + 32;
    const viewTop = camera.y - camera.height / 2 - 32;
    const viewBottom = camera.y + camera.height / 2 + 32;

    for (const tile of this.tiles) {
      if (tile.x < viewLeft || tile.x > viewRight || tile.y < viewTop || tile.y > viewBottom) continue;
      ctx.fillStyle = tile.color;
      ctx.fillRect(tile.x, tile.y, 32, 32);
    }

    for (const obj of this.objects) {
      if (obj.x < viewLeft || obj.x > viewRight || obj.y < viewTop || obj.y > viewBottom) continue;
      this.drawObject(ctx, obj);
    }
  }

  drawObject(ctx, obj) {
    switch (obj.type) {
      case 'house':
        // 房屋主体
        ctx.fillStyle = obj.color;
        ctx.fillRect(obj.x - obj.w / 2, obj.y - obj.h / 2, obj.w, obj.h);
        // 屋顶
        ctx.fillStyle = obj.roofColor;
        ctx.beginPath();
        ctx.moveTo(obj.x - obj.w / 2 - 10, obj.y - obj.h / 2);
        ctx.lineTo(obj.x, obj.y - obj.h / 2 - 25);
        ctx.lineTo(obj.x + obj.w / 2 + 10, obj.y - obj.h / 2);
        ctx.closePath();
        ctx.fill();
        // 门
        ctx.fillStyle = '#3a2a0a';
        ctx.fillRect(obj.x - 10, obj.y + obj.h / 2 - 20, 20, 20);
        break;
      case 'tree':
        // 树干
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(obj.x - 3, obj.y, 6, obj.size);
        // 树冠
        ctx.fillStyle = obj.color;
        ctx.beginPath();
        ctx.arc(obj.x, obj.y - obj.size * 0.3, obj.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'rock':
        ctx.fillStyle = obj.color;
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.size, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'table':
        // 桌子
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(obj.x - 30, obj.y - 20, 60, 40);
        ctx.strokeStyle = '#8a6a3a';
        ctx.lineWidth = 2;
        ctx.strokeRect(obj.x - 30, obj.y - 20, 60, 40);
        // 椅子
        ctx.fillStyle = '#4a2a0a';
        ctx.fillRect(obj.x - 40, obj.y - 8, 12, 16);
        ctx.fillRect(obj.x + 28, obj.y - 8, 12, 16);
        ctx.fillRect(obj.x - 8, obj.y - 32, 16, 12);
        ctx.fillRect(obj.x - 8, obj.y + 20, 16, 12);
        // 标签
        ctx.fillStyle = '#b8960f';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(obj.label, obj.x, obj.y - 28);
        break;
    }
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
    // 加载狸猫精灵图
    const animNames = ['idle', 'walk', 'run', 'hurt', 'dead'];
    for (const name of animNames) {
      try {
        const img = new Image();
        img.src = `assets/spritesheets/tanuki-${name}.png`;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        this.frames[name] = img;
      } catch (e) {
        console.warn(`Failed to load ${name} animation`);
      }
    }
    this.loaded = true;
  }

  draw(ctx, x, y, anim, frameTime, faceDir, scale = 0.5) {
    const img = this.frames[anim] || this.frames['idle'];
    if (!img) {
      // 备用：绘制简单矩形
      ctx.fillStyle = '#4a7a3a';
      ctx.fillRect(x - 15, y - 15, 30, 30);
      return;
    }

    const frameWidths = { idle: 128, walk: 128, run: 128, hurt: 128, dead: 128 };
    const frameCounts = { idle: 12, walk: 12, run: 10, hurt: 6, dead: 10 };
    const frameRates = { idle: 8, walk: 8, run: 10, hurt: 12, dead: 6 };

    const fw = frameWidths[anim] || 128;
    const fc = frameCounts[anim] || 1;
    const fr = frameRates[anim] || 8;

    this.frameTime += frameTime;
    if (this.frameTime >= 1 / fr) {
      this.frameTime = 0;
      this.frameIndex = (this.frameIndex + 1) % fc;
    }

    const sx = this.frameIndex * fw;
    const sy = 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(faceDir * scale, scale);
    ctx.drawImage(img, sx, sy, fw, 128, -fw / 2, -64, fw, 128);
    ctx.restore();
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
    const gun = this.guns[this.me.gun];
    ctx.fillStyle = '#6a6a6a';
    const gx = this.me.x + this.me.faceDir * 20;
    const gy = this.me.y + 5;
    ctx.fillRect(gx - 10, gy - 3, 20, 6);

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

  start() {
    this.lastTime = performance.now();
    this.animator.load().then(() => {
      this.loop();
    }).catch(() => {
      this.loop();
    });
  }
}

// 启动
window.GameV2 = GameV2;
