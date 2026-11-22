/* 怪物模块 · 普通小怪（各副本共享的常规敌人） */
(function () {
  const DG = window.DG;
  Object.assign(DG.data.monsters, {
    wolf: {
      id: 'wolf', name: '腐化野狼', shape: 'triangle', color: '#8a5a49', r: 17,
      art: 'wolf', artScale: 1, fxColor: '#d99a7c', windup: 0.26,
      hp: 30, dmg: 7, speed: 128, attackRange: 44, attackCd: 1.2,
      xp: 8, gold: [2, 5], ranged: false
    },
    skeleton: {
      id: 'skeleton', name: '骷髅战士', shape: 'square', color: '#b6ae94', r: 18,
      art: 'skeleton', artScale: 1, fxColor: '#d8d1b8', windup: 0.34,
      hp: 46, dmg: 9, speed: 82, attackRange: 46, attackCd: 1.5,
      xp: 10, gold: [3, 6], ranged: false
    },
    mistwalker: {
      id: 'mistwalker', name: '迷雾行者', shape: 'diamond', color: '#6f8fae', r: 17,
      art: 'mistwalker', artScale: 1, fxColor: '#a9d8ea', windup: 0.30,
      hp: 34, dmg: 8, speed: 76, attackRange: 46, attackCd: 1.6,
      xp: 12, gold: [4, 8], ranged: true, shootCd: 2.4, projectileSpeed: 250,
      projColor: '#a9d8ea'
    },

    /* 小怪 · 小碗豆：矢量分件 + 孢毒顶撞（规范见 docs/monster-pipeline.md） */
    pea: {
      id: 'pea', name: '小碗豆', shape: 'circle', color: '#a9c47c', r: 17,
      art: 'pea', artScale: 1, fxColor: '#cbe8a4', windup: 0.30,
      hp: 36, dmg: 8, speed: 94, attackRange: 44, attackCd: 1.5,
      xp: 10, gold: [3, 7], ranged: false
    },

    /* 小怪 · 菌帽枪手：远程火枪，前摇后坐明显 */
    musketeer: {
      id: 'musketeer', name: '菌帽枪手', shape: 'circle', color: '#8fa86a', r: 17,
      art: 'musketeer', artScale: 1, fxColor: '#ffcf7a', windup: 0.32,
      hp: 34, dmg: 7, speed: 74, attackRange: 46, attackCd: 1.7,
      xp: 12, gold: [4, 8], ranged: true, shootCd: 2.5, projectileSpeed: 268,
      projColor: '#ffc46a'
    },

    /* 小怪 · 南瓜刈手：大镰横扫，前摇长伤害高 */
    pumpkin: {
      id: 'pumpkin', name: '南瓜刈手', shape: 'square', color: '#d2762f', r: 19,
      art: 'pumpkin', artScale: 1, fxColor: '#ffd66a', windup: 0.42,
      hp: 56, dmg: 12, speed: 78, attackRange: 54, attackCd: 1.9,
      xp: 14, gold: [5, 9], ranged: false
    },

    /* 小怪 · 王冠史莱姆：跳跃扑咬，血厚移速慢 */
    slime: {
      id: 'slime', name: '王冠史莱姆', shape: 'circle', color: '#58b3a6', r: 19,
      art: 'slime', artScale: 1, fxColor: '#8fe0d0', windup: 0.26,
      hp: 70, dmg: 8, speed: 66, attackRange: 48, attackCd: 1.8,
      xp: 12, gold: [4, 8], ranged: false
    },

    /* 陷阱 · 宝箱怪：伪装成宝箱，触碰后现形；生成即精英（不再随机精英化） */
    mimic: {
      id: 'mimic', name: '宝箱怪', shape: 'square', color: '#c9a24a', r: 22,
      art: 'mimic', artScale: 1, fxColor: '#ffd76a', windup: 0.38,
      hp: 120, dmg: 14, speed: 86, attackRange: 58, attackCd: 1.7,
      xp: 45, gold: [30, 55], ranged: false
    },

    /* 批次四 · 换色变体：同一套分件与动作，按副本难度调数值 */
    frostwolf: {
      id: 'frostwolf', name: '霜牙狼', shape: 'triangle', color: '#9fb6c9', r: 18,
      art: 'frostwolf', artScale: 1.02, fxColor: '#bfe8ff', windup: 0.26,
      hp: 52, dmg: 10, speed: 136, attackRange: 44, attackCd: 1.15,
      xp: 14, gold: [5, 10], ranged: false
    },
    boneknight: {
      id: 'boneknight', name: '骸骨卫士', shape: 'square', color: '#cbb58e', r: 19,
      art: 'boneknight', artScale: 1.04, fxColor: '#b6e08a', windup: 0.34,
      hp: 78, dmg: 12, speed: 74, attackRange: 48, attackCd: 1.5,
      xp: 18, gold: [6, 12], ranged: false
    },
    frostslime: {
      id: 'frostslime', name: '霜晶史莱姆', shape: 'circle', color: '#7cc9e8', r: 20,
      art: 'frostslime', artScale: 1.05, fxColor: '#a8e6ff', windup: 0.28,
      hp: 96, dmg: 10, speed: 58, attackRange: 48, attackCd: 1.9,
      xp: 16, gold: [6, 11], ranged: false
    },

    /* 批次五 · 参考图鉴裁切贴图小怪 */
    bat: {
      id: 'bat', name: '血翼蝠', shape: 'circle', color: '#8e3b46', r: 16,
      art: 'bat', artScale: 1, fxColor: '#e05a6a', windup: 0.24,
      hp: 38, dmg: 9, speed: 136, attackRange: 42, attackCd: 1.3,
      xp: 12, gold: [3, 8], ranged: false
    },
    hornet: {
      id: 'hornet', name: '毒刺蜂', shape: 'circle', color: '#b8453c', r: 15,
      art: 'hornet', artScale: 1, fxColor: '#f2d24a', windup: 0.22,
      hp: 32, dmg: 8, speed: 112, attackRange: 46, attackCd: 1.6,
      xp: 12, gold: [4, 9], ranged: true, shootCd: 2.2, projectileSpeed: 300,
      projColor: '#f2d24a'
    },
    beetle: {
      id: 'beetle', name: '紫壳甲虫', shape: 'circle', color: '#6d3f66', r: 20,
      art: 'beetle', artScale: 1, fxColor: '#b06bd0', windup: 0.44,
      hp: 96, dmg: 13, speed: 50, attackRange: 48, attackCd: 2.0,
      xp: 20, gold: [7, 13], ranged: false
    },
    cinderraven: {
      id: 'cinderraven', name: '黑焰鸦', shape: 'diamond', color: '#3c3a44', r: 22,
      art: 'cinderraven', artScale: 1, fxColor: '#ff8a3c', windup: 0.30,
      hp: 84, dmg: 14, speed: 60, attackRange: 48, attackCd: 1.9,
      xp: 26, gold: [9, 16], ranged: true, shootCd: 3.2, projectileSpeed: 214,
      projColor: '#ff9a3c', castTime: 0.70
    },

    /* 批次六 · 图鉴裁切贴图 + 分件摆动 */
    candle: {
      id: 'candle', name: '焰冠烛魔', shape: 'square', color: '#c99a52', r: 20,
      art: 'candle', artScale: 1, fxColor: '#ffb648', windup: 0.30,
      hp: 66, dmg: 11, speed: 58, attackRange: 52, attackCd: 2.0,
      xp: 20, gold: [6, 11], ranged: true, shootCd: 2.9, projectileSpeed: 214,
      projColor: '#ffb648', castTime: 0.66
    },
    urchin: {
      id: 'urchin', name: '紫棘球', shape: 'circle', color: '#7c3f5e', r: 20,
      art: 'urchin', artScale: 1, fxColor: '#c46a9a', windup: 0.34,
      hp: 88, dmg: 12, speed: 46, attackRange: 48, attackCd: 1.9,
      xp: 18, gold: [6, 12], ranged: false
    },
    deepfin: {
      id: 'deepfin', name: '幽蓝鳍怪', shape: 'circle', color: '#3b6fb0', r: 17,
      art: 'deepfin', artScale: 1, fxColor: '#7fc0f0', windup: 0.24,
      hp: 44, dmg: 9, speed: 132, attackRange: 44, attackCd: 1.25,
      xp: 12, gold: [4, 8], ranged: false
    },
    cowlbandit: {
      id: 'cowlbandit', name: '青兜劫掠者', shape: 'diamond', color: '#2f8a8a', r: 18,
      art: 'cowlbandit', artScale: 1, fxColor: '#63c8bd', windup: 0.28,
      hp: 62, dmg: 11, speed: 96, attackRange: 46, attackCd: 1.5,
      xp: 15, gold: [5, 10], ranged: false
    },
    angler: {
      id: 'angler', name: '黑灯鮟鱇', shape: 'triangle', color: '#3a2f3c', r: 18,
      art: 'angler', artScale: 1, fxColor: '#ff4d5e', windup: 0.32,
      hp: 58, dmg: 10, speed: 78, attackRange: 50, attackCd: 2.1,
      xp: 16, gold: [5, 10], ranged: true, shootCd: 2.6, projectileSpeed: 246,
      projColor: '#ff4d5e'
    },
    fleece: {
      id: 'fleece', name: '白绒羊', shape: 'circle', color: '#cfe2ea', r: 18,
      art: 'fleece', artScale: 1, fxColor: '#a8dcff', windup: 0.26,
      hp: 54, dmg: 8, speed: 104, attackRange: 46, attackCd: 1.6,
      xp: 13, gold: [4, 9], ranged: false
    },
    foxraider: {
      id: 'foxraider', name: '棕狐掠手', shape: 'triangle', color: '#a44a2f', r: 18,
      art: 'foxraider', artScale: 1, fxColor: '#e08a5c', windup: 0.24,
      hp: 46, dmg: 10, speed: 138, attackRange: 44, attackCd: 1.2,
      xp: 13, gold: [4, 9], ranged: false
    },
    emberdrake: {
      id: 'emberdrake', name: '赤棘龙', shape: 'diamond', color: '#b4453f', r: 21,
      art: 'emberdrake', artScale: 1, fxColor: '#ff7a4a', windup: 0.34,
      hp: 92, dmg: 14, speed: 62, attackRange: 54, attackCd: 2.2,
      xp: 24, gold: [8, 14], ranged: true, shootCd: 3.0, projectileSpeed: 220,
      projColor: '#ff7a4a', castTime: 0.70
    },
    venomlisk: {
      id: 'venomlisk', name: '绿棘蜥', shape: 'hex', color: '#6f9a3c', r: 19,
      art: 'venomlisk', artScale: 1, fxColor: '#a7e06a', windup: 0.30,
      hp: 70, dmg: 12, speed: 84, attackRange: 48, attackCd: 1.7,
      xp: 18, gold: [6, 11], ranged: false
    },
    bulwark: {
      id: 'bulwark', name: '蓝甲兽', shape: 'square', color: '#3f6f96', r: 22,
      art: 'bulwark', artScale: 1, fxColor: '#6fb0e0', windup: 0.44,
      hp: 120, dmg: 13, speed: 44, attackRange: 50, attackCd: 2.0,
      xp: 22, gold: [8, 14], ranged: false
    },
  });
})();
