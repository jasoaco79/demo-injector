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
import { readFile, readFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { initLLM, getLLM, generate } from './llm.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3847;

// ─── Initialize LLM Provider ────────────────────────────────────────
const llm = await initLLM();

// ─── Load Schema + Examples ──────────────────────────────────────────
const SCHEMA_MD = readFileSync(join(__dirname, '../../extension/scenarios/SCHEMA.md'), 'utf8');
const RANSOMWARE_EXAMPLE = readFileSync(join(__dirname, '../../extension/scenarios/ransomware.json'), 'utf8');
const XDR_EXAMPLE = readFileSync(join(__dirname, '../../extension/scenarios/xdr.json'), 'utf8');

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

## EXAMPLE: RANSOMWARE SCENARIO
${RANSOMWARE_EXAMPLE}

## EXAMPLE: XDR INVESTIGATION SCENARIO
${XDR_EXAMPLE}

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
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

  // API: Generate scenario
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

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = join(PUBLIC_DIR, filePath);

  const ext = extname(filePath);
  const mimeType = MIME_TYPES[ext] || 'text/plain';

  readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
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
