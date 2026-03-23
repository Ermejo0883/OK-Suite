/* ============================================================
   OK Suite - PDF  |  Service Worker
   
   Strategia aggiornamenti:
   - version.json scaricato SEMPRE dalla rete (no cache)
   - Se versione cambiata → svuota cache → notifica pagina
   - Nessuna modifica al service-worker.js necessaria per aggiornare
   
   Strategia cache:
   - index.html    → Network-first (sempre aggiornato)
   - Cache-first   → file locali statici
   - Network-first → CDN esterni
   - Pagina offline dedicata se nessuna rete

   Fix v1.1.26:
   - sharedFileStore sostituito con Cache API
   - Il file condiviso sopravvive al riavvio del SW
============================================================ */

const CACHE_BASE    = 'oksuite-pdf';
const CACHE_RUNTIME = 'oksuite-pdf-runtime';
const CACHE_SHARE   = 'oksuite-pdf-share';
const VERSION_URL   = './version.json';

const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './favicon.ico',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/favicon-180.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap',
];

const NETWORK_FIRST_ORIGINS = [
  'cdn3.devexpress.com',
  'fonts.gstatic.com',
];

/* ============================================================
   OFFLINE PAGE
============================================================ */
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="theme-color" content="#0f1117"/>
  <title>OK Suite PDF — Offline</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100dvh;background:#0f1117;color:#e8eaf6;font-family:'DM Sans',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:32px;text-align:center}
    img{width:110px;height:110px;opacity:.85;animation:float 3s ease-in-out infinite}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
    h1{font-size:22px;font-weight:700}
    p{font-size:14px;color:#8892b0;line-height:1.6;max-width:280px}
    .badge{background:#e53935;color:#fff;font-size:9px;font-weight:700;letter-spacing:.8px;padding:2px 6px;border-radius:3px;display:inline-block;margin-bottom:4px}
    button{margin-top:8px;background:#4f8ef7;color:#fff;border:none;border-radius:12px;padding:13px 28px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(79,142,247,.35)}
    button:active{opacity:.85}
  </style>
</head>
<body>
  <div>
    <div class="badge">PDF</div><br/>
    <img src="./icons/mascot.png" alt="OK Suite PDF" onerror="this.style.display='none'"/>
  </div>
  <h1>Sei offline</h1>
  <p>Nessuna connessione disponibile.<br/>I file PDF già aperti funzionano normalmente.<br/>Riconnettiti per scaricare nuovi documenti.</p>
  <button onclick="location.reload()">Riprova</button>
</body>
</html>`;

/* ============================================================
   HELPER — legge la versione salvata in cache
============================================================ */
async function getCachedVersion() {
  try {
    const cached = await caches.match(VERSION_URL);
    if (!cached) return null;
    const data = await cached.json();
    return data.version || null;
  } catch { return null; }
}

/* ============================================================
   HELPER — scarica la versione dal server (no cache)
============================================================ */
async function fetchRemoteVersion() {
  try {
    const res = await fetch(VERSION_URL + '?t=' + Date.now(), {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { version: data.version || null, response: res };
  } catch { return null; }
}

/* ============================================================
   HELPER — svuota tutte le cache dell'app (tranne share)
============================================================ */
async function clearAllCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter(k => k.startsWith(CACHE_BASE) && k !== CACHE_SHARE)
      .map(k => caches.delete(k))
  );
  console.log('[SW] Cache svuotata');
}

/* ============================================================
   INSTALL — precache risorse essenziali
============================================================ */
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const remote = await fetchRemoteVersion();
      const cachedVer = await getCachedVersion();

      if (remote && remote.version !== cachedVer) {
        await clearAllCaches();
        console.log('[SW] Nuova versione:', remote.version, '— cache svuotata');
      }

      const cache = await caches.open(CACHE_BASE + '-' + (remote?.version || 'default'));
      
      if (remote) {
        const versionRes = await fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' });
        await cache.put(VERSION_URL, versionRes);
      }

      await Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Precache fallito per:', url, err.message)
          )
        )
      );

      console.log('[SW] Install completato — versione:', remote?.version);
      return self.skipWaiting();
    })()
  );
});

/* ============================================================
   ACTIVATE — notifica la pagina se app aggiornata
============================================================ */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const remote = await fetchRemoteVersion();
      const currentCache = CACHE_BASE + '-' + (remote?.version || 'default');
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_BASE) && k !== currentCache && k !== CACHE_RUNTIME && k !== CACHE_SHARE)
          .map(k => { console.log('[SW] Rimozione cache obsoleta:', k); return caches.delete(k); })
      );

      await self.clients.claim();

      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: remote?.version }));
      console.log('[SW] Activate completato — notifica SW_UPDATED inviata');
    })()
  );
});

/* ============================================================
   FETCH
============================================================ */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  console.log('[SW FETCH]', request.method, url.pathname);

  /* ----------------------------------------------------------
     POST /share-pdf — Share Intent Android
     Salva il file nella Cache API (sopravvive al riavvio SW)
  ---------------------------------------------------------- */
  if (request.method === 'POST' && url.pathname === '/share-pdf') {
    console.log('[SW] Intercettato POST /share-pdf');
    event.respondWith((async () => {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        console.log('[SW] FormData file:', file?.name, file?.size);
        if (file && file instanceof File) {
          const key = 'shared-' + Date.now();
          const cache = await caches.open(CACHE_SHARE);
          const response = new Response(file, {
            headers: {
              'Content-Type': file.type || 'application/pdf',
              'X-File-Name': encodeURIComponent(file.name)
            }
          });
          await cache.put('/share-temp/' + key, response);
          console.log('[SW] Share target: file salvato in cache:', file.name, 'key:', key);
          return Response.redirect('/?share=' + key, 303);
        } else {
          console.warn('[SW] Share target: nessun file nel formData');
        }
      } catch(e) {
        console.error('[SW] Share target errore:', e);
      }
      return Response.redirect('/', 303);
    })());
    return;
  }

  /* ----------------------------------------------------------
     GET /open-pdf — File Handler Android ("Apri con")
  ---------------------------------------------------------- */
  if (request.method === 'GET' && url.pathname === '/open-pdf') {
    console.log('[SW] Intercettato GET /open-pdf — params:', url.search);
    event.respondWith((async () => {
      const redirectUrl = '/index.html' + url.search + url.hash;
      return Response.redirect(redirectUrl, 302);
    })());
    return;
  }

  if (request.method !== 'GET') return;
  if (!['http:', 'https:'].includes(url.protocol)) return;

  /* ----------------------------------------------------------
     version.json — SEMPRE dalla rete
  ---------------------------------------------------------- */
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(res => {
          const headers = new Headers(res.headers);
          headers.set('x-sw-cache', 'bypass');
          return new Response(res.body, { status: res.status, headers });
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  /* ----------------------------------------------------------
     index.html — Network-first
  ---------------------------------------------------------- */
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  /* ----------------------------------------------------------
     CDN esterni — Network-first
  ---------------------------------------------------------- */
  if (NETWORK_FIRST_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(networkFirst(request));
    return;
  }

  /* ----------------------------------------------------------
     Tutto il resto — Cache-first
  ---------------------------------------------------------- */
  event.respondWith(cacheFirst(request));
});

/* ============================================================
   STRATEGIA: Cache-First con fallback offline
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
    console.warn('[SW] Offline — fallback per:', request.url);
    if (request.destination === 'document') {
      return new Response(OFFLINE_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('Risorsa non disponibile offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/* ============================================================
   STRATEGIA: Network-First con fallback cache
============================================================ */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('[SW] Network-first offline:', request.url);
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.destination === 'document') {
      return new Response(OFFLINE_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('Risorsa CDN non disponibile offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/* ============================================================
   MESSAGGIO: aggiornamento forzato + recupero file condiviso
============================================================ */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] Aggiornamento forzato dalla app');
    self.skipWaiting();
  }

  /* ----------------------------------------------------------
     Recupera file condiviso dalla Cache API
  ---------------------------------------------------------- */
  if (event.data?.type === 'GET_SHARED_FILE') {
    const key = event.data.key;
    console.log('[SW] GET_SHARED_FILE richiesto per key:', key);
    (async () => {
      try {
        const cache = await caches.open(CACHE_SHARE);
        const cached = await cache.match('/share-temp/' + key);
        if (cached) {
          const buffer = await cached.arrayBuffer();
          const name = decodeURIComponent(cached.headers.get('X-File-Name') || 'documento.pdf');
          const type = cached.headers.get('Content-Type') || 'application/pdf';
          await cache.delete('/share-temp/' + key);
          console.log('[SW] File inviato dalla cache:', name);
          event.ports[0].postMessage({
            type: 'SHARED_FILE',
            name,
            type,
            buffer
          });
        } else {
          console.warn('[SW] File non trovato in cache per key:', key);
          event.ports[0].postMessage({ type: 'SHARED_FILE_NOT_FOUND' });
        }
      } catch(e) {
        console.error('[SW] Errore recupero cache:', e);
        event.ports[0].postMessage({ type: 'SHARED_FILE_NOT_FOUND' });
      }
    })();
  }
});