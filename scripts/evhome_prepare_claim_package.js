#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const DEFAULT_INPUT = path.resolve(cwd, 'output', 'claim_upload_14880_ash');
const DEFAULT_UPLOAD_ROOT = '/tmp/openclaw/uploads/evhome-claim-packages';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(file) {
  return fs.existsSync(file);
}

function copyIfExists(src, dest, copied, missing) {
  if (!exists(src)) {
    missing.push(src);
    return false;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  copied.push(dest);
  return true;
}

function listMatches(dir, pattern) {
  return fs.readdirSync(dir)
    .filter(name => pattern.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(name => path.join(dir, name));
}

function buildPackage(inputDir, outputDir) {
  const copied = [];
  const missing = [];

  ensureDir(outputDir);

  const invoice = listMatches(inputDir, /^invoice-\d+\.pdf$/i)[0] || path.join(inputDir, 'invoice.pdf');
  const permitPreferred = [
    path.join(inputDir, 'permit-panel.pdf'),
    path.join(inputDir, 'permit-original-panel.pdf'),
    path.join(inputDir, 'permit-original-ev.pdf')
  ].filter(exists);
  const inspection = path.join(inputDir, 'inspection-report.pdf');
  const panelPhotos = listMatches(inputDir, /^new-panel-\d+\.(jpg|jpeg|png)$/i);
  const oldBreaker = [
    path.join(inputDir, 'old-main-breaker-cropped.jpg'),
    path.join(inputDir, 'old-main-breaker-original.jpg')
  ].filter(exists);

  copyIfExists(invoice, path.join(outputDir, 'invoice.pdf'), copied, missing);

  const permitManifest = [];
  permitPreferred.forEach((src, idx) => {
    const ext = path.extname(src).toLowerCase() || '.pdf';
    const dest = path.join(outputDir, `permit-${idx + 1}${ext}`);
    if (copyIfExists(src, dest, copied, missing)) permitManifest.push(path.basename(dest));
  });
  if (!permitPreferred.length) missing.push('permit-panel.pdf|permit-original-panel.pdf|permit-original-ev.pdf');

  const inspectionIncluded = copyIfExists(inspection, path.join(outputDir, 'inspection-report.pdf'), copied, missing);

  const panelManifest = [];
  panelPhotos.forEach((src, idx) => {
    const ext = path.extname(src).toLowerCase() || '.jpg';
    const dest = path.join(outputDir, `panel-photo-${idx + 1}${ext}`);
    if (copyIfExists(src, dest, copied, missing)) panelManifest.push(path.basename(dest));
  });
  oldBreaker.forEach((src, idx) => {
    const ext = path.extname(src).toLowerCase() || '.jpg';
    const dest = path.join(outputDir, `supporting-panel-photo-${idx + 1}${ext}`);
    if (copyIfExists(src, dest, copied, missing)) panelManifest.push(path.basename(dest));
  });
  if (!panelPhotos.length && !oldBreaker.length) missing.push('new-panel-*.jpg|old-main-breaker-*.jpg');

  const manifest = {
    generatedAt: new Date().toISOString(),
    inputDir,
    outputDir,
    uploadSlots: {
      itemizedInvoice: exists(invoice) ? ['invoice.pdf'] : [],
      permit: permitManifest,
      pictureOfInstalledCircuitOrPanel: [
        ...(inspectionIncluded ? ['inspection-report.pdf'] : []),
        ...panelManifest
      ]
    },
    copiedFiles: copied.map(file => path.basename(file)),
    missing
  };

  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function main() {
  const inputDir = path.resolve(process.env.INPUT_DIR || process.argv[2] || DEFAULT_INPUT);
  const packageName = process.env.PACKAGE_NAME || process.argv[3] || path.basename(inputDir);
  const outputDir = path.resolve(process.env.OUTPUT_DIR || path.join(DEFAULT_UPLOAD_ROOT, packageName));

  if (!exists(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const manifest = buildPackage(inputDir, outputDir);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
