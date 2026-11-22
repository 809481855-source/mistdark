/* 迷雾暗黑 · 本地缓存 Service Worker
 *
 * 线上静态托管对所有文件返回 Cache-Control: no-store，浏览器不会缓存任何资源，
 * 每次打开都要重新下载约 1MB 脚本 + 4MB 图片 + 音频。这里用 Cache Storage
 * 在本地兜一层：第二次打开起全部走本地，不再产生下载等待。
 *
 * 策略：
 *   页面导航   → 网络优先（保证 index.html 永远最新），网络失败 / 超时才用缓存；
 *   CSS / JS   → 缓存优先（地址带 ?v= 版本号，发版时改 index.html 里的版本号即更新）；
 *   图片 / 音频 → 缓存优先（美术 / 音频有改动时把 ASSET_VERSION 加一，旧缓存自动清掉）。
 */
const CORE_VERSION = 'c1';             // 脚本 / 样式更新策略变化时 +1
const ASSET_VERSION = 'r2';            // 美术 / 音频有改动时 +1
const CORE_CACHE = 'mistdark-core-' + CORE_VERSION;
const ASSET_CACHE = 'mistdark-asset-' + ASSET_VERSION;
const NET_TIMEOUT = 4000;              // 导航请求最多等 4 秒，超时就走缓存

const ASSET_RE = /\.(png|jpe?g|webp|gif|svg|mp3|ogg|wav)$/i;
const CODE_RE = /\.(css|js)$/i;

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
  // Range 请求（音频拖动进度）不接管，避免返回整段缓存导致播放异常
  if (req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(event, CORE_CACHE));
    return;
  }
  if (CODE_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(event, CORE_CACHE));
    return;
  }
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(event, ASSET_CACHE));
  }
});

async function networkFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetchWithTimeout(event.request, NET_TIMEOUT);
    if (res && res.ok) await cache.put(event.request, res.clone());
    return res;
  } catch (e) {
    const cached = (await cache.match(event.request)) ||
      (await cache.match(self.registration.scope));
    if (cached) return cached;
    return new Response('当前离线，且本地没有可用缓存', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const res = await fetch(event.request);
  // 写完缓存再返回，避免响应返回后 SW 被回收导致缓存没落盘
  if (res && res.ok) await cache.put(event.request, res.clone());
  return res;
}

function fetchWithTimeout(req, ms) {
  if (!self.AbortController) return fetch(req);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(req, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}
