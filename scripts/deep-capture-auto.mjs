/**
 * Deep Auto-Capture — navigates Sophos Central pages via CDP and captures all API responses.
 * Saves incrementally. No user interaction needed.
 */

import { writeFileSync } from 'fs';
import WebSocket from 'ws';

const CDP_URL = 'http://localhost:9222';
const OUTPUT = 'data/deep-capture.json';

const captured = {
  capturedAt: new Date().toISOString(),
  endpoints: {},
  totalRequests: 0,
};

let requestMap = {};
let ws, msgId = 1, pending = {};

function send(method, params = {}) {
  const id = msgId++;
  return new Promise((resolve) => {
    pending[id] = resolve;
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending[id]) { pending[id](null); delete pending[id]; } }, 10000);
  });
}

function tryParse(s) { try { return JSON.parse(s); } catch { return s; } }

function save() {
  writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
}

// Pages to visit
const PAGES = [
  { name: 'dashboard', path: '/manage/overview/dashboard' },
  { name: 'alerts', path: '/manage/alerts' },
  { name: 'devices-computers', path: '/manage/devices/computers' },
  { name: 'cases', path: '/manage/threat-analysis-center/cases' },
  { name: 'detections', path: '/manage/threat-analysis-center/detections' },
  { name: 'threat-graphs', path: '/manage/threat-analysis-center/threat-graphs' },
  { name: 'account-health', path: '/manage/account-health-check' },
  { name: 'live-discover', path: '/manage/threat-analysis-center/live-discover' },
];

// After visiting list pages, we'll click into specific items
const DETAIL_PAGES = [
  { name: 'case-detail', path: '/manage/threat-analysis-center/cases/1-1132033' },
];

async function run() {
  // Get Sophos tab
  const resp = await fetch(`${CDP_URL}/json`);
  const targets = await resp.json();
  const target = targets.find(t => t.url?.includes('sophos.com') && t.type === 'page');
  if (!target) throw new Error('No Sophos tab found');

  console.log(`🔗 Connected: ${target.url}`);

  ws = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise((resolve) => ws.on('open', resolve));

  // Set up message handler
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending[msg.id]) {
      pending[msg.id](msg.result);
      delete pending[msg.id];
      return;
    }

    if (msg.method === 'Network.requestWillBeSent') {
      const req = msg.params?.request;
      const reqId = msg.params?.requestId;
      if (req && reqId) {
        requestMap[reqId] = { method: req.method, url: req.url, postData: req.postData };
      }
    }

    if (msg.method === 'Network.responseReceived') {
      const resp = msg.params?.response;
      const reqId = msg.params?.requestId;
      const url = resp?.url || '';
      const status = resp?.status;
      const ct = resp?.headers?.['content-type'] || resp?.headers?.['Content-Type'] || '';

      if (!url.includes('sophos.com') || !ct.includes('json')) return;
      if (url.includes('.js') || url.includes('.css')) return;
      if (status !== 200 && status !== 201) return;

      const reqInfo = requestMap[reqId] || {};
      delete requestMap[reqId];

      send('Network.getResponseBody', { requestId: reqId }).then((result) => {
        if (!result?.body) return;
        let body;
        try { body = JSON.parse(result.body); } catch { return; }

        const cleanUrl = url.split('?')[0];
        const httpMethod = reqInfo.method || 'GET';
        const key = `${httpMethod} ${cleanUrl}`;
        const currentPage = ws._currentPage || 'unknown';

        if (!captured.endpoints[key] || result.body.length > (captured.endpoints[key].bodySize || 0)) {
          captured.endpoints[key] = {
            body,
            bodySize: result.body.length,
            count: (captured.endpoints[key]?.count || 0) + 1,
            pages: captured.endpoints[key]?.pages || [],
            requestBody: reqInfo.postData ? tryParse(reqInfo.postData) : undefined,
            queryParams: url.includes('?') ? url.split('?')[1] : '',
          };
        } else {
          captured.endpoints[key].count++;
        }
        if (!captured.endpoints[key].pages.includes(currentPage)) {
          captured.endpoints[key].pages.push(currentPage);
        }
        captured.totalRequests++;

        const short = cleanUrl.replace(/https:\/\/[^/]+/, '').slice(0, 75);
        process.stdout.write(`  ${httpMethod} ${short} (${(result.body.length/1024).toFixed(1)}KB)\n`);
      }).catch(() => {});
    }
  });

  await send('Network.enable', { maxPostDataSize: 65536 });
  await send('Page.enable');

  // Navigate through each page
  const allPages = [...PAGES, ...DETAIL_PAGES];
  for (const page of allPages) {
    const url = `https://central.sophos.com${page.path}`;
    console.log(`\n📄 Navigating: ${page.name} → ${page.path}`);
    ws._currentPage = page.name;

    await send('Page.navigate', { url });
    // Wait for page to load and APIs to fire
    await sleep(8000);
    save();
    console.log(`   ✅ ${Object.keys(captured.endpoints).length} endpoints captured so far`);
  }

  // Final save
  save();
  const eps = Object.keys(captured.endpoints).length;
  console.log(`\n💾 Done! ${OUTPUT}: ${captured.totalRequests} calls, ${eps} unique endpoints`);
  
  // Print summary
  console.log('\n📊 Captured endpoints:');
  for (const [key, val] of Object.entries(captured.endpoints).sort((a,b) => b[1].bodySize - a[1].bodySize).slice(0, 30)) {
    console.log(`  ${key.slice(0, 85)} (${(val.bodySize/1024).toFixed(1)}KB)`);
  }

  ws.close();
  process.exit(0);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

run().catch(e => { console.error('❌', e.message); process.exit(1); });
