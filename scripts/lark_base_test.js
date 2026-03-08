#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const VIEW_ID = process.env.LARK_BASE_VIEW_ID || 'vew7oDkEXl';
const ITEM = process.env.LARK_OP_ITEM || 'LARK API';

function getField(field) {
  return execFileSync('op', ['item', 'get', ITEM, `--fields=${field}`, '--reveal'], { encoding: 'utf8' }).trim();
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.code) {
    throw new Error(`HTTP ${res.status} :: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const appId = process.env.LARK_APP_ID || getField('username');
  const appSecret = process.env.LARK_APP_SECRET || getField('credential');

  const tokenResp = await api('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });

  const tenantToken = tokenResp.tenant_access_token;

  const tables = await api(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables`, {
    headers: { Authorization: `Bearer ${tenantToken}` }
  });

  const fields = await api(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/fields`, {
    headers: { Authorization: `Bearer ${tenantToken}` }
  });

  const records = await api(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?page_size=5&view_id=${VIEW_ID}`, {
    headers: { Authorization: `Bearer ${tenantToken}` }
  });

  console.log(JSON.stringify({
    ok: true,
    tableCount: tables.data?.total || tables.data?.items?.length || 0,
    fieldNames: (fields.data?.items || []).map(x => x.field_name),
    sampleRecords: (records.data?.items || []).map(r => ({ record_id: r.record_id, fields: r.fields }))
  }, null, 2));
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
