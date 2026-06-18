/**
 * 像素风 UI 渲染和交互处理
 */
class GameUI {
    constructor(game) {
        this.game = game;
        this.animations = new PixelAnimations();
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
            loadingScreen: document.getElementById('loading-screen'),
            loginScreen: document.getElementById('login-screen'),
            gameScreen: document.getElementById('game-screen'),

            // 登录
            playerName: document.getElementById('player-name'),
            roomId: document.getElementById('room-id'),
            githubToken: document.getElementById('github-token'),
            githubRepo: document.getElementById('github-repo'),
            joinBtn: document.getElementById('join-btn'),

            // 游戏头部
            playerAvatar: document.getElementById('player-avatar'),
            currentPlayer: document.getElementById('current-player'),
            playerLevel: document.getElementById('player-level'),
            playerCoins: document.getElementById('player-coins'),
            gameTime: document.getElementById('game-time'),
            roomDisplay: document.getElementById('room-display'),
            onlineCount: document.getElementById('online-count'),

            // 游戏区域
            farmGrid: document.getElementById('farm-grid'),
            seedShop: document.getElementById('seed-shop'),
            inventory: document.getElementById('inventory'),
            playerList: document.getElementById('player-list'),
            gameLog: document.getElementById('game-log'),
            weatherIcon: document.getElementById('weather-icon'),
            weatherText: document.getElementById('weather-text'),

            // 工具栏
            tools: document.querySelectorAll('.tool-slot'),

            // 弹窗
            inviteModal: document.getElementById('invite-modal'),
            harvestModal: document.getElementById('harvest-modal'),
            inviteLink: document.getElementById('invite-link'),
            copyLinkBtn: document.getElementById('copy-link-btn'),
            closeModalBtns: document.querySelectorAll('.modal-close'),

            // 提示
            toast: document.getElementById('pixel-toast'),
            toastIcon: document.getElementById('toast-icon'),
            toastMessage: document.getElementById('toast-message'),

            // 按钮
            inviteBtn: document.getElementById('invite-btn'),
            saveBtn: document.getElementById('save-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            quitBtn: document.getElementById('quit-btn')
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

        // 弹窗关闭
        this.elements.closeModalBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.pixel-modal').classList.remove('active');
            });
        });

        // 复制链接
        this.elements.copyLinkBtn.addEventListener('click', () => this.copyInviteLink());

        // 游戏事件
        this.game.addEventListener('init', (e) => this.onGameInit(e.detail));
        this.game.addEventListener('plotsUpdate', (e) => this.renderPlots(e.detail));
        this.game.addEventListener('plotUpdate', (e) => this.updatePlot(e.detail));
        this.game.addEventListener('coinsChange', (e) => this.updateCoins(e.detail));
        this.game.addEventListener('playerJoin', (e) => this.onPlayerJoin(e.detail));
        this.game.addEventListener('playerLeave', (e) => this.onPlayerLeave(e.detail));
        this.game.addEventListener('log', (e) => this.addLog(e.detail));
        this.game.addEventListener('error', (e) => this.showToast(e.detail, 'error'));
        this.game.addEventListener('saved', () => this.showToast('游戏已保存！', 'success'));
        this.game.addEventListener('levelUp', (e) => this.onLevelUp(e.detail));
        this.game.addEventListener('weatherChange', (e) => this.onWeatherChange(e.detail));

        // 加载动画
        this.animations.animateLoading();
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
        this.elements.joinBtn.innerHTML = '<span class="btn-icon">⏳</span><span>加载中...</span>';

        try {
            const finalRoomId = await this.game.init(name, roomId, token, repo);

            // 切换屏幕
            this.animations.transitionScreen(this.elements.loginScreen, this.elements.gameScreen);

            // 初始化 UI
            this.renderSeedShop();
            this.renderPlots(this.game.plots);
            this.updateCoins(this.game.coins);
            this.elements.currentPlayer.textContent = name;
            this.elements.roomDisplay.textContent = finalRoomId;
            this.updateOnlineCount();
            this.renderInventory();

            this.showToast(`欢迎来到 ${finalRoomId}！`);
        } catch (error) {
            console.error('加入游戏失败:', error);
            this.showToast('进入游戏失败，请重试', 'error');
        } finally {
            this.elements.joinBtn.disabled = false;
            this.elements.joinBtn.innerHTML = '<span class="btn-icon">🚀</span><span>进入农场</span>';
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
                <span class="seed-name">${crop.name}</span>
                <span class="seed-price">💰 ${crop.price}</span>
                <span class="seed-time">⏱️ ${crop.growTime}秒</span>
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
            plotEl.className = `plot ${plot.crop ? 'planted' : ''} ${plot.water > 50 ? 'wet' : ''}`;
            plotEl.dataset.plotId = index;

            if (plot.crop) {
                const display = this.game.getCropDisplay(plot);
                const crop = CONFIG.CROPS.find(c => c.id === plot.crop);
                if (display && crop) {
                    plotEl.innerHTML = `
                        <div class="growth-indicator">
                            <div class="growth-fill" style="width: ${plot.growth}%"></div>
                        </div>
                        <span class="crop-sprite" style="transform: scale(${display.scale})">${display.emoji}</span>
                        <div class="water-indicator">
                            <div class="water-fill" style="width: ${plot.water}%"></div>
                        </div>
                        <div class="plot-tooltip">${crop.name} ${Math.floor(plot.growth)}%</div>
                    `;

                    if (plot.growth >= 100) {
                        plotEl.classList.add('ready');
                    }
                }
            } else {
                plotEl.innerHTML = '<span style="opacity: 0.2; font-size: 24px;">🌱</span>';
            }

            plotEl.addEventListener('click', () => this.handlePlotClick(index, plotEl));
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

        plotEl.className = `plot ${plot.crop ? 'planted' : ''} ${plot.water > 50 ? 'wet' : ''}`;

        if (plot.crop) {
            const display = this.game.getCropDisplay(plot);
            const crop = CONFIG.CROPS.find(c => c.id === plot.crop);
            if (display && crop) {
                plotEl.innerHTML = `
                    <div class="growth-indicator">
                        <div class="growth-fill" style="width: ${plot.growth}%"></div>
                    </div>
                    <span class="crop-sprite" style="transform: scale(${display.scale})">${display.emoji}</span>
                    <div class="water-indicator">
                        <div class="water-fill" style="width: ${plot.water}%"></div>
                    </div>
                    <div class="plot-tooltip">${crop.name} ${Math.floor(plot.growth)}%</div>
                `;

                if (plot.growth >= 100) {
                    plotEl.classList.add('ready');
                }
            }
        } else {
            plotEl.innerHTML = '<span style="opacity: 0.2; font-size: 24px;">🌱</span>';
        }
    }

    /**
     * 处理地块点击
     */
    handlePlotClick(plotId, plotEl) {
        const tool = this.game.currentTool;
        const plot = this.game.plots[plotId];

        // 点击反馈动画
        this.animations.animateClick(plotEl);

        const result = this.game.clickPlot(plotId);
        
        if (result) {
            switch (tool) {
                case 'cursor':
                    if (this.game.selectedSeed && !plot.crop) {
                        this.animations.animatePlant(plotEl);
                    }
                    break;
                case 'water':
                    this.animations.animateWater(plotEl);
                    break;
                case 'fertilize':
                    this.animations.animateFertilize(plotEl);
                    break;
                case 'harvest':
                    if (plot.crop && plot.growth >= 100) {
                        const crop = CONFIG.CROPS.find(c => c.id === plot.crop);
                        const sellPrice = plot.fertilized ? Math.floor(crop.sellPrice * 1.2) : crop.sellPrice;
                        this.animations.animateHarvest(plotEl, crop.emoji, sellPrice);
                    }
                    break;
                case 'remove':
                    this.animations.animateRemove(plotEl);
                    break;
            }
        }
    }

    /**
     * 更新金币显示
     */
    updateCoins(coins) {
        const coinEl = this.elements.playerCoins;
        const oldCoins = parseInt(coinEl.textContent);
        
        if (coins > oldCoins) {
            this.animations.animateCoinIncrease(coinEl, coins - oldCoins);
        }
        
        coinEl.textContent = coins;
    }

    /**
     * 渲染背包
     */
    renderInventory() {
        const container = this.elements.inventory;
        container.innerHTML = '';

        // 示例背包物品
        const items = [
            { emoji: '🥕', count: 5 },
            { emoji: '🍅', count: 3 },
            { emoji: '🌽', count: 2 },
            { emoji: '🎃', count: 1 }
        ];

        items.forEach(item => {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            slot.innerHTML = `
                <span>${item.emoji}</span>
                <span class="slot-count">${item.count}</span>
            `;
            container.appendChild(slot);
        });

        // 填充空槽
        for (let i = items.length; i < 8; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            slot.style.opacity = '0.3';
            container.appendChild(slot);
        }
    }

    /**
     * 更新在线人数
     */
    updateOnlineCount() {
        const count = this.game.getOnlineCount();
        this.elements.onlineCount.textContent = count;
    }

    /**
     * 玩家加入
     */
    onPlayerJoin({ peerId, player }) {
        this.updateOnlineCount();
        this.renderPlayerList();
        this.showToast(`${player.name || '新玩家'} 加入了农场！`, 'success');
        
        // 欢迎粒子
        const rect = this.elements.onlineCount.getBoundingClientRect();
        this.animations.spawnParticles(rect.left, rect.top, '👋', 3);
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
                <div class="player-avatar-small">${player.name ? player.name[0] : '?'}</div>
                <span class="player-name-text">${player.name}${player.isSelf ? ' (你)' : ''}</span>
                <span class="player-status-dot"></span>
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
        container.insertBefore(item, container.firstChild);

        // 限制日志数量
        while (container.children.length > 30) {
            container.removeChild(container.lastChild);
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
     * 复制邀请链接
     */
    copyInviteLink() {
        this.elements.inviteLink.select();
        document.execCommand('copy');
        this.showToast('链接已复制！', 'success');
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
     * 升级回调
     */
    onLevelUp({ level }) {
        this.elements.playerLevel.textContent = level;
        this.animations.animateLevelUp();
        this.showToast(`恭喜升级到 Lv.${level}！`, 'success');
    }

    /**
     * 天气变化
     */
    onWeatherChange({ type, icon, text }) {
        this.elements.weatherIcon.textContent = icon;
        this.elements.weatherText.textContent = text;
        this.animations.animateWeather(type);
    }

    /**
     * 显示提示消息
     */
    showToast(message, type = 'info') {
        const toast = this.elements.toast;
        const icon = this.elements.toastIcon;
        const msg = this.elements.toastMessage;

        msg.textContent = message;

        switch (type) {
            case 'error':
                icon.textContent = '❌';
                toast.style.borderColor = '#ff6b6b';
                break;
            case 'success':
                icon.textContent = '✅';
                toast.style.borderColor = '#4ade80';
                break;
            case 'warning':
                icon.textContent = '⚠️';
                toast.style.borderColor = '#ffd93d';
                break;
            default:
                icon.textContent = 'ℹ️';
                toast.style.borderColor = 'var(--pixel-white)';
        }

        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameUI;
}
