/**
 * GitHub 后端存储模块
 * 使用 GitHub Issues 作为数据持久化存储
 */
class GitHubBackend {
    constructor(token, repo) {
        this.token = token;
        this.repo = repo;
        this.enabled = !!(token && repo);
        this.cache = new Map();
        this.lastSync = 0;
    }

    /**
     * 检查是否启用 GitHub 后端
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * 发送 GitHub API 请求
     */
    async apiRequest(path, options = {}) {
        if (!this.enabled) return null;

        const url = `${CONFIG.GITHUB.API_BASE}/repos/${this.repo}${path}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('GitHub API 错误:', error);
            return null;
        }

        return response.json();
    }

    /**
     * 获取或创建游戏数据 Issue
     */
    async getOrCreateDataIssue(label, title, body = '{}') {
        if (!this.enabled) return null;

        // 先查找现有 Issue
        const issues = await this.apiRequest(
            `/issues?labels=${label}&state=open&per_page=1`
        );

        if (issues && issues.length > 0) {
            return issues[0];
        }

        // 创建新 Issue
        return this.apiRequest('/issues', {
            method: 'POST',
            body: JSON.stringify({
                title: title,
                body: body,
                labels: [label]
            })
        });
    }

    /**
     * 更新 Issue 内容
     */
    async updateIssue(issueNumber, body) {
        if (!this.enabled) return false;

        const result = await this.apiRequest(`/issues/${issueNumber}`, {
            method: 'PATCH',
            body: JSON.stringify({ body: body })
        });

        return !!result;
    }

    /**
     * 保存玩家数据
     */
    async savePlayerData(playerId, data) {
        if (!this.enabled) {
            localStorage.setItem(`${CONFIG.STORAGE.PLAYER}_${playerId}`, JSON.stringify(data));
            return true;
        }

        const issue = await this.getOrCreateDataIssue(
            `player:${playerId}`,
            `玩家数据: ${data.name}`,
            JSON.stringify(data)
        );

        if (issue) {
            return this.updateIssue(issue.number, JSON.stringify(data));
        }

        return false;
    }

    /**
     * 加载玩家数据
     */
    async loadPlayerData(playerId) {
        if (!this.enabled) {
            const data = localStorage.getItem(`${CONFIG.STORAGE.PLAYER}_${playerId}`);
            return data ? JSON.parse(data) : null;
        }

        const issues = await this.apiRequest(
            `/issues?labels=player:${playerId}&state=open&per_page=1`
        );

        if (issues && issues.length > 0) {
            try {
                return JSON.parse(issues[0].body);
            } catch (e) {
                console.error('解析玩家数据失败:', e);
            }
        }

        return null;
    }

    /**
     * 保存农场数据
     */
    async saveFarmData(roomId, data) {
        if (!this.enabled) {
            localStorage.setItem(`${CONFIG.STORAGE.FARM}_${roomId}`, JSON.stringify(data));
            return true;
        }

        const issue = await this.getOrCreateDataIssue(
            `room:${roomId}`,
            `农场数据: ${roomId}`,
            JSON.stringify(data)
        );

        if (issue) {
            return this.updateIssue(issue.number, JSON.stringify(data));
        }

        return false;
    }

    /**
     * 加载农场数据
     */
    async loadFarmData(roomId) {
        if (!this.enabled) {
            const data = localStorage.getItem(`${CONFIG.STORAGE.FARM}_${roomId}`);
            return data ? JSON.parse(data) : null;
        }

        const issues = await this.apiRequest(
            `/issues?labels=room:${roomId}&state=open&per_page=1`
        );

        if (issues && issues.length > 0) {
            try {
                return JSON.parse(issues[0].body);
            } catch (e) {
                console.error('解析农场数据失败:', e);
            }
        }

        return null;
    }

    /**
     * 保存房间列表（用于发现房间）
     */
    async addRoomToList(roomId, roomInfo) {
        if (!this.enabled) {
            const rooms = this.getLocalRoomList();
            rooms[roomId] = roomInfo;
            localStorage.setItem('farm_rooms', JSON.stringify(rooms));
            return true;
        }

        const issue = await this.getOrCreateDataIssue(
            'room-list',
            '房间列表',
            '{}'
        );

        if (issue) {
            try {
                const rooms = JSON.parse(issue.body || '{}');
                rooms[roomId] = roomInfo;
                return this.updateIssue(issue.number, JSON.stringify(rooms));
            } catch (e) {
                console.error('更新房间列表失败:', e);
            }
        }

        return false;
    }

    /**
     * 获取房间列表
     */
    async getRoomList() {
        if (!this.enabled) {
            return this.getLocalRoomList();
        }

        const issues = await this.apiRequest(
            `/issues?labels=room-list&state=open&per_page=1`
        );

        if (issues && issues.length > 0) {
            try {
                return JSON.parse(issues[0].body || '{}');
            } catch (e) {
                console.error('解析房间列表失败:', e);
            }
        }

        return {};
    }

    /**
     * 获取本地房间列表
     */
    getLocalRoomList() {
        try {
            return JSON.parse(localStorage.getItem('farm_rooms') || '{}');
        } catch {
            return {};
        }
    }

    /**
     * 发送游戏事件（通过 Issue 评论）
     */
    async sendEvent(roomId, event) {
        if (!this.enabled) return false;

        const issues = await this.apiRequest(
            `/issues?labels=room:${roomId}&state=open&per_page=1`
        );

        if (issues && issues.length > 0) {
            const result = await this.apiRequest(
                `/issues/${issues[0].number}/comments`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        body: `<!-- EVENT -->\n${JSON.stringify({
                            ...event,
                            timestamp: Date.now()
                        })}`
                    })
                }
            );
            return !!result;
        }

        return false;
    }

    /**
     * 获取游戏事件（通过 Issue 评论）
     */
    async getEvents(roomId, since = null) {
        if (!this.enabled) return [];

        const issues = await this.apiRequest(
            `/issues?labels=room:${roomId}&state=open&per_page=1`
        );

        if (issues && issues.length > 0) {
            let url = `/issues/${issues[0].number}/comments?per_page=100`;
            if (since) {
                url += `&since=${new Date(since).toISOString()}`;
            }

            const comments = await this.apiRequest(url);

            if (comments) {
                return comments
                    .filter(c => c.body.includes('<!-- EVENT -->'))
                    .map(c => {
                        try {
                            const json = c.body.replace('<!-- EVENT -->\n', '');
                            return JSON.parse(json);
                        } catch {
                            return null;
                        }
                    })
                    .filter(e => e !== null);
            }
        }

        return [];
    }

    /**
     * 定期同步数据
     */
    async sync() {
        const now = Date.now();
        if (now - this.lastSync < 5000) return; // 最少 5 秒同步一次
        this.lastSync = now;

        // 触发同步事件
        if (window.game) {
            window.game.emit('sync');
        }
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GitHubBackend;
}
