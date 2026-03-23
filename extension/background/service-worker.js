/**
 * Background service worker — manages demo state, scenario loading, and messaging.
 * 
 * Scenarios are loaded from:
 * 1. Built-in JSON files in extension/scenarios/
 * 2. Custom JSON imported by the user
 * 3. Chrome storage (persisted custom scenarios)
 */

// ─── Built-in Scenario Registry ──────────────────────────────────────
const BUILTIN_SCENARIOS = ['ransomware', 'healthy', 'phishing', 'xdr'];

// Cache of loaded scenario data
let scenarioCache = {};

// Load a built-in scenario JSON
async function loadBuiltinScenario(name) {
  if (scenarioCache[name]) return scenarioCache[name];
  
  try {
    const url = chrome.runtime.getURL(`scenarios/${name}.json`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    scenarioCache[name] = data;
    return data;
  } catch (err) {
    console.error(`[Sophos Demo] Failed to load scenario "${name}":`, err);
    return null;
  }
}

// Load all built-in scenarios into cache
async function preloadScenarios() {
  for (const name of BUILTIN_SCENARIOS) {
    await loadBuiltinScenario(name);
  }
  console.log('[Sophos Demo] Preloaded', Object.keys(scenarioCache).length, 'built-in scenarios');
}

// Get the active scenario data (built-in or custom)
async function getActiveScenarioData(state) {
  const scenarioName = state.scenario || 'ransomware';
  
  // Check for custom scenario first
  if (state.customScenario) {
    return state.customScenario;
  }
  
  // Check custom scenarios in storage
  const stored = await chrome.storage.local.get('customScenarios');
  if (stored.customScenarios?.[scenarioName]) {
    return stored.customScenarios[scenarioName];
  }
  
  // Fall back to built-in
  return await loadBuiltinScenario(scenarioName);
}


// ─── Default State ───────────────────────────────────────────────────

const DEFAULT_STATE = {
  enabled: false,
  scenario: 'ransomware',
  customerName: 'Contoso Healthcare',
  endpointCount: 2500,
  serverCount: 186,
  interceptedCount: 0,
};


// ─── Initialization ──────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get('demoState');
  if (!data.demoState) {
    await chrome.storage.local.set({ demoState: DEFAULT_STATE });
  }
  await preloadScenarios();
});

// Also preload on service worker startup
preloadScenarios();


// ─── Message Handler ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // GET_STATE — returns state + resolved scenario data
  if (msg.type === 'GET_STATE') {
    (async () => {
      const data = await chrome.storage.local.get('demoState');
      const state = data.demoState || DEFAULT_STATE;
      const scenarioData = await getActiveScenarioData(state);
      sendResponse({ ...state, scenarioData });
    })();
    return true;
  }

  // SET_STATE — save state and push to all Sophos tabs
  if (msg.type === 'SET_STATE') {
    (async () => {
      await chrome.storage.local.set({ demoState: msg.state });
      const scenarioData = await getActiveScenarioData(msg.state);
      const stateWithScenario = { ...msg.state, scenarioData };

      // Push to all Sophos Central tabs
      const tabs = await chrome.tabs.query({ url: 'https://central.sophos.com/*' });
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'STATE_UPDATED', state: stateWithScenario }).catch(() => {});
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  // INCREMENT_INTERCEPTED
  if (msg.type === 'INCREMENT_INTERCEPTED') {
    chrome.storage.local.get('demoState', (data) => {
      const state = data.demoState || DEFAULT_STATE;
      state.interceptedCount = msg.count || (state.interceptedCount || 0) + 1;
      chrome.storage.local.set({ demoState: state });
    });
    return false;
  }

  // LIST_SCENARIOS — return available scenarios (built-in + custom)
  if (msg.type === 'LIST_SCENARIOS') {
    (async () => {
      // Built-in
      const builtIn = [];
      for (const name of BUILTIN_SCENARIOS) {
        const s = await loadBuiltinScenario(name);
        builtIn.push({
          id: name,
          name: s?.name || name,
          description: s?.description || '',
          isCustom: false,
        });
      }

      // Custom from storage
      const stored = await chrome.storage.local.get('customScenarios');
      const custom = [];
      if (stored.customScenarios) {
        for (const [key, val] of Object.entries(stored.customScenarios)) {
          custom.push({
            id: key,
            name: val.name || key,
            description: val.description || '',
            isCustom: true,
          });
        }
      }

      sendResponse({ builtIn, custom });
    })();
    return true;
  }

  // IMPORT_SCENARIO — save a custom scenario
  if (msg.type === 'IMPORT_SCENARIO') {
    (async () => {
      const scenario = msg.scenario;
      if (!scenario || !scenario.id) {
        sendResponse({ ok: false, error: 'Scenario must have an id' });
        return;
      }

      const stored = await chrome.storage.local.get('customScenarios');
      const customs = stored.customScenarios || {};
      customs[scenario.id] = scenario;
      await chrome.storage.local.set({ customScenarios: customs });

      // Also cache it
      scenarioCache[scenario.id] = scenario;

      sendResponse({ ok: true, id: scenario.id });
    })();
    return true;
  }

  // DELETE_SCENARIO — remove a custom scenario
  if (msg.type === 'DELETE_SCENARIO') {
    (async () => {
      const stored = await chrome.storage.local.get('customScenarios');
      const customs = stored.customScenarios || {};
      delete customs[msg.id];
      delete scenarioCache[msg.id];
      await chrome.storage.local.set({ customScenarios: customs });
      sendResponse({ ok: true });
    })();
    return true;
  }

  // EXPORT_SCENARIO — get the full JSON for a scenario
  if (msg.type === 'EXPORT_SCENARIO') {
    (async () => {
      const data = await getActiveScenarioData({ scenario: msg.id });
      sendResponse({ scenario: data });
    })();
    return true;
  }
});


// ─── Badge ───────────────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes) => {
  if (changes.demoState) {
    const state = changes.demoState.newValue;
    if (state?.enabled) {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }
});
