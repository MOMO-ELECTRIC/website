#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const VIEW_ID = process.env.LARK_BASE_VIEW_ID || 'vew7oDkEXl';
const ITEM = process.env.LARK_OP_ITEM || 'LARK API';
const EVHOME_JSON = process.env.EVHOME_JSON || path.resolve(process.cwd(), 'output', 'evhome_all_projects.json');
const OUTPUT = process.env.LARK_MATCH_OUTPUT || path.resolve(process.cwd(), 'output', 'lark_all_matches.json');

function getField(field) { return execFileSync('op', ['item', 'get', ITEM, `--fields=${field}`, '--reveal'], { encoding: 'utf8' }).trim(); }
async function api(url, options = {}) { const res = await fetch(url, options); const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text }; } if (!res.ok || data.code) throw new Error(`HTTP ${res.status} :: ${JSON.stringify(data)}`); return data; }
function normalizeAddress(input) {
  const raw = String(input || '').toUpperCase();
  let s = ` ${raw.replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  for (const [a,b] of [[' STREET ',' ST '],[' ST. ',' ST '],[' AVENUE ',' AVE '],[' DRIVE ',' DR '],[' PLACE ',' PL '],[' COURT ',' CT '],[' ROAD ',' RD '],[' BOULEVARD ',' BLVD '],[' LANE ',' LN '],[' TERRACE ',' TER '],[' CIRCLE ',' CIR '],[' PARKWAY ',' PKWY '],[' NORTH ',' N '],[' SOUTH ',' S '],[' EAST ',' E '],[' WEST ',' W '],[' CALIFORNIA ',' CA ']]) s = s.replaceAll(a,b);
  s = s.replace(/\bLA PUETE\b/g, 'LA PUENTE').replace(/\bWEST COVINA\b/g, 'W COVINA').replace(/\bROWLAND HEIGHTS\b/g, 'ROWLAND HTS').replace(/\bHACIENDA HEIGHTS\b/g, 'HACIENDA HTS').replace(/\s+/g, ' ').trim();
  const parts = s.split(' '); const houseNumber = parts.find(x => /^\d+[A-Z-]*$/.test(x)) || ''; const zip = parts.find(x => /^9\d{4}$/.test(x)) || '';
  const cityHints = ['W COVINA','POMONA','WALNUT','FONTANA','DIAMOND BAR','HACIENDA HTS','CHINO HILLS','ONTARIO','ROWLAND HTS','PLACENTIA','GLENDORA','MISSION VIEJO','IRVINE','S EL MONTE','ROSEMEAD','RANCHO CUCAMONGA','SANTA ANA','LADERA RANCH','HAWTHORNE','HUNTINGTON BEACH','COVINA'];
  const city = cityHints.find(c => s.includes(c)) || '';
  const street = s.replace(new RegExp(`^${houseNumber.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*`), '').replace(/\bCA\b/g, '').replace(/\b9\d{4}\b/g, '').replace(city, '').replace(/\s+/g, ' ').trim();
  return { raw: input || '', normalized: s, houseNumber, city, zip, street };
}
function score(ev, lk) { if (!ev.houseNumber || !lk.houseNumber) return 0; if (ev.houseNumber !== lk.houseNumber) return 0; let score = 50; if (ev.city && lk.city && ev.city === lk.city) score += 20; if (ev.street && lk.street) { if (ev.street === lk.street) score += 30; else { const evTokens = new Set(ev.street.split(' ')); const lkTokens = new Set(lk.street.split(' ')); let overlap = 0; for (const t of evTokens) if (lkTokens.has(t)) overlap += 1; score += Math.min(25, overlap * 5); } } return Math.min(100, score); }
function mapStatus(status) { const s = String(status || '').trim().toLowerCase(); if (s === 'paid') return '已付款'; if (s === 'submitted') return '已上传'; if (s === 'approved') return '已批准'; return status || ''; }
async function main() {
  const appId = process.env.LARK_APP_ID || getField('username');
  const appSecret = process.env.LARK_APP_SECRET || getField('credential');
  const evhome = JSON.parse(fs.readFileSync(EVHOME_JSON, 'utf8')).projects || [];
  const tokenResp = await api('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ app_id: appId, app_secret: appSecret }) });
  const tenantToken = tokenResp.tenant_access_token;
  let pageToken = ''; const larkRecords = [];
  do {
    const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`); url.searchParams.set('page_size', '500'); url.searchParams.set('view_id', VIEW_ID); if (pageToken) url.searchParams.set('page_token', pageToken);
    const resp = await api(url.toString(), { headers: { Authorization: `Bearer ${tenantToken}` } }); larkRecords.push(...(resp.data?.items || [])); pageToken = resp.data?.page_token || ''; if (!resp.data?.has_more) break;
  } while (pageToken);
  const indexed = larkRecords.map(r => ({ recordId: r.record_id, address: r.fields['客户地址'] || '', norm: normalizeAddress(r.fields['客户地址'] || '') })).filter(r => r.address);
  const matches = evhome.map(ev => {
    const evNorm = normalizeAddress(ev.installationSite);
    const candidates = indexed.map(lk => ({ ...lk, score: score(evNorm, lk.norm) })).filter(x => x.score > 0).sort((a,b)=>b.score-a.score).slice(0,3);
    const best = candidates[0] || null; const matchStatus = !best ? 'unmatched' : best.score >= 95 ? 'high' : best.score >= 75 ? 'possible' : 'weak';
    return { applicationId: ev.applicationId, evhomeAddress: ev.installationSite, evhomeStatus: ev.status, evhomeStatusZh: mapStatus(ev.status), matchStatus, bestMatch: best ? { recordId: best.recordId, larkAddress: best.address, score: best.score } : null, candidates };
  });
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true }); fs.writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), totalEvhome: evhome.length, totalLarkRecords: indexed.length, matches }, null, 2) + '\n');
  console.log(`Saved all-project match preview to ${OUTPUT}`);
  console.log(JSON.stringify(matches.map(m => ({ applicationId: m.applicationId, evhomeStatus: m.evhomeStatus, evhomeAddress: m.evhomeAddress, matchStatus: m.matchStatus, bestLarkAddress: m.bestMatch?.larkAddress || '', score: m.bestMatch?.score || 0 })), null, 2));
}
main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
