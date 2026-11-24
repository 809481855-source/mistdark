/* 副本战斗 · 技能层：普攻与主动技能的自动释放 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
    // 战斗内成长即时生效：升级 / 换装 / 点天赋后重算属性、同步技能栏与冷却，
    // 返回本次新解锁的技能（供升级公告展示）
    refreshBuild() {
      if (!this.player || !this.stats || !this.cls) return [];
      const oldMax = this.player.maxHp;
      const oldHp = this.player.hp;
      // 天赋/流派词缀由 char 实时聚合，换装或点树后必须丢弃战斗内缓存
      this.talents = null;
      this.stats = DG.stats.compute(this.char);
      this.talents = this.stats.talents || null;
      const newMax = this.stats.maxHp;
      this.player.maxHp = newMax;
      // 上限提升时把新增生命补进当前血量；上限下降时按新上限收口，避免换装瞬间残血
      this.player.hp = newMax >= oldMax
        ? Math.min(newMax, oldHp + (newMax - oldMax))
        : Math.min(newMax, oldHp);
      if (this.player.hp <= 0) this.player.hp = 1;

      // 旧冷却按技能 id 迁移：升级只追加新槽位，不会把已在冷却的技能清零
      const cdById = {};
      for (let i = 1; i < this.skillList.length; i++) cdById[this.skillList[i].id] = this.skillCd[i] || 0;
      const prevIds = this.activeSkills.map(sk => sk.id);
      this.activeSkills = this.cls.skills
        .filter(id => DG.data.skillUnlocked(this.char, id))
        .map(id => DG.data.skills[id]);
      this.skillList = [this.basicSkill, ...this.activeSkills];
      this.skillCd = this.skillList.map((sk, i) => (i === 0 ? 0 : (cdById[sk.id] || 0)));
      if (this.hud) {
        this.bindStripSlots();
        this.updateHud();
      }
      return this.activeSkills.filter(sk => prevIds.indexOf(sk.id) < 0);
    },
    autoMoveDirection() {
      const now = this.time || 0;
      if (this.autoDecision && this.autoDecision.until > now) return this.autoDecision.dir;
      const goal = this.autoGoalTarget();
      const evade = this.autoEvadeDirection(goal);
      if (evade) return this.autoCommitMove(this.autoSmoothDirection(evade, 0.42), goal);
      // 火圈收缩：站在圈外会持续灼烧，优先往圈心走（比追怪更重要）
      const ring = this.field && this.field.kind === 'fire' ? this.field.ring : null;
      if (ring && ring.t > ring.arm &&
        Math.hypot(this.player.x - ring.x, this.player.y - ring.y) > ring.r - this.player.r - 10) {
        const dx = ring.x - this.player.x, dy = ring.y - this.player.y;
        const len = Math.hypot(dx, dy) || 1;
        return this.autoCommitMove(
          this.autoSmoothDirection({ x: dx / len, y: dy / len }, 0.5),
          { x: ring.x, y: ring.y, kind: 'ring' }
        );
      }
      if (this.autoDetour && this.autoDetour.until > now) return this.autoCommitMove(this.autoDetour.dir, goal);
      if (!goal) return this.autoCommitMove(this.autoSmoothDirection({ x: 0, y: 0 }, 0.2), null);
      const target = goal.monster;
      if (target) {
        const dist = U.dist(this.player, target);
        // 远程职业保持风筝距离：贴太近就后撤，太远再压上，距离舒适时站定输出
        if (this.autoIsRanged()) {
          const keep = Math.max(210, Math.min(340, (this.basicSkill.range || 320) * 0.46));
          const attackRange = Math.max(300, Math.min(540, (this.basicSkill.range || 320) * 0.86));
          if (dist < keep - 40) this.autoKiteHeld = true;
          else if (dist > keep + 120) this.autoKiteHeld = false;
          const hpPct = this.player.hp / this.player.maxHp;
          let closeCount = 0;
          for (const m of this.monsters) {
            if (!m.dead && U.dist(this.player, m) < 170) closeCount++;
          }
          // 满血面对普通小怪不必一直后撤：站桩输出更快；
          // 掉血、被围、精英/首领近身或脚下有预警时才拉开距离
          const needKite = this.autoKiteHeld && dist < attackRange * 0.92 &&
            (hpPct < 0.6 || closeCount >= 3 || ((target.boss || target.elite) && dist < 280) ||
              this.autoHardDangerAt(this.player.x, this.player.y) > 0);
          if (needKite || (hpPct < 0.4 && dist < 200 + target.r)) {
            // 被多只怪贴身时朝“怪最稀疏”的方向撤，而不是只背对当前目标
            let dir = null;
            if (closeCount >= 3) {
              const a = this.autoRetreatAngle();
              if (a != null && a !== undefined) dir = { x: Math.cos(a), y: Math.sin(a) };
            }
            if (!dir) dir = this.autoKiteDirection(target);
            if (dir) return this.autoCommitMove(this.autoSmoothDirection(dir, 0.4), goal);
          }
          // 已在射程内且视线畅通：站定输出；否则继续走下面的寻路绕过去
          if (dist <= attackRange && this.autoLineClear(target)) {
            return this.autoCommitMove(this.autoSmoothDirection({ x: 0, y: 0 }, 0.3), goal);
          }
        }
        // 近战：进入攻击距离后停手，让普攻自动出手（被墙挡住时继续绕路）
        // 停手距离必须落在真实命中范围内（近战判定为 centerDist <= range + m.r）。
        // 旧算法额外加了玩家半径，首领体型大时会停在命中范围之外，
        // 表现为“贴着首领站定却几乎打不出伤害”。
        const reach = this.basicSkill.range || 120;
        const stop = reach * 0.95 + Math.min(target.r, 40) * 0.5;
        const los = this.autoLineClear(target);
        if (dist <= stop && los) this.autoHoldingRange = true;
        else if (dist > stop + 16 || !los) this.autoHoldingRange = false;
        if (this.autoHoldingRange) return this.autoCommitMove(this.autoSmoothDirection({ x: 0, y: 0 }, 0.28), goal);
      }
      let dir = this.autoDirectDirection(goal) || this.autoFlowDirection(this.player.x, this.player.y, goal) || { x: 0, y: 0 };
      if (this.autoBlocked > 0.18 && (dir.x || dir.y)) {
        const base = Math.atan2(dir.y, dir.x);
        for (const off of [1.18, -1.18, 0.82, -0.82, 1.55, -1.55]) {
          const x = this.player.x + Math.cos(base + off) * 42;
          const y = this.player.y + Math.sin(base + off) * 42;
          if (!this.circleWall(x, y, this.player.r) && !this.circleProp(x, y, this.player.r)) {
            dir = { x: Math.cos(base + off), y: Math.sin(base + off) };
            this.autoBlocked = 0;
            this.autoDetour = { dir, until: this.time + 0.42 };
            return this.autoCommitMove(dir, goal);
          }
        }
      }
      // 完全走不动：先强行侧移脱困；短时间内反复脱困无效则放弃当前目标去探索
      if (!dir.x && !dir.y) {
        if (!this.autoStuckAt) this.autoStuckAt = now;
        if (now - this.autoStuckAt > 0.35) {
          const log = (this.autoEscapeLog || []).filter(t => now - t < 5);
          const escape = log.length < 3 ? this.autoEscapeDirection() : null;
          if (escape) {
            log.push(now);
            this.autoEscapeLog = log;
            this.autoDetour = { dir: escape, until: now + 0.6 };
            this.autoStuckAt = 0;
            this.autoBlocked = 0;
            return this.autoCommitMove(escape, goal);
          }
          this.autoEscapeLog = [];
          this.autoGiveUpGoal(now);
          return { x: 0, y: 0 };
        }
      } else if (this.autoBlocked > 1.2) {
        // 一直在走却始终被挡：同样视为不可达
        this.autoGiveUpGoal(now);
        return { x: 0, y: 0 };
      } else {
        this.autoStuckAt = 0;
      }
      return this.autoCommitMove(this.autoSmoothDirection(dir, 0.2), goal);
    },
    // 放弃当前不可达目标：把怪/怪群拉黑一段时间，并改为优先探索
    autoGiveUpGoal(now) {
      const goal = this.autoGoal;
      const bossGoal = !!(goal && goal.monster && goal.monster.boss);
      if (goal && goal.monster && !bossGoal) {
        this.autoIgnore = goal.monster;
        this.autoIgnoreUntil = now + 10;
      } else if (goal && goal.kind === 'pack' && this.autoPack) {
        this.autoIgnorePack = this.autoPack;
        this.autoIgnorePackUntil = now + 10;
      } else if (goal && goal.kind === 'orb' && goal.orb) {
        this.autoIgnoreOrb = goal.orb;
        this.autoIgnoreOrbUntil = now + 8;
      }
      // 首领不能放弃：不进探索模式，下一帧重新贴身打
      this.autoExploreUntil = bossGoal ? 0 : now + 6;
      this.autoTarget = null;
      this.autoPack = null;
      this.autoGoal = null;
      this.autoDecision = null;
      this.autoEvade = null;
      this.autoSteer = null;
      this.autoHoldingRange = false;
      this.autoKiteHeld = false;
      this.autoStuckAt = 0;
      this.autoBlocked = 0;
      this.autoEscapeLog = [];
    },
    autoCommitMove(dir, goal) {
      this.autoDecision = { dir, goal, until: (this.time || 0) + 0.1 };
      return dir;
    },
    autoDirectDirection(goal) {
      const dx = goal.x - this.player.x, dy = goal.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return { x: 0, y: 0 };
      const x = dx / dist, y = dy / dist;
      // 步长小于最薄墙体，避免“直线看起来通”而实际撞墙
      const steps = Math.ceil(dist / 32);
      for (let i = 1; i <= steps; i++) {
        const t = Math.min(dist, i * 32);
        const px = this.player.x + x * t, py = this.player.y + y * t;
        if (this.circleWall(px, py, this.player.r) || this.circleProp(px, py, this.player.r)) return null;
      }
      return { x, y };
    },
    autoSmoothDirection(next, weight) {
      const old = this.autoSteer;
      // 方向发生大角度反转时直接切换而不是插值：否则左右相反的寻路结果会被
      // 平滑成 (0,0)，角色在墙边原地抽搐、永远走不出拐角
      if (!old || old.x * next.x + old.y * next.y < 0.2) {
        this.autoSteer = { x: next.x, y: next.y };
        return next;
      }
      const x = old.x + (next.x - old.x) * weight;
      const y = old.y + (next.y - old.y) * weight;
      const len = Math.hypot(x, y);
      this.autoSteer = len < 0.08 ? { x: 0, y: 0 } : { x, y };
      return len < 0.08 ? this.autoSteer : { x: x / len, y: y / len };
    },
    // 远程职业：普攻为弹道/散射，需要保持距离而不是贴脸
    autoIsRanged() {
      const type = this.basicSkill && this.basicSkill.type;
      return type === 'projectile' || type === 'spread';
    },
    // 残血时寻找最近的恢复球（拾取即回 20% 最大生命）
    autoHealOrbTarget() {
      const hpPct = this.player.hp / this.player.maxHp;
      if (hpPct > 0.55) return null;
      const reach = hpPct < 0.3 ? 950 : 620;
      let best = null, bestD = reach;
      for (const d of this.drops || []) {
        if (d.kind !== 'orb') continue;
        if (d === this.autoIgnoreOrb && (this.autoIgnoreOrbUntil || 0) > (this.time || 0)) continue;
        const dist = U.dist(this.player, d);
        if (dist >= bestD) continue;
        // 只追直线可达或很近的球，避免为了捡球绕远路被围死
        if (dist > 220 && !this.autoDirectDirection(d)) continue;
        bestD = dist;
        best = d;
      }
      return best;
    },
    autoStepFree(x, y, dist) {
      const steps = Math.ceil(dist / 24);
      for (let i = 1; i <= steps; i++) {
        const t = dist * i / steps;
        const px = this.player.x + x * t, py = this.player.y + y * t;
        if (this.circleWall(px, py, this.player.r) || this.circleProp(px, py, this.player.r)) return false;
      }
      return true;
    },
    // 视线检测：隔着墙/可破坏立件时不要站桩输出，先绕过去或打碎挡路的道具。
    // 采样步长必须小于最薄墙体（32px）：24px 采样会从薄墙中间穿过去，
    // 造成“看得见、站桩射、弹道全被墙挡住”的零输出死锁
    autoLineClear(target) {
      if (!target) return false;
      const dx = target.x - this.player.x, dy = target.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d < 32) return true;
      const steps = Math.ceil(d / 12);
      for (let i = 1; i < steps; i++) {
        const t = d * i / steps;
        const px = this.player.x + dx / d * t, py = this.player.y + dy / d * t;
        if (this.circleWall(px, py, 6)) return false;
        if (this.circleProp(px, py, 6)) return false;
      }
      return true;
    },
    // 找出挡在攻击线路上、可以直接打碎的立件
    autoPropBlocker(target) {
      if (!target || !this.propCols || !this.propCols.length) return null;
      const dx = target.x - this.player.x, dy = target.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d < 32) return null;
      const steps = Math.ceil(d / 24);
      for (let i = 1; i < steps; i++) {
        const t = d * i / steps;
        const px = this.player.x + dx / d * t, py = this.player.y + dy / d * t;
        for (const c of this.propCols) {
          if (!c.prop || c.prop.destroyed) continue;
          if (this.propGap(c, px, py) < 6) return c;
        }
      }
      return null;
    },
    // 风筝走位：远离目标为主，叠加侧向偏移，撞墙时换另一侧
    autoKiteDirection(target) {
      const dx = this.player.x - target.x, dy = this.player.y - target.y;
      const len = Math.hypot(dx, dy) || 1;
      const ax = dx / len, ay = dy / len;
      if (!this.autoKiteSide) this.autoKiteSide = U.chance(0.5) ? 1 : -1;
      const side = this.autoKiteSide;
      const tries = [
        [ax * 0.84 - ay * 0.46 * side, ay * 0.84 + ax * 0.46 * side],
        [ax * 0.84 + ay * 0.46 * side, ay * 0.84 - ax * 0.46 * side],
        [ax, ay]
      ];
      for (const v of tries) {
        const l = Math.hypot(v[0], v[1]) || 1;
        const x = v[0] / l, y = v[1] / l;
        if (this.autoStepFree(x, y, 76)) return { x, y };
      }
      // 后撤方向被墙封死：换一侧绕行，下一帧再试
      this.autoKiteSide = -side;
      return null;
    },
    autoGoalTarget() {
      const now = this.time || 0;
      // 目标临时不可达的黑名单，过期后重新尝试
      if (this.autoIgnore && this.autoIgnoreUntil < now) this.autoIgnore = null;
      if (this.autoIgnorePack && this.autoIgnorePackUntil < now) this.autoIgnorePack = null;
      if (this.autoIgnoreOrb && this.autoIgnoreOrbUntil < now) this.autoIgnoreOrb = null;
      // 残血先捡恢复球：自动战斗优先保命，再继续输出
      const orb = this.autoHealOrbTarget();
      if (orb) {
        this.autoTarget = null;
        this.autoPack = null;
        this.autoGoal = { x: orb.x, y: orb.y, kind: 'orb', orb };
        return this.autoGoal;
      }
      const cur = this.currentChunk();
      const curCh = this.chunks[cur];
      // 刚刚卡死过：先去激活新的怪群，避免一直死磕同一个不可达的怪
      const exploring = now < (this.autoExploreUntil || 0);
      // 还有没激活的怪群时，只打当前/相邻区块的怪；
      // 怪群全部激活后，剩下的怪无论多远都要清掉，否则无法触发首领
      const pendingPacks = (this.chunkPacks || []).some(p => !p.spawned && p !== this.autoIgnorePack);
      // 长时间没有击杀（疑似被地形/怪群卡住）时放开“只打当前区块”的限制，
      // 让 AI 能直接去清掉地图上残留的怪，避免在空区块里反复打转
      const stalled = now - (this.lastKillTime == null ? (this.autoStartedAt || now) : this.lastKillTime) > 45;
      let best = null, bestScore = Infinity, bestDist = Infinity;
      if (!exploring) {
        for (const m of this.monsters) {
          if (m.dead) continue;
          const d = U.dist(this.player, m);
          // 首领永远不被拉黑：它是通关条件，一旦出现就必须持续压制。
          // 否则一次“不可达”判定就会让 AI 跑去清远处的怪，留下首领挂机不打。
          if (m.boss) {
            this.autoTarget = m;
            this.autoPack = null;
            this.autoGoal = { x: m.x, y: m.y, monster: m, kind: 'boss' };
            return this.autoGoal;
          }
          if (m === this.autoIgnore) continue;
          const mch = m.chunkIndex != null ? this.chunks[m.chunkIndex] : null;
          if (!stalled && pendingPacks && mch && curCh && Math.abs(mch.col - curCh.col) + Math.abs(mch.row - curCh.row) > 1 && !m.aggro) continue;
          // 优先级：距离为主，残血目标（配合处决）、远程与精英更值得先处理
          let score = d - (1 - m.hp / m.maxHp) * 70;
          if (m.ranged) score -= 30;
          if (m.elite) score -= 24;
          // 分裂出的小体不计击杀：优先绕开它们，避免刷不动任务进度
          if (m.noLoot) score += 260;
          if (score < bestScore) { best = m; bestScore = score; bestDist = d; }
        }
      }
      const locked = this.autoTarget;
      // 已锁定目标若是分裂小体，而场上还有能推进进度的本体，则立即换目标
      const dropLock = locked && locked.noLoot && this.monsters.some(q => !q.dead && !q.noLoot);
      if (!exploring && locked && !dropLock && locked !== this.autoIgnore && !locked.dead && this.monsters.indexOf(locked) >= 0) {
        const lockedD = U.dist(this.player, locked);
        // 精英目标离得太远而附近有普通怪时，先清小怪，避免长距离风筝僵持
        const farElite = locked.elite && !locked.boss && best && !best.elite &&
          lockedD > bestDist + 140;
        if (!best || (lockedD <= bestDist + 120 && !farElite)) {
          // 贴合到最近的可行走点，防止怪物被挤进墙里导致寻路目标无效
          const gp = this.nearestFloorPoint(locked.x, locked.y, 2) || locked;
          this.autoGoal = { x: gp.x, y: gp.y, kind: 'monster', monster: locked };
          return { x: gp.x, y: gp.y, monster: locked, kind: 'monster' };
        }
      }
      if (best) {
        this.autoTarget = best;
        this.autoPack = null;
        const gp = this.nearestFloorPoint(best.x, best.y, 2) || best;
        this.autoGoal = { x: gp.x, y: gp.y, kind: 'monster', monster: best };
        return { x: gp.x, y: gp.y, monster: best, kind: 'monster' };
      }
      let pack = this.autoPack && !this.autoPack.spawned && this.autoPack !== this.autoIgnorePack ? this.autoPack : null;
      if (!pack) {
        for (const p of this.chunkPacks || []) {
          if (p.spawned || p === this.autoIgnorePack) continue;
          if (!pack || U.dist(this.player, p) < U.dist(this.player, pack)) pack = p;
        }
      }
      if (pack) {
        const dx = this.player.x - pack.x, dy = this.player.y - pack.y;
        const d = Math.hypot(dx, dy) || 1;
        const staging = this.nearestFreePoint(pack.x + dx / d * 320, pack.y + dy / d * 320, 5, this.player.r);
        this.autoTarget = null;
        this.autoPack = pack;
        this.autoGoal = { x: staging ? staging.x : pack.x, y: staging ? staging.y : pack.y, kind: 'pack' };
        return this.autoGoal;
      }
      const room = this.rooms && this.rooms[this.arenaChunk];
      if (room && this.phase === 'wave') {
        this.autoTarget = null;
        this.autoGoal = { x: room.cx, y: room.cy, kind: 'arena' };
        return this.autoGoal;
      }
      this.autoTarget = null;
      this.autoPack = null;
      this.autoGoal = null;
      return null;
    },
    autoZoneDanger(x, y, z) {
      const r = this.player.r + 8;
      if (z.type === 'circle') return Math.hypot(x - z.x, y - z.y) < z.radius + r;
      const dx = x - z.x, dy = y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx);
      const diff = Math.abs(U.angleDiff(angle, z.angle));
      if (z.type === 'beam') {
        const proj = dx * Math.cos(z.angle) + dy * Math.sin(z.angle);
        return proj >= -r && proj <= z.length + r && Math.abs(dx * Math.sin(z.angle) - dy * Math.cos(z.angle)) < z.width / 2 + r;
      }
      return d < z.radius + r && diff < z.arc / 2 + 0.18;
    },
    autoProjectileDanger(x, y) {
      for (const p of this.projectiles) {
        if (p.team !== 'enemy') continue;
        const speed2 = p.vx * p.vx + p.vy * p.vy;
        if (!speed2) continue;
        const t = U.clamp(((x - p.x) * p.vx + (y - p.y) * p.vy) / speed2, 0, 0.65);
        if (t <= 0.01) continue;
        const px = p.x + p.vx * t, py = p.y + p.vy * t;
        if (Math.hypot(px - x, py - y) < p.r + this.player.r + 10) return true;
      }
      return false;
    },
    // 怪物起手预警：前摇结束时会被打中的位置。近战按突进落点与扇形判定，
    // 远程读条按射线判定。普通小怪只在高威胁时才值得躲，避免近战为了闪避丢输出。
    autoMonsterWindupDanger(x, y) {
      const pad = this.player.r + 8;
      const hpPct = this.player.hp / this.player.maxHp;
      const rangedCls = this.autoIsRanged();
      for (const m of this.monsters) {
        if (m.dead) continue;
        const a = m.action;
        if (a && a.phase === 'windup') {
          if (a.cast) {
            const rx = x - m.x, ry = y - m.y;
            const proj = rx * Math.cos(a.angle) + ry * Math.sin(a.angle);
            if (proj < 0) continue;
            const perp = Math.abs(rx * Math.sin(a.angle) - ry * Math.cos(a.angle));
            if (perp < pad + 10) return true;
            continue;
          }
          const mv = a.mv || {};
          const dmgPct = m.dmg / Math.max(1, this.player.maxHp);
          if (!rangedCls && !m.elite && !m.boss && dmgPct < 0.055 && hpPct > 0.42) continue;
          let ox = m.x, oy = m.y;
          if (mv.lunge) {
            ox += Math.cos(a.angle) * mv.lunge * 0.9;
            oy += Math.sin(a.angle) * mv.lunge * 0.9;
          }
          if (Math.hypot(x - ox, y - oy) > m.attackRange * (mv.reach || 1) + pad) continue;
          let diff = Math.atan2(y - oy, x - ox) - a.angle;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          if (Math.abs(diff) <= Math.max(0.62, (mv.arc || 1.5) / 2)) return true;
        } else if (m.ranged && m.aggro && m.shootTimer != null && m.shootTimer < 0.24) {
          // 远程怪即将开火：按当前朝向的射线预判
          const rx = x - m.x, ry = y - m.y;
          const proj = rx * Math.cos(U.angle(m, this.player)) + ry * Math.sin(U.angle(m, this.player));
          if (proj < 0 || proj > 470) continue;
          const perp = Math.abs(rx * Math.sin(U.angle(m, this.player)) - ry * Math.cos(U.angle(m, this.player)));
          if (perp < pad + 8) return true;
        }
      }
      return false;
    },
    // 硬威胁：真正会掉血的预警（弹道 / 技能前摇 / 首领预警圈 / 场地与天气）
    autoHardDangerAt(x, y) {
      let danger = 0;
      if (this.autoProjectileDanger(x, y)) danger += 12000;
      if (this.autoMonsterWindupDanger(x, y)) danger += 15000;
      for (const z of this.dangerZones || []) {
        if (this.autoZoneDanger(x, y, z)) danger += z.high ? 26000 : 8000;
      }
      return danger + this.autoFieldDanger(x, y);
    },
    // 场地/天气威胁：火圈外、落雷预警圈、已触发的枫叶堆
    autoFieldDanger(x, y) {
      let danger = 0;
      const f = this.field;
      if (f && f.kind === 'fire' && f.ring && f.ring.t > f.ring.arm) {
        if (Math.hypot(x - f.ring.x, y - f.ring.y) > f.ring.r - 18) danger += 9000;
      }
      for (const s of this.wxStrikes || []) {
        if (Math.hypot(x - s.x, y - s.y) < 92 + this.player.r + 6) danger += 12000;
      }
      if (f && f.piles) {
        for (const q of f.piles) {
          if (!q.armed) continue;
          if (Math.hypot(x - q.x, y - q.y) < (q.r || 30) + 80) danger += 9000;
        }
      }
      for (const z of this.wxZones || []) {
        if (!z.armed) continue;
        if (Math.hypot(x - z.x, y - z.y) < (z.r || 70) + 80) danger += 9000;
      }
      return danger;
    },
    // 卡死脱困：在 16 方向里挑一个可走、远离怪堆、略偏地图中心的方向
    autoEscapeDirection() {
      const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * 2 * i / 16;
        const x = Math.cos(a), y = Math.sin(a);
        if (!this.autoStepFree(x, y, 56)) continue;
        const ex = this.player.x + x * 96, ey = this.player.y + y * 96;
        let score = -Math.hypot(ex - aw / 2, ey - ah / 2) * 0.02;
        for (const m of this.monsters) {
          if (m.dead) continue;
          const md = Math.hypot(ex - m.x, ey - m.y);
          if (md < 160) score -= (160 - md) * 0.6;
        }
        score -= this.autoHardDangerAt(ex, ey) * 0.001;
        if (score > bestScore) { bestScore = score; best = { x: x, y: y }; }
      }
      return best;
    },
    autoEvadeDirection(goal) {
      const here = this.autoHardDangerAt(this.player.x, this.player.y);
      const now = this.time || 0;
      if (!here) {
        if (this.autoEvade && this.autoEvade.until > now) return this.autoEvade.dir;
        this.autoEvade = null;
        return null;
      }
      const base = goal ? Math.atan2(goal.y - this.player.y, goal.x - this.player.x) : this.player.facing;
      const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
      let best = null, bestScore = Infinity;
      for (let i = 0; i < 18; i++) {
        const a = base + Math.PI * 2 * i / 18;
        const step = i % 2 ? 92 : 128;
        const x = this.player.x + Math.cos(a) * step, y = this.player.y + Math.sin(a) * step;
        const mx = this.player.x + Math.cos(a) * step * 0.55;
        const my = this.player.y + Math.sin(a) * step * 0.55;
        if (this.circleWall(x, y, this.player.r) || this.circleProp(x, y, this.player.r)) continue;
        // 终点与途中都要安全，避免直线穿过预警区
        let score = this.autoHardDangerAt(x, y) * 1.2 + this.autoHardDangerAt(mx, my) * 0.8;
        // 怪物拥挤度：别为了躲技能一头钻进怪堆
        for (const m of this.monsters) {
          if (m.dead) continue;
          const md = Math.hypot(x - m.x, y - m.y);
          const minD = m.r + this.player.r + 30;
          if (md < minD) score += (minD - md) * (m.boss ? 14 : 6);
        }
        if (x < 70 || y < 70 || x > aw - 70 || y > ah - 70) score += 420;
        if (goal) score += Math.hypot(goal.x - x, goal.y - y) * 0.05;
        if (score < bestScore) { bestScore = score; best = { x: Math.cos(a), y: Math.sin(a) }; }
      }
      if (best) this.autoEvade = { dir: best, until: now + 0.3 };
      return best;
    },
    // 远离最近怪物与危险区的方向（保命位移技能用）
    autoRetreatAngle() {
      const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * 2 * i / 16;
        const x = this.player.x + Math.cos(a) * 150;
        const y = this.player.y + Math.sin(a) * 150;
        if (this.circleWall(x, y, this.player.r) || this.circleProp(x, y, this.player.r)) continue;
        if (x < 70 || y < 70 || x > aw - 70 || y > ah - 70) continue;
        let score = -this.autoHardDangerAt(x, y) * 0.02;
        for (const m of this.monsters) {
          if (!m.dead) score += Math.hypot(x - m.x, y - m.y) * 0.02;
        }
        if (score > bestScore) { bestScore = score; best = a; }
      }
      return best;
    },
    doBasic(angle) {
      const sk = this.basicSkill;
      const lv = this.char.skills[sk.id] || 1;
      // 挥砍时长跟随攻速收紧：保证每一刀都能收完再出下一刀，避免动作被硬切
      const cd = 1 / this.attackSpeedNow();
      const dur = Math.min(0.46, Math.max(0.26, cd * 1.05));
      this.player.atkAnim = dur;
      this.player.atkDur = dur;
      this.performSkill(sk, lv, 'basic', angle);
      this.breakPropsAt(
        this.player.x + Math.cos(angle) * ((sk.range || 70) * 0.52),
        this.player.y + Math.sin(angle) * ((sk.range || 70) * 0.52),
        Math.max(38, (sk.range || 70) * 0.5)
      );
      this.attackCd = cd;

      // 箭幕：每第 5 次普攻追加一圈环形箭
      if (this.hasTalent('arrowCurtain')) {
        this.basicCount++;
        if (this.basicCount >= 5) {
          this.basicCount = 0;
          const base = this.player.facing;
          for (let i = 0; i < 8; i++) {
            this.spawnPlayerProjectile(base + (Math.PI * 2 / 8) * i, this.basicSkill, 0.6);
          }
          // 箭幕特效：双层草绿冲击环 + 八道向外箭影 + 名号提示
          this.addRing(this.player.x, this.player.y, 10, 46, '#cfe3b0', 0.3);
          this.addRing(this.player.x, this.player.y, 6, 30, '#f2ffd9', 0.2);
          this.addBurst(this.player.x, this.player.y - 10, '#cfe3b0', 10);
          this.addFloater(this.player.x, this.player.y - 80, '箭幕', '#cfe3b0', 24);
          for (let i = 0; i < 8; i++) {
            const d = base + (Math.PI * 2 / 8) * i;
            this.effects.push({
              kind: 'streak',
              x: this.player.x + Math.cos(d) * 40,
              y: this.player.y - 12 + Math.sin(d) * 40,
              angle: d, len: 24, w: 1.6, color: '#cfe3b0',
              life: 0.26, max: 0.26
            });
          }
        }
      }
    },

    // 自动战斗的普攻目标：远程优先打视野内最值得打的目标，
    // 避免移动时只朝正前方放箭、背后近身的怪一直打不到
    autoBasicTarget() {
      const range = (this.basicSkill.range || 600) + 24;
      let best = null, bestScore = Infinity;
      for (const m of this.monsters) {
        if (m.dead) continue;
        const d = U.dist(this.player, m);
        if (d > range) continue;
        if (!this.autoLineClear(m)) continue;
        let score = d;
        if (m.boss) score -= 260;
        else if (m.elite) score -= 70;
        if (m.aggro) score -= 30;
        if (m.hp / m.maxHp < 0.25) score -= 120;
        // 分裂小体不推进任务，除非没有别的目标
        if (m.noLoot) score += 240;
        if (score < bestScore) { bestScore = score; best = m; }
      }
      return best;
    },
    // 自动战斗保险：近身却长时间不掉血的怪视为被墙体/立件卡死，挪到就近的空地上。
    // 只在怪物自己附近找落脚点，不往玩家身边拉，避免把远处的怪群拽到脸上。
    autoWatchStuckMonsters(dt) {
      const now = this.time || 0;
      if (now < (this.autoStuckScanAt || 0)) return;
      this.autoStuckScanAt = now + 1;
      if (this.phase === 'boss') return;
      for (const m of this.monsters) {
        if (m.dead || m.boss) continue;
        const d = U.dist(this.player, m);
        if (d > 280) { m.autoStuckT = 0; m.autoStuckHp = m.hp; continue; }
        if (m.autoStuckHp !== m.hp) { m.autoStuckHp = m.hp; m.autoStuckT = 0; continue; }
        m.autoStuckT = (m.autoStuckT || 0) + 1;
        if (m.autoStuckT < 10) continue;
        for (let i = 0; i < 16; i++) {
          const a = Math.PI * 2 * i / 16;
          const rr = 34 + (i % 3) * 26;
          const x = m.x + Math.cos(a) * rr;
          const y = m.y + Math.sin(a) * rr;
          if (this.circleWall(x, y, m.r) || this.circleProp(x, y, m.r)) continue;
          if (U.dist(this.player, { x: x, y: y }) < 70) continue;
          m.x = x;
          m.y = y;
          m.aggro = true;
          break;
        }
        m.autoStuckT = 0;
        m.autoStuckHp = m.hp;
      }
      // 兜底：自动模式长时间零击杀（>30s）时，把 AI 死磕的那只怪挪到玩家外围的开阔地。
      // 极少数怪会被隔间/墙体锁死、永远走不过来，不兜底就会卡死通关进度
      if (now - (this.lastKillTime == null ? (this.autoStartedAt || now) : this.lastKillTime) < 30) return;
      const goalM = this.autoGoal && this.autoGoal.monster;
      if (!goalM || goalM.dead || goalM.boss) return;
      if (now < (this.autoRelocateAt || 0)) return;
      if (U.dist(this.player, goalM) < 260) return;
      this.autoRelocateAt = now + 4;
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * 2 * i / 16;
        const rr = 360 + (i % 4) * 30;
        const x = this.player.x + Math.cos(a) * rr;
        const y = this.player.y + Math.sin(a) * rr;
        if (this.circleWall(x, y, goalM.r) || this.circleProp(x, y, goalM.r)) continue;
        goalM.x = goalM._px = x;
        goalM.y = goalM._py = y;
        goalM.spawnX = x;
        goalM.spawnY = y;
        goalM.aggro = true;
        this.autoTarget = null;
        this.autoGoal = null;
        this.autoPack = null;
        this.autoDecision = null;
        this.autoSteer = null;
        break;
      }
    },
    autoCast() {
      if (this.player.hp <= 0) return;
      // 战吼蓄力/释放期间锁定动作：普攻与其他技能不插入，保证整套吼叫连贯播完
      if (this.roar) return;

      // 0 号位：普攻（移动中只打前方的目标，出手方向跟随移动方向）
      if (this.attackCd <= 0 && !this.whirl) {
        let target = null;
        if (this.autoMode && this.autoIsRanged()) {
          // 远程自动战斗：优先选择视野内收益最高的目标（残血/精英/首领/近身怪）
          target = this.autoBasicTarget();
        }
        if (!target) target = this.nearestMonsterInFront((this.basicSkill.range || 600) + 24);
        // 远程职业后撤风筝时也允许回头输出，避免拉开距离的全程没有伤害
        if (!target && this.autoMode && this.autoIsRanged()) {
          target = this.nearestMonster((this.basicSkill.range || 600) + 24);
        }
        // 近战锁定分裂小体时，优先改打能推进进度的本体
        if (this.autoMode && target && target.noLoot) {
          const alt = this.autoBasicTarget();
          if (alt && !alt.noLoot) target = alt;
        }
        // 目标被可破坏立件挡住：先打碎立件，避免双方隔着道具互相够不到
        if (this.autoMode && target) {
          const blocker = this.autoPropBlocker(target);
          if (blocker) {
            this.player.facing = U.angle(this.player, blocker);
            this.doBasic(this.player.facing);
            return;
          }
        }
        if (target) {
          let face = U.angle(this.player, target);
          // 高速移动目标按弹道飞行时间取提前量，否则远程 AI 会对着残影一直放空
          if (this.autoMode && this.autoIsRanged()) {
            const vx = target._vx || 0, vy = target._vy || 0;
            if (Math.hypot(vx, vy) > 40) {
              const fly = U.dist(this.player, target) / ((this.basicSkill && this.basicSkill.speed) || 800);
              face = U.angle(this.player, { x: target.x + vx * fly * 0.7, y: target.y + vy * fly * 0.7 });
            }
          }
          this.player.facing = face;
          this.doBasic(this.player.facing);
        } else if (this.autoMode) {
          // 自动战斗：前方挡路的可破坏道具直接砸碎，避免被卡在障碍前
          const prop = this.nearestBreakableInFront(84);
          if (prop) {
            this.player.facing = U.angle(this.player, prop.col);
            this.doBasic(this.player.facing);
          }
        }
      }

      // 1~4 号位：主动技能
      // 衔接间隔：同一帧只放一个主动技能，且两次之间至少隔 0.14 秒，
      // 避免多个技能同时就绪时一起打出、动作互相打断（旋风刚起手就被冲锋盖掉等）
      if (this._skillCastAt != null && this.time - this._skillCastAt < 0.14) return;
      const overload = this.hasTalent('overload');
      let pick = null;
      for (let i = 1; i < this.skillList.length; i++) {
        if (this.skillCd[i] > 0) continue;
        const sk = this.skillList[i];
        // 旋风持续期间不重复起手；冷却为 0 时可在旋转结束后无缝续转
        if (sk.id === 'whirlwind' && this.whirl) continue;
        // 旋风引导中冲锋与震动波不可用：保持就绪、先不消耗冷却，旋风结束当帧立刻接上
        //（战吼例外：转圈期间只要冷却好了就能放）
        if (this.whirl && (sk.id === 'charge' || sk.id === 'shockwave')) continue;
        // 大技能消耗精力：不足时跳过，等回复后自动释放
        const cost = sk.energy || 0;
        if (cost > 0 && this.player.stam < cost) continue;
        const angle = this.autoSkillAngle(sk);
        if (angle === null) continue;

        // 智能择优：保命位移 > 命中更多的范围技能 > 单体输出
        const score = this.autoSkillScore(sk, angle);
        if (score <= 0) continue;
        if (!pick || score > pick.score) pick = { i, sk, angle, score, cost };
      }
      if (!pick) return;
      const i = pick.i, sk = pick.sk, angle = pick.angle, cost = pick.cost;

      // 奥能过载：每 3 次主动技能后的下一发翻倍
      let buffed = false;
      if (overload && this.overloadCount >= 3) {
        buffed = true;
        this.overloadCount = 0;
      }

      this.skillCd[i] = this.skillCooldown(sk);
      // 冲锋连晕叠层：每次达标累计，最多把冲锋冷却缩短 5 秒
      if (sk.id === 'charge' && this.chargeCdrBonus) {
        this.skillCd[i] = Math.max(0.5, this.skillCd[i] - this.chargeCdrBonus);
      }
      if (cost > 0) this.player.stam = Math.max(0, this.player.stam - cost);
      this._overloadCast = buffed;
      this.performSkill(sk, this.char.skills[sk.id] || 1, 'auto', angle);
      this._overloadCast = false;
      if (overload && !buffed) this.overloadCount++;
      // 本帧只出手一次，其余就绪技能等下一个衔接间隔再放
      this._skillCastAt = this.time;
    },

    // 冲锋残影：把角色当前姿态画进离屏画布再整体染色，得到一张可复用的暖色剪影
    chargeGhostImage(phase, flip) {
      if (typeof document === 'undefined' || !DG.art.heroFor) return null;
      const hero = DG.art.heroFor('warrior');
      if (!hero || !hero.canvasDraw) return null;
      const W = 190, H = 190, ox = W / 2, oy = H - 30;
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const g = cv.getContext('2d');
      hero.canvasDraw(g, ox, oy, { scale: 0.7273, state: 'walk', walkPhase: phase, t: 0, flip: !!flip });
      g.globalCompositeOperation = 'source-atop';
      // 上亮下暗的暖色渐变：头顶接近白热、腰部橙红、脚下暗红余烬，像被速度点燃的火影
      const lg = g.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, '#ffd39a');
      lg.addColorStop(0.3, '#ffab63');
      lg.addColorStop(0.55, '#ff6a32');
      lg.addColorStop(0.78, '#c02f18');
      lg.addColorStop(1, '#3f0c06');
      g.fillStyle = lg;
      g.fillRect(0, 0, W, H);
      return cv;
    },

    // 索敌：移动中只锁定移动方向前方的目标，避免角色转身向后出手
    nearestMonsterInFront(maxDist) {
      const dir = this.moveDirAngle;
      if (dir == null) return this.nearestMonster(maxDist);
      let best = null;
      let bestD = maxDist || Infinity;
      for (const m of this.monsters) {
        if (m.dead) continue;
        const d = U.dist(this.player, m);
        if (d >= bestD) continue;
        if (Math.abs(U.angleDiff(U.angle(this.player, m), dir)) > 1.0) continue;
        best = m;
        bestD = d;
      }
      return best;
    },

    // 旋风：5 秒持续旋转，与冷却无关，时间不到不会停；期间可移动，每 0.1 秒持续结算伤害
    updateWhirl(dt) {
      const w = this.whirl;
      if (!w) {
        this.whirlIdleT = (this.whirlIdleT || 0) + dt;
        return;
      }
      this.whirlIdleT = 0;
      this.whirlChainT = (this.whirlChainT || 0) + dt;
      // 旋转角持续累加（2.4 圈/秒）：起手 0.16 秒平滑加速，避免一上来就满速的顿挫
      const ch = this.whirlChainT || 0;
      const ramp = ch < 0.16 ? 0.45 + 0.55 * (ch / 0.16) : 1;
      this.whirlSpin = (this.whirlSpin || 0) + dt * Math.PI * 2 * 2.4 * ramp;
      w.t += dt;
      w.ftick -= dt;
      const show = w.ftick <= 0;
      if (show) w.ftick += 0.5;
      w.tick -= dt;
      if (w.tick <= 0) {
        w.tick += 0.1;
        for (const m of this.monsters) {
          if (m.dead) continue;
          if (U.dist(this.player, m) <= w.radius + m.r) {
            // 持续伤害：每 0.1 秒扣一次，血条平滑下降；每 0.5 秒汇总飘一次字
            const r = this.rollHit(w.mult * 0.05, w.sk, m);
            this.hitMonster(m, r.dmg, r.crit, { quiet: true });
            m.whirlAcc = (m.whirlAcc || 0) + r.dmg;
            if (show) {
              m.flash = 0.13;
              this.addBlood(m);
              this.addFloater(m.x + U.rand(-6, 6), m.y - m.r - 20,
                U.fmt(Math.round(m.whirlAcc)), '#f2ead9', 21);
              m.whirlAcc = 0;
            }
          }
        }
      }
      if (w.t >= w.dur) this.whirl = null;
    },

    // 旋风：起手时从身边甩出 3 个小旋风，在地图上无序游走、持续伤害、撞墙/道具回弹
    spawnTornadoes() {
      const w = this.whirl;
      if (!w) return;
      if (!this.tornadoes) this.tornadoes = [];
      // 同屏最多保留 9 个，防止高冷却缩减下无限叠加
      while (this.tornadoes.length > 6) this.tornadoes.shift();
      for (let i = 0; i < 3; i++) {
        const a = (this.whirlSpin || 0) + i * Math.PI * 2 / 3 + U.rand(-0.25, 0.25);
        const d = U.rand(34, 58);
        let x = U.clamp(this.player.x + Math.cos(a) * d, 60, (this.arenaW || 3600) - 60);
        let y = U.clamp(this.player.y + Math.sin(a) * d, 60, (this.arenaH || 3840) - 60);
        // 出生点若落在墙体/道具里（贴着地图边缘起手时可能发生），退回玩家脚下，
        // 否则旋风会在障碍里原地抖动到消失
        if (this.circleWall(x, y, 26) || this.circleProp(x, y, 26)) {
          x = this.player.x;
          y = this.player.y;
        }
        const dir = U.rand(0, Math.PI * 2);
        this.tornadoes.push({
          x, y,
          vx: Math.cos(dir) * 234, vy: Math.sin(dir) * 234,
          t: 0, life: 5, r: 26,
          spin: dir, phase: U.rand(0, Math.PI * 2),
          tick: U.rand(0.05, 0.2), ftick: 0.5, acc: 0,
          turn: U.rand(0.3, 0.8),
          // 游走范围锚点：以出生点为圆心，半径约为原先的两倍
          ox: x, oy: y, roam: 780,
          sk: w.sk, mult: w.mult
        });
        this.addRing(x, y, 8, 44, 'rgba(255,255,255,0.55)', 0.3);
      }
    },

    updateTornadoes(dt) {
      const list = this.tornadoes;
      if (!list || !list.length) return;
      const aw = this.arenaW || 3600, ah = this.arenaH || 3840, SPEED = 234;
      for (let i = list.length - 1; i >= 0; i--) {
        const t = list[i];
        t.t += dt;
        if (t.t >= t.life) { list.splice(i, 1); continue; }
        t.spin += dt * 9.5;
        // 无序游走：每隔 0.3~0.8 秒随机拐一个弯；超出游走范围就往回拐
        t.turn -= dt;
        if (t.turn <= 0) {
          const dx = (t.ox != null ? t.ox : t.x) - t.x;
          const dy = (t.oy != null ? t.oy : t.y) - t.y;
          const roam = t.roam || 780;
          const a = dx * dx + dy * dy > roam * roam * 0.8
            ? Math.atan2(dy, dx) + U.rand(-0.7, 0.7)
            : Math.atan2(t.vy, t.vx) + U.rand(-1.4, 1.4);
          t.vx = Math.cos(a) * SPEED;
          t.vy = Math.sin(a) * SPEED;
          t.turn = U.rand(0.35, 0.85);
        }
        // 回弹：墙壁、场景道具、地图边缘，撞上就反向，继续游走
        const nx = t.x + t.vx * dt;
        if (nx < t.r + 40 || nx > aw - t.r - 40 || this.circleWall(nx, t.y, t.r) || this.circleProp(nx, t.y, t.r)) {
          t.vx = -t.vx;
        } else {
          t.x = nx;
        }
        const ny = t.y + t.vy * dt;
        if (ny < t.r + 40 || ny > ah - t.r - 40 || this.circleWall(t.x, ny, t.r) || this.circleProp(t.x, ny, t.r)) {
          t.vy = -t.vy;
        } else {
          t.y = ny;
        }
        // 持续伤害：每 0.2 秒对范围内敌人结算一次，0.5 秒汇总飘字
        t.tick -= dt;
        if (t.tick <= 0) {
          t.tick += 0.2;
          for (const m of this.monsters) {
            if (m.dead) continue;
            if (U.dist(t, m) > t.r + m.r + 8) continue;
            const r = this.rollHit((t.mult || 1) * 0.05, t.sk, m);
            this.hitMonster(m, r.dmg, r.crit, { quiet: true });
            t.acc += r.dmg;
          }
        }
        t.ftick -= dt;
        if (t.ftick <= 0) {
          t.ftick += 0.5;
          if (t.acc > 0) {
            this.addFloater(t.x + U.rand(-6, 6), t.y - 74, U.fmt(t.acc), '#eef7ff', 19);
            t.acc = 0;
          }
          // 持续伤害也别让怪物“毫无反应”：和旋风斩一样每 0.5 秒补一次闪白
          for (const m of this.monsters) {
            if (m.dead) continue;
            if (U.dist(t, m) <= t.r + m.r + 8) m.flash = Math.max(m.flash, 0.13);
          }
        }
      }
    },

    // 战吼：蓄力到 charge 时刻释放声浪，随后收势；全程占用动作（autoCast 会让位）
    updateRoar(dt) {
      const r = this.roar;
      if (!r) return;
      r.t += dt;
      if (!r.fired && r.t >= r.charge) {
        r.fired = true;
        this.releaseWarcry(r);
      }
      // 回声脉冲：主声浪推开 0.16 秒后再补一圈弱一档的黄色余波
      if (r.fired && !r.echo && r.t >= r.charge + 0.16) {
        r.echo = true;
        this.addRing(this.player.x, this.player.y, 30, r.radius * 0.72, 'rgba(255,233,168,0.7)', 0.42);
        this.effects.push({
          kind: 'roarWave', x: this.player.x, y: this.player.y,
          r0: 40, r1: r.radius * 0.92, color: '#ffd27a', life: 0.5, max: 0.5
        });
        if (DG.audio) DG.audio.play('barbWarcry', { vol: 0.35 });
      }
      if (r.t >= r.total) this.roar = null;
    },

    // 劈砍：刀光扫出后再结算，命中范围与刀光亮部完全一致
    updateChop(dt) {
      const st = this.chopStrike;
      if (!st) return;
      st.t += dt;
      if (st.t < st.delay) return;
      this.chopStrike = null;
      if (this.finished || this.ending || this.player.hp <= 0) return;
      const fx = DG.art.barbarian;
      const arc = fx ? fx.slashArc : this.skillArc(st.sk);
      const reach = fx ? fx.slashReach : st.sk.range;
      for (const m of this.monsters) {
        if (m.dead) continue;
        if (U.dist(this.player, m) > reach + m.r) continue;
        if (U.angleDiff(U.angle(this.player, m), st.ang) > arc / 2) continue;
        const r = this.rollHit(st.mult, st.sk, m);
        // 方向性血幕 + 短时出血，与死亡迸血可同时存在
        this.hitMonster(m, r.dmg, r.crit, { chop: true, angle: st.ang });
      }
    },

    releaseWarcry(r) {
      const sk = r.sk;
      for (const m of this.monsters) {
        if (m.dead) continue;
        if (U.dist(this.player, m) > r.radius + m.r) continue;
        const hit = this.rollHit(r.mult, sk, m);
        this.hitMonster(m, hit.dmg, hit.crit);
        if (m.dead) continue;
        // 恐惧：头顶出现惊恐表情，同时被减速
        m.fear = Math.max(m.fear || 0, 2.4);
        if (r.freeze) {
          m.slow = Math.max(m.slow || 0, 1);
          m.slowFactor = 1;
        } else if (sk.slowDur) {
          m.slow = Math.max(m.slow || 0, r.slowDur);
          m.slowFactor = r.slowFactor;
        }
      }
      // 战吼声浪：三层黄色同心冲击波由内向外扩散并逐渐淡出
      this.addRing(this.player.x, this.player.y, 26, r.radius, '#ffe9a8', 0.34);
      this.addRing(this.player.x, this.player.y, 16, r.radius * 0.84, '#f0b981', 0.5);
      this.addRing(this.player.x, this.player.y, 10, r.radius * 1.08, 'rgba(240,185,129,0.55)', 0.72);
      // 环形光浪：在细环之间补一层填充的黄色亮光，人群里也能看清扩散的声浪
      this.effects.push({
        kind: 'roarWave', x: this.player.x, y: this.player.y,
        r0: 22, r1: r.radius * 1.02, color: '#ffe08a', life: 0.52, max: 0.52
      });
      this.effects.push({
        kind: 'roarWave', x: this.player.x, y: this.player.y,
        r0: 14, r1: r.radius * 1.18, color: '#fff3c4', life: 0.78, max: 0.78
      });
      // 贴身核心闪光：胸口炸开的一团金白亮光，短促刺亮
      this.effects.push({
        kind: 'roarCore', x: this.player.x, y: this.player.y - 30,
        r0: 12, r1: 68, color: '#fff6d8', life: 0.24, max: 0.24
      });
      // 地面尘爆：金色碎屑贴着地面向四周掀开
      for (let i = 0; i < 18; i++) {
        const a = (Math.PI * 2 / 18) * i + U.rand(-0.12, 0.12);
        const sp = U.rand(150, 330);
        this.effects.push({
          kind: 'spark', x: this.player.x + Math.cos(a) * 18, y: this.player.y + Math.sin(a) * 6,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.35 - U.rand(10, 40),
          r: U.rand(1.6, 3.2), color: i % 3 === 0 ? '#fff3c4' : '#f0c98a',
          life: U.rand(0.32, 0.58), max: 0.58
        });
      }
      this.addBurst(this.player.x, this.player.y - 24, '#ffe9a8', 10);
      this.shake = Math.max(this.shake, 0.3);
      // 音效：人声吼叫 + 合成冲击波，两层叠在一起
      if (DG.audio) {
        DG.audio.play('barbWarcry', { vol: 1 });
        if (DG.audio.warcryBurst) DG.audio.warcryBurst();
      }
    },

    autoSkillAngle(sk) {
      const near = this.nearestMonsterInFront();
      const dir = this.moveDirAngle;

      if (sk.type === 'dash') {
        if (sk.damageOnPath) {
          if (!near || U.dist(this.player, near) > sk.dist * 1.4 + near.r) return null;
          return U.angle(this.player, near);
        }
        // 位移保命：有弹道/预警威胁时优先脱离，其次才是血量低或近身敌人多
        const hpPct = this.player.hp / this.player.maxHp;
        const threat = this.autoHardDangerAt(this.player.x, this.player.y);
        const close = this.monsters.filter(m => !m.dead && U.dist(this.player, m) < 150).length;
        if (!threat && hpPct > 0.6 && close < 2) return null;
        // 正在躲技能时沿着躲避方向翻滚/闪现，别往危险里冲
        if (threat && this.autoEvade && this.autoEvade.until > (this.time || 0)) {
          return Math.atan2(this.autoEvade.dir.y, this.autoEvade.dir.x);
        }
        // 移动中沿移动方向翻滚，避免看起来是在往后退
        if (dir != null) return dir;
        if (threat) {
          const away = this.autoRetreatAngle();
          if (away != null) return away;
        }
        if (!near) return null;
        if (U.dist(this.player, near) > 170) return null;
        return U.angle(near, this.player);
      }

      if (!near) return null;
      const radius = sk.radius ? this.skillRadius(sk) : (sk.range || 0);
      if (U.dist(this.player, near) > radius + near.r) return null;
      // 弹道 / 散射：朝能覆盖最多敌人的角度出手
      if (sk.type === 'projectile' || sk.type === 'spread') {
        const cluster = this.autoClusterAngle(sk);
        if (cluster != null) return cluster;
      }
      return U.angle(this.player, near);
    },

    // 在怪物方向里挑命中数最多的角度（多重箭 / 箭雨 / 贯穿弹道尤其受益）
    autoClusterAngle(sk) {
      let best = null, bestHits = 0;
      const seen = [];
      for (const m of this.monsters) {
        if (m.dead) continue;
        const a = U.angle(this.player, m);
        let dup = false;
        for (const s of seen) {
          if (Math.abs(U.angleDiff(a, s)) < 0.08) { dup = true; break; }
        }
        if (dup) continue;
        seen.push(a);
        let hits = 0;
        for (const o of this.monsters) {
          if (!o.dead && this.autoSkillHitsMonster(o, sk, a)) hits++;
        }
        if (hits > bestHits) { bestHits = hits; best = a; }
      }
      return best;
    },
    autoSkillHitsMonster(m, sk, angle) {
      const p = this.player;
      const d = U.dist(p, m);
      const rx = m.x - p.x, ry = m.y - p.y;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      if (sk.type === 'melee') {
        if (d > (sk.range || 84) + m.r) return false;
        return Math.abs(U.angleDiff(U.angle(p, m), angle)) <= this.skillArc(sk) / 2 + Math.atan2(m.r, Math.max(1, d));
      }
      if (sk.type === 'nova' || sk.type === 'aoeSelf') {
        return d <= this.skillRadius(sk) + m.r;
      }
      if (sk.type === 'dash') {
        if (!sk.damageOnPath) return false;
        const len = this.skillDist(sk) || sk.dist || 200;
        const proj = rx * cos + ry * sin;
        if (proj < -m.r || proj > len + m.r) return false;
        return Math.abs(rx * sin - ry * cos) <= 30 + m.r;
      }
      if (sk.type === 'projectile') {
        if (d > (sk.range || 500) + m.r) return false;
        const proj = rx * cos + ry * sin;
        if (proj < 0) return false;
        return Math.abs(rx * sin - ry * cos) <= 26 + m.r;
      }
      if (sk.type === 'spread') {
        if (d > (sk.range || 500) + m.r) return false;
        const n = this.skillCount(sk);
        const cone = n > 1 ? (sk.spread || 0.5) * (n - 1) / 2 : 0;
        return Math.abs(U.angleDiff(U.angle(p, m), angle)) <= cone + 0.18 + Math.atan2(m.r, Math.max(1, d));
      }
      return false;
    },
    autoSkillScore(sk, angle) {
      // 保命位移优先级最高：被预警锁定或残血时立刻脱离
      if (sk.type === 'dash' && !sk.damageOnPath) {
        const threat = this.autoHardDangerAt(this.player.x, this.player.y);
        const hpPct = this.player.hp / this.player.maxHp;
        if (threat) return 1200 + (1 - hpPct) * 600;
        if (hpPct < 0.55) return 300;
        return 0;
      }
      let hits = 0, bossHit = false;
      for (const m of this.monsters) {
        if (m.dead) continue;
        if (!this.autoSkillHitsMonster(m, sk, angle)) continue;
        hits++;
        if (m.boss) bossHit = true;
      }
      if (!hits) return 0;
      const lv = this.char.skills[sk.id] || 1;
      const mult = sk.mult ? sk.mult(lv) : 1;
      let score = hits * mult * 10;
      // 多目标时范围技能更值钱；命中首领额外加分
      if (hits > 1) score += (hits - 1) * 12;
      if (bossHit) score += 40;
      if (sk.type === 'dash') score *= 1.15;
      score -= (sk.energy || 0) * 0.15;
      return score;
    },

    performSkill(sk, lv, source, angle) {
      const ang = (typeof angle === 'number')
        ? angle
        : U.angle(this.player, this.aimPos());
      this.player.facing = ang;
      // 远程技能同样播放拉弓动作
      if (sk.type === 'projectile' || sk.type === 'spread') {
        this.player.atkDur = 0.46;
        this.player.atkAnim = 0.46;
      }
      const mult = sk.mult(lv) * (this._overloadCast ? 2.2 : 1);
      const self = this;

      // 旋风引导期间：挥砍、冲锋与震动波不可同时释放，战吼不受限制
      if (this.whirl && (sk.id === 'cleave' || sk.id === 'charge' || sk.id === 'shockwave')) return;

      // 技能音效：普攻按职业区分，主动技能按技能 id 取解包音频
      if (DG.audio) {
        if (source === 'basic') {
          const basicSfx = sk.classId === 'ranger' ? 'rangerArrow'
            : (sk.classId === 'mage' ? 'skillChargeArc' : 'barbAttack');
          DG.audio.play(basicSfx, { vol: 0.75, rate: 0.96 + Math.random() * 0.08 });
        } else {
          const SFX = {
            whirlwind: 'barbWhirlwind', charge: 'barbCharge', shockwave: 'barbShockwave', warcry: 'barbWarcry',
            multishot: 'rangerMultishot', roll: 'rangerRoll', snipe: 'rangerSnipe', arrowrain: 'rangerArrowrain',
            firebolt: 'skillChargeArc', frostnova: 'skillFrost', blink: 'rangerRoll',
            meteor: 'skillThunder', chainbolt: 'skillThunder'
          };
          // 战吼的声音等到蓄力结束、冲击波释放的那一刻再播
          if (SFX[sk.id] && sk.id !== 'warcry') DG.audio.play(SFX[sk.id], { vol: 0.9 });
        }
      }

      if (this._overloadCast) {
        this.addFloater(this.player.x, this.player.y - 46, '奥能过载', '#c9a7f5', 24);
      }

      if (sk.type === 'melee') {
        // 野蛮人劈砍的刀光由英雄自绘：命中扇形与半径直接取刀光可见亮部的真实参数，
        // 否则会出现“刀光明明扫到敌人却没判中”的错位。其他职业仍用技能配置。
        const fxHero = sk.slashFx ? DG.art.barbarian : null;
        if (fxHero) {
          // 与刀光同步：等刃口真正扫出后再结算，让血幕、数字和刀光落在同一拍。
          // 结算瞬间按当时站位重算，怪物在挥砍过程中走进/走出刀光都能正确判定。
          this.chopStrike = {
            t: 0,
            delay: Math.max(0.08, (this.player.atkDur || 0.46) * 0.34),
            ang, mult, sk
          };
        } else {
          const arc = this.skillArc(sk);
          const hit = [];
          for (const m of this.monsters) {
            if (m.dead) continue;
            const d = U.dist(this.player, m);
            if (d > sk.range + m.r) continue;
            const a = U.angle(this.player, m);
            if (U.angleDiff(a, ang) > arc / 2) continue;
            hit.push(m);
          }
          for (const m of hit) {
            const r = this.rollHit(mult, sk, m);
            this.hitMonster(m, r.dmg, r.crit);
          }
        }
        // 野蛮人劈砍的刀光由英雄模块自己沿斧刃绘制，其他职业仍走程序化弧线
        if (!sk.slashFx) {
          const arc = this.skillArc(sk);
          this.effects.push({
            kind: 'slash', x: this.player.x, y: this.player.y,
            angle: ang, radius: sk.range, arc,
            color: sk.color, life: 0.16, max: 0.16
          });
        }
      } else if (sk.type === 'projectile') {
        this.spawnPlayerProjectile(ang, sk, mult);
        if (sk.classId === 'ranger') this.rangerShotFx(sk, ang, 1);
      } else if (sk.type === 'spread') {
        const n = Math.max(1, this.skillCount(sk));
        const gap = n > 1 ? sk.spread / (n - 1) : 0;
        for (let i = 0; i < n; i++) {
          const offset = (i - (n - 1) / 2) * gap;
          this.spawnPlayerProjectile(ang + offset, sk, mult);
        }
        if (sk.classId === 'ranger') this.rangerShotFx(sk, ang, n);
      } else if (sk.type === 'aoeSelf') {
        const radius = this.skillRadius(sk);
        if (sk.id === 'whirlwind') {
          // 旋风：进入 5 秒持续旋转，期间可自由移动，每 0.1 秒结算一次范围伤害
          // 连续施放（CD 压到 0）时沿用上一次的角度，避免每轮重新起转
          if (!((this.whirlIdleT || 99) < 0.3)) this.whirlChainT = 0;
          // 起手即进入不可阻挡：清掉残余硬直与击退
          this.player.hurtT = 0;
          this.player.kbX = 0;
          this.player.kbY = 0;
          this.whirl = { t: 0, dur: 5, tick: 0.1, ftick: 0.5, radius, sk, mult };
          // 起手甩出 3 个游走旋风
          this.spawnTornadoes();
        } else {
          for (const m of this.monsters) {
            if (m.dead) continue;
            if (U.dist(this.player, m) <= radius + m.r) {
              const r = this.rollHit(mult, sk, m);
              this.hitMonster(m, r.dmg, r.crit);
            }
          }
          this.addRing(this.player.x, this.player.y, 20, radius, sk.color, 0.4);
          this.shake = Math.max(this.shake, 0.16);
        }
      } else if (sk.type === 'nova') {
        const radius = this.skillRadius(sk);
        const slowDur = this.skillSlowDur(sk);
        const slowFactor = this.skillSlowFactor(sk, sk.slow || 0.3);
        const freeze = this.hasTalent('absoluteZero');
        // 战吼：先举斧蓄力，0.42 秒后释放；伤害/减速/恐惧统一在释放瞬间结算
        if (sk.id === 'warcry' && !this.roar) {
          this.roar = { t: 0, charge: 0.42, total: 0.95, radius, mult, sk, slowDur, slowFactor, freeze, fired: false };
          this.player.hurtT = 0;
          this.player.kbX = 0;
          this.player.kbY = 0;
          this.attackCd = Math.max(this.attackCd, 0.7);
          return;
        }
        for (const m of this.monsters) {
          if (m.dead) continue;
          if (U.dist(this.player, m) <= radius + m.r) {
            const r = this.rollHit(mult, sk, m);
            this.hitMonster(m, r.dmg, r.crit);
            if (sk.slowDur && !m.dead) {
              if (freeze) {
                m.slow = Math.max(m.slow, 1);
                m.slowFactor = 1;
              } else {
                m.slow = Math.max(m.slow, slowDur);
                m.slowFactor = slowFactor;
              }
            }
          }
        }
        this.addRing(this.player.x, this.player.y, 24, radius, sk.color, 0.55);
        this.addRing(this.player.x, this.player.y, 10, radius * 0.7, '#cfe9f5', 0.35);
      } else if (sk.type === 'dash') {
        const ox = this.player.x, oy = this.player.y;
        // 分步位移并检测墙体，冲刺不会穿墙；技能树可延长冲锋距离
        const dist = this.skillDist(sk) || sk.dist;
        const steps = Math.max(1, Math.ceil(dist / 12));
        const stepX = Math.cos(ang) * dist / steps;
        const stepY = Math.sin(ang) * dist / steps;
        for (let i = 0; i < steps; i++) {
          this.movePlayer(this.player, stepX, stepY, this.player.r);
        }
        const nx = this.player.x, ny = this.player.y;

        if (sk.damageOnPath) {
          let dashMult = mult;
          if (sk.id === 'charge' && this.hasTalent('breaker')) {
            dashMult *= 2;
            this.talentTimers.chargeCrit = 3;
          }
          for (const m of this.monsters) {
            if (m.dead) continue;
            if (U.distToSegment(m.x, m.y, ox, oy, nx, ny) < m.r + 32) {
              const r = this.rollHit(dashMult, sk, m);
              self.hitMonster(m, r.dmg, r.crit);
            }
          }
          this.addRing(nx, ny, 16, 60, sk.trailColor || sk.color, 0.3);
        }

        // 冲锋：撞晕 + 两道黑色剪影 + 连晕引爆
        if (sk.id === 'charge') {
          // 释放瞬间场上仍有 10 名以上眩晕敌人 → 本次眩晕范围翻倍并引爆
          let stunnedOnField = 0;
          for (const m of this.monsters) if (!m.dead && !m.boss && m.stun > 0) stunnedOnField++;
          const surge = stunnedOnField >= 10;
          const stunR = 50 * (surge ? 2 : 1);

          const ghost = this.chargeGhostImage(this.player.walkPhase || 0, !!this.player.flip);
          const footY = this.player.r * 0.92;
          if (ghost) {
            // 冲锋残影：沿路径等距留 5 个残影，越靠近起点越淡、消失越快，形成速度拖尾
            const ks = [0.12, 0.29, 0.46, 0.63, 0.80];
            for (let i = 0; i < ks.length; i++) {
              const k = ks[i];
              const life = 0.44 + i * 0.05;
              this.effects.push({
                kind: 'chargeGhost', img: ghost,
                x: ox + (nx - ox) * k,
                y: oy + (ny - oy) * k + footY,
                alpha: 0.56 - i * 0.09,
                life, max: life
              });
            }
          }
          // 冲锋速度线：整条路径上两道拖尾光带，再从起点到终点撒一把短线
          const dashLen = Math.hypot(nx - ox, ny - oy);
          this.effects.push({
            kind: 'streak', x: nx, y: ny + footY - 26,
            angle: ang, len: dashLen, w: 15,
            color: 'rgba(255,170,110,0.5)', life: 0.24, max: 0.24
          });
          this.effects.push({
            kind: 'streak', x: nx, y: ny + footY - 26,
            angle: ang, len: dashLen * 0.86, w: 5,
            color: 'rgba(255,226,192,0.85)', life: 0.2, max: 0.2
          });
          for (let i = 0; i < 6; i++) {
            const k = (i + 0.5) / 6;
            this.effects.push({
              kind: 'streak',
              x: ox + (nx - ox) * k,
              y: oy + (ny - oy) * k + footY - 20 + U.rand(-18, 18),
              angle: ang, len: U.rand(26, 70), w: U.rand(1.4, 3),
              color: '#ffb478', life: U.rand(0.16, 0.3), max: 0.3
            });
          }
          this.addRing(ox, oy, 8, 42, '#d99a63', 0.26);

          let stunned = 0;
          for (const m of this.monsters) {
            if (m.dead || m.boss) continue;
            if (U.distToSegment(m.x, m.y, ox, oy, nx, ny) < m.r + stunR) {
              m.stun = Math.max(m.stun || 0, 2);
              m.action = null;
              stunned++;
            }
          }
          // 一次撞晕 5 人 → 冲锋冷却永久 -1 秒（最多 -5 秒）
          if (stunned >= 5) this.chargeCdrBonus = Math.min(5, (this.chargeCdrBonus || 0) + 1);

          if (surge) {
            for (const m of this.monsters) {
              if (m.dead) continue;
              if (U.dist(m, this.player) < 160 + m.r) {
                const r = self.rollHit(mult * 1.5, sk, m);
                self.hitMonster(m, r.dmg, r.crit);
              }
            }
            this.addRing(nx, ny, 20, 160, '#ff9a4d', 0.45);
            this.addBurst(nx, ny, '#ffb765', 20);
          }
        }

        if (sk.id === 'charge' && this.hasTalent('chargeHaste')) this.talentTimers.chargeHaste = 3;
        if (sk.id === 'roll') {
          if (this.hasTalent('rollHaste')) this.talentTimers.rollHaste = 3;
          if (this.hasTalent('shadowStep')) {
            this.fireShadowStep();
            // 影步：翻滚路径留下三个阶段残像
            for (let i = 1; i <= 3; i++) {
              const k = i / 4;
              this.effects.push({
                kind: 'afterimage',
                x: ox + (nx - ox) * k,
                y: oy + (ny - oy) * k + this.player.r * 0.92,
                flip: !!this.player.flip,
                phase: (this.player.walkPhase || 0) - k * 2,
                life: 0.22 + i * 0.05, max: 0.22 + i * 0.05
              });
            }
          }
          // 翻滚残影：沿位移轨迹留下速度线，强调轻盈的游侠身法
          for (let i = 0; i < 7; i++) {
            const k = i / 6;
            this.effects.push({
              kind: 'streak',
              x: ox + (nx - ox) * k + U.rand(-9, 9),
              y: oy + (ny - oy) * k + U.rand(-11, 11),
              angle: ang, len: U.rand(20, 44), w: U.rand(1.2, 2.6),
              color: '#bfe0c2', life: U.rand(0.18, 0.34), max: 0.34
            });
          }
          this.addRing(ox, oy, 10, 42, '#9fc0a8', 0.3);
          this.effects.push({
            kind: 'rollMark', x: (ox + nx) / 2, y: (oy + ny) / 2,
            angle: ang, len: Math.hypot(nx - ox, ny - oy) * 0.7,
            color: sk.fx && sk.fx.markColor || sk.trailColor, life: 0.38, max: 0.38
          });
        }

        this.addBurst(ox, oy, sk.trailColor || sk.color, 8);
        let invuln = sk.invuln || 0;
        if (sk.id === 'roll' && this.hasTalent('rollInvuln')) invuln += 0.3;
        this.player.invuln = Math.max(this.player.invuln, invuln);
        this.addBurst(nx, ny, sk.trailColor || sk.color, 6);
      }

      void source;
    },

    // 影步：翻滚结束向最近敌人射出 3 支穿透箭
    fireShadowStep() {
      const near = this.nearestMonsterInFront(560);
      if (!near) return;
      const base = U.angle(this.player, near);
      const shot = Object.assign({}, this.basicSkill, { pierce: 1 });
      for (let i = -1; i <= 1; i++) {
        this.spawnPlayerProjectile(base + i * 0.09, shot, 1.2, { variant: 'shadow' });
      }
      this.effects.push({
        kind: 'slash', x: this.player.x, y: this.player.y, angle: base,
        radius: 42, arc: 0.5, color: '#9fc0a8', life: 0.16, max: 0.16
      });
    },

    // 游侠出手特效：穿云箭蓄力白光 / 多重箭与箭雨的扇形弓口闪光、草地碎屑
    rangerShotFx(sk, ang, n) {
      const px = this.player.x, py = this.player.y;
      const mz = this.muzzlePoint(ang, 26);
      const mx = mz.x;
      const my = mz.y;
      if (sk.id === 'snipe') {
        this.addRing(px, py, 6, 36, '#f6ffdf', 0.24);
        this.addBurst(mx, my, '#f6ffdf', 7);
        this.effects.push({
          kind: 'slash', x: mx, y: my, angle: ang, radius: 36,
          arc: 0.6, color: '#f6ffdf', life: 0.15, max: 0.15
        });
        this.effects.push({
          kind: 'snipeCharge', x: mx, y: my, angle: ang,
          color: '#f6ffdf', life: 0.2, max: 0.2
        });
        this.shake = Math.max(this.shake, 0.1);
      } else if (n > 1) {
        const rain = sk.id === 'arrowrain';
        this.effects.push({
          kind: 'slash', x: mx, y: my, angle: ang,
          radius: rain ? 54 : 44, arc: sk.spread + 0.18,
          color: rain ? '#c2dbaa' : '#d6ecc0',
          life: 0.2, max: 0.2
        });
        this.addBurst(mx, my, rain ? '#c2dbaa' : '#d6ecc0', rain ? 8 : 4);
        if (rain) {
          const dist = 260;
          this.effects.push({
            kind: 'arrowRainMarker', x: px + Math.cos(ang) * dist, y: py + Math.sin(ang) * dist,
            angle: ang, radius: 86, arc: sk.spread, color: '#c2dbaa', life: 0.34, max: 0.34
          });
        }
        if (rain) this.shake = Math.max(this.shake, 0.07);
      }
    },

    // 玩家出手点：优先取角色美术给出的弓上箭尖位置（随武器转动、出手前伸而移动），
    // 美术没提供时才退回腰部高度的兜底，绝不会再从角色脚下冒出。
    muzzlePoint(ang, dist) {
      const p = this.player;
      const a = ang || 0;
      const hero = this.cls && DG.art.heroFor ? DG.art.heroFor(this.cls.id) : null;
      if (hero && hero.muzzle) {
        const m = hero.muzzle(p, this);
        if (m) return { x: p.x + m.x, y: p.y + p.r * 0.92 + m.y };
      }
      const d = dist == null ? 14 : dist;
      return {
        x: p.x + Math.cos(a) * d,
        y: p.y + p.r * 0.92 - 22 + Math.sin(a) * d * 0.5
      };
    },

    spawnPlayerProjectile(ang, sk, mult, opt) {
      const speed = sk.speed || 600;
      const life = (sk.range || 600) / speed + 0.06;
      const mz = this.muzzlePoint(ang, 14);
      this.projectiles.push({
        team: 'player',
        x: mz.x,
        y: mz.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        r: 5,
        mult,
        skill: sk,
        color: sk.color,
        variant: opt && opt.variant || sk.fx && sk.fx.variant || '',
        impact: sk.fx && sk.fx.impact || '',
        life, maxLife: life,
        pierce: this.skillPierce(sk),
        hit: []
      });
      this.addBurst(this.player.x + Math.cos(ang) * 22, this.player.y + Math.sin(ang) * 22, sk.color, sk.id === 'snipe' ? 5 : 3);
    }
  });
})();
