/* 任务系统：主线进度、悬赏进度、奖励结算 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  function bountyFromTemplate(char, existing) {
    // 尽量刷出不同类型的悬赏，避免三格全是「清剿委托」
    const used = {};
    (existing || []).forEach(q => { if (q) used[q.key] = true; });
    const list = DG.data.quests.bountyTemplates;
    const fresh = list.filter(t => !used[t.key]);
    const tmpl = U.pick(fresh.length ? fresh : list);
    const need = U.randInt(tmpl.min, tmpl.max);
    return {
      key: tmpl.key,
      type: tmpl.type,
      name: tmpl.name,
      need,
      have: 0,
      done: false
    };
  }

  function textOf(q) {
    const tmpl = DG.data.quests.bountyTemplates.find(t => t.key === q.key);
    return tmpl ? tmpl.desc.replace('{n}', q.need) : '';
  }

  const quests = DG.quests = {
    ensure(char) {
      if (!char) return null;
      if (!char.quests || typeof char.quests !== 'object') {
        char.quests = { main: 0, bounties: [] };
      }
      if (!Number.isFinite(char.quests.main)) char.quests.main = 0;
      if (!Array.isArray(char.quests.bounties)) char.quests.bounties = [];
      while (char.quests.bounties.length < 3) char.quests.bounties.push(bountyFromTemplate(char, char.quests.bounties));
      char.quests.bounties.forEach(q => {
        if (!Number.isFinite(q.need) || q.need <= 0) q.need = 5;
        if (!Number.isFinite(q.have)) q.have = 0;
        q.done = q.have >= q.need;
      });
      return char.quests;
    },

    // 当前主线（全部完成返回 null）
    mainQuest(char) {
      const qs = quests.ensure(char);
      return DG.data.quests.main[qs.main] || null;
    },

    mainDone(char) {
      const qs = quests.ensure(char);
      return qs.main >= DG.data.quests.main.length;
    },

    mainReady(char) {
      const q = quests.mainQuest(char);
      if (!q) return false;
      return !!(char.cleared && char.cleared[q.stage]);
    },

    bountyText(q) {
      return textOf(q);
    },

    // 战斗事件：type = kill | elite | boss | loot | clear
    progress(char, type, amount) {
      const qs = quests.ensure(char);
      const n = amount == null ? 1 : amount;
      let changed = false;
      qs.bounties.forEach(q => {
        if (q.type !== type) return;
        if (q.have >= q.need) return;
        q.have = Math.min(q.need, q.have + n);
        q.done = q.have >= q.need;
        changed = true;
      });
      return changed;
    },

    // 发放奖励，返回结算摘要
    grant(char, reward) {
      if (!char || !reward) return null;
      const out = { gold: 0, xp: 0, treePoints: 0, skillPoints: 0, levels: [], item: null };
      if (reward.gold) { char.gold += reward.gold; out.gold = reward.gold; }
      if (reward.xp) {
        out.levels = DG.character.addXp(char, reward.xp);
        out.xp = reward.xp;
      }
      if (reward.treePoints) {
        char.treePoints = (char.treePoints || 0) + reward.treePoints;
        out.treePoints = reward.treePoints;
      }
      if (reward.skillPoints) {
        char.skillPoints += reward.skillPoints;
        out.skillPoints = reward.skillPoints;
      }
      if (reward.item) {
        if (char.bag.length < DG.CONFIG.BAG_SIZE) {
          char.bag.push(reward.item);
          out.item = reward.item;
        }
      }
      return out;
    },

    claimMain(char) {
      if (!quests.mainReady(char)) return { ok: false, reason: '主线尚未达成' };
      const q = quests.mainQuest(char);
      // 章节末尾会附带稀有装备，背包没有空位时先不领取，避免奖励被静默丢弃
      if (q.index % 5 === 0 && DG.character.bagUsed(char) >= DG.CONFIG.BAG_SIZE) {
        return { ok: false, reason: '背包已满，清理后再领取章节奖励' };
      }
      const reward = Object.assign({}, q.reward);
      // 每个章节末尾的主线额外给一件稀有装备
      if (q.index % 5 === 0) {
        const def = DG.data.dungeonById[q.stage];
        reward.item = DG.items.generate(def ? def.ilvl + 1 : 1, { minRarity: 'rare', cls: char.cls });
      }
      const got = quests.grant(char, reward);
      quests.ensure(char).main += 1;
      return { ok: true, quest: q, got };
    },

    claimBounty(char, index) {
      const qs = quests.ensure(char);
      const q = qs.bounties[index];
      if (!q) return { ok: false, reason: '任务不存在' };
      if (q.have < q.need) return { ok: false, reason: '任务尚未完成' };
      const tmpl = DG.data.quests.bountyTemplates.find(t => t.key === q.key);
      const reward = DG.data.quests.bountyReward(tmpl || {}, char.level);
      const got = quests.grant(char, reward);
      // 完成即补充新悬赏，保持三格始终有内容，且尽量不与已完成的任务同类型
      qs.bounties[index] = bountyFromTemplate(char, qs.bounties);
      return { ok: true, quest: q, got };
    },

    // 可领取数量，主城入口做红点提示
    claimableCount(char) {
      const qs = quests.ensure(char);
      let n = quests.mainReady(char) ? 1 : 0;
      qs.bounties.forEach(q => { if (q.have >= q.need) n++; });
      return n;
    },

    // 关卡通关：记录进度并推进 clear 类悬赏
    onStageClear(char, stageId) {
      if (!char) return;
      char.cleared = char.cleared || {};
      char.cleared[stageId] = true;
      quests.progress(char, 'clear', 1);
    }
  };
})();
