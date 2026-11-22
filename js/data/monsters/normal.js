/* 怪物模块 · 普通小怪（各副本共享的常规敌人；贴图全部来自本轮新资源） */
(function () {
  const DG = window.DG;
  Object.assign(DG.data.monsters, {
    wolf: {
      id: 'wolf', name: '腐化野狼', shape: 'triangle', color: '#7a5f96', r: 17,
      art: 'wolf', artScale: 1, fxColor: '#c98ae0', windup: 0.26,
      hp: 30, dmg: 7, speed: 128, attackRange: 44, attackCd: 1.2,
      xp: 8, gold: [2, 5], ranged: false
    },
    skeleton: {
      id: 'skeleton', name: '骷髅战士', shape: 'square', color: '#c8d4e0', r: 18,
      art: 'skeleton', artScale: 1, fxColor: '#9fd8ff', windup: 0.34,
      hp: 46, dmg: 9, speed: 82, attackRange: 46, attackCd: 1.5,
      xp: 10, gold: [3, 6], ranged: false
    },
    mistwalker: {
      id: 'mistwalker', name: '迷雾行者', shape: 'diamond', color: '#8a3a3c', r: 17,
      art: 'mistwalker', artScale: 1, fxColor: '#ff6a6a', windup: 0.30,
      hp: 34, dmg: 8, speed: 76, attackRange: 46, attackCd: 1.6,
      xp: 12, gold: [4, 8], ranged: true, shootCd: 2.4, projectileSpeed: 250,
      projColor: '#ff6a6a'
    },

    /* 孢帽菌人：白帽紫口菌，近身顶撞 */
    pea: {
      id: 'pea', name: '孢帽菌人', shape: 'circle', color: '#7fa8c8', r: 17,
      art: 'pea', artScale: 1, fxColor: '#c9a8ff', windup: 0.30,
      hp: 36, dmg: 8, speed: 94, attackRange: 44, attackCd: 1.5,
      xp: 10, gold: [3, 7], ranged: false
    },

    /* 菌帽枪手：蓝帽菌骷髅，远程火枪 */
    musketeer: {
      id: 'musketeer', name: '菌帽枪手', shape: 'circle', color: '#4a6f9e', r: 17,
      art: 'musketeer', artScale: 1, fxColor: '#ffcf7a', windup: 0.32,
      hp: 34, dmg: 7, speed: 74, attackRange: 46, attackCd: 1.7,
      xp: 12, gold: [4, 8], ranged: true, shootCd: 2.5, projectileSpeed: 268,
      projColor: '#ffc46a'
    },

    /* 裂口刈手：刺背巨口兽，前摇长伤害高 */
    pumpkin: {
      id: 'pumpkin', name: '裂口刈手', shape: 'square', color: '#8a4a3a', r: 19,
      art: 'pumpkin', artScale: 1, fxColor: '#ff7a6a', windup: 0.42,
      hp: 56, dmg: 12, speed: 78, attackRange: 54, attackCd: 1.9,
      xp: 14, gold: [5, 9], ranged: false
    },

    /* 赤红史莱姆：跳跃扑咬，血厚移速慢 */
    slime: {
      id: 'slime', name: '赤红史莱姆', shape: 'circle', color: '#b83f45', r: 19,
      art: 'slime', artScale: 1, fxColor: '#ff6a6a', windup: 0.26,
      hp: 70, dmg: 8, speed: 66, attackRange: 48, attackCd: 1.8,
      xp: 12, gold: [4, 8], ranged: false
    },

    /* 批次四 · 同族变体：按副本难度调数值 */
    frostwolf: {
      id: 'frostwolf', name: '霜牙狼', shape: 'triangle', color: '#6b5a92', r: 18,
      art: 'frostwolf', artScale: 1.02, fxColor: '#c98ae0', windup: 0.26,
      hp: 52, dmg: 10, speed: 136, attackRange: 44, attackCd: 1.15,
      xp: 14, gold: [5, 10], ranged: false
    },
    boneknight: {
      id: 'boneknight', name: '缠尸卫士', shape: 'square', color: '#9aa0a8', r: 19,
      art: 'boneknight', artScale: 1.04, fxColor: '#c8c8d0', windup: 0.34,
      hp: 78, dmg: 12, speed: 74, attackRange: 48, attackCd: 1.5,
      xp: 18, gold: [6, 12], ranged: false
    },
    frostslime: {
      id: 'frostslime', name: '霜颅骸骨', shape: 'circle', color: '#6fd0e0', r: 20,
      art: 'frostslime', artScale: 1.05, fxColor: '#9fe8ff', windup: 0.28,
      hp: 96, dmg: 10, speed: 58, attackRange: 48, attackCd: 1.9,
      xp: 16, gold: [6, 11], ranged: false
    },

    /* 贴图小怪 */
    bat: {
      id: 'bat', name: '血翼蝠', shape: 'circle', color: '#3a2f44', r: 16,
      art: 'bat', artScale: 1, fxColor: '#ffd24a', windup: 0.24,
      hp: 38, dmg: 9, speed: 136, attackRange: 42, attackCd: 1.3,
      xp: 12, gold: [3, 8], ranged: false
    },
    hornet: {
      id: 'hornet', name: '毒刺蜂', shape: 'circle', color: '#b8403c', r: 15,
      art: 'hornet', artScale: 1, fxColor: '#f2d24a', windup: 0.22,
      hp: 32, dmg: 8, speed: 112, attackRange: 46, attackCd: 1.6,
      xp: 12, gold: [4, 9], ranged: true, shootCd: 2.2, projectileSpeed: 300,
      projColor: '#f2d24a'
    },
    beetle: {
      id: 'beetle', name: '青壳甲虫', shape: 'circle', color: '#2fa8a0', r: 20,
      art: 'beetle', artScale: 1, fxColor: '#63e0d0', windup: 0.44,
      hp: 96, dmg: 13, speed: 50, attackRange: 48, attackCd: 2.0,
      xp: 20, gold: [7, 13], ranged: false
    },
    cinderraven: {
      id: 'cinderraven', name: '黑焰蝠', shape: 'diamond', color: '#3a3a44', r: 22,
      art: 'cinderraven', artScale: 1, fxColor: '#ff5a5a', windup: 0.30,
      hp: 84, dmg: 14, speed: 60, attackRange: 48, attackCd: 1.9,
      xp: 26, gold: [9, 16], ranged: true, shootCd: 3.2, projectileSpeed: 214,
      projColor: '#ff5a5a', castTime: 0.70
    },

    /* 批次六 · 贴图 + 分件摆动 */
    candle: {
      id: 'candle', name: '魔锅炉怪', shape: 'square', color: '#5a4a8a', r: 20,
      art: 'candle', artScale: 1, fxColor: '#ffb648', windup: 0.30,
      hp: 66, dmg: 11, speed: 58, attackRange: 52, attackCd: 2.0,
      xp: 20, gold: [6, 11], ranged: true, shootCd: 2.9, projectileSpeed: 214,
      projColor: '#ffb648', castTime: 0.66
    },
    urchin: {
      id: 'urchin', name: '棘刺仙人掌', shape: 'circle', color: '#6f8f4a', r: 20,
      art: 'urchin', artScale: 1, fxColor: '#a7e06a', windup: 0.34,
      hp: 88, dmg: 12, speed: 46, attackRange: 48, attackCd: 1.9,
      xp: 18, gold: [6, 12], ranged: false
    },
    deepfin: {
      id: 'deepfin', name: '幽蓝喙兽', shape: 'circle', color: '#6b7f9e', r: 17,
      art: 'deepfin', artScale: 1, fxColor: '#c9e0ff', windup: 0.24,
      hp: 44, dmg: 9, speed: 132, attackRange: 44, attackCd: 1.25,
      xp: 12, gold: [4, 8], ranged: false
    },
    cowlbandit: {
      id: 'cowlbandit', name: '游荡菌人', shape: 'diamond', color: '#3a6f9e', r: 18,
      art: 'cowlbandit', artScale: 1, fxColor: '#7fc0f0', windup: 0.28,
      hp: 62, dmg: 11, speed: 96, attackRange: 46, attackCd: 1.5,
      xp: 15, gold: [5, 10], ranged: false
    },
    angler: {
      id: 'angler', name: '渊灯兽', shape: 'triangle', color: '#2f3a5a', r: 18,
      art: 'angler', artScale: 1, fxColor: '#ffd24a', windup: 0.32,
      hp: 58, dmg: 10, speed: 78, attackRange: 50, attackCd: 2.1,
      xp: 16, gold: [5, 10], ranged: true, shootCd: 2.6, projectileSpeed: 246,
      projColor: '#ffd24a'
    },
    fleece: {
      id: 'fleece', name: '绷带猫', shape: 'circle', color: '#cfd8d0', r: 18,
      art: 'fleece', artScale: 1, fxColor: '#a8e0d0', windup: 0.26,
      hp: 54, dmg: 8, speed: 104, attackRange: 46, attackCd: 1.6,
      xp: 13, gold: [4, 9], ranged: false
    },
    foxraider: {
      id: 'foxraider', name: '灰狐掠手', shape: 'triangle', color: '#7a6f96', r: 18,
      art: 'foxraider', artScale: 1, fxColor: '#c98ae0', windup: 0.24,
      hp: 46, dmg: 10, speed: 138, attackRange: 44, attackCd: 1.2,
      xp: 13, gold: [4, 9], ranged: false
    },
    emberdrake: {
      id: 'emberdrake', name: '赤棘龙', shape: 'diamond', color: '#b4502f', r: 21,
      art: 'emberdrake', artScale: 1, fxColor: '#ff7a4a', windup: 0.34,
      hp: 92, dmg: 14, speed: 62, attackRange: 54, attackCd: 2.2,
      xp: 24, gold: [8, 14], ranged: true, shootCd: 3.0, projectileSpeed: 220,
      projColor: '#ff7a4a', castTime: 0.70
    },
    venomlisk: {
      id: 'venomlisk', name: '绿鳞蛇', shape: 'hex', color: '#5f9a3c', r: 19,
      art: 'venomlisk', artScale: 1, fxColor: '#a7e06a', windup: 0.30,
      hp: 70, dmg: 12, speed: 84, attackRange: 48, attackCd: 1.7,
      xp: 18, gold: [6, 11], ranged: false
    },
    bulwark: {
      id: 'bulwark', name: '铁背野猪', shape: 'square', color: '#b4542f', r: 22,
      art: 'bulwark', artScale: 1, fxColor: '#ff9a5a', windup: 0.44,
      hp: 120, dmg: 13, speed: 44, attackRange: 50, attackCd: 2.0,
      xp: 22, gold: [8, 14], ranged: false
    },

    /* 新增 · 墓穴木乃伊：慢速高血量前排 */
    mummy: {
      id: 'mummy', name: '墓穴木乃伊', shape: 'square', color: '#9aa0a8', r: 20,
      art: 'mummy', artScale: 1.05, fxColor: '#c8c8d0', windup: 0.38,
      hp: 108, dmg: 13, speed: 46, attackRange: 50, attackCd: 2.0,
      xp: 20, gold: [7, 13], ranged: false
    },
  });
})();
