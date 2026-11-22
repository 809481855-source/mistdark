/* 副本战斗 · 血迹层：按受伤阶段在怪物脚下留下贴地血迹，永久压在实体之下 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  // 三组血迹序列：进入副本时随机一组，同一张地图内保持同一种美术风格
  // 0 溅血：轻薄主斑 + 大量飞溅小点
  // 1 血斑：深色厚团，边缘多瓣，极少飞溅
  // 2 血痕：带拖尾与细长血丝，偏玫瑰色
  const STYLES = [
    { main: '#6e2223', core: '#4f1618', light: '#873634', droplets: 8, seed: 11 },
    { main: '#521214', core: '#3a0c0e', light: '#6b1f1f', droplets: 3, seed: 23 },
    { main: '#73302e', core: '#571e20', light: '#8c4c47', droplets: 6, seed: 37 }
  ];

  // 4 个伤重阶段对应的地面半径（世界像素）
  const STAGE_R = [0, 14, 24, 36, 50];
  const LIFE = 2.0;         // 完整显示 2 秒
  const FADE = 0.8;         // 之后 0.8 秒渐隐
  const MAX = 96;           // 同屏血迹上限，超出丢弃最旧的

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // 确定性随机：同一组精灵每次烘焙完全一致
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  // 不规则闭合血团
  function blobPath(g, r, wob, n, rnd) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 - wob + rnd() * wob * 2);
      pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    }
    const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const first = mid(pts[n - 1], pts[0]);
    g.beginPath();
    g.moveTo(first.x, first.y);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const m = mid(p, q);
      g.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
    g.closePath();
  }
  // 预烘焙一块血迹精灵：只做一次，运行时只 drawImage
  function makeSprite(def, stage, variant) {
    const R = STAGE_R[stage];
    const size = Math.ceil(R * 3.7);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const half = size / 2;
    g.translate(half, half);
    g.scale(1, 0.62);           // 地面透视压扁
    const rnd = rng(def.seed * 977 + stage * 5171 + variant * 7919);

    // 边缘软晕：让血迹融进地面，而不是像贴纸
    const halo = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.35);
    halo.addColorStop(0, hexA(def.main, 0.18));
    halo.addColorStop(1, hexA(def.main, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, R * 1.35, 0, Math.PI * 2);
    g.fill();

    if (def.seed === 37) {
      // 血痕组：一条拉长的血带 + 细血丝，方向随机
      g.save();
      g.rotate(rnd() * Math.PI * 2);
      g.fillStyle = def.main;
      g.beginPath();
      g.moveTo(-R * 0.28, -R * 0.20);
      g.quadraticCurveTo(R * 0.55, -R * 0.34, R * 1.05, -R * 0.02);
      g.quadraticCurveTo(R * 0.62, R * 0.22, -R * 0.22, R * 0.18);
      g.closePath();
      g.fill();
      // 拖尾血丝
      g.strokeStyle = hexA(def.main, 0.85);
      g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const y0 = (rnd() - 0.5) * R * 0.5;
        g.lineWidth = R * (0.05 + rnd() * 0.05);
        g.beginPath();
        g.moveTo(R * 0.35, y0);
        g.quadraticCurveTo(R * 1.0, y0 + (rnd() - 0.5) * R * 0.4,
          R * (1.25 + rnd() * 0.35), y0 + (rnd() - 0.5) * R * 0.55);
        g.stroke();
      }
      g.restore();
    } else {
      // 主血团：血斑组更厚实、边缘更碎
      const thick = def.seed === 23;
      blobPath(g, R * (thick ? 0.82 : 0.70), thick ? 0.30 : 0.22,
        thick ? 14 : 11, rnd);
      g.fillStyle = def.main;
      g.fill();
      // 局部加深：受光不均的淤积感
      g.globalAlpha = 0.55;
      blobPath(g, R * (thick ? 0.52 : 0.44), 0.34, 9, rnd);
      g.fillStyle = def.core;
      g.fill();
      g.globalAlpha = 1;
      // 边缘挑一点亮色，暗地上更容易读出血迹轮廓
      g.strokeStyle = hexA(def.light, 0.13);
      g.lineWidth = Math.max(1, R * 0.05);
      g.stroke();
    }

    // 飞溅小点：距离越远越小，血痕组沿拖尾方向聚拢
    const count = def.droplets + (stage - 1);
    const bias = def.seed === 37 ? rnd() * Math.PI * 2 : null;
    for (let i = 0; i < count; i++) {
      const a = bias == null ? rnd() * Math.PI * 2 : bias + (rnd() - 0.5) * 1.1;
      const dist = R * (1.02 + rnd() * 0.72);
      const rr = R * (0.045 + rnd() * 0.10);
      const x = Math.cos(a) * dist;
      const y = Math.sin(a) * dist;
      g.fillStyle = hexA(i % 3 === 0 ? def.light : def.main, 0.9);
      g.beginPath();
      g.ellipse(x, y, rr, rr * (0.7 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
      g.fill();
      // 靠近主斑的大血滴拉出小尾巴
      if (i < 2 && rr > R * 0.09) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - Math.cos(a) * rr * 2.2, y - Math.sin(a) * rr * 2.2);
        g.lineWidth = rr * 0.8;
        g.strokeStyle = hexA(def.main, 0.8);
        g.stroke();
      }
    }
    return c;
  }

  // 血迹精灵只取决于画风：跨副本共享，重复进图时不再重新烘焙 8 张画布
  const SPRITE_CACHE = [];
  function bloodSprites(style) {
    let arr = SPRITE_CACHE[style];
    if (arr) return arr;
    arr = [];
    const def = STYLES[style];
    for (let st = 1; st <= 4; st++) {
      for (let va = 0; va < 2; va++) {
        arr[st * 2 + va] = makeSprite(def, st, va);
      }
    }
    SPRITE_CACHE[style] = arr;
    return arr;
  }

  Object.assign(DG.scenes.dungeon.prototype, {
    // 进入副本时确定本图的血迹序列，并取用预烘焙好的精灵
    initBlood() {
      this.bloodStyle = U.randInt(0, 2);
      this.blood = [];
      this._bloodSprites = bloodSprites(this.bloodStyle);
    },
    // 受击飞溅：血珠从受击点沿攻击反方向抛出，带重力，落地前消散。
    // 数量、速度、粒径随伤害占比与暴击提升，与脚下血痕同一套配色
    sprayBlood(m, dmg, crit) {
      if (!m || this.finished || !this.blood) return;
      const def = STYLES[this.bloodStyle];
      const ratio = U.clamp(dmg / m.maxHp, 0.02, 0.6);
      const stage = Math.min(4, 1 + Math.floor(ratio * 4));
      const dir = U.angle(this.player, m);   // 由玩家指向怪物，血向怪物外侧溅
      const n = 3 + stage * 2 + (crit ? 3 : 0) + (m.boss ? 3 : (m.elite ? 1 : 0));
      const px = m.x, py = m.y - m.r * 0.75;
      for (let i = 0; i < n; i++) {
        const a = dir + U.rand(-0.95, 0.95);
        const sp = U.rand(110, 290) * (0.82 + stage * 0.1);
        // 前几滴是大血珠，后段是细碎飞沫
        const big = i < 3 ? 1.65 : 1;
        this.effects.push({
          kind: 'blood',
          x: px + U.rand(-5, 5),
          y: py + U.rand(-7, 7),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - U.rand(30, 110),
          r: (U.rand(1.5, 2.7) + (stage - 1) * 0.42) * big,
          color: i % 3 === 0 ? def.light : def.main,
          life: U.rand(0.28, 0.5),
          max: 0.5
        });
      }
    },
    // 劈砍专属：沿刀锋切向甩出一片横向血幕，比普通受击喷溅更厚更远。
    // 与 sprayBlood 各自独立发射，致死时也会和死亡迸血同时出现
    slashBlood(m, angle, dmg, crit) {
      if (!m || this.finished || !this.blood) return;
      const def = STYLES[this.bloodStyle];
      const ratio = U.clamp(dmg / m.maxHp, 0.05, 0.75);
      const stage = Math.min(4, 1 + Math.floor(ratio * 4));
      const base = (typeof angle === 'number') ? angle : U.angle(this.player, m);
      // 血沿刃口两侧甩出：以刀锋切向为主轴铺开，读起来像被劈开的口子
      const side = Math.random() < 0.5 ? 1 : -1;
      const axis = base + side * (Math.PI / 2);
      const n = 7 + stage * 3 + (crit ? 4 : 0) + (m.boss ? 4 : (m.elite ? 2 : 0));
      const px = m.x, py = m.y - m.r * 0.55;
      for (let i = 0; i < n; i++) {
        const spread = (i / (n - 1 || 1) - 0.5) * 2;   // -1..1 均匀铺满扇形
        const a = axis + spread * 1.0;
        const sp = U.rand(150, 380) * (0.85 + stage * 0.09);
        this.effects.push({
          kind: 'blood',
          x: px + Math.cos(a) * m.r * 0.35,
          y: py + Math.sin(a) * m.r * 0.35,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - U.rand(20, 90),
          r: U.rand(2.0, 3.4) + (stage - 1) * 0.45,
          color: i % 3 === 0 ? def.light : def.main,
          life: U.rand(0.30, 0.55),
          max: 0.55
        });
      }
      // 少量慢速重血珠：大颗、下落更沉，补足“血会掉到地上”的重量感
      const heavy = 2 + stage;
      for (let i = 0; i < heavy; i++) {
        const a = axis + U.rand(-0.7, 0.7);
        this.effects.push({
          kind: 'blood',
          x: px + U.rand(-m.r * 0.4, m.r * 0.4),
          y: py + U.rand(-m.r * 0.4, m.r * 0.4),
          vx: Math.cos(a) * U.rand(50, 130),
          vy: Math.sin(a) * U.rand(30, 80) - 20,
          r: U.rand(3.0, 4.4),
          color: i === 0 ? def.light : def.main,
          life: U.rand(0.5, 0.75),
          max: 0.75
        });
      }
    },
    // 出血状态：中刀后一段时间从伤口持续滴血，纯表现，不结算伤害
    bleedTick(m, dt) {
      if (!m.bleedT || m.bleedT <= 0 || !this.blood) return;
      m.bleedT -= dt;
      m.bleedAcc = (m.bleedAcc || 0) + dt;
      if (m.bleedAcc < 0.14) return;
      m.bleedAcc = 0;
      const def = STYLES[this.bloodStyle];
      const k = Math.max(0.12, m.bleedT / 1.4);
      const x = m.x + U.rand(-m.r * 0.5, m.r * 0.5);
      const y = m.y - m.r * 0.5;
      const n = m.bleedT > 0.7 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        this.effects.push({
          kind: 'blood',
          x: x + U.rand(-3, 3), y,
          vx: U.rand(-32, 32),
          vy: U.rand(-26, 24),
          r: U.rand(1.2, 2.2) * (0.7 + k * 0.5),
          color: i === 0 ? def.light : def.main,
          life: U.rand(0.30, 0.50),
          max: 0.50
        });
      }
    },
    // 受伤时在怪物脚下留血迹：阶段随伤势提升，只有变大时才换新块
    addBlood(m) {
      if (!m || this.finished || !this.blood) return;
      const ratio = 1 - m.hp / m.maxHp;
      if (ratio <= 0) return;
      const stage = Math.min(4, 1 + Math.floor(ratio * 4));
      const last = m.bloodStage || 0;
      // 同一档位不重复铺新块，1.1 秒后会让旧块重新显影
      if (stage <= last && this.time - (m.bloodT || -99) < 1.1) return;
      m.bloodStage = Math.max(stage, last);
      m.bloodT = this.time;

      const sc = U.clamp(m.r / 16, 0.85, 2.2);
      const r = STAGE_R[stage] * sc;
      const x = m.x;
      const y = m.y + m.r * 0.6;      // 落在脚下，始终在怪物下层
      // 成堆合并：附近已有血迹时只保留最大的一块，绝不叠出一怪一块
      let best = null, bestD = Infinity;
      for (const d of this.blood) {
        const dd = U.dist(d, { x, y });
        if (dd < Math.max(28, (d.r + r) * 0.62) && dd < bestD) {
          bestD = dd;
          best = d;
        }
      }
      if (best) {
        best.age = 0;
        const bigger = stage * 1000 + sc * 10 >= best.stage * 1000 + best.sc * 10;
        if (bigger) {
          best.x = x;
          best.y = y;
          best.r = r;
          best.sc = sc;
          best.stage = stage;
          best.variant = U.randInt(0, 1);
          best.rot = U.rand(-0.22, 0.22);
        }
        return;
      }
      this.blood.push({
        x, y, r, sc, stage,
        variant: U.randInt(0, 1),
        rot: U.rand(-0.25, 0.25),
        age: 0
      });
      if (this.blood.length > MAX) this.blood.shift();
    },
    updateBlood(dt) {
      const list = this.blood;
      if (!list) return;
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].age += dt;
        if (list[i].age > LIFE + FADE) list.splice(i, 1);
      }
    },
    // 绘制顺序固定在地面之后、掉落与实体之前，所有怪物永远盖在血迹上
    drawBlood(ctx) {
      const list = this.blood;
      if (!list || !list.length || !this._bloodSprites) return;
      const v = this.viewRect(120);
      for (const b of list) {
        if (b.x < v.l || b.x > v.r || b.y < v.t || b.y > v.b) continue;
        const sp = this._bloodSprites[b.stage * 2 + b.variant];
        if (!sp) continue;
        let a = 0.78;
        if (b.age > LIFE) {
          a *= 1 - (b.age - LIFE) / FADE;
          if (a <= 0.01) continue;
        }
        const half = b.r * 1.85;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.drawImage(sp, -half, -half, half * 2, half * 2);
        ctx.restore();
      }
    }
  });
})();
