import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dbPath = path.join(os.tmpdir(), `talent-hub-api-test-${process.pid}-${Date.now()}.db`);

process.env.DB_PATH = dbPath;
process.env.JWT_SECRET = 'test-secret-for-node-api-automation-only';
process.env.CORS_ORIGINS = '*';
process.env.NODE_ENV = 'test';
process.env.DEEPSEEK_API_KEY = '';
process.env.OPENAI_API_KEY = '';

const createApp = require('../server/src/app.js');
const app = createApp();
let server;
let baseUrl;

function listen() {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

async function request(pathname, options = {}) {
  const headers = {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {}),
  };
  const resp = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await resp.text();
  const body = text ? JSON.parse(text) : null;
  return { resp, body };
}

async function login(identifier, password = '123') {
  const { resp, body } = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier, password },
  });
  assert.equal(resp.status, 200);
  assert.ok(body.token);
  assert.ok(body.user);
  return body;
}

test.before(async () => {
  await listen();
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbPath}${suffix}`);
    } catch {
      // temp db cleanup best effort
    }
  }
});

test('health endpoint returns service status', async () => {
  const { resp, body } = await request('/api/health');
  assert.equal(resp.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, 'talent-hub-server');
});

test('login accepts seeded HRBP user and auth/me returns current user', async () => {
  const session = await login('hrbp@company.com');
  const { resp, body } = await request('/api/auth/me', { token: session.token });
  assert.equal(resp.status, 200);
  assert.equal(body.user.email, 'hrbp@company.com');
  assert.equal(body.user.role, 'hrbp');
});

test('authenticated HRBP can list product lines and read workspace', async () => {
  const session = await login('hrbp@company.com');
  const lines = await request('/api/product-lines', { token: session.token });
  assert.equal(lines.resp.status, 200);
  assert.ok(Array.isArray(lines.body.lines));
  assert.ok(lines.body.lines.length >= 1);

  const lineId = lines.body.lines[0].id;
  const workspace = await request(`/api/workspace/${lineId}`, { token: session.token });
  assert.equal(workspace.resp.status, 200);
  assert.equal(workspace.body.lineId, lineId);
  assert.ok(workspace.body.version >= 1);
  assert.ok(Array.isArray(workspace.body.data.employees));
});

test('manager cannot perform full workspace PUT', async () => {
  const manager = await login('manager@company.com');
  const workspace = await request('/api/workspace/1', { token: manager.token });
  assert.equal(workspace.resp.status, 200);

  const attempt = await request('/api/workspace/1', {
    method: 'PUT',
    token: manager.token,
    body: {
      clientVersion: workspace.body.version,
      data: workspace.body.data,
    },
  });
  assert.equal(attempt.resp.status, 403);
  assert.equal(attempt.body.code, 'FULL_PUT_FORBIDDEN');
  assert.match(attempt.body.error, /经理端请使用增量同步/);
});

test('AI context uses native backend and respects HRBP access', async () => {
  const session = await login('hrbp@company.com');
  const { resp, body } = await request('/api/ai-analyst/context?lineId=1', {
    token: session.token,
  });
  assert.equal(resp.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mode, 'native');
  assert.equal(body.context.productLine.id, 1);
  assert.equal(body.context.permissions.scope, 'full');
  assert.ok(body.dataProfile.totals.employees > 0);
  assert.equal(body.aiConfigured, false);
});

test('AI chat falls back to local summary when model key is not configured', async () => {
  const session = await login('hrbp@company.com');
  const { resp, body } = await request('/api/ai-analyst/chat', {
    method: 'POST',
    token: session.token,
    body: {
      lineId: 1,
      question: '帮我分析当前团队整体情况',
    },
  });
  assert.equal(resp.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mode, 'local_summary');
  assert.match(body.answer, /当前权限范围|full|核心结论/);
  assert.ok(body.dataProfile.totals.employees > 0);
});

test('AI chat validates empty questions', async () => {
  const session = await login('hrbp@company.com');
  const { resp, body } = await request('/api/ai-analyst/chat', {
    method: 'POST',
    token: session.token,
    body: { lineId: 1, question: '   ' },
  });
  assert.equal(resp.status, 400);
  assert.equal(body.code, 'AI_EMPTY_QUESTION');
});

test('manager without AI module cannot access native AI endpoints', async () => {
  const manager = await login('manager@company.com');
  const { resp, body } = await request('/api/ai-analyst/context?lineId=1', {
    token: manager.token,
  });
  assert.equal(resp.status, 403);
  assert.equal(body.code, 'AI_ANALYST_FORBIDDEN');
});
