#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const ITEM = process.env.LARK_OP_ITEM || 'LARK API';
const MATCH_FILE = process.env.LARK_MATCH_OUTPUT || path.resolve(process.cwd(), 'output', 'lark_all_matches.json');
const DRY_RUN = process.env.DRY_RUN !== 'false';

function getField(field) { return execFileSync('op', ['item', 'get', ITEM, `--fields=${field}`, '--reveal'], { encoding: 'utf8' }).trim(); }
async function api(url, options = {}) { const res = await fetch(url, options); const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text }; } if (!res.ok || data.code) throw new Error(`HTTP ${res.status} :: ${JSON.stringify(data)}`); return data; }
async function main() {
  const appId = getField('username'); const appSecret = getField('credential');
  const tokenResp = await api('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ app_id: appId, app_secret: appSecret }) });
  const tenantToken = tokenResp.tenant_access_token;
  const headers = { Authorization: `Bearer ${tenantToken}`, 'Content-Type': 'application/json; charset=utf-8' };
  const fieldsResp = await api(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/fields`, { headers });
  const fields = fieldsResp.data?.items || [];
  const crhField = fields.find(f => (f.field_name || '').trim() === 'CRH_NO');
  const statusField = fields.find(f => (f.field_name || '').trim() === 'EVHOME_STATUS');
  if (!crhField) throw new Error('CRH_NO field not found');
  if (!statusField) throw new Error('EVHOME_STATUS field not found');
  const matches = JSON.parse(fs.readFileSync(MATCH_FILE, 'utf8')).matches || [];
  const updates = matches.filter(m => m.matchStatus === 'high' && m.bestMatch?.recordId && m.applicationId).map(m => ({ recordId: m.bestMatch.recordId, applicationId: m.applicationId, evhomeStatusZh: m.evhomeStatusZh || m.evhomeStatus || '', evhomeAddress: m.evhomeAddress }));
  const results = [];
  for (const u of updates) {
    const payload = { [crhField.field_name]: u.applicationId, [statusField.field_name]: u.evhomeStatusZh };
    if (!DRY_RUN) {
      await api(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${u.recordId}`, { method: 'PUT', headers, body: JSON.stringify({ fields: payload }) });
    }
    results.push({ ...u, payload });
  }
  console.log(JSON.stringify({ dryRun: DRY_RUN, count: results.length, updates: results }, null, 2));
}
main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
