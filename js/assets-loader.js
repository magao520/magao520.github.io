/**
 * 素材加载器 - 预加载所有游戏 PNG 图片资源
 * 使用 Promise.all + Image onload 实现异步加载
 */
const AssetsLoader = {
    assets: {},
    loaded: false,

    /**
     * 加载单张图片
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn(`[AssetsLoader] 加载失败: ${src}`);
                resolve(null); // 失败不阻塞，返回 null
            };
            img.src = src;
        });
    },

    /**
     * 预加载所有素材
     */
    async loadAll() {
        if (this.loaded) return this.assets;

        const manifest = {
            // 地图瓦片
            farmTiles: 'assets/tiles/farm_tiles.png',
            wheatfields: 'assets/tiles/wheatfields.png',

            // 角色 - 行走动画 (每张 96x17, 8帧, 每帧 12x17)
            charWalkDown:  'assets/chars/adventure/Tiny Adventure Pack/Character/Char_one/Walk/Char_walk_down.png',
            charWalkUp:    'assets/chars/adventure/Tiny Adventure Pack/Character/Char_one/Walk/Char_walk_up.png',
            charWalkLeft:  'assets/chars/adventure/Tiny Adventure Pack/Character/Char_one/Walk/Char_walk_left.png',
            charWalkRight: 'assets/chars/adventure/Tiny Adventure Pack/Character/Char_one/Walk/Char_walk_right.png',

            // 角色 - 待机动画 (每张 96x16, 8帧, 每帧 12x16)
            charIdleDown:  'assets/chars/adventure/Tiny Adventure Pack/Character/Char_one/Idle/Char_idle_down.png',
            charIdleUp:    'assets/chars/adventure/Tiny Adventure Pack/Character/Char_one/Idle/Char_idle_up.png',
            charIdleLeft:  'assets/chars/adventure/Tiny Adventure Pack/Character/Char_one/Idle/Char_idle_left.png',
            charIdleRight: 'assets/chars/adventure/Tiny Adventure Pack/Character/Char_one/Idle/Char_idle_right.png',

            // 作物 spritesheet (1024x1024)
            crops: 'assets/crops/lpc_crops/crops-v2/crops.png',

            // 装饰物
            tree:  'assets/chars/adventure/Tiny Adventure Pack/Other/Misc/Tree/Tree.png',
            chest: 'assets/chars/adventure/Tiny Adventure Pack/Other/Misc/Chest.png',
            rock:  'assets/chars/adventure/Tiny Adventure Pack/Other/Misc/Rock.png',
            bush:  'assets/chars/adventure/Tiny Adventure Pack/Other/Misc/Bush.png',
            coin:  'assets/chars/adventure/Tiny Adventure Pack/Other/Coin.png',
            grass: 'assets/chars/adventure/Tiny Adventure Pack/Other/Misc/Grass.png'
        };

        // 并行加载所有图片
        const entries = Object.entries(manifest);
        const results = await Promise.all(
            entries.map(([key, src]) => this.loadImage(src).then(img => [key, img]))
        );

        // 收集结果
        for (const [key, img] of results) {
            if (img) {
                this.assets[key] = img;
            }
        }

        // 加载 Tiny Town 瓦片 (tile_0000 ~ tile_0131)
        const tinyTownPromises = [];
        for (let i = 0; i <= 131; i++) {
            const num = i.toString().padStart(4, '0');
            const key = `tt${i}`;
            const src = `assets/tiles/tiny_town/Tiles/tile_${num}.png`;
            tinyTownPromises.push(
                this.loadImage(src).then(img => {
                    if (img) this.assets[key] = img;
                    return img;
                })
            );
        }
        await Promise.all(tinyTownPromises);

        this.loaded = true;
        console.log(`[AssetsLoader] 加载完成: ${Object.keys(this.assets).length}/${entries.length + 132} 张图片`);
        return this.assets;
    }
};
