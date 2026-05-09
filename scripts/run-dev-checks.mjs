import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {
    selfHeal: false,
    maxRounds: 1,
    reportDir: 'test-reports',
  };
  for (const arg of argv) {
    if (arg === '--self-heal') out.selfHeal = true;
    else if (arg.startsWith('--max-rounds=')) out.maxRounds = Math.max(1, Number(arg.split('=')[1]) || 1);
    else if (arg.startsWith('--report-dir=')) out.reportDir = arg.slice('--report-dir='.length);
  }
  if (out.selfHeal) out.maxRounds = Math.max(out.maxRounds, 3);
  return out;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function pathCandidates(name) {
  const isWin = process.platform === 'win32';
  const names = isWin ? [name, `${name}.cmd`, `${name}.exe`] : [name];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = [];

  for (const dir of dirs) {
    for (const n of names) candidates.push(path.join(dir, n));
  }

  if (isWin) {
    if (name === 'npm') candidates.unshift('C:\\Program Files\\nodejs\\npm.cmd');
    if (name === 'npx') candidates.unshift('C:\\Program Files\\nodejs\\npx.cmd');
    if (name === 'go') candidates.unshift('C:\\Program Files\\Go\\bin\\go.exe');
  }

  return candidates;
}

function findCommand(name) {
  for (const candidate of pathCandidates(name)) {
    if (fss.existsSync(candidate)) return candidate;
  }
  return null;
}

function findNodePackageCli(name) {
  const envPath = name === 'npm' ? process.env.npm_execpath : '';
  const candidates = [
    envPath,
    process.platform === 'win32'
      ? `C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\${name}-cli.js`
      : '',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fss.existsSync(candidate)) {
      return { command: process.execPath, argsPrefix: [candidate] };
    }
  }
  return null;
}

function npmCommand(args) {
  const cli = findNodePackageCli('npm');
  if (cli) return { command: cli.command, args: [...cli.argsPrefix, ...args] };
  const npm = findCommand('npm');
  return npm ? { command: npm, args } : null;
}

function npxCommand(args) {
  const cli = findNodePackageCli('npx');
  if (cli) return { command: cli.command, args: [...cli.argsPrefix, ...args] };
  const npx = findCommand('npx');
  return npx ? { command: npx, args } : null;
}

function redact(text) {
  return String(text || '')
    .replace(/(JWT_SECRET=)[^\s]+/gi, '$1[redacted]')
    .replace(/(tm_token=)[^;\s]+/gi, '$1[redacted]');
}

function cmdQuote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function spawnSpec(command, args) {
  const needsCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  if (!needsCmd) return { command, args };
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/c', [cmdQuote(command), ...args.map(cmdQuote)].join(' ')],
  };
}

function terminateProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    }).on('error', () => {});
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process already exited.
  }
}

function runCommand({ id, name, command, args = [], cwd = rootDir, timeoutMs = 180000, env = {} }) {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killTimer = null;
    const spec = spawnSpec(command, args);
    const child = spawn(spec.command, spec.args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => terminateProcessTree(child.pid), 5000);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        id,
        name,
        status: 'failed',
        exitCode: null,
        startedAt,
        durationMs: performance.now() - t0,
        command: [command, ...args].join(' '),
        stdout: redact(stdout),
        stderr: redact(`${stderr}\n${err.message}`),
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        id,
        name,
        status: code === 0 && !timedOut ? 'passed' : 'failed',
        exitCode: code,
        timedOut,
        startedAt,
        durationMs: performance.now() - t0,
        command: [command, ...args].join(' '),
        stdout: redact(stdout),
        stderr: redact(stderr),
      });
    });
  });
}

function skipped(id, name, reason) {
  return {
    id,
    name,
    status: 'skipped',
    reason,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    stdout: '',
    stderr: '',
  };
}

function buildChecks(reportDir) {
  const npmBuild = npmCommand(['run', 'build:vite']);
  const go = findCommand('go');
  const browserReportArg = `--report-dir=${path.relative(rootDir, reportDir)}`;
  const checks = [
    {
      id: 'browser',
      name: '主线浏览器测试',
      command: process.execPath,
      args: ['scripts/run-browser-tests.mjs', browserReportArg],
      timeoutMs: 180000,
    },
    {
      id: 'server',
      name: 'Node API 冒烟测试',
      command: process.execPath,
      args: ['--test', 'tests/node-api.test.mjs'],
      timeoutMs: 180000,
    },
  ];

  if (npmBuild) {
    checks.push({
      id: 'vite',
      name: 'Vite/TypeScript 构建检查',
      command: npmBuild.command,
      args: npmBuild.args,
      timeoutMs: 240000,
    });
  } else {
    checks.push({ id: 'vite', name: 'Vite/TypeScript 构建检查', skip: 'npm 不在 PATH 中，无法运行 build:vite' });
  }

  if (go) {
    checks.push({
      id: 'go',
      name: 'Go 兼容后端测试',
      command: go,
      args: ['test', './...'],
      cwd: path.join(rootDir, 'go-server'),
      timeoutMs: 240000,
    });
  } else {
    checks.push({ id: 'go', name: 'Go 兼容后端测试', skip: 'go 不在 PATH 中，本地跳过；CI 会安装后运行' });
  }

  return checks;
}

async function runChecks(reportDir) {
  const checks = buildChecks(reportDir);
  const results = [];
  for (const check of checks) {
    if (check.skip) {
      results.push(skipped(check.id, check.name, check.skip));
      continue;
    }
    console.log(`Running ${check.name}...`);
    results.push(await runCommand(check));
  }
  return results;
}

async function attemptRepair(results) {
  const failedText = results
    .filter((x) => x.status === 'failed')
    .map((x) => `${x.stdout}\n${x.stderr}`)
    .join('\n');
  const npmInstall = npmCommand(['install']);
  const playwrightInstall = npxCommand(['playwright', 'install', 'chromium']);
  const repairs = [];

  if (!npmInstall) {
    return repairs;
  }

  const nodeModulesMissing = !fss.existsSync(path.join(rootDir, 'node_modules'));
  const needsNpmInstall = nodeModulesMissing
    || /Cannot find package|Cannot find module|ERR_MODULE_NOT_FOUND/i.test(failedText);
  if (needsNpmInstall) {
    console.log('Repair: npm install');
    repairs.push(await runCommand({
      id: 'repair-npm-install',
      name: '自动修复：安装 npm 依赖',
      command: npmInstall.command,
      args: npmInstall.args,
      timeoutMs: 300000,
    }));
    return repairs;
  }

  const needsPlaywrightBrowser = /Executable doesn't exist|playwright install|browserType\.launch/i.test(failedText);
  if (needsPlaywrightBrowser && playwrightInstall) {
    console.log('Repair: npx playwright install chromium');
    repairs.push(await runCommand({
      id: 'repair-playwright-browser',
      name: '自动修复：安装 Playwright Chromium',
      command: playwrightInstall.command,
      args: playwrightInstall.args,
      timeoutMs: 300000,
    }));
  }

  const go = findCommand('go');
  const needsGoTidy = /missing go\.sum entry/i.test(failedText);
  if (needsGoTidy && go) {
    console.log('Repair: go mod tidy');
    repairs.push(await runCommand({
      id: 'repair-go-mod-tidy',
      name: '自动修复：补齐 Go module 校验文件',
      command: go,
      args: ['mod', 'tidy'],
      cwd: path.join(rootDir, 'go-server'),
      timeoutMs: 300000,
    }));
  }

  return repairs;
}

async function writeReport(report, reportDir) {
  await fs.mkdir(reportDir, { recursive: true });
  const name = `dev-check-${stamp()}`;
  const jsonPath = path.join(reportDir, `${name}.json`);
  const mdPath = path.join(reportDir, `${name}.md`);
  const latestJsonPath = path.join(reportDir, 'dev-check-latest.json');
  const latestMdPath = path.join(reportDir, 'dev-check-latest.md');
  const allResults = report.rounds.flatMap((x) => x.results);
  const failed = allResults.filter((x) => x.status === 'failed');
  const skippedResults = allResults.filter((x) => x.status === 'skipped');

  const md = [
    '# Development Check Report',
    '',
    `- Status: ${report.ok ? 'PASSED' : 'FAILED'}`,
    `- Started at: ${report.startedAt}`,
    `- Duration: ${Math.round(report.durationMs)} ms`,
    `- Rounds: ${report.rounds.length}`,
    `- Node: ${process.version}`,
    `- Platform: ${process.platform}`,
    '',
    '## Latest Round',
    '',
    ...report.rounds.at(-1).results.map((x) => {
      if (x.status === 'skipped') return `- SKIPPED ${x.name}: ${x.reason}`;
      return `- ${x.status.toUpperCase()} ${x.name} (${Math.round(x.durationMs)} ms)`;
    }),
    '',
    '## Repairs',
    '',
    report.repairs.length
      ? report.repairs.map((x) => `- ${x.status.toUpperCase()} ${x.name}`).join('\n')
      : '- None',
    '',
    '## Failures',
    '',
    failed.length
      ? failed.map((x) => `### ${x.name}\n\nCommand: \`${x.command}\`\n\n\`\`\`text\n${(x.stderr || x.stdout || '').slice(-4000)}\n\`\`\``).join('\n\n')
      : '- None',
    '',
    '## Skipped',
    '',
    skippedResults.length
      ? skippedResults.map((x) => `- ${x.name}: ${x.reason}`).join('\n')
      : '- None',
    '',
  ].join('\n');

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(mdPath, md, 'utf8');
  await fs.copyFile(jsonPath, latestJsonPath);
  await fs.copyFile(mdPath, latestMdPath);
  return { jsonPath, mdPath, latestJsonPath, latestMdPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportDir = path.resolve(rootDir, args.reportDir);
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const rounds = [];
  const repairs = [];

  for (let round = 1; round <= args.maxRounds; round += 1) {
    console.log(`\nVerification round ${round}/${args.maxRounds}`);
    const results = await runChecks(reportDir);
    rounds.push({ round, results });
    const hasFailures = results.some((x) => x.status === 'failed');
    if (!hasFailures) break;
    if (!args.selfHeal || round === args.maxRounds) break;

    const repairResults = await attemptRepair(results);
    repairs.push(...repairResults);
    if (repairResults.length === 0 || repairResults.some((x) => x.status === 'failed')) break;
  }

  const latest = rounds.at(-1).results;
  const ok = latest.every((x) => x.status !== 'failed');
  const report = {
    ok,
    startedAt,
    durationMs: performance.now() - t0,
    rootDir,
    selfHeal: args.selfHeal,
    rounds,
    repairs,
  };
  const paths = await writeReport(report, reportDir);
  console.log(`\nDevelopment checks: ${ok ? 'PASSED' : 'FAILED'}`);
  console.log(`Report: ${paths.latestMdPath}`);
  process.exitCode = ok ? 0 : 1;
}

main();
