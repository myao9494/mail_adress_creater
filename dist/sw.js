const CACHE_NAME = 'outlook-address-maker-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg']

const shouldHandleRequest = request => {
  const url = new URL(request.url)
  return (
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.endsWith('.csv')
  )
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => (
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  if (!shouldHandleRequest(event.request)) {
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy)).catch(() => undefined)
          return response
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then(cached => (
      cached || fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => undefined)
        }
        return response
      })
    )),
  )
})
