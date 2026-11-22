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
