#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'N2TkbWZkvaVwqAsu4TRjeV61pTf';
const TABLE_ID = process.env.LARK_BASE_TABLE_ID || 'tblLpRmOpsOceWSA';
const VIEW_ID = process.env.LARK_BASE_VIEW_ID || 'vew7oDkEXl';
const ITEM = process.env.LARK_OP_ITEM || 'LARK API';
const EVHOME_JSON = process.env.EVHOME_JSON || path.resolve(process.cwd(), 'output', 'evhome_paid_projects.json');
const OUTPUT = process.env.LARK_MATCH_OUTPUT || path.resolve(process.cwd(), 'output', 'lark_paid_matches.json');

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

function normalizeAddress(input) {
  const raw = String(input || '').toUpperCase();
  const noPunct = raw.replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim();
  const replacements = new Map([
    [' STREET ', ' ST '], [' ST. ', ' ST '], [' AVENUE ', ' AVE '], [' DRIVE ', ' DR '],
    [' PLACE ', ' PL '], [' COURT ', ' CT '], [' ROAD ', ' RD '], [' BOULEVARD ', ' BLVD '],
    [' LANE ', ' LN '], [' TERRACE ', ' TER '], [' CIRCLE ', ' CIR '], [' PARKWAY ', ' PKWY '],
    [' MOUNT ', ' MT '], [' NORTH ', ' N '], [' SOUTH ', ' S '], [' EAST ', ' E '], [' WEST ', ' W '],
    [' APARTMENT ', ' APT '], [' CALIFORNIA ', ' CA ']
  ]);
  let s = ` ${noPunct} `;
  for (const [a,b] of replacements) s = s.replaceAll(a,b);
  s = s.replace(/\bLA PUETE\b/g, 'LA PUENTE');
  s = s.replace(/\bSOUTH EL MONTE\b/g, 'S EL MONTE');
  s = s.replace(/\bRANCHO CUCAMONGA\b/g, 'RANCHO CUCAMONGA');
  s = s.replace(/\bWEST COVINA\b/g, 'W COVINA');
  s = s.replace(/\bROWLAND HEIGHTS\b/g, 'ROWLAND HTS');
  s = s.replace(/\bCHINO HILLS\b/g, 'CHINO HILLS');
  s = s.replace(/\bHACIENDA HEIGHTS\b/g, 'HACIENDA HTS');
  s = s.replace(/\s+/g, ' ').trim();
  const parts = s.split(' ');
  const houseNumber = parts.find(x => /^\d+[A-Z-]*$/.test(x)) || '';
  const zip = parts.find(x => /^9\d{4}$/.test(x)) || '';
  const cityHints = ['W COVINA','POMONA','WALNUT','FONTANA','DIAMOND BAR','HACIENDA HTS','CHINO HILLS','ONTARIO','ROWLAND HTS','PLACENTIA','GLENDORA','MISSION VIEJO','IRVINE','S EL MONTE','ROSEMEAD','RANCHO CUCAMONGA','SANTA ANA','LADERA RANCH','HAWTHORNE','HUNTINGTON BEACH','COVINA'];
  const city = cityHints.find(c => s.includes(c)) || '';
  const street = s
    .replace(new RegExp(`^${houseNumber.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*`), '')
    .replace(/\bCA\b/g, '')
    .replace(/\b9\d{4}\b/g, '')
    .replace(city, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { raw: input || '', normalized: s, houseNumber, city, zip, street };
}

function score(ev, lk) {
  if (!ev.houseNumber || !lk.houseNumber) return 0;
  if (ev.houseNumber !== lk.houseNumber) return 0;
  let score = 50;
  if (ev.city && lk.city && ev.city === lk.city) score += 20;
  if (ev.street && lk.street) {
    if (ev.street === lk.street) score += 30;
    else {
      const evTokens = new Set(ev.street.split(' '));
      const lkTokens = new Set(lk.street.split(' '));
      let overlap = 0;
      for (const t of evTokens) if (lkTokens.has(t)) overlap += 1;
      score += Math.min(25, overlap * 5);
    }
  }
  return Math.min(100, score);
}

async function main() {
  const appId = getField('username');
  const appSecret = getField('credential');
  const evhome = JSON.parse(fs.readFileSync(EVHOME_JSON, 'utf8')).paidProjects || [];

  const tokenResp = await api('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const tenantToken = tokenResp.tenant_access_token;

  let pageToken = '';
  const larkRecords = [];
  do {
    const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`);
    url.searchParams.set('page_size', '500');
    url.searchParams.set('view_id', VIEW_ID);
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const resp = await api(url.toString(), { headers: { Authorization: `Bearer ${tenantToken}` } });
    larkRecords.push(...(resp.data?.items || []));
    pageToken = resp.data?.page_token || '';
    if (!resp.data?.has_more) break;
  } while (pageToken);

  const indexed = larkRecords.map(r => ({
    recordId: r.record_id,
    customerName: r.fields['客户姓名'] || '',
    progress: r.fields['客户进度'] || '',
    customerId: r.fields['客户编号'] || '',
    subsidyId: r.fields['补贴申请号'] || '',
    address: r.fields['客户地址'] || '',
    norm: normalizeAddress(r.fields['客户地址'] || '')
  })).filter(r => r.address);

  const matches = evhome.map(ev => {
    const evNorm = normalizeAddress(ev.installationSite);
    const candidates = indexed
      .map(lk => ({ ...lk, score: score(evNorm, lk.norm) }))
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score)
      .slice(0,3);
    const best = candidates[0] || null;
    const status = !best ? 'unmatched' : best.score >= 95 ? 'high' : best.score >= 75 ? 'possible' : 'weak';
    return {
      applicationId: ev.applicationId,
      evhomeAddress: ev.installationSite,
      matchStatus: status,
      bestMatch: best ? {
        recordId: best.recordId,
        larkAddress: best.address,
        customerName: best.customerName,
        customerId: best.customerId,
        progress: best.progress,
        score: best.score
      } : null,
      candidates: candidates.map(c => ({
        recordId: c.recordId,
        larkAddress: c.address,
        customerName: c.customerName,
        progress: c.progress,
        score: c.score
      }))
    };
  });

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), totalEvhomePaid: evhome.length, totalLarkRecords: indexed.length, matches }, null, 2) + '\n');
  console.log(`Saved match preview to ${OUTPUT}`);
  console.log(JSON.stringify(matches.map(m => ({ applicationId: m.applicationId, evhomeAddress: m.evhomeAddress, matchStatus: m.matchStatus, bestLarkAddress: m.bestMatch?.larkAddress || '', score: m.bestMatch?.score || 0 })), null, 2));
}

main().catch(err => { console.error(err.stack || String(err)); process.exit(1); });
