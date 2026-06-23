/**
 * game-scene.js
 * LobbyScene 类 - 农场游戏大厅场景
 * 包含：玩家系统、其他玩家同步、子弹系统、地图对象、交互系统、日夜循环、相机系统、HUD
 */

// ============================================================
// 工具函数
// ============================================================

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpVec2(a, b, t) {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function angleTo(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
}

// ============================================================
// 动画精灵加载器
// ============================================================

class SpriteLoader {
    constructor() {
        this.cache = {};
    }

    loadSpriteSheet(basePath, frames, prefix, suffix = '.png') {
        const key = `${basePath}/${prefix}`;
        if (this.cache[key]) return this.cache[key];

        const images = [];
        for (let i = 0; i < frames.length; i++) {
            const img = new Image();
            img.src = `${basePath}/${prefix}_${String(frames[i]).padStart(3, '0')}${suffix}`;
            images.push(img);
        }
        this.cache[key] = images;
        return images;
    }

    loadTanukiAnim(folder, name, count) {
        const base = 'assets/raccoon/FAT_ANIMAL_TANUKI/FAT ANIMAL TANUKI/Animation PNG/TANUKI/NUDE';
        const frames = [];
        for (let i = 0; i < count; i++) {
            frames.push(i);
        }
        return this.loadSpriteSheet(`${base}/${folder}`, frames, `NUDE_TANUKI_${name}`);
    }
}

const spriteLoader = new SpriteLoader();

// ============================================================
// 粒子系统
// ============================================================

class Particle {
    constructor(x, y, vx, vy, life, color, size) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.size = size || 3;
        this.gravity = 0;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += this.gravity * dt;
        this.life -= dt;
    }

    draw(ctx) {
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    emit(x, y, count, color, speed, life, size) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = (Math.random() * 0.5 + 0.5) * speed;
            const vx = Math.cos(angle) * spd;
            const vy = Math.sin(angle) * spd;
            this.particles.push(new Particle(x, y, vx, vy, life + Math.random() * 0.3, color, size));
        }
    }

    emitBlood(x, y, count = 8) {
        this.emit(x, y, count, '#cc2222', 120, 0.6, 4);
    }

    emitSpark(x, y, count = 5) {
        this.emit(x, y, count, '#ffdd44', 150, 0.4, 2);
    }

    emitSmoke(x, y, count = 3) {
        this.emit(x, y, count, '#888888', 40, 1.0, 6);
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        for (const p of this.particles) {
            p.draw(ctx);
        }
    }
}

// ============================================================
// 枪系统配置
// ============================================================

const GUN_CONFIG = {
    pistol: {
        name: '手枪',
        damage: 15,
        fireRate: 0.3,
        bulletSpeed: 500,
        spread: 0.05,
        recoil: 3,
        ammoMax: 12,
        reloadTime: 1.2,
        auto: false,
        image: 'assets/guns/Pistol.png',
        outline: 'assets/guns/Pistol(WhiteOutline).png'
    },
    ak47: {
        name: 'AK-47',
        damage: 22,
        fireRate: 0.1,
        bulletSpeed: 600,
        spread: 0.08,
        recoil: 5,
        ammoMax: 30,
        reloadTime: 2.0,
        auto: true,
        image: 'assets/guns/AK47.png',
        outline: 'assets/guns/Ak47(WhiteOutline).png'
    },
    shotgun: {
        name: '霰弹枪',
        damage: 12,
        fireRate: 0.8,
        bulletSpeed: 450,
        spread: 0.25,
        recoil: 12,
        ammoMax: 6,
        reloadTime: 2.5,
        auto: false,
        pellets: 5,
        image: 'assets/guns/Shotgun.png',
        outline: 'assets/guns/Shotgun(WhiteOutline).png'
    },
    sniper: {
        name: '狙击枪',
        damage: 80,
        fireRate: 1.5,
        bulletSpeed: 900,
        spread: 0.01,
        recoil: 15,
        ammoMax: 5,
        reloadTime: 3.0,
        auto: false,
        image: 'assets/guns/SniperRifle.png',
        outline: 'assets/guns/SniperRifle(WhiteOutline).png'
    },
    minigun: {
        name: '加特林',
        damage: 10,
        fireRate: 0.05,
        bulletSpeed: 550,
        spread: 0.15,
        recoil: 2,
        ammoMax: 100,
        reloadTime: 4.0,
        auto: true,
        image: 'assets/guns/Minigun.png',
        outline: 'assets/guns/Minigun(WhiteOutline).png'
    }
};

// ============================================================
// 子弹类
// ============================================================

class Bullet {
    constructor(x, y, angle, owner, gunType) {
        const config = GUN_CONFIG[gunType];
        this.x = x;
        this.y = y;
        const spreadAngle = (Math.random() - 0.5) * config.spread * 2;
        this.angle = angle + spreadAngle;
        this.speed = config.bulletSpeed;
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        this.owner = owner;
        this.damage = config.damage;
        this.life = 2.0;
        this.radius = 3;
        this.gunType = gunType;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#ffee88';
        ctx.fillRect(-6, -1.5, 12, 3);
        ctx.restore();
    }

    getBounds() {
        return { x: this.x, y: this.y, radius: this.radius };
    }
}

// ============================================================
// 玩家类
// ============================================================

class Player {
    constructor(x, y, name = 'Player') {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.speed = 120;
        this.runSpeed = 220;
        this.maxHealth = 100;
        this.health = 100;
        this.name = name;
        this.state = 'idle'; // idle, walk, run, hurt, dead, respawn
        this.facing = 1; // 1 = right, -1 = left
        this.width = 32;
        this.height = 48;

        // 动画
        this.animTimer = 0;
        this.animFrame = 0;
        this.anims = {
            idle: spriteLoader.loadTanukiAnim('01-Idle', 'Idle', 12),
            walk: spriteLoader.loadTanukiAnim('03-Walk/01-Walk', 'Walk', 12),
            run: spriteLoader.loadTanukiAnim('04-Run', 'Run', 10),
            hurt: spriteLoader.loadTanukiAnim('07-Hurt/01-Hurt', 'Hurt', 6),
            dead: spriteLoader.loadTanukiAnim('08-Dead', 'Dead', 10),
            throw: spriteLoader.loadTanukiAnim('02-Throw', 'Throw', 8)
        };

        // 枪系统
        this.guns = ['pistol', 'ak47', 'shotgun', 'sniper', 'minigun'];
        this.currentGunIndex = 0;
        this.ammo = {};
        for (const key in GUN_CONFIG) {
            this.ammo[key] = GUN_CONFIG[key].ammoMax;
        }
        this.fireCooldown = 0;
        this.reloading = false;
        this.reloadTimer = 0;
        this.recoilOffset = { x: 0, y: 0 };

        // 状态
        this.invincible = false;
        this.invincibleTimer = 0;
        this.deadTimer = 0;
        this.respawnTimer = 0;
        this.hurtTimer = 0;
        this.kills = 0;
        this.deaths = 0;

        // 输入
        this.keys = {};
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseDown = false;

        // 枪图片缓存
        this.gunImages = {};
        for (const key in GUN_CONFIG) {
            const img = new Image();
            img.src = GUN_CONFIG[key].image;
            this.gunImages[key] = img;
        }
    }

    get currentGun() {
        return this.guns[this.currentGunIndex];
    }

    get gunConfig() {
        return GUN_CONFIG[this.currentGun];
    }

    switchGun(index) {
        if (index >= 0 && index < this.guns.length) {
            this.currentGunIndex = index;
            this.reloading = false;
            this.reloadTimer = 0;
        }
    }

    nextGun() {
        this.switchGun((this.currentGunIndex + 1) % this.guns.length);
    }

    prevGun() {
        this.switchGun((this.currentGunIndex - 1 + this.guns.length) % this.guns.length);
    }

    reload() {
        if (this.reloading || this.ammo[this.currentGun] >= this.gunConfig.ammoMax) return;
        this.reloading = true;
        this.reloadTimer = this.gunConfig.reloadTime;
    }

    takeDamage(amount) {
        if (this.invincible || this.state === 'dead' || this.state === 'respawn') return;
        this.health -= amount;
        this.hurtTimer = 0.3;
        if (this.state !== 'dead') {
            this.state = 'hurt';
        }
        if (this.health <= 0) {
            this.health = 0;
            this.die();
        }
    }

    die() {
        this.state = 'dead';
        this.deadTimer = 3.0;
        this.deaths++;
        this.vx = 0;
        this.vy = 0;
    }

    respawn(x, y) {
        this.x = x;
        this.y = y;
        this.health = this.maxHealth;
        this.state = 'idle';
        this.invincible = true;
        this.invincibleTimer = 2.0;
        this.vx = 0;
        this.vy = 0;
        for (const key in GUN_CONFIG) {
            this.ammo[key] = GUN_CONFIG[key].ammoMax;
        }
    }

    canFire() {
        return this.fireCooldown <= 0 && !this.reloading && this.state !== 'dead' && this.state !== 'respawn' && this.ammo[this.currentGun] > 0;
    }

    fire() {
        if (!this.canFire()) return null;
        const config = this.gunConfig;
        const angle = angleTo({ x: this.x, y: this.y }, { x: this.mouseX, y: this.mouseY });
        const bullets = [];

        const pellets = config.pellets || 1;
        for (let i = 0; i < pellets; i++) {
            bullets.push(new Bullet(this.x, this.y - 10, angle, this, this.currentGun));
        }

        this.ammo[this.currentGun]--;
        this.fireCooldown = config.fireRate;
        this.recoilOffset.x = -Math.cos(angle) * config.recoil * 2;
        this.recoilOffset.y = -Math.sin(angle) * config.recoil * 2;

        return bullets;
    }

    update(dt, walls) {
        // 状态计时器
        if (this.fireCooldown > 0) this.fireCooldown -= dt;
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= dt;
            if (this.invincibleTimer <= 0) this.invincible = false;
        }
        if (this.hurtTimer > 0) {
            this.hurtTimer -= dt;
            if (this.hurtTimer <= 0 && this.state === 'hurt') {
                this.state = 'idle';
            }
        }

        // 死亡/复活
        if (this.state === 'dead') {
            this.deadTimer -= dt;
            if (this.deadTimer <= 0) {
                this.state = 'respawn';
                this.respawnTimer = 1.0;
            }
            this.updateAnim(dt);
            return;
        }
        if (this.state === 'respawn') {
            this.respawnTimer -= dt;
            if (this.respawnTimer <= 0) {
                this.respawn(400, 300);
            }
            return;
        }

        // 装弹
        if (this.reloading) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                this.ammo[this.currentGun] = this.gunConfig.ammoMax;
                this.reloading = false;
            }
        }

        // 后坐力恢复
        this.recoilOffset.x = lerp(this.recoilOffset.x, 0, dt * 10);
        this.recoilOffset.y = lerp(this.recoilOffset.y, 0, dt * 10);

        // 移动输入
        let mx = 0;
        let my = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) my -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) my += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) mx -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) mx += 1;

        const running = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
        const moveSpeed = running ? this.runSpeed : this.speed;

        if (mx !== 0 || my !== 0) {
            const len = Math.sqrt(mx * mx + my * my);
            mx /= len;
            my /= len;
            this.vx = mx * moveSpeed;
            this.vy = my * moveSpeed;
            this.state = running ? 'run' : 'walk';
            this.facing = mx >= 0 ? 1 : -1;
        } else {
            this.vx = lerp(this.vx, 0, dt * 15);
            this.vy = lerp(this.vy, 0, dt * 15);
            if (Math.abs(this.vx) < 1 && Math.abs(this.vy) < 1) {
                this.vx = 0;
                this.vy = 0;
                if (this.state !== 'hurt') this.state = 'idle';
            }
        }

        // 应用移动 + 碰撞
        const newX = this.x + this.vx * dt;
        const newY = this.y + this.vy * dt;

        if (!this.checkWallCollision(newX, this.y, walls)) {
            this.x = newX;
        } else {
            this.vx = 0;
        }
        if (!this.checkWallCollision(this.x, newY, walls)) {
            this.y = newY;
        } else {
            this.vy = 0;
        }

        // 自动射击
        if (this.mouseDown && this.gunConfig.auto) {
            const bullets = this.fire();
            if (bullets) {
                this.pendingBullets = bullets;
            }
        }

        this.updateAnim(dt);
    }

    checkWallCollision(x, y, walls) {
        const hw = this.width / 2;
        const hh = this.height / 2;
        for (const wall of walls) {
            if (x + hw > wall.x && x - hw < wall.x + wall.w &&
                y > wall.y && y - this.height < wall.y + wall.h) {
                return true;
            }
        }
        return false;
    }

    updateAnim(dt) {
        this.animTimer += dt;
        const anim = this.anims[this.state] || this.anims.idle;
        const fps = this.state === 'run' ? 12 : (this.state === 'walk' ? 8 : 6);
        const frameTime = 1 / fps;
        if (this.animTimer >= frameTime) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % anim.length;
        }
        if (this.state === 'dead' && this.animFrame >= anim.length - 1) {
            this.animFrame = anim.length - 1;
        }
    }

    getCurrentFrame() {
        const anim = this.anims[this.state] || this.anims.idle;
        return anim[Math.min(this.animFrame, anim.length - 1)];
    }

    draw(ctx) {
        const frame = this.getCurrentFrame();
        if (!frame || !frame.complete) return;

        ctx.save();

        // 无敌闪烁
        if (this.invincible && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // 受伤红色闪烁
        if (this.hurtTimer > 0) {
            ctx.filter = 'brightness(1.5) sepia(1) saturate(3) hue-rotate(-50deg)';
        }

        const drawX = this.x + this.recoilOffset.x;
        const drawY = this.y + this.recoilOffset.y;

        ctx.translate(drawX, drawY);
        ctx.scale(this.facing, 1);
        ctx.drawImage(frame, -this.width / 2, -this.height, this.width, this.height);

        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.restore();

        // 绘制枪
        if (this.state !== 'dead' && this.state !== 'respawn') {
            this.drawGun(ctx);
        }
    }

    drawGun(ctx) {
        const gunImg = this.gunImages[this.currentGun];
        if (!gunImg || !gunImg.complete) return;

        const angle = angleTo({ x: this.x, y: this.y }, { x: this.mouseX, y: this.mouseY });
        const gunOffset = 16;

        ctx.save();
        ctx.translate(this.x + this.recoilOffset.x, this.y - 16 + this.recoilOffset.y);
        ctx.rotate(angle);
        ctx.scale(0.4, 0.4);
        ctx.drawImage(gunImg, 0, -gunImg.height / 2);
        ctx.restore();
    }

    drawHUD(ctx, cameraX, cameraY) {
        // 名字
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(this.name, this.x, this.y - this.height - 8);
        ctx.fillText(this.name, this.x, this.y - this.height - 8);

        // 血条背景
        const barW = 40;
        const barH = 5;
        const barX = this.x - barW / 2;
        const barY = this.y - this.height - 5;
        ctx.fillStyle = '#330000';
        ctx.fillRect(barX, barY, barW, barH);

        // 血条
        const hpRatio = this.health / this.maxHealth;
        ctx.fillStyle = hpRatio > 0.5 ? '#22cc22' : (hpRatio > 0.25 ? '#cccc22' : '#cc2222');
        ctx.fillRect(barX, barY, barW * hpRatio, barH);

        // 血条边框
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
    }
}

// ============================================================
// 其他玩家类
// ============================================================

class OtherPlayer {
    constructor(id, x, y, name) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.name = name;
        this.health = 100;
        this.maxHealth = 100;
        this.state = 'idle';
        this.facing = 1;
        this.width = 32;
        this.height = 48;
        this.animTimer = 0;
        this.animFrame = 0;
        this.gunType = 'pistol';

        this.anims = {
            idle: spriteLoader.loadTanukiAnim('01-Idle', 'Idle', 12),
            walk: spriteLoader.loadTanukiAnim('03-Walk/01-Walk', 'Walk', 12),
            run: spriteLoader.loadTanukiAnim('04-Run', 'Run', 10),
            hurt: spriteLoader.loadTanukiAnim('07-Hurt/01-Hurt', 'Hurt', 6),
            dead: spriteLoader.loadTanukiAnim('08-Dead', 'Dead', 10)
        };

        this.gunImages = {};
        for (const key in GUN_CONFIG) {
            const img = new Image();
            img.src = GUN_CONFIG[key].image;
            this.gunImages[key] = img;
        }
    }

    sync(data) {
        this.targetX = data.x;
        this.targetY = data.y;
        this.state = data.state || 'idle';
        this.facing = data.facing || 1;
        this.health = data.health || 100;
        this.gunType = data.gunType || 'pistol';
        if (data.name) this.name = data.name;
    }

    update(dt) {
        // 位置插值
        this.x = lerp(this.x, this.targetX, dt * 8);
        this.y = lerp(this.y, this.targetY, dt * 8);

        this.animTimer += dt;
        const anim = this.anims[this.state] || this.anims.idle;
        const fps = this.state === 'run' ? 12 : (this.state === 'walk' ? 8 : 6);
        const frameTime = 1 / fps;
        if (this.animTimer >= frameTime) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % anim.length;
        }
    }

    getCurrentFrame() {
        const anim = this.anims[this.state] || this.anims.idle;
        return anim[Math.min(this.animFrame, anim.length - 1)];
    }

    draw(ctx) {
        const frame = this.getCurrentFrame();
        if (!frame || !frame.complete) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.facing, 1);
        ctx.drawImage(frame, -this.width / 2, -this.height, this.width, this.height);
        ctx.restore();

        // 枪
        const gunImg = this.gunImages[this.gunType];
        if (gunImg && gunImg.complete && this.state !== 'dead') {
            ctx.save();
            ctx.translate(this.x, this.y - 16);
            ctx.scale(this.facing * 0.4, 0.4);
            ctx.drawImage(gunImg, 0, -gunImg.height / 2);
            ctx.restore();
        }

        // 名字标签
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(this.name, this.x, this.y - this.height - 8);
        ctx.fillText(this.name, this.x, this.y - this.height - 8);

        // 血条
        const barW = 40;
        const barH = 5;
        const barX = this.x - barW / 2;
        const barY = this.y - this.height - 5;
        ctx.fillStyle = '#330000';
        ctx.fillRect(barX, barY, barW, barH);
        const hpRatio = this.health / this.maxHealth;
        ctx.fillStyle = hpRatio > 0.5 ? '#22cc22' : (hpRatio > 0.25 ? '#cccc22' : '#cc2222');
        ctx.fillRect(barX, barY, barW * hpRatio, barH);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
    }
}

// ============================================================
// 地图对象
// ============================================================

class MapObject {
    constructor(x, y, w, h, type, options = {}) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.type = type; // 'house', 'table', 'wall', 'tree', 'rock', 'decoration'
        this.solid = options.solid !== false;
        this.interactive = options.interactive || false;
        this.interactionRadius = options.interactionRadius || 60;
        this.label = options.label || '';
        this.image = options.image || null;
        this.color = options.color || '#888888';
        this.z = options.z || 0;
    }

    getBounds() {
        return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    getCenter() {
        return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
    }

    isNear(player) {
        const c = this.getCenter();
        const d = Math.sqrt((player.x - c.x) ** 2 + (player.y - c.y) ** 2);
        return d < this.interactionRadius;
    }

    draw(ctx) {
        if (this.image && this.image.complete) {
            ctx.drawImage(this.image, this.x, this.y, this.w, this.h);
        } else {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 1;
            ctx.strokeRect(this.x, this.y, this.w, this.h);
        }

        // 交互提示
        if (this.interactive && this.label) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.label, this.x + this.w / 2, this.y - 4);
        }
    }
}

// ============================================================
// 交互系统
// ============================================================

class InteractionSystem {
    constructor() {
        this.nearbyObject = null;
        this.prompt = '';
        this.showPrompt = false;
    }

    update(player, objects) {
        this.nearbyObject = null;
        this.showPrompt = false;
        let closest = null;
        let closestDist = Infinity;

        for (const obj of objects) {
            if (!obj.interactive) continue;
            const c = obj.getCenter();
            const d = Math.sqrt((player.x - c.x) ** 2 + (player.y - c.y) ** 2);
            if (d < obj.interactionRadius && d < closestDist) {
                closestDist = d;
                closest = obj;
            }
        }

        if (closest) {
            this.nearbyObject = closest;
            this.showPrompt = true;
            if (closest.type === 'house') {
                this.prompt = '按 E 进入房屋';
            } else if (closest.type === 'table') {
                this.prompt = '按 E 加入牌桌';
            } else {
                this.prompt = `按 E 交互: ${closest.label}`;
            }
        }
    }

    draw(ctx, player) {
        if (!this.showPrompt || !this.nearbyObject) return;
        const x = player.x;
        const y = player.y - player.height - 30;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x - 60, y - 12, 120, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.prompt, x, y + 3);
    }

    interact(player, onEnterHouse, onJoinTable) {
        if (!this.nearbyObject) return;
        if (this.nearbyObject.type === 'house' && onEnterHouse) {
            onEnterHouse(this.nearbyObject);
        } else if (this.nearbyObject.type === 'table' && onJoinTable) {
            onJoinTable(this.nearbyObject);
        }
    }
}

// ============================================================
// 日夜循环
// ============================================================

class DayNightCycle {
    constructor() {
        this.time = 6.0; // 0-24小时
        this.dayDuration = 300; // 游戏内一天 = 300秒真实时间
        this.timeScale = 24 / this.dayDuration;

        // 天气
        this.weather = 'clear'; // clear, rain, fog, sandstorm
        this.weatherTimer = 0;
        this.weatherDuration = 60;
        this.weatherIntensity = 0;
        this.targetWeatherIntensity = 0;

        // 雨滴
        this.raindrops = [];
        for (let i = 0; i < 200; i++) {
            this.raindrops.push({
                x: Math.random() * 2000,
                y: Math.random() * 2000,
                speed: 300 + Math.random() * 200,
                len: 10 + Math.random() * 15
            });
        }
    }

    update(dt) {
        this.time += dt * this.timeScale;
        if (this.time >= 24) this.time -= 24;

        // 天气变化
        this.weatherTimer += dt;
        if (this.weatherTimer >= this.weatherDuration) {
            this.weatherTimer = 0;
            this.changeWeather();
        }

        this.weatherIntensity = lerp(this.weatherIntensity, this.targetWeatherIntensity, dt * 2);

        // 更新雨滴
        if (this.weather === 'rain') {
            for (const drop of this.raindrops) {
                drop.y += drop.speed * dt;
                if (drop.y > 2000) {
                    drop.y = -50;
                    drop.x = Math.random() * 2000;
                }
            }
        }
    }

    changeWeather() {
        const weathers = ['clear', 'rain', 'fog', 'sandstorm'];
        const weights = [0.5, 0.25, 0.15, 0.1];
        let r = Math.random();
        for (let i = 0; i < weathers.length; i++) {
            r -= weights[i];
            if (r <= 0) {
                this.weather = weathers[i];
                break;
            }
        }
        this.targetWeatherIntensity = this.weather === 'clear' ? 0 : 1;
        this.weatherDuration = 30 + Math.random() * 60;
    }

    getLightColor() {
        // 根据时间计算光照颜色
        const t = this.time;
        if (t >= 6 && t < 18) {
            // 白天
            const noon = 12;
            const dist = Math.abs(t - noon) / 6;
            const brightness = 1 - dist * 0.3;
            return { r: 1.0 * brightness, g: 1.0 * brightness, b: 0.95 * brightness, a: 0 };
        } else {
            // 夜晚
            const night = t > 18 ? (t - 18) / 6 : (t + 6) / 6;
            const darkness = 0.3 + night * 0.4;
            return { r: 0.1 * darkness, g: 0.15 * darkness, b: 0.3 * darkness, a: 0.6 };
        }
    }

    getOverlayAlpha() {
        const t = this.time;
        if (t >= 6 && t < 18) {
            return 0;
        } else if (t >= 18 && t < 20) {
            return (t - 18) / 2 * 0.5;
        } else if (t >= 20 || t < 4) {
            return 0.5;
        } else {
            return (6 - t) / 2 * 0.5;
        }
    }

    drawOverlay(ctx, width, height) {
        const alpha = this.getOverlayAlpha();
        if (alpha <= 0 && this.weather === 'clear') return;

        // 夜晚遮罩
        if (alpha > 0) {
            ctx.fillStyle = `rgba(10, 15, 40, ${alpha})`;
            ctx.fillRect(0, 0, width, height);
        }

        // 雨
        if (this.weather === 'rain' && this.weatherIntensity > 0.01) {
            ctx.strokeStyle = `rgba(180, 200, 255, ${0.4 * this.weatherIntensity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (const drop of this.raindrops) {
                ctx.moveTo(drop.x, drop.y);
                ctx.lineTo(drop.x - 2, drop.y + drop.len);
            }
            ctx.stroke();
        }

        // 雾
        if (this.weather === 'fog' && this.weatherIntensity > 0.01) {
            ctx.fillStyle = `rgba(200, 210, 220, ${0.3 * this.weatherIntensity})`;
            ctx.fillRect(0, 0, width, height);
        }

        // 沙尘暴
        if (this.weather === 'sandstorm' && this.weatherIntensity > 0.01) {
            ctx.fillStyle = `rgba(194, 164, 100, ${0.25 * this.weatherIntensity})`;
            ctx.fillRect(0, 0, width, height);
        }
    }

    drawTimeIndicator(ctx, x, y) {
        const hour = Math.floor(this.time);
        const minute = Math.floor((this.time - hour) * 60);
        const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        const period = hour >= 6 && hour < 18 ? '白天' : '夜晚';
        const weatherName = {
            clear: '晴朗',
            rain: '下雨',
            fog: '雾',
            sandstorm: '沙尘暴'
        }[this.weather];

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - 5, y - 14, 110, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${timeStr} ${period} ${weatherName}`, x, y);
    }
}

// ============================================================
// 相机系统
// ============================================================

class Camera {
    constructor(width, height) {
        this.x = 0;
        this.y = 0;
        this.width = width;
        this.height = height;
        this.smoothSpeed = 5;
        this.bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
        this.shakeAmount = 0;
        this.shakeDecay = 10;
    }

    setBounds(minX, minY, maxX, maxY) {
        this.bounds = { minX, minY, maxX, maxY };
    }

    shake(amount) {
        this.shakeAmount = amount;
    }

    update(dt, targetX, targetY) {
        // 平滑跟随
        const targetCamX = targetX - this.width / 2;
        const targetCamY = targetY - this.height / 2;
        this.x = lerp(this.x, targetCamX, dt * this.smoothSpeed);
        this.y = lerp(this.y, targetCamY, dt * this.smoothSpeed);

        // 边界限制
        this.x = clamp(this.x, this.bounds.minX, this.bounds.maxX - this.width);
        this.y = clamp(this.y, this.bounds.minY, this.bounds.maxY - this.height);

        // 屏幕震动
        if (this.shakeAmount > 0) {
            this.x += (Math.random() - 0.5) * this.shakeAmount;
            this.y += (Math.random() - 0.5) * this.shakeAmount;
            this.shakeAmount -= this.shakeDecay * dt;
            if (this.shakeAmount < 0) this.shakeAmount = 0;
        }
    }

    apply(ctx) {
        ctx.translate(-this.x, -this.y);
    }

    reset(ctx) {
        ctx.translate(this.x, this.y);
    }

    worldToScreen(wx, wy) {
        return { x: wx - this.x, y: wy - this.y };
    }

    screenToWorld(sx, sy) {
        return { x: sx + this.x, y: sy + this.y };
    }
}

// ============================================================
// HUD 系统
// ============================================================

class HUD {
    constructor(player) {
        this.player = player;
        this.killFeed = [];
        this.gunImages = {};
        for (const key in GUN_CONFIG) {
            const img = new Image();
            img.src = GUN_CONFIG[key].outline;
            this.gunImages[key] = img;
        }
    }

    addKillFeed(killer, victim) {
        this.killFeed.unshift({ killer, victim, time: 5.0 });
        if (this.killFeed.length > 5) this.killFeed.pop();
    }

    update(dt) {
        for (let i = this.killFeed.length - 1; i >= 0; i--) {
            this.killFeed[i].time -= dt;
            if (this.killFeed[i].time <= 0) {
                this.killFeed.splice(i, 1);
            }
        }
    }

    draw(ctx, width, height) {
        // 血条（左下角）
        this.drawHealthBar(ctx, 20, height - 50);

        // 弹药（右下角）
        this.drawAmmo(ctx, width - 120, height - 50);

        // 当前枪械（底部中央）
        this.drawCurrentGun(ctx, width / 2, height - 60);

        // 小地图（右上角）
        this.drawMinimap(ctx, width - 160, 20, 140, 100);

        // 击杀提示（右上）
        this.drawKillFeed(ctx, width - 210, 140);

        // 准星
        this.drawCrosshair(ctx, width / 2, height / 2);
    }

    drawHealthBar(ctx, x, y) {
        const w = 150;
        const h = 20;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
        ctx.fillStyle = '#330000';
        ctx.fillRect(x, y, w, h);
        const ratio = this.player.health / this.player.maxHealth;
        ctx.fillStyle = ratio > 0.5 ? '#22cc22' : (ratio > 0.25 ? '#cccc22' : '#cc2222');
        ctx.fillRect(x, y, w * ratio, h);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(this.player.health)}/${this.player.maxHealth}`, x + w / 2, y + h - 4);
    }

    drawAmmo(ctx, x, y) {
        const config = this.player.gunConfig;
        const current = this.player.ammo[this.player.currentGun];
        const max = config.ammoMax;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - 5, y - 5, 110, 40);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${current}`, x + 50, y + 18);
        ctx.font = '12px sans-serif';
        ctx.fillText(`/${max}`, x + 80, y + 18);

        if (this.player.reloading) {
            ctx.fillStyle = '#ffaa00';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('装弹中...', x + 50, y + 32);
        }
    }

    drawCurrentGun(ctx, x, y) {
        const gunImg = this.gunImages[this.player.currentGun];
        if (gunImg && gunImg.complete) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(0.6, 0.6);
            ctx.drawImage(gunImg, -gunImg.width / 2, -gunImg.height / 2);
            ctx.restore();
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.player.gunConfig.name, x, y + 25);
    }

    drawMinimap(ctx, x, y, w, h) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // 地图比例
        const mapW = 2000;
        const mapH = 2000;
        const scaleX = w / mapW;
        const scaleY = h / mapH;

        // 玩家位置
        const px = x + this.player.x * scaleX;
        const py = y + this.player.y * scaleY;
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    drawKillFeed(ctx, x, y) {
        for (let i = 0; i < this.killFeed.length; i++) {
            const feed = this.killFeed[i];
            const alpha = Math.min(1, feed.time);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(x, y + i * 22, 200, 20);
            ctx.fillStyle = '#ffcc00';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${feed.killer} 击杀了 ${feed.victim}`, x + 5, y + i * 22 + 15);
        }
        ctx.globalAlpha = 1;
    }

    drawCrosshair(ctx, x, y) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        const size = 8;
        const gap = 4;
        ctx.beginPath();
        ctx.moveTo(x - size - gap, y);
        ctx.lineTo(x - gap, y);
        ctx.moveTo(x + gap, y);
        ctx.lineTo(x + size + gap, y);
        ctx.moveTo(x, y - size - gap);
        ctx.lineTo(x, y - gap);
        ctx.moveTo(x, y + gap);
        ctx.lineTo(x, y + size + gap);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
    }
}

// ============================================================
// 场景基类
// ============================================================

class Scene {
    constructor(game) {
        this.game = game;
        this.entities = [];
    }

    enter() {}
    exit() {}
    update(dt) {}
    draw(ctx) {}
    handleInput(e) {}
}

// ============================================================
// LobbyScene 大厅场景
// ============================================================

class LobbyScene extends Scene {
    constructor(game) {
        super(game);

        // 玩家
        this.player = new Player(400, 300, '我');
        this.player.pendingBullets = null;

        // 其他玩家
        this.otherPlayers = new Map();

        // 子弹
        this.bullets = [];

        // 粒子
        this.particles = new ParticleSystem();

        // 地图对象
        this.mapObjects = [];
        this.walls = [];
        this.initMapObjects();

        // 交互
        this.interaction = new InteractionSystem();

        // 日夜循环
        this.dayNight = new DayNightCycle();

        // 相机
        this.camera = new Camera(game.canvas.width, game.canvas.height);
        this.camera.setBounds(0, 0, 2000, 2000);

        // HUD
        this.hud = new HUD(this.player);

        // 输入事件绑定
        this.bindInput();
    }

    initMapObjects() {
        // 房屋
        this.mapObjects.push(new MapObject(100, 100, 120, 100, 'house', {
            solid: true,
            interactive: true,
            label: '小屋',
            color: '#8B4513',
            interactionRadius: 70
        }));
        this.mapObjects.push(new MapObject(600, 150, 140, 110, 'house', {
            solid: true,
            interactive: true,
            label: '仓库',
            color: '#A0522D',
            interactionRadius: 70
        }));

        // 牌桌 (4种小游戏)
        const tableGames = ['德州扑克', '二十一点', '炸金花', '斗地主'];
        const tablePositions = [
            { x: 350, y: 200 },
            { x: 800, y: 300 },
            { x: 200, y: 500 },
            { x: 700, y: 600 }
        ];
        for (let i = 0; i < 4; i++) {
            this.mapObjects.push(new MapObject(
                tablePositions[i].x,
                tablePositions[i].y,
                60, 40, 'table', {
                    solid: true,
                    interactive: true,
                    label: tableGames[i],
                    color: '#228B22',
                    interactionRadius: 60
                }
            ));
        }

        // 墙壁/障碍物
        const wallPositions = [
            { x: 50, y: 50, w: 10, h: 300 },
            { x: 50, y: 50, w: 300, h: 10 },
            { x: 900, y: 400, w: 200, h: 10 },
            { x: 400, y: 700, w: 10, h: 200 },
            { x: 1000, y: 100, w: 10, h: 200 },
            { x: 300, y: 400, w: 80, h: 20 },
            { x: 550, y: 500, w: 20, h: 80 }
        ];
        for (const w of wallPositions) {
            this.mapObjects.push(new MapObject(w.x, w.y, w.w, w.h, 'wall', {
                solid: true,
                color: '#555555'
            }));
            this.walls.push(w);
        }

        // 装饰物 - 树
        const treePositions = [
            { x: 150, y: 350 }, { x: 250, y: 450 }, { x: 450, y: 100 },
            { x: 850, y: 250 }, { x: 950, y: 550 }, { x: 1200, y: 400 },
            { x: 500, y: 800 }, { x: 300, y: 900 }, { x: 800, y: 850 }
        ];
        for (const t of treePositions) {
            this.mapObjects.push(new MapObject(t.x, t.y, 40, 50, 'tree', {
                solid: true,
                color: '#228B22',
                z: 1
            }));
        }

        // 石头
        const rockPositions = [
            { x: 400, y: 300 }, { x: 650, y: 450 }, { x: 1100, y: 200 },
            { x: 200, y: 700 }, { x: 900, y: 750 }
        ];
        for (const r of rockPositions) {
            this.mapObjects.push(new MapObject(r.x, r.y, 25, 20, 'rock', {
                solid: true,
                color: '#808080'
            }));
        }
    }

    bindInput() {
        const canvas = this.game.canvas;

        window.addEventListener('keydown', (e) => {
            this.player.keys[e.code] = true;

            // 换枪
            if (e.code === 'Digit1') this.player.switchGun(0);
            if (e.code === 'Digit2') this.player.switchGun(1);
            if (e.code === 'Digit3') this.player.switchGun(2);
            if (e.code === 'Digit4') this.player.switchGun(3);
            if (e.code === 'Digit5') this.player.switchGun(4);
            if (e.code === 'KeyQ') this.player.prevGun();
            if (e.code === 'KeyE') this.player.nextGun();

            // 装弹
            if (e.code === 'KeyR') this.player.reload();

            // 交互
            if (e.code === 'KeyF' || e.code === 'KeyE') {
                this.interaction.interact(
                    this.player,
                    (house) => this.enterHouse(house),
                    (table) => this.joinTable(table)
                );
            }
        });

        window.addEventListener('keyup', (e) => {
            this.player.keys[e.code] = false;
        });

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldPos = this.camera.screenToWorld(screenX, screenY);
            this.player.mouseX = worldPos.x;
            this.player.mouseY = worldPos.y;
        });

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.player.mouseDown = true;
                const bullets = this.player.fire();
                if (bullets) {
                    this.bullets.push(...bullets);
                    this.camera.shake(this.player.gunConfig.recoil);
                    this.particles.emitSmoke(this.player.x, this.player.y - 10, 3);
                }
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.player.mouseDown = false;
            }
        });

        // 防止右键菜单
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    enterHouse(house) {
        console.log(`进入房屋: ${house.label}`);
        // 触发进入房屋事件，可切换到室内场景
        // this.game.switchScene('indoor', { house: house.label });
    }

    joinTable(table) {
        console.log(`加入牌桌: ${table.label}`);
        // 触发加入牌桌事件
        // this.game.switchScene('cardgame', { table: table.label });
    }

    update(dt) {
        // 日夜循环
        this.dayNight.update(dt);

        // 玩家更新
        this.player.update(dt, this.walls);

        // 处理自动射击产生的子弹
        if (this.player.pendingBullets) {
            this.bullets.push(...this.player.pendingBullets);
            this.player.pendingBullets = null;
            this.camera.shake(this.player.gunConfig.recoil);
            this.particles.emitSmoke(this.player.x, this.player.y - 10, 2);
        }

        // 相机跟随
        this.camera.update(dt, this.player.x, this.player.y);

        // 其他玩家更新
        for (const op of this.otherPlayers.values()) {
            op.update(dt);
        }

        // 子弹更新
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update(dt);

            // 墙壁碰撞
            let hitWall = false;
            for (const wall of this.walls) {
                if (bullet.x > wall.x && bullet.x < wall.x + wall.w &&
                    bullet.y > wall.y && bullet.y < wall.y + wall.h) {
                    hitWall = true;
                    this.particles.emitSpark(bullet.x, bullet.y, 4);
                    break;
                }
            }

            // 其他玩家碰撞
            let hitPlayer = false;
            if (!hitWall && bullet.owner === this.player) {
                for (const op of this.otherPlayers.values()) {
                    if (op.state === 'dead') continue;
                    const dx = bullet.x - op.x;
                    const dy = bullet.y - (op.y - op.height / 2);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < op.width / 2 + bullet.radius) {
                        hitPlayer = true;
                        op.health -= bullet.damage;
                        this.particles.emitBlood(bullet.x, bullet.y, 8);
                        if (op.health <= 0) {
                            op.health = 0;
                            op.state = 'dead';
                            this.hud.addKillFeed(this.player.name, op.name);
                            this.player.kills++;
                        }
                        break;
                    }
                }
            }

            if (hitWall || hitPlayer || bullet.life <= 0) {
                this.bullets.splice(i, 1);
            }
        }

        // 粒子更新
        this.particles.update(dt);

        // 交互检测
        this.interaction.update(this.player, this.mapObjects);

        // HUD更新
        this.hud.update(dt);
    }

    draw(ctx) {
        const canvas = this.game.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 背景
        ctx.fillStyle = '#4a7c4e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        this.camera.apply(ctx);

        // 地面网格
        this.drawGround(ctx);

        // 按z排序绘制地图对象
        const sortedObjects = [...this.mapObjects].sort((a, b) => (a.z || 0) - (b.z || 0));
        for (const obj of sortedObjects) {
            obj.draw(ctx);
        }

        // 其他玩家
        for (const op of this.otherPlayers.values()) {
            op.draw(ctx);
        }

        // 本地玩家
        this.player.draw(ctx);
        this.player.drawHUD(ctx, this.camera.x, this.camera.y);

        // 子弹
        for (const bullet of this.bullets) {
            bullet.draw(ctx);
        }

        // 粒子
        this.particles.draw(ctx);

        // 交互提示
        this.interaction.draw(ctx, this.player);

        ctx.restore();

        // 日夜遮罩
        this.dayNight.drawOverlay(ctx, canvas.width, canvas.height);

        // 时间指示器
        this.dayNight.drawTimeIndicator(ctx, 20, 30);

        // HUD
        this.hud.draw(ctx, canvas.width, canvas.height);
    }

    drawGround(ctx) {
        // 绘制简单的草地纹理
        ctx.fillStyle = '#5a8c5e';
        ctx.fillRect(0, 0, 2000, 2000);

        // 网格线
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= 2000; x += 100) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 2000);
            ctx.stroke();
        }
        for (let y = 0; y <= 2000; y += 100) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(2000, y);
            ctx.stroke();
        }
    }

    // 网络同步：添加/更新其他玩家
    syncPlayer(id, data) {
        if (!this.otherPlayers.has(id)) {
            this.otherPlayers.set(id, new OtherPlayer(id, data.x, data.y, data.name || `Player${id}`));
        }
        this.otherPlayers.get(id).sync(data);
    }

    removePlayer(id) {
        this.otherPlayers.delete(id);
    }

    // 模拟其他玩家数据（用于测试）
    addMockPlayers(count = 3) {
        for (let i = 0; i < count; i++) {
            const id = `mock_${i}`;
            const x = 300 + Math.random() * 800;
            const y = 200 + Math.random() * 600;
            this.syncPlayer(id, {
                x, y,
                name: `玩家${i + 1}`,
                state: 'idle',
                health: 100,
                gunType: ['pistol', 'ak47', 'shotgun'][Math.floor(Math.random() * 3)]
            });
        }
    }

    handleInput(e) {
        // 输入已在 bindInput 中处理
    }

    enter() {
        console.log('进入大厅场景');
        // 可以在这里添加一些测试用的模拟玩家
        // this.addMockPlayers(3);
    }

    exit() {
        console.log('离开大厅场景');
    }
}

// ============================================================
// 导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LobbyScene, Scene, Player, OtherPlayer, Bullet, ParticleSystem };
}

// 浏览器环境直接暴露到 window
if (typeof window !== 'undefined') {
    window.LobbyScene = LobbyScene;
    window.Scene = Scene;
    window.Player = Player;
    window.OtherPlayer = OtherPlayer;
    window.Bullet = Bullet;
    window.ParticleSystem = ParticleSystem;
}
