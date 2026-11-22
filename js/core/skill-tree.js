/* 技能树：加点校验、重置、修正聚合 */
(function () {
  const DG = window.DG;

  const ST = DG.skillTree = {
    // 当前职业的技能树（只有野蛮人配置了五技能树）
    treesFor(char) {
      return (char && DG.data.skillTrees[char.cls]) || [];
    },

    has(char, nodeId) {
      return !!(char && char.skillTree && char.skillTree[nodeId]);
    },

    points(char) {
      return (char && char.treePoints) || 0;
    },

    // 返回 { ok, reason }
    canAllocate(char, nodeId) {
      if (!char) return { ok: false, reason: '无角色' };
      const info = DG.data.skillTreeIndex[nodeId];
      if (!info) return { ok: false, reason: '节点不存在' };
      if (info.cls !== char.cls) return { ok: false, reason: '职业不符' };
      if (ST.has(char, nodeId)) return { ok: false, reason: '已点亮' };
      if (info.prev && !ST.has(char, info.prev)) return { ok: false, reason: '需要先点亮上一节点' };
      const lv = (char.skills && char.skills[info.tree.skill]) || 1;
      if (lv < info.node.reqLv) return { ok: false, reason: `技能等级需达到 ${info.node.reqLv}` };
      if (ST.points(char) < 1) return { ok: false, reason: '技能树点数不足' };
      return { ok: true, reason: '' };
    },

    allocate(char, nodeId) {
      const check = ST.canAllocate(char, nodeId);
      if (!check.ok) return check;
      char.skillTree = char.skillTree || {};
      char.skillTree[nodeId] = 1;
      char.treePoints = Math.max(0, (char.treePoints || 0) - 1);
      return { ok: true, reason: '' };
    },

    reset(char) {
      if (!char) return 0;
      let refund = 0;
      const owned = char.skillTree || {};
      for (const id in owned) if (owned[id]) refund++;
      char.skillTree = {};
      char.treePoints = (char.treePoints || 0) + refund;
      return refund;
    },

    spent(char) {
      let n = 0;
      const owned = (char && char.skillTree) || {};
      for (const id in owned) if (owned[id]) n++;
      return n;
    },

    // 聚合为与天赋一致的 { stats, skills } 结构
    mods(char) {
      const res = { stats: {}, skills: {} };
      if (!char) return res;
      const owned = char.skillTree || {};
      const add = (obj, k, v) => { obj[k] = (obj[k] || 0) + v; };
      for (const id in owned) {
        if (!owned[id]) continue;
        const info = DG.data.skillTreeIndex[id];
        if (!info) continue;
        const m = info.node.mods || {};
        if (m.stats) for (const k in m.stats) add(res.stats, k, m.stats[k]);
        if (m.skill) {
          (m.skill.ids || [info.tree.skill]).forEach(skillId => {
            const target = res.skills[skillId] || (res.skills[skillId] = {});
            for (const k in m.skill) {
              if (k === 'ids') continue;
              add(target, k, m.skill[k]);
            }
          });
        }
      }
      return res;
    },

    // 合并进天赋修正结果（stats / skills 两个桶）
    mergeInto(res, char) {
      if (!char || !res) return res;
      const m = ST.mods(char);
      const add = (obj, k, v) => { obj[k] = (obj[k] || 0) + v; };
      for (const k in m.stats) add(res.stats, k, m.stats[k]);
      for (const id in m.skills) {
        const target = res.skills[id] || (res.skills[id] = {});
        for (const k in m.skills[id]) add(target, k, m.skills[id][k]);
      }
      return res;
    },

    // 装备上的流派词缀：skill.<技能>.<字段>
    mergeGear(res, char) {
      if (!char || !res || !DG.items) return res;
      const equipped = char.equipment || {};
      const add = (obj, k, v) => { obj[k] = (obj[k] || 0) + v; };
      for (const slot in equipped) {
        const item = equipped[slot];
        if (!item) continue;
        const s = DG.items.statsOf(item);
        for (const key in s) {
          const parsed = DG.items.skillStat(key);
          if (!parsed) continue;
          const target = res.skills[parsed.id] || (res.skills[parsed.id] = {});
          add(target, parsed.field, s[key]);
        }
      }
      return res;
    }
  };
})();
