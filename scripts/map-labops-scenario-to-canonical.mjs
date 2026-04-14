#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function usage() {
  console.error('Usage: node scripts/map-labops-scenario-to-canonical.mjs <labops-scenario-json> [output-json]');
  process.exit(1);
}

const [, , inputPath, outputPath] = process.argv;
if (!inputPath) usage();

const defaults = {
  customer: {
    name: 'Contoso Healthcare',
    industry: 'healthcare',
    endpointCount: 2500,
    serverCount: 186,
  },
};

const raw = fs.readFileSync(inputPath, 'utf8');
const scenario = JSON.parse(raw);

function attackTypeFromScenario(s) {
  const hay = [s.title, s.description, s.narrative, ...(s.tools || [])].join(' ').toLowerCase();
  if (hay.includes('ransom')) return 'ransomware';
  if (hay.includes('phish')) return 'phishing';
  if (hay.includes('credential')) return 'credential-access';
  return 'generic';
}

function threatFamilyForAttackType(type) {
  if (type === 'ransomware') return 'Live Attack Chain → Ransomware';
  if (type === 'phishing') return 'Live Attack Chain → Phishing';
  if (type === 'credential-access') return 'Live Attack Chain → Credential Access';
  return 'Live Attack Chain';
}

function initialVectorForAttackType(type) {
  if (type === 'ransomware') return 'malicious file';
  if (type === 'phishing') return 'email link or attachment';
  return 'initial access event';
}

function buildNarrative(s, attackType) {
  const title = '{{customerName}} — ' + (attackType === 'ransomware' ? 'Live Attack Chain' : (s.title || 'Threat Story'));
  const subtitle = attackType === 'ransomware'
    ? 'A realistic multi-stage ransomware storyline built to show stakeholders exactly how a high-consequence attack unfolds, why it matters to {{customerName}}, and how Sophos surfaces the incident inside Central before impact becomes business reality.'
    : (s.description || 'A customer-facing threat storyline built from LabOps scenario output.');

  const talkingPoints = Array.isArray(s.talking_points?.universal) ? s.talking_points.universal : [];
  const industryTalkingPoints = {
    healthcare: s.talking_points?.healthcare || [],
    financial_services: s.talking_points?.financial_services || [],
    manufacturing: s.talking_points?.manufacturing || [],
  };

  const runbookSteps = Array.isArray(s.se_runbook?.steps) ? s.se_runbook.steps : [];

  const clickPath = attackType === 'ransomware'
    ? [
        'Start on the alert view and show the critical ransomware-related precursor activity that would immediately draw analyst attention.',
        'Open the investigation or case context to show how Sophos connects the activity into a coherent incident, not just isolated alerts.',
        'Move into detections and threat activity to prove the attack chain, then close on the response outcome and why the attack did not become a business crisis.'
      ]
    : [];

  const slides = attackType === 'ransomware'
    ? [
        {
          title: 'Initial compromise at {{customerName}}',
          body: 'A user opens a convincing business file and triggers a ransomware chain. What looks like a single bad click quickly becomes an enterprise risk event for {{customerName}}.'
        },
        {
          title: 'The attacker moves toward impact',
          body: 'Before encryption begins, the attacker weakens recovery by disabling protections, targeting shadow copies, and staging the conditions for business disruption.'
        },
        {
          title: 'Sophos changes the outcome',
          body: 'Sophos surfaces the precursor behavior, escalates the threat, and gives the team at {{customerName}} a response path before encryption becomes business reality.'
        }
      ]
    : [];

  return {
    threatFamily: threatFamilyForAttackType(attackType),
    title,
    subtitle,
    businessStakes: attackType === 'ransomware'
      ? [
          'Operational disruption and downtime',
          'Loss of recovery options before encryption begins',
          'Executive escalation and business continuity impact'
        ]
      : ['Operational disruption', 'Security escalation'],
    transitionLine: 'Now let’s move into Sophos Central and show how this incident becomes visible to your team in real time.',
    talkingPoints,
    industryTalkingPoints,
    runbookSteps,
    clickPath,
    slides,
  };
}

function buildPhases(s, attackType) {
  if (attackType === 'ransomware') {
    return [
      {
        id: 'phase-1-disable-defenses',
        label: 'Disable backup and recovery services',
        description: 'The attacker disables or impairs the Windows services that make recovery possible after ransomware deployment.',
        techniqueIds: ['T1562.001', 'T1489'],
        status: 'planned'
      },
      {
        id: 'phase-2-target-recovery',
        label: 'Target recovery mechanisms',
        description: 'The attacker enumerates and targets volume shadow copies, creating the classic no-return ransomware precursor moment.',
        techniqueIds: ['T1490'],
        status: 'planned'
      },
      {
        id: 'phase-3-stage-impact',
        label: 'Stage ransom note and encrypted file markers',
        description: 'The attacker stages ransom artifacts and visible evidence of impact.',
        techniqueIds: ['T1486'],
        status: 'planned'
      }
    ];
  }

  return (s.mitre_techniques || []).map((t, i) => ({
    id: `phase-${i + 1}`,
    label: t.name,
    description: s.description || null,
    techniqueIds: [t.id],
    status: 'planned'
  }));
}

function buildMilestones(s, attackType) {
  if (attackType === 'ransomware') {
    return [
      { id: 'T1562.001', label: 'Defenses impaired' },
      { id: 'T1490', label: 'Recovery mechanisms targeted' },
      { id: 'T1486', label: 'Encryption attempt stopped before impact' }
    ];
  }

  return (s.mitre_techniques || []).slice(0, 3).map((t) => ({ id: t.id, label: t.name }));
}

const attackType = attackTypeFromScenario(scenario);
const canonical = {
  source: {
    type: 'labops',
    scenarioId: scenario.id,
    calderaAdversaryId: scenario.caldera_adversary_id || scenario.caldera_ability || null,
    executionEngine: scenario.execution_engine || 'none',
    operationId: null,
    notes: `Generated from LabOps scenario ${scenario.id}`,
  },
  identity: {
    name: scenario.title || scenario.id,
    summary: scenario.description || '',
    category: attackType,
    audience: scenario.audience || 'Technical',
    platform: scenario.platform || 'windows',
    tags: [],
  },
  customer: defaults.customer,
  narrative: buildNarrative(scenario, attackType),
  attack: {
    initialVector: initialVectorForAttackType(attackType),
    attackType,
    mitreTactics: scenario.mitre_tactics || [],
    mitreTechniques: scenario.mitre_techniques || [],
    tools: scenario.tools || [],
    phases: buildPhases(scenario, attackType),
    milestones: buildMilestones(scenario, attackType),
  },
  execution: {
    mode: scenario.execution_engine || 'none',
    status: 'not-run',
    timeline: [],
    artifacts: [],
    operatorNotes: [],
  },
  expectedOutcome: {
    stoppedAt: attackType === 'ransomware' ? 'T1490' : null,
    sophosOutcome: attackType === 'ransomware'
      ? 'Sophos escalates and interrupts the ransomware chain before broad encryption impact occurs.'
      : 'Sophos detects and surfaces the attack chain for investigation and response.',
    expectedDetections: scenario.expected_detections || [],
  },
  centralProjection: {
    alerts: [],
    detections: [],
    cases: [],
    caseDetail: [],
    threatGraph: null,
  },
};

const json = JSON.stringify(canonical, null, 2);
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json + '\n');
} else {
  process.stdout.write(json + '\n');
}
