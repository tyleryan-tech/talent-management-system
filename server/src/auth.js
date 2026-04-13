const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  findLoginUserByEmail,
  findLoginUserByUsername,
} = require('./db');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error('[auth] JWT_SECRET 未设置，拒绝处理请求。');
  }
  return s;
}

function toPublicUser(row) {
  if (!row) return null;
  const sa = row.super_admin === 1;
  return {
    id: row.id,
    username: row.username || '',
    email: row.email,
    role: sa ? 'super_admin' : row.role,
    realName: row.real_name || '',
    employeeId: row.employee_id != null ? row.employee_id : null,
    superAdmin: sa,
  };
}

async function verifyPassword(row, password) {
  if (!row || !password) return false;
  return bcrypt.compare(String(password), row.password_hash);
}

async function authenticateLogin(db, identifier, password) {
  const id = String(identifier || '').trim();
  if (!id) return { ok: false, message: '请输入邮箱或用户名' };
  const idLower = id.toLowerCase();
  let row = findLoginUserByEmail(db, idLower);
  if (!row && !idLower.includes('@')) {
    row = findLoginUserByUsername(db, idLower);
  }
  if (!row || !(await verifyPassword(row, password))) {
    return { ok: false, message: '邮箱/用户名或密码错误' };
  }
  const user = toPublicUser(row);
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      sa: user.superAdmin === true,
    },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: '2h' },
  );
  return { ok: true, token, user };
}

function extractToken(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  return req.cookies?.tm_token || null;
}

function authMiddleware(db) {
  return (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: '未登录', code: 'UNAUTHORIZED' });
      return;
    }
    try {
      const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
      const row = db.prepare('SELECT * FROM login_users WHERE id = ?').get(payload.sub);
      if (!row) {
        res.status(401).json({ error: '登录已失效', code: 'UNAUTHORIZED' });
        return;
      }
      req.authUser = toPublicUser(row);
      next();
    } catch {
      res.status(401).json({ error: '登录已失效', code: 'UNAUTHORIZED' });
    }
  };
}

function optionalAuthMiddleware(db) {
  return (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
      req.authUser = null;
      next();
      return;
    }
    try {
      const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
      const row = db.prepare('SELECT * FROM login_users WHERE id = ?').get(payload.sub);
      req.authUser = row ? toPublicUser(row) : null;
    } catch {
      req.authUser = null;
    }
    next();
  };
}

function requireHrbp(req, res, next) {
  const u = req.authUser;
  if (!u) {
    res.status(401).json({ error: '未登录', code: 'UNAUTHORIZED' });
    return;
  }
  if (u.role !== 'hrbp' && u.role !== 'super_admin') {
    res.status(403).json({ error: '需要 HRBP 权限', code: 'FORBIDDEN' });
    return;
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  const u = req.authUser;
  if (!u) {
    res.status(401).json({ error: '未登录', code: 'UNAUTHORIZED' });
    return;
  }
  if (u.role !== 'super_admin' && u.superAdmin !== true) {
    res.status(403).json({ error: '需要超级管理员', code: 'FORBIDDEN' });
    return;
  }
  next();
}

module.exports = {
  authenticateLogin,
  authMiddleware,
  optionalAuthMiddleware,
  requireHrbp,
  requireSuperAdmin,
  getJwtSecret,
  toPublicUser,
};
