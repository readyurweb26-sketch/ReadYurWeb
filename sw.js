// Service Worker for ReadYurWeb – P3 Offline & PWA support
const CACHE_NAME = 'ryw-v1';

// Offline fallback HTML (shown when a navigation request fails)
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You are offline – ReadYurWeb</title>
  <style>
    body { background: #08090B; color: #F2F0EA; font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .container { text-align: center; }
    .logo { font-family: 'Fraunces', serif; font-size: 28px; color: #C9A668; margin-bottom: 20px; }
    .logo span { display: inline-block; width: 10px; height: 10px; background: #C9A668; border-radius: 2px; margin-right: 8px; }
    p { color: #9A9C9F; font-size: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo"><span></span>ReadYurWeb</div>
    <p>You’re offline. Please check your connection.</p>
  </div>
</body>
</html>`;

// List of resources to cache during installation.
// These are same‑origin or CORS‑enabled (CDNs, picsum, Google Fonts).
const PRECACHE_URLS = [
  '/',                          // main page (index.html)
  '/privacy.html',              // privacy policy page (if it exists)
  '/manifest.json',             // so install works offline
  // Google Fonts CSS (the exact link used in your HTML)
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..900,0..100,0..1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  // GSAP & Lenis from CDNs
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
  'https://unpkg.com/lenis@1.1.13/dist/lenis.min.js',
  // Industry tile photos (10 images)
  'https://picsum.photos/seed/ryw-gyms/640/640',
  'https://picsum.photos/seed/ryw-restaurants/640/640',
  'https://picsum.photos/seed/ryw-clothing/640/640',
  'https://picsum.photos/seed/ryw-coaching/640/640',
  'https://picsum.photos/seed/ryw-karate/640/640',
  'https://picsum.photos/seed/ryw-salons/640/640',
  'https://picsum.photos/seed/ryw-clinics/640/640',
  'https://picsum.photos/seed/ryw-startups/640/640',
  'https://picsum.photos/seed/ryw-travel/640/640',
  'https://picsum.photos/seed/ryw-mobile-stores/640/640',
  // Bento card background photos (10 images)
  'https://picsum.photos/seed/ryw-svc-business-websites/640/480',
  'https://picsum.photos/seed/ryw-svc-landing-pages/640/480',
  'https://picsum.photos/seed/ryw-svc-booking-systems/640/480',
  'https://picsum.photos/seed/ryw-svc-membership-systems/640/480',
  'https://picsum.photos/seed/ryw-svc-billing-systems/640/480',
  'https://picsum.photos/seed/ryw-svc-admin-dashboards/640/480',
  'https://picsum.photos/seed/ryw-svc-ecommerce-stores/640/480',
  'https://picsum.photos/seed/ryw-svc-whatsapp-integration/640/480',
  'https://picsum.photos/seed/ryw-svc-seo-setup/640/480',
  'https://picsum.photos/seed/ryw-svc-website-maintenance/640/480',
  // Work card images (6 images)
  'https://picsum.photos/seed/ryw-work-ironcore/800/1000',
  'https://picsum.photos/seed/ryw-work-tablefourteen/800/1000',
  'https://picsum.photos/seed/ryw-work-norquest/800/1000',
  'https://picsum.photos/seed/ryw-work-flowstack/800/1000',
  'https://picsum.photos/seed/ryw-work-apexprep/800/1000',
  'https://picsum.photos/seed/ryw-work-wellpoint/800/1000',
  // Partner image
  'https://picsum.photos/seed/ryw-partner-norquest/640/480'
];

// Install event: cache all static resources.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate event: delete old caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// Helper: determine if a request is for a navigation (HTML document).
function isNavigation(request) {
  return request.mode === 'navigate';
}

// Helper: is the request for a static asset we can cache aggressively?
function isStaticAsset(url) {
  return url.startsWith('https://cdnjs.cloudflare.com') ||
         url.startsWith('https://unpkg.com') ||
         url.startsWith('https://picsum.photos') ||
         url.startsWith('https://fonts.googleapis.com') ||
         url.startsWith('https://fonts.gstatic.com');
}

// Fetch handler: different strategies depending on request type.
self.addEventListener('fetch', event => {
  const { request } = event;

  // Don't intercept non‑GET requests.
  if (request.method !== 'GET') return;

  // For navigation requests, use stale‑while‑revalidate.
  if (isNavigation(request)) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        const fetchPromise = fetch(request)
          .then(networkResponse => {
            // Update cache with the fresh response.
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            });
          })
          .catch(() => {
            // If offline and no cache, show the offline fallback.
            return cachedResponse || caches.match('/').then(cachedHome => {
              if (cachedHome) return cachedHome;
              return new Response(OFFLINE_HTML, {
                status: 503,
                headers: { 'Content-Type': 'text/html' }
              });
            });
          });

        // Return the cached response immediately if available, else wait for network.
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // For static assets (scripts, fonts, images), use cache‑first.
  if (isStaticAsset(request.url)) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) return cachedResponse;

        return fetch(request).then(networkResponse => {
          return caches.open(CACHE_NAME).then(cache => {
            // Cache a clone of the response (even opaque).
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // For everything else (API calls, etc.), just go to the network.
  event.respondWith(fetch(request));
});