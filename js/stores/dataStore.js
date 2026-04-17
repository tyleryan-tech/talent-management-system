/**
 * 全局业务数据：从 localStorage 加载，变更后写回（非模块）
 */
(function () {
  const { defineStore } = Pinia;
  const loadKey = window.TM.loadKey;
  const saveKey = window.TM.saveKey;

function uid(list, idKey = 'id') {
  const max = (list || []).reduce((m, x) => Math.max(m, Number(x[idKey]) || 0), 0);
  return max + 1;
}

const RECRUIT_PRIORITIES = ['high', 'medium', 'low'];

/** 将 localStorage 中的待招标记规范为 { priority }，忽略无效项 */
function normalizeRecruitTagValue(v) {
  if (v === true) return { priority: 'medium' };
  if (v && typeof v === 'object') {
    const p = RECRUIT_PRIORITIES.includes(v.priority) ? v.priority : 'medium';
    return { priority: p };
  }
  return null;
}

function normalizePositionRecruitTagsMap(tags) {
  const out = {};
  Object.keys(tags || {}).forEach((k) => {
    const n = normalizeRecruitTagValue(tags[k]);
    if (n) out[k] = n;
  });
  return out;
}

function parseClock(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function dailyStandardHours(start, end) {
  const a = parseClock(start || '09:00');
  const b = parseClock(end || '18:00');
  if (a == null || b == null || b <= a) return 8;
  return (b - a) / 60;
}

function hoursBetween(inStr, outStr) {
  const a = parseClock(inStr);
  const b = parseClock(outStr);
  if (a == null || b == null) return 0;
  let diff = (b - a) / 60;
  if (diff < 0) diff += 24;
  return diff;
}

/** 根据「日均工时」导入值写回负荷比、折算月总工时（与标准日工时对比） */
function applyAvgDailyHoursToAttendanceRow(row, rules) {
  const workDays = Number(rules.monthlyStandardDays) || 20;
  const low = rules.loadBandLow != null ? Number(rules.loadBandLow) : 0.88;
  const high = rules.loadBandHigh != null ? Number(rules.loadBandHigh) : 1.12;
  const dailyStd = dailyStandardHours(rules.workStart, rules.workEnd);
  const expectedMonthHours = workDays * dailyStd;
  const adh = Number(row.avgDailyHours);
  if (Number.isNaN(adh) || adh < 0) return;
  row.workDays = workDays;
  row.expectedMonthHours = Math.round(expectedMonthHours * 10) / 10;
  row.actualWorkHours = Math.round(adh * workDays * 10) / 10;
  const ratio = dailyStd > 0 ? adh / dailyStd : 0;
  row.loadRatio = Math.round(ratio * 1000) / 1000;
  row.loadTier = ratio < low ? 'under' : ratio > high ? 'over' : 'normal';
}

function dedupeTalentMatrix(rows) {
  const m = new Map();
  (rows || []).forEach((x) => {
    const id = Number(x.employeeId);
    if (Number.isNaN(id)) return;
    m.set(id, {
      employeeId: id,
      performance: String(x.performance ?? '').trim(),
      potential: String(x.potential ?? '').trim(),
      developmentPlan: String(x.developmentPlan ?? '').trim(),
    });
  });
  return Array.from(m.values());
}

const EMPLOYEE_EXTRA_DEFAULTS = {
  gradSchool: '',
  careerStartDate: '',
  levelStartDate: '',
  managementPlan: '',
  /** 组织内角色：IC / PIC / RM，与系统登录角色（hrbp/manager）区分 */
  orgRole: '',
  /** 薪资段位：below_min | p25 | p50 | p75 | above_max */
  salaryBand: '',
  /** 年龄（岁）；空则花名册可按生日推算 */
  age: null,
};

function jobTradesList() {
  const t = window.TM.JOB_TRADES;
  if (Array.isArray(t) && t.length) return t;
  console.warn('[dataStore] TM.JOB_TRADES not loaded, using fallback');
  return ['Frontend', 'Mobile', 'Backend', 'SDET', 'QA', 'Algorithm', 'Big Data'];
}

/** Legacy Chinese trade labels from imports / old persisted data → canonical English */
const LEGACY_JOB_TRADE_MAP = {
  前端: 'Frontend',
  移动端: 'Mobile',
  后端: 'Backend',
  测开: 'SDET',
  测试: 'QA',
  算法: 'Algorithm',
  大数据: 'Big Data',
};

const DEFAULT_JOB_LEVEL = 'EE';

const LEGACY_LEVEL_MAP = {
  P1: 'E',
  P2: 'SE',
  P3: 'EE',
  P4: 'SEE',
  P5: 'AM',
  P6: 'M',
  P7: 'PE',
  P8: 'SM',
  P9: 'SM',
};

function jobLevelsList() {
  const t = window.TM.JOB_LEVELS;
  return Array.isArray(t) && t.length
    ? t
    : ['E', 'SE', 'EE', 'SEE', 'AM', 'M', 'PE', 'SM'];
}

/** 将编制职级规范为 TM.JOB_LEVELS 之一；未知或旧 P 序列按映射/默认处理 */
function normalizeJobLevel(level) {
  const levels = jobLevelsList();
  const s = String(level || '').trim();
  if (levels.includes(s)) return s;
  const legacy = LEGACY_LEVEL_MAP[String(s).toUpperCase()];
  if (legacy && levels.includes(legacy)) return legacy;
  return DEFAULT_JOB_LEVEL;
}

/** 将编制名称规范为七种工种之一（未知名称按哈希稳定映射） */
function normalizeJobTradeName(name) {
  const trades = jobTradesList();
  const s = String(name || '').trim();
  if (trades.includes(s)) return s;
  const legacy = LEGACY_JOB_TRADE_MAP[s];
  if (legacy && trades.includes(legacy)) return legacy;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return trades[Math.abs(h) % trades.length];
}

function lineScopedLoad(key, fallback) {
  const pl = window.TM.useProductLineStore?.();
  const lid = pl?.currentLineId;
  if (lid == null) return loadKey(key, fallback);
  return window.TM.loadKeyForLine(lid, key, fallback);
}

function lineScopedSave(key, value) {
  const pl = window.TM.useProductLineStore?.();
  const lid = pl?.currentLineId;
  if (lid == null) {
    saveKey(key, value);
    return;
  }
  window.TM.saveKeyForLine(lid, key, value);
}

let _persistTimer = null;
const _dirtyKeys = new Set();

function schedulePersistAll(store, options) {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    store._doPersistAll(options);
  }, 300);
}

const ALL_PERSIST_KEYS = [
  'employees', 'departments', 'positions', 'leaveRequests', 'performanceReviews',
  'trainings', 'employeeTrainings', 'attendanceRules', 'attendanceRecords',
  'punchRecords', 'kpiLibrary', 'performanceCycles', 'talentMatrix', 'successionPlans',
  'notifications', 'positionRecruitTags', 'recruitmentCandidates',
  'recruitmentPositionMetrics', 'recruitmentPipeline', 'interviewerPool',
  'orgSettings', 'orgChangeRequests', 'rosterColumnSettings',
];

const GLOBAL_USERS_KEY = 'tm_global_users';

function globalLoadUsers() {
  try {
    if (window.TM._idb && !window.TM._idb.isFallback() && window.TM._idb.isReady()) {
      const val = window.TM._idb.loadKey(GLOBAL_USERS_KEY, null);
      if (val != null) return val;
    }
    const raw = localStorage.getItem(GLOBAL_USERS_KEY);
    if (raw != null) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  return null;
}

function globalSaveUsers(users) {
  try {
    const out = (users || []).map(function (u) {
      if (!u.password || u._hashed) return u;
      return Object.assign({}, u, { password: _simpleHash(u.password), _hashed: true });
    });
    localStorage.setItem(GLOBAL_USERS_KEY, JSON.stringify(out));
    if (window.TM._idb && window.TM._idb.saveKey && !window.TM._idb.isFallback()) {
      window.TM._idb.saveKey(GLOBAL_USERS_KEY, out);
    }
  } catch (_) { /* ignore */ }
}
function _simpleHash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return 'h$' + (h >>> 0).toString(36);
}
window.TM._simpleHash = _simpleHash;

function migratePerLineUsersToGlobal() {
  if (globalLoadUsers() != null) return;
  const pl = window.TM.useProductLineStore?.();
  if (!pl) return;
  const merged = new Map();
  (pl.lines || []).forEach((line) => {
    const lineUsers = window.TM.loadKeyForLine(line.id, 'users', null);
    if (!Array.isArray(lineUsers)) return;
    lineUsers.forEach((u) => {
      const key = String(u.email || u.username || u.id).toLowerCase();
      if (!merged.has(key)) {
        merged.set(key, { ...u });
      } else {
        const existing = merged.get(key);
        if (u.superAdmin && !existing.superAdmin) merged.set(key, { ...u });
      }
    });
  });
  if (merged.size > 0) {
    let nextId = 1;
    const result = [];
    merged.forEach((u) => {
      u.id = nextId++;
      result.push(u);
    });
    globalSaveUsers(result);
  }
}

/** 域注册表：将 state key 映射到业务域名称 */
const DOMAIN_REGISTRY = (() => {
  const domains = window.TM._domains || {};
  const keyToDomain = {};
  Object.entries(domains).forEach(([domainName, def]) => {
    (def.stateKeys || []).forEach((k) => { keyToDomain[k] = domainName; });
  });
  return { domains, keyToDomain };
})();

/** 获取某个 state key 所属的业务域 */
function getDomainForKey(key) {
  return DOMAIN_REGISTRY.keyToDomain[key] || 'unknown';
}

/** 获取所有业务域名称列表 */
function getAllDomains() {
  return Object.keys(DOMAIN_REGISTRY.domains);
}

/** 按域获取 dirty keys 分组 */
function groupDirtyKeysByDomain(dirtyKeys) {
  const groups = {};
  dirtyKeys.forEach((k) => {
    const domain = getDomainForKey(k);
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(k);
  });
  return groups;
}

function countLate(list, workStart) {
  const ws = parseClock(workStart || '09:30');
  if (ws == null) return 0;
  let n = 0;
  (list || []).forEach((p) => {
    const t = parseClock(p.clockIn);
    if (t != null && t > ws) n += 1;
  });
  return n;
}

/** 演示账号补全登录邮箱，与「邮箱登录」产品规则对齐；旧数据导入后同样生效 */
function normalizeUsersWithDemoEmails(users) {
  const demoLoginEmail = { hrbp: 'hrbp@company.com', manager: 'manager@company.com' };
  let changed = false;
  const next = (users || []).map((u) => {
    if (String(u.email || '').trim()) return u;
    const un = String(u.username || '').trim();
    const em = demoLoginEmail[un];
    if (!em) return u;
    changed = true;
    return { ...u, email: em };
  });
  return { users: next, changed };
}

window.TM.useDataStore = defineStore('data', {
  state: () => ({
    employees: [],
    departments: [],
    positions: [],
    leaveRequests: [],
    performanceReviews: [],
    trainings: [],
    employeeTrainings: [],
    users: [],
    attendanceRules: {},
    attendanceRecords: [],
    punchRecords: [],
    kpiLibrary: [],
    performanceCycles: [],
    talentMatrix: [],
    successionPlans: [],
    notifications: [],
    /** 空岗「待招」标记，key 为 `部门id-编制id`，值为 { priority: high|medium|low } */
    positionRecruitTags: {},
    /** 招聘候选人明细（Excel 导入） */
    recruitmentCandidates: [],
    /** 岗位招聘过程指标，key 同待招 `部门id-编制id` */
    recruitmentPositionMetrics: {},
    /** 候选人 pipeline（表格化跟踪，可内联编辑/Excel 导入） */
    recruitmentPipeline: [],
    /** 面试官池：[{ id, employeeId, trades:[], levels:[] }] */
    interviewerPool: [],
    /** 产品线负责人工号（组织调整审批链最后一位） */
    orgSettings: { productLineHeadEmployeeId: null },
    /** 组织调整审批单 */
    orgChangeRequests: [],
    /** 花名册列：顺序、显隐、表头覆盖（按产品线持久化） */
    rosterColumnSettings: null,
  }),
  actions: {
    hydrate() {
      if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
      _dirtyKeys.clear();
      const rawEmps = lineScopedLoad('employees', []);
      {
        const seen = new Set();
        const deduped = [];
        (rawEmps || []).forEach((e) => {
          const id = Number(e.id);
          if (Number.isNaN(id) || seen.has(id)) return;
          seen.add(id);
          deduped.push({ ...EMPLOYEE_EXTRA_DEFAULTS, ...e });
        });
        this.employees = deduped;
        if (deduped.length !== (rawEmps || []).length) {
          console.warn(`[dataStore] 员工去重: ${(rawEmps || []).length} → ${deduped.length}`);
          lineScopedSave('employees', deduped);
        }
      }
      this.departments = (lineScopedLoad('departments', []) || []).map((d) => ({ hcPlan: 0, ...d }));
      {
        const rawPos = lineScopedLoad('positions', []) || [];
        let posChanged = false;
        this.positions = rawPos.map((p) => {
          const nn = normalizeJobTradeName(p.name);
          const nl = normalizeJobLevel(p.level);
          if (nn !== String(p.name || '').trim() || nl !== String(p.level || '').trim()) posChanged = true;
          return { ...p, name: nn, level: nl };
        });
        if (posChanged) {
          try {
            lineScopedSave('positions', this.positions);
          } catch (_) {
            /* ignore */
          }
        }
      }
      this.leaveRequests = lineScopedLoad('leaveRequests', []);
      this.performanceReviews = lineScopedLoad('performanceReviews', []);
      this.trainings = lineScopedLoad('trainings', []);
      this.employeeTrainings = lineScopedLoad('employeeTrainings', []);
      {
        migratePerLineUsersToGlobal();
        const rawUsers = globalLoadUsers() || lineScopedLoad('users', []) || [];
        const { users: nu, changed: usersNorm } = normalizeUsersWithDemoEmails(rawUsers);
        this.users = nu;
        if (usersNorm) {
          try {
            globalSaveUsers(this.users);
          } catch (_) {
            /* ignore */
          }
        }
      }
      this.attendanceRules = lineScopedLoad('attendanceRules', {});
      this.attendanceRecords = lineScopedLoad('attendanceRecords', []);
      this.punchRecords = lineScopedLoad('punchRecords', []);
      this.kpiLibrary = lineScopedLoad('kpiLibrary', []);
      this.performanceCycles = (lineScopedLoad('performanceCycles', []) || []).map((c) => ({
        ...c,
        cycleType: c.cycleType === 'year' || c.cycleType === 'half_year'
          ? c.cycleType
          : (String(c.name || '').includes('年度') ? 'year' : 'half_year'),
      }));
      if (window.TM.normalizePerformanceReviewsStore) {
        window.TM.normalizePerformanceReviewsStore(this);
      }
      {
        const rawTm = lineScopedLoad('talentMatrix', []);
        const dedupedTm = dedupeTalentMatrix(rawTm);
        this.talentMatrix = dedupedTm;
        try {
          if (JSON.stringify(dedupedTm) !== JSON.stringify(rawTm)) {
            lineScopedSave('talentMatrix', dedupedTm);
          }
        } catch (_) {
          /* ignore */
        }
      }
      this.successionPlans = lineScopedLoad('successionPlans', []);
      this.notifications = lineScopedLoad('notifications', []);
      {
        const rawTags = lineScopedLoad('positionRecruitTags', {}) || {};
        const norm = normalizePositionRecruitTagsMap(rawTags);
        this.positionRecruitTags = norm;
        try {
          if (JSON.stringify(norm) !== JSON.stringify(rawTags)) {
            lineScopedSave('positionRecruitTags', norm);
          }
        } catch (_) {
          /* ignore */
        }
      }
      this.recruitmentCandidates = lineScopedLoad('recruitmentCandidates', []);
      this.recruitmentPositionMetrics = lineScopedLoad('recruitmentPositionMetrics', {}) || {};
      this.recruitmentPipeline = lineScopedLoad('recruitmentPipeline', []);
      this.interviewerPool = lineScopedLoad('interviewerPool', []) || [];
      this.orgSettings = {
        productLineHeadEmployeeId: null,
        ...(lineScopedLoad('orgSettings', {}) || {}),
      };
      this.orgChangeRequests = lineScopedLoad('orgChangeRequests', []) || [];
      this.rosterColumnSettings = window.TM.normalizeRosterColumnSettings(
        lineScopedLoad('rosterColumnSettings', null) || undefined,
      );
      this.syncEmployeeLinkedDataFromRoster();
      try {
        this.persistAllSync();
      } catch (_) {
        /* ignore */
      }
    },
    _doPersistAll(options) {
      const skipRemote = options && options.skipRemote === true;
      const allDirty = [..._dirtyKeys];
      const keysToWrite = allDirty.length > 0 ? allDirty.filter((k) => ALL_PERSIST_KEYS.includes(k)) : ALL_PERSIST_KEYS;
      const usersNeedWrite = allDirty.includes('users') || _dirtyKeys.size === 0;
      _dirtyKeys.clear();
      const OBJ_KEYS = new Set(['positionRecruitTags', 'attendanceRules', 'orgSettings', 'recruitmentPositionMetrics']);
      keysToWrite.forEach((k) => {
        lineScopedSave(k, this[k] ?? (OBJ_KEYS.has(k) ? {} : []));
      });
      if (usersNeedWrite) {
        globalSaveUsers(this.users || []);
      }
      if (window.TM._DEBUG_PERSIST) {
        const groups = groupDirtyKeysByDomain(keysToWrite);
        console.debug('[dataStore] persist domains:', groups);
      }
      const ss = window.TM.serverSync;
      if (ss && ss.isEnabled && ss.isEnabled() && ss.getToken && ss.getToken() && !skipRemote && !ss.isApplyingRemote) {
        if (typeof ss.scheduleWorkspacePush === 'function') ss.scheduleWorkspacePush();
      }
    },
    _markDirty(...keys) {
      keys.forEach((k) => _dirtyKeys.add(k));
    },
    persistAll(options) {
      if (_dirtyKeys.size === 0) return;
      schedulePersistAll(this, options);
    },
    persistAllForce(options) {
      ALL_PERSIST_KEYS.forEach((k) => _dirtyKeys.add(k));
      _dirtyKeys.add('users');
      schedulePersistAll(this, options);
    },
    persistAllSync(options) {
      if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
      if (_dirtyKeys.size === 0) return;
      this._doPersistAll(options);
    },
    /**
     * 产品线切换前：同步写入当前线全部脏数据，然后清空脏标记和防抖定时器。
     * 必须在 currentLineId 改变之前调用，否则数据会写入错误产品线。
     */
    flushBeforeLineSwitch() {
      if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
      if (_dirtyKeys.size > 0) {
        this._doPersistAll({ skipRemote: true });
      }
      _dirtyKeys.clear();
    },
    persistKeys(...keys) {
      keys.forEach((k) => {
        if (k === 'users') { globalSaveUsers(this.users || []); return; }
        if (ALL_PERSIST_KEYS.includes(k)) lineScopedSave(k, this[k] ?? []);
      });
    },
    /**
     * 以花名册为权威：清理无效员工引用；在职/试用若无九宫格则补默认 B/M；离职从九宫格移除；
     * 同步裁剪绩效、请假、培训、通知、考勤、打卡、继任备选人及用户绑定工号。
     */
    syncEmployeeLinkedDataFromRoster() {
      const emps = this.employees || [];
      const empIds = new Set(emps.map((e) => Number(e.id)).filter((id) => !Number.isNaN(id)));
      const activeIds = new Set(
        emps.filter((e) => e.status !== 'leave').map((e) => Number(e.id)).filter((id) => !Number.isNaN(id)),
      );
      const perfOk = (p) => ['A', 'B', 'C'].includes(String(p || '').trim());
      const potOk = (p) => ['H', 'M', 'L'].includes(String(p || '').trim());

      let tm = dedupeTalentMatrix(this.talentMatrix)
        .filter((x) => empIds.has(Number(x.employeeId)))
        .filter((x) => activeIds.has(Number(x.employeeId)))
        .map((x) => ({
          employeeId: Number(x.employeeId),
          performance: perfOk(x.performance) ? String(x.performance).trim() : 'B',
          potential: potOk(x.potential) ? String(x.potential).trim() : 'M',
          developmentPlan: String(x.developmentPlan ?? '').trim(),
        }));
      const inTm = new Set(tm.map((x) => x.employeeId));
      activeIds.forEach((id) => {
        if (!inTm.has(id)) {
          tm.push({ employeeId: id, performance: 'B', potential: 'M', developmentPlan: '' });
          inTm.add(id);
        }
      });
      this.talentMatrix = dedupeTalentMatrix(tm);

      this.performanceReviews = (this.performanceReviews || []).filter((r) =>
        empIds.has(Number(r.employeeId)) || r.status === 'finalized' || r.status === 'pl_approved',
      );
      this.leaveRequests = (this.leaveRequests || []).filter(
        (r) => empIds.has(Number(r.employeeId)) && (r.approverId == null || empIds.has(Number(r.approverId))),
      );
      this.employeeTrainings = (this.employeeTrainings || []).filter(
        (t) => empIds.has(Number(t.employeeId)) && (t.recommendedBy == null || empIds.has(Number(t.recommendedBy))),
      );
      this.notifications = (this.notifications || []).filter((n) => empIds.has(Number(n.employeeId)));
      this.attendanceRecords = (this.attendanceRecords || []).filter((a) => empIds.has(Number(a.employeeId)));
      this.punchRecords = (this.punchRecords || []).filter((p) => empIds.has(Number(p.employeeId)));
      this.successionPlans = (this.successionPlans || []).map((s) => ({
        ...s,
        successorIds: (s.successorIds || []).filter((id) => empIds.has(Number(id))),
      }));
      // users 是全局存储，不因当前产品线缺少某员工就清除 employeeId；
      // 仅在员工被从所有产品线彻底删除时（手动操作）才解绑。
      this.interviewerPool = (this.interviewerPool || []).filter((p) => empIds.has(Number(p.employeeId)));
      if (this.recruitmentCandidates && this.recruitmentCandidates.length) {
        this.recruitmentCandidates = this.recruitmentCandidates.map((c) => {
          const patch = {};
          if (c.responsibleId != null && !empIds.has(Number(c.responsibleId))) patch.responsibleId = null;
          if (c.interviewerId != null && !empIds.has(Number(c.interviewerId))) patch.interviewerId = null;
          return Object.keys(patch).length ? { ...c, ...patch } : c;
        });
      }
      this._markDirty('talentMatrix', 'performanceReviews', 'leaveRequests',
        'employeeTrainings', 'notifications', 'attendanceRecords', 'punchRecords',
        'successionPlans', 'interviewerPool', 'recruitmentCandidates');
    },
    // 员工
    addEmployee(row) {
      const id = uid(this.employees);
      this.employees.push({ ...EMPLOYEE_EXTRA_DEFAULTS, ...row, id });
      this.syncEmployeeLinkedDataFromRoster();
      this._markDirty('employees', 'talentMatrix', 'notifications');
      this.persistAll();
      return id;
    },
    /**
     * HRBP 批量新增：合并默认字段，工号冲突时自动顺延新号；一次 sync/persist，各模块随 Pinia 与 persist 同步。
     */
    addEmployeesBatch(rows) {
      if (!rows || !rows.length) return { added: 0, ids: [] };
      const addedIds = [];
      let maxId = this.employees.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);
      const existingIds = new Set(this.employees.map((e) => Number(e.id)));
      rows.forEach((raw) => {
        const merged = { ...EMPLOYEE_EXTRA_DEFAULTS, ...raw };
        let id = Number(merged.id);
        if (!id || Number.isNaN(id) || existingIds.has(id)) {
          maxId += 1;
          id = maxId;
          while (existingIds.has(id)) {
            maxId += 1;
            id = maxId;
          }
        } else {
          maxId = Math.max(maxId, id);
        }
        existingIds.add(id);
        const { id: _omit, ...rest } = merged;
        this.employees.push({ ...rest, id });
        addedIds.push(id);
      });
      this.syncEmployeeLinkedDataFromRoster();
      this._markDirty('employees', 'talentMatrix', 'notifications');
      this.persistAll();
      const deptSet = new Set(this.departments.map((d) => d.id));
      const posSet = new Set(this.positions.map((p) => p.id));
      let fkWarn = 0;
      addedIds.forEach((id) => {
        const e = this.employees.find((x) => x.id === id);
        if (!e) return;
        if (e.departmentId && !deptSet.has(Number(e.departmentId))) fkWarn++;
        if (e.positionId && !posSet.has(Number(e.positionId))) fkWarn++;
      });
      if (fkWarn > 0) {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: fkWarn + ' 条导入记录包含无效的部门或岗位引用，请核查', type: 'warning' } }));
      }
      return { added: addedIds.length, ids: addedIds };
    },
    /**
     * HRBP 从花名册彻底删除员工（非仅离职）：清理部门负责人、汇报关系、产品线负责人引用，并 sync 裁剪各模块数据。
     */
    removeEmployeesByIds(rawIds) {
      const ids = new Set(
        (rawIds || [])
          .map((x) => Number(x))
          .filter((x) => !Number.isNaN(x)),
      );
      if (!ids.size) return { removed: 0 };
      this.departments = (this.departments || []).map((d) =>
        d.managerId != null && ids.has(Number(d.managerId)) ? { ...d, managerId: null } : d,
      );
      const owner = this.orgSettings?.productLineHeadEmployeeId;
      if (owner != null && ids.has(Number(owner))) {
        this.orgSettings = { ...this.orgSettings, productLineHeadEmployeeId: null };
      }
      const before = (this.employees || []).length;
      this.employees = (this.employees || [])
        .filter((e) => !ids.has(Number(e.id)))
        .map((e) =>
          e.managerId != null && ids.has(Number(e.managerId)) ? { ...e, managerId: null } : e,
        );
      const removed = before - this.employees.length;
      this.syncEmployeeLinkedDataFromRoster();
      this._markDirty('employees', 'talentMatrix', 'performanceReviews', 'notifications',
        'attendanceRecords', 'punchRecords', 'leaveRequests', 'employeeTrainings', 'successionPlans', 'orgSettings');
      this.persistAll();
      return { removed };
    },
    updateEmployee(id, patch) {
      const i = this.employees.findIndex((e) => e.id === id);
      if (i >= 0) {
        const warnings = this._validateEmployeeFKs(patch);
        if (warnings.length) {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: warnings.join('；'), type: 'warning' } }));
        }
        const oldManagerId = this.employees[i].managerId;
        this.employees[i] = { ...this.employees[i], ...patch };
        this.syncEmployeeLinkedDataFromRoster();
        this._markDirty('employees');
        if (patch.managerId != null && Number(patch.managerId) !== Number(oldManagerId)) {
          this._rebuildPendingApprovalChains(id);
        }
        this.persistAll();
      }
    },
    setEmployeeStatus(id, status) {
      this.updateEmployee(id, { status });
    },
    addDepartment(row) {
      const id = uid(this.departments);
      this.departments.push({ ...row, id, hcPlan: Number(row.hcPlan) || 0 });
      this._markDirty('departments');
      this.persistAll();
      return id;
    },
    updateDeptHcPlan(id, val) {
      const i = this.departments.findIndex((d) => d.id === id);
      if (i < 0) return;
      this.departments[i] = { ...this.departments[i], hcPlan: Math.max(0, Number(val) || 0) };
      this._markDirty('departments');
      this.persistAll();
    },
    updateDepartment(id, patch) {
      const i = this.departments.findIndex((d) => d.id === id);
      if (i >= 0) {
        const oldName = this.departments[i].name;
        this.departments[i] = { ...this.departments[i], ...patch };
        const newName = this.departments[i].name;
        if (oldName && newName && oldName !== newName) {
          const oldLower = oldName.trim().toLowerCase();
          (this.recruitmentPipeline || []).forEach((c) => {
            if (String(c.team || '').trim().toLowerCase() === oldLower) {
              c.team = newName;
            }
          });
          this._markDirty('departments', 'recruitmentPipeline');
        }
        this.persistAll();
      }
    },
    removeDepartment(id) {
      const did = Number(id);
      const next = { ...(this.positionRecruitTags || {}) };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${did}-`)) delete next[k];
      });
      this.positionRecruitTags = next;
      const parent = this.departments.find((d) => d.id === did)?.parentId || null;
      this.departments.filter((d) => d.parentId === did).forEach((child) => {
        child.parentId = parent;
      });
      this.departments = this.departments.filter((d) => d.id !== did);
      const fallbackDeptId = parent != null ? parent : (this.departments[0]?.id || null);
      this.employees.forEach((e) => {
        if (Number(e.departmentId) === did) e.departmentId = fallbackDeptId;
      });
      this.positions = this.positions.filter((p) => p.departmentId !== did);
      this._markDirty('departments', 'employees', 'positions', 'positionRecruitTags');
      this.persistAll();
    },
    addPosition(row) {
      const trades = jobTradesList();
      const depId = Number(row.departmentId);
      if (Number.isNaN(depId)) return null;
      let name = normalizeJobTradeName(row.name);
      if (!trades.includes(name)) name = trades[0];
      const id = uid(this.positions);
      this.positions.push({
        id,
        name,
        level: normalizeJobLevel(row.level),
        departmentId: depId,
        reportingManagerId: row.reportingManagerId || null,
      });
      this._markDirty('positions');
      this.persistAll();
      return id;
    },
    updatePosition(id, patch) {
      const i = this.positions.findIndex((p) => p.id === id);
      if (i < 0) return false;
      const trades = jobTradesList();
      const merged = { ...this.positions[i], ...patch };
      const name = normalizeJobTradeName(merged.name);
      if (!trades.includes(name)) return false;
      const depId = Number(merged.departmentId);
      if (Number.isNaN(depId)) return false;
      const oldName = this.positions[i].name;
      const oldRmId = this.positions[i].reportingManagerId || null;
      const newRmId = merged.reportingManagerId ? Number(merged.reportingManagerId) : null;
      this.positions[i] = {
        ...merged,
        id: this.positions[i].id,
        name,
        departmentId: depId,
        level: normalizeJobLevel(merged.level),
        reportingManagerId: newRmId,
      };
      if (newRmId && newRmId !== oldRmId) {
        this.employees.forEach((e) => {
          if (Number(e.positionId) === id && Number(e.departmentId) === depId && !e.managerId) {
            e.managerId = newRmId;
          }
        });
        this._markDirty('employees');
      }
      if (oldName && name && oldName !== name) {
        const oldLower = oldName.trim().toLowerCase();
        (this.recruitmentPipeline || []).forEach((c) => {
          if (String(c.position || '').trim().toLowerCase() === oldLower) {
            c.position = name;
          }
        });
        (this.interviewerPool || []).forEach((iv) => {
          if (String(iv.jobTrade || '').trim().toLowerCase() === oldLower) {
            iv.jobTrade = name;
          }
        });
        this._markDirty('positions', 'recruitmentPipeline', 'interviewerPool');
      }
      this.persistAll();
      return true;
    },
    removePosition(id) {
      const pid = Number(id);
      const pos = this.positions.find((p) => p.id === pid);
      const posName = pos?.name;
      const next = { ...(this.positionRecruitTags || {}) };
      Object.keys(next).forEach((k) => {
        if (k.endsWith(`-${pid}`)) delete next[k];
      });
      this.positionRecruitTags = next;
      this.positions = this.positions.filter((p) => p.id !== pid);
      this.employees.forEach((e) => {
        if (Number(e.positionId) === pid) e.positionId = null;
      });
      if (posName) {
        const nameLower = posName.trim().toLowerCase();
        this.interviewerPool = (this.interviewerPool || []).filter((iv) =>
          String(iv.jobTrade || '').trim().toLowerCase() !== nameLower);
      }
      this._markDirty('positions', 'employees', 'positionRecruitTags', 'interviewerPool');
      this.persistAll();
    },
    updateOrgSettings(patch) {
      this.orgSettings = { ...this.orgSettings, ...patch };
      this._markDirty('orgSettings');
      this.persistAll();
    },
    /**
     * 提交组织调整审批。
     * submitter: { role, employeeId } — 当前操作人。
     * HRBP / super_admin / 产品线负责人 → 免审批（自动生效）；
     * 汇报经理 → 走审批链。
     */
    submitOrgChangeRequest({ type, title, payload, submitter }) {
      const TM = window.TM;
      const sub = submitter || {};
      const isHrbpOrAdmin = sub.role === 'hrbp' || sub.role === 'super_admin';
      const own = this.orgSettings?.productLineHeadEmployeeId;
      const isOwner = own != null && own !== '' && Number(sub.employeeId) === Number(own);
      const skipApproval = isHrbpOrAdmin || isOwner;
      const chain = skipApproval
        ? []
        : (TM.buildOrgApprovalChain ? TM.buildOrgApprovalChain(this, type, payload) : []);
      const id = uid(this.orgChangeRequests);
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const row = {
        id,
        type,
        title: String(title || ''),
        payload: JSON.parse(JSON.stringify(payload)),
        status: 'pending',
        approvalStep: 0,
        approvalChain: chain,
        pendingApproverId: chain[0] ?? null,
        submittedAt: now,
        submitterRole: sub.role || '',
        log: [],
      };
      if (!chain.length) {
        try {
          this.applyOrgChangeRequestPayload(type, row.payload);
        } catch (err) {
          console.error(err);
          return null;
        }
        row.status = 'approved';
        row.pendingApproverId = null;
        row.log = [{ action: 'auto', at: now, note: skipApproval ? 'HRBP/负责人操作，免审批' : '无审批人链，已自动生效' }];
      }
      this.orgChangeRequests = [...(this.orgChangeRequests || []), row];
      this._markDirty('orgChangeRequests');
      this.persistAll();
      return row;
    },
    approveOrgChangeRequest(requestId, approverEmployeeId) {
      const i = (this.orgChangeRequests || []).findIndex((x) => x.id === requestId);
      if (i < 0) return false;
      const r = this.orgChangeRequests[i];
      if (r.status !== 'pending' || Number(r.pendingApproverId) !== Number(approverEmployeeId)) return false;
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const log = [...(r.log || []), { approverEmployeeId: Number(approverEmployeeId), action: 'approve', at: now }];
      const step = (r.approvalStep || 0) + 1;
      const chain = r.approvalChain || [];
      if (step >= chain.length) {
        try {
          this.applyOrgChangeRequestPayload(r.type, r.payload);
        } catch (err) {
          console.error(err);
          return false;
        }
        const next = { ...r, status: 'approved', approvalStep: step, pendingApproverId: null, log };
        const arr = [...this.orgChangeRequests];
        arr[i] = next;
        this.orgChangeRequests = arr;
        this._markDirty('orgChangeRequests');
        this.persistAll();
        return true;
      }
      const next = {
        ...r,
        approvalStep: step,
        pendingApproverId: chain[step],
        log,
      };
      const arr = [...this.orgChangeRequests];
      arr[i] = next;
      this.orgChangeRequests = arr;
      this._markDirty('orgChangeRequests');
      this.persistAll();
      return true;
    },
    rejectOrgChangeRequest(requestId, approverEmployeeId, note) {
      const i = (this.orgChangeRequests || []).findIndex((x) => x.id === requestId);
      if (i < 0) return false;
      const r = this.orgChangeRequests[i];
      if (r.status !== 'pending' || Number(r.pendingApproverId) !== Number(approverEmployeeId)) return false;
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const log = [...(r.log || []), {
        approverEmployeeId: Number(approverEmployeeId),
        action: 'reject',
        at: now,
        note: String(note || '').trim(),
      }];
      const next = { ...r, status: 'rejected', pendingApproverId: null, log };
      const arr = [...this.orgChangeRequests];
      arr[i] = next;
      this.orgChangeRequests = arr;
      this._markDirty('orgChangeRequests');
      this.persistAll();
      return true;
    },
    applyOrgChangeRequestPayload(type, payload) {
      switch (type) {
        case 'dept_create':
          this.addDepartment({
            name: payload.name,
            parentId: payload.parentId,
            managerId: payload.managerId,
          });
          break;
        case 'dept_delete':
          this.removeDepartment(payload.id);
          break;
        case 'dept_update':
          this.updateDepartment(payload.id, payload.patch);
          break;
        case 'position_create': {
          const nid = this.addPosition({
            name: payload.name,
            level: payload.level,
            departmentId: payload.departmentId,
            reportingManagerId: payload.reportingManagerId || null,
          });
          if (nid == null) {
            throw new Error('Target HC 创建失败：部门无效或数据异常');
          }
          payload.createdId = nid;
          if (payload.markRecruitAfter) {
            this.setPositionRecruitTagged(Number(payload.departmentId), nid, true);
          }
          break;
        }
        case 'position_delete':
          this.removePosition(payload.id);
          break;
        case 'position_update': {
          const ok = this.updatePosition(payload.id, payload.patch);
          if (!ok) {
            throw new Error('Target HC 更新失败：目标记录不存在或数据冲突');
          }
          break;
        }
        default:
          break;
      }
    },
    positionRecruitTagKey(deptId, positionId) {
      return `${Number(deptId)}-${Number(positionId)}`;
    },
    isPositionRecruitTagged(deptId, positionId) {
      const k = this.positionRecruitTagKey(deptId, positionId);
      return normalizeRecruitTagValue(this.positionRecruitTags && this.positionRecruitTags[k]) != null;
    },
    getPositionRecruitPriority(deptId, positionId) {
      const n = normalizeRecruitTagValue(this.positionRecruitTags[this.positionRecruitTagKey(deptId, positionId)]);
      return n ? n.priority : null;
    },
    setPositionRecruitPriority(deptId, positionId, priority) {
      if (!RECRUIT_PRIORITIES.includes(priority)) return;
      const k = this.positionRecruitTagKey(deptId, positionId);
      if (normalizeRecruitTagValue(this.positionRecruitTags[k]) == null) return;
      const tags = { ...(this.positionRecruitTags || {}) };
      tags[k] = { priority };
      this.positionRecruitTags = tags;
      this._markDirty('positionRecruitTags');
      this.persistAll();
    },
    togglePositionRecruit(deptId, positionId) {
      const k = this.positionRecruitTagKey(deptId, positionId);
      const tags = { ...(this.positionRecruitTags || {}) };
      if (normalizeRecruitTagValue(tags[k])) delete tags[k];
      else tags[k] = { priority: 'medium' };
      this.positionRecruitTags = tags;
      this._markDirty('positionRecruitTags');
      this.persistAll();
    },
    setPositionRecruitTagged(deptId, positionId, on) {
      const k = this.positionRecruitTagKey(deptId, positionId);
      const tags = { ...(this.positionRecruitTags || {}) };
      if (on) tags[k] = { priority: 'medium' };
      else delete tags[k];
      this.positionRecruitTags = tags;
      this._markDirty('positionRecruitTags');
      this.persistAll();
    },
    // 请假
    updateLeaveStatus(id, status) {
      const r = this.leaveRequests.find((x) => x.id === id);
      if (r) {
        r.status = status;
        this._markDirty('leaveRequests');
        this.persistAll();
      }
    },
    addLeaveRequest(row) {
      const id = uid(this.leaveRequests);
      this.leaveRequests.push({ ...row, id, createdAt: row.createdAt || new Date().toISOString().slice(0, 10) });
      this._markDirty('leaveRequests');
      this.persistAll();
      return id;
    },
    // 绩效
    updateReview(id, patch) {
      const i = this.performanceReviews.findIndex((x) => x.id === id);
      if (i >= 0) {
        this.performanceReviews[i] = { ...this.performanceReviews[i], ...patch };
        this._markDirty('performanceReviews');
        this.persistAll();
      }
    },
    addPerformanceReview(row) {
      const id = uid(this.performanceReviews);
      this.performanceReviews.push({ ...row, id });
      this._markDirty('performanceReviews');
      this.persistAll();
      return id;
    },
    _validateEmployeeFKs(patch) {
      const w = [];
      if (patch.departmentId != null && !this.departments.some((d) => d.id === Number(patch.departmentId))) {
        w.push('所选部门不存在');
      }
      if (patch.positionId != null && !this.positions.some((p) => p.id === Number(patch.positionId))) {
        w.push('所选岗位不存在');
      }
      if (patch.managerId != null && patch.managerId !== '' && !this.employees.some((e) => e.id === Number(patch.managerId))) {
        w.push('所选汇报经理不存在');
      }
      return w;
    },
    _rebuildPendingApprovalChains(employeeId) {
      const TM = window.TM;
      if (typeof TM.buildApprovalChainAboveRm !== 'function') return;
      const eid = Number(employeeId);
      this.performanceReviews.forEach((r) => {
        if (Number(r.employeeId) !== eid) return;
        if (r.status !== 'rm_pending' && r.status !== 'rm_evaluated' && r.status !== 'in_approval') return;
        const emp = this.employees.find((e) => e.id === eid);
        if (!emp || !emp.managerId) return;
        const newReviewerId = emp.managerId;
        const newChain = TM.buildApprovalChainAboveRm(this, newReviewerId);
        r.reviewerId = newReviewerId;
        r.approvalChain = newChain;
        if (r.status === 'rm_pending') {
          r.pendingApproverId = newReviewerId;
          r.approvalStepIndex = 0;
        } else if (r.status === 'rm_evaluated') {
          r.approvalStepIndex = 0;
        } else if (r.status === 'in_approval') {
          const currentApprover = Number(r.pendingApproverId);
          const newIdx = newChain.indexOf(currentApprover);
          if (newIdx >= 0) {
            r.approvalStepIndex = newIdx;
          } else {
            r.status = 'rm_pending';
            r.pendingApproverId = newReviewerId;
            r.approvalStepIndex = 0;
          }
        }
      });
      this._markDirty('performanceReviews');
    },
    /** RM 保存评估（不提交审批链）：rm_pending → rm_evaluated */
    saveRmEvaluation(reviewId, payload, actorOptions) {
      const TM = window.TM;
      const grades = TM.PERF_GRADE_OPTIONS;
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      const r = this.performanceReviews[i];
      if (r.status !== 'rm_pending') return false;

      const actorId = actorOptions?.actorId != null ? Number(actorOptions.actorId) : Number(r.reviewerId);
      const isHrbp = !!actorOptions?.isHrbp;
      const canAct = actorId === Number(r.reviewerId)
        || (typeof TM.isManagerOf === 'function' && TM.isManagerOf(this, actorId, r.reviewerId))
        || isHrbp;
      if (!canAct) return false;

      const g = String(payload.rmInitialGrade || '').trim();
      if (!grades.includes(g)) return false;
      const outDesc = String(payload.outputDescription || '').trim();
      if (!outDesc) return false;
      const today = new Date().toISOString().slice(0, 10);
      const proxyNote = actorId !== Number(r.reviewerId) ? `（由 ${this._empMap.get(actorId)?.name || actorId} 代评）` : '';
      const log = [...(r.approvalLog || []), { approverId: actorId, at: today, action: 'evaluate', note: 'RM 完成评估' + proxyNote }];
      this.performanceReviews[i] = {
        ...r,
        historyPerformance: String(payload.historyPerformance || '').trim(),
        outputDescription: outDesc,
        rmInitialGrade: g,
        rmComment: String(payload.rmComment || '').trim(),
        prevCycleAvgHours: payload.prevCycleAvgHours != null && payload.prevCycleAvgHours !== ''
          ? Math.round(Number(payload.prevCycleAvgHours) * 10) / 10 : null,
        comments: String(payload.comments || '').trim(),
        devAdvice: String(payload.devAdvice || '').trim(),
        approvalLog: log,
        status: 'rm_evaluated',
        pendingApproverId: null,
      };
      this._markDirty('performanceReviews');
      this.persistAll();
      return true;
    },
    /** RM 批量提交：将该 RM 在指定周期内所有 rm_evaluated 评估一次性推入审批链 */
    batchSubmitReviews(managerEmpId, cycleId) {
      const TM = window.TM;
      const mgrId = Number(managerEmpId);
      const targets = this.performanceReviews.filter((r) =>
        r.cycleId === cycleId && Number(r.reviewerId) === mgrId && r.status === 'rm_evaluated',
      );
      if (!targets.length) return 0;
      const today = new Date().toISOString().slice(0, 10);
      let count = 0;
      targets.forEach((r) => {
        const idx = this.performanceReviews.indexOf(r);
        if (idx < 0) return;
        const chain = TM.buildApprovalChainAboveRm(this, r.reviewerId);
        const log = [...(r.approvalLog || []), { approverId: mgrId, at: today, action: 'batch_submit', note: '批量提交审批' }];
        if (!chain.length) {
          this.performanceReviews[idx] = {
            ...r, approvalChain: chain, approvalLog: log, approvalStepIndex: 0,
            pendingApproverId: null, finalGrade: '', status: 'pl_pending',
          };
        } else {
          this.performanceReviews[idx] = {
            ...r, approvalChain: chain, approvalLog: log, approvalStepIndex: 0,
            pendingApproverId: chain[0], finalGrade: '', status: 'in_approval',
            levelApprovedBy: null,
          };
        }
        count++;
      });
      this._markDirty('performanceReviews');
      this.persistAll();
      return count;
    },
    /** 保留旧接口用于兼容（HRBP 代评时仍可单条提交） */
    submitRmPerformanceReview(reviewId, payload, actorOptions) {
      if (!this.saveRmEvaluation(reviewId, payload, actorOptions)) return false;
      const r = this.performanceReviews.find((x) => x.id === reviewId);
      if (!r) return false;
      const TM = window.TM;
      const chain = TM.buildApprovalChainAboveRm(this, r.reviewerId);
      const today = new Date().toISOString().slice(0, 10);
      const idx = this.performanceReviews.indexOf(r);
      const log = [...(r.approvalLog || []), { approverId: actorOptions?.actorId || r.reviewerId, at: today, action: 'batch_submit', note: '提交审批' }];
      if (!chain.length) {
        this.performanceReviews[idx] = { ...r, approvalChain: chain, approvalLog: log, approvalStepIndex: 0, pendingApproverId: null, finalGrade: '', status: 'pl_pending' };
      } else {
        this.performanceReviews[idx] = { ...r, approvalChain: chain, approvalLog: log, approvalStepIndex: 0, pendingApproverId: chain[0], finalGrade: '', status: 'in_approval', levelApprovedBy: null };
      }
      this._markDirty('performanceReviews');
      this.persistAll();
      return true;
    },
    /** 逐级审批：记录审批并自动推进；当某一级所有评审均审批完毕时自动推进到下一级 */
    approvePerformanceReview(reviewId, actorEmployeeId, note, adjustedGrade) {
      const TM = window.TM;
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      const r = this.performanceReviews[i];
      if (r.status !== 'in_approval') return false;

      const pendingId = Number(r.pendingApproverId);
      const actorId = Number(actorEmployeeId);
      const auth = TM.useAuthStore?.();
      const isHrbp = !!(auth && (auth.isHrbp || auth.isSuperAdmin));
      const canAct = actorId === pendingId
        || (typeof TM.isManagerOf === 'function' && TM.isManagerOf(this, actorId, pendingId))
        || isHrbp;
      if (!canAct) return false;

      const chain = r.approvalChain || [];
      const idx = chain.indexOf(pendingId);
      if (idx < 0) return false;
      const today = new Date().toISOString().slice(0, 10);
      const grades = TM.PERF_GRADE_OPTIONS;
      const newGrade = adjustedGrade && grades.includes(String(adjustedGrade).trim())
        ? String(adjustedGrade).trim() : null;
      const proxyNote = actorId !== pendingId ? `（由 ${this._empMap.get(actorId)?.name || actorId} 代审批）` : '';
      const log = [...(r.approvalLog || []), {
        approverId: actorId, at: today, action: 'approve',
        note: String(note || '').trim() + (newGrade && newGrade !== r.rmInitialGrade ? ` [等级调整为 ${newGrade}]` : '') + proxyNote,
      }];
      const gradeUpdate = newGrade ? { rmInitialGrade: newGrade } : {};

      this.performanceReviews[i] = {
        ...r, ...gradeUpdate, approvalLog: log, levelApprovedBy: actorId,
      };
      this._markDirty('performanceReviews');

      this._checkAutoAdvance(pendingId, r.cycleId);
      this.persistAll();
      return true;
    },
    /** 检查某一级审批人的所有评审是否均已审批，如全部完成则自动推进 */
    _checkAutoAdvance(approverId, cycleId) {
      const TM = window.TM;
      const aid = Number(approverId);
      const peers = this.performanceReviews.filter((r) =>
        r.cycleId === cycleId && r.status === 'in_approval' && Number(r.pendingApproverId) === aid,
      );
      if (!peers.length) return;
      const allApproved = peers.every((r) => r.levelApprovedBy != null);
      if (!allApproved) return;

      peers.forEach((r) => {
        const idx = this.performanceReviews.indexOf(r);
        if (idx < 0) return;
        const chain = r.approvalChain || [];
        const stepIdx = chain.indexOf(aid);
        if (stepIdx < 0) return;
        if (stepIdx >= chain.length - 1) {
          this.performanceReviews[idx] = {
            ...r, approvalStepIndex: chain.length, pendingApproverId: null,
            status: 'pl_pending', levelApprovedBy: null,
          };
        } else {
          const next = chain[stepIdx + 1];
          this.performanceReviews[idx] = {
            ...r, approvalStepIndex: stepIdx + 1, pendingApproverId: next,
            levelApprovedBy: null,
          };
        }
      });
      this._markDirty('performanceReviews');
    },
    /** 驳回到上一级审批人（若已在第一级则退回 RM） */
    rejectPerformanceReview(reviewId, actorEmployeeId, note) {
      const TM = window.TM;
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      const r = this.performanceReviews[i];
      if (r.status !== 'in_approval') return false;

      const pendingId = Number(r.pendingApproverId);
      const actorId = Number(actorEmployeeId);
      const auth = TM.useAuthStore?.();
      const isHrbp = !!(auth && (auth.isHrbp || auth.isSuperAdmin));
      const canAct = actorId === pendingId
        || (typeof TM.isManagerOf === 'function' && TM.isManagerOf(this, actorId, pendingId))
        || isHrbp;
      if (!canAct) return false;

      const chain = r.approvalChain || [];
      const idx = chain.indexOf(pendingId);
      if (idx < 0) return false;
      const today = new Date().toISOString().slice(0, 10);
      const proxyNote = actorId !== pendingId ? `（由 ${this._empMap.get(actorId)?.name || actorId} 代驳回）` : '';
      const log = [...(r.approvalLog || []), {
        approverId: actorId, at: today, action: 'reject', note: String(note || '').trim() + proxyNote,
      }];
      if (idx > 0) {
        const prev = chain[idx - 1];
        this.performanceReviews[i] = {
          ...r, status: 'in_approval', approvalStepIndex: idx - 1,
          pendingApproverId: prev, approvalLog: log, levelApprovedBy: null,
        };
      } else {
        this.performanceReviews[i] = {
          ...r, status: 'rm_pending', approvalStepIndex: 0,
          pendingApproverId: r.reviewerId, approvalLog: log, finalGrade: '', levelApprovedBy: null,
        };
      }
      this._markDirty('performanceReviews');
      this.persistAll();
      return true;
    },
    /**
     * 团队整批驳回：驳回同一 RM、同一周期、同一审批步骤的所有 in_approval 评审。
     * 调整一个人的绩效往往需要重新平衡整个团队，因此整批回退。
     * @returns {{ ok: boolean, count: number, rmName: string }}
     */
    rejectTeamPerformanceReviews(reviewId, actorEmployeeId, note) {
      const TM = window.TM;
      const anchor = this.performanceReviews.find((x) => x.id === reviewId);
      if (!anchor || anchor.status !== 'in_approval') return { ok: false, count: 0, rmName: '' };

      const rmId = Number(anchor.reviewerId);
      const cycleId = anchor.cycleId;
      const pendingId = Number(anchor.pendingApproverId);
      const actorId = Number(actorEmployeeId);

      const auth = TM.useAuthStore?.();
      const isHrbp = !!(auth && (auth.isHrbp || auth.isSuperAdmin));
      const canAct = actorId === pendingId
        || (typeof TM.isManagerOf === 'function' && TM.isManagerOf(this, actorId, pendingId))
        || isHrbp;
      if (!canAct) return { ok: false, count: 0, rmName: '' };

      const siblings = this.performanceReviews.filter((r) =>
        r.cycleId === cycleId
        && Number(r.reviewerId) === rmId
        && r.status === 'in_approval'
        && Number(r.pendingApproverId) === pendingId,
      );
      if (!siblings.length) return { ok: false, count: 0, rmName: '' };

      const today = new Date().toISOString().slice(0, 10);
      const proxyNote = actorId !== pendingId ? `（由 ${this._empMap.get(actorId)?.name || actorId} 代驳回）` : '';
      const noteStr = String(note || '').trim() + proxyNote;
      let count = 0;

      siblings.forEach((r) => {
        const i = this.performanceReviews.indexOf(r);
        if (i < 0) return;
        const chain = r.approvalChain || [];
        const idx = chain.indexOf(pendingId);
        if (idx < 0) return;
        const log = [...(r.approvalLog || []), {
          approverId: actorId, at: today, action: 'reject',
          note: noteStr + `（整批驳回 ${siblings.length} 人）`,
        }];
        if (idx > 0) {
          const prev = chain[idx - 1];
          this.performanceReviews[i] = {
            ...r, status: 'in_approval', approvalStepIndex: idx - 1,
            pendingApproverId: prev, approvalLog: log, levelApprovedBy: null,
          };
        } else {
          this.performanceReviews[i] = {
            ...r, status: 'rm_pending', approvalStepIndex: 0,
            pendingApproverId: r.reviewerId, approvalLog: log, finalGrade: '', levelApprovedBy: null,
          };
        }
        count++;
      });

      this._markDirty('performanceReviews');
      this.persistAll();
      const rmName = this._empMap.get(rmId)?.name || String(rmId);
      return { ok: count > 0, count, rmName };
    },
    /** HRBP 批量校准：pl_pending → calibrated */
    hrbpCalibrateReview(reviewId, grade, actorId) {
      const grades = window.TM.PERF_GRADE_OPTIONS;
      const g = String(grade || '').trim();
      if (!grades.includes(g)) return false;
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      if (this.performanceReviews[i].status !== 'pl_pending') return false;
      const today = new Date().toISOString().slice(0, 10);
      const log = [...(this.performanceReviews[i].approvalLog || []), {
        approverId: actorId || null, at: today, action: 'calibrate', note: 'HRBP 校准确认',
      }];
      this.performanceReviews[i] = {
        ...this.performanceReviews[i],
        finalGrade: g, status: 'calibrated',
        calibratedBy: actorId || null, calibratedAt: today, approvalLog: log,
      };
      this._markDirty('performanceReviews');
      this.persistAll();
      return true;
    },
    /** 产品线负责人批量审批：calibrated → pl_approved；可传 reviewIds 限定范围 */
    plHeadApproveReviews(cycleId, actorId, reviewIds) {
      const idSet = Array.isArray(reviewIds) && reviewIds.length ? new Set(reviewIds) : null;
      const reviews = this.performanceReviews.filter((r) => {
        if (r.cycleId !== cycleId || r.status !== 'calibrated') return false;
        return idSet ? idSet.has(r.id) : true;
      });
      if (!reviews.length) return 0;
      const today = new Date().toISOString().slice(0, 10);
      let count = 0;
      reviews.forEach((r) => {
        const idx = this.performanceReviews.indexOf(r);
        if (idx < 0) return;
        const log = [...(r.approvalLog || []), {
          approverId: actorId || null, at: today, action: 'pl_approve', note: '产品线负责人审批通过',
        }];
        this.performanceReviews[idx] = {
          ...r, status: 'pl_approved', _newFlowPlApproved: true, approvalLog: log,
        };
        count++;
      });
      this._markDirty('performanceReviews');
      this.persistAll();
      return count;
    },
    /** 归档：当前周期所有评估均已产品线审批后，批量归档并同步九宫格；返回归档条数 */
    archiveCycleReviews(cycleId) {
      const reviews = this.performanceReviews.filter((r) => r.cycleId === cycleId);
      if (!reviews.length) return 0;
      const allReady = reviews.every((r) => r.status === 'pl_approved' || r.status === 'finalized');
      if (!allReady) return 0;
      const today = new Date().toISOString().slice(0, 10);
      let archived = 0;
      reviews.forEach((r) => {
        if (r.status !== 'pl_approved') return;
        const idx = this.performanceReviews.indexOf(r);
        if (idx < 0) return;
        const log = [...(r.approvalLog || []), { approverId: null, at: today, action: 'archive', note: '产品线归档' }];
        this.performanceReviews[idx] = { ...r, status: 'finalized', approvalLog: log };
        this._syncTalentPerfRating(r.employeeId);
        archived++;
      });
      this._markDirty('performanceReviews', 'talentMatrix');
      this.persistAll();
      return archived;
    },
    /** 记录沟通 */
    recordCommunication(reviewId, notes) {
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      if (this.performanceReviews[i].status !== 'finalized') return false;
      const today = new Date().toISOString().slice(0, 10);
      const d = new Date();
      d.setDate(d.getDate() + 3);
      const deadline = d.toISOString().slice(0, 10);
      this.performanceReviews[i] = {
        ...this.performanceReviews[i],
        communicationNotes: String(notes || '').trim(),
        communicatedAt: today,
        appealDeadline: deadline,
      };
      this._markDirty('performanceReviews');
      this.persistAll();
      return true;
    },
    /** 登记申诉：归档且已沟通、在申诉期内、无已有申诉 */
    submitAppeal(reviewId, reason) {
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      const r = this.performanceReviews[i];
      if (r.status !== 'finalized') return false;
      if (!r.communicatedAt) return false;
      if (r.appealStatus === 'pending' || r.appealStatus === 'approved' || r.appealStatus === 'rejected') return false;
      const today = new Date().toISOString().slice(0, 10);
      const log = [...(r.approvalLog || []), {
        approverId: null, at: today, action: 'appeal', note: '员工发起申诉：' + String(reason || '').trim(),
      }];
      this.performanceReviews[i] = {
        ...r,
        appealStatus: 'pending',
        appealReason: String(reason || '').trim(),
        appealSubmittedAt: today,
        approvalLog: log,
      };
      this._markDirty('performanceReviews');
      this.persistAll();
      return true;
    },
    /** HRBP 处理申诉：批准（可调整等级）或驳回 */
    resolveAppeal(reviewId, approved, newGrade, notes) {
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      const r = this.performanceReviews[i];
      if (r.status !== 'finalized' || r.appealStatus !== 'pending') return false;
      const today = new Date().toISOString().slice(0, 10);
      const grades = window.TM.PERF_GRADE_OPTIONS;
      const gradeChanged = approved && newGrade && grades.includes(String(newGrade).trim())
        && String(newGrade).trim() !== r.finalGrade;
      const resolvedGrade = gradeChanged ? String(newGrade).trim() : r.finalGrade;
      const noteStr = String(notes || '').trim();
      const logEntry = {
        approverId: window.TM.useAuthStore?.()?.currentUser?.employeeId || null,
        at: today,
        action: approved ? 'appeal_approved' : 'appeal_rejected',
        note: (approved
          ? ('申诉批准' + (gradeChanged ? `，等级由 ${r.finalGrade} 调整为 ${resolvedGrade}` : '，等级维持不变'))
          : '申诉驳回') + (noteStr ? '：' + noteStr : ''),
      };
      const log = [...(r.approvalLog || []), logEntry];
      this.performanceReviews[i] = {
        ...r,
        appealStatus: approved ? 'approved' : 'rejected',
        appealResult: noteStr,
        appealResolvedAt: today,
        finalGrade: resolvedGrade,
        approvalLog: log,
      };
      if (gradeChanged) {
        this._syncTalentPerfRating(r.employeeId);
        this._markDirty('performanceReviews', 'talentMatrix');
      } else {
        this._markDirty('performanceReviews');
      }
      this.persistAll();
      return true;
    },
    /** HRBP 调整等级：仅在 calibrated / pl_approved 阶段可用（归档前、审批链完成后） */
    hrbpAdjustFinalGrade(reviewId, grade) {
      const grades = window.TM.PERF_GRADE_OPTIONS;
      const g = String(grade || '').trim();
      if (!grades.includes(g)) return false;
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      const r = this.performanceReviews[i];
      if (r.status !== 'calibrated' && r.status !== 'pl_approved') return false;
      this.performanceReviews[i] = { ...r, finalGrade: g };
      this._markDirty('performanceReviews');
      this.persistAll();
      return true;
    },
    // 培训记录
    addEmployeeTraining(row) {
      const id = uid(this.employeeTrainings);
      this.employeeTrainings.push({ ...row, id });
      const nid = uid(this.notifications);
      this.notifications.push({
        id: nid,
        employeeId: row.employeeId,
        title: '培训推荐',
        message: `您的上级为您推荐了培训课程（记录 #${id}）`,
        read: false,
        createdAt: new Date().toISOString().slice(0, 10),
      });
      this._markDirty('employeeTrainings', 'notifications');
      this.persistAll();
      return id;
    },
    updateEmployeeTraining(id, patch) {
      const i = this.employeeTrainings.findIndex((x) => x.id === id);
      if (i >= 0) {
        this.employeeTrainings[i] = { ...this.employeeTrainings[i], ...patch };
        this._markDirty('employeeTrainings');
        this.persistAll();
      }
    },
    // 考勤规则
    saveAttendanceRules(rules) {
      this.attendanceRules = { ...this.attendanceRules, ...rules };
      this._markDirty('attendanceRules');
      this.persistAll();
    },
    /**
     * Import raw punch events: each row = { employeeId, date: 'YYYY-MM-DD', time: 'HH:MM' }.
     * Options: { replace: true } to replace all existing data.
     */
    importRawPunches(rows, options) {
      if (options && options.replace) {
        this.punchRecords = [];
      }
      const base = this.punchRecords.length
        ? this.punchRecords.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0)
        : 0;
      let nextId = base + 1;
      (rows || []).forEach((row) => {
        const eid = Number(row.employeeId);
        if (Number.isNaN(eid)) return;
        this.punchRecords.push({
          id: nextId++,
          employeeId: eid,
          date: String(row.date || '').trim(),
          time: String(row.time || '').trim(),
        });
      });
      this.recomputeAllAttendance();
      this._markDirty('punchRecords', 'attendanceRecords');
      this.persistAll();
    },
    /** Recompute attendanceRecords from raw punchRecords, preserving manually imported avgDailyHours rows. */
    recomputeAllAttendance() {
      if (typeof window.TM.attendance?.recomputeRecords !== 'function') return;
      const punchDerived = window.TM.attendance.recomputeRecords(this.punchRecords);
      const punchKeys = new Set(punchDerived.map((r) => `${Number(r.employeeId)}_${r.month}`));
      const manualRows = (this.attendanceRecords || []).filter((r) => {
        const k = `${Number(r.employeeId)}_${r.month}`;
        return !punchKeys.has(k) && r.avgDailyHours != null && r.avgDailyHours !== '' && !Number.isNaN(Number(r.avgDailyHours));
      });
      let nextId = punchDerived.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
      manualRows.forEach((r) => { r.id = nextId++; });
      this.attendanceRecords = [...punchDerived, ...manualRows];
    },
    clearPunchRecords() {
      this.punchRecords = [];
      this.attendanceRecords = [];
      this._markDirty('punchRecords', 'attendanceRecords');
      this.persistAll();
    },
    /**
     * 导入月度「日均平均工时」（h/日），支持一行多个月份列。
     * rows: { employeeId, ym: 'YYYY-MM', avgDailyHours }[]
     */
    importAttendanceAvgDailyHours(rows) {
      const rules = this.attendanceRules || {};
      const attLookup = new Map();
      this.attendanceRecords.forEach((r) => attLookup.set(`${Number(r.employeeId)}_${r.month}`, r));
      (rows || []).forEach((item) => {
        const eid = Number(item.employeeId);
        let ym = String(item.ym || '').trim();
        if (ym.length >= 7) ym = ym.slice(0, 7);
        const hrs = Number(item.avgDailyHours);
        if (Number.isNaN(eid) || !/^\d{4}-\d{2}$/.test(ym) || Number.isNaN(hrs) || hrs < 0) return;
        let row = attLookup.get(`${eid}_${ym}`);
        if (!row) {
          row = {
            id: uid(this.attendanceRecords),
            employeeId: eid,
            month: ym,
            workDays: Number(rules.monthlyStandardDays) || 20,
            presentDays: null,
            lateCount: null,
            leaveDays: 0,
            attendanceRate: null,
          };
          this.attendanceRecords.push(row);
          attLookup.set(`${eid}_${ym}`, row);
        }
        row.avgDailyHours = Math.round(hrs * 100) / 100;
        applyAvgDailyHoursToAttendanceRow(row, rules);
      });
      this._markDirty('attendanceRecords');
      this.persistAll();
    },
    /** 规则变更后，重算所有「日均工时导入」行的负荷比与折算工时 */
    refreshImportedAttendanceMetrics() {
      const rules = this.attendanceRules || {};
      (this.attendanceRecords || []).forEach((row) => {
        if (row.avgDailyHours != null && row.avgDailyHours !== '' && !Number.isNaN(Number(row.avgDailyHours))) {
          applyAvgDailyHoursToAttendanceRow(row, rules);
        }
      });
      this._markDirty('attendanceRecords');
      this.persistAll();
    },
    /**
     * 根据打卡与规则重算指定月份的 attendanceRecords（出勤率、工时负荷档位）
     */
    recomputeAttendanceFromPunches(monthYm) {
      const ym = monthYm.length === 7 ? monthYm : monthYm.slice(0, 7);
      const rules = this.attendanceRules || {};
      const workDays = Number(rules.monthlyStandardDays) || 20;
      const low = rules.loadBandLow != null ? Number(rules.loadBandLow) : 0.88;
      const high = rules.loadBandHigh != null ? Number(rules.loadBandHigh) : 1.12;
      const dailyStd = dailyStandardHours(rules.workStart, rules.workEnd);
      const expectedMonthHours = workDays * dailyStd;

      const byEmp = new Map();
      this.punchRecords
        .filter((p) => String(p.date).startsWith(ym))
        .forEach((p) => {
          const eid = Number(p.employeeId);
          if (!byEmp.has(eid)) byEmp.set(eid, []);
          byEmp.get(eid).push(p);
        });

      const attIdx = new Map();
      this.attendanceRecords.forEach((r) => {
        attIdx.set(`${Number(r.employeeId)}_${r.month}`, r);
      });

      this.employees.forEach((emp) => {
        const eid = emp.id;
        const list = byEmp.get(eid) || [];
        let row = attIdx.get(`${eid}_${ym}`);

        if (list.length === 0) {
          if (!row) {
            row = { id: uid(this.attendanceRecords), employeeId: eid, month: ym, workDays, presentDays: 0, lateCount: 0, leaveDays: 0, attendanceRate: 0 };
            this.attendanceRecords.push(row);
          }
          if (row.avgDailyHours != null && row.avgDailyHours !== '' && !Number.isNaN(Number(row.avgDailyHours))) {
            applyAvgDailyHoursToAttendanceRow(row, rules);
            return;
          }
          row.workDays = workDays;
          row.presentDays = 0;
          row.actualWorkHours = 0;
          row.expectedMonthHours = Math.round(expectedMonthHours * 10) / 10;
          row.loadRatio = null;
          row.loadTier = null;
          row.attendanceRate = 0;
          row.lateCount = 0;
          return;
        }

        let actualHours = 0;
        const dates = new Set();
        list.forEach((p) => {
          const h = hoursBetween(p.clockIn, p.clockOut);
          if (h > 0 && h <= 16) {
            actualHours += h;
            dates.add(p.date);
          }
        });
        const presentDays = dates.size;
        const ratio = expectedMonthHours > 0 ? actualHours / expectedMonthHours : 0;
        let loadTier = 'normal';
        if (ratio < low) loadTier = 'under';
        else if (ratio > high) loadTier = 'over';

        if (!row) {
          row = { id: uid(this.attendanceRecords), employeeId: eid, month: ym, workDays, presentDays: 0, lateCount: 0, leaveDays: 0, attendanceRate: 0 };
          this.attendanceRecords.push(row);
        }
        row.avgDailyHours = null;
        row.workDays = workDays;
        row.presentDays = presentDays;
        row.attendanceRate = workDays > 0 ? Math.min(100, Math.round((presentDays / workDays) * 100)) : 0;
        row.actualWorkHours = Math.round(actualHours * 10) / 10;
        row.expectedMonthHours = Math.round(expectedMonthHours * 10) / 10;
        row.loadRatio = Math.round(ratio * 1000) / 1000;
        row.loadTier = loadTier;
        row.lateCount = countLate(list, rules.workStart);
      });
      this._markDirty('attendanceRecords');
      this.persistAll();
    },
    // KPI / 周期
    addKpi(row) {
      const id = uid(this.kpiLibrary);
      this.kpiLibrary.push({ ...row, id });
      this._markDirty('kpiLibrary');
      this.persistAll();
      return id;
    },
    updateKpi(id, patch) {
      const i = this.kpiLibrary.findIndex((x) => x.id === id);
      if (i >= 0) {
        this.kpiLibrary[i] = { ...this.kpiLibrary[i], ...patch };
        this._markDirty('kpiLibrary');
        this.persistAll();
      }
    },
    removeKpi(id) {
      this.kpiLibrary = this.kpiLibrary.filter((x) => x.id !== id);
      this._markDirty('kpiLibrary');
      this.persistAll();
    },
    addCycle(row) {
      const TM = window.TM;
      const id = uid(this.performanceCycles);
      const cutoff = row.cutoffDate || '';
      this.performanceCycles.push({ ...row, id });
      const today = new Date().toISOString().slice(0, 10);
      const activeEmps = this.employees.filter((e) => {
        if (e.status === 'leave') return false;
        if (cutoff && e.hireDate && String(e.hireDate) > cutoff) return false;
        return true;
      });
      activeEmps.forEach((emp) => {
        const reviewerId = emp.managerId || null;
        const chain = reviewerId && typeof TM.buildApprovalChainAboveRm === 'function'
          ? TM.buildApprovalChainAboveRm(this, reviewerId) : [];
        this.performanceReviews.push({
          id: uid(this.performanceReviews),
          employeeId: emp.id,
          reviewerId,
          cycleId: id,
          status: 'rm_pending',
          rmInitialGrade: '',
          finalGrade: '',
          approvalChain: chain,
          approvalStepIndex: 0,
          pendingApproverId: reviewerId,
          approvalLog: [],
          historyPerformance: '',
          outputDescription: '',
          prevCycleAvgHours: null,
          comments: '',
          devAdvice: '',
          rmComment: '',
          createdAt: today,
          communicationNotes: '',
          communicatedAt: null,
          appealDeadline: null,
          calibratedBy: null,
          calibratedAt: null,
        });
      });
      this._markDirty('performanceCycles', 'performanceReviews');
      this.persistAll();
      return id;
    },
    updateCycle(id, patch) {
      const i = this.performanceCycles.findIndex((x) => x.id === id);
      if (i >= 0) {
        this.performanceCycles[i] = { ...this.performanceCycles[i], ...patch };
        this._markDirty('performanceCycles');
        this.persistAll();
      }
    },
    /**
     * 根据员工的全部已定档绩效重新计算 A/B/C 评级，并同步更新 talentMatrix.performance
     */
    _syncTalentPerfRating(employeeId) {
      const eid = Number(employeeId);
      if (Number.isNaN(eid)) return;
      const TM = window.TM;
      if (typeof TM.computePerfRatingFromReviews !== 'function') return;
      const reviews = (this._reviewsByEmp?.get?.(eid)) || this.performanceReviews.filter((r) => Number(r.employeeId) === eid);
      const rating = TM.computePerfRatingFromReviews(reviews, this.performanceCycles);
      const row = this.talentMatrix.find((x) => Number(x.employeeId) === eid);
      if (row && row.performance !== rating) {
        row.performance = rating;
      }
    },
    // 人才九宫格
    upsertTalentCell(employeeId, performance, potential, opts) {
      const eid = Number(employeeId);
      if (Number.isNaN(eid)) return;
      const prev = this.talentMatrix.find((x) => Number(x.employeeId) === eid);
      const row = {
        employeeId: eid,
        performance: String(performance ?? '').trim(),
        potential: String(potential ?? '').trim(),
        developmentPlan: String(prev?.developmentPlan ?? '').trim(),
      };
      const rest = this.talentMatrix.filter((x) => Number(x.employeeId) !== eid);
      rest.push(row);
      this.talentMatrix = rest;
      this._markDirty('talentMatrix');
      if (!opts || !opts.skipPersist) this.persistAll();
    },
    /** 高潜等场景：九宫格行上的发展计划说明（纯文本） */
    setTalentDevelopmentPlan(employeeId, text) {
      const eid = Number(employeeId);
      if (Number.isNaN(eid)) return;
      const next = String(text ?? '').trim();
      const i = this.talentMatrix.findIndex((x) => Number(x.employeeId) === eid);
      if (i < 0) {
        this.talentMatrix = [...this.talentMatrix, {
          employeeId: eid, performance: 'B', potential: 'M', developmentPlan: next,
        }];
      } else {
        const cur = this.talentMatrix[i];
        const copy = [...this.talentMatrix];
        copy[i] = { ...cur, developmentPlan: next };
        this.talentMatrix = copy;
      }
      this.persistKeys('talentMatrix');
    },
    // 继任
    upsertSuccession(row) {
      const id = row.id || uid(this.successionPlans);
      const i = this.successionPlans.findIndex((x) => x.id === id);
      if (i >= 0) this.successionPlans[i] = { ...this.successionPlans[i], ...row, id };
      else this.successionPlans.push({ ...row, id });
      this._markDirty('successionPlans');
      this.persistAll();
    },
    // 用户密码
    updateUserPassword(userId, password) {
      const u = this.users.find((x) => x.id === userId);
      if (u) {
        u.password = password;
        this._markDirty('users');
        this.persistAll();
      }
    },
    importSnapshot(obj, importOptions) {
      const keys = [
        'employees', 'departments', 'positions', 'leaveRequests', 'performanceReviews',
        'trainings', 'employeeTrainings', 'users',
        'attendanceRules', 'attendanceRecords', 'punchRecords', 'kpiLibrary', 'performanceCycles',
        'talentMatrix', 'successionPlans', 'notifications', 'positionRecruitTags',
        'recruitmentCandidates', 'recruitmentPositionMetrics', 'recruitmentPipeline',
        'interviewerPool', 'orgSettings', 'orgChangeRequests', 'rosterColumnSettings',
      ];
      keys.forEach((k) => {
        if (k === 'rosterColumnSettings') return;
        if (obj[k] == null) return;
        if (k === 'talentMatrix') {
          this[k] = dedupeTalentMatrix(obj[k]);
          return;
        }
        if (k === 'employees') {
          this[k] = obj[k].map((e) => ({ ...EMPLOYEE_EXTRA_DEFAULTS, ...e }));
          return;
        }
        if (k === 'positionRecruitTags') {
          this[k] = normalizePositionRecruitTagsMap(obj[k] && typeof obj[k] === 'object' ? obj[k] : {});
          return;
        }
        if (k === 'positions') {
          this[k] = (obj[k] || []).map((p) => ({ ...p, name: normalizeJobTradeName(p.name) }));
          return;
        }
        if (k === 'users') {
          return;
        }
        if (k === 'orgSettings') {
          this[k] = { productLineHeadEmployeeId: null, ...(obj[k] || {}) };
          return;
        }
        if (k === 'rosterColumnSettings') {
          this[k] = window.TM.normalizeRosterColumnSettings(obj[k] || undefined);
          return;
        }
        this[k] = obj[k];
      });
      this.rosterColumnSettings = window.TM.normalizeRosterColumnSettings(
        obj.rosterColumnSettings != null ? obj.rosterColumnSettings : undefined,
      );
      if (window.TM.normalizePerformanceReviewsStore) {
        window.TM.normalizePerformanceReviewsStore(this);
      }
      this.syncEmployeeLinkedDataFromRoster();
      if (!importOptions || !importOptions.skipPersist) {
        this.persistAll(importOptions && importOptions.persistOptions);
      }
    },
    exportSnapshot() {
      const safeUsers = (this.users || []).map((u) => {
        const { password, ...rest } = u;
        return rest;
      });
      return {
        employees: this.employees,
        departments: this.departments,
        positions: this.positions,
        leaveRequests: this.leaveRequests,
        performanceReviews: this.performanceReviews,
        trainings: this.trainings,
        employeeTrainings: this.employeeTrainings,
        users: safeUsers,
        attendanceRules: this.attendanceRules,
        attendanceRecords: this.attendanceRecords,
        punchRecords: this.punchRecords,
        kpiLibrary: this.kpiLibrary,
        performanceCycles: this.performanceCycles,
        talentMatrix: this.talentMatrix,
        successionPlans: this.successionPlans,
        notifications: this.notifications,
        positionRecruitTags: this.positionRecruitTags || {},
        recruitmentCandidates: this.recruitmentCandidates || [],
        recruitmentPositionMetrics: this.recruitmentPositionMetrics || {},
        recruitmentPipeline: this.recruitmentPipeline || [],
        interviewerPool: this.interviewerPool || [],
        orgSettings: this.orgSettings || {},
        orgChangeRequests: this.orgChangeRequests || [],
        rosterColumnSettings: this.rosterColumnSettings,
      };
    },
    setRosterColumnSettings(raw) {
      this.rosterColumnSettings = window.TM.normalizeRosterColumnSettings(raw || undefined);
      this._markDirty('rosterColumnSettings');
      this.persistAll();
    },
  },
  getters: {
    _empMap: (state) => {
      const m = new Map();
      state.employees.forEach((e) => m.set(e.id, e));
      return m;
    },
    _deptMap: (state) => {
      const m = new Map();
      state.departments.forEach((d) => m.set(d.id, d));
      return m;
    },
    _posMap: (state) => {
      const m = new Map();
      state.positions.forEach((p) => m.set(p.id, p));
      return m;
    },
    _attIdx: (state) => {
      const m = new Map();
      (state.attendanceRecords || []).forEach((r) => {
        const key = Number(r.employeeId);
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(r);
      });
      return m;
    },
    _reviewsByEmp: (state) => {
      const m = new Map();
      (state.performanceReviews || []).forEach((r) => {
        const key = Number(r.employeeId);
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(r);
      });
      return m;
    },
    employeeById() { return (id) => this._empMap.get(id) || null; },
    departmentById() { return (id) => this._deptMap.get(id) || null; },
    positionById() { return (id) => this._posMap.get(id) || null; },
    subordinatesOf: (state) => (managerId) => state.employees.filter((e) => e.managerId === managerId),
  },
});
})();
