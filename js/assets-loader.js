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

        // 加载 Seamless RPG Tiles 64x64 无缝纹理 (高级农场素材)
        const seamlessTiles = {
            texGrass:     'assets/tiles/seamless-rpg/grass.png',
            texFarmland:  'assets/tiles/seamless-rpg/farmland.png',
            texPath:      'assets/tiles/seamless-rpg/path.png',
            texWater:     'assets/tiles/seamless-rpg/water.png',
            texMud:       'assets/tiles/seamless-rpg/mud.png',
            texDryland:   'assets/tiles/seamless-rpg/dryland.png',
            texPebbles:   'assets/tiles/seamless-rpg/pebbles.png',
            texWoodpath:  'assets/tiles/seamless-rpg/woodpath.png',
            texSand:      'assets/tiles/seamless-rpg/sand.png',
            texDustgrass: 'assets/tiles/seamless-rpg/dustgrass.png',
            texHighland:  'assets/tiles/seamless-rpg/highland.png',
            texGravel:    'assets/tiles/seamless-rpg/gravel.png',
            texClay:      'assets/tiles/seamless-rpg/clay.png',
            texLilypad:   'assets/tiles/seamless-rpg/lilypad.png',
            texShallow:   'assets/tiles/seamless-rpg/shallowwater.png',
            texDeepocean: 'assets/tiles/seamless-rpg/deepocean.png',
            texCavewater: 'assets/tiles/seamless-rpg/cavewater.png',
            texDustland:  'assets/tiles/seamless-rpg/dustland.png',
            texSavannah:  'assets/tiles/seamless-rpg/savannah.png',
            texJungle:    'assets/tiles/seamless-rpg/junglegrass.png',
            texSwamp:     'assets/tiles/seamless-rpg/swamp grass mar.png',
            texMonsoon:   'assets/tiles/seamless-rpg/monsoongrass.png',
            texTaiga:     'assets/tiles/seamless-rpg/taiga.png',
            texTundra:    'assets/tiles/seamless-rpg/tundra.png',
            texSnow:      'assets/tiles/seamless-rpg/snow.png',
            texIce:       'assets/tiles/seamless-rpg/ice.png',
            texPermasnow: 'assets/tiles/seamless-rpg/permasnow.png',
            texBasalt:    'assets/tiles/seamless-rpg/basalt.png',
            texStoneTile: 'assets/tiles/seamless-rpg/stone tile.png',
            texWoodTile:  'assets/tiles/seamless-rpg/wood tile.png',
            texGraniteFloor:'assets/tiles/seamless-rpg/granite floor.png',
            texQuartzFloor:'assets/tiles/seamless-rpg/quartzite floor.png',
            texThornfloor:'assets/tiles/seamless-rpg/thornfloor.png',
            texCoralGreen:'assets/tiles/seamless-rpg/coralgreen.png',
            texCoralRed:  'assets/tiles/seamless-rpg/coralred.png',
            texCoralBlue: 'assets/tiles/seamless-rpg/coral blue.png',
            texCoralOrange:'assets/tiles/seamless-rpg/coral orange.png',
            texCoralYellow:'assets/tiles/seamless-rpg/coralyellow.png',
            texCoralBlack:'assets/tiles/seamless-rpg/coral black.png',
            texAlgae:     'assets/tiles/seamless-rpg/algae green.png',
            texCyanGrass: 'assets/tiles/seamless-rpg/cyan grass.png',
            texYellowGrass:'assets/tiles/seamless-rpg/yellow grass.png',
            texGrassCold: 'assets/tiles/seamless-rpg/grass cold.png',
            texGrassDry:  'assets/tiles/seamless-rpg/grass dry.png',
            texGrassSnowy:'assets/tiles/seamless-rpg/grass snowy.png',
            texGrassSep:  'assets/tiles/seamless-rpg/grass sep.png',
            texGrassOct:  'assets/tiles/seamless-rpg/grass oct.png',
            texGrassNov:  'assets/tiles/seamless-rpg/grass nov.png',
            texMapGrass:  'assets/tiles/seamless-rpg/map tile grass.png',
            texMapForest: 'assets/tiles/seamless-rpg/map tile forest.png',
            texMapSand:   'assets/tiles/seamless-rpg/map tile sand.png',
            texMapOcean:  'assets/tiles/seamless-rpg/map tile ocean.png',
            texMapMountain:'assets/tiles/seamless-rpg/map tile mountain.png',
            texMapCity:   'assets/tiles/seamless-rpg/map tile city.png',
            texPathSnowy: 'assets/tiles/seamless-rpg/path snowy.png',
            texPath2:     'assets/tiles/seamless-rpg/path2.png',
            texPath2Snowy:'assets/tiles/seamless-rpg/path2 snowy.png',
            texWoodpathSnowy:'assets/tiles/seamless-rpg/woodpath snowy.png',
            texWoodpath2: 'assets/tiles/seamless-rpg/woodpath2.png',
            texConstruction:'assets/tiles/seamless-rpg/construction path.png',
            texConstructionSnowy:'assets/tiles/seamless-rpg/construction path snowy.png',
            texHigherland:'assets/tiles/seamless-rpg/higherland.png',
            texHighlandArid:'assets/tiles/seamless-rpg/highland arid.png',
            texHighlandSnowy:'assets/tiles/seamless-rpg/highland snowy.png',
            texMountainFloor:'assets/tiles/seamless-rpg/mountainfloor.png',
            texOcean:     'assets/tiles/seamless-rpg/ocean.png',
            texCaveGravel:'assets/tiles/seamless-rpg/cave gravel.png',
            texCaveGravel2:'assets/tiles/seamless-rpg/cave gravel 2.png',
            texCaveGravel3:'assets/tiles/seamless-rpg/cave gravel 3.png',
            texCaveGravel4:'assets/tiles/seamless-rpg/cave gravel 4.png',
            texCaveGravel5:'assets/tiles/seamless-rpg/cave gravel 5.png',
            texDarkCaveGravel:'assets/tiles/seamless-rpg/darkCaveGravel.png',
            texColdCaveGravel:'assets/tiles/seamless-rpg/coldCaveGravel.png',
            texCaveWall:  'assets/tiles/seamless-rpg/cave wall.png',
            texCaveIce:   'assets/tiles/seamless-rpg/cave ice.png',
            texCaveMagma: 'assets/tiles/seamless-rpg/cave magma.png',
            texCaveMagmaCold:'assets/tiles/seamless-rpg/cave magma cold.png',
            texCaveWaterStalagmite:'assets/tiles/seamless-rpg/cave water stalagmite.png',
            texCaveCoralBlack:'assets/tiles/seamless-rpg/cave coral black.png',
            texCaveCoralBlackWeak:'assets/tiles/seamless-rpg/cave coral black weakened.png',
            texCaveCliff2:'assets/tiles/seamless-rpg/caveCliff2.png',
            texCaveCliff3:'assets/tiles/seamless-rpg/caveCliff3.png',
            texCaveCliff4:'assets/tiles/seamless-rpg/caveCliff4.png',
            texCaveCliff5:'assets/tiles/seamless-rpg/caveCliff5.png',
            texCliff:     'assets/tiles/seamless-rpg/cliff.png',
            texCliffIce:  'assets/tiles/seamless-rpg/cliff ice.png',
            texDarkcliff: 'assets/tiles/seamless-rpg/darkcliff.png',
            texColdcliff: 'assets/tiles/seamless-rpg/coldcliff.png',
            texGraniteCliff:'assets/tiles/seamless-rpg/granite cliff.png',
            texQuartzCliff:'assets/tiles/seamless-rpg/quartzite cliff.png',
            texPebblesCave:'assets/tiles/seamless-rpg/pebbles cave.png',
            texPebblesSnow:'assets/tiles/seamless-rpg/pebbles snow.png',
            texLandcoralBlack:'assets/tiles/seamless-rpg/landcoralblack.png',
            texInfestedGravel:'assets/tiles/seamless-rpg/infested gravel.png',
            texThornfloorDamp:'assets/tiles/seamless-rpg/thornfloor damp.png',
            texThornfloorDry:'assets/tiles/seamless-rpg/thornfloor dry.png',
            texThornfloorSnowy:'assets/tiles/seamless-rpg/thornfloor snowy.png',
            texTundraSnowy:'assets/tiles/seamless-rpg/tundra snowy.png',
            texSwampSep:  'assets/tiles/seamless-rpg/swamp grass sep.png',
            texSwampOct:  'assets/tiles/seamless-rpg/swamp grass oct.png',
            texSwampNov:  'assets/tiles/seamless-rpg/swamp grass nov.png',
            texSwampSnowy:'assets/tiles/seamless-rpg/swamp grass snowy.png',
            texTaiga:     'assets/tiles/seamless-rpg/taiga.png',
            texTaidra:    'assets/tiles/seamless-rpg/taidra.png',
            texWoodWall:  'assets/tiles/seamless-rpg/wood wall.png'
        };

        const seamlessPromises = Object.entries(seamlessTiles).map(([key, src]) =>
            this.loadImage(src).then(img => {
                if (img) this.assets[key] = img;
                return img;
            })
        );
        await Promise.all(seamlessPromises);

        // 保留 Tiny Town 作为 fallback
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
        console.log(`[AssetsLoader] 加载完成: ${Object.keys(this.assets).length} 张图片`);
        return this.assets;
    }
};
