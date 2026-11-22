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
    img.src = SRC;
  };

  DG.art = DG.art || {};
  DG.art.bones = state;
})();
