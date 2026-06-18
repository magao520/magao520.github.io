/**
 * Canvas 渲染器 - 星露谷风格
 */
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.tileCache = {};
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // 生成固定星星位置（使用归一化坐标 0-1，渲染时映射到实际屏幕尺寸）
        this.stars = [];
        for (let i = 0; i < 30; i++) {
            this.stars.push({
                nx: ((i * 137 + 50) % 1000) / 1000,  // 归一化 x (0-1)
                ny: ((i * 97 + 30) % 400) / 1000,     // 归一化 y (0-0.4)
                size: 1 + (i % 3)
            });
        }
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.screenW = this.canvas.width;
        this.screenH = this.canvas.height;
    }
    
    /**
     * 获取当前季节颜色
     */
    getSeasonColors(season) {
        return SEASON_COLORS[season] || SEASON_COLORS.spring;
    }
    
    /**
     * 主渲染循环
     */
    render(state) {
        const ctx = this.ctx;
        const sc = this.getSeasonColors(state.season);
        
        // 清屏
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.screenW, this.screenH);
        
        // 计算相机位置 (跟随玩家)
        state.cameraX = state.playerX - this.screenW / 2 + TILE / 2;
        state.cameraY = state.playerY - this.screenH / 2 + TILE / 2;
        
        // 限制相机范围
        state.cameraX = Math.max(0, Math.min(state.cameraX, MAP_W * TILE - this.screenW));
        state.cameraY = Math.max(0, Math.min(state.cameraY, MAP_H * TILE - this.screenH));
        
        ctx.save();
        ctx.translate(-Math.round(state.cameraX), -Math.round(state.cameraY));
        
        // 渲染地图
        this.renderMap(ctx, state, sc);
        
        // 渲染作物
        this.renderCrops(ctx, state);
        
        // 渲染玩家
        this.renderPlayer(ctx, state);
        
        // 渲染粒子
        this.renderParticles(ctx, state);
        
        // 渲染浮动文字
        this.renderFloatingTexts(ctx, state);
        
        ctx.restore();
        
        // 日夜循环覆盖
        this.renderDayNight(ctx, state);
        
        // 渲染小地图
        this.renderMinimap(state, sc);
    }
    
    /**
     * 渲染地图
     */
    renderMap(ctx, state, sc) {
        const startX = Math.max(0, Math.floor(state.cameraX / TILE));
        const startY = Math.max(0, Math.floor(state.cameraY / TILE));
        const endX = Math.min(MAP_W, Math.ceil((state.cameraX + this.screenW) / TILE) + 1);
        const endY = Math.min(MAP_H, Math.ceil((state.cameraY + this.screenH) / TILE) + 1);
        
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const tile = state.map[y][x];
                const px = x * TILE;
                const py = y * TILE;
                
                this.renderTile(ctx, tile, px, py, x, y, sc);
            }
        }
    }
    
    /**
     * 渲染单个图块 - 使用 Tiny Town 像素瓦片
     * 
     * Tiny Town 实际瓦片内容 (12列x11行, 16x16px):
     * Row 0:  0-2=草地(绿色实心), 3-11=树木/灌木(透明背景+绿色/棕色)
     * Row 1:  12-14=沙地(黄棕色实心), 15-23=树木/灌木变体
     * Row 2:  24-26=沙地变体, 27-35=树木/灌木
     * Row 3:  36-42=沙地/土路变体, 43=草地, 44-47=栅栏(棕色)
     * Row 4:  48-51=石砖路(灰蓝色实心), 52-55=砖墙(红棕色), 56-59=栅栏/门
     * Row 5:  60-63=石砖路变体, 64-67=砖墙变体, 68-71=栅栏
     * Row 6:  72-75=屋顶(橙棕色), 76-79=水面(蓝色实心), 80-83=栅栏
     * Row 7:  84-87=屋顶变体, 88-91=水面/冰, 92-95=门/窗
     * Row 8-10: 城堡墙、装饰物、家具等
     */
    renderTile(ctx, tile, px, py, x, y, sc) {
        const a = AssetsLoader.assets;
        // 基于坐标选择变体
        const v = (x * 3 + y * 7) % 3;

        switch (tile) {
            case T.GRASS:
                // 草地 - tt0, tt1, tt2 (绿色实心瓦片)
                if (a.tt0) {
                    const g = [0, 1, 2][v];
                    ctx.drawImage(a[`tt${g}`], px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = (x + y) % 2 === 0 ? '#84c669' : '#7fbf64';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.DIRT:
                // 泥土 - 用沙地瓦片 tt12, tt13, tt14 (黄棕色实心)
                if (a.tt12) {
                    const d = [12, 13, 14][v];
                    ctx.drawImage(a[`tt${d}`], px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#8b6d3f';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.TILLED:
                // 已犁地 - 用沙地瓦片 + 手绘犁沟
                if (a.tt12) {
                    ctx.drawImage(a.tt12, px, py, TILE, TILE);
                    // 深色覆盖模拟翻土
                    ctx.fillStyle = 'rgba(80, 50, 20, 0.4)';
                    ctx.fillRect(px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#6b4423';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                // 犁沟线
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(px + 4, py + 6 + i * 12, TILE - 8, 2);
                }
                break;

            case T.WATERED:
                // 湿润耕地 - 沙地瓦片 + 深色 + 湿润光泽
                if (a.tt12) {
                    ctx.drawImage(a.tt12, px, py, TILE, TILE);
                    ctx.fillStyle = 'rgba(60, 30, 10, 0.5)';
                    ctx.fillRect(px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#4a3520';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                // 犁沟
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(px + 4, py + 6 + i * 12, TILE - 8, 2);
                }
                // 湿润光泽
                ctx.fillStyle = 'rgba(80, 140, 220, 0.25)';
                ctx.fillRect(px, py, TILE, TILE);
                break;

            case T.PATH:
                // 小路 - 用石砖路瓦片 tt48, tt49, tt50 (灰蓝色实心)
                if (a.tt48) {
                    const p = [48, 49, 50][v];
                    ctx.drawImage(a[`tt${p}`], px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#c4a96a';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.FENCE:
                // 栅栏 - 先画草地底，再画栅栏瓦片
                // 栅栏瓦片: tt44(横), tt45(竖), tt46(横), tt47(角)
                if (a.tt0) {
                    ctx.drawImage(a.tt0, px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#84c669';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                // 根据相邻栅栏选择方向
                const isHoriz = (x > 0 && state.map[y] && state.map[y][x-1] === T.FENCE) ||
                                (x < MAP_W-1 && state.map[y] && state.map[y][x+1] === T.FENCE);
                const fenceTile = isHoriz ? [44, 46][v] : [45, 47][v];
                if (a[`tt${fenceTile}`]) {
                    ctx.drawImage(a[`tt${fenceTile}`], px, py, TILE, TILE);
                }
                break;

            case T.WATER:
                // 水面 - tt76, tt77, tt78 (蓝色实心瓦片)
                if (a.tt76) {
                    const w = [76, 77, 78][v];
                    ctx.drawImage(a[`tt${w}`], px, py, TILE, TILE);
                    // 水面波光动画
                    const phase = Date.now() / 800;
                    ctx.fillStyle = 'rgba(255,255,255,0.08)';
                    const wx = Math.sin(phase + x * 2) * 6;
                    const wy = Math.cos(phase + y * 2) * 4;
                    ctx.fillRect(px + 8 + wx, py + 8 + wy, 12, 4);
                } else {
                    ctx.fillStyle = '#3a7bd5';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.FLOWER:
                // 花丛 - 草地底 + 树木瓦片当装饰 (用小树/灌木瓦片)
                if (a.tt0) {
                    ctx.drawImage(a.tt0, px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#84c669';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                // 用像素绘制小花
                const flowerColors = ['#ff69b4', '#ffeb3b', '#ff6347', '#da70d6'];
                ctx.fillStyle = '#2d5a1e';
                ctx.fillRect(px + 20, py + 28, 2, 10);
                ctx.fillRect(px + 30, py + 22, 2, 16);
                ctx.fillStyle = flowerColors[(x * 3 + y * 7) % 4];
                ctx.fillRect(px + 17, py + 24, 8, 6);
                ctx.fillRect(px + 27, py + 18, 8, 6);
                break;

            case T.HOUSE:
                // 房子墙壁 - 用砖墙瓦片 tt52, tt53 (红棕色实心)
                if (a.tt52) {
                    const h = [52, 53][v % 2];
                    ctx.drawImage(a[`tt${h}`], px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#c49558';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.DOOR:
                // 门 - 用栅栏/门瓦片 tt56 或 tt92
                if (a.tt56) {
                    ctx.drawImage(a.tt56, px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#8b5a2b';
                    ctx.fillRect(px + 12, py + 4, 24, TILE - 4);
                    ctx.fillStyle = '#ffd93d';
                    ctx.beginPath();
                    ctx.arc(px + 30, py + 28, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;

            case T.STONE:
                // 石头 - 草地底 + 用砖墙瓦片当石头
                if (a.tt0) {
                    ctx.drawImage(a.tt0, px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#84c669';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                // 画石头
                ctx.fillStyle = '#8a8a8a';
                ctx.beginPath();
                ctx.ellipse(px + TILE/2, py + TILE/2 + 4, 14, 10, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#a0a0a0';
                ctx.beginPath();
                ctx.ellipse(px + TILE/2 - 2, py + TILE/2 + 2, 10, 7, 0, 0, Math.PI * 2);
                ctx.fill();
                break;
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
                // 成熟闪烁
                const pulse = Math.sin(Date.now() / 300) * 0.05 + 1;
                scale *= pulse;
            }
            
            ctx.save();
            ctx.translate(px + TILE/2, py + TILE/2);
            ctx.scale(scale, scale);
            ctx.font = '28px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, 0, -2);
            ctx.restore();
            
            // 生长进度条
            if (crop.growth < 100) {
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.fillRect(px + 4, py + 2, TILE - 8, 4);
                ctx.fillStyle = crop.growth < 50 ? '#4caf50' : '#ffd93d';
                ctx.fillRect(px + 4, py + 2, (TILE - 8) * crop.growth / 100, 4);
            }
            
            // 水分指示
            if (crop.water > 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(px + 4, py + TILE - 6, TILE - 8, 3);
                ctx.fillStyle = '#2196f3';
                ctx.fillRect(px + 4, py + TILE - 6, (TILE - 8) * crop.water / 100, 3);
            }
        }
    }
    
    /**
     * 渲染玩家角色 - 使用 PNG spritesheet
     * 角色 spritesheet 是 8 帧横排，每帧 12x17 (walk) 或 12x16 (idle)
     * 缩放绘制到 TILE x TILE 区域
     */
    renderPlayer(ctx, state) {
        const px = state.playerX;
        const py = state.playerY;

        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(px + TILE / 2, py + TILE - 4, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // 方向映射: 0=down, 1=up, 2=left, 3=right
        const dirKeys = ['Down', 'Up', 'Left', 'Right'];
        const dirKey = dirKeys[state.playerDir];

        // 选择 walk 或 idle spritesheet
        const sheetKey = state.playerMoving ? `charWalk${dirKey}` : `charIdle${dirKey}`;
        const sheet = AssetsLoader.assets[sheetKey];

        if (sheet) {
            // spritesheet 帧参数
            const totalFrames = Math.round(sheet.width / Math.max(1, sheet.height));
            const frameW = sheet.width / Math.max(1, totalFrames);  // 每帧宽度
            const frameH = sheet.height;     // 每帧高度

            // 计算当前帧
            let frame;
            if (state.playerMoving) {
                frame = Math.floor(state.moveTimer * 8) % totalFrames;
            } else {
                // idle 状态使用固定第0帧，避免闪烁
                frame = 0;
            }

            // 保持宽高比缩放，底部对齐
            const scale = TILE / Math.max(frameW, frameH);
            const drawW = frameW * scale;
            const drawH = frameH * scale;
            ctx.drawImage(
                sheet,
                frame * frameW, 0, frameW, frameH,  // 源区域
                px + (TILE - drawW) / 2, py + TILE - drawH, drawW, drawH  // 目标区域，居中底部对齐
            );
        } else {
            // Fallback: 手绘角色
            this.renderPlayerFallback(ctx, state, px, py);
        }

        // 工具指示 - 根据方向调整位置
        const toolEmojis = ['⛏️', '🚿', '🌱', '🧺', '🗑️'];
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        let toolX = px + TILE / 2;
        let toolY = py - 8;
        // 方向: 0=down, 1=up, 2=left, 3=right
        switch (state.playerDir) {
            case 0: toolX = px + TILE / 2; toolY = py - 8; break;       // 下方 - 头顶上方
            case 1: toolX = px + TILE / 2; toolY = py + TILE + 14; break; // 上方 - 脚下下方
            case 2: toolX = px - 12; toolY = py + TILE / 2; break;       // 左方 - 身体左侧
            case 3: toolX = px + TILE + 12; toolY = py + TILE / 2; break; // 右方 - 身体右侧
        }
        ctx.fillText(toolEmojis[state.currentTool] || '⛏️', toolX, toolY);
    }

    /**
     * 手绘角色 (fallback)
     */
    renderPlayerFallback(ctx, state, px, py) {
        const bodyBob = state.playerMoving ? Math.sin(state.moveTimer * 8) * 2 : 0;

        // 腿
        ctx.fillStyle = '#5c3d1e';
        if (state.playerMoving) {
            const legOff = Math.sin(state.moveTimer * 10) * 4;
            ctx.fillRect(px + 16, py + 32 + bodyBob, 6, 12 + legOff);
            ctx.fillRect(px + 26, py + 32 + bodyBob, 6, 12 - legOff);
        } else {
            ctx.fillRect(px + 16, py + 32, 6, 12);
            ctx.fillRect(px + 26, py + 32, 6, 12);
        }

        // 身体
        ctx.fillStyle = '#4a90d9';
        ctx.fillRect(px + 14, py + 16 + bodyBob, 20, 18);

        // 手臂
        ctx.fillStyle = '#f5d6b8';
        if (state.playerMoving) {
            const armSwing = Math.sin(state.moveTimer * 10) * 5;
            ctx.fillRect(px + 8, py + 18 + bodyBob + armSwing, 6, 12);
            ctx.fillRect(px + 34, py + 18 + bodyBob - armSwing, 6, 12);
        } else {
            ctx.fillRect(px + 8, py + 18, 6, 12);
            ctx.fillRect(px + 34, py + 18, 6, 12);
        }

        // 头
        ctx.fillStyle = '#f5d6b8';
        ctx.fillRect(px + 14, py + 4 + bodyBob, 20, 14);

        // 帽子
        ctx.fillStyle = '#c4a96a';
        ctx.fillRect(px + 10, py + bodyBob, 28, 6);
        ctx.fillRect(px + 16, py - 4 + bodyBob, 16, 8);

        // 眼睛 (根据方向)
        ctx.fillStyle = '#333';
        if (state.playerDir === 0) {
            ctx.fillRect(px + 18, py + 10 + bodyBob, 3, 3);
            ctx.fillRect(px + 27, py + 10 + bodyBob, 3, 3);
        } else if (state.playerDir === 2) {
            ctx.fillRect(px + 16, py + 10 + bodyBob, 3, 3);
        } else if (state.playerDir === 3) {
            ctx.fillRect(px + 29, py + 10 + bodyBob, 3, 3);
        }
    }
    
    /**
     * 渲染粒子
     */
    renderParticles(ctx, state) {
        for (const p of state.particles) {
            ctx.globalAlpha = p.life;
            ctx.font = `${p.size}px serif`;
            ctx.textAlign = 'center';
            ctx.fillText(p.emoji, p.x, p.y);
        }
        ctx.globalAlpha = 1;
    }
    
    /**
     * 渲染浮动文字
     */
    renderFloatingTexts(ctx, state) {
        for (const t of state.floatingTexts) {
            ctx.globalAlpha = t.life;
            ctx.font = 'bold 16px "ZCOOL KuaiLe", cursive';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000';
            ctx.fillText(t.text, t.x + 1, t.y + 1);
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, t.x, t.y);
        }
        ctx.globalAlpha = 1;
    }
    
    /**
     * 日夜循环
     */
    renderDayNight(ctx, state) {
        const alpha = getDaylightAlpha(state.time);
        if (alpha > 0) {
            ctx.fillStyle = `rgba(10, 10, 40, ${alpha})`;
            ctx.fillRect(0, 0, this.screenW, this.screenH);
            
            // 星星
            if (alpha > 0.3) {
                ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
                for (const star of this.stars) {
                    const sx = star.nx * this.screenW;
                    const sy = star.ny * this.screenH;
                    ctx.fillRect(sx, sy, star.size, star.size);
                }
            }
        }
    }
    
    /**
     * 小地图
     */
    renderMinimap(state, sc) {
        const mm = document.getElementById('minimap');
        if (!mm.classList.contains('active')) return;
        
        const mctx = mm.getContext('2d');
        const scale = 5;
        mctx.fillStyle = '#1a1a2e';
        mctx.fillRect(0, 0, 150, 150);
        
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                const tile = state.map[y][x];
                let color;
                switch (tile) {
                    case T.GRASS: color = sc.grass; break;
                    case T.DIRT: case T.TILLED: color = '#6b4423'; break;
                    case T.WATERED: color = '#4a3520'; break;
                    case T.PATH: color = '#c4a96a'; break;
                    case T.FENCE: color = '#8b6914'; break;
                    case T.WATER: color = '#3a7bd5'; break;
                    case T.FLOWER: color = '#ff69b4'; break;
                    case T.HOUSE: case T.DOOR: color = '#c49558'; break;
                    case T.STONE: color = '#888'; break;
                    default: color = sc.grass;
                }
                mctx.fillStyle = color;
                mctx.fillRect(x * scale, y * scale, scale, scale);
            }
        }
        
        // 作物
        for (const key of Object.keys(state.crops)) {
            const [x, y] = key.split(',').map(Number);
            const crop = state.crops[key];
            mctx.fillStyle = crop.growth >= 100 ? '#ffd93d' : '#4caf50';
            mctx.fillRect(x * scale, y * scale, scale, scale);
        }
        
        // 玩家位置
        const ppx = (state.playerX / TILE) * scale;
        const ppy = (state.playerY / TILE) * scale;
        mctx.fillStyle = '#ff4444';
        mctx.fillRect(ppx - 2, ppy - 2, 5, 5);
        
        // 视野框
        mctx.strokeStyle = 'rgba(255,255,255,0.5)';
        mctx.strokeRect(
            (state.cameraX / TILE) * scale,
            (state.cameraY / TILE) * scale,
            (this.screenW / TILE) * scale,
            (this.screenH / TILE) * scale
        );
    }
}
