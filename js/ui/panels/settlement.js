/* 副本结算面板 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  ui.showSettlement = function (result, onReturn) {
    const body = U.el('div');
    const victory = result.victory;

    const items = result.items || [];
    const lootHtml = items.length
      ? items.map(it => {
          const slot = DG.items.slotInfo(it.slot);
          return `<div class="loot-cell r-${it.rarity}" title="${U.escapeHtml(it.name)}">` +
            `<img class="loot-frame" src="${DG.ui.itemFrameSrc(it)}" alt="">` +
            `<span class="qty">${DG.data.rarityById[it.rarity].name}</span>` +
            `<span class="loot-glyph">${U.escapeHtml(slot.glyph)}</span>` +
            `<span class="loot-name">${U.escapeHtml(it.name)}</span></div>`;
        }).join('')
      : `<div class="loot-empty">本次没有获得装备。</div>`;

    const levelNote = (result.levels && result.levels.length)
      ? `<div class="levelup-note">等级提升！当前等级 Lv.${result.levels[result.levels.length - 1]}` +
        `${result.skillPoints ? `（获得 ${result.skillPoints} 个技能点）` : ''}</div>`
      : '';
    const penaltyNote = (result.keepRate != null && result.keepRate < 1)
      ? `<div class="levelup-note">${result.retreat ? '主动撤退' : '重伤归来'}：本局金币与经验按 ${Math.round(result.keepRate * 100)}% 结算，装备保留</div>`
      : '';
    const skillNote = (result.skillUps && result.skillUps.length)
      ? `<div class="skillup-note">技能成长：${result.skillUps.map(s => `${U.escapeHtml(s)}`).join('、')}</div>`
      : '';

    body.innerHTML = `
      <div class="result-banner ${victory ? '' : 'fail'}">
        <h2>${victory ? '讨 伐 成 功' : (result.retreat ? '撤 退' : '重 伤 归 来')}</h2>
        <p>${victory ? '首领已被击败，迷雾暂时退散' : '整理行装，再次出发'}</p>
      </div>
      <div class="result-grid">
        <div class="result-cell"><div class="k">击杀数量</div><div class="v">${result.kills}</div></div>
        <div class="result-cell"><div class="k">用时</div><div class="v">${U.timeText(result.time)}</div></div>
        <div class="result-cell"><div class="k">获得经验</div><div class="v ok">${U.fmt(result.xp)}</div></div>
        <div class="result-cell"><div class="k">获得金币</div><div class="v gold">${U.fmt(result.gold)}</div></div>
        <div class="result-cell"><div class="k">拾取装备</div><div class="v">${items.length}</div></div>
        <div class="result-cell"><div class="k">当前等级</div><div class="v">Lv.${result.level || 1}</div></div>
      </div>
      ${levelNote}${penaltyNote}${skillNote}
      <div class="loot-area" style="margin-top:16px;">
        <div class="loot-title"><span>战利品</span><span>已放入背包</span></div>
        <div class="loot-grid">${lootHtml}</div>
      </div>`;

    const modal = ui.modal({
      title: '副本结算',
      subtitle: '战利品与成长已记录',
      body,
      width: 640,
      dismissible: false,
      footer: ''
    });

    const btn = U.el('button', 'btn primary settle-btn', '返回主城');
    btn.addEventListener('click', () => {
      modal.close();
      onReturn();
    });
    modal.foot.appendChild(btn);
    return modal;
  };
})();
