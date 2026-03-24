/**
 * Deep API Capture v2 — saves incrementally after every API call
 * so we never lose data even if the process is killed.
 */

import { writeFileSync } from 'fs';
import WebSocket from 'ws';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_FILE = 'data/deep-capture.json';

const captured = {
  capturedAt: new Date().toISOString(),
  pages: {},
  endpoints: {},
  totalRequests: 0,
};

let currentPage = 'unknown';
let requestMap = {};  // requestId → { method, url, postData }
let saveTimer = null;

function save() {
  writeFileSync(OUTPUT_FILE, JSON.stringify(captured, null, 2));
}

// Save every 3 seconds if there's new data
let lastSavedCount = 0;
setInterval(() => {
  if (captured.totalRequests > lastSavedCount) {
    save();
    lastSavedCount = captured.totalRequests;
  }
}, 3000);

async function getTarget() {
  const resp = await fetch(`${CDP_URL}/json`);
  const targets = await resp.json();
  const sophos = targets.find(t => t.url?.includes('sophos.com') && t.type === 'page');
  if (!sophos) throw new Error('No Sophos tab found');
  return sophos;
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return str; }
}

async function connect() {
  const target = await getTarget();
  console.log(`🔗 Connected: ${target.url}`);
  
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = {};

  function send(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      pending[id] = resolve;
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { delete pending[id]; resolve(null); }, 5000);
    });
  }

  ws.on('open', () => {
    send('Network.enable', { maxPostDataSize: 65536 });
    send('Page.enable');
    console.log('📡 Capturing... Navigate through Sophos Central pages.');
    console.log('   Script saves automatically. Press Ctrl+C when done.\n');
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.id && pending[msg.id]) {
      pending[msg.id](msg.result);
      delete pending[msg.id];
      return;
    }

    if (!msg.method) return;

    // Track navigation
    if (msg.method === 'Page.frameNavigated') {
      const url = msg.params?.frame?.url || '';
      if (url.includes('central.sophos.com')) {
        const path = url.replace(/https:\/\/[^/]+\/manage\//, '').split('?')[0];
        currentPage = path.replace(/\//g, '-') || 'root';
        console.log(`\n📄 Page: ${currentPage}`);
      }
    }

    // Track requests (capture method + POST body)
    if (msg.method === 'Network.requestWillBeSent') {
      const req = msg.params?.request;
      const reqId = msg.params?.requestId;
      if (req && reqId) {
        requestMap[reqId] = {
          method: req.method,
          url: req.url,
          postData: req.postData || null,
        };
      }
    }

    // Capture response
    if (msg.method === 'Network.responseReceived') {
      const resp = msg.params?.response;
      const reqId = msg.params?.requestId;
      const url = resp?.url || '';
      const status = resp?.status;
      const ct = resp?.headers?.['content-type'] || resp?.headers?.['Content-Type'] || '';

      if (!url.includes('sophos.com')) return;
      if (!ct.includes('json')) return;
      if (url.includes('.js') || url.includes('.css')) return;
      if (status !== 200 && status !== 201) return;

      const reqInfo = requestMap[reqId] || {};
      const httpMethod = reqInfo.method || 'GET';
      delete requestMap[reqId];

      send('Network.getResponseBody', { requestId: reqId }).then((result) => {
        if (!result?.body) return;

        let body;
        try { body = JSON.parse(result.body); } catch { return; }

        const cleanUrl = url.split('?')[0];
        const key = `${httpMethod} ${cleanUrl}`;

        // Store by page
        if (!captured.pages[currentPage]) captured.pages[currentPage] = [];
        captured.pages[currentPage].push({
          method: httpMethod,
          url: cleanUrl,
          fullUrl: url,
          status,
          bodySize: result.body.length,
          responseKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 20) : null,
          requestBody: reqInfo.postData ? tryParse(reqInfo.postData) : undefined,
        });

        // Store endpoint (keep largest response body)
        if (!captured.endpoints[key] || result.body.length > JSON.stringify(captured.endpoints[key].body).length) {
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

        const shortUrl = cleanUrl.replace(/https:\/\/[^/]+/, '').slice(0, 75);
        const sizeKB = (result.body.length / 1024).toFixed(1);
        console.log(`  ${httpMethod} ${shortUrl} (${sizeKB}KB)`);
      }).catch(() => {});
    }
  });

  ws.on('close', () => { save(); process.exit(0); });
  ws.on('error', (e) => { console.error('WS error:', e.message); });
}

process.on('SIGINT', () => {
  console.log('\n⏹️  Saving...');
  save();
  const eps = Object.keys(captured.endpoints).length;
  const pages = Object.keys(captured.pages).length;
  console.log(`💾 ${OUTPUT_FILE}: ${captured.totalRequests} calls, ${eps} endpoints, ${pages} pages`);
  process.exit(0);
});

connect().catch(e => { console.error('❌', e.message); process.exit(1); });
