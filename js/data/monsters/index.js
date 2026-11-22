/* 怪物 / 首领注册表：具体条目按分组放在同目录文件，新增怪物只加条目或新分组文件 */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};
  DG.data.monsters = {};
  DG.data.bossMinions = {};
  DG.data.monsterIds = () => Object.keys(DG.data.monsters);
  DG.data.monster = (id) => DG.data.monsters[id] || null;
})();
