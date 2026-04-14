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

const extensionScenario = {
  id: `${(identity.category || 'scenario')}-canonical`,
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
    title: narrative.title || '{{customerName}} — Threat Story',
    subtitle: narrative.subtitle || identity.summary || '',
    threatFamily: narrative.threatFamily || 'Threat Briefing',
    type: 'storyboard',
    videoUrl: '',
    posterUrl: '',
    ctaLabel: 'Open Sophos Central Demo',
    autoLaunch: false,
    transitionLine: narrative.transitionLine || 'Now let’s move into Sophos Central and show how this incident becomes visible to your team in real time.',
    expectedDetections: (outcome.expectedDetections || []).map((d) => d.detection),
    mitreTechniques: attack.mitreTechniques || [],
    milestones: attack.milestones || [],
    slides: narrative.slides || [],
    talkingPoints: narrative.talkingPoints || [],
    industryTalkingPoints: narrative.industryTalkingPoints || {},
    runbookSteps: narrative.runbookSteps || [],
    clickPath: narrative.clickPath || [],
  },
  alerts: {
    mode: 'prepend',
    items: [
      {
        product: 'endpoint',
        threat: 'Ransomware Precursor',
        threat_cleanable: false,
        created_at: '-3m',
        severity: 'high',
        actionable: true,
        category: 'runtime_detections',
        when: '-3m',
        allowedActions: ['ACKNOWLEDGE'],
        location: 'DESKTOP-FIN042',
        type: 'Event::Endpoint::CoreDetection::CryptoGuard',
        source: null,
        data: {
          created_at: '-3m',
          endpoint_type: 'computer',
          endpoint_platform: 'windows'
        },
        description: 'Ransomware precursor behavior detected on DESKTOP-FIN042. Shadow copy deletion and recovery impairment activity observed.',
        info: 'High-confidence ransomware precursor detected'
      },
      {
        product: 'endpoint',
        threat: null,
        threat_cleanable: null,
        created_at: '-4m',
        severity: 'high',
        actionable: false,
        category: 'policy',
        when: '-4m',
        allowedActions: ['ACKNOWLEDGE'],
        location: 'DESKTOP-FIN042',
        type: 'Event::Endpoint::SavDisabled',
        source: null,
        data: {
          created_at: '-4m',
          endpoint_type: 'computer',
          endpoint_platform: 'windows'
        },
        description: 'Malicious process attempted to impair recovery and defensive services on DESKTOP-FIN042.',
        info: null
      }
    ],
    summaryDelta: {
      high: 2,
      medium: 0,
      low: 0
    }
  },
  cases: {
    mode: 'prepend',
    items: [
      {
        type: 'investigation',
        name: `(DESKTOP-FIN042) | ${identity.name || 'Threat Investigation'} — {{customerName}}`,
        managedBy: 'self',
        createdAt: '-3m',
        createdBy: { name: 'Auto-generated' },
        updatedAt: '-1m',
        status: 'investigating',
        initialDetection: {
          severity: 9,
          type: 'Threat',
          detectionRule: 'WIN-IMP-PRC-SHADOWCOPY-SELECT-DELETE-RESIZE-1',
          mitreAttacks: (attack.mitreTechniques || []).map((t) => ({
            tactic: { id: 'TA0000', name: 'Mapped Technique', techniques: [{ id: t.id, name: t.name }] }
          })),
          time: '-3m',
          sensor: {
            type: 'endpoint',
            source: 'Sophos Endpoint'
          }
        },
        assignee: { name: 'SOC Analyst' },
        overview: outcome.sophosOutcome || 'Threat activity surfaced for investigation and response.',
        detectionCount: Math.max((outcome.expectedDetections || []).length, 1),
        escalated: true
      }
    ]
  },
  detections: {
    mode: 'prepend',
    items: (outcome.expectedDetections || []).slice(0, 4).map((d, idx) => ({
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
      risk: d.severity === 'critical' ? 9 : d.severity === 'high' ? 8 : d.severity === 'medium' ? 6 : 4,
      category: 'Threat',
      classificationRule: 'CANONICAL-GENERATED-DETECTION',
      ruleDescription: d.detection,
      mitreAttacks: [],
      attackType: attack.attackType || 'Threat',
      severity: d.severity === 'critical' ? 9 : d.severity === 'high' ? 8 : d.severity === 'medium' ? 6 : 4,
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
  }
};

const json = JSON.stringify(extensionScenario, null, 2);
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json + '\n');
} else {
  process.stdout.write(json + '\n');
}
