/**
 * 输入处理系统
 */
class InputHandler {
    constructor(state) {
        this.state = state;
        this.keys = {};
        this.lastInteract = 0;
        
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
    }
    
    onKeyDown(e) {
        this.keys[e.key.toLowerCase()] = true;
        
        // 工具切换
        if (e.key >= '1' && e.key <= '5') {
            this.setTool(parseInt(e.key) - 1);
        }
        
        // 互动
        if (e.key === ' ' || e.key === 'e' || e.key === 'Enter') {
            e.preventDefault();
            const now = Date.now();
            if (now - this.lastInteract > 300) {
                this.lastInteract = now;
                interact(this.state);
            }
        }
        
        // 地图
        if (e.key.toLowerCase() === 'm') {
            const mm = document.getElementById('minimap');
            mm.classList.toggle('active');
        }
        
        // 种子选择 (Q/E)
        if (e.key.toLowerCase() === 'q') {
            this.state.selectedSeed = (this.state.selectedSeed - 1 + CONFIG.CROPS.length) % CONFIG.CROPS.length;
            const crop = CONFIG.CROPS[this.state.selectedSeed];
            showToast(`种子: ${crop.emoji} ${crop.name}`);
        }
        if (e.key.toLowerCase() === 'e' && !e.repeat) {
            // E is used for interact above, use Tab for seed cycle forward
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            this.state.selectedSeed = (this.state.selectedSeed + 1) % CONFIG.CROPS.length;
            const crop = CONFIG.CROPS[this.state.selectedSeed];
            showToast(`种子: ${crop.emoji} ${crop.name}`);
        }
    }
    
    onKeyUp(e) {
        this.keys[e.key.toLowerCase()] = false;
    }
    
    setTool(index) {
        this.state.currentTool = index;
        
        // 更新 UI
        document.querySelectorAll('.tool-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.tool) === index);
        });
        
        const toolNames = ['锄头', '水壶', '种子袋', '收获篮', '铲子'];
        showToast(`工具: ${toolNames[index]}`);
    }
    
    /**
     * 处理移动 (每帧调用)
     */
    update(dt) {
        const state = this.state;
        let dx = 0, dy = 0;
        
        if (this.keys['w'] || this.keys['arrowup']) { dy = -1; state.playerDir = 1; }
        if (this.keys['s'] || this.keys['arrowdown']) { dy = 1; state.playerDir = 0; }
        if (this.keys['a'] || this.keys['arrowleft']) { dx = -1; state.playerDir = 2; }
        if (this.keys['d'] || this.keys['arrowright']) { dx = 1; state.playerDir = 3; }
        
        state.playerMoving = dx !== 0 || dy !== 0;
        
        if (state.playerMoving) {
            state.moveTimer += dt;
            
            // 归一化对角移动
            if (dx !== 0 && dy !== 0) {
                dx *= 0.707;
                dy *= 0.707;
            }
            
            const speed = PLAYER_SPEED;
            const nx = state.playerX + dx * speed;
            const ny = state.playerY + dy * speed;
            
            // 分轴碰撞
            if (canMove(state, nx, state.playerY)) {
                state.playerX = nx;
            }
            if (canMove(state, state.playerX, ny)) {
                state.playerY = ny;
            }
        }
    }
}
