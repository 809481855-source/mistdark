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
