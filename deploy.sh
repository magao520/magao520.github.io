#!/bin/bash

# GitHub Pages 部署脚本
# 使用方法: ./deploy.sh <你的GitHub用户名>

set -e

USERNAME=$1
REPO_NAME="${USERNAME}.github.io"

if [ -z "$USERNAME" ]; then
    echo "❌ 请提供 GitHub 用户名"
    echo "用法: ./deploy.sh your-username"
    exit 1
fi

echo "🚀 开始部署到 GitHub Pages..."
echo "📦 仓库名称: $REPO_NAME"

# 检查 git 是否安装
if ! command -v git &> /dev/null; then
    echo "❌ 请先安装 Git"
    exit 1
fi

# 初始化 git 仓库
if [ ! -d ".git" ]; then
    echo "🔧 初始化 Git 仓库..."
    git init
fi

# 添加所有文件
echo "📁 添加文件到 Git..."
git add .

# 提交更改
echo "💾 提交更改..."
git commit -m "Initial commit: Farm Game" || echo "没有新更改需要提交"

# 添加远程仓库
echo "🔗 配置远程仓库..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$USERNAME/$REPO_NAME.git"

# 推送到 GitHub
echo "📤 推送到 GitHub..."
git branch -M main
git push -u origin main --force || {
    echo ""
    echo "❌ 推送失败，请确保："
    echo "   1. 你已经在 GitHub 创建了仓库: $REPO_NAME"
    echo "   2. 已经配置了 Git 用户名和邮箱"
    echo "   3. 已经配置了 GitHub 认证 (Token 或 SSH)"
    echo ""
    echo "📖 手动创建仓库步骤:"
    echo "   1. 访问 https://github.com/new"
    echo "   2. Repository name 填写: $REPO_NAME"
    echo "   3. 选择 Public"
    echo "   4. 勾选 'Add a README file'"
    echo "   5. 点击 'Create repository'"
    exit 1
}

echo ""
echo "✅ 代码已推送到 GitHub!"
echo ""
echo "📋 接下来请在 GitHub 上完成以下步骤:"
echo ""
echo "1. 访问: https://github.com/$USERNAME/$REPO_NAME/settings/pages"
echo ""
echo "2. 在 'Source' 部分选择:"
echo "   - Branch: main"
echo "   - Folder: / (root)"
echo "   - 点击 'Save'"
echo ""
echo "3. 等待 2-5 分钟后，访问你的网站:"
echo "   🌐 https://$USERNAME.github.io"
echo ""
echo "🎮 游戏部署完成！"
