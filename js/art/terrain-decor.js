(function () {
  const DG = window.DG;
  DG.art = DG.art || {};

  const INSIDE = 'assets/terrain/props/route-interior-atlas.png';
  const OUTSIDE = 'assets/terrain/props/void-exterior-atlas.png';
  const DEFS = {
    pond: { atlas: 'inside', x: 0, y: 206, w: 354, h: 255, size: [170, 255], ay: 0.62, layer: 'ground' },
    ruinRing: { atlas: 'inside', x: 305, y: 556, w: 277, h: 189, size: [100, 155], ay: 0.8, layer: 'ground' },
    stonePillar: { atlas: 'inside', x: 1103, y: 597, w: 164, h: 223, size: [115, 178], layer: 'prop', solid: 0.24, breakable: true },
    redMushroom: { atlas: 'inside', x: 1585, y: 366, w: 197, h: 191, size: [78, 126], ay: 0.86, layer: 'prop', solid: 0.2, breakable: true },
    violetRock: { atlas: 'inside', x: 1848, y: 358, w: 151, h: 207, size: [110, 172], layer: 'prop', solid: 0.3, breakable: true },
    stoneSlab: { atlas: 'inside', x: 613, y: 338, w: 206, h: 141, size: [70, 112], ay: 0.72, layer: 'ground' },
    corpse: { atlas: 'inside', x: 1107, y: 119, w: 189, h: 190, size: [56, 86], ay: 0.86, layer: 'ground' },
    eggs: { atlas: 'inside', x: 875, y: 394, w: 170, h: 120, size: [40, 62], ay: 0.6, layer: 'ground' },
    grave: { atlas: 'inside', x: 635, y: 566, w: 137, h: 161, size: [85, 132], layer: 'prop', solid: 0.24, breakable: true },
    rockTree: { atlas: 'inside', x: 410, y: 305, w: 139, h: 176, size: [110, 170], layer: 'prop', solid: 0.25, breakable: true },
    driftbone: { atlas: 'inside', x: 896, y: 152, w: 145, h: 111, size: [38, 62], ay: 0.7, layer: 'ground' },
    branch: { atlas: 'inside', x: 552, y: 58, w: 103, h: 159, size: [74, 128], layer: 'prop', solid: 0.14, breakable: true },
    bones: { atlas: 'inside', x: 1573, y: 915, w: 118, h: 81, size: [32, 54], ay: 0.55, layer: 'ground' },
    ribcage: { atlas: 'inside', x: 1362, y: 664, w: 129, h: 86, size: [36, 60], ay: 0.55, layer: 'ground' },
    reeds: { atlas: 'inside', x: 880, y: 651, w: 129, h: 100, size: [34, 58], ay: 0.75, layer: 'ground' },
    // 草丛类：可大量铺撒，全部走地面层（画在角色之下，天然不会踩头）
    grassBush: { atlas: 'inside', x: 288, y: 42, w: 150, h: 100, size: [56, 94], ay: 0.52, layer: 'ground' },
    leafPlant: { atlas: 'inside', x: 1688, y: 58, w: 100, h: 92, size: [44, 76], ay: 0.78, layer: 'ground' },
    dryGrassBig: { atlas: 'inside', x: 872, y: 598, w: 146, h: 128, size: [54, 96], ay: 0.8, layer: 'ground' },
    cattail: { atlas: 'inside', x: 370, y: 898, w: 82, h: 110, size: [38, 68], ay: 0.85, layer: 'ground' },
    deadPlant: { atlas: 'inside', x: 26, y: 6, w: 168, h: 188, size: [64, 104], ay: 0.9, layer: 'ground' },
    // 骨头类：丰富骸骨密度
    bonePile: { atlas: 'inside', x: 1350, y: 320, w: 200, h: 155, size: [50, 92], ay: 0.62, layer: 'ground' },
    bonePileSmall: { atlas: 'inside', x: 1382, y: 170, w: 155, h: 115, size: [40, 72], ay: 0.6, layer: 'ground' },
    graveCross: { atlas: 'inside', x: 1552, y: 68, w: 132, h: 88, size: [46, 78], ay: 0.72, layer: 'ground' },
    boneSkullPile: { atlas: 'inside', x: 1420, y: 890, w: 190, h: 122, size: [46, 84], ay: 0.55, layer: 'ground' },
    voidTreeWide: { atlas: 'outside', x: 472, y: 445, w: 633, h: 406, size: [360, 620] },
    voidTreeBush: { atlas: 'outside', x: 0, y: 523, w: 452, h: 387, size: [300, 510] },
    voidTreeLarge: { atlas: 'outside', x: 554, y: 0, w: 432, h: 321, size: [260, 470] },
    voidTreeFork: { atlas: 'outside', x: 1328, y: 388, w: 316, h: 329, size: [230, 410] },
    voidTreeTall: { atlas: 'outside', x: 1258, y: 19, w: 181, h: 301, size: [190, 350] },
    voidTreeBare: { atlas: 'outside', x: 1505, y: 22, w: 174, h: 291, size: [170, 330] },
    voidStump: { atlas: 'outside', x: 1733, y: 206, w: 148, h: 221, size: [150, 270] },
    voidTrunk: { atlas: 'outside', x: 1714, y: 468, w: 116, h: 190, size: [110, 210] },
    voidGrass: { atlas: 'outside', x: 1037, y: 164, w: 93, h: 180, size: [70, 140] }
  };
  const INSIDE_GROUND = ['stoneSlab', 'corpse', 'eggs', 'driftbone', 'bones', 'ribcage', 'reeds',
    'bonePile', 'bonePileSmall', 'graveCross', 'boneSkullPile'];
  const INSIDE_PROP = ['stonePillar', 'redMushroom', 'violetRock', 'grave', 'rockTree', 'branch'];
  // 骨头类（含尸骸），用于额外的骸骨铺撒，权重靠重复项调节
  const INSIDE_BONE = ['driftbone', 'bones', 'ribcage', 'corpse', 'bonePile', 'bonePileSmall',
    'graveCross', 'boneSkullPile', 'bonePile', 'bones', 'ribcage'];
  // 草丛类：大量投放
  const INSIDE_GRASS = ['grassBush', 'leafPlant', 'dryGrassBig', 'cattail', 'deadPlant',
    'grassBush', 'dryGrassBig', 'leafPlant'];
  const OUTSIDE_IDS = ['voidTreeWide', 'voidTreeBush', 'voidTreeLarge', 'voidTreeFork', 'voidTreeTall', 'voidTreeBare', 'voidStump', 'voidTrunk', 'voidGrass'];
  const images = { inside: null, outside: null };
  const failed = { inside: false, outside: false };
  const loading = { inside: false, outside: false };
  let callbacks = [];

  function flush() {
    const list = callbacks;
    callbacks = [];
    for (const cb of list) cb();
  }
  function loadAtlas(atlas) {
    if (images[atlas] || failed[atlas] || loading[atlas]) return;
    loading[atlas] = true;
    const image = new Image();
    image.onload = () => { images[atlas] = image; loading[atlas] = false; flush(); };
    image.onerror = () => { failed[atlas] = true; loading[atlas] = false; flush(); };
    DG.assets.assign(image, atlas === 'inside' ? INSIDE : OUTSIDE);
  }
  function pick(list, h) { return list[Math.min(list.length - 1, Math.floor(h * list.length))]; }

  DG.art.terrainDecor = {
    def(id) { return DEFS[id]; },
    pickInsideGround(h) { return pick(INSIDE_GROUND, h); },
    pickInsideBone(h) { return pick(INSIDE_BONE, h); },
    pickInsideGrass(h) { return pick(INSIDE_GRASS, h); },
    pickInsideProp(h) { return pick(INSIDE_PROP, h); },
    pickOutside(h) { return pick(OUTSIDE_IDS, h); },
    ready() { return !!(images.inside && images.outside); },
    shardImage(id) {
      const d = DEFS[id];
      return d ? images[d.atlas] : null;
    },
    // 破碎碎片：按图集源矩形裁切绘制，供破坏特效复用
    drawShard(ctx, img, sx, sy, sw, sh, x, y, rot, scale, alpha) {
      if (!img) return;
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      if (scale && scale !== 1) ctx.scale(scale, scale);
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.drawImage(img, sx, sy, sw, sh, -sw * 0.5, -sh * 0.5, sw, sh);
      ctx.restore();
    },
    load(cb) {
      if (cb) callbacks.push(cb);
      loadAtlas('inside');
      loadAtlas('outside');
      if (images.inside && images.outside) flush();
    },
    draw(ctx, item) {
      const d = DEFS[item.id];
      const image = d && images[d.atlas];
      if (!d || !image) return;
      const s = item.s || 1;
      const w = d.w * s, h = d.h * s;
      const ay = d.ay == null ? 1 : d.ay;
      ctx.save();
      ctx.translate(item.x, item.y);
      // 立件落地阴影：把道具“压”在地面上，与角色拉开层次
      if (item.layer === 'prop' && item.zone === 'inside') {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.4, w * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (item.rot) ctx.rotate(item.rot);
      if (item.flip) ctx.scale(-1, 1);
      ctx.globalAlpha = item.alpha == null ? 1 : item.alpha;
      ctx.drawImage(image, d.x, d.y, d.w, d.h, -w * 0.5, -h * ay, w, h);
      ctx.restore();
    }
  };
})();
