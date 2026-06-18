/**
 * 游戏核心逻辑
 */
class FarmGame extends EventTarget {
    constructor() {
        super();
        this.player = null;
        this.roomId = null;
        this.plots = [];           // 地块数据
        this.players = new Map();  // 其他玩家
        this.selectedSeed = null;  // 选中的种子
        this.currentTool = 'cursor';
        this.coins = CONFIG.GAME.INITIAL_COINS;
        this.tickTimer = null;
        this.gameTime = 0;
        this.backend = null;
        this.webrtc = null;
        this.isHost = false;
    }

    /**
     * 初始化游戏
     */
    async init(playerName, roomId, githubToken, githubRepo) {
        this.player = {
            id: this.generateId(),
            name: playerName,
            joinTime: Date.now()
        };

        this.roomId = roomId || this.generateRoomId();
        this.isHost = !roomId;

        // 初始化后端
        if (githubToken && githubRepo) {
            this.backend = new GitHubBackend(githubToken, githubRepo);
            window.githubBackend = this.backend;
        }

        // 初始化地块
        this.initPlots();

        // 加载存档
        await this.loadGame();

        // 初始化联机
        await this.initNetworking();

        // 启动游戏循环
        this.startGameLoop();

        // 保存房间信息
        if (this.backend) {
            await this.backend.addRoomToList(this.roomId, {
                host: this.player.name,
                created: Date.now(),
                players: 1
            });
        }

        this.emit('init', { player: this.player, roomId: this.roomId });
        return this.roomId;
    }

    /**
     * 生成唯一ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    }

    /**
     * 生成房间ID
     */
    generateRoomId() {
        const adjectives = ['快乐', '阳光', '绿色', '丰收', '田园', '温馨', '美丽', '宁静'];
        const nouns = ['农场', '菜园', '庄园', '田地', '果园', '花园', '牧场', '农庄'];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        return `${adj}${noun}${Math.floor(Math.random() * 1000)}`;
    }

    /**
     * 初始化地块
     */
    initPlots() {
        const total = CONFIG.GAME.GRID_ROWS * CONFIG.GAME.GRID_COLS;
        this.plots = [];
        for (let i = 0; i < total; i++) {
            this.plots.push({
                id: i,
                crop: null,       // 作物类型
                plantedAt: 0,     // 种植时间
                water: 50,        // 水分 (0-100)
                growth: 0,        // 生长进度 (0-100)
                fertilized: false,// 是否施肥
                owner: null       // 种植者
            });
        }
    }

    /**
     * 初始化网络
     */
    async initNetworking() {
        this.webrtc = new WebRTCManager();

        // 设置消息处理
        this.webrtc.onMessage((peerId, data) => {
            this.handleNetworkMessage(peerId, data);
        });

        // 设置连接回调
        this.webrtc.onPeerConnect((peerId) => {
            console.log(`[Game] 玩家连接: ${peerId}`);
            this.broadcastState();
        });

        this.webrtc.onPeerDisconnect((peerId) => {
            console.log(`[Game] 玩家断开: ${peerId}`);
            this.players.delete(peerId);
            this.emit('playerLeave', { peerId });
        });

        // 创建信令服务
        let signaling = null;
        if (this.backend && this.backend.isEnabled()) {
            signaling = new GitHubSignaling(this.backend);
        }

        // 加入房间
        await this.webrtc.joinRoom(this.roomId, signaling);

        // 定期同步
        setInterval(() => this.syncState(), 5000);
    }

    /**
     * 处理网络消息
     */
    handleNetworkMessage(peerId, data) {
        switch (data.type) {
            case 'state':
                this.handleStateSync(data.state);
                break;
            case 'action':
                this.handleRemoteAction(data.action);
                break;
            case 'player-info':
                this.players.set(peerId, data.player);
                this.emit('playerJoin', { peerId, player: data.player });
                break;
            case 'chat':
                this.emit('chat', { peerId, message: data.message });
                break;
        }
    }

    /**
     * 处理状态同步
     */
    handleStateSync(state) {
        if (state.plots) {
            // 合并地块状态（以最新为准）
            state.plots.forEach((remotePlot, index) => {
                if (index < this.plots.length) {
                    const localPlot = this.plots[index];
                    // 如果远程地块有作物且本地没有，或远程更新，则同步
                    if (remotePlot.crop && (!localPlot.crop || remotePlot.plantedAt > localPlot.plantedAt)) {
                        this.plots[index] = { ...remotePlot };
                    }
                }
            });
            this.emit('plotsUpdate', this.plots);
        }

        if (state.players) {
            state.players.forEach((player, id) => {
                if (id !== this.player.id) {
                    this.players.set(id, player);
                }
            });
            this.emit('playersUpdate', Array.from(this.players.values()));
        }
    }

    /**
     * 处理远程操作
     */
    handleRemoteAction(action) {
        switch (action.action) {
            case 'plant':
                this.plantCrop(action.plotId, action.cropId, false);
                break;
            case 'water':
                this.waterPlot(action.plotId, false);
                break;
            case 'fertilize':
                this.fertilizePlot(action.plotId, false);
                break;
            case 'harvest':
                this.harvestPlot(action.plotId, false);
                break;
            case 'remove':
                this.removeCrop(action.plotId, false);
                break;
        }
    }

    /**
     * 广播游戏状态
     */
    broadcastState() {
        const state = {
            type: 'state',
            state: {
                plots: this.plots,
                players: Array.from(this.players.entries()),
                gameTime: this.gameTime
            }
        };

        this.webrtc.broadcast(state);
    }

    /**
     * 同步状态到 GitHub
     */
    async syncState() {
        if (this.backend) {
            await this.backend.saveFarmData(this.roomId, {
                plots: this.plots,
                gameTime: this.gameTime,
                lastUpdate: Date.now()
            });
        }
    }

    /**
     * 发送操作广播
     */
    broadcastAction(action, data) {
        const message = {
            type: 'action',
            action: action,
            ...data,
            playerId: this.player.id,
            timestamp: Date.now()
        };

        this.webrtc.broadcast(message);

        // 同时保存到 GitHub
        if (this.backend) {
            this.backend.sendEvent(this.roomId, message);
        }
    }

    /**
     * 启动游戏循环
     */
    startGameLoop() {
        this.tickTimer = setInterval(() => {
            this.tick();
        }, CONFIG.GAME.TICK_INTERVAL);
    }

    /**
     * 游戏心跳
     */
    tick() {
        this.gameTime++;

        let updated = false;
        this.plots.forEach(plot => {
            if (plot.crop) {
                // 水分衰减
                plot.water = Math.max(0, plot.water - CONFIG.GAME.WATER_DECAY);

                // 生长逻辑
                if (plot.water > 0 && plot.growth < 100) {
                    const crop = CONFIG.CROPS.find(c => c.id === plot.crop);
                    if (crop) {
                        let growthRate = CONFIG.GAME.GROWTH_RATE;
                        if (plot.fertilized) growthRate *= 1.5;
                        if (plot.water < crop.waterNeed) growthRate *= 0.5;

                        plot.growth = Math.min(100, plot.growth + growthRate);
                        updated = true;
                    }
                }

                // 水分过低作物死亡
                if (plot.water <= 0 && plot.growth < 100) {
                    plot.growth = Math.max(0, plot.growth - 1);
                }
            }
        });

        if (updated) {
            this.emit('plotsUpdate', this.plots);
        }

        // 每秒广播一次状态
        if (this.gameTime % 5 === 0) {
            this.broadcastState();
        }
    }

    /**
     * 选择种子
     */
    selectSeed(cropId) {
        this.selectedSeed = cropId;
        this.currentTool = 'cursor';
        this.emit('seedSelected', cropId);
    }

    /**
     * 选择工具
     */
    selectTool(tool) {
        this.currentTool = tool;
        this.emit('toolSelected', tool);
    }

    /**
     * 点击地块
     */
    clickPlot(plotId) {
        const plot = this.plots[plotId];
        if (!plot) return false;

        switch (this.currentTool) {
            case 'cursor':
                return this.plantCrop(plotId, this.selectedSeed);
            case 'water':
                return this.waterPlot(plotId);
            case 'fertilize':
                return this.fertilizePlot(plotId);
            case 'harvest':
                return this.harvestPlot(plotId);
            case 'remove':
                return this.removeCrop(plotId);
            default:
                return false;
        }
    }

    /**
     * 种植作物
     */
    plantCrop(plotId, cropId, broadcast = true) {
        const plot = this.plots[plotId];
        if (!plot || plot.crop || !cropId) return false;

        const crop = CONFIG.CROPS.find(c => c.id === cropId);
        if (!crop) return false;

        if (this.coins < crop.price) {
            this.emit('error', '金币不足！');
            return false;
        }

        this.coins -= crop.price;
        plot.crop = cropId;
        plot.plantedAt = Date.now();
        plot.water = 50;
        plot.growth = 0;
        plot.fertilized = false;
        plot.owner = this.player.id;

        this.emit('plotUpdate', { plotId, plot });
        this.emit('coinsChange', this.coins);

        if (broadcast) {
            this.broadcastAction('plant', { plotId, cropId });
            this.addLog(`种植了 ${crop.name}`);
        }

        return true;
    }

    /**
     * 浇水
     */
    waterPlot(plotId, broadcast = true) {
        const plot = this.plots[plotId];
        if (!plot || !plot.crop) return false;

        const tool = CONFIG.TOOLS.water;
        plot.water = Math.min(CONFIG.GAME.MAX_WATER, plot.water + tool.effect);

        this.emit('plotUpdate', { plotId, plot });

        if (broadcast) {
            this.broadcastAction('water', { plotId });
            this.addLog('浇了水');
        }

        return true;
    }

    /**
     * 施肥
     */
    fertilizePlot(plotId, broadcast = true) {
        const plot = this.plots[plotId];
        if (!plot || !plot.crop || plot.fertilized) return false;

        const tool = CONFIG.TOOLS.fertilize;
        if (this.coins < tool.cost) {
            this.emit('error', '金币不足！');
            return false;
        }

        this.coins -= tool.cost;
        plot.fertilized = true;

        this.emit('plotUpdate', { plotId, plot });
        this.emit('coinsChange', this.coins);

        if (broadcast) {
            this.broadcastAction('fertilize', { plotId });
            this.addLog('施了肥');
        }

        return true;
    }

    /**
     * 收获
     */
    harvestPlot(plotId, broadcast = true) {
        const plot = this.plots[plotId];
        if (!plot || !plot.crop || plot.growth < 100) return false;

        const crop = CONFIG.CROPS.find(c => c.id === plot.crop);
        if (!crop) return false;

        // 计算收益
        let sellPrice = crop.sellPrice;
        if (plot.fertilized) sellPrice = Math.floor(sellPrice * 1.2);

        this.coins += sellPrice;

        // 清空地块
        const cropName = crop.name;
        plot.crop = null;
        plot.plantedAt = 0;
        plot.water = 50;
        plot.growth = 0;
        plot.fertilized = false;
        plot.owner = null;

        this.emit('plotUpdate', { plotId, plot });
        this.emit('coinsChange', this.coins);

        if (broadcast) {
            this.broadcastAction('harvest', { plotId });
            this.addLog(`收获了 ${cropName}，获得 ${sellPrice} 金币`);
        }

        return true;
    }

    /**
     * 铲除作物
     */
    removeCrop(plotId, broadcast = true) {
        const plot = this.plots[plotId];
        if (!plot || !plot.crop) return false;

        const crop = CONFIG.CROPS.find(c => c.id === plot.crop);
        const cropName = crop ? crop.name : '作物';

        plot.crop = null;
        plot.plantedAt = 0;
        plot.water = 50;
        plot.growth = 0;
        plot.fertilized = false;
        plot.owner = null;

        this.emit('plotUpdate', { plotId, plot });

        if (broadcast) {
            this.broadcastAction('remove', { plotId });
            this.addLog(`铲除了 ${cropName}`);
        }

        return true;
    }

    /**
     * 添加日志
     */
    addLog(message) {
        const log = {
            time: new Date().toLocaleTimeString(),
            message: `${this.player.name}: ${message}`
        };
        this.emit('log', log);
    }

    /**
     * 发送聊天消息
     */
    sendChat(message) {
        this.webrtc.broadcast({
            type: 'chat',
            message: message,
            player: this.player.name
        });
        this.addLog(`[聊天] ${message}`);
    }

    /**
     * 保存游戏
     */
    async saveGame() {
        const data = {
            player: this.player,
            plots: this.plots,
            coins: this.coins,
            gameTime: this.gameTime,
            savedAt: Date.now()
        };

        // 保存到本地
        localStorage.setItem(CONFIG.STORAGE.FARM, JSON.stringify(data));

        // 保存到 GitHub
        if (this.backend) {
            await this.backend.savePlayerData(this.player.id, {
                ...this.player,
                coins: this.coins,
                totalPlayTime: this.gameTime
            });
            await this.backend.saveFarmData(this.roomId, data);
        }

        this.emit('saved');
        return true;
    }

    /**
     * 加载游戏
     */
    async loadGame() {
        // 尝试从本地加载
        const localData = localStorage.getItem(CONFIG.STORAGE.FARM);
        if (localData) {
            try {
                const data = JSON.parse(localData);
                if (data.plots) this.plots = data.plots;
                if (data.coins) this.coins = data.coins;
                if (data.gameTime) this.gameTime = data.gameTime;
            } catch (e) {
                console.error('加载本地存档失败:', e);
            }
        }

        // 尝试从 GitHub 加载
        if (this.backend) {
            const farmData = await this.backend.loadFarmData(this.roomId);
            if (farmData && farmData.plots) {
                // GitHub 数据优先（如果更新）
                if (!localData || farmData.savedAt > JSON.parse(localData).savedAt) {
                    this.plots = farmData.plots;
                    if (farmData.coins) this.coins = farmData.coins;
                    if (farmData.gameTime) this.gameTime = farmData.gameTime;
                }
            }
        }

        this.emit('loaded');
    }

    /**
     * 获取作物显示信息
     */
    getCropDisplay(plot) {
        if (!plot.crop) return null;

        const crop = CONFIG.CROPS.find(c => c.id === plot.crop);
        if (!crop) return null;

        let emoji = crop.emoji;
        let scale = 0.5 + (plot.growth / 200); // 0.5 - 1.0

        // 根据生长阶段调整显示
        if (plot.growth < 30) {
            emoji = '🌱';
            scale = 0.6;
        } else if (plot.growth < 60) {
            emoji = '🌿';
            scale = 0.8;
        } else if (plot.growth < 100) {
            scale = 0.9;
        }

        return { emoji, scale, name: crop.name };
    }

    /**
     * 获取在线玩家数
     */
    getOnlineCount() {
        return this.webrtc ? this.webrtc.getPeers().length + 1 : 1;
    }

    /**
     * 获取所有玩家列表
     */
    getAllPlayers() {
        const list = [{ ...this.player, isSelf: true }];
        for (const [id, player] of this.players) {
            list.push({ ...player, id, isSelf: false });
        }
        return list;
    }

    /**
     * 触发事件
     */
    emit(eventName, data) {
        this.dispatchEvent(new CustomEvent(eventName, { detail: data }));
    }

    /**
     * 销毁游戏
     */
    destroy() {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }

        if (this.webrtc) {
            this.webrtc.leaveRoom();
        }

        this.saveGame();
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FarmGame;
}
