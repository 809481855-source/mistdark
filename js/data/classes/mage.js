/* 角色模块 · 术士（元素施法）：职业数值 / 技能 / 天赋树集中在本文件 */
(function () {
  const DG = window.DG;
  const pct = DG.data.pct;

  const skills = {
    firebolt: {
      id: 'firebolt', name: '奥术飞弹', glyph: '弹', classId: 'mage',
      type: 'projectile', cooldown: 0, speed: 560, range: 620, color: '#9d9df0',
      mult: (lv) => 1.15 + 0.13 * (lv - 1),
      desc: (lv) => `凝聚奥术飞弹，造成 <em>${pct(1.15 + 0.13 * (lv - 1))}</em> 攻击力伤害。`
    },
    frostnova: {
      id: 'frostnova', name: '冰霜新星', glyph: '霜', classId: 'mage',
      type: 'nova', cooldown: 7, radius: 165, slow: 0.5, slowDur: 2.6,
      color: '#8ec9e8',
      mult: (lv) => 1.3 + 0.2 * (lv - 1),
      desc: (lv) => `释放冰环，对 ${165} 码内敌人造成 <em>${pct(1.3 + 0.2 * (lv - 1))}</em> 攻击力伤害并减速。`
    },
    blink: {
      id: 'blink', name: '闪现', glyph: '闪', classId: 'mage',
      type: 'dash', cooldown: 7, dist: 240, teleport: true, invuln: 0.15,
      trailColor: '#9d9df0',
      mult: () => 0,
      desc: () => `瞬移至瞄准方向，落地时短暂<em>免疫伤害</em>。`
    },
    meteor: {
      id: 'meteor', name: '陨星术', glyph: '陨', classId: 'mage',
      type: 'nova', cooldown: 10, radius: 200, color: '#c39bf0',
      mult: (lv) => 2.0 + 0.26 * (lv - 1),
      desc: (lv) => `召唤陨星砸落，对 ${200} 码内敌人造成 <em>${pct(2.0 + 0.26 * (lv - 1))}</em> 攻击力伤害。`
    },
    chainbolt: {
      id: 'chainbolt', name: '连锁奥术', glyph: '链', classId: 'mage',
      type: 'spread', cooldown: 4.5, count: 3, spread: 0.4, speed: 600, range: 600,
      color: '#b3c4ff',
      mult: (lv) => 0.85 + 0.1 * (lv - 1),
      desc: (lv) => `一次射出 3 枚奥术弹，每枚造成 <em>${pct(0.85 + 0.1 * (lv - 1))}</em> 攻击力伤害。`
    }
  };

  const skillTags = {
    firebolt: ['spell', 'arcane'],
    frostnova: ['spell', 'frost'],
    blink: ['spell'],
    meteor: ['spell', 'arcane'],
    chainbolt: ['spell', 'arcane']
  };

  const talents = {
    id: 'mage',
    name: '术士',
    branches: [
      {
        id: 'frost',
        name: '冰霜',
        desc: '控住全场，再慢慢碾碎',
        nodes: [
          { id: 'm_fro_1', name: '寒流', glyph: '寒', desc: '冰霜伤害 +10%', tags: { frost: 10 } },
          { id: 'm_fro_2', name: '霜冻', glyph: '霜', desc: '冰霜新星减速效果 +10%', skill: { ids: ['frostnova'], slowPct: 10 } },
          { id: 'm_fro_3', name: '冰冷专注', glyph: '冰', desc: '对减速目标伤害 +15%', mods: { slowedDmgPct: 15 } },
          { id: 'm_fro_4', name: '新星强化', glyph: '星', desc: '冰霜新星半径 +20%', skill: { ids: ['frostnova'], radiusPct: 20 } },
          { id: 'm_fro_5', name: '严寒', glyph: '严', desc: '冰霜新星减速持续时间 +30%', skill: { ids: ['frostnova'], slowDurPct: 30 } },
          {
            id: 'm_fro_6', name: '绝对零度', glyph: '零', keystone: true, levelReq: 12,
            desc: '冰霜新星使敌人冻结 1 秒（视作 100% 减速）', flag: 'absoluteZero'
          }
        ]
      },
      {
        id: 'arcane',
        name: '奥术',
        desc: '用纯粹的奥能淹没战场',
        nodes: [
          { id: 'm_arc_1', name: '奥能', glyph: '奥', desc: '奥术伤害 +10%', tags: { arcane: 10 } },
          { id: 'm_arc_2', name: '急速咏唱', glyph: '咏', desc: '攻击速度 +8%', mods: { attackSpeedPct: 8 } },
          { id: 'm_arc_3', name: '连锁强化', glyph: '链', desc: '连锁奥术 +2 枚弹', skill: { ids: ['chainbolt'], countBonus: 2 } },
          { id: 'm_arc_4', name: '陨星', glyph: '陨', desc: '陨星术半径 +15%', skill: { ids: ['meteor'], radiusPct: 15 } },
          { id: 'm_arc_5', name: '法力涌动', glyph: '涌', desc: '技能冷却 -10%', mods: { cdrPct: 10 } },
          {
            id: 'm_arc_6', name: '奥能过载', glyph: '载', keystone: true, levelReq: 12,
            desc: '每释放 3 次主动技能，下一次技能伤害 +120%', flag: 'overload'
          }
        ]
      },
      {
        id: 'void',
        name: '虚空',
        desc: '在死亡的边缘反复横跳',
        nodes: [
          { id: 'm_voi_1', name: '体魄', glyph: '体', desc: '最大生命 +10%', mods: { maxHpPct: 10 } },
          { id: 'm_voi_2', name: '虚空步', glyph: '步', desc: '闪现冷却 -20%', skill: { ids: ['blink'], cdrPct: 20 } },
          { id: 'm_voi_3', name: '残影', glyph: '影', desc: '闪现后 2 秒内受到伤害 -25%', flag: 'voidGuard' },
          { id: 'm_voi_4', name: '汲取', glyph: '汲', desc: '击杀回复 2% 最大生命', mods: { killHealPct: 2 } },
          { id: 'm_voi_5', name: '灵巧', glyph: '灵', desc: '移动速度 +8%', mods: { moveSpeedPct: 8 } },
          {
            id: 'm_voi_6', name: '虚化', glyph: '虚', keystone: true, levelReq: 12,
            desc: '生命低于 30% 时自动闪现脱离并重置闪现冷却（60 秒一次）', flag: 'voidShift'
          }
        ]
      }
    ]
  };

  DG.data.registerClass({
    id: 'mage',
    name: '术士',
    title: '元素施法',
    glyph: '术',
    color: '#6a6bb0',
    desc: '脆弱但爆发极高，用冰霜与奥术控住全场。',
    base: {
      atk: 15, hp: 105, armor: 5, crit: 5, critDmg: 175,
      moveSpeed: 206, attackSpeed: 0.95, hpRegen: 1.2
    },
    autoSkill: 'firebolt',
    skills: ['frostnova', 'blink', 'meteor', 'chainbolt'],
    starterWeapon: 'staff'
  }, { skills, skillTags, talents });
})();
