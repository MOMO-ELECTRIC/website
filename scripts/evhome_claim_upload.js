#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';
import { getCredentials } from './evhome_credentials.js';

const EVHOME_URL = 'https://apply.evhome.sce.com/';
const PREQUAL_ID = process.env.PREQUAL_ID || process.argv[2];
const PACKAGE_DIR = path.resolve(process.env.PACKAGE_DIR || process.argv[3] || '');
const ACTION = process.env.ACTION || 'upload'; // upload|save-exit|continue
const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS || 3000);

if (!PREQUAL_ID) throw new Error('Missing PREQUAL_ID');
if (!PACKAGE_DIR) throw new Error('Missing PACKAGE_DIR');

const manifestPath = path.join(PACKAGE_DIR, 'manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error(`Missing manifest.json in ${PACKAGE_DIR}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function absList(names = []) {
  return names.map(name => path.join(PACKAGE_DIR, name));
}

async function connectBrowser() {
  const cdpUrl = process.env.OPENCLAW_CDP_URL || 'http://127.0.0.1:18800';
  try {
    return await chromium.connectOverCDP(cdpUrl);
  } catch {
    return await chromium.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    });
  }
}

async function wait(ms, page) { await page.waitForTimeout(ms); }

const SLOT_LABELS = {
  itemizedInvoice: 'Itemized Invoice',
  permit: 'PDF or Photo of Permit',
  pictureOfInstalledCircuitOrPanel: 'Picture of Installed Circuit/Panel'
};

async function waitForDashboard(page) {
  const markers = [
    page.getByText(/search applications/i).first(),
    page.getByRole('button', { name: /new application/i }).first(),
    page.locator('table thead th').filter({ hasText: /application id/i }).first()
  ];
  for (const marker of markers) {
    try {
      await marker.waitFor({ timeout: 10000 });
      return true;
    } catch {}
  }
  return false;
}

async function loginIfNeeded(page) {
  await page.goto(EVHOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(STEP_DELAY_MS, page);
  if (await waitForDashboard(page)) return 'session';
  const { username, password, source } = getCredentials();
  await page.getByLabel(/email address/i).first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /log ?in/i }).first().click();
  await wait(Math.max(STEP_DELAY_MS, 7000), page);
  if (!(await waitForDashboard(page))) {
    throw new Error(`Login failed; current URL=${page.url()}`);
  }
  return source;
}

async function openNewApplication(page) {
  await page.getByRole('button', { name: /new application/i }).first().click();
  await page.getByText(/new customer/i).first().waitFor({ timeout: 15000 });
}

async function verifyPrequalAndStart(page, prequalId) {
  const textInputs = page.locator('input[type="text"], input:not([type])');
  const field = textInputs.last();
  await field.fill('');
  await field.fill(prequalId);
  await page.getByRole('button', { name: /^verify$/i }).first().click();
  await wait(STEP_DELAY_MS, page);
  const body = await page.locator('body').innerText();
  if (/already been claimed and is no longer eligible/i.test(body)) {
    throw new Error(`Prequal ${prequalId} is already claimed`);
  }
  await page.getByRole('button', { name: /start application/i }).first().click();
  await page.waitForURL(/termsandconditions\?appid=/, { timeout: 20000 });
}

async function acceptTerms(page) {
  const checkbox = page.locator('input[type="checkbox"]').first();
  await checkbox.waitFor({ timeout: 15000 });
  await checkbox.check().catch(async () => { await checkbox.click(); });
  await page.getByRole('button', { name: /save and continue/i }).first().click();
  await page.waitForURL(/requireddocument\?appid=/, { timeout: 20000 });
  await wait(STEP_DELAY_MS, page);
}

async function discoverUploadInputs(page) {
  const inputs = await page.locator('input[type="file"]').evaluateAll((nodes, slotLabels) => {
    const labels = Object.values(slotLabels);
    const composedClosest = (node) => {
      let current = node;
      while (current) {
        if (current.nodeType === Node.ELEMENT_NODE) {
          const text = (current.innerText || current.textContent || '').trim();
          if (labels.some(label => text.includes(label))) return current;
        }
        if (current.parentElement) {
          current = current.parentElement;
          continue;
        }
        const root = current.getRootNode?.();
        current = root?.host || null;
      }
      return null;
    };

    return nodes.map((node, index) => {
      const container = composedClosest(node);
      const text = (container?.innerText || container?.textContent || '').replace(/\s+/g, ' ').trim();
      const matchedLabel = labels.find(label => text.includes(label)) || null;
      return {
        index,
        id: node.id || null,
        matchedLabel,
        text
      };
    });
  }, SLOT_LABELS);

  const byLabel = {};
  for (const item of inputs) {
    if (item.matchedLabel && !byLabel[item.matchedLabel]) byLabel[item.matchedLabel] = item;
  }

  const missing = Object.values(SLOT_LABELS).filter(label => !byLabel[label]);
  if (missing.length) {
    throw new Error(`Could not map upload inputs for: ${missing.join(', ')}; found=${JSON.stringify(inputs)}`);
  }

  return {
    raw: inputs,
    invoice: page.locator(`input[type="file"]#${byLabel[SLOT_LABELS.itemizedInvoice].id}`),
    permit: page.locator(`input[type="file"]#${byLabel[SLOT_LABELS.permit].id}`),
    panel: page.locator(`input[type="file"]#${byLabel[SLOT_LABELS.pictureOfInstalledCircuitOrPanel].id}`)
  };
}

async function readUploadedNames(page) {
  return await page.locator('body').evaluate((body) => {
    const labels = [
      'Itemized Invoice',
      'PDF or Photo of Permit',
      'Picture of Installed Circuit/Panel'
    ];
    const result = {};

    const findSection = (label) => {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
      let node;
      while ((node = walker.nextNode())) {
        const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.includes(label)) return node;
      }
      return null;
    };

    for (const label of labels) {
      const section = findSection(label);
      const text = (section?.innerText || section?.textContent || '');
      const names = Array.from(text.matchAll(/([A-Za-z0-9._-]+\.(?:pdf|png|jpe?g|docx?))/gi)).map(m => m[1]);
      result[label] = Array.from(new Set(names));
    }
    return result;
  });
}

async function uploadFiles(page) {
  const invoiceFiles = absList(manifest.uploadSlots?.itemizedInvoice || []);
  const permitFiles = absList(manifest.uploadSlots?.permit || []);
  const panelFiles = absList(manifest.uploadSlots?.pictureOfInstalledCircuitOrPanel || []);

  const inputs = await discoverUploadInputs(page);

  if (invoiceFiles.length) await inputs.invoice.setInputFiles(invoiceFiles);
  await wait(STEP_DELAY_MS, page);
  if (permitFiles.length) await inputs.permit.setInputFiles(permitFiles);
  await wait(STEP_DELAY_MS, page);
  if (panelFiles.length) await inputs.panel.setInputFiles(panelFiles);
  await wait(Math.max(STEP_DELAY_MS, 4000), page);

  const uploadedNames = await readUploadedNames(page);

  return {
    inputMap: inputs.raw,
    invoiceFiles,
    permitFiles,
    panelFiles,
    uploadedNames,
    currentUrl: page.url()
  };
}

async function finalize(page) {
  if (ACTION === 'save-exit') {
    await page.getByRole('button', { name: /save and exit/i }).first().click();
    await page.waitForURL(/\/s\/?$/, { timeout: 20000 });
  } else if (ACTION === 'continue') {
    await page.getByRole('button', { name: /save and continue/i }).first().click();
    await wait(STEP_DELAY_MS, page);
  }
}

const browser = await connectBrowser();
const context = browser.contexts()[0] || await browser.newContext();
const page = context.pages()[0] || await context.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(60000);

try {
  const credentialSource = await loginIfNeeded(page);
  await openNewApplication(page);
  await verifyPrequalAndStart(page, PREQUAL_ID);
  await acceptTerms(page);
  const uploadState = await uploadFiles(page);
  await finalize(page);
  console.log(JSON.stringify({ ok: true, credentialSource, prequalId: PREQUAL_ID, packageDir: PACKAGE_DIR, action: ACTION, uploadState }, null, 2));
} catch (error) {
  const debugDir = path.resolve(process.cwd(), 'output', 'debug');
  fs.mkdirSync(debugDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try { await page.screenshot({ path: path.join(debugDir, `evhome-claim-upload-${stamp}.png`), fullPage: true }); } catch {}
  try { fs.writeFileSync(path.join(debugDir, `evhome-claim-upload-${stamp}.html`), await page.content()); } catch {}
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
