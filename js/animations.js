/**
 * 像素风动画系统
 */
class PixelAnimations {
    constructor() {
        this.particlesContainer = document.getElementById('particles');
    }

    /**
     * 创建粒子效果
     */
    spawnParticles(x, y, emoji, count = 5) {
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.textContent = emoji;
            particle.style.left = `${x + (Math.random() - 0.5) * 40}px`;
            particle.style.top = `${y + (Math.random() - 0.5) * 20}px`;
            particle.style.animationDelay = `${Math.random() * 0.3}s`;
            particle.style.fontSize = `${16 + Math.random() * 16}px`;
            
            this.particlesContainer.appendChild(particle);
            
            setTimeout(() => particle.remove(), 1500);
        }
    }

    /**
     * 浮动文字效果
     */
    floatText(x, y, text, color = '#ffd93d') {
        const el = document.createElement('div');
        el.className = 'float-text';
        el.textContent = text;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.color = color;
        
        this.particlesContainer.appendChild(el);
        
        setTimeout(() => el.remove(), 1000);
    }

    /**
     * 种植动画
     */
    animatePlant(plotEl) {
        const sprite = plotEl.querySelector('.crop-sprite');
        if (sprite) {
            sprite.style.transform = 'scale(0)';
            setTimeout(() => {
                sprite.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                sprite.style.transform = 'scale(1)';
            }, 50);
        }
        
        // 泥土粒子
        const rect = plotEl.getBoundingClientRect();
        this.spawnParticles(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
            '🟫',
            3
        );
    }

    /**
     * 浇水动画
     */
    animateWater(plotEl) {
        const rect = plotEl.getBoundingClientRect();
        
        // 水滴粒子
        this.spawnParticles(
            rect.left + rect.width / 2,
            rect.top,
            '💧',
            6
        );
        
        // 地块闪烁
        plotEl.style.filter = 'brightness(1.3)';
        setTimeout(() => {
            plotEl.style.filter = '';
        }, 300);
    }

    /**
     * 收获动画
     */
    animateHarvest(plotEl, cropEmoji, coins) {
        const rect = plotEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // 作物弹跳
        const sprite = plotEl.querySelector('.crop-sprite');
        if (sprite) {
            sprite.style.transition = 'transform 0.3s ease';
            sprite.style.transform = 'scale(1.5) rotate(20deg)';
            setTimeout(() => {
                sprite.style.transform = 'scale(0)';
            }, 200);
        }
        
        // 星星粒子
        this.spawnParticles(centerX, centerY, '✨', 8);
        
        // 金币浮动
        this.floatText(centerX, centerY, `+${coins}💰`);
        
        // 显示收获弹窗
        this.showHarvestModal(cropEmoji, coins);
    }

    /**
     * 施肥动画
     */
    animateFertilize(plotEl) {
        const rect = plotEl.getBoundingClientRect();
        
        this.spawnParticles(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
            '⭐',
            4
        );
        
        plotEl.style.boxShadow = '0 0 20px #ffd93d';
        setTimeout(() => {
            plotEl.style.boxShadow = '';
        }, 500);
    }

    /**
     * 铲除动画
     */
    animateRemove(plotEl) {
        const rect = plotEl.getBoundingClientRect();
        
        this.spawnParticles(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
            '🍂',
            4
        );
        
        plotEl.style.transform = 'scale(0.9)';
        setTimeout(() => {
            plotEl.style.transform = '';
        }, 200);
    }

    /**
     * 显示收获弹窗
     */
    showHarvestModal(cropEmoji, coins) {
        const modal = document.getElementById('harvest-modal');
        const cropEl = document.getElementById('harvest-crop-emoji');
        const coinsEl = document.getElementById('harvest-coins');
        
        cropEl.textContent = cropEmoji;
        coinsEl.textContent = `+${coins}`;
        
        modal.classList.add('active');
        
        // 自动关闭
        setTimeout(() => {
            modal.classList.remove('active');
        }, 2000);
    }

    /**
     * 天气效果
     */
    animateWeather(type) {
        const container = this.particlesContainer;
        
        if (type === 'rain') {
            for (let i = 0; i < 20; i++) {
                setTimeout(() => {
                    const drop = document.createElement('div');
                    drop.className = 'particle';
                    drop.textContent = '🌧️';
                    drop.style.left = `${Math.random() * window.innerWidth}px`;
                    drop.style.top = '-20px';
                    drop.style.animation = 'particle-float 1s linear forwards';
                    container.appendChild(drop);
                    setTimeout(() => drop.remove(), 1000);
                }, i * 100);
            }
        } else if (type === 'snow') {
            for (let i = 0; i < 15; i++) {
                setTimeout(() => {
                    const flake = document.createElement('div');
                    flake.className = 'particle';
                    flake.textContent = '❄️';
                    flake.style.left = `${Math.random() * window.innerWidth}px`;
                    flake.style.top = '-20px';
                    flake.style.animation = 'particle-float 2s linear forwards';
                    container.appendChild(flake);
                    setTimeout(() => flake.remove(), 2000);
                }, i * 150);
            }
        }
    }

    /**
     * 升级动画
     */
    animateLevelUp() {
        const container = this.particlesContainer;
        
        for (let i = 0; i < 15; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.textContent = ['⭐', '🎉', '✨', '🎊'][Math.floor(Math.random() * 4)];
            particle.style.left = `${window.innerWidth / 2 + (Math.random() - 0.5) * 200}px`;
            particle.style.top = `${window.innerHeight / 2 + (Math.random() - 0.5) * 100}px`;
            particle.style.fontSize = '24px';
            container.appendChild(particle);
            
            setTimeout(() => particle.remove(), 1500);
        }
        
        this.floatText(window.innerWidth / 2, window.innerHeight / 2, '升级了！', '#ffd93d');
    }

    /**
     * 作物生长动画
     */
    animateGrowth(plotEl) {
        const sprite = plotEl.querySelector('.crop-sprite');
        if (sprite) {
            sprite.style.transition = 'transform 0.3s ease';
            sprite.style.transform = 'scale(1.1)';
            setTimeout(() => {
                sprite.style.transform = 'scale(1)';
            }, 300);
        }
    }

    /**
     * 地块点击反馈
     */
    animateClick(plotEl) {
        plotEl.style.transform = 'scale(0.95)';
        setTimeout(() => {
            plotEl.style.transform = '';
        }, 100);
    }

    /**
     * 屏幕震动
     */
    screenShake(intensity = 5) {
        document.body.style.transform = `translate(${Math.random() * intensity - intensity/2}px, ${Math.random() * intensity - intensity/2}px)`;
        
        setTimeout(() => {
            document.body.style.transform = '';
        }, 100);
    }

    /**
     * 金币增加动画
     */
    animateCoinIncrease(element, amount) {
        const rect = element.getBoundingClientRect();
        this.floatText(rect.left + rect.width / 2, rect.top, `+${amount}💰`, '#ffd93d');
        
        element.style.transform = 'scale(1.2)';
        element.style.color = '#ffd93d';
        setTimeout(() => {
            element.style.transform = '';
            element.style.color = '';
        }, 300);
    }

    /**
     * 加载画面动画
     */
    animateLoading(callback) {
        const loadingScreen = document.getElementById('loading-screen');
        const loginScreen = document.getElementById('login-screen');
        
        setTimeout(() => {
            loadingScreen.classList.remove('active');
            loginScreen.classList.add('active');
            
            if (callback) callback();
        }, 2000);
    }

    /**
     * 切换屏幕动画
     */
    transitionScreen(fromScreen, toScreen) {
        fromScreen.style.opacity = '1';
        fromScreen.style.transition = 'opacity 0.3s';
        fromScreen.style.opacity = '0';
        
        setTimeout(() => {
            fromScreen.classList.remove('active');
            fromScreen.style.opacity = '';
            fromScreen.style.transition = '';
            
            toScreen.classList.add('active');
            toScreen.style.opacity = '0';
            toScreen.style.transition = 'opacity 0.3s';
            
            requestAnimationFrame(() => {
                toScreen.style.opacity = '1';
            });
            
            setTimeout(() => {
                toScreen.style.opacity = '';
                toScreen.style.transition = '';
            }, 300);
        }, 300);
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PixelAnimations;
}
