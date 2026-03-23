# Sophos Demo — Build Gameplan

**Goal:** Intercept Sophos Central API responses via mitmproxy to inject demo data. The real UI renders — we just control what data it shows.

---

## Prerequisites (Before We Start)

### 1. Log into Sophos Central in Chrome
The CDP Chrome on grimstarr (`--remote-debugging-port=9222`) needs an active Sophos Central session.

```bash
# Chrome should already be running — just open Sophos Central in it
# Navigate to https://central.sophos.com and complete login
# The session needs to be active when we run the API discovery
```

### 2. Install mitmproxy
```bash
# On grimstarr
pip install mitmproxy
# OR
sudo apt install mitmproxy
```

---

## Phase 1: API Discovery (~15 min)

**What:** Navigate through every Sophos Central page and capture every API call — URLs, methods, response shapes, sample data.

**Script:** `scripts/discover-apis.mjs` (already built)

**What it produces:**
- `data/api-discovery.json` — full details with sample responses
- `data/api-summary.json` — compact endpoint list
- `data/interceptable-endpoints.json` — endpoints suitable for demo injection
- `data/page-*.png` — screenshots of every page

**Pages we capture:**
| Page | Path | Key APIs Expected |
|------|------|------------------|
| Dashboard | `/manage/dashboard` | Alert counts, device health, threat summary |
| Alerts | `/manage/alerts` | Alert list with severity, host, description |
| Devices (Computers) | `/manage/devices/computers` | Endpoint list, health status, OS |
| Devices (Servers) | `/manage/devices/servers` | Server list |
| Endpoint Policies | `/manage/endpoint-protection/policies` | Policy list |
| Firewall | `/manage/firewall` | Firewall inventory |
| TAC Detections | `/manage/threat-analysis-center/detections` | Detection list, MITRE mapping |
| TAC Cases | `/manage/threat-analysis-center/cases` | Case list, severity |
| XDR Live Discover | `/manage/threat-analysis-center/live-discover` | Query templates |
| Account Health | `/manage/account-health-check` | Health score, gaps |
| Settings | `/manage/config` | Configuration |
| People | `/manage/people` | User/admin list |
| Audit Logs | `/manage/logs/audit` | Activity log |

**Run:**
```bash
cd /home/jasoaco/sophos-demo
node scripts/discover-apis.mjs
```

---

## Phase 2: Build the Proxy (~30 min)

**What:** Python mitmproxy addon that intercepts and modifies API responses based on a scenario config file.

### Architecture
```
Browser (PAC config) ──→ mitmproxy (:8080) ──→ Sophos Central
                              │
                              ├─ GET requests: pass through, modify response
                              ├─ POST/PUT/DELETE: BLOCK, return fake success
                              └─ Config file tells it what to change
```

### Files to Build

```
sophos-demo/
├── proxy/
│   ├── interceptor.py       — mitmproxy addon
│   │   ├── request()        — block dangerous writes
│   │   └── response()       — modify API responses per scenario
│   │
│   ├── rules/
│   │   ├── base.yaml        — always-on rules
│   │   │   ├── block_writes: [POST, PUT, DELETE] for action endpoints
│   │   │   ├── rename_tenant: { "Real Name": "Demo Name" }
│   │   │   └── hide_fields: [real email addresses, API keys]
│   │   │
│   │   ├── ransomware.yaml  — ransomware attack scenario
│   │   │   ├── inject_alerts: [{critical ransomware alert}]
│   │   │   ├── inject_detections: [{MITRE T1486 detection}]
│   │   │   ├── modify_dashboard: {threat_count: +1, critical: +1}
│   │   │   └── device_status: {DESKTOP-FIN042: "compromised"}
│   │   │
│   │   ├── healthy.yaml     — clean environment, big numbers
│   │   │   ├── endpoint_count: 2847
│   │   │   ├── server_count: 186
│   │   │   ├── health_score: 98
│   │   │   └── zero_alerts: true
│   │   │
│   │   ├── phishing.yaml    — email phishing campaign
│   │   │   ├── inject_alerts: [{email phishing alerts}]
│   │   │   ├── email_stats: {blocked: 47, quarantined: 12}
│   │   │   └── affected_users: ["sarah.chen", "mike.jones"]
│   │   │
│   │   └── xdr.yaml         — XDR investigation
│   │       ├── inject_detections: [{multi-stage attack chain}]
│   │       ├── inject_cases: [{active investigation}]
│   │       └── threat_graph_data: {lateral movement visualization}
│   │
│   └── start.sh             — launch proxy with selected scenario
│
├── scripts/
│   ├── discover-apis.mjs    — API discovery (built)
│   ├── setup-cert.sh        — install mitmproxy CA cert
│   └── generate-pac.sh      — create PAC file for browser
│
├── data/                     — API discovery output (gitignored)
└── certs/                    — mitmproxy CA cert (gitignored)
```

### Interceptor Logic (pseudocode)

```python
class SophosDemo:
    def __init__(self):
        self.scenario = load_yaml("rules/base.yaml")
        self.scenario.update(load_yaml(f"rules/{SCENARIO}.yaml"))

    def request(self, flow):
        # Block all writes to Sophos
        if flow.request.method in ["POST", "PUT", "DELETE"]:
            if is_action_endpoint(flow.request.url):
                # Return fake success without forwarding
                flow.response = Response(200, json={"success": true})
                return

    def response(self, flow):
        url = flow.request.url
        
        # Tenant name replacement (global find/replace in all responses)
        if self.scenario.get("rename_tenant"):
            for real, fake in self.scenario["rename_tenant"].items():
                flow.response.text = flow.response.text.replace(real, fake)

        # Alert injection
        if "/api/alerts" in url and self.scenario.get("inject_alerts"):
            data = json.loads(flow.response.text)
            data["items"] = self.scenario["inject_alerts"] + data["items"]
            data["totalCount"] += len(self.scenario["inject_alerts"])
            flow.response.text = json.dumps(data)

        # Endpoint count override
        if "/api/endpoints" in url and self.scenario.get("endpoint_count"):
            data = json.loads(flow.response.text)
            # Multiply existing endpoints to reach target count
            # Or inject fake devices
            ...

        # Dashboard stat modification
        if "/api/dashboard" in url and self.scenario.get("modify_dashboard"):
            data = json.loads(flow.response.text)
            for key, delta in self.scenario["modify_dashboard"].items():
                if key in data:
                    data[key] += delta
            flow.response.text = json.dumps(data)
```

---

## Phase 3: Demo Scenarios (~45 min)

Build 4 scenario config files with realistic demo data.

### Scenario 1: Ransomware Attack
**Story:** "Contoso Healthcare just got hit with CryptoLocker. Let's walk through how Sophos detects and responds."

- Dashboard: 1 new critical alert, threat score elevated
- Alerts: CryptoLocker detected on DESKTOP-FIN042, user sarah.chen
- Detections: MITRE T1486 (Data Encrypted for Impact), T1059 (Command Scripting)
- Device: DESKTOP-FIN042 shows compromised status
- Account Health: drops from 98 → 82

### Scenario 2: Healthy Environment
**Story:** "Here's what a well-managed environment looks like with 2,800 endpoints."

- Dashboard: all green, zero critical alerts
- Devices: 2,847 endpoints, 186 servers, all healthy
- Account Health: 98/100
- Policies: all compliant, tamper protection 100%

### Scenario 3: Phishing Campaign
**Story:** "A targeted phishing campaign just hit 47 employees. Sophos Email caught most of it."

- Email: 47 blocked, 12 quarantined, 2 delivered (caught by endpoint)
- Alerts: phishing emails with malicious URLs
- Users: affected user list with remediation status

### Scenario 4: XDR Investigation
**Story:** "Let me show you what a real threat investigation looks like in Sophos XDR."

- TAC: active case with multi-stage attack chain
- Detections: initial access → persistence → lateral movement → data staging
- Threat graph: visual kill chain
- Live Discover: pre-loaded query results

---

## Phase 4: CLI & Browser Setup (~20 min)

### Start Script
```bash
#!/bin/bash
# Usage: ./start-demo.sh ransomware
SCENARIO=${1:-healthy}
echo "🎯 Starting Sophos Demo — Scenario: $SCENARIO"
mitmproxy -s proxy/interceptor.py --set scenario=$SCENARIO -p 8080
```

### Browser Config
Option A: **PAC file** (auto-proxy config)
```javascript
function FindProxyForURL(url, host) {
    if (host.includes("sophos.com")) return "PROXY localhost:8080";
    return "DIRECT";
}
```

Option B: **Chrome launch flag**
```bash
google-chrome --proxy-server="http://localhost:8080" \
              --ignore-certificate-errors \
              https://central.sophos.com
```

Option C: **System proxy** (macOS/Windows settings)

### mitmproxy CA Cert
```bash
# After first mitmproxy run, cert is at ~/.mitmproxy/mitmproxy-ca-cert.pem
# Install as trusted:
# Linux:
sudo cp ~/.mitmproxy/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/mitmproxy.crt
sudo update-ca-certificates
# macOS:
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem
```

---

## Phase 5: Polish (~15 min)

- Test each scenario end-to-end
- Tune alert timestamps to be relative ("2 minutes ago")
- Verify pagination counts match injected data
- Add timed events (optional): "alert fires 30 seconds into demo"
- README with usage instructions

---

## Session Checklist (When You're at grimstarr)

1. [ ] Log into Sophos Central in Chrome (CDP port 9222)
2. [ ] Run API discovery: `node scripts/discover-apis.mjs`
3. [ ] Review `data/api-discovery.json` — understand the API shapes
4. [ ] Install mitmproxy: `pip install mitmproxy`
5. [ ] Build `proxy/interceptor.py` from discovery data
6. [ ] Build scenario YAML files
7. [ ] Test: start proxy → open Chrome with proxy → navigate Central
8. [ ] Verify: fake alerts show, real data unchanged, actions blocked
9. [ ] Document and commit

**Estimated total time: 2-3 hours**

---

## What Won't Change in Sophos Central

- ✅ Every pixel of the UI (it's the real thing)
- ✅ Navigation, menus, buttons, animations
- ✅ Search, filtering, sorting
- ✅ Login flow (happens before proxy)
- ✅ Any page we don't intercept (passes through normally)

## What We Control

- 🎯 Alert content and counts
- 🎯 Device names, counts, health status
- 🎯 Dashboard statistics
- 🎯 Tenant/customer name
- 🎯 Detection and case data
- 🎯 Account health scores
- 🎯 Whether actions "succeed" (without actually executing)

---

*Ready to build when you have Chrome logged into Sophos Central.*
