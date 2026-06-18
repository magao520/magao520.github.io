/**
 * 游戏入口
 */
document.addEventListener('DOMContentLoaded', () => {
    // 创建游戏实例
    const game = new FarmGame();
    window.game = game;

    // 创建 UI
    const ui = new GameUI(game);
    window.ui = ui;

    // 检查 URL 参数（邀请链接）
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        document.getElementById('room-id').value = roomParam;
    }

    // 页面卸载时保存
    window.addEventListener('beforeunload', () => {
        if (game) {
            game.destroy();
        }
    });

    console.log('🌾 快乐农场已加载！');
});
