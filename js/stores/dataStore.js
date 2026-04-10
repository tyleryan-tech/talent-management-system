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
  return Array.isArray(t) && t.length
    ? t
    : ['Frontend', 'Mobile', 'Backend', 'SDET', 'QA', 'Algorithm', 'Big Data'];
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
    orgSettings: { productLineOwnerEmployeeId: null },
    /** 组织调整审批单 */
    orgChangeRequests: [],
    /** 花名册列：顺序、显隐、表头覆盖（按产品线持久化） */
    rosterColumnSettings: null,
  }),
  actions: {
    hydrate() {
      const rawEmps = lineScopedLoad('employees', []);
      this.employees = (rawEmps || []).map((e) => ({ ...EMPLOYEE_EXTRA_DEFAULTS, ...e }));
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
        const rawUsers = lineScopedLoad('users', []) || [];
        const { users: nu, changed: usersNorm } = normalizeUsersWithDemoEmails(rawUsers);
        this.users = nu;
        if (usersNorm) {
          try {
            lineScopedSave('users', this.users);
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
        productLineOwnerEmployeeId: null,
        ...(lineScopedLoad('orgSettings', {}) || {}),
      };
      this.orgChangeRequests = lineScopedLoad('orgChangeRequests', []) || [];
      this.rosterColumnSettings = window.TM.normalizeRosterColumnSettings(
        lineScopedLoad('rosterColumnSettings', null) || undefined,
      );
      this.syncEmployeeLinkedDataFromRoster();
      try {
        this.persistAll();
      } catch (_) {
        /* ignore */
      }
    },
    persistAll(options) {
      const skipRemote = options && options.skipRemote === true;
      lineScopedSave('employees', this.employees);
      lineScopedSave('departments', this.departments);
      lineScopedSave('positions', this.positions);
      lineScopedSave('leaveRequests', this.leaveRequests);
      lineScopedSave('performanceReviews', this.performanceReviews);
      lineScopedSave('trainings', this.trainings);
      lineScopedSave('employeeTrainings', this.employeeTrainings);
      lineScopedSave('users', this.users);
      lineScopedSave('attendanceRules', this.attendanceRules);
      lineScopedSave('attendanceRecords', this.attendanceRecords);
      lineScopedSave('punchRecords', this.punchRecords);
      lineScopedSave('kpiLibrary', this.kpiLibrary);
      lineScopedSave('performanceCycles', this.performanceCycles);
      lineScopedSave('talentMatrix', this.talentMatrix);
      lineScopedSave('successionPlans', this.successionPlans);
      lineScopedSave('notifications', this.notifications);
      lineScopedSave('positionRecruitTags', this.positionRecruitTags || {});
      lineScopedSave('recruitmentCandidates', this.recruitmentCandidates || []);
      lineScopedSave('recruitmentPositionMetrics', this.recruitmentPositionMetrics || {});
      lineScopedSave('recruitmentPipeline', this.recruitmentPipeline || []);
      lineScopedSave('interviewerPool', this.interviewerPool || []);
      lineScopedSave('orgSettings', this.orgSettings || {});
      lineScopedSave('orgChangeRequests', this.orgChangeRequests || []);
      lineScopedSave('rosterColumnSettings', this.rosterColumnSettings);
      const ss = window.TM.serverSync;
      if (ss && ss.isEnabled && ss.isEnabled() && !skipRemote && !ss.isApplyingRemote) {
        if (typeof ss.scheduleWorkspacePush === 'function') ss.scheduleWorkspacePush();
      }
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

      this.performanceReviews = (this.performanceReviews || []).filter((r) => empIds.has(Number(r.employeeId)));
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
      this.users = (this.users || []).map((u) => {
        if (u.employeeId != null && !empIds.has(Number(u.employeeId))) {
          return { ...u, employeeId: null };
        }
        return u;
      });
      this.interviewerPool = (this.interviewerPool || []).filter((p) => empIds.has(Number(p.employeeId)));
    },
    // 员工
    addEmployee(row) {
      const id = uid(this.employees);
      this.employees.push({ ...EMPLOYEE_EXTRA_DEFAULTS, ...row, id });
      this.syncEmployeeLinkedDataFromRoster();
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
      this.persistAll();
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
      const owner = this.orgSettings?.productLineOwnerEmployeeId;
      if (owner != null && ids.has(Number(owner))) {
        this.orgSettings = { ...this.orgSettings, productLineOwnerEmployeeId: null };
      }
      const before = (this.employees || []).length;
      this.employees = (this.employees || [])
        .filter((e) => !ids.has(Number(e.id)))
        .map((e) =>
          e.managerId != null && ids.has(Number(e.managerId)) ? { ...e, managerId: null } : e,
        );
      const removed = before - this.employees.length;
      this.syncEmployeeLinkedDataFromRoster();
      this.persistAll();
      return { removed };
    },
    updateEmployee(id, patch) {
      const i = this.employees.findIndex((e) => e.id === id);
      if (i >= 0) {
        this.employees[i] = { ...this.employees[i], ...patch };
        this.syncEmployeeLinkedDataFromRoster();
        this.persistAll();
      }
    },
    setEmployeeStatus(id, status) {
      this.updateEmployee(id, { status });
    },
    addDepartment(row) {
      const id = uid(this.departments);
      this.departments.push({ ...row, id, hcPlan: Number(row.hcPlan) || 0 });
      this.persistAll();
      return id;
    },
    updateDeptHcPlan(id, val) {
      const i = this.departments.findIndex((d) => d.id === id);
      if (i < 0) return;
      this.departments[i] = { ...this.departments[i], hcPlan: Math.max(0, Number(val) || 0) };
      this.persistAll();
    },
    updateDepartment(id, patch) {
      const i = this.departments.findIndex((d) => d.id === id);
      if (i >= 0) {
        this.departments[i] = { ...this.departments[i], ...patch };
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
      this.departments = this.departments.filter((d) => d.id !== id);
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
      this.positions[i] = {
        ...merged,
        id: this.positions[i].id,
        name,
        departmentId: depId,
        level: normalizeJobLevel(merged.level),
        reportingManagerId: merged.reportingManagerId || null,
      };
      this.persistAll();
      return true;
    },
    removePosition(id) {
      const pid = Number(id);
      const next = { ...(this.positionRecruitTags || {}) };
      Object.keys(next).forEach((k) => {
        if (k.endsWith(`-${pid}`)) delete next[k];
      });
      this.positionRecruitTags = next;
      this.positions = this.positions.filter((p) => p.id !== id);
      this.persistAll();
    },
    updateOrgSettings(patch) {
      this.orgSettings = { ...this.orgSettings, ...patch };
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
      const own = this.orgSettings?.productLineOwnerEmployeeId;
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
      this.persistAll();
    },
    togglePositionRecruit(deptId, positionId) {
      const k = this.positionRecruitTagKey(deptId, positionId);
      const tags = { ...(this.positionRecruitTags || {}) };
      if (normalizeRecruitTagValue(tags[k])) delete tags[k];
      else tags[k] = { priority: 'medium' };
      this.positionRecruitTags = tags;
      this.persistAll();
    },
    setPositionRecruitTagged(deptId, positionId, on) {
      const k = this.positionRecruitTagKey(deptId, positionId);
      const tags = { ...(this.positionRecruitTags || {}) };
      if (on) tags[k] = { priority: 'medium' };
      else delete tags[k];
      this.positionRecruitTags = tags;
      this.persistAll();
    },
    // 请假
    updateLeaveStatus(id, status) {
      const r = this.leaveRequests.find((x) => x.id === id);
      if (r) {
        r.status = status;
        this.persistAll();
      }
    },
    addLeaveRequest(row) {
      const id = uid(this.leaveRequests);
      this.leaveRequests.push({ ...row, id, createdAt: row.createdAt || new Date().toISOString().slice(0, 10) });
      this.persistAll();
      return id;
    },
    // 绩效
    updateReview(id, patch) {
      const i = this.performanceReviews.findIndex((x) => x.id === id);
      if (i >= 0) {
        this.performanceReviews[i] = { ...this.performanceReviews[i], ...patch };
        this.persistAll();
      }
    },
    addPerformanceReview(row) {
      const id = uid(this.performanceReviews);
      this.performanceReviews.push({ ...row, id });
      this.persistAll();
      return id;
    },
    /** RM 提交初评并进入逐级审批（无上级时直接归档） */
    submitRmPerformanceReview(reviewId, payload) {
      const TM = window.TM;
      const grades = TM.PERF_GRADE_OPTIONS;
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      const r = this.performanceReviews[i];
      if (r.status !== 'rm_pending') return false;
      const g = String(payload.rmInitialGrade || '').trim();
      if (!grades.includes(g)) return false;
      const outDesc = String(payload.outputDescription || '').trim();
      if (!outDesc) return false;
      const chain = TM.buildApprovalChainAboveRm(this, r.reviewerId);
      const today = new Date().toISOString().slice(0, 10);
      const log = [...(r.approvalLog || []), { approverId: r.reviewerId, at: today, action: 'submit', note: 'RM 提交初评' }];
      const base = {
        ...r,
        historyPerformance: String(payload.historyPerformance || '').trim(),
        outputDescription: outDesc,
        rmInitialGrade: g,
        prevCycleAvgHours: payload.prevCycleAvgHours != null && payload.prevCycleAvgHours !== ''
          ? Math.round(Number(payload.prevCycleAvgHours) * 10) / 10
          : null,
        comments: String(payload.comments || '').trim(),
        devAdvice: String(payload.devAdvice || '').trim(),
        approvalChain: chain,
        approvalLog: log,
      };
      if (!chain.length) {
        this.performanceReviews[i] = {
          ...base,
          approvalStepIndex: 0,
          pendingApproverId: null,
          finalGrade: g,
          status: 'finalized',
        };
      } else {
        this.performanceReviews[i] = {
          ...base,
          approvalStepIndex: 0,
          pendingApproverId: chain[0],
          finalGrade: '',
          status: 'in_approval',
        };
      }
      this.persistAll();
      return true;
    },
    /** 逐级审批：当前待办人通过 */
    approvePerformanceReview(reviewId, actorEmployeeId, note) {
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      const r = this.performanceReviews[i];
      if (r.status !== 'in_approval' || Number(r.pendingApproverId) !== Number(actorEmployeeId)) return false;
      const chain = r.approvalChain || [];
      const idx = chain.indexOf(Number(actorEmployeeId));
      if (idx < 0) return false;
      const today = new Date().toISOString().slice(0, 10);
      const log = [...(r.approvalLog || []), {
        approverId: actorEmployeeId,
        at: today,
        action: 'approve',
        note: String(note || '').trim(),
      }];
      if (idx >= chain.length - 1) {
        const fg = String(r.rmInitialGrade || 'B').trim();
        this.performanceReviews[i] = {
          ...r,
          approvalStepIndex: chain.length,
          pendingApproverId: null,
          approvalLog: log,
          finalGrade: fg,
          status: 'finalized',
        };
      } else {
        const next = chain[idx + 1];
        this.performanceReviews[i] = {
          ...r,
          approvalStepIndex: idx + 1,
          pendingApproverId: next,
          approvalLog: log,
        };
      }
      this.persistAll();
      return true;
    },
    /** 逐级审批：驳回至 RM 修改 */
    rejectPerformanceReview(reviewId, actorEmployeeId, note) {
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      const r = this.performanceReviews[i];
      if (r.status !== 'in_approval' || Number(r.pendingApproverId) !== Number(actorEmployeeId)) return false;
      const today = new Date().toISOString().slice(0, 10);
      const log = [...(r.approvalLog || []), {
        approverId: actorEmployeeId,
        at: today,
        action: 'reject',
        note: String(note || '').trim(),
      }];
      this.performanceReviews[i] = {
        ...r,
        status: 'rm_pending',
        approvalStepIndex: 0,
        pendingApproverId: r.reviewerId,
        approvalLog: log,
        finalGrade: '',
      };
      this.persistAll();
      return true;
    },
    /** 全流程结束后仅 HRBP 可调整最终等级 */
    hrbpAdjustFinalGrade(reviewId, grade) {
      const grades = window.TM.PERF_GRADE_OPTIONS;
      const g = String(grade || '').trim();
      if (!grades.includes(g)) return false;
      const i = this.performanceReviews.findIndex((x) => x.id === reviewId);
      if (i < 0) return false;
      if (this.performanceReviews[i].status !== 'finalized') return false;
      this.performanceReviews[i] = { ...this.performanceReviews[i], finalGrade: g };
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
      this.persistAll();
      return id;
    },
    updateEmployeeTraining(id, patch) {
      const i = this.employeeTrainings.findIndex((x) => x.id === id);
      if (i >= 0) {
        this.employeeTrainings[i] = { ...this.employeeTrainings[i], ...patch };
        this.persistAll();
      }
    },
    // 考勤规则
    saveAttendanceRules(rules) {
      this.attendanceRules = { ...this.attendanceRules, ...rules };
      this.persistAll();
    },
    /** 导入打卡记录；可选 replaceMonth='2025-02' 先删除该月旧数据 */
    importPunchRecords(rows, replaceMonth) {
      if (replaceMonth) {
        const prefix = replaceMonth.length === 7 ? replaceMonth : replaceMonth.slice(0, 7);
        this.punchRecords = this.punchRecords.filter((p) => !String(p.date).startsWith(prefix));
      }
      rows.forEach((row) => {
        const id = uid(this.punchRecords);
        this.punchRecords.push({
          id,
          employeeId: Number(row.employeeId),
          date: String(row.date).trim(),
          clockIn: String(row.clockIn || '').trim(),
          clockOut: String(row.clockOut || '').trim(),
        });
      });
      this.persistAll();
      let m = null;
      if (rows.length && rows[0].date) m = String(rows[0].date).slice(0, 7);
      else if (replaceMonth) m = replaceMonth.length === 7 ? replaceMonth : String(replaceMonth).slice(0, 7);
      if (m) this.recomputeAttendanceFromPunches(m);
    },
    clearPunchRecords() {
      this.punchRecords = [];
      this.persistAll();
    },
    /**
     * 导入月度「日均平均工时」（h/日），支持一行多个月份列。
     * rows: { employeeId, ym: 'YYYY-MM', avgDailyHours }[]
     */
    importAttendanceAvgDailyHours(rows) {
      const rules = this.attendanceRules || {};
      (rows || []).forEach((item) => {
        const eid = Number(item.employeeId);
        let ym = String(item.ym || '').trim();
        if (ym.length >= 7) ym = ym.slice(0, 7);
        const hrs = Number(item.avgDailyHours);
        if (Number.isNaN(eid) || !/^\d{4}-\d{2}$/.test(ym) || Number.isNaN(hrs) || hrs < 0) return;
        let row = this.attendanceRecords.find((r) => r.employeeId === eid && r.month === ym);
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
        }
        row.avgDailyHours = Math.round(hrs * 100) / 100;
        applyAvgDailyHoursToAttendanceRow(row, rules);
      });
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

      this.employees.forEach((emp) => {
        const eid = emp.id;
        const list = byEmp.get(eid) || [];
        let row = this.attendanceRecords.find((r) => r.employeeId === eid && r.month === ym);

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
      this.persistAll();
    },
    // KPI / 周期
    addKpi(row) {
      const id = uid(this.kpiLibrary);
      this.kpiLibrary.push({ ...row, id });
      this.persistAll();
      return id;
    },
    updateKpi(id, patch) {
      const i = this.kpiLibrary.findIndex((x) => x.id === id);
      if (i >= 0) {
        this.kpiLibrary[i] = { ...this.kpiLibrary[i], ...patch };
        this.persistAll();
      }
    },
    removeKpi(id) {
      this.kpiLibrary = this.kpiLibrary.filter((x) => x.id !== id);
      this.persistAll();
    },
    addCycle(row) {
      const id = uid(this.performanceCycles);
      this.performanceCycles.push({ ...row, id });
      this.persistAll();
      return id;
    },
    updateCycle(id, patch) {
      const i = this.performanceCycles.findIndex((x) => x.id === id);
      if (i >= 0) {
        this.performanceCycles[i] = { ...this.performanceCycles[i], ...patch };
        this.persistAll();
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
      if (!opts || !opts.skipPersist) this.persistAll();
    },
    /** 高潜等场景：九宫格行上的发展计划说明（纯文本） */
    setTalentDevelopmentPlan(employeeId, text) {
      const eid = Number(employeeId);
      if (Number.isNaN(eid)) return;
      const next = String(text ?? '');
      const i = this.talentMatrix.findIndex((x) => Number(x.employeeId) === eid);
      if (i < 0) {
        this.talentMatrix = [...this.talentMatrix, {
          employeeId: eid,
          performance: 'B',
          potential: 'M',
          developmentPlan: next.trim(),
        }];
      } else {
        const cur = this.talentMatrix[i];
        const copy = [...this.talentMatrix];
        copy[i] = { ...cur, developmentPlan: next.trim() };
        this.talentMatrix = copy;
      }
      this.persistAll();
    },
    // 继任
    upsertSuccession(row) {
      const id = row.id || uid(this.successionPlans);
      const i = this.successionPlans.findIndex((x) => x.id === id);
      if (i >= 0) this.successionPlans[i] = { ...this.successionPlans[i], ...row, id };
      else this.successionPlans.push({ ...row, id });
      this.persistAll();
    },
    // 用户密码
    updateUserPassword(userId, password) {
      const u = this.users.find((x) => x.id === userId);
      if (u) {
        u.password = password;
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
          this[k] = normalizeUsersWithDemoEmails(obj[k]).users;
          return;
        }
        if (k === 'orgSettings') {
          this[k] = { productLineOwnerEmployeeId: null, ...(obj[k] || {}) };
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
      return {
        employees: this.employees,
        departments: this.departments,
        positions: this.positions,
        leaveRequests: this.leaveRequests,
        performanceReviews: this.performanceReviews,
        trainings: this.trainings,
        employeeTrainings: this.employeeTrainings,
        users: this.users,
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
      this.persistAll();
    },
  },
  getters: {
    employeeById: (state) => (id) => state.employees.find((e) => e.id === id),
    departmentById: (state) => (id) => state.departments.find((d) => d.id === id),
    positionById: (state) => (id) => state.positions.find((p) => p.id === id),
    subordinatesOf: (state) => (managerId) => state.employees.filter((e) => e.managerId === managerId),
  },
});
})();
