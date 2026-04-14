#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function usage() {
  console.error('Usage: node scripts/build-labops-extension-scenario.mjs <labops-scenario-json> [caldera-operation-json] [output-json]');
  process.exit(1);
}

const [, , scenarioPath, operationPathArg, outputPathArg] = process.argv;
if (!scenarioPath) usage();

const scriptDir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const repoRoot = path.resolve(scriptDir, '..');

const operationPath = operationPathArg && !operationPathArg.endsWith('.json') && !outputPathArg ? null : operationPathArg;
const outputPath = outputPathArg || (operationPath ? path.join(repoRoot, 'extension/scenarios/generated-from-labops.json') : path.join(repoRoot, 'extension/scenarios/generated-from-labops.json'));

const tmpCanonical = path.join('/tmp', `canonical-${Date.now()}.json`);
const tmpExecution = path.join('/tmp', `execution-${Date.now()}.json`);
const tmpMerged = path.join('/tmp', `canonical-merged-${Date.now()}.json`);

function runNode(script, args) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, script), ...args], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

runNode('map-labops-scenario-to-canonical.mjs', [scenarioPath, tmpCanonical]);

let sourceForExtension = tmpCanonical;
if (operationPath) {
  runNode('map-caldera-operation-to-canonical-execution.mjs', [operationPath, tmpExecution]);
  runNode('merge-canonical-with-execution.mjs', [tmpCanonical, tmpExecution, tmpMerged]);
  sourceForExtension = tmpMerged;
}

runNode('map-canonical-to-extension-scenario.mjs', [sourceForExtension, outputPath]);

console.log('\nBuild complete:');
console.log(`- canonical: ${tmpCanonical}`);
if (operationPath) {
  console.log(`- execution: ${tmpExecution}`);
  console.log(`- merged canonical: ${tmpMerged}`);
}
console.log(`- extension scenario: ${outputPath}`);
