/**
 * Sophos Central Demo Mode — Fetch/XHR Interceptor
 * 
 * Runs in MAIN world (same as page JS). Overrides fetch() and XMLHttpRequest
 * to modify API responses before the React app sees them.
 * 
 * Scenarios are loaded from JSON files. State is communicated via custom DOM
 * events from the bridge script (since MAIN world can't access chrome.storage).
 */

(function() {
  'use strict';

  // ─── State Management ──────────────────────────────────────────────
  const STATE_ELEMENT_ID = '__sophos_demo_state__';
  
  let demoState = {
    enabled: false,
    scenario: 'ransomware',
    customerName: 'Contoso Healthcare',
    endpointCount: 2500,
    serverCount: 186,
  };

  let activeScenario = null;  // Resolved scenario data (after template processing)
  let interceptedCount = 0;

  // Listen for state updates from the isolated world content script
  window.addEventListener('__sophos_demo_state_update__', (e) => {
    demoState = e.detail;

    // If a custom scenario was pushed, load it
    if (e.detail.customScenario) {
      activeScenario = resolveScenario(e.detail.customScenario, demoState);
      console.log('[Sophos Demo]', '📦 Custom scenario loaded:', activeScenario.name || 'unnamed');
    } 
    // Otherwise load a built-in scenario name
    else if (e.detail.scenarioData) {
      activeScenario = resolveScenario(e.detail.scenarioData, demoState);
      console.log('[Sophos Demo]', '📦 Scenario loaded:', activeScenario.name || e.detail.scenario);
    }

    console.log('[Sophos Demo]', demoState.enabled ? '🟢 ENABLED' : '🔴 DISABLED', 
      `scenario=${demoState.scenario}`, `customer=${demoState.customerName}`);
  });

  // Load state from DOM if already set
  function loadStateFromDOM() {
    const el = document.getElementById(STATE_ELEMENT_ID);
    if (el) {
      try {
        const parsed = JSON.parse(el.textContent);
        demoState = parsed;
        if (parsed.scenarioData) {
          activeScenario = resolveScenario(parsed.scenarioData, demoState);
        }
      } catch (e) {}
    }
  }

  loadStateFromDOM();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadStateFromDOM);
  }


  // ─── Template Engine ───────────────────────────────────────────────
  // Resolves {{customerName}}, {{endpointCount}}, {{endpointCount * 0.85}}, 
  // relative timestamps (-3m, -2h, -1d, now), and "auto" UUIDs/IDs.

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function caseId() {
    return '1-' + Math.floor(Math.random() * 9000000 + 1000000);
  }

  function detectionId() {
    const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return hex(64) + '_' + hex(40);
  }

  function resolveTimestamp(val) {
    if (typeof val !== 'string') return val;
    if (val === 'now') return new Date().toISOString();

    const match = val.match(/^-(\d+)(m|h|d)$/);
    if (!match) return val;

    const [, num, unit] = match;
    const ms = { m: 60000, h: 3600000, d: 86400000 }[unit];
    return new Date(Date.now() - parseInt(num) * ms).toISOString();
  }

  function resolveTemplate(val, vars) {
    if (typeof val !== 'string') return val;

    // {{expression}} templates
    return val.replace(/\{\{(.+?)\}\}/g, (_, expr) => {
      expr = expr.trim();

      // Simple variable: {{customerName}}
      if (vars[expr] !== undefined) return vars[expr];

      // Expression: {{endpointCount * 0.85}}
      const mulMatch = expr.match(/^(\w+)\s*\*\s*([\d.]+)$/);
      if (mulMatch && vars[mulMatch[1]] !== undefined) {
        return Math.floor(Number(vars[mulMatch[1]]) * parseFloat(mulMatch[2]));
      }

      return _; // leave unresolved
    });
  }

  // Deep-walk an object, resolving templates, timestamps, and auto-IDs
  function resolveDeep(obj, vars) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      // "auto" fields
      if (obj === 'auto') return uuid();

      // Resolve templates first, then check if result is a timestamp
      let resolved = resolveTemplate(obj, vars);

      // If template resolved to a pure number string, convert
      if (/^\d+$/.test(resolved)) return parseInt(resolved);

      // Timestamps
      resolved = resolveTimestamp(resolved);

      return resolved;
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
    if (Array.isArray(obj)) return obj.map(item => resolveDeep(item, vars));

    const result = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = resolveDeep(val, vars);
    }
    return result;
  }

  function resolveScenario(scenarioJson, state) {
    // Build template variables
    const customerName = state.customerName || scenarioJson.customer?.name || 'Demo Customer';
    const endpointCount = state.endpointCount || scenarioJson.customer?.endpointCount || 2500;
    const serverCount = state.serverCount || scenarioJson.customer?.serverCount || 186;
    const customerDomain = customerName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';

    const vars = {
      customerName,
      endpointCount,
      serverCount,
      customerDomain,
    };

    // Deep resolve the entire scenario
    const resolved = resolveDeep(scenarioJson, vars);

    // Auto-generate IDs for items that need them
    if (resolved.alerts?.items) {
      for (const item of resolved.alerts.items) {
        if (!item.javaUUID) item.javaUUID = uuid();
        if (!item.id) item.id = uuid();
        if (!item.event_service_event_id) item.event_service_event_id = uuid();
        if (!item.customer_id) item.customer_id = uuid();
        if (item.data && !item.data.endpoint_id) item.data.endpoint_id = uuid();
      }
    }

    if (resolved.cases?.items) {
      for (const item of resolved.cases.items) {
        if (!item.id) item.id = caseId();
        if (!item.tenant?.id) item.tenant = { ...item.tenant, id: uuid() };
        if (item.initialDetection && !item.initialDetection.id) {
          item.initialDetection.id = detectionId();
        }
      }
    }

    if (resolved.detections?.items) {
      for (const item of resolved.detections.items) {
        if (!item.id) item.id = detectionId();
        if (item.device && !item.device.id) item.device.id = uuid();
        if (item.detectionAttack && !item.detectionAttack.id) {
          item.detectionAttack.id = uuid();
        }
      }
    }

    return resolved;
  }


  // ─── Endpoint Generators ───────────────────────────────────────────

  function generateEndpoints(count, customerName) {
    const depts = ['FIN', 'HR', 'ENG', 'MKT', 'OPS', 'SEC', 'EXEC', 'IT', 'SALES', 'LEGAL', 'R&D', 'QA'];
    const types = ['DESKTOP', 'LAPTOP', 'WKS'];
    const users = [
      'sarah.chen', 'mike.jones', 'lisa.park', 'david.kim', 'emma.wilson',
      'john.smith', 'maria.garcia', 'james.brown', 'anna.lee', 'robert.taylor',
      'jennifer.martinez', 'thomas.anderson', 'nancy.white', 'kevin.harris', 'laura.clark',
      'daniel.lewis', 'susan.walker', 'matthew.hall', 'karen.allen', 'chris.young',
    ];

    const domain = customerName.toUpperCase().replace(/\s/g, '');
    const endpoints = [];
    for (let i = 0; i < Math.min(count, 50); i++) {
      const dept = depts[i % depts.length];
      const type = types[i % types.length];
      const num = String(i + 1).padStart(3, '0');
      const user = users[i % users.length];
      const minutesAgo = Math.floor(Math.random() * 60);
      const hoursAgo = Math.floor(Math.random() * 24);
      endpoints.push({
        name: `${type}-${dept}${num}`,
        last_user: `${domain}\\${user}`,
        health_status: i < count * 0.95 ? '1' : '2',
        last_activity: new Date(Date.now() - minutesAgo * 60000).toISOString(),
        last_login_activity: new Date(Date.now() - minutesAgo * 2 * 60000).toISOString(),
        id: uuid(),
        encryption_status: 'encrypted',
        group_name: dept,
        on_access: true,
        last_updated: new Date(Date.now() - Math.floor(Math.random() * 30) * 60000).toISOString(),
        is_adsync: true,
        last_login: `${domain}\\${user}`,
        last_scan: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
        last_scan_time: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
        last_user_id: uuid(),
      });
    }
    return endpoints;
  }


  // ─── Response Modification ─────────────────────────────────────────

  function modifyResponse(url, method, data) {
    if (!demoState.enabled || !activeScenario) return data;

    const s = activeScenario;
    const cn = demoState.customerName || s.customer?.name || 'Demo Customer';

    // ── Alerts (/api/alerts/retrieve) ──
    if (url.includes('/api/alerts/retrieve')) {
      if (s.alerts) {
        if (s.alerts.mode === 'override') {
          interceptedCount++;
          return {
            total: s.alerts.items?.length || 0,
            filtered: s.alerts.items?.length || 0,
            summary: s.alerts.summaryDelta || { high: 0, medium: 0, low: 0 },
            items: s.alerts.items || [],
            nextKey: null,
          };
        }
        if (s.alerts.mode === 'prepend' && s.alerts.items?.length && data.items) {
          data.items = [...s.alerts.items, ...data.items];
          data.total = (data.total || 0) + s.alerts.items.length;
          data.filtered = (data.filtered || 0) + s.alerts.items.length;
          if (data.summary && s.alerts.summaryDelta) {
            data.summary.high = (data.summary.high || 0) + (s.alerts.summaryDelta.high || 0);
            data.summary.medium = (data.summary.medium || 0) + (s.alerts.summaryDelta.medium || 0);
            data.summary.low = (data.summary.low || 0) + (s.alerts.summaryDelta.low || 0);
          }
          interceptedCount++;
        }
      }
      return data;
    }

    // ── Alert Summary (/api/alerts/summary) ──
    if (url.includes('/api/alerts/summary')) {
      if (s.alerts) {
        if (s.alerts.mode === 'override') {
          interceptedCount++;
          return s.alerts.summaryDelta || { high: 0, medium: 0, low: 0 };
        }
        if (s.alerts.summaryDelta) {
          data.high = (data.high || 0) + (s.alerts.summaryDelta.high || 0);
          data.medium = (data.medium || 0) + (s.alerts.summaryDelta.medium || 0);
          data.low = (data.low || 0) + (s.alerts.summaryDelta.low || 0);
          interceptedCount++;
        }
      }
      return data;
    }

    // ── Case Detail: Activities (/cases/v1/cases/{id}/activities) ──
    if (url.match(/\/cases\/v1\/cases\/[\w-]+\/activities/)) {
      const caseId = url.match(/\/cases\/v1\/cases\/([\w-]+)\//)?.[1];
      const fakeCase = s.cases?.items?.find(c => c.id === caseId);
      if (fakeCase && s.caseDetail?.activities) {
        interceptedCount++;
        return s.caseDetail.activities;
      }
      // For fake cases, return synthetic activities if no explicit ones provided
      if (fakeCase) {
        interceptedCount++;
        const activities = [
          { userName: fakeCase.createdBy?.name || 'Auto-generated', action: `Created XdrCase - ${fakeCase.name}`, category: 'caseActivity', createdAt: fakeCase.createdAt },
        ];
        if (fakeCase.managedBy === 'mtr') {
          activities.push(
            { userName: 'Sophos MDR Team', action: 'Case escalated to MDR for investigation', category: 'caseActivity', createdAt: fakeCase.createdAt },
            { userName: 'Sophos MDR Team', action: 'MDR analyst assigned — active investigation in progress', category: 'caseActivity', createdAt: fakeCase.updatedAt || fakeCase.createdAt },
          );
        }
        if (s.caseDetail?.extraActivities) {
          activities.push(...s.caseDetail.extraActivities);
        }
        return { items: activities, pages: { current: 1, size: 10, total: 1, items: activities.length } };
      }
      return data;
    }

    // ── Case Detail: MITRE Summary (/cases/v1/cases/{id}/mitre-attack-summary) ──
    if (url.match(/\/cases\/v1\/cases\/[\w-]+\/mitre-attack-summary/)) {
      const caseId = url.match(/\/cases\/v1\/cases\/([\w-]+)\//)?.[1];
      const fakeCase = s.cases?.items?.find(c => c.id === caseId);
      if (fakeCase && s.caseDetail?.mitreSummary) {
        interceptedCount++;
        return s.caseDetail.mitreSummary;
      }
      // Auto-generate from case's initialDetection MITRE data
      if (fakeCase?.initialDetection?.mitreAttacks) {
        interceptedCount++;
        return { tactics: fakeCase.initialDetection.mitreAttacks.map(m => m.tactic) };
      }
      return data;
    }

    // ── Case Detail: Impacted Entities (/cases/v1/cases/{id}/impacted-entities) ──
    if (url.match(/\/cases\/v1\/cases\/[\w-]+\/impacted-entities/)) {
      const caseId = url.match(/\/cases\/v1\/cases\/([\w-]+)\//)?.[1];
      const fakeCase = s.cases?.items?.find(c => c.id === caseId);
      if (fakeCase && s.caseDetail?.impactedEntities) {
        interceptedCount++;
        return s.caseDetail.impactedEntities;
      }
      // Auto-generate from detections
      if (fakeCase && s.detections?.items?.length) {
        const entities = [];
        const seenHosts = new Set();
        for (const det of s.detections.items) {
          const hostname = det.device?.hostname || det.rawData?.meta_hostname;
          if (hostname && !seenHosts.has(hostname)) {
            seenHosts.add(hostname);
            entities.push({
              id: det.device?.id || uuid(),
              name: hostname,
              type: 'device',
              detections: s.detections.items
                .filter(d => (d.device?.hostname || d.rawData?.meta_hostname) === hostname)
                .map(d => ({ id: d.id || uuid(), detectionRule: d.classificationRule })),
            });
          }
          const ip = det.rawData?.meta_ip_address;
          if (ip && !seenHosts.has(ip)) {
            seenHosts.add(ip);
            entities.push({ id: uuid(), name: ip, type: 'ip_address', detections: [] });
          }
        }
        interceptedCount++;
        return { items: entities, pages: { current: 1, size: 50, total: 1, items: entities.length } };
      }
      return data;
    }

    // ── Case Detail: Notebook Sections (/cases/v1/cases/{id}/notebook/sections) ──
    if (url.match(/\/cases\/v1\/cases\/[\w-]+\/notebook/)) {
      const caseId = url.match(/\/cases\/v1\/cases\/([\w-]+)\//)?.[1];
      const fakeCase = s.cases?.items?.find(c => c.id === caseId);
      if (fakeCase && s.caseDetail?.notebook) {
        interceptedCount++;
        return s.caseDetail.notebook;
      }
      if (fakeCase) {
        interceptedCount++;
        return { items: [], pages: { current: 1, size: 10, total: 0, items: 0 } };
      }
      return data;
    }

    // ── Case Detail: Single Case (/cases/v1/cases/{id}) ──
    if (url.match(/\/cases\/v1\/cases\/[\w-]+$/) || url.match(/\/cases\/v1\/cases\/[\w-]+\?/)) {
      const caseId = url.match(/\/cases\/v1\/cases\/([\w-]+)/)?.[1];
      const fakeCase = s.cases?.items?.find(c => c.id === caseId);
      if (fakeCase) {
        interceptedCount++;
        return fakeCase;
      }
      return data;
    }

    // ── Cases List (/cases/v1/cases) ──
    if (url.match(/\/cases\/v1\/cases(\?|$)/) && !url.match(/\/cases\/v1\/cases\/[\w-]/)) {
      if (s.cases) {
        if (s.cases.mode === 'override') {
          interceptedCount++;
          return {
            items: s.cases.items || [],
            pages: { current: 1, size: 20, total: s.cases.items?.length ? 1 : 0, items: s.cases.items?.length || 0 },
          };
        }
        if (s.cases.mode === 'prepend' && s.cases.items?.length && data.items) {
          data.items = [...s.cases.items, ...data.items];
          if (data.pages) {
            data.pages.items = (data.pages.items || 0) + s.cases.items.length;
          }
          interceptedCount++;
        }
      }
      return data;
    }

    // ── Threat Graphs: STAC Cases List (/api/stac/cases) ──
    if (url.match(/\/api\/stac\/cases(\?|$)/) && !url.match(/\/api\/stac\/cases\/[\w-]/)) {
      if (s.threatGraphs?.stacCases) {
        interceptedCount++;
        return s.threatGraphs.stacCases;
      }
      return data;
    }

    // ── Threat Graphs: Single STAC Case (/api/stac/cases/{id}) ──
    if (url.match(/\/api\/stac\/cases\/[\w-]+$/)) {
      if (s.threatGraphs?.stacCaseDetail) {
        interceptedCount++;
        return s.threatGraphs.stacCaseDetail;
      }
      return data;
    }

    // ── Threat Graphs: Root Cause Graph (/api/stac/rootcause/{id}/graph) ──
    if (url.includes('/api/stac/rootcause/') && url.includes('/graph')) {
      if (s.threatGraphs?.graph) {
        interceptedCount++;
        return s.threatGraphs.graph;
      }
      return data;
    }

    // ── Threat Graphs: Artifacts (/api/stac/rootcause/{id}/artifacts) ──
    if (url.includes('/api/stac/rootcause/') && url.includes('/artifacts')) {
      if (s.threatGraphs?.artifacts) {
        interceptedCount++;
        return s.threatGraphs.artifacts;
      }
      return data;
    }

    // ── XDR Actions (/xdr-actions/v1/actions) ──
    if (url.includes('/xdr-actions/v1/actions') && !url.includes('/runs') && !url.includes('/categories')) {
      if (s.caseDetail?.responseActions) {
        interceptedCount++;
        return s.caseDetail.responseActions;
      }
      return data;
    }

    // ── XDR Action Runs (/xdr-actions/v1/actions/runs) ──
    if (url.includes('/xdr-actions/v1/actions/runs')) {
      if (s.caseDetail?.actionRuns) {
        interceptedCount++;
        return s.caseDetail.actionRuns;
      }
      return data;
    }

    // ── Detections (/detections/queries/.../results) ──
    if (url.includes('/detections/queries/') && url.includes('/results')) {
      if (s.detections) {
        if (s.detections.mode === 'override') {
          interceptedCount++;
          return {
            items: s.detections.items || [],
            pages: { current: 1, size: 250, total: s.detections.items?.length ? 1 : 0, items: s.detections.items?.length || 0, maxSize: 2000 },
          };
        }
        if (s.detections.mode === 'prepend' && s.detections.items?.length && data.items) {
          data.items = [...s.detections.items, ...data.items];
          if (data.pages) {
            data.pages.items = (data.pages.items || 0) + s.detections.items.length;
          }
          interceptedCount++;
        }
      }
      return data;
    }

    // ── Detection Timeline ──
    if (url.includes('/detections/timeline')) {
      if (s.detections?.items?.length && data.intervals?.length > 0) {
        const last = data.intervals[data.intervals.length - 1];
        if (last && typeof last.count === 'number') {
          last.count += s.detections.items.length;
        }
        interceptedCount++;
      }
      return data;
    }

    // ── Billing/Account ──
    if (url.includes('/api/billing/account')) {
      if (s.billing) {
        if (s.billing.overrideName) data.name = s.billing.overrideName;
        if (s.billing.overrideAlias) data.alias = s.billing.overrideAlias;
        interceptedCount++;
      }
      return data;
    }

    // ── Current User ──
    if (url.includes('/api/users/current')) {
      if (s.user) {
        if (s.user.overrideCompany) data.company_name = s.user.overrideCompany;
        if (s.user.overrideAlias) data.alias = s.user.overrideAlias;
        interceptedCount++;
      }
      return data;
    }

    // ── Endpoint/Computer List (various API patterns) ──
    // The devices page may use different endpoints depending on the micro-frontend version
    if (url.match(/\/api\/endpoint-data\//) || 
        url.match(/\/api\/endpoints[/?]/) || 
        url.match(/\/api\/computers[/?]/) ||
        url.match(/\/endpoint\/v\d+\/endpoints/) ||
        url.match(/\/endpoints\/v\d+\/endpoints/)) {
      if (s.endpointReport?.overrideTotal && data.items) {
        const cn = demoState.customerName || s.customer?.name || 'Demo Customer';
        data.items = generateEndpoints(Math.min(50, s.endpointReport.overrideTotal), cn);
        data.total = s.endpointReport.overrideTotal;
        if (data.filtered !== undefined) data.filtered = s.endpointReport.overrideTotal;
        if (data.pages) {
          data.pages.items = s.endpointReport.overrideTotal;
          data.pages.total = Math.ceil(s.endpointReport.overrideTotal / (data.pages.size || 50));
        }
        interceptedCount++;
      }
      return data;
    }

    // ── Endpoint Report ──
    if (url.includes('/api/reports/endpoints')) {
      if (s.endpointReport) {
        if (s.endpointReport.overrideTotal) {
          data.total = s.endpointReport.overrideTotal;
          data.filtered = s.endpointReport.overrideTotal;
        }
        if (s.endpointReport.overrideSummary) {
          data.summary = s.endpointReport.overrideSummary;
        }
        if (s.endpointReport.overrideTotal && data.items) {
          data.items = generateEndpoints(Math.min(50, s.endpointReport.overrideTotal), cn);
        }
        interceptedCount++;
      }
      return data;
    }

    // ── Account Health Score ──
    if (url.includes('/account-health-check/v1/scores') && !url.includes('historical') && !url.includes('regional')) {
      if (s.healthScore?.override != null && data.items) {
        for (const item of data.items) {
          if (item.tenant) item.tenant.name = cn;
          if (item.score) {
            item.score.goodHealth = s.healthScore.override;
            item.score.issues = 100 - s.healthScore.override;
          }
        }
        interceptedCount++;
      }
      return data;
    }

    // ── Account Health Historical ──
    if (url.includes('/account-health-check/v1/scores/historical')) {
      if (s.healthScore?.override != null && data.datapoints) {
        for (const dp of data.datapoints) {
          if (dp.endpoint) {
            dp.endpoint.goodHealth = s.healthScore.override;
            dp.endpoint.issues = 100 - s.healthScore.override;
          }
        }
        interceptedCount++;
      }
      return data;
    }

    // ── Account Health Check (v1) ──
    if (url.includes('/api/v1/account-health-check')) {
      if (s.healthScore?.override != null) {
        if (data.endpoint) {
          data.endpoint.goodHealth = s.healthScore.override;
          data.endpoint.issues = 100 - s.healthScore.override;
        }
        interceptedCount++;
      }
      return data;
    }

    // ── Email Stats ──
    if (url.includes('/email/v1/statistics/dashboard/widget')) {
      if (s.emailStats?.override) {
        interceptedCount++;
        return s.emailStats.override;
      }
      return data;
    }

    // ── Attacks (EWS) ──
    if (url.includes('/ews-query/v1/attacks')) {
      if (s.attacks?.override) {
        interceptedCount++;
        return s.attacks.override;
      }
      return data;
    }

    // ── User Devices ──
    if (url.includes('/api/user-devices')) {
      if (s.endpointReport?.overrideTotal) {
        data.total = s.endpointReport.overrideTotal;
        data.filtered = s.endpointReport.overrideTotal;
        interceptedCount++;
      }
      return data;
    }

    // ── Servers ──
    if (url.includes('/api/servers')) {
      const sc = demoState.serverCount || s.customer?.serverCount;
      if (sc) {
        data.total = sc;
        data.filtered = sc;
        interceptedCount++;
      }
      return data;
    }

    // ── Sessions (tenant name in contexts) ──
    if (url.includes('/api/sessions/current') && method === 'GET') {
      interceptedCount++;
      return data;
    }

    // ── Catch-all: log unhandled Sophos API calls for debugging ──
    if (url.includes('sophos.com') && !url.includes('/manage/') && !url.includes('assets/')) {
      const shortUrl = url.replace(/https:\/\/[^/]+/, '').split('?')[0].slice(0, 80);
      console.log(`[Sophos Demo] 🔍 Unhandled: ${method} ${shortUrl} (${JSON.stringify(data).length} bytes)`);
    }

    return data;
  }


  // ─── Global Text Replacement ───────────────────────────────────────

  function globalReplace(text) {
    if (!demoState.enabled || !demoState.customerName) return text;
    
    const cn = demoState.customerName;
    text = text.replace(/Sophos Ltd/g, cn);
    text = text.replace(/"name":\s*"Sophos"/g, `"name":"${cn}"`);
    text = text.replace(/"alias":\s*"Sophos Ltd"/g, `"alias":"${cn}"`);
    text = text.replace(/"company_name":\s*"Sophos"/g, `"company_name":"${cn}"`);
    
    return text;
  }


  // ─── Fetch Override ────────────────────────────────────────────────

  const originalFetch = window.fetch;

  window.fetch = async function(...args) {
    const request = args[0];
    const url = typeof request === 'string' ? request : request?.url || '';
    const method = (typeof request === 'string' ? args[1]?.method : request?.method) || 'GET';

    if (!url.includes('sophos.com') && !url.includes('sophosapis.com')) {
      return originalFetch.apply(this, args);
    }

    if (!demoState.enabled) {
      return originalFetch.apply(this, args);
    }

    // Block dangerous write actions (fake success)
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
      const isReadPost = url.includes('alerts/retrieve') || 
                          url.includes('alerts/summary') ||
                          url.includes('users/query') ||
                          url.includes('/queries/detections') ||
                          url.includes('/detections/queries/') ||
                          url.includes('sessions/current');
      
      if (!isReadPost) {
        console.log(`[Sophos Demo] 🛡️ Blocked ${method} ${url.split('?')[0].slice(-60)}`);
        return new Response(JSON.stringify({ success: true, id: uuid() }), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    try {
      const response = await originalFetch.apply(this, args);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        return response;
      }

      const cloned = response.clone();
      let text = await cloned.text();

      text = globalReplace(text);

      let data;
      try { data = JSON.parse(text); } catch { return response; }

      const modified = modifyResponse(url, method.toUpperCase(), data);

      const modifiedText = JSON.stringify(modified);
      return new Response(modifiedText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (err) {
      return originalFetch.apply(this, args);
    }
  };


  // ─── XMLHttpRequest Override ───────────────────────────────────────

  const OriginalXHR = window.XMLHttpRequest;
  
  class InterceptedXHR extends OriginalXHR {
    open(method, url, ...rest) {
      this._demoUrl = url;
      this._demoMethod = method;
      return super.open(method, url, ...rest);
    }

    get response() {
      const original = super.response;
      if (!demoState.enabled || !this._demoUrl) return original;
      if (!this._demoUrl.includes('sophos.com') && !this._demoUrl.includes('sophosapis.com')) return original;

      try {
        const text = typeof original === 'string' ? original : JSON.stringify(original);
        const replaced = globalReplace(text);
        let data;
        try { data = JSON.parse(replaced); } catch { return original; }
        const modified = modifyResponse(this._demoUrl, this._demoMethod, data);
        return JSON.stringify(modified);
      } catch {
        return original;
      }
    }

    get responseText() {
      const original = super.responseText;
      if (!demoState.enabled || !this._demoUrl) return original;
      if (!this._demoUrl.includes('sophos.com') && !this._demoUrl.includes('sophosapis.com')) return original;

      try {
        const replaced = globalReplace(original);
        let data;
        try { data = JSON.parse(replaced); } catch { return original; }
        const modified = modifyResponse(this._demoUrl, this._demoMethod, data);
        return JSON.stringify(modified);
      } catch {
        return original;
      }
    }
  }

  window.XMLHttpRequest = InterceptedXHR;


  // ─── Intercepted Count Reporter ────────────────────────────────────
  setInterval(() => {
    window.postMessage({ type: '__sophos_demo_intercepted_count__', count: interceptedCount }, '*');
  }, 2000);


  console.log('[Sophos Demo] 🎯 Interceptor loaded (JSON scenario engine). Waiting for activation...');

})();
