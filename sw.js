// ZZH 作品集 Service Worker
const CACHE_VERSION = 'zzh-portfolio-v2';
const STATIC_CACHE = CACHE_VERSION + '-static';
const IMAGES_CACHE = CACHE_VERSION + '-images';
const MAX_IMAGES_CACHE = 100; // 最多缓存 100 张图片

// 核心静态资源
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// 允许的图片域名（防盗链白名单）
const ALLOWED_IMAGE_DOMAINS = [
  'zzh994.ltd',
  'www.zzh994.ltd',
  'project-7bdka.vercel.app'
];

// 安装：缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
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
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 检查是否是允许的图片请求（防盗链）
function isAllowedImageRequest(request) {
  try {
    const url = new URL(request.url);
    // 同源请求总是允许
    if (url.origin === self.location.origin) return true;
    // 检查白名单域名
    return ALLOWED_IMAGE_DOMAINS.some(domain => url.hostname.includes(domain));
  } catch (e) {
    return false;
  }
}

// 检查 Referer 是否合法（防盗链）
function isValidReferer(request) {
  const referer = request.headers.get('Referer') || '';
  if (!referer) return true; // 没有 Referer 允许（直接访问）
  try {
    const refUrl = new URL(referer);
    // 来自本站的请求允许
    if (refUrl.origin === self.location.origin) return true;
    // 来自白名单域名的请求允许
    return ALLOWED_IMAGE_DOMAINS.some(domain => refUrl.hostname.includes(domain));
  } catch (e) {
    return true;
  }
}

// 限制图片缓存数量
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // 删除最旧的缓存
    await cache.delete(keys[0]);
  }
}

// 请求拦截
self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  const request = event.request;
  const url = new URL(request.url);

  // 图片请求：Cache First 策略 + 防盗链 + 离线缓存
  if (request.destination === 'image' || url.pathname.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i)) {
    // 防盗链检查
    if (!isAllowedImageRequest(request) || !isValidReferer(request)) {
      // 盗链请求返回 403
      event.respondWith(
        new Response('Forbidden', { status: 403, statusText: 'Forbidden' })
      );
      return;
    }

    event.respondWith(
      caches.open(IMAGES_CACHE).then(async (cache) => {
        // 先查缓存
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }
        // 缓存未命中，发起网络请求
        try {
          const response = await fetch(request);
          if (response && response.status === 200) {
            // 克隆响应并缓存
            const responseToCache = response.clone();
            await cache.put(request, responseToCache);
            // 限制缓存大小
            await limitCacheSize(IMAGES_CACHE, MAX_IMAGES_CACHE);
          }
          return response;
        } catch (error) {
          // 网络失败且缓存未命中，返回占位图
          return new Response('', { status: 408, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // 页面/脚本/样式：Stale-While-Revalidate 策略
  if (request.destination === 'document' || 
      request.destination === 'script' || 
      request.destination === 'style' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then((response) => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 其他请求：Network First 策略
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// 监听消息（用于手动清理缓存等）
self.addEventListener('message', (event) => {
  if (event.data === 'clearCache') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
  if (event.data === 'getCacheStats') {
    caches.keys().then(async (names) => {
      const stats = {};
      for (const name of names) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        stats[name] = keys.length;
      }
      event.source.postMessage({ type: 'cacheStats', data: stats });
    });
  }
});
