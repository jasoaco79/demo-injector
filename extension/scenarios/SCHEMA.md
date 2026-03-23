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
