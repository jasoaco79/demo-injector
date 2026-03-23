/**
 * Sophos Central API Discovery — via existing CDP Chrome session
 * 
 * Connects to the already-running Chrome (port 9222) that has
 * Sophos Central logged in. Navigates through key pages and
 * captures every API call.
 */

import { chromium } from '/home/jasoaco/Project Swordfish/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const CENTRAL_URL = 'https://central.sophos.com';

const PAGES = [
  { name: 'dashboard', path: '/manage/dashboard', wait: 8000 },
  { name: 'alerts', path: '/manage/alerts', wait: 6000 },
  { name: 'devices-computers', path: '/manage/devices/computers', wait: 6000 },
  { name: 'devices-servers', path: '/manage/devices/servers', wait: 6000 },
  { name: 'endpoint-policies', path: '/manage/endpoint-protection/policies', wait: 5000 },
  { name: 'firewall-management', path: '/manage/firewall', wait: 6000 },
  { name: 'threat-analysis-detections', path: '/manage/threat-analysis-center/detections', wait: 8000 },
  { name: 'threat-analysis-cases', path: '/manage/threat-analysis-center/cases', wait: 8000 },
  { name: 'xdr-live-discover', path: '/manage/threat-analysis-center/live-discover', wait: 6000 },
  { name: 'account-health', path: '/manage/account-health-check', wait: 6000 },
  { name: 'global-settings', path: '/manage/config', wait: 5000 },
  { name: 'people', path: '/manage/people', wait: 5000 },
  { name: 'logs-audit', path: '/manage/logs/audit', wait: 5000 },
];

async function main() {
  console.log('🔍 Sophos Central API Discovery (via CDP)\n');
  
  // Connect to existing Chrome
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  console.log(`   Connected to Chrome (${browser.contexts().length} contexts)\n`);

  // Find or create a page
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
    // Use first context, open new page
    const ctx = browser.contexts()[0];
    page = await ctx.newPage();
    await page.goto(`${CENTRAL_URL}/manage/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(5000);
  }

  // Check if logged in
  const currentUrl = page.url();
  console.log(`   Current page: ${currentUrl}`);
  if (currentUrl.includes('login')) {
    console.log('   ❌ Not logged into Sophos Central. Please log in manually in Chrome first.');
    return;
  }
  console.log('   ✅ Logged into Sophos Central\n');

  // Capture all API calls
  const allRequests = [];

  const captureResponse = async (response) => {
    const url = response.url();
    const method = response.request().method();

    // Skip static assets, analytics, etc.
    if (url.includes('google-analytics') || url.includes('googlesyndication') ||
        url.includes('go-mpulse') || url.includes('doubleclick') ||
        url.includes('.js') || url.includes('.css') || url.includes('.png') ||
        url.includes('.svg') || url.includes('.woff') || url.includes('.ico') ||
        url.includes('fonts.') || url.includes('cdn.') ||
        url.includes('sentry.io') || url.includes('launchdarkly')) {
      return;
    }

    // Only capture API-like calls from Sophos domains
    if (!url.includes('sophos.com') && !url.includes('sophosapis.com')) return;

    let body = null;
    let bodySize = 0;
    try {
      const text = await response.text();
      bodySize = text.length;
      try { body = JSON.parse(text); } catch { if (text.length < 2000) body = text; }
    } catch {}

    allRequests.push({
      url: url.split('?')[0],
      fullUrl: url,
      queryParams: url.includes('?') ? url.split('?')[1] : '',
      method,
      status: response.status(),
      contentType: response.headers()['content-type'] || '',
      bodySize,
      sampleResponse: body ? (typeof body === 'object' ? truncateObj(body, 3) : (typeof body === 'string' ? body.slice(0, 1000) : body)) : null,
      responseKeys: body && typeof body === 'object' ? getTopKeys(body) : null,
      timestamp: new Date().toISOString(),
    });
  };

  page.on('response', captureResponse);

  // Navigate through pages
  for (const pg of PAGES) {
    console.log(`📄 ${pg.name} (${pg.path})...`);
    const beforeCount = allRequests.length;

    try {
      await page.goto(`${CENTRAL_URL}${pg.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(pg.wait);

      // Scroll to trigger lazy loads
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      // Screenshot
      await page.screenshot({ path: join(DATA_DIR, `page-${pg.name}.png`) });

      const newCalls = allRequests.length - beforeCount;
      console.log(`   ✅ ${newCalls} API calls captured`);

      // Tag calls with the page
      for (let i = beforeCount; i < allRequests.length; i++) {
        allRequests[i].page = pg.name;
      }
    } catch (err) {
      console.log(`   ❌ ${err.message}`);
    }
  }

  // Remove listener
  page.removeListener('response', captureResponse);

  // ─── Analyze ──────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('📊 API Discovery Results');
  console.log('═══════════════════════════════════════════════════\n');

  // Deduplicate
  const uniqueEndpoints = {};
  for (const req of allRequests) {
    const key = `${req.method} ${req.url}`;
    if (!uniqueEndpoints[key]) {
      uniqueEndpoints[key] = { ...req, count: 1, pages: [req.page].filter(Boolean) };
    } else {
      uniqueEndpoints[key].count++;
      if (req.page && !uniqueEndpoints[key].pages.includes(req.page)) {
        uniqueEndpoints[key].pages.push(req.page);
      }
      // Keep larger response sample
      if (req.bodySize > uniqueEndpoints[key].bodySize) {
        uniqueEndpoints[key].sampleResponse = req.sampleResponse;
        uniqueEndpoints[key].bodySize = req.bodySize;
        uniqueEndpoints[key].responseKeys = req.responseKeys;
      }
    }
  }

  const endpoints = Object.values(uniqueEndpoints).sort((a, b) => b.count - a.count);

  console.log(`Total API calls: ${allRequests.length}`);
  console.log(`Unique endpoints: ${endpoints.length}`);
  console.log(`Pages visited: ${PAGES.length}\n`);

  // Group by domain
  const byDomain = {};
  for (const ep of endpoints) {
    const domain = new URL(ep.url).hostname;
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(ep);
  }

  for (const [domain, eps] of Object.entries(byDomain).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n─── ${domain} (${eps.length} endpoints) ───\n`);
    for (const ep of eps.slice(0, 20)) {
      console.log(`  ${ep.method.padEnd(6)} ${ep.url.replace(`https://${domain}`, '')}`);
      console.log(`         ${ep.count}x | ${ep.status} | ${formatBytes(ep.bodySize)} | pages: ${ep.pages.join(', ')}`);
      if (ep.responseKeys) {
        console.log(`         keys: { ${ep.responseKeys.join(', ')} }`);
      }
      console.log('');
    }
  }

  // Save
  writeFileSync(join(DATA_DIR, 'api-discovery.json'), JSON.stringify({
    discoveredAt: new Date().toISOString(),
    totalCalls: allRequests.length,
    uniqueEndpoints: endpoints.length,
    domains: Object.keys(byDomain),
    endpoints,
    rawCalls: allRequests,
  }, null, 2));

  writeFileSync(join(DATA_DIR, 'api-summary.json'), JSON.stringify(
    endpoints.map(ep => ({
      method: ep.method, url: ep.url, count: ep.count, status: ep.status,
      bodySize: ep.bodySize, pages: ep.pages, responseKeys: ep.responseKeys,
      queryParams: ep.queryParams,
    })), null, 2));

  // Save interceptable endpoints (the ones we'd modify for demos)
  const interceptable = endpoints.filter(ep =>
    ep.status === 200 && ep.bodySize > 50 && ep.responseKeys &&
    !ep.url.includes('login') && !ep.url.includes('auth') &&
    !ep.url.includes('config.json')
  );
  writeFileSync(join(DATA_DIR, 'interceptable-endpoints.json'), JSON.stringify(interceptable, null, 2));

  console.log(`\n💾 Saved:`);
  console.log(`   data/api-discovery.json (full details + sample responses)`);
  console.log(`   data/api-summary.json (compact summary)`);
  console.log(`   data/interceptable-endpoints.json (${interceptable.length} endpoints suitable for demo injection)`);
  console.log(`   data/page-*.png (${PAGES.length} screenshots)`);
}

// ─── Helpers ────────────────────────────────────────────────────────────

function truncateObj(obj, maxDepth, depth = 0) {
  if (depth >= maxDepth) return '[...]';
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [];
    return [truncateObj(obj[0], maxDepth, depth + 1), `...(${obj.length} total)`];
  }
  if (typeof obj === 'object' && obj !== null) {
    const result = {};
    const keys = Object.keys(obj).slice(0, 20);
    for (const key of keys) result[key] = truncateObj(obj[key], maxDepth, depth + 1);
    if (Object.keys(obj).length > 20) result['...'] = `${Object.keys(obj).length - 20} more`;
    return result;
  }
  if (typeof obj === 'string' && obj.length > 300) return obj.slice(0, 300) + '...';
  return obj;
}

function getTopKeys(obj) {
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object') return [`[${obj.length} items] → { ${Object.keys(obj[0]).slice(0, 8).join(', ')} }`];
    return [`[array of ${obj.length}]`];
  }
  if (typeof obj === 'object' && obj !== null) return Object.keys(obj).slice(0, 12);
  return [typeof obj];
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
