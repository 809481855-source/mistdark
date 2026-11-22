/* 装备与背包面板 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const C = DG.CONFIG;
  const ui = DG.ui = DG.ui || {};

  ui.openEquipment = function (char, onChange, opts) {
    const body = U.el('div');
    const modal = ui.modal({
      title: '角色与装备',
      subtitle: '点击物品查看详情，装备立即生效；金币可重铸词条',
      body,
      width: 660,
      onClose: opts && opts.onClose
    });

    let sel = null; // {from:'bag', index} | {from:'equip', slot}
    const bagSize = C.BAG_SIZE;

    function rerender() {
      const stats = DG.stats.compute(char);
      const used = DG.character.bagUsed(char);
      const slotCard = s => {
        const it = char.equipment[s.id];
        return `<div class="equip-slot">` +
          `<span class="slot-label">${s.name}</span>` +
          `<div class="slot-cell" data-slot="${s.id}"></div>` +
          `<span class="slot-name">${it ? U.escapeHtml(it.name) : '未装备'}</span>` +
          `</div>`;
      };
      // 主体装备 2×2，饰物三连排，避免 7 格纵向拉得过长
      const mainSlots = ['weapon', 'helm', 'armor', 'boots'];
      const trinketSlots = ['gloves', 'ring', 'amulet'];
      const mainRows = C.SLOTS.filter(s => mainSlots.indexOf(s.id) >= 0).map(slotCard).join('');
      const trinketRows = C.SLOTS.filter(s => trinketSlots.indexOf(s.id) >= 0).map(slotCard).join('');

      const statRows = [
        ['最大生命', U.fmt(stats.maxHp)],
        ['攻击力', stats.atk],
        ['护甲', `${stats.armor} <em>减伤 ${DG.stats.mitigation(stats.armor)}%</em>`],
        ['暴击率', stats.crit + '%'],
        ['暴击伤害', stats.critDmg + '%'],
        ['移动速度', stats.moveSpeed],
        ['攻击速度', stats.attackSpeed + '/秒'],
        ['生命回复', stats.hpRegen + '/秒']
      ].map(r => `<li><span>${r[0]}</span><b>${r[1]}</b></li>`).join('');

      const cls = DG.data.classes[char.cls];
      const equipped = C.SLOTS.filter(s => char.equipment[s.id]).length;
      const bagPct = U.clamp(used / bagSize, 0, 1) * 100;
      body.innerHTML = `
        <div class="equip-layout">
          <div class="equip-hero">
            <div class="equip-hero-emblem" style="color:${cls.color};border-color:${cls.color}66;">${U.escapeHtml(cls.glyph)}</div>
            <div class="equip-hero-id">
              <div class="equip-hero-name">${U.escapeHtml(char.name)}<span class="equip-hero-lv">Lv.${char.level}</span></div>
              <div class="equip-hero-sub">${U.escapeHtml(cls.name)} · ${U.escapeHtml(cls.title)}</div>
            </div>
            <div class="equip-hero-power"><span>战 力</span><b>${U.fmt(stats.power)}</b></div>
          </div>
          <div class="equip-top">
            <section class="sheet equip-doll">
              <div class="section-label"><span>装备槽位</span><span class="meta">${equipped} / ${C.SLOTS.length}</span></div>
              <div class="equip-slots equip-main">${mainRows}</div>
              <div class="equip-divider"><span>饰 物</span></div>
              <div class="equip-slots equip-trinkets">${trinketRows}</div>
            </section>
            <section class="sheet equip-stats">
              <div class="section-label"><span>角色属性</span><span class="meta">Lv.${char.level}</span></div>
              <ul class="stat-list">${statRows}</ul>
            </section>
          </div>
          <section class="sheet equip-bag">
            <div class="section-label"><span>背包</span><span class="meta">${used} / ${bagSize} · 金币 ${U.fmt(char.gold)}</span></div>
            <div class="bag-cap"><i style="width:${bagPct}%"></i></div>
            <div class="bag-grid" data-bag></div>
          </section>
          <div class="detail-box" data-detail></div>
        </div>`;

      // 装备槽
      C.SLOTS.forEach(s => {
        const holder = body.querySelector(`.slot-cell[data-slot="${s.id}"]`);
        const it = char.equipment[s.id];
        holder.appendChild(ui.itemCell(it, {
          showLevel: !!it,
          selected: sel && sel.from === 'equip' && sel.slot === s.id,
          emptyGlyph: '空',
          onClick: () => {
            sel = it ? { from: 'equip', slot: s.id } : null;
            rerender();
          }
        }));
      });

      // 背包
      const bagEl = body.querySelector('[data-bag]');
      for (let i = 0; i < bagSize; i++) {
        const it = char.bag[i];
        bagEl.appendChild(ui.itemCell(it, {
          selected: sel && sel.from === 'bag' && sel.index === i,
          showLevel: !!it,
          onClick: it ? (() => { sel = { from: 'bag', index: i }; rerender(); }) : null
        }));
      }

      // 详情
      const detail = body.querySelector('[data-detail]');
      if (!sel) {
        detail.innerHTML = ui.itemDetailHtml(null);
      } else if (sel.from === 'bag') {
        const item = char.bag[sel.index];
        if (!item) { sel = null; return rerender(); }
        detail.innerHTML = ui.itemDetailHtml(item, char.equipment[item.slot] || null);
        const actions = U.el('div', 'detail-actions');
        const btnEquip = U.el('button', 'btn primary btn-sm', '装 备');
        const btnReroll = rerollButton(item);
        const btnDrop = U.el('button', 'btn danger btn-sm', '丢 弃');
        btnEquip.addEventListener('click', () => equipFromBag(sel.index));
        btnReroll.addEventListener('click', () => rerollItem(item));
        btnDrop.addEventListener('click', () => {
          const target = char.bag[sel.index];
          if (!target) return;
          ui.confirm(`确定丢弃「${target.name}」？丢弃后无法找回。`, () => {
            char.bag.splice(sel.index, 1);
            sel = null;
            DG.game.save();
            if (onChange) onChange();
            rerender();
          }, { danger: true, okText: '丢弃' });
        });
        actions.appendChild(btnEquip);
        actions.appendChild(btnReroll);
        actions.appendChild(btnDrop);
        detail.appendChild(actions);
      } else if (sel.from === 'equip') {
        const item = char.equipment[sel.slot];
        if (!item) { sel = null; return rerender(); }
        detail.innerHTML = ui.itemDetailHtml(item);
        const actions = U.el('div', 'detail-actions');
        const btnReroll = rerollButton(item);
        const btnOff = U.el('button', 'btn btn-sm', '卸 下');
        btnReroll.addEventListener('click', () => rerollItem(item));
        btnOff.addEventListener('click', () => unequip(sel.slot));
        actions.appendChild(btnReroll);
        actions.appendChild(btnOff);
        detail.appendChild(actions);
      }

      // 手机屏幕较矮，选中物品后把详情与操作按钮滚动到可见区域
      if (sel) {
        requestAnimationFrame(() => {
          modal.body.scrollTop = modal.body.scrollHeight;
        });
      }
    }

    // 重铸：消耗金币重掷选中装备的基础属性与词缀
    function rerollButton(item) {
      const cost = DG.items.rerollCost(item);
      const btn = U.el('button', 'btn btn-sm', `重铸 · ${U.fmt(cost)} 金币`);
      if ((char.gold || 0) < cost) btn.disabled = true;
      return btn;
    }

    function rerollItem(item) {
      if (!sel) return;
      const cost = DG.items.rerollCost(item);
      if ((char.gold || 0) < cost) {
        ui.toast('金币不足，无法重铸', 'danger');
        return;
      }
      const fresh = DG.items.reroll(item, char.cls);
      if (!fresh) return;
      char.gold -= cost;
      if (sel.from === 'bag') char.bag[sel.index] = fresh;
      else char.equipment[sel.slot] = fresh;
      DG.game.save();
      if (onChange) onChange();
      if (DG.audio) DG.audio.play('stageEquip', { vol: 0.5 });
      ui.toast(`重铸完成：${fresh.name}`, 'gold');
      rerender();
    }

    function equipFromBag(index) {
      const item = char.bag[index];
      if (!item) return;
      const old = char.equipment[item.slot];
      char.equipment[item.slot] = item;
      char.bag.splice(index, 1);
      if (old) char.bag.push(old);
      sel = null;
      DG.game.save();
      if (onChange) onChange();
      ui.toast(`已装备「${item.name}」`, 'gold');
      rerender();
    }

    function unequip(slot) {
      const item = char.equipment[slot];
      if (!item) return;
      if (DG.character.bagUsed(char) >= bagSize) {
        ui.toast('背包已满，无法卸下', 'danger');
        return;
      }
      char.equipment[slot] = null;
      char.bag.push(item);
      sel = null;
      DG.game.save();
      if (onChange) onChange();
      rerender();
    }

    rerender();
    return modal;
  };
})();
