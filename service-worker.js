// service-worker.js - النسخة النهائية المستقرة
// تدعم التثبيت الفوري، التحديث التلقائي، والتخزين المؤقت للعناصر الأساسية

const CACHE_NAME = 'markets-v4'; // تم تحديث الإصدار
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/common.js',
  '/common.css',
  '/manifest.json',
  '/redirect.html',
  '/robots.txt',
  '/sitemap.xml',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0' // ✅ تم تثبيت الإصدار
];

// ============= حدث التثبيت =============
self.addEventListener('install', event => {
  console.log('[SW] تثبيت الإصدار:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] تخزين الأصول الثابتة');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] التثبيت اكتمل، يتم التفعيل الفوري');
        return self.skipWaiting(); // تفعيل SW فوراً
      })
      .catch(err => {
        console.error('[SW] فشل التثبيت:', err);
      })
  );
});

// ============= حدث التفعيل =============
self.addEventListener('activate', event => {
  console.log('[SW] تفعيل الإصدار:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] حذف الكاش القديم:', key);
            return caches.delete(key);
          })
      );
    }).then(() => {
      console.log('[SW] أصبح SW مسيطراً على جميع الصفحات');
      return self.clients.claim();
    })
  );
});

// ============= استراتيجية الجلب: Cache First مع تحديث خفي =============
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // تجاهل طلبات Supabase API (لا نخزنها في الكاش)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // تجاهل طلبات التحليلات والإحصائيات
  if (url.hostname.includes('google-analytics.com') || 
      url.hostname.includes('googletagmanager.com') ||
      url.hostname.includes('plausible.io')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // إذا وُجد في الكاش، نعيده فوراً ثم نحدثه في الخلفية
      const fetchPromise = fetch(event.request)
        .then(networkResponse => {
          // نخزن النسخة الجديدة فقط إذا كانت الاستجابة سليمة
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(error => {
          console.warn('[SW] فشل الجلب من الشبكة:', url.pathname);
          // إذا كان هناك استجابة مخبأة، نعيدها حتى لو كانت قديمة
          return cachedResponse;
        });

      // نعيد المخبأ إن وُجد، وإلا ننتظر الشبكة
      return cachedResponse || fetchPromise;
    })
  );
});

// ============= الاستماع لرسائل من الصفحة =============
self.addEventListener('message', event => {
  if (event.data === 'check-install') {
    // الرد بأن SW يعمل
    if (event.ports && event.ports.length > 0) {
      event.ports[0].postMessage({ 
        installed: true, 
        version: CACHE_NAME,
        cacheSize: STATIC_ASSETS.length
      });
    }
  }

  // تحديث الكاش عند طلب من الصفحة
  if (event.data === 'refresh-cache') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        return cache.addAll(STATIC_ASSETS);
      })
    );
  }
});

// ============= إشعار للمطور في وحدة التحكم =============
console.log('[SW] Service Worker جاهز ويعمل بكفاءة ✅');