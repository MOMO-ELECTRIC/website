#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const RUNTIME = path.resolve(process.cwd(), 'secret', 'lark_oauth_runtime.json');
const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const VIEW_ID = process.env.LARK_BASE_VIEW_ID || '';
const OCR_FIELD = process.env.LARK_OCR_FIELD || 'EVHOME_PREQUAL_ID_OCR';
const ATTACH_FIELD = process.env.LARK_PREQUAL_SCREENSHOT_FIELD || '补贴获批邮件截图';
const ADDRESS_FIELD = process.env.LARK_ADDRESS_FIELD || '客户地址';
const DRY_RUN = process.env.DRY_RUN !== 'false';
const LIMIT = Number(process.env.LARK_OCR_LIMIT || '0');
const SAMPLE_DIR = path.resolve(process.cwd(), 'output', 'ocr_samples');
const OUTPUT = path.resolve(process.cwd(), 'output', 'lark_ocr_prequal_today.json');

function loadRuntime() {
  return JSON.parse(fs.readFileSync(RUNTIME, 'utf8'));
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.code) throw new Error(`HTTP ${res.status} :: ${JSON.stringify(data)}`);
  return data;
}

function laTodayRangeMs() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const start = new Date(`${dateStr}T00:00:00-08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startMs: start.getTime(), endMs: end.getTime(), dateStr };
}
async function fetchAllRecords(headers) {
  let pageToken = '';
  const records = [];
  do {
    const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`);
    url.searchParams.set('page_size', '500');
    if (VIEW_ID) url.searchParams.set('view_id', VIEW_ID);
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const resp = await api(url.toString(), { headers });
    records.push(...(resp.data?.items || []));
    pageToken = resp.data?.page_token || '';
    if (!resp.data?.has_more) break;
  } while (pageToken);
  return records;
}

function runLocalOCR(imagePath) {
  const out = execFileSync(path.resolve(process.cwd(), 'scripts', 'ocr_prequal.swift'), [imagePath], { encoding: 'utf8' }).trim();
  return JSON.parse(out);
}

async function main() {
  fs.mkdirSync(SAMPLE_DIR, { recursive: true });
  const rt = loadRuntime();
  const tokenResp = await api('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: rt.app_id, app_secret: rt.app_secret })
  });
  const tenantToken = tokenResp.tenant_access_token;
  const headers = { Authorization: `Bearer ${tenantToken}`, 'Content-Type': 'application/json; charset=utf-8' };

  const records = await fetchAllRecords(headers);

  const { dateStr } = laTodayRangeMs();
  const pending = records.filter(r => {
    const f = r.fields || {};
    const att = f[ATTACH_FIELD];
    return Array.isArray(att) && att.length > 0 && !f[OCR_FIELD];
  });
  const candidates = LIMIT > 0 ? pending.slice(0, LIMIT) : pending;

  const results = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const record = candidates[index];
    const fields = record.fields || {};
    const attachments = fields[ATTACH_FIELD] || [];
    let chosen = null;
    const attachmentResults = [];
    let recordError = null;
    try {
      for (let i = 0; i < attachments.length; i += 1) {
        const attachment = attachments[i];
        const fileToken = attachment.file_token;
        const ext = path.extname(attachment.name || '') || '.jpg';
        const localPath = path.join(SAMPLE_DIR, `${record.record_id}-${i}${ext}`);
        const mediaRes = await fetch(`https://open.larksuite.com/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download`, { headers: { Authorization: `Bearer ${tenantToken}` } });
        if (!mediaRes.ok) throw new Error(`Download failed ${record.record_id}: ${mediaRes.status}`);
        const buf = Buffer.from(await mediaRes.arrayBuffer());
        fs.writeFileSync(localPath, buf);
        const ocr = runLocalOCR(localPath);
        const item = {
          name: attachment.name,
          found: ocr.found,
          prequalificationId: ocr.prequalification_id || null,
          visibleText: ocr.visible_text || '',
          localPath
        };
        attachmentResults.push(item);
        if (!chosen && ocr.prequalification_id) chosen = item;
      }
      const updatePayload = { [OCR_FIELD]: chosen?.prequalificationId || '' };
      if (!DRY_RUN && chosen?.prequalificationId) {
        await api(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${record.record_id}`, {
          method: 'PUT', headers, body: JSON.stringify({ fields: updatePayload })
        });
      }
      results.push({
        recordId: record.record_id,
        address: fields[ADDRESS_FIELD] || '',
        date: dateStr,
        attachments: attachmentResults,
        chosenAttachment: chosen?.name || null,
        found: !!chosen,
        prequalificationId: chosen?.prequalificationId || null,
        wroteBack: !DRY_RUN && !!chosen?.prequalificationId,
        error: null
      });
    } catch (error) {
      recordError = error;
      results.push({
        recordId: record.record_id,
        address: fields[ADDRESS_FIELD] || '',
        date: dateStr,
        attachments: attachmentResults,
        chosenAttachment: null,
        found: false,
        prequalificationId: null,
        wroteBack: false,
        error: String(error?.message || error)
      });
    }
    const completed = index + 1;
    const foundCount = results.filter(r => r.found).length;
    const errorCount = results.filter(r => r.error).length;
    fs.writeFileSync(OUTPUT, JSON.stringify({
      dryRun: DRY_RUN,
      startedAt: dateStr,
      totalPending: pending.length,
      attempted: results.length,
      foundCount,
      errorCount,
      remaining: candidates.length - completed,
      results
    }, null, 2) + '\n');
    console.error(`[ocr] ${completed}/${candidates.length} ${record.record_id} found=${!!chosen} error=${recordError ? String(recordError.message || recordError) : 'none'}`);
  }

  fs.writeFileSync(OUTPUT, JSON.stringify({
    dryRun: DRY_RUN,
    startedAt: dateStr,
    totalPending: pending.length,
    attempted: results.length,
    foundCount: results.filter(r => r.found).length,
    errorCount: results.filter(r => r.error).length,
    results
  }, null, 2) + '\n');
  console.log(JSON.stringify({ dryRun: DRY_RUN, totalPending: pending.length, attempted: results.length, foundCount: results.filter(r => r.found).length, errorCount: results.filter(r => r.error).length, sample: results.slice(0, 5) }, null, 2));
}

main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
