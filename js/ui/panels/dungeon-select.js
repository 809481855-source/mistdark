/* 秘境副本：整屏关卡选择（按 PSD 切图还原）
   结构：背景 / 章节页签 / 标题带 / 关卡列表 / 底部进入副本 / 公用关闭按钮
   交互：切页签 → 选关卡 → 底部按钮进入；未解锁关卡点击给出原因提示 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];
  // 页签上只显示两字简称，完整章节名在选关时通过标题带保持简洁
  const SHORT = { 1: '迷雾', 2: '腐化', 3: '黑潮', 4: '王座' };

  ui.openDungeonSelect = function (char, onEnter) {
    if (document.querySelector('.secret-screen')) return null;
    const acts = DG.data.acts;
    const all = DG.data.dungeons;
    const toastWrap = document.getElementById('toast-wrap');

    // 当前挑战关卡 = 最远通关进度的下一关；默认停在它所在章节，
    // 没有可推进关卡时，稍后回落到最高已解锁章节
    const maxIdx = DG.data.progressIndex(char);
    const curIdx = Math.min(all.length - 1, maxIdx + 1);
    const cur = all[curIdx];
    const curOpen = !!(cur && DG.data.stageUnlocked(char, cur));
    let act = curOpen ? cur.act : 0;

    let selId = null;

    const screen = U.el('div', 'secret-screen');
    screen.innerHTML =
      '<div class="secret-tabs"></div>' +
      '<h2 class="secret-title">秘境副本</h2>' +
      '<div class="secret-list"></div>' +
      '<div class="secret-foot"><button class="btn primary secret-enter">进入副本</button></div>' +
      '<button class="secret-close" aria-label="关闭"></button>';

    const tabsEl = screen.querySelector('.secret-tabs');
    const listEl = screen.querySelector('.secret-list');
    const enterBtn = screen.querySelector('.secret-enter');

    function reasonOf(def) {
      if (!def) return '当前章节尚未解锁';
      if (DG.data.stageUnlocked(char, def)) return '';
      const idx = all.indexOf(def);
      // 进度紧接的下一关才提示等级，之后统一提示先通关上一关
      if (idx === maxIdx + 1) return `需角色 Lv.${def.reqLevel}`;
      const prev = all[idx - 1];
      return prev ? `需通关「${prev.name}」` : '当前章节尚未解锁';
    }
    const actStages = () => all.filter(d => d.act === act);
    const stagesOf = a => all.filter(d => d.act === a);
    // 章节内至少有一关可进入，才视为该章节已解锁
    const actUnlocked = a => stagesOf(a).some(d => !reasonOf(d));
    if (!act || !actUnlocked(act)) {
      const openAct = acts.filter(a => actUnlocked(a.id));
      act = openAct.length ? openAct[openAct.length - 1].id : 1;
    }

    function ensureSel() {
      const arr = actStages();
      if (selId && arr.some(d => d.id === selId)) return;
      const current = curOpen && cur.act === act ? cur : null;
      const ready = current || arr.find(d => !reasonOf(d) && !char.cleared[d.id]) || arr.find(d => !reasonOf(d));
      selId = ready ? ready.id : null;
    }

    // 把选中关卡滚到列表可视区中间（列表未挂载时 clientHeight 为 0，直接跳过）
    function centerSel() {
      const selBtn = listEl.querySelector('.secret-row.sel');
      if (!selBtn || !listEl.clientHeight) return;
      const target = selBtn.offsetTop - (listEl.clientHeight - selBtn.offsetHeight) / 2;
      const max = listEl.scrollHeight - listEl.clientHeight;
      listEl.scrollTop = Math.max(0, Math.min(target, max));
    }

    function render(jump) {
      const keepTop = listEl.scrollTop;
      tabsEl.innerHTML = acts.map(a => {
        const locked = !actUnlocked(a.id);
        return `<button class="secret-tab${a.id === act ? ' on' : ''}${locked ? ' locked' : ''}" data-act="${a.id}">` +
          (locked ? '<span class="s-mask"></span><span class="s-lock"></span>' : '') +
          `<span class="st-label">${SHORT[a.id] || a.name.slice(0, 2)}</span>` +
          `<b>${ROMAN[a.id - 1]}</b>` +
        `</button>`;
      }).join('');

      listEl.innerHTML = actStages().map((d, i) => {
        const reason = reasonOf(d);
        const locked = !!reason;
        return `<button class="secret-row${d.id === selId ? ' sel' : ''}${locked ? ' locked' : ''}" data-id="${d.id}">` +
          (locked ? '<span class="s-mask"></span>' : '') +
          `<span class="s-num">${i + 1}</span>` +
          `<span class="s-name">${U.escapeHtml(d.name)}</span>` +
          `<span class="s-meta"><em>物品等级：${d.ilvl}</em><em>推荐等级：${d.reqLevel}</em></span>` +
          (locked ? '<span class="s-lock"></span>' : '') +
        `</button>`;
      }).join('');

      const selDef = all.find(d => d.id === selId);
      enterBtn.classList.toggle('off', !(selDef && !reasonOf(selDef)));

      // jump=true：进入界面 / 切章节时对准当前挑战关卡；
      // 其余情况保留滚动位置，只有选中行滑出可视区才滚回中间
      if (jump) {
        centerSel();
      } else {
        listEl.scrollTop = keepTop;
        const selBtn = listEl.querySelector('.secret-row.sel');
        if (selBtn) {
          const top = selBtn.offsetTop, bottom = top + selBtn.offsetHeight;
          if (top < listEl.scrollTop || bottom > listEl.scrollTop + listEl.clientHeight) centerSel();
        }
      }

      tabsEl.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.getAttribute('data-act'), 10);
          if (!id) return;
          if (!actUnlocked(id)) { ui.toast(reasonOf(stagesOf(id)[0])); return; }
          if (id === act) return;
          act = id;
          selId = null;
          ensureSel();
          render(true);
          if (DG.audio) DG.audio.play('uiSelect', { vol: 0.4, gap: 0.08 });
        });
      });

      listEl.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const def = all.find(d => d.id === id);
          const reason = reasonOf(def);
          if (reason) { ui.toast(reason); return; }
          if (selId === id) return;
          selId = id;
          render();
          if (DG.audio) DG.audio.play('uiSelect', { vol: 0.4, gap: 0.08 });
        });
      });
    }

    function close() {
      if (!screen.parentNode) return;
      screen.remove();
      document.removeEventListener('keydown', onKey);
      if (DG.audio) DG.audio.play('uiClose', { vol: 0.45, gap: 0.12 });
      if (toastWrap && !document.querySelector('.modal-mask, .secret-screen')) {
        toastWrap.classList.remove('over-modal');
      }
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        close();
      }
    }

    screen.querySelector('.secret-close').addEventListener('click', close);
    enterBtn.addEventListener('click', () => {
      const def = all.find(d => d.id === selId);
      const reason = reasonOf(def);
      if (reason) { ui.toast(reason); return; }
      close();
      onEnter(def);
    });

    // 先挂载再渲染，列表才有布局尺寸，进入时才能滚到当前挑战关卡
    ensureSel();
    DG.game.ui.appendChild(screen);
    render(true);
    if (DG.audio) DG.audio.play('uiOpen', { vol: 0.5, gap: 0.12 });
    if (toastWrap) {
      toastWrap.replaceChildren();
      toastWrap.classList.add('over-modal');
    }
    document.addEventListener('keydown', onKey);
    return { screen, close };
  };
})();
