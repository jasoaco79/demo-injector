/**
 * Bridge script — runs in ISOLATED world.
 * Relays state from chrome.storage/runtime to the MAIN world interceptor
 * via custom DOM events and a hidden element.
 */

(function() {
  'use strict';

  // Each bridge instance gets a unique ID. Only the latest one should be active.
  // When a new bridge loads, it replaces the token — old bridges see the mismatch and die.
  const BRIDGE_TOKEN_KEY = '__sophos_demo_bridge_token__';
  const myToken = Math.random().toString(36).slice(2);
  
  try {
    // Claim ownership — any previous bridge will see it's no longer current
    window[BRIDGE_TOKEN_KEY] = myToken;
  } catch {}

  let contextDead = false;

  function isAlive() {
    if (contextDead) return false;
    // Check if we're still the current bridge
    try {
      if (window[BRIDGE_TOKEN_KEY] !== myToken) {
        contextDead = true;
        return false;
      }
      return !!chrome.runtime?.id;
    } catch {
      contextDead = true;
      return false;
    }
  }

  function safeSendMessage(msg, callback) {
    if (!isAlive()) return;
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) {
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
    if (!isAlive()) return;
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
      if (!isAlive()) return;
      if (msg.type === 'STATE_UPDATED') {
        pushState(msg.state);
      }
    });
  } catch {
    contextDead = true;
  }

  // Listen for intercepted count from MAIN world
  function onMessage(e) {
    if (!isAlive()) {
      window.removeEventListener('message', onMessage);
      return;
    }
    if (e.data?.type === '__sophos_demo_intercepted_count__') {
      safeSendMessage({ type: 'INCREMENT_INTERCEPTED', count: e.data.count });
    }
  }
  window.addEventListener('message', onMessage);
})();
