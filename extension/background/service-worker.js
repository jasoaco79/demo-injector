/**
 * Background service worker — manages demo state, scenario loading, and messaging.
 * 
 * Scenarios are loaded from:
 * 1. Built-in JSON files in extension/scenarios/
 * 2. Custom JSON imported by the user
 * 3. Chrome storage (persisted custom scenarios)
 */

// ─── Built-in Scenario Registry ──────────────────────────────────────
const BUILTIN_SCENARIOS = ['ransomware', 'mdr', 'phishing', 'xdr', 'insider', 'supply-chain', 'bec', 'zero-day', 'healthy'];

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
  launchMode: 'direct',
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

      // Push to all Sophos Central tabs (ignore errors from stale contexts)
      try {
        const tabs = await chrome.tabs.query({ url: 'https://central.sophos.com/*' });
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'STATE_UPDATED', state: stateWithScenario });
          } catch {}
        }
      } catch {}
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

  // SAVE_DEMO_HISTORY (#5) — record a completed demo session
  if (msg.type === 'SAVE_DEMO_HISTORY') {
    (async () => {
      const stored = await chrome.storage.local.get('demoHistory');
      const history = stored.demoHistory || [];
      history.unshift({
        ...msg.entry,
        timestamp: new Date().toISOString(),
      });
      // Keep last 50 entries
      if (history.length > 50) history.length = 50;
      await chrome.storage.local.set({ demoHistory: history });
      sendResponse({ ok: true });
    })();
    return true;
  }

  // GET_DEMO_HISTORY — retrieve past demo sessions
  if (msg.type === 'GET_DEMO_HISTORY') {
    (async () => {
      const stored = await chrome.storage.local.get('demoHistory');
      sendResponse({ history: stored.demoHistory || [] });
    })();
    return true;
  }

  // IMPORT_VIA_URL (#4) — import scenario from a data URL or base64
  if (msg.type === 'IMPORT_VIA_URL') {
    (async () => {
      try {
        let scenario;
        if (msg.data.startsWith('{')) {
          scenario = JSON.parse(msg.data);
        } else {
          // base64 encoded
          scenario = JSON.parse(atob(msg.data));
        }
        if (!scenario.id) scenario.id = 'import-' + Date.now();

        const stored = await chrome.storage.local.get('customScenarios');
        const customs = stored.customScenarios || {};
        customs[scenario.id] = scenario;
        await chrome.storage.local.set({ customScenarios: customs });
        scenarioCache[scenario.id] = scenario;

        sendResponse({ ok: true, id: scenario.id, name: scenario.name });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});


// ─── Chrome Sync (#9) ────────────────────────────────────────────────
// Sync custom scenarios across devices using chrome.storage.sync
// Note: sync storage has a 100KB total limit, so we only sync metadata
// and the most recent 5 custom scenarios (if they fit under 8KB each)

async function syncToCloud() {
  try {
    const stored = await chrome.storage.local.get(['customScenarios', 'demoState']);
    const customs = stored.customScenarios || {};

    // Sync preferences
    await chrome.storage.sync.set({
      syncedPrefs: {
        customerName: stored.demoState?.customerName,
        endpointCount: stored.demoState?.endpointCount,
        serverCount: stored.demoState?.serverCount,
        lastScenario: stored.demoState?.scenario,
        launchMode: stored.demoState?.launchMode,
      }
    });

    // Sync up to 5 most recent custom scenarios (trimmed to fit sync limits)
    const entries = Object.entries(customs).slice(0, 5);
    const trimmed = {};
    for (const [key, val] of entries) {
      trimmed[key] = {
        id: val.id,
        name: val.name,
        description: val.description,
        customer: val.customer,
        _full: JSON.stringify(val).length < 8000 ? val : null,
      };
    }
    await chrome.storage.sync.set({ syncedScenarios: trimmed });
    console.log('[Sophos Demo] ☁️ Synced to cloud:', entries.length, 'scenarios');
  } catch (err) {
    console.warn('[Sophos Demo] Sync failed:', err.message);
  }
}

async function syncFromCloud() {
  try {
    const synced = await chrome.storage.sync.get(['syncedPrefs', 'syncedScenarios']);
    if (!synced.syncedPrefs && !synced.syncedScenarios) return;

    const local = await chrome.storage.local.get('demoState');
    if (!local.demoState && synced.syncedPrefs) {
      await chrome.storage.local.set({
        demoState: { ...DEFAULT_STATE, ...synced.syncedPrefs, enabled: false }
      });
      console.log('[Sophos Demo] ☁️ Restored preferences from cloud');
    }

    if (synced.syncedScenarios) {
      const stored = await chrome.storage.local.get('customScenarios');
      const customs = stored.customScenarios || {};
      let added = 0;
      for (const [key, val] of Object.entries(synced.syncedScenarios)) {
        if (!customs[key] && val._full) {
          customs[key] = val._full;
          scenarioCache[key] = val._full;
          added++;
        }
      }
      if (added > 0) {
        await chrome.storage.local.set({ customScenarios: customs });
        console.log('[Sophos Demo] ☁️ Restored', added, 'scenarios from cloud');
      }
    }
  } catch (err) {
    console.warn('[Sophos Demo] Cloud restore failed:', err.message);
  }
}

// Sync on startup
syncFromCloud();

// Sync to cloud when state changes (debounced 5s)
let syncTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.demoState || changes.customScenarios)) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncToCloud, 5000);
  }
});


// ─── Badge ───────────────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
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
