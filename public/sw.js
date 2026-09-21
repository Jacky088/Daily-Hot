// Service Worker — Daily Hot
// Network-First for HTML/JS/CSS（保证每次部署后用户立即拿到新代码，离线才回退缓存），API 同样 Network-First
// 发版时递增：缓存名变化才会触发 activate 清理旧缓存，
// 否则用户浏览器会一直沿用上一版的 JS/CSS
const CACHE_NAME = 'daily-hot-v51';
const STATIC_ASSETS = ['/style.css', '/app.js', '/wallpaper.html', '/manifest.json', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API 请求：Network-Only，直接放行不拦截。
  // 热榜数据离线重放没有意义，缓存只会让恢复网络后仍看到陈旧数据，且无淘汰策略会无限增长。
  if (url.pathname.startsWith('/v2/')) return;

  // 跨域资源（如必应壁纸图）：直接放行，不写缓存（opaque 响应无法 put，且无缓存价值）
  if (url.origin !== location.origin) return;

  // 平台 Logo 与图标资源：Stale-While-Revalidate（缓存优先秒出，后台静默更新）
  // 解决每次打开页面数十个平台 Logo 网络重试/慢速导致的闪烁空白
  if (url.pathname.startsWith('/logos/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // HTML 请求：Network-First（确保每次获取最新页面）
  if (url.pathname === '/' || url.pathname === '/index.html' || e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // HTML 与静态资源（CSS/JS）：一律 Network-First，离线时回退缓存。
  // 之前 JS/CSS 用永久 Cache-First，导致每次部署后老用户一直跑旧代码
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
