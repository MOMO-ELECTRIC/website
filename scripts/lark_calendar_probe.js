#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

function getField(field) {
  return execFileSync('op', ['item', 'get', 'LARK API', `--fields=${field}`, '--reveal'], { encoding: 'utf8' }).trim();
}

async function main() {
  const appId = getField('username');
  const appSecret = getField('credential');
  const tokenRes = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const tokenData = await tokenRes.json();
  const t = tokenData.tenant_access_token;
  const res = await fetch('https://open.larksuite.com/open-apis/calendar/v4/calendars', {
    headers: { Authorization: `Bearer ${t}` }
  });
  const data = await res.json();
  console.log(JSON.stringify({ status: res.status, data }, null, 2));
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
