/* 副本结算界面：按「战斗结算.psd」还原（720×1440） */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};
  const PSD_W = 720;
  // 结算停留倒计时，归零自动回主城
  const LEAVE_SECONDS = 10;
  // 旋涡门序列帧：6×4 共 24 帧，单帧 216×272，按 12fps 循环播放
  // 帧顺序已按画面相似度重排，循环首尾衔接平滑
  const PORTAL_SHEET = 'assets/ui/settle/portal-sheet.png?v=20261201';
  const PORTAL_COLS = 6;
  const PORTAL_ROWS = 4;
  const PORTAL_FRAMES = 24;
  const PORTAL_W = 216;
  const PORTAL_H = 272;
  const PORTAL_FPS = 12;
  // 提前把精灵图放进缓存，结算出现时首帧就绪
  const portalPreload = new Image();
  portalPreload.src = PORTAL_SHEET;

  ui.showSettlement = function (result, opts) {
    opts = opts || {};
    const victory = !!result.victory;
    const nextDef = opts.nextDef || null;
    const nextLabel = nextDef ? '进入下一关' : '返回主城';
    // 战斗内的拾取/升级提示不带到结算画面上
    const toastWrap = document.getElementById('toast-wrap');
    if (toastWrap) toastWrap.innerHTML = '';
    let left = LEAVE_SECONDS;
    let paused = false;
    let closed = false;

    const screen = U.el('div', 'st-screen' + (victory ? '' : ' fail'));
    screen.innerHTML = `
      <div class="st-canvas">
        <button class="st-pause clickable" data-st-pause>暂停</button>
        <button class="st-retreat clickable" data-st-retreat aria-label="撤退">
          <img src="assets/ui/settle/btn-retreat.png?v=20261129" alt="">
        </button>
        <div class="st-time">${victory ? '通关时长' : '本次时长'} <b>${U.timeText(result.time || 0)}</b></div>
        <img class="st-title" src="assets/ui/settle/${victory ? 'title-success' : 'title-fail'}.png?v=20261129" alt="">
        <div class="st-portal" data-st-portal></div>
        <div class="st-leave" data-st-leave>${U.timeText(LEAVE_SECONDS)}后离开</div>
        <button class="st-next clickable" data-st-next><span>${nextLabel}</span></button>
        <div class="st-card hidden" data-st-card>
          <div class="st-card-box">
            <h3>暂 停</h3>
            <button class="st-card-btn clickable" data-st-resume>继续</button>
            <button class="st-card-btn clickable" data-st-settings>操作设置</button>
          </div>
        </div>
      </div>`;
    const host = (DG.game && DG.game.ui) || document.getElementById('ui');
    if (host) host.appendChild(screen);
    const canvas = screen.querySelector('.st-canvas');
    const leaveEl = screen.querySelector('[data-st-leave]');
    const card = screen.querySelector('[data-st-card]');
    const portalEl = screen.querySelector('[data-st-portal]');
    let portalFrame = 0;
    const portalTimer = setInterval(() => {
      portalFrame = (portalFrame + 1) % PORTAL_FRAMES;
      const col = portalFrame % PORTAL_COLS;
      const row = Math.floor(portalFrame / PORTAL_COLS);
      portalEl.style.backgroundPosition = `${-col * PORTAL_W}px ${-row * PORTAL_H}px`;
    }, 1000 / PORTAL_FPS);

    // 与技能界面一致的 720×1440 画布适配：按舞台宽度等比缩放
    const layout = () => {
      const stage = document.getElementById('stage');
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
      const scale = dw / PSD_W;
      canvas.style.transform = `scale(${scale})`;
      canvas.style.left = ((dw - PSD_W * scale) / 2) + 'px';
      canvas.style.top = '0px';
    };
    layout();
    requestAnimationFrame(layout);
    window.addEventListener('resize', layout);

    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearInterval(portalTimer);
      window.removeEventListener('resize', layout);
      window.removeEventListener('keydown', onKey);
      if (screen.parentNode) screen.remove();
    };
    const leave = () => {
      close();
      if (opts.onReturn) opts.onReturn();
    };
    const goNext = () => {
      close();
      if (nextDef && opts.onNext) opts.onNext(nextDef);
      else leave();
    };

    const timer = setInterval(() => {
      if (paused || closed) return;
      left--;
      if (left <= 0) {
        leaveEl.textContent = U.timeText(0) + '后离开';
        leave();
        return;
      }
      leaveEl.textContent = U.timeText(left) + '后离开';
    }, 1000);

    screen.querySelector('[data-st-pause]').addEventListener('click', () => {
      paused = true;
      card.classList.remove('hidden');
    });
    screen.querySelector('[data-st-resume]').addEventListener('click', () => {
      card.classList.add('hidden');
      paused = false;
    });
    screen.querySelector('[data-st-settings]').addEventListener('click', () => {
      if (DG.ui.openControls) DG.ui.openControls();
    });
    screen.querySelector('[data-st-retreat]').addEventListener('click', leave);
    screen.querySelector('[data-st-next]').addEventListener('click', goNext);

    const onKey = (e) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (card.classList.contains('hidden')) {
        paused = true;
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
        paused = false;
      }
    };
    window.addEventListener('keydown', onKey);
  };
})();
