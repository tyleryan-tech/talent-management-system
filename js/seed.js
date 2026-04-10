/**
 * 首次启动时写入的模拟数据（符合需求文档字段）
 */
(function (TM) {
let _idLeave = 1;
let _idReview = 1;
let _idEmpTrain = 1;
let _idNotif = 1;

function nextLeaveId() {
  return _idLeave++;
}
function nextReviewId() {
  return _idReview++;
}
function nextEmpTrainId() {
  return _idEmpTrain++;
}
function nextNotifId() {
  return _idNotif++;
}

function seedAllData(lineId) {
  const lid = lineId != null ? Number(lineId) : 1;
  const saveKey = (k, v) => TM.saveKeyForLine(lid, k, v);
  const departments = [
    { id: 1, name: 'Engineering', parentId: null, managerId: 1005 },
    { id: 2, name: 'Product', parentId: null, managerId: 1011 },
    { id: 3, name: 'Marketing', parentId: null, managerId: 1015 },
    { id: 4, name: 'Sales', parentId: null, managerId: 1018 },
    { id: 5, name: 'HR', parentId: null, managerId: 1001 },
  ];

  /** Aligned with TM.JOB_TRADES; one slot set per department */
  const POSITION_CATALOG = (TM.JOB_TRADES && TM.JOB_TRADES.length)
    ? [...TM.JOB_TRADES]
    : ['Frontend', 'Mobile', 'Backend', 'SDET', 'QA', 'Algorithm', 'Big Data'];
  const LEVELS = (TM.JOB_LEVELS && TM.JOB_LEVELS.length)
    ? TM.JOB_LEVELS
    : ['E', 'SE', 'EE', 'SEE', 'AM', 'M', 'PE', 'SM'];
  let nextPosId = 101;
  let levelSeq = 0;
  const positions = [];
  departments.forEach((d) => {
    POSITION_CATALOG.forEach((name) => {
      positions.push({
        id: nextPosId++,
        name,
        level: LEVELS[levelSeq % LEVELS.length],
        departmentId: d.id,
      });
      levelSeq += 1;
    });
  });

  function posId(deptId, name) {
    const p = positions.find((x) => x.departmentId === deptId && x.name === name);
    if (!p) throw new Error('seed: position not found ' + deptId + ' / ' + name);
    return p.id;
  }

  function addYearsToDate(iso, deltaYears) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    d.setFullYear(d.getFullYear() + deltaYears);
    return d.toISOString().slice(0, 10);
  }

  /** 前 20 人：保留部门/编制/汇报关系与演示用工状态；姓名与手机邮箱一律程序化生成 */
  const coreConfigs = [
    { departmentId: 5, trade: 'Big Data', managerId: null, hireDate: '2018-06-01', status: 'active' },
    { departmentId: 5, trade: 'Algorithm', managerId: 1001, hireDate: '2020-03-15', status: 'active' },
    { departmentId: 5, trade: 'SDET', managerId: 1001, hireDate: '2021-09-01', status: 'probation' },
    { departmentId: 1, trade: 'Backend', managerId: 1005, hireDate: '2019-02-01', status: 'active' },
    { departmentId: 1, trade: 'Big Data', managerId: null, hireDate: '2017-01-10', status: 'active' },
    { departmentId: 1, trade: 'Frontend', managerId: 1005, hireDate: '2020-08-01', status: 'active' },
    { departmentId: 1, trade: 'Mobile', managerId: 1005, hireDate: '2021-01-18', status: 'active' },
    { departmentId: 1, trade: 'Algorithm', managerId: 1005, hireDate: '2019-11-20', status: 'active' },
    { departmentId: 1, trade: 'QA', managerId: 1005, hireDate: '2022-04-01', status: 'active' },
    { departmentId: 1, trade: 'SDET', managerId: 1005, hireDate: '2020-05-12', status: 'leave' },
    { departmentId: 2, trade: 'Big Data', managerId: null, hireDate: '2016-11-01', status: 'active' },
    { departmentId: 2, trade: 'Frontend', managerId: 1011, hireDate: '2019-07-01', status: 'active' },
    { departmentId: 2, trade: 'Mobile', managerId: 1011, hireDate: '2020-02-17', status: 'active' },
    { departmentId: 2, trade: 'Algorithm', managerId: 1011, hireDate: '2021-06-01', status: 'active' },
    { departmentId: 3, trade: 'Big Data', managerId: 1005, hireDate: '2018-03-01', status: 'active' },
    { departmentId: 3, trade: 'Frontend', managerId: 1015, hireDate: '2020-09-10', status: 'active' },
    { departmentId: 3, trade: 'Backend', managerId: 1015, hireDate: '2019-04-22', status: 'active' },
    { departmentId: 4, trade: 'Big Data', managerId: null, hireDate: '2015-05-01', status: 'active' },
    { departmentId: 4, trade: 'QA', managerId: 1018, hireDate: '2020-01-06', status: 'active' },
    { departmentId: 4, trade: 'Mobile', managerId: 1018, hireDate: '2021-03-15', status: 'active' },
  ];

  const deptManagerByDeptId = { 1: 1005, 2: 1011, 3: 1015, 4: 1018, 5: 1001 };
  const statusRot = ['active', 'active', 'active', 'active', 'probation', 'active', 'active', 'leave'];

  function padYmd(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function genEmployeeName(seq) {
    return `Employee ${EMP_START_ID + seq}`;
  }

  const employees = [];
  const EMP_TOTAL = 600;
  const EMP_START_ID = 1001;

  for (let i = 0; i < EMP_TOTAL; i++) {
    const id = EMP_START_ID + i;
    const name = genEmployeeName(i);
    const gender = i % 2 === 0 ? '男' : '女';
    const birthY = 1978 + (i % 28);
    const birthM = 1 + (i % 12);
    const birthD = 1 + (i % 28);
    const birthday = padYmd(birthY, birthM, birthD);
    const phone = `138${String(10000000 + id).slice(-8)}`;
    const email = `emp${id}@company.com`;

    let departmentId; let positionId; let managerId; let hireDate; let status;
    if (i < coreConfigs.length) {
      const c = coreConfigs[i];
      departmentId = c.departmentId;
      positionId = posId(c.departmentId, c.trade);
      managerId = c.managerId;
      hireDate = c.hireDate;
      status = c.status;
    } else {
      const k = i - coreConfigs.length;
      const d = departments[k % departments.length];
      const deptPositions = positions.filter((p) => p.departmentId === d.id);
      const pos = deptPositions[k % deptPositions.length];
      departmentId = d.id;
      positionId = pos.id;
      managerId = deptManagerByDeptId[d.id];
      hireDate = padYmd(2015 + (k % 11), 1 + ((k * 5) % 12), 1 + ((k * 7) % 28));
      status = statusRot[k % statusRot.length];
    }

    employees.push({
      id,
      name,
      gender,
      birthday,
      departmentId,
      positionId,
      managerId,
      hireDate,
      status,
      phone,
      email,
    });
  }

  const gradSchools = ['Tsinghua', 'Peking University', 'Zhejiang University', 'Fudan', 'SJTU', 'HUST', 'Wuhan University', 'XJTU', 'BUAA', 'Tongji', 'SYSU', 'Nanjing University'];
  const mgmtPlans = ['—', 'Annual review', 'HiPo program', 'Cross-functional rotation', 'Succession watch', 'Retention'];
  const demoOrgRoleById = { 1001: 'PIC', 1005: 'RM', 1006: 'IC', 1011: 'PIC', 1015: 'PIC', 1018: 'RM' };
  const salaryBandsRot = ['below_min', 'p25', 'p50', 'p75', 'above_max'];
  employees.forEach((e, i) => {
    e.gradSchool = gradSchools[i % gradSchools.length];
    e.careerStartDate = addYearsToDate(e.hireDate, -2 - (i % 5));
    e.levelStartDate = addYearsToDate(e.hireDate, -(i % 3));
    e.managementPlan = mgmtPlans[i % mgmtPlans.length];
    e.orgRole = demoOrgRoleById[e.id] || '';
    e.salaryBand = i < 48 ? salaryBandsRot[i % 5] : '';
    e.age = null;
  });

  const empById = new Map(employees.map((e) => [e.id, e]));
  const users = [
    { id: 1, username: 'hrbp', email: 'hrbp@company.com', password: '123', role: 'hrbp', realName: (empById.get(1001) || {}).name || '', employeeId: 1001 },
    { id: 2, username: 'manager', email: 'manager@company.com', password: '123', role: 'manager', realName: (empById.get(1005) || {}).name || '', employeeId: 1005 },
    {
      id: 3,
      username: 'superadmin',
      email: 'superadmin@company.com',
      password: '123',
      role: 'hrbp',
      superAdmin: true,
      realName: 'Super Admin',
      employeeId: null,
    },
  ];

  const leaveRequests = [
    { id: nextLeaveId(), employeeId: 1006, type: 'annual', startDate: '2025-03-10', endDate: '2025-03-12', reason: 'Family trip', status: 'pending', approverId: 1005, createdAt: '2025-03-01' },
    { id: nextLeaveId(), employeeId: 1007, type: 'sick', startDate: '2025-02-05', endDate: '2025-02-06', reason: 'Not feeling well', status: 'approved', approverId: 1005, createdAt: '2025-02-04' },
    { id: nextLeaveId(), employeeId: 1012, type: 'annual', startDate: '2025-04-01', endDate: '2025-04-03', reason: 'Annual leave', status: 'pending', approverId: 1011, createdAt: '2025-03-18' },
    { id: nextLeaveId(), employeeId: 1019, type: 'overtime', startDate: '2025-03-15', endDate: '2025-03-15', reason: 'Overtime comp day', status: 'rejected', approverId: 1018, createdAt: '2025-03-14' },
  ];

  const performanceReviews = [
    {
      id: nextReviewId(),
      employeeId: 1006,
      reviewerId: 1005,
      cycleId: 1,
      historyPerformance: 'FY2024 rating B+; stable delivery in H1.',
      outputDescription: '',
      rmInitialGrade: '',
      prevCycleAvgHours: 9.2,
      finalGrade: '',
      approvalChain: [],
      approvalStepIndex: 0,
      pendingApproverId: 1005,
      approvalLog: [],
      status: 'rm_pending',
      comments: '',
      devAdvice: '',
      createdAt: '2025-03-20',
    },
    {
      id: nextReviewId(),
      employeeId: 1012,
      reviewerId: 1011,
      cycleId: 1,
      historyPerformance: 'Last year A-; core contributor to growth initiatives.',
      outputDescription: 'Led membership growth experiments; 3 iterations shipped.',
      rmInitialGrade: 'A-',
      prevCycleAvgHours: 10.1,
      finalGrade: '',
      approvalChain: [1005],
      approvalStepIndex: 0,
      pendingApproverId: 1005,
      approvalLog: [{ approverId: 1011, at: '2025-03-19', action: 'submit', note: 'RM submitted initial review' }],
      status: 'in_approval',
      comments: 'Continue investing in the A/B platform',
      devAdvice: '',
      createdAt: '2025-03-19',
    },
    {
      id: nextReviewId(),
      employeeId: 1007,
      reviewerId: 1005,
      cycleId: 2,
      historyPerformance: 'Consistent B+ or above in past cycles.',
      outputDescription: 'Key annual project delivered on time.',
      rmInitialGrade: 'B+',
      prevCycleAvgHours: 8.5,
      finalGrade: 'B+',
      approvalChain: [],
      approvalStepIndex: 0,
      pendingApproverId: null,
      approvalLog: [],
      status: 'finalized',
      comments: '',
      devAdvice: '',
      createdAt: '2025-01-08',
    },
  ];

  const trainings = [
    { id: 1, title: 'Vue 3 in Practice', description: 'Reactivity and Composition API', category: 'Tech', durationHours: 8 },
    { id: 2, title: 'Communication & Influence', description: 'Workplace communication and upward management', category: 'Soft skills', durationHours: 4 },
    { id: 3, title: 'Data-Driven Product Decisions', description: 'Metrics and A/B testing basics', category: 'Product', durationHours: 6 },
    { id: 4, title: 'Sales Funnel Management', description: 'B2B pipeline breakdown', category: 'Sales', durationHours: 5 },
  ];

  const employeeTrainings = [
    { id: nextEmpTrainId(), employeeId: 1006, trainingId: 1, status: 'in_progress', recommendedBy: 1005, completionDate: null },
    { id: nextEmpTrainId(), employeeId: 1007, trainingId: 2, status: 'completed', recommendedBy: 1005, completionDate: '2025-02-01' },
  ];

  const attendanceRules = {
    workStart: '09:30',
    workEnd: '18:30',
    leaveTypes: ['annual', 'sick', 'personal', 'overtime'],
    labels: { annual: 'Annual', sick: 'Sick', personal: 'Personal', overtime: 'Comp time' },
    monthlyStandardDays: 20,
    loadBandLow: 0.88,
    loadBandHigh: 1.12,
  };

  const febWorkdays = [
    '2025-02-03', '2025-02-04', '2025-02-05', '2025-02-06', '2025-02-07',
    '2025-02-10', '2025-02-11', '2025-02-12', '2025-02-13', '2025-02-14',
    '2025-02-17', '2025-02-18', '2025-02-19', '2025-02-20', '2025-02-21',
    '2025-02-24', '2025-02-25', '2025-02-26', '2025-02-27', '2025-02-28',
  ];
  let punchId = 1;
  const punchRecords = [];
  febWorkdays.slice(0, 18).forEach((d) => {
    punchRecords.push({ id: punchId++, employeeId: 1006, date: d, clockIn: '09:30', clockOut: '16:30' });
  });
  febWorkdays.slice(0, 18).forEach((d) => {
    punchRecords.push({ id: punchId++, employeeId: 1007, date: d, clockIn: '09:30', clockOut: '18:30' });
  });
  febWorkdays.forEach((d) => {
    punchRecords.push({ id: punchId++, employeeId: 1005, date: d, clockIn: '09:00', clockOut: '19:30' });
  });

  const attendanceRecords = employees.map((e, i) => ({
    id: i + 1,
    employeeId: e.id,
    month: '2025-02',
    workDays: 20,
    presentDays: 18 + (i % 3),
    lateCount: i % 4,
    leaveDays: i % 2,
    attendanceRate: 0,
  }));
  attendanceRecords.forEach((r) => {
    r.attendanceRate = Math.min(100, Math.round((r.presentDays / r.workDays) * 100));
  });

  const kpiLibrary = [];

  const performanceCycles = [
    { id: 1, name: 'H1 2025', cycleType: 'half_year', startDate: '2025-01-01', endDate: '2025-06-30', status: 'open' },
    { id: 2, name: 'FY 2024', cycleType: 'year', startDate: '2024-01-01', endDate: '2024-12-31', status: 'closed' },
  ];

  const talentMatrix = employees.slice(4, 14).map((e, i) => ({
    employeeId: e.id,
    performance: ['A', 'B', 'C'][i % 3],
    potential: ['H', 'M', 'L'][Math.floor(i / 3) % 3],
  }));

  const successionPlans = [
    { id: 1, positionId: posId(1, 'Backend'), successorIds: [1004, 1008], note: 'Engineering · Backend succession pool' },
    { id: 2, positionId: posId(2, 'Algorithm'), successorIds: [1012, 1013], note: 'Product · Algorithm bench' },
  ];

  const notifications = [
    { id: nextNotifId(), employeeId: 1006, title: 'Training recommendation', message: 'Your manager recommended “Vue 3 in Practice”.', read: false, createdAt: '2025-03-18' },
  ];

  /* ── Recruitment: open positions (positionRecruitTags) ── */
  const positionRecruitTags = {};
  const recruitmentPositionMetrics = {};
  const recruitmentCandidates = [];
  const openSlots = [
    { deptId: 1, posName: 'Frontend',  priority: 'high' },
    { deptId: 1, posName: 'Backend',   priority: 'high' },
    { deptId: 1, posName: 'Algorithm', priority: 'medium' },
    { deptId: 1, posName: 'SDET',      priority: 'low' },
    { deptId: 2, posName: 'Frontend',  priority: 'high' },
    { deptId: 2, posName: 'Big Data',  priority: 'medium' },
    { deptId: 3, posName: 'Frontend',  priority: 'medium' },
    { deptId: 3, posName: 'Backend',   priority: 'low' },
    { deptId: 4, posName: 'Mobile',    priority: 'medium' },
  ];
  openSlots.forEach(({ deptId, posName, priority }) => {
    const p = positions.find((x) => x.departmentId === deptId && x.name === posName);
    if (!p) return;
    const taken = employees.some((e) => e.positionId === p.id && e.departmentId === p.departmentId && e.status !== 'leave');
    if (taken) return;
    positionRecruitTags[`${deptId}-${p.id}`] = { priority };
  });

  /* ── Pipeline: 30 mock candidates ── */
  const recruitmentPipeline = [
    { id:'P001', recruitDate:'2026-01-05', name:'张明华', team:'Engineering', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'王强', interviewFinal:'pass', interviewFinalBy:'陈静', score:'4', offering:'accepted', onboardDate:'2026-03-01', comments:'', yoe:'5' },
    { id:'P002', recruitDate:'2026-01-08', name:'李思雨', team:'Engineering', position:'Frontend', hiringLine:'L1', recruitType:'campus', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'王强', interviewFinal:'fail', interviewFinalBy:'陈静', score:'3', offering:'', onboardDate:'', comments:'终面表现一般', yoe:'0' },
    { id:'P003', recruitDate:'2026-01-10', name:'王浩然', team:'Engineering', position:'Backend', hiringLine:'L2', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'pass', interview2By:'张伟', interviewFinal:'pass', interviewFinalBy:'陈静', score:'5', offering:'accepted', onboardDate:'2026-02-20', comments:'优秀候选人', yoe:'8' },
    { id:'P004', recruitDate:'2026-01-12', name:'赵晓琳', team:'Engineering', position:'Backend', hiringLine:'L2', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'fail', interview2By:'张伟', interviewFinal:'', interviewFinalBy:'', score:'3', offering:'', onboardDate:'', comments:'', yoe:'4' },
    { id:'P005', recruitDate:'2026-01-15', name:'刘佳怡', team:'Engineering', position:'Algorithm', hiringLine:'L3', recruitType:'campus', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pass', interview2By:'刘洋', interviewFinal:'pass', interviewFinalBy:'王强', score:'4', offering:'pending', onboardDate:'', comments:'等待offer审批', yoe:'0' },
    { id:'P006', recruitDate:'2026-01-18', name:'陈宇飞', team:'Engineering', position:'Algorithm', hiringLine:'L3', recruitType:'social', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pending', interview1By:'陈静', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'一面待安排', yoe:'6' },
    { id:'P007', recruitDate:'2026-01-20', name:'孙婷婷', team:'Engineering', position:'SDET', hiringLine:'L1', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'王强', interviewFinal:'pass', interviewFinalBy:'陈静', score:'4', offering:'declined', onboardDate:'', comments:'候选人拒绝offer', yoe:'3' },
    { id:'P008', recruitDate:'2026-01-22', name:'周文博', team:'Engineering', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pending', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'', yoe:'3' },
    { id:'P009', recruitDate:'2026-01-25', name:'吴美琪', team:'Engineering', position:'SDET', hiringLine:'L1', recruitType:'campus', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'陈静', interviewFinal:'pass', interviewFinalBy:'王强', score:'3', offering:'accepted', onboardDate:'', comments:'待入职', yoe:'0' },
    { id:'P010', recruitDate:'2026-02-01', name:'郑凯文', team:'Engineering', position:'Backend', hiringLine:'L2', recruitType:'social', recruiter:'孙磊', hrScreening:'fail', hrScreeningBy:'刘洋', hrInterview:'', interview1:'', interview1By:'', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'简历不符合要求', yoe:'2' },
    { id:'P011', recruitDate:'2026-02-03', name:'黄诗涵', team:'Product', position:'Frontend', hiringLine:'L1', recruitType:'campus', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pass', interview2By:'刘洋', interviewFinal:'pass', interviewFinalBy:'张伟', score:'5', offering:'accepted', onboardDate:'2026-03-15', comments:'', yoe:'0' },
    { id:'P012', recruitDate:'2026-02-05', name:'林浩宇', team:'Product', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'fail', interview2By:'刘洋', interviewFinal:'', interviewFinalBy:'', score:'2', offering:'', onboardDate:'', comments:'技术深度不足', yoe:'3' },
    { id:'P013', recruitDate:'2026-02-08', name:'高雨晨', team:'Product', position:'Big Data', hiringLine:'L2', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'pass', interview2By:'张伟', interviewFinal:'pending', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'终面待安排', yoe:'7' },
    { id:'P014', recruitDate:'2026-02-10', name:'何子轩', team:'Product', position:'Big Data', hiringLine:'L2', recruitType:'campus', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'fail', interview1By:'王强', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'2', offering:'', onboardDate:'', comments:'', yoe:'0' },
    { id:'P015', recruitDate:'2026-02-12', name:'马思聪', team:'Marketing', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'陈静', interviewFinal:'pass', interviewFinalBy:'刘洋', score:'4', offering:'accepted', onboardDate:'2026-04-01', comments:'', yoe:'5' },
    { id:'P016', recruitDate:'2026-02-15', name:'罗雅琪', team:'Marketing', position:'Frontend', hiringLine:'L1', recruitType:'campus', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'陈静', interviewFinal:'fail', interviewFinalBy:'刘洋', score:'3', offering:'', onboardDate:'', comments:'终面未通过', yoe:'0' },
    { id:'P017', recruitDate:'2026-02-18', name:'谢明辉', team:'Marketing', position:'Backend', hiringLine:'L2', recruitType:'social', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'pass', interview2By:'张伟', interviewFinal:'pass', interviewFinalBy:'陈静', score:'4', offering:'declined', onboardDate:'', comments:'薪资未达预期', yoe:'6' },
    { id:'P018', recruitDate:'2026-02-20', name:'徐志远', team:'Marketing', position:'Backend', hiringLine:'L2', recruitType:'social', recruiter:'周婷', hrScreening:'fail', hrScreeningBy:'刘洋', hrInterview:'', interview1:'', interview1By:'', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'经验不匹配', yoe:'1' },
    { id:'P019', recruitDate:'2026-02-22', name:'杨雨萱', team:'Sales', position:'Mobile', hiringLine:'L1', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'王强', interviewFinal:'pass', interviewFinalBy:'刘洋', score:'5', offering:'accepted', onboardDate:'', comments:'待入职', yoe:'4' },
    { id:'P020', recruitDate:'2026-02-25', name:'朱伟杰', team:'Sales', position:'Mobile', hiringLine:'L1', recruitType:'campus', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'fail', interview2By:'王强', interviewFinal:'', interviewFinalBy:'', score:'2', offering:'', onboardDate:'', comments:'', yoe:'0' },
    { id:'P021', recruitDate:'2026-03-01', name:'丁晓峰', team:'Engineering', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pass', interview2By:'王强', interviewFinal:'pass', interviewFinalBy:'张伟', score:'5', offering:'accepted', onboardDate:'2026-04-15', comments:'资深前端', yoe:'10' },
    { id:'P022', recruitDate:'2026-03-03', name:'范思琪', team:'Engineering', position:'Algorithm', hiringLine:'L3', recruitType:'campus', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pending', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'', yoe:'0' },
    { id:'P023', recruitDate:'2026-03-05', name:'蔡明远', team:'Product', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'陈静', interviewFinal:'pass', interviewFinalBy:'王强', score:'3', offering:'declined', onboardDate:'', comments:'收到其他offer', yoe:'4' },
    { id:'P024', recruitDate:'2026-03-08', name:'曹雪琴', team:'Engineering', position:'Backend', hiringLine:'L2', recruitType:'campus', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'pass', interview2By:'刘洋', interviewFinal:'pass', interviewFinalBy:'陈静', score:'4', offering:'accepted', onboardDate:'2026-04-20', comments:'校招优秀', yoe:'0' },
    { id:'P025', recruitDate:'2026-03-10', name:'彭浩然', team:'Engineering', position:'SDET', hiringLine:'L1', recruitType:'social', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'fail', interview1By:'张伟', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'2', offering:'', onboardDate:'', comments:'测试基础薄弱', yoe:'2' },
    { id:'P026', recruitDate:'2026-03-12', name:'董雅婷', team:'Product', position:'Big Data', hiringLine:'L2', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'pass', interview2By:'张伟', interviewFinal:'pass', interviewFinalBy:'陈静', score:'4', offering:'accepted', onboardDate:'', comments:'待入职', yoe:'6' },
    { id:'P027', recruitDate:'2026-03-15', name:'宋子涵', team:'Engineering', position:'Frontend', hiringLine:'L1', recruitType:'campus', recruiter:'赵敏', hrScreening:'fail', hrScreeningBy:'李娜', hrInterview:'', interview1:'', interview1By:'', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'简历筛选未通过', yoe:'0' },
    { id:'P028', recruitDate:'2026-03-18', name:'邓瑞祥', team:'Marketing', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pass', interview2By:'张伟', interviewFinal:'pending', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'终面待安排', yoe:'5' },
    { id:'P029', recruitDate:'2026-03-20', name:'姜文静', team:'Engineering', position:'Algorithm', hiringLine:'L3', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pass', interview2By:'王强', interviewFinal:'pass', interviewFinalBy:'张伟', score:'5', offering:'declined', onboardDate:'', comments:'去了竞争对手', yoe:'8' },
    { id:'P030', recruitDate:'2026-03-22', name:'秦雨辰', team:'Sales', position:'Mobile', hiringLine:'L1', recruitType:'campus', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'刘洋', interviewFinal:'pass', interviewFinalBy:'王强', score:'3', offering:'accepted', onboardDate:'2026-05-01', comments:'', yoe:'0' },
  ].map((c) => {
    const base = {};
    ['recruitDate','name','team','position','hiringLine','recruitType','recruiter',
     'hrScreening','hrScreeningBy','hrInterview','interview1','interview1By',
     'interview2','interview2By','interviewFinal','interviewFinalBy',
     'score','offering','onboardDate','comments','yoe',
     'personnelType','companyLevel','levelPosition','shippedDate','offerBIDate',
     'cash','offerMakeScope','workLocation','basePackage','briStart'].forEach((k) => { base[k] = c[k] || ''; });
    base.id = c.id;
    return base;
  });

  saveKey('departments', departments);
  saveKey('positions', positions);
  saveKey('employees', employees);
  saveKey('users', users);
  saveKey('leaveRequests', leaveRequests);
  saveKey('performanceReviews', performanceReviews);
  saveKey('trainings', trainings);
  saveKey('employeeTrainings', employeeTrainings);
  saveKey('attendanceRules', attendanceRules);
  saveKey('punchRecords', punchRecords);
  saveKey('attendanceRecords', attendanceRecords);
  saveKey('kpiLibrary', kpiLibrary);
  saveKey('performanceCycles', performanceCycles);
  saveKey('talentMatrix', talentMatrix);
  saveKey('successionPlans', successionPlans);
  saveKey('notifications', notifications);
  saveKey('positionRecruitTags', positionRecruitTags);
  saveKey('recruitmentPositionMetrics', recruitmentPositionMetrics);
  saveKey('recruitmentCandidates', recruitmentCandidates);
  saveKey('recruitmentPipeline', recruitmentPipeline);

  const interviewerPool = [
    { id: 1, employeeId: 1005, trades: ['Frontend', 'Backend'], levels: ['E', 'SE', 'EE'] },
    { id: 2, employeeId: 1008, trades: ['Algorithm', 'Big Data'], levels: ['SE', 'EE', 'SEE'] },
    { id: 3, employeeId: 1011, trades: ['Frontend', 'Mobile'], levels: ['E', 'SE'] },
    { id: 4, employeeId: 1006, trades: ['Frontend'], levels: ['E', 'SE', 'EE', 'SEE'] },
    { id: 5, employeeId: 1004, trades: ['Backend', 'SDET'], levels: ['E', 'SE', 'EE'] },
    { id: 6, employeeId: 1009, trades: ['QA', 'SDET'], levels: ['E', 'SE'] },
  ];
  saveKey('interviewerPool', interviewerPool);

  saveKey('orgSettings', { productLineOwnerEmployeeId: 1001 });
  saveKey('orgChangeRequests', []);
  saveKey('_seedVersion', 13);

  return { seeded: true };
}

TM.seedAllData = seedAllData;

/**
 * Patch-only: inject pipeline demo data + recruit tags into existing line
 * without touching employees, departments, positions, etc.
 */
function seedPipelineDemo(lineId) {
  const lid = lineId != null ? Number(lineId) : 1;
  const saveKey = (k, v) => TM.saveKeyForLine(lid, k, v);
  const departments = TM.loadKeyForLine(lid, 'departments', []) || [];
  const positions = TM.loadKeyForLine(lid, 'positions', []) || [];
  const employees = TM.loadKeyForLine(lid, 'employees', []) || [];

  const openSlots = [
    { deptId: 1, posName: 'Frontend',  priority: 'high' },
    { deptId: 1, posName: 'Backend',   priority: 'high' },
    { deptId: 1, posName: 'Algorithm', priority: 'medium' },
    { deptId: 1, posName: 'SDET',      priority: 'low' },
    { deptId: 2, posName: 'Frontend',  priority: 'high' },
    { deptId: 2, posName: 'Big Data',  priority: 'medium' },
    { deptId: 3, posName: 'Frontend',  priority: 'medium' },
    { deptId: 3, posName: 'Backend',   priority: 'low' },
    { deptId: 4, posName: 'Mobile',    priority: 'medium' },
  ];
  const existingTags = TM.loadKeyForLine(lid, 'positionRecruitTags', {}) || {};
  const tags = { ...existingTags };
  openSlots.forEach(({ deptId, posName, priority }) => {
    const p = positions.find((x) => x.departmentId === deptId && x.name === posName);
    if (!p) return;
    const taken = employees.some((e) => e.positionId === p.id && e.departmentId === p.departmentId && e.status !== 'leave');
    if (taken) return;
    const k = `${deptId}-${p.id}`;
    if (!tags[k]) tags[k] = { priority };
  });
  saveKey('positionRecruitTags', tags);

  const deptMap = {};
  departments.forEach((d) => { deptMap[d.id] = d.name; });

  const pipeline = [
    { id:'P001', recruitDate:'2026-01-05', name:'张明华', team:'Engineering', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'王强', interviewFinal:'pass', interviewFinalBy:'陈静', score:'4', offering:'accepted', onboardDate:'2026-03-01', comments:'', yoe:'5' },
    { id:'P002', recruitDate:'2026-01-08', name:'李思雨', team:'Engineering', position:'Frontend', hiringLine:'L1', recruitType:'campus', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'王强', interviewFinal:'fail', interviewFinalBy:'陈静', score:'3', offering:'', onboardDate:'', comments:'终面表现一般', yoe:'0' },
    { id:'P003', recruitDate:'2026-01-10', name:'王浩然', team:'Engineering', position:'Backend', hiringLine:'L2', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'pass', interview2By:'张伟', interviewFinal:'pass', interviewFinalBy:'陈静', score:'5', offering:'accepted', onboardDate:'2026-02-20', comments:'优秀候选人', yoe:'8' },
    { id:'P004', recruitDate:'2026-01-12', name:'赵晓琳', team:'Engineering', position:'Backend', hiringLine:'L2', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'fail', interview2By:'张伟', interviewFinal:'', interviewFinalBy:'', score:'3', offering:'', onboardDate:'', comments:'', yoe:'4' },
    { id:'P005', recruitDate:'2026-01-15', name:'刘佳怡', team:'Engineering', position:'Algorithm', hiringLine:'L3', recruitType:'campus', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pass', interview2By:'刘洋', interviewFinal:'pass', interviewFinalBy:'王强', score:'4', offering:'pending', onboardDate:'', comments:'等待offer审批', yoe:'0' },
    { id:'P006', recruitDate:'2026-01-18', name:'陈宇飞', team:'Engineering', position:'Algorithm', hiringLine:'L3', recruitType:'social', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pending', interview1By:'陈静', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'一面待安排', yoe:'6' },
    { id:'P007', recruitDate:'2026-01-20', name:'孙婷婷', team:'Engineering', position:'SDET', hiringLine:'L1', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'王强', interviewFinal:'pass', interviewFinalBy:'陈静', score:'4', offering:'declined', onboardDate:'', comments:'候选人拒绝offer', yoe:'3' },
    { id:'P008', recruitDate:'2026-01-22', name:'周文博', team:'Engineering', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pending', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'', yoe:'3' },
    { id:'P009', recruitDate:'2026-01-25', name:'吴美琪', team:'Engineering', position:'SDET', hiringLine:'L1', recruitType:'campus', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'陈静', interviewFinal:'pass', interviewFinalBy:'王强', score:'3', offering:'accepted', onboardDate:'', comments:'待入职', yoe:'0' },
    { id:'P010', recruitDate:'2026-02-01', name:'郑凯文', team:'Engineering', position:'Backend', hiringLine:'L2', recruitType:'social', recruiter:'孙磊', hrScreening:'fail', hrScreeningBy:'刘洋', hrInterview:'', interview1:'', interview1By:'', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'简历不符合要求', yoe:'2' },
    { id:'P011', recruitDate:'2026-02-03', name:'黄诗涵', team:'Product', position:'Frontend', hiringLine:'L1', recruitType:'campus', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pass', interview2By:'刘洋', interviewFinal:'pass', interviewFinalBy:'张伟', score:'5', offering:'accepted', onboardDate:'2026-03-15', comments:'', yoe:'0' },
    { id:'P012', recruitDate:'2026-02-05', name:'林浩宇', team:'Product', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'fail', interview2By:'刘洋', interviewFinal:'', interviewFinalBy:'', score:'2', offering:'', onboardDate:'', comments:'技术深度不足', yoe:'3' },
    { id:'P013', recruitDate:'2026-02-08', name:'高雨晨', team:'Product', position:'Big Data', hiringLine:'L2', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'pass', interview2By:'张伟', interviewFinal:'pending', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'终面待安排', yoe:'7' },
    { id:'P014', recruitDate:'2026-02-10', name:'何子轩', team:'Product', position:'Big Data', hiringLine:'L2', recruitType:'campus', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'fail', interview1By:'王强', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'2', offering:'', onboardDate:'', comments:'', yoe:'0' },
    { id:'P015', recruitDate:'2026-02-12', name:'马思聪', team:'Marketing', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'陈静', interviewFinal:'pass', interviewFinalBy:'刘洋', score:'4', offering:'accepted', onboardDate:'2026-04-01', comments:'', yoe:'5' },
    { id:'P016', recruitDate:'2026-02-15', name:'罗雅琪', team:'Marketing', position:'Frontend', hiringLine:'L1', recruitType:'campus', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'陈静', interviewFinal:'fail', interviewFinalBy:'刘洋', score:'3', offering:'', onboardDate:'', comments:'终面未通过', yoe:'0' },
    { id:'P017', recruitDate:'2026-02-18', name:'谢明辉', team:'Marketing', position:'Backend', hiringLine:'L2', recruitType:'social', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'pass', interview2By:'张伟', interviewFinal:'pass', interviewFinalBy:'陈静', score:'4', offering:'declined', onboardDate:'', comments:'薪资未达预期', yoe:'6' },
    { id:'P018', recruitDate:'2026-02-20', name:'徐志远', team:'Marketing', position:'Backend', hiringLine:'L2', recruitType:'social', recruiter:'周婷', hrScreening:'fail', hrScreeningBy:'刘洋', hrInterview:'', interview1:'', interview1By:'', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'经验不匹配', yoe:'1' },
    { id:'P019', recruitDate:'2026-02-22', name:'杨雨萱', team:'Sales', position:'Mobile', hiringLine:'L1', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'王强', interviewFinal:'pass', interviewFinalBy:'刘洋', score:'5', offering:'accepted', onboardDate:'', comments:'待入职', yoe:'4' },
    { id:'P020', recruitDate:'2026-02-25', name:'朱伟杰', team:'Sales', position:'Mobile', hiringLine:'L1', recruitType:'campus', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'fail', interview2By:'王强', interviewFinal:'', interviewFinalBy:'', score:'2', offering:'', onboardDate:'', comments:'', yoe:'0' },
    { id:'P021', recruitDate:'2026-03-01', name:'丁晓峰', team:'Engineering', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pass', interview2By:'王强', interviewFinal:'pass', interviewFinalBy:'张伟', score:'5', offering:'accepted', onboardDate:'2026-04-15', comments:'资深前端', yoe:'10' },
    { id:'P022', recruitDate:'2026-03-03', name:'范思琪', team:'Engineering', position:'Algorithm', hiringLine:'L3', recruitType:'campus', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pending', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'', yoe:'0' },
    { id:'P023', recruitDate:'2026-03-05', name:'蔡明远', team:'Product', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'陈静', interviewFinal:'pass', interviewFinalBy:'王强', score:'3', offering:'declined', onboardDate:'', comments:'收到其他offer', yoe:'4' },
    { id:'P024', recruitDate:'2026-03-08', name:'曹雪琴', team:'Engineering', position:'Backend', hiringLine:'L2', recruitType:'campus', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'pass', interview2By:'刘洋', interviewFinal:'pass', interviewFinalBy:'陈静', score:'4', offering:'accepted', onboardDate:'2026-04-20', comments:'校招优秀', yoe:'0' },
    { id:'P025', recruitDate:'2026-03-10', name:'彭浩然', team:'Engineering', position:'SDET', hiringLine:'L1', recruitType:'social', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'fail', interview1By:'张伟', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'2', offering:'', onboardDate:'', comments:'测试基础薄弱', yoe:'2' },
    { id:'P026', recruitDate:'2026-03-12', name:'董雅婷', team:'Product', position:'Big Data', hiringLine:'L2', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'王强', interview2:'pass', interview2By:'张伟', interviewFinal:'pass', interviewFinalBy:'陈静', score:'4', offering:'accepted', onboardDate:'', comments:'待入职', yoe:'6' },
    { id:'P027', recruitDate:'2026-03-15', name:'宋子涵', team:'Engineering', position:'Frontend', hiringLine:'L1', recruitType:'campus', recruiter:'赵敏', hrScreening:'fail', hrScreeningBy:'李娜', hrInterview:'', interview1:'', interview1By:'', interview2:'', interview2By:'', interviewFinal:'', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'简历筛选未通过', yoe:'0' },
    { id:'P028', recruitDate:'2026-03-18', name:'邓瑞祥', team:'Marketing', position:'Frontend', hiringLine:'L1', recruitType:'social', recruiter:'周婷', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pass', interview2By:'张伟', interviewFinal:'pending', interviewFinalBy:'', score:'', offering:'', onboardDate:'', comments:'终面待安排', yoe:'5' },
    { id:'P029', recruitDate:'2026-03-20', name:'姜文静', team:'Engineering', position:'Algorithm', hiringLine:'L3', recruitType:'social', recruiter:'孙磊', hrScreening:'pass', hrScreeningBy:'刘洋', hrInterview:'pass', interview1:'pass', interview1By:'陈静', interview2:'pass', interview2By:'王强', interviewFinal:'pass', interviewFinalBy:'张伟', score:'5', offering:'declined', onboardDate:'', comments:'去了竞争对手', yoe:'8' },
    { id:'P030', recruitDate:'2026-03-22', name:'秦雨辰', team:'Sales', position:'Mobile', hiringLine:'L1', recruitType:'campus', recruiter:'赵敏', hrScreening:'pass', hrScreeningBy:'李娜', hrInterview:'pass', interview1:'pass', interview1By:'张伟', interview2:'pass', interview2By:'刘洋', interviewFinal:'pass', interviewFinalBy:'王强', score:'3', offering:'accepted', onboardDate:'2026-05-01', comments:'', yoe:'0' },
  ].map((c) => {
    const base = {};
    ['recruitDate','name','team','position','hiringLine','recruitType','recruiter',
     'hrScreening','hrScreeningBy','hrInterview','interview1','interview1By',
     'interview2','interview2By','interviewFinal','interviewFinalBy',
     'score','offering','onboardDate','comments','yoe',
     'personnelType','companyLevel','levelPosition','shippedDate','offerBIDate',
     'cash','offerMakeScope','workLocation','basePackage','briStart'].forEach((k) => { base[k] = c[k] || ''; });
    base.id = c.id;
    return base;
  });
  const existingPipe = TM.loadKeyForLine(lid, 'recruitmentPipeline', null);
  if (!existingPipe || !existingPipe.length) {
    saveKey('recruitmentPipeline', pipeline);
  }

  const existingPool = TM.loadKeyForLine(lid, 'interviewerPool', null);
  if (!existingPool || !existingPool.length) {
    const emps = TM.loadKeyForLine(lid, 'employees', []) || [];
    const pool = [];
    let pid = 1;
    const poolConfigs = [
      { trades: ['Frontend', 'Backend'], levels: ['E', 'SE', 'EE'] },
      { trades: ['Algorithm', 'Big Data'], levels: ['SE', 'EE', 'SEE'] },
      { trades: ['Frontend', 'Mobile'], levels: ['E', 'SE'] },
      { trades: ['Frontend'], levels: ['E', 'SE', 'EE', 'SEE'] },
      { trades: ['Backend', 'SDET'], levels: ['E', 'SE', 'EE'] },
      { trades: ['QA', 'SDET'], levels: ['E', 'SE'] },
    ];
    const activeEmps = emps.filter((e) => e.status !== 'leave');
    poolConfigs.forEach((cfg, i) => {
      if (activeEmps[i]) {
        pool.push({ id: pid++, employeeId: activeEmps[i].id, trades: cfg.trades, levels: cfg.levels });
      }
    });
    saveKey('interviewerPool', pool);
  }
}
TM.seedPipelineDemo = seedPipelineDemo;
})(window.TM);
