/**
 * Capture FULL API responses (no truncation) for key demo endpoints.
 * Connects to CDP Chrome on port 9222.
 */

import { chromium } from '/home/jasoaco/Project Swordfish/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const CENTRAL_URL = 'https://central.sophos.com';

// Key pages to visit
const PAGES = [
  { name: 'dashboard', path: '/manage/dashboard', wait: 10000 },
  { name: 'alerts', path: '/manage/alerts', wait: 8000 },
  { name: 'devices-computers', path: '/manage/devices/computers', wait: 8000 },
  { name: 'devices-servers', path: '/manage/devices/servers', wait: 8000 },
  { name: 'threat-analysis-detections', path: '/manage/threat-analysis-center/detections', wait: 10000 },
  { name: 'threat-analysis-cases', path: '/manage/threat-analysis-center/cases', wait: 10000 },
  { name: 'account-health', path: '/manage/account-health-check', wait: 8000 },
];

// Endpoints we care about for demo scenarios — capture FULL responses
const INTERESTING_PATTERNS = [
  'alerts/retrieve',
  'reports/endpoints',
  'dashboard-manager',
  'ews-query/v1/attacks',
  'account-health-check',
  'billing/account',
  'sessions/current',
  'users/current',
  'detections',
  'cases/v1/cases',
  'user-devices',
  'servers',
  'email/v1/statistics',
  'mobile-admin/reports',
  'evaluation-mode',
  'license/usage',
  'features',
  'xgemail',
];

async function main() {
  console.log('🔍 Full API Response Capture\n');

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  console.log(`Connected to Chrome (${browser.contexts().length} contexts)\n`);

  // Find existing Sophos page
  let page = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().includes('sophos')) {
        page = p;
        break;
      }
    }
    if (page) break;
  }

  if (!page) {
    const ctx = browser.contexts()[0];
    page = await ctx.newPage();
    await page.goto(`${CENTRAL_URL}/manage/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
  }

  const currentUrl = page.url();
  console.log(`Current page: ${currentUrl}`);
  if (currentUrl.includes('login')) {
    console.log('❌ Not logged in. Please log in manually first.');
    return;
  }
  console.log('✅ Logged in\n');

  // Capture full responses
  const fullResponses = {};

  const captureResponse = async (response) => {
    const url = response.url();
    const method = response.request().method();

    // Skip static assets
    if (url.match(/\.(js|css|png|svg|woff|woff2|ico|gif|jpg|jpeg)(\?|$)/)) return;
    if (url.includes('google-analytics') || url.includes('sentry.io') || url.includes('launchdarkly')) return;

    // Only capture if it matches our interesting patterns
    const isInteresting = INTERESTING_PATTERNS.some(p => url.includes(p));
    if (!isInteresting) return;

    try {
      const text = await response.text();
      if (!text || text.length < 10) return;

      let body;
      try { body = JSON.parse(text); } catch { return; }

      const key = `${method} ${url.split('?')[0]}`;
      
      // Keep the largest response for each endpoint
      if (!fullResponses[key] || text.length > JSON.stringify(fullResponses[key].body).length) {
        fullResponses[key] = {
          method,
          url: url.split('?')[0],
          fullUrl: url,
          status: response.status(),
          bodySize: text.length,
          body,  // FULL response, no truncation
          capturedAt: new Date().toISOString(),
        };
      }
    } catch (e) {
      // Response body not available (e.g., streaming)
    }
  };

  page.on('response', captureResponse);

  for (const pg of PAGES) {
    console.log(`📄 ${pg.name}...`);
    const before = Object.keys(fullResponses).length;

    try {
      await page.goto(`${CENTRAL_URL}${pg.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(pg.wait);

      // Scroll to trigger lazy loads
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1000);

      const after = Object.keys(fullResponses).length;
      console.log(`   ✅ ${after - before} new endpoints captured (${after} total)`);

      // Tag with page
      for (const [key, val] of Object.entries(fullResponses)) {
        if (!val.pages) val.pages = [];
        if (!val.pages.includes(pg.name)) val.pages.push(pg.name);
      }
    } catch (err) {
      console.log(`   ❌ ${err.message}`);
    }
  }

  page.removeListener('response', captureResponse);

  // Save
  const output = {
    capturedAt: new Date().toISOString(),
    endpointCount: Object.keys(fullResponses).length,
    endpoints: fullResponses,
  };

  writeFileSync(join(DATA_DIR, 'full-responses.json'), JSON.stringify(output, null, 2));

  console.log(`\n💾 Saved data/full-responses.json`);
  console.log(`   ${Object.keys(fullResponses).length} endpoints with FULL response bodies\n`);

  // Summary
  for (const [key, val] of Object.entries(fullResponses).sort((a, b) => b[1].bodySize - a[1].bodySize)) {
    const sizeKB = (val.bodySize / 1024).toFixed(1);
    console.log(`  ${key.padEnd(80)} ${sizeKB}KB`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
