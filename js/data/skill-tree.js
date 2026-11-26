/* 野蛮人 · 五技能辅助技能树数据
   每个主技能 6 个辅助节点：中间 2 个（直接连接主技能）、底部 4 个（各挂在一个中间节点下）。
   节点只负责激活状态与效果说明，消耗技能点 1 点；主技能本身按角色等级解锁。 */
(function () {
  const DG = window.DG;
  const ICON = 'assets/ui/skill/aux-';

  DG.data.skillTrees = DG.data.skillTrees || {};

  DG.data.skillTrees.warrior = [
    {
      id: 'cleave', skill: 'cleave', name: '挥砍',
      group: 'basic', unlock: 1,
      desc: '挥刃劈砍前方扇形范围，野蛮人的起手技能。',
      nodes: [
        { id: 'w_cleave_bone', name: '碎骨', slot: 0, icon: ICON + 'cleave-bone.png',
          desc: '挥砍有 25% 概率击碎护甲，使目标护甲降低 30%，持续 3 秒。' },
        { id: 'w_cleave_thirst', name: '嗜血', slot: 1, icon: ICON + 'cleave-thirst.png',
          desc: '挥砍造成伤害的 8% 转化为自身生命。' },
        { id: 'w_cleave_mince', name: '碎肉', slot: 2, icon: ICON + 'cleave-mince.png',
          desc: '挥砍命中生命低于 40% 的敌人时，伤害提高 35%。' },
        { id: 'w_cleave_tendon', name: '断筋', slot: 3, icon: ICON + 'cleave-tendon.png',
          desc: '挥砍命中的敌人移动速度降低 40%，持续 2 秒。' },
        { id: 'w_cleave_burst', name: '血爆', slot: 4, icon: ICON + 'cleave-burst.png',
          desc: '挥砍暴击时引发血爆，对周围 80 码敌人造成 40% 攻击力伤害。' },
        { id: 'w_cleave_toxin', name: '血毒', slot: 5, icon: ICON + 'cleave-toxin.png',
          desc: '挥砍附加流血，3 秒内每秒造成 12% 攻击力伤害。' }
      ]
    },
    {
      id: 'whirlwind', skill: 'whirlwind', name: '旋风斩',
      group: 'strong', unlock: 4,
      desc: '旋身 1.6 秒，期间移速提高且不可阻挡，按固定节奏连斩周身敌人。',
      nodes: [
        { id: 'w_whirlwind_tornado', name: '龙卷风', slot: 0, icon: ICON + 'whirlwind-tornado.png',
          desc: '旋风斩命中敌人时，额外多召唤 1 道龙卷风（3 道 → 4 道）。' },
        { id: 'w_whirlwind_gale', name: '疾风', slot: 1, icon: ICON + 'whirlwind-gale.png',
          desc: '旋风斩期间移动速度额外提高 20%。' },
        { id: 'w_whirlwind_eye', name: '风眼', slot: 2, icon: ICON + 'whirlwind-eye.png',
          desc: '旋风斩每命中一名敌人，伤害提高 3%，最多叠加 10 层。' },
        { id: 'w_whirlwind_range', name: '范围', slot: 3, icon: ICON + 'whirlwind-range.png',
          desc: '旋风斩半径扩大 25%。' },
        { id: 'w_whirlwind_frenzy', name: '狂暴', slot: 4, icon: ICON + 'whirlwind-frenzy.png',
          desc: '旋风斩持续期间攻击速度提高 30%。' },
        { id: 'w_whirlwind_endless', name: '不息', slot: 5, icon: ICON + 'whirlwind-endless.png',
          desc: '旋风斩击杀敌人时延长 0.1 秒持续时间，最多延长 0.6 秒。' }
      ]
    },
    {
      id: 'charge', skill: 'charge', name: '野蛮冲锋',
      group: 'strong', unlock: 8,
      desc: '向前突进撞开路径上的敌人，造成高额伤害。',
      nodes: [
        { id: 'w_charge_ram', name: '乱撞', slot: 0, icon: ICON + 'charge-ram.png',
          desc: '冲锋路径上的敌人被击退更远，并短暂失衡。' },
        { id: 'w_charge_rush', name: '冲锋', slot: 1, icon: ICON + 'charge-rush.png',
          desc: '冲锋距离提高 25%，冷却缩短 1 秒。' },
        { id: 'w_charge_stun', name: '眩晕', slot: 2, icon: ICON + 'charge-stun.png',
          desc: '被冲锋撞到的敌人眩晕 2 秒。' },
        { id: 'w_charge_sunder', name: '破防', slot: 3, icon: ICON + 'charge-sunder.png',
          desc: '冲锋伤害无视目标 30% 护甲。' },
        { id: 'w_charge_sprint', name: '疾驰', slot: 4, icon: ICON + 'charge-sprint.png',
          desc: '冲锋后 3 秒内移动速度提高 25%。' },
        { id: 'w_charge_gallop', name: '长驱', slot: 5, icon: ICON + 'charge-gallop.png',
          desc: '冲锋每命中一名敌人，冷却缩短 0.4 秒。' }
      ]
    },
    {
      id: 'shockwave', skill: 'shockwave', name: '震动波',
      group: 'support', unlock: 12,
      desc: '向前轰出冲击波，对沿途敌人造成伤害。',
      nodes: [
        { id: 'w_shockwave_vibrate', name: '震荡', slot: 0, icon: ICON + 'shockwave-vibrate.png',
          desc: '震动波伤害提高 20%。' },
        { id: 'w_shockwave_mountain', name: '山蹦', slot: 1, icon: ICON + 'shockwave-mountain.png',
          desc: '震动波命中时引发二次爆炸，对周围敌人造成 50% 伤害。' },
        { id: 'w_shockwave_pierce', name: '贯穿', slot: 2, icon: ICON + 'shockwave-pierce.png',
          desc: '震动波额外穿透 2 个目标。' },
        { id: 'w_shockwave_range', name: '范围', slot: 3, icon: ICON + 'shockwave-range.png',
          desc: '震动波宽度提高 30%。' },
        { id: 'w_shockwave_gravel', name: '碎石', slot: 4, icon: ICON + 'shockwave-gravel.png',
          desc: '震动波留下的碎石使敌人减速 30%，持续 2 秒。' },
        { id: 'w_shockwave_wide', name: '宽幅', slot: 5, icon: ICON + 'shockwave-wide.png',
          desc: '震动波射程提高 25%，末端伤害提高 30%。' }
      ]
    },
    {
      id: 'warcry', skill: 'warcry', name: '战吼',
      group: 'support', unlock: 16,
      desc: '战吼震慑周围敌人，造成伤害并使其减速。',
      nodes: [
        { id: 'w_warcry_tremble', name: '战栗', slot: 0, icon: ICON + 'warcry-tremble.png',
          desc: '战吼命中的敌人攻击力降低 20%，持续 4 秒。' },
        { id: 'w_warcry_fear', name: '恐惧', slot: 1, icon: ICON + 'warcry-fear.png',
          desc: '战吼使命中的敌人恐惧 1.5 秒。' },
        { id: 'w_warcry_echo', name: '回响', slot: 2, icon: ICON + 'warcry-echo.png',
          desc: '战吼结束后 1 秒再次爆发，造成 50% 伤害。' },
        { id: 'w_warcry_lasting', name: '持久', slot: 3, icon: ICON + 'warcry-lasting.png',
          desc: '战吼的减速持续时间延长 50%。' },
        { id: 'w_warcry_sunder', name: '破甲', slot: 4, icon: ICON + 'warcry-sunder.png',
          desc: '战吼命中的敌人护甲降低 35%，持续 4 秒。' },
        { id: 'w_warcry_soulshock', name: '惊魂', slot: 5, icon: ICON + 'warcry-soulshock.png',
          desc: '被战吼命中的敌人受到的所有伤害提高 15%，持续 4 秒。' }
      ]
    }
  ];

  // 三个分组标题条：y 为 PSD 中标题底图的 top，trees 决定右侧「技能点N/N」的统计范围
  DG.data.skillGroups = [
    { id: 'basic', name: '(基础技能)', y: 133, trees: ['cleave'] },
    { id: 'strong', name: '(强力技能)', y: 561, trees: ['whirlwind', 'charge'] },
    { id: 'support', name: '(辅助技能)', y: 985, trees: ['shockwave', 'warcry'] }
  ];

  // 扁平索引：nodeId -> { cls, tree, node, slot, parent }
  DG.data.skillTreeIndex = {};
  let total = 0;
  Object.keys(DG.data.skillTrees).forEach(cls => {
    DG.data.skillTrees[cls].forEach(tree => {
      tree.nodes.forEach(node => {
        node.treeId = tree.id;
        node.skill = tree.skill;
        // 中间节点挂主技能，底部节点挂对应的中间节点
        const parent = node.slot < 2 ? null : tree.nodes[node.slot === 2 || node.slot === 3 ? 0 : 1];
        node.req = parent ? parent.id : null;
        DG.data.skillTreeIndex[node.id] = { cls, tree, node, slot: node.slot, parent };
        total++;
      });
    });
  });
  DG.data.skillTreeTotal = total;
})();
