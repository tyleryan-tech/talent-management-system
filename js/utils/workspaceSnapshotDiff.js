/**
 * 计算两次工作区快照之间的增量 patch（供服务端 /patch 使用）
 */
(function (w) {
  w.TM = w.TM || {};

  const ID_LISTS = [
    { key: 'employees', idKey: 'id' },
    { key: 'departments', idKey: 'id' },
    { key: 'positions', idKey: 'id' },
    { key: 'leaveRequests', idKey: 'id' },
    { key: 'performanceReviews', idKey: 'id' },
    { key: 'trainings', idKey: 'id' },
    { key: 'employeeTrainings', idKey: 'id' },
    { key: 'attendanceRecords', idKey: 'id' },
    { key: 'punchRecords', idKey: 'id' },
    { key: 'kpiLibrary', idKey: 'id' },
    { key: 'performanceCycles', idKey: 'id' },
    { key: 'talentMatrix', idKey: 'employeeId' },
    { key: 'successionPlans', idKey: 'id' },
    { key: 'notifications', idKey: 'id' },
    { key: 'recruitmentCandidates', idKey: 'id' },
    { key: 'orgChangeRequests', idKey: 'id' },
    { key: 'users', idKey: 'id' },
  ];

  const JSON_KEYS = ['attendanceRules', 'orgSettings', 'rosterColumnSettings', 'positionRecruitTags', 'recruitmentPositionMetrics'];

  function stableJson(x) {
    try {
      return JSON.stringify(x);
    } catch {
      return '';
    }
  }

  function diffIdList(prevArr, nextArr, idKey) {
    const prev = Array.isArray(prevArr) ? prevArr : [];
    const next = Array.isArray(nextArr) ? nextArr : [];
    const prevMap = new Map(prev.map((r) => [Number(r[idKey]), r]));
    const nextMap = new Map(next.map((r) => [Number(r[idKey]), r]));
    const removeIds = [];
    prevMap.forEach((_, id) => {
      if (!nextMap.has(id)) removeIds.push(id);
    });
    const upsert = [];
    nextMap.forEach((row, id) => {
      const old = prevMap.get(id);
      if (!old || stableJson(old) !== stableJson(row)) upsert.push(row);
    });
    return { upsert, removeIds };
  }

  /**
   * @param {object} prev 上次同步后的 data（含 hrScopeRootDepartmentId 可与业务字段同层）
   * @param {object} next 当前要提交的 data
   * @returns {object|null} patch 对象；无变化返回 null
   */
  w.TM.buildWorkspacePatch = function buildWorkspacePatch(prev, next) {
    if (!prev || !next) return null;
    const patch = {};

    if (prev.hrScopeRootDepartmentId !== next.hrScopeRootDepartmentId) {
      patch.hrScopeRootDepartmentId = next.hrScopeRootDepartmentId == null ? null : next.hrScopeRootDepartmentId;
    }

    ID_LISTS.forEach(({ key, idKey }) => {
      const d = diffIdList(prev[key], next[key], idKey);
      if (d.removeIds.length || d.upsert.length) {
        patch[key] = {};
        if (d.removeIds.length) patch[key].removeIds = d.removeIds;
        if (d.upsert.length) patch[key].upsert = d.upsert;
      }
    });

    JSON_KEYS.forEach((k) => {
      if (stableJson(prev[k]) !== stableJson(next[k])) {
        patch[k] = next[k];
      }
    });

    return Object.keys(patch).length ? patch : null;
  };
})(window);
