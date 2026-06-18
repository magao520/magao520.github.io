/**
 * Canvas 渲染器 - 星露谷(Stardew Valley) 像素美术风格
 *
 * 美术规范:
 * 1. TILE = 48 (逻辑16x16像素格放大3倍绘制)
 * 2. 无渐变、无dithering、纯 flat color
 * 3. 温暖色调，深棕色(#3d2817) 1px描边
 * 4. 每个表面2-4色变化
 * 5. 季节配色严格遵循规范
 */
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // 固定星星位置
        this.stars = [];
        for (let i = 0; i < 50; i++) {
            this.stars.push({
                nx: ((i * 137 + 50) % 1000) / 1000,
                ny: ((i * 97 + 30) % 600) / 1000,
                size: 1 + (i % 3),
                twinkle: Math.random() * Math.PI * 2
            });
        }

        // 伪随机种子缓存
        this._seedCache = new Map();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.screenW = this.canvas.width;
        this.screenH = this.canvas.height;
    }

    getSeasonColors(season) {
        return SEASON_COLORS[season] || SEASON_COLORS.spring;
    }

    // ===== 伪随机数（基于坐标种子，纯确定性） =====
    seededRandom(x, y, seed = 0) {
        const key = `${x},${y},${seed}`;
        if (this._seedCache.has(key)) return this._seedCache.get(key);
        const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
        const v = n - Math.floor(n);
        this._seedCache.set(key, v);
        return v;
    }

    // ===== 颜色辅助（纯hex，无HSL渐变） =====
    seasonPalette(season) {
        switch (season) {
            case 'spring': return {
                grass: ['#7cb342', '#558b2f', '#aed581'],
                tree: ['#2e7d32', '#4caf50', '#81c784'],
                flower: ['#f8bbd0', '#f48fb1', '#ec407a', '#ffd54f'],
                dirt: '#8d6e63', water: '#4fc3f7', sky: '#e3f2fd'
            };
            case 'summer': return {
                grass: ['#4caf50', '#388e3c', '#66bb6a'],
                tree: ['#1b5e20', '#2e7d32', '#4caf50'],
                flower: ['#ffd54f', '#ffca28', '#ffb300', '#fff176'],
                dirt: '#795548', water: '#29b6f6', sky: '#fff3e0'
            };
            case 'autumn': return {
                grass: ['#d84315', '#bf360c', '#ff7043'],
                tree: ['#bf360c', '#e65100', '#ff9800'],
                flower: ['#ff8f00', '#ff6f00', '#8e24aa', '#ffcc80'],
                dirt: '#5d4037', water: '#81d4fa', sky: '#fce4ec'
            };
            case 'winter': return {
                grass: ['#b0bec5', '#90a4ae', '#cfd8dc'],
                tree: ['#546e7a', '#78909c', '#b0bec5'],
                flower: ['#eceff1', '#b0bec5', '#ffcc80', '#e1f5fe'],
                dirt: '#546e7a', water: '#b3e5fc', sky: '#eceff1'
            };
            default: return this.seasonPalette('spring');
        }
    }

    // ===== 描边辅助 =====
    strokeRect(ctx, x, y, w, h, color = '#3d2817') {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
    }

    // ===== 主渲染循环 =====
    render(state) {
        const ctx = this.ctx;
        const sc = this.getSeasonColors(state.season);
        const palette = this.seasonPalette(state.season);

        const hour = state.timeOfDay || (state.time / 60);

        // 清屏
        ctx.fillStyle = '#1a2615';
        ctx.fillRect(0, 0, this.screenW, this.screenH);

        // 相机计算
        state.cameraX = state.playerX - this.screenW / 2 + TILE / 2;
        state.cameraY = state.playerY - this.screenH / 2 + TILE / 2;
        state.cameraX = Math.max(0, Math.min(state.cameraX, MAP_W * TILE - this.screenW));
        state.cameraY = Math.max(0, Math.min(state.cameraY, MAP_H * TILE - this.screenH));

        ctx.save();
        ctx.translate(-Math.round(state.cameraX), -Math.round(state.cameraY));

        // 1. 地形底层
        this.renderTerrainBase(ctx, state, sc, palette);

        // 2. 地形细节（树木、石头、房屋等）
        this.renderTerrainDetails(ctx, state, sc, palette);

        // 3. 作物
        this.renderCrops(ctx, state, palette);

        // 4. NPC
        this.renderNPCs(ctx, state);

        // 5. 玩家
        this.renderPlayer(ctx, state);

        // 6. 其他玩家
        this.renderOtherPlayers(ctx, state);

        // 7. 粒子和浮动文字
        this.renderParticles(ctx, state);
        this.renderFloatingTexts(ctx, state);

        ctx.restore();

        // 8. 全局光影
        this.renderGlobalLighting(ctx, state, sc);

        // 9. 钓鱼进度条
        this.renderFishingBar(ctx, state);

        // 10. 小地图
        this.renderMinimap(state, sc);
    }

    // ===== 地形底层绘制 =====
    renderTerrainBase(ctx, state, sc, palette) {
        const startX = Math.max(0, Math.floor(state.cameraX / TILE));
        const startY = Math.max(0, Math.floor(state.cameraY / TILE));
        const endX = Math.min(MAP_W, Math.ceil((state.cameraX + this.screenW) / TILE) + 1);
        const endY = Math.min(MAP_H, Math.ceil((state.cameraY + this.screenH) / TILE) + 1);

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const tile = state.map[y][x];
                const px = x * TILE;
                const py = y * TILE;
                this.drawTerrainTile(ctx, tile, px, py, x, y, sc, palette);
            }
        }
    }

    drawTerrainTile(ctx, tile, px, py, tx, ty, sc, palette) {
        switch (tile) {
            case T.GRASS:
                this.drawGrass(ctx, px, py, tx, ty, palette);
                break;
            case T.DIRT:
                this.drawDirt(ctx, px, py, tx, ty);
                break;
            case T.TILLED:
                this.drawTilled(ctx, px, py, tx, ty);
                break;
            case T.WATERED:
                this.drawWatered(ctx, px, py, tx, ty);
                break;
            case T.PATH:
                this.drawPath(ctx, px, py, tx, ty);
                break;
            case T.WATER:
                this.drawWater(ctx, px, py, tx, ty);
                break;
            case T.FENCE:
                this.drawFence(ctx, px, py, tx, ty);
                break;
            case T.BRIDGE:
                this.drawBridge(ctx, px, py, tx, ty);
                break;
            case T.HOUSE:
            case T.NPC_HOUSE:
                this.drawHouseBase(ctx, px, py, tx, ty, tile === T.NPC_HOUSE);
                break;
            case T.DOOR:
                this.drawDoor(ctx, px, py, tx, ty);
                break;
            case T.STONE:
                this.drawStoneBase(ctx, px, py, tx, ty);
                break;
            case T.TREE:
                this.drawTreeBase(ctx, px, py, tx, ty, palette);
                break;
            case T.ROCK_MINE:
                this.drawRockMineBase(ctx, px, py, tx, ty);
                break;
            case T.FISH_SPOT:
                this.drawFishSpot(ctx, px, py, tx, ty);
                break;
            case T.WILD_CROP:
                this.drawWildCrop(ctx, px, py, tx, ty, palette);
                break;
            case T.FLOWER:
                this.drawFlower(ctx, px, py, tx, ty, palette);
                break;
            default:
                ctx.fillStyle = sc.grass;
                ctx.fillRect(px, py, TILE, TILE);
        }
    }

    // ===== 草地：基础绿 + 2-3个随机亮色小点模拟草叶 =====
    drawGrass(ctx, px, py, tx, ty, palette) {
        const colors = palette.grass;
        ctx.fillStyle = colors[0];
        ctx.fillRect(px, py, TILE, TILE);
        // 深色纹理
        ctx.fillStyle = colors[1];
        const r1 = this.seededRandom(tx, ty, 1);
        const r2 = this.seededRandom(tx, ty, 2);
        ctx.fillRect(px + 4 + Math.floor(r1 * 24), py + 4 + Math.floor(r2 * 24), 4, 4);
        // 亮色草叶小点
        ctx.fillStyle = colors[2];
        for (let i = 0; i < 3; i++) {
            const rx = this.seededRandom(tx, ty, i + 10);
            const ry = this.seededRandom(tx, ty, i + 20);
            ctx.fillRect(px + 2 + Math.floor(rx * 40), py + 2 + Math.floor(ry * 40), 2, 2);
        }
    }

    // ===== 泥土 =====
    drawDirt(ctx, px, py, tx, ty) {
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#795548';
        const r1 = this.seededRandom(tx, ty, 1);
        const r2 = this.seededRandom(tx, ty, 2);
        ctx.fillRect(px + 8 + Math.floor(r1 * 20), py + 8 + Math.floor(r2 * 20), 6, 6);
        ctx.fillStyle = '#a1887f';
        const r3 = this.seededRandom(tx, ty, 3);
        const r4 = this.seededRandom(tx, ty, 4);
        ctx.fillRect(px + 4 + Math.floor(r3 * 30), py + 4 + Math.floor(r4 * 30), 3, 3);
    }

    // ===== 耕地：深棕色底 + 浅棕色犁沟线 =====
    drawTilled(ctx, px, py, tx, ty) {
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(px, py, TILE, TILE);
        // 犁沟线
        ctx.fillStyle = '#5a3a1a';
        for (let i = 0; i < 3; i++) {
            const yOff = 6 + i * 14;
            ctx.fillRect(px + 2, py + yOff, TILE - 4, 3);
        }
        // 浅色斑点
        ctx.fillStyle = '#8b6d4a';
        const r1 = this.seededRandom(tx, ty, 1);
        const r2 = this.seededRandom(tx, ty, 2);
        ctx.fillRect(px + 10 + Math.floor(r1 * 20), py + 10 + Math.floor(r2 * 20), 4, 4);
    }

    // ===== 浇水耕地：耕地基础上加蓝色反光点 =====
    drawWatered(ctx, px, py, tx, ty) {
        this.drawTilled(ctx, px, py, tx, ty);
        // 蓝色反光点
        ctx.fillStyle = '#4fc3f7';
        const r1 = this.seededRandom(tx, ty, 5);
        const r2 = this.seededRandom(tx, ty, 6);
        ctx.fillRect(px + 6 + Math.floor(r1 * 30), py + 6 + Math.floor(r2 * 30), 3, 3);
        ctx.fillStyle = '#81d4fa';
        const r3 = this.seededRandom(tx, ty, 7);
        const r4 = this.seededRandom(tx, ty, 8);
        ctx.fillRect(px + 4 + Math.floor(r3 * 36), py + 4 + Math.floor(r4 * 36), 2, 2);
    }

    // ===== 路径：沙色底 + 深色斑点 =====
    drawPath(ctx, px, py, tx, ty) {
        ctx.fillStyle = '#c4a96a';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#a18850';
        const r1 = this.seededRandom(tx, ty, 1);
        const r2 = this.seededRandom(tx, ty, 2);
        ctx.fillRect(px + 6 + Math.floor(r1 * 28), py + 6 + Math.floor(r2 * 28), 8, 8);
        ctx.fillStyle = '#8d6e40';
        for (let i = 0; i < 3; i++) {
            const rx = this.seededRandom(tx, ty, i + 10);
            const ry = this.seededRandom(tx, ty, i + 20);
            ctx.fillRect(px + 2 + Math.floor(rx * 40), py + 2 + Math.floor(ry * 40), 3, 3);
        }
    }

    // ===== 水面：蓝色底 + 白色小横线模拟波纹 =====
    drawWater(ctx, px, py, tx, ty) {
        const t = Date.now() / 1000;
        ctx.fillStyle = '#4fc3f7';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#29b6f6';
        const r1 = this.seededRandom(tx, ty, 1);
        const r2 = this.seededRandom(tx, ty, 2);
        ctx.fillRect(px + 4 + Math.floor(r1 * 30), py + 4 + Math.floor(r2 * 30), 8, 8);
        // 白色波纹小横线
        ctx.fillStyle = '#e1f5fe';
        const waveOffset = Math.sin(t * 2 + tx * 0.5 + ty * 0.3) * 4;
        ctx.fillRect(px + 6 + waveOffset, py + 14, 12, 2);
        ctx.fillRect(px + 10 - waveOffset, py + 28, 10, 2);
        ctx.fillRect(px + 8 + waveOffset * 0.5, py + 38, 8, 2);
    }

    // ===== 栅栏 =====
    drawFence(ctx, px, py, tx, ty) {
        // 先画草地底
        ctx.fillStyle = '#7cb342';
        ctx.fillRect(px, py, TILE, TILE);
        // 栅栏柱
        ctx.fillStyle = '#6b4223';
        ctx.fillRect(px + 4, py + 8, 4, TILE - 14);
        ctx.fillRect(px + TILE - 8, py + 8, 4, TILE - 14);
        // 横条
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(px + 4, py + 12, TILE - 8, 3);
        ctx.fillRect(px + 4, py + 28, TILE - 8, 3);
        // 描边
        this.strokeRect(ctx, px + 4, py + 8, 4, TILE - 14);
        this.strokeRect(ctx, px + TILE - 8, py + 8, 4, TILE - 14);
    }

    // ===== 桥梁 =====
    drawBridge(ctx, px, py, tx, ty) {
        ctx.fillStyle = '#a08060';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#8b6d4a';
        // 木板线
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(px + 2, py + 4 + i * 11, TILE - 4, 2);
        }
        // 钉子
        ctx.fillStyle = '#5d4037';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(px + 6, py + 6 + i * 11, 2, 2);
            ctx.fillRect(px + TILE - 8, py + 6 + i * 11, 2, 2);
        }
    }

    // ===== 房屋底 =====
    drawHouseBase(ctx, px, py, tx, ty, isNpc) {
        const wallColor = isNpc ? '#b08050' : '#c49558';
        const roofColor = isNpc ? '#8b4513' : '#a0522d';

        // 墙
        ctx.fillStyle = wallColor;
        ctx.fillRect(px + 4, py + 14, TILE - 8, TILE - 16);
        this.strokeRect(ctx, px + 4, py + 14, TILE - 8, TILE - 16);

        // 屋顶
        ctx.fillStyle = roofColor;
        ctx.beginPath();
        ctx.moveTo(px + 1, py + 16);
        ctx.lineTo(px + TILE / 2, py + 2);
        ctx.lineTo(px + TILE - 1, py + 16);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#3d2817';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 屋顶瓦片线条
        ctx.strokeStyle = 'rgba(60,30,10,0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const ry = py + 6 + i * 4;
            const rw = (ry - (py + 2)) / 14 * (TILE - 2);
            ctx.beginPath();
            ctx.moveTo(px + TILE / 2 - rw / 2, ry);
            ctx.lineTo(px + TILE / 2 + rw / 2, ry);
            ctx.stroke();
        }

        // 烟囱
        const chimneyX = px + TILE * 0.7;
        const chimneyY = py + 8;
        ctx.fillStyle = '#6a6a6a';
        ctx.fillRect(chimneyX, chimneyY, 6, 10);
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(chimneyX - 1, chimneyY - 2, 8, 3);
        this.strokeRect(ctx, chimneyX, chimneyY, 6, 10);
    }

    // ===== 门 =====
    drawDoor(ctx, px, py, tx, ty) {
        ctx.fillStyle = '#5c3d1e';
        ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
        this.strokeRect(ctx, px + 4, py + 4, TILE - 8, TILE - 8);
        // 门把手
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px + TILE - 12, py + TILE / 2, 3, 3);
    }

    // ===== 石头底 =====
    drawStoneBase(ctx, px, py, tx, ty) {
        const seed = (tx * 53 + ty * 29) % 1000;
        const cx = px + TILE / 2;
        const cy = py + TILE / 2 + 2;
        const radius = 14 + this.seededRandom(seed, 2, 5) * 4;
        const sides = 6 + Math.floor(this.seededRandom(seed, 1, 4) * 4);

        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(cx, py + TILE - 4, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 石头主体 - 3色灰
        ctx.fillStyle = '#7a7a7a';
        this.drawIrregularPolygon(ctx, cx, cy, radius, sides, 0.5, seed);
        ctx.fill();
        ctx.strokeStyle = '#3d2817';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 高光面
        ctx.fillStyle = '#9e9e9e';
        this.drawIrregularPolygon(ctx, cx - 2, cy - 3, radius * 0.55, Math.max(4, sides - 2), 0.4, seed + 100);
        ctx.fill();

        // 暗面
        ctx.fillStyle = '#616161';
        this.drawIrregularPolygon(ctx, cx + 2, cy + 2, radius * 0.4, Math.max(4, sides - 2), 0.3, seed + 200);
        ctx.fill();
    }

    // ===== 树木底 =====
    drawTreeBase(ctx, px, py, tx, ty, palette) {
        const seed = (tx * 73 + ty * 37) % 1000;
        const t = Date.now() / 1000;
        const sway = Math.sin(t * 1.2 + tx * 0.8 + ty * 0.3) * 1;

        // 树影
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(px + TILE / 2 + sway * 0.3, py + TILE - 4, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 树干 - 棕3色
        const trunkW = 8 + Math.floor(this.seededRandom(seed, 1, 1) * 4);
        const trunkX = px + TILE / 2 - trunkW / 2;
        ctx.fillStyle = '#5a3a24';
        ctx.fillRect(trunkX, py + 20, trunkW, 26);
        this.strokeRect(ctx, trunkX, py + 20, trunkW, 26);
        // 树干高光
        ctx.fillStyle = '#7a5a44';
        ctx.fillRect(trunkX + 1, py + 20, trunkW * 0.3, 26);
        // 树干暗面
        ctx.fillStyle = '#3d2818';
        ctx.fillRect(trunkX + trunkW - 2, py + 20, 2, 26);

        // 树冠 - 绿3色，圆形
        const colors = palette.tree;
        const crownBaseX = px + TILE / 2 + sway;
        const crownBaseY = py + 18;

        // 底层大冠
        ctx.fillStyle = colors[0];
        ctx.beginPath();
        ctx.arc(crownBaseX, crownBaseY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3d2817';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 中层冠
        ctx.fillStyle = colors[1];
        ctx.beginPath();
        ctx.arc(crownBaseX - 2, crownBaseY - 4, 14, 0, Math.PI * 2);
        ctx.fill();

        // 顶层亮冠
        ctx.fillStyle = colors[2];
        ctx.beginPath();
        ctx.arc(crownBaseX + 1, crownBaseY - 8, 10, 0, Math.PI * 2);
        ctx.fill();
    }

    // ===== 矿岩底 =====
    drawRockMineBase(ctx, px, py, tx, ty) {
        const seed = (tx * 67 + ty * 41) % 1000;
        const cx = px + TILE / 2;
        const cy = py + TILE / 2 + 2;
        const sides = 7 + Math.floor(this.seededRandom(seed, 1, 4) * 4);
        const radius = 16 + this.seededRandom(seed, 2, 5) * 4;

        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(cx, py + TILE - 2, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 主体 - 3色
        ctx.fillStyle = '#6a6058';
        this.drawIrregularPolygon(ctx, cx, cy, radius, sides, 0.6, seed);
        ctx.fill();
        ctx.strokeStyle = '#3d2817';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#8a8078';
        this.drawIrregularPolygon(ctx, cx - 2, cy - 3, radius * 0.55, Math.max(4, sides - 2), 0.5, seed + 100);
        ctx.fill();

        ctx.fillStyle = '#4a4540';
        this.drawIrregularPolygon(ctx, cx + 2, cy + 2, radius * 0.4, Math.max(4, sides - 2), 0.4, seed + 200);
        ctx.fill();

        // 矿石闪光点
        const t = Date.now() / 1000;
        const sparklePhase = t * 2 + tx * 0.5 + ty * 0.3;
        const sparkleAlpha = Math.max(0, Math.sin(sparklePhase) * 0.5 + 0.5);
        if (sparkleAlpha > 0.2) {
            ctx.fillStyle = `rgba(255, 215, 0, ${sparkleAlpha * 0.8})`;
            const sx = cx + (this.seededRandom(seed, 5, 11) - 0.5) * 12;
            const sy = cy + (this.seededRandom(seed, 6, 12) - 0.5) * 10 - 2;
            ctx.fillRect(sx - 1, sy - 1, 3, 3);
        }
    }

    // ===== 钓鱼点 =====
    drawFishSpot(ctx, px, py, tx, ty) {
        this.drawWater(ctx, px, py, tx, ty);
        const t = Date.now() / 800;
        const fwx = Math.sin(t + tx * 2) * 6;
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(px + 10 + fwx, py + 15, 12, 2);
        ctx.fillRect(px + 22 - fwx, py + 30, 10, 2);
        // 鱼标志 - 简单像素鱼
        ctx.fillStyle = '#ff8f00';
        ctx.fillRect(px + TILE / 2 - 4, py + TILE / 2 - 2, 8, 4);
        ctx.fillRect(px + TILE / 2 + 4, py + TILE / 2 - 3, 3, 2);
        ctx.fillRect(px + TILE / 2 + 4, py + TILE / 2 + 1, 3, 2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(px + TILE / 2 - 2, py + TILE / 2 - 1, 2, 2);
    }

    // ===== 野生采集物 =====
    drawWildCrop(ctx, px, py, tx, ty, palette) {
        // 草地底
        ctx.fillStyle = palette.grass[0];
        ctx.fillRect(px, py, TILE, TILE);
        const forageColors = ['#8d6e63', '#5d4037', '#4caf50', '#ff9800'];
        const forageIdx = (tx * 7 + ty * 13) % 4;
        ctx.fillStyle = forageColors[forageIdx];
        // 简单蘑菇/浆果形状
        ctx.fillRect(px + TILE / 2 - 4, py + TILE / 2 + 2, 8, 6);
        ctx.fillRect(px + TILE / 2 - 6, py + TILE / 2 - 2, 12, 5);
        this.strokeRect(ctx, px + TILE / 2 - 6, py + TILE / 2 - 2, 12, 5);
    }

    // ===== 花朵：茎(绿) + 花瓣(4色) + 花心(黄) =====
    drawFlower(ctx, px, py, tx, ty, palette) {
        // 草地底
        ctx.fillStyle = palette.grass[0];
        ctx.fillRect(px, py, TILE, TILE);

        const seed = (tx * 43 + ty * 71) % 1000;
        const t = Date.now() / 1000;
        const sway = Math.sin(t * 1.5 + tx * 0.7 + ty * 0.5) * 2;
        const flowerType = Math.floor(this.seededRandom(seed, 0, 14) * 4);
        const colors = palette.flower;

        const stemBaseX = px + TILE / 2;
        const stemBaseY = py + TILE - 4;
        const stemTopX = stemBaseX + sway;
        const stemTopY = stemBaseY - 16;

        // 茎
        ctx.strokeStyle = '#2d7a1e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(stemBaseX, stemBaseY);
        ctx.lineTo(stemTopX, stemTopY);
        ctx.stroke();

        // 叶子
        ctx.fillStyle = '#3d9b2e';
        ctx.fillRect(stemBaseX - 6 + sway * 0.3, stemBaseY - 8, 5, 3);
        ctx.fillRect(stemBaseX + 2 + sway * 0.3, stemBaseY - 10, 4, 3);

        // 花瓣 - 4色变化
        const fx = stemTopX;
        const fy = stemTopY;
        const petalColor = colors[flowerType % colors.length];
        const petalColor2 = colors[(flowerType + 1) % colors.length];

        // 4个花瓣
        ctx.fillStyle = petalColor;
        ctx.fillRect(fx - 5, fy - 2, 4, 4);
        ctx.fillRect(fx + 1, fy - 2, 4, 4);
        ctx.fillRect(fx - 2, fy - 5, 4, 4);
        ctx.fillRect(fx - 2, fy + 1, 4, 4);

        // 花瓣描边
        ctx.strokeStyle = '#3d2817';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(fx - 5, fy - 2, 4, 4);
        ctx.strokeRect(fx + 1, fy - 2, 4, 4);
        ctx.strokeRect(fx - 2, fy - 5, 4, 4);
        ctx.strokeRect(fx - 2, fy + 1, 4, 4);

        // 花心(黄)
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(fx - 2, fy - 2, 4, 4);
    }

    // ===== 不规则多边形 =====
    drawIrregularPolygon(ctx, cx, cy, radius, sides, irregularity, seed) {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            const r = radius * (0.7 + this.seededRandom(i, seed, 1) * irregularity);
            const px = cx + Math.cos(angle) * r;
            const py = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    // ===== 地形细节（后渲染层） =====
    renderTerrainDetails(ctx, state, sc, palette) {
        // 房屋窗户、门等需要在所有地形之上渲染的细节
        const startX = Math.max(0, Math.floor(state.cameraX / TILE));
        const startY = Math.max(0, Math.floor(state.cameraY / TILE));
        const endX = Math.min(MAP_W, Math.ceil((state.cameraX + this.screenW) / TILE) + 1);
        const endY = Math.min(MAP_H, Math.ceil((state.cameraY + this.screenH) / TILE) + 1);

        const hour = state.timeOfDay || (state.time / 60);
        const isNight = hour >= 19 || hour < 6;

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const tile = state.map[y][x];
                const px = x * TILE;
                const py = y * TILE;

                if (tile === T.HOUSE || tile === T.NPC_HOUSE) {
                    this.drawHouseDetails(ctx, px, py, x, y, isNight, tile === T.NPC_HOUSE);
                }
            }
        }
    }

    drawHouseDetails(ctx, px, py, tx, ty, isNight, isNpc) {
        // 窗户
        const windowColor = isNight ? '#ffcc80' : '#87ceeb';
        // 左窗
        this.drawWindow(ctx, px + 10, py + 20, windowColor, isNight);
        // 右窗
        this.drawWindow(ctx, px + 26, py + 20, windowColor, isNight);

        // 门
        ctx.fillStyle = '#5c3d1e';
        ctx.fillRect(px + 18, py + 30, 12, 16);
        this.strokeRect(ctx, px + 18, py + 30, 12, 16);
        // 门把手
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px + 27, py + 38, 2, 2);

        // 夜晚窗户发光
        if (isNight) {
            ctx.fillStyle = 'rgba(255, 204, 128, 0.15)';
            ctx.fillRect(px + 8, py + 18, 14, 14);
            ctx.fillRect(px + 24, py + 18, 14, 14);
        }

        // 烟雾
        const t = Date.now() / 1000;
        const chimneyX = px + TILE * 0.7 + 3;
        const chimneyY = py + 6;
        for (let i = 0; i < 2; i++) {
            const smokeAge = (t * 0.8 + i * 0.7) % 3;
            const smokeX = chimneyX + Math.sin(t * 2 + i) * 3 * smokeAge;
            const smokeY = chimneyY - smokeAge * 8;
            const smokeSize = 2 + smokeAge * 3;
            const smokeAlpha = 0.25 - smokeAge * 0.08;
            ctx.fillStyle = `rgba(200, 200, 200, ${Math.max(0, smokeAlpha)})`;
            ctx.fillRect(smokeX - smokeSize / 2, smokeY - smokeSize / 2, smokeSize, smokeSize);
        }
    }

    drawWindow(ctx, x, y, color, isNight) {
        if (isNight) {
            ctx.fillStyle = 'rgba(255, 204, 128, 0.2)';
            ctx.fillRect(x - 2, y - 2, 14, 14);
        }
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 10, 10);
        // 窗框十字
        ctx.strokeStyle = '#4a3020';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 5, y);
        ctx.lineTo(x + 5, y + 10);
        ctx.moveTo(x, y + 5);
        ctx.lineTo(x + 10, y + 5);
        ctx.stroke();
        this.strokeRect(ctx, x, y, 10, 10);
    }

    // ===== 作物绘制 =====
    renderCrops(ctx, state, palette) {
        const keys = Object.keys(state.crops);
        for (const key of keys) {
            const crop = state.crops[key];
            if (!crop) continue;

            const [x, y] = key.split(',').map(Number);
            const px = x * TILE;
            const py = y * TILE;
            const cropData = getCropData(crop.cropId);
            if (!cropData) continue;

            // 作物阴影
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.beginPath();
            ctx.ellipse(px + TILE / 2, py + TILE - 2, 10, 3, 0, 0, Math.PI * 2);
            ctx.fill();

            const isWithered = crop.water <= 0 && crop.growth < 100;

            if (isWithered) {
                this.drawWitheredCrop(ctx, px, py, x, y);
            } else if (crop.growth < 25) {
                this.drawSeedling(ctx, px, py, x, y);
            } else if (crop.growth < 50) {
                this.drawGrowingCrop(ctx, px, py, x, y, crop.growth);
            } else if (crop.growth < 100) {
                this.drawMatureCrop(ctx, px, py, x, y, cropData, crop.growth, false, palette);
            } else {
                this.drawMatureCrop(ctx, px, py, x, y, cropData, crop.growth, true, palette);
            }

            // 水分指示器
            if (crop.water < 30) {
                ctx.fillStyle = 'rgba(255, 80, 80, 0.7)';
                ctx.fillRect(px + 4, py + 2, TILE - 8, 3);
            }
        }
    }

    // 幼苗：2像素绿芽
    drawSeedling(ctx, px, py, x, y) {
        const t = Date.now() / 1000;
        const sway = Math.sin(t * 1.5 + x * 0.8 + y * 0.5) * 1;

        // 土堆
        ctx.fillStyle = '#6b4423';
        ctx.beginPath();
        ctx.ellipse(px + TILE / 2, py + TILE - 4, 6, 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2像素绿芽
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(px + TILE / 2 - 1 + sway, py + TILE - 10, 2, 4);
        ctx.fillStyle = '#66bb6a';
        ctx.fillRect(px + TILE / 2 - 1 + sway, py + TILE - 12, 2, 2);
    }

    // 生长期：4-8像素叶子
    drawGrowingCrop(ctx, px, py, x, y, growth) {
        const t = Date.now() / 1000;
        const progress = growth / 50;
        const sway = Math.sin(t * 1.2 + x * 0.7 + y * 0.4) * 1;
        const stemHeight = 8 + Math.floor(progress * 8);

        // 茎
        ctx.fillStyle = '#388e3c';
        ctx.fillRect(px + TILE / 2 - 1 + sway * 0.3, py + TILE - 4 - stemHeight, 2, stemHeight);

        // 叶子
        ctx.fillStyle = '#4caf50';
        const leafCount = 2 + Math.floor(progress * 2);
        for (let i = 0; i < leafCount; i++) {
            const leafY = py + TILE - 6 - i * 5;
            const side = i % 2 === 0 ? -1 : 1;
            const leafSize = 3 + Math.floor(progress * 3);
            ctx.fillRect(
                px + TILE / 2 + side * (4 + progress * 2) + sway * 0.3,
                leafY,
                leafSize, 2
            );
        }
    }

    // 成熟期
    drawMatureCrop(ctx, px, py, x, y, cropData, growth, isFullyMature, palette) {
        const t = Date.now() / 1000;
        const sway = Math.sin(t * 1 + x * 0.6 + y * 0.3) * 1;

        // 茎
        ctx.fillStyle = '#388e3c';
        ctx.fillRect(px + TILE / 2 - 1 + sway * 0.3, py + TILE - 20, 2, 16);

        // 叶子
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(px + TILE / 2 - 6 + sway * 0.3, py + TILE - 10, 5, 2);
        ctx.fillRect(px + TILE / 2 + 2 + sway * 0.3, py + TILE - 14, 6, 2);
        ctx.fillRect(px + TILE / 2 - 5 + sway * 0.3, py + TILE - 18, 4, 2);

        // 作物图形
        const cropType = (cropData.cropId || cropData.id || 0) % 5;
        const fruitX = px + TILE / 2 + sway;
        const fruitY = py + TILE - 22;

        if (cropType === 0 || cropType === 1) {
            // 圆形果实
            const size = isFullyMature ? 5 : 4;
            ctx.fillStyle = '#ff6347';
            ctx.fillRect(fruitX - size, fruitY - size, size * 2, size * 2);
            this.strokeRect(ctx, fruitX - size, fruitY - size, size * 2, size * 2);
            ctx.fillStyle = '#ff8a65';
            ctx.fillRect(fruitX - size + 1, fruitY - size + 1, size * 0.6, size * 0.6);
        } else if (cropType === 2) {
            // 根茎类
            ctx.fillStyle = '#4caf50';
            ctx.fillRect(px + TILE / 2 - 4, py + TILE - 10, 8, 3);
            ctx.fillStyle = '#ff8f00';
            ctx.fillRect(px + TILE / 2 - 3, py + TILE - 6, 6, 4);
        } else if (cropType === 3) {
            // 花朵类
            const flowerColor = palette.flower[cropType % palette.flower.length];
            ctx.fillStyle = flowerColor;
            ctx.fillRect(fruitX - 4, fruitY - 1, 3, 3);
            ctx.fillRect(fruitX + 1, fruitY - 1, 3, 3);
            ctx.fillRect(fruitX - 1, fruitY - 4, 3, 3);
            ctx.fillRect(fruitX - 1, fruitY + 1, 3, 3);
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(fruitX - 1, fruitY - 1, 3, 3);
        } else {
            // 谷物
            ctx.fillStyle = '#ffd54f';
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(fruitX - 2 + i, fruitY + i * 2, 3, 2);
            }
        }

        if (isFullyMature) {
            const sparkleAlpha = Math.max(0, Math.sin(t * 3) * 0.3);
            ctx.fillStyle = `rgba(255, 255, 200, ${sparkleAlpha})`;
            ctx.fillRect(fruitX + 2, fruitY - 3, 2, 2);
        }
    }

    drawWitheredCrop(ctx, px, py, x, y) {
        const t = Date.now() / 1000;
        const sway = Math.sin(t * 0.5) * 1;

        // 枯萎茎
        ctx.fillStyle = '#8b7355';
        ctx.fillRect(px + TILE / 2 - 1 + sway, py + TILE - 12, 2, 8);

        // 枯叶
        ctx.fillStyle = '#a08060';
        ctx.fillRect(px + TILE / 2 - 5 + sway, py + TILE - 10, 4, 2);
        ctx.fillRect(px + TILE / 2 + 2 + sway, py + TILE - 8, 3, 2);
    }

    // ===== NPC绘制 =====
    renderNPCs(ctx, state) {
        for (const npc of state.npcs) {
            const px = npc.x;
            const py = npc.y;

            if (px < state.cameraX - TILE || px > state.cameraX + this.screenW + TILE ||
                py < state.cameraY - TILE || py > state.cameraY + this.screenH + TILE) continue;

            // 阴影
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.ellipse(px + TILE / 2, py + TILE - 2, 12, 4, 0, 0, Math.PI * 2);
            ctx.fill();

            // 身体 - 简单矩形衣服
            ctx.fillStyle = npc.color || '#4a90d9';
            ctx.fillRect(px + 14, py + 14, 20, 22);
            this.strokeRect(ctx, px + 14, py + 14, 20, 22);

            // 头 - 圆形，肤色
            ctx.fillStyle = '#ffd5a0';
            ctx.beginPath();
            ctx.arc(px + TILE / 2, py + 12, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#3d2817';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 头发覆盖顶部
            ctx.fillStyle = '#5d4037';
            ctx.beginPath();
            ctx.arc(px + TILE / 2, py + 10, 10, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(px + TILE / 2 - 10, py + 8, 4, 8);
            ctx.fillRect(px + TILE / 2 + 6, py + 8, 4, 8);

            // 眼睛
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(px + TILE / 2 - 4, py + 12, 2, 2);
            ctx.fillRect(px + TILE / 2 + 2, py + 12, 2, 2);

            // NPC名字
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText(npc.name, px + TILE / 2, py - 6);
            ctx.fillText(npc.name, px + TILE / 2, py - 6);
        }
    }

    // ===== 玩家角色绘制 (16x24像素比例，Q版) =====
    renderPlayer(ctx, state) {
        const px = state.playerX;
        const py = state.playerY;
        const dir = state.playerDir || 0;
        const moving = state.playerMoving;

        const walkCycle = moving ? state.moveTimer * 10 : 0;
        const sinWalk = Math.sin(walkCycle);
        const bobY = moving ? Math.abs(sinWalk) * 1 : 0;

        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(px + TILE / 2, py + TILE - 2, 14, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        const cx = px + TILE / 2;
        const cy = py + TILE / 2 + 4 - bobY;
        const facingLeft = dir === 2;
        const facingRight = dir === 3;
        const facingUp = dir === 1;
        const facingDown = dir === 0;

        // 身体颜色
        const bodyColor = facingUp ? '#b0352a' : (facingLeft || facingRight ? '#c44d33' : '#d94e41');

        // 腿部 - 2-3像素宽线条
        const legW = 4;
        const legH = 8;
        const legY = cy + 10;
        ctx.fillStyle = '#34495e';
        if (facingDown || facingUp) {
            const leftLegX = cx - 5 + (moving ? sinWalk * 2 : 0);
            const rightLegX = cx + 5 - (moving ? sinWalk * 2 : 0);
            ctx.fillRect(leftLegX - legW / 2, legY, legW, legH);
            ctx.fillRect(rightLegX - legW / 2, legY, legW, legH);
            this.strokeRect(ctx, leftLegX - legW / 2, legY, legW, legH);
            this.strokeRect(ctx, rightLegX - legW / 2, legY, legW, legH);
        } else {
            const frontLegX = cx + (facingRight ? 4 : -4) + sinWalk * 2;
            const backLegX = cx + (facingRight ? -2 : 2) - sinWalk * 2;
            ctx.fillRect(backLegX - legW / 2, legY + 1, legW, legH);
            ctx.fillRect(frontLegX - legW / 2, legY - 1, legW, legH);
        }

        // 身体 - 简单矩形衣服
        const bodyW = 16;
        const bodyH = 14;
        const bodyY = cy - 4;
        ctx.fillStyle = bodyColor;
        ctx.fillRect(cx - bodyW / 2, bodyY, bodyW, bodyH);
        this.strokeRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH);

        // 手臂
        const armW = 3;
        const armH = 10;
        const armY = bodyY + 2;
        ctx.fillStyle = '#f5cba7';
        if (facingDown || facingUp) {
            const leftArmX = cx - 10 - (moving ? sinWalk * 1.5 : 0);
            const rightArmX = cx + 10 + (moving ? sinWalk * 1.5 : 0);
            ctx.fillRect(leftArmX - armW / 2, armY, armW, armH);
            ctx.fillRect(rightArmX - armW / 2, armY, armW, armH);
            this.strokeRect(ctx, leftArmX - armW / 2, armY, armW, armH);
            this.strokeRect(ctx, rightArmX - armW / 2, armY, armW, armH);
            // 袖口
            ctx.fillStyle = bodyColor;
            ctx.fillRect(leftArmX - armW / 2 - 0.5, armY, armW + 1, 2);
            ctx.fillRect(rightArmX - armW / 2 - 0.5, armY, armW + 1, 2);
        } else {
            const frontArmX = cx + (facingRight ? 10 : -10) + sinWalk * 1.5;
            const backArmX = cx + (facingRight ? -6 : 6) - sinWalk;
            ctx.fillStyle = '#f5cba7';
            ctx.fillRect(backArmX - armW / 2, armY + 1, armW, armH);
            ctx.fillRect(frontArmX - armW / 2, armY - 1, armW, armH);
            ctx.fillStyle = bodyColor;
            ctx.fillRect(backArmX - armW / 2 - 0.5, armY + 1, armW + 1, 2);
            ctx.fillRect(frontArmX - armW / 2 - 0.5, armY - 1, armW + 1, 2);
        }

        // 头部 - 圆形，肤色，头身比约1:1
        const headSize = 10;
        const headY = bodyY - 8;
        ctx.fillStyle = '#f5cba7';
        ctx.beginPath();
        ctx.arc(cx, headY, headSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3d2817';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 头发覆盖顶部
        const hairBase = '#4e342e';
        ctx.fillStyle = hairBase;
        if (facingDown) {
            ctx.beginPath();
            ctx.arc(cx, headY - 2, headSize + 1, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(cx - headSize - 1, headY - 4, 3, 8);
            ctx.fillRect(cx + headSize - 2, headY - 4, 3, 8);
        } else if (facingUp) {
            ctx.beginPath();
            ctx.arc(cx, headY - 3, headSize, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(cx - headSize, headY - 4, 2, 6);
            ctx.fillRect(cx + headSize - 2, headY - 4, 2, 6);
        } else if (facingLeft) {
            ctx.beginPath();
            ctx.arc(cx - 2, headY - 2, headSize + 1, Math.PI * 0.7, Math.PI * 1.9);
            ctx.fill();
            ctx.fillRect(cx - headSize - 2, headY - 6, 5, 12);
        } else if (facingRight) {
            ctx.beginPath();
            ctx.arc(cx + 2, headY - 2, headSize + 1, Math.PI * 0.1, Math.PI * 1.3);
            ctx.fill();
            ctx.fillRect(cx + headSize - 3, headY - 6, 5, 12);
        }

        // 眼睛
        if (!facingUp) {
            const now = Date.now();
            const blink = (now % 3000) < 150;
            if (!blink) {
                ctx.fillStyle = '#fff';
                if (facingDown) {
                    ctx.fillRect(cx - 5, headY, 3, 3);
                    ctx.fillRect(cx + 2, headY, 3, 3);
                } else if (facingLeft) {
                    ctx.fillRect(cx - 6, headY, 3, 3);
                } else if (facingRight) {
                    ctx.fillRect(cx + 3, headY, 3, 3);
                }
                ctx.fillStyle = '#1a1a1a';
                if (facingDown) {
                    ctx.fillRect(cx - 4, headY + 1, 2, 2);
                    ctx.fillRect(cx + 3, headY + 1, 2, 2);
                } else if (facingLeft) {
                    ctx.fillRect(cx - 5, headY + 1, 2, 2);
                } else if (facingRight) {
                    ctx.fillRect(cx + 4, headY + 1, 2, 2);
                }
            } else {
                ctx.strokeStyle = '#1a1a1a';
                ctx.lineWidth = 1;
                if (facingDown) {
                    ctx.beginPath();
                    ctx.moveTo(cx - 5, headY + 1);
                    ctx.lineTo(cx - 2, headY + 1);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(cx + 2, headY + 1);
                    ctx.lineTo(cx + 5, headY + 1);
                    ctx.stroke();
                } else if (facingLeft) {
                    ctx.beginPath();
                    ctx.moveTo(cx - 6, headY + 1);
                    ctx.lineTo(cx - 3, headY + 1);
                    ctx.stroke();
                } else if (facingRight) {
                    ctx.beginPath();
                    ctx.moveTo(cx + 3, headY + 1);
                    ctx.lineTo(cx + 6, headY + 1);
                    ctx.stroke();
                }
            }
        }

        // 工具
        this.renderTool(ctx, px, py, dir, moving, sinWalk, state);

        // 玩家名字
        const nameText = state.playerName || '';
        if (nameText) {
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const textMetrics = ctx.measureText(nameText);
            const textW = textMetrics.width;
            const padX = 6;
            const nameX = px + TILE / 2;
            const nameY = py - 10;

            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(nameX - textW / 2 - padX, nameY - 12, textW + padX * 2, 14);
            ctx.fillStyle = '#fff';
            ctx.fillText(nameText, nameX, nameY);
        }
    }

    renderTool(ctx, px, py, dir, moving, sinWalk, state) {
        const toolColors = ['#c4a96a', '#4a9bd5', '#4db83a', '#ff8c00', '#8b7355'];
        const toolColor = toolColors[state.currentTool] || '#c4a96a';
        if (state.currentTool < 0 || state.currentTool > 4) return;

        let tx = px + TILE / 2;
        let ty = py + TILE / 2;
        let toolOffsetX = 0;
        let toolOffsetY = 0;

        if (dir === 0) { toolOffsetX = 14; toolOffsetY = 4; }
        else if (dir === 1) { toolOffsetX = -14; toolOffsetY = 4; }
        else if (dir === 2) { toolOffsetX = -16; toolOffsetY = 2; }
        else if (dir === 3) { toolOffsetX = 16; toolOffsetY = 2; }

        if (moving) toolOffsetY += sinWalk * 2;

        const now = Date.now();
        const timeSinceInteract = now - (state.lastInteractTime || 0);
        const isSwinging = timeSinceInteract < 300;
        let swingAngle = 0;
        if (isSwinging) {
            const swingProgress = timeSinceInteract / 300;
            swingAngle = Math.sin(swingProgress * Math.PI) * 0.8;
            if (dir === 2) swingAngle = -swingAngle;
        }

        ctx.save();
        ctx.translate(tx + toolOffsetX, ty + toolOffsetY);
        ctx.rotate(swingAngle);
        ctx.strokeStyle = toolColor;
        ctx.fillStyle = toolColor;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (state.currentTool) {
            case 0: // 锄头
                ctx.beginPath();
                ctx.moveTo(-4, -6);
                ctx.lineTo(4, 6);
                ctx.stroke();
                ctx.strokeRect(2, 4, 5, 4);
                break;
            case 1: // 水壶
                ctx.strokeRect(-3, -4, 6, 8);
                ctx.beginPath();
                ctx.moveTo(3, -2);
                ctx.lineTo(6, -5);
                ctx.stroke();
                break;
            case 2: // 种子
                ctx.fillRect(-2, -2, 4, 4);
                ctx.beginPath();
                ctx.moveTo(0, -2);
                ctx.lineTo(-2, -6);
                ctx.moveTo(0, -2);
                ctx.lineTo(2, -6);
                ctx.stroke();
                break;
            case 3: // 收获篮子
                ctx.strokeRect(-4, -2, 8, 6);
                ctx.beginPath();
                ctx.moveTo(-4, -2);
                ctx.quadraticCurveTo(0, -6, 4, -2);
                ctx.stroke();
                break;
            case 4: // 铲除铲子
                ctx.beginPath();
                ctx.moveTo(0, -6);
                ctx.lineTo(0, 2);
                ctx.stroke();
                ctx.strokeRect(-3, 2, 6, 4);
                break;
        }
        ctx.restore();
    }

    // ===== 其他玩家（简化版） =====
    renderOtherPlayers(ctx, state) {
        const now = Date.now();
        for (const [peerId, player] of state.otherPlayers) {
            if (now - player.lastUpdate > 10000) continue;

            const px = player.x;
            const py = player.y;
            const dir = player.dir || 0;
            const color = player.color || '#ff6b6b';

            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.ellipse(px + TILE / 2, py + TILE - 2, 12, 4, 0, 0, Math.PI * 2);
            ctx.fill();

            const cx = px + TILE / 2;
            const cy = py + TILE / 2 + 4;
            const facingLeft = dir === 2;
            const facingRight = dir === 3;
            const facingUp = dir === 1;

            // 腿
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(cx - 5, cy + 10, 4, 8);
            ctx.fillRect(cx + 1, cy + 10, 4, 8);

            // 身体
            ctx.fillStyle = color;
            ctx.fillRect(cx - 8, cy - 4, 16, 14);
            this.strokeRect(ctx, cx - 8, cy - 4, 16, 14);

            // 头
            ctx.fillStyle = '#f5cba7';
            ctx.beginPath();
            ctx.arc(cx, cy - 10, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#3d2817';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 头发
            ctx.fillStyle = '#5d4037';
            if (!facingUp) {
                ctx.beginPath();
                ctx.arc(cx, cy - 12, 9, Math.PI, 0);
                ctx.fill();
                ctx.fillRect(cx - 9, cy - 12, 3, 6);
                ctx.fillRect(cx + 6, cy - 12, 3, 6);
            } else {
                ctx.beginPath();
                ctx.arc(cx, cy - 13, 8, Math.PI, 0);
                ctx.fill();
            }

            // 眼睛
            if (!facingUp) {
                ctx.fillStyle = '#1a1a1a';
                if (dir === 0) {
                    ctx.fillRect(cx - 3, cy - 10, 2, 2);
                    ctx.fillRect(cx + 1, cy - 10, 2, 2);
                } else if (facingLeft) {
                    ctx.fillRect(cx - 4, cy - 10, 2, 2);
                } else if (facingRight) {
                    ctx.fillRect(cx + 2, cy - 10, 2, 2);
                }
            }

            // 名字
            const nameText = player.name || '玩家';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            const textW = ctx.measureText(nameText).width;
            ctx.fillRect(cx - textW / 2 - 4, py - 20, textW + 8, 12);
            ctx.fillStyle = '#fff';
            ctx.fillText(nameText, cx, py - 10);
        }
    }

    // ===== 粒子 =====
    renderParticles(ctx, state) {
        for (const p of state.particles) {
            ctx.fillStyle = p.color || '#fff';
            ctx.globalAlpha = p.life;
            const size = p.size || 4;
            ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
    }

    // ===== 浮动文字 =====
    renderFloatingTexts(ctx, state) {
        for (const ft of state.floatingTexts) {
            ctx.fillStyle = ft.color;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText(ft.text, ft.x, ft.y);
            ctx.fillText(ft.text, ft.x, ft.y);
        }
    }

    // ===== 钓鱼进度条 =====
    renderFishingBar(ctx, state) {
        if (!state.fishing) return;

        const barWidth = 300;
        const barHeight = 30;
        const barX = (this.screenW - barWidth) / 2;
        const barY = this.screenH - 120;

        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(barX - 10, barY - 30, barWidth + 20, barHeight + 50);

        ctx.fillStyle = '#ffd93d';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('钓鱼！按空格停下', this.screenW / 2, barY - 10);

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        const targetStart = state.fishTarget - state.fishTargetSize / 2;
        ctx.fillStyle = 'rgba(76, 175, 80, 0.6)';
        ctx.fillRect(barX + targetStart * barWidth, barY, state.fishTargetSize * barWidth, barHeight);

        const indicatorX = barX + state.fishBarPos * barWidth;
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(indicatorX - 3, barY - 4, 6, barHeight + 8);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        const remaining = Math.max(0, 10 - state.fishProgress);
        ctx.fillStyle = '#aaa';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${remaining.toFixed(1)}s`, this.screenW / 2, barY + barHeight + 16);
    }

    // ===== 全局光影效果 =====
    renderGlobalLighting(ctx, state, sc) {
        const hour = state.timeOfDay || (state.time / 60);

        if (hour >= 20 || hour < 5) {
            // 夜晚：深蓝覆盖层 alpha 0.4 + 星星
            ctx.fillStyle = 'rgba(26, 35, 126, 0.4)';
            ctx.fillRect(0, 0, this.screenW, this.screenH);

            // 星星
            const twinklePhase = Date.now() / 1000;
            for (const star of this.stars) {
                const sx = star.nx * this.screenW;
                const sy = star.ny * this.screenH;
                const twinkle = Math.sin(twinklePhase + star.twinkle) * 0.3 + 0.7;
                ctx.fillStyle = `rgba(255,255,255,${twinkle})`;
                ctx.fillRect(sx, sy, star.size, star.size);
            }
        } else if (hour >= 18) {
            // 傍晚：橙黄覆盖层 alpha 0.15
            const alpha = (hour - 18) / 2 * 0.15;
            ctx.fillStyle = `rgba(255, 167, 38, ${alpha})`;
            ctx.fillRect(0, 0, this.screenW, this.screenH);
        } else if (hour < 7) {
            // 清晨：淡蓝覆盖层 alpha 0.1
            const alpha = (7 - hour) / 2 * 0.1;
            ctx.fillStyle = `rgba(144, 202, 249, ${alpha})`;
            ctx.fillRect(0, 0, this.screenW, this.screenH);
        }

        // 室内灯光效果（夜晚时）
        if (hour >= 19 || hour < 6) {
            // 简单的暖黄发光效果 - 在屏幕中心附近模拟
            ctx.fillStyle = 'rgba(255, 204, 128, 0.05)';
            ctx.fillRect(0, 0, this.screenW, this.screenH);
        }
    }

    // ===== 小地图 =====
    renderMinimap(state, sc) {
        if (!state.showMinimap) return;

        const ctx = this.ctx;
        const mmSize = 150;
        const mmX = this.screenW - mmSize - 20;
        const mmY = 20;
        const scaleX = mmSize / MAP_W;
        const scaleY = mmSize / MAP_H;

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(mmX - 5, mmY - 5, mmSize + 10, mmSize + 10);

        for (const chunkKey of state.generatedChunks) {
            const [cx, cy] = chunkKey.split(',').map(Number);
            const startX = cx * CHUNK_SIZE;
            const startY = cy * CHUNK_SIZE;
            const endX = Math.min(startX + CHUNK_SIZE, MAP_W);
            const endY = Math.min(startY + CHUNK_SIZE, MAP_H);

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const tile = state.map[y][x];
                    let color;
                    switch (tile) {
                        case T.GRASS: color = sc.grass; break;
                        case T.DIRT: color = '#8b6d3f'; break;
                        case T.TILLED: color = '#6b4423'; break;
                        case T.WATERED: color = '#5a3a1a'; break;
                        case T.PATH: color = '#c4a96a'; break;
                        case T.FENCE: color = '#8b6914'; break;
                        case T.WATER: color = '#3a7bd5'; break;
                        case T.FLOWER: color = '#ff69b4'; break;
                        case T.HOUSE: color = '#d4a76a'; break;
                        case T.DOOR: color = '#8b4513'; break;
                        case T.STONE: color = '#888'; break;
                        case T.TREE: color = '#2d5a1e'; break;
                        case T.ROCK_MINE: color = '#6a6058'; break;
                        case T.FISH_SPOT: color = '#4a9bd5'; break;
                        case T.WILD_CROP: color = '#7bc67b'; break;
                        case T.NPC_HOUSE: color = '#b08050'; break;
                        default: color = '#4a6741';
                    }
                    ctx.fillStyle = color;
                    ctx.fillRect(mmX + x * scaleX, mmY + y * scaleY, Math.max(scaleX, 1), Math.max(scaleY, 1));
                }
            }
        }

        // 玩家位置
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(
            mmX + (state.playerX / TILE) * scaleX - 2,
            mmY + (state.playerY / TILE) * scaleY - 2,
            4, 4
        );

        // 其他玩家
        const now = Date.now();
        for (const [peerId, player] of state.otherPlayers) {
            if (now - player.lastUpdate > 10000) continue;
            const opx = mmX + (player.x / TILE) * scaleX;
            const opy = mmY + (player.y / TILE) * scaleY;
            ctx.fillStyle = player.color || '#ff6b6b';
            ctx.fillRect(opx - 2, opy - 2, 4, 4);
        }

        // 视野范围
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            mmX + (state.cameraX / TILE) * scaleX,
            mmY + (state.cameraY / TILE) * scaleY,
            (this.screenW / TILE) * scaleX,
            (this.screenH / TILE) * scaleY
        );
    }
}
