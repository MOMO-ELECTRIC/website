#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const TARGET = process.env.LARK_CALENDAR_NAME || 'MOMO 施工日历';

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

  const search = await call('https://open.larksuite.com/open-apis/calendar/v4/calendars/search', {
    method: 'POST', headers, body: JSON.stringify({ query: TARGET })
  });

  const items = search.data?.data?.items || [];
  const target = items.find(x => (x.summary || '').trim() === TARGET) || items[0] || null;
  if (!target) {
    console.log(JSON.stringify({ search, found: null }, null, 2));
    return;
  }

  const start = String(Math.floor((Date.now() + 3600_000) / 1000));
  const end = String(Math.floor((Date.now() + 7200_000) / 1000));
  const create = await call(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(target.calendar_id)}/events`, {
    method: 'POST', headers, body: JSON.stringify({
      summary: 'MOMO施工日历 测试事件',
      description: 'OpenClaw calendar probe',
      start_time: { timestamp: start },
      end_time: { timestamp: end },
      visibility: 'default'
    })
  });

  console.log(JSON.stringify({ target, create }, null, 2));
}

main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
