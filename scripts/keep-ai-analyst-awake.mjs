import { chromium } from 'playwright';

const DEFAULT_URL = 'https://talent-management-system-wrprc98deuzvydwtl4m5gq.streamlit.app';
const TARGET_URL = String(process.env.AI_ANALYST_URL || process.env.TM_AI_ANALYST_URL || DEFAULT_URL)
  .trim()
  .replace(/\/+$/, '');
const WAKE_TIMEOUT_MS = Number(process.env.AI_ANALYST_WAKE_TIMEOUT_MS || 180000);

function standaloneUrl(rawUrl) {
  const u = new URL(rawUrl);
  u.searchParams.delete('embed');
  u.searchParams.set('_tm_keepalive', String(Date.now()));
  return u.toString();
}

async function clickWakeButton(page) {
  const wakeNames = [
    'Yes, get this app back up!',
    'Get this app back up',
    'Wake up',
  ];

  for (const name of wakeNames) {
    const button = page.getByRole('button', { name, exact: false });
    if (await button.count()) {
      await button.first().click({ timeout: 15000 });
      return true;
    }
  }

  return false;
}

async function waitUntilAwake(page) {
  const started = Date.now();
  while (Date.now() - started < WAKE_TIMEOUT_MS) {
    const bodyText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
    if (!/Zzzz|gone to sleep|wake it back up/i.test(bodyText)) {
      return true;
    }

    await clickWakeButton(page).catch(() => false);
    await page.waitForTimeout(5000);
  }

  return false;
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const url = standaloneUrl(TARGET_URL);
  console.log(`[ai-analyst-keepalive] Opening ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const clicked = await clickWakeButton(page);
  if (clicked) {
    console.log('[ai-analyst-keepalive] Sleeping page detected; clicked wake button.');
  }

  const awake = await waitUntilAwake(page);
  if (!awake) {
    throw new Error(`AI analyst did not wake within ${WAKE_TIMEOUT_MS}ms`);
  }

  const title = await page.title().catch(() => '');
  console.log(`[ai-analyst-keepalive] AI analyst is reachable. title="${title}"`);
} finally {
  await browser.close();
}
