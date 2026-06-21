import * as THREE from 'three';

// ==================== 全局状态 ====================
const G = {
  myId: localStorage.getItem('uid') || (localStorage.setItem('uid', Math.random().toString(36).substr(2, 10)), localStorage.getItem('uid')),
  user: localStorage.getItem('username') || '幸存者',
  hp: 100, maxHp: 100,
  dead: false, deadTimer: 0,
  mqtt: null, mqttConnected: false,
  time: 0,
  weather: { type: 'clear' },
};

// ==================== DOM 引用 ====================
const $ = id => document.getElementById(id);
const loadingBar = $('loading-bar');
const loadingText = $('loading-text');
const loadingEl = $('loading');
const hpBar = $('hp-bar');
const hpText = $('hp-text');
const ammoCount = $('ammo-count');
const gunName = $('gun-name');
const deadOverlay = $('dead-overlay');
const deadText = $('dead-text');
const respawnText = $('respawn-text');
const interactHint = $('interact-hint');
const joystickBase = $('joystick-base');
const joystickThumb = $('joystick-thumb');
const minimapCanvas = $('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');

// ==================== Three.js 基础 ====================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, 150);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// ==================== 光照 ====================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(20, 40, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 100;
sunLight.shadow.camera.left = -40;
sunLight.shadow.camera.right = 40;
sunLight.shadow.camera.top = 40;
sunLight.shadow.camera.bottom = -40;
sunLight.shadow.bias = -0.001;
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x555533, 0.4);
scene.add(hemiLight);

// ==================== 地图配置 ====================
const MAP_W = 80, MAP_H = 80;
const walls = []; // 碰撞体列表
const colliders = []; // {x,z,w,h} AABB碰撞盒

// ==================== 地板 ====================
function createGround() {
  // 主地面
  const groundGeo = new THREE.PlaneGeometry(MAP_W, MAP_H);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x556b2f,
    roughness: 0.9,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 道路
  const roadGeo = new THREE.PlaneGeometry(6, MAP_H);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.95 });
  const road1 = new THREE.Mesh(roadGeo, roadMat);
  road1.rotation.x = -Math.PI / 2;
  road1.position.set(0, 0.01, 0);
  road1.receiveShadow = true;
  scene.add(road1);

  const road2 = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, 6), roadMat);
  road2.rotation.x = -Math.PI / 2;
  road2.position.set(0, 0.01, 0);
  road2.receiveShadow = true;
  scene.add(road2);
}

// ==================== 墙壁/建筑 ====================
function createWall(x, z, w, h, d, color = 0x888888) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const wall = new THREE.Mesh(geo, mat);
  wall.position.set(x, h / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
  walls.push(wall);
  colliders.push({ x: x - w / 2, z: z - d / 2, w, h: d });
  return wall;
}

function createBuilding(x, z, w, d, wallColor, roofColor) {
  const h = 4;
  // 墙壁
  createWall(x, z, w, h, d, wallColor);
  // 屋顶
  const roofGeo = new THREE.BoxGeometry(w + 1, 0.3, d + 1);
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.6 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(x, h + 0.15, z);
  roof.castShadow = true;
  scene.add(roof);
  // 门（在前面中间挖一个洞 - 用一个深色方块表示）
  const doorGeo = new THREE.BoxGeometry(1.2, 2.5, 0.1);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(x, 1.25, z - d / 2 - 0.05);
  scene.add(door);
}

function createMap() {
  // 四面围墙
  createWall(0, -MAP_H / 2, MAP_W, 3, 0.5, 0x666666);
  createWall(0, MAP_H / 2, MAP_W, 3, 0.5, 0x666666);
  createWall(-MAP_W / 2, 0, 0.5, 3, MAP_H, 0x666666);
  createWall(MAP_W / 2, 0, 0.5, 3, MAP_H, 0x666666);

  // 建筑 - 住宅区
  createBuilding(-15, -15, 8, 8, 0xb8a080, 0x8b4513);
  createBuilding(-15, 15, 8, 8, 0xb8a080, 0x8b4513);
  createBuilding(15, -15, 8, 8, 0xa0b8a0, 0x2e8b57);
  createBuilding(15, 15, 8, 8, 0xa0b8a0, 0x2e8b57);

  // 商店
  createBuilding(-30, 0, 10, 8, 0xd4c4a8, 0xcd853f);

  // 酒吧
  createBuilding(30, 0, 12, 10, 0x8b668b, 0x4a2a4a);

  // 内部墙壁/障碍物
  createWall(8, -8, 6, 2, 0.5, 0xaa6633);
  createWall(-8, 8, 0.5, 2, 8, 0x6633aa);
  createWall(20, -25, 4, 1.5, 4, 0x888888);
  createWall(-20, 25, 4, 1.5, 4, 0x888888);

  // 树木
  for (let i = 0; i < 30; i++) {
    const tx = (Math.random() - 0.5) * (MAP_W - 10);
    const tz = (Math.random() - 0.5) * (MAP_H - 10);
    // 避开道路和建筑
    if (Math.abs(tx) < 5 || Math.abs(tz) < 5) continue;
    if (Math.abs(tx + 15) < 6 && Math.abs(tz + 15) < 6) continue;
    if (Math.abs(tx + 15) < 6 && Math.abs(tz - 15) < 6) continue;
    if (Math.abs(tx - 15) < 6 && Math.abs(tz + 15) < 6) continue;
    if (Math.abs(tx - 15) < 6 && Math.abs(tz - 15) < 6) continue;
    createTree(tx, tz);
  }

  // 牌桌
  createTable(0, 10);
  createTable(-10, -10);
  createTable(10, -10);
}

function createTree(x, z) {
  // 树干
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.set(x, 1.5, z);
  trunk.castShadow = true;
  scene.add(trunk);
  // 树冠
  const leafGeo = new THREE.SphereGeometry(2, 8, 8);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
  const leaf = new THREE.Mesh(leafGeo, leafMat);
  leaf.position.set(x, 4, z);
  leaf.castShadow = true;
  scene.add(leaf);
  // 碰撞体（树干）
  colliders.push({ x: x - 0.5, z: z - 0.5, w: 1, h: 1 });
}

function createTable(x, z) {
  // 桌面
  const topGeo = new THREE.CylinderGeometry(2, 2, 0.2, 16);
  const topMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.set(x, 1, z);
  top.castShadow = true;
  top.receiveShadow = true;
  scene.add(top);
  // 桌腿
  const legGeo = new THREE.CylinderGeometry(0.15, 0.15, 1, 8);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x654321 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x + Math.cos(angle) * 1.5, 0.5, z + Math.sin(angle) * 1.5);
    leg.castShadow = true;
    scene.add(leg);
  }
  // 椅子
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    createChair(x + Math.cos(angle) * 3, z + Math.sin(angle) * 3, angle + Math.PI);
  }
}

function createChair(x, z, rot) {
  const seatGeo = new THREE.BoxGeometry(0.8, 0.1, 0.8);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x654321 });
  const seat = new THREE.Mesh(seatGeo, seatMat);
  seat.position.set(x, 0.6, z);
  seat.rotation.y = rot;
  seat.castShadow = true;
  scene.add(seat);
  // 靠背
  const backGeo = new THREE.BoxGeometry(0.8, 0.8, 0.1);
  const back = new THREE.Mesh(backGeo, seatMat);
  back.position.set(x + Math.sin(rot) * 0.35, 1.0, z - Math.cos(rot) * 0.35);
  back.rotation.y = rot;
  back.castShadow = true;
  scene.add(back);
}

// ==================== 角色模型（程序化） ====================
function createCharacterModel(bodyColor = 0x3366cc, headColor = 0xffcc99) {
  const group = new THREE.Group();

  // 身体
  const bodyGeo = new THREE.BoxGeometry(0.8, 1.0, 0.5);
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.2;
  body.castShadow = true;
  group.add(body);

  // 头
  const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const headMat = new THREE.MeshStandardMaterial({ color: headColor });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 2.0;
  head.castShadow = true;
  group.add(head);

  // 眼睛
  const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.05);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.15, 2.05, 0.31);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.15, 2.05, 0.31);
  group.add(rightEye);

  // 左臂
  const armGeo = new THREE.BoxGeometry(0.25, 0.8, 0.25);
  const armMat = new THREE.MeshStandardMaterial({ color: bodyColor });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.55, 1.2, 0);
  leftArm.castShadow = true;
  group.add(leftArm);
  group.userData.leftArm = leftArm;

  // 右臂
  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.position.set(0.55, 1.2, 0);
  rightArm.castShadow = true;
  group.add(rightArm);
  group.userData.rightArm = rightArm;

  // 左腿
  const legGeo = new THREE.BoxGeometry(0.3, 0.7, 0.3);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x333366 });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.2, 0.35, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);
  group.userData.leftLeg = leftLeg;

  // 右腿
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.2, 0.35, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);
  group.userData.rightLeg = rightLeg;

  return group;
}

// ==================== 枪械模型（程序化） ====================
function createGunModel(type) {
  const group = new THREE.Group();
  let barrelLen, barrelW, barrelH, bodyLen, bodyH;

  switch (type) {
    case 'pistol':
      barrelLen = 0.4; barrelW = 0.06; barrelH = 0.06;
      bodyLen = 0.25; bodyH = 0.15;
      break;
    case 'ak47':
      barrelLen = 0.8; barrelW = 0.05; barrelH = 0.06;
      bodyLen = 0.5; bodyH = 0.12;
      break;
    case 'shotgun':
      barrelLen = 0.7; barrelW = 0.07; barrelH = 0.07;
      bodyLen = 0.35; bodyH = 0.14;
      break;
    case 'sniper':
      barrelLen = 1.0; barrelW = 0.04; barrelH = 0.05;
      bodyLen = 0.5; bodyH = 0.1;
      break;
    case 'minigun':
      barrelLen = 0.9; barrelW = 0.12; barrelH = 0.12;
      bodyLen = 0.4; bodyH = 0.18;
      break;
    default:
      barrelLen = 0.4; barrelW = 0.06; barrelH = 0.06;
      bodyLen = 0.25; bodyH = 0.15;
  }

  const gunMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.7 });
  const gunMat2 = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.5 });

  // 枪管
  const barrelGeo = new THREE.BoxGeometry(barrelLen, barrelH, barrelW);
  const barrel = new THREE.Mesh(barrelGeo, gunMat);
  barrel.position.x = barrelLen / 2;
  group.add(barrel);

  // 枪身
  const bodyGeo = new THREE.BoxGeometry(bodyLen, bodyH, barrelW + 0.02);
  const gunBody = new THREE.Mesh(bodyGeo, gunMat2);
  gunBody.position.set(-bodyLen / 2, -bodyH / 2 + 0.02, 0);
  group.add(gunBody);

  // 握把
  const gripGeo = new THREE.BoxGeometry(0.08, 0.2, 0.06);
  const grip = new THREE.Mesh(gripGeo, gunMat);
  grip.position.set(-bodyLen / 2, -bodyH - 0.08, 0);
  grip.rotation.x = 0.2;
  group.add(grip);

  return group;
}

// ==================== 玩家 ====================
const player = createCharacterModel(0x3366cc, 0xffcc99);
player.position.set(0, 0, 0);
scene.add(player);

// 枪械列表
const guns = [
  { id: 'pistol', name: '手枪', damage: 15, fireRate: 0.3, bulletSpeed: 50, spread: 0.05, bulletsPerShot: 1, ammo: Infinity, maxAmmo: Infinity },
  { id: 'ak47', name: 'AK47', damage: 20, fireRate: 0.1, bulletSpeed: 60, spread: 0.08, bulletsPerShot: 1, ammo: 120, maxAmmo: 120 },
  { id: 'shotgun', name: '霰弹枪', damage: 8, fireRate: 0.8, bulletSpeed: 40, spread: 0.2, bulletsPerShot: 6, ammo: 30, maxAmmo: 30 },
  { id: 'sniper', name: '狙击枪', damage: 80, fireRate: 1.5, bulletSpeed: 100, spread: 0.01, bulletsPerShot: 1, ammo: 15, maxAmmo: 15 },
  { id: 'minigun', name: '加特林', damage: 10, fireRate: 0.05, bulletSpeed: 55, spread: 0.15, bulletsPerShot: 1, ammo: 200, maxAmmo: 200 },
];
let currentGun = 0;

// 玩家枪械模型
const playerGun = createGunModel('pistol');
playerGun.position.set(0.5, 1.1, 0.3);
player.add(playerGun);

function swapGun() {
  currentGun = (currentGun + 1) % guns.length;
  player.remove(playerGun);
  playerGun = createGunModel(guns[currentGun].id);
  playerGun.position.set(0.5, 1.1, 0.3);
  player.add(playerGun);
  updateHUD();
}

// ==================== 子弹系统 ====================
const bullets = [];
const bulletGeo = new THREE.SphereGeometry(0.08, 6, 6);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });

function fireBullet() {
  if (G.dead) return;
  const gun = guns[currentGun];
  const now = performance.now() / 1000;
  if (now - lastFireTime < gun.fireRate) return;
  if (gun.ammo !== Infinity && gun.ammo <= 0) return;
  lastFireTime = now;
  if (gun.ammo !== Infinity) gun.ammo--;

  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(player.quaternion);

  for (let i = 0; i < gun.bulletsPerShot; i++) {
    const spreadDir = dir.clone();
    spreadDir.x += (Math.random() - 0.5) * gun.spread;
    spreadDir.y += (Math.random() - 0.5) * gun.spread * 0.5;
    spreadDir.z += (Math.random() - 0.5) * gun.spread;
    spreadDir.normalize();

    const bMesh = new THREE.Mesh(bulletGeo, bulletMat);
    bMesh.position.copy(player.position);
    bMesh.position.y += 1.2;
    bMesh.position.x += dir.x * 0.8;
    bMesh.position.z += dir.z * 0.8;
    scene.add(bMesh);

    bullets.push({
      mesh: bMesh,
      vx: spreadDir.x * gun.bulletSpeed,
      vy: spreadDir.y * gun.bulletSpeed,
      vz: spreadDir.z * gun.bulletSpeed,
      damage: gun.damage,
      life: 3,
      owner: 'me',
    });
  }

  // 枪口火焰
  createMuzzleFlash();

  // 广播子弹
  if (G.mqtt && G.mqttConnected) {
    const b = bullets[bullets.length - 1];
    G.mqtt.publish(`wl_pos_v6/${G.myId}/bullet`, JSON.stringify({
      type: 'bullet', x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z,
      vx: b.vx, vy: b.vy, vz: b.vz, damage: gun.damage, life: b.life
    }), { qos: 0 });
  }

  updateHUD();
}

let lastFireTime = 0;

// 枪口火焰
const muzzleFlashes = [];
function createMuzzleFlash() {
  const flashGeo = new THREE.SphereGeometry(0.15, 6, 6);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
  flash.position.copy(player.position);
  flash.position.y += 1.2;
  flash.position.x += dir.x * 1.2;
  flash.position.z += dir.z * 1.2;
  scene.add(flash);
  muzzleFlashes.push({ mesh: flash, life: 0.1 });
}

// ==================== 其他玩家 ====================
const others = new Map();

function createOtherPlayer(id, data) {
  const colors = [0xcc3333, 0x33cc33, 0xcc33cc, 0xcccc33, 0x33cccc, 0xff6600, 0x9933ff];
  const color = colors[id.charCodeAt(0) % colors.length];
  const model = createCharacterModel(color, 0xffcc99);
  model.position.set(data.x || 0, 0, data.z || 0);
  scene.add(model);

  // 枪
  const gun = createGunModel('pistol');
  gun.position.set(0.5, 1.1, 0.3);
  model.add(gun);

  // 名字标签（用Sprite）
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 20, 256, 30);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(data.name || '幸存者', 128, 42);
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.y = 2.8;
  sprite.scale.set(2, 0.5, 1);
  model.add(sprite);

  // 血条（用Sprite）
  const hpCanvas = document.createElement('canvas');
  hpCanvas.width = 128; hpCanvas.height = 16;
  updateHpSprite(hpCanvas, data.hp || 100, data.maxHp || 100);
  const hpTexture = new THREE.CanvasTexture(hpCanvas);
  const hpSpriteMat = new THREE.SpriteMaterial({ map: hpTexture, transparent: true });
  const hpSprite = new THREE.Sprite(hpSpriteMat);
  hpSprite.position.y = 2.5;
  hpSprite.scale.set(1.2, 0.15, 1);
  model.add(hpSprite);

  return {
    model, gun, sprite, hpSprite, hpCanvas,
    tx: data.x || 0, tz: data.z || 0,
    name: data.name || '幸存者',
    hp: data.hp || 100, maxHp: data.maxHp || 100,
    dead: false, deadTimer: 0,
    lastSeen: Date.now(),
    faceDir: 1,
  };
}

function updateHpSprite(canvas, hp, maxHp) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 128, 16);
  const ratio = Math.max(0, hp / maxHp);
  const color = ratio > 0.5 ? '#4a7a3a' : ratio > 0.25 ? '#b8960f' : '#c4463a';
  ctx.fillStyle = color;
  ctx.fillRect(2, 2, 124 * ratio, 12);
}

// ==================== 碰撞检测 ====================
function checkCollision(x, z, radius = 0.5) {
  for (const c of colliders) {
    if (x + radius > c.x && x - radius < c.x + c.w &&
        z + radius > c.z && z - radius < c.z + c.h) {
      return true;
    }
  }
  // 地图边界
  if (x < -MAP_W / 2 + 1 || x > MAP_W / 2 - 1 || z < -MAP_H / 2 + 1 || z > MAP_H / 2 - 1) {
    return true;
  }
  return false;
}

// ==================== 输入系统 ====================
const keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// 虚拟摇杆
const joystick = { active: false, dx: 0, dy: 0, touchId: null };
const joystickZone = $('joystick-zone');

joystickZone.addEventListener('touchstart', e => {
  for (const t of e.changedTouches) {
    if (joystick.active) continue;
    e.preventDefault();
    joystick.active = true;
    joystick.touchId = t.identifier;
    const rect = joystickZone.getBoundingClientRect();
    const cx = t.clientX - rect.left;
    const cy = t.clientY - rect.top;
    joystickBase.style.display = 'block';
    joystickBase.style.left = (cx - 60) + 'px';
    joystickBase.style.top = (cy - 60) + 'px';
    joystickThumb.style.transform = 'translate(-50%,-50%)';
  }
}, { passive: false });

joystickZone.addEventListener('touchmove', e => {
  if (!joystick.active) return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier !== joystick.touchId) continue;
    const rect = joystickBase.getBoundingClientRect();
    const cx = t.clientX - rect.left - 60;
    const cy = t.clientY - rect.top - 60;
    const dist = Math.sqrt(cx * cx + cy * cy);
    const maxDist = 40;
    const clampedDist = Math.min(dist, maxDist);
    const angle = Math.atan2(cy, cx);
    joystick.dx = (Math.cos(angle) * clampedDist) / maxDist;
    joystick.dy = (Math.sin(angle) * clampedDist) / maxDist;
    joystickThumb.style.transform = `translate(calc(-50% + ${Math.cos(angle) * clampedDist}px), calc(-50% + ${Math.sin(angle) * clampedDist}px))`;
  }
}, { passive: false });

const endJoystick = e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joystick.touchId) {
      joystick.active = false;
      joystick.dx = 0;
      joystick.dy = 0;
      joystick.touchId = null;
      joystickBase.style.display = 'none';
    }
  }
};
joystickZone.addEventListener('touchend', endJoystick);
joystickZone.addEventListener('touchcancel', endJoystick);

// 鼠标射击
let mouseDown = false;
renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
renderer.domElement.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });

// 鼠标朝向
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

renderer.domElement.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(groundPlane, target);
  if (target) {
    const dir = target.clone().sub(player.position);
    dir.y = 0;
    const angle = Math.atan2(dir.x, dir.z);
    player.rotation.y = angle;
  }
});

// 按钮事件
$('btn-fire').addEventListener('touchstart', e => { e.preventDefault(); mouseDown = true; });
$('btn-fire').addEventListener('touchend', e => { mouseDown = false; });
$('btn-fire').addEventListener('mousedown', e => { mouseDown = true; });
$('btn-fire').addEventListener('mouseup', e => { mouseDown = false; });
$('btn-swap').addEventListener('click', swapGun);
$('btn-action').addEventListener('click', () => {
  // 检查附近的牌桌
  toast('互动功能开发中...');
});

// ==================== 移动 ====================
const moveSpeed = 8;
const sprintSpeed = 14;
let isMoving = false;
let walkAnimTime = 0;

function handleMovement(dt) {
  if (G.dead) return;

  let dx = 0, dz = 0;
  if (keys['w'] || keys['arrowup']) dz -= 1;
  if (keys['s'] || keys['arrowdown']) dz += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  // 摇杆输入
  if (joystick.active) {
    dx += joystick.dx;
    dz += joystick.dy;
  }

  const len = Math.sqrt(dx * dx + dz * dz);
  isMoving = len > 0.1;

  if (isMoving) {
    dx /= len; dz /= len;
    const speed = (keys['shift'] || len > 1.5) ? sprintSpeed : moveSpeed;
    const newX = player.position.x + dx * speed * dt;
    const newZ = player.position.z + dz * speed * dt;

    // 分轴碰撞检测
    if (!checkCollision(newX, player.position.z)) player.position.x = newX;
    if (!checkCollision(player.position.x, newZ)) player.position.z = newZ;

    // 朝向（仅键盘/摇杆控制时）
    if (!mouse.x && !mouse.y) {
      const angle = Math.atan2(dx, dz);
      player.rotation.y = angle;
    }

    // 走路动画
    walkAnimTime += dt * speed * 0.5;
    const swing = Math.sin(walkAnimTime) * 0.4;
    if (player.userData.leftArm) player.userData.leftArm.rotation.x = swing;
    if (player.userData.rightArm) player.userData.rightArm.rotation.x = -swing;
    if (player.userData.leftLeg) player.userData.leftLeg.rotation.x = -swing;
    if (player.userData.rightLeg) player.userData.rightLeg.rotation.x = swing;
  } else {
    // 待机动画 - 轻微呼吸
    const breathe = Math.sin(G.time * 2) * 0.02;
    if (player.userData.leftArm) player.userData.leftArm.rotation.x = breathe;
    if (player.userData.rightArm) player.userData.rightArm.rotation.x = breathe;
    if (player.userData.leftLeg) player.userData.leftLeg.rotation.x = 0;
    if (player.userData.rightLeg) player.userData.rightLeg.rotation.x = 0;
  }
}

// ==================== 相机 ====================
const cameraOffset = new THREE.Vector3(0, 8, 12);
const cameraLookOffset = new THREE.Vector3(0, 1.5, 0);

function updateCamera() {
  const targetPos = player.position.clone().add(cameraOffset);
  camera.position.lerp(targetPos, 0.08);
  const lookAt = player.position.clone().add(cameraLookOffset);
  camera.lookAt(lookAt);
}

// ==================== HUD ====================
function updateHUD() {
  const gun = guns[currentGun];
  hpBar.style.width = Math.max(0, G.hp / G.maxHp * 100) + '%';
  const hpRatio = G.hp / G.maxHp;
  hpBar.style.background = hpRatio > 0.5 ? 'linear-gradient(to bottom,#5a5,#484)' :
    hpRatio > 0.25 ? 'linear-gradient(to bottom,#bb8,#996)' : 'linear-gradient(to bottom,#a44,#822)';
  hpText.textContent = `${Math.max(0, Math.ceil(G.hp))}/${G.maxHp}`;
  gunName.textContent = gun.name;
  ammoCount.textContent = gun.ammo === Infinity ? '∞' : gun.ammo;
}

// ==================== 阵亡/复活 ====================
function updateDeathSystem(dt) {
  if (G.dead) {
    G.deadTimer -= dt;
    respawnText.textContent = `复活倒计时: ${Math.ceil(G.deadTimer)}s`;
    // 阵亡动画 - 角色倒下
    player.rotation.x = Math.min(Math.PI / 2, player.rotation.x + dt * 3);
    if (G.deadTimer <= 0) {
      G.dead = false;
      G.deadTimer = 0;
      G.hp = G.maxHp;
      player.rotation.x = 0;
      deadOverlay.classList.remove('active');
      updateHUD();
    }
  } else if (G.hp <= 0) {
    G.dead = true;
    G.deadTimer = 5;
    G.hp = 0;
    deadOverlay.classList.add('active');
    deadText.textContent = '你阵亡了';
  }
}

// ==================== 子弹更新 ====================
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.y += b.vy * dt;
    b.mesh.position.z += b.vz * dt;
    b.life -= dt;

    // 地面碰撞
    if (b.mesh.position.y < 0.1) b.life = 0;

    // 墙壁碰撞
    if (checkCollision(b.mesh.position.x, b.mesh.position.z, 0.1)) {
      b.life = 0;
      createImpactEffect(b.mesh.position.clone());
    }

    // 击中其他玩家
    if (b.owner === 'me') {
      for (const [id, p] of others) {
        if (p.dead) continue;
        const dx = b.mesh.position.x - p.model.position.x;
        const dz = b.mesh.position.z - p.model.position.z;
        const dy = b.mesh.position.y - 1.2;
        if (Math.sqrt(dx * dx + dz * dz + dy * dy) < 1.0) {
          p.hp -= b.damage;
          b.life = 0;
          createImpactEffect(b.mesh.position.clone());
          if (p.hp <= 0) {
            p.dead = true;
            p.deadTimer = 5;
            p.model.rotation.x = Math.PI / 2;
            toast(`击杀了 ${p.name}!`);
          } else {
            toast(`命中! HP: ${Math.ceil(p.hp)}`);
          }
          updateHpSprite(p.hpCanvas, p.hp, p.maxHp);
          p.hpSprite.material.map.needsUpdate = true;
          break;
        }
      }
    }

    // 击中自己（别人射的）
    if (b.owner !== 'me' && !G.dead) {
      const dx = b.mesh.position.x - player.position.x;
      const dz = b.mesh.position.z - player.position.z;
      const dy = b.mesh.position.y - 1.2;
      if (Math.sqrt(dx * dx + dz * dz + dy * dy) < 1.0) {
        G.hp -= b.damage;
        b.life = 0;
        createImpactEffect(b.mesh.position.clone());
        toast(`被击中! HP: ${Math.ceil(G.hp)}`);
        updateHUD();
      }
    }

    if (b.life <= 0) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

// 击中特效
const impactEffects = [];
function createImpactEffect(pos) {
  const geo = new THREE.SphereGeometry(0.1, 4, 4);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  impactEffects.push({ mesh, life: 0.3 });
}

function updateEffects(dt) {
  // 枪口火焰
  for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
    muzzleFlashes[i].life -= dt;
    if (muzzleFlashes[i].life <= 0) {
      scene.remove(muzzleFlashes[i].mesh);
      muzzleFlashes.splice(i, 1);
    }
  }
  // 击中特效
  for (let i = impactEffects.length - 1; i >= 0; i--) {
    impactEffects[i].life -= dt;
    const scale = impactEffects[i].life * 5;
    impactEffects[i].mesh.scale.set(scale, scale, scale);
    if (impactEffects[i].life <= 0) {
      scene.remove(impactEffects[i].mesh);
      impactEffects.splice(i, 1);
    }
  }
}

// ==================== 其他玩家更新 ====================
function updateOthers(dt) {
  for (const [id, p] of others) {
    // 平滑移动
    p.model.position.x += (p.tx - p.model.position.x) * 0.1;
    p.model.position.z += (p.tz - p.model.position.z) * 0.1;

    // 走路动画
    const dx = p.tx - p.model.position.x;
    const dz = p.tz - p.model.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.5) {
      const angle = Math.atan2(dx, dz);
      p.model.rotation.y = angle;
      const swing = Math.sin(G.time * 8) * 0.4;
      if (p.model.userData.leftArm) p.model.userData.leftArm.rotation.x = swing;
      if (p.model.userData.rightArm) p.model.userData.rightArm.rotation.x = -swing;
      if (p.model.userData.leftLeg) p.model.userData.leftLeg.rotation.x = -swing;
      if (p.model.userData.rightLeg) p.model.userData.rightLeg.rotation.x = swing;
    }

    // 阵亡/复活
    if (p.dead) {
      p.deadTimer -= dt;
      if (p.deadTimer <= 0) {
        p.dead = false;
        p.hp = p.maxHp;
        p.model.rotation.x = 0;
        updateHpSprite(p.hpCanvas, p.hp, p.maxHp);
        p.hpSprite.material.map.needsUpdate = true;
      }
    }

    // 超时清理
    if (Date.now() - p.lastSeen > 15000) {
      scene.remove(p.model);
      others.delete(id);
    }
  }
}

// ==================== MQTT 联网 ====================
function initMQTT() {
  try {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/mqtt/dist/mqtt.min.js';
    script.onload = () => {
      const clientId = '3d_' + G.myId + '_' + Math.random().toString(36).substr(2, 4);
      G.mqtt = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
        clientId,
        clean: true,
        connectTimeout: 5000,
      });
      G.mqtt.on('connect', () => {
        G.mqttConnected = true;
        console.log('[3D] MQTT connected');
        // 订阅位置
        G.mqtt.subscribe('wl_pos_v6/#', { qos: 0 });
        // 订阅私聊
        G.mqtt.subscribe(`wl_whisper_v6/${G.myId}`, { qos: 0 });
      });
      G.mqtt.on('message', (topic, msg) => {
        try {
          const data = JSON.parse(msg.toString());
          if (topic.startsWith('wl_pos_v6/')) {
            const parts = topic.split('/');
            const fromId = parts[1];
            if (fromId === G.myId) return;
            // 子弹消息
            if (data.type === 'bullet') {
              const bMesh = new THREE.Mesh(bulletGeo, bulletMat);
              bMesh.position.set(data.x, data.y, data.z);
              scene.add(bMesh);
              bullets.push({
                mesh: bMesh,
                vx: data.vx, vy: data.vy, vz: data.vz,
                damage: data.damage || 10,
                life: data.life || 2,
                owner: fromId,
              });
              return;
            }
            // 位置消息
            let existing = others.get(fromId);
            if (existing) {
              existing.tx = data.x || existing.tx;
              existing.tz = data.z || existing.tz;
              existing.name = data.name || existing.name;
              existing.lastSeen = Date.now();
              if (data.hp !== undefined && data.hp > existing.hp) existing.hp = data.hp;
              if (data.dead !== undefined) existing.dead = data.dead;
              if (data.deadTimer !== undefined) existing.deadTimer = data.deadTimer;
            } else {
              const p = createOtherPlayer(fromId, data);
              p.tx = data.x || 0;
              p.tz = data.z || 0;
              others.set(fromId, p);
            }
          }
        } catch (e) {}
      });
      G.mqtt.on('error', () => {});
      G.mqtt.on('close', () => { G.mqttConnected = false; });
    };
    document.head.appendChild(script);
  } catch (e) {}
}

let lastBroadcast = 0;
function broadcastPosition() {
  if (!G.mqtt || !G.mqttConnected) return;
  const now = performance.now();
  if (now - lastBroadcast < 100) return;
  lastBroadcast = now;
  G.mqtt.publish(`wl_pos_v6/${G.myId}`, JSON.stringify({
    type: 'pos',
    x: Math.round(player.position.x * 10) / 10,
    z: Math.round(player.position.z * 10) / 10,
    name: G.user,
    hp: G.hp,
    maxHp: G.maxHp,
    dead: G.dead,
    deadTimer: G.deadTimer,
  }), { qos: 0 });
}

// ==================== 小地图 ====================
function drawMinimap() {
  const ctx = minimapCtx;
  const w = 150, h = 150;
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, w, h);

  const scale = w / MAP_W;
  const offsetX = w / 2;
  const offsetZ = h / 2;

  // 建筑
  ctx.fillStyle = '#666';
  for (const c of colliders) {
    ctx.fillRect(
      offsetX + c.x * scale,
      offsetZ + c.z * scale,
      c.w * scale,
      c.h * scale
    );
  }

  // 其他玩家
  for (const [id, p] of others) {
    ctx.fillStyle = '#f44';
    ctx.beginPath();
    ctx.arc(offsetX + p.model.position.x * scale, offsetZ + p.model.position.z * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 自己
  ctx.fillStyle = '#4f4';
  ctx.beginPath();
  ctx.arc(offsetX + player.position.x * scale, offsetZ + player.position.z * scale, 4, 0, Math.PI * 2);
  ctx.fill();
}

// ==================== Toast ====================
function toast(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:200px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:5px;font-size:13px;z-index:30;pointer-events:none;transition:opacity 0.5s';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 1500);
  setTimeout(() => { el.remove(); }, 2000);
}

// ==================== 窗口自适应 ====================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ==================== 主循环 ====================
const clock = new THREE.Clock();
let minimapTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  G.time += dt;

  handleMovement(dt);
  updateCamera();
  updateDeathSystem(dt);
  updateBullets(dt);
  updateEffects(dt);
  updateOthers(dt);
  broadcastPosition();

  // 射击
  if (mouseDown) fireBullet();

  // 小地图（每0.5秒更新一次）
  minimapTimer += dt;
  if (minimapTimer > 0.5) {
    minimapTimer = 0;
    drawMinimap();
  }

  renderer.render(scene, camera);
}

// ==================== 初始化 ====================
function init() {
  let progress = 0;
  const loadStep = (pct, text) => {
    progress = pct;
    loadingBar.style.width = pct + '%';
    loadingText.textContent = text;
  };

  loadStep(10, '创建地面...');
  createGround();

  loadStep(30, '建造地图...');
  createMap();

  loadStep(60, '初始化角色...');
  updateHUD();

  loadStep(80, '连接服务器...');
  initMQTT();

  loadStep(100, '完成！');
  setTimeout(() => {
    loadingEl.style.opacity = '0';
    setTimeout(() => { loadingEl.style.display = 'none'; }, 500);
    animate();
  }, 500);
}

init();
