/* 野蛮人 · 五技能技能树数据
   每个技能一棵线性四节点树：前置为同树上一节点 + 技能等级要求。
   节点的 mods 与天赋节点同构，战斗层聚合后直接生效。 */
(function () {
  const DG = window.DG;
  DG.data.skillTrees = DG.data.skillTrees || {};

  DG.data.skillTrees.warrior = [
    {
      id: 'cleave', skill: 'cleave', name: '裂骨挥砍',
      nodes: [
        { id: 'cleave_t1', name: '裂骨', desc: '挥砍伤害 +15%', reqLv: 2, mods: { skill: { ids: ['cleave'], dmgPct: 15 } } },
        { id: 'cleave_t2', name: '横扫', desc: '挥砍弧度 +25%', reqLv: 4, mods: { skill: { ids: ['cleave'], arcPct: 25 } } },
        { id: 'cleave_t3', name: '嗜血', desc: '攻击速度 +8%', reqLv: 6, mods: { stats: { attackSpeed: 8 } } },
        { id: 'cleave_t4', name: '断筋', desc: '挥砍伤害 +20%', reqLv: 8, mods: { skill: { ids: ['cleave'], dmgPct: 20 } } }
      ]
    },
    {
      id: 'whirlwind', skill: 'whirlwind', name: '旋风斩',
      nodes: [
        { id: 'whirl_t1', name: '疾风', desc: '旋风伤害 +15%', reqLv: 2, mods: { skill: { ids: ['whirlwind'], dmgPct: 15 } } },
        { id: 'whirl_t2', name: '风眼', desc: '旋风范围 +15%', reqLv: 4, mods: { skill: { ids: ['whirlwind'], radiusPct: 15 } } },
        { id: 'whirl_t3', name: '不息', desc: '旋风冷却缩减 25%', reqLv: 6, mods: { skill: { ids: ['whirlwind'], cdrPct: 25 } } },
        { id: 'whirl_t4', name: '剑刃风暴', desc: '旋风伤害 +20%', reqLv: 8, mods: { skill: { ids: ['whirlwind'], dmgPct: 20 } } }
      ]
    },
    {
      id: 'charge', skill: 'charge', name: '野蛮冲锋',
      nodes: [
        { id: 'charge_t1', name: '破阵', desc: '冲锋伤害 +20%', reqLv: 2, mods: { skill: { ids: ['charge'], dmgPct: 20 } } },
        { id: 'charge_t2', name: '疾驰', desc: '冲锋冷却缩减 25%', reqLv: 4, mods: { skill: { ids: ['charge'], cdrPct: 25 } } },
        { id: 'charge_t3', name: '长驱', desc: '冲锋距离 +20%', reqLv: 6, mods: { skill: { ids: ['charge'], distPct: 20 } } },
        { id: 'charge_t4', name: '山崩', desc: '冲锋伤害 +25%', reqLv: 8, mods: { skill: { ids: ['charge'], dmgPct: 25 } } }
      ]
    },
    {
      id: 'shockwave', skill: 'shockwave', name: '震动波',
      nodes: [
        { id: 'shock_t1', name: '震荡', desc: '震动波伤害 +18%', reqLv: 2, mods: { skill: { ids: ['shockwave'], dmgPct: 18 } } },
        { id: 'shock_t2', name: '宽幅', desc: '震动波范围 +18%', reqLv: 4, mods: { skill: { ids: ['shockwave'], radiusPct: 18 } } },
        { id: 'shock_t3', name: '贯穿', desc: '震动波额外穿透 1 个目标', reqLv: 6, mods: { skill: { ids: ['shockwave'], pierceBonus: 1 } } },
        { id: 'shock_t4', name: '崩裂', desc: '震动波伤害 +22%', reqLv: 8, mods: { skill: { ids: ['shockwave'], dmgPct: 22 } } }
      ]
    },
    {
      id: 'warcry', skill: 'warcry', name: '战吼',
      nodes: [
        { id: 'cry_t1', name: '战栗', desc: '战吼伤害 +15%', reqLv: 2, mods: { skill: { ids: ['warcry'], dmgPct: 15 } } },
        { id: 'cry_t2', name: '回响', desc: '战吼范围 +20%', reqLv: 4, mods: { skill: { ids: ['warcry'], radiusPct: 20 } } },
        { id: 'cry_t3', name: '持久', desc: '减速持续 +30%', reqLv: 6, mods: { skill: { ids: ['warcry'], slowDurPct: 30 } } },
        { id: 'cry_t4', name: '怯懦', desc: '减速强度 +10%', reqLv: 8, mods: { skill: { ids: ['warcry'], slowPct: 10 } } }
      ]
    }
  ];

  // 扁平索引：nodeId -> { tree, node, index, prev }
  DG.data.skillTreeIndex = {};
  Object.keys(DG.data.skillTrees).forEach(cls => {
    DG.data.skillTrees[cls].forEach(tree => {
      tree.nodes.forEach((node, i) => {
        DG.data.skillTreeIndex[node.id] = {
          cls, tree, node, index: i,
          prev: i > 0 ? tree.nodes[i - 1].id : null
        };
        node.treeId = tree.id;
        node.skill = tree.skill;
        node.name2 = tree.name;
      });
    });
  });
})();
