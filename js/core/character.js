/* 角色数据：创建、经验与升级 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  const character = DG.character = {
    xpNeed(level) {
      // 长线曲线：40 级后经验需求明显抬升，配合 80 关卡的等级门槛。
      // 系数 5 让「全清 80 关 + 领完主线」正好落在 55~58 级，等级门槛才有意义
      return Math.round((60 + (level - 1) * 48 + Math.max(0, level - 15) * 26) * 5);
    },

    create(name, clsId) {
      const cls = DG.data.classes[clsId];
      const skills = {};
      skills[cls.autoSkill] = 1;
      cls.skills.forEach(id => { skills[id] = 1; });

      const equipment = {};
      DG.CONFIG.SLOTS.forEach(slot => { equipment[slot.id] = null; });

      const char = {
        id: U.uid(),
        name,
        cls: clsId,
        level: 1,
        xp: 0,
        gold: 0,
        // 技能点：升级（每 3 级 1 点）与主线任务（每 8 关 1 点）共同投放，共 30 点对应 30 个辅助节点
        skillPoints: 0,
        // 旧版技能树点数字段，保留读取兼容，新系统统一使用 skillPoints
        treePoints: 0,
        skills,
        skillTree: {},
        talents: {},
        equipment,
        bag: [],
        // 背包三个分页各自独立存放：装备 / 道具 / 其他，各 32 格
        bagItems: [],
        bagOther: [],
        // 大仓库：临时装备页收藏进来的物品，容量无上限
        stash: [],
        // 关卡通关记录：解锁下一关的依据
        cleared: {},
        quests: null,
        createdAt: Date.now(),
        lastPlayed: Date.now()
      };

      // 初始武器
      const starter = DG.items.generate(1, {
        rarity: 'normal',
        baseId: cls.starterWeapon
      });
      starter.name = DG.items.baseById[cls.starterWeapon].name;
      char.equipment.weapon = starter;

      if (DG.quests && DG.quests.ensure) DG.quests.ensure(char);
      return char;
    },

    // 返回本次升级获得的新等级数组
    addXp(char, amount) {
      if (amount <= 0) return [];
      const maxLevel = DG.CONFIG.MAX_LEVEL || 60;
      char.xp += amount;
      const gained = [];
      let guard = 0;
      while (char.level < maxLevel && char.xp >= character.xpNeed(char.level) && guard++ < 200) {
        char.xp -= character.xpNeed(char.level);
        char.level++;
        // 每 3 级投放 1 点技能点：3/6/…/60 级共 20 点
        if (char.level % 3 === 0) char.skillPoints++;
        gained.push(char.level);
      }
      if (char.level >= maxLevel) char.xp = Math.min(char.xp, character.xpNeed(maxLevel));
      return gained;
    },

    bagUsed(char) {
      return char.bag.filter(Boolean).length;
    },

    // 存档兼容：旧版本缺少字段时补齐，避免读取时在各处做空值判断
    normalize(char) {
      if (!char || typeof char !== 'object') return char;
      if (!Number.isFinite(char.level) || char.level < 1) char.level = 1;
      if (!Number.isFinite(char.xp) || char.xp < 0) char.xp = 0;
      if (!Number.isFinite(char.gold) || char.gold < 0) char.gold = 0;
      if (!Number.isFinite(char.skillPoints) || char.skillPoints < 0) char.skillPoints = 0;
      if (!Number.isFinite(char.treePoints) || char.treePoints < 0) char.treePoints = 0;
      if (!char.skillTree || typeof char.skillTree !== 'object') char.skillTree = {};
      // 旧版技能树节点（id 已不在新索引中）退还为技能点，避免升级后旧投入被吞掉
      const index = DG.data.skillTreeIndex || {};
      let refund = 0;
      for (const id in char.skillTree) {
        if (char.skillTree[id] && !index[id]) {
          delete char.skillTree[id];
          refund++;
        }
      }
      // 旧版树点数统一折算进技能点池
      if (char.treePoints > 0) {
        refund += char.treePoints;
        char.treePoints = 0;
      }
      if (refund) char.skillPoints += refund;
      if (!char.cleared || typeof char.cleared !== 'object') char.cleared = {};

      if (!char.skills || typeof char.skills !== 'object') char.skills = {};
      const cls = DG.data.classes[char.cls];
      if (cls) {
        [cls.autoSkill, ...cls.skills].forEach(id => {
          if (!Number.isFinite(char.skills[id]) || char.skills[id] < 1) char.skills[id] = 1;
        });
      }

      if (!char.equipment || typeof char.equipment !== 'object') char.equipment = {};
      DG.CONFIG.SLOTS.forEach(slot => {
        if (!(slot.id in char.equipment)) char.equipment[slot.id] = null;
      });
      if (!Array.isArray(char.bag)) char.bag = [];
      if (!Array.isArray(char.bagItems)) char.bagItems = [];
      if (!Array.isArray(char.bagOther)) char.bagOther = [];
      if (!Array.isArray(char.stash)) char.stash = [];
      if (DG.talents && DG.talents.ensure) DG.talents.ensure(char);
      if (DG.quests && DG.quests.ensure) DG.quests.ensure(char);
      return char;
    },

    levelProgress(char) {
      const need = character.xpNeed(char.level);
      return U.clamp(char.xp / need, 0, 1);
    }
  };
})();
