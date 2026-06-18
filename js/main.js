/**
 * 游戏入口 - 星露谷风格 2D 联机种菜 (大世界版)
 */
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const state = new GameState();
    const renderer = new Renderer(canvas);
    let input = null;
    let lastTime = 0;
    let hudUpdateTimer = 0;

    // 暴露 state 到全局 (供商店按钮等使用)
    window.state = state;

    // ===== 登录处理 =====
    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('player-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') startGame();
    });

    // 工具栏点击
    document.querySelectorAll('.tool-item').forEach(el => {
        el.addEventListener('click', () => {
            const tool = parseInt(el.dataset.tool);
            if (tool <= 4 && input) {
                input.setTool(tool);
            }
            if (tool === 5) {
                document.getElementById('minimap').classList.toggle('active');
                state.showMinimap = !state.showMinimap;
            }
            if (tool === 6) {
                toggleInventory();
            }
        });
    });

    function startGame() {
        // 防止重复调用（快速双击等）
        if (state.running) return;

        const name = document.getElementById('player-name').value.trim();
        if (!name) {
            showToast('请输入你的名字！');
            return;
        }

        state.playerName = name;
        state.roomId = document.getElementById('room-id').value.trim() || `快乐农场${Math.floor(Math.random() * 999)}`;

        // 生成地图 (200x200 程序化 + 分块加载)
        generateMap(state);

        // 初始化输入
        input = new InputHandler(state);
        // 暴露到全局，供触控事件处理器访问
        window.input = input;

        // 预加载素材
        AssetsLoader.loadAll().then(() => {
            console.log('素材加载完成，游戏准备就绪');
        });

        // 绑定触控事件（手机摇杆等）
        if (typeof window._touchInit === 'function') {
            window._touchInit();
        }

        // 检测触摸设备，决定显示哪个工具栏
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (isTouchDevice) {
            document.getElementById('touch-controls').style.display = 'flex';
            document.getElementById('touch-toolbar').classList.add('active');
        } else {
            document.getElementById('toolbar').classList.add('active');
        }

        // 隐藏登录，显示游戏
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('hud').classList.add('active');
        document.getElementById('controls-hint').classList.add('active');

        // 更新 HUD
        const hudName = document.getElementById('hud-name');
        if (hudName) hudName.textContent = name;

        // 启动游戏循环
        state.running = true;
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);

        showToast(`欢迎来到 ${state.roomId}！`);

        // 5秒后隐藏控制提示
        setTimeout(() => {
            document.getElementById('controls-hint').classList.remove('active');
        }, 8000);
    }

    // ===== 游戏主循环 =====
    function gameLoop(timestamp) {
        if (!state.running) return;

        const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // 限制最大dt
        lastTime = timestamp;

        // 更新
        input.update(dt);
        tickCrops(state, dt);
        tickTime(state, dt);
        updateParticles(state, dt);
        updateNPCs(state, dt);
        updateFishing(state, dt);

        // 分块加载：玩家移动时动态扩展
        ensureChunksAroundPlayer(state);

        // 计算 timeOfDay (小时) 供 renderer 使用
        state.timeOfDay = state.time / 60;

        // 渲染
        renderer.render(state);

        // 更新 HUD (每0.5秒)
        hudUpdateTimer += dt;
        if (hudUpdateTimer > 0.5) {
            hudUpdateTimer = 0;
            updateHUD(state);
        }

        requestAnimationFrame(gameLoop);
    }

    // ===== HUD 更新 =====
    function updateHUD(state) {
        const coinsEl = document.getElementById('coins-display');
        if (coinsEl) coinsEl.textContent = state.coins;

        const seasonNames = { spring: '春', summer: '夏', fall: '秋', winter: '冬' };
        const dayEl = document.getElementById('day-display');
        if (dayEl) dayEl.textContent = `第 ${state.day} 天 · ${seasonNames[state.season] || '春'}`;

        const timeEl = document.getElementById('time-display');
        if (timeEl) timeEl.textContent = getTimeString(state.time);

        const h = state.time / 60;
        let weatherText = '晴朗';
        if (h < 6 || h > 20) { weatherText = '夜晚'; }
        else if (h < 8) { weatherText = '清晨'; }
        else if (h > 17) { weatherText = '黄昏'; }
        const weatherEl = document.getElementById('weather-display');
        if (weatherEl) weatherEl.textContent = weatherText;

        // 体力条
        const staminaFill = document.getElementById('stamina-bar-fill');
        const staminaText = document.getElementById('stamina-text');
        if (staminaFill && staminaText) {
            const pct = Math.max(0, Math.min(100, (state.energy / state.maxEnergy) * 100));
            staminaFill.style.width = pct + '%';
            staminaText.textContent = `${Math.floor(state.energy)}/${state.maxEnergy}`;
            if (pct < 25) staminaFill.classList.add('low');
            else staminaFill.classList.remove('low');
        }

        // 当前区域 (根据玩家位置实时计算)
        const areaEl = document.getElementById('area-display');
        if (areaEl && typeof getZone === 'function') {
            const zone = getZone(Math.floor(state.playerX), Math.floor(state.playerY));
            const areaNames = {
                'FARM': '农场', 'TOWN': '小镇', 'FOREST': '森林',
                'MINE': '矿洞', 'LAKE': '湖泊', 'WILD': '荒野'
            };
            areaEl.textContent = areaNames[zone] || '野外';
        }

        // 当前种子显示
        const crop = CONFIG.CROPS[state.selectedSeed];
        const seedTool = document.querySelector('.tool-item[data-tool="2"]');
        if (seedTool && crop) {
            seedTool.title = `${crop.emoji} ${crop.name} (${crop.price}💰) [3]`;
        }
    }

    // ===== 背包界面 =====
    function toggleInventory() {
        const dialogBox = document.getElementById('dialog-box');
        const speaker = document.getElementById('dialog-speaker');
        const text = document.getElementById('dialog-text');

        if (dialogBox.classList.contains('active') && !state.shopOpen) {
            dialogBox.classList.remove('active');
            return;
        }

        speaker.textContent = '🎒 背包';

        let html = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">';

        if (state.inventory.length === 0) {
            html += '<span style="color:#888;font-size:14px;">背包是空的</span>';
        } else {
            for (const item of state.inventory) {
                const qText = item.quality && item.quality.prefix ? ` ${item.quality.prefix}` : '';
                const qColor = item.quality ? item.quality.color : '#fff';
                html += `<div style="background:#3d2b1f;border:2px solid #5c3d1e;padding:6px 8px;text-align:center;min-width:60px;">
                    <div style="font-size:24px;">${item.emoji}</div>
                    <div style="font-size:10px;color:#f4e8c1;margin-top:2px;">${item.name}</div>
                    <div style="font-size:10px;color:${qColor};">${qText}x${item.qty}</div>
                    <div style="font-size:9px;color:#ffd93d;">${item.value}💰</div>
                </div>`;
            }
        }

        // 显示统计
        html += '</div>';
        html += `<div style="margin-top:10px;font-size:12px;color:#aaa;">
            💎 体力: ${state.energy}/${state.maxEnergy} |
            🪱 鱼饵: ${state.baitCount} |
            🏆 成就: ${state.achievements.length}
        </div>`;

        text.innerHTML = html;
        dialogBox.classList.add('active');
    }

    // ===== ESC 关闭商店/背包 =====
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (state.shopOpen) {
                closeShop(state);
            } else {
                const dialogBox = document.getElementById('dialog-box');
                if (dialogBox.classList.contains('active')) {
                    dialogBox.classList.remove('active');
                }
            }
        }
    });

    // 页面卸载保存
    window.addEventListener('beforeunload', () => {
        state.running = false;
    });

    console.log('🌾 星露谷风格农场 (200x200大世界) 已加载！');
});
