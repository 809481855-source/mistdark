/* 装备 · 底材表：id / 部位 / 名称 / 职业限定 / 固有属性（implicit）
   新增一件装备只需要在这里加一行；生成、重铸、掉落逻辑都在 js/data/items.js 里，不用改。 */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};

  // 没有 cls 字段表示全职业通用；有则只有该职业能装备
  DG.data.itemBases = [
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
    { id: 'pauldron', slot: 'shoulder', name: '铁护肩', implicit: { armor: [3, 6] } },
    { id: 'spaulder', slot: 'shoulder', name: '皮革护肩', implicit: { armor: [2, 4], hp: [6, 12] } },
    { id: 'legging', slot: 'pants', name: '皮裤', implicit: { armor: [3, 5] } },
    { id: 'legplate', slot: 'pants', name: '腿甲', implicit: { armor: [5, 8] } },
    { id: 'clothpants', slot: 'pants', name: '布裤', implicit: { armor: [2, 3], hp: [8, 16] } },
    { id: 'shield', slot: 'offhand', name: '圆盾', cls: 'warrior', implicit: { armor: [5, 9] } },
    { id: 'orb', slot: 'offhand', name: '法球', cls: 'mage', implicit: { atk: [3, 6] } },
    { id: 'quiver', slot: 'offhand', name: '箭袋', cls: 'ranger', implicit: { atk: [2, 4], crit: [1, 2] } },
    { id: 'ring', slot: 'ring', name: '指环', implicit: {} },
    { id: 'amulet', slot: 'amulet', name: '护符', implicit: {} }
  ];

  // 便捷索引：各处按 id 取底材时不必重复建表
  DG.data.itemBaseById = {};
  DG.data.itemBases.forEach((b) => { DG.data.itemBaseById[b.id] = b; });
})();
