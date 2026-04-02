/**
 * 按登录角色裁剪工作区：经理仅见本人 + 递归下属及相关引用数据。
 * HRBP / 超级管理员返回完整数据（密码仍建议仅在可信环境使用；此处 GET 会剔除 users[].password）。
 */

function stripUserPasswords(users) {
  if (!Array.isArray(users)) return users;
  return users.map((u) => {
    const { password, ...rest } = u;
    return rest;
  });
}

function hasFullWorkspaceAccess(user) {
  if (!user) return false;
  if (user.superAdmin === true) return true;
  const r = String(user.role || '');
  return r === 'hrbp' || r === 'super_admin';
}

/**
 * 与前端 TM.deptIdsInOrgScope 一致：root 为 null/0 → null（不限制）；无效 root → 空 Set
 */
function deptIdsInOrgScope(rootDeptId, departments) {
  const rid = rootDeptId == null || rootDeptId === '' ? null : Number(rootDeptId);
  if (rid === null || Number.isNaN(rid) || rid === 0) return null;
  const deps = departments || [];
  if (!deps.some((d) => Number(d.id) === rid)) return new Set();
  const byParent = new Map();
  deps.forEach((d) => {
    const pid = d.parentId == null ? '__root__' : Number(d.parentId);
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(d);
  });
  const out = new Set();
  const walk = (id) => {
    out.add(Number(id));
    (byParent.get(Number(id)) || []).forEach((c) => walk(c.id));
  };
  walk(rid);
  return out;
}

function ancestorDepartmentIds(rootDeptId, departments) {
  const byId = new Map((departments || []).map((d) => [Number(d.id), d]));
  const out = new Set();
  let cur = byId.get(Number(rootDeptId));
  while (cur && cur.parentId != null) {
    const pid = Number(cur.parentId);
    if (out.has(pid)) break;
    out.add(pid);
    cur = byId.get(pid);
  }
  return out;
}

/**
 * HRBP 按「所选部门 + 子部门」裁剪，与顶部组织范围一致；配置类字段保持产品线级全量。
 */
function filterWorkspaceByDeptSubtree(full, rootDeptId) {
  const departments = full.departments || [];
  const sub = deptIdsInOrgScope(rootDeptId, departments);
  if (sub == null) {
    return { data: { ...full }, deptScopeMode: 'line' };
  }
  if (sub.size === 0) {
    return { data: { ...full }, deptScopeMode: 'invalid_root' };
  }

  const anc = ancestorDepartmentIds(rootDeptId, departments);
  const visDept = new Set([...sub, ...anc]);
  const employees = (full.employees || []).filter((e) => sub.has(Number(e.departmentId)));
  const visEmp = new Set(employees.map((e) => Number(e.id)));
  const empIn = (id) => id != null && visEmp.has(Number(id));

  const positions = (full.positions || []).filter((p) => sub.has(Number(p.departmentId)));
  const visPosIds = new Set(positions.map((p) => Number(p.id)));
  const deptsFiltered = departments.filter((d) => visDept.has(Number(d.id)));

  const recruitKeyInSubtree = (key) => {
    const parts = String(key).split('-');
    const d = Number(parts[0]);
    const p = Number(parts[1]);
    if (Number.isNaN(d) || Number.isNaN(p)) return false;
    if (!sub.has(d)) return false;
    return positions.some((x) => Number(x.departmentId) === d && Number(x.id) === p);
  };
  const positionRecruitTags = {};
  Object.entries(full.positionRecruitTags || {}).forEach(([k, v]) => {
    if (recruitKeyInSubtree(k)) positionRecruitTags[k] = v;
  });
  const recruitmentPositionMetrics = {};
  Object.entries(full.recruitmentPositionMetrics || {}).forEach(([k, v]) => {
    if (recruitKeyInSubtree(k)) recruitmentPositionMetrics[k] = v;
  });

  const out = {
    ...full,
    hrScopeRootDepartmentId: full.hrScopeRootDepartmentId ?? null,
    employees,
    departments: deptsFiltered,
    positions,
    leaveRequests: (full.leaveRequests || []).filter(
      (r) => empIn(r.employeeId) && (r.approverId == null || empIn(r.approverId)),
    ),
    performanceReviews: (full.performanceReviews || []).filter((r) => empIn(r.employeeId)),
    employeeTrainings: (full.employeeTrainings || []).filter((t) => empIn(t.employeeId)),
    attendanceRecords: (full.attendanceRecords || []).filter((a) => empIn(a.employeeId)),
    punchRecords: (full.punchRecords || []).filter((p) => empIn(p.employeeId)),
    notifications: (full.notifications || []).filter((n) => empIn(n.employeeId)),
    talentMatrix: (full.talentMatrix || []).filter((t) => empIn(t.employeeId)),
    successionPlans: (full.successionPlans || []).filter((s) => visPosIds.has(Number(s.positionId))),
    positionRecruitTags,
    recruitmentPositionMetrics,
    recruitmentCandidates: (full.recruitmentCandidates || []).filter((c) => {
      if (c.departmentId != null) return sub.has(Number(c.departmentId));
      if (c.positionId != null) return visPosIds.has(Number(c.positionId));
      return false;
    }),
    orgChangeRequests: (full.orgChangeRequests || []).filter((reqRow) => {
      if (empIn(reqRow.pendingApproverId)) return true;
      const chain = reqRow.approvalChain || [];
      if (chain.some((eid) => empIn(eid))) return true;
      const p = reqRow.payload || {};
      const keys = ['employeeId', 'fromEmployeeId', 'toEmployeeId', 'managerId'];
      if (keys.some((k) => p[k] != null && empIn(p[k]))) return true;
      if (p.departmentId != null && sub.has(Number(p.departmentId))) return true;
      return false;
    }),
    users: stripUserPasswords(full.users),
  };

  return { data: out, deptScopeMode: 'dept_subtree' };
}

function parseScopeRootDepartmentIdQuery(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

/** 从经理工号出发，收集本人 + 全体下属 employee id */
function visibleEmployeeIds(rootManagerEmpId, employees) {
  const emps = Array.isArray(employees) ? employees : [];
  const byManager = new Map();
  emps.forEach((e) => {
    const mid = e.managerId;
    if (mid == null) return;
    const k = Number(mid);
    if (!byManager.has(k)) byManager.set(k, []);
    byManager.get(k).push(Number(e.id));
  });
  const root = Number(rootManagerEmpId);
  const out = new Set([root]);
  const stack = [...(byManager.get(root) || [])];
  while (stack.length) {
    const id = Number(stack.pop());
    if (out.has(id)) continue;
    out.add(id);
    (byManager.get(id) || []).forEach((c) => stack.push(c));
  }
  return out;
}

/** 可见员工所在部门及向上追溯到根的部门 id */
function visibleDepartmentIds(visibleEmpIds, employees, departments) {
  const deps = Array.isArray(departments) ? departments : [];
  const byId = new Map(deps.map((d) => [Number(d.id), d]));
  const deptIds = new Set();
  (Array.isArray(employees) ? employees : []).forEach((e) => {
    if (visibleEmpIds.has(Number(e.id)) && e.departmentId != null) {
      deptIds.add(Number(e.departmentId));
    }
  });
  const ancestors = new Set(deptIds);
  deptIds.forEach((did) => {
    let cur = byId.get(did);
    while (cur && cur.parentId != null) {
      const pid = Number(cur.parentId);
      if (ancestors.has(pid)) break;
      ancestors.add(pid);
      cur = byId.get(pid);
    }
  });
  return ancestors;
}

function filterWorkspaceForManager(workspace, authUser) {
  const full = { ...workspace };
  const employees = Array.isArray(full.employees) ? full.employees : [];
  const empId = authUser.employeeId != null ? Number(authUser.employeeId) : NaN;
  if (Number.isNaN(empId)) {
    return {
      scope: 'manager_no_employee',
      data: {
        ...full,
        employees: [],
        departments: [],
        positions: [],
        leaveRequests: [],
        performanceReviews: [],
        employeeTrainings: [],
        attendanceRecords: [],
        punchRecords: [],
        notifications: [],
        talentMatrix: [],
        successionPlans: [],
        users: stripUserPasswords(
          (full.users || []).filter(
            (u) => String(u.email || '').toLowerCase() === String(authUser.email || '').toLowerCase(),
          ),
        ),
      },
    };
  }

  const visEmp = visibleEmployeeIds(empId, employees);
  const visDept = visibleDepartmentIds(visEmp, employees, full.departments);
  const positions = (full.positions || []).filter((p) => visDept.has(Number(p.departmentId)));

  const empIn = (id) => id != null && visEmp.has(Number(id));

  const filterUsers = (users) => stripUserPasswords(
    (users || []).filter((u) => {
      if (String(u.email || '').toLowerCase() === String(authUser.email || '').toLowerCase()) return true;
      if (u.employeeId != null && visEmp.has(Number(u.employeeId))) return true;
      return false;
    }),
  );

  const recruitKeyInScope = (key) => {
    const parts = String(key).split('-');
    const d = Number(parts[0]);
    const p = Number(parts[1]);
    if (Number.isNaN(d) || Number.isNaN(p)) return false;
    if (!visDept.has(d)) return false;
    return positions.some((x) => Number(x.departmentId) === d && Number(x.id) === p);
  };
  const positionRecruitTags = {};
  Object.entries(full.positionRecruitTags || {}).forEach(([k, v]) => {
    if (recruitKeyInScope(k)) positionRecruitTags[k] = v;
  });
  const recruitmentPositionMetrics = {};
  Object.entries(full.recruitmentPositionMetrics || {}).forEach(([k, v]) => {
    if (recruitKeyInScope(k)) recruitmentPositionMetrics[k] = v;
  });

  const out = {
    ...full,
    hrScopeRootDepartmentId: full.hrScopeRootDepartmentId ?? null,
    employees: employees.filter((e) => visEmp.has(Number(e.id))),
    departments: (full.departments || []).filter((d) => visDept.has(Number(d.id))),
    positions,
    leaveRequests: (full.leaveRequests || []).filter(
      (r) => empIn(r.employeeId) && (r.approverId == null || empIn(r.approverId)),
    ),
    performanceReviews: (full.performanceReviews || []).filter(
      (r) => empIn(r.employeeId) || Number(r.reviewerId) === empId,
    ),
    employeeTrainings: (full.employeeTrainings || []).filter((t) => empIn(t.employeeId)),
    attendanceRecords: (full.attendanceRecords || []).filter((a) => empIn(a.employeeId)),
    punchRecords: (full.punchRecords || []).filter((p) => empIn(p.employeeId)),
    notifications: (full.notifications || []).filter((n) => empIn(n.employeeId)),
    talentMatrix: (full.talentMatrix || []).filter((t) => empIn(t.employeeId)),
    successionPlans: (full.successionPlans || []).filter((s) => {
      const ids = Array.isArray(s.successorIds) ? s.successorIds : [];
      return ids.some((x) => empIn(x));
    }),
    users: filterUsers(full.users),
    positionRecruitTags,
    recruitmentPositionMetrics,
    recruitmentCandidates: [],
    orgChangeRequests: [],
  };

  return { scope: 'manager_subtree', data: out };
}

/**
 * GET 响应：全量或裁剪；始终剔除 users 密码字段。
 * @param {number|null|undefined} scopeRootDeptIdQuery 查询参数 scopeRootDepartmentId（仅 HRBP / 超管生效）
 */
function shapeWorkspaceForReader(rawWorkspace, authUser, scopeRootDeptIdQuery) {
  const base = { ...rawWorkspace };
  const scopeRoot = parseScopeRootDepartmentIdQuery(scopeRootDeptIdQuery);

  if (hasFullWorkspaceAccess(authUser)) {
    const stripped = stripUserPasswordsInWorkspace(base);
    if (scopeRoot != null) {
      const { data, deptScopeMode } = filterWorkspaceByDeptSubtree(stripped, scopeRoot);
      if (deptScopeMode === 'invalid_root') {
        return {
          scope: 'full',
          scopeRootDepartmentId: null,
          data: stripped,
          deptScopeIgnored: scopeRoot,
        };
      }
      if (deptScopeMode === 'dept_subtree') {
        return {
          scope: 'hrbp_dept_subtree',
          scopeRootDepartmentId: scopeRoot,
          data,
        };
      }
    }
    return {
      scope: 'full',
      scopeRootDepartmentId: null,
      data: stripped,
    };
  }
  if (String(authUser.role || '') === 'manager') {
    const shaped = filterWorkspaceForManager(base, authUser);
    return { ...shaped, scopeRootDepartmentId: null };
  }
  return { scope: 'full', scopeRootDepartmentId: null, data: stripUserPasswordsInWorkspace(base) };
}

function stripUserPasswordsInWorkspace(ws) {
  const o = { ...ws };
  if (Array.isArray(o.users)) o.users = stripUserPasswords(o.users);
  return o;
}

module.exports = {
  hasFullWorkspaceAccess,
  shapeWorkspaceForReader,
  visibleEmployeeIds,
  visibleDepartmentIds,
  deptIdsInOrgScope,
  filterWorkspaceByDeptSubtree,
  parseScopeRootDepartmentIdQuery,
};
