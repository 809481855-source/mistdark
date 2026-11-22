/* 角色 · 装备界面：PSD 810×1680 原生坐标，按屏幕铺满显示（不再先缩到 720×1440） */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const C = DG.CONFIG;
  const ui = DG.ui = DG.ui || {};

  // 画布就是 PSD 的 810×1680，只按实际屏幕算一次等比缩放，JS 全程使用 PSD 原始坐标
  const ASSET = 'assets/ui/equip/';
  const PSD_W = 810;
  const PSD_H = 1680;
  const CONTENT_H = 1605;   // PSD 内容最低点（装备库面板底边），保证任何比例下内容不被裁掉

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

  function slotOf(item) {
    return DG.items.slotInfo(item.slot) || { name: '装备', glyph: '?' };
  }

  // 把 810×1680 画布按舞台实际显示尺寸铺满（cover），并抵消舞台自身的非等比缩放，
  // 保证 PSD 的圆形、字号、间距在任何屏幕上都不变形、不被二次压缩
  function fitCanvas(canvas, layoutW) {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const tf = getComputedStyle(stage).transform;
    let kx = 1;
    let ky = 1;
    if (tf && tf !== 'none') {
      const m = tf.match(/matrix\(([^)]+)\)/);
      if (m) {
        const v = m[1].split(',').map(Number);
        kx = v[0] || 1;
        ky = v[3] || 1;
      }
    }
    // 以“铺满屏幕”为准；屏幕过扁时退让到内容高度，避免底部装备栏被切
    const scale = Math.min(
      Math.max(rect.width / PSD_W, rect.height / PSD_H),
      rect.height / CONTENT_H
    );
    const sx = scale / kx;
    const sy = scale / ky;
    canvas.style.transformOrigin = 'left top';
    canvas.style.transform = `scale(${sx}, ${sy})`;
    canvas.style.left = ((layoutW || 720) / 2 - (PSD_W / 2) * sx) + 'px';
    canvas.style.top = '0px';
    // 舞台比 810 窄时（短屏 720×1680）画布左右各被裁掉一部分，
    // 把裁切宽度传给 CSS，让贴边的关闭按钮跟着内收，避免被切掉
    const cropX = Math.max(0, (PSD_W * sx - (layoutW || 720)) / 2);
    canvas.style.setProperty('--eq-crop', cropX + 'px');
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
    img.src = DG.ui.itemFrameSrc(item);
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
      fitCanvas(canvas, dw);
    };
    layout();
    const onResize = () => layout();
    window.addEventListener('resize', onResize);

    let tab = 'equip';
    let page = 'bag';               // bag：临时装备库 / stash：大装备仓库
    let bagScroll = 0;
    let stashScroll = 0;

    function close() {
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
    const panel = { close, isOpen: () => !!screen.isConnected };
    ui._equipPanel = panel;
    return panel;
  };
})();
