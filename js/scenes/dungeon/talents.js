/* 副本战斗 · 天赋层：关键天赋触发、技能范围/冷却/数量修正 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
    talentMods() {
      return this.talents || (this.talents = DG.talents.mods(this.char));
    },
    hasTalent(flag) {
      return !!this.talentMods().flags[flag];
    },
    talentStat(key) {
      return this.talentMods().stats[key] || 0;
    },
    skillModOf(skillId) {
      return this.talentMods().skills[skillId] || {};
    },

    // 计时器统一在这里推进，避免散落到各职责模块
    tickTalentTimers(dt) {
      const t = this.talentTimers;
      for (const k in t) {
        if (t[k] > 0) t[k] = Math.max(0, t[k] - dt);
      }
    },

    moveSpeedNow() {
      let speed = this.stats.moveSpeed;
      const t = this.talentTimers;
      if (t.killRush > 0) speed *= 1.15;
      if (t.postHurt > 0) speed *= 1.2;
      if (this.whirl) speed *= 1.3;              // 旋风期间移速提升 30%
      return speed;
    },

    attackSpeedNow() {
      let speed = this.stats.attackSpeed;
      const t = this.talentTimers;
      if (t.chargeHaste > 0 || t.rollHaste > 0) speed *= 1.2;
      return Math.min(3.2, speed);
    },

    skillCooldown(sk) {
      const cap = sk.id === 'whirlwind' ? 100 : 50;
      const cdr = Math.min(cap, this.talentStat('cdrPct') + (this.skillModOf(sk.id).cdrPct || 0));
      return (sk.cooldown || 0) * (1 - cdr / 100);
    },

    skillRadius(sk) {
      return (sk.radius || 0) * (1 + (this.skillModOf(sk.id).radiusPct || 0) / 100);
    },

    skillCount(sk) {
      return (sk.count || 0) + (this.skillModOf(sk.id).countBonus || 0);
    },

    skillSlowFactor(sk, base) {
      return Math.min(0.95, (base || 0) + (this.skillModOf(sk.id).slowPct || 0) / 100);
    },

    skillSlowDur(sk) {
      return (sk.slowDur || 0) * (1 + (this.skillModOf(sk.id).slowDurPct || 0) / 100);
    },

    // 技能树 / 流派词缀：近战弧度、投射物穿透、位移距离
    skillArc(sk) {
      return (sk.arc || 0) * (1 + (this.skillModOf(sk.id).arcPct || 0) / 100);
    },

    skillPierce(sk) {
      return (sk.pierce || 0) + (this.skillModOf(sk.id).pierceBonus || 0);
    },

    skillDist(sk) {
      return (sk.dist || 0) * (1 + (this.skillModOf(sk.id).distPct || 0) / 100);
    },

    // 虚化：生命过低时自动闪现脱离，并重置闪现冷却
    voidShift() {
      const near = this.nearestMonster();
      const ang = near ? U.angle(near, this.player) : this.player.facing + Math.PI;
      const steps = 16;
      const stepLen = 13;
      for (let i = 0; i < steps; i++) {
        this.movePlayer(this.player, Math.cos(ang) * stepLen, Math.sin(ang) * stepLen, this.player.r);
      }
      this.player.invuln = Math.max(this.player.invuln, 0.6);
      const blinkIdx = this.skillList.findIndex(s => s.id === 'blink');
      if (blinkIdx > 0) this.skillCd[blinkIdx] = 0;
      this.talentTimers.voidCd = 60;
      if (this.hasTalent('voidGuard')) this.talentTimers.voidGuard = 2;
      this.addRing(this.player.x, this.player.y, 12, 70, '#b79be0', 0.45);
      this.addBurst(this.player.x, this.player.y, '#b79be0', 10);
      this.addFloater(this.player.x, this.player.y - 40, '虚化', '#c9a7f5', 24);
    }
  });
})();
