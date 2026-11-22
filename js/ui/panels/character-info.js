/* 角色信息面板 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  ui.openCharacterInfo = function (char, opts) {
    opts = opts || {};
    const cls = DG.data.classes[char.cls];
    const stats = DG.stats.compute(char);
    const body = U.el('div');

    ui.modal({
      title: '角色信息',
      subtitle: '当前角色的职业、成长与属性',
      body,
      width: 640,
      onClose: opts.onClose
    });

    const need = DG.character.xpNeed(char.level);
    const pct = Math.round(DG.character.levelProgress(char) * 100);
    const equipped = DG.CONFIG.SLOTS.filter(s => char.equipment[s.id]).length;
    const used = DG.character.bagUsed(char);

    const rows = [
      ['最大生命', U.fmt(stats.maxHp)],
      ['攻击力', stats.atk],
      ['护甲', `${stats.armor} <em>减伤 ${DG.stats.mitigation(stats.armor)}%</em>`],
      ['暴击率', `${stats.crit}%`],
      ['暴击伤害', `${stats.critDmg}%`],
      ['移动速度', stats.moveSpeed],
      ['攻击速度', `${stats.attackSpeed}/秒`],
      ['生命回复', `${stats.hpRegen}/秒`]
    ].map(r => `<li><span>${r[0]}</span><b>${r[1]}</b></li>`).join('');

    body.innerHTML =
      `<div class="ci-head">` +
        `<div class="char-emblem ci-emblem" style="color:${cls.color};border-color:${cls.color}66;">${cls.glyph}</div>` +
        `<div class="ci-id">` +
          `<div class="ci-name">${U.escapeHtml(char.name)}<span class="hero-lv">Lv.${char.level}</span></div>` +
          `<div class="ci-sub">${U.escapeHtml(cls.name)} · ${U.escapeHtml(cls.title)} · 账号 ${U.escapeHtml(DG.game.accountName)}</div>` +
          `<div class="ci-desc">${U.escapeHtml(cls.desc)}</div>` +
        `</div>` +
        `<div class="ci-power"><span>战 力</span><b>${U.fmt(stats.power)}</b></div>` +
      `</div>` +
      `<div class="hero-xp" style="margin-top:14px;">` +
        `<div class="hero-xp-meta"><span>经验 <em>${U.fmt(char.xp)} / ${U.fmt(need)}</em></span><span>${pct}%</span></div>` +
        `<div class="hero-xp-bar"><i style="width:${pct}%"></i></div>` +
      `</div>` +
      `<div class="sheet">` +
        `<div class="section-label"><span>属性</span><span class="meta">装备 ${equipped} / 4 · 背包 ${used} / ${DG.CONFIG.BAG_SIZE} · 技能点 ${char.skillPoints}</span></div>` +
        `<ul class="stat-list">${rows}</ul>` +
      `</div>`;
  };
})();
