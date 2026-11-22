/* 副本战斗 · 场地层：每 5 关的场地机制 + 天气留下的可利用地形
 * 设计目标：场地规则对双方都生效，但玩家能主动利用（借火清怪、把怪引进血泊/陷阱、
 * 借暴雪脱战、藏草伏击）。所有区域都在玩家附近按需生成，数量有上限，
 * 逐帧只做距离判断与少量圆形绘制，不增加寻路或额外实体。
 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H } = DG.scenes.dungeon.size;

  // 每 5 关一场地机制，按地图主题分配；同主题连续出现时轮换成下一种
  const FIELD_BY_STYLE = {
    grove: 'grass',
    savanna: 'grass',
    autumn: 'maple',
    crypt: 'maple',
    abyss: 'blood',
    snowfield: 'blizzard',
    inferno: 'fire',
    hell: 'fire'
  };
  const FIELD_CYCLE = ['fire', 'blood', 'blizzard', 'grass', 'maple'];
  const FIELDS = {
    fire: { name: '收缩火圈', desc: '火圈不断收紧，圈外持续灼烧；把怪留在圈外可以借火清场' },
    blood: { name: '血雨减速区', desc: '血泊里怪物减速 50%，玩家只减速 15%，可以绕着血泊风筝' },
    blizzard: { name: '暴雪降视野', desc: '风雪压低视野与索敌半径，远离的怪物会跟丢' },
    grass: { name: '草丛伏击', desc: '藏进草丛可以脱战，现身第一击额外造成 80% 伤害' },
    maple: { name: '枫叶掩埋陷阱', desc: '踩中枫叶堆会引爆，把怪物引上去可以借陷阱杀伤' }
  };

  // 天气地形：由天气留下的、可被玩家利用的场地规则
  const WX_ZONES = {
    rain: { kind: 'puddle', slow: 0.35, color: '#8ab4d8' },
    snow: { kind: 'puddle', slow: 0.4, color: '#cfe0f0' },
    blizzard: { kind: 'puddle', slow: 0.45, color: '#dce8f8' },
    bloodrain: { kind: 'blood', slow: 0.4, dps: 0.012, color: '#c43636' },
    wind: { kind: 'windlane', slow: 0.22, boost: 1.15, color: '#cfc7a8' },
    purplewind: { kind: 'ember', dps: 0.02, color: '#c68cf6' },
    grasswind: { kind: 'grass', slow: 0.3, color: '#7cc98a' },
    sandstorm: { kind: 'quicksand', slow: 0.5, stun: 0.5, color: '#d8b678' },
    maplefall: { kind: 'trap', dmg: 0.08, color: '#d9822b' }
  };

  function rgba(hex, a) {
    if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function fieldKindFor(def) {
    return FIELD_BY_STYLE[(def && def.mapStyle) || 'grove'] || 'fire';
  }

  Object.assign(DG.scenes.dungeon.prototype, {
    // 进场时定一次：场地机制（仅 5 的倍数关）+ 天气地形（每关都有）
    rollField() {
      this.field = null;
      this.fieldZones = [];
      this.fieldStealth = false;
      this.fieldReveal = 0;
      this.fieldSightMul = 1;
      this.fieldGrassHidden = false;
      this.zoneHidden = false;
      this.fieldZoneBoost = 1;
      this.playerSlowT = 0;
      this.playerSlowMul = 1;
      this.wxZones = [];
      this.wxZoneT = U.rand(4, 7);

      const idx = (this.def && this.def.index) || 0;
      if (!idx || idx % 5 !== 0) return null;
      // 顺序推演本章每一步的场地：同一场地不在相邻两关重复，
      // 避免一个章节连着刷同一种机制
      const kinds = {};
      for (let i = 5; i <= idx; i += 5) {
        const d = DG.data.dungeons[i - 1];
        if (!d) continue;
        let k = fieldKindFor(d);
        const recent = [kinds[i - 10], kinds[i - 5]];
        let guard = 0;
        while (recent.indexOf(k) >= 0 && guard < FIELD_CYCLE.length) {
          k = FIELD_CYCLE[(FIELD_CYCLE.indexOf(k) + 1) % FIELD_CYCLE.length];
          guard++;
        }
        kinds[i] = k;
      }
      const kind = kinds[idx] || fieldKindFor(this.def);
      const meta = FIELDS[kind];
      this.field = {
        kind,
        name: meta.name,
        desc: meta.desc,
        timer: 4,
        ring: null,
        pools: [],
        patches: [],
        piles: []
      };
      if (kind === 'blizzard') this.fieldSightMul = 0.45;
      return this.field;
    },

    updateField(dt) {
      if (this.finished || this.paused) return;
      if (this.playerSlowT > 0) {
        this.playerSlowT -= dt;
        if (this.playerSlowT <= 0) { this.playerSlowT = 0; this.playerSlowMul = 1; }
      }
      if (this.fieldReveal > 0) this.fieldReveal = Math.max(0, this.fieldReveal - dt);
      this.updateWeatherZones(dt);
      const f = this.field;
      if (!f) {
        this.fieldStealth = this.zoneHidden && this.fieldReveal <= 0;
        return;
      }
      if (f.kind === 'fire') this.updateFireRing(dt, f);
      else if (f.kind === 'blood') this.updateBloodPools(dt, f);
      else if (f.kind === 'blizzard') this.updateBlizzardField(dt, f);
      else if (f.kind === 'grass') this.updateGrassField(dt, f);
      else if (f.kind === 'maple') this.updateMapleField(dt, f);
      this.fieldStealth = (this.zoneHidden || this.fieldGrassHidden) && this.fieldReveal <= 0;
    },

    // —— 火圈：以玩家当前位置为中心生成，随后持续收紧 ——
    updateFireRing(dt, f) {
      if (!f.ring) {
        f.timer -= dt;
        if (f.timer <= 0) {
          f.ring = { x: this.player.x, y: this.player.y, r: 340, t: 0, arm: 1.1, life: 8.2, tick: 0 };
          this.addRing(f.ring.x, f.ring.y, 80, 340, '#ff8a4a', 0.9);
          this.announce('火圈开始收缩', 1200);
        }
        return;
      }
      const ring = f.ring;
      ring.t += dt;
      const k = Math.max(0, ring.t - ring.arm);
      ring.r = U.lerp(340, 150, Math.min(1, k / 6.2));
      ring.tick -= dt;
      if (k > 0 && ring.tick <= 0) {
        ring.tick = 0.5;
        const p = this.player;
        if (p.hp > 0 && U.dist(p, ring) > ring.r) {
          this.hurtPlayer(Math.round(p.maxHp * 0.02));
          this.addFloater(p.x, p.y - 44, '灼烧', '#ff9a5a', 20);
        }
        for (const m of this.monsters) {
          if (m.dead || m.boss) continue;
          if (U.dist(m, ring) <= ring.r) continue;
          this.hitMonster(m, Math.max(6, Math.round(m.maxHp * 0.05)), false, { quiet: true });
          this.addBurst(m.x, m.y - m.r * 0.4, '#ff8a4a', 3);
        }
      }
      if (ring.t >= ring.life) {
        f.ring = null;
        f.timer = U.rand(11, 15);
      }
    },

    // —— 血泊：怪物减速 50%，玩家只减速 15% ——
    updateBloodPools(dt, f) {
      f.timer -= dt;
      if (f.timer <= 0 && f.pools.length < 5) {
        f.timer = U.rand(2.6, 4);
        const a = U.rand(0, Math.PI * 2);
        const d = U.rand(120, 400);
        const pos = this.nearestFloorPoint(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 3);
        if (pos) f.pools.push({ x: pos.x, y: pos.y, r: U.rand(80, 115), life: U.rand(9, 13) });
      }
      for (let i = f.pools.length - 1; i >= 0; i--) {
        const pool = f.pools[i];
        pool.life -= dt;
        if (pool.life <= 0) { f.pools.splice(i, 1); continue; }
        for (const m of this.monsters) {
          if (m.dead || m.boss) continue;
          if (U.dist(m, pool) < pool.r + m.r * 0.4) {
            m.slow = Math.max(m.slow, 0.3);
            m.slowFactor = Math.max(m.slowFactor || 0, 0.5);
          }
        }
        if (U.dist(this.player, pool) < pool.r) {
          this.playerSlowT = Math.max(this.playerSlowT, 0.3);
          this.playerSlowMul = Math.min(this.playerSlowMul, 0.85);
        }
      }
    },

    // —— 暴雪：视野与索敌同时压低，拉开距离就能脱战 ——
    updateBlizzardField(dt, f) {
      this.fieldSightMul = 0.45;
      f.timer -= dt;
      if (f.timer > 0) return;
      f.timer = 1.2;
      for (const m of this.monsters) {
        if (m.dead || m.boss || !m.aggro) continue;
        if (U.dist(m, this.player) > 460) m.aggro = false;
      }
    },

    // —— 草丛：藏进去脱战，出草第一击有伏击加成 ——
    updateGrassField(dt, f) {
      f.timer -= dt;
      if (f.timer <= 0 && f.patches.length < 9) {
        f.timer = U.rand(2.4, 3.6);
        const a = U.rand(0, Math.PI * 2);
        const d = U.rand(60, 360);
        const pos = this.nearestFloorPoint(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 3);
        if (pos) f.patches.push({ x: pos.x, y: pos.y, r: U.rand(58, 88) });
      }
      // 走远后回收，保证草丛始终长在玩家附近
      for (let i = f.patches.length - 1; i >= 0; i--) {
        if (U.dist(this.player, f.patches[i]) > 950) f.patches.splice(i, 1);
      }
      let hidden = false;
      for (const g of f.patches) {
        if (U.dist(this.player, g) < g.r) { hidden = true; break; }
      }
      this.fieldGrassHidden = hidden;
      if (hidden) {
        for (const m of this.monsters) {
          if (m.dead || m.boss) continue;
          if (U.dist(m, this.player) > 170) m.aggro = false;
        }
      }
    },

    // —— 枫叶陷阱：踩中后延迟引爆，双方都吃伤害 ——
    updateMapleField(dt, f) {
      f.timer -= dt;
      if (f.timer <= 0 && f.piles.length < 8) {
        f.timer = U.rand(2.8, 4.4);
        const a = U.rand(0, Math.PI * 2);
        const d = U.rand(70, 380);
        const pos = this.nearestFloorPoint(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 3);
        if (pos) f.piles.push({ x: pos.x, y: pos.y, r: 30, arm: 0, armed: false, life: 24 });
      }
      for (let i = f.piles.length - 1; i >= 0; i--) {
        const p = f.piles[i];
        p.life -= dt;
        if (p.life <= 0) { f.piles.splice(i, 1); continue; }
        if (!p.armed) {
          let hit = U.dist(this.player, p) < p.r + this.player.r;
          if (!hit) {
            for (const m of this.monsters) {
              if (!m.dead && !m.boss && U.dist(m, p) < p.r + m.r) { hit = true; break; }
            }
          }
          if (hit) {
            p.armed = true;
            p.arm = 0.8;
            this.addRing(p.x, p.y, p.r, p.r + 30, '#e0a03a', 0.8);
          }
        } else {
          p.arm -= dt;
          if (p.arm <= 0) {
            f.piles.splice(i, 1);
            this.explodeMaplePile(p);
          }
        }
      }
    },

    explodeMaplePile(p) {
      this.addBurst(p.x, p.y, '#e0a03a', 18);
      this.addRing(p.x, p.y, 10, 96, '#e0a03a', 0.4);
      this.shake = Math.max(this.shake, 0.16);
      const R = 86;
      if (this.player.hp > 0 && U.dist(this.player, p) < R + this.player.r) {
        this.hurtPlayer(Math.round(this.player.maxHp * 0.08));
        this.addFloater(this.player.x, this.player.y - 44, '枫叶爆裂', '#e0a03a', 20);
      }
      for (const m of this.monsters) {
        if (m.dead || m.boss) continue;
        if (U.dist(m, p) >= R + m.r) continue;
        this.hitMonster(m, Math.max(8, Math.round(m.maxHp * 0.12)), false, { quiet: true });
        m.slow = Math.max(m.slow, 0.5);
        m.slowFactor = Math.max(m.slowFactor || 0, 0.4);
        this.addBurst(m.x, m.y - m.r * 0.4, '#e0a03a', 4);
      }
    },

    // —— 天气地形：在玩家附近生成可被利用的小区域 ——
    updateWeatherZones(dt) {
      const cfg = WX_ZONES[this.weather];
      this.zoneHidden = false;
      this.fieldZoneBoost = 1;
      if (!cfg) return;
      this.wxZoneT -= dt;
      if (this.wxZoneT <= 0 && this.wxZones.length < 4) {
        this.wxZoneT = U.rand(3.2, 5.6);
        const a = U.rand(0, Math.PI * 2);
        const d = U.rand(90, 380);
        const pos = this.nearestFloorPoint(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 3);
        if (pos) {
          this.wxZones.push({
            kind: cfg.kind, x: pos.x, y: pos.y, r: U.rand(70, 110),
            life: U.rand(10, 14), tick: 0, armed: false, arm: 0
          });
        }
      }
      const p = this.player;
      for (let i = this.wxZones.length - 1; i >= 0; i--) {
        const z = this.wxZones[i];
        z.life -= dt;
        if (z.life <= 0) { this.wxZones.splice(i, 1); continue; }
        const pin = U.dist(p, z) < z.r;
        if (pin) {
          if (cfg.boost) this.fieldZoneBoost = Math.max(this.fieldZoneBoost, cfg.boost);
          if (cfg.kind === 'grass') this.zoneHidden = true;
          if (cfg.kind === 'puddle' || cfg.kind === 'blood') {
            this.playerSlowT = Math.max(this.playerSlowT, 0.3);
            this.playerSlowMul = Math.min(this.playerSlowMul, 0.9);
          }
        }
        if (cfg.kind === 'trap') {
          if (!z.armed) {
            let hit = pin;
            if (!hit) {
              for (const m of this.monsters) {
                if (!m.dead && !m.boss && U.dist(m, z) < z.r * 0.6) { hit = true; break; }
              }
            }
            if (hit) {
              z.armed = true;
              z.arm = 0.7;
              this.addRing(z.x, z.y, z.r * 0.5, z.r + 24, '#d9822b', 0.7);
            }
          } else {
            z.arm -= dt;
            if (z.arm <= 0) {
              this.wxZones.splice(i, 1);
              this.explodeMaplePile({ x: z.x, y: z.y, r: z.r });
            }
          }
          continue;
        }
        if (cfg.slow) {
          for (const m of this.monsters) {
            if (m.dead || m.boss) continue;
            if (U.dist(m, z) < z.r + m.r * 0.4) {
              m.slow = Math.max(m.slow, 0.3);
              m.slowFactor = Math.max(m.slowFactor || 0, cfg.slow);
            }
          }
        }
        if (z.tick > 0) { z.tick -= dt; continue; }
        z.tick = 1;
        if (cfg.dps) {
          for (const m of this.monsters) {
            if (m.dead || m.boss) continue;
            if (U.dist(m, z) < z.r + m.r * 0.4) {
              this.hitMonster(m, Math.max(4, Math.round(m.maxHp * cfg.dps)), false, { quiet: true });
            }
          }
        }
        if (cfg.stun) {
          for (const m of this.monsters) {
            if (m.dead || m.boss || !m.aggro) continue;
            if (U.dist(m, z) < z.r + m.r * 0.4) m.stun = Math.max(m.stun || 0, cfg.stun);
          }
        }
      }
    },

    // 地面层：火圈、血泊、草丛、枫叶堆与天气区域
    drawFieldGround(ctx) {
      const f = this.field;
      if (f) {
        if (f.kind === 'fire' && f.ring) this.drawFireRing(ctx, f.ring);
        if (f.kind === 'blood') {
          for (const pool of f.pools) this.drawGroundZone(ctx, pool, '#8e1e1c', 'blood');
        }
        if (f.kind === 'grass') {
          for (const g of f.patches) this.drawGroundZone(ctx, g, '#2f6b3f', 'grass');
        }
        if (f.kind === 'maple') {
          for (const p of f.piles) this.drawGroundZone(ctx, p, '#a8471e', p.armed ? 'trapArmed' : 'trap');
        }
      }
      const cfg = WX_ZONES[this.weather];
      if (!cfg) return;
      for (const z of this.wxZones || []) {
        this.drawGroundZone(ctx, z, cfg.color, z.armed ? 'trapArmed' : cfg.kind);
      }
    },

    drawFireRing(ctx, ring) {
      const k = Math.min(1, ring.t / ring.arm);
      ctx.save();
      // 圈内安全区淡光
      ctx.globalAlpha = 0.05 + 0.04 * k;
      ctx.fillStyle = '#ffb070';
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.fill();
      // 火墙：外圈亮、内圈暗，形成有厚度的环
      ctx.globalAlpha = 0.25 + 0.35 * k;
      ctx.strokeStyle = '#ff7a3a';
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.14 + 0.2 * k;
      ctx.strokeStyle = '#ffd08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r - 7, 0, Math.PI * 2);
      ctx.stroke();
      // 火舌：沿圆周取固定数量的点，用正弦抖动高度
      ctx.globalAlpha = 0.4 + 0.3 * k;
      ctx.fillStyle = '#ffb05a';
      const n = 28;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.time * 0.4;
        const flame = 5 + Math.sin(this.time * 9 + i * 1.7) * 4;
        ctx.fillRect(
          ring.x + Math.cos(a) * ring.r - 1.5,
          ring.y + Math.sin(a) * ring.r - flame,
          3, flame
        );
      }
      ctx.restore();
    },

    drawGroundZone(ctx, z, color, kind) {
      const v = this.viewRect(120);
      if (z.x < v.l || z.x > v.r || z.y < v.t || z.y > v.b) return;
      const r = z.r || 60;
      ctx.save();
      if (kind === 'trap' || kind === 'trapArmed') {
        // 落叶堆底层：一圈暗褐，保证在暗色地砖上也能看见
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = '#4a2410';
        ctx.beginPath();
        ctx.arc(z.x, z.y, r * 0.92, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = kind === 'trapArmed' ? 0.75 + Math.sin(this.time * 18) * 0.2 : 0.7;
        ctx.fillStyle = '#c25a20';
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + 0.4;
          ctx.beginPath();
          ctx.ellipse(z.x + Math.cos(a) * r * 0.42, z.y + Math.sin(a) * r * 0.3, r * 0.3, r * 0.17, a, 0, Math.PI * 2);
          ctx.fill();
        }
        if (kind === 'trapArmed') {
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = '#ffd08a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(z.x, z.y, r + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      // 水洼 / 血泊 / 流沙 / 风带：贴地椭圆
      ctx.globalAlpha = kind === 'blood' ? 0.3 : 0.22;
      ctx.fillStyle = rgba(color, 0.9);
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, r, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = rgba(color, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, r * 0.86, r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      // 草丛 / 风带 / 余烬加一点方向性细节
      if (kind === 'grass') {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(150,220,150,0.6)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const bx = z.x + Math.cos(a) * r * 0.62;
          const by = z.y + Math.sin(a) * r * 0.4;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.sin(this.time * 2 + i) * 4, by - 14);
          ctx.stroke();
        }
      } else if (kind === 'windlane' || kind === 'ember') {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = rgba(color, 0.9);
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const yy = z.y - r * 0.3 + i * r * 0.3;
          ctx.beginPath();
          ctx.moveTo(z.x - r * 0.7, yy);
          ctx.lineTo(z.x + r * 0.5 + Math.sin(this.time * 3 + i) * 10, yy);
          ctx.stroke();
        }
      }
      ctx.restore();
    },

    // 屏幕层：暴雪视野压制与隐匿提示
    drawFieldOverlay(ctx) {
      const f = this.field;
      const z = this.zoom || 1;
      const sx = W / 2 + (this.player.x - this.camera.x) * z;
      const sy = H / 2 + (this.player.y - this.camera.y) * z;
      if (f && f.kind === 'blizzard') {
        const rad = 330 * z;
        const g = ctx.createRadialGradient(sx, sy, rad * 0.4, sx, sy, rad * 1.5);
        g.addColorStop(0, 'rgba(10,18,30,0)');
        g.addColorStop(0.45, 'rgba(10,18,30,0.12)');
        g.addColorStop(0.75, 'rgba(8,14,26,0.55)');
        g.addColorStop(1, 'rgba(6,10,20,0.9)');
        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      if (this.fieldStealth) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(this.time * 4) * 0.15;
        ctx.fillStyle = '#a8e0a0';
        ctx.font = '600 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('隐匿', sx, sy - 78 * z);
        ctx.restore();
      }
    }
  });

  DG.scenes.dungeon.FIELDS = FIELDS;
})();
