/* 迷雾暗黑 · 本地缓存 Service Worker
 *
 * 线上静态托管对所有文件返回 Cache-Control: no-store，浏览器 / CDN 都无法缓存，
 * 每次打开都要重新下载约 1MB 脚本 + 5MB 图片 + 音频。Cache Storage 是唯一能
 * 把这些资源留在本地的缓存层。
 *
 * 策略：
 *   页面导航    → stale-while-revalidate：有缓存立即出画面，后台静默更新；
 *   CSS / JS    → 缓存优先（文件名带内容哈希，发版自动换名）；
 *   图片 / 音频 → 缓存优先；
 *   资源包 .pk  → 缓存优先（一个包内含上百张散图，命中后整套贴图零请求）；
 *   音频 Range  → 命中完整缓存时本地切片返回 206，BGM 可秒播、可拖动；
 *   后台预热    → 首屏完成后由页面发消息，按清单把未访问过的资源补进缓存。
 */
const CORE_VERSION = 'c9';             // 脚本 / 样式更新策略变化时 +1
const ASSET_VERSION = 'r5';            // 美术 / 音频有改动时 +1
const CORE_CACHE = 'mistdark-core-' + CORE_VERSION;
const ASSET_CACHE = 'mistdark-asset-' + ASSET_VERSION;
const MANIFEST_URL = 'precache-manifest.json';

const ASSET_RE = /\.(png|jpe?g|webp|gif|svg|mp3|ogg|wav)$/i;
const PACK_RE = /\.pk$/i;
const CODE_RE = /\.(css|js)$/i;

// 预热只跑一次：性能与流量都有限，重复消息直接忽略
let warmRun = false;

self.addEventListener('install', () => {
  // 新版本立刻接管，不必等所有旧页面关闭
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k !== CORE_CACHE && k !== ASSET_CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'warm' || warmRun) return;
  warmRun = true;
  const delay = Number(data.delay) || 0;
  event.waitUntil(warmCache(delay).catch(() => {}));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  // 只处理本站资源；外部统计 / 字体等交给浏览器
  if (url.origin !== self.location.origin) return;

  // 音频拖动（Range）：本地有完整缓存就切片返回，否则原样走网络
  if (req.headers.has('range')) {
    event.respondWith(rangeFromCache(req));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  if (CODE_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(event, CORE_CACHE, false));
    return;
  }
  // 资源包跟版本走：放在 core 缓存里，随 CORE_VERSION 一起更新，
  // 避免「旧索引配新包」或「新索引配旧包」，同时不牵连图片 / 音频缓存
  if (PACK_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(event, CORE_CACHE, false));
    return;
  }
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(event, ASSET_CACHE, true));
  }
});

// 导航：有缓存立刻返回，同时后台更新；只有无缓存时才等待网络
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CORE_CACHE);
  const key = navKey(event.request);
  const cached = (await cache.match(key)) ||
    (await cache.match(event.request, { ignoreSearch: true })) ||
    (await cache.match('index.html', { ignoreSearch: true }));

  const update = fetch(event.request).then((res) => {
    if (res && res.ok) cache.put(key, res.clone());
    return res;
  }).catch(() => null);

  if (cached) {
    // 页面已经拿到缓存，更新在后台继续，不拖慢首屏
    event.waitUntil(update);
    return cached;
  }
  const res = await update;
  if (res) return res;
  return new Response('当前离线，且本地没有可用缓存', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// 根路径与 index.html 共用一份缓存，避免写法不同导致 miss
function navKey(req) {
  const u = new URL(req.url);
  if (u.pathname === '/' || u.pathname === '/index.html') {
    return new URL('/', u.origin).href;
  }
  return req.url;
}

async function cacheFirst(event, cacheName, ignoreSearch) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request, { ignoreSearch: !!ignoreSearch });
  if (cached) return cached;
  const res = await fetch(event.request);
  // 写完缓存再返回，避免响应返回后 SW 被回收导致缓存没落盘
  if (res && res.ok) await cache.put(event.request, res.clone());
  return res;
}

// Range 请求：命中完整缓存时本地切片，避免 BGM 拖动 / 重播再走线上
async function rangeFromCache(req) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(req.url, { ignoreSearch: true });
  if (!cached || cached.status !== 200) return fetch(req);

  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (!m) return fetch(req);

  const buf = await cached.arrayBuffer();
  const total = buf.byteLength;
  const start = m[1] === '' ? Math.max(0, total - Number(m[2] || 0)) : Number(m[1]);
  const end = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
  if (!isFinite(start) || !isFinite(end) || start > end || start >= total) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': 'bytes */' + total }
    });
  }

  const body = buf.slice(start, end + 1);
  const headers = new Headers();
  const type = cached.headers.get('Content-Type');
  if (type) headers.set('Content-Type', type);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + total);
  headers.set('Content-Length', String(body.byteLength));
  return new Response(body, { status: 206, statusText: 'Partial Content', headers });
}

// 读取预取清单：优先用最新网络版本，离线时退回缓存
async function loadManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (res && res.ok) {
      const core = await caches.open(CORE_CACHE);
      core.put(MANIFEST_URL, res.clone());
      return res.json();
    }
  } catch (e) { /* 离线：走缓存清单 */ }
  const cached = await caches.match(MANIFEST_URL);
  return cached ? cached.json() : null;
}

// 后台预热：先补外壳，再以 3 并发补图片 / 音效；已缓存的不重复下载
async function warmCache(delay) {
  if (delay > 0) await sleep(delay);
  const manifest = await loadManifest();
  if (!manifest) return;

  const core = await caches.open(CORE_CACHE);
  for (const url of manifest.shell || []) {
    if (await core.match(url, { ignoreSearch: true })) continue;
    await fetch(url)
      .then((res) => { if (res && res.ok) return core.put(url, res); })
      .catch(() => {});
  }

  // 图片约 5MB：等首屏交互稳定后再慢慢补，避免抢占正在进行的加载
  await sleep(2500);
  const assets = await caches.open(ASSET_CACHE);
  const list = (manifest.assets || []).slice();
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const url = list[cursor++];
      const target = PACK_RE.test(url) ? core : assets;
      if (await target.match(url, { ignoreSearch: true })) continue;
      try {
        const res = await fetch(url);
        if (res && res.ok) await target.put(url, res);
      } catch (e) { /* 单个失败不影响其它 */ }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
