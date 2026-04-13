/**
 * 将增量 patch 合并进完整工作区 JSON（内存中操作，再整包写回 SQLite）。
 */

const { hasFullWorkspaceAccess, visibleEmployeeIds } = require('./workspaceScope');

const ID_COLLECTIONS = [
  ['employees', 'id'],
  ['departments', 'id'],
  ['positions', 'id'],
  ['leaveRequests', 'id'],
  ['performanceReviews', 'id'],
  ['trainings', 'id'],
  ['employeeTrainings', 'id'],
  ['attendanceRecords', 'id'],
  ['punchRecords', 'id'],
  ['kpiLibrary', 'id'],
  ['performanceCycles', 'id'],
  ['talentMatrix', 'employeeId'],
  ['successionPlans', 'id'],
  ['notifications', 'id'],
  ['recruitmentCandidates', 'id'],
  ['orgChangeRequests', 'id'],
];

function applyIdCollectionPatch(arr, spec, idKey) {
  if (!spec) return arr;
  const upsert = Array.isArray(spec.upsert) ? spec.upsert : [];
  const removeIds = Array.isArray(spec.removeIds) ? spec.removeIds : [];
  const map = new Map((Array.isArray(arr) ? arr : []).map((x) => [Number(x[idKey]), { ...x }]));
  removeIds.forEach((rid) => {
    map.delete(Number(rid));
  });
  upsert.forEach((row) => {
    const k = Number(row[idKey]);
    if (!Number.isNaN(k)) map.set(k, { ...row });
  });
  return Array.from(map.values());
}

function applyPatchToWorkspace(workspace, patch) {
  const next = { ...workspace };
  if (patch.hrScopeRootDepartmentId !== undefined) {
    next.hrScopeRootDepartmentId = patch.hrScopeRootDepartmentId;
  }
  ID_COLLECTIONS.forEach(([key, idKey]) => {
    if (patch[key]) {
      next[key] = applyIdCollectionPatch(next[key], patch[key], idKey);
    }
  });
  const scalarReplace = ['attendanceRules', 'orgSettings', 'rosterColumnSettings', 'positionRecruitTags',
    'recruitmentPositionMetrics'];
  scalarReplace.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      next[k] = patch[k];
    }
  });
  if (patch.users) {
    const sanitizedUsers = { ...patch.users };
    if (Array.isArray(sanitizedUsers.upsert)) {
      sanitizedUsers.upsert = sanitizedUsers.upsert.map((u) => {
        const { password, ...rest } = u;
        return rest;
      });
    }
    next.users = applyIdCollectionPatch(next.users, sanitizedUsers, 'id');
  }
  return next;
}

const MANAGER_ALLOWED_PATCH_KEYS = new Set([
  'hrScopeRootDepartmentId',
  'employees',
  'leaveRequests',
  'performanceReviews',
  'employeeTrainings',
  'attendanceRecords',
  'punchRecords',
  'notifications',
  'talentMatrix',
  'successionPlans',
]);

function assertSubset(ids, allowedSet, label) {
  (ids || []).forEach((id) => {
    if (!allowedSet.has(Number(id))) {
      throw new Error(`${label}: id ${id} 超出组织范围`);
    }
  });
}

function validateManagerPatch(patch, authUser, workspaceBefore) {
  const empId = authUser.employeeId != null ? Number(authUser.employeeId) : NaN;
  if (Number.isNaN(empId)) {
    throw new Error('经理账号未绑定员工工号，无法写入');
  }
  const emps = Array.isArray(workspaceBefore.employees) ? workspaceBefore.employees : [];
  const vis = visibleEmployeeIds(empId, emps);

  Object.keys(patch || {}).forEach((k) => {
    if (!MANAGER_ALLOWED_PATCH_KEYS.has(k)) {
      throw new Error(`经理无权修改字段：${k}`);
    }
  });

  if (patch.employees) {
    assertSubset(patch.employees.removeIds, vis, 'employees.removeIds');
    (patch.employees.upsert || []).forEach((e) => {
      if (!vis.has(Number(e.id))) {
        throw new Error(`经理仅能修改下属员工数据：employee ${e.id}`);
      }
    });
  }

  const empIn = (id) => id != null && vis.has(Number(id));

  const checkReview = (r) => {
    if (!empIn(r.employeeId)) throw new Error('绩效记录员工不在管辖范围');
    // reviewer / 审批链可能涉及 HRBP，仅约束被评估人在下属范围内
  };

  (patch.performanceReviews?.upsert || []).forEach(checkReview);
  (patch.leaveRequests?.upsert || []).forEach((r) => {
    if (!empIn(r.employeeId)) throw new Error('请假员工不在管辖范围');
    if (r.approverId != null && !empIn(r.approverId)) throw new Error('请假审批人不在管辖范围');
  });
  (patch.employeeTrainings?.upsert || []).forEach((t) => {
    if (!empIn(t.employeeId)) throw new Error('培训记录员工不在管辖范围');
  });
  (patch.attendanceRecords?.upsert || []).forEach((a) => {
    if (!empIn(a.employeeId)) throw new Error('考勤员工不在管辖范围');
  });
  (patch.punchRecords?.upsert || []).forEach((p) => {
    if (!empIn(p.employeeId)) throw new Error('打卡员工不在管辖范围');
  });
  (patch.notifications?.upsert || []).forEach((n) => {
    if (!empIn(n.employeeId)) throw new Error('通知员工不在管辖范围');
  });
  (patch.talentMatrix?.upsert || []).forEach((t) => {
    if (!empIn(t.employeeId)) throw new Error('九宫格员工不在管辖范围');
  });
  (patch.successionPlans?.upsert || []).forEach((s) => {
    if (!empIn(s.employeeId)) throw new Error('继任主体员工不在管辖范围');
    (s.successorIds || []).forEach((sid) => {
      if (!empIn(sid)) throw new Error('继任候选人不在管辖范围');
    });
  });
}

function validateAndApplyPatch(workspace, patch, authUser) {
  if (hasFullWorkspaceAccess(authUser)) {
    return applyPatchToWorkspace(workspace, patch);
  }
  if (String(authUser.role || '') === 'manager') {
    validateManagerPatch(patch, authUser, workspace);
    return applyPatchToWorkspace(workspace, patch);
  }
  throw new Error('无权修改工作区');
}

module.exports = {
  applyPatchToWorkspace,
  validateAndApplyPatch,
  applyIdCollectionPatch,
};
