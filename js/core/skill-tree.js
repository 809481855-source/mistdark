/* 技能树：技能点分配、前置校验与旧数据兼容 */
(function () {
  const DG = window.DG;

  const ST = DG.skillTree = {
    // 当前职业的技能树（只有野蛮人配置了五技能树）
    treesFor(char) {
      return (char && DG.data.skillTrees[char.cls]) || [];
    },

    treeById(char, id) {
      return ST.treesFor(char).find(t => t.id === id) || null;
    },

    has(char, nodeId) {
      return !!(char && char.skillTree && char.skillTree[nodeId]);
    },

    // 技能点与升级/任务共用同一池：char.skillPoints
    points(char) {
      return (char && char.skillPoints) || 0;
    },

    treeUnlocked(char, tree) {
      if (!char || !tree) return false;
      return char.level >= (tree.unlock || 1);
    },

    // 返回 { ok, reason }
    canAllocate(char, nodeId) {
      if (!char) return { ok: false, reason: '无角色' };
      const info = DG.data.skillTreeIndex[nodeId];
      if (!info) return { ok: false, reason: '节点不存在' };
      if (info.cls !== char.cls) return { ok: false, reason: '职业不符' };
      if (ST.has(char, nodeId)) return { ok: false, reason: '已激活' };
      if (!ST.treeUnlocked(char, info.tree)) {
        return { ok: false, reason: `${info.tree.name} ${info.tree.unlock} 级解锁` };
      }
      if (info.parent && !ST.has(char, info.parent.id)) {
        return { ok: false, reason: `需要先激活「${info.parent.name}」` };
      }
      if (ST.points(char) < 1) return { ok: false, reason: '技能点不足' };
      return { ok: true, reason: '' };
    },

    allocate(char, nodeId) {
      const check = ST.canAllocate(char, nodeId);
      if (!check.ok) return check;
      char.skillTree = char.skillTree || {};
      char.skillTree[nodeId] = 1;
      char.skillPoints = Math.max(0, (char.skillPoints || 0) - 1);
      return { ok: true, reason: '' };
    },

    // 重置整棵技能树：返还该树已投入的点数（界面未提供入口，保留给调试/后续扩展）
    resetTree(char, tree) {
      if (!char || !tree) return 0;
      let refund = 0;
      tree.nodes.forEach(node => {
        if (ST.has(char, node.id)) {
          delete char.skillTree[node.id];
          refund++;
        }
      });
      char.skillPoints = (char.skillPoints || 0) + refund;
      return refund;
    },

    spent(char) {
      let n = 0;
      const owned = (char && char.skillTree) || {};
      for (const id in owned) if (owned[id] && DG.data.skillTreeIndex[id]) n++;
      return n;
    },

    spentInTree(char, tree) {
      if (!char || !tree) return 0;
      let n = 0;
      tree.nodes.forEach(node => { if (ST.has(char, node.id)) n++; });
      return n;
    },

    spentInGroup(char, group) {
      if (!char || !group) return 0;
      return group.trees.reduce((sum, id) => {
        const tree = ST.treeById(char, id);
        return sum + (tree ? ST.spentInTree(char, tree) : 0);
      }, 0);
    },

    // 辅助节点目前只提供激活状态与效果说明，不注入战斗数值
    mods() {
      return { stats: {}, skills: {} };
    },

    mergeInto(res) {
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
