/* ============================================================
   废土交易所 - Phaser 3 专业版 v29.4
   ============================================================ */

const $ = id => document.getElementById(id);
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ========== Phaser 配置 ==========
const config = {
  type: Phaser.WEBGL,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1610',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: { batchSize: 4096, maxLights: 0, packFrames: true },
  fps: { target: 30, forceSetTimeOut: false }
};

// ========== 大厅场景 ==========
class LobbyScene extends Phaser.Scene {
  constructor() { super({ key: 'LobbyScene' }); }

  preload() {
    // 加载进度条
    const bar = $('loading-bar');
    const txt = $('loading-text');
    if (bar) this.load.on('progress', v => { bar.style.width = (v * 100) + '%'; });
    if (txt) this.load.on('progress', v => { txt.textContent = '加载中... ' + Math.floor(v * 100) + '%'; });

    // 瓦片地图
    this.load.image('tilemap', '../assets/kenney_tiny_town/Tilemap/tilemap.png');

    // 狸猫精灵图集
    this.load.spritesheet('tanuki-idle', '../assets/spritesheets/tanuki-idle.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('tanuki-walk', '../assets/spritesheets/tanuki-walk.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('tanuki-run',  '../assets/spritesheets/tanuki-run.png',  { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('tanuki-hurt', '../assets/spritesheets/tanuki-hurt.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('tanuki-dead', '../assets/spritesheets/tanuki-dead.png', { frameWidth: 128, frameHeight: 128 });

    // 枪械
    this.load.image('pistol',  '../assets/guns/Pistol.png');
    this.load.image('ak47',    '../assets/guns/AK47.png');
    this.load.image('shotgun', '../assets/guns/Shotgun.png');
    this.load.image('sniper',  '../assets/guns/SniperRifle.png');
    this.load.image('minigun', '../assets/guns/Minigun.png');
  }

  create() {
    window.gameScene = this;

    // 隐藏 loading
    const overlay = $('loading-overlay');
    if (overlay) overlay.style.display = 'none';

    // 生成粒子纹理
    this.generateTextures();

    // 创建动画
    this.createAnimations();

    // 地图
    this.mapW = 800;
    this.mapH = 600;
    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    this.createTilemap();

    // 玩家
    this.me = this.createPlayer(400, 300, '幸存者', true);
    this.cameras.main.startFollow(this.me.container, true, 0.08, 0.08);

    // 其他玩家
    this.others = new Map();

    // 子弹对象池
    this.bullets = this.physics.add.group({ maxSize: 50, classType: Phaser.Physics.Arcade.Image });

    // 输入
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT');
    this.joystick = { active: false, dx: 0, dy: 0 };
    this.setupJoystick();

    // 枪系统
    this.guns = [
      { id:'pistol',  name:'手枪',   damage:15, fireRate:0.3, bulletSpeed:600, spread:0.05, bulletsPerShot:1, ammo:30,  maxAmmo:30 },
      { id:'ak47',    name:'AK47',    damage:12, fireRate:0.1, bulletSpeed:700, spread:0.08, bulletsPerShot:1, ammo:60,  maxAmmo:60 },
      { id:'shotgun', name:'霰弹枪', damage:8,  fireRate:0.8, bulletSpeed:500, spread:0.2,  bulletsPerShot:5, ammo:20,  maxAmmo:20 },
      { id:'sniper',  name:'狙击枪', damage:50, fireRate:1.5, bulletSpeed:1000,spread:0.01, bulletsPerShot:1, ammo:10,  maxAmmo:10 },
      { id:'minigun', name:'加特林', damage:6,  fireRate:0.05,bulletSpeed:800, spread:0.15, bulletsPerShot:1, ammo:200, maxAmmo:200 }
    ];
    this.currentGun = 0;
    this.lastFireTime = 0;

    // HUD
    this.createHUD();

    // 日夜
    this.dayNightCycle = 0;
    this.nightOverlay = this.add.rectangle(400, 300, 800, 600, 0x000033, 0.6);
    this.nightOverlay.setDepth(100);
    this.nightOverlay.setScrollFactor(0);
    this.nightOverlay.setBlendMode(Phaser.BlendModes.MULTIPLY);

    // 广播
    this.time.addEvent({ delay: 100, callback: this.broadcastPos, callbackScope: this, loop: true });

    this.showMobileButtons();
  }

  generateTextures() {
    // 子弹纹理
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffdd44);
    g.fillCircle(4, 4, 4);
    g.generateTexture('bullet', 8, 8);
    g.clear();
    // 枪口火焰
    g.fillStyle(0xff8800);
    g.fillCircle(6, 6, 6);
    g.fillStyle(0xffee44);
    g.fillCircle(6, 6, 3);
    g.generateTexture('muzzle', 12, 12);
    g.clear();
    // 血液粒子
    g.fillStyle(0xcc2222);
    g.fillCircle(3, 3, 3);
    g.generateTexture('blood', 6, 6);
    g.clear();
    // 弹壳
    g.fillStyle(0xccaa44);
    g.fillRect(0, 0, 4, 6);
    g.generateTexture('casing', 4, 6);
    g.destroy();
  }

  createAnimations() {
    // 狸猫动画
    this.anims.create({ key: 'idle', frames: this.anims.generateFrameNumbers('tanuki-idle', { start: 0, end: 11 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'walk', frames: this.anims.generateFrameNumbers('tanuki-walk', { start: 0, end: 11 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'run',  frames: this.anims.generateFrameNumbers('tanuki-run',  { start: 0, end: 9 }),  frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'hurt', frames: this.anims.generateFrameNumbers('tanuki-hurt', { start: 0, end: 5 }),  frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'dead', frames: this.anims.generateFrameNumbers('tanuki-dead', { start: 0, end: 9 }),  frameRate: 6, repeat: 0 });
  }

  createTilemap() {
    // 用 RenderTexture 烘焙瓦片地图
    const tilemap = this.textures.get('tilemap');
    const ts = 16; // Kenney 瓦片是 16x16
    const scale = 2; // 放大到 32x32 显示
    const rt = this.add.renderTexture(0, 0, this.mapW, this.mapH);
    rt.setDepth(0);
    rt.setOrigin(0);

    const g = this.make.graphics({ add: false });
    // 地面层 - 用瓦片图集的不同区域
    for (let x = 0; x < this.mapW; x += ts * scale) {
      for (let y = 0; y < this.mapH; y += ts * scale) {
        // 从 tilemap 中随机取一个地面瓦片区域
        const srcX = Phaser.Math.Between(0, 11) * ts;
        const srcY = Phaser.Math.Between(0, 2) * ts; // 前3行是地面
        g.drawImage(tilemap, srcX, srcY, ts, ts, x, y, ts * scale, ts * scale);
      }
    }
    // 添加一些装饰（树、石头等）
    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.Between(50, this.mapW - 50);
      const y = Phaser.Math.Between(50, this.mapH - 50);
      // 树（第4-5行）
      const srcX = Phaser.Math.Between(0, 11) * ts;
      const srcY = Phaser.Math.Between(3, 5) * ts;
      g.drawImage(tilemap, srcX, srcY, ts, ts, x, y, ts * scale, ts * scale);
    }
    rt.draw(g);
    g.destroy();

    // 墙壁碰撞体（用真实瓦片显示）
    this.walls = this.physics.add.staticGroup();
    const wallPositions = [
      { x: 200, y: 150, w: 120, h: 16 },
      { x: 500, y: 300, w: 16, h: 120 },
      { x: 350, y: 450, w: 160, h: 16 },
      { x: 650, y: 200, w: 16, h: 100 },
      { x: 100, y: 400, w: 100, h: 16 },
    ];
    for (const wp of wallPositions) {
      // 从瓦片图集取墙壁纹理
      const wallG = this.make.graphics({ add: false });
      const srcX = 6 * ts; // 石墙区域
      const srcY = 6 * ts;
      for (let wx = 0; wx < wp.w; wx += ts * scale) {
        for (let wy = 0; wy < wp.h; wy += ts * scale) {
          wallG.drawImage(tilemap, srcX, srcY, ts, ts, wx, wy, ts * scale, ts * scale);
        }
      }
      wallG.generateTexture('wall_' + wp.x + '_' + wp.y, wp.w, wp.h);
      wallG.destroy();

      const wall = this.add.image(wp.x, wp.y, 'wall_' + wp.x + '_' + wp.y);
      wall.setDepth(2);
      this.walls.add(wall);
      wall.body.setSize(wp.w, wp.h);
      wall.body.setOffset(wp.w / 2, wp.h / 2);
    }
  }

  createPlayer(x, y, name, isMe) {
    const container = this.add.container(x, y);
    container.setDepth(10);
    container.setSize(40, 40);

    // 角色精灵（带动画）
    const sprite = this.add.sprite(0, 0, 'tanuki-idle');
    sprite.setScale(0.5); // 128x128 → 64x64 显示
    sprite.anims.play('idle');
    container.add(sprite);

    // 枪（真实图片）
    const gun = this.add.image(20, 8, 'pistol');
    gun.setScale(0.3);
    gun.setOrigin(0, 0.5);
    container.add(gun);

    // 名字
    const nameText = this.add.text(0, -28, name, {
      fontSize: '10px', fontFamily: 'monospace',
      color: isMe ? '#4a7a3a' : '#a09080',
      stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5);
    container.add(nameText);

    // 血条背景
    container.add(this.add.rectangle(0, -40, 44, 6, 0x000000, 0.7));
    // 血条
    const hpBar = this.add.rectangle(-22, -40, 44, 6, 0x4a7a3a);
    hpBar.setOrigin(0, 0.5);
    container.add(hpBar);

    // 物理
    this.physics.add.existing(container);
    container.body.setSize(30, 30);
    container.body.setOffset(0, 10);
    container.body.setCollideWorldBounds(true);
    if (isMe) this.physics.add.collider(container, this.walls);

    return {
      container, sprite, body: container.body, gun, hpBar, nameText,
      name, hp: 100, maxHp: 100, dead: false, deadTimer: 0,
      faceDir: 1, isMe, state: 'idle'
    };
  }

  setupJoystick() {
    // 全屏触摸区域（左半部分为摇杆）
    this.input.on('pointerdown', (pointer) => {
      if (pointer.x < this.scale.width * 0.5) {
        this.joystick.active = true;
        this.joystick.startX = pointer.x;
        this.joystick.startY = pointer.y;
        this.joystick.pointerId = pointer.id;
      }
    });

    this.input.on('pointermove', (pointer) => {
      if (this.joystick.active && pointer.id === this.joystick.pointerId) {
        const dx = pointer.x - this.joystick.startX;
        const dy = pointer.y - this.joystick.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 50;
        this.joystick.dx = dist > maxDist ? (dx / dist) : (dx / maxDist);
        this.joystick.dy = dist > maxDist ? (dy / dist) : (dy / maxDist);
      }
    });

    this.input.on('pointerup', (pointer) => {
      if (pointer.id === this.joystick.pointerId) {
        this.joystick.active = false;
        this.joystick.dx = 0;
        this.joystick.dy = 0;
      }
    });
  }

  createHUD() {
    // 枪械信息（固定在屏幕上）
    this.hudGroup = this.add.group();
    this.hudGroup.setScrollFactor(0);

    // 当前枪械名称
    this.gunNameText = this.add.text(10, 50, '', {
      fontSize: '12px', fontFamily: 'monospace', color: '#b8960f',
      stroke: '#000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(200);

    // 弹药数
    this.ammoText = this.add.text(10, 68, '', {
      fontSize: '11px', fontFamily: 'monospace', color: '#c4b896',
      stroke: '#000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(200);

    // 小地图
    this.minimapBg = this.add.rectangle(this.scale.width - 70, 70, 120, 90, 0x000000, 0.5)
      .setScrollFactor(0).setDepth(200).setStrokeStyle(1, 0x4a3828);
    this.minimapDot = this.add.circle(this.scale.width - 70, 70, 3, 0x4a7a3a)
      .setScrollFactor(0).setDepth(201);
    // 其他玩家点
    this.minimapOthers = this.add.group();
    this.minimapOthers.setScrollFactor(0);
  }

  updateHUD() {
    const gun = this.guns[this.currentGun];
    this.gunNameText.setText(gun.name);
    this.ammoText.setText(`${gun.ammo} / ${gun.maxAmmo}`);

    // 小地图 - 玩家位置
    const mmx = this.scale.width - 70;
    const mmy = 70;
    const scaleX = 120 / this.mapW;
    const scaleY = 90 / this.mapH;
    this.minimapDot.setPosition(mmx + this.me.container.x * scaleX, mmy + this.me.container.y * scaleY);

    // 清除旧的其他玩家点
    this.minimapOthers.clear(true);
    for (const [id, p] of this.others) {
      const dot = this.add.circle(mmx + p.container.x * scaleX, mmy + p.container.y * scaleY, 2, 0xc4463a);
      dot.setScrollFactor(0).setDepth(201);
      this.minimapOthers.add(dot);
    }
  }

  update(time, delta) {
    const dt = delta / 1000;

    // 日夜
    this.dayNightCycle += dt * 0.5;
    const hour = (this.dayNightCycle / 24) % 24;
    let alpha = 0;
    if (hour >= 20 || hour < 6) alpha = 0.6;
    else if (hour >= 18 && hour < 20) alpha = (hour - 18) / 2 * 0.4;
    this.nightOverlay.setAlpha(alpha);

    // 玩家移动
    if (!this.me.dead) {
      let dx = 0, dy = 0;
      if (this.cursors.left.isDown || this.keys.A.isDown) dx = -1;
      if (this.cursors.right.isDown || this.keys.D.isDown) dx = 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) dy = -1;
      if (this.cursors.down.isDown || this.keys.S.isDown) dy = 1;
      if (this.joystick.active) { dx = this.joystick.dx; dy = this.joystick.dy; }

      const speed = 200;
      const isSprinting = this.keys.SHIFT.isDown;
      const moving = (dx !== 0 || dy !== 0);

      if (moving) {
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 1) { dx /= len; dy /= len; }
        this.me.body.setVelocity(dx * speed * (isSprinting ? 1.5 : 1), dy * speed * (isSprinting ? 1.5 : 1));
        this.me.faceDir = dx < 0 ? -1 : 1;
        this.me.gun.setScale(-this.me.faceDir * 0.3, 0.3);
        this.me.gun.setX(this.me.faceDir * 20);

        // 切换动画
        if (this.me.state !== (isSprinting ? 'run' : 'walk')) {
          this.me.state = isSprinting ? 'run' : 'walk';
          this.me.sprite.anims.play(this.me.state, true);
        }
        this.me.sprite.setFlipX(this.me.faceDir < 0);
      } else {
        this.me.body.setVelocity(0);
        if (this.me.state !== 'idle') {
          this.me.state = 'idle';
          this.me.sprite.anims.play('idle', true);
        }
      }
    } else {
      this.me.body.setVelocity(0);
    }

    // 阵亡/复活
    if (this.me.dead) {
      this.me.deadTimer -= dt;
      if (this.me.deadTimer <= 0) {
        this.me.dead = false;
        this.me.hp = this.me.maxHp;
        this.me.sprite.anims.play('idle', true);
        this.me.state = 'idle';
        toast('已复活！');
      }
    } else if (this.me.hp <= 0) {
      this.me.dead = true;
      this.me.deadTimer = 5;
      this.me.hp = 0;
      this.me.sprite.anims.play('dead');
      this.me.state = 'dead';
      this.me.body.setVelocity(0);
      toast('你阵亡了！5秒后复活');
    }

    // 更新血条
    const hpRatio = Math.max(0, this.me.hp) / this.me.maxHp;
    this.me.hpBar.setScale(hpRatio, 1);
    this.me.hpBar.setFillStyle(hpRatio > 0.5 ? 0x4a7a3a : hpRatio > 0.25 ? 0xb8960f : 0xc4463a);

    // 其他玩家插值
    for (const [id, p] of this.others) {
      if (p.tx !== undefined) {
        p.container.x += (p.tx - p.container.x) * 0.12;
        p.container.y += (p.ty - p.container.y) * 0.12;
      }
      const ratio = Math.max(0, p.hp) / p.maxHp;
      p.hpBar.setScale(ratio, 1);
      p.hpBar.setFillStyle(ratio > 0.5 ? 0x4a7a3a : ratio > 0.25 ? 0xb8960f : 0xc4463a);
    }

    // 子弹更新
    for (let i = this.bullets.getLength() - 1; i >= 0; i--) {
      const b = this.bullets.getChildren()[i];
      if (!b || !b.active) continue;
      b.life -= dt;
      if (b.life <= 0 || this.checkWallHit(b.x, b.y)) {
        this.bullets.killAndHide(b);
      }
    }

    // HUD（每10帧更新一次减少开销）
    if (time % 10 < 2) this.updateHUD();
  }

  checkWallHit(x, y) {
    for (const wall of this.walls.getChildren()) {
      const wb = wall.body;
      if (wb && Phaser.Geom.Rectangle.Contains(wb, x, y)) return true;
    }
    return false;
  }

  fireGun() {
    if (this.me.dead) return;
    const now = this.time.now / 1000;
    const gun = this.guns[this.currentGun];
    if (now - this.lastFireTime < gun.fireRate) return;
    if (gun.ammo <= 0) { toast('没有弹药了！'); return; }

    this.lastFireTime = now;
    gun.ammo--;

    const fd = this.me.faceDir;
    const px = this.me.container.x;
    const py = this.me.container.y;

    for (let i = 0; i < gun.bulletsPerShot; i++) {
      const angle = (fd > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * gun.spread * 2;
      const speed = gun.bulletSpeed * (0.9 + Math.random() * 0.2);
      const b = this.bullets.get(px + fd * 25, py);
      if (b) {
        b.setTexture('bullet');
        b.setActive(true).setVisible(true);
        b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        b.life = 1.5;
        b.damage = gun.damage;
        b.owner = 'me';
      }
    }

    // 枪口火焰粒子
    const emitter = this.add.particles(px + fd * 25, py, 'muzzle', {
      speed: { min: 30, max: 80 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 150,
      blendMode: 'ADD',
      emitting: false,
      quantity: 5
    });
    emitter.explode();
    this.time.delayedCall(300, () => emitter.destroy());

    // 弹壳粒子
    const casing = this.add.particles(px, py, 'casing', {
      speed: { min: 20, max: 60 },
      angle: { min: fd > 0 ? 200 : 340, max: fd > 0 ? 250 : 30 },
      scale: 1,
      gravityY: 300,
      lifespan: 600,
      emitting: false,
      quantity: 1
    });
    casing.explode();
    this.time.delayedCall(700, () => casing.destroy());

    // 屏幕震动
    this.cameras.main.shake(40, 0.003);
  }

  swapGun() {
    this.currentGun = (this.currentGun + 1) % this.guns.length;
    const gun = this.guns[this.currentGun];
    this.me.gun.setTexture(gun.id);
    toast(`切换: ${gun.name}`);
  }

  doAction() { toast('交互功能待实现'); }

  _fireDown() {
    this._firing = true;
    this.fireLoop = this.time.addEvent({ delay: 50, callback: () => { if (this._firing) this.fireGun(); }, callbackScope: this, loop: true });
  }

  _fireUp() {
    this._firing = false;
    if (this.fireLoop) { this.fireLoop.remove(); this.fireLoop = null; }
  }

  broadcastPos() {
    if (window.G?.mqtt?.mqttConnected) {
      window.G.mqtt.publish(`wl_pos_v6/${window.G.myId}`, JSON.stringify({
        type: 'pos', x: Math.round(this.me.container.x), y: Math.round(this.me.container.y),
        faceDir: this.me.faceDir, hp: this.me.hp, maxHp: this.me.maxHp,
        dead: this.me.dead, state: this.me.state
      }), { qos: 0 });
    }
  }

  handlePos(msg, fromId) {
    if (fromId === window.G?.myId) return;
    let p = this.others.get(fromId);
    if (!p) {
      p = this.createPlayer(msg.x || 0, msg.y || 0, msg.name || '幸存者', false);
      this.others.set(fromId, p);
    }
    p.tx = msg.x; p.ty = msg.y;
    if (msg.faceDir) {
      p.faceDir = msg.faceDir;
      p.gun.setScale(-p.faceDir * 0.3, 0.3);
      p.gun.setX(p.faceDir * 20);
      p.sprite.setFlipX(p.faceDir < 0);
    }
    if (msg.hp !== undefined && msg.hp > p.hp) p.hp = msg.hp;
    if (msg.dead !== undefined) p.dead = msg.dead;
    if (msg.state && p.state !== msg.state) {
      p.state = msg.state;
      if (p.sprite.anims.exists(msg.state)) p.sprite.anims.play(msg.state, true);
    }
  }

  showMobileButtons() {
    $('action-btn').style.display = 'block';
    $('fire-btn').style.display = 'block';
    $('swap-btn').style.display = 'block';
  }
}

// ========== 启动 ==========
window.addEventListener('load', () => {
  config.scene = [LobbyScene];
  window.game = new Phaser.Game(config);
});

window.G = {
  user: '幸存者', chips: 50,
  myId: 'player_' + Math.random().toString(36).substr(2, 8),
  mqtt: null, mqttConnected: false
};

function showCreateModal() { toast('创建牌桌功能待实现'); }
function showSettings() { toast('设置功能待实现'); }
function showFriendPanel() { toast('好友功能待实现'); }
function showMailPanel() { toast('邮件功能待实现'); }
function toggleChat() { toast('聊天功能待实现'); }
