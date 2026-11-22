/* 任务面板：主线推进 + 三条悬赏 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  ui.openQuests = function (char, onChange) {
    const body = U.el('div');
    const modal = ui.modal({
      title: '任务',
      subtitle: '主线推进关卡 · 悬赏提供长线资源',
      body,
      width: 640
    });

    function rewardText(r) {
      const parts = [];
      if (r.gold) parts.push(`<span class="qg-gold">${U.fmt(r.gold)} 金币</span>`);
      if (r.xp) parts.push(`<span class="qg-xp">${U.fmt(r.xp)} 经验</span>`);
      if (r.treePoints) parts.push(`<span class="qg-tree">技能树点 +${r.treePoints}</span>`);
      if (r.skillPoints) parts.push(`<span class="qg-skill">技能点 +${r.skillPoints}</span>`);
      return parts.join('');
    }

    function rerender() {
      const qs = DG.quests.ensure(char);
      const main = DG.quests.mainQuest(char);
      const mainReady = DG.quests.mainReady(char);
      const stage = main ? DG.data.dungeonById[main.stage] : null;
      const clearedCount = Object.keys(char.cleared || {}).length;

      let mainHtml = '';
      if (main) {
        mainHtml =
          `<div class="quest-card main ${mainReady ? 'ready' : ''}">` +
            `<div class="q-head"><b>主线 · ${U.escapeHtml(main.name)}</b>` +
              `<span class="q-progress">${clearedCount} / ${DG.data.dungeons.length} 关</span></div>` +
            `<div class="q-desc">${U.escapeHtml(main.desc)}</div>` +
            `<div class="q-lore">${U.escapeHtml(main.lore || '')}</div>` +
            `<div class="q-target">目标：通关「${U.escapeHtml(stage ? stage.name : main.stage)}」` +
              (mainReady ? ' · <b class="ok">已达成</b>' : '') + `</div>` +
            `<div class="q-foot"><div class="q-rewards">${rewardText(main.reward)}</div>` +
              (mainReady
                ? `<button class="btn primary btn-sm" data-claim-main>领取奖励</button>`
                : `<span class="q-state">进行中</span>`) + `</div>` +
          `</div>`;
      } else {
        mainHtml =
          `<div class="quest-card main done">` +
            `<div class="q-head"><b>主线 · 全部完成</b><span class="q-progress">${DG.data.dungeons.length} / ${DG.data.dungeons.length} 关</span></div>` +
            `<div class="q-desc">终焉之门已经推开，腐化的源头安静下来。</div>` +
            `<div class="q-lore">悬赏仍会继续刷新，继续打磨你的流派装备。</div>` +
          `</div>`;
      }

      const bounties = qs.bounties.map((q, i) => {
        const done = q.have >= q.need;
        const pct = Math.min(100, Math.round(q.have / q.need * 100));
        const tmpl = DG.data.quests.bountyTemplates.find(t => t.key === q.key) || {};
        const reward = DG.data.quests.bountyReward(tmpl, char.level);
        return `<div class="quest-card bounty ${done ? 'ready' : ''}">` +
          `<div class="q-head"><b>${U.escapeHtml(q.name)}</b><span class="q-progress">${q.have} / ${q.need}</span></div>` +
          `<div class="q-desc">${U.escapeHtml(DG.quests.bountyText(q))}</div>` +
          `<div class="q-bar"><i style="width:${pct}%"></i></div>` +
          `<div class="q-foot"><div class="q-rewards">${rewardText(reward)}</div>` +
            (done
              ? `<button class="btn primary btn-sm" data-claim-bounty="${i}">领取</button>`
              : `<span class="q-state">进行中</span>`) + `</div>` +
        `</div>`;
      }).join('');

      body.innerHTML =
        mainHtml +
        `<div class="quest-sub">悬赏 · 完成即刷新</div>` +
        `<div class="quest-grid">${bounties}</div>`;

      const claimMain = body.querySelector('[data-claim-main]');
      if (claimMain) {
        claimMain.addEventListener('click', () => {
          const res = DG.quests.claimMain(char);
          if (!res.ok) { DG.ui.toast(res.reason || '无法领取', 'danger'); return; }
          DG.game.save();
          DG.audio.play('stageEquip', { vol: 0.6 });
          DG.ui.toast(`主线完成：${res.quest.name}`, 'gold');
          if (res.got && res.got.item) DG.ui.toast(`获得装备：${res.got.item.name}`, 'blue');
          rerender();
          if (onChange) onChange();
        });
      }
      body.querySelectorAll('[data-claim-bounty]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-claim-bounty'), 10);
          const res = DG.quests.claimBounty(char, idx);
          if (!res.ok) { DG.ui.toast(res.reason || '无法领取', 'danger'); return; }
          DG.game.save();
          DG.audio.play('stageCoin', { vol: 0.5 });
          DG.ui.toast('悬赏完成，已刷新新委托', 'gold');
          rerender();
          if (onChange) onChange();
        });
      });
    }

    rerender();
    return modal;
  };
})();
