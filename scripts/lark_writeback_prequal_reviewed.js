#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME = path.resolve(process.cwd(), 'secret', 'lark_oauth_runtime.json');
const AUDIT_JSON = path.resolve(process.cwd(), 'output', 'lark_prequal_ocr_audit.json');
const OUTPUT = path.resolve(process.cwd(), 'output', 'lark_prequal_reviewed_writeback.json');
const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const OCR_FIELD = process.env.LARK_OCR_FIELD || 'EVHOME_PREQUAL_ID_OCR';
const REVIEWED_FIELD = process.env.LARK_REVIEWED_PREQUAL_FIELD || '补贴获批ID';
const DRY_RUN = process.env.DRY_RUN !== 'false';

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.code) throw new Error(`HTTP ${res.status} :: ${JSON.stringify(data)}`);
  return data;
}

function loadRuntime() {
  const raw = loadJson(RUNTIME);
  if (!raw.app_id || !raw.app_secret) throw new Error(`Missing app credentials in ${RUNTIME}`);
  return raw;
}

function needsOcrCorrection(record) {
  const current = String(record.currentOcr || '').trim();
  const finalId = String(record.finalId || '').trim();
  if (!current || !finalId || current === finalId) return false;
  if (current === `${finalId}P`) return true;
  return false;
}

async function main() {
  const runtime = loadRuntime();
  const audit = loadJson(AUDIT_JSON);
  const tokenResp = await api('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: runtime.app_id, app_secret: runtime.app_secret })
  });
  const headers = {
    Authorization: `Bearer ${tokenResp.tenant_access_token}`,
    'Content-Type': 'application/json; charset=utf-8'
  };

  const candidates = (audit.records || []).filter(r => r.finalId && r.category !== 'unusable/non-prequal');
  const results = [];
  for (const record of candidates) {
    const payload = {};
    if (String(record.currentOcr || '').trim() !== String(record.finalId || '').trim() && needsOcrCorrection(record)) {
      payload[OCR_FIELD] = record.finalId;
    }
    if (String(record.currentOcr || '').trim() === String(record.finalId || '').trim() || String(record.currentOcr || '').trim() !== String(record.finalId || '').trim()) {
      payload[REVIEWED_FIELD] = record.finalId;
    }

    const changed = Object.keys(payload).length > 0;
    if (!DRY_RUN && changed) {
      await api(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${record.recordId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ fields: payload })
      });
    }

    results.push({
      recordId: record.recordId,
      address: record.address || '',
      category: record.category,
      finalId: record.finalId,
      currentOcr: record.currentOcr || '',
      payload,
      changed,
      updated: !DRY_RUN && changed
    });
  }

  const summary = {
    dryRun: DRY_RUN,
    totalCandidates: candidates.length,
    changed: results.filter(r => r.changed).length,
    ocrCorrections: results.filter(r => Object.prototype.hasOwnProperty.call(r.payload, OCR_FIELD)).length,
    reviewedWrites: results.filter(r => Object.prototype.hasOwnProperty.call(r.payload, REVIEWED_FIELD)).length,
    results
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({
    dryRun: summary.dryRun,
    totalCandidates: summary.totalCandidates,
    changed: summary.changed,
    ocrCorrections: summary.ocrCorrections,
    reviewedWrites: summary.reviewedWrites,
    sample: results.filter(r => r.changed).slice(0, 10)
  }, null, 2));
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
