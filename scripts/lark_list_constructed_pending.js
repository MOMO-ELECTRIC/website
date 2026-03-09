#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const VIEW_ID = process.env.LARK_BASE_VIEW_ID || 'vew7oDkEXl';
const OUTPUT = process.env.OUTPUT || path.resolve(process.cwd(), 'output', 'lark_constructed_pending.json');
const NOW_MS = process.env.NOW_MS ? Number(process.env.NOW_MS) : Date.now();

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

async function main() {
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  if (!appId || !appSecret) throw new Error('LARK_APP_ID and LARK_APP_SECRET are required');

  const tokenResp = await api('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const tenantToken = tokenResp.tenant_access_token;
  const headers = { Authorization: `Bearer ${tenantToken}` };

  const records = [];
  let pageToken = '';
  while (true) {
    const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`);
    url.searchParams.set('page_size', '500');
    url.searchParams.set('view_id', VIEW_ID);
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const resp = await api(url.toString(), { headers });
    records.push(...(resp.data?.items || []));
    if (!resp.data?.has_more) break;
    pageToken = resp.data?.page_token || '';
    if (!pageToken) break;
  }

  const filtered = records.map(r => {
    const f = r.fields || {};
    const scheduleMs = Number(f['施工时间'] || 0);
    const crhNo = firstLine(f['CRH_NO']);
    const prequal = firstLine(f['EVHOME_PREQUAL_ID_OCR']);
    return {
      recordId: r.record_id,
      customerName: firstLine(f['客户姓名']),
      phone: firstLine(f['客户手机号']),
      address: firstLine(f['客户地址']),
      prequalId: prequal,
      crhNo,
      scheduleMs,
      scheduleIso: scheduleMs ? new Date(scheduleMs).toISOString() : '',
      status: firstLine(f['客户进度']),
      evhomeStatus: firstLine(f['EVHOME_STATUS'])
    };
  }).filter(r => r.scheduleMs && r.scheduleMs < NOW_MS && r.prequalId && !r.crhNo)
    .sort((a, b) => a.scheduleMs - b.scheduleMs);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ nowMs: NOW_MS, nowIso: new Date(NOW_MS).toISOString(), count: filtered.length, records: filtered }, null, 2) + '\n');
  console.log(JSON.stringify({ count: filtered.length, records: filtered }, null, 2));
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
