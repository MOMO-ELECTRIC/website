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
  const calendarId = 'feishu.cn_Too082F3QbM0pwIs8XWTPd@group.calendar.feishu.cn';
  const baseUrl = `https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`;
  const commonHeaders = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json; charset=utf-8' };
  const start = String(Math.floor((Date.now() + 3600_000) / 1000));
  const end = String(Math.floor((Date.now() + 7200_000) / 1000));
  const variants = [
    { summary: 'OpenClaw test event A', description: 'probe', start_time: start, end_time: end },
    { summary: 'OpenClaw test event B', description: 'probe', start_time: { timestamp: start }, end_time: { timestamp: end } },
    { summary: 'OpenClaw test event C', description: 'probe', start_time: { timestamp: start, timezone: 'America/Los_Angeles' }, end_time: { timestamp: end, timezone: 'America/Los_Angeles' } },
    { event: { summary: 'OpenClaw test event D', description: 'probe', start_time: start, end_time: end } },
    { event: { summary: 'OpenClaw test event E', description: 'probe', start_time: { timestamp: start }, end_time: { timestamp: end } } }
  ];
  for (let i = 0; i < variants.length; i++) {
    const resp = await call(baseUrl, { method: 'POST', headers: commonHeaders, body: JSON.stringify(variants[i]) });
    console.log(`VARIANT ${i}`);
    console.log(JSON.stringify(resp, null, 2));
    if (resp.status === 200 && resp.data?.code === 0) break;
  }
}
main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
