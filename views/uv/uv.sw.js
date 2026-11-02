/* -----------------------------------------------
/* Authors: TitaniumNetwork
/* GNU Affero General Public License v3.0: https://www.gnu.org/licenses/agpl-3.0.en.html
/* Modified by Yoct to remove __uv$config and serve custom error pages.
/* Ultraviolet Service Worker Script (v3.2.7)
/* ----------------------------------------------- */

/*globals __uv$config*/
// Users must import the config (and bundle) prior to importing uv.sw.js
// This is to allow us to produce a generic bundle with no hard-coded paths.

/**
 * @type {import('../uv').UltravioletCtor}
 */
const Ultraviolet = self.Ultraviolet;

const cspHeaders = [
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'content-security-policy',
  'content-security-policy-report-only',
  'expect-ct',
  'feature-policy',
  'origin-isolation',
  'strict-transport-security',
  'upgrade-insecure-requests',
  'x-content-type-options',
  'x-download-options',
  'x-frame-options',
  'x-permitted-cross-domain-policies',
  'x-powered-by',
  'x-xss-protection',
];
const emptyMethods = ['GET', 'HEAD'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

class UVServiceWorker extends Ultraviolet.EventEmitter {
  constructor(config = self['{{__uv$config}}']) {
    super();
    if (!config.prefix) config.prefix = '/service/';
    this.config = config;
    /**
     * @type {InstanceType<Ultraviolet['BareClient']>}
     */
    this.bareClient = new Ultraviolet.BareClient();
  }
  /**
   *
   * @param {Event & {request: Request}} param0
   * @returns
   */
  route({ request }) {
    if (request.url.startsWith(location.origin + this.config.prefix))
      return true;
    else return false;
  }

  async fetchWithRetry(fetchedURL, fetchOpts, maxAttempts = 4) {
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.bareClient.fetch(fetchedURL, fetchOpts);
      } catch (err) {
        lastErr = err;
        const errMsg = String(err?.message || err || '');
        // Notify window clients to ensure BareMux transport is initialized
        try {
          const clients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          for (const client of clients) {
            client.postMessage({ msg: 'ensureBareMux' });
          }
        } catch {}
        try {
          new BroadcastChannel('bare-mux').postMessage({ type: 'refreshPort' });
        } catch {}

        if (
          errMsg.includes('no bare clients') ||
          errMsg.includes('BareTransport') ||
          attempt >= 1
        ) {
          try {
            this.bareClient = new Ultraviolet.BareClient();
          } catch {}
        }

        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  }

  /**
   *
   * @param {Event & {request: Request}} param0
   * @returns
   */
  async fetch({ request }) {
    /**
     * @type {string|void}
     */
    let fetchedURL;

    try {
      if (!request.url.startsWith(location.origin + this.config.prefix))
        return await fetch(request);

      const ultraviolet = new Ultraviolet(this.config);

      if (typeof this.config.construct === 'function') {
        this.config.construct(ultraviolet, 'service');
      }

      const db = await ultraviolet.cookie.db();

      ultraviolet.meta.origin = location.origin;
      ultraviolet.meta.base = ultraviolet.meta.url = new URL(
        ultraviolet.sourceUrl(request.url)
      );

      const requestCtx = new RequestContext(
        request,
        ultraviolet,
        !emptyMethods.includes(request.method.toUpperCase())
          ? await request.blob()
          : null
      );

      if (ultraviolet.meta.url.protocol === 'blob:') {
        requestCtx.blob = true;
        requestCtx.base = requestCtx.url = new URL(requestCtx.url.pathname);
      }

      if (request.referrer && request.referrer.startsWith(location.origin)) {
        try {
          const referer = new URL(ultraviolet.sourceUrl(request.referrer));

          if (
            requestCtx.headers.origin ||
            (ultraviolet.meta.url.origin !== referer.origin &&
              request.mode === 'cors')
          ) {
            requestCtx.headers.origin = referer.origin;
          }

          requestCtx.headers.referer = referer.href;
        } catch {}
      }

      const cookies = (await ultraviolet.cookie.getCookies(db)) || [];
      const cookieStr = ultraviolet.cookie.serialize(
        cookies,
        ultraviolet.meta,
        false
      );

      requestCtx.headers['user-agent'] = navigator.userAgent;

      if (cookieStr) requestCtx.headers.cookie = cookieStr;

      const reqEvent = new HookEvent(requestCtx, null, null);
      this.emit('request', reqEvent);

      if (reqEvent.intercepted) return reqEvent.returnValue;

      fetchedURL = requestCtx.blob
        ? 'blob:' + location.origin + requestCtx.url.pathname
        : requestCtx.url;

      const response = await this.fetchWithRetry(fetchedURL, {
        headers: Object.entries(requestCtx.headers),
        method: requestCtx.method,
        body: requestCtx.body,
        credentials: requestCtx.credentials,
        mode: requestCtx.mode,
        cache: requestCtx.cache,
        redirect: requestCtx.redirect,
      });

      const responseCtx = new ResponseContext(requestCtx, response);
      const resEvent = new HookEvent(responseCtx, null, null);

      this.emit('beforemod', resEvent);
      if (resEvent.intercepted) return resEvent.returnValue;

      for (const name of cspHeaders) {
        if (responseCtx.headers[name]) delete responseCtx.headers[name];
      }

      delete responseCtx.headers['content-encoding'];
      delete responseCtx.headers['content-length'];

      if (responseCtx.headers.location) {
        responseCtx.headers.location = ultraviolet.rewriteUrl(
          responseCtx.headers.location
        );
      }

      // downloads
      if (['document', 'iframe'].includes(request.destination)) {
        const header = responseCtx.getHeader('content-disposition');

        // validate header and test for filename
        if (!/\s*?((inline|attachment);\s*?)filename=/i.test(header)) {
          // if filename= wasn't specified then maybe the remote specified to download this as an attachment?
          // if it's invalid then we can still possibly test for the attachment/inline type
          const type = /^\s*?attachment/i.test(header)
            ? 'attachment'
            : 'inline';

          // set the filename
          const [filename] = new URL(response.finalURL).pathname
            .split('/')
            .slice(-1);

          responseCtx.headers['content-disposition'] =
            `${type}; filename=${JSON.stringify(filename)}`;
        }
      }

      if (responseCtx.headers['set-cookie']) {
        Promise.resolve(
          ultraviolet.cookie.setCookies(
            responseCtx.headers['set-cookie'],
            db,
            ultraviolet.meta
          )
        ).then(() => {
          self.clients.matchAll().then(function (clients) {
            clients.forEach(function (client) {
              client.postMessage({
                msg: 'updateCookies',
                url: ultraviolet.meta.url.href,
              });
            });
          });
        });
        delete responseCtx.headers['set-cookie'];
      }

      if (responseCtx.body) {
        const contentType = (
          responseCtx.getHeader('content-type') || ''
        ).toLowerCase();
        const pathname = ultraviolet.meta.url?.pathname?.toLowerCase() || '';

        switch (request.destination) {
          case 'script': {
            const rawJs = await response.text();
            try {
              responseCtx.body = ultraviolet.js.rewrite(rawJs);
            } catch {
              responseCtx.body = rawJs;
            }
            if (!responseCtx.headers['content-type']) {
              responseCtx.headers['content-type'] =
                'application/javascript; charset=utf-8';
            }
            break;
          }
          case 'worker': {
            // craft a JS-safe list of arguments
            const scripts = [
              ultraviolet.bundleScript,
              ultraviolet.clientScript,
              ultraviolet.configScript,
              ultraviolet.handlerScript,
            ]
              .map((script) => JSON.stringify(script))
              .join(',');
            const rawWorkerJs = await response.text();
            let rewrittenWorkerJs = rawWorkerJs;
            try {
              rewrittenWorkerJs = ultraviolet.js.rewrite(rawWorkerJs);
            } catch {}
            responseCtx.body = `if (!self.__uv) {
                                ${ultraviolet.createJsInject(
                                  ultraviolet.cookie.serialize(
                                    cookies,
                                    ultraviolet.meta,
                                    true
                                  ),
                                  request.referrer
                                )}
                            importScripts(${scripts});
                            }\n`;
            responseCtx.body += rewrittenWorkerJs;
            break;
          }
          case 'style': {
            const rawCss = await response.text();
            try {
              responseCtx.body = ultraviolet.rewriteCSS(rawCss);
            } catch {
              responseCtx.body = rawCss;
            }
            if (!responseCtx.headers['content-type']) {
              responseCtx.headers['content-type'] = 'text/css; charset=utf-8';
            }
            break;
          }
          case 'iframe':
          case 'document':
            if (
              contentType.startsWith('text/html') ||
              contentType.includes('application/xhtml+xml')
            ) {
              let modifiedResponse = await response.text();
              if (Array.isArray(this.config.inject)) {
                const headPosition = modifiedResponse.indexOf('<head>');
                const upperHead = modifiedResponse.indexOf('<HEAD>');
                const bodyPosition = modifiedResponse.indexOf('<body>');
                const upperBody = modifiedResponse.indexOf('<BODY>');
                const url = new URL(fetchedURL);
                const injectArray = this.config.inject;
                for (const inject of injectArray) {
                  const regex = new RegExp(inject.host);
                  if (regex.test(url.host)) {
                    if (inject.injectTo === 'head') {
                      if (headPosition !== -1 || upperHead !== -1) {
                        modifiedResponse =
                          modifiedResponse.slice(0, headPosition) +
                          `${inject.html}` +
                          modifiedResponse.slice(headPosition);
                      }
                    } else if (inject.injectTo === 'body') {
                      if (bodyPosition !== -1 || upperBody !== -1) {
                        modifiedResponse =
                          modifiedResponse.slice(0, bodyPosition) +
                          `${inject.html}` +
                          modifiedResponse.slice(bodyPosition);
                      }
                    }
                  }
                }
              }
              try {
                responseCtx.body = ultraviolet.rewriteHtml(modifiedResponse, {
                  document: true,
                  injectHead: ultraviolet.createHtmlInject(
                    ultraviolet.handlerScript,
                    ultraviolet.bundleScript,
                    ultraviolet.clientScript,
                    ultraviolet.configScript,
                    ultraviolet.cookie.serialize(
                      cookies,
                      ultraviolet.meta,
                      true
                    ),
                    request.referrer
                  ),
                });
              } catch {
                responseCtx.body = modifiedResponse;
              }
            }
            break;
          default:
            // Handle preloaded or dynamically fetched stylesheets/scripts when destination is empty
            if (
              !request.destination &&
              (contentType.startsWith('text/css') || pathname.endsWith('.css'))
            ) {
              const rawCss = await response.text();
              try {
                responseCtx.body = ultraviolet.rewriteCSS(rawCss);
              } catch {
                responseCtx.body = rawCss;
              }
            }
            break;
        }
      }

      if (requestCtx.headers.accept === 'text/event-stream') {
        responseCtx.headers['content-type'] = 'text/event-stream';
      }
      if (crossOriginIsolated) {
        responseCtx.headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
      }

      responseCtx.headers['access-control-allow-origin'] = '*';

      this.emit('response', resEvent);
      if (resEvent.intercepted) return resEvent.returnValue;

      return new Response(responseCtx.body, {
        headers: responseCtx.headers,
        status: responseCtx.status,
        statusText: responseCtx.statusText,
      });
    } catch (err) {
      if (!['document', 'iframe'].includes(request.destination)) {
        if (request.destination === 'style') {
          return new Response('/* proxy stylesheet load error */', {
            status: 200,
            headers: { 'content-type': 'text/css; charset=utf-8' },
          });
        }
        if (request.destination === 'script') {
          return new Response('/* proxy script load error */', {
            status: 200,
            headers: { 'content-type': 'application/javascript; charset=utf-8' },
          });
        }
        return new Response(undefined, { status: 500 });
      }

      console.error(err);

      return renderError(err, fetchedURL);
    }
  }
  static Ultraviolet = Ultraviolet;
}

self.UVServiceWorker = UVServiceWorker;

class ResponseContext {
  /**
   *
   * @param {RequestContext} request
   * @param {import('@mercuryworkshop/bare-mux').BareResponseFetch} response
   */
  constructor(request, response) {
    this.request = request;
    this.raw = response;
    this.ultraviolet = request.ultraviolet;
    this.headers = {};
    const rawHeaders = response.rawHeaders;
    const headerEntries = Array.isArray(rawHeaders)
      ? rawHeaders
      : Object.entries(rawHeaders || {});
    for (const [rawKey, value] of headerEntries) {
      const key = rawKey.toLowerCase();
      if (key in this.headers)
        this.headers[key] = [].concat(this.headers[key], value);
      else this.headers[key] = value;
    }
    this.status = response.status;
    this.statusText = response.statusText;
    this.body = response.body;
  }
  get url() {
    return this.request.url;
  }
  get base() {
    return this.request.base;
  }
  set base(val) {
    this.request.base = val;
  }
  //the header value might be an array, so this function is used to
  //retrieve the value when it needs to be compared against a string
  getHeader(key) {
    if (Array.isArray(this.headers[key])) {
      return this.headers[key][0];
    }
    return this.headers[key];
  }
}

class RequestContext {
  /**
   *
   * @param {Request} request
   * @param {Ultraviolet} ultraviolet
   * @param {BodyInit} body
   */
  constructor(request, ultraviolet, body = null) {
    this.ultraviolet = ultraviolet;
    this.request = request;
    this.headers = Object.fromEntries(request.headers.entries());
    this.method = request.method;
    this.body = body || null;
    this.cache = request.cache;
    this.redirect = request.redirect;
    this.credentials = 'omit';
    this.mode = request.mode === 'cors' ? request.mode : 'same-origin';
    this.blob = false;
  }
  get url() {
    return this.ultraviolet.meta.url;
  }
  set url(val) {
    this.ultraviolet.meta.url = val;
  }
  get base() {
    return this.ultraviolet.meta.base;
  }
  set base(val) {
    this.ultraviolet.meta.base = val;
  }
}

class HookEvent {
  #intercepted;
  #returnValue;
  constructor(data = {}, target = null, that = null) {
    this.#intercepted = false;
    this.#returnValue = null;
    this.data = data;
    this.target = target;
    this.that = that;
  }
  get intercepted() {
    return this.#intercepted;
  }
  get returnValue() {
    return this.#returnValue;
  }
  respondWith(input) {
    this.#returnValue = input;
    this.#intercepted = true;
  }
}

/**
 *
 * @param {string} trace
 * @param {string} fetchedURL
 * @returns
 */
function errorTemplate(trace, fetchedURL) {
  // turn script into a data URI so we don't have to escape any HTML values
  const script = `
        errorTrace.value = ${JSON.stringify(trace)};
        fetchedURL.textContent = ${JSON.stringify(fetchedURL)};
        for (const node of document.querySelectorAll('#uvHostname')) node.textContent = ${JSON.stringify(
          location.hostname
        )};
        reload.addEventListener('click', () => location.reload());
        uvVersion.textContent = ${JSON.stringify('3.2.7')};
    `;

  return '{{ultraviolet-error}}'.replace(
    '{{src}}',
    'data:application/javascript,' + encodeURIComponent(script)
  );
}

/**
 *
 * @param {unknown} err
 * @param {string} fetchedURL
 */
function renderError(err, fetchedURL) {
  let headers = {
    'content-type': 'text/html',
  };
  if (crossOriginIsolated) {
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
  }

  return new Response(errorTemplate(String(err), fetchedURL), {
    status: 500,
    headers: headers,
  });
}
