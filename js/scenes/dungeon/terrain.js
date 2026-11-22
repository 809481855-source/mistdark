/* 副本战斗 · 地形层：房间走廊随机地图、墙体碰撞、寻路流场与探索迷雾 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  const TILE = 40;
  const COLS = Math.floor(ARENA_W / TILE);
  const ROWS = Math.floor(ARENA_H / TILE);
  const FLOOR = 1;
  const INF = 999999;
  // 绕墙试探角度：常量提到模块级，避免每帧每只怪都新建一次数组（GC 抖动）
  const STEER_OFFSETS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, 2.25, -2.25];

  // 三套地貌风格：只改配色，结构与规则完全一致
  const STYLES = {
    grove: {
      void: '#050a08',
      floor: ['#16221b', '#17241d', '#152019'],
      wall: ['#0c1410', '#0e1713'],
      edge: 'rgba(134,168,140,0.13)',
      accent: 'rgba(201,162,95,0.10)',
      fog: 'rgba(3,7,5,0.94)',
      fogEdge: 'rgba(3,7,5,0.6)'
    },
    crypt: {
      void: '#060809',
      floor: ['#171c22', '#181e25', '#151a20'],
      wall: ['#0b0f13', '#0d1216'],
      edge: 'rgba(128,150,178,0.14)',
      accent: 'rgba(150,170,210,0.09)',
      fog: 'rgba(3,5,7,0.94)',
      fogEdge: 'rgba(3,5,7,0.6)'
    },
    abyss: {
      void: '#0a0605',
      floor: ['#1e1715', '#211917', '#1a1312'],
      wall: ['#120d0c', '#150f0e'],
      edge: 'rgba(180,124,102,0.14)',
      accent: 'rgba(201,120,95,0.10)',
      fog: 'rgba(6,3,3,0.94)',
      fogEdge: 'rgba(6,3,3,0.6)'
    },
    // 炼狱：紫焰与紫风
    inferno: {
      void: '#0a0511',
      floor: ['#1d1426', '#20172b', '#191120'],
      wall: ['#120b19', '#150d1d'],
      edge: 'rgba(192,142,236,0.16)',
      accent: 'rgba(214,124,255,0.10)',
      fog: 'rgba(9,4,15,0.94)',
      fogEdge: 'rgba(9,4,15,0.6)'
    },
    // 大雪天：蓝白雪原
    snowfield: {
      void: '#060b12',
      floor: ['#1a2532', '#1d2937', '#18222e'],
      wall: ['#0d151e', '#101923'],
      edge: 'rgba(176,210,244,0.18)',
      accent: 'rgba(226,240,255,0.12)',
      fog: 'rgba(7,12,20,0.90)',
      fogEdge: 'rgba(7,12,20,0.58)'
    },
    // 地狱：赤红与血雨
    hell: {
      void: '#0d0403',
      floor: ['#251210', '#291613', '#20100e'],
      wall: ['#150908', '#190b0a'],
      edge: 'rgba(236,112,92,0.18)',
      accent: 'rgba(255,92,62,0.12)',
      fog: 'rgba(12,3,2,0.94)',
      fogEdge: 'rgba(12,3,2,0.6)'
    },
    // 大草原：青绿与飞草
    savanna: {
      void: '#04100b',
      floor: ['#12281e', '#152c21', '#10241b'],
      wall: ['#091710', '#0b1c14'],
      edge: 'rgba(126,228,190,0.16)',
      accent: 'rgba(224,204,124,0.10)',
      fog: 'rgba(4,14,10,0.90)',
      fogEdge: 'rgba(4,14,10,0.58)'
    },
    // 深秋：橘色枫林
    autumn: {
      void: '#0d0804',
      floor: ['#271e14', '#2b2117', '#231a11'],
      wall: ['#160f09', '#19120b'],
      edge: 'rgba(238,178,112,0.16)',
      accent: 'rgba(255,152,72,0.11)',
      fog: 'rgba(12,7,3,0.93)',
      fogEdge: 'rgba(12,7,3,0.58)'
    }
  };

  // 卡通地面配色：纯色底 + 大色块 + 草叶记号
  STYLES.grove.ground = '#3d3b23';
  STYLES.grove.groundHi = 'rgba(88,84,48,0.38)';
  STYLES.grove.groundLo = 'rgba(42,41,24,0.42)';
  STYLES.grove.mark = 'rgba(47,68,42,0.5)';
  STYLES.crypt.ground = '#2b3039';
  STYLES.crypt.groundHi = 'rgba(60,68,80,0.38)';
  STYLES.crypt.groundLo = 'rgba(28,32,38,0.42)';
  STYLES.crypt.mark = 'rgba(58,76,86,0.45)';
  STYLES.abyss.ground = '#3a2a22';
  STYLES.abyss.groundHi = 'rgba(86,60,46,0.38)';
  STYLES.abyss.groundLo = 'rgba(38,26,20,0.42)';
  STYLES.abyss.mark = 'rgba(96,60,42,0.45)';
  STYLES.inferno.ground = '#382645';
  STYLES.inferno.groundHi = 'rgba(122,78,152,0.38)';
  STYLES.inferno.groundLo = 'rgba(42,28,54,0.42)';
  STYLES.inferno.mark = 'rgba(158,96,202,0.46)';
  STYLES.snowfield.ground = '#46576a';
  STYLES.snowfield.groundHi = 'rgba(154,180,206,0.40)';
  STYLES.snowfield.groundLo = 'rgba(52,66,82,0.42)';
  STYLES.snowfield.mark = 'rgba(198,222,244,0.42)';
  STYLES.hell.ground = '#4a2320';
  STYLES.hell.groundHi = 'rgba(146,72,58,0.40)';
  STYLES.hell.groundLo = 'rgba(52,24,20,0.42)';
  STYLES.hell.mark = 'rgba(198,74,54,0.48)';
  STYLES.savanna.ground = '#2f4a30';
  STYLES.savanna.groundHi = 'rgba(98,134,72,0.38)';
  STYLES.savanna.groundLo = 'rgba(34,56,36,0.42)';
  STYLES.savanna.mark = 'rgba(86,178,132,0.48)';
  STYLES.autumn.ground = '#4a3520';
  STYLES.autumn.groundHi = 'rgba(146,104,58,0.40)';
  STYLES.autumn.groundLo = 'rgba(52,36,22,0.42)';
  STYLES.autumn.mark = 'rgba(208,132,62,0.46)';

  function hash2(x, y) {
    // 全程 32 位整数混合：普通乘法会超出双精度导致低位失效、分布偏斜
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  // 平滑值噪声：让轮廓起伏呈现大波浪而非逐格锯齿
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  // Chaikin 切角：把折线反复切角，得到平滑的随机曲线
  function chaikin(pts, iter) {
    let p = pts;
    for (let k = 0; k < iter; k++) {
      const out = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      p = out;
    }
    return p;
  }

  // Marching Squares：从标量场提取闭合等值线
  function traceContours(val, vw, vh, iso) {
    const segs = [];
    const key = (p) => Math.round(p.x * 1000) + ':' + Math.round(p.y * 1000);
    const cross = (x0, y0, v0, x1, y1, v1) => {
      const t = (iso - v0) / (v1 - v0);
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
    };
    for (let y = 0; y < vh - 1; y++) {
      for (let x = 0; x < vw - 1; x++) {
        const a = val[y * vw + x], b = val[y * vw + x + 1];
        const c = val[(y + 1) * vw + x + 1], d = val[(y + 1) * vw + x];
        const ia = a >= iso, ib = b >= iso, ic = c >= iso, id = d >= iso;
        if (ia === ib && ib === ic && ic === id) continue;
        const e = [null, null, null, null];
        if (ia !== ib) e[0] = cross(x, y, a, x + 1, y, b);
        if (ib !== ic) e[1] = cross(x + 1, y, b, x + 1, y + 1, c);
        if (ic !== id) e[2] = cross(x + 1, y + 1, c, x, y + 1, d);
        if (id !== ia) e[3] = cross(x, y + 1, d, x, y, a);
        const on = [];
        for (let i = 0; i < 4; i++) if (e[i]) on.push(i);
        if (on.length === 2) {
          segs.push([e[on[0]], e[on[1]]]);
        } else if (on.length === 4) {
          // 对角歧义：用中心值决定连接方式，避免轮廓交叉
          const center = (a + b + c + d) / 4 >= iso;
          if (center) {
            segs.push([e[0], e[1]]);
            segs.push([e[2], e[3]]);
          } else {
            segs.push([e[1], e[2]]);
            segs.push([e[3], e[0]]);
          }
        }
      }
    }

    // 把线段串成闭合折线
    const pts = new Map();
    const adj = new Map();
    for (const [p, q] of segs) {
      const kp = key(p), kq = key(q);
      pts.set(kp, p);
      pts.set(kq, q);
      if (!adj.has(kp)) adj.set(kp, []);
      if (!adj.has(kq)) adj.set(kq, []);
      adj.get(kp).push(kq);
      adj.get(kq).push(kp);
    }
    const visited = new Set();
    const loops = [];
    for (const start of pts.keys()) {
      if (visited.has(start)) continue;
      const loop = [];
      let prev = null;
      let cur = start;
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        loop.push(pts.get(cur));
        const nbs = adj.get(cur) || [];
        let next = null;
        for (const nb of nbs) if (nb !== prev) { next = nb; break; }
        prev = cur;
        cur = next;
      }
      if (loop.length >= 4) loops.push(loop);
    }
    return loops;
  }

  function dirName(ang) {
    const names = ['东', '东南', '南', '西南', '西', '西北', '北', '东北'];
    let a = ang % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return names[Math.round(a / (Math.PI / 4)) % 8];
  }

  DG.scenes.dungeon.terrain = { TILE, COLS, ROWS, FLOOR, hash2, STYLES };
  DG.scenes.dungeon.dirName = dirName;
  // 小地图在 720×1440 舞台中的固定区域（渲染与点击拦截共用）
  // 固定方框尺寸，地图内容等比缩进框内，不随关卡地图比例变化
  DG.scenes.dungeon.minimapRect = { x: 33, y: 149, w: 223, h: 193 };

  Object.assign(DG.scenes.dungeon.prototype, {
    /* ---------- 地图生成：网格地块拼贴（整体近方形） ---------- */
    generateMap() {
      const C = DG.data.chunks;
      const style = STYLES[this.def.mapStyle] || STYLES.grove;
      const grid = new Uint8Array(COLS * ROWS);
      // 地块编排：总数 6~15 随机，常见 8~12 块；满 15 块的大图很少出现
      // 关卡数据里的 map.minRooms/maxRooms 决定本关可选的地图规模
      let layouts = [
        { cols: 3, rows: 2, weight: 13 },   // 6 块
        { cols: 4, rows: 2, weight: 16 },   // 8 块
        { cols: 3, rows: 3, weight: 17 },   // 9 块
        { cols: 5, rows: 2, weight: 13 },   // 10 块
        { cols: 4, rows: 3, weight: 17 },   // 12 块
        { cols: 5, rows: 3, weight: 4 }     // 15 块，稀有
      ];
      if (this.def.map) {
        const minRooms = this.def.map.minRooms || 0;
        const maxRooms = this.def.map.maxRooms || 99;
        const fit = layouts.filter(l => {
          const n = l.cols * l.rows;
          return n >= minRooms && n <= maxRooms;
        });
        if (fit.length) layouts = fit;
      }
      const layout = U.weighted(layouts);
      const cols = layout.cols;
      const rows = layout.rows;
      const pool = C.list.filter((c) => c.weight > 0);
      const byId = (id) => C.list.find((c) => c.id === id);
      const chunks = [];
      const rooms = [];

      // 主路网：每一行横向贯通；纵向只在少数几列贯通，形成清晰的大回路
      // 5×3 时取 0/2/4 三列，玩家横竖都能直接切过去，不必绕远
      const vcols = [];
      [0, Math.floor(cols / 2), cols - 1].forEach((c) => {
        if (vcols.indexOf(c) < 0) vcols.push(c);
      });
      const hasV = (c) => vcols.indexOf(c) >= 0;
      const entranceCol = 0, entranceRow = rows === 2 ? 0 : Math.floor(rows / 2);
      const arenaCol = cols - 1, arenaRow = rows - 1;      // 首领场地固定在右下角
      // 固定编排：回型 / 交叉 / 密室各一处，格位随机（避开出生点与首领场），
      // 保证每张地图都有绕行路线，又不会每局位置都一样
      const fixed = {};
      {
        const cells = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (r === entranceRow && c === entranceCol) continue;
            if (r === arenaRow && c === arenaCol) continue;
            cells.push(r * cols + c);
          }
        }
        for (let k = cells.length - 1; k > 0; k--) {
          const j = U.randInt(0, k);
          const t = cells[k]; cells[k] = cells[j]; cells[j] = t;
        }
        ['loop', 'crossroad', 'secret_vault'].forEach((id, k) => {
          if (cells[k] != null) fixed[cells[k]] = id;
        });
      }
      const fixedAt = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows)
        ? null : (fixed[r * cols + c] || null);

      // 逐行铺块：四邻域接口由格位决定，块内结构保持原样
      for (let r = 0; r < rows; r++) {
        let corridorRun = 0;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const ports = {
            l: c > 0, r: c < cols - 1,
            u: r > 0 && hasV(c), d: r < rows - 1 && hasV(c)
          };
          let def;
          if (r === entranceRow && c === entranceCol) def = byId('entrance');
          else if (r === arenaRow && c === arenaCol) def = C.arena;
          else if (fixed[i]) def = byId(fixed[i]);
          else {
            const left = c > 0 ? chunks[i - 1] : null;
            const up = r > 0 ? chunks[i - cols] : null;
            // 与左/上邻块不重样；同时避开四邻格固定编排的块，免得撞名
            const nearFixed = [
              fixedAt(c - 1, r), fixedAt(c + 1, r),
              fixedAt(c, r - 1), fixedAt(c, r + 1)
            ];
            // 同一条横向链上走廊不超过 2 段，避免整行走廊
            const ok = (k) =>
              (!left || left.id !== k.id) && (!up || up.id !== k.id) &&
              nearFixed.indexOf(k.id) < 0 &&
              !(corridorRun >= 2 && k.tags.indexOf('corridor') >= 0);
            let cands = pool.filter(ok);
            if (!cands.length) {
              cands = pool.filter((k) => (!left || left.id !== k.id) &&
                nearFixed.indexOf(k.id) < 0);
            }
            if (!cands.length) cands = pool;
            def = U.weighted(cands);
          }
          const inst = this.placeChunk(def, i, c * C.W, r * C.H, ports);
          chunks.push(inst);
          rooms.push(this.chunkRoom(inst, C));
          corridorRun = def.tags.indexOf('corridor') >= 0 ? corridorRun + 1 : 0;
        }
      }

      // 统一开挖 → 边缘侵蚀 → 补接口与连接段 → 连通性收尾
      for (const inst of chunks) this.carveChunk(grid, inst, C);
      this.roughenEdges(grid);
      // 侵蚀可能啃掉接口，最后再补开一次，保证块与块之间必定连通
      for (const inst of chunks) {
        this.carvePorts(grid, inst, C);
        this.carvePortStubs(grid, inst, C);
      }
      this.pruneIslands(grid, Math.round(rooms[0].cx / TILE), Math.round(rooms[0].cy / TILE));

      this.grid = grid;
      this.rooms = rooms;
      this.chunks = chunks;
      this.cols = cols;
      this.rows = rows;
      this.arenaChunk = arenaRow * cols + arenaCol;
      this.chunkW = C.W * TILE;
      this.chunkH = C.H * TILE;
      // 本关实际地图尺寸（相机/点地/特效边界都按它收口，小图不会留大片黑边）
      this.arenaW = cols * this.chunkW;
      this.arenaH = rows * this.chunkH;
      this.mapStyle = style;
      this.explored = new Uint8Array(COLS * ROWS);
      this.exploredFloor = 0;
      this.floorTotal = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i] === FLOOR) this.floorTotal++;

      // 通道宽敞度：寻路在同距离分岔时优先走通道中线，避免大体型贴墙卡死
      this.clearance = new Uint8Array(COLS * ROWS);
      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          if (!this.isFloorTile(tx, ty)) continue;
          let n = 0, s = 0, w = 0, e = 0;
          while (n < 3 && this.isFloorTile(tx, ty - 1 - n)) n++;
          while (s < 3 && this.isFloorTile(tx, ty + 1 + s)) s++;
          while (w < 3 && this.isFloorTile(tx - 1 - w, ty)) w++;
          while (e < 3 && this.isFloorTile(tx + 1 + e, ty)) e++;
          this.clearance[ty * COLS + tx] = 1 + Math.min(n, s, w, e);
        }
      }

      this.flow = new Int32Array(COLS * ROWS);
      this._flowQueue = new Int32Array(COLS * ROWS);
      this.autoFlow = new Int32Array(COLS * ROWS);
      this._autoFlowQueue = new Int32Array(COLS * ROWS);
      this._autoFlowTarget = -1;
      this.flowTimer = 0;
      this.exploreTimer = 0;

      // 低分辨率迷雾贴图，放大绘制后形成柔和过渡（避免方块状雾边）
      if (!this._fogCanvas) {
        this._fogCanvas = document.createElement('canvas');
        this._fogCtx = this._fogCanvas.getContext('2d');
      }
      this._fogCanvas.width = COLS;
      this._fogCanvas.height = ROWS;

      // 平滑地形轮廓（等值线），绘制时用它替代方块状瓦片边缘
      this._outline = this.buildOutline(grid);
    },

    /* ---------- 地块拼贴辅助 ---------- */
    placeChunk(def, index, tx, ty, ports) {
      const C = DG.data.chunks;
      return {
        index, id: def.id, tags: def.tags, def,
        tx, ty, w: C.W, h: C.H,
        col: Math.round(tx / C.W), row: Math.round(ty / C.H),
        ports: ports || { l: false, r: false, u: false, d: false },
        px: tx * TILE, py: ty * TILE
      };
    },
    // 由块内通路/支路/房间计算可刷怪区域（供既有刷怪、首领选点复用）
    chunkRoom(inst, C) {
      const def = inst.def;
      let minX = 99, minY = 99, maxX = -99, maxY = -99;
      const add = (x, y) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      };
      for (const p of def.path || []) add(p[0], p[1]);
      for (const b of def.branches || []) for (const p of b) add(p[0], p[1]);
      for (const r of def.rooms || []) { add(r.x - r.rx, r.y - r.ry); add(r.x + r.rx, r.y + r.ry); }
      for (const g of def.rings || []) { add(g.x - g.rx, g.y - g.ry); add(g.x + g.rx, g.y + g.ry); }
      if (minX > maxX) { minX = 2; maxX = C.W - 2; minY = 2; maxY = C.H - 2; }
      const x0 = U.clamp(Math.floor(minX) - 2, 1, C.W - 4);
      const y0 = U.clamp(Math.floor(minY) - 2, 1, C.H - 4);
      const x1 = U.clamp(Math.ceil(maxX) + 2, x0 + 3, C.W - 1);
      const y1 = U.clamp(Math.ceil(maxY) + 2, y0 + 3, C.H - 1);
      const x = inst.tx + x0, y = inst.ty + y0;
      const w = x1 - x0, h = y1 - y0;
      // 房间锚点必须落在真实地面上：优先取最大椭圆中心，否则取主通路中点
      let ax = C.W / 2, ay = C.H / 2;
      if (def.anchor) {
        ax = def.anchor[0]; ay = def.anchor[1];
      } else if (def.rooms && def.rooms.length) {
        let big = def.rooms[0];
        for (const r of def.rooms) if (r.rx * r.ry > big.rx * big.ry) big = r;
        ax = big.x; ay = big.y;
      } else if (def.rings && def.rings.length) {
        // 回型块的中心是实心岩体，锚点取环外圈顶部
        const g = def.rings[0];
        ax = g.x; ay = g.y - g.ry + g.t * 0.5;
      } else if (def.path && def.path.length) {
        const mid = def.path[Math.floor(def.path.length / 2)];
        ax = mid[0]; ay = mid[1];
      }
      // 锚点必须落在块内可开挖范围（边界 1 格不开挖，避免贴图的端点落在墙里）
      ax = U.clamp(ax, 2, C.W - 2);
      ay = U.clamp(ay, 2, C.H - 2);
      return {
        x, y, w, h,
        cx: (inst.tx + ax) * TILE,
        cy: (inst.ty + ay) * TILE,
        area: w * h,
        tint: inst.index % 3
      };
    },
    carveChunk(grid, inst, C) {
      const def = inst.def;
      // 主走廊 14.4 格（约 576px）/ 支路 9.6 格宽：一屏内足以并排容纳两只首领
      this.carvePolyline(grid, def.path, inst.tx, inst.ty, 7.2);
      for (const b of def.branches || []) {
        this.carvePolyline(grid, b, inst.tx, inst.ty, def.branchR || C.branchR || 4.8);
      }
      for (const r of def.rooms || []) this.carveEllipse(grid, inst.tx + r.x, inst.ty + r.y, r.rx, r.ry);
      for (const g of def.rings || []) this.carveRing(grid, inst.tx + g.x, inst.ty + g.y, g.rx, g.ry, g.t);
      this.carvePorts(grid, inst, C);
      this.carvePortStubs(grid, inst, C);
    },
    // 回型环道：先挖外椭圆，再把内椭圆填回实心岩体，形成一段可绕行的环
    carveRing(grid, cx, cy, rx, ry, t) {
      this.carveEllipse(grid, cx, cy, rx, ry);
      const irx = Math.max(1, rx - t), iry = Math.max(1, ry - t);
      const x0 = Math.max(0, Math.floor(cx - irx)), x1 = Math.min(COLS - 1, Math.ceil(cx + irx));
      const y0 = Math.max(0, Math.floor(cy - iry)), y1 = Math.min(ROWS - 1, Math.ceil(cy + iry));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const nx = (tx - cx) / irx, ny = (ty - cy) / iry;
          if (nx * nx + ny * ny <= 1) grid[ty * COLS + tx] = 0;
        }
      }
    },
    // 接口开洞：左右各向块内开 3 格（13 格高），上下各向块内开 3 格（13 格宽）
    // 网格拼贴时同排地块 ty 相同、同列 tx 相同，所以接口固定落在每块正中
    carvePorts(grid, inst, C) {
      const p = inst.ports;
      if (!p) return;
      const midY = inst.ty + Math.round(C.H / 2);
      const midX = inst.tx + Math.round(C.W / 2);
      if (p.l) {
        for (let y = midY - 6; y <= midY + 6; y++) {
          for (let x = inst.tx; x < inst.tx + 3; x++) this.carveTile(grid, x, y);
        }
      }
      if (p.r) {
        for (let y = midY - 6; y <= midY + 6; y++) {
          for (let x = inst.tx + C.W - 3; x < inst.tx + C.W; x++) this.carveTile(grid, x, y);
        }
      }
      if (p.u) {
        for (let x = midX - 6; x <= midX + 6; x++) {
          for (let y = inst.ty; y < inst.ty + 3; y++) this.carveTile(grid, x, y);
        }
      }
      if (p.d) {
        for (let x = midX - 6; x <= midX + 6; x++) {
          for (let y = inst.ty + C.H - 3; y < inst.ty + C.H; y++) this.carveTile(grid, x, y);
        }
      }
    },
    // 竖直接口连接段：从上下洞口向块心逐格推进，碰到已有地面立即停止。
    // 回型块中心是实心岩岛，靠这个规则把通道停在环道上，不会打穿岩岛。
    carvePortStubs(grid, inst, C) {
      const p = inst.ports;
      if (!p) return;
      const midX = inst.tx + Math.round(C.W / 2);
      const midY = inst.ty + Math.round(C.H / 2);
      const isFloor = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS &&
        grid[y * COLS + x] === FLOOR;
      const ahead = (y, dir) => {
        const yy = y + dir * 2;
        return isFloor(midX, yy) || isFloor(midX - 2, yy) || isFloor(midX + 2, yy);
      };
      if (p.u) {
        for (let y = inst.ty + 4; y < midY - 2; y++) {
          const hit = ahead(y, 1);
          this.carveDisc(grid, midX, y, 4.2);
          if (hit) break;
        }
      }
      if (p.d) {
        for (let y = inst.ty + C.H - 5; y > midY + 2; y--) {
          const hit = ahead(y, -1);
          this.carveDisc(grid, midX, y, 4.2);
          if (hit) break;
        }
      }
    },
    carvePolyline(grid, pts, ox, oy, r) {
      if (!pts || pts.length < 2) return;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.ceil(len * 2));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          this.carveDisc(grid, ox + a[0] + dx * t, oy + a[1] + dy * t, r);
        }
      }
    },
    carveDisc(grid, cx, cy, r) {
      const R = Math.ceil(r);
      const px = Math.round(cx), py = Math.round(cy);
      for (let oy = -R; oy <= R; oy++) {
        for (let ox = -R; ox <= R; ox++) {
          if (ox * ox + oy * oy > r * r + 0.01) continue;
          this.carveTile(grid, px + ox, py + oy);
        }
      }
    },
    carveEllipse(grid, cx, cy, rx, ry) {
      const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
      const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const nx = (tx - cx) / rx, ny = (ty - cy) / ry;
          const d = nx * nx + ny * ny;
          // 边缘哈希抖动，避免标准椭圆过于规整
          if (d <= 1 + (hash2(tx * 17 + 3, ty * 29 + 7) - 0.5) * 0.22) this.carveTile(grid, tx, ty);
        }
      }
    },
    /* ---------- 地形开挖：不规则洞窟与蜿蜒走廊 ---------- */
    carveRoom(grid, r) {
      // 基础矩形
      for (let ty = r.y; ty < r.y + r.h; ty++) {
        for (let tx = r.x; tx < r.x + r.w; tx++) this.carveTile(grid, tx, ty);
      }
      // 四条边随机向外鼓包，轮廓不再是标准矩形
      const seed = (r.x * 73 + r.y * 151 + r.w * 19) | 0;
      for (let tx = r.x; tx < r.x + r.w; tx++) {
        const dTop = (hash2(tx + seed, r.y) * 3) | 0;
        const dBot = (hash2(tx - seed, r.y + r.h) * 3) | 0;
        for (let k = 1; k <= dTop; k++) this.carveTile(grid, tx, r.y - k);
        for (let k = 1; k <= dBot; k++) this.carveTile(grid, tx, r.y + r.h - 1 + k);
      }
      for (let ty = r.y; ty < r.y + r.h; ty++) {
        const dLeft = (hash2(r.x, ty + seed) * 3) | 0;
        const dRight = (hash2(r.x + r.w, ty - seed) * 3) | 0;
        for (let k = 1; k <= dLeft; k++) this.carveTile(grid, r.x - k, ty);
        for (let k = 1; k <= dRight; k++) this.carveTile(grid, r.x + r.w - 1 + k, ty);
      }
    },
    carveCorridor(grid, a, b) {
      const ax = Math.round(a.cx / TILE);
      const ay = Math.round(a.cy / TILE);
      const bx = Math.round(b.cx / TILE);
      const by = Math.round(b.cy / TILE);
      // 转折顺序与摆动相位每张图都不同，让通道自然蜿蜒
      const amp = U.rand(0.8, 1.9);
      const phase = U.rand(0, Math.PI * 2);
      if (U.random() < 0.5) {
        this.carveLine(grid, ax, ay, bx, ay, amp, phase);
        this.carveLine(grid, bx, ay, bx, by, amp * 0.7, phase + 1.7);
      } else {
        this.carveLine(grid, ax, ay, ax, by, amp, phase);
        this.carveLine(grid, ax, by, bx, by, amp * 0.7, phase + 1.7);
      }
    },
    // 逐格推进并向侧面摆动，三格宽，拐弯处自然圆润
    carveLine(grid, x0, y0, x1, y1, amp, phase) {
      const dx = Math.sign(x1 - x0);
      const dy = Math.sign(y1 - y0);
      const len = Math.abs(x1 - x0) + Math.abs(y1 - y0);
      let x = x0, y = y0;
      for (let i = 0; i <= len; i++) {
        const t = len ? i / len : 0;
        const lateral = Math.round(Math.sin(t * Math.PI * 2.2 + phase) * amp);
        const ox = dy !== 0 ? lateral : 0;
        const oy = dx !== 0 ? lateral : 0;
        this.carveBlob(grid, x + ox, y + oy);
        if (dx !== 0) x += dx; else if (dy !== 0) y += dy;
      }
    },
    carveBlob(grid, cx, cy) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) this.carveTile(grid, cx + ox, cy + oy);
      }
    },
    // 连通性收尾：从出生房间泛洪，剔除脱节的小块地面
    pruneIslands(grid, sx, sy) {
      const start = sy * COLS + sx;
      const open = (i) => grid[i] === FLOOR;
      const seen = new Uint8Array(COLS * ROWS);
      let seed = start;
      if (!open(seed)) {
        seed = -1;
        for (let i = 0; i < grid.length; i++) if (open(i)) { seed = i; break; }
        if (seed < 0) return;
      }
      const q = [seed];
      seen[seed] = 1;
      for (let head = 0; head < q.length; head++) {
        const cur = q[head];
        const cx = cur % COLS;
        const cy = (cur / COLS) | 0;
        if (cx > 0) { const n = cur - 1; if (!seen[n] && open(n)) { seen[n] = 1; q.push(n); } }
        if (cx < COLS - 1) { const n = cur + 1; if (!seen[n] && open(n)) { seen[n] = 1; q.push(n); } }
        if (cy > 0) { const n = cur - COLS; if (!seen[n] && open(n)) { seen[n] = 1; q.push(n); } }
        if (cy < ROWS - 1) { const n = cur + COLS; if (!seen[n] && open(n)) { seen[n] = 1; q.push(n); } }
      }
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] === FLOOR && !seen[i]) grid[i] = 0;
      }
    },
    // 由瓦片地面生成平滑等值线轮廓：噪声起伏 + 切角平滑，得到随机曲线边缘
    buildOutline(grid) {
      const VW = COLS + 1, VH = ROWS + 1;
      const val = new Float32Array(VW * VH);
      for (let vy = 0; vy < VH; vy++) {
        for (let vx = 0; vx < VW; vx++) {
          let s = 0;
          for (let oy = -1; oy <= 0; oy++) {
            for (let ox = -1; ox <= 0; ox++) {
              const tx = vx + ox, ty = vy + oy;
              if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
              if (grid[ty * COLS + tx] === FLOOR) s++;
            }
          }
          // 基础场 + 大尺度起伏 + 小尺度碎边
          let v = s / 4;
          v += (vnoise(vx * 0.22, vy * 0.22) - 0.5) * 0.24;
          v += (vnoise(vx * 0.85 + 31, vy * 0.85 + 17) - 0.5) * 0.1;
          val[vy * VW + vx] = v;
        }
      }
      const loops = traceContours(val, VW, VH, 0.5);
      const path = new Path2D();
      const worldLoops = [];
      for (const raw of loops) {
        const pts = chaikin(raw, 2);
        if (pts.length < 3) continue;
        const wp = pts.map((p) => ({ x: p.x * TILE, y: p.y * TILE }));
        worldLoops.push(wp);
        path.moveTo(wp[0].x, wp[0].y);
        for (let i = 1; i < wp.length; i++) path.lineTo(wp[i].x, wp[i].y);
        path.closePath();
      }
      // 轮廓点供边缘美术装饰（草丛、灌木、岩石）沿边界生成
      this._outlineLoops = worldLoops;
      return path;
    },
    roughenEdges(grid) {
      const src = grid.slice();
      const floorAt = (tx, ty) => tx > 0 && ty > 0 && tx < COLS - 1 && ty < ROWS - 1 &&
        src[ty * COLS + tx] === FLOOR;
      for (let ty = 1; ty < ROWS - 1; ty++) {
        for (let tx = 1; tx < COLS - 1; tx++) {
          const i = ty * COLS + tx;
          const floor = src[i] === FLOOR;
          const near = floorAt(tx - 1, ty) || floorAt(tx + 1, ty) ||
            floorAt(tx, ty - 1) || floorAt(tx, ty + 1);
          if (!near) continue;
          const n = hash2(tx * 13 + 7, ty * 17 + 3);
          if (!floor) {
            // 墙向内增生：贴着地面鼓起，必与现有地面连通
            if (n > 0.6) grid[i] = FLOOR;
          } else {
            // 只侵蚀临墙的边界地板（恰好一面是墙），内部实心不动，避免出现碎洞与孤岛
            // 地图最外两圈不侵蚀：靠边界的地板只有 3 个邻居，侵蚀会让边界通道断开
            let cnt = 0;
            if (floorAt(tx - 1, ty)) cnt++;
            if (floorAt(tx + 1, ty)) cnt++;
            if (floorAt(tx, ty - 1)) cnt++;
            if (floorAt(tx, ty + 1)) cnt++;
            if (cnt === 3 && n < 0.3 && tx > 1 && ty > 1 &&
              tx < COLS - 2 && ty < ROWS - 2) grid[i] = 0;
          }
        }
      }
    },
    carveTile(grid, tx, ty) {
      if (tx <= 0 || ty <= 0 || tx >= COLS - 1 || ty >= ROWS - 1) return;
      grid[ty * COLS + tx] = FLOOR;
    },

    /* ---------- 地形查询与碰撞 ---------- */
    isFloorTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
      return this.grid[ty * COLS + tx] === FLOOR;
    },
    isWallAt(x, y) {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      return !this.isFloorTile(tx, ty);
    },
    circleWall(x, y, r) {
      const x0 = Math.floor((x - r) / TILE);
      const x1 = Math.floor((x + r) / TILE);
      const y0 = Math.floor((y - r) / TILE);
      const y1 = Math.floor((y + r) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (this.isFloorTile(tx, ty)) continue;
          const nx = U.clamp(x, tx * TILE, tx * TILE + TILE);
          const ny = U.clamp(y, ty * TILE, ty * TILE + TILE);
          const dx = x - nx, dy = y - ny;
          if (dx * dx + dy * dy < r * r) return true;
        }
      }
      return false;
    },
    // 轴分离移动：撞墙时沿墙滑动，不会穿墙
    moveWithCollision(e, dx, dy, r) {
      if (dx) {
        const nx = e.x + dx;
        if (!this.circleWall(nx, e.y, r)) e.x = nx;
      }
      if (dy) {
        const ny = e.y + dy;
        if (!this.circleWall(e.x, ny, r)) e.y = ny;
      }
      e.x = U.clamp(e.x, TILE, ARENA_W - TILE);
      e.y = U.clamp(e.y, TILE, ARENA_H - TILE);
    },
    // 道具碰撞体：立件的竖胶囊（上端 = 脚底锚点，下端向下延伸，见 y2）。
    // 只做圆形碰撞时 y2 缺省等于 y。仅玩家生效。
    circleProp(x, y, r) {
      const list = this.propCols;
      if (!list || !list.length) return false;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const y2 = c.y2 == null ? c.y : c.y2;
        const ny = y < c.y ? c.y : (y > y2 ? y2 : y);
        const dx = x - c.x, dy = y - ny;
        const rr = r + c.r;
        if (dx * dx + dy * dy < rr * rr) return true;
      }
      return false;
    },
    // 点到道具碰撞体表面的距离（负数 = 已在碰撞体内）
    propGap(c, x, y) {
      const y2 = c.y2 == null ? c.y : c.y2;
      const ny = y < c.y ? c.y : (y > y2 ? y2 : y);
      return Math.hypot(x - c.x, y - ny) - c.r;
    },
    // 生成期校验：宝箱 / 怪群 / 首领场地不能被道具碰撞体封死
    ensureCriticalReachable() {
      if (!this.propCols || !this.propCols.length) return true;
      const P = 14;
      const critical = [];
      for (const c of this.chests || []) critical.push(c);
      for (const p of this.chunkPacks || []) critical.push(p);
      const last = this.rooms && this.rooms[this.rooms.length - 1];
      if (last) critical.push({ x: last.cx, y: last.cy });
      if (this.reachableWithProps(critical, P)) return true;

      // 只拆除真正把地面切成两半的立件碰撞：房间中央不碍事的石头/树干保留，
      // 避免整图清空碰撞体后失去阻挡手感；每轮打通一处“口子”，通常 1~2 轮收敛。
      for (let attempt = 0; attempt < 10; attempt++) {
        const seen = this.propReachSeen(P);
        if (!seen) {
          // 出生格被立件压住：只移除覆盖出生点的那个碰撞体
          const sx = Math.floor(this.player.x / TILE) * TILE + TILE / 2;
          const sy = Math.floor(this.player.y / TILE) * TILE + TILE / 2;
          const keep = this.propCols.filter(c => this.propGap(c, sx, sy) > P);
          if (keep.length === this.propCols.length) { this.propCols.length = 0; break; }
          this.propCols = keep;
          continue;
        }
        // 不可达但紧邻可达区的地面格 = 被碰撞体堵住的通道口
        const gates = [];
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const i = y * COLS + x;
            if (seen[i] || !this.isFloorTile(x, y)) continue;
            if ((x > 0 && seen[i - 1]) || (x < COLS - 1 && seen[i + 1]) ||
              (y > 0 && seen[i - COLS]) || (y < ROWS - 1 && seen[i + COLS])) {
              gates.push(i);
            }
          }
        }
        if (!gates.length) break;
        const before = this.propCols.length;
        this.propCols = this.propCols.filter((c) => {
          for (let g = 0; g < gates.length; g++) {
            const gx = (gates[g] % COLS) * TILE + TILE / 2;
            const gy = ((gates[g] / COLS) | 0) * TILE + TILE / 2;
            if (Math.hypot(c.x - gx, c.y - gy) <= P + c.r) return false;
          }
          return true;
        });
        if (this.propCols.length === before) break;
        if (this.reachableWithProps(critical, P)) return true;
      }
      // 极端布局兜底：放弃碰撞体但保留视觉立件，确保流程可通
      this.propCols.length = 0;
      return this.reachableWithProps(critical, P);
    },
    propReachSeen(r) {
      const seen = new Uint8Array(COLS * ROWS);
      const sx = Math.floor(this.player.x / TILE), sy = Math.floor(this.player.y / TILE);
      const pass = (tx, ty) => this.isFloorTile(tx, ty) &&
        !this.circleProp(tx * TILE + TILE / 2, ty * TILE + TILE / 2, r);
      if (!pass(sx, sy)) return null;
      const queue = [sy * COLS + sx];
      seen[queue[0]] = 1;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < queue.length; i++) {
        const idx = queue[i], x = idx % COLS, y = (idx / COLS) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + dirs[d][0], ny = y + dirs[d][1];
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const ni = ny * COLS + nx;
          if (seen[ni] || !pass(nx, ny)) continue;
          seen[ni] = 1;
          queue.push(ni);
        }
      }
      return seen;
    },
    reachableWithProps(points, r) {
      const seen = this.propReachSeen(r);
      if (!seen) return false;
      for (const p of points) {
        const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || !seen[ty * COLS + tx]) return false;
      }
      return true;
    },
    // 玩家专用移动：墙体 + 场景道具双层碰撞，仍按轴分离实现贴边滑动
    movePlayer(e, dx, dy, r) {
      if (dx) {
        const nx = e.x + dx;
        if (!this.circleWall(nx, e.y, r) && !this.circleProp(nx, e.y, r)) e.x = nx;
      }
      if (dy) {
        const ny = e.y + dy;
        if (!this.circleWall(e.x, ny, r) && !this.circleProp(e.x, ny, r)) e.y = ny;
      }
      e.x = U.clamp(e.x, TILE, ARENA_W - TILE);
      e.y = U.clamp(e.y, TILE, ARENA_H - TILE);
    },
    // 绕墙转向：正前方被墙角挡住时，依次尝试左右偏转，实现贴墙滑动
    moveWithSteer(e, dx, dy, r) {
      const len = Math.hypot(dx, dy);
      if (len < 0.001) return false;
      const base = Math.atan2(dy, dx);
      const probe = Math.max(5, len);
      for (const off of STEER_OFFSETS) {
        const a = base + off;
        const nx = e.x + Math.cos(a) * probe;
        const ny = e.y + Math.sin(a) * probe;
        if (this.circleWall(nx, ny, r)) continue;
        this.moveWithCollision(e, Math.cos(a) * len, Math.sin(a) * len, r);
        return true;
      }
      return false;
    },
    nearestFloorPoint(x, y, maxTiles) {
      const max = maxTiles || 5;
      const cx = Math.floor(x / TILE);
      const cy = Math.floor(y / TILE);
      if (this.isFloorTile(cx, cy)) return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
      for (let r = 1; r <= max; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (!this.isFloorTile(cx + dx, cy + dy)) continue;
            return {
              x: (cx + dx) * TILE + TILE / 2,
              y: (cy + dy) * TILE + TILE / 2
            };
          }
        }
      }
      return null;
    },
    // 点地走位落点：避开墙面与道具碰撞体，保证玩家能走到
    nearestFreePoint(x, y, maxTiles, r) {
      const p = this.nearestFloorPoint(x, y, maxTiles || 4);
      if (p && !this.circleProp(p.x, p.y, r)) return p;
      for (let rad = 24; rad <= 168; rad += 24) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const px = x + Math.cos(a) * rad;
          const py = y + Math.sin(a) * rad;
          if (!this.circleWall(px, py, r) && !this.circleProp(px, py, r)) return { x: px, y: py };
        }
      }
      return p;
    },
    roomAtWorld(x, y) {
      for (const r of this.rooms) {
        if (x >= r.x * TILE && x <= (r.x + r.w) * TILE &&
          y >= r.y * TILE && y <= (r.y + r.h) * TILE) return r;
      }
      return null;
    },
    randomRoomPoint(room) {
      for (let i = 0; i < 12; i++) {
        const x = U.rand((room.x + 0.6) * TILE, (room.x + room.w - 0.6) * TILE);
        const y = U.rand((room.y + 0.6) * TILE, (room.y + room.h - 0.6) * TILE);
        if (!this.circleWall(x, y, 15)) return { x, y };
      }
      return this.nearestFloorPoint(room.cx, room.cy, 3) || { x: room.cx, y: room.cy };
    },
    weightedRoom(rooms) {
      let total = 0;
      for (const r of rooms) total += r.area;
      let v = U.random() * total;
      for (const r of rooms) {
        v -= r.area;
        if (v <= 0) return r;
      }
      return rooms[rooms.length - 1];
    },

    /* ---------- 探索迷雾 ---------- */
    revealAt(x, y, radiusTiles) {
      const r = radiusTiles || 8;
      const cx = Math.floor(x / TILE);
      const cy = Math.floor(y / TILE);
      const r2 = r * r;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const tx = cx + dx;
          const ty = cy + dy;
          if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
          const i = ty * COLS + tx;
          if (this.explored[i]) continue;
          this.explored[i] = 1;
          if (!this._minimapNew) this._minimapNew = [];
          this._minimapNew.push(i);
          if (this.grid[i] === FLOOR) this.exploredFloor++;
        }
      }
    },
    updateExploration(dt) {
      this.exploreTimer -= dt;
      if (this.exploreTimer > 0) return;
      this.exploreTimer = 0.12;
      const before = this.exploredFloor;
      this.revealAt(this.player.x, this.player.y, 8);
      // 只有真正揭开新格子时才重建迷雾与小地图，避免每 0.12 秒全图重绘
      if (this.exploredFloor !== before) this.updateFogTexture();
    },
    // 每格一个像素写入迷雾，绘制时放大并做插值，得到柔和的探索边界
    updateFogTexture() {
      if (!this._fogCtx) return;
      // 复用缓冲区：这里每 0.12 秒可能触发一次，避免反复分配 34KB 内存引发 GC 卡顿
      if (!this._fogRaw) this._fogRaw = new Float32Array(COLS * ROWS);
      const raw = this._fogRaw;
      raw.fill(0);
      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          const i = ty * COLS + tx;
          if (this.explored[i]) continue;
          const near = this.explored[ty * COLS + Math.max(0, tx - 1)] ||
            this.explored[ty * COLS + Math.min(COLS - 1, tx + 1)] ||
            this.explored[Math.max(0, ty - 1) * COLS + tx] ||
            this.explored[Math.min(ROWS - 1, ty + 1) * COLS + tx];
          raw[i] = near ? 162 : 242;
        }
      }
      // 3×3 均值模糊：消除逐格雾边的方格感，放大后成为连续雾层
      const img = this._fogImage || (this._fogImage = this._fogCtx.createImageData(COLS, ROWS));
      const data = img.data;
      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          let sum = 0, n = 0;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const nx = tx + ox, ny = ty + oy;
              if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
              sum += raw[ny * COLS + nx];
              n++;
            }
          }
          const o = (ty * COLS + tx) * 4;
          data[o] = 0;
          data[o + 1] = 0;
          data[o + 2] = 0;
          data[o + 3] = sum / n;
        }
      }
      this._fogCtx.putImageData(img, 0, 0);
      this._minimapDirty = true;
    },
    explorePct() {
      return this.floorTotal ? this.exploredFloor / this.floorTotal : 0;
    },

    /* ---------- 寻路流场（BFS） ---------- */
    updateFlow(dt) {
      this.flowTimer -= dt;
      if (this.flowTimer > 0) return;
      this.flowTimer = 0.28;
      // 玩家没跨格时不重算流场，减少大地图上的周期性开销
      const tx = Math.floor(this.player.x / TILE);
      const ty = Math.floor(this.player.y / TILE);
      if (tx === this._flowTileX && ty === this._flowTileY) return;
      this._flowTileX = tx;
      this._flowTileY = ty;
      this.computeFlow(this.player.x, this.player.y);
    },
    computeFlow(px, py) {
      const dist = this.flow;
      if (!dist) return;
      dist.fill(INF);
      let sx = U.clamp(Math.floor(px / TILE), 0, COLS - 1);
      let sy = U.clamp(Math.floor(py / TILE), 0, ROWS - 1);
      if (!this.isFloorTile(sx, sy)) {
        const n = this.nearestFloorPoint(px, py, 4);
        if (!n) return;
        sx = Math.floor(n.x / TILE);
        sy = Math.floor(n.y / TILE);
      }
      const q = this._flowQueue;
      let head = 0, tail = 0;
      const start = sy * COLS + sx;
      dist[start] = 0;
      q[tail++] = start;
      while (head < tail) {
        const cur = q[head++];
        const cx = cur % COLS;
        const cy = (cur / COLS) | 0;
        const nd = dist[cur] + 1;
        for (let i = 0; i < 4; i++) {
          const nx = cx + (i === 0 ? 1 : i === 2 ? -1 : 0);
          const ny = cy + (i === 1 ? 1 : i === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const ni = ny * COLS + nx;
          if (this.grid[ni] !== FLOOR || dist[ni] <= nd) continue;
          dist[ni] = nd;
          q[tail++] = ni;
        }
      }
    },
    flowDirection(x, y) {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
      const cur = ty * COLS + tx;
      const startD = this.flow[cur];
      const clr = this.clearance;
      let best = startD;
      let bestClear = -1;
      let bx = -1, by = -1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = tx + dx;
          const ny = ty + dy;
          if (!this.isFloorTile(nx, ny)) continue;
          // 禁止斜穿墙角
          if (dx && dy && (!this.isFloorTile(tx + dx, ty) || !this.isFloorTile(tx, ty + dy))) continue;
          const ni = ny * COLS + nx;
          const d = this.flow[ni];
          const c = clr ? clr[ni] : 0;
          if (d < best || (d === best && d < startD && c > bestClear)) {
            best = d;
            bestClear = c;
            bx = nx;
            by = ny;
          }
        }
      }
      if (bx < 0) return null;
      const cx = bx * TILE + TILE / 2;
      const cy = by * TILE + TILE / 2;
      const vx = cx - x, vy = cy - y;
      const len = Math.hypot(vx, vy) || 1;
      return { x: vx / len, y: vy / len };
    },
    computeAutoFlow(px, py) {
      const dist = this.autoFlow;
      if (!dist) return false;
      const r = this.player ? this.player.r : 14;
      let sx = U.clamp(Math.floor(px / TILE), 0, COLS - 1);
      let sy = U.clamp(Math.floor(py / TILE), 0, ROWS - 1);
      if (!this.autoFlowOpen(sx, sy, r)) {
        const n = this.nearestFreePoint(px, py, 5, r);
        if (!n) return false;
        sx = Math.floor(n.x / TILE);
        sy = Math.floor(n.y / TILE);
      }
      const start = sy * COLS + sx;
      if (start === this._autoFlowTarget) return true;
      if (this._autoFlowTarget >= 0 && this.time < (this._autoFlowRefreshAt || 0)) return true;
      this._autoFlowTarget = start;
      this._autoFlowRefreshAt = this.time + 0.24;
      dist.fill(INF);
      const q = this._autoFlowQueue;
      let head = 0, tail = 0;
      dist[start] = 0;
      q[tail++] = start;
      while (head < tail) {
        const cur = q[head++];
        const cx = cur % COLS, cy = (cur / COLS) | 0;
        const nd = dist[cur] + 1;
        for (let i = 0; i < 4; i++) {
          const nx = cx + (i === 0 ? 1 : i === 2 ? -1 : 0);
          const ny = cy + (i === 1 ? 1 : i === 3 ? -1 : 0);
          if (!this.autoFlowOpen(nx, ny, r)) continue;
          const ni = ny * COLS + nx;
          if (dist[ni] <= nd) continue;
          dist[ni] = nd;
          q[tail++] = ni;
        }
      }
      return true;
    },
    autoFlowOpen(tx, ty, r) {
      if (!this.isFloorTile(tx, ty)) return false;
      return !this.circleProp(tx * TILE + TILE / 2, ty * TILE + TILE / 2, r);
    },
    autoFlowDirection(x, y, target) {
      if (!target || !this.computeAutoFlow(target.x, target.y)) return null;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
      const r = this.player ? this.player.r : 14;
      const cur = ty * COLS + tx;
      const startD = this.autoFlow[cur];
      let best = startD, bestClear = -1, bx = -1, by = -1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = tx + dx, ny = ty + dy;
          if (!this.autoFlowOpen(nx, ny, r)) continue;
          if (dx && dy && (!this.autoFlowOpen(tx + dx, ty, r) || !this.autoFlowOpen(tx, ty + dy, r))) continue;
          const ni = ny * COLS + nx, d = this.autoFlow[ni];
          const c = this.clearance ? this.clearance[ni] : 0;
          if (d < best || (d === best && d < startD && c > bestClear)) {
            best = d; bestClear = c; bx = nx; by = ny;
          }
        }
      }
      if (bx < 0) return null;
      const vx = bx * TILE + TILE / 2 - x, vy = by * TILE + TILE / 2 - y;
      const len = Math.hypot(vx, vy) || 1;
      return { x: vx / len, y: vy / len };
    },

    // 道具总图加载：单张图集，按当前地貌生成调色版本；到位后重烘焙地形
    loadMapArt(style) {
      const AD = DG.art && DG.art.terrainDecor;
      if (AD) AD.load(() => {
        // 图集可能早已预载完成，回调控在构造器中途同步触发：
        // 此时 player/sceneProps 还没建好，交给构造器自己生成，避免重复构建
        if (this.finished || !this.player || !this.makeSceneProps) return;
        this.sceneProps = this.makeSceneProps();
      });
    },

    /* ---------- 首领降临点：固定在终点场地内，与玩家保持一段距离 ---------- */
    pickBossSpawn() {
      const p = this.player;
      const last = this.rooms[this.rooms.length - 1];
      if (last) {
        for (let i = 0; i < 40; i++) {
          const x = U.rand((last.x + 2) * TILE, (last.x + last.w - 2) * TILE);
          const y = U.rand((last.y + 2) * TILE, (last.y + last.h - 2) * TILE);
          if (U.dist2(x, y, p.x, p.y) < 260) continue;
          if (!this.circleWall(x, y, 48)) return { x, y };
        }
        return this.nearestFloorPoint(last.cx, last.cy, 4) || { x: last.cx, y: last.cy };
      }
      // 兜底：以玩家为中心向外找一圈可站立的地面
      for (let i = 0; i < 36; i++) {
        const a = (Math.PI * 2 / 36) * i;
        const x = p.x + Math.cos(a) * 520;
        const y = p.y + Math.sin(a) * 520;
        if (!this.circleWall(x, y, 48)) return { x, y };
      }
      return this.nearestFloorPoint(p.x, p.y, 6) || { x: p.x, y: p.y };
    }
  });
})();
