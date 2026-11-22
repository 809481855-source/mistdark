/* 怪物模块 · 精英（图鉴大造型） */
(function () {
  const DG = window.DG;
  Object.assign(DG.data.monsters, {
    mawflower: {
      id: 'mawflower', name: '噬人花', shape: 'circle', color: '#c0503f', r: 24,
      art: 'mawflower', artScale: 1.12, fxColor: '#ff8f6a', windup: 0.50,
      hp: 120, dmg: 14, speed: 52, attackRange: 66, attackCd: 2.2,
      xp: 30, gold: [10, 18], ranged: false
    },
    plaguedoc: {
      id: 'plaguedoc', name: '瘟疫医师', shape: 'diamond', color: '#4a4636', r: 23,
      art: 'plaguedoc', artScale: 1.10, fxColor: '#ffb26a', windup: 0.46,
      hp: 110, dmg: 15, speed: 80, attackRange: 62, attackCd: 2.0,
      xp: 32, gold: [12, 20], ranged: false
    },
    warlock: {
      id: 'warlock', name: '深渊巫师', shape: 'hex', color: '#5a3f78', r: 22,
      art: 'warlock', artScale: 1.08, fxColor: '#9ff08a', windup: 0.30,
      hp: 95, dmg: 12, speed: 64, attackRange: 60, attackCd: 1.9,
      xp: 34, gold: [12, 22], ranged: true, shootCd: 3.2, projectileSpeed: 232,
      projColor: '#9ff08a', castTime: 0.68
    },
  });
})();
