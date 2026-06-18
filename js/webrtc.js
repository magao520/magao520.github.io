/**
 * WebRTC P2P 联机模块
 * 实现浏览器之间的点对点直连通信
 */
class WebRTCManager {
    constructor() {
        this.connections = new Map(); // peerId -> RTCPeerConnection
        this.dataChannels = new Map(); // peerId -> RTCDataChannel
        this.localId = this.generateId();
        this.roomId = null;
        this.onMessageCallback = null;
        this.onPeerConnectCallback = null;
        this.onPeerDisconnectCallback = null;
        this.signaling = null; // 信令方式
    }

    /**
     * 生成唯一ID
     */
    generateId() {
        return Math.random().toString(36).substring(2, 10);
    }

    /**
     * 初始化并加入房间
     */
    async joinRoom(roomId, signaling = null) {
        this.roomId = roomId;
        this.signaling = signaling;

        // 如果有信令服务，连接信令
        if (signaling) {
            await signaling.connect(roomId, this.localId);
            signaling.onMessage = (msg) => this.handleSignalingMessage(msg);
        }

        // 广播加入房间
        this.broadcast({
            type: 'join',
            peerId: this.localId,
            timestamp: Date.now()
        });

        console.log(`[WebRTC] 加入房间: ${roomId}, ID: ${this.localId}`);
        return this.localId;
    }

    /**
     * 创建 P2P 连接
     */
    async createPeerConnection(peerId) {
        if (this.connections.has(peerId)) {
            return this.connections.get(peerId);
        }

        const pc = new RTCPeerConnection({
            iceServers: CONFIG.WEBRTC.ICE_SERVERS
        });

        // ICE 候选者处理
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignaling({
                    type: 'ice-candidate',
                    target: peerId,
                    candidate: event.candidate
                });
            }
        };

        // 连接状态变化
        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] 连接状态 (${peerId}): ${pc.connectionState}`);
            if (pc.connectionState === 'connected') {
                if (this.onPeerConnectCallback) {
                    this.onPeerConnectCallback(peerId);
                }
            } else if (pc.connectionState === 'disconnected' || 
                       pc.connectionState === 'failed' || 
                       pc.connectionState === 'closed') {
                this.removePeer(peerId);
                if (this.onPeerDisconnectCallback) {
                    this.onPeerDisconnectCallback(peerId);
                }
            }
        };

        // 数据通道
        pc.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannel(peerId, channel);
        };

        this.connections.set(peerId, pc);
        return pc;
    }

    /**
     * 设置数据通道
     */
    setupDataChannel(peerId, channel) {
        channel.onopen = () => {
            console.log(`[WebRTC] 数据通道打开: ${peerId}`);
        };

        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.onMessageCallback) {
                    this.onMessageCallback(peerId, data);
                }
            } catch (e) {
                console.error('[WebRTC] 消息解析失败:', e);
            }
        };

        channel.onclose = () => {
            console.log(`[WebRTC] 数据通道关闭: ${peerId}`);
        };

        this.dataChannels.set(peerId, channel);
    }

    /**
     * 连接到对等端
     */
    async connectToPeer(peerId) {
        const pc = await this.createPeerConnection(peerId);

        // 创建数据通道
        const channel = pc.createDataChannel(CONFIG.WEBRTC.CHANNEL_NAME);
        this.setupDataChannel(peerId, channel);

        // 创建 offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // 发送 offer
        this.sendSignaling({
            type: 'offer',
            target: peerId,
            sdp: offer
        });
    }

    /**
     * 处理信令消息
     */
    async handleSignalingMessage(message) {
        const { type, peerId, target, sdp, candidate } = message;

        // 忽略自己的消息
        if (peerId === this.localId) return;

        // 处理加入消息
        if (type === 'join') {
            console.log(`[WebRTC] 新玩家加入: ${peerId}`);
            await this.connectToPeer(peerId);
            return;
        }

        // 只处理发给自己的消息
        if (target !== this.localId) return;

        const pc = await this.createPeerConnection(peerId);

        if (type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.sendSignaling({
                type: 'answer',
                target: peerId,
                sdp: answer
            });
        } else if (type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } else if (type === 'ice-candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    /**
     * 发送信令消息
     */
    sendSignaling(message) {
        const fullMessage = {
            ...message,
            peerId: this.localId,
            roomId: this.roomId
        };

        if (this.signaling) {
            this.signaling.send(fullMessage);
        } else {
            // 使用 GitHub Issues 作为信令后备
            this.sendViaGitHub(fullMessage);
        }
    }

    /**
     * 通过 GitHub Issues 发送信令（后备方案）
     */
    async sendViaGitHub(message) {
        if (window.githubBackend && window.githubBackend.isEnabled()) {
            await window.githubBackend.sendEvent(this.roomId, {
                type: 'signaling',
                data: message
            });
        }
    }

    /**
     * 发送数据到指定对等端
     */
    sendTo(peerId, data) {
        const channel = this.dataChannels.get(peerId);
        if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    /**
     * 广播数据到所有对等端
     */
    broadcast(data) {
        let sent = 0;
        for (const [peerId, channel] of this.dataChannels) {
            if (channel.readyState === 'open') {
                channel.send(JSON.stringify(data));
                sent++;
            }
        }

        // 如果没有 P2P 连接，通过 GitHub 广播
        if (sent === 0 && window.githubBackend) {
            window.githubBackend.sendEvent(this.roomId, {
                type: 'broadcast',
                sender: this.localId,
                data: data
            });
        }

        return sent;
    }

    /**
     * 移除对等端
     */
    removePeer(peerId) {
        const pc = this.connections.get(peerId);
        if (pc) {
            pc.close();
            this.connections.delete(peerId);
        }
        this.dataChannels.delete(peerId);
    }

    /**
     * 获取在线对等端列表
     */
    getPeers() {
        return Array.from(this.dataChannels.keys()).filter(id => {
            const channel = this.dataChannels.get(id);
            return channel && channel.readyState === 'open';
        });
    }

    /**
     * 设置消息回调
     */
    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    /**
     * 设置连接回调
     */
    onPeerConnect(callback) {
        this.onPeerConnectCallback = callback;
    }

    /**
     * 设置断开回调
     */
    onPeerDisconnect(callback) {
        this.onPeerDisconnectCallback = callback;
    }

    /**
     * 离开房间
     */
    leaveRoom() {
        this.broadcast({
            type: 'leave',
            peerId: this.localId
        });

        for (const [peerId, pc] of this.connections) {
            pc.close();
        }

        this.connections.clear();
        this.dataChannels.clear();
        this.roomId = null;

        if (this.signaling) {
            this.signaling.disconnect();
        }
    }
}

/**
 * 基于 GitHub Issues 的信令服务
 * 用于交换 WebRTC 连接信息
 */
class GitHubSignaling {
    constructor(githubBackend) {
        this.backend = githubBackend;
        this.roomId = null;
        this.localId = null;
        this.onMessage = null;
        this.pollingInterval = null;
        this.lastCheck = Date.now();
    }

    async connect(roomId, localId) {
        this.roomId = roomId;
        this.localId = localId;

        // 开始轮询
        this.startPolling();
        console.log(`[Signaling] 连接到房间: ${roomId}`);
    }

    startPolling() {
        this.pollingInterval = setInterval(() => {
            this.pollMessages();
        }, 3000);
    }

    async pollMessages() {
        if (!this.backend.isEnabled()) return;

        const events = await this.backend.getEvents(this.roomId, this.lastCheck);
        this.lastCheck = Date.now();

        for (const event of events) {
            if (event.type === 'signaling' && event.data) {
                const msg = event.data;
                // 忽略自己的消息
                if (msg.peerId !== this.localId) {
                    if (this.onMessage) {
                        this.onMessage(msg);
                    }
                }
            }
        }
    }

    send(message) {
        if (this.backend.isEnabled()) {
            this.backend.sendEvent(this.roomId, {
                type: 'signaling',
                data: message
            });
        }
    }

    disconnect() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WebRTCManager, GitHubSignaling };
}
