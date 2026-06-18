# 🌾 快乐农场 - 多人联机种菜游戏

基于 GitHub 作为后端的多人实时联机种菜游戏，使用 WebRTC 实现 P2P 直连，无需服务器即可联机对战。

## 🎮 游戏特性

- **8 种作物**：胡萝卜、番茄、玉米、茄子、南瓜、草莓、西瓜、向日葵
- **5 种工具**：种植、浇水、施肥、收获、铲除
- **实时联机**：WebRTC P2P 直连，低延迟同步
- **数据持久化**：支持 GitHub Issues 作为后端存储
- **邀请好友**：通过链接邀请好友加入同一房间

## 🚀 快速开始

### 在线游玩

访问 [https://你的用户名.github.io](https://你的用户名.github.io) 即可游玩。

### 本地运行

```bash
# 进入项目目录
cd farm-game

# 启动本地服务器
python3 -m http.server 8080

# 浏览器访问 http://localhost:8080
```

## 📦 部署到 GitHub Pages

### 方式一：使用自动部署脚本

```bash
# 给脚本执行权限
chmod +x deploy.sh

# 运行部署脚本（替换为你的 GitHub 用户名）
./deploy.sh your-username
```

### 方式二：手动部署

#### 1. 创建 GitHub 仓库

1. 登录 [GitHub](https://github.com)
2. 点击右上角 **+** → **New repository**
3. 仓库名称填写：`你的用户名.github.io`
4. 选择 **Public**
5. 勾选 **Add a README file**
6. 点击 **Create repository**

#### 2. 推送代码

```bash
# 初始化 Git
git init

# 添加文件
git add .

# 提交
git commit -m "Initial commit"

# 添加远程仓库
git remote add origin https://github.com/你的用户名/你的用户名.github.io.git

# 推送
git branch -M main
git push -u origin main
```

#### 3. 启用 GitHub Pages

1. 访问仓库的 **Settings** → **Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main`，**Folder** 选择 `/(root)`
4. 点击 **Save**

#### 4. 访问网站

等待 2-5 分钟后，访问 `https://你的用户名.github.io`

## ⚙️ GitHub 后端配置（可选）

配置 GitHub 后端后，游戏数据将持久化存储在 GitHub Issues 中。

### 获取 GitHub Token

1. 访问 [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. 点击 **Generate new token (classic)**
3. 勾选 `repo` 权限
4. 点击 **Generate token**
5. 复制并保存 Token

### 配置游戏

在游戏登录界面点击 **⚙️ GitHub 配置**，输入：
- **GitHub Personal Access Token**：你的 Token
- **仓库**：`用户名/仓库名`（例如：`zhangsan/farm-game-data`）

## 🏗️ 项目结构

```
farm-game/
├── index.html          # 主页面
├── styles.css          # 样式文件
├── README.md           # 说明文档
├── deploy.sh           # 部署脚本
└── js/
    ├── config.js       # 游戏配置
    ├── game.js         # 游戏核心逻辑
    ├── ui.js           # UI 渲染
    ├── webrtc.js       # P2P 联机模块
    ├── github-backend.js # GitHub 存储后端
    └── main.js         # 入口文件
```

## 🌐 浏览器支持

- Chrome / Edge（推荐）
- Firefox
- Safari

需要支持 WebRTC 的现代浏览器。

## 📄 许可证

MIT License
