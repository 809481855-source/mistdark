/* 副本战斗 · 输入层：键鼠 / 触屏摇杆 / 操作模式切换 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
  bind() {
    this._onKeyDown = (e) => {
      // 手机模式下键鼠操作全部忽略，仅保留 ESC 暂停
      if (DG.settings.touchEnabled()) {
        if (e.code === 'Escape') this.togglePause();
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys[e.code] = true;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        this.autoMode = false;
        this.autoTarget = null;
        this.autoPack = null;
        this.autoSteer = null;
        this.autoEvade = null;
        this.autoBlocked = 0;
        this.autoDetour = null;
        this.autoDecision = null;
        this.syncAutoButton();
      }
      if (e.repeat) return;
      if (e.code === 'Escape') this.togglePause();
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onMouseMove = (e) => {
      if (DG.settings.touchEnabled()) return;
      const p = this.canvasPoint(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.moved = true;
      this.lastInput = 'mouse';
    };
    this._onMouseDown = (e) => {
      if (DG.settings.touchEnabled()) return;
      if (this.paused || this.ending || this.finished) return;
      const p = this.canvasPoint(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.moved = true;
      this.lastInput = 'mouse';
      if (e.button === 0) {
        this.autoMode = false;
        this.autoTarget = null;
        this.autoPack = null;
        this.autoSteer = null;
        this.autoEvade = null;
        this.autoBlocked = 0;
        this.autoDetour = null;
        this.autoDecision = null;
        this.syncAutoButton();
        // 小地图区域不参与走位；首领阶段小地图已屏蔽，不能再拦截点击
        const bossUp = this.monsters.some(m => m.boss && !m.dead);
        const R = DG.scenes.dungeon.minimapRect;
        if (!bossUp && p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h) return;
        // 左键点地走位：点在墙上或道具上时吸附到最近的可站立地面
        const w = this.screenToWorld(p);
        const target = this.nearestFreePoint(w.x, w.y, 4, this.player.r);
        if (!target) return;
        this.moveTarget = target;
        this.addRing(target.x, target.y, 4, 16, '#c9a25f', 0.35);
      } else if (e.button === 2) {
        e.preventDefault();
        this.attackHeld = true;
      }
    };
    this._onMouseUp = (e) => {
      // 仅在右键已松开时停止普攻，避免按住右键时点左键走位把连发打断
      if ((e.buttons & 2) === 0) this.attackHeld = false;
    };
    this._onBlur = () => {
      // 只清理按键与摇杆状态；暂停只由暂停键触发，失焦不再弹暂停框
      this.keys = {};
      this.attackHeld = false;
      this.moveVec.x = 0;
      this.moveVec.y = 0;
      this.stickId = null;
      if (this.$knob) this.$knob.style.transform = 'translate(0px, 0px)';
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    this.canvas.style.touchAction = 'none';
    this._onContextMenu = (e) => e.preventDefault();
    this.canvas.addEventListener('contextmenu', this._onContextMenu);

    // 技能栏只做冷却与状态展示，不再绑定手动释放
    this.hud.querySelector('[data-pause]').addEventListener('click', () => this.togglePause());
    this.hud.querySelector('[data-resume]').addEventListener('click', () => this.setPaused(false));
    this.hud.querySelector('[data-resume-close]').addEventListener('click', () => this.setPaused(false));
    this.hud.querySelector('[data-retreat]').addEventListener('click', () => {
      DG.ui.confirm('确定撤退回主城？已拾取的装备会保留，但本次击杀经验照常结算。', () => {
        this.retreat();
      }, { okText: '撤退', danger: true });
    });
    this.hud.querySelector('[data-settings]').addEventListener('click', () => DG.ui.openControls());

    this.bindTouchControls();
    this.applyControls();
    this._unsubSettings = DG.settings.onChange(() => this.applyControls());
  },
  bindTouchControls() {
    // 浮动摇杆：与主城共用同一套交互与样式；绑定在舞台上以覆盖画布区域的点击
    this._stick = DG.ui.stick(document.getElementById('stage'), {
      ignore: '.dg-top, .combat-bar, .auto-battle-btn, .pause-mask, .toast-wrap, .boss-wrap',
      onMove: (x, y) => {
        this.autoMode = false;
        this.autoTarget = null;
        this.autoPack = null;
        this.autoSteer = null;
        this.autoEvade = null;
        this.autoBlocked = 0;
        this.autoDetour = null;
        this.autoDecision = null;
        this.syncAutoButton();
        this.moveVec.x = x;
        this.moveVec.y = y;
        this.moveTarget = null;
        this.lastInput = 'touch';
      },
      onEnd: () => {
        this.moveVec.x = 0;
        this.moveVec.y = 0;
      }
    });
  },
  applyControls() {
    const touch = DG.settings.touchEnabled();
    if (this.$touch) this.$touch.classList.toggle('hidden', !touch);
    if (this.$pauseHint) this.$pauseHint.classList.toggle('hidden', touch);
    if (this.canvas) this.canvas.style.cursor = touch ? 'default' : 'crosshair';

    // 切换模式时立即清空残留输入
    this.keys = {};
    this.attackHeld = false;
    this.moveTarget = null;
    this.moveVec.x = 0;
    this.moveVec.y = 0;
    this.stickId = null;
    if (this.$touch) this.$touch.classList.remove('on');
    if (this.$knob) this.$knob.style.transform = 'translate(0px, 0px)';
    this.lastInput = touch ? 'touch' : 'mouse';
  },
  canvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    // 统一换算回 720×1440 逻辑坐标：渲染倍率只改后备像素，不参与坐标换算
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height)
    };
  },
  screenToWorld(p) {
    const z = this.zoom || 1;
    return {
      x: U.clamp((p.x - W / 2) / z + this.camera.x, 40, (this.arenaW || ARENA_W) - 40),
      y: U.clamp((p.y - H / 2) / z + this.camera.y, 40, (this.arenaH || ARENA_H) - 40)
    };
  },
  aimPos() {
    const z = this.zoom || 1;
    return {
      x: (this.mouse.x - W / 2) / z + this.camera.x,
      y: (this.mouse.y - H / 2) / z + this.camera.y
    };
  }
  });
})();
