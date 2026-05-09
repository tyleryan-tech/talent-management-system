const crypto = require('crypto');
const { getWorkspace, listProductLines } = require('./db');
const { shapeWorkspaceForReader } = require('./workspaceScope');

const AI_MODULE = 'ai_analyst';
const DEFAULT_MANAGER_MODULES = ['dashboard', 'roster', 'org', 'recruitment', 'talent', 'performance', 'attendance'];

function getAiSessionSecret() {
  return process.env.AI_ANALYST_SESSION_SECRET || process.env.JWT_SECRET || '';
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signContext(context) {
  const secret = getAiSessionSecret();
  if (!secret) throw new Error('AI_ANALYST_SESSION_SECRET 未配置');
  const payload = b64url(JSON.stringify(context));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function sameUser(a, b) {
  if (!a || !b) return false;
  if (a.id != null && b.id != null && Number(a.id) === Number(b.id)) return true;
  if (a.email && b.email && String(a.email).toLowerCase() === String(b.email).toLowerCase()) return true;
  if (a.username && b.username && String(a.username).toLowerCase() === String(b.username).toLowerCase()) return true;
  return false;
}

function findWorkspaceUser(workspace, authUser) {
  const users = Array.isArray(workspace?.users) ? workspace.users : [];
  return users.find((u) => sameUser(u, authUser)) || null;
}

function isProductLineHead(user, workspace) {
  const eid = user?.employeeId;
  const ownerId = workspace?.orgSettings?.productLineHeadEmployeeId
    ?? workspace?.orgSettings?.productLineOwnerEmployeeId;
  return eid != null && ownerId != null && Number(eid) === Number(ownerId);
}

function moduleAllowedForUser(user, workspace) {
  if (!user) return false;
  if (user.superAdmin === true || String(user.role || '') === 'super_admin') return true;
  if (isProductLineHead(user, workspace)) return true;

  const role = String(user.role || '');
  if (role === 'hrbp') {
    const sub = user.hrbpSubType || (user.superAdmin ? 'super_admin' : 'admin');
    if (sub === 'super_admin') return true;
    if (sub === 'intern') return Array.isArray(user.allowedModules) && user.allowedModules.includes(AI_MODULE);
    if (!Array.isArray(user.allowedModules)) return true;
    return user.allowedModules.includes(AI_MODULE);
  }

  if (role === 'manager') {
    if (user.rmStatus === 'pending_approval' || user.rmStatus === 'revoked') return false;
    const modules = user.managerPermissions?.modules;
    if (!Array.isArray(modules)) return DEFAULT_MANAGER_MODULES.includes(AI_MODULE);
    return modules.includes(AI_MODULE);
  }

  return false;
}

function lineAllowedForUser(user, workspace, lineId) {
  if (!user) return false;
  if (user.superAdmin === true || String(user.role || '') === 'super_admin') return true;
  if (isProductLineHead(user, workspace)) return true;
  if (Array.isArray(user.allowedLineIds) && user.allowedLineIds.length) {
    return user.allowedLineIds.map(Number).includes(Number(lineId));
  }
  if (String(user.role || '') === 'manager' && user.homeLineId != null) {
    return Number(user.homeLineId) === Number(lineId);
  }
  return true;
}

function resolveAiActor(authUser, workspace) {
  const wsUser = findWorkspaceUser(workspace, authUser);
  return { ...(authUser || {}), ...(wsUser || {}) };
}

function resolveAiAccess(db, authUser, options) {
  const lineId = Number(options?.lineId);
  if (Number.isNaN(lineId)) {
    return { ok: false, status: 400, error: '无效的产品线 ID', code: 'INVALID_LINE_ID' };
  }
  const line = listProductLines(db).find((x) => Number(x.id) === lineId);
  if (!line) {
    return { ok: false, status: 404, error: '产品线不存在', code: 'LINE_NOT_FOUND' };
  }
  const row = getWorkspace(db, lineId);
  if (!row) {
    return { ok: false, status: 404, error: '该产品线暂无数据', code: 'WORKSPACE_NOT_FOUND' };
  }
  let workspace;
  try {
    workspace = JSON.parse(row.json);
  } catch {
    return { ok: false, status: 500, error: '产品线数据损坏', code: 'WORKSPACE_BROKEN' };
  }

  const actor = resolveAiActor(authUser, workspace);
  if (!moduleAllowedForUser(actor, workspace) || !lineAllowedForUser(actor, workspace, lineId)) {
    return { ok: false, status: 403, error: '无权访问 AI 数据分析', code: 'AI_ANALYST_FORBIDDEN' };
  }

  return { ok: true, lineId, line, workspace, actor };
}

function buildAiSession(db, authUser, options) {
  const access = resolveAiAccess(db, authUser, options);
  if (!access.ok) return access;

  const scopeRootDepartmentId = options?.scopeRootDepartmentId ?? null;
  const shaped = shapeWorkspaceForReader(access.workspace, access.actor, scopeRootDepartmentId);
  const scope = shaped.scope || 'full';
  const now = Math.floor(Date.now() / 1000);
  const context = {
    iss: 'talent-hub',
    aud: 'ai-analyst',
    iat: now,
    exp: now + 15 * 60,
    user: {
      id: access.actor.id ?? null,
      username: access.actor.username || '',
      email: access.actor.email || '',
      role: access.actor.role || '',
      realName: access.actor.realName || access.actor.real_name || '',
      employeeId: access.actor.employeeId ?? access.actor.employee_id ?? null,
      superAdmin: access.actor.superAdmin === true,
      hrbpSubType: access.actor.hrbpSubType || null,
    },
    productLine: {
      id: access.lineId,
      name: access.line.name,
    },
    permissions: {
      modules: [AI_MODULE],
      scope,
      scopeRootDepartmentId: shaped.scopeRootDepartmentId ?? null,
    },
  };

  return {
    ok: true,
    context,
    contextToken: signContext(context),
  };
}

module.exports = {
  buildAiSession,
  resolveAiAccess,
  signContext,
};
