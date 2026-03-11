#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';
import { DEFAULT_OP_ITEM, env, getCredentials, getRuntimePath } from './evhome_credentials.js';

const EVHOME_URL = 'https://apply.evhome.sce.com/';
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'output', 'evhome_all_projects.json');

function ensureDir(filePath) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); }
function chromeExecutable() {
  return env('CHROME_EXECUTABLE_PATH', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
}
async function connectBrowser() {
  const cdpUrl = env('OPENCLAW_CDP_URL', 'http://127.0.0.1:18800');
  try {
    return await chromium.connectOverCDP(cdpUrl);
  } catch {
    return await chromium.launch({
      headless: false,
      executablePath: chromeExecutable()
    });
  }
}
async function gotoWithRetry(page, url, options = {}, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded', ...options });
      return;
    } catch (error) {
      lastError = error;
      if (i < attempts) await page.waitForTimeout(2000 * i);
    }
  }
  throw lastError;
}
async function waitForDashboard(page) {
  const markers = [
    page.getByRole('heading', { name: /my dashboard/i }).first(),
    page.getByText(/search applications/i).first(),
    page.locator('table thead th').filter({ hasText: /application id/i }).first()
  ];
  for (const m of markers) { try { await m.waitFor({ timeout: 10000 }); return true; } catch {} }
  return false;
}
async function loginIfNeeded(page, getCredentials) {
  await gotoWithRetry(page, EVHOME_URL);
  await page.waitForTimeout(2000);
  if (await waitForDashboard(page)) {
    return { loggedIn: true, usedCredentials: false, item: null, credentialSource: 'session' };
  }
  const { item, username, password, source } = getCredentials();
  let emailInput = page.getByLabel(/email address/i).first();
  if (!(await emailInput.count())) emailInput = page.locator('label:has-text("Email Address")').locator('..').locator('input').first();
  let passwordInput = page.getByLabel(/^password$/i).first();
  if (!(await passwordInput.count())) passwordInput = page.locator('input[type="password"]').first();
  await emailInput.fill(username);
  await passwordInput.fill(password);
  await page.getByRole('button', { name: /log ?in/i }).first().click();
  await page.waitForTimeout(6000);
  if (!(await waitForDashboard(page))) throw new Error('Dashboard did not appear after login');
  return { loggedIn: true, usedCredentials: true, item, credentialSource: source };
}
async function findDashboardTable(page) {
  const table = page.locator('table').filter({ has: page.locator('thead th', { hasText: /application id/i }) }).first();
  await table.waitFor({ timeout: 15000 });
  return table;
}
async function extractRowsFromCurrentPage(page) {
  const table = await findDashboardTable(page);
  const headers = (await table.locator('thead th').allInnerTexts()).map(h => h.replace(/\s+/g, ' ').trim());
  const rows = table.locator('tbody tr');
  const count = await rows.count();
  const out = [];
  for (let i = 0; i < count; i++) {
    const cells = (await rows.nth(i).locator('td').allInnerTexts()).map(v => v.replace(/\s+/g, ' ').trim());
    const record = Object.fromEntries(headers.map((h, idx) => [h, cells[idx] ?? '']));
    out.push({
      applicationId: record['Application ID'] || '',
      claimDate: record['Claim Date'] || '',
      submittedDate: record['Submitted Date'] || '',
      installationSite: record['Installation Site Address'] || record['Installation Site'] || '',
      employeeName: record['Employee Name'] || '',
      rebateAmount: record['Rebate Amount'] || '',
      status: record['Application Status'] || record['Status'] || '',
      dueDate: record['Due Date'] || ''
    });
  }
  return out;
}
async function getPageNumber(page) {
  const text = await page.locator('body').innerText();
  const m = text.match(/\bPage\s+(\d+)\b/);
  return m ? Number(m[1]) : null;
}
async function goToNextPage(page, previousPageNumber) {
  const nextControl = page.locator('div[id^="rightIconDiv"]').first();
  if (!(await nextControl.count())) return false;
  const beforeFirstId = ((await extractRowsFromCurrentPage(page))[0] || {}).applicationId || '';
  await nextControl.click();
  await page.waitForTimeout(2500);
  for (let i = 0; i < 10; i++) {
    const pageNumber = await getPageNumber(page);
    const afterFirstId = ((await extractRowsFromCurrentPage(page))[0] || {}).applicationId || '';
    if ((pageNumber && previousPageNumber && pageNumber > previousPageNumber) || (afterFirstId && afterFirstId !== beforeFirstId)) return true;
    await page.waitForTimeout(800);
  }
  return false;
}
async function extractAllRows(page) {
  const seen = new Set();
  const results = [];
  for (let guard = 0; guard < 50; guard++) {
    const rows = await extractRowsFromCurrentPage(page);
    const firstId = (rows[0] || {}).applicationId || `page-${guard}`;
    if (seen.has(firstId)) break;
    seen.add(firstId);
    results.push(...rows);
    const moved = await goToNextPage(page, await getPageNumber(page));
    if (!moved) break;
  }
  return results;
}
async function main() {
  const output = path.resolve(env('EVHOME_OUTPUT', DEFAULT_OUTPUT));
  ensureDir(output);
  let browser;
  let page;
  try {
    browser = await connectBrowser();
    const context = browser.contexts()[0] || await browser.newContext();
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);
    const loginState = await loginIfNeeded(page, getCredentials);
    const projects = await extractAllRows(page);
    const payload = {
      generatedAt: new Date().toISOString(),
      source: EVHOME_URL,
      credentialSource: loginState.credentialSource || 'session',
      runtimeFile: getRuntimePath(),
      opItem: loginState.item || env('EVHOME_OP_ITEM', DEFAULT_OP_ITEM),
      usedCredentials: !!loginState.usedCredentials,
      count: projects.length,
      projects
    };
    fs.writeFileSync(output, JSON.stringify(payload, null, 2) + '\n');
    console.log(`Saved ${projects.length} total project(s) to ${output}`);
  } catch (error) {
    if (page) {
      const debugDir = path.resolve(process.cwd(), 'output', 'debug');
      fs.mkdirSync(debugDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      try { await page.screenshot({ path: path.join(debugDir, `evhome-export-failure-${stamp}.png`), fullPage: true }); } catch {}
      try { fs.writeFileSync(path.join(debugDir, `evhome-export-failure-${stamp}.html`), await page.content()); } catch {}
    }
    throw error;
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}
main().catch(error => { console.error(error?.stack || String(error)); process.exitCode = 1; });
