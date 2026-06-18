/**
 * UI 渲染和交互处理
 */
class GameUI {
    constructor(game) {
        this.game = game;
        this.elements = {};
        this.initElements();
        this.bindEvents();
    }

    /**
     * 初始化 DOM 元素引用
     */
    initElements() {
        this.elements = {
            // 屏幕
            loginScreen: document.getElementById('login-screen'),
            gameScreen: document.getElementById('game-screen'),

            // 登录
            playerName: document.getElementById('player-name'),
            roomId: document.getElementById('room-id'),
            githubToken: document.getElementById('github-token'),
            githubRepo: document.getElementById('github-repo'),
            joinBtn: document.getElementById('join-btn'),

            // 游戏头部
            currentPlayer: document.getElementById('current-player'),
            playerCoins: document.getElementById('player-coins'),
            roomDisplay: document.getElementById('room-display'),
            onlineCount: document.getElementById('online-count'),
            inviteBtn: document.getElementById('invite-btn'),
            saveBtn: document.getElementById('save-btn'),
            quitBtn: document.getElementById('quit-btn'),

            // 游戏区域
            farmGrid: document.getElementById('farm-grid'),
            seedShop: document.getElementById('seed-shop'),
            playerList: document.getElementById('player-list'),
            gameLog: document.getElementById('game-log'),

            // 工具栏
            tools: document.querySelectorAll('.tool'),

            // 弹窗
            inviteModal: document.getElementById('invite-modal'),
            inviteLink: document.getElementById('invite-link'),
            copyLinkBtn: document.getElementById('copy-link-btn'),
            closeModalBtns: document.querySelectorAll('.close-modal'),

            // 提示
            toast: document.getElementById('toast')
        };
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 登录
        this.elements.joinBtn.addEventListener('click', () => this.handleJoin());

        // 工具栏
        this.elements.tools.forEach(tool => {
            tool.addEventListener('click', () => this.selectTool(tool.dataset.tool));
        });

        // 头部按钮
        this.elements.inviteBtn.addEventListener('click', () => this.showInviteModal());
        this.elements.saveBtn.addEventListener('click', () => this.handleSave());
        this.elements.quitBtn.addEventListener('click', () => this.handleQuit());

        // 弹窗
        this.elements.copyLinkBtn.addEventListener('click', () => this.copyInviteLink());
        this.elements.closeModalBtns.forEach(btn => {
            btn.addEventListener('click', () => this.hideModal());
        });

        // 游戏事件
        this.game.addEventListener('init', (e) => this.onGameInit(e.detail));
        this.game.addEventListener('plotsUpdate', (e) => this.renderPlots(e.detail));
        this.game.addEventListener('plotUpdate', (e) => this.updatePlot(e.detail));
        this.game.addEventListener('coinsChange', (e) => this.updateCoins(e.detail));
        this.game.addEventListener('playerJoin', (e) => this.onPlayerJoin(e.detail));
        this.game.addEventListener('playerLeave', (e) => this.onPlayerLeave(e.detail));
        this.game.addEventListener('log', (e) => this.addLog(e.detail));
        this.game.addEventListener('error', (e) => this.showToast(e.detail, 'error'));
        this.game.addEventListener('saved', () => this.showToast('游戏已保存！'));
    }

    /**
     * 处理加入游戏
     */
    async handleJoin() {
        const name = this.elements.playerName.value.trim();
        if (!name) {
            this.showToast('请输入你的名字！', 'error');
            return;
        }

        const roomId = this.elements.roomId.value.trim();
        const token = this.elements.githubToken.value.trim();
        const repo = this.elements.githubRepo.value.trim();

        this.elements.joinBtn.disabled = true;
        this.elements.joinBtn.textContent = '正在进入...';

        try {
            const finalRoomId = await this.game.init(name, roomId, token, repo);

            // 切换屏幕
            this.elements.loginScreen.classList.remove('active');
            this.elements.gameScreen.classList.add('active');

            // 初始化 UI
            this.renderSeedShop();
            this.renderPlots(this.game.plots);
            this.updateCoins(this.game.coins);
            this.elements.currentPlayer.textContent = `👤 ${name}`;
            this.elements.roomDisplay.textContent = `🏠 房间: ${finalRoomId}`;
            this.updateOnlineCount();

            this.showToast(`欢迎来到 ${finalRoomId}！`);
        } catch (error) {
            console.error('加入游戏失败:', error);
            this.showToast('进入游戏失败，请重试', 'error');
        } finally {
            this.elements.joinBtn.disabled = false;
            this.elements.joinBtn.textContent = '🚀 进入农场';
        }
    }

    /**
     * 游戏初始化回调
     */
    onGameInit(data) {
        console.log('游戏初始化:', data);
    }

    /**
     * 渲染种子商店
     */
    renderSeedShop() {
        const container = this.elements.seedShop;
        container.innerHTML = '';

        CONFIG.CROPS.forEach(crop => {
            const item = document.createElement('div');
            item.className = 'seed-item';
            item.dataset.cropId = crop.id;
            item.innerHTML = `
                <span class="seed-emoji">${crop.emoji}</span>
                <div class="seed-info">
                    <div class="seed-name">${crop.name}</div>
                    <div class="seed-price">💰 ${crop.price}</div>
                    <div class="seed-time">⏱️ ${crop.growTime}秒</div>
                </div>
            `;

            item.addEventListener('click', () => this.selectSeed(crop.id, item));
            container.appendChild(item);
        });
    }

    /**
     * 选择种子
     */
    selectSeed(cropId, element) {
        this.game.selectSeed(cropId);

        // 更新 UI
        this.elements.seedShop.querySelectorAll('.seed-item').forEach(item => {
            item.classList.remove('selected');
        });
        element.classList.add('selected');

        const crop = CONFIG.CROPS.find(c => c.id === cropId);
        this.showToast(`已选择 ${crop.name} 种子`);
    }

    /**
     * 选择工具
     */
    selectTool(tool) {
        this.game.selectTool(tool);

        // 更新 UI
        this.elements.tools.forEach(t => {
            t.classList.toggle('active', t.dataset.tool === tool);
        });
    }

    /**
     * 渲染农场地块
     */
    renderPlots(plots) {
        const container = this.elements.farmGrid;
        container.innerHTML = '';

        plots.forEach((plot, index) => {
            const plotEl = document.createElement('div');
            plotEl.className = `plot ${plot.crop ? 'planted' : 'empty'}`;
            plotEl.dataset.plotId = index;

            if (plot.crop) {
                const display = this.game.getCropDisplay(plot);
                if (display) {
                    plotEl.innerHTML = `
                        <div class="water-bar">
                            <div class="water-fill" style="width: ${plot.water}%"></div>
                        </div>
                        <span class="crop-emoji" style="transform: scale(${display.scale})">${display.emoji}</span>
                        <div class="growth-bar">
                            <div class="growth-fill" style="width: ${plot.growth}%"></div>
                        </div>
                        <div class="crop-info">${Math.floor(plot.growth)}%</div>
                    `;

                    if (plot.growth >= 100) {
                        plotEl.classList.add('ready');
                    }
                }
            } else {
                plotEl.innerHTML = '<span style="opacity: 0.3; font-size: 1.5em;">🌱</span>';
            }

            plotEl.addEventListener('click', () => this.handlePlotClick(index));
            container.appendChild(plotEl);
        });
    }

    /**
     * 更新单个地块
     */
    updatePlot({ plotId, plot }) {
        const plotEls = this.elements.farmGrid.querySelectorAll('.plot');
        const plotEl = plotEls[plotId];
        if (!plotEl) return;

        plotEl.className = `plot ${plot.crop ? 'planted' : 'empty'}`;

        if (plot.crop) {
            const display = this.game.getCropDisplay(plot);
            if (display) {
                plotEl.innerHTML = `
                    <div class="water-bar">
                        <div class="water-fill" style="width: ${plot.water}%"></div>
                    </div>
                    <span class="crop-emoji" style="transform: scale(${display.scale})">${display.emoji}</span>
                    <div class="growth-bar">
                        <div class="growth-fill" style="width: ${plot.growth}%"></div>
                    </div>
                    <div class="crop-info">${Math.floor(plot.growth)}%</div>
                `;

                if (plot.growth >= 100) {
                    plotEl.classList.add('ready');
                }
            }
        } else {
            plotEl.innerHTML = '<span style="opacity: 0.3; font-size: 1.5em;">🌱</span>';
        }
    }

    /**
     * 处理地块点击
     */
    handlePlotClick(plotId) {
        const result = this.game.clickPlot(plotId);
        if (result) {
            // 播放音效或动画效果
            const plotEl = this.elements.farmGrid.querySelectorAll('.plot')[plotId];
            if (plotEl) {
                plotEl.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    plotEl.style.transform = '';
                }, 100);
            }
        }
    }

    /**
     * 更新金币显示
     */
    updateCoins(coins) {
        this.elements.playerCoins.textContent = `💰 ${coins}`;
    }

    /**
     * 更新在线人数
     */
    updateOnlineCount() {
        const count = this.game.getOnlineCount();
        this.elements.onlineCount.textContent = `🟢 在线: ${count}`;
    }

    /**
     * 玩家加入
     */
    onPlayerJoin({ peerId, player }) {
        this.updateOnlineCount();
        this.renderPlayerList();
        this.showToast(`${player.name || '新玩家'} 加入了农场！`);
    }

    /**
     * 玩家离开
     */
    onPlayerLeave({ peerId }) {
        this.updateOnlineCount();
        this.renderPlayerList();
    }

    /**
     * 渲染玩家列表
     */
    renderPlayerList() {
        const container = this.elements.playerList;
        container.innerHTML = '';

        const players = this.game.getAllPlayers();
        players.forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-item';
            item.innerHTML = `
                <div class="player-avatar">${player.name ? player.name[0] : '?'}</div>
                <span class="player-name">${player.name}${player.isSelf ? ' (你)' : ''}</span>
                <span class="player-status"></span>
            `;
            container.appendChild(item);
        });
    }

    /**
     * 添加日志
     */
    addLog(log) {
        const container = this.elements.gameLog;
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `<span class="log-time">${log.time}</span>${log.message}`;
        container.appendChild(item);
        container.scrollTop = container.scrollHeight;

        // 限制日志数量
        while (container.children.length > 50) {
            container.removeChild(container.firstChild);
        }
    }

    /**
     * 显示邀请弹窗
     */
    showInviteModal() {
        const url = new URL(window.location.href);
        url.searchParams.set('room', this.game.roomId);
        this.elements.inviteLink.value = url.toString();
        this.elements.inviteModal.classList.add('active');
    }

    /**
     * 隐藏弹窗
     */
    hideModal() {
        this.elements.inviteModal.classList.remove('active');
    }

    /**
     * 复制邀请链接
     */
    copyInviteLink() {
        this.elements.inviteLink.select();
        document.execCommand('copy');
        this.showToast('链接已复制！');
    }

    /**
     * 保存游戏
     */
    async handleSave() {
        await this.game.saveGame();
    }

    /**
     * 退出游戏
     */
    handleQuit() {
        if (confirm('确定要退出农场吗？')) {
            this.game.destroy();
            location.reload();
        }
    }

    /**
     * 显示提示消息
     */
    showToast(message, type = 'info') {
        const toast = this.elements.toast;
        toast.textContent = message;
        toast.className = 'toast show';

        if (type === 'error') {
            toast.style.background = '#f44336';
        } else {
            toast.style.background = 'rgba(0,0,0,0.8)';
        }

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameUI;
}
