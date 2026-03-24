# Sophos Demo Injector — Production Readiness Test Plan

**Date:** 2026-03-24  
**Goal:** Validate all 9 scenarios and core functionality before distributing to other SEs  
**Estimated time:** 4-6 hours total across 3 phases

---

## Phase 1: Scenario Validation (2-3 hours)

Test each scenario end-to-end. For each one:
1. Select scenario in popup, set customer name, toggle ON, reload
2. Walk through the key pages
3. Note any "Oops" errors, missing data, or visual issues
4. Toggle OFF, reload, confirm real data returns

### 1.1 Ransomware Attack ⬜
- [ ] Cases list — injected case appears with correct severity/status
- [ ] Case detail — click into case, verify:
  - [ ] Timeline/activities load
  - [ ] MITRE ATT&CK summary shows
  - [ ] Impacted entities show
- [ ] Alerts page — injected alerts appear
- [ ] Detections page — detections appear
- [ ] TAC Dashboard — donut/bar/table widgets populate
- [ ] Device Exposure — widgets populate
- [ ] Threat Graphs — graph appears
- [ ] Tenant name shows "customer name" in top right
- [ ] Timed events fire (check console after ~60s)

### 1.2 MDR Response ⬜
- [ ] Cases list — 5 MDR cases appear (1 containment, 1 resolved, 3 closed)
- [ ] Case detail — primary case shows:
  - [ ] 14 timeline entries
  - [ ] 8 MITRE tactics
  - [ ] 4 impacted entities
  - [ ] 4 notebook sections (Executive Summary, Timeline, Recommendations, IOCs)
- [ ] Alerts page — 5 alerts appear
- [ ] Detections page — 3 detections
- [ ] TAC Dashboard — widgets show MDR case data
- [ ] All cases show "Sophos MDR Team" as assignee

### 1.3 Phishing Campaign ⬜
- [ ] Cases list — case appears
- [ ] Case detail — loads without error
- [ ] Alerts page — phishing alerts appear
- [ ] Detections page — detections load
- [ ] Email history (if applicable) — messages show
- [ ] TAC Dashboard — widgets populate

### 1.4 XDR Investigation ⬜
- [ ] Cases list — case appears
- [ ] Case detail — multi-stage kill chain in MITRE
- [ ] Alerts page — alerts appear
- [ ] Detections page — multi-host detections
- [ ] Threat Graphs — lateral movement graph
- [ ] Live Discover — query results appear
- [ ] TAC Dashboard — widgets populate

### 1.5 Insider Threat ⬜
- [ ] Cases list — case appears
- [ ] Case detail — loads without error
- [ ] Alerts page — data exfiltration alerts
- [ ] Detections page — detections load
- [ ] TAC Dashboard — widgets populate

### 1.6 Business Email Compromise (BEC) ⬜
- [ ] Cases list — case appears
- [ ] Case detail — loads without error
- [ ] Alerts page — BEC alerts
- [ ] Email history (if applicable)
- [ ] TAC Dashboard — widgets populate

### 1.7 Supply Chain Attack ⬜
- [ ] Cases list — case appears
- [ ] Case detail — loads without error
- [ ] Alerts page — supply chain alerts
- [ ] Detections page — detections load
- [ ] TAC Dashboard — widgets populate

### 1.8 Zero-Day Exploit ⬜
- [ ] Cases list — case appears
- [ ] Case detail — loads without error
- [ ] Alerts page — zero-day alerts
- [ ] Detections page — behavioral detection
- [ ] TAC Dashboard — widgets populate

### 1.9 Healthy Environment ⬜
- [ ] Cases list — clean (no injected cases or real cases shown)
- [ ] Alerts page — clean
- [ ] Dashboard — high health score, device counts match settings
- [ ] Account Health — score overridden
- [ ] TAC Dashboard — widgets show zero/clean data

---

## Phase 2: Core Functionality (1-2 hours)

### 2.1 Extension Basics ⬜
- [ ] Fresh install — load unpacked from extension/ folder, no errors on extension card
- [ ] Pin icon — 🎯 appears in toolbar
- [ ] Popup opens — scenario dropdown, customer name, endpoint/server count, badge toggle
- [ ] Toggle ON/OFF — status dot changes, badge shows/hides
- [ ] Apply & Reload — page reloads, data changes
- [ ] Toggle OFF + reload — real data returns completely

### 2.2 Custom Name & Scale ⬜
- [ ] Set customer name to "Test Corp" — top-right shows "Test Corp"
- [ ] Set endpoints to 5000 — device counts reflect 5000
- [ ] Set servers to 400 — server counts reflect 400
- [ ] Customer name consistent across all pages

### 2.3 Floating Demo Badge ⬜
- [ ] Badge visible when ON — shows scenario name, customer, intercept count
- [ ] Click badge — toggles opacity (fade out/in)
- [ ] Uncheck "Show floating demo badge" — badge disappears
- [ ] Re-check — badge reappears
- [ ] Badge persists across page navigations

### 2.4 Scenario Switching ⬜
- [ ] Switch from Ransomware → MDR → reload — MDR data appears
- [ ] Switch from MDR → Healthy → reload — clean environment
- [ ] Switch back to Ransomware → reload — ransomware data appears
- [ ] No stale data from previous scenario visible

### 2.5 Import/Export ⬜
- [ ] Export current scenario — .json file downloads
- [ ] Import via paste — paste JSON, click Import, appears in dropdown under "Custom"
- [ ] Import via file — click 📁, select .json file, imports
- [ ] Custom scenario selected — customer name/endpoints auto-fill from scenario
- [ ] Delete custom scenario — 🗑️ button removes it
- [ ] Built-in scenarios — cannot be deleted

### 2.6 Write Blocking ⬜
- [ ] With demo ON, try to acknowledge an alert — should fake-succeed
- [ ] With demo ON, try to isolate a device — should fake-succeed
- [ ] Check console — should see "🛡️ Blocked POST/PUT/DELETE" messages
- [ ] No actual changes made to Sophos Central

### 2.7 What-If Mode ⬜
- [ ] Ctrl+Shift+1 — ransomware alert injected
- [ ] Ctrl+Shift+2 — phishing alert injected
- [ ] Ctrl+Shift+3 — lateral movement alert
- [ ] Ctrl+Shift+4 — exfiltration alert
- [ ] Ctrl+Shift+5 — isolation notification
- [ ] Navigate to Alerts page — What-If alerts visible

### 2.8 Extension Reload Resilience ⬜
- [ ] Go to chrome://extensions, click 🔄 on extension card
- [ ] No "Extension context invalidated" errors in console
- [ ] Hard refresh Sophos Central — extension works normally
- [ ] Repeat reload 3 times — no accumulating errors

### 2.9 SPA Navigation ⬜
- [ ] With demo ON, navigate: Dashboard → Cases → Case Detail → back to Cases
- [ ] Data persists on each page (no "No data available" flicker)
- [ ] TAC Dashboard → Cases → TAC Dashboard — widgets repopulate
- [ ] Device Exposure → Cases → Device Exposure — widgets repopulate

---

## Phase 3: Intake Site & Distribution (1 hour)

### 3.1 Login ⬜
- [ ] https://injector.grimstarr.com — redirects to login
- [ ] Wrong passcode — error shown, redirects back
- [ ] Correct passcode (Sophos2026!) — redirected to builder
- [ ] Session persists — refresh page, still logged in
- [ ] Logout button — returns to login page

### 3.2 Scenario Builder ⬜
- [ ] Fill form — customer name, industry, scenario type
- [ ] Generate Scenario — AI generates valid JSON
- [ ] Download .json — file downloads
- [ ] Copy JSON — clipboard works
- [ ] Import into extension — scenario loads correctly

### 3.3 AI Tools ⬜
- [ ] Demo Script — streams talk track
- [ ] Battle Card — streams competitive analysis (requires competitor selected)
- [ ] Follow-Up Email — streams post-demo email
- [ ] Prospect Enrichment — auto-fills form from company name

### 3.4 Scenario Library ⬜
- [ ] /scenarios.html — grid of all built-in scenarios loads
- [ ] Make It Mine — clones scenario with custom name
- [ ] Download — scenario JSON downloads

### 3.5 Guide Page ⬜
- [ ] /guide.html — full guide renders
- [ ] Download Extension — .zip file downloads
- [ ] Extension info badge — shows version and scenario count
- [ ] Screenshots load

### 3.6 Settings ⬜
- [ ] /settings.html — server info shows
- [ ] LLM Provider — current provider highlighted
- [ ] Test Connection — sends test generation, shows latency
- [ ] Change Passcode — works with current passcode verification
- [ ] Demo Defaults — save and clear work

### 3.7 Mobile ⬜
- [ ] Login page — card fits on mobile screen
- [ ] Builder — hamburger menu works, form stacks properly
- [ ] Library — cards stack single column
- [ ] Guide — download button full-width, steps readable

### 3.8 Extension Download ⬜
- [ ] Download .zip from guide page
- [ ] Unzip to new folder
- [ ] Load unpacked in a fresh Chrome profile
- [ ] Extension works without the original repo

---

## Bug Report Template

When something breaks, capture:

```
SCENARIO: [which scenario]
PAGE: [which Sophos Central page URL]
EXPECTED: [what should happen]
ACTUAL: [what happened instead]
CONSOLE: [any red errors from F12 → Console, especially lines starting with [Sophos Demo]]
SCREENSHOT: [if visual issue]
```

---

## Results Log

| Date | Tester | Phase | Scenario | Result | Notes |
|------|--------|-------|----------|--------|-------|
| | | | | | |

---

## Known Limitations (Not Bugs)

1. **TAC Dashboard / Device Exposure** — data is DOM-injected, not API-intercepted. If Sophos changes widget CSS class names, injection will stop working (won't crash, just won't populate). Verify each quarter.

2. **Micro-frontend pages** — some Sophos Central pages load via micro-frontends that bypass fetch/XHR. If a page shows real data with demo ON, it's a micro-frontend we don't intercept. Navigate to a different page.

3. **Device list edge cases** — the heuristic catch-all for device lists may miss some API patterns. If device table shows real data, use Dashboard or Account Health instead.

4. **Browser extensions** — ad blockers, privacy extensions, and VPNs can interfere with fetch interception. Disable during demos.

5. **Simultaneous Sophos tabs** — opening multiple Sophos Central tabs while switching scenarios can leave stale state. Use single tab or reload all tabs after switching.

---

## Sign-Off

- [ ] **Phase 1 complete** — All 9 scenarios tested, issues documented
- [ ] **Phase 2 complete** — Core functionality verified
- [ ] **Phase 3 complete** — Intake site and distribution verified
- [ ] **All critical bugs fixed**
- [ ] **Ready for SE team distribution**

Signed: _________________________ Date: _____________
