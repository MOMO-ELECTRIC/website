#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const INPUT = process.env.INPUT || path.resolve(process.cwd(), 'output', 'evhome_draft_candidates.json');
const OUTPUT = process.env.OUTPUT || path.resolve(process.cwd(), 'output', 'evhome_batch_start_claims.json');
const DASHBOARD_URL = 'https://apply.evhome.sce.com/s/';
const CDP_URL = process.env.OPENCLAW_CDP_URL || 'http://127.0.0.1:18800';

function norm(s = '') {
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureDashboard(page) {
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByText(/search applications/i).first().waitFor({ timeout: 15000 });
}

async function ensureNewCustomerModal(page) {
  const heading = page.getByText(/new customer/i).first();
  if (await heading.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: /new application/i }).first().click();
  await heading.waitFor({ timeout: 10000 });
}

async function closeModal(page) {
  const cancel = page.getByRole('button', { name: /^cancel$/i }).first();
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
    await page.waitForTimeout(800);
  }
}

async function verifyPrequal(page, prequal) {
  await ensureNewCustomerModal(page);
  const field = page.locator('input[type="text"], input:not([type])').last();
  await field.fill('');
  await field.fill(prequal);
  await page.getByRole('button', { name: /^verify$/i }).click();
  await page.waitForTimeout(2500);
  const body = await page.locator('body').innerText();
  const start = page.getByRole('button', { name: /start application/i }).first();
  const startEnabled = await start.isVisible().catch(() => false) && !(await start.isDisabled().catch(() => true));
  if (/already been claimed and is no longer eligible/i.test(body)) {
    return { status: 'already-claimed', message: 'already claimed', startEnabled };
  }
  if (/eligible/i.test(body) && /qualified to receive/i.test(body)) {
    return { status: 'eligible', message: 'eligible', startEnabled };
  }
  if (startEnabled) {
    return { status: 'eligible', message: 'start enabled', startEnabled };
  }
  return { status: 'unknown', message: '', startEnabled };
}

async function acceptTermsAndSaveExit(page) {
  const checkbox = page.locator('input[type="checkbox"]').first();
  if (await checkbox.count()) {
    try { await checkbox.check(); } catch { await checkbox.click(); }
  } else {
    const text = page.getByText(/I have read and accept/i).first();
    if (await text.isVisible().catch(() => false)) await text.click().catch(() => {});
  }
  await page.getByRole('button', { name: /save and continue/i }).click();
  await page.waitForURL(/\/requireddocument\?appid=/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /save and exit/i }).click();
  await page.waitForURL(DASHBOARD_URL, { timeout: 15000 });
  await page.waitForTimeout(2500);
}

async function findApplicationIdByAddress(page, address) {
  const search = page.locator('input').filter({ hasNot: page.locator('[type="button"]') }).first();
  await search.fill('');
  await search.fill(address);
  await page.getByRole('button', { name: /^search$/i }).click();
  await page.waitForTimeout(3000);
  const row = page.locator('table tbody tr').first();
  if (!(await row.count())) return null;
  const cells = row.locator('td');
  const appId = (await cells.nth(0).innerText()).trim();
  const rowAddress = (await cells.nth(3).innerText()).trim();
  const status = (await cells.nth(6).innerText()).trim();
  return { applicationId: appId, rowAddress, status };
}

async function main() {
  if (!fs.existsSync(INPUT)) throw new Error(`Missing input file: ${INPUT}`);
  const input = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const candidates = input.records || input;
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages().find(p => p.url().startsWith(DASHBOARD_URL)) || context.pages()[0] || await context.newPage();
  await page.bringToFront();
  await ensureDashboard(page);

  const results = [];
  for (const item of candidates) {
    const result = {
      recordId: item.id || item.recordId,
      prequalId: item.prequal || item.prequalId || item.reviewed,
      address: item.address || '',
      initialMatch: item.initialMatch || null,
      verify: null,
      applicationId: item.initialMatch?.applicationId || null,
      finalStatus: null,
      error: null
    };
    try {
      if (item.initialMatch?.applicationId) {
        result.finalStatus = 'matched-existing';
        results.push(result);
        continue;
      }
      const verify = await verifyPrequal(page, result.prequalId);
      result.verify = verify;
      if (verify.status === 'already-claimed') {
        result.finalStatus = 'already-claimed';
        await closeModal(page);
        results.push(result);
        continue;
      }
      if (verify.status !== 'eligible') {
        result.finalStatus = verify.status;
        await closeModal(page);
        results.push(result);
        continue;
      }
      await page.getByRole('button', { name: /start application/i }).click();
      await page.waitForURL(/\/termsandconditions\?appid=/, { timeout: 15000 });
      await acceptTermsAndSaveExit(page);
      const match = await findApplicationIdByAddress(page, result.address);
      if (match?.applicationId && norm(match.rowAddress).includes(norm(result.address).slice(0, Math.max(10, Math.floor(norm(result.address).length * 0.6))))) {
        result.applicationId = match.applicationId;
        result.finalStatus = `created:${match.status || 'Started'}`;
      } else if (match?.applicationId) {
        result.applicationId = match.applicationId;
        result.finalStatus = `created:address-mismatch:${match.status || ''}`;
      } else {
        result.finalStatus = 'created:unconfirmed';
      }
      await ensureDashboard(page);
      results.push(result);
      console.error(`${result.recordId} => ${result.applicationId || 'no-app-id'} ${result.finalStatus}`);
    } catch (error) {
      result.error = String(error?.message || error);
      result.finalStatus = 'error';
      results.push(result);
      console.error(`${result.recordId} ERROR ${result.error}`);
      try { await ensureDashboard(page); } catch {}
    }
  }

  const out = { generatedAt: new Date().toISOString(), count: results.length, results };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
