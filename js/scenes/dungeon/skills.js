/* 副本战斗 · 技能层：普攻与主动技能的自动释放 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
    autoMoveDirection() {
      const now = this.time || 0;
      if (this.autoDecision && this.autoDecision.until > now) return this.autoDecision.dir;
      const goal = this.autoGoalTarget();
      const evade = this.autoEvadeDirection(goal);
      if (evade) return this.autoCommitMove(this.autoSmoothDirection(evade, 0.42), goal);
      if (this.autoDetour && this.autoDetour.until > now) return this.autoCommitMove(this.autoDetour.dir, goal);
      if (!goal) return this.autoCommitMove(this.autoSmoothDirection({ x: 0, y: 0 }, 0.2), null);
      const target = goal.monster;
      if (target) {
        const dist = U.dist(this.player, target);
        const range = Math.max(92, Math.min(220, (this.basicSkill.range || 120) * 0.72));
        const stop = range + target.r + this.player.r;
        if (dist <= stop) this.autoHoldingRange = true;
        if (dist > stop + 34) this.autoHoldingRange = false;
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
      return this.autoCommitMove(this.autoSmoothDirection(dir, 0.2), goal);
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
      const steps = Math.ceil(dist / 72);
      for (let i = 1; i <= steps; i++) {
        const t = Math.min(dist, i * 72);
        const px = this.player.x + x * t, py = this.player.y + y * t;
        if (this.circleWall(px, py, this.player.r) || this.circleProp(px, py, this.player.r)) return null;
      }
      return { x, y };
    },
    autoSmoothDirection(next, weight) {
      const old = this.autoSteer;
      if (!old) {
        this.autoSteer = { x: next.x, y: next.y };
        return next;
      }
      const x = old.x + (next.x - old.x) * weight;
      const y = old.y + (next.y - old.y) * weight;
      const len = Math.hypot(x, y);
      this.autoSteer = len < 0.08 ? { x: 0, y: 0 } : { x, y };
      return len < 0.08 ? this.autoSteer : { x: x / len, y: y / len };
    },
    autoGoalTarget() {
      const cur = this.currentChunk();
      const curCh = this.chunks[cur];
      let best = null, bestD = Infinity;
      for (const m of this.monsters) {
        if (m.dead) continue;
        const d = U.dist(this.player, m);
        if (m.boss) {
          this.autoTarget = m;
          this.autoPack = null;
          return { x: m.x, y: m.y, monster: m, kind: 'boss' };
        }
        const mch = m.chunkIndex != null ? this.chunks[m.chunkIndex] : null;
        if (mch && curCh && Math.abs(mch.col - curCh.col) + Math.abs(mch.row - curCh.row) > 1 && !m.aggro) continue;
        if (d < bestD) { best = m; bestD = d; }
      }
      const locked = this.autoTarget;
      if (locked && !locked.dead && this.monsters.indexOf(locked) >= 0) {
        const lockedD = U.dist(this.player, locked);
        if (!best || lockedD <= bestD + 120) {
          this.autoGoal = { x: locked.x, y: locked.y, kind: 'monster' };
          return { x: locked.x, y: locked.y, monster: locked, kind: 'monster' };
        }
      }
      if (best) {
        this.autoTarget = best;
        this.autoPack = null;
        this.autoGoal = { x: best.x, y: best.y, kind: 'monster' };
        return { x: best.x, y: best.y, monster: best, kind: 'monster' };
      }
      let pack = this.autoPack && !this.autoPack.spawned ? this.autoPack : null;
      if (!pack) {
        for (const p of this.chunkPacks || []) {
          if (p.spawned) continue;
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
    autoEvadeDirection(goal) {
      let threatened = this.autoProjectileDanger(this.player.x, this.player.y);
      for (const z of this.dangerZones || []) {
        if (this.autoZoneDanger(this.player.x, this.player.y, z)) { threatened = true; break; }
      }
      const now = this.time || 0;
      if (!threatened && this.autoEvade && this.autoEvade.until > now) return this.autoEvade.dir;
      if (!threatened) {
        this.autoEvade = null;
        return null;
      }
      const base = goal ? Math.atan2(goal.y - this.player.y, goal.x - this.player.x) : this.player.facing;
      let best = null, bestScore = Infinity;
      for (let i = 0; i < 16; i++) {
        const a = base + Math.PI * 2 * i / 16;
        const step = i % 2 ? 78 : 112;
        const x = this.player.x + Math.cos(a) * step, y = this.player.y + Math.sin(a) * step;
        if (this.circleWall(x, y, this.player.r) || this.circleProp(x, y, this.player.r)) continue;
        let danger = this.autoProjectileDanger(x, y) ? 10000 : 0;
        for (const z of this.dangerZones || []) if (this.autoZoneDanger(x, y, z)) danger += z.high ? 20000 : 5000;
        if (danger >= bestScore) continue;
        const progress = goal ? Math.hypot(goal.x - x, goal.y - y) * 0.08 : 0;
        const score = danger + progress + (i % 2 ? 6 : 0);
        if (score < bestScore) { bestScore = score; best = { x: Math.cos(a), y: Math.sin(a) }; }
      }
      if (best) this.autoEvade = { dir: best, until: now + 0.26 };
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

    autoCast() {
      if (this.player.hp <= 0) return;
      // 战吼蓄力/释放期间锁定动作：普攻与其他技能不插入，保证整套吼叫连贯播完
      if (this.roar) return;

      // 0 号位：普攻（移动中只打前方的目标，出手方向跟随移动方向）
      if (this.attackCd <= 0 && !this.whirl) {
        const target = this.nearestMonsterInFront((this.basicSkill.range || 600) + 24);
        if (target) {
          this.player.facing = U.angle(this.player, target);
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
        break;
      }
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
        // 位移保命：血量偏低或近身敌人较多时闪避
        const hpPct = this.player.hp / this.player.maxHp;
        const close = this.monsters.filter(m => !m.dead && U.dist(this.player, m) < 150).length;
        if (!near || (hpPct > 0.7 && close < 2)) return null;
        if (U.dist(this.player, near) > 170) return null;
        // 移动中沿移动方向翻滚，避免看起来是在往后退
        if (dir != null) return dir;
        return U.angle(near, this.player);
      }

      if (!near) return null;
      const radius = sk.radius ? this.skillRadius(sk) : (sk.range || 0);
      if (U.dist(this.player, near) > radius + near.r) return null;
      return U.angle(this.player, near);
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
        const hit = [];
        const arc = this.skillArc(sk);
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
          // 劈砍（野蛮人专属刀光）命中时附带方向性血幕与短时出血
          this.hitMonster(m, r.dmg, r.crit, sk.slashFx ? { chop: true, angle: ang } : undefined);
        }
        // 野蛮人劈砍的刀光由英雄模块自己沿斧刃绘制，其他职业仍走程序化弧线
        if (!sk.slashFx) {
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
