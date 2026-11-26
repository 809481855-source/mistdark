/* 角色模块 · 游侠（远程射手）：职业数值 / 技能 / 天赋树集中在本文件 */
(function () {
  const DG = window.DG;
  const pct = DG.data.pct;

  const skills = {
    arrow: {
      id: 'arrow', name: '穿刺箭', glyph: '箭', classId: 'ranger', icon: 'assets/ui/ranger/skill-arrow.png',
      type: 'projectile', cooldown: 0, speed: 760, range: 640, color: '#b8d4a6',
      fx: { variant: 'wind', impact: 'arrowImpact' },
      mult: (lv) => 1.0 + 0.12 * (lv - 1),
      desc: (lv) => `射出箭矢，造成 <em>${pct(1.0 + 0.12 * (lv - 1))}</em> 攻击力伤害。`
    },
    multishot: {
      id: 'multishot', name: '多重箭', glyph: '雨', classId: 'ranger', icon: 'assets/ui/ranger/skill-multishot.png',
      type: 'spread', cooldown: 5, count: 5, spread: 0.52, speed: 700, range: 600,
      color: '#b8d4a6', energy: 12, fx: { variant: 'fan', impact: 'arrowImpact' },
      mult: (lv) => 0.72 + 0.09 * (lv - 1),
      desc: (lv) => `一次射出 5 支箭矢，每支造成 <em>${pct(0.72 + 0.09 * (lv - 1))}</em> 攻击力伤害。（消耗 12 精力）`
    },
    roll: {
      id: 'roll', name: '翻滚', glyph: '翻', classId: 'ranger', icon: 'assets/ui/ranger/skill-roll.png',
      type: 'dash', cooldown: 5.5, dist: 210, invuln: 0.5, trailColor: '#9fc0a8', energy: 15,
      fx: { variant: 'roll', markColor: '#9fc0a8' },
      mult: () => 0,
      desc: () => `向瞄准方向翻滚，翻滚期间<em>免疫伤害</em>。（消耗 15 精力）`
    },
    snipe: {
      id: 'snipe', name: '穿云箭', glyph: '云', classId: 'ranger', icon: 'assets/ui/ranger/skill-snipe.png',
      type: 'projectile', cooldown: 8, speed: 900, range: 720, pierce: 2,
      color: '#d6ecc0', energy: 30, fx: { variant: 'snipe', impact: 'snipeImpact' },
      mult: (lv) => 2.2 + 0.28 * (lv - 1),
      desc: (lv) => `射出一支贯穿箭矢，可穿透 2 名敌人，造成 <em>${pct(2.2 + 0.28 * (lv - 1))}</em> 攻击力伤害。（消耗 30 精力）`
    },
    arrowrain: {
      id: 'arrowrain', name: '箭雨', glyph: '坠', classId: 'ranger', icon: 'assets/ui/ranger/skill-arrowrain.png',
      type: 'spread', cooldown: 9, count: 7, spread: 0.95, speed: 660, range: 580,
      color: '#c2dbaa', energy: 40, fx: { variant: 'rain', impact: 'arrowImpact' },
      mult: (lv) => 0.55 + 0.08 * (lv - 1),
      desc: (lv) => `向身前扇形倾泻 7 支箭矢，每支造成 <em>${pct(0.55 + 0.08 * (lv - 1))}</em> 攻击力伤害。（消耗 40 精力）`
    }
  };

  const skillTags = {
    arrow: ['ranged'],
    multishot: ['ranged'],
    roll: ['ranged'],
    snipe: ['ranged'],
    arrowrain: ['ranged']
  };

  const talents = {
    id: 'ranger',
    name: '游侠',
    branches: [
      {
        id: 'arrow',
        name: '箭术',
        desc: '把每一支箭都送进要害',
        nodes: [
          { id: 'r_arc_1', name: '锐箭', glyph: '箭', desc: '远程伤害 +8%', tags: { ranged: 8 } },
          { id: 'r_arc_2', name: '速射', glyph: '速', desc: '攻击速度 +8%', mods: { attackSpeedPct: 8 } },
          { id: 'r_arc_3', name: '精准', glyph: '准', desc: '暴击率 +6%', mods: { crit: 6 } },
          { id: 'r_arc_4', name: '穿甲', glyph: '穿', desc: '暴击伤害 +20%', mods: { critDmg: 20 } },
          {
            id: 'r_arc_5', name: '箭雨', glyph: '雨',
            desc: '多重箭 / 箭雨额外 +1 支箭',
            skill: { ids: ['multishot', 'arrowrain'], countBonus: 1 }
          },
          {
            id: 'r_arc_6', name: '箭幕', glyph: '幕', keystone: true, levelReq: 12,
            desc: '每第 5 次普攻额外射出 8 支环形箭矢（每支 60% 伤害）', flag: 'arrowCurtain'
          }
        ]
      },
      {
        id: 'mobile',
        name: '游走',
        desc: '活着，才能继续射',
        nodes: [
          { id: 'r_mob_1', name: '轻身', glyph: '身', desc: '移动速度 +10%', mods: { moveSpeedPct: 10 } },
          { id: 'r_mob_2', name: '翻滚精通', glyph: '翻', desc: '翻滚冷却 -25%', skill: { ids: ['roll'], cdrPct: 25 } },
          { id: 'r_mob_3', name: '翻滚余势', glyph: '势', desc: '翻滚后 3 秒内攻击速度 +20%', flag: 'rollHaste' },
          { id: 'r_mob_4', name: '脱战', glyph: '脱', desc: '受击后 2 秒内移动速度 +20%', flag: 'postHurtMove' },
          { id: 'r_mob_5', name: '闪避本能', glyph: '闪', desc: '翻滚无敌时间 +0.3 秒', flag: 'rollInvuln' },
          {
            id: 'r_mob_6', name: '影步', glyph: '影', keystone: true, levelReq: 12,
            desc: '翻滚结束时向最近敌人射出 3 支穿透箭（120% 伤害）', flag: 'shadowStep'
          }
        ]
      },
      {
        id: 'hunt',
        name: '猎杀',
        desc: '先手压制，残血收割',
        nodes: [
          { id: 'r_hun_1', name: '先手', glyph: '先', desc: '对生命高于 70% 的敌人伤害 +20%', mods: { highHpDmgPct: 20 } },
          { id: 'r_hun_2', name: '猎杀', glyph: '猎', desc: '对首领伤害 +12%', mods: { bossDmgPct: 12 } },
          { id: 'r_hun_3', name: '追击', glyph: '追', desc: '对减速目标暴击率 +10%', mods: { slowedCrit: 10 } },
          { id: 'r_hun_4', name: '汲取', glyph: '汲', desc: '击杀回复 2% 最大生命', mods: { killHealPct: 2 } },
          { id: 'r_hun_5', name: '致命', glyph: '命', desc: '暴击伤害 +15%', mods: { critDmg: 15 } },
          {
            id: 'r_hun_6', name: '处决', glyph: '决', keystone: true, levelReq: 12,
            desc: '普通敌人生命低于 15% 时直接击杀；首领额外受到 30% 伤害', flag: 'execute'
          }
        ]
      }
    ]
  };

  DG.data.registerClass({
    id: 'ranger',
    name: '游侠',
    title: '远程射手',
    glyph: '游',
    color: '#4f8f6b',
    desc: '灵活走位与高速射击，以箭雨压制战场。',
    base: {
      atk: 12, hp: 125, armor: 10, crit: 8, critDmg: 160,
      moveSpeed: 250, attackSpeed: 1.15, hpRegen: 1.0
    },
    autoSkill: 'arrow',
    skills: ['multishot', 'roll', 'snipe', 'arrowrain'],
    starterWeapon: 'bow',
    // 受击音效由职业数据指定，战斗代码不再判断职业 id
    behitSfx: 'rangerBehit',
    icons: { equip: 'assets/ui/ranger/func-equip.png' }
  }, { skills, skillTags, talents });
})();
