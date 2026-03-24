# Sophos Central Demo Mode

A Chrome extension that injects realistic demo data into the **live Sophos Central UI**. Real product, fake data — every pixel is authentic. Built for Sophos Sales Engineers who need compelling, customer-specific demos without maintaining separate demo environments.

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Built-in Scenarios](#built-in-scenarios)
- [Custom Scenarios](#custom-scenarios)
- [AI Scenario Generator](#ai-scenario-generator)
- [Demo Walkthroughs](#demo-walkthroughs)
- [Best Practice Tips](#best-practice-tips)
- [What Gets Overridden](#what-gets-overridden)
- [Known Caveats](#known-caveats)
- [Troubleshooting](#troubleshooting)
- [Customizing Scenarios](#customizing-scenarios)
- [Architecture Deep Dive](#architecture-deep-dive)
- [Distribution](#distribution)
- [Roadmap](#roadmap)
- [File Structure](#file-structure)

---

## Why This Exists

Every Sophos SE faces the same problem: you need to show a prospect what Sophos Central looks like with **their** company name, **their** scale (thousands of endpoints), and a **realistic threat scenario** — but your actual Sophos Central tenant has 2 test endpoints and no real alerts.

**Previous options were bad:**
- **Screenshots/slides:** Not interactive. Prospect can't click around. Feels like a pitch, not a product.
- **Recorded videos:** Same problem. Can't answer "what happens if I click here?"
- **Shared demo tenants:** Stale data. Other SEs modify it. Never matches the prospect's industry.
- **Lab environments:** Takes hours to set up. Alerts get old. Hard to customize per prospect.

**This extension solves it:**
- The prospect sees **real Sophos Central** — `central.sophos.com` in the URL bar
- Every pixel, animation, menu, and button is **the actual product**
- Data is **customized per demo** — their company name, their scale, their industry
- **Zero setup time** — toggle on, pick a scenario, go
- **Zero risk** — nothing is sent to Sophos Central, all writes are blocked
- **Works anywhere** — airplane, customer site, coffee shop, your desk

---

## How It Works

### The 30-Second Version

Sophos Central is a React web app. When you visit `central.sophos.com`, your browser downloads the React application, which then calls APIs to fetch data (alerts, devices, health scores, etc.). The React app renders whatever data the API returns.

**This extension sits between the API responses and React.** It lets the real API call happen, waits for the real response, then **modifies the JSON data before React sees it**. React renders the modified data as if it were real.

### The Technical Version

```
Without Extension:
  React calls fetch("/api/alerts") 
    → Sophos API responds: { items: [], total: 0 }
    → React renders: "No alerts"

With Extension ON:
  React calls fetch("/api/alerts")
    → Sophos API responds: { items: [], total: 0 }
    → Extension intercepts response
    → Extension injects: { items: [fake ransomware alert], total: 1 }
    → React renders: "1 critical alert: CryptoLocker detected on DESKTOP-FIN042"
```

The extension replaces the browser's global `fetch()` and `XMLHttpRequest` with custom versions that:

1. **Let the real API call happen** — your browser talks to Sophos Central normally
2. **Read the response** — check if this URL matches any interception rules
3. **Modify the JSON** — inject fake alerts, change tenant names, override counts
4. **Return the modified response** — React gets our version, not the original
5. **Block all writes** — POST/PUT/DELETE requests return fake `{ success: true }` without ever reaching Sophos

The extension also includes a **DOM observer** for pages that load data through mechanisms we can't intercept at the API level. It watches for specific UI elements and overrides their content after rendering.

### What Each File Does

| File | Role |
|------|------|
| `interceptor.js` | **The core.** Runs in the page's JavaScript context. Overrides `fetch()` and `XHR`. Contains all interception rules and data generators. |
| `bridge.js` | **The messenger.** Runs in the extension's isolated world. Relays settings from the popup to the interceptor via DOM events. |
| `service-worker.js` | **The brain.** Manages state in `chrome.storage`. Loads scenario JSON files. Handles import/export. Shows the ON badge. |
| `popup.html/js` | **The UI.** The popup you see when clicking the extension icon. Scenario picker, customer name input, toggle switch. |
| `scenarios/*.json` | **The data.** Each file defines a complete demo scenario — alerts, cases, detections, health scores, audit logs, etc. |

---

## Installation

### Prerequisites
- Google Chrome (any recent version)
- A Sophos Central account (any tier — the extension works with whatever you have)

### Step-by-Step

1. **Get the extension files**
   ```bash
   git clone https://github.com/jasoaco79/sophos-demo.git
   ```
   Or download and unzip the repository.

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Or: click the three dots menu (⋮) → Extensions → Manage Extensions

3. **Enable Developer Mode**
   - Look for the **Developer mode** toggle in the top right corner
   - Turn it **ON**
   - Three buttons appear: "Load unpacked", "Pack extension", "Update"

4. **Load the Extension**
   - Click **"Load unpacked"**
   - Navigate to the `extension/` folder inside the repository
   - Click **Open** (or **Select Folder**)
   - You should see "Sophos Central Demo Mode" appear as a card on the extensions page

5. **Pin the Extension Icon**
   - Click the puzzle piece icon (🧩) in Chrome's toolbar (top right)
   - Find "Sophos Central Demo Mode" in the list
   - Click the pin icon (📌) to keep it visible

6. **Verify**
   - Go to `https://central.sophos.com` and log in
   - Click the 🎯 extension icon — you should see the scenario picker popup
   - The extension shows "Inactive" until you toggle it on

### Updating
When you pull new code:
1. Go to `chrome://extensions/`
2. Find the Sophos Central Demo Mode card
3. Click the **refresh icon** (🔄) on the card, or click **"Update"** at the top

---

## Quick Start

1. Log into [Sophos Central](https://central.sophos.com)
2. Click the 🎯 extension icon in Chrome's toolbar
3. Select **🔴 Ransomware Attack** from the dropdown
4. Type your prospect's company name (e.g., "Mercy Hospital")
5. Set their endpoint count (e.g., 4200) and server count (e.g., 300)
6. Toggle **ON**
7. Click **🔄 Apply & Reload Sophos Central**

**What happens:**
- Top right shows "Mercy Hospital" instead of your real tenant name
- Dashboard shows 4,200 endpoints with adjusted health scores
- Alerts page shows ransomware alerts on DESKTOP-FIN042
- Cases page shows an active investigation with MITRE mapping
- Threat Graphs shows a process tree with the malware kill chain
- Audit logs show device isolation and cleanup actions
- All "Isolate Device" / "Clean" / "Delete" buttons return fake success

**When you're done:**
- Toggle **OFF** in the popup
- Reload the page — your real data is back, untouched

---

## Built-in Scenarios

### 🔴 Ransomware Attack
**Story:** CryptoLocker ransomware was delivered via phishing email. Sarah Chen in Finance downloaded `invoice_march2026.exe`. CryptoGuard blocked the encryption attempt. Shadow copies were targeted. Tamper Protection stopped the malware from disabling real-time scanning.

**Best for:** Showing endpoint protection, CryptoGuard, Tamper Protection, incident response workflow.

**What you'll see:**
- 4 alerts (high + medium severity)
- 1 active investigation case with MITRE ATT&CK mapping (T1486, T1490, T1059)
- 2 XDR detections with full command-line detail
- Threat graph showing the malware process tree
- Audit logs: device isolation, CryptoGuard activation, tamper protection trigger
- Live Discover: pre-run query showing suspicious PowerShell and shadow copy deletion processes
- Health score: 72 (dropped from attack)

**Demo talking points:**
- "CryptoGuard stopped the encryption in real-time — 47 files protected"
- "Look at the MITRE mapping — we can see the full attack chain"
- "Tamper Protection blocked the attacker from disabling our agent"
- "The investigation case was auto-generated with all the context an analyst needs"

---

### 🟠 Phishing Campaign
**Story:** A targeted phishing campaign hit 47 employees with credential harvesting emails from `secure-login-verify[.]com`. Sophos Email blocked most at the gateway. 12 were quarantined post-delivery via clawback. One user clicked — Sophos Web Protection on the endpoint blocked the malicious URL.

**Best for:** Showing Sophos Email, endpoint web protection, email + endpoint integration, post-delivery remediation.

**What you'll see:**
- 3 alerts (email gateway + endpoint web block)
- 1 investigation case linking email and endpoint detections
- 2 detections (gateway block + endpoint URL block)
- Email history: 5 sample emails (blocked/quarantined/delivered-then-clawed-back)
- Quarantine: 3 items with release/block options
- Email stats: 47 threats blocked, 1,284 scanned, 89 spam
- Audit logs: campaign blocked, post-delivery remediation, endpoint URL block
- Health score: 89

**Demo talking points:**
- "47 emails blocked before any user saw them"
- "Even the one email that got through — the endpoint caught the click"
- "Post-delivery clawback removed 12 emails that were already in mailboxes"
- "Email and endpoint work together — one detection, full visibility"

---

### 🔵 XDR Investigation
**Story:** A multi-stage intrusion starting with a browser exploit on DESKTOP-MKT003 (Marketing). The attacker exploited CVE-2026-1234 in Edge, injected a Cobalt Strike beacon, moved laterally to the domain controller (SRV-DC01) via SMB, then staged 2.4GB of customer data on the database server (SRV-DB02). Exfiltration was blocked.

**Best for:** Showing XDR, threat hunting, MITRE kill chain, cross-host correlation, Live Discover.

**What you'll see:**
- 3 alerts across 3 hosts (exploit, lateral movement, data staging)
- 1 active case with full MITRE mapping (5 tactics: Initial Access → Persistence → Lateral Movement → Collection → Exfiltration)
- 2 detections with detailed raw data
- Threat graph showing multi-host attack flow
- Audit logs: 3 device isolations, credential reset (3 compromised accounts), firewall rule blocking C2
- Live Discover: query across 25 endpoints showing beacon activity, AD enumeration, data export
- Health score: 84

**Demo talking points:**
- "Look at this kill chain — 5 MITRE tactics mapped automatically"
- "The attacker moved from Marketing to the Domain Controller to the database server"
- "XDR correlated detections across all 3 hosts into a single investigation"
- "Live Discover lets us query every endpoint in real-time — here we hunted for the Cobalt Strike beacon"
- "Exfiltration was blocked before any data left the network"

---

### 🟢 Healthy Environment
**Story:** A well-managed environment with zero alerts, high compliance, and all endpoints protected. Shows what a mature Sophos deployment looks like day-to-day.

**Best for:** "Day in the life" demos, showing operational simplicity, health scoring, compliance posture.

**What you'll see:**
- Zero alerts, zero cases, zero detections
- Health score: 98
- All endpoints healthy and compliant
- Clean email stats

**Demo talking points:**
- "This is what you see when things are working well — green across the board"
- "98% health score means your endpoints are protected, patched, and compliant"
- "When there's nothing to investigate, your team can focus on proactive security"

---

## Custom Scenarios

### Import from File
1. Click 📁 in the popup
2. Select a `.json` scenario file
3. The scenario appears under **"Custom Scenarios"** in the dropdown
4. Customer name and endpoint count auto-populate from the scenario
5. You can still override them in the popup

### Import from Clipboard
1. Click 📥 in the popup
2. Paste the scenario JSON into the text area
3. Click **Import**

### Export a Scenario
1. Select any scenario in the dropdown
2. Click 📤
3. A `.json` file downloads — share it with other SEs

### Delete a Custom Scenario
1. Select the custom scenario
2. Click 🗑️
3. Confirm deletion

---

## AI Scenario Generator

The **Scenario Builder** is a web-based tool that uses AI (Claude via Pi SDK) to generate custom scenario JSON from a simple intake form.

### Setup
```bash
cd intake-site
npm link @mariozechner/pi-coding-agent
npm start
```
Opens at `http://localhost:3847`

### How to Use

1. **Customer Details** — Company name, industry, endpoint count, server count, Sophos products
2. **Scenario Type** — Pick from: Ransomware, Phishing, XDR Investigation, MDR Response, Insider Threat, Healthy Environment
3. **Attack Details** — Threat actor (LockBit, BlackCat, etc.), entry point, hosts affected, department targeted, MDR involvement
4. **Custom Story** — Describe your demo in plain English: *"LockBit came in through phishing to billing. MDR detected it at 2am, isolated hosts, had a report by morning."*
5. **Demo Focus** — Which products to highlight, talking points, competitor you're up against
6. Click **Generate Scenario** (~15 seconds)
7. Preview the result → **Download .json** → Import into extension

### What the AI Generates
- Realistic alerts with industry-specific hostnames (HIS-SRV for healthcare, POS-TERM for retail)
- MITRE ATT&CK mapping with real technique IDs
- Case with investigation timeline
- Detections with realistic command lines and file paths
- Threat graph data
- Audit logs matching the story
- Live Discover query results
- Email history (for phishing scenarios)
- Appropriate health score

### Tips for Better Scenarios
- **Be specific about the story.** "LockBit via phishing to billing at 2am" generates much better data than "ransomware attack."
- **Name the competitor.** If you're up against CrowdStrike, the AI emphasizes Sophos differentiators.
- **Include the department.** "Finance" generates different hostnames and user accounts than "Engineering."
- **Mention MDR if relevant.** Setting MDR involvement to "yes" generates MDR team actions in the case timeline.

---

## Demo Walkthroughs

### MDR Demo (20 minutes)

**Setup:** Use the XDR scenario or generate a custom MDR scenario with `managedBy: "mtr"`.

1. **Dashboard** (2 min) — "Here's what the customer sees when they log in. Notice the health score dropped to 84 — something happened."
2. **Alerts** (3 min) — "Three high-severity alerts across different hosts. This looks like a coordinated attack."
3. **Cases** (5 min) — "The MDR team already has a case open. Let me click in..." → Show MITRE mapping, impacted entities, detection count.
4. **Case History** (3 min) — "Look at the timeline — MDR responded within 8 minutes. They isolated the affected hosts and are actively investigating."
5. **Detections** (3 min) — "Here's the raw telemetry. You can see the browser exploit, the lateral movement, the data staging."
6. **Live Discover** (2 min) — "And if we need to hunt further, we can query every endpoint in real-time." → Show pre-populated query results.
7. **Audit Logs** (2 min) — "Here's the full audit trail — device isolations, credential resets, firewall rules. Everything is documented."

---

### Endpoint Protection Demo (15 minutes)

**Setup:** Use the Ransomware scenario.

1. **Dashboard** (2 min) — Show endpoint count, health score, recent alerts.
2. **Alerts** (3 min) — Walk through the ransomware alerts. "CryptoGuard stopped the encryption. Tamper Protection blocked the attacker from disabling our agent."
3. **Cases** (3 min) — Click into the case. Show MITRE mapping. "We automatically map every detection to MITRE ATT&CK."
4. **Threat Graph** (3 min) — "Here's the visual kill chain. You can see exactly how the attack progressed."
5. **Live Discover** (2 min) — "Let me show you what we found when we queried the endpoint." → Show suspicious processes.
6. **Actions** (2 min) — Click "Isolate Device" → it succeeds (faked). "One click to contain the threat."

---

### Email Security Demo (15 minutes)

**Setup:** Use the Phishing scenario.

1. **Dashboard** (2 min) — Show email stats widget. "1,284 emails scanned, 47 threats blocked."
2. **Alerts** (3 min) — "A targeted phishing campaign hit 47 employees. Our gateway caught all but one."
3. **Email History** (3 min) — Show message trace. "You can see every email — who it was from, who it was to, why it was blocked."
4. **Quarantine** (2 min) — "12 emails were clawed back post-delivery. Even the ones that got through initially were removed."
5. **Endpoint Block** (3 min) — "The one user who clicked — Sophos Web Protection on the endpoint blocked the URL. No credentials were exposed."
6. **Integration Story** (2 min) — "Email and endpoint work together. The detection from email enriches the endpoint alert. One view, full visibility."

---

## Best Practice Tips

### Before the Demo

1. **Generate a custom scenario** with the prospect's company name, industry, and endpoint count. Generic demos don't impress.
2. **Test it first.** Load the scenario, toggle on, click through the pages you plan to show. Make sure everything renders.
3. **Know the story.** Each scenario tells a story. Practice narrating it: "At 2:39 AM, an employee in Billing received a phishing email..."
4. **Close other Sophos Central tabs.** The extension injects into ALL sophos.com tabs. Having multiple tabs open can cause confusion.
5. **Disable other extensions** that might interfere (ad blockers, privacy tools).

### During the Demo

1. **Start with the dashboard** — it sets the stage with overall posture.
2. **Narrate, don't just click.** "Notice the health score dropped to 72. Something happened. Let's investigate."
3. **Let the prospect drive.** "What would you want to see next?" If they ask to click something unexpected, it's fine — the extension handles most pages.
4. **Don't demo the extension itself.** The prospect should think this is real data. Don't open the popup or mention "demo mode."
5. **If something looks off,** keep moving. Not every page is intercepted. Pivot to another view.

### After the Demo

1. **Toggle off immediately.** Don't risk the prospect seeing the toggle.
2. **Export the scenario** if the prospect wants a follow-up demo. You can reload it exactly as it was.

### Things That Look Especially Impressive

- **Clicking into a case** and seeing the MITRE ATT&CK mapping with real technique IDs
- **The threat graph** showing the process tree with malicious/suspicious nodes
- **Live Discover query results** showing suspicious processes across endpoints
- **The audit log** showing MDR team actions with timestamps
- **Company name everywhere** — it's their name on every page

---

## What Gets Overridden

| Area | Endpoint | What Changes |
|------|----------|-------------|
| **Tenant Name** | `/api/billing/account`, `/api/users/current`, global text replace | Prospect's company name everywhere in the UI |
| **Alerts** | `/api/alerts/retrieve`, `/api/alerts/summary` | Fake alerts with scenario-specific threats |
| **Cases List** | `/cases/v1/cases` | Fake investigation cases prepended to the list |
| **Case Detail** | `/cases/v1/cases/{id}` | Full case object returned for fake cases |
| **Case Activities** | `/cases/v1/cases/{id}/activities` | Investigation timeline with MDR actions |
| **Case MITRE** | `/cases/v1/cases/{id}/mitre-attack-summary` | Expanded MITRE tactics/techniques |
| **Case Entities** | `/cases/v1/cases/{id}/impacted-entities` | Affected devices, IPs, processes |
| **Case Notebook** | `/cases/v1/cases/{id}/notebook/sections` | Analyst notes |
| **Detections** | `/detections/queries/.../results`, `/detections/timeline` | XDR detections with raw telemetry |
| **Threat Graphs** | `/api/stac/cases`, `/api/stac/rootcause/{id}/graph` | Process tree visualization data |
| **Health Score** | `/account-health-check/v1/scores`, `/v1/account-health-check` | Adjusted per scenario |
| **Endpoint Count** | `/api/reports/endpoints`, `/api/user-devices`, `/api/servers` | Custom counts in reports and summaries |
| **Device Summary** | `/cloud-ui-rs/mobile-admin/reports/summary` | Dashboard device count donuts |
| **Web Stats** | `/api/reports/web-statistics` | Dashboard web control widget |
| **Email Stats** | `/email/v1/statistics/dashboard/widget` | Email security dashboard numbers |
| **Attacks** | `/ews-query/v1/attacks` | Active attack indicators |
| **Audit Logs** | `/api/audit/logs`, `/api/logs/audit` | Admin and system event entries |
| **Live Discover** | `/live-discover/`, `/xdr-query/`, `/osquery/` | Pre-populated query results |
| **Email History** | `/email/messages`, `/email/quarantine` | Message trace and quarantine list |
| **XDR Actions** | `/xdr-actions/v1/actions` | Response action options |
| **Write Blocking** | All POST/PUT/DELETE to action endpoints | Returns fake `{ success: true }` |

---

## Known Caveats

### What Doesn't Work Yet

1. **Devices → Computers/Servers list page.** The device list is loaded by a micro-frontend through an API we haven't identified yet. The extension overrides count numbers on the dashboard and in reports, and attempts DOM-level overrides on the devices page, but the actual device table may still show your real devices. **Workaround:** During demos, show device counts on the Dashboard or Account Health page instead of the Devices list.

2. **Dashboard widget charts.** The dashboard's visual widgets (donut charts, bar charts) get their data from APIs we intercept, but the specific widget rendering depends on the dashboard micro-frontend. Numbers should update; chart visuals may partially reflect real data. **Workaround:** Focus on the alert list, health score number, and endpoint count rather than chart visuals.

3. **Threat Graph deep visualization.** The threat graph interceptor auto-generates process tree data from detections, but the actual Sophos Central threat graph renderer expects a very specific data format. The graph may not render visually even though the data is intercepted. **Workaround:** Describe the process tree verbally while showing the detection details and MITRE mapping.

4. **Email message detail.** Clicking into a specific email message in the message trace may show incomplete data. The top-level message list and quarantine work. **Workaround:** Stay on the message list view — it shows sender, recipient, subject, status, and scan results.

5. **Some pages use micro-frontends** that load through mechanisms we can't intercept (not standard fetch/XHR). These pages may show real data even with demo mode on. The Dashboard, Alerts, Cases, Detections, and Account Health pages all work correctly.

### What Could Theoretically Go Wrong

- **Sophos Central UI updates** could change API response shapes, breaking interception for specific pages. The extension is designed to fail gracefully — if it can't parse a response, it passes through the original data.
- **API endpoint URL changes** (e.g., Sophos changes `dzr-api-amzn-us-west-2-fa88.api-upe.p.hmr.sophos.com` to something else) would bypass our interceptor. The content script match patterns cover `*.sophos.com` broadly, but specific URL matching might miss new domains.
- **Browser extensions that modify network requests** (ad blockers, privacy extensions, VPNs) could interfere. Disable them during demos.

### Safety Guarantees

- The extension **never modifies any request TO Sophos Central** — only the responses coming back.
- All write operations (POST, PUT, DELETE) to action endpoints are **blocked and faked**.
- The extension runs entirely in your browser. No data is sent anywhere.
- Toggling off and reloading restores your real data immediately.

---

## Troubleshooting

### Extension doesn't appear in Chrome
- Make sure **Developer mode** is ON at `chrome://extensions/`
- Make sure you selected the `extension/` folder (not the root project folder)
- Try closing and reopening Chrome

### Extension loaded but no icon in toolbar
- Click the **puzzle piece** 🧩 icon in Chrome's toolbar
- Find "Sophos Central Demo Mode" and click the **pin** 📌 icon
- If there's no puzzle piece icon, try making Chrome wider — it may be hidden

### Toggled ON but nothing changes
- Make sure you clicked **"🔄 Apply & Reload Sophos Central"** — the page must reload for changes to take effect
- Check the browser console (`F12` → Console) for `[Sophos Demo]` messages
- If you see `[Sophos Demo] 🟢 ENABLED` but no data changes, the interceptor is running but the page hasn't refreshed
- Try a hard refresh: `Ctrl+Shift+R`

### Tenant name changes but alerts don't show
- Go to the **Alerts** page (`/manage/alerts`) directly — the dashboard may load alerts differently
- Check that the scenario has alerts defined (the Healthy scenario has zero alerts by design)

### "Extension context invalidated" error
- This happens when you reload the extension while Sophos Central is open
- Just refresh the Sophos Central page — the error clears on its own

### Console shows no [Sophos Demo] messages at all
- The content script may not be injecting. Check `chrome://extensions/` for errors on the extension card
- Make sure the extension is enabled (blue toggle on the card)
- Try removing and re-loading the extension

### AI Scenario Generator errors
- Make sure you've run `npm link @mariozechner/pi-coding-agent` in the intake-site folder
- Make sure you have a valid Anthropic API key configured in Pi (`~/.pi/agent/auth.json`)
- The generator uses Pi's OAuth tokens which auto-refresh — if you get auth errors, try running `pi` once to refresh your token

### Performance is slow
- The extension adds minimal overhead — it only intercepts JSON API responses
- If Sophos Central feels slow, it's likely the page itself, not the extension
- Disable cache override: the extension doesn't modify caching, so pages load at normal speed

---

## Customizing Scenarios

### Scenario JSON Structure

Every scenario is a JSON file with these sections:

```json
{
  "id": "my-scenario",
  "name": "My Custom Scenario",
  "description": "Brief description for the popup dropdown",
  "customer": {
    "name": "Default Customer Name",
    "industry": "healthcare",
    "endpointCount": 4200,
    "serverCount": 300
  },
  "alerts": { ... },
  "cases": { ... },
  "detections": { ... },
  "caseDetail": { ... },
  "threatGraphs": { ... },
  "billing": { ... },
  "user": { ... },
  "healthScore": { ... },
  "endpointReport": { ... },
  "auditLogs": { ... },
  "liveDiscover": { ... },
  "emailHistory": { ... },
  "emailStats": { ... }
}
```

### Template Variables

Use these in any string field — they're resolved at runtime from the popup settings:

| Variable | Example Output |
|----------|---------------|
| `{{customerName}}` | Mercy Hospital |
| `{{endpointCount}}` | 4200 |
| `{{serverCount}}` | 300 |
| `{{customerDomain}}` | mercyhospital.com |
| `{{endpointCount * 0.85}}` | 3570 |

### Timestamp Shortcuts

Use relative timestamps instead of absolute dates — alerts always look fresh:

| Shorthand | Meaning |
|-----------|---------|
| `-3m` | 3 minutes ago |
| `-2h` | 2 hours ago |
| `-1d` | 1 day ago |
| `now` | Current time |

### Auto-Generated Fields

Set any UUID/ID field to `"auto"` — the extension generates unique values at runtime:
- Alert IDs, case IDs, detection IDs, endpoint IDs, tenant IDs

### Smart Auto-Generation

You don't have to fill in every section. The extension auto-generates:
- **Case activities** — from case creation info + MDR actions (if `managedBy: "mtr"`)
- **MITRE summary** — from case's `initialDetection.mitreAttacks`
- **Impacted entities** — from detection device hostnames and IPs
- **Threat graph** — from detection process/command-line data
- **Threat artifacts** — from detection file paths and hashes

For full schema documentation with every field explained, see **[`extension/scenarios/SCHEMA.md`](extension/scenarios/SCHEMA.md)**.

---

## Architecture Deep Dive

### Extension Components

```
┌─────────────────────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3)                             │
│                                                             │
│  ┌─────────────────┐   ┌───────────────────────────────┐   │
│  │  Popup           │   │  Service Worker (background)   │   │
│  │  - Scenario list │──▶│  - State in chrome.storage     │   │
│  │  - Toggle on/off │   │  - Load scenario JSONs         │   │
│  │  - Import/export │   │  - Push state to all tabs      │   │
│  │  - Customer name │   │  - Badge management            │   │
│  └─────────────────┘   └───────────┬───────────────────┘   │
│                                     │                       │
│                                     ▼                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Bridge (ISOLATED world)                              │   │
│  │  - Receives state from service worker                 │   │
│  │  - Pushes to MAIN world via DOM events                │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                          │ CustomEvent                      │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Interceptor (MAIN world — same as page JS)           │   │
│  │                                                       │   │
│  │  1. Overrides window.fetch() and XMLHttpRequest       │   │
│  │  2. Template engine resolves {{variables}}, timestamps │   │
│  │  3. modifyResponse() matches URL → applies scenario   │   │
│  │  4. Blocks dangerous writes → fake success            │   │
│  │  5. DOM observer for micro-frontend pages             │   │
│  │  6. Global text replacement (tenant name)             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Why MAIN World?

Chrome Manifest V3 content scripts run in an **isolated world** by default — they share the DOM but have a separate JavaScript context. This means they can't override `window.fetch()` in the page's context.

Our interceptor uses `"world": "MAIN"` to inject directly into the page's JavaScript context. This lets us replace `fetch()` before any Sophos Central code runs (because we use `"run_at": "document_start"`).

The downside: MAIN world scripts can't access `chrome.*` APIs. That's why we need the bridge script — it runs in ISOLATED world, has access to `chrome.runtime`, and communicates with the MAIN world interceptor via DOM events.

### Scenario Loading Flow

```
1. SE clicks extension icon → popup opens
2. SE picks scenario, types customer name, toggles ON
3. popup.js → chrome.runtime.sendMessage({ type: 'SET_STATE', state })
4. service-worker.js loads scenario JSON (built-in or custom from chrome.storage)
5. service-worker.js → chrome.tabs.sendMessage to all Sophos tabs
6. bridge.js receives → dispatches CustomEvent to MAIN world
7. interceptor.js receives → resolves templates → stores as activeScenario
8. Next API call: interceptor checks URL → applies modifications → React renders fake data
```

### AI Scenario Generator Architecture

```
┌───────────────────────────────┐
│  Intake Website (:3847)       │
│                               │
│  Frontend (index.html)        │
│  - Intake form                │
│  - Preview + download         │
│                               │
│  Backend (index.mjs)          │
│  - Pi SDK (OAuth auth)        │
│  - createAgentSession()       │
│  - Claude Sonnet 4 generates  │
│    scenario JSON              │
│  - System prompt includes:    │
│    - Full SCHEMA.md           │
│    - 2 example scenarios      │
│    - Industry guidance        │
│    - MITRE ATT&CK reference   │
│    - Threat actor database    │
└───────────────────────────────┘
```

The intake site uses **Pi SDK's `AuthStorage`** for OAuth token management. Pi handles token refresh automatically — no raw API keys needed. Each scenario generation creates a lightweight in-memory `AgentSession`, sends one prompt, collects the response, and disposes the session.

---

## Distribution

### For Individual SEs

**Option A — Share the repo:**
```bash
git clone https://github.com/jasoaco79/sophos-demo.git
```
Then follow the [Installation](#installation) steps.

**Option B — Share just the extension folder:**
Zip up the `extension/` directory and share via Slack/Drive/email. SE unzips and loads unpacked.

**Option C — Share scenarios only:**
If SEs already have the extension installed, share just the `.json` scenario files. They import via the popup.

### For Team-Wide Deployment

**Chrome Enterprise Policy (if available):**
Force-install the extension via Google Workspace admin console. Zero action needed from SEs.

**Private Chrome Web Store:**
Publish as an unlisted extension. Share the direct install link. Auto-updates when you push new versions.

---

## Roadmap

### Planned
- [ ] Identify and intercept the exact Devices list page API (waiting on API documentation)
- [ ] Dashboard widget chart visual overrides
- [ ] Threat graph renderer compatibility (match exact Sophos data format)
- [ ] Device detail page interception
- [ ] Scenario library — shared repository of scenarios by industry/use case
- [ ] Scenario "remix" — take an existing scenario and tweak for a new customer
- [ ] Timed events — "alert fires 30 seconds into the demo" for live drama

### Ideas
- [ ] Sophos Firewall dashboard integration
- [ ] Partner dashboard override (for MSP demos)
- [ ] Multi-tenant scenario (show multiple customer tenants)
- [ ] Automatic scenario generation from prospect's real environment data
- [ ] Browser extension for Firefox

---

## File Structure

```
sophos-demo/
├── extension/                    Chrome extension
│   ├── manifest.json             Manifest V3 config
│   ├── content/
│   │   ├── interceptor.js        Core: fetch/XHR override + all interception rules (1200+ lines)
│   │   └── bridge.js             State relay: ISOLATED → MAIN world
│   ├── background/
│   │   └── service-worker.js     State management + scenario loading
│   ├── popup/
│   │   ├── popup.html            Scenario picker UI
│   │   └── popup.js              Toggle, import/export, settings
│   ├── scenarios/
│   │   ├── SCHEMA.md             Full schema reference
│   │   ├── ransomware.json       Built-in: CryptoLocker attack
│   │   ├── phishing.json         Built-in: Email phishing campaign
│   │   ├── xdr.json              Built-in: Multi-stage XDR investigation
│   │   └── healthy.json          Built-in: Clean environment
│   └── icons/                    Extension icons (16/48/128px)
│
├── intake-site/                  AI Scenario Generator
│   ├── server/index.mjs          Node.js server + Pi SDK backend
│   ├── public/index.html         Intake form frontend
│   └── package.json
│
├── scripts/                      Development utilities
│   ├── discover-apis.mjs         Initial API discovery via CDP
│   ├── capture-full-responses.mjs Full response body capture
│   ├── deep-capture-auto.mjs     Automated multi-page capture
│   └── generate-icons.mjs        Icon generation
│
├── data/                         Captured API data (gitignored partially)
│   ├── api-summary.json          Endpoint catalog
│   ├── full-responses.json       Complete API response bodies
│   ├── deep-capture-full.json    Case detail + threat graph captures
│   └── *.png                     Page screenshots
│
├── README.md                     This file
├── GAMEPLAN.md                   Original build plan + architecture decisions
└── .gitignore
```

---

## Credits

Built by Jason Acosta (Sophos SE) with AI assistance. The extension concept, scenario design, and demo workflows are informed by real-world SE experience. The AI scenario generator uses [Pi](https://github.com/mariozechner/pi-coding-agent) with Claude by Anthropic.
