/**
 * Popup script — scenario picker, import/export, toggle
 */

// ─── Element References ──────────────────────────────────────────────
const toggle = document.getElementById('toggle');
const scenarioSelect = document.getElementById('scenario');
const customerName = document.getElementById('customerName');
const endpointCount = document.getElementById('endpointCount');
const serverCount = document.getElementById('serverCount');
const showBadge = document.getElementById('showBadge');
const scenarioDesc = document.getElementById('scenarioDesc');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const interceptedText = document.getElementById('interceptedText');
const reloadBtn = document.getElementById('reloadBtn');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const fileBtn = document.getElementById('fileBtn');
const deleteBtn = document.getElementById('deleteBtn');
const importArea = document.getElementById('importArea');
const importJson = document.getElementById('importJson');
const cancelImport = document.getElementById('cancelImport');
const confirmImport = document.getElementById('confirmImport');
const toast = document.getElementById('toast');
const fileInput = document.getElementById('fileInput');


// ─── Scenario Metadata ──────────────────────────────────────────────
// Built-in scenario display config (icons, colors)
const scenarioMeta = {
  ransomware: { icon: '🔴', color: 'ransomware' },
  healthy:    { icon: '🟢', color: 'healthy' },
  phishing:   { icon: '🟠', color: 'phishing' },
  xdr:        { icon: '🔵', color: 'xdr' },
};

let allScenarios = [];  // { id, name, description, isCustom }


// ─── Toast ───────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}


// ─── Populate Scenario Dropdown ──────────────────────────────────────
async function loadScenarios() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'LIST_SCENARIOS' }, (resp) => {
      allScenarios = [...(resp?.builtIn || []), ...(resp?.custom || [])];
      
      scenarioSelect.innerHTML = '';

      // Built-in group
      if (resp?.builtIn?.length) {
        const group = document.createElement('optgroup');
        group.label = 'Built-in Scenarios';
        for (const s of resp.builtIn) {
          const opt = document.createElement('option');
          opt.value = s.id;
          const meta = scenarioMeta[s.id] || { icon: '⚡' };
          opt.textContent = `${meta.icon} ${s.name}`;
          group.appendChild(opt);
        }
        scenarioSelect.appendChild(group);
      }

      // Custom group
      if (resp?.custom?.length) {
        const group = document.createElement('optgroup');
        group.label = 'Custom Scenarios';
        for (const s of resp.custom) {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `⚡ ${s.name}`;
          group.appendChild(opt);
        }
        scenarioSelect.appendChild(group);
      }

      resolve();
    });
  });
}


// ─── UI Updates ──────────────────────────────────────────────────────
function updateUI(state) {
  // Status indicator
  if (state?.enabled) {
    statusDot.className = 'status-dot active';
    statusText.textContent = 'Active';
  } else {
    statusDot.className = 'status-dot inactive';
    statusText.textContent = 'Inactive';
  }

  // Intercepted count
  if (state?.interceptedCount) {
    interceptedText.textContent = `${state.interceptedCount} intercepted`;
  } else {
    interceptedText.textContent = '';
  }

  // Scenario description
  updateScenarioDesc();

  // Show/hide delete button for custom scenarios
  const selected = allScenarios.find(s => s.id === scenarioSelect.value);
  deleteBtn.style.display = selected?.isCustom ? 'flex' : 'none';
}

function updateScenarioDesc() {
  const selected = allScenarios.find(s => s.id === scenarioSelect.value);
  if (selected) {
    scenarioDesc.textContent = selected.description;
    const meta = scenarioMeta[selected.id];
    scenarioDesc.className = 'scenario-desc ' + (meta?.color || 'custom');
  } else {
    scenarioDesc.textContent = '';
    scenarioDesc.className = 'scenario-desc';
  }
}


// ─── State Management ────────────────────────────────────────────────
function saveState() {
  const state = {
    enabled: toggle.checked,
    scenario: scenarioSelect.value,
    customerName: customerName.value,
    endpointCount: parseInt(endpointCount.value) || 2500,
    serverCount: parseInt(serverCount.value) || 186,
    showBadge: showBadge.checked,
    interceptedCount: 0,
  };
  chrome.runtime.sendMessage({ type: 'SET_STATE', state }, () => {
    updateUI(state);
  });
}


// ─── Initialize ──────────────────────────────────────────────────────
async function init() {
  await loadScenarios();

  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (!state) return;
    toggle.checked = state.enabled;
    scenarioSelect.value = state.scenario || 'ransomware';
    customerName.value = state.customerName || 'Contoso Healthcare';
    endpointCount.value = state.endpointCount || 2500;
    serverCount.value = state.serverCount || 186;
    showBadge.checked = state.showBadge !== false; // default true
    updateUI(state);
  });
}

init();


// ─── Event Listeners ─────────────────────────────────────────────────

toggle.addEventListener('change', saveState);
showBadge.addEventListener('change', saveState);

scenarioSelect.addEventListener('change', () => {
  // When switching scenarios, load customer defaults from scenario JSON
  const selected = allScenarios.find(s => s.id === scenarioSelect.value);
  if (selected?.isCustom) {
    chrome.runtime.sendMessage({ type: 'EXPORT_SCENARIO', id: scenarioSelect.value }, (resp) => {
      if (resp?.scenario?.customer) {
        const c = resp.scenario.customer;
        if (c.name) customerName.value = c.name;
        if (c.endpointCount) endpointCount.value = c.endpointCount;
        if (c.serverCount) serverCount.value = c.serverCount;
      }
      saveState();
    });
  } else {
    saveState();
  }
  updateScenarioDesc();
});

customerName.addEventListener('input', debounce(saveState, 500));
endpointCount.addEventListener('input', debounce(saveState, 500));
serverCount.addEventListener('input', debounce(saveState, 500));

// Reload Sophos Central tabs
reloadBtn.addEventListener('click', () => {
  saveState();
  setTimeout(() => {
    chrome.tabs.query({ url: 'https://central.sophos.com/*' }, (tabs) => {
      if (tabs.length === 0) {
        chrome.tabs.create({ url: 'https://central.sophos.com/manage/dashboard' });
      } else {
        for (const tab of tabs) {
          chrome.tabs.reload(tab.id);
        }
      }
    });
  }, 200);
});


// ─── Import ──────────────────────────────────────────────────────────

importBtn.addEventListener('click', () => {
  importArea.classList.toggle('visible');
  importJson.value = '';
  importJson.focus();
});

cancelImport.addEventListener('click', () => {
  importArea.classList.remove('visible');
  importJson.value = '';
});

confirmImport.addEventListener('click', () => {
  let scenario;
  try {
    scenario = JSON.parse(importJson.value);
  } catch (e) {
    showToast('Invalid JSON: ' + e.message, 'error');
    return;
  }

  if (!scenario.id) {
    scenario.id = 'custom-' + Date.now();
  }
  if (!scenario.name) {
    scenario.name = 'Custom Scenario';
  }

  chrome.runtime.sendMessage({ type: 'IMPORT_SCENARIO', scenario }, async (resp) => {
    if (resp?.ok) {
      showToast(`Imported: ${scenario.name}`);
      importArea.classList.remove('visible');
      importJson.value = '';

      // Reload dropdown and select the new scenario
      await loadScenarios();
      scenarioSelect.value = scenario.id;
      
      // Load customer defaults
      if (scenario.customer) {
        if (scenario.customer.name) customerName.value = scenario.customer.name;
        if (scenario.customer.endpointCount) endpointCount.value = scenario.customer.endpointCount;
        if (scenario.customer.serverCount) serverCount.value = scenario.customer.serverCount;
      }
      
      saveState();
    } else {
      showToast(resp?.error || 'Import failed', 'error');
    }
  });
});

// File import
fileBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    let scenario;
    try {
      scenario = JSON.parse(ev.target.result);
    } catch (err) {
      showToast('Invalid JSON file: ' + err.message, 'error');
      return;
    }

    if (!scenario.id) {
      scenario.id = 'custom-' + file.name.replace('.json', '').replace(/[^a-z0-9-]/gi, '-');
    }
    if (!scenario.name) {
      scenario.name = file.name.replace('.json', '');
    }

    chrome.runtime.sendMessage({ type: 'IMPORT_SCENARIO', scenario }, async (resp) => {
      if (resp?.ok) {
        showToast(`Imported: ${scenario.name}`);
        await loadScenarios();
        scenarioSelect.value = scenario.id;
        
        if (scenario.customer) {
          if (scenario.customer.name) customerName.value = scenario.customer.name;
          if (scenario.customer.endpointCount) endpointCount.value = scenario.customer.endpointCount;
          if (scenario.customer.serverCount) serverCount.value = scenario.customer.serverCount;
        }
        
        saveState();
      } else {
        showToast(resp?.error || 'Import failed', 'error');
      }
    });
  };
  reader.readAsText(file);
  fileInput.value = '';  // reset so same file can be re-imported
});


// ─── Export ──────────────────────────────────────────────────────────

exportBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXPORT_SCENARIO', id: scenarioSelect.value }, (resp) => {
    if (!resp?.scenario) {
      showToast('No scenario data to export', 'error');
      return;
    }

    const json = JSON.stringify(resp.scenario, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenarioSelect.value}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported: ' + (resp.scenario.name || scenarioSelect.value));
  });
});


// ─── Delete Custom Scenario ──────────────────────────────────────────

deleteBtn.addEventListener('click', () => {
  const id = scenarioSelect.value;
  const selected = allScenarios.find(s => s.id === id);
  if (!selected?.isCustom) return;

  if (!confirm(`Delete "${selected.name}"?`)) return;

  chrome.runtime.sendMessage({ type: 'DELETE_SCENARIO', id }, async (resp) => {
    if (resp?.ok) {
      showToast(`Deleted: ${selected.name}`);
      await loadScenarios();
      scenarioSelect.value = 'ransomware';
      saveState();
    }
  });
});


// ─── Utilities ───────────────────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Refresh intercepted count
setInterval(() => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (state?.interceptedCount) {
      interceptedText.textContent = `${state.interceptedCount} intercepted`;
    }
  });
}, 3000);
