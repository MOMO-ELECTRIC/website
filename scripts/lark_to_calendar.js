#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const VIEW_ID = process.env.LARK_BASE_VIEW_ID || 'vew7oDkEXl';
const ITEM = process.env.LARK_OP_ITEM || 'LARK API';
const CALENDAR_NAME = process.env.APPLE_CALENDAR_NAME || 'MOMO 电力';
const DRY_RUN = process.env.DRY_RUN !== 'false';
const LIMIT = Number(process.env.LARK_CAL_LIMIT || '20');

function getField(field) {
  return execFileSync('op', ['item', 'get', ITEM, `--fields=${field}`, '--reveal'], { encoding: 'utf8' }).trim();
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.code) throw new Error(`HTTP ${res.status} :: ${JSON.stringify(data)}`);
  return data;
}

function fmtTitle(fields) {
  return [fields['客户所在城市'], fields['电箱情况'], fields['充电桩情况']]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
}

function fmtNotes(fields) {
  return [
    `客户姓名: ${fields['客户姓名'] || ''}`,
    `客户电话: ${fields['客户手机号'] || ''}`
  ].join('\n');
}

function toDateParts(ms) {
  const d = new Date(Number(ms));
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes()
  };
}

function esc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function createAppleScriptEvent(calendarName, title, location, notes, startMs) {
  const start = toDateParts(startMs);
  const end = toDateParts(Number(startMs) + 2 * 60 * 60 * 1000);
  return `tell application "Calendar"
set calName to "${esc(calendarName)}"
set theTitle to "${esc(title)}"
set theLocation to "${esc(location)}"
set theDescription to "${esc(notes)}"
set startDate to date "${start.month}/${start.day}/${start.year} ${start.hour}:${String(start.minute).padStart(2, '0')}"
set endDate to date "${end.month}/${end.day}/${end.year} ${end.hour}:${String(end.minute).padStart(2, '0')}"
set targetCalendar to first calendar whose name is calName
set newEvent to make new event at end of events of targetCalendar with properties {summary:theTitle, start date:startDate, end date:endDate, location:theLocation, description:theDescription}
return uid of newEvent
end tell`;
}

async function main() {
  const appId = getField('username');
  const appSecret = getField('credential');
  const tokenResp = await api('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const tenantToken = tokenResp.tenant_access_token;
  let pageToken = '';
  const records = [];
  do {
    const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`);
    url.searchParams.set('page_size', '500');
    url.searchParams.set('view_id', VIEW_ID);
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const resp = await api(url.toString(), { headers: { Authorization: `Bearer ${tenantToken}` } });
    records.push(...(resp.data?.items || []));
    pageToken = resp.data?.page_token || '';
    if (!resp.data?.has_more) break;
  } while (pageToken);

  const candidates = records
    .map(r => ({ recordId: r.record_id, fields: r.fields || {} }))
    .filter(r => r.fields['施工时间'] && r.fields['客户地址'])
    .slice(0, LIMIT)
    .map(r => ({
      recordId: r.recordId,
      title: fmtTitle(r.fields),
      location: String(r.fields['客户地址'] || '').trim(),
      notes: fmtNotes(r.fields),
      startMs: Number(r.fields['施工时间'])
    }))
    .filter(x => x.title && x.location && x.startMs);

  const results = [];
  for (const item of candidates) {
    if (!DRY_RUN) {
      const script = createAppleScriptEvent(CALENDAR_NAME, item.title, item.location, item.notes, item.startMs);
      const uid = execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim();
      results.push({ ...item, calendar: CALENDAR_NAME, uid });
    } else {
      results.push({ ...item, calendar: CALENDAR_NAME });
    }
  }

  const out = path.resolve(process.cwd(), 'output', 'calendar_sync_preview.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ dryRun: DRY_RUN, count: results.length, results }, null, 2) + '\n');
  console.log(JSON.stringify({ dryRun: DRY_RUN, calendar: CALENDAR_NAME, count: results.length, sample: results.slice(0, 5) }, null, 2));
}

main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
