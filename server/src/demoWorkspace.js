/**
 * 生成与前端 seed 结构兼容的演示工作区（精简人数，便于首次启动）
 */
function buildDemoWorkspace() {
  const JOB_TRADES = ['Frontend', 'Mobile', 'Backend', 'SDET', 'QA', 'Algorithm', 'Big Data'];
  const JOB_LEVELS = ['E', 'SE', 'EE', 'SEE', 'AM', 'M', 'PE', 'SM'];

  const departments = [
    { id: 1, name: '研发部', parentId: null, managerId: 1005 },
    { id: 2, name: '产品部', parentId: null, managerId: 1011 },
    { id: 3, name: '市场部', parentId: null, managerId: 1015 },
    { id: 4, name: '销售部', parentId: null, managerId: 1018 },
    { id: 5, name: '人力资源部', parentId: null, managerId: 1001 },
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
    const CORE_NAMES = ['张文华','周海涛','吴雨桐','林晓东','陈志伟','杨思琪','赵鹏飞','孙婉清','黄志强','马天宇','李明远','韩雪梅','钱浩宇','郑雅琴','王雅琴','谢子涵','宋佳怡','刘建国','高瑞祥','邓文杰'];
    const SURNAMES = ['张','王','李','赵','陈','刘','杨','黄','周','吴','徐','孙','马','胡','朱','郭','何','林','罗','高','郑','梁','谢','宋','唐','韩','冯','董','程','曹','袁','邓','彭','苏','蒋','蔡','贾','丁','魏','薛','叶','阎','余','潘','杜','戴','夏','钟','汪','田'];
    const GIVEN_NAMES = ['明远','晓峰','伟华','婷婷','建国','丽华','志强','海燕','大伟','思远','秀英','文博','小明','文静','子轩','雅琪','浩然','天宇','雨薇','晨曦','博文','诗涵','宇飞','佳怡','嘉诚','雪莹','思源','俊杰','梦琪','泽宇','欣怡','浩宇','美琪','文杰','雨辰','子涵','瑞祥','雅婷','凯文','明辉','静怡','志远','慧敏','鹏飞','雨萱','伟杰','嘉怡','文涛','思彤','家豪','芷若','皓轩','语嫣','子墨','若曦','逸飞','紫萱','昊天','雨桐','书瑶','睿智','诗琪','浩轩','沐阳','芸熙','子豪','晨露','心怡','弘毅','雅文','靖宇','婉仪','清扬','星辰','悦然','景行','安然','知行','明德','致远'];
    const name = i < CORE_NAMES.length ? CORE_NAMES[i] : SURNAMES[(i * 7 + 3) % 50] + GIVEN_NAMES[(i * 13 + 5) % 80];
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
      realName: '张文华',
      employeeId: null,
    },
    {
      id: 2,
      username: 'manager',
      email: 'manager@company.com',
      password: '123',
      role: 'manager',
      realName: '陈志伟',
      employeeId: 1005,
    },
    {
      id: 3,
      username: 'superadmin',
      email: 'superadmin@company.com',
      password: '123',
      role: 'hrbp',
      superAdmin: true,
      realName: '超级管理员',
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
