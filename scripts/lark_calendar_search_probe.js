#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

function getField(field) { return execFileSync('op', ['item', 'get', 'LARK API', `--fields=${field}`, '--reveal'], { encoding: 'utf8' }).trim(); }
async function call(url, options = {}) { const res = await fetch(url, options); const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text }; } return { status: res.status, data }; }

async function main() {
  const appId = getField('username');
  const appSecret = getField('credential');
  const tokenRes = await call('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const t = tokenRes.data.tenant_access_token;
  const headers = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json; charset=utf-8' };

  const variants = [
    { method: 'POST', url: 'https://open.larksuite.com/open-apis/calendar/v4/calendars/search', body: { query: '施工日历' } },
    { method: 'POST', url: 'https://open.larksuite.com/open-apis/calendar/v4/calendars/search', body: { summary: '施工日历' } },
    { method: 'GET', url: 'https://open.larksuite.com/open-apis/calendar/v4/calendars/search?query=' + encodeURIComponent('施工日历') },
    { method: 'GET', url: 'https://open.larksuite.com/open-apis/calendar/v4/calendars/primary' }
  ];

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const resp = await call(v.url, { method: v.method, headers, body: v.body ? JSON.stringify(v.body) : undefined });
    console.log(`VARIANT ${i}`);
    console.log(JSON.stringify(resp, null, 2));
  }
}
main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
