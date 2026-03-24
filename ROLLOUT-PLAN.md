# Sophos Demo Injector — Rollout Plan

**Date:** 2026-03-24  
**Status:** Post-test-plan, pre-distribution  
**Prerequisite:** TEST-PLAN.md passes clean

---

## Rollout Phases

### Phase 0: Test Plan Validation (You, 1 day)
- [ ] Complete all 3 phases of TEST-PLAN.md
- [ ] Fix any critical bugs found
- [ ] Screenshot working pages for the guide + video
- [ ] Confirm works on your tenant and Chrome version

### Phase 1: Beta (3-5 Champion SEs, 1-2 weeks)

**Goal:** Find edge cases on different tenants, regions, and Chrome versions before going wide.

**Pick SEs who:**
- Demo frequently (2+ demos/week)
- Are comfortable with Chrome Developer Mode
- Will actually give feedback (not just install and forget)
- Cover different regions (US, EU, APAC) — API endpoints vary by region

**Deliverables before beta starts:**
- [ ] 3-minute screen recording walkthrough (see below)
- [ ] Demo Day Cheat Sheet (1-pager, see below)
- [ ] Private Slack channel or Teams group for beta testers
- [ ] Shared Google Drive folder with extension zip + scenarios

**What to tell beta testers:**
> "I built a Chrome extension that injects realistic demo data into your real Sophos Central. Your tenant, real UI, fake data. Try it on your next demo and tell me what breaks."

**Feedback to collect:**
- Which scenarios did you use?
- Which pages worked / didn't work?
- Did any prospect notice anything off?
- What scenario would you want that doesn't exist?
- What was confusing about setup?

**Success criteria for Phase 1:**
- [ ] 3+ SEs used it in a real demo
- [ ] No critical bugs on different tenants/regions
- [ ] Feedback incorporated into next iteration

### Phase 2: Wider Rollout (Full SE Team, ongoing)

**Goal:** Standard tool in every SE's Chrome.

**Deliverables before wide rollout:**
- [ ] All beta feedback addressed
- [ ] Updated screenshots in guide reflecting current UI
- [ ] Extension submitted to Chrome Web Store (unlisted) for auto-updates
  - OR: internal distribution via shared Drive folder with version-numbered zips
- [ ] Announcement in SE team meeting / all-hands
- [ ] Link to intake site shared: https://injector.grimstarr.com

**Ongoing maintenance:**
- [ ] Quarterly check: does extension still work after Sophos Central UI updates?
- [ ] Monitor for new Sophos Central pages/features that need interception
- [ ] Update scenarios when new threat actors / techniques emerge
- [ ] Rotate intake site passcode periodically

---

## Deliverable: 3-Minute Video Walkthrough

Record with Loom, OBS, or screen share. Script:

```
[0:00] "I'm going to show you a tool that lets you demo Sophos Central 
        with realistic data — real UI, fake data, zero risk."

[0:15] Show chrome://extensions — "Load unpacked, point to the extension 
        folder. Pin it to your toolbar."

[0:30] Click 🎯 icon — "Pick a scenario. I'll use MDR Response. 
        Set your prospect's company name. Toggle ON. Hit reload."

[0:50] Sophos Central loads — "Notice the customer name in the top right. 
        That's their name, not ours."

[1:00] Navigate to Cases — "Here are 5 MDR cases. The top one is an 
        active containment — ransomware incident."

[1:15] Click into the case — "Full investigation timeline. MITRE ATT&CK 
        mapping. Impacted entities. The MDR team's investigation notes."

[1:45] Scroll through notebook — "Executive summary, minute-by-minute 
        attack timeline, recommendations, IOCs. This is what the MDR 
        team delivers."

[2:00] Navigate to TAC Dashboard — "Dashboard shows case counts and 
        severity breakdown."

[2:15] Click 🎯 icon — "Toggle off, reload — your real data is back. 
        Nothing was changed in Sophos Central."

[2:30] Show intake site — "Want a custom scenario? Fill in your prospect's 
        details, AI generates the scenario in 30 seconds. Download the 
        JSON, import into the extension."

[2:50] "Questions? Ping me in #demo-tools on Slack."
```

---

## Deliverable: Demo Day Cheat Sheet (1-pager)

```
┌─────────────────────────────────────────────────────────┐
│           SOPHOS DEMO MODE — QUICK REFERENCE            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  BEFORE THE DEMO (2 min)                                │
│  1. Click 🎯 in Chrome toolbar                          │
│  2. Pick scenario (MDR or Ransomware recommended)       │
│  3. Type prospect's company name                        │
│  4. Set their endpoint count                            │
│  5. Toggle ON → Apply & Reload                          │
│  6. Test: Cases page shows fake data? ✓ Good to go      │
│                                                         │
│  DEMO FLOW (15-20 min)                                  │
│  ✅ Cases → click top case → show MITRE + timeline       │
│  ✅ Alerts → walk through alert descriptions             │
│  ✅ Detections → show raw telemetry                      │
│  ✅ Threat Graphs → process tree visualization           │
│  ✅ Main Dashboard → health score, device counts         │
│  ⚠️  TAC Dashboard → widgets populate but fragile        │
│  ❌ Skip: Device list detail page                        │
│                                                         │
│  LIVE DRAMA                                             │
│  Ctrl+Shift+1 → inject ransomware alert                 │
│  Ctrl+Shift+3 → inject lateral movement alert           │
│  "Let me show you what happens when..."                 │
│                                                         │
│  AFTER THE DEMO                                         │
│  1. Toggle OFF → reload                                 │
│  2. Real data is back instantly                         │
│  3. Generate follow-up email at injector.grimstarr.com  │
│                                                         │
│  SOMETHING BROKE?                                       │
│  → Toggle OFF, hard refresh (Ctrl+Shift+R)              │
│  → Still broken? Remove extension, re-add it            │
│  → Ping Jason in #demo-tools                            │
│                                                         │
│  CUSTOM SCENARIO                                        │
│  → https://injector.grimstarr.com                       │
│  → Passcode: Sophos2026!                                │
│  → Fill form → Generate → Download .json → Import       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Deliverable: Slack Channel Setup

**Channel name:** `#demo-tools` (or `#sophos-demo-mode`)

**Channel description:**
> Chrome extension that injects realistic demo data into Sophos Central. Install guide: https://injector.grimstarr.com/guide.html | Custom scenarios: https://injector.grimstarr.com | Issues? Post here with screenshot + console errors.

**Pinned messages:**
1. Extension download link + install guide
2. Demo Day Cheat Sheet
3. 3-minute video walkthrough
4. "Share your custom scenarios here — use the 🔗 Share button"

---

## Authentication Roadmap

| Phase | Auth Model | Effort |
|-------|-----------|--------|
| Beta | Shared passcode (Sophos2026!) | Done ✅ |
| Wide rollout | Individual passcodes per SE | 2 hours |
| Enterprise | Sophos Central SSO / Google Workspace | 1-2 days |

For now, the shared passcode is fine. If you need individual tracking, I can add a simple user table with per-SE passcodes and usage logging.

---

## Maintenance Calendar

| When | What | Who |
|------|------|-----|
| Weekly (beta) | Check Slack for bug reports, fix critical issues | You |
| Monthly (post-rollout) | Verify extension works on latest Sophos Central UI | You |
| Quarterly | Update scenarios with new threat actors/techniques | You + AI builder |
| Quarterly | Check Chrome extension manifest compatibility | You |
| As needed | Add new scenarios requested by SEs | AI builder |
| As needed | Rotate intake site passcode | Settings page |

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sophos Central UI update breaks interception | Medium (quarterly) | High — pages show real data or "Oops" | DOM observer fallback, try-catch everywhere, fail-safe returns real data |
| SE forgets to toggle off before customer sees real tenant | Low | High — embarrassing | Floating badge reminder, auto-disable after 2 hours (TODO) |
| Passcode leaks outside SE team | Medium | Low — tool is useless without Sophos Central login | Can rotate passcode in Settings, add IP allowlist (TODO) |
| Chrome Web Store rejects extension | Low | Medium — manual distribution only | Keep "Load unpacked" as primary distribution, Web Store as convenience |
| API region differences break interception | Medium | Medium — affects specific SEs | Beta test with SEs in EU/APAC regions |

---

## Success Metrics

Track after 30 days of wide rollout:

- **Adoption:** How many SEs have the extension installed?
- **Usage:** How many demos used demo mode? (check demo recording history)
- **Scenarios generated:** How many custom scenarios created on intake site?
- **Win rate impact:** Anecdotal — did demo mode help close deals?
- **Bug reports:** Trending down? Extension is stabilizing.
- **Scenario requests:** What do SEs want that doesn't exist yet?

---

## Sign-Off

- [ ] Test plan passed
- [ ] Video recorded
- [ ] Cheat sheet distributed
- [ ] Slack channel created
- [ ] Beta SEs identified and onboarded
- [ ] Beta feedback collected (2 weeks)
- [ ] Critical fixes applied
- [ ] Wide rollout approved

Ready for rollout: ☐ Yes ☐ No

Signed: _________________________ Date: _____________
