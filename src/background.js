import {MIRI_EVENTS, PARSE_ENGINES, STORAGE_KEYS, SETTING_DEFAULTS} from './constants.js';
import {kuromoji} from './thirdparty/kuromoji.js';
import {rebulidToken} from './background/token-rules.js';
import {retrieveFromCache, persiseToCache} from './background/memory-cache.js';
import "./storages.js";
import { FilterStorage, SelectorStorage, SettingStorage, TokenStorage } from './storages.js';
import {sendToActiveTab} from './common.js';

function listenTokenParseMessage(callback) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { event, tweets } = request;
    if (event !== MIRI_EVENTS.REQUEST_TOKEN) {
      return false;
    }

    callback(tweets, sendResponse);
    return true;
  });
}

// init engine
chrome.storage.local.get((result = {}) => {
  const currentEngineKey = result[STORAGE_KEYS.CURRENT_PARSE_ENGINE_KEY] || SETTING_DEFAULTS.CURRENT_PARSE_ENGINE_DEFAULT;
  if (currentEngineKey === PARSE_ENGINES[0].key) {
    // local
    kuromoji.builder({ dicPath: 'data/' }).build().then((tokenizer) => {
      listenTokenParseMessage((tweets, sendResponse) => {
        const results = tweets.map((t) => {
          const token = tokenizer.tokenize(t);
          const ret = rebulidToken(token);
          ret.forEach((tok) => {
            TokenStorage.add(tok.s);
          });
          return ret;
        });
        sendResponse(results);
      });
    });
  } else if (currentEngineKey === PARSE_ENGINES[1].key) {
    // remote
    listenTokenParseMessage((tweets, sendResponse) => {
      const { cacheArray, requestArray } = retrieveFromCache(tweets);
      const postBody = JSON.stringify(requestArray);

      if (!requestArray.length) {
        // all tweets in cache, return immedately
        sendResponse(cacheArray);
        return;
      }

      fetch('https://api.mirigana.app/nlp', {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: postBody,
      }).then((res) => res.json())
        .then((tokens) => {
          // compose the complete token array
          const results = cacheArray.map((ca, idx) => {
            if (ca !== undefined) {
              return ca;
            }

            // persist to cache
            const k = tweets[idx];
            const v = tokens.shift();
            persiseToCache(k, v);
            TokenStorage.add(k);

            return (v);
          });

          // console.log('completed:', results);
          sendResponse(results);
        })
        .catch((error) => {
          sendResponse(null);
        });
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { event } = request;
  if (event !== MIRI_EVENTS.LOAD_SETTINGS) {
    // reject other events
    return false;
  }


  // TODO this function is duplicated with popup.js
  function nullish(value, defaultValue) {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    return value;
  }

  chrome.storage.sync.get((result = {}) => {
    sendResponse({
      enabled: nullish(result[STORAGE_KEYS.EXTENSION_ENABLED_KEY], SETTING_DEFAULTS.EXTENSION_ENABLED_DEFAULT),
      pct: nullish(result[STORAGE_KEYS.FURIGANA_SIZE_PERCENTAGE_KEY], SETTING_DEFAULTS.FURIGANA_SIZE_PERCENTAGE_DEFAULT),
      color: nullish(result[STORAGE_KEYS.FURIGANA_COLOR_KEY], SETTING_DEFAULTS.FURIGANA_COLOR_DEFAULT),
      furigana_selectable: nullish(result[STORAGE_KEYS.FURIGANA_SELECTABLE_KEY], SETTING_DEFAULTS.FURIGANA_SELECTABLE_DEFAULT),
    });
  });

  // indicate async callback
  return true;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { event } = request;
  if (event !== MIRI_EVENTS.LOAD_FILTERS) {
    // reject other events
    return false;
  }
  return true;

  chrome.storage.sync.get((result = {}) => {
    sendResponse({
      filters: result[STORAGE_KEYS.FILTER_LIST_KEY],
    });
  });

  // indicate async callback
  return true;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { event } = request;
  if (event !== MIRI_EVENTS.LOAD_SELECTORS) {
    // reject other events
    return false;
  }

  chrome.storage.sync.get((result = {}) => {
    sendResponse({
      selectors: result[STORAGE_KEYS.SELECTORS_KEY],
    });
  });

  // indicate async callback
  return true;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { event } = request;
  if (event !== MIRI_EVENTS.LOAD_EXTENSION_INFO) {
    // reject other events
    return false;
  }

  chrome.management.getSelf((info) => {
    sendResponse({ info });
  });

  // indicate async callback
  return true;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { event } = request;
  if (event !== MIRI_EVENTS.STORAGE_ACCESS) {
    // reject other events
    return false;
  }

  const storages = {
    filter: FilterStorage,
    selector: SelectorStorage,
    setting: SettingStorage,
    token: TokenStorage,
  }

  const {storage, func, params} = request;

  try {
    const ret = storages[storage][func](...params);
    sendResponse({success:true, ret});
  }
  catch (error) {
    sendResponse({success: false, error: `${error}`});
  }
  // indicate async callback
  return true;
});

// disable page action icon for unsupported sites
const manifest = chrome.runtime.getManifest();
const valid_url_regex = manifest['content_scripts'][0]['matches'].join('|');

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId).then((tab) => {
    if (tab.url.match(valid_url_regex)) {
      chrome.action.enable();
    } else {
      chrome.action.disable();
    }
  })
});

// add context menu
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'activate-picker') {
    sendToActiveTab(MIRI_EVENTS.ACTIVATE_ELEMENT_PICKER);
  }
});

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    title: "Enter element picker mode",
    contexts: ["all"],
    id: 'activate-picker'
  });
});