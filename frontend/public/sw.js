// Minimal service worker to enable PWA installability
self.addEventListener('install', (event) => {
  // Activate immediately after installation
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of uncontrolled clients as soon as possible
  event.waitUntil(self.clients.claim());
});

// Optional: basic offline fallback (no caching by default)
// You can extend this later to cache assets for offline usage.