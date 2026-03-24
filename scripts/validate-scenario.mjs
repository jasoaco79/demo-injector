#!/usr/bin/env node
/**
 * Validate a scenario JSON file against the schema.
 * Usage: node scripts/validate-scenario.mjs [file.json | --all]
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const VALID_MITRE_TACTICS = ['TA0001','TA0002','TA0003','TA0004','TA0005','TA0006','TA0007','TA0008','TA0009','TA0010','TA0011','TA0040','TA0042','TA0043'];
const VALID_SEVERITIES = ['high', 'medium', 'low'];
const VALID_CASE_STATUS = ['new', 'investigating', 'containment', 'resolved', 'closed'];
const VALID_MANAGED_BY = ['self', 'mtr'];
const VALID_ALERT_MODES = ['prepend', 'override'];

const errors = [];
const warnings = [];

function err(path, msg) { errors.push(`❌ ${path}: ${msg}`); }
function warn(path, msg) { warnings.push(`⚠️  ${path}: ${msg}`); }

function validate(scenario, filename) {
  errors.length = 0;
  warnings.length = 0;

  // Required top-level fields
  if (!scenario.id) err('id', 'Missing scenario ID');
  if (!scenario.name) err('name', 'Missing scenario name');
  if (!scenario.description) warn('description', 'Missing description (shown in popup dropdown)');

  // Customer
  if (!scenario.customer) warn('customer', 'No customer defaults — SE must enter manually');
  if (scenario.customer?.endpointCount && scenario.customer.endpointCount < 10) warn('customer.endpointCount', 'Very low endpoint count: ' + scenario.customer.endpointCount);

  // Alerts
  if (scenario.alerts) {
    const a = scenario.alerts;
    if (a.mode && !VALID_ALERT_MODES.includes(a.mode)) err('alerts.mode', `Invalid mode "${a.mode}" — must be prepend or override`);
    if (a.items) {
      for (let i = 0; i < a.items.length; i++) {
        const alert = a.items[i];
        if (!alert.severity) err(`alerts.items[${i}].severity`, 'Missing severity');
        else if (!VALID_SEVERITIES.includes(alert.severity)) err(`alerts.items[${i}].severity`, `Invalid severity "${alert.severity}"`);
        if (!alert.description) err(`alerts.items[${i}].description`, 'Missing description — this is what the SE reads aloud');
        if (!alert.location) warn(`alerts.items[${i}].location`, 'No location (hostname) — will show blank in UI');
        if (!alert.type) warn(`alerts.items[${i}].type`, 'No event type');
      }

      // Verify summaryDelta matches
      if (a.summaryDelta) {
        const counts = { high: 0, medium: 0, low: 0 };
        for (const alert of a.items) {
          if (alert.severity) counts[alert.severity]++;
        }
        for (const sev of VALID_SEVERITIES) {
          if ((a.summaryDelta[sev] || 0) !== counts[sev]) {
            warn(`alerts.summaryDelta.${sev}`, `Says ${a.summaryDelta[sev] || 0} but items have ${counts[sev]} ${sev}-severity alerts`);
          }
        }
      }
    }
  } else {
    warn('alerts', 'No alerts defined');
  }

  // Cases
  if (scenario.cases?.items) {
    for (let i = 0; i < scenario.cases.items.length; i++) {
      const c = scenario.cases.items[i];
      if (!c.name) err(`cases.items[${i}].name`, 'Missing case name');
      if (c.status && !VALID_CASE_STATUS.includes(c.status)) err(`cases.items[${i}].status`, `Invalid status "${c.status}"`);
      if (c.managedBy && !VALID_MANAGED_BY.includes(c.managedBy)) err(`cases.items[${i}].managedBy`, `Invalid managedBy "${c.managedBy}" — use "self" or "mtr"`);
      if (!c.overview) warn(`cases.items[${i}].overview`, 'No overview text — case detail will look empty');

      // MITRE validation
      if (c.initialDetection?.mitreAttacks) {
        for (const ma of c.initialDetection.mitreAttacks) {
          const tid = ma.tactic?.id;
          if (tid && !VALID_MITRE_TACTICS.includes(tid)) err(`cases.items[${i}].mitre`, `Invalid MITRE tactic ID "${tid}"`);
          if (!ma.tactic?.techniques?.length) warn(`cases.items[${i}].mitre`, `Tactic ${tid} has no techniques`);
        }
      }
    }
  }

  // Detections
  if (scenario.detections?.items) {
    for (let i = 0; i < scenario.detections.items.length; i++) {
      const d = scenario.detections.items[i];
      if (!d.device?.hostname && !d.rawData?.meta_hostname) warn(`detections.items[${i}]`, 'No hostname — device column will be empty');
      if (!d.classificationRule) warn(`detections.items[${i}]`, 'No classificationRule');
      if (!d.ruleDescription) warn(`detections.items[${i}]`, 'No ruleDescription');
      if (d.risk == null && d.severity == null) warn(`detections.items[${i}]`, 'No risk/severity score');
    }
  }

  // Health score
  if (scenario.healthScore?.override != null) {
    const hs = scenario.healthScore.override;
    if (hs < 0 || hs > 100) err('healthScore.override', `Invalid health score ${hs} — must be 0-100`);
  }

  // Template validation
  const json = JSON.stringify(scenario);
  const templates = json.match(/\{\{[^}]+\}\}/g) || [];
  const validTemplates = ['customerName', 'endpointCount', 'serverCount', 'customerDomain'];
  for (const t of templates) {
    const inner = t.replace(/\{\{|\}\}/g, '').trim();
    const varName = inner.split('*')[0].trim();
    if (!validTemplates.includes(varName)) {
      warn('template', `Unknown template variable: ${t}`);
    }
  }

  // Timestamp validation
  const timestamps = json.match(/"-\d+[mhd]"/g) || [];
  // These are fine — just informational

  // Print results
  console.log(`\n📋 ${filename}`);
  console.log(`   Alerts: ${scenario.alerts?.items?.length || 0} | Cases: ${scenario.cases?.items?.length || 0} | Detections: ${scenario.detections?.items?.length || 0}`);
  console.log(`   Health: ${scenario.healthScore?.override ?? 'default'} | Timed events: ${scenario.timedEvents?.length || 0}`);
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`   ✅ Valid — no issues found`);
  } else {
    for (const e of errors) console.log(`   ${e}`);
    for (const w of warnings) console.log(`   ${w}`);
    console.log(`   ${errors.length} error(s), ${warnings.length} warning(s)`);
  }

  return errors.length === 0;
}

// Main
const args = process.argv.slice(2);

if (args.includes('--all') || args.length === 0) {
  const dir = 'extension/scenarios';
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  let allValid = true;

  console.log(`Validating ${files.length} scenario(s)...`);
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (!validate(data, f)) allValid = false;
  }

  console.log(`\n${allValid ? '✅ All scenarios valid' : '❌ Some scenarios have errors'}`);
  process.exit(allValid ? 0 : 1);
} else {
  for (const file of args) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    validate(data, file);
  }
}
