/* ============================================================
   废土交易所 - Phaser 3 专业版
   ============================================================ */

// ========== 全局工具 ==========
const $ = id => document.getElementById(id);
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ========== Phaser 游戏配置 ==========
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
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    batchSize: 4096,
    maxLights: 0,
    packFrames: true
  },
  fps: {
    target: 30,
    forceSetTimeOut: false
  }
};

// ========== 大厅场景 ==========
class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LobbyScene' });
  }

  preload() {
    // 枪械素材
    this.load.image('pistol', '../assets/guns/Pistol.png');
    this.load.image('ak47', '../assets/guns/AK47.png');
    this.load.image('shotgun', '../assets/guns/Shotgun.png');
    this.load.image('sniper', '../assets/guns/SniperRifle.png');
    this.load.image('minigun', '../assets/guns/Minigun.png');
    
    // 粒子纹理（代码生成，不需要加载）
  }

  create() {
    window.gameScene = this;
    
    // 生成粒子纹理
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffdd44);
    g.fillCircle(4, 4, 4);
    g.generateTexture('particle', 8, 8);
    g.destroy();
    
    // 地图尺寸（缩小到合理范围）
    this.mapW = 800;
    this.mapH = 600;
    
    // 摄像机
    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    
    // 创建地图层
    this.createMap();
    
    // 创建玩家
    this.me = this.createPlayer(800, 600, '幸存者', true);
    this.cameras.main.startFollow(this.me.sprite, true, 0.1, 0.1);
    
    // 其他玩家
    this.others = new Map();
    
    // 子弹组
    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      defaultKey: 'particle',
      maxSize: 100,
      runChildUpdate: true
    });
    
    // 粒子管理器
    this.particleManager = this.add.particles(0, 0, 'particle', {
      speed: { min: 50, max: 150 },
      scale: { start: 1, end: 0 },
      lifespan: 500,
      blendMode: 'ADD',
      emitting: false
    });
    
    // 输入
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT');
    
    // 摇杆
    this.joystick = { active: false, dx: 0, dy: 0 };
    this.createJoystick();
    
    // 枪系统
    this.guns = [
      { id: 'pistol', name: '手枪', damage: 15, fireRate: 0.3, bulletSpeed: 600, spread: 0.05, bulletsPerShot: 1, ammo: 30, maxAmmo: 30, sound: 'pistol' },
      { id: 'ak47', name: 'AK47', damage: 12, fireRate: 0.1, bulletSpeed: 700, spread: 0.08, bulletsPerShot: 1, ammo: 60, maxAmmo: 60, sound: 'ak47' },
      { id: 'shotgun', name: '霰弹枪', damage: 8, fireRate: 0.8, bulletSpeed: 500, spread: 0.2, bulletsPerShot: 5, ammo: 20, maxAmmo: 20, sound: 'shotgun' },
      { id: 'sniper', name: '狙击枪', damage: 50, fireRate: 1.5, bulletSpeed: 1000, spread: 0.01, bulletsPerShot: 1, ammo: 10, maxAmmo: 10, sound: 'sniper' },
      { id: 'minigun', name: '加特林', damage: 6, fireRate: 0.05, bulletSpeed: 800, spread: 0.15, bulletsPerShot: 1, ammo: 200, maxAmmo: 200, sound: 'minigun' }
    ];
    this.currentGun = 0;
    this.lastFireTime = 0;
    
    // 显示按钮
    this.showMobileButtons();
    
    // 定时广播位置
    this.time.addEvent({
      delay: 100,
      callback: this.broadcastPos,
      callbackScope: this,
      loop: true
    });
    
    // 日夜循环
    this.dayNightCycle = 0;
    
    // 创建日夜遮罩（用小尺寸覆盖视口即可）
    this.nightOverlay = this.add.rectangle(400, 300, 800, 600, 0x000033, 0.6);
    this.nightOverlay.setDepth(100);
    this.nightOverlay.setScrollFactor(0);
    this.nightOverlay.setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  createMap() {
    // 用 RenderTexture 烘焙地面（1850个矩形 → 1张纹理，性能提升100倍）
    const tileSize = 32;
    const rt = this.add.renderTexture(0, 0, this.mapW, this.mapH);
    rt.setDepth(0);
    rt.setOrigin(0);
    
    const g = this.make.graphics({ add: false });
    for (let x = 0; x < this.mapW; x += tileSize) {
      for (let y = 0; y < this.mapH; y += tileSize) {
        const isStreet = (x > 200 && x < 1400 && y > 200 && y < 1000);
        g.fillStyle(isStreet ? 0x3a3a3a : 0x2a2a1a);
        g.fillRect(x, y, tileSize, tileSize);
      }
    }
    // 装饰物
    const decoColors = [0x4a4a3a, 0x3a3a2a, 0x5a5a4a];
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.Between(100, this.mapW - 100);
      const y = Phaser.Math.Between(100, this.mapH - 100);
      const size = Phaser.Math.Between(20, 40);
      g.fillStyle(Phaser.Utils.Array.GetRandom(decoColors));
      g.fillRect(x - size/2, y - size/2, size, size);
    }
    rt.draw(g);
    g.destroy();
    
    // 墙壁/障碍物（数量少，保持独立对象用于碰撞）
    this.walls = this.physics.add.staticGroup();
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.Between(200, this.mapW - 200);
      const y = Phaser.Math.Between(200, this.mapH - 200);
      const w = Phaser.Math.Between(60, 200);
      const h = Phaser.Math.Between(60, 200);
      const wall = this.add.rectangle(x, y, w, h, 0x4a3828);
      wall.setDepth(2);
      this.walls.add(wall);
    }
  }

  createPlayer(x, y, name, isMe = false) {
    const container = this.add.container(x, y);
    container.setDepth(10);
    
    // 角色精灵
    const sprite = this.add.rectangle(0, 0, 24, 24, isMe ? 0x4a7a3a : 0xa09080);
    container.add(sprite);
    
    // 枪
    const gun = this.add.rectangle(16, 4, 20, 8, 0x6a6a6a);
    container.add(gun);
    
    // 名字标签
    const nameText = this.add.text(0, -20, name, {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: isMe ? '#4a7a3a' : '#a09080',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5);
    container.add(nameText);
    
    // 血条背景
    const hpBg = this.add.rectangle(0, -32, 40, 4, 0x000000, 0.6);
    container.add(hpBg);
    
    // 血条
    const hpBar = this.add.rectangle(-20, -32, 40, 4, 0x4a7a3a);
    hpBar.setOrigin(0, 0.5);
    container.add(hpBar);
    
    // 物理
    this.physics.add.existing(container);
    container.body.setSize(24, 24);
    container.body.setCollideWorldBounds(true);
    
    // 数据
    const playerData = {
      sprite: container,
      body: container.body,
      name: name,
      hp: 100,
      maxHp: 100,
      dead: false,
      deadTimer: 0,
      faceDir: 1,
      gun: gun,
      hpBar: hpBar,
      isMe: isMe
    };
    
    if (isMe) {
      this.physics.add.collider(container, this.walls);
    }
    
    return playerData;
  }

  createJoystick() {
    // 虚拟摇杆区域
    const zone = this.add.zone(100, this.scale.height - 100, 150, 150);
    zone.setInteractive();
    
    zone.on('pointerdown', (pointer) => {
      this.joystick.active = true;
      this.joystick.cx = pointer.x;
      this.joystick.cy = pointer.y;
    });
    
    zone.on('pointermove', (pointer) => {
      if (!this.joystick.active) return;
      const dx = pointer.x - this.joystick.cx;
      const dy = pointer.y - this.joystick.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 50;
      if (dist > maxDist) {
        this.joystick.dx = (dx / dist) * (dist > maxDist ? 1 : dist / maxDist);
        this.joystick.dy = (dy / dist) * (dist > maxDist ? 1 : dist / maxDist);
      } else {
        this.joystick.dx = dx / maxDist;
        this.joystick.dy = dy / maxDist;
      }
    });
    
    zone.on('pointerup', () => {
      this.joystick.active = false;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
    });
  }

  update(time, delta) {
    const dt = delta / 1000;
    
    // 日夜循环
    this.dayNightCycle += dt * 0.5;
    const hour = (this.dayNightCycle / 24) % 24;
    let alpha = 0;
    if (hour >= 20 || hour < 6) alpha = 0.6;
    else if (hour >= 18 && hour < 20) alpha = (hour - 18) / 2 * 0.4;
    this.nightOverlay.setAlpha(alpha);
    
    // 玩家移动
    if (!this.me.dead) {
      let dx = 0, dy = 0;
      
      // 键盘
      if (this.cursors.left.isDown || this.keys.A.isDown) dx = -1;
      if (this.cursors.right.isDown || this.keys.D.isDown) dx = 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) dy = -1;
      if (this.cursors.down.isDown || this.keys.S.isDown) dy = 1;
      
      // 摇杆
      if (this.joystick.active) {
        dx = this.joystick.dx;
        dy = this.joystick.dy;
      }
      
      const speed = 200;
      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 1) { dx /= len; dy /= len; }
        this.me.body.setVelocity(dx * speed, dy * speed);
        this.me.faceDir = dx < 0 ? -1 : 1;
        
        // 翻转枪
        this.me.gun.setScale(this.me.faceDir, 1);
        this.me.gun.setX(this.me.faceDir * 16);
      } else {
        this.me.body.setVelocity(0);
      }
    } else {
      this.me.body.setVelocity(0);
    }
    
    // 更新其他玩家
    for (const [id, p] of this.others) {
      const targetX = p.tx || p.sprite.x;
      const targetY = p.ty || p.sprite.y;
      p.sprite.x += (targetX - p.sprite.x) * 0.1;
      p.sprite.y += (targetY - p.sprite.y) * 0.1;
      
      // 更新血条
      const hpRatio = Math.max(0, p.hp) / p.maxHp;
      p.hpBar.setScale(hpRatio, 1);
      p.hpBar.setFillStyle(hpRatio > 0.5 ? 0x4a7a3a : hpRatio > 0.25 ? 0xb8960f : 0xc4463a);
    }
    
    // 更新子弹
    this.bullets.children.each(bullet => {
      if (!bullet.active) return;
      bullet.life -= dt;
      if (bullet.life <= 0) {
        bullet.setActive(false);
        bullet.setVisible(false);
      }
    });
  }

  fireGun() {
    if (this.me.dead) return;
    
    const now = this.time.now / 1000;
    const gun = this.guns[this.currentGun];
    if (now - this.lastFireTime < gun.fireRate) return;
    if (gun.ammo <= 0) { toast('没有弹药了！'); return; }
    
    this.lastFireTime = now;
    gun.ammo--;
    
    const faceDir = this.me.faceDir;
    const px = this.me.sprite.x;
    const py = this.me.sprite.y;
    
    for (let i = 0; i < gun.bulletsPerShot; i++) {
      const angle = (faceDir > 0 ? 0 : Math.PI) + ((Math.random() - 0.5) * gun.spread * 2);
      const speed = gun.bulletSpeed * (0.9 + Math.random() * 0.2);
      
      const bullet = this.bullets.get(px + faceDir * 20, py);
      if (bullet) {
        bullet.setActive(true);
        bullet.setVisible(true);
        bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        bullet.life = 2;
        bullet.damage = gun.damage;
        bullet.owner = 'me';
      }
    }
    
    // 枪口火焰粒子
    this.particleManager.emitParticleAt(
      px + faceDir * 20,
      py,
      10
    );
    
    // 屏幕震动
    this.cameras.main.shake(50, 0.005);
  }

  swapGun() {
    this.currentGun = (this.currentGun + 1) % this.guns.length;
    const gun = this.guns[this.currentGun];
    toast(`切换: ${gun.name}`);
  }

  doAction() {
    toast('交互功能待实现');
  }

  _fireDown() {
    this._firing = true;
    this.fireLoop = this.time.addEvent({
      delay: 50,
      callback: () => { if (this._firing) this.fireGun(); },
      callbackScope: this,
      loop: true
    });
  }

  _fireUp() {
    this._firing = false;
    if (this.fireLoop) {
      this.fireLoop.remove();
      this.fireLoop = null;
    }
  }

  broadcastPos() {
    // MQTT 广播位置
    if (window.G && window.G.mqtt && window.G.mqttConnected) {
      window.G.mqtt.publish(`wl_pos_v6/${window.G.myId}`, JSON.stringify({
        type: 'pos',
        x: Math.round(this.me.sprite.x),
        y: Math.round(this.me.sprite.y),
        faceDir: this.me.faceDir,
        hp: this.me.hp,
        maxHp: this.me.maxHp,
        dead: this.me.dead
      }), { qos: 0 });
    }
  }

  handlePos(msg, fromId) {
    if (fromId === window.G?.myId) return;
    
    let p = this.others.get(fromId);
    if (!p) {
      p = this.createPlayer(msg.x || 0, msg.y || 0, msg.name || '幸存者');
      this.others.set(fromId, p);
    }
    
    p.tx = msg.x;
    p.ty = msg.y;
    if (msg.faceDir) {
      p.faceDir = msg.faceDir;
      p.gun.setScale(p.faceDir, 1);
      p.gun.setX(p.faceDir * 16);
    }
    if (msg.hp !== undefined && msg.hp > p.hp) p.hp = msg.hp;
    if (msg.dead !== undefined) p.dead = msg.dead;
  }

  showMobileButtons() {
    $('action-btn').style.display = 'block';
    $('fire-btn').style.display = 'block';
    $('swap-btn').style.display = 'block';
  }
}

// ========== 启动游戏 ==========
window.addEventListener('load', () => {
  config.scene = [LobbyScene];
  window.game = new Phaser.Game(config);
});

// ========== 全局游戏数据 ==========
window.G = {
  user: '幸存者',
  chips: 50,
  myId: 'player_' + Math.random().toString(36).substr(2, 8),
  mqtt: null,
  mqttConnected: false
};

// ========== 占位函数 ==========
function showCreateModal() { toast('创建牌桌功能待实现'); }
function showSettings() { toast('设置功能待实现'); }
function showFriendPanel() { toast('好友功能待实现'); }
function showMailPanel() { toast('邮件功能待实现'); }
function toggleChat() { toast('聊天功能待实现'); }
