/* 技能面板：技能升级与天赋树双页签 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const C = DG.CONFIG;
  const ui = DG.ui = DG.ui || {};

  ui.openSkills = function (char, onChange, opts) {
    const cls = DG.data.classes[char.cls];
    const ids = [cls.autoSkill, ...cls.skills];
    const body = U.el('div');

    const modal = ui.modal({
      title: '技能',
      subtitle: '技能升级与天赋养成',
      body,
      width: 680,
      onClose: opts && opts.onClose
    });

    const tabBar = U.el('div', 'tab-bar');
    const btnSkills = U.el('button', 'tab-btn sel', '技能');
    const btnTalents = U.el('button', 'tab-btn', '天赋');
    const trees = DG.skillTree ? DG.skillTree.treesFor(char) : [];
    const btnTree = trees.length ? U.el('button', 'tab-btn', '技能树') : null;
    tabBar.appendChild(btnSkills);
    tabBar.appendChild(btnTalents);
    if (btnTree) tabBar.appendChild(btnTree);

    const content = U.el('div', 'tab-content');
    body.appendChild(tabBar);
    body.appendChild(content);

    let tab = 'skills';

    function select(next) {
      tab = next;
      btnSkills.classList.toggle('sel', tab === 'skills');
      btnTalents.classList.toggle('sel', tab === 'talents');
      if (btnTree) btnTree.classList.toggle('sel', tab === 'tree');
      if (tab === 'skills') renderSkills();
      else if (tab === 'tree') renderTree();
      else renderTalents();
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
        `<div class="note">每级获得 1 点技能树点，主线任务额外奖励。节点按顺序点亮，并需要对应技能达到指定等级。</div>`;

      content.querySelectorAll('[data-node]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-node');
          const res = DG.skillTree.allocate(char, id);
          if (!res.ok) { ui.toast(res.reason || '无法点亮', 'danger'); return; }
          DG.game.save();
          DG.audio.play('stageEquip', { vol: 0.45 });
          if (onChange) onChange();
          renderTree();
        });
      });
      const resetBtn = content.querySelector('[data-tree-reset]');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          const n = DG.skillTree.reset(char);
          if (!n) { ui.toast('还没有点亮任何节点', 'danger'); return; }
          DG.game.save();
          ui.toast(`已重置，返还 ${n} 点`, 'blue');
          if (onChange) onChange();
          renderTree();
        });
      }
    }

    function renderTalents() {
      if (ui.renderTalentsInto) ui.renderTalentsInto(content, char, onChange);
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
        `<div class="note">` +
          `技能伤害随等级提升；普攻与 5 个技能全部自动释放，战斗界面底部技能栏展示冷却状态。` +
        `</div>`;

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
    btnTalents.addEventListener('click', () => select('talents'));
    if (btnTree) btnTree.addEventListener('click', () => select('tree'));

    select('skills');
    return modal;
  };
})();
