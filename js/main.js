/**
 * 游戏入口 - 星露谷风格 2D 联机种菜
 */
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const state = new GameState();
    const renderer = new Renderer(canvas);
    let input = null;
    let lastTime = 0;
    let hudUpdateTimer = 0;
    
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
            }
        });
    });
    
    function startGame() {
        const name = document.getElementById('player-name').value.trim();
        if (!name) {
            showToast('请输入你的名字！');
            return;
        }

        state.playerName = name;
        state.roomId = document.getElementById('room-id').value.trim() || `快乐农场${Math.floor(Math.random()*999)}`;

        // 生成地图
        generateMap(state);

        // 初始化输入
        input = new InputHandler(state);

        // 预加载素材
        AssetsLoader.loadAll().then(() => {
            console.log('素材加载完成，游戏准备就绪');
        });

        // 隐藏登录，显示游戏
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('hud').classList.add('active');
        document.getElementById('toolbar').classList.add('active');
        document.getElementById('controls-hint').classList.add('active');
        
        // 更新 HUD
        document.getElementById('hud-name').textContent = name;
        document.getElementById('hud-room').textContent = state.roomId;
        
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
        document.getElementById('hud-coins').textContent = state.coins;
        document.getElementById('hud-day').textContent = `第 ${state.day} 天`;
        document.getElementById('hud-time').textContent = getTimeString(state.time);
        
        const seasonNames = { spring: '🌸春', summer: '☀️夏', fall: '🍂秋', winter: '❄️冬' };
        document.getElementById('hud-season').textContent = seasonNames[state.season] || '🌸春';
        
        const h = state.time / 60;
        let weatherIcon = '☀️', weatherText = '晴朗';
        if (h < 6 || h > 20) { weatherIcon = '🌙'; weatherText = '夜晚'; }
        else if (h < 8) { weatherIcon = '🌅'; weatherText = '清晨'; }
        else if (h > 17) { weatherIcon = '🌇'; weatherText = '黄昏'; }
        document.getElementById('hud-weather').textContent = weatherText;
        
        // 当前种子显示
        const crop = CONFIG.CROPS[state.selectedSeed];
        const seedTool = document.querySelector('.tool-item[data-tool="2"]');
        if (seedTool) {
            seedTool.title = `${crop.emoji} ${crop.name} (${crop.price}💰) [3]`;
        }
    }
    
    // 页面卸载保存
    window.addEventListener('beforeunload', () => {
        state.running = false;
    });
    
    console.log('🌾 星露谷风格农场已加载！');
});
