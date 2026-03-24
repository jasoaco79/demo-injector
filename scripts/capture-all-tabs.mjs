/**
 * Captures API calls from ALL Sophos Central tabs simultaneously.
 * Auto-saves every 2 seconds. Disables cache so refreshes trigger real API calls.
 */

import { writeFileSync } from 'fs';
import WebSocket from 'ws';

const CDP_URL = 'http://localhost:9222';
const OUTPUT = 'data/deep-capture.json';

const captured = { capturedAt: new Date().toISOString(), endpoints: {}, totalRequests: 0 };
let lastSaved = 0;

setInterval(() => {
  if (captured.totalRequests > lastSaved) {
    writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
    lastSaved = captured.totalRequests;
  }
}, 2000);

function tryParse(s) { try { return JSON.parse(s); } catch { return s; } }

async function attachToTab(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = {};
  const requestMap = {};
  const tabName = target.url.replace(/https:\/\/central\.sophos\.com\/manage\//, '').split('?')[0].replace(/\//g, '-').slice(0, 40) || 'root';

  function send(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve) => {
      pending[id] = resolve;
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pending[id]) { pending[id](null); delete pending[id]; } }, 5000);
    });
  }

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // Disable cache so refreshes trigger real API calls
  await send('Network.enable', { maxPostDataSize: 65536 });
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  console.log(`  📡 Attached to: ${tabName}`);

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending[msg.id]) { pending[msg.id](msg.result); delete pending[msg.id]; return; }
    if (!msg.method) return;

    if (msg.method === 'Network.requestWillBeSent') {
      const req = msg.params?.request;
      if (req && msg.params?.requestId) {
        requestMap[msg.params.requestId] = { method: req.method, url: req.url, postData: req.postData };
      }
    }

    if (msg.method === 'Network.responseReceived') {
      const resp = msg.params?.response;
      const reqId = msg.params?.requestId;
      const url = resp?.url || '';
      const ct = resp?.headers?.['content-type'] || resp?.headers?.['Content-Type'] || '';
      if (!url.includes('sophos.com') || !ct.includes('json')) return;
      if (url.includes('.js') || url.includes('.css')) return;
      if (resp?.status !== 200 && resp?.status !== 201) return;

      const reqInfo = requestMap[reqId] || {};
      delete requestMap[reqId];

      send('Network.getResponseBody', { requestId: reqId }).then((result) => {
        if (!result?.body) return;
        let body; try { body = JSON.parse(result.body); } catch { return; }

        const cleanUrl = url.split('?')[0];
        const httpMethod = reqInfo.method || 'GET';
        const key = `${httpMethod} ${cleanUrl}`;

        if (!captured.endpoints[key] || result.body.length > (captured.endpoints[key].bodySize || 0)) {
          captured.endpoints[key] = {
            body, bodySize: result.body.length,
            count: (captured.endpoints[key]?.count || 0) + 1,
            pages: captured.endpoints[key]?.pages || [],
            requestBody: reqInfo.postData ? tryParse(reqInfo.postData) : undefined,
            queryParams: url.includes('?') ? url.split('?')[1] : '',
          };
        } else { captured.endpoints[key].count++; }
        if (!captured.endpoints[key].pages.includes(tabName)) captured.endpoints[key].pages.push(tabName);
        captured.totalRequests++;

        const short = cleanUrl.replace(/https:\/\/[^/]+/, '').slice(0, 80);
        console.log(`  [${tabName}] ${httpMethod} ${short} (${(result.body.length/1024).toFixed(1)}KB)`);
      }).catch(() => {});
    }
  });

  return ws;
}

async function run() {
  const resp = await fetch(`${CDP_URL}/json`);
  const targets = await resp.json();
  const sophosTabs = targets.filter(t => t.url?.includes('sophos.com') && t.type === 'page');

  if (sophosTabs.length === 0) throw new Error('No Sophos tabs found');

  console.log(`🔗 Found ${sophosTabs.length} Sophos tab(s). Attaching...\n`);

  for (const tab of sophosTabs) {
    await attachToTab(tab);
  }

  console.log(`\n✅ Listening on all tabs. Cache disabled — refreshes will trigger API calls.`);
  console.log(`\n   Now: refresh the page (F5), then click through:`);
  console.log(`   1. Case → Notebook tab → History tab → Respond tab`);
  console.log(`   2. Threat Graphs → click into one`);
  console.log(`   3. Devices → click into a device`);
  console.log(`\n   Press Ctrl+C when done.\n`);
}

process.on('SIGINT', () => {
  writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
  console.log(`\n💾 Saved: ${captured.totalRequests} calls, ${Object.keys(captured.endpoints).length} endpoints → ${OUTPUT}`);
  process.exit(0);
});

run().catch(e => { console.error('❌', e.message); process.exit(1); });
