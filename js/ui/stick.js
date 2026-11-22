/* 浮动摇杆：主城与战斗共用同一套资源与交互
   - 平时隐藏，屏幕任意空白处按下才出现
   - 位置固定在屏幕中间靠下（样式见 combat-bar.css 的 .touch-ui）
   - 拖动以按下点为起点，摇杆头限制在半径内 */
(function () {
  const DG = window.DG;
  DG.ui = DG.ui || {};

  const R = 88;        // 最大拖动半径（逻辑像素）
  const DEAD = 0.18;   // 中心死区

  // root：监听与定位的根节点（720 逻辑宽）；opts.onMove(x,y) / opts.onEnd() / opts.ignore：不触发摇杆的选择器
  DG.ui.stick = function (root, opts) {
    const layer = root.querySelector('[data-touch]');
    const knob = root.querySelector('[data-knob]');
    if (!layer || !knob) return null;
    const ignore = opts.ignore || '';
    let id = null, origin = null, dead = false;

    const move = (ev) => {
      if (!origin || dead) return;
      const rect = root.getBoundingClientRect();
      // 舞台可能非等比铺满屏幕，横竖位移分别换算，保证摇杆方向与实际拖动一致
      const scaleX = rect.width / 720;
      const scaleY = rect.height / 1440;
      let dx = (ev.clientX - origin.x) / scaleX;
      let dy = (ev.clientY - origin.y) / scaleY;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = dx / len * R; dy = dy / len * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / R, ny = dy / R;
      opts.onMove(Math.abs(nx) < DEAD ? 0 : nx, Math.abs(ny) < DEAD ? 0 : ny);
    };

    const end = () => {
      if (id === null) return;
      id = null;
      origin = null;
      layer.classList.remove('on');
      knob.style.transform = 'translate(0px, 0px)';
      if (opts.onEnd) opts.onEnd();
    };

    const onDown = (ev) => {
      // 场景切换后旧摇杆已脱离文档，忽略残留监听
      if (!layer.isConnected || dead) return;
      if (!DG.settings.touchEnabled()) return;
      if (id !== null) return;
      if (root.querySelector('.modal-mask')) return;
      const hit = ev.target instanceof Element ? ev.target : null;
      if (hit && ignore && hit.closest(ignore)) return;
      ev.preventDefault();
      id = ev.pointerId;
      origin = { x: ev.clientX, y: ev.clientY };
      layer.classList.add('on');
      knob.style.transform = 'translate(0px, 0px)';
      opts.onMove(0, 0);
      try { root.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    };
    const onMove = (ev) => { if (id === ev.pointerId) move(ev); };
    const onUp = (ev) => { if (id === ev.pointerId) end(); };
    const onCancel = (ev) => { if (id === ev.pointerId) end(); };
    const onLost = () => { if (id !== null) end(); };

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onCancel);
    root.addEventListener('lostpointercapture', onLost);

    return {
      end,
      destroy() {
        dead = true;
        root.removeEventListener('pointerdown', onDown);
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerup', onUp);
        root.removeEventListener('pointercancel', onCancel);
        root.removeEventListener('lostpointercapture', onLost);
      }
    };
  };
})();
