/* 操作设置：仅两套 —— 键鼠 / 手机模式 */
(function () {
  const DG = window.DG;
  const KEY = 'mistdark_controls_v1';

  const DEFAULTS = {
    inputMode: 'kbm',  // kbm 键鼠 | touch 手机模式
    audio: true,       // 天气环境音总开关
    ambientVol: 100,   // 天气环境音音量 0-100
    music: true        // 背景音乐（BGM）开关
  };

  const data = Object.assign({}, DEFAULTS);
  const isTouchDevice = () => {
    const points = Number(navigator.maxTouchPoints || 0);
    return points > 0 || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  };

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.inputMode === 'touch') data.inputMode = 'touch';
      if (saved && saved.audio === false) data.audio = false;
      if (saved && typeof saved.ambientVol === 'number') {
        data.ambientVol = Math.max(0, Math.min(100, saved.ambientVol));
      }
      if (saved && saved.music === false) data.music = false;
    } else if (isTouchDevice()) {
      data.inputMode = 'touch';
    }
  } catch (e) { /* 忽略损坏的本地设置 */ }

  const listeners = [];

  const settings = DG.settings = {
    DEFAULTS,

    get() {
      return Object.assign({}, data);
    },

    set(patch) {
      let changed = false;
      Object.keys(patch || {}).forEach(k => {
        if (k in data && data[k] !== patch[k]) {
          data[k] = patch[k];
          changed = true;
        }
      });
      if (changed) {
        settings.save();
        listeners.slice().forEach(fn => {
          try { fn(settings.get()); } catch (e) { /* 单个监听失败不影响其它 */ }
        });
      }
      return settings.get();
    },

    save() {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 忽略 */ }
    },

    touchEnabled(mode) {
      return (mode || data.inputMode) === 'touch';
    },

    onChange(fn) {
      listeners.push(fn);
      return function () {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }
  };
})();
