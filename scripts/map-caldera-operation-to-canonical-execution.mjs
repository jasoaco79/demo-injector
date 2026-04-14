#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function usage() {
  console.error('Usage: node scripts/map-caldera-operation-to-canonical-execution.mjs <operation-json> [output-json]');
  process.exit(1);
}

const [, , inputPath, outputPath] = process.argv;
if (!inputPath) usage();

const op = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const chain = Array.isArray(op.chain) ? op.chain : [];

function linkStatus(lk) {
  const s = lk.status;
  if (s === 2) return 'complete';
  if (s === -1) return 'failed';
  if (s === -3) return 'discarded';
  if (s === 1) return 'collecting';
  if (s === 0 && lk.finish) return 'complete';
  if (s === 0) return 'running';
  return 'unknown';
}

function canonicalStatus(lk) {
  const st = linkStatus(lk);
  if (st === 'complete') return 'complete';
  if (st === 'running' || st === 'collecting') return 'running';
  if (st === 'failed') return 'failed';
  if (st === 'discarded') return 'blocked';
  return 'running';
}

function extractEvidence(lk) {
  const evidence = [];
  if (lk.command) evidence.push(String(lk.command).slice(0, 500));
  if (Array.isArray(lk.facts) && lk.facts.length) {
    evidence.push(`facts:${lk.facts.length}`);
  }
  if (lk.output) evidence.push(String(lk.output).slice(0, 500));
  return evidence;
}

const timeline = chain.map((lk, idx) => ({
  timestamp: lk.finish || lk.collect || lk.decide || lk.pin || null,
  phaseId: lk.ability?.ability_id || `phase-${idx + 1}`,
  techniqueId: lk.ability?.technique_id || lk.ability?.technique?.attack_id || null,
  name: lk.ability?.name || `Link ${idx + 1}`,
  status: canonicalStatus(lk),
  evidence: extractEvidence(lk)
}));

const result = {
  mode: 'caldera',
  status: op.state === 'finished' ? 'complete' : op.state === 'cleanup' ? 'blocked' : (op.state || 'running'),
  operationId: op.id || null,
  operationName: op.name || null,
  adversaryId: op.adversary?.adversary_id || null,
  agentPaw: op.paw || null,
  startedAt: op.start || null,
  finishedAt: op.finish || null,
  timeline,
  artifacts: [],
  operatorNotes: []
};

const json = JSON.stringify(result, null, 2);
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json + '\n');
} else {
  process.stdout.write(json + '\n');
}
