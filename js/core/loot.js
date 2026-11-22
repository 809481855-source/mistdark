/* 掉落规则 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  DG.loot = {
    // cls 用于只掉落本职业可用的流派词缀
    roll(monster, ilvl, cls) {
      const res = { items: [], orb: false, rune: false };
      const opts = { cls };

      if (monster.boss) {
        res.items.push(DG.items.generate(ilvl, Object.assign({ minRarity: 'magic' }, opts)));
        res.items.push(DG.items.generate(ilvl + 1, opts));
        if (U.chance(0.65)) res.items.push(DG.items.generate(ilvl + 1, Object.assign({ minRarity: 'rare' }, opts)));
        res.orb = U.chance(0.8);
        res.rune = U.chance(0.55);
        return res;
      }

      const itemChance = monster.elite ? 0.7 : 0.16;
      if (U.chance(itemChance)) {
        res.items.push(DG.items.generate(ilvl + (monster.elite ? 1 : 0), opts));
      }
      res.orb = U.chance(monster.elite ? 0.4 : 0.18);
      res.rune = U.chance(monster.elite ? 0.12 : 0.025);
      return res;
    }
  };
})();
