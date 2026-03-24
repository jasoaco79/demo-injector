/**
 * Bridge script — runs in ISOLATED world.
 * Relays state from chrome.storage/runtime to the MAIN world interceptor
 * via custom DOM events and a hidden element.
 */

(function() {
  'use strict';

  let contextDead = false;

  function isContextValid() {
    if (contextDead) return false;
    try {
      return !!chrome.runtime?.id;
    } catch {
      contextDead = true;
      return false;
    }
  }

  function safeSendMessage(msg, callback) {
    if (!isContextValid()) return;
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) {
          // Context died between check and send
          contextDead = true;
          return;
        }
        if (callback) callback(resp);
      });
    } catch {
      contextDead = true;
    }
  }

  const STATE_ELEMENT_ID = '__sophos_demo_state__';

  function pushState(state) {
    let el = document.getElementById(STATE_ELEMENT_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = STATE_ELEMENT_ID;
      el.style.display = 'none';
      document.documentElement.appendChild(el);
    }
    el.textContent = JSON.stringify(state);
    window.dispatchEvent(new CustomEvent('__sophos_demo_state_update__', { detail: state }));
  }

  // Load and push initial state
  safeSendMessage({ type: 'GET_STATE' }, (state) => {
    if (state) pushState(state);
  });

  // Listen for state updates from background
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (contextDead) return;
      if (!isContextValid()) return;
      if (msg.type === 'STATE_UPDATED') {
        pushState(msg.state);
      }
    });
  } catch {
    contextDead = true;
  }

  // Listen for intercepted count from MAIN world
  function onMessage(e) {
    if (contextDead) {
      window.removeEventListener('message', onMessage);
      return;
    }
    if (e.data?.type === '__sophos_demo_intercepted_count__') {
      safeSendMessage({ type: 'INCREMENT_INTERCEPTED', count: e.data.count });
    }
  }
  window.addEventListener('message', onMessage);

  console.log('[Sophos Demo] 🔗 Bridge loaded');
})();
