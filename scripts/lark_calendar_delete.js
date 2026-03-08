#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const TARGET = process.env.LARK_CALENDAR_NAME || 'MOMO施工同步';

function getField(field) {
  return execFileSync('op', ['item', 'get', 'LARK API', `--fields=${field}`, '--reveal'], { encoding: 'utf8' }).trim();
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
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const t = tokenResp.data.tenant_access_token;
  const headers = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json; charset=utf-8' };

  const search = await call('https://open.larksuite.com/open-apis/calendar/v4/calendars/search', {
    method: 'POST', headers, body: JSON.stringify({ query: TARGET })
  });
  const items = search.data?.data?.items || [];
  const target = items.find(x => (x.summary || '').trim() === TARGET);
  if (!target) {
    console.log(JSON.stringify({ found: false, targetName: TARGET, search }, null, 2));
    return;
  }

  const del = await call(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(target.calendar_id)}`, {
    method: 'DELETE', headers
  });

  const verify = await call('https://open.larksuite.com/open-apis/calendar/v4/calendars/search', {
    method: 'POST', headers, body: JSON.stringify({ query: TARGET })
  });

  console.log(JSON.stringify({ found: true, target, deleteResult: del, verify }, null, 2));
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
