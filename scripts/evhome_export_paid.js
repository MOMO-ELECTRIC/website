#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const EVHOME_URL = 'https://apply.evhome.sce.com/';
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'output', 'evhome_paid_projects.json');
const DEFAULT_DEBUG_DIR = path.resolve(process.cwd(), 'output', 'debug');

function env(name, fallback = undefined) {
  return process.env[name] ?? fallback;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function ensureFolder(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getOnePasswordField(item, field) {
  return execFileSync('op', ['item', 'get', item, `--fields=${field}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function getCredentials() {
  const item = env('EVHOME_OP_ITEM', 'evhome / SCE program');
  const usernameField = env('EVHOME_OP_USERNAME_FIELD', 'username');
  const passwordField = env('EVHOME_OP_PASSWORD_FIELD', 'password');
  const username = env('EVHOME_USERNAME') || getOnePasswordField(item, usernameField);
  const password = env('EVHOME_PASSWORD') || getOnePasswordField(item, passwordField);
  return { item, username, password };
}

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

async function saveDebugArtifacts(page, label) {
  const debugDir = path.resolve(env('EVHOME_DEBUG_DIR', DEFAULT_DEBUG_DIR));
  ensureFolder(debugDir);
  const safeLabel = label.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
  const screenshotPath = path.join(debugDir, `${safeLabel}.png`);
  const htmlPath = path.join(debugDir, `${safeLabel}.html`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(htmlPath, await page.content(), 'utf8');
  return { screenshotPath, htmlPath };
}

async function waitForDashboard(page) {
  const dashboardMarkers = [
    page.getByRole('heading', { name: /my dashboard/i }),
    page.getByText(/search applications/i),
    page.getByRole('button', { name: /new application/i }),
    page.locator('table thead th').filter({ hasText: /application id/i })
  ];

  for (const marker of dashboardMarkers) {
    try {
      await marker.first().waitFor({ timeout: 10000 });
      return true;
    } catch {
      // try next marker
    }
  }
  return false;
}

async function getVisibleTextSnippet(page) {
  const bodyText = await page.locator('body').innerText().catch(() => '');
  return bodyText.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

async function findDashboardTable(page) {
  const table = page.locator('table').filter({ has: page.locator('thead th', { hasText: /application id/i }) }).first();
  await table.waitFor({ timeout: 15000 });
  return table;
}

async function extractPaidRows(page) {
  const table = await findDashboardTable(page);
  const headers = (await table.locator('thead th').allInnerTexts()).map((h) => h.replace(/\s+/g, ' ').trim());
  const rows = table.locator('tbody tr');
  const count = await rows.count();
  const results = [];

  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const cells = (await row.locator('td').allInnerTexts()).map((v) => v.replace(/\s+/g, ' ').trim());
    const record = Object.fromEntries(headers.map((h, idx) => [h, cells[idx] ?? '']));
    const status = record['Application Status'] || record['Status'] || '';
    if (/^paid$/i.test(status)) {
      results.push({
        applicationId: record['Application ID'] || '',
        claimDate: record['Claim Date'] || '',
        submittedDate: record['Submitted Date'] || '',
        installationSite: record['Installation Site'] || '',
        employeeName: record['Employee Name'] || '',
        rebateAmount: record['Rebate Amount'] || '',
        status,
        dueDate: record['Due Date'] || ''
      });
    }
  }

  return results;
}

async function loginIfNeeded(page, username, password) {
  await page.goto(EVHOME_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  if (await emailInput.count()) {
    await emailInput.fill(username);
    await passwordInput.fill(password);

    const loginButton = page.getByRole('button', { name: /log ?in/i }).first();
    if (await loginButton.count()) {
      await Promise.allSettled([
        page.waitForLoadState('networkidle', { timeout: 20000 }),
        loginButton.click()
      ]);
    }
  }

  if (!(await waitForDashboard(page))) {
    const title = await page.title().catch(() => '');
    const url = page.url();
    const snippet = await getVisibleTextSnippet(page);
    const debug = await saveDebugArtifacts(page, 'after-login-not-dashboard');
    throw new Error(
      [
        'Dashboard did not appear after login.',
        `URL: ${url}`,
        `Title: ${title}`,
        `Visible text: ${snippet}`,
        `Screenshot: ${debug.screenshotPath}`,
        `HTML: ${debug.htmlPath}`
      ].join('\n')
    );
  }
}

async function main() {
  const output = path.resolve(env('EVHOME_OUTPUT', DEFAULT_OUTPUT));
  ensureDir(output);

  const { item, username, password } = getCredentials();
  const browser = await connectBrowser();
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();

  await loginIfNeeded(page, username, password);
  const paidProjects = await extractPaidRows(page);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: EVHOME_URL,
    opItem: item,
    count: paidProjects.length,
    paidProjects
  };

  fs.writeFileSync(output, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Saved ${paidProjects.length} paid project(s) to ${output}`);

  if (env('EVHOME_CLOSE_BROWSER', 'false') === 'true') {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
