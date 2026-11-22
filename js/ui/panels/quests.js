/* 任务面板：主线推进 + 三条悬赏（页签式纸面面板）
   外壳、页签与按钮复用公用弹框资源；奖励、状态与进度集中在卡片内。 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  // 悬赏类型徽记：单字代替图标，避免新增图片资源
  const TYPE_GLYPH = { kill: '剿', elite: '精', boss: '王', loot: '拾', clear: '旗' };

  ui.openQuests = function (char, onChange) {
    const body = U.el('div');
    const modal = ui.modal({
      title: '任务',
      subtitle: '主线推进 · 悬赏循环',
      body
    });

    let tab = 'main';

    function chips(r) {
      return [
        r.gold ? `<span class="qp-chip gold"><i>金</i>${U.fmt(r.gold)}</span>` : '',
        r.xp ? `<span class="qp-chip xp"><i>经</i>${U.fmt(r.xp)}</span>` : '',
        r.treePoints ? `<span class="qp-chip tree"><i>树</i>+${r.treePoints}</span>` : '',
        r.skillPoints ? `<span class="qp-chip skill"><i>技</i>+${r.skillPoints}</span>` : ''
      ].join('');
    }

    /* ---------- 主线：当前任务 + 后续两关预览 ---------- */
    function mainView(qs) {
      const total = DG.data.dungeons.length;
      const cleared = Object.keys(char.cleared || {}).length;
      const pct = Math.min(100, Math.round(cleared / total * 100));
      const main = DG.quests.mainQuest(char);

      if (!main) {
        return `<div class="qp-hero done">` +
            `<div class="qp-hero-head">` +
              `<div class="qp-step"><b>${total}</b><span>关</span></div>` +
              `<div class="qp-hero-id"><div class="qp-kicker">主线任务</div><h4>全部完成</h4></div>` +
              `<span class="qp-tag done">已完成</span>` +
            `</div>` +
            `<p class="qp-lore">终焉之门已经推开，腐化的源头安静下来。</p>` +
            `<p class="qp-desc">悬赏仍会继续刷新，继续打磨你的流派装备。</p>` +
            `<div class="qp-progress-row"><span>主线进度</span><em>已通关 <b>${cleared}</b> / ${total}</em></div>` +
            `<div class="qp-bar"><i style="width:${pct}%"></i></div>` +
          `</div>`;
      }

      const ready = DG.quests.mainReady(char);
      const stage = DG.data.dungeonById[main.stage];
      const next = DG.data.quests.main.slice(qs.main + 1, qs.main + 3);
      const nextHtml = next.length
        ? `<div class="qp-section"><span>后续主线</span><em>按顺序推进</em></div>` +
          `<ul class="qp-next-list">` + next.map(q => {
            const s = DG.data.dungeonById[q.stage];
            return `<li class="qp-next">` +
              `<b>${q.index}</b>` +
              `<span class="qp-next-name">${U.escapeHtml(q.name)}</span>` +
              `<span class="qp-next-stage">${U.escapeHtml(s ? s.name : q.stage)}</span>` +
              `<span class="qp-tag todo">待推进</span>` +
            `</li>`;
          }).join('') + `</ul>`
        : '';

      return `<div class="qp-hero${ready ? ' ready' : ''}">` +
          `<div class="qp-hero-head">` +
            `<div class="qp-step"><b>${main.index}</b><span>关</span></div>` +
            `<div class="qp-hero-id"><div class="qp-kicker">主线任务</div><h4>${U.escapeHtml(main.name)}</h4></div>` +
            (ready ? `<span class="qp-tag ready">可领取</span>` : `<span class="qp-tag doing">进行中</span>`) +
          `</div>` +
          `<p class="qp-lore">${U.escapeHtml(main.lore || '')}</p>` +
          `<p class="qp-desc">${U.escapeHtml(main.desc)}</p>` +
          `<div class="qp-objective">` +
            `<span>目标关卡</span><b>${U.escapeHtml(stage ? stage.name : main.stage)}</b>` +
            `<em class="${ready ? 'ok' : ''}">${ready ? '已通关' : '待通关'}</em>` +
          `</div>` +
          `<div class="qp-progress-row"><span>主线进度</span><em>已通关 <b>${cleared}</b> / ${total}</em></div>` +
          `<div class="qp-bar"><i style="width:${pct}%"></i></div>` +
          `<div class="qp-rewards">${chips(main.reward)}</div>` +
          `<div class="qp-actions">` +
            (ready
              ? `<button class="btn primary" data-claim-main>领取奖励</button>`
              : `<button class="btn primary" data-go>前往副本</button>`) +
          `</div>` +
        `</div>` + nextHtml;
    }

    /* ---------- 悬赏：三条委托 + 进度 ---------- */
    function bountyView(qs) {
      const readyN = qs.bounties.filter(q => q.have >= q.need).length;
      const cards = qs.bounties.map((q, i) => {
        const done = q.have >= q.need;
        const pct = Math.min(100, Math.round(q.have / q.need * 100));
        const tmpl = DG.data.quests.bountyTemplates.find(t => t.key === q.key) || {};
        const reward = DG.data.quests.bountyReward(tmpl, char.level);
        return `<article class="qp-bounty${done ? ' ready' : ''}">` +
          `<div class="qp-bounty-icon">${TYPE_GLYPH[q.type] || '令'}</div>` +
          `<div class="qp-bounty-main">` +
            `<div class="qp-head"><b>${U.escapeHtml(q.name)}</b><span class="qp-progress">${q.have} / ${q.need}</span></div>` +
            `<p class="qp-desc">${U.escapeHtml(DG.quests.bountyText(q))}</p>` +
            `<div class="qp-bar"><i style="width:${pct}%"></i></div>` +
            `<div class="qp-foot">` +
              `<div class="qp-rewards">${chips(reward)}</div>` +
              (done
                ? `<button class="btn primary" data-claim-bounty="${i}">领取</button>`
                : `<span class="qp-tag doing">进行中</span>`) +
            `</div>` +
          `</div>` +
        `</article>`;
      }).join('');

      return `<div class="qp-sum">` +
          `<span>可领取 <b>${readyN}</b></span>` +
          `<span>进行中 <b>${qs.bounties.length - readyN}</b></span>` +
        `</div>` +
        `<div class="qp-hint">击杀、精英、首领、拾取与通关会在副本中自动累计；领取后立即刷新新的委托。</div>` +
        `<div class="qp-bounty-list">${cards}</div>` +
        `<button class="btn ghost qp-go" data-go>前往副本推进委托</button>`;
    }

    function bind(view) {
      const claimMain = view.querySelector('[data-claim-main]');
      if (claimMain) {
        claimMain.addEventListener('click', () => {
          const res = DG.quests.claimMain(char);
          if (!res.ok) { DG.ui.toast(res.reason || '无法领取', 'danger'); return; }
          DG.game.save();
          DG.audio.play('stageEquip', { vol: 0.6 });
          DG.ui.toast(`主线完成：${res.quest.name}`, 'gold');
          if (res.got && res.got.item) DG.ui.toast(`获得装备：${res.got.item.name}`, 'blue');
          render();
          if (onChange) onChange();
        });
      }

      view.querySelectorAll('[data-claim-bounty]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-claim-bounty'), 10);
          const res = DG.quests.claimBounty(char, idx);
          if (!res.ok) { DG.ui.toast(res.reason || '无法领取', 'danger'); return; }
          DG.game.save();
          DG.audio.play('stageCoin', { vol: 0.5 });
          DG.ui.toast('悬赏完成，已刷新新委托', 'gold');
          render();
          if (onChange) onChange();
        });
      });

      // 前往副本：关闭面板后打开选关，进度类任务都能在副本中推进
      view.querySelectorAll('[data-go]').forEach(btn => {
        btn.addEventListener('click', () => {
          modal.close();
          DG.ui.openDungeonSelect(char, (def) => DG.game.startDungeon(def));
        });
      });
    }

    function render() {
      const qs = DG.quests.ensure(char);
      const total = DG.data.dungeons.length;
      const cleared = Object.keys(char.cleared || {}).length;
      const readyN = qs.bounties.filter(q => q.have >= q.need).length;
      const mainReady = DG.quests.mainReady(char);

      body.innerHTML =
        `<div class="quest-panel">` +
          `<div class="tab-bar">` +
            `<button class="tab-btn${tab === 'main' ? ' sel' : ''}" data-tab="main">` +
              `<span>主线</span>` +
              `<em class="qp-tab-num">${cleared} / ${total}</em>` +
              (mainReady ? `<i class="qp-tab-dot"></i>` : '') +
            `</button>` +
            `<button class="tab-btn${tab === 'bounty' ? ' sel' : ''}" data-tab="bounty">` +
              `<span>悬赏</span>` +
              `<em class="qp-tab-num">${readyN ? '待领 ' + readyN : qs.bounties.length + ' 项'}</em>` +
              (readyN ? `<i class="qp-tab-dot"></i>` : '') +
            `</button>` +
          `</div>` +
          `<div class="qp-view"></div>` +
        `</div>`;

      body.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
          const next = btn.getAttribute('data-tab');
          if (next === tab) return;
          tab = next;
          render();
        });
      });

      const view = body.querySelector('.qp-view');
      view.innerHTML = tab === 'main' ? mainView(qs) : bountyView(qs);
      body.scrollTop = 0;
      bind(view);
    }

    render();
    return modal;
  };
})();
