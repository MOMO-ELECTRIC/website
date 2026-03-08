#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const ITEM = process.env.LARK_OP_ITEM || 'LARK API';
const RECORD_ID = process.env.LARK_RECORD_ID || 'recP0b0kO8';
const FIELD_NAME = process.env.LARK_FIELD_NAME || 'CRH_NO';
const VALUE = process.env.LARK_FIELD_VALUE || 'CRH-TEST-PROBE';

function getField(field) {
  return execFileSync('op', ['item', 'get', ITEM, `--fields=${field}`, '--reveal'], { encoding: 'utf8' }).trim();
}

async function call(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function main() {
  const appId = getField('username');
  const appSecret = getField('credential');

  const tokenResp = await call('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });

  const tenantToken = tokenResp.data.tenant_access_token;
  const headers = { Authorization: `Bearer ${tenantToken}`, 'Content-Type': 'application/json; charset=utf-8' };

  const readBefore = await call(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${RECORD_ID}`, { headers });
  const writeAttempt = await call(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${RECORD_ID}`, {
    method: 'PUT', headers, body: JSON.stringify({ fields: { [FIELD_NAME]: VALUE } })
  });
  const readAfter = await call(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${RECORD_ID}`, { headers });

  console.log(JSON.stringify({ tokenStatus: tokenResp.status, readBefore, writeAttempt, readAfter }, null, 2));
}

main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
