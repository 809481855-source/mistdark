/* 任务数据：主线章节（与全部关卡一一对应）+ 可循环的悬赏模板 */
(function () {
  const DG = window.DG;
  DG.data.quests = DG.data.quests || {};

  // 主线：每关一条，通关后回城领取，奖励技能树点数推动长线养成。
  // 原有 20 关保留手写文案，新增关卡按关卡名与描述自动生成。
  const handWritten = {
    grove: ['迷雾初醒', '穿过迷雾林地，活着回来。', '第一缕雾里藏着腐化的味道。'],
    thicket: ['荆棘之路', '清空荆棘林径的兽群。', '林径被野兽划出了领地。'],
    fen: ['沼泽低语', '深入腐朽沼泽，找出低语的源头。', '腐水之下，有什么在数你的心跳。'],
    crypt: ['亡者不眠', '在沉沦墓穴中终结亡者的徘徊。', '这里的墓穴比尸体更古老。'],
    catacomb: ['幽影尽头', '走完幽影墓道，带回墓道的答案。', '骸骨列队，像是为你准备的仪仗。'],
    ashlands: ['灰烬之上', '在灰烬荒原上留下新的脚印。', '灰烬盖住了上一批人的脚印。'],
    abyss: ['深渊回望', '击碎腐化深渊的注视。', '深渊不眨眼，但你可以。'],
    rift: ['裂隙错位', '穿过裂隙回廊，别被折叠的空间留下。', '走廊的尽头不是墙，是另一条走廊。'],
    furnace: ['熔火不熄', '熄灭熔火工坊的炉心。', '炉火已经烧了三百年。'],
    plague: ['疫病止息', '终结疫病巢穴的扩散。', '绿色的空气也有重量。'],
    shipwreck: ['沉船潮声', '在沉船海滩立下第一块碑。', '潮水把名字都磨掉了。'],
    tidecave: ['潮汐深处', '潜入潮汐洞窟，带出深渊的回声。', '深水里的光不是星光。'],
    frostkeep: ['霜封誓约', '敲开霜封要塞的冰门。', '誓约冻住了，人也是。'],
    sanctum: ['遗忘祷声', '让遗忘圣所的祷声真正安静。', '长明灯照着空无一人的跪垫。'],
    voidgate: ['虚空开门', '在虚空之门前守住自己的影子。', '门后没有门，只有一样的黑。'],
    bonehall: ['骸骨为阶', '踏过骸骨大殿的最后一阶。', '每一级台阶都记得踩过它的人。'],
    emberthrone: ['烬火王座', '在烬火王座前站到最后。', '王座在等一个坐得下的人。'],
    shadowcourt: ['暗影回廊', '穿过暗影回廊，别回头。', '影子比你多走了一步。'],
    worldscar: ['世界之痕', '沿着地裂走到世界之痕的尽头。', '裂缝另一头，是别处的天空。'],
    finalgate: ['终焉之门', '推开终焉之门，终结这场腐化。', '门后是终点，也是起点。']
  };

  DG.data.quests.main = DG.data.dungeons.map((def, i) => {
    const q = handWritten[def.id];
    return {
      id: 'm' + (i + 1),
      index: i + 1,
      stage: def.id,
      name: q ? q[0] : def.name,
      desc: q ? q[1] : `清空「${def.name}」，活着回来。`,
      lore: q ? q[2] : def.desc,
      reward: {
        gold: 60 + i * 45,
        // 主线经验压缩到总量约 2.7 万，只作为关卡经验的补充，
        // 避免 80 条任务直接送出数倍升级经验
        xp: 20 + i * 8,
        // 技能树点每 4 关 1 点，80 关正好 20 点，对应 20 个树节点
        treePoints: i % 4 === 0 ? 1 : 0,
        skillPoints: 0
      }
    };
  });

  // 悬赏：不限次数，完成后自动补新，作为长线金币与装备补充。
  // 不给技能点/树点，避免无限循环任务把养成点数刷爆
  DG.data.quests.bountyTemplates = [
    { key: 'hunt', type: 'kill', name: '清剿委托', desc: '击杀 {n} 个敌人', min: 24, max: 40, reward: { gold: 1.0, xp: 1.0 } },
    { key: 'elite', type: 'elite', name: '精英猎杀', desc: '击败 {n} 个精英', min: 3, max: 6, reward: { gold: 1.4, xp: 1.3 } },
    { key: 'boss', type: 'boss', name: '首领通缉', desc: '击败 {n} 个首领', min: 1, max: 2, reward: { gold: 2.6, xp: 2.0 } },
    { key: 'loot', type: 'loot', name: '物资回收', desc: '拾取 {n} 件物品', min: 5, max: 9, reward: { gold: 1.1, xp: 0.8 } },
    { key: 'clear', type: 'clear', name: '推进战线', desc: '通关 {n} 个关卡', min: 1, max: 1, reward: { gold: 2.0, xp: 1.6 } }
  ];

  // 悬赏奖励随等级成长；经验只作为零头，防止无限接取绕开等级曲线
  DG.data.quests.bountyReward = function (tmpl, level) {
    const lv = Math.max(1, level || 1);
    const r = tmpl.reward || {};
    return {
      gold: Math.round((30 + lv * 9) * (r.gold || 1)),
      xp: Math.round((15 + lv * 5) * (r.xp || 1))
    };
  };
})();
