#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const EVHOME_URL = 'https://apply.evhome.sce.com/';
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'output', 'evhome_all_projects.json');

function env(name, fallback = undefined) { return process.env[name] ?? fallback; }
function ensureDir(filePath) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); }
function getOnePasswordField(item, field) {
  return execFileSync('op', ['item', 'get', item, `--fields=${field}`, '--reveal'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function getCredentials() {
  const item = env('EVHOME_OP_ITEM', 'apply.evhome.sce.com (apply@momoelec.com)');
  const username = env('EVHOME_USERNAME') || getOnePasswordField(item, env('EVHOME_OP_USERNAME_FIELD', 'username'));
  const password = env('EVHOME_PASSWORD') || getOnePasswordField(item, env('EVHOME_OP_PASSWORD_FIELD', 'password'));
  return { item, username, password };
}
async function connectBrowser() {
  const cdpUrl = env('OPENCLAW_CDP_URL', 'http://127.0.0.1:18800');
  return chromium.connectOverCDP(cdpUrl);
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
async function loginIfNeeded(page, username, password) {
  await page.goto(EVHOME_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  if (await waitForDashboard(page)) return;
  let emailInput = page.getByLabel(/email address/i).first();
  if (!(await emailInput.count())) emailInput = page.locator('label:has-text("Email Address")').locator('..').locator('input').first();
  let passwordInput = page.getByLabel(/^password$/i).first();
  if (!(await passwordInput.count())) passwordInput = page.locator('input[type="password"]').first();
  await emailInput.fill(username);
  await passwordInput.fill(password);
  await page.getByRole('button', { name: /log ?in/i }).first().click();
  await page.waitForTimeout(6000);
  if (!(await waitForDashboard(page))) throw new Error('Dashboard did not appear after login');
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
  const { item, username, password } = getCredentials();
  const browser = await connectBrowser();
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();
  await loginIfNeeded(page, username, password);
  const projects = await extractAllRows(page);
  const payload = { generatedAt: new Date().toISOString(), source: EVHOME_URL, opItem: item, count: projects.length, projects };
  fs.writeFileSync(output, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Saved ${projects.length} total project(s) to ${output}`);
}
main().catch(error => { console.error(error?.stack || String(error)); process.exitCode = 1; });
