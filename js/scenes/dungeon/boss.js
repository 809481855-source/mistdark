/* 副本战斗 · 首领层：待机氛围、索敌走位、招式循环与攻击判定
 * 招式由 monsters.js 的 patterns 数据驱动：
 *   arc / slash  扇形横扫（镰刀、触须）
 *   beam         直线射线（被墙体阻挡）
 *   fan          扇形弹幕
 *   blink        瞬移后接扇形斩击
 *   summon       召唤小怪
 * 每个招式都有独立的读条（windup）与冷却（cd），读条期间首领原地不动并显示预警。
 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  const AMBIENT = {
    eye: { color: '#b57ce8', every: 0.32, speed: 14 },
    reaper: { color: '#9b6ee0', every: 0.24, speed: 18 },
    croc: { color: '#9fd07a', every: 0.4, speed: 10 },
    hierophant: { color: '#c07be0', every: 0.26, speed: 16 },
    mummy: { color: '#d9cfae', every: 0.36, speed: 12 },
    octo: { color: '#7fb8f0', every: 0.28, speed: 15 },
    crab: { color: '#7fd0d8', every: 0.34, speed: 13 },
    maw: { color: '#e0666a', every: 0.3, speed: 14 },
    goat: { color: '#b89ae0', every: 0.3, speed: 15 },
    knight: { color: '#cfe0f0', every: 0.38, speed: 11 },
    cauldron: { color: '#ffa54a', every: 0.26, speed: 17 },
    snake: { color: '#5fc8d8', every: 0.3, speed: 14 },
    crystal: { color: '#b877e0', every: 0.28, speed: 15 },
    demon: { color: '#e0556a', every: 0.26, speed: 16 },
    ogre: { color: '#6fb0e0', every: 0.36, speed: 12 },
    golem: { color: '#a8bcc8', every: 0.42, speed: 10 }
  };

  // 主动贴身型首领（其余保持中远距离）
  const MELEE_KIND = {
    reaper: 1, croc: 1, mummy: 1, crab: 1, maw: 1, goat: 1,
    knight: 1, snake: 1, demon: 1, ogre: 1, golem: 1
  };

  // 章内唯一：每个首领只归属一个章节；跨章再出场会被视为“复现”并强化
  const BOSS_ACT = {
    eyehorror: 1, croc: 1, mawfish: 1, mummyking: 1,
    cauldron: 2, golem: 2, blueogre: 2, goatbrute: 2, abysseye: 2,
    piratecrab: 3, octoking: 3, silverknight: 3, snakeking: 3,
    reaper: 4, hierophant: 4, shadowdemon: 4, crystalcrab: 4
  };

  // 每只首领的招式粒子皮肤（复用 monsters.drawFxSkin 的 bits 渲染，零额外开销）
  const BOSS_SKINS = {
    eyehorror: { bits: 'void', n: 12, color: '#b57ce8' },
    reaper: { bits: 'soul', n: 12, color: '#b28bff' },
    croc: { bits: 'toxin', n: 12, color: '#9fd07a' },
    hierophant: { bits: 'void', n: 12, color: '#c07be0' },
    mummyking: { bits: 'sand', n: 12, color: '#e0d2a8' },
    octoking: { bits: 'ink', n: 12, color: '#6fa8e8' },
    piratecrab: { bits: 'bubble', n: 10, color: '#9fe8e0' },
    mawfish: { bits: 'blood', n: 11, color: '#ef6a6a' },
    goatbrute: { bits: 'ash', n: 11, color: '#cbb0e8' },
    silverknight: { bits: 'holy', n: 11, color: '#e8f2ff' },
    cauldron: { bits: 'flame', n: 12, color: '#ffb05a' },
    snakeking: { bits: 'toxin', n: 11, color: '#7fe0dc' },
    crystalcrab: { bits: 'crystal', n: 11, color: '#d69cf0' },
    shadowdemon: { bits: 'shadow', n: 12, color: '#ff7a8a' },
    blueogre: { bits: 'rock', n: 11, color: '#8fc4ea' },
    golem: { bits: 'rock', n: 12, color: '#c2d2dc' }
  };

  // 近战型首领出手前冲距离：让横扫/镰击真的有扑上去的动作感
  const LUNGE = {
    reaper: 34, croc: 40, mummy: 30, crab: 26, maw: 38,
    goat: 42, knight: 34, snake: 30, demon: 44, ogre: 38, golem: 30
  };

  Object.assign(DG.scenes.dungeon.prototype, {
    // 重复出场：统计本章更早关卡里出现过的同一首领，第 2 次起进入二阶段，
    // 第 3 次起追加一套新招式，让同一首领在章内也不会重复同一场战斗。
    applyBossVariant(m) {
      if (!m || !m.boss) return m;
      const act = (this.def && this.def.act) || 1;
      const idx = (this.def && this.def.index) || 1;
      let tier = 0;
      const all = DG.data.dungeons || [];
      for (const d of all) {
        if (d.act === act && d.index < idx && d.bossId === m.typeId) tier++;
      }
      const home = BOSS_ACT[m.typeId];
      if (home && home !== act && tier < 1) tier = 1;   // 跨章复现至少按二阶段处理
      if (tier <= 0) return m;
      // 二阶段/新招式只做两档，重复次数再多也不继续叠数值
      tier = tier >= 2 ? 2 : 1;
      m.repeatTier = tier;
      m.name = (tier >= 2 ? '完全体 · ' : '再临 · ') + m.name;
      m.maxHp = Math.round(m.maxHp * (tier >= 2 ? 1.25 : 1.12));
      m.hp = m.maxHp;
      m.dmg = Math.round(m.dmg * (tier >= 2 ? 1.15 : 1.08));
      m.phase2At = 0.62;
      if (tier >= 2) {
        // 新招式：残响弹幕，补上中距离压制
        m.patterns.push({
          type: 'fan', label: '残响弹幕', range: 560, windup: 0.7, recover: 0.5, cd: 7,
          count: 7, spread: 0.42, dmgMul: 0.8, color: '#e0b0a0', fx: 'arcSlash', timer: 0
        });
      }
      return m;
    },

    updateBoss(m, dt, d, ang, speedMul) {
      const p = this.player;
      m.aiCd = Math.max(0, (m.aiCd || 0) - dt);
      for (const atk of m.patterns) {
        if (atk.timer > 0) atk.timer = Math.max(0, atk.timer - dt);
      }
      this.bossAmbient(m, dt);

      if (!m.enraged && m.hp / m.maxHp <= (m.phase2At || 0.5)) this.enrageBoss(m);

      // 施法中原地读条，朝向锁定在读条开始的方向
      if (m.cast) {
        m.moving = false;
        this.updateBossCast(m, dt);
        return;
      }
      m.facing = ang;
      if (p.hp <= 0) {
        m.moving = false;
        return;
      }

      if (m.aiCd <= 0) {
        const inRange = m.patterns.filter(a => a.timer <= 0 && (!a.range || d <= a.range));
        if (inRange.length) {
          this.startBossCast(m, this.pickBossAttack(inRange, d), ang);
          m.moving = false;
          return;
        }
      }

      // 走位：远则追；噬瞳之眼保持距离，收割者主动贴身
      const pref = m.preferRange || 130;
      let vx = 0;
      let vy = 0;
      if (d > pref + 24) {
        const f = this.flowDirection(m.x, m.y);
        vx = f ? f.x : Math.cos(ang);
        vy = f ? f.y : Math.sin(ang);
      } else if (d < pref - 55) {
        const def = DG.art.bosses.defs[m.art];
        const kind = def ? def.kind : 'eye';
        if (MELEE_KIND[kind]) {
          if (d > 52) {
            vx = Math.cos(ang);
            vy = Math.sin(ang);
          }
        } else if (d < 110) {
          vx = -Math.cos(ang) * 0.55;
          vy = -Math.sin(ang) * 0.55;
        }
      }
      m.moving = !!(vx || vy);
      if (m.moving) {
        const sp = m.speed * (speedMul || 1);
        this.moveWithSteer(m, vx * sp * dt, vy * sp * dt, Math.min(m.r, 26));
      }
    },

    pickBossAttack(list, d) {
      const minions = this.monsters.filter(x => !x.boss && !x.dead).length;
      let best = list[0];
      let bestScore = -Infinity;
      for (const a of list) {
        let score = Math.random() * 0.6;
        if (a.type === 'slash' || a.type === 'arc') score += d < 190 ? 1.2 : 0.2;
        if (a.type === 'beam' || a.type === 'fan') score += d > 260 ? 1.1 : 0.25;
        if (a.type === 'blink') score += d > 420 ? 0.9 : 0.35;
        if (a.type === 'summon') score += minions >= 6 ? -1.5 : 0.5;
        if (a === this._lastBossAtk) score -= 0.45;
        if (score > bestScore) {
          bestScore = score;
          best = a;
        }
      }
      this._lastBossAtk = best;
      return best;
    },

    startBossCast(m, atk, ang) {
      atk.timer = atk.cd || 3;
      const cast = { atk, t: 0, phase: 'windup', angle: ang, dest: null };
      if (atk.type === 'blink') cast.dest = this.bossBlinkDest(m);
      m.cast = cast;
      this.bossTelegraph(m, atk, ang, cast.dest);
      this.bossCastCharge(m, atk, ang);
      this.announce(`${m.name} · ${atk.label}`, Math.max(900, Math.round(atk.windup * 1000)));
    },

    // 读条聚能：专属法阵 + 胸口能量球，和出手特效共用一套皮肤
    bossCastCharge(m, atk, ang) {
      const def = DG.art.bosses.defs[m.art] || {};
      const kind = def.kind || 'eye';
      const skin = BOSS_SKINS[m.art];
      if (atk.type === 'summon') {
        this.effects.push({
          kind: 'summonCircle', x: m.x, y: m.y,
          radius: Math.max(96, m.r * 3.2),
          color: atk.color || '#9b7bd0',
          life: atk.windup, max: atk.windup, skin
        });
        return;
      }
      this.effects.push({
        kind: 'bossCharge', x: m.x, y: m.y, angle: ang,
        radius: m.r * (MELEE_KIND[kind] ? 2.7 : 3.3),
        h: DG.art.bosses.displayHeight(m) || 200,
        charge: atk.type,
        color: atk.color || '#c09be0',
        life: atk.windup, max: atk.windup, skin
      });
    },

    updateBossCast(m, dt) {
      const cast = m.cast;
      const atk = cast.atk;
      cast.t += dt;
      if (cast.phase === 'windup') {
        if (cast.t >= atk.windup) {
          cast.phase = 'recover';
          cast.t = 0;
          this.resolveBossCast(m, cast);
        }
        return;
      }
      if (cast.t >= (atk.recover || 0.45)) {
        m.cast = null;
        m.aiCd = Math.max(0.55, (atk.cd || 3) * (m.enraged ? 0.72 : 1));
      }
    },

    bossTelegraph(m, atk, ang, dest) {
      const life = Math.max(0.2, atk.windup);
      const high = atk.type === 'beam' || atk.type === 'blink' || (atk.dmgMul || 1) >= 1.18;
      const zone = { type: atk.type, x: m.x, y: m.y, angle: ang, life, high };
      if (atk.type === 'arc' || atk.type === 'slash') {
        zone.radius = atk.radius;
        zone.arc = atk.arc;
      } else if (atk.type === 'beam') {
        zone.length = this.bossBeamLength(m, ang, atk.range);
        zone.width = atk.width || 30;
      } else if (atk.type === 'fan') {
        zone.radius = 140;
        zone.arc = (atk.spread || 0.6) * ((atk.count || 5) - 1) + 0.25;
      } else if (atk.type === 'blink' && dest) {
        zone.x = dest.x;
        zone.y = dest.y;
        zone.radius = 96;
        zone.type = 'circle';
      }
      if (zone.radius || zone.length) this.dangerZones.push(zone);
      if (atk.type === 'arc' || atk.type === 'slash') {
        this.effects.push({
          kind: 'teleArc', x: m.x, y: m.y, angle: ang,
          arc: atk.arc, radius: atk.radius, color: atk.color,
          life, max: life
        });
      } else if (atk.type === 'beam') {
        const len = this.bossBeamLength(m, ang, atk.range);
        this.effects.push({
          kind: 'teleBeam', x: m.x, y: m.y, angle: ang,
          length: len, width: atk.width, color: atk.color,
          life, max: life
        });
      } else if (atk.type === 'fan') {
        const cone = (atk.spread || 0.6) * ((atk.count || 5) - 1) / 2;
        this.effects.push({
          kind: 'teleArc', x: m.x, y: m.y, angle: ang,
          arc: cone * 2 + 0.25, radius: 110, color: atk.color,
          life, max: life
        });
      } else if (atk.type === 'blink' && dest) {
        this.effects.push({
          kind: 'teleCircle', x: dest.x, y: dest.y, radius: 74,
          color: atk.color, life, max: life
        });
        this.addRing(m.x, m.y, 10, 62, atk.color, 0.5);
      } else if (atk.type === 'summon') {
        this.addRing(m.x, m.y, 18, Math.max(90, m.r * 3), atk.color || '#9b7bd0', life);
      }
    },

    resolveBossCast(m, cast) {
      const atk = cast.atk;
      const p = this.player;
      const dmg = Math.max(1, Math.round(m.dmg * (atk.dmgMul || 1)));
      const skin = BOSS_SKINS[m.art];

      if (atk.type === 'arc' || atk.type === 'slash') {
        // 近战型首领：先真实前冲，再判定，挥砍不再是原地播放特效
        const def = DG.art.bosses.defs[m.art];
        const kind = def ? def.kind : 'eye';
        const lunge = LUNGE[kind] || 0;
        if (lunge) {
          this.dashMonster(m, cast.angle, lunge * (m.enraged ? 1.25 : 1));
          this.effects.push({
            kind: 'quakeRing', x: m.x, y: m.y,
            radius: atk.radius * 0.92, color: atk.color,
            life: 0.32, max: 0.32
          });
        }
        this.effects.push({
          kind: atk.fx || 'arcSlash', x: m.x, y: m.y, angle: cast.angle,
          arc: atk.arc, radius: atk.radius, color: atk.color,
          life: 0.34, max: 0.34, skin
        });
        this.addBurst(
          m.x + Math.cos(cast.angle) * atk.radius * 0.8,
          m.y + Math.sin(cast.angle) * atk.radius * 0.8,
          atk.color, 10
        );
        this.shake = Math.max(this.shake, 0.24);
        if (this.bossArcHit(m, cast.angle, atk.radius, atk.arc)) this.hurtPlayer(dmg);
      } else if (atk.type === 'beam') {
        const len = this.bossBeamLength(m, cast.angle, atk.range);
        this.effects.push({
          kind: 'beam', x: m.x, y: m.y, angle: cast.angle,
          length: len, width: atk.width, color: atk.color,
          life: 0.3, max: 0.3, skin
        });
        this.addBurst(
          m.x + Math.cos(cast.angle) * len,
          m.y + Math.sin(cast.angle) * len,
          atk.color, 12
        );
        this.shake = Math.max(this.shake, 0.34);
        if (this.bossBeamHit(m, cast.angle, len, atk.width)) this.hurtPlayer(dmg);
      } else if (atk.type === 'fan') {
        const cone = (atk.spread || 0.6) * ((atk.count || 5) - 1) / 2;
        this.effects.push({
          kind: 'arcSlash', x: m.x, y: m.y, angle: cast.angle,
          arc: cone * 2 + 0.25, radius: 96, color: atk.color,
          life: 0.26, max: 0.26, skin
        });
        this.bossFan(m, cast.angle, atk, dmg);
      } else if (atk.type === 'blink') {
        const dest = cast.dest || this.bossBlinkDest(m);
        this.effects.push({
          kind: 'blinkWarp', x: m.x, y: m.y,
          radius: 62, color: atk.color,
          life: 0.4, max: 0.4, skin
        });
        this.addBurst(m.x, m.y, atk.color, 16);
        m.x = dest.x;
        m.y = dest.y;
        this.addRing(m.x, m.y, 12, 86, atk.color, 0.45);
        this.addBurst(m.x, m.y, atk.color, 14);
        const ang = U.angle(m, p);
        m.facing = ang;
        this.effects.push({
          kind: 'blinkWarp', x: m.x, y: m.y,
          radius: 62, color: atk.color,
          life: 0.34, max: 0.34, skin
        });
        this.effects.push({
          kind: 'arcSlash', x: m.x, y: m.y, angle: ang,
          arc: atk.arc, radius: atk.radius, color: atk.color,
          life: 0.34, max: 0.34, skin
        });
        this.shake = Math.max(this.shake, 0.3);
        if (this.bossArcHit(m, ang, atk.radius, atk.arc)) this.hurtPlayer(dmg);
      } else if (atk.type === 'summon') {
        this.effects.push({
          kind: 'summonCircle', x: m.x, y: m.y,
          radius: Math.max(96, m.r * 3.2),
          color: atk.color || '#9b7bd0',
          life: 0.5, max: 0.5, skin
        });
        this.bossSummon(m, atk);
      }
    },

    bossFan(m, ang, atk, dmg) {
      const n = Math.max(3, atk.count || 5);
      const spread = atk.spread || 0.6;
      const speed = atk.projSpeed || 230;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * spread;
        this.projectiles.push({
          team: 'enemy',
          x: m.x, y: m.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          r: 7,
          dmg,
          color: atk.color || '#a97be0',
          life: 4.2, maxLife: 4.2,
          pierce: 0
        });
      }
      this.addBurst(
        m.x + Math.cos(ang) * m.r,
        m.y + Math.sin(ang) * m.r,
        atk.color || '#a97be0', 10
      );
    },

    bossArcHit(m, angle, radius, arc) {
      const p = this.player;
      const d = U.dist(m, p);
      if (d > radius + p.r) return false;
      let diff = U.angle(m, p) - angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      return Math.abs(diff) <= arc / 2 + Math.atan2(p.r, Math.max(1, d));
    },

    bossBeamHit(m, angle, length, width) {
      const p = this.player;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const rx = p.x - m.x;
      const ry = p.y - m.y;
      const proj = rx * dx + ry * dy;
      if (proj < 0 || proj > length) return false;
      return Math.abs(rx * dy - ry * dx) <= (width || 30) / 2 + p.r;
    },

    // 射线被墙体截断，墙后安全
    bossBeamLength(m, angle, range) {
      const step = 26;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let len = 0;
      while (len < range) {
        const next = Math.min(range, len + step);
        if (this.isWallAt(m.x + dx * next, m.y + dy * next)) break;
        len = next;
      }
      return len;
    },

    // 瞬移落点：绕到玩家身后，且吸附到可站立地面
    bossBlinkDest(m) {
      const p = this.player;
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const tx = U.clamp(p.x + dx / len * 92, 40, (this.arenaW || ARENA_W) - 40);
      const ty = U.clamp(p.y + dy / len * 92, 40, (this.arenaH || ARENA_H) - 40);
      return this.nearestFloorPoint(tx, ty, 3) || { x: tx, y: ty };
    },

    bossAmbient(m, dt) {
      const def = DG.art.bosses.defs[m.art];
      const cfg = AMBIENT[def ? def.kind : 'eye'] || AMBIENT.eye;
      m.ambTimer = (m.ambTimer || 0) - dt;
      if (m.ambTimer > 0) return;
      m.ambTimer = cfg.every;
      const a = U.rand(0, Math.PI * 2);
      const rr = m.r * U.rand(0.55, 1.35);
      this.effects.push({
        kind: 'spark',
        x: m.x + Math.cos(a) * rr,
        y: m.y + Math.sin(a) * rr * 0.55,
        vx: Math.cos(a) * cfg.speed * 0.25,
        vy: -cfg.speed - U.rand(0, 10),
        life: U.rand(0.55, 1.0), max: 1.0,
        r: U.rand(1.2, 2.6),
        color: m.glow || cfg.color
      });
    },

    enrageBoss(m) {
      m.enraged = true;
      m.dmg = Math.round(m.dmg * 1.15);
      m.speed *= 1.12;
      for (const a of m.patterns) a.cd = Math.max(2.2, (a.cd || 3) * 0.85);
      // 复现首领的二阶段：额外增伤并召唤小怪，逼玩家换位
      if (m.repeatTier) {
        m.dmg = Math.round(m.dmg * 1.05);
        this.bossSummon(m, { count: 1 + m.repeatTier });
        this.addRing(m.x, m.y, 40, 260, '#d98b9d', 0.9);
      }
      this.announce(m.repeatTier ? `${m.name} · 二阶段` : `${m.name} 进入狂暴`, 2000);
      this.addRing(m.x, m.y, 20, 210, '#ff6a5e', 0.8);
      this.addBurst(m.x, m.y, '#ff8a7a', 26);
      this.shake = Math.max(this.shake, 0.5);
      if (this.$bossWrap) this.$bossWrap.classList.add('enraged');
    }
  });
})();
