#!/usr/bin/env node
import path from 'path';
import { spawnSync } from 'child_process';

function usage() {
  console.error('Usage: node scripts/build-from-live-caldera.mjs <labops-scenario-json> <operation-id> [output-json]');
  process.exit(1);
}

const [, , scenarioPath, operationId, outputPath] = process.argv;
if (!scenarioPath || !operationId) usage();

const scriptDir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const repoRoot = path.resolve(scriptDir, '..');
const fetchedOpPath = path.join('/tmp', `caldera-operation-${operationId}.json`);
const finalOutput = outputPath || path.join(repoRoot, 'extension/scenarios/generated-from-live-caldera.json');

function runNode(script, args) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, script), ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

runNode('fetch-caldera-operation.mjs', [operationId, process.env.CALDERA_BASE_URL || 'http://localhost:8080/caldera', process.env.CALDERA_API_KEY || 'MDRLABRED', fetchedOpPath]);
runNode('build-labops-extension-scenario.mjs', [scenarioPath, fetchedOpPath, finalOutput]);

console.log('\nLive build complete:');
console.log(`- fetched operation: ${fetchedOpPath}`);
console.log(`- extension scenario: ${finalOutput}`);
