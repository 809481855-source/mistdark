/* 副本战斗 · 渲染层：地面、单位、特效与屏幕遮罩 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  // 把 #rrggbb 拆成带透明度的 rgba，用于拖尾/光束渐变
  function withAlpha(hex, a) {
    if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // 游侠箭矢视觉参数：按技能区分箭身大小、拖尾长度与光晕强度
  const RANGER_ARROW = {
    arrow:     { scale: 1.08, trail: 52,  width: 3.0, color: '#e8f4cd', glow: 0 },
    multishot: { scale: 0.98, trail: 42,  width: 2.5, color: '#d6ecc0', glow: 0 },
    snipe:     { scale: 1.52, trail: 172, width: 6.8, color: '#f6ffdf', glow: 0 },
    arrowrain: { scale: 1.08, trail: 88,  width: 2.8, color: '#c2dbaa', glow: 0 }
  };

  // 游走旋风外观：'thunderwind' = 接入的雷电龙卷 40 帧序列；'vector' = 原矢量尘风
  // 只有旋风斩命中敌人后召唤的游走旋风用它，野蛮人旋风技能本身的刀光不受影响
  const TORNADO_SKIN = 'thunderwind';
  // 图集 8×5 格、每格 224×224，与 assets/fx/barb-thunderwind-frames.png 对应
  // 序列帧 15fps 播放：旋转观感比原先的 30fps 慢一半，配合龙卷风的缓慢游动
  const tornadoFx = {
    img: null, white: null, cell: 224, cols: 8, frames: 40, fps: 15,
    w: 178, h: 268,   // 单格绘制尺寸：横向略压，贴近原矢量旋风“窄高”的柱形
    anchor: 0.808     // 画面底部在格内的比例，用来把柱脚钉在地面
  };
  // 白色染色：source-atop 只覆盖有像素的区域，保留柱身明暗，只把青绿色压成白色
  function buildTornadoWhite() {
    const img = tornadoFx.img;
    if (tornadoFx.white || !img || !img.complete || !img.naturalWidth) return;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(236,242,248,0.66)';
    g.fillRect(0, 0, c.width, c.height);
    tornadoFx.white = c;
  }
  {
    const img = new Image();
    tornadoFx.img = img;
    img.onload = buildTornadoWhite;
    DG.assets.assign(img, 'assets/fx/barb-thunderwind-frames.png?v=20261125a');
  }

  function shapePath(ctx, shape, r) {
  ctx.beginPath();
  if (shape === 'triangle') {
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r, r * 0.85);
    ctx.lineTo(-r, r * 0.85);
  } else if (shape === 'square') {
    ctx.rect(-r, -r, r * 2, r * 2);
  } else if (shape === 'diamond') {
    ctx.moveTo(0, -r * 1.2);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r * 1.2);
    ctx.lineTo(-r, 0);
  } else if (shape === 'hex') {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  } else {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.closePath();
  }

  // 拆分后的共享工具：地形、实体两个渲染子模块通过它取用（加载顺序：本文件先于两者）
  DG.scenes.dungeonRender = {
    W, H, ARENA_W, ARENA_H, U,
    withAlpha, shapePath, RANGER_ARROW, TORNADO_SKIN, tornadoFx, buildTornadoWhite
  };

  Object.assign(DG.scenes.dungeon.prototype, {
  draw() {
    const ctx = this.ctx;
    // 渲染倍率：弱设备降分辨率时按倍率缩放逻辑坐标系，所有绘制自动变轻
    const rs = (DG.game && DG.game.renderScale) || 1;
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    ctx.fillStyle = '#0d1411';
    ctx.fillRect(0, 0, W, H);

    let sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = U.rand(-5, 5) * this.shake * 2;
      sy = U.rand(-5, 5) * this.shake * 2;
    }

    ctx.save();
    const z = this.zoom || 1;
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(z, z);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.drawGround(ctx);
    // 血迹贴地：在所有掉落、特效与怪物之下
    this.drawBlood(ctx);
    // 场地机制与天气地形贴地绘制（火圈/血泊/草丛/枫叶堆/水洼）
    this.drawFieldGround(ctx);
    // 贴地骨头：压在血迹之上、所有实体之下
    this.drawBones(ctx);
    this.drawChests(ctx);
    this.drawDrops(ctx);
    this.drawMoveTarget(ctx);
    // 首领预警类特效贴地绘制，避免盖住角色
    this.drawEffects(ctx, true);
    // 贴地贴花永远压在地面之上、角色之下
    this.drawSceneProps(ctx, 'inside', 'ground');
    // 黑域剪影是地图外的背景：贴着边界摆放后可能和角色的头顶/身体在屏幕上重叠，
    // 画在角色与怪物之下，保证资源永远不会“盖住角色”
    this.drawSceneProps(ctx, 'outside');
    // 按脚底 y 深度排序，玩家夹在前后两层之间：
    // 后排怪物永远不会盖住前排，杜绝“骑在头上”的错觉
    this.sortMonstersForDraw();
    this.drawPropBand(ctx, -Infinity, this.player.y);
    this.drawPlayer(ctx);
    this.drawPropBand(ctx, this.player.y, Infinity);
    this.drawMonsterBars(ctx);
    this.drawFearIcons(ctx);
    this.drawProjectiles(ctx);
    this.drawEffects(ctx, false);
    this.drawFloaters(ctx);

    ctx.restore();

    // 天气：在实体/特效之上、暗角与受击红闪之下，保证战斗信息优先
    this.drawWeather(ctx);
    // 场地视野压制与隐匿提示：压在天气之后、UI 之前
    this.drawFieldOverlay(ctx);
    this.drawScreenOverlay(ctx);
  },
  // 世界坐标下的可视矩形（含 margin 余量），用于剔除屏幕外的单位/掉落/特效
  viewRect(margin) {
    const z = this.zoom || 1;
    const m = margin || 0;
    return {
      l: this.camera.x - W / (2 * z) - m,
      r: this.camera.x + W / (2 * z) + m,
      t: this.camera.y - H / (2 * z) - m,
      b: this.camera.y + H / (2 * z) + m
    };
  },
  // 发光贴图缓存：用预渲染径向渐变代替逐帧 shadowBlur（手机端 shadowBlur 很贵）
  glowSprite(color) {
    if (!this._glowCache) this._glowCache = new Map();
    let g = this._glowCache.get(color);
    if (g) return g;
    const R = 32;
    const c = document.createElement('canvas');
    c.width = c.height = R * 2;
    const cx = c.getContext('2d');
    const rg = cx.createRadialGradient(R, R, 0, R, R, R);
    rg.addColorStop(0, withAlpha(color, 0.9));
    rg.addColorStop(0.35, withAlpha(color, 0.34));
    rg.addColorStop(1, withAlpha(color, 0));
    cx.fillStyle = rg;
    cx.fillRect(0, 0, R * 2, R * 2);
    this._glowCache.set(color, c);
    return c;
  },
  drawMoveTarget(ctx) {
    if (!this.moveTarget) return;
    const r = 9 + Math.sin(this.time * 7) * 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(201,162,95,.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.moveTarget.x, this.moveTarget.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(227,200,142,.9)';
    ctx.beginPath();
    ctx.arc(this.moveTarget.x, this.moveTarget.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  drawScreenOverlay(ctx) {
    // 边缘暗角：预渲染成半分辨率离屏图后逐帧 drawImage。
    // 整屏径向渐变填充在高分屏手机上每帧要重算数百万像素，是掉帧大户。
    let vign = this._vignetteImg;
    if (!vign) {
      vign = document.createElement('canvas');
      vign.width = Math.ceil(W / 2);
      vign.height = Math.ceil(H / 2);
      const vg = vign.getContext('2d');
      vg.scale(0.5, 0.5);
      const rg = vg.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.92);
      rg.addColorStop(0, 'rgba(0,0,0,0)');
      rg.addColorStop(1, 'rgba(0,0,0,0.62)');
      vg.fillStyle = rg;
      vg.fillRect(0, 0, W, H);
      this._vignetteImg = vign;
    }
    ctx.drawImage(vign, 0, 0, W, H);

    // 受击红闪
    if (this.hurtFlash > 0) {
      const hf = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.8);
      hf.addColorStop(0, 'rgba(150, 20, 15, 0)');
      hf.addColorStop(1, `rgba(150, 20, 15, ${this.hurtFlash * 0.55})`);
      ctx.fillStyle = hf;
      ctx.fillRect(0, 0, W, H);
    }

    // 首领降临红屏：开场整屏压红，随后边缘脉动收束（渐变对象缓存，仅调 alpha）
    if (this.bossFlash > 0) {
      let bv = this._bossVignette;
      if (!bv) {
        bv = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.88);
        bv.addColorStop(0, 'rgba(210, 36, 26, 0.05)');
        bv.addColorStop(0.55, 'rgba(214, 40, 30, 0.2)');
        bv.addColorStop(1, 'rgba(232, 44, 32, 0.62)');
        this._bossVignette = bv;
      }
      const k = Math.min(1, this.bossFlash / 1.3);
      const pulse = 0.72 + 0.28 * Math.sin((1.6 - this.bossFlash) * 22);
      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.35 + k * 0.65) * pulse;
      ctx.fillStyle = bv;
      ctx.fillRect(0, 0, W, H);
      if (k > 0.62) {
        ctx.globalAlpha = (k - 0.62) * 0.85;
        ctx.fillStyle = 'rgba(168, 20, 14, 1)';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    this.drawMinimap(ctx);
  },
  // 小地图底图缓存：首次全量绘制，之后只补画刚揭开的格子，
  // 避免每次探索推进都做一遍 90×96 全图填色（移动端很容易掉帧）
  buildMinimapCache() {
    const T = DG.scenes.dungeon.terrain;
    const R = DG.scenes.dungeon.minimapRect;
    const mw = R.w, mh = R.h;
    const gw = (this.arenaW || T.COLS * T.TILE) / T.TILE;
    const gh = (this.arenaH || T.ROWS * T.TILE) / T.TILE;
    const sx = mw / gw;
    const sy = mh / gh;
    let c = this._minimapCanvas;
    const full = !c;
    if (!c) {
      c = document.createElement('canvas');
      c.width = mw;
      c.height = mh;
      this._minimapCanvas = c;
    }
    const g = c.getContext('2d');
    const paint = (tx, ty) => {
      g.fillStyle = this.isFloorTile(tx, ty)
        ? 'rgba(120,150,128,.32)'
        : 'rgba(26,34,30,.85)';
      g.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
    };
    if (full) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, mw, mh);
      for (let ty = 0; ty < T.ROWS; ty++) {
        for (let tx = 0; tx < T.COLS; tx++) {
          if (this.explored[ty * T.COLS + tx]) paint(tx, ty);
        }
      }
      this._minimapNew = null;
    } else {
      const list = this._minimapNew;
      this._minimapNew = null;
      if (list) {
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          paint(i % T.COLS, (i / T.COLS) | 0);
        }
      }
    }
    this._minimapDirty = false;
  },
  // 小地图的屏幕区域：把 DOM 外框的位置换算回画布逻辑坐标。
  // 画布固定按 810×1680 绘制，再等比缩放（cover）进舞台，
  // 因此不能直接用 720 舞台里的写死坐标，否则地图会缩一圈并整体偏移。
  minimapRectNow() {
    // getBoundingClientRect 会强制同步布局，逐帧调用在手机上很贵；
    // 400ms 内复用上次结果，转屏 / 改尺寸后最多半秒内自动跟上。
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this._mapRect && this._mapRectAt && now - this._mapRectAt < 400) return this._mapRect;
    const c = this.canvas.getBoundingClientRect();
    const f = this.$map && this.$map.getBoundingClientRect();
    if (!f || !c.width || !c.height) return DG.scenes.dungeon.minimapRect;
    const kx = W / c.width;
    const ky = H / c.height;
    const rect = {
      x: (f.left - c.left) * kx,
      y: (f.top - c.top) * ky,
      w: f.width * kx,
      h: f.height * ky
    };
    this._mapRect = rect;
    this._mapRectAt = now;
    return rect;
  },
  // 左上角小地图：只显示已探索区域、玩家位置与首领方位
  drawMinimap(ctx) {
    // 首领血条出现时同步屏蔽小地图（与 DOM 的 boss-mode 保持一致）
    if (this.monsters.some(m => m.boss && !m.dead)) return;
    const T = DG.scenes.dungeon.terrain;
    const R = this.minimapRectNow();
    const mx = R.x, my = R.y, mw = R.w, mh = R.h;
    const gw = (this.arenaW || T.COLS * T.TILE) / T.TILE;
    const gh = (this.arenaH || T.ROWS * T.TILE) / T.TILE;
    const sx = mw / gw;
    const sy = mh / gh;
    ctx.save();
    if (!this._minimapCanvas || this._minimapDirty) this.buildMinimapCache();
    // 底图按外框实际大小拉伸绘制，保证与外框严丝合缝
    ctx.drawImage(this._minimapCanvas, mx, my, mw, mh);

    // 当前视野范围
    const z = this.zoom || 1;
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mx + (this.camera.x - W / (2 * z)) / T.TILE * sx,
      my + (this.camera.y - H / (2 * z)) / T.TILE * sy,
      W / z / T.TILE * sx, H / z / T.TILE * sy
    );

    // 首领标记
    const boss = this.monsters.find(m => m.boss && !m.dead);
    if (boss) {
      const bx = mx + boss.x / T.TILE * sx;
      const by = my + boss.y / T.TILE * sy;
      const pulse = 0.5 + Math.sin(this.time * 5) * 0.5;
      ctx.fillStyle = `rgba(220,80,70,${0.3 + pulse * 0.4})`;
      ctx.beginPath();
      ctx.arc(bx, by, 5 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff6a5e';
      ctx.beginPath();
      ctx.arc(bx, by, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 玩家标记与朝向
    const px = mx + this.player.x / T.TILE * sx;
    const py = my + this.player.y / T.TILE * sy;
    ctx.strokeStyle = 'rgba(159,230,173,.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(this.player.facing) * 6, py + Math.sin(this.player.facing) * 6);
    ctx.stroke();
    ctx.fillStyle = '#9fe6ad';
    ctx.beginPath();
    ctx.arc(px, py, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  });
})();
