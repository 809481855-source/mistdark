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
  // 进图时预热地块贴图：显存有限，手机端只烘焙出生点附近的若干块，
  // 其余在接近时再补，避免一次性占满低端机纹理内存。
  bakeTerrain() {
    if (this._terrainBaked) return;
    this._terrainBaked = true;
    this._chunkCache = new Map();
    const n = (this.chunks || []).length;
    if (!n) return;
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    const T = DG.scenes.dungeon.terrain;
    // 手机端按 1.1 倍烘焙（缩放后仍清晰），四周出血缩短到半格，单块约 4.4MB
    this._chunkK = coarse ? 1.1 : 1.25;
    this._chunkM = coarse ? 20 : 40;
    // 手机端最多常驻 6 块（约 27MB），桌面端仍全部常驻
    this._chunkCap = coarse ? Math.min(n, 6) : n;
    this._chunkScanT = 0;
    // 按距出生点由近到远预热，保证开局视野内的地块已经就绪
    const px = this.player.x, py = this.player.y;
    const order = this.chunks.map((ch, i) => {
      const cx = ch.px + ch.w * T.TILE / 2, cy = ch.py + ch.h * T.TILE / 2;
      return { i, d: Math.abs(cx - px) + Math.abs(cy - py) };
    }).sort((a, b) => a.d - b.d);
    const warm = Math.min(order.length, this._chunkCap);
    for (let k = 0; k < warm; k++) {
      const tex = this.terrainChunkCanvas(order[k].i);
      if (tex) this.warmChunkTex(tex);
    }
    this._warmCanvas = null;
    this._warmCtx = null;
  },
  // 手机端按需补块：玩家接近未缓存地块时才烘焙，最多每 0.4 秒一块，
  // 既不会在战斗中连续掉帧，也不会让贴图缓存无限增长。
  maybePrefetchChunk(dt) {
    if (!this._chunkCache) return;
    this._chunkScanT = (this._chunkScanT || 0) + dt;
    if (this._chunkScanT < 0.4) return;
    this._chunkScanT = 0;
    const ci = this.nearestMissingChunk(1100);
    if (ci < 0) return;
    // 缓存已满时先淘汰离玩家最远的一块，把位置让给即将进入的区域
    while (this._chunkCache.size >= this._chunkCap) {
      if (!this.evictFarthestChunk()) break;
    }
    this.terrainChunkCanvas(ci);
  },
  evictFarthestChunk() {
    if (!this._chunkCache || !this._chunkCache.size) return false;
    const T = DG.scenes.dungeon.terrain;
    const px = this.player.x, py = this.player.y;
    let farKey = null, farD = -1;
    for (const ci of this._chunkCache.keys()) {
      const ch = this.chunks[ci];
      if (!ch) continue;
      const cx = ch.px + ch.w * T.TILE / 2, cy = ch.py + ch.h * T.TILE / 2;
      const d = Math.abs(cx - px) + Math.abs(cy - py);
      if (d > farD) { farD = d; farKey = ci; }
    }
    if (farKey == null) return false;
    this._chunkCache.delete(farKey);
    return true;
  },
  nearestMissingChunk(range) {
    const T = DG.scenes.dungeon.terrain;
    const px = this.player.x, py = this.player.y;
    let best = -1, bestD = range;
    for (const ch of this.chunks) {
      if (this._chunkCache.has(ch.index)) continue;
      const left = ch.px, top = ch.py;
      const right = left + ch.w * T.TILE, bottom = top + ch.h * T.TILE;
      const dx = Math.max(0, left - px, px - right);
      const dy = Math.max(0, top - py, py - bottom);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = ch.index; }
    }
    return best;
  },
  // 以 1:1 画一次，促使显卡真正建立纹理；否则首次 drawImage 仍会在战斗帧里付这笔钱
  warmChunkTex(tex) {
    if (!this._warmCanvas) {
      const c = document.createElement('canvas');
      c.width = tex.width;
      c.height = tex.height;
      this._warmCanvas = c;
      this._warmCtx = c.getContext('2d');
    }
    this._warmCtx.drawImage(tex, 0, 0);
  },
  terrainChunkCanvas(ci) {
    if (!this._chunkCache) this._chunkCache = new Map();
    let tex = this._chunkCache.get(ci);
    if (tex) {
      // 命中即刷新 LRU 顺序
      this._chunkCache.delete(ci);
      this._chunkCache.set(ci, tex);
      return tex;
    }
    tex = this.bakeChunk(ci);
    this._chunkCache.set(ci, tex);
    // 正常流程下进图时已把全图烘完（cap = 块数），这里只是兜底：
    // 万一有块被淘汰，控制缓存上限，避免无限增长
    const cap = this._chunkCap || 6;
    while (this._chunkCache.size > cap) {
      this._chunkCache.delete(this._chunkCache.keys().next().value);
    }
    return tex;
  },
  bakeChunk(ci) {
    const T = DG.scenes.dungeon.terrain;
    const TILE = T.TILE;
    const ch = this.chunks[ci];
    const K = this._chunkK || 1.25;   // 略高于世界像素密度，缩放后不发糊
    const M = this._chunkM || TILE;   // 四周出血，消除块与块之间的接缝
    const cw = ch.w * TILE, chh = ch.h * TILE;
    const ox = ch.px - M, oy = ch.py - M;
    const w = cw + M * 2, h = chh + M * 2;
    const c = document.createElement('canvas');
    c.width = Math.round(w * K);
    c.height = Math.round(h * K);
    const g = c.getContext('2d');
    g.setTransform(K, 0, 0, K, 0, 0);
    g.translate(-ox, -oy);

    const st = this.mapStyle || T.STYLES.grove;
    if (!this._outline) return c;

    // 地面：只处理本块范围，再裁剪进全局平滑轮廓
    g.save();
    g.beginPath();
    g.rect(ox, oy, w, h);
    g.clip();
    g.clip(this._outline, 'evenodd');
    g.fillStyle = st.ground || (st.floor && st.floor[0]) || '#3d3b23';
    g.fillRect(ox, oy, w, h);
    this.drawChunkGroundArt(g, ch, ox, oy, w, h);
    for (const r of this.rooms) {
      if (r.cx + 600 < ox || r.cx - 600 > ox + w || r.cy + 600 < oy || r.cy - 600 > oy + h) continue;
      const rad = Math.max(r.w, r.h) * TILE * 0.72;
      const rg = g.createRadialGradient(r.cx, r.cy, rad * 0.15, r.cx, r.cy, rad);
      rg.addColorStop(0, st.accent);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(r.cx, r.cy, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // 平滑岩壁轮廓：只在地面内侧做渐暗与墨线收口，
    // 描边全部裁进轮廓内部，不再向墙外溢出第二道边
    g.save();
    g.beginPath();
    g.rect(ox, oy, w, h);
    g.clip();
    g.clip(this._outline, 'evenodd');
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 24;
    g.stroke(this._outline);
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 9;
    g.stroke(this._outline);
    g.strokeStyle = 'rgba(10,10,6,0.82)';
    g.lineWidth = 3.2;
    g.stroke(this._outline);
    g.strokeStyle = st.edge;
    g.lineWidth = 1.3;
    g.stroke(this._outline);
    g.restore();

    // 地面色斑与边缘氛围装饰：只画落在本块范围内的
    g.save();
    g.beginPath();
    g.rect(ox, oy, w, h);
    g.clip();
    for (const d of this.decor) {
      if (d.x < ox - 220 || d.x > ox + w + 220 || d.y < oy - 220 || d.y > oy + h + 220) continue;
      if (d.fog) {
        const fg = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 7);
        fg.addColorStop(0, `rgba(150, 170, 160, ${d.alpha})`);
        fg.addColorStop(1, 'rgba(120, 140, 130, 0)');
        g.fillStyle = fg;
        g.beginPath();
        g.arc(d.x, d.y, d.r * 7, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = 'rgba(255,255,255,0.028)';
        g.beginPath();
        const pts = 6;
        for (let i = 0; i < pts; i++) {
          const a = d.seed + (i / pts) * Math.PI * 2;
          const rr = d.r * (0.7 + (i % 3) * 0.18);
          const px = d.x + Math.cos(a) * rr;
          const py = d.y + Math.sin(a) * rr;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
      }
    }
    g.restore();
    return c;
  },
  // 块内卡通地面：大色块 + 稀疏草叶，用块序号做确定性抖动，缓存复用不跳变
  drawChunkGroundArt(g, ch, ox, oy, w, h) {
    const T = DG.scenes.dungeon.terrain;
    const TILE = T.TILE, hash2 = T.hash2;
    const st = this.mapStyle;
    // 色斑按世界网格生成：相邻地块在重叠区画出的图案完全一致，
    // 拼接时后画的块不会在交界处留下色差竖线
    const CELL = 160;
    const gx0 = Math.floor(ox / CELL) - 1, gx1 = Math.ceil((ox + w) / CELL);
    const gy0 = Math.floor(oy / CELL) - 1, gy1 = Math.ceil((oy + h) / CELL);
    for (let cy = gy0; cy <= gy1; cy++) {
      for (let cx = gx0; cx <= gx1; cx++) {
        const s1 = hash2(cx * 31 + 7, cy * 17 + 3);
        const s2 = hash2(cx * 13 + 5, cy * 29 + 11);
        const s3 = hash2(cx * 7 + 9, cy * 23 + 1);
        const x = (cx + s1) * CELL;
        const y = (cy + s2) * CELL;
        const r = 60 + s3 * 150;
        g.fillStyle = hash2(cx * 3 + 1, cy * 5 + 2) > 0.55 ? st.groundHi : st.groundLo;
        const n = 7;
        const rot = hash2(cx * 11 + 3, cy * 19 + 7) * Math.PI * 2;
        const pts = [];
        for (let k = 0; k < n; k++) {
          const a = rot + (k / n) * Math.PI * 2;
          const rr = r * (0.7 + hash2(cx * 23 + k, cy * 41 + k * 7) * 0.55);
          pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.78 });
        }
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let k = 0; k < n; k++) {
          const p = pts[(k + 1) % n];
          const q = pts[(k + 2) % n];
          g.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
        }
        g.closePath();
        g.fill();
      }
    }

    g.strokeStyle = st.mark || 'rgba(47,68,42,0.5)';
    g.lineWidth = 2;
    g.lineCap = 'round';
    // 草叶记号同样用世界网格，保证跨块连续
    const MK = 96;
    const mx0 = Math.floor(ox / MK) - 1, mx1 = Math.ceil((ox + w) / MK);
    const my0 = Math.floor(oy / MK) - 1, my1 = Math.ceil((oy + h) / MK);
    for (let cy = my0; cy <= my1; cy++) {
      for (let cx = mx0; cx <= mx1; cx++) {
        if (hash2(cx * 53 + 3, cy * 37 + 9) < 0.28) continue;
        const x = (cx + hash2(cx * 17 + 1, cy * 43 + 5)) * MK;
        const y = (cy + hash2(cx * 29 + 7, cy * 19 + 3)) * MK;
        if (!this.isFloorTile(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x - 1, y - 6, x - 3, y - 10);
        g.moveTo(x + 3, y);
        g.quadraticCurveTo(x + 3, y - 7, x + 3, y - 12);
        g.moveTo(x + 6, y);
        g.quadraticCurveTo(x + 7, y - 5, x + 9, y - 8);
        g.stroke();
      }
    }
  },
  drawGround(ctx) {
    const T = DG.scenes.dungeon.terrain;
    const TILE = T.TILE, COLS = T.COLS, ROWS = T.ROWS;
    const cam = this.camera;
    const z = this.zoom || 1;
    const left = cam.x - W / (2 * z) - TILE * 2;
    const right = cam.x + W / (2 * z) + TILE * 2;
    const top = cam.y - H / (2 * z) - TILE * 2;
    const bottom = cam.y + H / (2 * z) + TILE * 2;

    // 场景外与岩壁：纯黑，不加任何材质
    ctx.fillStyle = '#000';
    ctx.fillRect(left, top, right - left, bottom - top);

    // 只绘制视野覆盖到的地块。剔除按地块自身范围判断，不额外放大：
    // 地块纹理已自带 1 格出血，放大剔除范围会多带出上下两排地块，
    // 使同屏地块数超过缓存上限，导致每帧反复重烘焙、帧率骤降
    const M = TILE;
    for (const ch of this.chunks || []) {
      const cw = ch.w * TILE, chh = ch.h * TILE;
      if (ch.px > right || ch.px + cw < left || ch.py > bottom || ch.py + chh < top) continue;
      const tex = this.terrainChunkCanvas(ch.index);
      if (tex) ctx.drawImage(tex, ch.px - M, ch.py - M, cw + M * 2, chh + M * 2);
    }

    // 探索迷雾：低分辨率迷雾贴图放大插值，得到柔和的连续雾层
    if (this._fogCanvas) {
      const tx0 = Math.max(0, Math.floor(left / TILE));
      const tx1 = Math.min(COLS - 1, Math.floor(right / TILE));
      const ty0 = Math.max(0, Math.floor(top / TILE));
      const ty1 = Math.min(ROWS - 1, Math.floor(bottom / TILE));
      const sw = tx1 - tx0 + 1;
      const sh = ty1 - ty0 + 1;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        this._fogCanvas,
        tx0, ty0, sw, sh,
        tx0 * TILE, ty0 * TILE, sw * TILE, sh * TILE
      );
      ctx.restore();
    }

    // 地图边缘：地面与迷雾一起向内渐隐到纯黑，抵达边界时不会出现硬切边。
    // 用一张低分辨率边框渐变贴图整体拉伸，只有靠近边界时才绘制。
    const ef = this.edgeFadeTex();
    const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
    if (ef && right > -ef.pad && left < aw + ef.pad && bottom > -ef.pad && top < ah + ef.pad) {
      ctx.drawImage(ef.canvas, -ef.pad, -ef.pad, aw + ef.pad * 2, ah + ef.pad * 2);
    }
  },
  // 边缘渐隐贴图：场景外 PAD 内为纯黑，沿四条边向内 BAND 像素淡出为透明
  edgeFadeTex() {
    const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
    const old = this._edgeFade;
    if (old && old.aw === aw && old.ah === ah) return old;
    const PAD = 72, BAND = 240, K = 6;
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round((aw + PAD * 2) / K));
    c.height = Math.max(2, Math.round((ah + PAD * 2) / K));
    const g = c.getContext('2d');
    const px = PAD / K, band = BAND / K;
    const w = c.width, h = c.height;
    // 每条边一条 From 黑 To 透明的线性渐变；四角叠加两层，过渡更自然
    const bandStroke = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,0.99)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0.62)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(rx, ry, rw, rh);
    };
    bandStroke(0, 0, px + band, 0, 0, 0, px + band, h);
    bandStroke(w, 0, w - px - band, 0, w - px - band, 0, px + band, h);
    bandStroke(0, 0, 0, px + band, 0, 0, w, px + band);
    bandStroke(0, h, 0, h - px - band, 0, h - px - band, w, px + band);
    this._edgeFade = { canvas: c, aw, ah, pad: PAD };
    return this._edgeFade;
  },
  // 未探索区域不画装饰：避免道具浮在黑色迷雾里，看起来像悬空
  propHidden(p) {
    if (p.zone !== 'inside' || !this.explored) return false;
    const T = DG.scenes.dungeon.terrain;
    const tx = Math.floor(p.x / T.TILE), ty = Math.floor(p.y / T.TILE);
    return !this.explored[ty * T.COLS + tx];
  },
  // 立件、怪物与龙卷风按脚底 y 交错绘制：站在谁前面就盖住谁，不会出现踩头
  drawPropBand(ctx, minY, maxY) {
    const AD = DG.art && DG.art.terrainDecor;
    const art = !!(AD && AD.ready());
    const v = art ? this.viewRect(360) : null;
    // 复用同一个数组：每帧两次调用不再各自分配
    const list = this._bandList || (this._bandList = []);
    list.length = 0;
    if (art) {
      for (const p of this.sceneProps || []) {
        if (p.destroyed || p.zone !== 'inside' || (p.layer || 'prop') !== 'prop') continue;
        if (p.y <= minY || p.y > maxY) continue;
        if (p.x < v.l || p.x > v.r || p.y < v.t || p.y > v.b) continue;
        if (this.propHidden(p)) continue;
        list.push(p);
      }
    }
    // 游走旋风以脚底 y 并入同一批立件排序，避免高柱身盖到身前的怪物头上
    for (const t of this.tornadoes || []) {
      if (t.y <= minY || t.y > maxY) continue;
      list.push({ tornado: t, y: t.y });
    }
    if (!list.length) { this.drawMonsters(ctx, maxY, minY, v); return; }
    list.sort((a, b) => a.y - b.y);
    let from = minY;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      this.drawMonsters(ctx, it.y, from, v);
      if (it.tornado) this.drawTornado(ctx, it.tornado);
      else AD.draw(ctx, it);
      from = it.y;
    }
    this.drawMonsters(ctx, maxY, from, v);
  },
  drawSceneProps(ctx, layer, sub) {
    const AD = DG.art && DG.art.terrainDecor;
    if (!AD || !AD.ready()) return;
    const v = this.viewRect(360);
    for (const p of this.sceneProps || []) {
      if (p.destroyed || p.zone !== layer) continue;
      if (sub && (p.layer || 'prop') !== sub) continue;
      if (this.propHidden(p)) continue;
      if (p.x < v.l || p.x > v.r || p.y < v.t || p.y > v.b) continue;
      AD.draw(ctx, p);
    }
  },
  drawChests(ctx) {
    const v = this.viewRect(80);
    for (const c of this.chests || []) {
      if (c.x < v.l || c.x > v.r || c.y < v.t || c.y > v.b) continue;
      ctx.save();
      ctx.translate(c.x, c.y);

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 9, 18, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      if (!c.opened) {
        const pulse = 0.5 + Math.sin(this.time * 3 + c.x * 0.01) * 0.5;
        ctx.strokeStyle = `rgba(227,200,142,${0.16 + pulse * 0.24})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -2, 24 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 箱体
      ctx.fillStyle = c.opened ? '#3a2c1c' : '#6b4a26';
      ctx.strokeStyle = '#2a1c10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-16, -6, 32, 16);
      ctx.fill();
      ctx.stroke();

      // 箱盖：未开启是拱形盖，开启后向上翻开
      ctx.fillStyle = c.opened ? '#2f2418' : '#7d572d';
      ctx.beginPath();
      if (c.opened) {
        ctx.moveTo(-16, -6);
        ctx.lineTo(-13, -18);
        ctx.lineTo(17, -18);
        ctx.lineTo(16, -6);
      } else {
        ctx.moveTo(-16, -6);
        ctx.quadraticCurveTo(0, -19, 16, -6);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 金属包边
      ctx.strokeStyle = c.opened ? 'rgba(160,130,80,.5)' : '#e3c88e';
      ctx.lineWidth = 2;
      const top = c.opened ? -18 : -13;
      ctx.beginPath();
      ctx.moveTo(-6, top);
      ctx.lineTo(-6, 10);
      ctx.moveTo(6, top);
      ctx.lineTo(6, 10);
      ctx.stroke();

      ctx.restore();
    }
  },
  drawDrops(ctx) {
    const v = this.viewRect(60);
    for (const d of this.drops) {
      if (d.x < v.l || d.x > v.r || d.y < v.t || d.y > v.b) continue;
      const bob = Math.sin(d.t * 4) * 3;
      if (d.kind === 'item') {
        const rar = DG.items.rarityInfo(d.item);
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        const gr = (d.item.rarity === 'legend' ? 26 : d.item.rarity === 'set' ? 22 : 18) *
          (d.item.ancient ? 1.2 : 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.glowSprite(rar.color), -gr, -gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = rar.color;
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = 'rgba(10,12,14,0.75)';
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      } else if (d.kind === 'orb') {
        // 血球：红色、大而醒目，靠近自动回血
        const pulse = 0.5 + Math.sin(d.t * 5) * 0.5;
        const coreR = 19 + Math.sin(d.t * 5) * 1.5;
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        // 地面血色光晕
        ctx.globalCompositeOperation = 'lighter';
        const gr = 46 + pulse * 10;
        ctx.drawImage(this.glowSprite('#ff3b30'), -gr, -gr, gr * 2, gr * 2);
        // 呼吸提示环：让血球在杂乱地面上一眼可见
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(255,86,72,${0.5 - pulse * 0.28})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 27 + pulse * 11, 0, Math.PI * 2);
        ctx.stroke();
        // 球体：内亮外暗的红色径向渐变
        const rg = ctx.createRadialGradient(-coreR * 0.35, -coreR * 0.4, coreR * 0.15, 0, 0, coreR);
        rg.addColorStop(0, '#ff8a7a');
        rg.addColorStop(0.45, '#e03024');
        rg.addColorStop(1, '#7d0b06');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, 0, coreR, 0, Math.PI * 2);
        ctx.fill();
        // 深色描边与高光：红地面上也能看清轮廓
        ctx.strokeStyle = 'rgba(60,2,0,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,220,210,0.75)';
        ctx.beginPath();
        ctx.ellipse(-coreR * 0.38, -coreR * 0.42, coreR * 0.28, coreR * 0.18, -0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (d.kind === 'rune') {
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.glowSprite('#8fb4ea'), -20, -20, 40, 40);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#8fb4ea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#c6ddff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('技', 0, 1);
        ctx.restore();
      }
    }
  },
  // 每帧只排序一次，前后两层绘制复用同一列表
  sortMonstersForDraw() {
    const list = this._drawMonsters || (this._drawMonsters = []);
    list.length = 0;
    for (const m of this.monsters) if (!m.dead) list.push(m);
    list.sort((a, b) => a.y - b.y);
  },
  // maxY / minY 把列表拆成玩家身后（y<=maxY）与身前（y>minY）两层
  // v 由调用方传入复用，避免每次绘制都新建可视矩形对象
  drawMonsters(ctx, maxY, minY, v) {
    const view = v || this.viewRect(220);
    const sorted = !!this._drawMonsters;
    const list = this._drawMonsters || this.monsters;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.dead) continue;
      if (m.y > maxY) {
        // 排序后的列表里后面只会更靠前，可直接结束本轮
        if (sorted) break;
        continue;
      }
      if (m.y <= minY) continue;
      if (m.x < view.l || m.x > view.r || m.y < view.t || m.y > view.b) continue;
      const artBoss = !!(m.boss && m.art && DG.art.bosses);
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      ctx.save();
      ctx.translate(m.x, m.y);

      // 阴影
      if (artBoss) {
        ctx.fillStyle = 'rgba(0,0,0,0.40)';
        ctx.beginPath();
        ctx.ellipse(0, m.r * 0.72, m.r * 1.25, m.r * 0.44, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (artMob) {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.ellipse(0, m.r * 0.72, m.r * 1.12, m.r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, m.r * 0.85, m.r * 0.9, m.r * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (m.boss) {
        const pulse = 0.5 + Math.sin(this.time * 3) * 0.2;
        ctx.strokeStyle = `rgba(217, 139, 157, ${0.18 + pulse * 0.18})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, m.r + 9 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (m.elite) {
        const affixes = m.affixes || [];
        const table = DG.scenes.dungeon.ELITE_AFFIXES || {};
        if (affixes.length) {
          // 词缀环：一条词缀一道色环，玩家看颜色就知道要防什么
          for (let i = 0; i < affixes.length; i++) {
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = (table[affixes[i]] && table[affixes[i]].color) || 'rgba(201,162,95,0.65)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, m.r + 5 + i * 4, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = 'rgba(201,162,95,0.65)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, m.r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // 护盾：沿精英外圈画一道青色弧，剩余量一目了然
      if (m.shield > 0 && m.maxShield) {
        const ratio = Math.max(0, Math.min(1, m.shield / m.maxShield));
        ctx.strokeStyle = 'rgba(127,208,192,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, m.r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.stroke();
      }
      if (m.slow > 0) {
        ctx.strokeStyle = 'rgba(142,201,232,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, m.r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (artBoss) {
        DG.art.bosses.draw(ctx, m, { t: this.time, cast: m.cast });
      } else if (artMob) {
        DG.art.monsters.draw(ctx, m, { t: this.time });
      } else {
        ctx.fillStyle = m.flash > 0 ? '#f5f0e6' : m.color;
        shapePath(ctx, m.shape, m.r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.42)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 眼睛朝向
        const ang = U.angle(m, this.player);
        ctx.fillStyle = 'rgba(255, 235, 200, 0.75)';
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * m.r * 0.36, Math.sin(ang) * m.r * 0.36, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 受击反馈：所有怪物统一补一圈白光。素材怪依赖各自的闪白贴图，
      // 部分分件/缺图素材不会变色，这里用轮廓光保证任何怪物、任何攻击都有清晰回馈
      if (m.flash > 0) {
        const fa = Math.min(1, m.flash / 0.13);
        const lit = artBoss || artMob;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fa * (lit ? 0.5 : 0.42);
        ctx.strokeStyle = lit ? '#fff0da' : '#fffdf2';
        ctx.lineWidth = lit ? 3 : 2.6;
        ctx.beginPath();
        ctx.ellipse(0, -m.r * 0.12, m.r * 0.92, m.r * 1.12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  },
  // 血条单独一层：后排怪被前排轮廓遮住后，血量依然看得见
  drawMonsterBars(ctx) {
    const v = this.viewRect(220);
    for (const m of (this._drawMonsters || this.monsters)) {
      // 精英常驻血条与名字；普通怪只在受击后短暂显示
      if (m.dead || m.boss || (!m.elite && m.hitT <= 0)) continue;
      if (m.x < v.l || m.x > v.r || m.y < v.t || m.y > v.b) continue;
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      // 比角色头顶的状态条略小一号，拉高到 8px，便于看清
      const w = m.r * 2 + 10;
      const h = 8;
      const y = m.y + (artMob ? m.r * 0.72 - DG.art.monsters.displayHeight(m) - 10 : -m.r - 12);
      ctx.globalAlpha = m.elite ? 1 : U.clamp(m.hitT / 0.35, 0, 1);
      ctx.fillStyle = 'rgba(18,13,13,0.92)';
      ctx.fillRect(m.x - w / 2, y, w, h);
      ctx.fillStyle = m.elite ? '#d9b24a' : '#b8463f';
      ctx.fillRect(m.x - w / 2, y, w * U.clamp(m.hp / m.maxHp, 0, 1), h);
      ctx.strokeStyle = 'rgba(0,0,0,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(m.x - w / 2 - 1, y - 1, w + 2, h + 2);
      // 精英名字：字号随体型微调且不超过 11px，宽度严格限制在血条内
      if (m.elite) {
        const fs = Math.max(9, Math.min(11, m.r * 0.5));
        let label = (m.baseName || m.name || '').replace(/^精英\s*·\s*/, '');
        ctx.font = `600 ${fs}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        // 超宽时逐字裁掉并补省略号，避免压到旁边的怪
        if (ctx.measureText(label).width > w) {
          while (label.length > 1 && ctx.measureText(label + '…').width > w) {
            label = label.slice(0, -1);
          }
          label += '…';
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(label, m.x, y - 4);
        ctx.fillStyle = '#ead9a8';
        ctx.fillText(label, m.x, y - 4);
      }
      ctx.globalAlpha = 1;
    }
    // 眩晕图标：不受血条显隐限制，眩晕期间常驻头顶
    for (const m of (this._drawMonsters || this.monsters)) {
      if (m.dead || m.boss || !(m.stun > 0)) continue;
      if (m.x < v.l || m.x > v.r || m.y < v.t || m.y > v.b) continue;
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      const barY = m.y + (artMob ? m.r * 0.72 - DG.art.monsters.displayHeight(m) - 10 : -m.r - 12);
      // 精英头顶多了一行名字，眩晕星再上移一档，避免压住文字
      const cx = m.x, cy = barY - (m.elite ? 24 : 12);
      const rot = this.time * 5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#ffd45e';
      ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const a = rot + i * Math.PI * 2 / 3;
        const sx = Math.cos(a) * 12, sy = Math.sin(a) * 4 - 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx + 1.6, sy - 1.6);
        ctx.lineTo(sx + 4, sy);
        ctx.lineTo(sx + 1.6, sy + 1.6);
        ctx.lineTo(sx, sy + 4);
        ctx.lineTo(sx - 1.6, sy + 1.6);
        ctx.lineTo(sx - 4, sy);
        ctx.lineTo(sx - 1.6, sy - 1.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  // 恐惧标记：被战吼震慑的敌人头顶浮出惊恐表情，随恐惧剩余时间淡出
  drawFearIcons(ctx) {
    const v = this.viewRect(220);
    const t = this.time || 0;
    for (const m of (this._drawMonsters || this.monsters)) {
      if (m.dead || !(m.fear > 0)) continue;
      if (m.x < v.l || m.x > v.r || m.y < v.t || m.y > v.b) continue;
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      const barY = m.y + (artMob ? m.r * 0.72 - DG.art.monsters.displayHeight(m) - 10 : -m.r - 12);
      // 轻微抖动：惊恐的样子；最后 0.4 秒淡出
      const a = U.clamp(m.fear / 0.4, 0, 1);
      const cx = m.x + Math.sin(t * 30 + m.x * 0.05) * 1.4;
      const cy = barY - 30 + Math.cos(t * 26 + m.y * 0.05) * 1.2;
      ctx.save();
      ctx.globalAlpha = a;
      // 白色气泡底
      ctx.fillStyle = 'rgba(245,240,232,0.95)';
      ctx.strokeStyle = 'rgba(30,20,16,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // 惊恐大眼（黑眼珠上移）
      ctx.fillStyle = '#1b120d';
      ctx.beginPath();
      ctx.ellipse(cx - 3.6, cy - 1.6, 2.2, 2.9, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 3.6, cy - 1.6, 2.2, 2.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // 张大的嘴
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4.4, 2.1, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  drawPlayer(ctx) {
    const p = this.player;
    if (p.hp <= 0) return;
    // 角色美术由 art/heroes 注册表提供，新增角色无需改动战斗代码
    const hero = this.cls ? DG.art.heroFor(this.cls.id) : null;
    const useHero = !!(hero && hero.battle);
    ctx.save();
    ctx.translate(p.x, p.y);

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.9, useHero ? p.r * 1.15 : p.r * 0.9, p.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    if (p.invuln > 0) {
      ctx.strokeStyle = 'rgba(160, 210, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (useHero) {
      hero.battle(ctx, p, this);
      if (hero.battleAura) hero.battleAura(ctx, p, this);
      this.drawPlayerStatus(ctx, -112);
      ctx.restore();
      return;
    }

    // 身体
    const color = this.cls.color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 朝向
    const ang = p.facing;
    ctx.fillStyle = '#f0e6d4';
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * (p.r + 12), Math.sin(ang) * (p.r + 12));
    ctx.lineTo(Math.cos(ang + 2.5) * (p.r + 2), Math.sin(ang + 2.5) * (p.r + 2));
    ctx.lineTo(Math.cos(ang - 2.5) * (p.r + 2), Math.sin(ang - 2.5) * (p.r + 2));
    ctx.closePath();
    ctx.fill();

    this.drawPlayerStatus(ctx, -p.r - 30);
    ctx.restore();
  },

  // 角色头顶的状态条：上为生命，下为精力（释放大技能消耗）
  drawPlayerStatus(ctx, top) {
    const p = this.player;
    const w = 68, hpH = 10, enH = 6, gap = 4;
    const hpY = top - hpH - gap - enH;

    const paint = (y, h, pct, color) => {
      ctx.fillStyle = 'rgba(18,14,14,0.92)';
      ctx.fillRect(-w / 2, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(-w / 2, y, w * U.clamp(pct, 0, 1), h);
      // 灰色描边 + 外圈 2px 黑描
      ctx.strokeStyle = 'rgba(168,168,168,0.95)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-w / 2 + 0.8, y + 0.8, w - 1.6, h - 1.6);
      ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2 - 1, y - 1, w + 2, h + 2);
    };

    paint(hpY, hpH, p.hp / p.maxHp, '#4e9e57');
    paint(hpY + hpH + gap, enH, p.stam / p.maxStam, this.energy.color);
  },
  drawProjectiles(ctx) {
    const v = this.viewRect(90);
    for (const p of this.projectiles) {
      if (p.x < v.l || p.x > v.r || p.y < v.t || p.y > v.b) continue;
      // 游侠的箭矢用素材贴图绘制，不再画成光球
      if (p.team === 'player' && p.skill && p.skill.classId === 'ranger' &&
        DG.art.ranger && DG.art.ranger.arrowReady()) {
        this.drawArrowProjectile(ctx, p);
        continue;
      }
      ctx.save();
      const gr = p.r + 10;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.glowSprite(p.color || '#ffffff'), p.x - gr, p.y - gr, gr * 2, gr * 2);
      ctx.restore();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // 游侠箭矢：木箭贴图按速度方向旋转，箭尾拖出渐隐光带与速度线
  drawArrowProjectile(ctx, p) {
    const sp = DG.art.ranger.arrowSprite;
    const cfg = RANGER_ARROW[p.skill.id] || RANGER_ARROW.arrow;
    const ang = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);

    // 拖尾光带：从箭尾向前收窄，尾部完全透明
    if (cfg.trail > 0) {
      const g = ctx.createLinearGradient(-cfg.trail, 0, 0, 0);
      g.addColorStop(0, withAlpha(cfg.color, 0));
      g.addColorStop(0.7, withAlpha(cfg.color, 0.16));
      g.addColorStop(1, withAlpha(cfg.color, 0.62));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail, 0);
      ctx.lineTo(0, -cfg.width * 1.7);
      ctx.lineTo(0, cfg.width * 1.7);
      ctx.closePath();
      ctx.fill();

      // 两道细速度线，强化飞行方向感
      ctx.strokeStyle = withAlpha(cfg.color, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail * 0.82, -cfg.width * 0.9);
      ctx.lineTo(-6, -cfg.width * 0.35);
      ctx.moveTo(-cfg.trail * 0.6, cfg.width * 0.95);
      ctx.lineTo(-4, cfg.width * 0.4);
      ctx.stroke();
    }

    if (p.variant === 'fan' || p.variant === 'rain') {
      ctx.strokeStyle = withAlpha(cfg.color, p.variant === 'rain' ? 0.48 : 0.36);
      ctx.lineWidth = p.variant === 'rain' ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail * 0.95, -cfg.width * 2.2);
      ctx.quadraticCurveTo(-cfg.trail * 0.48, -cfg.width * 1.3, -8, -cfg.width * 0.6);
      if (p.variant === 'rain') {
        ctx.moveTo(-cfg.trail * 0.72, cfg.width * 2.1);
        ctx.quadraticCurveTo(-cfg.trail * 0.35, cfg.width * 1.2, -6, cfg.width * 0.55);
      }
      ctx.stroke();
    } else if (p.variant === 'shadow') {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(194,237,224,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail * 1.2, 0);
      ctx.lineTo(-4, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 箭身：按素材倾角校正，箭尖对准飞行方向
    const s = cfg.scale;
    const w = sp.img.width * s, h = sp.img.height * s;
    ctx.rotate(sp.tilt);
    ctx.drawImage(sp.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  },
  // 游走旋风：写实龙卷风——底部收束、往上迅速张成宽阔的漏斗口，
  // 柱身随时间蜿蜒鼓胀，数股风带互相穿插盘旋，底部掀尘、顶部散入云底
  drawTornado(ctx, t) {
    const H = 172;        // 尘柱高度
    const RTOP = 54;      // 顶部半宽：从云底张开的漏斗口
    const RBOT = 4;       // 底部收束点
    // 出现 0.25 秒淡入、消失前 0.5 秒淡出
    const fade = Math.min(1, t.t / 0.25, (t.life - t.t) / 0.5);
    if (fade <= 0) return;
    // 缓慢变形：整根柱身蜿蜒、鼓胀，不是标准锥形
    const morph = t.t * 0.9;
      // 轮廓：底部一团被吸起的尘、中段收腰、往上快速张开、顶部外翻成漏斗口
      const widthAt = (u) => {
        let w = RBOT + (RTOP - RBOT) * Math.pow(u, 1.42);
        w *= 1 + 0.16 * Math.sin(u * 4.1 - 1.0 + t.phase * 0.6 + morph * 0.5);
        if (u > 0.62) w *= 1 + Math.pow((u - 0.62) / 0.38, 1.4) * 0.42;
        w += 6 * Math.max(0, 0.16 - u) / 0.16;
        return w;
      };
      const lean = Math.sin(t.t * 1.9 + t.phase) * 7 + Math.sin(t.t * 0.7 + t.phase * 2) * 2.5;
      // 柱身像蛇一样扭动，越往上摆幅越大
      const bend = (u) => lean * Math.pow(u, 1.3) +
        Math.sin(u * 3.4 + t.phase * 1.3 + t.t * 1.1) * (2 + u * 14);
      // 每只体型略有差异，避免三只完全一样
      const S = 0.92 + (Math.sin(t.phase * 2.7) * 0.5 + 0.5) * 0.2;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(S, S);

      // 地面尘裙：几层压扁的尘雾向外扩散，边缘用渐变化开
      for (let s = 2; s >= 0; s--) {
        const rr = 26 + s * 12;
        ctx.save();
        ctx.globalAlpha = fade * (0.15 + s * 0.03);
        ctx.translate(Math.sin(t.spin * 0.7 + s * 1.7) * 5, 2 + s * 0.5);
        ctx.scale(1, 0.32);
        const dg = ctx.createRadialGradient(0, 0, rr * 0.1, 0, 0, rr);
        dg.addColorStop(0, 'rgba(188,180,165,0.5)');
        dg.addColorStop(0.6, 'rgba(198,191,178,0.2)');
        dg.addColorStop(1, 'rgba(202,196,184,0)');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 尘柱本体：沿中轴堆一串软边尘团，不用矢量路径填充，
      // 左右边缘天生就是渐隐的尘雾，不可能出现硬切边
      const pufW = this.glowSprite('#e2dbcb');
      const pufC = this.glowSprite('#dde4e6');
      const SL = 20;
      const vh = H / SL * 1.7;
      for (let i = 0; i <= SL; i++) {
        const u = i / SL;
        const w = widthAt(u);
        const sp = u > 0.6 ? pufC : pufW;
        // 外圈：柱身本体
        ctx.globalAlpha = fade * (0.56 - 0.06 * u);
        ctx.drawImage(sp, bend(u) - w * 1.06, -H * u - vh, w * 2.12, vh * 2);
        // 内圈：偏左一点的浓尘芯，做出左亮右暗的体积
        ctx.globalAlpha = fade * (0.34 - 0.04 * u);
        ctx.drawImage(sp, bend(u) - w * 0.55, -H * u - vh * 0.9,
          w * 1.0, vh * 1.8);
      }
      // 几团鼓出的尘团：让柱身有粗细起伏，不是光滑的锥面
      for (let d = 0; d < 6; d++) {
        const u = 0.12 + d * 0.13 + Math.sin(t.spin * 0.6 + d * 1.9) * 0.03;
        const w = widthAt(u);
        const side = d % 2 ? 1 : -1;
        const sz = w * (0.55 + 0.2 * Math.sin(d * 2.3 + t.phase));
        ctx.globalAlpha = fade * 0.08;
        ctx.drawImage(d > 2 ? pufC : pufW,
          bend(u) + side * w * 0.42 - sz / 2, -H * u - sz * 0.55, sz, sz * 1.1);
      }
      // 右侧背光：淡淡压一层暗尘，让圆柱有受光/背光的体积
      const pufD = this.glowSprite('#6d777c');
      for (let i = 1; i <= SL; i += 2) {
        const u = i / SL;
        const w = widthAt(u);
        ctx.globalAlpha = fade * 0.05;
        ctx.drawImage(pufD, bend(u) + w * 0.22, -H * u - vh * 0.8, w * 1.05, vh * 1.6);
      }
      ctx.globalAlpha = fade;

      // 内部暗卷：两股偏暗的气流先压一层，把柱身分出前后层次
      ctx.lineCap = 'round';
      for (let d = 0; d < 2; d++) {
        const segs = 90;
        const turn = 2.2 + d * 0.7;
        const sp = t.spin * 0.82 + t.phase * 1.7 + d * 3.2;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const u = i / segs;
          const th = u * turn * Math.PI * 2 + sp + Math.sin(u * 2.8 + d) * 1.1;
          const rx = widthAt(u) * (0.5 + 0.14 * Math.sin(u * 5 + d * 2));
          const ry = 4 + 9 * u;
          const x = Math.cos(th) * rx + bend(u);
          const y = -H * u + Math.sin(u * 17 + d * 2) * 2 - Math.sin(th) * ry;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.globalAlpha = fade * 0.2;
        ctx.strokeStyle = 'rgba(96,104,108,0.8)';
        ctx.lineWidth = 10 - d * 3;
        ctx.stroke();
      }

      // 内部湍流：五股灰白风带，圈数、粗细、明暗各不相同；
      // 每股在柱身上“进出”的节奏也不同，互相穿插才像被卷起的乱流
      const wg = ctx.createLinearGradient(0, 0, 0, -H);
      wg.addColorStop(0, 'rgba(242,246,247,0.5)');
      wg.addColorStop(0.14, 'rgba(244,248,249,0.62)');
      wg.addColorStop(0.45, 'rgba(238,242,243,0.52)');
      wg.addColorStop(0.68, 'rgba(236,241,242,0.4)');
      wg.addColorStop(0.86, 'rgba(235,240,241,0.16)');
      wg.addColorStop(1, 'rgba(235,240,241,0)');
      const strands = [
        { turn: 2.2, w: 9.0, a: 0.34, off: 0.0 },
        { turn: 2.9, w: 6.0, a: 0.28, off: 2.1 },
        { turn: 3.6, w: 4.0, a: 0.24, off: 4.2 },
        { turn: 1.8, w: 11.0, a: 0.18, off: 1.2 }
      ];
      for (let s = 0; s < strands.length; s++) {
        const st = strands[s];
        const segs = 110;
        const sp = t.spin * (0.9 + s * 0.09) + t.phase + st.off;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const u = i / segs;
          // 螺距沿途伸缩：风带时而挤成一团、时而拉开，不再均匀如弹簧
          const th = u * st.turn * Math.PI * 2 + sp +
            Math.sin(u * 3.4 + t.phase + st.off) * 1.3;
          const rm = 0.54 + 0.2 * Math.sin(u * 6.4 + t.phase + st.off + morph * 0.3) +
            0.07 * Math.sin(u * 12.5 - morph * 1.8 + st.off * 0.7);
          const rx = widthAt(u) * rm;
          const ry = 5 + 11 * u;
          const x = Math.cos(th) * rx - Math.sin(th) * ry * 0.2 + bend(u) +
            Math.sin(u * 9 + t.phase + s) * 0.7;
          const y = -H * u + Math.sin(u * 21 + t.phase * 2 + s) * 1.2 - Math.sin(th) * ry;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        // 宽而淡的一层叠出“气流团”，再补一条细亮芯
        ctx.globalAlpha = fade * st.a * (0.85 + 0.15 * Math.sin(t.t * 2.4 + s));
        ctx.strokeStyle = wg;
        ctx.lineWidth = st.w;
        ctx.stroke();
        ctx.globalAlpha = fade * st.a * 0.35;
        ctx.lineWidth = Math.max(1, st.w * 0.2);
        ctx.stroke();
      }

      // 被撕开的短风絮：零散贴在柱身边缘，打断规整的螺旋线
      ctx.strokeStyle = 'rgba(240,245,246,0.55)';
      for (let wI = 0; wI < 9; wI++) {
        const u = 0.1 + ((wI * 0.107 + t.phase * 0.137) % 0.6);
        const w = widthAt(u);
        const dir = wI % 2 ? 1 : -1;
        const x0 = dir * w * 0.72 + bend(u);
        const y0 = -H * u + Math.sin(wI * 3.1 + t.spin) * 3;
        const len = 9 + (wI % 4) * 7;
        ctx.globalAlpha = fade * (0.14 + 0.2 * Math.abs(Math.sin(wI * 1.7 + t.spin)));
        ctx.lineWidth = 1.4 + (wI % 3) * 0.7;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + dir * len * 0.45, y0 - len * 0.55,
          x0 + dir * len, y0 - len * 1.1);
        ctx.stroke();
      }

      // 顶部散开的尘帽：补几团更淡的尘，让漏斗口自然散进云底
      for (let k = 1; k <= 5; k++) {
        const f = k / 6;
        const sz = 22 + (k % 3) * 8;
        ctx.globalAlpha = fade * 0.08;
        ctx.drawImage(pufC,
          bend(1) + (f - 0.5) * widthAt(1) * 1.3 - sz / 2 + Math.sin(k * 2.1 + t.phase) * 6,
          -H * 0.97 - sz * 0.3 + Math.cos(k * 1.7 + t.phase) * 5, sz, sz);
      }
      // 柱脚扬起的尘团：柔化底部的细亮杆
      for (let b = 0; b < 4; b++) {
        const sz = 26 + b * 10;
        ctx.globalAlpha = fade * (0.14 - b * 0.02);
        ctx.drawImage(pufW, Math.sin(t.spin * 0.5 + b) * 3 - sz / 2, -8 - sz / 2, sz, sz);
      }
      ctx.globalAlpha = fade * 0.2;
      ctx.fillStyle = '#d6d1c5';
      ctx.beginPath();
      ctx.ellipse(Math.sin(t.spin + t.phase) * 2, -5, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // 底部贴地碎屑 + 沿柱身被卷起的浮尘
      for (let p = 0; p < 16; p++) {
        const ph = t.spin * 2.1 + p * 0.63 + t.phase;
        let px, py, sz;
        if (p < 8) {
          const rr = 17 + (p % 4) * 9;
          px = Math.cos(ph) * rr;
          py = Math.sin(ph) * rr * 0.3 - 1;
          sz = 1.7;
        } else {
          const kk = 0.1 + (p - 8) * 0.11;
          px = Math.cos(ph * 1.3) * widthAt(kk) * 0.95 + bend(kk) + Math.sin(ph * 2.1) * 4;
          py = -H * kk + Math.sin(ph * 1.7) * 4;
          sz = 1.1 + (p % 3) * 0.3;
        }
        ctx.globalAlpha = fade * (0.22 + 0.3 * Math.abs(Math.sin(ph)));
        ctx.fillStyle = p < 8 ? '#d9d2c4' : '#e4e1d8';
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      // 底部微亮的汇聚点：暗示风柱吸起尘土的源头
      ctx.globalCompositeOperation = 'lighter';
      const core = ctx.createRadialGradient(0, -6, 0, 0, -6, 14);
      core.addColorStop(0, 'rgba(245,248,247,0.1)');
      core.addColorStop(1, 'rgba(220,230,232,0)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, -6, 14, 0, Math.PI * 2);
      ctx.fill();

      // 外侧薄雾：把轮廓和背景揉在一起
      const veil = ctx.createRadialGradient(0, -H * 0.45, 6, 0, -H * 0.45, H * 0.85);
      veil.addColorStop(0, 'rgba(206,214,217,0.09)');
      veil.addColorStop(0.6, 'rgba(198,208,212,0.045)');
      veil.addColorStop(1, 'rgba(190,200,205,0)');
      ctx.fillStyle = veil;
      ctx.fillRect(-H * 1.1, -H * 1.35, H * 2.2, H * 1.55);

      ctx.restore();
  },

  drawEffects(ctx, groundOnly) {
    for (const e of this.effects) {
      const ground = e.kind === 'teleArc' || e.kind === 'teleBeam' || e.kind === 'teleCircle' || e.kind === 'rollMark' || e.kind === 'arrowRainMarker';
      if (ground !== !!groundOnly) continue;
      const t = 1 - e.life / e.max;
      if (e.kind === 'roarCore') {
        // 战吼核心闪光：胸口一团金白亮光快速膨胀后消失
        const k = 1 - e.life / e.max;
        const r = U.lerp(e.r0, e.r1, Math.sqrt(k));
        const a = (1 - k) * (1 - k) * 0.9;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        g.addColorStop(0, withAlpha(e.color, a));
        g.addColorStop(0.45, withAlpha(e.color, a * 0.5));
        g.addColorStop(1, withAlpha(e.color, 0));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'roarWave') {
        // 战吼光浪：一圈带厚度的黄色亮环向外推开，中心留空，靠加色混合发亮
        const k = 1 - e.life / e.max;
        const r = U.lerp(e.r0, e.r1, 1 - Math.pow(1 - k, 2));
        const band = Math.max(10, e.r1 * 0.20 * (1 - k * 0.45));
        const a = (1 - k) * 0.5;
        const g = ctx.createRadialGradient(e.x, e.y, Math.max(0, r - band), e.x, e.y, r + band);
        g.addColorStop(0, withAlpha(e.color, 0));
        g.addColorStop(0.55, withAlpha(e.color, a));
        g.addColorStop(1, withAlpha(e.color, 0));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + band, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'ring') {
        const r = U.lerp(e.r0, e.r1, t);
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'rollMark') {
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.34;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-e.len / 2, -5);
        ctx.quadraticCurveTo(0, 5, e.len / 2, -3);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'arrowRainMarker') {
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.5;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * (1.1 - k * 0.25), -e.arc / 2, e.arc / 2);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'slash') {
        // 刀光：外层血雾带 + 血色主刃 + 白色刃芯，随进度外扩并整体淡出
        const fade = 1 - t;
        const rr = e.radius * (0.62 + t * 0.46);
        const a0 = -e.arc / 2, a1 = e.arc / 2;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.lineCap = 'round';
        // 加色混合让血刃在暗色地面和怪物身上都亮起来
        ctx.globalCompositeOperation = 'lighter';
        // 外层血雾
        ctx.globalAlpha = fade * 0.3;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(0, 0, rr * 1.04, a0, a1);
        ctx.stroke();
        // 血色主刃
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = '#f0301f';
        ctx.lineWidth = 6.5;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a0, a1);
        ctx.stroke();
        // 白色刃芯：贴主刃内侧，制造金属反光
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = 'rgba(255,244,236,0.95)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, rr * 0.96, a0, a1);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'spark') {
        ctx.globalAlpha = Math.max(0, e.life / e.max);
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * (e.life / e.max + 0.3), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'blood') {
        // 血珠：沿速度方向拉长，快消失时整体变淡
        const k = U.clamp(e.life / e.max, 0, 1);
        const sp = Math.hypot(e.vx, e.vy);
        const st = 1 + Math.min(2.4, sp / 160);
        ctx.globalAlpha = Math.min(0.85, k * 2.4);
        ctx.fillStyle = e.color;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(Math.atan2(e.vy, e.vx));
        ctx.beginPath();
        ctx.ellipse(0, 0, e.r * st, e.r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'shard') {
        // 碎片：翻滚下落，最后 40% 生命逐渐淡出
        const k = U.clamp(e.life / e.max, 0, 1);
        const AD = DG.art && DG.art.terrainDecor;
        if (AD && AD.drawShard) {
          AD.drawShard(ctx, e.img, e.sx, e.sy, e.sw, e.sh,
            e.x, e.y, e.rot, e.scale, Math.min(1, k * 2.6));
        }
      } else if (e.kind === 'streak') {
        // 游侠翻滚的速度线：沿移动方向拖出细长光痕
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.75;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = e.w || 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-e.len * (0.4 + k * 0.6), 0);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'beam') {
        // 穿云箭贯穿光带：起点最亮，向前迅速消散
        const k = U.clamp(e.life / e.max, 0, 1);
        const len = e.len != null ? e.len : (e.length != null ? e.length : 72);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k;
        const half = (e.width || 6) / 2;
        const lg = ctx.createLinearGradient(0, 0, len, 0);
        lg.addColorStop(0, withAlpha(e.color, 0.9));
        lg.addColorStop(0.35, withAlpha(e.color, 0.45));
        lg.addColorStop(1, withAlpha(e.color, 0));
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(0, -half);
        ctx.lineTo(len, -half * 0.25);
        ctx.lineTo(len, half * 0.25);
        ctx.lineTo(0, half);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'snipeCharge') {
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.85;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8 + (1 - k) * 22, -0.65, 0.65);
        ctx.moveTo(-20 * k, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'arrowImpact' || e.kind === 'snipeImpact') {
        const k = U.clamp(e.life / e.max, 0, 1);
        const len = e.kind === 'snipeImpact' ? 54 : 30;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = e.kind === 'snipeImpact' ? 4.5 : 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-len * 0.35, 0);
        ctx.lineTo(len, 0);
        ctx.moveTo(len * 0.22, -len * 0.42);
        ctx.lineTo(len * 0.22, len * 0.42);
        if (e.kind === 'snipeImpact') {
          ctx.moveTo(-len * 0.05, -len * 0.45);
          ctx.lineTo(len * 0.54, len * 0.45);
        }
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'chargeGhost') {
        // 冲锋残影：暖色剪影用加色混合发光，按剩余生命快速淡出
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.pow(k, 1.5) * (e.alpha || 0.45);
        ctx.drawImage(e.img, e.x - e.img.width / 2, e.y - (e.img.height - 30));
        ctx.restore();
      } else if (e.kind === 'afterimage') {
        // 影步残影：翻滚路径上残留的半透明游侠残像
        const a = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.globalAlpha = a * 0.32;
        DG.art.ranger.draw(ctx, e.x, e.y, {
          scale: 0.7273, flip: !!e.flip, state: 'walk',
          t: this.time, walkPhase: e.phase || 0
        });
        ctx.restore();
      } else if (DG.art.monsters && DG.art.monsters.drawEffect(ctx, e)) {
        // 分件小怪的咬击 / 孢子特效
      } else if (DG.art.bosses) {
        DG.art.bosses.drawEffect(ctx, e);
      }
      // 专属皮肤层：按小怪主题叠加碎屑/元素，增强每个怪物的辨识度
      if (e.skin && DG.art.monsters && DG.art.monsters.drawFxSkin) {
        DG.art.monsters.drawFxSkin(ctx, e);
      }
    }
  },
  drawFloaters(ctx) {
    for (const f of this.floaters) {
      const a = U.clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      // 数字出场时轻微放大再回落，让伤害数字更醒目
      const pop = f.life > f.max - 0.12 ? 1 + (f.life - (f.max - 0.12)) / 0.12 * 0.22 : 1;
      ctx.font = `bold ${Math.round(f.size * pop)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      // 描边随字号加粗，大号数字才不会糊成一团
      ctx.strokeStyle = 'rgba(0,0,0,0.78)';
      ctx.lineWidth = Math.max(4, f.size * 0.22);
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
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
