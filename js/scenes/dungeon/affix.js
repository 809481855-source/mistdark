/* 副本战斗 · 精英词缀：每关随机 1~2 条，贴在精英身上改变打法；
 * 普通小怪也有小概率携带单条词缀，让战斗更随机。
 * 词缀只作用于小怪（含密室守卫、宝箱怪），首领不受影响。
 * 数值改动集中在 applyEliteAffixes / affixTick / hitMonster / affixOnHit /
 * onMonsterDeath 几处，视觉只多画一圈彩色环与地面预警，不引入额外逐帧对象。
 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  const ELITE_AFFIXES = {
    frost: { name: '冰冻', color: '#8ec9e8', desc: '命中玩家附加冰缓' },
    thorn: { name: '荆棘', color: '#c98b5a', desc: '受击反弹 18% 伤害' },
    split: { name: '分裂', color: '#b07ce0', desc: '死亡时裂成两个小体' },
    haste: { name: '加速', color: '#e0c060', desc: '移速与起手更快' },
    ward: { name: '护盾', color: '#7fd0c0', desc: '额外 40% 生命的护盾' },
    dodge: { name: '闪避', color: '#9fd0ff', desc: '20% 概率完全闪开攻击' },
    blink: { name: '闪现', color: '#c090ff', desc: '离得远时瞬移到玩家身边' },
    volatile: { name: '自爆', color: '#ff9a5c', desc: '死亡时爆炸并震伤玩家' },
    nature: { name: '自然', color: '#8fe08a', desc: '每 2 秒回复 3% 最大生命' },
    storm: { name: '引雷', color: '#bcd9ff', desc: '定期在玩家脚下召来落雷' },
    freeze: { name: '冻结', color: '#a8dcff', desc: '命中时概率定身玩家' }
  };
  const AFFIX_IDS = Object.keys(ELITE_AFFIXES);
  // 普怪池剔除强控与反伤：数量太多时会把走位和续航压死，这两条只留给精英
  const NORMAL_AFFIX_IDS = AFFIX_IDS.filter(id => id !== 'freeze' && id !== 'thorn');

  Object.assign(DG.scenes.dungeon.prototype, {
    // 每局开局掷 1~2 条；关卡越靠后越容易出两条
    rollStageAffixes() {
      const lv = (this.def && this.def.index) || 1;
      const count = U.chance(Math.min(0.65, 0.3 + lv * 0.006)) ? 2 : 1;
      const pool = AFFIX_IDS.slice();
      const out = [];
      for (let i = 0; i < count && pool.length; i++) {
        out.push(pool.splice(U.randInt(0, pool.length - 1), 1)[0]);
      }
      this.eliteAffixes = out;
      this.eliteAffixText = out.map(id => ELITE_AFFIXES[id].name).join('·');
      this.affixStrikes = [];
      return out;
    },
    // 贴到精英身上：属性、名字与护盾一次算完
    applyEliteAffixes(m) {
      if (!m || m.boss || (m.affixes && m.affixes.length)) return m;
      const ids = (this.eliteAffixes || []).slice();
      if (!ids.length) return m;
      m.affixes = ids;
      const base = m.name || (DG.data.monsters[m.typeId] || {}).name || '精英';
      m.baseName = base;
      if (ids.indexOf('haste') >= 0) {
        m.speed *= 1.28;
        m.windupMul = 0.78;
      }
      if (ids.indexOf('ward') >= 0) {
        m.shield = Math.round(m.maxHp * 0.4);
        m.maxShield = m.shield;
      }
      m.name = ids.map(id => ELITE_AFFIXES[id].name).join('·') + ' · ' + base;
      return m;
    },
    // 普通小怪：关卡越深越容易出现单条词缀，数值按普怪幅度收敛
    maybeAffixNormal(m) {
      if (!m || m.boss || m.elite || this.noAffixSpawn || (m.affixes && m.affixes.length)) return m;
      const lv = (this.def && this.def.index) || 1;
      const p = Math.min(0.17, 0.05 + lv * 0.0015);
      if (!U.chance(p)) return m;
      const id = NORMAL_AFFIX_IDS[U.randInt(0, NORMAL_AFFIX_IDS.length - 1)];
      m.affixes = [id];
      const base = m.name || '小怪';
      m.baseName = base;
      if (id === 'haste') {
        m.speed *= 1.16;
        m.windupMul = 0.9;
      }
      if (id === 'ward') {
        m.shield = Math.round(m.maxHp * 0.25);
        m.maxShield = m.shield;
      }
      m.name = ELITE_AFFIXES[id].name + ' · ' + base;
      return m;
    },
    // 词缀的持续效果：自然再生 / 闪现换位 / 引雷排程（每帧由 updateMonsters 调用）
    affixTick(m, dt) {
      if (!m.affixes || !m.affixes.length) return;
      const ids = m.affixes;
      // 自然：每 2 秒回复 3% 最大生命，逼玩家先集火再换目标
      if (ids.indexOf('nature') >= 0) {
        m.affixHealT = (m.affixHealT == null ? 2 : m.affixHealT) - dt;
        if (m.affixHealT <= 0) {
          m.affixHealT = 2;
          if (m.hp > 0 && m.hp < m.maxHp) {
            const heal = Math.max(2, Math.round(m.maxHp * 0.03));
            m.hp = Math.min(m.maxHp, m.hp + heal);
            this.addFloater(m.x + U.rand(-4, 4), m.y - m.r - 16, `+${heal}`, '#8fe08a', 16);
          }
        }
      }
      // 闪现：拉开距离后瞬移到玩家身边，逼迫玩家处理近身威胁
      if (ids.indexOf('blink') >= 0) {
        m.affixBlinkT = (m.affixBlinkT == null ? U.rand(2.5, 4.5) : m.affixBlinkT) - dt;
        if (m.affixBlinkT <= 0 && m.aggro && !m.action) {
          if (U.dist(m, this.player) > 260) {
            m.affixBlinkT = U.rand(5.5, 7.5);
            this.blinkMonster(m);
          } else {
            m.affixBlinkT = 1.2;
          }
        }
      }
      // 引雷：在玩家脚下先画预警圈，0.85 秒后落雷
      if (ids.indexOf('storm') >= 0 && m.aggro) {
        m.affixStormT = (m.affixStormT == null ? U.rand(2, 4) : m.affixStormT) - dt;
        if (m.affixStormT <= 0) {
          m.affixStormT = U.rand(6, 8.5);
          this.castAffixStorm();
        }
      }
    },
    blinkMonster(m) {
      const p = this.player;
      for (let i = 0; i < 12; i++) {
        const a = U.rand(0, Math.PI * 2);
        const rr = U.rand(150, 230);
        const x = p.x + Math.cos(a) * rr;
        const y = p.y + Math.sin(a) * rr;
        if (this.circleWall(x, y, m.r) || this.circleProp(x, y, m.r)) continue;
        this.addRing(m.x, m.y, 10, 46, '#c090ff', 0.3);
        m.x = x;
        m.y = y;
        // 同步上一帧坐标：否则瞬移会被当成超高速移动，污染远程预判
        m._px = x;
        m._py = y;
        m._vx = 0;
        m._vy = 0;
        m.aggro = true;
        m.facing = U.angle(m, p);
        this.addBurst(x, y, '#c090ff', 10);
        this.addRing(x, y, 8, 44, '#c090ff', 0.3);
        return true;
      }
      return false;
    },
    castAffixStorm() {
      if (this.player.hp <= 0) return;
      const p = this.player;
      if (!this.affixStrikes) this.affixStrikes = [];
      this.affixStrikes.push({ x: p.x, y: p.y, t: 0.85 });
      this.effects.push({
        kind: 'arrowRainMarker', x: p.x, y: p.y, angle: 0,
        radius: 76, arc: Math.PI * 2, color: '#bcd9ff',
        life: 0.85, max: 0.85
      });
    },
    updateAffixStrikes(dt) {
      if (!this.affixStrikes || !this.affixStrikes.length) return;
      for (let i = this.affixStrikes.length - 1; i >= 0; i--) {
        const s = this.affixStrikes[i];
        s.t -= dt;
        if (s.t > 0) continue;
        this.affixStrikes.splice(i, 1);
        this.strikeAffixBolt(s.x, s.y);
      }
    },
    strikeAffixBolt(x, y) {
      this.addBurst(x, y, '#cfe4ff', 14);
      this.addRing(x, y, 10, 92, '#dceaff', 0.3);
      this.shake = Math.max(this.shake, 0.14);
      const R = 78;
      if (this.player.hp > 0 && U.dist(this.player, { x: x, y: y }) < R + this.player.r) {
        if (this.hurtPlayer(Math.round(this.player.maxHp * 0.06))) {
          this.addFloater(this.player.x, this.player.y - 42, '雷击', '#bcd9ff', 22);
        }
      }
    },
    // 自爆：死亡瞬间炸开，对玩家造成按最大生命计算的伤害
    volatileBurst(m) {
      if (!m || m.noLoot) return;
      const R = m.elite ? 118 : 92;
      const dmg = Math.round(this.player.maxHp * (m.elite ? 0.07 : 0.05));
      this.addBurst(m.x, m.y, '#ff9a5c', 18);
      this.addRing(m.x, m.y, 14, R, '#ffb27a', 0.38);
      this.shake = Math.max(this.shake, 0.18);
      this.addFloater(m.x, m.y - m.r - 22, '自爆', '#ffb27a', 20);
      if (this.player.hp > 0 && U.dist(this.player, m) < R + this.player.r) {
        if (this.hurtPlayer(dmg)) {
          this.addFloater(this.player.x, this.player.y - 52, `爆炸 -${dmg}`, '#ff9a5c', 20);
        }
      }
    },
    // 精英打中玩家后触发：冰缓 / 冻结
    affixOnHit(m) {
      if (!m || !m.affixes || this.player.hp <= 0) return;
      if (m.affixes.indexOf('frost') >= 0) {
        this.player.chillT = Math.max(this.player.chillT || 0, 1.8);
        this.addFloater(this.player.x, this.player.y - 46, '冰缓', '#8ec9e8', 20);
      }
      if (m.affixes.indexOf('freeze') >= 0 && U.chance(0.18) &&
          (this.player.freezeT || 0) <= 0 && (this.player.freezeImmuneT || 0) <= 0) {
        this.player.freezeT = 0.8;
        this.player.freezeImmuneT = 4;
        this.addRing(this.player.x, this.player.y, 14, 48, '#a8dcff', 0.32);
        this.addFloater(this.player.x, this.player.y - 46, '冻结', '#a8dcff', 22);
      }
    },
    // 分裂：死亡瞬间裂成两个小体，不给经验、不掉落，避免刷资源
    splitElite(m) {
      const tpl = DG.data.monsters[m.typeId];
      if (!tpl || m.splitDone) return;
      m.splitDone = true;
      // 裂片不再携带词缀：避免分裂体再生出分裂体
      this.noAffixSpawn = true;
      for (let i = 0; i < 2; i++) {
        const a = (i ? Math.PI : 0) + U.rand(-0.5, 0.5);
        const pos = this.nearestFloorPoint(m.x + Math.cos(a) * 46, m.y + Math.sin(a) * 46, 3) ||
          this.nearestFloorPoint(m.x, m.y, 3);
        if (!pos) continue;
        const c = this.spawnMonster(m.typeId, pos.x, pos.y, false, m.chunkIndex);
        if (!c) continue;
        c.elite = false;
        c.affixes = null;
        c.shield = 0;
        c.r *= 0.78;
        c.maxHp = Math.max(1, Math.round(m.maxHp * 0.4));
        c.hp = c.maxHp;
        c.dmg = Math.max(1, Math.round(m.dmg * 0.55));
        c.xp = 0;
        c.gold = 0;
        c.noLoot = true;
        c.splitDone = true;
        c.aggro = true;
        c.spawnTime = this.time - 1;   // 立刻进入战斗
        c.name = '裂片 · ' + (tpl.name || c.name);
        this.addRing(c.x, c.y, 10, 60, '#b07ce0', 0.4);
      }
      this.noAffixSpawn = false;
      this.addBurst(m.x, m.y, '#b07ce0', 14);
    }
  });

  DG.scenes.dungeon.ELITE_AFFIXES = ELITE_AFFIXES;
})();
