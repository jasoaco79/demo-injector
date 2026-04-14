#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function usage() {
  console.error('Usage: node scripts/merge-canonical-with-execution.mjs <canonical-json> <execution-json> [output-json]');
  process.exit(1);
}

const [, , canonicalPath, executionPath, outputPath] = process.argv;
if (!canonicalPath || !executionPath) usage();

const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
const execution = JSON.parse(fs.readFileSync(executionPath, 'utf8'));

const next = {
  ...canonical,
  source: {
    ...(canonical.source || {}),
    operationId: execution.operationId || canonical.source?.operationId || null,
  },
  execution: {
    mode: execution.mode || canonical.execution?.mode || 'caldera',
    status: execution.status || canonical.execution?.status || 'running',
    timeline: execution.timeline || canonical.execution?.timeline || [],
    artifacts: execution.artifacts || canonical.execution?.artifacts || [],
    operatorNotes: execution.operatorNotes || canonical.execution?.operatorNotes || []
  }
};

const json = JSON.stringify(next, null, 2);
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json + '\n');
} else {
  process.stdout.write(json + '\n');
}
