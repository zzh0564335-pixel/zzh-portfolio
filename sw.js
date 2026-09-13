// ZZH 作品集 Service Worker
const CACHE_NAME = 'zzh-portfolio-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// 安装：缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截：缓存优先策略
self.addEventListener('fetch', (event) => {
  // 只缓存 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        // 如果缓存命中，返回缓存
        if (cached) return cached;

        // 否则发起网络请求
        return fetch(event.request).then((response) => {
          // 检查是否是有效的响应
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // 克隆响应（因为响应流只能读取一次）
          const responseToCache = response.clone();

          // 缓存新资源
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        }).catch(() => {
          // 网络失败时，如果是图片请求，可以返回一个占位
          if (event.request.destination === 'image') {
            return new Response('', { status: 408, statusText: 'Offline' });
          }
          // 页面请求失败时返回首页
          return caches.match('/index.html');
        });
      })
  );
});
