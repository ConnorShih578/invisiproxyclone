/* -----------------------------------------------
/* Authors: QuiteAFancyEmerald, Yoct, b4kt, and OlyB
/* GNU Affero General Public License v3.0: https://www.gnu.org/licenses/agpl-3.0.en.html
/* MAIN InvisiProxy LTS Common Script
/* ----------------------------------------------- */

// Encase everything in a new scope so that variables are not accidentally
// attached to the global scope.
(() => {

/* GENERAL URL HANDLERS */

// To be defined after the document has fully loaded.
let uvConfig = {};
let sjBundle = null;
const FRAME_URL_KEY = '{{hu-lts}}-frame-url';
const SJ_PREFIX_TAG = 'sj:';

// Get the preferred apex domain name. Not exactly apex, as any
// subdomain other than those listed will be ignored.
const getDomain = () =>
    location.host.replace(/^(?:www|beta)\./, ''),
  // This is used for stealth mode when visiting external sites.
  goFrame = (url) => {
    localStorage.setItem(FRAME_URL_KEY, url);
    if (location.pathname !== '{{route}}{{/s}}')
      location.href = '{{route}}{{/s}}?cache={{cacheVal}}';
    else navigateLocalFrame(url);
  },
  navigateLocalFrame = (target) => {
    const windowFrame = document.getElementById('frame');
    if (!windowFrame || !target) return;
    if (!target.startsWith(SJ_PREFIX_TAG)) {
      windowFrame.src = target;
      return;
    }
    const rawUrl = target.slice(SJ_PREFIX_TAG.length);
    const tryGo = () => {
      const f = sjBundle && sjBundle.frame;
      if (f && typeof f.go === 'function') f.go(rawUrl);
    };
    if (sjBundle && sjBundle.ready) tryGo();
    else
      window.addEventListener('s-ready', tryGo, { once: true });
  },
  /* Used to set functions for the goProx object at the bottom.
   * See the goProx object at the bottom for some usage examples
   * on the URL handlers, omnibox functions, and the uvUrl function.
   */
  urlHandler = (parser) =>
    typeof parser === 'function'
      ? // Return different functions based on whether a URL has already been set.
        // Should help avoid confusion when using or adding to the goProx object.
        (url, mode) => {
          if (!url) return;
          if (parser === sjUrl) mode = 'stealth';
          url = parser(url);
          mode = `${mode}`.toLowerCase();
          if (mode === 'stealth' || mode == 1) goFrame(url);
          else if (mode === 'window' || mode == 0) location.href = url;
          else return url;
        }
      : (mode) => {
          mode = `${mode}`.toLowerCase();
          if (mode === 'stealth' || mode == 1) goFrame(parser);
          else if (mode === 'window' || mode == 0) location.href = parser;
          else return parser;
        },
  sjPreset = (rawUrl) => (mode) => {
    mode = `${mode}`.toLowerCase();
    if (mode === 'window' || mode == 0 || mode === 'stealth' || mode == 1)
      goFrame(sjUrl(rawUrl));
    else return sjUrl(rawUrl);
  },
  openBlankCloak = () => {
      try {
        const newWindow = window.open('about:blank', '_blank');
        if (!newWindow) return null;
        const iframe = newWindow.document.createElement('iframe');
        const styles = {
          border: 'none',
          width: '100%',
          height: '100%',
          margin: '0',
          overflow: 'hidden',
        };
        Object.assign(iframe.style, styles);
        iframe.src = location.href;
        newWindow.document.body.appendChild(iframe);
        return newWindow;
      } catch (e) {
        console.error('Blank cloaking failed:', e);
        return null;
      }
    },
  openBlobCloak = () => {
    try {
      const icon =
        (document.querySelector("link[rel*='icon']") || {}).href || '';
      const html = `<!DOCTYPE html><html><head><title>${
        document.title
      }</title><link rel="icon" href="${icon}"><style>html,body{height:100%;margin:0;padding:0;overflow:hidden;}</style></head><body><iframe style="border:none;width:100%;height:100%;margin:0;overflow:hidden;" src="${
        location.href
      }"></iframe></body></html>`;
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      const newWindow = window.open(blobUrl, '_blank');
      return newWindow;
    } catch (e) {
      console.error('Blob cloaking failed:', e);
      return null;
    }
  },
  // An asynchronous version of the function above, just in case.
  asyncUrlHandler = (parser) => async (url, mode) => {
    if (!url) return;
    if (typeof parser === 'function') url = await parser(url);
    mode = `${mode}`.toLowerCase();
    if (mode === 'stealth' || mode == 1) goFrame(url);
    else if (mode === 'window' || mode == 0) location.href = url;
    else return url;
  };

/* READ SETTINGS */

const storageId = '{{hu-lts}}-storage',
  storageObject = () => JSON.parse(localStorage.getItem(storageId)) || {},
  readStorage = (name) => storageObject()[name];

/* OMNIBOX */

const searchEngines = Object.freeze({
    '{{Startpage}}': 'startpage.com/sp/search?query=',
    '{{Google}}': 'google.com/search?q=',
    '{{Bing}}': 'bing.com/search?q=',
    '{{DuckDuckGo}}': 'duckduckgo.com/?q=',
    '{{Brave}}': 'search.brave.com/search?q=',
  }),
  defaultSearch = '{{Google}}',
  autocompletes = Object.freeze({
    // Startpage has used both Google's and Bing's autocomplete.
    // For now, just use Bing.
    '{{Startpage}}': 'www.bing.com/AS/Suggestions?csr=1&cvid=0&qry=',
    '{{Google}}': 'www.google.com/complete/search?client=gws-wiz&callback=_&q=',
    '{{Bing}}': 'www.bing.com/AS/Suggestions?csr=1&cvid=0&qry=',
    '{{DuckDuckGo}}': 'duckduckgo.com/ac/?q=',
    '{{Brave}}': 'search.brave.com/api/suggest?q=',
  }),
  autocompleteUrls = Object.values(autocompletes).map(
    (url) => 'https://' + url
  ),
  responseDelimiter = '\ue000',
  formatSuggestion = (
    suggestion,
    delimiters,
    newDelimiters = [responseDelimiter]
  ) => {
    for (let i = 0; i < delimiters.length; i++)
      suggestion = suggestion.replaceAll(
        delimiters[i],
        newDelimiters[i] || newDelimiters[0]
      );
    return suggestion;
  },
  responseHandlers = Object.freeze({
    '{{Startpage}}': (jsonData) => responseHandlers['{{Bing}}'](jsonData),
    '{{Google}}': (jsonData) =>
      jsonData[0].map(([suggestion]) =>
        formatSuggestion(suggestion, ['<b>', '</b>'])
      ),
    '{{Bing}}': (jsonData) =>
      jsonData.s.map(({ q }) => formatSuggestion(q, ['\ue000', '\ue001'])),
    '{{DuckDuckGo}}': (jsonData) => jsonData.map(({ phrase }) => phrase),
    '{{Brave}}': (jsonData) => jsonData[1],
  });

// Get the autocomplete results for a given search query in JSON format.
let activeACController = null;
const requestAC = async (
  baseUrl,
  query,
  parserFunc = (url) => url,
  params = {}
) => {
  if (parserFunc !== sjUrl) return;
  if (!sjBundle?.ready || !sjBundle.frame) return;

  const transport =
    sjBundle.frame.fetchHandler?.client?.transport ||
    sjBundle.controller?.transport;
  if (!transport || typeof transport.request !== 'function') return;

  if (transport.ready === false && typeof transport.init === 'function') {
    try {
      await transport.init();
    } catch {
      return;
    }
  }

  if (activeACController) {
    try {
      activeACController.abort();
    } catch {}
  }
  const controller = new AbortController();
  activeACController = controller;

  const targetUrl = baseUrl + encodeURIComponent(query);
  let remoteUrl;
  try {
    remoteUrl = new URL(targetUrl);
  } catch {
    return;
  }

  let responseJSON;
  try {
    const response = await transport.request(
      remoteUrl,
      'GET',
      null,
      [['accept', 'application/json, text/plain, */*']],
      controller.signal
    );
    if (controller.signal.aborted) return;

    const status = typeof response.status === 'number' ? response.status : 0;
    if (status < 200 || status >= 300) return;

    let text;
    if (response.body instanceof ReadableStream) {
      text = await new Response(response.body).text();
    } else if (response.body instanceof ArrayBuffer) {
      text = new TextDecoder().decode(response.body);
    } else if (typeof response.body === 'string') {
      text = response.body;
    } else {
      text = await new Response(response.body).text();
    }

    try {
      responseJSON = JSON.parse(text);
    } catch {
      try {
        responseJSON = JSON.parse(text.replace(/^[^[{]*|[^\]}]*$/g, ''));
      } catch {
        return;
      }
    }
  } catch {
    return;
  }

  if (controller.signal.aborted) return;

  updateAC(
    params.listElement,
    responseHandlers[params.searchType](responseJSON),
    Date.parse(params.time)
  );
};

let lastUpdated = Date.parse(new Date().toUTCString());
const updateAC = (listElement, searchResults, time) => {
  if (time < lastUpdated) return;
  else lastUpdated = time;
  // Update the data for the results.
  listElement.textContent = '';
  for (let i = 0; i < searchResults.length; i++) {
    let suggestion = document.createElement('li');
    suggestion.tabIndex = 0;
    suggestion.append(
      ...searchResults[i].split(responseDelimiter).map((text, bolded) => {
        if (bolded % 2) {
          let node = document.createElement('b');
          node.textContent = text;
          return node;
        }
        return text;
      })
    );
    listElement.appendChild(suggestion);
  }
};

const getSearchTemplate = (
    searchEngine = searchEngines[readStorage('SearchEngine')] ||
      searchEngines[defaultSearch]
  ) => `https://${searchEngine}%s`,
  // Resolve route placeholders if present
  resolveRoute = (path) => {
    if (typeof path !== 'string') return '';
    return path.replace(/{{route}}({{)?/g, '').replace(/}}/g, '');
  },
  // Return a valid URL or proxy search query
  search = (input) => {
    if (!input) return '';
    input = resolveRoute(input.trim());

    // If it starts with sj:, strip it for resolution
    if (input.startsWith('sj:')) input = input.slice(3).trim();

    // 1. Local or relative paths (e.g. /archive/g/slope/, /webretro?...)
    if (input.startsWith('/') || input.startsWith('./') || input.startsWith('../')) {
      return new URL(input, location.origin).href;
    }

    // 2. Already valid absolute URL
    try {
      const url = new URL(input);
      if (
        url.protocol === 'http:' ||
        url.protocol === 'https:' ||
        url.protocol === 'about:' ||
        url.protocol === 'blob:'
      ) {
        return url.href;
      }
    } catch (e) {}

    // 3. Domain name without protocol (e.g. youtube.com, discord.com/app, localhost:8080)
    try {
      const url = new URL(`http://${input}`);
      if (
        !input.includes(' ') &&
        (url.hostname.includes('.') ||
          url.hostname === 'localhost' ||
          /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))
      ) {
        return `https://${input}`;
      }
    } catch (e) {}

    // 4. Treat as a search query
    return getSearchTemplate().replace('%s', encodeURIComponent(input));
  },
  // Parse a URL to use with Ultraviolet.
  uvUrl = (url) => {
    try {
      const uvConfigObj = window.__uv$config || (typeof uvConfig !== 'undefined' ? uvConfig : null);
      const prefix = uvConfigObj?.prefix ? resolveRoute(uvConfigObj.prefix) : '/uv/service/';
      const encoder = uvConfigObj?.encodeUrl || ((u) => encodeURIComponent(u));
      url = location.origin + prefix + encoder(search(url));
    } catch (e) {
      url = search(url);
    }
    return url;
  },
  sjUrl = (url) => SJ_PREFIX_TAG + search(url);

/* To use:
 * goProx.proxy(url-string, mode-as-string-or-number);
 *
 * Key: 1 = "stealth"
 *      0 = "window"
 *      Nothing = return URL as a string
 *
 * Examples:
 * Stealth mode -
 * goProx.ultraviolet("https://google.com", 1);
 * goProx.ultraviolet("https://google.com", "stealth");
 *
 * goProx.searx(1);
 * goProx.searx("stealth");
 *
 * Window mode -
 * goProx.ultraviolet("https://google.com", "window");
 *
 * goProx.searx("window");
 *
 * Return string value mode (default) -
 * goProx.ultraviolet("https://google.com");
 *
 * goProx.searx();
 */
const preparePage = async () => {
  // This won't break the service workers as they store the variable separately.
  uvConfig = self['{{__uv$config}}'];

  if (window.$invisiScramjet?.ready) sjBundle = window.$invisiScramjet;
  else
    window.addEventListener(
      's-ready',
      () => {
        sjBundle = window.$invisiScramjet;
      },
      { once: true }
    );

  // Object.freeze prevents goProx from accidentally being edited.
  const goProx = Object.freeze({
    // `location.protocol + "//" + getDomain()` more like `location.origin`
    // setAuthCookie("__cor_auth=1", false);
    ultraviolet: urlHandler(uvUrl),

    scramjet: urlHandler(sjUrl),

    terraria: urlHandler(location.protocol + '//a.' + getDomain()),

    webleste: urlHandler(location.protocol + '//b.' + getDomain()),

    osu: urlHandler(location.origin + '{{route}}{{/archive/osu}}'),

    agar: sjPreset('https://agar.io'),

    tru: sjPreset('https://truffled.lol/g'),

    prison: sjPreset('https://vimlark.itch.io/pick-up-prison'),

    speed: sjPreset('https://captain4lk.itch.io/what-the-road-brings'),

    heli: sjPreset('https://benjames171.itch.io/helo-storm'),

    youtube: urlHandler(uvUrl('https://youtube.com')),

    invidious: sjPreset('https://invidious.snopyta.org'),

    chatgpt: sjPreset('https://chat.openai.com/chat'),

    fmhy: sjPreset('https://fmhy.net'),

    discord: sjPreset('https://discord.com/app'),

    geforcenow: sjPreset('https://play.geforcenow.com/mall'),

    spotify: sjPreset('https://open.spotify.com'),

    tiktok: sjPreset('https://www.tiktok.com'),

    animetsu: sjPreset('https://animetsu.net'),

    twitter: sjPreset('https://twitter.com'),

    twitch: sjPreset('https://www.twitch.tv'),

    instagram: sjPreset('https://www.instagram.com'),

    reddit: sjPreset('https://www.reddit.com'),

    wikipedia: sjPreset('https://www.wikiwand.com'),

  });

  // Call a function after a given number of service workers are active.
  // Workers are appended as additional arguments to the callback.
  const callAfterWorkers = async (
    urls,
    callback,
    afterHowMany = 1,
    tries = 10,
    ...params
  ) => {
    // For 10 tries, stop after 10 seconds of no response from workers.
    if (tries <= 0) return console.log('Failed to recognize service workers.');
    const workers = await Promise.all(
      urls.map((url) => navigator.serviceWorker.getRegistration(url))
    );
    let newUrls = [],
      finishedWorkers = [];
    for (let i = 0; i < workers.length; i++) {
      if (workers[i] && workers[i].active) {
        afterHowMany--;
        finishedWorkers.push(workers[i]);
      } else newUrls.push(urls[i]);
    }
    if (afterHowMany <= 0) return await callback(...params, ...finishedWorkers);
    else
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => {
          setTimeout(() => {
            tries--;
            resolve();
          }, 1000);
        }),
      ]);
    return await callAfterWorkers(
      newUrls,
      callback,
      afterHowMany,
      tries,
      ...params,
      ...finishedWorkers
    );
  };

  // Attach event listeners using goProx to specific app menus that need it.
  const prSet = (id, type) => {
    const formElement = document.getElementById(id);
    if (!formElement) return;

    let prUrl = formElement.querySelector('input[type=text]'),
      prAC = formElement.querySelector('#autocomplete'),
      prGo1 = document.querySelectorAll(`#${id}.pr-go1, #${id} .pr-go1`),
      prGo2 = document.querySelectorAll(`#${id}.pr-go2, #${id} .pr-go2`);

    // Handle the other menu buttons differently if there is no omnibox. Menus
    // which lack an omnibox likely use buttons as mere links.
    const goProxMethod = prUrl
        ? (mode) => () => {
            goProx[type](prUrl.value, mode);
          }
        : (mode) => () => {
            goProx[type](mode);
          },
      // Ultraviolet and Scramjet are currently incompatible with window mode.
      defaultModes = {
        globalDefault: 'window',
        ultraviolet: 'stealth',
        scramjet: 'stealth',
      },
      searchMode = defaultModes[type] || defaultModes['globalDefault'];

    if (prUrl) {
      let enableSearch = false,
        onCooldown = false;

      prUrl.addEventListener('keydown', async (e) => {
        if (e.code === 'Enter') goProxMethod(searchMode)();
        // This is exclusively used for the validator script.
        else if (e.code === 'Validator Test') {
          const rawValue = e.target.value;
          let resolved;
          if (type === 'ultraviolet') resolved = uvUrl(rawValue);
          else if (type === 'scramjet') resolved = sjUrl(rawValue);
          else resolved = search(rawValue);
          e.target.value = resolved == null ? '' : resolved;
          e.target.dispatchEvent(new Event('change'));
        }
      });

      if (prAC) {
        // Get autocomplete search results when typing in the omnibox.
        prUrl.addEventListener('input', async (e) => {
          // Prevent excessive fetch requests by restricting when requests are made.
          if (enableSearch && !onCooldown) {
            if (!e.target.value) {
              prAC.textContent = '';
              return;
            }
            const query = e.target.value;
            if (e.isTrusted) {
              onCooldown = true;
              setTimeout(() => {
                onCooldown = false;
                // Refresh the autocomplete results after the cooldown ends.
                if (query !== e.target.value)
                  e.target.dispatchEvent(new Event('input'));
              }, 600);
            }

            // Get autocomplete results from the selected search engine.
            let searchType = readStorage('SearchEngine');
            if (!(searchType in autocompletes)) searchType = defaultSearch;
            const requestTime = new Date().toUTCString();
            requestAC('https://' + autocompletes[searchType], query, sjUrl, {
              searchType: searchType,
              listElement: prAC,
              time: requestTime,
            });
          }
        });

        // Show autocomplete results only if the omnibox is in focus.
        prUrl.addEventListener('focus', () => {
          // Don't show results if they were disabled by the user.
          if (readStorage('UseAC') !== false) {
            enableSearch = true;
            prAC.classList.toggle('display-off', false);
          }
          prUrl.select();
        });
        prUrl.addEventListener('blur', (e) => {
          enableSearch = false;

          // Do not remove the autocomplete result list if it was being clicked.
          if (e.relatedTarget) {
            e.relatedTarget.focus();
            if (document.activeElement.parentNode === prAC) return;
          }

          prAC.classList.toggle('display-off', true);
        });

        // Make the corresponding search query if a given suggestion was clicked.
        prAC.addEventListener('click', (e) => {
          e.target.focus();
          prUrl.value = document.activeElement.textContent;
          goProxMethod(searchMode)();
        });
      }
    }

    prGo1.forEach((element) => {
      element.addEventListener('click', goProxMethod('window'));
    });
    prGo2.forEach((element) => {
      element.addEventListener('click', goProxMethod('stealth'));
    });
  };

  prSet('pr-uv', 'ultraviolet');
  prSet('pr-sj', 'scramjet');
  prSet('pr-yt', 'youtube');
  prSet('pr-iv', 'invidious');
  prSet('pr-trl', 'tru');
  prSet('pr-cg', 'chatgpt');
  prSet('pr-fm', 'fmhy');
  prSet('pr-dc', 'discord');
  prSet('pr-gf', 'geforcenow');
  prSet('pr-sp', 'spotify');
  prSet('pr-tt', 'tiktok');
  prSet('pr-ha', 'animetsu');
  prSet('pr-tw', 'twitter');
  prSet('pr-tc', 'twitch');
  prSet('pr-ig', 'instagram');
  prSet('pr-rt', 'reddit');
  prSet('pr-wa', 'wikipedia');

  // Load the frame for stealth mode if it exists.
  const windowFrame = document.getElementById('frame');
  if (windowFrame) {
    const sjReady = sjBundle?.ready
      ? Promise.resolve()
      : new Promise((resolve) =>
          window.addEventListener('s-ready', resolve, {
            once: true,
          })
        );
    await sjReady;
    const target = localStorage.getItem(FRAME_URL_KEY);
    if (target) navigateLocalFrame(target);
  }

  const useModule = (moduleFunc, tries = 0) => {
    try {
      moduleFunc();
    } catch (e) {
      if (tries <= 5)
        setTimeout(() => {
          useModule(moduleFunc, tries + 1);
        }, 600);
    }
  };

  if (document.getElementsByClassName('tippy-button').length >= 0)
    useModule(() => {
      tippy('.tippy-button', {
        delay: 50,
        animateFill: true,
        placement: 'bottom',
      });
    });
  if (document.getElementsByClassName('pr-tippy').length >= 0)
    useModule(() => {
      tippy('.pr-tippy', {
        delay: 50,
        animateFill: true,
        placement: 'bottom',
      });
    });

  const banner = document.getElementById('banner');
  if (banner) {
    useModule(() => {
      AOS.init();
    });

    fetch('{{route}}{{/assets/json/splash.json}}', {
      mode: 'same-origin',
    }).then((response) => {
      response.json().then((splashList) => {
        banner.firstElementChild.innerHTML =
          splashList[(Math.random() * splashList.length) | 0];
      });
    });
  }

  // Load in relevant JSON files used to organize large sets of data.
  // This first one is for links, whereas the rest are for navigation menus.
  fetch('{{route}}{{/assets/json/links.json}}', {
    mode: 'same-origin',
  }).then((response) => {
    response.json().then((huLinks) => {
      for (let items = Object.entries(huLinks), i = 0; i < items.length; i++)
        // Replace all placeholder links with the corresponding entry in huLinks.
        (document.getElementById(items[i][0]) || {}).href = items[i][1];
    });
  });

  const navLists = {
    // Pair an element ID with a JSON file name. They are identical for now.
    'emu-nav': 'emu-nav',
    'emulib-nav': 'emulib-nav',
    'flash-nav': 'flash-nav',
    'h5-nav': 'h5-nav',
    'par-nav': 'par-nav',
  };

  for (const [listId, filename] of Object.entries(navLists)) {
    let navList = document.getElementById(listId);

    if (navList) {
      // List items stored in JSON format will be returned as a JS object.
      const data = await fetch(`{{route}}{{/assets/json/}}${filename}.json`, {
        mode: 'same-origin',
      }).then((response) => response.json());

      // Load the JSON lists into specific HTML parent elements as groups of
      // child elements, if the parent element is found.
      switch (filename) {
        case 'emu-nav':
        case 'emulib-nav':
        case 'par-nav':
        case 'h5-nav': {
          const dirnames = {
              // Set the directory of where each item of the corresponding JSON
              // list will be retrieved from.
              'emu-nav': 'emu',
              'emulib-nav': 'emulib',
              'par-nav': 'par',
              'h5-nav': 'h5g',
            },
            dir = dirnames[filename],
            // Add a little functionality for each list item when clicked on.
            clickHandler = (parser, a) => (e) => {
              if (e.target == a || e.target.tagName != 'A') {
                e.preventDefault();
                parser();
              }
            };

          for (let i = 0; i < data.length; i++) {
            // Load each item as an anchor tag with an image, heading,
            // and click event listener.
            const item = data[i],
              a = document.createElement('a'),
              img = document.createElement('img'),
              title = document.createElement('h3');
            ((desc = document.createElement('p')),
              (credits = document.createElement('p')));

            a.href = '#';
            img.src = `{{route}}{{/assets/img/}}${dir}/` + item.img;
            title.textContent = item.name;
            desc.textContent = item.description;
            credits.textContent = item.credits;

            if (filename === 'par-nav') {
              if (item.credits === 'truf')
                desc.innerHTML +=
                  '<br>{{mask}}{{Credits: Check out the full site at }}<a target="_blank" href="{{route}}{{/truffled}}">{{mask}}{{truffled.lol}}</a> //{{mask}}{{ discord.gg/vVqY36mzvj}}';
            }

            a.appendChild(img);
            a.appendChild(title);
            a.appendChild(desc);

            // Which function is used for the click event is determined by
            // the corresponding location/index in the dirnames object.
            const functionsList = [
              // emu-nav
              () => goFrame(item.path),
              // emulib-nav
              () =>
                goFrame(
                  '{{route}}{{/webretro}}?core=' +
                    item.core +
                    '&rom=' +
                    item.rom
                ),
              // par-nav
              item.custom && goProx[item.custom]
                ? () => goProx[item.custom]('stealth')
                : () => {},
              // h5-nav
              item.custom && goProx[item.custom]
                ? () => goProx[item.custom]('window')
                : () => goFrame('{{route}}{{/archive/g/}}' + item.path),
            ];

            a.addEventListener(
              'click',
              clickHandler(
                functionsList[Object.values(dirnames).indexOf(dir)],
                a
              )
            );

            navList.appendChild(a);
          }
          break;
        }

        case 'flash-nav':
          for (let i = 0; i < data.length; i++) {
            // Load each item as an anchor tag with a short title and click
            // event listener.
            const item = data[i],
              a = document.createElement('a');
            a.href = '#';
            a.textContent = item.slice(0, -4);

            a.addEventListener('click', (e) => {
              e.preventDefault();
              goFrame('{{route}}{{/flash}}?swf=' + item);
            });

            navList.appendChild(a);
          }
          break;

        // No default case.
        }
      }
    }

    /* ==========================================================================
       INVISIBROWSER CONSUMER MULTI-TAB & APPS ENGINE (AGPL-3.0)
       ========================================================================== */

    class InvisiBrowser {
      constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.tabCounter = 1;
        this.tabListEl = document.getElementById('browser-tabs-list');
        this.tabBarContainer = document.querySelector('.browser-tabbar-container');
        this.viewportsEl = document.getElementById('browser-viewports-container');
        this.addressInput = document.getElementById('browser-address-input');
        this.autocompleteEl = document.getElementById('browser-autocomplete-list');
        this.backBtn = document.getElementById('browser-btn-back');
        this.forwardBtn = document.getElementById('browser-btn-forward');
        this.reloadBtn = document.getElementById('browser-btn-reload');
        this.homeBtn = document.getElementById('browser-btn-home');
        this.fullscreenBtn = document.getElementById('browser-btn-fullscreen');
        this.popoutBtn = document.getElementById('browser-btn-popout');
        this.goBtn = document.getElementById('browser-btn-go');
        this.addTabBtn = document.getElementById('browser-btn-add-tab');

        if (this.tabListEl && this.viewportsEl) {
          this.init();
        }
      }

      init() {
        // Tab bar + New Tab button
        this.addTabBtn?.addEventListener('click', () => this.createTab());

        // Omnibar events
        this.addressInput?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            this.navigateActiveTab(this.addressInput.value);
            this.hideAutocomplete();
          }
        });

        this.goBtn?.addEventListener('click', () => {
          if (this.addressInput?.value) {
            this.navigateActiveTab(this.addressInput.value);
            this.hideAutocomplete();
          }
        });

        this.backBtn?.addEventListener('click', () => this.goBack());
        this.forwardBtn?.addEventListener('click', () => this.goForward());
        this.reloadBtn?.addEventListener('click', () => this.reload());
        this.homeBtn?.addEventListener('click', () => this.goHome());
        this.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
        this.popoutBtn?.addEventListener('click', () => openBlankCloak());

        // Listen for Scramjet proxy url updates
        window.addEventListener('proxy-url-change', (e) => {
          if (this.activeTabId && e.detail?.url) {
            this.updateTabLocation(this.activeTabId, e.detail.url);
          }
        });

        // Continuous sync ticker for active tab (catches SPA navigations, YouTube, Wikipedia, etc.)
        setInterval(() => {
          if (this.activeTabId) {
            this.syncTabFromFrame(this.activeTabId);
          }
        }, 400);

        // Autocomplete setup on addressInput
        let acCooldown = false;
        this.addressInput?.addEventListener('input', (e) => {
          const val = e.target.value.trim();
          if (!val || readStorage('UseAC') === false) {
            this.hideAutocomplete();
            return;
          }
          if (!acCooldown) {
            acCooldown = true;
            setTimeout(() => {
              acCooldown = false;
            }, 300);
            let searchType = readStorage('SearchEngine') || '{{Google}}';
            if (!(searchType in autocompletes)) searchType = '{{Google}}';
            requestAC(
              'https://' +
                (autocompletes[searchType] ||
                  autocompletes['{{Google}}'] ||
                  'www.google.com/complete/search?client=gws-wiz&callback=_&q='),
              val,
              sjUrl,
              {
                searchType: searchType,
                listElement: this.autocompleteEl,
                time: new Date().toUTCString(),
              }
            );
            this.autocompleteEl?.classList.add('active');
          }
        });

        this.autocompleteEl?.addEventListener('click', (e) => {
          const item = e.target.closest('li');
          if (item && this.addressInput) {
            this.addressInput.value = item.textContent.trim();
            this.navigateActiveTab(this.addressInput.value);
            this.hideAutocomplete();
          }
        });

        document.addEventListener('click', (e) => {
          if (!e.target.closest('.omnibar-search-wrap')) {
            this.hideAutocomplete();
          }
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
            e.preventDefault();
            this.createTab();
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
            if (this.activeTabId) {
              e.preventDefault();
              this.closeTab(this.activeTabId);
            }
          }
        });

        // Setup View Switcher, Portals & Modals
        this.initViewSwitcher();
        this.initGamesPortal();
        this.initAppsPortal();
        this.initModals();

        // Create initial default tab
        this.createTab();
      }

      hideAutocomplete() {
        if (this.autocompleteEl) {
          this.autocompleteEl.classList.remove('active');
          this.autocompleteEl.textContent = '';
        }
      }

      // Extract real URL from proxy iframe
      getRealUrl(frame) {
        if (!frame) return '';
        try {
          const cw = frame.contentWindow;
          if (!cw) return '';

          // 1. Ultraviolet location
          if (cw.__uv$location && cw.__uv$location.href) {
            return cw.__uv$location.href;
          }

          // 2. Scramjet location
          if (cw.__scramjet$location && cw.__scramjet$location.href) {
            return cw.__scramjet$location.href;
          }

          const loc = cw.location;
          if (!loc || !loc.href || loc.href === 'about:blank') return '';

          // 3. Ultraviolet pathname decode
          const path = loc.pathname || '';
          const uvConfigObj =
            window.__uv$config || (typeof uvConfig !== 'undefined' ? uvConfig : null);
          const uvPrefix = uvConfigObj?.prefix
            ? resolveRoute(uvConfigObj.prefix)
            : '/uv/service/';

          if (path.includes('/uv/service/') || (uvPrefix && path.startsWith(uvPrefix))) {
            const prefixIndex = path.indexOf(uvPrefix);
            const encodedPart = path.slice(prefixIndex + uvPrefix.length);
            if (encodedPart) {
              const decoder =
                uvConfigObj?.decodeUrl ||
                (typeof Ultraviolet !== 'undefined' &&
                  Ultraviolet.codec?.xor?.decode) ||
                decodeURIComponent;
              try {
                return (
                  decoder(encodedPart) + (loc.search || '') + (loc.hash || '')
                );
              } catch (e) {}
            }
          }

          // 4. Scramjet network prefix
          if (path.includes('/scram/network/')) {
            if (cw.__scramjet?.url) return cw.__scramjet.url;
          }

          // 5. Local application or game path
          if (loc.origin === window.location.origin) {
            return loc.pathname + (loc.search || '') + (loc.hash || '');
          }

          return loc.href;
        } catch (e) {}
        return '';
      }

      // Extract real document title from proxy iframe
      getRealTitle(frame, defaultTitle = 'New Tab') {
        try {
          if (frame?.contentDocument?.title) {
            const t = frame.contentDocument.title.trim();
            if (t && t !== 'about:blank') return t;
          }
        } catch (e) {}
        return defaultTitle;
      }

      // Update location and sync address bar
      updateTabLocation(tabId, url, title = null) {
        const tab = this.tabs.find((t) => t.id === tabId);
        if (!tab || !url) return;

        tab.url = url;
        tab.isLoaded = true;

        if (title) {
          tab.title = title;
        } else if (!tab.title || tab.title === 'New Tab') {
          try {
            const u = new URL(url);
            tab.title = u.hostname.replace(/^www\./, '');
          } catch {
            tab.title = url;
          }
        }

        const headerEl = document.getElementById(`header-${tabId}`);
        const titleSpan = headerEl?.querySelector('.browser-tab-title');
        if (titleSpan) titleSpan.textContent = tab.title;

        if (this.activeTabId === tabId && this.addressInput) {
          if (document.activeElement !== this.addressInput) {
            this.addressInput.value = url;
          }
        }
      }

      // Sync active tab state from its underlying iframe
      syncTabFromFrame(tabId) {
        const tab = this.tabs.find((t) => t.id === tabId);
        const viewportEl = document.getElementById(`viewport-${tabId}`);
        if (!tab || !viewportEl) return;

        const frame = viewportEl.querySelector('.tab-proxy-frame');
        if (!frame) return;

        const realUrl = this.getRealUrl(frame);
        const realTitle = this.getRealTitle(frame, tab.title);

        if (realTitle && realTitle !== tab.title) {
          tab.title = realTitle;
          const headerEl = document.getElementById(`header-${tabId}`);
          const titleSpan = headerEl?.querySelector('.browser-tab-title');
          if (titleSpan) titleSpan.textContent = realTitle;
        }

        if (realUrl && realUrl !== tab.url) {
          tab.url = realUrl;
          if (this.activeTabId === tabId && this.addressInput) {
            if (document.activeElement !== this.addressInput) {
              this.addressInput.value = realUrl;
            }
          }
        }

        if (this.activeTabId === tabId) {
          if (this.backBtn) this.backBtn.disabled = !tab.isLoaded;
          if (this.forwardBtn) this.forwardBtn.disabled = !tab.isLoaded;
        }
      }

      createTab(url = null, title = 'New Tab', icon = 'fas fa-globe') {
        const tabId = 'invisi-tab-' + this.tabCounter++;
        const tabData = {
          id: tabId,
          url: url || '',
          title: title,
          icon: icon,
          isLoaded: false,
        };
        this.tabs.push(tabData);

        // Create Tab Header
        const tabEl = document.createElement('div');
        tabEl.className = 'browser-tab';
        tabEl.id = `header-${tabId}`;
        tabEl.innerHTML = `
          <span class="browser-tab-icon"><i class="${icon}"></i></span>
          <span class="browser-tab-title">${title}</span>
          <span class="browser-tab-close" title="Close tab (Ctrl+W)">&times;</span>
        `;

        tabEl.addEventListener('click', (e) => {
          if (e.target.closest('.browser-tab-close')) {
            this.closeTab(tabId, e);
          } else {
            this.switchTab(tabId);
          }
        });

        this.tabListEl.appendChild(tabEl);

        // Create Tab Viewport
        const viewportEl = document.createElement('div');
        viewportEl.className = 'browser-tab-viewport';
        viewportEl.id = `viewport-${tabId}`;

        viewportEl.innerHTML = `
          <div class="tab-home-screen">
            <div class="tab-home-content">
              <div class="tab-home-logo">
                <div class="tab-home-brand-mark">
                  <i class="fas fa-layer-group"></i>
                </div>
                <div class="tab-home-title-wrap">
                  <h1 class="tab-home-title">{{mask}}{{Portal}}</h1>
                  <p class="tab-home-tagline">{{mask}}{{Private, lightweight, and unrestricted web browser.}}</p>
                </div>
              </div>
              <div class="tab-home-search-box">
                <div class="tab-home-search-inner">
                  <i class="fas fa-search tab-home-search-icon"></i>
                  <input
                    type="text"
                    class="tab-home-search-input"
                    placeholder="Search or enter web address..."
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button class="tab-home-search-btn">
                    <span>Go</span>
                    <i class="fas fa-arrow-right"></i>
                  </button>
                </div>
              </div>
              <div class="shortcuts-section">
                <div class="shortcuts-title">Quick Access</div>
                <div class="shortcuts-grid">
                  <div class="shortcut-card" data-url="https://google.com">
                    <div class="shortcut-icon" style="background: rgba(66, 133, 244, 0.15); color: #4285f4;"><i class="fab fa-google"></i></div>
                    <span class="shortcut-label">Google</span>
                  </div>
                  <div class="shortcut-card" data-url="https://youtube.com">
                    <div class="shortcut-icon" style="background: rgba(255, 68, 68, 0.15); color: #ff4444;"><i class="fab fa-youtube"></i></div>
                    <span class="shortcut-label">YouTube</span>
                  </div>
                  <div class="shortcut-card" data-url="https://discord.com/app">
                    <div class="shortcut-icon" style="background: rgba(88, 101, 242, 0.15); color: #5865f2;"><i class="fab fa-discord"></i></div>
                    <span class="shortcut-label">Discord</span>
                  </div>
                  <div class="shortcut-card" data-url="https://chat.openai.com">
                    <div class="shortcut-icon" style="background: rgba(16, 163, 127, 0.15); color: #10a37f;"><i class="fas fa-robot"></i></div>
                    <span class="shortcut-label">ChatGPT</span>
                  </div>
                  <div class="shortcut-card" data-url="https://open.spotify.com">
                    <div class="shortcut-icon" style="background: rgba(30, 215, 96, 0.15); color: #1ed760;"><i class="fab fa-spotify"></i></div>
                    <span class="shortcut-label">Spotify</span>
                  </div>
                  <div class="shortcut-card" data-url="https://reddit.com">
                    <div class="shortcut-icon" style="background: rgba(255, 69, 0, 0.15); color: #ff4500;"><i class="fab fa-reddit"></i></div>
                    <span class="shortcut-label">Reddit</span>
                  </div>
                  <div class="shortcut-card" data-url="https://tiktok.com">
                    <div class="shortcut-icon" style="background: rgba(255, 0, 80, 0.15); color: #ff0050;"><i class="fab fa-tiktok"></i></div>
                    <span class="shortcut-label">TikTok</span>
                  </div>
                  <div class="shortcut-card" data-url="https://twitch.tv">
                    <div class="shortcut-icon" style="background: rgba(145, 70, 255, 0.15); color: #9146ff;"><i class="fab fa-twitch"></i></div>
                    <span class="shortcut-label">Twitch</span>
                  </div>
                  <div class="shortcut-card" data-url="https://github.com">
                    <div class="shortcut-icon" style="background: rgba(255, 255, 255, 0.1); color: #e2e4e9;"><i class="fab fa-github"></i></div>
                    <span class="shortcut-label">GitHub</span>
                  </div>
                  <div class="shortcut-card" data-url="https://wikipedia.org">
                    <div class="shortcut-icon" style="background: rgba(136, 192, 208, 0.15); color: #88c0d0;"><i class="fab fa-wikipedia-w"></i></div>
                    <span class="shortcut-label">Wikipedia</span>
                  </div>
                  <div class="shortcut-card" data-url="https://fmhy.net">
                    <div class="shortcut-icon" style="background: rgba(235, 203, 139, 0.15); color: #ebcb8b;"><i class="fas fa-star"></i></div>
                    <span class="shortcut-label">FMHY</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="tab-frame-container" style="display: none;">
            <div class="tab-frame-loader">
              <div class="tab-frame-loader-bar"></div>
            </div>
            <iframe class="tab-proxy-frame" allow="fullscreen; clipboard-read; clipboard-write; gamepad" allowfullscreen></iframe>
          </div>
        `;

        // Home Search Events
        const homeSearchInput = viewportEl.querySelector('.tab-home-search-input');
        const homeSearchBtn = viewportEl.querySelector('.tab-home-search-btn');

        const triggerHomeSearch = () => {
          const val = homeSearchInput?.value.trim();
          if (val) this.navigateTab(tabId, val);
        };

        homeSearchInput?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') triggerHomeSearch();
        });
        homeSearchBtn?.addEventListener('click', triggerHomeSearch);

        // Shortcut Clicks
        viewportEl.querySelectorAll('.shortcut-card').forEach((card) => {
          card.addEventListener('click', () => {
            const u = card.getAttribute('data-url');
            if (u) this.navigateTab(tabId, u);
          });
        });

        this.viewportsEl.appendChild(viewportEl);

        // Switch to the new tab
        this.switchTab(tabId);

        // Scroll tab bar to show new tab
        if (this.tabBarContainer) {
          this.tabBarContainer.scrollTo({
            left: this.tabBarContainer.scrollWidth,
            behavior: 'smooth',
          });
        }

        if (url) {
          this.navigateTab(tabId, url);
        }

        return tabId;
      }

      switchTab(tabId) {
        const tab = this.tabs.find((t) => t.id === tabId);
        if (!tab) return;

        this.activeTabId = tabId;

        document
          .querySelectorAll('.browser-tab')
          .forEach((el) => el.classList.remove('active'));
        document.getElementById(`header-${tabId}`)?.classList.add('active');

        document
          .querySelectorAll('.browser-tab-viewport')
          .forEach((el) => el.classList.remove('active'));
        document.getElementById(`viewport-${tabId}`)?.classList.add('active');

        if (this.addressInput) {
          this.addressInput.value = tab.isLoaded ? tab.url : '';
        }

        document
          .getElementById(`header-${tabId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

        this.syncTabFromFrame(tabId);

        if (this.backBtn) this.backBtn.disabled = !tab.isLoaded;
        if (this.forwardBtn) this.forwardBtn.disabled = !tab.isLoaded;
      }

      closeTab(tabId, e) {
        if (e) e.stopPropagation();

        const index = this.tabs.findIndex((t) => t.id === tabId);
        if (index === -1) return;

        document.getElementById(`header-${tabId}`)?.remove();
        document.getElementById(`viewport-${tabId}`)?.remove();

        this.tabs.splice(index, 1);

        if (this.activeTabId === tabId) {
          if (this.tabs.length > 0) {
            const nextIndex = Math.min(index, this.tabs.length - 1);
            this.switchTab(this.tabs[nextIndex].id);
          } else {
            this.createTab();
          }
        }
      }

      navigateActiveTab(queryOrUrl) {
        if (this.activeTabId) {
          this.navigateTab(this.activeTabId, queryOrUrl);
        }
      }

      navigateTab(tabId, queryOrUrl) {
        const tab = this.tabs.find((t) => t.id === tabId);
        const viewportEl = document.getElementById(`viewport-${tabId}`);
        if (!tab || !viewportEl) return;

        let rawQuery = (queryOrUrl || '').trim();
        if (!rawQuery) return;

        // Clean template route placeholders and sj: prefixes
        rawQuery = resolveRoute(rawQuery);
        if (rawQuery.startsWith('sj:')) rawQuery = rawQuery.slice(3).trim();

        // Distinguish local internal paths from web URLs
        let targetUrl;
        if (
          rawQuery.startsWith('/') ||
          rawQuery.startsWith('./') ||
          rawQuery.startsWith('../')
        ) {
          targetUrl = new URL(rawQuery, location.origin).href;
        } else if (
          rawQuery.startsWith('about:') ||
          rawQuery.startsWith('blob:')
        ) {
          targetUrl = rawQuery;
        } else {
          targetUrl = search(rawQuery);
        }

        tab.url = rawQuery;
        tab.isLoaded = true;

        let displayTitle = rawQuery;
        try {
          const u = new URL(targetUrl);
          displayTitle =
            u.origin === location.origin
              ? u.pathname.replace(/^\/archive\/g\//, '').replace(/\/$/, '') || 'Portal'
              : u.hostname.replace(/^www\./, '');
        } catch {}

        tab.title = displayTitle;

        const headerEl = document.getElementById(`header-${tabId}`);
        if (headerEl) {
          const titleSpan = headerEl.querySelector('.browser-tab-title');
          if (titleSpan) titleSpan.textContent = displayTitle;
        }

        if (this.activeTabId === tabId && this.addressInput) {
          this.addressInput.value = rawQuery;
        }

        const homeScreen = viewportEl.querySelector('.tab-home-screen');
        const frameContainer = viewportEl.querySelector('.tab-frame-container');
        const frame = viewportEl.querySelector('.tab-proxy-frame');
        const loader = viewportEl.querySelector('.tab-frame-loader');

        if (homeScreen) homeScreen.style.display = 'none';
        if (frameContainer) frameContainer.style.display = 'block';

        loader?.classList.add('active');

        const hideLoader = () => {
          loader?.classList.remove('active');
        };

        setTimeout(hideLoader, 6000);

        frame.onload = () => {
          hideLoader();
          this.syncTabFromFrame(tabId);

          // Listen for pushState/popstate and link clicks within the frame
          try {
            const cw = frame.contentWindow;
            if (cw) {
              cw.addEventListener('popstate', () => this.syncTabFromFrame(tabId));
              cw.addEventListener('hashchange', () => this.syncTabFromFrame(tabId));

              if (cw.history && !cw.history._portalHooked) {
                cw.history._portalHooked = true;
                const origPush = cw.history.pushState;
                cw.history.pushState = (...args) => {
                  const res = origPush.apply(cw.history, args);
                  this.syncTabFromFrame(tabId);
                  return res;
                };
                const origReplace = cw.history.replaceState;
                cw.history.replaceState = (...args) => {
                  const res = origReplace.apply(cw.history, args);
                  this.syncTabFromFrame(tabId);
                  return res;
                };
              }
            }
          } catch (e) {}
        };

        const doNav = () => {
          // 1. Local origin paths (e.g. /archive/g/..., /webretro, /flash) load directly
          if (
            targetUrl.startsWith('about:') ||
            targetUrl.startsWith('blob:') ||
            targetUrl.startsWith(location.origin)
          ) {
            frame.src = targetUrl;
            return;
          }

          // 2. External sites: Route through Ultraviolet or Scramjet
          const proxyEngine = readStorage('ProxyEngine') || 'ultraviolet';
          const uvConfigObj =
            window.__uv$config || (typeof uvConfig !== 'undefined' ? uvConfig : null);
          const uvPrefix = uvConfigObj?.prefix
            ? resolveRoute(uvConfigObj.prefix)
            : '/uv/service/';
          const uvEncode =
            uvConfigObj?.encodeUrl ||
            (typeof Ultraviolet !== 'undefined' &&
              Ultraviolet.codec?.xor?.encode) ||
            encodeURIComponent;

          // If Scramjet is selected and ready, try Scramjet
          if (
            proxyEngine === 'scramjet' &&
            window.$invisiScramjet?.ready &&
            window.$invisiScramjet.controller
          ) {
            try {
              if (!frame.$scramjetFrame) {
                frame.$scramjetFrame = window.$invisiScramjet.controller.createFrame(
                  frame,
                  {
                    plugins: [
                      ...(typeof $scramjetUtils !== 'undefined'
                        ? [
                            new $scramjetUtils.UrlWatcherPlugin((url) => {
                              this.updateTabLocation(tabId, url);
                            }),
                          ]
                        : []),
                    ],
                  }
                );
              }
              if (
                frame.$scramjetFrame &&
                typeof frame.$scramjetFrame.go === 'function'
              ) {
                frame.$scramjetFrame.go(targetUrl);
                return;
              }
            } catch (err) {
              console.warn('Scramjet frame error, falling back to UV:', err);
            }
          }

          // Rock-solid Ultraviolet fallback
          frame.src = location.origin + uvPrefix + uvEncode(targetUrl);
        };

        if (
          window.$invisiScramjet?.ready ||
          typeof uvConfig !== 'undefined' ||
          typeof Ultraviolet !== 'undefined' ||
          targetUrl.startsWith(location.origin)
        ) {
          doNav();
        } else {
          window.addEventListener('s-ready', doNav, { once: true });
          setTimeout(doNav, 1000);
        }
      }

      goBack() {
        const viewportEl = document.getElementById(`viewport-${this.activeTabId}`);
        const frame = viewportEl?.querySelector('.tab-proxy-frame');
        if (frame?.contentWindow) {
          try {
            frame.contentWindow.history.back();
            setTimeout(() => this.syncTabFromFrame(this.activeTabId), 300);
          } catch {
            frame.src = frame.src;
          }
        }
      }

      goForward() {
        const viewportEl = document.getElementById(`viewport-${this.activeTabId}`);
        const frame = viewportEl?.querySelector('.tab-proxy-frame');
        if (frame?.contentWindow) {
          try {
            frame.contentWindow.history.forward();
            setTimeout(() => this.syncTabFromFrame(this.activeTabId), 300);
          } catch {}
        }
      }

      reload() {
        const viewportEl = document.getElementById(`viewport-${this.activeTabId}`);
        const frame = viewportEl?.querySelector('.tab-proxy-frame');
        const loader = viewportEl?.querySelector('.tab-frame-loader');
        if (frame) {
          loader?.classList.add('active');
          frame.src = frame.src;
        }
      }

      goHome() {
        const tab = this.tabs.find((t) => t.id === this.activeTabId);
        const viewportEl = document.getElementById(`viewport-${this.activeTabId}`);
        if (!tab || !viewportEl) return;

        tab.isLoaded = false;
        tab.url = '';
        tab.title = 'New Tab';

        const headerEl = document.getElementById(`header-${this.activeTabId}`);
        const titleSpan = headerEl?.querySelector('.browser-tab-title');
        if (titleSpan) titleSpan.textContent = 'New Tab';

        if (this.addressInput) this.addressInput.value = '';

        const homeScreen = viewportEl.querySelector('.tab-home-screen');
        const frameContainer = viewportEl.querySelector('.tab-frame-container');
        const frame = viewportEl.querySelector('.tab-proxy-frame');

        if (homeScreen) homeScreen.style.display = 'flex';
        if (frameContainer) frameContainer.style.display = 'none';
        if (frame) frame.src = 'about:blank';
      }

      toggleFullscreen() {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }

      initViewSwitcher() {
        const views = {
          browser: document.getElementById('browser-view'),
          games: document.getElementById('games-view'),
          apps: document.getElementById('apps-view'),
        };

        const buttons = {
          browser: document.getElementById('nav-btn-browser'),
          games: document.getElementById('nav-btn-games'),
          apps: document.getElementById('nav-btn-apps'),
        };

        const showView = (viewKey) => {
          Object.values(views).forEach((v) => v?.classList.remove('active'));
          Object.values(buttons).forEach((b) => b?.classList.remove('active'));

          views[viewKey]?.classList.add('active');
          buttons[viewKey]?.classList.add('active');
        };

        buttons.browser?.addEventListener('click', () => showView('browser'));
        buttons.games?.addEventListener('click', () => showView('games'));
        buttons.apps?.addEventListener('click', () => showView('apps'));
        document
          .getElementById('brand-home-btn')
          ?.addEventListener('click', () => showView('browser'));

        this.showView = showView;
      }

      async initGamesPortal() {
        const grid = document.getElementById('games-grid');
        const searchInput = document.getElementById('games-search-input');
        const filterBtns = document.querySelectorAll(
          '#games-filters .games-filter-btn'
        );
        if (!grid) return;

        let allGames = [];

        const safeFetch = async (url) => {
          try {
            const cleanUrl = resolveRoute(url);
            const r = await fetch(cleanUrl);
            if (r.ok) return await r.json();
          } catch (e) {}
          return [];
        };

        try {
          const [h5, emulib, flash, emu] = await Promise.all([
            safeFetch('{{route}}{{/assets/json/h5-nav.json}}'),
            safeFetch('{{route}}{{/assets/json/emulib-nav.json}}'),
            safeFetch('{{route}}{{/assets/json/flash-nav.json}}'),
            safeFetch('{{route}}{{/assets/json/emu-nav.json}}'),
          ]);

          // Process HTML5 games
          h5.forEach((item) => {
            let target = '';
            if (item.custom && goProx[item.custom]) {
              try {
                const res =
                  typeof goProx[item.custom] === 'function'
                    ? goProx[item.custom]()
                    : goProx[item.custom];
                target = (res || '').replace(/^sj:/, '');
              } catch {
                target = `/archive/g/${item.path || ''}`;
              }
            } else {
              target = `/archive/g/${item.path || ''}`;
            }

            allGames.push({
              name: item.name,
              category: 'h5',
              categoryLabel: 'HTML5',
              img: item.img
                ? resolveRoute(`{{route}}{{/assets/img/h5g/}}${item.img}`)
                : resolveRoute('{{route}}{{/assets/img/hero.webp}}'),
              url: target,
            });
          });

          // Process Emulib retro games
          emulib.forEach((item) => {
            allGames.push({
              name: item.name,
              category: 'emulib',
              categoryLabel: item.core?.toUpperCase() || 'Retro',
              img: item.img
                ? resolveRoute(`{{route}}{{/assets/img/emulib/}}${item.img}`)
                : resolveRoute('{{route}}{{/assets/img/hero.webp}}'),
              url: `/webretro?core=${encodeURIComponent(item.core || '')}&rom=${encodeURIComponent(item.rom || '')}`,
            });
          });

          // Process Flash games
          flash.forEach((item) => {
            const title = item.replace(/\.swf$/i, '').replace(/[-_]/g, ' ');
            allGames.push({
              name: title.charAt(0).toUpperCase() + title.slice(1),
              category: 'flash',
              categoryLabel: 'Flash',
              img: resolveRoute('{{route}}{{/assets/img/hero.webp}}'),
              url: `/flash?swf=${encodeURIComponent(item)}`,
            });
          });

          // Process Standalone Emulators
          emu.forEach((item) => {
            allGames.push({
              name: item.name,
              category: 'emu',
              categoryLabel: 'Emulator',
              img: item.img
                ? resolveRoute(`{{route}}{{/assets/img/emu/}}${item.img}`)
                : resolveRoute('{{route}}{{/assets/img/hero.webp}}'),
              url: item.path || '',
            });
          });
        } catch (e) {
          console.warn('Failed loading games data', e);
        }

        let currentCategory = 'all';
        let currentSearch = '';

        const renderGames = () => {
          grid.innerHTML = '';
          const filtered = allGames.filter((g) => {
            const matchCat =
              currentCategory === 'all' || g.category === currentCategory;
            const matchSearch =
              !currentSearch ||
              g.name.toLowerCase().includes(currentSearch.toLowerCase());
            return matchCat && matchSearch;
          });

          if (filtered.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--nord3);">No games found matching "${currentSearch}".</div>`;
            return;
          }

          filtered.slice(0, 120).forEach((game) => {
            const card = document.createElement('div');
            card.className = 'game-portal-card';
            card.innerHTML = `
              <img class="game-portal-thumb" src="${game.img}" alt="${game.name}" loading="lazy" onerror="this.src='${resolveRoute('{{route}}{{/assets/img/hero.webp}}')}'" />
              <div class="game-portal-info">
                <span class="game-portal-badge">${game.categoryLabel}</span>
                <h3 class="game-portal-name">${game.name}</h3>
              </div>
            `;

            card.addEventListener('click', () => {
              this.showView('browser');
              this.createTab(game.url, game.name, 'fas fa-gamepad');
            });

            grid.appendChild(card);
          });
        };

        renderGames();

        searchInput?.addEventListener('input', (e) => {
          currentSearch = e.target.value.trim();
          renderGames();
        });

        filterBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            filterBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.getAttribute('data-category');
            renderGames();
          });
        });
      }

      initAppsPortal() {
        const grid = document.getElementById('apps-grid');
        if (!grid) return;

        const apps = [
          {
            name: 'YouTube',
            desc: 'Stream videos and channels',
            icon: 'fab fa-youtube',
            color: '#ff4444',
            url: 'https://youtube.com',
          },
          {
            name: 'Discord',
            desc: 'Chat with friends & communities',
            icon: 'fab fa-discord',
            color: '#5865f2',
            url: 'https://discord.com/app',
          },
          {
            name: 'ChatGPT',
            desc: 'Conversational AI intelligence',
            icon: 'fas fa-robot',
            color: '#10a37f',
            url: 'https://chat.openai.com',
          },
          {
            name: 'Spotify',
            desc: 'Music and podcasts online',
            icon: 'fab fa-spotify',
            color: '#1ed760',
            url: 'https://open.spotify.com',
          },
          {
            name: 'Twitter / X',
            desc: 'Real-time social discussions',
            icon: 'fab fa-twitter',
            color: '#1da1f2',
            url: 'https://twitter.com',
          },
          {
            name: 'TikTok',
            desc: 'Short viral web videos',
            icon: 'fab fa-tiktok',
            color: '#ff0050',
            url: 'https://tiktok.com',
          },
          {
            name: 'Twitch',
            desc: 'Live streaming for gamers',
            icon: 'fab fa-twitch',
            color: '#9146ff',
            url: 'https://twitch.tv',
          },
          {
            name: 'Reddit',
            desc: 'Front page of the internet',
            icon: 'fab fa-reddit',
            color: '#ff4500',
            url: 'https://reddit.com',
          },
          {
            name: 'Wikiwand',
            desc: 'Modern Wikipedia encyclopedia',
            icon: 'fab fa-wikipedia-w',
            color: '#88c0d0',
            url: 'https://www.wikiwand.com',
          },
          {
            name: 'FMHY',
            desc: 'Curated media navigation wiki',
            icon: 'fas fa-star',
            color: '#ebcb8b',
            url: 'https://fmhy.net',
          },
        ];

        apps.forEach((app) => {
          const card = document.createElement('div');
          card.className = 'app-portal-card';
          card.innerHTML = `
            <div class="app-portal-icon" style="background: ${app.color}1a; color: ${app.color};">
              <i class="${app.icon}"></i>
            </div>
            <div class="app-portal-info">
              <h3 class="app-portal-name">${app.name}</h3>
              <p class="app-portal-desc">${app.desc}</p>
            </div>
          `;

          card.addEventListener('click', () => {
            this.showView('browser');
            this.createTab(app.url, app.name, app.icon);
          });

          grid.appendChild(card);
        });
      }

      initModals() {
        // Modal openers
        document
          .getElementById('btn-open-settings')
          ?.addEventListener('click', () => {
            document.getElementById('settings-modal')?.classList.add('active');
          });
        document.getElementById('btn-open-cloak')?.addEventListener('click', () => {
          document.getElementById('cloak-modal')?.classList.add('active');
        });
        document
          .getElementById('btn-open-license')
          ?.addEventListener('click', () => {
            document.getElementById('license-modal')?.classList.add('active');
          });

        // Close handlers
        document.querySelectorAll('[data-close-modal]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-close-modal');
            if (modalId)
              document.getElementById(modalId)?.classList.remove('active');
          });
        });

        document
          .querySelectorAll('.consumer-modal-backdrop')
          .forEach((backdrop) => {
            backdrop.addEventListener('click', (e) => {
              if (e.target === backdrop) backdrop.classList.remove('active');
            });
          });

        // Blank cloak trigger inside cloak modal
        document
          .getElementById('btn-trigger-blank-cloak')
          ?.addEventListener('click', () => {
            openBlankCloak();
          });

        // Cloak presets
        const cloakPresetSelect = document.getElementById(
          'setting-cloak-preset'
        );
        const customTitle = document.getElementById('custom-cloak-title');
        const customIcon = document.getElementById('custom-cloak-icon');
        const applyCloakBtn = document.getElementById('btn-apply-cloak');

        const presets = {
          'google-classroom': {
            title: 'Home',
            icon: 'https://ssl.gstatic.com/classroom/favicon.png',
          },
          'google-drive': {
            title: 'My Drive - Google Drive',
            icon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png',
          },
          'google-docs': {
            title: 'Google Docs',
            icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico',
          },
          canvas: {
            title: 'Dashboard',
            icon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico',
          },
          desmos: {
            title: 'Desmos | Graphing Calculator',
            icon: 'https://www.desmos.com/favicon.ico',
          },
        };

        cloakPresetSelect?.addEventListener('change', (e) => {
          const preset = presets[e.target.value];
          if (preset && customTitle && customIcon) {
            customTitle.value = preset.title;
            customIcon.value = preset.icon;
          }
        });

        applyCloakBtn?.addEventListener('click', () => {
          if (customTitle && customTitle.value) {
            document.title = customTitle.value;
          }
          if (customIcon && customIcon.value) {
            let link = document.querySelector("link[rel*='icon']");
            if (!link) {
              link = document.createElement('link');
              link.rel = 'shortcut icon';
              document.head.appendChild(link);
            }
            link.href = customIcon.value;
          }
          document.getElementById('cloak-modal')?.classList.remove('active');
        });
      }
    }

    // Initialize InvisiBrowser
    window.invisiBrowser = new InvisiBrowser();

    const isTopLevel = window.self === window.top;
    if (isTopLevel) {
      const launchType = readStorage('LaunchType');
      let newWindow = null;

      if (launchType === 'blank') {
        newWindow = openBlankCloak();
      } else if (launchType === 'blob') {
        newWindow = openBlobCloak();
      }

      if (newWindow) {
        window.location.replace('about:blank');
        setTimeout(() => {
          window.close();
        }, 100);
      }
    }
  };
  if ('loading' === document.readyState)
    addEventListener('DOMContentLoaded', preparePage);
  else preparePage();
})();

