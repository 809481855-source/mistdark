/* 技能界面：野蛮人五技能辅助技能树（PSD 720×1440 原生坐标）
   其他职业暂时沿用旧的技能 / 天赋弹窗。 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const C = DG.CONFIG;
  const ui = DG.ui = DG.ui || {};

  // ---------- PSD 坐标 ----------
  const PSD_W = 720;
  const PSD_H = 1440;
  const ASSET = 'assets/ui/skill/';

  // 每棵树的主技能底框与 6 个辅助节点框（PSD 绝对坐标，框尺寸 207×133 / 67×65）
  const POS = {
    cleave: {
      root: [259, 178], rootLabel: 361, rootTop: 292,
      aux: [[195, 324], [466, 325], [123, 445], [267, 445], [394, 446], [538, 446]],
      midTop: 393, bottomTop: 516
    },
    whirlwind: {
      root: [89, 612], rootLabel: 190, rootTop: 726,
      aux: [[87, 758], [228, 758], [52, 879], [122, 879], [193, 879], [263, 879]],
      midTop: 826, bottomTop: 949
    },
    charge: {
      root: [437, 612], rootLabel: 541, rootTop: 726,
      aux: [[435, 758], [576, 758], [400, 879], [470, 879], [541, 879], [611, 879]],
      midTop: 826, bottomTop: 949
    },
    shockwave: {
      root: [89, 1039], rootLabel: 190, rootTop: 1155,
      aux: [[88, 1186], [229, 1186], [53, 1307], [123, 1307], [194, 1307], [264, 1307]],
      midTop: 1255, bottomTop: 1377
    },
    warcry: {
      root: [437, 1039], rootLabel: 541, rootTop: 1155,
      aux: [[436, 1186], [577, 1186], [401, 1307], [471, 1307], [542, 1307], [612, 1307]],
      midTop: 1255, bottomTop: 1377
    }
  };

  // 节点高亮色：仅用于可激活 / 已激活状态的光晕，不改变资源本身颜色
  const TREE_COLOR = {
    cleave: '#e0573a',
    whirlwind: '#b45cf0',
    charge: '#35c07a',
    shockwave: '#f0b52e',
    warcry: '#4b84f0'
  };

  const ROOT_W = 207;
  const ROOT_H = 133;
  const AUX_W = 67;
  const AUX_H = 65;
  // 线路素材为竖版 10×160，按两点距离拉伸后旋转
  const LINE_W = 10;

  function lineStyle(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI - 90;
    return `left:${(x1 - LINE_W / 2)}px;top:${y1}px;width:${LINE_W}px;height:${len}px;transform:rotate(${angle}deg)`;
  }

  function groupTotal(group) {
    return group.trees.reduce((sum, id) => {
      const tree = DG.data.skillTrees.warrior.find(t => t.id === id);
      return sum + (tree ? tree.nodes.length : 0);
    }, 0);
  }

  function openLegacy(char, onChange, opts) {
    const cls = DG.data.classes[char.cls];
    const ids = [cls.autoSkill, ...cls.skills];
    const body = U.el('div');

    const modal = ui.modal({
      title: '技能',
      subtitle: '技能升级',
      body,
      width: 680,
      onClose: opts && opts.onClose
    });

    const tabBar = U.el('div', 'tab-bar');
    const btnSkills = U.el('button', 'tab-btn sel', '技能');
    const trees = DG.skillTree ? DG.skillTree.treesFor(char) : [];
    const btnTree = trees.length ? U.el('button', 'tab-btn', '技能树') : null;
    tabBar.appendChild(btnSkills);
    if (btnTree) tabBar.appendChild(btnTree);

    const content = U.el('div', 'tab-content');
    // 只有技能一个页签时不再显示页签栏，避免出现无法切换的孤立按钮
    if (btnTree) body.appendChild(tabBar);
    body.appendChild(content);

    let tab = 'skills';

    function select(next) {
      tab = next;
      btnSkills.classList.toggle('sel', tab === 'skills');
      if (btnTree) btnTree.classList.toggle('sel', tab === 'tree');
      if (tab === 'skills') renderSkills();
      else if (tab === 'tree') renderTree();
    }

    function renderTree() {
      const pts = DG.skillTree.points(char);
      const blocks = trees.map(tree => {
        const skLv = char.skills[tree.skill] || 1;
        const nodes = tree.nodes.map((node, i) => {
          const on = DG.skillTree.has(char, node.id);
          const check = DG.skillTree.canAllocate(char, node.id);
          const state = on ? 'on' : (check.ok ? 'can' : 'locked');
          return `<button class="tree-node ${state}" data-node="${node.id}" ${state === 'can' ? '' : 'disabled'}>` +
            `<span class="tn-idx">${i + 1}</span>` +
            `<b>${U.escapeHtml(node.name)}</b>` +
            `<p>${U.escapeHtml(node.desc)}</p>` +
            (state === 'locked' ? `<em>${U.escapeHtml(check.reason)}</em>` : '') +
          `</button>`;
        }).join('');
        return `<div class="tree-block">` +
          `<div class="tree-head"><b>${U.escapeHtml(tree.name)}</b>` +
            `<span class="meta">技能 Lv.${skLv}</span></div>` +
          `<div class="tree-nodes">${nodes}</div>` +
        `</div>`;
      }).join('');

      content.innerHTML =
        `<div class="section-label">` +
          `<span>技能树 · ${U.escapeHtml(cls.name)}</span>` +
          `<span class="meta">剩余点数 <b class="point-badge">${pts}</b>` +
            `<button class="btn ghost btn-sm" data-tree-reset>重置</button></span>` +
        `</div>` +
        `<div class="tree-list">${blocks}</div>` +
        `<div class="note">每级获得技能点，主线任务额外奖励。节点按顺序点亮。</div>`;

      content.querySelectorAll('[data-node]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-node');
          const res = DG.skillTree.allocate(char, id);
          if (!res.ok) { ui.toast(res.reason || '无法激活', 'danger'); return; }
          DG.game.save();
          DG.audio.play('stageEquip', { vol: 0.45 });
          if (onChange) onChange();
          renderTree();
        });
      });
      const resetBtn = content.querySelector('[data-tree-reset]');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          let n = 0;
          trees.forEach(tree => { n += DG.skillTree.resetTree(char, tree); });
          if (!n) { ui.toast('还没有激活任何节点', 'danger'); return; }
          DG.game.save();
          ui.toast(`已重置，返还 ${n} 点`, 'blue');
          if (onChange) onChange();
          renderTree();
        });
      }
    }

    function renderSkills() {
      const rows = ids.map((id, idx) => {
        const sk = DG.data.skills[id];
        const lv = char.skills[id] || 1;
        const maxed = lv >= C.MAX_SKILL_LEVEL;
        const canUp = !maxed && char.skillPoints > 0;
        const nextText = maxed ? '已达最高等级' : `下一级：${U.round((sk.mult(lv + 1) - sk.mult(lv)) * 100, 0)}% 伤害提升`;
        const keyHint = idx === 0 ? '普攻' : '自动';
        return `<div class="skill-row">` +
          `<div class="skill-icon ${idx === 0 ? 'basic' : ''}">${U.escapeHtml(sk.glyph)}</div>` +
          `<div>` +
            `<div class="skill-name">${U.escapeHtml(sk.name)}` +
              `<span class="lv">Lv.${lv} / ${C.MAX_SKILL_LEVEL}</span>` +
              `<span class="key-tip">${keyHint}</span>` +
            `</div>` +
            `<div class="skill-desc">${sk.desc(lv)}</div>` +
            `<div class="skill-next">${nextText}${sk.cooldown ? ` · 冷却 ${sk.cooldown}s` : ''}</div>` +
          `</div>` +
          `<div class="skill-plus">` +
            `<button class="btn btn-sm ${canUp ? 'primary' : ''}" data-up="${id}" ${canUp ? '' : 'disabled'}>${maxed ? '已满' : '+1'}</button>` +
            `<span class="cost">${maxed ? '最高等级' : '消耗 1 点'}</span>` +
          `</div>` +
          `</div>`;
      }).join('');

      content.innerHTML =
        `<div class="section-label">` +
          `<span>职业 ${U.escapeHtml(cls.name)} · ${U.escapeHtml(cls.title)}</span>` +
          `<span class="meta">剩余技能点 <b class="point-badge">${char.skillPoints}</b></span>` +
        `</div>` +
        `<div class="skill-list">${rows}</div>` +
        `<div class="note">技能伤害随等级提升；普攻与技能全部自动释放。</div>`;

      content.querySelectorAll('[data-up]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-up');
          const lv = char.skills[id] || 1;
          if (char.skillPoints <= 0) {
            ui.toast('技能点不足', 'danger');
            return;
          }
          if (lv >= C.MAX_SKILL_LEVEL) return;
          char.skills[id] = lv + 1;
          char.skillPoints--;
          DG.game.save();
          if (onChange) onChange();
          const sk = DG.data.skills[id];
          ui.toast(`${sk.name} 提升至 Lv.${lv + 1}`, 'blue');
          renderSkills();
        });
      });
    }

    btnSkills.addEventListener('click', () => select('skills'));
    if (btnTree) btnTree.addEventListener('click', () => select('tree'));

    select('skills');
    return modal;
  }

  // ---------- 野蛮人：全屏技能树 ----------
  ui.openSkills = function (char, onChange, opts) {
    opts = opts || {};
    if (char.cls !== 'warrior' || !DG.data.skillTrees.warrior) {
      return openLegacy(char, onChange, opts);
    }
    // 连点技能入口时不叠出第二层面板，直接把已有实例返回
    if (ui._skillPanel && ui._skillPanel.isOpen()) return ui._skillPanel;

    const trees = DG.data.skillTrees.warrior;
    const screen = U.el('div', 'sk-screen');
    const canvas = U.el('div', 'sk-canvas');
    screen.appendChild(canvas);
    DG.game.ui.appendChild(screen);
    // 打开时清掉上一场景残留的提示；提示条移到标题与分组条之间的空白处，
    // 避免激活反馈压住技能树节点。内联样式可覆盖主城 / 战斗各自的提示位置
    const toastWrap = document.getElementById('toast-wrap');
    if (toastWrap) {
      toastWrap.replaceChildren();
      // 复用弹窗提示的单条模式：面板内连续点击时不堆叠，只保留最新一条
      toastWrap.classList.add('over-modal');
      toastWrap.style.left = '50%';
      toastWrap.style.right = 'auto';
      toastWrap.style.top = '92px';
      toastWrap.style.bottom = 'auto';
      toastWrap.style.transform = 'translateX(-50%)';
    }

    function layout() {
      const stage = document.getElementById('stage');
      // 主城地图宽于舞台时浏览器会把 #stage 滚出一点偏移，整屏技能页必须从舞台左上角开始
      if (stage && (stage.scrollLeft || stage.scrollTop)) {
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
      }
      const dw = (stage && stage.offsetWidth) || 720;
      const dh = (stage && stage.offsetHeight) || 1440;
      screen.style.left = ((720 - dw) / 2) + 'px';
      screen.style.top = ((1440 - dh) / 2) + 'px';
      screen.style.width = dw + 'px';
      screen.style.height = dh + 'px';
      // 按宽度铺满，顶部对齐：720×1440 内容完整保留，多出的高度由米黄底自然延伸
      const scale = dw / PSD_W;
      canvas.style.transform = `scale(${scale})`;
      canvas.style.left = ((dw - PSD_W * scale) / 2) + 'px';
      canvas.style.top = '0px';
    }

    function close() {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', layout);
      if (screen.parentNode) screen.remove();
      if (toastWrap) {
        toastWrap.classList.remove('over-modal');
        toastWrap.style.left = '';
        toastWrap.style.right = '';
        toastWrap.style.top = '';
        toastWrap.style.bottom = '';
        toastWrap.style.transform = '';
      }
      ui._skillPanel = null;
      if (opts.onClose) opts.onClose();
    }

    function onKey(e) {
      if (e.key !== 'Escape') return;
      // 面板打开时吃掉 ESC：副本的 ESC 监听挂在 window 上，
      // 若继续冒泡会在关闭面板恢复战斗后立刻又把战斗暂停一次
      e.stopPropagation();
      close();
    }
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', layout);

    function persist() {
      DG.game.save();
      if (onChange) onChange();
      render();
    }

    function render() {
      const pts = DG.skillTree.points(char);
      let html =
        `<div class="sk-bg"></div>` +
        `<div class="sk-title">技能</div>` +
        `<button class="sk-close" data-sk-close aria-label="关闭"></button>` +
        (pts > 0 ? `<div class="sk-points"><span>可用技能点</span><b>${pts}</b></div>` : '');

      DG.data.skillGroups.forEach(group => {
        const spent = DG.skillTree.spentInGroup(char, group);
        const total = groupTotal(group);
        html += `<div class="sk-band" style="top:${group.y}px">` +
          `<span class="sk-band-name">${U.escapeHtml(group.name)}</span>` +
          `<span class="sk-band-num">技能点<b>${spent}/${total}</b></span>` +
        `</div>`;
      });

      trees.forEach(tree => {
        const pos = POS[tree.id];
        if (!pos) return;
        const unlocked = DG.skillTree.treeUnlocked(char, tree);
        const color = TREE_COLOR[tree.id] || '#f0b52e';
        const [rx, ry] = pos.root;
        const rc = { x: rx + ROOT_W / 2, y: ry + ROOT_H / 2 };
        const rootIcon = `assets/ui/warrior/skill-${tree.id}.png`;

        let lines = '';
        tree.nodes.forEach((node, i) => {
          const [ax, ay] = pos.aux[i];
          const ac = { x: ax + AUX_W / 2, y: ay + AUX_H / 2 };
          const parentCenter = node.req
            ? (() => {
                const parent = tree.nodes.find(n => n.id === node.req);
                const [px, py] = pos.aux[parent.slot];
                return { x: px + AUX_W / 2, y: py + AUX_H / 2 };
              })()
            : rc;
          // 线路点亮：已激活的节点保持黄色通路，可激活的节点在获得技能点时点亮
          const lit = DG.skillTree.has(char, node.id) || DG.skillTree.canAllocate(char, node.id).ok;
          lines += `<i class="sk-line${lit ? ' lit' : ''}" style="${lineStyle(parentCenter.x, parentCenter.y, ac.x, ac.y)}"></i>`;
        });

        html += `<div class="sk-tree${unlocked ? '' : ' locked'}" data-tree="${tree.id}" style="--tc:${color}">` +
          `<div class="sk-lines">${lines}</div>` +
          `<button class="sk-node sk-root" data-root="${tree.id}" ` +
            `style="left:${rx}px;top:${ry}px;width:${ROOT_W}px;height:${ROOT_H}px" ` +
            `title="${U.escapeHtml(tree.name)}：${U.escapeHtml(tree.desc)}" ` +
            `aria-label="${U.escapeHtml(tree.name)}">` +
            `<img class="sk-frame" src="${ASSET}root-frame.png" alt="">` +
            `<img class="sk-icon" src="${rootIcon}" alt="" ` +
              `style="left:65px;top:34px;width:73px;height:72px">` +
            (unlocked ? '' : `<span class="sk-lock">Lv.${tree.unlock}</span>`) +
          `</button>` +
          `<div class="sk-label sk-root-label" data-root="${tree.id}" ` +
            `style="left:${pos.rootLabel - 80}px;top:${pos.rootTop}px;width:160px">` +
            U.escapeHtml(tree.name) +
          `</div>`;

        tree.nodes.forEach((node, i) => {
          const [ax, ay] = pos.aux[i];
          const on = DG.skillTree.has(char, node.id);
          const can = DG.skillTree.canAllocate(char, node.id).ok;
          const state = on ? 'on' : (can ? 'can' : 'off');
          const labelTop = node.slot < 2 ? pos.midTop : pos.bottomTop;
          html += `<button class="sk-node sk-aux ${state}" data-node="${node.id}" ` +
              `style="left:${ax}px;top:${ay}px;width:${AUX_W}px;height:${AUX_H}px" ` +
              `title="${U.escapeHtml(node.name)}：${U.escapeHtml(node.desc)}" ` +
              `aria-label="${U.escapeHtml(node.name)}">` +
              `<img class="sk-frame" src="${ASSET}node-frame.png" alt="">` +
              `<img class="sk-icon" src="${node.icon}" alt="" ` +
                `style="left:4px;top:3.5px;width:59px;height:58px">` +
            `</button>` +
            `<div class="sk-label ${state}" data-node="${node.id}" ` +
              `style="left:${ax + AUX_W / 2 - 60}px;top:${labelTop}px;width:120px">` +
              U.escapeHtml(node.name) +
            `</div>`;
        });

        html += `</div>`;
      });

      canvas.innerHTML = html;
    }

    // 事件委托：根节点看信息，辅助节点消耗技能点激活
    canvas.addEventListener('click', (e) => {
      if (e.target === screen) return;
      if (e.target.closest('[data-sk-close]')) { close(); return; }

      const rootBtn = e.target.closest('[data-root]');
      if (rootBtn) {
        const tree = trees.find(t => t.id === rootBtn.getAttribute('data-root'));
        if (!tree) return;
        if (!DG.skillTree.treeUnlocked(char, tree)) {
          ui.toast(`${tree.name}：角色 ${tree.unlock} 级解锁`, 'danger');
        } else {
          const n = DG.skillTree.spentInTree(char, tree);
          ui.toast(`${tree.name}：${tree.desc} 已激活 ${n}/${tree.nodes.length}`, 'blue');
        }
        return;
      }

      const nodeBtn = e.target.closest('[data-node]');
      if (!nodeBtn) return;
      const id = nodeBtn.getAttribute('data-node');
      const info = DG.data.skillTreeIndex[id];
      if (!info) return;
      const node = info.node;

      if (DG.skillTree.has(char, id)) {
        ui.toast(`${node.name}：${node.desc}`, 'blue');
        return;
      }
      const check = DG.skillTree.canAllocate(char, id);
      if (!check.ok) {
        ui.toast(check.reason, 'danger');
        return;
      }
      const res = DG.skillTree.allocate(char, id);
      if (!res.ok) {
        ui.toast(res.reason || '无法激活', 'danger');
        return;
      }
      if (DG.audio) DG.audio.play('stageEquip', { vol: 0.5 });
      ui.toast(`已激活「${node.name}」· ${node.desc}`, 'gold');
      persist();
    });

    render();
    layout();
    // 点击技能入口后浏览器可能再次把舞台滚动到焦点位置，下一帧再校正一次
    requestAnimationFrame(layout);
    ui._skillPanel = { close, isOpen: () => screen.isConnected };
    return ui._skillPanel;
  };
})();
