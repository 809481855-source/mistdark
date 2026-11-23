/* 自动生成：按 index.html 顺序合并全部脚本，勿手改 */
/* ==== js/core/utils.js ==== */
/* 通用工具函数 */
(function () {
  const DG = window.DG = window.DG || {};
  const U = DG.util = {};

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 可注入随机源：测试用固定种子即可复现整张地图
  let _random = Math.random;
  U.seed = (n) => {
    let s = (n >>> 0) || 0x9e3779b9;
    _random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return U;
  };
  U.unseed = () => { _random = Math.random; return U; };
  U.random = () => _random();

  U.rand = (a, b) => a + U.random() * (b - a);
  U.randInt = (a, b) => Math.floor(a + U.random() * (b - a + 1));
  U.chance = (p) => U.random() < p;
  U.pick = (arr) => arr[Math.floor(U.random() * arr.length)];
  U.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  U.dist2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.clampAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  U.angleDiff = (a, b) => Math.abs(U.clampAngle(a - b));

  // 点到线段距离
  U.distToSegment = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  U.round = (v, d = 0) => {
    const m = Math.pow(10, d);
    return Math.round(v * m) / m;
  };

  // 数字格式化：1234 -> 1,234
  U.fmt = (v) => {
    if (v === null || v === undefined || isNaN(v)) return '0';
    const n = Math.round(v);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  U.uid = (function () {
    let n = 0;
    return () => 'it' + (++n) + '_' + Math.random().toString(36).slice(2, 7);
  })();

  U.escapeHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // 加权随机：items = [{weight, ...}]
  U.weighted = (items, weightKey = 'weight') => {
    let total = 0;
    for (const it of items) total += (it[weightKey] || 0);
    let r = U.random() * total;
    for (const it of items) {
      r -= (it[weightKey] || 0);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  };

  U.el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  U.timeText = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
})();


;
/* ==== js/core/assets.js ==== */
/* 资源包：把大量散图合并成少数几个 .pk 包，首屏只发几次请求。
   构建期由 tools/pack-assets.py 生成索引（build-static 内联进 index.html）：
     { packs: { 名称: { f: 包路径, s: 字节数 } },
       files: { 'assets/monsters/wolf.png': { p: 包名, o: 偏移, l: 长度, t: 'png'|'webp'|'jpg' } } }
   运行时把包内切片包成 Blob，再转 blob: URL 交给 Image：
     · 请求数从「每张图一次」降到「每个包一次」
     · 图片仍是标准图片流，naturalWidth / drawImage / decode 行为完全不变
   file:// 双击打开时不能 fetch，自动回落到原始散图，开发体验不变。 */
(function () {
  const DG = window.DG;
  const IDX = window.__DG_PACKS__ || null;
  const enabled = !!(IDX && IDX.packs && IDX.files && location.protocol !== 'file:');

  const packs = {};   // 包名 -> { buf, loading, failed, waiters }
  const urls = {};    // 规范化路径 -> blob url

  // 包文件前 16 字节是内容指纹：旧索引（页面缓存）+ 新包时必须能立刻识别出来
  const HEAD = 16;

  const norm = (p) => String(p).split('?')[0].split('#')[0];
  const mimeOf = (t) => t === 'webp' ? 'image/webp'
    : (t === 'jpg' || t === 'jpeg') ? 'image/jpeg' : 'image/png';

  function headOf(buf) {
    const view = new Uint8Array(buf, 0, HEAD);
    let s = '';
    for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
    return s;
  }

  function slot(name) {
    return packs[name] || (packs[name] = { buf: null, loading: false, failed: false, waiters: [] });
  }

  function flush(s) {
    const list = s.waiters.splice(0);
    for (const fn of list) {
      try { fn(); } catch (e) { /* 单个回调失败不影响其它 */ }
    }
  }

  function loadPack(name) {
    if (!enabled) return;
    const def = IDX.packs[name];
    if (!def) return;
    const s = slot(name);
    if (s.buf || s.loading || s.failed) return;
    s.loading = true;
    fetch(def.f).then((r) => {
      if (!r.ok) throw new Error('pack ' + name + ' ' + r.status);
      return r.arrayBuffer();
    }).then((buf) => {
      if (!def.tag || buf.byteLength <= HEAD || headOf(buf) !== def.tag) {
        throw new Error('pack ' + name + ' tag mismatch');
      }
      s.buf = buf;
      s.loading = false;
      flush(s);
    }).catch(() => {
      // 取包失败（弱网 / 离线）：回落到原始图片文件，玩法不受影响
      s.loading = false;
      s.failed = true;
      flush(s);
    });
  }

  // 已就绪返回可用地址；未就绪返回空串（并顺手开始拉包）
  function urlOf(path) {
    if (!enabled) return path;
    const key = norm(path);
    const cached = urls[key];
    if (cached) return cached;
    const e = IDX.files[key];
    if (!e) return path;            // 不在包内（CSS / 内联 HTML 直接用原图）
    const s = packs[e.p];
    if (s && s.failed) return path;
    if (!s || !s.buf) { loadPack(e.p); return ''; }
    const blob = new Blob([s.buf.slice(HEAD + e.o, HEAD + e.o + e.l)], { type: mimeOf(e.t) });
    urls[key] = URL.createObjectURL(blob);
    return urls[key];
  }

  DG.assets = {
    packEnabled: enabled,

    // 给已有 Image 设置地址：包就绪前不赋值，避免先打一次散图请求
    assign(img, path) {
      const u = urlOf(path);
      if (u) { img.src = u; return; }
      const e = IDX.files[norm(path)];
      slot(e.p).waiters.push(() => {
        const ready = urlOf(path);
        img.src = ready || path;
      });
      loadPack(e.p);
    },

    // 提前拉某个资源所在的包：进场景前预热，避免集中解码
    preload(path) {
      if (!enabled) return;
      const e = IDX.files[norm(path)];
      if (e) loadPack(e.p);
    },

    packNames() { return enabled ? Object.keys(IDX.packs) : []; }
  };
})();


;
/* ==== js/core/storage.js ==== */
/* 本地存档：账号 / 角色数据（localStorage） */
(function () {
  const DG = window.DG;
  const KEY = 'mistdark_save_v1';

  const emptyDB = () => ({ version: 1, accounts: {} });

  const storage = DG.storage = {
    KEY,
    available: true,

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return emptyDB();
        const db = JSON.parse(raw);
        if (!db || typeof db !== 'object' || !db.accounts) return emptyDB();
        return db;
      } catch (e) {
        storage.available = false;
        console.warn('[存档] 读取失败，本次使用临时存档', e);
        return emptyDB();
      }
    },

    save(db) {
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
        return true;
      } catch (e) {
        storage.available = false;
        console.warn('[存档] 写入失败，本次进度仅在页面内有效', e);
        return false;
      }
    },

    getAccount(db, name) {
      return (db.accounts && db.accounts[name]) || null;
    },

    validateName(name) {
      if (!name) return '请输入账号';
      if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,12}$/.test(name)) return '账号需 2-12 位字母 / 数字 / 下划线 / 中文';
      return '';
    },

    createAccount(db, name, pass) {
      const nameErr = storage.validateName(name);
      if (nameErr) return { ok: false, msg: nameErr };
      if (!/^\d{3,12}$/.test(pass || '')) return { ok: false, msg: '密码需为 3-12 位数字' };
      if (db.accounts[name]) return { ok: false, msg: '该账号已存在，可直接登录' };
      db.accounts[name] = {
        password: pass,
        createdAt: Date.now(),
        characters: [null, null, null],
        activeChar: 0
      };
      return { ok: true };
    },

    login(db, name, pass) {
      if (!name) return { ok: false, msg: '请输入账号' };
      const acc = storage.getAccount(db, name);
      if (!acc) return { ok: false, msg: '账号不存在，请先注册' };
      if (acc.password !== pass) return { ok: false, msg: '密码错误' };
      // 兼容旧存档
      if (!Array.isArray(acc.characters)) acc.characters = [null, null, null];
      while (acc.characters.length < 3) acc.characters.push(null);
      return { ok: true, account: acc };
    }
  };
})();


;
/* ==== js/core/settings.js ==== */
/* 操作设置：仅两套 —— 键鼠 / 手机模式 */
(function () {
  const DG = window.DG;
  const KEY = 'mistdark_controls_v1';

  const DEFAULTS = {
    inputMode: 'kbm',  // kbm 键鼠 | touch 手机模式
    audio: true,       // 天气环境音总开关
    ambientVol: 100,   // 天气环境音音量 0-100
    music: true,       // 背景音乐（BGM）开关
    screen: 'std'      // max 810×1680 | short 720×1680 | std 9:16 720×1440
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
      if (saved && (saved.screen === 'max' || saved.screen === 'short' || saved.screen === 'std')) {
        data.screen = saved.screen;
      }
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


;
/* ==== js/core/audio.js ==== */
/* 音效层：
   1) 天气环境音：Web Audio 实时合成，不依赖音频文件
   2) 解包资源音效 / 背景音乐：读取 assets/audio/ 下的 mp3
   浏览器要求首次用户手势后才能出声，因此统一在 pointerdown / keydown 时解锁 */
(function () {
  const DG = window.DG;
  const A = DG.audio = {};

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let amb = null;          // 当前环境音 { gain, nodes }
  let current = null;      // 当前天气 id（未解锁时先记住，解锁后补播）
  let unlocked = false;
  let enabled = true;
  // 环境音整体音量：天气底噪只做氛围铺垫，压在主音量之下不抢战斗音效
  const AMB_LEVEL = 0.2;
  let ambVol = 1;          // 天气音量倍率（设置里的滑块，0-1）
  let musicOn = true;      // 背景音乐开关（不影响界面与战斗音效）
  try {
    const s = DG.settings && DG.settings.get ? DG.settings.get() : null;
    if (s) {
      enabled = s.audio !== false;
      if (typeof s.ambientVol === 'number') ambVol = Math.max(0, Math.min(1, s.ambientVol / 100));
      if (s.music === false) musicOn = false;
    }
  } catch (e) { /* 忽略读取失败 */ }

  // 天气音效当前应输出的增益（暂停战斗时压到 0）
  const ambLevel = () => AMB_LEVEL * ambVol;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.42 : 0;
    master.connect(ctx.destination);
    // 2 秒白噪声，所有环境音共用一份，省内存也省生成开销
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 系统抢占音频焦点（来电、其他应用播放、蓝牙切换）会让上下文自己挂起：
    // 只要页面在前台，就立刻尝试恢复，不等下一次手势
    ctx.onstatechange = () => {
      if (!ctx || document.hidden) return;
      if (ctx.state === 'closed') { rebuild(); return; }
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
        return;
      }
      // 从挂起/中断恢复：部分内核中断后旧的 BufferSource 不会续播，
      // 这里重建长音频源，避免“上下文 running 但一片安静”
      reviveLongSources();
    };
    return ctx;
  }

  function noiseSource() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  }

  function unlock() {
    if (unlocked) { wakeAudio(); return; }
    const c = ensure();
    unlocked = true;
    if (c && c.state !== 'running') c.resume().catch(() => {});
    if (current) buildAmbient(current);
    preloadAll();
    resumeBgm();
  }

  // 系统可能在任何时候挂起音频上下文（来电、锁屏、息屏、切后台、系统省电）
  function ensureRunning() {
    if (!ctx) return;
    if (ctx.state === 'closed') { rebuild(); return; }
    if (ctx.state === 'running') return;
    const p = ctx.resume();
    if (p && p.catch) p.catch(() => {});
  }

  /* ---------------- 回前台 / 解锁后的强制恢复 ----------------
     浏览器最小化、切换应用、锁屏、音频焦点被抢占后，AudioContext 常常停在
     suspended / interrupted，单次 resume() 也可能被拒绝。这里做三件事：
       1) 等待挂起操作真正结束，再发 resume，避免 suspend/resume 竞态
       2) 连续重试，直到上下文回到 running
       3) 恢复成功后校验 BGM / 环境音节点，必要时重新起播，做到“回来必有声” */
  let suspendPromise = null;
  let wakeSeq = 0;
  let rebuilding = false;
  let lastRebuildAt = 0;
  // 连续重建次数：上下文被系统反复拒绝恢复时限流，避免一直新建音频图耗电
  let rebuildStreak = 0;

  function suspendAudio() {
    if (ctx && unlocked && ctx.state === 'running') {
      const p = ctx.suspend();
      // 记录挂起 Promise：回前台时先等它落地，防止“先 resume 又被旧 suspend 挂起”
      suspendPromise = p && p.then ? p.then(() => {}, () => {}) : Promise.resolve();
    }
    if (bgmEl) bgmEl.pause();
  }

  // 恢复成功后，确认背景音乐与环境音确实在响
  function hardRecover(force) {
    if (!ctx || (!force && document.hidden) || ctx.state !== 'running') return;
    rebuildStreak = 0;
    // 主音量被异常事件压死（来电 / 蓝牙切换中途）时补回，避免“上下文在跑却没声”
    if (master && enabled && master.gain.value < 0.05) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.42, t + 0.2);
    }
    if (enabled && musicOn && bgmKey) {
      if (bgmNodes.src) {
        const g = bgmNodes.gain && bgmNodes.gain.gain;
        // 增益被意外压死或上下文被系统重建：重新起播当前曲目
        if (!g || g.value < 0.005) startBgmNode(bgmKey, BGM_FADE);
      } else if (bgmEl) {
        if (bgmEl.paused) {
          const p = bgmEl.play();
          if (p && p.catch) p.catch(() => {});
        }
      } else if (bgmFailed[bgmKey] && !bgmBroken[bgmKey]) {
        playBgmHtml(bgmKey);
      } else {
        loadBgm(bgmKey);
      }
    }
    if (current) {
      if (!amb) buildAmbient(current);
      else if (!battlePaused) {
        const g = amb.gain.gain;
        // 只在环境音明显偏低时补拉，避免看门狗每轮都重排渐变
        if (g.value < ambLevel() * 0.5) fadeGain(g, ambLevel(), 300);
      }
    }
  }

  function wakeAudio(force) {
    // force=true 来自用户手势：此时用户就在前台操作，即使 visibility 状态还没刷新
    // （部分手机内核回到前台时先派发 focus 再更新 visible）也必须立刻恢复
    const blocked = () => !force && document.hidden;
    if (blocked()) return;
    if (!ctx) {
      // 上下文丢失但曾经解锁过：直接重建，保证下一次音效有输出
      if (unlocked) rebuild();
      return;
    }
    // 是否处于被系统挂起/中断状态：恢复后需要重建长音频播放源。
    // 部分手机内核中断后不会让旧的 BufferSource 自动续播，
    // 表现就是上下文 running、界面正常，但 BGM 和环境音彻底没声。
    const wasAsleep = ctx.state !== 'running';
    // 在手势回调栈内同步 resume 一次：严格自动播放策略（iOS Safari / 省电模式）
    // 只认手势里发出的 resume，延迟到 Promise 里再调会被拒绝
    if (ctx.state !== 'running' && ctx.state !== 'closed') {
      try {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* 忽略 */ }
    }
    const token = ++wakeSeq;
    const pending = suspendPromise;
    suspendPromise = null;
    // 页面被冻结时 suspend() 的 Promise 可能永远不落地，最多等 500ms 就继续尝试恢复
    const wait = pending
      ? Promise.race([pending, new Promise(r => setTimeout(r, 500))])
      : Promise.resolve();
    wait.then(() => {
      if (token !== wakeSeq || blocked()) return;
      if (!ctx) return;
      if (ctx.state === 'closed') { rebuild(); return; }
      let tries = 0;
      const attempt = () => {
        if (token !== wakeSeq || blocked()) return;
        if (!ctx) return;
        if (ctx.state === 'closed') { rebuild(); return; }
        if (ctx.state === 'running') {
          if (wasAsleep) reviveLongSources();
          hardRecover(force);
          return;
        }
        // 不能依赖 resume() 的 Promise：页面被冻结 / 音频焦点被抢占时
        // 该 Promise 可能永远不落地，必须靠定时器自己重试
        try {
          const p = ctx.resume();
          if (p && p.then) p.then(() => {
            if (token === wakeSeq && !blocked() && ctx && ctx.state === 'running') {
              if (wasAsleep) reviveLongSources();
              hardRecover(force);
            }
          }, () => {});
        } catch (e) { /* 旧内核没有 resume */ }
        tries++;
        if (tries <= 5) {
          setTimeout(attempt, 160 * tries);
        } else if (!blocked() && Date.now() - lastRebuildAt > 2500 &&
                   (rebuildStreak < 4 || Date.now() - lastRebuildAt > 30000)) {
          // 重试仍拿不回来：上下文已卡死，换一张新的音频图（含 BGM / 环境音补播）
          rebuild();
        }
      };
      attempt();
    });
  }

  // 上下文被浏览器彻底关闭（bfcache 恢复、系统回收）：重建音频图并补播
  function rebuild() {
    if (rebuilding) return;
    rebuilding = true;
    lastRebuildAt = Date.now();
    rebuildStreak++;
    try {
      if (ctx && ctx.close) {
        const p = ctx.close();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* 已关闭 */ }
    ctx = null;
    master = null;
    noiseBuf = null;
    sfxBus = null;
    musicBus = null;
    amb = null;
    bgmNodes = { key: null, src: null, gain: null, bornAt: 0 };
    Object.keys(buffers).forEach(k => delete buffers[k]);
    Object.keys(failed).forEach(k => delete failed[k]);
    Object.keys(lastPlay).forEach(k => delete lastPlay[k]);
    Object.keys(htmlPool).forEach(k => delete htmlPool[k]);
    Object.keys(bgmBuffers).forEach(k => delete bgmBuffers[k]);
    Object.keys(bgmLoop).forEach(k => delete bgmLoop[k]);
    Object.keys(bgmLoading).forEach(k => delete bgmLoading[k]);
    Object.keys(bgmFailed).forEach(k => delete bgmFailed[k]);
    Object.keys(bgmBroken).forEach(k => delete bgmBroken[k]);
    preloadQueue.length = 0;
    preloadActive = 0;
    if (enabled) {
      const c = ensure();
      if (c) {
        unlocked = true;
        if (c.state !== 'running') c.resume().catch(() => {});
        preloadAll();
        if (current) buildAmbient(current);
        resumeBgm();
      }
    }
    rebuilding = false;
  }

  let lastReviveAt = 0;
  // 中断恢复后重建长音频播放源：BGM 与环境音的 BufferSource 在部分手机内核上
  // 被系统中断后不会自动续播（上下文 running 但没声），只能重新创建节点
  function reviveLongSources() {
    if (!ctx || ctx.state !== 'running' || !unlocked || !enabled) return;
    const now = Date.now();
    if (now - lastReviveAt < 1200) return;
    lastReviveAt = now;
    if (bgmKey && musicOn && !bgmEl) {
      // startBgmNode 内部会把旧节点淡出并接手，相当于一次无缝重连
      if (bgmBuffers[bgmKey]) startBgmNode(bgmKey, 320);
      else resumeBgm();
    } else if (bgmEl && bgmHtmlKey && bgmEl.paused) {
      const p = bgmEl.play();
      if (p && p.catch) p.catch(() => {});
    }
    // 环境音噪声源同样要重建，否则回到前台后只剩 BGM
    if (current) {
      if (amb) {
        amb.nodes.forEach(n => { try { n.stop(); } catch (e) { /* 已停止 */ } });
        amb = null;
      }
      buildAmbient(current);
    }
  }

  // 已解锁后，每次手势都顺手检查一次：避免中断后一直静音
  function onGesture() {
    if (!unlocked) { unlock(); return; }
    // 手势即代表用户在前台操作，强制恢复，避免 visibility 状态滞后导致一直静音
    wakeAudio(true);
    healBgm(true);
  }
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('keydown', onGesture);
  window.addEventListener('touchstart', onGesture, { passive: true });

  // 切后台时挂起音频，回来再恢复，避免后台一直占 CPU
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspendAudio();
    else wakeAudio();
  });
  // 离开页面（含进入 bfcache）时先挂起：部分内核在音频仍在播放时拒绝缓存页面
  window.addEventListener('pagehide', () => { suspendAudio(); });
  window.addEventListener('focus', () => {
    if (document.hidden) return;
    wakeAudio();
  });
  window.addEventListener('pageshow', () => {
    if (document.hidden) return;
    wakeAudio();
  });
  // 移动端从后台恢复时部分浏览器只派发 resume / 页面重新可见
  window.addEventListener('resume', () => {
    if (document.hidden) return;
    wakeAudio();
  });
  document.addEventListener('resume', () => {
    if (document.hidden) return;
    wakeAudio();
  });

  function stopAmbient(fade) {
    if (!amb) return;
    const a = amb;
    amb = null;
    const t = ctx.currentTime;
    a.gain.gain.cancelScheduledValues(t);
    a.gain.gain.setValueAtTime(a.gain.gain.value, t);
    a.gain.gain.linearRampToValueAtTime(0.0001, t + (fade || 0.6));
    const ms = ((fade || 0.6) * 1000) + 140;
    setTimeout(() => {
      a.nodes.forEach(n => { try { n.stop(); } catch (e) { /* 已停止 */ } });
    }, ms);
  }

  // 环境音：不同天气用「带通噪声 + 低通噪声」的比例和滤波频率区分
  function buildAmbient(id) {
    if (!ctx) return;
    const c = ctx;
    const t = c.currentTime;
    const out = c.createGain();
    out.gain.value = 0.0001;
    out.connect(master);
    const nodes = [out];

    const addNoise = (type, freq, q, vol) => {
      const src = noiseSource();
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      const g = c.createGain();
      g.gain.value = vol;
      src.connect(f);
      f.connect(g);
      g.connect(out);
      src.start();
      nodes.push(src);
      return { src: src, f: f, g: g };
    };

    if (id === 'rain') {
      addNoise('bandpass', 1350, 0.5, 0.5);
      addNoise('lowpass', 380, 0.7, 0.22);
    } else if (id === 'storm') {
      addNoise('bandpass', 1150, 0.6, 0.46);
      addNoise('lowpass', 240, 0.7, 0.5);
    } else if (id === 'snow') {
      addNoise('lowpass', 560, 0.6, 0.28);
      addNoise('bandpass', 2100, 1.6, 0.05);
    } else if (id === 'wind') {
      const w = addNoise('bandpass', 480, 1.4, 0.5);
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 0.13;
      lg.gain.value = 250;
      lfo.connect(lg);
      lg.connect(w.f.frequency);
      lfo.start();
      nodes.push(lfo);
    } else if (id === 'sandstorm') {
      addNoise('bandpass', 1050, 0.8, 0.44);
      addNoise('highpass', 520, 0.7, 0.22);
    } else {
      out.gain.value = 0;
    }

    out.gain.linearRampToValueAtTime(battlePaused ? 0.0001 : ambLevel(), t + 0.9);
    amb = { gain: out, nodes: nodes };
  }

  // 雷声：低频轰鸣 + 高频炸裂，略微延迟，跟画面白闪错开更自然
  function thunder(strength) {
    if (!ctx || !unlocked || !enabled) return;
    const c = ctx;
    const t = c.currentTime + 0.12 + Math.random() * 0.3;
    const s = Math.max(0.25, Math.min(1, strength || 0.6));

    const rumble = noiseSource();
    const rf = c.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 300;
    const rg = c.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.85 * s, t + 0.08);
    rg.gain.exponentialRampToValueAtTime(0.22 * s, t + 0.55);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    rumble.connect(rf);
    rf.connect(rg);
    rg.connect(master);
    rumble.start(t);
    rumble.stop(t + 2.2);

    const crack = noiseSource();
    const cf = c.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 2400;
    const cg = c.createGain();
    cg.gain.setValueAtTime(0.45 * s, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    crack.connect(cf);
    cf.connect(cg);
    cg.connect(master);
    crack.start(t);
    crack.stop(t + 0.3);
  }

  // 战吼冲击波：低频声浪下坠 + 空气冲击噪声，叠在 barb-warcry 人声之上
  function warcryBurst() {
    if (!ctx || !master || !unlocked || !enabled) return;
    const c = ctx;
    const t = c.currentTime;
    // 胸腔共鸣：锯齿波快速下滑，低通随之下沉，像一声吼炸开
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.55);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.5);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    osc.connect(lp);
    lp.connect(og);
    og.connect(master);
    osc.start(t);
    osc.stop(t + 0.8);

    // 气浪：带通噪声快速下扫，模拟冲击波从身边推开的"呼"
    const n = noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(1600, t);
    bp.frequency.exponentialRampToValueAtTime(260, t + 0.5);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(master);
    n.start(t);
    n.stop(t + 0.65);
  }

  // 首领受击：闷响 + 冲击噪声 + 暴击金属泛音 + 劈砍划痕。
  // 与 barbHit 采样叠加，专门强化「打在首领身上」的分量；bodySize 越小音高越低沉。
  let lastBossHitAt = 0;
  function bossHitBurst(crit, chop, pitch) {
    if (!ctx || !master || !unlocked || !enabled) return;
    const c = ctx;
    const t = c.currentTime;
    const gap = lastBossHitAt ? t - lastBossHitAt : 9;
    if (gap < 0.045) return;                  // 连击同帧去重
    lastBossHitAt = t;
    const soft = gap < 0.12 ? 0.5 : 1;        // 高频连击时自动让位，避免糊成一片
    const p = pitch || 1;
    const s = (crit ? 1 : 0.72) * soft;
    ensureSfxBus();
    const bus = sfxBus || master;
    // 胸腔闷响：正弦快速下坠，暴击频率更低、余音更长
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime((crit ? 150 : 118) * p, t);
    osc.frequency.exponentialRampToValueAtTime((crit ? 40 : 52) * p, t + (crit ? 0.34 : 0.22));
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.6 * s, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + (crit ? 0.42 : 0.28));
    osc.connect(og); og.connect(bus);
    osc.start(t); osc.stop(t + 0.5);
    // 冲击噪声：带通短爆，像沉闷的撞击
    const n = noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = crit ? 1.4 : 0.9;
    bp.frequency.setValueAtTime((crit ? 1500 : 900) * p, t);
    bp.frequency.exponentialRampToValueAtTime((crit ? 420 : 300) * p, t + 0.16);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.34 * s, t + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(bp); bp.connect(ng); ng.connect(bus);
    n.start(t); n.stop(t + 0.24);
    // 暴击：高频金属泛音，交代「击穿了硬壳」
    if (crit) {
      const ring = c.createOscillator();
      ring.type = 'triangle';
      ring.frequency.setValueAtTime(1180 * p, t + 0.005);
      ring.frequency.exponentialRampToValueAtTime(760 * p, t + 0.3);
      const rg = c.createGain();
      rg.gain.setValueAtTime(0.0001, t + 0.005);
      rg.gain.exponentialRampToValueAtTime(0.15 * soft, t + 0.02);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      ring.connect(rg); rg.connect(bus);
      ring.start(t + 0.005); ring.stop(t + 0.4);
    }
    // 劈砍：高频短划痕，和斩痕特效同步
    if (chop) {
      const sw = noiseSource();
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2600;
      const sg = c.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.17 * s, t + 0.01);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      sw.connect(hp); hp.connect(sg); sg.connect(bus);
      sw.start(t); sw.stop(t + 0.16);
    }
  }

  /* ---------------- 解包音频资源（assets/audio） ---------------- */
  const AUDIO_DIR = 'assets/audio/';

  // 音效键 -> 文件；键名保持语义化，场景代码只引用键
  const FILES = {
    barbAttack: 'barb-attack.mp3',
    barbHit: 'barb-hit.mp3',
    barbBehit: 'barb-behit.mp3',
    barbWhirlwind: 'barb-whirlwind.mp3',
    barbCharge: 'barb-charge.mp3',
    barbShockwave: 'barb-shockwave.mp3',
    barbWarcry: 'barb-warcry.mp3',
    rangerArrow: 'ranger-arrow.mp3',
    rangerMultishot: 'ranger-multishot.mp3',
    rangerRoll: 'ranger-roll.mp3',
    rangerSnipe: 'ranger-snipe.mp3',
    rangerArrowrain: 'ranger-arrowrain.mp3',
    rangerBehit: 'ranger-behit.mp3',
    rangerBuff: 'ranger-buff.mp3',
    skillFrost: 'skill-frost.mp3',
    skillThunder: 'skill-thunder.mp3',
    skillChargeArc: 'skill-charge-arc.mp3',
    monsterYell: 'monster-yell.mp3',
    monsterAttack: 'monster-attack.mp3',
    monsterDeath: 'monster-death.mp3',
    uiClick: 'ui-click.mp3',
    uiSelect: 'ui-select.mp3',
    uiOpen: 'ui-open.mp3',
    uiClose: 'ui-close.mp3',
    uiLevelup: 'ui-levelup.mp3',
    stageLevelup: 'stage-levelup.mp3',
    stageCoin: 'stage-coin.mp3',
    stagePickup: 'stage-pickup.mp3',
    stageEquip: 'stage-equip.mp3'
  };

  // 背景音乐：登录大厅 / 主城大厅 / 普通战斗 / 首领战
  // bgm-login 为原包 bgm/main_scene（本地缓存缺失，已按原 CDN 地址补下）
  // login / lobby 已替换为 Kevin MacLeod "Inner Sanctum" / "Gathering Darkness"（CC BY 4.0）
  // 统一转 AAC（m4a）：源码即 96kbps MP3，改用 72k 立体声 / 48k 单声道 AAC，
  // 体积降约 30%，听感基本不变，且 iOS / 微信 / Android 原生支持
  const BGM = {
    login: 'bgm-login.m4a',
    lobby: 'bgm-lobby.m4a',
    battle: 'bgm-battle.m4a',
    boss: 'bgm-boss.m4a'
  };

  // 各职业常用音效：进城/进副本前预热，避免首击时还在解码
  const CLASS_SFX = {
    warrior: ['barbAttack', 'barbHit', 'barbWhirlwind', 'barbCharge', 'barbShockwave', 'barbWarcry', 'barbBehit'],
    ranger: ['rangerArrow', 'rangerMultishot', 'rangerRoll', 'rangerSnipe', 'rangerArrowrain', 'rangerBehit', 'rangerBuff'],
    mage: ['skillChargeArc', 'skillFrost', 'skillThunder', 'barbBehit']
  };

  const BGM_LEVEL = 0.32;      // 单曲目标音量（经音乐总线输出）
  const BGM_FADE = 600;        // 换曲交叉淡化时长
  const BGM_DUCK = 0.22;       // 暂停战斗时音乐压低比例

  const buffers = {};      // key -> AudioBuffer（Web Audio 解码成功）
  const failed = {};       // key -> true（fetch 失败，改用 <audio> 兜底）
  const htmlPool = {};     // key -> [{ el, busy }]
  const lastPlay = {};     // key -> 上次播放时间（音频时钟），做同音效节流
  let sfxBus = null;

  // —— 背景音乐（Web Audio 双轨交叉淡化）——
  const bgmBuffers = {};   // key -> AudioBuffer
  const bgmLoop = {};      // key -> { start, end } 去编码填充后的循环点
  const bgmFailed = {};    // key -> true（下载失败，回退 <audio>）
  const bgmLoading = {};   // key -> Promise（同一首曲只发一次请求）
  let musicBus = null;
  let bgmNodes = { key: null, src: null, gain: null, bornAt: 0 };
  let bgmKey = null;       // 期望播放的曲目（静音/未解锁时也记住）
  let battlePaused = false;
  // <audio> 兜底（只在 mp3 拉取失败时使用）
  let bgmEl = null;
  let bgmHtmlKey = null;
  const bgmBroken = {};    // key -> true（兜底元素也报错，停止重试）

  const fileUrl = (key) => AUDIO_DIR + (FILES[key] || key);
  const bgmUrl = (key) => AUDIO_DIR + (BGM[key] || key);

  function ensureSfxBus() {
    if (sfxBus) return;
    if (!ensure()) return;
    sfxBus = ctx.createGain();
    sfxBus.gain.value = enabled ? 1 : 0;
    sfxBus.connect(master);
  }

  function ensureMusicBus() {
    if (musicBus) return musicBus;
    if (!ensure()) return null;
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? (battlePaused ? BGM_DUCK : 1) : 0.0001;
    musicBus.connect(master);
    return musicBus;
  }

  // 线性淡化：始终基于音频时钟调度，不受主线程掉帧与后台节流影响
  function fadeGain(param, to, ms) {
    if (!ctx || !param) return;
    const t = ctx.currentTime;
    const from = Math.max(0.0001, param.value);
    param.cancelScheduledValues(t);
    param.setValueAtTime(from, t);
    param.linearRampToValueAtTime(Math.max(0.0001, to), t + ms / 1000);
  }

  /* ---------------- 音效 ---------------- */

  async function loadBuffer(key) {
    if (buffers[key] || failed[key]) return;
    const c = ensure();
    if (!c) { failed[key] = true; return; }
    try {
      const res = await fetch(fileUrl(key));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.arrayBuffer();
      buffers[key] = await c.decodeAudioData(data);
    } catch (e) {
      // file:// 或服务端不支持 fetch 时，退回 HTMLAudioElement 播放
      failed[key] = true;
      preloadHtml(key);
    }
  }

  function preloadHtml(key) {
    if (htmlPool[key]) return;
    const list = [];
    for (let i = 0; i < 2; i++) {
      const el = new Audio(fileUrl(key));
      el.preload = 'auto';
      el.load();
      list.push({ el: el, busy: false });
    }
    htmlPool[key] = list;
  }

  // 预热队列：限制并发，避免解锁瞬间 29 个请求抢带宽
  const preloadQueue = [];
  let preloadActive = 0;
  const PRELOAD_CONCURRENCY = 3;

  function pumpPreload() {
    while (preloadActive < PRELOAD_CONCURRENCY && preloadQueue.length) {
      const key = preloadQueue.shift();
      if (buffers[key] || failed[key]) continue;
      preloadActive++;
      loadBuffer(key).then(() => {
        preloadActive--;
        pumpPreload();
      }, () => {
        preloadActive--;
        pumpPreload();
      });
    }
  }

  function queuePreload(keys) {
    (keys || []).forEach(key => {
      if (!FILES[key] || buffers[key] || failed[key]) return;
      if (preloadQueue.indexOf(key) >= 0) return;
      preloadQueue.push(key);
    });
    pumpPreload();
  }

  function preloadAll() {
    queuePreload(Object.keys(FILES));
  }

  function playBuffer(key, opt) {
    if (!ctx || !buffers[key]) return false;
    ensureSfxBus();
    if (!sfxBus) return false;
    const c = ctx;
    const t = c.currentTime;
    const rate = opt.rate || 1;
    const vol = opt.vol == null ? 0.9 : opt.vol;
    const src = c.createBufferSource();
    src.buffer = buffers[key];
    src.playbackRate.value = rate;
    const g = c.createGain();
    // 6ms 起音 + 40ms 收尾，消除爆点（爆炸/骨头碎裂声尤其明显）
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    const dur = src.buffer.duration / rate;
    if (dur > 0.12) {
      g.gain.setValueAtTime(vol, t + dur - 0.04);
      g.gain.linearRampToValueAtTime(0.0001, t + dur - 0.005);
    }
    src.connect(g);
    g.connect(sfxBus);
    // 播完立即断开，避免节点在长局战斗里无限累积
    src.onended = () => {
      try { src.disconnect(); } catch (e) { /* 已断开 */ }
      try { g.disconnect(); } catch (e) { /* 已断开 */ }
    };
    src.start();
    return true;
  }

  function playHtml(key, opt) {
    let list = htmlPool[key] || (preloadHtml(key), htmlPool[key]);
    if (!list) return;
    let slot = list.find(s => !s.busy);
    if (!slot) {
      const el = new Audio(fileUrl(key));
      el.preload = 'auto';
      slot = { el: el, busy: false };
      list.push(slot);
    }
    const el = slot.el;
    slot.busy = true;
    try {
      el.currentTime = 0;
      el.volume = Math.min(1, (opt.vol == null ? 0.9 : opt.vol) * 0.85);
      el.playbackRate = opt.rate || 1;
      const p = el.play();
      if (p && p.catch) p.catch(() => { slot.busy = false; });
    } catch (e) { slot.busy = false; }
    el.onended = () => { slot.busy = false; };
  }

  // 播放一个音效：opt = { vol, rate, gap }，gap 为同音效最小间隔（秒）
  function play(key, opt) {
    if (!enabled || !FILES[key]) return;
    // 从后台回来时上下文可能还被系统挂着：走完整的唤醒重试，避免这一声被吞掉
    if (ctx && ctx.state !== 'running' && !document.hidden) wakeAudio();
    opt = opt || {};
    const now = ctx ? ctx.currentTime : ((window.performance && performance.now ? performance.now() : Date.now()) / 1000);
    const gap = opt.gap == null ? 0.035 : opt.gap;
    if (lastPlay[key] != null && now - lastPlay[key] < gap) return;
    lastPlay[key] = now;

    // 已解码：立即起音；解码失败：走 <audio> 兜底
    if (buffers[key]) { playBuffer(key, opt); return; }
    if (failed[key]) { if (unlocked) playHtml(key, opt); return; }
    // 仍在解码：丢弃这一声（迟到的音效比没有更破坏手感），并提到队首尽快就绪
    queuePreload([key]);
  }

  /* ---------------- 背景音乐 ---------------- */

  // mp3 编码在首尾有填充静音，循环时接缝会出现空档：只裁掉极小的首尾静音
  function trimLoop(buf) {
    const ch = buf.getChannelData(0);
    const n = ch.length;
    const sr = buf.sampleRate;
    const headMax = Math.min(n, Math.floor(sr * 0.08));
    const tailMax = Math.min(n, Math.floor(sr * 0.15));
    let head = 0;
    for (let i = 0; i < headMax; i++) {
      if (Math.abs(ch[i]) > 0.02) { head = i; break; }
      head = i;
    }
    let tail = n;
    for (let i = n - 1; i >= n - tailMax; i--) {
      if (Math.abs(ch[i]) > 0.02) { tail = i + 1; break; }
      tail = i;
    }
    const start = Math.max(0, head - Math.floor(sr * 0.01)) / sr;
    const end = Math.min(n, tail + Math.floor(sr * 0.01)) / sr;
    if (end - start < 1) return null;
    return { start: start, end: end };
  }

  // 手机端把背景音乐重采样为 22.05kHz 单声道再缓存：
  // 解码后的 PCM 内存约为原来的 1/4，长时间游玩不会因 4 首曲子常驻而吃满内存。
  function downmixBgm(buf) {
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    if (!coarse || !buf) return Promise.resolve(buf);
    const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctor) return Promise.resolve(buf);
    const rate = Math.min(22050, buf.sampleRate);
    if (buf.sampleRate <= 22050 && buf.numberOfChannels <= 1) return Promise.resolve(buf);
    try {
      const off = new Ctor(1, Math.ceil(buf.duration * rate), rate);
      const src = off.createBufferSource();
      src.buffer = buf;
      src.connect(off.destination);
      src.start();
      return off.startRendering().catch(() => buf);
    } catch (e) {
      return Promise.resolve(buf);
    }
  }

  // 只保留当前曲目的解码缓存：切歌后释放旧曲，把常驻内存从「全部 BGM」压到「一首」
  function releaseBgmBuffers(keepKey) {
    for (const k of Object.keys(bgmBuffers)) {
      if (k === keepKey) continue;
      delete bgmBuffers[k];
      delete bgmLoop[k];
    }
  }

  function loadBgm(key) {
    if (bgmBuffers[key] || bgmFailed[key]) return Promise.resolve(bgmBuffers[key] || null);
    if (bgmLoading[key]) return bgmLoading[key];
    bgmLoading[key] = (async () => {
      const c = ensure();
      if (!c) { bgmFailed[key] = true; return null; }
      try {
        const res = await fetch(bgmUrl(key));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.arrayBuffer();
        const raw = await c.decodeAudioData(data);
        const buf = await downmixBgm(raw);
        bgmBuffers[key] = buf;
        bgmLoop[key] = trimLoop(buf);
        // 解码期间场景已经切到这首曲目：直接接上，避免一直静音或停在上一首
        if (bgmKey === key && enabled && musicOn && unlocked && bgmNodes.key !== key) startBgmNode(key, 300);
        return buf;
      } catch (e) {
        bgmFailed[key] = true;
        if (bgmKey === key && enabled && musicOn) playBgmHtml(key);
        return null;
      } finally {
        delete bgmLoading[key];
      }
    })();
    return bgmLoading[key];
  }

  function startBgmNode(key, fadeMs) {
    const buf = bgmBuffers[key];
    const bus = ensureMusicBus();
    if (!buf || !bus) return false;
    if (bgmNodes.src) stopBgmNodes(fadeMs);
    const c = ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = bgmLoop[key];
    if (lp) { src.loopStart = lp.start; src.loopEnd = lp.end; }
    const g = c.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    g.connect(bus);
    src.start();
    bgmNodes = { key: key, src: src, gain: g, bornAt: Date.now() };
    // 刚起播的曲目不需要立刻被恢复逻辑重建
    lastReviveAt = Date.now();
    releaseBgmBuffers(key);
    fadeGain(g.gain, BGM_LEVEL, fadeMs == null ? BGM_FADE : fadeMs);
    if (c.state === 'suspended') {
      const p = c.resume();
      if (p && p.catch) p.catch(() => {});
    }
    return true;
  }

  function stopBgmNodes(ms) {
    const nodes = bgmNodes;
    bgmNodes = { key: null, src: null, gain: null, bornAt: 0 };
    if (!nodes.src) return;
    const dur = ms == null ? 450 : ms;
    if (nodes.gain) fadeGain(nodes.gain.gain, 0.0001, dur);
    const src = nodes.src;
    const g = nodes.gain;
    setTimeout(() => {
      try { src.stop(); } catch (e) { /* 已停止 */ }
      try { src.disconnect(); } catch (e) { /* 已断开 */ }
      if (g) { try { g.disconnect(); } catch (e) { /* 已断开 */ } }
    }, dur + 60);
  }

  // <audio> 兜底：仅当 mp3 无法 fetch/解码时使用
  function fadeTo(el, from, to, ms, done) {
    if (!el) return;
    const token = (el._fade = (el._fade || 0) + 1);
    const t0 = Date.now();
    el.volume = Math.max(0, Math.min(1, from));
    const timer = setInterval(() => {
      if (el._fade !== token) { clearInterval(timer); return; }
      const k = Math.min(1, (Date.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) {
        clearInterval(timer);
        if (done) done();
      }
    }, 30);
  }

  function playBgmHtml(key) {
    if (!unlocked || bgmBroken[key]) return;
    if (bgmEl && bgmHtmlKey === key) {
      if (bgmEl.paused) {
        const p = bgmEl.play();
        if (p && p.catch) p.catch(() => {});
      }
      return;
    }
    if (bgmEl) {
      const old = bgmEl;
      bgmEl = null;
      fadeTo(old, old.volume, 0, 400, () => { old.pause(); });
    }
    const el = new Audio(bgmUrl(key));
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    // 文件损坏/404 时清掉引用并标记，避免看门狗反复重试
    el.addEventListener('error', () => {
      bgmBroken[key] = true;
      if (bgmEl === el) { bgmEl = null; bgmHtmlKey = null; }
    });
    bgmEl = el;
    bgmHtmlKey = key;
    releaseBgmBuffers(null);
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
    fadeTo(el, 0, BGM_LEVEL, 500);
  }

  function resumeBgm() {
    if (!bgmKey || !enabled || !musicOn) return;
    // 未解锁（还没有任何用户手势）时不下载音频：单曲 2MB+，提前拉会抢占登录页带宽，
    // 而浏览器在解锁前本来也不允许出声
    if (!unlocked) return;
    ensureRunning();
    if (bgmNodes.src) {
      fadeGain(bgmNodes.gain.gain, BGM_LEVEL, 400);
      return;
    }
    if (bgmBuffers[bgmKey]) { startBgmNode(bgmKey, 400); return; }
    if (bgmFailed[bgmKey] && !bgmBroken[bgmKey]) { playBgmHtml(bgmKey); return; }
    loadBgm(bgmKey);
  }

  let lastHeal = 0;
  // 看门狗：处理「放着放着没声」——上下文被挂起、节点增益卡在 0、节点意外丢失
  function healBgm(force) {
    if (!bgmKey || !enabled || !musicOn || !unlocked || (!force && document.hidden)) return;
    const now = Date.now();
    if (!force && now - lastHeal < 1200) return;
    lastHeal = now;
    ensureRunning();
    if (bgmNodes.src) {
      // 淡入过程不打扰；持续 1.5 秒以上仍近乎无声才补回音量
      const g = bgmNodes.gain && bgmNodes.gain.gain;
      if (g && !battlePaused && now - bgmNodes.bornAt > 1500 && g.value < 0.02) {
        fadeGain(g, BGM_LEVEL, 350);
      }
      return;
    }
    if (bgmEl) {
      if (bgmEl.paused) {
        const p = bgmEl.play();
        if (p && p.catch) p.catch(() => {});
      }
      return;
    }
    resumeBgm();
  }
  // 前台看门狗：即使没收到 visibility / focus 事件，也定期把被系统挂起的上下文拉回来
  setInterval(() => {
    if (document.hidden) return;
    // 上下文被内核对掉（页面被冻结回收）：直接重建音频图
    if (!ctx) { if (unlocked) rebuild(); return; }
    if (ctx.state !== 'running') wakeAudio();
    healBgm(false);
  }, 2500);

  // 切换背景音乐：同一首不重启；切换时双轨交叉淡化，旧曲在淡出结束点精确停止
  function playBgm(key) {
    if (!BGM[key]) return;
    bgmKey = key;
    if (!enabled || !musicOn) return;
    // 切场景时上下文可能仍被系统挂着：先唤醒再起播，避免新场景一路静音
    if (ctx && ctx.state !== 'running' && !document.hidden) wakeAudio();

    if (bgmNodes.src && bgmNodes.key === key) {
      resumeBgm();
      return;
    }
    if (!unlocked) return;   // 等首次手势解锁后再由 resumeBgm 下载并起播，避免首屏抢带宽

    if (bgmBuffers[key]) { startBgmNode(key, BGM_FADE); return; }
    if (bgmFailed[key]) { playBgmHtml(key); return; }
    // 尚未解码：先取回并解码，完成时若仍是当前曲目会自动淡入
    loadBgm(key);
  }

  function stopBgm() {
    bgmKey = null;
    stopBgmNodes(450);
    if (bgmEl) {
      const old = bgmEl;
      bgmEl = null;
      bgmHtmlKey = null;
      fadeTo(old, old.volume, 0, 400, () => { old.pause(); });
    }
  }

  /* ---------------- 对外接口 ---------------- */
  A.setAmbient = function (id) {
    current = id;
    if (!ctx || !unlocked) return;   // 等首次手势解锁后自动补播
    stopAmbient(0.5);
    buildAmbient(id);
  };

  A.stop = function () {
    current = null;
    if (ctx) stopAmbient(0.7);
  };

  A.thunder = thunder;
  A.warcryBurst = warcryBurst;
  A.bossHit = bossHitBurst;

  A.play = play;
  A.playBgm = playBgm;
  A.stopBgm = stopBgm;
  A.preload = preloadAll;

  // 按职业技能预热，进入主城/副本前调用
  A.preloadClass = function (classId) {
    queuePreload(CLASS_SFX[classId] || []);
  };

  A.preloadKeys = function (keys) {
    queuePreload(keys || []);
  };

  // 战斗暂停（打开暂停卡、养成面板、切出窗口）：音乐与环境音同步压低
  A.setBattlePaused = function (v) {
    battlePaused = !!v;
    if (!ctx) return;
    if (musicBus) fadeGain(musicBus.gain, musicOn ? (battlePaused ? BGM_DUCK : 1) : 0.0001, 250);
    if (amb) fadeGain(amb.gain.gain, battlePaused ? 0.0001 : ambLevel(), 250);
  };

  // 天气环境音音量：0-1，实时调整当前正在播放的底噪
  A.setAmbientVolume = function (v) {
    ambVol = Math.max(0, Math.min(1, Number(v) || 0));
    if (amb && ctx) fadeGain(amb.gain.gain, battlePaused ? 0.0001 : ambLevel(), 200);
  };

  // 背景音乐单独开关：只影响 BGM，界面音效与战斗音效保持原样
  A.setMusicEnabled = function (v) {
    musicOn = !!v;
    if (!musicOn) {
      stopBgmNodes(300);
      if (bgmEl) {
        const old = bgmEl;
        bgmEl = null;
        bgmHtmlKey = null;
        fadeTo(old, old.volume, 0, 300, () => { old.pause(); });
      }
    } else {
      if (musicBus) fadeGain(musicBus.gain, battlePaused ? BGM_DUCK : 1, 250);
      if (enabled) resumeBgm();
    }
  };

  A.setEnabled = function (v) {
    enabled = !!v;
    if (DG.settings) DG.settings.set({ audio: enabled });
    if (sfxBus) sfxBus.gain.value = enabled ? 1 : 0;
    if (enabled) {
      // 静音期间切过场景：重新开启时按当前场景补播 BGM
      resumeBgm();
    } else {
      stopBgmNodes(250);
      if (bgmEl) bgmEl.pause();
    }
    if (!ctx) { if (enabled) unlock(); return; }
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(enabled ? 0.42 : 0, t + 0.25);
    if (enabled) unlock();
  };

  A.getEnabled = function () { return enabled; };

  // 自检用：当前 BGM 运行状态（不含敏感数据，可安全打印）
  A.getBgmState = function () {
    return {
      key: bgmKey,
      playing: !!(bgmNodes.src || (bgmEl && !bgmEl.paused)),
      ctxState: ctx ? ctx.state : 'none',
      gain: bgmNodes.gain ? Math.round(bgmNodes.gain.gain.value * 1000) / 1000 : 0,
      fallback: !!bgmEl,
      unlocked: unlocked,
      musicOn: musicOn,
      enabled: enabled
    };
  };

  // UI 点击音效：统一委托，避免每个按钮重复接事件；data-sfx="none" 可关闭
  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest && e.target.closest('button, .btn, [data-sfx]');
    if (!btn) return;
    const key = btn.getAttribute('data-sfx');
    if (key === 'none') return;
    play(key || 'uiClick', { vol: 0.5, gap: 0.06 });
  }, true);
})();


;
/* ==== js/data/config.js ==== */
/* 全局配置：稀有度、属性表、关卡、背包 */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};

  DG.CONFIG = {
    BAG_SIZE: 100,
    MAX_SKILL_LEVEL: 10,
    MAX_LEVEL: 60,
    // 装备槽位：与装备界面 PSD 的 10 个格子一一对应
    SLOTS: [
      { id: 'weapon', name: '武器', glyph: '刃' },
      { id: 'offhand', name: '武器', glyph: '盾' },
      { id: 'helm', name: '头盔', glyph: '盔' },
      { id: 'armor', name: '胸甲', glyph: '甲' },
      { id: 'shoulder', name: '护肩', glyph: '肩' },
      { id: 'gloves', name: '手套', glyph: '手' },
      { id: 'pants', name: '裤子', glyph: '裤' },
      { id: 'boots', name: '鞋子', glyph: '履' },
      { id: 'ring', name: '戒指', glyph: '戒' },
      { id: 'amulet', name: '项链', glyph: '链' }
    ],
    STAT_META: {
      atk: { label: '攻击力', suffix: '', decimals: 0 },
      atkPct: { label: '攻击力提升', suffix: '%', decimals: 0 },
      hp: { label: '最大生命', suffix: '', decimals: 0 },
      armor: { label: '护甲', suffix: '', decimals: 0 },
      crit: { label: '暴击率', suffix: '%', decimals: 1 },
      critDmg: { label: '暴击伤害', suffix: '%', decimals: 0 },
      moveSpeed: { label: '移动速度', suffix: '%', decimals: 1 },
      attackSpeed: { label: '攻击速度', suffix: '%', decimals: 1 },
      hpRegen: { label: '生命回复', suffix: '/秒', decimals: 1 }
    }
  };

  // 品质（对应掉落权重 / 词缀数量）：白 → 蓝 → 紫 → 绿（套装）→ 橙（暗金）
  // 套装与暗金有概率roll出「远古」版本，基础属性与词缀数值更高
  DG.data.rarity = [
    { id: 'normal', name: '普通', color: '#cfc9bb', weight: 52, affix: [0, 0] },
    { id: 'magic', name: '魔法', color: '#5b8bd6', weight: 31, affix: [1, 2] },
    { id: 'rare', name: '稀有', color: '#b06fd8', weight: 12, affix: [3, 4] },
    { id: 'set', name: '套装', color: '#5fae5a', weight: 3, affix: [3, 4] },
    { id: 'legend', name: '暗金', color: '#e8853c', weight: 2, affix: [4, 5] }
  ];

  DG.data.rarityById = {};
  DG.data.rarity.forEach(r => { DG.data.rarityById[r.id] = r; });

  // 四大章节 · 每章 20 个连续关卡（共 80 关）
  // ilvl 决定怪物强度与装备物品等级；reqLevel 为等级门槛，同时要求通关上一关。
  DG.data.acts = [
    { id: 1, name: '迷雾边境', desc: '雾从林地深处漫上来，先活下来。' },
    { id: 2, name: '腐化荒野', desc: '灰烬、裂隙与疫病，腐化正在扩散。' },
    { id: 3, name: '黑潮之上', desc: '沿着沉船与潮汐，追到腐化的源头。' },
    { id: 4, name: '王座终局', desc: '世界之痕裂开，终焉之门就在眼前。' }
  ];

  DG.data.dungeons = [
    // ---------- 第一章 · 迷雾边境 ----------
    {
      id: 'grove', act: 1, name: '迷雾林地',
      subtitle: '野兽与亡骸', ilvl: 1, reqLevel: 1,
      waves: [6, 8],
      pool: ['wolf', 'skeleton', 'pea', 'fleece', 'foxraider', 'deepfin', 'bat', 'hornet'],
      elitePool: ['mawflower'],
      bossId: 'eyehorror',
      bossPool: ['eyehorror', 'croc', 'mawfish', 'slimeking'],
      mapStyle: 'grove',
      map: { minRooms: 10, maxRooms: 13 },
      desc: '被迷雾吞没的林地，腐化野狼与游荡骸骨在树影间徘徊，血翼蝠与毒刺蜂穿梭其间。'
    },
    {
      id: 'thicket', act: 1, name: '荆棘林径',
      subtitle: '群兽围猎', ilvl: 2, reqLevel: 3,
      waves: [6, 9],
      pool: ['wolf', 'skeleton', 'pea', 'musketeer', 'foxraider', 'hornet', 'bat', 'fleece'],
      elitePool: ['mawflower'],
      bossId: 'croc',
      bossPool: ['croc', 'mawfish', 'mummyking', 'slimeking'],
      mapStyle: 'grove',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '荆棘封住的小径上，菌帽枪手占据高处，灰狐掠手成群结队，沼泽巨鳄在泥水中伺机而动。'
    },
    {
      id: 'fen', act: 1, name: '腐朽沼泽',
      subtitle: '毒雾与水鬼', ilvl: 3, reqLevel: 5,
      waves: [7, 9],
      pool: ['deepfin', 'angler', 'mistwalker', 'bat', 'hornet', 'pea', 'fleece', 'mawflower'],
      elitePool: ['mawflower'],
      bossId: 'mawfish',
      bossPool: ['mawfish', 'eyehorror', 'croc', 'slimeking'],
      mapStyle: 'grove',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '腐水没膝，渊灯兽在水下亮起幽光，迷雾行者拖着自己的影子在雾里游走。'
    },
    {
      id: 'crypt', act: 1, name: '沉沦墓穴',
      subtitle: '更密集的亡者', ilvl: 4, reqLevel: 8,
      waves: [7, 10],
      pool: ['frostwolf', 'skeleton', 'mistwalker', 'pea', 'pumpkin', 'frostslime', 'beetle', 'cinderraven', 'candle', 'cowlbandit', 'angler', 'mummy'],
      elitePool: ['plaguedoc'],
      bossId: 'mummyking',
      bossPool: ['mummyking', 'croc', 'mawfish', 'slimeking'],
      mapStyle: 'crypt',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '墓穴深处渗出寒气，黑焰蝠在远处盘旋，青壳甲虫在石棺间爬行，灰发女妖守着更深的墓道。'
    },
    {
      id: 'catacomb', act: 1, name: '幽影墓道',
      subtitle: '骸骨军团', ilvl: 5, reqLevel: 10,
      waves: [7, 10],
      pool: ['skeleton', 'mistwalker', 'boneknight', 'beetle', 'cinderraven', 'candle', 'frostslime', 'cowlbandit', 'mummy'],
      elitePool: ['plaguedoc'],
      bossId: 'eyehorror',
      bossPool: ['eyehorror', 'mummyking', 'croc', 'slimeking'],
      mapStyle: 'crypt',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '窄长的墓道里缠尸卫士排成阵列，火烛无风自动，深处有什么东西在阴影里拖出一道长痕。'
    },

    // ---------- 第二章 · 腐化荒野 ----------
    {
      id: 'ashlands', act: 2, name: '灰烬荒原',
      subtitle: '烈焰与黑鸦', ilvl: 6, reqLevel: 12,
      waves: [8, 10],
      pool: ['cinderraven', 'candle', 'emberdrake', 'boneknight', 'cowlbandit', 'beetle', 'urchin'],
      elitePool: ['warlock'],
      bossId: 'cauldron',
      bossPool: ['cauldron', 'golem', 'blueogre', 'mushroomgun'],
      mapStyle: 'abyss',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '灰烬没到脚踝，赤棘龙在余烬中穿行，远处的药汤一直在翻滚，冒出紫色气泡。'
    },
    {
      id: 'abyss', act: 2, name: '腐化深渊',
      subtitle: '精英与首领', ilvl: 7, reqLevel: 15,
      waves: [8, 11],
      pool: ['boneknight', 'mistwalker', 'frostwolf', 'pumpkin', 'frostslime', 'musketeer', 'beetle', 'cinderraven', 'bulwark', 'emberdrake', 'venomlisk', 'urchin'],
      elitePool: ['warlock', 'plaguedoc'],
      bossId: 'abysseye',
      bossPool: ['abysseye', 'cauldron', 'goatbrute', 'mushroomgun'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '深渊的裂隙不断涌出腐化之物，裂隙另一侧有什么在注视着你，一动不动。'
    },
    {
      id: 'rift', act: 2, name: '裂隙回廊',
      subtitle: '空间错位', ilvl: 8, reqLevel: 17,
      waves: [8, 11],
      pool: ['boneknight', 'mistwalker', 'cinderraven', 'cowlbandit', 'urchin', 'venomlisk', 'bulwark', 'candle'],
      elitePool: ['warlock'],
      bossId: 'golem',
      bossPool: ['golem', 'blueogre', 'goatbrute', 'mushroomgun'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '回廊在眼前折叠，脚下的石板翻出另一片天空，错位的尽头有巨大的影子缓缓抬头。'
    },
    {
      id: 'furnace', act: 2, name: '熔火工坊',
      subtitle: '灼热与重甲', ilvl: 9, reqLevel: 19,
      waves: [8, 11],
      pool: ['emberdrake', 'cinderraven', 'candle', 'bulwark', 'beetle', 'urchin', 'blueogre'],
      elitePool: ['warlock'],
      bossId: 'blueogre',
      bossPool: ['blueogre', 'cauldron', 'golem', 'mushroomgun'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '熔炉昼夜不熄，铁背野猪的甲片被炉火烤得发亮，炉口的药汤一刻不停地翻滚。'
    },
    {
      id: 'plague', act: 2, name: '疫病巢穴',
      subtitle: '毒与腐化', ilvl: 10, reqLevel: 22,
      waves: [9, 11],
      pool: ['urchin', 'venomlisk', 'frostslime', 'beetle', 'pumpkin', 'mistwalker', 'cowlbandit', 'plaguedoc'],
      elitePool: ['plaguedoc', 'warlock'],
      bossId: 'goatbrute',
      bossPool: ['goatbrute', 'cauldron', 'blueogre', 'mushroomgun'],
      mapStyle: 'crypt',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '巢穴里连空气都是绿的，棘刺仙人掌的尖刺上挂着毒液，蓝鳞蛇王的鳞片在暗处反光。'
    },

    // ---------- 第三章 · 黑潮之上 ----------
    {
      id: 'shipwreck', act: 3, name: '沉船海滩',
      subtitle: '潮声与劫掠', ilvl: 11, reqLevel: 24,
      waves: [9, 12],
      pool: ['deepfin', 'angler', 'musketeer', 'cowlbandit', 'fleece', 'urchin', 'piratecrab'],
      elitePool: ['plaguedoc'],
      bossId: 'piratecrab',
      bossPool: ['piratecrab', 'octoking', 'silverknight', 'mawflowerking'],
      mapStyle: 'grove',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '搁浅的船骸排成一片，海盗巨蟹在残帆间横行，游荡菌人把这里当成了他们的地盘。'
    },
    {
      id: 'tidecave', act: 3, name: '潮汐洞窟',
      subtitle: '幽蓝深水', ilvl: 12, reqLevel: 27,
      waves: [9, 12],
      pool: ['deepfin', 'angler', 'frostslime', 'mistwalker', 'urchin', 'venomlisk', 'cowlbandit'],
      elitePool: ['warlock'],
      bossId: 'octoking',
      bossPool: ['octoking', 'piratecrab', 'silverknight', 'wormking'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '潮水在洞窟里涨落，幽蓝喙兽贴着水面滑行，深处的触须在黑暗里缓慢张开。'
    },
    {
      id: 'frostkeep', act: 3, name: '霜封要塞',
      subtitle: '寒铁与誓约', ilvl: 13, reqLevel: 29,
      waves: [9, 12],
      pool: ['frostwolf', 'frostslime', 'boneknight', 'cinderraven', 'beetle', 'candle', 'mistwalker'],
      elitePool: ['plaguedoc'],
      bossId: 'silverknight',
      bossPool: ['silverknight', 'snakeking', 'octoking', 'wormking'],
      mapStyle: 'crypt',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '要塞的旗帜冻成硬片，霜牙狼在垛口间游荡，狼人领主的爪痕刻满了整面冰墙。'
    },
    {
      id: 'sanctum', act: 3, name: '遗忘圣所',
      subtitle: '祷声与骸骨', ilvl: 14, reqLevel: 32,
      waves: [9, 12],
      pool: ['skeleton', 'boneknight', 'mistwalker', 'candle', 'cinderraven', 'beetle', 'pumpkin'],
      elitePool: ['warlock'],
      bossId: 'snakeking',
      bossPool: ['snakeking', 'silverknight', 'octoking', 'mawflowerking'],
      mapStyle: 'crypt',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '圣所的祷声早已停歇，长明灯却还亮着，穿法袍的骸骨仍在原地重复着跪拜。'
    },
    {
      id: 'voidgate', act: 3, name: '虚空之门',
      subtitle: '暗影穿行', ilvl: 15, reqLevel: 34,
      waves: [9, 12],
      pool: ['mistwalker', 'urchin', 'venomlisk', 'cinderraven', 'bulwark', 'emberdrake', 'pumpkin'],
      elitePool: ['warlock', 'plaguedoc'],
      bossId: 'snakeking',
      bossPool: ['snakeking', 'piratecrab', 'octoking', 'wormking'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '门框里没有门，只有一片会呼吸的黑。蓝鳞蛇王盘在门框的阴影里，鳞片比黑暗更深。'
    },

    // ---------- 第四章 · 王座终局 ----------
    {
      id: 'bonehall', act: 4, name: '骸骨大殿',
      subtitle: '万骨为阶', ilvl: 16, reqLevel: 37,
      waves: [10, 13],
      pool: ['boneknight', 'skeleton', 'pumpkin', 'candle', 'beetle', 'mistwalker', 'frostslime'],
      elitePool: ['plaguedoc'],
      bossId: 'reaper',
      bossPool: ['reaper', 'crystalcrab', 'shadowdemon', 'pinkdemon'],
      mapStyle: 'crypt',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '整座大殿由骸骨砌成，台阶是肋骨，穹顶是颅骨，幽镰收割者在最深处磨着镰刃。'
    },
    {
      id: 'emberthrone', act: 4, name: '烬火王座',
      subtitle: '余烬不熄', ilvl: 17, reqLevel: 40,
      waves: [10, 13],
      pool: ['emberdrake', 'cinderraven', 'candle', 'bulwark', 'venomlisk', 'mistwalker'],
      elitePool: ['warlock'],
      bossId: 'crystalcrab',
      bossPool: ['crystalcrab', 'hierophant', 'shadowdemon', 'pumpkinlord'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '王座下的火池从未冷却，赤棘龙的鳞片像烧红的铁，紫晶蟹王的甲壳在火池边反光。'
    },
    {
      id: 'shadowcourt', act: 4, name: '暗影回廊',
      subtitle: '影中之影', ilvl: 18, reqLevel: 43,
      waves: [10, 13],
      pool: ['mistwalker', 'cowlbandit', 'urchin', 'venomlisk', 'boneknight', 'bulwark', 'cinderraven'],
      elitePool: ['warlock'],
      bossId: 'shadowdemon',
      bossPool: ['shadowdemon', 'hierophant', 'crystalcrab', 'hornedfiend'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '回廊两侧站满石像，每一尊的影子里都多站着一个影子，尽头有什么在等你抬头。'
    },
    {
      id: 'worldscar', act: 4, name: '世界之痕',
      subtitle: '地裂天倾', ilvl: 19, reqLevel: 46,
      waves: [10, 13],
      pool: ['bulwark', 'emberdrake', 'venomlisk', 'mistwalker', 'cinderraven', 'urchin', 'boneknight', 'beetle'],
      elitePool: ['warlock', 'plaguedoc'],
      bossId: 'hierophant',
      bossPool: ['hierophant', 'shadowdemon', 'crystalcrab', 'mushroommaw'],
      mapStyle: 'abyss',
      map: { minRooms: 8, maxRooms: 11 },
      desc: '大地在这里裂开一道看不到底的痕，有什么从裂缝里走出，袍角还挂着别的世界。'
    },
    {
      id: 'finalgate', act: 4, name: '终焉之门',
      subtitle: '最后一战', ilvl: 20, reqLevel: 48,
      waves: [10, 14],
      pool: ['bulwark', 'emberdrake', 'venomlisk', 'mistwalker', 'cinderraven', 'urchin', 'boneknight', 'pumpkin', 'beetle'],
      elitePool: ['warlock', 'plaguedoc', 'mawflower'],
      bossId: 'reaper',
      bossPool: ['reaper', 'hierophant', 'shadowdemon', 'crystalcrab', 'pumpkinlord', 'mushroommaw'],
      mapStyle: 'abyss',
      map: { minRooms: 9, maxRooms: 12 },
      desc: '所有腐化的尽头都收束在这扇门前，幽镰收割者守在门后，注视着走进来的每一个人。'
    }
  ];

  // 每章补足到 20 关：原有 5 关保持不动，追加 15 个主题关卡。
  // 主题：紫焰炼狱 / 蓝白雪原 / 赤红地狱 / 青绿草原 / 橘色深秋
  const EXTRA_STAGES = {
    1: [
      ['青芒草原', '草浪没膝', 'savanna', '草浪没膝，兽群在风里穿行，草叶被踩断会发出细响。'],
      ['落枫林道', '橘叶伏兵', 'autumn', '枫叶铺满小径，伏击者把自己埋进叶堆，只露出一双眼睛。'],
      ['雾嚎丘陵', '狼群低语', 'grove', '雾气沿丘陵翻涌，狼嚎从四面八方围过来，分不清远近。'],
      ['雪线林缘', '初雪寒狼', 'snowfield', '初雪压弯枝头，寒狼沿着雪线游荡，脚印很快被新雪填平。'],
      ['苔石旧道', '石缝风声', 'grove', '苔藓吞掉旧石道，只剩风穿过石缝，像有人在里面换气。'],
      ['灰枫坟场', '无人扫墓', 'autumn', '枫叶落在无名墓碑上，一层又一层，没人来扫。'],
      ['白桦低地', '游荡者营地', 'savanna', '白桦与芒草围出低地，游荡者在这里歇脚，留下半冷的火堆。'],
      ['冻土小径', '薄冰细响', 'snowfield', '薄冰在脚下裂开细响，霜从土里冒出来，贴着脚踝往上爬。'],
      ['枯叶回廊', '叶下骸骨', 'autumn', '枯叶堆到膝盖，骸骨在下面翻身，声音闷得像叹气。'],
      ['深绿腹地', '无路之林', 'grove', '密林深处没有路，只有被反复踩出来的痕，通向更密的地方。'],
      ['芒草风口', '风如刀刃', 'savanna', '风从草原尽头灌进来，草叶像刀，割在护甲上沙沙作响。'],
      ['暮色墓园', '影子移动', 'crypt', '暮色落下时，墓碑的影子开始移动，比太阳走得快。'],
      ['雪掩林道', '半埋脚印', 'snowfield', '雪把林道埋了一半，另一半留着脚印，脚印只有去没有回。'],
      ['枫火营地', '熄灭的篝火', 'autumn', '营地只剩熄掉的篝火和被翻乱的箱子，主人走得很急。'],
      ['边界哨站', '守旗无人', 'grove', '边境哨站的旗子还挂着，守旗的人不在，旗绳一直响。']
    ],
    2: [
      ['紫焰裂谷', '地缝喷火', 'inferno', '紫色火焰从地缝里喷出，风都带着焦味，呼吸像吞刀片。'],
      ['血雾洼地', '没过脚踝', 'hell', '血雾沉在洼地底部，踩进去会没过脚踝，抬脚时带起黏稠的丝。'],
      ['腐骨矿坑', '骨与矿石', 'crypt', '矿车翻倒，骨与矿石混在一起，分不清哪些是会动的东西。'],
      ['焦土林场', '黑树橘叶', 'autumn', '树烧成黑色，只有枫叶还是橘的，风一吹就落一层灰。'],
      ['炼狱风眼', '火在呼吸', 'inferno', '风眼中心很安静，安静得能听见火在呼吸，一进一出。'],
      ['赤雨沼地', '红雨落沼', 'hell', '红雨落在沼泽上，水面像被搅开的内脏，气泡一个接一个破。'],
      ['断脊峡谷', '骨缝过风', 'abyss', '峡谷像一截断掉的脊骨，风从骨缝里过，发出低沉的哨音。'],
      ['锈叶荒径', '铁锈与叶', 'autumn', '铁锈和落叶铺在一起，踩上去沙沙响，像踩碎很多小骨头。'],
      ['紫烬祭坛', '供品难辨', 'inferno', '祭坛上供着什么已经看不清，只剩紫烬，风一吹就亮一下。'],
      ['血河浅滩', '半截残旗', 'hell', '河水是红的，浅滩上插着半截旗，旗面已经没有颜色。'],
      ['灰烬兽穴', '白灰覆林', 'grove', '兽穴周围的树全白了，像落了一层灰雪，兽毛上也全是灰。'],
      ['腐化温室', '不该结果', 'crypt', '藤蔓从墓室里长出来，结着不该结的果，果皮下面是骨头。'],
      ['紫雾回廊', '火把不燃', 'inferno', '紫雾贴着地面走，火把点不着，只能靠火石擦出的火星辨路。'],
      ['血月高地', '影子过长', 'hell', '月亮是红的，高地上的影子比人长，影子的动作总慢半拍。'],
      ['荒野尽头', '更深的荒野', 'abyss', '荒野在这里断掉，前面是更深的荒野，没有边界也没有方向。']
    ],
    3: [
      ['雪潮海岸', '浪推冰回', 'snowfield', '雪落在黑潮上，浪把冰推回岸，冰里冻着看不清的东西。'],
      ['白桦渡口', '冻住的船', 'grove', '渡口的船冻在河里，白桦落满雪，船桨还保持着划动的姿势。'],
      ['潮下冰窟', '头顶潮声', 'snowfield', '冰窟里能听见潮水在头顶走，每走一步，顶上就掉一层冰屑。'],
      ['枫落海岬', '红叶入潮', 'autumn', '枫叶被海风卷过悬崖，落进黑潮，像一小片一小片的火。'],
      ['紫焰灯塔', '照不远', 'inferno', '灯塔烧着紫色的火，照不远，海面上的黑比光更厚。'],
      ['盐风草原', '灰绿草浪', 'savanna', '盐风把草吹成灰绿，兽群在远处，背上的毛结着盐晶。'],
      ['雾锁冰湖', '脚印中断', 'snowfield', '冰湖上雾不散，脚印走两步就断，断口整齐得像被切掉。'],
      ['黑潮墓园', '盐结碑面', 'crypt', '海水漫过墓园，墓碑上结了盐，名字被盐重新描了一遍。'],
      ['虚空风口', '不落之物', 'abyss', '风口对着虚空，扔进去的东西不会落地，也没有回声。'],
      ['赤叶峡湾', '水面亦红', 'autumn', '峡湾两侧全是红枫，水面也是红的，分不清哪边是天。'],
      ['雪原残堡', '缺口灌雪', 'snowfield', '残堡的墙塌了一半，雪从缺口灌进去，把大厅填成斜坡。'],
      ['紫潮祭坛', '半水半火', 'inferno', '祭坛一半泡在黑潮里，一半烧着紫火，水与火交界处冒着白汽。'],
      ['沉没林道', '树冠浮水', 'grove', '林道沉进水里，树冠还浮着，水下的路比水上更清楚。'],
      ['寒潮尽头', '风里冰晶', 'snowfield', '寒潮从尽头推过来，风里全是冰晶，睁眼就会流泪。'],
      ['黑潮之眼', '洞下潮声', 'abyss', '潮水的中心是一个洞，洞下面还有潮声，一层比一层远。']
    ],
    4: [
      ['紫烬王庭', '地砖下火', 'inferno', '王庭的地砖下还在烧，紫焰从缝里舔出来，照亮空着的王座。'],
      ['血雨长阶', '阶上淌血', 'hell', '长阶上淌着血雨，每走一步都打滑，阶缝里长着暗红的花。'],
      ['霜骨回廊', '冰里冻骨', 'snowfield', '骨头冻在冰里，走廊尽头有霜在落，落得很慢，像在等人。'],
      ['炼狱风牢', '开门即扑', 'inferno', '风牢里关着烧不完的风，门一开就往外扑，带着紫色的火星。'],
      ['赤潮深渊', '无声涨落', 'hell', '深渊底部是红色的潮，涨落没有声音，只有颜色在动。'],
      ['万骨雪原', '雪下有骨', 'snowfield', '雪下面全是骨，踩重了会陷，陷下去能听见骨与骨相碰。'],
      ['紫焰祭殿', '烧红的骨柱', 'inferno', '祭殿的柱子是烧红的骨，紫焰绕着往上爬，爬到顶就散成烟。'],
      ['血月回廊', '影子流血', 'hell', '血月从回廊的窗格里照进来，影子在地面流血，流得很慢。'],
      ['寒鸦王陵', '一动不动', 'snowfield', '寒鸦停在王陵的雪顶上，一动不动，像是在等雪把它埋掉。'],
      ['深紫裂隙', '会收缩的黑', 'inferno', '裂隙深处是紫的，看久了会觉得它在收缩，像一只缓慢合上的眼。'],
      ['血河王座', '河水很慢', 'hell', '王座立在血河中央，河水流得很慢，绕过王座时也没有声音。'],
      ['风雪绝壁', '横抽的雪', 'snowfield', '绝壁上挂着冰，风把雪横着抽过来，打在岩壁上像细小的骨裂。'],
      ['紫焰核心', '无影之火', 'inferno', '核心的温度不高，但紫色的火没有影子，站在旁边也照不出人。'],
      ['血雨终庭', '雨从未停', 'hell', '终庭的雨一直下，地面已经分不清是血还是水，靴子陷进去拔不出来。'],
      ['终焉之座', '影子皆跪', 'abyss', '座上空着，但所有影子都朝着那个方向跪，包括你自己的。']
    ]
  };

  // 每章 3 套刷怪模板轮换使用；所有 id 均已存在于怪物数据中
  const ACT_TEMPLATES = {
    1: [
      { pool: ['wolf', 'skeleton', 'mistwalker', 'pea', 'foxraider'], elitePool: ['mawflower'], bossPool: ['eyehorror', 'croc', 'mawfish', 'slimeking'] },
      { pool: ['skeleton', 'musketeer', 'pumpkin', 'slime', 'frostwolf', 'bat', 'cowlbandit', 'mummy'], elitePool: ['plaguedoc'], bossPool: ['mummyking', 'eyehorror', 'croc', 'slimeking'] },
      { pool: ['wolf', 'fleece', 'foxraider', 'cowlbandit', 'bat'], elitePool: ['mawflower', 'plaguedoc'], bossPool: ['croc', 'mummyking', 'mawfish', 'slimeking'] }
    ],
    2: [
      { pool: ['beetle', 'cinderraven', 'candle', 'urchin', 'bat'], elitePool: ['warlock'], bossPool: ['cauldron', 'golem', 'blueogre', 'mushroomgun'] },
      { pool: ['skeleton', 'boneknight', 'mistwalker', 'venomlisk', 'slime', 'urchin', 'cinderraven', 'mummy'], elitePool: ['plaguedoc'], bossPool: ['abysseye', 'goatbrute', 'cauldron', 'mushroomgun'] },
      { pool: ['wolf', 'pumpkin', 'foxraider', 'bulwark', 'deepfin'], elitePool: ['mawflower'], bossPool: ['golem', 'blueogre', 'goatbrute', 'mushroomgun'] }
    ],
    3: [
      { pool: ['deepfin', 'angler', 'urchin', 'frostslime', 'bat'], elitePool: ['warlock'], bossPool: ['piratecrab', 'octoking', 'silverknight', 'mawflowerking'] },
      { pool: ['frostwolf', 'frostslime', 'fleece', 'bulwark', 'mistwalker', 'cowlbandit', 'deepfin'], elitePool: ['plaguedoc'], bossPool: ['snakeking', 'silverknight', 'octoking', 'wormking'] },
      { pool: ['cowlbandit', 'deepfin', 'venomlisk', 'bat', 'skeleton'], elitePool: ['warlock'], bossPool: ['octoking', 'piratecrab', 'snakeking', 'wormking'] }
    ],
    4: [
      { pool: ['bulwark', 'emberdrake', 'venomlisk', 'mistwalker', 'cinderraven'], elitePool: ['warlock', 'plaguedoc'], bossPool: ['reaper', 'crystalcrab', 'hierophant', 'pinkdemon'] },
      { pool: ['boneknight', 'skeleton', 'pumpkin', 'candle', 'beetle', 'cinderraven', 'urchin', 'mummy'], elitePool: ['plaguedoc'], bossPool: ['shadowdemon', 'hierophant', 'crystalcrab', 'pumpkinlord'] },
      { pool: ['frostwolf', 'frostslime', 'fleece', 'bulwark', 'wolf', 'emberdrake', 'cinderraven'], elitePool: ['warlock'], bossPool: ['crystalcrab', 'reaper', 'shadowdemon', 'hornedfiend', 'mushroommaw'] }
    ]
  };
  // 追加关卡的临时强度上限（随后会按 80 关统一重排为单调曲线）
  const ACT_CAP = {
    1: { ilvl: 10, reqLevel: 20 },
    2: { ilvl: 15, reqLevel: 30 },
    3: { ilvl: 20, reqLevel: 42 },
    4: { ilvl: 25, reqLevel: 58 }
  };
  const byAct = { 1: [], 2: [], 3: [], 4: [] };
  DG.data.dungeons.forEach(d => byAct[d.act].push(d));
  for (const act of [1, 2, 3, 4]) {
    const list = byAct[act];
    const prev = list[list.length - 1];
    const cap = ACT_CAP[act];
    const rows = EXTRA_STAGES[act];
    rows.forEach((row, j) => {
      const t = (j + 1) / rows.length;
      const ilvl = Math.min(cap.ilvl, Math.round(prev.ilvl + (cap.ilvl - prev.ilvl) * t));
      const reqLevel = Math.min(cap.reqLevel, Math.round(prev.reqLevel + (cap.reqLevel - prev.reqLevel) * t));
      const tpl = ACT_TEMPLATES[act][j % ACT_TEMPLATES[act].length];
      list.push({
        id: `act${act}-lv${j + 6}`, act, name: row[0], subtitle: row[1],
        ilvl, reqLevel,
        waves: [7 + Math.floor(ilvl / 5), 9 + Math.floor(ilvl / 5)],
        pool: tpl.pool.slice(),
        elitePool: tpl.elitePool.slice(),
        bossId: tpl.bossPool[j % tpl.bossPool.length],
        bossPool: tpl.bossPool.slice(),
        mapStyle: row[2],
        map: { minRooms: 8, maxRooms: 11 },
        desc: row[3]
      });
    });
  }
  DG.data.dungeons = [].concat(byAct[1], byAct[2], byAct[3], byAct[4]);
  // 80 关统一重排强度与门槛：保证整条主线单调递增，
  // 最终关 ilvl 25 / 推荐等级 58，与等级上限 60 对齐
  const span = Math.max(1, DG.data.dungeons.length - 1);
  DG.data.dungeons.forEach((d, i) => {
    d.ilvl = 1 + Math.round(i * 24 / span);
    d.reqLevel = 1 + Math.round(i * 57 / span);
  });

  // 关卡索引与章节索引，供 UI 与解锁判断快速使用
  DG.data.dungeonById = {};
  DG.data.dungeons.forEach((d, i) => {
    d.index = i + 1;
    d.actName = (DG.data.acts[d.act - 1] || {}).name || '';
    DG.data.dungeonById[d.id] = d;
  });

  // 首领投放：每章按固定顺序轮换已拆件重做的首领，逐关穿插，
  // 保证相邻关卡不会出现同一个首领，也不会出现连续多关只有一个首领的情况。
  // 首领名与新版拆件美术一一对应（见 js/data/monsters/bosses.js）。
  const BOSS_ROTATION = {
    1: ['mummyking', 'croc', 'eyehorror'],
    2: ['golem', 'mushroomgun', 'goatbrute', 'cauldron'],
    3: ['octoking', 'mawflowerking', 'crystalcrab', 'mummyking'],
    4: ['reaper', 'crystalcrab', 'pinkdemon', 'pumpkinlord']
  };
  const actCursor = {};
  DG.data.dungeons.forEach((d) => {
    const rot = BOSS_ROTATION[d.act];
    if (!rot || !rot.length) return;
    const k = actCursor[d.act] || 0;
    actCursor[d.act] = k + 1;
    const boss = rot[k % rot.length];
    d.bossId = boss;
    // 首领池只保留本关首领，避免旧配置继续被随机逻辑选中
    d.bossPool = [boss];
  });

  // 关卡解锁：等级达标 + 通关上一关
  // 最远通关进度：返回已通关关卡在全局列表中的最大下标，没有通关过返回 -1
  DG.data.progressIndex = function (char) {
    if (!char || !char.cleared) return -1;
    let max = -1;
    const list = DG.data.dungeons;
    for (let i = 0; i < list.length; i++) {
      if (char.cleared[list[i].id]) max = i;
    }
    return max;
  };

  // 解锁规则：进度之前的关卡一律视为已开启（连续前缀）。
  // 只要上一关已通关，下一关（含跨章的第一关）立即开放，等级只作为推荐值展示；
  // 等级门槛仅在「上一关尚未通关」时兜底，避免经验曲线调整或旧存档造成
  // 「已经通关却被等级卡在下一章」的死锁。
  DG.data.stageUnlocked = function (char, def) {
    if (!char || !def) return false;
    const idx = DG.data.dungeons.indexOf(def);
    if (idx < 0) return false;
    const max = DG.data.progressIndex(char);
    if (idx <= max) return true;
    const prev = DG.data.dungeons[idx - 1];
    if (prev && char.cleared && char.cleared[prev.id]) return true;
    if (idx > max + 1) return false;
    return char.level >= (def.reqLevel || 1);
  };

  DG.data.nextStage = function (id) {
    const idx = DG.data.dungeons.findIndex(d => d.id === id);
    return idx >= 0 ? DG.data.dungeons[idx + 1] || null : null;
  };

  // 关卡难度曲线：怪物数量完全不改，只重排数值成长与首领节奏。
  // 设计目标：
  //   1. 新号前 10 关击杀干脆、挨打不疼，第一只首领 20 秒内能打完；
  //   2. 中期平滑抬升，让装备与技能开始接管强度；
  //   3. 后期伤害二次增长，保留精英/首领的压迫感，避免变成无脑割草。
  DG.data.stageTuning = function (def) {
    const list = DG.data.dungeons || [];
    const idx = Math.max(1, (def && def.index) || (list.indexOf(def) + 1) || 1);
    const n = Math.max(1, list.length);
    const p = Math.min(1, (idx - 1) / Math.max(1, n - 1));
    const ilvl = Math.max(1, (def && def.ilvl) || 1);
    const q = ilvl - 1;
    // 新手保护：前 11 关逐级减弱，之后完全消失
    const rookie = Math.max(0, 1 - (idx - 1) / 11);
    return {
      index: idx,
      progress: p,
      rookie,
      // 小怪：血量增长放缓；伤害前期低、后期重新变陡
      mobHp: (1 + q * 0.26 + q * q * 0.003) * (1 - rookie * 0.12),
      mobDmg: (1 + q * 0.16 + q * q * 0.006) * (1 - rookie * 0.22),
      // 首领：血量单独走更缓的曲线，缩短单场首领耗时；伤害保留后期压力
      bossHp: (1 + q * 0.14 + q * q * 0.0035) * (1 - rookie * 0.3),
      bossDmg: (1 + q * 0.14 + q * q * 0.006) * (1 - rookie * 0.2),
      // 精英：前期更轻、出现率略低，后期回到原来的威胁（怪物总数不变）
      eliteHp: 1.45 + 0.75 * p,
      eliteDmg: 1.28 + 0.12 * p,
      eliteChance: 0.2 + 0.12 * p,
      randomElite: 0.05 + 0.04 * p,
      // 经验：让新号正常推图就能跟上技能解锁与推荐等级
      xp: (1 + q * 0.18) * (1 + rookie * 0.35)
    };
  };
})();


;
/* ==== js/data/skills.js ==== */
/* 技能注册表：职业技能定义按角色放在 data/classes/<id>.js，本文件只提供容器与公共工具 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.data = DG.data || {};

  DG.data.skills = DG.data.skills || {};
  DG.data.skillTags = DG.data.skillTags || {};

  // 技能描述里统一的百分比格式化
  DG.data.pct = (v) => `${U.round(v * 100, 0)}%`;

  // 主技能按角色等级解锁：未配置 unlock 的技能默认 1 级可用
  DG.data.skillUnlocked = (char, id) => {
    const sk = DG.data.skills[id];
    if (!sk) return false;
    return !sk.unlock || !char || char.level >= sk.unlock;
  };

  // 依据等级取技能描述；等级为 0 时按 1 级预览
  DG.data.skillDesc = (id, lv) => {
    const sk = DG.data.skills[id];
    if (!sk) return '';
    return sk.desc(Math.max(1, lv));
  };
})();


;
/* ==== js/data/talents.js ==== */
/* 天赋树注册表：每个职业的 3 分支 × 6 节点树放在 data/classes/<id>.js */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};
  DG.data.talents = DG.data.talents || {};
})();


;
/* ==== js/data/classes.js ==== */
/* 职业注册表：新增角色只需在 data/classes/ 下新建一个文件并调用 registerClass */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};

  DG.data.classes = {};
  DG.data.classList = [];

  // 功能图标：技能书等全职业共用（common）；装备图标按职业一一对应，放在 assets/ui/<职业id>/
  DG.data.commonIcons = {
    skill: 'assets/ui/common/func-skill.png'
  };

  // 取某个职业的功能图标：该职业有专属图就用专属图，否则回落到公共图
  DG.data.iconFor = function (clsId, key) {
    const cls = DG.data.classes[clsId];
    if (cls && cls.icons && cls.icons[key]) return cls.icons[key];
    return DG.data.commonIcons[key] || '';
  };

  /**
   * 注册一个可选角色。
   * @param {object} def   职业基础定义（id/name/base/skills/starterWeapon 等）
   * @param {object} parts 该角色独占内容：skills / skillTags / talents
   */
  DG.data.registerClass = function (def, parts) {
    if (!def || !def.id) throw new Error('registerClass 缺少职业 id');
    DG.data.classes[def.id] = def;
    DG.data.classList.push(def.id);
    if (parts) {
      if (parts.skills) Object.assign(DG.data.skills, parts.skills);
      if (parts.skillTags) Object.assign(DG.data.skillTags, parts.skillTags);
      if (parts.talents) DG.data.talents[def.id] = parts.talents;
    }
    return def;
  };
})();


;
/* ==== js/data/classes/warrior.js ==== */
/* 角色模块 · 野蛮人（重甲近战）：职业数值 / 技能 / 天赋树集中在本文件 */
(function () {
  const DG = window.DG;
  const pct = DG.data.pct;

  const skills = {
    cleave: {
      id: 'cleave', name: '挥砍', glyph: '斩', classId: 'warrior', icon: 'assets/ui/warrior/skill-cleave.png',
      unlock: 1,
      type: 'melee', cooldown: 0, range: 84, arc: Math.PI * 0.62,
      color: '#e2a06a',
      // 劈砍刀光由 barbarian.js 沿右手斧刃轨迹自绘，不再走通用程序化弧线
      slashFx: 'hero',
      mult: (lv) => 1.0 + 0.12 * (lv - 1),
      desc: (lv) => `挥刃劈砍前方扇形范围，造成 <em>${pct(1.0 + 0.12 * (lv - 1))}</em> 攻击力伤害。`
    },
    whirlwind: {
      id: 'whirlwind', name: '旋风', glyph: '旋', classId: 'warrior', icon: 'assets/ui/warrior/skill-whirlwind.png',
      unlock: 4,
      type: 'aoeSelf', cooldown: 8, radius: 150, color: '#e08a56',
      mult: (lv) => 1.7 + 0.25 * (lv - 1),
      desc: (lv) => `旋身 5 秒，期间移速 +30%、不可阻挡，持续对周身 ${150} 码内敌人造成每秒 <em>${pct((1.7 + 0.25 * (lv - 1)) * 0.5)}</em> 攻击力伤害。`
    },
    charge: {
      id: 'charge', name: '冲锋', glyph: '冲', classId: 'warrior', icon: 'assets/ui/warrior/skill-charge.png',
      unlock: 8,
      type: 'dash', cooldown: 8, dist: 240, damageOnPath: true, trailColor: '#e2a06a',
      mult: (lv) => 2.1 + 0.3 * (lv - 1),
      desc: (lv) => `向前突进并撞开路径上的敌人，造成 <em>${pct(2.1 + 0.3 * (lv - 1))}</em> 攻击力伤害。`
    },
    shockwave: {
      id: 'shockwave', name: '震动波', glyph: '波', classId: 'warrior', icon: 'assets/ui/warrior/skill-shockwave.png',
      unlock: 12,
      type: 'projectile', cooldown: 7, speed: 520, range: 430, color: '#e8a467',
      mult: (lv) => 1.55 + 0.2 * (lv - 1),
      desc: (lv) => `向前轰出冲击波，对沿途敌人造成 <em>${pct(1.55 + 0.2 * (lv - 1))}</em> 攻击力伤害。`
    },
    warcry: {
      id: 'warcry', name: '战吼', glyph: '吼', classId: 'warrior', icon: 'assets/ui/warrior/skill-warcry.png',
      unlock: 16,
      type: 'nova', cooldown: 11, radius: 200, slow: 0.4, slowDur: 2.2,
      color: '#f0b981',
      mult: (lv) => 0.9 + 0.12 * (lv - 1),
      desc: (lv) => `战吼震慑 ${200} 码内敌人，造成 <em>${pct(0.9 + 0.12 * (lv - 1))}</em> 攻击力伤害并使其减速。`
    }
  };

  const skillTags = {
    cleave: ['melee'],
    whirlwind: ['melee'],
    charge: ['melee'],
    shockwave: ['melee'],
    warcry: ['melee']
  };

  const talents = {
    id: 'warrior',
    name: '野蛮人',
    branches: [
      {
        id: 'rage',
        name: '血怒',
        desc: '以伤换伤，残血时爆发',
        nodes: [
          { id: 'w_rage_1', name: '裂刃', glyph: '刃', desc: '近战伤害 +8%', tags: { melee: 8 } },
          { id: 'w_rage_2', name: '狂怒', glyph: '怒', desc: '攻击速度 +8%', mods: { attackSpeedPct: 8 } },
          { id: 'w_rage_3', name: '重击', glyph: '重', desc: '暴击率 +6%', mods: { crit: 6 } },
          { id: 'w_rage_4', name: '破甲', glyph: '破', desc: '暴击伤害 +20%', mods: { critDmg: 20 } },
          { id: 'w_rage_5', name: '旋风', glyph: '旋', desc: '旋风半径 +15%', skill: { ids: ['whirlwind'], radiusPct: 15 } },
          {
            id: 'w_rage_6', name: '血怒', glyph: '血', keystone: true, levelReq: 12,
            desc: '生命低于 40% 时，造成的所有伤害 +35%', flag: 'bloodRage'
          }
        ]
      },
      {
        id: 'defense',
        name: '铁壁',
        desc: '站得住才有输出',
        nodes: [
          { id: 'w_def_1', name: '厚甲', glyph: '甲', desc: '最大生命 +10%', mods: { maxHpPct: 10 } },
          { id: 'w_def_2', name: '铁骨', glyph: '骨', desc: '护甲 +15%', mods: { armorPct: 15 } },
          { id: 'w_def_3', name: '再生', glyph: '愈', desc: '生命回复 +1.5/秒', mods: { hpRegen: 1.5 } },
          { id: 'w_def_4', name: '坚壁', glyph: '壁', desc: '受到伤害后 2 秒内护甲 +20%', flag: 'fortify' },
          {
            id: 'w_def_5', name: '战意', glyph: '吼',
            desc: '战吼半径 +15%，减速效果 +10%',
            skill: { ids: ['warcry'], radiusPct: 15, slowPct: 10 }
          },
          {
            id: 'w_def_6', name: '不屈', glyph: '屈', keystone: true, levelReq: 12,
            desc: '每 60 秒免疫一次致死伤害，并回复 25% 最大生命', flag: 'unyielding'
          }
        ]
      },
      {
        id: 'charge',
        name: '破阵',
        desc: '冲锋开团，越战越勇',
        nodes: [
          { id: 'w_chg_1', name: '疾行', glyph: '行', desc: '移动速度 +8%', mods: { moveSpeedPct: 8 } },
          { id: 'w_chg_2', name: '冲锋强化', glyph: '冲', desc: '冲锋冷却 -20%', skill: { ids: ['charge'], cdrPct: 20 } },
          { id: 'w_chg_3', name: '余震', glyph: '震', desc: '冲锋后 3 秒内攻击速度 +20%', flag: 'chargeHaste' },
          { id: 'w_chg_4', name: '战吼回响', glyph: '响', desc: '战吼冷却 -15%', skill: { ids: ['warcry'], cdrPct: 15 } },
          { id: 'w_chg_5', name: '势不可挡', glyph: '势', desc: '击杀后移动速度 +15%，持续 3 秒', flag: 'killRush' },
          {
            id: 'w_chg_6', name: '破阵', glyph: '阵', keystone: true, levelReq: 12,
            desc: '冲锋路径伤害 +100%，冲锋后 3 秒内暴击率 +15%', flag: 'breaker'
          }
        ]
      }
    ]
  };

  DG.data.registerClass({
    id: 'warrior',
    name: '野蛮人',
    title: '狂战近战',
    glyph: '蛮',
    color: '#c4553e',
    desc: '高生命与护甲，挥动巨刃清空近身一切。',
    base: {
      atk: 13, hp: 170, armor: 22, crit: 5, critDmg: 150,
      moveSpeed: 214, attackSpeed: 1.00, hpRegen: 1.6
    },
    autoSkill: 'cleave',
    skills: ['whirlwind', 'charge', 'shockwave', 'warcry'],
    starterWeapon: 'sword',
    icons: { equip: 'assets/ui/warrior/func-equip.png' }
  }, { skills, skillTags, talents });
})();


;
/* ==== js/data/classes/ranger.js ==== */
/* 角色模块 · 游侠（远程射手）：职业数值 / 技能 / 天赋树集中在本文件 */
(function () {
  const DG = window.DG;
  const pct = DG.data.pct;

  const skills = {
    arrow: {
      id: 'arrow', name: '穿刺箭', glyph: '箭', classId: 'ranger', icon: 'assets/ui/ranger/skill-arrow.png',
      type: 'projectile', cooldown: 0, speed: 760, range: 640, color: '#b8d4a6',
      fx: { variant: 'wind', impact: 'arrowImpact' },
      mult: (lv) => 1.0 + 0.12 * (lv - 1),
      desc: (lv) => `射出箭矢，造成 <em>${pct(1.0 + 0.12 * (lv - 1))}</em> 攻击力伤害。`
    },
    multishot: {
      id: 'multishot', name: '多重箭', glyph: '雨', classId: 'ranger', icon: 'assets/ui/ranger/skill-multishot.png',
      type: 'spread', cooldown: 5, count: 5, spread: 0.52, speed: 700, range: 600,
      color: '#b8d4a6', energy: 12, fx: { variant: 'fan', impact: 'arrowImpact' },
      mult: (lv) => 0.72 + 0.09 * (lv - 1),
      desc: (lv) => `一次射出 5 支箭矢，每支造成 <em>${pct(0.72 + 0.09 * (lv - 1))}</em> 攻击力伤害。（消耗 12 精力）`
    },
    roll: {
      id: 'roll', name: '翻滚', glyph: '翻', classId: 'ranger', icon: 'assets/ui/ranger/skill-roll.png',
      type: 'dash', cooldown: 5.5, dist: 210, invuln: 0.5, trailColor: '#9fc0a8', energy: 15,
      fx: { variant: 'roll', markColor: '#9fc0a8' },
      mult: () => 0,
      desc: () => `向瞄准方向翻滚，翻滚期间<em>免疫伤害</em>。（消耗 15 精力）`
    },
    snipe: {
      id: 'snipe', name: '穿云箭', glyph: '云', classId: 'ranger', icon: 'assets/ui/ranger/skill-snipe.png',
      type: 'projectile', cooldown: 8, speed: 900, range: 720, pierce: 2,
      color: '#d6ecc0', energy: 30, fx: { variant: 'snipe', impact: 'snipeImpact' },
      mult: (lv) => 2.2 + 0.28 * (lv - 1),
      desc: (lv) => `射出一支贯穿箭矢，可穿透 2 名敌人，造成 <em>${pct(2.2 + 0.28 * (lv - 1))}</em> 攻击力伤害。（消耗 30 精力）`
    },
    arrowrain: {
      id: 'arrowrain', name: '箭雨', glyph: '坠', classId: 'ranger', icon: 'assets/ui/ranger/skill-arrowrain.png',
      type: 'spread', cooldown: 9, count: 7, spread: 0.95, speed: 660, range: 580,
      color: '#c2dbaa', energy: 40, fx: { variant: 'rain', impact: 'arrowImpact' },
      mult: (lv) => 0.55 + 0.08 * (lv - 1),
      desc: (lv) => `向身前扇形倾泻 7 支箭矢，每支造成 <em>${pct(0.55 + 0.08 * (lv - 1))}</em> 攻击力伤害。（消耗 40 精力）`
    }
  };

  const skillTags = {
    arrow: ['ranged'],
    multishot: ['ranged'],
    roll: ['ranged'],
    snipe: ['ranged'],
    arrowrain: ['ranged']
  };

  const talents = {
    id: 'ranger',
    name: '游侠',
    branches: [
      {
        id: 'arrow',
        name: '箭术',
        desc: '把每一支箭都送进要害',
        nodes: [
          { id: 'r_arc_1', name: '锐箭', glyph: '箭', desc: '远程伤害 +8%', tags: { ranged: 8 } },
          { id: 'r_arc_2', name: '速射', glyph: '速', desc: '攻击速度 +8%', mods: { attackSpeedPct: 8 } },
          { id: 'r_arc_3', name: '精准', glyph: '准', desc: '暴击率 +6%', mods: { crit: 6 } },
          { id: 'r_arc_4', name: '穿甲', glyph: '穿', desc: '暴击伤害 +20%', mods: { critDmg: 20 } },
          {
            id: 'r_arc_5', name: '箭雨', glyph: '雨',
            desc: '多重箭 / 箭雨额外 +1 支箭',
            skill: { ids: ['multishot', 'arrowrain'], countBonus: 1 }
          },
          {
            id: 'r_arc_6', name: '箭幕', glyph: '幕', keystone: true, levelReq: 12,
            desc: '每第 5 次普攻额外射出 8 支环形箭矢（每支 60% 伤害）', flag: 'arrowCurtain'
          }
        ]
      },
      {
        id: 'mobile',
        name: '游走',
        desc: '活着，才能继续射',
        nodes: [
          { id: 'r_mob_1', name: '轻身', glyph: '身', desc: '移动速度 +10%', mods: { moveSpeedPct: 10 } },
          { id: 'r_mob_2', name: '翻滚精通', glyph: '翻', desc: '翻滚冷却 -25%', skill: { ids: ['roll'], cdrPct: 25 } },
          { id: 'r_mob_3', name: '翻滚余势', glyph: '势', desc: '翻滚后 3 秒内攻击速度 +20%', flag: 'rollHaste' },
          { id: 'r_mob_4', name: '脱战', glyph: '脱', desc: '受击后 2 秒内移动速度 +20%', flag: 'postHurtMove' },
          { id: 'r_mob_5', name: '闪避本能', glyph: '闪', desc: '翻滚无敌时间 +0.3 秒', flag: 'rollInvuln' },
          {
            id: 'r_mob_6', name: '影步', glyph: '影', keystone: true, levelReq: 12,
            desc: '翻滚结束时向最近敌人射出 3 支穿透箭（120% 伤害）', flag: 'shadowStep'
          }
        ]
      },
      {
        id: 'hunt',
        name: '猎杀',
        desc: '先手压制，残血收割',
        nodes: [
          { id: 'r_hun_1', name: '先手', glyph: '先', desc: '对生命高于 70% 的敌人伤害 +20%', mods: { highHpDmgPct: 20 } },
          { id: 'r_hun_2', name: '猎杀', glyph: '猎', desc: '对首领伤害 +12%', mods: { bossDmgPct: 12 } },
          { id: 'r_hun_3', name: '追击', glyph: '追', desc: '对减速目标暴击率 +10%', mods: { slowedCrit: 10 } },
          { id: 'r_hun_4', name: '汲取', glyph: '汲', desc: '击杀回复 2% 最大生命', mods: { killHealPct: 2 } },
          { id: 'r_hun_5', name: '致命', glyph: '命', desc: '暴击伤害 +15%', mods: { critDmg: 15 } },
          {
            id: 'r_hun_6', name: '处决', glyph: '决', keystone: true, levelReq: 12,
            desc: '普通敌人生命低于 15% 时直接击杀；首领额外受到 30% 伤害', flag: 'execute'
          }
        ]
      }
    ]
  };

  DG.data.registerClass({
    id: 'ranger',
    name: '游侠',
    title: '远程射手',
    glyph: '游',
    color: '#4f8f6b',
    desc: '灵活走位与高速射击，以箭雨压制战场。',
    base: {
      atk: 12, hp: 125, armor: 10, crit: 8, critDmg: 160,
      moveSpeed: 250, attackSpeed: 1.15, hpRegen: 1.0
    },
    autoSkill: 'arrow',
    skills: ['multishot', 'roll', 'snipe', 'arrowrain'],
    starterWeapon: 'bow',
    icons: { equip: 'assets/ui/ranger/func-equip.png' }
  }, { skills, skillTags, talents });
})();


;
/* ==== js/data/classes/mage.js ==== */
/* 角色模块 · 术士（元素施法）：职业数值 / 技能 / 天赋树集中在本文件 */
(function () {
  const DG = window.DG;
  const pct = DG.data.pct;

  const skills = {
    firebolt: {
      id: 'firebolt', name: '奥术飞弹', glyph: '弹', classId: 'mage',
      type: 'projectile', cooldown: 0, speed: 560, range: 620, color: '#9d9df0',
      mult: (lv) => 1.15 + 0.13 * (lv - 1),
      desc: (lv) => `凝聚奥术飞弹，造成 <em>${pct(1.15 + 0.13 * (lv - 1))}</em> 攻击力伤害。`
    },
    frostnova: {
      id: 'frostnova', name: '冰霜新星', glyph: '霜', classId: 'mage',
      type: 'nova', cooldown: 7, radius: 165, slow: 0.5, slowDur: 2.6,
      color: '#8ec9e8',
      mult: (lv) => 1.3 + 0.2 * (lv - 1),
      desc: (lv) => `释放冰环，对 ${165} 码内敌人造成 <em>${pct(1.3 + 0.2 * (lv - 1))}</em> 攻击力伤害并减速。`
    },
    blink: {
      id: 'blink', name: '闪现', glyph: '闪', classId: 'mage',
      type: 'dash', cooldown: 7, dist: 240, teleport: true, invuln: 0.15,
      trailColor: '#9d9df0',
      mult: () => 0,
      desc: () => `瞬移至瞄准方向，落地时短暂<em>免疫伤害</em>。`
    },
    meteor: {
      id: 'meteor', name: '陨星术', glyph: '陨', classId: 'mage',
      type: 'nova', cooldown: 10, radius: 200, color: '#c39bf0',
      mult: (lv) => 2.0 + 0.26 * (lv - 1),
      desc: (lv) => `召唤陨星砸落，对 ${200} 码内敌人造成 <em>${pct(2.0 + 0.26 * (lv - 1))}</em> 攻击力伤害。`
    },
    chainbolt: {
      id: 'chainbolt', name: '连锁奥术', glyph: '链', classId: 'mage',
      type: 'spread', cooldown: 4.5, count: 3, spread: 0.4, speed: 600, range: 600,
      color: '#b3c4ff',
      mult: (lv) => 0.85 + 0.1 * (lv - 1),
      desc: (lv) => `一次射出 3 枚奥术弹，每枚造成 <em>${pct(0.85 + 0.1 * (lv - 1))}</em> 攻击力伤害。`
    }
  };

  const skillTags = {
    firebolt: ['spell', 'arcane'],
    frostnova: ['spell', 'frost'],
    blink: ['spell'],
    meteor: ['spell', 'arcane'],
    chainbolt: ['spell', 'arcane']
  };

  const talents = {
    id: 'mage',
    name: '术士',
    branches: [
      {
        id: 'frost',
        name: '冰霜',
        desc: '控住全场，再慢慢碾碎',
        nodes: [
          { id: 'm_fro_1', name: '寒流', glyph: '寒', desc: '冰霜伤害 +10%', tags: { frost: 10 } },
          { id: 'm_fro_2', name: '霜冻', glyph: '霜', desc: '冰霜新星减速效果 +10%', skill: { ids: ['frostnova'], slowPct: 10 } },
          { id: 'm_fro_3', name: '冰冷专注', glyph: '冰', desc: '对减速目标伤害 +15%', mods: { slowedDmgPct: 15 } },
          { id: 'm_fro_4', name: '新星强化', glyph: '星', desc: '冰霜新星半径 +20%', skill: { ids: ['frostnova'], radiusPct: 20 } },
          { id: 'm_fro_5', name: '严寒', glyph: '严', desc: '冰霜新星减速持续时间 +30%', skill: { ids: ['frostnova'], slowDurPct: 30 } },
          {
            id: 'm_fro_6', name: '绝对零度', glyph: '零', keystone: true, levelReq: 12,
            desc: '冰霜新星使敌人冻结 1 秒（视作 100% 减速）', flag: 'absoluteZero'
          }
        ]
      },
      {
        id: 'arcane',
        name: '奥术',
        desc: '用纯粹的奥能淹没战场',
        nodes: [
          { id: 'm_arc_1', name: '奥能', glyph: '奥', desc: '奥术伤害 +10%', tags: { arcane: 10 } },
          { id: 'm_arc_2', name: '急速咏唱', glyph: '咏', desc: '攻击速度 +8%', mods: { attackSpeedPct: 8 } },
          { id: 'm_arc_3', name: '连锁强化', glyph: '链', desc: '连锁奥术 +2 枚弹', skill: { ids: ['chainbolt'], countBonus: 2 } },
          { id: 'm_arc_4', name: '陨星', glyph: '陨', desc: '陨星术半径 +15%', skill: { ids: ['meteor'], radiusPct: 15 } },
          { id: 'm_arc_5', name: '法力涌动', glyph: '涌', desc: '技能冷却 -10%', mods: { cdrPct: 10 } },
          {
            id: 'm_arc_6', name: '奥能过载', glyph: '载', keystone: true, levelReq: 12,
            desc: '每释放 3 次主动技能，下一次技能伤害 +120%', flag: 'overload'
          }
        ]
      },
      {
        id: 'void',
        name: '虚空',
        desc: '在死亡的边缘反复横跳',
        nodes: [
          { id: 'm_voi_1', name: '体魄', glyph: '体', desc: '最大生命 +10%', mods: { maxHpPct: 10 } },
          { id: 'm_voi_2', name: '虚空步', glyph: '步', desc: '闪现冷却 -20%', skill: { ids: ['blink'], cdrPct: 20 } },
          { id: 'm_voi_3', name: '残影', glyph: '影', desc: '闪现后 2 秒内受到伤害 -25%', flag: 'voidGuard' },
          { id: 'm_voi_4', name: '汲取', glyph: '汲', desc: '击杀回复 2% 最大生命', mods: { killHealPct: 2 } },
          { id: 'm_voi_5', name: '灵巧', glyph: '灵', desc: '移动速度 +8%', mods: { moveSpeedPct: 8 } },
          {
            id: 'm_voi_6', name: '虚化', glyph: '虚', keystone: true, levelReq: 12,
            desc: '生命低于 30% 时自动闪现脱离并重置闪现冷却（60 秒一次）', flag: 'voidShift'
          }
        ]
      }
    ]
  };

  DG.data.registerClass({
    id: 'mage',
    name: '术士',
    title: '元素施法',
    glyph: '术',
    color: '#6a6bb0',
    desc: '脆弱但爆发极高，用冰霜与奥术控住全场。',
    base: {
      atk: 15, hp: 105, armor: 5, crit: 5, critDmg: 175,
      moveSpeed: 206, attackSpeed: 0.95, hpRegen: 1.2
    },
    autoSkill: 'firebolt',
    skills: ['frostnova', 'blink', 'meteor', 'chainbolt'],
    starterWeapon: 'staff'
  }, { skills, skillTags, talents });
})();


;
/* ==== js/data/items.js ==== */
/* 装备生成：底材、词缀（含野蛮人流派词缀）、稀有度 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const C = DG.CONFIG;

  // 底材（implicit 为该底材固定的基础属性）
  const bases = DG.data.itemBases = [
    { id: 'sword', slot: 'weapon', name: '铁剑', cls: 'warrior', implicit: { atk: [5, 8] } },
    { id: 'axe', slot: 'weapon', name: '战斧', cls: 'warrior', implicit: { atk: [7, 11] } },
    { id: 'bow', slot: 'weapon', name: '短弓', cls: 'ranger', implicit: { atk: [4, 7] } },
    { id: 'staff', slot: 'weapon', name: '骨杖', cls: 'mage', implicit: { atk: [6, 9] } },
    { id: 'ironhelm', slot: 'helm', name: '铁盔', implicit: { armor: [4, 7] } },
    { id: 'bonehelm', slot: 'helm', name: '骨盔', implicit: { armor: [3, 6], hp: [8, 14] } },
    { id: 'hood', slot: 'helm', name: '狩猎兜帽', implicit: { armor: [2, 4], crit: [1, 2] } },
    { id: 'leather', slot: 'armor', name: '皮甲', implicit: { armor: [6, 10] } },
    { id: 'mail', slot: 'armor', name: '锁甲', implicit: { armor: [10, 15] } },
    { id: 'robe', slot: 'armor', name: '法袍', implicit: { armor: [4, 7], hp: [10, 20] } },
    { id: 'gloves', slot: 'gloves', name: '皮手套', implicit: { armor: [2, 4], attackSpeed: [2, 4] } },
    { id: 'gauntlet', slot: 'gloves', name: '铁手甲', implicit: { armor: [5, 8] } },
    { id: 'huntergrip', slot: 'gloves', name: '猎手护手', implicit: { atk: [2, 4] } },
    { id: 'boots', slot: 'boots', name: '皮靴', implicit: { armor: [2, 4], moveSpeed: [3, 6] } },
    { id: 'greaves', slot: 'boots', name: '胫甲', implicit: { armor: [6, 9] } },
    { id: 'sandals', slot: 'boots', name: '轻履', implicit: { armor: [2, 3], moveSpeed: [4, 7] } },
    { id: 'pauldron', slot: 'shoulder', name: '铁护肩', implicit: { armor: [3, 6] } },
    { id: 'spaulder', slot: 'shoulder', name: '皮革护肩', implicit: { armor: [2, 4], hp: [6, 12] } },
    { id: 'legging', slot: 'pants', name: '皮裤', implicit: { armor: [3, 5] } },
    { id: 'legplate', slot: 'pants', name: '腿甲', implicit: { armor: [5, 8] } },
    { id: 'clothpants', slot: 'pants', name: '布裤', implicit: { armor: [2, 3], hp: [8, 16] } },
    { id: 'shield', slot: 'offhand', name: '圆盾', cls: 'warrior', implicit: { armor: [5, 9] } },
    { id: 'orb', slot: 'offhand', name: '法球', cls: 'mage', implicit: { atk: [3, 6] } },
    { id: 'quiver', slot: 'offhand', name: '箭袋', cls: 'ranger', implicit: { atk: [2, 4], crit: [1, 2] } },
    { id: 'ring', slot: 'ring', name: '指环', implicit: {} },
    { id: 'amulet', slot: 'amulet', name: '护符', implicit: {} }
  ];

  const baseById = {};
  bases.forEach(b => { baseById[b.id] = b; });

  // 词缀池：通用属性 + 流派专属词缀
  // 流派词缀以 skill.<技能id>.<字段> 存储，战斗层聚合后直接生效
  const affixes = DG.data.affixes = [
    { stat: 'atk', min: 2, max: 4, weight: 10 },
    { stat: 'atkPct', min: 3, max: 7, weight: 5 },
    { stat: 'hp', min: 8, max: 16, weight: 10 },
    { stat: 'armor', min: 4, max: 9, weight: 7 },
    { stat: 'crit', min: 1.5, max: 3.5, weight: 5, decimals: 1 },
    { stat: 'critDmg', min: 6, max: 14, weight: 5 },
    { stat: 'moveSpeed', min: 3, max: 6, weight: 4, decimals: 1 },
    { stat: 'attackSpeed', min: 3, max: 6, weight: 4, decimals: 1 },
    { stat: 'hpRegen', min: 0.5, max: 1.5, weight: 4, decimals: 1 },

    // —— 野蛮人流派：挥砍（普攻/出血） ——
    { stat: 'skill.cleave.dmgPct', min: 8, max: 16, weight: 5, cls: 'warrior', family: 'cleave' },
    { stat: 'skill.cleave.arcPct', min: 6, max: 12, weight: 4, cls: 'warrior', family: 'cleave' },
    // —— 野蛮人流派：旋风 ——
    { stat: 'skill.whirlwind.dmgPct', min: 8, max: 18, weight: 5, cls: 'warrior', family: 'whirlwind' },
    { stat: 'skill.whirlwind.radiusPct', min: 6, max: 14, weight: 4, cls: 'warrior', family: 'whirlwind' },
    { stat: 'skill.whirlwind.cdrPct', min: 6, max: 14, weight: 4, cls: 'warrior', family: 'whirlwind' },
    // —— 野蛮人流派：冲锋 ——
    { stat: 'skill.charge.dmgPct', min: 10, max: 20, weight: 5, cls: 'warrior', family: 'charge' },
    { stat: 'skill.charge.cdrPct', min: 6, max: 14, weight: 4, cls: 'warrior', family: 'charge' },
    { stat: 'skill.charge.distPct', min: 8, max: 16, weight: 3, cls: 'warrior', family: 'charge' },
    // —— 野蛮人流派：震动波 ——
    { stat: 'skill.shockwave.dmgPct', min: 8, max: 18, weight: 5, cls: 'warrior', family: 'shockwave' },
    { stat: 'skill.shockwave.radiusPct', min: 6, max: 14, weight: 4, cls: 'warrior', family: 'shockwave' },
    { stat: 'skill.shockwave.pierceBonus', min: 1, max: 1, weight: 3, cls: 'warrior', family: 'shockwave', decimals: 0 },
    // —— 野蛮人流派：战吼 ——
    { stat: 'skill.warcry.dmgPct', min: 10, max: 20, weight: 5, cls: 'warrior', family: 'warcry' },
    { stat: 'skill.warcry.radiusPct', min: 8, max: 16, weight: 4, cls: 'warrior', family: 'warcry' },
    { stat: 'skill.warcry.slowPct', min: 5, max: 10, weight: 4, cls: 'warrior', family: 'warcry' },
    { stat: 'skill.warcry.slowDurPct', min: 10, max: 20, weight: 4, cls: 'warrior', family: 'warcry' },

    // —— 游侠流派 ——
    { stat: 'skill.arrow.dmgPct', min: 8, max: 16, weight: 4, cls: 'ranger', family: 'arrow' },
    { stat: 'skill.snipe.dmgPct', min: 10, max: 20, weight: 4, cls: 'ranger', family: 'snipe' },
    { stat: 'skill.multishot.countBonus', min: 1, max: 1, weight: 3, cls: 'ranger', family: 'multishot', decimals: 0 },
    // —— 法师流派 ——
    { stat: 'skill.meteor.dmgPct', min: 10, max: 20, weight: 4, cls: 'mage', family: 'meteor' },
    { stat: 'skill.frostnova.radiusPct', min: 6, max: 14, weight: 4, cls: 'mage', family: 'frostnova' },
    { stat: 'skill.chainbolt.dmgPct', min: 8, max: 16, weight: 4, cls: 'mage', family: 'chainbolt' }
  ];

  // 流派名称：用于稀有/传奇装备命名，让词条一眼能看出走了哪条路
  const families = {
    cleave: '裂刃', whirlwind: '疾风', charge: '破阵', shockwave: '震荡', warcry: '战栗',
    arrow: '穿云', snipe: '猎星', multishot: '箭雨',
    meteor: '陨火', frostnova: '霜环', chainbolt: '链雷'
  };

  const magicPrefix = ['锋锐的', '厚重的', '迅捷的', '幽影的', '守护的', '猎手的'];
  const rareSuffix = ['迷雾', '残响', '黎明', '沉沦', '断罪', '低语'];
  const legendNames = {
    weapon: '灭雾者',
    offhand: '守夜之壁',
    helm: '雾隐之冠',
    armor: '不眠壁垒',
    shoulder: '碎誓者',
    gloves: '碎岩之握',
    pants: '长夜行者',
    boots: '追风踏',
    ring: '回响之戒',
    amulet: '亡者低语'
  };

  // 套装名：绿装按部位取固定套装名，便于一眼看出成套
  const setNames = {
    weapon: '裂魂',
    offhand: '守誓',
    helm: '夜视',
    armor: '不眠',
    shoulder: '铁誓',
    gloves: '缚灵',
    pants: '长夜',
    boots: '逐暗',
    ring: '回响',
    amulet: '低语'
  };

  // 流派词缀的显示文案：skill.<id>.<字段>
  const SKILL_FIELD = {
    dmgPct: { label: '伤害', suffix: '%', decimals: 0 },
    cdrPct: { label: '冷却缩减', suffix: '%', decimals: 0 },
    radiusPct: { label: '范围', suffix: '%', decimals: 0 },
    arcPct: { label: '弧度', suffix: '%', decimals: 0 },
    slowPct: { label: '减速强度', suffix: '%', decimals: 0 },
    slowDurPct: { label: '减速持续', suffix: '%', decimals: 0 },
    countBonus: { label: '额外投射物', suffix: '', decimals: 0 },
    pierceBonus: { label: '穿透', suffix: '', decimals: 0 },
    distPct: { label: '距离', suffix: '%', decimals: 0 }
  };

  function randRarity(minIndex) {
    let list = DG.data.rarity;
    if (minIndex > 0) list = list.slice(minIndex);
    return U.weighted(list);
  }

  function rollImplicit(base, ilvl, mul) {
    const out = {};
    const factor = (1 + Math.max(0, ilvl - 1) * 0.12) * (mul || 1);
    for (const key in base.implicit) {
      const [a, b] = base.implicit[key];
      const meta = C.STAT_META[key] || {};
      const raw = U.rand(a, b) * factor;
      out[key] = meta.decimals ? U.round(raw, meta.decimals) : Math.max(1, Math.round(raw));
    }
    return out;
  }

  function rollAffixValue(def, ilvl) {
    const factor = 1 + Math.max(0, ilvl - 1) * 0.16;
    const raw = U.rand(def.min, def.max) * factor;
    return U.round(raw, def.decimals || 0);
  }

  const items = DG.items = {
    baseById,

    // 拆解 skill.<id>.<字段>，返回 null 表示普通属性
    skillStat(stat) {
      if (!stat || stat.indexOf('skill.') !== 0) return null;
      const rest = stat.slice(6);
      const dot = rest.lastIndexOf('.');
      if (dot <= 0) return null;
      const id = rest.slice(0, dot);
      const field = rest.slice(dot + 1);
      const sk = DG.data.skills[id];
      return {
        id, field,
        skillName: sk ? sk.name : id,
        meta: SKILL_FIELD[field] || { label: field, suffix: '', decimals: 0 }
      };
    },

    formatStat(stat, value) {
      const ss = items.skillStat(stat);
      if (ss) {
        const v = U.round(value, ss.meta.decimals);
        return {
          label: `${ss.skillName}${ss.meta.label}`,
          text: `+${v}${ss.meta.suffix}`
        };
      }
      const meta = C.STAT_META[stat] || { label: stat, suffix: '', decimals: 0 };
      const v = U.round(value, meta.decimals);
      return {
        label: meta.label,
        text: `+${v}${meta.suffix}`
      };
    },

    statsOf(item) {
      const out = {};
      if (!item) return out;
      const add = (k, v) => { out[k] = (out[k] || 0) + v; };
      for (const k in item.implicit) add(k, item.implicit[k]);
      for (const a of (item.affixes || [])) add(a.stat, a.value);
      return out;
    },

    // 装备对比用的粗略评分
    score(item) {
      if (!item) return 0;
      const s = items.statsOf(item);
      const w = {
        atk: 3, atkPct: 3, hp: 0.55, armor: 2, crit: 4.5,
        critDmg: 0.7, moveSpeed: 1.3, attackSpeed: 3.2, hpRegen: 2.4
      };
      let total = 0;
      for (const k in s) {
        if (k.indexOf('skill.') === 0) {
          // 流派词缀按技能威力折算，便于背包里快速比较
          total += (s[k] || 0) * (k.indexOf('countBonus') > 0 ? 12 : 2.6);
        } else {
          total += (s[k] || 0) * (w[k] || 0);
        }
      }
      return Math.round(total);
    },

    displayName(item) {
      return item ? item.name : '';
    },

    // 装备属性行
    describe(item) {
      const lines = [];
      if (!item) return lines;
      for (const k in item.implicit) {
        const f = items.formatStat(k, item.implicit[k]);
        lines.push({ label: f.label, text: f.text });
      }
      for (const a of (item.affixes || [])) {
        const f = items.formatStat(a.stat, a.value);
        lines.push({ label: f.label, text: f.text, skill: !!items.skillStat(a.stat) });
      }
      return lines;
    },

    // 生成一件装备
    generate(ilvl, opts) {
      opts = opts || {};
      ilvl = Math.max(1, Math.round(ilvl || 1));
      const minIndex = opts.minRarity ? DG.data.rarity.findIndex(r => r.id === opts.minRarity) : 0;
      const rarity = opts.rarity
        ? (DG.data.rarityById[opts.rarity] || DG.data.rarity[0])
        : randRarity(Math.max(0, minIndex));

      let base;
      const allowBase = b => !b.cls || !opts.cls || b.cls === opts.cls;
      if (opts.baseId && baseById[opts.baseId]) base = baseById[opts.baseId];
      else if (opts.slot) {
        const list = bases.filter(b => b.slot === opts.slot && allowBase(b));
        base = U.pick(list.length ? list : bases.filter(b => b.slot === opts.slot));
      } else {
        const list = bases.filter(allowBase);
        base = U.pick(list.length ? list : bases);
      }

      // 远古：仅套装与暗金可出，属性与词缀数量都更强
      const ancient = (rarity.id === 'set' || rarity.id === 'legend') &&
        (opts.ancient != null ? !!opts.ancient : U.chance(0.12));

      const implicit = rollImplicit(base, ilvl, ancient ? 1.3 : 1);

      // 词缀数量
      let count = U.randInt(rarity.affix[0], rarity.affix[1]);
      if (rarity.id === 'legend') count = Math.max(count, 4);
      if (ancient) count += 1;

      // 职业限定的流派词缀只对对应职业掉落，避免给别的职业一堆无效词条
      const pool = affixes.filter(a => {
        if (a.stat in implicit) return false;
        if (a.cls && opts.cls && a.cls !== opts.cls) return false;
        return true;
      });
      const chosen = [];
      const used = {};
      for (let i = 0; i < count && pool.length; i++) {
        const candidates = pool.filter(a => !used[a.stat]);
        if (!candidates.length) break;
        const def = U.weighted(candidates);
        used[def.stat] = true;
        let value = rollAffixValue(def, ilvl);
        if (rarity.id === 'legend') value = U.round(value * 1.15, def.decimals || 0);
        if (ancient) value = U.round(value * 1.3, def.decimals || 0);
        chosen.push({ stat: def.stat, value });
      }

      // 装备名：传奇固定名，稀有带流派名，魔法带品质前缀
      const mainFamily = chosen.map(a => (affixes.find(x => x.stat === a.stat) || {}).family).filter(Boolean)[0];
      let name = base.name;
      if (rarity.id === 'magic') name = U.pick(magicPrefix) + base.name;
      else if (rarity.id === 'rare') {
        name = (mainFamily && families[mainFamily] ? families[mainFamily] + '之' : '') + base.name + ' · ' + U.pick(rareSuffix);
      } else if (rarity.id === 'set') {
        name = (setNames[base.slot] || '套装') + '·' + base.name;
      } else if (rarity.id === 'legend') {
        name = legendNames[base.slot] || base.name;
        if (mainFamily && families[mainFamily]) name = families[mainFamily] + ' · ' + name;
      }
      if (ancient) name = '远古·' + name;

      return {
        id: U.uid(),
        slot: base.slot,
        baseId: base.id,
        name,
        rarity: rarity.id,
        ancient,
        ilvl,
        implicit,
        affixes: chosen
      };
    },

    // 重铸：保留底材 / 品质 / 等级，重掷基础属性与词缀。
    // 作为金币的主要消耗出口，价格随装备等级与品质上涨
    rerollCost(item) {
      if (!item) return 0;
      const mul = { normal: 0.6, magic: 1, rare: 2, set: 2.6, legend: 3.5 }[item.rarity] || 0.6;
      return Math.round((100 + (item.ilvl || 1) * 100) * mul);
    },

    reroll(item, cls) {
      if (!item) return null;
      const fresh = items.generate(item.ilvl || 1, {
        baseId: item.baseId,
        rarity: item.rarity,
        cls,
        ancient: item.ancient
      });
      fresh.id = item.id;
      return fresh;
    },

    slotInfo(slotId) {
      return C.SLOTS.find(s => s.id === slotId) || C.SLOTS[0];
    },

    rarityInfo(item) {
      return DG.data.rarityById[item && item.rarity] || DG.data.rarity[0];
    },

    // 品质文案：普通 / 魔法 / 稀有 / 套装 / 暗金，远古前缀
    qualityLabel(item) {
      const r = items.rarityInfo(item);
      return (item && item.ancient ? '远古' : '') + r.name;
    }
  };
})();


;
/* ==== js/data/skill-tree.js ==== */
/* 野蛮人 · 五技能辅助技能树数据
   每个主技能 6 个辅助节点：中间 2 个（直接连接主技能）、底部 4 个（各挂在一个中间节点下）。
   节点只负责激活状态与效果说明，消耗技能点 1 点；主技能本身按角色等级解锁。 */
(function () {
  const DG = window.DG;
  const ICON = 'assets/ui/skill/aux-';

  DG.data.skillTrees = DG.data.skillTrees || {};

  DG.data.skillTrees.warrior = [
    {
      id: 'cleave', skill: 'cleave', name: '挥砍',
      group: 'basic', unlock: 1,
      desc: '挥刃劈砍前方扇形范围，野蛮人的起手技能。',
      nodes: [
        { id: 'w_cleave_bone', name: '碎骨', slot: 0, icon: ICON + 'cleave-bone.png',
          desc: '挥砍有 25% 概率击碎护甲，使目标护甲降低 30%，持续 3 秒。' },
        { id: 'w_cleave_thirst', name: '嗜血', slot: 1, icon: ICON + 'cleave-thirst.png',
          desc: '挥砍造成伤害的 8% 转化为自身生命。' },
        { id: 'w_cleave_mince', name: '碎肉', slot: 2, icon: ICON + 'cleave-mince.png',
          desc: '挥砍命中生命低于 40% 的敌人时，伤害提高 35%。' },
        { id: 'w_cleave_tendon', name: '断筋', slot: 3, icon: ICON + 'cleave-tendon.png',
          desc: '挥砍命中的敌人移动速度降低 40%，持续 2 秒。' },
        { id: 'w_cleave_burst', name: '血爆', slot: 4, icon: ICON + 'cleave-burst.png',
          desc: '挥砍暴击时引发血爆，对周围 80 码敌人造成 40% 攻击力伤害。' },
        { id: 'w_cleave_toxin', name: '血毒', slot: 5, icon: ICON + 'cleave-toxin.png',
          desc: '挥砍附加流血，3 秒内每秒造成 12% 攻击力伤害。' }
      ]
    },
    {
      id: 'whirlwind', skill: 'whirlwind', name: '旋风斩',
      group: 'strong', unlock: 4,
      desc: '旋身 5 秒，期间移速提高且不可阻挡，持续伤害周身敌人。',
      nodes: [
        { id: 'w_whirlwind_tornado', name: '龙卷风', slot: 0, icon: ICON + 'whirlwind-tornado.png',
          desc: '旋风斩起手额外召唤 1 道游走龙卷风。' },
        { id: 'w_whirlwind_gale', name: '疾风', slot: 1, icon: ICON + 'whirlwind-gale.png',
          desc: '旋风斩期间移动速度额外提高 20%。' },
        { id: 'w_whirlwind_eye', name: '风眼', slot: 2, icon: ICON + 'whirlwind-eye.png',
          desc: '旋风斩每命中一名敌人，伤害提高 3%，最多叠加 10 层。' },
        { id: 'w_whirlwind_range', name: '范围', slot: 3, icon: ICON + 'whirlwind-range.png',
          desc: '旋风斩半径扩大 25%。' },
        { id: 'w_whirlwind_frenzy', name: '狂暴', slot: 4, icon: ICON + 'whirlwind-frenzy.png',
          desc: '旋风斩持续期间攻击速度提高 30%。' },
        { id: 'w_whirlwind_endless', name: '不息', slot: 5, icon: ICON + 'whirlwind-endless.png',
          desc: '旋风斩击杀敌人时延长 0.5 秒持续时间，最多延长 3 秒。' }
      ]
    },
    {
      id: 'charge', skill: 'charge', name: '野蛮冲锋',
      group: 'strong', unlock: 8,
      desc: '向前突进撞开路径上的敌人，造成高额伤害。',
      nodes: [
        { id: 'w_charge_ram', name: '乱撞', slot: 0, icon: ICON + 'charge-ram.png',
          desc: '冲锋路径上的敌人被击退更远，并短暂失衡。' },
        { id: 'w_charge_rush', name: '冲锋', slot: 1, icon: ICON + 'charge-rush.png',
          desc: '冲锋距离提高 25%，冷却缩短 1 秒。' },
        { id: 'w_charge_stun', name: '眩晕', slot: 2, icon: ICON + 'charge-stun.png',
          desc: '被冲锋撞到的敌人眩晕 2 秒。' },
        { id: 'w_charge_sunder', name: '破防', slot: 3, icon: ICON + 'charge-sunder.png',
          desc: '冲锋伤害无视目标 30% 护甲。' },
        { id: 'w_charge_sprint', name: '疾驰', slot: 4, icon: ICON + 'charge-sprint.png',
          desc: '冲锋后 3 秒内移动速度提高 25%。' },
        { id: 'w_charge_gallop', name: '长驱', slot: 5, icon: ICON + 'charge-gallop.png',
          desc: '冲锋每命中一名敌人，冷却缩短 0.4 秒。' }
      ]
    },
    {
      id: 'shockwave', skill: 'shockwave', name: '震动波',
      group: 'support', unlock: 12,
      desc: '向前轰出冲击波，对沿途敌人造成伤害。',
      nodes: [
        { id: 'w_shockwave_vibrate', name: '震荡', slot: 0, icon: ICON + 'shockwave-vibrate.png',
          desc: '震动波伤害提高 20%。' },
        { id: 'w_shockwave_mountain', name: '山蹦', slot: 1, icon: ICON + 'shockwave-mountain.png',
          desc: '震动波命中时引发二次爆炸，对周围敌人造成 50% 伤害。' },
        { id: 'w_shockwave_pierce', name: '贯穿', slot: 2, icon: ICON + 'shockwave-pierce.png',
          desc: '震动波额外穿透 2 个目标。' },
        { id: 'w_shockwave_range', name: '范围', slot: 3, icon: ICON + 'shockwave-range.png',
          desc: '震动波宽度提高 30%。' },
        { id: 'w_shockwave_gravel', name: '碎石', slot: 4, icon: ICON + 'shockwave-gravel.png',
          desc: '震动波留下的碎石使敌人减速 30%，持续 2 秒。' },
        { id: 'w_shockwave_wide', name: '宽幅', slot: 5, icon: ICON + 'shockwave-wide.png',
          desc: '震动波射程提高 25%，末端伤害提高 30%。' }
      ]
    },
    {
      id: 'warcry', skill: 'warcry', name: '战吼',
      group: 'support', unlock: 16,
      desc: '战吼震慑周围敌人，造成伤害并使其减速。',
      nodes: [
        { id: 'w_warcry_tremble', name: '战栗', slot: 0, icon: ICON + 'warcry-tremble.png',
          desc: '战吼命中的敌人攻击力降低 20%，持续 4 秒。' },
        { id: 'w_warcry_fear', name: '恐惧', slot: 1, icon: ICON + 'warcry-fear.png',
          desc: '战吼使命中的敌人恐惧 1.5 秒。' },
        { id: 'w_warcry_echo', name: '回响', slot: 2, icon: ICON + 'warcry-echo.png',
          desc: '战吼结束后 1 秒再次爆发，造成 50% 伤害。' },
        { id: 'w_warcry_lasting', name: '持久', slot: 3, icon: ICON + 'warcry-lasting.png',
          desc: '战吼的减速持续时间延长 50%。' },
        { id: 'w_warcry_sunder', name: '破甲', slot: 4, icon: ICON + 'warcry-sunder.png',
          desc: '战吼命中的敌人护甲降低 35%，持续 4 秒。' },
        { id: 'w_warcry_soulshock', name: '惊魂', slot: 5, icon: ICON + 'warcry-soulshock.png',
          desc: '被战吼命中的敌人受到的所有伤害提高 15%，持续 4 秒。' }
      ]
    }
  ];

  // 三个分组标题条：y 为 PSD 中标题底图的 top，trees 决定右侧「技能点N/N」的统计范围
  DG.data.skillGroups = [
    { id: 'basic', name: '(基础技能)', y: 133, trees: ['cleave'] },
    { id: 'strong', name: '(强力技能)', y: 561, trees: ['whirlwind', 'charge'] },
    { id: 'support', name: '(辅助技能)', y: 985, trees: ['shockwave', 'warcry'] }
  ];

  // 扁平索引：nodeId -> { cls, tree, node, slot, parent }
  DG.data.skillTreeIndex = {};
  let total = 0;
  Object.keys(DG.data.skillTrees).forEach(cls => {
    DG.data.skillTrees[cls].forEach(tree => {
      tree.nodes.forEach(node => {
        node.treeId = tree.id;
        node.skill = tree.skill;
        // 中间节点挂主技能，底部节点挂对应的中间节点
        const parent = node.slot < 2 ? null : tree.nodes[node.slot === 2 || node.slot === 3 ? 0 : 1];
        node.req = parent ? parent.id : null;
        DG.data.skillTreeIndex[node.id] = { cls, tree, node, slot: node.slot, parent };
        total++;
      });
    });
  });
  DG.data.skillTreeTotal = total;
})();


;
/* ==== js/data/quests.js ==== */
/* 任务数据：主线章节（与全部关卡一一对应）+ 可循环的悬赏模板 */
(function () {
  const DG = window.DG;
  DG.data.quests = DG.data.quests || {};

  // 主线：每关一条，通关后回城领取，奖励技能点推动长线养成。
  // 原有 20 关保留手写文案，新增关卡按关卡名与描述自动生成。
  const handWritten = {
    grove: ['迷雾初醒', '穿过迷雾林地，活着回来。', '第一缕雾里藏着腐化的味道。'],
    thicket: ['荆棘之路', '清空荆棘林径的兽群。', '林径被野兽划出了领地。'],
    fen: ['沼泽低语', '深入腐朽沼泽，找出低语的源头。', '腐水之下，有什么在数你的心跳。'],
    crypt: ['亡者不眠', '在沉沦墓穴中终结亡者的徘徊。', '这里的墓穴比尸体更古老。'],
    catacomb: ['幽影尽头', '走完幽影墓道，带回墓道的答案。', '骸骨列队，像是为你准备的仪仗。'],
    ashlands: ['灰烬之上', '在灰烬荒原上留下新的脚印。', '灰烬盖住了上一批人的脚印。'],
    abyss: ['深渊回望', '击碎腐化深渊的注视。', '深渊不眨眼，但你可以。'],
    rift: ['裂隙错位', '穿过裂隙回廊，别被折叠的空间留下。', '走廊的尽头不是墙，是另一条走廊。'],
    furnace: ['熔火不熄', '熄灭熔火工坊的炉心。', '炉火已经烧了三百年。'],
    plague: ['疫病止息', '终结疫病巢穴的扩散。', '绿色的空气也有重量。'],
    shipwreck: ['沉船潮声', '在沉船海滩立下第一块碑。', '潮水把名字都磨掉了。'],
    tidecave: ['潮汐深处', '潜入潮汐洞窟，带出深渊的回声。', '深水里的光不是星光。'],
    frostkeep: ['霜封誓约', '敲开霜封要塞的冰门。', '誓约冻住了，人也是。'],
    sanctum: ['遗忘祷声', '让遗忘圣所的祷声真正安静。', '长明灯照着空无一人的跪垫。'],
    voidgate: ['虚空开门', '在虚空之门前守住自己的影子。', '门后没有门，只有一样的黑。'],
    bonehall: ['骸骨为阶', '踏过骸骨大殿的最后一阶。', '每一级台阶都记得踩过它的人。'],
    emberthrone: ['烬火王座', '在烬火王座前站到最后。', '王座在等一个坐得下的人。'],
    shadowcourt: ['暗影回廊', '穿过暗影回廊，别回头。', '影子比你多走了一步。'],
    worldscar: ['世界之痕', '沿着地裂走到世界之痕的尽头。', '裂缝另一头，是别处的天空。'],
    finalgate: ['终焉之门', '推开终焉之门，终结这场腐化。', '门后是终点，也是起点。']
  };

  DG.data.quests.main = DG.data.dungeons.map((def, i) => {
    const q = handWritten[def.id];
    return {
      id: 'm' + (i + 1),
      index: i + 1,
      stage: def.id,
      name: q ? q[0] : def.name,
      desc: q ? q[1] : `清空「${def.name}」，活着回来。`,
      lore: q ? q[2] : def.desc,
      reward: {
        gold: 60 + i * 45,
        // 主线经验压缩到总量约 2.7 万，只作为关卡经验的补充，
        // 避免 80 条任务直接送出数倍升级经验
        xp: 20 + i * 8,
        // 技能点每 8 关投放 1 点（第 8/16/…/80 关），共 10 点；
        // 与升级投放的 20 点合计 30 点，正好点亮五棵树的 30 个辅助节点
        skillPoints: i % 8 === 7 ? 1 : 0
      }
    };
  });

  // 悬赏：不限次数，完成后自动补新，作为长线金币与装备补充。
  // 不给技能点，避免无限循环任务把养成点数刷爆
  DG.data.quests.bountyTemplates = [
    { key: 'hunt', type: 'kill', name: '清剿委托', desc: '击杀 {n} 个敌人', min: 24, max: 40, reward: { gold: 1.0, xp: 1.0 } },
    { key: 'elite', type: 'elite', name: '精英猎杀', desc: '击败 {n} 个精英', min: 3, max: 6, reward: { gold: 1.4, xp: 1.3 } },
    { key: 'boss', type: 'boss', name: '首领通缉', desc: '击败 {n} 个首领', min: 1, max: 2, reward: { gold: 2.6, xp: 2.0 } },
    { key: 'loot', type: 'loot', name: '物资回收', desc: '拾取 {n} 件物品', min: 5, max: 9, reward: { gold: 1.1, xp: 0.8 } },
    { key: 'clear', type: 'clear', name: '推进战线', desc: '通关 {n} 个关卡', min: 1, max: 1, reward: { gold: 2.0, xp: 1.6 } }
  ];

  // 悬赏奖励随等级成长；经验只作为零头，防止无限接取绕开等级曲线
  DG.data.quests.bountyReward = function (tmpl, level) {
    const lv = Math.max(1, level || 1);
    const r = tmpl.reward || {};
    return {
      gold: Math.round((30 + lv * 9) * (r.gold || 1)),
      xp: Math.round((15 + lv * 5) * (r.xp || 1))
    };
  };
})();


;
/* ==== js/data/monsters/index.js ==== */
/* 怪物 / 首领注册表：具体条目按分组放在同目录文件，新增怪物只加条目或新分组文件 */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};
  DG.data.monsters = {};
  DG.data.bossMinions = {};
  DG.data.monsterIds = () => Object.keys(DG.data.monsters);
  DG.data.monster = (id) => DG.data.monsters[id] || null;
})();


;
/* ==== js/data/monsters/normal.js ==== */
/* 怪物模块 · 普通小怪（各副本共享的常规敌人；贴图全部来自本轮新资源） */
(function () {
  const DG = window.DG;
  Object.assign(DG.data.monsters, {
    wolf: {
      id: 'wolf', name: '腐化野狼', shape: 'triangle', color: '#7a5f96', r: 17,
      art: 'wolf', artScale: 1, fxColor: '#c98ae0', windup: 0.26,
      hp: 30, dmg: 7, speed: 128, attackRange: 44, attackCd: 1.2,
      xp: 8, gold: [2, 5], ranged: false
    },
    skeleton: {
      id: 'skeleton', name: '骷髅战士', shape: 'square', color: '#c8d4e0', r: 18,
      art: 'skeleton', artScale: 1, fxColor: '#9fd8ff', windup: 0.34,
      hp: 46, dmg: 9, speed: 82, attackRange: 46, attackCd: 1.5,
      xp: 10, gold: [3, 6], ranged: false
    },
    mistwalker: {
      id: 'mistwalker', name: '迷雾行者', shape: 'diamond', color: '#8a3a3c', r: 17,
      art: 'mistwalker', artScale: 1, fxColor: '#ff6a6a', windup: 0.30,
      hp: 34, dmg: 8, speed: 76, attackRange: 46, attackCd: 1.6,
      xp: 12, gold: [4, 8], ranged: true, shootCd: 2.4, projectileSpeed: 250,
      projColor: '#ff6a6a'
    },

    /* 孢帽菌人：白帽紫口菌，近身顶撞 */
    pea: {
      id: 'pea', name: '孢帽菌人', shape: 'circle', color: '#7fa8c8', r: 17,
      art: 'pea', artScale: 1, fxColor: '#c9a8ff', windup: 0.30,
      hp: 36, dmg: 8, speed: 94, attackRange: 44, attackCd: 1.5,
      xp: 10, gold: [3, 7], ranged: false
    },

    /* 菌帽枪手：蓝帽菌骷髅，远程火枪 */
    musketeer: {
      id: 'musketeer', name: '菌帽枪手', shape: 'circle', color: '#4a6f9e', r: 17,
      art: 'musketeer', artScale: 1, fxColor: '#ffcf7a', windup: 0.32,
      hp: 34, dmg: 7, speed: 74, attackRange: 46, attackCd: 1.7,
      xp: 12, gold: [4, 8], ranged: true, shootCd: 2.5, projectileSpeed: 268,
      projColor: '#ffc46a'
    },

    /* 裂口刈手：刺背巨口兽，前摇长伤害高 */
    pumpkin: {
      id: 'pumpkin', name: '裂口刈手', shape: 'square', color: '#8a4a3a', r: 19,
      art: 'pumpkin', artScale: 1, fxColor: '#ff7a6a', windup: 0.42,
      hp: 56, dmg: 12, speed: 78, attackRange: 54, attackCd: 1.9,
      xp: 14, gold: [5, 9], ranged: false
    },

    /* 赤红史莱姆：跳跃扑咬，血厚移速慢 */
    slime: {
      id: 'slime', name: '赤红史莱姆', shape: 'circle', color: '#b83f45', r: 19,
      art: 'slime', artScale: 1, fxColor: '#ff6a6a', windup: 0.26,
      hp: 70, dmg: 8, speed: 66, attackRange: 48, attackCd: 1.8,
      xp: 12, gold: [4, 8], ranged: false
    },

    /* 批次四 · 同族变体：按副本难度调数值 */
    frostwolf: {
      id: 'frostwolf', name: '霜牙狼', shape: 'triangle', color: '#6b5a92', r: 18,
      art: 'frostwolf', artScale: 1.02, fxColor: '#c98ae0', windup: 0.26,
      hp: 52, dmg: 10, speed: 136, attackRange: 44, attackCd: 1.15,
      xp: 14, gold: [5, 10], ranged: false
    },
    boneknight: {
      id: 'boneknight', name: '缠尸卫士', shape: 'square', color: '#9aa0a8', r: 19,
      art: 'boneknight', artScale: 1.04, fxColor: '#c8c8d0', windup: 0.34,
      hp: 78, dmg: 12, speed: 74, attackRange: 48, attackCd: 1.5,
      xp: 18, gold: [6, 12], ranged: false
    },
    frostslime: {
      id: 'frostslime', name: '霜颅骸骨', shape: 'circle', color: '#6fd0e0', r: 20,
      art: 'frostslime', artScale: 1.05, fxColor: '#9fe8ff', windup: 0.28,
      hp: 96, dmg: 10, speed: 58, attackRange: 48, attackCd: 1.9,
      xp: 16, gold: [6, 11], ranged: false
    },

    /* 贴图小怪 */
    bat: {
      id: 'bat', name: '血翼蝠', shape: 'circle', color: '#3a2f44', r: 16,
      art: 'bat', artScale: 1, fxColor: '#ffd24a', windup: 0.24,
      hp: 38, dmg: 9, speed: 136, attackRange: 42, attackCd: 1.3,
      xp: 12, gold: [3, 8], ranged: false
    },
    hornet: {
      id: 'hornet', name: '毒刺蜂', shape: 'circle', color: '#b8403c', r: 15,
      art: 'hornet', artScale: 1, fxColor: '#f2d24a', windup: 0.22,
      hp: 32, dmg: 8, speed: 112, attackRange: 46, attackCd: 1.6,
      xp: 12, gold: [4, 9], ranged: true, shootCd: 2.2, projectileSpeed: 300,
      projColor: '#f2d24a'
    },
    beetle: {
      id: 'beetle', name: '青壳甲虫', shape: 'circle', color: '#2fa8a0', r: 20,
      art: 'beetle', artScale: 1, fxColor: '#63e0d0', windup: 0.44,
      hp: 96, dmg: 13, speed: 50, attackRange: 48, attackCd: 2.0,
      xp: 20, gold: [7, 13], ranged: false
    },
    cinderraven: {
      id: 'cinderraven', name: '黑焰蝠', shape: 'diamond', color: '#3a3a44', r: 22,
      art: 'cinderraven', artScale: 1, fxColor: '#ff5a5a', windup: 0.30,
      hp: 84, dmg: 14, speed: 60, attackRange: 48, attackCd: 1.9,
      xp: 26, gold: [9, 16], ranged: true, shootCd: 3.2, projectileSpeed: 214,
      projColor: '#ff5a5a', castTime: 0.70
    },

    /* 批次六 · 贴图 + 分件摆动 */
    candle: {
      id: 'candle', name: '魔锅炉怪', shape: 'square', color: '#5a4a8a', r: 20,
      art: 'candle', artScale: 1, fxColor: '#ffb648', windup: 0.30,
      hp: 66, dmg: 11, speed: 58, attackRange: 52, attackCd: 2.0,
      xp: 20, gold: [6, 11], ranged: true, shootCd: 2.9, projectileSpeed: 214,
      projColor: '#ffb648', castTime: 0.66
    },
    urchin: {
      id: 'urchin', name: '棘刺仙人掌', shape: 'circle', color: '#6f8f4a', r: 20,
      art: 'urchin', artScale: 1, fxColor: '#a7e06a', windup: 0.34,
      hp: 88, dmg: 12, speed: 46, attackRange: 48, attackCd: 1.9,
      xp: 18, gold: [6, 12], ranged: false
    },
    deepfin: {
      id: 'deepfin', name: '幽蓝喙兽', shape: 'circle', color: '#6b7f9e', r: 17,
      art: 'deepfin', artScale: 1, fxColor: '#c9e0ff', windup: 0.24,
      hp: 44, dmg: 9, speed: 132, attackRange: 44, attackCd: 1.25,
      xp: 12, gold: [4, 8], ranged: false
    },
    cowlbandit: {
      id: 'cowlbandit', name: '游荡菌人', shape: 'diamond', color: '#3a6f9e', r: 18,
      art: 'cowlbandit', artScale: 1, fxColor: '#7fc0f0', windup: 0.28,
      hp: 62, dmg: 11, speed: 96, attackRange: 46, attackCd: 1.5,
      xp: 15, gold: [5, 10], ranged: false
    },
    angler: {
      id: 'angler', name: '渊灯兽', shape: 'triangle', color: '#2f3a5a', r: 18,
      art: 'angler', artScale: 1, fxColor: '#ffd24a', windup: 0.32,
      hp: 58, dmg: 10, speed: 78, attackRange: 50, attackCd: 2.1,
      xp: 16, gold: [5, 10], ranged: true, shootCd: 2.6, projectileSpeed: 246,
      projColor: '#ffd24a'
    },
    fleece: {
      id: 'fleece', name: '绷带猫', shape: 'circle', color: '#cfd8d0', r: 18,
      art: 'fleece', artScale: 1, fxColor: '#a8e0d0', windup: 0.26,
      hp: 54, dmg: 8, speed: 104, attackRange: 46, attackCd: 1.6,
      xp: 13, gold: [4, 9], ranged: false
    },
    foxraider: {
      id: 'foxraider', name: '灰狐掠手', shape: 'triangle', color: '#7a6f96', r: 18,
      art: 'foxraider', artScale: 1, fxColor: '#c98ae0', windup: 0.24,
      hp: 46, dmg: 10, speed: 138, attackRange: 44, attackCd: 1.2,
      xp: 13, gold: [4, 9], ranged: false
    },
    emberdrake: {
      id: 'emberdrake', name: '赤棘龙', shape: 'diamond', color: '#b4502f', r: 21,
      art: 'emberdrake', artScale: 1, fxColor: '#ff7a4a', windup: 0.34,
      hp: 92, dmg: 14, speed: 62, attackRange: 54, attackCd: 2.2,
      xp: 24, gold: [8, 14], ranged: true, shootCd: 3.0, projectileSpeed: 220,
      projColor: '#ff7a4a', castTime: 0.70
    },
    venomlisk: {
      id: 'venomlisk', name: '绿鳞蛇', shape: 'hex', color: '#5f9a3c', r: 19,
      art: 'venomlisk', artScale: 1, fxColor: '#a7e06a', windup: 0.30,
      hp: 70, dmg: 12, speed: 84, attackRange: 48, attackCd: 1.7,
      xp: 18, gold: [6, 11], ranged: false
    },
    bulwark: {
      id: 'bulwark', name: '铁背野猪', shape: 'square', color: '#b4542f', r: 22,
      art: 'bulwark', artScale: 1, fxColor: '#ff9a5a', windup: 0.44,
      hp: 120, dmg: 13, speed: 44, attackRange: 50, attackCd: 2.0,
      xp: 22, gold: [8, 14], ranged: false
    },

    /* 新增 · 墓穴木乃伊：慢速高血量前排 */
    mummy: {
      id: 'mummy', name: '墓穴木乃伊', shape: 'square', color: '#9aa0a8', r: 20,
      art: 'mummy', artScale: 1.05, fxColor: '#c8c8d0', windup: 0.38,
      hp: 108, dmg: 13, speed: 46, attackRange: 50, attackCd: 2.0,
      xp: 20, gold: [7, 13], ranged: false
    },
  });
})();


;
/* ==== js/data/monsters/elite.js ==== */
/* 怪物模块 · 精英（图鉴大造型） */
(function () {
  const DG = window.DG;
  Object.assign(DG.data.monsters, {
    mawflower: {
      id: 'mawflower', name: '噬人蠕虫', shape: 'circle', color: '#8a4a5a', r: 24,
      art: 'mawflower', artScale: 1.12, fxColor: '#ff8f6a', windup: 0.50,
      hp: 120, dmg: 14, speed: 52, attackRange: 66, attackCd: 2.2,
      xp: 30, gold: [10, 18], ranged: false
    },
    plaguedoc: {
      id: 'plaguedoc', name: '瘟疫医师', shape: 'diamond', color: '#4a4636', r: 23,
      art: 'plaguedoc', artScale: 1.10, fxColor: '#ffb26a', windup: 0.46,
      hp: 110, dmg: 15, speed: 80, attackRange: 62, attackCd: 2.0,
      xp: 32, gold: [12, 20], ranged: false
    },
    warlock: {
      id: 'warlock', name: '深渊巫师', shape: 'hex', color: '#5a3f78', r: 22,
      art: 'warlock', artScale: 1.08, fxColor: '#9ff08a', windup: 0.30,
      hp: 95, dmg: 12, speed: 64, attackRange: 60, attackCd: 1.9,
      xp: 34, gold: [12, 22], ranged: true, shootCd: 3.2, projectileSpeed: 232,
      projColor: '#9ff08a', castTime: 0.68
    },
  });
})();


;
/* ==== js/data/monsters/bosses.js ==== */
/* 怪物模块 · 首领与召唤物映射 */
(function () {
  const DG = window.DG;
  Object.assign(DG.data.monsters, {
    eyehorror: {
      id: 'eyehorror', name: '噬人魔典', art: 'eyehorror', artScale: 1,
      shape: 'hex', color: '#8a6a4a', r: 40,
      hp: 520, dmg: 16, speed: 56, attackRange: 108, attackCd: 2.2,
      xp: 120, gold: [60, 90], boss: true, preferRange: 150,
      patterns: [
        {
          type: 'arc', label: '触须横扫', range: 195, windup: 0.75, recover: 0.5, cd: 4.5,
          radius: 168, arc: 2.5, dmgMul: 1.05, color: '#b06be0'
        },
        {
          type: 'beam', label: '凝视射线', range: 520, windup: 1.0, recover: 0.5, cd: 7.0,
          width: 34, dmgMul: 1.25, color: '#ff5f5f'
        },
        {
          type: 'summon', label: '迷雾低语', windup: 0.7, recover: 0.5, cd: 13,
          minion: 'wolf', count: 2, color: '#9b7bd0'
        }
      ]
    },

    /* 首领 · 幽镰收割者：勾魂镰 + 影遁收割 + 亡魂弹幕 */
    reaper: {
      id: 'reaper', name: '幽镰收割者', art: 'reaper', artScale: 1,
      shape: 'hex', color: '#6b5a8e', r: 40,
      hp: 900, dmg: 23, speed: 78, attackRange: 112, attackCd: 1.8,
      xp: 200, gold: [110, 160], boss: true, preferRange: 110,
      patterns: [
        {
          type: 'slash', label: '勾魂镰', range: 175, windup: 0.6, recover: 0.45, cd: 3.8,
          radius: 152, arc: 2.2, dmgMul: 1.1, color: '#b76be0'
        },
        {
          type: 'blink', label: '影遁收割', range: 900, windup: 0.55, recover: 0.6, cd: 8.5,
          radius: 152, arc: 2.4, dmgMul: 1.0, color: '#8f5ed0'
        },
        {
          type: 'fan', label: '亡魂弹幕', range: 620, windup: 0.75, recover: 0.5, cd: 5.5,
          count: 5, spread: 0.62, projSpeed: 230, dmgMul: 0.7, color: '#a97be0'
        },
        {
          type: 'summon', label: '亡者应召', windup: 0.8, recover: 0.5, cd: 14,
          minion: 'skeleton', count: 2, color: '#8f7fc0'
        }
      ]
    },

    /* 首领 · 深渊之瞳：噬瞳之眼的高阶形态（复用贴图 + 暗红染色） */
    abysseye: {
      id: 'abysseye', name: '暗渊史莱姆', art: 'abysseye', artScale: 1.14,
      glow: '#e0556a',
      shape: 'hex', color: '#2f3a44', r: 46,
      hp: 1500, dmg: 30, speed: 62, attackRange: 122, attackCd: 2.0,
      xp: 330, gold: [180, 260], boss: true, preferRange: 165,
      patterns: [
        {
          type: 'arc', label: '深渊触须', range: 215, windup: 0.7, recover: 0.5, cd: 4.0,
          radius: 188, arc: 2.8, dmgMul: 1.15, color: '#e0609a'
        },
        {
          type: 'beam', label: '湮灭凝视', range: 620, windup: 0.9, recover: 0.5, cd: 6.0,
          width: 44, dmgMul: 1.35, color: '#ff4d5e'
        },
        {
          type: 'fan', label: '腐化喷吐', range: 560, windup: 0.7, recover: 0.5, cd: 5.2,
          count: 7, spread: 0.9, projSpeed: 215, dmgMul: 0.7, color: '#d06fa8'
        },
        {
          type: 'summon', label: '深渊呼唤', windup: 0.8, recover: 0.5, cd: 12,
          minion: 'mistwalker', count: 3, color: '#c07bb8'
        }
      ]
    },

    /* 首领批次一 · 腐沼獠兽：巨尾横扫 / 腐蚀吐息 / 沼底潜袭 / 泥沼孵化 */
    croc: {
      id: 'croc', name: '腐沼獠兽', art: 'croc', artScale: 1,
      shape: 'hex', color: '#5f8f52', r: 44,
      hp: 780, dmg: 21, speed: 66, attackRange: 120, attackCd: 2.0,
      xp: 180, gold: [90, 140], boss: true, preferRange: 140,
      patterns: [
        {
          type: 'arc', label: '巨尾横扫', range: 200, windup: 0.65, recover: 0.5, cd: 4.2,
          radius: 190, arc: 2.6, dmgMul: 1.1, color: '#9fd07a', fx: 'crocWave'
        },
        {
          type: 'beam', label: '腐蚀吐息', range: 500, windup: 0.9, recover: 0.5, cd: 6.5,
          width: 40, dmgMul: 1.2, color: '#a8d96b'
        },
        {
          type: 'blink', label: '沼底潜袭', range: 900, windup: 0.55, recover: 0.6, cd: 9,
          radius: 168, arc: 2.4, dmgMul: 1.0, color: '#7fae6a'
        },
        {
          type: 'summon', label: '泥沼孵化', windup: 0.8, recover: 0.5, cd: 14,
          minion: 'pea', count: 2, color: '#9bcf7a'
        }
      ]
    },

    /* 首领批次一 · 深渊主教：虚空弹幕 / 湮灭凝视 / 深渊之握 / 信徒应召 */
    hierophant: {
      id: 'hierophant', name: '深渊主教', art: 'hierophant', artScale: 1,
      shape: 'hex', color: '#6a4a8f', r: 42,
      hp: 1350, dmg: 27, speed: 58, attackRange: 130, attackCd: 2.0,
      xp: 300, gold: [160, 230], boss: true, preferRange: 190,
      patterns: [
        {
          type: 'fan', label: '虚空弹幕', range: 620, windup: 0.75, recover: 0.5, cd: 5.0,
          count: 7, spread: 0.72, projSpeed: 225, dmgMul: 0.72, color: '#c07be0'
        },
        {
          type: 'beam', label: '湮灭凝视', range: 640, windup: 0.95, recover: 0.55, cd: 6.8,
          width: 46, dmgMul: 1.3, color: '#e055d0'
        },
        {
          type: 'arc', label: '深渊之握', range: 210, windup: 0.6, recover: 0.5, cd: 4.4,
          radius: 196, arc: 2.9, dmgMul: 1.15, color: '#a45fe0', fx: 'voidNova'
        },
        {
          type: 'summon', label: '信徒应召', windup: 0.85, recover: 0.5, cd: 13,
          minion: 'mistwalker', count: 3, color: '#b07ad8'
        }
      ]
    },

    /* 首领批次二 · 灰发女妖：灰发横扫 / 诅咒凝视 / 影中潜行 / 亡者应召 */
    mummyking: {
      id: 'mummyking', name: '灰发女妖', art: 'mummyking', artScale: 1,
      shape: 'hex', color: '#9aa4ac', r: 42,
      hp: 980, dmg: 22, speed: 62, attackRange: 118, attackCd: 2.0,
      xp: 220, gold: [110, 170], boss: true, preferRange: 150,
      patterns: [
        {
          type: 'arc', label: '灰发横扫', range: 195, windup: 0.6, recover: 0.5, cd: 4.0,
          radius: 186, arc: 2.5, dmgMul: 1.05, color: '#d9c9a0', fx: 'crocWave'
        },
        {
          type: 'beam', label: '诅咒凝视', range: 560, windup: 0.85, recover: 0.5, cd: 6.2,
          width: 38, dmgMul: 1.15, color: '#9fd8c0'
        },
        {
          type: 'blink', label: '影中潜行', range: 900, windup: 0.5, recover: 0.6, cd: 8.5,
          radius: 152, arc: 2.2, dmgMul: 1.0, color: '#c9b98c'
        },
        {
          type: 'summon', label: '亡者应召', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'skeleton', count: 2, color: '#d8cfae'
        }
      ]
    },

    /* 首领批次二 · 触手蠕虫王：触须横扫 / 深渊墨弹 / 蚀骨毒液 / 虫群唤潮 */
    octoking: {
      id: 'octoking', name: '触手蠕虫王', art: 'octoking', artScale: 1,
      shape: 'hex', color: '#8a5fb0', r: 46,
      hp: 1600, dmg: 28, speed: 56, attackRange: 132, attackCd: 2.0,
      xp: 340, gold: [180, 260], boss: true, preferRange: 175,
      patterns: [
        {
          type: 'arc', label: '触须横扫', range: 215, windup: 0.6, recover: 0.5, cd: 4.6,
          radius: 208, arc: 2.9, dmgMul: 1.1, color: '#5f9fe0', fx: 'voidNova'
        },
        {
          type: 'fan', label: '深渊墨弹', range: 640, windup: 0.8, recover: 0.5, cd: 5.4,
          count: 9, spread: 0.95, projSpeed: 208, dmgMul: 0.68, color: '#7fb8f0'
        },
        {
          type: 'beam', label: '蚀骨毒液', range: 600, windup: 1.0, recover: 0.55, cd: 7.0,
          width: 44, dmgMul: 1.25, color: '#5fd8d0'
        },
        {
          type: 'summon', label: '虫群唤潮', windup: 0.85, recover: 0.5, cd: 13,
          minion: 'bat', count: 3, color: '#8fc4ea'
        }
      ]
    },

    /* ===== 首领批次三 · 图鉴裁切贴图 ===== */

    /* 海盗巨蟹：弯刀横斩 / 巨螯夹击 / 散落弹片 / 招潮蟹群 */
    piratecrab: {
      id: 'piratecrab', name: '海盗巨蟹', art: 'piratecrab', artScale: 1,
      shape: 'hex', color: '#3f8f96', r: 42,
      hp: 640, dmg: 19, speed: 72, attackRange: 116, attackCd: 2.0,
      xp: 140, gold: [70, 105], boss: true, preferRange: 130,
      patterns: [
        {
          type: 'arc', label: '弯刀横斩', range: 190, windup: 0.6, recover: 0.5, cd: 3.9,
          radius: 178, arc: 2.4, dmgMul: 1.05, color: '#7fd0d8'
        },
        {
          type: 'arc', label: '巨螯夹击', range: 176, windup: 0.5, recover: 0.45, cd: 4.6,
          radius: 152, arc: 1.5, dmgMul: 1.25, color: '#5fb8c8'
        },
        {
          type: 'fan', label: '散落弹片', range: 480, windup: 0.7, recover: 0.5, cd: 5.4,
          count: 5, spread: 0.8, projSpeed: 235, dmgMul: 0.65, color: '#a8e8e0'
        },
        {
          type: 'summon', label: '招潮蟹群', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'deepfin', count: 2, color: '#8fd8d0'
        }
      ]
    },

    /* 血口刺兽：噬咬 / 腥红吐息 / 潜游突袭 / 鱼群 */
    mawfish: {
      id: 'mawfish', name: '血口刺兽', art: 'mawfish', artScale: 1,
      shape: 'hex', color: '#b0474f', r: 41,
      hp: 560, dmg: 18, speed: 86, attackRange: 112, attackCd: 2.0,
      xp: 130, gold: [65, 100], boss: true, preferRange: 120,
      patterns: [
        {
          type: 'arc', label: '血盆噬咬', range: 180, windup: 0.5, recover: 0.45, cd: 3.6,
          radius: 152, arc: 1.7, dmgMul: 1.15, color: '#e0666a'
        },
        {
          type: 'beam', label: '腥红吐息', range: 480, windup: 0.8, recover: 0.5, cd: 6.0,
          width: 34, dmgMul: 1.1, color: '#ff6a6a'
        },
        {
          type: 'blink', label: '潜游突袭', range: 900, windup: 0.5, recover: 0.6, cd: 8.5,
          radius: 150, arc: 2.2, dmgMul: 1.0, color: '#c0506a'
        },
        {
          type: 'summon', label: '鱼群涌至', windup: 0.8, recover: 0.5, cd: 12.5,
          minion: 'deepfin', count: 3, color: '#e08a8a'
        }
      ]
    },

    /* 巨剑恶魔：裂地重斩 / 獠牙横扫 / 战吼震荡 / 野猪群 */
    goatbrute: {
      id: 'goatbrute', name: '巨剑恶魔', art: 'goatbrute', artScale: 1,
      shape: 'hex', color: '#7a5a7a', r: 42,
      hp: 720, dmg: 21, speed: 88, attackRange: 118, attackCd: 2.0,
      xp: 150, gold: [75, 110], boss: true, preferRange: 125,
      patterns: [
        {
          type: 'slash', label: '裂地重斩', range: 200, windup: 0.7, recover: 0.5, cd: 4.2,
          radius: 186, arc: 2.2, dmgMul: 1.2, color: '#c9a0e0'
        },
        {
          type: 'arc', label: '獠牙横扫', range: 186, windup: 0.55, recover: 0.45, cd: 3.8,
          radius: 176, arc: 2.6, dmgMul: 1.0, color: '#a98fd0'
        },
        {
          type: 'fan', label: '战吼震荡', range: 460, windup: 0.7, recover: 0.5, cd: 6.2,
          count: 5, spread: 0.7, projSpeed: 210, dmgMul: 0.6, color: '#c8b0e8'
        },
        {
          type: 'summon', label: '野猪群', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'bulwark', count: 2, color: '#c8b0e8'
        }
      ]
    },

    /* 狼人领主：裂肉利爪 / 血月咆哮 / 狼影突进 / 狼群 */
    silverknight: {
      id: 'silverknight', name: '狼人领主', art: 'silverknight', artScale: 1,
      shape: 'hex', color: '#7a6a62', r: 42,
      hp: 980, dmg: 24, speed: 76, attackRange: 120, attackCd: 2.0,
      xp: 220, gold: [120, 175], boss: true, preferRange: 125,
      patterns: [
        {
          type: 'slash', label: '裂肉利爪', range: 205, windup: 0.55, recover: 0.45, cd: 3.8,
          radius: 190, arc: 2.3, dmgMul: 1.15, color: '#cfe0f0'
        },
        {
          type: 'beam', label: '血月咆哮', range: 560, windup: 0.9, recover: 0.5, cd: 6.4,
          width: 38, dmgMul: 1.2, color: '#ff8a8a'
        },
        {
          type: 'blink', label: '狼影突进', range: 900, windup: 0.5, recover: 0.6, cd: 8.8,
          radius: 160, arc: 2.3, dmgMul: 1.05, color: '#9fb8d8'
        },
        {
          type: 'summon', label: '狼群', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'wolf', count: 2, color: '#c9d6e6'
        }
      ]
    },

    /* 魔锅骑士：沸火弹 / 熔金射线 / 护盾爆发 / 炉渣爬虫 */
    cauldron: {
      id: 'cauldron', name: '魔锅骑士', art: 'cauldron', artScale: 1,
      shape: 'hex', color: '#4a4f8f', r: 42,
      hp: 880, dmg: 22, speed: 56, attackRange: 124, attackCd: 2.0,
      xp: 210, gold: [115, 170], boss: true, preferRange: 190,
      patterns: [
        {
          type: 'fan', label: '沸火弹', range: 600, windup: 0.75, recover: 0.5, cd: 5.0,
          count: 7, spread: 0.85, projSpeed: 220, dmgMul: 0.7, color: '#ffa54a'
        },
        {
          type: 'beam', label: '熔金射线', range: 600, windup: 1.0, recover: 0.55, cd: 6.8,
          width: 42, dmgMul: 1.3, color: '#ffcf7a'
        },
        {
          type: 'arc', label: '护盾爆发', range: 190, windup: 0.65, recover: 0.5, cd: 4.6,
          radius: 178, arc: 2.9, dmgMul: 1.1, color: '#ff8a3c', fx: 'voidNova'
        },
        {
          type: 'summon', label: '炉渣爬虫', windup: 0.8, recover: 0.5, cd: 13.5,
          minion: 'beetle', count: 2, color: '#ffb066'
        }
      ]
    },

    /* 蓝鳞蛇王：毒颚撕咬 / 鳞毒喷散 / 盘身扫尾 / 毒蛇从属 */
    snakeking: {
      id: 'snakeking', name: '蓝鳞蛇王', art: 'snakeking', artScale: 1,
      shape: 'hex', color: '#3f7f96', r: 43,
      hp: 1050, dmg: 25, speed: 70, attackRange: 120, attackCd: 2.0,
      xp: 250, gold: [135, 195], boss: true, preferRange: 150,
      patterns: [
        {
          type: 'arc', label: '毒颚撕咬', range: 195, windup: 0.55, recover: 0.45, cd: 3.6,
          radius: 172, arc: 1.9, dmgMul: 1.2, color: '#5fc8d8'
        },
        {
          type: 'fan', label: '鳞毒喷散', range: 520, windup: 0.7, recover: 0.5, cd: 5.2,
          count: 7, spread: 0.9, projSpeed: 215, dmgMul: 0.68, color: '#7fe0c8'
        },
        {
          type: 'arc', label: '盘身扫尾', range: 206, windup: 0.65, recover: 0.5, cd: 4.4,
          radius: 200, arc: 2.9, dmgMul: 1.05, color: '#5fa0d0'
        },
        {
          type: 'summon', label: '毒蛇从属', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'venomlisk', count: 2, color: '#7fd8d0'
        }
      ]
    },

    /* 紫晶蟹王：晶钳夹击 / 晶棱折射 / 碎晶迸射 / 晶簇幼体 */
    crystalcrab: {
      id: 'crystalcrab', name: '紫晶蟹王', art: 'crystalcrab', artScale: 1,
      shape: 'hex', color: '#7a4f9e', r: 44,
      hp: 1320, dmg: 27, speed: 60, attackRange: 126, attackCd: 2.0,
      xp: 300, gold: [175, 250], boss: true, preferRange: 165,
      patterns: [
        {
          type: 'arc', label: '晶钳夹击', range: 205, windup: 0.6, recover: 0.5, cd: 4.0,
          radius: 190, arc: 1.8, dmgMul: 1.2, color: '#c080f0'
        },
        {
          type: 'beam', label: '晶棱折射', range: 600, windup: 0.95, recover: 0.55, cd: 6.6,
          width: 42, dmgMul: 1.25, color: '#d8a0ff'
        },
        {
          type: 'fan', label: '碎晶迸射', range: 600, windup: 0.8, recover: 0.5, cd: 5.4,
          count: 9, spread: 1.0, projSpeed: 225, dmgMul: 0.7, color: '#b877e0'
        },
        {
          type: 'summon', label: '晶簇幼体', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'urchin', count: 3, color: '#c88ff0'
        }
      ]
    },

    /* 暗角魔：暗爪横扫 / 腐化凝视 / 影匿扑袭 / 暗影仆从 */
    shadowdemon: {
      id: 'shadowdemon', name: '暗角魔', art: 'shadowdemon', artScale: 1,
      shape: 'hex', color: '#8a3a4a', r: 44,
      hp: 1420, dmg: 29, speed: 74, attackRange: 124, attackCd: 2.0,
      xp: 320, gold: [185, 265], boss: true, preferRange: 140,
      patterns: [
        {
          type: 'arc', label: '暗爪横扫', range: 200, windup: 0.55, recover: 0.45, cd: 3.9,
          radius: 186, arc: 2.7, dmgMul: 1.15, color: '#ff5a6a'
        },
        {
          type: 'beam', label: '腐化凝视', range: 580, windup: 0.85, recover: 0.5, cd: 6.2,
          width: 40, dmgMul: 1.25, color: '#e0556a'
        },
        {
          type: 'blink', label: '影匿扑袭', range: 900, windup: 0.5, recover: 0.6, cd: 8.2,
          radius: 166, arc: 2.5, dmgMul: 1.05, color: '#8a3a4a'
        },
        {
          type: 'summon', label: '暗影仆从', windup: 0.8, recover: 0.5, cd: 12.5,
          minion: 'bat', count: 3, color: '#e07080'
        }
      ]
    },

    /* 蓝毛食人魔：巨拳砸地 / 横扫骨棒 / 震地裂痕 / 食人魔走卒 */
    blueogre: {
      id: 'blueogre', name: '蓝毛食人魔', art: 'blueogre', artScale: 1,
      shape: 'hex', color: '#3f6fa0', r: 46,
      hp: 1580, dmg: 31, speed: 66, attackRange: 130, attackCd: 2.0,
      xp: 340, gold: [200, 280], boss: true, preferRange: 135,
      patterns: [
        {
          type: 'arc', label: '巨拳砸地', range: 210, windup: 0.75, recover: 0.5, cd: 4.6,
          radius: 200, arc: 2.9, dmgMul: 1.3, color: '#6fb0e0', fx: 'voidNova'
        },
        {
          type: 'arc', label: '横扫骨棒', range: 200, windup: 0.6, recover: 0.5, cd: 4.0,
          radius: 188, arc: 2.4, dmgMul: 1.1, color: '#8fc8f0'
        },
        {
          type: 'beam', label: '震地裂痕', range: 520, windup: 0.9, recover: 0.55, cd: 6.8,
          width: 44, dmgMul: 1.2, color: '#9fd8ff'
        },
        {
          type: 'summon', label: '食人魔走卒', windup: 0.85, recover: 0.5, cd: 14,
          minion: 'bulwark', count: 2, color: '#8fc0e8'
        }
      ]
    },

    /* 冰晶魔像：冰臂横扫 / 寒晶射线 / 碎冰齐射 / 冰卫 */
    golem: {
      id: 'golem', name: '冰晶魔像', art: 'golem', artScale: 1,
      shape: 'hex', color: '#7fc0d8', r: 46,
      hp: 1700, dmg: 30, speed: 48, attackRange: 132, attackCd: 2.0,
      xp: 360, gold: [210, 290], boss: true, preferRange: 150,
      patterns: [
        {
          type: 'arc', label: '冰臂横扫', range: 215, windup: 0.8, recover: 0.5, cd: 4.8,
          radius: 205, arc: 2.8, dmgMul: 1.25, color: '#a8e0f0'
        },
        {
          type: 'beam', label: '寒晶射线', range: 560, windup: 1.05, recover: 0.55, cd: 7.0,
          width: 46, dmgMul: 1.3, color: '#8fe0ff'
        },
        {
          type: 'fan', label: '碎冰齐射', range: 560, windup: 0.8, recover: 0.5, cd: 5.6,
          count: 7, spread: 0.85, projSpeed: 205, dmgMul: 0.72, color: '#c0f0ff'
        },
        {
          type: 'summon', label: '冰卫苏醒', windup: 0.85, recover: 0.5, cd: 14.5,
          minion: 'frostslime', count: 2, color: '#c8f0ff'
        }
      ]
    },

    /* ===== 本轮新增首领（全部使用新贴图） ===== */

    /* 王冠史莱姆王：黏液压顶 / 黏液喷射 / 王冠震波 / 史莱姆分裂 */
    slimeking: {
      id: 'slimeking', name: '王冠史莱姆王', art: 'slimeking', artScale: 1,
      shape: 'hex', color: '#3f9a8f', r: 44,
      hp: 620, dmg: 18, speed: 58, attackRange: 118, attackCd: 2.0,
      xp: 150, gold: [70, 105], boss: true, preferRange: 135,
      patterns: [
        {
          type: 'arc', label: '王冠碾压', range: 195, windup: 0.7, recover: 0.5, cd: 4.2,
          radius: 185, arc: 2.5, dmgMul: 1.15, color: '#7fe0d0'
        },
        {
          type: 'beam', label: '黏液喷射', range: 520, windup: 0.9, recover: 0.5, cd: 6.4,
          width: 38, dmgMul: 1.15, color: '#5fd0c0'
        },
        {
          type: 'arc', label: '王冠震波', range: 210, windup: 0.75, recover: 0.5, cd: 5.0,
          radius: 200, arc: 2.9, dmgMul: 1.0, color: '#8fe8d8', fx: 'voidNova'
        },
        {
          type: 'summon', label: '史莱姆分裂', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'slime', count: 2, color: '#7fe0d0'
        }
      ]
    },

    /* 仙人掌枪王：六连发 / 枪火射线 / 枪托横扫 / 菌兵应召 */
    mushroomgun: {
      id: 'mushroomgun', name: '仙人掌枪王', art: 'mushroomgun', artScale: 1,
      shape: 'hex', color: '#4a6f9e', r: 40,
      hp: 860, dmg: 22, speed: 72, attackRange: 122, attackCd: 2.0,
      xp: 210, gold: [115, 170], boss: true, preferRange: 185,
      patterns: [
        {
          type: 'fan', label: '六连发', range: 620, windup: 0.7, recover: 0.5, cd: 4.8,
          count: 6, spread: 0.8, projSpeed: 260, dmgMul: 0.62, color: '#ffcf7a'
        },
        {
          type: 'beam', label: '枪火射线', range: 620, windup: 0.95, recover: 0.55, cd: 6.6,
          width: 40, dmgMul: 1.25, color: '#ffb648'
        },
        {
          type: 'arc', label: '枪托横扫', range: 180, windup: 0.5, recover: 0.45, cd: 4.6,
          radius: 160, arc: 2.0, dmgMul: 1.0, color: '#ffd88a'
        },
        {
          type: 'summon', label: '菌兵应召', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'musketeer', count: 2, color: '#ffcf7a'
        }
      ]
    },

    /* 噬人花王：藤鞭横扫 / 酸液喷吐 / 巨口吞噬 / 花藤幼体 */
    mawflowerking: {
      id: 'mawflowerking', name: '噬人花王', art: 'mawflowerking', artScale: 1,
      shape: 'hex', color: '#8a3a4a', r: 43,
      hp: 1080, dmg: 25, speed: 60, attackRange: 124, attackCd: 2.0,
      xp: 250, gold: [135, 195], boss: true, preferRange: 140,
      patterns: [
        {
          type: 'arc', label: '藤鞭横扫', range: 205, windup: 0.6, recover: 0.5, cd: 3.9,
          radius: 190, arc: 2.7, dmgMul: 1.1, color: '#e05a7a'
        },
        {
          type: 'beam', label: '酸液喷吐', range: 520, windup: 0.85, recover: 0.5, cd: 6.2,
          width: 40, dmgMul: 1.2, color: '#a7e06a'
        },
        {
          type: 'arc', label: '巨口吞噬', range: 180, windup: 0.7, recover: 0.5, cd: 5.2,
          radius: 150, arc: 1.6, dmgMul: 1.35, color: '#ff7a8a'
        },
        {
          type: 'summon', label: '花藤幼体', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'mawflower', count: 2, color: '#e08aa0'
        }
      ]
    },

    /* 腐沼巨蠕虫王：毒颚撕咬 / 腐液喷散 / 土中潜行 / 蠕虫幼体 */
    wormking: {
      id: 'wormking', name: '腐沼巨蠕虫王', art: 'wormking', artScale: 1,
      shape: 'hex', color: '#6a8f4a', r: 44,
      hp: 1150, dmg: 26, speed: 66, attackRange: 122, attackCd: 2.0,
      xp: 260, gold: [140, 200], boss: true, preferRange: 150,
      patterns: [
        {
          type: 'arc', label: '毒颚撕咬', range: 195, windup: 0.55, recover: 0.45, cd: 3.7,
          radius: 172, arc: 1.9, dmgMul: 1.2, color: '#9fe08a'
        },
        {
          type: 'fan', label: '腐液喷散', range: 540, windup: 0.75, recover: 0.5, cd: 5.2,
          count: 7, spread: 0.9, projSpeed: 215, dmgMul: 0.68, color: '#7fc06a'
        },
        {
          type: 'blink', label: '土中潜行', range: 900, windup: 0.5, recover: 0.6, cd: 8.4,
          radius: 165, arc: 2.4, dmgMul: 1.0, color: '#6f9a4a'
        },
        {
          type: 'summon', label: '蠕虫幼体', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'venomlisk', count: 2, color: '#a7e06a'
        }
      ]
    },

    /* 粉角屠夫：屠刀重斩 / 骨刃横扫 / 血刃飞散 / 角魔仆从 */
    pinkdemon: {
      id: 'pinkdemon', name: '粉角屠夫', art: 'pinkdemon', artScale: 1,
      shape: 'hex', color: '#a04a62', r: 44,
      hp: 1450, dmg: 29, speed: 80, attackRange: 124, attackCd: 2.0,
      xp: 320, gold: [185, 265], boss: true, preferRange: 135,
      patterns: [
        {
          type: 'slash', label: '屠刀重斩', range: 200, windup: 0.6, recover: 0.45, cd: 3.8,
          radius: 185, arc: 2.1, dmgMul: 1.2, color: '#ff7aa0'
        },
        {
          type: 'arc', label: '骨刃横扫', range: 195, windup: 0.55, recover: 0.45, cd: 4.2,
          radius: 185, arc: 2.7, dmgMul: 1.05, color: '#ff9ab8'
        },
        {
          type: 'fan', label: '血刃飞散', range: 560, windup: 0.7, recover: 0.5, cd: 5.4,
          count: 7, spread: 0.8, projSpeed: 240, dmgMul: 0.65, color: '#ff5a80'
        },
        {
          type: 'summon', label: '角魔仆从', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'skeleton', count: 2, color: '#ff7aa0'
        }
      ]
    },

    /* 南瓜领主：鬼火弹 / 南瓜射线 / 触须缠绕 / 烛火仆从 */
    pumpkinlord: {
      id: 'pumpkinlord', name: '南瓜领主', art: 'pumpkinlord', artScale: 1,
      shape: 'hex', color: '#8a5a3a', r: 42,
      hp: 1380, dmg: 27, speed: 56, attackRange: 126, attackCd: 2.0,
      xp: 310, gold: [180, 260], boss: true, preferRange: 185,
      patterns: [
        {
          type: 'fan', label: '鬼火弹', range: 620, windup: 0.75, recover: 0.5, cd: 5.0,
          count: 7, spread: 0.85, projSpeed: 220, dmgMul: 0.7, color: '#ff9a3c'
        },
        {
          type: 'beam', label: '南瓜射线', range: 600, windup: 0.95, recover: 0.55, cd: 6.8,
          width: 44, dmgMul: 1.3, color: '#ffb648'
        },
        {
          type: 'arc', label: '触须缠绕', range: 200, windup: 0.65, recover: 0.5, cd: 4.6,
          radius: 185, arc: 2.7, dmgMul: 1.05, color: '#d06a2a'
        },
        {
          type: 'summon', label: '烛火仆从', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'candle', count: 2, color: '#ffb648'
        }
      ]
    },

    /* 紫角魔将：角刃横扫 / 邪能射线 / 影角突袭 / 角魔从属 */
    hornedfiend: {
      id: 'hornedfiend', name: '紫角魔将', art: 'hornedfiend', artScale: 1,
      shape: 'hex', color: '#5a3f78', r: 44,
      hp: 1520, dmg: 30, speed: 72, attackRange: 124, attackCd: 2.0,
      xp: 330, gold: [195, 275], boss: true, preferRange: 140,
      patterns: [
        {
          type: 'arc', label: '角刃横扫', range: 205, windup: 0.55, recover: 0.45, cd: 3.8,
          radius: 190, arc: 2.7, dmgMul: 1.15, color: '#c07ae0'
        },
        {
          type: 'beam', label: '邪能射线', range: 580, windup: 0.9, recover: 0.5, cd: 6.4,
          width: 42, dmgMul: 1.25, color: '#a45fe0'
        },
        {
          type: 'blink', label: '影角突袭', range: 900, windup: 0.5, recover: 0.6, cd: 8.2,
          radius: 165, arc: 2.4, dmgMul: 1.05, color: '#8a5ec0'
        },
        {
          type: 'summon', label: '角魔从属', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'cinderraven', count: 2, color: '#c07ae0'
        }
      ]
    },

    /* 巨帽吞噬者：巨口吞噬 / 菌盖重压 / 孢子吐息 / 孢子幼体 */
    mushroommaw: {
      id: 'mushroommaw', name: '巨帽吞噬者', art: 'mushroommaw', artScale: 1,
      shape: 'hex', color: '#7a3a3a', r: 46,
      hp: 1620, dmg: 31, speed: 50, attackRange: 130, attackCd: 2.0,
      xp: 345, gold: [205, 285], boss: true, preferRange: 145,
      patterns: [
        {
          type: 'arc', label: '巨口吞噬', range: 210, windup: 0.75, recover: 0.5, cd: 4.6,
          radius: 200, arc: 2.9, dmgMul: 1.3, color: '#d05a5a', fx: 'voidNova'
        },
        {
          type: 'arc', label: '菌盖重压', range: 205, windup: 0.65, recover: 0.5, cd: 4.2,
          radius: 190, arc: 2.4, dmgMul: 1.1, color: '#b04a4a'
        },
        {
          type: 'beam', label: '孢子吐息', range: 520, windup: 0.9, recover: 0.55, cd: 6.6,
          width: 44, dmgMul: 1.2, color: '#a7e06a'
        },
        {
          type: 'summon', label: '孢子幼体', windup: 0.8, recover: 0.5, cd: 13,
          minion: 'cowlbandit', count: 2, color: '#d08a6a'
        }
      ]
    }
  });
  // 首领会召唤的小怪（未在攻击模组里指定时的兜底）
  Object.assign(DG.data.bossMinions, {
    eyehorror: 'wolf',
    reaper: 'skeleton',
    abysseye: 'mistwalker',
    croc: 'pea',
    hierophant: 'mistwalker',
    mummyking: 'skeleton',
    octoking: 'bat',
    piratecrab: 'deepfin',
    mawfish: 'deepfin',
    goatbrute: 'bulwark',
    silverknight: 'wolf',
    cauldron: 'beetle',
    snakeking: 'venomlisk',
    crystalcrab: 'urchin',
    shadowdemon: 'bat',
    blueogre: 'bulwark',
    golem: 'frostslime',
    slimeking: 'slime',
    mushroomgun: 'musketeer',
    mawflowerking: 'mawflower',
    wormking: 'venomlisk',
    pinkdemon: 'skeleton',
    pumpkinlord: 'candle',
    hornedfiend: 'cinderraven',
    mushroommaw: 'cowlbandit'
  });
})();


;
/* ==== js/data/chunks.js ==== */
/* 地块库：模块化秘境地图块
   每块固定 18×32 格（TILE=40 → 720×1280），比战斗镜头视野更大，
   保证房间与走廊有充足的走位空间（参考《迷雾大陆》的地块比例）。
   地图按 6×3 网格拼贴（整体 4320×3840，近方形），块与块之间的接口
   由地块在网格中的位置决定（左右固定在中线、上下固定在正中），
   path 为主通路折线，branches 为支路，rooms 为开阔区域（椭圆）。 */
(function () {
  const DG = window.DG;
  DG.data = DG.data || {};

  DG.data.chunks = {
    W: 18,
    H: 32,
    // 主体块（按 weight 加权抽取）
    list: [
      {
        id: 'entrance', weight: 0, tags: ['room'],
        left: null, right: 16,
        path: [[0, 16], [18, 16]],
        rooms: [{ x: 8, y: 16, rx: 8.2, ry: 14.2 }]
      },
      {
        id: 'straight', weight: 10, tags: ['corridor'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        rooms: []
      },
      {
        id: 'straight_wave', weight: 8, tags: ['corridor'],
        left: 16, right: 16,
        path: [[0, 16], [5, 14.5], [11, 17.5], [18, 16]],
        rooms: []
      },
      {
        id: 'bend_up', weight: 7, tags: ['corridor'],
        left: 18, right: 14,
        path: [[0, 18], [5, 18], [11, 14], [18, 14]],
        rooms: []
      },
      {
        id: 'bend_down', weight: 7, tags: ['corridor'],
        left: 14, right: 18,
        path: [[0, 14], [5, 14], [11, 18], [18, 18]],
        rooms: []
      },
      {
        // 上下蛇形：来回折返路线太长，暂不参与随机（保留定义备查）
        id: 'weave_up', weight: 0, tags: ['corridor'],
        left: 16, right: 16,
        path: [[0, 16], [5, 16], [9, 6], [13, 16], [18, 16]],
        rooms: []
      },
      {
        id: 'weave_down', weight: 0, tags: ['corridor'],
        left: 16, right: 16,
        path: [[0, 16], [5, 16], [9, 26], [13, 16], [18, 16]],
        rooms: []
      },
      {
        // 回型：中间保留一整块实心岩体，左右接口各通向两条环道，可自选绕行方向
        id: 'loop', weight: 5, tags: ['room', 'loop'],
        left: 16, right: 16,
        path: null,
        rings: [{ x: 9, y: 16, rx: 9.2, ry: 13.4, t: 6.8 }],
        anchor: [9, 5.6],
        rooms: []
      },
      {
        // 交叉：横向主路与窄纵向支路十字相交，上下各接一间边房
        id: 'crossroad', weight: 5, tags: ['junction', 'room', 'cross'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]], branchR: 4.2,
        branches: [[[9, 16], [9, 4.8]], [[9, 16], [9, 27.2]]],
        rooms: [
          { x: 9, y: 4.6, rx: 6.4, ry: 4.0 },
          { x: 9, y: 27.4, rx: 6.6, ry: 4.0 }
        ]
      },
      {
        // 密室：主路折出窄支路通往独立大房间，留给精英守卫
        id: 'secret_vault', weight: 0, tags: ['room', 'secret'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]], branchR: 3.2,
        branches: [[[5, 16], [5, 7]]],
        rooms: [{ x: 5, y: 4.8, rx: 5.8, ry: 4.6 }]
      },
      {
        id: 'room_small', weight: 9, tags: ['room'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        rooms: [{ x: 9, y: 16, rx: 8.2, ry: 14.0 }]
      },
      {
        id: 'room_large', weight: 6, tags: ['room'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        rooms: [{ x: 9, y: 16, rx: 8.7, ry: 15.5 }]
      },
      {
        id: 'room_double', weight: 5, tags: ['room'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        rooms: [
          { x: 6.5, y: 9, rx: 7.2, ry: 6.8 },
          { x: 11.5, y: 23, rx: 7.2, ry: 6.8 }
        ]
      },
      {
        id: 'junction_up', weight: 4, tags: ['junction'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        branches: [[[9, 16], [9, 6]]],
        rooms: [{ x: 9, y: 6, rx: 6.4, ry: 6.2 }]
      },
      {
        id: 'junction_down', weight: 4, tags: ['junction'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        branches: [[[9, 16], [9, 26]]],
        rooms: [{ x: 9, y: 26, rx: 6.4, ry: 6.2 }]
      },
      {
        id: 'alcove', weight: 5, tags: ['room'],
        left: 16, right: 16,
        path: [[0, 16], [18, 16]],
        branches: [[[4.5, 16], [4.5, 9]]],
        rooms: [{ x: 4.5, y: 8.5, rx: 5.2, ry: 5.6 }]
      }
    ],
    // 首领场地块：固定在右下角，房间几乎铺满整块，开阔到足以绕首领走位
    arena: {
      id: 'arena', weight: 0, tags: ['arena'],
      left: 16, right: null,
      path: [[0, 16], [6, 16]],
      rooms: [{ x: 10, y: 16, rx: 8.8, ry: 15.7 }]
    }
  };
  // 支路默认宽度（半径，格）；密室等特殊块可单独指定 branchR
  DG.data.chunks.branchR = 4.8;
})();


;
/* ==== js/art/hero-ranger.js ==== */
(function () {
  const DG = window.DG;
  DG.art = DG.art || {};

  const BASE = 'assets/hero/ranger/current/';
  const VERSION = '?v=purple-ranger-20261120';
  const parts = {
    head: { file: 'head.png', x: -62, y: -155, w: 124, h: 94, img: null },
    body: { file: 'body.png', x: -35, y: -82, w: 70, h: 72, img: null },
    legL: { file: 'leg-left.png', x: -24, y: -34, w: 13, h: 34, px: -18, py: -31, img: null },
    legR: { file: 'leg-right.png', x: 11, y: -34, w: 13, h: 34, px: 18, py: -31, img: null },
    // 武器握柄（木质枪托末端）作为旋转轴，正好落在右手黄点上
    weapon: { file: 'weapon.png', x: -16, y: -83, w: 99, h: 70, px: -12, py: -41, img: null }
  };
  // 双手：身体左右两个黄色圆点；右手贴在握柄上，武器绕它旋转
  const HAND_X = 34, HAND_Y = -31, HAND_R = 7.8;
  const GRIP_DX = HAND_X - parts.weapon.px;
  const GRIP_DY = HAND_Y - parts.weapon.py;
  // 待机参考姿势：握柄在右手上，武器朝右上约 -37°
  const IDLE_WEAPON_ROTATION = -0.65;
  // 武器整体相对手点下移 2px：握柄压在黄点下方
  const WEAPON_DY = 2;
  const arrowSprite = { img: null, tilt: 43.5 * Math.PI / 180 };
  let pending = 0;
  let arrowPending = 1;

  Object.keys(parts).forEach(id => {
    const part = parts[id];
    pending++;
    const image = new Image();
    image.onload = () => { part.img = image; pending--; };
    image.onerror = () => { pending--; };
    DG.assets.assign(image, BASE + part.file + VERSION);
  });

  const arrowImage = new Image();
  arrowImage.onload = () => { arrowSprite.img = arrowImage; arrowPending--; };
  arrowImage.onerror = () => { arrowPending--; };
  DG.assets.assign(arrowImage, BASE + 'attack-arrow.png' + VERSION);

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const smooth = value => value * value * (3 - 2 * value);

  // 眼睛（head.png 的图像坐标）：近处左眼大、远处右眼小
  const EYES = [
    { x: 69.5, y: 62.0, rx: 15.2, ry: 8.0 },
    { x: 105.5, y: 62.4, rx: 8.6, ry: 5.8 }
  ];
  const BLINK_PERIOD = 3.2, BLINK_DUR = 0.18;

  // 眨眼节律：每 3.2s 一次，0.18s 内闭合再睁开
  function blinkOf(t) {
    const phase = t % BLINK_PERIOD;
    if (phase > BLINK_DUR) return 0;
    const k = phase / BLINK_DUR;
    return k < 0.45 ? smooth(k / 0.45) : smooth((1 - k) / 0.55);
  }

  // 眼皮遮罩：在眼睛位置盖黑色椭圆，纵向随眨眼进度张开/收拢
  function drawBlinkMask(ctx, dx, dy, k) {
    const part = parts.head;
    if (!part.img || k <= 0.01) return;
    const sx = part.w / (part.img.naturalWidth || part.w);
    const sy = part.h / (part.img.naturalHeight || part.h);
    ctx.save();
    ctx.fillStyle = '#0b0c10';
    for (let i = 0; i < EYES.length; i++) {
      const eye = EYES[i];
      ctx.save();
      ctx.translate(part.x + dx + eye.x * sx, part.y + dy + eye.y * sy);
      ctx.beginPath();
      ctx.ellipse(0, 0, eye.rx * sx, eye.ry * sy * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function key(time, frames) {
    if (time <= frames[0][0]) return frames[0][1];
    for (let index = 1; index < frames.length; index++) {
      if (time <= frames[index][0]) {
        const from = frames[index - 1];
        const to = frames[index];
        return from[1] + (to[1] - from[1]) * smooth((time - from[0]) / (to[0] - from[0]));
      }
    }
    return frames[frames.length - 1][1];
  }

  function drawPart(ctx, id, dx, dy, rotation, shiftX) {
    const part = parts[id];
    if (!part.img) return;
    ctx.save();
    if (rotation || shiftX) {
      ctx.translate(part.px + dx, part.py + dy);
      ctx.rotate(rotation);
      ctx.drawImage(part.img, part.x - part.px + (shiftX || 0), part.y - part.py, part.w, part.h);
    } else {
      ctx.drawImage(part.img, part.x + dx, part.y + dy, part.w, part.h);
    }
    ctx.restore();
  }

  // 手（黄点）：待机/攻击都画成实心黄圆，右手随武器移动
  function drawHandDot(ctx, x, y) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, HAND_R, 0, Math.PI * 2);
    ctx.fillStyle = '#f2ce68';
    ctx.fill();
    ctx.strokeStyle = '#141110';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();
  }

  // 前伸拖影：在弓的真实位置后方补两层淡出残影，形成明显的速度感
  function drawWeaponTrail(ctx, dx, dy, rotation, thrust, fx) {
    const part = parts.weapon;
    if (!part.img || fx <= 0.01 || thrust <= 0.5) return;
    ctx.save();
    ctx.translate(part.px + dx, part.py + dy);
    ctx.rotate(rotation);
    const gx = part.x - part.px;
    const gy = part.y - part.py;
    ctx.globalAlpha = 0.2 * fx;
    ctx.drawImage(part.img, gx + thrust * 0.5, gy, part.w, part.h);
    ctx.globalAlpha = 0.36 * fx;
    ctx.drawImage(part.img, gx + thrust * 0.86, gy, part.w, part.h);
    ctx.restore();
  }

  // 出手风线：从弓梢向指向方向甩出三道收束的气浪，中线补一道亮芯
  function drawThrustWind(ctx, dx, dy, rotation, fx) {
    const part = parts.weapon;
    if (fx <= 0.01) return;
    ctx.save();
    ctx.translate(part.px + dx, part.py + dy);
    ctx.rotate(rotation);
    const tipX = part.x + part.w - part.px;
    const tipY = part.y + part.h * 0.45 - part.py;
    // 弓梢弹射光点：一团软光，强调弦松开的一瞬
    const glowR = 10 + 8 * fx;
    const glow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, glowR);
    glow.addColorStop(0, 'rgba(246,255,226,' + (0.55 * fx).toFixed(3) + ')');
    glow.addColorStop(0.55, 'rgba(222,242,190,' + (0.22 * fx).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(222,242,190,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tipX, tipY, glowR, 0, Math.PI * 2);
    ctx.fill();
    for (let i = -1; i <= 1; i++) {
      const spread = i * 0.12;
      const y0 = tipY + i * 8.5;
      const len = (20 + 26 * fx) * (i === 0 ? 1 : 0.74);
      const nx = -Math.sin(spread) * 2.7;
      const ny = Math.cos(spread) * 2.7;
      ctx.beginPath();
      ctx.moveTo(tipX + nx, y0 + ny);
      ctx.lineTo(tipX + len * Math.cos(spread), y0 + len * Math.sin(spread));
      ctx.lineTo(tipX - nx, y0 - ny);
      ctx.closePath();
      ctx.fillStyle = 'rgba(236,246,216,' + (0.7 * fx).toFixed(3) + ')';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,242,' + (0.8 * fx).toFixed(3) + ')';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tipX + 2, tipY);
    ctx.lineTo(tipX + 14 + 26 * fx, tipY);
    ctx.stroke();
    ctx.restore();
  }

  // 姿态计算：draw 与出手点（箭头尖端）共用同一份，保证箭从弓的箭头处飞出
  function computePose(options) {
    const state = options.state || 'idle';
    const time = options.t || 0;
    // 非战斗（选角/城镇）不传 aim，武器保持参考图的待机姿势
    const inBattle = options.aim != null;
    const pose = {
      bodyX: 0, bodyY: 0, headX: 0, headY: 0,
      weaponX: 0, weaponY: 0,
      weaponRotation: inBattle ? 0 : IDLE_WEAPON_ROTATION,
      weaponThrust: 0, thrustFx: 0, hop: 0,
      legL: 0, legR: 0, legLX: 0, legLY: 0, legRX: 0, legRY: 0,
      // 瞄准角：战斗内由移动方向/鼠标决定，局部坐标系下正为向下。
      // 上下接近垂直指向（±85°），左右由镜像处理；上瞄时弓会竖起，需要避让面部
      aim: clamp(options.aim == null ? 0 : options.aim, -1.48, 1.48)
    };

    if (state === 'walk') {
      const ph = options.walkPhase || 0;
      const stride = Math.sin(ph);
      // 走路腿部动作全职业统一（规则基准见 DG.art.walkLegPose）：
      // 两腿先收拢到中线成平行"筷子状"，再左右交替大幅交叉
      const legs = DG.art.walkLegPose(ph, 22, -9);
      pose.legLX = legs.legLX;
      pose.legRX = legs.legRX;
      pose.legL = legs.legL;
      pose.legR = legs.legR;
      pose.legLY = legs.legLY;
      pose.legRY = legs.legRY;
      pose.bodyY = Math.abs(stride) * 0.55;
      pose.headY = -Math.abs(stride) * 0.35;
      pose.weaponY = Math.abs(stride) * 0.45;
      // 蹦跶：双腿并拢时整体离地最高，双腿张开时落地
      pose.hop = Math.cos(ph) ** 2 * 6;
      // 头部比身体晚 0.3rad 到达最高点，落地慢半拍
      pose.headY += Math.cos(ph - 0.3) ** 2 * 6 - pose.hop;
    } else if (state === 'attack') {
      const progress = clamp((options.attackT || 0) / 0.46, 0, 1);
      pose.weaponX = key(progress, [[0, 0], [0.38, 0], [0.62, 8], [1, 0]]);
      pose.weaponY = key(progress, [[0, 0], [0.38, -7], [0.62, -2], [1, 0]]);
      pose.weaponRotation += key(progress, [[0, 0], [0.38, -0.13], [0.62, 0.08], [1, 0]]);
      // 出手瞬间武器沿指向方向前伸，收招时回位
      pose.weaponThrust = key(progress, [[0, 0], [0.32, -5], [0.62, 13], [1, 0]]);
      pose.thrustFx = key(progress, [[0.30, 0], [0.62, 1], [0.92, 0]]);
    } else if (state === 'hurt') {
      // 受击硬直：上半身与头猛地后仰一顿，手和武器被带得一沉，腿微微踉跄
      // hurtT 为剩余硬直时间（0.30s 倒计时），脚的位移由场景的后退逻辑负责
      const hp = 1 - clamp((options.hurtT == null ? 0.3 : options.hurtT) / 0.3, 0, 1);
      pose.bodyX = key(hp, [[0, -9], [0.55, -3], [1, 0]]);
      pose.headX = key(hp, [[0, -13], [0.50, -4], [1, 0]]);
      pose.bodyY = key(hp, [[0, 3.6], [0.50, 1.0], [1, 0]]);
      pose.headY = key(hp, [[0, -2.6], [0.50, -0.6], [1, 0]]);
      pose.weaponX = pose.bodyX * 0.8;
      pose.weaponY = key(hp, [[0, -3.5], [0.5, 0], [1, 0]]);
      pose.weaponRotation += key(hp, [[0, 0.22], [0.5, 0.02], [1, 0]]);
      pose.legL = key(hp, [[0, -0.18], [0.45, 0], [1, 0]]);
      pose.legR = key(hp, [[0, 0.18], [0.45, 0], [1, 0]]);
    } else {
      // 待机呼吸：躯干慢速上下浮沉（周期 1.5s，±2px），
      // 头单独做点头式的上下浮动（周期 1.2s，±3px），持弓手跟随躯干
      pose.bodyY = Math.sin(time * (Math.PI * 2 / 1.5)) * 2.0;
      pose.headY = Math.sin(time * (Math.PI * 2 / 1.2)) * 3.0;
      pose.weaponY = pose.bodyY * 0.9;
    }
    // 武器呼吸：以右手黄点为圆心做扇形上下浮动（箭尖约 ±4px，周期 1.2s），
    // 攻击/受击时让位给动作本身
    if (state !== 'attack' && state !== 'hurt') {
      pose.weaponRotation += Math.sin(time * (Math.PI * 2 / 1.2)) * 0.042;
    }
    // 战斗内武器角度跟随移动方向；左右朝向由 mirror 处理，上下的仰俯在这里叠加
    if (inBattle) {
      pose.weaponRotation += pose.aim;
      // 接近垂直时略作让位：上瞄避开面部，下瞄少压地面
      if (pose.aim < 0) {
        const k = -pose.aim / 1.48;
        pose.weaponX += 30 * k;
        pose.weaponY -= 6 * k;
      } else if (pose.aim > 0) {
        const k = pose.aim / 1.48;
        pose.weaponX += 8 * k;
        pose.weaponY -= 30 * k;
      }
    }
    // 握柄基准点：始终落在右手黄点上
    pose.weaponX += GRIP_DX;
    pose.weaponY += GRIP_DY;
    // 统一规则：战斗中只要在移动，双腿一律播放与主城相同的走路动作，
    // 攻击/受击等任何状态都不得冻结或替换腿部动作
    if (options.moving) {
      const legs = DG.art.walkLegPose(options.walkPhase || 0, 22, -9);
      pose.legLX = legs.legLX;
      pose.legRX = legs.legRX;
      pose.legL = legs.legL;
      pose.legR = legs.legR;
      pose.legLY = legs.legLY;
      pose.legRY = legs.legRY;
    }
    return pose;
  }

  // 箭尖出手点：当前姿态下弓上箭头的尖端局部坐标（与画面上看到的位置一致），
  // angle 为武器朝向。技能弹道应从这里起飞，并随武器转动/前伸而变化。
  function muzzleTip(options) {
    const pose = computePose(options || {});
    const part = parts.weapon;
    const lx = part.x + part.w - 4 - part.px + pose.weaponThrust;
    const ly = part.y + part.h * 0.45 - part.py;
    const c = Math.cos(pose.weaponRotation);
    const s = Math.sin(pose.weaponRotation);
    return {
      x: part.px + pose.weaponX + lx * c - ly * s,
      y: part.py + pose.weaponY + WEAPON_DY + lx * s + ly * c,
      angle: pose.weaponRotation
    };
  }

  function draw(ctx, x, y, opts) {
    if (pending) return;
    const options = opts || {};
    const ps = computePose(options);
    // 位移量化到半像素：呼吸这类慢速小幅位移如果落在任意小数上，浏览器每帧都会
    // 以新的采样相位重滤整张位图，边缘持续“爬行”，看起来发糊、不丝滑。
    // 量化到 0.5px 后同一档位内每帧位图完全一致，位移仍以 0.5px 台阶连续推进。
    const qv = (v) => Math.round(v * 2) / 2;
    const bx = qv(ps.bodyX), by = qv(ps.bodyY);
    const hx = qv(ps.headX), hy = qv(ps.headY);
    const wx = qv(ps.weaponX), wy = qv(ps.weaponY);

    const mirror = options.flip ? -1 : 1;
    const scale = options.scale == null ? 1 : options.scale;
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);
    ctx.scale(scale * mirror, scale);
    if (options.shadow) {
      // 腾空越高，影子越小越淡
      const hop = ps.hop || 0;
      const shrink = 1 - hop * 0.03;
      ctx.save();
      ctx.scale(1, 0.24);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.38 - hop * 0.012).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, 37 * shrink, 11 * shrink, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 蹦跶：整体（含双脚）离地，影子留在原地
    if (ps.hop) ctx.translate(0, -qv(ps.hop));
    drawPart(ctx, 'legL', 2 + qv(ps.legLX), qv(ps.legLY), ps.legL);
    drawPart(ctx, 'legR', -2 + qv(ps.legRX), qv(ps.legRY), ps.legR);
    drawPart(ctx, 'body', bx, by, 0);
    drawPart(ctx, 'head', hx, hy, 0);
    drawBlinkMask(ctx, hx, hy, blinkOf(options.t || 0));
    // 左手黄点：身体另一侧，随呼吸/走路起伏
    drawHandDot(ctx, -HAND_X, HAND_Y + by);
    drawWeaponTrail(ctx, wx, wy + WEAPON_DY, ps.weaponRotation, ps.weaponThrust, ps.thrustFx);
    drawPart(ctx, 'weapon', wx, wy + WEAPON_DY, ps.weaponRotation, ps.weaponThrust);
    // 右手黄点：贴着握柄末端，武器前伸时跟着走
    const wr = ps.weaponRotation;
    drawHandDot(
      ctx,
      parts.weapon.px + wx + ps.weaponThrust * Math.cos(wr),
      parts.weapon.py + wy + ps.weaponThrust * Math.sin(wr)
    );
    drawThrustWind(ctx, wx, wy + WEAPON_DY, ps.weaponRotation, ps.thrustFx);
    ctx.restore();
  }

  DG.art.ranger = {
    draw,
    muzzleTip,
    parts,
    ready: () => pending === 0,
    arrowSprite,
    arrowReady: () => arrowPending === 0 && !!arrowSprite.img,
    equipmentSlots: ['head', 'body', 'legL', 'legR', 'weapon']
  };
})();


;
/* ==== js/art/heroes/base.js ==== */
/* 角色美术注册表：每个角色在 art/heroes/<id>.js 内独立注册绘制方式
 * 注册项字段：
 *   mode        'svg' | 'canvas'
 *   svg(cls)    SVG 立绘（mode=svg）
 *   canvasDraw  canvas 立绘 / 待机动画（mode=canvas）
 *   battle(ctx, player, scene)  战斗内绘制（可选）
 *   battleAura(ctx, player, scene) 战斗内被动特效（可选）
 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  DG.art = DG.art || {};
  DG.art.heroes = DG.art.heroes || {};

  DG.art.registerHero = function (id, def) {
    DG.art.heroes[id] = def;
    return def;
  };

  DG.art.heroFor = function (id) {
    return DG.art.heroes[id] || null;
  };

  // 全职业走路腿部动作唯一基准（以野蛮人为准）：
  // 两腿先向身体中线收拢并成平行"筷子状"，再左右交替大幅越过中线交叉迈步。
  // ph 为走路相位；centerL / centerR 为各角色腿位对齐中线所需的水平平移量。
  // 返回：legLX/legRX 水平位移、legL/legR 大腿旋转、legLY/legRY 抬脚高度（负值 = 离地）。
  DG.art.walkLegPose = function (ph, centerL, centerR) {
    const stride = Math.sin(ph || 0);
    const lc = Math.cos(ph || 0);
    return {
      legLX: (centerL == null ? 23 : centerL) + stride * 18,
      legRX: (centerR == null ? -10 : centerR) - stride * 18,
      legL: -stride * 0.22,
      legR: stride * 0.22,
      legLY: -Math.max(0, lc) * 6,
      legRY: -Math.max(0, -lc) * 6
    };
  };

  // 通用矢量立绘：身体与配色固定，武器由各角色模块传入
  DG.art.buildHeroSvg = function (cls, weapon) {
    const accent = cls.color;
    return `
    <svg class="hero-svg" viewBox="0 0 340 520" role="img" aria-label="${U.escapeHtml(cls.name)}形象">
      <ellipse cx="170" cy="490" rx="98" ry="16" fill="rgba(0,0,0,.55)"/>
      <path d="M126 180 C 100 280, 100 380, 112 452 L 228 452 C 240 380, 240 280, 214 180 Z"
            fill="${accent}" opacity=".16"/>
      <path d="M146 340 L140 466 L164 466 L168 342 Z" fill="#23262d"/>
      <path d="M174 340 L178 466 L202 466 L198 340 Z" fill="#262a32"/>
      <path d="M136 458 L164 458 L164 478 L130 478 Z" fill="#14161b"/>
      <path d="M176 458 L204 458 L210 478 L176 478 Z" fill="#14161b"/>
      <path d="M128 168 C 120 210, 122 270, 132 342 L 208 342 C 218 270, 220 210, 212 168 Z" fill="#353b46"/>
      <path d="M142 190 L198 190 L206 262 L170 300 L134 262 Z" fill="${accent}" opacity=".5"/>
      <path d="M142 190 L134 262 L170 300 L206 262 L198 190" fill="none" stroke="rgba(201,162,95,.6)" stroke-width="1.6"/>
      <path d="M118 178 C 114 150, 140 138, 156 144 L 156 170 Z" fill="#454c59"/>
      <path d="M222 178 C 226 150, 200 138, 184 144 L 184 170 Z" fill="#4a5160"/>
      <rect x="160" y="150" width="20" height="24" fill="#d9c8ad"/>
      <circle cx="170" cy="118" r="34" fill="#d9c8ad"/>
      <path d="M134 118 C 132 84, 208 84, 206 118 L 206 102 C 198 80, 142 80, 134 102 Z" fill="#1e2128"/>
      <rect x="142" y="112" width="56" height="9" fill="rgba(0,0,0,.22)"/>
      <ellipse cx="158" cy="132" rx="4" ry="5" fill="#2b2b30"/>
      <ellipse cx="182" cy="132" rx="4" ry="5" fill="#2b2b30"/>
      <path d="M164 146 Q170 150 176 146" stroke="rgba(70,58,50,.75)" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="170" cy="212" r="7" fill="${accent}"/>
      ${weapon || ''}
    </svg>`;
  };

  // 兼容旧调用：按职业 id 取 SVG 立绘
  DG.art.heroSvg = function (cls) {
    const hero = cls && DG.art.heroes[cls.id];
    return hero && hero.svg ? hero.svg(cls) : '';
  };
})();


;
/* ==== js/art/heroes/barbarian.js ==== */
/* 角色美术 · 野蛮人（独立模块）：
 * 头 + 身体 + 全职业公用脚 + 武器（双斧）+ 圆点手
 * 层级：双脚 → 身体 → 头 → 武器 → 手（最前）
 * 待机呼吸/眨眼与游侠保持同一套节奏；脚不浮动
 */
(function () {
  const DG = window.DG;
  const BASE = 'assets/hero/barbarian/';
  const VERSION = '?v=barbarian-compose-20261120';

  // 分件落点（脚底为原点：脚底 = y 0）
  // 头 / 身体 / 武器按资源原始尺寸等比放大 30%；手、脚保持与游侠一致不放大
  const parts = {
    // px/py 为旋转支点：头绕颈部、身体绕髋部
    head: { file: 'head.png', x: -64.85, y: -190.7, w: 139.7, h: 117.7, px: 0, py: -85, img: null },
    body: { file: 'body.png', x: -49.5, y: -103, w: 99, h: 91, px: 0, py: -20, img: null },
    legL: { file: 'leg.png', x: -23, y: -34, w: 13, h: 34, px: -18, py: -31, img: null },
    legR: { file: 'leg.png', x: 10, y: -34, w: 13, h: 34, px: 18, py: -31, img: null }
  };
  // 武器：gx/gy 为握持点（斧柄中段），武器绕该点旋转；图片尺寸保持原图，缩放见 HANDS.scale
  const weapon = { file: 'weapon.png', w: 86, h: 42, gx: 30, gy: 18, img: null };
  const hand = { file: 'hand.png', w: 20, h: 22, img: null };

  // 双手与两把斧子（对照角色拼接效果图：右手斧朝右上、斧头在颊侧，
  // 左手斧垂向右下、斧头落到腿边）
  // 手点位置随身体放大 30%，手本身尺寸不变；斧子等比放大 30%
  const HANDS = {
    right: { x: 58.5, y: -49.5, rot: -0.98, scale: 1.30 },
    left: { x: -52, y: -52, rot: 1.00, scale: 1.30 }
  };

  // 赶路（走路）姿态：两手同一水平线（比待机下移 15px）、各自向中间收 20px，
  // 沿弧线左右摆 ±5°；双斧朝向统一并跟手一起摆
  const WALK_HAND_Y = -45;
  const WALK_HAND_X_R = 38.5;
  const WALK_HAND_X_L = -32;
  // 走路时双斧朝向（左右可分别微调）：0° = 朝右，-90° = 竖直朝上，90° = 竖直朝下，180° = 朝左
  const WALK_ROT_R = -25 * Math.PI / 180;
  const WALK_ROT_L = -25 * Math.PI / 180;
  const WALK_SWAY = 8 * Math.PI / 180;
  // 旋风时身体与斧头绕身体中心旋转，头部与双脚不参与
  const BODY_CY = -57.5;

  let pending = 0;
  // 单个部件加载失败时重试一次：微信弱网或缓存半包很容易只丢一张图，
  // 重试仍失败则放弃，draw 会拒绝绘制缺头/缺身体的半成品
  function loadImg(p, url) {
    pending++;
    const img = new Image();
    img.onload = () => { p.img = img; pending--; };
    img.onerror = () => {
      if (p._retried) { pending--; return; }
      p._retried = true;
      img.src = url + '&retry=1';
    };
    DG.assets.assign(img, url);
  }
  Object.keys(parts).forEach(id => loadImg(parts[id], BASE + parts[id].file + VERSION));
  [weapon, hand].forEach(p => loadImg(p, BASE + p.file + VERSION));

  // 劈砍刀光：不用贴图，直接按斧刃末端真实扫过的圆弧生成月牙形刀光。
  // 右手斧的手点始终绕"两手中点"旋转，刃尖到该点的距离恒定，
  // 所以斧刃轨迹就是一段标准圆弧——刀光画在同一条圆弧上，天然贴合、不会错位。
  const TIP_IMG = { x: 79, y: 35 };   // 斧刃尖端在武器图上的像素位置（86×42，握持点 30,18）
  const SLASH_A0 = -2.95;             // 起弧角（与蓄力最高点对齐，整刀扫过约 271°）
  const SLASH_A1 = 1.78;              // 收弧角（略过挥砍末端，收势更长）
  const SLASH_FADE = 0.16;            // 收弧后的淡出时长（秒）
  const SLASH_R = 1.10;               // 外弧半径略超出斧刃末端，让刀光看起来更开阔
  const SLASH_THICK = 0.58;           // 刀光最大厚度（相对圆弧半径）
  let slashGeo = null;                // 当前月牙几何（收弧后冻结，淡出期间不跳变）
  let slashFadeAt = -1;               // 开始淡出的时刻，-1 表示还在画弧

  // 左手斧刀光：左手不绕中点转，斧头绕自己的手点旋转，所以刃尖轨迹是一个正圆；
  // 比右手小一号（更细、更淡、收弧略早），不抢主手的视觉
  const SLASH_L_A0 = 0.50;            // 左手起弧（斧刃在右下，向上撩）
  const SLASH_L_A1 = -1.80;           // 左手收弧（斧刃到右上，与右手下劈交叉成 X）
  const SLASH_L_R = 1.08;             // 外弧同样略超出刃尖
  const SLASH_L_THICK = 0.50;         // 刀光厚度（右手 0.58）
  const SLASH_L_ALPHA = 0.95;         // 整体不透明度（右手 1）
  let slashGeoL = null, slashFadeAtL = -1, slashAlphaL = 0;

  // 旋风刀光素材：512×512 透明图，弧线圆心在 (0.5186, 0.4738)、半径 0.4279（实测拟合）
  const whirlFx = { img: null, cx: 0.5186, cy: 0.4738, r: 0.4279, tip: 1.50 };
  pending++;
  {
    const img = new Image();
    img.onload = () => { whirlFx.img = img; pending--; };
    img.onerror = () => { pending--; };
    DG.assets.assign(img, 'assets/fx/barb-whirl.png?v=white-20261122b');
  }

  // 头部眼睛位置（head.png 图像坐标，头部当前按 1.43 倍绘制），眨眼时用暗色椭圆遮住
  const EYES = { x: 77, y: 75.9, rx: 18.7, ry: 6.27 };
  const BLINK_PERIOD = 3.2, BLINK_DUR = 0.18;
  // 状态切换过渡时长（秒）与上一帧显示值缓存：腿、手一起参与过渡，避免切换瞬间单点瞬跳
  const TRANS_TIME = 0.12;
  const disp = {
    bodyX: 0, bodyY: 0, bodyRot: 0, headX: 0, headY: 0, headRot: 0, hop: 0,
    legL: 0, legR: 0, legLX: 0, legLY: 0, legRX: 0, legRY: 0,
    handRX: 0, handRY: 0, handLX: 0, handLY: 0, rotR: 0
  };
  const trans = {
    t: 1, bodyX: 0, bodyY: 0, bodyRot: 0, headX: 0, headY: 0, headRot: 0, hop: 0,
    legL: 0, legR: 0, legLX: 0, legLY: 0, legRX: 0, legRY: 0,
    handRX: 0, handRY: 0, handLX: 0, handLY: 0
  };
  let lastState = null, lastT = null, lastWasWhirl = false, dispInited = false, lastAtkT = -1;
  // 旋风出入接力：记录离开轨道瞬间的双手中点、朝向与旋身角，退出后 0.12 秒滑回手心
  const WHIRL_OUT = 0.12;
  const whirlExit = { t: 1, x: 0, y: 0, rot: 0, lx: 0, ly: 0, lrot: 0, spin: 0 };
  let whirlLast = { x: 0, y: 0, rot: 0 };
  let whirlLastL = { x: 0, y: 0 };
  let whirlSpin = 0;
  // 战吼收势后接回旋风：重新用 0.2 秒从手心滑入轨道，避免从举斧姿态一帧跳回旋身
  let whirlReenterT = 1;
  // 双斧惯性：斧头朝向以指数方式追赶手部朝向，快速挥砍时产生拖尾与过冲
  const AXE_TAU = 0.016, AXE_MAX = 0.2;
  const axeFollow = { r: 0, l: 0, ready: false };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // 角度归一化到 (-π, π]：旋身角会累加很多圈，收尾时必须走最短弧收势，
  // 否则斧头会在 0.12 秒内倒转好几圈，看着就是"收尾时乱转/卡一下"
  const wrapPi = (a) => {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  };
  const smooth = k => k * k * (3 - 2 * k);

  function blinkOf(t) {
    const phase = t % BLINK_PERIOD;
    if (phase > BLINK_DUR) return 0;
    const k = phase / BLINK_DUR;
    return k < 0.45 ? smooth(k / 0.45) : smooth((1 - k) / 0.55);
  }

  // 连击节奏：本轮第一刀命中冻结 28ms；两刀间隔 < 1.3 秒视为连击，后续刀缩到 12ms
  let comboStart = -99, comboPrevStart = -99, comboLastRaw = -1;
  function comboFreeze(raw, t) {
    if (comboLastRaw < 0 || raw + 0.02 < comboLastRaw) { comboPrevStart = comboStart; comboStart = t; }
    comboLastRaw = raw;
    return (t - comboPrevStart) < 1.3 ? 0.012 / 0.46 : 0.028 / 0.46;
  }

  // Catmull-Rom 样条：速度在关键帧处连续，不会像 smoothstep 那样每个关键帧都刹停
  function key(t, frames) {
    const n = frames.length;
    if (t <= frames[0][0]) return frames[0][1];
    if (t >= frames[n - 1][0]) return frames[n - 1][1];
    let i = 0;
    while (i < n - 2 && t > frames[i + 1][0]) i++;
    const p1 = frames[i], p2 = frames[i + 1];
    const dt = p2[0] - p1[0];
    const k = (t - p1[0]) / dt;
    // 首尾切线取 0（起止不甩尾）；两键等值时视为停顿段，整段静止
    const flat = p1[1] === p2[1];
    const p0 = frames[Math.max(0, i - 1)], p3 = frames[Math.min(n - 1, i + 2)];
    const m1 = flat || i === 0 ? 0 : (p2[1] - p0[1]) / (p2[0] - p0[0]);
    const m2 = flat || i + 2 >= n ? 0 : (p3[1] - p1[1]) / (p3[0] - p1[0]);
    const k2 = k * k, k3 = k2 * k;
    return (2 * k3 - 3 * k2 + 1) * p1[1] + (k3 - 2 * k2 + k) * dt * m1
      + (-2 * k3 + 3 * k2) * p2[1] + (k3 - k2) * dt * m2;
  }

  function drawPart(ctx, id, dx, dy, rot) {
    const p = parts[id];
    if (!p.img) return;
    if (rot) {
      ctx.save();
      ctx.translate(p.px + dx, p.py + dy);
      ctx.rotate(rot);
      ctx.drawImage(p.img, p.x - p.px, p.y - p.py, p.w, p.h);
      ctx.restore();
    } else {
      ctx.drawImage(p.img, p.x + dx, p.y + dy, p.w, p.h);
    }
  }

  // 斧子：以握持点为轴旋转、缩放
  function drawWeapon(ctx, cfg, x, y, rot) {
    if (!weapon.img) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(cfg.scale, cfg.scale);
    ctx.drawImage(weapon.img, -weapon.gx, -weapon.gy, weapon.w, weapon.h);
    ctx.restore();
  }

  function drawHand(ctx, x, y) {
    if (!hand.img) return;
    ctx.drawImage(hand.img, x - hand.w / 2, y - hand.h / 2, hand.w, hand.h);
  }

  // 刃尖扫过的圆弧：圆心就是手点的旋转中心（两手中点反解回来），
  // 半径取"圆心→斧刃尖端"的实际距离，画出来的弧必然压在斧刃末端上
  function slashArc(rhx, rhy, wrot, sr) {
    const mx = (HANDS.right.x + HANDS.left.x) / 2;
    const my = (HANDS.right.y + HANDS.left.y) / 2;
    const dx = HANDS.right.x - mx, dy = HANDS.right.y - my;
    const cs = Math.cos(sr), sn = Math.sin(sr);
    const cx = rhx - (dx * cs - dy * sn);
    const cy = rhy - (dx * sn + dy * cs);
    const sc = HANDS.right.scale;
    const ox = (TIP_IMG.x - weapon.gx) * sc, oy = (TIP_IMG.y - weapon.gy) * sc;
    const tx = rhx + ox * Math.cos(wrot) - oy * Math.sin(wrot);
    const ty = rhy + ox * Math.sin(wrot) + oy * Math.cos(wrot);
    return { cx, cy, r: (Math.hypot(tx - cx, ty - cy) || 1) * SLASH_R, ang: Math.atan2(ty - cy, tx - cx) };
  }

  // 左手斧刃末端轨迹：斧头绕左手点自转，刃尖到手的距离恒定，轨迹就是一整圆
  function slashArcL(lhx, lhy, wrot) {
    const sc = HANDS.left.scale;
    const ox = (TIP_IMG.x - weapon.gx) * sc, oy = (TIP_IMG.y - weapon.gy) * sc;
    return { cx: lhx, cy: lhy, r: Math.hypot(ox, oy) * SLASH_L_R, ang: wrot + Math.atan2(oy, ox) };
  }

  // 刀光：用实心月牙填充代替「逐段描边」——边缘只留一圈抗锯齿，
  // 不会因为几十段半透明圆头相互重叠而发虚；颜色分成若干块沿弧推进，保持高清锐利。
  function drawSlash(ctx, g, a0, a1, alpha, thick) {
    if (Math.abs(a1 - a0) < 0.05) return;
    thick = thick || SLASH_THICK;
    const span = a1 - a0, absSpan = Math.abs(span);
    // 弧太短时先不画：刃口刚开始移动时若立刻留痕，会变成头后一坨红色光斑
    if (absSpan < 0.5) return;
    // 起手阶段按已扫过的角度渐显，刃口压下来后才是一条完整刀光
    const grow = Math.pow(Math.min(1, (absSpan - 0.5) / 0.75), 0.85);
    // 越靠近刃尖越宽、越亮；尾部迅速收细到几乎为零
    const taper = (k) => Math.pow(k, 1.35) * (1 - 0.85 * Math.pow(k, 6));
    const N = 56;
    const widthAt = (k, wMul) => g.r * thick * grow * wMul * taper(k);
    // 一条闭合月牙：外缘正向走、内缘反向走；out=0.5 时中心线压在刃尖轨迹上
    const crescent = (wMul, out, k0, k1) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const k = k0 + (k1 - k0) * (i / N);
        const a = a0 + span * k;
        const w = widthAt(k, wMul);
        const rr = g.r + w * (out - 0.5);
        const ox = g.cx + Math.cos(a) * (rr + w * 0.5);
        const oy = g.cy + Math.sin(a) * (rr + w * 0.5);
        if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
      }
      for (let i = N; i >= 0; i--) {
        const k = k0 + (k1 - k0) * (i / N);
        const a = a0 + span * k;
        const w = widthAt(k, wMul);
        const rr = g.r + w * (out - 0.5);
        ctx.lineTo(g.cx + Math.cos(a) * (rr - w * 0.5),
          g.cy + Math.sin(a) * (rr - w * 0.5));
      }
      ctx.closePath();
    };
    // 1 红色辉光：多层极淡的加色月牙由内到外叠出连续衰减，
    // 单层很薄所以看不出硬边/色阶，同时能向外打出明显的红光
    const GLOW_N = 12;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < GLOW_N; i++) {
      const t = i / (GLOW_N - 1);
      ctx.globalAlpha = alpha * 0.05 * (1 - 0.55 * t);
      ctx.fillStyle = t < 0.5 ? 'rgb(255,56,24)' : 'rgb(198,18,10)';
      crescent(1.3 + 2.6 * t, 0.5 + 0.22 * t, 0, 1);
      ctx.fill();
    }
    ctx.restore();
    // 2 主体：沿弧切成色块，暗红 → 亮橙红；块与块严格贴合、不做半透明叠加
    const CH = 18;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    for (let c = 0; c < CH; c++) {
      const k0 = c / CH, k1 = (c + 1) / CH;
      const t = Math.min(1, (k0 + k1) * 0.5 / 0.85);
      const r = Math.round(165 + 90 * Math.pow(t, 1.2));
      const gg = Math.round(20 + 120 * Math.pow(t, 1.5));
      const b = Math.round(10 + 60 * Math.pow(t, 1.8));
      ctx.fillStyle = `rgb(${r},${gg},${b})`;
      crescent(1.0, 0.5, k0, k1);
      ctx.fill();
    }
    ctx.restore();
    // 3 刃口：亮橙内芯 + 近白细边，贴着外缘走，保持锐利白热
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = 'rgb(255,150,70)';
    crescent(0.34, 0.62, 0, 1);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.95;
    ctx.fillStyle = 'rgb(255,248,238)';
    crescent(0.13, 0.62, 0, 1);
    ctx.fill();
    ctx.restore();
    // 4 刃尖小爆点：只留一点点亮芯，不做大光球
    const hx = g.cx + Math.cos(a1) * g.r, hy = g.cy + Math.sin(a1) * g.r;
    const rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, g.r * 0.10);
    rg.addColorStop(0, 'rgba(255,226,196,0.42)');
    rg.addColorStop(0.45, 'rgba(255,96,44,0.22)');
    rg.addColorStop(1, 'rgba(200,20,10,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * grow * grow;
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(hx, hy, g.r * 0.10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 姿态：与游侠同一套呼吸（躯干 1.5s ±2px / 头 1.2s ±3px），脚始终不动
  function computePose(o) {
    const state = o.state || 'idle';
    const t = o.t || 0;
    const pose = {
      bodyX: 0, bodyY: 0, headX: 0, headY: 0,
      handX: 0, handY: 0, legL: 0, legR: 0,
      swing: 0, sway: 0, fanL: 0, fanR: 0,
      thrust: 0, atkRotR: 0, atkRotL: 0, liftY: 0, hop: 0,
      bodyRot: 0, headRot: 0,
      legLX: 0, legLY: 0, legRX: 0, legRY: 0,
      handRX: HANDS.right.x, handRY: HANDS.right.y,
      armSwayX: 0, armSwayY: 0, weaponSway: 0,
      roarDX_R: 0, roarDX_L: 0, roarRotR: 0, roarRotL: 0
    };
    if (state === 'whirl') {
      // 旋风：双腿保持与主城完全一致的走路动作，仅步频随移速提升而加快
      const ph = o.walkPhase || 0;
      const stride = Math.sin(ph);
      const legs = DG.art.walkLegPose(ph, 23, -10);
      pose.legLX = legs.legLX;
      pose.legRX = legs.legRX;
      pose.legL = legs.legL;
      pose.legR = legs.legR;
      pose.legLY = legs.legLY;
      pose.legRY = legs.legRY;
      pose.bodyY = Math.abs(stride) * 0.55;
      pose.headY = -Math.abs(stride) * 0.35;
      // 旋身时风压把影子撑开、略淡
      pose.shadowScale = 1.1;
      pose.shadowAlpha = 0.82;
    } else if (state === 'walk') {
      const ph = o.walkPhase || 0;
      const stride = Math.sin(ph);
      // 台步式走法：两腿先向身体中线收拢并成平行"筷子状"，再左右交替越过中线交叉迈步
      // 动作参数统一由 DG.art.walkLegPose 提供，全职业以此为准
      const legs = DG.art.walkLegPose(ph, 23, -10);
      pose.legLX = legs.legLX;
      pose.legRX = legs.legRX;
      pose.legL = legs.legL;
      pose.legR = legs.legR;
      pose.legLY = legs.legLY;
      pose.legRY = legs.legRY;
      // 躯干：每步一次下沉 + 左右重心偏移 + 轻微前倾，并随步幅小幅起伏
      // 用 sin² 代替 |sin|，触地相位不再有速度尖角
      pose.bodyY = Math.sin(ph) ** 2 * 1.1;
      pose.bodyX = stride * 1.6;
      pose.bodyRot = 0.038 + Math.sin(ph * 2 + 0.7) * 0.013;
      // 蹦跶：双腿并拢（ph=0/π）时腾空最高，双腿张开时落地
      pose.hop = Math.cos(ph) ** 2 * 6;
      // 头部：反向下沉稳住视线，横向位移与俯仰都滞后躯干约 0.4rad
      pose.headY = -(Math.sin(ph - 0.35) ** 2) * 0.9;
      // 头部比身体晚 0.3rad 到达最高点，落地时略慢半拍
      pose.headY += Math.cos(ph - 0.3) ** 2 * 6 - pose.hop;
      pose.headX = Math.sin(ph - 0.45) * 1.0;
      pose.headRot = -0.55 * pose.bodyRot + Math.sin(ph * 2 - 0.4) * 0.008;
      // 赶路：两手左右同步摆动（弧线位移），双斧朝统一方向随手摆 ±5°
      const ang = stride * WALK_SWAY;
      pose.armSwayX = Math.sin(ang) * 52;
      pose.armSwayY = (1 - Math.cos(ang)) * 52;
      pose.weaponSway = ang;
    } else if (state === 'attack') {
      // 旋风刚收尾时直接从"已抬手"的相位起手：不再先把手收回身侧、再重新抬一次
      const kick = whirlExit.t < 1 ? 0.16 * (1 - smooth(whirlExit.t)) : 0;
      const raw = clamp((o.attackT || 0) / (o.atkDur || 0.46) + kick, 0, 1);
      // 命中冻结：本轮第一刀停 28ms，连击中的后续刀缩到 12ms，避免连打时"顿顿顿"
      const fz = comboFreeze(raw, o.t || 0);
      const f0 = 0.60, f1 = f0 + fz;
      const p = raw <= f0 ? raw
        : raw <= f1 ? f0
          : f0 + (raw - f1) * ((1 - f0) / (1 - f1));
      // 头部比躯干滞后约 1~2 帧：整条头部曲线后移 0.04
      const hp = clamp(p - 0.04, 0, 1);
      // 抬手蓄力（略后撤并短暂停顿）→ 向前挥砍（手与斧同时前伸 16px）→ 复原
      pose.thrust = key(p, [[0, 0], [0.30, -6], [0.36, -6], [0.56, 24], [0.70, 22], [1, 0]]);
      // 起手先整体抬高双手与斧子并顿一帧，随后随弧线大幅往下砍
      pose.liftY = key(p, [[0, 0], [0.18, -28], [0.30, -42], [0.36, -42], [0.46, -18], [0.56, 0], [1, 0]]);
      // 躯干：蓄力拔高后坐 → 命中下沉前送 → 收势回弹
      //（负值 = 向上/向后，正值 = 向下/向前）
      pose.bodyY = key(p, [[0, 0], [0.12, -1], [0.30, -4], [0.44, 0], [0.56, 6], [0.62, 8], [0.74, 4], [0.86, -1.5], [1, 0]]);
      pose.bodyX = key(p, [[0, 0], [0.12, -1], [0.30, -2], [0.44, 1], [0.56, 3], [0.62, 4], [0.74, 2], [0.86, -0.5], [1, 0]]);
      // 躯干俯仰：后仰 4° → 前倾 5.7° → 轻微回摆
      pose.bodyRot = key(p, [[0, 0], [0.12, -0.04], [0.30, -0.14], [0.44, 0.06], [0.56, 0.21], [0.62, 0.245], [0.74, 0.11], [0.86, -0.025], [1, 0]]);
      // 头部：位移跟随躯干并迟 0.04 追上来，命中后再压一下形成过冲
      const headDY = key(hp, [[0, 0], [0.12, 0.6], [0.30, 1.5], [0.44, 0.5], [0.56, -2.5], [0.64, -1], [0.70, 1.5], [0.82, 0.4], [1, 0]]);
      pose.headY = pose.bodyY + headDY;
      pose.headX = pose.bodyX + key(hp, [[0, 0], [0.30, -1], [0.44, 0], [0.56, 1], [0.62, 3], [0.74, 1], [0.86, -0.5], [1, 0]]);
      // 头部相对躯干的俯仰：蓄力时反向补偿（头比背更直立），命中时略微领先
      pose.headRot = key(hp, [[0, 0], [0.12, 0.02], [0.30, 0.087], [0.44, 0.06], [0.56, 0.04], [0.62, 0.035], [0.74, 0.018], [0.86, -0.006], [1, 0]]);
      // 右手：以两手连线中点为圆点扇形挥砍约 270°，弧线拆成多段走"甩鞭"曲线，末端带过冲
      const sr = key(p, [[0, 0], [0.18, -2.10], [0.30, -2.90], [0.36, -2.90],
        [0.42, -0.70], [0.48, 0.72], [0.52, 1.32], [0.56, 1.72], [0.66, 1.81], [0.78, 1.30], [1, 0]]);
      // 左手：反向向上撩砍（右下起手 → 右上方收势），与右手下劈交叉成 X 形刀锋
      const sl = key(p, [[0, 0], [0.18, 0.30], [0.30, 0.50], [0.36, 0.50],
        [0.42, -0.20], [0.48, -0.90], [0.52, -1.40], [0.56, -1.75], [0.66, -1.80], [0.78, -1.30], [1, 0]]);
      // 右手额外前伸：挥砍时整条手臂再向外探出一截，刀锋扫得更开
      pose.reachR = key(p, [[0, 0], [0.18, 2], [0.30, 4], [0.36, 4], [0.46, 12], [0.56, 16], [0.70, 12], [0.86, 3], [1, 0]]);
      // 左手整体上提并向内交叉：与右手形成 X 形刀锋
      pose.liftL = key(p, [[0, 0], [0.18, -18], [0.30, -30], [0.36, -30], [0.44, -28], [0.56, -40], [0.66, -36], [0.78, -14], [1, 0]]);
      pose.crossL = key(p, [[0, 0], [0.18, 4], [0.30, 8], [0.36, 8], [0.46, 26], [0.56, 46], [0.70, 34], [0.86, 8], [1, 0]]);
      pose.atkRotR = sr;
      pose.atkRotL = sl;
      // 右手点绕两手中点旋转后的位置（圆点即两手中间）
      const mx = (HANDS.right.x + HANDS.left.x) / 2;
      const my = (HANDS.right.y + HANDS.left.y) / 2;
      const dx = HANDS.right.x - mx, dy = HANDS.right.y - my;
      const cs = Math.cos(sr), sn = Math.sin(sr);
      pose.handRX = mx + dx * cs - dy * sn;
      pose.handRY = my + dx * sn + dy * cs;
    } else if (state === 'roar') {
      // 战吼：先双手把双斧举过头顶蓄力（斧刃朝上），释放瞬间双手向外炸开、身体前顶，
      // 最后整体收势回待机基础姿态；全程由场景 roar.t 驱动的连续曲线，不跳帧
      const ch = o.roarCharge || 0.42;
      const tot = o.roarTotal || 0.95;
      const rt = o.roarT || 0;
      // 蓄力：0→1 平滑举到顶点
      const cq = smooth(clamp(rt / ch, 0, 1));
      // 爆发：跨过 charge 后 0.12 秒冲开
      const bs = rt > ch ? smooth(clamp((rt - ch) / 0.12, 0, 1)) : 0;
      // 收势：0.72 秒后回落到基础姿态
      const rec = smooth(clamp((rt - 0.72) / Math.max(0.08, tot - 0.72), 0, 1));
      const act = cq * (1 - rec);
      const burst = bs * (1 - rec);
      // 蓄力到顶的轻微颤抖（约 11Hz）：只抖手与躯干，脚钉地
      const shiver = Math.sin(t * 68) * cq * (1 - bs) * 0.9;
      // 双手：上举并向中间收拢；爆发时向下、向外张开
      pose.liftY = -108 * act + 24 * burst + shiver * 1.2;
      pose.roarDX_R = -26 * act + 50 * burst;
      pose.roarDX_L = 24 * act - 48 * burst;
      // 躯干：蓄力下沉后仰，爆发前顶
      pose.bodyY = 4 * act - 2 * burst;
      pose.bodyX = -2 * act + 3 * burst + shiver * 0.5;
      pose.bodyRot = -0.15 * act + 0.27 * burst;
      // 头部：蓄力微仰、爆发后甩，比躯干更稳
      pose.headY = pose.bodyY - 2 * act + shiver * 0.5;
      pose.headX = pose.bodyX;
      pose.headRot = -0.02 * act - 0.30 * burst;
      // 双腿撑开，配合下蹲
      pose.legLX = -3 * act;
      pose.legRX = 3 * act;
      // 双斧：蓄力竖直朝上（略呈 V 字），爆发向外甩开
      pose.roarRotR = HANDS.right.rot - 0.34 * act + 0.58 * burst;
      pose.roarRotL = HANDS.left.rot - 2.57 * act - 0.58 * burst;
    } else {
      pose.bodyY = Math.sin(t * (Math.PI * 2 / 1.5)) * 2.0;
      pose.headY = Math.sin(t * (Math.PI * 2 / 1.2)) * 3.0;
      // 武器随手小幅摆动，箭尖量级的呼吸幅度
      pose.sway = Math.sin(t * (Math.PI * 2 / 1.5)) * 0.021;
      // 双斧各绕手点扇形上下浮动：左手 ±10°、周期 1.2s；右手 ±20°、周期 1.5s
      const DEG = Math.PI / 180;
      pose.fanL = Math.sin(t * (Math.PI * 2 / 1.2)) * (10 * DEG);
      pose.fanR = Math.sin(t * (Math.PI * 2 / 1.5)) * (20 * DEG);
    }
    // 统一规则：战斗中只要在移动，双腿一律播放与主城相同的走路动作，
    // 攻击/战吼/旋风/震动波等任何状态都不得冻结或替换腿部动作
    if (o.moving) {
      const legs = DG.art.walkLegPose(o.walkPhase || 0, 23, -10);
      pose.legLX = legs.legLX;
      pose.legRX = legs.legRX;
      pose.legL = legs.legL;
      pose.legR = legs.legR;
      pose.legLY = legs.legLY;
      pose.legRY = legs.legRY;
    }
    return pose;
  }

  function draw(ctx, x, y, opts) {
    // 头或身体还没到位时整只不画，绝不出现“有身体没头”的半成品
    if (pending || !parts.head.img || !parts.body.img) return;
    const o = opts || {};
    const pose = computePose(o);
    const state = o.state || 'idle';
    // 状态切换过渡：把切换瞬间的旧姿态差值在 TRANS_TIME 内衰减掉，避免走路/待机/出刀之间硬切
    const nowT = o.t || 0;
    let dts = lastT === null ? 0 : nowT - lastT;
    if (!(dts > 0) || dts > 0.1) dts = 0;
    lastT = nowT;
    let justSwitched = false;
    // 攻击时间轴回卷：攻速较高时新一刀会在上一刀收势前出手，attackT 归零。
    // 若不做过渡，手与斧会在一帧内跳回起手位，看起来就是"顿一下"。
    const atkNow = o.attackT || 0;
    const rewound = state === 'attack' && lastState === 'attack' && atkNow + 0.05 < lastAtkT;
    lastAtkT = atkNow;
    if (lastState === null) {
      // 首次绘制直接对齐，不做过渡
      lastState = state;
      trans.t = 1;
    } else if (state !== lastState || rewound) {
      trans.t = 0;
      justSwitched = true;
      trans.bodyX = disp.bodyX - pose.bodyX;
      trans.bodyY = disp.bodyY - pose.bodyY;
      trans.bodyRot = disp.bodyRot - pose.bodyRot;
      trans.headX = disp.headX - pose.headX;
      trans.headY = disp.headY - pose.headY;
      trans.headRot = disp.headRot - pose.headRot;
      trans.hop = disp.hop - pose.hop;
      // 双腿同样参与过渡（走路↔待机↔旋风之间不再换腿型瞬跳）
      trans.legL = disp.legL - pose.legL;
      trans.legR = disp.legR - pose.legR;
      trans.legLX = disp.legLX - pose.legLX;
      trans.legLY = disp.legLY - pose.legLY;
      trans.legRX = disp.legRX - pose.legRX;
      trans.legRY = disp.legRY - pose.legRY;
      if (state !== 'whirl' && lastWasWhirl) {
        whirlExit.t = 0;
        whirlExit.x = whirlLast.x;
        whirlExit.y = whirlLast.y;
        whirlExit.rot = whirlLast.rot;
        // 左手从旋身轨道位置收出，而不是凭空跳回左侧手心
        whirlExit.lx = whirlLastL.x;
        whirlExit.ly = whirlLastL.y;
        whirlExit.lrot = whirlLast.rot;
        whirlExit.spin = whirlSpin;
      }
      // 战吼结束、旋风还在持续：手从举斧位置重新滑入旋身轨道
      if (state === 'whirl' && lastState === 'roar') whirlReenterT = 0;
      lastWasWhirl = state === 'whirl';
      lastState = state;
    }
    trans.t = Math.min(1, trans.t + (dts || 1 / 60) / (rewound ? 0.08 : TRANS_TIME));
    whirlExit.t = Math.min(1, whirlExit.t + (dts || 1 / 60) / WHIRL_OUT);
    whirlReenterT = Math.min(1, whirlReenterT + (dts || 1 / 60) / 0.2);
    const ew = 1 - smooth(trans.t);
    pose.bodyX += trans.bodyX * ew;
    pose.bodyY += trans.bodyY * ew;
    pose.bodyRot += trans.bodyRot * ew;
    pose.headX += trans.headX * ew;
    pose.headY += trans.headY * ew;
    pose.headRot += trans.headRot * ew;
    pose.hop += trans.hop * ew;
    pose.legL += trans.legL * ew;
    pose.legR += trans.legR * ew;
    pose.legLX += trans.legLX * ew;
    pose.legLY += trans.legLY * ew;
    pose.legRX += trans.legRX * ew;
    pose.legRY += trans.legRY * ew;
    disp.bodyX = pose.bodyX; disp.bodyY = pose.bodyY; disp.bodyRot = pose.bodyRot;
    disp.headX = pose.headX; disp.headY = pose.headY; disp.headRot = pose.headRot;
    disp.hop = pose.hop;
    disp.legL = pose.legL; disp.legR = pose.legR;
    disp.legLX = pose.legLX; disp.legLY = pose.legLY;
    disp.legRX = pose.legRX; disp.legRY = pose.legRY;
    // 位移量化到四分之一像素，避免慢速呼吸时位图反复重采样发糊
    const qv = v => Math.round(v * 4) / 4;
    const by = qv(pose.bodyY);
    const hx = qv(pose.handX), hyy = qv(pose.handY);
    const scale = o.scale == null ? 1 : o.scale;
    const mirror = o.flip ? -1 : 1;

    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);
    ctx.scale(scale * mirror, scale);

    if (o.shadow) {
      // 腾空越高，影子越小越淡
      const hop = pose.hop || 0;
      const shrink = (1 - hop * 0.03) * (pose.shadowScale || 1);
      ctx.save();
      ctx.scale(1, 0.26);
      ctx.fillStyle = 'rgba(0,0,0,' + ((0.38 - hop * 0.012) * (pose.shadowAlpha || 1)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, 46 * shrink, 12 * shrink, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 蹦跶：整体（含双脚）离地，影子留在原地
    if (pose.hop) ctx.translate(0, -qv(pose.hop));

    // 手点（随身体浮动、攻击前伸与赶路摆动一起移动）
    const walking = o.state === 'walk';
    const attacking = o.state === 'attack';
    const roaring = o.state === 'roar';
    const swayX = pose.armSwayX, swayY = pose.armSwayY;
    const thrust = attacking ? pose.thrust : 0;
    // 举斧蓄力同样需要整体抬手：吼叫与普攻共用 liftY 通道
    const lift = attacking || roaring ? pose.liftY : 0;
    // 躯干绕髋部旋转时颈部落点会横向偏移，头部按该位移跟随，避免头身分离
    const br = pose.bodyRot || 0;
    const neckDY = parts.head.py - parts.body.py;
    const nx = -neckDY * Math.sin(br);
    const ny = -neckDY * (1 - Math.cos(br));
    const bx = qv(pose.bodyX);
    const rHand = {
      x: (walking ? WALK_HAND_X_R : attacking ? pose.handRX : HANDS.right.x) + hx + bx + swayX + thrust + (attacking ? pose.reachR : 0) + (roaring ? pose.roarDX_R : 0),
      y: (walking ? WALK_HAND_Y : attacking ? pose.handRY : HANDS.right.y) + by + hyy + swayY + lift
    };
    const lHand = {
      x: (walking ? WALK_HAND_X_L : HANDS.left.x) + hx + bx + swayX + thrust + (attacking ? pose.crossL : 0) + (roaring ? pose.roarDX_L : 0),
      y: (walking ? WALK_HAND_Y : HANDS.left.y) + by + hyy + swayY + lift + (attacking ? pose.liftL : 0)
    };
    // 手点过渡：切换瞬间把手从上一姿态的位置滑到新姿态，攻击被打断也不会瞬跳
    if (justSwitched) {
      trans.handRX = disp.handRX - rHand.x;
      trans.handRY = disp.handRY - rHand.y;
      trans.handLX = disp.handLX - lHand.x;
      trans.handLY = disp.handLY - lHand.y;
    }
    rHand.x += trans.handRX * ew; rHand.y += trans.handRY * ew;
    lHand.x += trans.handLX * ew; lHand.y += trans.handLY * ew;
    disp.handRX = rHand.x; disp.handRY = rHand.y;
    disp.handLX = lHand.x; disp.handLY = lHand.y;
    // 赶路：双斧统一朝向随手摆；攻击：各绕自己的圆点扇挥；其余：呼吸浮动
    const rRot = walking
      ? WALK_ROT_R + pose.weaponSway
      : attacking
        ? HANDS.right.rot + pose.atkRotR
        : roaring
          ? pose.roarRotR
          : HANDS.right.rot + pose.sway + pose.fanR;
    const lRot = walking
      ? WALK_ROT_L + pose.weaponSway
      : attacking
        ? HANDS.left.rot + pose.atkRotL
        : roaring
          ? pose.roarRotL
          : HANDS.left.rot + pose.sway + pose.fanL;
    // 斧头惯性跟随：实际朝向以指数方式追赶手部朝向，快挥时斧刃自然拖后并过冲
    if (!axeFollow.ready) { axeFollow.r = rRot; axeFollow.l = lRot; axeFollow.ready = true; }
    else {
      const ak = 1 - Math.exp(-(dts > 0 ? dts : 1 / 60) / AXE_TAU);
      axeFollow.r += (rRot - axeFollow.r) * ak;
      axeFollow.l += (lRot - axeFollow.l) * ak;
    }
    let wRotR = rRot + Math.max(-AXE_MAX, Math.min(AXE_MAX, axeFollow.r - rRot));
    let wRotL = lRot + Math.max(-AXE_MAX, Math.min(AXE_MAX, axeFollow.l - lRot));

    // 旋风退场接力：0.12 秒内把双手与双斧从轨道位置滑回手心，
    // 并保留一小段切向惯性，收尾走弧线而不是直线急停
    if (whirlExit.t < 1) {
      const wk = smooth(whirlExit.t);
      const sw = (1 - wk) * (1 - wk);
      const tx = -Math.sin(whirlExit.spin) * 22 * sw;
      const ty = Math.cos(whirlExit.spin) * 7 * sw;
      rHand.x = whirlExit.x + (rHand.x - whirlExit.x) * wk + tx;
      rHand.y = whirlExit.y + (rHand.y - whirlExit.y) * wk + ty;
      lHand.x = whirlExit.lx + (lHand.x - whirlExit.lx) * wk + tx;
      lHand.y = whirlExit.ly + (lHand.y - whirlExit.ly) * wk + ty;
      wRotR = whirlExit.rot + wrapPi(wRotR - whirlExit.rot) * wk;
      // 左斧旋身期间隐藏，收尾时从同一条轨道滑出，避免整只手"凭空出现"
      wRotL = whirlExit.lrot + wrapPi(wRotL - whirlExit.lrot) * wk;
      disp.handRX = rHand.x; disp.handRY = rHand.y;
      disp.handLX = lHand.x; disp.handLY = lHand.y;
    }
    disp.rotR = wRotR;
    dispInited = true;

    // 旋风：躯干不做整身翻转，只做偏航挤压；斧头绕身体中心画椭圆轨迹，带刀光拖尾
    if (o.state === 'whirl') {
      const sp = o.spin || 0;
      // 起手 0.2 秒内从手心向外展开，和普通姿态无缝衔接（战吼后接回旋风同样重走这段展开）
      const bt = Math.min(1, Math.min(o.spinT || 0, whirlReenterT) / 0.2);
      const blend = bt * bt * (3 - 2 * bt);
      const cy = -45;                            // 轨迹中心压到腰腹，避免斧头钻到头盔后面
      const R = 118 * blend;
      const ax = Math.cos(sp) * R;
      const ay = cy + Math.sin(sp) * R * 0.32;
      // 斧刃比轨迹位置滞后约 22°，像被身体甩着走（0.15~0.35 之间可调）
      const DRAG = 0.38;
      const rt = sp - DRAG;
      const hpx = Math.sin(rt) * 5, hpy = Math.cos(rt) * 2.5;

      // 刀光：椭圆轨道直接按"手轨道 + 刃长"推出，亮头正好压在斧刃末端上
      // 刃尖相对斧柄不是纯径向（图内还有个 y 分量），必须把横向偏移和相位一起算进来：
      // 只取 x 分量会让刃尖轨迹被算成一个倾斜椭圆，看起来像斜着转。
      const tipDX = (TIP_IMG.x - weapon.gx) * HANDS.right.scale;   // 刃尖相对握持点的 x 偏移
      const tipDY = (TIP_IMG.y - weapon.gy) * HANDS.right.scale;   // 刃尖相对握持点的 y 偏移
      const reach = Math.hypot(tipDX, tipDY);                      // 握持点到刃尖的实际长度
      const tipPhase = Math.atan2(tipDY, tipDX);                   // 刃尖相对斧柄方向的相位
      // 净滞后 = 斧向拖后量 - 刃尖相位；接近 0 时刃尖轨迹就是标准水平椭圆
      const lag = DRAG - tipPhase;
      // 刃尖轨迹 = 手轨道（椭圆） + 刃长（圆）的合成，直接用仿射矩阵精确还原
      const csd = Math.cos(lag), snd = Math.sin(lag);
      const mA = R + reach * csd, mB = reach * snd;
      const mC = -reach * snd, mD = R * 0.32 + reach * csd;
      ctx.save();
      ctx.translate(0, cy);
      if (mA > 40 && whirlFx.img) {
        ctx.transform(mA, mC, mB, mD, 0, 0);
        const S = 1 / whirlFx.r;                     // 单位空间里让素材弧半径正好等于 1
        const ox = -whirlFx.cx * S, oy = -whirlFx.cy * S;
        // 亮头压在斧刃末端：素材亮头实测在 1.50 rad
        ctx.rotate(sp - whirlFx.tip);
        // 淡白外发光：以弧心为原点把同一张弧光素材外扩两层低透明度副本，
        // 只露出弧线外侧一小圈，形成柔和外发光，不额外加宽刀光本体
        ctx.globalAlpha = 0.16 * blend;
        ctx.drawImage(whirlFx.img, ox * 1.035, oy * 1.035, S * 1.035, S * 1.035);
        ctx.globalAlpha = 0.09 * blend;
        ctx.drawImage(whirlFx.img, ox * 1.07, oy * 1.07, S * 1.07, S * 1.07);
        ctx.globalAlpha = 0.95 * blend;
        ctx.drawImage(whirlFx.img, ox, oy, S, S);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // 斧头残影：沿轨迹后方补三帧，让旋转是连续扫过而不是跳格
      for (let i = 1; i <= 5; i++) {
        const ga = sp - i * 0.095;
        ctx.globalAlpha = (0.28 - i * 0.042) * blend;
        drawWeapon(ctx, HANDS.right, Math.cos(ga) * R, cy + Math.sin(ga) * R * 0.32, ga - DRAG);
      }
      ctx.globalAlpha = 1;

      drawPart(ctx, 'legL', qv(pose.legLX), qv(pose.legLY), pose.legL);
      drawPart(ctx, 'legR', qv(pose.legRX), qv(pose.legRY), pose.legR);

      // 进场接力：位置与朝向从"上一帧实际手点/斧向"lerp 到轨道，配合半径展开，起手不再硬切
      const srcX = dispInited ? disp.handRX : HANDS.right.x;
      const srcY = dispInited ? disp.handRY : HANDS.right.y;
      const srcRot = dispInited ? disp.rotR : HANDS.right.rot;
      const px = srcX + (ax - srcX) * blend;
      const py = srcY + (ay - srcY) * blend;
      const prot = srcRot + (rt - srcRot) * blend;
      whirlLast = { x: px, y: py, rot: prot };
      whirlLastL.x = px - hpx;
      whirlLastL.y = py + hpy;
      whirlSpin = sp;

      const drawBlade = () => {
        // 斧刃角度比位置稍滞后，像被甩着走
        drawWeapon(ctx, HANDS.right, px, py, prot);
        drawHand(ctx, px - hpx, py + hpy);
        drawHand(ctx, px + hpx, py - hpy);
      };

      // 躯干：水平挤压模拟转身朝向，加一点离心倾斜，不做旋转
      const sx = 0.86 + 0.14 * Math.abs(Math.cos(sp));
      ctx.save();
      ctx.translate(0, cy);
      ctx.rotate(Math.sin(sp) * 0.05);
      ctx.scale(sx, 1);
      ctx.translate(0, -cy);
      drawPart(ctx, 'body', bx, by, 0);
      ctx.restore();

      drawBlade();

      const whx = qv(pose.headX), why = qv(pose.headY);
      const whr = pose.headRot || 0;
      drawPart(ctx, 'head', whx, why, whr);
      const wb = blinkOf(o.t || 0);
      if (wb > 0.01) {
        ctx.save();
        ctx.translate(parts.head.px + whx, parts.head.py + why);
        ctx.rotate(whr);
        ctx.fillStyle = '#1b120d';
        ctx.beginPath();
        ctx.ellipse(EYES.x + parts.head.x - parts.head.px,
          EYES.y + parts.head.y - parts.head.py,
          EYES.rx, EYES.ry * wb, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    // 1 右手斧的手（垫在斧子下方）
    drawHand(ctx, rHand.x, rHand.y);
    // 2 右手斧
    drawWeapon(ctx, HANDS.right, rHand.x, rHand.y, wRotR);
    // 3 双脚（走路时脚下带前后位移与抬脚）
    drawPart(ctx, 'legL', qv(pose.legLX), qv(pose.legLY), pose.legL);
    drawPart(ctx, 'legR', qv(pose.legRX), qv(pose.legRY), pose.legR);
    // 4 身体（绕髋部俯仰）
    drawPart(ctx, 'body', bx, by, br);
    // 5 劈砍刀光：压在身体之上、头之下，扫过头脸时被头挡住
    slashAlphaL = 0;
    if (o.t != null) {
      const ap = o.atkDur ? clamp((o.attackT || 0) / o.atkDur, 0, 1) : 0;
      const sr = pose.atkRotR || 0;
      const sl = pose.atkRotL || 0;
      // 新一刀起手：清掉上一刀的淡出进度，重新画弧
      if (attacking && ap < 0.3) { slashFadeAt = -1; slashFadeAtL = -1; }
      let alpha = 0;
      // 蓄力阶段不画；下劈过程中弧线随斧刃推进，越过收弧角后冻结成完整月牙
      if (attacking && ap >= 0.3 && slashFadeAt < 0 && sr >= SLASH_A0) {
        const g = slashArc(rHand.x, rHand.y, wRotR, sr);
        slashGeo = {
          cx: g.cx, cy: g.cy, r: g.r,
          a0: g.ang + SLASH_A0 - sr,
          a1: sr >= SLASH_A1 ? g.ang + SLASH_A1 - sr : g.ang
        };
        alpha = 1;
        if (sr >= SLASH_A1) slashFadeAt = o.t;
      } else if (slashFadeAt >= 0) {
        alpha = clamp(1 - (o.t - slashFadeAt) / SLASH_FADE, 0, 1);
        if (alpha <= 0) { slashFadeAt = -1; slashGeo = null; }
      }
      if (slashGeo && alpha > 0) drawSlash(ctx, slashGeo, slashGeo.a0, slashGeo.a1, alpha);
      // 左手刀光：反向撩砍，弧更短、更细、更淡（压在身体之上、头之下）
      if (attacking && ap >= 0.3 && slashFadeAtL < 0 && sl <= SLASH_L_A0) {
        const gl = slashArcL(lHand.x, lHand.y, wRotL);
        slashGeoL = {
          cx: gl.cx, cy: gl.cy, r: gl.r,
          a0: gl.ang + SLASH_L_A0 - sl,
          a1: sl <= SLASH_L_A1 ? gl.ang + SLASH_L_A1 - sl : gl.ang
        };
        slashAlphaL = SLASH_L_ALPHA;
        if (sl <= SLASH_L_A1) slashFadeAtL = o.t;
      } else if (slashFadeAtL >= 0) {
        slashAlphaL = SLASH_L_ALPHA * clamp(1 - (o.t - slashFadeAtL) / SLASH_FADE, 0, 1);
        if (slashAlphaL <= 0) { slashFadeAtL = -1; slashGeoL = null; slashAlphaL = 0; }
      }
    }
    // 左手刀光：压在身体之上、头之下，挥到脸前时被头部挡住
    if (slashGeoL && slashAlphaL > 0) {
      drawSlash(ctx, slashGeoL, slashGeoL.a0, slashGeoL.a1, slashAlphaL, SLASH_L_THICK);
    }
    // 6 头（跟随颈部实际位移，并叠加相对躯干的俯仰）
    const hdx = qv(pose.headX + nx), hdy = qv(pose.headY + ny);
    const hrot = (pose.headRot || 0) + br;
    drawPart(ctx, 'head', hdx, hdy, hrot);

    // 眨眼：遮住面甲上的双眼（随头部的位移与旋转一起变换）
    const blink = blinkOf(o.t || 0);
    if (blink > 0.01 && o.state !== 'attack') {
      ctx.save();
      ctx.translate(parts.head.px + hdx, parts.head.py + hdy);
      ctx.rotate(hrot);
      ctx.fillStyle = '#1b120d';
      ctx.beginPath();
      ctx.ellipse(EYES.x + parts.head.x - parts.head.px,
        EYES.y + parts.head.y - parts.head.py,
        EYES.rx, EYES.ry * blink, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 7 左脚斧（压在头与身体之上）
    drawWeapon(ctx, HANDS.left, lHand.x, lHand.y, wRotL);
    // 8 左脚斧的手（压在最上层）
    drawHand(ctx, lHand.x, lHand.y);

    ctx.restore();
  }

  const hero = {
    draw,
    parts,
    weapon,
    hand,
    ready: () => pending === 0 && !!(parts.head.img && parts.body.img),
    equipmentSlots: ['head', 'body', 'legL', 'legR', 'weapon', 'hand']
  };
  // 劈砍命中判定：直接按刀光可见亮部的半径与扇形给出，保证“刀光扫到就判中”。
  // 半径由右手斧刃绕枢轴的实际轨迹推出（含斧头追手的最大超前角），再乘绘制缩放。
  const HIT_DX = HANDS.right.x - (HANDS.right.x + HANDS.left.x) / 2;
  const HIT_DY = HANDS.right.y - (HANDS.right.y + HANDS.left.y) / 2;
  const TIP_DX = (TIP_IMG.x - weapon.gx) * HANDS.right.scale;
  const TIP_DY = (TIP_IMG.y - weapon.gy) * HANDS.right.scale;
  const HIT_LAG = HANDS.right.rot + AXE_MAX;
  const HIT_BASE = Math.hypot(
    TIP_DX + HIT_DX * Math.cos(HIT_LAG) - HIT_DY * Math.sin(HIT_LAG),
    TIP_DY + HIT_DX * Math.sin(HIT_LAG) + HIT_DY * Math.cos(HIT_LAG)
  ) * SLASH_R;
  hero.slashArc = Math.abs(SLASH_A1 - SLASH_A0);   // 刀光实际扫过的弧度（约 271°）
  hero.slashReach = Math.round(
    HIT_BASE * (1 + SLASH_THICK * 0.565 * 0.5) * 0.7273 + 2
  );                                               // 亮部外沿（世界单位）
  DG.art.barbarian = hero;

  DG.art.registerHero('warrior', {
    id: 'warrior',
    mode: 'canvas',
    ready: () => hero.ready(),
    canvasDraw(ctx, x, y, opts) { hero.draw(ctx, x, y, opts); },
    battle(ctx, p, scene) {
      const w = scene && scene.whirl;
      const roar = scene && scene.roar;
      const atkDur = p.atkDur || 0.46;
      hero.draw(ctx, 0, p.r * 0.92, {
        scale: 0.7273,
        flip: !!p.flip,
        // 战吼优先级最高：蓄力与释放期间整套动作独占，不被普攻/旋风姿态打断
        state: roar ? 'roar' : (w ? 'whirl' : ((p.atkAnim || 0) > 0 ? 'attack' : (p.moving ? 'walk' : 'idle'))),
        t: scene.time,
        walkPhase: p.walkPhase || 0,
        // 是否在移动：决定双腿是否播放走路动作（与状态无关）
        moving: !!p.moving,
        // 攻击时间轴按实际挥砍时长归一：攻速高时动作缩短但完整播完
        attackT: atkDur - (p.atkAnim || 0),
        atkDur: atkDur,
        // 战吼时间轴：蓄力 charge 秒后释放，total 秒收完
        roarT: roar ? roar.t : 0,
        roarCharge: roar ? roar.charge : 0.42,
        roarTotal: roar ? roar.total : 0.95,
        // 旋风：角度由场景持续累加，连续施放时衔接不跳
        spin: w ? (scene.whirlSpin || 0) : 0,
        spinT: w ? (scene.whirlChainT || 0) : 0
      });
    }
  });
})();


;
/* ==== js/art/heroes/mage.js ==== */
/* 角色美术 · 术士：法杖 + 奥术宝石 */
(function () {
  const DG = window.DG;

  DG.art.registerHero('mage', {
    id: 'mage',
    mode: 'svg',
    svg(cls) {
      const accent = cls.color;
      const weapon = `
        <path d="M206 200 L242 246 L230 260 L196 218 Z" fill="#3b414d"/>
        <path d="M258 166 L266 452" stroke="#6b5334" stroke-width="7" stroke-linecap="round"/>
        <circle cx="259" cy="138" r="32" fill="${accent}" opacity=".18"/>
        <circle cx="259" cy="138" r="19" fill="${accent}" opacity=".8"/>
        <circle cx="259" cy="138" r="9" fill="#eef3ff" opacity=".9"/>`;
      return DG.art.buildHeroSvg(cls, weapon);
    }
  });
})();


;
/* ==== js/art/heroes/ranger.js ==== */
(function () {
  const DG = window.DG;
  const U = DG.util;

  DG.art.registerHero('ranger', {
    id: 'ranger',
    mode: 'canvas',

    canvasDraw(ctx, x, y, opts) {
      if (DG.art.ranger) DG.art.ranger.draw(ctx, x, y, opts);
    },

    battle(ctx, p, scene) {
      const hurt = (p.hurtT || 0) > 0;
      const state = hurt ? 'hurt'
        : (p.atkAnim || 0) > 0 ? 'attack'
        : (p.moving ? 'walk' : 'combat');
      DG.art.ranger.draw(ctx, 0, p.r * 0.92, {
        scale: 0.7273,
        flip: !!p.flip,
        state,
        t: scene.time,
        walkPhase: p.walkPhase || 0,
        moving: !!p.moving,
        attackT: 0.46 - (p.atkAnim || 0),
        hurtT: p.hurtT || 0,
        aim: Math.asin(U.clamp(Math.sin(p.facing), -0.996, 0.996))
      });
    },

    // 箭尖的局部偏移（相对玩家坐标，已含缩放与左右镜像），
    // 技能弹道从这里起飞，随武器转动与出手前伸一起变化
    muzzle(p, scene) {
      if (!DG.art.ranger || !DG.art.ranger.muzzleTip) return null;
      const hurt = (p.hurtT || 0) > 0;
      const state = hurt ? 'hurt'
        : (p.atkAnim || 0) > 0 ? 'attack'
        : (p.moving ? 'walk' : 'combat');
      const tip = DG.art.ranger.muzzleTip({
        state,
        t: scene ? scene.time : 0,
        walkPhase: p.walkPhase || 0,
        attackT: 0.46 - (p.atkAnim || 0),
        hurtT: p.hurtT || 0,
        aim: Math.asin(U.clamp(Math.sin(p.facing), -0.996, 0.996))
      });
      const mirror = p.flip ? -1 : 1;
      return {
        x: tip.x * 0.7273 * mirror,
        y: tip.y * 0.7273,
        angle: tip.angle
      };
    },

    battleAura(ctx, p, scene) {
      const tm = scene.talentTimers;
      if (!tm) return;

      if (tm.rollHaste > 0) {
        ctx.save();
        ctx.translate(0, 2);
        ctx.strokeStyle = 'rgba(160, 220, 170, .6)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        const ph = scene.time * 5;
        for (let i = 0; i < 3; i++) {
          const a = ph + i * (Math.PI * 2 / 3);
          ctx.beginPath();
          ctx.ellipse(0, 0, 19 + i * 3, 6.5 + i * 0.8, 0, a, a + 1.05);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (tm.postHurt > 0) {
        const bx = -Math.cos(p.facing), by = -Math.sin(p.facing);
        ctx.save();
        ctx.strokeStyle = 'rgba(190, 230, 200, .5)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.globalAlpha = Math.min(1, tm.postHurt);
        for (let i = -1; i <= 1; i++) {
          const ox = -by * i * 9, oy = bx * i * 7 - 4;
          const d0 = 20 + Math.abs(i) * 5, d1 = 44 + Math.abs(i) * 9;
          ctx.beginPath();
          ctx.moveTo(bx * d0 + ox, by * d0 + oy);
          ctx.lineTo(bx * d1 + ox, by * d1 + oy);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  });
})();


;
/* ==== js/art/bosses.js ==== */
/* 美术 · 首领：两张设定图 + 程序化待机 / 蓄力 / 出手 / 受击表现
 * 用法：DG.art.bosses.draw(ctx, monster, { t, cast })
 *   ctx 已平移到首领中心；内部按“底部贴地”锚定绘制。
 * 所有贴图在首次加载后缓存为离屏画布，并额外缓存白色受击剪影与染色版本，
 * 运行时只做 drawImage，避免逐帧滤镜与像素操作。
 */
(function () {
  const DG = window.DG;
  DG.art = DG.art || {};
  const PI2 = Math.PI * 2;
  // 暗黑调色：贴图首领加载时烘焙暗色版本
  const DARK_FILTER_TEX = 'saturate(0.62) brightness(0.84) contrast(1.26) hue-rotate(-6deg)';

  // 25 位首领全部使用本轮新贴图（一一对应，无复用 / 无染色）
  const DEFS = {
    slimeking: { src: 'assets/bosses/slimeking.png', height: 250, kind: 'golem', glow: '#5fd0c0' },
    reaper: { parts: 'reaper', height: 260, kind: 'reaper', glow: '#8b5fd6' },
    goatbrute: { parts: 'goatbrute', height: 244, kind: 'goat', glow: '#c07be0' },
    mawfish: { src: 'assets/bosses/mawfish.png', height: 240, kind: 'maw', glow: '#e0666a' },
    croc: { parts: 'croc', height: 236, kind: 'croc', glow: '#93d47a' },
    mushroomgun: { parts: 'cactus', height: 240, kind: 'hierophant', glow: '#ffcf7a' },
    golem: { parts: 'icegolem', height: 264, kind: 'golem', glow: '#7fd8f0' },
    eyehorror: { parts: 'grimoire', height: 244, kind: 'eye', glow: '#f0d060' },
    mawflowerking: { parts: 'flowerking', height: 250, kind: 'maw', glow: '#e05a7a' },
    cauldron: { parts: 'potknight', height: 240, kind: 'cauldron', glow: '#ffa54a' },
    crystalcrab: { parts: 'crystalcrab', height: 232, kind: 'crystal', glow: '#b877e0' },
    pinkdemon: { parts: 'pinkdemon', height: 244, kind: 'demon', glow: '#ff7aa0' },
    pumpkinlord: { parts: 'pumpkinlord', height: 248, kind: 'cauldron', glow: '#ff9a3c' },
    octoking: { parts: 'octowing', height: 252, kind: 'octo', glow: '#b07ae0' },
    mummyking: { parts: 'banshee', height: 238, kind: 'mummy', glow: '#b8c0c8' },
    blueogre: { src: 'assets/bosses/blueogre.png', height: 262, kind: 'ogre', glow: '#6fb0e0' },
    hornedfiend: { src: 'assets/bosses/hornedfiend.png', height: 250, kind: 'demon', glow: '#c07ae0' },
    snakeking: { src: 'assets/bosses/snakeking.png', height: 256, kind: 'snake', glow: '#5fc8d8' },
    mushroommaw: { src: 'assets/bosses/mushroommaw.png', height: 252, kind: 'ogre', glow: '#d05a5a' },
    shadowdemon: { src: 'assets/bosses/shadowdemon.png', height: 238, kind: 'demon', glow: '#e0556a' },
    hierophant: { src: 'assets/bosses/hierophant.png', height: 252, kind: 'hierophant', glow: '#b46be0' },
    abysseye: { src: 'assets/bosses/abysseye.png', height: 246, kind: 'eye', glow: '#e0556a' },
    wormking: { src: 'assets/bosses/wormking.png', height: 250, kind: 'snake', glow: '#9fe08a' },
    silverknight: { src: 'assets/bosses/silverknight.png', height: 244, kind: 'knight', glow: '#c0c8d8' },
    piratecrab: { src: 'assets/bosses/piratecrab.png', height: 232, kind: 'crab', glow: '#7fd0d8' }
  };

  // ---------- 分件首领：拆件原画 + 骨骼式待机 / 行走 / 攻击 ----------
  // 坐标全部使用 PSD 像素空间（宽×高分别为 230×188 / 224×174 / 191×143），
  // 绘制时统一缩放到首领显示高度并把脚底对齐地面，分件之间按枢轴做局部摆动。
  const PART_DIR = 'assets/bosses/_parts/';
  const BONES = {
    goatbrute: {
      w: 230, h: 188,
      srcs: ['boss_a.png'],
      parts: {
        // 双脚是连在一起的一整块（中间有布带），整体做重心左右压步，避免撕开
        feet: { src: 'boss_a.png', x: 56, y: 155, w: 46, h: 33, px: 79, py: 160 },
        body: { src: 'boss_a.png', sx: 46, x: 44, y: 97, w: 66, h: 67, px: 77, py: 160 },
        armR: { src: 'boss_a.png', sx: 112, x: 0, y: 102, w: 60, h: 84, px: 56, py: 110 },
        armL: { src: 'boss_a.png', sx: 172, x: 100, y: 132, w: 42, h: 48, px: 121, py: 157 },
        weapon: { src: 'boss_a.png', sx: 214, x: 106, y: 96, w: 124, h: 84, px: 126, py: 161 },
        head: { src: 'boss_a.png', sx: 338, x: 40, y: 0, w: 116, h: 119, px: 78, py: 115 }
      },
      draw: drawGoat
    },
    reaper: {
      w: 224, h: 174,
      srcs: ['boss_b.png'],
      parts: {
        footL: { src: 'boss_b.png', x: 31, y: 158, w: 33, h: 14, sw: 33, sh: 14, px: 47, py: 160 },
        footR: { src: 'boss_b.png', x: 64, y: 158, w: 34, h: 14, sx: 33, sw: 34, sh: 14, px: 81, py: 160 },
        hand: { src: 'boss_b.png', sx: 67, x: 94, y: 105, w: 32, h: 40, px: 118, py: 136 },
        body: { src: 'boss_b.png', sx: 99, x: 3, y: 79, w: 102, h: 84, px: 55, py: 159 },
        head: { src: 'boss_b.png', sx: 201, x: 2, y: 0, w: 127, h: 103, px: 63, py: 101 },
        weapon: { src: 'boss_b.png', sx: 328, x: 110, y: 12, w: 110, h: 160, px: 122, py: 137 }
      },
      draw: drawReaper
    },
    croc: {
      w: 191, h: 143,
      srcs: ['boss_c.png'],
      parts: {
        leg0: { src: 'boss_c.png', x: 119, y: 118, w: 24, h: 25, px: 131, py: 120 },
        leg1: { src: 'boss_c.png', sx: 24, x: 92, y: 115, w: 31, h: 28, px: 107, py: 117 },
        leg2: { src: 'boss_c.png', sx: 55, x: 65, y: 116, w: 31, h: 27, px: 80, py: 118 },
        leg3: { src: 'boss_c.png', sx: 86, x: 41, y: 114, w: 28, h: 29, px: 55, py: 116 },
        body: { src: 'boss_c.png', sx: 114, x: 18, y: 0, w: 164, h: 129, px: 46, py: 118 },
        tail: { src: 'boss_c.png', sx: 278, x: 0, y: 90, w: 30, h: 21, px: 29, py: 100 },
        toothA: { src: 'boss_c.png', sx: 308, x: 170, y: 62, w: 21, h: 33, px: 180, py: 65 },
        toothB: { src: 'boss_c.png', sx: 329, x: 123, y: 64, w: 28, h: 32, px: 137, py: 67 }
      },
      draw: drawCroc
    },
    // 仙人掌枪手（boss_d 215×163）：双脚 / 双手 / 左轮 / 花帽
    cactus: {
      w: 215, h: 163,
      srcs: ['boss_d.png'],
      parts: {
        footL: { src: 'boss_d.png', sx: 66, x: 57, y: 94, w: 69, h: 69, px: 112, py: 97 },
        footR: { src: 'boss_d.png', x: 60, y: 94, w: 66, h: 68, px: 68, py: 97 },
        armR: { src: 'boss_d.png', sx: 135, x: 113, y: 85, w: 74, h: 31, px: 118, py: 101 },
        gun: { src: 'boss_d.png', sx: 209, x: 150, y: 70, w: 65, h: 45, px: 171, py: 104 },
        body: { src: 'boss_d.png', sx: 274, x: 40, y: 61, w: 97, h: 91, px: 88, py: 150 },
        armL: { src: 'boss_d.png', sx: 371, x: 0, y: 89, w: 53, h: 42, px: 49, py: 110 },
        head: { src: 'boss_d.png', sx: 424, x: 7, y: 0, w: 159, h: 68, px: 86, py: 64 }
      },
      draw: drawCactus
    },
    // 冰晶巨像（boss_e 202×155）：双脚 / 双臂 / 岩体 / 金冠
    icegolem: {
      w: 202, h: 155,
      srcs: ['boss_e.png'],
      parts: {
        footL: { src: 'boss_e.png', sx: 50, x: 39, y: 100, w: 42, h: 56, px: 60, py: 104 },
        footR: { src: 'boss_e.png', x: 114, y: 96, w: 50, h: 59, px: 139, py: 100 },
        armR: { src: 'boss_e.png', sx: 92, x: 148, y: 78, w: 54, h: 54, px: 153, py: 83 },
        body: { src: 'boss_e.png', sx: 146, x: 40, y: 13, w: 133, h: 131, px: 106, py: 142 },
        armL: { src: 'boss_e.png', sx: 279, x: 2, y: 28, w: 68, h: 115, px: 64, py: 34 },
        head: { src: 'boss_e.png', sx: 347, x: 58, y: 2, w: 98, h: 68, px: 107, py: 66 }
      },
      draw: drawIceGolem
    },
    // 魔法书（boss_f 241×153）：双翼 / 书身 / 小帽脸 / 红长舌
    grimoire: {
      w: 241, h: 153,
      srcs: ['boss_f.png'],
      parts: {
        wingL: { src: 'boss_f.png', sx: 123, x: 4, y: 17, w: 84, h: 48, px: 84, py: 30 },
        wingR: { src: 'boss_f.png', sx: 207, x: 171, y: 8, w: 69, h: 44, px: 175, py: 20 },
        body: { src: 'boss_f.png', x: 58, y: 0, w: 123, h: 135, px: 120, py: 131 },
        head: { src: 'boss_f.png', sx: 276, x: 110, y: 42, w: 44, h: 45, px: 132, py: 84 },
        tongue: { src: 'boss_f.png', sx: 320, x: 110, y: 92, w: 46, h: 60, px: 133, py: 94 }
      },
      draw: drawGrimoire
    },
    // 噬人花王（boss_g 216×177）：茎身 / 底座 / 双叶 / 巨口花头
    flowerking: {
      w: 216, h: 177,
      srcs: ['boss_g.png'],
      parts: {
        leafR: { src: 'boss_g.png', x: 124, y: 120, w: 92, h: 56, px: 128, py: 150 },
        foot: { src: 'boss_g.png', sx: 92, x: 36, y: 143, w: 54, h: 32, px: 63, py: 174 },
        leafL: { src: 'boss_g.png', sx: 146, x: 0, y: 124, w: 104, h: 44, px: 100, py: 150 },
        stem: { src: 'boss_g.png', sx: 250, x: 43, y: 80, w: 96, h: 96, px: 91, py: 176 },
        head: { src: 'boss_g.png', sx: 346, x: 44, y: 1, w: 154, h: 134, px: 121, py: 132 }
      },
      draw: drawFlowerKing
    },
    // 魔锅骑士（boss_h 205×171）：双脚 / 锅身 / 盾手 / 锅盖头 / 长矛
    potknight: {
      w: 205, h: 171,
      srcs: ['boss_h.png'],
      parts: {
        footR: { src: 'boss_h.png', x: 101, y: 111, w: 31, h: 48, px: 116, py: 115 },
        footL: { src: 'boss_h.png', sx: 31, x: 46, y: 120, w: 33, h: 39, px: 62, py: 124 },
        body: { src: 'boss_h.png', sx: 64, x: 31, y: 48, w: 115, h: 88, px: 88, py: 134 },
        shield: { src: 'boss_h.png', sx: 179, x: 1, y: 66, w: 57, h: 80, px: 52, py: 72 },
        head: { src: 'boss_h.png', sx: 236, x: 40, y: 2, w: 94, h: 60, px: 87, py: 60 },
        spear: { src: 'boss_h.png', sx: 330, x: 146, y: 10, w: 58, h: 152, px: 172, py: 100 }
      },
      draw: drawPotKnight
    },
    // 紫晶蟹王（boss_i 208×157）：四足 / 晶簇主体 / 右晶钳
    crystalcrab: {
      w: 208, h: 157,
      srcs: ['boss_i.png'],
      parts: {
        legR2: { src: 'boss_i.png', sx: 0, x: 94, y: 116, w: 51, h: 37, px: 98, py: 120 },
        legL1: { src: 'boss_i.png', sx: 51, x: 16, y: 114, w: 39, h: 38, px: 50, py: 118 },
        legL2: { src: 'boss_i.png', sx: 90, x: 53, y: 98, w: 23, h: 59, px: 74, py: 102 },
        legR1: { src: 'boss_i.png', sx: 113, x: 98, y: 103, w: 20, h: 47, px: 100, py: 106 },
        claw: { src: 'boss_i.png', sx: 133, x: 135, y: 57, w: 71, h: 75, px: 141, py: 90 },
        body: { src: 'boss_i.png', sx: 204, x: 3, y: 1, w: 161, h: 143, px: 83, py: 145 }
      },
      draw: drawCrystalCrab
    },
    // 粉角屠夫（boss_j 205×166）：肩斧 / 双脚 / 躯干 / 双臂 / 头
    pinkdemon: {
      w: 205, h: 166,
      srcs: ['boss_j.png'],
      parts: {
        axe: { src: 'boss_j.png', sx: 334, x: 16, y: 10, w: 66, h: 62, px: 76, py: 68 },
        feet: { src: 'boss_j.png', sx: 0, x: 49, y: 136, w: 97, h: 28, px: 97, py: 140 },
        body: { src: 'boss_j.png', sx: 97, x: 46, y: 48, w: 107, h: 104, px: 100, py: 148 },
        armR: { src: 'boss_j.png', sx: 272, x: 2, y: 60, w: 62, h: 74, px: 61, py: 70 },
        armL: { src: 'boss_j.png', sx: 204, x: 136, y: 72, w: 68, h: 50, px: 141, py: 90 },
        head: { src: 'boss_j.png', sx: 400, x: 82, y: 0, w: 76, h: 102, px: 120, py: 100 }
      },
      draw: drawPinkDemon
    },
    // 南瓜领主（boss_k 171×180）：双脚 / 袍身 / 两侧触手 / 南瓜头 / 顶部小手
    pumpkinlord: {
      w: 171, h: 180,
      srcs: ['boss_k.png'],
      parts: {
        footR: { src: 'boss_k.png', sx: 0, x: 87, y: 147, w: 31, h: 25, px: 100, py: 150 },
        footL: { src: 'boss_k.png', sx: 31, x: 66, y: 147, w: 21, h: 25, px: 76, py: 150 },
        tenL: { src: 'boss_k.png', sx: 52, x: 5, y: 89, w: 56, h: 76, px: 58, py: 100 },
        tenR: { src: 'boss_k.png', sx: 108, x: 125, y: 92, w: 46, h: 73, px: 128, py: 104 },
        body: { src: 'boss_k.png', sx: 154, x: 54, y: 101, w: 74, h: 59, px: 91, py: 158 },
        top: { src: 'boss_k.png', sx: 228, x: 62, y: 2, w: 70, h: 39, px: 97, py: 40 },
        head: { src: 'boss_k.png', sx: 298, x: 28, y: 28, w: 126, h: 84, px: 91, py: 110 }
      },
      draw: drawPumpkinLord
    },
    // 触手蠕虫王（boss_l 173×171）：左尾端 / 右尾段 / 分节躯干 / 上段 / 羽状触手
    octowing: {
      w: 173, h: 171,
      srcs: ['boss_l.png'],
      parts: {
        tailA: { src: 'boss_l.png', sx: 0, x: 0, y: 129, w: 84, h: 42, px: 80, py: 133 },
        tailB: { src: 'boss_l.png', sx: 84, x: 63, y: 136, w: 65, h: 35, px: 68, py: 140 },
        body: { src: 'boss_l.png', sx: 149, x: 17, y: 70, w: 112, h: 92, px: 73, py: 160 },
        torso: { src: 'boss_l.png', sx: 261, x: 16, y: 8, w: 83, h: 101, px: 58, py: 107 },
        plume: { src: 'boss_l.png', sx: 344, x: 50, y: 0, w: 123, h: 100, px: 58, py: 96 }
      },
      draw: drawOctoWorm
    },
    // 灰发女妖（boss_m 171×169）：双脚 / 躯干 / 双臂 / 长发遮面的头
    banshee: {
      w: 171, h: 169,
      srcs: ['boss_m.png'],
      parts: {
        footL: { src: 'boss_m.png', sx: 0, x: 100, y: 137, w: 30, h: 31, px: 115, py: 139 },
        footR: { src: 'boss_m.png', sx: 30, x: 49, y: 136, w: 38, h: 32, px: 68, py: 138 },
        body: { src: 'boss_m.png', sx: 68, x: 51, y: 86, w: 85, h: 73, px: 94, py: 157 },
        armL: { src: 'boss_m.png', sx: 153, x: 126, y: 101, w: 44, h: 63, px: 130, py: 105 },
        armR: { src: 'boss_m.png', sx: 197, x: 3, y: 57, w: 63, h: 107, px: 62, py: 62 },
        head: { src: 'boss_m.png', sx: 260, x: 43, y: 0, w: 108, h: 118, px: 97, py: 115 }
      },
      draw: drawHairBanshee
    }
  };

  // 绘制单件：o = { rot, x, y, px, py }，枢轴默认取分件自带的 PSD 坐标
  function part(ctx, m, bone, key, o) {
    const p = bone.parts[key];
    const s = source(PART_DIR + p.src);
    if (!s.ready) return;
    const px = (o && o.px != null) ? o.px : p.px;
    const py = (o && o.py != null) ? o.py : p.py;
    ctx.save();
    if (o && (o.rot || o.x || o.y)) {
      ctx.translate(px, py);
      if (o.rot) ctx.rotate(o.rot);
      ctx.translate(-px, -py);
    }
    if (o && (o.x || o.y)) ctx.translate(o.x || 0, o.y || 0);
    const sx = p.sx || 0, sy = p.sy || 0, sw = p.sw || p.w, sh = p.sh || p.h;
    const img = m.tint ? tinted(s, m.tint, true) : (s.dark || s.canvas);
    ctx.drawImage(img, sx, sy, sw, sh, p.x, p.y, p.w, p.h);
    if (m.flash > 0 && s.flash) {
      ctx.globalAlpha *= Math.min(0.8, m.flash / 0.16);
      ctx.drawImage(s.flash, sx, sy, sw, sh, p.x, p.y, p.w, p.h);
    }
    ctx.restore();
  }

  // ---------- 动作工具：预备 / 爆发 / 过冲 / 回摆 / 次级跟随 ----------
  // 攻击曲线：快速冲出 → 惯性过冲 → 回摆收敛，首尾归零。
  // 相比单纯 sin，出手更利落，命中后有明显的“余势”，收招不僵硬。
  function atkEnv(k) {
    if (k <= 0 || k >= 1) return 0;
    const rise = Math.sin(Math.pow(k, 0.55) * Math.PI);
    return rise + Math.sin(k * Math.PI * 2.7) * 0.08 * Math.sin(k * Math.PI);
  }
  // 次级跟随：延迟起势，用于武器 / 头发 / 尾巴 / 触手等被动部件。
  function lagEnv(k, lag) {
    if (k <= lag) return 0;
    return atkEnv((k - lag) / (1 - lag));
  }
  // 走路四相（接触 / 下沉 / 经过 / 抬升）：
  // 重心每步两次起伏（接触最低、经过最高），摆动腿单侧抬起并前后换步。
  function gait(ph, amp) {
    const s = Math.sin(ph);
    return {
      s: s,
      bob: (-Math.cos(ph * 2) * 0.55 + 0.18) * amp,
      sway: s * amp * 0.5,
      liftL: Math.max(0, -s) * amp,
      liftR: Math.max(0, s) * amp,
      stepL: Math.cos(ph) * amp * 0.8,
      stepR: -Math.cos(ph) * amp * 0.8
    };
  }
  // 蓄力姿态释放：1 → 0，出手瞬间快速卸掉后仰/抬手的蓄力量，
  // 让 strike 的第一帧正好接住 windup 的最后一帧，不再出现姿态跳变。
  function holdEnv(k) {
    const x = k <= 0 ? 0 : (k >= 1 ? 1 : k);
    return Math.pow(1 - x, 2.4);
  }

  // 大剑恶魔：双层呼吸 / 走路四相压步 / 举剑过顶再下劈（惯性过冲 + 刀身延迟）
  function drawGoat(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const ph = t * 9.2 + seed;
    const br = Math.sin(t * 2.1 + seed);
    const drift = Math.sin(t * 0.83 + seed * 1.7);
    const g = gait(ph, 2.4);
    // 施法型招式只抬手不出刀，避免和吐息/弹幕特效打架
    const swing = (a.type === 'slash' || a.type === 'arc') ? 1 : 0.28;

    let bodyX = a.moving ? g.sway * 0.7 : drift * 0.9;
    let bodyY = br * 1.1 + drift * 0.55 + (a.moving ? g.bob : 0);
    let bodyRot = br * 0.012 + drift * 0.005 + (a.moving ? g.s * 0.026 : 0);
    let headRot = Math.sin(t * 1.55 + seed * 1.3) * 0.032 + drift * 0.008 - (a.moving ? g.s * 0.03 : 0);
    let headY = br * 0.5;
    let armR = Math.sin(t * 1.35 + seed) * 0.05 + (a.moving ? g.s * 0.14 : 0);
    let armL = Math.sin(t * 1.2 + seed * 2) * 0.03 - (a.moving ? g.s * 0.08 : 0);
    let sword = Math.sin(t * 1.8 + seed) * 0.02 + (a.moving ? g.s * 0.06 : 0);
    let lunge = 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.085;
      bodyY -= e * 3.2;
      headRot -= e * 0.12;
      headY -= e * 1.4;
      armR -= e * 0.28;
      armL -= e * 0.24;
      sword -= e * 0.82 * swing;              // 剑举过头
      lunge = -e * 4;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const ew = lagEnv(a.k, 0.09);           // 刀身延迟甩出
      const eh = lagEnv(a.k, 0.05);           // 头部跟随
      bodyRot += e * 0.1 - hd * 0.085;
      bodyY += e * 1.8 - hd * 3.2;
      headRot += eh * 0.14 - hd * 0.12;
      headY += eh * 1.2 - hd * 1.4;
      armR += e * 0.22 - hd * 0.28;
      armL += e * 0.5 * swing - hd * 0.24;
      sword += ew * 1.75 * swing - hd * 0.82 * swing;
      lunge = e * 6.5 * swing - hd * 4;
    }

    const feetY = a.moving ? -Math.abs(g.s) * 1.3 : 0;
    const feetRot = a.moving ? g.s * 0.05 : 0;
    part(ctx, m, bone, 'feet', { x: bodyX + lunge * 0.35, y: feetY, rot: feetRot });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'armR', { x: bodyX + lunge, y: bodyY * 0.7, rot: armR });
    part(ctx, m, bone, 'armL', { x: bodyX + lunge, y: bodyY * 0.7, rot: armL });
    part(ctx, m, bone, 'weapon', { x: bodyX + lunge, y: bodyY * 0.7, rot: sword });
    part(ctx, m, bone, 'head', { x: bodyX + lunge, y: bodyY + headY, rot: headRot });
  }

  // 镰刀巫师：袍身浮动 / 小碎步 / 镰刀高举横斩（长杆延迟摆动）
  function drawReaper(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.7 + seed);
    const drift = Math.sin(t * 0.7 + seed * 2.1);
    const ph = t * 8 + seed;
    const g = gait(ph, 2.2);
    const swing = (a.type === 'slash' || a.type === 'arc') ? 1 : 0.3;

    let bodyX = a.moving ? g.sway * 0.8 : drift * 1.2;
    let bodyY = br * 1.3 + drift * 0.7 - 1.4 + (a.moving ? g.bob : 0);
    let bodyRot = br * 0.012 + drift * 0.008 + (a.moving ? g.s * 0.022 : 0);
    let headRot = Math.sin(t * 1.3 + seed) * 0.025 - (a.moving ? g.s * 0.032 : 0);
    let armRot = Math.sin(t * 1.5 + seed) * 0.035;
    let scythe = Math.sin(t * 1.4 + seed) * 0.02 + (a.moving ? g.s * 0.05 : 0);
    let lunge = 0;
    const liftL = a.moving ? g.liftL : 0;
    const liftR = a.moving ? g.liftR : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.055;
      bodyY -= e * 2;
      headRot -= e * 0.09;
      armRot -= e * 0.4;
      scythe -= e * 0.72 * swing;
      lunge = -e * 4.5;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const ew = lagEnv(a.k, 0.1);            // 长杆更迟、甩得更远
      const eh = lagEnv(a.k, 0.06);
      bodyRot += e * 0.07 - hd * 0.055;
      bodyY += e * 0.8 - hd * 2;
      headRot += eh * 0.12 - hd * 0.09;
      armRot += e * 0.5 * swing - hd * 0.4;
      scythe += ew * 1.85 * swing - hd * 0.72 * swing;
      lunge = e * 7 * swing - hd * 4.5;
    }

    part(ctx, m, bone, 'footL', { x: bodyX * 0.3 + lunge * 0.4, y: -liftL });
    part(ctx, m, bone, 'footR', { x: bodyX * 0.3 + lunge * 0.4, y: -liftR });
    part(ctx, m, bone, 'hand', { x: bodyX + lunge, y: bodyY, rot: armRot * 0.4 + scythe * 0.45 });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'head', { x: bodyX + lunge, y: bodyY, rot: headRot });
    part(ctx, m, bone, 'weapon', { x: bodyX + lunge, y: bodyY, rot: scythe });
  }

  // 四足獠牙兽：对角步态 / 尾巴甩动跟随 / 后退蓄力再前冲顶撞
  function drawCroc(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const ph = t * 10 + seed;
    const br = Math.sin(t * 2.4 + seed);
    const drift = Math.sin(t * 0.75 + seed * 1.6);
    const g = gait(ph, 2.6);
    // 吐息/弹幕/召唤类不做过猛的顶撞，只有挥砍才全力前冲
    const melee = (a.type === 'slash' || a.type === 'arc');
    const hit = melee ? 1 : 0.5;

    let bodyX = a.moving ? g.sway * 0.5 : drift * 0.7;
    let bodyY = br * 0.9 + drift * 0.4 + (a.moving ? g.bob : 0);
    let bodyRot = br * 0.008 + (a.moving ? g.s * 0.014 : 0);
    let tail = Math.sin(t * 2.2 + seed) * 0.18 + (a.moving ? g.s * 0.18 : 0);
    let tooth = 0;
    let lunge = 0;
    // 对角步态：0/3 与 1/2 交替抬起
    const lift = [0, 0, 0, 0];
    if (a.moving) {
      lift[0] = g.liftL * 1.5;
      lift[3] = g.liftL * 1.5;
      lift[1] = g.liftR * 1.5;
      lift[2] = g.liftR * 1.5;
    }

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.12 * hit;             // 后腿蹬地、前身抬起
      bodyY += e * 1.4 * hit;
      tail -= e * 0.22;
      tooth -= e * 0.16;
      lunge = -e * 5.5 * hit;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const et = lagEnv(a.k, 0.12);          // 尾巴延迟甩动
      bodyRot += e * 0.18 * hit - hd * 0.12 * hit;
      bodyY += (hd - e) * 1.4 * hit;
      tail += et * 0.36 - hd * 0.22;
      tooth += lagEnv(a.k, 0.05) * 0.24 - hd * 0.16;
      lunge = e * 10 * hit - hd * 5.5 * hit;
    }

    for (let i = 0; i < 4; i++) part(ctx, m, bone, 'leg' + i, { x: bodyX * 0.25 + lunge * 0.6, y: -lift[i] });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'tail', { x: bodyX + lunge * 0.4, y: bodyY * 0.5, rot: tail });
    // 獠牙跟随身体整体旋转，再叠加咬合位移
    part(ctx, m, bone, 'toothA', { x: bodyX + lunge, y: bodyY - tooth * 2, rot: bodyRot, px: 46, py: 118 });
    part(ctx, m, bone, 'toothB', { x: bodyX + lunge, y: bodyY - tooth * 2, rot: bodyRot, px: 46, py: 118 });
  }

  // 仙人掌枪手：呼吸 / 交替迈步 / 举枪瞄准再开火后坐（枪身延迟反冲）
  function drawCactus(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 2.2 + seed);
    const drift = Math.sin(t * 0.78 + seed * 1.5);
    const ph = t * 8.6 + seed;
    const g = gait(ph, 2.3);
    const melee = (a.type === 'arc' || a.type === 'slash');

    let bodyX = a.moving ? g.sway * 0.6 : drift * 0.7;
    let bodyY = br * 1.0 + drift * 0.5 + (a.moving ? g.bob : 0);
    let bodyRot = br * 0.01 + (a.moving ? g.s * 0.02 : 0);
    let headRot = Math.sin(t * 1.6 + seed) * 0.03 - (a.moving ? g.s * 0.03 : 0);
    let headY = br * 0.45;
    let armR = Math.sin(t * 1.5 + seed) * 0.04 + (a.moving ? g.s * 0.1 : 0);
    let armL = Math.sin(t * 1.2 + seed) * 0.04 - (a.moving ? g.s * 0.1 : 0);
    let gunRot = Math.sin(t * 1.7 + seed) * 0.02 + (a.moving ? g.s * 0.04 : 0);
    let lunge = 0;
    const liftL = a.moving ? g.liftL : 0;
    const liftR = a.moving ? g.liftR : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.06;
      bodyY -= e * 1.8;
      headRot -= e * 0.07;
      armR -= e * 0.55;                       // 抬枪
      gunRot -= e * 0.4;
      armL -= e * 0.18;
      lunge = -e * 3;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const eg = lagEnv(a.k, 0.06);           // 枪口延迟上跳
      bodyRot += (melee ? e * 0.08 : e * 0.03) - hd * 0.06;
      bodyY += e * 0.9 - hd * 1.8;
      headRot += lagEnv(a.k, 0.08) * 0.06 - hd * 0.07;
      // 开火后坐：枪口上跳；近战枪托则是向前抡
      gunRot += eg * (melee ? 0.55 : -0.42) - hd * 0.4;
      armR += eg * (melee ? 0.45 : 0.2) - hd * 0.55;
      lunge = e * (melee ? 5.5 : 2) - hd * 3;
    }

    part(ctx, m, bone, 'footL', { x: bodyX * 0.3, y: -liftL });
    part(ctx, m, bone, 'footR', { x: bodyX * 0.3, y: -liftR });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'armL', { x: bodyX + lunge, y: bodyY, rot: armL });
    part(ctx, m, bone, 'head', { x: bodyX + lunge, y: bodyY + headY, rot: headRot });
    part(ctx, m, bone, 'armR', { x: bodyX + lunge, y: bodyY, rot: armR + gunRot * 0.25 });
    part(ctx, m, bone, 'gun', { x: bodyX + lunge, y: bodyY, rot: gunRot });
  }

  // 冰晶巨像：沉重呼吸 / 交替跺步 / 双臂高举后砸地（落地下沉 + 头部延迟）
  function drawIceGolem(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.8 + seed);
    const drift = Math.sin(t * 0.62 + seed * 1.9);
    const ph = t * 6.8 + seed;
    const g = gait(ph, 2.8);
    const big = (a.type === 'arc' || a.type === 'slash');

    let bodyX = a.moving ? g.sway * 0.8 : drift * 1.4;
    let bodyY = br * 1.4 + drift * 0.6 + (a.moving ? g.bob : 0);
    let bodyRot = br * 0.01 + drift * 0.006 + (a.moving ? g.s * 0.024 : 0);
    let headRot = Math.sin(t * 1.3 + seed) * 0.025;
    let armL = Math.sin(t * 1.4 + seed) * 0.05 - (a.moving ? g.s * 0.12 : 0);
    let armR = -Math.sin(t * 1.4 + seed) * 0.05 + (a.moving ? g.s * 0.12 : 0);
    let lunge = 0;
    const liftL = a.moving ? g.liftL : 0;
    const liftR = a.moving ? g.liftR : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.04;
      bodyY -= e * 2.4;
      headRot -= e * 0.05;
      armL += e * (big ? 0.85 : 0.34);
      armR -= e * (big ? 0.85 : 0.34);
      lunge = -e * 3;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const slam = lagEnv(a.k, 0.07);          // 双臂延迟砸下
      const eh = lagEnv(a.k, 0.1);             // 头部最后到位
      bodyRot += e * (big ? 0.09 : 0.03) - hd * 0.04;
      bodyY += e * (big ? 2.6 : 1.1) - hd * 2.4;
      headRot += eh * 0.06 - hd * 0.05;
      armL += -slam * (big ? 0.7 : 0.26) + hd * (big ? 0.85 : 0.34);
      armR += slam * (big ? 0.7 : 0.26) - hd * (big ? 0.85 : 0.34);
      lunge = e * (big ? 5.5 : 2) - hd * 3;
    }

    part(ctx, m, bone, 'footL', { x: bodyX * 0.3, y: -liftL });
    part(ctx, m, bone, 'footR', { x: bodyX * 0.3, y: -liftR });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'armL', { x: bodyX + lunge, y: bodyY, rot: armL });
    part(ctx, m, bone, 'armR', { x: bodyX + lunge, y: bodyY, rot: armR });
    part(ctx, m, bone, 'head', { x: bodyX + lunge, y: bodyY, rot: headRot });
  }

  // 魔法书：悬浮起伏 / 振翅 / 后仰蓄力再前倾甩舌（舌头延迟跟随）
  function drawGrimoire(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const hover = Math.sin(t * 2.0 + seed);
    const drift = Math.sin(t * 0.66 + seed * 1.4);
    const flapSpeed = a.moving ? 7.5 : 4.6;
    const flap = Math.sin(t * flapSpeed + seed);

    let bodyX = a.moving ? Math.cos(t * flapSpeed + seed) * 1.4 : drift * 1.6;
    let bodyY = hover * 2.2 + drift * 0.8 - (a.moving ? 1.5 : 0);
    let bodyRot = Math.sin(t * 0.9 + seed) * 0.02;
    let wingL = 0.1 + flap * 0.22;
    let wingR = -0.1 - flap * 0.22;
    let tongue = Math.sin(t * 2.6 + seed) * 0.12;
    let headRot = Math.sin(t * 1.4 + seed) * 0.03;
    let lunge = 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.12;
      bodyY -= e * 3.4;
      wingL += e * 0.5;
      wingR -= e * 0.5;
      tongue -= e * 0.35;
      lunge = -e * 4.5;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const et = lagEnv(a.k, 0.11);           // 长舌最后甩出
      const ew = lagEnv(a.k, 0.06);
      bodyRot += e * 0.14 - hd * 0.12;
      bodyY += e * 2.4 - hd * 3.4;
      wingL += ew * 0.9 - hd * 0.5;
      wingR -= ew * 0.9 - hd * 0.5;
      tongue += et * 1.05 - hd * 0.35;        // 长舌前甩
      headRot += lagEnv(a.k, 0.04) * 0.08;
      lunge = e * 7.5 - hd * 4.5;
    }

    part(ctx, m, bone, 'wingL', { x: bodyX + lunge, y: bodyY, rot: wingL });
    part(ctx, m, bone, 'wingR', { x: bodyX + lunge, y: bodyY, rot: wingR });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'head', { x: bodyX + lunge, y: bodyY, rot: headRot });
    part(ctx, m, bone, 'tongue', { x: bodyX + lunge, y: bodyY + tongue * 3, rot: bodyRot + tongue });
  }

  // 噬人花王：花头摇晃 / 底座蹦跳 / 后仰蓄力再前咬（花头与叶片延迟跟随）
  function drawFlowerKing(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.9 + seed);
    const drift = Math.sin(t * 0.72 + seed * 1.8);
    const ph = t * 7.5 + seed;
    const g = gait(ph, 2.2);
    const melee = (a.type === 'arc' || a.type === 'slash');

    let bodyX = a.moving ? g.sway * 0.6 : drift * 1.1;
    let bodyY = br * 0.9 + drift * 0.5 + (a.moving ? g.bob : 0);
    let bodyRot = br * 0.012 + (a.moving ? g.s * 0.03 : 0);
    let headRot = Math.sin(t * 1.5 + seed) * 0.04 - (a.moving ? g.s * 0.05 : 0);
    let headY = br * 0.6;
    let leafL = Math.sin(t * 1.7 + seed) * 0.1;
    let leafR = -Math.sin(t * 1.7 + seed) * 0.1;
    let lunge = 0;
    const hop = a.moving ? Math.abs(g.s) * 1.6 : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.06;
      bodyY -= e * 1.8;
      headRot -= e * (melee ? 0.3 : 0.13);   // 花头后仰蓄力
      headY -= e * 1.6;
      leafL -= e * 0.32;
      leafR += e * 0.32;
      lunge = -e * 3.5;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const eh = lagEnv(a.k, 0.07);           // 花头延迟前扑
      const el = lagEnv(a.k, 0.12);           // 叶片最后跟上
      bodyRot += e * 0.08 - hd * 0.06;
      bodyY += e * 1.4 - hd * 1.8;
      headRot += eh * (melee ? 0.5 : 0.2) - hd * (melee ? 0.3 : 0.13);
      headY += eh * 2.4 - hd * 1.6;
      leafL += el * 0.52 - hd * 0.32;
      leafR -= el * 0.52 - hd * 0.32;
      lunge = e * (melee ? 7.5 : 3) - hd * 3.5;
    }

    part(ctx, m, bone, 'stem', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'foot', { x: bodyX * 0.4 + lunge * 0.6, y: -hop });
    part(ctx, m, bone, 'leafL', { x: bodyX + lunge, y: bodyY, rot: leafL });
    part(ctx, m, bone, 'leafR', { x: bodyX + lunge, y: bodyY, rot: leafR });
    part(ctx, m, bone, 'head', { x: bodyX + lunge, y: bodyY + headY, rot: headRot });
  }

  // 魔锅骑士：锅身摇摆 / 交替迈步 / 举盾护身再长矛前刺（矛身延迟突进）
  function drawPotKnight(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 2.1 + seed);
    const drift = Math.sin(t * 0.8 + seed * 1.6);
    const ph = t * 8.2 + seed;
    const g = gait(ph, 2.4);
    const thrust = (a.type === 'arc' || a.type === 'slash');

    let bodyX = a.moving ? g.sway * 0.7 : drift * 0.9;
    let bodyY = br * 1.1 + drift * 0.5 + (a.moving ? g.bob : 0);
    let bodyRot = br * 0.012 + (a.moving ? g.s * 0.032 : 0);
    let headRot = Math.sin(t * 1.4 + seed) * 0.03 - (a.moving ? g.s * 0.04 : 0);
    let shield = Math.sin(t * 1.5 + seed) * 0.05;
    let spear = Math.sin(t * 1.3 + seed) * 0.03 + (a.moving ? g.s * 0.05 : 0);
    let lunge = 0;
    const liftL = a.moving ? g.liftL : 0;
    const liftR = a.moving ? g.liftR : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.07;
      bodyY -= e * 1.8;
      headRot -= e * 0.06;
      shield -= e * 0.3;                       // 举盾护身
      spear -= e * 0.62;                       // 长矛后引
      lunge = -e * 3.5;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const es = lagEnv(a.k, 0.1);             // 矛尖延迟刺出
      const eh = lagEnv(a.k, 0.07);
      bodyRot += e * 0.09 - hd * 0.07;
      bodyY += e * 1.3 - hd * 1.8;
      headRot += eh * 0.07 - hd * 0.06;
      shield += e * 0.2 - hd * 0.3;
      spear += es * (thrust ? 1.15 : 0.3) - hd * 0.62;   // 长矛前刺
      lunge = e * (thrust ? 8.5 : 3) - hd * 3.5;
    }

    part(ctx, m, bone, 'footL', { x: bodyX * 0.3 + lunge * 0.5, y: -liftL });
    part(ctx, m, bone, 'footR', { x: bodyX * 0.3 + lunge * 0.5, y: -liftR });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'shield', { x: bodyX + lunge, y: bodyY, rot: shield });
    part(ctx, m, bone, 'head', { x: bodyX + lunge, y: bodyY, rot: headRot });
    part(ctx, m, bone, 'spear', { x: bodyX + lunge, y: bodyY, rot: spear });
  }

  // 紫晶蟹王：晶簇呼吸 / 四足交替爬行 / 晶钳张开再夹击（钳口延迟闭合）
  function drawCrystalCrab(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.9 + seed);
    const drift = Math.sin(t * 0.85 + seed * 1.5);
    const ph = t * 10.5 + seed;
    const pinch = (a.type === 'arc' || a.type === 'slash');

    let bodyX = a.moving ? Math.sin(ph) * 1.2 : drift * 1.6;
    let bodyY = br * 1.2 + drift * 0.5 + (a.moving ? -Math.cos(ph * 2) * 1.1 + 0.2 : 0);
    let bodyRot = br * 0.012 + (a.moving ? Math.sin(ph) * 0.018 : 0);
    let claw = Math.sin(t * 1.6 + seed) * 0.05;
    let lunge = 0;
    // 四足交错：相邻腿反相，形成横向爬行的连续支撑
    const lift = [0, 0, 0, 0];
    if (a.moving) {
      for (let i = 0; i < 4; i++) lift[i] = Math.max(0, Math.sin(ph + i * Math.PI * 0.5)) * 2.2;
    }

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.06;
      bodyY -= e * 1.6;
      claw -= e * 0.62;                        // 晶钳张开
      lunge = -e * 3.5;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const ec = lagEnv(a.k, 0.1);             // 钳口延迟夹合
      bodyRot += e * 0.07 - hd * 0.06;
      bodyY += e * 1.0 - hd * 1.6;
      claw += ec * (pinch ? 0.92 : 0.35) - hd * 0.62;
      lunge = e * (pinch ? 8 : 3) - hd * 3.5;
    }

    part(ctx, m, bone, 'legL1', { x: bodyX * 0.5, y: -lift[0] });
    part(ctx, m, bone, 'legL2', { x: bodyX * 0.5, y: -lift[1] });
    part(ctx, m, bone, 'legR1', { x: bodyX * 0.5, y: -lift[2] });
    part(ctx, m, bone, 'legR2', { x: bodyX * 0.5, y: -lift[3] });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'claw', { x: bodyX + lunge, y: bodyY, rot: claw });
  }

  // 粉角屠夫：厚重呼吸 / 左右摇摆 / 肩斧高举抡劈（落斧过冲再回摆）
  function drawPinkDemon(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.8 + seed);
    const drift = Math.sin(t * 0.7 + seed * 1.7);
    const ph = t * 7.6 + seed;
    const g = gait(ph, 2.7);
    const heavy = (a.type === 'slash' || a.type === 'arc');

    let bodyX = a.moving ? g.sway * 0.8 : drift * 1.2;
    let bodyY = br * 1.3 + drift * 0.6 + (a.moving ? g.bob : 0);
    let bodyRot = br * 0.012 + (a.moving ? g.s * 0.032 : 0);
    let headRot = Math.sin(t * 1.35 + seed) * 0.03 - (a.moving ? g.s * 0.03 : 0);
    let armL = Math.sin(t * 1.4 + seed) * 0.05 - (a.moving ? g.s * 0.1 : 0);    // 画面右侧手臂
    let armR = -Math.sin(t * 1.4 + seed) * 0.05 + (a.moving ? g.s * 0.1 : 0);   // 画面左侧手臂
    let axe = Math.sin(t * 1.2 + seed) * 0.03;
    let lunge = 0;
    const feetRot = a.moving ? g.s * 0.035 : 0;
    const feetY = a.moving ? -Math.abs(g.s) * 1.2 : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.06;
      bodyY -= e * 2.2;
      headRot -= e * 0.07;
      axe -= e * 0.9;                          // 肩斧高举
      armL -= e * 0.28;
      armR += e * 0.22;
      lunge = -e * 4;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const ea = lagEnv(a.k, 0.1);             // 斧刃延迟抡下
      const eh = lagEnv(a.k, 0.06);
      bodyRot += e * 0.1 - hd * 0.06;
      bodyY += e * 2 - hd * 2.2;               // 落斧下压
      headRot += eh * 0.1 - hd * 0.07;
      axe += ea * (heavy ? 1.55 : 0.4) - hd * 0.9;   // 抡斧下劈
      armL += e * 0.38 - hd * 0.28;
      armR -= e * 0.28 - hd * 0.22;
      lunge = e * (heavy ? 6.5 : 2.5) - hd * 4;
    }

    part(ctx, m, bone, 'axe', { x: bodyX + lunge, y: bodyY, rot: axe });
    part(ctx, m, bone, 'feet', { x: bodyX * 0.4 + lunge * 0.5, y: feetY, rot: feetRot });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'armR', { x: bodyX + lunge, y: bodyY, rot: armR });
    part(ctx, m, bone, 'armL', { x: bodyX + lunge, y: bodyY, rot: armL });
    part(ctx, m, bone, 'head', { x: bodyX + lunge, y: bodyY, rot: headRot });
    // 出手时斧头会转到头部后方，补画一次，保证下劈的剪影始终可读
    if (a.strike) part(ctx, m, bone, 'axe', { x: bodyX + lunge, y: bodyY, rot: axe });
  }

  // 南瓜领主：鬼火浮动 / 小步挪动 / 触手后引再前扑缠绕（触手延迟甩出）
  function drawPumpkinLord(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const hover = Math.sin(t * 1.7 + seed);
    const drift = Math.sin(t * 0.76 + seed * 1.9);
    const ph = t * 7.2 + seed;
    const g = gait(ph, 2.2);
    const melee = (a.type === 'arc' || a.type === 'slash');

    let bodyX = a.moving ? g.sway * 0.7 : drift * 1.3;
    let bodyY = hover * 1.3 + drift * 0.6 + (a.moving ? g.bob : 0);
    let bodyRot = hover * 0.01 + (a.moving ? g.s * 0.026 : 0);
    let headRot = Math.sin(t * 1.4 + seed) * 0.035 - (a.moving ? g.s * 0.035 : 0);
    let headY = hover * 0.5;
    let tenL = Math.sin(t * 1.8 + seed) * 0.12;
    let tenR = -Math.sin(t * 1.8 + seed) * 0.12;
    let top = Math.sin(t * 2.2 + seed) * 0.08;
    let lunge = 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.06;
      bodyY -= e * 1.9;
      headRot -= e * (melee ? 0.24 : 0.11);
      tenL -= e * 0.5;
      tenR += e * 0.5;
      top -= e * 0.32;
      lunge = -e * 3.5;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const et = lagEnv(a.k, 0.1);             // 触手延迟前伸
      const eh = lagEnv(a.k, 0.06);
      bodyRot += e * 0.08 - hd * 0.06;
      bodyY += e * 1.3 - hd * 1.9;
      headRot += eh * (melee ? 0.34 : 0.14) - hd * (melee ? 0.24 : 0.11);
      tenL += et * 0.75 - hd * 0.5;            // 触手前缠
      tenR -= et * 0.75 - hd * 0.5;
      top += lagEnv(a.k, 0.13) * 0.5 - hd * 0.32;
      lunge = e * (melee ? 6.5 : 2.5) - hd * 3.5;
    }

    part(ctx, m, bone, 'footL', { x: bodyX * 0.4 + lunge * 0.5 });
    part(ctx, m, bone, 'footR', { x: bodyX * 0.4 + lunge * 0.5 });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'tenL', { x: bodyX + lunge, y: bodyY, rot: tenL });
    part(ctx, m, bone, 'tenR', { x: bodyX + lunge, y: bodyY, rot: tenR });
    part(ctx, m, bone, 'head', { x: bodyX + lunge, y: bodyY + headY, rot: headRot });
    part(ctx, m, bone, 'top', { x: bodyX + lunge, y: bodyY + headY, rot: bodyRot + top });
  }

  // 触手蠕虫王：身体波浪起伏 / 尾段摆动爬行 / 羽状触手后引再前抽（节段逐级延迟）
  function drawOctoWorm(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.8 + seed);
    const drift = Math.sin(t * 0.64 + seed * 1.7);
    const ph = t * 7.0 + seed;
    const wave = a.moving ? Math.sin(ph) : 0;
    const big = (a.type === 'arc' || a.type === 'slash');

    let bodyX = a.moving ? wave * 1.4 : drift * 1.5;
    let bodyY = br * 1.3 + drift * 0.6 + (a.moving ? (-Math.cos(ph * 2) * 1.4 + 0.3) : 0);
    let bodyRot = br * 0.015 + (a.moving ? wave * 0.03 : 0);
    let torsoRot = Math.sin(t * 1.5 + seed) * 0.03 - (a.moving ? wave * 0.04 : 0);
    let plumeRot = Math.sin(t * 1.6 + seed) * 0.06 + (a.moving ? wave * 0.08 : 0);
    let tailA = Math.sin(t * 1.9 + seed) * 0.12 + (a.moving ? wave * 0.14 : 0);
    let tailB = -Math.sin(t * 1.9 + seed) * 0.1 - (a.moving ? wave * 0.12 : 0);
    let lunge = 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.07;
      bodyY -= e * 2.2;
      torsoRot -= e * 0.14;
      plumeRot -= e * 0.62;                    // 羽状触手后引
      tailA += e * 0.22;
      tailB -= e * 0.22;
      lunge = -e * 4.5;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const ep = lagEnv(a.k, 0.12);            // 触手末端最迟
      const et = lagEnv(a.k, 0.07);
      bodyRot += e * 0.09 - hd * 0.07;
      bodyY += e * 1.7 - hd * 2.2;
      torsoRot += et * 0.22 - hd * 0.14;
      plumeRot += ep * (big ? 0.95 : 0.45) - hd * 0.62;   // 触手前抽
      tailA += et * 0.3 - hd * 0.22;
      tailB -= et * 0.3 - hd * 0.22;
      lunge = e * (big ? 8.5 : 4) - hd * 4.5;
    }

    part(ctx, m, bone, 'tailA', { x: bodyX * 0.3 + lunge * 0.3, rot: tailA });
    part(ctx, m, bone, 'tailB', { x: bodyX * 0.4 + lunge * 0.5, rot: tailB });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'torso', { x: bodyX + lunge, y: bodyY, rot: bodyRot + torsoRot });
    part(ctx, m, bone, 'plume', { x: bodyX + lunge, y: bodyY, rot: bodyRot + plumeRot });
  }

  // 灰发女妖：灰发飘动 / 小碎步挪动 / 双臂后引再前扑爪击（灰发延迟前甩）
  function drawHairBanshee(ctx, m, bone, t, a) {
    const seed = m.seed || 0;
    const br = Math.sin(t * 1.9 + seed);
    const drift = Math.sin(t * 0.74 + seed * 1.8);
    const ph = t * 8.4 + seed;
    const g = gait(ph, 2.1);
    const melee = (a.type === 'arc' || a.type === 'slash');

    let bodyX = a.moving ? g.sway * 0.6 : drift * 1.4;
    let bodyY = br * 1.1 + drift * 0.7 + (a.moving ? g.bob : 0);
    let bodyRot = br * 0.012 + (a.moving ? g.s * 0.022 : 0);
    let headRot = Math.sin(t * 1.5 + seed) * 0.045 - (a.moving ? g.s * 0.04 : 0);
    let headY = br * 0.5;
    let armL = Math.sin(t * 1.6 + seed) * 0.06 - (a.moving ? g.s * 0.12 : 0);   // 画面右侧手臂
    let armR = -Math.sin(t * 1.6 + seed) * 0.06 + (a.moving ? g.s * 0.12 : 0);  // 画面左侧手臂
    let lunge = 0;
    const liftL = a.moving ? g.liftL : 0;
    const liftR = a.moving ? g.liftR : 0;

    if (a.windup) {
      const e = Math.sin(a.k * Math.PI * 0.5);
      bodyRot -= e * 0.06;
      bodyY -= e * 1.9;
      headRot -= e * 0.14;
      headY -= e * 0.9;
      armL -= e * 0.5;
      armR += e * 0.5;
      lunge = -e * 3.5;
    } else if (a.strike) {
      const e = atkEnv(a.k);
      const hd = holdEnv(a.k);
      const eh = lagEnv(a.k, 0.1);             // 灰发延迟前甩
      const ea = lagEnv(a.k, 0.045);
      bodyRot += e * 0.09 - hd * 0.06;
      bodyY += e * 1.3 - hd * 1.9;
      headRot += eh * (melee ? 0.28 : 0.12) - hd * 0.14;
      headY += eh * 1.2 - hd * 0.9;
      armL += ea * (melee ? 0.8 : 0.3) - hd * 0.5;   // 双爪前扑
      armR -= ea * (melee ? 0.8 : 0.3) - hd * 0.5;
      lunge = e * (melee ? 7.5 : 3) - hd * 3.5;
    }

    part(ctx, m, bone, 'footL', { x: bodyX * 0.3 + lunge * 0.5, y: -liftL });
    part(ctx, m, bone, 'footR', { x: bodyX * 0.3 + lunge * 0.5, y: -liftR });
    part(ctx, m, bone, 'body', { x: bodyX + lunge, y: bodyY, rot: bodyRot });
    part(ctx, m, bone, 'armR', { x: bodyX + lunge, y: bodyY, rot: armR });
    part(ctx, m, bone, 'armL', { x: bodyX + lunge, y: bodyY, rot: armL });
    part(ctx, m, bone, 'head', { x: bodyX + lunge, y: bodyY + headY, rot: headRot });
  }

  const cache = {};
  const glows = {};

  // 近战型首领：挥击时身体压得更狠、前冲更远
  const MELEE_ACT = {
    reaper: 1, croc: 1, mummy: 1, crab: 1, maw: 1,
    goat: 1, knight: 1, snake: 1, demon: 1, ogre: 1, golem: 1
  };

  function rgba(hex, a) {
    if (hex.indexOf('rgb') === 0) {
      const p = hex.replace(/rgba?\(([^)]+)\)/, '$1').split(',');
      return `rgba(${p[0].trim()},${p[1].trim()},${p[2].trim()},${a})`;
    }
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function source(src) {
    let s = cache[src];
    if (s) return s;
    s = { src, img: new Image(), ready: false, failed: false, canvas: null, flash: null, tints: {} };
    s.img.onload = () => build(s);
    s.img.onerror = () => { s.failed = true; };
    DG.assets.assign(s.img, src);
    cache[src] = s;
    return s;
  }

  function build(s) {
    const w = s.img.naturalWidth;
    const h = s.img.naturalHeight;
    if (!w || !h) return;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(s.img, 0, 0);
    s.canvas = c;
    s.w = w;
    s.h = h;
    s.ready = true;

    // 暗色调一次性烘焙：运行时只 drawImage，避免逐帧走 ctx.filter 离屏滤镜
    const dc = document.createElement('canvas');
    dc.width = w;
    dc.height = h;
    const dg = dc.getContext('2d');
    dg.filter = DARK_FILTER_TEX;
    dg.drawImage(c, 0, 0);
    s.dark = dc;

    // 受击白闪：只保留贴图不透明区域
    const f = document.createElement('canvas');
    f.width = w;
    f.height = h;
    const fg = f.getContext('2d');
    fg.drawImage(c, 0, 0);
    fg.globalCompositeOperation = 'source-atop';
    fg.fillStyle = '#ffffff';
    fg.fillRect(0, 0, w, h);
    s.flash = f;
  }

  function tinted(s, color, dark) {
    const store = dark ? (s.darkTints || (s.darkTints = {})) : s.tints;
    let c = store[color];
    if (c) return c;
    const base = (dark && s.dark) || s.canvas;
    c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const g = c.getContext('2d');
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    store[color] = c;
    return c;
  }

  function glow(color) {
    let c = glows[color];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 4, 128, 128, 128);
    rg.addColorStop(0, rgba(color, 0.65));
    rg.addColorStop(0.4, rgba(color, 0.2));
    rg.addColorStop(1, rgba(color, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
    glows[color] = c;
    return c;
  }

  function defOf(m) {
    return DEFS[m.art] || DEFS.eyehorror;
  }

  function displayHeight(m) {
    return defOf(m).height * (m.artScale || 1);
  }

  function drawPlaceholder(ctx, m, def, h, t) {
    const base = def.kind === 'reaper' ? '#6b5a8e' : '#7a4f9e';
    ctx.fillStyle = rgba(base, 0.55);
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.34, h * 0.24, h * 0.32, 0, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.42)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ff5f5f';
    ctx.beginPath();
    ctx.arc(0, -h * 0.5, h * 0.085 + Math.sin(t * 4) * 1.5, 0, PI2);
    ctx.fill();
  }

  function draw(ctx, m, opts) {
    const def = defOf(m);
    const bone = def.parts ? BONES[def.parts] : null;
    const s = def.src ? source(def.src) : null;
    const t = (opts && opts.t) || 0;
    const cast = (opts && opts.cast) || m.cast;
    const seed = m.seed || 0;
    const h = displayHeight(m);
    const w = bone ? h * (bone.w / bone.h) : (s.ready ? h * (s.w / s.h) : h * 0.82);

    const k = cast
      ? (cast.phase === 'windup'
        ? Math.min(1, cast.t / Math.max(0.001, cast.atk.windup))
        : Math.min(1, cast.t / Math.max(0.001, cast.atk.recover || 0.45)))
      : 0;
    const windup = !!(cast && cast.phase === 'windup');
    const strike = !!(cast && cast.phase === 'recover');
    const moving = !!m.moving;
    const enraged = !!m.enraged;
    // 招式类型决定身体动作：近战挥砍扑得更狠，施法型蓄力更夸张
    const atkType = cast ? cast.atk.type : '';
    const meleeAct = !!(MELEE_ACT[def.kind] && (atkType === 'arc' || atkType === 'slash'));

    // ---- 待机呼吸 / 浮空 / 行走起伏 ----
    let bob = Math.sin(t * 2.0 + seed) * 2.4;
    let rot = Math.sin(t * 0.8 + seed) * 0.016;
    let sx = 1;
    let sy = 1;
    let dx = 0;
    if (def.kind === 'reaper') {
      bob = Math.sin(t * 1.7 + seed) * 4.2 - 2;
      rot += Math.sin(t * 1.1 + seed) * 0.012;
    }
    if (moving && !bone) {
      // 分件首领的走路起伏由各自的 gait 提供，这里只服务整图首领
      bob += Math.sin(t * 8.5) * 1.6;
      rot += Math.cos(m.facing || 0) * 0.018;
    }
    if (windup) {
      const e = Math.sin(k * Math.PI * 0.5);
      sy += e * (meleeAct ? 0.115 : 0.07);
      sx -= e * (meleeAct ? 0.075 : 0.045);
      rot -= Math.cos(m.facing || 0) * (meleeAct ? 0.07 : 0.032) * e;
      bob -= e * (meleeAct ? 6 : 3);
    } else if (strike) {
      const e = atkEnv(k);
      const hd = holdEnv(k);
      const mc = Math.cos(m.facing || 0);
      // 先接住蓄力姿态，再释放出手冲量；收招时全部归零，不会出现姿态跳变
      sy += (meleeAct ? 0.115 : 0.07) * hd - e * (meleeAct ? 0.055 : 0.03);
      sx -= (meleeAct ? 0.075 : 0.045) * hd - e * (meleeAct ? 0.11 : 0.07);
      rot -= mc * (meleeAct ? 0.07 : 0.032) * hd;
      rot += mc * (meleeAct ? 0.045 : 0.02) * e;
      bob += (meleeAct ? 6 : 3) * hd - e * (meleeAct ? 7.5 : 4.5);
      dx = mc * e * (meleeAct ? 40 : 22);
    }
    // ---- 受击回弹：沿来击方向后退、下压并轻微侧倾，平方衰减让冲击更干脆 ----
    const hr = m.hitReact || 0;
    if (hr > 0) {
      const r2 = hr * hr;
      const hd = Math.cos(m.hitDir || 0);
      dx += hd * r2 * 11;
      bob += r2 * 2;
      rot += hd * r2 * 0.05;
      sx += r2 * 0.04;
      sy -= r2 * 0.05;
    }
    // 瞬移类招式：读条时淡出，落点后再淡入
    let alpha = 1;
    if (atkType === 'blink') {
      alpha = windup ? 1 - k * 0.8 : 0.2 + k * 0.8;
    }

    // ---- 背光光晕（狂暴 / 蓄力时更亮） ----
    const glowColor = m.glow || def.glow;
    const glowA = (0.16 + (enraged ? 0.18 : 0) + (windup ? 0.3 * k : 0) + Math.sin(t * 3 + seed) * 0.04) * alpha;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.85, glowA);
    ctx.drawImage(glow(glowColor), -h * 0.78, -h * 0.92, h * 1.56, h * 1.56);
    if (def.kind === 'eye') {
      const gx = w * 0.12;
      const gy = -h * 0.6;
      const ga = (0.2 + (windup ? 0.5 * k : 0) + (strike ? 0.28 : 0)) * alpha;
      ctx.globalAlpha = Math.min(0.9, ga * (enraged ? 1.2 : 1));
      const gs = h * (0.32 + (windup ? 0.12 * k : 0));
      ctx.drawImage(glow(enraged ? '#ff5a4d' : '#ff5f5f'), gx - gs / 2, gy - gs / 2, gs, gs);
    }
    ctx.restore();

    // ---- 本体 ----
    const flip = Math.cos(m.facing || 0) < -0.05;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(dx, (m.r || 30) * 0.62 + bob);
    ctx.rotate(rot);
    ctx.scale(sx * (flip ? -1 : 1), sy);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (bone) {
      // 分件：换算到 PSD 像素空间，原点 = 脚底中心
      const sc = h / bone.h;
      ctx.scale(sc, sc);
      ctx.translate(-bone.w / 2, -bone.h);
      bone.draw(ctx, m, bone, t, { moving, windup, strike, k, type: atkType });
    } else if (s.ready) {
      const img = m.tint ? tinted(s, m.tint, true) : (s.dark || s.canvas);
      ctx.drawImage(img, -w / 2, -h, w, h);
      if (m.flash > 0 && s.flash) {
        ctx.globalAlpha = Math.min(0.8, m.flash / 0.16) * alpha;
        ctx.drawImage(s.flash, -w / 2, -h, w, h);
        ctx.globalAlpha = alpha;
      }
    } else {
      drawPlaceholder(ctx, m, def, h, t);
    }
    ctx.restore();

    // ---- 施法型蓄力：口部聚能光球 + 收束弧线 ----
    if (windup && (atkType === 'beam' || atkType === 'fan')) {
      const e = Math.sin(k * Math.PI * 0.5);
      const dir = Math.cos(m.facing || 0) < -0.05 ? -1 : 1;
      const mx = dir * w * 0.3;
      const my = -h * 0.6;
      const c = cast.atk.color || '#ffffff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const orb = 3 + e * 9;
      ctx.fillStyle = rgba(c, 0.32 * e);
      ctx.beginPath();
      ctx.arc(mx, my, orb * 1.7, 0, PI2);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.65 * e);
      ctx.beginPath();
      ctx.arc(mx, my, orb * 0.55, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba(c, 0.42 * e);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const rr = 10 + i * 8 + e * 10;
        ctx.beginPath();
        ctx.arc(mx - dir * (6 + i * 5), my, rr * 0.55, -0.85, 0.85);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- 出手速度线：从身体背后拉出，强化挥击/突进的重量感 ----
    if (strike && (atkType === 'arc' || atkType === 'slash' || atkType === 'blink' || atkType === 'beam')) {
      const e = Math.sin(k * Math.PI);
      const dir = Math.cos(m.facing || 0) < -0.05 ? -1 : 1;
      const c = cast.atk.color || '#ffffff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(c, 0.5 * e);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const l = (18 + i * 13) * e;
        const y0 = -h * (0.28 + i * 0.17);
        const x0 = -dir * w * (0.38 + i * 0.04);
        ctx.lineWidth = 3.6 - i * 0.7;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 - dir * l, y0);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- 蓄力读条：招式名 + 进度 ----
    if (windup) {
      const label = cast.atk.label || '蓄力';
      const y = -h - 14;
      ctx.save();
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.72)';
      ctx.strokeText(label, 0, y);
      ctx.fillStyle = cast.atk.color || '#f2b7aa';
      ctx.fillText(label, 0, y);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(-34, y + 3, 68, 4);
      ctx.fillStyle = cast.atk.color || '#f2b7aa';
      ctx.fillRect(-34, y + 3, 68 * k, 4);
      ctx.restore();
    }
  }

  // ---------- 攻击特效 ----------
  function drawEffect(ctx, e) {
    const p = 1 - e.life / e.max;
    const fade = Math.max(0, e.life / e.max);

    if (e.kind === 'teleArc') {
      const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 10);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, e.radius, -e.arc / 2, e.arc / 2);
      ctx.closePath();
      ctx.fillStyle = rgba(e.color, 0.07 + pulse * 0.06 + p * 0.08);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, -e.arc / 2, e.arc / 2);
      ctx.strokeStyle = rgba(e.color, 0.42 + pulse * 0.32);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = rgba(e.color, 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.62, -e.arc / 2, e.arc / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return true;
    }

    if (e.kind === 'teleBeam') {
      const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 12);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -p * 40;
      ctx.strokeStyle = rgba(e.color, 0.35 + pulse * 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(e.length, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(e.color, 0.18 + pulse * 0.12);
      ctx.lineWidth = e.width || 26;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(e.length, 0);
      ctx.stroke();
      ctx.fillStyle = rgba(e.color, 0.5 + pulse * 0.3);
      ctx.beginPath();
      ctx.arc(e.length, 0, 5 + pulse * 3, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    if (e.kind === 'teleCircle') {
      const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 10);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.strokeStyle = rgba(e.color, 0.45 + pulse * 0.35);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, PI2);
      ctx.stroke();
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = p * 30;
      ctx.strokeStyle = rgba(e.color, 0.3 + pulse * 0.25);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.62, 0, PI2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-e.radius * 0.32, 0);
      ctx.lineTo(e.radius * 0.32, 0);
      ctx.moveTo(0, -e.radius * 0.32);
      ctx.lineTo(0, e.radius * 0.32);
      ctx.strokeStyle = rgba(e.color, 0.55);
      ctx.stroke();
      ctx.restore();
      return true;
    }

    if (e.kind === 'arcSlash') {
      const sweep = Math.min(1, p * 1.5);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.2 * fade);
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.92, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(e.color, (0.7 - i * 0.18) * fade);
        ctx.lineWidth = 10 - i * 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 3, a0, a1);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba('#ffffff', 0.8 * fade);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius - 2, a0, a1);
      ctx.stroke();
      const hx = Math.cos(a1) * e.radius;
      const hy = Math.sin(a1) * e.radius;
      ctx.fillStyle = rgba(e.color, 0.85 * fade);
      ctx.beginPath();
      ctx.arc(hx, hy, 5 + 4 * fade, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    if (e.kind === 'beam') {
      const k = Math.max(0, e.life / e.max);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = rgba(e.color, 0.75 * k);
      ctx.lineWidth = (e.width || 30) * (0.35 + 0.65 * k);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(e.length, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = rgba('#ffffff', 0.85 * k);
      ctx.lineWidth = Math.max(2, (e.width || 30) * 0.3 * k);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(e.length, 0);
      ctx.stroke();
      ctx.fillStyle = rgba(e.color, 0.5 * k);
      ctx.beginPath();
      ctx.arc(e.length, 0, 14 * k, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    if (e.kind === 'crocWave') {
      const sweep = Math.min(1, p * 1.6);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(e.color, (0.55 - i * 0.15) * fade);
        ctx.lineWidth = 10 - i * 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * (0.72 + i * 0.11), -e.arc / 2, -e.arc / 2 + e.arc * sweep);
        ctx.stroke();
      }
      ctx.fillStyle = rgba('#e6d9a8', 0.3 * fade);
      for (let i = 0; i < 6; i++) {
        if (i / 5 > sweep) break;
        const aa = -e.arc / 2 + e.arc * (i / 5) * sweep;
        const rr = e.radius * (0.78 + (i % 2) * 0.12);
        ctx.beginPath();
        ctx.ellipse(Math.cos(aa) * rr, Math.sin(aa) * rr, 9, 5, aa, 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    if (e.kind === 'voidNova') {
      ctx.save();
      ctx.translate(e.x, e.y);
      const rr = e.radius * (0.2 + p * 0.95);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(e.color, 0.55 * fade);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, PI2);
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.5 * fade);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, rr * 0.92, 0, PI2);
      ctx.stroke();
      ctx.fillStyle = rgba(e.color, 0.7 * fade);
      for (let i = 0; i < 8; i++) {
        const aa = i / 8 * PI2 + p * 0.6;
        const x = Math.cos(aa) * rr * 0.8;
        const y = Math.sin(aa) * rr * 0.8;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(aa);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      }
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, rr * 0.9);
      g.addColorStop(0, rgba(e.color, 0.35 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rr * 0.9, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    // 读条聚能：地面双环法阵 + 上升能量柱 + 胸口聚能球与收束光带
    if (e.kind === 'bossCharge') {
      const kk = 1 - Math.max(0, e.life) / e.max;
      const ff = Math.max(0, Math.min(1, e.life / e.max));
      const h = e.h || 200;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.scale(1, 0.5);
      // 地面光池：让法阵从巨大身体下透出来
      ctx.globalAlpha = ff * 0.5;
      const pool = ctx.createRadialGradient(0, 0, 4, 0, 0, e.radius);
      pool.addColorStop(0, rgba(e.color, 0.35));
      pool.addColorStop(0.7, rgba(e.color, 0.12));
      pool.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, PI2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rgba(e.color, 0.34 + 0.34 * ff);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (1 - kk * 0.24), kk * 4.6, kk * 4.6 + 2.1);
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (0.7 - kk * 0.1), -kk * 4.2, -kk * 4.2 + 1.6);
      ctx.stroke();
      ctx.restore();
      const beamR = e.radius * 0.17 * (0.45 + kk);
      const grd = ctx.createLinearGradient(0, 0, 0, -h * 0.9);
      grd.addColorStop(0, rgba(e.color, 0.38 * ff));
      grd.addColorStop(0.6, rgba(e.color, 0.16 * ff));
      grd.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(-beamR, 0);
      ctx.lineTo(-beamR * 0.45, -h * 0.9);
      ctx.lineTo(beamR * 0.45, -h * 0.9);
      ctx.lineTo(beamR, 0);
      ctx.closePath();
      ctx.fill();
      // 柱心亮线
      ctx.strokeStyle = rgba('#ffffff', 0.22 * ff);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -h * 0.86);
      ctx.stroke();
      const cy = -h * 0.58;
      const orb = 5 + kk * 12;
      ctx.globalAlpha = ff;
      ctx.fillStyle = rgba(e.color, 0.38);
      ctx.beginPath();
      ctx.arc(0, cy, orb * 1.9, 0, PI2);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.7);
      ctx.beginPath();
      ctx.arc(0, cy, orb * 0.62, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba(e.color, 0.45);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + kk * 2.4;
        const rr = e.radius * (1.2 - kk * 0.8);
        const px = Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr * 0.6;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px * 0.3, cy + (py - cy) * 0.3);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 近战落地冲击：地面扩散环 + 放射裂纹
    if (e.kind === 'quakeRing') {
      const k2 = Math.min(1, p * 1.6);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.scale(1, 0.42);
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = rgba(e.color, (0.5 - i * 0.18) * fade);
        ctx.lineWidth = 7 - i * 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * (0.25 + k2 * (0.75 + i * 0.18)), 0, PI2);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(e.color, 0.45 * fade);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * PI2 + 0.3;
        const r0 = e.radius * 0.3 * (1 + k2);
        const r1 = e.radius * (0.5 + k2 * 0.6);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.42);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.42);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 影遁：收束环 + 竖向拖影
    if (e.kind === 'blinkWarp') {
      const k2 = Math.min(1, p * 1.4);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(e.color, 0.65 * fade);
      ctx.lineWidth = 5 * fade + 1;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (1 - k2 * 0.85), 0, PI2);
      ctx.stroke();
      ctx.fillStyle = rgba(e.color, 0.4 * fade);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * PI2 + k2 * 1.2;
        const rr2 = e.radius * (0.5 + (i % 3) * 0.18);
        const px = Math.cos(a) * rr2;
        const py = Math.sin(a) * rr2 * 0.5;
        ctx.fillRect(px - 1.5, py - 16 * fade, 3, 32 * fade);
      }
      ctx.restore();
      return true;
    }

    // 召唤法阵：旋转符环 + 六个节点
    if (e.kind === 'summonCircle') {
      const kk = 1 - Math.max(0, e.life) / e.max;
      const ff = Math.max(0, Math.min(1, e.life / e.max));
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(e.color, 0.55 * ff);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, PI2);
      ctx.stroke();
      ctx.setLineDash([10, 12]);
      ctx.lineDashOffset = -kk * 60;
      ctx.strokeStyle = rgba(e.color, 0.35 * ff);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.72, 0, PI2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(e.color, 0.7 * ff);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * PI2 + kk * 0.5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * e.radius * 0.86, Math.sin(a) * e.radius * 0.86, 3, 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    return false;
  }

  DG.art.bosses = {
    draw, drawEffect, displayHeight, defs: DEFS,
    // 只加载指定首领贴图并烘焙暗色调：进副本时按当前首领池预热，避免全量解码
    preload: (ids) => {
      (ids || []).forEach((id) => {
        const d = DEFS[id];
        if (!d) return;
        if (d.src) source(d.src);
        const bone = d.parts && BONES[d.parts];
        if (bone) bone.srcs.forEach((f) => source(PART_DIR + f));
      });
    },
    // 预载进度：已进入缓存的贴图里，完成加载（成功或失败）的数量
    stats: () => {
      let total = 0, done = 0;
      for (const k in cache) {
        total++;
        const s = cache[k];
        if (s.ready || s.failed) done++;
      }
      return { total, done };
    },
    isReady: (art) => {
      const d = DEFS[art];
      if (!d) return false;
      if (d.src) return source(d.src).ready;
      const bone = d.parts && BONES[d.parts];
      if (!bone) return false;
      return bone.srcs.every((f) => source(PART_DIR + f).ready);
    }
  };
})();


;
/* ==== js/art/monsters.js ==== */
/* 美术 · 小怪：矢量分件角色（固定规范见 docs/monster-pipeline.md）
 * 设计坐标系：脚底原点 (0,0)，向上为负 Y，总高 DESIGN_H。
 * 分件顺序：腿 → 长袍 → 胸饰 → 头（脸 → 头巾 → 角 → 耳 → 毛簇 → 眼 → 鼻嘴）
 * 动作由 m.moving / m.walkPhase / m.action 驱动：
 *   idle → walk → windup → strike → recover
 * 用法：DG.art.monsters.draw(ctx, m, { t })
 *   ctx 已平移到怪物中心（与首领一致），内部按脚底贴地锚定。
 */
(function () {
  const DG = window.DG;
  DG.art = DG.art || {};
  const PI2 = Math.PI * 2;

  const DESIGN_H = 104;   // 设计空间总高
  const ART_H = 82;       // 默认显示高度
  const NECK = -46;       // 颈部枢轴
  // 暗黑调色：矢量走调色板一次性压暗（见 dimPal），贴图在加载时烘焙暗色调
  const DARK_FILTER_TEX = 'saturate(0.66) brightness(0.84) contrast(1.26) hue-rotate(-6deg)';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);

  const PAL = {
    line: '#1b1a20',
    face: '#4f4d58', faceLo: '#403e49', faceHi: '#5d5b67',
    robe: '#d8cdb3', robeLo: '#bcb096', robeHi: '#e9e0cb',
    hood: '#ab9a7c', hoodLo: '#91816a', hoodHi: '#c1b294',
    bone: '#efe8d6', boneLo: '#cec5ae',
    earIn: '#c98f8c',
    nose: '#c07a76',
    eye: '#f5eedc',
    mouth: '#2a2830',
    strap: '#6a4a37', strapHi: '#8a6a4e'
  };

  // 受击剪影：所有槽位统一为白
  const FLASH_PAL = {};
  Object.keys(PAL).forEach((k) => { FLASH_PAL[k] = '#ffffff'; });

  // 性能：原来每帧给每只怪设置 ctx.filter 做整体调色，移动端会走离屏滤镜，
  // 怪物一多就明显掉帧。这里改成一次性把调色板压暗（效果与滤镜一致），运行期零开销。
  function dimHex(hex) {
    if (typeof hex !== 'string' || hex.charAt(0) !== '#') return hex;
    let s = hex.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (s.length !== 6) return hex;
    const n = parseInt(s, 16);
    let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const sat = 0.50, bri = 0.66, con = 1.18;
    r = (lum + (r - lum) * sat) * bri;
    g = (lum + (g - lum) * sat) * bri;
    b = (lum + (b - lum) * sat) * bri;
    r = (r - 0.5) * con + 0.5;
    g = (g - 0.5) * con + 0.5;
    b = (b - 0.5) * con + 0.5;
    const to = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    return '#' + ((1 << 24) | (to(r) << 16) | (to(g) << 8) | to(b)).toString(16).slice(1);
  }
  const dimPalCache = new WeakMap();
  function dimPal(pal) {
    if (!pal || typeof pal !== 'object') return pal;
    let d = dimPalCache.get(pal);
    if (d) return d;
    d = {};
    for (const k in pal) d[k] = dimHex(pal[k]);
    dimPalCache.set(pal, d);
    return d;
  }

  // ---------- 批次一：图鉴拆解出的三种怪 ----------
  const MUSH_PAL = {
    line: '#1b1a20',
    skin: '#7d9a5b', skinLo: '#61803f', skinHi: '#94b06f',
    coat: '#6c5a3f', coatLo: '#57482f', coatHi: '#877559',
    cap: '#cbb383', capLo: '#a99267', capHi: '#e0cc9f', spot: '#7b5f42',
    metal: '#4c4b55', metalHi: '#6b6a76', wood: '#5a3f2c',
    eye: '#f3d76a', mouth: '#241f1c', gold: '#d9b24a'
  };
  const PUMPKIN_PAL = {
    line: '#1b1a20',
    cloak: '#3f4436', cloakLo: '#2e3327', cloakHi: '#555b47',
    pumpkin: '#d2762f', pumpkinLo: '#a9571f', pumpkinHi: '#e89044',
    glow: '#ffd66a', stem: '#6b5a35',
    steel: '#c9c3ac', steelLo: '#8f8a76', wood: '#5a3f2c',
    eye: '#ffd66a', mouth: '#241f1c'
  };
  const SLIME_PAL = {
    line: '#1b1a20',
    body: '#58b3a6', bodyLo: '#3d8b80', bodyHi: '#7fd3c6',
    eye: '#f4f2e2', pupil: '#1f2a2a', mouth: '#233534',
    crown: '#d9b24a', crownLo: '#a9852e', gem: '#b65c5c'
  };
  function whitePal(p) {
    const o = {};
    Object.keys(p).forEach((k) => { o[k] = '#ffffff'; });
    return o;
  }
  const MUSH_FLASH = whitePal(MUSH_PAL);
  const PUMPKIN_FLASH = whitePal(PUMPKIN_PAL);
  const SLIME_FLASH = whitePal(SLIME_PAL);

  // ---------- 批次二：替换原有几何体小怪 ----------
  const WOLF_PAL = {
    line: '#1b1a20',
    fur: '#8a5a49', furLo: '#6b4335', furHi: '#a9745f', furBelly: '#c39a80',
    mane: '#5d3a2f', eye: '#ffd66a', pupil: '#26160f',
    claw: '#e8ddc4', nose: '#2a1a16', mouth: '#3a1f1a', tongue: '#b4706a'
  };
  const SKEL_PAL = {
    line: '#1b1a20',
    bone: '#b6ae94', boneLo: '#8f886f', boneHi: '#d8d1b8',
    cloth: '#4f4636', clothLo: '#393226', clothHi: '#6b5f49',
    steel: '#b9b3a2', steelLo: '#7d7666', wood: '#5a3f2c',
    eye: '#ffcf6a', socket: '#251f1a', rust: '#8a5a3a'
  };
  const MIST_PAL = {
    line: '#1b1a20',
    robe: '#6f8fae', robeLo: '#4c6885', robeHi: '#93b3cf',
    hood: '#54708d', hoodLo: '#3c546c', hoodHi: '#7b9ab8',
    wisp: '#b9d7e8', orb: '#a9e6ff', orbCore: '#e8fbff',
    eye: '#dff6ff', mouth: '#1d2a33', trim: '#c8d8e4'
  };
  const WOLF_FLASH = whitePal(WOLF_PAL);
  const SKEL_FLASH = whitePal(SKEL_PAL);
  const MIST_FLASH = whitePal(MIST_PAL);

  // ---------- 批次四：换色变体（复用同一组 pose/draw，只换调色板） ----------
  const FROSTWOLF_PAL = {
    line: '#1b1a20',
    fur: '#9fb6c9', furLo: '#7390a6', furHi: '#c4d8e6', furBelly: '#e2eef5',
    mane: '#4f6b80', eye: '#a9ecff', pupil: '#162530',
    claw: '#f2f9ff', nose: '#20303a', mouth: '#2b3c46', tongue: '#7f9fb2'
  };
  const BONEKNIGHT_PAL = {
    line: '#1b1a20',
    bone: '#cbb58e', boneLo: '#a08a62', boneHi: '#e8d7b0',
    cloth: '#3f4a36', clothLo: '#2b3327', clothHi: '#5d6b50',
    steel: '#c7a449', steelLo: '#8a6d2c', wood: '#4a3120',
    eye: '#a6ff8a', socket: '#1a2116', rust: '#7c5a38'
  };
  const FROSTSLIME_PAL = {
    line: '#1b1a20',
    body: '#7cc9e8', bodyLo: '#4f9fbf', bodyHi: '#b8e9f8',
    eye: '#f4feff', pupil: '#19303a', mouth: '#1f323b',
    crown: '#cfe8f2', crownLo: '#96b6c4', gem: '#7fe4ff'
  };
  const FROSTWOLF_FLASH = whitePal(FROSTWOLF_PAL);
  const BONEKNIGHT_FLASH = whitePal(BONEKNIGHT_PAL);
  const FROSTSLIME_FLASH = whitePal(FROSTSLIME_PAL);

  // ---------- 陷阱：宝箱怪（伪装成宝箱，开盖咬人） ----------
  const MIMIC_PAL = {
    line: '#1b1a20',
    wood: '#6b4a26', woodLo: '#4e3419', woodHi: '#7d572d',
    trim: '#8a6a3e', trimLo: '#5e4527', trimHi: '#b08a52',
    lock: '#2a1c10', maw: '#341418', gum: '#9c4b52',
    tongue: '#c4706a', tooth: '#f1e7cd',
    eye: '#ffd76a', pupil: '#241016', foot: '#4e3623'
  };
  const MIMIC_FLASH = whitePal(MIMIC_PAL);

  // ---------- 批次三：图鉴大造型（精英） ----------
  const MAW_PAL = {
    line: '#1b1a20',
    stem: '#5f7d43', stemLo: '#47612f', stemHi: '#7d9a58',
    leaf: '#6d8f4a', leafLo: '#4f6b34',
    petal: '#c0503f', petalLo: '#94382c', petalHi: '#dd6f57',
    maw: '#3a1d1e', tongue: '#c4706a', tooth: '#f1e7cd',
    eye: '#ffd66a', pupil: '#2a1410'
  };
  const DOC_PAL = {
    line: '#1b1a20',
    robe: '#4a4636', robeLo: '#343125', robeHi: '#635e49',
    cape: '#5d4a33', mask: '#e8e1cc', maskLo: '#c2bba4', beak: '#d8d0b6',
    goggle: '#2b2620', lens: '#ff9a5a', hat: '#39352a', hatHi: '#55503f',
    steel: '#c9c3ac', steelLo: '#8f8a76', wood: '#5a3f2c', belt: '#8a6a3e'
  };
  const WAR_PAL = {
    line: '#1b1a20',
    robe: '#5a3f78', robeLo: '#3f2c56', robeHi: '#7a5a9a',
    hood: '#4a3264', hoodLo: '#332246', hoodHi: '#6b4d8a',
    trim: '#d9b24a', orb: '#9ff08a', orbCore: '#eaffdf',
    eye: '#b9ff9a', bone: '#efe6cf', mouth: '#1c1424'
  };
  const MAW_FLASH = whitePal(MAW_PAL);
  const DOC_FLASH = whitePal(DOC_PAL);
  const WAR_FLASH = whitePal(WAR_PAL);


  function rgba(hex, a) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function fs(ctx, fill, pal, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = lw || 2.4;
    ctx.stroke();
  }

  // ---------- 部件 ----------
  function drawLeg(ctx, x, rot, lift, pal) {
    ctx.save();
    ctx.translate(x, -14 - lift);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.lineTo(-5.5, 8);
    ctx.quadraticCurveTo(-5.5, 13, -1.5, 14);
    ctx.lineTo(4, 14);
    ctx.quadraticCurveTo(6.5, 12, 5.5, 7);
    ctx.lineTo(4.5, 0);
    ctx.closePath();
    fs(ctx, pal.faceLo, pal, 2.2);
    // 脚趾分叉
    ctx.beginPath();
    ctx.moveTo(-1.5, 14);
    ctx.lineTo(-1.5, 16.4);
    ctx.moveTo(1.6, 14);
    ctx.lineTo(1.6, 16.4);
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  function drawRobe(ctx, pal) {
    ctx.beginPath();
    ctx.moveTo(-20, -13);
    ctx.bezierCurveTo(-23, -27, -19, -42, -12, -48);
    ctx.lineTo(12, -48);
    ctx.bezierCurveTo(19, -42, 23, -27, 20, -13);
    // 下摆：五段不规则弧
    ctx.quadraticCurveTo(16, -8, 12, -12.5);
    ctx.quadraticCurveTo(7, -7.5, 3, -12.5);
    ctx.quadraticCurveTo(-2, -7.5, -6, -12.5);
    ctx.quadraticCurveTo(-11, -7.5, -15, -12.5);
    ctx.quadraticCurveTo(-18, -8, -20, -13);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.6);

    // 右侧暗面
    ctx.beginPath();
    ctx.moveTo(10, -46);
    ctx.bezierCurveTo(16, -40, 20, -26, 18, -14);
    ctx.quadraticCurveTo(14, -8, 10, -12.5);
    ctx.quadraticCurveTo(14, -28, 10, -46);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.robeLo, 0.75);
    ctx.fill();

    // 布料褶皱
    ctx.strokeStyle = rgba(pal.robeLo, 0.7);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-6, -44);
    ctx.quadraticCurveTo(-8, -30, -6, -14);
    ctx.moveTo(2, -43);
    ctx.quadraticCurveTo(1, -30, 3, -15);
    ctx.stroke();

    // 领口
    ctx.beginPath();
    ctx.moveTo(-12, -45);
    ctx.quadraticCurveTo(0, -39.5, 12, -45);
    ctx.quadraticCurveTo(0, -35.5, -12, -45);
    ctx.closePath();
    fs(ctx, pal.robeHi, pal, 1.4);

    // 胸口 X 形束带
    ctx.save();
    ctx.translate(0, -32);
    ctx.rotate(0.62);
    roundBar(ctx, 3.2, 17, pal.strap, pal);
    ctx.rotate(-1.24);
    roundBar(ctx, 3.2, 17, pal.strap, pal);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, -32, 2.2, 0, PI2);
    ctx.fillStyle = pal.strapHi;
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function roundBar(ctx, w, h, fill, pal) {
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    ctx.lineTo(w / 2, h / 2 - r);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    ctx.lineTo(-w / 2 + r, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    ctx.lineTo(-w / 2, -h / 2 + r);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    ctx.closePath();
    fs(ctx, fill, pal, 1.5);
  }

  function facePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-24, -37);
    ctx.bezierCurveTo(-31, -28, -32, -13, -27, -5);
    ctx.bezierCurveTo(-22, 2, -13, 6, 0, 6);
    ctx.bezierCurveTo(12, 6, 22, 1, 27, -7);
    ctx.bezierCurveTo(31, -15, 29, -27, 23, -35);
    ctx.bezierCurveTo(16, -44, 4, -47, -6, -45);
    ctx.bezierCurveTo(-14, -44, -21, -41, -24, -37);
    ctx.closePath();
  }

  function drawEye(ctx, cx, cy, rx, ry, rot, open, pal) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(1, Math.max(0.06, open));
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, PI2);
    fs(ctx, pal.eye, pal, 1.8);
    if (open > 0.5) {
      ctx.beginPath();
      ctx.ellipse(0.4, ry * 0.12, 2.3, 2.7, 0, 0, PI2);
      ctx.fillStyle = pal.mouth;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-0.6, ry * 0.12 - 1, 0.8, 0, PI2);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fill();
    }
    // 上眼睑
    ctx.beginPath();
    ctx.moveTo(-rx * 0.92, 1);
    ctx.quadraticCurveTo(0, -ry * 1.75, rx * 0.92, 1);
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.restore();
  }

  function drawHead(ctx, pal, pose) {
    ctx.save();
    ctx.translate(pose.headDx, NECK + pose.headDy);
    ctx.rotate(pose.headRot);

    // 脸
    facePath(ctx);
    fs(ctx, pal.face, pal, 2.6);

    // 左上高光 / 右下暗面
    ctx.beginPath();
    ctx.ellipse(-14, -32, 10, 7, -0.5, 0, PI2);
    ctx.fillStyle = rgba(pal.faceHi, 0.22);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(17, -14, 9, 13, 0.25, 0, PI2);
    ctx.fillStyle = rgba(pal.faceLo, 0.35);
    ctx.fill();

    // 头巾（压住额头）
    ctx.save();
    ctx.translate(-4, -46);
    ctx.rotate(pose.hoodRot);
    ctx.translate(4, 46);
    ctx.beginPath();
    ctx.moveTo(-27, -27);
    ctx.bezierCurveTo(-33, -36, -31, -47, -21, -53);
    ctx.bezierCurveTo(-10, -60, 8, -59, 18, -52);
    ctx.bezierCurveTo(25, -47, 28, -40, 26, -33);
    ctx.lineTo(24, -35);
    ctx.bezierCurveTo(22, -39, 19, -41, 15, -41);
    ctx.bezierCurveTo(12, -37, 8, -41, 4, -39);
    ctx.bezierCurveTo(0, -42, -4, -37, -8, -40);
    ctx.bezierCurveTo(-12, -36, -16, -40, -20, -37);
    ctx.bezierCurveTo(-23, -34, -25, -31, -27, -27);
    ctx.closePath();
    fs(ctx, pal.hood, pal, 2.6);

    // 左垂布
    ctx.beginPath();
    ctx.moveTo(-26, -31);
    ctx.bezierCurveTo(-33, -24, -39, -16, -39, -12);
    ctx.bezierCurveTo(-38, -9, -34, -10, -32, -14);
    ctx.bezierCurveTo(-29, -19, -27, -25, -25, -29);
    ctx.closePath();
    fs(ctx, pal.hoodLo, pal, 2.2);

    // 头巾高光与接缝
    ctx.strokeStyle = rgba(pal.hoodHi, 0.85);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-22, -50);
    ctx.quadraticCurveTo(-8, -57, 8, -55);
    ctx.stroke();
    ctx.strokeStyle = rgba(pal.hoodLo, 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-24, -38);
    ctx.quadraticCurveTo(-2, -31, 22, -37);
    ctx.stroke();
    ctx.restore();

    // 白色弯角 + 小毛簇
    ctx.beginPath();
    ctx.moveTo(-12, -46);
    ctx.bezierCurveTo(-15, -52, -21, -57, -29, -60);
    ctx.bezierCurveTo(-25, -55, -22, -49, -20, -44);
    ctx.closePath();
    fs(ctx, pal.bone, pal, 2.1);
    ctx.beginPath();
    ctx.moveTo(-19, -44);
    ctx.bezierCurveTo(-21, -49, -24, -52, -28, -54);
    ctx.bezierCurveTo(-26, -50, -25, -46, -24, -43);
    ctx.closePath();
    fs(ctx, pal.boneLo, pal, 1.6);

    // 右耳（在头巾之上）
    ctx.save();
    ctx.translate(21, -15);
    ctx.rotate(pose.earRot);
    ctx.beginPath();
    ctx.moveTo(-2, -4);
    ctx.bezierCurveTo(4, -9, 12, -17, 20, -22);
    ctx.bezierCurveTo(24, -24, 25, -20, 22, -13);
    ctx.bezierCurveTo(18, -5, 10, 2, 3, 4);
    ctx.bezierCurveTo(0, 4, -2, 0, -2, -4);
    ctx.closePath();
    fs(ctx, pal.face, pal, 2.2);
    ctx.beginPath();
    ctx.moveTo(3, -4);
    ctx.bezierCurveTo(9, -9, 15, -15, 19, -18);
    ctx.bezierCurveTo(20, -14, 16, -7, 11, -2);
    ctx.bezierCurveTo(8, 0, 5, 0, 3, -4);
    ctx.closePath();
    ctx.fillStyle = pal.earIn;
    ctx.fill();
    ctx.restore();

    // 白色毛簇：右脸颊与左额
    ctx.beginPath();
    ctx.moveTo(21, -4);
    ctx.bezierCurveTo(27, -7, 32, -7, 35, -4);
    ctx.bezierCurveTo(31, -2, 29, 2, 27, 5);
    ctx.bezierCurveTo(25, 2, 23, 0, 21, -4);
    ctx.closePath();
    fs(ctx, pal.bone, pal, 1.7);
    ctx.beginPath();
    ctx.moveTo(-24, -34);
    ctx.bezierCurveTo(-28, -37, -32, -41, -36, -42);
    ctx.bezierCurveTo(-32, -37, -31, -33, -30, -29);
    ctx.bezierCurveTo(-28, -31, -26, -33, -24, -34);
    ctx.closePath();
    fs(ctx, pal.bone, pal, 1.7);

    // 眼睛（半睁、眨眼）
    drawEye(ctx, -14, -23, 8.6, 5.4, -0.12, pose.eyeOpen, pal);
    drawEye(ctx, 11, -25, 8.2, 5.1, 0.09, pose.eyeOpen, pal);

    // 鼻子
    ctx.beginPath();
    ctx.ellipse(-12, -10, 7, 5.4, -0.08, 0, PI2);
    fs(ctx, pal.nose, pal, 2.1);
    ctx.beginPath();
    ctx.ellipse(-14.2, -11.8, 2, 1.3, -0.4, 0, PI2);
    ctx.fillStyle = 'rgba(255,225,215,.55)';
    ctx.fill();

    // 嘴
    ctx.beginPath();
    ctx.moveTo(-11, -2.6);
    ctx.quadraticCurveTo(-7, 0.4, -3, -3.4);
    ctx.strokeStyle = pal.mouth;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  function drawPea(ctx, pal, pose) {
    drawLeg(ctx, -8.5, pose.legL, pose.liftL, pal);
    drawLeg(ctx, 7.5, pose.legR, pose.liftR, pal);
    drawRobe(ctx, pal);
    drawHead(ctx, pal, pose);
  }

  // ---------- 批次一：菌帽枪手 ----------
  function poseMusketeer(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 2.3 + seed) * 1.2, rot: Math.sin(t * 0.8 + seed) * 0.02,
      sx: 1, sy: 1, legL: 0, legR: 0, liftL: 0, liftR: 0,
      capRot: Math.sin(t * 1.5 + seed) * 0.035, gunKick: 0
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph)) * 1.7;
      p.rot = Math.sin(ph) * 0.04;
      p.legL = Math.sin(ph) * 0.5;
      p.legR = -Math.sin(ph) * 0.5;
      p.liftL = Math.max(0, Math.sin(ph)) * 2;
      p.liftR = Math.max(0, -Math.sin(ph)) * 2;
      p.capRot += Math.sin(ph * 2) * 0.04;
    }
    const s = m.shotAnim || 0;
    if (s > 0) {
      const e = s / 0.2;
      p.dx -= 4.5 * e;
      p.rot -= 0.07 * e;
      p.sy -= 0.04 * e;
      p.gunKick = e;
      p.capRot -= 0.1 * e;
    }
    return p;
  }

  function drawStubLeg(ctx, x, rot, lift, fill, shade, pal) {
    ctx.save();
    ctx.translate(x, -12 - lift);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-4.5, 7);
    ctx.quadraticCurveTo(-4.5, 12, -1, 12);
    ctx.lineTo(3.5, 12);
    ctx.quadraticCurveTo(5.5, 10, 4.5, 6);
    ctx.lineTo(3.5, 0);
    ctx.closePath();
    fs(ctx, fill, pal, 2.2);
    ctx.beginPath();
    ctx.ellipse(0, 8, 2.4, 2.8, 0, 0, PI2);
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.restore();
  }

  function drawMusketeer(ctx, pal, p) {
    drawStubLeg(ctx, -8, p.legL, p.liftL, pal.skin, pal.skinLo, pal);
    drawStubLeg(ctx, 7, p.legR, p.liftR, pal.skin, pal.skinLo, pal);

    // 矮胖外套
    ctx.beginPath();
    ctx.moveTo(-17, -10);
    ctx.bezierCurveTo(-20, -24, -18, -37, -12, -43);
    ctx.lineTo(12, -43);
    ctx.bezierCurveTo(18, -37, 20, -24, 17, -10);
    ctx.quadraticCurveTo(12, -6, 8, -10);
    ctx.quadraticCurveTo(2, -6, -3, -10);
    ctx.quadraticCurveTo(-9, -6, -13, -10);
    ctx.quadraticCurveTo(-16, -7, -17, -10);
    ctx.closePath();
    fs(ctx, pal.coat, pal, 2.6);
    // 腰带与扣
    ctx.fillStyle = pal.coatLo;
    ctx.fillRect(-15, -25, 30, 5);
    ctx.beginPath();
    ctx.arc(0, -22.5, 2.4, 0, PI2);
    ctx.fillStyle = pal.gold;
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 斜挎弹带
    ctx.save();
    ctx.translate(0, -31);
    ctx.rotate(-0.55);
    ctx.fillStyle = pal.coatLo;
    ctx.fillRect(-13, -2.2, 26, 4.4);
    ctx.fillStyle = pal.gold;
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * 5 - 1, -1.4, 2, 2.8);
    ctx.restore();

    // 火枪
    ctx.save();
    ctx.translate(2 - p.gunKick * 2.5, -33);
    ctx.rotate(-0.26 + p.gunKick * 0.05);
    ctx.beginPath();
    ctx.moveTo(-21, -2);
    ctx.lineTo(2, -5);
    ctx.lineTo(4, 5);
    ctx.lineTo(-17, 9);
    ctx.closePath();
    fs(ctx, pal.wood, pal, 2.2);
    ctx.beginPath();
    ctx.rect(3, -3.2, 40, 6.4);
    fs(ctx, pal.metal, pal, 2);
    ctx.beginPath();
    ctx.rect(40, -5, 6, 10);
    fs(ctx, pal.metalHi, pal, 1.8);
    ctx.beginPath();
    ctx.moveTo(10, 3);
    ctx.quadraticCurveTo(12, 9, 18, 8);
    ctx.strokeStyle = pal.metal;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 手臂（压住枪身）
    ctx.beginPath();
    ctx.ellipse(-14, -33, 4.6, 7.5, 0.25, 0, PI2);
    fs(ctx, pal.skin, pal, 2);
    ctx.beginPath();
    ctx.ellipse(19, -29, 4.4, 7, -0.5, 0, PI2);
    fs(ctx, pal.skin, pal, 2);

    // 绿脸
    ctx.beginPath();
    ctx.ellipse(1, -50, 15, 13.5, 0, 0, PI2);
    fs(ctx, pal.skin, pal, 2.4);
    drawEye(ctx, -5, -51, 4.4, 3.6, -0.1, 0.9, pal);
    drawEye(ctx, 8, -50, 3.8, 3.2, 0.12, 0.9, pal);
    ctx.beginPath();
    ctx.moveTo(-2, -43);
    ctx.quadraticCurveTo(3, -40, 8, -43);
    ctx.strokeStyle = pal.mouth;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // 獠牙
    ctx.beginPath();
    ctx.moveTo(1, -43);
    ctx.lineTo(2, -39.5);
    ctx.lineTo(3.2, -43);
    ctx.closePath();
    ctx.fillStyle = '#efe8d6';
    ctx.fill();

    // 蘑菇帽
    ctx.save();
    ctx.translate(1, -56);
    ctx.rotate(p.capRot);
    ctx.translate(-1, 56);
    ctx.beginPath();
    ctx.moveTo(-35, -56);
    ctx.bezierCurveTo(-38, -72, -24, -86, -2, -88);
    ctx.bezierCurveTo(20, -88, 36, -74, 37, -57);
    ctx.bezierCurveTo(30, -52, 22, -56, 14, -54);
    ctx.bezierCurveTo(6, -51, -2, -55, -10, -53);
    ctx.bezierCurveTo(-18, -50, -27, -54, -35, -56);
    ctx.closePath();
    fs(ctx, pal.cap, pal, 2.6);
    // 帽褶暗边
    ctx.beginPath();
    ctx.moveTo(-33, -57);
    ctx.bezierCurveTo(-20, -51, 20, -51, 35, -57);
    ctx.bezierCurveTo(22, -48, -20, -48, -33, -57);
    ctx.closePath();
    ctx.fillStyle = pal.capLo;
    ctx.fill();
    // 斑点
    const spots = [[-18, -73, 6, 4], [10, -78, 5, 3.4], [24, -67, 4.6, 3], [-28, -64, 3.6, 2.6]];
    spots.forEach(([x, y, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, -0.25, 0, PI2);
      ctx.fillStyle = pal.spot;
      ctx.fill();
    });
    ctx.strokeStyle = rgba(pal.capHi, 0.85);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-24, -78);
    ctx.quadraticCurveTo(-8, -86, 8, -85);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 批次一：南瓜刈手 ----------
  function posePumpkin(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 1.9 + seed) * 1.0, rot: Math.sin(t * 0.7 + seed) * 0.02,
      sx: 1, sy: 1, legL: 0, legR: 0, liftL: 0, liftR: 0,
      scythe: 0.22 + Math.sin(t * 1.1 + seed) * 0.035,
      headRot: Math.sin(t * 0.9 + seed) * 0.03, glow: 1
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph)) * 1.6;
      p.rot = Math.sin(ph) * 0.035;
      p.scythe += Math.sin(ph) * 0.05;
      p.headRot += Math.sin(ph - 0.5) * 0.03;
    }
    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.scythe -= 1.05 * e;
        p.rot -= 0.12 * e;
        p.dy += 1.5 * e;
        p.headRot -= 0.1 * e;
        p.glow = 1 + e * 0.6;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.scythe += 1.5 * e;
        p.dx += 7 * e;
        p.rot += 0.13 * e;
        p.headRot += 0.08 * e;
        p.glow = 1.6;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.scythe += 1.5 * r;
        p.dx += 7 * r;
        p.rot += 0.13 * r;
        p.headRot += 0.08 * r;
        p.glow = 1 + 0.6 * r;
      }
    }
    return p;
  }

  function drawPumpkin(ctx, pal, p) {
    // 细腿
    drawStubLeg(ctx, -7, p.legL, p.liftL, pal.cloakLo, pal.line, pal);
    drawStubLeg(ctx, 6, p.legR, p.liftR, pal.cloakLo, pal.line, pal);

    // 破边长袍
    ctx.beginPath();
    ctx.moveTo(-20, -8);
    ctx.bezierCurveTo(-24, -30, -20, -50, -12, -57);
    ctx.lineTo(12, -57);
    ctx.bezierCurveTo(20, -50, 24, -30, 20, -8);
    ctx.lineTo(16, -3);
    ctx.lineTo(12, -8);
    ctx.lineTo(7, -2);
    ctx.lineTo(2, -8);
    ctx.lineTo(-3, -2);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-13, -3);
    ctx.lineTo(-17, -8);
    ctx.closePath();
    fs(ctx, pal.cloak, pal, 2.6);
    // 褶皱
    ctx.strokeStyle = rgba(pal.cloakHi, 0.55);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, -54);
    ctx.quadraticCurveTo(-10, -30, -7, -9);
    ctx.moveTo(4, -54);
    ctx.quadraticCurveTo(3, -30, 5, -9);
    ctx.stroke();

    // 肩披
    ctx.beginPath();
    ctx.moveTo(-18, -54);
    ctx.quadraticCurveTo(0, -64, 18, -54);
    ctx.quadraticCurveTo(12, -47, 6, -51);
    ctx.quadraticCurveTo(0, -46, -6, -51);
    ctx.quadraticCurveTo(-12, -47, -18, -54);
    ctx.closePath();
    fs(ctx, pal.cloakHi, pal, 2.2);

    // 左臂
    ctx.beginPath();
    ctx.moveTo(-13, -51);
    ctx.quadraticCurveTo(-22, -39, -17, -28);
    ctx.strokeStyle = pal.cloakLo;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-16, -26, 3.2, 0, PI2);
    ctx.fillStyle = pal.cloakLo;
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 镰刀
    ctx.save();
    ctx.translate(14, -45);
    ctx.rotate(p.scythe);
    ctx.beginPath();
    ctx.moveTo(-2.6, 12);
    ctx.quadraticCurveTo(-1, -20, 2.4, -56);
    ctx.lineTo(7.4, -55);
    ctx.quadraticCurveTo(4, -20, 2.6, 12);
    ctx.closePath();
    fs(ctx, pal.wood, pal, 2);
    // 刀刃
    ctx.beginPath();
    ctx.moveTo(4, -52);
    ctx.bezierCurveTo(18, -70, 38, -68, 47, -53);
    ctx.bezierCurveTo(36, -62, 20, -61, 7, -47);
    ctx.closePath();
    fs(ctx, pal.steel, pal, 2.2);
    ctx.beginPath();
    ctx.moveTo(9, -51);
    ctx.bezierCurveTo(22, -62, 34, -62, 43, -56);
    ctx.strokeStyle = rgba(pal.steelLo, 0.85);
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();

    // 南瓜头
    ctx.save();
    ctx.translate(0, -74);
    ctx.rotate(p.headRot);
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 22, 0, 0, PI2);
    fs(ctx, pal.pumpkin, pal, 2.6);
    // 瓜棱
    ctx.strokeStyle = rgba(pal.pumpkinLo, 0.8);
    ctx.lineWidth = 2;
    [-13, 0, 13].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, -20);
      ctx.quadraticCurveTo(x * 1.25, 0, x, 20);
      ctx.stroke();
    });
    // 梗
    ctx.beginPath();
    ctx.moveTo(-3, -21);
    ctx.quadraticCurveTo(-8, -28, -3, -31);
    ctx.lineTo(2, -29);
    ctx.quadraticCurveTo(-1, -25, 2, -21);
    ctx.closePath();
    fs(ctx, pal.stem, pal, 1.8);
    // 鬼火眼
    ctx.save();
    ctx.globalAlpha = 0.28 * p.glow;
    ctx.fillStyle = pal.glow;
    ctx.beginPath();
    ctx.arc(-10, -3, 11, 0, PI2);
    ctx.arc(9, -3, 11, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = pal.glow;
    [-10, 9].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x - 6, -8);
      ctx.lineTo(x + 6, -8);
      ctx.lineTo(x, 1);
      ctx.closePath();
      ctx.fill();
    });
    // 锯齿嘴
    ctx.beginPath();
    ctx.moveTo(-12, 9);
    ctx.lineTo(-7, 5);
    ctx.lineTo(-2, 9);
    ctx.lineTo(3, 5);
    ctx.lineTo(8, 9);
    ctx.lineTo(12, 6);
    ctx.quadraticCurveTo(0, 16, -12, 9);
    ctx.closePath();
    ctx.fillStyle = pal.glow;
    ctx.fill();
    ctx.restore();
  }

  // ---------- 批次一：王冠史莱姆 ----------
  function poseSlime(m, t, seed) {
    const p = { dx: 0, dy: Math.sin(t * 2.5 + seed) * 0.8, rot: 0, sx: 1, sy: 1, look: 0 };
    p.sy = 1 + Math.sin(t * 2.5 + seed) * 0.035;
    p.sx = 1 - Math.sin(t * 2.5 + seed) * 0.02;
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.sy = 1 + Math.sin(ph * 2) * 0.07;
      p.sx = 1 - Math.sin(ph * 2) * 0.05;
      p.dy = -Math.abs(Math.sin(ph * 2)) * 1.4;
      p.rot = Math.sin(ph) * 0.04;
    }
    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.sy -= 0.16 * e;
        p.sx += 0.13 * e;
        p.dy += 1.6 * e;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.dx += 8 * e;
        p.sx = 0.93;
        p.sy = 1.1;
        p.look = e;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.dx += 8 * r;
        p.sx = 0.93 + 0.07 * (1 - r);
        p.sy = 1.1 - 0.1 * (1 - r);
        p.look = r;
      }
    }
    return p;
  }

  function drawSlime(ctx, pal, p) {
    // 主体
    ctx.beginPath();
    ctx.moveTo(-36, 0);
    ctx.bezierCurveTo(-41, -12, -40, -36, -27, -54);
    ctx.bezierCurveTo(-16, -68, 16, -68, 27, -54);
    ctx.bezierCurveTo(40, -36, 41, -12, 36, 0);
    ctx.quadraticCurveTo(18, 7, 0, 7);
    ctx.quadraticCurveTo(-18, 7, -36, 0);
    ctx.closePath();
    fs(ctx, pal.body, pal, 2.8);
    // 底部暗面
    ctx.beginPath();
    ctx.moveTo(-36, 0);
    ctx.quadraticCurveTo(-18, 7, 0, 7);
    ctx.quadraticCurveTo(18, 7, 36, 0);
    ctx.quadraticCurveTo(20, -8, 0, -8);
    ctx.quadraticCurveTo(-20, -8, -36, 0);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.bodyLo, 0.65);
    ctx.fill();
    // 高光与气泡
    ctx.beginPath();
    ctx.ellipse(-16, -44, 9, 6, -0.5, 0, PI2);
    ctx.fillStyle = rgba('#e6fff8', 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(17, -30, 3.2, 0, PI2);
    ctx.strokeStyle = rgba(pal.bodyHi, 0.9);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(23, -22, 2, 0, PI2);
    ctx.stroke();

    // 王冠
    ctx.save();
    ctx.translate(0, -62);
    ctx.rotate(-0.06);
    ctx.beginPath();
    ctx.moveTo(-17, 4);
    ctx.lineTo(-20, -12);
    ctx.lineTo(-8, -4);
    ctx.lineTo(0, -18);
    ctx.lineTo(8, -4);
    ctx.lineTo(20, -12);
    ctx.lineTo(17, 4);
    ctx.closePath();
    fs(ctx, pal.crown, pal, 2.2);
    ctx.fillStyle = pal.crownLo;
    ctx.fillRect(-16, 1, 32, 3.4);
    ctx.beginPath();
    ctx.arc(0, -8, 2.1, 0, PI2);
    ctx.fillStyle = pal.gem;
    ctx.fill();
    ctx.restore();

    // 独眼
    ctx.beginPath();
    ctx.ellipse(0, -34, 11.5, 12.5, 0, 0, PI2);
    fs(ctx, pal.eye, pal, 2.2);
    ctx.beginPath();
    ctx.ellipse(p.look * 3.5, -32, 4.8, 5.6, 0, 0, PI2);
    ctx.fillStyle = pal.pupil;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.look * 3.5 - 1.6, -34.5, 1.4, 0, PI2);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fill();
    // 眼睑
    ctx.beginPath();
    ctx.moveTo(-11, -39);
    ctx.quadraticCurveTo(0, -49, 11, -39);
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 嘴
    ctx.beginPath();
    ctx.moveTo(-13, -15);
    ctx.quadraticCurveTo(0, -8, 13, -15);
    ctx.strokeStyle = pal.mouth;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, -13);
    ctx.lineTo(-3, -9);
    ctx.lineTo(-1, -13);
    ctx.closePath();
    ctx.fillStyle = pal.mouth;
    ctx.fill();
  }

  // ---------- 批次二：腐化野狼 ----------
  function poseWolf(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 2.4 + seed) * 0.7, rot: 0, sx: 1, sy: 1,
      legL: 0, legR: 0, liftL: 0, liftR: 0,
      legL2: 0, legR2: 0, liftL2: 0, liftR2: 0,
      tail: Math.sin(t * 2.2 + seed) * 0.16,
      headRot: Math.sin(t * 1.4 + seed) * 0.04,
      ear: Math.sin(t * 3.1 + seed) * 0.05,
      jaw: 0
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph * 2)) * 1.4;
      p.rot = Math.sin(ph) * 0.02;
      p.legL = Math.sin(ph) * 0.55;
      p.legR = -Math.sin(ph) * 0.55;
      p.liftL = Math.max(0, Math.sin(ph)) * 2;
      p.liftR = Math.max(0, -Math.sin(ph)) * 2;
      p.legL2 = -Math.sin(ph) * 0.5;
      p.legR2 = Math.sin(ph) * 0.5;
      p.liftL2 = Math.max(0, -Math.sin(ph)) * 2;
      p.liftR2 = Math.max(0, Math.sin(ph)) * 2;
      p.tail = Math.sin(ph) * 0.2;
    }
    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.dy += 3 * e;
        p.rot -= 0.05 * e;
        p.sy -= 0.05 * e;
        p.headRot -= 0.2 * e;
        p.jaw = 0.1 + 0.28 * e;
        p.ear -= 0.15 * e;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.dx += 12 * e;
        p.dy -= 3 * e;
        p.rot += 0.06 * e;
        p.headRot += 0.1 * e;
        p.jaw = 0.62;
        p.sx += 0.06 * e;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.dx += 12 * r;
        p.dy -= 3 * r;
        p.rot += 0.06 * r;
        p.headRot += 0.1 * r;
        p.jaw = 0.62 * r;
        p.sx += 0.06 * r;
      }
    }
    return p;
  }

  function drawWolfLeg(ctx, x, swing, lift, fill, pal) {
    ctx.save();
    ctx.translate(x, -24 - lift);
    ctx.rotate(swing);
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.quadraticCurveTo(-6.5, 12, -4, 20);
    ctx.lineTo(2, 22);
    ctx.quadraticCurveTo(6, 14, 4.5, 0);
    ctx.closePath();
    fs(ctx, fill, pal, 2.2);
    ctx.strokeStyle = pal.claw;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-3.4, 21); ctx.lineTo(-3.4, 25);
    ctx.moveTo(0.4, 22); ctx.lineTo(0.4, 26);
    ctx.moveTo(3.2, 21); ctx.lineTo(3.2, 25);
    ctx.stroke();
    ctx.restore();
  }

  function drawWolf(ctx, pal, p) {
    // 远侧腿（压暗）
    drawWolfLeg(ctx, -17, p.legL2, p.liftL2, pal.furLo, pal);
    drawWolfLeg(ctx, 19, p.legR2, p.liftR2, pal.furLo, pal);

    // 尾巴
    ctx.save();
    ctx.translate(-28, -40);
    ctx.rotate(p.tail);
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.bezierCurveTo(-10, -2, -20, -14, -27, -27);
    ctx.bezierCurveTo(-16, -18, -6, -8, 4, -4);
    ctx.closePath();
    fs(ctx, pal.mane, pal, 2.2);
    ctx.restore();

    // 躯干
    ctx.beginPath();
    ctx.moveTo(-30, -30);
    ctx.bezierCurveTo(-34, -44, -22, -52, -6, -52);
    ctx.bezierCurveTo(8, -52, 22, -50, 28, -42);
    ctx.bezierCurveTo(34, -36, 32, -28, 26, -24);
    ctx.bezierCurveTo(16, -20, 4, -22, -6, -21);
    ctx.bezierCurveTo(-16, -20, -26, -22, -30, -30);
    ctx.closePath();
    fs(ctx, pal.fur, pal, 2.6);
    // 腹部浅色
    ctx.beginPath();
    ctx.ellipse(-2, -26, 22, 5.5, 0.03, 0, PI2);
    ctx.fillStyle = rgba(pal.furBelly, 0.5);
    ctx.fill();
    // 背脊鬃毛
    ctx.beginPath();
    ctx.moveTo(-28, -42);
    const spikes = [[-20, -50], [-12, -46], [-4, -54], [4, -49], [12, -55], [20, -50], [26, -44]];
    for (const [sx, sy] of spikes) ctx.lineTo(sx, sy);
    ctx.quadraticCurveTo(-6, -44, -28, -42);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.mane, 0.9);
    ctx.fill();
    // 体侧高光
    ctx.strokeStyle = rgba(pal.furHi, 0.55);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-16, -40);
    ctx.quadraticCurveTo(0, -44, 14, -41);
    ctx.stroke();

    // 近侧腿
    drawWolfLeg(ctx, -23, p.legL, p.liftL, pal.fur, pal);
    drawWolfLeg(ctx, 22, p.legR, p.liftR, pal.fur, pal);

    // 颈部鬃毛
    ctx.beginPath();
    ctx.moveTo(16, -50);
    ctx.lineTo(26, -56);
    ctx.lineTo(24, -46);
    ctx.lineTo(32, -48);
    ctx.lineTo(26, -38);
    ctx.quadraticCurveTo(20, -42, 16, -50);
    ctx.closePath();
    fs(ctx, pal.mane, pal, 2);

    // 头
    ctx.save();
    ctx.translate(27, -47);
    ctx.scale(1.12, 1.12);
    ctx.rotate(p.headRot);
    // 下颌（绕咬合点张开）
    ctx.save();
    ctx.translate(4, 4);
    ctx.rotate(p.jaw);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(20, 3);
    ctx.lineTo(18, 9);
    ctx.lineTo(-2, 7);
    ctx.closePath();
    fs(ctx, pal.furLo, pal, 2);
    ctx.fillStyle = pal.claw;
    ctx.beginPath();
    ctx.moveTo(10, 3); ctx.lineTo(12, 7); ctx.lineTo(14.5, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 头骨与上颚
    ctx.beginPath();
    ctx.moveTo(-13, -6);
    ctx.bezierCurveTo(-15, -16, -4, -21, 7, -18);
    ctx.bezierCurveTo(17, -16, 22, -10, 27, -5);
    ctx.quadraticCurveTo(30, 0, 26, 3);
    ctx.lineTo(8, 4);
    ctx.bezierCurveTo(-2, 5, -10, 3, -13, -6);
    ctx.closePath();
    fs(ctx, pal.fur, pal, 2.4);
    // 上排牙
    ctx.fillStyle = pal.claw;
    ctx.beginPath();
    ctx.moveTo(12, 3); ctx.lineTo(13.5, 7); ctx.lineTo(15.5, 3);
    ctx.moveTo(18, 2.6); ctx.lineTo(19.2, 6.4); ctx.lineTo(21.4, 2.8);
    ctx.fill();
    // 口鼻暗面
    ctx.beginPath();
    ctx.moveTo(14, -2); ctx.lineTo(27, -4); ctx.lineTo(26, 3); ctx.lineTo(10, 4);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.furLo, 0.55);
    ctx.fill();
    // 鼻头
    ctx.beginPath();
    ctx.ellipse(26, -3, 3.4, 2.6, -0.2, 0, PI2);
    ctx.fillStyle = pal.nose;
    ctx.fill();
    // 发光眼
    ctx.beginPath();
    ctx.ellipse(10, -9, 3.8, 2.8, -0.15, 0, PI2);
    ctx.fillStyle = pal.eye;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10.8, -9, 1.2, 2.2, 0, 0, PI2);
    ctx.fillStyle = pal.pupil;
    ctx.fill();
    // 耳
    ctx.save();
    ctx.translate(-6, -16);
    ctx.rotate(p.ear);
    ctx.beginPath();
    ctx.moveTo(-4.5, 3); ctx.lineTo(0, -18); ctx.lineTo(6.5, 1);
    ctx.closePath();
    fs(ctx, pal.mane, pal, 2);
    ctx.beginPath();
    ctx.moveTo(-1, 0); ctx.lineTo(0.6, -12); ctx.lineTo(3.6, 1);
    ctx.closePath();
    ctx.fillStyle = pal.furLo;
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---------- 批次二：骷髅战士 ----------
  function poseSkel(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 2.1 + seed) * 1.1, rot: Math.sin(t * 0.9 + seed) * 0.02,
      sx: 1, sy: 1, legL: 0, legR: 0, liftL: 0, liftR: 0,
      armRot: -0.35, headRot: Math.sin(t * 1.2 + seed) * 0.04,
      jaw: 0, glow: 0.85 + Math.sin(t * 2.6 + seed) * 0.15
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph)) * 1.8;
      p.rot = Math.sin(ph) * 0.04;
      p.legL = Math.sin(ph) * 0.5;
      p.legR = -Math.sin(ph) * 0.5;
      p.liftL = Math.max(0, Math.sin(ph)) * 2;
      p.liftR = Math.max(0, -Math.sin(ph)) * 2;
      p.armRot = -0.35 + Math.sin(ph) * 0.22;
    }
    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.armRot -= 1.25 * e;
        p.rot -= 0.1 * e;
        p.dy += 1.4 * e;
        p.headRot -= 0.1 * e;
        p.jaw = 0.12 * e;
        p.glow = 1.4;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.armRot += 1.55 * e;
        p.dx += 7 * e;
        p.rot += 0.13 * e;
        p.headRot += 0.1 * e;
        p.jaw = 0.3;
        p.glow = 1.5;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.armRot += 1.55 * r;
        p.dx += 7 * r;
        p.rot += 0.13 * r;
        p.headRot += 0.1 * r;
        p.jaw = 0.3 * r;
        p.glow = 1 + 0.4 * r;
      }
    }
    return p;
  }

  function drawSkeleton(ctx, pal, p) {
    drawStubLeg(ctx, -7, p.legL, p.liftL, pal.bone, pal.boneLo, pal);
    drawStubLeg(ctx, 7, p.legR, p.liftR, pal.bone, pal.boneLo, pal);

    // 骨盆
    ctx.save();
    ctx.translate(0, -20);
    roundBar(ctx, 16, 7, pal.bone, pal);
    ctx.restore();

    // 破布战裙
    ctx.beginPath();
    ctx.moveTo(-11, -18);
    ctx.lineTo(11, -18);
    ctx.lineTo(9, -34);
    ctx.lineTo(6, -27);
    ctx.lineTo(3, -36);
    ctx.lineTo(0, -29);
    ctx.lineTo(-3, -36);
    ctx.lineTo(-6, -27);
    ctx.lineTo(-9, -34);
    ctx.closePath();
    fs(ctx, pal.cloth, pal, 2.2);
    ctx.strokeStyle = rgba(pal.clothLo, 0.8);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-4, -30); ctx.lineTo(-3, -20);
    ctx.moveTo(4, -32); ctx.lineTo(3, -20);
    ctx.stroke();

    // 脊椎
    ctx.fillStyle = pal.bone;
    ctx.beginPath();
    ctx.rect(-2.6, -50, 5.2, 30);
    fs(ctx, pal.bone, pal, 1.8);

    // 肋骨
    ctx.strokeStyle = pal.bone;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const y = -46 + i * 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(11, y + 1, 9, y + 6);
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(-11, y + 1, -9, y + 6);
      ctx.stroke();
    }
    // 胸骨暗面
    ctx.strokeStyle = rgba(pal.boneLo, 0.75);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-9, -44); ctx.quadraticCurveTo(0, -41, 9, -44);
    ctx.stroke();

    // 肩甲骨
    ctx.beginPath();
    ctx.ellipse(0, -50, 14, 5, 0, 0, PI2);
    fs(ctx, pal.boneLo, pal, 1.8);

    // 左臂 + 圆盾
    ctx.strokeStyle = pal.bone;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-11, -49);
    ctx.quadraticCurveTo(-17, -42, -15, -36);
    ctx.stroke();
    ctx.save();
    ctx.translate(-16, -40);
    ctx.beginPath();
    ctx.arc(0, 0, 9.5, 0, PI2);
    fs(ctx, pal.steel, pal, 2.2);
    ctx.beginPath();
    ctx.arc(0, 0, 5.4, 0, PI2);
    ctx.strokeStyle = pal.steelLo;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, PI2);
    ctx.fillStyle = pal.rust;
    ctx.fill();
    ctx.restore();

    // 头骨
    ctx.save();
    ctx.translate(0, -60);
    ctx.rotate(p.headRot);
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 11.5, 0, 0, PI2);
    fs(ctx, pal.bone, pal, 2.4);
    // 上颌
    ctx.beginPath();
    ctx.moveTo(-7, 7);
    ctx.lineTo(7, 7);
    ctx.lineTo(5.6, 13);
    ctx.lineTo(-5.6, 13);
    ctx.closePath();
    fs(ctx, pal.boneLo, pal, 1.8);
    // 下颌（张合）
    ctx.save();
    ctx.translate(0, 12);
    ctx.rotate(p.jaw);
    ctx.beginPath();
    ctx.moveTo(-5.4, 0);
    ctx.lineTo(5.4, 0);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    fs(ctx, pal.boneLo, pal, 1.6);
    // 牙缝
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 2.2, 1);
      ctx.lineTo(i * 2.2, 4);
      ctx.stroke();
    }
    ctx.restore();
    // 眼窝
    ctx.fillStyle = pal.socket;
    ctx.beginPath();
    ctx.ellipse(-4.6, -2, 3.4, 3.8, 0, 0, PI2);
    ctx.ellipse(4.6, -2, 3.4, 3.8, 0, 0, PI2);
    ctx.fill();
    ctx.fillStyle = rgba(pal.eye, 0.9 * p.glow);
    ctx.beginPath();
    ctx.arc(-4.6, -2, 1.5, 0, PI2);
    ctx.arc(4.6, -2, 1.5, 0, PI2);
    ctx.fill();
    // 头顶裂缝
    ctx.strokeStyle = rgba(pal.boneLo, 0.9);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-1, -10);
    ctx.lineTo(2, -6);
    ctx.lineTo(-1, -3);
    ctx.stroke();
    ctx.restore();

    // 右臂 + 弯刀（出手时挥砍）
    ctx.save();
    ctx.translate(11, -49);
    ctx.strokeStyle = pal.bone;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(7, -6, 8, -13);
    ctx.stroke();
    ctx.translate(8, -13);
    ctx.rotate(p.armRot);
    // 护手
    ctx.fillStyle = pal.steelLo;
    ctx.fillRect(-6, -2, 12, 3.4);
    // 剑柄
    ctx.fillStyle = pal.wood;
    ctx.fillRect(-1.6, 0, 3.2, 7);
    // 剑身
    ctx.beginPath();
    ctx.moveTo(-2.2, -2);
    ctx.lineTo(-1.8, -30);
    ctx.lineTo(0, -35);
    ctx.lineTo(1.8, -30);
    ctx.lineTo(2.2, -2);
    ctx.closePath();
    fs(ctx, pal.steel, pal, 1.8);
    ctx.strokeStyle = rgba(pal.steelLo, 0.9);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -4); ctx.lineTo(0, -30);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 批次二：迷雾行者 ----------
  function poseMist(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 1.8 + seed) * 2.2, rot: Math.sin(t * 0.8 + seed) * 0.03,
      sx: 1, sy: 1, cloak: Math.sin(t * 2.0 + seed) * 0.08,
      headRot: Math.sin(t * 1.1 + seed) * 0.03,
      arm: 0, glow: 0.85 + Math.sin(t * 3 + seed) * 0.15
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy -= 2;
      p.cloak += Math.sin(ph) * 0.12;
      p.rot += Math.sin(ph) * 0.05;
    }
    const s = m.shotAnim || 0;
    if (s > 0) {
      const e = s / 0.2;
      p.arm -= 0.5 * e;
      p.rot -= 0.04 * e;
      p.glow = 1.7;
    }
    return p;
  }

  function drawMistwalker(ctx, pal, p) {
    // 下方雾尾：几缕飘散的气流
    ctx.save();
    ctx.translate(0, -8);
    ctx.rotate(p.cloak);
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.bezierCurveTo(-30, 6, -18, 10, -10, 6);
    ctx.bezierCurveTo(-4, 12, 6, 10, 8, 5);
    ctx.bezierCurveTo(16, 11, 28, 7, 24, 1);
    ctx.lineTo(18, -6);
    ctx.lineTo(-18, -6);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.robeHi, 0.5);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.robeLo, 0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // 长袍
    ctx.beginPath();
    ctx.moveTo(-22, -10);
    ctx.bezierCurveTo(-26, -30, -20, -50, -12, -60);
    ctx.lineTo(12, -60);
    ctx.bezierCurveTo(20, -50, 26, -30, 22, -10);
    ctx.quadraticCurveTo(14, -5, 8, -9);
    ctx.quadraticCurveTo(0, -4, -8, -9);
    ctx.quadraticCurveTo(-15, -5, -22, -10);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.6);
    // 暗面
    ctx.beginPath();
    ctx.moveTo(10, -58);
    ctx.bezierCurveTo(16, -46, 20, -28, 18, -12);
    ctx.quadraticCurveTo(14, -6, 10, -10);
    ctx.quadraticCurveTo(14, -32, 10, -58);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.robeLo, 0.55);
    ctx.fill();
    // 下摆雾气高光
    ctx.strokeStyle = rgba(pal.wisp, 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-12, -14);
    ctx.quadraticCurveTo(-4, -8, 4, -13);
    ctx.quadraticCurveTo(10, -9, 16, -14);
    ctx.stroke();
    // 胸襟
    ctx.beginPath();
    ctx.moveTo(-10, -58);
    ctx.quadraticCurveTo(0, -50, 10, -58);
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 左袖
    ctx.beginPath();
    ctx.moveTo(-16, -54);
    ctx.quadraticCurveTo(-24, -44, -19, -34);
    ctx.quadraticCurveTo(-15, -28, -12, -36);
    ctx.quadraticCurveTo(-14, -44, -12, -52);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.2);

    // 右袖 + 法球
    ctx.save();
    ctx.translate(16, -50);
    ctx.rotate(p.arm);
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(10, -2, 12, -10);
    ctx.quadraticCurveTo(10, -16, 5, -14);
    ctx.quadraticCurveTo(6, -8, -1, -8);
    ctx.closePath();
    fs(ctx, pal.robeHi, pal, 2.2);
    // 掌中法球
    ctx.save();
    ctx.translate(11, -10);
    ctx.globalCompositeOperation = 'lighter';
    const og = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    og.addColorStop(0, rgba(pal.orbCore, 0.85 * p.glow));
    og.addColorStop(0.35, rgba(pal.orb, 0.5 * p.glow));
    og.addColorStop(1, rgba(pal.orb, 0));
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(11, -10, 5.2, 0, PI2);
    fs(ctx, pal.orb, pal, 1.6);
    ctx.beginPath();
    ctx.arc(9.6, -11.4, 1.8, 0, PI2);
    ctx.fillStyle = pal.orbCore;
    ctx.fill();
    ctx.restore();

    // 兜帽
    ctx.save();
    ctx.translate(0, -62);
    ctx.rotate(p.headRot);
    ctx.beginPath();
    ctx.moveTo(-20, 2);
    ctx.bezierCurveTo(-24, -12, -16, -28, 0, -30);
    ctx.bezierCurveTo(16, -28, 24, -12, 20, 2);
    ctx.quadraticCurveTo(12, -4, 6, 0);
    ctx.quadraticCurveTo(0, -5, -6, 0);
    ctx.quadraticCurveTo(-13, -4, -20, 2);
    ctx.closePath();
    fs(ctx, pal.hood, pal, 2.6);
    // 兜帽内阴影
    ctx.beginPath();
    ctx.ellipse(0, -10, 13, 14, 0, 0, PI2);
    ctx.fillStyle = pal.hoodLo;
    ctx.fill();
    // 发光双眼
    ctx.fillStyle = pal.eye;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * p.glow;
    ctx.beginPath();
    ctx.arc(-5, -11, 8, 0, PI2);
    ctx.arc(5.5, -11, 8, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(-5, -11, 3.2, 2.4, 0.1, 0, PI2);
    ctx.ellipse(5.5, -11, 3.2, 2.4, -0.1, 0, PI2);
    ctx.fill();
    // 兜帽高光
    ctx.strokeStyle = rgba(pal.hoodHi, 0.8);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-14, -22);
    ctx.quadraticCurveTo(0, -28, 14, -22);
    ctx.stroke();
    ctx.restore();

    // 下摆内衬的雾气
    ctx.fillStyle = rgba(pal.wisp, 0.22);
    ctx.beginPath();
    ctx.ellipse(0, -12, 16, 5, 0, 0, PI2);
    ctx.fill();
  }

  // ---------- 批次三：精英 · 噬人花 ----------
  function poseMaw(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 1.6 + seed) * 1.2, rot: Math.sin(t * 1.1 + seed) * 0.03,
      sx: 1, sy: 1,
      head: -0.06 + Math.sin(t * 1.3 + seed) * 0.05,
      jaw: 0.16 + Math.sin(t * 2.2 + seed) * 0.05,
      leaf: Math.sin(t * 1.8 + seed) * 0.1
    };
    if (m.moving) {
      p.dy -= 1.4;
      p.leaf += Math.sin(m.walkPhase || 0) * 0.14;
    }
    const a = m.action;
    if (a) {
      if (a.phase === 'windup') {
        const e = easeOut(clamp(a.t / Math.max(0.01, a.windup), 0, 1));
        p.head -= 0.34 * e;
        p.jaw = 0.16 + 0.78 * e;
        p.sy -= 0.05 * e;
        p.dy += 2 * e;
      } else if (a.phase === 'strike') {
        const e = easeOut(clamp(a.t / Math.max(0.01, a.strike), 0, 1));
        p.head += 0.3 * e;
        p.jaw = Math.max(0.02, 0.16 - 0.16 * e);
        p.dx += 10 * e;
        p.sx += 0.08 * e;
      } else {
        const r = 1 - easeOut(clamp(a.t / Math.max(0.01, a.recover), 0, 1));
        p.head += 0.3 * r;
        p.jaw = 0.16 * r;
        p.dx += 10 * r;
        p.sx += 0.08 * r;
      }
    }
    return p;
  }

  function drawMawLeaf(ctx, x, y, rot, fill, pal) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-14, -6, -24, -2, -30, 6);
    ctx.bezierCurveTo(-20, 10, -8, 8, 0, 0);
    ctx.closePath();
    fs(ctx, fill, pal, 2.2);
    ctx.strokeStyle = rgba(pal.leafLo, 0.85);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2, 1);
    ctx.lineTo(-24, 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawMaw(ctx, pal, p) {
    // 茎
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.bezierCurveTo(-10, -22, -7, -40, -4, -54);
    ctx.lineTo(4, -54);
    ctx.bezierCurveTo(8, -38, 10, -20, 5, 0);
    ctx.closePath();
    fs(ctx, pal.stem, pal, 2.6);
    ctx.strokeStyle = rgba(pal.stemLo, 0.7);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.quadraticCurveTo(-1, -26, -1, -48);
    ctx.stroke();

    // 叶
    drawMawLeaf(ctx, -4, -16, -0.2 + p.leaf, pal.leaf, pal);
    ctx.save();
    ctx.translate(4, -34);
    ctx.scale(-1, 1);
    drawMawLeaf(ctx, 0, 0, 0.3 - p.leaf, pal.leaf, pal);
    ctx.restore();

    // 花头
    ctx.save();
    ctx.translate(0, -60);
    ctx.rotate(p.head);

    // 花瓣
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -27, 13, 9, 0, 0, PI2);
      fs(ctx, i % 2 ? pal.petalLo : pal.petal, pal, 2);
      ctx.restore();
    }

    // 口腔
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, PI2);
    fs(ctx, pal.maw, pal, 2.4);

    // 上排牙
    ctx.fillStyle = pal.tooth;
    for (let i = 0; i < 5; i++) {
      const a = -2.5 + i * 0.62;
      const x = Math.cos(a) * 16;
      const y = Math.sin(a) * 16;
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 1);
      ctx.lineTo(x + 3, y - 1);
      ctx.lineTo(x, y + 5);
      ctx.closePath();
      ctx.fill();
    }

    // 下颚（张嘴）
    ctx.save();
    ctx.translate(0, 5);
    ctx.rotate(p.jaw);
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI);
    ctx.closePath();
    fs(ctx, pal.petalLo, pal, 2.2);
    // 舌头
    ctx.beginPath();
    ctx.ellipse(0, 10, 9, 5, 0, 0, PI2);
    ctx.fillStyle = pal.tongue;
    ctx.fill();
    // 下排牙
    ctx.fillStyle = pal.tooth;
    for (let i = 0; i < 4; i++) {
      const a = 0.35 + i * 0.62;
      const x = Math.cos(a) * 15;
      const y = Math.sin(a) * 15;
      ctx.beginPath();
      ctx.moveTo(x - 2.6, y + 1);
      ctx.lineTo(x + 2.6, y + 1);
      ctx.lineTo(x, y - 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 眼睛
    for (const ex of [-10, 10]) {
      ctx.beginPath();
      ctx.ellipse(ex, -23, 4.2, 3.4, 0, 0, PI2);
      ctx.fillStyle = pal.eye;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ex + 0.6, -23, 1.4, 2.6, 0, 0, PI2);
      ctx.fillStyle = pal.pupil;
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- 批次三：精英 · 瘟疫医师 ----------
  function poseDoc(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 1.7 + seed) * 1.2, rot: Math.sin(t * 0.9 + seed) * 0.02,
      sx: 1, sy: 1, legL: 0, legR: 0, liftL: 0, liftR: 0,
      armRot: -0.5, headRot: Math.sin(t * 1.1 + seed) * 0.03, cloak: 0
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph)) * 1.8;
      p.rot = Math.sin(ph) * 0.03;
      p.legL = Math.sin(ph) * 0.45;
      p.legR = -Math.sin(ph) * 0.45;
      p.liftL = Math.max(0, Math.sin(ph)) * 2;
      p.liftR = Math.max(0, -Math.sin(ph)) * 2;
      p.cloak = Math.sin(ph) * 0.05;
    }
    const a = m.action;
    if (a) {
      if (a.phase === 'windup') {
        const e = easeOut(clamp(a.t / Math.max(0.01, a.windup), 0, 1));
        p.armRot -= 1.1 * e;
        p.rot -= 0.12 * e;
        p.cloak = -0.14 * e;
        p.headRot -= 0.08 * e;
      } else if (a.phase === 'strike') {
        const e = easeOut(clamp(a.t / Math.max(0.01, a.strike), 0, 1));
        p.armRot += 1.6 * e;
        p.dx += 8 * e;
        p.rot += 0.14 * e;
        p.cloak = 0.1 * e;
      } else {
        const r = 1 - easeOut(clamp(a.t / Math.max(0.01, a.recover), 0, 1));
        p.armRot += 1.6 * r;
        p.dx += 8 * r;
        p.rot += 0.14 * r;
        p.cloak = 0.1 * r;
      }
    }
    return p;
  }

  function drawPlaguedoc(ctx, pal, p) {
    // 腿脚
    drawStubLeg(ctx, -7, p.legL, p.liftL, pal.robeLo, pal.robe, pal);
    drawStubLeg(ctx, 7, p.legR, p.liftR, pal.robeLo, pal.robe, pal);

    // 长袍
    ctx.beginPath();
    ctx.moveTo(-17, -8);
    ctx.bezierCurveTo(-22, -32, -18, -54, -11, -64);
    ctx.lineTo(11, -64);
    ctx.bezierCurveTo(18, -54, 22, -32, 17, -8);
    ctx.quadraticCurveTo(12, -3, 8, -8);
    ctx.quadraticCurveTo(2, -2, -3, -8);
    ctx.quadraticCurveTo(-10, -3, -17, -8);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.6);
    // 袍面高光
    ctx.strokeStyle = rgba(pal.robeHi, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -58);
    ctx.quadraticCurveTo(-13, -34, -10, -14);
    ctx.stroke();
    // 腰带
    ctx.fillStyle = pal.belt;
    ctx.fillRect(-15, -40, 30, 4);
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-15, -40, 30, 4);

    // 披肩（破损）
    ctx.beginPath();
    ctx.moveTo(-19, -62);
    ctx.quadraticCurveTo(0, -70, 19, -62);
    ctx.lineTo(16, -50);
    ctx.lineTo(11, -56);
    ctx.lineTo(6, -48);
    ctx.lineTo(0, -55);
    ctx.lineTo(-6, -48);
    ctx.lineTo(-11, -56);
    ctx.lineTo(-16, -50);
    ctx.closePath();
    fs(ctx, pal.cape, pal, 2.4);

    // 左臂
    ctx.strokeStyle = pal.robe;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, -60);
    ctx.quadraticCurveTo(-21, -50, -17, -42);
    ctx.stroke();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-17, -41, 3.2, 0, PI2);
    ctx.stroke();

    // 头（鸟嘴面具）
    ctx.save();
    ctx.translate(0, -76);
    ctx.rotate(p.headRot);
    // 面具
    ctx.beginPath();
    ctx.ellipse(-1, 0, 11, 13, 0, 0, PI2);
    fs(ctx, pal.mask, pal, 2.4);
    // 鸟喙
    ctx.beginPath();
    ctx.moveTo(2, -6);
    ctx.quadraticCurveTo(20, -8, 30, -2);
    ctx.quadraticCurveTo(22, 3, 3, 6);
    ctx.closePath();
    fs(ctx, pal.beak, pal, 2.2);
    ctx.strokeStyle = rgba(pal.maskLo, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, -3);
    ctx.quadraticCurveTo(18, -5, 26, -2);
    ctx.stroke();
    // 护目镜
    ctx.beginPath();
    ctx.arc(-5, -2, 4.2, 0, PI2);
    ctx.arc(4.5, -2, 4.2, 0, PI2);
    fs(ctx, pal.goggle, pal, 1.6);
    ctx.fillStyle = rgba(pal.lens, 0.9);
    ctx.beginPath();
    ctx.arc(-5, -2, 2, 0, PI2);
    ctx.arc(4.5, -2, 2, 0, PI2);
    ctx.fill();
    ctx.restore();

    // 帽子
    ctx.save();
    ctx.translate(0, -86);
    ctx.rotate(p.headRot * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 6, 0, 0, PI2);
    fs(ctx, pal.hat, pal, 2.4);
    ctx.beginPath();
    ctx.moveTo(-11, -3);
    ctx.quadraticCurveTo(-8, -18, 0, -21);
    ctx.quadraticCurveTo(8, -18, 11, -3);
    ctx.closePath();
    fs(ctx, pal.hat, pal, 2.2);
    ctx.strokeStyle = rgba(pal.hatHi, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, -6);
    ctx.quadraticCurveTo(0, -8, 9, -6);
    ctx.stroke();
    ctx.restore();

    // 右手 + 巨镰
    ctx.save();
    ctx.translate(13, -62);
    ctx.strokeStyle = pal.robe;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(6, -8, 7, -16);
    ctx.stroke();
    ctx.translate(7, -16);
    ctx.rotate(p.armRot);
    // 镰柄
    ctx.strokeStyle = pal.wood;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 18);
    ctx.lineTo(2, -52);
    ctx.stroke();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 镰刃
    ctx.beginPath();
    ctx.moveTo(2, -52);
    ctx.bezierCurveTo(16, -62, 30, -64, 34, -58);
    ctx.bezierCurveTo(24, -58, 12, -52, 3, -45);
    ctx.closePath();
    fs(ctx, pal.steel, pal, 1.8);
    ctx.strokeStyle = rgba(pal.steelLo, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, -50);
    ctx.quadraticCurveTo(20, -58, 31, -58);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 批次三：精英 · 深渊巫师（读条施法） ----------
  function poseWarlock(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 1.5 + seed) * 2.4, rot: Math.sin(t * 0.7 + seed) * 0.03,
      sx: 1, sy: 1, cloak: Math.sin(t * 1.9 + seed) * 0.09,
      headRot: Math.sin(t * 1.0 + seed) * 0.03,
      arm: 0, glow: 0.85 + Math.sin(t * 2.8 + seed) * 0.15
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy -= 2;
      p.cloak += Math.sin(ph) * 0.12;
      p.rot += Math.sin(ph) * 0.04;
    }
    const a = m.action;
    if (a) {
      if (a.phase === 'windup') {
        const e = easeOut(clamp(a.t / Math.max(0.01, a.windup), 0, 1));
        p.arm = -0.5 * e;
        p.glow = 0.9 + 1.3 * e;
        p.headRot -= 0.08 * e;
        p.dy += 1.5 * e;
      } else if (a.phase === 'strike') {
        p.arm = 0.5;
        p.glow = 2.2;
      } else {
        const r = 1 - easeOut(clamp(a.t / Math.max(0.01, a.recover), 0, 1));
        p.arm = 0.5 * r;
        p.glow = 1 + 1.2 * r;
      }
    }
    return p;
  }

  function drawWarlock(ctx, pal, p) {
    // 下方雾尾
    ctx.save();
    ctx.translate(0, -8);
    ctx.rotate(p.cloak);
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.bezierCurveTo(-34, 6, -20, 12, -11, 7);
    ctx.bezierCurveTo(-4, 14, 7, 12, 9, 6);
    ctx.bezierCurveTo(18, 13, 31, 8, 26, 1);
    ctx.lineTo(18, -7);
    ctx.lineTo(-18, -7);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.robeHi, 0.45);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.robeLo, 0.6);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // 长袍
    ctx.beginPath();
    ctx.moveTo(-24, -10);
    ctx.bezierCurveTo(-29, -32, -23, -54, -14, -66);
    ctx.lineTo(14, -66);
    ctx.bezierCurveTo(23, -54, 29, -32, 24, -10);
    ctx.quadraticCurveTo(15, -4, 9, -9);
    ctx.quadraticCurveTo(0, -3, -9, -9);
    ctx.quadraticCurveTo(-16, -4, -24, -10);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.8);
    // 暗面
    ctx.beginPath();
    ctx.moveTo(11, -64);
    ctx.bezierCurveTo(18, -50, 22, -30, 19, -12);
    ctx.quadraticCurveTo(15, -6, 11, -10);
    ctx.quadraticCurveTo(15, -34, 11, -64);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.robeLo, 0.55);
    ctx.fill();
    // 金色滚边
    ctx.strokeStyle = rgba(pal.trim, 0.8);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-13, -12);
    ctx.quadraticCurveTo(-4, -6, 4, -12);
    ctx.quadraticCurveTo(11, -7, 16, -13);
    ctx.stroke();
    // 胸襟
    ctx.beginPath();
    ctx.moveTo(-11, -64);
    ctx.quadraticCurveTo(0, -54, 11, -64);
    ctx.stroke();

    // 左袖
    ctx.beginPath();
    ctx.moveTo(-16, -60);
    ctx.quadraticCurveTo(-26, -48, -20, -36);
    ctx.quadraticCurveTo(-15, -29, -12, -38);
    ctx.quadraticCurveTo(-14, -48, -12, -58);
    ctx.closePath();
    fs(ctx, pal.robe, pal, 2.2);

    // 右袖 + 法杖
    ctx.save();
    ctx.translate(17, -56);
    ctx.rotate(p.arm);
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(11, -4, 13, -13);
    ctx.quadraticCurveTo(10, -18, 5, -15);
    ctx.quadraticCurveTo(6, -8, -1, -8);
    ctx.closePath();
    fs(ctx, pal.robeHi, pal, 2.2);
    // 法杖
    ctx.strokeStyle = pal.robeLo;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(12, -2);
    ctx.lineTo(12, -42);
    ctx.stroke();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 顶端宝珠
    ctx.save();
    ctx.translate(12, -46);
    ctx.globalCompositeOperation = 'lighter';
    const og = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
    og.addColorStop(0, rgba(pal.orbCore, 0.9 * p.glow));
    og.addColorStop(0.35, rgba(pal.orb, 0.55 * p.glow));
    og.addColorStop(1, rgba(pal.orb, 0));
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(12, -46, 6, 0, PI2);
    fs(ctx, pal.orb, pal, 1.8);
    ctx.beginPath();
    ctx.arc(10.4, -47.6, 2, 0, PI2);
    ctx.fillStyle = pal.orbCore;
    ctx.fill();
    ctx.restore();

    // 兜帽 + 双角
    ctx.save();
    ctx.translate(0, -68);
    ctx.rotate(p.headRot);
    // 角
    ctx.beginPath();
    ctx.moveTo(-14, -14);
    ctx.bezierCurveTo(-22, -24, -26, -32, -22, -36);
    ctx.bezierCurveTo(-18, -30, -14, -24, -9, -20);
    ctx.closePath();
    fs(ctx, pal.bone, pal, 1.8);
    ctx.beginPath();
    ctx.moveTo(14, -14);
    ctx.bezierCurveTo(22, -24, 26, -32, 22, -36);
    ctx.bezierCurveTo(18, -30, 14, -24, 9, -20);
    ctx.closePath();
    fs(ctx, pal.bone, pal, 1.8);
    // 兜帽
    ctx.beginPath();
    ctx.moveTo(-22, 2);
    ctx.bezierCurveTo(-27, -14, -18, -32, 0, -34);
    ctx.bezierCurveTo(18, -32, 27, -14, 22, 2);
    ctx.quadraticCurveTo(13, -5, 6, 0);
    ctx.quadraticCurveTo(0, -6, -6, 0);
    ctx.quadraticCurveTo(-14, -5, -22, 2);
    ctx.closePath();
    fs(ctx, pal.hood, pal, 2.8);
    // 兜帽内部
    ctx.beginPath();
    ctx.ellipse(0, -11, 14, 15, 0, 0, PI2);
    ctx.fillStyle = pal.hoodLo;
    ctx.fill();
    // 双眼
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 * p.glow;
    ctx.fillStyle = pal.eye;
    ctx.beginPath();
    ctx.arc(-5.5, -12, 9, 0, PI2);
    ctx.arc(6, -12, 9, 0, PI2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = pal.eye;
    ctx.beginPath();
    ctx.ellipse(-5.5, -12, 3.6, 2.8, 0.12, 0, PI2);
    ctx.ellipse(6, -12, 3.6, 2.8, -0.12, 0, PI2);
    ctx.fill();
    // 兜帽高光
    ctx.strokeStyle = rgba(pal.hoodHi, 0.8);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-15, -24);
    ctx.quadraticCurveTo(0, -31, 15, -24);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 动作 ----------
  function basePose(m, t, seed) {
    return {
      dx: 0, dy: Math.sin(t * 2.1 + seed) * 1.1,
      rot: Math.sin(t * 0.9 + seed) * 0.02,
      sx: 1, sy: 1,
      headDx: 0, headDy: Math.sin(t * 2.1 + seed - 0.5) * 0.8,
      headRot: Math.sin(t * 1.1 + seed) * 0.03,
      earRot: Math.sin(t * 1.7 + seed) * 0.1,
      hoodRot: Math.sin(t * 1.3 + seed) * 0.02,
      legL: 0, legR: 0, liftL: 0, liftR: 0,
      eyeOpen: 0.72
    };
  }

  function computePose(m, t, seed) {
    let p;
    if (m.moving) {
      const ph = m.walkPhase || 0;
      const step = Math.abs(Math.sin(ph));
      p = {
        dx: Math.sin(ph) * 1.6, dy: -step * 1.9,
        rot: Math.sin(ph) * 0.05,
        sx: 1 + step * 0.02, sy: 1 - step * 0.03,
        headDx: Math.sin(ph - 0.6) * 1.4, headDy: -step * 1.2 + Math.sin(ph - 0.5) * 0.8,
        headRot: Math.sin(ph - 0.4) * 0.045,
        earRot: Math.sin(ph * 2 + 0.3) * 0.14,
        hoodRot: Math.sin(ph * 2) * 0.035,
        legL: Math.sin(ph) * 0.55,
        legR: -Math.sin(ph) * 0.55,
        liftL: Math.max(0, Math.sin(ph)) * 2.2,
        liftR: Math.max(0, -Math.sin(ph)) * 2.2,
        eyeOpen: 0.78
      };
    } else {
      p = basePose(m, t, seed);
    }

    // 眨眼（4.3s 一次，0.16s 闭合）
    const cyc = (t + seed * 2.3) % 4.3;
    const blink = cyc < 0.16 ? 1 - Math.abs(cyc / 0.08 - 1) : 0;
    p.eyeOpen *= 1 - blink * 0.92;

    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.dy += 2.6 * e;
        p.rot -= 0.13 * e;
        p.sx += 0.10 * e;
        p.sy -= 0.13 * e;
        p.headDy += 2 * e;
        p.headRot -= 0.18 * e;
        p.earRot -= 0.35 * e;
        p.hoodRot -= 0.10 * e;
        p.eyeOpen *= 1 - 0.55 * e;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.dx += 9 * e;
        p.rot += 0.16 * e;
        p.headRot += 0.12 * e;
        p.earRot += 0.5 * e;
        p.hoodRot += 0.12 * e;
        p.eyeOpen *= 0.35;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.dx += 9 * r;
        p.rot += 0.16 * r;
        p.headRot += 0.12 * r;
        p.earRot += 0.5 * r;
        p.hoodRot += 0.12 * r;
        p.eyeOpen *= 1 - 0.65 * r;
      }
    }
    return p;
  }

  // ---------- 陷阱：宝箱怪 ----------
  function poseMimic(m, t, seed) {
    const p = {
      dx: 0, dy: Math.sin(t * 2.2 + seed) * 0.7, rot: 0, sx: 1, sy: 1,
      maw: 0.06, look: 0, legL: 0, legR: 0
    };
    if (m.moving) {
      const ph = m.walkPhase || 0;
      p.dy = -Math.abs(Math.sin(ph * 2)) * 1.6;
      p.rot = Math.sin(ph) * 0.05;
      p.legL = Math.sin(ph) * 0.5;
      p.legR = -Math.sin(ph) * 0.5;
      p.maw = 0.18 + Math.max(0, Math.sin(ph * 2)) * 0.1;
    }
    const act = m.action;
    if (act) {
      if (act.phase === 'windup') {
        // 盖子缓缓掀开，箱体后仰蓄力
        const e = easeOut(clamp(act.t / Math.max(0.01, act.windup), 0, 1));
        p.maw = 0.06 + 0.94 * e;
        p.rot -= 0.1 * e;
        p.dy += 1.2 * e;
        p.sx = 1 + 0.07 * e;
        p.sy = 1 - 0.05 * e;
      } else if (act.phase === 'strike') {
        const e = easeOut(clamp(act.t / Math.max(0.01, act.strike), 0, 1));
        p.dx += 10 * e;
        p.maw = 1;
        p.rot += 0.09 * e;
        p.sx = 1.05;
        p.sy = 0.95;
        p.look = e;
      } else {
        const r = 1 - easeOut(clamp(act.t / Math.max(0.01, act.recover), 0, 1));
        p.dx += 10 * r;
        p.maw = 0.06 + 0.94 * r;
        p.rot += 0.09 * r;
        p.look = r;
      }
    }
    // 掀盖后体型膨胀：闭合时接近普通宝箱尺寸，现形后才显出怪物体型
    const grow = 1 + p.maw * 0.55;
    p.sx *= grow;
    p.sy *= grow;
    return p;
  }

  function mimicRound(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawMimic(ctx, pal, p) {
    const maw = clamp(p.maw, 0, 1);
    const open = maw * 22;          // 盖子抬起高度
    const seam = -40;               // 箱体顶边（上下盖咬合线）

    // 箱脚：走动时交替抬起
    [-18, 18].forEach((fx, i) => {
      ctx.save();
      ctx.translate(fx + (i ? p.legR : p.legL) * 2, -2);
      ctx.beginPath();
      ctx.ellipse(0, 2, 8.5, 5, 0, 0, PI2);
      fs(ctx, pal.foot, pal, 2.2);
      ctx.restore();
    });

    // 口腔暗腔：跨在咬合线上，上下被箱体与盖子遮住
    const cy = seam - open * 0.5;
    const ry = 6 + open * 0.5 + maw * 6;
    ctx.beginPath();
    ctx.ellipse(0, cy, 29, ry, 0, 0, PI2);
    ctx.fillStyle = pal.maw;
    ctx.fill();

    // 舌头
    if (maw > 0.25) {
      ctx.beginPath();
      ctx.ellipse(0, cy + ry * 0.32, 15, 4.5 + maw * 2.5, 0, 0, PI2);
      ctx.fillStyle = pal.tongue;
      ctx.fill();
    }

    // 腔内双眼：越张开越亮
    const eyeA = clamp((maw - 0.25) / 0.5, 0, 1);
    if (eyeA > 0.02) {
      [-11, 11].forEach((ex) => {
        const g = ctx.createRadialGradient(ex, cy - 1, 1, ex, cy - 1, 12);
        g.addColorStop(0, rgba(pal.eye, 0.45 * eyeA));
        g.addColorStop(1, rgba(pal.eye, 0));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ex, cy - 1, 12, 0, PI2);
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.ellipse(ex, cy - 1, 4.6, 4, 0, 0, PI2);
        ctx.fillStyle = pal.eye;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(ex + p.look * 1.4, cy - 0.6, 1.9, 2.6, 0, 0, PI2);
        ctx.fillStyle = pal.pupil;
        ctx.fill();
      });
    }

    // 上齿（倒挂在盖沿）→ 下齿（立在下沿）
    const tw = 6.4, gap = 8.4;
    ctx.fillStyle = pal.tooth;
    for (let i = -3; i <= 3; i++) {
      const x = i * gap;
      if (Math.abs(x) > 25) continue;
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, seam - open);
      ctx.lineTo(x + tw / 2, seam - open);
      ctx.lineTo(x, seam - open + 9.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - tw / 2 + 3, seam);
      ctx.lineTo(x + tw / 2 + 3, seam);
      ctx.lineTo(x + 3, seam - 9);
      ctx.closePath();
      ctx.fill();
    }
    // 牙龈
    ctx.fillStyle = pal.gum;
    ctx.fillRect(-25, seam - open - 2, 50, 2.6);
    ctx.fillRect(-25, seam - 0.6, 50, 2.6);

    // 箱体
    mimicRound(ctx, -32, seam, 64, 38, 5);
    fs(ctx, pal.wood, pal, 2.6);
    // 木纹
    ctx.strokeStyle = rgba(pal.woodLo, 0.75);
    ctx.lineWidth = 1.4;
    [-14, 0, 14].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, seam + 5);
      ctx.lineTo(x, seam + 32);
      ctx.stroke();
    });
    // 底部暗面
    ctx.fillStyle = rgba(pal.woodLo, 0.55);
    ctx.fillRect(-31, seam + 25, 62, 11);

    // 金属包边
    ctx.fillStyle = pal.trim;
    ctx.fillRect(-30, seam + 27, 60, 5);
    ctx.fillRect(-30, seam + 2, 60, 4);
    [-30, 25].forEach((x) => ctx.fillRect(x, seam + 2, 5, 30));
    // 锁扣
    mimicRound(ctx, -7, seam + 8, 14, 12, 3);
    fs(ctx, pal.trimLo, pal, 1.8);
    ctx.beginPath();
    ctx.arc(0, seam + 13, 2.4, 0, PI2);
    ctx.fillStyle = pal.lock;
    ctx.fill();

    // 盖子：绕后沿抬起
    ctx.save();
    ctx.translate(0, seam - open);
    ctx.rotate(-0.07 * maw);
    mimicRound(ctx, -34, -21, 68, 21, 6);
    fs(ctx, pal.woodHi, pal, 2.6);
    ctx.strokeStyle = rgba(pal.woodLo, 0.6);
    ctx.lineWidth = 1.4;
    [-14, 0, 14].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, -17);
      ctx.lineTo(x, -3);
      ctx.stroke();
    });
    ctx.fillStyle = pal.trim;
    ctx.fillRect(-30, -7, 60, 4.6);
    [-30, 25].forEach((x) => ctx.fillRect(x, -20, 5, 15));
    // 盖顶高光
    ctx.beginPath();
    ctx.ellipse(-11, -15, 9, 3.2, -0.16, 0, PI2);
    ctx.fillStyle = rgba(pal.trimHi, 0.35);
    ctx.fill();
    ctx.restore();
  }

  // ---------- 批次五：图鉴裁切贴图小怪 ----------
  // 直接使用参考图鉴中的角色，不重绘；首次加载缓存画布与白闪剪影，运行时只做 drawImage。
  const texCache = {};

  function texSource(src) {
    let s = texCache[src];
    if (s) return s;
    s = {
      src, img: new Image(), ready: false, failed: false,
      canvas: null, flash: null, w: 0, h: 0, bw: 0, bh: 0
    };
    s.img.onload = () => {
      const w = s.img.naturalWidth;
      const h = s.img.naturalHeight;
      if (!w || !h) return;
      s.w = w;
      s.h = h;
      s.ready = true;
      // 运行时显示高度约 82~120px，原始素材往往大得多。这里把暗色调与白闪
      // 一次性烘焙到接近显示尺寸（每帧只需一次小图 drawImage，成本极低）。
      const MAXH = 192;
      const sc = Math.min(1, MAXH / h);
      const bw = Math.max(1, Math.round(w * sc));
      const bh = Math.max(1, Math.round(h * sc));
      s.bw = bw;
      s.bh = bh;
      // 暗色调只烘焙一次，运行时不再逐帧走 ctx.filter 离屏滤镜
      const dc = document.createElement('canvas');
      dc.width = bw;
      dc.height = bh;
      const dg = dc.getContext('2d');
      dg.imageSmoothingQuality = 'high';   // 仅烘焙时用高质量，运行时零成本
      dg.filter = DARK_FILTER_TEX;
      dg.drawImage(s.img, 0, 0, w, h, 0, 0, bw, bh);
      s.dark = dc;
      const f = document.createElement('canvas');
      f.width = bw;
      f.height = bh;
      const fg = f.getContext('2d');
      fg.drawImage(dc, 0, 0);
      fg.globalCompositeOperation = 'source-atop';
      fg.fillStyle = '#ffffff';
      fg.fillRect(0, 0, bw, bh);
      s.flash = f;
    };
    s.img.onerror = () => { s.failed = true; };
    DG.assets.assign(s.img, src);
    texCache[src] = s;
    return s;
  }

  // 分件贴图：同一张图按部件矩形拆开绘制，绕接缝枢轴做微幅摆动。
  // 贴图本身不做任何修改；相邻部件在接缝处相互重叠，转动时不会露缝。
  function drawParts(ctx, s, parts, m, t, seed, w, h) {
    const kx = w / (s.w || 1);
    const ky = h / (s.h || 1);
    const bx = (s.bw || s.w) / (s.w || 1);
    const by = (s.bh || s.h) / (s.h || 1);
    const img = s.dark || s.canvas;
    const walking = !!m.moving;
    const a = m.action;
    const strike = (a && a.phase === 'strike' && a.t != null)
      ? Math.sin(Math.min(1, a.t / Math.max(0.001, a.strike || 0.14)) * Math.PI)
      : 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const r = p.r;
      const freq = p.freq || 2;
      const ph = (p.phase || 0) + seed;
      let ang = p.rot ? Math.sin(t * freq + ph) * p.rot : 0;
      let sx = p.swing ? Math.sin(t * freq * 0.9 + ph) * p.swing * (walking ? 1 : 0.45) : 0;
      if (walking && p.rot) ang += Math.sin(t * (p.wfreq || 9) + ph) * p.rot * 0.9;
      if (strike) {
        ang += strike * (p.strike || 0);
        sx += strike * (p.push || 0);
      }
      const px = -w / 2 + p.p[0] * kx;
      const py = -h + p.p[1] * ky;
      ctx.save();
      ctx.translate(px + sx, py);
      ctx.rotate(ang);
      ctx.translate(-px, -py);
      ctx.drawImage(img,
        r[0] * bx, r[1] * by, (r[2] - r[0]) * bx, (r[3] - r[1]) * by,
        -w / 2 + r[0] * kx, -h + r[1] * ky,
        (r[2] - r[0]) * kx, (r[3] - r[1]) * ky);
      ctx.restore();
    }
  }

  // 贴图小怪：脚底锚定，呼吸/行走起伏 + 蓄力下蹲 + 出手前冲，受击白闪
  // 不同招式使用不同的蓄力/出手形变：突刺拉长、扑击下蹲、震地先起后砸、
  // 横扫大幅侧倾、旋斩带转体，避免所有小怪共用同一套“前后一顶”的动作
  const MELEE_POSE = {
    default: { wx: 0.05,  wy: 0.06,  lean: 0.03,  dx: 9,  sx: 0.06, sy: 0.03, dip: 2,   sdip: 2 },
    claw:    { wx: 0.055, wy: 0.07,  lean: 0.03,  dx: 14, sx: 0.09, sy: 0.03, dip: 1.6, sdip: 1.8 },
    grab:    { wx: 0.06,  wy: 0.08,  lean: 0.045, dx: 12, sx: 0.08, sy: 0.04, dip: 2,   sdip: 2.2 },
    pounce:  { wx: 0.07,  wy: 0.11,  lean: 0.02,  dx: 17, sx: 0.07, sy: 0.02, dip: 3.2, sdip: 2.6 },
    charge:  { wx: 0.06,  wy: 0.1,   lean: 0.055, dx: 22, sx: 0.09, sy: 0.02, dip: 2.4, sdip: 2.8 },
    slash:   { wx: 0.06,  wy: 0.09,  lean: 0.05,  dx: 10, sx: 0.11, sy: 0.02, dip: 2,   sdip: 2.4 },
    sweep:   { wx: 0.09,  wy: 0.06,  lean: 0.075, dx: 8,  sx: 0.12, sy: 0.05, dip: 1.6, sdip: 3.2 },
    rend:    { wx: 0.04,  wy: 0.05,  lean: 0.02,  dx: 10, sx: 0.1,  sy: 0.02, dip: 1.2, sdip: 1.6 },
    impale:  { wx: 0.03,  wy: 0.07,  lean: 0.008, dx: 26, sx: 0.02, sy: 0.06, dip: 1.2, sdip: 1.2 },
    spin:    { wx: 0.1,   wy: 0.05,  lean: 0.02,  dx: 0,  sx: 0.1,  sy: 0.08, dip: 2,   sdip: 2.6, twist: 0.34 },
    slam:    { wx: 0.08,  wy: 0.16,  lean: 0.012, dx: 0,  sx: 0.12, sy: 0.12, dip: -3,  sdip: 5.5 }
  };

  function drawTex(ctx, m, d, t) {
    const s = texSource(d.src);
    const h = displayHeight(m);
    const seed = m.seed || 0;
    const a = m.action;
    const windup = !!(a && a.phase === 'windup');
    const strike = !!(a && a.phase === 'strike');
    const P = MELEE_POSE[a && a.move] || MELEE_POSE.default;
    const mc = Math.cos(m.facing || 0);

    let bob = Math.sin(t * 2.2 + seed) * 1.6;
    let rot = Math.sin(t * 0.9 + seed) * 0.012;
    let sx = 1;
    let sy = 1;
    let dx = 0;
    if (m.moving) {
      bob += Math.sin(t * 9 + seed) * 1.8;
      rot += mc * 0.018;
    }
    if (windup) {
      const k = Math.min(1, a.t / Math.max(0.001, a.windup));
      const e = Math.sin(k * Math.PI * 0.5);
      sx -= e * P.wx;
      sy += e * P.wy;
      rot -= mc * P.lean * e;
      bob -= e * P.dip;
      if (P.twist) rot -= mc * P.twist * e;
    } else if (strike) {
      const e = Math.sin(Math.min(1, a.t / Math.max(0.001, a.strike)) * Math.PI);
      sx += e * P.sx;
      sy -= e * P.sy;
      dx = mc * e * P.dx;
      bob -= e * P.sdip;
      rot += mc * P.lean * e;
      if (P.twist) rot += mc * P.twist * 1.6 * e;
    }

    const w = s.ready ? h * (s.w / s.h) : h * 0.9;
    const flip = Math.cos(m.facing || 0) < -0.05;
    ctx.save();
    ctx.translate(dx, m.r * 0.72 + bob - (m.hop || 0));
    ctx.rotate(rot);
    ctx.scale(sx * (flip ? -1 : 1), sy);
    ctx.imageSmoothingEnabled = true;
    if (s.ready) {
      if (d.parts) drawParts(ctx, s, d.parts, m, t, seed, w, h);
      else ctx.drawImage(s.dark || s.canvas, -w / 2, -h, w, h);
      if (m.flash > 0 && s.flash) {
        ctx.globalAlpha = Math.min(0.8, m.flash / 0.16);
        ctx.drawImage(s.flash, -w / 2, -h, w, h);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // ---------- 对外接口 ----------
  // 全部小怪统一使用本轮新贴图：src 走 drawTex（脚底锚定 + 呼吸 / 前冲 / 受击白闪）
  const defs = {
    wolf: { h: 62, name: '腐化野狼', src: 'assets/monsters/wolf.png' },
    skeleton: { h: 80, name: '骷髅战士', src: 'assets/monsters/skeleton.png' },
    mistwalker: { h: 82, name: '迷雾行者', src: 'assets/monsters/mistwalker.png' },
    pea: { h: 52, name: '孢帽菌人', src: 'assets/monsters/pea.png' },
    musketeer: { h: 66, name: '菌帽枪手', src: 'assets/monsters/musketeer.png' },
    pumpkin: { h: 62, name: '裂口刈手', src: 'assets/monsters/pumpkin.png' },
    slime: { h: 54, name: '赤红史莱姆', src: 'assets/monsters/slime.png' },
    frostwolf: { h: 64, name: '霜牙狼', src: 'assets/monsters/frostwolf.png' },
    boneknight: { h: 84, name: '缠尸卫士', src: 'assets/monsters/boneknight.png' },
    frostslime: { h: 66, name: '霜颅骸骨', src: 'assets/monsters/frostslime.png' },
    bat: { h: 44, name: '血翼蝠', src: 'assets/monsters/bat.png' },
    hornet: { h: 44, name: '毒刺蜂', src: 'assets/monsters/hornet.png' },
    beetle: { h: 54, name: '青壳甲虫', src: 'assets/monsters/beetle.png' },
    cinderraven: { h: 52, name: '黑焰蝠', src: 'assets/monsters/cinderraven.png' },
    candle: { h: 74, name: '魔锅炉怪', src: 'assets/monsters/candle.png' },
    urchin: { h: 66, name: '棘刺仙人掌', src: 'assets/monsters/urchin.png' },
    deepfin: { h: 54, name: '幽蓝喙兽', src: 'assets/monsters/deepfin.png' },
    cowlbandit: { h: 62, name: '游荡菌人', src: 'assets/monsters/cowlbandit.png' },
    angler: { h: 46, name: '渊灯兽', src: 'assets/monsters/angler.png' },
    fleece: { h: 60, name: '绷带猫', src: 'assets/monsters/fleece.png' },
    foxraider: { h: 64, name: '灰狐掠手', src: 'assets/monsters/foxraider.png' },
    emberdrake: { h: 62, name: '赤棘龙', src: 'assets/monsters/emberdrake.png' },
    venomlisk: { h: 58, name: '绿鳞蛇', src: 'assets/monsters/venomlisk.png' },
    bulwark: { h: 58, name: '铁背野猪', src: 'assets/monsters/bulwark.png' },
    mummy: { h: 86, name: '墓穴木乃伊', src: 'assets/monsters/mummy.png' },
    mawflower: { h: 92, name: '噬人蠕虫', src: 'assets/monsters/mawflower.png' },
    plaguedoc: { h: 96, name: '瘟疫医师', src: 'assets/monsters/plaguedoc.png' },
    warlock: { h: 86, name: '深渊巫师', src: 'assets/monsters/warlock.png' }
  };

  function displayHeight(m) {
    const d = defs[m.art];
    const base = (d ? d.h : ART_H) * (m.artScale || 1);
    // 体型偏小的小怪统一放大 10%：按原始美术高度判定，精英加成不参与
    const small = base <= 52 ? 1.1 : 1;
    return base * small * (m.elite ? 1.18 : 1);
  }

  function draw(ctx, m, opts) {
    const d = defs[m.art];
    if (!d) return;
    const t = (opts && opts.t) || 0;
    if (d.src) {
      drawTex(ctx, m, d, t);
      return;
    }
    const seed = m.seed || 0;
    const h = displayHeight(m);
    const k = h / (d.designH || DESIGN_H);
    const pose = (d.pose || computePose)(m, t, seed);
    const flip = Math.cos(m.facing || 0) < -0.05;

    ctx.save();
    ctx.translate(pose.dx, m.r * 0.72 + pose.dy - (m.hop || 0));
    ctx.rotate(pose.rot);
    ctx.scale(k * (flip ? -1 : 1) * pose.sx, k * pose.sy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    d.draw(ctx, dimPal(d.pal || PAL), pose);
    if (m.flash > 0) {
      ctx.globalAlpha = Math.min(0.62, m.flash / 0.13);
      d.draw(ctx, d.flashPal || FLASH_PAL, pose);
      ctx.globalAlpha = 1;
    }

    // 出手瞬间：近战怪嘴/武器前的亮光，让咬击在不看特效时也能读出
    const g0 = d.strikeGlow;
    if (g0 && m.action && m.action.phase === 'strike') {
      const e = easeOut(clamp(m.action.t / Math.max(0.01, m.action.strike), 0, 1));
      const gx = g0.x + e * g0.dx;
      const gy = g0.y;
      const gr = g0.r + e * g0.dr;
      const g = ctx.createRadialGradient(gx, gy, 1, gx, gy, gr);
      g.addColorStop(0, rgba(m.fxColor || '#cbe8a4', 0.26 * e));
      g.addColorStop(1, rgba(m.fxColor || '#cbe8a4', 0));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, PI2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // 攻击 / 死亡特效：返回 true 表示已处理
  function drawEffect(ctx, e) {
    const k = 1 - e.life / Math.max(0.001, e.max);
    const fade = Math.max(0, e.life / e.max);

    if (e.kind === 'peaArc') {
      const sweep = Math.min(1, k * 1.55);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.26 * fade);
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.94, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(e.color, (0.85 - i * 0.2) * fade);
        ctx.lineWidth = 11 - i * 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 3, a0, a1);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba('#ffffff', 0.45 * fade);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius - 1.5, a0, a1);
      ctx.stroke();
      // 前端咬合闪光
      const hx = Math.cos(a1) * e.radius;
      const hy = Math.sin(a1) * e.radius;
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 11);
      hg.addColorStop(0, rgba('#ffffff', 0.38 * fade));
      hg.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(hx, hy, 11, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    // 霜牙狼：冰霜爪痕（冷雾弧 + 沿弧冰棱 + 飘落冰晶）
    if (e.kind === 'frostSlash') {
      const sweep = Math.min(1, k * 1.5);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.22 * fade);
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.94, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(i === 0 ? '#f2ffff' : e.color, (0.9 - i * 0.22) * fade);
        ctx.lineWidth = 12 - i * 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 3, a0, a1);
        ctx.stroke();
      }
      for (let i = 0; i < 7; i++) {
        const p = i / 7;
        if (p > sweep) break;
        const a = a0 + e.arc * p;
        const rr = e.radius - 5;
        const s = 7 + (i % 3) * 3 + k * 6;
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = rgba('#e8feff', 0.9 * fade);
        ctx.strokeStyle = rgba(e.color, 0.6 * fade);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.36, s * 0.34);
        ctx.lineTo(-s * 0.36, s * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < 5; i++) {
        const a = a0 + e.arc * (0.2 + i * 0.16);
        const rr = e.radius + 6 + k * 10;
        ctx.fillStyle = rgba('#dffbff', (0.55 - i * 0.08) * fade);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.6 + (i % 2), 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    // 骸骨卫士：亡魂斩（暗绿弧 + 骨屑 + 上升魂火）
    if (e.kind === 'soulSlash') {
      const sweep = Math.min(1, k * 1.5);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba('#1f3a22', 0.5 * fade);
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.92, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(i === 0 ? '#e8ffd4' : e.color, (0.85 - i * 0.22) * fade);
        ctx.lineWidth = 10 - i * 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 4, a0, a1);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const p = 0.15 + i * 0.22;
        if (p > sweep) break;
        const a = a0 + e.arc * p;
        const rr = e.radius + 2 + k * 8;
        ctx.fillStyle = rgba('#efe6cf', 0.8 * fade);
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.rotate(a + i);
        ctx.fillRect(-2.2, -1.2, 5.2, 2.4);
        ctx.restore();
      }
      for (let i = 0; i < 4; i++) {
        const a = a0 + e.arc * (0.25 + i * 0.2);
        const rr = e.radius * (i % 2 ? 0.9 : 0.6);
        ctx.fillStyle = rgba('#b6e08a', (0.5 - i * 0.08) * fade);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr - k * 16, 2.2 + (i % 2), 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    // 霜晶史莱姆：冰晶炸裂（贴地冷雾冲击环 + 六向冰棱）
    if (e.kind === 'frostBurst') {
      const r = e.radius * (0.22 + 0.78 * k);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.58);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
      g.addColorStop(0, rgba(e.color, 0));
      g.addColorStop(0.7, rgba(e.color, 0.3 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba('#e8feff', 0.72 * fade);
      ctx.lineWidth = Math.max(2, 7 * (1 - k));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i * (Math.PI / 3) + 0.26;
        const inner = r * 0.5;
        const outer = r * (1.02 + (i % 2) * 0.18);
        const w = 6 + (i % 3) * 2;
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = rgba('#dffbff', 0.95 * fade);
        ctx.beginPath();
        ctx.moveTo(inner, 0);
        ctx.lineTo(outer, -w);
        ctx.lineTo(outer, w);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgba(e.color, 0.65 * fade);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
      cg.addColorStop(0, rgba('#ffffff', 0.55 * fade * (1 - k)));
      cg.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.5, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }

    // 血翼蝠：暗红翼刃（双弧划过 + 血珠飘散）
    if (e.kind === 'bloodArc') {
      const sweep = Math.min(1, k * 1.6);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.16 * fade);
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.94, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(i === 0 ? '#ffd9dd' : e.color, (0.85 - i * 0.24) * fade);
        ctx.lineWidth = 10 - i * 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 4, a0, a1);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const a = a0 + e.arc * (0.16 + i * 0.15);
        const rr = e.radius + 4 + k * 9;
        ctx.fillStyle = rgba(e.color, (0.6 - i * 0.08) * fade);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.8 + (i % 2), 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    // 紫壳甲虫：甲壳重砸（贴地冲击环 + 紫晶碎屑）
    if (e.kind === 'shellSlam') {
      const r = e.radius * (0.55 + k * 0.6);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.6);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
      g.addColorStop(0, rgba(e.color, 0));
      g.addColorStop(0.68, rgba(e.color, 0.26 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba(e.color, 0.7 * fade);
      ctx.lineWidth = Math.max(2, 8 * (1 - k));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.stroke();
      ctx.strokeStyle = rgba('#f0dcff', 0.5 * fade);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, PI2);
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const a = i * 0.897 + 0.3;
        const rr = r * (0.62 + (i % 2) * 0.34);
        const s = 5 + (i % 3) * 3;
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.rotate(a);
        ctx.fillStyle = rgba('#d8a8f0', 0.85 * fade);
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.5);
        ctx.lineTo(s, 0);
        ctx.lineTo(-s, s * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      return true;
    }

    // 挠：三道错开的爪痕，爪尖带高光，出手极快
    if (e.kind === 'clawArc') {
      const sweep = Math.min(1, k * 2.1);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // 底光：让细爪痕在小体型怪物身上也能看清
      ctx.strokeStyle = rgba(e.color, 0.16 * fade);
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius - 4, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const rr = e.radius - 4 + (i - 1) * 6;
        ctx.strokeStyle = rgba(i === 1 ? '#ffffff' : e.color, (0.9 - i * 0.15) * fade);
        ctx.lineWidth = i === 1 ? 4.2 : 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a0, a1);
        ctx.stroke();
        const hx = Math.cos(a1) * rr;
        const hy = Math.sin(a1) * rr;
        ctx.fillStyle = rgba('#ffffff', 0.75 * fade);
        ctx.beginPath();
        ctx.arc(hx, hy, 2.6 - i * 0.4, 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    // 刀光：宽幅月牙斩，亮刃 + 外圈虚影 + 火星
    if (e.kind === 'bladeArc') {
      const sweep = Math.min(1, k * 1.5);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.15 * fade);
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = rgba(e.color, 0.6 * fade);
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = rgba('#fffdf0', 0.9 * fade);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.28 * fade);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 8, a0 + 0.04, a1);
      ctx.stroke();
      // 刀头亮斑
      const hx = Math.cos(a1) * e.radius;
      const hy = Math.sin(a1) * e.radius;
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 15);
      hg.addColorStop(0, rgba('#ffffff', 0.8 * fade));
      hg.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(hx, hy, 15, 0, PI2);
      ctx.fill();
      // 火星
      for (let i = 0; i < 3; i++) {
        const a = a0 + e.arc * (0.32 + i * 0.2) * sweep;
        const rr = e.radius + 6;
        ctx.strokeStyle = rgba('#ffe9b0', (0.55 - i * 0.12) * fade);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.lineTo(Math.cos(a) * (rr + 10 + k * 8), Math.sin(a) * (rr + 10 + k * 8));
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 抓：两片爪钳对合，内侧拉丝收紧（命中会把玩家拽过来）
    if (e.kind === 'grabArc') {
      const close = Math.min(1, k * 1.5);
      const half = e.arc * 0.5 * (1 - close * 0.35);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // 底光：爪钳轮廓
      ctx.strokeStyle = rgba(e.color, 0.14 * fade);
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, -half, half);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, Math.PI - half, Math.PI + half);
      ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.strokeStyle = rgba(e.color, 0.72 * fade);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, s > 0 ? -half : Math.PI - half, s > 0 ? half : Math.PI + half);
        ctx.stroke();
        // 爪钩：弧端向内收
        const ea = s > 0 ? half : Math.PI - half;
        const ex = Math.cos(ea) * e.radius;
        const ey = Math.sin(ea) * e.radius;
        ctx.strokeStyle = rgba('#ffe3cc', 0.85 * fade);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(ea + s * 0.9) * 9, ey + Math.sin(ea + s * 0.9) * 9);
        ctx.stroke();
      }
      // 拉丝：从怪物向外收拢的细线
      for (let i = 0; i < 5; i++) {
        const a = -0.55 + i * 0.27;
        const inner = e.radius * (0.25 + close * 0.15);
        const outer = e.radius * (1.05 - close * 0.25);
        ctx.strokeStyle = rgba(e.color, (0.3 - i * 0.03) * fade);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner * 0.7);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer * 0.7);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 撞：贴地冲击环 + 前方冲撞楔形
    if (e.kind === 'chargeArc') {
      const r = e.radius * (0.45 + k * 0.75);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.62);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
      g.addColorStop(0, rgba(e.color, 0));
      g.addColorStop(0.7, rgba(e.color, 0.24 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba('#fff0d2', 0.75 * fade);
      ctx.lineWidth = Math.max(2, 7 * (1 - k));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.stroke();
      ctx.restore();
      // 冲撞楔形：沿朝向拉出的三道速度线
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const yy = (i - 1) * 9;
        ctx.strokeStyle = rgba(e.color, (0.6 - i * 0.12) * fade);
        ctx.lineWidth = 3 - i * 0.5;
        ctx.beginPath();
        ctx.moveTo(r * 0.5, yy);
        ctx.lineTo(r * 1.25 + k * 12, yy * 0.6);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 扑：落地扬尘环 + 翻起的尘雾
    if (e.kind === 'pounceArc') {
      const r = e.radius * (0.4 + k * 0.6);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.5);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
      g.addColorStop(0, rgba(e.color, 0));
      g.addColorStop(0.72, rgba(e.color, 0.2 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = rgba(e.color, 0.6 * fade);
      ctx.lineWidth = Math.max(2, 6 * (1 - k));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const a = -0.7 + i * 0.7;
        const rr = r * (0.55 + (i % 2) * 0.3);
        const px = e.x + Math.cos(a) * rr;
        const py = e.y + Math.sin(a) * rr * 0.4 - k * 10;
        const pr = 5 + k * 7;
        const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
        pg.addColorStop(0, rgba('#d8c8a8', 0.22 * fade));
        pg.addColorStop(1, rgba('#d8c8a8', 0));
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, PI2);
        ctx.fill();
      }
      return true;
    }

    // 突进拖影：出手瞬间从原位拉到落点的速度带（扑/撞/抓共用）
    if (e.kind === 'dashTrail') {
      const dx = e.x - e.x0;
      const dy = e.y - e.y0;
      const len = Math.hypot(dx, dy);
      if (len < 1) return true;
      ctx.save();
      ctx.translate(e.x0, e.y0);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const lg = ctx.createLinearGradient(0, 0, len, 0);
      lg.addColorStop(0, rgba(e.color, 0));
      lg.addColorStop(1, rgba(e.color, 0.45 * fade));
      ctx.strokeStyle = lg;
      ctx.lineWidth = 14 * fade + 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.28 * fade);
      ctx.lineWidth = 1.6;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(len * 0.15, i * 6 * fade);
        ctx.lineTo(len * (0.9 - Math.abs(i) * 0.15), i * 3.5);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    if (e.kind === 'peaPuff') {
      const r = e.r0 + (e.r1 - e.r0) * k;
      const g = ctx.createRadialGradient(e.x, e.y, r * 0.15, e.x, e.y, r);
      g.addColorStop(0, rgba(e.color, 0.34 * fade));
      g.addColorStop(0.55, rgba(e.color, 0.16 * fade));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, PI2);
      ctx.fill();
      // 孢子小点
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + e.max * 2;
        const rr = r * (0.35 + (i % 3) * 0.18);
        ctx.fillStyle = rgba(e.color, 0.5 * fade);
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr * 0.8, 1.6 + (i % 3), 0, PI2);
        ctx.fill();
      }
      return true;
    }
    if (e.kind === 'muzzle') {
      // 远程开火：枪口闪光 + 火花 + 扩散的烟环
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      const f = Math.max(0, 1 - k * 1.7);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30 * (0.6 + k));
      g.addColorStop(0, rgba('#fffbe8', 0.95 * f));
      g.addColorStop(0.32, rgba(e.color, 0.7 * f));
      g.addColorStop(1, rgba(e.color, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 30 * (0.6 + k), 0, PI2);
      ctx.fill();
      // 枪口火舌
      ctx.fillStyle = rgba('#fff4cf', 0.8 * f);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(22 - k * 4, -3, 34 + k * 10, 0);
      ctx.quadraticCurveTo(22 - k * 4, 3, 0, 6);
      ctx.closePath();
      ctx.fill();
      // 火药火花
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.24 + Math.sin(i * 2.1) * 0.1;
        const len = 12 + k * 30;
        ctx.strokeStyle = rgba(e.color, (0.9 - i * 0.12) * f);
        ctx.lineWidth = 2.6 - i * 0.3;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(5 + Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
      // 延迟的烟圈：柔光而非实心圆
      if (k > 0.25) {
        const sk = (k - 0.25) / 0.75;
        const sx = e.x + Math.cos(e.angle) * (10 + sk * 20);
        const sy = e.y + Math.sin(e.angle) * (10 + sk * 20);
        const sr = 7 + sk * 13;
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        sg.addColorStop(0, rgba('#efe9d8', 0.20 * (1 - sk)));
        sg.addColorStop(1, rgba('#efe9d8', 0));
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, PI2);
        ctx.fill();
      }
      return true;
    }

    // 远程读条：脚下聚能法阵 + 头顶聚能球（专属皮肤由 drawFxSkin 叠加）
    if (e.kind === 'castCharge') {
      const kk = 1 - Math.max(0, e.life) / e.max;
      const ff = Math.max(0, Math.min(1, e.life / e.max));
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      // 地面法阵：两圈反向旋转的弧
      ctx.save();
      ctx.scale(1, 0.5);
      ctx.strokeStyle = rgba(e.color, 0.35 + 0.3 * ff);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (1 - kk * 0.22), kk * 5, kk * 5 + 1.9);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (0.72 - kk * 0.12), -kk * 4.5, -kk * 4.5 + 1.5);
      ctx.stroke();
      ctx.restore();
      // 收束光点
      for (let i = 0; i < 6; i++) {
        const a2 = i * 1.047 + kk * 2.2;
        const rr = e.radius * (1.15 - kk * 0.75);
        ctx.globalAlpha = ff * 0.85;
        ctx.fillStyle = rgba(e.color, ff * 0.9);
        ctx.beginPath();
        ctx.arc(Math.cos(a2) * rr, Math.sin(a2) * rr * 0.45, 2, 0, PI2);
        ctx.fill();
      }
      // 头顶聚能球
      const orb = 2 + kk * 6;
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgba(e.color, 0.4 * ff);
      ctx.beginPath();
      ctx.arc(0, -e.radius * 0.62, orb, 0, PI2);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.7 * ff);
      ctx.beginPath();
      ctx.arc(0, -e.radius * 0.62, orb * 0.55, 0, PI2);
      ctx.fill();
      ctx.restore();
      return true;
    }
    // 横扫：宽幅月牙，弧线更长更厚，前端甩出风压残影
    if (e.kind === 'sweepArc') {
      const sweep = Math.min(1, k * 1.32);
      const a0 = -e.arc / 2;
      const a1 = a0 + e.arc * sweep;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.16 * fade);
      ctx.lineWidth = 30;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.92, a0, a1);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = rgba(i === 0 ? '#fff6e2' : e.color, (0.88 - i * 0.18) * fade);
        ctx.lineWidth = 13 - i * 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius - i * 2.5, a0, a1);
        ctx.stroke();
      }
      // 末端风压：三道向前甩出的弧形残影
      for (let i = 0; i < 3; i++) {
        const a = a1 - i * 0.09;
        const rr = e.radius + i * 7 + k * 8;
        ctx.strokeStyle = rgba(e.color, (0.4 - i * 0.1) * fade);
        ctx.lineWidth = 4 - i;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a - 0.34, a + 0.06);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 连击爪：三道平行裂口，第二段叠一条交叉斩痕
    if (e.kind === 'rendArc') {
      const len = e.radius * (0.5 + 0.6 * Math.min(1, k * 1.45));
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const off = i * e.radius * 0.12;
        const ex = len * (0.92 + (i === 0 ? 0.12 : 0));
        ctx.strokeStyle = rgba(e.color, 0.32 * fade);
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(e.radius * 0.18, off);
        ctx.quadraticCurveTo(len * 0.55, off - i * 4, ex, off * 0.55);
        ctx.stroke();
        ctx.strokeStyle = rgba(i === 0 ? '#fff4e4' : '#ffffff', (0.8 - Math.abs(i) * 0.2) * fade);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(e.radius * 0.2, off);
        ctx.quadraticCurveTo(len * 0.55, off - i * 4, ex, off * 0.55);
        ctx.stroke();
      }
      if (k > 0.28) {
        const kk = Math.min(1, (k - 0.28) / 0.5);
        ctx.strokeStyle = rgba(e.color, 0.55 * fade * kk);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(len * 0.2, -e.radius * 0.26);
        ctx.lineTo(len * 0.95, e.radius * 0.22);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 突刺：狭长枪芒 + 速度线 + 尖端贯穿闪光
    if (e.kind === 'thrustArc') {
      const L = e.radius * (1.0 + 0.35 * Math.min(1, k * 2));
      const w = 6 * (1 - k * 0.35);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.fillStyle = rgba(e.color, 0.42 * fade);
      ctx.beginPath();
      ctx.moveTo(e.radius * 0.2, -w);
      ctx.lineTo(L, -1.4);
      ctx.lineTo(L + 12, 0);
      ctx.lineTo(L, 1.4);
      ctx.lineTo(e.radius * 0.2, w);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.75 * fade);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(e.radius * 0.25, 0);
      ctx.lineTo(L + 8, 0);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 6.5;
        const st = e.radius * (0.15 + i * 0.12);
        const en = L * (0.72 - Math.abs(i - 1) * 0.14);
        ctx.strokeStyle = rgba(e.color, (0.6 - Math.abs(i - 1) * 0.16) * fade);
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(st, off);
        ctx.lineTo(en, off * 0.7);
        ctx.stroke();
      }
      if (k > 0.15) {
        const fg = ctx.createRadialGradient(L + 6, 0, 0, L + 6, 0, 18);
        fg.addColorStop(0, rgba('#ffffff', 0.7 * fade));
        fg.addColorStop(1, rgba(e.color, 0));
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(L + 6, 0, 18, 0, PI2);
        ctx.fill();
      }
      ctx.restore();
      return true;
    }

    // 旋斩：一整圈刀环 + 两道反向飞旋的月牙
    if (e.kind === 'spinArc') {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(e.color, 0.2 * fade);
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.9, 0, PI2);
      ctx.stroke();
      for (let s = -1; s <= 1; s += 2) {
        const start = e.angle + s * (k * 5.2);
        ctx.strokeStyle = rgba(e.color, 0.75 * fade);
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * (0.82 + s * 0.06), start, start + 2.0);
        ctx.stroke();
        ctx.strokeStyle = rgba('#fff2e0', 0.55 * fade);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * (0.82 + s * 0.06), start, start + 2.0);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const a = e.angle + i * PI2 / 8 + k * 1.4;
        const r0 = e.radius * 0.6;
        const r1 = e.radius * (0.94 + (i % 2) * 0.12);
        ctx.strokeStyle = rgba(e.color, 0.5 * fade);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }

    // 震地：贴地扩散的椭圆冲击环 + 放射裂缝 + 迸溅碎石
    if (e.kind === 'slamShock') {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(1, 0.52);
      ctx.globalCompositeOperation = 'lighter';
      const R = e.radius * (0.3 + k * 1.05);
      for (let j = 0; j < 3; j++) {
        const rr = R * (0.62 + j * 0.22);
        ctx.strokeStyle = rgba(e.color, (0.45 - j * 0.12) * fade);
        ctx.lineWidth = 5 - j * 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, PI2);
        ctx.stroke();
      }
      // 放射裂缝：三段折线，越靠外越细
      for (let i = 0; i < 10; i++) {
        const a = i * PI2 / 10 + 0.4;
        ctx.strokeStyle = rgba(e.color, 0.5 * fade);
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.14, Math.sin(a) * R * 0.14);
        ctx.lineTo(Math.cos(a + 0.07) * R * 0.52, Math.sin(a + 0.07) * R * 0.52);
        ctx.lineTo(Math.cos(a - 0.05) * R * (0.84 + k * 0.2), Math.sin(a - 0.05) * R * (0.84 + k * 0.2));
        ctx.stroke();
      }
      // 中心冲击闪光
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.5);
      cg.addColorStop(0, rgba('#ffffff', 0.5 * fade));
      cg.addColorStop(0.4, rgba(e.color, 0.28 * fade));
      cg.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.5, 0, PI2);
      ctx.fill();
      // 碎石：从中心向外抛出的方块
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + 0.3;
        const rr = R * (0.35 + k * 0.7);
        const s = 2.2 + (i % 3) * 1.4;
        ctx.fillStyle = rgba('#e6dcc6', (0.55 - k * 0.35) * fade);
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.rotate(a + k * 3);
        ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
        ctx.restore();
      }
      ctx.restore();
      return true;
    }

    return false;
  }

  // 专属特效皮肤：每个小怪在招式形状之上叠一层主题碎屑。
  // 位置用固定哈希生成，寿命内不抖动；全部是纯色小图形，不做渐变/shadowBlur。
  function bitRand(i, s) {
    const v = Math.sin((i + 1) * 127.1 + s * 311.7) * 43758.5453;
    return v - Math.floor(v);
  }

  function drawFxSkin(ctx, e) {
    const skin = e.skin;
    if (!skin) return;
    const fade = Math.max(0, Math.min(1, e.life / e.max));
    if (fade <= 0) return;
    const k = 1 - fade;
    const bits = skin.bits;
    const color = skin.color || e.color || '#ffffff';
    const n = skin.n || 8;
    const radius = e.radius || 36;
    const arc = e.arc || 1.4;
    const ang0 = e.angle != null ? e.angle : 0;
    const cx = e.x, cy = e.y;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const r1 = bitRand(i, 1);
      const r2 = bitRand(i, 2);
      const r3 = bitRand(i, 3);
      const ang = ang0 + (r1 - 0.5) * arc * 1.2;
      const dist = radius * (0.3 + r2 * 0.85) * (0.45 + k * 0.9);
      let px = cx + Math.cos(ang) * dist;
      let py = cy + Math.sin(ang) * dist * 0.75;
      const a = fade * (0.5 + r3 * 0.5);
      // 各主题的飘动差异：火星/灵魂上飘，水与碎屑下坠
      if (bits === 'ember' || bits === 'flame' || bits === 'soul' || bits === 'spore') {
        py -= k * (10 + r3 * 22);
      } else if (bits === 'mist' || bits === 'toxin') {
        py -= k * 12;
      } else if (bits === 'water' || bits === 'mucus' || bits === 'blood') {
        py += k * k * (10 + r3 * 16);
      } else if (bits === 'coin' || bits === 'shell' || bits === 'bone' || bits === 'wool') {
        py += k * k * (14 + r3 * 14);
      } else if (bits === 'sand' || bits === 'ink' || bits === 'rock') {
        py += k * k * (12 + r3 * 14);
      } else if (bits === 'bubble' || bits === 'holy' || bits === 'void') {
        py -= k * (14 + r3 * 18);
      } else if (bits === 'crystal') {
        px += Math.cos(ang) * k * 12;
        py += Math.sin(ang) * k * 8 - k * 4;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      switch (bits) {
        case 'blood': {
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - Math.cos(ang) * (4 + r1 * 5), py - Math.sin(ang) * (4 + r1 * 5));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, py, 1.4 + r2 * 1.2, 0, PI2);
          ctx.fill();
          break;
        }
        case 'bone': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang + r1 * 2);
          ctx.fillRect(-1.7, -1.7, 3.4, 3.4);
          ctx.restore();
          break;
        }
        case 'spore': {
          ctx.globalAlpha = a * 0.4;
          ctx.beginPath();
          ctx.arc(px, py, 3.4 + r2 * 2, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(px, py, 1.2 + r3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'ember': {
          ctx.beginPath();
          ctx.arc(px, py, 1.5 + r3 * 1.4, 0, PI2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + (r1 - 0.5) * 4, py - 5 - r2 * 6);
          ctx.stroke();
          break;
        }
        case 'flame': {
          ctx.beginPath();
          ctx.moveTo(px, py - 6 - r2 * 4);
          ctx.quadraticCurveTo(px + 3.4, py, px, py + 3);
          ctx.quadraticCurveTo(px - 3.4, py, px, py - 6 - r2 * 4);
          ctx.fill();
          break;
        }
        case 'mucus': {
          ctx.lineWidth = 2.4 - r1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang + 2.6) * (3 + r2 * 4), py + Math.sin(ang + 2.6) * (3 + r2 * 4));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, py, 1.8 + r3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'ice': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(-4 - r1 * 2, 0);
          ctx.lineTo(0, -1.8);
          ctx.lineTo(4 + r1 * 2, 0);
          ctx.lineTo(0, 1.8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'soul': {
          ctx.globalAlpha = a * 0.7;
          ctx.beginPath();
          ctx.arc(px, py, 2 + r2 * 2, 0, PI2);
          ctx.fill();
          break;
        }
        case 'shell': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang + r1 * 1.5);
          ctx.beginPath();
          ctx.moveTo(-3, 1.5);
          ctx.lineTo(3, 1.5);
          ctx.lineTo(0, -3 - r2 * 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'spike': {
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * (7 + r2 * 7), py + Math.sin(ang) * (7 + r2 * 7));
          ctx.stroke();
          break;
        }
        case 'water': {
          ctx.beginPath();
          ctx.arc(px, py, 1.6 + r1 * 1.2, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a * 0.5;
          ctx.beginPath();
          ctx.arc(px - Math.cos(ang) * 4, py - Math.sin(ang) * 4, 1, 0, PI2);
          ctx.fill();
          break;
        }
        case 'afterimage': {
          const span = 0.16 + r1 * 0.12;
          ctx.globalAlpha = a * 0.55;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, dist, ang - span, ang + span);
          ctx.stroke();
          break;
        }
        case 'wool': {
          ctx.globalAlpha = a * 0.85;
          ctx.lineWidth = 1.4;
          const wa = r1 * PI2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(wa) * (4 + r2 * 4), py + Math.sin(wa) * (4 + r2 * 4));
          ctx.stroke();
          break;
        }
        case 'coin': {
          ctx.beginPath();
          ctx.arc(px, py, 2 + r1, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a * 0.6;
          ctx.fillRect(px + 3, py + 3, 2, 2);
          break;
        }
        case 'petal': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang + r1 * 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, 3.4 + r2 * 1.6, 1.7, 0, 0, PI2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'toxin': {
          ctx.beginPath();
          ctx.arc(px, py, 1.8 + r1, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a * 0.5;
          ctx.beginPath();
          ctx.arc(px + (r2 - 0.5) * 6, py - 4 - k * 8, 1 + r3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'mist': {
          ctx.globalAlpha = a * 0.16;
          ctx.beginPath();
          ctx.arc(px, py, 5 + r2 * 4, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a * 0.55;
          ctx.beginPath();
          ctx.arc(px, py, 1.4 + r3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'muzzle': {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * (8 + r1 * 8), py + Math.sin(ang) * (8 + r1 * 8));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px + Math.cos(ang) * 5, py + Math.sin(ang) * 5, 1.4 + r2, 0, PI2);
          ctx.fill();
          break;
        }
        case 'needle': {
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * (9 + r1 * 6), py + Math.sin(ang) * (9 + r1 * 6));
          ctx.stroke();
          break;
        }
        case 'lantern': {
          ctx.globalAlpha = a * 0.7;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(px, py, 3 + r2 * 3, ang - 1.1, ang + 1.1);
          ctx.stroke();
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(px, py, 1.3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'shadow': {
          // 暗影：弧形残片 + 外圈虚光（lighter 下不能画纯黑）
          ctx.globalAlpha = a * 0.75;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, 3 + r2 * 2, ang - 0.9, ang + 0.9);
          ctx.stroke();
          ctx.globalAlpha = a * 0.5;
          ctx.beginPath();
          ctx.arc(px - Math.cos(ang) * 4, py - Math.sin(ang) * 4, 2.2 + r1 * 1.6, 0, PI2);
          ctx.fill();
          break;
        }
        case 'ash': {
          ctx.globalAlpha = a * 0.7;
          ctx.beginPath();
          ctx.arc(px, py, 1.4 + r2 * 1.3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'sand': {
          ctx.globalAlpha = a * 0.75;
          ctx.fillRect(px, py, 1.8 + r1, 1.8 + r2);
          break;
        }
        case 'ink': {
          ctx.globalAlpha = a * 0.72;
          ctx.beginPath();
          ctx.arc(px, py, 2.2 + r2 * 2.2, 0, PI2);
          ctx.fill();
          ctx.globalAlpha = a * 0.35;
          ctx.beginPath();
          ctx.arc(px - Math.cos(ang) * 5, py - 4 - k * 6, 1 + r3, 0, PI2);
          ctx.fill();
          break;
        }
        case 'bubble': {
          ctx.globalAlpha = a * 0.6;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(px, py, 2.4 + r2 * 2.4, 0, PI2);
          ctx.stroke();
          ctx.globalAlpha = a * 0.9;
          ctx.beginPath();
          ctx.arc(px - 1, py - 1, 0.9, 0, PI2);
          ctx.fill();
          break;
        }
        case 'holy': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang + k * 0.8);
          ctx.globalAlpha = a * 0.85;
          ctx.fillRect(-1, -5 - r2 * 3, 2, 10 + r2 * 6);
          ctx.fillRect(-3.5, -2, 7, 2);
          ctx.restore();
          break;
        }
        case 'crystal': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(ang + r1 * 2);
          ctx.beginPath();
          ctx.moveTo(-3 - r2 * 2, 0);
          ctx.lineTo(0, -2);
          ctx.lineTo(3 + r2 * 2, 0);
          ctx.lineTo(0, 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'rock': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(r1 * PI2);
          ctx.beginPath();
          ctx.moveTo(-3, -1.5);
          ctx.lineTo(0, -3 - r2);
          ctx.lineTo(3, -0.5);
          ctx.lineTo(1.5, 2.5);
          ctx.lineTo(-2, 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'void': {
          // 虚空：中空菱形 + 外圈虚光（纯黑在 lighter 下不可见）
          ctx.globalAlpha = a * 0.6;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(px, py - 4 - r2 * 3);
          ctx.lineTo(px + 3, py);
          ctx.lineTo(px, py + 4 + r2 * 3);
          ctx.lineTo(px - 3, py);
          ctx.closePath();
          ctx.stroke();
          ctx.globalAlpha = a * 0.35;
          ctx.beginPath();
          ctx.arc(px, py, 4 + r1 * 3, 0, PI2);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
    }
    ctx.restore();
  }

  function preload(ids) {
    const list = ids && ids.length ? ids : Object.keys(defs);
    for (const id of list) {
      const d = defs[id];
      if (d && d.src) texSource(d.src);
    }
  }

  // 预载进度：已进入缓存的贴图里，完成加载（成功或失败）的数量
  function stats() {
    let total = 0, done = 0;
    for (const k in texCache) {
      total++;
      const s = texCache[k];
      if (s.ready || s.failed) done++;
    }
    return { total, done };
  }

  DG.art.monsters = {
    defs,
    has: (id) => !!defs[id],
    displayHeight,
    draw,
    drawEffect,
    drawFxSkin,
    preload,
    stats
  };
})();


;
/* ==== js/art/terrain-decor.js ==== */
(function () {
  const DG = window.DG;
  DG.art = DG.art || {};

  const INSIDE = 'assets/terrain/props/route-interior-atlas.png';
  const OUTSIDE = 'assets/terrain/props/void-exterior-atlas.png';
  const DEFS = {
    pond: { atlas: 'inside', x: 0, y: 206, w: 354, h: 255, size: [170, 255], ay: 0.62, layer: 'ground' },
    ruinRing: { atlas: 'inside', x: 305, y: 556, w: 277, h: 189, size: [100, 155], ay: 0.8, layer: 'ground' },
    stonePillar: { atlas: 'inside', x: 1103, y: 597, w: 164, h: 223, size: [115, 178], layer: 'prop', solid: 0.24, breakable: true },
    redMushroom: { atlas: 'inside', x: 1585, y: 366, w: 197, h: 191, size: [78, 126], ay: 0.86, layer: 'prop', solid: 0.2, breakable: true },
    violetRock: { atlas: 'inside', x: 1848, y: 358, w: 151, h: 207, size: [110, 172], layer: 'prop', solid: 0.3, breakable: true },
    stoneSlab: { atlas: 'inside', x: 613, y: 338, w: 206, h: 141, size: [70, 112], ay: 0.72, layer: 'ground' },
    corpse: { atlas: 'inside', x: 1107, y: 119, w: 189, h: 190, size: [56, 86], ay: 0.86, layer: 'ground' },
    eggs: { atlas: 'inside', x: 875, y: 394, w: 170, h: 120, size: [40, 62], ay: 0.6, layer: 'ground' },
    grave: { atlas: 'inside', x: 635, y: 566, w: 137, h: 161, size: [85, 132], layer: 'prop', solid: 0.24, breakable: true },
    rockTree: { atlas: 'inside', x: 410, y: 305, w: 139, h: 176, size: [110, 170], layer: 'prop', solid: 0.25, breakable: true },
    driftbone: { atlas: 'inside', x: 896, y: 152, w: 145, h: 111, size: [38, 62], ay: 0.7, layer: 'ground' },
    branch: { atlas: 'inside', x: 552, y: 58, w: 103, h: 159, size: [74, 128], layer: 'prop', solid: 0.14, breakable: true },
    bones: { atlas: 'inside', x: 1573, y: 915, w: 118, h: 81, size: [32, 54], ay: 0.55, layer: 'ground' },
    ribcage: { atlas: 'inside', x: 1362, y: 664, w: 129, h: 86, size: [36, 60], ay: 0.55, layer: 'ground' },
    reeds: { atlas: 'inside', x: 880, y: 651, w: 129, h: 100, size: [34, 58], ay: 0.75, layer: 'ground' },
    // 草丛类：可大量铺撒，全部走地面层（画在角色之下，天然不会踩头）
    grassBush: { atlas: 'inside', x: 288, y: 42, w: 150, h: 100, size: [56, 94], ay: 0.52, layer: 'ground' },
    leafPlant: { atlas: 'inside', x: 1688, y: 58, w: 100, h: 92, size: [44, 76], ay: 0.78, layer: 'ground' },
    dryGrassBig: { atlas: 'inside', x: 872, y: 598, w: 146, h: 128, size: [54, 96], ay: 0.8, layer: 'ground' },
    cattail: { atlas: 'inside', x: 370, y: 898, w: 82, h: 110, size: [38, 68], ay: 0.85, layer: 'ground' },
    deadPlant: { atlas: 'inside', x: 26, y: 6, w: 168, h: 188, size: [64, 104], ay: 0.9, layer: 'ground' },
    // 骨头类：丰富骸骨密度
    bonePile: { atlas: 'inside', x: 1350, y: 320, w: 200, h: 155, size: [50, 92], ay: 0.62, layer: 'ground' },
    bonePileSmall: { atlas: 'inside', x: 1382, y: 170, w: 155, h: 115, size: [40, 72], ay: 0.6, layer: 'ground' },
    graveCross: { atlas: 'inside', x: 1552, y: 68, w: 132, h: 88, size: [46, 78], ay: 0.72, layer: 'ground' },
    boneSkullPile: { atlas: 'inside', x: 1420, y: 890, w: 190, h: 122, size: [46, 84], ay: 0.55, layer: 'ground' },
    voidTreeWide: { atlas: 'outside', x: 472, y: 445, w: 633, h: 406, size: [360, 620] },
    voidTreeBush: { atlas: 'outside', x: 0, y: 523, w: 452, h: 387, size: [300, 510] },
    voidTreeLarge: { atlas: 'outside', x: 554, y: 0, w: 432, h: 321, size: [260, 470] },
    voidTreeFork: { atlas: 'outside', x: 1328, y: 388, w: 316, h: 329, size: [230, 410] },
    voidTreeTall: { atlas: 'outside', x: 1258, y: 19, w: 181, h: 301, size: [190, 350] },
    voidTreeBare: { atlas: 'outside', x: 1505, y: 22, w: 174, h: 291, size: [170, 330] },
    voidStump: { atlas: 'outside', x: 1733, y: 206, w: 148, h: 221, size: [150, 270] },
    voidTrunk: { atlas: 'outside', x: 1714, y: 468, w: 116, h: 190, size: [110, 210] },
    voidGrass: { atlas: 'outside', x: 1037, y: 164, w: 93, h: 180, size: [70, 140] }
  };
  const INSIDE_GROUND = ['stoneSlab', 'corpse', 'eggs', 'driftbone', 'bones', 'ribcage', 'reeds',
    'bonePile', 'bonePileSmall', 'graveCross', 'boneSkullPile'];
  const INSIDE_PROP = ['stonePillar', 'redMushroom', 'violetRock', 'grave', 'rockTree', 'branch'];
  // 骨头类（含尸骸），用于额外的骸骨铺撒，权重靠重复项调节
  const INSIDE_BONE = ['driftbone', 'bones', 'ribcage', 'corpse', 'bonePile', 'bonePileSmall',
    'graveCross', 'boneSkullPile', 'bonePile', 'bones', 'ribcage'];
  // 草丛类：大量投放
  const INSIDE_GRASS = ['grassBush', 'leafPlant', 'dryGrassBig', 'cattail', 'deadPlant',
    'grassBush', 'dryGrassBig', 'leafPlant'];
  const OUTSIDE_IDS = ['voidTreeWide', 'voidTreeBush', 'voidTreeLarge', 'voidTreeFork', 'voidTreeTall', 'voidTreeBare', 'voidStump', 'voidTrunk', 'voidGrass'];
  const images = { inside: null, outside: null };
  const failed = { inside: false, outside: false };
  const loading = { inside: false, outside: false };
  let callbacks = [];

  function flush() {
    const list = callbacks;
    callbacks = [];
    for (const cb of list) cb();
  }
  function loadAtlas(atlas) {
    if (images[atlas] || failed[atlas] || loading[atlas]) return;
    loading[atlas] = true;
    const image = new Image();
    image.onload = () => { images[atlas] = image; loading[atlas] = false; flush(); };
    image.onerror = () => { failed[atlas] = true; loading[atlas] = false; flush(); };
    DG.assets.assign(image, atlas === 'inside' ? INSIDE : OUTSIDE);
  }
  function pick(list, h) { return list[Math.min(list.length - 1, Math.floor(h * list.length))]; }

  DG.art.terrainDecor = {
    def(id) { return DEFS[id]; },
    pickInsideGround(h) { return pick(INSIDE_GROUND, h); },
    pickInsideBone(h) { return pick(INSIDE_BONE, h); },
    pickInsideGrass(h) { return pick(INSIDE_GRASS, h); },
    pickInsideProp(h) { return pick(INSIDE_PROP, h); },
    pickOutside(h) { return pick(OUTSIDE_IDS, h); },
    ready() { return !!(images.inside && images.outside); },
    shardImage(id) {
      const d = DEFS[id];
      return d ? images[d.atlas] : null;
    },
    // 破碎碎片：按图集源矩形裁切绘制，供破坏特效复用
    drawShard(ctx, img, sx, sy, sw, sh, x, y, rot, scale, alpha) {
      if (!img) return;
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      if (scale && scale !== 1) ctx.scale(scale, scale);
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.drawImage(img, sx, sy, sw, sh, -sw * 0.5, -sh * 0.5, sw, sh);
      ctx.restore();
    },
    load(cb) {
      if (cb) callbacks.push(cb);
      loadAtlas('inside');
      loadAtlas('outside');
      if (images.inside && images.outside) flush();
    },
    draw(ctx, item) {
      const d = DEFS[item.id];
      const image = d && images[d.atlas];
      if (!d || !image) return;
      const s = item.s || 1;
      const w = d.w * s, h = d.h * s;
      const ay = d.ay == null ? 1 : d.ay;
      ctx.save();
      ctx.translate(item.x, item.y);
      // 立件落地阴影：把道具“压”在地面上，与角色拉开层次
      if (item.layer === 'prop' && item.zone === 'inside') {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.4, w * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (item.rot) ctx.rotate(item.rot);
      if (item.flip) ctx.scale(-1, 1);
      ctx.globalAlpha = item.alpha == null ? 1 : item.alpha;
      ctx.drawImage(image, d.x, d.y, d.w, d.h, -w * 0.5, -h * ay, w, h);
      ctx.restore();
    }
  };
})();


;
/* ==== js/art/bones.js ==== */
/* 美术 · 死亡骨头：加载骨头图集，按 alpha 连通域自动切成散件 */
(function () {
  const DG = window.DG;
  const SRC = 'assets/fx/bones.png';
  const MIN_AREA = 12;

  const state = {
    ready: false,
    started: false,
    img: null,
    list: []
  };

  // 8 邻接连通域切图：骨头图集是透明底，连通块即独立散件
  function slice(img) {
    const w = img.width, h = img.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const src = g.getImageData(0, 0, w, h).data;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = src[i * 4 + 3] > 16 ? 1 : 0;
    }
    const seen = new Uint8Array(w * h);
    const stack = [];
    const out = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      const pixels = [];
      seen[i] = 1;
      stack.length = 0;
      stack.push(i);
      while (stack.length) {
        const p = stack.pop();
        const x = p % w, y = (p / w) | 0;
        pixels.push(p);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const q = ny * w + nx;
            if (mask[q] && !seen[q]) {
              seen[q] = 1;
              stack.push(q);
            }
          }
        }
      }
      if (pixels.length < MIN_AREA) continue;
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (bw < 4 || bh < 4 || Math.hypot(bw, bh) < 10) continue;
      const bc = document.createElement('canvas');
      bc.width = bw;
      bc.height = bh;
      const bg = bc.getContext('2d');
      const dst = bg.createImageData(bw, bh);
      for (const p of pixels) {
        const x = p % w, y = (p / w) | 0;
        const s = p * 4, d = ((y - y0) * bw + (x - x0)) * 4;
        dst.data[d] = src[s];
        dst.data[d + 1] = src[s + 1];
        dst.data[d + 2] = src[s + 2];
        dst.data[d + 3] = src[s + 3];
      }
      bg.putImageData(dst, 0, 0);
      out.push({ img: bc, w: bw, h: bh, diag: Math.hypot(bw, bh) });
    }
    // 大件在前，方便按体型挑骨
    out.sort((a, b) => b.diag - a.diag);
    state.list = out;
    state.ready = true;
  }

  state.load = function () {
    if (state.started) return;
    state.started = true;
    const img = new Image();
    img.onload = () => {
      state.img = img;
      slice(img);
    };
    img.onerror = () => { state.ready = true; };
    DG.assets.assign(img, SRC);
  };

  DG.art = DG.art || {};
  DG.art.bones = state;
})();


;
/* ==== js/art/preload.js ==== */
/* 美术 · 统一预载：登录阶段就把主城 / 战斗要用的贴图全部下载并烘焙，
   避免点击进入场景后才开始加载，出现黑屏等待 */
(function () {
  const DG = window.DG;
  DG.art = DG.art || {};

  // 超时兜底：个别资源异常时也不让玩家一直卡在加载遮罩上
  const TIMEOUT_MS = 20000;

  const state = {
    started: false,
    ready: false,
    percent: 0,
    total: 0,
    done: 0,
    waiters: []
  };
  let timer = null;
  let timeout = null;
  const heroWaiters = [];
  let heroTimer = null;

  // 角色贴图（野蛮人由头/身体/武器等图片拼装）也要纳入就绪判定，
  // 否则刚进场景时会画出没头的角色
  function heroesReady() {
    const list = DG.art.heroes || {};
    return Object.keys(list).every((id) => {
      const h = list[id];
      return !h || !h.ready || h.ready();
    });
  }

  function checkHeroes() {
    if (!heroesReady()) return;
    if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
    const list = heroWaiters.splice(0);
    list.forEach((fn) => {
      try { fn(); } catch (e) { /* 单个回调失败不影响其它 */ }
    });
  }

  function finish() {
    if (state.ready) return;
    state.ready = true;
    state.percent = 100;
    if (timer) { clearInterval(timer); timer = null; }
    if (timeout) { clearTimeout(timeout); timeout = null; }
    const list = state.waiters;
    state.waiters = [];
    list.forEach((fn) => {
      try { fn(); } catch (e) { /* 单个回调失败不影响其它 */ }
    });
  }

  // 进度来自各美术模块自己的缓存：贴图只会下载一次，这里只统计不重复请求
  function measure() {
    const m = DG.art.monsters && DG.art.monsters.stats ? DG.art.monsters.stats() : { total: 0, done: 0 };
    const b = DG.art.bosses && DG.art.bosses.stats ? DG.art.bosses.stats() : { total: 0, done: 0 };
    const terrain = DG.art.terrainDecor && DG.art.terrainDecor.ready && DG.art.terrainDecor.ready() ? 1 : 0;
    const bones = DG.art.bones && DG.art.bones.ready ? 1 : 0;
    const heroes = heroesReady() ? 1 : 0;
    state.total = m.total + b.total + 3;
    state.done = m.done + b.done + terrain + bones + heroes;
    state.percent = state.total ? Math.min(100, Math.round(state.done / state.total * 100)) : 100;
    return state.done >= state.total;
  }

  function preloadAssets() {
    if (state.started) return;
    state.started = true;

    // 先让登录页完成首帧绘制，再开始下载贴图：
    // 贴图总量约 2MB，若在脚本仍未下载完时就开始拉，会和登录背景抢带宽，
    // 反而让首屏更慢（浏览器对每域名只有 6 个并发连接）。
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(begin, 200)));
  }

  function begin() {
    // 全部小怪贴图（内部按 src 去重，并顺带烘焙暗色调 / 白闪）
    if (DG.art.monsters && DG.art.monsters.preload) DG.art.monsters.preload();
    // 地图内路线装饰与地图外黑域装饰图集
    if (DG.art.terrainDecor && DG.art.terrainDecor.load) DG.art.terrainDecor.load();
    // 死亡骨头图集：提前切片，避免首次击杀时卡顿
    if (DG.art.bones && DG.art.bones.load) DG.art.bones.load();

    if (measure()) { finish(); return; }
    timer = setInterval(() => {
      if (measure()) finish();
    }, 120);
    timeout = setTimeout(finish, TIMEOUT_MS);
  }

  DG.art.preloadAssets = preloadAssets;
  // 首领贴图（含分件，约 50 张、解码也重）推迟到进入副本后再拉：
  // 放在登录页会和首屏抢连接、拖慢进镇；首领通常要打几间房才出现，时间完全够。
  let bossesStarted = false;
  DG.art.preloadBosses = function () {
    if (bossesStarted) return;
    bossesStarted = true;
    if (DG.art.bosses && DG.art.bosses.preload) {
      DG.art.bosses.preload(Object.keys(DG.art.bosses.defs || {}));
    }
  };
  DG.art.assetsReady = () => state.ready;
  DG.art.assetsProgress = () => state.percent;
  DG.art.onAssetsReady = (fn) => {
    if (state.ready) { fn(); return; }
    state.waiters.push(fn);
  };
  DG.art.heroesReady = heroesReady;
  DG.art.onHeroesReady = (fn) => {
    if (heroesReady()) { fn(); return; }
    heroWaiters.push(fn);
    if (!heroTimer) heroTimer = setInterval(checkHeroes, 120);
  };
})();


;
/* ==== js/core/character.js ==== */
/* 角色数据：创建、经验与升级 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  const character = DG.character = {
    xpNeed(level) {
      // 长线曲线：40 级后经验需求明显抬升，配合 80 关卡的等级门槛。
      // 系数 5 让「全清 80 关 + 领完主线」正好落在 55~58 级，等级门槛才有意义
      return Math.round((60 + (level - 1) * 48 + Math.max(0, level - 15) * 26) * 5);
    },

    create(name, clsId) {
      const cls = DG.data.classes[clsId];
      const skills = {};
      skills[cls.autoSkill] = 1;
      cls.skills.forEach(id => { skills[id] = 1; });

      const equipment = {};
      DG.CONFIG.SLOTS.forEach(slot => { equipment[slot.id] = null; });

      const char = {
        id: U.uid(),
        name,
        cls: clsId,
        level: 1,
        xp: 0,
        gold: 0,
        // 技能点：升级（每 3 级 1 点）与主线任务（每 8 关 1 点）共同投放，共 30 点对应 30 个辅助节点
        skillPoints: 0,
        // 旧版技能树点数字段，保留读取兼容，新系统统一使用 skillPoints
        treePoints: 0,
        skills,
        skillTree: {},
        talents: {},
        equipment,
        bag: [],
        // 大仓库：临时装备页收藏进来的物品，容量无上限
        stash: [],
        // 关卡通关记录：解锁下一关的依据
        cleared: {},
        quests: null,
        createdAt: Date.now(),
        lastPlayed: Date.now()
      };

      // 初始武器
      const starter = DG.items.generate(1, {
        rarity: 'normal',
        baseId: cls.starterWeapon
      });
      starter.name = DG.items.baseById[cls.starterWeapon].name;
      char.equipment.weapon = starter;

      if (DG.quests && DG.quests.ensure) DG.quests.ensure(char);
      return char;
    },

    // 返回本次升级获得的新等级数组
    addXp(char, amount) {
      if (amount <= 0) return [];
      const maxLevel = DG.CONFIG.MAX_LEVEL || 60;
      char.xp += amount;
      const gained = [];
      let guard = 0;
      while (char.level < maxLevel && char.xp >= character.xpNeed(char.level) && guard++ < 200) {
        char.xp -= character.xpNeed(char.level);
        char.level++;
        // 每 3 级投放 1 点技能点：3/6/…/60 级共 20 点
        if (char.level % 3 === 0) char.skillPoints++;
        gained.push(char.level);
      }
      if (char.level >= maxLevel) char.xp = Math.min(char.xp, character.xpNeed(maxLevel));
      return gained;
    },

    bagUsed(char) {
      return char.bag.filter(Boolean).length;
    },

    // 存档兼容：旧版本缺少字段时补齐，避免读取时在各处做空值判断
    normalize(char) {
      if (!char || typeof char !== 'object') return char;
      if (!Number.isFinite(char.level) || char.level < 1) char.level = 1;
      if (!Number.isFinite(char.xp) || char.xp < 0) char.xp = 0;
      if (!Number.isFinite(char.gold) || char.gold < 0) char.gold = 0;
      if (!Number.isFinite(char.skillPoints) || char.skillPoints < 0) char.skillPoints = 0;
      if (!Number.isFinite(char.treePoints) || char.treePoints < 0) char.treePoints = 0;
      if (!char.skillTree || typeof char.skillTree !== 'object') char.skillTree = {};
      // 旧版技能树节点（id 已不在新索引中）退还为技能点，避免升级后旧投入被吞掉
      const index = DG.data.skillTreeIndex || {};
      let refund = 0;
      for (const id in char.skillTree) {
        if (char.skillTree[id] && !index[id]) {
          delete char.skillTree[id];
          refund++;
        }
      }
      // 旧版树点数统一折算进技能点池
      if (char.treePoints > 0) {
        refund += char.treePoints;
        char.treePoints = 0;
      }
      if (refund) char.skillPoints += refund;
      if (!char.cleared || typeof char.cleared !== 'object') char.cleared = {};

      if (!char.skills || typeof char.skills !== 'object') char.skills = {};
      const cls = DG.data.classes[char.cls];
      if (cls) {
        [cls.autoSkill, ...cls.skills].forEach(id => {
          if (!Number.isFinite(char.skills[id]) || char.skills[id] < 1) char.skills[id] = 1;
        });
      }

      if (!char.equipment || typeof char.equipment !== 'object') char.equipment = {};
      DG.CONFIG.SLOTS.forEach(slot => {
        if (!(slot.id in char.equipment)) char.equipment[slot.id] = null;
      });
      if (!Array.isArray(char.bag)) char.bag = [];
      if (!Array.isArray(char.stash)) char.stash = [];
      if (DG.talents && DG.talents.ensure) DG.talents.ensure(char);
      if (DG.quests && DG.quests.ensure) DG.quests.ensure(char);
      return char;
    },

    levelProgress(char) {
      const need = character.xpNeed(char.level);
      return U.clamp(char.xp / need, 0, 1);
    }
  };
})();


;
/* ==== js/core/talents.js ==== */
/* 天赋核心：点数计算、前置校验、属性聚合与老存档迁移 */
(function () {
  const DG = window.DG;

  const talent = DG.talents = {};

  // 职业树索引缓存：clsId -> { nodes: { id: { node, branch, index, prevId } } }
  const indexCache = {};

  function buildIndex(clsId) {
    if (indexCache[clsId]) return indexCache[clsId];
    const tree = DG.data.talents[clsId];
    if (!tree) return null;
    const nodes = {};
    tree.branches.forEach(branch => {
      branch.nodes.forEach((node, index) => {
        nodes[node.id] = {
          node,
          branch,
          index,
          prevId: index > 0 ? branch.nodes[index - 1].id : null
        };
      });
    });
    indexCache[clsId] = { tree, nodes };
    return indexCache[clsId];
  }

  // 老存档没有 talents 字段时补一个空对象，不发放也不扣除任何点数
  talent.ensure = function (char) {
    if (!char) return {};
    if (!char.talents || typeof char.talents !== 'object' || Array.isArray(char.talents)) {
      char.talents = {};
    }
    return char.talents;
  };

  talent.treeOf = function (char) {
    return char ? DG.data.talents[char.cls] || null : null;
  };

  talent.indexOf = function (char) {
    return char ? buildIndex(char.cls) : null;
  };

  talent.totalPoints = function (char) {
    if (!char) return 0;
    return Math.max(1, char.level | 0);
  };

  talent.spentPoints = function (char) {
    const t = talent.ensure(char);
    let spent = 0;
    for (const id in t) {
      if (t[id]) spent++;
    }
    return spent;
  };

  talent.availablePoints = function (char) {
    return Math.max(0, talent.totalPoints(char) - talent.spentPoints(char));
  };

  talent.hasNode = function (char, nodeId) {
    return !!talent.ensure(char)[nodeId];
  };

  talent.hasFlag = function (char, flag) {
    return !!talent.mods(char).flags[flag];
  };

  // 返回 { ok, reason }，UI 与投入逻辑共用同一套判断
  talent.canAllocate = function (char, nodeId) {
    const idx = talent.indexOf(char);
    if (!idx) return { ok: false, reason: '职业天赋树不存在' };
    const entry = idx.nodes[nodeId];
    if (!entry) return { ok: false, reason: '天赋节点不存在' };
    if (talent.hasNode(char, nodeId)) return { ok: false, reason: '该天赋已点亮' };
    if (talent.availablePoints(char) <= 0) return { ok: false, reason: '没有可用天赋点' };
    if (char.level < (entry.node.levelReq || 1)) {
      return { ok: false, reason: `需要角色等级 Lv.${entry.node.levelReq}` };
    }
    if (entry.prevId && !talent.hasNode(char, entry.prevId)) {
      const prev = idx.nodes[entry.prevId].node;
      return { ok: false, reason: `需要先点亮「${prev.name}」` };
    }
    return { ok: true, reason: '' };
  };

  talent.allocate = function (char, nodeId) {
    const check = talent.canAllocate(char, nodeId);
    if (!check.ok) return check;
    talent.ensure(char)[nodeId] = 1;
    return { ok: true, reason: '' };
  };

  talent.reset = function (char) {
    talent.ensure(char);
    const refunded = talent.spentPoints(char);
    char.talents = {};
    return refunded;
  };

  // 聚合所有已点亮节点：通用属性 / 行为标记 / 伤害标签 / 技能专属修正
  talent.mods = function (char) {
    const res = { stats: {}, flags: {}, tags: {}, skills: {} };
    if (!char) return res;
    const idx = talent.indexOf(char);
    if (!idx) return res;
    const owned = talent.ensure(char);

    const add = (obj, k, v) => { obj[k] = (obj[k] || 0) + v; };

    for (const id in owned) {
      if (!owned[id]) continue;
      const entry = idx.nodes[id];
      if (!entry) continue;
      const node = entry.node;

      if (node.mods) {
        for (const k in node.mods) add(res.stats, k, node.mods[k]);
      }
      if (node.tags) {
        for (const k in node.tags) add(res.tags, k, node.tags[k]);
      }
      if (node.flag) {
        res.flags[node.flag] = true;
      }
      if (node.skill) {
        (node.skill.ids || []).forEach(skillId => {
          const target = res.skills[skillId] || (res.skills[skillId] = {});
          for (const k in node.skill) {
            if (k === 'ids') continue;
            add(target, k, node.skill[k]);
          }
        });
      }
    }
    // 技能树与装备流派词缀：并入同一份修正，战斗层无需区分来源
    if (DG.skillTree) {
      DG.skillTree.mergeInto(res, char);
      DG.skillTree.mergeGear(res, char);
    }
    return res;
  };

  talent.skillTags = function (skillId) {
    return (DG.data.skillTags && DG.data.skillTags[skillId]) || [];
  };

  talent.skillMod = function (char, skillId, key) {
    const skills = talent.mods(char).skills;
    return (skills[skillId] && skills[skillId][key]) || 0;
  };

  // UI 用：节点状态与未满足原因
  talent.nodeState = function (char, nodeId) {
    if (talent.hasNode(char, nodeId)) return { state: 'on', reason: '已点亮' };
    const check = talent.canAllocate(char, nodeId);
    if (check.ok) return { state: 'can', reason: '' };
    return { state: 'locked', reason: check.reason };
  };
})();


;
/* ==== js/core/skill-tree.js ==== */
/* 技能树：技能点分配、前置校验与旧数据兼容 */
(function () {
  const DG = window.DG;

  const ST = DG.skillTree = {
    // 当前职业的技能树（只有野蛮人配置了五技能树）
    treesFor(char) {
      return (char && DG.data.skillTrees[char.cls]) || [];
    },

    treeById(char, id) {
      return ST.treesFor(char).find(t => t.id === id) || null;
    },

    has(char, nodeId) {
      return !!(char && char.skillTree && char.skillTree[nodeId]);
    },

    // 技能点与升级/任务共用同一池：char.skillPoints
    points(char) {
      return (char && char.skillPoints) || 0;
    },

    treeUnlocked(char, tree) {
      if (!char || !tree) return false;
      return char.level >= (tree.unlock || 1);
    },

    // 返回 { ok, reason }
    canAllocate(char, nodeId) {
      if (!char) return { ok: false, reason: '无角色' };
      const info = DG.data.skillTreeIndex[nodeId];
      if (!info) return { ok: false, reason: '节点不存在' };
      if (info.cls !== char.cls) return { ok: false, reason: '职业不符' };
      if (ST.has(char, nodeId)) return { ok: false, reason: '已激活' };
      if (!ST.treeUnlocked(char, info.tree)) {
        return { ok: false, reason: `${info.tree.name} ${info.tree.unlock} 级解锁` };
      }
      if (info.parent && !ST.has(char, info.parent.id)) {
        return { ok: false, reason: `需要先激活「${info.parent.name}」` };
      }
      if (ST.points(char) < 1) return { ok: false, reason: '技能点不足' };
      return { ok: true, reason: '' };
    },

    allocate(char, nodeId) {
      const check = ST.canAllocate(char, nodeId);
      if (!check.ok) return check;
      char.skillTree = char.skillTree || {};
      char.skillTree[nodeId] = 1;
      char.skillPoints = Math.max(0, (char.skillPoints || 0) - 1);
      return { ok: true, reason: '' };
    },

    // 重置整棵技能树：返还该树已投入的点数（界面未提供入口，保留给调试/后续扩展）
    resetTree(char, tree) {
      if (!char || !tree) return 0;
      let refund = 0;
      tree.nodes.forEach(node => {
        if (ST.has(char, node.id)) {
          delete char.skillTree[node.id];
          refund++;
        }
      });
      char.skillPoints = (char.skillPoints || 0) + refund;
      return refund;
    },

    spent(char) {
      let n = 0;
      const owned = (char && char.skillTree) || {};
      for (const id in owned) if (owned[id] && DG.data.skillTreeIndex[id]) n++;
      return n;
    },

    spentInTree(char, tree) {
      if (!char || !tree) return 0;
      let n = 0;
      tree.nodes.forEach(node => { if (ST.has(char, node.id)) n++; });
      return n;
    },

    spentInGroup(char, group) {
      if (!char || !group) return 0;
      return group.trees.reduce((sum, id) => {
        const tree = ST.treeById(char, id);
        return sum + (tree ? ST.spentInTree(char, tree) : 0);
      }, 0);
    },

    // 辅助节点目前只提供激活状态与效果说明，不注入战斗数值
    mods() {
      return { stats: {}, skills: {} };
    },

    mergeInto(res) {
      return res;
    },

    // 装备上的流派词缀：skill.<技能>.<字段>
    mergeGear(res, char) {
      if (!char || !res || !DG.items) return res;
      const equipped = char.equipment || {};
      const add = (obj, k, v) => { obj[k] = (obj[k] || 0) + v; };
      for (const slot in equipped) {
        const item = equipped[slot];
        if (!item) continue;
        const s = DG.items.statsOf(item);
        for (const key in s) {
          const parsed = DG.items.skillStat(key);
          if (!parsed) continue;
          const target = res.skills[parsed.id] || (res.skills[parsed.id] = {});
          add(target, parsed.field, s[key]);
        }
      }
      return res;
    }
  };
})();


;
/* ==== js/core/quests.js ==== */
/* 任务系统：主线进度、悬赏进度、奖励结算 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  function bountyFromTemplate(char, existing) {
    // 尽量刷出不同类型的悬赏，避免三格全是「清剿委托」
    const used = {};
    (existing || []).forEach(q => { if (q) used[q.key] = true; });
    const list = DG.data.quests.bountyTemplates;
    const fresh = list.filter(t => !used[t.key]);
    const tmpl = U.pick(fresh.length ? fresh : list);
    const need = U.randInt(tmpl.min, tmpl.max);
    return {
      key: tmpl.key,
      type: tmpl.type,
      name: tmpl.name,
      need,
      have: 0,
      done: false
    };
  }

  function textOf(q) {
    const tmpl = DG.data.quests.bountyTemplates.find(t => t.key === q.key);
    return tmpl ? tmpl.desc.replace('{n}', q.need) : '';
  }

  const quests = DG.quests = {
    ensure(char) {
      if (!char) return null;
      if (!char.quests || typeof char.quests !== 'object') {
        char.quests = { main: 0, bounties: [] };
      }
      if (!Number.isFinite(char.quests.main)) char.quests.main = 0;
      if (!Array.isArray(char.quests.bounties)) char.quests.bounties = [];
      while (char.quests.bounties.length < 3) char.quests.bounties.push(bountyFromTemplate(char, char.quests.bounties));
      char.quests.bounties.forEach(q => {
        if (!Number.isFinite(q.need) || q.need <= 0) q.need = 5;
        if (!Number.isFinite(q.have)) q.have = 0;
        q.done = q.have >= q.need;
      });
      return char.quests;
    },

    // 当前主线（全部完成返回 null）
    mainQuest(char) {
      const qs = quests.ensure(char);
      return DG.data.quests.main[qs.main] || null;
    },

    mainDone(char) {
      const qs = quests.ensure(char);
      return qs.main >= DG.data.quests.main.length;
    },

    mainReady(char) {
      const q = quests.mainQuest(char);
      if (!q) return false;
      return !!(char.cleared && char.cleared[q.stage]);
    },

    bountyText(q) {
      return textOf(q);
    },

    // 战斗事件：type = kill | elite | boss | loot | clear
    progress(char, type, amount) {
      const qs = quests.ensure(char);
      const n = amount == null ? 1 : amount;
      let changed = false;
      qs.bounties.forEach(q => {
        if (q.type !== type) return;
        if (q.have >= q.need) return;
        q.have = Math.min(q.need, q.have + n);
        q.done = q.have >= q.need;
        changed = true;
      });
      return changed;
    },

    // 发放奖励，返回结算摘要
    grant(char, reward) {
      if (!char || !reward) return null;
      const out = { gold: 0, xp: 0, treePoints: 0, skillPoints: 0, levels: [], item: null };
      if (reward.gold) { char.gold += reward.gold; out.gold = reward.gold; }
      if (reward.xp) {
        out.levels = DG.character.addXp(char, reward.xp);
        out.xp = reward.xp;
      }
      if (reward.treePoints) {
        char.treePoints = (char.treePoints || 0) + reward.treePoints;
        out.treePoints = reward.treePoints;
      }
      if (reward.skillPoints) {
        char.skillPoints += reward.skillPoints;
        out.skillPoints = reward.skillPoints;
      }
      if (reward.item) {
        if (char.bag.length < DG.CONFIG.BAG_SIZE) {
          char.bag.push(reward.item);
          out.item = reward.item;
        }
      }
      return out;
    },

    claimMain(char) {
      if (!quests.mainReady(char)) return { ok: false, reason: '主线尚未达成' };
      const q = quests.mainQuest(char);
      // 章节末尾会附带稀有装备，背包没有空位时先不领取，避免奖励被静默丢弃
      if (q.index % 5 === 0 && DG.character.bagUsed(char) >= DG.CONFIG.BAG_SIZE) {
        return { ok: false, reason: '背包已满，清理后再领取章节奖励' };
      }
      const reward = Object.assign({}, q.reward);
      // 每个章节末尾的主线额外给一件稀有装备
      if (q.index % 5 === 0) {
        const def = DG.data.dungeonById[q.stage];
        reward.item = DG.items.generate(def ? def.ilvl + 1 : 1, { minRarity: 'rare', cls: char.cls });
      }
      const got = quests.grant(char, reward);
      quests.ensure(char).main += 1;
      return { ok: true, quest: q, got };
    },

    claimBounty(char, index) {
      const qs = quests.ensure(char);
      const q = qs.bounties[index];
      if (!q) return { ok: false, reason: '任务不存在' };
      if (q.have < q.need) return { ok: false, reason: '任务尚未完成' };
      const tmpl = DG.data.quests.bountyTemplates.find(t => t.key === q.key);
      const reward = DG.data.quests.bountyReward(tmpl || {}, char.level);
      const got = quests.grant(char, reward);
      // 完成即补充新悬赏，保持三格始终有内容，且尽量不与已完成的任务同类型
      qs.bounties[index] = bountyFromTemplate(char, qs.bounties);
      return { ok: true, quest: q, got };
    },

    // 可领取数量，主城入口做红点提示
    claimableCount(char) {
      const qs = quests.ensure(char);
      let n = quests.mainReady(char) ? 1 : 0;
      qs.bounties.forEach(q => { if (q.have >= q.need) n++; });
      return n;
    },

    // 关卡通关：记录进度并推进 clear 类悬赏
    onStageClear(char, stageId) {
      if (!char) return;
      char.cleared = char.cleared || {};
      char.cleared[stageId] = true;
      quests.progress(char, 'clear', 1);
    }
  };
})();


;
/* ==== js/core/stats.js ==== */
/* 面板属性计算：职业基础 + 等级成长 + 装备词缀 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  DG.stats = {
    compute(char) {
      const cls = DG.data.classes[char.cls];
      const base = cls.base;
      const bucket = {};
      const add = (k, v) => { bucket[k] = (bucket[k] || 0) + v; };

      for (const slot in char.equipment) {
        const item = char.equipment[slot];
        if (!item) continue;
        const s = DG.items.statsOf(item);
        for (const k in s) add(k, s[k]);
      }

      // 天赋加成与装备词缀同源加算，不同类之间保持原有乘算关系
      const tm = DG.talents.mods(char);
      const ts = tm.stats;

      const lv = char.level;
      const maxHp = (base.hp + (lv - 1) * 14 + (bucket.hp || 0)) * (1 + (ts.maxHpPct || 0) / 100);
      const atkFlat = base.atk + (lv - 1) * 1.7 + (bucket.atk || 0);
      const atk = atkFlat * (1 + ((bucket.atkPct || 0) + (ts.atkPct || 0)) / 100);
      const armor = (base.armor + (lv - 1) * 1.2 + (bucket.armor || 0)) * (1 + (ts.armorPct || 0) / 100);
      const crit = Math.min(75, base.crit + (bucket.crit || 0) + (ts.crit || 0));
      const critDmg = base.critDmg + (bucket.critDmg || 0) + (ts.critDmg || 0);
      const moveSpeed = base.moveSpeed * (1 + ((bucket.moveSpeed || 0) + (ts.moveSpeedPct || 0)) / 100);
      const attackSpeed = Math.min(3.2, base.attackSpeed * (1 + ((bucket.attackSpeed || 0) + (ts.attackSpeedPct || 0)) / 100));
      const hpRegen = base.hpRegen + (bucket.hpRegen || 0) + (ts.hpRegen || 0);

      const power = Math.round(
        atk * 3.2 + maxHp * 0.6 + armor * 2.2 + crit * 4.5 +
        critDmg * 0.7 + moveSpeed * 0.6 + attackSpeed * 8 + hpRegen * 3
      );

      return {
        maxHp: Math.round(maxHp),
        atk: U.round(atk, 1),
        armor: Math.round(armor),
        crit: U.round(crit, 1),
        critDmg: Math.round(critDmg),
        moveSpeed: Math.round(moveSpeed),
        attackSpeed: U.round(attackSpeed, 2),
        hpRegen: U.round(hpRegen, 1),
        power,
        bucket,
        talents: tm
      };
    },

    // 护甲减伤百分比
    mitigation(armor) {
      return Math.round((armor / (armor + 100)) * 1000) / 10;
    }
  };
})();


;
/* ==== js/core/loot.js ==== */
/* 掉落规则 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  DG.loot = {
    // cls 用于只掉落本职业可用的流派词缀
    roll(monster, ilvl, cls) {
      const res = { items: [], orb: false, rune: false };
      const opts = { cls };

      if (monster.boss) {
        res.items.push(DG.items.generate(ilvl, Object.assign({ minRarity: 'magic' }, opts)));
        res.items.push(DG.items.generate(ilvl + 1, opts));
        if (U.chance(0.65)) res.items.push(DG.items.generate(ilvl + 1, Object.assign({ minRarity: 'rare' }, opts)));
        res.orb = U.chance(0.8);
        res.rune = U.chance(0.55);
        return res;
      }

      const itemChance = monster.elite ? 0.7 : 0.16;
      if (U.chance(itemChance)) {
        res.items.push(DG.items.generate(ilvl + (monster.elite ? 1 : 0), opts));
      }
      res.orb = U.chance(monster.elite ? 0.4 : 0.18);
      res.rune = U.chance(monster.elite ? 0.12 : 0.025);
      return res;
    }
  };
})();


;
/* ==== js/core/wakelock.js ==== */
/* 屏幕常亮：进入游戏后申请 Wake Lock，避免手机游玩时自动息屏/锁屏 */
(function () {
  const DG = window.DG;
  let sentinel = null;
  let wanted = false;

  function canLock() {
    return !!(navigator.wakeLock && navigator.wakeLock.request);
  }

  function acquire() {
    if (!wanted || sentinel || !canLock()) return;
    // 页面不可见时系统必然拒绝申请，等回到前台再由 visibilitychange 触发
    if (document.visibilityState !== 'visible') return;
    let req;
    try {
      req = navigator.wakeLock.request('screen');
    } catch (e) {
      return;
    }
    if (!req || !req.then) return;
    req.then((s) => {
      sentinel = s;
      // 系统在切后台、省电模式等情况下会主动释放，这里同步状态以便重新申请
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null;
        if (wanted) setTimeout(acquire, 300);
      });
    }).catch(() => {
      // 浏览器不支持或被省电策略拒绝时静默降级，不影响游戏
      sentinel = null;
    });
  }

  DG.wake = {
    // 进入主城 / 副本等实际游玩界面时调用
    enable() {
      wanted = true;
      acquire();
    },
    // 回到登录页 / 选角页时释放，避免不必要的电量消耗
    disable() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      if (s) {
        try { s.release(); } catch (e) { /* 已释放则忽略 */ }
      }
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      acquire();
    } else {
      // 隐藏期间系统会自动释放；这里只清引用，回到前台再重新申请
      sentinel = null;
    }
  });
})();


;
/* ==== js/ui/base.js ==== */
/* UI 基座：提示、通用弹窗、确认框与物品展示 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  ui.toast = function (msg, type) {
    const wrap = document.getElementById('toast-wrap');
    if (!wrap) return;
    // 同文案只保留一条，并限制同屏数量，避免提示堆叠遮挡界面
    Array.from(wrap.children).forEach(t => {
      if (t.textContent === msg) t.remove();
    });
    // 弹窗内一次只显示一条，保证不叠压弹窗内容
    const overModal = wrap.classList.contains('over-modal');
    if (overModal) wrap.replaceChildren();
    while (wrap.children.length >= (overModal ? 1 : 3)) wrap.removeChild(wrap.firstChild);
    const t = U.el('div', 'toast' + (type ? ' ' + type : ''));
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('fade'), 2100);
    setTimeout(() => t.remove(), 2550);
  };

  ui.modal = function (opts) {
    const root = DG.game.ui;
    const mask = U.el('div', 'modal-mask');
    const modal = U.el('div', 'modal');
    // 统一使用公用二级弹框宽度（636），各面板不再各自指定宽度，避免九宫缎带被横向压缩

    const head = U.el('div', 'modal-head');
    const titleWrap = U.el('div', '',
      `<h3>${U.escapeHtml(opts.title || '')}</h3>` +
      (opts.subtitle ? `<div class="sub">${U.escapeHtml(opts.subtitle)}</div>` : '')
    );
    const closeBtn = U.el('button', 'modal-close', '');
    head.appendChild(titleWrap);

    const body = U.el('div', 'modal-body');
    if (opts.body) body.appendChild(opts.body);

    modal.appendChild(head);
    modal.appendChild(body);
    // 关闭按钮固定挂在弹框本体上，不随标题/内容布局变化，保证所有二级弹框位置一致
    if (opts.dismissible !== false) modal.appendChild(closeBtn);

    let footEl = null;
    const ensureFoot = () => {
      if (!footEl) {
        footEl = U.el('div', 'modal-foot');
        if (typeof opts.footer === 'string') footEl.innerHTML = opts.footer;
        else if (opts.footer && opts.footer.nodeType) footEl.appendChild(opts.footer);
        modal.appendChild(footEl);
      }
      return footEl;
    };
    if (opts.footer !== undefined && opts.footer !== null) ensureFoot();

    mask.appendChild(modal);
    root.appendChild(mask);
    if (DG.audio) DG.audio.play('uiOpen', { vol: 0.5, gap: 0.12 });
    const toastWrap = document.getElementById('toast-wrap');
    if (toastWrap) {
      // 弹窗出现时清空旧提示并切换到顶部位置，避免提示压在弹窗标题上
      toastWrap.replaceChildren();
      toastWrap.classList.add('over-modal');
    }

    const api = {
      mask, modal, body,
      get foot() { return ensureFoot(); },
      close() {
        if (mask.parentNode) mask.remove();
        if (DG.audio) DG.audio.play('uiClose', { vol: 0.45, gap: 0.12 });
        if (toastWrap && !document.querySelector('.modal-mask')) {
          toastWrap.classList.remove('over-modal');
        }
        if (opts.onClose) opts.onClose();
      },
      setTitle(t) {
        titleWrap.querySelector('h3').textContent = t;
      }
    };

    closeBtn.addEventListener('click', api.close);
    if (opts.dismissible !== false) {
      mask.addEventListener('mousedown', (e) => {
        if (e.target === mask) api.close();
      });
    }
    return api;
  };

  ui.confirm = function (msg, onYes, opts) {
    opts = opts || {};
    const body = U.el('div', '', `<div class="confirm-text">${U.escapeHtml(msg)}</div>`);
    const modal = ui.modal({
      title: opts.title || '确认',
      body,
      width: 380,
      footer: '',
      dismissible: true
    });
    const btnRow = U.el('div', 'confirm-actions');
    const no = U.el('button', 'btn', '取消');
    const yes = U.el('button', 'btn ' + (opts.danger ? 'danger' : 'primary'), opts.okText || '确定');
    btnRow.appendChild(no);
    btnRow.appendChild(yes);
    modal.foot.appendChild(btnRow);

    no.addEventListener('click', modal.close);
    yes.addEventListener('click', () => {
      modal.close();
      if (onYes) onYes();
    });
    return modal;
  };

  // 底部战斗条：主城与副本共用同一套结构、图标与等级牌，
  // 只通过属性名与技能槽内容区分场景，避免两边各写一份逐渐跑偏。
  ui.combatBarHtml = function (o) {
    // 装备 / 技能图标统一带火星升腾特效（纯 CSS transform / opacity，无滤镜开销）
    const embers = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
    const medal = (src, glyph, attrs, label) =>
      `<button class="combat-medal" ${attrs} aria-label="${label}系统">` +
      (src ? `<img src="${src}" alt="">` : `<span class="medal-glyph">${glyph}</span>`) +
      `<span class="medal-fire" aria-hidden="true">${embers}</span>` +
      `<span class="medal-label" data-label="${label}">${label}</span>` +
      `</button>`;
    return `<div class="${o.barClass || 'combat-bar'}">` +
      medal(o.equipIcon, '装', o.equipAttrs, '装备') +
      `<button class="lvl-badge" ${o.badgeAttrs} aria-label="角色信息">${o.level}</button>` +
      `<div class="combat-strip"><div class="strip-slots">${o.slotsHtml}</div></div>` +
      medal(o.skillIcon, '技', o.skillAttrs, '技能') +
      `<div class="combat-exp exp-bar">${o.expFill}` +
      `<span class="exp-text" data-xp-num>${o.expText}</span></div>` +
      `</div>`;
  };

  // 公用道具框：白 / 蓝 / 紫 / 套装 / 暗金，套装与暗金另有远古框
  const FRAME_DIR = 'assets/ui/items/frames/';
  const FRAMES = {
    normal: 'frame-normal.png',
    magic: 'frame-magic.png',
    rare: 'frame-rare.png',
    set: 'frame-set.png',
    legend: 'frame-legend.png'
  };
  const FRAMES_ANCIENT = {
    set: 'frame-set-ancient.png',
    legend: 'frame-legend-ancient.png'
  };
  ui.itemFrameSrc = function (item) {
    const rarity = item && item.rarity;
    const ancient = item && item.ancient && FRAMES_ANCIENT[rarity];
    return FRAME_DIR + (ancient || FRAMES[rarity] || FRAMES.normal);
  };

  ui.itemCell = function (item, opts) {
    opts = opts || {};
    const cell = U.el('div', 'item-cell');
    if (!item) {
      cell.classList.add('empty');
      if (opts.emptyGlyph) cell.innerHTML = `<span class="glyph">${U.escapeHtml(opts.emptyGlyph)}</span>`;
      return cell;
    }
    cell.classList.add('r-' + item.rarity);
    if (opts.selected) cell.classList.add('selected');
    const slot = DG.items.slotInfo(item.slot);
    cell.innerHTML =
      `<span class="glyph">${U.escapeHtml(slot.glyph)}</span>` +
      (opts.showLevel !== false ? `<span class="lvl">${item.ilvl}</span>` : '') +
      (opts.equipped ? `<span class="equipped-mark">E</span>` : '');
    cell.title = item.name;
    if (opts.onClick) cell.addEventListener('click', opts.onClick);
    return cell;
  };

  ui.itemDetailHtml = function (item, compareItem) {
    if (!item) {
      return `<div class="detail-empty"><div class="detail-empty-glyph">?</div>` +
        `从装备栏或背包中选择一件物品<br>查看属性与战力对比。</div>`;
    }
    const rar = DG.items.rarityInfo(item);
    const quality = DG.items.qualityLabel(item);
    const slot = DG.items.slotInfo(item.slot);
    const lines = DG.items.describe(item)
      .map(l => `<div class="item-stat"><span>${U.escapeHtml(l.label)}</span><span>${U.escapeHtml(l.text)}</span></div>`)
      .join('');

    let compareHtml = '';
    if (compareItem !== undefined) {
      const mine = DG.items.score(item);
      if (!compareItem) {
        compareHtml = `<div class="compare"><span class="up">装备后评分 +${mine}</span></div>`;
      } else if (compareItem.id === item.id) {
        compareHtml = `<div class="compare"><span class="same">当前已装备 · 评分 ${mine}</span></div>`;
      } else {
        const diff = mine - DG.items.score(compareItem);
        const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
        const txt = diff === 0 ? '评分持平' : `评分 ${diff > 0 ? '+' : ''}${diff}`;
        compareHtml = `<div class="compare"><span class="${cls}">${txt}（当前 ${mine}）</span>` +
          `<div class="compare-note">对比已装备：${U.escapeHtml(compareItem.name)}</div></div>`;
      }
    }

    return `<div class="item-name r-${item.rarity}">${U.escapeHtml(item.name)}` +
      `<span class="rarity-tag" style="color:${rar.color}">${U.escapeHtml(quality)}</span></div>` +
      `<div class="item-type">${U.escapeHtml(quality)} ${U.escapeHtml(slot.name)} · 物品等级 ${item.ilvl}</div>` +
      (lines || '<div class="item-stat"><span>附加属性</span><span>无</span></div>') +
      compareHtml;
  };

  // ---------- 功能图标点击反馈 ----------
  // 技能/装备/副本/任务/设置等图标按下时统一缩放 + 金光，触屏与鼠标一致
  const TAP_SELECTOR = '.combat-medal,.lvl-badge,.town-portal,.town-corner-btn,.strip-slot';
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest(TAP_SELECTOR);
    if (!el) return;
    // 重新触发动画：先移除再加回
    el.classList.remove('tap-on');
    void el.offsetWidth;
    el.classList.add('tap-on');
    clearTimeout(el._tapTimer);
    el._tapTimer = setTimeout(() => el.classList.remove('tap-on'), 360);
  }, true);
})();


;
/* ==== js/ui/stick.js ==== */
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


;
/* ==== js/ui/panels/equipment.js ==== */
/* 角色 · 装备界面：PSD 810×1680 原生坐标，按屏幕铺满显示（不再先缩到 720×1440） */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const C = DG.CONFIG;
  const ui = DG.ui = DG.ui || {};

  // 画布就是 PSD 的 810×1680，只按实际屏幕算一次等比缩放，JS 全程使用 PSD 原始坐标
  const ASSET = 'assets/ui/equip/';
  const PSD_W = 810;
  const PSD_H = 1680;
  const CONTENT_H = 1605;   // PSD 内容最低点（装备库面板底边），保证任何比例下内容不被裁掉

  // 装备页（PSD 65,400 438×601）内的格子坐标，已减去页面左上角
  const SLOT_POS = {
    helm: [173, 97],
    shoulder: [43, 152],
    amulet: [303, 153],
    armor: [173, 214],
    gloves: [43, 271],
    ring: [303, 271],
    pants: [173, 332],
    weapon: [43, 389],
    offhand: [303, 389],
    boots: [173, 449]
  };

  // 品质框统一走公用道具框（assets/ui/items/frames），含远古套装 / 远古暗金
  const TABS = [
    { id: 'equip', name: '装备' },
    { id: 'item', name: '道具' },
    { id: 'other', name: '其他' }
  ];

  function slotOf(item) {
    return DG.items.slotInfo(item.slot) || { name: '装备', glyph: '?' };
  }

  // 把 810×1680 画布按舞台实际显示尺寸铺满（cover），并抵消舞台自身的非等比缩放，
  // 保证 PSD 的圆形、字号、间距在任何屏幕上都不变形、不被二次压缩
  function fitCanvas(canvas, layoutW) {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const tf = getComputedStyle(stage).transform;
    let kx = 1;
    let ky = 1;
    if (tf && tf !== 'none') {
      const m = tf.match(/matrix\(([^)]+)\)/);
      if (m) {
        const v = m[1].split(',').map(Number);
        kx = v[0] || 1;
        ky = v[3] || 1;
      }
    }
    // 以“铺满屏幕”为准；屏幕过扁时退让到内容高度，避免底部装备栏被切
    const scale = Math.min(
      Math.max(rect.width / PSD_W, rect.height / PSD_H),
      rect.height / CONTENT_H
    );
    const sx = scale / kx;
    const sy = scale / ky;
    canvas.style.transformOrigin = 'left top';
    canvas.style.transform = `scale(${sx}, ${sy})`;
    canvas.style.left = ((layoutW || 720) / 2 - (PSD_W / 2) * sx) + 'px';
    canvas.style.top = '0px';
    // 舞台比 810 窄时（短屏 720×1680）画布左右各被裁掉一部分，
    // 把裁切宽度传给 CSS，让贴边的关闭按钮跟着内收，避免被切掉
    const cropX = Math.max(0, (PSD_W * sx - (layoutW || 720)) / 2);
    canvas.style.setProperty('--eq-crop', cropX + 'px');
  }

  // 单个道具格：空格显示部位名，有装备时叠品质框 + 部位图标 + 等级
  function fillCell(cell, item, slot) {
    cell.innerHTML = '';
    if (!item) {
      cell.classList.remove('has');
      cell.appendChild(U.el('span', 'eq-cell-label', slot.name));
      return;
    }
    cell.classList.add('has');
    const img = U.el('img', 'eq-frame');
    img.src = DG.ui.itemFrameSrc(item);
    img.alt = '';
    cell.appendChild(img);
    cell.appendChild(U.el('span', 'eq-glyph', slot.glyph));
    cell.appendChild(U.el('span', 'eq-ilvl', String(item.ilvl)));
    if (item.ancient) cell.appendChild(U.el('span', 'eq-ancient', '远'));
    cell.title = item.name;
  }

  ui.openEquipment = function (char, onChange, opts) {
    opts = opts || {};
    // 连点装备入口时不叠出第二层面板，直接把已有实例返回
    if (ui._equipPanel && ui._equipPanel.isOpen()) return ui._equipPanel;
    const screen = U.el('div', 'eq-screen');
    const canvas = U.el('div', 'eq-canvas');
    screen.appendChild(canvas);
    DG.game.ui.appendChild(screen);
    if (DG.audio) DG.audio.play('uiOpen', { vol: 0.5, gap: 0.12 });
    // #ui 固定 720×1440 居中，装备页需要覆盖整个舞台（可能是 810×1680）
    const layout = () => {
      const stage = document.getElementById('stage');
      const dw = (stage && stage.offsetWidth) || 720;
      const dh = (stage && stage.offsetHeight) || 1440;
      screen.style.left = ((720 - dw) / 2) + 'px';
      screen.style.top = ((1440 - dh) / 2) + 'px';
      screen.style.width = dw + 'px';
      screen.style.height = dh + 'px';
      fitCanvas(canvas, dw);
    };
    layout();
    const onResize = () => layout();
    window.addEventListener('resize', onResize);

    let tab = 'equip';
    let page = 'bag';               // bag：临时装备库 / stash：大装备仓库
    let bagScroll = 0;
    let stashScroll = 0;

    function close() {
      if (DG.audio) DG.audio.play('uiClose', { vol: 0.45, gap: 0.12 });
      ui._equipPanel = null;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (screen.parentNode) screen.remove();
      if (opts.onClose) opts.onClose();
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);

    function persist() {
      DG.game.save();
      if (onChange) onChange();
      render();
    }

    function removeItem(list, item) {
      const i = list.indexOf(item);
      if (i >= 0) list.splice(i, 1);
    }

    function equipItem(item) {
      const old = char.equipment[item.slot];
      removeItem(char.bag, item);
      char.equipment[item.slot] = item;
      if (old) char.bag.push(old);
      if (DG.audio) DG.audio.play('stageEquip', { vol: 0.5 });
      ui.toast(`已装备「${item.name}」`, 'gold');
      persist();
    }

    function unequip(slot) {
      const item = char.equipment[slot];
      if (!item) return;
      if (DG.character.bagUsed(char) >= C.BAG_SIZE) {
        ui.toast('临时装备库已满，无法卸下', 'danger');
        return;
      }
      char.equipment[slot] = null;
      char.bag.push(item);
      ui.toast(`已卸下「${item.name}」`);
      persist();
    }

    function toStash(item) {
      removeItem(char.bag, item);
      char.stash.push(item);
      ui.toast(`「${item.name}」已存入装备库`, 'gold');
      persist();
    }

    function fromStash(item) {
      if (DG.character.bagUsed(char) >= C.BAG_SIZE) {
        ui.toast('临时装备库已满，无法取出', 'danger');
        return;
      }
      removeItem(char.stash, item);
      char.bag.push(item);
      ui.toast(`「${item.name}」已取出`, 'gold');
      persist();
    }

    function discard(item, source) {
      ui.confirm(`丢弃「${item.name}」？丢弃后无法找回。`, () => {
        removeItem(source === 'stash' ? char.stash : char.bag, item);
        ui.toast(`已丢弃「${item.name}」`);
        persist();
      }, { danger: true, okText: '丢弃' });
    }

    // 一键分解：默认只处理白装与蓝装，紫 / 套装 / 暗金保留
    function dismantle() {
      const junk = char.bag.filter(it => it && (it.rarity === 'normal' || it.rarity === 'magic'));
      if (!junk.length) {
        ui.toast('没有可分解的白装或蓝装', 'danger');
        return;
      }
      ui.confirm(`分解 ${junk.length} 件白装 / 蓝装？分解后无法找回。`, () => {
        char.bag = char.bag.filter(it => !(it && (it.rarity === 'normal' || it.rarity === 'magic')));
        ui.toast(`已分解 ${junk.length} 件装备`, 'gold');
        persist();
      }, { danger: true, okText: '分解' });
    }

    function openDetail(item, source) {
      const compare = source === 'bag' ? (char.equipment[item.slot] || null) : undefined;
      const body = U.el('div', 'eq-detail');
      body.innerHTML = ui.itemDetailHtml(item, compare);
      const foot = U.el('div', 'eq-detail-actions');
      const modal = ui.modal({ title: '装备详情', body, footer: foot });

      const add = (text, kind, fn) => {
        const btn = U.el('button', 'eq-dbtn' + (kind ? ' ' + kind : ''), text);
        btn.addEventListener('click', () => { modal.close(); fn(); });
        foot.appendChild(btn);
      };

      if (source === 'bag') {
        add(char.equipment[item.slot] ? '替换装备' : '装 备', 'red', () => equipItem(item));
        add('存入仓库', '', () => toStash(item));
        add('丢 弃', '', () => discard(item, 'bag'));
      } else if (source === 'equip') {
        add('卸 下', '', () => unequip(item.slot));
      } else {
        add('取 出', 'red', () => fromStash(item));
        add('丢 弃', '', () => discard(item, 'stash'));
      }
    }

    function render() {
      const stats = DG.stats.compute(char);
      const cls = DG.data.classes[char.cls];
      const used = DG.character.bagUsed(char);
      const cap = C.BAG_SIZE;
      const tabIndex = Math.max(0, TABS.findIndex(t => t.id === tab));

      const statRows = [
        ['最大生命', U.fmt(stats.maxHp)],
        ['攻击力', stats.atk],
        ['护甲', { v: stats.armor, n: '减伤 ' + DG.stats.mitigation(stats.armor) + '%' }],
        ['暴击率', stats.crit + '%'],
        ['暴击伤害', stats.critDmg + '%'],
        ['移动速度', stats.moveSpeed],
        ['攻击速度', stats.attackSpeed + '/秒'],
        ['生命回复', stats.hpRegen + '/秒']
      ].map(r => {
        const v = r[1];
        if (v && typeof v === 'object') {
          return `<li><span class="k">${r[0]}</span><span class="v">${v.v}<em>${v.n}</em></span></li>`;
        }
        return `<li><span class="k">${r[0]}</span><span class="v">${v}</span></li>`;
      }).join('');

      canvas.innerHTML = `
        <div class="eq-bg"></div>
        <div class="eq-title">背包</div>
        <button class="eq-close" aria-label="关闭"></button>

        <div class="eq-hero">
          <div class="eq-hero-frame"></div>
          <div class="eq-portrait"><img src="${ASSET}avatar.png" alt=""></div>
          <div class="eq-hero-name">${U.escapeHtml(char.name)}<span class="lv">${char.level}级</span></div>
          <div class="eq-hero-sub">${U.escapeHtml(cls.name)} · ${U.escapeHtml(cls.title)}</div>
          <div class="eq-power"><span>战力</span><b>${U.fmt(stats.power)}</b></div>
        </div>

        <div class="eq-page eq-equip-page"><div class="eq-page-title">装备栏</div></div>

        <div class="eq-stats">
          <div class="eq-stats-title">角色属性</div>
          <ul class="eq-stat-list">${statRows}</ul>
        </div>

        ${page === 'bag' ? `
        <div class="eq-bag-page">
          <div class="eq-tabs">
            <div class="eq-tab-pill" style="left:${tabIndex * 125}px"></div>
            ${TABS.map((t, i) =>
              `<button class="eq-tab${t.id === tab ? ' on' : ''}" data-tab="${t.id}" style="left:${i * 125}px">${t.name}</button>`
            ).join('')}
          </div>
          <button class="eq-btn stash">装备库</button>
          <button class="eq-btn dismantle">分解</button>
          <div class="eq-cap">容量：<b>${used}</b>/${cap}</div>
          <div class="eq-grid-wrap"><div class="eq-grid"></div></div>
          <div class="eq-empty hidden"></div>
        </div>` : ''}
      `;

      // ---------- 头部 ----------
      canvas.querySelector('.eq-close').addEventListener('click', close);
      canvas.querySelectorAll('.eq-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          if (tab === btn.dataset.tab) return;
          tab = btn.dataset.tab;
          bagScroll = 0;
          render();
        });
      });

      // ---------- 装备栏 10 个格子 ----------
      const equipPage = canvas.querySelector('.eq-equip-page');
      C.SLOTS.forEach(slot => {
        const pos = SLOT_POS[slot.id];
        if (!pos) return;
        const item = char.equipment[slot.id];
        const cell = U.el('button', 'eq-cell eq-slot');
        cell.style.left = pos[0] + 'px';
        cell.style.top = pos[1] + 'px';
        fillCell(cell, item, slot);
        if (item) cell.addEventListener('click', () => openDetail(item, 'equip'));
        equipPage.appendChild(cell);
      });

      // ---------- 临时装备库 ----------
      const bagPage = canvas.querySelector('.eq-bag-page');
      if (bagPage) {
        bagPage.querySelector('.eq-btn.stash').addEventListener('click', () => {
          page = 'stash';
          render();
        });
        bagPage.querySelector('.eq-btn.dismantle').addEventListener('click', dismantle);

        const grid = bagPage.querySelector('.eq-grid');
        const list = tab === 'equip' ? char.bag.filter(Boolean) : [];
        list.forEach(item => {
          const cell = U.el('button', 'eq-cell');
          fillCell(cell, item, slotOf(item));
          cell.addEventListener('click', () => openDetail(item, 'bag'));
          grid.appendChild(cell);
        });
        // 装备页按容量补齐空格，直观看出还剩多少位置
        if (tab === 'equip') {
          for (let i = list.length; i < cap; i++) grid.appendChild(U.el('div', 'eq-cell empty'));
        } else if (!list.length) {
          const hint = bagPage.querySelector('.eq-empty');
          hint.classList.remove('hidden');
          hint.textContent = tab === 'item' ? '暂无道具' : '暂无其他物品';
        }

        const wrap = bagPage.querySelector('.eq-grid-wrap');
        wrap.scrollTop = bagScroll;
        wrap.addEventListener('scroll', () => { bagScroll = wrap.scrollTop; });
      }

      // ---------- 大装备仓库 ----------
      if (page === 'stash') {
        const stashPage = U.el('div', 'eq-stash-page');
        stashPage.innerHTML = `
          <div class="eq-stash-title">装备库</div>
          <div class="eq-stash-count">已收藏 ${char.stash.length} 件</div>
          <button class="eq-btn stash-back">返回</button>
          <div class="eq-stash-inner">
            <div class="eq-stash-grid-wrap"><div class="eq-grid"></div></div>
          </div>`;
        canvas.appendChild(stashPage);
        stashPage.querySelector('.stash-back').addEventListener('click', () => {
          page = 'bag';
          render();
        });

        const grid = stashPage.querySelector('.eq-grid');
        char.stash.forEach(item => {
          const cell = U.el('button', 'eq-cell');
          fillCell(cell, item, slotOf(item));
          cell.addEventListener('click', () => openDetail(item, 'stash'));
          grid.appendChild(cell);
        });
        if (!char.stash.length) {
          stashPage.querySelector('.eq-stash-inner')
            .appendChild(U.el('div', 'eq-empty show', '仓库还是空的'));
        }

        const wrap = stashPage.querySelector('.eq-stash-grid-wrap');
        wrap.scrollTop = stashScroll;
        wrap.addEventListener('scroll', () => { stashScroll = wrap.scrollTop; });
      }
    }

    render();
    const panel = { close, isOpen: () => !!screen.isConnected };
    ui._equipPanel = panel;
    return panel;
  };
})();


;
/* ==== js/ui/panels/skills.js ==== */
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
    if (DG.audio) DG.audio.play('uiOpen', { vol: 0.5, gap: 0.12 });
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
      if (DG.audio) DG.audio.play('uiClose', { vol: 0.45, gap: 0.12 });
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


;
/* ==== js/ui/panels/quests.js ==== */
/* 任务面板：主线推进 + 三条悬赏（页签式纸面面板）
   外壳、页签与按钮复用公用弹框资源；奖励、状态与进度集中在卡片内。 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  // 悬赏类型徽记：单字代替图标，避免新增图片资源
  const TYPE_GLYPH = { kill: '剿', elite: '精', boss: '王', loot: '拾', clear: '旗' };

  ui.openQuests = function (char, onChange) {
    // 连点任务入口时不叠出第二层弹框
    if (document.querySelector('.modal-mask')) return;
    const body = U.el('div', 'quest-body');
    const modal = ui.modal({
      title: '任务',
      subtitle: '主线推进 · 悬赏循环',
      body
    });
    // 固定高度面板：切换页签、领取奖励都不会改变界面尺寸
    modal.modal.classList.add('quest-modal');

    let tab = 'main';

    function chips(r) {
      return [
        r.gold ? `<span class="qp-chip gold"><i>金</i>${U.fmt(r.gold)}</span>` : '',
        r.xp ? `<span class="qp-chip xp"><i>经</i>${U.fmt(r.xp)}</span>` : '',
        r.treePoints ? `<span class="qp-chip tree"><i>树</i>+${r.treePoints}</span>` : '',
        r.skillPoints ? `<span class="qp-chip skill"><i>技</i>+${r.skillPoints}</span>` : ''
      ].join('');
    }

    /* ---------- 主线：当前任务 + 后续两关预览 ---------- */
    function mainView(qs) {
      const total = DG.data.dungeons.length;
      const cleared = Object.keys(char.cleared || {}).length;
      const pct = Math.min(100, Math.round(cleared / total * 100));
      const main = DG.quests.mainQuest(char);

      if (!main) {
        return `<div class="qp-hero done">` +
            `<div class="qp-hero-head">` +
              `<div class="qp-step"><b>${total}</b><span>关</span></div>` +
              `<div class="qp-hero-id"><div class="qp-kicker">主线任务</div><h4>全部完成</h4></div>` +
              `<span class="qp-tag done">已完成</span>` +
            `</div>` +
            `<p class="qp-lore">终焉之门已经推开，腐化的源头安静下来。</p>` +
            `<p class="qp-desc">悬赏仍会继续刷新，继续打磨你的流派装备。</p>` +
            `<div class="qp-progress-row"><span>主线进度</span><em>已通关 <b>${cleared}</b> / ${total}</em></div>` +
            `<div class="qp-bar"><i style="width:${pct}%"></i></div>` +
          `</div>`;
      }

      const ready = DG.quests.mainReady(char);
      const stage = DG.data.dungeonById[main.stage];
      const next = DG.data.quests.main.slice(qs.main + 1, qs.main + 4);
      const nextHtml = next.length
        ? `<div class="qp-section"><span>后续主线</span><em>按顺序推进</em></div>` +
          `<ul class="qp-next-list">` + next.map(q => {
            const s = DG.data.dungeonById[q.stage];
            return `<li class="qp-next">` +
              `<b>${q.index}</b>` +
              `<span class="qp-next-name">${U.escapeHtml(q.name)}</span>` +
              `<span class="qp-next-stage">${U.escapeHtml(s ? s.name : q.stage)}</span>` +
              `<span class="qp-tag todo">待推进</span>` +
            `</li>`;
          }).join('') + `</ul>`
        : '';

      return `<div class="qp-hero${ready ? ' ready' : ''}">` +
          `<div class="qp-hero-head">` +
            `<div class="qp-step"><b>${main.index}</b><span>关</span></div>` +
            `<div class="qp-hero-id"><div class="qp-kicker">主线任务</div><h4>${U.escapeHtml(main.name)}</h4></div>` +
            (ready ? `<span class="qp-tag ready">可领取</span>` : `<span class="qp-tag doing">进行中</span>`) +
          `</div>` +
          `<p class="qp-lore">${U.escapeHtml(main.lore || '')}</p>` +
          `<p class="qp-desc">${U.escapeHtml(main.desc)}</p>` +
          `<div class="qp-objective">` +
            `<span>目标关卡</span><b>${U.escapeHtml(stage ? stage.name : main.stage)}</b>` +
            `<em class="${ready ? 'ok' : ''}">${ready ? '已通关' : '待通关'}</em>` +
          `</div>` +
          `<div class="qp-progress-row"><span>主线进度</span><em>已通关 <b>${cleared}</b> / ${total}</em></div>` +
          `<div class="qp-bar"><i style="width:${pct}%"></i></div>` +
          `<div class="qp-rewards">${chips(main.reward)}</div>` +
          `<div class="qp-actions">` +
            (ready
              ? `<button class="btn primary" data-claim-main>领取奖励</button>`
              : `<button class="btn primary" data-go>前往副本</button>`) +
          `</div>` +
        `</div>` + nextHtml;
    }

    /* ---------- 悬赏：三条委托 + 进度 ---------- */
    function bountyView(qs) {
      const readyN = qs.bounties.filter(q => q.have >= q.need).length;
      const cards = qs.bounties.map((q, i) => {
        const done = q.have >= q.need;
        const pct = Math.min(100, Math.round(q.have / q.need * 100));
        const tmpl = DG.data.quests.bountyTemplates.find(t => t.key === q.key) || {};
        const reward = DG.data.quests.bountyReward(tmpl, char.level);
        return `<article class="qp-bounty${done ? ' ready' : ''}">` +
          `<div class="qp-bounty-icon">${TYPE_GLYPH[q.type] || '令'}</div>` +
          `<div class="qp-bounty-main">` +
            `<div class="qp-head"><b>${U.escapeHtml(q.name)}</b><span class="qp-progress">${q.have} / ${q.need}</span></div>` +
            `<p class="qp-desc">${U.escapeHtml(DG.quests.bountyText(q))}</p>` +
            `<div class="qp-bar"><i style="width:${pct}%"></i></div>` +
            `<div class="qp-foot">` +
              `<div class="qp-rewards">${chips(reward)}</div>` +
              (done
                ? `<button class="btn primary" data-claim-bounty="${i}">领取</button>`
                : `<span class="qp-tag doing">进行中</span>`) +
            `</div>` +
          `</div>` +
        `</article>`;
      }).join('');

      return `<div class="qp-sum">` +
          `<span>可领取 <b>${readyN}</b></span>` +
          `<span>进行中 <b>${qs.bounties.length - readyN}</b></span>` +
        `</div>` +
        `<div class="qp-hint">副本战斗自动累计进度，领取后立即刷新委托。</div>` +
        `<div class="qp-bounty-list">${cards}</div>` +
        `<button class="btn ghost qp-go" data-go>前往副本</button>`;
    }

    function bind(view) {
      const claimMain = view.querySelector('[data-claim-main]');
      if (claimMain) {
        claimMain.addEventListener('click', () => {
          const res = DG.quests.claimMain(char);
          if (!res.ok) { DG.ui.toast(res.reason || '无法领取', 'danger'); return; }
          DG.game.save();
          DG.audio.play('stageEquip', { vol: 0.6 });
          DG.ui.toast(`主线完成：${res.quest.name}`, 'gold');
          if (res.got && res.got.item) DG.ui.toast(`获得装备：${res.got.item.name}`, 'blue');
          render();
          if (onChange) onChange();
        });
      }

      view.querySelectorAll('[data-claim-bounty]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-claim-bounty'), 10);
          const res = DG.quests.claimBounty(char, idx);
          if (!res.ok) { DG.ui.toast(res.reason || '无法领取', 'danger'); return; }
          DG.game.save();
          DG.audio.play('stageCoin', { vol: 0.5 });
          DG.ui.toast('悬赏完成，已刷新新委托', 'gold');
          render();
          if (onChange) onChange();
        });
      });

      // 前往副本：关闭面板后打开选关，进度类任务都能在副本中推进
      view.querySelectorAll('[data-go]').forEach(btn => {
        btn.addEventListener('click', () => {
          modal.close();
          DG.ui.openDungeonSelect(char, (def) => DG.game.startDungeon(def));
        });
      });
    }

    function render() {
      const qs = DG.quests.ensure(char);
      const total = DG.data.dungeons.length;
      const cleared = Object.keys(char.cleared || {}).length;
      const readyN = qs.bounties.filter(q => q.have >= q.need).length;
      const mainReady = DG.quests.mainReady(char);

      body.innerHTML =
        `<div class="quest-panel">` +
          `<div class="tab-bar">` +
            `<button class="tab-btn${tab === 'main' ? ' sel' : ''}" data-tab="main">` +
              `<span>主线</span>` +
              `<em class="qp-tab-num">${cleared} / ${total}</em>` +
              (mainReady ? `<i class="qp-tab-dot"></i>` : '') +
            `</button>` +
            `<button class="tab-btn${tab === 'bounty' ? ' sel' : ''}" data-tab="bounty">` +
              `<span>悬赏</span>` +
              `<em class="qp-tab-num">${readyN ? '待领 ' + readyN : qs.bounties.length + ' 项'}</em>` +
              (readyN ? `<i class="qp-tab-dot"></i>` : '') +
            `</button>` +
          `</div>` +
          `<div class="qp-view"></div>` +
        `</div>`;

      body.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
          const next = btn.getAttribute('data-tab');
          if (next === tab) return;
          tab = next;
          render();
        });
      });

      const view = body.querySelector('.qp-view');
      view.innerHTML = tab === 'main' ? mainView(qs) : bountyView(qs);
      bind(view);

      // 主城任务图标红点与实际可领取数量保持同步，领取后立即消失
      const dot = document.querySelector('[data-quest-dot]');
      if (dot) dot.classList.toggle('hidden', DG.quests.claimableCount(char) <= 0);
    }

    render();
    return modal;
  };
})();


;
/* ==== js/ui/panels/dungeon-select.js ==== */
/* 秘境副本：整屏关卡选择（按 PSD 切图还原）
   结构：背景 / 章节页签 / 标题带 / 关卡列表 / 底部进入副本 / 公用关闭按钮
   交互：切页签 → 选关卡 → 底部按钮进入；未解锁关卡点击给出原因提示 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];
  // 页签上只显示两字简称，完整章节名在选关时通过标题带保持简洁
  const SHORT = { 1: '迷雾', 2: '腐化', 3: '黑潮', 4: '王座' };

  ui.openDungeonSelect = function (char, onEnter) {
    if (document.querySelector('.secret-screen')) return null;
    const acts = DG.data.acts;
    const all = DG.data.dungeons;
    const toastWrap = document.getElementById('toast-wrap');

    // 当前挑战关卡 = 最远通关进度的下一关；默认停在它所在章节，
    // 没有可推进关卡时，稍后回落到最高已解锁章节
    const maxIdx = DG.data.progressIndex(char);
    const curIdx = Math.min(all.length - 1, maxIdx + 1);
    const cur = all[curIdx];
    const curOpen = !!(cur && DG.data.stageUnlocked(char, cur));
    let act = curOpen ? cur.act : 0;

    let selId = null;

    const screen = U.el('div', 'secret-screen');
    screen.innerHTML =
      '<div class="secret-tabs"></div>' +
      '<h2 class="secret-title">秘境副本</h2>' +
      '<div class="secret-list"></div>' +
      '<div class="secret-foot"><button class="btn primary secret-enter">进入副本</button></div>' +
      '<button class="secret-close" aria-label="关闭"></button>';

    const tabsEl = screen.querySelector('.secret-tabs');
    const listEl = screen.querySelector('.secret-list');
    const enterBtn = screen.querySelector('.secret-enter');

    function reasonOf(def) {
      if (!def) return '当前章节尚未解锁';
      if (DG.data.stageUnlocked(char, def)) return '';
      const idx = all.indexOf(def);
      // 进度紧接的下一关才提示等级，之后统一提示先通关上一关
      if (idx === maxIdx + 1) return `需角色 Lv.${def.reqLevel}`;
      const prev = all[idx - 1];
      return prev ? `需通关「${prev.name}」` : '当前章节尚未解锁';
    }
    const actStages = () => all.filter(d => d.act === act);
    const stagesOf = a => all.filter(d => d.act === a);
    // 章节内至少有一关可进入，才视为该章节已解锁
    const actUnlocked = a => stagesOf(a).some(d => !reasonOf(d));
    if (!act || !actUnlocked(act)) {
      const openAct = acts.filter(a => actUnlocked(a.id));
      act = openAct.length ? openAct[openAct.length - 1].id : 1;
    }

    function ensureSel() {
      const arr = actStages();
      if (selId && arr.some(d => d.id === selId)) return;
      const current = curOpen && cur.act === act ? cur : null;
      const ready = current || arr.find(d => !reasonOf(d) && !char.cleared[d.id]) || arr.find(d => !reasonOf(d));
      selId = ready ? ready.id : null;
    }

    // 把选中关卡滚到列表可视区中间（列表未挂载时 clientHeight 为 0，直接跳过）
    function centerSel() {
      const selBtn = listEl.querySelector('.secret-row.sel');
      if (!selBtn || !listEl.clientHeight) return;
      const target = selBtn.offsetTop - (listEl.clientHeight - selBtn.offsetHeight) / 2;
      const max = listEl.scrollHeight - listEl.clientHeight;
      listEl.scrollTop = Math.max(0, Math.min(target, max));
    }

    function render(jump) {
      const keepTop = listEl.scrollTop;
      tabsEl.innerHTML = acts.map(a => {
        const locked = !actUnlocked(a.id);
        return `<button class="secret-tab${a.id === act ? ' on' : ''}${locked ? ' locked' : ''}" data-act="${a.id}">` +
          (locked ? '<span class="s-mask"></span><span class="s-lock"></span>' : '') +
          `<span class="st-label">${SHORT[a.id] || a.name.slice(0, 2)}</span>` +
          `<b>${ROMAN[a.id - 1]}</b>` +
        `</button>`;
      }).join('');

      listEl.innerHTML = actStages().map((d, i) => {
        const reason = reasonOf(d);
        const locked = !!reason;
        return `<button class="secret-row${d.id === selId ? ' sel' : ''}${locked ? ' locked' : ''}" data-id="${d.id}">` +
          (locked ? '<span class="s-mask"></span>' : '') +
          `<span class="s-num">${i + 1}</span>` +
          `<span class="s-name">${U.escapeHtml(d.name)}</span>` +
          `<span class="s-meta"><em>物品等级：${d.ilvl}</em><em>推荐等级：${d.reqLevel}</em></span>` +
          (locked ? '<span class="s-lock"></span>' : '') +
        `</button>`;
      }).join('');

      const selDef = all.find(d => d.id === selId);
      enterBtn.classList.toggle('off', !(selDef && !reasonOf(selDef)));

      // jump=true：进入界面 / 切章节时对准当前挑战关卡；
      // 其余情况保留滚动位置，只有选中行滑出可视区才滚回中间
      if (jump) {
        centerSel();
      } else {
        listEl.scrollTop = keepTop;
        const selBtn = listEl.querySelector('.secret-row.sel');
        if (selBtn) {
          const top = selBtn.offsetTop, bottom = top + selBtn.offsetHeight;
          if (top < listEl.scrollTop || bottom > listEl.scrollTop + listEl.clientHeight) centerSel();
        }
      }

      tabsEl.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.getAttribute('data-act'), 10);
          if (!id) return;
          if (!actUnlocked(id)) { ui.toast(reasonOf(stagesOf(id)[0])); return; }
          if (id === act) return;
          act = id;
          selId = null;
          ensureSel();
          render(true);
          if (DG.audio) DG.audio.play('uiSelect', { vol: 0.4, gap: 0.08 });
        });
      });

      listEl.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const def = all.find(d => d.id === id);
          const reason = reasonOf(def);
          if (reason) { ui.toast(reason); return; }
          if (selId === id) return;
          selId = id;
          render();
          if (DG.audio) DG.audio.play('uiSelect', { vol: 0.4, gap: 0.08 });
        });
      });
    }

    function close() {
      if (!screen.parentNode) return;
      screen.remove();
      document.removeEventListener('keydown', onKey);
      if (DG.audio) DG.audio.play('uiClose', { vol: 0.45, gap: 0.12 });
      if (toastWrap && !document.querySelector('.modal-mask, .secret-screen')) {
        toastWrap.classList.remove('over-modal');
      }
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        close();
      }
    }

    screen.querySelector('.secret-close').addEventListener('click', close);
    enterBtn.addEventListener('click', () => {
      const def = all.find(d => d.id === selId);
      const reason = reasonOf(def);
      if (reason) { ui.toast(reason); return; }
      close();
      onEnter(def);
    });

    // 先挂载再渲染，列表才有布局尺寸，进入时才能滚到当前挑战关卡
    ensureSel();
    DG.game.ui.appendChild(screen);
    render(true);
    if (DG.audio) DG.audio.play('uiOpen', { vol: 0.5, gap: 0.12 });
    if (toastWrap) {
      toastWrap.replaceChildren();
      toastWrap.classList.add('over-modal');
    }
    document.addEventListener('keydown', onKey);
    return { screen, close };
  };
})();


;
/* ==== js/ui/panels/settlement.js ==== */
/* 副本结算面板 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  ui.showSettlement = function (result, onReturn) {
    const body = U.el('div');
    const victory = result.victory;

    const items = result.items || [];
    const lootHtml = items.length
      ? items.map(it => {
          const slot = DG.items.slotInfo(it.slot);
          return `<div class="loot-cell r-${it.rarity}" title="${U.escapeHtml(it.name)}">` +
            `<img class="loot-frame" src="${DG.ui.itemFrameSrc(it)}" alt="">` +
            `<span class="qty">${DG.data.rarityById[it.rarity].name}</span>` +
            `<span class="loot-glyph">${U.escapeHtml(slot.glyph)}</span>` +
            `<span class="loot-name">${U.escapeHtml(it.name)}</span></div>`;
        }).join('')
      : `<div class="loot-empty">本次没有获得装备。</div>`;

    const levelNote = (result.levels && result.levels.length)
      ? `<div class="levelup-note">等级提升！当前等级 Lv.${result.levels[result.levels.length - 1]}` +
        `${result.skillPoints ? `（获得 ${result.skillPoints} 个技能点）` : ''}</div>`
      : '';
    const penaltyNote = (result.keepRate != null && result.keepRate < 1)
      ? `<div class="levelup-note">${result.retreat ? '主动撤退' : '重伤归来'}：本局金币与经验按 ${Math.round(result.keepRate * 100)}% 结算，装备保留</div>`
      : '';
    const skillNote = (result.skillUps && result.skillUps.length)
      ? `<div class="skillup-note">技能成长：${result.skillUps.map(s => `${U.escapeHtml(s)}`).join('、')}</div>`
      : '';

    body.innerHTML = `
      <div class="result-banner ${victory ? '' : 'fail'}">
        <h2>${victory ? '讨 伐 成 功' : (result.retreat ? '撤 退' : '重 伤 归 来')}</h2>
        <p>${victory ? '首领已被击败，迷雾暂时退散' : '整理行装，再次出发'}</p>
      </div>
      <div class="result-grid">
        <div class="result-cell"><div class="k">击杀数量</div><div class="v">${result.kills}</div></div>
        <div class="result-cell"><div class="k">用时</div><div class="v">${U.timeText(result.time)}</div></div>
        <div class="result-cell"><div class="k">获得经验</div><div class="v ok">${U.fmt(result.xp)}</div></div>
        <div class="result-cell"><div class="k">获得金币</div><div class="v gold">${U.fmt(result.gold)}</div></div>
        <div class="result-cell"><div class="k">拾取装备</div><div class="v">${items.length}</div></div>
        <div class="result-cell"><div class="k">当前等级</div><div class="v">Lv.${result.level || 1}</div></div>
      </div>
      ${levelNote}${penaltyNote}${skillNote}
      <div class="loot-area" style="margin-top:16px;">
        <div class="loot-title"><span>战利品</span><span>已放入背包</span></div>
        <div class="loot-grid">${lootHtml}</div>
      </div>`;

    const modal = ui.modal({
      title: '副本结算',
      subtitle: '战利品与成长已记录',
      body,
      width: 640,
      dismissible: false,
      footer: ''
    });

    const btn = U.el('button', 'btn primary settle-btn', '返回主城');
    btn.addEventListener('click', () => {
      modal.close();
      onReturn();
    });
    modal.foot.appendChild(btn);
    return modal;
  };
})();


;
/* ==== js/ui/panels/character-info.js ==== */
/* 角色信息面板 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  ui.openCharacterInfo = function (char, opts) {
    // 连点角色入口时不叠出第二层弹框
    if (document.querySelector('.modal-mask')) return;
    opts = opts || {};
    const cls = DG.data.classes[char.cls];
    const stats = DG.stats.compute(char);
    const body = U.el('div');

    ui.modal({
      title: '角色信息',
      subtitle: '当前角色的职业、成长与属性',
      body,
      width: 640,
      onClose: opts.onClose
    });

    const need = DG.character.xpNeed(char.level);
    const pct = Math.round(DG.character.levelProgress(char) * 100);
    const equipped = DG.CONFIG.SLOTS.filter(s => char.equipment[s.id]).length;
    const used = DG.character.bagUsed(char);

    const rows = [
      ['最大生命', U.fmt(stats.maxHp)],
      ['攻击力', stats.atk],
      ['护甲', `${stats.armor} <em>减伤 ${DG.stats.mitigation(stats.armor)}%</em>`],
      ['暴击率', `${stats.crit}%`],
      ['暴击伤害', `${stats.critDmg}%`],
      ['移动速度', stats.moveSpeed],
      ['攻击速度', `${stats.attackSpeed}/秒`],
      ['生命回复', `${stats.hpRegen}/秒`]
    ].map(r => `<li><span>${r[0]}</span><b>${r[1]}</b></li>`).join('');

    body.innerHTML =
      `<div class="ci-head">` +
        `<div class="char-emblem ci-emblem" style="color:${cls.color};border-color:${cls.color}66;">${cls.glyph}</div>` +
        `<div class="ci-id">` +
          `<div class="ci-name">${U.escapeHtml(char.name)}<span class="hero-lv">Lv.${char.level}</span></div>` +
          `<div class="ci-sub">${U.escapeHtml(cls.name)} · ${U.escapeHtml(cls.title)} · 账号 ${U.escapeHtml(DG.game.accountName)}</div>` +
          `<div class="ci-desc">${U.escapeHtml(cls.desc)}</div>` +
        `</div>` +
        `<div class="ci-power"><span>战 力</span><b>${U.fmt(stats.power)}</b></div>` +
      `</div>` +
      `<div class="hero-xp" style="margin-top:14px;">` +
        `<div class="hero-xp-meta"><span>经验 <em>${U.fmt(char.xp)} / ${U.fmt(need)}</em></span><span>${pct}%</span></div>` +
        `<div class="hero-xp-bar"><i style="width:${pct}%"></i></div>` +
      `</div>` +
      `<div class="sheet">` +
        `<div class="section-label"><span>属性</span><span class="meta">装备 ${equipped} / 4 · 背包 ${used} / ${DG.CONFIG.BAG_SIZE} · 技能点 ${char.skillPoints}</span></div>` +
        `<ul class="stat-list">${rows}</ul>` +
      `</div>`;
  };
})();


;
/* ==== js/ui/panels/controls.js ==== */
/* 操作设置面板 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const ui = DG.ui = DG.ui || {};

  ui.openControls = function (onChanged) {
    // 连点设置入口时不叠出第二层弹框
    if (document.querySelector('.modal-mask')) return;
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


;
/* ==== js/scenes/login.js ==== */
/* 登录场景 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.scenes = DG.scenes || {};

  // 记住密码：本地做一次 base64 编码，避免以明文形式躺在 localStorage 里
  const KEY_REMEMBER = 'mistdark_remember_pass';
  const KEY_PASS = 'mistdark_saved_pass';
  const enc = (s) => {
    try {
      const bytes = new TextEncoder().encode(s);
      let bin = '';
      bytes.forEach(b => { bin += String.fromCharCode(b); });
      return btoa(bin);
    } catch (e) { return ''; }
  };
  const dec = (s) => {
    try {
      const bin = atob(s);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (e) { return ''; }
  };

  DG.scenes.login = {
    render(root) {
      if (DG.audio) DG.audio.playBgm('login');
      const screen = U.el('div', 'screen login-screen ui-kit');
      screen.innerHTML = `
        <div class="ui-mask login-mask"></div>
        <section class="ui-dialog login-dialog" role="dialog" aria-label="登录游戏">
          <div class="ui-dialog-title">登录游戏</div>
          <div class="ui-inset login-inset">
            <div class="ui-label login-label-account">账号</div>
            <input id="login-name" class="ui-input login-input-account" type="text"
                   maxlength="12" autocomplete="off" placeholder="角色名字">
            <div class="ui-label login-label-pass">密码</div>
            <input id="login-pass" class="ui-input login-input-pass" type="password"
                   inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off" placeholder="输入数字">
            <label class="ui-check login-remember">
              <input id="login-remember" type="checkbox">
              <span class="ui-check-box"></span>
              <span class="ui-check-tick"></span>
              <span class="ui-check-text">记住密码，仅保持本机浏览器</span>
            </label>
          </div>
          <button class="ui-btn ui-btn-brown login-btn-register" id="btn-register" type="button"><span>注册</span></button>
          <button class="ui-btn ui-btn-red login-btn-login" id="btn-login" type="button"><span>登录</span></button>
        </section>`;

      root.replaceChildren(screen);

      const nameEl = screen.querySelector('#login-name');
      const passEl = screen.querySelector('#login-pass');
      const rememberEl = screen.querySelector('#login-remember');

      try {
        const last = localStorage.getItem('mistdark_last_account');
        if (last) nameEl.value = last;
        if (localStorage.getItem(KEY_REMEMBER) === '1') {
          const saved = dec(localStorage.getItem(KEY_PASS) || '');
          if (saved) {
            passEl.value = saved;
            rememberEl.checked = true;
          }
        }
      } catch (e) { /* 忽略 */ }

      // 密码只接受数字：输入时直接过滤掉非数字字符，中文输入法也一并拦截
      passEl.addEventListener('input', () => {
        const clean = passEl.value.replace(/\D/g, '').slice(0, 12);
        if (clean !== passEl.value) passEl.value = clean;
      });

      const showErr = (msg) => {
        if (msg && DG.ui && DG.ui.toast) DG.ui.toast(msg);
      };

      function afterLogin(name) {
        try {
          localStorage.setItem('mistdark_last_account', name);
          if (rememberEl.checked && passEl.value) {
            localStorage.setItem(KEY_REMEMBER, '1');
            localStorage.setItem(KEY_PASS, enc(passEl.value));
          } else {
            localStorage.removeItem(KEY_REMEMBER);
            localStorage.removeItem(KEY_PASS);
          }
        } catch (e) { /* 忽略 */ }
        DG.game.setAccount(name);
        DG.game.save();
        DG.game.gotoEntry();
      }

      function doLogin() {
        const name = nameEl.value.trim();
        const pass = passEl.value.replace(/\D/g, '');
        const res = DG.storage.login(DG.game.db, name, pass);
        if (!res.ok) { showErr(res.msg); return; }
        afterLogin(name);
      }

      function doRegister() {
        const name = nameEl.value.trim();
        const pass = passEl.value.replace(/\D/g, '');
        const res = DG.storage.createAccount(DG.game.db, name, pass);
        if (!res.ok) { showErr(res.msg); return; }
        DG.game.save();
        if (DG.ui && DG.ui.toast) DG.ui.toast('注册成功，已自动登录', 'gold');
        afterLogin(name);
      }

      screen.querySelector('#btn-login').addEventListener('click', doLogin);
      screen.querySelector('#btn-register').addEventListener('click', doRegister);
      [nameEl, passEl].forEach(el => {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doLogin();
        });
      });
      // 桌面端自动聚焦方便直接输入；手机上不自动聚焦，避免一进登录页就弹键盘把画面顶小
      if (window.matchMedia && window.matchMedia('(pointer:fine)').matches) {
        if (!nameEl.value) nameEl.focus();
        else if (!passEl.value) passEl.focus();
        else screen.querySelector('#btn-login').focus();
      }
    }
  };
})();


;
/* ==== js/scenes/entry.js ==== */
/* 开始界面：登录成功后进入，点击「开始游戏」再进入选角 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.scenes = DG.scenes || {};

  DG.scenes.entry = {
    render(root) {
      if (DG.audio) DG.audio.playBgm('login');
      const screen = U.el('div', 'screen entry-screen');
      // 不套卡片框：只留两颗按钮浮在插画上
      screen.innerHTML = `
        <div class="entry-actions">
          <button class="btn primary entry-start" id="btn-start">开 始 游 戏</button>
          <button class="btn ghost entry-switch" id="btn-switch">切换账号</button>
        </div>
        <div class="login-version">基础框架 v0.1</div>`;

      root.replaceChildren(screen);

      screen.querySelector('#btn-start').addEventListener('click', () => DG.game.gotoCharacter());
      screen.querySelector('#btn-switch').addEventListener('click', () => DG.game.logout());
    }
  };
})();


;
/* ==== js/scenes/character.js ==== */
/* 选角场景 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.scenes = DG.scenes || {};

  // 选角阶段预热主城地图（570KB）：首次进镇时贴图已下载并解码，
  // 不会在场景切换瞬间才开始取图，避免进镇第一秒掉帧
  let townMapWarmed = false;
  function warmTownMap() {
    if (townMapWarmed) return;
    townMapWarmed = true;
    const img = new Image();
    DG.assets.assign(img, 'assets/town-map.jpg');
    if (img.decode) img.decode().catch(() => {});
  }

  DG.scenes.character = {
    render(root) {
      if (DG.audio) DG.audio.playBgm('login');
      warmTownMap();
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


;
/* ==== js/scenes/town.js ==== */
/* 主城场景：营地地图 + 可自由走动的角色 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.scenes = DG.scenes || {};

  // 角色立绘走公共绘制资源（js/art/heroes/）
  const heroArt = (cls) => DG.art.heroSvg(cls);

  // ---------- 营地地图参数 ----------
  const MAP_W = 2504, MAP_H = 1680;               // 原图尺寸
  const VIEW_W = 810, VIEW_H = 1680;              // 场景按最大屏尺寸绘制
  const WORLD_W = Math.round(MAP_W * VIEW_H / MAP_H); // 地图按屏高铺满后的世界宽度
  const WORLD_H = VIEW_H;
  const ACTOR_W = 240, ACTOR_H = 256;
  // 步幅基准：330px/s 对应 11rad/s（30px/rad），主城与战斗共用同一换算
  const WALK_REF_SPEED = 330;
  // 进入主城固定落点：角色绘制的视觉中心对准屏幕正中（左右居中由相机保证，上下按立绘包围盒校正）
  const START = [0.50, 0.55];

  // 可行走区域：参考图二，取营地中央空地，边缘避开帐篷、木箱、篝火与岩石
  const WALK = [
    [0.27, 0.49], [0.34, 0.455], [0.47, 0.415], [0.58, 0.40], [0.665, 0.435],
    [0.665, 0.62], [0.735, 0.665], [0.82, 0.685], [0.845, 0.705], [0.76, 0.755],
    [0.66, 0.83], [0.56, 0.87], [0.44, 0.885], [0.34, 0.875], [0.315, 0.80],
    [0.315, 0.68], [0.30, 0.58]
  ].map(([x, y]) => [x * WORLD_W, y * WORLD_H]);

  // 空地里的固定障碍（篝火），避免角色直接从火堆上穿过
  const OBSTACLES = [
    { x: 0.745 * WORLD_W, y: 0.565 * WORLD_H, r: 150 }
  ];

  // 射线法判断点是否在可行走多边形内（不含障碍物）
  function insidePoly(x, y) {
    let hit = false;
    for (let i = 0, j = WALK.length - 1; i < WALK.length; j = i++) {
      const xi = WALK[i][0], yi = WALK[i][1];
      const xj = WALK[j][0], yj = WALK[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  // 角色脚部半径：角色中心与边界保持一点距离，避免贴图压进边缘
  const SKIN = 4;

  // 预计算每条边的“朝内”法线：贴边时用固定法线，不会因为点正好落在边界上而退化
  const EDGES = WALK.map((a, i) => {
    const b = WALK[(i + 1) % WALK.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const l = Math.hypot(ex, ey) || 1;
    let nx = -ey / l, ny = ex / l;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (!insidePoly(mx + nx * 3, my + ny * 3)) { nx = -nx; ny = -ny; }
    return { ax: a[0], ay: a[1], bx: b[0], by: b[1], nx, ny };
  });

  // 最近边界信息：返回距离、最近点与平滑的“朝内”法线
  // 顶点附近会融合相邻两条边的法线，斜着顶住拐角时才能顺着滑出去，而不是被弹停
  function boundaryInfo(x, y) {
    let bestD2 = Infinity, bx = x, by = y, bestEdge = null;
    for (let i = 0; i < EDGES.length; i++) {
      const e = EDGES[i];
      const vx = e.bx - e.ax, vy = e.by - e.ay;
      const l2 = vx * vx + vy * vy || 1;
      let t = ((x - e.ax) * vx + (y - e.ay) * vy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = e.ax + vx * t, qy = e.ay + vy * t;
      const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d2 < bestD2) { bestD2 = d2; bx = qx; by = qy; bestEdge = e; }
    }
    // 障碍圆：最近点在圆周上，法线由圆心指向角色
    for (let i = 0; i < OBSTACLES.length; i++) {
      const o = OBSTACLES[i];
      const ddx = x - o.x, ddy = y - o.y;
      const d = Math.hypot(ddx, ddy) || 0.0001;
      const sd = d - o.r;
      const d2 = sd * sd;
      if (d2 < bestD2) {
        bestD2 = d2;
        bx = o.x + ddx / d * o.r;
        by = o.y + ddy / d * o.r;
        return { d: sd, x: bx, y: by, nx: ddx / d, ny: ddy / d };
      }
    }
    // 汇总与最近点几乎等距的边法线：平直边只有一条，顶点处两条一起参与
    let nx = 0, ny = 0;
    const near = Math.sqrt(bestD2) + 2;
    for (let i = 0; i < EDGES.length; i++) {
      const e = EDGES[i];
      const vx = e.bx - e.ax, vy = e.by - e.ay;
      const l2 = vx * vx + vy * vy || 1;
      let t = ((x - e.ax) * vx + (y - e.ay) * vy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = e.ax + vx * t, qy = e.ay + vy * t;
      if (Math.hypot(x - qx, y - qy) <= near) { nx += e.nx; ny += e.ny; }
    }
    const nl = Math.hypot(nx, ny);
    if (nl > 0.2 && (!bestEdge || insidePoly(bx + nx / nl * 3, by + ny / nl * 3))) {
      nx /= nl; ny /= nl;
    } else if (bestEdge) {
      // 凹角处合成法线可能指向区域外，退回最近那条边的法线
      nx = bestEdge.nx; ny = bestEdge.ny;
    } else {
      nx = 0; ny = -1;
    }
    return { d: Math.sqrt(bestD2), x: bx, y: by, nx, ny };
  }

  // 可站立判定：多边形内且与边界保持脚部半径
  function walkable(x, y) {
    return insidePoly(x, y) && boundaryInfo(x, y).d >= SKIN;
  }

  // 把点击/存档点收进可行走区域：贴边时沿内法线推入，点击边缘外也能走到边上
  function clampIntoWalk(x, y) {
    if (walkable(x, y)) return { x, y };
    const inside = insidePoly(x, y);
    const c = boundaryInfo(x, y);
    const push = inside ? (SKIN + 0.6 - c.d) : (c.d + SKIN + 0.6);
    let px = (inside ? x : c.x) + c.nx * push;
    let py = (inside ? y : c.y) + c.ny * push;
    if (!insidePoly(px, py)) return null;
    const c2 = boundaryInfo(px, py);
    if (c2.d < SKIN) {
      px += c2.nx * (SKIN - c2.d + 0.2);
      py += c2.ny * (SKIN - c2.d + 0.2);
    }
    return { x: px, y: py };
  }

  // 主城阶段预热面板底图：这些大图首次打开时才解码会在手机上造成一次卡顿
  let panelArtWarmed = false;
  function warmPanelArt() {
    if (panelArtWarmed) return;
    panelArtWarmed = true;
    [
      'assets/ui/equip/bg.png',
      'assets/ui/skill/bg.png',
      'assets/ui/secret/bg.png',
      'assets/ui/public/dialog-frame.png'
    ].forEach(src => {
      const img = new Image();
      img.src = src;
      if (img.decode) img.decode().catch(() => {});
    });
  }

  DG.scenes.town = {
    render(root) {
      if (DG.audio) DG.audio.playBgm('lobby');
      warmPanelArt();
      const char = DG.game.char;
      const cls = DG.data.classes[char.cls];
      // 主城阶段提前解码本职业技能音效，进副本第一击即可出声
      if (DG.audio && DG.audio.preloadClass) DG.audio.preloadClass(cls.id);
      const screen = U.el('div', 'screen town-screen');
      const touch = DG.settings.touchEnabled();
      // 角色美术由 art/heroes 注册表提供，新增角色无需改动本文件
      const hero = DG.art.heroFor(cls.id);
      const heroIsCanvas = !!(hero && hero.mode === 'canvas' && hero.canvasDraw);

      // 技能图标全职业共用，装备图标按职业取用（当前职业未配置时回落到文字标识）
      const skillIcon = DG.data.iconFor(cls.id, 'skill');
      const equipIcon = DG.data.iconFor(cls.id, 'equip');
      const need = DG.character.xpNeed(char.level);
      const xpPct = Math.round(DG.character.levelProgress(char) * 100);
      // 底部技能条与战斗内一致：普攻 + 已解锁的主动技能
      const skillList = [DG.data.skills[cls.autoSkill]]
        .concat(cls.skills.filter(id => DG.data.skillUnlocked(char, id)).map(id => DG.data.skills[id]));
      const stripSlots = skillList.map((sk, i) =>
        `<button class="strip-slot" data-skill="${i}" title="${U.escapeHtml(sk.name)}">` +
          (sk.icon
            ? `<img src="${sk.icon}" alt="">`
            : `<span class="strip-glyph">${sk.glyph}</span>`) +
        `</button>`
      ).join('');

      screen.innerHTML = `
        <div class="town-world" data-world>
          <div class="town-map" data-map>
            <div class="town-actor" data-actor>
              ${heroIsCanvas ? '' : '<div class="town-actor-shadow"></div>'}
              <div class="town-actor-art" data-art>${heroIsCanvas
                ? '<canvas class="town-hero-canvas" data-hero-canvas width="480" height="512"></canvas>'
                : heroArt(cls)}</div>
            </div>
          </div>
        </div>

        <header class="town-top">
          <div class="town-zone">
            <button class="town-corner-btn" data-act="settings" aria-label="设置">
              <img src="assets/ui/common/func-settings.png" alt="">
            </button>
            <div class="town-tools">
              <button class="plate-btn pick" id="town-switch">选角</button>
              <button class="plate-btn logout" id="town-logout">登出</button>
            </div>
          </div>
        </header>

        ${DG.ui.combatBarHtml({
          barClass: 'town-combat combat-bar',
          equipIcon, equipAttrs: 'data-act="equipment"',
          skillIcon, skillAttrs: 'data-act="skills"',
          badgeAttrs: 'data-act="character"',
          level: char.level,
          slotsHtml: stripSlots,
          expFill: `<i class="exp-fill" data-xp-fill style="width:${xpPct}%"></i>`,
          expText: `${U.fmt(char.xp)} / ${U.fmt(need)}`
        })}

        <button class="town-portal" data-act="portal" aria-label="秘境副本">
          <img src="assets/ui/func-dungeon.png" alt="">
          <span class="portal-fx" aria-hidden="true">
            <span class="portal-fire"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
            <svg class="portal-bolt" viewBox="0 0 200 200">
              <g class="pb pb-a">
                <path class="pb-glow" d="M26 60 L42 78 L32 86 L50 100 L38 108 L54 122"/>
                <path class="pb-glow" d="M42 78 L33 70"/>
                <path class="pb-core" d="M26 60 L42 78 L32 86 L50 100 L38 108 L54 122"/>
                <path class="pb-core" d="M42 78 L33 70"/>
              </g>
              <g class="pb pb-b">
                <path class="pb-glow" d="M174 60 L158 78 L168 86 L150 100 L162 108 L146 122"/>
                <path class="pb-glow" d="M158 78 L167 70"/>
                <path class="pb-core" d="M174 60 L158 78 L168 86 L150 100 L162 108 L146 122"/>
                <path class="pb-core" d="M158 78 L167 70"/>
              </g>
              <g class="pb pb-c">
                <path class="pb-glow" d="M96 16 L108 38 L96 48 L108 66 L98 76"/>
                <path class="pb-glow" d="M108 38 L118 30"/>
                <path class="pb-core" d="M96 16 L108 38 L96 48 L108 66 L98 76"/>
                <path class="pb-core" d="M108 38 L118 30"/>
              </g>
            </svg>
          </span>
          <span class="tp-label" data-label="秘境副本">秘境副本</span>
        </button>

        <button class="combat-medal quest-medal" data-act="quests" aria-label="任务">
          <span class="medal-glyph">令</span>
          <span class="medal-label" data-label="任务">任务</span>
          <i class="medal-dot${DG.quests && DG.quests.claimableCount(char) > 0 ? '' : ' hidden'}" data-quest-dot></i>
        </button>

        <div class="touch-ui${touch ? '' : ' hidden'}" data-touch>
          <div class="stick-base"></div>
          <div class="stick-knob" data-knob></div>
        </div>`;

      root.replaceChildren(screen);

      // ---------- 地图与角色 ----------
      const world = screen.querySelector('[data-world]');
      const mapEl = screen.querySelector('[data-map]');
      const actor = screen.querySelector('[data-actor]');
      const art = screen.querySelector('[data-art]');
      const heroCanvas = screen.querySelector('[data-hero-canvas]');
      const heroCtx = heroCanvas ? heroCanvas.getContext('2d') : null;
      world.style.width = WORLD_W + 'px';
      world.style.height = WORLD_H + 'px';

      // 进入主城：角色固定落在屏幕正中，不沿用上次离开的位置
      const pos = { x: WORLD_W * START[0], y: WORLD_H * START[1] };
      let camX = 0, dir = 1, target = null, moving = false, phase = 0;
      const keys = Object.create(null);
      const stick = { x: 0, y: 0 };

      const clampCam = () => Math.max(0, Math.min(WORLD_W - VIEW_W, pos.x - VIEW_W / 2));
      const drawHeroArt = (now) => {
        heroCtx.setTransform(2, 0, 0, 2, 0, 0);
        heroCtx.clearRect(0, 0, 240, 256);
        DG.art.heroFor(cls.id).canvasDraw(heroCtx, 120, 240, {
          scale: 0.8,
          flip: dir < 0,
          state: moving ? 'walk' : 'idle',
          t: now / 1000,
          walkPhase: phase,
          shadow: true
        });
      };
      const paint = (now) => {
        if (heroCtx) {
          art.style.transform = 'none';
          drawHeroArt(now);
        } else {
          const bob = moving ? Math.abs(Math.sin(phase)) * 5 : Math.sin(now / 900) * 1.2;
          art.style.transform = `translateY(${-bob}px) scaleX(${dir})`;
        }
        actor.style.transform = `translate3d(${Math.round(pos.x - ACTOR_W / 2)}px, ${Math.round(pos.y - ACTOR_H)}px, 0)`;
        mapEl.style.transform = `translate3d(${-Math.round(camX)}px, 0, 0)`;
      };
      camX = clampCam();
      paint(0);

      // ---------- 移动解算：直接走 → 贴边切向滑行 → 贴边回推，避免边缘卡脚 ----------
      const vel = { x: 0, y: 0 };
      const tryMove = (sx, sy) => {
        if (!sx && !sy) return false;
        const nx = pos.x + sx, ny = pos.y + sy;
        if (walkable(nx, ny)) { pos.x = nx; pos.y = ny; return true; }

        const want = Math.hypot(sx, sy) || 0.0001;

        // 目标点碰到边界：去掉朝墙的法向分量，只保留切向，沿边缘滑行
        const hit = boundaryInfo(nx, ny);
        const into = sx * hit.nx + sy * hit.ny;
        if (into < 0) {
          const tx = sx - hit.nx * into, ty = sy - hit.ny * into;
          if (walkable(pos.x + tx, pos.y + ty)) { pos.x += tx; pos.y += ty; return true; }
        }

        // 已贴住边界：先让出脚部半径，再沿着新的切线滑一小步，避免原地顶墙
        const here = boundaryInfo(pos.x, pos.y);
        if (here.d < SKIN) {
          const px = pos.x + here.nx * (SKIN - here.d + 0.08);
          const py = pos.y + here.ny * (SKIN - here.d + 0.08);
          if (walkable(px, py)) {
            pos.x = px; pos.y = py;
            const into2 = sx * here.nx + sy * here.ny;
            if (into2 < 0) {
              const tx = sx - here.nx * into2, ty = sy - here.ny * into2;
              if (walkable(px + tx, py + ty)) { pos.x += tx; pos.y += ty; }
            }
            return true;
          }
        }
        const into3 = sx * here.nx + sy * here.ny;
        if (into3 < 0) {
          const tx = sx - here.nx * into3, ty = sy - here.ny * into3;
          if (walkable(pos.x + tx, pos.y + ty)) { pos.x += tx; pos.y += ty; return true; }
        }

        // 尖角处左右各探一点，找到能走的方向，避免完全停住
        // 先按大半步找绕角方向，再按小半步补一次，贴着拐角也能一点点挪出去
        const base = Math.atan2(sy, sx);
        for (let pass = 0; pass < 2; pass++) {
          const scale = pass ? 0.34 : 0.7;
          for (let i = 0; i < 4; i++) {
            const a = base + (i < 2 ? 1 : -1) * (i % 2 ? 0.75 : 0.38);
            const px = Math.cos(a) * want * scale, py = Math.sin(a) * want * scale;
            if (walkable(pos.x + px, pos.y + py)) { pos.x += px; pos.y += py; return true; }
          }
        }
        return false;
      };
      const moveBy = (sx, sy) => {
        // 拆成 ≤4px 的子步，转弯与贴边时逐段修正，轨迹更顺滑
        const steps = Math.max(1, Math.ceil(Math.hypot(sx, sy) / 4));
        const ux = sx / steps, uy = sy / steps;
        for (let i = 0; i < steps; i++) {
          if (!tryMove(ux, uy)) {
            // 被墙吃掉的法向速度清零，避免下一帧继续顶着同一面墙
            const c = boundaryInfo(pos.x, pos.y);
            const d = vel.x * c.nx + vel.y * c.ny;
            if (d < 0) { vel.x -= c.nx * d; vel.y -= c.ny * d; }
            break;
          }
        }
      };

      const KEY_DIR = {
        KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
        KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0]
      };
      const onKeyDown = (e) => {
        if (!KEY_DIR[e.code]) return;
        if (!screen.isConnected) return;
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (screen.querySelector('.modal-mask') || document.querySelector('.modal-mask')) return;
        e.preventDefault();
        keys[e.code] = 1;
        target = null;
      };
      const onKeyUp = (e) => {
        if (KEY_DIR[e.code]) keys[e.code] = 0;
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      // 点击地面自动走过去（键鼠模式下最顺手；触屏改用浮动摇杆）
      world.addEventListener('pointerdown', (ev) => {
        if (DG.settings.touchEnabled()) return;
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        if (document.querySelector('.modal-mask')) return;
        const rect = screen.getBoundingClientRect();
        // 舞台可能按屏幕宽高非等比铺满，横竖坐标需分别用各自的缩放比例换算
        const scaleX = rect.width / VIEW_W;
        const scaleY = rect.height / VIEW_H;
        const x = (ev.clientX - rect.left) / scaleX + camX;
        const y = (ev.clientY - rect.top) / scaleY;
        // 点在地图边缘外也能走：把落点收进可站立区域，避免点了没反应
        const p = clampIntoWalk(x, y);
        if (p) target = p;
      });

      // 浮动摇杆：与战斗共用同一套交互（js/ui/stick.js）
      DG.ui.stick(screen, {
        ignore: '.town-top, .combat-bar, .quest-medal, .town-portal, .town-foot, .toast-wrap',
        onMove(x, y) {
          stick.x = x;
          stick.y = y;
          target = null;
        },
        onEnd() {
          stick.x = 0;
          stick.y = 0;
        }
      });

      let raf = 0, last = 0;
      const tick = (now) => {
        if (!screen.isConnected) {
          window.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('keyup', onKeyUp);
          cancelAnimationFrame(raf);
          return;
        }
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;

        let dx = 0, dy = 0;
        const busy = !!document.querySelector('.modal-mask');
        if (!busy) {
          for (const code in KEY_DIR) {
            if (keys[code]) { dx += KEY_DIR[code][0]; dy += KEY_DIR[code][1]; }
          }
          dx += stick.x;
          dy += stick.y;
          if (!dx && !dy && target) {
            const tx = target.x - pos.x, ty = target.y - pos.y;
            const d = Math.hypot(tx, ty);
            if (d < 8) { target = null; vel.x = 0; vel.y = 0; }
            else {
              // 接近目标点前线性减速，避免平滑速度冲过头
              const sp = Math.min(1, d / 42);
              dx = tx / d * sp;
              dy = ty / d * sp;
            }
          }
        }
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        const wantMove = len > 0.03;

        // 主城移速固定取职业基础移速：不读取装备/天赋加成，与战斗基础移速保持一致
        const walkSpeed = cls.base.moveSpeed;
        // 速度指数平滑：起步与刹车都有极短的加速/减速，避免一键一停的顿挫
        const accel = dt > 0 ? 1 - Math.exp(-dt / 0.07) : 0;
        vel.x += (dx * walkSpeed - vel.x) * accel;
        vel.y += (dy * walkSpeed - vel.y) * accel;
        if (!wantMove && Math.hypot(vel.x, vel.y) < 10) { vel.x = 0; vel.y = 0; }
        const vlen = Math.hypot(vel.x, vel.y);

        const beforeX = pos.x, beforeY = pos.y;
        if (dt > 0 && vlen > 0.5) {
          moveBy(vel.x * dt, vel.y * dt);
          if (vel.x > 12) dir = 1;
          else if (vel.x < -12) dir = -1;
        }
        // 是否有真实位移：顶死在墙角时不再原地踏步
        const stepped = Math.hypot(pos.x - beforeX, pos.y - beforeY);
        moving = stepped > 0.2;
        // 步频与实际移速成正比：与战斗同一公式，保证同一角色两边走路完全一致
        if (moving) phase += dt * 11 * walkSpeed / WALK_REF_SPEED;
        else if (vlen < 1) phase = 0;

        const camTarget = clampCam();
        if (dt <= 0) camX = camTarget;
        else camX += (camTarget - camX) * (1 - Math.exp(-dt / 0.06));
        paint(now);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      // ---------- 面板操作后局部刷新 ----------
      const refresh = () => {
        const set = (sel, val) => {
          const el = screen.querySelector(sel);
          if (el) el.textContent = val;
        };
        const pct = Math.round(DG.character.levelProgress(char) * 100);
        set('[data-xp-num]', `${U.fmt(char.xp)} / ${U.fmt(DG.character.xpNeed(char.level))}`);
        const fill = screen.querySelector('[data-xp-fill]');
        if (fill) fill.style.width = pct + '%';
        const touchUI = screen.querySelector('[data-touch]');
        if (touchUI) touchUI.classList.toggle('hidden', !DG.settings.touchEnabled());
      };

      screen.querySelector('#town-logout').addEventListener('click', () => DG.game.logout());
      screen.querySelector('#town-switch').addEventListener('click', () => DG.game.gotoCharacter());
      // 底部技能条：点击任意技能格查看 / 升级技能
      screen.querySelectorAll('[data-skill]').forEach(btn => {
        btn.addEventListener('click', () => DG.ui.openSkills(char, refresh));
      });

      screen.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-act');
          if (act === 'portal') {
            DG.ui.openDungeonSelect(char, (def) => {
              DG.game.startDungeon(def);
            });
          } else if (act === 'character') {
            DG.ui.openCharacterInfo(char);
          } else if (act === 'equipment') {
            DG.ui.openEquipment(char, refresh);
          } else if (act === 'skills') {
            DG.ui.openSkills(char, refresh);
          } else if (act === 'quests') {
            DG.ui.openQuests(char, refresh);
          } else if (act === 'settings') {
            DG.ui.openControls(refresh);
          }
        });
      });

      if (!DG.scenes.town._welcomed) {
        DG.scenes.town._welcomed = true;
        setTimeout(() => DG.ui.toast('在营地内走动看看，点击右侧的「秘境副本」或底部图标打开功能', 'gold'), 400);
      }
    },

    reset() {
      DG.scenes.town._welcomed = false;
    }
  };
})();


;
/* ==== js/scenes/dungeon/index.js ==== */
/* 副本战斗 · 场景核心：状态初始化、生命周期、主循环与结算 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  DG.scenes = DG.scenes || {};

  // 场景按最大屏 810×1680 绘制，小尺寸屏幕由舞台裁边显示，保证边缘永远有背景
  const W = 810;
  const H = 1680;
  // 网格秘境：5×3 个地块（每块 18×32 格，720×1280px）拼成整体近方形
  // 地图 3600×3840（0.94:1），横向 5 块即到边，路线更短更直
  const ARENA_W = 3600;
  const ARENA_H = 3840;

  // 消耗条：不同职业颜色与回复速度不同，只有带 energy 的技能才会消耗
  // 野蛮人为怒气条（橙色），游侠为精力（绿），术士为法力（蓝）
  const ENERGY_BY_CLASS = {
    ranger: { color: '#7ec97f', regen: 16 },
    warrior: { color: '#e9782b', regen: 12 },
    mage: { color: '#7fa8e6', regen: 14 }
  };

  class DungeonScene {
    constructor(opts) {
      this.char = opts.char;
      this.def = opts.def;
      // 本关难度曲线：怪物数量不变，只按关卡进度缩放小怪/首领强度
      this.tune = DG.data.stageTuning(this.def);
      this.onFinish = opts.onFinish;
      this.root = opts.root;
      this.canvas = DG.game.canvas;
      // 战斗场景整体提亮约 10%（CSS 滤镜在线性空间计算，1.15 对应画面亮度 +10%）
      this.canvas.style.filter = 'brightness(1.15)';
      this.ctx = this.canvas.getContext('2d');

      this.stats = DG.stats.compute(this.char);
      this.cls = DG.data.classes[this.char.cls];
      const es = ENERGY_BY_CLASS[this.cls.id] || { color: '#7ec97f', regen: 12 };
      const ENERGY = { max: 100, color: es.color, regen: es.regen };
      this.basicSkill = DG.data.skills[this.cls.autoSkill];
      // 关卡设计：waves 表示本关期望的怪群规模，越靠后的关卡每群多放 0~2 只
      const wv = this.def.waves || [6, 8];
      this.extraPerPack = Math.max(0, Math.round(((wv[0] + wv[1]) / 2 - 8) * 0.6));
      // 技能栏：普攻 + 已解锁的主动技能（主技能按角色等级解锁）
      this.activeSkills = this.cls.skills
        .filter(id => DG.data.skillUnlocked(this.char, id))
        .map(id => DG.data.skills[id]);
      this.skillList = [this.basicSkill, ...this.activeSkills];

      // 先生成随机房间走廊地图，玩家出生在首个房间中央
      this.generateMap();
      this.loadMapArt(this.def.mapStyle || 'grove');
      // 只预载本副本会用到的怪物贴图，避免每进一次副本就解码全部小怪资源
      if (DG.art && DG.art.monsters && DG.art.monsters.preload) {
        const warmIds = [];
        const minions = DG.data.bossMinions || {};
        [].concat(this.def.pool || [], this.def.elitePool || [], this.def.bossPool || []).forEach((id) => {
          if (id) warmIds.push(id);
        });
        const bosses = [].concat(this.def.bossPool || [], this.def.bossId ? [this.def.bossId] : []);
        bosses.forEach((id) => {
          if (minions[id]) warmIds.push(minions[id]);
        });
        const artIds = [];
        warmIds.forEach((id) => {
          const mon = DG.data.monsters[id];
          if (mon && mon.art && !mon.boss && artIds.indexOf(mon.art) < 0) artIds.push(mon.art);
        });
        DG.art.monsters.preload(artIds);
      }
      // 只预热本副本首领池的贴图，避免进一次副本就把全部首领解码进内存
      if (DG.art && DG.art.bosses && DG.art.bosses.preload) {
        DG.art.bosses.preload([].concat(this.def.bossPool || [], this.def.bossId ? [this.def.bossId] : []).filter(Boolean));
      }
      // 死亡骨头图集：进副本时就解码切片，避免首次击杀时才卡一下
      if (DG.art && DG.art.bones) DG.art.bones.load();
      // 出生在被标记为 entrance 的地块中央：该块不刷怪，保证开局安全
      const startChunk = this.chunks.find(ch => ch.id === 'entrance') || this.chunks[0];
      const startRoom = this.rooms[startChunk.index] || { cx: this.chunks[0].px + this.chunkW / 2, cy: this.chunks[0].py + this.chunkH / 2 };
      this.player = {
        x: startRoom.cx, y: startRoom.cy, r: 14,
        hp: this.stats.maxHp, maxHp: this.stats.maxHp,
        // 精力/消耗条：只用带 energy 消耗的技能才会扣减，游侠为绿色
        stam: ENERGY.max, maxStam: ENERGY.max,
        facing: 0, invuln: 0,
        // 角色动作：移动 / 朝向 / 出手
        moving: false, walkPhase: 0, flip: false, atkAnim: 0,
        // 受击硬直与后退：hurtT 剩余硬直时间，kbX/kbY 后退速度
        hurtT: 0, kbX: 0, kbY: 0,
        // 连续受击：3 秒窗口内再次被击中会削弱反馈并取消击退
        hurtChain: 0, hurtChainT: 0, hurtWeak: false,
        // 冰缓：精英「冰冻」词缀命中后短暂减速
        chillT: 0
      };
      this.energy = ENERGY;
      this.camera = { x: this.player.x, y: this.player.y };
      // 记录出生点：开局附近要留出安全区，让玩家先走一段再遭遇战斗
      this.spawnPoint = { x: this.player.x, y: this.player.y };
      // 战斗视角：视野放宽到约 655×1309 世界像素，一屏可并排容纳两只首领
      this.zoom = 1.1;
      this.revealAt(this.player.x, this.player.y, 8);
      this.updateFogTexture();
      this.computeFlow(this.player.x, this.player.y);

      this.monsters = [];
      this.projectiles = [];
      this.effects = [];
      this.tornadoes = [];
      this.dangerZones = [];
      this.floaters = [];
      this.drops = [];
      this.bones = [];
      // 天气：进入副本时掷一次，整局不变
      this.rollWeather();
      // 精英词缀与场地机制：词缀每关 1~2 条，场地机制只在 5 的倍数关出现
      this.rollStageAffixes();
      this.rollField();
      // 血迹：本图随机一组美术序列，受伤时铺在怪物脚下
      this.initBlood();

      this.keys = {};
      this.mouse = { x: W / 2 + 120, y: H / 2, moved: false };
      this.attackHeld = false;
      this.moveTarget = null;              // 左键点地走位目标
      this.moveVec = { x: 0, y: 0 };       // 虚拟摇杆方向（-1..1）
      this.moveDirAngle = null;            // 本帧移动方向（未移动为 null）
      this.stickId = null;
      this.lastInput = 'mouse';            // mouse | touch
      this.autoMode = false;
      this.autoTarget = null;
      this.autoGoal = null;
      this.autoPack = null;
      this.autoSteer = null;
      this.autoEvade = null;
      this.autoHoldingRange = false;
      this.autoBlocked = 0;
      this.autoDetour = null;
      this.autoDecision = null;
      this.autoKiteHeld = false;
      this.autoKiteSide = 0;
      this.autoRescueCd = 0;
      this.autoStuckAt = 0;
      this.autoExploreUntil = 0;
      this.autoIgnore = null;
      this.autoIgnoreUntil = 0;
      this.autoIgnorePack = null;
      this.autoIgnorePackUntil = 0;

      this.attackCd = 0;
      // 索引与 skillList 对齐；0 号位（普攻）沿用 attackCd，其余为主动技能冷却
      this.skillCd = this.skillList.map(() => 0);

      this.phase = 'wave';
      this.phaseTimer = 0;

      this.time = 0;
      this.kills = 0;
      this.goldEarned = 0;
      this.xpEarned = 0;
      this.items = [];
      this.skillUps = [];
      // 战斗内升级记录（供结算展示）与升级光环剩余时长
      this.levelUps = [];
      this.levelFx = 0;

      this.paused = false;
      this.finished = false;
      this.ending = false;
      this.finishTimer = 0;
      this.victory = false;
      this.defeat = false;
      this.shake = 0;
      this.hurtFlash = 0;
      this.bossFlash = 0;
      this.hudTimer = 0;
      this.bagWarnCd = 0;

      // 天赋：进入副本时固化一次，战斗内不再变化
      this.talents = this.stats.talents || DG.talents.mods(this.char);
      this.talentTimers = {
        killRush: 0, chargeHaste: 0, chargeCrit: 0, rollHaste: 0, postHurt: 0,
        fortify: 0, voidGuard: 0, unyieldingCd: 0, voidCd: 0
      };
      this.basicCount = 0;
      this.overloadCount = 0;
      this._overloadCast = false;

      this.decor = this.makeDecor();
      // 按块内容：先定怪群配置（含密室随机方案），再据此放宝箱
      this.chunkPacks = this.makeChunkPacks();
      // 首领降临门槛 = 本图计划刷出的全部小怪（含密室精英与天气/关卡加成）。
      // 顶部进度条按击杀数推进，杀满后首领才现身。
      this.bossKillGoal = this.chunkPacks.reduce((n, p) => {
        const base = p.count > 0
          ? p.count + (this.wxPackBonus || 0) + (this.extraPerPack || 0)
          : 0;
        return n + Math.max(0, base) + (p.elite || 0);
      }, 0);
      this.chests = this.makeChests();
      // 动态装饰：角色之上的可破坏路线装饰，以及地图外黑域装饰
      this.sceneProps = this.makeSceneProps();
      // 校验宝箱 / 怪群 / 首领场地未被立件碰撞体封死（极窄布局会放弃道具碰撞）
      this.ensureCriticalReachable();
      // 地形整体烘焙成静态贴图，运行时只做一次贴图拷贝
      this.bakeTerrain();
      this.buildHud();
      this.bind();
      if (DG.audio) {
        DG.audio.playBgm('battle');
        // 进副本即预热本职业技能音效，保证第一击就有声
        DG.audio.preloadClass(this.cls.id);
        // 升级音效提前解码：首次升级往往发生在开打后不久，避免因未解码被丢弃
        DG.audio.preloadKeys(['stageLevelup', 'uiLevelup']);
      }
      this.announce(`${this.def.name} · 开始探索`, 2000);
      if (this.wxRule && this.wxRule.desc) {
        // 天气带来玩法变化，入场时明确告知；计时器需在离场时清理，避免回调落到已销毁场景
        this._wxTimer = setTimeout(() => {
          if (!this.finished && this.hud) this.announce(`天气 · ${this.weatherName}｜${this.wxRule.desc}`, 2600);
        }, 2300);
      }
      if (this.eliteAffixText) {
        this._affixTimer = setTimeout(() => {
          if (!this.finished && this.hud) this.announce(`精英词缀 · ${this.eliteAffixText}`, 2400);
        }, 4600);
      }
      if (this.field) {
        this._fieldTimer = setTimeout(() => {
          if (!this.finished && this.hud) this.announce(`场地 · ${this.field.name}｜${this.field.desc}`, 2800);
        }, 6600);
      }
      this.updateHud();
    }

    retreat() {
      if (this.finished) return;
      this.setPaused(false);
      this.ending = true;
      this.victory = false;
      this.finishTimer = 0.25;
      this.attackHeld = false;
      this.moveTarget = null;
      this.moveVec.x = 0;
      this.moveVec.y = 0;
      this.announce('正在撤离……', 900);
    }

    buildResult() {
      return {
        victory: this.victory,
        retreat: !this.victory && !this.defeat,
        defeat: this.defeat,
        kills: this.kills,
        time: Math.round(this.time),
        xp: Math.round(this.xpEarned),
        gold: Math.round(this.goldEarned),
        items: this.items.slice(),
        skillUps: this.skillUps.slice(),
        levels: this.levelUps.slice()
      };
    }

    finishNow() {
      if (this.finished) return;
      this.finished = true;
      // 兜底补记通关：首领倒下时已记录过一次，这里只在缺失时补写，
      // 防止任何异常路径导致「打赢了却没解锁下一关」
      if (this.victory && DG.quests && this.char && this.def &&
        !(this.char.cleared && this.char.cleared[this.def.id])) {
        DG.quests.onStageClear(this.char, this.def.id);
        if (DG.game && DG.game.save) DG.game.save();
      }
      const result = this.buildResult();
      this.dispose();
      if (this.onFinish) this.onFinish(result);
    }

    dispose() {
      // 离开副本时只淡出天气环境音并解除暂停压低；
      // BGM 由后续场景或结算流程接管，避免出现无声空档
      if (DG.audio) {
        DG.audio.setBattlePaused(false);
        DG.audio.stop();
      }
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('mouseup', this._onMouseUp);
      window.removeEventListener('blur', this._onBlur);
      if (this._unsubSettings) {
        this._unsubSettings();
        this._unsubSettings = null;
      }
      if (this.canvas) {
        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
        if (this._onContextMenu) this.canvas.removeEventListener('contextmenu', this._onContextMenu);
        this.canvas.style.cursor = 'default';
        this.canvas.style.touchAction = '';
        // 离开副本恢复画布亮度，避免影响城镇与菜单
        this.canvas.style.filter = '';
      }
      this.attackHeld = false;
      this.moveVec.x = 0;
      this.moveVec.y = 0;
      clearTimeout(this._annTimer);
      clearTimeout(this._wxTimer);
      clearTimeout(this._affixTimer);
      clearTimeout(this._fieldTimer);
      if (this._stick) {
        this._stick.destroy();
        this._stick = null;
      }
      if (this.hud && this.hud.parentNode) this.hud.remove();
      this.hud = null;
      // 释放地块贴图与烘焙用画布，避免离场后仍占着显存
      if (this._chunkCache) this._chunkCache.clear();
      this._chunkCache = null;
      this._warmCanvas = null;
      this._warmCtx = null;
      // 整屏渐变、小地图、描边路径等缓存体积较大：离场立即置空，尽快释放显存
      this._glowCache = null;
      this._edgeFade = null;
      this._vignetteImg = null;
      this._bossVignette = null;
      this._minimapCanvas = null;
      this._outline = null;
      this._drawMonsters = null;
      this._bandList = null;
      this._separationGrid = null;
      this._hudCache = null;
      this.sceneProps = null;
      this.tornadoes = null;
      this.monsters = null;
      this.projectiles = null;
      this.effects = null;
      this.floaters = null;
      this.drops = null;
      this.bones = null;
      this.blood = null;
      const toastWrap = document.getElementById('toast-wrap');
      if (toastWrap) toastWrap.classList.remove('in-battle');
    }

    update(dt) {
      if (this.paused || this.finished) return;

      this.time += dt;
      this.attackCd = Math.max(0, this.attackCd - dt);
      for (let i = 1; i < this.skillCd.length; i++) {
        this.skillCd[i] = Math.max(0, this.skillCd[i] - dt);
      }
      this.player.invuln = Math.max(0, this.player.invuln - dt);
      // 连续受击窗口：3 秒内无新受击则恢复正常受击反馈
      this.player.hurtChainT = Math.max(0, (this.player.hurtChainT || 0) - dt);
      if (this.player.hurtChainT <= 0) { this.player.hurtChain = 0; this.player.hurtWeak = false; }
      this.player.chillT = Math.max(0, this.player.chillT - dt);
      this.player.atkAnim = Math.max(0, (this.player.atkAnim || 0) - dt);
      // 受击硬直：按当前后退速度位移并衰减
      if (this.player.hurtT > 0) {
        this.player.hurtT = Math.max(0, this.player.hurtT - dt);
        this.movePlayer(this.player, this.player.kbX * dt, this.player.kbY * dt, this.player.r);
        const damp = Math.max(0, 1 - dt * 7);
        this.player.kbX *= damp;
        this.player.kbY *= damp;
        if (this.player.hurtT <= 0) { this.player.kbX = 0; this.player.kbY = 0; }
      }
      this.shake = Math.max(0, this.shake - dt * 2);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
      this.bossFlash = Math.max(0, this.bossFlash - dt);
      this.bagWarnCd = Math.max(0, this.bagWarnCd - dt);
      this.autoRescueCd = Math.max(0, (this.autoRescueCd || 0) - dt);
      this.tickTalentTimers(dt);
      this.hudTimer -= dt;

      if (this.ending) {
        this.finishTimer -= dt;
        this.updateDrops(dt);
        this.updateEffects(dt);
        this.updateFloaters(dt);
        this.updateBlood(dt);
        this.updateBones(dt);
        this.updateWeather(dt);
        this.updateCamera(dt);
        if (this.finishTimer <= 0) this.finishNow();
        return;
      }

      // 回复
      if (this.player.hp > 0) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.stats.hpRegen * dt);
        this.player.stam = Math.min(this.player.maxStam, this.player.stam + this.energy.regen * dt);
      }

      // 移动：手动输入优先；未输入时自动模式追击最近敌人
      const k = this.keys;
      let mx = 0, my = 0, moveFactor = 1;
      const kx = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
      const ky = (k['KeyS'] || k['ArrowDown'] ? 1 : 0) - (k['KeyW'] || k['ArrowUp'] ? 1 : 0);
      if (kx || ky) {
        if (this.autoMode) {
          this.autoMode = false;
          this.autoTarget = null;
          this.syncAutoButton();
        }
        this.moveTarget = null;
        const len = Math.hypot(kx, ky);
        mx = kx / len;
        my = ky / len;
      } else {
        const mag = Math.hypot(this.moveVec.x, this.moveVec.y);
        if (mag > 0.15) {
          if (this.autoMode) {
            this.autoMode = false;
            this.autoTarget = null;
            this.syncAutoButton();
          }
          this.moveTarget = null;
          mx = this.moveVec.x / mag;
          my = this.moveVec.y / mag;
          moveFactor = Math.min(1, (mag - 0.15) / 0.6);
        } else if (this.moveTarget) {
          if (this.autoMode) {
            this.autoMode = false;
            this.autoTarget = null;
            this.syncAutoButton();
          }
          const dx = this.moveTarget.x - this.player.x;
          const dy = this.moveTarget.y - this.player.y;
          const d = Math.hypot(dx, dy);
          if (d <= 6) {
            this.moveTarget = null;
          } else {
            mx = dx / d;
            my = dy / d;
          }
        } else if (this.autoMode) {
          this.autoWatchStuckMonsters(dt);
          const auto = this.autoMoveDirection();
          mx = auto.x;
          my = auto.y;
        }
      }
      if (this.player.hurtT > 0) { mx = 0; my = 0; moveFactor = 0; }
      if (mx || my) {
        const step = this.moveSpeedNow() * moveFactor * dt;
        const beforeX = this.player.x, beforeY = this.player.y;
        this.movePlayer(this.player, mx * step, my * step, this.player.r);
        if (this.autoMode) {
          const moved = Math.hypot(this.player.x - beforeX, this.player.y - beforeY);
          this.autoBlocked = moved < Math.min(1.5, step * 0.16) ? this.autoBlocked + dt : 0;
        }
      } else if (this.autoMode) {
        this.autoBlocked = Math.max(0, this.autoBlocked - dt * 2);
      }
      this.breakPropsAt(this.player.x, this.player.y, this.player.r + 8);
      // 记录移动方向：自动出手只朝这个方向索敌，避免转身向后放技能
      this.moveDirAngle = (mx || my) ? Math.atan2(my, mx) : null;
      this.updateExploration(dt);
      this.updateFlow(dt);

      // 朝向：移动时始终朝向移动方向，避免倒着跑；静止时键鼠跟随鼠标
      if (this.moveDirAngle != null) {
        this.player.facing = this.moveDirAngle;
      } else if (!DG.settings.touchEnabled() && this.mouse.moved) {
        this.player.facing = U.angle(this.player, this.aimPos());
      }

      // 动作状态：移动时走路，静止时待机；左右翻转带迟滞，避免正上/正下瞄准时闪烁
      this.player.moving = !!(mx || my);
      if (this.player.moving) {
        // 步频与实际移速成正比：330px/s 对应 11rad/s（步幅 30px/rad），
        // 保证任何移速下步幅不变、只改变迈步频率；战斗基础移速与主城同源
        const ratio = this.moveSpeedNow() * moveFactor / 330;
        this.player.walkPhase += dt * 11 * ratio;
      }
      const sideways = Math.cos(this.player.facing);
      if (sideways > 0.18) this.player.flip = false;
      else if (sideways < -0.18) this.player.flip = true;

      // 普攻与 5 个技能统一自动释放（自动索敌）；硬直期间无法出手
      if (this.player.hurtT <= 0) this.autoCast();

      // 键鼠模式保留右键手动补普攻（自动无目标时仍可手动出手）
      if (!DG.settings.touchEnabled() && this.attackHeld && this.attackCd <= 0 && this.player.hp > 0 && this.player.hurtT <= 0) {
        this.doBasic(U.angle(this.player, this.aimPos()));
      }

      this.updateWhirl(dt);
      this.updateTornadoes(dt);
      this.updateRoar(dt);
      this.updateChop(dt);
      this.updateMonsters(dt);
      this.updateProjectiles(dt);
      this.updateDrops(dt);
      this.updateEffects(dt);
      this.updateFloaters(dt);
      this.updateBlood(dt);
      this.updateBones(dt);
      this.updateWeather(dt);
      this.updateField(dt);
      this.updateChunkSpawns();
      this.updateChests(dt);
      this.updateWaves(dt);
      this.updateCamera(dt);

      this.compactMonsters();

      this.tickRenderQuality(dt);

      if (this.hudTimer <= 0) {
        this.updateHud();
        this.hudTimer = 0.1;
      }
    }

    // 原地压缩死亡怪物，避免每帧 filter 产生新数组触发 GC
    compactMonsters() {
      const list = this.monsters;
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        if (!list[i].dead) list[n++] = list[i];
      }
      list.length = n;
    }

    updateCamera(dt) {
      // 镜头不做边界钳制：走到地图边缘也保持角色居中，
      // 场景外由 drawGround 的纯黑底铺满，形成扩大的黑色留白
      const t = Math.min(1, dt * 9);
      this.camera.x = U.lerp(this.camera.x, this.player.x, t);
      this.camera.y = U.lerp(this.camera.y, this.player.y, t);
    }

    // 自适应画质：连续掉帧时降低画布像素量（CSS 尺寸不变）优先保证流畅。
    // 下限固定为 1 倍原生分辨率，绝不再往下降——低于 1 倍会让角色边缘明显发糊。
    // 帧率有余量时再逐步升回设备原生倍率，避免一次降档后整局都糊。
    tickRenderQuality(dt) {
      // 开局资源解码与地形烘焙阶段不参与判定，避免误降
      if (this.time < 3) return;
      const q = this._rq || (this._rq = { n: 0, sum: 0, slow: 0, fast: 0 });
      q.n++;
      q.sum += dt;
      if (q.n < 45) return;
      const avg = (q.sum / q.n) * 1000;
      q.n = 0;
      q.sum = 0;
      const G = DG.game;
      if (!G || !G.setRenderScale) return;
      const cur = G.renderScale || 1;
      const native = G.nativeRenderScale ? G.nativeRenderScale() : 1;
      if (avg > 18.2) {
        // 连续两个观察窗都不到 55fps 才降档，避免偶发卡顿误判
        q.slow++;
        q.fast = 0;
        if (q.slow >= 2 && cur > 1) {
          G.setRenderScale(Math.max(1, cur - 0.15));
          q.slow = 0;
        }
      } else {
        q.slow = 0;
        // 稳定 69fps 以上连续三个观察窗，才尝试升回原生倍率
        if (avg < 14.5 && cur < native - 0.01) {
          q.fast++;
          if (q.fast >= 3) {
            G.setRenderScale(Math.min(native, cur + 0.15));
            q.fast = 0;
          }
        } else {
          q.fast = 0;
        }
      }
    }

    frame(dt) {
      // 结算 / 撤退在 update 内就会 finishNow 并释放资源：
      // 此时不能再往下走预取和绘制，否则会访问已清空的缓存
      if (this.finished) return;
      this.update(dt);
      if (this.finished) return;
      this.maybePrefetchChunk(dt);
      this.draw();
    }
  }

  DG.scenes.dungeon = DungeonScene;
  // 竞技场尺寸等常量，供拆分后的子模块共享
  DG.scenes.dungeon.size = { W, H, ARENA_W, ARENA_H };
})();


;
/* ==== js/scenes/dungeon/talents.js ==== */
/* 副本战斗 · 天赋层：关键天赋触发、技能范围/冷却/数量修正 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
    talentMods() {
      return this.talents || (this.talents = DG.talents.mods(this.char));
    },
    hasTalent(flag) {
      return !!this.talentMods().flags[flag];
    },
    talentStat(key) {
      return this.talentMods().stats[key] || 0;
    },
    skillModOf(skillId) {
      return this.talentMods().skills[skillId] || {};
    },

    // 计时器统一在这里推进，避免散落到各职责模块
    tickTalentTimers(dt) {
      const t = this.talentTimers;
      for (const k in t) {
        if (t[k] > 0) t[k] = Math.max(0, t[k] - dt);
      }
    },

    moveSpeedNow() {
      let speed = this.stats.moveSpeed;
      const t = this.talentTimers;
      if (t.killRush > 0) speed *= 1.15;
      if (t.postHurt > 0) speed *= 1.2;
      if (this.whirl) speed *= 1.3;              // 旋风期间移速提升 30%
      if (this.player && this.player.chillT > 0) speed *= 0.72;   // 精英冰冻
      if (this.playerSlowT > 0) speed *= (this.playerSlowMul || 1);
      if (this.fieldZoneBoost > 1) speed *= this.fieldZoneBoost;  // 风带加速
      return speed;
    },

    attackSpeedNow() {
      let speed = this.stats.attackSpeed;
      const t = this.talentTimers;
      if (t.chargeHaste > 0 || t.rollHaste > 0) speed *= 1.2;
      return Math.min(3.2, speed);
    },

    skillCooldown(sk) {
      const cap = sk.id === 'whirlwind' ? 100 : 50;
      const cdr = Math.min(cap, this.talentStat('cdrPct') + (this.skillModOf(sk.id).cdrPct || 0));
      return (sk.cooldown || 0) * (1 - cdr / 100);
    },

    skillRadius(sk) {
      return (sk.radius || 0) * (1 + (this.skillModOf(sk.id).radiusPct || 0) / 100);
    },

    skillCount(sk) {
      return (sk.count || 0) + (this.skillModOf(sk.id).countBonus || 0);
    },

    skillSlowFactor(sk, base) {
      return Math.min(0.95, (base || 0) + (this.skillModOf(sk.id).slowPct || 0) / 100);
    },

    skillSlowDur(sk) {
      return (sk.slowDur || 0) * (1 + (this.skillModOf(sk.id).slowDurPct || 0) / 100);
    },

    // 技能树 / 流派词缀：近战弧度、投射物穿透、位移距离
    skillArc(sk) {
      return (sk.arc || 0) * (1 + (this.skillModOf(sk.id).arcPct || 0) / 100);
    },

    skillPierce(sk) {
      return (sk.pierce || 0) + (this.skillModOf(sk.id).pierceBonus || 0);
    },

    skillDist(sk) {
      return (sk.dist || 0) * (1 + (this.skillModOf(sk.id).distPct || 0) / 100);
    },

    // 虚化：生命过低时自动闪现脱离，并重置闪现冷却
    voidShift() {
      const near = this.nearestMonster();
      const ang = near ? U.angle(near, this.player) : this.player.facing + Math.PI;
      const steps = 16;
      const stepLen = 13;
      for (let i = 0; i < steps; i++) {
        this.movePlayer(this.player, Math.cos(ang) * stepLen, Math.sin(ang) * stepLen, this.player.r);
      }
      this.player.invuln = Math.max(this.player.invuln, 0.6);
      const blinkIdx = this.skillList.findIndex(s => s.id === 'blink');
      if (blinkIdx > 0) this.skillCd[blinkIdx] = 0;
      this.talentTimers.voidCd = 60;
      if (this.hasTalent('voidGuard')) this.talentTimers.voidGuard = 2;
      this.addRing(this.player.x, this.player.y, 12, 70, '#b79be0', 0.45);
      this.addBurst(this.player.x, this.player.y, '#b79be0', 10);
      this.addFloater(this.player.x, this.player.y - 40, '虚化', '#c9a7f5', 24);
    }
  });
})();


;
/* ==== js/scenes/dungeon/terrain.js ==== */
/* 副本战斗 · 地形层：房间走廊随机地图、墙体碰撞、寻路流场与探索迷雾 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  const TILE = 40;
  const COLS = Math.floor(ARENA_W / TILE);
  const ROWS = Math.floor(ARENA_H / TILE);
  const FLOOR = 1;
  const INF = 999999;
  // 绕墙试探角度：常量提到模块级，避免每帧每只怪都新建一次数组（GC 抖动）
  const STEER_OFFSETS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, 2.25, -2.25];

  // 三套地貌风格：只改配色，结构与规则完全一致
  const STYLES = {
    grove: {
      void: '#050a08',
      floor: ['#16221b', '#17241d', '#152019'],
      wall: ['#0c1410', '#0e1713'],
      edge: 'rgba(134,168,140,0.13)',
      accent: 'rgba(201,162,95,0.10)',
      fog: 'rgba(3,7,5,0.94)',
      fogEdge: 'rgba(3,7,5,0.6)'
    },
    crypt: {
      void: '#060809',
      floor: ['#171c22', '#181e25', '#151a20'],
      wall: ['#0b0f13', '#0d1216'],
      edge: 'rgba(128,150,178,0.14)',
      accent: 'rgba(150,170,210,0.09)',
      fog: 'rgba(3,5,7,0.94)',
      fogEdge: 'rgba(3,5,7,0.6)'
    },
    abyss: {
      void: '#0a0605',
      floor: ['#1e1715', '#211917', '#1a1312'],
      wall: ['#120d0c', '#150f0e'],
      edge: 'rgba(180,124,102,0.14)',
      accent: 'rgba(201,120,95,0.10)',
      fog: 'rgba(6,3,3,0.94)',
      fogEdge: 'rgba(6,3,3,0.6)'
    },
    // 炼狱：紫焰与紫风
    inferno: {
      void: '#0a0511',
      floor: ['#1d1426', '#20172b', '#191120'],
      wall: ['#120b19', '#150d1d'],
      edge: 'rgba(192,142,236,0.16)',
      accent: 'rgba(214,124,255,0.10)',
      fog: 'rgba(9,4,15,0.94)',
      fogEdge: 'rgba(9,4,15,0.6)'
    },
    // 大雪天：蓝白雪原
    snowfield: {
      void: '#060b12',
      floor: ['#1a2532', '#1d2937', '#18222e'],
      wall: ['#0d151e', '#101923'],
      edge: 'rgba(176,210,244,0.18)',
      accent: 'rgba(226,240,255,0.12)',
      fog: 'rgba(7,12,20,0.90)',
      fogEdge: 'rgba(7,12,20,0.58)'
    },
    // 地狱：赤红与血雨
    hell: {
      void: '#0d0403',
      floor: ['#251210', '#291613', '#20100e'],
      wall: ['#150908', '#190b0a'],
      edge: 'rgba(236,112,92,0.18)',
      accent: 'rgba(255,92,62,0.12)',
      fog: 'rgba(12,3,2,0.94)',
      fogEdge: 'rgba(12,3,2,0.6)'
    },
    // 大草原：青绿与飞草
    savanna: {
      void: '#04100b',
      floor: ['#12281e', '#152c21', '#10241b'],
      wall: ['#091710', '#0b1c14'],
      edge: 'rgba(126,228,190,0.16)',
      accent: 'rgba(224,204,124,0.10)',
      fog: 'rgba(4,14,10,0.90)',
      fogEdge: 'rgba(4,14,10,0.58)'
    },
    // 深秋：橘色枫林
    autumn: {
      void: '#0d0804',
      floor: ['#271e14', '#2b2117', '#231a11'],
      wall: ['#160f09', '#19120b'],
      edge: 'rgba(238,178,112,0.16)',
      accent: 'rgba(255,152,72,0.11)',
      fog: 'rgba(12,7,3,0.93)',
      fogEdge: 'rgba(12,7,3,0.58)'
    }
  };

  // 卡通地面配色：纯色底 + 大色块 + 草叶记号
  STYLES.grove.ground = '#3d3b23';
  STYLES.grove.groundHi = 'rgba(88,84,48,0.38)';
  STYLES.grove.groundLo = 'rgba(42,41,24,0.42)';
  STYLES.grove.mark = 'rgba(47,68,42,0.5)';
  STYLES.crypt.ground = '#2b3039';
  STYLES.crypt.groundHi = 'rgba(60,68,80,0.38)';
  STYLES.crypt.groundLo = 'rgba(28,32,38,0.42)';
  STYLES.crypt.mark = 'rgba(58,76,86,0.45)';
  STYLES.abyss.ground = '#3a2a22';
  STYLES.abyss.groundHi = 'rgba(86,60,46,0.38)';
  STYLES.abyss.groundLo = 'rgba(38,26,20,0.42)';
  STYLES.abyss.mark = 'rgba(96,60,42,0.45)';
  STYLES.inferno.ground = '#382645';
  STYLES.inferno.groundHi = 'rgba(122,78,152,0.38)';
  STYLES.inferno.groundLo = 'rgba(42,28,54,0.42)';
  STYLES.inferno.mark = 'rgba(158,96,202,0.46)';
  STYLES.snowfield.ground = '#46576a';
  STYLES.snowfield.groundHi = 'rgba(154,180,206,0.40)';
  STYLES.snowfield.groundLo = 'rgba(52,66,82,0.42)';
  STYLES.snowfield.mark = 'rgba(198,222,244,0.42)';
  STYLES.hell.ground = '#4a2320';
  STYLES.hell.groundHi = 'rgba(146,72,58,0.40)';
  STYLES.hell.groundLo = 'rgba(52,24,20,0.42)';
  STYLES.hell.mark = 'rgba(198,74,54,0.48)';
  STYLES.savanna.ground = '#2f4a30';
  STYLES.savanna.groundHi = 'rgba(98,134,72,0.38)';
  STYLES.savanna.groundLo = 'rgba(34,56,36,0.42)';
  STYLES.savanna.mark = 'rgba(86,178,132,0.48)';
  STYLES.autumn.ground = '#4a3520';
  STYLES.autumn.groundHi = 'rgba(146,104,58,0.40)';
  STYLES.autumn.groundLo = 'rgba(52,36,22,0.42)';
  STYLES.autumn.mark = 'rgba(208,132,62,0.46)';

  function hash2(x, y) {
    // 全程 32 位整数混合：普通乘法会超出双精度导致低位失效、分布偏斜
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  // 平滑值噪声：让轮廓起伏呈现大波浪而非逐格锯齿
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  // Chaikin 切角：把折线反复切角，得到平滑的随机曲线
  function chaikin(pts, iter) {
    let p = pts;
    for (let k = 0; k < iter; k++) {
      const out = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      p = out;
    }
    return p;
  }

  // Marching Squares：从标量场提取闭合等值线
  function traceContours(val, vw, vh, iso) {
    const segs = [];
    const key = (p) => Math.round(p.x * 1000) + ':' + Math.round(p.y * 1000);
    const cross = (x0, y0, v0, x1, y1, v1) => {
      const t = (iso - v0) / (v1 - v0);
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
    };
    for (let y = 0; y < vh - 1; y++) {
      for (let x = 0; x < vw - 1; x++) {
        const a = val[y * vw + x], b = val[y * vw + x + 1];
        const c = val[(y + 1) * vw + x + 1], d = val[(y + 1) * vw + x];
        const ia = a >= iso, ib = b >= iso, ic = c >= iso, id = d >= iso;
        if (ia === ib && ib === ic && ic === id) continue;
        const e = [null, null, null, null];
        if (ia !== ib) e[0] = cross(x, y, a, x + 1, y, b);
        if (ib !== ic) e[1] = cross(x + 1, y, b, x + 1, y + 1, c);
        if (ic !== id) e[2] = cross(x + 1, y + 1, c, x, y + 1, d);
        if (id !== ia) e[3] = cross(x, y + 1, d, x, y, a);
        const on = [];
        for (let i = 0; i < 4; i++) if (e[i]) on.push(i);
        if (on.length === 2) {
          segs.push([e[on[0]], e[on[1]]]);
        } else if (on.length === 4) {
          // 对角歧义：用中心值决定连接方式，避免轮廓交叉
          const center = (a + b + c + d) / 4 >= iso;
          if (center) {
            segs.push([e[0], e[1]]);
            segs.push([e[2], e[3]]);
          } else {
            segs.push([e[1], e[2]]);
            segs.push([e[3], e[0]]);
          }
        }
      }
    }

    // 把线段串成闭合折线
    const pts = new Map();
    const adj = new Map();
    for (const [p, q] of segs) {
      const kp = key(p), kq = key(q);
      pts.set(kp, p);
      pts.set(kq, q);
      if (!adj.has(kp)) adj.set(kp, []);
      if (!adj.has(kq)) adj.set(kq, []);
      adj.get(kp).push(kq);
      adj.get(kq).push(kp);
    }
    const visited = new Set();
    const loops = [];
    for (const start of pts.keys()) {
      if (visited.has(start)) continue;
      const loop = [];
      let prev = null;
      let cur = start;
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        loop.push(pts.get(cur));
        const nbs = adj.get(cur) || [];
        let next = null;
        for (const nb of nbs) if (nb !== prev) { next = nb; break; }
        prev = cur;
        cur = next;
      }
      if (loop.length >= 4) loops.push(loop);
    }
    return loops;
  }

  function dirName(ang) {
    const names = ['东', '东南', '南', '西南', '西', '西北', '北', '东北'];
    let a = ang % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return names[Math.round(a / (Math.PI / 4)) % 8];
  }

  DG.scenes.dungeon.terrain = { TILE, COLS, ROWS, FLOOR, hash2, STYLES };
  DG.scenes.dungeon.dirName = dirName;
  // 小地图在 720×1440 舞台中的固定区域（渲染与点击拦截共用）
  // 固定方框尺寸，地图内容等比缩进框内，不随关卡地图比例变化
  DG.scenes.dungeon.minimapRect = { x: 33, y: 149, w: 223, h: 193 };

  Object.assign(DG.scenes.dungeon.prototype, {
    /* ---------- 地图生成：网格地块拼贴（整体近方形） ---------- */
    generateMap() {
      const C = DG.data.chunks;
      const style = STYLES[this.def.mapStyle] || STYLES.grove;
      const grid = new Uint8Array(COLS * ROWS);
      // 地块编排：总数 6~15 随机，常见 8~12 块；满 15 块的大图很少出现
      // 关卡数据里的 map.minRooms/maxRooms 决定本关可选的地图规模
      let layouts = [
        { cols: 3, rows: 2, weight: 13 },   // 6 块
        { cols: 4, rows: 2, weight: 16 },   // 8 块
        { cols: 3, rows: 3, weight: 17 },   // 9 块
        { cols: 5, rows: 2, weight: 13 },   // 10 块
        { cols: 4, rows: 3, weight: 17 },   // 12 块
        { cols: 5, rows: 3, weight: 4 }     // 15 块，稀有
      ];
      if (this.def.map) {
        const minRooms = this.def.map.minRooms || 0;
        const maxRooms = this.def.map.maxRooms || 99;
        const fit = layouts.filter(l => {
          const n = l.cols * l.rows;
          return n >= minRooms && n <= maxRooms;
        });
        if (fit.length) layouts = fit;
      }
      const layout = U.weighted(layouts);
      const cols = layout.cols;
      const rows = layout.rows;
      const pool = C.list.filter((c) => c.weight > 0);
      const byId = (id) => C.list.find((c) => c.id === id);
      const chunks = [];
      const rooms = [];

      // 主路网：每一行横向贯通；纵向只在少数几列贯通，形成清晰的大回路
      // 5×3 时取 0/2/4 三列，玩家横竖都能直接切过去，不必绕远
      const vcols = [];
      [0, Math.floor(cols / 2), cols - 1].forEach((c) => {
        if (vcols.indexOf(c) < 0) vcols.push(c);
      });
      const hasV = (c) => vcols.indexOf(c) >= 0;
      const entranceCol = 0, entranceRow = rows === 2 ? 0 : Math.floor(rows / 2);
      const arenaCol = cols - 1, arenaRow = rows - 1;      // 首领场地固定在右下角
      // 固定编排：回型 / 交叉 / 密室各一处，格位随机（避开出生点与首领场），
      // 保证每张地图都有绕行路线，又不会每局位置都一样
      const fixed = {};
      {
        const cells = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (r === entranceRow && c === entranceCol) continue;
            if (r === arenaRow && c === arenaCol) continue;
            cells.push(r * cols + c);
          }
        }
        for (let k = cells.length - 1; k > 0; k--) {
          const j = U.randInt(0, k);
          const t = cells[k]; cells[k] = cells[j]; cells[j] = t;
        }
        ['loop', 'crossroad', 'secret_vault'].forEach((id, k) => {
          if (cells[k] != null) fixed[cells[k]] = id;
        });
      }
      const fixedAt = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows)
        ? null : (fixed[r * cols + c] || null);

      // 逐行铺块：四邻域接口由格位决定，块内结构保持原样
      for (let r = 0; r < rows; r++) {
        let corridorRun = 0;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const ports = {
            l: c > 0, r: c < cols - 1,
            u: r > 0 && hasV(c), d: r < rows - 1 && hasV(c)
          };
          let def;
          if (r === entranceRow && c === entranceCol) def = byId('entrance');
          else if (r === arenaRow && c === arenaCol) def = C.arena;
          else if (fixed[i]) def = byId(fixed[i]);
          else {
            const left = c > 0 ? chunks[i - 1] : null;
            const up = r > 0 ? chunks[i - cols] : null;
            // 与左/上邻块不重样；同时避开四邻格固定编排的块，免得撞名
            const nearFixed = [
              fixedAt(c - 1, r), fixedAt(c + 1, r),
              fixedAt(c, r - 1), fixedAt(c, r + 1)
            ];
            // 同一条横向链上走廊不超过 2 段，避免整行走廊
            const ok = (k) =>
              (!left || left.id !== k.id) && (!up || up.id !== k.id) &&
              nearFixed.indexOf(k.id) < 0 &&
              !(corridorRun >= 2 && k.tags.indexOf('corridor') >= 0);
            let cands = pool.filter(ok);
            if (!cands.length) {
              cands = pool.filter((k) => (!left || left.id !== k.id) &&
                nearFixed.indexOf(k.id) < 0);
            }
            if (!cands.length) cands = pool;
            def = U.weighted(cands);
          }
          const inst = this.placeChunk(def, i, c * C.W, r * C.H, ports);
          chunks.push(inst);
          rooms.push(this.chunkRoom(inst, C));
          corridorRun = def.tags.indexOf('corridor') >= 0 ? corridorRun + 1 : 0;
        }
      }

      // 统一开挖 → 边缘侵蚀 → 补接口与连接段 → 连通性收尾
      for (const inst of chunks) this.carveChunk(grid, inst, C);
      this.roughenEdges(grid);
      // 侵蚀可能啃掉接口，最后再补开一次，保证块与块之间必定连通
      for (const inst of chunks) {
        this.carvePorts(grid, inst, C);
        this.carvePortStubs(grid, inst, C);
      }
      this.pruneIslands(grid, Math.round(rooms[0].cx / TILE), Math.round(rooms[0].cy / TILE));

      this.grid = grid;
      this.rooms = rooms;
      this.chunks = chunks;
      this.cols = cols;
      this.rows = rows;
      this.arenaChunk = arenaRow * cols + arenaCol;
      this.chunkW = C.W * TILE;
      this.chunkH = C.H * TILE;
      // 本关实际地图尺寸（相机/点地/特效边界都按它收口，小图不会留大片黑边）
      this.arenaW = cols * this.chunkW;
      this.arenaH = rows * this.chunkH;
      this.mapStyle = style;
      this.explored = new Uint8Array(COLS * ROWS);
      this.exploredFloor = 0;
      this.floorTotal = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i] === FLOOR) this.floorTotal++;

      // 通道宽敞度：寻路在同距离分岔时优先走通道中线，避免大体型贴墙卡死
      this.clearance = new Uint8Array(COLS * ROWS);
      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          if (!this.isFloorTile(tx, ty)) continue;
          let n = 0, s = 0, w = 0, e = 0;
          while (n < 3 && this.isFloorTile(tx, ty - 1 - n)) n++;
          while (s < 3 && this.isFloorTile(tx, ty + 1 + s)) s++;
          while (w < 3 && this.isFloorTile(tx - 1 - w, ty)) w++;
          while (e < 3 && this.isFloorTile(tx + 1 + e, ty)) e++;
          this.clearance[ty * COLS + tx] = 1 + Math.min(n, s, w, e);
        }
      }

      this.flow = new Int32Array(COLS * ROWS);
      this._flowQueue = new Int32Array(COLS * ROWS);
      this.autoFlow = new Int32Array(COLS * ROWS);
      this._autoFlowQueue = new Int32Array(COLS * ROWS);
      this._autoFlowTarget = -1;
      this.flowTimer = 0;
      this.exploreTimer = 0;

      // 低分辨率迷雾贴图，放大绘制后形成柔和过渡（避免方块状雾边）
      if (!this._fogCanvas) {
        this._fogCanvas = document.createElement('canvas');
        this._fogCtx = this._fogCanvas.getContext('2d');
      }
      this._fogCanvas.width = COLS;
      this._fogCanvas.height = ROWS;

      // 平滑地形轮廓（等值线），绘制时用它替代方块状瓦片边缘
      this._outline = this.buildOutline(grid);
    },

    /* ---------- 地块拼贴辅助 ---------- */
    placeChunk(def, index, tx, ty, ports) {
      const C = DG.data.chunks;
      return {
        index, id: def.id, tags: def.tags, def,
        tx, ty, w: C.W, h: C.H,
        col: Math.round(tx / C.W), row: Math.round(ty / C.H),
        ports: ports || { l: false, r: false, u: false, d: false },
        px: tx * TILE, py: ty * TILE
      };
    },
    // 由块内通路/支路/房间计算可刷怪区域（供既有刷怪、首领选点复用）
    chunkRoom(inst, C) {
      const def = inst.def;
      let minX = 99, minY = 99, maxX = -99, maxY = -99;
      const add = (x, y) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      };
      for (const p of def.path || []) add(p[0], p[1]);
      for (const b of def.branches || []) for (const p of b) add(p[0], p[1]);
      for (const r of def.rooms || []) { add(r.x - r.rx, r.y - r.ry); add(r.x + r.rx, r.y + r.ry); }
      for (const g of def.rings || []) { add(g.x - g.rx, g.y - g.ry); add(g.x + g.rx, g.y + g.ry); }
      if (minX > maxX) { minX = 2; maxX = C.W - 2; minY = 2; maxY = C.H - 2; }
      const x0 = U.clamp(Math.floor(minX) - 2, 1, C.W - 4);
      const y0 = U.clamp(Math.floor(minY) - 2, 1, C.H - 4);
      const x1 = U.clamp(Math.ceil(maxX) + 2, x0 + 3, C.W - 1);
      const y1 = U.clamp(Math.ceil(maxY) + 2, y0 + 3, C.H - 1);
      const x = inst.tx + x0, y = inst.ty + y0;
      const w = x1 - x0, h = y1 - y0;
      // 房间锚点必须落在真实地面上：优先取最大椭圆中心，否则取主通路中点
      let ax = C.W / 2, ay = C.H / 2;
      if (def.anchor) {
        ax = def.anchor[0]; ay = def.anchor[1];
      } else if (def.rooms && def.rooms.length) {
        let big = def.rooms[0];
        for (const r of def.rooms) if (r.rx * r.ry > big.rx * big.ry) big = r;
        ax = big.x; ay = big.y;
      } else if (def.rings && def.rings.length) {
        // 回型块的中心是实心岩体，锚点取环外圈顶部
        const g = def.rings[0];
        ax = g.x; ay = g.y - g.ry + g.t * 0.5;
      } else if (def.path && def.path.length) {
        const mid = def.path[Math.floor(def.path.length / 2)];
        ax = mid[0]; ay = mid[1];
      }
      // 锚点必须落在块内可开挖范围（边界 1 格不开挖，避免贴图的端点落在墙里）
      ax = U.clamp(ax, 2, C.W - 2);
      ay = U.clamp(ay, 2, C.H - 2);
      return {
        x, y, w, h,
        cx: (inst.tx + ax) * TILE,
        cy: (inst.ty + ay) * TILE,
        area: w * h,
        tint: inst.index % 3
      };
    },
    carveChunk(grid, inst, C) {
      const def = inst.def;
      // 主走廊 14.4 格（约 576px）/ 支路 9.6 格宽：一屏内足以并排容纳两只首领
      this.carvePolyline(grid, def.path, inst.tx, inst.ty, 7.2);
      for (const b of def.branches || []) {
        this.carvePolyline(grid, b, inst.tx, inst.ty, def.branchR || C.branchR || 4.8);
      }
      for (const r of def.rooms || []) this.carveEllipse(grid, inst.tx + r.x, inst.ty + r.y, r.rx, r.ry);
      for (const g of def.rings || []) this.carveRing(grid, inst.tx + g.x, inst.ty + g.y, g.rx, g.ry, g.t);
      this.carvePorts(grid, inst, C);
      this.carvePortStubs(grid, inst, C);
    },
    // 回型环道：先挖外椭圆，再把内椭圆填回实心岩体，形成一段可绕行的环
    carveRing(grid, cx, cy, rx, ry, t) {
      this.carveEllipse(grid, cx, cy, rx, ry);
      const irx = Math.max(1, rx - t), iry = Math.max(1, ry - t);
      const x0 = Math.max(0, Math.floor(cx - irx)), x1 = Math.min(COLS - 1, Math.ceil(cx + irx));
      const y0 = Math.max(0, Math.floor(cy - iry)), y1 = Math.min(ROWS - 1, Math.ceil(cy + iry));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const nx = (tx - cx) / irx, ny = (ty - cy) / iry;
          if (nx * nx + ny * ny <= 1) grid[ty * COLS + tx] = 0;
        }
      }
    },
    // 接口开洞：左右各向块内开 3 格（13 格高），上下各向块内开 3 格（13 格宽）
    // 网格拼贴时同排地块 ty 相同、同列 tx 相同，所以接口固定落在每块正中
    carvePorts(grid, inst, C) {
      const p = inst.ports;
      if (!p) return;
      const midY = inst.ty + Math.round(C.H / 2);
      const midX = inst.tx + Math.round(C.W / 2);
      if (p.l) {
        for (let y = midY - 6; y <= midY + 6; y++) {
          for (let x = inst.tx; x < inst.tx + 3; x++) this.carveTile(grid, x, y);
        }
      }
      if (p.r) {
        for (let y = midY - 6; y <= midY + 6; y++) {
          for (let x = inst.tx + C.W - 3; x < inst.tx + C.W; x++) this.carveTile(grid, x, y);
        }
      }
      if (p.u) {
        for (let x = midX - 6; x <= midX + 6; x++) {
          for (let y = inst.ty; y < inst.ty + 3; y++) this.carveTile(grid, x, y);
        }
      }
      if (p.d) {
        for (let x = midX - 6; x <= midX + 6; x++) {
          for (let y = inst.ty + C.H - 3; y < inst.ty + C.H; y++) this.carveTile(grid, x, y);
        }
      }
    },
    // 竖直接口连接段：从上下洞口向块心逐格推进，碰到已有地面立即停止。
    // 回型块中心是实心岩岛，靠这个规则把通道停在环道上，不会打穿岩岛。
    carvePortStubs(grid, inst, C) {
      const p = inst.ports;
      if (!p) return;
      const midX = inst.tx + Math.round(C.W / 2);
      const midY = inst.ty + Math.round(C.H / 2);
      const isFloor = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS &&
        grid[y * COLS + x] === FLOOR;
      const ahead = (y, dir) => {
        const yy = y + dir * 2;
        return isFloor(midX, yy) || isFloor(midX - 2, yy) || isFloor(midX + 2, yy);
      };
      if (p.u) {
        for (let y = inst.ty + 4; y < midY - 2; y++) {
          const hit = ahead(y, 1);
          this.carveDisc(grid, midX, y, 4.2);
          if (hit) break;
        }
      }
      if (p.d) {
        for (let y = inst.ty + C.H - 5; y > midY + 2; y--) {
          const hit = ahead(y, -1);
          this.carveDisc(grid, midX, y, 4.2);
          if (hit) break;
        }
      }
    },
    carvePolyline(grid, pts, ox, oy, r) {
      if (!pts || pts.length < 2) return;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.ceil(len * 2));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          this.carveDisc(grid, ox + a[0] + dx * t, oy + a[1] + dy * t, r);
        }
      }
    },
    carveDisc(grid, cx, cy, r) {
      const R = Math.ceil(r);
      const px = Math.round(cx), py = Math.round(cy);
      for (let oy = -R; oy <= R; oy++) {
        for (let ox = -R; ox <= R; ox++) {
          if (ox * ox + oy * oy > r * r + 0.01) continue;
          this.carveTile(grid, px + ox, py + oy);
        }
      }
    },
    carveEllipse(grid, cx, cy, rx, ry) {
      const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
      const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const nx = (tx - cx) / rx, ny = (ty - cy) / ry;
          const d = nx * nx + ny * ny;
          // 边缘哈希抖动，避免标准椭圆过于规整
          if (d <= 1 + (hash2(tx * 17 + 3, ty * 29 + 7) - 0.5) * 0.22) this.carveTile(grid, tx, ty);
        }
      }
    },
    /* ---------- 地形开挖：不规则洞窟与蜿蜒走廊 ---------- */
    carveRoom(grid, r) {
      // 基础矩形
      for (let ty = r.y; ty < r.y + r.h; ty++) {
        for (let tx = r.x; tx < r.x + r.w; tx++) this.carveTile(grid, tx, ty);
      }
      // 四条边随机向外鼓包，轮廓不再是标准矩形
      const seed = (r.x * 73 + r.y * 151 + r.w * 19) | 0;
      for (let tx = r.x; tx < r.x + r.w; tx++) {
        const dTop = (hash2(tx + seed, r.y) * 3) | 0;
        const dBot = (hash2(tx - seed, r.y + r.h) * 3) | 0;
        for (let k = 1; k <= dTop; k++) this.carveTile(grid, tx, r.y - k);
        for (let k = 1; k <= dBot; k++) this.carveTile(grid, tx, r.y + r.h - 1 + k);
      }
      for (let ty = r.y; ty < r.y + r.h; ty++) {
        const dLeft = (hash2(r.x, ty + seed) * 3) | 0;
        const dRight = (hash2(r.x + r.w, ty - seed) * 3) | 0;
        for (let k = 1; k <= dLeft; k++) this.carveTile(grid, r.x - k, ty);
        for (let k = 1; k <= dRight; k++) this.carveTile(grid, r.x + r.w - 1 + k, ty);
      }
    },
    carveCorridor(grid, a, b) {
      const ax = Math.round(a.cx / TILE);
      const ay = Math.round(a.cy / TILE);
      const bx = Math.round(b.cx / TILE);
      const by = Math.round(b.cy / TILE);
      // 转折顺序与摆动相位每张图都不同，让通道自然蜿蜒
      const amp = U.rand(0.8, 1.9);
      const phase = U.rand(0, Math.PI * 2);
      if (U.random() < 0.5) {
        this.carveLine(grid, ax, ay, bx, ay, amp, phase);
        this.carveLine(grid, bx, ay, bx, by, amp * 0.7, phase + 1.7);
      } else {
        this.carveLine(grid, ax, ay, ax, by, amp, phase);
        this.carveLine(grid, ax, by, bx, by, amp * 0.7, phase + 1.7);
      }
    },
    // 逐格推进并向侧面摆动，三格宽，拐弯处自然圆润
    carveLine(grid, x0, y0, x1, y1, amp, phase) {
      const dx = Math.sign(x1 - x0);
      const dy = Math.sign(y1 - y0);
      const len = Math.abs(x1 - x0) + Math.abs(y1 - y0);
      let x = x0, y = y0;
      for (let i = 0; i <= len; i++) {
        const t = len ? i / len : 0;
        const lateral = Math.round(Math.sin(t * Math.PI * 2.2 + phase) * amp);
        const ox = dy !== 0 ? lateral : 0;
        const oy = dx !== 0 ? lateral : 0;
        this.carveBlob(grid, x + ox, y + oy);
        if (dx !== 0) x += dx; else if (dy !== 0) y += dy;
      }
    },
    carveBlob(grid, cx, cy) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) this.carveTile(grid, cx + ox, cy + oy);
      }
    },
    // 连通性收尾：从出生房间泛洪，剔除脱节的小块地面
    pruneIslands(grid, sx, sy) {
      const start = sy * COLS + sx;
      const open = (i) => grid[i] === FLOOR;
      const seen = new Uint8Array(COLS * ROWS);
      let seed = start;
      if (!open(seed)) {
        seed = -1;
        for (let i = 0; i < grid.length; i++) if (open(i)) { seed = i; break; }
        if (seed < 0) return;
      }
      const q = [seed];
      seen[seed] = 1;
      for (let head = 0; head < q.length; head++) {
        const cur = q[head];
        const cx = cur % COLS;
        const cy = (cur / COLS) | 0;
        if (cx > 0) { const n = cur - 1; if (!seen[n] && open(n)) { seen[n] = 1; q.push(n); } }
        if (cx < COLS - 1) { const n = cur + 1; if (!seen[n] && open(n)) { seen[n] = 1; q.push(n); } }
        if (cy > 0) { const n = cur - COLS; if (!seen[n] && open(n)) { seen[n] = 1; q.push(n); } }
        if (cy < ROWS - 1) { const n = cur + COLS; if (!seen[n] && open(n)) { seen[n] = 1; q.push(n); } }
      }
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] === FLOOR && !seen[i]) grid[i] = 0;
      }
    },
    // 由瓦片地面生成平滑等值线轮廓：噪声起伏 + 切角平滑，得到随机曲线边缘
    buildOutline(grid) {
      const VW = COLS + 1, VH = ROWS + 1;
      const val = new Float32Array(VW * VH);
      for (let vy = 0; vy < VH; vy++) {
        for (let vx = 0; vx < VW; vx++) {
          let s = 0;
          for (let oy = -1; oy <= 0; oy++) {
            for (let ox = -1; ox <= 0; ox++) {
              const tx = vx + ox, ty = vy + oy;
              if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
              if (grid[ty * COLS + tx] === FLOOR) s++;
            }
          }
          // 基础场 + 大尺度起伏 + 小尺度碎边
          let v = s / 4;
          v += (vnoise(vx * 0.22, vy * 0.22) - 0.5) * 0.24;
          v += (vnoise(vx * 0.85 + 31, vy * 0.85 + 17) - 0.5) * 0.1;
          val[vy * VW + vx] = v;
        }
      }
      const loops = traceContours(val, VW, VH, 0.5);
      const path = new Path2D();
      const worldLoops = [];
      for (const raw of loops) {
        const pts = chaikin(raw, 2);
        if (pts.length < 3) continue;
        const wp = pts.map((p) => ({ x: p.x * TILE, y: p.y * TILE }));
        worldLoops.push(wp);
        path.moveTo(wp[0].x, wp[0].y);
        for (let i = 1; i < wp.length; i++) path.lineTo(wp[i].x, wp[i].y);
        path.closePath();
      }
      // 轮廓点供边缘美术装饰（草丛、灌木、岩石）沿边界生成
      this._outlineLoops = worldLoops;
      return path;
    },
    roughenEdges(grid) {
      const src = grid.slice();
      const floorAt = (tx, ty) => tx > 0 && ty > 0 && tx < COLS - 1 && ty < ROWS - 1 &&
        src[ty * COLS + tx] === FLOOR;
      for (let ty = 1; ty < ROWS - 1; ty++) {
        for (let tx = 1; tx < COLS - 1; tx++) {
          const i = ty * COLS + tx;
          const floor = src[i] === FLOOR;
          const near = floorAt(tx - 1, ty) || floorAt(tx + 1, ty) ||
            floorAt(tx, ty - 1) || floorAt(tx, ty + 1);
          if (!near) continue;
          const n = hash2(tx * 13 + 7, ty * 17 + 3);
          if (!floor) {
            // 墙向内增生：贴着地面鼓起，必与现有地面连通
            if (n > 0.6) grid[i] = FLOOR;
          } else {
            // 只侵蚀临墙的边界地板（恰好一面是墙），内部实心不动，避免出现碎洞与孤岛
            // 地图最外两圈不侵蚀：靠边界的地板只有 3 个邻居，侵蚀会让边界通道断开
            let cnt = 0;
            if (floorAt(tx - 1, ty)) cnt++;
            if (floorAt(tx + 1, ty)) cnt++;
            if (floorAt(tx, ty - 1)) cnt++;
            if (floorAt(tx, ty + 1)) cnt++;
            if (cnt === 3 && n < 0.3 && tx > 1 && ty > 1 &&
              tx < COLS - 2 && ty < ROWS - 2) grid[i] = 0;
          }
        }
      }
    },
    carveTile(grid, tx, ty) {
      if (tx <= 0 || ty <= 0 || tx >= COLS - 1 || ty >= ROWS - 1) return;
      grid[ty * COLS + tx] = FLOOR;
    },

    /* ---------- 地形查询与碰撞 ---------- */
    isFloorTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
      return this.grid[ty * COLS + tx] === FLOOR;
    },
    isWallAt(x, y) {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      return !this.isFloorTile(tx, ty);
    },
    circleWall(x, y, r) {
      const x0 = Math.floor((x - r) / TILE);
      const x1 = Math.floor((x + r) / TILE);
      const y0 = Math.floor((y - r) / TILE);
      const y1 = Math.floor((y + r) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (this.isFloorTile(tx, ty)) continue;
          const nx = U.clamp(x, tx * TILE, tx * TILE + TILE);
          const ny = U.clamp(y, ty * TILE, ty * TILE + TILE);
          const dx = x - nx, dy = y - ny;
          if (dx * dx + dy * dy < r * r) return true;
        }
      }
      return false;
    },
    // 轴分离移动：撞墙时沿墙滑动，不会穿墙
    moveWithCollision(e, dx, dy, r) {
      if (dx) {
        const nx = e.x + dx;
        if (!this.circleWall(nx, e.y, r)) e.x = nx;
      }
      if (dy) {
        const ny = e.y + dy;
        if (!this.circleWall(e.x, ny, r)) e.y = ny;
      }
      e.x = U.clamp(e.x, TILE, ARENA_W - TILE);
      e.y = U.clamp(e.y, TILE, ARENA_H - TILE);
    },
    // 道具碰撞体：立件的竖胶囊（上端 = 脚底锚点，下端向下延伸，见 y2）。
    // 只做圆形碰撞时 y2 缺省等于 y。仅玩家生效。
    circleProp(x, y, r) {
      const list = this.propCols;
      if (!list || !list.length) return false;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const y2 = c.y2 == null ? c.y : c.y2;
        const ny = y < c.y ? c.y : (y > y2 ? y2 : y);
        const dx = x - c.x, dy = y - ny;
        const rr = r + c.r;
        if (dx * dx + dy * dy < rr * rr) return true;
      }
      return false;
    },
    // 点到道具碰撞体表面的距离（负数 = 已在碰撞体内）
    propGap(c, x, y) {
      const y2 = c.y2 == null ? c.y : c.y2;
      const ny = y < c.y ? c.y : (y > y2 ? y2 : y);
      return Math.hypot(x - c.x, y - ny) - c.r;
    },
    // 生成期校验：宝箱 / 怪群 / 首领场地不能被道具碰撞体封死
    ensureCriticalReachable() {
      if (!this.propCols || !this.propCols.length) return true;
      const P = 14;
      const critical = [];
      for (const c of this.chests || []) critical.push(c);
      for (const p of this.chunkPacks || []) critical.push(p);
      const last = this.rooms && this.rooms[this.rooms.length - 1];
      if (last) critical.push({ x: last.cx, y: last.cy });
      if (this.reachableWithProps(critical, P)) return true;

      // 只拆除真正把地面切成两半的立件碰撞：房间中央不碍事的石头/树干保留，
      // 避免整图清空碰撞体后失去阻挡手感；每轮打通一处“口子”，通常 1~2 轮收敛。
      for (let attempt = 0; attempt < 10; attempt++) {
        const seen = this.propReachSeen(P);
        if (!seen) {
          // 出生格被立件压住：只移除覆盖出生点的那个碰撞体
          const sx = Math.floor(this.player.x / TILE) * TILE + TILE / 2;
          const sy = Math.floor(this.player.y / TILE) * TILE + TILE / 2;
          const keep = this.propCols.filter(c => this.propGap(c, sx, sy) > P);
          if (keep.length === this.propCols.length) { this.propCols.length = 0; break; }
          this.propCols = keep;
          continue;
        }
        // 不可达但紧邻可达区的地面格 = 被碰撞体堵住的通道口
        const gates = [];
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const i = y * COLS + x;
            if (seen[i] || !this.isFloorTile(x, y)) continue;
            if ((x > 0 && seen[i - 1]) || (x < COLS - 1 && seen[i + 1]) ||
              (y > 0 && seen[i - COLS]) || (y < ROWS - 1 && seen[i + COLS])) {
              gates.push(i);
            }
          }
        }
        if (!gates.length) break;
        const before = this.propCols.length;
        this.propCols = this.propCols.filter((c) => {
          for (let g = 0; g < gates.length; g++) {
            const gx = (gates[g] % COLS) * TILE + TILE / 2;
            const gy = ((gates[g] / COLS) | 0) * TILE + TILE / 2;
            if (Math.hypot(c.x - gx, c.y - gy) <= P + c.r) return false;
          }
          return true;
        });
        if (this.propCols.length === before) break;
        if (this.reachableWithProps(critical, P)) return true;
      }
      // 极端布局兜底：放弃碰撞体但保留视觉立件，确保流程可通
      this.propCols.length = 0;
      return this.reachableWithProps(critical, P);
    },
    propReachSeen(r) {
      const seen = new Uint8Array(COLS * ROWS);
      const sx = Math.floor(this.player.x / TILE), sy = Math.floor(this.player.y / TILE);
      const pass = (tx, ty) => this.isFloorTile(tx, ty) &&
        !this.circleProp(tx * TILE + TILE / 2, ty * TILE + TILE / 2, r);
      if (!pass(sx, sy)) return null;
      const queue = [sy * COLS + sx];
      seen[queue[0]] = 1;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < queue.length; i++) {
        const idx = queue[i], x = idx % COLS, y = (idx / COLS) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + dirs[d][0], ny = y + dirs[d][1];
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const ni = ny * COLS + nx;
          if (seen[ni] || !pass(nx, ny)) continue;
          seen[ni] = 1;
          queue.push(ni);
        }
      }
      return seen;
    },
    reachableWithProps(points, r) {
      const seen = this.propReachSeen(r);
      if (!seen) return false;
      for (const p of points) {
        const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || !seen[ty * COLS + tx]) return false;
      }
      return true;
    },
    // 玩家专用移动：墙体 + 场景道具双层碰撞，仍按轴分离实现贴边滑动
    movePlayer(e, dx, dy, r) {
      if (dx) {
        const nx = e.x + dx;
        if (!this.circleWall(nx, e.y, r) && !this.circleProp(nx, e.y, r)) e.x = nx;
      }
      if (dy) {
        const ny = e.y + dy;
        if (!this.circleWall(e.x, ny, r) && !this.circleProp(e.x, ny, r)) e.y = ny;
      }
      e.x = U.clamp(e.x, TILE, ARENA_W - TILE);
      e.y = U.clamp(e.y, TILE, ARENA_H - TILE);
    },
    // 绕墙转向：正前方被墙角挡住时，依次尝试左右偏转，实现贴墙滑动
    moveWithSteer(e, dx, dy, r) {
      const len = Math.hypot(dx, dy);
      if (len < 0.001) return false;
      const base = Math.atan2(dy, dx);
      const probe = Math.max(5, len);
      for (const off of STEER_OFFSETS) {
        const a = base + off;
        const nx = e.x + Math.cos(a) * probe;
        const ny = e.y + Math.sin(a) * probe;
        if (this.circleWall(nx, ny, r)) continue;
        this.moveWithCollision(e, Math.cos(a) * len, Math.sin(a) * len, r);
        return true;
      }
      return false;
    },
    nearestFloorPoint(x, y, maxTiles) {
      const max = maxTiles || 5;
      const cx = Math.floor(x / TILE);
      const cy = Math.floor(y / TILE);
      if (this.isFloorTile(cx, cy)) return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
      for (let r = 1; r <= max; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (!this.isFloorTile(cx + dx, cy + dy)) continue;
            return {
              x: (cx + dx) * TILE + TILE / 2,
              y: (cy + dy) * TILE + TILE / 2
            };
          }
        }
      }
      return null;
    },
    // 点地走位落点：避开墙面与道具碰撞体，保证玩家能走到
    nearestFreePoint(x, y, maxTiles, r) {
      const p = this.nearestFloorPoint(x, y, maxTiles || 4);
      if (p && !this.circleProp(p.x, p.y, r)) return p;
      for (let rad = 24; rad <= 168; rad += 24) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const px = x + Math.cos(a) * rad;
          const py = y + Math.sin(a) * rad;
          if (!this.circleWall(px, py, r) && !this.circleProp(px, py, r)) return { x: px, y: py };
        }
      }
      return p;
    },
    roomAtWorld(x, y) {
      for (const r of this.rooms) {
        if (x >= r.x * TILE && x <= (r.x + r.w) * TILE &&
          y >= r.y * TILE && y <= (r.y + r.h) * TILE) return r;
      }
      return null;
    },
    randomRoomPoint(room) {
      for (let i = 0; i < 12; i++) {
        const x = U.rand((room.x + 0.6) * TILE, (room.x + room.w - 0.6) * TILE);
        const y = U.rand((room.y + 0.6) * TILE, (room.y + room.h - 0.6) * TILE);
        if (!this.circleWall(x, y, 15)) return { x, y };
      }
      return this.nearestFloorPoint(room.cx, room.cy, 3) || { x: room.cx, y: room.cy };
    },
    weightedRoom(rooms) {
      let total = 0;
      for (const r of rooms) total += r.area;
      let v = U.random() * total;
      for (const r of rooms) {
        v -= r.area;
        if (v <= 0) return r;
      }
      return rooms[rooms.length - 1];
    },

    /* ---------- 探索迷雾 ---------- */
    revealAt(x, y, radiusTiles) {
      const r = radiusTiles || 8;
      const cx = Math.floor(x / TILE);
      const cy = Math.floor(y / TILE);
      const r2 = r * r;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const tx = cx + dx;
          const ty = cy + dy;
          if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
          const i = ty * COLS + tx;
          if (this.explored[i]) continue;
          this.explored[i] = 1;
          if (!this._minimapNew) this._minimapNew = [];
          this._minimapNew.push(i);
          if (this.grid[i] === FLOOR) this.exploredFloor++;
        }
      }
    },
    updateExploration(dt) {
      this.exploreTimer -= dt;
      if (this.exploreTimer > 0) return;
      this.exploreTimer = 0.12;
      const before = this.exploredFloor;
      this.revealAt(this.player.x, this.player.y, 8);
      // 只有真正揭开新格子时才重建迷雾与小地图，避免每 0.12 秒全图重绘
      if (this.exploredFloor !== before) this.updateFogTexture();
    },
    // 每格一个像素写入迷雾，绘制时放大并做插值，得到柔和的探索边界
    updateFogTexture() {
      if (!this._fogCtx) return;
      // 复用缓冲区：这里每 0.12 秒可能触发一次，避免反复分配 34KB 内存引发 GC 卡顿
      if (!this._fogRaw) this._fogRaw = new Float32Array(COLS * ROWS);
      const raw = this._fogRaw;
      raw.fill(0);
      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          const i = ty * COLS + tx;
          if (this.explored[i]) continue;
          const near = this.explored[ty * COLS + Math.max(0, tx - 1)] ||
            this.explored[ty * COLS + Math.min(COLS - 1, tx + 1)] ||
            this.explored[Math.max(0, ty - 1) * COLS + tx] ||
            this.explored[Math.min(ROWS - 1, ty + 1) * COLS + tx];
          raw[i] = near ? 162 : 242;
        }
      }
      // 3×3 均值模糊：消除逐格雾边的方格感，放大后成为连续雾层
      const img = this._fogImage || (this._fogImage = this._fogCtx.createImageData(COLS, ROWS));
      const data = img.data;
      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          let sum = 0, n = 0;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const nx = tx + ox, ny = ty + oy;
              if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
              sum += raw[ny * COLS + nx];
              n++;
            }
          }
          const o = (ty * COLS + tx) * 4;
          data[o] = 0;
          data[o + 1] = 0;
          data[o + 2] = 0;
          data[o + 3] = sum / n;
        }
      }
      this._fogCtx.putImageData(img, 0, 0);
      this._minimapDirty = true;
    },
    explorePct() {
      return this.floorTotal ? this.exploredFloor / this.floorTotal : 0;
    },

    /* ---------- 寻路流场（BFS） ---------- */
    updateFlow(dt) {
      this.flowTimer -= dt;
      if (this.flowTimer > 0) return;
      this.flowTimer = 0.28;
      // 玩家没跨格时不重算流场，减少大地图上的周期性开销
      const tx = Math.floor(this.player.x / TILE);
      const ty = Math.floor(this.player.y / TILE);
      if (tx === this._flowTileX && ty === this._flowTileY) return;
      this._flowTileX = tx;
      this._flowTileY = ty;
      this.computeFlow(this.player.x, this.player.y);
    },
    computeFlow(px, py) {
      const dist = this.flow;
      if (!dist) return;
      dist.fill(INF);
      let sx = U.clamp(Math.floor(px / TILE), 0, COLS - 1);
      let sy = U.clamp(Math.floor(py / TILE), 0, ROWS - 1);
      if (!this.isFloorTile(sx, sy)) {
        const n = this.nearestFloorPoint(px, py, 4);
        if (!n) return;
        sx = Math.floor(n.x / TILE);
        sy = Math.floor(n.y / TILE);
      }
      const q = this._flowQueue;
      let head = 0, tail = 0;
      const start = sy * COLS + sx;
      dist[start] = 0;
      q[tail++] = start;
      while (head < tail) {
        const cur = q[head++];
        const cx = cur % COLS;
        const cy = (cur / COLS) | 0;
        const nd = dist[cur] + 1;
        for (let i = 0; i < 4; i++) {
          const nx = cx + (i === 0 ? 1 : i === 2 ? -1 : 0);
          const ny = cy + (i === 1 ? 1 : i === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const ni = ny * COLS + nx;
          if (this.grid[ni] !== FLOOR || dist[ni] <= nd) continue;
          dist[ni] = nd;
          q[tail++] = ni;
        }
      }
    },
    flowDirection(x, y) {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
      const cur = ty * COLS + tx;
      const startD = this.flow[cur];
      const clr = this.clearance;
      let best = startD;
      let bestClear = -1;
      let bx = -1, by = -1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = tx + dx;
          const ny = ty + dy;
          if (!this.isFloorTile(nx, ny)) continue;
          // 禁止斜穿墙角
          if (dx && dy && (!this.isFloorTile(tx + dx, ty) || !this.isFloorTile(tx, ty + dy))) continue;
          const ni = ny * COLS + nx;
          const d = this.flow[ni];
          const c = clr ? clr[ni] : 0;
          if (d < best || (d === best && d < startD && c > bestClear)) {
            best = d;
            bestClear = c;
            bx = nx;
            by = ny;
          }
        }
      }
      if (bx < 0) return null;
      const cx = bx * TILE + TILE / 2;
      const cy = by * TILE + TILE / 2;
      const vx = cx - x, vy = cy - y;
      const len = Math.hypot(vx, vy) || 1;
      return { x: vx / len, y: vy / len };
    },
    computeAutoFlow(px, py) {
      const dist = this.autoFlow;
      if (!dist) return false;
      const r = this.player ? this.player.r : 14;
      let sx = U.clamp(Math.floor(px / TILE), 0, COLS - 1);
      let sy = U.clamp(Math.floor(py / TILE), 0, ROWS - 1);
      if (!this.autoFlowOpen(sx, sy, r)) {
        const n = this.nearestFreePoint(px, py, 5, r);
        if (!n) return false;
        sx = Math.floor(n.x / TILE);
        sy = Math.floor(n.y / TILE);
      }
      const start = sy * COLS + sx;
      if (start === this._autoFlowTarget) return true;
      if (this._autoFlowTarget >= 0 && this.time < (this._autoFlowRefreshAt || 0)) return true;
      this._autoFlowTarget = start;
      this._autoFlowRefreshAt = this.time + 0.24;
      dist.fill(INF);
      const q = this._autoFlowQueue;
      let head = 0, tail = 0;
      dist[start] = 0;
      q[tail++] = start;
      while (head < tail) {
        const cur = q[head++];
        const cx = cur % COLS, cy = (cur / COLS) | 0;
        const nd = dist[cur] + 1;
        for (let i = 0; i < 4; i++) {
          const nx = cx + (i === 0 ? 1 : i === 2 ? -1 : 0);
          const ny = cy + (i === 1 ? 1 : i === 3 ? -1 : 0);
          if (!this.autoFlowOpen(nx, ny, r)) continue;
          const ni = ny * COLS + nx;
          if (dist[ni] <= nd) continue;
          dist[ni] = nd;
          q[tail++] = ni;
        }
      }
      return true;
    },
    autoFlowOpen(tx, ty, r) {
      if (!this.isFloorTile(tx, ty)) return false;
      return !this.circleProp(tx * TILE + TILE / 2, ty * TILE + TILE / 2, r);
    },
    autoFlowDirection(x, y, target) {
      if (!target || !this.computeAutoFlow(target.x, target.y)) return null;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
      const r = this.player ? this.player.r : 14;
      const cur = ty * COLS + tx;
      const startD = this.autoFlow[cur];
      let best = startD, bestClear = -1, bx = -1, by = -1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = tx + dx, ny = ty + dy;
          if (!this.autoFlowOpen(nx, ny, r)) continue;
          if (dx && dy && (!this.autoFlowOpen(tx + dx, ty, r) || !this.autoFlowOpen(tx, ty + dy, r))) continue;
          const ni = ny * COLS + nx, d = this.autoFlow[ni];
          const c = this.clearance ? this.clearance[ni] : 0;
          if (d < best || (d === best && d < startD && c > bestClear)) {
            best = d; bestClear = c; bx = nx; by = ny;
          }
        }
      }
      if (bx < 0) return null;
      const vx = bx * TILE + TILE / 2 - x, vy = by * TILE + TILE / 2 - y;
      const len = Math.hypot(vx, vy) || 1;
      return { x: vx / len, y: vy / len };
    },

    // 道具总图加载：单张图集，按当前地貌生成调色版本；到位后重烘焙地形
    loadMapArt(style) {
      const AD = DG.art && DG.art.terrainDecor;
      if (AD) AD.load(() => {
        // 图集可能早已预载完成，回调控在构造器中途同步触发：
        // 此时 player/sceneProps 还没建好，交给构造器自己生成，避免重复构建
        if (this.finished || !this.player || !this.makeSceneProps) return;
        this.sceneProps = this.makeSceneProps();
      });
    },

    /* ---------- 首领降临点：在玩家 1.5 屏以内现身，不贴脸也不远处挂机 ---------- */
    pickBossSpawn(r) {
      const p = this.player;
      const R = r || 48;
      const MIN_D = 300;                                  // 不贴脸
      const MAX_D = Math.round(W * 1.5);                  // 一屏半硬上限
      const PREF_D = Math.min(MAX_D, 900);                // 优先落在更近的位置
      const inMap = (x, y) => x > 60 && y > 60 && x < ARENA_W - 60 && y < ARENA_H - 60;
      const ok = (x, y) => inMap(x, y) && !this.circleWall(x, y, R);
      // 优先：近处环带随机采样
      for (let i = 0; i < 90; i++) {
        const a = U.rand(0, Math.PI * 2);
        const d = U.rand(MIN_D, PREF_D);
        const x = p.x + Math.cos(a) * d;
        const y = p.y + Math.sin(a) * d;
        if (ok(x, y)) return { x, y };
      }
      // 其次：放宽到一屏半
      for (let i = 0; i < 90; i++) {
        const a = U.rand(0, Math.PI * 2);
        const d = U.rand(PREF_D, MAX_D);
        const x = p.x + Math.cos(a) * d;
        const y = p.y + Math.sin(a) * d;
        if (ok(x, y)) return { x, y };
      }
      // 再次：由远到近逐圈扫，扩大命中率
      for (let d = MAX_D; d >= MIN_D; d -= 120) {
        for (let i = 0; i < 36; i++) {
          const a = (Math.PI * 2 / 36) * i;
          const x = p.x + Math.cos(a) * d;
          const y = p.y + Math.sin(a) * d;
          if (ok(x, y)) return { x, y };
        }
      }
      // 兜底：玩家附近找一块能站的地方
      for (let d = MIN_D; d >= 80; d -= 40) {
        for (let i = 0; i < 24; i++) {
          const a = (Math.PI * 2 / 24) * i;
          const x = p.x + Math.cos(a) * d;
          const y = p.y + Math.sin(a) * d;
          if (ok(x, y)) return { x, y };
        }
      }
      return this.nearestFloorPoint(p.x, p.y, 6) || { x: p.x, y: p.y };
    }
  });
})();


;
/* ==== js/scenes/dungeon/input.js ==== */
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
        // 自动战斗期间点击屏幕不取消自动：关闭自动只认自动战斗按钮
        if (this.autoMode) return;
        // 小地图区域不参与走位；首领阶段小地图已屏蔽，不能再拦截点击
        const bossUp = this.monsters.some(m => m.boss && !m.dead);
        const R = this.minimapRectNow();
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
        // 自动战斗期间拖动摇杆不打断自动战斗（关闭只认自动按钮）
        if (this.autoMode) return;
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


;
/* ==== js/scenes/dungeon/hud.js ==== */
/* 副本战斗 · HUD 层：界面构建、状态刷新、暂停与公告 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
  buildHud() {
    const el = U.el('div', 'dungeon-ui');
    const slots = this.skillStripHtml();
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
    this.$touch = el.querySelector('[data-touch]');
    this.$pauseHint = el.querySelector('[data-pause-hint]');
    this.$knob = el.querySelector('[data-knob]');
    this.$auto = el.querySelector('[data-auto]');
    this.$xpPct = el.querySelector('[data-xp-pct]');
    this.$xpNum = el.querySelector('[data-xp-num]');
    // 底部两端功能键：打开面板时静默暂停战斗，关闭后自动继续；
    // 面板内换装 / 点技能后立刻重算战斗属性并刷新技能条
    el.querySelector('[data-open-equip]').addEventListener('click', () => {
      this.openPanel(done => DG.ui.openEquipment(this.char, () => this.refreshBuild(), { onClose: done }));
    });
    el.querySelector('[data-open-skills]').addEventListener('click', () => {
      this.openPanel(done => DG.ui.openSkills(this.char, () => this.refreshBuild(), { onClose: done }));
    });
    // 等级牌：与主城一致，点开角色信息
    el.querySelector('[data-open-char]').addEventListener('click', () => {
      this.openPanel(done => DG.ui.openCharacterInfo(this.char, { onClose: done }));
    });
    // 中间技能格同样可查看技能详情（战斗期间静默暂停）
    this.bindStripSlots();
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
  // 技能条槽位：普攻 + 已解锁主动技能（重建与首次构建共用同一份模板）
  skillStripHtml() {
    return this.skillList.map((sk, i) => {
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
  },
  // 战斗中升级解锁技能 / 换装改变冷却后，按最新 skillList 重建技能条并重绑点击
  bindStripSlots() {
    if (!this.hud) return;
    const host = this.hud.querySelector('.strip-slots');
    if (!host) return;
    host.innerHTML = this.skillStripHtml();
    this.$cd = Array.from(host.querySelectorAll('[data-cd]'));
    this.$cdt = Array.from(host.querySelectorAll('[data-cdt]'));
    // 槽位数量变化后清掉旧索引的缓存，避免冷却层与 "ready" 状态错位
    if (this._hudCache) {
      for (let i = 0; i < 12; i++) {
        delete this._hudCache['cd' + i];
        delete this._hudCache['cdt' + i];
        delete this._hudCache['cdr' + i];
      }
    }
    host.querySelectorAll('.strip-slot[data-slot]').forEach(slot => {
      slot.addEventListener('click', () => {
        this.openPanel(done => DG.ui.openSkills(this.char, () => this.refreshBuild(), { onClose: done }));
      });
    });
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


;
/* ==== js/scenes/dungeon/world.js ==== */
/* 副本战斗 · 世界层：地形装饰、刷怪、波次与首领登场 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const TILE = DG.scenes.dungeon.terrain.TILE;

  Object.assign(DG.scenes.dungeon.prototype, {
  makeDecor() {
    const rocks = [];
    const count = 48 + this.rooms.length * 6;
    for (let i = 0; i < count; i++) {
      const room = U.pick(this.rooms);
      const px = U.rand((room.x + 0.8) * TILE, (room.x + room.w - 0.8) * TILE);
      const py = U.rand((room.y + 0.8) * TILE, (room.y + room.h - 0.8) * TILE);
      // 不规则边缘可能把矩形房间边角啃成墙，装饰只放在实心地面上
      const pos = this.isFloorTile(Math.floor(px / TILE), Math.floor(py / TILE))
        ? { x: px, y: py }
        : this.nearestFloorPoint(px, py, 3);
      if (!pos) continue;
      rocks.push({
        x: pos.x,
        y: pos.y,
        r: U.rand(12, 30),
        fog: U.chance(0.35),
        alpha: U.rand(0.03, 0.08),
        seed: U.random() * Math.PI * 2
      });
    }
    return rocks;
  },
  makeSceneProps() {
    const AD = DG.art && DG.art.terrainDecor;
    const out = [];
    if (!AD) return out;
    this.propCols = (this.propCols || []).filter(c => !c.sceneProp);
    const T = DG.scenes.dungeon.terrain;
    const salt = (this.floorTotal || 0) * 97 + this.rooms.length * 31;
    const hash = T.hash2;
    const chests = this.chests || [];
    const packs = this.chunkPacks || [];
    const spawn = this.spawnPoint || this.player || null;
    // 占位矩形：按素材实际画幅（含脚底锚点）计算屏幕占位。
    // 两件装饰的占位矩形不允许相交，彻底避免视觉上“堆在一起”；
    // 同款素材之间再额外拉开距离，避免同款扎堆
    const placed = [];
    const boxOf = (d, s, x, y) => {
      const w = d.w * s, h = d.h * s;
      const ay = d.ay == null ? 1 : d.ay;
      return { l: x - w * 0.5, r: x + w * 0.5, t: y - h * ay, b: y + h * (1 - ay) };
    };
    const boxFree = (box, id, padX, padY, sameGap) => {
      const cx = (box.l + box.r) * 0.5, cy = (box.t + box.b) * 0.5;
      for (const o of placed) {
        // 同款素材额外拉开距离（只对立件生效；贴花/草丛允许成片）
        if (sameGap && o.id === id) {
          const dx = (o.box.l + o.box.r) * 0.5 - cx;
          const dy = (o.box.t + o.box.b) * 0.5 - cy;
          if (dx * dx + dy * dy < sameGap * sameGap) return false;
        }
        const apart = box.r + padX <= o.box.l || box.l - padX >= o.box.r ||
          box.b + padY <= o.box.t || box.t - padY >= o.box.b;
        if (!apart) return false;
      }
      return true;
    };
    const clearOf = (x, y, d) => {
      if (spawn) {
        const sx = spawn.x - x, sy = spawn.y - y;
        if (sx * sx + sy * sy < d * d) return false;
      }
      return chests.concat(packs).every(o => {
        const dx = o.x - x, dy = o.y - y;
        return dx * dx + dy * dy > d * d;
      });
    };
    const add = (id, x, y, h) => {
      const d = AD.def(id);
      if (!d) return false;
      const size = d.size[0] + (d.size[1] - d.size[0]) * h;
      const s = size / d.h;
      const p = {
        id, x, y, s, flip: hash(Math.round(x * 0.07), Math.round(y * 0.11)) > 0.5,
        rot: (hash(Math.round(x * 0.13), Math.round(y * 0.17)) - 0.5) * 0.12,
        zone: 'inside', layer: d.layer || 'prop'
      };
      // 立件必须带碰撞体：没有碰撞体就干脆不画，
      // 否则角色能站进道具里，必然出现“踩在头上”的穿模
      if (p.layer === 'prop') {
        if (!d.breakable || !d.solid) return false;
        // 碰撞体是「脚底锚点向下延伸」的竖胶囊：角色能贴近立件侧面，
        // 但无法站到立件正下方；角色视觉高度约 126px（脚底到头顶），
        // 胶囊长度 + 半径足以让头顶始终低于立件底边，不再出现“戴帽”错觉
        const HEAD_CLEAR = 112;
        const r = Math.max(26, Math.min(42, d.w * s * 0.34));
        p.breakable = true;
        p.hp = 1;
        p.col = { x, y, y2: y + HEAD_CLEAR, r, prop: p, sceneProp: true };
        this.propCols.push(p.col);
        const critical = (this.chests || []).concat(this.chunkPacks || []);
        const last = this.rooms && this.rooms[this.rooms.length - 1];
        if (last) critical.push({ x: last.cx, y: last.cy });
        // 胶囊不能压住关键点：宝箱 / 怪群 / 首领场地中心都要留出刷怪散布半径，
        // 否则怪物会出生在立件内部；同时保证这些点仍然连通
        let blocked = critical.some(o => this.propGap(p.col, o.x, o.y) < 60);
        if (!blocked && critical.length && !this.reachableWithProps(critical, 14)) blocked = true;
        if (blocked) {
          this.propCols.pop();
          return false;
        }
      }
      out.push(p);
      return true;
    };
    // 地图内：立件贴墙、贴花铺地。候选点按「距墙距离」分池，
    // 越靠近墙越适合放立体道具，地面血迹/骸骨才允许散在房间中部
    for (let ci = 0; ci < this.chunks.length; ci++) {
      const ch = this.chunks[ci];
      const room = this.rooms[ch.index];
      if (!room) continue;
      const count = 2 + Math.floor(hash(ci + salt, 217) * 3);
      // 立件只允许贴「上侧墙」：角色只能从下方接近，
      // 立件永远排在角色身后，不会出现道具压住角色头部的错觉
      const wallSpots = [], floorSpots = [], grassSpots = [];
      // 墙体是否属于地图内部的实心区域：用于避开地图最外圈，
      // 防止立件上半身探到地图外的黑色区域里
      const innerWall = (x, y) => this.chunks.some(c =>
        x >= c.px && x <= c.px + c.w * TILE && y >= c.py && y <= c.py + c.h * TILE);
      for (let ty = room.y + 1; ty < room.y + room.h - 1; ty++) {
        for (let tx = room.x + 1; tx < room.x + room.w - 1; tx++) {
          if (!this.isFloorTile(tx, ty)) continue;
          const x = tx * TILE + TILE * 0.5, y = ty * TILE + TILE * 0.5;
          const clr = this.clearance ? this.clearance[ty * T.COLS + tx] : 1;
          floorSpots.push({ x, y });
          // 草丛候选：房间与路线（走廊）里都能长，只排除孤立的墙角/尽头，
          // 保证草能沿着主路铺开，又不会从地图最外缘探进黑域
          let nb = 0;
          if (this.isFloorTile(tx - 1, ty)) nb++;
          if (this.isFloorTile(tx + 1, ty)) nb++;
          if (this.isFloorTile(tx, ty - 1)) nb++;
          if (this.isFloorTile(tx, ty + 1)) nb++;
          if (nb >= 2) grassSpots.push({ x, y });
          if (clr > 2) continue;
          if (this.isFloorTile(tx, ty - 1)) continue;   // 上方必须是墙
          if (this.isFloorTile(tx, ty - 2)) continue;   // 再上一格也不能站人，否则角色会从背后压过来
          if (!this.isFloorTile(tx, ty + 1)) continue;  // 下方留出站立/观看空间
          if (!innerWall(x, (ty - 3) * TILE + TILE * 0.5)) continue;  // 避开地图最外圈黑域
          wallSpots.push({ x, y });
        }
      }
      for (let n = 0; n < count; n++) {
        // 约四成立件（靠墙），六成地面贴花
        const wantProp = hash(ci * 37 + n + salt, 229) >= 0.6;
        const pool = wantProp ? wallSpots : floorSpots;
        if (!pool.length) continue;
        const id = wantProp
          ? AD.pickInsideProp(hash(ci * 43 + n + salt, 239))
          : AD.pickInsideGround(hash(ci * 41 + n + salt, 233));
        const d = AD.def(id);
        if (!d) continue;
        const h = hash(ci * 47 + n + salt, 241);
        const size = d.size[0] + (d.size[1] - d.size[0]) * h;
        const s = size / d.h;
        // 随机取样而不是按行优先顺序扫描：顺序扫描会让相邻装饰落在同一排/同一列，
        // 形成肉眼可见的“排排站”
        const tries = Math.min(pool.length, 16);
        for (let k = 0; k < tries; k++) {
          const idx = Math.min(pool.length - 1,
            Math.floor(hash(ci * 53 + n * 29 + k, 243) * pool.length));
          const c = pool[idx];
          if (!clearOf(c.x, c.y, 96)) continue;
          const box = boxOf(d, s, c.x, c.y);
          if (!boxFree(box, id, 14, 20, d.layer === 'prop' ? 300 : 0)) continue;
          if (!add(id, c.x, c.y, h)) continue;
          placed.push({ box, id });
          break;
        }
      }
      // 骸骨铺撒：骨头类单独加量，营造战场尸骸感
      const boneCount = 2 + Math.floor(hash(ci + salt, 293) * 3);
      for (let n = 0; n < boneCount && floorSpots.length; n++) {
        const id = AD.pickInsideBone(hash(ci * 79 + n + salt, 299));
        const d = AD.def(id);
        if (!d) continue;
        const h = hash(ci * 83 + n + salt, 301);
        const size = d.size[0] + (d.size[1] - d.size[0]) * h;
        const s = size / d.h;
        const tries = Math.min(floorSpots.length, 18);
        for (let k = 0; k < tries; k++) {
          const idx = Math.min(floorSpots.length - 1,
            Math.floor(hash(ci * 89 + n * 67 + k, 303) * floorSpots.length));
          const c = floorSpots[idx];
          if (!clearOf(c.x, c.y, 74)) continue;
          const box = boxOf(d, s, c.x, c.y);
          if (!boxFree(box, id, 8, 12, 0)) continue;
          if (!add(id, c.x, c.y, h)) continue;
          placed.push({ box, id });
          break;
        }
      }
      // 草丛：房间和路线里都大量铺撒，五成左右围绕已有草丛成团，
      // 其余随机散落，形成自然的疏密关系。
      // 其中约 35% 可以被破坏（走过去/挥砍即碎），营造“草海”战斗氛围；
      // 可破坏草丛没有碰撞体（不挡路），也不掉任何东西
      const grassCount = 22 + Math.floor(hash(ci + salt, 307) * 16);
      const grassDone = [];
      for (let n = 0; n < grassCount && grassSpots.length; n++) {
        const id = AD.pickInsideGrass(hash(ci * 97 + n + salt, 311));
        const d = AD.def(id);
        if (!d) continue;
        const h = hash(ci * 101 + n + salt, 313);
        const size = d.size[0] + (d.size[1] - d.size[0]) * h;
        const s = size / d.h;
        const cluster = grassDone.length > 0 && hash(ci * 107 + n + salt, 323) < 0.5;
        const tries = cluster ? 16 : 24;
        for (let k = 0; k < tries; k++) {
          let x, y;
          if (cluster) {
            // 围绕同块内已有草丛随机偏移，长成一小片草地
            const base = grassDone[Math.min(grassDone.length - 1,
              Math.floor(hash(ci * 109 + n * 19 + k, 327) * grassDone.length))];
            const ang = hash(ci * 113 + n * 23 + k, 331) * Math.PI * 2;
            const rad = 28 + hash(ci * 127 + n * 29 + k, 337) * 66;
            x = base.x + Math.cos(ang) * rad;
            y = base.y + Math.sin(ang) * rad;
            const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
            if (!this.isFloorTile(tx, ty)) continue;
          } else {
            const idx = Math.min(grassSpots.length - 1,
              Math.floor(hash(ci * 103 + n * 31 + k, 317) * grassSpots.length));
            x = grassSpots[idx].x;
            y = grassSpots[idx].y;
          }
          if (!clearOf(x, y, 56)) continue;
          const box = boxOf(d, s, x, y);
          if (!boxFree(box, id, 2, 2, 0)) continue;
          if (!add(id, x, y, h)) continue;
          placed.push({ box, id });
          grassDone.push({ x, y });
          const g = out[out.length - 1];
          // 随机抽约三成草丛变成可破坏：5 丛里碎 2 丛、10 丛里碎 3 丛
          if (hash(ci * 131 + n * 43 + salt, 347) < 0.35) {
            g.breakable = true;
            g.hp = 1;
            g.passable = true;   // 不参与移动阻挡，走过去就碎
            g.noLoot = true;     // 草丛不产出装备/道具
            g.col = { x, y, y2: y, r: 16, prop: g };
          }
          break;
        }
      }
    }
    // 地图外黑域：以真实的「可行走边缘」为基准铺贴，而不是矩形包围盒。
    // 地图轮廓是不规则的，按包围盒摆放会出现某些剪影离地面几百像素的假象；
    // 这里先收集每条地面↔黑域的交界线，剪影贴着交界线整体外移，
    // 远近再按深度分层：同深度互斥保证疏密，不同深度允许叠放（近大远小、近实远虚）
    const edgePts = [];
    for (let ty = 0; ty < T.ROWS; ty++) {
      for (let tx = 0; tx < T.COLS; tx++) {
        if (!this.isFloorTile(tx, ty)) continue;
        const cx = tx * TILE + TILE * 0.5, cy = ty * TILE + TILE * 0.5;
        if (!this.isFloorTile(tx, ty - 1)) edgePts.push({ x: cx, y: ty * TILE, ex: 0, ey: -1 });
        if (!this.isFloorTile(tx, ty + 1)) edgePts.push({ x: cx, y: (ty + 1) * TILE, ex: 0, ey: 1 });
        if (!this.isFloorTile(tx - 1, ty)) edgePts.push({ x: tx * TILE, y: cy, ex: -1, ey: 0 });
        if (!this.isFloorTile(tx + 1, ty)) edgePts.push({ x: (tx + 1) * TILE, y: cy, ex: 1, ey: 0 });
      }
    }
    const outBoxes = [];
    const outFree = (box, depth) => {
      const area = Math.max(1, (box.r - box.l) * (box.b - box.t));
      return outBoxes.every(o => {
        const ow = Math.min(box.r, o.r) - Math.max(box.l, o.l);
        const oh = Math.min(box.b, o.b) - Math.max(box.t, o.t);
        if (!(ow > 0 && oh > 0)) return true;
        // 同深度必须互斥，保证同一层内的疏密
        if (Math.abs(o.depth - depth) <= 0.2) return false;
        // 前后不同深度允许叠放（形成树林纵深），但单件遮挡不超过 55%，
        // 避免近处剪影被整棵吞掉
        return (ow * oh) / Math.min(area, o.area) <= 0.55;
      });
    };
    // 整张剪影是否压在可行走面上（用于把斜边/角落的剪影继续外推）
    const boxOnFloor = (box) => {
      const x0 = Math.floor(box.l / TILE), x1 = Math.floor((box.r - 0.01) / TILE);
      const y0 = Math.floor(box.t / TILE), y1 = Math.floor((box.b - 0.01) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (this.isFloorTile(tx, ty)) return true;
        }
      }
      return false;
    };
    const outTotal = 90 + Math.round(this.chunks.length * 4);
    for (let n = 0; n < outTotal && edgePts.length; n++) {
      // 深度偏向近处（^1.4），让贴边一圈更密，远处更疏
      const depth = Math.pow(hash(n * 13 + salt, 277), 1.4);
      const id = AD.pickOutside(hash(n * 7 + salt, 269));
      const d = AD.def(id);
      if (!d) continue;
      const hh = 0.25 + hash(n * 11 + salt, 271) * 0.5;
      const size = d.size[0] + (d.size[1] - d.size[0]) * hh;
      const s = (size / d.h) * (0.55 + depth * 0.85);
      const dw = d.w * s, dh = d.h * s;
      const ep = edgePts[Math.min(edgePts.length - 1,
        Math.floor(hash(n * 17 + salt, 279) * edgePts.length))];
      const jitter = (hash(n * 19 + salt, 283) - 0.5) * TILE * 0.9;
      let pad = 6 + depth * depth * 420;
      const place = () => {
        if (ep.ey < 0) return { x: ep.x + jitter, y: ep.y - pad };
        if (ep.ey > 0) return { x: ep.x + jitter, y: ep.y + dh + pad };
        if (ep.ex < 0) return { x: ep.x - dw * 0.5 - pad, y: ep.y + jitter };
        return { x: ep.x + dw * 0.5 + pad, y: ep.y + jitter };
      };
      let pos = place();
      let box = boxOf(d, s, pos.x, pos.y);
      // 轮廓折角处继续外推，保证剪影完全落在黑域里，绝不盖到可行走面
      for (let guard = 0; guard < 12 && boxOnFloor(box); guard++) {
        pad += 40;
        pos = place();
        box = boxOf(d, s, pos.x, pos.y);
      }
      if (boxOnFloor(box)) continue;
      if (!outFree(box, depth)) continue;
      outBoxes.push(Object.assign({ depth, area: (box.r - box.l) * (box.b - box.t) }, box));
      out.push({
        id, x: pos.x, y: pos.y, s, zone: 'outside', layer: 'prop', depth,
        flip: hash(n * 23 + salt, 287) > 0.5,
        rot: (hash(n * 29 + salt, 289) - 0.5) * 0.16,
        alpha: 0.9 - depth * 0.4
      });
    }
    // 静态按到地图的距离排序：远处的先画、贴边近处的后画，
    // 保证四条边上叠放时的前后关系都正确（近的盖住远的）
    out.sort((a, b) => (b.depth || 0) - (a.depth || 0) || a.y - b.y);
    return out;
  },
  breakPropsAt(x, y, radius) {
    let changed = false;
    for (const p of this.sceneProps || []) {
      if (p.destroyed || !p.breakable || !p.col) continue;
      if (this.propGap(p.col, x, y) > radius) continue;
      // 一击即碎：走过去或被攻击都直接破坏，不留血条
      p.destroyed = true;
      changed = true;
      this.shatterProp(p);
      // 草丛等纯氛围道具只碎裂，不产出战利品
      if (!p.noLoot) this.dropPropLoot(p);
    }
    if (changed) this.propCols = this.propCols.filter(c => !c.prop || !c.prop.destroyed);
    return changed;
  },
  // 破碎表现：把素材按 2×3 切成碎片，向外飞散、翻滚并逐渐淡出
  shatterProp(p) {
    const AD = DG.art && DG.art.terrainDecor;
    const d = AD && AD.def(p.id);
    const img = AD && AD.shardImage ? AD.shardImage(p.id) : null;
    if (!d || !img) {
      this.addBurst(p.col.x, p.col.y, '#b5a47f', 7);
      return;
    }
    const w = d.w * p.s, h = d.h * p.s;
    const ay = d.ay == null ? 1 : d.ay;
    const cols = 2, rows = 3;
    const cw = d.w / cols, chh = d.h / rows;
    this.addBurst(p.col.x, p.col.y - h * 0.3, '#b5a47f', 6);
    this.addRing(p.col.x, p.col.y - h * 0.2, 6, p.col.r * 1.5, '#aa9a6d', 0.18);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fx = (c + 0.5) / cols - 0.5;
        const fy = (r + 0.5) / rows;
        this.effects.push({
          kind: 'shard', img,
          sx: d.x + c * cw, sy: d.y + r * chh, sw: cw, sh: chh,
          x: p.x + fx * w,
          y: p.y - h * ay + fy * h,
          vx: fx * 170 + U.rand(-40, 40),
          vy: -U.rand(70, 160) - (1 - fy) * 40,
          rot: 0, vr: U.rand(-7, 7),
          scale: p.s,
          life: U.rand(0.7, 1.05), max: 1.05
        });
      }
    }
  },
  // 可破坏道具的垃圾掉落表：普通装备为主，少量魔法装备，
  // 另外会掉恢复球 / 符文这类普通道具，也可能什么都没有。
  // 只产出拾取物，不提供任何临时增益。
  dropPropLoot(p) {
    const rnd = U.random();
    const pos = (rx, ry) => this.nearestFloorPoint(p.x + U.rand(-rx, rx), p.y + U.rand(-4, ry), 2) ||
      { x: p.x, y: p.y };
    if (rnd < 0.05) {
      // 少量魔法品质：属性略好一点，仍然只算“垃圾”级产出
      if (!DG.items) return;
      const ilvl = Math.max(1, (this.def && this.def.ilvl) || 1);
      const item = DG.items.generate(ilvl, { minRarity: 'magic', cls: this.char && this.char.cls });
      const at = pos(20, 22);
      this.drops.push({ kind: 'item', item, x: at.x, y: at.y, r: 12, t: 0 });
      return;
    }
    if (rnd < 0.40) {
      // 普通品质装备：无词缀，纯过渡垃圾
      if (!DG.items) return;
      const ilvl = Math.max(1, (this.def && this.def.ilvl) || 1);
      const item = DG.items.generate(ilvl, { rarity: 'normal', cls: this.char && this.char.cls });
      const at = pos(20, 22);
      this.drops.push({ kind: 'item', item, x: at.x, y: at.y, r: 12, t: 0 });
      return;
    }
    if (rnd < 0.54) {
      // 恢复球：普通道具，拾取即回血
      const at = pos(18, 18);
      this.drops.push({ kind: 'orb', x: at.x, y: at.y, r: 10, t: 0 });
      return;
    }
    if (rnd < 0.57) {
      // 符文：低概率的普通道具
      const at = pos(18, 18);
      this.drops.push({ kind: 'rune', x: at.x, y: at.y, r: 11, t: 0 });
    }
  },
  // 前方最近的可破坏道具：自动战斗被挡住时用来开砸
  nearestBreakableInFront(maxDist) {
    const dir = this.moveDirAngle;
    let best = null, bestD = maxDist;
    for (const p of this.sceneProps || []) {
      // 草丛这类可穿过的不挡路，自动战斗卡住时不拿来开砸
      if (p.destroyed || !p.breakable || !p.col || p.zone !== 'inside' || p.passable) continue;
      const gap = this.propGap(p.col, this.player.x, this.player.y);
      if (gap > bestD) continue;
      const y2 = p.col.y2 == null ? p.col.y : p.col.y2;
      const cy = Math.max(p.col.y, Math.min(y2, this.player.y));
      const dx = p.col.x - this.player.x, dy = cy - this.player.y;
      if (dir != null) {
        const a = Math.atan2(dy, dx);
        let diff = Math.abs(a - dir) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff > Math.PI * 0.6) continue;
      }
      bestD = gap;
      best = p;
    }
    return best;
  },
  // 按块生成怪群与宝箱：房间/岔路 3 簇、走廊 2 簇，玩家靠近相邻块时才激活。
  // 簇点向地块中心收拢，怪群贴着主路线，避免玩家满图找怪；
  // 少量簇随机升级为密集怪群（6~8 只），制造偶发的怪物潮
  makeChunkPacks() {
    const packs = [];
    for (const ch of this.chunks) {
      if (ch.id === 'entrance' || ch.id === 'arena') continue;
      const room = this.rooms[ch.index];
      if (!room) continue;
      // 密室：随机方案——普通怪群 / 精英 / 宝箱 / 精英 + 宝箱，自由组合
      if (ch.tags.indexOf('secret') >= 0) {
        const roll = U.random();
        const variant = roll < 0.3 ? 'normal'
          : roll < 0.6 ? 'elite'
          : roll < 0.82 ? 'chest' : 'elite_chest';
        packs.push({
          chunk: ch.index, x: room.cx, y: room.cy,
          count: variant === 'normal' ? U.randInt(3, 5) : 0,
          elite: variant === 'elite' ? U.randInt(1, 2) : (variant === 'elite_chest' ? 1 : 0),
          secret: true, variant, spawned: false
        });
        continue;
      }
      const roomy = ch.tags.indexOf('room') >= 0 || ch.tags.indexOf('junction') >= 0;
      // 以地块中心为圆心撒点：半径最多约 245px，保证怪群落在主路线附近
      const reach = Math.min(room.w, room.h) * TILE * 0.34;
      const nearCenter = () => {
        for (let i = 0; i < 12; i++) {
          const a = U.rand(0, Math.PI * 2);
          const rad = Math.sqrt(U.random()) * reach;
          const x = room.cx + Math.cos(a) * rad;
          const y = room.cy + Math.sin(a) * rad;
          if (!this.circleWall(x, y, 15)) return { x, y };
        }
        return this.nearestFloorPoint(room.cx, room.cy, 3) || { x: room.cx, y: room.cy };
      };
      const points = [];
      for (let i = 0, n = roomy ? 3 : 2; i < n; i++) {
        let pos = nearCenter();
        // 同块内各簇拉开距离，避免出生点重叠
        for (let guard = 0; guard < 8 && points.some(q => Math.hypot(q.x - pos.x, q.y - pos.y) < 120); guard++) {
          pos = nearCenter();
        }
        points.push(pos);
      }
      for (const pos of points) {
        // 约 8%~16% 的簇是密集怪群
        const dense = U.chance(roomy ? 0.16 : 0.08);
        packs.push({
          chunk: ch.index,
          x: pos.x,
          y: pos.y,
          count: dense ? U.randInt(6, 8) : (roomy ? U.randInt(3, 5) : U.randInt(2, 4)),
          dense,
          spawned: false
        });
      }
    }
    this._lastChunk = -1;
    return packs;
  },
  // 宝箱：带房间的块按概率放置；密室按随机方案可能保底放一个
  makeChests() {
    const chests = [];
    const place = (ch) => {
      const room = this.rooms[ch.index];
      if (!room) return;
      const pos = this.nearestFloorPoint(room.cx + U.rand(-40, 40), room.cy + U.rand(-40, 40), 3) ||
        { x: room.cx, y: room.cy };
      chests.push({ x: pos.x, y: pos.y, r: 16, opened: false, t: 0, chunk: ch.index });
    };
    const eligible = (ch) => ch.id !== 'entrance' && ch.id !== 'arena' &&
      (ch.def.rooms || []).length > 0;
    const secretChest = (ch) => {
      const p = (this.chunkPacks || []).find(q => q.secret && q.chunk === ch.index);
      return p && (p.variant === 'chest' || p.variant === 'elite_chest');
    };
    for (const ch of this.chunks) {
      if (!eligible(ch)) continue;
      if (!secretChest(ch) && !U.chance(0.62)) continue;
      place(ch);
    }
    // 保底：至少两个宝箱，保证伏击宝箱必定混入且不占掉全部宝箱
    if (chests.length < 2) {
      const spare = this.chunks.filter(ch => eligible(ch) && !chests.some(c => c.chunk === ch.index));
      while (chests.length < 2 && spare.length) {
        place(spare.splice(U.randInt(0, spare.length - 1), 1)[0]);
      }
    }
    // 伏击宝箱：混入 1~2 个普通宝箱，外观完全一致，触碰才现形
    const pool = chests.slice();
    const want = pool.length >= 3 && U.chance(0.4) ? 2 : 1;
    for (let i = 0; i < want && pool.length > 1; i++) {
      const idx = U.randInt(0, pool.length - 1);
      pool[idx].mimic = true;
      pool.splice(idx, 1);
    }
    return chests;
  },
  currentChunk() {
    const n = this.chunks ? this.chunks.length : 0;
    if (!n) return 0;
    const cols = this.cols || 1, rows = this.rows || 1;
    const c = U.clamp(Math.floor(this.player.x / this.chunkW), 0, cols - 1);
    const r = U.clamp(Math.floor(this.player.y / this.chunkH), 0, rows - 1);
    return U.clamp(r * cols + c, 0, n - 1);
  },
  // 按块激活：玩家处于某块或其四邻块时，一次性放出该块的怪群
  updateChunkSpawns() {
    const cur = this.currentChunk();
    if (cur !== this._lastChunk) {
      this._lastChunk = cur;
      this.updateWaveText();
    }
    const curCh = this.chunks[cur];
    // 出生安全区：玩家还没走远时完全不刷怪，先留出一段无战斗的缓冲；
    // 之后也只激活玩家附近的怪群，避免隔着半张地图提前出笼
    const safe = this.spawnPoint || this.player;
    const walked = U.dist(this.player, safe);
    const SAFE_LEFT = 300;   // 离开出生点这么远才算“走了一段”
    const NEAR = 1200;       // 玩家逼近到这个距离内，怪群才激活
    // 场上怪太多时暂缓激活新怪群，等清掉一批再放，避免越打越多拖垮帧率
    let alive = 0;
    for (const m of this.monsters) if (!m.dead && !m.boss) alive++;
    const CAP = 44;
    for (const p of this.chunkPacks) {
      if (p.spawned) continue;
      if (walked < SAFE_LEFT && !this.autoMode) continue;
      // 同一个怪群到玩家的距离一帧只算一次，下面激活 / 贴脸 / 密室判定共用
      const pd = U.dist(p, this.player);
      if (pd > NEAR) continue;
      // 不贴脸刷怪：玩家就站在怪群位置上时先不激活，等拉开距离再说。
      // 自动战斗没有“等玩家走开”的耐心（AI 会把出生点当成落脚点静止），
      // 所以自动模式下照常激活，但把出生点挪到玩家外侧，避免糊脸弹出；
      // 正在混战时仍然不激活，防止凭空在角色身边围出一圈怪
      if (pd < 260) {
        // 开局 10 秒内不贴脸激活：出生点周围的怪群先留着，避免一进图就被围杀
        if (!this.autoMode || (this.time || 0) < 10) continue;
        let nearFight = false;
        for (const m of this.monsters) {
          if (!m.dead && !m.boss && U.dist(m, this.player) < 600) { nearFight = true; break; }
        }
        if (nearFight) continue;
      }
      const pch = this.chunks[p.chunk];
      // 自动战斗需要自己找怪：距离已足够近时不再限制相邻区块，
      // 否则 AI 会在“隔一个区块”的怪群前反复踱步、怪永远不激活
      if (!this.autoMode && (!pch || Math.abs(pch.col - curCh.col) + Math.abs(pch.row - curCh.row) > 1)) continue;
      // 密室守卫：必须走到门口才惊醒，避免隔墙提前拉怪
      if (p.secret && pd > 380) continue;
      // 自动模式下贴着玩家触发时，把出生中心推到 300px 外，避免怪直接糊在角色脸上
      let bx = p.x, by = p.y;
      if (pd < 260) {
        const base = U.rand(0, Math.PI * 2);
        for (let k = 0; k < 8; k++) {
          const ang = base + k * Math.PI / 4;
          const px = this.player.x + Math.cos(ang) * 300;
          const py = this.player.y + Math.sin(ang) * 300;
          if (!this.circleWall(px, py, this.player.r) && !this.circleProp(px, py, this.player.r)) {
            bx = px; by = py;
            break;
          }
        }
      }
      if (alive >= CAP) break;
      p.spawned = true;
      let slots = CAP - alive;
      // 密室：按随机方案出怪，可能是普通怪群、精英、精英+宝箱，或只有宝箱
      if (p.secret) {
        if (p.elite > 0) {
          const poolE = (this.def.elitePool && this.def.elitePool.length) ? this.def.elitePool : this.def.pool;
          for (let i = 0; i < p.elite && slots > 0; i++) {
            const ang = (i / Math.max(1, p.elite)) * Math.PI * 2 + U.rand(-0.4, 0.4);
            const pos = this.nearestFloorPoint(bx + Math.cos(ang) * 46, by + Math.sin(ang) * 46, 3) ||
              this.nearestFloorPoint(bx, by, 3) || { x: bx, y: by };
            const m = this.spawnMonster(this.pickWeatherMonster(poolE), pos.x, pos.y, false, p.chunk);
            if (m) {
              this.promoteElite(m);
              m.aggro = true;
              slots--;
              alive++;
            }
          }
          this.announce('密室守卫苏醒', 1800);
          this.addRing(p.x, p.y, 18, 120, '#d9b24a', 0.7);
          this.shake = 0.25;
        } else if (p.count > 0) {
          this.announce('密室伏兵', 1500);
        }
        const count = Math.min(slots, p.count + (this.wxPackBonus || 0) + (this.extraPerPack || 0));
        for (let i = 0; i < count; i++) {
          const pos = this.nearestFloorPoint(bx + U.rand(-46, 46), by + U.rand(-46, 46), 3) ||
            this.nearestFloorPoint(bx, by, 3) || { x: bx, y: by };
          if (this.spawnMonster(this.pickWeatherMonster(this.def.pool), pos.x, pos.y, false, p.chunk)) {
            slots--;
            alive++;
          }
        }
        continue;
      }
      // 密集怪群收得更紧，普通怪群略微散开；强风会把怪群吹得更散
      const spread = (p.dense ? 30 : 46) * (this.wxSpreadMul || 1);
      const count = Math.min(slots, p.count + (this.wxPackBonus || 0) + (this.extraPerPack || 0));
      for (let i = 0; i < count; i++) {
        const pos = this.nearestFloorPoint(bx + U.rand(-spread, spread), by + U.rand(-spread, spread), 3) ||
          this.nearestFloorPoint(bx, by, 3) || { x: bx, y: by };
        if (this.spawnMonster(this.pickWeatherMonster(this.def.pool), pos.x, pos.y, false, p.chunk)) {
          slots--;
          alive++;
        }
      }
      // 精英：图鉴大造型，按块额外投放一只（带专属招式读条）
      const eliteChance = (this.tune ? this.tune.eliteChance : 0.3) + (this.wxEliteBonus || 0);
      if (slots > 0 && this.def.elitePool && this.def.elitePool.length && U.chance(eliteChance)) {
        const epos = this.nearestFloorPoint(bx + U.rand(-30, 30), by + U.rand(-30, 30), 3) ||
          this.nearestFloorPoint(bx, by, 3) || { x: bx, y: by };
        const m = this.spawnMonster(this.pickWeatherMonster(this.def.elitePool), epos.x, epos.y, false, p.chunk);
        if (m) {
          this.promoteElite(m);
          slots--;
          alive++;
        }
      }
    }
    // 首领改由击杀数触发；仅在没有怪群门槛的异常地图上，踏入首领场地兜底触发
    if (this.phase === 'wave' && !this.bossKillGoal && cur === this.arenaChunk) {
      this.phase = 'bossIntro';
      this.phaseTimer = 1.5;
      this.announce('首领即将降临', 1600);
      this.updateWaveText();
    }
  },
  updateChests(dt) {
    for (const c of this.chests || []) {
      c.t += dt;
      if (c.opened || U.dist(this.player, c) > 52 + this.player.r) continue;
      c.opened = true;
      if (c.mimic) this.triggerMimic(c);
      else this.openChest(c);
    }
  },
  // 宝箱伏击：宝箱消失，原地现形为本关小怪组成的精英，立即进入战斗
  triggerMimic(c) {
    const i = this.chests.indexOf(c);
    if (i >= 0) this.chests.splice(i, 1);
    const pos = this.nearestFloorPoint(c.x, c.y, 3) || { x: c.x, y: c.y };
    const pool = (this.def.pool || []).filter((id) => DG.data.monsters[id] && !DG.data.monsters[id].boss);
    const id = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'skeleton';
    const m = this.spawnMonster(id, pos.x, pos.y, false, c.chunk);
    if (!m) return null;
    this.promoteElite(m);
    m.aggro = true;
    m.x = pos.x; m.y = pos.y;
    this.addBurst(c.x, c.y - 16, '#ffd76a', 16);
    this.addRing(c.x, c.y, 14, 96, '#d9b24a', 0.6);
    this.addFloater(c.x, c.y - 46, '有埋伏！', '#ffd76a', 26);
    this.announce('宝箱伏击', 1500);
    this.shake = 0.3;
    return m;
  },
  openChest(c) {
    this.addBurst(c.x, c.y, '#e3c88e', 12);
    this.addRing(c.x, c.y, 12, 70, '#e3c88e', 0.5);
    this.announce('发现宝箱', 1200);
    const ilvl = this.def.ilvl;
    const gold = Math.round(U.rand(30, 70) * (1 + (ilvl - 1) * 0.5));
    this.goldEarned += gold;
    this.addFloater(c.x, c.y - 32, `+${gold} 金币`, '#e3c88e', 20);
    const n = U.chance(0.45) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const item = DG.items.generate(ilvl + 1, { minRarity: 'magic', cls: this.char && this.char.cls });
      const pos = this.nearestFloorPoint(c.x + U.rand(-34, 34), c.y + U.rand(-30, 30), 3) ||
        { x: c.x, y: c.y };
      this.drops.push({ kind: 'item', item, x: pos.x, y: pos.y, r: 12, t: 0 });
    }
    if (U.chance(0.5)) {
      const pos = this.nearestFloorPoint(c.x + U.rand(-30, 30), c.y + U.rand(-30, 30), 3) ||
        { x: c.x, y: c.y };
      this.drops.push({ kind: 'orb', x: pos.x, y: pos.y, r: 10, t: 0 });
    }
  },
  // 精英化：图鉴大造型固定为精英，体型与数值按固定倍率提升
  promoteElite(m) {
    if (!m) return m;
    const t = DG.data.monsters[m.typeId] || {};
    if (!m.elite) {
      const oldR = m.r;
      const pos = this.findMonsterSpawnPoint(m.x, m.y, oldR * 1.25, m);
      m.elite = true;
      m.r *= 1.25;
      if (pos) {
        m.x = pos.x;
        m.y = pos.y;
        m.spawnX = pos.x;
        m.spawnY = pos.y;
      }
      const tune = this.tune || DG.data.stageTuning(this.def);
      m.maxHp = Math.round(m.maxHp * tune.eliteHp);
      m.hp = m.maxHp;
      m.dmg = Math.round(m.dmg * tune.eliteDmg);
      m.xp = Math.round(m.xp * 2.5);
      m.gold = Math.round(m.gold * 2);
    }
    m.name = '精英 · ' + (t.name || m.name);
    this.applyEliteAffixes(m);
    return m;
  },
  findMonsterSpawnPoint(x, y, r, ignore, ignoreMonsters) {
    const clear = (px, py) => {
      if (this.circleWall(px, py, r)) return false;
      if (!ignoreMonsters) {
        for (const other of this.monsters) {
          if (other.dead || other === ignore) continue;
          const min = r + other.r + 10;
          if (U.dist2(px, py, other.x, other.y) < min) return false;
        }
      }
      return true;
    };
    if (clear(x, y)) return { x, y };
    for (let radius = 28; radius <= 224; radius += 28) {
      const count = radius < 84 ? 10 : 16;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count + (radius % 56 ? 0.19 : 0);
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (clear(px, py)) return { x: px, y: py };
      }
    }
    return null;
  },
  // 场景明度（0~1）：取当前地貌地面的感知亮度，用于怪物配色匹配
  sceneLuma() {
    if (this._sceneLuma != null) return this._sceneLuma;
    const T = DG.scenes.dungeon.terrain;
    const st = this.mapStyle || (T.STYLES && T.STYLES[this.def.mapStyle]) || (T.STYLES && T.STYLES.grove) || {};
    const hex = st.ground || (st.floor && st.floor[0]) || '#1a1a1a';
    this._sceneLuma = this.colorLuma(hex);
    return this._sceneLuma;
  },
  colorLuma(hex) {
    if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return 0.5;
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  },
  monsterLuma(id) {
    if (!this._monsterLumaCache) this._monsterLumaCache = {};
    const hit = this._monsterLumaCache[id];
    if (hit != null) return hit;
    const t = DG.data.monsters[id];
    const v = t ? this.colorLuma(t.color) : 0.5;
    this._monsterLumaCache[id] = v;
    return v;
  },
  // 配色匹配：暗场景不投放蓝白等高亮怪物；亮场景优先投放高亮怪物。
  // 只影响“选哪一种怪”，不改怪物数量与刷新密度。
  toneWeight(id) {
    const scene = this.sceneLuma();
    const luma = this.monsterLuma(id);
    if (scene <= 0.23 && luma >= 0.56) return 0;
    if (scene >= 0.24) {
      if (luma >= 0.56) return 1.9;
      if (luma <= 0.34) return 0.7;
    }
    return 1;
  },
  // 按天气倾向加权选怪：偏好类型 2.6 倍权重，其余保留随机性；
  // 再叠加场景明度权重，避免亮色怪物出现在过暗的场景里。
  pickWeatherMonster(pool) {
    if (!pool || !pool.length) return null;
    const bias = this.wxSpawnBias;
    let total = 0;
    const weights = new Array(pool.length);
    for (let i = 0; i < pool.length; i++) {
      let w = bias && bias.indexOf(pool[i]) >= 0 ? 2.6 : 1;
      w *= this.toneWeight(pool[i]);
      weights[i] = w;
      total += w;
    }
    // 整池都不匹配（极少见）：退到与场景明度最接近的一只，保证怪物不会断档
    if (total <= 0) {
      const scene = this.sceneLuma();
      let best = pool[0], bestD = Infinity;
      for (const id of pool) {
        const d = Math.abs(this.monsterLuma(id) - scene);
        if (d < bestD) { bestD = d; best = id; }
      }
      return best;
    }
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  },
  spawnMonster(typeId, x, y, isBoss, chunkIndex, ignoreMonsters) {
    const t = DG.data.monsters[typeId];
    // 配置写错时不再抛异常卡死战斗：跳过该次生成并留下可定位的告警
    if (!t) {
      if (!this._badMonsterWarned) this._badMonsterWarned = {};
      if (!this._badMonsterWarned[typeId]) {
        this._badMonsterWarned[typeId] = true;
        console.warn('[dungeon] 未知怪物模板：', typeId);
      }
      return null;
    }
    const tune = this.tune || DG.data.stageTuning(this.def);
    const ilvl = this.def.ilvl;
    const bossMon = !!(t.boss || isBoss);
    let hp = t.hp * (bossMon ? tune.bossHp : tune.mobHp);
    let dmg = t.dmg * (bossMon ? tune.bossDmg : tune.mobDmg);
    let elite = false;
    if (!bossMon && U.chance(tune.randomElite)) {
      elite = true;
      hp *= tune.eliteHp;
      dmg *= tune.eliteDmg;
    }
    const radius = t.r * (elite ? 1.25 : 1);
    const spawn = this.findMonsterSpawnPoint(x, y, radius, null, ignoreMonsters);
    if (!spawn) return null;

    const m = {
      id: U.uid(),
      typeId,
      name: (elite ? '精英 · ' : '') + t.name,
      shape: t.shape,
      color: t.color,
      r: radius,
      x: spawn.x, y: spawn.y,
      spawnX: spawn.x,
      spawnY: spawn.y,
      chunkIndex: chunkIndex == null ? null : chunkIndex,
      spawnTime: this.time,
      aggro: !!(t.boss || isBoss),
      wanderTimer: U.rand(0.5, 2),
      wanderAngle: U.rand(0, Math.PI * 2),
      hp: Math.round(hp),
      maxHp: Math.round(hp),
      dmg: Math.round(dmg),
      speed: t.speed,
      // 经验按新难度曲线成长：正常推图即可跟上技能解锁与推荐等级
      xp: Math.round(t.xp * tune.xp * (elite ? 2.5 : 1)),
      gold: Math.round(U.rand(t.gold[0], t.gold[1]) * (1 + (ilvl - 1) * 0.5) * (elite ? 2 : 1)),
      attackRange: t.attackRange,
      attackCd: t.attackCd,
      atkTimer: U.rand(0.2, 0.8),
      ranged: !!t.ranged,
      shootCd: t.shootCd || 0,
      shootTimer: U.rand(0.6, 1.6),
      projSpeed: t.projectileSpeed || 250,
      projColor: t.projColor || '#b79be0',
      castTime: t.castTime || 0,
      boss: !!t.boss,
      elite,
      slow: 0,
      slowFactor: 0,
      flash: 0,
      ringTimer: t.ringCd || 0,
      ringCd: t.ringCd || 0,
      summonTimer: t.summonCd || 0,
      summonCd: t.summonCd || 0,
      // 分件表现：所有怪物通用，非分件怪不使用
      art: t.art || null,
      artScale: t.artScale || 1,
      fxColor: t.fxColor || '#cbe8a4',
      seed: U.random() * Math.PI * 2,
      facing: 0,
      moving: false,
      walkPhase: 0,
      shotAnim: 0,
      action: null,
      dead: false
    };

    // 首领表现与招式模组
    if (t.boss) {
      m.tint = t.tint || null;
      m.glow = t.glow || null;
      m.patterns = (t.patterns || []).map(a => Object.assign({ timer: 0 }, a));
      m.preferRange = t.preferRange || 130;
      m.facing = U.angle(m, this.player);
      // 初见压制：出手更快、走位更凶、每招读条与前摇压短
      m.aiCd = 0.3;
      m.speed *= 1.15;
      for (const a of m.patterns) {
        a.windup = Math.max(0.3, a.windup * 0.8);
        a.recover = Math.max(0.24, (a.recover || 0.45) * 0.85);
      }
      // 第 5 组招式：狂暴连击，贴身后连续两段横扫，保证每个首领 ≥5 组
      m.patterns.push({
        type: 'arc', label: '狂暴连击', range: 215,
        windup: 0.36, recover: 0.3, cd: 3.6, dmgMul: 0.68, arc: 2.0,
        radius: 168, color: m.glow || '#e0a090', fx: 'arcSlash', filler: true, timer: 0
      });
      m.cast = null;
      m.enraged = false;
      m.ambTimer = U.rand(0.1, 0.5);
    }

    this.monsters.push(m);
    // 随机精英同样吃本关词缀（词缀在属性算完之后再叠，避免倍率互相污染）
    if (elite) this.applyEliteAffixes(m);
    return m;
  },
  spawnBoss() {
    // 条件满足后首领在玩家附近（但不贴脸）的房间现身
    // 首领由关卡配置按章轮换投放（见 DG.data.dungeons 的 bossId），
    // 相邻关卡不会重复，所有关卡都优先使用已拆件重做的首领
    const bossId = this.def.bossId;
    const bt = DG.data.monsters[bossId];
    const br = (bt && bt.r) || 48;
    // 首领降临瞬间会震死全部小怪，允许与残余小怪重叠；
    // 落点按首领真实体型多次重试，避免因贴墙判定失败而中断关卡
    let boss = null;
    for (let i = 0; i < 6 && !boss; i++) {
      const pos = this.pickBossSpawn(br);
      boss = this.spawnMonster(bossId, pos.x, pos.y, true, null, true);
    }
    if (!boss) {
      // 首领配置缺失时直接结算撤离，避免流程卡在 bossIntro
      this.announce('首领未能降临，正在撤离……', 1600);
      this.ending = true;
      this.victory = false;
      this.finishTimer = 1.2;
      return;
    }
    const dir = DG.scenes.dungeon.dirName(U.angle(this.player, boss));
    // 同一首领重复出场：二阶段（更高血量与更早狂暴），第三章后再加新招式
    this.applyBossVariant(boss);
    if (DG.audio) DG.audio.playBgm('boss');
    this.$bossName.textContent = boss.name;
    this.$bossWrap.classList.remove('hidden');
    this.announce(`${boss.name} 在${dir}方现身`, 2600);
    this.addRing(boss.x, boss.y, 24, 170, '#d98b9d', 0.9);
    this.addRing(boss.x, boss.y, 10, 90, '#f0c0b0', 0.7);
    this.shake = 0.5;
    this.bossShockwave(boss);
    this.updateWaveText();
  },
  // 首领降临：红屏预警 + 震荡波清场（小怪瞬间震死，无掉落、无经验、不计击杀）
  bossShockwave(boss) {
    this.bossFlash = 1.6;
    this.shake = Math.max(this.shake, 0.8);
    // 敌方残留弹幕一并震散
    this.projectiles = this.projectiles.filter(p => p.team !== 'enemy');
    const touched = [];
    for (const m of this.monsters) {
      if (m.boss || m.dead) continue;
      m.hp = 0;
      m.dead = true;
      if (m.chunkIndex != null && touched.indexOf(m.chunkIndex) < 0) touched.push(m.chunkIndex);
      this.addBurst(m.x, m.y - m.r * 0.3, m.color || '#c6554e', 4);
      // 震死同样爆骨：首领登场时整片小怪一起炸成骨屑
      this.spawnBoneBurst(m);
      this.effects.push({
        kind: 'peaPuff', x: m.x, y: m.y - m.r * 0.5,
        r0: 5, r1: m.r * 2.4, color: m.fxColor || m.color || '#c6554e',
        life: 0.45, max: 0.45
      });
    }
    // 区块清空状态与正常击杀保持一致
    for (const ci of touched) {
      const ch = this.chunks[ci];
      if (!ch || ch.cleared) continue;
      const packs = this.chunkPacks.filter(p => p.chunk === ci);
      const alive = this.monsters.some(o => !o.dead && o.chunkIndex === ci);
      if (alive || !packs.length || !packs.every(p => p.spawned)) continue;
      ch.cleared = true;
    }
    // 以首领为圆心的红色冲击波
    this.effects.push({
      kind: 'quakeRing', x: boss.x, y: boss.y, radius: 440,
      color: '#e0483c', life: 0.5, max: 0.5
    });
    this.addRing(boss.x, boss.y, 18, 260, '#ff8a6a', 0.42);
    this.addRing(boss.x, boss.y, 70, 500, '#c23327', 0.62);
  },
  updateWaves(dt) {
    // 波次刷怪已由按块激活取代，这里只保留首领登场倒计时
    if (this.phase !== 'bossIntro') return;
    this.phaseTimer -= dt;
    if (this.phaseTimer <= 0) {
      this.phase = 'boss';
      this.spawnBoss();
    }
  }
  });
})();


;
/* ==== js/scenes/dungeon/effects.js ==== */
/* 副本战斗 · 表现层：飘字、粒子与冲击波 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
  addFloater(x, y, text, color, size) {
    this.floaters.push({ x, y, text, color, size: size || 20, life: 1, max: 1, vy: -52 });
  },
  addBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = U.rand(0, Math.PI * 2);
      const sp = U.rand(50, 200);
      this.effects.push({
        kind: 'spark', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: U.rand(0.25, 0.55), max: 0.55,
        r: U.rand(1.5, 3.5), color
      });
    }
  },
  addRing(x, y, r0, r1, color, dur) {
    this.effects.push({ kind: 'ring', x, y, r0, r1, color, life: dur || 0.45, max: dur || 0.45 });
  },
  // 首领受击：沿来击方向后退回弹 + 白热火花 / 冲击环 / 斩痕，
  // 普通怪物不走这里，避免杂兵互殴时特效刷屏
  bossHitReact(m, dmg, crit, opts) {
    const ang = (opts && opts.angle != null) ? opts.angle : U.angle(this.player, m);
    m.hitDir = ang;                       // 击退方向：背离攻击者
    m.hitReact = Math.max(m.hitReact || 0, crit ? 1 : 0.78);
    if (crit) m.flash = Math.max(m.flash || 0, 0.18);
    const art = DG.art && DG.art.bosses;
    const def = art && art.defs ? art.defs[m.art] : null;
    const tint = m.glow || (def && def.glow) || '#ffd27a';
    const h = art ? art.displayHeight(m) : m.r * 4;
    // 受击音效：体型越大音高越低沉；暴击更重，劈砍额外叠一道划痕声
    if (DG.audio && DG.audio.bossHit) {
      DG.audio.bossHit(crit, !!(opts && opts.chop), Math.max(0.8, Math.min(1.2, 250 / h)));
    }
    // 命中点落在身体中段，按首领体高换算而不是用碰撞半径
    const hx = m.x - Math.cos(ang) * m.r * 0.4;
    const hy = m.y - h * 0.46;
    const n = crit ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = ang + Math.PI + U.rand(-0.95, 0.95);
      const sp = U.rand(90, 250) * (crit ? 1.3 : 1);
      this.effects.push({
        kind: 'spark', x: hx, y: hy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 45,
        life: U.rand(0.16, 0.38), max: 0.38,
        r: U.rand(1.6, 3.4), color: crit ? '#ffe6a8' : '#fff2d6'
      });
    }
    // 命中斩痕：沿来击角度切过身体，暴击时更宽；颜色跟随首领辉光，避免被闪白吃掉
    this.effects.push({
      kind: 'slash', x: hx, y: hy, angle: ang,
      radius: Math.max(24, h * (crit ? 0.3 : 0.22)),
      arc: crit ? 1.6 : 1.15, color: crit ? '#fff3cc' : tint,
      life: 0.14, max: 0.14
    });
    this.addRing(hx, hy, 6, Math.max(26, h * (crit ? 0.4 : 0.28)), tint, crit ? 0.34 : 0.24);
    if (crit) {
      this.addRing(hx, hy, 4, Math.max(44, h * 0.62), '#fff4cf', 0.46);
      this.shake = Math.max(this.shake || 0, 0.05);
    }
  },
  updateEffects(dt) {
    // 升级光环倒计时：与粒子分开维护，绘制时按剩余比例淡出
    if (this.levelFx > 0) this.levelFx = Math.max(0, this.levelFx - dt);
    if (this.dangerZones && this.dangerZones.length) {
      let n = 0;
      for (let i = 0; i < this.dangerZones.length; i++) {
        const z = this.dangerZones[i];
        z.life -= dt;
        if (z.life > 0) this.dangerZones[n++] = z;
      }
      this.dangerZones.length = n;
    }
    // 视觉粒子只影响表现：超过上限时丢弃最旧的一批，防止长时间战斗后线性变慢
    const MAX_EFFECTS = 420;
    if (this.effects.length > MAX_EFFECTS) this.effects.splice(0, this.effects.length - MAX_EFFECTS);
    // 原地压缩：每帧新建数组会在长时间战斗里持续制造垃圾，交给 GC 反而更卡
    const list = this.effects;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e.life -= dt;
      if (e.kind === 'spark') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 0.94;
        e.vy *= 0.94;
      }
      if (e.kind === 'blood') {
        // 血珠：抛物线飞溅，横向速度轻微衰减
        e.vy += 760 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 0.985;
      }
      if (e.kind === 'shard') {
        // 破碎碎片：重力下落 + 翻滚
        e.vy += 880 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 0.99;
        e.rot += e.vr * dt;
      }
      if (e.life > 0) list[n++] = e;
    }
    list.length = n;
  },
  updateFloaters(dt) {
    const MAX_FLOATERS = 80;
    if (this.floaters.length > MAX_FLOATERS) this.floaters.splice(0, this.floaters.length - MAX_FLOATERS);
    const list = this.floaters;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.97;
      if (f.life > 0) list[n++] = f;
    }
    list.length = n;
  }
  });
})();


;
/* ==== js/scenes/dungeon/weather.js ==== */
/* 副本战斗 · 天气层：每局一种纯视觉天气，屏幕空间粒子 + 缓存色调
   性能约束：粒子对象一次创建、循环复用；同类粒子合并成一次 stroke/fill；
   所有渐变只创建一次，逐帧只改 globalAlpha */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H } = DG.scenes.dungeon.size;

  // 每种天气的表现参数：粒子形态、数量、速度、色调
  // rain/sand/wind 用线段，snow 用小方块
  const WEATHERS = {
    rain: {
      name: '细雨', kind: 'rain', count: 150,
      speed: [900, 1250], angle: 0.22, len: [12, 22],
      color: 'rgba(178,202,226,0.42)', tint: 'rgba(28,40,62,0.14)'
    },
    storm: {
      name: '雷雨', kind: 'rain', count: 175,
      speed: [1150, 1600], angle: 0.3, len: [16, 26],
      color: 'rgba(170,196,226,0.46)', tint: 'rgba(18,26,46,0.26)', flash: true
    },
    snow: {
      name: '落雪', kind: 'snow', count: 72,
      speed: [55, 130], drift: [14, 34], r: [1.2, 2.8], wind: 20,
      color: 'rgba(232,240,250,0.62)', tint: 'rgba(150,176,208,0.10)'
    },
    wind: {
      name: '疾风', kind: 'wind', count: 58,
      speed: [700, 1050], len: [40, 100],
      color: 'rgba(206,196,172,0.21)', tint: 'rgba(72,64,48,0.06)'
    },
    sandstorm: {
      name: '沙尘暴', kind: 'sand', count: 130,
      speed: [900, 1350], len: [30, 70],
      color: 'rgba(216,182,120,0.30)', tint: 'rgba(96,70,34,0.26)'
    },
    // —— 主题场景专属天气 ——
    purplewind: {
      name: '紫焰风', kind: 'emberwind', count: 64,
      speed: [620, 980], len: [34, 88], ambient: 'wind',
      color: 'rgba(198,140,246,0.26)', tint: 'rgba(58,16,88,0.17)'
    },
    blizzard: {
      name: '暴雪', kind: 'snow', count: 132,
      speed: [150, 300], drift: [26, 62], r: [1.4, 3.2], wind: 90, ambient: 'snow',
      color: 'rgba(236,244,255,0.68)', tint: 'rgba(120,164,214,0.17)'
    },
    bloodrain: {
      name: '血雨', kind: 'rain', count: 168,
      speed: [1000, 1450], angle: 0.18, len: [16, 28], ambient: 'rain',
      color: 'rgba(196,54,44,0.46)', tint: 'rgba(72,10,8,0.22)',
      splash: 'rgba(214,66,54,0.55)'
    },
    grasswind: {
      name: '飞草', kind: 'grass', count: 110,
      speed: [520, 920], tint: 'rgba(44,110,86,0.10)', ambient: 'wind',
      colors: ['rgba(150,220,150,0.55)', 'rgba(108,190,160,0.5)', 'rgba(212,226,142,0.45)']
    },
    maplefall: {
      name: '枫落', kind: 'maple', count: 64,
      vy: [55, 120], vx: [24, 80], size: [5, 10], ambient: 'wind',
      tint: 'rgba(120,56,14,0.14)',
      colors: ['#d9822b', '#c85a28', '#e0a03a', '#a8471e']
    }
  };

  // 地图风格 → 天气权重：森林少沙尘，墓穴多风暴，深渊多风暴与沙尘
  const STYLE_POOL = {
    grove: [
      { id: 'rain', weight: 32 }, { id: 'storm', weight: 22 },
      { id: 'wind', weight: 22 }, { id: 'snow', weight: 12 },
      { id: 'sandstorm', weight: 12 }
    ],
    crypt: [
      { id: 'storm', weight: 34 }, { id: 'wind', weight: 24 },
      { id: 'rain', weight: 24 }, { id: 'sandstorm', weight: 18 }
    ],
    abyss: [
      { id: 'storm', weight: 30 }, { id: 'sandstorm', weight: 26 },
      { id: 'wind', weight: 22 }, { id: 'rain', weight: 22 }
    ],
    // 主题场景固定标志性天气，保证一眼能认出场景
    inferno: [{ id: 'purplewind', weight: 100 }],
    snowfield: [{ id: 'blizzard', weight: 100 }],
    hell: [{ id: 'bloodrain', weight: 100 }],
    savanna: [{ id: 'grasswind', weight: 100 }],
    autumn: [{ id: 'maplefall', weight: 100 }]
  };

  // 天气的战斗规则与怪物倾向
  // monSpeed=怪物移速倍率 / windup=起手倍率 / sight=索敌半径倍率 / chill=命中冰缓概率
  // projDrift=敌方弹道每秒偏转角 / packBonus=每群额外怪 / spread=怪群散布倍率
  const RULES = {
    rain: {
      desc: '泥泞：水洼会拖慢怪物，可把怪引进水洼风筝',
      monSpeed: 0.9, windup: 1.15, packBonus: 1,
      bias: ['slime', 'frostslime', 'deepfin', 'angler', 'pea']
    },
    storm: {
      desc: '落雷：周期性天雷轰击，飞行与远程怪增多',
      eliteChance: 0.42, strike: true,
      bias: ['bat', 'cinderraven', 'hornet', 'mistwalker', 'musketeer']
    },
    snow: {
      desc: '严寒：积雪会拖住怪物脚步，命中附加冰缓',
      monSpeed: 0.86, chill: 0.3,
      bias: ['frostwolf', 'frostslime', 'wolf', 'fleece']
    },
    wind: {
      desc: '强风：风带会把你推快、把怪物拖慢',
      monSpeed: 1.06, projDrift: 0.3, spread: 1.7,
      bias: ['foxraider', 'cowlbandit', 'wolf', 'hornet']
    },
    sandstorm: {
      desc: '沙尘蔽目：流沙会陷住怪物，视野同时缩短',
      monSpeed: 0.95, sight: 0.62, spread: 0.85,
      bias: ['skeleton', 'bat', 'foxraider', 'mummy', 'beetle']
    },
    purplewind: {
      desc: '紫焰狂风：余烬地火会灼伤怪物，焰属怪增多',
      monSpeed: 1.05, projDrift: 0.28, spread: 1.5,
      bias: ['candle', 'cinderraven', 'beetle', 'emberdrake', 'warlock']
    },
    blizzard: {
      desc: '暴雪：视野与索敌被压低，雪地会拖慢怪物，可借机脱战',
      monSpeed: 0.82, chill: 0.38,
      bias: ['frostwolf', 'frostslime', 'wolf', 'fleece', 'bulwark']
    },
    bloodrain: {
      desc: '血雨：血泊会减速并腐蚀怪物，嗜血怪增多',
      monSpeed: 1.02, windup: 0.9,
      bias: ['bat', 'hornet', 'foxraider', 'skeleton', 'mummy']
    },
    grasswind: {
      desc: '草原疾风：高草可以藏身，怪群更分散',
      monSpeed: 1.04, spread: 1.6,
      bias: ['wolf', 'foxraider', 'fleece', 'venomlisk']
    },
    maplefall: {
      desc: '枫落：枫叶堆会被踩爆，可把怪物引上去',
      sight: 0.7, spread: 1.15,
      bias: ['wolf', 'mistwalker', 'pumpkin', 'musketeer']
    }
  };

  Object.assign(DG.scenes.dungeon.prototype, {
  // 进入副本时掷一次天气，整局不变
  rollWeather() {
    const pool = STYLE_POOL[this.def && this.def.mapStyle] || STYLE_POOL.grove;
    this.weather = U.weighted(pool).id;
    this.weatherName = WEATHERS[this.weather].name;
    this.wxFlash = 0;
    this.wxNextFlash = U.rand(2.4, 6.5);
    this.wxParticles = [];
    const p = WEATHERS[this.weather];
    for (let i = 0; i < p.count; i++) this.wxParticles.push(this.makeWxParticle(p));

    // 附加表现：雨点溅落 / 疾风落叶 / 沙尘滚滚 / 雷电折线
    this.wxSplashAcc = 0;
    this.wxSplashIdx = 0;
    this.wxSplash = [];
    if (p.kind === 'rain') {
      for (let i = 0; i < 26; i++) this.wxSplash.push({ x: 0, y: 0, life: 0, r: 1 });
    }
    this.wxLeaves = [];
    if (this.weather === 'wind') {
      for (let i = 0; i < 18; i++) this.wxLeaves.push(this.makeLeaf());
    }
    // 紫焰风：风线之外再叠一层随风漂移的余烬
    this.wxEmbers = [];
    if (p.kind === 'emberwind') {
      for (let i = 0; i < 38; i++) {
        this.wxEmbers.push({
          x: U.rand(-W, W), y: U.rand(0, H),
          vx: U.rand(120, 340), vy: U.rand(24, 78),
          r: U.rand(1.1, 2.6), ph: U.rand(0, 6.28)
        });
      }
    }
    this.wxGust = 0;
    this.wxGustT = U.rand(0, 6);
    this.wxBolt = null;

    // 战斗规则：数值倍率与怪物倾向，供战斗/刷怪层直接读取
    const rule = RULES[this.weather] || {};
    this.wxRule = rule;
    this.wxMonSpeed = rule.monSpeed || 1;
    this.wxWindup = rule.windup || 1;
    this.wxSightMul = rule.sight || 1;
    this.wxProjDrift = rule.projDrift || 0;
    this.wxPackBonus = rule.packBonus || 0;
    this.wxSpreadMul = rule.spread || 1;
    // 雷雨额外提升精英出现率；基础概率由关卡难度曲线决定
    this.wxEliteBonus = rule.eliteChance ? Math.max(0, rule.eliteChance - 0.3) : 0;
    this.wxSpawnBias = rule.bias || null;
    // 雷雨天雷：先画预警圈，0.85 秒后落雷
    this.wxStrikes = [];
    this.wxStrikeT = U.rand(9, 14);

    // 天气环境音：未解锁时会先记住，首次点击/按键后自动补播
    if (DG.audio) DG.audio.setAmbient(p.ambient || this.weather);
  },
  makeLeaf() {
    return {
      x: U.rand(-W, W), y: U.rand(0, H),
      vx: U.rand(420, 760), vy: U.rand(-40, 40),
      s: U.rand(4.5, 8.5), rot: U.rand(0, 6.28), spin: U.rand(-6, 6),
      color: U.chance(0.5) ? '#b0a06a' : '#8a7a4e'
    };
  },
  // 雷电视觉：主干 + 一条分叉，生命 0.18 秒
  makeBolt() {
    const pts = [];
    let x = U.rand(W * 0.18, W * 0.82);
    pts.push({ x: x, y: -10 });
    for (let i = 1; i <= 8; i++) {
      x += U.rand(-46, 46);
      pts.push({ x: U.clamp(x, 10, W - 10), y: (H * 0.5) * (i / 8) });
    }
    const bi = 3 + U.randInt(0, 2);
    const branch = [{ x: pts[bi].x, y: pts[bi].y }];
    let bx = pts[bi].x, by = pts[bi].y;
    for (let i = 0; i < 3; i++) {
      bx += U.rand(18, 52) * (U.chance(0.5) ? 1 : -1);
      by += U.rand(20, 46);
      branch.push({ x: bx, y: by });
    }
    this.wxBolt = { pts: pts, branch: branch, life: 0.18, max: 0.18 };
  },
  // 天雷落地：玩家与怪物都会被劈到，是危险也是清怪机会
  strikeLightning(x, y) {
    this.addBurst(x, y, '#bcd9ff', 16);
    this.addRing(x, y, 12, 112, '#dceaff', 0.34);
    this.makeBolt();
    this.wxFlash = Math.max(this.wxFlash, 0.9);
    this.shake = Math.max(this.shake, 0.2);
    if (DG.audio) DG.audio.thunder(0.85);

    const R = 92;
    if (U.dist(this.player, { x: x, y: y }) < R + this.player.r) {
      this.hurtPlayer(Math.round(this.player.maxHp * 0.07));
      this.addFloater(this.player.x, this.player.y - 40, '雷击', '#bcd9ff', 24);
    }
    for (const m of this.monsters) {
      if (m.dead || m.boss) continue;
      if (U.dist(m, { x: x, y: y }) < R + m.r) {
        this.hitMonster(m, Math.max(10, Math.round(m.maxHp * 0.18)), false);
      }
    }
  },
  makeWxParticle(p) {
    const q = { kind: p.kind, ph: U.rand(0, 6.28) };
    if (p.kind === 'rain') {
      const sp = U.rand(p.speed[0], p.speed[1]);
      const len = U.rand(p.len[0], p.len[1]);
      q.vy = Math.cos(p.angle) * sp;
      q.vx = Math.sin(p.angle) * sp;
      q.dx = Math.sin(p.angle) * len;
      q.dy = Math.cos(p.angle) * len;
      q.x = U.rand(-120, W + 60);
      q.y = U.rand(-H, H);
    } else if (p.kind === 'sand' || p.kind === 'wind' || p.kind === 'emberwind') {
      const sp = U.rand(p.speed[0], p.speed[1]);
      const len = U.rand(p.len[0], p.len[1]);
      q.vx = sp;
      q.vy = 0;
      q.dx = len;
      q.dy = p.kind === 'sand' ? len * 0.14 : len * 0.06;
      q.x = U.rand(-W, W);
      q.y = U.rand(0, H);
      if (p.kind !== 'sand') q.amp = U.rand(6, 18);
    } else if (p.kind === 'grass') {
      q.vx = U.rand(p.speed[0], p.speed[1]);
      q.len = U.rand(10, 22);
      q.rot = U.rand(-0.5, 0.5);
      q.spin = U.rand(-5, 5);
      q.ci = U.randInt(0, p.colors.length - 1);
      q.x = U.rand(-W, W);
      q.y = U.rand(0, H);
    } else if (p.kind === 'maple') {
      q.vy = U.rand(p.vy[0], p.vy[1]);
      q.vx = U.rand(p.vx[0], p.vx[1]);
      q.s = U.rand(p.size[0], p.size[1]);
      q.rot = U.rand(0, 6.28);
      q.spin = U.rand(-3.5, 3.5);
      q.color = p.colors[U.randInt(0, p.colors.length - 1)];
      q.x = U.rand(0, W);
      q.y = U.rand(-H, H);
    } else if (p.kind === 'snow') {
      q.vy = U.rand(p.speed[0], p.speed[1]);
      q.drift = U.rand(p.drift[0], p.drift[1]);
      q.r = U.rand(p.r[0], p.r[1]);
      q.x = U.rand(0, W);
      q.y = U.rand(0, H);
      q.glint = U.chance(0.28);   // 少数雪片闪一下，避免整屏死板
    }
    return q;
  },
  updateWeather(dt) {
    const p = WEATHERS[this.weather];
    if (!p) return;
    const list = this.wxParticles;
    if (list) {
      for (const q of list) {
        if (q.kind === 'rain') {
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          if (q.y > H + 26) {
            q.y = -26 - U.rand(0, 180);
            q.x = U.rand(-120, W + 60);
          }
        } else if (q.kind === 'sand' || q.kind === 'wind' || q.kind === 'emberwind') {
          q.x += q.vx * dt;
          if (q.x > W + 120) {
            q.x = -120 - U.rand(0, 260);
            q.y = U.rand(0, H);
          }
          if (q.amp) {
            q.ph += dt * 2.2;
            q.y += Math.sin(q.ph) * q.amp * dt;
          }
        } else if (q.kind === 'grass') {
          q.x += q.vx * dt * (1 + this.wxGust * 0.7);
          q.ph += dt * 3.4;
          q.y += (Math.sin(q.ph) * 26 + 16) * dt;
          q.rot = Math.sin(q.ph) * 0.65;
          if (q.x > W + 40) {
            q.x = -40 - U.rand(0, 260);
            q.y = U.rand(0, H);
          }
          if (q.y > H + 20) q.y = -20;
        } else if (q.kind === 'maple') {
          q.ph += dt * 2.1;
          q.x += (q.vx + Math.sin(q.ph) * 42) * dt * (1 + this.wxGust * 0.3);
          q.y += q.vy * dt;
          q.rot += q.spin * dt;
          if (q.y > H + 20) {
            q.y = -20;
            q.x = U.rand(0, W);
          }
          if (q.x > W + 24) q.x = -24;
        } else if (q.kind === 'snow') {
          q.ph += dt * 1.6;
          q.x += (Math.sin(q.ph) * q.drift + p.wind) * dt;
          q.y += q.vy * dt;
          if (q.y > H + 8) { q.y = -8; q.x = U.rand(0, W); }
          if (q.x > W + 10) q.x -= W + 20;
          else if (q.x < -10) q.x += W + 20;
        }
      }
    }
    // 雨点溅落：按频率从对象池里取一个空闲水花
    if (this.wxSplash.length) {
      this.wxSplashAcc += dt * (p.flash ? 64 : 44);
      let guard = 4;
      while (this.wxSplashAcc >= 1 && guard-- > 0) {
        this.wxSplashAcc -= 1;
        this.wxSplashIdx = (this.wxSplashIdx + 1) % this.wxSplash.length;
        const s = this.wxSplash[this.wxSplashIdx];
        if (s.life <= 0) {
          s.x = U.rand(0, W);
          s.y = U.rand(H * 0.12, H);
          s.life = 0.34;
          s.r = U.rand(1, 2.2);
        }
      }
      for (const s of this.wxSplash) {
        if (s.life > 0) s.life -= dt;
      }
    }

    // 余烬：随风向右上飘，越界后从左侧重新吹入
    if (this.wxEmbers && this.wxEmbers.length) {
      for (const e of this.wxEmbers) {
        e.ph += dt * 3;
        e.x += e.vx * dt * (1 + this.wxGust * 0.9);
        e.y -= (e.vy + Math.sin(e.ph) * 18) * dt;
        if (e.x > W + 20 || e.y < -12) {
          e.x = -20 - U.rand(0, 120);
          e.y = U.rand(H * 0.1, H);
        }
      }
    }

    // 阵风：疾风与沙尘暴每隔几秒来一阵，短时加强
    if (this.weather === 'wind' || this.weather === 'sandstorm' ||
      this.weather === 'purplewind' || this.weather === 'grasswind') {
      this.wxGustT += dt;
      this.wxGust = Math.max(0, this.wxGust - dt * 0.9);
      if (this.wxGustT > 6.2) {
        this.wxGustT = 0;
        this.wxGust = 1;
      }
    }

    // 落叶：飞出右侧后回收重置
    if (this.wxLeaves.length) {
      for (const q of this.wxLeaves) {
        q.x += q.vx * dt * (1 + this.wxGust * 0.7);
        q.y += (q.vy + Math.sin(q.rot) * 60) * dt;
        q.rot += q.spin * dt;
        if (q.x > W + 24 || q.y < -30 || q.y > H + 30) {
          const n = this.makeLeaf();
          q.x = -24;
          q.y = n.y;
          q.vx = n.vx;
          q.vy = n.vy;
          q.s = n.s;
          q.color = n.color;
        }
      }
    }

    // 落雷：在玩家附近预警，随后对范围内玩家与怪物同时造成伤害
    if (this.wxRule && this.wxRule.strike && !this.ending && !this.finished) {
      this.wxStrikeT -= dt;
      if (this.wxStrikeT <= 0) {
        this.wxStrikeT = U.rand(10, 15);
        const a = U.rand(0, Math.PI * 2);
        const r = U.rand(100, 240);
        const x = U.clamp(this.player.x + Math.cos(a) * r, 60, (this.arenaW || 3600) - 60);
        const y = U.clamp(this.player.y + Math.sin(a) * r, 60, (this.arenaH || 3840) - 60);
        this.addRing(x, y, 8, 92, '#9fd0ff', 0.85);
        this.wxStrikes.push({ x: x, y: y, t: 0.85 });
      }
      for (let i = this.wxStrikes.length - 1; i >= 0; i--) {
        const s = this.wxStrikes[i];
        s.t -= dt;
        if (s.t > 0) continue;
        this.wxStrikes.splice(i, 1);
        this.strikeLightning(s.x, s.y);
      }
    }

    if (p.flash) {
      this.wxNextFlash -= dt;
      if (this.wxNextFlash <= 0) {
        this.wxNextFlash = U.rand(2.6, 7);
        this.wxFlash = U.rand(0.55, 1);
        this.shake = Math.max(this.shake, 0.05 + this.wxFlash * 0.1);
        this.makeBolt();
        if (DG.audio) DG.audio.thunder(this.wxFlash);
      }
      if (this.wxFlash > 0) this.wxFlash = Math.max(0, this.wxFlash - dt * 5.5);
      if (this.wxBolt) {
        this.wxBolt.life -= dt;
        if (this.wxBolt.life <= 0) this.wxBolt = null;
      }
    }
  },
  // 天气画在实体与世界特效之上、暗角/受击红闪与 HUD 之下；
  // 首领在场时整体降到 70% 强度，保证战斗信息可读
  drawWeather(ctx) {
    const p = WEATHERS[this.weather];
    if (!p || !this.wxParticles) return;
    let calm = 1;
    for (const m of this.monsters) {
      if (m.boss && !m.dead) { calm = 0.7; break; }
    }

    ctx.save();
    // 1) 全局色调（沙尘暴随阵风轻微加深）
    const tintK = this.weather === 'sandstorm' ? 1 + this.wxGust * 0.3 : 1;
    ctx.globalAlpha = Math.min(1, calm * tintK);
    ctx.fillStyle = p.tint;
    ctx.fillRect(0, 0, W, H);

    // 2) 粒子：同一形态合并成一次 draw call
    ctx.globalAlpha = calm;
    const list = this.wxParticles;

    // 雨点溅落：地面小水花（逐个小圆环，数量有限）
    if (this.wxSplash.length) {
      ctx.strokeStyle = p.splash || 'rgba(190,214,236,0.5)';
      ctx.lineWidth = 1;
      for (const s of this.wxSplash) {
        if (s.life <= 0) continue;
        const k = 1 - s.life / 0.34;
        ctx.globalAlpha = calm * (1 - k) * 0.5;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 2 + k * 7, (2 + k * 7) * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = calm;
    }
    if (p.kind === 'rain') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const q of list) {
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.dx, q.y - q.dy);
      }
      ctx.stroke();
    } else if (p.kind === 'sand' || p.kind === 'wind' || p.kind === 'emberwind') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.kind === 'sand' ? 1.4 : 1.1;
      ctx.beginPath();
      for (const q of list) {
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.dx, q.y - q.dy);
      }
      ctx.stroke();
    } else if (p.kind === 'grass') {
      // 草叶按颜色分三批绘制，避免逐片切换样式
      for (let ci = 0; ci < p.colors.length; ci++) {
        ctx.strokeStyle = p.colors[ci];
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (const q of list) {
          if (q.ci !== ci) continue;
          const c = Math.cos(q.rot), s = Math.sin(q.rot);
          ctx.moveTo(q.x, q.y);
          ctx.lineTo(q.x + c * q.len, q.y + s * q.len * 0.5);
          ctx.moveTo(q.x + 2, q.y + 2);
          ctx.lineTo(q.x + c * q.len * 0.7 + 3, q.y + s * q.len * 0.35 - 2);
        }
        ctx.stroke();
      }
    } else if (p.kind === 'maple') {
      for (const q of list) {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = q.color;
        ctx.globalAlpha = calm * 0.85;
        ctx.beginPath();
        ctx.ellipse(0, 0, q.s, q.s * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = calm;
    } else if (p.kind === 'snow') {
      ctx.fillStyle = p.color;
      for (const q of list) ctx.fillRect(q.x, q.y, q.r, q.r);
      // 闪烁的雪片单独一批，做出反光感
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const q of list) {
        if (q.glint) ctx.fillRect(q.x - 0.4, q.y - 0.4, q.r + 0.8, q.r + 0.8);
      }
    }

    // 紫焰余烬：外圈柔光 + 亮芯两批绘制
    if (this.wxEmbers && this.wxEmbers.length) {
      ctx.fillStyle = 'rgba(188,116,255,0.28)';
      for (const e of this.wxEmbers) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(246,222,255,0.85)';
      for (const e of this.wxEmbers) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 落叶：小幅旋转，数量少，开销可忽略
    if (this.wxLeaves.length) {
      ctx.globalAlpha = calm * 0.78;
      for (const q of this.wxLeaves) {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = q.color;
        ctx.fillRect(-q.s / 2, -q.s * 0.18, q.s, q.s * 0.36);
        ctx.restore();
      }
      ctx.globalAlpha = calm;
    }

    // 3) 雷雨白闪 + 闪电折线
    if (this.wxFlash > 0) {
      ctx.globalAlpha = this.wxFlash * 0.16;
      ctx.fillStyle = '#e8eeff';
      ctx.fillRect(0, 0, W, H);
    }
    if (this.wxBolt) {
      const b = this.wxBolt;
      ctx.globalAlpha = Math.max(0, b.life / b.max);
      ctx.strokeStyle = '#eaf2ff';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(176,210,255,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(b.branch[0].x, b.branch[0].y);
      for (let i = 1; i < b.branch.length; i++) ctx.lineTo(b.branch[i].x, b.branch[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }
  });
})();


;
/* ==== js/scenes/dungeon/affix.js ==== */
/* 副本战斗 · 精英词缀：每关随机 1~2 条，贴在精英身上改变打法
 * 词缀只作用于精英（含密室守卫、宝箱怪），首领不受影响。
 * 数值改动集中在 promoteElite / hitMonster / onMonsterDeath 三处，
 * 视觉只多画一圈彩色环与护盾弧，不引入额外逐帧对象。
 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  const ELITE_AFFIXES = {
    frost: { name: '冰冻', color: '#8ec9e8', desc: '命中玩家附加冰缓' },
    thorn: { name: '荆棘', color: '#c98b5a', desc: '受击反弹 18% 伤害' },
    split: { name: '分裂', color: '#b07ce0', desc: '死亡时裂成两个小体' },
    haste: { name: '加速', color: '#e0c060', desc: '移速与起手更快' },
    ward: { name: '护盾', color: '#7fd0c0', desc: '额外 40% 生命的护盾' }
  };
  const AFFIX_IDS = Object.keys(ELITE_AFFIXES);

  Object.assign(DG.scenes.dungeon.prototype, {
    // 每局开局掷 1~2 条；关卡越靠后越容易出两条
    rollStageAffixes() {
      const lv = (this.def && this.def.index) || 1;
      const count = U.chance(Math.min(0.65, 0.3 + lv * 0.006)) ? 2 : 1;
      const pool = AFFIX_IDS.slice();
      const out = [];
      for (let i = 0; i < count && pool.length; i++) {
        out.push(pool.splice(U.randInt(0, pool.length - 1), 1)[0]);
      }
      this.eliteAffixes = out;
      this.eliteAffixText = out.map(id => ELITE_AFFIXES[id].name).join('·');
      return out;
    },
    // 贴到精英身上：属性、名字与护盾一次算完
    applyEliteAffixes(m) {
      if (!m || m.boss || (m.affixes && m.affixes.length)) return m;
      const ids = (this.eliteAffixes || []).slice();
      if (!ids.length) return m;
      m.affixes = ids;
      const base = m.name || (DG.data.monsters[m.typeId] || {}).name || '精英';
      m.baseName = base;
      if (ids.indexOf('haste') >= 0) {
        m.speed *= 1.28;
        m.windupMul = 0.78;
      }
      if (ids.indexOf('ward') >= 0) {
        m.shield = Math.round(m.maxHp * 0.4);
        m.maxShield = m.shield;
      }
      m.name = ids.map(id => ELITE_AFFIXES[id].name).join('·') + ' · ' + base;
      return m;
    },
    // 精英打中玩家后触发（目前只有冰冻）
    affixOnHit(m) {
      if (!m || !m.affixes || this.player.hp <= 0) return;
      if (m.affixes.indexOf('frost') >= 0) {
        this.player.chillT = Math.max(this.player.chillT || 0, 1.8);
        this.addFloater(this.player.x, this.player.y - 46, '冰缓', '#8ec9e8', 20);
      }
    },
    // 分裂：死亡瞬间裂成两个小体，不给经验、不掉落，避免刷资源
    splitElite(m) {
      const tpl = DG.data.monsters[m.typeId];
      if (!tpl || m.splitDone) return;
      m.splitDone = true;
      for (let i = 0; i < 2; i++) {
        const a = (i ? Math.PI : 0) + U.rand(-0.5, 0.5);
        const pos = this.nearestFloorPoint(m.x + Math.cos(a) * 46, m.y + Math.sin(a) * 46, 3) ||
          this.nearestFloorPoint(m.x, m.y, 3);
        if (!pos) continue;
        const c = this.spawnMonster(m.typeId, pos.x, pos.y, false, m.chunkIndex);
        if (!c) continue;
        c.elite = false;
        c.affixes = null;
        c.shield = 0;
        c.r *= 0.78;
        c.maxHp = Math.max(1, Math.round(m.maxHp * 0.4));
        c.hp = c.maxHp;
        c.dmg = Math.max(1, Math.round(m.dmg * 0.55));
        c.xp = 0;
        c.gold = 0;
        c.noLoot = true;
        c.splitDone = true;
        c.aggro = true;
        c.spawnTime = this.time - 1;   // 立刻进入战斗
        c.name = '裂片 · ' + (tpl.name || c.name);
        this.addRing(c.x, c.y, 10, 60, '#b07ce0', 0.4);
      }
      this.addBurst(m.x, m.y, '#b07ce0', 14);
    }
  });

  DG.scenes.dungeon.ELITE_AFFIXES = ELITE_AFFIXES;
})();


;
/* ==== js/scenes/dungeon/field.js ==== */
/* 副本战斗 · 场地层：每 5 关的场地机制 + 天气留下的可利用地形
 * 设计目标：场地规则对双方都生效，但玩家能主动利用（借火清怪、把怪引进血泊/陷阱、
 * 借暴雪脱战、藏草伏击）。所有区域都在玩家附近按需生成，数量有上限，
 * 逐帧只做距离判断与少量圆形绘制，不增加寻路或额外实体。
 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H } = DG.scenes.dungeon.size;

  // 每 5 关一场地机制，按地图主题分配；同主题连续出现时轮换成下一种
  const FIELD_BY_STYLE = {
    grove: 'grass',
    savanna: 'grass',
    autumn: 'maple',
    crypt: 'maple',
    abyss: 'blood',
    snowfield: 'blizzard',
    inferno: 'fire',
    hell: 'fire'
  };
  const FIELD_CYCLE = ['fire', 'blood', 'blizzard', 'grass', 'maple'];
  const FIELDS = {
    fire: { name: '收缩火圈', desc: '火圈不断收紧，圈外持续灼烧；把怪留在圈外可以借火清场' },
    blood: { name: '血雨减速区', desc: '血泊里怪物减速 50%，玩家只减速 15%，可以绕着血泊风筝' },
    blizzard: { name: '暴雪降视野', desc: '风雪压低视野与索敌半径，远离的怪物会跟丢' },
    grass: { name: '草丛伏击', desc: '藏进草丛可以脱战，现身第一击额外造成 80% 伤害' },
    maple: { name: '枫叶掩埋陷阱', desc: '踩中枫叶堆会引爆，把怪物引上去可以借陷阱杀伤' }
  };

  // 天气地形：由天气留下的、可被玩家利用的场地规则
  const WX_ZONES = {
    rain: { kind: 'puddle', slow: 0.35, color: '#8ab4d8' },
    snow: { kind: 'puddle', slow: 0.4, color: '#cfe0f0' },
    blizzard: { kind: 'puddle', slow: 0.45, color: '#dce8f8' },
    bloodrain: { kind: 'blood', slow: 0.4, dps: 0.012, color: '#c43636' },
    wind: { kind: 'windlane', slow: 0.22, boost: 1.15, color: '#cfc7a8' },
    purplewind: { kind: 'ember', dps: 0.02, color: '#c68cf6' },
    grasswind: { kind: 'grass', slow: 0.3, color: '#7cc98a' },
    sandstorm: { kind: 'quicksand', slow: 0.5, stun: 0.5, color: '#d8b678' },
    maplefall: { kind: 'trap', dmg: 0.08, color: '#d9822b' }
  };

  function rgba(hex, a) {
    if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function fieldKindFor(def) {
    return FIELD_BY_STYLE[(def && def.mapStyle) || 'grove'] || 'fire';
  }

  Object.assign(DG.scenes.dungeon.prototype, {
    // 进场时定一次：场地机制（仅 5 的倍数关）+ 天气地形（每关都有）
    rollField() {
      this.field = null;
      this.fieldZones = [];
      this.fieldStealth = false;
      this.fieldReveal = 0;
      this.fieldSightMul = 1;
      this.fieldGrassHidden = false;
      this.zoneHidden = false;
      this.fieldZoneBoost = 1;
      this.playerSlowT = 0;
      this.playerSlowMul = 1;
      this.wxZones = [];
      this.wxZoneT = U.rand(4, 7);

      const idx = (this.def && this.def.index) || 0;
      if (!idx || idx % 5 !== 0) return null;
      // 顺序推演本章每一步的场地：同一场地不在相邻两关重复，
      // 避免一个章节连着刷同一种机制
      const kinds = {};
      for (let i = 5; i <= idx; i += 5) {
        const d = DG.data.dungeons[i - 1];
        if (!d) continue;
        let k = fieldKindFor(d);
        const recent = [kinds[i - 10], kinds[i - 5]];
        let guard = 0;
        while (recent.indexOf(k) >= 0 && guard < FIELD_CYCLE.length) {
          k = FIELD_CYCLE[(FIELD_CYCLE.indexOf(k) + 1) % FIELD_CYCLE.length];
          guard++;
        }
        kinds[i] = k;
      }
      const kind = kinds[idx] || fieldKindFor(this.def);
      const meta = FIELDS[kind];
      this.field = {
        kind,
        name: meta.name,
        desc: meta.desc,
        timer: 4,
        ring: null,
        pools: [],
        patches: [],
        piles: []
      };
      if (kind === 'blizzard') this.fieldSightMul = 0.45;
      return this.field;
    },

    updateField(dt) {
      if (this.finished || this.paused) return;
      if (this.playerSlowT > 0) {
        this.playerSlowT -= dt;
        if (this.playerSlowT <= 0) { this.playerSlowT = 0; this.playerSlowMul = 1; }
      }
      if (this.fieldReveal > 0) this.fieldReveal = Math.max(0, this.fieldReveal - dt);
      this.updateWeatherZones(dt);
      const f = this.field;
      if (!f) {
        this.fieldStealth = this.zoneHidden && this.fieldReveal <= 0;
        return;
      }
      if (f.kind === 'fire') this.updateFireRing(dt, f);
      else if (f.kind === 'blood') this.updateBloodPools(dt, f);
      else if (f.kind === 'blizzard') this.updateBlizzardField(dt, f);
      else if (f.kind === 'grass') this.updateGrassField(dt, f);
      else if (f.kind === 'maple') this.updateMapleField(dt, f);
      this.fieldStealth = (this.zoneHidden || this.fieldGrassHidden) && this.fieldReveal <= 0;
    },

    // —— 火圈：以玩家当前位置为中心生成，随后持续收紧 ——
    updateFireRing(dt, f) {
      if (!f.ring) {
        f.timer -= dt;
        if (f.timer <= 0) {
          f.ring = { x: this.player.x, y: this.player.y, r: 340, t: 0, arm: 1.1, life: 8.2, tick: 0 };
          this.addRing(f.ring.x, f.ring.y, 80, 340, '#ff8a4a', 0.9);
          this.announce('火圈开始收缩', 1200);
        }
        return;
      }
      const ring = f.ring;
      ring.t += dt;
      const k = Math.max(0, ring.t - ring.arm);
      ring.r = U.lerp(340, 150, Math.min(1, k / 6.2));
      ring.tick -= dt;
      if (k > 0 && ring.tick <= 0) {
        ring.tick = 0.5;
        const p = this.player;
        if (p.hp > 0 && U.dist(p, ring) > ring.r) {
          this.hurtPlayer(Math.round(p.maxHp * 0.02));
          this.addFloater(p.x, p.y - 44, '灼烧', '#ff9a5a', 20);
        }
        for (const m of this.monsters) {
          if (m.dead || m.boss) continue;
          if (U.dist(m, ring) <= ring.r) continue;
          this.hitMonster(m, Math.max(6, Math.round(m.maxHp * 0.05)), false, { quiet: true });
          this.addBurst(m.x, m.y - m.r * 0.4, '#ff8a4a', 3);
        }
      }
      if (ring.t >= ring.life) {
        f.ring = null;
        f.timer = U.rand(11, 15);
      }
    },

    // —— 血泊：怪物减速 50%，玩家只减速 15% ——
    updateBloodPools(dt, f) {
      f.timer -= dt;
      if (f.timer <= 0 && f.pools.length < 5) {
        f.timer = U.rand(2.6, 4);
        const a = U.rand(0, Math.PI * 2);
        const d = U.rand(120, 400);
        const pos = this.nearestFloorPoint(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 3);
        if (pos) f.pools.push({ x: pos.x, y: pos.y, r: U.rand(80, 115), life: U.rand(9, 13) });
      }
      for (let i = f.pools.length - 1; i >= 0; i--) {
        const pool = f.pools[i];
        pool.life -= dt;
        if (pool.life <= 0) { f.pools.splice(i, 1); continue; }
        for (const m of this.monsters) {
          if (m.dead || m.boss) continue;
          if (U.dist(m, pool) < pool.r + m.r * 0.4) {
            m.slow = Math.max(m.slow, 0.3);
            m.slowFactor = Math.max(m.slowFactor || 0, 0.5);
          }
        }
        if (U.dist(this.player, pool) < pool.r) {
          this.playerSlowT = Math.max(this.playerSlowT, 0.3);
          this.playerSlowMul = Math.min(this.playerSlowMul, 0.85);
        }
      }
    },

    // —— 暴雪：视野与索敌同时压低，拉开距离就能脱战 ——
    updateBlizzardField(dt, f) {
      this.fieldSightMul = 0.45;
      f.timer -= dt;
      if (f.timer > 0) return;
      f.timer = 1.2;
      for (const m of this.monsters) {
        if (m.dead || m.boss || !m.aggro) continue;
        if (U.dist(m, this.player) > 460) m.aggro = false;
      }
    },

    // —— 草丛：藏进去脱战，出草第一击有伏击加成 ——
    updateGrassField(dt, f) {
      f.timer -= dt;
      if (f.timer <= 0 && f.patches.length < 9) {
        f.timer = U.rand(2.4, 3.6);
        const a = U.rand(0, Math.PI * 2);
        const d = U.rand(60, 360);
        const pos = this.nearestFloorPoint(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 3);
        if (pos) f.patches.push({ x: pos.x, y: pos.y, r: U.rand(58, 88) });
      }
      // 走远后回收，保证草丛始终长在玩家附近
      for (let i = f.patches.length - 1; i >= 0; i--) {
        if (U.dist(this.player, f.patches[i]) > 950) f.patches.splice(i, 1);
      }
      let hidden = false;
      for (const g of f.patches) {
        if (U.dist(this.player, g) < g.r) { hidden = true; break; }
      }
      this.fieldGrassHidden = hidden;
      if (hidden) {
        for (const m of this.monsters) {
          if (m.dead || m.boss) continue;
          if (U.dist(m, this.player) > 170) m.aggro = false;
        }
      }
    },

    // —— 枫叶陷阱：踩中后延迟引爆，双方都吃伤害 ——
    updateMapleField(dt, f) {
      f.timer -= dt;
      if (f.timer <= 0 && f.piles.length < 8) {
        f.timer = U.rand(2.8, 4.4);
        const a = U.rand(0, Math.PI * 2);
        const d = U.rand(70, 380);
        const pos = this.nearestFloorPoint(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 3);
        if (pos) f.piles.push({ x: pos.x, y: pos.y, r: 30, arm: 0, armed: false, life: 24 });
      }
      for (let i = f.piles.length - 1; i >= 0; i--) {
        const p = f.piles[i];
        p.life -= dt;
        if (p.life <= 0) { f.piles.splice(i, 1); continue; }
        if (!p.armed) {
          let hit = U.dist(this.player, p) < p.r + this.player.r;
          if (!hit) {
            for (const m of this.monsters) {
              if (!m.dead && !m.boss && U.dist(m, p) < p.r + m.r) { hit = true; break; }
            }
          }
          if (hit) {
            p.armed = true;
            p.arm = 0.8;
            this.addRing(p.x, p.y, p.r, p.r + 30, '#e0a03a', 0.8);
          }
        } else {
          p.arm -= dt;
          if (p.arm <= 0) {
            f.piles.splice(i, 1);
            this.explodeMaplePile(p);
          }
        }
      }
    },

    explodeMaplePile(p) {
      this.addBurst(p.x, p.y, '#e0a03a', 18);
      this.addRing(p.x, p.y, 10, 96, '#e0a03a', 0.4);
      this.shake = Math.max(this.shake, 0.16);
      const R = 86;
      if (this.player.hp > 0 && U.dist(this.player, p) < R + this.player.r) {
        this.hurtPlayer(Math.round(this.player.maxHp * 0.08));
        this.addFloater(this.player.x, this.player.y - 44, '枫叶爆裂', '#e0a03a', 20);
      }
      for (const m of this.monsters) {
        if (m.dead || m.boss) continue;
        if (U.dist(m, p) >= R + m.r) continue;
        this.hitMonster(m, Math.max(8, Math.round(m.maxHp * 0.12)), false, { quiet: true });
        m.slow = Math.max(m.slow, 0.5);
        m.slowFactor = Math.max(m.slowFactor || 0, 0.4);
        this.addBurst(m.x, m.y - m.r * 0.4, '#e0a03a', 4);
      }
    },

    // —— 天气地形：在玩家附近生成可被利用的小区域 ——
    updateWeatherZones(dt) {
      const cfg = WX_ZONES[this.weather];
      this.zoneHidden = false;
      this.fieldZoneBoost = 1;
      if (!cfg) return;
      this.wxZoneT -= dt;
      if (this.wxZoneT <= 0 && this.wxZones.length < 4) {
        this.wxZoneT = U.rand(3.2, 5.6);
        const a = U.rand(0, Math.PI * 2);
        const d = U.rand(90, 380);
        const pos = this.nearestFloorPoint(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 3);
        if (pos) {
          this.wxZones.push({
            kind: cfg.kind, x: pos.x, y: pos.y, r: U.rand(70, 110),
            life: U.rand(10, 14), tick: 0, armed: false, arm: 0
          });
        }
      }
      const p = this.player;
      for (let i = this.wxZones.length - 1; i >= 0; i--) {
        const z = this.wxZones[i];
        z.life -= dt;
        if (z.life <= 0) { this.wxZones.splice(i, 1); continue; }
        const pin = U.dist(p, z) < z.r;
        if (pin) {
          if (cfg.boost) this.fieldZoneBoost = Math.max(this.fieldZoneBoost, cfg.boost);
          if (cfg.kind === 'grass') this.zoneHidden = true;
          if (cfg.kind === 'puddle' || cfg.kind === 'blood') {
            this.playerSlowT = Math.max(this.playerSlowT, 0.3);
            this.playerSlowMul = Math.min(this.playerSlowMul, 0.9);
          }
        }
        if (cfg.kind === 'trap') {
          if (!z.armed) {
            let hit = pin;
            if (!hit) {
              for (const m of this.monsters) {
                if (!m.dead && !m.boss && U.dist(m, z) < z.r * 0.6) { hit = true; break; }
              }
            }
            if (hit) {
              z.armed = true;
              z.arm = 0.7;
              this.addRing(z.x, z.y, z.r * 0.5, z.r + 24, '#d9822b', 0.7);
            }
          } else {
            z.arm -= dt;
            if (z.arm <= 0) {
              this.wxZones.splice(i, 1);
              this.explodeMaplePile({ x: z.x, y: z.y, r: z.r });
            }
          }
          continue;
        }
        if (cfg.slow) {
          for (const m of this.monsters) {
            if (m.dead || m.boss) continue;
            if (U.dist(m, z) < z.r + m.r * 0.4) {
              m.slow = Math.max(m.slow, 0.3);
              m.slowFactor = Math.max(m.slowFactor || 0, cfg.slow);
            }
          }
        }
        if (z.tick > 0) { z.tick -= dt; continue; }
        z.tick = 1;
        if (cfg.dps) {
          for (const m of this.monsters) {
            if (m.dead || m.boss) continue;
            if (U.dist(m, z) < z.r + m.r * 0.4) {
              this.hitMonster(m, Math.max(4, Math.round(m.maxHp * cfg.dps)), false, { quiet: true });
            }
          }
        }
        if (cfg.stun) {
          for (const m of this.monsters) {
            if (m.dead || m.boss || !m.aggro) continue;
            if (U.dist(m, z) < z.r + m.r * 0.4) m.stun = Math.max(m.stun || 0, cfg.stun);
          }
        }
      }
    },

    // 地面层：火圈、血泊、草丛、枫叶堆与天气区域
    drawFieldGround(ctx) {
      const f = this.field;
      if (f) {
        if (f.kind === 'fire' && f.ring) this.drawFireRing(ctx, f.ring);
        if (f.kind === 'blood') {
          for (const pool of f.pools) this.drawGroundZone(ctx, pool, '#8e1e1c', 'blood');
        }
        if (f.kind === 'grass') {
          for (const g of f.patches) this.drawGroundZone(ctx, g, '#2f6b3f', 'grass');
        }
        if (f.kind === 'maple') {
          for (const p of f.piles) this.drawGroundZone(ctx, p, '#a8471e', p.armed ? 'trapArmed' : 'trap');
        }
      }
      const cfg = WX_ZONES[this.weather];
      if (!cfg) return;
      for (const z of this.wxZones || []) {
        this.drawGroundZone(ctx, z, cfg.color, z.armed ? 'trapArmed' : cfg.kind);
      }
    },

    drawFireRing(ctx, ring) {
      const k = Math.min(1, ring.t / ring.arm);
      ctx.save();
      // 圈内安全区淡光
      ctx.globalAlpha = 0.05 + 0.04 * k;
      ctx.fillStyle = '#ffb070';
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.fill();
      // 火墙：外圈亮、内圈暗，形成有厚度的环
      ctx.globalAlpha = 0.25 + 0.35 * k;
      ctx.strokeStyle = '#ff7a3a';
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.14 + 0.2 * k;
      ctx.strokeStyle = '#ffd08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r - 7, 0, Math.PI * 2);
      ctx.stroke();
      // 火舌：沿圆周取固定数量的点，用正弦抖动高度
      ctx.globalAlpha = 0.4 + 0.3 * k;
      ctx.fillStyle = '#ffb05a';
      const n = 28;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.time * 0.4;
        const flame = 5 + Math.sin(this.time * 9 + i * 1.7) * 4;
        ctx.fillRect(
          ring.x + Math.cos(a) * ring.r - 1.5,
          ring.y + Math.sin(a) * ring.r - flame,
          3, flame
        );
      }
      ctx.restore();
    },

    drawGroundZone(ctx, z, color, kind) {
      const v = this.viewRect(120);
      if (z.x < v.l || z.x > v.r || z.y < v.t || z.y > v.b) return;
      const r = z.r || 60;
      ctx.save();
      if (kind === 'trap' || kind === 'trapArmed') {
        // 落叶堆底层：一圈暗褐，保证在暗色地砖上也能看见
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = '#4a2410';
        ctx.beginPath();
        ctx.arc(z.x, z.y, r * 0.92, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = kind === 'trapArmed' ? 0.75 + Math.sin(this.time * 18) * 0.2 : 0.7;
        ctx.fillStyle = '#c25a20';
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + 0.4;
          ctx.beginPath();
          ctx.ellipse(z.x + Math.cos(a) * r * 0.42, z.y + Math.sin(a) * r * 0.3, r * 0.3, r * 0.17, a, 0, Math.PI * 2);
          ctx.fill();
        }
        if (kind === 'trapArmed') {
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = '#ffd08a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(z.x, z.y, r + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      // 水洼 / 血泊 / 流沙 / 风带：贴地椭圆
      ctx.globalAlpha = kind === 'blood' ? 0.3 : 0.22;
      ctx.fillStyle = rgba(color, 0.9);
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, r, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = rgba(color, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, r * 0.86, r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      // 草丛 / 风带 / 余烬加一点方向性细节
      if (kind === 'grass') {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(150,220,150,0.6)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const bx = z.x + Math.cos(a) * r * 0.62;
          const by = z.y + Math.sin(a) * r * 0.4;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.sin(this.time * 2 + i) * 4, by - 14);
          ctx.stroke();
        }
      } else if (kind === 'windlane' || kind === 'ember') {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = rgba(color, 0.9);
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const yy = z.y - r * 0.3 + i * r * 0.3;
          ctx.beginPath();
          ctx.moveTo(z.x - r * 0.7, yy);
          ctx.lineTo(z.x + r * 0.5 + Math.sin(this.time * 3 + i) * 10, yy);
          ctx.stroke();
        }
      }
      ctx.restore();
    },

    // 屏幕层：暴雪视野压制与隐匿提示
    drawFieldOverlay(ctx) {
      const f = this.field;
      const z = this.zoom || 1;
      const sx = W / 2 + (this.player.x - this.camera.x) * z;
      const sy = H / 2 + (this.player.y - this.camera.y) * z;
      if (f && f.kind === 'blizzard') {
        const rad = 330 * z;
        const g = ctx.createRadialGradient(sx, sy, rad * 0.4, sx, sy, rad * 1.5);
        g.addColorStop(0, 'rgba(10,18,30,0)');
        g.addColorStop(0.45, 'rgba(10,18,30,0.12)');
        g.addColorStop(0.75, 'rgba(8,14,26,0.55)');
        g.addColorStop(1, 'rgba(6,10,20,0.9)');
        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      if (this.fieldStealth) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(this.time * 4) * 0.15;
        ctx.fillStyle = '#a8e0a0';
        ctx.font = '600 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('隐匿', sx, sy - 78 * z);
        ctx.restore();
      }
    }
  });

  DG.scenes.dungeon.FIELDS = FIELDS;
})();


;
/* ==== js/scenes/dungeon/blood.js ==== */
/* 副本战斗 · 血迹层：按受伤阶段在怪物脚下留下贴地血迹，永久压在实体之下 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  // 三组血迹序列：进入副本时随机一组，同一张地图内保持同一种美术风格
  // 0 溅血：轻薄主斑 + 大量飞溅小点
  // 1 血斑：深色厚团，边缘多瓣，极少飞溅
  // 2 血痕：带拖尾与细长血丝，偏玫瑰色
  const STYLES = [
    { main: '#6e2223', core: '#4f1618', light: '#873634', droplets: 8, seed: 11 },
    { main: '#521214', core: '#3a0c0e', light: '#6b1f1f', droplets: 3, seed: 23 },
    { main: '#73302e', core: '#571e20', light: '#8c4c47', droplets: 6, seed: 37 }
  ];

  // 4 个伤重阶段对应的地面半径（世界像素）
  const STAGE_R = [0, 14, 24, 36, 50];
  const LIFE = 2.0;         // 完整显示 2 秒
  const FADE = 0.8;         // 之后 0.8 秒渐隐
  const MAX = 96;           // 同屏血迹上限，超出丢弃最旧的

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // 确定性随机：同一组精灵每次烘焙完全一致
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  // 不规则闭合血团
  function blobPath(g, r, wob, n, rnd) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 - wob + rnd() * wob * 2);
      pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    }
    const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const first = mid(pts[n - 1], pts[0]);
    g.beginPath();
    g.moveTo(first.x, first.y);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const m = mid(p, q);
      g.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
    g.closePath();
  }
  // 预烘焙一块血迹精灵：只做一次，运行时只 drawImage
  function makeSprite(def, stage, variant) {
    const R = STAGE_R[stage];
    const size = Math.ceil(R * 3.7);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const half = size / 2;
    g.translate(half, half);
    g.scale(1, 0.62);           // 地面透视压扁
    const rnd = rng(def.seed * 977 + stage * 5171 + variant * 7919);

    // 边缘软晕：让血迹融进地面，而不是像贴纸
    const halo = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.35);
    halo.addColorStop(0, hexA(def.main, 0.18));
    halo.addColorStop(1, hexA(def.main, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, R * 1.35, 0, Math.PI * 2);
    g.fill();

    if (def.seed === 37) {
      // 血痕组：一条拉长的血带 + 细血丝，方向随机
      g.save();
      g.rotate(rnd() * Math.PI * 2);
      g.fillStyle = def.main;
      g.beginPath();
      g.moveTo(-R * 0.28, -R * 0.20);
      g.quadraticCurveTo(R * 0.55, -R * 0.34, R * 1.05, -R * 0.02);
      g.quadraticCurveTo(R * 0.62, R * 0.22, -R * 0.22, R * 0.18);
      g.closePath();
      g.fill();
      // 拖尾血丝
      g.strokeStyle = hexA(def.main, 0.85);
      g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const y0 = (rnd() - 0.5) * R * 0.5;
        g.lineWidth = R * (0.05 + rnd() * 0.05);
        g.beginPath();
        g.moveTo(R * 0.35, y0);
        g.quadraticCurveTo(R * 1.0, y0 + (rnd() - 0.5) * R * 0.4,
          R * (1.25 + rnd() * 0.35), y0 + (rnd() - 0.5) * R * 0.55);
        g.stroke();
      }
      g.restore();
    } else {
      // 主血团：血斑组更厚实、边缘更碎
      const thick = def.seed === 23;
      blobPath(g, R * (thick ? 0.82 : 0.70), thick ? 0.30 : 0.22,
        thick ? 14 : 11, rnd);
      g.fillStyle = def.main;
      g.fill();
      // 局部加深：受光不均的淤积感
      g.globalAlpha = 0.55;
      blobPath(g, R * (thick ? 0.52 : 0.44), 0.34, 9, rnd);
      g.fillStyle = def.core;
      g.fill();
      g.globalAlpha = 1;
      // 边缘挑一点亮色，暗地上更容易读出血迹轮廓
      g.strokeStyle = hexA(def.light, 0.13);
      g.lineWidth = Math.max(1, R * 0.05);
      g.stroke();
    }

    // 飞溅小点：距离越远越小，血痕组沿拖尾方向聚拢
    const count = def.droplets + (stage - 1);
    const bias = def.seed === 37 ? rnd() * Math.PI * 2 : null;
    for (let i = 0; i < count; i++) {
      const a = bias == null ? rnd() * Math.PI * 2 : bias + (rnd() - 0.5) * 1.1;
      const dist = R * (1.02 + rnd() * 0.72);
      const rr = R * (0.045 + rnd() * 0.10);
      const x = Math.cos(a) * dist;
      const y = Math.sin(a) * dist;
      g.fillStyle = hexA(i % 3 === 0 ? def.light : def.main, 0.9);
      g.beginPath();
      g.ellipse(x, y, rr, rr * (0.7 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
      g.fill();
      // 靠近主斑的大血滴拉出小尾巴
      if (i < 2 && rr > R * 0.09) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - Math.cos(a) * rr * 2.2, y - Math.sin(a) * rr * 2.2);
        g.lineWidth = rr * 0.8;
        g.strokeStyle = hexA(def.main, 0.8);
        g.stroke();
      }
    }
    return c;
  }

  // 血迹精灵只取决于画风：跨副本共享，重复进图时不再重新烘焙 8 张画布
  const SPRITE_CACHE = [];
  function bloodSprites(style) {
    let arr = SPRITE_CACHE[style];
    if (arr) return arr;
    arr = [];
    const def = STYLES[style];
    for (let st = 1; st <= 4; st++) {
      for (let va = 0; va < 2; va++) {
        arr[st * 2 + va] = makeSprite(def, st, va);
      }
    }
    SPRITE_CACHE[style] = arr;
    return arr;
  }

  Object.assign(DG.scenes.dungeon.prototype, {
    // 进入副本时确定本图的血迹序列，并取用预烘焙好的精灵
    initBlood() {
      this.bloodStyle = U.randInt(0, 2);
      this.blood = [];
      this._bloodSprites = bloodSprites(this.bloodStyle);
    },
    // 受击飞溅：血珠从受击点沿攻击反方向抛出，带重力，落地前消散。
    // 数量、速度、粒径随伤害占比与暴击提升，与脚下血痕同一套配色
    sprayBlood(m, dmg, crit) {
      if (!m || this.finished || !this.blood) return;
      const def = STYLES[this.bloodStyle];
      const ratio = U.clamp(dmg / m.maxHp, 0.02, 0.6);
      const stage = Math.min(4, 1 + Math.floor(ratio * 4));
      const dir = U.angle(this.player, m);   // 由玩家指向怪物，血向怪物外侧溅
      const n = 3 + stage * 2 + (crit ? 3 : 0) + (m.boss ? 3 : (m.elite ? 1 : 0));
      const px = m.x, py = m.y - m.r * 0.75;
      for (let i = 0; i < n; i++) {
        const a = dir + U.rand(-0.95, 0.95);
        const sp = U.rand(110, 290) * (0.82 + stage * 0.1);
        // 前几滴是大血珠，后段是细碎飞沫
        const big = i < 3 ? 1.65 : 1;
        this.effects.push({
          kind: 'blood',
          x: px + U.rand(-5, 5),
          y: py + U.rand(-7, 7),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - U.rand(30, 110),
          r: (U.rand(1.5, 2.7) + (stage - 1) * 0.42) * big,
          color: i % 3 === 0 ? def.light : def.main,
          life: U.rand(0.28, 0.5),
          max: 0.5
        });
      }
    },
    // 劈砍专属：沿刀锋切向甩出一片横向血幕，比普通受击喷溅更厚更远。
    // 与 sprayBlood 各自独立发射，致死时也会和死亡迸血同时出现
    slashBlood(m, angle, dmg, crit) {
      if (!m || this.finished || !this.blood) return;
      const def = STYLES[this.bloodStyle];
      const ratio = U.clamp(dmg / m.maxHp, 0.05, 0.75);
      const stage = Math.min(4, 1 + Math.floor(ratio * 4));
      const base = (typeof angle === 'number') ? angle : U.angle(this.player, m);
      // 血沿刃口两侧甩出：以刀锋切向为主轴铺开，读起来像被劈开的口子
      const side = Math.random() < 0.5 ? 1 : -1;
      const axis = base + side * (Math.PI / 2);
      const n = 7 + stage * 3 + (crit ? 4 : 0) + (m.boss ? 4 : (m.elite ? 2 : 0));
      const px = m.x, py = m.y - m.r * 0.55;
      for (let i = 0; i < n; i++) {
        const spread = (i / (n - 1 || 1) - 0.5) * 2;   // -1..1 均匀铺满扇形
        const a = axis + spread * 1.0;
        const sp = U.rand(150, 380) * (0.85 + stage * 0.09);
        this.effects.push({
          kind: 'blood',
          x: px + Math.cos(a) * m.r * 0.35,
          y: py + Math.sin(a) * m.r * 0.35,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - U.rand(20, 90),
          r: U.rand(2.0, 3.4) + (stage - 1) * 0.45,
          color: i % 3 === 0 ? def.light : def.main,
          life: U.rand(0.30, 0.55),
          max: 0.55
        });
      }
      // 少量慢速重血珠：大颗、下落更沉，补足“血会掉到地上”的重量感
      const heavy = 2 + stage;
      for (let i = 0; i < heavy; i++) {
        const a = axis + U.rand(-0.7, 0.7);
        this.effects.push({
          kind: 'blood',
          x: px + U.rand(-m.r * 0.4, m.r * 0.4),
          y: py + U.rand(-m.r * 0.4, m.r * 0.4),
          vx: Math.cos(a) * U.rand(50, 130),
          vy: Math.sin(a) * U.rand(30, 80) - 20,
          r: U.rand(3.0, 4.4),
          color: i === 0 ? def.light : def.main,
          life: U.rand(0.5, 0.75),
          max: 0.75
        });
      }
    },
    // 出血状态：中刀后一段时间从伤口持续滴血，纯表现，不结算伤害
    bleedTick(m, dt) {
      if (!m.bleedT || m.bleedT <= 0 || !this.blood) return;
      m.bleedT -= dt;
      m.bleedAcc = (m.bleedAcc || 0) + dt;
      if (m.bleedAcc < 0.14) return;
      m.bleedAcc = 0;
      const def = STYLES[this.bloodStyle];
      const k = Math.max(0.12, m.bleedT / 1.4);
      const x = m.x + U.rand(-m.r * 0.5, m.r * 0.5);
      const y = m.y - m.r * 0.5;
      const n = m.bleedT > 0.7 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        this.effects.push({
          kind: 'blood',
          x: x + U.rand(-3, 3), y,
          vx: U.rand(-32, 32),
          vy: U.rand(-26, 24),
          r: U.rand(1.2, 2.2) * (0.7 + k * 0.5),
          color: i === 0 ? def.light : def.main,
          life: U.rand(0.30, 0.50),
          max: 0.50
        });
      }
    },
    // 受伤时在怪物脚下留血迹：阶段随伤势提升，只有变大时才换新块
    addBlood(m) {
      if (!m || this.finished || !this.blood) return;
      const ratio = 1 - m.hp / m.maxHp;
      if (ratio <= 0) return;
      const stage = Math.min(4, 1 + Math.floor(ratio * 4));
      const last = m.bloodStage || 0;
      // 同一档位不重复铺新块，1.1 秒后会让旧块重新显影
      if (stage <= last && this.time - (m.bloodT || -99) < 1.1) return;
      m.bloodStage = Math.max(stage, last);
      m.bloodT = this.time;

      const sc = U.clamp(m.r / 16, 0.85, 2.2);
      const r = STAGE_R[stage] * sc;
      const x = m.x;
      const y = m.y + m.r * 0.6;      // 落在脚下，始终在怪物下层
      // 成堆合并：附近已有血迹时只保留最大的一块，绝不叠出一怪一块
      let best = null, bestD = Infinity;
      for (const d of this.blood) {
        const dd = U.dist(d, { x, y });
        if (dd < Math.max(28, (d.r + r) * 0.62) && dd < bestD) {
          bestD = dd;
          best = d;
        }
      }
      if (best) {
        best.age = 0;
        const bigger = stage * 1000 + sc * 10 >= best.stage * 1000 + best.sc * 10;
        if (bigger) {
          best.x = x;
          best.y = y;
          best.r = r;
          best.sc = sc;
          best.stage = stage;
          best.variant = U.randInt(0, 1);
          best.rot = U.rand(-0.22, 0.22);
        }
        return;
      }
      this.blood.push({
        x, y, r, sc, stage,
        variant: U.randInt(0, 1),
        rot: U.rand(-0.25, 0.25),
        age: 0
      });
      if (this.blood.length > MAX) this.blood.shift();
    },
    updateBlood(dt) {
      const list = this.blood;
      if (!list) return;
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].age += dt;
        if (list[i].age > LIFE + FADE) list.splice(i, 1);
      }
    },
    // 绘制顺序固定在地面之后、掉落与实体之前，所有怪物永远盖在血迹上
    drawBlood(ctx) {
      const list = this.blood;
      if (!list || !list.length || !this._bloodSprites) return;
      const v = this.viewRect(120);
      for (const b of list) {
        if (b.x < v.l || b.x > v.r || b.y < v.t || b.y > v.b) continue;
        const sp = this._bloodSprites[b.stage * 2 + b.variant];
        if (!sp) continue;
        let a = 0.78;
        if (b.age > LIFE) {
          a *= 1 - (b.age - LIFE) / FADE;
          if (a <= 0.01) continue;
        }
        const half = b.r * 1.85;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.drawImage(sp, -half, -half, half * 2, half * 2);
        ctx.restore();
      }
    }
  });
})();


;
/* ==== js/scenes/dungeon/bones.js ==== */
/* 副本战斗 · 死亡骨头：怪物爆炸后骨头四散、旋转、落地反弹，静止 1 秒后淡出 */
(function () {
  const DG = window.DG;
  const U = DG.util;

  const MAX_BONES = 180;
  const GRAV = 1500;      // 离地高度方向的重力
  const REST = 0.42;      // 落地反弹系数
  const REST_TIME = 1.0;  // 停稳后停留时间
  const FADE_TIME = 0.5;  // 淡出时长

  Object.assign(DG.scenes.dungeon.prototype, {
    // 死亡爆炸：骨色尘环 + 碎屑 + 4~12 根旋转四散的骨头
    spawnBoneBurst(m) {
      const art = DG.art && DG.art.bones;
      if (!art || !this.bones) return;
      if (!art.started) art.load();
      if (!art.ready || !art.list.length) return;
      const n = m.boss ? U.randInt(12, 15) : (m.elite ? U.randInt(8, 10) : U.randInt(6, 8));
      this.addRing(m.x, m.y, 6, m.r * 3.2, '#cfc0a0', 0.3);
      this.addBurst(m.x, m.y - m.r * 0.3, '#cfc0a0', m.boss ? 14 : 8);

      const list = art.list;
      for (let i = 0; i < n; i++) {
        // 大件概率低、小骨碎屑多，散落更自然
        const sp = U.chance(0.35)
          ? list[U.randInt(0, Math.min(3, list.length - 1))]
          : U.pick(list);
        const a = U.rand(0, Math.PI * 2);
        const spd = U.rand(90, 260);
        // 统一按怪物大小缩放：大骨仍然更大，小碎骨保持细碎
        const scale = U.clamp(m.r / 26, 0.5, 1.15) * U.rand(0.85, 1.12);
        this.bones.push({
          img: sp.img,
          w: sp.w, h: sp.h, scale,
          x: m.x, y: m.y + U.rand(-4, 10),
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd * 0.62,
          z: m.r * 0.45 + U.rand(2, 10),
          vz: U.rand(170, 400),
          rot: U.rand(0, Math.PI * 2),
          spin: U.rand(-12, 12),
          alpha: 1,
          grounded: false,
          bounces: 0,
          rest: 0,
          dead: false
        });
      }
      if (this.bones.length > MAX_BONES) {
        this.bones.splice(0, this.bones.length - MAX_BONES);
      }
    },
    updateBones(dt) {
      const list = this.bones;
      if (!list || !list.length) return;
      const keep = [];
      for (const b of list) {
        if (b.rest > 0) {
          // 停稳：1 秒后开始淡出
          b.spin *= 0.86;
          b.rot += b.spin * dt;
          b.rest += dt;
          if (b.rest > REST_TIME) {
            b.alpha -= dt / FADE_TIME;
            if (b.alpha <= 0) continue;
          }
          keep.push(b);
          continue;
        }
        b.rot += b.spin * dt;
        if (!b.grounded) {
          // 飞行：水平滑行 + 离地高度受重力
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += b.vz * dt;
          b.vz -= GRAV * dt;
          b.vx *= 1 - 0.8 * dt;
          b.vy *= 1 - 0.8 * dt;
          if (b.z <= 0) {
            b.z = 0;
            if (b.bounces < 2 && b.vz < -70) {
              // 落地反弹：弹起变低、转速与横速衰减
              b.bounces++;
              b.vz = -b.vz * REST;
              b.vx *= 0.55;
              b.vy *= 0.55;
              b.spin *= 0.58;
            } else {
              b.grounded = true;
              b.vz = 0;
            }
          }
        } else {
          // 贴地滑行：摩擦到停住再进入停留计时
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vx *= 1 - 6 * dt;
          b.vy *= 1 - 6 * dt;
          b.spin *= 1 - 7 * dt;
          if (Math.hypot(b.vx, b.vy) < 16) {
            b.vx = 0;
            b.vy = 0;
            b.rest = 0.0001;
          }
        }
        keep.push(b);
      }
      if (keep.length !== list.length) this.bones = keep;
    },
    // 统一画在血迹层之上、所有实体之下：飞行中的骨头也不会遮挡怪物
    drawBones(ctx) {
      const list = this.bones;
      if (!list || !list.length) return;
      const v = this.viewRect(90);
      for (const b of list) {
        if (b.x < v.l || b.x > v.r || b.y < v.t || b.y > v.b) continue;
        const w = b.w * b.scale, h = b.h * b.scale;
        ctx.save();
        ctx.globalAlpha = Math.max(0, b.alpha) * 0.96;
        ctx.translate(b.x, b.y - b.z);
        ctx.rotate(b.rot);
        ctx.drawImage(b.img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
  });
})();


;
/* ==== js/scenes/dungeon/combat.js ==== */
/* 副本战斗 · 战斗层：伤害结算、怪物 AI 与投射物 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  // 怪物分离网格：常量与邻居偏移表放在模块级，主循环里不再每帧新建
  const SEP_CELL = 112;
  const SEP_BIAS = 1024;
  const SEP_STRIDE = 4096;
  const SEP_NEAR = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 1]];

  // 分离两个重叠怪物：抽到模块级，避免每帧生成闭包
  function separateMonsters(self, a, b, ai, bi) {
    if (a.dead || b.dead) return;
    let dx = b.x - a.x, dy = b.y - a.y;
    const minD = a.r + b.r + 10;
    if (Math.abs(dx) >= minD || Math.abs(dy) >= minD) return;
    let dist = Math.hypot(dx, dy);
    if (dist < 0.01) {
      const angle = ((ai * 17 + bi * 31) % 16) * Math.PI / 8;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      dist = 1;
    }
    if (dist >= minD) return;
    const gap = minD - dist;
    const ux = dx / dist, uy = dy / dist;
    if (a.boss && !b.boss) self.nudgeMonster(b, ux * gap, uy * gap);
    else if (b.boss && !a.boss) self.nudgeMonster(a, -ux * gap, -uy * gap);
    else if (!a.boss && !b.boss) {
      self.nudgeMonster(a, -ux * gap * 0.5, -uy * gap * 0.5);
      self.nudgeMonster(b, ux * gap * 0.5, uy * gap * 0.5);
    }
  }

  // 换色变体的专属出手特效（其余怪继续用 peaArc）
  const STRIKE_FX = {
    frostwolf: 'frostSlash',
    boneknight: 'soulSlash',
    frostslime: 'frostBurst',
    bat: 'bloodArc',
    beetle: 'shellSlam',
    urchin: 'shellSlam',
    bulwark: 'shellSlam',
    foxraider: 'bloodArc',
    venomlisk: 'soulSlash'
  };

  // 小怪近战模组：统一走「前摇 → 出手 → 收招」三段式，只靠参数区分手感。
  // 这样新增招式不增加每帧开销：突进只在出手瞬间算一次，特效统一走 effects 池。
  // lunge=突进距离 / hop=起跳高度 / arc=命中扇形 / reach=攻击距离倍率
  const MELEE_MOVES = {
    // 抓：前摇偏长，贴身后把玩家拽向自己
    grab:   { windup: 1.05, strike: 0.20, recover: 0.34, lunge: 34,  hop: 0,  arc: 0.9,  reach: 1.05, fx: 'grabArc',   fxScale: 2.6, fxLife: 0.34, pull: 30 },
    // 挠：快出快收，短突进 + 三道爪痕
    claw:   { windup: 0.72, strike: 0.16, recover: 0.26, lunge: 38,  hop: 0,  arc: 1.45, reach: 1.10, fx: 'clawArc',   fxScale: 2.8, fxLife: 0.30 },
    // 扑：起跳前冲，落点带冲击
    pounce: { windup: 1.00, strike: 0.24, recover: 0.38, lunge: 96,  hop: 30, arc: 1.25, reach: 1.15, fx: 'pounceArc', fxScale: 2.8, fxLife: 0.36, shake: 0.12 },
    // 撞：前摇最长，直线冲撞并击退玩家
    charge: { windup: 1.35, strike: 0.26, recover: 0.46, lunge: 124, hop: 0,  arc: 1.0,  reach: 1.10, fx: 'chargeArc', fxScale: 2.9, fxLife: 0.36, knock: 34, shake: 0.24 },
    // 刀光：原地挥砍，弧线最宽
    slash:  { windup: 1.00, strike: 0.18, recover: 0.30, lunge: 26,  hop: 0,  arc: 1.9,  reach: 1.15, fx: 'bladeArc',  fxScale: 2.9, fxLife: 0.38 },
    // 横扫：大幅侧身抡扫，覆盖身体两侧
    sweep:  { windup: 0.94, strike: 0.20, recover: 0.34, lunge: 30,  hop: 0,  arc: 2.6,  reach: 1.14, fx: 'sweepArc',  fxScale: 3.2, fxLife: 0.36, knock: 12 },
    // 连击：两段爪击，第一段轻、第二段补刀
    rend:   { windup: 0.62, strike: 0.34, recover: 0.30, lunge: 44,  hop: 0,  arc: 1.5,  reach: 1.08, fx: 'rendArc',   fxScale: 2.7, fxLife: 0.24, double: 0.45, dmg2: 0.55 },
    // 突刺：极窄角度长距离穿刺，专治正面站桩
    impale: { windup: 0.86, strike: 0.16, recover: 0.32, lunge: 76,  hop: 0,  arc: 0.34, reach: 1.45, fx: 'thrustArc', fxScale: 3.4, fxLife: 0.30 },
    // 旋斩：原地转体一周，命中四周
    spin:   { windup: 1.06, strike: 0.28, recover: 0.40, lunge: 22,  hop: 0,  arc: Math.PI * 2, reach: 1.02, fx: 'spinArc', fxScale: 3.1, fxLife: 0.42, uniqueFx: true },
    // 震地：砸地冲击波，贴身范围伤害并震屏
    slam:   { windup: 1.14, strike: 0.22, recover: 0.44, lunge: 14,  hop: 0,  arc: Math.PI * 2, reach: 0.92, fx: 'slamShock', fxScale: 3.3, fxLife: 0.5, uniqueFx: true, shock: true, knock: 18, shake: 0.16 }
  };

  // 各小怪按自身特色选招：支持单招或双招轮换，避免同一种小怪永远只做同一个动作
  // 狼/史莱姆扑咬，骷髅/镰手/医师挥砍与横扫，蝠/狐/鳍/蜥抓挠与突刺，
  // 甲虫/刺球/野猪/豌豆冲撞与震地，木乃伊与噬人蠕虫抓拽
  const MELEE_STYLE = {
    wolf: ['pounce', 'rend'], frostwolf: ['pounce', 'rend'],
    slime: ['pounce', 'slam'], frostslime: ['pounce', 'slam'],
    skeleton: ['slash', 'sweep'], boneknight: ['slash', 'sweep'], pumpkin: ['sweep', 'slash'],
    mummy: ['grab', 'sweep'], cowlbandit: ['slash', 'impale'], plaguedoc: ['slash', 'impale'],
    bat: ['claw', 'rend'], foxraider: ['claw', 'impale'], deepfin: ['claw', 'impale'],
    venomlisk: ['claw', 'impale'], angler: 'claw',
    pea: ['charge', 'slam'], beetle: ['charge', 'slam'], urchin: ['spin', 'slam'],
    fleece: ['charge', 'claw'], bulwark: ['charge', 'slam'],
    mawflower: ['grab', 'sweep']
  };

  // 专属特效皮肤：每种小怪在共用招式之上再叠一层自身主题碎屑/元素，
  // 绘制全部是纯色小图形（无渐变、无 shadowBlur），开销与一个 spark 相当。
  // bits=碎屑形态 / n=数量 / cast=远程读条时是否有聚能法阵
  const FX_SKINS = {
    wolf:        { bits: 'blood', n: 10, color: '#e0606a' },
    frostwolf:   { bits: 'ice', n: 9 },
    skeleton:    { bits: 'bone', n: 8 },
    boneknight:  { bits: 'soul', n: 9 },
    mistwalker:  { bits: 'mist', n: 8, cast: true },
    pea:         { bits: 'spore', n: 9 },
    musketeer:   { bits: 'muzzle', n: 8, cast: true },
    pumpkin:     { bits: 'ember', n: 10 },
    slime:       { bits: 'mucus', n: 9 },
    frostslime:  { bits: 'ice', n: 10 },
    mummy:       { bits: 'bone', n: 9 },
    bat:         { bits: 'blood', n: 8 },
    hornet:      { bits: 'needle', n: 8, cast: true },
    beetle:      { bits: 'shell', n: 9 },
    cinderraven: { bits: 'ash', n: 8, cast: true },
    candle:      { bits: 'flame', n: 8, cast: true },
    urchin:      { bits: 'spike', n: 10 },
    deepfin:     { bits: 'water', n: 9 },
    cowlbandit:  { bits: 'afterimage', n: 6 },
    angler:      { bits: 'lantern', n: 6, cast: true },
    fleece:      { bits: 'wool', n: 8 },
    foxraider:   { bits: 'afterimage', n: 6 },
    emberdrake:  { bits: 'flame', n: 9, cast: true },
    venomlisk:   { bits: 'toxin', n: 9 },
    bulwark:     { bits: 'shell', n: 9 },
    mawflower:   { bits: 'petal', n: 9 },
    plaguedoc:   { bits: 'toxin', n: 8 },
    warlock:     { bits: 'shadow', n: 8, color: '#b28bff', cast: true }
  };



  Object.assign(DG.scenes.dungeon.prototype, {
  nearestMonster(maxDist) {
    let best = null;
    let bestD = maxDist || Infinity;
    for (const m of this.monsters) {
      if (m.dead) continue;
      const d = U.dist(this.player, m);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  },
  rollHit(mult, sk, target) {
    const tm = this.talentMods();
    let chance = this.stats.crit;
    if (target && target.slow > 0) chance += tm.stats.slowedCrit || 0;
    if (this.talentTimers.chargeCrit > 0) chance += 15;
    const crit = Math.random() * 100 < Math.min(75, chance);
    let dmg = this.stats.atk * mult * (crit ? this.stats.critDmg / 100 : 1);
    let bonus = tm.stats.damagePct || 0;
    if (tm.flags.bloodRage && this.player.hp / this.player.maxHp < 0.4) bonus += 35;
    if (sk) {
      DG.talents.skillTags(sk.id).forEach(tag => { bonus += tm.tags[tag] || 0; });
      // 技能树与流派词缀：该技能专属的伤害加成
      const mod = tm.skills && tm.skills[sk.id];
      if (mod && mod.dmgPct) bonus += mod.dmgPct;
    }
    dmg *= 1 + bonus / 100;
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  },
  hitMonster(m, dmg, crit, opts) {
    const quiet = !!(opts && opts.quiet);
    if (m.dead) return;
    const tm = this.talentMods();
    let executed = false;

    // 处决：普通敌人残血直接抹除；首领改为承受额外 30% 伤害
    if (tm.flags.execute) {
      if (m.boss) {
        dmg *= 1.3;
      } else if (m.hp / m.maxHp < 0.15) {
        dmg = Math.ceil(m.hp);
        executed = true;
      }
    }
    if (m.boss && tm.stats.bossDmgPct) dmg *= 1 + tm.stats.bossDmgPct / 100;
    if (m.hp / m.maxHp > 0.7 && tm.stats.highHpDmgPct) dmg *= 1 + tm.stats.highHpDmgPct / 100;
    if (m.slow > 0 && tm.stats.slowedDmgPct) dmg *= 1 + tm.stats.slowedDmgPct / 100;
    // 草丛伏击：隐匿状态下打出的第一击额外 80%，随后暴露
    let ambush = false;
    if (this.fieldStealth && !m.boss && !m.aggro) {
      dmg *= 1.8;
      ambush = true;
      this.fieldStealth = false;
      this.fieldReveal = 2.4;
    }
    dmg = Math.max(1, Math.round(dmg));

    // 精英护盾：先吸收伤害，破盾时留一圈碎光
    if (m.shield > 0) {
      const absorb = Math.min(m.shield, dmg);
      m.shield -= absorb;
      dmg -= absorb;
      if (!quiet) this.addFloater(m.x + U.rand(-6, 6), m.y - m.r - 34, `护盾 ${absorb}`, '#7fd0c0', 18);
      if (m.shield <= 0) {
        m.shield = 0;
        this.addRing(m.x, m.y, m.r, m.r * 3, '#7fd0c0', 0.4);
      }
      if (dmg <= 0) {
        m.hitT = 2.2;
        return;
      }
    }

    m.hp -= dmg;
    // 被击中才亮血条：持续命中会不断续时，停手后 2.2 秒自动隐藏
    m.hitT = 2.2;
    // 精英荆棘：按实际伤害的 18% 反弹，无需命中判定
    if (!quiet && m.affixes && m.affixes.indexOf('thorn') >= 0) {
      const back = Math.max(1, Math.round(dmg * 0.18));
      if (this.hurtPlayer(back)) {
        this.addFloater(this.player.x, this.player.y - 52, `荆棘 -${back}`, '#c98b5a', 17);
      }
    }
    if (!quiet) {
      m.flash = 0.13;
      // 血迹：按累计伤势分档铺在脚下，成堆怪物只保留最大一块
      this.addBlood(m);
      // 受击飞溅：血珠按伤害量向外抛散
      this.sprayBlood(m, dmg, crit);
      // 劈砍专属：沿刀锋切向再甩出一道血幕，与上面的受击喷溅叠加
      if (opts && opts.chop) this.slashBlood(m, opts.angle, dmg, crit);
      // 首领受击：额外的姿态回弹与冲击特效（火花 / 斩痕 / 冲击环）
      if (m.boss) this.bossHitReact(m, dmg, crit, opts);
      if (DG.audio) {
        DG.audio.play('barbHit', { vol: crit ? 0.85 : 0.6, rate: 0.94 + Math.random() * 0.12, gap: 0.05 });
      }
      this.addFloater(m.x + U.rand(-6, 6), m.y - m.r - 20,
        executed ? '处决' : (crit ? '暴击 ' : '') + U.fmt(dmg),
        executed ? '#ff7a5c' : (crit ? '#ffca6a' : '#f2ead9'), crit ? 30 : 21);
      if (ambush) this.addFloater(m.x, m.y - m.r - 46, '伏击', '#a8e0a0', 22);
    }
    // 严寒：命中时有概率把怪物冻住一小段
    if (this.wxRule && this.wxRule.chill && !m.boss && U.chance(this.wxRule.chill)) {
      m.slow = Math.max(m.slow || 0, 0.9);
      m.slowFactor = Math.max(m.slowFactor || 0.3, 0.35);
    }
    if (executed) {
      // 处决：命中方向划出赤红斩痕，配合收缩光环
      this.effects.push({
        kind: 'slash', x: m.x, y: m.y, angle: U.angle(this.player, m),
        radius: m.r + 16, arc: 2.1, color: '#ff8a6a', life: 0.2, max: 0.2
      });
      this.addRing(m.x, m.y, m.r * 2, 6, '#ffb08a', 0.26);
    }
    if (m.hp <= 0) {
      m.hp = 0;
      m.dead = true;
      this.onMonsterDeath(m);
    } else if (opts && opts.chop) {
      // 未致死的中刀目标进入短时出血状态，在后续帧持续滴血
      m.bleedT = 1.4;
      m.bleedAcc = 0;
    }
  },
  hurtPlayer(raw) {
    if (this.player.invuln > 0 || this.finished || this.ending) return false;
    if (this.player.hp <= 0) return false;
    const tm = this.talentMods();
    const timers = this.talentTimers;

    // 连续受击判定：3 秒内再次被击中，削弱受击反馈并取消受击位移
    const chain = (this.player.hurtChainT > 0) ? (this.player.hurtChain || 0) + 1 : 1;
    const weakHurt = chain >= 2;
    this.player.hurtChain = chain;
    this.player.hurtChainT = 3;
    this.player.hurtWeak = weakHurt;

    let incoming = raw;
    if (timers.voidGuard > 0) incoming *= 0.75;
    let armor = this.stats.armor;
    if (tm.flags.fortify && timers.fortify > 0) armor *= 1.2;

    const taken = Math.max(1, Math.round(incoming * 100 / (100 + armor)));
    this.player.hp -= taken;
    if (tm.flags.fortify) timers.fortify = 2;
    if (tm.flags.postHurtMove) timers.postHurt = 2;
    // 连续受击时红闪、震屏与音效一并减弱，避免密集受击的反馈过载
    this.hurtFlash = weakHurt ? Math.max(0.06, Math.min(this.hurtFlash, 0.1))
      : Math.max(this.hurtFlash, 0.3);
    this.shake = Math.max(this.shake, weakHurt ? 0.06 : 0.18);
    if (DG.audio) {
      DG.audio.play(this.cls && this.cls.id === 'ranger' ? 'rangerBehit' : 'barbBehit',
        { vol: weakHurt ? 0.4 : 0.7, gap: 0.15 });
    }
    this.addFloater(this.player.x, this.player.y - 34, '-' + taken, '#ff8a80', 22);

    // 受击硬直 + 后退：朝背离伤害来源的方向弹开一小段
    // 旋风期间不可阻挡：不吃硬直、不被击退，移动不受影响
    if (!this.whirl) {
      if (weakHurt) {
        // 连续受击：取消击退位移，只保留极短的轻微后仰动作
        this.player.kbX = 0;
        this.player.kbY = 0;
        this.player.hurtT = 0.10;
      } else {
        let src = null, near = Infinity;
        for (const m of (this.monsters || [])) {
          if (m.dead) continue;
          const d = U.dist(m, this.player);
          if (d < near) { near = d; src = m; }
        }
        const back = src
          ? Math.atan2(this.player.y - src.y, this.player.x - src.x)
          : this.player.facing + Math.PI;
        this.player.hurtT = 0.30;
        this.player.kbX = Math.cos(back) * 230;
        this.player.kbY = Math.sin(back) * 230;
      }
    }
    // 硬直期间给一点无敌帧，避免被连击锁死
    this.player.invuln = Math.max(this.player.invuln, 0.28);

    // 不屈：致命伤害被免疫，并回复 25% 最大生命
    if (this.player.hp <= 0 && tm.flags.unyielding && timers.unyieldingCd <= 0) {
      this.player.hp = Math.round(this.player.maxHp * 0.25);
      timers.unyieldingCd = 60;
      this.player.invuln = Math.max(this.player.invuln, 0.8);
      this.addRing(this.player.x, this.player.y, 16, 80, '#ffd479', 0.5);
      this.addFloater(this.player.x, this.player.y - 44, '不屈', '#ffd479', 26);
    }

    // 自动战斗保险：濒死时触发「绝境反击」，回血并获得短暂无敌，
    // 避免自动战斗因为一次走位失误直接判负（手动操作不生效）
    if (this.player.hp <= 0 && this.autoMode && (this.autoRescueCd || 0) <= 0) {
      this.player.hp = Math.round(this.player.maxHp * 0.35);
      this.player.invuln = Math.max(this.player.invuln, 2);
      this.autoRescueCd = 30;
      this.talentTimers.postHurt = Math.max(this.talentTimers.postHurt || 0, 2);
      this.addRing(this.player.x, this.player.y, 18, 104, '#ffd479', 0.6);
      this.addBurst(this.player.x, this.player.y, '#ffd479', 16);
      this.addFloater(this.player.x, this.player.y - 46, '绝境反击', '#ffd479', 26);
      this.announce('自动战斗 · 绝境反击', 1400);
    }

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.onPlayerDeath();
      return true;
    }

    // 虚化：生命低于 30% 时自动脱离
    if (tm.flags.voidShift && this.player.hp / this.player.maxHp < 0.3 && timers.voidCd <= 0) {
      this.voidShift();
    }
    return true;
  },
  onPlayerDeath() {
    if (this.ending) return;
    this.defeat = true;
    this.victory = false;
    this.ending = true;
    this.finishTimer = 1.6;
    this.announce('你倒下了……', 1800);
    this.addBurst(this.player.x, this.player.y, '#c6554e', 18);
  },
  // 战斗内实时结算经验：击杀即入账，经验条满立刻升级，不再等副本结算
  gainXp(amount) {
    if (!amount || amount <= 0) return;
    this.xpEarned += amount;
    const levels = DG.character.addXp(this.char, amount);
    if (levels && levels.length) this.onLevelUp(levels);
  },
  // 升级表现：金色光环 + 上升光尘 + LV 飘字 + 顶部公告 + 等级牌弹跳 + 音效
  onLevelUp(levels) {
    const from = levels[0] - 1;
    const now = levels[levels.length - 1];
    for (const lv of levels) this.levelUps.push(lv);
    const p = this.player;
    // 角色脚下短暂的金色光环
    this.levelFx = 1.1;
    this.addRing(p.x, p.y, 10, 96, '#ffd166', 0.62);
    this.addRing(p.x, p.y, 4, 58, '#fff6d0', 0.44);
    // 上升光尘：从脚边向头顶飘散
    for (let i = 0; i < 24; i++) {
      const a = U.rand(0, Math.PI * 2);
      const rad = U.rand(4, p.r * 2.1);
      this.effects.push({
        kind: 'spark',
        x: p.x + Math.cos(a) * rad,
        y: p.y + Math.sin(a) * rad * 0.5,
        vx: Math.cos(a) * U.rand(6, 26),
        vy: U.rand(-150, -70),
        life: U.rand(0.5, 0.95),
        max: 1,
        r: U.rand(1.6, 3.4),
        color: i % 3 === 0 ? '#fff6d0' : '#ffd166'
      });
    }
    // 飘字：直接显示升到的等级，一次连升多级也显示最终等级
    this.addFloater(p.x, p.y - p.r - 48, `LV.${now}`, '#ffe08a', 30);
    this.addFloater(p.x, p.y - p.r - 20, now > from + 1 ? `等级提升 +${now - from}` : '等级提升', '#ffd166', 20);
    // 升级立刻重算属性并解锁新技能：新技能当帧进入技能栏并参与自动战斗
    const unlocked = this.refreshBuild();
    const unlockText = unlocked.length ? ` · 解锁 ${unlocked.map(sk => sk.name).join(' / ')}` : '';
    this.announce(`等级提升 · Lv.${now}${unlockText}`, unlocked.length ? 2600 : 1900);
    this.syncLevelBadge(now, true);
    if (DG.audio) {
      // 升级号角立刻起，清脆的 UI 升级音稍后叠上，两声错开避免糊在一起
      DG.audio.play('stageLevelup', { vol: 1 });
      setTimeout(() => {
        // 该音频本身峰值只有 0.21，必须给满音量才不会被战斗音压住
        if (!this.finished && DG.audio) DG.audio.play('uiLevelup', { vol: 1 });
      }, 110);
    }
  },
  onMonsterDeath(m) {
    // 分裂词缀：先裂成两个小体，再走结算（小体自身不再分裂、无掉落）
    if (m.affixes && m.affixes.indexOf('split') >= 0) this.splitElite(m);
    if (DG.audio) {
      DG.audio.play('monsterDeath', { vol: m.boss ? 1 : 0.5, rate: 0.9 + Math.random() * 0.15, gap: 0.08 });
      // 首领倒下后战斗音乐回落，避免首领曲一直播到撤离
      if (m.boss) DG.audio.playBgm('battle');
      if (m.gold > 0) DG.audio.play('stageCoin', { vol: 0.32, gap: 0.12 });
    }
    // 分裂出的小体不计击杀、不给经验金币，避免刷资源与提前触发首领
    if (!m.noLoot) {
      this.kills++;
      this.lastKillTime = this.time;
      this.gainXp(m.xp);
      this.goldEarned += m.gold;
      this.updateWaveText();
      // 任务进度：普通击杀 / 精英 / 首领分别计入悬赏
      if (DG.quests && this.char) {
        DG.quests.progress(this.char, 'kill', 1);
        if (m.boss) DG.quests.progress(this.char, 'boss', 1);
        else if (m.elite) DG.quests.progress(this.char, 'elite', 1);
      }
      this.addFloater(m.x, m.y - 28, `+${m.gold} 金币`, '#e3c88e', 20);
    }
    this.addBurst(m.x, m.y, m.color, m.boss ? 26 : 8);
    // 死亡爆炸：骨头四散弹跳
    this.spawnBoneBurst(m);

    // 分件小怪：孢子消散
    if (m.art && DG.art.monsters && DG.art.monsters.has(m.art)) {
      this.effects.push({
        kind: 'peaPuff', x: m.x, y: m.y - m.r * 0.5,
        r0: 6, r1: m.r * 3.1, color: m.fxColor,
        life: 0.5, max: 0.5
      });
      this.addRing(m.x, m.y, 8, m.r * 2.4, m.fxColor, 0.4);
    }

    // 区块清空：怪群已全部激活且该块再无存活怪物
    if (!m.boss && m.chunkIndex != null) {
      const packs = this.chunkPacks.filter(p => p.chunk === m.chunkIndex);
      const alive = this.monsters.some(o => !o.dead && o.chunkIndex === m.chunkIndex);
      const ch = this.chunks[m.chunkIndex];
      if (ch && !ch.cleared && packs.length && packs.every(p => p.spawned) && !alive) {
        ch.cleared = true;
        this.updateWaveText();
      }
    }

    // 天赋：击杀回复与击杀加速
    const tm = this.talentMods();
    if (tm.stats.killHealPct) {
      const heal = Math.round(this.player.maxHp * tm.stats.killHealPct / 100);
      if (heal > 0) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        this.addFloater(this.player.x, this.player.y - 38, `+${heal}`, '#7fd08a', 20);
        // 汲取：回复时脚下浮起绿色生命微光
        this.addBurst(this.player.x, this.player.y - 10, '#7fd08a', 4);
      }
    }
    if (tm.flags.killRush) this.talentTimers.killRush = 3;

    const drop = m.noLoot
      ? { items: [], orb: false, rune: false }
      : DG.loot.roll(m, this.def.ilvl, this.char && this.char.cls);
    // 首领的战利品直接落在玩家脚下，避免结算前来不及拾取
    const bx = m.boss ? this.player.x : m.x;
    const by = m.boss ? this.player.y : m.y;
    // 掉落点吸附到可站立地面，避免掉进墙体
    const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
    const place = (x, y) => this.nearestFloorPoint(
      U.clamp(x, 40, aw - 40), U.clamp(y, 40, ah - 40), 3
    ) || { x: bx, y: by };
    let offset = 0;
    drop.items.forEach(item => {
      const pos = place(bx + U.rand(-24, 24) + (offset++ * 8), by + U.rand(-24, 24));
      this.drops.push({
        kind: 'item', item,
        x: pos.x, y: pos.y,
        r: 12, t: 0
      });
    });
    if (drop.orb) {
      const pos = place(bx + U.rand(-20, 20), by + U.rand(-16, 16));
      this.drops.push({ kind: 'orb', x: pos.x, y: pos.y, r: 10, t: 0 });
    }
    if (drop.rune) {
      const pos = place(bx + U.rand(-20, 20), by + U.rand(-16, 16));
      this.drops.push({ kind: 'rune', x: pos.x, y: pos.y, r: 11, t: 0 });
    }

    if (m.boss) {
      // 通关记录：解锁下一关，并推进悬赏的“通关”类任务
      if (DG.quests && this.char) DG.quests.onStageClear(this.char, this.def.id);
      // 首领倒下的瞬间就落盘，避免结局动画期间刷新或退出丢掉通关进度
      if (DG.game && DG.game.save) DG.game.save();
      this.victory = true;
      this.ending = true;
      this.finishTimer = 1.8;
      this.shake = 0.6;
      this.announce('首领已被击败', 2200);
      this.$bossWrap.classList.add('hidden');
      // 立即解除屏蔽，不让进度/小地图多隐藏 0.1 秒
      this.hud.classList.remove('boss-mode');
    } else if (this.phase === 'wave') {
      // 击杀数达到本图门槛，或怪群已全部刷出且场上再无小怪时兜底触发，
      // 避免刷怪上限截断导致击杀数永远差几只、首领无法出现
      const wiped = (this.chunkPacks || []).every(p => p.spawned) &&
        !this.monsters.some(o => !o.dead && !o.boss);
      if ((this.bossKillGoal && this.kills >= this.bossKillGoal) || wiped) {
        this.phase = 'bossIntro';
        this.phaseTimer = 1.5;
        this.announce('首领即将降临', 1600);
        this.updateWaveText();
      }
    }
  },
  // 分件小怪：攻击前摇 / 出手 / 收招，读条期间原地不动
  isArtMonster(m) {
    return !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
  },
  startMonsterAction(m, ang) {
    const tpl = DG.data.monsters[m.typeId] || {};
    const style = MELEE_STYLE[m.art] || 'claw';
    let mid;
    if (Array.isArray(style)) {
      // 双招小怪轮换出招，避免同一只怪从头到尾只重复一个动作
      mid = style[(Math.random() * style.length) | 0];
      if (style.length > 1 && mid === m._lastMelee) {
        mid = style[(style.indexOf(mid) + 1) % style.length];
      }
      m._lastMelee = mid;
    } else {
      mid = style;
    }
    const mv = MELEE_MOVES[mid];
    m.action = {
      phase: 'windup', t: 0, angle: ang, move: mid, mv,
      windup: (tpl.windup || 0.28) * mv.windup * (this.wxWindup || 1) * (m.windupMul || 1),
      strike: mv.strike,
      recover: mv.recover
    };
    m.facing = ang;
    m.moving = false;
    m.hop = 0;
  },
  // 出手突进：分小步推进，避免一帧位移过大穿墙
  dashMonster(m, ang, dist) {
    if (!dist) return 0;
    const steps = Math.max(1, Math.ceil(dist / 22));
    const sx = Math.cos(ang) * dist / steps;
    const sy = Math.sin(ang) * dist / steps;
    let moved = 0;
    for (let i = 0; i < steps; i++) {
      const bx = m.x, by = m.y;
      this.moveWithCollision(m, sx, sy, Math.min(m.r, 26));
      const step = Math.hypot(m.x - bx, m.y - by);
      moved += step;
      if (step < 0.5) break;
    }
    return moved;
  },
  startMonsterCast(m, ang) {
    m.action = {
      phase: 'windup', t: 0, angle: ang, cast: true,
      windup: m.castTime || 0.6,
      strike: 0.12,
      recover: 0.36
    };
    m.facing = ang;
    m.moving = false;
    // 读条聚能：脚下专属法阵 + 头顶聚能球，生命与读条同步
    const skin = FX_SKINS[m.art];
    if (skin) {
      this.effects.push({
        kind: 'castCharge',
        x: m.x, y: m.y,
        angle: ang,
        radius: m.r * 2.8,
        color: m.projColor || '#9ff08a',
        life: m.action.windup, max: m.action.windup,
        skin
      });
    }
  },
  updateMonsterAction(m, dt) {
    const a = m.action;
    a.t += dt;
    if (a.phase === 'windup') {
      if (a.t >= a.windup) {
        a.phase = 'strike';
        a.t = 0;
        this.resolveMonsterStrike(m);
      }
      return;
    }
    if (a.phase === 'strike') {
      // 扑杀类：出手期间走一条起跳弧线，落地即收招
      if (a.mv && a.mv.hop) {
        m.hop = Math.sin(Math.min(1, a.t / Math.max(0.05, a.strike)) * Math.PI) * a.mv.hop;
      }
      // 连击类：第一段命中后，在出手相位的后段再补一次衰减伤害
      if (a.mv && a.mv.double && !a.hit2 && a.t >= a.strike * a.mv.double) {
        a.hit2 = true;
        this.resolveMonsterStrike(m, true);
      }
      if (a.t >= a.strike) {
        a.phase = 'recover';
        a.t = 0;
        m.hop = 0;
      }
      return;
    }
    if (a.t >= a.recover) {
      m.action = null;
      m.atkTimer = m.attackCd;
      m.hop = 0;
    }
  },
  resolveMonsterStrike(m, second) {
    const a = m.action;
    const p = this.player;
    // 精英法系：读条结束才放出弹道
    if (a.cast) {
      const c = m.projColor || '#9ff08a';
      const k = (m.artScale || 1) * (m.elite ? 1.18 : 1);
      const dir = Math.cos(a.angle) < 0 ? -1 : 1;
      this.projectiles.push({
        team: 'enemy', owner: m,
        x: m.x, y: m.y,
        vx: Math.cos(a.angle) * m.projSpeed,
        vy: Math.sin(a.angle) * m.projSpeed,
        r: 8, dmg: m.dmg, color: c,
        art: m.art,
        life: 3.2, maxLife: 3.2, pierce: 0
      });
      this.effects.push({
        kind: 'peaPuff', x: m.x + dir * 14 * k, y: m.y - 46 * k,
        angle: a.angle, skin: FX_SKINS[m.art],
        r0: 4, r1: 28 * k, radius: m.r * 2.4, color: c, life: 0.45, max: 0.45
      });
      this.addRing(m.x, m.y, 8, m.r * 2.4, c, 0.35);
      this.addBurst(m.x + dir * 18 * k, m.y - 46 * k, c, 10);
      return;
    }

    const mv = a.mv || {};
    const color = m.fxColor || '#cbe8a4';

    // 突进：抓/扑/撞在出手瞬间位移，命中判定按落点算（连击第二段不再位移）
    if (!second && mv.lunge) {
      const ox = m.x, oy = m.y;
      const moved = this.dashMonster(m, a.angle, mv.lunge);
      if (moved > 3) {
        this.effects.push({
          kind: 'dashTrail',
          x0: ox, y0: oy - m.r * 0.8, x: m.x, y: m.y - m.r * 0.8,
          color, life: 0.26, max: 0.26
        });
      }
    }

    // 连击第二段：角度轻微偏转、特效略小，形成交叉连斩
    const ang = second ? a.angle + 0.45 : a.angle;
    const fx = m.x + Math.cos(ang) * m.r * 1.4;
    const fy = m.y + Math.sin(ang) * m.r * 1.4 - m.r * 1.2;

    // 旋斩/震地这类形状完全不同的招式优先用自身特效，其余保留各怪专属刀光
    const fxKind = mv.uniqueFx ? mv.fx : (STRIKE_FX[m.art] || mv.fx || 'peaArc');
    const radius = m.r * (mv.fxScale || 3.0) * (second ? 0.9 : 1);
    const arc = mv.arc || 1.5;
    const fxLife = (mv.fxLife || 0.32) * (second ? 0.85 : 1);
    const skin = FX_SKINS[m.art];
    if (fxKind === 'frostBurst' || fxKind === 'slamShock') {
      this.effects.push({
        kind: fxKind, x: m.x, y: m.y + m.r * 0.55,
        angle: ang, radius, arc, color, skin, life: fxLife, max: fxLife
      });
    } else {
      const cy = DG.art.monsters.displayHeight
        ? m.y - DG.art.monsters.displayHeight(m) * 0.52
        : m.y - m.r * 1.35;
      this.effects.push({
        kind: fxKind, x: m.x, y: cy, angle: ang,
        radius, arc, color, skin,
        life: fxLife, max: fxLife
      });
    }
    this.addBurst(fx, fy, color, second ? 5 : 7);
    this.addRing(m.x, m.y, 8, m.r * 2.2, color, second ? 0.24 : 0.3);
    if (mv.shake && !second) this.shake = Math.max(this.shake, mv.shake);

    if (p.hp <= 0) return;
    const d = U.dist(m, p);
    let diff = U.angle(m, p) - ang;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const reach = m.attackRange * (mv.reach || 1) + p.r + 6;
    const halfArc = Math.max(0.6, arc / 2);
    const dmg = second ? Math.max(1, Math.round(m.dmg * (mv.dmg2 || 0.6))) : m.dmg;
    if (d <= reach && Math.abs(diff) <= halfArc) {
      if (this.hurtPlayer(dmg)) this.affixOnHit(m);
      this.addBurst(p.x, p.y, color, second ? 4 : 6);
      // 撞：击退玩家；抓：把玩家拖向怪物；连续受击期间取消这类受击位移
      if (!second && !p.hurtWeak) {
        if (mv.knock) {
          this.movePlayer(p, Math.cos(ang) * mv.knock, Math.sin(ang) * mv.knock, p.r);
        } else if (mv.pull) {
          this.movePlayer(p, -Math.cos(ang) * mv.pull, -Math.sin(ang) * mv.pull, p.r);
        }
      }
    }
  },
  // 远程怪开火：弹道 + 开火表现（火枪为枪口闪光，法系为冷光汇聚）
  fireEnemyShot(m, ang) {
    const projColor = m.projColor || '#b79be0';
    this.projectiles.push({
      team: 'enemy', owner: m,
      x: m.x, y: m.y,
      vx: Math.cos(ang) * m.projSpeed,
      vy: Math.sin(ang) * m.projSpeed,
      r: m.castTime ? 8 : 6,
      dmg: m.dmg,
      color: projColor,
      art: m.art,
      life: 3.2, maxLife: 3.2,
      pierce: 0
    });
    if (!m.art) return;
    m.shotAnim = 0.2;
    m.facing = ang;
    const dir = Math.cos(ang) < 0 ? -1 : 1;
    const k = (m.artScale || 1) * (m.elite ? 1.18 : 1);
    if (m.art === 'musketeer') {
      // 火枪：枪口闪光
      this.effects.push({
        kind: 'muzzle',
        x: m.x + dir * 34 * k,
        y: m.y - 34 * k,
        angle: dir > 0 ? 0 : Math.PI,
        color: m.fxColor || '#e8c98a',
        life: 0.22, max: 0.22
      });
    } else {
      // 法系远程：袖口汇聚的冷光
      this.effects.push({
        kind: 'peaPuff',
        x: m.x + dir * 22 * k, y: m.y - 46 * k,
        r0: 2, r1: 16 * k, color: m.fxColor || '#a9d8ea',
        life: 0.28, max: 0.28
      });
    }
  },
  updateMonsters(dt) {
    const p = this.player;
    const curChunk = this.currentChunk();
    for (const m of this.monsters) {
      if (m.dead) continue;
      // 记录上一帧位移：自动战斗的远程预判需要目标速度
      if (dt > 0 && m._px != null) {
        m._vx = (m.x - m._px) / dt;
        m._vy = (m.y - m._py) / dt;
      }
      m._px = m.x;
      m._py = m.y;
      m.flash = Math.max(0, m.flash - dt);
      if (m.hitReact > 0) m.hitReact = Math.max(0, m.hitReact - dt * 5.2);
      m.atkTimer = Math.max(0, m.atkTimer - dt);
      m.shootTimer = Math.max(0, m.shootTimer - dt);
      m.shotAnim = Math.max(0, (m.shotAnim || 0) - dt);
      if (m.slow > 0) m.slow -= dt;
      if (m.fear > 0) m.fear -= dt;
      if (m.hitT > 0) m.hitT -= dt;
      // 出血状态：被劈砍命中后持续从伤口滴血（眩晕/出手期间也要继续）
      this.bleedTick(m, dt);
      // 眩晕：不移动、不出手，动作被打断
      if (m.stun > 0) {
        m.stun -= dt;
        m.moving = false;
        m.action = null;
        continue;
      }
      const speedMul = m.slow > 0 ? (1 - m.slowFactor) : 1;

      // 分件小怪：出手动作期间锁定朝向与位移
      if (m.action) {
        m.moving = false;
        this.updateMonsterAction(m, dt);
        continue;
      }

      const d = U.dist(m, p);
      const ang = U.angle(m, p);
      let vx = 0, vy = 0;
      // 天气影响小怪移速（首领不受影响，保证招式节奏）
      let speed = m.speed * (m.boss ? 1 : (this.wxMonSpeed || 1));

      // 脱战：玩家已离开相邻区块，怪物返回出生点附近
      const mch = m.chunkIndex != null ? this.chunks[m.chunkIndex] : null;
      const cch = this.chunks[curChunk];
      const chained = !m.boss && mch && cch &&
        Math.abs(mch.col - cch.col) + Math.abs(mch.row - cch.row) > 1;
      if (chained) m.aggro = false;
      // 探索感：刚刷出的怪有短暂“苏醒”延迟，给玩家反应时间；
      // 之后靠近或停留过久才循声追击
      if (!chained && !m.aggro && !m.boss && !this.fieldStealth &&
        d < 560 * (this.wxSightMul || 1) * (this.fieldSightMul || 1) &&
        this.time - m.spawnTime > 0.7) m.aggro = true;
      if (!chained && !m.aggro && !m.boss && this.time - m.spawnTime > 16) m.aggro = true;

      if (m.boss) {
        if (m.patterns && m.patterns.length) {
          this.updateBoss(m, dt, d, ang, speedMul);
          continue;
        }
        if (p.hp > 0) {
          if (d > m.attackRange) {
            const f = this.flowDirection(m.x, m.y);
            if (f) { vx = f.x; vy = f.y; }
            else { vx = Math.cos(ang); vy = Math.sin(ang); }
          } else if (m.atkTimer <= 0) {
            this.hurtPlayer(m.dmg);
            m.atkTimer = m.attackCd;
          }
          // 弹幕环
          m.ringTimer -= dt;
          if (m.ringTimer <= 0) {
            m.ringTimer = m.ringCd || 6;
            this.bossRing(m);
          }
          // 召唤
          m.summonTimer -= dt;
          if (m.summonTimer <= 0) {
            m.summonTimer = m.summonCd || 9;
            this.bossSummon(m);
          }
        }
      } else if (!m.aggro) {
        // 未发现玩家时在出生点附近缓慢游荡，不穿墙
        m.wanderTimer -= dt;
        if (m.wanderTimer <= 0) {
          m.wanderTimer = U.rand(1.2, 2.8);
          m.wanderAngle = U.rand(0, Math.PI * 2);
        }
        vx = Math.cos(m.wanderAngle);
        vy = Math.sin(m.wanderAngle);
        speed = m.speed * 0.26;
        const fromSpawn = U.dist2(m.x, m.y, m.spawnX, m.spawnY);
        if (fromSpawn > 130) {
          m.wanderAngle = Math.atan2(m.spawnY - m.y, m.spawnX - m.x);
          vx = Math.cos(m.wanderAngle);
          vy = Math.sin(m.wanderAngle);
        }
      } else if (m.ranged) {
        if (p.hp > 0) {
          if (d > 380) {
            const f = this.flowDirection(m.x, m.y);
            if (f) { vx = f.x; vy = f.y; }
            else { vx = Math.cos(ang); vy = Math.sin(ang); }
          } else if (d < 220) {
            vx = -Math.cos(ang);
            vy = -Math.sin(ang);
          }
          if (d < 450 && m.shootTimer <= 0) {
            m.shootTimer = m.shootCd;
            if (m.art && m.castTime) {
              // 精英法系：先读条再出手，读条期间站定
              this.startMonsterCast(m, ang);
            } else {
              this.fireEnemyShot(m, ang);
            }
          }
        }
      } else if (p.hp > 0) {
        if (d > m.attackRange) {
          const f = this.flowDirection(m.x, m.y);
          if (f) { vx = f.x; vy = f.y; }
          else { vx = Math.cos(ang); vy = Math.sin(ang); }
        } else if (m.atkTimer <= 0) {
          if (this.isArtMonster(m)) this.startMonsterAction(m, ang);
          else {
            if (this.hurtPlayer(m.dmg)) this.affixOnHit(m);
            m.atkTimer = m.attackCd;
          }
        }
      }

      if (vx || vy) {
        // 首领体型大，墙体碰撞半径略收窄，并允许绕墙转向，保证能穿过走廊
        const wallR = m.boss ? Math.min(m.r, 26) : m.r;
        if (m.art) {
          m.moving = true;
          // 分件远程怪始终面向玩家（倒退时也不背身）
          m.facing = (m.art && m.ranged) ? ang : Math.atan2(vy, vx);
          m.walkPhase = (m.walkPhase || 0) + dt * 9;
        }
        this.moveWithSteer(m, vx * speed * speedMul * dt, vy * speed * speedMul * dt, wallR);
      } else if (m.art) {
        m.moving = false;
        if (p.hp > 0) m.facing = ang;
      }
    }

    // 分离网格：数字键 + 复用桶（只改标记不新建数组），避免每帧产生大量短命对象
    const grid = this._separationGrid || (this._separationGrid = new Map());
    const monsters = this.monsters;
    for (let pass = 0; pass < 2; pass++) {
      const stamp = (this._sepStamp = (this._sepStamp || 0) + 1);
      for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        if (m.dead) continue;
        const key = (Math.floor(m.x / SEP_CELL) + SEP_BIAS) * SEP_STRIDE +
          (Math.floor(m.y / SEP_CELL) + SEP_BIAS);
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = { stamp: stamp, items: [] };
          grid.set(key, bucket);
        } else if (bucket.stamp !== stamp) {
          bucket.stamp = stamp;
          bucket.items.length = 0;
        }
        bucket.items.push(i);
      }
      for (const entry of grid) {
        const bucket = entry[1];
        // 上一帧遗留、本帧未再使用的格子直接跳过
        if (bucket.stamp !== stamp) continue;
        const key = entry[0];
        const cx = Math.floor(key / SEP_STRIDE) - SEP_BIAS;
        const cy = (key % SEP_STRIDE) - SEP_BIAS;
        for (let n = 0; n < SEP_NEAR.length; n++) {
          const dx = SEP_NEAR[n][0], dy = SEP_NEAR[n][1];
          const other = grid.get((cx + dx + SEP_BIAS) * SEP_STRIDE + (cy + dy + SEP_BIAS));
          if (!other || other.stamp !== stamp) continue;
          const items = bucket.items, others = other.items;
          for (let i = 0; i < items.length; i++) {
            const start = dx || dy ? 0 : i + 1;
            for (let j = start; j < others.length; j++) {
              const ai = items[i], bi = others[j];
              if (ai !== bi) separateMonsters(this, monsters[ai], monsters[bi], ai, bi);
            }
          }
        }
      }
    }
  },
  // 怪物分离位移：先沿原方向推开，撞墙再斜向绕，避免每对重叠都新建闭包与临时数组
  nudgeMonster(m, sx, sy) {
    const r = m.r;
    if ((sx || sy) && !this.circleWall(m.x + sx, m.y + sy, r)) {
      m.x += sx; m.y += sy;
      return;
    }
    const ax = sx - sy * 0.45, ay = sy + sx * 0.45;
    if ((ax || ay) && !this.circleWall(m.x + ax, m.y + ay, r)) {
      m.x += ax; m.y += ay;
      return;
    }
    const bx = sx + sy * 0.45, by = sy - sx * 0.45;
    if ((bx || by) && !this.circleWall(m.x + bx, m.y + by, r)) {
      m.x += bx; m.y += by;
    }
  },
  bossRing(boss) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 / n) * i + U.rand(-0.1, 0.1);
      this.projectiles.push({
        team: 'enemy',
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * 195,
        vy: Math.sin(a) * 195,
        r: 7,
        dmg: Math.round(boss.dmg * 0.7),
        color: '#d98b9d',
        life: 4.5, maxLife: 4.5,
        pierce: 0
      });
    }
    this.addRing(boss.x, boss.y, 20, 90, '#d98b9d', 0.4);
    this.announce(`${boss.name} 释放腐化弹幕`, 1000);
  },
  bossSummon(boss, opt) {
    const alive = this.monsters.filter(m => !m.dead && !m.boss).length;
    if (alive >= 8) return;
    const minion = (opt && opt.minion) || DG.data.bossMinions[boss.typeId] || 'wolf';
    const count = (opt && opt.count) || 2;
    for (let i = 0; i < count; i++) {
      const a = U.rand(0, Math.PI * 2);
      const x = U.clamp(boss.x + Math.cos(a) * U.rand(60, 120), 40, (this.arenaW || ARENA_W) - 40);
      const y = U.clamp(boss.y + Math.sin(a) * U.rand(60, 120), 40, (this.arenaH || ARENA_H) - 40);
      const pos = this.nearestFloorPoint(x, y, 3) || { x: boss.x, y: boss.y };
      this.spawnMonster(minion, pos.x, pos.y, false);
    }
    this.addBurst(boss.x, boss.y, '#c98b9d', 12);
  },
  updateProjectiles(dt) {
    // 原地压缩，避免每帧新建数组
    const list = this.projectiles;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      // 强风天：敌方弹道会缓慢偏转，需要预判走位
      if (p.team === 'enemy' && this.wxProjDrift) {
        const a = this.wxProjDrift * dt;
        const ca = Math.cos(a), sa = Math.sin(a);
        const vx = p.vx * ca - p.vy * sa;
        p.vy = p.vx * sa + p.vy * ca;
        p.vx = vx;
      }
      // 记录移动前的位置：高速弹道按线段判定命中，避免贴脸目标被“跳帧”穿过
      const ox = p.x, oy = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -20 || p.x > (this.arenaW || ARENA_W) + 20 ||
        p.y < -20 || p.y > (this.arenaH || ARENA_H) + 20) continue;
      // 投影撞墙即消散，墙体同时充当战斗掩体
      if (this.isWallAt(p.x, p.y)) {
        this.addBurst(p.x, p.y, p.color, 2);
        continue;
      }

      if (p.team === 'player') {
        this.breakPropsAt(p.x, p.y, p.r + 14, true);
        let consumed = false;
        const sx = p.x - ox, sy = p.y - oy;
        const segLen2 = sx * sx + sy * sy;
        for (const m of this.monsters) {
          if (m.dead || p.hit.indexOf(m) >= 0) continue;
          // 点到线段的最近距离：一帧跨过目标也能判定命中
          let t = segLen2 > 0 ? ((m.x - ox) * sx + (m.y - oy) * sy) / segLen2 : 0;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const cx = ox + sx * t, cy = oy + sy * t;
          if (Math.hypot(m.x - cx, m.y - cy) <= p.r + m.r) {
            const hit = this.rollHit(p.mult, p.skill, m);
            this.hitMonster(m, hit.dmg, hit.crit);
            this.addBurst(p.x, p.y, p.color, 3);
            if (p.skill && p.skill.classId === 'ranger') {
              const angle = Math.atan2(p.vy, p.vx);
              this.effects.push({
                kind: p.impact || 'arrowImpact', x: p.x, y: p.y, angle,
                color: p.skill.id === 'snipe' ? '#f6ffdf' : p.color, life: p.skill.id === 'snipe' ? 0.24 : 0.16,
                max: p.skill.id === 'snipe' ? 0.24 : 0.16
              });
            }
            // 穿云箭：命中处迸出贯穿白光
            if (p.skill && p.skill.id === 'snipe' && p.skill.classId === 'ranger') {
              this.effects.push({
                kind: 'beam', x: p.x, y: p.y,
                angle: Math.atan2(p.vy, p.vx), len: 72, width: 9,
                color: '#f6ffdf', life: 0.2, max: 0.2
              });
              this.addRing(p.x, p.y, 4, 22, '#f6ffdf', 0.22);
            }
            p.hit.push(m);
            if (p.pierce > 0) p.pierce--;
            else consumed = true;
            if (consumed) break;
          }
        }
        if (consumed) continue;
      } else {
        if (this.player.hp > 0 && this.player.invuln <= 0 &&
          Math.hypot(p.x - this.player.x, p.y - this.player.y) <= p.r + this.player.r) {
          if (this.hurtPlayer(p.dmg)) this.affixOnHit(p.owner);
          this.addBurst(p.x, p.y, p.color, 4);
          continue;
        }
      }
      list[n++] = p;
    }
    list.length = n;
  }
  });
})();


;
/* ==== js/scenes/dungeon/boss.js ==== */
/* 副本战斗 · 首领层：待机氛围、索敌走位、招式循环与攻击判定
 * 招式由 monsters.js 的 patterns 数据驱动：
 *   arc / slash  扇形横扫（镰刀、触须）
 *   beam         直线射线（被墙体阻挡）
 *   fan          扇形弹幕
 *   blink        瞬移后接扇形斩击
 *   summon       召唤小怪
 * 每个招式都有独立的读条（windup）与冷却（cd），读条期间首领原地不动并显示预警。
 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  const AMBIENT = {
    eye: { color: '#b57ce8', every: 0.32, speed: 14 },
    reaper: { color: '#9b6ee0', every: 0.24, speed: 18 },
    croc: { color: '#9fd07a', every: 0.4, speed: 10 },
    hierophant: { color: '#c07be0', every: 0.26, speed: 16 },
    mummy: { color: '#d9cfae', every: 0.36, speed: 12 },
    octo: { color: '#7fb8f0', every: 0.28, speed: 15 },
    crab: { color: '#7fd0d8', every: 0.34, speed: 13 },
    maw: { color: '#e0666a', every: 0.3, speed: 14 },
    goat: { color: '#b89ae0', every: 0.3, speed: 15 },
    knight: { color: '#cfe0f0', every: 0.38, speed: 11 },
    cauldron: { color: '#ffa54a', every: 0.26, speed: 17 },
    snake: { color: '#5fc8d8', every: 0.3, speed: 14 },
    crystal: { color: '#b877e0', every: 0.28, speed: 15 },
    demon: { color: '#e0556a', every: 0.26, speed: 16 },
    ogre: { color: '#6fb0e0', every: 0.36, speed: 12 },
    golem: { color: '#a8bcc8', every: 0.42, speed: 10 }
  };

  // 主动贴身型首领（其余保持中远距离）
  const MELEE_KIND = {
    reaper: 1, croc: 1, mummy: 1, crab: 1, maw: 1, goat: 1,
    knight: 1, snake: 1, demon: 1, ogre: 1, golem: 1,
    cauldron: 1, octo: 1, crystal: 1
  };

  // 首领出手节奏：招式冷却统一按此倍率缩短，让首领更主动、压迫更强
  const BOSS_CD_PACE = 0.30;

  // 章内唯一：每个首领只归属一个章节；跨章再出场会被视为“复现”并强化
  const BOSS_ACT = {
    eyehorror: 1, croc: 1, mawfish: 1, mummyking: 1, slimeking: 1,
    cauldron: 2, golem: 2, blueogre: 2, goatbrute: 2, abysseye: 2, mushroomgun: 2,
    piratecrab: 3, octoking: 3, silverknight: 3, snakeking: 3, mawflowerking: 3, wormking: 3,
    reaper: 4, hierophant: 4, shadowdemon: 4, crystalcrab: 4,
    pinkdemon: 4, pumpkinlord: 4, hornedfiend: 4, mushroommaw: 4
  };

  // 每只首领的招式粒子皮肤（复用 monsters.drawFxSkin 的 bits 渲染，零额外开销）
  const BOSS_SKINS = {
    eyehorror: { bits: 'void', n: 12, color: '#b57ce8' },
    reaper: { bits: 'soul', n: 12, color: '#b28bff' },
    croc: { bits: 'toxin', n: 12, color: '#9fd07a' },
    hierophant: { bits: 'void', n: 12, color: '#c07be0' },
    mummyking: { bits: 'sand', n: 12, color: '#e0d2a8' },
    octoking: { bits: 'ink', n: 12, color: '#6fa8e8' },
    piratecrab: { bits: 'bubble', n: 10, color: '#9fe8e0' },
    mawfish: { bits: 'blood', n: 11, color: '#ef6a6a' },
    goatbrute: { bits: 'ash', n: 11, color: '#cbb0e8' },
    silverknight: { bits: 'holy', n: 11, color: '#e8f2ff' },
    cauldron: { bits: 'flame', n: 12, color: '#ffb05a' },
    snakeking: { bits: 'toxin', n: 11, color: '#7fe0dc' },
    crystalcrab: { bits: 'crystal', n: 11, color: '#d69cf0' },
    shadowdemon: { bits: 'shadow', n: 12, color: '#ff7a8a' },
    blueogre: { bits: 'rock', n: 11, color: '#8fc4ea' },
    golem: { bits: 'rock', n: 12, color: '#c2d2dc' },
    slimeking: { bits: 'toxin', n: 11, color: '#7fe0d0' },
    mushroomgun: { bits: 'ash', n: 10, color: '#ffcf7a' },
    mawflowerking: { bits: 'blood', n: 11, color: '#e05a7a' },
    wormking: { bits: 'toxin', n: 11, color: '#9fe08a' },
    pinkdemon: { bits: 'blood', n: 12, color: '#ff7aa0' },
    pumpkinlord: { bits: 'flame', n: 12, color: '#ff9a3c' },
    hornedfiend: { bits: 'void', n: 12, color: '#c07ae0' },
    mushroommaw: { bits: 'ash', n: 12, color: '#d05a5a' }
  };

  // 近战型首领出手前冲距离：让横扫/镰击真的有扑上去的动作感
  const LUNGE = {
    reaper: 42, croc: 50, mummy: 38, crab: 33, maw: 48,
    goat: 52, knight: 42, snake: 38, demon: 55, ogre: 48, golem: 38,
    cauldron: 38, octo: 42, crystal: 30
  };

  Object.assign(DG.scenes.dungeon.prototype, {
    // 重复出场：统计本章更早关卡里出现过的同一首领，第 2 次起进入二阶段，
    // 第 3 次起追加一套新招式，让同一首领在章内也不会重复同一场战斗。
    applyBossVariant(m) {
      if (!m || !m.boss) return m;
      const act = (this.def && this.def.act) || 1;
      const idx = (this.def && this.def.index) || 1;
      let tier = 0;
      const all = DG.data.dungeons || [];
      for (const d of all) {
        if (d.act === act && d.index < idx && d.bossId === m.typeId) tier++;
      }
      const home = BOSS_ACT[m.typeId];
      if (home && home !== act && tier < 1) tier = 1;   // 跨章复现至少按二阶段处理
      if (tier <= 0) return m;
      // 二阶段/新招式只做两档，重复次数再多也不继续叠数值
      tier = tier >= 2 ? 2 : 1;
      m.repeatTier = tier;
      m.name = (tier >= 2 ? '完全体 · ' : '再临 · ') + m.name;
      m.maxHp = Math.round(m.maxHp * (tier >= 2 ? 1.25 : 1.12));
      m.hp = m.maxHp;
      m.dmg = Math.round(m.dmg * (tier >= 2 ? 1.15 : 1.08));
      m.phase2At = 0.62;
      if (tier >= 2) {
        // 新招式：残响弹幕，补上中距离压制
        m.patterns.push({
          type: 'fan', label: '残响弹幕', range: 560, windup: 0.7, recover: 0.5, cd: 7,
          count: 7, spread: 0.42, dmgMul: 0.8, color: '#e0b0a0', fx: 'arcSlash', timer: 0
        });
      }
      return m;
    },

    updateBoss(m, dt, d, ang, speedMul) {
      const p = this.player;
      m.aiCd = Math.max(0, (m.aiCd || 0) - dt);
      for (const atk of m.patterns) {
        if (atk.timer > 0) atk.timer = Math.max(0, atk.timer - dt);
      }
      this.bossAmbient(m, dt);

      if (!m.enraged && m.hp / m.maxHp <= (m.phase2At || 0.5)) this.enrageBoss(m);

      // 施法中原地读条，朝向锁定在读条开始的方向
      if (m.cast) {
        m.moving = false;
        this.updateBossCast(m, dt);
        return;
      }
      m.facing = ang;
      if (p.hp <= 0) {
        m.moving = false;
        return;
      }

      if (m.aiCd <= 0) {
        const inRange = m.patterns.filter(a => a.timer <= 0 && (!a.range || d <= a.range));
        if (inRange.length) {
          this.startBossCast(m, this.pickBossAttack(inRange, d), ang);
          m.moving = false;
          return;
        }
      }

      // 走位：远则追；噬瞳之眼保持距离，收割者主动贴身
      const pref = m.preferRange || 130;
      let vx = 0;
      let vy = 0;
      if (d > pref + 24) {
        const f = this.flowDirection(m.x, m.y);
        vx = f ? f.x : Math.cos(ang);
        vy = f ? f.y : Math.sin(ang);
      } else if (d < pref - 55) {
        const def = DG.art.bosses.defs[m.art];
        const kind = def ? def.kind : 'eye';
        if (MELEE_KIND[kind]) {
          if (d > 52) {
            vx = Math.cos(ang);
            vy = Math.sin(ang);
          }
        } else if (d < 80) {
          vx = -Math.cos(ang) * 0.4;
          vy = -Math.sin(ang) * 0.4;
        }
      }
      m.moving = !!(vx || vy);
      if (m.moving) {
        const sp = m.speed * (speedMul || 1);
        this.moveWithSteer(m, vx * sp * dt, vy * sp * dt, Math.min(m.r, 26));
      }
    },

    pickBossAttack(list, d) {
      const minions = this.monsters.filter(x => !x.boss && !x.dead).length;
      let best = list[0];
      let bestScore = -Infinity;
      for (const a of list) {
        let score = Math.random() * 0.6;
        if (a.type === 'slash' || a.type === 'arc') score += d < 190 ? 1.2 : 0.2;
        if (a.type === 'beam' || a.type === 'fan') score += d > 260 ? 1.1 : 0.55;
        if (a.type === 'blink') score += d > 420 ? 0.9 : 0.35;
        if (a.type === 'summon') score += minions >= 6 ? -1.5 : 0.5;
        if (a === this._lastBossAtk) score -= 0.45;
        if (a === this._prevBossAtk) score -= 0.3;
        // 补位招式（狂暴连击）只在主招式都在冷却时兜底，避免盖过签名招式
        if (a.filler) score -= 0.6;
        if (score > bestScore) {
          bestScore = score;
          best = a;
        }
      }
      this._prevBossAtk = this._lastBossAtk;
      this._lastBossAtk = best;
      return best;
    },

    startBossCast(m, atk, ang) {
      atk.timer = (atk.cd || 3) * BOSS_CD_PACE;
      const cast = { atk, t: 0, phase: 'windup', angle: ang, dest: null };
      if (atk.type === 'blink') cast.dest = this.bossBlinkDest(m);
      m.cast = cast;
      this.bossTelegraph(m, atk, ang, cast.dest);
      this.bossCastCharge(m, atk, ang);
      // 高频连段下避免招式名刷屏：1.4 秒内只提示一次
      const now = this.time || 0;
      if (!m._annAt || now - m._annAt > 1.4) {
        m._annAt = now;
        this.announce(`${m.name} · ${atk.label}`, Math.max(900, Math.round(atk.windup * 1000)));
      }
    },

    // 读条聚能：专属法阵 + 胸口能量球，和出手特效共用一套皮肤
    bossCastCharge(m, atk, ang) {
      const def = DG.art.bosses.defs[m.art] || {};
      const kind = def.kind || 'eye';
      const skin = BOSS_SKINS[m.art];
      if (atk.type === 'summon') {
        this.effects.push({
          kind: 'summonCircle', x: m.x, y: m.y,
          radius: Math.max(96, m.r * 3.2),
          color: atk.color || '#9b7bd0',
          life: atk.windup, max: atk.windup, skin
        });
        return;
      }
      this.effects.push({
        kind: 'bossCharge', x: m.x, y: m.y, angle: ang,
        radius: m.r * (MELEE_KIND[kind] ? 2.7 : 3.3),
        h: DG.art.bosses.displayHeight(m) || 200,
        charge: atk.type,
        color: atk.color || '#c09be0',
        life: atk.windup, max: atk.windup, skin
      });
    },

    updateBossCast(m, dt) {
      const cast = m.cast;
      const atk = cast.atk;
      cast.t += dt;
      if (cast.phase === 'windup') {
        if (cast.t >= atk.windup) {
          cast.phase = 'recover';
          cast.t = 0;
          this.resolveBossCast(m, cast);
        }
        return;
      }
      if (cast.t >= (atk.recover || 0.45)) {
        m.cast = null;
        // 收招后若玩家还在近身范围内，有较高概率立刻接下一击（连段）
        const chain = this.bossChainNext(m, atk);
        m.aiCd = chain ? 0.12
          : Math.max(0.3, (atk.cd || 3) * BOSS_CD_PACE * (m.enraged ? 0.72 : 1));
      }
    },

    // 连段判定：近战招式收招后玩家仍在攻击圈内时，按狂暴状态概率追加下一击
    bossChainNext(m, atk) {
      const p = this.player;
      if (!p || p.hp <= 0) return false;
      if (atk.type !== 'arc' && atk.type !== 'slash') return false;
      if (U.dist(m, p) > (atk.range || 200) + 40) return false;
      return Math.random() < (m.enraged ? 0.62 : 0.42);
    },

    bossTelegraph(m, atk, ang, dest) {
      const life = Math.max(0.2, atk.windup);
      const high = atk.type === 'beam' || atk.type === 'blink' || (atk.dmgMul || 1) >= 1.18;
      const zone = { type: atk.type, x: m.x, y: m.y, angle: ang, life, high };
      if (atk.type === 'arc' || atk.type === 'slash') {
        zone.radius = atk.radius;
        zone.arc = atk.arc;
      } else if (atk.type === 'beam') {
        zone.length = this.bossBeamLength(m, ang, atk.range);
        zone.width = atk.width || 30;
      } else if (atk.type === 'fan') {
        zone.radius = 140;
        zone.arc = (atk.spread || 0.6) * ((atk.count || 5) - 1) + 0.25;
      } else if (atk.type === 'blink' && dest) {
        zone.x = dest.x;
        zone.y = dest.y;
        zone.radius = 96;
        zone.type = 'circle';
      }
      if (zone.radius || zone.length) this.dangerZones.push(zone);
      if (atk.type === 'arc' || atk.type === 'slash') {
        this.effects.push({
          kind: 'teleArc', x: m.x, y: m.y, angle: ang,
          arc: atk.arc, radius: atk.radius, color: atk.color,
          life, max: life
        });
      } else if (atk.type === 'beam') {
        const len = this.bossBeamLength(m, ang, atk.range);
        this.effects.push({
          kind: 'teleBeam', x: m.x, y: m.y, angle: ang,
          length: len, width: atk.width, color: atk.color,
          life, max: life
        });
      } else if (atk.type === 'fan') {
        const cone = (atk.spread || 0.6) * ((atk.count || 5) - 1) / 2;
        this.effects.push({
          kind: 'teleArc', x: m.x, y: m.y, angle: ang,
          arc: cone * 2 + 0.25, radius: 110, color: atk.color,
          life, max: life
        });
      } else if (atk.type === 'blink' && dest) {
        this.effects.push({
          kind: 'teleCircle', x: dest.x, y: dest.y, radius: 74,
          color: atk.color, life, max: life
        });
        this.addRing(m.x, m.y, 10, 62, atk.color, 0.5);
      } else if (atk.type === 'summon') {
        this.addRing(m.x, m.y, 18, Math.max(90, m.r * 3), atk.color || '#9b7bd0', life);
      }
    },

    resolveBossCast(m, cast) {
      const atk = cast.atk;
      const p = this.player;
      const dmg = Math.max(1, Math.round(m.dmg * (atk.dmgMul || 1)));
      const skin = BOSS_SKINS[m.art];

      if (atk.type === 'arc' || atk.type === 'slash') {
        // 近战型首领：先真实前冲，再判定，挥砍不再是原地播放特效
        const def = DG.art.bosses.defs[m.art];
        const kind = def ? def.kind : 'eye';
        const lunge = LUNGE[kind] || 0;
        if (lunge) {
          this.dashMonster(m, cast.angle, lunge * (m.enraged ? 1.35 : 1.15));
          this.effects.push({
            kind: 'quakeRing', x: m.x, y: m.y,
            radius: atk.radius * 0.95, color: atk.color,
            life: 0.42, max: 0.42
          });
        }
        this.effects.push({
          kind: atk.fx || 'arcSlash', x: m.x, y: m.y, angle: cast.angle,
          arc: atk.arc, radius: atk.radius, color: atk.color,
          life: 0.34, max: 0.34, skin
        });
        this.addBurst(
          m.x + Math.cos(cast.angle) * atk.radius * 0.8,
          m.y + Math.sin(cast.angle) * atk.radius * 0.8,
          atk.color, 10
        );
        this.shake = Math.max(this.shake, 0.36);
        if (this.bossArcHit(m, cast.angle, atk.radius, atk.arc)) this.hurtPlayer(dmg);
      } else if (atk.type === 'beam') {
        const len = this.bossBeamLength(m, cast.angle, atk.range);
        this.effects.push({
          kind: 'beam', x: m.x, y: m.y, angle: cast.angle,
          length: len, width: atk.width, color: atk.color,
          life: 0.3, max: 0.3, skin
        });
        this.addBurst(
          m.x + Math.cos(cast.angle) * len,
          m.y + Math.sin(cast.angle) * len,
          atk.color, 12
        );
        this.shake = Math.max(this.shake, 0.44);
        if (this.bossBeamHit(m, cast.angle, len, atk.width)) this.hurtPlayer(dmg);
      } else if (atk.type === 'fan') {
        const cone = (atk.spread || 0.6) * ((atk.count || 5) - 1) / 2;
        this.effects.push({
          kind: 'arcSlash', x: m.x, y: m.y, angle: cast.angle,
          arc: cone * 2 + 0.25, radius: 96, color: atk.color,
          life: 0.26, max: 0.26, skin
        });
        this.bossFan(m, cast.angle, atk, dmg);
      } else if (atk.type === 'blink') {
        const dest = cast.dest || this.bossBlinkDest(m);
        this.effects.push({
          kind: 'blinkWarp', x: m.x, y: m.y,
          radius: 62, color: atk.color,
          life: 0.4, max: 0.4, skin
        });
        this.addBurst(m.x, m.y, atk.color, 16);
        m.x = dest.x;
        m.y = dest.y;
        this.addRing(m.x, m.y, 12, 86, atk.color, 0.45);
        this.addBurst(m.x, m.y, atk.color, 14);
        const ang = U.angle(m, p);
        m.facing = ang;
        this.effects.push({
          kind: 'blinkWarp', x: m.x, y: m.y,
          radius: 62, color: atk.color,
          life: 0.34, max: 0.34, skin
        });
        this.effects.push({
          kind: 'arcSlash', x: m.x, y: m.y, angle: ang,
          arc: atk.arc, radius: atk.radius, color: atk.color,
          life: 0.34, max: 0.34, skin
        });
        this.shake = Math.max(this.shake, 0.38);
        if (this.bossArcHit(m, ang, atk.radius, atk.arc)) this.hurtPlayer(dmg);
      } else if (atk.type === 'summon') {
        this.effects.push({
          kind: 'summonCircle', x: m.x, y: m.y,
          radius: Math.max(96, m.r * 3.2),
          color: atk.color || '#9b7bd0',
          life: 0.5, max: 0.5, skin
        });
        this.bossSummon(m, atk);
      }
    },

    bossFan(m, ang, atk, dmg) {
      const n = Math.max(3, atk.count || 5);
      const spread = atk.spread || 0.6;
      const speed = atk.projSpeed || 230;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * spread;
        this.projectiles.push({
          team: 'enemy',
          x: m.x, y: m.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          r: 7,
          dmg,
          color: atk.color || '#a97be0',
          life: 4.2, maxLife: 4.2,
          pierce: 0
        });
      }
      this.addBurst(
        m.x + Math.cos(ang) * m.r,
        m.y + Math.sin(ang) * m.r,
        atk.color || '#a97be0', 10
      );
    },

    bossArcHit(m, angle, radius, arc) {
      const p = this.player;
      const d = U.dist(m, p);
      if (d > radius + p.r) return false;
      let diff = U.angle(m, p) - angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      return Math.abs(diff) <= arc / 2 + Math.atan2(p.r, Math.max(1, d));
    },

    bossBeamHit(m, angle, length, width) {
      const p = this.player;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const rx = p.x - m.x;
      const ry = p.y - m.y;
      const proj = rx * dx + ry * dy;
      if (proj < 0 || proj > length) return false;
      return Math.abs(rx * dy - ry * dx) <= (width || 30) / 2 + p.r;
    },

    // 射线被墙体截断，墙后安全
    bossBeamLength(m, angle, range) {
      const step = 26;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let len = 0;
      while (len < range) {
        const next = Math.min(range, len + step);
        if (this.isWallAt(m.x + dx * next, m.y + dy * next)) break;
        len = next;
      }
      return len;
    },

    // 瞬移落点：绕到玩家身后，且吸附到可站立地面
    bossBlinkDest(m) {
      const p = this.player;
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const tx = U.clamp(p.x + dx / len * 92, 40, (this.arenaW || ARENA_W) - 40);
      const ty = U.clamp(p.y + dy / len * 92, 40, (this.arenaH || ARENA_H) - 40);
      return this.nearestFloorPoint(tx, ty, 3) || { x: tx, y: ty };
    },

    bossAmbient(m, dt) {
      const def = DG.art.bosses.defs[m.art];
      const cfg = AMBIENT[def ? def.kind : 'eye'] || AMBIENT.eye;
      m.ambTimer = (m.ambTimer || 0) - dt;
      if (m.ambTimer > 0) return;
      m.ambTimer = cfg.every;
      const a = U.rand(0, Math.PI * 2);
      const rr = m.r * U.rand(0.55, 1.35);
      this.effects.push({
        kind: 'spark',
        x: m.x + Math.cos(a) * rr,
        y: m.y + Math.sin(a) * rr * 0.55,
        vx: Math.cos(a) * cfg.speed * 0.25,
        vy: -cfg.speed - U.rand(0, 10),
        life: U.rand(0.55, 1.0), max: 1.0,
        r: U.rand(1.2, 2.6),
        color: m.glow || cfg.color
      });
    },

    enrageBoss(m) {
      m.enraged = true;
      m.dmg = Math.round(m.dmg * 1.15);
      m.speed *= 1.12;
      for (const a of m.patterns) a.cd = Math.max(1.6, (a.cd || 3) * 0.7);
      // 复现首领的二阶段：额外增伤并召唤小怪，逼玩家换位
      if (m.repeatTier) {
        m.dmg = Math.round(m.dmg * 1.05);
        this.bossSummon(m, { count: 1 + m.repeatTier });
        this.addRing(m.x, m.y, 40, 260, '#d98b9d', 0.9);
      }
      this.announce(m.repeatTier ? `${m.name} · 二阶段` : `${m.name} 进入狂暴`, 2000);
      this.addRing(m.x, m.y, 20, 210, '#ff6a5e', 0.8);
      this.addBurst(m.x, m.y, '#ff8a7a', 26);
      this.shake = Math.max(this.shake, 0.5);
      if (this.$bossWrap) this.$bossWrap.classList.add('enraged');
    }
  });
})();


;
/* ==== js/scenes/dungeon/skills.js ==== */
/* 副本战斗 · 技能层：普攻与主动技能的自动释放 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
    // 战斗内成长即时生效：升级 / 换装 / 点天赋后重算属性、同步技能栏与冷却，
    // 返回本次新解锁的技能（供升级公告展示）
    refreshBuild() {
      if (!this.player || !this.stats || !this.cls) return [];
      const oldMax = this.player.maxHp;
      const oldHp = this.player.hp;
      // 天赋/流派词缀由 char 实时聚合，换装或点树后必须丢弃战斗内缓存
      this.talents = null;
      this.stats = DG.stats.compute(this.char);
      this.talents = this.stats.talents || null;
      const newMax = this.stats.maxHp;
      this.player.maxHp = newMax;
      // 上限提升时把新增生命补进当前血量；上限下降时按新上限收口，避免换装瞬间残血
      this.player.hp = newMax >= oldMax
        ? Math.min(newMax, oldHp + (newMax - oldMax))
        : Math.min(newMax, oldHp);
      if (this.player.hp <= 0) this.player.hp = 1;

      // 旧冷却按技能 id 迁移：升级只追加新槽位，不会把已在冷却的技能清零
      const cdById = {};
      for (let i = 1; i < this.skillList.length; i++) cdById[this.skillList[i].id] = this.skillCd[i] || 0;
      const prevIds = this.activeSkills.map(sk => sk.id);
      this.activeSkills = this.cls.skills
        .filter(id => DG.data.skillUnlocked(this.char, id))
        .map(id => DG.data.skills[id]);
      this.skillList = [this.basicSkill, ...this.activeSkills];
      this.skillCd = this.skillList.map((sk, i) => (i === 0 ? 0 : (cdById[sk.id] || 0)));
      if (this.hud) {
        this.bindStripSlots();
        this.updateHud();
      }
      return this.activeSkills.filter(sk => prevIds.indexOf(sk.id) < 0);
    },
    autoMoveDirection() {
      const now = this.time || 0;
      if (this.autoDecision && this.autoDecision.until > now) return this.autoDecision.dir;
      const goal = this.autoGoalTarget();
      const evade = this.autoEvadeDirection(goal);
      if (evade) return this.autoCommitMove(this.autoSmoothDirection(evade, 0.42), goal);
      // 火圈收缩：站在圈外会持续灼烧，优先往圈心走（比追怪更重要）
      const ring = this.field && this.field.kind === 'fire' ? this.field.ring : null;
      if (ring && ring.t > ring.arm &&
        Math.hypot(this.player.x - ring.x, this.player.y - ring.y) > ring.r - this.player.r - 10) {
        const dx = ring.x - this.player.x, dy = ring.y - this.player.y;
        const len = Math.hypot(dx, dy) || 1;
        return this.autoCommitMove(
          this.autoSmoothDirection({ x: dx / len, y: dy / len }, 0.5),
          { x: ring.x, y: ring.y, kind: 'ring' }
        );
      }
      if (this.autoDetour && this.autoDetour.until > now) return this.autoCommitMove(this.autoDetour.dir, goal);
      if (!goal) return this.autoCommitMove(this.autoSmoothDirection({ x: 0, y: 0 }, 0.2), null);
      const target = goal.monster;
      if (target) {
        const dist = U.dist(this.player, target);
        // 远程职业保持风筝距离：贴太近就后撤，太远再压上，距离舒适时站定输出
        if (this.autoIsRanged()) {
          const keep = Math.max(210, Math.min(340, (this.basicSkill.range || 320) * 0.46));
          const attackRange = Math.max(300, Math.min(540, (this.basicSkill.range || 320) * 0.86));
          if (dist < keep - 40) this.autoKiteHeld = true;
          else if (dist > keep + 120) this.autoKiteHeld = false;
          const hpPct = this.player.hp / this.player.maxHp;
          let closeCount = 0;
          for (const m of this.monsters) {
            if (!m.dead && U.dist(this.player, m) < 170) closeCount++;
          }
          // 满血面对普通小怪不必一直后撤：站桩输出更快；
          // 掉血、被围、精英/首领近身或脚下有预警时才拉开距离
          const needKite = this.autoKiteHeld && dist < attackRange * 0.92 &&
            (hpPct < 0.6 || closeCount >= 3 || ((target.boss || target.elite) && dist < 280) ||
              this.autoHardDangerAt(this.player.x, this.player.y) > 0);
          if (needKite || (hpPct < 0.4 && dist < 200 + target.r)) {
            // 被多只怪贴身时朝“怪最稀疏”的方向撤，而不是只背对当前目标
            let dir = null;
            if (closeCount >= 3) {
              const a = this.autoRetreatAngle();
              if (a != null && a !== undefined) dir = { x: Math.cos(a), y: Math.sin(a) };
            }
            if (!dir) dir = this.autoKiteDirection(target);
            if (dir) return this.autoCommitMove(this.autoSmoothDirection(dir, 0.4), goal);
          }
          // 已在射程内且视线畅通：站定输出；否则继续走下面的寻路绕过去
          if (dist <= attackRange && this.autoLineClear(target)) {
            return this.autoCommitMove(this.autoSmoothDirection({ x: 0, y: 0 }, 0.3), goal);
          }
        }
        // 近战：进入攻击距离后停手，让普攻自动出手（被墙挡住时继续绕路）
        // 停手距离必须落在真实命中范围内（近战判定为 centerDist <= range + m.r）。
        // 旧算法额外加了玩家半径，首领体型大时会停在命中范围之外，
        // 表现为“贴着首领站定却几乎打不出伤害”。
        const reach = this.basicSkill.range || 120;
        const stop = reach * 0.95 + Math.min(target.r, 40) * 0.5;
        const los = this.autoLineClear(target);
        if (dist <= stop && los) this.autoHoldingRange = true;
        else if (dist > stop + 16 || !los) this.autoHoldingRange = false;
        if (this.autoHoldingRange) return this.autoCommitMove(this.autoSmoothDirection({ x: 0, y: 0 }, 0.28), goal);
      }
      let dir = this.autoDirectDirection(goal) || this.autoFlowDirection(this.player.x, this.player.y, goal) || { x: 0, y: 0 };
      if (this.autoBlocked > 0.18 && (dir.x || dir.y)) {
        const base = Math.atan2(dir.y, dir.x);
        for (const off of [1.18, -1.18, 0.82, -0.82, 1.55, -1.55]) {
          const x = this.player.x + Math.cos(base + off) * 42;
          const y = this.player.y + Math.sin(base + off) * 42;
          if (!this.circleWall(x, y, this.player.r) && !this.circleProp(x, y, this.player.r)) {
            dir = { x: Math.cos(base + off), y: Math.sin(base + off) };
            this.autoBlocked = 0;
            this.autoDetour = { dir, until: this.time + 0.42 };
            return this.autoCommitMove(dir, goal);
          }
        }
      }
      // 完全走不动：先强行侧移脱困；短时间内反复脱困无效则放弃当前目标去探索
      if (!dir.x && !dir.y) {
        if (!this.autoStuckAt) this.autoStuckAt = now;
        if (now - this.autoStuckAt > 0.35) {
          const log = (this.autoEscapeLog || []).filter(t => now - t < 5);
          const escape = log.length < 3 ? this.autoEscapeDirection() : null;
          if (escape) {
            log.push(now);
            this.autoEscapeLog = log;
            this.autoDetour = { dir: escape, until: now + 0.6 };
            this.autoStuckAt = 0;
            this.autoBlocked = 0;
            return this.autoCommitMove(escape, goal);
          }
          this.autoEscapeLog = [];
          this.autoGiveUpGoal(now);
          return { x: 0, y: 0 };
        }
      } else if (this.autoBlocked > 1.2) {
        // 一直在走却始终被挡：同样视为不可达
        this.autoGiveUpGoal(now);
        return { x: 0, y: 0 };
      } else {
        this.autoStuckAt = 0;
      }
      return this.autoCommitMove(this.autoSmoothDirection(dir, 0.2), goal);
    },
    // 放弃当前不可达目标：把怪/怪群拉黑一段时间，并改为优先探索
    autoGiveUpGoal(now) {
      const goal = this.autoGoal;
      const bossGoal = !!(goal && goal.monster && goal.monster.boss);
      if (goal && goal.monster && !bossGoal) {
        this.autoIgnore = goal.monster;
        this.autoIgnoreUntil = now + 10;
      } else if (goal && goal.kind === 'pack' && this.autoPack) {
        this.autoIgnorePack = this.autoPack;
        this.autoIgnorePackUntil = now + 10;
      }
      // 首领不能放弃：不进探索模式，下一帧重新贴身打
      this.autoExploreUntil = bossGoal ? 0 : now + 6;
      this.autoTarget = null;
      this.autoPack = null;
      this.autoGoal = null;
      this.autoDecision = null;
      this.autoEvade = null;
      this.autoSteer = null;
      this.autoHoldingRange = false;
      this.autoKiteHeld = false;
      this.autoStuckAt = 0;
      this.autoBlocked = 0;
      this.autoEscapeLog = [];
    },
    autoCommitMove(dir, goal) {
      this.autoDecision = { dir, goal, until: (this.time || 0) + 0.1 };
      return dir;
    },
    autoDirectDirection(goal) {
      const dx = goal.x - this.player.x, dy = goal.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return { x: 0, y: 0 };
      const x = dx / dist, y = dy / dist;
      // 步长小于最薄墙体，避免“直线看起来通”而实际撞墙
      const steps = Math.ceil(dist / 32);
      for (let i = 1; i <= steps; i++) {
        const t = Math.min(dist, i * 32);
        const px = this.player.x + x * t, py = this.player.y + y * t;
        if (this.circleWall(px, py, this.player.r) || this.circleProp(px, py, this.player.r)) return null;
      }
      return { x, y };
    },
    autoSmoothDirection(next, weight) {
      const old = this.autoSteer;
      // 方向发生大角度反转时直接切换而不是插值：否则左右相反的寻路结果会被
      // 平滑成 (0,0)，角色在墙边原地抽搐、永远走不出拐角
      if (!old || old.x * next.x + old.y * next.y < 0.2) {
        this.autoSteer = { x: next.x, y: next.y };
        return next;
      }
      const x = old.x + (next.x - old.x) * weight;
      const y = old.y + (next.y - old.y) * weight;
      const len = Math.hypot(x, y);
      this.autoSteer = len < 0.08 ? { x: 0, y: 0 } : { x, y };
      return len < 0.08 ? this.autoSteer : { x: x / len, y: y / len };
    },
    // 远程职业：普攻为弹道/散射，需要保持距离而不是贴脸
    autoIsRanged() {
      const type = this.basicSkill && this.basicSkill.type;
      return type === 'projectile' || type === 'spread';
    },
    // 残血时寻找最近的恢复球（拾取即回 20% 最大生命）
    autoHealOrbTarget() {
      const hpPct = this.player.hp / this.player.maxHp;
      if (hpPct > 0.55) return null;
      const reach = hpPct < 0.3 ? 950 : 620;
      let best = null, bestD = reach;
      for (const d of this.drops || []) {
        if (d.kind !== 'orb') continue;
        const dist = U.dist(this.player, d);
        if (dist >= bestD) continue;
        // 只追直线可达或很近的球，避免为了捡球绕远路被围死
        if (dist > 220 && !this.autoDirectDirection(d)) continue;
        bestD = dist;
        best = d;
      }
      return best;
    },
    autoStepFree(x, y, dist) {
      const steps = Math.ceil(dist / 24);
      for (let i = 1; i <= steps; i++) {
        const t = dist * i / steps;
        const px = this.player.x + x * t, py = this.player.y + y * t;
        if (this.circleWall(px, py, this.player.r) || this.circleProp(px, py, this.player.r)) return false;
      }
      return true;
    },
    // 视线检测：隔着墙/可破坏立件时不要站桩输出，先绕过去或打碎挡路的道具。
    // 采样步长必须小于最薄墙体（32px）：24px 采样会从薄墙中间穿过去，
    // 造成“看得见、站桩射、弹道全被墙挡住”的零输出死锁
    autoLineClear(target) {
      if (!target) return false;
      const dx = target.x - this.player.x, dy = target.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d < 32) return true;
      const steps = Math.ceil(d / 12);
      for (let i = 1; i < steps; i++) {
        const t = d * i / steps;
        const px = this.player.x + dx / d * t, py = this.player.y + dy / d * t;
        if (this.circleWall(px, py, 6)) return false;
        if (this.circleProp(px, py, 6)) return false;
      }
      return true;
    },
    // 找出挡在攻击线路上、可以直接打碎的立件
    autoPropBlocker(target) {
      if (!target || !this.propCols || !this.propCols.length) return null;
      const dx = target.x - this.player.x, dy = target.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d < 32) return null;
      const steps = Math.ceil(d / 24);
      for (let i = 1; i < steps; i++) {
        const t = d * i / steps;
        const px = this.player.x + dx / d * t, py = this.player.y + dy / d * t;
        for (const c of this.propCols) {
          if (!c.prop || c.prop.destroyed) continue;
          if (this.propGap(c, px, py) < 6) return c;
        }
      }
      return null;
    },
    // 风筝走位：远离目标为主，叠加侧向偏移，撞墙时换另一侧
    autoKiteDirection(target) {
      const dx = this.player.x - target.x, dy = this.player.y - target.y;
      const len = Math.hypot(dx, dy) || 1;
      const ax = dx / len, ay = dy / len;
      if (!this.autoKiteSide) this.autoKiteSide = U.chance(0.5) ? 1 : -1;
      const side = this.autoKiteSide;
      const tries = [
        [ax * 0.84 - ay * 0.46 * side, ay * 0.84 + ax * 0.46 * side],
        [ax * 0.84 + ay * 0.46 * side, ay * 0.84 - ax * 0.46 * side],
        [ax, ay]
      ];
      for (const v of tries) {
        const l = Math.hypot(v[0], v[1]) || 1;
        const x = v[0] / l, y = v[1] / l;
        if (this.autoStepFree(x, y, 76)) return { x, y };
      }
      // 后撤方向被墙封死：换一侧绕行，下一帧再试
      this.autoKiteSide = -side;
      return null;
    },
    autoGoalTarget() {
      const now = this.time || 0;
      // 目标临时不可达的黑名单，过期后重新尝试
      if (this.autoIgnore && this.autoIgnoreUntil < now) this.autoIgnore = null;
      if (this.autoIgnorePack && this.autoIgnorePackUntil < now) this.autoIgnorePack = null;
      // 残血先捡恢复球：自动战斗优先保命，再继续输出
      const orb = this.autoHealOrbTarget();
      if (orb) {
        this.autoTarget = null;
        this.autoPack = null;
        this.autoGoal = { x: orb.x, y: orb.y, kind: 'orb', orb };
        return this.autoGoal;
      }
      const cur = this.currentChunk();
      const curCh = this.chunks[cur];
      // 刚刚卡死过：先去激活新的怪群，避免一直死磕同一个不可达的怪
      const exploring = now < (this.autoExploreUntil || 0);
      // 还有没激活的怪群时，只打当前/相邻区块的怪；
      // 怪群全部激活后，剩下的怪无论多远都要清掉，否则无法触发首领
      const pendingPacks = (this.chunkPacks || []).some(p => !p.spawned && p !== this.autoIgnorePack);
      // 长时间没有击杀（疑似被地形/怪群卡住）时放开“只打当前区块”的限制，
      // 让 AI 能直接去清掉地图上残留的怪，避免在空区块里反复打转
      const stalled = now - (this.lastKillTime == null ? now : this.lastKillTime) > 45;
      let best = null, bestScore = Infinity, bestDist = Infinity;
      if (!exploring) {
        for (const m of this.monsters) {
          if (m.dead) continue;
          const d = U.dist(this.player, m);
          // 首领永远不被拉黑：它是通关条件，一旦出现就必须持续压制。
          // 否则一次“不可达”判定就会让 AI 跑去清远处的怪，留下首领挂机不打。
          if (m.boss) {
            this.autoTarget = m;
            this.autoPack = null;
            this.autoGoal = { x: m.x, y: m.y, monster: m, kind: 'boss' };
            return this.autoGoal;
          }
          if (m === this.autoIgnore) continue;
          const mch = m.chunkIndex != null ? this.chunks[m.chunkIndex] : null;
          if (!stalled && pendingPacks && mch && curCh && Math.abs(mch.col - curCh.col) + Math.abs(mch.row - curCh.row) > 1 && !m.aggro) continue;
          // 优先级：距离为主，残血目标（配合处决）、远程与精英更值得先处理
          let score = d - (1 - m.hp / m.maxHp) * 70;
          if (m.ranged) score -= 30;
          if (m.elite) score -= 24;
          // 分裂出的小体不计击杀：优先绕开它们，避免刷不动任务进度
          if (m.noLoot) score += 260;
          if (score < bestScore) { best = m; bestScore = score; bestDist = d; }
        }
      }
      const locked = this.autoTarget;
      // 已锁定目标若是分裂小体，而场上还有能推进进度的本体，则立即换目标
      const dropLock = locked && locked.noLoot && this.monsters.some(q => !q.dead && !q.noLoot);
      if (!exploring && locked && !dropLock && locked !== this.autoIgnore && !locked.dead && this.monsters.indexOf(locked) >= 0) {
        const lockedD = U.dist(this.player, locked);
        // 精英目标离得太远而附近有普通怪时，先清小怪，避免长距离风筝僵持
        const farElite = locked.elite && !locked.boss && best && !best.elite &&
          lockedD > bestDist + 140;
        if (!best || (lockedD <= bestDist + 120 && !farElite)) {
          // 贴合到最近的可行走点，防止怪物被挤进墙里导致寻路目标无效
          const gp = this.nearestFloorPoint(locked.x, locked.y, 2) || locked;
          this.autoGoal = { x: gp.x, y: gp.y, kind: 'monster', monster: locked };
          return { x: gp.x, y: gp.y, monster: locked, kind: 'monster' };
        }
      }
      if (best) {
        this.autoTarget = best;
        this.autoPack = null;
        const gp = this.nearestFloorPoint(best.x, best.y, 2) || best;
        this.autoGoal = { x: gp.x, y: gp.y, kind: 'monster', monster: best };
        return { x: gp.x, y: gp.y, monster: best, kind: 'monster' };
      }
      let pack = this.autoPack && !this.autoPack.spawned && this.autoPack !== this.autoIgnorePack ? this.autoPack : null;
      if (!pack) {
        for (const p of this.chunkPacks || []) {
          if (p.spawned || p === this.autoIgnorePack) continue;
          if (!pack || U.dist(this.player, p) < U.dist(this.player, pack)) pack = p;
        }
      }
      if (pack) {
        const dx = this.player.x - pack.x, dy = this.player.y - pack.y;
        const d = Math.hypot(dx, dy) || 1;
        const staging = this.nearestFreePoint(pack.x + dx / d * 320, pack.y + dy / d * 320, 5, this.player.r);
        this.autoTarget = null;
        this.autoPack = pack;
        this.autoGoal = { x: staging ? staging.x : pack.x, y: staging ? staging.y : pack.y, kind: 'pack' };
        return this.autoGoal;
      }
      const room = this.rooms && this.rooms[this.arenaChunk];
      if (room && this.phase === 'wave') {
        this.autoTarget = null;
        this.autoGoal = { x: room.cx, y: room.cy, kind: 'arena' };
        return this.autoGoal;
      }
      this.autoTarget = null;
      this.autoPack = null;
      this.autoGoal = null;
      return null;
    },
    autoZoneDanger(x, y, z) {
      const r = this.player.r + 8;
      if (z.type === 'circle') return Math.hypot(x - z.x, y - z.y) < z.radius + r;
      const dx = x - z.x, dy = y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx);
      const diff = Math.abs(U.angleDiff(angle, z.angle));
      if (z.type === 'beam') {
        const proj = dx * Math.cos(z.angle) + dy * Math.sin(z.angle);
        return proj >= -r && proj <= z.length + r && Math.abs(dx * Math.sin(z.angle) - dy * Math.cos(z.angle)) < z.width / 2 + r;
      }
      return d < z.radius + r && diff < z.arc / 2 + 0.18;
    },
    autoProjectileDanger(x, y) {
      for (const p of this.projectiles) {
        if (p.team !== 'enemy') continue;
        const speed2 = p.vx * p.vx + p.vy * p.vy;
        if (!speed2) continue;
        const t = U.clamp(((x - p.x) * p.vx + (y - p.y) * p.vy) / speed2, 0, 0.65);
        if (t <= 0.01) continue;
        const px = p.x + p.vx * t, py = p.y + p.vy * t;
        if (Math.hypot(px - x, py - y) < p.r + this.player.r + 10) return true;
      }
      return false;
    },
    // 怪物起手预警：前摇结束时会被打中的位置。近战按突进落点与扇形判定，
    // 远程读条按射线判定。普通小怪只在高威胁时才值得躲，避免近战为了闪避丢输出。
    autoMonsterWindupDanger(x, y) {
      const pad = this.player.r + 8;
      const hpPct = this.player.hp / this.player.maxHp;
      const rangedCls = this.autoIsRanged();
      for (const m of this.monsters) {
        if (m.dead) continue;
        const a = m.action;
        if (a && a.phase === 'windup') {
          if (a.cast) {
            const rx = x - m.x, ry = y - m.y;
            const proj = rx * Math.cos(a.angle) + ry * Math.sin(a.angle);
            if (proj < 0) continue;
            const perp = Math.abs(rx * Math.sin(a.angle) - ry * Math.cos(a.angle));
            if (perp < pad + 10) return true;
            continue;
          }
          const mv = a.mv || {};
          const dmgPct = m.dmg / Math.max(1, this.player.maxHp);
          if (!rangedCls && !m.elite && !m.boss && dmgPct < 0.055 && hpPct > 0.42) continue;
          let ox = m.x, oy = m.y;
          if (mv.lunge) {
            ox += Math.cos(a.angle) * mv.lunge * 0.9;
            oy += Math.sin(a.angle) * mv.lunge * 0.9;
          }
          if (Math.hypot(x - ox, y - oy) > m.attackRange * (mv.reach || 1) + pad) continue;
          let diff = Math.atan2(y - oy, x - ox) - a.angle;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          if (Math.abs(diff) <= Math.max(0.62, (mv.arc || 1.5) / 2)) return true;
        } else if (m.ranged && m.aggro && m.shootTimer != null && m.shootTimer < 0.24) {
          // 远程怪即将开火：按当前朝向的射线预判
          const rx = x - m.x, ry = y - m.y;
          const proj = rx * Math.cos(U.angle(m, this.player)) + ry * Math.sin(U.angle(m, this.player));
          if (proj < 0 || proj > 470) continue;
          const perp = Math.abs(rx * Math.sin(U.angle(m, this.player)) - ry * Math.cos(U.angle(m, this.player)));
          if (perp < pad + 8) return true;
        }
      }
      return false;
    },
    // 硬威胁：真正会掉血的预警（弹道 / 技能前摇 / 首领预警圈 / 场地与天气）
    autoHardDangerAt(x, y) {
      let danger = 0;
      if (this.autoProjectileDanger(x, y)) danger += 12000;
      if (this.autoMonsterWindupDanger(x, y)) danger += 15000;
      for (const z of this.dangerZones || []) {
        if (this.autoZoneDanger(x, y, z)) danger += z.high ? 26000 : 8000;
      }
      return danger + this.autoFieldDanger(x, y);
    },
    // 场地/天气威胁：火圈外、落雷预警圈、已触发的枫叶堆
    autoFieldDanger(x, y) {
      let danger = 0;
      const f = this.field;
      if (f && f.kind === 'fire' && f.ring && f.ring.t > f.ring.arm) {
        if (Math.hypot(x - f.ring.x, y - f.ring.y) > f.ring.r - 18) danger += 9000;
      }
      for (const s of this.wxStrikes || []) {
        if (Math.hypot(x - s.x, y - s.y) < 92 + this.player.r + 6) danger += 12000;
      }
      if (f && f.piles) {
        for (const q of f.piles) {
          if (!q.armed) continue;
          if (Math.hypot(x - q.x, y - q.y) < (q.r || 30) + 80) danger += 9000;
        }
      }
      for (const z of this.wxZones || []) {
        if (!z.armed) continue;
        if (Math.hypot(x - z.x, y - z.y) < (z.r || 70) + 80) danger += 9000;
      }
      return danger;
    },
    // 卡死脱困：在 16 方向里挑一个可走、远离怪堆、略偏地图中心的方向
    autoEscapeDirection() {
      const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * 2 * i / 16;
        const x = Math.cos(a), y = Math.sin(a);
        if (!this.autoStepFree(x, y, 56)) continue;
        const ex = this.player.x + x * 96, ey = this.player.y + y * 96;
        let score = -Math.hypot(ex - aw / 2, ey - ah / 2) * 0.02;
        for (const m of this.monsters) {
          if (m.dead) continue;
          const md = Math.hypot(ex - m.x, ey - m.y);
          if (md < 160) score -= (160 - md) * 0.6;
        }
        score -= this.autoHardDangerAt(ex, ey) * 0.001;
        if (score > bestScore) { bestScore = score; best = { x: x, y: y }; }
      }
      return best;
    },
    autoEvadeDirection(goal) {
      const here = this.autoHardDangerAt(this.player.x, this.player.y);
      const now = this.time || 0;
      if (!here) {
        if (this.autoEvade && this.autoEvade.until > now) return this.autoEvade.dir;
        this.autoEvade = null;
        return null;
      }
      const base = goal ? Math.atan2(goal.y - this.player.y, goal.x - this.player.x) : this.player.facing;
      const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
      let best = null, bestScore = Infinity;
      for (let i = 0; i < 18; i++) {
        const a = base + Math.PI * 2 * i / 18;
        const step = i % 2 ? 92 : 128;
        const x = this.player.x + Math.cos(a) * step, y = this.player.y + Math.sin(a) * step;
        const mx = this.player.x + Math.cos(a) * step * 0.55;
        const my = this.player.y + Math.sin(a) * step * 0.55;
        if (this.circleWall(x, y, this.player.r) || this.circleProp(x, y, this.player.r)) continue;
        // 终点与途中都要安全，避免直线穿过预警区
        let score = this.autoHardDangerAt(x, y) * 1.2 + this.autoHardDangerAt(mx, my) * 0.8;
        // 怪物拥挤度：别为了躲技能一头钻进怪堆
        for (const m of this.monsters) {
          if (m.dead) continue;
          const md = Math.hypot(x - m.x, y - m.y);
          const minD = m.r + this.player.r + 30;
          if (md < minD) score += (minD - md) * (m.boss ? 14 : 6);
        }
        if (x < 70 || y < 70 || x > aw - 70 || y > ah - 70) score += 420;
        if (goal) score += Math.hypot(goal.x - x, goal.y - y) * 0.05;
        if (score < bestScore) { bestScore = score; best = { x: Math.cos(a), y: Math.sin(a) }; }
      }
      if (best) this.autoEvade = { dir: best, until: now + 0.3 };
      return best;
    },
    // 远离最近怪物与危险区的方向（保命位移技能用）
    autoRetreatAngle() {
      const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * 2 * i / 16;
        const x = this.player.x + Math.cos(a) * 150;
        const y = this.player.y + Math.sin(a) * 150;
        if (this.circleWall(x, y, this.player.r) || this.circleProp(x, y, this.player.r)) continue;
        if (x < 70 || y < 70 || x > aw - 70 || y > ah - 70) continue;
        let score = -this.autoHardDangerAt(x, y) * 0.02;
        for (const m of this.monsters) {
          if (!m.dead) score += Math.hypot(x - m.x, y - m.y) * 0.02;
        }
        if (score > bestScore) { bestScore = score; best = a; }
      }
      return best;
    },
    doBasic(angle) {
      const sk = this.basicSkill;
      const lv = this.char.skills[sk.id] || 1;
      // 挥砍时长跟随攻速收紧：保证每一刀都能收完再出下一刀，避免动作被硬切
      const cd = 1 / this.attackSpeedNow();
      const dur = Math.min(0.46, Math.max(0.26, cd * 1.05));
      this.player.atkAnim = dur;
      this.player.atkDur = dur;
      this.performSkill(sk, lv, 'basic', angle);
      this.breakPropsAt(
        this.player.x + Math.cos(angle) * ((sk.range || 70) * 0.52),
        this.player.y + Math.sin(angle) * ((sk.range || 70) * 0.52),
        Math.max(38, (sk.range || 70) * 0.5)
      );
      this.attackCd = cd;

      // 箭幕：每第 5 次普攻追加一圈环形箭
      if (this.hasTalent('arrowCurtain')) {
        this.basicCount++;
        if (this.basicCount >= 5) {
          this.basicCount = 0;
          const base = this.player.facing;
          for (let i = 0; i < 8; i++) {
            this.spawnPlayerProjectile(base + (Math.PI * 2 / 8) * i, this.basicSkill, 0.6);
          }
          // 箭幕特效：双层草绿冲击环 + 八道向外箭影 + 名号提示
          this.addRing(this.player.x, this.player.y, 10, 46, '#cfe3b0', 0.3);
          this.addRing(this.player.x, this.player.y, 6, 30, '#f2ffd9', 0.2);
          this.addBurst(this.player.x, this.player.y - 10, '#cfe3b0', 10);
          this.addFloater(this.player.x, this.player.y - 80, '箭幕', '#cfe3b0', 24);
          for (let i = 0; i < 8; i++) {
            const d = base + (Math.PI * 2 / 8) * i;
            this.effects.push({
              kind: 'streak',
              x: this.player.x + Math.cos(d) * 40,
              y: this.player.y - 12 + Math.sin(d) * 40,
              angle: d, len: 24, w: 1.6, color: '#cfe3b0',
              life: 0.26, max: 0.26
            });
          }
        }
      }
    },

    // 自动战斗的普攻目标：远程优先打视野内最值得打的目标，
    // 避免移动时只朝正前方放箭、背后近身的怪一直打不到
    autoBasicTarget() {
      const range = (this.basicSkill.range || 600) + 24;
      let best = null, bestScore = Infinity;
      for (const m of this.monsters) {
        if (m.dead) continue;
        const d = U.dist(this.player, m);
        if (d > range) continue;
        if (!this.autoLineClear(m)) continue;
        let score = d;
        if (m.boss) score -= 260;
        else if (m.elite) score -= 70;
        if (m.aggro) score -= 30;
        if (m.hp / m.maxHp < 0.25) score -= 120;
        // 分裂小体不推进任务，除非没有别的目标
        if (m.noLoot) score += 240;
        if (score < bestScore) { bestScore = score; best = m; }
      }
      return best;
    },
    // 自动战斗保险：近身却长时间不掉血的怪视为被墙体/立件卡死，挪到就近的空地上。
    // 只在怪物自己附近找落脚点，不往玩家身边拉，避免把远处的怪群拽到脸上。
    autoWatchStuckMonsters(dt) {
      const now = this.time || 0;
      if (now < (this.autoStuckScanAt || 0)) return;
      this.autoStuckScanAt = now + 1;
      if (this.phase === 'boss') return;
      for (const m of this.monsters) {
        if (m.dead || m.boss) continue;
        const d = U.dist(this.player, m);
        if (d > 280) { m.autoStuckT = 0; m.autoStuckHp = m.hp; continue; }
        if (m.autoStuckHp !== m.hp) { m.autoStuckHp = m.hp; m.autoStuckT = 0; continue; }
        m.autoStuckT = (m.autoStuckT || 0) + 1;
        if (m.autoStuckT < 10) continue;
        for (let i = 0; i < 16; i++) {
          const a = Math.PI * 2 * i / 16;
          const rr = 34 + (i % 3) * 26;
          const x = m.x + Math.cos(a) * rr;
          const y = m.y + Math.sin(a) * rr;
          if (this.circleWall(x, y, m.r) || this.circleProp(x, y, m.r)) continue;
          if (U.dist(this.player, { x: x, y: y }) < 70) continue;
          m.x = x;
          m.y = y;
          m.aggro = true;
          break;
        }
        m.autoStuckT = 0;
        m.autoStuckHp = m.hp;
      }
      // 兜底：自动模式长时间零击杀（>30s）时，把 AI 死磕的那只怪挪到玩家外围的开阔地。
      // 极少数怪会被隔间/墙体锁死、永远走不过来，不兜底就会卡死通关进度
      if (now - (this.lastKillTime == null ? now : this.lastKillTime) < 30) return;
      const goalM = this.autoGoal && this.autoGoal.monster;
      if (!goalM || goalM.dead || goalM.boss) return;
      if (now < (this.autoRelocateAt || 0)) return;
      if (U.dist(this.player, goalM) < 260) return;
      this.autoRelocateAt = now + 4;
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * 2 * i / 16;
        const rr = 360 + (i % 4) * 30;
        const x = this.player.x + Math.cos(a) * rr;
        const y = this.player.y + Math.sin(a) * rr;
        if (this.circleWall(x, y, goalM.r) || this.circleProp(x, y, goalM.r)) continue;
        goalM.x = goalM._px = x;
        goalM.y = goalM._py = y;
        goalM.spawnX = x;
        goalM.spawnY = y;
        goalM.aggro = true;
        this.autoTarget = null;
        this.autoGoal = null;
        this.autoPack = null;
        this.autoDecision = null;
        this.autoSteer = null;
        break;
      }
    },
    autoCast() {
      if (this.player.hp <= 0) return;
      // 战吼蓄力/释放期间锁定动作：普攻与其他技能不插入，保证整套吼叫连贯播完
      if (this.roar) return;

      // 0 号位：普攻（移动中只打前方的目标，出手方向跟随移动方向）
      if (this.attackCd <= 0 && !this.whirl) {
        let target = null;
        if (this.autoMode && this.autoIsRanged()) {
          // 远程自动战斗：优先选择视野内收益最高的目标（残血/精英/首领/近身怪）
          target = this.autoBasicTarget();
        }
        if (!target) target = this.nearestMonsterInFront((this.basicSkill.range || 600) + 24);
        // 远程职业后撤风筝时也允许回头输出，避免拉开距离的全程没有伤害
        if (!target && this.autoMode && this.autoIsRanged()) {
          target = this.nearestMonster((this.basicSkill.range || 600) + 24);
        }
        // 近战锁定分裂小体时，优先改打能推进进度的本体
        if (this.autoMode && target && target.noLoot) {
          const alt = this.autoBasicTarget();
          if (alt && !alt.noLoot) target = alt;
        }
        // 目标被可破坏立件挡住：先打碎立件，避免双方隔着道具互相够不到
        if (this.autoMode && target) {
          const blocker = this.autoPropBlocker(target);
          if (blocker) {
            this.player.facing = U.angle(this.player, blocker);
            this.doBasic(this.player.facing);
            return;
          }
        }
        if (target) {
          let face = U.angle(this.player, target);
          // 高速移动目标按弹道飞行时间取提前量，否则远程 AI 会对着残影一直放空
          if (this.autoMode && this.autoIsRanged()) {
            const vx = target._vx || 0, vy = target._vy || 0;
            if (Math.hypot(vx, vy) > 40) {
              const fly = U.dist(this.player, target) / ((this.basicSkill && this.basicSkill.speed) || 800);
              face = U.angle(this.player, { x: target.x + vx * fly * 0.7, y: target.y + vy * fly * 0.7 });
            }
          }
          this.player.facing = face;
          this.doBasic(this.player.facing);
        } else if (this.autoMode) {
          // 自动战斗：前方挡路的可破坏道具直接砸碎，避免被卡在障碍前
          const prop = this.nearestBreakableInFront(84);
          if (prop) {
            this.player.facing = U.angle(this.player, prop.col);
            this.doBasic(this.player.facing);
          }
        }
      }

      // 1~4 号位：主动技能
      // 衔接间隔：同一帧只放一个主动技能，且两次之间至少隔 0.14 秒，
      // 避免多个技能同时就绪时一起打出、动作互相打断（旋风刚起手就被冲锋盖掉等）
      if (this._skillCastAt != null && this.time - this._skillCastAt < 0.14) return;
      const overload = this.hasTalent('overload');
      let pick = null;
      for (let i = 1; i < this.skillList.length; i++) {
        if (this.skillCd[i] > 0) continue;
        const sk = this.skillList[i];
        // 旋风持续期间不重复起手；冷却为 0 时可在旋转结束后无缝续转
        if (sk.id === 'whirlwind' && this.whirl) continue;
        // 旋风引导中冲锋与震动波不可用：保持就绪、先不消耗冷却，旋风结束当帧立刻接上
        //（战吼例外：转圈期间只要冷却好了就能放）
        if (this.whirl && (sk.id === 'charge' || sk.id === 'shockwave')) continue;
        // 大技能消耗精力：不足时跳过，等回复后自动释放
        const cost = sk.energy || 0;
        if (cost > 0 && this.player.stam < cost) continue;
        const angle = this.autoSkillAngle(sk);
        if (angle === null) continue;

        // 智能择优：保命位移 > 命中更多的范围技能 > 单体输出
        const score = this.autoSkillScore(sk, angle);
        if (score <= 0) continue;
        if (!pick || score > pick.score) pick = { i, sk, angle, score, cost };
      }
      if (!pick) return;
      const i = pick.i, sk = pick.sk, angle = pick.angle, cost = pick.cost;

      // 奥能过载：每 3 次主动技能后的下一发翻倍
      let buffed = false;
      if (overload && this.overloadCount >= 3) {
        buffed = true;
        this.overloadCount = 0;
      }

      this.skillCd[i] = this.skillCooldown(sk);
      // 冲锋连晕叠层：每次达标累计，最多把冲锋冷却缩短 5 秒
      if (sk.id === 'charge' && this.chargeCdrBonus) {
        this.skillCd[i] = Math.max(0.5, this.skillCd[i] - this.chargeCdrBonus);
      }
      if (cost > 0) this.player.stam = Math.max(0, this.player.stam - cost);
      this._overloadCast = buffed;
      this.performSkill(sk, this.char.skills[sk.id] || 1, 'auto', angle);
      this._overloadCast = false;
      if (overload && !buffed) this.overloadCount++;
      // 本帧只出手一次，其余就绪技能等下一个衔接间隔再放
      this._skillCastAt = this.time;
    },

    // 冲锋残影：把角色当前姿态画进离屏画布再整体染色，得到一张可复用的暖色剪影
    chargeGhostImage(phase, flip) {
      if (typeof document === 'undefined' || !DG.art.heroFor) return null;
      const hero = DG.art.heroFor('warrior');
      if (!hero || !hero.canvasDraw) return null;
      const W = 190, H = 190, ox = W / 2, oy = H - 30;
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const g = cv.getContext('2d');
      hero.canvasDraw(g, ox, oy, { scale: 0.7273, state: 'walk', walkPhase: phase, t: 0, flip: !!flip });
      g.globalCompositeOperation = 'source-atop';
      // 上亮下暗的暖色渐变：头顶接近白热、腰部橙红、脚下暗红余烬，像被速度点燃的火影
      const lg = g.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, '#ffd39a');
      lg.addColorStop(0.3, '#ffab63');
      lg.addColorStop(0.55, '#ff6a32');
      lg.addColorStop(0.78, '#c02f18');
      lg.addColorStop(1, '#3f0c06');
      g.fillStyle = lg;
      g.fillRect(0, 0, W, H);
      return cv;
    },

    // 索敌：移动中只锁定移动方向前方的目标，避免角色转身向后出手
    nearestMonsterInFront(maxDist) {
      const dir = this.moveDirAngle;
      if (dir == null) return this.nearestMonster(maxDist);
      let best = null;
      let bestD = maxDist || Infinity;
      for (const m of this.monsters) {
        if (m.dead) continue;
        const d = U.dist(this.player, m);
        if (d >= bestD) continue;
        if (Math.abs(U.angleDiff(U.angle(this.player, m), dir)) > 1.0) continue;
        best = m;
        bestD = d;
      }
      return best;
    },

    // 旋风：5 秒持续旋转，与冷却无关，时间不到不会停；期间可移动，每 0.1 秒持续结算伤害
    updateWhirl(dt) {
      const w = this.whirl;
      if (!w) {
        this.whirlIdleT = (this.whirlIdleT || 0) + dt;
        return;
      }
      this.whirlIdleT = 0;
      this.whirlChainT = (this.whirlChainT || 0) + dt;
      // 旋转角持续累加（2.4 圈/秒）：起手 0.16 秒平滑加速，避免一上来就满速的顿挫
      const ch = this.whirlChainT || 0;
      const ramp = ch < 0.16 ? 0.45 + 0.55 * (ch / 0.16) : 1;
      this.whirlSpin = (this.whirlSpin || 0) + dt * Math.PI * 2 * 2.4 * ramp;
      w.t += dt;
      w.ftick -= dt;
      const show = w.ftick <= 0;
      if (show) w.ftick += 0.5;
      w.tick -= dt;
      if (w.tick <= 0) {
        w.tick += 0.1;
        for (const m of this.monsters) {
          if (m.dead) continue;
          if (U.dist(this.player, m) <= w.radius + m.r) {
            // 持续伤害：每 0.1 秒扣一次，血条平滑下降；每 0.5 秒汇总飘一次字
            const r = this.rollHit(w.mult * 0.05, w.sk, m);
            this.hitMonster(m, r.dmg, r.crit, { quiet: true });
            m.whirlAcc = (m.whirlAcc || 0) + r.dmg;
            if (show) {
              m.flash = 0.13;
              this.addBlood(m);
              this.addFloater(m.x + U.rand(-6, 6), m.y - m.r - 20,
                U.fmt(Math.round(m.whirlAcc)), '#f2ead9', 21);
              m.whirlAcc = 0;
            }
          }
        }
      }
      if (w.t >= w.dur) this.whirl = null;
    },

    // 旋风：起手时从身边甩出 3 个小旋风，在地图上无序游走、持续伤害、撞墙/道具回弹
    spawnTornadoes() {
      const w = this.whirl;
      if (!w) return;
      if (!this.tornadoes) this.tornadoes = [];
      // 同屏最多保留 9 个，防止高冷却缩减下无限叠加
      while (this.tornadoes.length > 6) this.tornadoes.shift();
      for (let i = 0; i < 3; i++) {
        const a = (this.whirlSpin || 0) + i * Math.PI * 2 / 3 + U.rand(-0.25, 0.25);
        const d = U.rand(34, 58);
        let x = U.clamp(this.player.x + Math.cos(a) * d, 60, (this.arenaW || 3600) - 60);
        let y = U.clamp(this.player.y + Math.sin(a) * d, 60, (this.arenaH || 3840) - 60);
        // 出生点若落在墙体/道具里（贴着地图边缘起手时可能发生），退回玩家脚下，
        // 否则旋风会在障碍里原地抖动到消失
        if (this.circleWall(x, y, 26) || this.circleProp(x, y, 26)) {
          x = this.player.x;
          y = this.player.y;
        }
        const dir = U.rand(0, Math.PI * 2);
        this.tornadoes.push({
          x, y,
          vx: Math.cos(dir) * 234, vy: Math.sin(dir) * 234,
          t: 0, life: 5, r: 26,
          spin: dir, phase: U.rand(0, Math.PI * 2),
          tick: U.rand(0.05, 0.2), ftick: 0.5, acc: 0,
          turn: U.rand(0.3, 0.8),
          // 游走范围锚点：以出生点为圆心，半径约为原先的两倍
          ox: x, oy: y, roam: 780,
          sk: w.sk, mult: w.mult
        });
        this.addRing(x, y, 8, 44, 'rgba(255,255,255,0.55)', 0.3);
      }
    },

    updateTornadoes(dt) {
      const list = this.tornadoes;
      if (!list || !list.length) return;
      const aw = this.arenaW || 3600, ah = this.arenaH || 3840, SPEED = 234;
      for (let i = list.length - 1; i >= 0; i--) {
        const t = list[i];
        t.t += dt;
        if (t.t >= t.life) { list.splice(i, 1); continue; }
        t.spin += dt * 9.5;
        // 无序游走：每隔 0.3~0.8 秒随机拐一个弯；超出游走范围就往回拐
        t.turn -= dt;
        if (t.turn <= 0) {
          const dx = (t.ox != null ? t.ox : t.x) - t.x;
          const dy = (t.oy != null ? t.oy : t.y) - t.y;
          const roam = t.roam || 780;
          const a = dx * dx + dy * dy > roam * roam * 0.8
            ? Math.atan2(dy, dx) + U.rand(-0.7, 0.7)
            : Math.atan2(t.vy, t.vx) + U.rand(-1.4, 1.4);
          t.vx = Math.cos(a) * SPEED;
          t.vy = Math.sin(a) * SPEED;
          t.turn = U.rand(0.35, 0.85);
        }
        // 回弹：墙壁、场景道具、地图边缘，撞上就反向，继续游走
        const nx = t.x + t.vx * dt;
        if (nx < t.r + 40 || nx > aw - t.r - 40 || this.circleWall(nx, t.y, t.r) || this.circleProp(nx, t.y, t.r)) {
          t.vx = -t.vx;
        } else {
          t.x = nx;
        }
        const ny = t.y + t.vy * dt;
        if (ny < t.r + 40 || ny > ah - t.r - 40 || this.circleWall(t.x, ny, t.r) || this.circleProp(t.x, ny, t.r)) {
          t.vy = -t.vy;
        } else {
          t.y = ny;
        }
        // 持续伤害：每 0.2 秒对范围内敌人结算一次，0.5 秒汇总飘字
        t.tick -= dt;
        if (t.tick <= 0) {
          t.tick += 0.2;
          for (const m of this.monsters) {
            if (m.dead) continue;
            if (U.dist(t, m) > t.r + m.r + 8) continue;
            const r = this.rollHit((t.mult || 1) * 0.05, t.sk, m);
            this.hitMonster(m, r.dmg, r.crit, { quiet: true });
            t.acc += r.dmg;
          }
        }
        t.ftick -= dt;
        if (t.ftick <= 0) {
          t.ftick += 0.5;
          if (t.acc > 0) {
            this.addFloater(t.x + U.rand(-6, 6), t.y - 74, U.fmt(t.acc), '#eef7ff', 19);
            t.acc = 0;
          }
          // 持续伤害也别让怪物“毫无反应”：和旋风斩一样每 0.5 秒补一次闪白
          for (const m of this.monsters) {
            if (m.dead) continue;
            if (U.dist(t, m) <= t.r + m.r + 8) m.flash = Math.max(m.flash, 0.13);
          }
        }
      }
    },

    // 战吼：蓄力到 charge 时刻释放声浪，随后收势；全程占用动作（autoCast 会让位）
    updateRoar(dt) {
      const r = this.roar;
      if (!r) return;
      r.t += dt;
      if (!r.fired && r.t >= r.charge) {
        r.fired = true;
        this.releaseWarcry(r);
      }
      // 回声脉冲：主声浪推开 0.16 秒后再补一圈弱一档的黄色余波
      if (r.fired && !r.echo && r.t >= r.charge + 0.16) {
        r.echo = true;
        this.addRing(this.player.x, this.player.y, 30, r.radius * 0.72, 'rgba(255,233,168,0.7)', 0.42);
        this.effects.push({
          kind: 'roarWave', x: this.player.x, y: this.player.y,
          r0: 40, r1: r.radius * 0.92, color: '#ffd27a', life: 0.5, max: 0.5
        });
        if (DG.audio) DG.audio.play('barbWarcry', { vol: 0.35 });
      }
      if (r.t >= r.total) this.roar = null;
    },

    // 劈砍：刀光扫出后再结算，命中范围与刀光亮部完全一致
    updateChop(dt) {
      const st = this.chopStrike;
      if (!st) return;
      st.t += dt;
      if (st.t < st.delay) return;
      this.chopStrike = null;
      if (this.finished || this.ending || this.player.hp <= 0) return;
      const fx = DG.art.barbarian;
      const arc = fx ? fx.slashArc : this.skillArc(st.sk);
      const reach = fx ? fx.slashReach : st.sk.range;
      for (const m of this.monsters) {
        if (m.dead) continue;
        if (U.dist(this.player, m) > reach + m.r) continue;
        if (U.angleDiff(U.angle(this.player, m), st.ang) > arc / 2) continue;
        const r = this.rollHit(st.mult, st.sk, m);
        // 方向性血幕 + 短时出血，与死亡迸血可同时存在
        this.hitMonster(m, r.dmg, r.crit, { chop: true, angle: st.ang });
      }
    },

    releaseWarcry(r) {
      const sk = r.sk;
      for (const m of this.monsters) {
        if (m.dead) continue;
        if (U.dist(this.player, m) > r.radius + m.r) continue;
        const hit = this.rollHit(r.mult, sk, m);
        this.hitMonster(m, hit.dmg, hit.crit);
        if (m.dead) continue;
        // 恐惧：头顶出现惊恐表情，同时被减速
        m.fear = Math.max(m.fear || 0, 2.4);
        if (r.freeze) {
          m.slow = Math.max(m.slow || 0, 1);
          m.slowFactor = 1;
        } else if (sk.slowDur) {
          m.slow = Math.max(m.slow || 0, r.slowDur);
          m.slowFactor = r.slowFactor;
        }
      }
      // 战吼声浪：三层黄色同心冲击波由内向外扩散并逐渐淡出
      this.addRing(this.player.x, this.player.y, 26, r.radius, '#ffe9a8', 0.34);
      this.addRing(this.player.x, this.player.y, 16, r.radius * 0.84, '#f0b981', 0.5);
      this.addRing(this.player.x, this.player.y, 10, r.radius * 1.08, 'rgba(240,185,129,0.55)', 0.72);
      // 环形光浪：在细环之间补一层填充的黄色亮光，人群里也能看清扩散的声浪
      this.effects.push({
        kind: 'roarWave', x: this.player.x, y: this.player.y,
        r0: 22, r1: r.radius * 1.02, color: '#ffe08a', life: 0.52, max: 0.52
      });
      this.effects.push({
        kind: 'roarWave', x: this.player.x, y: this.player.y,
        r0: 14, r1: r.radius * 1.18, color: '#fff3c4', life: 0.78, max: 0.78
      });
      // 贴身核心闪光：胸口炸开的一团金白亮光，短促刺亮
      this.effects.push({
        kind: 'roarCore', x: this.player.x, y: this.player.y - 30,
        r0: 12, r1: 68, color: '#fff6d8', life: 0.24, max: 0.24
      });
      // 地面尘爆：金色碎屑贴着地面向四周掀开
      for (let i = 0; i < 18; i++) {
        const a = (Math.PI * 2 / 18) * i + U.rand(-0.12, 0.12);
        const sp = U.rand(150, 330);
        this.effects.push({
          kind: 'spark', x: this.player.x + Math.cos(a) * 18, y: this.player.y + Math.sin(a) * 6,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.35 - U.rand(10, 40),
          r: U.rand(1.6, 3.2), color: i % 3 === 0 ? '#fff3c4' : '#f0c98a',
          life: U.rand(0.32, 0.58), max: 0.58
        });
      }
      this.addBurst(this.player.x, this.player.y - 24, '#ffe9a8', 10);
      this.shake = Math.max(this.shake, 0.3);
      // 音效：人声吼叫 + 合成冲击波，两层叠在一起
      if (DG.audio) {
        DG.audio.play('barbWarcry', { vol: 1 });
        if (DG.audio.warcryBurst) DG.audio.warcryBurst();
      }
    },

    autoSkillAngle(sk) {
      const near = this.nearestMonsterInFront();
      const dir = this.moveDirAngle;

      if (sk.type === 'dash') {
        if (sk.damageOnPath) {
          if (!near || U.dist(this.player, near) > sk.dist * 1.4 + near.r) return null;
          return U.angle(this.player, near);
        }
        // 位移保命：有弹道/预警威胁时优先脱离，其次才是血量低或近身敌人多
        const hpPct = this.player.hp / this.player.maxHp;
        const threat = this.autoHardDangerAt(this.player.x, this.player.y);
        const close = this.monsters.filter(m => !m.dead && U.dist(this.player, m) < 150).length;
        if (!threat && hpPct > 0.6 && close < 2) return null;
        // 正在躲技能时沿着躲避方向翻滚/闪现，别往危险里冲
        if (threat && this.autoEvade && this.autoEvade.until > (this.time || 0)) {
          return Math.atan2(this.autoEvade.dir.y, this.autoEvade.dir.x);
        }
        // 移动中沿移动方向翻滚，避免看起来是在往后退
        if (dir != null) return dir;
        if (threat) {
          const away = this.autoRetreatAngle();
          if (away != null) return away;
        }
        if (!near) return null;
        if (U.dist(this.player, near) > 170) return null;
        return U.angle(near, this.player);
      }

      if (!near) return null;
      const radius = sk.radius ? this.skillRadius(sk) : (sk.range || 0);
      if (U.dist(this.player, near) > radius + near.r) return null;
      // 弹道 / 散射：朝能覆盖最多敌人的角度出手
      if (sk.type === 'projectile' || sk.type === 'spread') {
        const cluster = this.autoClusterAngle(sk);
        if (cluster != null) return cluster;
      }
      return U.angle(this.player, near);
    },

    // 在怪物方向里挑命中数最多的角度（多重箭 / 箭雨 / 贯穿弹道尤其受益）
    autoClusterAngle(sk) {
      let best = null, bestHits = 0;
      const seen = [];
      for (const m of this.monsters) {
        if (m.dead) continue;
        const a = U.angle(this.player, m);
        let dup = false;
        for (const s of seen) {
          if (Math.abs(U.angleDiff(a, s)) < 0.08) { dup = true; break; }
        }
        if (dup) continue;
        seen.push(a);
        let hits = 0;
        for (const o of this.monsters) {
          if (!o.dead && this.autoSkillHitsMonster(o, sk, a)) hits++;
        }
        if (hits > bestHits) { bestHits = hits; best = a; }
      }
      return best;
    },
    autoSkillHitsMonster(m, sk, angle) {
      const p = this.player;
      const d = U.dist(p, m);
      const rx = m.x - p.x, ry = m.y - p.y;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      if (sk.type === 'melee') {
        if (d > (sk.range || 84) + m.r) return false;
        return Math.abs(U.angleDiff(U.angle(p, m), angle)) <= this.skillArc(sk) / 2 + Math.atan2(m.r, Math.max(1, d));
      }
      if (sk.type === 'nova' || sk.type === 'aoeSelf') {
        return d <= this.skillRadius(sk) + m.r;
      }
      if (sk.type === 'dash') {
        if (!sk.damageOnPath) return false;
        const len = this.skillDist(sk) || sk.dist || 200;
        const proj = rx * cos + ry * sin;
        if (proj < -m.r || proj > len + m.r) return false;
        return Math.abs(rx * sin - ry * cos) <= 30 + m.r;
      }
      if (sk.type === 'projectile') {
        if (d > (sk.range || 500) + m.r) return false;
        const proj = rx * cos + ry * sin;
        if (proj < 0) return false;
        return Math.abs(rx * sin - ry * cos) <= 26 + m.r;
      }
      if (sk.type === 'spread') {
        if (d > (sk.range || 500) + m.r) return false;
        const n = this.skillCount(sk);
        const cone = n > 1 ? (sk.spread || 0.5) * (n - 1) / 2 : 0;
        return Math.abs(U.angleDiff(U.angle(p, m), angle)) <= cone + 0.18 + Math.atan2(m.r, Math.max(1, d));
      }
      return false;
    },
    autoSkillScore(sk, angle) {
      // 保命位移优先级最高：被预警锁定或残血时立刻脱离
      if (sk.type === 'dash' && !sk.damageOnPath) {
        const threat = this.autoHardDangerAt(this.player.x, this.player.y);
        const hpPct = this.player.hp / this.player.maxHp;
        if (threat) return 1200 + (1 - hpPct) * 600;
        if (hpPct < 0.55) return 300;
        return 0;
      }
      let hits = 0, bossHit = false;
      for (const m of this.monsters) {
        if (m.dead) continue;
        if (!this.autoSkillHitsMonster(m, sk, angle)) continue;
        hits++;
        if (m.boss) bossHit = true;
      }
      if (!hits) return 0;
      const lv = this.char.skills[sk.id] || 1;
      const mult = sk.mult ? sk.mult(lv) : 1;
      let score = hits * mult * 10;
      // 多目标时范围技能更值钱；命中首领额外加分
      if (hits > 1) score += (hits - 1) * 12;
      if (bossHit) score += 40;
      if (sk.type === 'dash') score *= 1.15;
      score -= (sk.energy || 0) * 0.15;
      return score;
    },

    performSkill(sk, lv, source, angle) {
      const ang = (typeof angle === 'number')
        ? angle
        : U.angle(this.player, this.aimPos());
      this.player.facing = ang;
      // 远程技能同样播放拉弓动作
      if (sk.type === 'projectile' || sk.type === 'spread') {
        this.player.atkDur = 0.46;
        this.player.atkAnim = 0.46;
      }
      const mult = sk.mult(lv) * (this._overloadCast ? 2.2 : 1);
      const self = this;

      // 旋风引导期间：挥砍、冲锋与震动波不可同时释放，战吼不受限制
      if (this.whirl && (sk.id === 'cleave' || sk.id === 'charge' || sk.id === 'shockwave')) return;

      // 技能音效：普攻按职业区分，主动技能按技能 id 取解包音频
      if (DG.audio) {
        if (source === 'basic') {
          const basicSfx = sk.classId === 'ranger' ? 'rangerArrow'
            : (sk.classId === 'mage' ? 'skillChargeArc' : 'barbAttack');
          DG.audio.play(basicSfx, { vol: 0.75, rate: 0.96 + Math.random() * 0.08 });
        } else {
          const SFX = {
            whirlwind: 'barbWhirlwind', charge: 'barbCharge', shockwave: 'barbShockwave', warcry: 'barbWarcry',
            multishot: 'rangerMultishot', roll: 'rangerRoll', snipe: 'rangerSnipe', arrowrain: 'rangerArrowrain',
            firebolt: 'skillChargeArc', frostnova: 'skillFrost', blink: 'rangerRoll',
            meteor: 'skillThunder', chainbolt: 'skillThunder'
          };
          // 战吼的声音等到蓄力结束、冲击波释放的那一刻再播
          if (SFX[sk.id] && sk.id !== 'warcry') DG.audio.play(SFX[sk.id], { vol: 0.9 });
        }
      }

      if (this._overloadCast) {
        this.addFloater(this.player.x, this.player.y - 46, '奥能过载', '#c9a7f5', 24);
      }

      if (sk.type === 'melee') {
        // 野蛮人劈砍的刀光由英雄自绘：命中扇形与半径直接取刀光可见亮部的真实参数，
        // 否则会出现“刀光明明扫到敌人却没判中”的错位。其他职业仍用技能配置。
        const fxHero = sk.slashFx ? DG.art.barbarian : null;
        if (fxHero) {
          // 与刀光同步：等刃口真正扫出后再结算，让血幕、数字和刀光落在同一拍。
          // 结算瞬间按当时站位重算，怪物在挥砍过程中走进/走出刀光都能正确判定。
          this.chopStrike = {
            t: 0,
            delay: Math.max(0.08, (this.player.atkDur || 0.46) * 0.34),
            ang, mult, sk
          };
        } else {
          const arc = this.skillArc(sk);
          const hit = [];
          for (const m of this.monsters) {
            if (m.dead) continue;
            const d = U.dist(this.player, m);
            if (d > sk.range + m.r) continue;
            const a = U.angle(this.player, m);
            if (U.angleDiff(a, ang) > arc / 2) continue;
            hit.push(m);
          }
          for (const m of hit) {
            const r = this.rollHit(mult, sk, m);
            this.hitMonster(m, r.dmg, r.crit);
          }
        }
        // 野蛮人劈砍的刀光由英雄模块自己沿斧刃绘制，其他职业仍走程序化弧线
        if (!sk.slashFx) {
          const arc = this.skillArc(sk);
          this.effects.push({
            kind: 'slash', x: this.player.x, y: this.player.y,
            angle: ang, radius: sk.range, arc,
            color: sk.color, life: 0.16, max: 0.16
          });
        }
      } else if (sk.type === 'projectile') {
        this.spawnPlayerProjectile(ang, sk, mult);
        if (sk.classId === 'ranger') this.rangerShotFx(sk, ang, 1);
      } else if (sk.type === 'spread') {
        const n = Math.max(1, this.skillCount(sk));
        const gap = n > 1 ? sk.spread / (n - 1) : 0;
        for (let i = 0; i < n; i++) {
          const offset = (i - (n - 1) / 2) * gap;
          this.spawnPlayerProjectile(ang + offset, sk, mult);
        }
        if (sk.classId === 'ranger') this.rangerShotFx(sk, ang, n);
      } else if (sk.type === 'aoeSelf') {
        const radius = this.skillRadius(sk);
        if (sk.id === 'whirlwind') {
          // 旋风：进入 5 秒持续旋转，期间可自由移动，每 0.1 秒结算一次范围伤害
          // 连续施放（CD 压到 0）时沿用上一次的角度，避免每轮重新起转
          if (!((this.whirlIdleT || 99) < 0.3)) this.whirlChainT = 0;
          // 起手即进入不可阻挡：清掉残余硬直与击退
          this.player.hurtT = 0;
          this.player.kbX = 0;
          this.player.kbY = 0;
          this.whirl = { t: 0, dur: 5, tick: 0.1, ftick: 0.5, radius, sk, mult };
          // 起手甩出 3 个游走旋风
          this.spawnTornadoes();
        } else {
          for (const m of this.monsters) {
            if (m.dead) continue;
            if (U.dist(this.player, m) <= radius + m.r) {
              const r = this.rollHit(mult, sk, m);
              this.hitMonster(m, r.dmg, r.crit);
            }
          }
          this.addRing(this.player.x, this.player.y, 20, radius, sk.color, 0.4);
          this.shake = Math.max(this.shake, 0.16);
        }
      } else if (sk.type === 'nova') {
        const radius = this.skillRadius(sk);
        const slowDur = this.skillSlowDur(sk);
        const slowFactor = this.skillSlowFactor(sk, sk.slow || 0.3);
        const freeze = this.hasTalent('absoluteZero');
        // 战吼：先举斧蓄力，0.42 秒后释放；伤害/减速/恐惧统一在释放瞬间结算
        if (sk.id === 'warcry' && !this.roar) {
          this.roar = { t: 0, charge: 0.42, total: 0.95, radius, mult, sk, slowDur, slowFactor, freeze, fired: false };
          this.player.hurtT = 0;
          this.player.kbX = 0;
          this.player.kbY = 0;
          this.attackCd = Math.max(this.attackCd, 0.7);
          return;
        }
        for (const m of this.monsters) {
          if (m.dead) continue;
          if (U.dist(this.player, m) <= radius + m.r) {
            const r = this.rollHit(mult, sk, m);
            this.hitMonster(m, r.dmg, r.crit);
            if (sk.slowDur && !m.dead) {
              if (freeze) {
                m.slow = Math.max(m.slow, 1);
                m.slowFactor = 1;
              } else {
                m.slow = Math.max(m.slow, slowDur);
                m.slowFactor = slowFactor;
              }
            }
          }
        }
        this.addRing(this.player.x, this.player.y, 24, radius, sk.color, 0.55);
        this.addRing(this.player.x, this.player.y, 10, radius * 0.7, '#cfe9f5', 0.35);
      } else if (sk.type === 'dash') {
        const ox = this.player.x, oy = this.player.y;
        // 分步位移并检测墙体，冲刺不会穿墙；技能树可延长冲锋距离
        const dist = this.skillDist(sk) || sk.dist;
        const steps = Math.max(1, Math.ceil(dist / 12));
        const stepX = Math.cos(ang) * dist / steps;
        const stepY = Math.sin(ang) * dist / steps;
        for (let i = 0; i < steps; i++) {
          this.movePlayer(this.player, stepX, stepY, this.player.r);
        }
        const nx = this.player.x, ny = this.player.y;

        if (sk.damageOnPath) {
          let dashMult = mult;
          if (sk.id === 'charge' && this.hasTalent('breaker')) {
            dashMult *= 2;
            this.talentTimers.chargeCrit = 3;
          }
          for (const m of this.monsters) {
            if (m.dead) continue;
            if (U.distToSegment(m.x, m.y, ox, oy, nx, ny) < m.r + 32) {
              const r = this.rollHit(dashMult, sk, m);
              self.hitMonster(m, r.dmg, r.crit);
            }
          }
          this.addRing(nx, ny, 16, 60, sk.trailColor || sk.color, 0.3);
        }

        // 冲锋：撞晕 + 两道黑色剪影 + 连晕引爆
        if (sk.id === 'charge') {
          // 释放瞬间场上仍有 10 名以上眩晕敌人 → 本次眩晕范围翻倍并引爆
          let stunnedOnField = 0;
          for (const m of this.monsters) if (!m.dead && !m.boss && m.stun > 0) stunnedOnField++;
          const surge = stunnedOnField >= 10;
          const stunR = 50 * (surge ? 2 : 1);

          const ghost = this.chargeGhostImage(this.player.walkPhase || 0, !!this.player.flip);
          const footY = this.player.r * 0.92;
          if (ghost) {
            // 冲锋残影：沿路径等距留 5 个残影，越靠近起点越淡、消失越快，形成速度拖尾
            const ks = [0.12, 0.29, 0.46, 0.63, 0.80];
            for (let i = 0; i < ks.length; i++) {
              const k = ks[i];
              const life = 0.44 + i * 0.05;
              this.effects.push({
                kind: 'chargeGhost', img: ghost,
                x: ox + (nx - ox) * k,
                y: oy + (ny - oy) * k + footY,
                alpha: 0.56 - i * 0.09,
                life, max: life
              });
            }
          }
          // 冲锋速度线：整条路径上两道拖尾光带，再从起点到终点撒一把短线
          const dashLen = Math.hypot(nx - ox, ny - oy);
          this.effects.push({
            kind: 'streak', x: nx, y: ny + footY - 26,
            angle: ang, len: dashLen, w: 15,
            color: 'rgba(255,170,110,0.5)', life: 0.24, max: 0.24
          });
          this.effects.push({
            kind: 'streak', x: nx, y: ny + footY - 26,
            angle: ang, len: dashLen * 0.86, w: 5,
            color: 'rgba(255,226,192,0.85)', life: 0.2, max: 0.2
          });
          for (let i = 0; i < 6; i++) {
            const k = (i + 0.5) / 6;
            this.effects.push({
              kind: 'streak',
              x: ox + (nx - ox) * k,
              y: oy + (ny - oy) * k + footY - 20 + U.rand(-18, 18),
              angle: ang, len: U.rand(26, 70), w: U.rand(1.4, 3),
              color: '#ffb478', life: U.rand(0.16, 0.3), max: 0.3
            });
          }
          this.addRing(ox, oy, 8, 42, '#d99a63', 0.26);

          let stunned = 0;
          for (const m of this.monsters) {
            if (m.dead || m.boss) continue;
            if (U.distToSegment(m.x, m.y, ox, oy, nx, ny) < m.r + stunR) {
              m.stun = Math.max(m.stun || 0, 2);
              m.action = null;
              stunned++;
            }
          }
          // 一次撞晕 5 人 → 冲锋冷却永久 -1 秒（最多 -5 秒）
          if (stunned >= 5) this.chargeCdrBonus = Math.min(5, (this.chargeCdrBonus || 0) + 1);

          if (surge) {
            for (const m of this.monsters) {
              if (m.dead) continue;
              if (U.dist(m, this.player) < 160 + m.r) {
                const r = self.rollHit(mult * 1.5, sk, m);
                self.hitMonster(m, r.dmg, r.crit);
              }
            }
            this.addRing(nx, ny, 20, 160, '#ff9a4d', 0.45);
            this.addBurst(nx, ny, '#ffb765', 20);
          }
        }

        if (sk.id === 'charge' && this.hasTalent('chargeHaste')) this.talentTimers.chargeHaste = 3;
        if (sk.id === 'roll') {
          if (this.hasTalent('rollHaste')) this.talentTimers.rollHaste = 3;
          if (this.hasTalent('shadowStep')) {
            this.fireShadowStep();
            // 影步：翻滚路径留下三个阶段残像
            for (let i = 1; i <= 3; i++) {
              const k = i / 4;
              this.effects.push({
                kind: 'afterimage',
                x: ox + (nx - ox) * k,
                y: oy + (ny - oy) * k + this.player.r * 0.92,
                flip: !!this.player.flip,
                phase: (this.player.walkPhase || 0) - k * 2,
                life: 0.22 + i * 0.05, max: 0.22 + i * 0.05
              });
            }
          }
          // 翻滚残影：沿位移轨迹留下速度线，强调轻盈的游侠身法
          for (let i = 0; i < 7; i++) {
            const k = i / 6;
            this.effects.push({
              kind: 'streak',
              x: ox + (nx - ox) * k + U.rand(-9, 9),
              y: oy + (ny - oy) * k + U.rand(-11, 11),
              angle: ang, len: U.rand(20, 44), w: U.rand(1.2, 2.6),
              color: '#bfe0c2', life: U.rand(0.18, 0.34), max: 0.34
            });
          }
          this.addRing(ox, oy, 10, 42, '#9fc0a8', 0.3);
          this.effects.push({
            kind: 'rollMark', x: (ox + nx) / 2, y: (oy + ny) / 2,
            angle: ang, len: Math.hypot(nx - ox, ny - oy) * 0.7,
            color: sk.fx && sk.fx.markColor || sk.trailColor, life: 0.38, max: 0.38
          });
        }

        this.addBurst(ox, oy, sk.trailColor || sk.color, 8);
        let invuln = sk.invuln || 0;
        if (sk.id === 'roll' && this.hasTalent('rollInvuln')) invuln += 0.3;
        this.player.invuln = Math.max(this.player.invuln, invuln);
        this.addBurst(nx, ny, sk.trailColor || sk.color, 6);
      }

      void source;
    },

    // 影步：翻滚结束向最近敌人射出 3 支穿透箭
    fireShadowStep() {
      const near = this.nearestMonsterInFront(560);
      if (!near) return;
      const base = U.angle(this.player, near);
      const shot = Object.assign({}, this.basicSkill, { pierce: 1 });
      for (let i = -1; i <= 1; i++) {
        this.spawnPlayerProjectile(base + i * 0.09, shot, 1.2, { variant: 'shadow' });
      }
      this.effects.push({
        kind: 'slash', x: this.player.x, y: this.player.y, angle: base,
        radius: 42, arc: 0.5, color: '#9fc0a8', life: 0.16, max: 0.16
      });
    },

    // 游侠出手特效：穿云箭蓄力白光 / 多重箭与箭雨的扇形弓口闪光、草地碎屑
    rangerShotFx(sk, ang, n) {
      const px = this.player.x, py = this.player.y;
      const mz = this.muzzlePoint(ang, 26);
      const mx = mz.x;
      const my = mz.y;
      if (sk.id === 'snipe') {
        this.addRing(px, py, 6, 36, '#f6ffdf', 0.24);
        this.addBurst(mx, my, '#f6ffdf', 7);
        this.effects.push({
          kind: 'slash', x: mx, y: my, angle: ang, radius: 36,
          arc: 0.6, color: '#f6ffdf', life: 0.15, max: 0.15
        });
        this.effects.push({
          kind: 'snipeCharge', x: mx, y: my, angle: ang,
          color: '#f6ffdf', life: 0.2, max: 0.2
        });
        this.shake = Math.max(this.shake, 0.1);
      } else if (n > 1) {
        const rain = sk.id === 'arrowrain';
        this.effects.push({
          kind: 'slash', x: mx, y: my, angle: ang,
          radius: rain ? 54 : 44, arc: sk.spread + 0.18,
          color: rain ? '#c2dbaa' : '#d6ecc0',
          life: 0.2, max: 0.2
        });
        this.addBurst(mx, my, rain ? '#c2dbaa' : '#d6ecc0', rain ? 8 : 4);
        if (rain) {
          const dist = 260;
          this.effects.push({
            kind: 'arrowRainMarker', x: px + Math.cos(ang) * dist, y: py + Math.sin(ang) * dist,
            angle: ang, radius: 86, arc: sk.spread, color: '#c2dbaa', life: 0.34, max: 0.34
          });
        }
        if (rain) this.shake = Math.max(this.shake, 0.07);
      }
    },

    // 玩家出手点：优先取角色美术给出的弓上箭尖位置（随武器转动、出手前伸而移动），
    // 美术没提供时才退回腰部高度的兜底，绝不会再从角色脚下冒出。
    muzzlePoint(ang, dist) {
      const p = this.player;
      const a = ang || 0;
      const hero = this.cls && DG.art.heroFor ? DG.art.heroFor(this.cls.id) : null;
      if (hero && hero.muzzle) {
        const m = hero.muzzle(p, this);
        if (m) return { x: p.x + m.x, y: p.y + p.r * 0.92 + m.y };
      }
      const d = dist == null ? 14 : dist;
      return {
        x: p.x + Math.cos(a) * d,
        y: p.y + p.r * 0.92 - 22 + Math.sin(a) * d * 0.5
      };
    },

    spawnPlayerProjectile(ang, sk, mult, opt) {
      const speed = sk.speed || 600;
      const life = (sk.range || 600) / speed + 0.06;
      const mz = this.muzzlePoint(ang, 14);
      this.projectiles.push({
        team: 'player',
        x: mz.x,
        y: mz.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        r: 5,
        mult,
        skill: sk,
        color: sk.color,
        variant: opt && opt.variant || sk.fx && sk.fx.variant || '',
        impact: sk.fx && sk.fx.impact || '',
        life, maxLife: life,
        pierce: this.skillPierce(sk),
        hit: []
      });
      this.addBurst(this.player.x + Math.cos(ang) * 22, this.player.y + Math.sin(ang) * 22, sk.color, sk.id === 'snipe' ? 5 : 3);
    }
  });
})();


;
/* ==== js/scenes/dungeon/drops.js ==== */
/* 副本战斗 · 掉落层：装备 / 恢复球 / 符文的拾取与结算 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  Object.assign(DG.scenes.dungeon.prototype, {
  updateDrops(dt) {
    // 原地压缩：避免每帧重建掉落数组
    const list = this.drops;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      d.t += dt;
      const dist = Math.hypot(this.player.x - d.x, this.player.y - d.y);
      if (dist < 44 + this.player.r && this.pickup(d)) continue;
      list[n++] = d;
    }
    list.length = n;
  },
  pickup(d) {
    if (d.kind === 'item') {
      if (DG.character.bagUsed(this.char) >= DG.CONFIG.BAG_SIZE) {
        if (this.bagWarnCd <= 0) {
          DG.ui.toast('背包已满，无法拾取新的装备', 'danger');
          this.bagWarnCd = 3;
        }
        return false;
      }
      this.char.bag.push(d.item);
      this.items.push(d.item);
      if (DG.quests) DG.quests.progress(this.char, 'loot', 1);
      if (DG.audio) DG.audio.play('stageEquip', { vol: 0.7 });
      DG.game.save();
      const hot = d.item.rarity === 'legend' || d.item.rarity === 'set';
      DG.ui.toast(`拾取：${d.item.name}`, hot ? 'gold' : 'blue');
      this.updateHud();
      return true;
    }
    if (d.kind === 'orb') {
      const heal = Math.round(this.player.maxHp * 0.2);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      if (DG.audio) DG.audio.play('stagePickup', { vol: 0.7 });
      this.addFloater(this.player.x, this.player.y - 38, `+${heal}`, '#7fd08a', 22);
      this.addBurst(d.x, d.y, '#ff5a4a', 8);
      return true;
    }
    if (d.kind === 'rune') {
      this.applyRune();
      return true;
    }
    return true;
  },
  applyRune() {
    const ids = [this.cls.autoSkill, ...this.cls.skills];
    const upgradable = ids.filter(id => (this.char.skills[id] || 1) < DG.CONFIG.MAX_SKILL_LEVEL);
    if (!upgradable.length) {
      this.goldEarned += 20;
      DG.ui.toast('技能符文转化为 20 金币', 'gold');
      return;
    }
    const id = U.pick(upgradable);
    const lv = this.char.skills[id] || 1;
    this.char.skills[id] = lv + 1;
    const sk = DG.data.skills[id];
    this.skillUps.push(`${sk.name} Lv.${lv + 1}`);
    DG.game.save();
    DG.ui.toast(`技能提升：${sk.name} Lv.${lv + 1}`, 'blue');
    this.addFloater(this.player.x, this.player.y - 42, '技能成长', '#9fc0e8', 24);
    this.addBurst(this.player.x, this.player.y, '#9fc0e8', 10);
  }
  });
})();


;
/* ==== js/scenes/dungeon/render.js ==== */
/* 副本战斗 · 渲染层：地面、单位、特效与屏幕遮罩 */
(function () {
  const DG = window.DG;
  const U = DG.util;
  const { W, H, ARENA_W, ARENA_H } = DG.scenes.dungeon.size;

  // 把 #rrggbb 拆成带透明度的 rgba，用于拖尾/光束渐变
  function withAlpha(hex, a) {
    if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // 游侠箭矢视觉参数：按技能区分箭身大小、拖尾长度与光晕强度
  const RANGER_ARROW = {
    arrow:     { scale: 1.08, trail: 52,  width: 3.0, color: '#e8f4cd', glow: 0 },
    multishot: { scale: 0.98, trail: 42,  width: 2.5, color: '#d6ecc0', glow: 0 },
    snipe:     { scale: 1.52, trail: 172, width: 6.8, color: '#f6ffdf', glow: 0 },
    arrowrain: { scale: 1.08, trail: 88,  width: 2.8, color: '#c2dbaa', glow: 0 }
  };

  function shapePath(ctx, shape, r) {
  ctx.beginPath();
  if (shape === 'triangle') {
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r, r * 0.85);
    ctx.lineTo(-r, r * 0.85);
  } else if (shape === 'square') {
    ctx.rect(-r, -r, r * 2, r * 2);
  } else if (shape === 'diamond') {
    ctx.moveTo(0, -r * 1.2);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r * 1.2);
    ctx.lineTo(-r, 0);
  } else if (shape === 'hex') {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  } else {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.closePath();
  }

  Object.assign(DG.scenes.dungeon.prototype, {
  draw() {
    const ctx = this.ctx;
    // 渲染倍率：弱设备降分辨率时按倍率缩放逻辑坐标系，所有绘制自动变轻
    const rs = (DG.game && DG.game.renderScale) || 1;
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    ctx.fillStyle = '#0d1411';
    ctx.fillRect(0, 0, W, H);

    let sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = U.rand(-5, 5) * this.shake * 2;
      sy = U.rand(-5, 5) * this.shake * 2;
    }

    ctx.save();
    const z = this.zoom || 1;
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(z, z);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.drawGround(ctx);
    // 血迹贴地：在所有掉落、特效与怪物之下
    this.drawBlood(ctx);
    // 场地机制与天气地形贴地绘制（火圈/血泊/草丛/枫叶堆/水洼）
    this.drawFieldGround(ctx);
    // 贴地骨头：压在血迹之上、所有实体之下
    this.drawBones(ctx);
    this.drawChests(ctx);
    this.drawDrops(ctx);
    this.drawMoveTarget(ctx);
    // 首领预警类特效贴地绘制，避免盖住角色
    this.drawEffects(ctx, true);
    // 贴地贴花永远压在地面之上、角色之下
    this.drawSceneProps(ctx, 'inside', 'ground');
    // 黑域剪影是地图外的背景：贴着边界摆放后可能和角色的头顶/身体在屏幕上重叠，
    // 画在角色与怪物之下，保证资源永远不会“盖住角色”
    this.drawSceneProps(ctx, 'outside');
    // 按脚底 y 深度排序，玩家夹在前后两层之间：
    // 后排怪物永远不会盖住前排，杜绝“骑在头上”的错觉
    this.sortMonstersForDraw();
    this.drawPropBand(ctx, -Infinity, this.player.y);
    this.drawPlayer(ctx);
    this.drawPropBand(ctx, this.player.y, Infinity);
    this.drawMonsterBars(ctx);
    this.drawFearIcons(ctx);
    this.drawProjectiles(ctx);
    this.drawEffects(ctx, false);
    this.drawFloaters(ctx);

    ctx.restore();

    // 天气：在实体/特效之上、暗角与受击红闪之下，保证战斗信息优先
    this.drawWeather(ctx);
    // 场地视野压制与隐匿提示：压在天气之后、UI 之前
    this.drawFieldOverlay(ctx);
    this.drawScreenOverlay(ctx);
  },
  // 世界坐标下的可视矩形（含 margin 余量），用于剔除屏幕外的单位/掉落/特效
  viewRect(margin) {
    const z = this.zoom || 1;
    const m = margin || 0;
    return {
      l: this.camera.x - W / (2 * z) - m,
      r: this.camera.x + W / (2 * z) + m,
      t: this.camera.y - H / (2 * z) - m,
      b: this.camera.y + H / (2 * z) + m
    };
  },
  // 发光贴图缓存：用预渲染径向渐变代替逐帧 shadowBlur（手机端 shadowBlur 很贵）
  glowSprite(color) {
    if (!this._glowCache) this._glowCache = new Map();
    let g = this._glowCache.get(color);
    if (g) return g;
    const R = 32;
    const c = document.createElement('canvas');
    c.width = c.height = R * 2;
    const cx = c.getContext('2d');
    const rg = cx.createRadialGradient(R, R, 0, R, R, R);
    rg.addColorStop(0, withAlpha(color, 0.9));
    rg.addColorStop(0.35, withAlpha(color, 0.34));
    rg.addColorStop(1, withAlpha(color, 0));
    cx.fillStyle = rg;
    cx.fillRect(0, 0, R * 2, R * 2);
    this._glowCache.set(color, c);
    return c;
  },
  drawMoveTarget(ctx) {
    if (!this.moveTarget) return;
    const r = 9 + Math.sin(this.time * 7) * 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(201,162,95,.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.moveTarget.x, this.moveTarget.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(227,200,142,.9)';
    ctx.beginPath();
    ctx.arc(this.moveTarget.x, this.moveTarget.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  // 进图时预热地块贴图：显存有限，手机端只烘焙出生点附近的若干块，
  // 其余在接近时再补，避免一次性占满低端机纹理内存。
  bakeTerrain() {
    if (this._terrainBaked) return;
    this._terrainBaked = true;
    this._chunkCache = new Map();
    const n = (this.chunks || []).length;
    if (!n) return;
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    const T = DG.scenes.dungeon.terrain;
    // 手机端按 1.1 倍烘焙（缩放后仍清晰），四周出血缩短到半格，单块约 4.4MB
    this._chunkK = coarse ? 1.1 : 1.25;
    this._chunkM = coarse ? 20 : 40;
    // 手机端最多常驻 6 块（约 27MB），桌面端仍全部常驻
    this._chunkCap = coarse ? Math.min(n, 6) : n;
    this._chunkScanT = 0;
    // 按距出生点由近到远预热，保证开局视野内的地块已经就绪
    const px = this.player.x, py = this.player.y;
    const order = this.chunks.map((ch, i) => {
      const cx = ch.px + ch.w * T.TILE / 2, cy = ch.py + ch.h * T.TILE / 2;
      return { i, d: Math.abs(cx - px) + Math.abs(cy - py) };
    }).sort((a, b) => a.d - b.d);
    const warm = Math.min(order.length, this._chunkCap);
    for (let k = 0; k < warm; k++) {
      const tex = this.terrainChunkCanvas(order[k].i);
      if (tex) this.warmChunkTex(tex);
    }
    this._warmCanvas = null;
    this._warmCtx = null;
  },
  // 手机端按需补块：玩家接近未缓存地块时才烘焙，最多每 0.4 秒一块，
  // 既不会在战斗中连续掉帧，也不会让贴图缓存无限增长。
  maybePrefetchChunk(dt) {
    if (!this._chunkCache) return;
    this._chunkScanT = (this._chunkScanT || 0) + dt;
    if (this._chunkScanT < 0.4) return;
    this._chunkScanT = 0;
    const ci = this.nearestMissingChunk(1100);
    if (ci < 0) return;
    // 缓存已满时先淘汰离玩家最远的一块，把位置让给即将进入的区域
    while (this._chunkCache.size >= this._chunkCap) {
      if (!this.evictFarthestChunk()) break;
    }
    this.terrainChunkCanvas(ci);
  },
  evictFarthestChunk() {
    if (!this._chunkCache || !this._chunkCache.size) return false;
    const T = DG.scenes.dungeon.terrain;
    const px = this.player.x, py = this.player.y;
    let farKey = null, farD = -1;
    for (const ci of this._chunkCache.keys()) {
      const ch = this.chunks[ci];
      if (!ch) continue;
      const cx = ch.px + ch.w * T.TILE / 2, cy = ch.py + ch.h * T.TILE / 2;
      const d = Math.abs(cx - px) + Math.abs(cy - py);
      if (d > farD) { farD = d; farKey = ci; }
    }
    if (farKey == null) return false;
    this._chunkCache.delete(farKey);
    return true;
  },
  nearestMissingChunk(range) {
    const T = DG.scenes.dungeon.terrain;
    const px = this.player.x, py = this.player.y;
    let best = -1, bestD = range;
    for (const ch of this.chunks) {
      if (this._chunkCache.has(ch.index)) continue;
      const left = ch.px, top = ch.py;
      const right = left + ch.w * T.TILE, bottom = top + ch.h * T.TILE;
      const dx = Math.max(0, left - px, px - right);
      const dy = Math.max(0, top - py, py - bottom);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = ch.index; }
    }
    return best;
  },
  // 以 1:1 画一次，促使显卡真正建立纹理；否则首次 drawImage 仍会在战斗帧里付这笔钱
  warmChunkTex(tex) {
    if (!this._warmCanvas) {
      const c = document.createElement('canvas');
      c.width = tex.width;
      c.height = tex.height;
      this._warmCanvas = c;
      this._warmCtx = c.getContext('2d');
    }
    this._warmCtx.drawImage(tex, 0, 0);
  },
  terrainChunkCanvas(ci) {
    if (!this._chunkCache) this._chunkCache = new Map();
    let tex = this._chunkCache.get(ci);
    if (tex) {
      // 命中即刷新 LRU 顺序
      this._chunkCache.delete(ci);
      this._chunkCache.set(ci, tex);
      return tex;
    }
    tex = this.bakeChunk(ci);
    this._chunkCache.set(ci, tex);
    // 正常流程下进图时已把全图烘完（cap = 块数），这里只是兜底：
    // 万一有块被淘汰，控制缓存上限，避免无限增长
    const cap = this._chunkCap || 6;
    while (this._chunkCache.size > cap) {
      this._chunkCache.delete(this._chunkCache.keys().next().value);
    }
    return tex;
  },
  bakeChunk(ci) {
    const T = DG.scenes.dungeon.terrain;
    const TILE = T.TILE;
    const ch = this.chunks[ci];
    const K = this._chunkK || 1.25;   // 略高于世界像素密度，缩放后不发糊
    const M = this._chunkM || TILE;   // 四周出血，消除块与块之间的接缝
    const cw = ch.w * TILE, chh = ch.h * TILE;
    const ox = ch.px - M, oy = ch.py - M;
    const w = cw + M * 2, h = chh + M * 2;
    const c = document.createElement('canvas');
    c.width = Math.round(w * K);
    c.height = Math.round(h * K);
    const g = c.getContext('2d');
    g.setTransform(K, 0, 0, K, 0, 0);
    g.translate(-ox, -oy);

    const st = this.mapStyle || T.STYLES.grove;
    if (!this._outline) return c;

    // 地面：只处理本块范围，再裁剪进全局平滑轮廓
    g.save();
    g.beginPath();
    g.rect(ox, oy, w, h);
    g.clip();
    g.clip(this._outline, 'evenodd');
    g.fillStyle = st.ground || (st.floor && st.floor[0]) || '#3d3b23';
    g.fillRect(ox, oy, w, h);
    this.drawChunkGroundArt(g, ch, ox, oy, w, h);
    for (const r of this.rooms) {
      if (r.cx + 600 < ox || r.cx - 600 > ox + w || r.cy + 600 < oy || r.cy - 600 > oy + h) continue;
      const rad = Math.max(r.w, r.h) * TILE * 0.72;
      const rg = g.createRadialGradient(r.cx, r.cy, rad * 0.15, r.cx, r.cy, rad);
      rg.addColorStop(0, st.accent);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(r.cx, r.cy, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // 平滑岩壁轮廓：只在地面内侧做渐暗与墨线收口，
    // 描边全部裁进轮廓内部，不再向墙外溢出第二道边
    g.save();
    g.beginPath();
    g.rect(ox, oy, w, h);
    g.clip();
    g.clip(this._outline, 'evenodd');
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 24;
    g.stroke(this._outline);
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 9;
    g.stroke(this._outline);
    g.strokeStyle = 'rgba(10,10,6,0.82)';
    g.lineWidth = 3.2;
    g.stroke(this._outline);
    g.strokeStyle = st.edge;
    g.lineWidth = 1.3;
    g.stroke(this._outline);
    g.restore();

    // 地面色斑与边缘氛围装饰：只画落在本块范围内的
    g.save();
    g.beginPath();
    g.rect(ox, oy, w, h);
    g.clip();
    for (const d of this.decor) {
      if (d.x < ox - 220 || d.x > ox + w + 220 || d.y < oy - 220 || d.y > oy + h + 220) continue;
      if (d.fog) {
        const fg = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 7);
        fg.addColorStop(0, `rgba(150, 170, 160, ${d.alpha})`);
        fg.addColorStop(1, 'rgba(120, 140, 130, 0)');
        g.fillStyle = fg;
        g.beginPath();
        g.arc(d.x, d.y, d.r * 7, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = 'rgba(255,255,255,0.028)';
        g.beginPath();
        const pts = 6;
        for (let i = 0; i < pts; i++) {
          const a = d.seed + (i / pts) * Math.PI * 2;
          const rr = d.r * (0.7 + (i % 3) * 0.18);
          const px = d.x + Math.cos(a) * rr;
          const py = d.y + Math.sin(a) * rr;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
      }
    }
    g.restore();
    return c;
  },
  // 块内卡通地面：大色块 + 稀疏草叶，用块序号做确定性抖动，缓存复用不跳变
  drawChunkGroundArt(g, ch, ox, oy, w, h) {
    const T = DG.scenes.dungeon.terrain;
    const TILE = T.TILE, hash2 = T.hash2;
    const st = this.mapStyle;
    // 色斑按世界网格生成：相邻地块在重叠区画出的图案完全一致，
    // 拼接时后画的块不会在交界处留下色差竖线
    const CELL = 160;
    const gx0 = Math.floor(ox / CELL) - 1, gx1 = Math.ceil((ox + w) / CELL);
    const gy0 = Math.floor(oy / CELL) - 1, gy1 = Math.ceil((oy + h) / CELL);
    for (let cy = gy0; cy <= gy1; cy++) {
      for (let cx = gx0; cx <= gx1; cx++) {
        const s1 = hash2(cx * 31 + 7, cy * 17 + 3);
        const s2 = hash2(cx * 13 + 5, cy * 29 + 11);
        const s3 = hash2(cx * 7 + 9, cy * 23 + 1);
        const x = (cx + s1) * CELL;
        const y = (cy + s2) * CELL;
        const r = 60 + s3 * 150;
        g.fillStyle = hash2(cx * 3 + 1, cy * 5 + 2) > 0.55 ? st.groundHi : st.groundLo;
        const n = 7;
        const rot = hash2(cx * 11 + 3, cy * 19 + 7) * Math.PI * 2;
        const pts = [];
        for (let k = 0; k < n; k++) {
          const a = rot + (k / n) * Math.PI * 2;
          const rr = r * (0.7 + hash2(cx * 23 + k, cy * 41 + k * 7) * 0.55);
          pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.78 });
        }
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let k = 0; k < n; k++) {
          const p = pts[(k + 1) % n];
          const q = pts[(k + 2) % n];
          g.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
        }
        g.closePath();
        g.fill();
      }
    }

    g.strokeStyle = st.mark || 'rgba(47,68,42,0.5)';
    g.lineWidth = 2;
    g.lineCap = 'round';
    // 草叶记号同样用世界网格，保证跨块连续
    const MK = 96;
    const mx0 = Math.floor(ox / MK) - 1, mx1 = Math.ceil((ox + w) / MK);
    const my0 = Math.floor(oy / MK) - 1, my1 = Math.ceil((oy + h) / MK);
    for (let cy = my0; cy <= my1; cy++) {
      for (let cx = mx0; cx <= mx1; cx++) {
        if (hash2(cx * 53 + 3, cy * 37 + 9) < 0.28) continue;
        const x = (cx + hash2(cx * 17 + 1, cy * 43 + 5)) * MK;
        const y = (cy + hash2(cx * 29 + 7, cy * 19 + 3)) * MK;
        if (!this.isFloorTile(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x - 1, y - 6, x - 3, y - 10);
        g.moveTo(x + 3, y);
        g.quadraticCurveTo(x + 3, y - 7, x + 3, y - 12);
        g.moveTo(x + 6, y);
        g.quadraticCurveTo(x + 7, y - 5, x + 9, y - 8);
        g.stroke();
      }
    }
  },
  drawGround(ctx) {
    const T = DG.scenes.dungeon.terrain;
    const TILE = T.TILE, COLS = T.COLS, ROWS = T.ROWS;
    const cam = this.camera;
    const z = this.zoom || 1;
    const left = cam.x - W / (2 * z) - TILE * 2;
    const right = cam.x + W / (2 * z) + TILE * 2;
    const top = cam.y - H / (2 * z) - TILE * 2;
    const bottom = cam.y + H / (2 * z) + TILE * 2;

    // 场景外与岩壁：纯黑，不加任何材质
    ctx.fillStyle = '#000';
    ctx.fillRect(left, top, right - left, bottom - top);

    // 只绘制视野覆盖到的地块。剔除按地块自身范围判断，不额外放大：
    // 地块纹理已自带 1 格出血，放大剔除范围会多带出上下两排地块，
    // 使同屏地块数超过缓存上限，导致每帧反复重烘焙、帧率骤降
    const M = TILE;
    for (const ch of this.chunks || []) {
      const cw = ch.w * TILE, chh = ch.h * TILE;
      if (ch.px > right || ch.px + cw < left || ch.py > bottom || ch.py + chh < top) continue;
      const tex = this.terrainChunkCanvas(ch.index);
      if (tex) ctx.drawImage(tex, ch.px - M, ch.py - M, cw + M * 2, chh + M * 2);
    }

    // 探索迷雾：低分辨率迷雾贴图放大插值，得到柔和的连续雾层
    if (this._fogCanvas) {
      const tx0 = Math.max(0, Math.floor(left / TILE));
      const tx1 = Math.min(COLS - 1, Math.floor(right / TILE));
      const ty0 = Math.max(0, Math.floor(top / TILE));
      const ty1 = Math.min(ROWS - 1, Math.floor(bottom / TILE));
      const sw = tx1 - tx0 + 1;
      const sh = ty1 - ty0 + 1;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        this._fogCanvas,
        tx0, ty0, sw, sh,
        tx0 * TILE, ty0 * TILE, sw * TILE, sh * TILE
      );
      ctx.restore();
    }

    // 地图边缘：地面与迷雾一起向内渐隐到纯黑，抵达边界时不会出现硬切边。
    // 用一张低分辨率边框渐变贴图整体拉伸，只有靠近边界时才绘制。
    const ef = this.edgeFadeTex();
    const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
    if (ef && right > -ef.pad && left < aw + ef.pad && bottom > -ef.pad && top < ah + ef.pad) {
      ctx.drawImage(ef.canvas, -ef.pad, -ef.pad, aw + ef.pad * 2, ah + ef.pad * 2);
    }
  },
  // 边缘渐隐贴图：场景外 PAD 内为纯黑，沿四条边向内 BAND 像素淡出为透明
  edgeFadeTex() {
    const aw = this.arenaW || ARENA_W, ah = this.arenaH || ARENA_H;
    const old = this._edgeFade;
    if (old && old.aw === aw && old.ah === ah) return old;
    const PAD = 72, BAND = 240, K = 6;
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round((aw + PAD * 2) / K));
    c.height = Math.max(2, Math.round((ah + PAD * 2) / K));
    const g = c.getContext('2d');
    const px = PAD / K, band = BAND / K;
    const w = c.width, h = c.height;
    // 每条边一条 From 黑 To 透明的线性渐变；四角叠加两层，过渡更自然
    const bandStroke = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,0.99)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0.62)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(rx, ry, rw, rh);
    };
    bandStroke(0, 0, px + band, 0, 0, 0, px + band, h);
    bandStroke(w, 0, w - px - band, 0, w - px - band, 0, px + band, h);
    bandStroke(0, 0, 0, px + band, 0, 0, w, px + band);
    bandStroke(0, h, 0, h - px - band, 0, h - px - band, w, px + band);
    this._edgeFade = { canvas: c, aw, ah, pad: PAD };
    return this._edgeFade;
  },
  // 未探索区域不画装饰：避免道具浮在黑色迷雾里，看起来像悬空
  propHidden(p) {
    if (p.zone !== 'inside' || !this.explored) return false;
    const T = DG.scenes.dungeon.terrain;
    const tx = Math.floor(p.x / T.TILE), ty = Math.floor(p.y / T.TILE);
    return !this.explored[ty * T.COLS + tx];
  },
  // 立件、怪物与龙卷风按脚底 y 交错绘制：站在谁前面就盖住谁，不会出现踩头
  drawPropBand(ctx, minY, maxY) {
    const AD = DG.art && DG.art.terrainDecor;
    const art = !!(AD && AD.ready());
    const v = art ? this.viewRect(360) : null;
    // 复用同一个数组：每帧两次调用不再各自分配
    const list = this._bandList || (this._bandList = []);
    list.length = 0;
    if (art) {
      for (const p of this.sceneProps || []) {
        if (p.destroyed || p.zone !== 'inside' || (p.layer || 'prop') !== 'prop') continue;
        if (p.y <= minY || p.y > maxY) continue;
        if (p.x < v.l || p.x > v.r || p.y < v.t || p.y > v.b) continue;
        if (this.propHidden(p)) continue;
        list.push(p);
      }
    }
    // 游走旋风以脚底 y 并入同一批立件排序，避免高柱身盖到身前的怪物头上
    for (const t of this.tornadoes || []) {
      if (t.y <= minY || t.y > maxY) continue;
      list.push({ tornado: t, y: t.y });
    }
    if (!list.length) { this.drawMonsters(ctx, maxY, minY, v); return; }
    list.sort((a, b) => a.y - b.y);
    let from = minY;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      this.drawMonsters(ctx, it.y, from, v);
      if (it.tornado) this.drawTornado(ctx, it.tornado);
      else AD.draw(ctx, it);
      from = it.y;
    }
    this.drawMonsters(ctx, maxY, from, v);
  },
  drawSceneProps(ctx, layer, sub) {
    const AD = DG.art && DG.art.terrainDecor;
    if (!AD || !AD.ready()) return;
    const v = this.viewRect(360);
    for (const p of this.sceneProps || []) {
      if (p.destroyed || p.zone !== layer) continue;
      if (sub && (p.layer || 'prop') !== sub) continue;
      if (this.propHidden(p)) continue;
      if (p.x < v.l || p.x > v.r || p.y < v.t || p.y > v.b) continue;
      AD.draw(ctx, p);
    }
  },
  drawChests(ctx) {
    const v = this.viewRect(80);
    for (const c of this.chests || []) {
      if (c.x < v.l || c.x > v.r || c.y < v.t || c.y > v.b) continue;
      ctx.save();
      ctx.translate(c.x, c.y);

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 9, 18, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      if (!c.opened) {
        const pulse = 0.5 + Math.sin(this.time * 3 + c.x * 0.01) * 0.5;
        ctx.strokeStyle = `rgba(227,200,142,${0.16 + pulse * 0.24})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -2, 24 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 箱体
      ctx.fillStyle = c.opened ? '#3a2c1c' : '#6b4a26';
      ctx.strokeStyle = '#2a1c10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-16, -6, 32, 16);
      ctx.fill();
      ctx.stroke();

      // 箱盖：未开启是拱形盖，开启后向上翻开
      ctx.fillStyle = c.opened ? '#2f2418' : '#7d572d';
      ctx.beginPath();
      if (c.opened) {
        ctx.moveTo(-16, -6);
        ctx.lineTo(-13, -18);
        ctx.lineTo(17, -18);
        ctx.lineTo(16, -6);
      } else {
        ctx.moveTo(-16, -6);
        ctx.quadraticCurveTo(0, -19, 16, -6);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 金属包边
      ctx.strokeStyle = c.opened ? 'rgba(160,130,80,.5)' : '#e3c88e';
      ctx.lineWidth = 2;
      const top = c.opened ? -18 : -13;
      ctx.beginPath();
      ctx.moveTo(-6, top);
      ctx.lineTo(-6, 10);
      ctx.moveTo(6, top);
      ctx.lineTo(6, 10);
      ctx.stroke();

      ctx.restore();
    }
  },
  drawDrops(ctx) {
    const v = this.viewRect(60);
    for (const d of this.drops) {
      if (d.x < v.l || d.x > v.r || d.y < v.t || d.y > v.b) continue;
      const bob = Math.sin(d.t * 4) * 3;
      if (d.kind === 'item') {
        const rar = DG.items.rarityInfo(d.item);
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        const gr = (d.item.rarity === 'legend' ? 26 : d.item.rarity === 'set' ? 22 : 18) *
          (d.item.ancient ? 1.2 : 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.glowSprite(rar.color), -gr, -gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = rar.color;
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = 'rgba(10,12,14,0.75)';
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      } else if (d.kind === 'orb') {
        // 血球：红色、大而醒目，靠近自动回血
        const pulse = 0.5 + Math.sin(d.t * 5) * 0.5;
        const coreR = 19 + Math.sin(d.t * 5) * 1.5;
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        // 地面血色光晕
        ctx.globalCompositeOperation = 'lighter';
        const gr = 46 + pulse * 10;
        ctx.drawImage(this.glowSprite('#ff3b30'), -gr, -gr, gr * 2, gr * 2);
        // 呼吸提示环：让血球在杂乱地面上一眼可见
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(255,86,72,${0.5 - pulse * 0.28})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 27 + pulse * 11, 0, Math.PI * 2);
        ctx.stroke();
        // 球体：内亮外暗的红色径向渐变
        const rg = ctx.createRadialGradient(-coreR * 0.35, -coreR * 0.4, coreR * 0.15, 0, 0, coreR);
        rg.addColorStop(0, '#ff8a7a');
        rg.addColorStop(0.45, '#e03024');
        rg.addColorStop(1, '#7d0b06');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, 0, coreR, 0, Math.PI * 2);
        ctx.fill();
        // 深色描边与高光：红地面上也能看清轮廓
        ctx.strokeStyle = 'rgba(60,2,0,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,220,210,0.75)';
        ctx.beginPath();
        ctx.ellipse(-coreR * 0.38, -coreR * 0.42, coreR * 0.28, coreR * 0.18, -0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (d.kind === 'rune') {
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.glowSprite('#8fb4ea'), -20, -20, 40, 40);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#8fb4ea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#c6ddff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('技', 0, 1);
        ctx.restore();
      }
    }
  },
  // 每帧只排序一次，前后两层绘制复用同一列表
  sortMonstersForDraw() {
    const list = this._drawMonsters || (this._drawMonsters = []);
    list.length = 0;
    for (const m of this.monsters) if (!m.dead) list.push(m);
    list.sort((a, b) => a.y - b.y);
  },
  // maxY / minY 把列表拆成玩家身后（y<=maxY）与身前（y>minY）两层
  // v 由调用方传入复用，避免每次绘制都新建可视矩形对象
  drawMonsters(ctx, maxY, minY, v) {
    const view = v || this.viewRect(220);
    const sorted = !!this._drawMonsters;
    const list = this._drawMonsters || this.monsters;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.dead) continue;
      if (m.y > maxY) {
        // 排序后的列表里后面只会更靠前，可直接结束本轮
        if (sorted) break;
        continue;
      }
      if (m.y <= minY) continue;
      if (m.x < view.l || m.x > view.r || m.y < view.t || m.y > view.b) continue;
      const artBoss = !!(m.boss && m.art && DG.art.bosses);
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      ctx.save();
      ctx.translate(m.x, m.y);

      // 阴影
      if (artBoss) {
        ctx.fillStyle = 'rgba(0,0,0,0.40)';
        ctx.beginPath();
        ctx.ellipse(0, m.r * 0.72, m.r * 1.25, m.r * 0.44, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (artMob) {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.ellipse(0, m.r * 0.72, m.r * 1.12, m.r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, m.r * 0.85, m.r * 0.9, m.r * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (m.boss) {
        const pulse = 0.5 + Math.sin(this.time * 3) * 0.2;
        ctx.strokeStyle = `rgba(217, 139, 157, ${0.18 + pulse * 0.18})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, m.r + 9 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (m.elite) {
        const affixes = m.affixes || [];
        const table = DG.scenes.dungeon.ELITE_AFFIXES || {};
        if (affixes.length) {
          // 词缀环：一条词缀一道色环，玩家看颜色就知道要防什么
          for (let i = 0; i < affixes.length; i++) {
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = (table[affixes[i]] && table[affixes[i]].color) || 'rgba(201,162,95,0.65)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, m.r + 5 + i * 4, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = 'rgba(201,162,95,0.65)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, m.r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // 护盾：沿精英外圈画一道青色弧，剩余量一目了然
      if (m.shield > 0 && m.maxShield) {
        const ratio = Math.max(0, Math.min(1, m.shield / m.maxShield));
        ctx.strokeStyle = 'rgba(127,208,192,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, m.r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.stroke();
      }
      if (m.slow > 0) {
        ctx.strokeStyle = 'rgba(142,201,232,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, m.r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (artBoss) {
        DG.art.bosses.draw(ctx, m, { t: this.time, cast: m.cast });
      } else if (artMob) {
        DG.art.monsters.draw(ctx, m, { t: this.time });
      } else {
        ctx.fillStyle = m.flash > 0 ? '#f5f0e6' : m.color;
        shapePath(ctx, m.shape, m.r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.42)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 眼睛朝向
        const ang = U.angle(m, this.player);
        ctx.fillStyle = 'rgba(255, 235, 200, 0.75)';
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * m.r * 0.36, Math.sin(ang) * m.r * 0.36, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 受击反馈：所有怪物统一补一圈白光。素材怪依赖各自的闪白贴图，
      // 部分分件/缺图素材不会变色，这里用轮廓光保证任何怪物、任何攻击都有清晰回馈
      if (m.flash > 0) {
        const fa = Math.min(1, m.flash / 0.13);
        const lit = artBoss || artMob;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fa * (lit ? 0.5 : 0.42);
        ctx.strokeStyle = lit ? '#fff0da' : '#fffdf2';
        ctx.lineWidth = lit ? 3 : 2.6;
        ctx.beginPath();
        ctx.ellipse(0, -m.r * 0.12, m.r * 0.92, m.r * 1.12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  },
  // 血条单独一层：后排怪被前排轮廓遮住后，血量依然看得见
  drawMonsterBars(ctx) {
    const v = this.viewRect(220);
    for (const m of (this._drawMonsters || this.monsters)) {
      // 精英常驻血条与名字；普通怪只在受击后短暂显示
      if (m.dead || m.boss || (!m.elite && m.hitT <= 0)) continue;
      if (m.x < v.l || m.x > v.r || m.y < v.t || m.y > v.b) continue;
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      // 比角色头顶的状态条略小一号，拉高到 8px，便于看清
      const w = m.r * 2 + 10;
      const h = 8;
      const y = m.y + (artMob ? m.r * 0.72 - DG.art.monsters.displayHeight(m) - 10 : -m.r - 12);
      ctx.globalAlpha = m.elite ? 1 : U.clamp(m.hitT / 0.35, 0, 1);
      ctx.fillStyle = 'rgba(18,13,13,0.92)';
      ctx.fillRect(m.x - w / 2, y, w, h);
      ctx.fillStyle = m.elite ? '#d9b24a' : '#b8463f';
      ctx.fillRect(m.x - w / 2, y, w * U.clamp(m.hp / m.maxHp, 0, 1), h);
      ctx.strokeStyle = 'rgba(0,0,0,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(m.x - w / 2 - 1, y - 1, w + 2, h + 2);
      // 精英名字：字号随体型微调且不超过 11px，宽度严格限制在血条内
      if (m.elite) {
        const fs = Math.max(9, Math.min(11, m.r * 0.5));
        let label = (m.baseName || m.name || '').replace(/^精英\s*·\s*/, '');
        ctx.font = `600 ${fs}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        // 超宽时逐字裁掉并补省略号，避免压到旁边的怪
        if (ctx.measureText(label).width > w) {
          while (label.length > 1 && ctx.measureText(label + '…').width > w) {
            label = label.slice(0, -1);
          }
          label += '…';
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(label, m.x, y - 4);
        ctx.fillStyle = '#ead9a8';
        ctx.fillText(label, m.x, y - 4);
      }
      ctx.globalAlpha = 1;
    }
    // 眩晕图标：不受血条显隐限制，眩晕期间常驻头顶
    for (const m of (this._drawMonsters || this.monsters)) {
      if (m.dead || m.boss || !(m.stun > 0)) continue;
      if (m.x < v.l || m.x > v.r || m.y < v.t || m.y > v.b) continue;
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      const barY = m.y + (artMob ? m.r * 0.72 - DG.art.monsters.displayHeight(m) - 10 : -m.r - 12);
      // 精英头顶多了一行名字，眩晕星再上移一档，避免压住文字
      const cx = m.x, cy = barY - (m.elite ? 24 : 12);
      const rot = this.time * 5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#ffd45e';
      ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const a = rot + i * Math.PI * 2 / 3;
        const sx = Math.cos(a) * 12, sy = Math.sin(a) * 4 - 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx + 1.6, sy - 1.6);
        ctx.lineTo(sx + 4, sy);
        ctx.lineTo(sx + 1.6, sy + 1.6);
        ctx.lineTo(sx, sy + 4);
        ctx.lineTo(sx - 1.6, sy + 1.6);
        ctx.lineTo(sx - 4, sy);
        ctx.lineTo(sx - 1.6, sy - 1.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  // 恐惧标记：被战吼震慑的敌人头顶浮出惊恐表情，随恐惧剩余时间淡出
  drawFearIcons(ctx) {
    const v = this.viewRect(220);
    const t = this.time || 0;
    for (const m of (this._drawMonsters || this.monsters)) {
      if (m.dead || !(m.fear > 0)) continue;
      if (m.x < v.l || m.x > v.r || m.y < v.t || m.y > v.b) continue;
      const artMob = !!(m.art && DG.art.monsters && DG.art.monsters.has(m.art));
      const barY = m.y + (artMob ? m.r * 0.72 - DG.art.monsters.displayHeight(m) - 10 : -m.r - 12);
      // 轻微抖动：惊恐的样子；最后 0.4 秒淡出
      const a = U.clamp(m.fear / 0.4, 0, 1);
      const cx = m.x + Math.sin(t * 30 + m.x * 0.05) * 1.4;
      const cy = barY - 30 + Math.cos(t * 26 + m.y * 0.05) * 1.2;
      ctx.save();
      ctx.globalAlpha = a;
      // 白色气泡底
      ctx.fillStyle = 'rgba(245,240,232,0.95)';
      ctx.strokeStyle = 'rgba(30,20,16,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // 惊恐大眼（黑眼珠上移）
      ctx.fillStyle = '#1b120d';
      ctx.beginPath();
      ctx.ellipse(cx - 3.6, cy - 1.6, 2.2, 2.9, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 3.6, cy - 1.6, 2.2, 2.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // 张大的嘴
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4.4, 2.1, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  drawPlayer(ctx) {
    const p = this.player;
    if (p.hp <= 0) return;
    // 角色美术由 art/heroes 注册表提供，新增角色无需改动战斗代码
    const hero = this.cls ? DG.art.heroFor(this.cls.id) : null;
    const useHero = !!(hero && hero.battle);
    ctx.save();
    ctx.translate(p.x, p.y);

    // 升级光环：脚下金色辉光。使用预渲染贴图，避免逐帧 shadowBlur
    if (this.levelFx > 0) {
      const k = Math.min(1, this.levelFx / 1.1);
      const R = 78 * (1 + (1 - k) * 0.45);
      ctx.save();
      ctx.globalAlpha = k * 0.85;
      ctx.drawImage(this.glowSprite('#ffd166'), -R, -R * 0.6, R * 2, R * 1.2);
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.9, useHero ? p.r * 1.15 : p.r * 0.9, p.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    if (p.invuln > 0) {
      ctx.strokeStyle = 'rgba(160, 210, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (useHero) {
      hero.battle(ctx, p, this);
      if (hero.battleAura) hero.battleAura(ctx, p, this);
      this.drawPlayerStatus(ctx, -112);
      ctx.restore();
      return;
    }

    // 身体
    const color = this.cls.color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 朝向
    const ang = p.facing;
    ctx.fillStyle = '#f0e6d4';
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * (p.r + 12), Math.sin(ang) * (p.r + 12));
    ctx.lineTo(Math.cos(ang + 2.5) * (p.r + 2), Math.sin(ang + 2.5) * (p.r + 2));
    ctx.lineTo(Math.cos(ang - 2.5) * (p.r + 2), Math.sin(ang - 2.5) * (p.r + 2));
    ctx.closePath();
    ctx.fill();

    this.drawPlayerStatus(ctx, -p.r - 30);
    ctx.restore();
  },

  // 角色头顶的状态条：上为生命，下为精力（释放大技能消耗）
  drawPlayerStatus(ctx, top) {
    const p = this.player;
    const w = 68, hpH = 10, enH = 6, gap = 4;
    const hpY = top - hpH - gap - enH;

    const paint = (y, h, pct, color) => {
      ctx.fillStyle = 'rgba(18,14,14,0.92)';
      ctx.fillRect(-w / 2, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(-w / 2, y, w * U.clamp(pct, 0, 1), h);
      // 灰色描边 + 外圈 2px 黑描
      ctx.strokeStyle = 'rgba(168,168,168,0.95)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-w / 2 + 0.8, y + 0.8, w - 1.6, h - 1.6);
      ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2 - 1, y - 1, w + 2, h + 2);
    };

    paint(hpY, hpH, p.hp / p.maxHp, '#4e9e57');
    paint(hpY + hpH + gap, enH, p.stam / p.maxStam, this.energy.color);
  },
  drawProjectiles(ctx) {
    const v = this.viewRect(90);
    for (const p of this.projectiles) {
      if (p.x < v.l || p.x > v.r || p.y < v.t || p.y > v.b) continue;
      // 游侠的箭矢用素材贴图绘制，不再画成光球
      if (p.team === 'player' && p.skill && p.skill.classId === 'ranger' &&
        DG.art.ranger && DG.art.ranger.arrowReady()) {
        this.drawArrowProjectile(ctx, p);
        continue;
      }
      ctx.save();
      const gr = p.r + 10;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.glowSprite(p.color || '#ffffff'), p.x - gr, p.y - gr, gr * 2, gr * 2);
      ctx.restore();
      // 敌方弹道按施法者区分造型，避免所有远程怪都是同一种光球
      const art = p.art;
      const ang = Math.atan2(p.vy, p.vx);
      if (art === 'musketeer') {
        // 火枪：细长曳光弹
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(-p.r * 6, 0, p.r * 1.4, 0);
        g.addColorStop(0, withAlpha(p.color, 0));
        g.addColorStop(0.75, withAlpha(p.color, 0.45));
        g.addColorStop(1, withAlpha('#fff2cf', 0.95));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-p.r * 6, -1.1);
        ctx.lineTo(p.r * 1.4, 0);
        ctx.lineTo(-p.r * 6, 1.1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff8e2';
        ctx.beginPath();
        ctx.arc(p.r * 0.8, 0, p.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (art === 'hornet') {
        // 毒蜂：尖锐毒针 + 细尾迹
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = withAlpha(p.color, 0.5);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-p.r * 4.5, 0);
        ctx.lineTo(-p.r * 0.6, 0);
        ctx.stroke();
        ctx.fillStyle = withAlpha(p.color, 0.9);
        ctx.beginPath();
        ctx.moveTo(p.r * 2.1, 0);
        ctx.lineTo(-p.r * 0.6, -p.r * 0.62);
        ctx.lineTo(-p.r * 0.6, p.r * 0.62);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f4e2ff';
        ctx.beginPath();
        ctx.moveTo(p.r * 1.9, 0);
        ctx.lineTo(p.r * 0.2, -p.r * 0.22);
        ctx.lineTo(p.r * 0.2, p.r * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (art === 'cinderraven' || art === 'candle' || art === 'emberdrake') {
        // 火焰：抖动的火舌 + 火星尾
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        const flick = 0.85 + Math.sin((p.x + p.y) * 0.35 + (this.time || 0) * 22) * 0.15;
        ctx.fillStyle = withAlpha(p.color, 0.55);
        ctx.beginPath();
        ctx.moveTo(-p.r * 2.6 * flick, 0);
        ctx.quadraticCurveTo(0, -p.r * 1.5, p.r * 1.5, 0);
        ctx.quadraticCurveTo(0, p.r * 1.5, -p.r * 2.6 * flick, 0);
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffe9a8', 0.9);
        ctx.beginPath();
        ctx.arc(p.r * 0.3, 0, p.r * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (art === 'mistwalker') {
        // 迷雾：外围柔雾 + 双层虚影
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = withAlpha(p.color, 0.45);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = withAlpha(p.color, 0.32);
        ctx.beginPath();
        ctx.arc(p.x - Math.cos(ang) * p.r * 1.6, p.y - Math.sin(ang) * p.r * 1.6, p.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha('#e8fbff', 0.75);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (art === 'angler') {
        // 渊灯：水泡实心球 + 高光
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = withAlpha(p.color, 0.6);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = withAlpha(p.color, 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffffff', 0.85);
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (art === 'warlock') {
        // 深渊：旋转虚空菱环
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((this.time || 0) * 4 + ang);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = withAlpha(p.color, 0.4);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 1.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = withAlpha(p.color, 0.85);
        ctx.beginPath();
        ctx.moveTo(0, -p.r * 1.35);
        ctx.lineTo(p.r * 0.9, 0);
        ctx.lineTo(0, p.r * 1.35);
        ctx.lineTo(-p.r * 0.9, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffffff', 0.7);
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // 游侠箭矢：木箭贴图按速度方向旋转，箭尾拖出渐隐光带与速度线
  drawArrowProjectile(ctx, p) {
    const sp = DG.art.ranger.arrowSprite;
    const cfg = RANGER_ARROW[p.skill.id] || RANGER_ARROW.arrow;
    const ang = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);

    // 拖尾光带：从箭尾向前收窄，尾部完全透明
    if (cfg.trail > 0) {
      const g = ctx.createLinearGradient(-cfg.trail, 0, 0, 0);
      g.addColorStop(0, withAlpha(cfg.color, 0));
      g.addColorStop(0.7, withAlpha(cfg.color, 0.16));
      g.addColorStop(1, withAlpha(cfg.color, 0.62));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail, 0);
      ctx.lineTo(0, -cfg.width * 1.7);
      ctx.lineTo(0, cfg.width * 1.7);
      ctx.closePath();
      ctx.fill();

      // 两道细速度线，强化飞行方向感
      ctx.strokeStyle = withAlpha(cfg.color, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail * 0.82, -cfg.width * 0.9);
      ctx.lineTo(-6, -cfg.width * 0.35);
      ctx.moveTo(-cfg.trail * 0.6, cfg.width * 0.95);
      ctx.lineTo(-4, cfg.width * 0.4);
      ctx.stroke();
    }

    if (p.variant === 'fan' || p.variant === 'rain') {
      ctx.strokeStyle = withAlpha(cfg.color, p.variant === 'rain' ? 0.48 : 0.36);
      ctx.lineWidth = p.variant === 'rain' ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail * 0.95, -cfg.width * 2.2);
      ctx.quadraticCurveTo(-cfg.trail * 0.48, -cfg.width * 1.3, -8, -cfg.width * 0.6);
      if (p.variant === 'rain') {
        ctx.moveTo(-cfg.trail * 0.72, cfg.width * 2.1);
        ctx.quadraticCurveTo(-cfg.trail * 0.35, cfg.width * 1.2, -6, cfg.width * 0.55);
      }
      ctx.stroke();
    } else if (p.variant === 'shadow') {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(194,237,224,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-cfg.trail * 1.2, 0);
      ctx.lineTo(-4, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 箭身：按素材倾角校正，箭尖对准飞行方向
    const s = cfg.scale;
    const w = sp.img.width * s, h = sp.img.height * s;
    ctx.rotate(sp.tilt);
    ctx.drawImage(sp.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  },
  // 游走旋风：写实龙卷风——底部收束、往上迅速张成宽阔的漏斗口，
  // 柱身随时间蜿蜒鼓胀，数股风带互相穿插盘旋，底部掀尘、顶部散入云底
  drawTornado(ctx, t) {
    const H = 172;        // 尘柱高度
    const RTOP = 54;      // 顶部半宽：从云底张开的漏斗口
    const RBOT = 4;       // 底部收束点
    // 出现 0.25 秒淡入、消失前 0.5 秒淡出
    const fade = Math.min(1, t.t / 0.25, (t.life - t.t) / 0.5);
    if (fade <= 0) return;
    // 缓慢变形：整根柱身蜿蜒、鼓胀，不是标准锥形
    const morph = t.t * 0.9;
      // 轮廓：底部一团被吸起的尘、中段收腰、往上快速张开、顶部外翻成漏斗口
      const widthAt = (u) => {
        let w = RBOT + (RTOP - RBOT) * Math.pow(u, 1.42);
        w *= 1 + 0.16 * Math.sin(u * 4.1 - 1.0 + t.phase * 0.6 + morph * 0.5);
        if (u > 0.62) w *= 1 + Math.pow((u - 0.62) / 0.38, 1.4) * 0.42;
        w += 6 * Math.max(0, 0.16 - u) / 0.16;
        return w;
      };
      const lean = Math.sin(t.t * 1.9 + t.phase) * 7 + Math.sin(t.t * 0.7 + t.phase * 2) * 2.5;
      // 柱身像蛇一样扭动，越往上摆幅越大
      const bend = (u) => lean * Math.pow(u, 1.3) +
        Math.sin(u * 3.4 + t.phase * 1.3 + t.t * 1.1) * (2 + u * 14);
      // 每只体型略有差异，避免三只完全一样
      const S = 0.92 + (Math.sin(t.phase * 2.7) * 0.5 + 0.5) * 0.2;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(S, S);

      // 地面尘裙：几层压扁的尘雾向外扩散，边缘用渐变化开
      for (let s = 2; s >= 0; s--) {
        const rr = 26 + s * 12;
        ctx.save();
        ctx.globalAlpha = fade * (0.15 + s * 0.03);
        ctx.translate(Math.sin(t.spin * 0.7 + s * 1.7) * 5, 2 + s * 0.5);
        ctx.scale(1, 0.32);
        const dg = ctx.createRadialGradient(0, 0, rr * 0.1, 0, 0, rr);
        dg.addColorStop(0, 'rgba(188,180,165,0.5)');
        dg.addColorStop(0.6, 'rgba(198,191,178,0.2)');
        dg.addColorStop(1, 'rgba(202,196,184,0)');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 尘柱本体：沿中轴堆一串软边尘团，不用矢量路径填充，
      // 左右边缘天生就是渐隐的尘雾，不可能出现硬切边
      const pufW = this.glowSprite('#e2dbcb');
      const pufC = this.glowSprite('#dde4e6');
      const SL = 20;
      const vh = H / SL * 1.7;
      for (let i = 0; i <= SL; i++) {
        const u = i / SL;
        const w = widthAt(u);
        const sp = u > 0.6 ? pufC : pufW;
        // 外圈：柱身本体
        ctx.globalAlpha = fade * (0.56 - 0.06 * u);
        ctx.drawImage(sp, bend(u) - w * 1.06, -H * u - vh, w * 2.12, vh * 2);
        // 内圈：偏左一点的浓尘芯，做出左亮右暗的体积
        ctx.globalAlpha = fade * (0.34 - 0.04 * u);
        ctx.drawImage(sp, bend(u) - w * 0.55, -H * u - vh * 0.9,
          w * 1.0, vh * 1.8);
      }
      // 几团鼓出的尘团：让柱身有粗细起伏，不是光滑的锥面
      for (let d = 0; d < 6; d++) {
        const u = 0.12 + d * 0.13 + Math.sin(t.spin * 0.6 + d * 1.9) * 0.03;
        const w = widthAt(u);
        const side = d % 2 ? 1 : -1;
        const sz = w * (0.55 + 0.2 * Math.sin(d * 2.3 + t.phase));
        ctx.globalAlpha = fade * 0.08;
        ctx.drawImage(d > 2 ? pufC : pufW,
          bend(u) + side * w * 0.42 - sz / 2, -H * u - sz * 0.55, sz, sz * 1.1);
      }
      // 右侧背光：淡淡压一层暗尘，让圆柱有受光/背光的体积
      const pufD = this.glowSprite('#6d777c');
      for (let i = 1; i <= SL; i += 2) {
        const u = i / SL;
        const w = widthAt(u);
        ctx.globalAlpha = fade * 0.05;
        ctx.drawImage(pufD, bend(u) + w * 0.22, -H * u - vh * 0.8, w * 1.05, vh * 1.6);
      }
      ctx.globalAlpha = fade;

      // 内部暗卷：两股偏暗的气流先压一层，把柱身分出前后层次
      ctx.lineCap = 'round';
      for (let d = 0; d < 2; d++) {
        const segs = 90;
        const turn = 2.2 + d * 0.7;
        const sp = t.spin * 0.82 + t.phase * 1.7 + d * 3.2;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const u = i / segs;
          const th = u * turn * Math.PI * 2 + sp + Math.sin(u * 2.8 + d) * 1.1;
          const rx = widthAt(u) * (0.5 + 0.14 * Math.sin(u * 5 + d * 2));
          const ry = 4 + 9 * u;
          const x = Math.cos(th) * rx + bend(u);
          const y = -H * u + Math.sin(u * 17 + d * 2) * 2 - Math.sin(th) * ry;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.globalAlpha = fade * 0.2;
        ctx.strokeStyle = 'rgba(96,104,108,0.8)';
        ctx.lineWidth = 10 - d * 3;
        ctx.stroke();
      }

      // 内部湍流：五股灰白风带，圈数、粗细、明暗各不相同；
      // 每股在柱身上“进出”的节奏也不同，互相穿插才像被卷起的乱流
      const wg = ctx.createLinearGradient(0, 0, 0, -H);
      wg.addColorStop(0, 'rgba(242,246,247,0.5)');
      wg.addColorStop(0.14, 'rgba(244,248,249,0.62)');
      wg.addColorStop(0.45, 'rgba(238,242,243,0.52)');
      wg.addColorStop(0.68, 'rgba(236,241,242,0.4)');
      wg.addColorStop(0.86, 'rgba(235,240,241,0.16)');
      wg.addColorStop(1, 'rgba(235,240,241,0)');
      const strands = [
        { turn: 2.2, w: 9.0, a: 0.34, off: 0.0 },
        { turn: 2.9, w: 6.0, a: 0.28, off: 2.1 },
        { turn: 3.6, w: 4.0, a: 0.24, off: 4.2 },
        { turn: 1.8, w: 11.0, a: 0.18, off: 1.2 }
      ];
      for (let s = 0; s < strands.length; s++) {
        const st = strands[s];
        const segs = 110;
        const sp = t.spin * (0.9 + s * 0.09) + t.phase + st.off;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const u = i / segs;
          // 螺距沿途伸缩：风带时而挤成一团、时而拉开，不再均匀如弹簧
          const th = u * st.turn * Math.PI * 2 + sp +
            Math.sin(u * 3.4 + t.phase + st.off) * 1.3;
          const rm = 0.54 + 0.2 * Math.sin(u * 6.4 + t.phase + st.off + morph * 0.3) +
            0.07 * Math.sin(u * 12.5 - morph * 1.8 + st.off * 0.7);
          const rx = widthAt(u) * rm;
          const ry = 5 + 11 * u;
          const x = Math.cos(th) * rx - Math.sin(th) * ry * 0.2 + bend(u) +
            Math.sin(u * 9 + t.phase + s) * 0.7;
          const y = -H * u + Math.sin(u * 21 + t.phase * 2 + s) * 1.2 - Math.sin(th) * ry;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        // 宽而淡的一层叠出“气流团”，再补一条细亮芯
        ctx.globalAlpha = fade * st.a * (0.85 + 0.15 * Math.sin(t.t * 2.4 + s));
        ctx.strokeStyle = wg;
        ctx.lineWidth = st.w;
        ctx.stroke();
        ctx.globalAlpha = fade * st.a * 0.35;
        ctx.lineWidth = Math.max(1, st.w * 0.2);
        ctx.stroke();
      }

      // 被撕开的短风絮：零散贴在柱身边缘，打断规整的螺旋线
      ctx.strokeStyle = 'rgba(240,245,246,0.55)';
      for (let wI = 0; wI < 9; wI++) {
        const u = 0.1 + ((wI * 0.107 + t.phase * 0.137) % 0.6);
        const w = widthAt(u);
        const dir = wI % 2 ? 1 : -1;
        const x0 = dir * w * 0.72 + bend(u);
        const y0 = -H * u + Math.sin(wI * 3.1 + t.spin) * 3;
        const len = 9 + (wI % 4) * 7;
        ctx.globalAlpha = fade * (0.14 + 0.2 * Math.abs(Math.sin(wI * 1.7 + t.spin)));
        ctx.lineWidth = 1.4 + (wI % 3) * 0.7;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + dir * len * 0.45, y0 - len * 0.55,
          x0 + dir * len, y0 - len * 1.1);
        ctx.stroke();
      }

      // 顶部散开的尘帽：补几团更淡的尘，让漏斗口自然散进云底
      for (let k = 1; k <= 5; k++) {
        const f = k / 6;
        const sz = 22 + (k % 3) * 8;
        ctx.globalAlpha = fade * 0.08;
        ctx.drawImage(pufC,
          bend(1) + (f - 0.5) * widthAt(1) * 1.3 - sz / 2 + Math.sin(k * 2.1 + t.phase) * 6,
          -H * 0.97 - sz * 0.3 + Math.cos(k * 1.7 + t.phase) * 5, sz, sz);
      }
      // 柱脚扬起的尘团：柔化底部的细亮杆
      for (let b = 0; b < 4; b++) {
        const sz = 26 + b * 10;
        ctx.globalAlpha = fade * (0.14 - b * 0.02);
        ctx.drawImage(pufW, Math.sin(t.spin * 0.5 + b) * 3 - sz / 2, -8 - sz / 2, sz, sz);
      }
      ctx.globalAlpha = fade * 0.2;
      ctx.fillStyle = '#d6d1c5';
      ctx.beginPath();
      ctx.ellipse(Math.sin(t.spin + t.phase) * 2, -5, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // 底部贴地碎屑 + 沿柱身被卷起的浮尘
      for (let p = 0; p < 16; p++) {
        const ph = t.spin * 2.1 + p * 0.63 + t.phase;
        let px, py, sz;
        if (p < 8) {
          const rr = 17 + (p % 4) * 9;
          px = Math.cos(ph) * rr;
          py = Math.sin(ph) * rr * 0.3 - 1;
          sz = 1.7;
        } else {
          const kk = 0.1 + (p - 8) * 0.11;
          px = Math.cos(ph * 1.3) * widthAt(kk) * 0.95 + bend(kk) + Math.sin(ph * 2.1) * 4;
          py = -H * kk + Math.sin(ph * 1.7) * 4;
          sz = 1.1 + (p % 3) * 0.3;
        }
        ctx.globalAlpha = fade * (0.22 + 0.3 * Math.abs(Math.sin(ph)));
        ctx.fillStyle = p < 8 ? '#d9d2c4' : '#e4e1d8';
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      // 底部微亮的汇聚点：暗示风柱吸起尘土的源头
      ctx.globalCompositeOperation = 'lighter';
      const core = ctx.createRadialGradient(0, -6, 0, 0, -6, 14);
      core.addColorStop(0, 'rgba(245,248,247,0.1)');
      core.addColorStop(1, 'rgba(220,230,232,0)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, -6, 14, 0, Math.PI * 2);
      ctx.fill();

      // 外侧薄雾：把轮廓和背景揉在一起
      const veil = ctx.createRadialGradient(0, -H * 0.45, 6, 0, -H * 0.45, H * 0.85);
      veil.addColorStop(0, 'rgba(206,214,217,0.09)');
      veil.addColorStop(0.6, 'rgba(198,208,212,0.045)');
      veil.addColorStop(1, 'rgba(190,200,205,0)');
      ctx.fillStyle = veil;
      ctx.fillRect(-H * 1.1, -H * 1.35, H * 2.2, H * 1.55);

      ctx.restore();
  },

  drawEffects(ctx, groundOnly) {
    for (const e of this.effects) {
      const ground = e.kind === 'teleArc' || e.kind === 'teleBeam' || e.kind === 'teleCircle' || e.kind === 'rollMark' || e.kind === 'arrowRainMarker' || e.kind === 'slamShock';
      if (ground !== !!groundOnly) continue;
      const t = 1 - e.life / e.max;
      if (e.kind === 'roarCore') {
        // 战吼核心闪光：胸口一团金白亮光快速膨胀后消失
        const k = 1 - e.life / e.max;
        const r = U.lerp(e.r0, e.r1, Math.sqrt(k));
        const a = (1 - k) * (1 - k) * 0.9;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        g.addColorStop(0, withAlpha(e.color, a));
        g.addColorStop(0.45, withAlpha(e.color, a * 0.5));
        g.addColorStop(1, withAlpha(e.color, 0));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'roarWave') {
        // 战吼光浪：一圈带厚度的黄色亮环向外推开，中心留空，靠加色混合发亮
        const k = 1 - e.life / e.max;
        const r = U.lerp(e.r0, e.r1, 1 - Math.pow(1 - k, 2));
        const band = Math.max(10, e.r1 * 0.20 * (1 - k * 0.45));
        const a = (1 - k) * 0.5;
        const g = ctx.createRadialGradient(e.x, e.y, Math.max(0, r - band), e.x, e.y, r + band);
        g.addColorStop(0, withAlpha(e.color, 0));
        g.addColorStop(0.55, withAlpha(e.color, a));
        g.addColorStop(1, withAlpha(e.color, 0));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + band, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'ring') {
        const r = U.lerp(e.r0, e.r1, t);
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'rollMark') {
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.34;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-e.len / 2, -5);
        ctx.quadraticCurveTo(0, 5, e.len / 2, -3);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'arrowRainMarker') {
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.5;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * (1.1 - k * 0.25), -e.arc / 2, e.arc / 2);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'slash') {
        // 刀光：外层血雾带 + 血色主刃 + 白色刃芯，随进度外扩并整体淡出
        const fade = 1 - t;
        const rr = e.radius * (0.62 + t * 0.46);
        const a0 = -e.arc / 2, a1 = e.arc / 2;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.lineCap = 'round';
        // 加色混合让血刃在暗色地面和怪物身上都亮起来
        ctx.globalCompositeOperation = 'lighter';
        // 外层血雾
        ctx.globalAlpha = fade * 0.3;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(0, 0, rr * 1.04, a0, a1);
        ctx.stroke();
        // 血色主刃
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = '#f0301f';
        ctx.lineWidth = 6.5;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a0, a1);
        ctx.stroke();
        // 白色刃芯：贴主刃内侧，制造金属反光
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = 'rgba(255,244,236,0.95)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, rr * 0.96, a0, a1);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'spark') {
        ctx.globalAlpha = Math.max(0, e.life / e.max);
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * (e.life / e.max + 0.3), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'blood') {
        // 血珠：沿速度方向拉长，快消失时整体变淡
        const k = U.clamp(e.life / e.max, 0, 1);
        const sp = Math.hypot(e.vx, e.vy);
        const st = 1 + Math.min(2.4, sp / 160);
        ctx.globalAlpha = Math.min(0.85, k * 2.4);
        ctx.fillStyle = e.color;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(Math.atan2(e.vy, e.vx));
        ctx.beginPath();
        ctx.ellipse(0, 0, e.r * st, e.r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'shard') {
        // 碎片：翻滚下落，最后 40% 生命逐渐淡出
        const k = U.clamp(e.life / e.max, 0, 1);
        const AD = DG.art && DG.art.terrainDecor;
        if (AD && AD.drawShard) {
          AD.drawShard(ctx, e.img, e.sx, e.sy, e.sw, e.sh,
            e.x, e.y, e.rot, e.scale, Math.min(1, k * 2.6));
        }
      } else if (e.kind === 'streak') {
        // 游侠翻滚的速度线：沿移动方向拖出细长光痕
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.75;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = e.w || 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-e.len * (0.4 + k * 0.6), 0);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'beam') {
        // 穿云箭贯穿光带：起点最亮，向前迅速消散
        const k = U.clamp(e.life / e.max, 0, 1);
        const len = e.len != null ? e.len : (e.length != null ? e.length : 72);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k;
        const half = (e.width || 6) / 2;
        const lg = ctx.createLinearGradient(0, 0, len, 0);
        lg.addColorStop(0, withAlpha(e.color, 0.9));
        lg.addColorStop(0.35, withAlpha(e.color, 0.45));
        lg.addColorStop(1, withAlpha(e.color, 0));
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(0, -half);
        ctx.lineTo(len, -half * 0.25);
        ctx.lineTo(len, half * 0.25);
        ctx.lineTo(0, half);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'snipeCharge') {
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k * 0.85;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8 + (1 - k) * 22, -0.65, 0.65);
        ctx.moveTo(-20 * k, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'arrowImpact' || e.kind === 'snipeImpact') {
        const k = U.clamp(e.life / e.max, 0, 1);
        const len = e.kind === 'snipeImpact' ? 54 : 30;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        ctx.globalAlpha = k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = e.kind === 'snipeImpact' ? 4.5 : 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-len * 0.35, 0);
        ctx.lineTo(len, 0);
        ctx.moveTo(len * 0.22, -len * 0.42);
        ctx.lineTo(len * 0.22, len * 0.42);
        if (e.kind === 'snipeImpact') {
          ctx.moveTo(-len * 0.05, -len * 0.45);
          ctx.lineTo(len * 0.54, len * 0.45);
        }
        ctx.stroke();
        ctx.restore();
      } else if (e.kind === 'chargeGhost') {
        // 冲锋残影：暖色剪影用加色混合发光，按剩余生命快速淡出
        const k = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.pow(k, 1.5) * (e.alpha || 0.45);
        ctx.drawImage(e.img, e.x - e.img.width / 2, e.y - (e.img.height - 30));
        ctx.restore();
      } else if (e.kind === 'afterimage') {
        // 影步残影：翻滚路径上残留的半透明游侠残像
        const a = U.clamp(e.life / e.max, 0, 1);
        ctx.save();
        ctx.globalAlpha = a * 0.32;
        DG.art.ranger.draw(ctx, e.x, e.y, {
          scale: 0.7273, flip: !!e.flip, state: 'walk',
          t: this.time, walkPhase: e.phase || 0
        });
        ctx.restore();
      } else if (DG.art.monsters && DG.art.monsters.drawEffect(ctx, e)) {
        // 分件小怪的咬击 / 孢子特效
      } else if (DG.art.bosses) {
        DG.art.bosses.drawEffect(ctx, e);
      }
      // 专属皮肤层：按小怪主题叠加碎屑/元素，增强每个怪物的辨识度
      if (e.skin && DG.art.monsters && DG.art.monsters.drawFxSkin) {
        DG.art.monsters.drawFxSkin(ctx, e);
      }
    }
  },
  drawFloaters(ctx) {
    for (const f of this.floaters) {
      const a = U.clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      // 数字出场时轻微放大再回落，让伤害数字更醒目
      const pop = f.life > f.max - 0.12 ? 1 + (f.life - (f.max - 0.12)) / 0.12 * 0.22 : 1;
      ctx.font = `bold ${Math.round(f.size * pop)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      // 描边随字号加粗，大号数字才不会糊成一团
      ctx.strokeStyle = 'rgba(0,0,0,0.78)';
      ctx.lineWidth = Math.max(4, f.size * 0.22);
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  },
  drawScreenOverlay(ctx) {
    // 边缘暗角：预渲染成半分辨率离屏图后逐帧 drawImage。
    // 整屏径向渐变填充在高分屏手机上每帧要重算数百万像素，是掉帧大户。
    let vign = this._vignetteImg;
    if (!vign) {
      vign = document.createElement('canvas');
      vign.width = Math.ceil(W / 2);
      vign.height = Math.ceil(H / 2);
      const vg = vign.getContext('2d');
      vg.scale(0.5, 0.5);
      const rg = vg.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.92);
      rg.addColorStop(0, 'rgba(0,0,0,0)');
      rg.addColorStop(1, 'rgba(0,0,0,0.62)');
      vg.fillStyle = rg;
      vg.fillRect(0, 0, W, H);
      this._vignetteImg = vign;
    }
    ctx.drawImage(vign, 0, 0, W, H);

    // 受击红闪
    if (this.hurtFlash > 0) {
      const hf = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.8);
      hf.addColorStop(0, 'rgba(150, 20, 15, 0)');
      hf.addColorStop(1, `rgba(150, 20, 15, ${this.hurtFlash * 0.55})`);
      ctx.fillStyle = hf;
      ctx.fillRect(0, 0, W, H);
    }

    // 首领降临红屏：开场整屏压红，随后边缘脉动收束（渐变对象缓存，仅调 alpha）
    if (this.bossFlash > 0) {
      let bv = this._bossVignette;
      if (!bv) {
        bv = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.88);
        bv.addColorStop(0, 'rgba(210, 36, 26, 0.05)');
        bv.addColorStop(0.55, 'rgba(214, 40, 30, 0.2)');
        bv.addColorStop(1, 'rgba(232, 44, 32, 0.62)');
        this._bossVignette = bv;
      }
      const k = Math.min(1, this.bossFlash / 1.3);
      const pulse = 0.72 + 0.28 * Math.sin((1.6 - this.bossFlash) * 22);
      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.35 + k * 0.65) * pulse;
      ctx.fillStyle = bv;
      ctx.fillRect(0, 0, W, H);
      if (k > 0.62) {
        ctx.globalAlpha = (k - 0.62) * 0.85;
        ctx.fillStyle = 'rgba(168, 20, 14, 1)';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    this.drawMinimap(ctx);
  },
  // 小地图底图缓存：首次全量绘制，之后只补画刚揭开的格子，
  // 避免每次探索推进都做一遍 90×96 全图填色（移动端很容易掉帧）
  buildMinimapCache() {
    const T = DG.scenes.dungeon.terrain;
    const R = DG.scenes.dungeon.minimapRect;
    const mw = R.w, mh = R.h;
    const gw = (this.arenaW || T.COLS * T.TILE) / T.TILE;
    const gh = (this.arenaH || T.ROWS * T.TILE) / T.TILE;
    const sx = mw / gw;
    const sy = mh / gh;
    let c = this._minimapCanvas;
    const full = !c;
    if (!c) {
      c = document.createElement('canvas');
      c.width = mw;
      c.height = mh;
      this._minimapCanvas = c;
    }
    const g = c.getContext('2d');
    const paint = (tx, ty) => {
      g.fillStyle = this.isFloorTile(tx, ty)
        ? 'rgba(120,150,128,.32)'
        : 'rgba(26,34,30,.85)';
      g.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
    };
    if (full) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, mw, mh);
      for (let ty = 0; ty < T.ROWS; ty++) {
        for (let tx = 0; tx < T.COLS; tx++) {
          if (this.explored[ty * T.COLS + tx]) paint(tx, ty);
        }
      }
      this._minimapNew = null;
    } else {
      const list = this._minimapNew;
      this._minimapNew = null;
      if (list) {
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          paint(i % T.COLS, (i / T.COLS) | 0);
        }
      }
    }
    this._minimapDirty = false;
  },
  // 小地图的屏幕区域：把 DOM 外框的位置换算回画布逻辑坐标。
  // 画布固定按 810×1680 绘制，再等比缩放（cover）进舞台，
  // 因此不能直接用 720 舞台里的写死坐标，否则地图会缩一圈并整体偏移。
  minimapRectNow() {
    // getBoundingClientRect 会强制同步布局，逐帧调用在手机上很贵；
    // 400ms 内复用上次结果，转屏 / 改尺寸后最多半秒内自动跟上。
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this._mapRect && this._mapRectAt && now - this._mapRectAt < 400) return this._mapRect;
    const c = this.canvas.getBoundingClientRect();
    const f = this.$map && this.$map.getBoundingClientRect();
    if (!f || !c.width || !c.height) return DG.scenes.dungeon.minimapRect;
    const kx = W / c.width;
    const ky = H / c.height;
    const rect = {
      x: (f.left - c.left) * kx,
      y: (f.top - c.top) * ky,
      w: f.width * kx,
      h: f.height * ky
    };
    this._mapRect = rect;
    this._mapRectAt = now;
    return rect;
  },
  // 左上角小地图：只显示已探索区域、玩家位置与首领方位
  drawMinimap(ctx) {
    // 首领血条出现时同步屏蔽小地图（与 DOM 的 boss-mode 保持一致）
    if (this.monsters.some(m => m.boss && !m.dead)) return;
    const T = DG.scenes.dungeon.terrain;
    const R = this.minimapRectNow();
    const mx = R.x, my = R.y, mw = R.w, mh = R.h;
    const gw = (this.arenaW || T.COLS * T.TILE) / T.TILE;
    const gh = (this.arenaH || T.ROWS * T.TILE) / T.TILE;
    const sx = mw / gw;
    const sy = mh / gh;
    ctx.save();
    if (!this._minimapCanvas || this._minimapDirty) this.buildMinimapCache();
    // 底图按外框实际大小拉伸绘制，保证与外框严丝合缝
    ctx.drawImage(this._minimapCanvas, mx, my, mw, mh);

    // 当前视野范围
    const z = this.zoom || 1;
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mx + (this.camera.x - W / (2 * z)) / T.TILE * sx,
      my + (this.camera.y - H / (2 * z)) / T.TILE * sy,
      W / z / T.TILE * sx, H / z / T.TILE * sy
    );

    // 首领标记
    const boss = this.monsters.find(m => m.boss && !m.dead);
    if (boss) {
      const bx = mx + boss.x / T.TILE * sx;
      const by = my + boss.y / T.TILE * sy;
      const pulse = 0.5 + Math.sin(this.time * 5) * 0.5;
      ctx.fillStyle = `rgba(220,80,70,${0.3 + pulse * 0.4})`;
      ctx.beginPath();
      ctx.arc(bx, by, 5 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff6a5e';
      ctx.beginPath();
      ctx.arc(bx, by, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 玩家标记与朝向
    const px = mx + this.player.x / T.TILE * sx;
    const py = my + this.player.y / T.TILE * sy;
    ctx.strokeStyle = 'rgba(159,230,173,.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(this.player.facing) * 6, py + Math.sin(this.player.facing) * 6);
    ctx.stroke();
    ctx.fillStyle = '#9fe6ad';
    ctx.beginPath();
    ctx.arc(px, py, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  });
})();


;
/* ==== js/game.js ==== */
/* 游戏入口：场景切换与主循环 */
(function () {
  const DG = window.DG;

  // 场景固定按最大尺寸 810×1680 绘制：舞台比它小就等比裁边，始终不会露出空白
  const SCENE_W = 810;
  const SCENE_H = 1680;

  const game = DG.game = {
    canvas: null,
    ctx: null,
    ui: null,
    db: null,
    accountName: null,
    charIndex: -1,
    char: null,
    dungeon: null,
    lastTs: 0,
    _saveWarned: false,
    // 渲染分辨率倍率：画布后备像素 = 720×倍率。
    // 手机屏幕的物理像素远多于 720p，若按 1 倍渲染再被浏览器放大，角色边缘会发糊，
    // 因此默认按设备物理像素渲染（上限 1.5 倍），掉帧时自适应回落但不低于 1 倍。
    renderScale: 1,

    init() {
      this.canvas = document.getElementById('game');
      // alpha:false：画面每帧全量覆盖，不需要透明通道，省掉整屏混合开销
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.ui = document.getElementById('ui');
      this.db = DG.storage.load();

      // 主城 / 战斗贴图约 2MB：等 load 之后再预载，先保证登录首屏拿到满带宽
      this.deferPreload();

      this.fitStage();
      window.addEventListener('resize', () => this.fitStage());
      window.addEventListener('orientationchange', () => setTimeout(() => this.fitStage(true), 200));
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => this.fitStage());
      }
      // 键盘收起后复位页面并重新适配：微信里输入法可能把页面顶偏
      document.addEventListener('focusout', (e) => {
        const t = e.target;
        if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
        setTimeout(() => {
          if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0);
          this.fitStage(true);
        }, 120);
      });
      // 微信长按图片会弹出「保存图片 / 识别二维码」，统一拦掉
      document.addEventListener('contextmenu', (e) => {
        const t = e.target;
        if (t && (t.tagName === 'IMG' || t.tagName === 'CANVAS')) e.preventDefault();
      });
      document.addEventListener('dragstart', (e) => {
        if (e.target && e.target.tagName === 'IMG') e.preventDefault();
      });
      window.addEventListener('beforeunload', () => {
        if (this.db) DG.storage.save(this.db);
      });

      requestAnimationFrame((ts) => this.loop(ts));
      this.gotoLogin();
      // 登录界面已经渲染，撤掉静态启动画面（背景图若未到还有渐变兜底，不会黑屏）
      requestAnimationFrame(() => this.hideBoot());
      this.registerServiceWorker();
    },

    // 注册本地缓存：线上服务器对所有资源返回 no-store，浏览器不会缓存，
    // 重复打开都要重新下载；Service Worker 用 Cache Storage 把这部分兜住。
    registerServiceWorker() {
      if (!('serviceWorker' in navigator)) return;
      const host = location.hostname;
      // Service Worker 只能在 https 或本机调试时使用，file:// 双击打开时自动跳过
      if (location.protocol !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') return;
      const start = () => {
        navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
          // 首屏已完成：让 SW 在后台把未访问过的资源按清单补进本地缓存
          if (!reg || !reg.active) return;
          setTimeout(() => {
            if (reg.active) reg.active.postMessage({ type: 'warm', delay: 3000 });
          }, 600);
        }).catch(() => { /* 缓存不可用不影响游戏 */ });
      };
      if (document.readyState === 'complete') start();
      else window.addEventListener('load', start);
    },

    // 首屏资源（CSS / JS / 登录背景）就绪后再预热战斗贴图：
    // 之前一进页面就抢连接，登录背景反而要排队，弱网首屏明显变慢。
    deferPreload() {
      const run = () => setTimeout(() => {
        if (DG.art && DG.art.preloadAssets) DG.art.preloadAssets();
      }, 1200);
      if (document.readyState === 'complete') run();
      else window.addEventListener('load', run, { once: true });
    },

    // 撤掉 index.html 中的静态启动画面
    hideBoot() {
      if (this._bootHidden) return;
      this._bootHidden = true;
      const el = document.getElementById('boot');
      if (!el) return;
      el.classList.add('boot-out');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    },

    // 当前布局下 1 个逻辑像素对应的物理像素数：舞台缩放 × 设备像素比。
    // 用它渲染可以避免「720p 画布被拉伸到整屏」导致的角色发糊。
    nativeRenderScale() {
      const doc = document.documentElement;
      const width = doc.clientWidth || window.innerWidth || SCENE_W;
      const height = doc.clientHeight || window.innerHeight || SCENE_H;
      const fit = Math.max(width / SCENE_W, height / SCENE_H) || 1;
      const dpr = window.devicePixelRatio || 1;
      // 手机端封顶 1.25 倍：810×1680 逻辑画布放大后约 1012×2100，
      // 已高于多数手机的实际显示分辨率，再往上只是白白多画像素、拖低帧率
      // 指针类型不会在运行中变化，缓存一次即可，避免反复创建 MediaQueryList
      if (this._coarse == null) {
        this._coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
      }
      const cap = this._coarse ? 1.25 : 2;
      return Math.max(1, Math.min(cap, fit * dpr));
    },

    // 调整画布后备分辨率；CSS 尺寸不变，画面由浏览器缩放显示。
    // 下限 1 倍：低于原生分辨率会让战斗角色明显发糊，任何情况下都不允许。
    setRenderScale(r) {
      const v = Math.max(1, Math.min(2, Math.round(r * 100) / 100));
      const w = Math.round(SCENE_W * v);
      const h = Math.round(SCENE_H * v);
      if (Math.abs(v - this.renderScale) < 0.01 && this.canvas.width === w && this.canvas.height === h) return;
      this.renderScale = v;
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx = this.canvas.getContext('2d', { alpha: false });
    },

    // 屏幕尺寸预设：竖版手机三档，只影响舞台显示窗口，场景始终按 810×1680 绘制
    stageSize() {
      const key = (DG.settings && DG.settings.get().screen) || 'std';
      if (key === 'max') return { key, w: 810, h: 1680 };
      if (key === 'short') return { key, w: 720, h: 1680 };
      return { key: 'std', w: 720, h: 1440 };
    },

    // 设置面板切换屏幕尺寸后立即应用
    applyScreen() {
      this.fitStage(true);
      if (this.dungeon && this.dungeon.updateHud) this.dungeon.updateHud();
    },

    // 适配手机 / 微信：按布局视口等比缩放，输入法弹出期间不跟随可视视口缩放，
    // 否则点输入框时整个游戏画面会突然缩小、键盘收起后又大小异常
    fitStage(force) {
      const stage = document.getElementById('stage');
      if (!stage) return;
      const ae = document.activeElement;
      const editing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
      if (editing && !force) return;
      const doc = document.documentElement;
      const width = doc.clientWidth || window.innerWidth;
      const height = doc.clientHeight || window.innerHeight;
      if (!width || !height) return;
      const screen = this.stageSize();
      // 屏幕比例接近竖版时不再留黑边：舞台提升到场景画幅 810×1680 并铺满屏幕，
      // 多出的部分由 #stage 裁掉，露出的是真实场景；UI 层反向缩放，
      // 物理尺寸与 720×1440 时完全一致，布局、按钮位置和字号都不变。
      // 超过 0.60（横屏窗口）或低于 0.36（极窄）时仍按原逻辑完整显示，避免裁掉过多画面。
      const aspect = width / height;
      const fill = aspect >= 0.36 && aspect <= 0.60;
      const sw = fill ? SCENE_W : screen.w;
      const sh = fill ? SCENE_H : screen.h;
      stage.style.width = sw + 'px';
      stage.style.height = sh + 'px';
      // UI 固定 720×1440 居中，场景层要按舞台原点铺开：这两个偏移供场景元素（主城地图）使用
      stage.style.setProperty('--ui-ox', ((720 - sw) / 2) + 'px');
      stage.style.setProperty('--ui-oy', ((1440 - sh) / 2) + 'px');
      stage.style.setProperty('--stage-w', sw + 'px');
      stage.style.setProperty('--stage-h', sh + 'px');
      // 等比缩放，绝不横向 / 纵向拉伸（拉伸会让插画和 UI 明显变形）：
      // 铺满模式下按 cover 裁切，其余情况按 fit 完整显示
      const uiScale = Math.min(width / screen.w, height / screen.h);
      const scale = fill ? Math.max(width / sw, height / sh) : uiScale;
      stage.style.transform = `scale(${scale})`;
      // UI 反向缩放抵消舞台放大，保证界面物理尺寸与原来一致
      if (this.ui) this.ui.style.transform = fill ? `scale(${(uiScale / scale).toFixed(4)})` : '';
      // 场景固定 810×1680：等比放大到刚好盖住舞台，多出的边缘由 #stage 裁掉
      const coverScale = Math.max(sw / SCENE_W, sh / SCENE_H);
      const cw = SCENE_W * coverScale;
      const ch = SCENE_H * coverScale;
      this.canvas.style.width = cw + 'px';
      this.canvas.style.height = ch + 'px';
      this.canvas.style.left = ((sw - cw) / 2) + 'px';
      this.canvas.style.top = ((sh - ch) / 2) + 'px';
      // 画布后备像素跟随设备物理像素，避免拉伸显示导致角色模糊
      this.setRenderScale(this.nativeRenderScale());
    },

    account() {
      return DG.storage.getAccount(this.db, this.accountName);
    },

    save() {
      const ok = DG.storage.save(this.db);
      if (!ok && !this._saveWarned) {
        this._saveWarned = true;
        DG.ui.toast('本地存档不可用，本次进度仅在页面内有效', 'danger');
      }
      return ok;
    },

    setAccount(name) {
      this.accountName = name;
      const acc = this.account();
      if (!acc) return;
      const idx = Number.isInteger(acc.activeChar) ? acc.activeChar : 0;
      this.charIndex = idx;
      this.char = DG.character.normalize(acc.characters[idx] || null);
    },

    logout() {
      this.gotoLogin();
    },

    gotoLogin() {
      this.stopDungeon();
      this.hideAssetMask();
      if (DG.wake) DG.wake.disable();
      this.accountName = null;
      this.charIndex = -1;
      this.char = null;
      DG.scenes.town.reset();
      DG.scenes.login.render(this.ui);
    },

    gotoCharacter() {
      this.stopDungeon();
      if (DG.wake) DG.wake.disable();
      if (!this.account()) {
        this.gotoLogin();
        return;
      }
      // 野蛮人等图片拼装角色在贴图未到齐时会缺头，先等角色资源就绪再渲染
      if (DG.art && DG.art.heroesReady && DG.art.onHeroesReady && !DG.art.heroesReady()) {
        this.showAssetMask('正在准备角色…');
        let entered = false;
        const showCharacter = () => {
          if (entered) return;
          entered = true;
          clearTimeout(fallback);
          requestAnimationFrame(() => {
            DG.scenes.character.render(this.ui);
            requestAnimationFrame(() => this.hideAssetMask());
          });
        };
        // 兜底：个别贴图异常时最多等 6 秒，避免一直卡在加载层
        const fallback = setTimeout(showCharacter, 6000);
        DG.art.onHeroesReady(showCharacter);
        return;
      }
      DG.scenes.character.render(this.ui);
    },

    // 登录成功后的开始界面：确认账号后再进入选角
    gotoEntry() {
      this.stopDungeon();
      if (!this.account()) {
        this.gotoLogin();
        return;
      }
      DG.scenes.entry.render(this.ui);
    },

    enterCharacter(index) {
      const acc = this.account();
      if (!acc) return;
      const char = acc.characters[index];
      if (!char) return;
      acc.activeChar = index;
      this.charIndex = index;
      this.char = DG.character.normalize(char);
      char.lastPlayed = Date.now();
      this.save();
      this.gotoTown();
    },

    gotoTown() {
      this.stopDungeon();
      if (!this.account()) {
        this.gotoLogin();
        return;
      }
      if (!this.char) {
        this.gotoCharacter();
        return;
      }
      // 镇内提示只在本次登录首次进入时出现，避免反复刷屏
      if (DG.wake) DG.wake.enable();
      this.readyThen(() => DG.scenes.town.render(this.ui), '正在准备资源…');
    },

    // 资源就绪后再执行场景切换：没就绪时先显示加载遮罩，避免进入时黑屏
    readyThen(fn, text) {
      if (!DG.art || !DG.art.assetsReady || DG.art.assetsReady()) { fn(); return; }
      this.showAssetMask(text);
      DG.art.onAssetsReady(() => {
        // 先让遮罩画出来，再同步创建场景；建完等一帧再撤，避免露出空画布
        requestAnimationFrame(() => {
          try {
            fn();
          } finally {
            requestAnimationFrame(() => this.hideAssetMask());
          }
        });
      });
    },

    showAssetMask(text) {
      this.hideAssetMask();
      const mask = document.createElement('div');
      mask.className = 'asset-mask';
      mask.innerHTML =
        '<div class="asset-box"><span class="asset-spinner"></span>' +
        '<b></b><i></i></div>';
      mask.querySelector('b').textContent = text || '正在准备资源…';
      // 挂在舞台层：副本初始化会重写 #ui，遮罩不能被一起清掉
      const host = document.getElementById('stage') || this.ui;
      host.appendChild(mask);
      this._assetMask = mask;
      const tick = () => {
        if (!this._assetMask) return;
        const pct = DG.art && DG.art.assetsProgress ? DG.art.assetsProgress() : 100;
        const el = mask.querySelector('i');
        if (el) el.textContent = pct + '%';
        this._assetTimer = setTimeout(tick, 150);
      };
      tick();
    },

    hideAssetMask() {
      if (this._assetTimer) { clearTimeout(this._assetTimer); this._assetTimer = null; }
      if (this._assetMask) { this._assetMask.remove(); this._assetMask = null; }
    },

    startDungeon(def) {
      if (!this.char || !def) return;
      this.stopDungeon();
      // 战斗中同样保持屏幕常亮
      if (DG.wake) DG.wake.enable();
      // 每次进战斗都按当前设备像素比重置渲染倍率：
      // 既保证首帧角色清晰，也让上一次掉帧降档不会一直沿用
      this.setRenderScale(this.nativeRenderScale());
      this.char.lastPlayed = Date.now();
      this.save();
      // 地图生成与地形烘焙是同步的重活：先让遮罩画出来再开始构建，
      // 构建完等两帧（主循环已画出首帧）再撤遮罩，避免进副本瞬间黑屏
      this.showAssetMask('正在进入副本…');
      const build = () => {
        try {
          this.dungeon = new DG.scenes.dungeon({
            char: this.char,
            def,
            root: this.ui,
            onFinish: (result) => this.finishDungeon(result)
          });
        } catch (e) {
          // 构建异常时不能让遮罩一直挡着，退回营地并提示
          this.hideAssetMask();
          if (DG.ui && DG.ui.toast) DG.ui.toast('进入副本失败，请重试');
          return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => this.hideAssetMask()));
        // 首领贴图在副本真正跑起来后再后台下载，不拖慢登录页与进镇
        if (DG.art && DG.art.preloadBosses) DG.art.preloadBosses();
      };
      if (DG.art && DG.art.assetsReady && !DG.art.assetsReady()) {
        DG.art.onAssetsReady(() => requestAnimationFrame(build));
      } else {
        requestAnimationFrame(build);
      }
    },

    finishDungeon(result) {
      const char = this.char;
      this.dungeon = null;
      if (!char) {
        this.gotoCharacter();
        return;
      }

      // 撤退/重伤：金币与经验打折结算，装备保留。
      // 避免「打不过就撤」变成零风险刷取，同时不给玩家过重的挫败感
      const keep = result.victory ? 1 : (result.retreat ? 0.7 : 0.4);
      result.keepRate = keep;
      if (keep < 1) {
        // 经验在战斗中已实时入账（升级也已在战斗内完成），
        // 这里只扣回未保留的那部分，且不扣到负数、不掉级
        const lostXp = Math.round(result.xp * (1 - keep));
        char.xp = Math.max(0, (char.xp || 0) - lostXp);
        result.gold = Math.round(result.gold * keep);
        result.xp = Math.max(0, result.xp - lostXp);
      }

      char.gold = (char.gold || 0) + result.gold;
      result.levels = result.levels || [];
      // 每 3 级才发 1 点技能点，结算文案按实际发放数量显示
      result.skillPoints = result.levels.filter(lv => lv % 3 === 0).length;
      result.level = char.level;
      this.save();

      // 结算面板出现时切回主城音乐，避免战斗音乐停掉后出现长时间静音
      if (DG.audio) DG.audio.playBgm('lobby');
      DG.ui.showSettlement(result, () => this.gotoTown());
    },

    stopDungeon() {
      if (this.dungeon) {
        this.dungeon.dispose();
        this.dungeon = null;
      }
    },

    // 自适应画质统一由副本场景的 tickRenderQuality 负责：
    // 两套降档逻辑并行会互相拉扯，导致画布反复重建、帧率更低。
    loop(ts) {
      const dt = Math.min(0.05, this.lastTs ? (ts - this.lastTs) / 1000 : 0);
      this.lastTs = ts;
      if (this.dungeon && !this.dungeon.finished) {
        this.dungeon.frame(dt);
      }
      requestAnimationFrame((t) => this.loop(t));
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => game.init());
  } else {
    game.init();
  }
})();

