/**
 * 导出 Express app 实例（不启动监听），供 Vercel Serverless 与独立 Node 进程共用。
 * Vercel 场景：DB 存 /tmp（每次冷启动会自动 seed 演示数据）。
 * 独立进程场景：DB 按 .env 配置的 DB_PATH 持久存储。
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
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
    throw new Error(
      '[FATAL] 环境变量 JWT_SECRET 未设置。请在 .env 或部署平台中配置一个安全的随机密钥。'
      + ' 例如: JWT_SECRET=$(openssl rand -base64 48)',
    );
  }

  _db = openDatabase();
  initSchema(_db);
  bootSeed(_db);

  const rawOrigins = (process.env.CORS_ORIGINS || '').trim();
  const allowAll = rawOrigins === '*';
  const allowedOrigins = allowAll
    ? []
    : rawOrigins.split(',').map((s) => s.trim()).filter(Boolean);

  if (!allowAll && allowedOrigins.length === 0) {
    console.warn(
      '[security] CORS_ORIGINS 未设置或为空，将仅允许同源请求。'
      + ' 如需跨域访问，请设置 CORS_ORIGINS 环境变量（逗号分隔的域名列表，或 * 表示允许全部）。',
    );
  }

  const app = express();
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowAll) return cb(null, true);
      if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'talent-hub-server' });
  });

  app.use('/api', createRouter(_db, () => {}));

  _app = app;
  return app;
}

module.exports = createApp;
