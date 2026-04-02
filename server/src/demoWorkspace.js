/**
 * 生成与前端 seed 结构兼容的演示工作区（精简人数，便于首次启动）
 */
function buildDemoWorkspace() {
  const JOB_TRADES = ['Frontend', 'Mobile', 'Backend', 'SDET', 'QA', 'Algorithm', 'Big Data'];
  const JOB_LEVELS = ['E', 'SE', 'EE', 'SEE', 'AM', 'M', 'PE', 'SM'];

  const departments = [
    { id: 1, name: 'Engineering', parentId: null, managerId: 1005 },
    { id: 2, name: 'Product', parentId: null, managerId: 1011 },
    { id: 3, name: 'Marketing', parentId: null, managerId: 1015 },
    { id: 4, name: 'Sales', parentId: null, managerId: 1018 },
    { id: 5, name: 'HR', parentId: null, managerId: 1001 },
  ];

  let nextPosId = 101;
  let levelSeq = 0;
  const positions = [];
  departments.forEach((d) => {
    JOB_TRADES.forEach((name) => {
      positions.push({
        id: nextPosId++,
        name,
        level: JOB_LEVELS[levelSeq % JOB_LEVELS.length],
        departmentId: d.id,
      });
      levelSeq += 1;
    });
  });

  function posId(deptId, trade) {
    const p = positions.find((x) => x.departmentId === deptId && x.name === trade);
    if (!p) throw new Error(`seed: position ${deptId} ${trade}`);
    return p.id;
  }

  function padYmd(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const coreConfigs = [
    { departmentId: 5, trade: 'Big Data', managerId: null, hireDate: '2018-06-01', status: 'active' },
    { departmentId: 5, trade: 'Algorithm', managerId: 1001, hireDate: '2020-03-15', status: 'active' },
    { departmentId: 1, trade: 'Backend', managerId: 1005, hireDate: '2019-02-01', status: 'active' },
    { departmentId: 1, trade: 'Frontend', managerId: 1005, hireDate: '2020-08-01', status: 'active' },
    { departmentId: 2, trade: 'Frontend', managerId: 1011, hireDate: '2019-07-01', status: 'active' },
    { departmentId: 4, trade: 'QA', managerId: 1018, hireDate: '2020-01-06', status: 'active' },
  ];

  const deptManagerByDeptId = { 1: 1005, 2: 1011, 3: 1015, 4: 1018, 5: 1001 };
  const statusRot = ['active', 'active', 'probation', 'active', 'leave'];
  const employees = [];
  const EMP_TOTAL = 120;
  const EMP_START_ID = 1001;

  for (let i = 0; i < EMP_TOTAL; i++) {
    const id = EMP_START_ID + i;
    const name = `Employee ${id}`;
    const gender = i % 2 === 0 ? '男' : '女';
    const birthY = 1978 + (i % 28);
    const birthday = padYmd(birthY, 1 + (i % 12), 1 + (i % 28));
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
      gradSchool: '',
      careerStartDate: '',
      levelStartDate: '',
      managementPlan: '',
      orgRole: '',
      salaryBand: '',
      age: null,
    });
  }

  const users = [
    {
      id: 1,
      username: 'hrbp',
      email: 'hrbp@company.com',
      password: '123',
      role: 'hrbp',
      realName: 'HRBP Admin',
      employeeId: null,
    },
    {
      id: 2,
      username: 'manager',
      email: 'manager@company.com',
      password: '123',
      role: 'manager',
      realName: 'Reporting Manager',
      employeeId: 1005,
    },
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

  return {
    hrScopeRootDepartmentId: null,
    employees,
    departments,
    positions,
    leaveRequests: [],
    performanceReviews: [],
    trainings: [],
    employeeTrainings: [],
    users,
    attendanceRules: {
      workStart: '09:30',
      workEnd: '18:30',
      leaveTypes: ['annual', 'sick', 'personal', 'overtime'],
      labels: { annual: 'Annual', sick: 'Sick', personal: 'Personal', overtime: 'Comp time' },
      monthlyStandardDays: 20,
      loadBandLow: 0.88,
      loadBandHigh: 1.12,
    },
    attendanceRecords: [],
    punchRecords: [],
    kpiLibrary: [],
    performanceCycles: [],
    talentMatrix: employees.filter((e) => e.status !== 'leave').map((e) => ({
      employeeId: e.id,
      performance: 'B',
      potential: 'M',
      developmentPlan: '',
    })),
    successionPlans: [],
    notifications: [],
    positionRecruitTags: {},
    recruitmentCandidates: [],
    recruitmentPositionMetrics: {},
    orgSettings: { productLineOwnerEmployeeId: null },
    orgChangeRequests: [],
    rosterColumnSettings: null,
  };
}

module.exports = { buildDemoWorkspace };
