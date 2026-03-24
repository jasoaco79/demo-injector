# DemoForge — Live Demo Data for Any SaaS Product

**Tagline:** "Your real product. Their real data. Zero risk."

**One-liner:** Chrome extension platform that injects AI-generated, prospect-specific demo data into live SaaS products so sales engineers can deliver personalized demos without maintaining fake environments.

---

## The Problem

Every B2B SaaS company with a $50K+ ACV has Sales Engineers who demo the product live. Every single one faces the same problem:

- **Shared demo tenants** — stale data, other SEs modify it, never matches the prospect
- **Screenshots / recordings** — not interactive, prospect can't click around, feels like a pitch
- **Lab environments** — hours to set up, alerts get old, hard to customize per prospect
- **Sandbox accounts** — generic data, wrong industry, wrong scale, wrong story

The result: SEs either spend 2+ hours prepping each demo, or they show generic data that doesn't resonate. Neither scales.

**DemoForge solves this in 30 seconds.** SE types prospect details → AI generates scenario → toggle on → the real product shows personalized data. Toggle off → real data returns. Zero risk.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DemoForge Platform                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Chrome   │  │ AI Scenario  │  │ Product Connectors    │  │
│  │ Extension│  │ Engine       │  │                       │  │
│  │ (Core)   │  │              │  │  ┌─────────────────┐  │  │
│  │          │  │ • Generate   │  │  │ Sophos Central  │  │  │
│  │ • fetch  │  │ • Remix      │  │  ├─────────────────┤  │  │
│  │   override│ │ • Enrich     │  │  │ CrowdStrike     │  │  │
│  │ • XHR    │  │ • Battle Card│  │  │ Falcon          │  │  │
│  │   override│ │ • Demo Script│  │  ├─────────────────┤  │  │
│  │ • DOM    │  │ • Follow-Up  │  │  │ Palo Alto       │  │  │
│  │   injection│ │              │  │  │ Cortex          │  │  │
│  │ • Widget │  │              │  │  ├─────────────────┤  │  │
│  │   engine │  │              │  │  │ Datadog         │  │  │
│  │          │  │              │  │  ├─────────────────┤  │  │
│  │          │  │              │  │  │ Salesforce      │  │  │
│  │          │  │              │  │  ├─────────────────┤  │  │
│  │          │  │              │  │  │ ServiceNow      │  │  │
│  │          │  │              │  │  ├─────────────────┤  │  │
│  │          │  │              │  │  │ [Your Product]  │  │  │
│  └──────────┘  └──────────────┘  │  └─────────────────┘  │  │
│                                  └───────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Web Console                           │   │
│  │                                                       │   │
│  │  • Scenario Builder (AI-powered)                      │   │
│  │  • Scenario Library (shared across team)              │   │
│  │  • Team Management (seats, usage, analytics)          │   │
│  │  • Connector Marketplace                              │   │
│  │  • Demo Analytics (which scenarios, win rates)        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: Core Engine (Built — Needs Generalization)

The Chrome extension interception engine. This is product-agnostic:

```javascript
// The core engine handles:
class DemoForgeEngine {
  // 1. Request Interception
  interceptFetch(url, response)    // Override fetch() globally
  interceptXHR(url, response)      // Override XMLHttpRequest
  interceptDOM(selector, content)  // Watch and replace DOM nodes
  
  // 2. Response Modification
  modifyJSON(url, data, rules)     // Apply connector rules to API responses
  replaceText(patterns)            // Global text replacement (tenant name, etc.)
  blockWrites(url, method)         // Fake-succeed dangerous actions
  
  // 3. Scenario Management
  loadScenario(json)               // Load scenario data
  resolveTemplates(data, vars)     // {{companyName}}, {{employeeCount}}, timestamps
  
  // 4. State Management
  enable() / disable()             // Toggle interception
  getInterceptCount()              // How many requests modified
  
  // 5. Safety
  preserveURL(response)            // Don't break response.url
  failGracefully(error)            // Return original data on any error
  skipUnknownURLs(url)             // Only touch URLs the connector knows about
}
```

**What exists today:** ~1900 lines of Sophos-specific interceptor. Needs to be split into:
- `core/engine.js` (~400 lines) — generic interception
- `core/templates.js` (~100 lines) — timestamp/variable resolution
- `core/dom-injection.js` (~200 lines) — widget chart/table builders
- `connectors/sophos/interceptor.js` (~800 lines) — Sophos-specific URL matching + data generation
- `connectors/sophos/scenarios/*.json` — Sophos scenario data

### Layer 2: Product Connectors

Each connector defines:

```javascript
// connectors/crowdstrike/connector.js
export default {
  name: 'CrowdStrike Falcon',
  version: '1.0.0',
  
  // Which domains this connector handles
  domains: ['falcon.crowdstrike.com', '*.falcon.crowdstrike.com'],
  
  // URL patterns to intercept (everything else passes through)
  interceptPatterns: [
    '/api2/detects/*',
    '/api2/incidents/*',
    '/api2/devices/*',
    '/api2/intel/*',
    '/api2/hosts/*',
  ],
  
  // API response schema (used by AI to generate scenarios)
  schema: {
    detection: { id: 'string', type: 'string', severity: 'number', ... },
    incident: { id: 'string', name: 'string', hosts: 'array', ... },
    device: { hostname: 'string', os: 'string', status: 'string', ... },
  },
  
  // URL → handler mapping
  handlers: {
    '/api2/detects/queries/detects/v1': (data, scenario) => { ... },
    '/api2/detects/entities/summaries/GET/v1': (data, scenario) => { ... },
    '/api2/incidents/queries/incidents/v1': (data, scenario) => { ... },
    '/api2/devices/queries/devices/v1': (data, scenario) => { ... },
  },
  
  // DOM overrides for micro-frontend pages
  domHandlers: [
    { match: '/activity/detections', selector: '.no-data', inject: (scenario) => { ... } },
  ],
  
  // Global text replacements
  tenantNameReplacements: [
    { pattern: /CrowdStrike Inc/g, replace: '{{companyName}}' },
  ],
  
  // AI scenario generation prompt additions
  scenarioPrompt: `
    You are generating a CrowdStrike Falcon demo scenario.
    Detections use the Falcon severity scale (1-100, critical > 80).
    ...
  `,
}
```

**Building a new connector involves:**

| Step | What | Time |
|------|------|------|
| 1 | Get access to the target product | — |
| 2 | Capture API calls on key pages (CDP script) | 30 min |
| 3 | Document API response schemas | 1 hour |
| 4 | Write URL handlers (modify responses) | 2-4 hours |
| 5 | Write DOM handlers (micro-frontend overrides) | 1-2 hours |
| 6 | Build 3-4 scenario JSONs | 1-2 hours |
| 7 | Write AI prompt for scenario generation | 30 min |
| 8 | Test end-to-end | 1-2 hours |
| **Total** | | **6-12 hours per connector** |

With the framework built, each new product connector is a 1-2 day effort. That's the leverage.

### Layer 3: AI Scenario Engine (Built — Needs Generalization)

The AI scenario generator currently knows Sophos. To generalize:

```
┌────────────────────────────────────────────────────┐
│              AI Scenario Engine                      │
│                                                      │
│  Inputs:                                             │
│  • Connector schema (what fields exist)              │
│  • Industry presets (healthcare, finance, etc.)       │
│  • Prospect details (name, size, industry)            │
│  • Scenario type (breach, healthy, investigation)     │
│  • Product-specific prompt additions                  │
│                                                      │
│  Outputs:                                            │
│  • Complete scenario JSON matching connector schema   │
│  • Demo script / talk track                          │
│  • Battle card vs competitor                         │
│  • Follow-up email                                   │
│  • Prospect enrichment                               │
│                                                      │
│  Key Insight: The AI doesn't need to know the        │
│  product deeply — it just needs the SCHEMA and       │
│  EXAMPLES. Give Claude the connector's schema.md     │
│  and 2 example scenarios, and it generates perfect   │
│  new ones. This is why you can add new products in   │
│  hours, not months.                                  │
└────────────────────────────────────────────────────┘
```

### Layer 4: Web Console (Partially Built)

The intake site becomes a multi-tenant SaaS platform:

**Free Tier (Individual SE):**
- 1 product connector
- 3 saved scenarios
- Basic AI generation
- Manual extension install

**Team ($49/SE/month):**
- All available connectors
- Unlimited scenarios
- Scenario library shared across team
- Team analytics (which scenarios, which pages, demo duration)
- Priority connector requests
- Chrome Web Store auto-updates

**Enterprise ($99/SE/month):**
- Custom connector development
- SSO / SCIM provisioning
- Audit logs
- Custom branding (white-label the extension popup)
- Dedicated support
- API access for CI/CD integration
- Demo analytics dashboard with win rate correlation

---

## Go-To-Market

### Beachhead: Cybersecurity Vendors

Start where you have domain expertise and credibility:

| Vendor | Product | SE Count (est.) | Why They Need This |
|--------|---------|-----------------|-------------------|
| CrowdStrike | Falcon | 500+ SEs | Complex XDR/MDR demos, same problem as Sophos |
| Palo Alto | Cortex XDR | 400+ SEs | Multi-product demos are nightmare to set up |
| SentinelOne | Singularity | 300+ SEs | Competing with CrowdStrike, demos are key differentiator |
| Fortinet | FortiSIEM/FortiEDR | 200+ SEs | Legacy tool, modernizing sales motion |
| Trend Micro | Vision One | 200+ SEs | XDR platform demos need realistic data |

**Why cybersecurity first:**
1. You ARE a cybersecurity SE — you understand the pain intimately
2. Demo quality directly impacts deal outcomes in security
3. Security products have complex, data-rich UIs (lots of interception points = lots of value)
4. Security SEs are technical enough to install a Chrome extension
5. Word travels fast in the SE community — one happy SE tells 10 others

### Expansion: Adjacent B2B SaaS

After 3-5 security vendor connectors:

| Category | Products | Why |
|----------|----------|-----|
| Observability | Datadog, Splunk, New Relic, Dynatrace | Dashboard-heavy, need realistic metrics |
| CRM | Salesforce, HubSpot | Need prospect-specific pipeline data |
| ITSM | ServiceNow, Jira Service Management | Need realistic ticket/incident data |
| Cloud | AWS Console, Azure Portal, GCP | Need populated dashboards for demos |
| HR | Workday, BambooHR | Need org charts and employee data |

### Sales Motion

**Bottom-up (SE-led):**
1. Individual SE finds DemoForge, installs free tier
2. Uses it in 3 demos, shares with team
3. Team adopts → manager buys Team plan
4. Success → expands to other SE teams → Enterprise

**Top-down (SE Leadership):**
1. Cold outreach to VP of Sales Engineering / SE Directors
2. "Your SEs spend 2 hours prepping each demo. DemoForge makes it 30 seconds."
3. Pilot with 5 SEs for 30 days, free
4. Measure: demo prep time, demo quality feedback, deal progression
5. Contract

---

## Technical Roadmap

### Phase 1: Foundation (Month 1-2)
- [ ] Refactor interceptor into core engine + Sophos connector
- [ ] Build connector SDK with documentation
- [ ] Build CrowdStrike Falcon connector (proves the framework works)
- [ ] Multi-connector support in Chrome extension (pick which product)
- [ ] Basic SaaS web console (auth, team management, scenario library)

### Phase 2: Product (Month 3-4)
- [ ] 3rd connector (Palo Alto Cortex or Datadog)
- [ ] Chrome Web Store listing (unlisted for beta, public for launch)
- [ ] Stripe billing integration
- [ ] Team analytics dashboard
- [ ] Connector request form (customers tell you what product to add next)

### Phase 3: Scale (Month 5-6)
- [ ] Self-service connector builder (upload API docs → AI generates connector)
- [ ] Scenario marketplace (SEs share scenarios across companies)
- [ ] SSO / SCIM for enterprise
- [ ] SOC 2 Type I certification
- [ ] Public launch + Product Hunt

### Phase 4: Platform (Month 7-12)
- [ ] Connector marketplace (3rd party developers build connectors)
- [ ] API for programmatic scenario creation (CI/CD for demo environments)
- [ ] Integration with CRM (auto-generate scenario from Salesforce opportunity)
- [ ] Demo analytics → win rate correlation
- [ ] Mobile support (responsive demo data on tablet demos)

---

## Revenue Model

```
Year 1 (5 security vendor customers):
  5 companies × 20 SE seats avg × $49/month = $58,800 ARR

Year 2 (20 customers, mix of security + adjacent):
  15 Team × 30 seats × $49 = $264,600
  5 Enterprise × 50 seats × $99 = $297,000
  Total: ~$561,600 ARR

Year 3 (50 customers):
  30 Team × 40 seats × $49 = $705,600
  20 Enterprise × 75 seats × $99 = $1,485,000
  Total: ~$2.2M ARR
```

Saleo raised $12M at ~$5M ARR. The market validates the pricing.

---

## What You Have Today vs What You Need

| Asset | Have | Need |
|-------|------|------|
| Core interception engine | ✅ 1900 lines, battle-tested | Refactor into SDK |
| AI scenario generation | ✅ Works with Claude | Generalize prompts per connector |
| First connector (Sophos) | ✅ Complete with 9 scenarios | Extract from monolith |
| Chrome extension | ✅ MV3, popup, service worker | Multi-connector UI |
| Web console | ✅ Auth, settings, guide, library | Multi-tenant, billing, analytics |
| HTTPS hosting | ✅ injector.grimstarr.com | Rebrand to demoforge.io or similar |
| Domain expertise | ✅ You are the target customer | Document for others |
| Second connector | ❌ | CrowdStrike Falcon (~2 days) |
| Billing | ❌ | Stripe integration (~1 day) |
| Team management | ❌ | User table + roles (~2 days) |
| SOC 2 | ❌ | 3-6 months |
| Logo / brand | ❌ | 1 day |

**Time to MVP for a 2-connector product with billing: ~2-3 weeks of focused work.**

---

## Naming Ideas

| Name | Domain Available | Vibe |
|------|-----------------|------|
| DemoForge | demoforge.io | Building/crafting demos |
| LiveDemo | livedemo.ai | AI-powered live demos |
| DemoMode | demomode.dev | Developer-friendly |
| ScenarioHQ | scenariohq.com | Scenario management |
| DemoCraft | democraft.io | Crafted demo experiences |
| Injector | injector.dev | Technical, direct |
| SalesForge | salesforge.ai | Broader sales tool |

---

## Decision Framework

Ask yourself:

1. **Do I want to build a company?** If yes → Phase 1 immediately, quit job when ARR > salary
2. **Do I want a side income?** If yes → Build 2nd connector, launch at $49/seat, see what happens
3. **Do I want career leverage?** If yes → Open-source the core engine, write about it, use it in interviews
4. **Do I want Sophos to adopt it?** If yes → Present to SE leadership this week, offer to own it internally

All four paths start the same way: **generalize the engine and build one more connector.**
