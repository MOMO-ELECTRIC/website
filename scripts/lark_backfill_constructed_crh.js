#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const RECORD_IDS = (process.env.RECORD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const DRY_RUN = process.env.DRY_RUN !== 'false';
const RUNTIME = path.resolve(process.cwd(), 'secret', 'lark_oauth_runtime.json');
const OCR_FILE = path.resolve(process.cwd(), 'output', 'lark_ocr_prequal_today.json');
const OUTPUT = path.resolve(process.cwd(), 'output', 'lark_constructed_backfill_results.json');

function loadRuntime() {
  const raw = JSON.parse(fs.readFileSync(RUNTIME, 'utf8'));
  if (!raw.app_id || !raw.app_secret) throw new Error(`Missing app credentials in ${RUNTIME}`);
  return raw;
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.code) throw new Error(`HTTP ${res.status} :: ${JSON.stringify(data)}`);
  return data;
}

function text(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(' ').trim();
  if (typeof v === 'object') {
    if (typeof v.text === 'string') return v.text.trim();
    if (typeof v.name === 'string') return v.name.trim();
    return JSON.stringify(v);
  }
  return String(v).trim();
}

function firstLine(v) {
  return text(v).split(/\n+/).map(s => s.trim()).find(Boolean) || '';
}

function normalizeAddress(value) {
  const raw = firstLine(String(value || '').replace(/\s*\n\s*/g, ', '));
  return raw
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,])/g, '$1')
    .trim();
}

function detectCrh(value) {
  const m = String(value || '').match(/CRH-\d{5,6}/i);
  return m ? m[0].toUpperCase() : '';
}

function loadOcrMap() {
  if (!fs.existsSync(OCR_FILE)) return new Map();
  const data = JSON.parse(fs.readFileSync(OCR_FILE, 'utf8'));
  const map = new Map();
  for (const item of data.results || []) {
    const blobs = (item.attachments || []).map(a => a.visibleText || '').join('\n');
    const crh = detectCrh(blobs);
    if (item.recordId && crh) map.set(item.recordId, crh);
  }
  return map;
}

async function main() {
  if (!RECORD_IDS.length) throw new Error('Set RECORD_IDS=rec1,rec2,...');
  const runtime = loadRuntime();
  const ocrMap = loadOcrMap();

  const tokenResp = await api('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: runtime.app_id, app_secret: runtime.app_secret })
  });
  const headers = {
    Authorization: `Bearer ${tokenResp.tenant_access_token}`,
    'Content-Type': 'application/json; charset=utf-8'
  };

  const results = [];
  for (const recordId of RECORD_IDS) {
    const resp = await api(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`, { headers });
    const fields = resp.data?.record?.fields || {};
    const currentCrh = detectCrh(firstLine(fields['CRH_NO']));
    const claimNo = detectCrh(firstLine(fields['补贴申请号']));
    const ocrCrh = detectCrh(ocrMap.get(recordId) || '');
    const chosenCrh = currentCrh || claimNo || ocrCrh;
    const currentAddress = firstLine(fields['客户地址']);
    const normalizedAddress = normalizeAddress(fields['客户地址']);
    const payload = {};
    if (chosenCrh && chosenCrh !== currentCrh) payload['CRH_NO'] = chosenCrh;
    if (normalizedAddress && normalizedAddress !== currentAddress) payload['客户地址'] = normalizedAddress;
    if (!DRY_RUN && Object.keys(payload).length) {
      await api(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ fields: payload })
      });
    }
    results.push({
      recordId,
      customerName: firstLine(fields['客户姓名']),
      prequalId: firstLine(fields['EVHOME_PREQUAL_ID_OCR']) || firstLine(fields['补贴获批ID']),
      currentCrh,
      claimNo,
      ocrCrh,
      chosenCrh,
      currentAddress,
      normalizedAddress,
      payload,
      updated: !DRY_RUN && !!Object.keys(payload).length
    });
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ dryRun: DRY_RUN, count: results.length, results }, null, 2) + '\n');
  console.log(JSON.stringify({ dryRun: DRY_RUN, count: results.length, results }, null, 2));
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
