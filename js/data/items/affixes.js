/* 装备 · 词缀池：通用属性词缀 + 各职业流派词缀
   流派词缀以 skill.<技能id>.<字段> 存储，战斗层聚合后直接生效；
   cls 字段表示只在该职业的装备上出现，family 用于命名与显示分类。 */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};

  DG.data.affixes = [
    { stat: 'atk', min: 2, max: 4, weight: 10 },
    { stat: 'atkPct', min: 3, max: 7, weight: 5 },
    { stat: 'hp', min: 8, max: 16, weight: 10 },
    { stat: 'armor', min: 4, max: 9, weight: 7 },
    { stat: 'crit', min: 1.5, max: 3.5, weight: 5, decimals: 1 },
    { stat: 'critDmg', min: 6, max: 14, weight: 5 },
    { stat: 'moveSpeed', min: 3, max: 6, weight: 4, decimals: 1 },
    { stat: 'attackSpeed', min: 3, max: 6, weight: 4, decimals: 1 },
    { stat: 'hpRegen', min: 0.5, max: 1.5, weight: 4, decimals: 1 },

    // —— 野蛮人流派：挥砍（普攻/出血） ——
    { stat: 'skill.cleave.dmgPct', min: 8, max: 16, weight: 5, cls: 'warrior', family: 'cleave' },
    { stat: 'skill.cleave.arcPct', min: 6, max: 12, weight: 4, cls: 'warrior', family: 'cleave' },
    // —— 野蛮人流派：旋风 ——
    { stat: 'skill.whirlwind.dmgPct', min: 8, max: 18, weight: 5, cls: 'warrior', family: 'whirlwind' },
    { stat: 'skill.whirlwind.radiusPct', min: 6, max: 14, weight: 4, cls: 'warrior', family: 'whirlwind' },
    { stat: 'skill.whirlwind.cdrPct', min: 6, max: 14, weight: 4, cls: 'warrior', family: 'whirlwind' },
    // —— 野蛮人流派：冲锋 ——
    { stat: 'skill.charge.dmgPct', min: 10, max: 20, weight: 5, cls: 'warrior', family: 'charge' },
    { stat: 'skill.charge.cdrPct', min: 6, max: 14, weight: 4, cls: 'warrior', family: 'charge' },
    { stat: 'skill.charge.distPct', min: 8, max: 16, weight: 3, cls: 'warrior', family: 'charge' },
    // —— 野蛮人流派：震动波 ——
    { stat: 'skill.shockwave.dmgPct', min: 8, max: 18, weight: 5, cls: 'warrior', family: 'shockwave' },
    { stat: 'skill.shockwave.radiusPct', min: 6, max: 14, weight: 4, cls: 'warrior', family: 'shockwave' },
    { stat: 'skill.shockwave.pierceBonus', min: 1, max: 1, weight: 3, cls: 'warrior', family: 'shockwave', decimals: 0 },
    // —— 野蛮人流派：战吼 ——
    { stat: 'skill.warcry.dmgPct', min: 10, max: 20, weight: 5, cls: 'warrior', family: 'warcry' },
    { stat: 'skill.warcry.radiusPct', min: 8, max: 16, weight: 4, cls: 'warrior', family: 'warcry' },
    { stat: 'skill.warcry.slowPct', min: 5, max: 10, weight: 4, cls: 'warrior', family: 'warcry' },
    { stat: 'skill.warcry.slowDurPct', min: 10, max: 20, weight: 4, cls: 'warrior', family: 'warcry' },

    // —— 游侠流派 ——
    { stat: 'skill.arrow.dmgPct', min: 8, max: 16, weight: 4, cls: 'ranger', family: 'arrow' },
    { stat: 'skill.snipe.dmgPct', min: 10, max: 20, weight: 4, cls: 'ranger', family: 'snipe' },
    { stat: 'skill.multishot.countBonus', min: 1, max: 1, weight: 3, cls: 'ranger', family: 'multishot', decimals: 0 },
    // —— 法师流派 ——
    { stat: 'skill.meteor.dmgPct', min: 10, max: 20, weight: 4, cls: 'mage', family: 'meteor' },
    { stat: 'skill.frostnova.radiusPct', min: 6, max: 14, weight: 4, cls: 'mage', family: 'frostnova' },
    { stat: 'skill.chainbolt.dmgPct', min: 8, max: 16, weight: 4, cls: 'mage', family: 'chainbolt' }
  ];

  // 流派名称：用于稀有/传奇装备命名，让词条一眼能看出走了哪条路
  DG.data.affixFamilies = {
    cleave: '裂刃', whirlwind: '疾风', charge: '破阵', shockwave: '震荡', warcry: '战栗',
    arrow: '穿云', snipe: '猎星', multishot: '箭雨',
    meteor: '陨火', frostnova: '霜环', chainbolt: '链雷'
  };

  // 流派词缀的显示文案：skill.<id>.<字段>
  DG.data.affixSkillFields = {
    dmgPct: { label: '伤害', suffix: '%', decimals: 0 },
    cdrPct: { label: '冷却缩减', suffix: '%', decimals: 0 },
    radiusPct: { label: '范围', suffix: '%', decimals: 0 },
    arcPct: { label: '弧度', suffix: '%', decimals: 0 },
    slowPct: { label: '减速强度', suffix: '%', decimals: 0 },
    slowDurPct: { label: '减速持续', suffix: '%', decimals: 0 },
    countBonus: { label: '额外投射物', suffix: '', decimals: 0 },
    pierceBonus: { label: '穿透', suffix: '', decimals: 0 },
    distPct: { label: '距离', suffix: '%', decimals: 0 }
  };
})();
