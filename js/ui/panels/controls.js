/* 操作设置面板 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  ui.openControls = function (onChanged) {
    const body = U.el('div');

    ui.modal({
      title: '设置',
      subtitle: '操作方式、音效与音乐，调整后立即生效并自动记住',
      body,
      width: 640
    });

    const groups = [
      {
        key: 'inputMode',
        title: '操作方式',
        desc: '键鼠：鼠标与键盘操作；手机模式：按住屏幕下方中间拖动移动。技能统一自动释放。',
        options: [
          ['kbm', '键鼠'],
          ['touch', '手机模式']
        ]
      }
    ];

    function render() {
      const cur = DG.settings.get();
      const segs = groups[0].options.map(o =>
        `<button class="seg-btn${cur.inputMode === o[0] ? ' sel' : ''}" data-val="${o[0]}">${o[1]}</button>`
      ).join('');
      const note = cur.inputMode === 'touch'
        ? `手机模式：按住屏幕下方中间拖动移动 · 技能栏与普攻自动释放`
        : `键鼠：WASD / 左键点地移动 · 鼠标瞄准 · 技能栏与普攻自动释放 · ESC 暂停`;
      const sfx = cur.audio !== false;
      const amb = typeof cur.ambientVol === 'number' ? cur.ambientVol : 100;
      const music = cur.music !== false;
      const screen = cur.screen || 'std';
      const screenOpts = [
        ['max', '最大屏'],
        ['short', '短屏'],
        ['std', '9:16']
      ];

      body.innerHTML =
        `<div class="setting-row">` +
          `<div class="setting-title">${groups[0].title}</div>` +
          `<div class="setting-desc">${groups[0].desc}</div>` +
          `<div class="seg">${segs}</div>` +
        `</div>` +
        `<div class="setting-row">` +
          `<div class="setting-title">屏幕尺寸</div>` +
          `<div class="setting-desc">仅竖版手机：最大屏 810×1680 · 短屏 720×1680 · 其他屏幕按 9:16（720×1440）。` +
          `场景固定按 810×1680 绘制，选小屏只裁掉边缘背景；界面保持 720×1440 居中不动。</div>` +
          `<div class="seg">` +
            screenOpts.map(o =>
              `<button class="seg-btn${screen === o[0] ? ' sel' : ''}" data-screen="${o[0]}">${o[1]}</button>`
            ).join('') +
          `</div>` +
        `</div>` +
        `<div class="setting-row">` +
          `<div class="setting-title">天气音效</div>` +
          `<div class="setting-desc">雨声、风声、雷声均由实时合成，无额外资源；关闭后完全静音。</div>` +
          `<div class="seg">` +
            `<button class="seg-btn${sfx ? ' sel' : ''}" data-audio="1">开启</button>` +
            `<button class="seg-btn${!sfx ? ' sel' : ''}" data-audio="0">关闭</button>` +
          `</div>` +
          `<div class="setting-range${sfx ? '' : ' disabled'}">` +
            `<input type="range" min="0" max="100" step="1" value="${amb}" data-amb aria-label="天气音量">` +
            `<span class="range-val" data-amb-val>${amb}%</span>` +
          `</div>` +
        `</div>` +
        `<div class="setting-row">` +
          `<div class="setting-title">背景音乐</div>` +
          `<div class="setting-desc">仅控制背景音乐（BGM）；界面音效与战斗音效不受影响。</div>` +
          `<div class="seg">` +
            `<button class="seg-btn${music ? ' sel' : ''}" data-music="1">开启</button>` +
            `<button class="seg-btn${!music ? ' sel' : ''}" data-music="0">关闭</button>` +
          `</div>` +
        `</div>` +
        `<div class="settings-note">${note}</div>`;

      body.querySelectorAll('.seg-btn[data-val]').forEach(btn => {
        btn.addEventListener('click', () => {
          DG.settings.set({ inputMode: btn.getAttribute('data-val') });
          render();
          if (onChanged) onChanged(DG.settings.get());
        });
      });
      body.querySelectorAll('.seg-btn[data-screen]').forEach(btn => {
        btn.addEventListener('click', () => {
          DG.settings.set({ screen: btn.getAttribute('data-screen') });
          if (DG.game && DG.game.applyScreen) DG.game.applyScreen();
          if (DG.ui && DG.ui.toast) DG.ui.toast('屏幕尺寸已切换', 'gold');
          render();
        });
      });
      body.querySelectorAll('.seg-btn[data-audio]').forEach(btn => {
        btn.addEventListener('click', () => {
          const on = btn.getAttribute('data-audio') === '1';
          DG.settings.set({ audio: on });
          if (DG.audio) DG.audio.setEnabled(on);
          render();
        });
      });
      body.querySelectorAll('.seg-btn[data-music]').forEach(btn => {
        btn.addEventListener('click', () => {
          const on = btn.getAttribute('data-music') === '1';
          DG.settings.set({ music: on });
          if (DG.audio) DG.audio.setMusicEnabled(on);
          render();
        });
      });
      // 天气音量滑块：拖动时实时改变响度，松手后再落盘保存
      const range = body.querySelector('[data-amb]');
      const rangeVal = body.querySelector('[data-amb-val]');
      if (range) {
        range.addEventListener('input', () => {
          const v = Number(range.value);
          if (rangeVal) rangeVal.textContent = v + '%';
          if (DG.audio) DG.audio.setAmbientVolume(v / 100);
        });
        range.addEventListener('change', () => {
          DG.settings.set({ ambientVol: Number(range.value) });
        });
      }
    }

    render();
  };
})();
