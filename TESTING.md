# Sophos Demo Mode — Testing Plan

Comprehensive testing checklist for the Chrome extension, intake website, and all scenario functionality. Run through this before distributing to other SEs.

---

## Table of Contents

- [Test Environment Setup](#test-environment-setup)
- [Phase 1: Extension Loading](#phase-1-extension-loading)
- [Phase 2: Basic Functionality](#phase-2-basic-functionality)
- [Phase 3: Ransomware Scenario](#phase-3-ransomware-scenario)
- [Phase 4: Phishing Scenario](#phase-4-phishing-scenario)
- [Phase 5: XDR Investigation Scenario](#phase-5-xdr-investigation-scenario)
- [Phase 6: Healthy Environment Scenario](#phase-6-healthy-environment-scenario)
- [Phase 7: Custom Scenario Import/Export](#phase-7-custom-scenario-importexport)
- [Phase 8: AI Scenario Generator](#phase-8-ai-scenario-generator)
- [Phase 9: Edge Cases & Safety](#phase-9-edge-cases--safety)
- [Phase 10: Screenshots for Documentation](#phase-10-screenshots-for-documentation)
- [Bug Report Template](#bug-report-template)
- [Test Results Log](#test-results-log)

---

## Test Environment Setup

### Prerequisites
- [ ] Chrome (latest stable) installed
- [ ] Active Sophos Central account with at least 1 device registered
- [ ] Extension loaded at `chrome://extensions/` with Developer mode ON
- [ ] Extension icon pinned to toolbar (🎯)
- [ ] Browser console accessible (`F12` → Console tab)
- [ ] Intake site dependencies installed (`cd intake-site && npm link @mariozechner/pi-coding-agent`)

### Before Each Test Phase
- [ ] Toggle extension **OFF**
- [ ] Hard refresh Sophos Central (`Ctrl+Shift+R`)
- [ ] Verify real data is showing (your actual tenant name, real alerts/devices)
- [ ] Clear browser console

---

## Phase 1: Extension Loading

### 1.1 Fresh Install
- [ ] Remove extension from `chrome://extensions/` if previously loaded
- [ ] Click "Load unpacked" → select `extension/` folder
- [ ] Extension card appears with name "Sophos Central Demo Mode"
- [ ] Extension card shows version 1.1.0
- [ ] No errors shown on the extension card
- [ ] Click "Details" → verify "Service worker" link is present and clickable

### 1.2 Extension Icon
- [ ] Extension icon visible in toolbar after pinning
- [ ] No badge text shown when OFF
- [ ] Click icon → popup opens with scenario picker

### 1.3 Popup UI
- [ ] Popup renders correctly (no layout issues)
- [ ] Scenario dropdown shows 4 built-in scenarios grouped under "Built-in Scenarios"
- [ ] Toggle switch is OFF by default
- [ ] Customer name field shows "Contoso Healthcare"
- [ ] Endpoints field shows 2500
- [ ] Servers field shows 186
- [ ] Status bar shows "Inactive" with gray dot
- [ ] All 4 buttons present: 📥 Import, 📤 Export, 📁 File, 🔄 Reload
- [ ] Scenario description box shows correct text for selected scenario
- [ ] Switching scenarios changes the description text and color

### 1.4 Service Worker
- [ ] Go to `chrome://extensions/` → click "Service worker" link on extension card
- [ ] DevTools opens → Console tab shows no errors
- [ ] Type in console: `chrome.storage.local.get('demoState', d => console.log(d))` → state object appears

---

## Phase 2: Basic Functionality

### 2.1 Toggle ON/OFF
- [ ] Navigate to `https://central.sophos.com/manage/dashboard`
- [ ] Open browser console (`F12` → Console)
- [ ] Click extension icon → toggle ON → click "🔄 Apply & Reload Sophos Central"
- [ ] Console shows: `[Sophos Demo] 🎯 Interceptor loaded`
- [ ] Console shows: `[Sophos Demo] 🟢 ENABLED scenario=ransomware customer=Contoso Healthcare`
- [ ] Extension badge shows green "ON"
- [ ] **Tenant name** in top-right corner changes to "Contoso Healthcare"
- [ ] Toggle OFF → click reload
- [ ] Tenant name reverts to your real tenant name
- [ ] Extension badge disappears

### 2.2 Customer Name Override
- [ ] Toggle ON with customer name "Test Corp"
- [ ] Reload → top-right shows "Test Corp"
- [ ] Change customer name to "Acme Industries" in popup
- [ ] Reload → top-right shows "Acme Industries"
- [ ] Check multiple pages — tenant name should be consistent everywhere

### 2.3 Write Blocking
- [ ] Toggle ON with any scenario
- [ ] Navigate to Alerts page
- [ ] If there are any alerts (real or fake), try clicking "Acknowledge" on one
- [ ] Console should show: `[Sophos Demo] 🛡️ Blocked POST ...`
- [ ] The UI should show success (but nothing actually happened)
- [ ] Toggle OFF → reload → verify the alert is still there (not actually acknowledged)

### 2.4 Console Logging
- [ ] With demo mode ON, navigate through several pages
- [ ] Console should show `[Sophos Demo]` prefixed messages for intercepted APIs
- [ ] Look for any `[Sophos Demo] 🔍 Unhandled:` messages — note the URLs for future interception
- [ ] No JavaScript errors in console (red text) related to the extension

---

## Phase 3: Ransomware Scenario

### Setup
- [ ] Select "🔴 Ransomware Attack" scenario
- [ ] Customer name: "Contoso Healthcare"
- [ ] Endpoints: 2500, Servers: 186
- [ ] Toggle ON → Reload

### 3.1 Dashboard
- [ ] Navigate to Dashboard (`/manage/overview/dashboard` or `/manage/dashboard`)
- [ ] Tenant name shows "Contoso Healthcare"
- [ ] **Take screenshot** → `screenshots/ransomware-dashboard.png`
- [ ] Note: What numbers are visible? Alert counts? Health score? Endpoint count?
- [ ] Any widget charts showing? Do they reflect fake data?

### 3.2 Alerts Page
- [ ] Navigate to Alerts (`/manage/alerts`)
- [ ] **Expected:** 4 fake alerts prepended to any real alerts
  - High: "Ransomware detected: 'Troj/Ransom-GKL'" on DESKTOP-FIN042
  - High: "CryptoGuard detected ransomware activity" on DESKTOP-FIN042
  - High: "Tamper Protection blocked attempt to disable real-time protection"
  - Medium: "Malware detected: 'Mal/Generic-S'" — invoice_march2026.exe
- [ ] Alert summary counts updated (high +3, medium +1)
- [ ] Alert timestamps show relative time (e.g., "3 minutes ago")
- [ ] **Take screenshot** → `screenshots/ransomware-alerts.png`
- [ ] Click on the first alert — does the detail view open?
- [ ] Note any rendering issues

### 3.3 Cases Page
- [ ] Navigate to Threat Analysis Center → Cases
- [ ] **Expected:** Fake case at top: "(DESKTOP-FIN042) | Ransomware Attack — Contoso Healthcare"
  - Status: Investigating
  - Assignee: SOC Analyst
  - Detection count: 24
  - Managed By: Self
- [ ] **Take screenshot** → `screenshots/ransomware-cases-list.png`

### 3.4 Case Detail
- [ ] Click into the fake ransomware case
- [ ] **Overview tab:**
  - [ ] Case name, status, assignee visible
  - [ ] MITRE Tactics section shows TA0002, TA0005, TA0040
  - [ ] Impacted Entities shows DESKTOP-FIN042 + IP addresses
  - [ ] Detection count shows
  - [ ] **Take screenshot** → `screenshots/ransomware-case-detail.png`
- [ ] **Detections tab:**
  - [ ] Click "Detections" tab
  - [ ] Shows detection entries related to the case
  - [ ] Note: Does it render or show empty?
- [ ] **Notebook tab:**
  - [ ] Click "Notebook" tab
  - [ ] Expected: empty or minimal content
  - [ ] Note rendering
- [ ] **History tab:**
  - [ ] Click "History" tab
  - [ ] **Expected:** Activity timeline entries:
    - "Created XdrCase"
    - "CryptoGuard blocked ransomware encryption on DESKTOP-FIN042"
    - "Tamper Protection blocked attempt to disable real-time scanning"
    - "Malicious file quarantined: invoice_march2026.exe"
  - [ ] **Take screenshot** → `screenshots/ransomware-case-history.png`
- [ ] **Respond tab:**
  - [ ] Click "Respond" tab
  - [ ] Note what renders

### 3.5 Detections Page
- [ ] Navigate to Threat Analysis Center → Detections
- [ ] **Expected:** 2 fake detections prepended:
  - Risk 9: Shadow copy deletion (DESKTOP-FIN042)
  - Risk 8: Ransomware executable (DESKTOP-FIN042)
- [ ] Detections show MITRE mapping
- [ ] Detection timeline bar chart updated
- [ ] **Take screenshot** → `screenshots/ransomware-detections.png`
- [ ] Click into a detection — does detail view render?

### 3.6 Threat Graphs
- [ ] Navigate to Threat Analysis Center → Threat Graphs
- [ ] **Expected:** 1 threat graph case listed (invoice_march2026.exe on DESKTOP-FIN042)
- [ ] Click into the threat graph
- [ ] **Expected:** Process tree auto-generated from detection data
- [ ] Note: Does the visual graph render, or just the data?
- [ ] **Take screenshot** → `screenshots/ransomware-threat-graph.png`

### 3.7 Account Health
- [ ] Navigate to Account Health Check
- [ ] **Expected:** Health score shows 72 (not 98)
- [ ] Tenant name shows "Contoso Healthcare"
- [ ] **Take screenshot** → `screenshots/ransomware-health.png`

### 3.8 Audit Logs
- [ ] Navigate to logs/audit page
- [ ] **Expected:** 4 fake audit entries prepended:
  - Device isolation initiated (DESKTOP-FIN042)
  - Threat cleanup initiated (CryptoLocker)
  - CryptoGuard activation (47 files protected)
  - Tamper Protection triggered
- [ ] **Take screenshot** → `screenshots/ransomware-audit.png`
- [ ] Note: Do the entries render in the audit log table, or is this a micro-frontend page?

### 3.9 Live Discover
- [ ] Navigate to Threat Analysis Center → Live Discover
- [ ] **Expected:** Pre-populated query results for "Ransomware Indicator Hunt"
  - 4 result rows: powershell (shadow deletion), powershell (encrypt.ps1), invoice_march2026.exe, wmic
- [ ] Note: Does the query results table render, or is this a micro-frontend page?
- [ ] **Take screenshot** → `screenshots/ransomware-live-discover.png`

### 3.10 Endpoint Count
- [ ] Dashboard should show 2,500 endpoints somewhere
- [ ] Account Health page should reference endpoint count
- [ ] Navigate to Devices → Computers
- [ ] Note: Does the device count show 2,500 or your real count?
- [ ] Note: Does the device list table show fake devices or real ones?
- [ ] **Take screenshot** → `screenshots/ransomware-devices.png`

---

## Phase 4: Phishing Scenario

### Setup
- [ ] Select "🟠 Phishing Campaign" scenario
- [ ] Customer name: "Pinnacle Financial"
- [ ] Endpoints: 3500, Servers: 200
- [ ] Toggle ON → Reload

### 4.1 Alerts
- [ ] Navigate to Alerts page
- [ ] **Expected:** 3 fake alerts:
  - High: "Targeted phishing campaign detected: 47 emails blocked"
  - High: "User sarah.chen clicked phishing link — blocked by endpoint"
  - Medium: "12 additional suspicious emails quarantined"
- [ ] Alert summary: high +2, medium +1
- [ ] **Take screenshot** → `screenshots/phishing-alerts.png`

### 4.2 Cases
- [ ] Navigate to Cases page
- [ ] **Expected:** 1 case: "Targeted Phishing Campaign — Pinnacle Financial"
  - Status: Investigating
  - MITRE: T1566.002 (Spearphishing Link), T1556 (Modify Authentication Process)
- [ ] Click into the case → verify Overview tab renders

### 4.3 Detections
- [ ] Navigate to Detections page
- [ ] **Expected:** 2 detections:
  - Email gateway: bulk phishing campaign (47 emails, SMTP-GW01)
  - Endpoint: user click blocked (DESKTOP-HR007, sarah.chen)
- [ ] **Take screenshot** → `screenshots/phishing-detections.png`

### 4.4 Email Stats
- [ ] Check Dashboard for email statistics widget
- [ ] **Expected:** 47 threats, 1284 scanned, 89 spam, 784 legitimate
- [ ] Note: Does the email stats widget render with fake numbers?

### 4.5 Email History
- [ ] Navigate to email message history/search (if accessible)
- [ ] **Expected:** 5 sample emails with varied statuses (BLOCKED, QUARANTINED, DELIVERED)
- [ ] Note: Does this page exist in your Sophos Central? What URL?
- [ ] **Take screenshot if accessible** → `screenshots/phishing-email-history.png`

### 4.6 Quarantine
- [ ] Navigate to email quarantine (if accessible)
- [ ] **Expected:** 3 quarantined messages including post-delivery clawback
- [ ] Note: What URL is the quarantine page?

### 4.7 Audit Logs
- [ ] **Expected:** 3 entries:
  - "Bulk phishing campaign blocked" (47 emails)
  - "Post-delivery remediation" (12 messages clawed back)
  - "Malicious URL blocked at endpoint" (sarah.chen on DESKTOP-HR007)

### 4.8 Health Score
- [ ] **Expected:** 89

---

## Phase 5: XDR Investigation Scenario

### Setup
- [ ] Select "🔵 XDR Investigation" scenario
- [ ] Customer name: "Meridian Manufacturing"
- [ ] Endpoints: 5000, Servers: 400
- [ ] Toggle ON → Reload

### 5.1 Alerts
- [ ] **Expected:** 3 alerts across 3 hosts:
  - High: Cobalt Strike beacon on SRV-DC01 (lateral movement from DESKTOP-MKT003)
  - High: CVE-2026-1234 exploit on DESKTOP-MKT003 (initial access)
  - Medium: Data staging on SRV-DB02 (2.4GB database export)
- [ ] **Take screenshot** → `screenshots/xdr-alerts.png`

### 5.2 Cases
- [ ] **Expected:** 1 case: "Multi-Stage Attack — Meridian Manufacturing (Active)"
  - Status: Investigating
  - Assignee: SOC Analyst
  - Detection count: 31
  - MITRE: 5 tactics (Initial Access → Persistence → Lateral Movement → Collection → Exfiltration)
- [ ] Click into case → verify all tabs
- [ ] **Take screenshot** → `screenshots/xdr-case-detail.png`

### 5.3 Case Detail — MITRE Summary
- [ ] In case Overview, MITRE Tactics section should show:
  - TA0001 Initial Access (T1190 Exploit Public-Facing Application)
  - TA0003 Persistence (T1053.005 Scheduled Task)
  - TA0008 Lateral Movement (T1021.002 SMB/Windows Admin Shares)
  - TA0009 Collection (T1560.001 Archive Collected Data)
  - TA0010 Exfiltration (T1048.003 Exfiltration Over Unencrypted Protocol)

### 5.4 Case Detail — Impacted Entities
- [ ] Should show: DESKTOP-MKT003, SRV-DC01, SRV-DB02 (3 devices)
- [ ] Plus IP addresses

### 5.5 Case Detail — History
- [ ] **Expected activities:**
  - "Adaptive Attack Protection activated on DESKTOP-MKT003"
  - "Lateral movement detected: SMB connection from MKT003 to DC01"
  - "Outbound data transfer blocked: SRV-DB02 attempted 2.4GB upload"

### 5.6 Detections
- [ ] **Expected:** 2 detections:
  - Risk 8: Browser exploit on DESKTOP-MKT003
  - Risk 9: Cobalt Strike on SRV-DC01 (AD reconnaissance)
- [ ] Both should have MITRE mapping

### 5.7 Threat Graphs
- [ ] **Expected:** 1 threat graph (Cobalt Strike beacon on DESKTOP-MKT003)
- [ ] Auto-generated graph should show multi-host process tree

### 5.8 Audit Logs
- [ ] **Expected:** 5 entries:
  - Device isolation: DESKTOP-MKT003
  - Device isolation: SRV-DC01
  - Device isolation: SRV-DB02
  - Credentials flagged for reset (mike.jones, svc-backup, domain-admin)
  - Firewall rule blocking C2 (45.33.49.12)
- [ ] **Take screenshot** → `screenshots/xdr-audit.png`

### 5.9 Live Discover
- [ ] **Expected:** "Lateral Movement & Credential Theft Indicators" query
  - 6 result rows across 3 hosts
  - msedge.exe exploit, net group enumeration, nltest, PowerShell beacon download, beacon.exe, sqlcmd export
- [ ] **Take screenshot** → `screenshots/xdr-live-discover.png`

### 5.10 Health Score
- [ ] **Expected:** 84

---

## Phase 6: Healthy Environment Scenario

### Setup
- [ ] Select "🟢 Healthy Environment" scenario
- [ ] Customer name: "Summit Legal Group"
- [ ] Endpoints: 800, Servers: 50
- [ ] Toggle ON → Reload

### 6.1 Dashboard
- [ ] Everything should look clean and green
- [ ] Tenant name: "Summit Legal Group"
- [ ] **Take screenshot** → `screenshots/healthy-dashboard.png`

### 6.2 Alerts
- [ ] **Expected:** ZERO alerts (override mode replaces all)
- [ ] Alert summary: high 0, medium 0, low 0
- [ ] **Take screenshot** → `screenshots/healthy-alerts.png`

### 6.3 Cases
- [ ] **Expected:** ZERO cases
- [ ] **Take screenshot** → `screenshots/healthy-cases.png`

### 6.4 Detections
- [ ] **Expected:** ZERO detections

### 6.5 Health Score
- [ ] **Expected:** 98
- [ ] **Take screenshot** → `screenshots/healthy-health.png`

### 6.6 Endpoint Count
- [ ] Should show 800 endpoints somewhere on dashboard/reports

### 6.7 Email Stats
- [ ] **Expected:** Clean stats (0 threats, 2341 scanned, 2296 legitimate)

---

## Phase 7: Custom Scenario Import/Export

### 7.1 Export Built-in Scenario
- [ ] Select "Ransomware Attack" in dropdown
- [ ] Click 📤 (Export)
- [ ] A file `ransomware-default.json` downloads
- [ ] Open the file — valid JSON with all scenario sections
- [ ] Toast shows "Exported: Ransomware Attack"

### 7.2 Import from File
- [ ] Click 📁 (File import)
- [ ] Select the exported `.json` file
- [ ] Toast shows "Imported: [name]"
- [ ] New scenario appears under "Custom Scenarios" in dropdown
- [ ] Select it — customer name/endpoint count auto-populate

### 7.3 Import from Paste
- [ ] Click 📥 (Import)
- [ ] Import area appears with textarea
- [ ] Paste this minimal scenario:
  ```json
  {
    "id": "test-paste",
    "name": "Test Paste Scenario",
    "description": "Testing paste import",
    "customer": { "name": "Test Corp", "endpointCount": 100, "serverCount": 10 },
    "alerts": { "mode": "override", "items": [], "summaryDelta": { "high": 0, "medium": 0, "low": 0 } },
    "billing": { "overrideName": "{{customerName}}", "overrideAlias": "{{customerName}}" },
    "user": { "overrideCompany": "{{customerName}}", "overrideAlias": "{{customerName}}" },
    "healthScore": { "override": 100 }
  }
  ```
- [ ] Click "Import" → toast shows success
- [ ] Scenario appears in dropdown
- [ ] Toggle ON → reload → tenant name shows "Test Corp", health score 100, zero alerts

### 7.4 Import Invalid JSON
- [ ] Click 📥 → paste `{invalid json`
- [ ] Click Import → error toast appears
- [ ] Extension doesn't crash

### 7.5 Delete Custom Scenario
- [ ] Select a custom scenario
- [ ] 🗑️ button appears
- [ ] Click 🗑️ → confirm → scenario removed from dropdown
- [ ] Dropdown falls back to "Ransomware Attack"

### 7.6 Scenario Switching
- [ ] Toggle ON with Ransomware scenario → reload → verify ransomware data
- [ ] Switch to Phishing scenario in popup → reload → verify phishing data
- [ ] Switch to Healthy → reload → verify zero alerts
- [ ] Switch back to Ransomware → reload → verify ransomware data returns
- [ ] No stale data from previous scenarios bleeds through

---

## Phase 8: AI Scenario Generator

### Setup
- [ ] Kill any existing intake server: `pkill -f "intake-site"`
- [ ] Start server: `cd intake-site && npm start`
- [ ] Verify: `http://localhost:3847` loads the intake form

### 8.1 Form Rendering
- [ ] Page loads with Sophos branding header
- [ ] All form sections visible: Customer Details, Scenario Type, Attack Details, Custom Story, Demo Focus
- [ ] Scenario type cards are clickable (Ransomware selected by default)
- [ ] Industry dropdown has 12 options
- [ ] Products dropdown has 6 options
- [ ] Threat actor dropdown has 11 options
- [ ] Competitor dropdown has 6 options
- [ ] **Take screenshot** → `screenshots/intake-form.png`

### 8.2 Generate Ransomware Scenario
- [ ] Fill out:
  - Customer: "Mercy Hospital"
  - Industry: Healthcare
  - Endpoints: 4200
  - Servers: 300
  - Scenario: Ransomware Attack
  - Threat actor: LockBit 3.0
  - Entry point: Phishing Email
  - Hosts affected: 4
  - Department: Billing
  - MDR: No
  - Story: "LockBit via phishing to billing department. CryptoGuard blocked encryption."
  - Focus: Endpoint + XDR
  - Competitor: CrowdStrike
- [ ] Click "Generate Scenario"
- [ ] Loading spinner shows (~10-20 seconds)
- [ ] Result panel appears with:
  - ✅ Scenario Ready header
  - Summary stats (Alerts, Cases, Detections, Health Score)
  - JSON preview with syntax
  - File name and size
- [ ] **Take screenshot** → `screenshots/intake-result.png`
- [ ] Verify generated JSON:
  - [ ] Has `id` field
  - [ ] Has `customer.name` = "Mercy Hospital"
  - [ ] Has `alerts.items` with 3+ alerts
  - [ ] Has `cases.items` with 1+ case
  - [ ] Has `detections.items` with 2+ detections
  - [ ] Has `healthScore.override` < 90
  - [ ] Hostnames are healthcare-appropriate (HIS-SRV, PACS-WKS, BILLING-WS, etc.)
  - [ ] MITRE ATT&CK IDs are real (TA00xx, T1xxx)
  - [ ] Uses `{{customerName}}` templates
  - [ ] Uses relative timestamps (-3m, -2h, etc.)
  - [ ] Alert descriptions are clear and demo-worthy

### 8.3 Generate MDR Scenario
- [ ] Same as above but:
  - Scenario: MDR Response
  - MDR: Yes
- [ ] Verify generated JSON:
  - [ ] `cases.items[0].managedBy` = `"mtr"`
  - [ ] `cases.items[0].assignee.name` = `"Sophos MDR Team"`
  - [ ] `cases.items[0].status` = `"containment"` or `"investigating"`
  - [ ] Has MDR-specific activities in case detail

### 8.4 Copy JSON
- [ ] Click "📋 Copy JSON"
- [ ] Button text changes to "✅ Copied!"
- [ ] Paste into a text editor — valid JSON

### 8.5 Download JSON
- [ ] Click "💾 Download .json"
- [ ] File downloads with scenario ID as filename
- [ ] Open file — valid JSON, matches what was shown in preview

### 8.6 Import Generated Scenario into Extension
- [ ] Download the generated scenario `.json` file
- [ ] In Chrome, click extension icon → 📁 → select the downloaded file
- [ ] Scenario appears in dropdown under "Custom Scenarios"
- [ ] Customer name auto-populates from the scenario
- [ ] Toggle ON → Reload
- [ ] Verify the generated data shows in Sophos Central:
  - [ ] Tenant name matches
  - [ ] Alerts render correctly
  - [ ] Cases render with correct MITRE mapping
  - [ ] Health score matches
- [ ] **Take screenshot** → `screenshots/generated-scenario-live.png`

### 8.7 Error Handling
- [ ] Submit form with empty customer name → should still generate (AI fills in defaults)
- [ ] Kill the server mid-generation → error toast appears in browser
- [ ] Start server again → next generation works

---

## Phase 9: Edge Cases & Safety

### 9.1 Multiple Tabs
- [ ] Open 3 Sophos Central tabs
- [ ] Toggle ON → reload all 3
- [ ] All 3 should show demo data with same tenant name
- [ ] Toggle OFF → reload all 3
- [ ] All 3 revert to real data

### 9.2 SPA Navigation (No Reload)
- [ ] Toggle ON → reload once
- [ ] Navigate between pages using Sophos Central's sidebar/nav (no full page reload)
- [ ] Do alerts persist when navigating Dashboard → Alerts → Cases → back to Dashboard?
- [ ] Does the tenant name stay overridden across SPA navigations?
- [ ] Note: Some pages may require a reload to show demo data

### 9.3 Real Data Untouched
- [ ] Toggle ON → navigate to Cases → see fake case
- [ ] Toggle OFF → reload → fake case is gone
- [ ] Verify real cases are still there, unchanged
- [ ] Check Alerts similarly — real alerts should be unmodified

### 9.4 Action Blocking
- [ ] Toggle ON with ransomware scenario
- [ ] Try these actions and verify they're blocked (fake success):
  - [ ] Acknowledge an alert
  - [ ] Create a new case (if possible)
  - [ ] Isolate a device (if option available)
  - [ ] Any other POST/PUT/DELETE action
- [ ] Console should show `[Sophos Demo] 🛡️ Blocked POST/PUT/DELETE ...` for each

### 9.5 Extension Reload
- [ ] With demo mode ON, go to `chrome://extensions/`
- [ ] Click the refresh icon on the extension card
- [ ] Go back to Sophos Central tab
- [ ] **Expected:** "Extension context invalidated" error may appear
- [ ] Refresh the Sophos Central tab → demo data should work again

### 9.6 Rapid Toggle
- [ ] Toggle ON → OFF → ON → OFF rapidly
- [ ] Reload → should be in whatever the last state was
- [ ] No crashes or stuck states

### 9.7 Long Session
- [ ] Toggle ON
- [ ] Leave Sophos Central open for 30+ minutes
- [ ] Navigate around
- [ ] Demo data should still be active (interceptor doesn't expire)

### 9.8 Different Sophos Central Pages
Test each major section of Sophos Central. Mark whether demo data appears:

| Page | URL Pattern | Demo Data Shows? | Notes |
|------|------------|-----------------|-------|
| Dashboard | `/manage/overview/dashboard` | | |
| Partner Dashboard | `/manage/partner/dashboard` | | |
| Alerts | `/manage/alerts` | | |
| Devices → Computers | `/manage/devices/computers` | | |
| Devices → Servers | `/manage/devices/servers` | | |
| Endpoint Policies | `/manage/endpoint-protection/policies` | | |
| Firewall Management | `/manage/firewall` | | |
| TAC → Detections | `/manage/threat-analysis-center/detections` | | |
| TAC → Cases | `/manage/threat-analysis-center/cases` | | |
| TAC → Threat Graphs | `/manage/threat-analysis-center/threat-graphs` | | |
| TAC → Live Discover | `/manage/threat-analysis-center/live-discover` | | |
| Account Health | `/manage/account-health-check` | | |
| People | `/manage/people` | | |
| Audit Logs | `/manage/logs/audit` | | |
| Global Settings | `/manage/config` | | |
| Reports | `/manage/reports` | | |
| Email Security | varies | | |

---

## Phase 10: Screenshots for Documentation

Take screenshots during the above testing phases and save them to `screenshots/` in the repo root. These will be embedded in the README.

### Required Screenshots

**Extension UI:**
- [ ] `screenshots/popup-off.png` — Popup with toggle OFF, showing scenario picker
- [ ] `screenshots/popup-on.png` — Popup with toggle ON, green status dot, intercepted count
- [ ] `screenshots/extensions-page.png` — chrome://extensions/ showing the loaded extension

**Ransomware Scenario:**
- [ ] `screenshots/ransomware-dashboard.png`
- [ ] `screenshots/ransomware-alerts.png`
- [ ] `screenshots/ransomware-cases-list.png`
- [ ] `screenshots/ransomware-case-detail.png`
- [ ] `screenshots/ransomware-case-history.png`
- [ ] `screenshots/ransomware-detections.png`
- [ ] `screenshots/ransomware-threat-graph.png`
- [ ] `screenshots/ransomware-health.png`
- [ ] `screenshots/ransomware-audit.png`
- [ ] `screenshots/ransomware-live-discover.png`

**Other Scenarios:**
- [ ] `screenshots/phishing-alerts.png`
- [ ] `screenshots/xdr-case-detail.png`
- [ ] `screenshots/xdr-audit.png`
- [ ] `screenshots/healthy-dashboard.png`

**Intake Site:**
- [ ] `screenshots/intake-form.png`
- [ ] `screenshots/intake-result.png`
- [ ] `screenshots/generated-scenario-live.png`

**Before/After:**
- [ ] `screenshots/before-demo-mode.png` — Real Sophos Central (demo mode OFF)
- [ ] `screenshots/after-demo-mode.png` — Same page with demo mode ON

---

## Bug Report Template

When you find an issue during testing, log it here:

```
### Bug: [Short Title]
**Phase:** [e.g., Phase 3.4 — Case Detail]
**Scenario:** [e.g., Ransomware]
**Page:** [URL]
**Expected:** [What should happen]
**Actual:** [What happened instead]
**Console Errors:** [Any red/yellow messages in browser console]
**Screenshot:** [filename if taken]
**Severity:** Critical / High / Medium / Low
**Notes:** [Any additional context]
```

---

## Test Results Log

Record results here as you test:

| Phase | Test | Pass/Fail | Notes | Date |
|-------|------|-----------|-------|------|
| 1.1 | Fresh Install | | | |
| 1.2 | Extension Icon | | | |
| 1.3 | Popup UI | | | |
| 1.4 | Service Worker | | | |
| 2.1 | Toggle ON/OFF | | | |
| 2.2 | Customer Name | | | |
| 2.3 | Write Blocking | | | |
| 2.4 | Console Logging | | | |
| 3.1 | Ransomware Dashboard | | | |
| 3.2 | Ransomware Alerts | | | |
| 3.3 | Ransomware Cases | | | |
| 3.4 | Ransomware Case Detail | | | |
| 3.5 | Ransomware Detections | | | |
| 3.6 | Ransomware Threat Graphs | | | |
| 3.7 | Ransomware Health Score | | | |
| 3.8 | Ransomware Audit Logs | | | |
| 3.9 | Ransomware Live Discover | | | |
| 3.10 | Ransomware Endpoint Count | | | |
| 4.1-4.8 | Phishing (all) | | | |
| 5.1-5.10 | XDR (all) | | | |
| 6.1-6.7 | Healthy (all) | | | |
| 7.1-7.6 | Import/Export (all) | | | |
| 8.1-8.7 | AI Generator (all) | | | |
| 9.1-9.8 | Edge Cases (all) | | | |
| 10 | Screenshots | | | |
