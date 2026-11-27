/* 角色 · 装备界面：PSD 810×1680 原生坐标，按屏幕铺满显示（不再先缩到 720×1440） */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const C = DG.CONFIG;
  const ui = DG.ui = DG.ui || {};

  // 画布严格使用 PSD 的 720×1440 坐标居中显示；背景 810×1680 由 -45/-120 向外补边
  const ASSET = 'assets/ui/equip/';

  // 装备页（PSD 65,400 438×601）内的格子坐标，已减去页面左上角
  const SLOT_POS = {
    helm: [173, 97],
    shoulder: [43, 152],
    amulet: [303, 153],
    armor: [173, 214],
    gloves: [43, 271],
    ring: [303, 271],
    pants: [173, 332],
    weapon: [43, 389],
    offhand: [303, 389],
    boots: [173, 449]
  };

  // 品质框统一走公用道具框（assets/ui/items/frames），含远古套装 / 远古暗金
  const TABS = [
    { id: 'equip', name: '装备' },
    { id: 'item', name: '道具' },
    { id: 'other', name: '其他' }
  ];

  // 分解品质勾选：面板关闭后仍保留本次选择，默认普通 + 魔法（与旧版一键分解范围一致）
  let salvagePick = ['normal', 'magic'];

  function slotOf(item) {
    return DG.items.slotInfo(item.slot) || { name: '装备', glyph: '?' };
  }

  // 单个道具格：空格显示部位名，有装备时叠品质框 + 部位图标 + 等级
  // equipped=true 时使用“已装备”状态框（套装成套 / 远古套装 / 远古暗金）
  function fillCell(cell, item, slot, equipped, setState) {
    cell.innerHTML = '';
    if (!item) {
      cell.classList.remove('has');
      cell.appendChild(U.el('span', 'eq-cell-label', slot.name));
      return;
    }
    cell.classList.add('has');
    const img = U.el('img', 'eq-frame');
    img.src = DG.ui.itemFrameSrc(item, equipped, setState);
    img.alt = '';
    cell.appendChild(img);
    cell.appendChild(U.el('span', 'eq-glyph', slot.glyph));
    cell.appendChild(U.el('span', 'eq-ilvl', String(item.ilvl)));
    if (item.ancient) cell.appendChild(U.el('span', 'eq-ancient', '远'));
    cell.title = item.name;
  }

  ui.openEquipment = function (char, onChange, opts) {
    opts = opts || {};
    // 连点装备入口时不叠出第二层面板，直接把已有实例返回
    if (ui._equipPanel && ui._equipPanel.isOpen()) return ui._equipPanel;
    const screen = U.el('div', 'eq-screen');
    const canvas = U.el('div', 'eq-canvas');
    screen.appendChild(canvas);
    DG.game.ui.appendChild(screen);
    if (DG.audio) DG.audio.play('uiOpen', { vol: 0.5, gap: 0.12 });
    // #ui 固定 720×1440 居中，装备页需要覆盖整个舞台（可能是 810×1680）
    const layout = () => {
      const stage = document.getElementById('stage');
      const dw = (stage && stage.offsetWidth) || 720;
      const dh = (stage && stage.offsetHeight) || 1440;
      screen.style.left = ((720 - dw) / 2) + 'px';
      screen.style.top = ((1440 - dh) / 2) + 'px';
      screen.style.width = dw + 'px';
      screen.style.height = dh + 'px';
      // PSD 画布 720×1440 居中，超出部分由 810×1680 背景补边
      canvas.style.left = ((dw - 720) / 2) + 'px';
      canvas.style.top = ((dh - 1440) / 2) + 'px';
      canvas.style.transform = 'none';
    };
    layout();
    const onResize = () => layout();
    window.addEventListener('resize', onResize);

    let tab = 'equip';
    let page = 'bag';               // bag：临时装备库 / stash：大装备仓库
    let bagScroll = 0;
    let stashScroll = 0;

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (DG.audio) DG.audio.play('uiClose', { vol: 0.45, gap: 0.12 });
      ui._equipPanel = null;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (screen.parentNode) screen.remove();
      if (opts.onClose) opts.onClose();
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);

    function persist() {
      DG.game.save();
      if (onChange) onChange();
      render();
    }

    function removeItem(list, item) {
      const i = list.indexOf(item);
      if (i >= 0) list.splice(i, 1);
    }

    function equipItem(item) {
      const old = char.equipment[item.slot];
      removeItem(char.bag, item);
      char.equipment[item.slot] = item;
      if (old) char.bag.push(old);
      if (DG.audio) DG.audio.play('stageEquip', { vol: 0.5 });
      ui.toast(`已装备「${item.name}」`, 'gold');
      persist();
    }

    function unequip(slot) {
      const item = char.equipment[slot];
      if (!item) return;
      if (DG.character.bagUsed(char) >= C.BAG_SIZE) {
        ui.toast('临时装备库已满，无法卸下', 'danger');
        return;
      }
      char.equipment[slot] = null;
      char.bag.push(item);
      ui.toast(`已卸下「${item.name}」`);
      persist();
    }

    function toStash(item) {
      removeItem(char.bag, item);
      char.stash.push(item);
      ui.toast(`「${item.name}」已存入装备库`, 'gold');
      persist();
    }

    function fromStash(item) {
      if (DG.character.bagUsed(char) >= C.BAG_SIZE) {
        ui.toast('临时装备库已满，无法取出', 'danger');
        return;
      }
      removeItem(char.stash, item);
      char.bag.push(item);
      ui.toast(`「${item.name}」已取出`, 'gold');
      persist();
    }

    function discard(item, source) {
      ui.confirm(`丢弃「${item.name}」？丢弃后无法找回。`, () => {
        removeItem(source === 'stash' ? char.stash : char.bag, item);
        ui.toast(`已丢弃「${item.name}」`);
        persist();
      }, { danger: true, okText: '丢弃' });
    }

    // 分解装备：按品质勾选，一键分解所选品质的全部装备
    function dismantle() {
      // 统计「装备」页各品质数量，没有物品的品质不可勾选
      const counts = {};
      (char.bag || []).forEach(it => {
        if (it && it.rarity) counts[it.rarity] = (counts[it.rarity] || 0) + 1;
      });
      if (!DG.data.rarity.some(r => counts[r.id])) {
        ui.toast('临时装备库没有可分解的装备', 'danger');
        return;
      }

      const body = U.el('div', 'salvage');
      body.innerHTML =
        '<div class="salvage-list">' +
          DG.data.rarity.map(r => {
            const n = counts[r.id] || 0;
            const on = n > 0 && salvagePick.indexOf(r.id) >= 0;
            return `<label class="ui-check salvage-row${n ? '' : ' empty'}" data-rarity="${r.id}">` +
              `<input type="checkbox"${on ? ' checked' : ''}${n ? '' : ' disabled'}>` +
              '<span class="ui-check-box"></span>' +
              '<span class="ui-check-tick"></span>' +
              `<span class="salvage-name"><i class="salvage-dot" style="background:${r.color}"></i>${r.name}</span>` +
              `<span class="salvage-count">${n} 件</span>` +
            '</label>';
          }).join('') +
        '</div>' +
        '<div class="salvage-note">只分解「装备」页的物品，勾选后一键清理，分解后无法找回。</div>';

      const modal = ui.modal({ title: '分解装备', subtitle: '勾选品质后一键分解', body });
      modal.foot.classList.add('center');
      const btn = U.el('button', 'btn primary');
      modal.foot.appendChild(btn);

      // 已勾选且确实有库存的品质
      const picked = () => salvagePick.filter(id => (counts[id] || 0) > 0);
      const pickedCount = () => picked().reduce((n, id) => n + counts[id], 0);

      function refresh() {
        const n = pickedCount();
        btn.textContent = n ? `分 解 ${n} 件` : '请勾选品质';
        btn.disabled = !n;
      }

      body.querySelectorAll('.salvage-row input').forEach(cb => {
        cb.addEventListener('change', () => {
          const id = cb.closest('.salvage-row').getAttribute('data-rarity');
          if (cb.checked) {
            if (salvagePick.indexOf(id) < 0) salvagePick.push(id);
          } else {
            salvagePick = salvagePick.filter(x => x !== id);
          }
          refresh();
        });
      });

      btn.addEventListener('click', () => {
        const ids = picked();
        const junk = (char.bag || []).filter(it => it && ids.indexOf(it.rarity) >= 0);
        if (!junk.length) return;
        char.bag = char.bag.filter(it => !(it && ids.indexOf(it.rarity) >= 0));
        ui.toast(`已分解 ${junk.length} 件装备`, 'gold');
        modal.close();
        persist();
      });

      refresh();
    }

    function openDetail(item, source) {
      const compare = source === 'bag' ? (char.equipment[item.slot] || null) : undefined;
      const body = U.el('div', 'eq-detail');
      body.innerHTML = ui.itemDetailHtml(item, compare);
      const foot = U.el('div', 'eq-detail-actions');
      const modal = ui.modal({ title: '装备详情', body, footer: foot });

      const add = (text, kind, fn) => {
        const btn = U.el('button', 'eq-dbtn' + (kind ? ' ' + kind : ''), text);
        btn.addEventListener('click', () => { modal.close(); fn(); });
        foot.appendChild(btn);
      };

      if (source === 'bag') {
        add(char.equipment[item.slot] ? '替换装备' : '装 备', 'red', () => equipItem(item));
        add('存入仓库', '', () => toStash(item));
        add('丢 弃', '', () => discard(item, 'bag'));
      } else if (source === 'equip') {
        add('卸 下', '', () => unequip(item.slot));
      } else {
        add('取 出', 'red', () => fromStash(item));
        add('丢 弃', '', () => discard(item, 'stash'));
      }
    }

    function render() {
      const stats = DG.stats.compute(char);
      const cls = DG.data.classes[char.cls];
      // 三个分页各自独立：装备 / 道具 / 其他，各 32 格
      const bagList = tab === 'item' ? (char.bagItems || [])
        : tab === 'other' ? (char.bagOther || [])
        : (char.bag || []);
      const used = bagList.filter(Boolean).length;
      const cap = C.BAG_SIZE;
      const tabIndex = Math.max(0, TABS.findIndex(t => t.id === tab));

      const statRows = [
        ['最大生命', U.fmt(stats.maxHp)],
        ['攻击力', stats.atk],
        ['护甲', { v: stats.armor, n: '减伤 ' + DG.stats.mitigation(stats.armor) + '%' }],
        ['暴击率', stats.crit + '%'],
        ['暴击伤害', stats.critDmg + '%'],
        ['移动速度', stats.moveSpeed],
        ['攻击速度', stats.attackSpeed + '/秒'],
        ['生命回复', stats.hpRegen + '/秒']
      ].map(r => {
        const v = r[1];
        if (v && typeof v === 'object') {
          return `<li><span class="k">${r[0]}</span><span class="v">${v.v}<em>${v.n}</em></span></li>`;
        }
        return `<li><span class="k">${r[0]}</span><span class="v">${v}</span></li>`;
      }).join('');

      canvas.innerHTML = `
        <div class="eq-bg"></div>
        <div class="eq-title">背包</div>
        <button class="eq-close" aria-label="关闭"></button>

        <div class="eq-hero">
          <div class="eq-hero-frame"></div>
          <div class="eq-portrait"><img src="${ASSET}avatar.png?v=20261127" alt=""></div>
          <div class="eq-hero-name">${U.escapeHtml(char.name)}<span class="lv">${char.level}级</span></div>
          <div class="eq-hero-sub">${U.escapeHtml(cls.name)} · ${U.escapeHtml(cls.title)}</div>
          <div class="eq-power"><span>战力</span><b>${U.fmt(stats.power)}</b></div>
        </div>

        <div class="eq-page eq-equip-page"><div class="eq-page-title">装备栏</div></div>

        <div class="eq-stats">
          <div class="eq-stats-title">角色属性</div>
          <ul class="eq-stat-list">${statRows}</ul>
        </div>

        ${page === 'bag' ? `
        <div class="eq-bag-page">
          <div class="eq-tabs">
            <div class="eq-tab-pill" style="left:${tabIndex * 124}px"></div>
            ${TABS.map((t, i) =>
              `<button class="eq-tab${t.id === tab ? ' on' : ''}" data-tab="${t.id}" style="left:${i * 124}px">${t.name}</button>`
            ).join('')}
          </div>
          <button class="eq-btn stash">装备库</button>
          <button class="eq-btn dismantle">分解</button>
          <div class="eq-cap">容量：<b>${used}</b>/${cap}</div>
          <div class="eq-grid-wrap"><div class="eq-grid"></div></div>
          <div class="eq-bag-hint">及时清理背包哦！容量有限！</div>
          <div class="eq-empty hidden"></div>
        </div>` : ''}
      `;

      // ---------- 头部 ----------
      const closeBtn = canvas.querySelector('.eq-close');
      let closeTimer = 0;
      closeBtn.addEventListener('click', () => {
        clearTimeout(closeTimer);
        close();
      });
      // 兜底：按下关闭按钮 350ms 内没有等来 click（部分 WebView 会吞掉）就直接关闭
      closeBtn.addEventListener('pointerdown', () => {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(close, 350);
      });
      closeBtn.addEventListener('pointercancel', () => clearTimeout(closeTimer));
      canvas.querySelectorAll('.eq-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          if (tab === btn.dataset.tab) return;
          tab = btn.dataset.tab;
          bagScroll = 0;
          render();
        });
      });

      // ---------- 装备栏 10 个格子 ----------
      const equipPage = canvas.querySelector('.eq-equip-page');
      C.SLOTS.forEach(slot => {
        const pos = SLOT_POS[slot.id];
        if (!pos) return;
        const item = char.equipment[slot.id];
        const cell = U.el('button', 'eq-cell eq-slot');
        cell.style.left = pos[0] + 'px';
        cell.style.top = pos[1] + 'px';
        fillCell(cell, item, slot, true, DG.items.setState(char, item));
        if (item) cell.addEventListener('click', () => openDetail(item, 'equip'));
        equipPage.appendChild(cell);
      });

      // ---------- 临时装备库 ----------
      const bagPage = canvas.querySelector('.eq-bag-page');
      if (bagPage) {
        bagPage.querySelector('.eq-btn.stash').addEventListener('click', () => {
          page = 'stash';
          render();
        });
        bagPage.querySelector('.eq-btn.dismantle').addEventListener('click', dismantle);

        const grid = bagPage.querySelector('.eq-grid');
        // 当前分页自己的物品列表，各自补满 32 格
        const list = (tab === 'item' ? char.bagItems : tab === 'other' ? char.bagOther : char.bag).filter(Boolean);
        list.forEach(item => {
          const cell = U.el('button', 'eq-cell');
          fillCell(cell, item, slotOf(item));
          if (tab === 'equip') cell.addEventListener('click', () => openDetail(item, 'bag'));
          grid.appendChild(cell);
        });
        // 按容量补齐空格，直观看出还剩多少位置
        for (let i = list.length; i < cap; i++) grid.appendChild(U.el('div', 'eq-cell empty'));
        // PSD 固定 8 列 × 4 行：格子按 84 / 85 间距绝对定位，32 格一次全部展示
        Array.from(grid.children).forEach((cell, i) => {
          cell.style.left = (i % 8) * 84 + 'px';
          cell.style.top = Math.floor(i / 8) * 85 + 'px';
        });

        const wrap = bagPage.querySelector('.eq-grid-wrap');
        wrap.scrollTop = bagScroll;
        wrap.addEventListener('scroll', () => { bagScroll = wrap.scrollTop; });
      }

      // ---------- 大装备仓库 ----------
      if (page === 'stash') {
        const stashPage = U.el('div', 'eq-stash-page');
        stashPage.innerHTML = `
          <div class="eq-stash-title">装备库</div>
          <div class="eq-stash-count">已收藏 ${char.stash.length} 件</div>
          <button class="eq-btn stash-back">返回</button>
          <div class="eq-stash-inner">
            <div class="eq-stash-grid-wrap"><div class="eq-grid"></div></div>
          </div>`;
        canvas.appendChild(stashPage);
        stashPage.querySelector('.stash-back').addEventListener('click', () => {
          page = 'bag';
          render();
        });

        const grid = stashPage.querySelector('.eq-grid');
        char.stash.forEach(item => {
          const cell = U.el('button', 'eq-cell');
          fillCell(cell, item, slotOf(item));
          cell.addEventListener('click', () => openDetail(item, 'stash'));
          grid.appendChild(cell);
        });
        if (!char.stash.length) {
          stashPage.querySelector('.eq-stash-inner')
            .appendChild(U.el('div', 'eq-empty show', '仓库还是空的'));
        }

        const wrap = stashPage.querySelector('.eq-stash-grid-wrap');
        wrap.scrollTop = stashScroll;
        wrap.addEventListener('scroll', () => { stashScroll = wrap.scrollTop; });
      }
    }

    render();
    const panel = { close, isOpen: () => !!screen.isConnected };
    ui._equipPanel = panel;
    return panel;
  };
})();
