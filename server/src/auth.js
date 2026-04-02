const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  findLoginUserByEmail,
  findLoginUserByUsername,
} = require('./db');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s === 'change-me-to-a-long-random-string') {
    // eslint-disable-next-line no-console
    console.warn('[auth] Using default JWT_SECRET; set JWT_SECRET in production.');
  }
  return s || 'dev-only-insecure-secret';
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

function verifyPassword(row, password) {
  if (!row || !password) return false;
  return bcrypt.compareSync(String(password), row.password_hash);
}

function authenticateLogin(db, identifier, password) {
  const id = String(identifier || '').trim();
  if (!id) return { ok: false, message: '请输入邮箱或用户名' };
  const idLower = id.toLowerCase();
  let row = findLoginUserByEmail(db, idLower);
  if (!row && !idLower.includes('@')) {
    row = findLoginUserByUsername(db, idLower);
  }
  if (!row || !verifyPassword(row, password)) {
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
    { expiresIn: '7d' },
  );
  return { ok: true, token, user };
}

function authMiddleware(db) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      res.status(401).json({ error: '未登录', code: 'UNAUTHORIZED' });
      return;
    }
    try {
      const payload = jwt.verify(m[1], getJwtSecret());
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
    const h = req.headers.authorization || '';
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      req.authUser = null;
      next();
      return;
    }
    try {
      const payload = jwt.verify(m[1], getJwtSecret());
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
