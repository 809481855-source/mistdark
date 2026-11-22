/* UI 基座：提示、通用弹窗、确认框与物品展示 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  ui.toast = function (msg, type) {
    const wrap = document.getElementById('toast-wrap');
    if (!wrap) return;
    // 同文案只保留一条，并限制同屏数量，避免提示堆叠遮挡界面
    Array.from(wrap.children).forEach(t => {
      if (t.textContent === msg) t.remove();
    });
    // 弹窗内一次只显示一条，保证不叠压弹窗内容
    const overModal = wrap.classList.contains('over-modal');
    if (overModal) wrap.replaceChildren();
    while (wrap.children.length >= (overModal ? 1 : 3)) wrap.removeChild(wrap.firstChild);
    const t = U.el('div', 'toast' + (type ? ' ' + type : ''));
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('fade'), 2100);
    setTimeout(() => t.remove(), 2550);
  };

  ui.modal = function (opts) {
    const root = DG.game.ui;
    const mask = U.el('div', 'modal-mask');
    const modal = U.el('div', 'modal');
    // 统一使用公用二级弹框宽度（636），各面板不再各自指定宽度，避免九宫缎带被横向压缩

    const head = U.el('div', 'modal-head');
    const titleWrap = U.el('div', '',
      `<h3>${U.escapeHtml(opts.title || '')}</h3>` +
      (opts.subtitle ? `<div class="sub">${U.escapeHtml(opts.subtitle)}</div>` : '')
    );
    const closeBtn = U.el('button', 'modal-close', '');
    head.appendChild(titleWrap);

    const body = U.el('div', 'modal-body');
    if (opts.body) body.appendChild(opts.body);

    modal.appendChild(head);
    modal.appendChild(body);
    // 关闭按钮固定挂在弹框本体上，不随标题/内容布局变化，保证所有二级弹框位置一致
    if (opts.dismissible !== false) modal.appendChild(closeBtn);

    let footEl = null;
    const ensureFoot = () => {
      if (!footEl) {
        footEl = U.el('div', 'modal-foot');
        if (typeof opts.footer === 'string') footEl.innerHTML = opts.footer;
        else if (opts.footer && opts.footer.nodeType) footEl.appendChild(opts.footer);
        modal.appendChild(footEl);
      }
      return footEl;
    };
    if (opts.footer !== undefined && opts.footer !== null) ensureFoot();

    mask.appendChild(modal);
    root.appendChild(mask);
    if (DG.audio) DG.audio.play('uiOpen', { vol: 0.5, gap: 0.12 });
    const toastWrap = document.getElementById('toast-wrap');
    if (toastWrap) {
      // 弹窗出现时清空旧提示并切换到顶部位置，避免提示压在弹窗标题上
      toastWrap.replaceChildren();
      toastWrap.classList.add('over-modal');
    }

    const api = {
      mask, modal, body,
      get foot() { return ensureFoot(); },
      close() {
        if (mask.parentNode) mask.remove();
        if (DG.audio) DG.audio.play('uiClose', { vol: 0.45, gap: 0.12 });
        if (toastWrap && !document.querySelector('.modal-mask')) {
          toastWrap.classList.remove('over-modal');
        }
        if (opts.onClose) opts.onClose();
      },
      setTitle(t) {
        titleWrap.querySelector('h3').textContent = t;
      }
    };

    closeBtn.addEventListener('click', api.close);
    if (opts.dismissible !== false) {
      mask.addEventListener('mousedown', (e) => {
        if (e.target === mask) api.close();
      });
    }
    return api;
  };

  ui.confirm = function (msg, onYes, opts) {
    opts = opts || {};
    const body = U.el('div', '', `<div class="confirm-text">${U.escapeHtml(msg)}</div>`);
    const modal = ui.modal({
      title: opts.title || '确认',
      body,
      width: 380,
      footer: '',
      dismissible: true
    });
    const btnRow = U.el('div', 'confirm-actions');
    const no = U.el('button', 'btn', '取消');
    const yes = U.el('button', 'btn ' + (opts.danger ? 'danger' : 'primary'), opts.okText || '确定');
    btnRow.appendChild(no);
    btnRow.appendChild(yes);
    modal.foot.appendChild(btnRow);

    no.addEventListener('click', modal.close);
    yes.addEventListener('click', () => {
      modal.close();
      if (onYes) onYes();
    });
    return modal;
  };

  // 底部战斗条：主城与副本共用同一套结构、图标与等级牌，
  // 只通过属性名与技能槽内容区分场景，避免两边各写一份逐渐跑偏。
  ui.combatBarHtml = function (o) {
    // 装备 / 技能图标统一带火星升腾特效（纯 CSS transform / opacity，无滤镜开销）
    const embers = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
    const medal = (src, glyph, attrs, label) =>
      `<button class="combat-medal" ${attrs} aria-label="${label}系统">` +
      (src ? `<img src="${src}" alt="">` : `<span class="medal-glyph">${glyph}</span>`) +
      `<span class="medal-fire" aria-hidden="true">${embers}</span>` +
      `<span class="medal-label" data-label="${label}">${label}</span>` +
      `</button>`;
    return `<div class="${o.barClass || 'combat-bar'}">` +
      medal(o.equipIcon, '装', o.equipAttrs, '装备') +
      `<button class="lvl-badge" ${o.badgeAttrs} aria-label="角色信息">${o.level}</button>` +
      `<div class="combat-strip"><div class="strip-slots">${o.slotsHtml}</div></div>` +
      medal(o.skillIcon, '技', o.skillAttrs, '技能') +
      `<div class="combat-exp exp-bar">${o.expFill}` +
      `<span class="exp-text" data-xp-num>${o.expText}</span></div>` +
      `</div>`;
  };

  // 公用道具框：白 / 蓝 / 紫 / 套装 / 暗金，套装与暗金另有远古框
  const FRAME_DIR = 'assets/ui/items/frames/';
  const FRAMES = {
    normal: 'frame-normal.png',
    magic: 'frame-magic.png',
    rare: 'frame-rare.png',
    set: 'frame-set.png',
    legend: 'frame-legend.png'
  };
  const FRAMES_ANCIENT = {
    set: 'frame-set-ancient.png',
    legend: 'frame-legend-ancient.png'
  };
  ui.itemFrameSrc = function (item) {
    const rarity = item && item.rarity;
    const ancient = item && item.ancient && FRAMES_ANCIENT[rarity];
    return FRAME_DIR + (ancient || FRAMES[rarity] || FRAMES.normal);
  };

  ui.itemCell = function (item, opts) {
    opts = opts || {};
    const cell = U.el('div', 'item-cell');
    if (!item) {
      cell.classList.add('empty');
      if (opts.emptyGlyph) cell.innerHTML = `<span class="glyph">${U.escapeHtml(opts.emptyGlyph)}</span>`;
      return cell;
    }
    cell.classList.add('r-' + item.rarity);
    if (opts.selected) cell.classList.add('selected');
    const slot = DG.items.slotInfo(item.slot);
    cell.innerHTML =
      `<span class="glyph">${U.escapeHtml(slot.glyph)}</span>` +
      (opts.showLevel !== false ? `<span class="lvl">${item.ilvl}</span>` : '') +
      (opts.equipped ? `<span class="equipped-mark">E</span>` : '');
    cell.title = item.name;
    if (opts.onClick) cell.addEventListener('click', opts.onClick);
    return cell;
  };

  ui.itemDetailHtml = function (item, compareItem) {
    if (!item) {
      return `<div class="detail-empty"><div class="detail-empty-glyph">?</div>` +
        `从装备栏或背包中选择一件物品<br>查看属性与战力对比。</div>`;
    }
    const rar = DG.items.rarityInfo(item);
    const quality = DG.items.qualityLabel(item);
    const slot = DG.items.slotInfo(item.slot);
    const lines = DG.items.describe(item)
      .map(l => `<div class="item-stat"><span>${U.escapeHtml(l.label)}</span><span>${U.escapeHtml(l.text)}</span></div>`)
      .join('');

    let compareHtml = '';
    if (compareItem !== undefined) {
      const mine = DG.items.score(item);
      if (!compareItem) {
        compareHtml = `<div class="compare"><span class="up">装备后评分 +${mine}</span></div>`;
      } else if (compareItem.id === item.id) {
        compareHtml = `<div class="compare"><span class="same">当前已装备 · 评分 ${mine}</span></div>`;
      } else {
        const diff = mine - DG.items.score(compareItem);
        const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
        const txt = diff === 0 ? '评分持平' : `评分 ${diff > 0 ? '+' : ''}${diff}`;
        compareHtml = `<div class="compare"><span class="${cls}">${txt}（当前 ${mine}）</span>` +
          `<div class="compare-note">对比已装备：${U.escapeHtml(compareItem.name)}</div></div>`;
      }
    }

    return `<div class="item-name r-${item.rarity}">${U.escapeHtml(item.name)}` +
      `<span class="rarity-tag" style="color:${rar.color}">${U.escapeHtml(quality)}</span></div>` +
      `<div class="item-type">${U.escapeHtml(quality)} ${U.escapeHtml(slot.name)} · 物品等级 ${item.ilvl}</div>` +
      (lines || '<div class="item-stat"><span>附加属性</span><span>无</span></div>') +
      compareHtml;
  };

  // ---------- 功能图标点击反馈 ----------
  // 技能/装备/副本/任务/设置等图标按下时统一缩放 + 金光，触屏与鼠标一致
  const TAP_SELECTOR = '.combat-medal,.lvl-badge,.town-portal,.town-corner-btn,.strip-slot';
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest(TAP_SELECTOR);
    if (!el) return;
    // 重新触发动画：先移除再加回
    el.classList.remove('tap-on');
    void el.offsetWidth;
    el.classList.add('tap-on');
    clearTimeout(el._tapTimer);
    el._tapTimer = setTimeout(() => el.classList.remove('tap-on'), 360);
  }, true);
})();
