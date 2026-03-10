#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const RUNTIME = path.resolve(process.cwd(), 'secret', 'lark_oauth_runtime.json');
const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const VIEW_ID = process.env.LARK_BASE_VIEW_ID || '';
const ATTACH_FIELD = process.env.LARK_PREQUAL_SCREENSHOT_FIELD || '补贴获批邮件截图';
const OCR_FIELD = process.env.LARK_OCR_FIELD || 'EVHOME_PREQUAL_ID_OCR';
const ADDRESS_FIELD = process.env.LARK_ADDRESS_FIELD || '客户地址';
const CRH_FIELD = process.env.LARK_CRH_FIELD || 'CRH_NO';
const SAMPLE_DIR = path.resolve(process.cwd(), 'output', 'ocr_audit_samples');
const JSON_OUT = path.resolve(process.cwd(), 'output', 'lark_prequal_ocr_audit.json');
const MD_OUT = path.resolve(process.cwd(), 'output', 'lark_prequal_ocr_audit.md');

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

function normalizeText(text = '') {
  return String(text).replace(/\r/g, '\n');
}

function compact(text = '', max = 260) {
  const one = normalizeText(text).replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function extractCrh(text = '') {
  const m = normalizeText(text).match(/CRH[-\s]?0?(\d{4,6})/i);
  return m ? `CRH-${m[1].padStart(6, '0')}` : null;
}

function findExplicitId(text = '') {
  const normalized = normalizeText(text);
  const m = normalized.match(/Your\s+Prequalification\s+ID\s+is\s*:?[\s\n]*([A-Z0-9]{10,20})/i);
  return m ? m[1].toUpperCase() : null;
}

function detectType(text = '') {
  const t = normalizeText(text);
  const lower = t.toLowerCase();
  if (/your\s+prequalification\s+id\s+is/i.test(t) || /prequalification application approved/i.test(lower) || /have been pre-qualified/i.test(lower)) {
    return 'prequal_email';
  }
  if (/my dashboard/i.test(lower) || /application status/i.test(lower) || /application id/i.test(lower) || /showing 1 - 1 of 1 results/i.test(lower)) {
    return 'portal_screenshot';
  }
  if (/while reviewing the supporting documents/i.test(lower) || /missing information/i.test(lower) || /resubmitted/i.test(lower)) {
    return 'non_prequal_email';
  }
  return 'unknown';
}

function classifyRecord(record) {
  const reasons = [];
  const ids = record.attachments.filter(a => a.ocrId).map(a => a.ocrId);
  const uniqueIds = [...new Set(ids)];
  const prequalEvidence = record.attachments.filter(a => a.type === 'prequal_email');
  const portalOnly = record.attachments.length > 0 && record.attachments.every(a => a.type === 'portal_screenshot');
  const nonPrequalOnly = record.attachments.length > 0 && record.attachments.every(a => a.type === 'non_prequal_email' || a.type === 'portal_screenshot');
  const explicitMatches = record.attachments.filter(a => a.explicitId && a.ocrId && a.explicitId === a.ocrId);
  const explicitMismatch = record.attachments.filter(a => a.explicitId && a.ocrId && a.explicitId !== a.ocrId);
  const trailingExtra = record.attachments.filter(a => a.ocrId && a.explicitId && a.ocrId.startsWith(a.explicitId) && a.ocrId.length === a.explicitId.length + 1);
  const inferredOnly = record.attachments.filter(a => a.ocrId && !a.explicitId);
  const currentOcr = record.currentOcr || null;

  if (portalOnly) {
    reasons.push('Only EVHOME dashboard screenshot(s); no visible prequalification email/ID text.');
    return { category: 'unusable/non-prequal', reasons, finalId: null };
  }
  if (!uniqueIds.length && nonPrequalOnly) {
    reasons.push('Attachments are resubmission/issue or dashboard screenshots, not prequalification evidence.');
    return { category: 'unusable/non-prequal', reasons, finalId: null };
  }
  if (!uniqueIds.length) {
    reasons.push('No prequalification ID extracted from any attachment.');
    return { category: 'unusable/non-prequal', reasons, finalId: null };
  }
  if (uniqueIds.length > 1) {
    reasons.push(`Multiple different OCR IDs found: ${uniqueIds.join(', ')}.`);
    return { category: 'suspicious', reasons, finalId: explicitMatches[0]?.ocrId || currentOcr || uniqueIds[0] };
  }

  const finalId = explicitMatches[0]?.ocrId || (trailingExtra[0]?.explicitId ?? uniqueIds[0]);

  if (explicitMismatch.length) {
    reasons.push(`OCR/output mismatch on explicit ID line (${explicitMismatch.map(a => `${a.ocrId} vs text ${a.explicitId}`).join('; ')}).`);
    return { category: 'suspicious', reasons, finalId };
  }
  if (trailingExtra.length) {
    reasons.push(`OCR added extra trailing character; explicit text suggests ${finalId}.`);
    return { category: 'suspicious', reasons, finalId };
  }
  if (!prequalEvidence.length) {
    reasons.push('ID was inferred without clear prequalification-email markers.');
    return { category: 'suspicious', reasons, finalId };
  }
  if (!explicitMatches.length) {
    reasons.push('Prequalification email detected, but ID was inferred from general OCR text instead of an exact explicit-ID match.');
    return { category: 'suspicious', reasons, finalId };
  }
  if (currentOcr && currentOcr !== finalId) {
    reasons.push(`Current Lark OCR field differs (${currentOcr} vs reviewed ${finalId}).`);
    return { category: 'suspicious', reasons, finalId };
  }

  reasons.push('Explicit “Your Prequalification ID is …” text matched OCR output.');
  return { category: 'high-confidence', reasons, finalId };
}

function summarizeEvidence(att) {
  const bits = [];
  bits.push(`${att.name} [${att.type}]`);
  if (att.ocrId) bits.push(`ocr=${att.ocrId}`);
  if (att.explicitId) bits.push(`explicit=${att.explicitId}`);
  if (att.crh) bits.push(`crh=${att.crh}`);
  bits.push(`path=${att.localPath}`);
  bits.push(`text="${compact(att.visibleText)}"`);
  return bits.join(' | ');
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# EVHOME Prequalification OCR Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Records with 补贴获批邮件截图 attachments: ${report.summary.total}`);
  lines.push(`- High-confidence: ${report.summary.highConfidence}`);
  lines.push(`- Suspicious: ${report.summary.suspicious}`);
  lines.push(`- Unusable/non-prequal: ${report.summary.unusable}`);
  lines.push('');
  for (const section of ['high-confidence', 'suspicious', 'unusable/non-prequal']) {
    const title = section === 'high-confidence' ? 'High-confidence' : (section === 'suspicious' ? 'Suspicious' : 'Unusable / non-prequal');
    lines.push(`## ${title}`);
    lines.push('');
    const items = report.records.filter(r => r.category === section);
    if (!items.length) {
      lines.push('_None_');
      lines.push('');
      continue;
    }
    for (const r of items) {
      lines.push(`### ${r.recordId} — ${r.address || '(no address)'}`);
      lines.push(`- Reviewed ID: ${r.finalId || '—'}`);
      lines.push(`- Current Lark OCR: ${r.currentOcr || '—'}`);
      lines.push(`- CRH_NO: ${r.crhNo || '—'}`);
      lines.push(`- Reason(s): ${r.reasons.join(' ; ')}`);
      lines.push(`- Evidence:`);
      for (const att of r.attachments) lines.push(`  - ${summarizeEvidence(att)}`);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
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
  const withAttachments = records.filter(r => Array.isArray(r.fields?.[ATTACH_FIELD]) && r.fields[ATTACH_FIELD].length > 0);

  const reviewed = [];
  for (const record of withAttachments) {
    const fields = record.fields || {};
    const attachments = fields[ATTACH_FIELD] || [];
    const evidence = [];
    for (let i = 0; i < attachments.length; i += 1) {
      const attachment = attachments[i];
      const fileToken = attachment.file_token;
      const ext = path.extname(attachment.name || '') || '.jpg';
      const localPath = path.join(SAMPLE_DIR, `${record.record_id}-${i}${ext}`);
      if (!fs.existsSync(localPath)) {
        const mediaRes = await fetch(`https://open.larksuite.com/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download`, { headers: { Authorization: `Bearer ${tenantToken}` } });
        if (!mediaRes.ok) throw new Error(`Download failed ${record.record_id}: ${mediaRes.status}`);
        const buf = Buffer.from(await mediaRes.arrayBuffer());
        fs.writeFileSync(localPath, buf);
      }
      const ocr = runLocalOCR(localPath);
      evidence.push({
        name: attachment.name,
        localPath,
        found: !!ocr.found,
        ocrId: ocr.prequalification_id || null,
        explicitId: findExplicitId(ocr.visible_text || ''),
        crh: extractCrh(ocr.visible_text || ''),
        type: detectType(ocr.visible_text || ''),
        visibleText: ocr.visible_text || ''
      });
    }
    const base = {
      recordId: record.record_id,
      address: fields[ADDRESS_FIELD] || '',
      currentOcr: fields[OCR_FIELD] || '',
      crhNo: fields[CRH_FIELD] || '',
      attachments: evidence
    };
    const classification = classifyRecord(base);
    reviewed.push({ ...base, ...classification });
  }

  reviewed.sort((a, b) => {
    const order = { 'high-confidence': 0, 'suspicious': 1, 'unusable/non-prequal': 2 };
    return order[a.category] - order[b.category] || String(a.address).localeCompare(String(b.address));
  });

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: reviewed.length,
      highConfidence: reviewed.filter(r => r.category === 'high-confidence').length,
      suspicious: reviewed.filter(r => r.category === 'suspicious').length,
      unusable: reviewed.filter(r => r.category === 'unusable/non-prequal').length
    },
    records: reviewed
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(MD_OUT, renderMarkdown(report));
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
