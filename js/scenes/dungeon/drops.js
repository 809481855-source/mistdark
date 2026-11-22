/* 副本战斗 · 掉落层：装备 / 恢复球 / 符文的拾取与结算 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
  updateDrops(dt) {
    const list = [];
    for (const d of this.drops) {
      d.t += dt;
      const dist = Math.hypot(this.player.x - d.x, this.player.y - d.y);
      if (dist < 44 + this.player.r) {
        if (this.pickup(d)) continue;
      }
      list.push(d);
    }
    this.drops = list;
  },
  pickup(d) {
    if (d.kind === 'item') {
      if (DG.character.bagUsed(this.char) >= DG.CONFIG.BAG_SIZE) {
        if (this.bagWarnCd <= 0) {
          DG.ui.toast('背包已满，无法拾取新的装备', 'danger');
          this.bagWarnCd = 3;
        }
        return false;
      }
      this.char.bag.push(d.item);
      this.items.push(d.item);
      if (DG.quests) DG.quests.progress(this.char, 'loot', 1);
      if (DG.audio) DG.audio.play('stageEquip', { vol: 0.7 });
      DG.game.save();
      const hot = d.item.rarity === 'legend' || d.item.rarity === 'set';
      DG.ui.toast(`拾取：${d.item.name}`, hot ? 'gold' : 'blue');
      this.updateHud();
      return true;
    }
    if (d.kind === 'orb') {
      const heal = Math.round(this.player.maxHp * 0.2);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      if (DG.audio) DG.audio.play('stagePickup', { vol: 0.7 });
      this.addFloater(this.player.x, this.player.y - 38, `+${heal}`, '#7fd08a', 22);
      this.addBurst(d.x, d.y, '#7fd08a', 6);
      return true;
    }
    if (d.kind === 'rune') {
      this.applyRune();
      return true;
    }
    return true;
  },
  applyRune() {
    const ids = [this.cls.autoSkill, ...this.cls.skills];
    const upgradable = ids.filter(id => (this.char.skills[id] || 1) < DG.CONFIG.MAX_SKILL_LEVEL);
    if (!upgradable.length) {
      this.goldEarned += 20;
      DG.ui.toast('技能符文转化为 20 金币', 'gold');
      return;
    }
    const id = U.pick(upgradable);
    const lv = this.char.skills[id] || 1;
    this.char.skills[id] = lv + 1;
    const sk = DG.data.skills[id];
    this.skillUps.push(`${sk.name} Lv.${lv + 1}`);
    DG.game.save();
    DG.ui.toast(`技能提升：${sk.name} Lv.${lv + 1}`, 'blue');
    this.addFloater(this.player.x, this.player.y - 42, '技能成长', '#9fc0e8', 24);
    this.addBurst(this.player.x, this.player.y, '#9fc0e8', 10);
  }
  });
})();
