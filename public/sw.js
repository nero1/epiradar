/**
 * EpiRadar Service Worker
 * Caches the dashboard shell and last-known data for offline access.
 * PRD requirement: "offline fallback — last cached dashboard renders from service worker when offline"
 */

const CACHE_NAME = "epiradar-v1";
const STATIC_CACHE_NAME = "epiradar-static-v1";

const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/offline",
];

const CACHEABLE_API_PATTERNS = [
  /\/api\/v1\/risk-scores/,
  /\/api\/v1\/alerts\?/,
];

// Install: pre-cache static shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// Activate: clean up old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name)),
      ),
    ),
  );
  self.clients.claim();
});

// Fetch: cache-first for static assets, network-first for API routes
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Network-first with cache fallback for API risk data
  if (CACHEABLE_API_PATTERNS.some((pattern) => pattern.test(url.pathname + url.search))) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Cache-first for static assets
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first for pages — fallback to cache, then offline page
  event.respondWith(networkFirstWithOfflineFallback(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "offline", cached: false }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Serve the cached home page as the offline fallback
    const offlineFallback = await caches.match("/");
    return offlineFallback ?? new Response("Offline", { status: 503 });
  }
}
