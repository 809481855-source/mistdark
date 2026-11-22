/* 副本战斗 · 精英词缀：每关随机 1~2 条，贴在精英身上改变打法
 * 词缀只作用于精英（含密室守卫、宝箱怪），首领不受影响。
 * 数值改动集中在 promoteElite / hitMonster / onMonsterDeath 三处，
 * 视觉只多画一圈彩色环与护盾弧，不引入额外逐帧对象。
 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  const ELITE_AFFIXES = {
    frost: { name: '冰冻', color: '#8ec9e8', desc: '命中玩家附加冰缓' },
    thorn: { name: '荆棘', color: '#c98b5a', desc: '受击反弹 18% 伤害' },
    split: { name: '分裂', color: '#b07ce0', desc: '死亡时裂成两个小体' },
    haste: { name: '加速', color: '#e0c060', desc: '移速与起手更快' },
    ward: { name: '护盾', color: '#7fd0c0', desc: '额外 40% 生命的护盾' }
  };
  const AFFIX_IDS = Object.keys(ELITE_AFFIXES);

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
    // 精英打中玩家后触发（目前只有冰冻）
    affixOnHit(m) {
      if (!m || !m.affixes || this.player.hp <= 0) return;
      if (m.affixes.indexOf('frost') >= 0) {
        this.player.chillT = Math.max(this.player.chillT || 0, 1.8);
        this.addFloater(this.player.x, this.player.y - 46, '冰缓', '#8ec9e8', 20);
      }
    },
    // 分裂：死亡瞬间裂成两个小体，不给经验、不掉落，避免刷资源
    splitElite(m) {
      const tpl = DG.data.monsters[m.typeId];
      if (!tpl || m.splitDone) return;
      m.splitDone = true;
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
      this.addBurst(m.x, m.y, '#b07ce0', 14);
    }
  });

  DG.scenes.dungeon.ELITE_AFFIXES = ELITE_AFFIXES;
})();
