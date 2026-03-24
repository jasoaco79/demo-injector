/**
 * Sophos Demo Scenario Builder — Server
 * 
 * Serves the intake form and generates scenario JSON via LLM.
 * 
 * Supported LLM backends (auto-detected in priority order):
 *   1. Pi SDK (OAuth — uses Claude Max subscription)
 *   2. Anthropic API (ANTHROPIC_API_KEY)
 *   3. OpenAI API (OPENAI_API_KEY)
 *   4. Local LLM (LLM_BASE_URL — LM Studio, Ollama, etc.)
 * 
 * See server/llm.mjs for configuration details.
 */

import { createServer } from 'http';
import { readFile, readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';
import { initLLM, getLLM, setLLM, testLLM, generate, generateStream } from './llm.mjs';
import { randomBytes, createHash } from 'crypto';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3847;

// ─── Initialize LLM Provider ────────────────────────────────────────
const llm = await initLLM();

// ─── Settings Persistence ────────────────────────────────────────────
const SETTINGS_PATH = join(__dirname, '..', '.settings.json');
const SERVER_START = Date.now();

function loadSettings() {
  try {
    if (existsSync(SETTINGS_PATH)) return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {}
  return {};
}

function saveSettings(data) {
  const current = loadSettings();
  const merged = { ...current, ...data };
  writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// ─── Auth ────────────────────────────────────────────────────────────
const DEFAULT_PASSCODE = 'Sophos2026!';
const sessions = new Map(); // token → { created, ip }

function getPasscode() {
  const settings = loadSettings();
  return settings.passcode || DEFAULT_PASSCODE;
}

function hashPasscode(passcode) {
  return createHash('sha256').update(passcode).digest('hex');
}

function createSession(ip) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { created: Date.now(), ip });
  // Expire sessions after 24 hours
  setTimeout(() => sessions.delete(token), 24 * 60 * 60 * 1000);
  return token;
}

function getSessionToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)sophos_demo_session=([a-f0-9]+)/);
  return match ? match[1] : null;
}

function isAuthenticated(req) {
  const token = getSessionToken(req);
  return token && sessions.has(token);
}

function setSessionCookie(res, token, req) {
  const secure = (req?.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sophos_demo_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`);
}

function clearSessionCookie(res, req) {
  const secure = (req?.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sophos_demo_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

// Public paths that don't require auth
const PUBLIC_PATHS = ['/login.html', '/api/login', '/sophos-logo.svg', '/og-image.png'];

function isPublicPath(url) {
  const path = url.split('?')[0];
  return PUBLIC_PATHS.some(p => path === p);
}

// ─── Load Schema + Examples ──────────────────────────────────────────
const SCHEMA_MD = readFileSync(join(__dirname, '../../extension/scenarios/SCHEMA.md'), 'utf8');
const RANSOMWARE_EXAMPLE = readFileSync(join(__dirname, '../../extension/scenarios/ransomware.json'), 'utf8');

// ─── System Prompts ──────────────────────────────────────────────────
const SCENARIO_SYSTEM_PROMPT = `You are a Sophos Central demo scenario generator for Sales Engineers.

Your job: take demo requirements from an SE and produce a valid scenario JSON file that the Sophos Central Demo Mode Chrome extension can load.

## CRITICAL RULES

1. Output ONLY valid JSON. No markdown, no code fences, no explanation. Just the JSON object.
2. Every field must match the exact schema. The Chrome extension will ignore unknown fields and crash on wrong types.
3. Use template variables: {{customerName}}, {{endpointCount}}, {{serverCount}}, {{customerDomain}} — these are resolved at runtime from the popup settings.
4. Use relative timestamps: -3m, -2h, -1d, now — these are resolved at runtime so alerts always look fresh.
5. Use "auto" for UUIDs and IDs — the extension generates them.
6. alerts.summaryDelta must match the count of alerts by severity in alerts.items.
7. For MDR scenarios, set cases.items[].managedBy to "mtr" and assignee to "Sophos MDR Team".
8. MITRE ATT&CK IDs must be real. Use correct tactic/technique IDs.
9. Hostnames should be realistic for the industry (e.g., HIS-SERVER for healthcare, POS-TERM for retail).
10. The "description" field on alerts is what the SE reads aloud during the demo. Make it clear and compelling.

## SCHEMA REFERENCE

${SCHEMA_MD}

## EXAMPLE SCENARIO (use this as a structural reference)
${RANSOMWARE_EXAMPLE}

## INDUSTRY-SPECIFIC GUIDANCE

**Healthcare:** HIPAA focus, patient data, EHR systems, medical devices, hostnames like HIS-SRV, PACS-WKS, RX-STATION
**Finance:** PCI-DSS, trading systems, customer financial data, hostnames like TRADE-WKS, ATM-SRV, SWIFT-GW
**Manufacturing:** OT/ICS systems, production line, SCADA, hostnames like HMI-STATION, PLC-GW, MES-SRV
**Education:** Student data, FERPA, research data, hostnames like LAB-PC, ADMIN-WKS, SIS-SRV
**Retail:** POS systems, customer data, e-commerce, hostnames like POS-TERM, ECOM-SRV, INV-WKS
**Government:** Classified data, citizen PII, hostnames like SECURE-WKS, AGENCY-SRV, CAC-TERM
**Legal:** Client privilege, case files, hostnames like ATTY-WKS, DOC-SRV, CASE-MGR

## THREAT ACTOR REFERENCE

Use real threat names and MITRE techniques:

**Ransomware families:** LockBit 3.0, BlackCat/ALPHV, Cl0p, Royal, Play, Black Basta, Akira, Medusa, 8Base, Rhysida
**APT groups:** APT29 (Cozy Bear), APT28 (Fancy Bear), Lazarus Group, TA505, FIN7, Sandworm
**Initial access:** Phishing (T1566), Exploit Public App (T1190), Drive-by (T1189), Valid Accounts (T1078), Supply Chain (T1195)
**Execution:** PowerShell (T1059.001), WMI (T1047), Scheduled Task (T1053.005)
**Persistence:** Registry Run Keys (T1547.001), Scheduled Task (T1053.005), DLL Side-Loading (T1574.002)
**Lateral Movement:** SMB (T1021.002), RDP (T1021.001), Pass the Hash (T1550.002), WinRM (T1021.006)
**Exfiltration:** C2 Channel (T1041), Web Service (T1567), Encrypted Channel (T1573)
**Impact:** Data Encrypted (T1486), Inhibit Recovery (T1490), Data Destruction (T1485)`;

const BATTLE_CARD_SYSTEM_PROMPT = `You are a Sophos competitive intelligence analyst. Generate a battle card for an SE going up against a specific competitor.

Output a markdown document with:
1. **COMPETITOR OVERVIEW** — 2-3 sentences on their product and market position
2. **WHERE SOPHOS WINS** — 5-7 specific differentiators with one-liner explanations
3. **WHERE THEY COMPETE** — 2-3 areas where the competitor is strong (be honest)
4. **COMMON OBJECTIONS & RESPONSES** — 5-8 "If they say X, you say Y" pairs. Make responses specific and data-driven, not generic marketing.
5. **KILLER QUESTIONS** — 3-5 questions the SE should ask the prospect that expose competitor weaknesses
6. **PRICING POSITIONING** — How to frame Sophos pricing vs the competitor

Be specific, honest, and practical. SEs can smell marketing BS. Use real product differences, not buzzwords.
Reference the specific scenario being demoed so responses are contextual.`;

const POST_DEMO_REPORT_SYSTEM_PROMPT = `You are a Sophos SE assistant. Generate a professional follow-up email after a demo.

Output a well-formatted email with:
1. **Subject line** — specific to what was shown, not generic
2. **Opening** — reference the specific scenario and what impressed the prospect
3. **Key highlights** — 3-5 bullet points of what was demonstrated, with specific data points from the scenario
4. **Next steps** — clear call to action (POC, technical deep dive, pricing discussion)
5. **Attached resources** — suggest relevant Sophos materials to send

Tone: professional but warm. First-person from the SE. Not salesy — consultative.
Keep it under 300 words. The prospect should be able to read it in 60 seconds.`;

const REMIX_SYSTEM_PROMPT = `You are a Sophos Central demo scenario generator. You are REMIXING an existing scenario for a new customer.

You will receive:
1. The original scenario JSON
2. What needs to change (new customer, industry, threat actor, etc.)

Your job: modify the scenario to match the new requirements while keeping the overall structure and quality intact.

## CRITICAL RULES
1. Output ONLY valid JSON. No markdown, no code fences, no explanation.
2. Keep all fields that don't need to change.
3. Update hostnames, usernames, departments, and file paths to match the new industry.
4. Update MITRE techniques if the threat actor changed.
5. Keep template variables: {{customerName}}, {{endpointCount}}, etc.
6. Keep relative timestamps (-3m, -2h, etc.)
7. Keep "auto" for UUID/ID fields.`;

const DEMO_SCRIPT_SYSTEM_PROMPT = `You are a Sophos SE demo coach. Generate a step-by-step demo talk track for a Sophos Central demo.

Output a markdown document with:
1. A 1-paragraph OPENING HOOK (what to say to set the scene)
2. Step-by-step WALKTHROUGH: each step has a PAGE to navigate to, WHAT TO SHOW, and WHAT TO SAY (exact words in quotes)
3. Key TALKING POINTS to hit at each step
4. OBJECTION HANDLERS for common prospect questions
5. A CLOSING statement

Make the talk track natural and conversational — not robotic. The SE should sound like they're telling a story, not reading a script.
Keep it practical — 15-20 minutes total demo time.
Reference specific data from the scenario (alert names, hostnames, MITRE techniques, health scores).`;


// ─── Generate Scenario ───────────────────────────────────────────────
async function generateScenario(formData) {
  const userPrompt = buildUserPrompt(formData);
  const responseText = await generate(SCENARIO_SYSTEM_PROMPT, userPrompt);

  // Extract JSON from response
  let json = responseText.trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const scenario = JSON.parse(json);

  // Ensure required fields
  if (!scenario.id) scenario.id = 'custom-' + Date.now();
  if (!scenario.version) scenario.version = 1;
  if (!scenario.createdAt) scenario.createdAt = new Date().toISOString();

  return scenario;
}

function buildUserPrompt(form) {
  let prompt = `Generate a Sophos Central demo scenario JSON with these requirements:\n\n`;

  prompt += `## Customer\n`;
  prompt += `- Company: ${form.customerName}\n`;
  prompt += `- Industry: ${form.industry}\n`;
  prompt += `- Endpoints: ${form.endpointCount}\n`;
  prompt += `- Servers: ${form.serverCount}\n`;
  if (form.products) prompt += `- Sophos Products: ${form.products}\n`;
  prompt += `\n`;

  prompt += `## Scenario Type\n`;
  prompt += `- Base scenario: ${form.scenarioType}\n`;
  if (form.threatActor) prompt += `- Threat actor/malware: ${form.threatActor}\n`;
  if (form.entryPoint) prompt += `- Entry point: ${form.entryPoint}\n`;
  if (form.hostsAffected) prompt += `- Hosts affected: ${form.hostsAffected}\n`;
  if (form.department) prompt += `- Department targeted: ${form.department}\n`;
  if (form.mdrResponse) prompt += `- MDR involvement: ${form.mdrResponse}\n`;
  prompt += `\n`;

  if (form.storyDescription) {
    prompt += `## Custom Story\n${form.storyDescription}\n\n`;
  }

  if (form.demoFocus) {
    prompt += `## Demo Focus\n`;
    prompt += `- Products to highlight: ${form.demoFocus}\n`;
    if (form.talkingPoints) prompt += `- Key talking points: ${form.talkingPoints}\n`;
    if (form.competitor) prompt += `- Competitor comparison: ${form.competitor}\n`;
    prompt += `\n`;
  }

  prompt += `## Requirements\n`;
  prompt += `- Generate realistic alerts (3-6 depending on scenario complexity)\n`;
  prompt += `- Include at least 1 case with proper MITRE ATT&CK mapping\n`;
  prompt += `- Include 2-4 detections with realistic rawData (command lines, file paths, etc.)\n`;
  prompt += `- Set health score appropriate to the scenario\n`;
  prompt += `- Use {{customerName}}, {{endpointCount}}, {{serverCount}}, {{customerDomain}} templates\n`;
  prompt += `- Use relative timestamps (-3m, -2h, etc.) so data looks fresh\n`;
  prompt += `- Use "auto" for all UUID/ID fields\n`;
  prompt += `- Make alert descriptions compelling — the SE reads them aloud during the demo\n`;
  prompt += `- Include caseDetail.extraActivities with 3-5 timeline entries showing the investigation/response story\n`;
  prompt += `- Include threatGraphs.stacCases with a matching threat graph entry\n`;
  prompt += `- Include auditLogs with 3-5 admin/system actions matching the scenario story (device isolations, credential resets, firewall rules, etc.)\n`;
  prompt += `- Include liveDiscover.queryResults with a realistic XDR query and 4-6 result rows showing suspicious processes/activity\n`;

  if (form.includeEmail || form.scenarioType === 'phishing') {
    prompt += `- Include emailHistory.messages with 5 sample emails (mix of BLOCKED, QUARANTINED, DELIVERED) and emailHistory.quarantine with 3 quarantined items\n`;
  }

  if (form.scenarioType === 'mdr' || form.mdrResponse === 'yes') {
    prompt += `- Set cases managedBy to "mtr" and assignee to "Sophos MDR Team"\n`;
    prompt += `- Include MDR action alerts (device isolation, credential reset, etc.)\n`;
    prompt += `- Case status should be "containment" or "investigating"\n`;
  }

  if (form.includeEmail) {
    prompt += `- Include emailStats override with realistic email security numbers\n`;
  }

  return prompt;
}


// ─── Industry Presets ────────────────────────────────────────────────
const INDUSTRY_PRESETS = {
  healthcare: { hostnames: ['HIS-SRV', 'PACS-WKS', 'RX-STATION', 'EHR-DB', 'NURSING-WKS', 'LAB-PC', 'RADIOLOGY-WKS', 'BILLING-WS'], departments: ['Radiology', 'Nursing', 'Billing', 'Pharmacy', 'IT', 'Administration', 'Lab'], users: ['sarah.chen', 'dr.patel', 'nurse.williams', 'admin.garcia', 'rx.johnson'], compliance: 'HIPAA', dataTypes: 'patient records, PHI, medical imaging' },
  finance: { hostnames: ['TRADE-WKS', 'ATM-SRV', 'SWIFT-GW', 'RISK-DB', 'COMPLY-WKS', 'TREASURY-PC', 'AUDIT-WKS'], departments: ['Trading', 'Treasury', 'Compliance', 'Risk', 'IT', 'Operations'], users: ['trader.smith', 'cfo.martinez', 'risk.analyst', 'auditor.jones'], compliance: 'PCI-DSS, SOX', dataTypes: 'financial transactions, customer PII, trading data' },
  manufacturing: { hostnames: ['HMI-STATION', 'PLC-GW', 'MES-SRV', 'SCADA-WKS', 'ERP-DB', 'QC-STATION', 'ENGR-WKS'], departments: ['Production', 'Engineering', 'Quality', 'IT', 'Maintenance', 'Supply Chain'], users: ['eng.kumar', 'ops.wilson', 'maint.brown', 'qa.davis'], compliance: 'IEC 62443, NIST', dataTypes: 'production data, SCADA systems, trade secrets' },
  education: { hostnames: ['LAB-PC', 'ADMIN-WKS', 'SIS-SRV', 'LMS-DB', 'LIBRARY-WKS', 'RESEARCH-WKS'], departments: ['IT Services', 'Administration', 'Research', 'Library', 'Student Affairs'], users: ['prof.anderson', 'admin.taylor', 'student.kim', 'it.harris'], compliance: 'FERPA', dataTypes: 'student records, research data, financial aid' },
  retail: { hostnames: ['POS-TERM', 'ECOM-SRV', 'INV-WKS', 'WMS-DB', 'STORE-MGR', 'LOYALTY-SRV'], departments: ['Point of Sale', 'E-Commerce', 'Inventory', 'IT', 'Marketing'], users: ['store.mgr', 'ecom.admin', 'inv.specialist'], compliance: 'PCI-DSS', dataTypes: 'customer payment data, loyalty information, inventory' },
  government: { hostnames: ['SECURE-WKS', 'AGENCY-SRV', 'CAC-TERM', 'RECORDS-DB', 'PORTAL-SRV'], departments: ['IT Security', 'Records', 'Public Affairs', 'Legal', 'Administration'], users: ['analyst.doe', 'admin.smith', 'dir.johnson'], compliance: 'FISMA, FedRAMP', dataTypes: 'citizen PII, classified documents, case files' },
  legal: { hostnames: ['ATTY-WKS', 'DOC-SRV', 'CASE-MGR', 'EDISCOVERY-DB', 'BILLING-WKS'], departments: ['Litigation', 'Corporate', 'Compliance', 'IT', 'Billing'], users: ['atty.williams', 'paralegal.jones', 'partner.chen'], compliance: 'attorney-client privilege', dataTypes: 'case files, client communications, billing records' },
};


// ─── HTTP Server ─────────────────────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  // CORS: use specific origin (not *) so browsers allow cookie storage
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── Auth: Login endpoint (handles both JSON and form-encoded) ─────
  if (req.method === 'POST' && (req.url === '/api/login' || req.url.startsWith('/api/login?'))) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let passcode = null;
      const contentType = req.headers['content-type'] || '';
      try {
        if (contentType.includes('application/json')) {
          passcode = JSON.parse(body).passcode;
        } else {
          // form-encoded fallback
          passcode = new URLSearchParams(body).get('passcode');
        }
      } catch (err) {
        console.log(`🔒 Login parse error: ${err.message}`);
      }

      console.log(`🔑 Login attempt: received="${passcode}" expected="${getPasscode()}" match=${passcode === getPasscode()} content-type="${contentType}"`);

      if (passcode && passcode === getPasscode()) {
        const token = createSession(req.socket.remoteAddress);
        setSessionCookie(res, token, req);
        console.log(`🔓 Login successful from ${req.socket.remoteAddress}`);

        // If it was a form POST (not JSON), redirect to home
        if (!contentType.includes('application/json')) {
          const next = new URLSearchParams(req.url.split('?')[1] || '').get('next') || '/';
          res.writeHead(302, { 'Location': next });
          res.end();
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        }
      } else {
        console.log(`🔒 Failed login attempt from ${req.socket.remoteAddress}`);
        if (!contentType.includes('application/json')) {
          // Form POST — redirect back to login with error
          res.writeHead(302, { 'Location': '/login.html?error=1' });
          res.end();
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid passcode.' }));
        }
      }
    });
    return;
  }

  // ─── Auth: Logout endpoint ─────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/logout') {
    const token = getSessionToken(req);
    if (token) sessions.delete(token);
    clearSessionCookie(res, req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ─── Auth Gate ─────────────────────────────────────────────────────
  if (!isPublicPath(req.url) && !isAuthenticated(req)) {
    // API calls get 401, page requests get redirected to login
    const urlPath = req.url.split('?')[0];
    if (urlPath.startsWith('/api/')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not authenticated. Please log in.' }));
      return;
    }
    // Redirect to login with ?next= for return
    const next = encodeURIComponent(req.url);
    res.writeHead(302, { 'Location': `/login.html?next=${next}` });
    res.end();
    return;
  }

  // ─── Settings API ──────────────────────────────────────────────────

  // GET /api/settings — return current settings
  if (req.method === 'GET' && req.url === '/api/settings') {
    const settings = loadSettings();
    const provider = getLLM();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      llm: {
        provider: provider?.name || null,
        model: provider?.model || null,
        available: !!provider,
      },
      defaults: settings.defaults || {},
      server: {
        port: PORT,
        uptime: Math.floor((Date.now() - SERVER_START) / 1000),
        startedAt: new Date(SERVER_START).toISOString(),
        nodeVersion: process.version,
      },
      hasCustomPasscode: !!settings.passcode && settings.passcode !== DEFAULT_PASSCODE,
    }));
    return;
  }

  // POST /api/settings/llm — switch LLM provider
  if (req.method === 'POST' && req.url === '/api/settings/llm') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { provider, apiKey, model, baseUrl } = JSON.parse(body);
        console.log(`⚙️ Switching LLM provider to: ${provider}${model ? ` (${model})` : ''}`);
        const p = await setLLM(provider, { apiKey, model, baseUrl });
        // Persist settings (don't persist API keys to disk — just the provider choice and model)
        saveSettings({ llmProvider: provider, llmModel: model || null, llmBaseUrl: provider === 'local' ? baseUrl : null });
        console.log(`✅ LLM switched to: ${p.name} (${p.model})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, provider: p.name, model: p.model }));
      } catch (err) {
        console.error(`❌ LLM switch failed: ${err.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/settings/test-llm — test the current LLM connection
  if (req.method === 'POST' && req.url === '/api/settings/test-llm') {
    try {
      console.log(`🧪 Testing LLM connection…`);
      const result = await testLLM();
      console.log(`✅ LLM test passed: "${result.response}" (${result.elapsed}ms)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error(`❌ LLM test failed: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // POST /api/settings/passcode — change the login passcode
  if (req.method === 'POST' && req.url === '/api/settings/passcode') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { currentPasscode, newPasscode } = JSON.parse(body);
        if (currentPasscode !== getPasscode()) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Current passcode is incorrect.' }));
          return;
        }
        if (!newPasscode || newPasscode.length < 6) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'New passcode must be at least 6 characters.' }));
          return;
        }
        saveSettings({ passcode: newPasscode });
        console.log(`🔑 Passcode changed`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/settings/defaults — save default form values
  if (req.method === 'POST' && req.url === '/api/settings/defaults') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const defaults = JSON.parse(body);
        saveSettings({ defaults });
        console.log(`⚙️ Default form values saved`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // API: LLM provider info
  if (req.method === 'GET' && req.url === '/api/provider') {
    const provider = getLLM();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      available: !!provider,
      name: provider?.name || null,
      model: provider?.model || null,
    }));
    return;
  }

  // API: Industry presets
  if (req.method === 'GET' && req.url.startsWith('/api/presets/')) {
    const industry = req.url.split('/api/presets/')[1];
    const preset = INDUSTRY_PRESETS[industry] || {};
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(preset));
    return;
  }

  // API: Generate demo script
  if (req.method === 'POST' && req.url === '/api/demo-script') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { scenario } = JSON.parse(body);
        console.log(`📝 Generating demo script for: ${scenario.name || scenario.id}`);

        const responseText = await generate(
          DEMO_SCRIPT_SYSTEM_PROMPT,
          `Generate a demo talk track for this scenario:\n\n${JSON.stringify(scenario, null, 2)}`
        );

        console.log(`✅ Demo script generated (${responseText.length} chars)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, script: responseText }));
      } catch (err) {
        console.error('❌ Demo script error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // API: Generate scenario (streaming with progress via SSE)
  if (req.method === 'POST' && req.url === '/api/generate-stream') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const formData = JSON.parse(body);
        console.log(`🎯 Streaming scenario: ${formData.scenarioType} for "${formData.customerName}" (${formData.industry})`);

        const userPrompt = buildUserPrompt(formData);

        // SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || '*',
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`data: ${JSON.stringify({ type: 'progress', status: 'Generating scenario with AI…', pct: 5 })}\n\n`);

        let fullText = '';
        let chunkCount = 0;
        for await (const chunk of generateStream(SCENARIO_SYSTEM_PROMPT, userPrompt)) {
          fullText += chunk;
          chunkCount++;
          // Estimate progress based on expected output size (~8000-15000 chars)
          const estPct = Math.min(90, Math.floor(5 + (fullText.length / 12000) * 85));
          if (chunkCount % 5 === 0) {
            res.write(`data: ${JSON.stringify({ type: 'progress', status: 'Writing scenario JSON…', pct: estPct, chars: fullText.length })}\n\n`);
          }
        }

        res.write(`data: ${JSON.stringify({ type: 'progress', status: 'Parsing and validating…', pct: 92 })}\n\n`);

        // Extract JSON from response
        let json = fullText.trim();
        if (json.startsWith('```')) {
          json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const scenario = JSON.parse(json);
        if (!scenario.id) scenario.id = 'custom-' + Date.now();
        if (!scenario.version) scenario.version = 1;
        if (!scenario.createdAt) scenario.createdAt = new Date().toISOString();

        res.write(`data: ${JSON.stringify({ type: 'progress', status: 'Scenario ready!', pct: 100 })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', scenario })}\n\n`);
        res.end();

        console.log(`✅ Streamed: ${scenario.name || scenario.id} (${scenario.alerts?.items?.length || 0} alerts, ${scenario.cases?.items?.length || 0} cases, ${fullText.length} chars)`);
      } catch (err) {
        console.error('❌ Stream generation error:', err.message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
          res.end();
        }
      }
    });
    return;
  }

  // API: Generate scenario (non-streaming fallback)
  if (req.method === 'POST' && req.url === '/api/generate') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const formData = JSON.parse(body);
        console.log(`🎯 Generating scenario: ${formData.scenarioType} for "${formData.customerName}" (${formData.industry})`);

        const scenario = await generateScenario(formData);

        console.log(`✅ Generated: ${scenario.name || scenario.id} (${scenario.alerts?.items?.length || 0} alerts, ${scenario.cases?.items?.length || 0} cases)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, scenario }));
      } catch (err) {
        console.error('❌ Generation error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // API: Scenario library — list all built-in scenarios (#1)
  if (req.method === 'GET' && req.url === '/api/scenarios') {
    const scenariosDir = join(__dirname, '../../extension/scenarios');
    try {
      const files = readdirSync(scenariosDir).filter(f => f.endsWith('.json'));
      const scenarios = files.map(f => {
        const data = JSON.parse(readFileSync(join(scenariosDir, f), 'utf8'));
        return {
          id: data.id || f.replace('.json', ''),
          name: data.name || f.replace('.json', ''),
          description: data.description || '',
          filename: f,
          customer: data.customer || {},
          alertCount: data.alerts?.items?.length || 0,
          caseCount: data.cases?.items?.length || 0,
          detectionCount: data.detections?.items?.length || 0,
          healthScore: data.healthScore?.override ?? null,
          scenarioType: data.id?.replace('-default', '') || 'custom',
          hasMDR: data.cases?.items?.some(c => c.managedBy === 'mtr') || false,
          hasEmail: !!data.emailHistory?.messages?.length,
          hasTimedEvents: !!data.timedEvents?.length,
        };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(scenarios));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: Get a single scenario by ID (#1)
  if (req.method === 'GET' && req.url.startsWith('/api/scenarios/')) {
    const id = req.url.split('/api/scenarios/')[1];
    const scenariosDir = join(__dirname, '../../extension/scenarios');
    try {
      // Try exact match, then without -default suffix, then with -default suffix
      let filePath = join(scenariosDir, `${id}.json`);
      try { readFileSync(filePath); } catch {
        // IDs are like "ransomware-default" but files are "ransomware.json"
        const stripped = id.replace(/-default$/, '');
        try {
          filePath = join(scenariosDir, `${stripped}.json`);
          readFileSync(filePath);
        } catch {
          filePath = join(scenariosDir, `${id}-default.json`);
        }
      }
      const data = readFileSync(filePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scenario not found' }));
    }
    return;
  }

  // API: "Make It Mine" — clone a built-in scenario with new customer details (#2)
  if (req.method === 'POST' && req.url === '/api/make-mine') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { scenarioId, customerName, industry, endpointCount, serverCount } = JSON.parse(body);
        const scenariosDir = join(__dirname, '../../extension/scenarios');

        // Load the base scenario (IDs are "ransomware-default", files are "ransomware.json")
        let filePath = join(scenariosDir, `${scenarioId}.json`);
        try { readFileSync(filePath); } catch {
          const stripped = scenarioId.replace(/-default$/, '');
          try {
            filePath = join(scenariosDir, `${stripped}.json`);
            readFileSync(filePath);
          } catch {
            filePath = join(scenariosDir, `${scenarioId}-default.json`);
          }
        }
        const scenario = JSON.parse(readFileSync(filePath, 'utf8'));

        // Override customer details
        scenario.id = `custom-${scenarioId}-${Date.now()}`;
        scenario.customer = {
          ...scenario.customer,
          name: customerName || scenario.customer?.name,
          industry: industry || scenario.customer?.industry,
          endpointCount: endpointCount || scenario.customer?.endpointCount,
          serverCount: serverCount || scenario.customer?.serverCount,
        };
        scenario.createdAt = new Date().toISOString();
        scenario.name = `${scenario.name} — ${customerName || 'Custom'}`;

        console.log(`🔄 Make It Mine: ${scenario.name}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, scenario }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // API: Battle card generation (#6)
  if (req.method === 'POST' && req.url === '/api/battle-card') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { scenario, competitor } = JSON.parse(body);
        const comp = competitor || scenario.competitor || 'the incumbent solution';
        console.log(`⚔️ Generating battle card: Sophos vs ${comp}`);

        const responseText = await generate(
          BATTLE_CARD_SYSTEM_PROMPT,
          `Generate a competitive battle card for Sophos vs ${comp}.\n\nThe SE is demoing this scenario:\n${JSON.stringify(scenario, null, 2)}\n\nFocus the battle card on the products and capabilities shown in this specific demo.`
        );

        console.log(`✅ Battle card generated (${responseText.length} chars)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, battleCard: responseText }));
      } catch (err) {
        console.error('❌ Battle card error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // API: Post-demo follow-up report (#7)
  if (req.method === 'POST' && req.url === '/api/post-demo-report') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { scenario, prospectName, prospectEmail, notes } = JSON.parse(body);
        console.log(`📧 Generating post-demo report for: ${prospectName || scenario.customer?.name}`);

        let userPrompt = `Generate a follow-up email after demoing Sophos Central.\n\n`;
        userPrompt += `## Scenario Shown\n${JSON.stringify(scenario, null, 2)}\n\n`;
        if (prospectName) userPrompt += `## Prospect\nName: ${prospectName}\n`;
        if (prospectEmail) userPrompt += `Email: ${prospectEmail}\n`;
        if (notes) userPrompt += `\n## SE Notes\n${notes}\n`;

        const responseText = await generate(POST_DEMO_REPORT_SYSTEM_PROMPT, userPrompt);

        console.log(`✅ Post-demo report generated (${responseText.length} chars)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, report: responseText }));
      } catch (err) {
        console.error('❌ Post-demo report error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // API: Remix scenario (#8)
  if (req.method === 'POST' && req.url === '/api/remix') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { scenario, changes } = JSON.parse(body);
        console.log(`🔀 Remixing scenario: ${scenario.name || scenario.id}`);

        let userPrompt = `Remix this existing scenario:\n\n${JSON.stringify(scenario, null, 2)}\n\n`;
        userPrompt += `## Changes Requested\n`;
        if (changes.customerName) userPrompt += `- New customer: ${changes.customerName}\n`;
        if (changes.industry) userPrompt += `- New industry: ${changes.industry}\n`;
        if (changes.threatActor) userPrompt += `- New threat actor: ${changes.threatActor}\n`;
        if (changes.entryPoint) userPrompt += `- New entry point: ${changes.entryPoint}\n`;
        if (changes.notes) userPrompt += `- Additional notes: ${changes.notes}\n`;
        userPrompt += `\nKeep the overall structure but update all industry-specific details (hostnames, departments, users, compliance references, file paths).`;

        const responseText = await generate(REMIX_SYSTEM_PROMPT, userPrompt);

        let json = responseText.trim();
        if (json.startsWith('```')) {
          json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        const remixed = JSON.parse(json);
        remixed.id = `remix-${Date.now()}`;
        remixed.createdAt = new Date().toISOString();

        console.log(`✅ Remixed: ${remixed.name || remixed.id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, scenario: remixed }));
      } catch (err) {
        console.error('❌ Remix error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // API: Prospect enrichment (#12)
  if (req.method === 'POST' && req.url === '/api/enrich-prospect') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { domain, companyName } = JSON.parse(body);
        console.log(`🔍 Enriching prospect: ${companyName || domain}`);

        const responseText = await generate(
          `You are a prospect research assistant. Given a company name or domain, provide structured intelligence for a cybersecurity sales demo.

Output ONLY valid JSON with this exact structure:
{
  "companyName": "Full legal name",
  "industry": "one of: healthcare, finance, manufacturing, education, retail, government, legal, technology, energy, construction, nonprofit",
  "estimatedEmployees": 5000,
  "estimatedEndpoints": 6000,
  "estimatedServers": 400,
  "headquarters": "City, State",
  "compliance": ["HIPAA", "SOX"],
  "recentBreaches": ["2024: description of any public breach"],
  "techStack": ["Known security vendors they use"],
  "keyRisks": ["Industry-specific risks"],
  "suggestedScenario": "ransomware|phishing|xdr|mdr|insider|bec|supply-chain|zero-day",
  "suggestedThreatActors": ["Relevant threat actors for this industry"],
  "demoAngle": "One paragraph on how to position the demo"
}

Use your knowledge to make educated estimates. If you don't know something, make a reasonable guess based on industry and size. Never output null — always provide a value.`,
          `Research this company for a Sophos Central demo:\n${companyName ? `Company: ${companyName}\n` : ''}${domain ? `Domain: ${domain}\n` : ''}\n\nProvide the structured intelligence JSON.`
        );

        let json = responseText.trim();
        if (json.startsWith('```')) {
          json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        const enrichment = JSON.parse(json);

        console.log(`✅ Enriched: ${enrichment.companyName} (${enrichment.industry}, ~${enrichment.estimatedEndpoints} endpoints)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, enrichment }));
      } catch (err) {
        console.error('❌ Enrichment error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // API: Streaming generation (SSE) — used by demo script, battle card, follow-up, enrichment
  if (req.method === 'POST' && req.url === '/api/stream') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { type, scenario, competitor, prospectName, notes } = JSON.parse(body);

        let systemPrompt, userPrompt;

        if (type === 'demo-script') {
          systemPrompt = DEMO_SCRIPT_SYSTEM_PROMPT;
          userPrompt = `Generate a demo talk track for this scenario:\n\n${JSON.stringify(scenario, null, 2)}`;
        } else if (type === 'battle-card') {
          const comp = competitor || scenario.competitor || 'the incumbent solution';
          systemPrompt = BATTLE_CARD_SYSTEM_PROMPT;
          userPrompt = `Generate a competitive battle card for Sophos vs ${comp}.\n\nThe SE is demoing this scenario:\n${JSON.stringify(scenario, null, 2)}\n\nFocus the battle card on the products and capabilities shown in this specific demo.`;
        } else if (type === 'follow-up') {
          systemPrompt = POST_DEMO_REPORT_SYSTEM_PROMPT;
          userPrompt = `Generate a follow-up email after demoing Sophos Central.\n\n## Scenario Shown\n${JSON.stringify(scenario, null, 2)}\n\n`;
          if (prospectName) userPrompt += `## Prospect\nName: ${prospectName}\n`;
          if (notes) userPrompt += `\n## SE Notes\n${notes}\n`;
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown stream type: ${type}` }));
          return;
        }

        console.log(`🌊 Streaming ${type}…`);

        // SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        let totalChars = 0;
        for await (const chunk of generateStream(systemPrompt, userPrompt)) {
          totalChars += chunk.length;
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        console.log(`✅ Streamed ${type} (${totalChars} chars)`);
      } catch (err) {
        console.error(`❌ Stream error:`, err.message);
        // If headers not sent yet, send error as JSON
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        } else {
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        }
      }
    });
    return;
  }

  // API: Download extension as .zip
  if (req.method === 'GET' && req.url === '/api/download-extension') {
    try {
      const extDir = join(__dirname, '../../extension');
      const zipPath = '/tmp/sophos-demo-extension.zip';
      // Build zip fresh each time (extension is only ~300KB)
      execSync(`cd "${join(extDir, '..')}" && zip -r -q "${zipPath}" extension/ -x "extension/.git/*"`, { timeout: 10000 });
      const zipData = readFileSync(zipPath);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="sophos-demo-extension.zip"',
        'Content-Length': zipData.length,
      });
      res.end(zipData);
      console.log(`📦 Extension downloaded (${(zipData.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.error('❌ Extension zip error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to package extension: ' + err.message }));
    }
    return;
  }

  // API: Extension version info
  if (req.method === 'GET' && req.url === '/api/extension-info') {
    try {
      const manifest = JSON.parse(readFileSync(join(__dirname, '../../extension/manifest.json'), 'utf8'));
      const extDir = join(__dirname, '../../extension');
      const scenarios = readdirSync(join(extDir, 'scenarios')).filter(f => f.endsWith('.json') && f !== 'SCHEMA.md');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        scenarioCount: scenarios.length,
        scenarios: scenarios.map(f => f.replace('.json', '')),
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Serve screenshots for the guide
  if (req.method === 'GET' && req.url.startsWith('/screenshots/')) {
    const imgPath = join(__dirname, '../..', req.url.split('?')[0]);
    if (existsSync(imgPath)) {
      const ext = extname(imgPath);
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
      const data = readFileSync(imgPath);
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
      return;
    }
  }

  // Static files — strip query string before resolving path
  const urlPath = req.url.split('?')[0];
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = join(PUBLIC_DIR, filePath);

  const ext = extname(filePath);
  const mimeType = MIME_TYPES[ext] || 'text/plain';

  readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const headers = { 'Content-Type': mimeType };
    // Prevent caching on HTML pages so updates are always picked up
    if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, '::', () => {
  const provider = getLLM();
  console.log(`\n🎯 Sophos Demo Scenario Builder`);
  console.log(`   Local:     http://localhost:${PORT}`);
  console.log(`   LLM:       ${provider ? `✅ ${provider.name} (${provider.model})` : '❌ No LLM configured — AI generation unavailable'}`);
  console.log(`   Schema:    ✅ loaded\n`);

  if (!provider) {
    console.log(`   To enable AI generation, set one of:`);
    console.log(`     ANTHROPIC_API_KEY=sk-ant-...`);
    console.log(`     OPENAI_API_KEY=sk-...`);
    console.log(`     LLM_BASE_URL=http://localhost:1234/v1  (LM Studio / Ollama)`);
    console.log(`     Or install Pi SDK: npm link @mariozechner/pi-coding-agent\n`);
  }
});
