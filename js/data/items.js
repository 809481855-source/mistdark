/* 装备生成：底材、词缀（含野蛮人流派词缀）、稀有度 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const C = DG.CONFIG;

  // 数据表已拆分到 js/data/items/ 下，这里只保留生成 / 重铸逻辑：
  //   bases.js   底材表（DG.data.itemBases / itemBaseById）
  //   affixes.js 词缀池与流派显示（DG.data.affixes / affixFamilies / affixSkillFields）
  //   names.js   命名表（DG.data.itemNames）
  const bases = DG.data.itemBases;
  const baseById = DG.data.itemBaseById;

  const affixes = DG.data.affixes;
  const families = DG.data.affixFamilies;
  const SKILL_FIELD = DG.data.affixSkillFields;
  const magicPrefix = DG.data.itemNames.magicPrefix;
  const rareSuffix = DG.data.itemNames.rareSuffix;
  const legendNames = DG.data.itemNames.legendNames;
  const setNames = DG.data.itemNames.setNames;

  function randRarity(minIndex) {
    let list = DG.data.rarity;
    if (minIndex > 0) list = list.slice(minIndex);
    return U.weighted(list);
  }

  function rollImplicit(base, ilvl, mul) {
    const out = {};
    const factor = (1 + Math.max(0, ilvl - 1) * 0.12) * (mul || 1);
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

      // 远古：仅套装与暗金可出，属性与词缀数量都更强
      const ancient = (rarity.id === 'set' || rarity.id === 'legend') &&
        (opts.ancient != null ? !!opts.ancient : U.chance(0.12));

      const implicit = rollImplicit(base, ilvl, ancient ? 1.3 : 1);

      // 词缀数量
      let count = U.randInt(rarity.affix[0], rarity.affix[1]);
      if (rarity.id === 'legend') count = Math.max(count, 4);
      if (ancient) count += 1;

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
        if (ancient) value = U.round(value * 1.3, def.decimals || 0);
        chosen.push({ stat: def.stat, value });
      }

      // 装备名：传奇固定名，稀有带流派名，魔法带品质前缀
      const mainFamily = chosen.map(a => (affixes.find(x => x.stat === a.stat) || {}).family).filter(Boolean)[0];
      let name = base.name;
      if (rarity.id === 'magic') name = U.pick(magicPrefix) + base.name;
      else if (rarity.id === 'rare') {
        name = (mainFamily && families[mainFamily] ? families[mainFamily] + '之' : '') + base.name + ' · ' + U.pick(rareSuffix);
      } else if (rarity.id === 'set') {
        name = (setNames[base.slot] || '套装') + '·' + base.name;
      } else if (rarity.id === 'legend') {
        name = legendNames[base.slot] || base.name;
        if (mainFamily && families[mainFamily]) name = families[mainFamily] + ' · ' + name;
      }
      if (ancient) name = '远古·' + name;

      return {
        id: U.uid(),
        slot: base.slot,
        baseId: base.id,
        name,
        rarity: rarity.id,
        ancient,
        ilvl,
        implicit,
        affixes: chosen
      };
    },

    // 重铸：保留底材 / 品质 / 等级，重掷基础属性与词缀。
    // 作为金币的主要消耗出口，价格随装备等级与品质上涨
    rerollCost(item) {
      if (!item) return 0;
      const mul = { normal: 0.6, magic: 1, rare: 2, set: 2.6, legend: 3.5 }[item.rarity] || 0.6;
      return Math.round((100 + (item.ilvl || 1) * 100) * mul);
    },

    reroll(item, cls) {
      if (!item) return null;
      const fresh = items.generate(item.ilvl || 1, {
        baseId: item.baseId,
        rarity: item.rarity,
        cls,
        ancient: item.ancient
      });
      fresh.id = item.id;
      return fresh;
    },

    slotInfo(slotId) {
      return C.SLOTS.find(s => s.id === slotId) || C.SLOTS[0];
    },

    rarityInfo(item) {
      return DG.data.rarityById[item && item.rarity] || DG.data.rarity[0];
    },

    // 套装分组：按部位找到所属套装
    setForSlot(slot) {
      const groups = (DG.data.itemNames && DG.data.itemNames.setGroups) || [];
      return groups.find(g => g.slots.indexOf(slot) >= 0) || null;
    },

    // 套装状态：complete=同组部位全部装备套装品质；ancient=同组全部为远古套装
    setState(char, item) {
      const empty = { complete: false, ancient: false };
      if (!char || !item || item.rarity !== 'set') return empty;
      const group = items.setForSlot(item.slot);
      if (!group) return empty;
      let complete = true;
      let ancient = true;
      group.slots.forEach(slot => {
        const eq = char.equipment && char.equipment[slot];
        if (!eq || eq.rarity !== 'set') {
          complete = false;
          ancient = false;
        } else if (!eq.ancient) {
          ancient = false;
        }
      });
      return { complete, ancient: complete && ancient };
    },

    // 品质文案：普通 / 魔法 / 稀有 / 套装 / 暗金，远古前缀
    qualityLabel(item) {
      const r = items.rarityInfo(item);
      return (item && item.ancient ? '远古' : '') + r.name;
    }
  };
})();
