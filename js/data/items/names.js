/* 装备 · 命名表：魔法前缀 / 稀有后缀 / 传奇名 / 套装名
   新增装备部位或改风格只动这里，生成逻辑在 js/data/items.js。 */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};

  DG.data.itemNames = {
    magicPrefix: ['锋锐的', '厚重的', '迅捷的', '幽影的', '守护的', '猎手的'],
    rareSuffix: ['迷雾', '残响', '黎明', '沉沦', '断罪', '低语'],

    // 传奇装备按部位取名
    legendNames: {
      weapon: '灭雾者',
      offhand: '守夜之壁',
      helm: '雾隐之冠',
      armor: '不眠壁垒',
      shoulder: '碎誓者',
      gloves: '碎岩之握',
      pants: '长夜行者',
      boots: '追风踏',
      ring: '回响之戒',
      amulet: '亡者低语'
    },

    // 套装名：绿装按部位取固定套装名，便于一眼看出成套
    setNames: {
      weapon: '裂魂',
      offhand: '守誓',
      helm: '夜视',
      armor: '不眠',
      shoulder: '铁誓',
      gloves: '缚灵',
      pants: '长夜',
      boots: '逐暗',
      ring: '回响',
      amulet: '低语'
    },

    // 套装分组：同组部位全部穿上套装品质装备时判定为“成套”，
    // 装备栏里该组装备会显示套装成套框；不成套仍显示普通套装框
    setGroups: [
      { id: 'mian', name: '不眠', slots: ['helm', 'armor', 'pants', 'boots'] },
      { id: 'fuling', name: '缚灵', slots: ['shoulder', 'gloves', 'ring'] },
      { id: 'liehun', name: '裂魂', slots: ['weapon', 'offhand', 'amulet'] }
    ]
  };
})();
