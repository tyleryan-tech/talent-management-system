const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  authenticateLogin,
  authMiddleware,
  requireHrbp,
  requireSuperAdmin,
} = require('./auth');
const {
  getWorkspace,
  listProductLines,
  updateWorkspaceIfVersion,
  createProductLine,
  deleteProductLine,
} = require('./db');
const { shapeWorkspaceForReader, hasFullWorkspaceAccess } = require('./workspaceScope');
const { validateAndApplyPatch } = require('./workspacePatch');

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '登录请求过于频繁，请 1 分钟后重试', code: 'RATE_LIMIT' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后重试', code: 'RATE_LIMIT' },
});

function requireFullWorkspaceWriter(req, res, next) {
  if (hasFullWorkspaceAccess(req.authUser)) {
    next();
    return;
  }
  res.status(403).json({
    error: '整表保存仅限 HRBP / 超级管理员；经理端请使用增量同步',
    code: 'FULL_PUT_FORBIDDEN',
  });
}

function createRouter(db, broadcastLine) {
  const r = express.Router();
  r.use(apiLimiter);

  /** 与根路径 /health 一致，便于仅反代 /api/* 的网关做存活检查 */
  r.get('/health', (req, res) => {
    res.json({ ok: true, service: 'talent-hub-server' });
  });

  r.post('/auth/login', loginLimiter, async (req, res) => {
    try {
      const body = req.body || {};
      const { identifier, password, email, username } = body;
      const id = identifier != null ? identifier : (email != null ? email : username);
      const result = await authenticateLogin(db, id, password);
      if (!result.ok) {
        res.status(401).json({ error: result.message, code: 'LOGIN_FAILED' });
        return;
      }
      const isSecure = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
      res.cookie('tm_token', result.token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? 'None' : 'Lax',
        maxAge: 2 * 60 * 60 * 1000,
        path: '/api',
      });
      res.json({ token: result.token, user: result.user });
    } catch (e) {
      res.status(500).json({ error: '服务器内部错误', code: 'INTERNAL_ERROR' });
    }
  });

  r.get('/auth/me', authMiddleware(db), (req, res) => {
    res.json({ user: req.authUser });
  });

  r.get('/product-lines', authMiddleware(db), (req, res) => {
    const lines = listProductLines(db);
    res.json({
      lines: lines.map((x) => ({ id: x.id, name: x.name, createdAt: x.created_at })),
    });
  });

  r.post('/product-lines', authMiddleware(db), requireHrbp, express.json(), (req, res) => {
    const name = String(req.body?.name || '').trim() || 'New product line';
    const created = createProductLine(db, name);
    res.status(201).json({ line: { id: created.id, name: created.name, createdAt: created.createdAt } });
  });

  r.delete('/product-lines/:id', authMiddleware(db), requireHrbp, (req, res) => {
    const id = Number(req.params.id);
    const out = deleteProductLine(db, id);
    if (!out.ok) {
      const status = out.reason === 'last_line' ? 400 : 404;
      const msg = out.reason === 'last_line' ? '至少保留一条产品线' : '产品线不存在';
      res.status(status).json({ error: msg, code: out.reason });
      return;
    }
    res.json({ ok: true });
  });

  r.get('/workspace/:lineId', authMiddleware(db), (req, res) => {
    const lineId = Number(req.params.lineId);
    if (Number.isNaN(lineId)) {
      res.status(400).json({ error: '无效的产品线 ID' });
      return;
    }
    const row = getWorkspace(db, lineId);
    if (!row) {
      res.status(404).json({ error: '该产品线暂无数据', code: 'NOT_FOUND' });
      return;
    }
    let data;
    try {
      data = JSON.parse(row.json);
    } catch {
      res.status(500).json({ error: '数据损坏' });
      return;
    }
    const shaped = shapeWorkspaceForReader(data, req.authUser, req.query.scopeRootDepartmentId);
    res.json({
      lineId: row.line_id,
      version: row.version,
      updatedAt: row.updated_at,
      scope: shaped.scope,
      scopeRootDepartmentId: shaped.scopeRootDepartmentId,
      deptScopeIgnored: shaped.deptScopeIgnored,
      data: shaped.data,
    });
  });

  r.post('/workspace/:lineId/patch', authMiddleware(db), express.json({ limit: '5mb' }), (req, res) => {
    const lineId = Number(req.params.lineId);
    if (Number.isNaN(lineId)) {
      res.status(400).json({ error: '无效的产品线 ID' });
      return;
    }
    const clientVersion = req.body?.clientVersion;
    const patch = req.body?.patch;
    if (clientVersion == null || patch == null || typeof patch !== 'object') {
      res.status(400).json({ error: '需要 clientVersion 与 patch 对象' });
      return;
    }
    const row = getWorkspace(db, lineId);
    if (!row) {
      res.status(404).json({ error: '该产品线暂无数据', code: 'NOT_FOUND' });
      return;
    }
    let workspace;
    try {
      workspace = JSON.parse(row.json);
    } catch {
      res.status(500).json({ error: '数据损坏' });
      return;
    }
    let merged;
    try {
      merged = validateAndApplyPatch(workspace, patch, req.authUser);
    } catch (e) {
      res.status(400).json({ error: e.message || '非法变更', code: 'PATCH_REJECTED' });
      return;
    }
    let jsonStr;
    try {
      jsonStr = JSON.stringify(merged);
    } catch {
      res.status(400).json({ error: '合并后数据无法序列化' });
      return;
    }
    const result = updateWorkspaceIfVersion(db, lineId, clientVersion, jsonStr);
    if (!result.ok) {
      if (result.reason === 'version_mismatch') {
        res.status(409).json({
          error: '数据已被他人更新，请刷新后重试',
          code: 'VERSION_CONFLICT',
          currentVersion: result.currentVersion,
        });
        return;
      }
      res.status(404).json({ error: '产品线不存在', code: 'NOT_FOUND' });
      return;
    }
    if (typeof broadcastLine === 'function') broadcastLine(lineId, result.version);
    res.json({ ok: true, version: result.version });
  });

  r.put('/workspace/:lineId', authMiddleware(db), requireFullWorkspaceWriter, express.json({ limit: '10mb' }), (req, res) => {
    const lineId = Number(req.params.lineId);
    if (Number.isNaN(lineId)) {
      res.status(400).json({ error: '无效的产品线 ID' });
      return;
    }
    const clientVersion = req.body?.clientVersion;
    const data = req.body?.data;
    if (clientVersion == null || data == null || typeof data !== 'object') {
      res.status(400).json({ error: '需要 clientVersion 与 data' });
      return;
    }
    if (Array.isArray(data.users)) {
      data.users = data.users.map((u) => {
        const { password, ...rest } = u;
        return rest;
      });
    }
    let jsonStr;
    try {
      jsonStr = JSON.stringify(data);
    } catch {
      res.status(400).json({ error: 'data 无法序列化' });
      return;
    }
    const result = updateWorkspaceIfVersion(db, lineId, clientVersion, jsonStr);
    if (!result.ok) {
      if (result.reason === 'version_mismatch') {
        res.status(409).json({
          error: '数据已被他人更新，请刷新后重试',
          code: 'VERSION_CONFLICT',
          currentVersion: result.currentVersion,
        });
        return;
      }
      res.status(404).json({ error: '产品线不存在', code: 'NOT_FOUND' });
      return;
    }
    if (typeof broadcastLine === 'function') broadcastLine(lineId, result.version);
    res.json({ ok: true, version: result.version });
  });

  return r;
}

module.exports = { createRouter };
