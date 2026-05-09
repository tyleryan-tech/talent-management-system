import fs from 'node:fs/promises';
import fss from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {
    headed: false,
    timeoutMs: 120000,
    reportDir: 'test-reports',
    allowConsoleErrors: false,
  };
  for (const arg of argv) {
    if (arg === '--headed') out.headed = true;
    else if (arg === '--allow-console-errors') out.allowConsoleErrors = true;
    else if (arg.startsWith('--timeout=')) out.timeoutMs = Number(arg.split('=')[1]);
    else if (arg.startsWith('--report-dir=')) out.reportDir = arg.slice('--report-dir='.length);
  }
  return out;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  }[ext] || 'application/octet-stream';
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function escapeMd(text) {
  return String(text || '').replace(/\r/g, '').trim();
}

async function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const rawUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const decodedPath = decodeURIComponent(rawUrl.pathname);
      const candidate = path.resolve(rootDir, `.${decodedPath}`);
      if (!candidate.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const stat = await fs.stat(candidate).catch(() => null);
      const filePath = stat?.isDirectory() ? path.join(candidate, 'index.html') : candidate;
      const body = await fs.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': contentType(filePath),
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function writeReports(report, reportDir) {
  await fs.mkdir(reportDir, { recursive: true });
  const name = `browser-tests-${stamp()}`;
  const jsonPath = path.join(reportDir, `${name}.json`);
  const mdPath = path.join(reportDir, `${name}.md`);
  const latestJsonPath = path.join(reportDir, 'browser-tests-latest.json');
  const latestMdPath = path.join(reportDir, 'browser-tests-latest.md');

  const failedTests = (report.results?.results || []).filter((x) => x.status === 'failed');
  const md = [
    '# Browser Test Report',
    '',
    `- Status: ${report.ok ? 'PASSED' : 'FAILED'}`,
    `- Started at: ${report.startedAt}`,
    `- Duration: ${Math.round(report.durationMs)} ms`,
    `- URL: ${report.url || 'n/a'}`,
    `- Summary: ${report.results?.passed || 0} passed, ${report.results?.failed || 0} failed, ${report.results?.skipped || 0} skipped`,
    `- Page errors: ${report.pageErrors.length}`,
    `- Console errors: ${report.consoleErrors.length}`,
    `- Request failures: ${report.requestFailures.length}`,
    '',
    '## Failed Tests',
    '',
    failedTests.length
      ? failedTests.map((x) => `- ${x.suite} / ${x.test}: ${escapeMd(x.error)}`).join('\n')
      : '- None',
    '',
    '## Page Errors',
    '',
    report.pageErrors.length
      ? report.pageErrors.map((x) => `- ${escapeMd(x.message)}`).join('\n')
      : '- None',
    '',
    '## Console Errors',
    '',
    report.consoleErrors.length
      ? report.consoleErrors.map((x) => `- ${escapeMd(x.text)}`).join('\n')
      : '- None',
    '',
    '## Request Failures',
    '',
    report.requestFailures.length
      ? report.requestFailures.map((x) => `- ${x.method} ${x.url}: ${escapeMd(x.failure)}`).join('\n')
      : '- None',
    '',
  ].join('\n');

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(mdPath, md, 'utf8');
  await fs.copyFile(jsonPath, latestJsonPath);
  await fs.copyFile(mdPath, latestMdPath);

  return { jsonPath, mdPath, latestJsonPath, latestMdPath };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const reportDir = path.resolve(rootDir, args.reportDir);
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  let server;
  let browser;
  let url = '';
  let results = null;
  let setupError = null;

  try {
    const playwright = await import('playwright');
    const staticServer = await startStaticServer();
    server = staticServer.server;
    url = `${staticServer.baseUrl}/tests/index.html?autorun=0`;

    browser = await playwright.chromium.launch({ headless: !args.headed });
    const page = await browser.newPage();

    page.on('console', (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
      });
    });
    page.on('pageerror', (err) => {
      pageErrors.push({ message: err.message, stack: err.stack });
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      const requestUrl = request.url();
      if (!requestUrl.includes('/favicon.ico')) {
        requestFailures.push({
          method: request.method(),
          url: requestUrl,
          failure: failure?.errorText || 'request failed',
        });
      }
    });

    await page.goto(url, { waitUntil: 'load', timeout: args.timeoutMs });
    results = await page.evaluate(async () => {
      if (typeof window.runTests !== 'function') {
        throw new Error('window.runTests is not available');
      }
      return window.runTests();
    });
  } catch (err) {
    setupError = {
      message: err?.message || String(err),
      stack: err?.stack,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise((resolve) => server.close(resolve));
  }

  const consoleErrors = args.allowConsoleErrors
    ? []
    : consoleMessages.filter((x) => x.type === 'error');
  const failedCount = Number(results?.failed || 0)
    + pageErrors.length
    + consoleErrors.length
    + requestFailures.length
    + (setupError ? 1 : 0);

  const report = {
    ok: failedCount === 0,
    startedAt,
    durationMs: performance.now() - t0,
    rootDir,
    url,
    node: process.version,
    platform: process.platform,
    results,
    setupError,
    pageErrors,
    consoleMessages,
    consoleErrors,
    requestFailures,
  };
  const paths = await writeReports(report, reportDir);
  report.reportPaths = paths;

  if (setupError) {
    console.error(setupError.message);
  }
  console.log(`Browser tests: ${report.ok ? 'PASSED' : 'FAILED'}`);
  console.log(`Report: ${paths.latestMdPath}`);
  process.exitCode = report.ok ? 0 : 1;
}

run();
