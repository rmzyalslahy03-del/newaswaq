// service-worker.js - نسخة محسّنة مع دعم التثبيت الفوري
const CACHE_NAME = 'markets-v3'; // غيّر الإصدار لتحديث الكاش
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/common.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
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
  // تجاهل طلبات Supabase API
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(error => {
        console.warn('[SW] فشل الجلب من الشبكة، نعيد المخبأ إن وُجد');
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// ============= إشعار نجاح التثبيت (للمطور) =============
self.addEventListener('message', event => {
  if (event.data === 'check-install') {
    // الرد بأن SW يعمل
    event.ports[0].postMessage({ installed: true, version: CACHE_NAME });
  }
});
