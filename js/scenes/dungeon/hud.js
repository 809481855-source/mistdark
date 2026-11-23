/* 副本战斗 · HUD 层：界面构建、状态刷新、暂停与公告 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
  buildHud() {
    const el = U.el('div', 'dungeon-ui');
    const slots = this.skillList.map((sk, i) => {
      const cd = i === 0 ? '' : ` · 冷却 ${U.round(this.skillCooldown(sk), 1)}s`;
      const art = sk.icon
        ? `<img src="${sk.icon}" alt="">`
        : `<span class="strip-glyph">${sk.glyph}</span>`;
      return `<div class="strip-slot" data-slot="${i}" title="${U.escapeHtml(sk.name)}${cd}">` +
        art +
        `<div class="cd" data-cd="${i}"></div>` +
        `<div class="cdtext" data-cdt="${i}"></div>` +
      `</div>`;
    }).join('');
    // 技能图标全职业共用，装备图标按职业取用
    const skillIcon = DG.data.iconFor(this.char.cls, 'skill');
    const equipIcon = DG.data.iconFor(this.char.cls, 'equip');
    el.innerHTML = `
      <div class="dg-top">
        <div class="dg-progress">
          <img class="dp-plate" src="assets/ui/battle/progress-plate.png?v=20261122m" alt="">
          <span class="dp-hourglass-glow"><img class="dp-hourglass" src="assets/ui/battle/progress-hourglass.png?v=20261122m" alt=""></span>
          <div class="dp-track"><i data-zone-fill></i></div>
          <div class="dp-text"><span data-wave>准备中</span></div>
        </div>
        <div class="dg-map">
          <div class="dm-frame"></div>
          <div class="dm-name"><span>普通</span><b data-stage-name>${U.escapeHtml(this.def.name)}</b></div>
          <div class="dm-explore" data-explore>探索 0%</div>
        </div>
        <button class="pause-btn clickable" data-pause aria-label="暂停">暂停</button>
      </div>
      <div class="boss-wrap hidden" data-boss-wrap>
        <img class="boss-frame" src="assets/ui/battle/boss-frame.png" alt="">
        <img class="boss-head" src="assets/ui/battle/boss-head.png" alt="">
        <div class="boss-name" data-boss-name></div>
        <div class="boss-bar">
          <img class="boss-bar-bg" src="assets/ui/battle/boss-bar-bg.png" alt="">
          <span class="boss-bar-track"><i data-boss-fill></i></span>
          <span class="boss-hp" data-boss-hp></span>
        </div>
      </div>
      <div class="boss-compass hidden" data-boss-compass>
        <span class="bc-arrow" data-bc-arrow>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L22 22 L12 17 L2 22 Z"/></svg>
        </span>
        <span data-bc-text>首领</span>
      </div>
      <div class="dungeon-announce" data-announce></div>
      <button class="auto-battle-btn clickable" data-auto aria-pressed="false" aria-label="自动战斗">
        <img src="assets/ui/common/btn-auto.png" alt="">
        <span>自动</span>
      </button>
      <div class="dg-bottom">
        ${DG.ui.combatBarHtml({
          equipIcon, equipAttrs: 'data-open-equip',
          skillIcon, skillAttrs: 'data-open-skills',
          badgeAttrs: 'data-open-char',
          level: this.char.level,
          slotsHtml: slots,
          expFill: '<i class="exp-fill" data-xp></i>',
          expText: ''
        })}
      </div>

      <div class="touch-ui hidden" data-touch>
        <div class="stick-base"></div>
        <div class="stick-knob" data-knob></div>
      </div>

      <div class="pause-mask hidden" data-pause-mask>
        <div class="pause-card">
          <button class="modal-close clickable" data-resume-close aria-label="继续战斗"></button>
          <div class="modal-head">
            <h3>暂 停</h3>
            <p class="sub">${U.escapeHtml(this.def.name)} · 已拾取物品会保留</p>
          </div>
          <div class="modal-body">
            <button class="btn primary clickable" data-resume>继续战斗</button>
            <button class="btn clickable" data-settings>操作设置</button>
            <button class="btn danger clickable" data-retreat>撤退回主城</button>
            <div class="hint" data-pause-hint>按 ESC 继续</div>
          </div>
        </div>
      </div>`;
    this.root.replaceChildren(el);
    const toastWrap = document.getElementById('toast-wrap');
    if (toastWrap) {
      toastWrap.classList.remove('over-modal');
      toastWrap.classList.add('in-battle');
    }
    this.hud = el;
    // 小地图的实际外框：画布按 810×1680 绘制后再缩放进舞台，
    // 绘制与点击拦截都要以这个 DOM 外框为准，否则会出现地图和外框错位
    this.$map = el.querySelector('.dg-map');
    this.$wave = el.querySelector('[data-wave]');
    this.$explore = el.querySelector('[data-explore]');
    this.$compass = el.querySelector('[data-boss-compass]');
    this.$compassArrow = el.querySelector('[data-bc-arrow]');
    this.$compassText = el.querySelector('[data-bc-text]');
    this.$announce = el.querySelector('[data-announce]');
    this.$lvl = el.querySelector('[data-open-char]');
    this.$xp = el.querySelector('[data-xp]');
    this.$zoneFill = el.querySelector('[data-zone-fill]');
    this.$hourglass = el.querySelector('.dp-hourglass');
    this.$bossWrap = el.querySelector('[data-boss-wrap]');
    this.$bossName = el.querySelector('[data-boss-name]');
    this.$bossFill = el.querySelector('[data-boss-fill]');
    this.$bossHp = el.querySelector('[data-boss-hp]');
    this.$pauseMask = el.querySelector('[data-pause-mask]');
    this.$cd = Array.from(el.querySelectorAll('[data-cd]'));
    this.$cdt = Array.from(el.querySelectorAll('[data-cdt]'));
    this.$touch = el.querySelector('[data-touch]');
    this.$pauseHint = el.querySelector('[data-pause-hint]');
    this.$knob = el.querySelector('[data-knob]');
    this.$auto = el.querySelector('[data-auto]');
    this.$xpPct = el.querySelector('[data-xp-pct]');
    this.$xpNum = el.querySelector('[data-xp-num]');
    // 底部两端功能键：打开面板时静默暂停战斗，关闭后自动继续
    el.querySelector('[data-open-equip]').addEventListener('click', () => {
      this.openPanel(done => DG.ui.openEquipment(this.char, () => this.updateHud(), { onClose: done }));
    });
    el.querySelector('[data-open-skills]').addEventListener('click', () => {
      this.openPanel(done => DG.ui.openSkills(this.char, () => this.updateHud(), { onClose: done }));
    });
    // 等级牌：与主城一致，点开角色信息
    el.querySelector('[data-open-char]').addEventListener('click', () => {
      this.openPanel(done => DG.ui.openCharacterInfo(this.char, { onClose: done }));
    });
    // 中间技能格同样可查看技能详情（战斗期间静默暂停）
    el.querySelectorAll('.strip-slot[data-slot]').forEach(slot => {
      slot.addEventListener('click', () => {
        this.openPanel(done => DG.ui.openSkills(this.char, () => this.updateHud(), { onClose: done }));
      });
    });
    this.$auto.addEventListener('click', () => this.toggleAutoMode());
    this.syncAutoButton();
    this.updateWaveText();
  },
  toggleAutoMode() {
    if (this.finished || this.ending || this.paused) return;
    this.autoMode = !this.autoMode;
    this.autoTarget = null;
    this.autoPack = null;
    this.moveTarget = null;
    this.moveVec.x = 0;
    this.moveVec.y = 0;
    this.attackHeld = false;
    this.autoSteer = null;
    this.autoEvade = null;
    this.autoHoldingRange = false;
    this.autoBlocked = 0;
    this.autoDetour = null;
    this.autoDecision = null;
    this.syncAutoButton();
    this.announce(this.autoMode ? '自动战斗已开启' : '自动战斗已关闭', 1100);
  },
  syncAutoButton() {
    if (!this.$auto) return;
    this.$auto.classList.toggle('active', !!this.autoMode);
    this.$auto.setAttribute('aria-pressed', this.autoMode ? 'true' : 'false');
  },
  // 打开养成面板期间暂停战斗，关闭面板后恢复（不弹暂停卡）
  openPanel(open) {
    if (this.finished || this.ending || this._panelOpen) return;
    this._panelOpen = true;
    const wasPaused = this.paused;
    if (!wasPaused) this.setPaused(true, true);
    open(() => {
      this._panelOpen = false;
      if (!wasPaused) this.setPaused(false);
    });
  },
  togglePause() {
    if (this.finished || this.ending || this._panelOpen) return;
    this.setPaused(!this.paused);
  },
  setPaused(v, silent) {
    this.paused = v;
    // 音乐/环境音跟随战斗状态同步压低与恢复
    if (DG.audio && DG.audio.setBattlePaused) DG.audio.setBattlePaused(v);
    this.$pauseMask.classList.toggle('hidden', !v || !!silent);
    if (v) {
      this.attackHeld = false;
      this.moveVec.x = 0;
      this.moveVec.y = 0;
      this.stickId = null;
      this.moveTarget = null;
      if (this.$knob) this.$knob.style.transform = 'translate(0px, 0px)';
    }
  },
  announce(text, dur) {
    if (!this.$announce) return;
    this.$announce.textContent = text;
    this.$announce.classList.add('show');
    clearTimeout(this._annTimer);
    this._annTimer = setTimeout(() => {
      if (this.$announce) this.$announce.classList.remove('show');
    }, dur || 1800);
  },
  updateWaveText() {
    if (!this.$wave) return;
    const goal = this.bossKillGoal || 0;
    const kills = this.kills || 0;
    if (this.phase === 'bossIntro' || this.phase === 'boss') {
      this.$wave.textContent = '首领战';
    } else {
      const zone = this.currentChunk() + 1;
      const total = (this.chunks || []).length;
      const killText = goal
        ? `击杀${Math.min(kills, goal)}/${goal}`
        : `击杀${kills}`;
      this.$wave.textContent = `第${zone}/${total}区· ${killText}`;
    }
    if (this.$zoneFill) {
      const pct = goal ? U.clamp(kills / goal, 0, 1) : 0;
      this.$zoneFill.style.width = (pct * 100) + '%';
    }
  },
  // HUD 每 0.1 秒刷新：值没变化就不写 DOM，省掉重复的文本节点重建与样式重算
  setHudText(el, key, text) {
    if (!el) return;
    const c = this._hudCache || (this._hudCache = {});
    if (c[key] === text) return;
    c[key] = text;
    el.textContent = text;
  },
  setHudStyle(el, key, prop, value) {
    if (!el) return;
    const c = this._hudCache || (this._hudCache = {});
    if (c[key] === value) return;
    c[key] = value;
    el.style[prop] = value;
  },
  // 等级牌：pop=true 时重放一次弹跳发光，连续升级也能看到反馈
  syncLevelBadge(level, pop) {
    if (!this.$lvl) return;
    this._badgeLevel = level;
    this.$lvl.textContent = level;
    if (!pop) return;
    this.$lvl.classList.remove('lvl-pop');
    // 读一次布局强制重排，保证同一帧内重加类名也能重新触发动画
    void this.$lvl.offsetWidth;
    this.$lvl.classList.add('lvl-pop');
  },
  findBoss() {
    for (const m of this.monsters) {
      if (m.boss && !m.dead) return m;
    }
    return null;
  },
  updateHud() {
    if (!this.hud) return;
    const need = DG.character.xpNeed(this.char.level);
    // 经验在击杀时已实时写入角色，升级会同步扣减，这里直接读当前值即可
    const xp = this.char.xp;
    const xpPct = U.clamp(xp / need, 0, 1);
    this.setHudStyle(this.$xp, 'xpWidth', 'width', (xpPct * 100) + '%');
    this.setHudText(this.$xpPct, 'xpPct', Math.round(xpPct * 100) + '%');
    this.setHudText(this.$xpNum, 'xpNum', `${U.fmt(xp)} / ${U.fmt(need)}`);
    this.setHudText(this.$explore, 'explore', `探索 ${Math.round(this.explorePct() * 100)}%`);
    // 等级牌兜底同步：升级表现由 onLevelUp 触发弹跳，这里只保证数值不落后
    if (this.$lvl && this._badgeLevel !== this.char.level) {
      this._badgeLevel = this.char.level;
      this.syncLevelBadge(this.char.level, false);
    }

    // 一次遍历同时供血条与指南针使用，避免每次刷新扫描两遍怪物列表
    const boss = this.findBoss();
    this.updateCompass(boss);

    // 沙漏由帧循环驱动旋转（10 秒一圈），不依赖 CSS 动画，避免与光晕动画抢占合成层
    if (this.$hourglass) {
      this.$hourglass.style.transform = `rotate(${((performance.now() / 10000) * 360) % 360}deg)`;
    }

    this.setCd(0, this.attackCd, 1 / this.attackSpeedNow());
    for (let i = 1; i < this.skillList.length; i++) {
      const sk = this.skillList[i];
      // 冲锋冷却可被连晕累积缩短，HUD 满值同步扣除，避免圆环起手就不满
      let cdMax = this.skillCooldown(sk) || sk.cooldown || 1;
      if (sk.id === 'charge' && this.chargeCdrBonus) cdMax = Math.max(0.5, cdMax - this.chargeCdrBonus);
      this.setCd(i, this.skillCd[i], cdMax);
    }

    // 首领血条出现时屏蔽关卡进度与小地图，避免顶部信息互相遮挡
    const bossState = boss
      ? 'on' + (boss.enraged ? 'e' : '') + (boss.hp / boss.maxHp <= 0.3 ? 'l' : '')
      : 'off';
    if (this._bossState !== bossState) {
      this._bossState = bossState;
      this.hud.classList.toggle('boss-mode', !!boss);
      if (boss) {
        this.$bossWrap.classList.remove('hidden');
        this.$bossWrap.classList.toggle('enraged', !!boss.enraged);
        this.$bossWrap.classList.toggle('low', boss.hp / boss.maxHp <= 0.3);
      } else {
        this.$bossWrap.classList.add('hidden');
        this.$bossWrap.classList.remove('enraged');
        this.$bossWrap.classList.remove('low');
      }
    }
    if (boss) {
      this.setHudStyle(this.$bossFill, 'bossFill', 'width', (U.clamp(boss.hp / boss.maxHp, 0, 1) * 100) + '%');
      this.setHudText(this.$bossName, 'bossName', boss.name + (boss.enraged ? ' · 狂暴' : ''));
      this.setHudText(this.$bossHp, 'bossHp', `${Math.max(0, Math.ceil(boss.hp))}/${Math.ceil(boss.maxHp)}`);
    }
  },
  updateCompass(boss) {
    if (!this.$compass) return;
    if (boss === undefined) boss = this.findBoss();
    const hidden = !boss;
    if (this._compassHidden !== hidden) {
      this._compassHidden = hidden;
      this.$compass.classList.toggle('hidden', hidden);
    }
    if (!boss) return;
    const d = U.dist(this.player, boss);
    const ang = U.angle(this.player, boss);
    // 箭头默认朝上，顺时针旋转到目标方位
    this.setHudStyle(this.$compassArrow, 'compassArrow', 'transform', `rotate(${ang + Math.PI / 2}rad)`);
    this.setHudText(this.$compassText, 'compassText', `首领 · ${DG.scenes.dungeon.dirName(ang)} ${Math.round(d)} 码`);
  },
  setCd(index, remain, total) {
    const el = this.$cd[index];
    const txt = this.$cdt[index];
    if (!el) return;
    const ratio = total > 0 ? U.clamp(remain / total, 0, 1) : 0;
    this.setHudStyle(el, 'cd' + index, 'transform', `scaleY(${ratio})`);
    this.setHudText(txt, 'cdt' + index, remain > 0.15 ? (remain >= 1 ? Math.ceil(remain) : remain.toFixed(1)) : '');
    const ready = remain <= 0.01;
    const c = this._hudCache || (this._hudCache = {});
    const key = 'cdr' + index;
    if (c[key] !== ready) {
      c[key] = ready;
      if (el.parentNode) el.parentNode.classList.toggle('ready', ready);
    }
  }
  });
})();
