#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function usage() {
  console.error('Usage: node scripts/fetch-caldera-operation.mjs <operation-id> [base-url] [api-key] [output-json]');
  console.error('Defaults:');
  console.error('  base-url = process.env.CALDERA_BASE_URL || http://localhost:8080/caldera');
  console.error('  api-key  = process.env.CALDERA_API_KEY  || MDRLABRED');
  process.exit(1);
}

const [, , operationId, baseUrlArg, apiKeyArg, outputPathArg] = process.argv;
if (!operationId) usage();

const baseUrl = baseUrlArg || process.env.CALDERA_BASE_URL || 'http://localhost:8080/caldera';
const apiKey = apiKeyArg || process.env.CALDERA_API_KEY || 'MDRLABRED';
const outputPath = outputPathArg || path.join('/tmp', `caldera-operation-${operationId}.json`);

const url = `${baseUrl.replace(/\/$/, '')}/api/v2/operations/${operationId}`;

const response = await fetch(url, {
  headers: {
    KEY: apiKey
  }
});

if (!response.ok) {
  const text = await response.text().catch(() => '');
  console.error(`Failed to fetch operation ${operationId}: HTTP ${response.status}`);
  if (text) console.error(text.slice(0, 1000));
  process.exit(1);
}

const json = await response.json();
fs.writeFileSync(outputPath, JSON.stringify(json, null, 2) + '\n');
console.log(outputPath);
