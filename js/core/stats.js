/* 面板属性计算：职业基础 + 等级成长 + 装备词缀 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  DG.stats = {
    compute(char) {
      const cls = DG.data.classes[char.cls];
      const base = cls.base;
      const bucket = {};
      const add = (k, v) => { bucket[k] = (bucket[k] || 0) + v; };

      for (const slot in char.equipment) {
        const item = char.equipment[slot];
        if (!item) continue;
        const s = DG.items.statsOf(item);
        for (const k in s) add(k, s[k]);
      }

      // 天赋加成与装备词缀同源加算，不同类之间保持原有乘算关系
      const tm = DG.talents.mods(char);
      const ts = tm.stats;

      const lv = char.level;
      const maxHp = (base.hp + (lv - 1) * 14 + (bucket.hp || 0)) * (1 + (ts.maxHpPct || 0) / 100);
      const atkFlat = base.atk + (lv - 1) * 1.7 + (bucket.atk || 0);
      const atk = atkFlat * (1 + ((bucket.atkPct || 0) + (ts.atkPct || 0)) / 100);
      const armor = (base.armor + (lv - 1) * 1.2 + (bucket.armor || 0)) * (1 + (ts.armorPct || 0) / 100);
      const crit = Math.min(75, base.crit + (bucket.crit || 0) + (ts.crit || 0));
      const critDmg = base.critDmg + (bucket.critDmg || 0) + (ts.critDmg || 0);
      const moveSpeed = base.moveSpeed * (1 + ((bucket.moveSpeed || 0) + (ts.moveSpeedPct || 0)) / 100);
      const attackSpeed = Math.min(3.2, base.attackSpeed * (1 + ((bucket.attackSpeed || 0) + (ts.attackSpeedPct || 0)) / 100));
      const hpRegen = base.hpRegen + (bucket.hpRegen || 0) + (ts.hpRegen || 0);

      const power = Math.round(
        atk * 3.2 + maxHp * 0.6 + armor * 2.2 + crit * 4.5 +
        critDmg * 0.7 + moveSpeed * 0.6 + attackSpeed * 8 + hpRegen * 3
      );

      return {
        maxHp: Math.round(maxHp),
        atk: U.round(atk, 1),
        armor: Math.round(armor),
        crit: U.round(crit, 1),
        critDmg: Math.round(critDmg),
        moveSpeed: Math.round(moveSpeed),
        attackSpeed: U.round(attackSpeed, 2),
        hpRegen: U.round(hpRegen, 1),
        power,
        bucket,
        talents: tm
      };
    },

    // 护甲减伤百分比
    mitigation(armor) {
      return Math.round((armor / (armor + 100)) * 1000) / 10;
    }
  };
})();
