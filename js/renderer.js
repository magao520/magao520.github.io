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
                
                this.renderTile(ctx, tile, px, py, x, y, sc, state);
            }
        }
    }
    
    /**
     * 辅助函数：安全绘制瓦片
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
    renderTile(ctx, tile, px, py, x, y, sc, state) {
        const a = AssetsLoader.assets;
        // 基于坐标选择变体
        const v = (x * 3 + y * 7) % 3;

        switch (tile) {
            case T.GRASS:
                // 草地 - tt0, tt1, tt2 (绿色实心瓦片)
                if (!this.drawTile(ctx, `tt${[0,1,2][v]}`, px, py)) {
                    ctx.fillStyle = (x + y) % 2 === 0 ? '#84c669' : '#7fbf64';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.DIRT:
                // 泥土 - 用沙地瓦片 tt12, tt13, tt14 (黄棕色实心)
                if (!this.drawTile(ctx, `tt${[12,13,14][v]}`, px, py)) {
                    ctx.fillStyle = '#8b6d3f';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.TILLED:
                // 已犁地 - 用沙地瓦片 + 手绘犁沟
                if (this.drawTile(ctx, 'tt12', px, py)) {
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
                if (this.drawTile(ctx, 'tt12', px, py)) {
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
                if (!this.drawTile(ctx, `tt${[48,49,50][v]}`, px, py)) {
                    ctx.fillStyle = '#c4a96a';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.FENCE:
                // 栅栏 - 先画草地底，再画栅栏瓦片
                // 栅栏瓦片: tt44(横), tt45(竖), tt46(横), tt47(角)
                if (!this.drawTile(ctx, 'tt0', px, py)) {
                    ctx.fillStyle = '#84c669';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                // 根据相邻栅栏选择方向
                const isHoriz = (x > 0 && state.map[y] && state.map[y][x-1] === T.FENCE) ||
                                (x < MAP_W-1 && state.map[y] && state.map[y][x+1] === T.FENCE);
                const fenceTile = isHoriz ? [44, 46][v] : [45, 47][v];
                this.drawTile(ctx, `tt${fenceTile}`, px, py);
                break;

            case T.WATER:
                // 水面 - tt76, tt77, tt78 (蓝色实心瓦片)
                if (this.drawTile(ctx, `tt${[76,77,78][v]}`, px, py)) {
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
                // 花丛 - 草地底 + 手绘小花
                if (!this.drawTile(ctx, 'tt0', px, py)) {
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
                if (!this.drawTile(ctx, `tt${[52,53][v % 2]}`, px, py)) {
                    ctx.fillStyle = '#c49558';
                    ctx.fillRect(px, py, TILE, TILE);
                }
                break;

            case T.DOOR:
                // 门 - 用栅栏/门瓦片 tt56 或 tt92
                if (!this.drawTile(ctx, 'tt56', px, py)) {
                    ctx.fillStyle = '#8b5a2b';
                    ctx.fillRect(px + 12, py + 4, 24, TILE - 4);
                    ctx.fillStyle = '#ffd93d';
                    ctx.beginPath();
                    ctx.arc(px + 30, py + 28, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;

            case T.STONE:
                // 石头 - 草地底 + 手绘石头
                if (!this.drawTile(ctx, 'tt0', px, py)) {
                    ctx.fillStyle = '#84c669';
                    ctx.fillRect(px, py, TILE, TILE);
                }
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
            
            ctx.font = `${Math.floor(TILE * scale * 0.8)}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, px + TILE / 2, py + TILE / 2 + 4);
            
            // 水分指示器
            if (crop.water < 30) {
                ctx.fillStyle = 'rgba(255, 100, 100, 0.6)';
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
        
        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(px + TILE/2, py + TILE - 4, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 根据方向选择 spritesheet
        const dirNames = ['Down', 'Up', 'Left', 'Right'];
        const dirName = dirNames[state.playerDir] || 'Down';
        
        // 选择 walk 或 idle
        const animType = state.playerMoving ? 'Walk' : 'Idle';
        const sheetKey = `char${animType}${dirName}`;
        const sheet = AssetsLoader.assets[sheetKey];
        
        if (sheet) {
            // 动态计算帧数（基于图片宽高比）
            const frameH = sheet.height;
            const frameW = sheet.width / Math.max(1, Math.round(sheet.width / Math.max(1, frameH)));
            const totalFrames = Math.round(sheet.width / Math.max(1, frameW));
            
            // 计算当前帧
            let frame;
            if (state.playerMoving) {
                frame = Math.floor(state.moveTimer * 8) % totalFrames;
            } else {
                // idle 状态使用固定第0帧，避免闪烁
                frame = 0;
            }
            
            // 保持宽高比缩放，底部对齐，水平居中
            const scale = TILE / Math.max(frameW, frameH);
            const drawW = frameW * scale;
            const drawH = frameH * scale;
            const drawX = px + (TILE - drawW) / 2;
            const drawY = py + TILE - drawH;
            
            ctx.drawImage(sheet, frame * frameW, 0, frameW, frameH, drawX, drawY, drawW, drawH);
        } else {
            // fallback: 绘制简单角色
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
            
            // 根据方向调整工具位置
            let tx = px + TILE / 2;
            let ty = py - 8;
            if (state.playerDir === 1) { // 上
                ty = py + TILE + 12;
            } else if (state.playerDir === 2) { // 左
                tx = px - 8;
                ty = py + TILE / 2;
            } else if (state.playerDir === 3) { // 右
                tx = px + TILE + 8;
                ty = py + TILE / 2;
            }
            ctx.fillText(toolEmoji, tx, ty);
        }
        
        // 玩家名字
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
            ctx.fillRect(p.x, p.y, p.size, p.size);
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
     * 渲染日夜循环效果
     */
    renderDayNight(ctx, state) {
        let overlayColor = null;
        let overlayAlpha = 0;
        
        if (state.timeOfDay >= 20 || state.timeOfDay < 5) {
            // 夜晚
            overlayColor = '#0a0a2e';
            overlayAlpha = 0.5;
        } else if (state.timeOfDay >= 18) {
            // 傍晚
            overlayColor = '#ff6b35';
            overlayAlpha = (state.timeOfDay - 18) / 2 * 0.3;
        } else if (state.timeOfDay < 7) {
            // 清晨
            overlayColor = '#87ceeb';
            overlayAlpha = (7 - state.timeOfDay) / 2 * 0.15;
        }
        
        if (overlayColor) {
            ctx.fillStyle = overlayColor;
            ctx.globalAlpha = overlayAlpha;
            ctx.fillRect(0, 0, this.screenW, this.screenH);
            ctx.globalAlpha = 1;
        }
        
        // 夜晚星星
        if (state.timeOfDay >= 19 || state.timeOfDay < 6) {
            ctx.fillStyle = '#fff';
            const starAlpha = state.timeOfDay >= 20 || state.timeOfDay < 5 ? 1 : 0.5;
            ctx.globalAlpha = starAlpha;
            for (const star of this.stars) {
                const sx = star.nx * this.screenW;
                const sy = star.ny * this.screenH;
                ctx.fillRect(sx, sy, star.size, star.size);
            }
            ctx.globalAlpha = 1;
        }
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
        
        // 背景
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(mmX - 5, mmY - 5, mmSize + 10, mmSize + 10);
        
        // 地图内容
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
        
        // 玩家位置
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(
            mmX + (state.playerX / TILE) * scaleX - 2,
            mmY + (state.playerY / TILE) * scaleY - 2,
            4, 4
        );
        
        // 视野框
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
