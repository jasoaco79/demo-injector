/**
 * Bridge script — runs in ISOLATED world.
 * Relays state from chrome.storage/runtime to the MAIN world interceptor
 * via custom DOM events and a hidden element.
 */

(function() {
  'use strict';

  // Guard against invalidated extension context (after reload/update)
  function isContextValid() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function safeSendMessage(msg, callback) {
    if (!isContextValid()) {
      console.warn('[Sophos Demo] Extension context invalidated — reload this tab (Ctrl+Shift+R)');
      return;
    }
    try {
      chrome.runtime.sendMessage(msg, callback);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) {
        console.warn('[Sophos Demo] Extension was reloaded — please refresh this tab (Ctrl+Shift+R)');
      }
    }
  }

  const STATE_ELEMENT_ID = '__sophos_demo_state__';

  // Push state to MAIN world
  function pushState(state) {
    // Method 1: Hidden DOM element
    let el = document.getElementById(STATE_ELEMENT_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = STATE_ELEMENT_ID;
      el.style.display = 'none';
      document.documentElement.appendChild(el);
    }
    el.textContent = JSON.stringify(state);

    // Method 2: Custom event (more reliable for live updates)
    window.dispatchEvent(new CustomEvent('__sophos_demo_state_update__', { detail: state }));
  }

  // Load and push initial state
  safeSendMessage({ type: 'GET_STATE' }, (state) => {
    if (state) pushState(state);
  });

  // Listen for state updates from background
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STATE_UPDATED') {
        pushState(msg.state);
      }
    });
  } catch (e) {
    // Extension context already invalidated on load
  }

  // Listen for intercepted count from MAIN world
  window.addEventListener('message', (e) => {
    if (e.data?.type === '__sophos_demo_intercepted_count__') {
      safeSendMessage({ 
        type: 'INCREMENT_INTERCEPTED', 
        count: e.data.count 
      });
    }
  });

  console.log('[Sophos Demo] 🔗 Bridge loaded');
})();
