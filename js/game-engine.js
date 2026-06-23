/** ============================================================
 *  farm-game / js / game-engine.js
 *  核心游戏引擎 - 包含所有子系统
 *  模块：GameEngine, Physics, Sprite, Particle, Sound, Input, Map, UI
 *  依赖：Matter.js (CDN), Howler.js (CDN)
 *  ============================================================ */

'use strict';

// ============================================================
// 1. 游戏引擎核心类 GameEngine
// ============================================================

/**
 * 场景基类
 * 所有游戏场景应继承此类，实现 init、update、render、destroy 方法
 */
class Scene {
  constructor(name) {
    this.name = name;
    this.entities = [];      // 场景中的实体列表
    this.active = false;
    this.initialized = false;
  }

  /** 场景初始化，子类重写 */
  init(engine) { this.engine = engine; this.initialized = true; }
  /** 每帧更新，子类重写 */
  update(dt) { }
  /** 每帧渲染，子类重写 */
  render(ctx) {
    for (const entity of this.entities) {
      if (entity.render) entity.render(ctx);
    }
  }
  /** 场景销毁，子类重写 */
  destroy() {
    this.entities = [];
    this.initialized = false;
  }

  /** 添加实体 */
  addEntity(entity) {
    this.entities.push(entity);
    if (entity.onAdd) entity.onAdd(this);
  }
  /** 移除实体 */
  removeEntity(entity) {
    const idx = this.entities.indexOf(entity);
    if (idx !== -1) {
      this.entities.splice(idx, 1);
      if (entity.onRemove) entity.onRemove(this);
    }
  }
}

/**
 * 摄像机系统
 * 支持跟随目标、平滑插值、视口裁剪、屏幕抖动
 */
class Camera {
  constructor(viewWidth, viewHeight) {
    this.x = 0;
    this.y = 0;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.target = null;          // 跟随目标 {x, y}
    this.smoothFactor = 0.08;    // 平滑插值系数 (0-1)
    this.zoom = 1.0;
    this.minZoom = 0.5;
    this.maxZoom = 2.0;
    this.bounds = null;          // 边界 {minX, minY, maxX, maxY}
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
  }

  /** 设置跟随目标 */
  follow(target) { this.target = target; }
  /** 设置边界 */
  setBounds(minX, minY, maxX, maxY) {
    this.bounds = { minX, minY, maxX, maxY };
  }
  /** 触发屏幕震动 */
  shake(intensity = 10, decay = 0.9) {
    this.shakeIntensity = intensity;
    this.shakeDecay = decay;
  }
  /** 设置缩放 */
  setZoom(zoom) {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  /** 每帧更新摄像机位置 */
  update(dt) {
    let targetX = this.x;
    let targetY = this.y;

    if (this.target) {
      targetX = this.target.x - this.viewWidth / (2 * this.zoom);
      targetY = this.target.y - this.viewHeight / (2 * this.zoom);
    }

    // 平滑插值
    this.x += (targetX - this.x) * this.smoothFactor;
    this.y += (targetY - this.y) * this.smoothFactor;

    // 边界限制
    if (this.bounds) {
      const maxX = this.bounds.maxX - this.viewWidth / this.zoom;
      const maxY = this.bounds.maxY - this.viewHeight / this.zoom;
      this.x = Math.max(this.bounds.minX, Math.min(maxX, this.x));
      this.y = Math.max(this.bounds.minY, Math.min(maxY, this.y));
    }

    // 屏幕震动
    if (this.shakeIntensity > 0.1) {
      this.shakeOffsetX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.shakeOffsetY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  /** 世界坐标转屏幕坐标 */
  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.shakeOffsetX,
      y: (wy - this.y) * this.zoom + this.shakeOffsetY
    };
  }
  /** 屏幕坐标转世界坐标 */
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.shakeOffsetX) / this.zoom + this.x,
      y: (sy - this.shakeOffsetY) / this.zoom + this.y
    };
  }

  /** 获取视口矩形（世界坐标） */
  getViewport() {
    return {
      left: this.x,
      top: this.y,
      right: this.x + this.viewWidth / this.zoom,
      bottom: this.y + this.viewHeight / this.zoom
    };
  }

  /** 检查对象是否在视口内（用于视口裁剪） */
  isInViewport(x, y, width = 0, height = 0) {
    const vp = this.getViewport();
    return x + width >= vp.left && x - width <= vp.right &&
           y + height >= vp.top && y - height <= vp.bottom;
  }

  /** 应用摄像机变换到 Canvas 上下文 */
  applyTransform(ctx) {
    ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
  /** 恢复摄像机变换 */
  resetTransform(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/**
 * 通用对象池基类
 * 用于复用对象，减少 GC 压力
 */
class ObjectPool {
  constructor(factory, resetFn, initialSize = 50) {
    this.factory = factory;      // 创建对象的工厂函数
    this.resetFn = resetFn;      // 重置对象的函数
    this.pool = [];              // 可用对象数组
    this.active = new Set();      // 活跃对象集合
    this._expand(initialSize);
  }

  _expand(count) {
    for (let i = 0; i < count; i++) {
      this.pool.push(this.factory());
    }
  }

  /** 获取一个对象 */
  acquire(...args) {
    if (this.pool.length === 0) {
      this._expand(10);
    }
    const obj = this.pool.pop();
    this.resetFn(obj, ...args);
    this.active.add(obj);
    return obj;
  }

  /** 释放对象回池中 */
  release(obj) {
    if (this.active.has(obj)) {
      this.active.delete(obj);
      this.pool.push(obj);
    }
  }

  /** 释放所有活跃对象 */
  releaseAll() {
    for (const obj of this.active) {
      this.pool.push(obj);
    }
    this.active.clear();
  }

  /** 获取活跃对象数量 */
  getActiveCount() { return this.active.size; }
  /** 获取池大小 */
  getPoolSize() { return this.pool.length; }
}

/**
 * 粒子对象池
 */
class ParticlePool extends ObjectPool {
  constructor(initialSize = 200) {
    super(
      () => ({
        x: 0, y: 0,
        vx: 0, vy: 0,
        life: 0, maxLife: 1,
        color: '#fff',
        size: 2,
        gravity: 0,
        decay: 0.98,
        alpha: 1,
        rotation: 0,
        rotationSpeed: 0,
        active: false
      }),
      (p, x, y, vx, vy, color, size, life, gravity = 0, decay = 0.98) => {
        p.x = x; p.y = y;
        p.vx = vx; p.vy = vy;
        p.color = color;
        p.size = size;
        p.life = life; p.maxLife = life;
        p.gravity = gravity;
        p.decay = decay;
        p.alpha = 1;
        p.rotation = Math.random() * Math.PI * 2;
        p.rotationSpeed = (Math.random() - 0.5) * 0.2;
        p.active = true;
      },
      initialSize
    );
  }
}

/**
 * 子弹对象池
 */
class BulletPool extends ObjectPool {
  constructor(initialSize = 100) {
    super(
      () => ({
        x: 0, y: 0,
        vx: 0, vy: 0,
        speed: 800,
        damage: 10,
        radius: 3,
        life: 2,
        owner: null,
        active: false,
        trail: []  // 轨迹点
      }),
      (b, x, y, angle, speed, damage, owner) => {
        b.x = x; b.y = y;
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
        b.speed = speed;
        b.damage = damage;
        b.life = 2;
        b.owner = owner;
        b.active = true;
        b.trail = [];
      },
      initialSize
    );
  }
}

/**
 * 游戏引擎主类
 * 管理 Canvas、游戏循环、场景、时间、摄像机
 */
class GameEngine {
  constructor(canvasId, width = 800, height = 600) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = canvasId;
      document.body.appendChild(this.canvas);
    }
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    this.width = width;
    this.height = height;
    this.running = false;
    this.lastTime = 0;
    this.deltaTime = 0;
    this.totalTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.fpsTimer = 0;

    this.scenes = new Map();       // 场景映射
    this.currentScene = null;
    this.camera = new Camera(width, height);

    this.particlePool = new ParticlePool();
    this.bulletPool = new BulletPool();

    this.debug = false;
    this.paused = false;

    // 脏矩形优化（简单版本：标记整个屏幕需要重绘）
    this.dirtyRegions = [];

    this._boundLoop = this._gameLoop.bind(this);
  }

  /** 添加场景 */
  addScene(scene) {
    this.scenes.set(scene.name, scene);
    if (!scene.initialized) scene.init(this);
  }
  /** 切换场景 */
  switchScene(name) {
    if (this.currentScene) {
      this.currentScene.active = false;
    }
    this.currentScene = this.scenes.get(name) || null;
    if (this.currentScene) {
      this.currentScene.active = true;
      if (!this.currentScene.initialized) {
        this.currentScene.init(this);
      }
    }
  }

  /** 启动游戏循环 */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this._boundLoop);
  }
  /** 停止游戏循环 */
  stop() {
    this.running = false;
  }
  /** 暂停/恢复 */
  togglePause() {
    this.paused = !this.paused;
  }

  /** 内部游戏循环 */
  _gameLoop(timestamp) {
    if (!this.running) return;

    // 计算 delta time（秒）
    this.deltaTime = Math.min((timestamp - this.lastTime) / 1000, 0.05); // 限制最大 dt 防止卡顿跳帧
    this.lastTime = timestamp;
    this.totalTime += this.deltaTime;
    this.frameCount++;

    // FPS 计算
    this.fpsTimer += this.deltaTime;
    if (this.fpsTimer >= 1.0) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    if (!this.paused) {
      this.update(this.deltaTime);
    }
    this.render(this.ctx);

    requestAnimationFrame(this._boundLoop);
  }

  /** 更新逻辑 */
  update(dt) {
    this.camera.update(dt);

    if (this.currentScene) {
      this.currentScene.update(dt);
    }

    // 更新粒子
    this._updateParticles(dt);
    // 更新子弹
    this._updateBullets(dt);
  }

  /** 更新粒子 */
  _updateParticles(dt) {
    for (const p of this.particlePool.active) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= p.decay;
      p.vy *= p.decay;
      p.life -= dt;
      p.alpha = p.life / p.maxLife;
      p.rotation += p.rotationSpeed;
      if (p.life <= 0) {
        p.active = false;
        this.particlePool.release(p);
      }
    }
  }

  /** 更新子弹 */
  _updateBullets(dt) {
    for (const b of this.bulletPool.active) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      // 记录轨迹
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 10) b.trail.shift();

      if (b.life <= 0) {
        b.active = false;
        this.bulletPool.release(b);
      }
    }
  }

  /** 渲染 */
  render(ctx) {
    // 清屏
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    // 应用摄像机变换
    this.camera.applyTransform(ctx);

    // 渲染场景
    if (this.currentScene) {
      this.currentScene.render(ctx);
    }

    // 渲染子弹
    this._renderBullets(ctx);
    // 渲染粒子
    this._renderParticles(ctx);

    ctx.restore();

    // 渲染 HUD（不受摄像机影响）
    this._renderHUD(ctx);

    // 调试信息
    if (this.debug) {
      this._renderDebug(ctx);
    }
  }

  /** 渲染粒子 */
  _renderParticles(ctx) {
    for (const p of this.particlePool.active) {
      if (!p.active) continue;
      // 视口裁剪
      if (!this.camera.isInViewport(p.x, p.y, p.size * 2)) continue;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** 渲染子弹 */
  _renderBullets(ctx) {
    for (const b of this.bulletPool.active) {
      if (!b.active) continue;
      if (!this.camera.isInViewport(b.x, b.y, 10)) continue;

      // 绘制轨迹
      if (b.trail.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 200, 50, 0.5)';
        ctx.lineWidth = 2;
        ctx.moveTo(b.trail[0].x, b.trail[0].y);
        for (let i = 1; i < b.trail.length; i++) {
          ctx.lineTo(b.trail[i].x, b.trail[i].y);
        }
        ctx.stroke();
      }

      // 绘制子弹
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcc00';
      ctx.fill();
    }
  }

  /** 渲染 HUD */
  _renderHUD(ctx) {
    // 子类或外部系统覆盖
  }

  /** 渲染调试信息 */
  _renderDebug(ctx) {
    ctx.fillStyle = '#0f0';
    ctx.font = '14px monospace';
    ctx.fillText(`FPS: ${this.fps}`, 10, 20);
    ctx.fillText(`DT: ${(this.deltaTime * 1000).toFixed(2)}ms`, 10, 40);
    ctx.fillText(`Particles: ${this.particlePool.getActiveCount()}`, 10, 60);
    ctx.fillText(`Bullets: ${this.bulletPool.getActiveCount()}`, 10, 80);
    ctx.fillText(`Camera: ${this.camera.x.toFixed(0)}, ${this.camera.y.toFixed(0)}`, 10, 100);
    ctx.fillText(`Scene: ${this.currentScene ? this.currentScene.name : 'none'}`, 10, 120);
  }

  /** 调整画布大小 */
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = width;
    this.height = height;
    this.camera.viewWidth = width;
    this.camera.viewHeight = height;
  }

  /** 获取世界坐标中的鼠标位置 */
  getWorldMouse(screenX, screenY) {
    return this.camera.screenToWorld(screenX, screenY);
  }
}


// ============================================================
// 2. 物理引擎集成 (Matter.js)
// ============================================================

/**
 * 物理引擎封装
 * 基于 Matter.js 的物理世界管理
 */
class PhysicsEngine {
  constructor(engine) {
    this.engine = engine; // 游戏引擎引用
    this.world = null;
    this.bodies = new Map(); // entity -> Matter Body 映射
    this.collisionCallbacks = [];
    this.initialized = false;
  }

  /** 初始化 Matter.js 世界 */
  init() {
    if (typeof Matter === 'undefined') {
      console.warn('Matter.js 未加载，物理引擎不可用');
      return;
    }
    this.world = Matter.World.create({
      gravity: { x: 0, y: 0 } // 俯视角游戏，无重力
    });
    this.engineRef = Matter.Engine.create({ world: this.world });
    this.initialized = true;

    // 注册碰撞事件
    Matter.Events.on(this.engineRef, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        this._handleCollision(pair.bodyA, pair.bodyB);
      }
    });
  }

  /** 创建玩家刚体（圆形） */
  createPlayerBody(x, y, radius, options = {}) {
    if (!this.initialized) return null;
    const body = Matter.Bodies.circle(x, y, radius, {
      restitution: 0.2,
      friction: 0.5,
      frictionAir: 0.15,
      density: 0.001,
      ...options
    });
    body.label = 'player';
    Matter.Composite.add(this.world, body);
    return body;
  }

  /** 创建矩形刚体 */
  createRectangleBody(x, y, width, height, options = {}) {
    if (!this.initialized) return null;
    const body = Matter.Bodies.rectangle(x, y, width, height, options);
    Matter.Composite.add(this.world, body);
    return body;
  }

  /** 创建静态墙壁 */
  createWall(x, y, width, height) {
    if (!this.initialized) return null;
    const wall = Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      label: 'wall',
      friction: 0.8
    });
    Matter.Composite.add(this.world, wall);
    return wall;
  }

  /** 批量创建墙壁 */
  createWallsFromMap(tileMap, tileSize) {
    if (!this.initialized) return;
    const walls = [];
    for (let y = 0; y < tileMap.height; y++) {
      for (let x = 0; x < tileMap.width; x++) {
        const tile = tileMap.getCollisionTile(x, y);
        if (tile) {
          const wall = this.createWall(
            x * tileSize + tileSize / 2,
            y * tileSize + tileSize / 2,
            tileSize,
            tileSize
          );
          walls.push(wall);
        }
      }
    }
    return walls;
  }

  /** 应用力到刚体 */
  applyForce(body, force) {
    if (!this.initialized || !body) return;
    Matter.Body.applyForce(body, body.position, force);
  }

  /** 设置刚体速度 */
  setVelocity(body, vx, vy) {
    if (!this.initialized || !body) return;
    Matter.Body.setVelocity(body, { x: vx, y: vy });
  }

  /** 移动刚体位置 */
  setPosition(body, x, y) {
    if (!this.initialized || !body) return;
    Matter.Body.setPosition(body, { x, y });
  }

  /** 移除刚体 */
  removeBody(body) {
    if (!this.initialized || !body) return;
    Matter.Composite.remove(this.world, body);
  }

  /** 注册碰撞回调 */
  onCollision(callback) {
    this.collisionCallbacks.push(callback);
  }

  /** 处理碰撞 */
  _handleCollision(bodyA, bodyB) {
    for (const cb of this.collisionCallbacks) {
      cb(bodyA, bodyB);
    }
  }

  /** 物理步进（与渲染同步） */
  step(dt) {
    if (!this.initialized) return;
    // Matter.js 默认使用 60fps 的固定步长
    const timeScale = dt / (1 / 60);
    Matter.Engine.update(this.engineRef, 1000 / 60, timeScale);
  }

  /** 射线检测 */
  raycast(startX, startY, endX, endY) {
    if (!this.initialized) return [];
    const bodies = Matter.Composite.allBodies(this.world);
    return Matter.Query.ray(bodies, { x: startX, y: startY }, { x: endX, y: endY });
  }

  /** 查询区域内的刚体 */
  queryRegion(x, y, width, height) {
    if (!this.initialized) return [];
    const bodies = Matter.Composite.allBodies(this.world);
    return Matter.Query.region(bodies, { min: { x, y }, max: { x: x + width, y: y + height } });
  }

  /** 清理所有刚体 */
  clear() {
    if (!this.initialized) return;
    Matter.Composite.clear(this.world, false);
    this.bodies.clear();
  }
}


// ============================================================
// 3. 精灵动画系统
// ============================================================

/**
 * 精灵图集类
 * 加载和管理 spritesheet 数据
 */
class SpriteSheet {
  constructor(imageSrc, dataSrc) {
    this.image = new Image();
    this.image.src = imageSrc;
    this.frames = new Map();
    this.animations = new Map();
    this.loaded = false;
    this.imageLoaded = false;
    this.dataLoaded = false;
  }

  /** 异步加载精灵图集 */
  async load() {
    return new Promise((resolve, reject) => {
      this.image.onload = () => {
        this.imageLoaded = true;
        this._checkLoaded(resolve);
      };
      this.image.onerror = reject;

      // 加载 JSON 数据
      fetch(this.dataSrc)
        .then(r => r.json())
        .then(data => {
          this._parseData(data);
          this.dataLoaded = true;
          this._checkLoaded(resolve);
        })
        .catch(reject);
    });
  }

  _checkLoaded(resolve) {
    if (this.imageLoaded && this.dataLoaded) {
      this.loaded = true;
      resolve(this);
    }
  }

  _parseData(data) {
    // 解析帧数据
    if (data.frames) {
      for (const [key, frame] of Object.entries(data.frames)) {
        this.frames.set(key, {
          x: frame.frame.x,
          y: frame.frame.y,
          w: frame.frame.w,
          h: frame.frame.h
        });
      }
    }
    // 解析动画数据
    if (data.animations) {
      for (const [name, anim] of Object.entries(data.animations)) {
        this.animations.set(name, {
          frames: anim.frames,
          frameRate: anim.frameRate || 8,
          repeat: anim.repeat || -1
        });
      }
    }
  }

  /** 获取帧数据 */
  getFrame(name) {
    return this.frames.get(name);
  }

  /** 获取动画数据 */
  getAnimation(name) {
    return this.animations.get(name);
  }

  /** 绘制指定帧 */
  drawFrame(ctx, frameName, x, y, flipX = false, flipY = false, scale = 1) {
    const frame = this.frames.get(frameName);
    if (!frame || !this.loaded) return;

    ctx.save();
    ctx.translate(x, y);
    if (flipX) ctx.scale(-1, 1);
    if (flipY) ctx.scale(1, -1);
    ctx.scale(scale, scale);

    ctx.drawImage(
      this.image,
      frame.x, frame.y, frame.w, frame.h,
      -frame.w / 2, -frame.h / 2, frame.w, frame.h
    );
    ctx.restore();
  }
}

/**
 * 动画类
 * 管理帧序列、帧率、循环模式
 */
class Animation {
  constructor(spriteSheet, animName) {
    this.spriteSheet = spriteSheet;
    this.animName = animName;
    this.animData = spriteSheet.getAnimation(animName);
    this.currentFrame = 0;
    this.frameTimer = 0;
    this.frameDuration = this.animData ? (1 / this.animData.frameRate) : 0.125;
    this.playing = false;
    this.finished = false;
    this.repeat = this.animData ? this.animData.repeat : -1;
    this.repeatCount = 0;
  }

  /** 播放动画 */
  play() {
    this.playing = true;
    this.finished = false;
    this.currentFrame = 0;
    this.frameTimer = 0;
    this.repeatCount = 0;
  }

  /** 停止动画 */
  stop() {
    this.playing = false;
  }

  /** 切换到指定帧 */
  gotoFrame(index) {
    if (!this.animData) return;
    this.currentFrame = Math.max(0, Math.min(index, this.animData.frames.length - 1));
  }

  /** 更新动画 */
  update(dt) {
    if (!this.playing || !this.animData || this.finished) return;

    this.frameTimer += dt;
    if (this.frameTimer >= this.frameDuration) {
      this.frameTimer -= this.frameDuration;
      this.currentFrame++;

      if (this.currentFrame >= this.animData.frames.length) {
        if (this.repeat === -1 || this.repeatCount < this.repeat) {
          this.currentFrame = 0;
          this.repeatCount++;
        } else {
          this.currentFrame = this.animData.frames.length - 1;
          this.finished = true;
          this.playing = false;
        }
      }
    }
  }

  /** 获取当前帧名称 */
  getCurrentFrameName() {
    if (!this.animData) return null;
    return this.animData.frames[this.currentFrame];
  }

  /** 渲染当前帧 */
  render(ctx, x, y, flipX = false, flipY = false, scale = 1) {
    const frameName = this.getCurrentFrameName();
    if (frameName) {
      this.spriteSheet.drawFrame(ctx, frameName, x, y, flipX, flipY, scale);
    }
  }
}

/**
 * 动画状态机
 * 支持 idle/walk/run/hurt/dead 状态切换
 */
class AnimationStateMachine {
  constructor() {
    this.states = new Map();
    this.currentState = null;
    this.previousState = null;
  }

  /** 添加状态 */
  addState(name, animation) {
    this.states.set(name, animation);
  }

  /** 切换到指定状态 */
  changeState(name, force = false) {
    if (this.currentState === name && !force) return;
    this.previousState = this.currentState;
    this.currentState = name;
    const anim = this.states.get(name);
    if (anim) anim.play();
  }

  /** 更新当前状态 */
  update(dt) {
    const anim = this.states.get(this.currentState);
    if (anim) anim.update(dt);
  }

  /** 渲染当前状态 */
  render(ctx, x, y, flipX = false, flipY = false, scale = 1) {
    const anim = this.states.get(this.currentState);
    if (anim) anim.render(ctx, x, y, flipX, flipY, scale);
  }

  /** 获取当前状态 */
  getCurrentState() { return this.currentState; }
  /** 获取上一个状态 */
  getPreviousState() { return this.previousState; }
}


// ============================================================
// 4. 粒子系统
// ============================================================

/**
 * 粒子发射器
 * 支持多种粒子效果：枪口火焰、爆炸、弹壳、血液、烟雾、灰尘
 */
class ParticleEmitter {
  constructor(engine, pool) {
    this.engine = engine;
    this.pool = pool || engine.particlePool;
    this.emitters = []; // 活跃的发射器配置
  }

  /**
   * 发射粒子
   * @param {string} type - 粒子类型: 'muzzle', 'explosion', 'shell', 'blood', 'smoke', 'dust'
   * @param {number} x - 发射位置 X
   * @param {number} y - 发射位置 Y
   * @param {Object} options - 额外选项
   */
  emit(type, x, y, options = {}) {
    switch (type) {
      case 'muzzle':
        this._emitMuzzle(x, y, options);
        break;
      case 'explosion':
        this._emitExplosion(x, y, options);
        break;
      case 'shell':
        this._emitShell(x, y, options);
        break;
      case 'blood':
        this._emitBlood(x, y, options);
        break;
      case 'smoke':
        this._emitSmoke(x, y, options);
        break;
      case 'dust':
        this._emitDust(x, y, options);
        break;
      default:
        this._emitGeneric(x, y, options);
    }
  }

  _emitMuzzle(x, y, options) {
    const angle = options.angle || 0;
    const count = options.count || 5;
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.5;
      const speed = 100 + Math.random() * 200;
      const vx = Math.cos(angle + spread) * speed;
      const vy = Math.sin(angle + spread) * speed;
      const color = `hsl(${30 + Math.random() * 30}, 100%, ${50 + Math.random() * 50}%)`;
      this.pool.acquire(x, y, vx, vy, color, 3 + Math.random() * 3, 0.1 + Math.random() * 0.1, 0, 0.95);
    }
  }

  _emitExplosion(x, y, options) {
    const count = options.count || 30;
    const colors = options.colors || ['#ff6600', '#ff3300', '#ffaa00', '#ffcc00', '#888888'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 300;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = 2 + Math.random() * 6;
      const life = 0.3 + Math.random() * 0.7;
      this.pool.acquire(x, y, vx, vy, color, size, life, 100, 0.92);
    }
  }

  _emitShell(x, y, options) {
    const angle = options.angle || 0;
    const vx = Math.cos(angle + Math.PI / 2) * (50 + Math.random() * 100);
    const vy = Math.sin(angle + Math.PI / 2) * (50 + Math.random() * 100);
    this.pool.acquire(x, y, vx, vy, '#d4af37', 3, 1.5, 300, 0.96);
  }

  _emitBlood(x, y, options) {
    const count = options.count || 8;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 150;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const color = `hsl(${0 + Math.random() * 20}, 100%, ${30 + Math.random() * 20}%)`;
      this.pool.acquire(x, y, vx, vy, color, 2 + Math.random() * 4, 0.5 + Math.random() * 0.5, 200, 0.94);
    }
  }

  _emitSmoke(x, y, options) {
    const count = options.count || 10;
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * 30;
      const vy = -20 - Math.random() * 50;
      const gray = 100 + Math.random() * 100;
      const color = `rgba(${gray}, ${gray}, ${gray}, 0.5)`;
      this.pool.acquire(x, y, vx, vy, color, 5 + Math.random() * 10, 1 + Math.random() * 2, -10, 0.97);
    }
  }

  _emitDust(x, y, options) {
    const count = options.count || 5;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 40;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const color = `rgba(${180 + Math.random() * 40}, ${160 + Math.random() * 40}, ${120 + Math.random() * 40}, 0.6)`;
      this.pool.acquire(x, y, vx, vy, color, 2 + Math.random() * 4, 0.3 + Math.random() * 0.3, 0, 0.9);
    }
  }

  _emitGeneric(x, y, options) {
    const vx = options.vx || 0;
    const vy = options.vy || 0;
    const color = options.color || '#fff';
    const size = options.size || 2;
    const life = options.life || 1;
    this.pool.acquire(x, y, vx, vy, color, size, life, options.gravity || 0, options.decay || 0.98);
  }
}


// ============================================================
// 5. 音效系统 (Howler.js)
// ============================================================

/**
 * 音效管理器
 * 基于 Howler.js，支持射击、爆炸、受伤、脚步声、环境音
 */
class SoundManager {
  constructor() {
    this.sounds = new Map();
    this.muted = false;
    this.masterVolume = 1.0;
    this.categories = {
      sfx: 0.7,
      music: 0.3,
      ambient: 0.2,
      voice: 0.8
    };
    this.initialized = false;
  }

  /** 初始化 Howler.js */
  init() {
    if (typeof Howl === 'undefined') {
      console.warn('Howler.js 未加载，音效系统不可用');
      return;
    }
    this.initialized = true;
    Howler.volume(this.masterVolume);
  }

  /**
   * 加载音效
   * @param {string} name - 音效名称
   * @param {string} src - 音频文件路径
   * @param {Object} options - Howl 选项
   */
  load(name, src, options = {}) {
    if (!this.initialized) return;
    const sound = new Howl({
      src: [src],
      volume: options.volume || 1.0,
      loop: options.loop || false,
      ...options
    });
    this.sounds.set(name, sound);
    return sound;
  }

  /** 预定义常用音效 */
  loadDefaults(basePath = 'assets/sounds/') {
    const defaults = [
      { name: 'shoot_pistol', src: `${basePath}shoot_pistol.mp3`, category: 'sfx' },
      { name: 'shoot_rifle', src: `${basePath}shoot_rifle.mp3`, category: 'sfx' },
      { name: 'shoot_shotgun', src: `${basePath}shoot_shotgun.mp3`, category: 'sfx' },
      { name: 'explosion', src: `${basePath}explosion.mp3`, category: 'sfx' },
      { name: 'hurt', src: `${basePath}hurt.mp3`, category: 'sfx' },
      { name: 'footstep', src: `${basePath}footstep.mp3`, category: 'sfx', volume: 0.3 },
      { name: 'reload', src: `${basePath}reload.mp3`, category: 'sfx' },
      { name: 'ambient_wind', src: `${basePath}ambient_wind.mp3`, category: 'ambient', loop: true },
      { name: 'ambient_crickets', src: `${basePath}ambient_crickets.mp3`, category: 'ambient', loop: true },
      { name: 'bgm_battle', src: `${basePath}bgm_battle.mp3`, category: 'music', loop: true },
    ];

    for (const def of defaults) {
      this.load(def.name, def.src, {
        volume: def.volume || 1.0,
        loop: def.loop || false
      });
    }
  }

  /** 播放音效 */
  play(name, options = {}) {
    if (!this.initialized || this.muted) return;
    const sound = this.sounds.get(name);
    if (!sound) {
      console.warn(`音效未找到: ${name}`);
      return;
    }

    const id = sound.play();
    if (options.volume !== undefined) {
      sound.volume(options.volume * this._getCategoryVolume(name), id);
    }
    if (options.rate !== undefined) {
      sound.rate(options.rate, id);
    }
    return id;
  }

  /** 停止音效 */
  stop(name) {
    const sound = this.sounds.get(name);
    if (sound) sound.stop();
  }

  /** 淡入 */
  fadeIn(name, duration = 1000, targetVolume = 1.0) {
    const sound = this.sounds.get(name);
    if (!sound) return;
    sound.volume(0);
    sound.play();
    sound.fade(0, targetVolume, duration);
  }

  /** 淡出 */
  fadeOut(name, duration = 1000) {
    const sound = this.sounds.get(name);
    if (!sound) return;
    sound.fade(sound.volume(), 0, duration);
    setTimeout(() => sound.stop(), duration);
  }

  /** 设置主音量 */
  setMasterVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.initialized) {
      Howler.volume(this.masterVolume);
    }
  }

  /** 设置分类音量 */
  setCategoryVolume(category, volume) {
    this.categories[category] = Math.max(0, Math.min(1, volume));
  }

  _getCategoryVolume(name) {
    if (name.includes('ambient')) return this.categories.ambient;
    if (name.includes('bgm') || name.includes('music')) return this.categories.music;
    return this.categories.sfx;
  }

  /** 静音切换 */
  toggleMute() {
    this.muted = !this.muted;
    Howler.mute(this.muted);
    return this.muted;
  }

  /** 播放射击音效（根据武器类型） */
  playShoot(weaponType = 'pistol') {
    const soundName = `shoot_${weaponType}`;
    if (this.sounds.has(soundName)) {
      this.play(soundName, { rate: 0.9 + Math.random() * 0.2 });
    } else {
      // 回退到基础射击音效
      this.play('shoot_pistol', { rate: 0.9 + Math.random() * 0.2 });
    }
  }

  /** 播放脚步声 */
  playFootstep() {
    this.play('footstep', { volume: 0.2 + Math.random() * 0.1, rate: 0.9 + Math.random() * 0.2 });
  }

  /** 播放受伤音效 */
  playHurt() {
    this.play('hurt', { rate: 0.8 + Math.random() * 0.4 });
  }

  /** 播放爆炸音效 */
  playExplosion() {
    this.play('explosion', { volume: 0.8 });
  }
}


// ============================================================
// 6. 输入系统
// ============================================================

/**
 * 输入管理器
 * 支持键盘、鼠标、触摸/虚拟摇杆
 */
class InputManager {
  constructor(engine) {
    this.engine = engine;
    this.canvas = engine.canvas;

    // 键盘状态
    this.keys = new Map();
    this.keysPressed = new Set();    // 本帧刚按下
    this.keysReleased = new Set();   // 本帧刚释放

    // 鼠标状态
    this.mouse = {
      x: 0, y: 0,
      worldX: 0, worldY: 0,
      left: false, right: false, middle: false,
      leftPressed: false, rightPressed: false,
      leftReleased: false, rightReleased: false,
      wheel: 0
    };

    // 触摸/虚拟摇杆
    this.touches = new Map();          // touchId -> {x, y, startX, startY}
    this.virtualJoystick = {
      active: false,
      startX: 0, startY: 0,
      currentX: 0, currentY: 0,
      dx: 0, dy: 0,
      intensity: 0
    };
    this.virtualAim = {
      active: false,
      x: 0, y: 0,
      shooting: false
    };

    this._bindEvents();
  }

  _bindEvents() {
    // 键盘事件
    document.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('keyup', (e) => this._onKeyUp(e));

    // 鼠标事件
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 触摸事件
    this.canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
    this.canvas.addEventListener('touchcancel', (e) => this._onTouchEnd(e), { passive: false });
  }

  _onKeyDown(e) {
    const key = e.key.toLowerCase();
    if (!this.keys.get(key)) {
      this.keysPressed.add(key);
    }
    this.keys.set(key, true);
  }

  _onKeyUp(e) {
    const key = e.key.toLowerCase();
    this.keys.set(key, false);
    this.keysReleased.add(key);
  }

  _onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
    this._updateWorldMouse();

    if (e.button === 0) {
      this.mouse.left = true;
      this.mouse.leftPressed = true;
    } else if (e.button === 2) {
      this.mouse.right = true;
      this.mouse.rightPressed = true;
    } else if (e.button === 1) {
      this.mouse.middle = true;
    }
  }

  _onMouseUp(e) {
    if (e.button === 0) {
      this.mouse.left = false;
      this.mouse.leftReleased = true;
    } else if (e.button === 2) {
      this.mouse.right = false;
      this.mouse.rightReleased = true;
    } else if (e.button === 1) {
      this.mouse.middle = false;
    }
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
    this._updateWorldMouse();
  }

  _updateWorldMouse() {
    const worldPos = this.engine.getWorldMouse(this.mouse.x, this.mouse.y);
    this.mouse.worldX = worldPos.x;
    this.mouse.worldY = worldPos.y;
  }

  _onWheel(e) {
    this.mouse.wheel = e.deltaY;
    e.preventDefault();
  }

  _onTouchStart(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const halfWidth = rect.width / 2;

    for (const touch of e.changedTouches) {
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      this.touches.set(touch.identifier, { x, y, startX: x, startY: y });

      // 左半屏 = 虚拟摇杆（移动）
      if (x < halfWidth) {
        this.virtualJoystick.active = true;
        this.virtualJoystick.startX = x;
        this.virtualJoystick.startY = y;
        this.virtualJoystick.currentX = x;
        this.virtualJoystick.currentY = y;
      }
      // 右半屏 = 瞄准/射击
      else {
        this.virtualAim.active = true;
        this.virtualAim.x = x;
        this.virtualAim.y = y;
        this.virtualAim.shooting = true;
      }
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const halfWidth = rect.width / 2;

    for (const touch of e.changedTouches) {
      const t = this.touches.get(touch.identifier);
      if (!t) continue;

      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      t.x = x;
      t.y = y;

      if (x < halfWidth && this.virtualJoystick.active) {
        this.virtualJoystick.currentX = x;
        this.virtualJoystick.currentY = y;
        const dx = x - this.virtualJoystick.startX;
        const dy = y - this.virtualJoystick.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 60;
        if (dist > maxDist) {
          const scale = maxDist / dist;
          this.virtualJoystick.currentX = this.virtualJoystick.startX + dx * scale;
          this.virtualJoystick.currentY = this.virtualJoystick.startY + dy * scale;
        }
        this.virtualJoystick.dx = dx / maxDist;
        this.virtualJoystick.dy = dy / maxDist;
        this.virtualJoystick.intensity = Math.min(dist / maxDist, 1);
      } else if (x >= halfWidth && this.virtualAim.active) {
        this.virtualAim.x = x;
        this.virtualAim.y = y;
      }
    }
  }

  _onTouchEnd(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const halfWidth = rect.width / 2;

    for (const touch of e.changedTouches) {
      const t = this.touches.get(touch.identifier);
      if (!t) continue;

      if (t.startX < halfWidth) {
        this.virtualJoystick.active = false;
        this.virtualJoystick.dx = 0;
        this.virtualJoystick.dy = 0;
        this.virtualJoystick.intensity = 0;
      } else {
        this.virtualAim.active = false;
        this.virtualAim.shooting = false;
      }
      this.touches.delete(touch.identifier);
    }
  }

  /** 每帧更新前调用，清除一次性状态 */
  update() {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.leftReleased = false;
    this.mouse.rightReleased = false;
    this.mouse.wheel = 0;
  }

  // --- 键盘查询 ---
  isKeyDown(key) { return !!this.keys.get(key.toLowerCase()); }
  isKeyPressed(key) { return this.keysPressed.has(key.toLowerCase()); }
  isKeyReleased(key) { return this.keysReleased.has(key.toLowerCase()); }

  /** 获取 WASD 移动向量 */
  getMovementVector() {
    let dx = 0, dy = 0;
    if (this.isKeyDown('w') || this.isKeyDown('arrowup')) dy -= 1;
    if (this.isKeyDown('s') || this.isKeyDown('arrowdown')) dy += 1;
    if (this.isKeyDown('a') || this.isKeyDown('arrowleft')) dx -= 1;
    if (this.isKeyDown('d') || this.isKeyDown('arrowright')) dx += 1;
    // 虚拟摇杆覆盖
    if (this.virtualJoystick.active) {
      dx = this.virtualJoystick.dx;
      dy = this.virtualJoystick.dy;
    }
    // 归一化
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) {
      dx /= len; dy /= len;
    }
    return { x: dx, y: dy };
  }

  /** 是否正在奔跑（按住 Shift） */
  isRunning() {
    return this.isKeyDown('shift') || this.virtualJoystick.intensity > 0.8;
  }

  /** 是否按下空格 */
  isJumping() {
    return this.isKeyPressed(' ') || this.isKeyPressed('spacebar');
  }

  /** 获取鼠标瞄准角度 */
  getAimAngle(fromX, fromY) {
    return Math.atan2(this.mouse.worldY - fromY, this.mouse.worldX - fromX);
  }

  /** 是否正在射击 */
  isShooting() {
    return this.mouse.left || this.virtualAim.shooting;
  }

  /** 是否刚按下射击 */
  isShootPressed() {
    return this.mouse.leftPressed || (this.virtualAim.shooting && this.virtualAim.active);
  }

  /** 渲染虚拟摇杆（用于调试/移动设备） */
  renderVirtualControls(ctx) {
    if (!this.virtualJoystick.active) return;

    // 摇杆底座
    ctx.beginPath();
    ctx.arc(this.virtualJoystick.startX, this.virtualJoystick.startY, 60, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 摇杆头
    ctx.beginPath();
    ctx.arc(this.virtualJoystick.currentX, this.virtualJoystick.currentY, 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fill();
  }
}


// ============================================================
// 7. 地图系统
// ============================================================

/**
 * 瓦片地图类
 * 支持多层渲染、Kenney Tiny Town 瓦片
 */
class TileMap {
  constructor(width, height, tileSize = 16) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;

    // 多层地图数据
    this.groundLayer = new Array(width * height).fill(0);
    this.decorationLayer = new Array(width * height).fill(-1);
    this.collisionLayer = new Array(width * height).fill(0);

    this.tileImages = new Map(); // tileId -> Image
    this.tilesetImage = null;
    this.tilesetCols = 0;
    this.tilesetLoaded = false;

    // 地图对象（房屋、树木等）
    this.objects = [];
  }

  /** 加载 Kenney Tiny Town tileset */
  async loadTileset(imageSrc, tileWidth = 16, tileHeight = 16) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.tilesetImage = img;
        this.tilesetCols = Math.floor(img.width / tileWidth);
        this.tilesetLoaded = true;
        resolve(img);
      };
      img.onerror = reject;
      img.src = imageSrc;
    });
  }

  /** 设置瓦片 */
  setTile(layer, x, y, tileId) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = y * this.width + x;
    if (layer === 'ground') this.groundLayer[idx] = tileId;
    else if (layer === 'decoration') this.decorationLayer[idx] = tileId;
    else if (layer === 'collision') this.collisionLayer[idx] = tileId;
  }

  /** 获取瓦片 */
  getTile(layer, x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return -1;
    const idx = y * this.width + x;
    if (layer === 'ground') return this.groundLayer[idx];
    if (layer === 'decoration') return this.decorationLayer[idx];
    if (layer === 'collision') return this.collisionLayer[idx];
    return -1;
  }

  /** 获取碰撞瓦片 */
  getCollisionTile(x, y) {
    return this.getTile('collision', x, y);
  }

  /** 检查世界坐标是否有碰撞 */
  isSolidWorld(wx, wy) {
    const tx = Math.floor(wx / this.tileSize);
    const ty = Math.floor(wy / this.tileSize);
    return this.getCollisionTile(tx, ty) !== 0;
  }

  /** 程序化生成地图 */
  generate(seed = Math.random()) {
    const rng = this._seededRandom(seed);

    // 地面：草地基础
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // 草地瓦片 ID (Kenney Tiny Town: 0-3 是草地变体)
        this.groundLayer[y * this.width + x] = Math.floor(rng() * 4);
      }
    }

    // 生成道路
    this._generateRoads(rng);

    // 生成房屋
    this._generateHouses(rng);

    // 生成树木
    this._generateTrees(rng);

    // 生成装饰物
    this._generateDecorations(rng);
  }

  _seededRandom(seed) {
    return function() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  _generateRoads(rng) {
    // 生成主要道路（水平和垂直）
    const roadH = Math.floor(this.height / 2);
    const roadV = Math.floor(this.width / 2);

    for (let x = 0; x < this.width; x++) {
      this.groundLayer[roadH * this.width + x] = 16; // 道路瓦片
      if (x === roadV) this.groundLayer[roadH * this.width + x] = 17; // 交叉路口
    }
    for (let y = 0; y < this.height; y++) {
      this.groundLayer[y * this.width + roadV] = 16;
    }
  }

  _generateHouses(rng) {
    const houseCount = 5 + Math.floor(rng() * 8);
    for (let i = 0; i < houseCount; i++) {
      const hx = 3 + Math.floor(rng() * (this.width - 6));
      const hy = 3 + Math.floor(rng() * (this.height - 6));
      const w = 3 + Math.floor(rng() * 3);
      const h = 3 + Math.floor(rng() * 2);

      // 放置房屋（墙壁 + 屋顶）
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const tx = hx + dx;
          const ty = hy + dy;
          if (tx >= this.width || ty >= this.height) continue;

          const idx = ty * this.width + tx;
          if (dx === 0 || dx === w - 1 || dy === 0 || dy === h - 1) {
            // 墙壁
            this.decorationLayer[idx] = 48 + Math.floor(rng() * 4); // 墙壁瓦片
            this.collisionLayer[idx] = 1;
          } else if (dy === 1) {
            // 屋顶
            this.decorationLayer[idx] = 52 + Math.floor(rng() * 4);
          } else {
            // 内部地板
            this.groundLayer[idx] = 8 + Math.floor(rng() * 2);
          }
        }
      }

      this.objects.push({ type: 'house', x: hx, y: hy, w, h });
    }
  }

  _generateTrees(rng) {
    const treeCount = 15 + Math.floor(rng() * 20);
    for (let i = 0; i < treeCount; i++) {
      const tx = Math.floor(rng() * this.width);
      const ty = Math.floor(rng() * this.height);
      const idx = ty * this.width + tx;

      // 不在道路上放置树木
      if (this.groundLayer[idx] === 16 || this.groundLayer[idx] === 17) continue;
      if (this.collisionLayer[idx] !== 0) continue;

      // 树木瓦片 ID (Kenney Tiny Town)
      this.decorationLayer[idx] = 64 + Math.floor(rng() * 8);
      this.collisionLayer[idx] = 1; // 树木可碰撞
    }
  }

  _generateDecorations(rng) {
    const decoCount = 30 + Math.floor(rng() * 20);
    for (let i = 0; i < decoCount; i++) {
      const tx = Math.floor(rng() * this.width);
      const ty = Math.floor(rng() * this.height);
      const idx = ty * this.width + tx;

      if (this.collisionLayer[idx] !== 0) continue;

      // 随机装饰物：石头、花朵、草丛等
      this.decorationLayer[idx] = 80 + Math.floor(rng() * 16);
    }
  }

  /** 渲染地图 */
  render(ctx, camera) {
    if (!this.tilesetLoaded) return;

    const vp = camera.getViewport();
    const startX = Math.max(0, Math.floor(vp.left / this.tileSize));
    const startY = Math.max(0, Math.floor(vp.top / this.tileSize));
    const endX = Math.min(this.width, Math.ceil(vp.right / this.tileSize) + 1);
    const endY = Math.min(this.height, Math.ceil(vp.bottom / this.tileSize) + 1);

    // 渲染地面层
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tileId = this.groundLayer[y * this.width + x];
        if (tileId >= 0) {
          this._drawTile(ctx, tileId, x * this.tileSize, y * this.tileSize);
        }
      }
    }

    // 渲染装饰层
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tileId = this.decorationLayer[y * this.width + x];
        if (tileId >= 0) {
          this._drawTile(ctx, tileId, x * this.tileSize, y * this.tileSize);
        }
      }
    }
  }

  _drawTile(ctx, tileId, x, y) {
    if (!this.tilesetImage) return;
    const col = tileId % this.tilesetCols;
    const row = Math.floor(tileId / this.tilesetCols);
    const tw = this.tileSize;
    const th = this.tileSize;

    ctx.drawImage(
      this.tilesetImage,
      col * tw, row * th, tw, th,
      x, y, tw, th
    );
  }

  /** 渲染碰撞调试 */
  renderCollisionDebug(ctx) {
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.collisionLayer[y * this.width + x] !== 0) {
          ctx.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
        }
      }
    }
  }
}


// ============================================================
// 8. UI / HUD 系统
// ============================================================

/**
 * HUD 管理器
 * 血条、弹药、小地图、击杀提示、聊天框
 */
class HUDManager {
  constructor(engine) {
    this.engine = engine;
    this.canvas = engine.canvas;
    this.ctx = engine.ctx;

    // 血条数据
    this.health = { current: 100, max: 100, display: 100 };
    this.healthSmoothSpeed = 5; // 血条平滑速度

    // 弹药数据
    this.ammo = { current: 30, max: 30, reserve: 120 };
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadDuration = 1.5;

    // 小地图
    this.minimap = {
      width: 150,
      height: 150,
      scale: 0.1,
      enabled: true
    };

    // 击杀提示
    this.killFeed = [];
    this.killFeedMax = 5;
    this.killFeedDuration = 4;

    // 聊天框
    this.chatMessages = [];
    this.chatMaxMessages = 20;
    this.chatVisible = true;
    this.chatInputActive = false;
    this.chatInputText = '';

    // 其他 HUD 元素
    this.crosshair = { x: 0, y: 0, size: 10 };
    this.score = 0;
    this.wave = 1;
  }

  /** 更新 HUD */
  update(dt) {
    // 血条平滑动画
    const healthDiff = this.health.current - this.health.display;
    if (Math.abs(healthDiff) > 0.1) {
      this.health.display += healthDiff * Math.min(1, this.healthSmoothSpeed * dt);
    } else {
      this.health.display = this.health.current;
    }

    // 换弹计时
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.ammo.current = this.ammo.max;
      }
    }

    // 更新击杀提示
    for (let i = this.killFeed.length - 1; i >= 0; i--) {
      this.killFeed[i].timer -= dt;
      if (this.killFeed[i].timer <= 0) {
        this.killFeed.splice(i, 1);
      }
    }

    // 更新聊天消息
    for (let i = this.chatMessages.length - 1; i >= 0; i--) {
      this.chatMessages[i].timer -= dt;
    }
  }

  /** 设置血量 */
  setHealth(current, max) {
    this.health.current = Math.max(0, Math.min(max, current));
    this.health.max = max;
  }
  /** 受到伤害 */
  takeDamage(amount) {
    this.health.current = Math.max(0, this.health.current - amount);
  }
  /** 治疗 */
  heal(amount) {
    this.health.current = Math.min(this.health.max, this.health.current + amount);
  }

  /** 设置弹药 */
  setAmmo(current, max, reserve) {
    this.ammo.current = current;
    this.ammo.max = max;
    this.ammo.reserve = reserve;
  }
  /** 射击消耗弹药 */
  shoot() {
    if (this.reloading || this.ammo.current <= 0) return false;
    this.ammo.current--;
    return true;
  }
  /** 开始换弹 */
  reload() {
    if (this.reloading || this.ammo.current >= this.ammo.max) return;
    this.reloading = true;
    this.reloadTimer = this.reloadDuration;
  }

  /** 添加击杀提示 */
  addKillFeed(killer, victim, weapon = '') {
    this.killFeed.unshift({
      killer,
      victim,
      weapon,
      timer: this.killFeedDuration,
      alpha: 1
    });
    if (this.killFeed.length > this.killFeedMax) {
      this.killFeed.pop();
    }
    this.score++;
  }

  /** 添加聊天消息 */
  addChatMessage(sender, text, color = '#fff') {
    this.chatMessages.push({
      sender,
      text,
      color,
      timer: 10
    });
    if (this.chatMessages.length > this.chatMaxMessages) {
      this.chatMessages.shift();
    }
  }

  /** 渲染 HUD */
  render(ctx) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();

    // 准星
    this._renderCrosshair(ctx, w / 2, h / 2);

    // 血条
    this._renderHealthBar(ctx, 20, h - 60);

    // 弹药
    this._renderAmmo(ctx, w - 150, h - 60);

    // 小地图
    if (this.minimap.enabled) {
      this._renderMinimap(ctx, w - this.minimap.width - 20, 20);
    }

    // 击杀提示
    this._renderKillFeed(ctx, w - 300, 80);

    // 聊天框
    this._renderChat(ctx, 20, h - 300);

    // 分数和波次
    this._renderScore(ctx, w / 2, 20);

    ctx.restore();
  }

  _renderCrosshair(ctx, x, y) {
    const size = this.crosshair.size;
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();

    // 中心点
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.fill();
  }

  _renderHealthBar(ctx, x, y) {
    const width = 200;
    const height = 20;

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x, y, width, height);

    // 血量（平滑显示值）
    const healthRatio = this.health.display / this.health.max;
    const healthColor = healthRatio > 0.6 ? '#4ade80' : healthRatio > 0.3 ? '#facc15' : '#ef4444';
    ctx.fillStyle = healthColor;
    ctx.fillRect(x, y, width * healthRatio, height);

    // 边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // 文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(this.health.display)}/${this.health.max}`, x + width / 2, y + height - 5);
    ctx.textAlign = 'start';
  }

  _renderAmmo(ctx, x, y) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'right';

    if (this.reloading) {
      const progress = 1 - (this.reloadTimer / this.reloadDuration);
      ctx.fillStyle = '#facc15';
      ctx.fillText(`RELOADING ${Math.floor(progress * 100)}%`, x + 100, y + 20);
    } else {
      ctx.fillText(`${this.ammo.current} / ${this.ammo.reserve}`, x + 100, y + 20);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillText(`${this.ammo.max} MAX`, x + 100, y + 40);
    }
    ctx.textAlign = 'start';
  }

  _renderMinimap(ctx, x, y) {
    const mw = this.minimap.width;
    const mh = this.minimap.height;

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x, y, mw, mh);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, mw, mh);

    // 绘制地图内容（简化版）
    if (this.engine.currentScene && this.engine.currentScene.tileMap) {
      const map = this.engine.currentScene.tileMap;
      const scaleX = mw / (map.width * map.tileSize);
      const scaleY = mh / (map.height * map.tileSize);
      const scale = Math.min(scaleX, scaleY);

      // 绘制碰撞区域（简化）
      ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
      for (let my = 0; my < map.height; my += 2) {
        for (let mx = 0; mx < map.width; mx += 2) {
          if (map.getCollisionTile(mx, my) !== 0) {
            ctx.fillRect(
              x + mx * scale * map.tileSize,
              y + my * scale * map.tileSize,
              scale * map.tileSize * 2,
              scale * map.tileSize * 2
            );
          }
        }
      }
    }

    // 绘制玩家位置
    const player = this.engine.currentScene ? this.engine.currentScene.player : null;
    if (player) {
      const px = x + (player.x / (this.engine.currentScene.tileMap.width * this.engine.currentScene.tileMap.tileSize)) * mw;
      const py = y + (player.y / (this.engine.currentScene.tileMap.height * this.engine.currentScene.tileMap.tileSize)) * mh;
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();

      // 视口框
      const vp = this.engine.camera.getViewport();
      const vpx = x + (vp.left / (this.engine.currentScene.tileMap.width * this.engine.currentScene.tileMap.tileSize)) * mw;
      const vpy = y + (vp.top / (this.engine.currentScene.tileMap.height * this.engine.currentScene.tileMap.tileSize)) * mh;
      const vpw = (vp.right - vp.left) / (this.engine.currentScene.tileMap.width * this.engine.currentScene.tileMap.tileSize) * mw;
      const vph = (vp.bottom - vp.top) / (this.engine.currentScene.tileMap.height * this.engine.currentScene.tileMap.tileSize) * mh;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.strokeRect(vpx, vpy, vpw, vph);
    }
  }

  _renderKillFeed(ctx, x, y) {
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i < this.killFeed.length; i++) {
      const kill = this.killFeed[i];
      const alpha = Math.min(1, kill.timer / 1);
      const yPos = y + i * 22;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = kill.weapon ? '#facc15' : '#fff';
      const text = `${kill.killer} [${kill.weapon}] ${kill.victim}`;
      ctx.fillText(text, x + 280, yPos);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  _renderChat(ctx, x, y) {
    if (!this.chatVisible) return;

    const lineHeight = 18;
    const maxVisible = 8;
    const visibleMessages = this.chatMessages.slice(-maxVisible);

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(x, y, 350, maxVisible * lineHeight + 10);

    ctx.font = '13px sans-serif';
    for (let i = 0; i < visibleMessages.length; i++) {
      const msg = visibleMessages[i];
      const alpha = Math.min(1, msg.timer / 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = msg.color || '#fff';
      ctx.fillText(`${msg.sender}: ${msg.text}`, x + 5, y + 15 + i * lineHeight);
    }
    ctx.globalAlpha = 1;

    // 输入框
    if (this.chatInputActive) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(x, y + maxVisible * lineHeight + 15, 350, 25);
      ctx.fillStyle = '#fff';
      ctx.fillText(`> ${this.chatInputText}_`, x + 5, y + maxVisible * lineHeight + 32);
    }
  }

  _renderScore(ctx, x, y) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`WAVE ${this.wave}  |  SCORE ${this.score}`, x, y);
    ctx.textAlign = 'start';
  }

  /** 激活聊天输入 */
  activateChat() {
    this.chatInputActive = true;
    this.chatInputText = '';
  }
  /** 提交聊天消息 */
  submitChat() {
    if (this.chatInputText.trim()) {
      this.addChatMessage('Player', this.chatInputText.trim());
      this.chatInputText = '';
    }
    this.chatInputActive = false;
  }
  /** 添加聊天输入字符 */
  addChatChar(char) {
    if (this.chatInputActive) {
      this.chatInputText += char;
    }
  }
  /** 删除聊天输入字符 */
  backspaceChat() {
    if (this.chatInputActive) {
      this.chatInputText = this.chatInputText.slice(0, -1);
    }
  }
}


// ============================================================
// 导出（如果是模块环境）
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GameEngine,
    Scene,
    Camera,
    ObjectPool,
    ParticlePool,
    BulletPool,
    PhysicsEngine,
    SpriteSheet,
    Animation,
    AnimationStateMachine,
    ParticleEmitter,
    SoundManager,
    InputManager,
    TileMap,
    HUDManager
  };
}
