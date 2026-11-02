importScripts('{{route}}{{/scram/controller.sw.js}}');

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    (async () => {
      if ($scramjetController.shouldRoute(event))
        return $scramjetController.route(event);

      return fetch(event.request);
    })()
  );
});
