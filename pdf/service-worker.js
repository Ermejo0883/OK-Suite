/* ============================================================
   OK Suite - PDF  |  Service Worker
   Versione cache: oksuite-pdf-v11
   
   Strategia:
   - Cache-first  → file locali (index.html, manifest, sw, font)
   - Network-first → CDN DevExpress (aggiornamenti automatici)
   - Fallback offline per tutto il resto
============================================================ */

const CACHE_NAME    = 'oksuite-pdf-v11';
const CACHE_RUNTIME = 'oksuite-pdf-runtime-v2';

/* File locali da mettere subito in cache durante l'install */
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './service-worker.js',
  './icons/icon-192.png',
  './favicon.ico',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/favicon-180.png',
  './icons/icon-512.png',
  /* Google Fonts CSS */
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap',
  /* PDF.js (caricato dinamicamente — non in precache) */
];

/* Origini CDN da trattare con strategia network-first */
const NETWORK_FIRST_ORIGINS = [
  'cdn3.devexpress.com',
  'fonts.gstatic.com',
];

/* ============================================================
   INSTALL — precache delle risorse essenziali
============================================================ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Precaching risorse essenziali…');
        // addAll fallisce se anche una sola risorsa non è raggiungibile,
        // per questo usiamo Promise.allSettled per non bloccare l'install
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => {
              console.warn('[SW] Precache fallito per:', url, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Install completato');
        // Attiva immediatamente senza aspettare che le tab esistenti si chiudano
        return self.skipWaiting();
      })
  );
});

/* ============================================================
   ACTIVATE — rimuove cache obsolete
============================================================ */
self.addEventListener('activate', event => {
  const validCaches = [CACHE_NAME, CACHE_RUNTIME];

  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => !validCaches.includes(key))
            .map(key => {
              console.log('[SW] Rimozione cache obsoleta:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => {
        console.log('[SW] Activate completato — controllo tutte le tab');
        return self.clients.claim();
      })
  );
});

/* ============================================================
   FETCH — intercetta le richieste
============================================================ */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora richieste non-GET (POST per AdMob, Billing, ecc.)
  if (request.method !== 'GET') return;

  // Ignora richieste chrome-extension e simili
  if (!['http:', 'https:'].includes(url.protocol)) return;

  // ── Network-first per CDN DevExpress e Google Fonts gstatic ──
  if (NETWORK_FIRST_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── Cache-first per tutto il resto (file locali, Google Fonts CSS) ──
  event.respondWith(cacheFirst(request));
});

/* ============================================================
   STRATEGIA: Cache-First
   1. Cerca in cache → restituisce subito se trovato
   2. Se non in cache → fetch dalla rete → salva in cache runtime
============================================================ */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('[SW] Cache-first fallback offline per:', request.url);
    // Fallback: index.html per navigazione
    if (request.destination === 'document') {
      return caches.match('./index.html');
    }
    return new Response('Risorsa non disponibile offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/* ============================================================
   STRATEGIA: Network-First
   1. Prova la rete → se ok, aggiorna cache e restituisce
   2. Se rete non disponibile → fallback alla cache
============================================================ */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('[SW] Network-first: rete non disponibile, uso cache per:', request.url);
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Risorsa CDN non disponibile offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/* ============================================================
   MESSAGGIO: aggiornamento forzato dalla app
   Inviare postMessage({ type: 'SKIP_WAITING' }) per aggiornare
   il service worker senza ricaricare la pagina
============================================================ */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] Aggiornamento forzato dalla app');
    self.skipWaiting();
  }
});
