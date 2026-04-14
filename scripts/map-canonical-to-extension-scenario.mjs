#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function usage() {
  console.error('Usage: node scripts/map-canonical-to-extension-scenario.mjs <canonical-json> [output-json]');
  process.exit(1);
}

const [, , inputPath, outputPath] = process.argv;
if (!inputPath) usage();

const canonical = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const customer = canonical.customer || {};
const attack = canonical.attack || {};
const narrative = canonical.narrative || {};
const outcome = canonical.expectedOutcome || {};
const identity = canonical.identity || {};
const execution = canonical.execution || {};

const isRansomware = (attack.attackType || '').toLowerCase() === 'ransomware';
const executionTimeline = Array.isArray(execution.timeline) ? execution.timeline : [];

function findExecutionEntry(phaseIdPart, techniqueId) {
  return executionTimeline.find((e) =>
    (phaseIdPart && String(e.phaseId || '').includes(phaseIdPart)) ||
    (techniqueId && e.techniqueId === techniqueId)
  ) || null;
}

const phaseDisable = findExecutionEntry('disable-defenses', 'T1562.001');
const phaseShadow = findExecutionEntry('delete-shadow-copies', 'T1490');
const phaseStage = findExecutionEntry('stage-ransom-note', 'T1486');
const executionAware = executionTimeline.length > 0;

function relTime(fallback, entry) {
  if (!executionAware || !entry?.timestamp || !execution.startedAt) return fallback;
  const start = new Date(execution.startedAt).getTime();
  const ts = new Date(entry.timestamp).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(ts)) return fallback;
  const mins = Math.max(1, Math.round((ts - start) / 60000));
  return `-${mins}m`;
}

function severityNumber(level) {
  return level === 'critical' ? 9 : level === 'high' ? 8 : level === 'medium' ? 6 : 4;
}

function mapMitreAttacksForCase() {
  if (isRansomware) {
    return [
      {
        tactic: {
          id: 'TA0005',
          name: 'Defense Evasion',
          techniques: [{ id: 'T1562.001', name: 'Disable or Modify Tools' }]
        }
      },
      {
        tactic: {
          id: 'TA0040',
          name: 'Impact',
          techniques: [
            { id: 'T1490', name: 'Inhibit System Recovery' },
            { id: 'T1486', name: 'Data Encrypted for Impact' }
          ]
        }
      }
    ];
  }

  return (attack.mitreTechniques || []).map((t) => ({
    tactic: { id: 'TA0000', name: 'Mapped Technique', techniques: [{ id: t.id, name: t.name }] }
  }));
}

function buildRansomwareAlerts() {
  return [
    {
      product: 'endpoint',
      threat: 'Troj/Ransom-GKL',
      threat_cleanable: true,
      created_at: relTime('-5m', phaseDisable),
      severity: 'medium',
      actionable: true,
      category: 'malware',
      when: relTime('-5m', phaseDisable),
      allowedActions: ['CLEAN', 'ACKNOWLEDGE'],
      location: 'DESKTOP-FIN042',
      type: 'Event::Endpoint::Threat::Detected',
      source: null,
      data: {
        created_at: '-5m',
        endpoint_type: 'computer',
        endpoint_platform: 'windows'
      },
      description: "Malware detected: 'Mal/Generic-S' at 'C:\\Users\\sarah.chen\\Downloads\\invoice_march2026.exe'",
      info: "Malware cleaned successfully: 'Mal/Generic-S'"
    },
    {
      product: 'endpoint',
      threat: null,
      threat_cleanable: null,
      created_at: relTime('-4m', phaseDisable),
      severity: 'high',
      actionable: false,
      category: 'policy',
      when: relTime('-4m', phaseDisable),
      allowedActions: ['ACKNOWLEDGE'],
      location: 'DESKTOP-FIN042',
      type: 'Event::Endpoint::SavDisabled',
      source: null,
      data: {
        created_at: '-4m',
        endpoint_type: 'computer',
        endpoint_platform: 'windows'
      },
      description: 'Malicious process attempted to disable backup and recovery protections on DESKTOP-FIN042. Sophos blocked the attempt to impair defensive services.',
      info: null
    },
    {
      product: 'endpoint',
      threat: 'CryptoGuard',
      threat_cleanable: false,
      created_at: relTime('-3m', phaseShadow),
      severity: 'high',
      actionable: true,
      category: 'runtime_detections',
      when: relTime('-3m', phaseShadow),
      allowedActions: ['ACKNOWLEDGE'],
      location: 'DESKTOP-FIN042',
      type: 'Event::Endpoint::CoreDetection::CryptoGuard',
      source: null,
      data: {
        created_at: '-3m',
        endpoint_type: 'computer',
        endpoint_platform: 'windows'
      },
      description: 'CryptoGuard detected ransomware precursor behavior on DESKTOP-FIN042. Shadow copy deletion and recovery impairment activity observed before encryption impact.',
      info: 'High-confidence ransomware precursor detected and escalated'
    }
  ];
}

function buildRansomwareDetections() {
  return [
    {
      detectionCreatedAt: relTime('-3m', phaseShadow),
      connectorGeneratedAt: relTime('-3m', phaseShadow),
      connector: {
        id: 'SophosSensorID',
        type: 'endpoint',
        vendor: 'Sophos',
        version: 'SED Driver 4.2.1'
      },
      device: {
        type: 'computer',
        hostname: 'DESKTOP-FIN042'
      },
      rawData: {
        meta_hostname: 'DESKTOP-FIN042',
        meta_ip_address: '192.168.1.42',
        meta_os_name: 'Microsoft Windows 11 Enterprise',
        meta_username: 'sarah.chen',
        cmdline: 'powershell.exe -ExecutionPolicy Bypass -C "vssadmin delete shadows /all /quiet"',
        path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        parent_name: 'invoice_march2026.exe',
        sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
      },
      risk: 9,
      category: 'Threat',
      classificationRule: 'WIN-IMP-PRC-SHADOWCOPY-SELECT-DELETE-RESIZE-1',
      ruleDescription: 'Shadow copy deletion detected — common ransomware precursor',
      mitreAttacks: [
        {
          tactic: {
            id: 'TA0040',
            name: 'Impact',
            techniques: [{ id: 'T1490', name: 'Inhibit System Recovery' }]
          }
        }
      ],
      attackType: 'Ransomware',
      severity: 9,
      detectionAttack: { name: 'Ransomware Kill Chain' },
      detectionLicenses: ['XDR'],
      geolocation: {},
      intelixFileReputation: { score: 100, label: 'Known Malicious' },
      detectionType: 'Threat',
      suppressed: false,
      caseDescription: 'Active ransomware attack — shadow copy deletion precursor'
    },
    {
      detectionCreatedAt: relTime('-5m', phaseDisable),
      connectorGeneratedAt: relTime('-5m', phaseDisable),
      connector: {
        id: 'SophosSensorID',
        type: 'endpoint',
        vendor: 'Sophos',
        version: 'SED Driver 4.2.1'
      },
      device: {
        type: 'computer',
        hostname: 'DESKTOP-FIN042'
      },
      rawData: {
        meta_hostname: 'DESKTOP-FIN042',
        meta_ip_address: '192.168.1.42',
        meta_os_name: 'Microsoft Windows 11 Enterprise',
        meta_username: 'sarah.chen',
        cmdline: 'sc.exe config vss start= disabled && sc.exe config wbengine start= disabled',
        path: 'C:\\Windows\\System32\\sc.exe',
        parent_name: 'invoice_march2026.exe',
        sha256: '11111111e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6'
      },
      risk: 8,
      category: 'Threat',
      classificationRule: 'WIN-DEF-SVC-DISABLE-RANSOM-1',
      ruleDescription: 'Backup and recovery service impairment detected',
      mitreAttacks: [
        {
          tactic: {
            id: 'TA0005',
            name: 'Defense Evasion',
            techniques: [{ id: 'T1562.001', name: 'Disable or Modify Tools' }]
          }
        }
      ],
      attackType: 'Ransomware',
      severity: 8,
      detectionAttack: { name: 'Ransomware Kill Chain' },
      detectionLicenses: ['XDR'],
      geolocation: {},
      intelixFileReputation: { score: 84, label: 'Suspicious' },
      detectionType: 'Threat',
      suppressed: false,
      caseDescription: 'Defense impairment activity consistent with ransomware staging'
    },
    {
      detectionCreatedAt: relTime('-2m', phaseStage),
      connectorGeneratedAt: relTime('-2m', phaseStage),
      connector: {
        id: 'SophosSensorID',
        type: 'endpoint',
        vendor: 'Sophos',
        version: 'SED Driver 4.2.1'
      },
      device: {
        type: 'computer',
        hostname: 'DESKTOP-FIN042'
      },
      rawData: {
        meta_hostname: 'DESKTOP-FIN042',
        meta_ip_address: '192.168.1.42',
        meta_os_name: 'Microsoft Windows 11 Enterprise',
        meta_username: 'sarah.chen',
        cmdline: 'powershell.exe -C "New-Item README_RECOVER_FILES.txt; New-Item document_1.encrypted"',
        path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        parent_name: 'invoice_march2026.exe',
        sha256: '22222222e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6'
      },
      risk: 8,
      category: 'Threat',
      classificationRule: 'WIN-RANSOM-NOTE-STAGING-1',
      ruleDescription: 'Ransom note and encrypted file marker staging detected',
      mitreAttacks: [
        {
          tactic: {
            id: 'TA0040',
            name: 'Impact',
            techniques: [{ id: 'T1486', name: 'Data Encrypted for Impact' }]
          }
        }
      ],
      attackType: 'Ransomware',
      severity: 8,
      detectionAttack: { name: 'Ransomware Kill Chain' },
      detectionLicenses: ['XDR'],
      geolocation: {},
      intelixFileReputation: { score: 82, label: 'Suspicious' },
      detectionType: 'Threat',
      suppressed: false,
      caseDescription: 'Ransom note staging and encrypted marker proliferation detected'
    }
  ];
}

function buildRansomwareThreatGraphDetail() {
  return {
    id: 'auto',
    status: 'closed',
    priority: 'HIGH',
    endpointName: 'DESKTOP-FIN042',
    rootCauseName: 'invoice_march2026.exe',
    rootCausePath: 'C:\\Users\\sarah.chen\\Downloads\\invoice_march2026.exe',
    username: '{{customerDomain}}\\sarah.chen',
    malwareName: 'Troj/Ransom-GKL',
    summary: 'Ransomware precursor activity was detected and correlated before encryption impact occurred.',
    impactedEntities: [
      { type: 'endpoint', name: 'DESKTOP-FIN042' },
      { type: 'user', name: '{{customerDomain}}\\sarah.chen' },
      { type: 'artifact', name: 'README_RECOVER_FILES.txt' }
    ]
  };
}

const extensionScenario = {
  id: 'ransomware-scn008-generated',
  name: identity.name || 'Generated Scenario',
  description: identity.summary || 'Generated from canonical scenario.',
  version: 1,
  createdAt: new Date().toISOString(),
  customer: {
    name: customer.name || 'Demo Customer',
    industry: customer.industry || 'general',
    endpointCount: customer.endpointCount || 2500,
    serverCount: customer.serverCount || 186,
  },
  prelude: {
    enabled: true,
    title: (narrative.title || '{{customerName}} — Threat Story') + (isRansomware ? ' Prelude' : ''),
    subtitle: narrative.subtitle || identity.summary || '',
    threatFamily: narrative.threatFamily || 'Threat Briefing',
    type: 'storyboard',
    videoUrl: '',
    posterUrl: '',
    ctaLabel: 'Open Sophos Central Demo',
    autoLaunch: false,
    transitionLine: isRansomware
      ? 'Now let’s pivot into Sophos Central and show exactly what your team at {{customerName}} would see live: the alerts, case context, detections, threat graph, and response path that turn this story into action.'
      : (narrative.transitionLine || 'Now let’s move into Sophos Central and show how this incident becomes visible to your team in real time.'),
    expectedDetections: (outcome.expectedDetections || []).map((d) => d.detection),
    mitreTechniques: isRansomware
      ? [
          { id: 'T1204.002', name: 'Malicious File' },
          { id: 'T1059.001', name: 'PowerShell' },
          ...(attack.mitreTechniques || [])
        ].filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i)
      : (attack.mitreTechniques || []),
    milestones: isRansomware
      ? [
          { id: 'T1204.002', label: 'Initial compromise' },
          { id: 'T1490', label: 'Recovery mechanisms targeted' },
          { id: 'T1486', label: 'Encryption attempt blocked' }
        ]
      : (attack.milestones || []),
    slides: narrative.slides || [],
    talkingPoints: narrative.talkingPoints || [],
    industryTalkingPoints: narrative.industryTalkingPoints || {},
    runbookSteps: narrative.runbookSteps || [],
    clickPath: narrative.clickPath || [],
  },
  alerts: {
    mode: 'prepend',
    items: isRansomware ? buildRansomwareAlerts() : [
      {
        product: 'endpoint',
        threat: 'Generated Threat',
        threat_cleanable: false,
        created_at: '-3m',
        severity: 'high',
        actionable: true,
        category: 'runtime_detections',
        when: '-3m',
        allowedActions: ['ACKNOWLEDGE'],
        location: 'DESKTOP-FIN042',
        type: 'Event::Endpoint::CoreDetection::Generic',
        source: null,
        data: {
          created_at: '-3m',
          endpoint_type: 'computer',
          endpoint_platform: 'windows'
        },
        description: 'Generated threat activity detected on DESKTOP-FIN042.',
        info: 'Generated scenario alert'
      }
    ],
    summaryDelta: isRansomware ? { high: 2, medium: 1, low: 0 } : { high: 1, medium: 0, low: 0 }
  },
  cases: {
    mode: 'prepend',
    items: [
      {
        type: 'investigation',
        name: `(DESKTOP-FIN042) | ${identity.name || 'Threat Investigation'} — {{customerName}}`,
        managedBy: 'self',
        createdAt: relTime('-3m', phaseShadow),
        createdBy: { name: 'Auto-generated' },
        updatedAt: relTime('-1m', phaseStage || phaseShadow),
        status: 'investigating',
        initialDetection: {
          severity: 9,
          type: 'Threat',
          detectionRule: 'WIN-IMP-PRC-SHADOWCOPY-SELECT-DELETE-RESIZE-1',
          mitreAttacks: mapMitreAttacksForCase(),
          time: relTime('-3m', phaseShadow),
          sensor: {
            type: 'endpoint',
            source: 'Sophos Endpoint'
          }
        },
        assignee: { name: 'SOC Analyst' },
        overview: isRansomware
          ? 'Active ransomware attack detected on DESKTOP-FIN042. Sophos surfaced defense impairment, shadow copy targeting, and impact staging before broad encryption occurred.'
          : (outcome.sophosOutcome || 'Threat activity surfaced for investigation and response.'),
        detectionCount: isRansomware ? 12 : Math.max((outcome.expectedDetections || []).length, 1),
        escalated: true
      }
    ]
  },
  detections: {
    mode: 'prepend',
    items: isRansomware ? buildRansomwareDetections() : (outcome.expectedDetections || []).slice(0, 4).map((d, idx) => ({
      detectionCreatedAt: `-${idx + 2}m`,
      connectorGeneratedAt: `-${idx + 2}m`,
      connector: {
        id: 'SophosSensorID',
        type: 'endpoint',
        vendor: 'Sophos',
        version: 'SED Driver 4.2.1'
      },
      device: {
        type: 'computer',
        hostname: 'DESKTOP-FIN042'
      },
      rawData: {
        meta_hostname: 'DESKTOP-FIN042',
        meta_ip_address: '192.168.1.42',
        meta_os_name: 'Microsoft Windows 11 Enterprise',
        meta_username: 'sarah.chen',
        cmdline: d.detection,
        path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        parent_name: 'invoice_march2026.exe',
        sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
      },
      risk: severityNumber(d.severity),
      category: 'Threat',
      classificationRule: 'CANONICAL-GENERATED-DETECTION',
      ruleDescription: d.detection,
      mitreAttacks: [],
      attackType: attack.attackType || 'Threat',
      severity: severityNumber(d.severity),
      detectionAttack: {
        name: identity.name || 'Generated Attack Chain'
      },
      detectionLicenses: ['XDR'],
      geolocation: {},
      intelixFileReputation: {
        score: d.severity === 'critical' ? 100 : 80,
        label: d.severity === 'critical' ? 'Known Malicious' : 'Suspicious'
      },
      detectionType: 'Threat',
      suppressed: false,
      caseDescription: d.detection
    }))
  },
  caseDetail: isRansomware ? {
    extraActivities: [
      {
        userName: 'Sophos Endpoint',
        action: 'CryptoGuard blocked ransomware precursor activity on DESKTOP-FIN042 before broad encryption impact occurred.',
        category: 'caseActivity',
        createdAt: relTime('-2m', phaseShadow)
      },
      {
        userName: 'Sophos Endpoint',
        action: 'Shadow copy targeting and recovery impairment behavior correlated into a single ransomware investigation.',
        category: 'caseActivity',
        createdAt: relTime('-2m', phaseShadow)
      },
      {
        userName: 'Sophos Endpoint',
        action: 'Ransom note staging artifacts detected under the demo path and attached to the investigation timeline.',
        category: 'caseActivity',
        createdAt: relTime('-3m', phaseStage)
      }
    ],
    mitreSummary: {
      tactics: [
        {
          id: 'TA0005',
          name: 'Defense Evasion',
          techniques: [{ id: 'T1562.001', name: 'Disable or Modify Tools' }]
        },
        {
          id: 'TA0040',
          name: 'Impact',
          techniques: [
            { id: 'T1490', name: 'Inhibit System Recovery' },
            { id: 'T1486', name: 'Data Encrypted for Impact' }
          ]
        }
      ]
    },
    impactedEntities: [
      { type: 'endpoint', name: 'DESKTOP-FIN042', risk: 'high' },
      { type: 'user', name: '{{customerDomain}}\\sarah.chen', risk: 'medium' },
      { type: 'artifact', name: 'README_RECOVER_FILES.txt', risk: 'high' }
    ],
    notebook: {
      summary: 'Ransomware precursor activity surfaced before broad encryption impact. Recovery impairment, shadow copy targeting, and impact staging were correlated into a single investigation.',
      analystNotes: [
        'Initial access likely came from invoice_march2026.exe executed from the user downloads path.',
        'Recovery impairment and shadow copy targeting strongly indicate ransomware staging rather than commodity malware.',
        'Impact staging artifacts were observed, but broad encryption was prevented before full business disruption occurred.'
      ]
    },
    responseActions: [
      {
        name: 'Isolate endpoint',
        status: 'completed',
        actor: 'SOC Analyst',
        createdAt: '-1m'
      },
      {
        name: 'Investigate precursor detections',
        status: 'completed',
        actor: 'Sophos Endpoint',
        createdAt: '-2m'
      }
    ]
  } : undefined,
  threatGraphs: isRansomware ? {
    stacCases: {
      summary: {
        closed: 1,
        inprogress: 0,
        total: 1,
        new: 0
      },
      items: [
        {
          endpointType: 'computer',
          endpointName: 'DESKTOP-FIN042',
          username: '{{customerDomain}}\\sarah.chen',
          rootCauseName: 'invoice_march2026.exe',
          malwareName: 'Troj/Ransom-GKL',
          cloudCreatedAt: relTime('-3m', phaseShadow),
          rootCauseDT: relTime('-5m', phaseDisable),
          status: 'closed',
          priority: 'HIGH',
          id: 'auto',
          caseType: 'SYSTEM_GENERATED',
          suspectProcessCount: 4,
          numberOfBusinessFiles: '5',
          isBehavioral: false,
          hasProcessBeacon: false
        }
      ],
      total: 1,
      filtered: 1,
      nextKey: null
    },
    stacCaseDetail: buildRansomwareThreatGraphDetail(),
    graph: {
      nodes: [
        {
          id: 'n1',
          type: 'process',
          name: 'invoice_march2026.exe',
          hostname: 'DESKTOP-FIN042',
          properties: {
            name: 'invoice_march2026.exe',
            path: 'C:\\Users\\sarah.chen\\Downloads\\invoice_march2026.exe',
            user: 'sarah.chen',
            hostname: 'DESKTOP-FIN042'
          },
          decoration: { type: 'malicious', label: 'Malicious' }
        },
        {
          id: 'n2',
          type: 'process',
          name: 'powershell.exe',
          hostname: 'DESKTOP-FIN042',
          properties: {
            name: 'powershell.exe',
            path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
            cmdline: 'powershell.exe -ExecutionPolicy Bypass -C "vssadmin delete shadows /all /quiet"',
            user: 'sarah.chen',
            hostname: 'DESKTOP-FIN042'
          },
          decoration: { type: 'suspicious', label: 'Suspicious' },
          mitreAttacks: [{ id: 'T1490', name: 'Inhibit System Recovery' }]
        },
        {
          id: 'n3',
          type: 'artifact',
          name: 'README_RECOVER_FILES.txt',
          properties: {
            path: 'C:\\Users\\sarah.chen\\AppData\\Local\\Temp\\MDR-LAB-DEMO\\README_RECOVER_FILES.txt'
          },
          decoration: { type: 'impact', label: 'Impact Artifact' }
        }
      ],
      edges: [
        { source: 'n1', target: 'n2', type: 'spawned' },
        { source: 'n2', target: 'n3', type: 'created' }
      ]
    },
    artifacts: {
      items: [
        {
          name: 'README_RECOVER_FILES.txt',
          type: 'ransom-note',
          path: 'C:\\Users\\sarah.chen\\AppData\\Local\\Temp\\MDR-LAB-DEMO\\README_RECOVER_FILES.txt'
        },
        {
          name: 'document_1.encrypted',
          type: 'encrypted-marker',
          path: 'C:\\Users\\sarah.chen\\AppData\\Local\\Temp\\MDR-LAB-DEMO\\document_1.encrypted'
        }
      ]
    }
  } : undefined,
  auditLogs: isRansomware ? {
    mode: 'prepend',
    items: [
      {
        timestamp: relTime('-1m', phaseStage || phaseShadow),
        type: 'admin_action',
        category: 'endpoint',
        action: 'Investigation escalated',
        actor: 'SOC Analyst',
        actorType: 'admin',
        target: 'DESKTOP-FIN042',
        targetType: 'endpoint',
        result: 'success',
        description: 'Ransomware precursor activity on DESKTOP-FIN042 escalated for immediate analyst review.'
      },
      {
        timestamp: relTime('-2m', phaseShadow),
        type: 'system_event',
        category: 'endpoint',
        action: 'CryptoGuard precursor correlation',
        actor: 'Sophos Endpoint',
        actorType: 'system',
        target: 'DESKTOP-FIN042',
        targetType: 'endpoint',
        result: 'success',
        description: 'Sophos correlated service impairment, shadow copy targeting, and staged impact artifacts into a ransomware investigation.'
      },
      {
        timestamp: relTime('-3m', phaseDisable),
        type: 'system_event',
        category: 'endpoint',
        action: 'Tamper protection response',
        actor: 'Sophos Endpoint',
        actorType: 'system',
        target: 'DESKTOP-FIN042',
        targetType: 'endpoint',
        result: 'blocked',
        description: 'Attempt to impair backup and recovery protections was blocked before broad impact could occur.'
      }
    ]
  } : undefined
};

const json = JSON.stringify(extensionScenario, null, 2);
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json + '\n');
} else {
  process.stdout.write(json + '\n');
}
