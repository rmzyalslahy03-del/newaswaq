// service-worker.js
const CACHE_NAME = 'markets-v2'; // غيّر الإصدار عند أي تحديث كبير للملفات الثابتة
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
  console.log('[SW] تثبيت...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] تخزين الأصول الثابتة');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()) // تفعيل الـ SW فوراً دون انتظار إغلاق علامات التبويب القديمة
  );
});

// ============= حدث التفعيل =============
self.addEventListener('activate', event => {
  console.log('[SW] تفعيل...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] حذف الكاش القديم:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim()) // سيطرة الـ SW على جميع الصفحات المفتوحة
  );
});

// ============= استراتيجية الجلب: Cache First مع تحديث خفي (Stale-While-Revalidate) =============
self.addEventListener('fetch', event => {
  // لا نتدخل في طلبات Supabase API حتى لا نكسر البيانات الحية
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // نعيد النسخة المخبأة فوراً إن وُجدت
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // إذا نجح الطلب، نُحدّث الكاش بنسخة جديدة
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(error => {
        // في حال فشل الاتصال ولم توجد نسخة مخبأة، نُظهر خطأً (لكن في حالتنا غالباً سيكون هناك كاش)
        console.warn('[SW] فشل الجلب من الشبكة:', error);
        return cachedResponse; // نُعيد المخبأ إن وُجد، وإلا undefined
      });

      // نُعيد المخبأ فوراً إن وُجد، وإلا ننتظر الشبكة
      return cachedResponse || fetchPromise;
    })
  );
});
