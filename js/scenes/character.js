/* 选角场景 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.scenes = DG.scenes || {};

  DG.scenes.character = {
    render(root) {
      if (DG.audio) DG.audio.playBgm('login');
      const acc = DG.game.account();
      const chars = acc.characters;
      const occupied = chars.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
      // 上次进入的角色优先；否则落在第一个已有角色上；都没有则停在首个空槽
      let sel = (DG.game.charIndex >= 0 && chars[DG.game.charIndex])
        ? DG.game.charIndex
        : (occupied.length ? occupied[0] : 0);

      const screen = U.el('div', 'screen char-screen');
      // 新号（账号内还没有任何角色）只保留标题与创建区，其余内容隐藏并压暗背景
      const isNewAccount = occupied.length === 0;
      screen.classList.toggle('is-new', isNewAccount);
      screen.innerHTML = `
        <div class="char-grade" aria-hidden="true"><i class="g-hue"></i><i class="g-glow"></i><i class="g-mist"></i><i class="g-rim"></i><i class="g-shade"></i><i class="g-grain"></i></div>
        <div class="char-new-mask" aria-hidden="true"></div>
        <header class="screen-head">
          <div>
            <h2>选 择 角 色</h2>
            <div class="head-sub">账号：${U.escapeHtml(DG.game.accountName)} · 存档保存在本机浏览器</div>
          </div>
        </header>
        <button class="plate-btn logout char-logout" id="btn-logout">登出</button>
        <div class="char-preview" data-preview></div>
        <div class="char-slots" data-slots></div>
        <div class="char-foot">左右箭头或下方槽位切换角色 · 等级与进度会自动保存</div>`;

      root.replaceChildren(screen);

      const preview = screen.querySelector('[data-preview]');
      const slotsEl = screen.querySelector('[data-slots]');

      // 底部槽位：已占用显示头像与等级，空槽直接进入创建
      slotsEl.innerHTML = chars.map((char, idx) => {
        if (!char) {
          return `<button class="char-slot empty" data-slot="${idx}">` +
            `<span class="slot-plus">＋</span><span class="slot-empty">创建角色</span>` +
          `</button>`;
        }
        const cls = DG.data.classes[char.cls];
        return `<button class="char-slot" data-slot="${idx}">` +
          `<span class="slot-emblem" style="color:${cls.color};border-color:${cls.color}55;">${cls.glyph}</span>` +
          `<span class="slot-copy">` +
            `<span class="slot-name">${U.escapeHtml(char.name)}</span>` +
            `<span class="slot-lv">Lv.${char.level}</span>` +
          `</span>` +
        `</button>`;
      }).join('');

      function paintPreview() {
        const char = chars[sel];
        // 背景按职业做色彩分级：野蛮人原色、游侠紫、术士蓝
        screen.dataset.cls = char ? char.cls : 'warrior';
        // 箭头永远可用：按槽位循环，空槽也会进入创建预览
        const nav =
          `<button class="preview-nav prev" data-step="-1" aria-label="上一个槽位">‹</button>` +
          `<button class="preview-nav next" data-step="1" aria-label="下一个槽位">›</button>`;
        const bindNav = () => {
          preview.querySelectorAll('[data-step]').forEach(btn => {
            btn.addEventListener('click', () => {
              const dir = Number(btn.getAttribute('data-step'));
              select((sel + dir + chars.length) % chars.length);
            });
          });
        };

        if (!char) {
          preview.innerHTML = nav + `
            <div class="preview-empty">
              <div class="preview-empty-glyph">＋</div>
              <div class="preview-empty-text">槽位 ${sel + 1} 还没有角色</div>
              <div class="preview-empty-hint">选择职业、命名后即可开始冒险</div>
              <button class="btn primary" data-create="${sel}">创 建 角 色</button>
            </div>`;
          bindNav();
          preview.querySelector('[data-create]').addEventListener('click', () => {
            DG.scenes.character.openCreate(sel);
          });
          return;
        }

        const cls = DG.data.classes[char.cls];
        const pct = Math.round(DG.character.levelProgress(char) * 100);
        const power = DG.stats.compute(char).power;
        const need = DG.character.xpNeed(char.level);
        const bag = DG.character.bagUsed(char);
        // 角色美术由 art/heroes 注册表提供，新增角色无需改动本文件
        const hero = DG.art.heroFor(cls.id);
        const useCanvas = !!(hero && hero.mode === 'canvas' && hero.canvasDraw);

        preview.innerHTML = nav + `
          <div class="preview-art">
            ${useCanvas
              ? '<canvas class="preview-canvas" data-hero-canvas width="840" height="1024"></canvas>'
              : DG.art.heroSvg(cls)}
          </div>
          <div class="preview-info">
            <div class="preview-name">${U.escapeHtml(char.name)}<span class="preview-lv">Lv.${char.level}</span></div>
            <div class="preview-meta">${cls.name} · ${cls.title}</div>
            <div class="preview-stats">
              <span class="pstat"><i>战力</i><b>${U.fmt(power)}</b></span>
              <span class="pstat"><i>金币</i><b>${U.fmt(char.gold)}</b></span>
              <span class="pstat"><i>背包</i><b>${bag} / ${DG.CONFIG.BAG_SIZE}</b></span>
            </div>
            <div class="preview-xp">
              <div class="pxp-bar"><i style="width:${pct}%"></i></div>
              <div class="pxp-text">经验 ${U.fmt(char.xp)} / ${U.fmt(need)} · ${pct}%</div>
            </div>
            <div class="preview-actions">
              <button class="btn ghost" data-del="${sel}">删除</button>
              <button class="btn primary" data-enter="${sel}">进 入 游 戏</button>
            </div>
          </div>`;

        const cv = preview.querySelector('canvas[data-hero-canvas]');
        if (cv) {
          const ctx = cv.getContext('2d');
          const t0 = performance.now();
          // 逐帧重绘待机动作；角色被切换/离开页面后画布脱离文档，循环自动停止
          const tick = (now) => {
            if (!cv.isConnected) return;
            ctx.setTransform(2, 0, 0, 2, 0, 0);
            ctx.clearRect(0, 0, 420, 512);
            DG.art.heroFor(cls.id).canvasDraw(ctx, 207, 361, {
              scale: 1,
              state: 'idle',
              t: (now - t0) / 1000,
              shadow: true
            });
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }

        bindNav();

        preview.querySelector('[data-enter]').addEventListener('click', () => {
          DG.game.enterCharacter(sel);
        });

        preview.querySelector('[data-del]').addEventListener('click', () => {
          DG.ui.confirm(`确定删除角色「${char.name}」？该角色的装备与进度将永久丢失。`, () => {
            chars[sel] = null;
            DG.game.save();
            DG.ui.toast('角色已删除');
            DG.scenes.character.render(DG.game.ui);
          }, { danger: true, okText: '删除' });
        });
      }

      function paintSlots() {
        slotsEl.querySelectorAll('[data-slot]').forEach(el => {
          el.classList.toggle('sel', Number(el.getAttribute('data-slot')) === sel);
        });
      }

      function select(idx) {
        sel = idx;
        paintPreview();
        paintSlots();
      }

      slotsEl.querySelectorAll('[data-slot]').forEach(el => {
        el.addEventListener('click', () => {
          const idx = Number(el.getAttribute('data-slot'));
          if (chars[idx]) select(idx);
          else DG.scenes.character.openCreate(idx);
        });
      });

      screen.querySelector('#btn-logout').addEventListener('click', () => {
        DG.game.logout();
      });

      select(sel);
    },

    openCreate(slotIndex) {
      let clsId = 'warrior';
      const body = U.el('div');

      const picks = Object.values(DG.data.classes).map(c =>
        `<div class="class-pick${c.id === clsId ? ' sel' : ''}" data-cls="${c.id}">` +
          `<div class="pick-glyph" style="color:${c.color};">${c.glyph}</div>` +
          `<div class="pick-name">${c.name}</div>` +
          `<div class="pick-title">${c.title}</div>` +
        `</div>`
      ).join('');

      body.innerHTML = `
        <div class="section-label"><span>选择职业</span></div>
        <div class="class-picks">${picks}</div>
        <div class="section-label" style="margin-top:18px;"><span>角色名</span></div>
        <input type="text" id="new-char-name" maxlength="8" placeholder="2-8 个字符">
        <div class="cls-desc" id="cls-desc"></div>
        <div class="login-err" id="create-err" style="margin-top:8px;"></div>`;

      const modal = DG.ui.modal({
        title: '创建角色',
        subtitle: `角色槽位 ${slotIndex + 1}`,
        body,
        width: 620
      });

      const descEl = body.querySelector('#cls-desc');
      const errEl = body.querySelector('#create-err');
      const nameEl = body.querySelector('#new-char-name');

      function refreshDesc() {
        const cls = DG.data.classes[clsId];
        descEl.innerHTML = `${cls.desc}<br>` +
          `<span class="cls-base">生命 ${cls.base.hp} · 攻击 ${cls.base.atk} · 护甲 ${cls.base.armor} · 移速 ${cls.base.moveSpeed}</span>`;
      }
      refreshDesc();

      body.querySelectorAll('[data-cls]').forEach(el => {
        el.addEventListener('click', () => {
          clsId = el.getAttribute('data-cls');
          body.querySelectorAll('[data-cls]').forEach(x => x.classList.remove('sel'));
          el.classList.add('sel');
          refreshDesc();
        });
      });

      const btn = U.el('button', 'btn primary', '创建并进入');
      btn.addEventListener('click', () => {
        const name = nameEl.value.trim();
        if (name.length < 2 || name.length > 8) {
          errEl.textContent = '角色名需 2-8 个字符';
          return;
        }
        const acc = DG.game.account();
        if (acc.characters.some(c => c && c.name === name)) {
          errEl.textContent = '该账号下已有同名角色';
          return;
        }
        const char = DG.character.create(name, clsId);
        acc.characters[slotIndex] = char;
        DG.game.save();
        modal.close();
        DG.ui.toast(`角色「${name}」创建成功`, 'gold');
        DG.game.enterCharacter(slotIndex);
      });

      modal.foot.appendChild(btn);
      nameEl.focus();
      nameEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') btn.click();
      });
    }
  };
})();
