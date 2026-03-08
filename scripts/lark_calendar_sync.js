#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const VIEW_ID = process.env.LARK_BASE_VIEW_ID || 'vew7oDkEXl';
const ITEM = process.env.LARK_OP_ITEM || 'LARK API';
const TARGET_CALENDAR_NAME = process.env.LARK_CALENDAR_NAME || '施工日历';
const DRY_RUN = process.env.DRY_RUN !== 'false';
const LIMIT = Number(process.env.LARK_CAL_LIMIT || '20');

function getField(field) { return execFileSync('op', ['item', 'get', ITEM, `--fields=${field}`, '--reveal'], { encoding: 'utf8' }).trim(); }
async function api(url, options = {}) { const res = await fetch(url, options); const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text }; } if (!res.ok || data.code) throw new Error(`HTTP ${res.status} :: ${JSON.stringify(data)}`); return data; }
function fmtTitle(fields) { return [fields['客户所在城市'], fields['电箱情况'], fields['充电桩情况']].map(v => String(v || '').trim()).filter(Boolean).join(' '); }
function fmtDesc(fields) { return [`客户姓名: ${fields['客户姓名'] || ''}`, `客户电话: ${fields['客户手机号'] || ''}`].join('\n'); }
function mapToCalendarPayload(calendarId, recordId, fields) {
  const start = new Date(Number(fields['施工时间']));
  const end = new Date(Number(fields['施工时间']) + 2 * 60 * 60 * 1000);
  return {
    calendar_id: calendarId,
    summary: fmtTitle(fields),
    description: fmtDesc(fields),
    location: String(fields['客户地址'] || '').trim(),
    start_time: String(Math.floor(start.getTime() / 1000)),
    end_time: String(Math.floor(end.getTime() / 1000)),
    visibility: 'default',
    reminders: [{ minutes: 30 }],
    custom_id: `larkbase-${recordId}`
  };
}
async function main() {
  const appId = getField('username'); const appSecret = getField('credential');
  const tokenResp = await api('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ app_id: appId, app_secret: appSecret }) });
  const tenantToken = tokenResp.tenant_access_token; const headers = { Authorization: `Bearer ${tenantToken}`, 'Content-Type': 'application/json; charset=utf-8' };
  const calendarsResp = await api('https://open.larksuite.com/open-apis/calendar/v4/calendars', { headers });
  const calendars = calendarsResp.data?.calendar_list || calendarsResp.data?.items || [];
  const target = calendars.find(c => (c.summary || c.name || '').trim() === TARGET_CALENDAR_NAME);
  if (!target) throw new Error(`Target calendar not found: ${TARGET_CALENDAR_NAME}`);
  let pageToken = ''; const records = [];
  do {
    const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`); url.searchParams.set('page_size', '500'); url.searchParams.set('view_id', VIEW_ID); if (pageToken) url.searchParams.set('page_token', pageToken);
    const resp = await api(url.toString(), { headers }); records.push(...(resp.data?.items || [])); pageToken = resp.data?.page_token || ''; if (!resp.data?.has_more) break;
  } while (pageToken);
  const candidates = records.map(r => ({ recordId: r.record_id, fields: r.fields || {} })).filter(r => r.fields['施工时间'] && r.fields['客户地址']).slice(0, LIMIT);
  const results = [];
  for (const c of candidates) {
    const payload = mapToCalendarPayload(target.calendar_id || target.id, c.recordId, c.fields);
    if (!payload.summary || !payload.start_time || !payload.location) continue;
    if (!DRY_RUN) {
      const created = await api('https://open.larksuite.com/open-apis/calendar/v4/events', { method: 'POST', headers, body: JSON.stringify(payload) });
      results.push({ recordId: c.recordId, title: payload.summary, location: payload.location, eventId: created.data?.event?.event_id || created.data?.event_id || null });
    } else {
      results.push({ recordId: c.recordId, title: payload.summary, location: payload.location, start_time: payload.start_time, calendar: TARGET_CALENDAR_NAME });
    }
  }
  const out = path.resolve(process.cwd(), 'output', 'lark_calendar_sync_preview.json'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ dryRun: DRY_RUN, calendar: TARGET_CALENDAR_NAME, count: results.length, results }, null, 2) + '\n');
  console.log(JSON.stringify({ dryRun: DRY_RUN, calendar: TARGET_CALENDAR_NAME, count: results.length, sample: results.slice(0, 5) }, null, 2));
}
main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
