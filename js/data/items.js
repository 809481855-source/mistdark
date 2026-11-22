/* 装备生成：底材、词缀（含野蛮人流派词缀）、稀有度 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const C = DG.CONFIG;

  // 底材（implicit 为该底材固定的基础属性）
  const bases = DG.data.itemBases = [
    { id: 'sword', slot: 'weapon', name: '铁剑', cls: 'warrior', implicit: { atk: [5, 8] } },
    { id: 'axe', slot: 'weapon', name: '战斧', cls: 'warrior', implicit: { atk: [7, 11] } },
    { id: 'bow', slot: 'weapon', name: '短弓', cls: 'ranger', implicit: { atk: [4, 7] } },
    { id: 'staff', slot: 'weapon', name: '骨杖', cls: 'mage', implicit: { atk: [6, 9] } },
    { id: 'ironhelm', slot: 'helm', name: '铁盔', implicit: { armor: [4, 7] } },
    { id: 'bonehelm', slot: 'helm', name: '骨盔', implicit: { armor: [3, 6], hp: [8, 14] } },
    { id: 'hood', slot: 'helm', name: '狩猎兜帽', implicit: { armor: [2, 4], crit: [1, 2] } },
    { id: 'leather', slot: 'armor', name: '皮甲', implicit: { armor: [6, 10] } },
    { id: 'mail', slot: 'armor', name: '锁甲', implicit: { armor: [10, 15] } },
    { id: 'robe', slot: 'armor', name: '法袍', implicit: { armor: [4, 7], hp: [10, 20] } },
    { id: 'gloves', slot: 'gloves', name: '皮手套', implicit: { armor: [2, 4], attackSpeed: [2, 4] } },
    { id: 'gauntlet', slot: 'gloves', name: '铁手甲', implicit: { armor: [5, 8] } },
    { id: 'huntergrip', slot: 'gloves', name: '猎手护手', implicit: { atk: [2, 4] } },
    { id: 'boots', slot: 'boots', name: '皮靴', implicit: { armor: [2, 4], moveSpeed: [3, 6] } },
    { id: 'greaves', slot: 'boots', name: '胫甲', implicit: { armor: [6, 9] } },
    { id: 'sandals', slot: 'boots', name: '轻履', implicit: { armor: [2, 3], moveSpeed: [4, 7] } },
    { id: 'ring', slot: 'ring', name: '指环', implicit: {} },
    { id: 'amulet', slot: 'amulet', name: '护符', implicit: {} }
  ];

  const baseById = {};
  bases.forEach(b => { baseById[b.id] = b; });

  // 词缀池：通用属性 + 流派专属词缀
  // 流派词缀以 skill.<技能id>.<字段> 存储，战斗层聚合后直接生效
  const affixes = DG.data.affixes = [
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
  const families = {
    cleave: '裂刃', whirlwind: '疾风', charge: '破阵', shockwave: '震荡', warcry: '战栗',
    arrow: '穿云', snipe: '猎星', multishot: '箭雨',
    meteor: '陨火', frostnova: '霜环', chainbolt: '链雷'
  };

  const magicPrefix = ['锋锐的', '厚重的', '迅捷的', '幽影的', '守护的', '猎手的'];
  const rareSuffix = ['迷雾', '残响', '黎明', '沉沦', '断罪', '低语'];
  const legendNames = {
    weapon: '灭雾者',
    helm: '雾隐之冠',
    armor: '不眠壁垒',
    gloves: '碎岩之握',
    boots: '追风踏',
    ring: '回响之戒',
    amulet: '亡者低语'
  };

  // 流派词缀的显示文案：skill.<id>.<字段>
  const SKILL_FIELD = {
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

  function randRarity(minIndex) {
    let list = DG.data.rarity;
    if (minIndex > 0) list = list.slice(minIndex);
    return U.weighted(list);
  }

  function rollImplicit(base, ilvl) {
    const out = {};
    const factor = 1 + Math.max(0, ilvl - 1) * 0.12;
    for (const key in base.implicit) {
      const [a, b] = base.implicit[key];
      const meta = C.STAT_META[key] || {};
      const raw = U.rand(a, b) * factor;
      out[key] = meta.decimals ? U.round(raw, meta.decimals) : Math.max(1, Math.round(raw));
    }
    return out;
  }

  function rollAffixValue(def, ilvl) {
    const factor = 1 + Math.max(0, ilvl - 1) * 0.16;
    const raw = U.rand(def.min, def.max) * factor;
    return U.round(raw, def.decimals || 0);
  }

  const items = DG.items = {
    baseById,

    // 拆解 skill.<id>.<字段>，返回 null 表示普通属性
    skillStat(stat) {
      if (!stat || stat.indexOf('skill.') !== 0) return null;
      const rest = stat.slice(6);
      const dot = rest.lastIndexOf('.');
      if (dot <= 0) return null;
      const id = rest.slice(0, dot);
      const field = rest.slice(dot + 1);
      const sk = DG.data.skills[id];
      return {
        id, field,
        skillName: sk ? sk.name : id,
        meta: SKILL_FIELD[field] || { label: field, suffix: '', decimals: 0 }
      };
    },

    formatStat(stat, value) {
      const ss = items.skillStat(stat);
      if (ss) {
        const v = U.round(value, ss.meta.decimals);
        return {
          label: `${ss.skillName}${ss.meta.label}`,
          text: `+${v}${ss.meta.suffix}`
        };
      }
      const meta = C.STAT_META[stat] || { label: stat, suffix: '', decimals: 0 };
      const v = U.round(value, meta.decimals);
      return {
        label: meta.label,
        text: `+${v}${meta.suffix}`
      };
    },

    statsOf(item) {
      const out = {};
      if (!item) return out;
      const add = (k, v) => { out[k] = (out[k] || 0) + v; };
      for (const k in item.implicit) add(k, item.implicit[k]);
      for (const a of (item.affixes || [])) add(a.stat, a.value);
      return out;
    },

    // 装备对比用的粗略评分
    score(item) {
      if (!item) return 0;
      const s = items.statsOf(item);
      const w = {
        atk: 3, atkPct: 3, hp: 0.55, armor: 2, crit: 4.5,
        critDmg: 0.7, moveSpeed: 1.3, attackSpeed: 3.2, hpRegen: 2.4
      };
      let total = 0;
      for (const k in s) {
        if (k.indexOf('skill.') === 0) {
          // 流派词缀按技能威力折算，便于背包里快速比较
          total += (s[k] || 0) * (k.indexOf('countBonus') > 0 ? 12 : 2.6);
        } else {
          total += (s[k] || 0) * (w[k] || 0);
        }
      }
      return Math.round(total);
    },

    displayName(item) {
      return item ? item.name : '';
    },

    // 装备属性行
    describe(item) {
      const lines = [];
      if (!item) return lines;
      for (const k in item.implicit) {
        const f = items.formatStat(k, item.implicit[k]);
        lines.push({ label: f.label, text: f.text });
      }
      for (const a of (item.affixes || [])) {
        const f = items.formatStat(a.stat, a.value);
        lines.push({ label: f.label, text: f.text, skill: !!items.skillStat(a.stat) });
      }
      return lines;
    },

    // 生成一件装备
    generate(ilvl, opts) {
      opts = opts || {};
      ilvl = Math.max(1, Math.round(ilvl || 1));
      const minIndex = opts.minRarity ? DG.data.rarity.findIndex(r => r.id === opts.minRarity) : 0;
      const rarity = opts.rarity
        ? (DG.data.rarityById[opts.rarity] || DG.data.rarity[0])
        : randRarity(Math.max(0, minIndex));

      let base;
      const allowBase = b => !b.cls || !opts.cls || b.cls === opts.cls;
      if (opts.baseId && baseById[opts.baseId]) base = baseById[opts.baseId];
      else if (opts.slot) {
        const list = bases.filter(b => b.slot === opts.slot && allowBase(b));
        base = U.pick(list.length ? list : bases.filter(b => b.slot === opts.slot));
      } else {
        const list = bases.filter(allowBase);
        base = U.pick(list.length ? list : bases);
      }

      const implicit = rollImplicit(base, ilvl);

      // 词缀数量
      let count = U.randInt(rarity.affix[0], rarity.affix[1]);
      if (rarity.id === 'legend') count = Math.max(count, 4);

      // 职业限定的流派词缀只对对应职业掉落，避免给别的职业一堆无效词条
      const pool = affixes.filter(a => {
        if (a.stat in implicit) return false;
        if (a.cls && opts.cls && a.cls !== opts.cls) return false;
        return true;
      });
      const chosen = [];
      const used = {};
      for (let i = 0; i < count && pool.length; i++) {
        const candidates = pool.filter(a => !used[a.stat]);
        if (!candidates.length) break;
        const def = U.weighted(candidates);
        used[def.stat] = true;
        let value = rollAffixValue(def, ilvl);
        if (rarity.id === 'legend') value = U.round(value * 1.15, def.decimals || 0);
        chosen.push({ stat: def.stat, value });
      }

      // 装备名：传奇固定名，稀有带流派名，魔法带品质前缀
      const mainFamily = chosen.map(a => (affixes.find(x => x.stat === a.stat) || {}).family).filter(Boolean)[0];
      let name = base.name;
      if (rarity.id === 'magic') name = U.pick(magicPrefix) + base.name;
      else if (rarity.id === 'rare') {
        name = (mainFamily && families[mainFamily] ? families[mainFamily] + '之' : '') + base.name + ' · ' + U.pick(rareSuffix);
      } else if (rarity.id === 'legend') {
        name = legendNames[base.slot] || base.name;
        if (mainFamily && families[mainFamily]) name = families[mainFamily] + ' · ' + name;
      }

      return {
        id: U.uid(),
        slot: base.slot,
        baseId: base.id,
        name,
        rarity: rarity.id,
        ilvl,
        implicit,
        affixes: chosen
      };
    },

    // 重铸：保留底材 / 品质 / 等级，重掷基础属性与词缀。
    // 作为金币的主要消耗出口，价格随装备等级与品质上涨
    rerollCost(item) {
      if (!item) return 0;
      const mul = { normal: 0.6, magic: 1, rare: 2, legend: 3.5 }[item.rarity] || 0.6;
      return Math.round((100 + (item.ilvl || 1) * 100) * mul);
    },

    reroll(item, cls) {
      if (!item) return null;
      const fresh = items.generate(item.ilvl || 1, {
        baseId: item.baseId,
        rarity: item.rarity,
        cls
      });
      fresh.id = item.id;
      return fresh;
    },

    slotInfo(slotId) {
      return C.SLOTS.find(s => s.id === slotId) || C.SLOTS[0];
    },

    rarityInfo(item) {
      return DG.data.rarityById[item && item.rarity] || DG.data.rarity[0];
    }
  };
})();
