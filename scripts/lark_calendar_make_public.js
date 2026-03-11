#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const CALENDAR_ID = 'feishu.cn_lJRyrrr7nCTnGdvRvRZdhe@group.calendar.feishu.cn';

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
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const t = tokenResp.data.tenant_access_token;
  const headers = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json; charset=utf-8' };

  const before = await call(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(CALENDAR_ID)}`, { headers });
  const patch = await call(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(CALENDAR_ID)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ permission: 'public' })
  });
  const after = await call(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(CALENDAR_ID)}`, { headers });

  console.log(JSON.stringify({ before, patch, after }, null, 2));
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
