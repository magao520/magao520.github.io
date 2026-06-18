/**
 * Canvas 渲染器 - 星露谷风格极致优化版 (大世界版)
 *
 * 优化特性:
 * 1. 无缝纹理平铺 - 使用 createPattern 消除瓦片边界
 * 2. 边缘过渡混合 - 相邻不同地形之间绘制半透明渐变
 * 3. 环境光遮蔽 (AO) - 瓦片四角暗角增强立体感
 * 4. 地形凹凸法线 - 明暗变化模拟地形起伏
 * 5. 动态光影 - 实时阴影、水面反射、阳光方向
 * 6. 色彩分级 - 季节和时间动态色调
 * 7. NPC 渲染 - 小镇NPC显示
 * 8. 钓鱼进度条 - 钓鱼小游戏UI
 */
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // 生成固定星星位置
        this.stars = [];
        for (let i = 0; i < 40; i++) {
            this.stars.push({
                nx: ((i * 137 + 50) % 1000) / 1000,
                ny: ((i * 97 + 30) % 600) / 1000,
                size: 1 + (i % 3),
                twinkle: Math.random() * Math.PI * 2
            });
        }

        // 缓存的 patterns
        this.patterns = {};
        this.aoCache = null;

        // 太阳光方向 (随时间变化)
        this.sunAngle = 0;

        // 地形颜色定义 (用于过渡混合)
        this.tileColors = {
            [T.GRASS]:     { r: 132, g: 198, b: 105 },
            [T.DIRT]:      { r: 139, g: 109, b:  63 },
            [T.TILLED]:    { r: 107, g:  68, b:  35 },
            [T.WATERED]:   { r:  90, g:  60, b:  30 },
            [T.PATH]:      { r: 180, g: 160, b: 110 },
            [T.FENCE]:     { r: 132, g: 198, b: 105 },
            [T.WATER]:     { r:  58, g: 123, b: 213 },
            [T.FLOWER]:    { r: 132, g: 198, b: 105 },
            [T.HOUSE]:     { r: 196, g: 150, b: 100 },
            [T.DOOR]:      { r: 139, g:  90, b:  43 },
            [T.STONE]:     { r: 132, g: 198, b: 105 },
            [T.BRIDGE]:    { r: 139, g: 109, b:  63 },
            [T.TREE]:      { r:  60, g: 120, b:  40 },
            [T.ROCK_MINE]: { r: 100, g:  90, b:  80 },
            [T.FISH_SPOT]: { r:  58, g: 123, b: 213 },
            [T.WILD_CROP]: { r: 132, g: 198, b: 105 },
            [T.NPC_HOUSE]: { r: 180, g: 140, b: 100 },
        };
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.screenW = this.canvas.width;
        this.screenH = this.canvas.height;
        this.aoCache = null; // 清除AO缓存
    }

    getSeasonColors(season) {
        return SEASON_COLORS[season] || SEASON_COLORS.spring;
    }

    /**
     * 获取或创建无缝纹理 Pattern
     */
    getPattern(assetKey) {
        if (this.patterns[assetKey]) return this.patterns[assetKey];
        const img = AssetsLoader.assets[assetKey];
        if (!img) return null;
        const pattern = this.ctx.createPattern(img, 'repeat');
        this.patterns[assetKey] = pattern;
        return pattern;
    }

    /**
     * 安全绘制瓦片
     */
    drawTile(ctx, assetKey, px, py) {
        const img = AssetsLoader.assets[assetKey];
        if (img) {
            ctx.drawImage(img, px, py, TILE, TILE);
            return true;
        }
        return false;
    }

    /**
     * 用无缝纹理填充区域
     */
    fillWithPattern(ctx, assetKey, x, y, w, h) {
        const pattern = this.getPattern(assetKey);
        if (pattern) {
            ctx.save();
            ctx.fillStyle = pattern;
            ctx.translate(x, y);
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
            return true;
        }
        return false;
    }

    /**
     * 主渲染循环
     */
    render(state) {
        const ctx = this.ctx;
        const sc = this.getSeasonColors(state.season);

        // 更新太阳光角度 (6:00= sunrise, 12:00= overhead, 18:00= sunset)
        const hour = state.timeOfDay || (state.time / 60);
        if (hour >= 6 && hour <= 18) {
            this.sunAngle = ((hour - 6) / 12) * Math.PI; // 0 to PI
        } else {
            this.sunAngle = -0.5; // night
        }

        // 清屏
        ctx.fillStyle = '#0d1b0d';
        ctx.fillRect(0, 0, this.screenW, this.screenH);

        // 计算相机
        state.cameraX = state.playerX - this.screenW / 2 + TILE / 2;
        state.cameraY = state.playerY - this.screenH / 2 + TILE / 2;
        state.cameraX = Math.max(0, Math.min(state.cameraX, MAP_W * TILE - this.screenW));
        state.cameraY = Math.max(0, Math.min(state.cameraY, MAP_H * TILE - this.screenH));

        ctx.save();
        ctx.translate(-Math.round(state.cameraX), -Math.round(state.cameraY));

        // 1. 渲染底层地形 (无缝纹理平铺)
        this.renderTerrainBase(ctx, state, sc);

        // 2. 渲染边缘过渡
        this.renderEdgeTransitions(ctx, state);

        // 3. 渲染环境光遮蔽
        this.renderAmbientOcclusion(ctx, state);

        // 4. 渲染地形细节 (犁沟、水波等)
        this.renderTerrainDetails(ctx, state);

        // 5. 渲染作物
        this.renderCrops(ctx, state);

        // 6. 渲染NPC
        this.renderNPCs(ctx, state);

        // 7. 渲染玩家
        this.renderPlayer(ctx, state);

        // 8. 渲染粒子和浮动文字
        this.renderParticles(ctx, state);
        this.renderFloatingTexts(ctx, state);

        ctx.restore();

        // 9. 全局光影效果
        this.renderGlobalLighting(ctx, state, sc);

        // 10. 钓鱼进度条
        this.renderFishingBar(ctx, state);

        // 11. 小地图
        this.renderMinimap(state, sc);
    }

    /**
     * 渲染底层地形 - 使用无缝纹理平铺
     */
    renderTerrainBase(ctx, state, sc) {
        const startX = Math.max(0, Math.floor(state.cameraX / TILE));
        const startY = Math.max(0, Math.floor(state.cameraY / TILE));
        const endX = Math.min(MAP_W, Math.ceil((state.cameraX + this.screenW) / TILE) + 1);
        const endY = Math.min(MAP_H, Math.ceil((state.cameraY + this.screenH) / TILE) + 1);

        // 按地形类型分组渲染，减少 pattern 切换
        const terrainGroups = {};
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const tile = state.map[y][x];
                if (!terrainGroups[tile]) terrainGroups[tile] = [];
                terrainGroups[tile].push({x, y});
            }
        }

        // 渲染每个地形组
        for (const [tileType, cells] of Object.entries(terrainGroups)) {
            const assetKey = this.getTerrainAssetKey(parseInt(tileType));
            const pattern = this.getPattern(assetKey);

            if (pattern) {
                ctx.fillStyle = pattern;
                for (const cell of cells) {
                    ctx.fillRect(cell.x * TILE, cell.y * TILE, TILE, TILE);
                }
            } else {
                // fallback: 纯色填充
                ctx.fillStyle = this.getTerrainColor(parseInt(tileType), sc);
                for (const cell of cells) {
                    ctx.fillRect(cell.x * TILE, cell.y * TILE, TILE, TILE);
                }
            }
        }
    }

    /**
     * 获取地形对应的素材键
     */
    getTerrainAssetKey(tile) {
        const season = window.state ? window.state.season : 'spring';
        switch (tile) {
            case T.GRASS:
                if (season === 'winter') return 'texGrassSnowy';
                if (season === 'autumn') return 'texGrassNov';
                if (season === 'summer') return 'texGrassDry';
                return 'texGrass';
            case T.DIRT:      return 'texDryland';
            case T.TILLED:    return 'texFarmland';
            case T.WATERED:   return 'texMud';
            case T.PATH:      return 'texPath';
            case T.FENCE:     return 'texGrass';
            case T.WATER:     return 'texWater';
            case T.FLOWER:    return 'texGrass';
            case T.HOUSE:     return 'texStoneTile';
            case T.DOOR:      return 'texWoodTile';
            case T.STONE:     return 'texPebbles';
            case T.BRIDGE:    return 'texWoodpath';
            case T.TREE:      return 'texJungle';
            case T.ROCK_MINE: return 'texGravel';
            case T.FISH_SPOT: return 'texShallow';
            case T.WILD_CROP: return 'texGrass';
            case T.NPC_HOUSE: return 'texWoodTile';
            default:          return 'texGrass';
        }
    }

    /**
     * 获取地形颜色 (fallback)
     */
    getTerrainColor(tile, sc) {
        switch (tile) {
            case T.GRASS:     return sc.grass;
            case T.DIRT:      return '#8b6d3f';
            case T.TILLED:    return '#6b4423';
            case T.WATERED:   return '#5a3a1a';
            case T.PATH:      return '#c4a96a';
            case T.FENCE:     return sc.grass;
            case T.WATER:     return '#3a7bd5';
            case T.FLOWER:    return sc.grass;
            case T.HOUSE:     return '#c49558';
            case T.DOOR:      return '#8b5a2b';
            case T.STONE:     return sc.grass;
            case T.BRIDGE:    return '#a08060';
            case T.TREE:      return '#2d5a1e';
            case T.ROCK_MINE: return '#6a6058';
            case T.FISH_SPOT: return '#4a9bd5';
            case T.WILD_CROP: return sc.grass;
            case T.NPC_HOUSE: return '#b08050';
            default:          return '#4a6741';
        }
    }

    /**
     * 渲染边缘过渡 - 在相邻不同地形之间绘制渐变混合
     */
    renderEdgeTransitions(ctx, state) {
        const startX = Math.max(0, Math.floor(state.cameraX / TILE));
        const startY = Math.max(0, Math.floor(state.cameraY / TILE));
        const endX = Math.min(MAP_W, Math.ceil((state.cameraX + this.screenW) / TILE) + 1);
        const endY = Math.min(MAP_H, Math.ceil((state.cameraY + this.screenH) / TILE) + 1);

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const tile = state.map[y][x];
                const px = x * TILE;
                const py = y * TILE;

                // 检查四个方向的邻居
                const neighbors = [
                    { dx: 0, dy: -1, edge: 'top' },
                    { dx: 0, dy: 1, edge: 'bottom' },
                    { dx: -1, dy: 0, edge: 'left' },
                    { dx: 1, dy: 0, edge: 'right' }
                ];

                for (const n of neighbors) {
                    const nx = x + n.dx;
                    const ny = y + n.dy;
                    if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;

                    const neighborTile = state.map[ny][nx];
                    if (neighborTile === tile) continue;

                    // 绘制过渡渐变
                    this.drawEdgeTransition(ctx, px, py, n.edge, tile, neighborTile);
                }
            }
        }
    }

    /**
     * 绘制单个边缘过渡
     */
    drawEdgeTransition(ctx, px, py, edge, fromTile, toTile) {
        const fromColor = this.tileColors[fromTile] || this.tileColors[T.GRASS];
        const toColor = this.tileColors[toTile] || this.tileColors[T.GRASS];

        const gradientSize = 8;
        let grad;

        if (edge === 'top') {
            grad = ctx.createLinearGradient(px, py, px, py + gradientSize);
            grad.addColorStop(0, `rgba(${toColor.r},${toColor.g},${toColor.b},0.35)`);
            grad.addColorStop(1, `rgba(${toColor.r},${toColor.g},${toColor.b},0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(px, py, TILE, gradientSize);
        } else if (edge === 'bottom') {
            grad = ctx.createLinearGradient(px, py + TILE - gradientSize, px, py + TILE);
            grad.addColorStop(0, `rgba(${toColor.r},${toColor.g},${toColor.b},0)`);
            grad.addColorStop(1, `rgba(${toColor.r},${toColor.g},${toColor.b},0.35)`);
            ctx.fillStyle = grad;
            ctx.fillRect(px, py + TILE - gradientSize, TILE, gradientSize);
        } else if (edge === 'left') {
            grad = ctx.createLinearGradient(px, py, px + gradientSize, py);
            grad.addColorStop(0, `rgba(${toColor.r},${toColor.g},${toColor.b},0.35)`);
            grad.addColorStop(1, `rgba(${toColor.r},${toColor.g},${toColor.b},0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(px, py, gradientSize, TILE);
        } else if (edge === 'right') {
            grad = ctx.createLinearGradient(px + TILE - gradientSize, py, px + TILE, py);
            grad.addColorStop(0, `rgba(${toColor.r},${toColor.g},${toColor.b},0)`);
            grad.addColorStop(1, `rgba(${toColor.r},${toColor.g},${toColor.b},0.35)`);
            ctx.fillStyle = grad;
            ctx.fillRect(px + TILE - gradientSize, py, gradientSize, TILE);
        }
    }

    /**
     * 渲染环境光遮蔽 - 瓦片四角暗角
     */
    renderAmbientOcclusion(ctx, state) {
        const startX = Math.max(0, Math.floor(state.cameraX / TILE));
        const startY = Math.max(0, Math.floor(state.cameraY / TILE));
        const endX = Math.min(MAP_W, Math.ceil((state.cameraX + this.screenW) / TILE) + 1);
        const endY = Math.min(MAP_H, Math.ceil((state.cameraY + this.screenH) / TILE) + 1);

        ctx.fillStyle = 'rgba(0,0,0,0.12)';

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const px = x * TILE;
                const py = y * TILE;

                // 检查四个角是否有高度差
                const corners = [
                    { cx: px, cy: py, checks: [[0,-1],[-1,0],[-1,-1]] },
                    { cx: px + TILE, cy: py, checks: [[0,-1],[1,0],[1,-1]] },
                    { cx: px, cy: py + TILE, checks: [[0,1],[-1,0],[-1,1]] },
                    { cx: px + TILE, cy: py + TILE, checks: [[0,1],[1,0],[1,1]] }
                ];

                for (const corner of corners) {
                    let diffCount = 0;
                    for (const check of corner.checks) {
                        const nx = x + check[0];
                        const ny = y + check[1];
                        if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) {
                            if (state.map[ny][nx] !== state.map[y][x]) diffCount++;
                        }
                    }
                    if (diffCount > 0) {
                        const alpha = 0.08 * diffCount;
                        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
                        ctx.beginPath();
                        ctx.arc(corner.cx, corner.cy, 10, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // 瓦片底部阴影（模拟高度）
                if (y < MAP_H - 1 && state.map[y + 1][x] !== state.map[y][x]) {
                    const grad = ctx.createLinearGradient(px, py + TILE - 4, px, py + TILE);
                    grad.addColorStop(0, 'rgba(0,0,0,0)');
                    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(px, py + TILE - 4, TILE, 4);
                }
            }
        }
    }

    /**
     * 伪随机数生成器（基于坐标种子）
     */
    seededRandom(x, y, seed = 0) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
        return n - Math.floor(n);
    }

    /**
     * 绘制不规则多边形（用于石头）
     */
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

    /**
     * 渲染地形细节
     */
    renderTerrainDetails(ctx, state) {
        const startX = Math.max(0, Math.floor(state.cameraX / TILE));
        const startY = Math.max(0, Math.floor(state.cameraY / TILE));
        const endX = Math.min(MAP_W, Math.ceil((state.cameraX + this.screenW) / TILE) + 1);
        const endY = Math.min(MAP_H, Math.ceil((state.cameraY + this.screenH) / TILE) + 1);

        // 收集需要后渲染的元素（如房屋烟雾）
        const deferredDraws = [];

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const tile = state.map[y][x];
                const px = x * TILE;
                const py = y * TILE;

                switch (tile) {
                    case T.TILLED:
                        // 犁沟线
                        ctx.fillStyle = 'rgba(30,15,5,0.35)';
                        for (let i = 0; i < 4; i++) {
                            ctx.fillRect(px + 4, py + 8 + i * 10, TILE - 8, 2);
                        }
                        break;

                    case T.WATERED:
                        // 犁沟线 + 湿润光泽
                        ctx.fillStyle = 'rgba(30,15,5,0.35)';
                        for (let i = 0; i < 4; i++) {
                            ctx.fillRect(px + 4, py + 8 + i * 10, TILE - 8, 2);
                        }
                        ctx.fillStyle = 'rgba(100, 160, 230, 0.15)';
                        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
                        break;

                    case T.WATER:
                        this.renderWaterTile(ctx, px, py, x, y);
                        break;

                    case T.FLOWER:
                        this.renderFlower(ctx, px, py, x, y);
                        break;

                    case T.FENCE:
                        // 栅栏阴影
                        ctx.fillStyle = 'rgba(0,0,0,0.2)';
                        ctx.fillRect(px + 2, py + TILE - 3, TILE - 4, 3);
                        // 栅栏柱
                        ctx.fillStyle = '#6b4423';
                        ctx.fillRect(px + 4, py + 8, 4, TILE - 10);
                        ctx.fillRect(px + TILE - 8, py + 8, 4, TILE - 10);
                        ctx.fillRect(px + 4, py + 10, TILE - 8, 3);
                        ctx.fillRect(px + 4, py + 28, TILE - 8, 3);
                        break;

                    case T.STONE:
                        this.renderStone(ctx, px, py, x, y);
                        break;

                    case T.TREE:
                        this.renderTree(ctx, px, py, x, y);
                        break;

                    case T.ROCK_MINE:
                        this.renderRockMine(ctx, px, py, x, y);
                        break;

                    case T.FISH_SPOT:
                        // 钓鱼点 - 水面 + 鱼标志
                        const fishPhase = Date.now() / 800;
                        ctx.fillStyle = 'rgba(255,255,255,0.1)';
                        const fwx = Math.sin(fishPhase + x * 2) * 6;
                        ctx.fillRect(px + 10 + fwx, py + 15, 12, 2);
                        ctx.fillRect(px + 22 - fwx, py + 30, 10, 2);
                        // 鱼标志
                        ctx.font = '16px serif';
                        ctx.textAlign = 'center';
                        ctx.fillText('🐟', px + TILE/2, py + TILE/2 + 2);
                        break;

                    case T.WILD_CROP:
                        // 野生采集物
                        const forageEmojis = ['🍄', '🫐', '🌸', '🌿'];
                        const forageIdx = (x * 7 + y * 13) % 4;
                        ctx.font = '20px serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(forageEmojis[forageIdx], px + TILE/2, py + TILE/2 + 4);
                        break;

                    case T.NPC_HOUSE:
                        this.renderHouse(ctx, px, py, x, y, state, true);
                        break;

                    case T.HOUSE:
                        this.renderHouse(ctx, px, py, x, y, state, false);
                        break;
                }
            }
        }
    }

    /**
     * 渲染水面效果
     */
    renderWaterTile(ctx, px, py, x, y) {
        const t = Date.now() / 1000;

        // 基础水色渐变
        const waterGrad = ctx.createLinearGradient(px, py, px, py + TILE);
        waterGrad.addColorStop(0, 'rgba(80, 160, 230, 0.25)');
        waterGrad.addColorStop(0.5, 'rgba(60, 130, 210, 0.15)');
        waterGrad.addColorStop(1, 'rgba(30, 80, 160, 0.25)');
        ctx.fillStyle = waterGrad;
        ctx.fillRect(px, py, TILE, TILE);

        // 多层波浪动画
        const waveLayers = [
            { speed: 1.2, amp: 3, freq: 0.8, alpha: 0.08, width: 18, height: 2 },
            { speed: 0.8, amp: 5, freq: 0.5, alpha: 0.06, width: 14, height: 2 },
            { speed: 1.5, amp: 2, freq: 1.2, alpha: 0.05, width: 22, height: 1.5 }
        ];

        for (const layer of waveLayers) {
            ctx.fillStyle = `rgba(255, 255, 255, ${layer.alpha})`;
            const wx1 = Math.sin(t * layer.speed + x * layer.freq + y * 0.3) * layer.amp;
            const wx2 = Math.cos(t * layer.speed * 0.7 + x * 0.6 + y * layer.freq) * layer.amp;
            ctx.fillRect(px + 4 + wx1, py + 8, layer.width, layer.height);
            ctx.fillRect(px + 20 + wx2, py + 22, layer.width * 0.7, layer.height);
            ctx.fillRect(px + 8 - wx1 * 0.5, py + 34, layer.width * 0.8, layer.height);
        }

        // 水面反光效果
        const shimmerPhase = t * 2 + x * 1.3 + y * 0.7;
        const shimmerAlpha = Math.max(0, Math.sin(shimmerPhase) * 0.06);
        if (shimmerAlpha > 0.01) {
            ctx.fillStyle = `rgba(200, 230, 255, ${shimmerAlpha})`;
            ctx.beginPath();
            ctx.ellipse(px + TILE/2 + Math.sin(t + x) * 6, py + TILE/2 + Math.cos(t * 0.8 + y) * 4, 10, 4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // 岸边泡沫效果（检查相邻陆地）
        const neighbors = [
            { dx: 0, dy: -1, fx: px + 4, fy: py, fw: TILE - 8, fh: 4 },
            { dx: 0, dy: 1, fx: px + 4, fy: py + TILE - 4, fw: TILE - 8, fh: 4 },
            { dx: -1, dy: 0, fx: px, fy: py + 4, fw: 4, fh: TILE - 8 },
            { dx: 1, dy: 0, fx: px + TILE - 4, fy: py + 4, fw: 4, fh: TILE - 8 }
        ];

        for (const n of neighbors) {
            const nx = x + n.dx;
            const ny = y + n.dy;
            if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) {
                const neighborTile = window.state.map[ny][nx];
                if (neighborTile !== T.WATER && neighborTile !== T.FISH_SPOT) {
                    // 岸边泡沫
                    const foamPhase = t * 1.5 + nx * 2 + ny * 3;
                    const foamAlpha = 0.15 + Math.sin(foamPhase) * 0.08;
                    ctx.fillStyle = `rgba(255, 255, 255, ${foamAlpha})`;
                    // 绘制不规则泡沫点
                    for (let i = 0; i < 3; i++) {
                        const fx = n.fx + this.seededRandom(i, x + y, 10) * n.fw;
                        const fy = n.fy + this.seededRandom(i + 1, x + y, 10) * n.fh;
                        const fs = 2 + this.seededRandom(i + 2, x + y, 10) * 3;
                        ctx.beginPath();
                        ctx.arc(fx, fy, fs, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }
    }

    /**
     * 渲染树木（优化版）
     */
    renderTree(ctx, px, py, x, y) {
        const t = Date.now() / 1000;
        const seed = (x * 73 + y * 37) % 1000;
        const windStrength = 0.8 + Math.sin(t * 0.7 + x * 0.5) * 0.3;
        const sway = Math.sin(t * 1.2 + x * 0.8 + y * 0.3) * 2 * windStrength;

        // 树影
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(px + TILE/2 + sway * 0.3, py + TILE - 2, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 树干 - 带树皮纹理
        const trunkW = 10 + this.seededRandom(seed, 1, 1) * 4;
        const trunkX = px + TILE/2 - trunkW/2;
        ctx.fillStyle = '#4a3020';
        ctx.fillRect(trunkX, py + 22, trunkW, 26);

        // 树皮纹理线条
        ctx.strokeStyle = 'rgba(30, 15, 5, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const tx = trunkX + 2 + this.seededRandom(seed, i + 5, 2) * (trunkW - 4);
            ctx.beginPath();
            ctx.moveTo(tx, py + 24);
            ctx.lineTo(tx + Math.sin(i + seed) * 2, py + 46);
            ctx.stroke();
        }

        // 树干高光
        ctx.fillStyle = 'rgba(120, 80, 50, 0.2)';
        ctx.fillRect(trunkX + 1, py + 22, trunkW * 0.3, 26);

        // 树冠类型（基于种子）
        const treeType = Math.floor(this.seededRandom(seed, 0, 3) * 3); // 0: 圆形, 1: 椭圆形, 2: 松树形

        // 多层树冠 - 深色底层
        const crownColors = [
            { dark: '#1a5c10', mid: '#2d8a1e', light: '#4db83a' },
            { dark: '#1e6b14', mid: '#339e22', light: '#5acd45' },
            { dark: '#164a0e', mid: '#267a18', light: '#42a830' }
        ];
        const colors = crownColors[treeType];

        const crownBaseY = py + 20;
        const crownBaseX = px + TILE/2 + sway;

        // 底层大冠
        ctx.fillStyle = colors.dark;
        this.drawCrownLayer(ctx, crownBaseX, crownBaseY, 18, treeType, seed, 0);

        // 中层冠
        ctx.fillStyle = colors.mid;
        this.drawCrownLayer(ctx, crownBaseX - 2, crownBaseY - 4, 14, treeType, seed, 1);

        // 顶层亮冠
        ctx.fillStyle = colors.light;
        this.drawCrownLayer(ctx, crownBaseX + 1, crownBaseY - 8, 10, treeType, seed, 2);

        // 树叶高光点（模拟阳光照射）
        ctx.fillStyle = 'rgba(150, 230, 120, 0.3)';
        const highlightX = crownBaseX + Math.cos(t * 0.5 + seed) * 6;
        const highlightY = crownBaseY - 6 + Math.sin(t * 0.3 + seed) * 3;
        ctx.beginPath();
        ctx.arc(highlightX, highlightY, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * 绘制树冠层
     */
    drawCrownLayer(ctx, cx, cy, size, treeType, seed, layer) {
        if (treeType === 0) {
            // 圆形树冠
            const offset = layer * 3;
            ctx.beginPath();
            ctx.arc(cx, cy - offset, size, 0, Math.PI * 2);
            ctx.fill();
            // 附加小圆增加层次感
            ctx.beginPath();
            ctx.arc(cx - size * 0.5, cy - offset + 2, size * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx + size * 0.5, cy - offset + 2, size * 0.6, 0, Math.PI * 2);
            ctx.fill();
        } else if (treeType === 1) {
            // 椭圆形树冠
            ctx.beginPath();
            ctx.ellipse(cx, cy, size * 1.1, size * 0.8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cx - 4, cy - 3, size * 0.7, size * 0.6, -0.3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // 松树形（三角形层叠）
            const topY = cy - size * 1.2;
            ctx.beginPath();
            ctx.moveTo(cx, topY);
            ctx.lineTo(cx - size, cy + 4);
            ctx.lineTo(cx + size, cy + 4);
            ctx.closePath();
            ctx.fill();
            if (layer < 2) {
                ctx.beginPath();
                ctx.moveTo(cx, topY - 4);
                ctx.lineTo(cx - size * 0.7, cy - 4);
                ctx.lineTo(cx + size * 0.7, cy - 4);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    /**
     * 渲染石头（优化版）
     */
    renderStone(ctx, px, py, x, y) {
        const seed = (x * 53 + y * 29) % 1000;
        const cx = px + TILE/2;
        const cy = py + TILE/2 + 2;

        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(cx, py + TILE - 2, 14, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // 石头主体 - 不规则多边形
        const sides = 6 + Math.floor(this.seededRandom(seed, 1, 4) * 4);
        const radius = 14 + this.seededRandom(seed, 2, 5) * 4;

        // 阴影面（深色底层）
        ctx.fillStyle = '#5a5a5a';
        this.drawIrregularPolygon(ctx, cx + 1, cy + 1, radius, sides, 0.5, seed);
        ctx.fill();

        // 主体面
        ctx.fillStyle = '#7a7a7a';
        this.drawIrregularPolygon(ctx, cx, cy, radius, sides, 0.5, seed);
        ctx.fill();

        // 高光面（左上）
        ctx.fillStyle = '#9a9a9a';
        this.drawIrregularPolygon(ctx, cx - 2, cy - 2, radius * 0.6, Math.max(4, sides - 2), 0.4, seed + 100);
        ctx.fill();

        // 裂纹纹理
        ctx.strokeStyle = 'rgba(40, 40, 40, 0.3)';
        ctx.lineWidth = 1;
        const crackCount = 1 + Math.floor(this.seededRandom(seed, 3, 6) * 2);
        for (let i = 0; i < crackCount; i++) {
            const startAngle = this.seededRandom(seed, i + 10, 7) * Math.PI * 2;
            const startR = radius * (0.3 + this.seededRandom(seed, i + 20, 8) * 0.5);
            const sx = cx + Math.cos(startAngle) * startR;
            const sy = cy + Math.sin(startAngle) * startR;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + (this.seededRandom(seed, i + 30, 9) - 0.5) * 8, sy + (this.seededRandom(seed, i + 40, 10) - 0.5) * 6);
            ctx.stroke();
        }
    }

    /**
     * 渲染矿岩（优化版）
     */
    renderRockMine(ctx, px, py, x, y) {
        const t = Date.now() / 1000;
        const seed = (x * 67 + y * 41) % 1000;
        const cx = px + TILE/2;
        const cy = py + TILE/2 + 2;

        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(cx, py + TILE - 2, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 矿岩主体 - 更大更不规则
        const sides = 7 + Math.floor(this.seededRandom(seed, 1, 4) * 4);
        const radius = 17 + this.seededRandom(seed, 2, 5) * 4;

        // 深色底层
        ctx.fillStyle = '#4a4540';
        this.drawIrregularPolygon(ctx, cx + 1, cy + 1, radius, sides, 0.6, seed);
        ctx.fill();

        // 主色
        ctx.fillStyle = '#6a6058';
        this.drawIrregularPolygon(ctx, cx, cy, radius, sides, 0.6, seed);
        ctx.fill();

        // 高光面
        ctx.fillStyle = '#8a8078';
        this.drawIrregularPolygon(ctx, cx - 2, cy - 3, radius * 0.55, Math.max(4, sides - 2), 0.5, seed + 100);
        ctx.fill();

        // 矿石闪光点（多个）
        const sparkleCount = 2 + Math.floor(this.seededRandom(seed, 5, 11) * 3);
        for (let i = 0; i < sparkleCount; i++) {
            const sx = cx + (this.seededRandom(seed, i + 50, 12) - 0.5) * radius * 0.8;
            const sy = cy + (this.seededRandom(seed, i + 60, 13) - 0.5) * radius * 0.6 - 2;
            const sparklePhase = t * 2 + i * 1.5 + x * 0.5 + y * 0.3;
            const sparkleAlpha = Math.max(0, Math.sin(sparklePhase) * 0.5 + 0.5) * 0.6;
            const sparkleSize = 2 + Math.sin(sparklePhase * 1.5) * 1;

            ctx.fillStyle = `rgba(255, 215, 0, ${sparkleAlpha})`;
            ctx.beginPath();
            ctx.arc(sx, sy, sparkleSize, 0, Math.PI * 2);
            ctx.fill();

            // 闪光十字
            if (sparkleAlpha > 0.3) {
                ctx.strokeStyle = `rgba(255, 235, 150, ${sparkleAlpha * 0.5})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(sx - sparkleSize * 1.5, sy);
                ctx.lineTo(sx + sparkleSize * 1.5, sy);
                ctx.moveTo(sx, sy - sparkleSize * 1.5);
                ctx.lineTo(sx, sy + sparkleSize * 1.5);
                ctx.stroke();
            }
        }
    }

    /**
     * 渲染花朵（优化版）
     */
    renderFlower(ctx, px, py, x, y) {
        const t = Date.now() / 1000;
        const seed = (x * 43 + y * 71) % 1000;
        const flowerType = Math.floor(this.seededRandom(seed, 0, 14) * 4); // 4种花型
        const flowerColors = [
            ['#ff69b4', '#ff1493', '#ffb6c1'],
            ['#ffeb3b', '#ffd700', '#fff8a0'],
            ['#ff6347', '#ff4500', '#ffa07a'],
            ['#da70d6', '#ba55d3', '#e6b3ff']
        ];
        const colors = flowerColors[flowerType];
        const sway = Math.sin(t * 1.5 + x * 0.7 + y * 0.5) * 2;

        // 花茎 - 弯曲效果
        ctx.strokeStyle = '#2d7a1e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const stemBaseX = px + TILE/2;
        const stemBaseY = py + TILE - 4;
        const stemTopX = stemBaseX + sway;
        const stemTopY = stemBaseY - 18;
        ctx.moveTo(stemBaseX, stemBaseY);
        ctx.quadraticCurveTo(stemBaseX + sway * 0.5, stemBaseY - 9, stemTopX, stemTopY);
        ctx.stroke();

        // 叶子
        ctx.fillStyle = '#3d9b2e';
        const leafY = stemBaseY - 8;
        ctx.beginPath();
        ctx.ellipse(stemBaseX - 4 + sway * 0.3, leafY, 5, 2.5, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(stemBaseX + 4 + sway * 0.3, leafY - 3, 4, 2, 0.5, 0, Math.PI * 2);
        ctx.fill();

        // 花朵绘制
        const fx = stemTopX;
        const fy = stemTopY;

        if (flowerType === 0) {
            // 雏菊型 - 多层花瓣
            this.drawDaisyFlower(ctx, fx, fy, colors, seed, t);
        } else if (flowerType === 1) {
            // 郁金香型
            this.drawTulipFlower(ctx, fx, fy, colors, seed);
        } else if (flowerType === 2) {
            // 向日葵型
            this.drawSunflower(ctx, fx, fy, colors, seed);
        } else {
            // 薰衣草/穗状型
            this.drawLavenderFlower(ctx, fx, fy, colors, seed);
        }
    }

    drawDaisyFlower(ctx, x, y, colors, seed, t) {
        const petalCount = 6 + Math.floor(this.seededRandom(seed, 1, 15) * 3);
        const petalLen = 7 + this.seededRandom(seed, 2, 16) * 3;

        // 花瓣
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2 + t * 0.2;
            const grad = ctx.createRadialGradient(x, y, 0, x + Math.cos(angle) * petalLen, y + Math.sin(angle) * petalLen, petalLen);
            grad.addColorStop(0, colors[0]);
            grad.addColorStop(1, colors[1]);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(
                x + Math.cos(angle) * petalLen * 0.6,
                y + Math.sin(angle) * petalLen * 0.6,
                petalLen * 0.4, 2.5, angle, 0, Math.PI * 2
            );
            ctx.fill();
        }

        // 花心
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff8c00';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    drawTulipFlower(ctx, x, y, colors, seed) {
        // 郁金香杯状花瓣
        const grad = ctx.createLinearGradient(x, y - 8, x, y + 2);
        grad.addColorStop(0, colors[2]);
        grad.addColorStop(0.5, colors[0]);
        grad.addColorStop(1, colors[1]);
        ctx.fillStyle = grad;

        // 左侧花瓣
        ctx.beginPath();
        ctx.moveTo(x, y + 3);
        ctx.quadraticCurveTo(x - 7, y - 2, x - 5, y - 8);
        ctx.quadraticCurveTo(x - 2, y - 6, x, y - 4);
        ctx.fill();

        // 右侧花瓣
        ctx.beginPath();
        ctx.moveTo(x, y + 3);
        ctx.quadraticCurveTo(x + 7, y - 2, x + 5, y - 8);
        ctx.quadraticCurveTo(x + 2, y - 6, x, y - 4);
        ctx.fill();

        // 中间花瓣
        ctx.beginPath();
        ctx.moveTo(x, y + 3);
        ctx.quadraticCurveTo(x - 3, y - 6, x, y - 10);
        ctx.quadraticCurveTo(x + 3, y - 6, x, y + 3);
        ctx.fill();
    }

    drawSunflower(ctx, x, y, colors, seed) {
        // 向日葵大盘
        const petalCount = 8;
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            ctx.fillStyle = colors[0];
            ctx.beginPath();
            ctx.ellipse(
                x + Math.cos(angle) * 5,
                y + Math.sin(angle) * 5,
                5, 2.5, angle, 0, Math.PI * 2
            );
            ctx.fill();
        }

        // 花盘
        ctx.fillStyle = '#5a3a1a';
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // 花盘纹理
        ctx.fillStyle = '#3a2010';
        for (let i = 0; i < 5; i++) {
            const ax = x + (this.seededRandom(seed, i + 70, 17) - 0.5) * 6;
            const ay = y + (this.seededRandom(seed, i + 80, 18) - 0.5) * 6;
            ctx.beginPath();
            ctx.arc(ax, ay, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawLavenderFlower(ctx, x, y, colors, seed) {
        // 穗状小花
        const spikeHeight = 12;
        const grad = ctx.createLinearGradient(x, y - spikeHeight, x, y);
        grad.addColorStop(0, colors[2]);
        grad.addColorStop(1, colors[1]);
        ctx.fillStyle = grad;

        for (let i = 0; i < 5; i++) {
            const ly = y - i * 2.5;
            const lx = x + Math.sin(i * 1.5) * 1.5;
            ctx.beginPath();
            ctx.ellipse(lx, ly, 2.5, 1.8, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * 渲染房屋（优化版）
     */
    renderHouse(ctx, px, py, x, y, state, isNpcHouse) {
        const t = Date.now() / 1000;
        const hour = state.timeOfDay || (state.time / 60);
        const isNight = hour >= 19 || hour < 6;

        // 房屋主体
        ctx.fillStyle = isNpcHouse ? '#b08050' : '#c49558';
        ctx.fillRect(px + 4, py + 14, TILE - 8, TILE - 16);

        // 墙壁纹理（木板线条）
        ctx.strokeStyle = 'rgba(80, 50, 20, 0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const ly = py + 18 + i * 10;
            ctx.beginPath();
            ctx.moveTo(px + 4, ly);
            ctx.lineTo(px + TILE - 4, ly);
            ctx.stroke();
        }

        // 屋顶瓦片纹理
        ctx.fillStyle = isNpcHouse ? '#8b4513' : '#a0522d';
        ctx.beginPath();
        ctx.moveTo(px + 1, py + 16);
        ctx.lineTo(px + TILE/2, py + 2);
        ctx.lineTo(px + TILE - 1, py + 16);
        ctx.closePath();
        ctx.fill();

        // 瓦片线条
        ctx.strokeStyle = 'rgba(60, 30, 10, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const ry = py + 6 + i * 4;
            const rw = (ry - (py + 2)) / (14) * (TILE - 2);
            ctx.beginPath();
            ctx.moveTo(px + TILE/2 - rw/2, ry);
            ctx.lineTo(px + TILE/2 + rw/2, ry);
            ctx.stroke();
        }

        // 烟囱
        const chimneyX = px + TILE * 0.7;
        const chimneyY = py + 8;
        ctx.fillStyle = '#6a6a6a';
        ctx.fillRect(chimneyX, chimneyY, 6, 10);
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(chimneyX - 1, chimneyY - 2, 8, 3);

        // 烟雾粒子
        if (isNight || this.seededRandom(x, y, 20) > 0.3) {
            for (let i = 0; i < 3; i++) {
                const smokeAge = (t * 0.8 + i * 0.7) % 3;
                const smokeX = chimneyX + 3 + Math.sin(t * 2 + i) * 3 * smokeAge;
                const smokeY = chimneyY - 3 - smokeAge * 8;
                const smokeSize = 2 + smokeAge * 3;
                const smokeAlpha = 0.3 - smokeAge * 0.1;
                ctx.fillStyle = `rgba(200, 200, 200, ${Math.max(0, smokeAlpha)})`;
                ctx.beginPath();
                ctx.arc(smokeX, smokeY, smokeSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 窗户
        const windowColor = isNight ? '#ffd700' : '#87ceeb';
        const windowGlow = isNight ? 'rgba(255, 215, 0, 0.3)' : null;

        // 左窗
        this.drawWindow(ctx, px + 10, py + 20, windowColor, windowGlow);
        // 右窗
        this.drawWindow(ctx, px + 26, py + 20, windowColor, windowGlow);

        // 门
        ctx.fillStyle = '#5c3d1e';
        ctx.fillRect(px + 18, py + 30, 12, 16);
        // 门框
        ctx.strokeStyle = '#3a2010';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 18, py + 30, 12, 16);
        // 门把手
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(px + 27, py + 38, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawWindow(ctx, x, y, color, glowColor) {
        if (glowColor) {
            ctx.fillStyle = glowColor;
            ctx.fillRect(x - 2, y - 2, 14, 14);
        }
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 10, 10);
        // 窗框十字
        ctx.strokeStyle = '#4a3020';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 5, y);
        ctx.lineTo(x + 5, y + 10);
        ctx.moveTo(x, y + 5);
        ctx.lineTo(x + 10, y + 5);
        ctx.stroke();
        // 窗框边框
        ctx.strokeRect(x, y, 10, 10);
    }

    /**
     * 渲染作物
     */
    renderCrops(ctx, state) {
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
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.ellipse(px + TILE/2, py + TILE - 2, 10, 4, 0, 0, Math.PI * 2);
            ctx.fill();

            // 判断作物状态：正常、枯萎
            const isWithered = crop.water <= 0 && crop.growth < 100;

            if (isWithered) {
                this.drawWitheredCrop(ctx, px, py);
            } else if (crop.growth < 25) {
                this.drawSeedling(ctx, px, py, x, y);
            } else if (crop.growth < 50) {
                this.drawGrowingCrop(ctx, px, py, x, y, crop.growth);
            } else if (crop.growth < 100) {
                this.drawMatureCrop(ctx, px, py, x, y, cropData, crop.growth, false);
            } else {
                this.drawMatureCrop(ctx, px, py, x, y, cropData, crop.growth, true);
            }

            // 水分指示器
            if (crop.water < 30) {
                ctx.fillStyle = 'rgba(255, 80, 80, 0.7)';
                ctx.fillRect(px + 4, py + 2, TILE - 8, 3);
            }
        }
    }

    /**
     * 绘制幼苗期作物
     */
    drawSeedling(ctx, px, py, x, y) {
        const t = Date.now() / 1000;
        const sway = Math.sin(t * 1.5 + x * 0.8 + y * 0.5) * 1;

        // 土壤小土堆
        ctx.fillStyle = '#6b4423';
        ctx.beginPath();
        ctx.ellipse(px + TILE/2, py + TILE - 4, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // 小绿芽 - 两片子叶
        ctx.strokeStyle = '#4db83a';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px + TILE/2, py + TILE - 6);
        ctx.quadraticCurveTo(px + TILE/2 + sway, py + TILE - 12, px + TILE/2 + sway * 1.5 - 3, py + TILE - 15);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(px + TILE/2, py + TILE - 6);
        ctx.quadraticCurveTo(px + TILE/2 - sway, py + TILE - 11, px + TILE/2 - sway * 1.5 + 3, py + TILE - 14);
        ctx.stroke();

        // 子叶小叶片
        ctx.fillStyle = '#5acd45';
        ctx.beginPath();
        ctx.ellipse(px + TILE/2 + sway * 1.5 - 3, py + TILE - 15, 3, 2, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px + TILE/2 - sway * 1.5 + 3, py + TILE - 14, 3, 2, 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * 绘制生长期作物
     */
    drawGrowingCrop(ctx, px, py, x, y, growth) {
        const t = Date.now() / 1000;
        const progress = growth / 50; // 0~1 在生长期内
        const sway = Math.sin(t * 1.2 + x * 0.7 + y * 0.4) * 1.5;
        const stemHeight = 12 + progress * 10;

        // 主茎
        ctx.strokeStyle = '#3d9b2e';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px + TILE/2, py + TILE - 4);
        ctx.quadraticCurveTo(px + TILE/2 + sway * 0.5, py + TILE - 4 - stemHeight * 0.5, px + TILE/2 + sway, py + TILE - 4 - stemHeight);
        ctx.stroke();

        // 叶子展开
        const leafCount = 2 + Math.floor(progress * 2);
        ctx.fillStyle = '#4db83a';
        for (let i = 0; i < leafCount; i++) {
            const leafY = py + TILE - 8 - i * 6;
            const leafSway = sway * (0.5 + i * 0.2);
            const side = i % 2 === 0 ? -1 : 1;
            const leafSize = 4 + progress * 3;

            ctx.beginPath();
            ctx.ellipse(
                px + TILE/2 + side * (5 + progress * 3) + leafSway,
                leafY,
                leafSize, leafSize * 0.5,
                side * 0.4, 0, Math.PI * 2
            );
            ctx.fill();
        }

        // 茎顶小芽
        ctx.fillStyle = '#5acd45';
        ctx.beginPath();
        ctx.ellipse(px + TILE/2 + sway, py + TILE - 4 - stemHeight, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * 绘制成熟期作物
     */
    drawMatureCrop(ctx, px, py, x, y, cropData, growth, isFullyMature) {
        const t = Date.now() / 1000;
        const sway = Math.sin(t * 1 + x * 0.6 + y * 0.3) * 1.5;
        const pulse = isFullyMature ? Math.sin(t * 2) * 0.03 + 1 : 1;

        // 主茎
        ctx.strokeStyle = '#3d9b2e';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px + TILE/2, py + TILE - 4);
        ctx.quadraticCurveTo(px + TILE/2 + sway * 0.3, py + TILE - 14, px + TILE/2 + sway, py + TILE - 24);
        ctx.stroke();

        // 成熟叶子
        ctx.fillStyle = '#4db83a';
        const leafPositions = [
            { y: py + TILE - 10, side: -1, size: 7 },
            { y: py + TILE - 16, side: 1, size: 8 },
            { y: py + TILE - 20, side: -1, size: 6 }
        ];
        for (const leaf of leafPositions) {
            ctx.beginPath();
            ctx.ellipse(
                px + TILE/2 + leaf.side * 8 + sway * 0.3,
                leaf.y,
                leaf.size, leaf.size * 0.5,
                leaf.side * 0.4, 0, Math.PI * 2
            );
            ctx.fill();
        }

        // 根据作物类型绘制不同果实/花朵
        const cropType = (cropData.cropId || cropData.id || 0) % 5;
        const fruitX = px + TILE/2 + sway;
        const fruitY = py + TILE - 26;

        if (cropType === 0 || cropType === 1) {
            // 圆形果实（番茄、浆果类）
            this.drawRoundFruit(ctx, fruitX, fruitY, cropData, pulse, isFullyMature);
        } else if (cropType === 2) {
            // 根茎类（胡萝卜、萝卜）
            this.drawRootVegetable(ctx, px + TILE/2, py + TILE - 4, cropData, pulse);
        } else if (cropType === 3) {
            // 花朵类
            this.drawCropFlower(ctx, fruitX, fruitY, cropData, pulse);
        } else {
            // 谷物/穗状
            this.drawGrainCrop(ctx, fruitX, fruitY, cropData, pulse, sway);
        }
    }

    drawRoundFruit(ctx, x, y, cropData, pulse, isFullyMature) {
        const fruitColors = {
            'tomato': ['#ff6347', '#ff4500', '#ffa07a'],
            'berry': ['#9370db', '#8a2be2', '#dda0dd'],
            'default': ['#ff8c00', '#ff6347', '#ffd700']
        };
        const colorSet = fruitColors[cropData.type] || fruitColors['default'];

        // 果实
        const size = (isFullyMature ? 7 : 5) * pulse;
        const grad = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, size);
        grad.addColorStop(0, colorSet[2]);
        grad.addColorStop(0.5, colorSet[0]);
        grad.addColorStop(1, colorSet[1]);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        // 高光
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(x - 2, y - 2, size * 0.3, 0, Math.PI * 2);
        ctx.fill();

        if (isFullyMature) {
            // 成熟闪光
            const t = Date.now() / 1000;
            const sparkleAlpha = Math.max(0, Math.sin(t * 3) * 0.3);
            ctx.fillStyle = `rgba(255, 255, 200, ${sparkleAlpha})`;
            ctx.beginPath();
            ctx.arc(x + 3, y - 3, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawRootVegetable(ctx, x, y, cropData, pulse) {
        // 露出地面的叶子
        ctx.fillStyle = '#4db83a';
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + 0.5;
            ctx.beginPath();
            ctx.ellipse(
                x + Math.cos(angle) * 6,
                y - 6 + Math.sin(angle) * 3,
                5, 2.5, angle, 0, Math.PI * 2
            );
            ctx.fill();
        }

        // 根部小露出
        const rootColors = ['#ff8c00', '#ffa500', '#ff6347'];
        const rc = rootColors[(cropData.cropId || 0) % 3];
        ctx.fillStyle = rc;
        ctx.beginPath();
        ctx.arc(x, y - 3, 4 * pulse, 0, Math.PI * 2);
        ctx.fill();
    }

    drawCropFlower(ctx, x, y, cropData, pulse) {
        const petalCount = 5;
        const petalLen = 5 * pulse;
        const flowerColor = cropData.flowerColor || '#ff69b4';
        const centerColor = cropData.centerColor || '#ffd700';

        // 花瓣
        ctx.fillStyle = flowerColor;
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(
                x + Math.cos(angle) * petalLen * 0.6,
                y + Math.sin(angle) * petalLen * 0.6,
                petalLen * 0.5, 2, angle, 0, Math.PI * 2
            );
            ctx.fill();
        }

        // 花心
        ctx.fillStyle = centerColor;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawGrainCrop(ctx, x, y, cropData, pulse, sway) {
        // 麦穗/谷穗
        const grainColors = ['#ffd700', '#daa520', '#f0e68c'];
        const gc = grainColors[(cropData.cropId || 0) % 3];

        ctx.fillStyle = gc;
        for (let i = 0; i < 6; i++) {
            const gy = y + i * 2.5;
            const gx = x + Math.sin(i * 0.8) * 2 + sway * 0.2;
            ctx.beginPath();
            ctx.ellipse(gx, gy, 3 * pulse, 1.8, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // 麦芒
        ctx.strokeStyle = '#daa520';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + sway * 0.2, y);
        ctx.lineTo(x + sway * 0.3, y - 4);
        ctx.stroke();
    }

    /**
     * 绘制枯萎作物
     */
    drawWitheredCrop(ctx, px, py) {
        const t = Date.now() / 1000;
        const sway = Math.sin(t * 0.5) * 1;

        // 枯萎的茎 - 褐色弯曲
        ctx.strokeStyle = '#8b7355';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px + TILE/2, py + TILE - 4);
        ctx.quadraticCurveTo(px + TILE/2 + sway, py + TILE - 12, px + TILE/2 + sway * 2, py + TILE - 16);
        ctx.stroke();

        // 枯萎下垂的叶子
        ctx.fillStyle = '#a08060';
        ctx.beginPath();
        ctx.ellipse(px + TILE/2 - 5, py + TILE - 10, 4, 2, -0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px + TILE/2 + 5, py + TILE - 8, 3, 1.5, 0.8, 0, Math.PI * 2);
        ctx.fill();

        // 枯叶尖端
        ctx.fillStyle = '#6b5344';
        ctx.beginPath();
        ctx.ellipse(px + TILE/2 + sway * 2, py + TILE - 16, 2, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * 渲染 NPC
     */
    renderNPCs(ctx, state) {
        for (const npc of state.npcs) {
            const px = npc.x;
            const py = npc.y;

            // 只渲染屏幕内的NPC
            if (px < state.cameraX - TILE || px > state.cameraX + this.screenW + TILE ||
                py < state.cameraY - TILE || py > state.cameraY + this.screenH + TILE) continue;

            // NPC 阴影
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.ellipse(px + TILE/2, py + TILE - 2, 14, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            // NPC 身体
            ctx.fillStyle = '#4a90d9';
            ctx.fillRect(px + 12, py + 10, 24, 28);

            // NPC 头
            ctx.fillStyle = '#ffd5a0';
            ctx.fillRect(px + 16, py + 4, 16, 14);

            // NPC emoji
            ctx.font = '18px serif';
            ctx.textAlign = 'center';
            ctx.fillText(npc.emoji, px + TILE/2, py - 4);

            // NPC 名字
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText(npc.name, px + TILE/2, py - 14);
            ctx.fillText(npc.name, px + TILE/2, py - 14);
        }
    }

    /**
     * 渲染玩家角色
     */
    renderPlayer(ctx, state) {
        const px = state.playerX;
        const py = state.playerY;
        const dir = state.playerDir || 0; // 0=down 1=up 2=left 3=right
        const moving = state.playerMoving;
        const now = Date.now();

        // 动画时间
        const walkCycle = moving ? state.moveTimer * 10 : 0;
        const sinWalk = Math.sin(walkCycle);
        const cosWalk = Math.cos(walkCycle);

        // 动态阴影 (根据太阳角度)
        const shadowOffsetX = Math.cos(this.sunAngle) * 8;
        const shadowOffsetY = Math.sin(this.sunAngle) * 4 + 4;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(px + TILE/2 + shadowOffsetX, py + TILE - 2 + shadowOffsetY, 16, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // 角色本体
        const dirNames = ['Down', 'Up', 'Left', 'Right'];
        const dirName = dirNames[dir] || 'Down';
        const animType = moving ? 'Walk' : 'Idle';
        const sheetKey = `char${animType}${dirName}`;
        const sheet = AssetsLoader.assets[sheetKey];

        if (sheet) {
            const frameH = sheet.height;
            const frameW = sheet.width / Math.max(1, Math.round(sheet.width / Math.max(1, frameH)));
            const totalFrames = Math.round(sheet.width / Math.max(1, frameW));

            let frame;
            if (moving) {
                frame = Math.floor(state.moveTimer * 8) % totalFrames;
            } else {
                frame = 0;
            }

            const scale = TILE / Math.max(frameW, frameH);
            const drawW = frameW * scale;
            const drawH = frameH * scale;
            const drawX = px + (TILE - drawW) / 2;
            const drawY = py + TILE - drawH;

            ctx.drawImage(sheet, frame * frameW, 0, frameW, frameH, drawX, drawY, drawW, drawH);
        } else {
            // === 精致像素风角色绘制 (Fallback) ===
            const cx = px + TILE / 2;
            const cy = py + TILE / 2 + 4;
            const facingLeft = dir === 2;
            const facingRight = dir === 3;
            const facingUp = dir === 1;
            const facingDown = dir === 0;

            // 身体颜色根据方向微调
            const bodyColors = {
                front: '#e74c3c', // 下
                back:  '#c0392b', // 上 (稍暗)
                side:  '#d35400'  // 左右
            };
            let bodyColor = bodyColors.front;
            if (facingUp) bodyColor = bodyColors.back;
            if (facingLeft || facingRight) bodyColor = bodyColors.side;

            // 摆动幅度与移动相关
            const limbSwing = moving ? sinWalk * 6 : 0;
            const bobY = moving ? Math.abs(sinWalk) * 2 : 0;

            // 腿部 (在身体下方绘制)
            const legW = 6;
            const legH = 10;
            const legY = cy + 10 - bobY;
            ctx.fillStyle = '#2c3e50'; // 裤子颜色

            if (facingDown || facingUp) {
                // 前后视角：两条腿分开
                const leftLegX = cx - 6 + (moving ? sinWalk * 3 : 0);
                const rightLegX = cx + 6 - (moving ? sinWalk * 3 : 0);
                this.drawRoundRect(ctx, leftLegX - legW/2, legY, legW, legH, 2);
                this.drawRoundRect(ctx, rightLegX - legW/2, legY, legW, legH, 2);
            } else {
                // 左右视角：一条腿在前一条在后
                const frontLegX = cx + (facingRight ? 4 : -4) + limbSwing;
                const backLegX = cx + (facingRight ? -2 : 2) - limbSwing;
                this.drawRoundRect(ctx, backLegX - legW/2, legY + 1, legW, legH, 2);
                this.drawRoundRect(ctx, frontLegX - legW/2, legY - 1, legW, legH, 2);
            }

            // 身体 (圆角矩形)
            const bodyW = 20;
            const bodyH = 18;
            const bodyY = cy - 6 - bobY;
            ctx.fillStyle = bodyColor;
            this.drawRoundRect(ctx, cx - bodyW/2, bodyY, bodyW, bodyH, 4);
            // 衣服细节：中间一条线
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(cx - 1, bodyY + 3, 2, bodyH - 6);

            // 手臂
            const armW = 5;
            const armH = 12;
            const armY = bodyY + 2;
            ctx.fillStyle = '#f5cba7'; // 肤色

            if (facingDown || facingUp) {
                const leftArmX = cx - 12 - (moving ? sinWalk * 2 : 0);
                const rightArmX = cx + 12 + (moving ? sinWalk * 2 : 0);
                this.drawRoundRect(ctx, leftArmX - armW/2, armY, armW, armH, 2);
                this.drawRoundRect(ctx, rightArmX - armW/2, armY, armW, armH, 2);
            } else {
                // 左右视角：一只手臂在前，一只在后
                const frontArmX = cx + (facingRight ? 12 : -12) + limbSwing * 0.8;
                const backArmX = cx + (facingRight ? -8 : 8) - limbSwing * 0.5;
                this.drawRoundRect(ctx, backArmX - armW/2, armY + 1, armW, armH, 2);
                this.drawRoundRect(ctx, frontArmX - armW/2, armY - 1, armW, armH, 2);
            }

            // 头部
            const headSize = 14;
            const headY = bodyY - 10 - bobY;
            ctx.fillStyle = '#f5cba7'; // 肤色
            ctx.beginPath();
            ctx.arc(cx, headY, headSize, 0, Math.PI * 2);
            ctx.fill();

            // 头发
            ctx.fillStyle = '#5d4037'; // 深棕色头发
            if (facingDown) {
                // 前面头发：刘海
                ctx.beginPath();
                ctx.arc(cx, headY - 2, headSize + 2, Math.PI, 0);
                ctx.fill();
                // 两侧
                ctx.fillRect(cx - headSize - 2, headY - 4, 4, 10);
                ctx.fillRect(cx + headSize - 2, headY - 4, 4, 10);
            } else if (facingUp) {
                // 后面：只有头顶和两侧一点点
                ctx.beginPath();
                ctx.arc(cx, headY - 4, headSize + 1, Math.PI, 0);
                ctx.fill();
            } else if (facingLeft) {
                // 左侧：头发偏左
                ctx.beginPath();
                ctx.arc(cx - 2, headY - 2, headSize + 2, Math.PI * 0.7, Math.PI * 1.9);
                ctx.fill();
                ctx.fillRect(cx - headSize - 2, headY - 6, 6, 14);
            } else if (facingRight) {
                // 右侧：头发偏右
                ctx.beginPath();
                ctx.arc(cx + 2, headY - 2, headSize + 2, Math.PI * 0.1, Math.PI * 1.3);
                ctx.fill();
                ctx.fillRect(cx + headSize - 4, headY - 6, 6, 14);
            }

            // 眼睛 (小黑点，有眨眼动画)
            if (!facingUp) {
                const blink = (now % 3000) < 150; // 每3秒眨眼150ms
                if (!blink) {
                    ctx.fillStyle = '#1a1a1a';
                    if (facingDown) {
                        ctx.beginPath();
                        ctx.arc(cx - 5, headY + 1, 2, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.beginPath();
                        ctx.arc(cx + 5, headY + 1, 2, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (facingLeft) {
                        ctx.beginPath();
                        ctx.arc(cx - 6, headY + 1, 2, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (facingRight) {
                        ctx.beginPath();
                        ctx.arc(cx + 6, headY + 1, 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else {
                    // 闭眼：一条短线
                    ctx.strokeStyle = '#1a1a1a';
                    ctx.lineWidth = 1.5;
                    if (facingDown) {
                        ctx.beginPath();
                        ctx.moveTo(cx - 7, headY + 1);
                        ctx.lineTo(cx - 3, headY + 1);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(cx + 3, headY + 1);
                        ctx.lineTo(cx + 7, headY + 1);
                        ctx.stroke();
                    } else if (facingLeft) {
                        ctx.beginPath();
                        ctx.moveTo(cx - 8, headY + 1);
                        ctx.lineTo(cx - 4, headY + 1);
                        ctx.stroke();
                    } else if (facingRight) {
                        ctx.beginPath();
                        ctx.moveTo(cx + 4, headY + 1);
                        ctx.lineTo(cx + 8, headY + 1);
                        ctx.stroke();
                    }
                }
            }
        }

        // === 工具视觉表现 ===
        const toolEmojis = ['⛏️', '🚿', '🌱', '🧺', '🗑️'];
        const toolEmoji = toolEmojis[state.currentTool] || '';
        if (toolEmoji) {
            // 工具位置根据方向和行走动画微调
            let tx = px + TILE / 2;
            let ty = py + TILE / 2;
            let toolOffsetX = 0;
            let toolOffsetY = 0;

            if (dir === 0) { // 下
                toolOffsetX = 14;
                toolOffsetY = 4;
            } else if (dir === 1) { // 上
                toolOffsetX = -14;
                toolOffsetY = 4;
            } else if (dir === 2) { // 左
                toolOffsetX = -16;
                toolOffsetY = 2;
            } else if (dir === 3) { // 右
                toolOffsetX = 16;
                toolOffsetY = 2;
            }

            // 行走时工具轻微摆动
            if (moving) {
                toolOffsetY += sinWalk * 2;
            }

            // 使用工具时的简单挥动动画 (interact 后 300ms 内)
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
            ctx.font = '14px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(toolEmoji, 0, 0);
            ctx.restore();
        }

        // === 玩家名字标签 ===
        const nameText = state.playerName || '';
        if (nameText) {
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const textMetrics = ctx.measureText(nameText);
            const textW = textMetrics.width;
            const padX = 6;
            const padY = 3;
            const nameX = px + TILE / 2;
            const nameY = py - 14;

            // 半透明白色底框
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            this.drawRoundRect(ctx, nameX - textW/2 - padX, nameY - 12 - padY, textW + padX*2, 14 + padY*2, 6);

            // 名字文字 (深色，更清晰)
            ctx.fillStyle = '#2c3e50';
            ctx.fillText(nameText, nameX, nameY);
        }
    }

    /**
     * 辅助：绘制圆角矩形
     */
    drawRoundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * 渲染粒子效果
     */
    renderParticles(ctx, state) {
        for (const p of state.particles) {
            ctx.fillStyle = p.color || '#fff';
            ctx.globalAlpha = p.life;
            ctx.font = `${p.size}px serif`;
            ctx.textAlign = 'center';
            ctx.fillText(p.emoji || '•', p.x, p.y);
        }
        ctx.globalAlpha = 1;
    }

    /**
     * 渲染浮动文字
     */
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

    /**
     * 渲染钓鱼进度条
     */
    renderFishingBar(ctx, state) {
        if (!state.fishing) return;

        const barWidth = 300;
        const barHeight = 30;
        const barX = (this.screenW - barWidth) / 2;
        const barY = this.screenH - 120;

        // 背景
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(barX - 10, barY - 30, barWidth + 20, barHeight + 50);

        // 标题
        ctx.fillStyle = '#ffd93d';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎣 钓鱼！按空格停下', this.screenW / 2, barY - 10);

        // 进度条背景
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // 目标区域 (绿色)
        const targetStart = state.fishTarget - state.fishTargetSize / 2;
        const targetEnd = state.fishTarget + state.fishTargetSize / 2;
        ctx.fillStyle = 'rgba(76, 175, 80, 0.6)';
        ctx.fillRect(barX + targetStart * barWidth, barY, state.fishTargetSize * barWidth, barHeight);

        // 移动指示器
        const indicatorX = barX + state.fishBarPos * barWidth;
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(indicatorX - 3, barY - 4, 6, barHeight + 8);

        // 边框
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // 剩余时间
        const remaining = Math.max(0, 10 - state.fishProgress);
        ctx.fillStyle = '#aaa';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${remaining.toFixed(1)}s`, this.screenW / 2, barY + barHeight + 16);
    }

    /**
     * 全局光影效果
     */
    renderGlobalLighting(ctx, state, sc) {
        const hour = state.timeOfDay || (state.time / 60);
        let overlayColor = null;
        let overlayAlpha = 0;
        let warmth = 0;

        if (hour >= 20 || hour < 5) {
            overlayColor = '#0a0a2e';
            overlayAlpha = 0.55;
        } else if (hour >= 18) {
            overlayColor = '#ff6b35';
            overlayAlpha = (hour - 18) / 2 * 0.35;
            warmth = (hour - 18) / 2;
        } else if (hour < 7) {
            overlayColor = '#87ceeb';
            overlayAlpha = (7 - hour) / 2 * 0.2;
        } else if (hour >= 12 && hour < 15) {
            overlayColor = '#fff8e7';
            overlayAlpha = 0.08;
        }

        if (overlayColor) {
            ctx.fillStyle = overlayColor;
            ctx.globalAlpha = overlayAlpha;
            ctx.fillRect(0, 0, this.screenW, this.screenH);
            ctx.globalAlpha = 1;
        }

        // 傍晚暖色覆盖
        if (warmth > 0) {
            ctx.fillStyle = '#ffaa44';
            ctx.globalAlpha = warmth * 0.15;
            ctx.fillRect(0, 0, this.screenW, this.screenH);
            ctx.globalAlpha = 1;
        }

        // 夜晚星星
        if (hour >= 19 || hour < 6) {
            const starAlpha = hour >= 20 || hour < 5 ? 1 : 0.5;
            const twinklePhase = Date.now() / 1000;
            for (const star of this.stars) {
                const sx = star.nx * this.screenW;
                const sy = star.ny * this.screenH;
                const twinkle = Math.sin(twinklePhase + star.twinkle) * 0.3 + 0.7;
                ctx.fillStyle = `rgba(255,255,255,${starAlpha * twinkle})`;
                ctx.fillRect(sx, sy, star.size, star.size);
            }
        }

        // 阳光射线效果 (清晨和傍晚)
        if ((hour >= 6 && hour < 9) || (hour >= 16 && hour < 19)) {
            const sunIntensity = hour < 9 ? (9 - hour) / 3 : (hour - 16) / 3;
            const grad = ctx.createLinearGradient(0, 0, this.screenW, this.screenH);
            grad.addColorStop(0, `rgba(255,220,150,${sunIntensity * 0.08})`);
            grad.addColorStop(0.5, 'rgba(255,220,150,0)');
            grad.addColorStop(1, 'rgba(255,220,150,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.screenW, this.screenH);
        }

        // 暗角效果 (Vignette)
        const vignetteGrad = ctx.createRadialGradient(
            this.screenW / 2, this.screenH / 2, this.screenH * 0.3,
            this.screenW / 2, this.screenH / 2, this.screenH * 0.8
        );
        vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, this.screenW, this.screenH);
    }

    /**
     * 渲染小地图
     */
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

        // 小地图只渲染已生成的区块 (优化)
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
                        case T.GRASS:     color = sc.grass; break;
                        case T.DIRT:      color = '#8b6d3f'; break;
                        case T.TILLED:    color = '#6b4423'; break;
                        case T.WATERED:   color = '#5a3a1a'; break;
                        case T.PATH:      color = '#c4a96a'; break;
                        case T.FENCE:     color = '#8b6914'; break;
                        case T.WATER:     color = '#3a7bd5'; break;
                        case T.FLOWER:    color = '#ff69b4'; break;
                        case T.HOUSE:     color = '#d4a76a'; break;
                        case T.DOOR:      color = '#8b4513'; break;
                        case T.STONE:     color = '#888'; break;
                        case T.TREE:      color = '#2d5a1e'; break;
                        case T.ROCK_MINE: color = '#6a6058'; break;
                        case T.FISH_SPOT: color = '#4a9bd5'; break;
                        case T.WILD_CROP: color = '#7bc67b'; break;
                        case T.NPC_HOUSE: color = '#b08050'; break;
                        default:          color = '#4a6741';
                    }
                    ctx.fillStyle = color;
                    ctx.fillRect(mmX + x * scaleX, mmY + y * scaleY, Math.max(scaleX, 1), Math.max(scaleY, 1));
                }
            }
        }

        // 未生成区域显示为暗色
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(mmX, mmY, mmSize, mmSize);

        // 重新绘制已生成区域覆盖暗色
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
                        case T.GRASS:     color = sc.grass; break;
                        case T.DIRT:      color = '#8b6d3f'; break;
                        case T.TILLED:    color = '#6b4423'; break;
                        case T.WATERED:   color = '#5a3a1a'; break;
                        case T.PATH:      color = '#c4a96a'; break;
                        case T.FENCE:     color = '#8b6914'; break;
                        case T.WATER:     color = '#3a7bd5'; break;
                        case T.FLOWER:    color = '#ff69b4'; break;
                        case T.HOUSE:     color = '#d4a76a'; break;
                        case T.DOOR:      color = '#8b4513'; break;
                        case T.STONE:     color = '#888'; break;
                        case T.TREE:      color = '#2d5a1e'; break;
                        case T.ROCK_MINE: color = '#6a6058'; break;
                        case T.FISH_SPOT: color = '#4a9bd5'; break;
                        case T.WILD_CROP: color = '#7bc67b'; break;
                        case T.NPC_HOUSE: color = '#b08050'; break;
                        default:          color = '#4a6741';
                    }
                    ctx.fillStyle = color;
                    ctx.fillRect(mmX + x * scaleX, mmY + y * scaleY, Math.max(scaleX, 1), Math.max(scaleY, 1));
                }
            }
        }

        // 区域标签
        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('农场', mmX + 100 * scaleX, mmY + 100 * scaleY);
        ctx.fillText('小镇', mmX + 130 * scaleX, mmY + 150 * scaleY);
        ctx.fillText('森林', mmX + 35 * scaleX, mmY + 35 * scaleY);
        ctx.fillText('矿区', mmX + 170 * scaleX, mmY + 30 * scaleY);
        ctx.fillText('湖畔', mmX + 25 * scaleX, mmY + 155 * scaleY);

        // 玩家位置
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(
            mmX + (state.playerX / TILE) * scaleX - 2,
            mmY + (state.playerY / TILE) * scaleY - 2,
            4, 4
        );

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
