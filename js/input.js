/**
 * 输入处理系统 (键盘 + 触控摇杆)
 */
class InputHandler {
    constructor(state) {
        this.state = state;
        this.keys = {};
        this.lastInteract = 0;

        // 触控摇杆状态
        this.joystickDir = { x: 0, y: 0 };
        this.joystickActive = false;

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    onKeyDown(e) {
        this.keys[e.key.toLowerCase()] = true;

        // 工具切换
        if (e.key >= '1' && e.key <= '5') {
            this.setTool(parseInt(e.key) - 1);
        }

        // 互动 (空格/Enter)
        if (e.key === ' ' || e.key === 'Enter') {
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
            this.state.selectedSeed = (this.state.selectedSeed + 1) % CONFIG.CROPS.length;
            const crop = CONFIG.CROPS[this.state.selectedSeed];
            showToast(`种子: ${crop.emoji} ${crop.name}`);
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
        // 边界检查：工具索引必须在 0-4 范围内
        const toolNames = ['锄头', '水壶', '种子袋', '收获篮', '铲子'];
        if (index < 0 || index >= toolNames.length || !Number.isInteger(index)) return;
        this.state.currentTool = index;

        // 更新 UI (桌面工具栏)
        document.querySelectorAll('.tool-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.tool) === index);
        });

        // 更新触控工具栏
        document.querySelectorAll('.touch-tool-btn').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.tool) === index);
        });

        showToast(`工具: ${toolNames[index]}`);
    }

    /**
     * 设置摇杆方向 (供触控元素调用)
     * @param {number} dx - 水平方向 (-1 到 1)
     * @param {number} dy - 垂直方向 (-1 到 1)
     */
    setJoystickDir(dx, dy) {
        this.joystickDir.x = dx;
        this.joystickDir.y = dy;
        this.joystickActive = (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1);
        // 摇杆松开时清除方向，避免残留
        if (!this.joystickActive) {
            this.joystickDir.x = 0;
            this.joystickDir.y = 0;
        }
    }

    /**
     * 触控触发互动 (供触控元素调用)
     */
    triggerInteract() {
        const now = Date.now();
        if (now - this.lastInteract > 300) {
            this.lastInteract = now;
            interact(this.state);
        }
    }

    /**
     * 处理移动 (每帧调用) - 支持键盘和摇杆
     */
    update(dt) {
        const state = this.state;
        let dx = 0, dy = 0;

        // 摇杆优先
        if (this.joystickActive) {
            dx = this.joystickDir.x;
            dy = this.joystickDir.y;

            // 根据摇杆方向设置朝向
            if (Math.abs(dx) > Math.abs(dy)) {
                state.playerDir = dx > 0 ? 3 : 2; // 右 : 左
            } else {
                state.playerDir = dy > 0 ? 0 : 1; // 下 : 上
            }
        } else {
            // 键盘输入
            if (this.keys['w'] || this.keys['arrowup']) { dy = -1; state.playerDir = 1; }
            if (this.keys['s'] || this.keys['arrowdown']) { dy = 1; state.playerDir = 0; }
            if (this.keys['a'] || this.keys['arrowleft']) { dx = -1; state.playerDir = 2; }
            if (this.keys['d'] || this.keys['arrowright']) { dx = 1; state.playerDir = 3; }
        }

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
