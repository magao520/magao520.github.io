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
     * Tiny Town 瓦片编号映射:
     * 0-3: 草地变体, 4-7: 泥土, 8-11: 水, 12-15: 沙地
     * 16-19: 草地花, 20-23: 树木, 24-27: 灌木
     * 28-35: 房子墙壁/屋顶, 36-39: 门, 40-43: 窗户
     * 44-51: 栅栏, 52-55: 石头/岩石, 56-59: 箱子
     * 60-67: 路/桥, 68-75: 室内地板
     */
    renderTile(ctx, tile, px, py, x, y, sc) {
        const a = AssetsLoader.assets;
        // 基于坐标选择变体，让地图更自然
        const variant = (x * 3 + y * 7) % 4;
        const v2 = (x * 5 + y * 11) % 4;

        switch (tile) {
            case T.GRASS:
                // 草地 - 使用 tt0-tt3 变体
                if (a.tt0) {
                    const grassIdx = [0, 1, 2, 3][variant];
                    if (a[`tt${grassIdx}`]) {
                        ctx.drawImage(a[`tt${grassIdx}`], px, py, TILE, TILE);
                    } else {
                        ctx.fillStyle = sc.grass;
                        ctx.fillRect(px, py, TILE, TILE);
                    }
                } else {
                    ctx.fillStyle = (x + y) % 2 === 0 ? sc.grass : sc.grassDark;
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.DIRT:
                // 泥土 - tt4-tt7
                if (a.tt4) {
                    const dirtIdx = [4, 5, 6, 7][variant];
                    if (a[`tt${dirtIdx}`]) {
                        ctx.drawImage(a[`tt${dirtIdx}`], px, py, TILE, TILE);
                    } else {
                        ctx.fillStyle = '#8b6d3f';
                        ctx.fillRect(px, py, TILE, TILE);
                    }
                } else {
                    ctx.fillStyle = '#8b6d3f';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.TILLED:
                // 已犁地 - 用深色泥土 tt6-tt7
                if (a.tt6) {
                    ctx.drawImage(a.tt6, px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#6b4423';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                // 犁沟线
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(px + 4, py + 6 + i * 12, TILE - 8, 2);
                }
                break;

            case T.WATERED:
                // 湿润耕地 - tt6 + 蓝色覆盖
                if (a.tt6) {
                    ctx.drawImage(a.tt6, px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#4a3520';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                // 犁沟
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(px + 4, py + 6 + i * 12, TILE - 8, 2);
                }
                // 湿润光泽
                ctx.fillStyle = 'rgba(80, 140, 220, 0.2)';
                ctx.fillRect(px, py, TILE, TILE);
                break;

            case T.PATH:
                // 小路 - tt60-tt63 (路面)
                if (a.tt60) {
                    const pathIdx = [60, 61, 62, 63][variant];
                    if (a[`tt${pathIdx}`]) {
                        ctx.drawImage(a[`tt${pathIdx}`], px, py, TILE, TILE);
                    } else {
                        ctx.fillStyle = '#c4a96a';
                        ctx.fillRect(px, py, TILE, TILE);
                    }
                } else {
                    ctx.fillStyle = '#c4a96a';
                    ctx.fillRect(px, py, TILE, TILE);
                    ctx.fillStyle = '#b09558';
                    ctx.fillRect(px + 4, py + 4, 8, 8);
                    ctx.fillRect(px + 28, py + 24, 12, 12);
                    ctx.fillRect(px + 16, py + 32, 6, 6);
                }
                break;

            case T.FENCE:
                // 栅栏 - 先画草地底，再画栅栏 tt44-tt51
                if (a.tt0) {
                    ctx.drawImage(a.tt0, px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = sc.grass;
                    ctx.fillRect(px, py, TILE, TILE);
                }
                // 栅栏 - 根据位置选择横/竖/角
                const fenceIdx = 44 + ((x + y) % 8);
                if (a[`tt${fenceIdx}`]) {
                    ctx.drawImage(a[`tt${fenceIdx}`], px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#8b6914';
                    ctx.fillRect(px + 2, py + 8, TILE - 4, 6);
                    ctx.fillRect(px + 2, py + 32, TILE - 4, 6);
                    ctx.fillStyle = '#a07828';
                    ctx.fillRect(px + 8, py + 4, 6, TILE - 8);
                    ctx.fillRect(px + TILE - 14, py + 4, 6, TILE - 8);
                }
                break;

            case T.WATER:
                // 水面 - tt8-tt11
                if (a.tt8) {
                    const waterIdx = [8, 9, 10, 11][variant];
                    if (a[`tt${waterIdx}`]) {
                        ctx.drawImage(a[`tt${waterIdx}`], px, py, TILE, TILE);
                    } else {
                        ctx.fillStyle = '#3a7bd5';
                        ctx.fillRect(px, py, TILE, TILE);
                    }
                } else {
                    const waterPhase = Date.now() / 1000;
                    ctx.fillStyle = '#3a7bd5';
                    ctx.fillRect(px, py, TILE, TILE);
                    ctx.fillStyle = '#4a8be5';
                    const waveOff = Math.sin(waterPhase + x + y) * 3;
                    ctx.fillRect(px + 4, py + 12 + waveOff, TILE - 8, 3);
                    ctx.fillRect(px + 8, py + 28 - waveOff, TILE - 16, 2);
                    ctx.fillStyle = 'rgba(255,255,255,0.2)';
                    ctx.fillRect(px + 10, py + 8, 8, 3);
                }
                break;

            case T.FLOWER:
                // 花丛 - 草地底 + 花 tt16-tt19
                if (a.tt0) {
                    ctx.drawImage(a.tt0, px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = sc.grass;
                    ctx.fillRect(px, py, TILE, TILE);
                }
                const flowerIdx = 16 + variant;
                if (a[`tt${flowerIdx}`]) {
                    ctx.drawImage(a[`tt${flowerIdx}`], px, py, TILE, TILE);
                } else {
                    const flowerColors = ['#ff69b4', '#ffeb3b', '#ff6347', '#da70d6'];
                    ctx.fillStyle = flowerColors[variant];
                    ctx.beginPath();
                    ctx.arc(px + TILE/2, py + TILE/2, 6, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;

            case T.HOUSE:
                // 房子 - tt28-tt35 墙壁/屋顶
                const houseIdx = 28 + ((x + y) % 8);
                if (a[`tt${houseIdx}`]) {
                    ctx.drawImage(a[`tt${houseIdx}`], px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = '#d4a76a';
                    ctx.fillRect(px, py, TILE, TILE);
                    ctx.fillStyle = '#c49558';
                    ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
                }
                break;

            case T.DOOR:
                // 门 - tt36-tt39
                const doorIdx = 36 + variant;
                if (a[`tt${doorIdx}`]) {
                    ctx.drawImage(a[`tt${doorIdx}`], px, py, TILE, TILE);
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
                // 石头 - 草地底 + 岩石 tt52-tt55
                if (a.tt0) {
                    ctx.drawImage(a.tt0, px, py, TILE, TILE);
                } else {
                    ctx.fillStyle = sc.grass;
                    ctx.fillRect(px, py, TILE, TILE);
                }
                const rockIdx = 52 + variant;
                if (a[`tt${rockIdx}`]) {
                    ctx.drawImage(a[`tt${rockIdx}`], px, py, TILE, TILE);
                } else if (a.rock) {
                    ctx.drawImage(a.rock, px + (TILE - 15) / 2, py + (TILE - 15) / 2, 15, 15);
                } else {
                    ctx.fillStyle = '#888';
                    ctx.beginPath();
                    ctx.ellipse(px + TILE/2, py + TILE/2 + 4, 16, 12, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
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
