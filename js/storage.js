/**
 * localStorage 持久化（非模块，供 file:// 双击打开使用）
 * 业务数据按产品线隔离：键名 tm_L{lineId}_{baseKey}
 */
(function (w) {
  w.TM = w.TM || {};

  const REGISTRY_KEY = 'tm_product_lines';

  w.TM.PRODUCT_LINE_REGISTRY_KEY = REGISTRY_KEY;

  /** 迁移前使用的扁平业务键（不含组织范围，其单独处理） */
  w.TM.LEGACY_DATA_KEYS = [
    'employees', 'departments', 'positions', 'leaveRequests', 'performanceReviews',
    'trainings', 'employeeTrainings', 'users', 'attendanceRules', 'attendanceRecords',
    'punchRecords', 'kpiLibrary', 'performanceCycles', 'talentMatrix', 'successionPlans',
    'notifications', 'positionRecruitTags', 'recruitmentCandidates', 'recruitmentPositionMetrics',
    'recruitmentPipeline', 'interviewerPool', '_seedVersion',
  ];

  w.TM.lineStorageKey = function lineStorageKey(lineId, baseKey) {
    return `tm_L${Number(lineId)}_${baseKey}`;
  };

  w.TM.loadKeyForLine = function loadKeyForLine(lineId, key, fallback) {
    try {
      const raw = localStorage.getItem(w.TM.lineStorageKey(lineId, key));
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  w.TM.saveKeyForLine = function saveKeyForLine(lineId, key, value) {
    localStorage.setItem(w.TM.lineStorageKey(lineId, key), JSON.stringify(value));
  };

  w.TM.loadKey = function loadKey(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  w.TM.saveKey = function saveKey(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  };

  /**
   * 将旧版扁平存储迁入产品线 1；仅执行一次。
   * @returns {boolean} 是否执行了迁移
   */
  w.TM.migrateLegacyStorageToProductLines = function migrateLegacyStorageToProductLines() {
    if (localStorage.getItem(REGISTRY_KEY)) return false;
    const hasLegacy = w.TM.LEGACY_DATA_KEYS.some((k) => localStorage.getItem(k) != null);
    if (!hasLegacy) return false;
    const lineId = 1;
    w.TM.LEGACY_DATA_KEYS.forEach((k) => {
      const raw = localStorage.getItem(k);
      if (raw != null) {
        localStorage.setItem(w.TM.lineStorageKey(lineId, k), raw);
        localStorage.removeItem(k);
      }
    });
    const hrRaw = localStorage.getItem('hrScopeRootDepartmentId');
    if (hrRaw != null) {
      localStorage.setItem(w.TM.lineStorageKey(lineId, 'hrScopeRootDepartmentId'), hrRaw);
      localStorage.removeItem('hrScopeRootDepartmentId');
    }
    const today = new Date().toISOString().slice(0, 10);
    w.TM.saveKey(REGISTRY_KEY, {
      lines: [{ id: lineId, name: '默认产品线', createdAt: today }],
      currentLineId: lineId,
    });
    return true;
  };

  /** 是否尚未写入过当前产品线的员工数据（main 用于决定是否演示 seed） */
  w.TM.lineHasEmployeeStorage = function lineHasEmployeeStorage(lineId) {
    return localStorage.getItem(w.TM.lineStorageKey(lineId, 'employees')) != null;
  };

  /** 删除该产品线下所有 tm_L{id}_* 本地键（不可逆） */
  w.TM.clearLineStorage = function clearLineStorage(lineId) {
    const lid = Number(lineId);
    if (Number.isNaN(lid)) return;
    const prefix = `tm_L${lid}_`;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  };
})(window);
