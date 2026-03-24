/**
 * Deep API Capture — Phase 3A
 * 
 * Records every API call as the user navigates through specific Sophos Central pages.
 * Unlike the initial discovery (automated), this one is manual — the user navigates
 * and this script captures everything in real-time.
 *
 * Usage:
 *   node scripts/deep-capture.mjs
 *   Then navigate through Sophos Central pages in Chrome.
 *   Press Ctrl+C when done — saves to data/deep-capture.json
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';
import WebSocket from 'ws';

const CDP_URL = 'http://localhost:9222';
const OUTPUT_FILE = 'data/deep-capture.json';

// ─── State ───────────────────────────────────────────────────────────
const captured = {
  capturedAt: new Date().toISOString(),
  pages: {},       // { pageName: [{ method, url, status, body, requestBody, headers }] }
  endpoints: {},   // { "METHOD url": { body, count, pages } }
  totalRequests: 0,
};

let currentPage = 'unknown';
let requestBodies = {};  // requestId → POST body

// ─── Connect to Chrome ───────────────────────────────────────────────
async function getTarget() {
  const resp = await fetch(`${CDP_URL}/json`);
  const targets = await resp.json();
  // Find the Sophos Central tab
  const sophos = targets.find(t => t.url?.includes('central.sophos.com') && t.type === 'page');
  if (!sophos) {
    console.log('Available targets:');
    targets.filter(t => t.type === 'page').forEach(t => console.log(' ', t.url));
    throw new Error('No Sophos Central tab found. Navigate to central.sophos.com first.');
  }
  return sophos;
}

async function connect() {
  const target = await getTarget();
  console.log(`🔗 Connecting to: ${target.url}`);
  
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = {};
  
  ws.on('open', () => {
    console.log('✅ Connected to Chrome DevTools');
    
    // Enable Network domain
    send('Network.enable', { maxPostDataSize: 65536 });
    
    // Enable Page domain for navigation tracking
    send('Page.enable');
    
    console.log('');
    console.log('📡 Capturing API calls. Navigate through Sophos Central:');
    console.log('');
    console.log('   Suggested pages to visit:');
    console.log('   1. Dashboard (main overview)');
    console.log('   2. Click into a Case → all tabs (Overview, Detections, Notebook, History, Respond)');
    console.log('   3. Threat Graphs → open one');
    console.log('   4. Devices → Computers → click into a device');
    console.log('   5. Detections list');
    console.log('   6. Live Discover → run a query');
    console.log('   7. Alerts page');
    console.log('   8. Account Health Check');
    console.log('');
    console.log('   Press Ctrl+C when done to save.');
    console.log('');
  });

  function send(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve) => {
      pending[id] = resolve;
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    
    // Handle responses
    if (msg.id && pending[msg.id]) {
      pending[msg.id](msg.result);
      delete pending[msg.id];
      return;
    }

    // Handle events
    if (!msg.method) return;

    // Track page navigation
    if (msg.method === 'Page.frameNavigated') {
      const url = msg.params?.frame?.url || '';
      if (url.includes('central.sophos.com/manage/')) {
        const path = url.replace(/https:\/\/central\.sophos\.com\/manage\//, '');
        currentPage = path.split('?')[0].replace(/\//g, '-') || 'dashboard';
        console.log(`\n📄 Page: ${currentPage}`);
      }
    }

    // Capture request bodies (for POSTs)
    if (msg.method === 'Network.requestWillBeSent') {
      const req = msg.params?.request;
      const reqId = msg.params?.requestId;
      if (req?.postData && reqId) {
        requestBodies[reqId] = req.postData;
      }
    }

    // Capture responses
    if (msg.method === 'Network.responseReceived') {
      const resp = msg.params?.response;
      const reqId = msg.params?.requestId;
      const url = resp?.url || '';
      const status = resp?.status;
      const contentType = resp?.headers?.['content-type'] || resp?.headers?.['Content-Type'] || '';

      // Only capture JSON API calls to Sophos domains
      if (!url.includes('sophos.com')) return;
      if (!contentType.includes('json') && !contentType.includes('javascript')) return;
      if (url.includes('.js') || url.includes('.css') || url.includes('.png')) return;
      if (status !== 200 && status !== 201) return;

      // Get response body
      send('Network.getResponseBody', { requestId: reqId }).then((result) => {
        if (!result?.body) return;

        let body;
        try { body = JSON.parse(result.body); } catch { return; }

        const method = msg.params?.type === 'XHR' || msg.params?.type === 'Fetch' ? 'GET' : 'GET';
        // Determine method from request
        const reqBody = requestBodies[reqId];
        const httpMethod = reqBody ? 'POST' : 'GET';
        delete requestBodies[reqId];

        // Strip query params for key
        const cleanUrl = url.split('?')[0];
        const key = `${httpMethod} ${cleanUrl}`;

        // Store in pages
        if (!captured.pages[currentPage]) captured.pages[currentPage] = [];
        captured.pages[currentPage].push({
          method: httpMethod,
          url: cleanUrl,
          fullUrl: url,
          status,
          bodySize: result.body.length,
          responseKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 20) : null,
          requestBody: reqBody ? tryParse(reqBody) : undefined,
        });

        // Store in endpoints (full body, deduplicated)
        if (!captured.endpoints[key]) {
          captured.endpoints[key] = {
            body,
            bodySize: result.body.length,
            count: 0,
            pages: [],
            requestBody: reqBody ? tryParse(reqBody) : undefined,
          };
        }
        captured.endpoints[key].count++;
        if (!captured.endpoints[key].pages.includes(currentPage)) {
          captured.endpoints[key].pages.push(currentPage);
        }

        captured.totalRequests++;

        // Log it
        const shortUrl = cleanUrl.replace(/https:\/\/[^/]+/, '').slice(0, 70);
        const sizeKB = (result.body.length / 1024).toFixed(1);
        console.log(`  ${httpMethod} ${shortUrl} (${sizeKB}KB)`);

      }).catch(() => {});
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });

  ws.on('close', () => {
    console.log('Connection closed');
    save();
  });
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return str; }
}

function save() {
  const endpointCount = Object.keys(captured.endpoints).length;
  const pageCount = Object.keys(captured.pages).length;
  
  writeFileSync(OUTPUT_FILE, JSON.stringify(captured, null, 2));
  console.log(`\n💾 Saved to ${OUTPUT_FILE}`);
  console.log(`   ${captured.totalRequests} total API calls`);
  console.log(`   ${endpointCount} unique endpoints`);
  console.log(`   ${pageCount} pages visited`);
  
  // Summary
  console.log('\n📊 Endpoints by page:');
  for (const [page, calls] of Object.entries(captured.pages)) {
    console.log(`   ${page}: ${calls.length} calls`);
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Stopping capture...');
  save();
  process.exit(0);
});

// ─── Check for ws dependency ─────────────────────────────────────────
async function ensureWs() {
  try {
    await import('ws');
  } catch {
    console.log('Installing ws package...');
    const { execSync } = await import('child_process');
    execSync('npm install ws', { cwd: process.cwd(), stdio: 'inherit' });
  }
}

// ─── Main ────────────────────────────────────────────────────────────
try {
  await connect();
} catch (err) {
  console.error('❌', err.message);
  process.exit(1);
}
