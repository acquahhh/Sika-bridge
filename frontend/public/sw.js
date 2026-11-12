// SikaBridge service worker: makes the app installable and lets the shell load
// offline. API calls are never cached — balances and transfers must be live.
const CACHE = 'sikabridge-shell-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/favicon.svg', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  // Only handle same-origin GETs; the API lives on another origin and is never cached.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Page navigations: network first, fall back to the cached shell (SPA routing).
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')))
    return
  }

  // Hashed build assets and icons: cache first, then network (and remember it).
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
