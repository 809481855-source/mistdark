/* 副本战斗 · 渲染地形：地块烘焙、分块缓存、地面与贴地立件绘制
 * 方法仍挂在 DG.scenes.dungeon.prototype（原型方法名与签名不变）。
 */
(function () {
  const DG = window.DG;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeonRender;
  Object.assign(DG.scenes.dungeon.prototype, {
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
  });
})();
