/* 角色 · 装备界面：按 PSD 810×1680 坐标还原，整幅画布等比缩放到 720×1440 舞台 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const C = DG.CONFIG;
  const ui = DG.ui = DG.ui || {};

  // 画布 810×1680 在 CSS 里整体 scale(.888889) 到 720 宽，JS 只使用 PSD 原始坐标
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

  // 品质框：白 / 蓝 / 紫 / 普通套装 / 暗金，套装与暗金另有远古框
  const FRAME = {
    normal: 'frame-normal.png',
    magic: 'frame-magic.png',
    rare: 'frame-rare.png',
    set: 'frame-set.png',
    legend: 'frame-legend.png'
  };
  const FRAME_ANCIENT = {
    set: 'frame-set-ancient.png',
    legend: 'frame-legend-ancient.png'
  };

  const TABS = [
    { id: 'equip', name: '装备' },
    { id: 'item', name: '道具' },
    { id: 'other', name: '其他' }
  ];

  function frameSrc(item) {
    const ancient = item.ancient && FRAME_ANCIENT[item.rarity];
    return ASSET + (ancient || FRAME[item.rarity] || FRAME.normal);
  }

  function slotOf(item) {
    return DG.items.slotInfo(item.slot) || { name: '装备', glyph: '?' };
  }

  // 单个道具格：空格显示部位名，有装备时叠品质框 + 部位图标 + 等级
  function fillCell(cell, item, slot) {
    cell.innerHTML = '';
    if (!item) {
      cell.classList.remove('has');
      cell.appendChild(U.el('span', 'eq-cell-label', slot.name));
      return;
    }
    cell.classList.add('has');
    const img = U.el('img', 'eq-frame');
    img.src = frameSrc(item);
    img.alt = '';
    cell.appendChild(img);
    cell.appendChild(U.el('span', 'eq-glyph', slot.glyph));
    cell.appendChild(U.el('span', 'eq-ilvl', String(item.ilvl)));
    if (item.ancient) cell.appendChild(U.el('span', 'eq-ancient', '远'));
    cell.title = item.name;
  }

  ui.openEquipment = function (char, onChange, opts) {
    opts = opts || {};
    const screen = U.el('div', 'eq-screen');
    const canvas = U.el('div', 'eq-canvas');
    screen.appendChild(canvas);
    DG.game.ui.appendChild(screen);

    let tab = 'equip';
    let page = 'bag';               // bag：临时装备库 / stash：大装备仓库
    let bagScroll = 0;
    let stashScroll = 0;

    function close() {
      document.removeEventListener('keydown', onKey);
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

    // 一键分解：默认只处理白装与蓝装，紫 / 套装 / 暗金保留
    function dismantle() {
      const junk = char.bag.filter(it => it && (it.rarity === 'normal' || it.rarity === 'magic'));
      if (!junk.length) {
        ui.toast('没有可分解的白装或蓝装', 'danger');
        return;
      }
      ui.confirm(`分解 ${junk.length} 件白装 / 蓝装？分解后无法找回。`, () => {
        char.bag = char.bag.filter(it => !(it && (it.rarity === 'normal' || it.rarity === 'magic')));
        ui.toast(`已分解 ${junk.length} 件装备`, 'gold');
        persist();
      }, { danger: true, okText: '分解' });
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
      const used = DG.character.bagUsed(char);
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
          <div class="eq-portrait"><img src="${ASSET}avatar.png" alt=""></div>
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
            <div class="eq-tab-pill" style="left:${tabIndex * 125}px"></div>
            ${TABS.map((t, i) =>
              `<button class="eq-tab${t.id === tab ? ' on' : ''}" data-tab="${t.id}" style="left:${i * 125}px">${t.name}</button>`
            ).join('')}
          </div>
          <button class="eq-btn stash">装备库</button>
          <button class="eq-btn dismantle">分解</button>
          <div class="eq-cap">容量：<b>${used}</b>/${cap}</div>
          <div class="eq-grid-wrap"><div class="eq-grid"></div></div>
          <div class="eq-empty hidden"></div>
        </div>` : ''}
      `;

      // ---------- 头部 ----------
      canvas.querySelector('.eq-close').addEventListener('click', close);
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
        fillCell(cell, item, slot);
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
        const list = tab === 'equip' ? char.bag.filter(Boolean) : [];
        list.forEach(item => {
          const cell = U.el('button', 'eq-cell');
          fillCell(cell, item, slotOf(item));
          cell.addEventListener('click', () => openDetail(item, 'bag'));
          grid.appendChild(cell);
        });
        // 装备页按容量补齐空格，直观看出还剩多少位置
        if (tab === 'equip') {
          for (let i = list.length; i < cap; i++) grid.appendChild(U.el('div', 'eq-cell empty'));
        } else if (!list.length) {
          const hint = bagPage.querySelector('.eq-empty');
          hint.classList.remove('hidden');
          hint.textContent = tab === 'item' ? '暂无道具' : '暂无其他物品';
        }

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
    return { close };
  };
})();
