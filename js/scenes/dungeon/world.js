/* 副本战斗 · 世界层：地形装饰、刷怪、波次与首领登场 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const TILE = DG.scenes.dungeon.terrain.TILE;

  Object.assign(DG.scenes.dungeon.prototype, {
  makeDecor() {
    const rocks = [];
    const count = 48 + this.rooms.length * 6;
    for (let i = 0; i < count; i++) {
      const room = U.pick(this.rooms);
      const px = U.rand((room.x + 0.8) * TILE, (room.x + room.w - 0.8) * TILE);
      const py = U.rand((room.y + 0.8) * TILE, (room.y + room.h - 0.8) * TILE);
      // 不规则边缘可能把矩形房间边角啃成墙，装饰只放在实心地面上
      const pos = this.isFloorTile(Math.floor(px / TILE), Math.floor(py / TILE))
        ? { x: px, y: py }
        : this.nearestFloorPoint(px, py, 3);
      if (!pos) continue;
      rocks.push({
        x: pos.x,
        y: pos.y,
        r: U.rand(12, 30),
        fog: U.chance(0.35),
        alpha: U.rand(0.03, 0.08),
        seed: U.random() * Math.PI * 2
      });
    }
    return rocks;
  },
  makeSceneProps() {
    const AD = DG.art && DG.art.terrainDecor;
    const out = [];
    if (!AD) return out;
    this.propCols = (this.propCols || []).filter(c => !c.sceneProp);
    const T = DG.scenes.dungeon.terrain;
    const salt = (this.floorTotal || 0) * 97 + this.rooms.length * 31;
    const hash = T.hash2;
    const chests = this.chests || [];
    const packs = this.chunkPacks || [];
    const spawn = this.spawnPoint || this.player || null;
    // 占位矩形：按素材实际画幅（含脚底锚点）计算屏幕占位。
    // 两件装饰的占位矩形不允许相交，彻底避免视觉上“堆在一起”；
    // 同款素材之间再额外拉开距离，避免同款扎堆
    const placed = [];
    const boxOf = (d, s, x, y) => {
      const w = d.w * s, h = d.h * s;
      const ay = d.ay == null ? 1 : d.ay;
      return { l: x - w * 0.5, r: x + w * 0.5, t: y - h * ay, b: y + h * (1 - ay) };
    };
    const boxFree = (box, id, padX, padY, sameGap) => {
      const cx = (box.l + box.r) * 0.5, cy = (box.t + box.b) * 0.5;
      for (const o of placed) {
        // 同款素材额外拉开距离（只对立件生效；贴花/草丛允许成片）
        if (sameGap && o.id === id) {
          const dx = (o.box.l + o.box.r) * 0.5 - cx;
          const dy = (o.box.t + o.box.b) * 0.5 - cy;
          if (dx * dx + dy * dy < sameGap * sameGap) return false;
        }
        const apart = box.r + padX <= o.box.l || box.l - padX >= o.box.r ||
          box.b + padY <= o.box.t || box.t - padY >= o.box.b;
        if (!apart) return false;
      }
      return true;
    };
    const clearOf = (x, y, d) => {
      if (spawn) {
        const sx = spawn.x - x, sy = spawn.y - y;
        if (sx * sx + sy * sy < d * d) return false;
      }
      return chests.concat(packs).every(o => {
        const dx = o.x - x, dy = o.y - y;
        return dx * dx + dy * dy > d * d;
      });
    };
    const add = (id, x, y, h) => {
      const d = AD.def(id);
      if (!d) return false;
      const size = d.size[0] + (d.size[1] - d.size[0]) * h;
      const s = size / d.h;
      const p = {
        id, x, y, s, flip: hash(Math.round(x * 0.07), Math.round(y * 0.11)) > 0.5,
        rot: (hash(Math.round(x * 0.13), Math.round(y * 0.17)) - 0.5) * 0.12,
        zone: 'inside', layer: d.layer || 'prop'
      };
      // 立件必须带碰撞体：没有碰撞体就干脆不画，
      // 否则角色能站进道具里，必然出现“踩在头上”的穿模
      if (p.layer === 'prop') {
        if (!d.breakable || !d.solid) return false;
        // 碰撞体是「脚底锚点向下延伸」的竖胶囊：角色能贴近立件侧面，
        // 但无法站到立件正下方；角色视觉高度约 126px（脚底到头顶），
        // 胶囊长度 + 半径足以让头顶始终低于立件底边，不再出现“戴帽”错觉
        const HEAD_CLEAR = 112;
        const r = Math.max(26, Math.min(42, d.w * s * 0.34));
        p.breakable = true;
        p.hp = 1;
        p.col = { x, y, y2: y + HEAD_CLEAR, r, prop: p, sceneProp: true };
        this.propCols.push(p.col);
        const critical = (this.chests || []).concat(this.chunkPacks || []);
        const last = this.rooms && this.rooms[this.rooms.length - 1];
        if (last) critical.push({ x: last.cx, y: last.cy });
        // 胶囊不能压住关键点：宝箱 / 怪群 / 首领场地中心都要留出刷怪散布半径，
        // 否则怪物会出生在立件内部；同时保证这些点仍然连通
        let blocked = critical.some(o => this.propGap(p.col, o.x, o.y) < 60);
        if (!blocked && critical.length && !this.reachableWithProps(critical, 14)) blocked = true;
        if (blocked) {
          this.propCols.pop();
          return false;
        }
      }
      out.push(p);
      return true;
    };
    // 地图内：立件贴墙、贴花铺地。候选点按「距墙距离」分池，
    // 越靠近墙越适合放立体道具，地面血迹/骸骨才允许散在房间中部
    for (let ci = 0; ci < this.chunks.length; ci++) {
      const ch = this.chunks[ci];
      const room = this.rooms[ch.index];
      if (!room) continue;
      const count = 2 + Math.floor(hash(ci + salt, 217) * 3);
      // 立件只允许贴「上侧墙」：角色只能从下方接近，
      // 立件永远排在角色身后，不会出现道具压住角色头部的错觉
      const wallSpots = [], floorSpots = [], grassSpots = [];
      // 墙体是否属于地图内部的实心区域：用于避开地图最外圈，
      // 防止立件上半身探到地图外的黑色区域里
      const innerWall = (x, y) => this.chunks.some(c =>
        x >= c.px && x <= c.px + c.w * TILE && y >= c.py && y <= c.py + c.h * TILE);
      for (let ty = room.y + 1; ty < room.y + room.h - 1; ty++) {
        for (let tx = room.x + 1; tx < room.x + room.w - 1; tx++) {
          if (!this.isFloorTile(tx, ty)) continue;
          const x = tx * TILE + TILE * 0.5, y = ty * TILE + TILE * 0.5;
          const clr = this.clearance ? this.clearance[ty * T.COLS + tx] : 1;
          floorSpots.push({ x, y });
          // 草丛候选：房间与路线（走廊）里都能长，只排除孤立的墙角/尽头，
          // 保证草能沿着主路铺开，又不会从地图最外缘探进黑域
          let nb = 0;
          if (this.isFloorTile(tx - 1, ty)) nb++;
          if (this.isFloorTile(tx + 1, ty)) nb++;
          if (this.isFloorTile(tx, ty - 1)) nb++;
          if (this.isFloorTile(tx, ty + 1)) nb++;
          if (nb >= 2) grassSpots.push({ x, y });
          if (clr > 2) continue;
          if (this.isFloorTile(tx, ty - 1)) continue;   // 上方必须是墙
          if (this.isFloorTile(tx, ty - 2)) continue;   // 再上一格也不能站人，否则角色会从背后压过来
          if (!this.isFloorTile(tx, ty + 1)) continue;  // 下方留出站立/观看空间
          if (!innerWall(x, (ty - 3) * TILE + TILE * 0.5)) continue;  // 避开地图最外圈黑域
          wallSpots.push({ x, y });
        }
      }
      for (let n = 0; n < count; n++) {
        // 约四成立件（靠墙），六成地面贴花
        const wantProp = hash(ci * 37 + n + salt, 229) >= 0.6;
        const pool = wantProp ? wallSpots : floorSpots;
        if (!pool.length) continue;
        const id = wantProp
          ? AD.pickInsideProp(hash(ci * 43 + n + salt, 239))
          : AD.pickInsideGround(hash(ci * 41 + n + salt, 233));
        const d = AD.def(id);
        if (!d) continue;
        const h = hash(ci * 47 + n + salt, 241);
        const size = d.size[0] + (d.size[1] - d.size[0]) * h;
        const s = size / d.h;
        // 随机取样而不是按行优先顺序扫描：顺序扫描会让相邻装饰落在同一排/同一列，
        // 形成肉眼可见的“排排站”
        const tries = Math.min(pool.length, 16);
        for (let k = 0; k < tries; k++) {
          const idx = Math.min(pool.length - 1,
            Math.floor(hash(ci * 53 + n * 29 + k, 243) * pool.length));
          const c = pool[idx];
          if (!clearOf(c.x, c.y, 96)) continue;
          const box = boxOf(d, s, c.x, c.y);
          if (!boxFree(box, id, 14, 20, d.layer === 'prop' ? 300 : 0)) continue;
          if (!add(id, c.x, c.y, h)) continue;
          placed.push({ box, id });
          break;
        }
      }
      // 骸骨铺撒：骨头类单独加量，营造战场尸骸感
      const boneCount = 2 + Math.floor(hash(ci + salt, 293) * 3);
      for (let n = 0; n < boneCount && floorSpots.length; n++) {
        const id = AD.pickInsideBone(hash(ci * 79 + n + salt, 299));
        const d = AD.def(id);
        if (!d) continue;
        const h = hash(ci * 83 + n + salt, 301);
        const size = d.size[0] + (d.size[1] - d.size[0]) * h;
        const s = size / d.h;
        const tries = Math.min(floorSpots.length, 18);
        for (let k = 0; k < tries; k++) {
          const idx = Math.min(floorSpots.length - 1,
            Math.floor(hash(ci * 89 + n * 67 + k, 303) * floorSpots.length));
          const c = floorSpots[idx];
          if (!clearOf(c.x, c.y, 74)) continue;
          const box = boxOf(d, s, c.x, c.y);
          if (!boxFree(box, id, 8, 12, 0)) continue;
          if (!add(id, c.x, c.y, h)) continue;
          placed.push({ box, id });
          break;
        }
      }
      // 草丛：房间和路线里都大量铺撒，五成左右围绕已有草丛成团，
      // 其余随机散落，形成自然的疏密关系。
      // 其中约 35% 可以被破坏（走过去/挥砍即碎），营造“草海”战斗氛围；
      // 可破坏草丛没有碰撞体（不挡路），也不掉任何东西
      const grassCount = 22 + Math.floor(hash(ci + salt, 307) * 16);
      const grassDone = [];
      for (let n = 0; n < grassCount && grassSpots.length; n++) {
        const id = AD.pickInsideGrass(hash(ci * 97 + n + salt, 311));
        const d = AD.def(id);
        if (!d) continue;
        const h = hash(ci * 101 + n + salt, 313);
        const size = d.size[0] + (d.size[1] - d.size[0]) * h;
        const s = size / d.h;
        const cluster = grassDone.length > 0 && hash(ci * 107 + n + salt, 323) < 0.5;
        const tries = cluster ? 16 : 24;
        for (let k = 0; k < tries; k++) {
          let x, y;
          if (cluster) {
            // 围绕同块内已有草丛随机偏移，长成一小片草地
            const base = grassDone[Math.min(grassDone.length - 1,
              Math.floor(hash(ci * 109 + n * 19 + k, 327) * grassDone.length))];
            const ang = hash(ci * 113 + n * 23 + k, 331) * Math.PI * 2;
            const rad = 28 + hash(ci * 127 + n * 29 + k, 337) * 66;
            x = base.x + Math.cos(ang) * rad;
            y = base.y + Math.sin(ang) * rad;
            const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
            if (!this.isFloorTile(tx, ty)) continue;
          } else {
            const idx = Math.min(grassSpots.length - 1,
              Math.floor(hash(ci * 103 + n * 31 + k, 317) * grassSpots.length));
            x = grassSpots[idx].x;
            y = grassSpots[idx].y;
          }
          if (!clearOf(x, y, 56)) continue;
          const box = boxOf(d, s, x, y);
          if (!boxFree(box, id, 2, 2, 0)) continue;
          if (!add(id, x, y, h)) continue;
          placed.push({ box, id });
          grassDone.push({ x, y });
          const g = out[out.length - 1];
          // 随机抽约三成草丛变成可破坏：5 丛里碎 2 丛、10 丛里碎 3 丛
          if (hash(ci * 131 + n * 43 + salt, 347) < 0.35) {
            g.breakable = true;
            g.hp = 1;
            g.passable = true;   // 不参与移动阻挡，走过去就碎
            g.noLoot = true;     // 草丛不产出装备/道具
            g.col = { x, y, y2: y, r: 16, prop: g };
          }
          break;
        }
      }
    }
    // 地图外黑域：以真实的「可行走边缘」为基准铺贴，而不是矩形包围盒。
    // 地图轮廓是不规则的，按包围盒摆放会出现某些剪影离地面几百像素的假象；
    // 这里先收集每条地面↔黑域的交界线，剪影贴着交界线整体外移，
    // 远近再按深度分层：同深度互斥保证疏密，不同深度允许叠放（近大远小、近实远虚）
    const edgePts = [];
    for (let ty = 0; ty < T.ROWS; ty++) {
      for (let tx = 0; tx < T.COLS; tx++) {
        if (!this.isFloorTile(tx, ty)) continue;
        const cx = tx * TILE + TILE * 0.5, cy = ty * TILE + TILE * 0.5;
        if (!this.isFloorTile(tx, ty - 1)) edgePts.push({ x: cx, y: ty * TILE, ex: 0, ey: -1 });
        if (!this.isFloorTile(tx, ty + 1)) edgePts.push({ x: cx, y: (ty + 1) * TILE, ex: 0, ey: 1 });
        if (!this.isFloorTile(tx - 1, ty)) edgePts.push({ x: tx * TILE, y: cy, ex: -1, ey: 0 });
        if (!this.isFloorTile(tx + 1, ty)) edgePts.push({ x: (tx + 1) * TILE, y: cy, ex: 1, ey: 0 });
      }
    }
    const outBoxes = [];
    const outFree = (box, depth) => {
      const area = Math.max(1, (box.r - box.l) * (box.b - box.t));
      return outBoxes.every(o => {
        const ow = Math.min(box.r, o.r) - Math.max(box.l, o.l);
        const oh = Math.min(box.b, o.b) - Math.max(box.t, o.t);
        if (!(ow > 0 && oh > 0)) return true;
        // 同深度必须互斥，保证同一层内的疏密
        if (Math.abs(o.depth - depth) <= 0.2) return false;
        // 前后不同深度允许叠放（形成树林纵深），但单件遮挡不超过 55%，
        // 避免近处剪影被整棵吞掉
        return (ow * oh) / Math.min(area, o.area) <= 0.55;
      });
    };
    // 整张剪影是否压在可行走面上（用于把斜边/角落的剪影继续外推）
    const boxOnFloor = (box) => {
      const x0 = Math.floor(box.l / TILE), x1 = Math.floor((box.r - 0.01) / TILE);
      const y0 = Math.floor(box.t / TILE), y1 = Math.floor((box.b - 0.01) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (this.isFloorTile(tx, ty)) return true;
        }
      }
      return false;
    };
    const outTotal = 90 + Math.round(this.chunks.length * 4);
    for (let n = 0; n < outTotal && edgePts.length; n++) {
      // 深度偏向近处（^1.4），让贴边一圈更密，远处更疏
      const depth = Math.pow(hash(n * 13 + salt, 277), 1.4);
      const id = AD.pickOutside(hash(n * 7 + salt, 269));
      const d = AD.def(id);
      if (!d) continue;
      const hh = 0.25 + hash(n * 11 + salt, 271) * 0.5;
      const size = d.size[0] + (d.size[1] - d.size[0]) * hh;
      const s = (size / d.h) * (0.55 + depth * 0.85);
      const dw = d.w * s, dh = d.h * s;
      const ep = edgePts[Math.min(edgePts.length - 1,
        Math.floor(hash(n * 17 + salt, 279) * edgePts.length))];
      const jitter = (hash(n * 19 + salt, 283) - 0.5) * TILE * 0.9;
      let pad = 6 + depth * depth * 420;
      const place = () => {
        if (ep.ey < 0) return { x: ep.x + jitter, y: ep.y - pad };
        if (ep.ey > 0) return { x: ep.x + jitter, y: ep.y + dh + pad };
        if (ep.ex < 0) return { x: ep.x - dw * 0.5 - pad, y: ep.y + jitter };
        return { x: ep.x + dw * 0.5 + pad, y: ep.y + jitter };
      };
      let pos = place();
      let box = boxOf(d, s, pos.x, pos.y);
      // 轮廓折角处继续外推，保证剪影完全落在黑域里，绝不盖到可行走面
      for (let guard = 0; guard < 12 && boxOnFloor(box); guard++) {
        pad += 40;
        pos = place();
        box = boxOf(d, s, pos.x, pos.y);
      }
      if (boxOnFloor(box)) continue;
      if (!outFree(box, depth)) continue;
      outBoxes.push(Object.assign({ depth, area: (box.r - box.l) * (box.b - box.t) }, box));
      out.push({
        id, x: pos.x, y: pos.y, s, zone: 'outside', layer: 'prop', depth,
        flip: hash(n * 23 + salt, 287) > 0.5,
        rot: (hash(n * 29 + salt, 289) - 0.5) * 0.16,
        alpha: 0.9 - depth * 0.4
      });
    }
    // 静态按到地图的距离排序：远处的先画、贴边近处的后画，
    // 保证四条边上叠放时的前后关系都正确（近的盖住远的）
    out.sort((a, b) => (b.depth || 0) - (a.depth || 0) || a.y - b.y);
    return out;
  },
  breakPropsAt(x, y, radius) {
    let changed = false;
    for (const p of this.sceneProps || []) {
      if (p.destroyed || !p.breakable || !p.col) continue;
      if (this.propGap(p.col, x, y) > radius) continue;
      // 一击即碎：走过去或被攻击都直接破坏，不留血条
      p.destroyed = true;
      changed = true;
      this.shatterProp(p);
      // 草丛等纯氛围道具只碎裂，不产出战利品
      if (!p.noLoot) this.dropPropLoot(p);
    }
    if (changed) this.propCols = this.propCols.filter(c => !c.prop || !c.prop.destroyed);
    return changed;
  },
  // 破碎表现：把素材按 2×3 切成碎片，向外飞散、翻滚并逐渐淡出
  shatterProp(p) {
    const AD = DG.art && DG.art.terrainDecor;
    const d = AD && AD.def(p.id);
    const img = AD && AD.shardImage ? AD.shardImage(p.id) : null;
    if (!d || !img) {
      this.addBurst(p.col.x, p.col.y, '#b5a47f', 7);
      return;
    }
    const w = d.w * p.s, h = d.h * p.s;
    const ay = d.ay == null ? 1 : d.ay;
    const cols = 2, rows = 3;
    const cw = d.w / cols, chh = d.h / rows;
    this.addBurst(p.col.x, p.col.y - h * 0.3, '#b5a47f', 6);
    this.addRing(p.col.x, p.col.y - h * 0.2, 6, p.col.r * 1.5, '#aa9a6d', 0.18);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fx = (c + 0.5) / cols - 0.5;
        const fy = (r + 0.5) / rows;
        this.effects.push({
          kind: 'shard', img,
          sx: d.x + c * cw, sy: d.y + r * chh, sw: cw, sh: chh,
          x: p.x + fx * w,
          y: p.y - h * ay + fy * h,
          vx: fx * 170 + U.rand(-40, 40),
          vy: -U.rand(70, 160) - (1 - fy) * 40,
          rot: 0, vr: U.rand(-7, 7),
          scale: p.s,
          life: U.rand(0.7, 1.05), max: 1.05
        });
      }
    }
  },
  // 可破坏道具的垃圾掉落表：普通装备为主，少量魔法装备，
  // 另外会掉恢复球 / 符文这类普通道具，也可能什么都没有。
  // 只产出拾取物，不提供任何临时增益。
  dropPropLoot(p) {
    const rnd = U.random();
    const pos = (rx, ry) => this.nearestFloorPoint(p.x + U.rand(-rx, rx), p.y + U.rand(-4, ry), 2) ||
      { x: p.x, y: p.y };
    if (rnd < 0.05) {
      // 少量魔法品质：属性略好一点，仍然只算“垃圾”级产出
      if (!DG.items) return;
      const ilvl = Math.max(1, (this.def && this.def.ilvl) || 1);
      const item = DG.items.generate(ilvl, { minRarity: 'magic', cls: this.char && this.char.cls });
      const at = pos(20, 22);
      this.drops.push({ kind: 'item', item, x: at.x, y: at.y, r: 12, t: 0 });
      return;
    }
    if (rnd < 0.40) {
      // 普通品质装备：无词缀，纯过渡垃圾
      if (!DG.items) return;
      const ilvl = Math.max(1, (this.def && this.def.ilvl) || 1);
      const item = DG.items.generate(ilvl, { rarity: 'normal', cls: this.char && this.char.cls });
      const at = pos(20, 22);
      this.drops.push({ kind: 'item', item, x: at.x, y: at.y, r: 12, t: 0 });
      return;
    }
    if (rnd < 0.54) {
      // 恢复球：普通道具，拾取即回血
      const at = pos(18, 18);
      this.drops.push({ kind: 'orb', x: at.x, y: at.y, r: 10, t: 0 });
      return;
    }
    if (rnd < 0.57) {
      // 符文：低概率的普通道具
      const at = pos(18, 18);
      this.drops.push({ kind: 'rune', x: at.x, y: at.y, r: 11, t: 0 });
    }
  },
  // 前方最近的可破坏道具：自动战斗被挡住时用来开砸
  nearestBreakableInFront(maxDist) {
    const dir = this.moveDirAngle;
    let best = null, bestD = maxDist;
    for (const p of this.sceneProps || []) {
      // 草丛这类可穿过的不挡路，自动战斗卡住时不拿来开砸
      if (p.destroyed || !p.breakable || !p.col || p.zone !== 'inside' || p.passable) continue;
      const gap = this.propGap(p.col, this.player.x, this.player.y);
      if (gap > bestD) continue;
      const y2 = p.col.y2 == null ? p.col.y : p.col.y2;
      const cy = Math.max(p.col.y, Math.min(y2, this.player.y));
      const dx = p.col.x - this.player.x, dy = cy - this.player.y;
      if (dir != null) {
        const a = Math.atan2(dy, dx);
        let diff = Math.abs(a - dir) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff > Math.PI * 0.6) continue;
      }
      bestD = gap;
      best = p;
    }
    return best;
  },
  // 按块生成怪群与宝箱：房间/岔路 3 簇、走廊 2 簇，玩家靠近相邻块时才激活。
  // 簇点向地块中心收拢，怪群贴着主路线，避免玩家满图找怪；
  // 少量簇随机升级为密集怪群（6~8 只），制造偶发的怪物潮
  makeChunkPacks() {
    const packs = [];
    for (const ch of this.chunks) {
      if (ch.id === 'entrance' || ch.id === 'arena') continue;
      const room = this.rooms[ch.index];
      if (!room) continue;
      // 密室：随机方案——普通怪群 / 精英 / 宝箱 / 精英 + 宝箱，自由组合
      if (ch.tags.indexOf('secret') >= 0) {
        const roll = U.random();
        const variant = roll < 0.3 ? 'normal'
          : roll < 0.6 ? 'elite'
          : roll < 0.82 ? 'chest' : 'elite_chest';
        packs.push({
          chunk: ch.index, x: room.cx, y: room.cy,
          count: variant === 'normal' ? U.randInt(3, 5) : 0,
          elite: variant === 'elite' ? U.randInt(1, 2) : (variant === 'elite_chest' ? 1 : 0),
          secret: true, variant, spawned: false
        });
        continue;
      }
      const roomy = ch.tags.indexOf('room') >= 0 || ch.tags.indexOf('junction') >= 0;
      // 以地块中心为圆心撒点：半径最多约 245px，保证怪群落在主路线附近
      const reach = Math.min(room.w, room.h) * TILE * 0.34;
      const nearCenter = () => {
        for (let i = 0; i < 12; i++) {
          const a = U.rand(0, Math.PI * 2);
          const rad = Math.sqrt(U.random()) * reach;
          const x = room.cx + Math.cos(a) * rad;
          const y = room.cy + Math.sin(a) * rad;
          if (!this.circleWall(x, y, 15)) return { x, y };
        }
        return this.nearestFloorPoint(room.cx, room.cy, 3) || { x: room.cx, y: room.cy };
      };
      const points = [];
      for (let i = 0, n = roomy ? 3 : 2; i < n; i++) {
        let pos = nearCenter();
        // 同块内各簇拉开距离，避免出生点重叠
        for (let guard = 0; guard < 8 && points.some(q => Math.hypot(q.x - pos.x, q.y - pos.y) < 120); guard++) {
          pos = nearCenter();
        }
        points.push(pos);
      }
      for (const pos of points) {
        // 约 8%~16% 的簇是密集怪群
        const dense = U.chance(roomy ? 0.16 : 0.08);
        packs.push({
          chunk: ch.index,
          x: pos.x,
          y: pos.y,
          count: dense ? U.randInt(6, 8) : (roomy ? U.randInt(3, 5) : U.randInt(2, 4)),
          dense,
          spawned: false
        });
      }
    }
    this._lastChunk = -1;
    return packs;
  },
  // 宝箱：带房间的块按概率放置；密室按随机方案可能保底放一个
  makeChests() {
    const chests = [];
    const place = (ch) => {
      const room = this.rooms[ch.index];
      if (!room) return;
      const pos = this.nearestFloorPoint(room.cx + U.rand(-40, 40), room.cy + U.rand(-40, 40), 3) ||
        { x: room.cx, y: room.cy };
      chests.push({ x: pos.x, y: pos.y, r: 16, opened: false, t: 0, chunk: ch.index });
    };
    const eligible = (ch) => ch.id !== 'entrance' && ch.id !== 'arena' &&
      (ch.def.rooms || []).length > 0;
    const secretChest = (ch) => {
      const p = (this.chunkPacks || []).find(q => q.secret && q.chunk === ch.index);
      return p && (p.variant === 'chest' || p.variant === 'elite_chest');
    };
    for (const ch of this.chunks) {
      if (!eligible(ch)) continue;
      if (!secretChest(ch) && !U.chance(0.62)) continue;
      place(ch);
    }
    // 保底：至少两个宝箱，保证伏击宝箱必定混入且不占掉全部宝箱
    if (chests.length < 2) {
      const spare = this.chunks.filter(ch => eligible(ch) && !chests.some(c => c.chunk === ch.index));
      while (chests.length < 2 && spare.length) {
        place(spare.splice(U.randInt(0, spare.length - 1), 1)[0]);
      }
    }
    // 伏击宝箱：混入 1~2 个普通宝箱，外观完全一致，触碰才现形
    const pool = chests.slice();
    const want = pool.length >= 3 && U.chance(0.4) ? 2 : 1;
    for (let i = 0; i < want && pool.length > 1; i++) {
      const idx = U.randInt(0, pool.length - 1);
      pool[idx].mimic = true;
      pool.splice(idx, 1);
    }
    return chests;
  },
  currentChunk() {
    const n = this.chunks ? this.chunks.length : 0;
    if (!n) return 0;
    const cols = this.cols || 1, rows = this.rows || 1;
    const c = U.clamp(Math.floor(this.player.x / this.chunkW), 0, cols - 1);
    const r = U.clamp(Math.floor(this.player.y / this.chunkH), 0, rows - 1);
    return U.clamp(r * cols + c, 0, n - 1);
  },
  // 按块激活：玩家处于某块或其四邻块时，一次性放出该块的怪群
  updateChunkSpawns() {
    const cur = this.currentChunk();
    if (cur !== this._lastChunk) {
      this._lastChunk = cur;
      this.updateWaveText();
    }
    const curCh = this.chunks[cur];
    // 出生安全区：玩家还没走远时完全不刷怪，先留出一段无战斗的缓冲；
    // 之后也只激活玩家附近的怪群，避免隔着半张地图提前出笼
    const safe = this.spawnPoint || this.player;
    const walked = U.dist(this.player, safe);
    const SAFE_LEFT = 300;   // 离开出生点这么远才算“走了一段”
    const NEAR = 1200;       // 玩家逼近到这个距离内，怪群才激活
    // 场上怪太多时暂缓激活新怪群，等清掉一批再放，避免越打越多拖垮帧率
    let alive = 0;
    for (const m of this.monsters) if (!m.dead && !m.boss) alive++;
    const CAP = 44;
    for (const p of this.chunkPacks) {
      if (p.spawned) continue;
      if (walked < SAFE_LEFT && !this.autoMode) continue;
      // 同一个怪群到玩家的距离一帧只算一次，下面激活 / 贴脸 / 密室判定共用
      const pd = U.dist(p, this.player);
      if (pd > NEAR) continue;
      // 不贴脸刷怪：玩家就站在怪群位置上时先不激活，等拉开距离再说。
      // 自动战斗没有“等玩家走开”的耐心（AI 会把出生点当成落脚点静止），
      // 所以自动模式下照常激活，但把出生点挪到玩家外侧，避免糊脸弹出；
      // 正在混战时仍然不激活，防止凭空在角色身边围出一圈怪
      if (pd < 260) {
        // 开局 10 秒内不贴脸激活：出生点周围的怪群先留着，避免一进图就被围杀
        if (!this.autoMode || (this.time || 0) < 10) continue;
        let nearFight = false;
        for (const m of this.monsters) {
          if (!m.dead && !m.boss && U.dist(m, this.player) < 600) { nearFight = true; break; }
        }
        if (nearFight) continue;
      }
      const pch = this.chunks[p.chunk];
      // 自动战斗需要自己找怪：距离已足够近时不再限制相邻区块，
      // 否则 AI 会在“隔一个区块”的怪群前反复踱步、怪永远不激活
      if (!this.autoMode && (!pch || Math.abs(pch.col - curCh.col) + Math.abs(pch.row - curCh.row) > 1)) continue;
      // 密室守卫：必须走到门口才惊醒，避免隔墙提前拉怪
      if (p.secret && pd > 380) continue;
      // 自动模式下贴着玩家触发时，把出生中心推到 300px 外，避免怪直接糊在角色脸上
      let bx = p.x, by = p.y;
      if (pd < 260) {
        const base = U.rand(0, Math.PI * 2);
        for (let k = 0; k < 8; k++) {
          const ang = base + k * Math.PI / 4;
          const px = this.player.x + Math.cos(ang) * 300;
          const py = this.player.y + Math.sin(ang) * 300;
          if (!this.circleWall(px, py, this.player.r) && !this.circleProp(px, py, this.player.r)) {
            bx = px; by = py;
            break;
          }
        }
      }
      if (alive >= CAP) break;
      p.spawned = true;
      let slots = CAP - alive;
      // 密室：按随机方案出怪，可能是普通怪群、精英、精英+宝箱，或只有宝箱
      if (p.secret) {
        if (p.elite > 0) {
          const poolE = (this.def.elitePool && this.def.elitePool.length) ? this.def.elitePool : this.def.pool;
          for (let i = 0; i < p.elite && slots > 0; i++) {
            const ang = (i / Math.max(1, p.elite)) * Math.PI * 2 + U.rand(-0.4, 0.4);
            const pos = this.nearestFloorPoint(bx + Math.cos(ang) * 46, by + Math.sin(ang) * 46, 3) ||
              this.nearestFloorPoint(bx, by, 3) || { x: bx, y: by };
            const m = this.spawnMonster(this.pickWeatherMonster(poolE), pos.x, pos.y, false, p.chunk);
            if (m) {
              this.promoteElite(m);
              m.aggro = true;
              slots--;
              alive++;
            }
          }
          this.announce('密室守卫苏醒', 1800);
          this.addRing(p.x, p.y, 18, 120, '#d9b24a', 0.7);
          this.shake = 0.25;
        } else if (p.count > 0) {
          this.announce('密室伏兵', 1500);
        }
        const count = Math.min(slots, p.count + (this.wxPackBonus || 0) + (this.extraPerPack || 0));
        for (let i = 0; i < count; i++) {
          const pos = this.nearestFloorPoint(bx + U.rand(-46, 46), by + U.rand(-46, 46), 3) ||
            this.nearestFloorPoint(bx, by, 3) || { x: bx, y: by };
          if (this.spawnMonster(this.pickWeatherMonster(this.def.pool), pos.x, pos.y, false, p.chunk)) {
            slots--;
            alive++;
          }
        }
        continue;
      }
      // 密集怪群收得更紧，普通怪群略微散开；强风会把怪群吹得更散
      const spread = (p.dense ? 30 : 46) * (this.wxSpreadMul || 1);
      const count = Math.min(slots, p.count + (this.wxPackBonus || 0) + (this.extraPerPack || 0));
      for (let i = 0; i < count; i++) {
        const pos = this.nearestFloorPoint(bx + U.rand(-spread, spread), by + U.rand(-spread, spread), 3) ||
          this.nearestFloorPoint(bx, by, 3) || { x: bx, y: by };
        if (this.spawnMonster(this.pickWeatherMonster(this.def.pool), pos.x, pos.y, false, p.chunk)) {
          slots--;
          alive++;
        }
      }
      // 精英：图鉴大造型，按块额外投放一只（带专属招式读条）
      const eliteChance = (this.tune ? this.tune.eliteChance : 0.3) + (this.wxEliteBonus || 0);
      if (slots > 0 && this.def.elitePool && this.def.elitePool.length && U.chance(eliteChance)) {
        const epos = this.nearestFloorPoint(bx + U.rand(-30, 30), by + U.rand(-30, 30), 3) ||
          this.nearestFloorPoint(bx, by, 3) || { x: bx, y: by };
        const m = this.spawnMonster(this.pickWeatherMonster(this.def.elitePool), epos.x, epos.y, false, p.chunk);
        if (m) {
          this.promoteElite(m);
          slots--;
          alive++;
        }
      }
    }
    // 首领改由击杀数触发；仅在没有怪群门槛的异常地图上，踏入首领场地兜底触发
    if (this.phase === 'wave' && !this.bossKillGoal && cur === this.arenaChunk) {
      this.phase = 'bossIntro';
      this.phaseTimer = 1.5;
      this.announce('首领即将降临', 1600);
      this.updateWaveText();
    }
  },
  updateChests(dt) {
    for (const c of this.chests || []) {
      c.t += dt;
      if (c.opened || U.dist(this.player, c) > 52 + this.player.r) continue;
      c.opened = true;
      if (c.mimic) this.triggerMimic(c);
      else this.openChest(c);
    }
  },
  // 宝箱伏击：宝箱消失，原地现形为本关小怪组成的精英，立即进入战斗
  triggerMimic(c) {
    const i = this.chests.indexOf(c);
    if (i >= 0) this.chests.splice(i, 1);
    const pos = this.nearestFloorPoint(c.x, c.y, 3) || { x: c.x, y: c.y };
    const pool = (this.def.pool || []).filter((id) => DG.data.monsters[id] && !DG.data.monsters[id].boss);
    const id = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'skeleton';
    const m = this.spawnMonster(id, pos.x, pos.y, false, c.chunk);
    if (!m) return null;
    this.promoteElite(m);
    m.aggro = true;
    m.x = pos.x; m.y = pos.y;
    this.addBurst(c.x, c.y - 16, '#ffd76a', 16);
    this.addRing(c.x, c.y, 14, 96, '#d9b24a', 0.6);
    this.addFloater(c.x, c.y - 46, '有埋伏！', '#ffd76a', 26);
    this.announce('宝箱伏击', 1500);
    this.shake = 0.3;
    return m;
  },
  openChest(c) {
    this.addBurst(c.x, c.y, '#e3c88e', 12);
    this.addRing(c.x, c.y, 12, 70, '#e3c88e', 0.5);
    this.announce('发现宝箱', 1200);
    const ilvl = this.def.ilvl;
    const gold = Math.round(U.rand(30, 70) * (1 + (ilvl - 1) * 0.5));
    this.goldEarned += gold;
    this.addFloater(c.x, c.y - 32, `+${gold} 金币`, '#e3c88e', 20);
    const n = U.chance(0.45) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const item = DG.items.generate(ilvl + 1, { minRarity: 'magic', cls: this.char && this.char.cls });
      const pos = this.nearestFloorPoint(c.x + U.rand(-34, 34), c.y + U.rand(-30, 30), 3) ||
        { x: c.x, y: c.y };
      this.drops.push({ kind: 'item', item, x: pos.x, y: pos.y, r: 12, t: 0 });
    }
    if (U.chance(0.5)) {
      const pos = this.nearestFloorPoint(c.x + U.rand(-30, 30), c.y + U.rand(-30, 30), 3) ||
        { x: c.x, y: c.y };
      this.drops.push({ kind: 'orb', x: pos.x, y: pos.y, r: 10, t: 0 });
    }
  },
  // 精英化：图鉴大造型固定为精英，体型与数值按固定倍率提升
  promoteElite(m) {
    if (!m) return m;
    const t = DG.data.monsters[m.typeId] || {};
    if (!m.elite) {
      const oldR = m.r;
      const pos = this.findMonsterSpawnPoint(m.x, m.y, oldR * 1.25, m);
      m.elite = true;
      m.r *= 1.25;
      if (pos) {
        m.x = pos.x;
        m.y = pos.y;
        m.spawnX = pos.x;
        m.spawnY = pos.y;
      }
      const tune = this.tune || DG.data.stageTuning(this.def);
      m.maxHp = Math.round(m.maxHp * tune.eliteHp);
      m.hp = m.maxHp;
      m.dmg = Math.round(m.dmg * tune.eliteDmg);
      m.xp = Math.round(m.xp * 2.5);
      m.gold = Math.round(m.gold * 2);
    }
    m.name = '精英 · ' + (t.name || m.name);
    this.applyEliteAffixes(m);
    return m;
  },
  findMonsterSpawnPoint(x, y, r, ignore, ignoreMonsters) {
    const clear = (px, py) => {
      if (this.circleWall(px, py, r)) return false;
      if (!ignoreMonsters) {
        for (const other of this.monsters) {
          if (other.dead || other === ignore) continue;
          const min = r + other.r + 10;
          if (U.dist2(px, py, other.x, other.y) < min) return false;
        }
      }
      return true;
    };
    if (clear(x, y)) return { x, y };
    for (let radius = 28; radius <= 224; radius += 28) {
      const count = radius < 84 ? 10 : 16;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count + (radius % 56 ? 0.19 : 0);
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (clear(px, py)) return { x: px, y: py };
      }
    }
    return null;
  },
  // 场景明度（0~1）：取当前地貌地面的感知亮度，用于怪物配色匹配
  sceneLuma() {
    if (this._sceneLuma != null) return this._sceneLuma;
    const T = DG.scenes.dungeon.terrain;
    const st = this.mapStyle || (T.STYLES && T.STYLES[this.def.mapStyle]) || (T.STYLES && T.STYLES.grove) || {};
    const hex = st.ground || (st.floor && st.floor[0]) || '#1a1a1a';
    this._sceneLuma = this.colorLuma(hex);
    return this._sceneLuma;
  },
  colorLuma(hex) {
    if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return 0.5;
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  },
  monsterLuma(id) {
    if (!this._monsterLumaCache) this._monsterLumaCache = {};
    const hit = this._monsterLumaCache[id];
    if (hit != null) return hit;
    const t = DG.data.monsters[id];
    const v = t ? this.colorLuma(t.color) : 0.5;
    this._monsterLumaCache[id] = v;
    return v;
  },
  // 配色匹配：暗场景不投放蓝白等高亮怪物；亮场景优先投放高亮怪物。
  // 只影响“选哪一种怪”，不改怪物数量与刷新密度。
  toneWeight(id) {
    const scene = this.sceneLuma();
    const luma = this.monsterLuma(id);
    if (scene <= 0.23 && luma >= 0.56) return 0;
    if (scene >= 0.24) {
      if (luma >= 0.56) return 1.9;
      if (luma <= 0.34) return 0.7;
    }
    return 1;
  },
  // 按天气倾向加权选怪：偏好类型 2.6 倍权重，其余保留随机性；
  // 再叠加场景明度权重，避免亮色怪物出现在过暗的场景里。
  pickWeatherMonster(pool) {
    if (!pool || !pool.length) return null;
    const bias = this.wxSpawnBias;
    let total = 0;
    const weights = new Array(pool.length);
    for (let i = 0; i < pool.length; i++) {
      let w = bias && bias.indexOf(pool[i]) >= 0 ? 2.6 : 1;
      w *= this.toneWeight(pool[i]);
      weights[i] = w;
      total += w;
    }
    // 整池都不匹配（极少见）：退到与场景明度最接近的一只，保证怪物不会断档
    if (total <= 0) {
      const scene = this.sceneLuma();
      let best = pool[0], bestD = Infinity;
      for (const id of pool) {
        const d = Math.abs(this.monsterLuma(id) - scene);
        if (d < bestD) { bestD = d; best = id; }
      }
      return best;
    }
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  },
  spawnMonster(typeId, x, y, isBoss, chunkIndex, ignoreMonsters) {
    const t = DG.data.monsters[typeId];
    // 配置写错时不再抛异常卡死战斗：跳过该次生成并留下可定位的告警
    if (!t) {
      if (!this._badMonsterWarned) this._badMonsterWarned = {};
      if (!this._badMonsterWarned[typeId]) {
        this._badMonsterWarned[typeId] = true;
        console.warn('[dungeon] 未知怪物模板：', typeId);
      }
      return null;
    }
    const tune = this.tune || DG.data.stageTuning(this.def);
    const ilvl = this.def.ilvl;
    const bossMon = !!(t.boss || isBoss);
    let hp = t.hp * (bossMon ? tune.bossHp : tune.mobHp);
    let dmg = t.dmg * (bossMon ? tune.bossDmg : tune.mobDmg);
    let elite = false;
    if (!bossMon && U.chance(tune.randomElite)) {
      elite = true;
      hp *= tune.eliteHp;
      dmg *= tune.eliteDmg;
    }
    const radius = t.r * (elite ? 1.25 : 1);
    const spawn = this.findMonsterSpawnPoint(x, y, radius, null, ignoreMonsters);
    if (!spawn) return null;

    const m = {
      id: U.uid(),
      typeId,
      name: (elite ? '精英 · ' : '') + t.name,
      shape: t.shape,
      color: t.color,
      r: radius,
      x: spawn.x, y: spawn.y,
      spawnX: spawn.x,
      spawnY: spawn.y,
      chunkIndex: chunkIndex == null ? null : chunkIndex,
      spawnTime: this.time,
      aggro: !!(t.boss || isBoss),
      wanderTimer: U.rand(0.5, 2),
      wanderAngle: U.rand(0, Math.PI * 2),
      hp: Math.round(hp),
      maxHp: Math.round(hp),
      dmg: Math.round(dmg),
      speed: t.speed,
      // 经验按新难度曲线成长：正常推图即可跟上技能解锁与推荐等级
      xp: Math.round(t.xp * tune.xp * (elite ? 2.5 : 1)),
      gold: Math.round(U.rand(t.gold[0], t.gold[1]) * (1 + (ilvl - 1) * 0.5) * (elite ? 2 : 1)),
      attackRange: t.attackRange,
      attackCd: t.attackCd,
      atkTimer: U.rand(0.2, 0.8),
      ranged: !!t.ranged,
      shootCd: t.shootCd || 0,
      shootTimer: U.rand(0.6, 1.6),
      projSpeed: t.projectileSpeed || 250,
      projColor: t.projColor || '#b79be0',
      castTime: t.castTime || 0,
      boss: !!t.boss,
      elite,
      slow: 0,
      slowFactor: 0,
      flash: 0,
      ringTimer: t.ringCd || 0,
      ringCd: t.ringCd || 0,
      summonTimer: t.summonCd || 0,
      summonCd: t.summonCd || 0,
      // 分件表现：所有怪物通用，非分件怪不使用
      art: t.art || null,
      artScale: t.artScale || 1,
      fxColor: t.fxColor || '#cbe8a4',
      seed: U.random() * Math.PI * 2,
      facing: 0,
      moving: false,
      walkPhase: 0,
      shotAnim: 0,
      action: null,
      dead: false
    };

    // 首领表现与招式模组
    if (t.boss) {
      m.tint = t.tint || null;
      m.glow = t.glow || null;
      m.patterns = (t.patterns || []).map(a => Object.assign({ timer: 0 }, a));
      m.preferRange = t.preferRange || 130;
      m.facing = U.angle(m, this.player);
      m.aiCd = 0.6;
      m.cast = null;
      m.enraged = false;
      m.ambTimer = U.rand(0.1, 0.5);
    }

    this.monsters.push(m);
    // 随机精英同样吃本关词缀（词缀在属性算完之后再叠，避免倍率互相污染）
    if (elite) this.applyEliteAffixes(m);
    return m;
  },
  spawnBoss() {
    // 条件满足后首领在玩家附近（但不贴脸）的房间现身
    // 首领由关卡配置按章轮换投放（见 DG.data.dungeons 的 bossId），
    // 相邻关卡不会重复，所有关卡都优先使用已拆件重做的首领
    const bossId = this.def.bossId;
    const bt = DG.data.monsters[bossId];
    const br = (bt && bt.r) || 48;
    // 首领降临瞬间会震死全部小怪，允许与残余小怪重叠；
    // 落点按首领真实体型多次重试，避免因贴墙判定失败而中断关卡
    let boss = null;
    for (let i = 0; i < 6 && !boss; i++) {
      const pos = this.pickBossSpawn(br);
      boss = this.spawnMonster(bossId, pos.x, pos.y, true, null, true);
    }
    if (!boss) {
      // 首领配置缺失时直接结算撤离，避免流程卡在 bossIntro
      this.announce('首领未能降临，正在撤离……', 1600);
      this.ending = true;
      this.victory = false;
      this.finishTimer = 1.2;
      return;
    }
    const dir = DG.scenes.dungeon.dirName(U.angle(this.player, boss));
    // 同一首领重复出场：二阶段（更高血量与更早狂暴），第三章后再加新招式
    this.applyBossVariant(boss);
    if (DG.audio) DG.audio.playBgm('boss');
    this.$bossName.textContent = boss.name;
    this.$bossWrap.classList.remove('hidden');
    this.announce(`${boss.name} 在${dir}方现身`, 2600);
    this.addRing(boss.x, boss.y, 24, 170, '#d98b9d', 0.9);
    this.addRing(boss.x, boss.y, 10, 90, '#f0c0b0', 0.7);
    this.shake = 0.5;
    this.bossShockwave(boss);
    this.updateWaveText();
  },
  // 首领降临：红屏预警 + 震荡波清场（小怪瞬间震死，无掉落、无经验、不计击杀）
  bossShockwave(boss) {
    this.bossFlash = 1.6;
    this.shake = Math.max(this.shake, 0.8);
    // 敌方残留弹幕一并震散
    this.projectiles = this.projectiles.filter(p => p.team !== 'enemy');
    const touched = [];
    for (const m of this.monsters) {
      if (m.boss || m.dead) continue;
      m.hp = 0;
      m.dead = true;
      if (m.chunkIndex != null && touched.indexOf(m.chunkIndex) < 0) touched.push(m.chunkIndex);
      this.addBurst(m.x, m.y - m.r * 0.3, m.color || '#c6554e', 4);
      // 震死同样爆骨：首领登场时整片小怪一起炸成骨屑
      this.spawnBoneBurst(m);
      this.effects.push({
        kind: 'peaPuff', x: m.x, y: m.y - m.r * 0.5,
        r0: 5, r1: m.r * 2.4, color: m.fxColor || m.color || '#c6554e',
        life: 0.45, max: 0.45
      });
    }
    // 区块清空状态与正常击杀保持一致
    for (const ci of touched) {
      const ch = this.chunks[ci];
      if (!ch || ch.cleared) continue;
      const packs = this.chunkPacks.filter(p => p.chunk === ci);
      const alive = this.monsters.some(o => !o.dead && o.chunkIndex === ci);
      if (alive || !packs.length || !packs.every(p => p.spawned)) continue;
      ch.cleared = true;
    }
    // 以首领为圆心的红色冲击波
    this.effects.push({
      kind: 'quakeRing', x: boss.x, y: boss.y, radius: 440,
      color: '#e0483c', life: 0.5, max: 0.5
    });
    this.addRing(boss.x, boss.y, 18, 260, '#ff8a6a', 0.42);
    this.addRing(boss.x, boss.y, 70, 500, '#c23327', 0.62);
  },
  updateWaves(dt) {
    // 波次刷怪已由按块激活取代，这里只保留首领登场倒计时
    if (this.phase !== 'bossIntro') return;
    this.phaseTimer -= dt;
    if (this.phaseTimer <= 0) {
      this.phase = 'boss';
      this.spawnBoss();
    }
  }
  });
})();
