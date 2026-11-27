/* 角色模块 · 野蛮人（重甲近战）：职业数值 / 技能 / 天赋树集中在本文件 */
(function () {
  const DG = window.DG;
  const pct = DG.data.pct;

  const skills = {
    cleave: {
      id: 'cleave', name: '挥砍', glyph: '斩', classId: 'warrior', icon: 'assets/ui/warrior/skill-cleave.png',
      unlock: 1,
      type: 'melee', cooldown: 0, range: 84, arc: Math.PI * 0.62,
      color: '#e2a06a',
      // 劈砍刀光由 barbarian.js 沿右手斧刃轨迹自绘，不再走通用程序化弧线
      slashFx: 'hero',
      mult: (lv) => 1.0 + 0.12 * (lv - 1),
      desc: (lv) => `挥刃劈砍前方扇形范围，造成 <em>${pct(1.0 + 0.12 * (lv - 1))}</em> 攻击力伤害。`
    },
    whirlwind: {
      id: 'whirlwind', name: '旋风', glyph: '旋', classId: 'warrior', icon: 'assets/ui/warrior/skill-whirlwind.png',
      unlock: 4,
      type: 'aoeSelf', cooldown: 8, radius: 150, duration: 3,
      // 3 秒内保持原有约 0.1 秒一次的斩击节奏，总伤害不变（单次伤害按命中次数均分）
      hitTimes: [
        0.1, 0.2, 0.3, 0.5, 0.6, 0.7, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5,
        1.6, 1.7, 1.8, 2.0, 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0
      ],
      color: '#e08a56',
      mult: (lv) => 1.7 + 0.25 * (lv - 1),
      desc: (lv) => `旋身 3 秒，期间移速 +30%、不可阻挡，持续斩击周身 ${150} 码内敌人，总计造成 <em>${pct((1.7 + 0.25 * (lv - 1)) * 2.5)}</em> 攻击力伤害；命中敌人时召唤 3 道白色龙卷风，向四周散开后自动锁敌游走 5 秒。`
    },
    charge: {
      id: 'charge', name: '冲锋', glyph: '冲', classId: 'warrior', icon: 'assets/ui/warrior/skill-charge.png',
      unlock: 8,
      type: 'dash', cooldown: 8, dist: 240, damageOnPath: true, trailColor: '#e2a06a',
      mult: (lv) => 2.1 + 0.3 * (lv - 1),
      desc: (lv) => `向前突进并撞开路径上的敌人，造成 <em>${pct(2.1 + 0.3 * (lv - 1))}</em> 攻击力伤害。`
    },
    shockwave: {
      id: 'shockwave', name: '震动波', glyph: '波', classId: 'warrior', icon: 'assets/ui/warrior/skill-shockwave.png',
      unlock: 12,
      type: 'projectile', cooldown: 7, speed: 520, range: 430, color: '#e8a467',
      mult: (lv) => 1.55 + 0.2 * (lv - 1),
      desc: (lv) => `向前轰出冲击波，对沿途敌人造成 <em>${pct(1.55 + 0.2 * (lv - 1))}</em> 攻击力伤害。`
    },
    warcry: {
      id: 'warcry', name: '战吼', glyph: '吼', classId: 'warrior', icon: 'assets/ui/warrior/skill-warcry.png',
      unlock: 16,
      type: 'nova', cooldown: 11, radius: 200, slow: 0.4, slowDur: 2.2,
      color: '#f0b981',
      mult: (lv) => 0.9 + 0.12 * (lv - 1),
      desc: (lv) => `战吼震慑 ${200} 码内敌人，造成 <em>${pct(0.9 + 0.12 * (lv - 1))}</em> 攻击力伤害并使其减速。`
    }
  };

  const skillTags = {
    cleave: ['melee'],
    whirlwind: ['melee'],
    charge: ['melee'],
    shockwave: ['melee'],
    warcry: ['melee']
  };

  const talents = {
    id: 'warrior',
    name: '野蛮人',
    branches: [
      {
        id: 'rage',
        name: '血怒',
        desc: '以伤换伤，残血时爆发',
        nodes: [
          { id: 'w_rage_1', name: '裂刃', glyph: '刃', desc: '近战伤害 +8%', tags: { melee: 8 } },
          { id: 'w_rage_2', name: '狂怒', glyph: '怒', desc: '攻击速度 +8%', mods: { attackSpeedPct: 8 } },
          { id: 'w_rage_3', name: '重击', glyph: '重', desc: '暴击率 +6%', mods: { crit: 6 } },
          { id: 'w_rage_4', name: '破甲', glyph: '破', desc: '暴击伤害 +20%', mods: { critDmg: 20 } },
          { id: 'w_rage_5', name: '旋风', glyph: '旋', desc: '旋风半径 +15%', skill: { ids: ['whirlwind'], radiusPct: 15 } },
          {
            id: 'w_rage_6', name: '血怒', glyph: '血', keystone: true, levelReq: 12,
            desc: '生命低于 40% 时，造成的所有伤害 +35%', flag: 'bloodRage'
          }
        ]
      },
      {
        id: 'defense',
        name: '铁壁',
        desc: '站得住才有输出',
        nodes: [
          { id: 'w_def_1', name: '厚甲', glyph: '甲', desc: '最大生命 +10%', mods: { maxHpPct: 10 } },
          { id: 'w_def_2', name: '铁骨', glyph: '骨', desc: '护甲 +15%', mods: { armorPct: 15 } },
          { id: 'w_def_3', name: '再生', glyph: '愈', desc: '生命回复 +1.5/秒', mods: { hpRegen: 1.5 } },
          { id: 'w_def_4', name: '坚壁', glyph: '壁', desc: '受到伤害后 2 秒内护甲 +20%', flag: 'fortify' },
          {
            id: 'w_def_5', name: '战意', glyph: '吼',
            desc: '战吼半径 +15%，减速效果 +10%',
            skill: { ids: ['warcry'], radiusPct: 15, slowPct: 10 }
          },
          {
            id: 'w_def_6', name: '不屈', glyph: '屈', keystone: true, levelReq: 12,
            desc: '每 60 秒免疫一次致死伤害，并回复 25% 最大生命', flag: 'unyielding'
          }
        ]
      },
      {
        id: 'charge',
        name: '破阵',
        desc: '冲锋开团，越战越勇',
        nodes: [
          { id: 'w_chg_1', name: '疾行', glyph: '行', desc: '移动速度 +8%', mods: { moveSpeedPct: 8 } },
          { id: 'w_chg_2', name: '冲锋强化', glyph: '冲', desc: '冲锋冷却 -20%', skill: { ids: ['charge'], cdrPct: 20 } },
          { id: 'w_chg_3', name: '余震', glyph: '震', desc: '冲锋后 3 秒内攻击速度 +20%', flag: 'chargeHaste' },
          { id: 'w_chg_4', name: '战吼回响', glyph: '响', desc: '战吼冷却 -15%', skill: { ids: ['warcry'], cdrPct: 15 } },
          { id: 'w_chg_5', name: '势不可挡', glyph: '势', desc: '击杀后移动速度 +15%，持续 3 秒', flag: 'killRush' },
          {
            id: 'w_chg_6', name: '破阵', glyph: '阵', keystone: true, levelReq: 12,
            desc: '冲锋路径伤害 +100%，冲锋后 3 秒内暴击率 +15%', flag: 'breaker'
          }
        ]
      }
    ]
  };

  DG.data.registerClass({
    id: 'warrior',
    name: '野蛮人',
    title: '狂战近战',
    glyph: '蛮',
    color: '#c4553e',
    desc: '高生命与护甲，挥动巨刃清空近身一切。',
    base: {
      atk: 13, hp: 170, armor: 22, crit: 5, critDmg: 150,
      moveSpeed: 214, attackSpeed: 1.00, hpRegen: 1.6
    },
    autoSkill: 'cleave',
    skills: ['whirlwind', 'charge', 'shockwave', 'warcry'],
    starterWeapon: 'sword',
    icons: { equip: 'assets/ui/warrior/func-equip.png' }
  }, { skills, skillTags, talents });
})();
