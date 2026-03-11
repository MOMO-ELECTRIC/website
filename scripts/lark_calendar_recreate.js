#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const NAME = process.env.LARK_CALENDAR_NAME || 'MOMO施工同步';
const DESCRIPTION = process.env.LARK_CALENDAR_DESC || 'OpenClaw sync calendar for construction schedule';

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

  const create = await call('https://open.larksuite.com/open-apis/calendar/v4/calendars', {
    method: 'POST',
    headers,
    body: JSON.stringify({ summary: NAME, description: DESCRIPTION })
  });

  const search = await call('https://open.larksuite.com/open-apis/calendar/v4/calendars/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: NAME })
  });

  console.log(JSON.stringify({ create, search }, null, 2));
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
