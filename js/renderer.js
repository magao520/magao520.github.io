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
     * 渲染单个图块
     */
    renderTile(ctx, tile, px, py, x, y, sc) {
        switch (tile) {
            case T.GRASS:
                // 棋盘格草地
                ctx.fillStyle = (x + y) % 2 === 0 ? sc.grass : sc.grassDark;
                ctx.fillRect(px, py, TILE, TILE);
                // 随机草细节
                if ((x * 7 + y * 13) % 5 === 0) {
                    ctx.fillStyle = (x + y) % 2 === 0 ? sc.grassDark : sc.grass;
                    ctx.fillRect(px + 10, py + 20, 4, 8);
                    ctx.fillRect(px + 30, py + 8, 4, 8);
                }
                break;
                
            case T.DIRT:
                ctx.fillStyle = '#8b6d3f';
                ctx.fillRect(px, py, TILE, TILE);
                ctx.fillStyle = '#7a5c30';
                // 犁地纹理
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(px + 4, py + 4 + i * 12, TILE - 8, 2);
                }
                break;
                
            case T.TILLED:
                ctx.fillStyle = '#6b4423';
                ctx.fillRect(px, py, TILE, TILE);
                ctx.fillStyle = '#5a3a1a';
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(px + 4, py + 4 + i * 12, TILE - 8, 2);
                }
                break;
                
            case T.WATERED:
                ctx.fillStyle = '#4a3520';
                ctx.fillRect(px, py, TILE, TILE);
                ctx.fillStyle = '#3a2a15';
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(px + 4, py + 4 + i * 12, TILE - 8, 2);
                }
                // 湿润光泽
                ctx.fillStyle = 'rgba(100, 150, 255, 0.15)';
                ctx.fillRect(px, py, TILE, TILE);
                break;
                
            case T.PATH:
                ctx.fillStyle = '#c4a96a';
                ctx.fillRect(px, py, TILE, TILE);
                ctx.fillStyle = '#b09558';
                ctx.fillRect(px + 4, py + 4, 8, 8);
                ctx.fillRect(px + 28, py + 24, 12, 12);
                ctx.fillRect(px + 16, py + 32, 6, 6);
                break;
                
            case T.FENCE:
                // 草地底
                ctx.fillStyle = (x + y) % 2 === 0 ? sc.grass : sc.grassDark;
                ctx.fillRect(px, py, TILE, TILE);
                // 栅栏
                ctx.fillStyle = '#8b6914';
                ctx.fillRect(px + 2, py + 8, TILE - 4, 6);
                ctx.fillRect(px + 2, py + 32, TILE - 4, 6);
                ctx.fillStyle = '#a07828';
                ctx.fillRect(px + 8, py + 4, 6, TILE - 8);
                ctx.fillRect(px + TILE - 14, py + 4, 6, TILE - 8);
                break;
                
            case T.WATER:
                // 水面
                const waterPhase = Date.now() / 1000;
                ctx.fillStyle = '#3a7bd5';
                ctx.fillRect(px, py, TILE, TILE);
                ctx.fillStyle = '#4a8be5';
                const waveOff = Math.sin(waterPhase + x + y) * 3;
                ctx.fillRect(px + 4, py + 12 + waveOff, TILE - 8, 3);
                ctx.fillRect(px + 8, py + 28 - waveOff, TILE - 16, 2);
                // 高光
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.fillRect(px + 10, py + 8, 8, 3);
                break;
                
            case T.FLOWER:
                ctx.fillStyle = (x + y) % 2 === 0 ? sc.grass : sc.grassDark;
                ctx.fillRect(px, py, TILE, TILE);
                // 花朵
                const flowerColors = ['#ff69b4', '#ffeb3b', '#ff6347', '#da70d6', '#87ceeb'];
                const fc = flowerColors[(x * 3 + y * 7) % flowerColors.length];
                ctx.fillStyle = '#2d5a1e';
                ctx.fillRect(px + 20, py + 24, 3, 12);
                ctx.fillRect(px + 28, py + 20, 3, 16);
                ctx.fillStyle = fc;
                ctx.beginPath();
                ctx.arc(px + 22, py + 22, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(px + 30, py + 18, 4, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case T.HOUSE:
                // 房子
                ctx.fillStyle = '#d4a76a';
                ctx.fillRect(px, py, TILE, TILE);
                ctx.fillStyle = '#c49558';
                ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
                // 窗户
                if ((x === 3 || x === 5) && y === 3) {
                    ctx.fillStyle = '#87ceeb';
                    ctx.fillRect(px + 12, py + 12, 20, 16);
                    ctx.fillStyle = '#5c3d1e';
                    ctx.fillRect(px + 22, py + 12, 2, 16);
                    ctx.fillRect(px + 12, py + 20, 20, 2);
                }
                // 屋顶 (在y=2时)
                if (y === 2) {
                    ctx.fillStyle = '#8b4513';
                    ctx.fillRect(px - 4, py + 30, TILE + 8, 18);
                    ctx.fillStyle = '#a0522d';
                    ctx.fillRect(px - 2, py + 32, TILE + 4, 14);
                }
                break;
                
            case T.DOOR:
                ctx.fillStyle = '#d4a76a';
                ctx.fillRect(px, py, TILE, TILE);
                ctx.fillStyle = '#5c3d1e';
                ctx.fillRect(px + 14, py + 4, 20, TILE - 4);
                ctx.fillStyle = '#ffd93d';
                ctx.beginPath();
                ctx.arc(px + 30, py + 28, 2, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case T.STONE:
                ctx.fillStyle = (x + y) % 2 === 0 ? sc.grass : sc.grassDark;
                ctx.fillRect(px, py, TILE, TILE);
                ctx.fillStyle = '#888';
                ctx.beginPath();
                ctx.ellipse(px + TILE/2, py + TILE/2 + 4, 16, 12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#999';
                ctx.beginPath();
                ctx.ellipse(px + TILE/2 - 2, py + TILE/2 + 2, 12, 9, 0, 0, Math.PI * 2);
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
     * 渲染玩家角色
     */
    renderPlayer(ctx, state) {
        const px = state.playerX;
        const py = state.playerY;
        
        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(px + TILE/2, py + TILE - 4, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 身体
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
        if (state.playerDir === 0) { // 朝下
            ctx.fillRect(px + 18, py + 10 + bodyBob, 3, 3);
            ctx.fillRect(px + 27, py + 10 + bodyBob, 3, 3);
        } else if (state.playerDir === 1) { // 朝上
            // 不画眼睛
        } else if (state.playerDir === 2) { // 朝左
            ctx.fillRect(px + 16, py + 10 + bodyBob, 3, 3);
        } else { // 朝右
            ctx.fillRect(px + 29, py + 10 + bodyBob, 3, 3);
        }
        
        // 工具指示
        const toolEmojis = ['⛏️', '🚿', '🌱', '🧺', '🗑️'];
        if (state.playerDir === 0) {
            ctx.font = '14px serif';
            ctx.textAlign = 'center';
            ctx.fillText(toolEmojis[state.currentTool], px + TILE/2, py - 8);
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
                for (let i = 0; i < 30; i++) {
                    const sx = ((i * 137 + 50) % this.screenW);
                    const sy = ((i * 97 + 30) % (this.screenH * 0.4));
                    const ss = 1 + (i % 3);
                    ctx.fillRect(sx, sy, ss, ss);
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
