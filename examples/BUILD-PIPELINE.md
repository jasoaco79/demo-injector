# LabOps → Demo Studio Build Pipeline

This repo now includes a first end-to-end bridge pipeline for turning a LabOps scenario into a Demo Studio extension scenario.

## Scripts

### 1. Scenario → Canonical
```bash
node scripts/map-labops-scenario-to-canonical.mjs <labops-scenario-json> <canonical-json>
```

### 2. CALDERA Operation → Canonical Execution
```bash
node scripts/map-caldera-operation-to-canonical-execution.mjs <operation-json> <execution-json>
```

### 3. Merge Canonical + Execution
```bash
node scripts/merge-canonical-with-execution.mjs <canonical-json> <execution-json> <merged-canonical-json>
```

### 4. Canonical → Extension Scenario
```bash
node scripts/map-canonical-to-extension-scenario.mjs <canonical-json> <extension-scenario-json>
```

### 5. Full Pipeline
```bash
node scripts/build-labops-extension-scenario.mjs <labops-scenario-json> [caldera-operation-json] [output-json]
```

## Example

### Scenario only
```bash
node scripts/build-labops-extension-scenario.mjs /tmp/labops-scn008.json
```

### Scenario + runtime execution
```bash
node scripts/build-labops-extension-scenario.mjs \
  /tmp/labops-scn008.json \
  examples/scn008-caldera-operation-sample.json \
  extension/scenarios/ransomware-scn008-generated.json
```

## Current output
Current pipeline supports:
- canonical scenario generation
- canonical execution timeline generation from CALDERA operation JSON
- merged canonical scenario with execution timeline
- runtime-aware extension scenario generation

## Next likely enhancements
- pull live CALDERA operation JSON directly from LabOps
- auto-name output from source scenario id
- import generated scenario directly into extension storage
- derive richer detections from actual command/output content
- support manual/Red Tools export mode
