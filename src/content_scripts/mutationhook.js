/* global
MIRI_EVENTS

Miri
SettingStorage
log
debug

renderRuby
setRubyVisibility
updateRubySizeStyle
updateRubyColorStyle
updateSelectStyle
*/

const onTokenReady = (c, t) => {
  renderRuby(c, t);
};

const registerMutationHook = () => {
  const MAIN_CONTAINER_SELECTOR = '#react-root';
  const TL_CONTAINER_SELECTOR = 'section>div>div>div';
  const TWEET_ARTICLE_SELECTOR = 'article div[lang=ja]';

  const mainContainer = document.querySelector(MAIN_CONTAINER_SELECTOR);

  if (!mainContainer) {
    log('not found main container element.');
    return false;
  }

  const observer = new MutationObserver((mutationsList) => {
    const tlContainer = document.querySelector(TL_CONTAINER_SELECTOR);
    if (!tlContainer) {
      // timeline container should be rendered
      return;
    }

    const tweetBag = [];
    mutationsList.forEach((mutation) => {
      const { addedNodes } = mutation;

      if (!addedNodes.length) {
        // ignore the non-add events
        return;
      }

      if (
        addedNodes.length === 1 && (
          addedNodes[0].nodeType === 3 ||
          addedNodes[0].tagName === "RUBY"
        )
      ) {
        // ignore kana updates
        return;
      }

      addedNodes.forEach((node) => {
        if (node.nodeType !== 1) {
          // node type should be element(1)
          return;
        }

        const articles = node.querySelectorAll(TWEET_ARTICLE_SELECTOR);
        articles.forEach((article) => {
          [...article.children].forEach((c) => {
            if (c.childElementCount) {
              // contaniner should only has text node
              return;
            }

            if (c.tagName === 'IMG') {
              // the data-emoji-text will cause the bug that
              // chrome copy the hidden ruby text unexpectly
              // this is a workaround, may cause some issue
              // on accessibility
              if (c.dataset.emojiText) {
                c.removeAttribute('data-emoji-text');
              }
            }

            if (c.tagName !== 'SPAN') {
              // child should has span sub-child
              return;
            }

            if (!c.childNodes.length || c.childNodes.nodeType === 3) {
              // sub-child should has text node(3)
              return;
            }

            const { textContent } = c.childNodes[0];
            if (!textContent.trim().length) {
              // text content should not empty
              return;
            }

            // Twitter bug 2020-08-17 ?
            // sometimes twitter will update same element twice with unknown rease
            // unique the result to prevent appending duplicate ruby
            const duplicated = tweetBag.some((t) => t.c === c && t.tc === textContent);
            if (duplicated) {
              return;
            }

            tweetBag.push({
              c,
              tc: textContent,
            });
          });
        });
      });
    });

    if (tweetBag.length) {
      miri.addTweets(tweetBag);
    }
  });

  observer.observe(mainContainer, { childList: true, subtree: true });
  return true;
};

const registerDeckMutationHook = () => {
  const MAIN_CONTAINER_SELECTOR = 'body>div.application';
  const COLUMN_CONTAINER_SELECTOR = 'div.column-scroller';
  const TWEET_ARTICLE_SELECTOR = 'p.tweet-text[lang=ja]';

  const mainContainer = document.querySelector(MAIN_CONTAINER_SELECTOR);

  if (!mainContainer) {
    log('not found main container element.');
    return false;
  }

  const observer = new MutationObserver((mutationsList) => {
    const columnContainer = document.querySelector(COLUMN_CONTAINER_SELECTOR);
    if (!columnContainer) {
      // column container should be rendered
      return;
    }

    const tweetBag = [];
    mutationsList.forEach((mutation) => {
      const { addedNodes } = mutation;

      if (!addedNodes.length) {
        // ignore the non-add events
        return;
      }

      if (
        addedNodes.length === 1 && (
          addedNodes[0].nodeType === 3 ||
          addedNodes[0].tagName === "RUBY" ||
          addedNodes[0].tagName === "SPAN"
        )
      ) {
        // ignore kana updates
        return;
      }

      addedNodes.forEach((node) => {
        if (node.nodeType !== 1) {
          // node type should be element(1)
          return;
        }

        const articles = node.querySelectorAll(TWEET_ARTICLE_SELECTOR);
        articles.forEach((article) => {
          [...article.childNodes].forEach((c) => {
            if (c.nodeType !== 3) {
              // only get text node(3)
              return
            }

            const { textContent } = c;
            if (!textContent.trim().length) {
              // text content should not empty
              return;
            }

            const textSpan = document.createElement("span");
            article.replaceChild(textSpan, c);
            tweetBag.push({
              c: textSpan,
              tc: textContent,
            });
          });
        });
      });
    });

    if (tweetBag.length) {
      miri.addTweets(tweetBag);
    }
  });

  observer.observe(mainContainer, { childList: true, subtree: true });
  return true;
};

const registerGeneralMutationHook = async () => {
  const loc = window.location;
  const site = loc.host;

  const {component} = await SelectorStorage.get(site);

  if (component === undefined) {
    return false;
  }
  const mainContainer = document.body.querySelector(component);
  
  if (!mainContainer) {
    log('not found main container element.');
    return false;
  }

  const findElements = async (mutationsList) => {
    const elementBag = [];
    const addToBag = (element) => {
      if (elementBag.includes(element)) return;
      if (element.innerHTML.includes('class="furigana"')) return; // TODO: check this
      
      const textContent = element.innerText;
      if (!textContent.trim().length) {
        // text content should not empty
        return;
      }
      elementBag.push(element);
    }

    const {queries} = await SelectorStorage.get(site);
    mutationsList.forEach((mutation) => {
      const { addedNodes } = mutation;

      if (!addedNodes.length) {
        // ignore the non-add events
        return;
      }

      addedNodes.forEach((node) => {
        if (node.nodeType === 3) {
          // should not be a text node, therefore we use the parent node
          if (node.parentNode === null) return;
          node = node.parentNode
        }

        // node type should be element(1)
        if (node.nodeType !== 1) return;
        queries.forEach((query) => {
          if (node.matches(query)) {
            addToBag(node);
          }
          else {
            const elements = node.querySelectorAll(query);
            elements.forEach(addToBag);
          }
        });
      });
    });

    if (elementBag.length) {
      const bag = []
      elementBag.forEach( (e) => { 
        bag.push({
          c: e,
          tc: e.textContent,
        });
      });
      miri.addTweets(bag); // TODO: might need be changed to generalized version
    }
  };

  const observer = new MutationObserver(findElements);

  observer.observe(mainContainer, { childList: true, subtree: true });
  findElements([{addedNodes: [mainContainer]}]); // run once on mainContainer

  chrome.runtime.onMessage.addListener((message) => {
    const {event} = message;
  
    if (event !== MIRI_EVENTS.SELECTOR_ADDED) {
      return false;
    }

    const [site, component, query] = message.selector;
    const loc = window.location;
    const current_site = loc.host;

    if (current_site !== site) {
      return false;
    }

    const mainContainer = document.body.querySelector(component);
    findElements([{addedNodes: [mainContainer]}]); // run once on mainContainer
    return true;
  });

  return true;
};

// main

oninit.push ( () => {
  log('initialized.');

  window.miri = new Miri({
    onTokenReady,
  });

  SettingStorage.get().then((settings) => {
    const {
      enabled,
      pct,
      furigana_selectable,
      color
    } = settings;
    setRubyVisibility('miri-ruby-visible', enabled);
    updateRubySizeStyle('miri-ruby', pct);
    updateRubyColorStyle('miri-ruby-color', color);
    updateSelectStyle('miri-furigana-select', furigana_selectable);
  });

  chrome.runtime.onMessage.addListener((message) => {
    const {event} = message;
  
    if (event !== MIRI_EVENTS.SETTING_CHANGED) {
      return false;
    }
    const settings = event.settings;
    if ('enabled' in settings) {
      setRubyVisibility('miri-ruby-visible', settings.enabled);
    }
    
    if ('pct' in settings) {
      updateRubySizeStyle('miri-ruby', settings.pct);
    }

    if ('color' in settings) {
      updateRubyColorStyle('miri-ruby-color', settings.color);
    }

    if ('furigana_selectable' in settings) {
      updateSelectStyle('miri-furigana-select', settings.furigana_selectable);
    }
  });

  var hooked = false;
  hooked = registerMutationHook();
  hooked = hooked || registerDeckMutationHook();

  if (!hooked) {
    setTimeout(async () => {
      hooked = hooked || await registerGeneralMutationHook();

      if (!hooked) {
        chrome.runtime.onMessage.addListener((message) => {
          const {event} = message;
        
          if (hooked || event !== MIRI_EVENTS.SELECTOR_ADDED) {
            return false;
          }
      
          const site = message.selector[0];
          const loc = window.location;
          const current_site = loc.host;
      
          if (current_site !== site) {
            return false;
          }

          registerGeneralMutationHook().then( (success) => { hooked = success; } );
          return true;
        });
      }
    }, 250);
  }


  // chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  //   const { event, value } = request;
  //   if (event === MIRI_EVENTS.TOGGLE_EXTENSION) {
  //     setRubyVisibility('miri-ruby-visible', value);
  //     SettingStorage.set({ enabled: value });
  //   } else if (event === MIRI_EVENTS.UPDATE_FURIGANA_SIZE) {
  //     updateRubySizeStyle('miri-ruby', value);
  //     SettingStorage.set({ pct: value });
  //   } else if (event === MIRI_EVENTS.UPDATE_FURIGANA_COLOR) {
  //     updateRubyColorStyle('miri-ruby-color', value);
  //     SettingStorage.set({ color: value });
  //   } else if (event === MIRI_EVENTS.UPDATE_FURIGANA_SELECTABLE) {
  //     updateSelectStyle('miri-furigana-select', value);
  //     SettingStorage.set({ furigana_selectable: value });
  //   }
  // });
});