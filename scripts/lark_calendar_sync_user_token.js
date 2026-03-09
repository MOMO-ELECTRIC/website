#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Usage:
// 1) export LARK_USER_TOKEN="..."
// 2) node scripts/lark_calendar_sync_user_token.js
// Optional env:
//   LARK_BASE_APP_TOKEN, LARK_BASE_TABLE_ID, LARK_BASE_VIEW_ID, LARK_OP_ITEM
//   LARK_CALENDAR_NAME (default: 施工日历)
//   DRY_RUN (set to 'false' to actually write)
//   LARK_LIMIT (number)

const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const VIEW_ID = process.env.LARK_BASE_VIEW_ID || 'vew7oDkEXl';
const TARGET_CALENDAR_NAME = process.env.LARK_CALENDAR_NAME || 'MOMO 施工日历';
const DRY_RUN = process.env.DRY_RUN !== 'false';
const LIMIT = Number(process.env.LARK_LIMIT || '20');

function api(url, options = {}) { return fetch(url, options).then(async res => { const text = await res.text(); try { const json = JSON.parse(text); if (!res.ok || json.code) throw new Error(`HTTP ${res.status} :: ${JSON.stringify(json)}`); return json; } catch (e) { if (!res.ok) throw new Error(`HTTP ${res.status} :: ${text}`); try { return JSON.parse(text); } catch { return { raw: text }; } } }); }

function fmtTitle(fields) { return [fields['客户所在城市'], fields['电箱情况'], fields['充电桩情况']].map(v=>String(v||'').trim()).filter(Boolean).join(' '); }
function fmtDesc(fields) { return [`客户姓名: ${fields['客户姓名']||''}`, `客户电话: ${fields['客户手机号']||''}`, `客户地址: ${fields['客户地址']||''}`].join('\n'); }
function formatDateInTZ(ms, timeZone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(ms));
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function mapToCalendarPayload(recordId, fields) {
  const startDate = formatDateInTZ(Number(fields['施工时间']));
  const address = String(fields['客户地址'] || '').trim();
  return {
    summary: fmtTitle(fields),
    description: `${fmtDesc(fields)}\n\nOpenClaw Sync ID: larkbase-${recordId}`,
    location: address ? { name: address, address } : undefined,
    start_time: { date: startDate },
    end_time: { date: startDate },
    visibility: 'default'
  };
}

async function main() {
  const userToken = process.env.LARK_USER_TOKEN;
  if (!userToken) throw new Error('Missing LARK_USER_TOKEN env. export LARK_USER_TOKEN="..."');
  const headers = { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json; charset=utf-8' };

  const calendarsResp = await api('https://open.larksuite.com/open-apis/calendar/v4/calendars', { headers });
  const calendars = calendarsResp.data?.calendar_list || calendarsResp.data?.items || [];
  const target = calendars.find(c => (c.summary || c.name || '').trim() === TARGET_CALENDAR_NAME);
  if (!target) throw new Error(`Target calendar not found: ${TARGET_CALENDAR_NAME}`);
  const calendarId = target.calendar_id || target.id;

  let eventsPageToken = '';
  const existingEvents = [];
  do {
    const url = new URL(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('page_size', '500');
    if (eventsPageToken) url.searchParams.set('page_token', eventsPageToken);
    const resp = await api(url.toString(), { headers });
    existingEvents.push(...(resp.data?.items || []));
    eventsPageToken = resp.data?.page_token || '';
    if (!resp.data?.has_more) break;
  } while (eventsPageToken);
  const existingBySyncId = new Map();
  for (const ev of existingEvents) {
    const desc = ev.description || '';
    const m = desc.match(/OpenClaw Sync ID:\s*(larkbase-[A-Za-z0-9]+)/);
    if (m) existingBySyncId.set(m[1], ev);
  }

  // fetch bitable records
  let pageToken = ''; const records = [];
  do {
    const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`);
    url.searchParams.set('page_size', '500');
    url.searchParams.set('view_id', VIEW_ID);
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const resp = await api(url.toString(), { headers });
    records.push(...(resp.data?.items || []));
    pageToken = resp.data?.page_token || '';
    if (!resp.data?.has_more) break;
  } while (pageToken);

  const candidates = records.map(r => ({ recordId: r.record_id, fields: r.fields || {} })).filter(r => r.fields['施工时间'] && r.fields['客户地址']).slice(0, LIMIT);
  const results = [];
  for (const c of candidates) {
    const syncId = `larkbase-${c.recordId}`;
    const payload = mapToCalendarPayload(c.recordId, c.fields);
    const location = String(c.fields['客户地址'] || '').trim();
    if (!payload.summary || !payload.start_time || !location) continue;
    const existing = existingBySyncId.get(syncId);
    if (!DRY_RUN) {
      if (existing?.event_id) {
        const updated = await api(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing.event_id)}`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
        results.push({ recordId: c.recordId, title: payload.summary, location, eventId: existing.event_id, action: 'updated', status: updated.msg || 'success' });
      } else {
        const created = await api(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', headers, body: JSON.stringify(payload) });
        results.push({ recordId: c.recordId, title: payload.summary, location, eventId: created.data?.event?.event_id || created.data?.event_id || null, action: 'created' });
      }
    } else {
      results.push({ recordId: c.recordId, title: payload.summary, location, start_time: payload.start_time, calendar: TARGET_CALENDAR_NAME, action: existing ? 'would-update' : 'would-create' });
    }
  }

  const out = path.resolve(process.cwd(), 'output', 'lark_calendar_sync_user_preview.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ dryRun: DRY_RUN, calendar: TARGET_CALENDAR_NAME, count: results.length, results }, null, 2) + '\n');
  console.log(JSON.stringify({ dryRun: DRY_RUN, calendar: TARGET_CALENDAR_NAME, count: results.length, sample: results.slice(0, 5) }, null, 2));
}

main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
