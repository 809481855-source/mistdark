/* 天赋核心：点数计算、前置校验、属性聚合与老存档迁移 */
(function () {
  const DG = window.DG;

  const talent = DG.talents = {};

  // 职业树索引缓存：clsId -> { nodes: { id: { node, branch, index, prevId } } }
  const indexCache = {};

  function buildIndex(clsId) {
    if (indexCache[clsId]) return indexCache[clsId];
    const tree = DG.data.talents[clsId];
    if (!tree) return null;
    const nodes = {};
    tree.branches.forEach(branch => {
      branch.nodes.forEach((node, index) => {
        nodes[node.id] = {
          node,
          branch,
          index,
          prevId: index > 0 ? branch.nodes[index - 1].id : null
        };
      });
    });
    indexCache[clsId] = { tree, nodes };
    return indexCache[clsId];
  }

  // 老存档没有 talents 字段时补一个空对象，不发放也不扣除任何点数
  talent.ensure = function (char) {
    if (!char) return {};
    if (!char.talents || typeof char.talents !== 'object' || Array.isArray(char.talents)) {
      char.talents = {};
    }
    return char.talents;
  };

  talent.treeOf = function (char) {
    return char ? DG.data.talents[char.cls] || null : null;
  };

  talent.indexOf = function (char) {
    return char ? buildIndex(char.cls) : null;
  };

  talent.totalPoints = function (char) {
    if (!char) return 0;
    return Math.max(1, char.level | 0);
  };

  talent.spentPoints = function (char) {
    const t = talent.ensure(char);
    let spent = 0;
    for (const id in t) {
      if (t[id]) spent++;
    }
    return spent;
  };

  talent.availablePoints = function (char) {
    return Math.max(0, talent.totalPoints(char) - talent.spentPoints(char));
  };

  talent.hasNode = function (char, nodeId) {
    return !!talent.ensure(char)[nodeId];
  };

  talent.hasFlag = function (char, flag) {
    return !!talent.mods(char).flags[flag];
  };

  // 返回 { ok, reason }，UI 与投入逻辑共用同一套判断
  talent.canAllocate = function (char, nodeId) {
    const idx = talent.indexOf(char);
    if (!idx) return { ok: false, reason: '职业天赋树不存在' };
    const entry = idx.nodes[nodeId];
    if (!entry) return { ok: false, reason: '天赋节点不存在' };
    if (talent.hasNode(char, nodeId)) return { ok: false, reason: '该天赋已点亮' };
    if (talent.availablePoints(char) <= 0) return { ok: false, reason: '没有可用天赋点' };
    if (char.level < (entry.node.levelReq || 1)) {
      return { ok: false, reason: `需要角色等级 Lv.${entry.node.levelReq}` };
    }
    if (entry.prevId && !talent.hasNode(char, entry.prevId)) {
      const prev = idx.nodes[entry.prevId].node;
      return { ok: false, reason: `需要先点亮「${prev.name}」` };
    }
    return { ok: true, reason: '' };
  };

  talent.allocate = function (char, nodeId) {
    const check = talent.canAllocate(char, nodeId);
    if (!check.ok) return check;
    talent.ensure(char)[nodeId] = 1;
    return { ok: true, reason: '' };
  };

  talent.reset = function (char) {
    talent.ensure(char);
    const refunded = talent.spentPoints(char);
    char.talents = {};
    return refunded;
  };

  // 聚合所有已点亮节点：通用属性 / 行为标记 / 伤害标签 / 技能专属修正
  talent.mods = function (char) {
    const res = { stats: {}, flags: {}, tags: {}, skills: {} };
    if (!char) return res;
    const idx = talent.indexOf(char);
    if (!idx) return res;
    const owned = talent.ensure(char);

    const add = (obj, k, v) => { obj[k] = (obj[k] || 0) + v; };

    for (const id in owned) {
      if (!owned[id]) continue;
      const entry = idx.nodes[id];
      if (!entry) continue;
      const node = entry.node;

      if (node.mods) {
        for (const k in node.mods) add(res.stats, k, node.mods[k]);
      }
      if (node.tags) {
        for (const k in node.tags) add(res.tags, k, node.tags[k]);
      }
      if (node.flag) {
        res.flags[node.flag] = true;
      }
      if (node.skill) {
        (node.skill.ids || []).forEach(skillId => {
          const target = res.skills[skillId] || (res.skills[skillId] = {});
          for (const k in node.skill) {
            if (k === 'ids') continue;
            add(target, k, node.skill[k]);
          }
        });
      }
    }
    // 技能树与装备流派词缀：并入同一份修正，战斗层无需区分来源
    if (DG.skillTree) {
      DG.skillTree.mergeInto(res, char);
      DG.skillTree.mergeGear(res, char);
    }
    return res;
  };

  talent.skillTags = function (skillId) {
    return (DG.data.skillTags && DG.data.skillTags[skillId]) || [];
  };

  talent.skillMod = function (char, skillId, key) {
    const skills = talent.mods(char).skills;
    return (skills[skillId] && skills[skillId][key]) || 0;
  };

  // UI 用：节点状态与未满足原因
  talent.nodeState = function (char, nodeId) {
    if (talent.hasNode(char, nodeId)) return { state: 'on', reason: '已点亮' };
    const check = talent.canAllocate(char, nodeId);
    if (check.ok) return { state: 'can', reason: '' };
    return { state: 'locked', reason: check.reason };
  };
})();
