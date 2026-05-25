const CACHE_NAME = 'cinememo-v2';
const STATIC_CACHE = 'cinememo-static-v2';
const DYNAMIC_CACHE = 'cinememo-dynamic-v1';

const STATIC_ASSETS = [
  'index.html',
  'style.css',
  'js/logger.js',
  'js/config.js',
  'js/lazyload.js',
  'js/utils.js',
  'js/auth.js',
  'js/offline.js',
  'js/cache.js',
  'js/sync.js',
  'js/api.js',
  'js/backup.js',
  'js/components.js',
  'js/toast.js',
  'js/app.js'
];

const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Satisfy&display=swap'
];

const EXTERNAL_APIS = [
  'supabase.co',
  'api.themoviedb.org',
  'image.tmdb.org'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        
        const localPromises = STATIC_ASSETS.map(url => {
          return cache.add(url).catch(err => {
            console.log('[SW] Failed to cache:', url, err.message);
          });
        });
        
        const externalPromises = EXTERNAL_ASSETS.map(url => {
          return fetch(url, { mode: 'cors' })
            .then(response => {
              if (response.ok) {
                return cache.put(url, response);
              }
            })
            .catch(err => {
              console.log('[SW] Failed to cache external:', url);
            });
        });
        
        return Promise.all([...localPromises, ...externalPromises]);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  if (request.method !== 'GET') {
    return;
  }
  
  if (isApiRequest(url)) {
    return;
  }
  
  if (isStaticAsset(url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  if (isTmdbImage(url)) {
    event.respondWith(cacheFirstWithFallback(request));
    return;
  }
  
  if (url.origin === location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

function isApiRequest(url) {
  return EXTERNAL_APIS.some(api => url.hostname.includes(api)) && 
         !url.pathname.includes('.jpg') && 
         !url.pathname.includes('.png') &&
         !url.pathname.includes('.webp');
}

function isStaticAsset(url) {
  return url.origin === location.origin && (
    url.pathname.endsWith('.js') || 
    url.pathname.endsWith('.css') || 
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/')
  );
}

function isTmdbImage(url) {
  return url.hostname.includes('tmdb.org') || 
         url.hostname.includes('image.tmdb');
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Network failed, using cache:', request.url);
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        const cache = caches.open(DYNAMIC_CACHE);
        cache.then(c => c.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => cached);
  
  return cached || fetchPromise;
}

async function cacheFirstWithFallback(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150"><rect fill="#6C5CE7" width="100" height="150"/><text x="50" y="75" text-anchor="middle" fill="white" font-size="40">🎬</text></svg>',
      {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' }
      }
    );
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      })
    );
  }
});
