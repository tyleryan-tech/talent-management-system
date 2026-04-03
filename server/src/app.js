/**
 * 导出 Express app 实例（不启动监听），供 Vercel Serverless 与独立 Node 进程共用。
 * Vercel 场景：DB 存 /tmp（每次冷启动会自动 seed 演示数据）。
 * 独立进程场景：DB 按 .env 配置的 DB_PATH 持久存储。
 */

const express = require('express');
const cors = require('cors');
const { openDatabase, initSchema, bootSeed } = require('./db');
const { createRouter } = require('./routes');
let _app = null;
let _db = null;

function createApp() {
  if (_app) return _app;

  if (!process.env.DB_PATH) {
    process.env.DB_PATH = '/tmp/talent-hub.db';
  }
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'vercel-demo-jwt-secret';
  }

  _db = openDatabase();
  initSchema(_db);
  bootSeed(_db);

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'talent-hub-server' });
  });

  app.use('/api', createRouter(_db, () => {}));

  _app = app;
  return app;
}

module.exports = createApp;
