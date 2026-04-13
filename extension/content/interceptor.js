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
    launchMode: 'direct',
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
        if (!item.severity) item.severity = item.initialDetection?.severity >= 7 ? 'high' : item.initialDetection?.severity >= 4 ? 'medium' : 'low';
        if (!item.caseType) item.caseType = 'SYSTEM_GENERATED';
        if (!item.source) item.source = item.managedBy === 'mtr' ? 'MDR' : 'XDR';
        if (item.initialDetection && !item.initialDetection.id) {
          item.initialDetection.id = detectionId();
        }
        if (item.initialDetection && !item.initialDetection.sensor) {
          item.initialDetection.sensor = { type: 'endpoint', source: 'Sophos Endpoint' };
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


  // ─── Threat Graph Generator ─────────────────────────────────────────

  function generateThreatGraph(scenario, customerName) {
    const dets = scenario.detections?.items || [];
    const nodes = [];
    const edges = [];
    let nodeId = 1;

    // Build process tree from detections
    for (const det of dets) {
      const hostname = det.device?.hostname || det.rawData?.meta_hostname || 'UNKNOWN';
      const process = det.rawData?.path?.split('\\').pop() || det.rawData?.cmdline?.split(' ')[0]?.split('\\').pop() || 'unknown.exe';
      const parent = det.rawData?.parent_name || 'explorer.exe';
      const ip = det.rawData?.meta_ip_address || '192.168.1.1';
      const user = det.rawData?.meta_username || 'SYSTEM';
      const cmdline = det.rawData?.cmdline || process;

      // Parent process node
      const parentId = 'n' + nodeId++;
      nodes.push({
        id: parentId,
        type: 'process',
        name: parent,
        hostname,
        properties: { name: parent, path: 'C:\\Windows\\System32\\' + parent, user, hostname, ip },
        decoration: { type: 'clean', label: 'Clean' },
      });

      // Child process node (the suspicious one)
      const childId = 'n' + nodeId++;
      const isMalicious = (det.risk || det.severity || 0) >= 7;
      nodes.push({
        id: childId,
        type: 'process',
        name: process,
        hostname,
        properties: {
          name: process,
          path: det.rawData?.path || process,
          cmdline,
          user,
          hostname,
          ip,
          sha256: det.rawData?.sha256 || uuid(),
          pid: det.rawData?.pid || Math.floor(Math.random() * 20000),
        },
        decoration: {
          type: isMalicious ? 'malicious' : 'suspicious',
          label: isMalicious ? 'Malicious' : 'Suspicious',
          reputation: det.intelixFileReputation?.label || (isMalicious ? 'Known Malicious' : 'Suspicious'),
          reputationScore: det.intelixFileReputation?.score || (isMalicious ? 100 : 60),
        },
        mitreAttacks: det.mitreAttacks || [],
        detectionRule: det.classificationRule || '',
      });

      // Edge: parent spawned child
      edges.push({ source: parentId, target: childId, type: 'spawned' });

      // Add network connection if there's a C2 or external IP in the cmdline
      const c2Match = cmdline.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (c2Match && !c2Match[1].startsWith('192.168.') && !c2Match[1].startsWith('10.')) {
        const netId = 'n' + nodeId++;
        nodes.push({
          id: netId,
          type: 'network',
          name: c2Match[1],
          properties: { ip: c2Match[1], port: 443, direction: 'outbound' },
          decoration: { type: 'malicious', label: 'C2 Server' },
        });
        edges.push({ source: childId, target: netId, type: 'connected_to' });
      }

      // Add file node if there's a written/dropped file
      if (det.rawData?.path && det.rawData.path.includes('\\Users\\')) {
        const fileId = 'n' + nodeId++;
        nodes.push({
          id: fileId,
          type: 'file',
          name: det.rawData.path.split('\\').pop(),
          properties: { path: det.rawData.path, sha256: det.rawData?.sha256 || uuid() },
          decoration: { type: isMalicious ? 'malicious' : 'suspicious', label: isMalicious ? 'Malicious File' : 'Suspicious File' },
        });
        edges.push({ source: childId, target: fileId, type: 'created' });
      }
    }

    return {
      nodes,
      edges,
      rootCause: nodes.find(n => n.decoration?.type === 'malicious')?.id || nodes[1]?.id || 'n2',
      summary: {
        totalProcesses: nodes.filter(n => n.type === 'process').length,
        maliciousProcesses: nodes.filter(n => n.decoration?.type === 'malicious').length,
        suspiciousProcesses: nodes.filter(n => n.decoration?.type === 'suspicious').length,
        networkConnections: nodes.filter(n => n.type === 'network').length,
        files: nodes.filter(n => n.type === 'file').length,
      },
    };
  }

  function generateThreatArtifacts(scenario) {
    const dets = scenario.detections?.items || [];
    const artifacts = [];

    for (const det of dets) {
      // Process artifact
      artifacts.push({
        type: 'process',
        name: det.rawData?.path?.split('\\').pop() || 'unknown.exe',
        path: det.rawData?.path || '',
        sha256: det.rawData?.sha256 || uuid(),
        cmdline: det.rawData?.cmdline || '',
        hostname: det.device?.hostname || det.rawData?.meta_hostname || '',
        reputation: det.intelixFileReputation?.label || 'Unknown',
        reputationScore: det.intelixFileReputation?.score || 0,
      });

      // File artifact if path is in user directory
      if (det.rawData?.path?.includes('\\Users\\') || det.rawData?.path?.includes('\\Temp\\')) {
        artifacts.push({
          type: 'file',
          name: det.rawData.path.split('\\').pop(),
          path: det.rawData.path,
          sha256: det.rawData?.sha256 || uuid(),
          size: Math.floor(Math.random() * 500000) + 10000,
          hostname: det.device?.hostname || '',
        });
      }
    }

    return { items: artifacts, total: artifacts.length };
  }


  // ─── Device Detail Generator ──────────────────────────────────────

  function generateDeviceDetail(hostname, scenario) {
    const cn = demoState.customerName || scenario.customer?.name || 'Demo Customer';
    const domain = cn.toUpperCase().replace(/\s/g, '');
    const det = scenario.detections?.items?.find(d => 
      (d.device?.hostname || d.rawData?.meta_hostname) === hostname
    );

    return {
      id: det?.device?.id || uuid(),
      hostname,
      type: 'computer',
      health: { overall: det ? 'suspicious' : 'good', threats: { status: det ? 'bad' : 'good' }, services: { status: 'good' } },
      os: {
        name: det?.rawData?.meta_os_name || 'Microsoft Windows 11 Enterprise',
        platform: det?.rawData?.meta_os_platform || 'windows',
        isServer: hostname.startsWith('SRV-'),
        majorVersion: 10,
        build: 26200,
      },
      ipv4Addresses: [det?.rawData?.meta_ip_address || '192.168.1.' + Math.floor(Math.random() * 254)],
      macAddresses: [det?.rawData?.meta_mac_address || 'AA:BB:CC:DD:EE:' + Math.floor(Math.random() * 99).toString().padStart(2, '0')],
      associatedPerson: { viaLogin: domain + '\\' + (det?.rawData?.meta_username || 'user') },
      tamperProtection: { enabled: true, password: '********' },
      group: { name: hostname.split('-')[1]?.slice(0, 3) || 'Default' },
      lastSeenAt: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString(),
      lastActivity: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString(),
      encryption: { status: 'encrypted', volumes: [{ name: 'C:', status: 'encrypted' }] },
      lockdown: { status: 'not_installed' },
      cloud: { provider: null },
      assignedProducts: [
        { code: 'endpointProtection', version: '2026.1.3.2', status: 'installed' },
        { code: 'intercept_x', version: '2026.1.3.2', status: 'installed' },
        { code: 'xdr_sensor', version: '4.2.1', status: 'installed' },
      ],
    };
  }


  // ─── Response Modification ─────────────────────────────────────────

  function modifyResponse(url, method, data) {
    if (!demoState.enabled || !activeScenario) return data;
    try {
      return _modifyResponse(url, method, data);
    } catch (err) {
      console.error('[Sophos Demo] ❌ Interceptor error for', url, err);
      return data; // Fall back to real response on error
    }
  }

  // URLs we actually have interceptors for — skip everything else
  function shouldInterceptUrl(url) {
    return url.includes('/alerts') ||
      url.includes('/cases/') ||
      url.includes('/detections') ||
      url.includes('/stac/') ||
      url.includes('/xdr-actions/') ||
      url.includes('/billing/account') ||
      url.includes('/users/current') ||
      url.includes('/endpoint') ||
      url.includes('/account-health') ||
      url.includes('/email') ||
      url.includes('/ews-query') ||
      url.includes('/reports/') ||
      url.includes('/sessions/current') ||
      url.includes('/audit') ||
      url.includes('/live-discover') ||
      url.includes('/xdr-query') ||
      url.includes('/osquery') ||
      url.includes('/servers') ||
      url.includes('/user-devices') ||
      url.includes('/mobile-admin') ||
      url.includes('/web-statistics');
  }

  function _modifyResponse(url, method, data) {
    if (data == null) return data;
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
      const matchedCaseId = url.match(/\/cases\/v1\/cases\/([\w-]+)\//)?.[1];
      const fakeCase = s.cases?.items?.find(c => c.id === matchedCaseId);
      console.log('[Sophos Demo] Impacted entities request:', { matchedCaseId, found: !!fakeCase, caseIds: s.cases?.items?.map(c => c.id) });
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

    // ── Case Detail: Catch-all for any sub-endpoint on a fake case ──
    // Prevents React crashes from 404s when the real API doesn't know our fake case ID
    if (url.match(/\/cases\/v1\/cases\/[\w-]+\/.+/)) {
      const matchedCaseId = url.match(/\/cases\/v1\/cases\/([\w-]+)\//)?.[1];
      const fakeCase = s.cases?.items?.find(c => c.id === matchedCaseId);
      if (fakeCase) {
        console.log('[Sophos Demo] Catch-all case sub-endpoint:', url);
        interceptedCount++;
        return { items: [], pages: { current: 1, size: 10, total: 0, items: 0 } };
      }
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
      // Auto-generate a threat graph from detections
      if (s.detections?.items?.length) {
        interceptedCount++;
        return generateThreatGraph(s, cn);
      }
      return data;
    }

    // ── Threat Graphs: Artifacts (/api/stac/rootcause/{id}/artifacts) ──
    if (url.includes('/api/stac/rootcause/') && url.includes('/artifacts')) {
      if (s.threatGraphs?.artifacts) {
        interceptedCount++;
        return s.threatGraphs.artifacts;
      }
      // Auto-generate artifacts from detections
      if (s.detections?.items?.length) {
        interceptedCount++;
        return generateThreatArtifacts(s);
      }
      return data;
    }

    // ── Threat Graphs: STAC Case Detail (/api/stac/rootcause/{id}) ──
    if (url.match(/\/api\/stac\/rootcause\/[\w-]+$/) && !url.includes('/graph') && !url.includes('/artifacts')) {
      if (s.threatGraphs?.stacCaseDetail) {
        interceptedCount++;
        return s.threatGraphs.stacCaseDetail;
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

    // ── Device Detail (various patterns: /endpoints/{id}, /computers/{id}) ──
    if (url.match(/\/endpoint[s]?\/[\w-]{20,}$/) || 
        url.match(/\/computer[s]?\/[\w-]{20,}$/) ||
        url.match(/\/devices\/[\w-]{20,}$/)) {
      // If this is a device that matches one of our detection hostnames, return enriched detail
      if (s.detections?.items?.length && data.hostname) {
        const det = s.detections.items.find(d => 
          (d.device?.hostname || d.rawData?.meta_hostname) === data.hostname
        );
        if (det) {
          // Merge our fake data with the real response
          Object.assign(data, generateDeviceDetail(data.hostname, s));
          interceptedCount++;
        }
      }
      return data;
    }

    // ── Any response with device/endpoint list items — catch wide ──
    // If a response has .items[] with .hostname or .name fields and looks like a device list,
    // and we have endpoint overrides, inject our fake devices
    if (s.endpointReport?.overrideTotal && data.items && Array.isArray(data.items) && data.items.length > 0) {
      const firstItem = data.items[0];
      const looksLikeDeviceList = firstItem.hostname || 
        (firstItem.name && firstItem.health_status) || 
        (firstItem.name && firstItem.last_activity && firstItem.last_user);
      
      if (looksLikeDeviceList) {
        data.items = generateEndpoints(Math.min(50, s.endpointReport.overrideTotal), cn);
        data.total = s.endpointReport.overrideTotal;
        if (data.filtered !== undefined) data.filtered = s.endpointReport.overrideTotal;
        if (data.pages) {
          data.pages.items = s.endpointReport.overrideTotal;
          data.pages.total = Math.ceil(s.endpointReport.overrideTotal / (data.pages.size || 50));
        }
        interceptedCount++;
        return data;
      }
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

    // ── Mobile/Device Summary (dashboard donut chart) ──
    if (url.includes('/cloud-ui-rs/mobile-admin/reports/summary')) {
      if (s.endpointReport?.overrideTotal) {
        const total = s.endpointReport.overrideTotal;
        data.totalDevices = total;
        data.totalDevicesPerPlatform = {
          android: Math.floor(total * 0.05),
          macos: Math.floor(total * 0.15),
          chrome: 0,
          windowsphone: 0,
          windowsdesktop: Math.floor(total * 0.75),
          ios: Math.floor(total * 0.05),
          unknown: 0,
        };
        data.managedDevicesPerPlatform = { ...data.totalDevicesPerPlatform };
        data.totalDevicesPerHealthStatus = {
          green_by_admin: 0,
          green_by_compliance: Math.floor(total * 0.92),
          yellow_by_admin: 0,
          yellow_by_compliance: Math.floor(total * 0.05),
          red_by_admin: 0,
          red_by_compliance: Math.floor(total * 0.02),
          unknown: Math.floor(total * 0.01),
        };
        // Adjust for attack scenarios
        if (s.healthScore?.override && s.healthScore.override < 85) {
          data.totalDevicesPerHealthStatus.red_by_compliance = Math.floor(total * 0.05);
          data.totalDevicesPerHealthStatus.yellow_by_compliance = Math.floor(total * 0.08);
          data.totalDevicesPerHealthStatus.green_by_compliance = Math.floor(total * 0.86);
        }
        interceptedCount++;
      }
      return data;
    }

    // ── Web Statistics (dashboard web control widget) ──
    if (url.includes('/api/reports/web-statistics')) {
      if (s.endpointReport?.overrideTotal) {
        const total = s.endpointReport.overrideTotal;
        data.summary = {
          proceeded: { total: Math.floor(total * 12.5) },
          warned: { total: Math.floor(total * 0.3) },
          virus: { total: s.alerts?.summaryDelta?.high || 0 },
          policy: { total: Math.floor(total * 0.8) },
        };
        interceptedCount++;
      }
      return data;
    }

    // ── Sessions (tenant name in contexts) ──
    if (url.includes('/api/sessions/current') && method === 'GET') {
      interceptedCount++;
      return data;
    }

    // ── Audit Logs (/api/audit/logs or /api/logs/audit) ──
    if (url.includes('/audit') && (url.includes('/logs') || url.includes('/events'))) {
      if (s.auditLogs) {
        if (s.auditLogs.mode === 'override') {
          interceptedCount++;
          return {
            items: s.auditLogs.items || [],
            total: s.auditLogs.items?.length || 0,
            filtered: s.auditLogs.items?.length || 0,
            nextKey: null,
            pages: s.auditLogs.items ? { current: 1, size: 50, total: 1, items: s.auditLogs.items.length } : undefined,
          };
        }
        if (s.auditLogs.mode === 'prepend' && s.auditLogs.items?.length && data.items) {
          data.items = [...s.auditLogs.items, ...data.items];
          data.total = (data.total || 0) + s.auditLogs.items.length;
          if (data.filtered !== undefined) data.filtered = (data.filtered || 0) + s.auditLogs.items.length;
          interceptedCount++;
        }
      }
      return data;
    }

    // ── Live Discover Queries (/xdr-query, /live-discover, /osquery) ──
    if (url.includes('/live-discover/') || url.includes('/xdr-query/') || url.includes('/osquery/')) {
      // Query results
      if (url.includes('/results') || url.includes('/data')) {
        if (s.liveDiscover?.queryResults) {
          interceptedCount++;
          return s.liveDiscover.queryResults;
        }
      }
      // Saved queries / query catalog
      if (url.includes('/queries') && !url.includes('/results')) {
        if (s.liveDiscover?.savedQueries) {
          interceptedCount++;
          return s.liveDiscover.savedQueries;
        }
      }
      // Connected endpoints for query targeting
      if (url.includes('/endpoints') || url.includes('/devices')) {
        if (s.liveDiscover?.connectedEndpoints) {
          interceptedCount++;
          return s.liveDiscover.connectedEndpoints;
        }
      }
      return data;
    }

    // ── Email Message History / Quarantine ──
    if (url.includes('/email/') || url.includes('/xgemail/')) {
      // Message search / history
      if (url.includes('/messages') || url.includes('/message-history') || url.includes('/search')) {
        if (s.emailHistory?.messages) {
          interceptedCount++;
          return s.emailHistory.messages;
        }
      }
      // Quarantine
      if (url.includes('/quarantine')) {
        if (s.emailHistory?.quarantine) {
          interceptedCount++;
          return s.emailHistory.quarantine;
        }
      }
      // Message detail / trace
      if (url.match(/\/messages?\/[\w-]+$/)) {
        if (s.emailHistory?.messageDetail) {
          interceptedCount++;
          return s.emailHistory.messageDetail;
        }
      }
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
        const blockedResp = new Response(JSON.stringify({ success: true, id: uuid() }), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        });
        Object.defineProperty(blockedResp, 'url', { value: url });
        return blockedResp;
      }
    }

    // Pre-fetch interception: if URL is for a fake case or STAC graph,
    // return synthetic data without hitting the real API (which would 404)
    if (activeScenario) {
      let shouldSynthesize = false;

      // Regular cases
      if (url.includes('/cases/v1/cases/')) {
        const caseIdMatch = url.match(/\/cases\/v1\/cases\/([\w-]+)/);
        if (caseIdMatch) {
          const fakeCase = activeScenario.cases?.items?.find(c => c.id === caseIdMatch[1]);
          if (fakeCase) shouldSynthesize = true;
        }
      }

      // STAC threat graph endpoints
      if (url.includes('/api/stac/')) {
        if (activeScenario.threatGraphs?.stacCases || activeScenario.detections?.items?.length) {
          shouldSynthesize = true;
        }
      }

      if (shouldSynthesize) {
        const syntheticData = modifyResponse(url, method.toUpperCase(), {});
        const syntheticResp = new Response(JSON.stringify(syntheticData), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        });
        Object.defineProperty(syntheticResp, 'url', { value: url });
        return syntheticResp;
      }
    }

    try {
      const response = await originalFetch.apply(this, args);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        return response;
      }

      if (!shouldInterceptUrl(url)) {
        return response;
      }

      const cloned = response.clone();
      let text = await cloned.text();
      let originalText = text;

      text = globalReplace(text);

      let data;
      try { data = JSON.parse(text); } catch { return response; }

      const modified = modifyResponse(url, method.toUpperCase(), data);
      const modifiedText = JSON.stringify(modified);

      // If nothing was modified, return the original response to preserve all properties
      if (modifiedText === originalText && text === originalText) {
        return response;
      }

      // Build new response preserving all original properties
      const newResp = new Response(modifiedText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      // Preserve response URL (new Response() drops it)
      Object.defineProperty(newResp, 'url', { value: response.url });
      return newResp;
    } catch (err) {
      console.error('[Sophos Demo] Fetch error:', err);
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

    // Check if this XHR is for a fake case and synthesize response if needed
    _getFakeCaseResponse() {
      if (!demoState.enabled || !activeScenario || !this._demoUrl) return null;
      if (!this._demoUrl.includes('/cases/v1/cases/')) return null;
      const match = this._demoUrl.match(/\/cases\/v1\/cases\/([\w-]+)/);
      if (!match) return null;
      const fakeCase = activeScenario.cases?.items?.find(c => c.id === match[1]);
      if (!fakeCase) return null;
      // This is our fake case — synthesize response
      const syntheticData = modifyResponse(this._demoUrl, this._demoMethod || 'GET', {});
      return JSON.stringify(syntheticData);
    }

    get status() {
      // If this is a fake case request that got 404'd, pretend it's 200
      const realStatus = super.status;
      if (realStatus === 404 && this._getFakeCaseResponse() !== null) return 200;
      return realStatus;
    }

    get response() {
      const original = super.response;
      if (!demoState.enabled || !this._demoUrl) return original;
      if (!this._demoUrl.includes('sophos.com') && !this._demoUrl.includes('sophosapis.com')) return original;

      // Pre-empt: if this is a fake case request (real API returned 404), return synthetic data
      const fakeCaseResp = this._getFakeCaseResponse();
      if (fakeCaseResp !== null && (super.status === 404 || super.status === 0)) return fakeCaseResp;

      if (!shouldInterceptUrl(this._demoUrl)) {
        try {
          const size = typeof original === 'string' ? original.length : JSON.stringify(original)?.length || 0;
          console.log(`[Sophos Demo] 🔍 Unhandled: ${this._demoMethod} ${this._demoUrl.replace(/https?:\/\/[^/]+/, '').split('?')[0]} (${size} bytes)`);
        } catch {}
        return original;
      }

      try {
        const text = typeof original === 'string' ? original : JSON.stringify(original);
        if (!text) return original;
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

      // Pre-empt: if this is a fake case request, return synthetic data
      const fakeCaseResp = this._getFakeCaseResponse();
      if (fakeCaseResp !== null && (super.status === 404 || super.status === 0)) return fakeCaseResp;

      if (!shouldInterceptUrl(this._demoUrl)) return original;

      try {
        if (!original) return original;
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


  // ─── DOM Observer for Device List Override ─────────────────────────
  // The Devices page loads via a micro-frontend that bypasses fetch/XHR.
  // We observe the DOM and override the table + count elements when they appear.

  let domObserver = null;
  let domOverrideApplied = false;

  function startDomObserver() {
    if (domObserver) return;

    domObserver = new MutationObserver(() => {
      if (!demoState.enabled || !activeScenario) return;

      // Dashboard widget injection (TAC Dashboard, Device Exposure)
      injectDashboardWidgets();

      const path = window.location.pathname;
      const isDevicePage = path.includes('/devices/computers') || path.includes('/devices/servers');
      if (!isDevicePage) {
        domOverrideApplied = false;
        return;
      }
      if (domOverrideApplied) return;

      const s = activeScenario;
      if (!s.endpointReport?.overrideTotal) return;

      // Look for total count indicators and override them
      // Sophos Central typically shows "X computers" or "X items" in a summary bar
      const countElements = document.querySelectorAll('[class*="count"], [class*="total"], [class*="summary"], [data-testid*="count"], [data-testid*="total"]');
      for (const el of countElements) {
        const text = el.textContent.trim();
        // Match patterns like "20 computers", "20 items", "Showing 20"
        const match = text.match(/^(\d+)\s*(computer|server|endpoint|device|item)/i);
        if (match) {
          const isServer = path.includes('/servers');
          const newCount = isServer ? (demoState.serverCount || s.customer?.serverCount || 186) : s.endpointReport.overrideTotal;
          el.textContent = text.replace(/^\d+/, newCount.toLocaleString());
          console.log(`[Sophos Demo] 🖥️ DOM override: "${match[0]}" → "${newCount} ${match[2]}"`);
          domOverrideApplied = true;
        }
      }

      // Also look for pagination info
      const pagElements = document.querySelectorAll('[class*="pagination"], [class*="paging"], [class*="page-info"]');
      for (const el of pagElements) {
        const text = el.textContent;
        const match = text.match(/of\s+(\d+)/);
        if (match) {
          const isServer = path.includes('/servers');
          const newCount = isServer ? (demoState.serverCount || 186) : s.endpointReport.overrideTotal;
          el.textContent = text.replace(/of\s+\d+/, 'of ' + newCount.toLocaleString());
          domOverrideApplied = true;
        }
      }
    });

    domObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // ─── Dashboard Widget DOM Injection ────────────────────────────────
  // The TAC Dashboard and Device Exposure pages use v2 widgets that load
  // data through the dashboard-manager micro-frontend. We can't intercept
  // the widget data pipeline, so we inject content into the DOM after render.

  let widgetOverridesApplied = {};
  let lastWidgetPath = '';
  let widgetPollInterval = null;

  function injectDashboardWidgets() {
    // Reset overrides when URL changes (navigated away and back)
    const currentPath = window.location.pathname;
    if (currentPath !== lastWidgetPath) {
      widgetOverridesApplied = {};
      lastWidgetPath = currentPath;
    }
    if (!demoState.enabled || !activeScenario) return;

    const path = window.location.pathname;
    const isTACDashboard = path.includes('dashboard_v2/tac') || (path.includes('threat-analysis-center') && path.includes('dashboard'));
    const isDeviceExposure = path.includes('device-exposure');
    if (!isTACDashboard && !isDeviceExposure) {
      widgetOverridesApplied = {};
      return;
    }

    const s = activeScenario;
    const cn = demoState.customerName || s.customer?.name || 'Demo Customer';

    // Find all widget containers with "No data available"
    const widgets = document.querySelectorAll('.react-widget-container');
    for (const widget of widgets) {
      const titleEl = widget.querySelector('[data-testid="sophosTitle"]');
      if (!titleEl) continue;
      const title = titleEl.textContent.trim();

      // Skip if already overridden
      if (widgetOverridesApplied[title]) continue;

      const noDataEl = widget.querySelector('.no-data');
      if (!noDataEl) continue;

      // Find the content container (parent of no-data)
      const contentArea = noDataEl.parentElement;
      if (!contentArea) continue;

      const cases = s.cases?.items || [];
      const alerts = s.alerts?.items || [];
      const detections = s.detections?.items || [];
      const endpointCount = demoState.endpointCount || s.customer?.endpointCount || 2500;

      let injectedHTML = null;

      // ── TAC Dashboard Widgets ──
      if (title === 'Total cases') {
        const highCount = cases.filter(c => c.initialDetection?.severity >= 7).length;
        const medCount = cases.filter(c => c.initialDetection?.severity >= 4 && c.initialDetection?.severity < 7).length;
        const lowCount = cases.length - highCount - medCount;
        injectedHTML = buildDonutWidget([
          { label: 'High', value: highCount, color: '#d43f3f' },
          { label: 'Medium', value: medCount, color: '#e87722' },
          { label: 'Low', value: lowCount, color: '#d4a017' },
        ], cases.length);
      }

      else if (title === 'Total cases count') {
        const statusCounts = {};
        for (const c of cases) {
          const status = c.status || 'new';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        }
        const bars = Object.entries(statusCounts).map(([label, value]) => ({
          label: label.charAt(0).toUpperCase() + label.slice(1),
          value,
          color: label === 'containment' ? '#d43f3f' : label === 'investigating' ? '#e87722' : label === 'resolved' ? '#1a8754' : label === 'closed' ? '#7e8da0' : '#2006f7',
        }));
        injectedHTML = buildBarWidget(bars, 'Cases by Status');
      }

      else if (title === 'Recent cases') {
        injectedHTML = buildTableWidget(
          ['Case Name', 'Severity', 'Status', 'Created'],
          cases.slice(0, 5).map(c => [
            (c.name || '').replace(/\{\{customerName\}\}/g, cn).substring(0, 50),
            c.initialDetection?.severity >= 7 ? '🔴 High' : c.initialDetection?.severity >= 4 ? '🟡 Medium' : '🟢 Low',
            (c.status || 'new').charAt(0).toUpperCase() + (c.status || 'new').slice(1),
            c.createdAt ? formatRelativeTime(c.createdAt) : '—',
          ])
        );
      }

      else if (title.includes('Total detections') || title.includes('detections')) {
        const highDets = detections.filter(d => (d.severity || d.classificationSeverity) >= 7).length;
        const medDets = detections.filter(d => { const sev = d.severity || d.classificationSeverity || 0; return sev >= 4 && sev < 7; }).length;
        const lowDets = detections.length - highDets - medDets;
        injectedHTML = buildDonutWidget([
          { label: 'High', value: highDets || detections.length, color: '#d43f3f' },
          { label: 'Medium', value: medDets, color: '#e87722' },
          { label: 'Low', value: lowDets, color: '#d4a017' },
        ], detections.length);
      }

      // ── Device Exposure Widgets ──
      else if (title.includes('Days since last OS update')) {
        const over30 = Math.floor(endpointCount * 0.12);
        const over90 = Math.floor(endpointCount * 0.05);
        const over180 = Math.floor(endpointCount * 0.02);
        const over365 = Math.floor(endpointCount * 0.01);
        injectedHTML = buildDonutWidget([
          { label: 'Over 30 days', value: over30, color: '#d4a017' },
          { label: 'Over 90 days', value: over90, color: '#e87722' },
          { label: 'Over 180 days', value: over180, color: '#d45a22' },
          { label: 'Over 365 days', value: over365, color: '#d43f3f' },
        ], over30 + over90 + over180 + over365);
      }

      else if (title.includes('OS updates') && title.includes('Breakdown')) {
        injectedHTML = buildBarWidget([
          { label: 'Windows 11', value: Math.floor(endpointCount * 0.45), color: '#2006f7' },
          { label: 'Windows 10', value: Math.floor(endpointCount * 0.35), color: '#4a7cf7' },
          { label: 'macOS', value: Math.floor(endpointCount * 0.12), color: '#7e8da0' },
          { label: 'Windows Server', value: Math.floor(endpointCount * 0.06), color: '#1a8754' },
          { label: 'Linux', value: Math.floor(endpointCount * 0.02), color: '#d4a017' },
        ], 'Devices by OS');
      }

      else if (title.includes('Top devices') || title.includes('last update')) {
        const hostnames = s.detections?.items?.map(d => d.device?.hostname).filter(Boolean) || ['DESKTOP-FIN042', 'SRV-FS01', 'LAPTOP-MKT007'];
        injectedHTML = buildTableWidget(
          ['Device', 'OS', 'Last Update', 'Days Overdue'],
          hostnames.slice(0, 5).map((h, i) => [
            h,
            i % 3 === 0 ? 'Windows 11' : i % 3 === 1 ? 'Windows 10' : 'Windows Server 2022',
            Math.floor(45 + Math.random() * 300) + ' days ago',
            String(Math.floor(15 + Math.random() * 200)),
          ])
        );
      }

      // Generic fallback for any other "No data" widget
      else {
        continue; // Don't inject into unknown widgets
      }

      if (injectedHTML) {
        contentArea.innerHTML = injectedHTML;
        widgetOverridesApplied[title] = true;
        interceptedCount++;
        console.log('[Sophos Demo] 📊 Dashboard widget injected:', title);
      }
    }
  }

  function formatRelativeTime(ts) {
    if (typeof ts === 'string' && ts.match(/^-\d+(m|h|d)$/)) {
      return ts.replace('-', '').replace('m', ' min ago').replace('h', ' hours ago').replace('d', ' days ago');
    }
    try {
      const diff = Date.now() - new Date(ts).getTime();
      if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
      return Math.floor(diff / 86400000) + ' days ago';
    } catch { return '—'; }
  }

  function buildDonutWidget(segments, total) {
    const size = 140;
    const cx = size / 2, cy = size / 2, r = 50, strokeWidth = 20;
    const circumference = 2 * Math.PI * r;
    let offset = 0;

    const arcs = segments.filter(s => s.value > 0).map(seg => {
      const pct = total > 0 ? seg.value / total : 0;
      const dash = pct * circumference;
      const gap = circumference - dash;
      const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" />`;
      offset += dash;
      return arc;
    });

    const legend = segments.map(s =>
      `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#4a5b6e;">
        <span style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;"></span>
        <span style="font-weight:600;color:#1c2b3a;">${s.value}</span> ${s.label}
      </div>`
    ).join('');

    return `<div style="display:flex;align-items:center;justify-content:center;gap:32px;padding:16px;">
      <div style="position:relative;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e8ebef" stroke-width="${strokeWidth}" />
          ${arcs.join('')}
        </svg>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#1c2b3a;">${total}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">${legend}</div>
    </div>`;
  }

  function buildBarWidget(bars, subtitle) {
    const maxVal = Math.max(...bars.map(b => b.value), 1);
    const barRows = bars.map(b =>
      `<div style="display:flex;align-items:center;gap:10px;font-size:13px;">
        <span style="width:100px;text-align:right;color:#4a5b6e;flex-shrink:0;">${b.label}</span>
        <div style="flex:1;height:22px;background:#f0f2f5;border-radius:4px;overflow:hidden;">
          <div style="width:${(b.value / maxVal * 100).toFixed(1)}%;height:100%;background:${b.color};border-radius:4px;min-width:2px;"></div>
        </div>
        <span style="width:40px;font-weight:600;color:#1c2b3a;">${b.value}</span>
      </div>`
    ).join('');

    return `<div style="padding:16px;">
      ${subtitle ? `<div style="font-size:12px;color:#7e8da0;margin-bottom:12px;">${subtitle}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px;">${barRows}</div>
    </div>`;
  }

  function buildTableWidget(headers, rows) {
    const headerCells = headers.map(h => `<th style="text-align:left;padding:8px 12px;font-size:12px;font-weight:600;color:#7e8da0;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e8ebef;">${h}</th>`).join('');
    const bodyRows = rows.map(row =>
      `<tr>${row.map(cell => `<td style="padding:8px 12px;font-size:13px;color:#1c2b3a;border-bottom:1px solid #f0f2f5;">${cell}</td>`).join('')}</tr>`
    ).join('');

    return `<div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
  }

  // Start observer when DOM is ready
  if (document.body) {
    startDomObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startDomObserver);
  }

  // Reset DOM overrides on SPA navigation + poll for dashboard widgets
  let lastPathname = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastPathname) {
      lastPathname = window.location.pathname;
      domOverrideApplied = false;
      widgetOverridesApplied = {};
    }
    // Re-check dashboard widgets (they may re-render after SPA navigation)
    if (demoState.enabled && activeScenario) {
      injectDashboardWidgets();
    }
  }, 1000);


  // ─── Floating Demo Badge (#10) ─────────────────────────────────────
  // Shows a small indicator so the SE always knows demo mode is active

  let badgeElement = null;

  function updateBadge() {
    if (demoState.enabled && activeScenario && demoState.showBadge !== false) {
      if (!badgeElement) {
        badgeElement = document.createElement('div');
        badgeElement.id = '__sophos_demo_badge__';
        Object.assign(badgeElement.style, {
          position: 'fixed', bottom: '12px', right: '12px', zIndex: '999999',
          background: '#003366', color: 'white', padding: '6px 14px',
          borderRadius: '20px', fontSize: '12px', fontFamily: 'system-ui, sans-serif',
          fontWeight: '500', boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
          cursor: 'pointer', userSelect: 'none', transition: 'opacity 0.2s',
          display: 'flex', alignItems: 'center', gap: '8px',
        });
        badgeElement.addEventListener('click', () => {
          badgeElement.style.opacity = badgeElement.style.opacity === '0.15' ? '1' : '0.15';
        });
        (document.body || document.documentElement).appendChild(badgeElement);
      }
      const scenarioName = activeScenario.name || demoState.scenario || 'Demo';
      const cn = demoState.customerName || 'Demo';
      badgeElement.innerHTML = `<span style="opacity:0.7">🎯</span> <span>${scenarioName}</span> <span style="opacity:0.5">|</span> <span>${cn}</span> <span style="opacity:0.5">|</span> <span style="color:#4ade80">${interceptedCount} intercepted</span>`;
      badgeElement.style.display = 'flex';
    } else if (badgeElement) {
      badgeElement.style.display = 'none';
    }
    // Also hide if badge is disabled
    if (demoState.showBadge === false && badgeElement) {
      badgeElement.style.display = 'none';
    }
  }

  // Update badge every 3 seconds
  setInterval(updateBadge, 3000);


  // ─── Timed Events (#6) ────────────────────────────────────────────
  // Injects new alerts/detections at scheduled times during the demo
  // for dramatic "something just happened!" moments

  let timedEventsStarted = false;

  function startTimedEvents() {
    if (timedEventsStarted || !activeScenario?.timedEvents) return;
    timedEventsStarted = true;

    for (const event of activeScenario.timedEvents) {
      const delayMs = (event.delaySeconds || 30) * 1000;

      setTimeout(() => {
        if (!demoState.enabled) return;

        // Inject the event by modifying the active scenario
        if (event.alert && activeScenario.alerts?.items) {
          // Resolve timestamps to NOW for the timed event
          const alert = { ...event.alert };
          alert.created_at = new Date().toISOString();
          alert.when = new Date().toISOString();
          if (!alert.javaUUID) alert.javaUUID = uuid();
          if (!alert.id) alert.id = uuid();
          if (!alert.event_service_event_id) alert.event_service_event_id = uuid();
          if (!alert.customer_id) alert.customer_id = uuid();
          if (alert.data && !alert.data.endpoint_id) alert.data.endpoint_id = uuid();

          activeScenario.alerts.items.unshift(alert);

          // Update summary counts
          if (activeScenario.alerts.summaryDelta) {
            const sev = alert.severity || 'medium';
            activeScenario.alerts.summaryDelta[sev] = (activeScenario.alerts.summaryDelta[sev] || 0) + 1;
          }

          console.log(`[Sophos Demo] ⏰ Timed event fired: ${alert.description?.slice(0, 80)}`);
          
          // Flash the badge
          if (badgeElement) {
            badgeElement.style.background = '#dc2626';
            setTimeout(() => { if (badgeElement) badgeElement.style.background = '#003366'; }, 3000);
          }
        }
      }, delayMs);
    }

    console.log(`[Sophos Demo] ⏰ ${activeScenario.timedEvents.length} timed event(s) scheduled`);
  }

  // Start timed events when scenario loads
  window.addEventListener('__sophos_demo_state_update__', () => {
    if (demoState.enabled && activeScenario?.timedEvents && !timedEventsStarted) {
      startTimedEvents();
    }
    if (!demoState.enabled) {
      timedEventsStarted = false;
    }
  });


  // ─── Recording Mode (#10) ────────────────────────────────────────
  // Tracks which pages the SE visits, how long they spend, and in what order

  const demoRecording = {
    enabled: false,
    startTime: null,
    pages: [],        // { url, title, enteredAt, duration }
    currentPage: null,
  };

  function startRecording() {
    if (demoRecording.enabled) return;
    demoRecording.enabled = true;
    demoRecording.startTime = Date.now();
    demoRecording.pages = [];
    demoRecording.currentPage = {
      url: location.pathname,
      title: document.title,
      enteredAt: Date.now(),
    };
    console.log('[Sophos Demo] 🎬 Recording started');
  }

  function recordPageChange() {
    if (!demoRecording.enabled) return;
    const now = Date.now();
    if (demoRecording.currentPage) {
      demoRecording.currentPage.duration = now - demoRecording.currentPage.enteredAt;
      demoRecording.pages.push({ ...demoRecording.currentPage });
    }
    demoRecording.currentPage = {
      url: location.pathname,
      title: document.title,
      enteredAt: now,
    };
  }

  function stopRecording() {
    if (!demoRecording.enabled) return;
    recordPageChange(); // flush current page
    demoRecording.enabled = false;
    const totalMs = Date.now() - demoRecording.startTime;
    const summary = {
      totalDuration: totalMs,
      totalDurationFormatted: formatMs(totalMs),
      pagesVisited: demoRecording.pages.length,
      pages: demoRecording.pages.map(p => ({
        ...p,
        durationFormatted: formatMs(p.duration),
        enteredAtFormatted: new Date(p.enteredAt).toLocaleTimeString(),
      })),
      scenario: activeScenario?.name || demoState.scenario,
      customer: demoState.customerName,
      interceptedCount,
      timestamp: new Date().toISOString(),
    };
    console.log('[Sophos Demo] 🎬 Recording stopped:', summary);
    return summary;
  }

  function formatMs(ms) {
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  // Track SPA navigation via URL changes
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      recordPageChange();
    }
  });
  urlObserver.observe(document.documentElement, { subtree: true, childList: true });

  // Auto-start recording when demo mode is enabled
  window.addEventListener('__sophos_demo_state_update__', () => {
    if (demoState.enabled && !demoRecording.enabled) startRecording();
    if (!demoState.enabled && demoRecording.enabled) {
      const summary = stopRecording();
      // Store the recording in sessionStorage for the popup to access
      if (summary) {
        try { sessionStorage.setItem('__sophos_demo_recording__', JSON.stringify(summary)); } catch {}
      }
    }
  });


  // ─── "What If" Mode (#13) ──────────────────────────────────────────
  // Allows injecting alerts on-demand via a keyboard shortcut or message

  const WHAT_IF_TEMPLATES = {
    ransomware: {
      severity: 'high',
      category: 'runtime_detections',
      type: 'Event::Endpoint::CoreDetection::CryptoGuard',
      description: '🚨 LIVE: CryptoGuard blocked ransomware encryption on {{host}}. {{count}} files protected.',
    },
    phishing: {
      severity: 'high',
      category: 'policy',
      type: 'Event::Email::ThreatBlocked',
      description: '🚨 LIVE: Phishing email blocked — credential harvesting link detected from {{sender}}',
    },
    lateral: {
      severity: 'high',
      category: 'runtime_detections',
      type: 'Event::Endpoint::SuspiciousActivity',
      description: '🚨 LIVE: Lateral movement detected — {{host}} accessing {{target}} via SMB with stolen credentials',
    },
    exfiltration: {
      severity: 'high',
      category: 'runtime_detections',
      type: 'Event::Endpoint::DataExfiltration',
      description: '🚨 LIVE: Data exfiltration attempt blocked — {{size}} upload to external IP from {{host}}',
    },
    isolation: {
      severity: 'medium',
      category: 'policy',
      type: 'Event::Endpoint::DeviceIsolated',
      description: '🔒 LIVE: {{host}} automatically isolated from network — threat containment in progress',
    },
  };

  function injectWhatIf(templateName) {
    if (!demoState.enabled || !activeScenario) return;

    const template = WHAT_IF_TEMPLATES[templateName];
    if (!template) {
      console.warn(`[Sophos Demo] Unknown what-if template: ${templateName}`);
      return;
    }

    // Generate realistic placeholders
    const hosts = activeScenario.detections?.items?.map(d => d.device?.hostname).filter(Boolean) || ['DESKTOP-WKS001'];
    const host = hosts[Math.floor(Math.random() * hosts.length)];
    const target = 'SRV-DC01';
    const sender = 'secure-update@' + (demoState.customerName || 'company').toLowerCase().replace(/\s+/g, '') + '-verify.com';

    const alert = {
      id: uuid(),
      javaUUID: uuid(),
      event_service_event_id: uuid(),
      customer_id: uuid(),
      severity: template.severity,
      category: template.category,
      type: template.type,
      product: 'endpoint',
      created_at: new Date().toISOString(),
      when: new Date().toISOString(),
      location: host,
      description: template.description
        .replace('{{host}}', host)
        .replace('{{target}}', target)
        .replace('{{sender}}', sender)
        .replace('{{count}}', Math.floor(Math.random() * 200 + 50))
        .replace('{{size}}', `${(Math.random() * 3 + 0.5).toFixed(1)}GB`),
      data: {
        endpoint_type: 'computer',
        endpoint_platform: 'windows',
        endpoint_id: uuid(),
      },
      allowedActions: ['ACKNOWLEDGE'],
      actionable: true,
    };

    // Inject into active scenario
    if (!activeScenario.alerts) activeScenario.alerts = { items: [], summaryDelta: { high: 0, medium: 0, low: 0 } };
    if (!activeScenario.alerts.items) activeScenario.alerts.items = [];
    activeScenario.alerts.items.unshift(alert);
    if (activeScenario.alerts.summaryDelta) {
      activeScenario.alerts.summaryDelta[alert.severity] = (activeScenario.alerts.summaryDelta[alert.severity] || 0) + 1;
    }

    console.log(`[Sophos Demo] ⚡ What-If injected: ${templateName} — ${alert.description.slice(0, 80)}`);

    // Flash the badge
    if (badgeElement) {
      badgeElement.style.background = '#dc2626';
      setTimeout(() => { if (badgeElement) badgeElement.style.background = '#003366'; }, 3000);
    }

    return alert;
  }

  // Keyboard shortcuts: Ctrl+Shift+1 through 5 for what-if events
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.shiftKey || !demoState.enabled) return;
    const templates = ['ransomware', 'phishing', 'lateral', 'exfiltration', 'isolation'];
    const idx = parseInt(e.key) - 1;
    if (idx >= 0 && idx < templates.length) {
      e.preventDefault();
      injectWhatIf(templates[idx]);
    }
  });

  // Also listen for messages from the popup/bridge
  window.addEventListener('message', (e) => {
    if (e.data?.type === '__sophos_demo_whatif__') {
      injectWhatIf(e.data.template);
    }
    if (e.data?.type === '__sophos_demo_get_recording__') {
      const summary = demoRecording.enabled ? stopRecording() : null;
      window.postMessage({ type: '__sophos_demo_recording_data__', summary }, '*');
    }
  });

  // Expose for console usage
  window.__sophosDemo = {
    whatIf: injectWhatIf,
    startRecording,
    stopRecording,
    getRecording: () => ({ ...demoRecording, pages: [...demoRecording.pages] }),
    templates: Object.keys(WHAT_IF_TEMPLATES),
  };


  console.log('[Sophos Demo] 🎯 Interceptor loaded (JSON scenario engine). Waiting for activation...');
  console.log('[Sophos Demo] 💡 What-If shortcuts: Ctrl+Shift+1 (ransomware), 2 (phishing), 3 (lateral), 4 (exfiltration), 5 (isolation)');
  console.log('[Sophos Demo] 💡 Console: window.__sophosDemo.whatIf("ransomware"), .stopRecording(), .templates');

})();
