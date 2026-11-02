importScripts('{{route}}{{/scram/controller.sw.js}}');

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const SJ_CONTROLLER_PREFIX = '{{route}}{{/scram/network/}}';

const blacklist = new Set();
fetch('{{route}}{{/assets/txt/blacklist.txt}}')
  .then((response) => response.text())
  .then((textData) => {
    for (const line of textData.split('\n')) {
      const domain = line.trim();
      if (!domain || domain.charCodeAt(0) === 35 /* '#' */) continue;
      blacklist.add(domain.toLowerCase());
    }
  })
  .catch(() => {});
  
const isBlacklistedDomain = (domain) => {
  if (!domain || blacklist.size === 0) return false;
  let host = domain.toLowerCase();
  while (host.includes('.')) {
    if (blacklist.has(host)) return true;
    host = host.slice(host.indexOf('.') + 1);
  }
  return false;
};

const targetHostnameForScramjet = (reqUrl) => {
  try {
    const path = new URL(reqUrl).pathname;
    if (!path.startsWith(SJ_CONTROLLER_PREFIX)) return null;
    const rest = path.slice(SJ_CONTROLLER_PREFIX.length).split('/');
    if (rest.length < 3) return null;
    const encoded = rest.slice(2).join('/');
    if (!encoded) return null;
    return new URL(decodeURIComponent(encoded)).hostname;
  } catch {
    return null;
  }
};

self.addEventListener('fetch', (event) => {
  event.respondWith(
    (async () => {
      if ($scramjetController.shouldRoute(event)) {
        const hostname = targetHostnameForScramjet(event.request.url);
        if (isBlacklistedDomain(hostname))
          return new Response('', { status: 204 });
        return $scramjetController.route(event);
      }

      return fetch(event.request);
    })()
  );
});
