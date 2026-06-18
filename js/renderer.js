/**
 * Canvas 渲染器 - 星露谷风格极致优化版
 * 
 * 优化特性:
 * 1. 无缝纹理平铺 - 使用 createPattern 消除瓦片边界
 * 2. 边缘过渡混合 - 相邻不同地形之间绘制半透明渐变
 * 3. 环境光遮蔽 (AO) - 瓦片四角暗角增强立体感
 * 4. 地形凹凸法线 - 明暗变化模拟地形起伏
 * 5. 动态光影 - 实时阴影、水面反射、阳光方向
 * 6. 色彩分级 - 季节和时间动态色调
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
            [T.GRASS]:   { r: 132, g: 198, b: 105 },
            [T.DIRT]:    { r: 139, g: 109, b:  63 },
            [T.TILLED]:  { r: 107, g:  68, b:  35 },
            [T.WATERED]: { r:  90, g:  60, b:  30 },
            [T.PATH]:    { r: 180, g: 160, b: 110 },
            [T.FENCE]:   { r: 132, g: 198, b: 105 },
            [T.WATER]:   { r:  58, g: 123, b: 213 },
            [T.FLOWER]:  { r: 132, g: 198, b: 105 },
            [T.HOUSE]:   { r: 196, g: 150, b: 100 },
            [T.DOOR]:    { r: 139, g:  90, b:  43 },
            [T.STONE]:   { r: 132, g: 198, b: 105 },
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
        const hour = state.timeOfDay;
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

        // 6. 渲染玩家
        this.renderPlayer(ctx, state);

        // 7. 渲染粒子和浮动文字
        this.renderParticles(ctx, state);
        this.renderFloatingTexts(ctx, state);

        ctx.restore();

        // 8. 全局光影效果
        this.renderGlobalLighting(ctx, state, sc);

        // 9. 小地图
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
        // 使用 64x64 Seamless RPG Tiles 高级无缝纹理
        // 根据季节选择变体
        const season = window.state ? window.state.season : 'spring';
        switch (tile) {
            case T.GRASS:
                if (season === 'winter') return 'texGrassSnowy';
                if (season === 'autumn') return 'texGrassNov';
                if (season === 'summer') return 'texGrassDry';
                return 'texGrass';
            case T.DIRT:    return 'texDryland';
            case T.TILLED:  return 'texFarmland';
            case T.WATERED: return 'texMud';
            case T.PATH:    return 'texPath';
            case T.FENCE:   return 'texGrass';
            case T.WATER:   return 'texWater';
            case T.FLOWER:  return 'texGrass';
            case T.HOUSE:   return 'texStoneTile';
            case T.DOOR:    return 'texWoodTile';
            case T.STONE:   return 'texPebbles';
            default:        return 'texGrass';
        }
    }

    /**
     * 获取地形颜色 (fallback)
     */
    getTerrainColor(tile, sc) {
        switch (tile) {
            case T.GRASS:   return sc.grass;
            case T.DIRT:    return '#8b6d3f';
            case T.TILLED:  return '#6b4423';
            case T.WATERED: return '#5a3a1a';
            case T.PATH:    return '#c4a96a';
            case T.FENCE:   return sc.grass;
            case T.WATER:   return '#3a7bd5';
            case T.FLOWER:  return sc.grass;
            case T.HOUSE:   return '#c49558';
            case T.DOOR:    return '#8b5a2b';
            case T.STONE:   return sc.grass;
            default:        return '#4a6741';
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

        const gradientSize = 8; // 过渡宽度
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

                // 检查四个角是否有高度差（邻居是不同地形）
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
     * 渲染地形细节
     */
    renderTerrainDetails(ctx, state) {
        const startX = Math.max(0, Math.floor(state.cameraX / TILE));
        const startY = Math.max(0, Math.floor(state.cameraY / TILE));
        const endX = Math.min(MAP_W, Math.ceil((state.cameraX + this.screenW) / TILE) + 1);
        const endY = Math.min(MAP_H, Math.ceil((state.cameraY + this.screenH) / TILE) + 1);

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
                        // 湿润高光
                        ctx.fillStyle = 'rgba(100, 160, 230, 0.15)';
                        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
                        break;

                    case T.WATER:
                        // 水面波光
                        const phase = Date.now() / 600;
                        ctx.fillStyle = 'rgba(255,255,255,0.06)';
                        const wx = Math.sin(phase + x * 1.5) * 8;
                        const wy = Math.cos(phase + y * 1.5) * 5;
                        ctx.fillRect(px + 6 + wx, py + 10 + wy, 14, 3);
                        ctx.fillRect(px + 20 - wx, py + 28 + wy, 10, 2);
                        // 水面深度渐变
                        const waterGrad = ctx.createLinearGradient(px, py, px, py + TILE);
                        waterGrad.addColorStop(0, 'rgba(255,255,255,0.03)');
                        waterGrad.addColorStop(1, 'rgba(0,30,80,0.1)');
                        ctx.fillStyle = waterGrad;
                        ctx.fillRect(px, py, TILE, TILE);
                        break;

                    case T.FLOWER:
                        // 手绘小花
                        const flowerColors = ['#ff69b4', '#ffeb3b', '#ff6347', '#da70d6'];
                        const fc = flowerColors[(x * 3 + y * 7) % 4];
                        ctx.fillStyle = '#1a4a0a';
                        ctx.fillRect(px + 18, py + 26, 3, 12);
                        ctx.fillRect(px + 30, py + 22, 3, 16);
                        ctx.fillStyle = fc;
                        ctx.beginPath();
                        ctx.arc(px + 20, py + 24, 5, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.beginPath();
                        ctx.arc(px + 32, py + 20, 4, 0, Math.PI * 2);
                        ctx.fill();
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
                        // 石头
                        ctx.fillStyle = '#7a7a7a';
                        ctx.beginPath();
                        ctx.ellipse(px + TILE/2, py + TILE/2 + 4, 14, 10, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = '#9a9a9a';
                        ctx.beginPath();
                        ctx.ellipse(px + TILE/2 - 2, py + TILE/2 + 2, 10, 7, 0, 0, Math.PI * 2);
                        ctx.fill();
                        // 石头阴影
                        ctx.fillStyle = 'rgba(0,0,0,0.15)';
                        ctx.beginPath();
                        ctx.ellipse(px + TILE/2, py + TILE - 2, 12, 4, 0, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                }
            }
        }
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

            let emoji, scale;
            if (crop.growth < 25) {
                emoji = '🌱';
                scale = 0.6;
            } else if (crop.growth < 50) {
                emoji = '🌿';
                scale = 0.8;
            } else if (crop.growth < 100) {
                emoji = cropData.emoji;
                scale = 0.9;
            } else {
                emoji = cropData.emoji;
                scale = 1.1;
                const pulse = Math.sin(Date.now() / 300) * 0.05 + 1;
                scale *= pulse;
            }

            ctx.font = `${Math.floor(TILE * scale * 0.8)}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, px + TILE / 2, py + TILE / 2 + 2);

            // 水分指示器
            if (crop.water < 30) {
                ctx.fillStyle = 'rgba(255, 80, 80, 0.7)';
                ctx.fillRect(px + 4, py + 2, TILE - 8, 3);
            }
        }
    }

    /**
     * 渲染玩家角色
     */
    renderPlayer(ctx, state) {
        const px = state.playerX;
        const py = state.playerY;

        // 动态阴影 (根据太阳角度)
        const shadowOffsetX = Math.cos(this.sunAngle) * 8;
        const shadowOffsetY = Math.sin(this.sunAngle) * 4 + 4;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(px + TILE/2 + shadowOffsetX, py + TILE - 2 + shadowOffsetY, 16, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // 角色本体
        const dirNames = ['Down', 'Up', 'Left', 'Right'];
        const dirName = dirNames[state.playerDir] || 'Down';
        const animType = state.playerMoving ? 'Walk' : 'Idle';
        const sheetKey = `char${animType}${dirName}`;
        const sheet = AssetsLoader.assets[sheetKey];

        if (sheet) {
            const frameH = sheet.height;
            const frameW = sheet.width / Math.max(1, Math.round(sheet.width / Math.max(1, frameH)));
            const totalFrames = Math.round(sheet.width / Math.max(1, frameW));

            let frame;
            if (state.playerMoving) {
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
            ctx.fillStyle = '#ff6b6b';
            ctx.fillRect(px + 12, py + 8, 24, 32);
            ctx.fillStyle = '#feca57';
            ctx.fillRect(px + 16, py + 4, 16, 12);
        }

        // 工具指示
        const toolEmojis = ['⛏️', '🚿', '🌱', '🧺', '🗑️'];
        const toolEmoji = toolEmojis[state.currentTool] || '';
        if (toolEmoji) {
            ctx.font = '16px serif';
            ctx.textAlign = 'center';
            let tx = px + TILE / 2;
            let ty = py - 8;
            if (state.playerDir === 1) { ty = py + TILE + 12; }
            else if (state.playerDir === 2) { tx = px - 8; ty = py + TILE / 2; }
            else if (state.playerDir === 3) { tx = px + TILE + 8; ty = py + TILE / 2; }
            ctx.fillText(toolEmoji, tx, ty);
        }

        // 玩家名字 + 描边
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(state.playerName, px + TILE / 2, py - 12);
        ctx.fillText(state.playerName, px + TILE / 2, py - 12);
    }

    /**
     * 渲染粒子效果
     */
    renderParticles(ctx, state) {
        for (const p of state.particles) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
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
     * 全局光影效果
     */
    renderGlobalLighting(ctx, state, sc) {
        const hour = state.timeOfDay;
        let overlayColor = null;
        let overlayAlpha = 0;
        let warmth = 0;

        if (hour >= 20 || hour < 5) {
            // 深夜
            overlayColor = '#0a0a2e';
            overlayAlpha = 0.55;
        } else if (hour >= 18) {
            // 傍晚 (暖橙色)
            overlayColor = '#ff6b35';
            overlayAlpha = (hour - 18) / 2 * 0.35;
            warmth = (hour - 18) / 2;
        } else if (hour < 7) {
            // 清晨 (淡蓝色)
            overlayColor = '#87ceeb';
            overlayAlpha = (7 - hour) / 2 * 0.2;
        } else if (hour >= 12 && hour < 15) {
            // 正午强光 (轻微漂白)
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

        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
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
                    default: color = '#4a6741';
                }
                ctx.fillStyle = color;
                ctx.fillRect(mmX + x * scaleX, mmY + y * scaleY, scaleX + 1, scaleY + 1);
            }
        }

        ctx.fillStyle = '#ff0000';
        ctx.fillRect(
            mmX + (state.playerX / TILE) * scaleX - 2,
            mmY + (state.playerY / TILE) * scaleY - 2,
            4, 4
        );

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
