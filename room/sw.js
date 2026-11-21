/* 背水平台进服大厅 · 离线外壳缓存
 * 策略：同源 GET 网络优先，失败时回退缓存。
 * 不缓存 /api/ 请求，避免本地启动接口与实时状态被旧数据覆盖。
 */
const CACHE = 'bsp-room-v2.11.0';
const CORE = [
  './',
  './index.html',
  './assets/room.css',
  './assets/room.js',
  './assets/logo.png',
  './assets/favicon.ico',
  './data/servers.js',
  './manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') !== -1) return;

  event.respondWith(
    fetch(request)
      .then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      })
      .catch(function () {
        return caches.match(request).then(function (cached) {
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});
