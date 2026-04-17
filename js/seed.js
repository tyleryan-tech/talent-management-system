/**
 * 首次启动时写入的模拟数据（符合需求文档字段）
 * v20: 全面重构 — 4层组织架构 · 210人 · 100候选人 · 4年绩效历史 · 2026H1周期
 */
(function (TM) {
var _idLeave = 1, _idReview = 1, _idEmpTrain = 1, _idNotif = 1;
function nextLeaveId() { return _idLeave++; }
function nextReviewId() { return _idReview++; }
function nextEmpTrainId() { return _idEmpTrain++; }
function nextNotifId() { return _idNotif++; }

/* ══════════════════════════════════════════════════════════
 *  seedAllData — 主产品线综合种子数据
 * ══════════════════════════════════════════════════════════ */
function seedAllData(lineId) {
  var lid = lineId != null ? Number(lineId) : 1;
  var saveKey = function (k, v) { TM.saveKeyForLine(lid, k, v); };

  /* ── helpers ── */
  function padYmd(y, m, d) { return y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0'); }
  function addYears(iso, dy) { var dt = new Date(iso); dt.setFullYear(dt.getFullYear() + dy); return dt.toISOString().slice(0,10); }
  function seededRand(seed) { var x = seed; return function(){ x = (x*1103515245+12345)&0x7fffffff; return x/0x7fffffff; }; }

  var SURNAMES = ['张','王','李','赵','陈','刘','杨','黄','周','吴','徐','孙','马','胡','朱','郭','何','林','罗','高',
    '郑','梁','谢','宋','唐','韩','冯','董','程','曹','袁','邓','彭','苏','蒋','蔡','贾','丁','魏','薛',
    '叶','阎','余','潘','杜','戴','夏','钟','汪','田'];
  var GIVEN = ['明远','晓峰','伟华','婷婷','建国','丽华','志强','海燕','大伟','思远','秀英','文博',
    '小明','文静','子轩','雅琪','浩然','天宇','雨薇','晨曦','博文','诗涵','宇飞','佳怡',
    '嘉诚','雪莹','思源','俊杰','梦琪','泽宇','欣怡','浩宇','美琪','文杰','雨辰','子涵',
    '瑞祥','雅婷','凯文','明辉','静怡','志远','慧敏','鹏飞','雨萱','伟杰','嘉怡','文涛'];
  function genName(seq) { return SURNAMES[seq % 50] + GIVEN[(seq * 3 + 7) % 48]; }

  /* ── 1. Organization: 4-level hierarchy ──
   * L0: PLH (产品线负责人)
   * L1: 4 Department Directors + HR Director
   * L2: 14 Team Leads (3-4 per department)
   * L3: ~181 ICs + 10 hired = 210 total employees
   */
  var departments = [
    { id:1, name:'技术部',   parentId:null, managerId:1002, hcPlan:0 },
    { id:2, name:'产品部',   parentId:null, managerId:1003, hcPlan:0 },
    { id:3, name:'市场部',   parentId:null, managerId:1004, hcPlan:0 },
    { id:4, name:'运营部',   parentId:null, managerId:1005, hcPlan:0 },
    { id:5, name:'前端开发组', parentId:1, managerId:1006, hcPlan:0 },
    { id:6, name:'后端开发组', parentId:1, managerId:1007, hcPlan:0 },
    { id:7, name:'算法工程组', parentId:1, managerId:1008, hcPlan:0 },
    { id:8, name:'质量保障组', parentId:1, managerId:1009, hcPlan:0 },
    { id:9, name:'产品策略组', parentId:2, managerId:1010, hcPlan:0 },
    { id:10,name:'产品设计组', parentId:2, managerId:1011, hcPlan:0 },
    { id:11,name:'数据分析组', parentId:2, managerId:1012, hcPlan:0 },
    { id:12,name:'品牌推广组', parentId:3, managerId:1013, hcPlan:0 },
    { id:13,name:'渠道运营组', parentId:3, managerId:1014, hcPlan:0 },
    { id:14,name:'市场分析组', parentId:3, managerId:1015, hcPlan:0 },
    { id:15,name:'客户成功组', parentId:4, managerId:1016, hcPlan:0 },
    { id:16,name:'商务拓展组', parentId:4, managerId:1017, hcPlan:0 },
    { id:17,name:'项目管理组', parentId:4, managerId:1018, hcPlan:0 },
    { id:18,name:'技术支持组', parentId:4, managerId:1019, hcPlan:0 },
    { id:19,name:'人力资源部', parentId:null, managerId:1001, hcPlan:0 },
  ];

  /* ── 2. Positions: 230 HC slots ── */
  var TRADES = (TM.JOB_TRADES && TM.JOB_TRADES.length) ? TM.JOB_TRADES.slice()
    : ['Frontend','Mobile','Backend','SDET','QA','Algorithm','Big Data'];
  var LEVELS = (TM.JOB_LEVELS && TM.JOB_LEVELS.length) ? TM.JOB_LEVELS
    : ['E','SE','EE','SEE','AM','M','PE','SM'];
  var positions = [], nxPid = 101, lvlSeq = 0;
  var leafDeptIds = [5,6,7,8,9,10,11,12,13,14,15,16,17,18];
  var topDeptIds = [1,2,3,4,19];
  leafDeptIds.forEach(function(did) {
    TRADES.forEach(function(t) {
      positions.push({ id:nxPid++, name:t, level:LEVELS[lvlSeq++%8], departmentId:did });
    });
  });
  topDeptIds.forEach(function(did) {
    for (var ti=0; ti<4; ti++) {
      positions.push({ id:nxPid++, name:TRADES[ti%7], level:LEVELS[lvlSeq++%8], departmentId:did });
    }
  });
  while (positions.length < 230) {
    var di = leafDeptIds[(positions.length - 118) % 14];
    positions.push({ id:nxPid++, name:TRADES[positions.length%7], level:LEVELS[lvlSeq++%8], departmentId:di });
  }
  function findPosInDept(deptId, tradeHint) {
    var p = positions.find(function(x){ return x.departmentId===deptId && x.name===tradeHint; });
    if (p) return p.id;
    p = positions.find(function(x){ return x.departmentId===deptId; });
    return p ? p.id : positions[0].id;
  }

  /* ── 3. Employees: 200 initial + 10 hired = 210 ── */
  var CORE = [
    // 1001: HR Director / HRBP super admin
    { id:1001, name:'张文华', dept:19, trade:'Big Data', mgr:1002, hire:'2016-03-01', status:'active', orgRole:'PIC' },
    // 1002-1005: L1 Department Directors → report to PLH (1002 is PLH)
    { id:1002, name:'陈志伟', dept:1, trade:'Backend', mgr:null, hire:'2015-01-10', status:'active', orgRole:'PIC' },
    { id:1003, name:'李明远', dept:2, trade:'Frontend', mgr:1002, hire:'2016-06-15', status:'active', orgRole:'PIC' },
    { id:1004, name:'王雅琴', dept:3, trade:'Frontend', mgr:1002, hire:'2016-09-01', status:'active', orgRole:'PIC' },
    { id:1005, name:'刘建国', dept:4, trade:'Backend', mgr:1002, hire:'2017-02-20', status:'active', orgRole:'PIC' },
    // 1006-1009: Tech team leads → report to 1002
    { id:1006, name:'杨浩然', dept:5, trade:'Frontend', mgr:1002, hire:'2018-03-10', status:'active', orgRole:'RM' },
    { id:1007, name:'黄博文', dept:6, trade:'Backend', mgr:1002, hire:'2018-05-20', status:'active', orgRole:'RM' },
    { id:1008, name:'周子轩', dept:7, trade:'Algorithm', mgr:1002, hire:'2018-08-01', status:'active', orgRole:'RM' },
    { id:1009, name:'吴思远', dept:8, trade:'QA', mgr:1002, hire:'2018-11-15', status:'active', orgRole:'RM' },
    // 1010-1012: Product team leads → report to 1003
    { id:1010, name:'孙雅琪', dept:9, trade:'Frontend', mgr:1003, hire:'2019-01-10', status:'active', orgRole:'RM' },
    { id:1011, name:'马天宇', dept:10, trade:'Mobile', mgr:1003, hire:'2019-04-01', status:'active', orgRole:'RM' },
    { id:1012, name:'朱诗涵', dept:11, trade:'Big Data', mgr:1003, hire:'2019-06-20', status:'active', orgRole:'RM' },
    // 1013-1015: Marketing team leads → report to 1004
    { id:1013, name:'郑晓峰', dept:12, trade:'Frontend', mgr:1004, hire:'2019-02-15', status:'active', orgRole:'RM' },
    { id:1014, name:'何文静', dept:13, trade:'Backend', mgr:1004, hire:'2019-05-10', status:'active', orgRole:'RM' },
    { id:1015, name:'林佳怡', dept:14, trade:'Algorithm', mgr:1004, hire:'2019-09-01', status:'active', orgRole:'RM' },
    // 1016-1019: Operations team leads → report to 1005
    { id:1016, name:'高嘉诚', dept:15, trade:'Backend', mgr:1005, hire:'2019-03-20', status:'active', orgRole:'RM' },
    { id:1017, name:'郑志强', dept:16, trade:'Frontend', mgr:1005, hire:'2019-07-01', status:'active', orgRole:'RM' },
    { id:1018, name:'王海燕', dept:17, trade:'Mobile', mgr:1005, hire:'2019-10-15', status:'active', orgRole:'RM' },
    { id:1019, name:'刘雨薇', dept:18, trade:'SDET', mgr:1005, hire:'2020-01-06', status:'active', orgRole:'RM' },
  ];

  var employees = [];
  CORE.forEach(function(c) {
    employees.push({
      id:c.id, name:c.name, gender:c.id%2===0?'男':'女',
      birthday:padYmd(1978+(c.id%20), 1+(c.id%12), 1+(c.id%28)),
      departmentId:c.dept, positionId:findPosInDept(c.dept, c.trade),
      managerId:c.mgr, hireDate:c.hire, status:c.status,
      phone:'138'+String(10000000+c.id).slice(-8), email:'emp'+c.id+'@company.com',
      orgRole:c.orgRole||'',
    });
  });

  // IC distribution: 181 ICs across 14 sub-teams
  var IC_DIST = [
    {dept:5, mgr:1006, count:15}, {dept:6, mgr:1007, count:15},
    {dept:7, mgr:1008, count:14}, {dept:8, mgr:1009, count:13},
    {dept:9, mgr:1010, count:12}, {dept:10,mgr:1011, count:12},
    {dept:11,mgr:1012, count:12}, {dept:12,mgr:1013, count:12},
    {dept:13,mgr:1014, count:11}, {dept:14,mgr:1015, count:11},
    {dept:15,mgr:1016, count:12}, {dept:16,mgr:1017, count:11},
    {dept:17,mgr:1018, count:11}, {dept:18,mgr:1019, count:10},
  ];
  var statusRot = ['active','active','active','active','active','active','probation','leave'];
  var icId = 1020, nameSeq = 20;
  IC_DIST.forEach(function(cfg) {
    for (var i=0; i<cfg.count; i++) {
      var empIdx = icId - 1001;
      employees.push({
        id:icId, name:genName(nameSeq), gender:nameSeq%2===0?'男':'女',
        birthday:padYmd(1985+(empIdx%15), 1+(empIdx%12), 1+(empIdx%28)),
        departmentId:cfg.dept, positionId:findPosInDept(cfg.dept, TRADES[(nameSeq*3)%7]),
        managerId:cfg.mgr, hireDate:padYmd(2017+(empIdx%8), 1+((empIdx*3)%12), 1+((empIdx*7)%28)),
        status:statusRot[empIdx%8],
        phone:'138'+String(10000000+icId).slice(-8), email:'emp'+icId+'@company.com',
        orgRole:'',
      });
      icId++; nameSeq++;
    }
  });

  // 10 hired employees (from recruitment pipeline, already onboarded)
  var HIRED_TEAMS = [
    {dept:5,mgr:1006},{dept:6,mgr:1007},{dept:7,mgr:1008},{dept:9,mgr:1010},
    {dept:10,mgr:1011},{dept:12,mgr:1013},{dept:13,mgr:1014},{dept:15,mgr:1016},
    {dept:16,mgr:1017},{dept:18,mgr:1019},
  ];
  for (var h=0; h<10; h++) {
    var hid = 1201 + h;
    employees.push({
      id:hid, name:genName(nameSeq+100+h), gender:h%2===0?'男':'女',
      birthday:padYmd(1992+(h%8), 1+(h%12), 1+(h%28)),
      departmentId:HIRED_TEAMS[h].dept, positionId:findPosInDept(HIRED_TEAMS[h].dept, TRADES[h%7]),
      managerId:HIRED_TEAMS[h].mgr, hireDate:padYmd(2026, 1+(h%3), 15+h),
      status:'active', phone:'138'+String(10000000+hid).slice(-8), email:'emp'+hid+'@company.com',
      orgRole:'',
    });
  }

  // Enrich all employees with extended fields
  var gradSchools = ['清华大学','北京大学','浙江大学','复旦大学','上海交通大学','华中科技大学','武汉大学','西安交通大学','北京航空航天大学','同济大学','中山大学','南京大学'];
  var mgmtPlans = ['—','年度评审','高潜力人才计划','跨部门轮岗','继任观察','保留计划'];
  var salaryBands = ['below_min','p25','p50','p75','above_max'];
  employees.forEach(function(e, i) {
    e.gradSchool = gradSchools[i%12];
    e.careerStartDate = addYears(e.hireDate, -2-(i%5));
    e.levelStartDate = addYears(e.hireDate, -(i%3));
    e.managementPlan = mgmtPlans[i%6];
    if (!e.orgRole) e.orgRole = '';
    e.salaryBand = i<80 ? salaryBands[i%5] : '';
    e.age = null;
  });

  /* ── 4. Users ── */
  var mgrMods = ['dashboard','roster','org','recruitment','talent','performance','attendance'];
  var mgrOps = TM.RM_ALL_OPS_ON ? TM.RM_ALL_OPS_ON() : {};
  var users = [
    { id:1, username:'hrbp', email:'hrbp@company.com', password:'123', role:'hrbp', superAdmin:true, hrbpSubType:'super_admin', realName:'张文华', employeeId:1001, homeLineId:lid },
    { id:2, username:'manager', email:'manager@company.com', password:'123', role:'manager', realName:'陈志伟', employeeId:1002, homeLineId:lid, rmStatus:'active', managerPermissions:{modules:mgrMods.slice(),ops:Object.assign({},mgrOps)} },
    { id:3, username:'superadmin', email:'superadmin@company.com', password:'123', role:'hrbp', superAdmin:true, hrbpSubType:'super_admin', realName:'Super Admin', employeeId:null },
    { id:4, username:'intern', email:'intern@company.com', password:'123', role:'hrbp', hrbpSubType:'intern', allowedModules:['recruitment'], realName:'实习生', employeeId:null },
    { id:5, username:'tyler.yan', email:'tyler.yan@shopee.com', password:'123', role:'hrbp', superAdmin:true, hrbpSubType:'super_admin', realName:'Tyler Yan', employeeId:null },
    { id:6, username:'li.my', email:'emp1003@company.com', password:'123', role:'manager', realName:'李明远', employeeId:1003, homeLineId:lid, rmStatus:'active', managerPermissions:{modules:mgrMods.slice(),ops:Object.assign({},mgrOps)} },
    { id:7, username:'yang.hr', email:'emp1006@company.com', password:'123', role:'manager', realName:'杨浩然', employeeId:1006, homeLineId:lid, rmStatus:'active', managerPermissions:{modules:mgrMods.slice(),ops:Object.assign({},mgrOps)} },
    { id:8, username:'huang.bw', email:'emp1007@company.com', password:'123', role:'manager', realName:'黄博文', employeeId:1007, homeLineId:lid, rmStatus:'active', managerPermissions:{modules:mgrMods.slice(),ops:Object.assign({},mgrOps)} },
  ];

  /* ── 5. Leave requests ── */
  var leaveRequests = [
    { id:nextLeaveId(), employeeId:1020, type:'annual', startDate:'2026-03-10', endDate:'2026-03-12', reason:'家庭旅行', status:'pending', approverId:1006, createdAt:'2026-03-01' },
    { id:nextLeaveId(), employeeId:1025, type:'sick', startDate:'2026-02-05', endDate:'2026-02-06', reason:'身体不适', status:'approved', approverId:1007, createdAt:'2026-02-04' },
    { id:nextLeaveId(), employeeId:1040, type:'annual', startDate:'2026-04-01', endDate:'2026-04-03', reason:'年假休息', status:'pending', approverId:1010, createdAt:'2026-03-18' },
    { id:nextLeaveId(), employeeId:1060, type:'overtime', startDate:'2026-03-15', endDate:'2026-03-15', reason:'加班调休', status:'rejected', approverId:1013, createdAt:'2026-03-14' },
    { id:nextLeaveId(), employeeId:1080, type:'sick', startDate:'2026-01-20', endDate:'2026-01-21', reason:'感冒发烧', status:'approved', approverId:1016, createdAt:'2026-01-19' },
    { id:nextLeaveId(), employeeId:1100, type:'annual', startDate:'2026-04-10', endDate:'2026-04-14', reason:'出国旅行', status:'pending', approverId:1018, createdAt:'2026-03-25' },
  ];

  /* ── 6. Performance cycles: 4 years history + 2026 H1 open ── */
  var performanceCycles = [
    { id:1, name:'H1 2022', cycleType:'half_year', startDate:'2022-01-01', endDate:'2022-06-30', status:'closed' },
    { id:2, name:'FY 2022', cycleType:'year', startDate:'2022-01-01', endDate:'2022-12-31', status:'closed' },
    { id:3, name:'H1 2023', cycleType:'half_year', startDate:'2023-01-01', endDate:'2023-06-30', status:'closed' },
    { id:4, name:'FY 2023', cycleType:'year', startDate:'2023-01-01', endDate:'2023-12-31', status:'closed' },
    { id:5, name:'H1 2024', cycleType:'half_year', startDate:'2024-01-01', endDate:'2024-06-30', status:'closed' },
    { id:6, name:'FY 2024', cycleType:'year', startDate:'2024-01-01', endDate:'2024-12-31', status:'closed' },
    { id:7, name:'H1 2025', cycleType:'half_year', startDate:'2025-01-01', endDate:'2025-06-30', status:'closed' },
    { id:8, name:'FY 2025', cycleType:'year', startDate:'2025-01-01', endDate:'2025-12-31', status:'closed' },
    { id:9, name:'H1 2026', cycleType:'half_year', startDate:'2026-01-01', endDate:'2026-06-30', status:'open' },
  ];

  /* ── 7. Performance reviews ── */
  var GRADES = ['A+','A','A-','B+','B','C','C-'];
  var WEIGHTS = [3,10,15,30,25,12,5];
  var cumW = [], ws = 0;
  WEIGHTS.forEach(function(w){ ws+=w; cumW.push(ws); });
  function pickGrade(rng, bias) {
    var r = rng()*100, idx = cumW.findIndex(function(c){ return r<c; });
    if (idx<0) idx=3;
    idx = Math.max(0, Math.min(6, idx+bias));
    return GRADES[idx];
  }
  var CURRENT_CYCLE_ID = 9;
  var activeEmps = employees.filter(function(e){ return e.status!=='leave'; });
  var performanceReviews = [];
  var rid = 1;
  activeEmps.forEach(function(e) {
    var rng = seededRand(e.id*7+31);
    var bias = Math.floor(rng()*3)-1;
    var hireY = Number(String(e.hireDate||'2024').slice(0,4));
    var hireM = Number(String(e.hireDate||'2024-01').slice(5,7))||1;
    performanceCycles.forEach(function(cy) {
      var cyY = Number(cy.startDate.slice(0,4)), cyM = Number(cy.startDate.slice(5,7));
      if (cyY<hireY || (cyY===hireY && cyM<hireM)) return;
      if (cy.id === CURRENT_CYCLE_ID) {
        var roll = rng(), rmG = pickGrade(rng, bias), st, fG;
        if (roll<0.18)      { st='rm_pending'; rmG=''; fG=''; }
        else if (roll<0.28) { st='rm_evaluated'; fG=''; }
        else if (roll<0.42) { st='in_approval'; fG=''; }
        else if (roll<0.55) { st='pl_pending'; fG=''; }
        else if (roll<0.65) { st='calibrated'; fG=rmG; }
        else if (roll<0.78) { st='pl_approved'; fG=''; }
        else                { st='finalized'; fG=rmG; }
        performanceReviews.push({
          id:rid++, employeeId:e.id, reviewerId:e.managerId||1001,
          cycleId:cy.id, rmInitialGrade:rmG, finalGrade:fG, status:st,
          rmComment: st!=='rm_pending' ? 'H1 2026 评估评语':'',
          outputDescription: st!=='rm_pending' ? '本周期产出总结':'',
          historyPerformance:'', comments:'', devAdvice:'',
          approvalChain:[], approvalStepIndex:0,
          pendingApproverId: st==='rm_pending' ? (e.managerId||1001) : null,
          approvalLog:[], prevCycleAvgHours:null,
          communicationNotes: st==='finalized' ? '已沟通':'',
          communicatedAt: st==='finalized' ? '2026-04-10':null,
          appealDeadline:null,
          calibratedBy: (st==='calibrated'||st==='pl_approved'||st==='finalized') ? 1001:null,
          calibratedAt: (st==='calibrated'||st==='pl_approved'||st==='finalized') ? '2026-03-28':null,
          createdAt:'2026-03-15',
        });
      } else {
        var g = pickGrade(rng, bias);
        performanceReviews.push({
          id:rid++, employeeId:e.id, reviewerId:e.managerId||1001,
          cycleId:cy.id, rmInitialGrade:g, finalGrade:g, status:'finalized',
          rmComment:cy.name+' 绩效评语', outputDescription:'产出符合预期',
          historyPerformance:'', comments:'', devAdvice:'',
          approvalChain:[], approvalStepIndex:0, pendingApproverId:null,
          approvalLog:[{approverId:e.managerId||1001, at:cy.endDate, action:'calibrate', note:'HRBP 校准'}],
          prevCycleAvgHours:null,
          communicationNotes:'已沟通', communicatedAt:cy.endDate, appealDeadline:null,
          calibratedBy:1001, calibratedAt:cy.endDate, createdAt:cy.startDate,
        });
      }
    });
  });

  /* ── 8. Trainings ── */
  var trainings = [
    { id:1, title:'Vue 3 实战', description:'响应式原理与 Composition API', category:'技术', durationHours:8 },
    { id:2, title:'沟通与影响力', description:'职场沟通与向上管理', category:'软技能', durationHours:4 },
    { id:3, title:'数据驱动的产品决策', description:'指标体系与 A/B 测试基础', category:'产品', durationHours:6 },
    { id:4, title:'销售漏斗管理', description:'B2B 管线拆解', category:'销售', durationHours:5 },
  ];
  var employeeTrainings = [
    { id:nextEmpTrainId(), employeeId:1020, trainingId:1, status:'in_progress', recommendedBy:1006, completionDate:null },
    { id:nextEmpTrainId(), employeeId:1025, trainingId:2, status:'completed', recommendedBy:1007, completionDate:'2026-02-01' },
    { id:nextEmpTrainId(), employeeId:1040, trainingId:3, status:'in_progress', recommendedBy:1010, completionDate:null },
    { id:nextEmpTrainId(), employeeId:1060, trainingId:4, status:'completed', recommendedBy:1013, completionDate:'2026-01-15' },
  ];

  /* ── 9. Attendance ── */
  var attendanceRules = {
    workStart:'09:30', workEnd:'18:30',
    leaveTypes:['annual','sick','personal','overtime'],
    labels:{annual:'年假',sick:'病假',personal:'事假',overtime:'调休'},
    monthlyStandardDays:20, loadBandLow:0.88, loadBandHigh:1.12,
  };
  function genWorkdays(y,mo) {
    var days=[], dim=new Date(y,mo,0).getDate();
    for (var d=1;d<=dim;d++) { var dt=new Date(y,mo-1,d); if(dt.getDay()!==0&&dt.getDay()!==6) days.push(padYmd(y,mo,d)); }
    return days;
  }
  function randTime(bH,bM,j) {
    var t=bH*60+bM+Math.floor(Math.random()*j*2)-j;
    return String(Math.max(0,Math.min(23,Math.floor(t/60)))).padStart(2,'0')+':'+String(Math.max(0,Math.min(59,t%60))).padStart(2,'0');
  }
  var PUNCH_MONTHS = [{y:2025,m:10},{y:2025,m:11},{y:2025,m:12},{y:2026,m:1},{y:2026,m:2},{y:2026,m:3}];
  var TIER_TARGETS = [
    {outH:18,outM:10,j:10},{outH:18,outM:50,j:10},{outH:19,outM:20,j:8},
    {outH:19,outM:50,j:10},{outH:20,outM:25,j:12},
  ];
  var attProfiles = activeEmps.map(function(e,i){
    var t=TIER_TARGETS[i%5]; return {id:e.id,inH:9,inM:(i*7+3)%30,outH:t.outH,outM:t.outM,j:t.j};
  });
  var PUNCH_DETAIL_LIMIT = 40;
  var punchRecords=[], punchId=1;
  var punchProfs = attProfiles.slice(0, PUNCH_DETAIL_LIMIT);
  PUNCH_MONTHS.forEach(function(pm){
    var days=genWorkdays(pm.y,pm.m);
    punchProfs.forEach(function(p){
      var skip=Math.floor(Math.random()*2);
      days.slice(0,days.length-skip).forEach(function(d){
        punchRecords.push({id:punchId++,employeeId:p.id,date:d,time:randTime(p.inH,p.inM,p.j)});
        punchRecords.push({id:punchId++,employeeId:p.id,date:d,time:randTime(p.outH,p.outM,p.j)});
      });
    });
  });
  var attendanceRecords=[], attRecId=1;
  attProfiles.forEach(function(p){
    PUNCH_MONTHS.forEach(function(pm){
      var wd=genWorkdays(pm.y,pm.m).length-Math.floor(Math.random()*2);
      var baseH=(p.outH+p.outM/60)-(p.inH+p.inM/60);
      var avg=Math.round((baseH+(Math.random()-0.5)*(p.j/30))*10)/10;
      attendanceRecords.push({id:attRecId++,employeeId:p.id,month:pm.y+'-'+String(pm.m).padStart(2,'0'),
        avgDailyHours:Math.max(6,Math.min(16,avg)), workDays:Math.max(1,wd)});
    });
  });

  /* ── 10. Talent matrix: all active employees, 4-year perf + potential ── */
  var perfMap = ['A','B','C'];
  var potMap = ['H','M','L'];
  var talentMatrix = activeEmps.map(function(e,i){
    return { employeeId:e.id, performance:perfMap[i%3], potential:potMap[Math.floor(i/3)%3], developmentPlan:'' };
  });

  /* ── 11. Succession plans ── */
  var successionPlans = [
    { id:1, positionId:findPosInDept(5,'Frontend'), successorIds:[1020,1021], note:'前端开发组 · 高级前端继任池' },
    { id:2, positionId:findPosInDept(6,'Backend'), successorIds:[1035,1036], note:'后端开发组 · 核心后端继任池' },
    { id:3, positionId:findPosInDept(7,'Algorithm'), successorIds:[1050,1051], note:'算法工程组 · 算法专家继任池' },
    { id:4, positionId:findPosInDept(9,'Frontend'), successorIds:[1064,1065], note:'产品策略组 · 产品经理继任池' },
  ];

  /* ── 12. Notifications ── */
  var notifications = [
    { id:nextNotifId(), employeeId:1020, title:'培训推荐', message:'你的经理推荐了 "Vue 3 实战"', read:false, createdAt:'2026-03-18' },
    { id:nextNotifId(), employeeId:1002, title:'绩效周期提醒', message:'H1 2026 绩效评估已开启，请尽快完成团队评估', read:false, createdAt:'2026-03-15' },
    { id:nextNotifId(), employeeId:1006, title:'审批待处理', message:'有3位团队成员的绩效评估待您提交', read:false, createdAt:'2026-03-20' },
  ];

  /* ── 13. Recruitment: 30 open positions + 100 candidates ── */
  var positionRecruitTags = {};
  var OPEN_SLOTS = [
    {dept:5,trade:'Frontend',pr:'high'},{dept:5,trade:'Mobile',pr:'high'},{dept:5,trade:'Backend',pr:'medium'},
    {dept:6,trade:'Backend',pr:'high'},{dept:6,trade:'SDET',pr:'medium'},{dept:6,trade:'Algorithm',pr:'low'},
    {dept:7,trade:'Algorithm',pr:'high'},{dept:7,trade:'Big Data',pr:'medium'},
    {dept:8,trade:'QA',pr:'high'},{dept:8,trade:'SDET',pr:'medium'},
    {dept:9,trade:'Frontend',pr:'medium'},{dept:9,trade:'Mobile',pr:'low'},
    {dept:10,trade:'Frontend',pr:'high'},{dept:10,trade:'Mobile',pr:'medium'},
    {dept:11,trade:'Big Data',pr:'high'},{dept:11,trade:'Algorithm',pr:'medium'},
    {dept:12,trade:'Frontend',pr:'medium'},{dept:12,trade:'Backend',pr:'low'},
    {dept:13,trade:'Frontend',pr:'medium'},{dept:13,trade:'Mobile',pr:'low'},
    {dept:14,trade:'Algorithm',pr:'medium'},{dept:14,trade:'Frontend',pr:'low'},
    {dept:15,trade:'Backend',pr:'high'},{dept:15,trade:'Frontend',pr:'medium'},
    {dept:16,trade:'Frontend',pr:'medium'},{dept:16,trade:'Backend',pr:'low'},
    {dept:17,trade:'Mobile',pr:'medium'},{dept:17,trade:'QA',pr:'low'},
    {dept:18,trade:'SDET',pr:'high'},{dept:18,trade:'Backend',pr:'medium'},
  ];
  OPEN_SLOTS.forEach(function(s){
    var p = positions.find(function(x){ return x.departmentId===s.dept && x.name===s.trade; });
    if (p) positionRecruitTags[s.dept+'-'+p.id] = {priority:s.pr};
  });

  // 100 pipeline candidates
  var deptById = {}; departments.forEach(function(d){ deptById[d.id]=d; });
  var CAND_STAGES = [
    // 10 onboarded (已入职)
    {n:10, hr:'pass', hrI:'pass', i1:'pass', i2:'pass', iF:'pass', off:'accepted', ob:true},
    // 8 pending onboard (待入职)
    {n:8, hr:'pass', hrI:'pass', i1:'pass', i2:'pass', iF:'pass', off:'accepted', ob:false},
    // 5 offer pending
    {n:5, hr:'pass', hrI:'pass', i1:'pass', i2:'pass', iF:'pass', off:'pending'},
    // 5 offer declined
    {n:5, hr:'pass', hrI:'pass', i1:'pass', i2:'pass', iF:'pass', off:'declined'},
    // 8 final interview pending
    {n:8, hr:'pass', hrI:'pass', i1:'pass', i2:'pass', iF:'pending'},
    // 10 interview2 pending
    {n:10, hr:'pass', hrI:'pass', i1:'pass', i2:'pending'},
    // 12 interview1 pending
    {n:12, hr:'pass', hrI:'pass', i1:'pending'},
    // 5 failed at interview1
    {n:5, hr:'pass', hrI:'pass', i1:'fail'},
    // 4 failed at interview2
    {n:4, hr:'pass', hrI:'pass', i1:'pass', i2:'fail'},
    // 4 failed at final
    {n:4, hr:'pass', hrI:'pass', i1:'pass', i2:'pass', iF:'fail'},
    // 8 HR interview pending
    {n:8, hr:'pass', hrI:'pending'},
    // 7 HR screening pending
    {n:7, hr:'pending'},
    // 10 HR screening failed
    {n:10, hr:'fail'},
  ];
  var recruiters = ['赵敏','孙磊','周婷','林芳'];
  var hrScreeners = ['李娜','刘洋','张华'];
  var interviewers = ['张伟','王强','陈静','刘洋','李敏'];
  var recruitmentPipeline = [];
  var candIdx = 0;
  var openSlotIdx = 0;
  CAND_STAGES.forEach(function(stage) {
    for (var ci=0; ci<stage.n; ci++) {
      candIdx++;
      var slot = OPEN_SLOTS[openSlotIdx % OPEN_SLOTS.length]; openSlotIdx++;
      var teamName = (deptById[slot.dept]||{}).name||'技术部';
      var dateOffset = candIdx * 2;
      var mo = Math.floor(dateOffset / 30) + 1;
      var dy = (dateOffset % 28) + 1;
      if (mo > 4) { mo = 1 + (candIdx % 4); dy = 1 + (candIdx % 28); }
      var obDate = '';
      if (stage.ob) {
        obDate = padYmd(2026, 1 + (candIdx % 3), 10 + (candIdx % 15));
      }
      var scr = '';
      if (stage.off === 'accepted' || stage.off === 'pending' || stage.off === 'declined') scr = String(3 + (candIdx % 3));
      else if (stage.i1 === 'pass' || stage.i1 === 'fail') scr = String(2 + (candIdx % 3));
      recruitmentPipeline.push({
        id:'P'+String(candIdx).padStart(3,'0'),
        recruitDate:padYmd(2026, mo, dy),
        name:genName(200 + candIdx),
        team:teamName,
        position:slot.trade,
        hiringLine:'L'+String(1+(candIdx%3)),
        recruitType: candIdx%3===0 ? 'campus':'social',
        recruiter:recruiters[candIdx%4],
        hrScreening:stage.hr||'', hrScreeningBy: stage.hr ? hrScreeners[candIdx%3]:'',
        hrInterview:stage.hrI||'',
        interview1:stage.i1||'', interview1By: stage.i1 ? interviewers[candIdx%5]:'',
        interview2:stage.i2||'', interview2By: stage.i2 ? interviewers[(candIdx+1)%5]:'',
        interviewFinal:stage.iF||'', interviewFinalBy: stage.iF ? interviewers[(candIdx+2)%5]:'',
        score:scr, offering:stage.off||'', onboardDate:obDate,
        comments: stage.hr==='fail'?'简历不符合要求':stage.i1==='fail'?'面试未通过':stage.i2==='fail'?'技术深度不足':stage.iF==='fail'?'终面未通过':stage.off==='declined'?'候选人拒绝offer':'',
        yoe:String(candIdx%10),
        personnelType:'', companyLevel:'', levelPosition:'', shippedDate:'',
        offerBIDate:'', cash:'', offerMakeScope:'', workLocation:'', basePackage:'', briStart:'',
      });
    }
  });

  var interviewerPool = [
    { id:1, employeeId:1006, trades:['Frontend','Backend'], levels:['E','SE','EE'] },
    { id:2, employeeId:1007, trades:['Backend','SDET'], levels:['SE','EE','SEE'] },
    { id:3, employeeId:1008, trades:['Algorithm','Big Data'], levels:['E','SE','EE'] },
    { id:4, employeeId:1010, trades:['Frontend','Mobile'], levels:['E','SE'] },
    { id:5, employeeId:1013, trades:['Frontend'], levels:['E','SE','EE','SEE'] },
    { id:6, employeeId:1009, trades:['QA','SDET'], levels:['E','SE'] },
  ];

  /* ── Save all ── */
  saveKey('departments', departments);
  saveKey('positions', positions);
  saveKey('employees', employees);
  {
    var GLOBAL_USERS_KEY = 'tm_global_users';
    var existing = [];
    try {
      if (window.TM._idb && !window.TM._idb.isFallback() && window.TM._idb.isReady()) {
        var idbVal = window.TM._idb.loadKey(GLOBAL_USERS_KEY, null);
        if (idbVal) existing = idbVal;
      }
      if (!existing.length) {
        var raw = localStorage.getItem(GLOBAL_USERS_KEY);
        if (raw) existing = JSON.parse(raw)||[];
      }
    } catch(_){}
    var merged = new Map();
    existing.forEach(function(u){ merged.set(String(u.email||u.username||u.id).toLowerCase(), u); });
    users.forEach(function(u){ merged.set(String(u.email||u.username||u.id).toLowerCase(), u); });
    var nextUid=1, result=[];
    merged.forEach(function(u){ u.id=nextUid++; result.push(u); });
    localStorage.setItem(GLOBAL_USERS_KEY, JSON.stringify(result));
    if (window.TM._idb && window.TM._idb.saveKey && !window.TM._idb.isFallback()) {
      window.TM._idb.saveKey(GLOBAL_USERS_KEY, result);
    }
  }
  saveKey('leaveRequests', leaveRequests);
  saveKey('performanceReviews', performanceReviews);
  saveKey('trainings', trainings);
  saveKey('employeeTrainings', employeeTrainings);
  saveKey('attendanceRules', attendanceRules);
  saveKey('punchRecords', punchRecords);
  saveKey('attendanceRecords', attendanceRecords);
  saveKey('kpiLibrary', []);
  saveKey('performanceCycles', performanceCycles);
  saveKey('talentMatrix', talentMatrix);
  saveKey('successionPlans', successionPlans);
  saveKey('notifications', notifications);
  saveKey('positionRecruitTags', positionRecruitTags);
  saveKey('recruitmentPositionMetrics', {});
  saveKey('recruitmentCandidates', []);
  saveKey('recruitmentPipeline', recruitmentPipeline);
  saveKey('interviewerPool', interviewerPool);
  saveKey('orgSettings', { productLineHeadEmployeeId: 1002 });
  saveKey('orgChangeRequests', []);
  saveKey('rosterColumnSettings', null);
  saveKey('_seedVersion', 21);
  return { seeded: true };
}
TM.seedAllData = seedAllData;


/* ══════════════════════════════════════════════════════════
 *  seedPipelineDemo — patch pipeline + recruit tags only
 * ══════════════════════════════════════════════════════════ */
function seedPipelineDemo(lineId) {
  var lid = lineId != null ? Number(lineId) : 1;
  var saveKey = function(k,v){ TM.saveKeyForLine(lid,k,v); };
  var positions = TM.loadKeyForLine(lid,'positions',[])||[];
  var employees = TM.loadKeyForLine(lid,'employees',[])||[];
  var existingTags = TM.loadKeyForLine(lid,'positionRecruitTags',{})||{};
  var tags = Object.assign({}, existingTags);
  var leafDepts = [5,6,7,8,9,10,11,12,13,14,15,16,17,18];
  leafDepts.forEach(function(did){
    var p = positions.find(function(x){ return x.departmentId===did; });
    if (!p) return;
    var k = did+'-'+p.id;
    if (!tags[k]) tags[k] = {priority:'medium'};
  });
  saveKey('positionRecruitTags', tags);
  var existingPool = TM.loadKeyForLine(lid,'interviewerPool',null);
  if (!existingPool||!existingPool.length) {
    var emps = employees.filter(function(e){return e.status!=='leave';});
    var pool=[], pid=1;
    var cfgs=[{trades:['Frontend','Backend'],levels:['E','SE','EE']},{trades:['Algorithm','Big Data'],levels:['SE','EE','SEE']},
      {trades:['Frontend','Mobile'],levels:['E','SE']},{trades:['Frontend'],levels:['E','SE','EE','SEE']},
      {trades:['Backend','SDET'],levels:['E','SE','EE']},{trades:['QA','SDET'],levels:['E','SE']}];
    cfgs.forEach(function(c,i){ if(emps[i]) pool.push({id:pid++,employeeId:emps[i].id,trades:c.trades,levels:c.levels}); });
    saveKey('interviewerPool', pool);
  }
}
TM.seedPipelineDemo = seedPipelineDemo;


/* ══════════════════════════════════════════════════════════
 *  seedAttendanceDemo — re-seed punch + attendance records
 * ══════════════════════════════════════════════════════════ */
function seedAttendanceDemo(lineId) {
  var lid = lineId != null ? Number(lineId) : 1;
  var saveKey = function(k,v){ TM.saveKeyForLine(lid,k,v); };
  var emps = TM.loadKeyForLine(lid,'employees',[])||[];
  if (!emps.length) return;
  function _gwd(y,m){var days=[],dim=new Date(y,m,0).getDate();for(var d=1;d<=dim;d++){var dt=new Date(y,m-1,d);if(dt.getDay()!==0&&dt.getDay()!==6)days.push(y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'));}return days;}
  function _rt(bH,bM,j){var t=bH*60+bM+Math.floor(Math.random()*j*2)-j;return String(Math.max(0,Math.min(23,Math.floor(t/60)))).padStart(2,'0')+':'+String(Math.max(0,Math.min(59,t%60))).padStart(2,'0');}
  var tiers=[{outH:18,outM:10,j:10},{outH:18,outM:50,j:10},{outH:19,outM:20,j:8},{outH:19,outM:50,j:10},{outH:20,outM:25,j:12}];
  var active=emps.filter(function(e){return e.status!=='leave';});
  var profiles=active.map(function(e,i){var t=tiers[i%5];return{id:e.id,inH:9,inM:(i*7+3)%30,outH:t.outH,outM:t.outM,j:t.j};});
  var months=[{y:2025,m:10},{y:2025,m:11},{y:2025,m:12},{y:2026,m:1},{y:2026,m:2},{y:2026,m:3}];
  var DL=30, punches=[], pid=1;
  months.forEach(function(pm){var days=_gwd(pm.y,pm.m);profiles.slice(0,DL).forEach(function(p){var sk=Math.floor(Math.random()*2);days.slice(0,days.length-sk).forEach(function(d){punches.push({id:pid++,employeeId:p.id,date:d,time:_rt(p.inH,p.inM,p.j)});punches.push({id:pid++,employeeId:p.id,date:d,time:_rt(p.outH,p.outM,p.j)});});});});
  var records=[], ari=1;
  profiles.forEach(function(p){months.forEach(function(pm){var wd=_gwd(pm.y,pm.m).length-Math.floor(Math.random()*2);var bH=(p.outH+p.outM/60)-(p.inH+p.inM/60);var avg=Math.round((bH+(Math.random()-0.5)*(p.j/30))*10)/10;records.push({id:ari++,employeeId:p.id,month:pm.y+'-'+String(pm.m).padStart(2,'0'),avgDailyHours:Math.max(6,Math.min(16,avg)),workDays:Math.max(1,wd)});});});
  saveKey('punchRecords', punches);
  saveKey('attendanceRecords', records);
}
TM.seedAttendanceDemo = seedAttendanceDemo;


/* ══════════════════════════════════════════════════════════
 *  seedPerformanceDemo — re-seed cycles + reviews only
 * ══════════════════════════════════════════════════════════ */
function seedPerformanceDemo(lineId) {
  var lid = lineId != null ? Number(lineId) : 1;
  var saveKey = function(k,v){ TM.saveKeyForLine(lid,k,v); };
  var emps = TM.loadKeyForLine(lid,'employees',[])||[];
  if (!emps.length) return;
  var cycles=[
    {id:1,name:'H1 2022',cycleType:'half_year',startDate:'2022-01-01',endDate:'2022-06-30',status:'closed'},
    {id:2,name:'FY 2022',cycleType:'year',startDate:'2022-01-01',endDate:'2022-12-31',status:'closed'},
    {id:3,name:'H1 2023',cycleType:'half_year',startDate:'2023-01-01',endDate:'2023-06-30',status:'closed'},
    {id:4,name:'FY 2023',cycleType:'year',startDate:'2023-01-01',endDate:'2023-12-31',status:'closed'},
    {id:5,name:'H1 2024',cycleType:'half_year',startDate:'2024-01-01',endDate:'2024-06-30',status:'closed'},
    {id:6,name:'FY 2024',cycleType:'year',startDate:'2024-01-01',endDate:'2024-12-31',status:'closed'},
    {id:7,name:'H1 2025',cycleType:'half_year',startDate:'2025-01-01',endDate:'2025-06-30',status:'closed'},
    {id:8,name:'FY 2025',cycleType:'year',startDate:'2025-01-01',endDate:'2025-12-31',status:'closed'},
    {id:9,name:'H1 2026',cycleType:'half_year',startDate:'2026-01-01',endDate:'2026-06-30',status:'open'},
  ];
  saveKey('performanceCycles', cycles);
  var GR=['A+','A','A-','B+','B','C','C-'],W=[3,10,15,30,25,12,5],cW=[],s=0;
  W.forEach(function(w){s+=w;cW.push(s);});
  function sd(seed){var x=seed;return function(){x=(x*1103515245+12345)&0x7fffffff;return x/0x7fffffff;};}
  function pk(rng,bias){var r=rng()*100,idx=cW.findIndex(function(c){return r<c;});if(idx<0)idx=3;idx=Math.max(0,Math.min(6,idx+bias));return GR[idx];}
  var active=emps.filter(function(e){return e.status!=='leave';});
  var reviews=[], ri=1;
  active.forEach(function(e){
    var rng=sd(e.id*7+31),bias=Math.floor(rng()*3)-1;
    var hY=Number(String(e.hireDate||'2024').slice(0,4)),hM=Number(String(e.hireDate||'2024-01').slice(5,7))||1;
    cycles.forEach(function(cy){
      var cY=Number(cy.startDate.slice(0,4)),cM=Number(cy.startDate.slice(5,7));
      if(cY<hY||(cY===hY&&cM<hM))return;
      if(cy.id===9){
        var roll=rng(),rmG=pk(rng,bias),st,fG;
        if(roll<0.20){st='rm_pending';rmG='';fG='';}
        else if(roll<0.35){st='in_approval';fG='';}
        else if(roll<0.55){st='pl_approved';fG='';}
        else{st='finalized';fG=rmG;}
        reviews.push({id:ri++,employeeId:e.id,reviewerId:e.managerId||1001,cycleId:cy.id,rmInitialGrade:rmG,finalGrade:fG,status:st,rmComment:st!=='rm_pending'?'H1 2026 评估评语':'',outputDescription:st!=='rm_pending'?'本周期产出总结':'',historyPerformance:'',comments:'',devAdvice:'',approvalChain:[],approvalStepIndex:0,pendingApproverId:st==='rm_pending'?(e.managerId||1001):null,approvalLog:[],prevCycleAvgHours:null,communicationNotes:'',communicatedAt:null,appealDeadline:null,calibratedBy:st==='finalized'?1001:null,calibratedAt:st==='finalized'?'2026-03-28':null,createdAt:'2026-03-15'});
      } else {
        var g=pk(rng,bias);
        reviews.push({id:ri++,employeeId:e.id,reviewerId:e.managerId||1001,cycleId:cy.id,rmInitialGrade:g,finalGrade:g,status:'finalized',rmComment:cy.name+' 绩效评语',outputDescription:'产出符合预期',historyPerformance:'',comments:'',devAdvice:'',approvalChain:[],approvalStepIndex:0,pendingApproverId:null,approvalLog:[{approverId:e.managerId||1001,at:cy.endDate,action:'calibrate',note:'HRBP 校准'}],prevCycleAvgHours:null,communicationNotes:'已沟通',communicatedAt:cy.endDate,appealDeadline:null,calibratedBy:1001,calibratedAt:cy.endDate,createdAt:cy.startDate});
      }
    });
  });
  saveKey('performanceReviews', reviews);
}
TM.seedPerformanceDemo = seedPerformanceDemo;


/* ══════════════════════════════════════════════════════════
 *  seedMultiLevelOrg — 多层级审批流测试线 (line 3)
 * ══════════════════════════════════════════════════════════ */
function seedMultiLevelOrg(lineId) {
  var lid = lineId != null ? Number(lineId) : 3;
  var saveKey = function(k,v){ TM.saveKeyForLine(lid,k,v); };
  var departments=[
    {id:1,name:'技术中心',parentId:null,managerId:2001,hcPlan:0},
    {id:2,name:'前端组',parentId:1,managerId:2002,hcPlan:0},
    {id:3,name:'后端组',parentId:1,managerId:2003,hcPlan:0},
    {id:4,name:'测试组',parentId:1,managerId:2004,hcPlan:0},
    {id:5,name:'产品部',parentId:null,managerId:2005,hcPlan:0},
    {id:6,name:'产品设计组',parentId:5,managerId:2006,hcPlan:0},
  ];
  var TRADES=(TM.JOB_TRADES&&TM.JOB_TRADES.length)?TM.JOB_TRADES:['Frontend','Mobile','Backend','SDET','QA','Algorithm','Big Data'];
  var LEVELS=(TM.JOB_LEVELS&&TM.JOB_LEVELS.length)?TM.JOB_LEVELS:['E','SE','EE','SEE','AM','M','PE','SM'];
  var np=101,ls=0,positions=[];
  departments.forEach(function(d){TRADES.forEach(function(n){positions.push({id:np++,name:n,level:LEVELS[ls++%8],departmentId:d.id});});});
  function fp(did,t){return(positions.find(function(p){return p.departmentId===did&&p.name===t;})||{}).id||positions[0].id;}
  var employees=[
    {id:2001,name:'赵明远',departmentId:1,positionId:fp(1,'Backend'),managerId:null,status:'active',hireDate:'2016-01-15',phone:'13800000001',email:'zhao.my@demo.com'},
    {id:2002,name:'钱晓峰',departmentId:2,positionId:fp(2,'Frontend'),managerId:2001,status:'active',hireDate:'2017-03-10',phone:'13800000002',email:'qian.xf@demo.com'},
    {id:2003,name:'孙伟华',departmentId:3,positionId:fp(3,'Backend'),managerId:2001,status:'active',hireDate:'2017-06-20',phone:'13800000003',email:'sun.wh@demo.com'},
    {id:2004,name:'李婷婷',departmentId:4,positionId:fp(4,'QA'),managerId:2001,status:'active',hireDate:'2018-01-08',phone:'13800000004',email:'li.tt@demo.com'},
    {id:2005,name:'周建国',departmentId:5,positionId:fp(5,'Big Data'),managerId:2001,status:'active',hireDate:'2017-09-01',phone:'13800000005',email:'zhou.jg@demo.com'},
    {id:2006,name:'吴丽华',departmentId:6,positionId:fp(6,'Frontend'),managerId:2005,status:'active',hireDate:'2018-04-15',phone:'13800000006',email:'wu.lh@demo.com'},
    {id:2010,name:'郑志强',departmentId:2,positionId:fp(2,'Frontend'),managerId:2002,status:'active',hireDate:'2019-02-20',phone:'13800000010',email:'zheng.zq@demo.com'},
    {id:2011,name:'王海燕',departmentId:2,positionId:fp(2,'Mobile'),managerId:2002,status:'active',hireDate:'2019-05-10',phone:'13800000011',email:'wang.hy@demo.com'},
    {id:2012,name:'冯大伟',departmentId:3,positionId:fp(3,'Backend'),managerId:2003,status:'active',hireDate:'2019-03-15',phone:'13800000012',email:'feng.dw@demo.com'},
    {id:2013,name:'陈思远',departmentId:3,positionId:fp(3,'Algorithm'),managerId:2003,status:'active',hireDate:'2019-08-01',phone:'13800000013',email:'chen.sy@demo.com'},
    {id:2014,name:'杨秀英',departmentId:4,positionId:fp(4,'QA'),managerId:2004,status:'active',hireDate:'2019-11-20',phone:'13800000014',email:'yang.xy@demo.com'},
    {id:2015,name:'黄文博',departmentId:6,positionId:fp(6,'Frontend'),managerId:2006,status:'active',hireDate:'2020-01-10',phone:'13800000015',email:'huang.wb@demo.com'},
    {id:2020,name:'林小明',departmentId:2,positionId:fp(2,'Frontend'),managerId:2010,status:'active',hireDate:'2021-03-01',phone:'13800000020',email:'lin.xm@demo.com'},
    {id:2021,name:'张文静',departmentId:2,positionId:fp(2,'Frontend'),managerId:2010,status:'active',hireDate:'2021-06-15',phone:'13800000021',email:'zhang.wj@demo.com'},
    {id:2022,name:'刘子轩',departmentId:2,positionId:fp(2,'Frontend'),managerId:2010,status:'active',hireDate:'2022-01-10',phone:'13800000022',email:'liu.zx@demo.com'},
    {id:2023,name:'赵雅琪',departmentId:2,positionId:fp(2,'Mobile'),managerId:2011,status:'active',hireDate:'2021-09-01',phone:'13800000023',email:'zhao.yq@demo.com'},
    {id:2024,name:'胡浩然',departmentId:2,positionId:fp(2,'Mobile'),managerId:2011,status:'active',hireDate:'2022-03-20',phone:'13800000024',email:'hu.hr@demo.com'},
    {id:2025,name:'马天宇',departmentId:3,positionId:fp(3,'Backend'),managerId:2012,status:'active',hireDate:'2021-04-01',phone:'13800000025',email:'ma.ty@demo.com'},
    {id:2026,name:'朱雨薇',departmentId:3,positionId:fp(3,'Backend'),managerId:2012,status:'active',hireDate:'2021-08-18',phone:'13800000026',email:'zhu.yw@demo.com'},
    {id:2027,name:'何晨曦',departmentId:3,positionId:fp(3,'Backend'),managerId:2012,status:'active',hireDate:'2022-05-01',phone:'13800000027',email:'he.cx@demo.com'},
    {id:2028,name:'高博文',departmentId:3,positionId:fp(3,'Algorithm'),managerId:2013,status:'active',hireDate:'2021-10-01',phone:'13800000028',email:'gao.bw@demo.com'},
    {id:2029,name:'梁诗涵',departmentId:3,positionId:fp(3,'Algorithm'),managerId:2013,status:'active',hireDate:'2022-02-14',phone:'13800000029',email:'liang.sh@demo.com'},
    {id:2030,name:'谢宇飞',departmentId:4,positionId:fp(4,'QA'),managerId:2014,status:'active',hireDate:'2021-07-01',phone:'13800000030',email:'xie.yf@demo.com'},
    {id:2031,name:'宋佳怡',departmentId:4,positionId:fp(4,'SDET'),managerId:2014,status:'active',hireDate:'2021-11-15',phone:'13800000031',email:'song.jy@demo.com'},
    {id:2032,name:'唐嘉诚',departmentId:4,positionId:fp(4,'SDET'),managerId:2014,status:'active',hireDate:'2022-06-01',phone:'13800000032',email:'tang.jc@demo.com'},
    {id:2033,name:'韩雪莹',departmentId:6,positionId:fp(6,'Frontend'),managerId:2015,status:'active',hireDate:'2022-01-20',phone:'13800000033',email:'han.xy@demo.com'},
    {id:2034,name:'沈思源',departmentId:6,positionId:fp(6,'Frontend'),managerId:2015,status:'active',hireDate:'2022-04-10',phone:'13800000034',email:'shen.sy@demo.com'},
  ];
  employees.forEach(function(e){e.gender=e.gender||(e.id%2===0?'男':'女');e.birthday=e.birthday||'1990-01-01';e.contractEndDate=e.contractEndDate||'2028-12-31';e.salaryStructure=e.salaryStructure||'';e.performanceBonus=e.performanceBonus||'';e.idNumber=e.idNumber||'';e.idType=e.idType||'';e.nationality=e.nationality||'';e.educationLevel=e.educationLevel||'';e.university=e.university||'';e.major=e.major||'';e.politicalStatus=e.politicalStatus||'';e.address=e.address||'';e.emergencyContactName=e.emergencyContactName||'';e.emergencyContactPhone=e.emergencyContactPhone||'';e.emergencyContactRelation=e.emergencyContactRelation||'';e.notes=e.notes||'';});
  var cycles=[
    {id:1,name:'H1 2023',cycleType:'half_year',startDate:'2023-01-01',endDate:'2023-06-30',status:'closed'},
    {id:2,name:'FY 2023',cycleType:'year',startDate:'2023-01-01',endDate:'2023-12-31',status:'closed'},
    {id:3,name:'H1 2024',cycleType:'half_year',startDate:'2024-01-01',endDate:'2024-06-30',status:'closed'},
    {id:4,name:'FY 2024',cycleType:'year',startDate:'2024-01-01',endDate:'2024-12-31',status:'closed'},
    {id:5,name:'H1 2025',cycleType:'half_year',startDate:'2025-01-01',endDate:'2025-06-30',status:'open'},
  ];
  var GR=['A+','A','A-','B+','B','C','C-'],W=[3,10,15,30,25,12,5],cW=[],ws2=0;
  W.forEach(function(w){ws2+=w;cW.push(ws2);});
  function sd2(seed){var x=seed;return function(){x=(x*1103515245+12345)&0x7fffffff;return x/0x7fffffff;};}
  function pk2(rng,bias){var r=rng()*100,idx=cW.findIndex(function(c){return r<c;});if(idx<0)idx=3;idx=Math.max(0,Math.min(6,idx+bias));return GR[idx];}
  var reviews=[],ri2=1;
  var reviewable=employees.filter(function(e){return e.managerId!=null;});
  reviewable.forEach(function(e){
    var rng=sd2(e.id*7+31),bias=Math.floor(rng()*3)-1,hY=Number(String(e.hireDate||'2024').slice(0,4));
    cycles.forEach(function(cy){
      var cY=Number(cy.startDate.slice(0,4));if(cY<hY)return;
      if(cy.status==='open'){
        var roll=rng(),rmG=pk2(rng,bias),st,fG;
        if(roll<0.35){st='rm_pending';rmG='';fG='';}
        else if(roll<0.55){st='rm_evaluated';fG='';}
        else if(roll<0.70){st='in_approval';fG='';}
        else if(roll<0.82){st='pl_pending';fG='';}
        else if(roll<0.90){st='calibrated';fG=rmG;}
        else{st='finalized';fG=rmG;}
        reviews.push({id:ri2++,employeeId:e.id,reviewerId:e.managerId,cycleId:cy.id,rmInitialGrade:rmG,finalGrade:fG,status:st,rmComment:st!=='rm_pending'?'H1 2025 评估评语':'',outputDescription:st!=='rm_pending'?'本周期关键产出总结':'',historyPerformance:'',comments:'',devAdvice:'',approvalChain:[],approvalStepIndex:0,pendingApproverId:st==='rm_pending'?e.managerId:null,approvalLog:[],prevCycleAvgHours:null,communicationNotes:'',communicatedAt:null,appealDeadline:null,calibratedBy:st==='finalized'?2001:null,calibratedAt:st==='finalized'?'2025-03-28':null,createdAt:'2025-03-15'});
      } else {
        var g=pk2(rng,bias);
        reviews.push({id:ri2++,employeeId:e.id,reviewerId:e.managerId,cycleId:cy.id,rmInitialGrade:g,finalGrade:g,status:'finalized',rmComment:cy.name+' 绩效评语',outputDescription:'产出符合预期',historyPerformance:'',comments:'',devAdvice:'',approvalChain:[],approvalStepIndex:0,pendingApproverId:null,approvalLog:[{approverId:e.managerId,at:cy.endDate,action:'calibrate',note:'HRBP 校准'}],prevCycleAvgHours:null,communicationNotes:'已沟通',communicatedAt:cy.endDate,appealDeadline:null,calibratedBy:2001,calibratedAt:cy.endDate,createdAt:cy.startDate});
      }
    });
  });
  var perf=['A+','A','B+','B','C'],pot=['H','M','L'];
  var talentMatrix=employees.filter(function(e){return e.status==='active';}).map(function(e,i){return{employeeId:e.id,performance:perf[i%5],potential:pot[i%3],developmentPlan:''};});
  saveKey('departments',departments);saveKey('positions',positions);saveKey('employees',employees);
  saveKey('leaveRequests',[]);saveKey('performanceReviews',reviews);saveKey('trainings',[]);
  saveKey('employeeTrainings',[]);
  saveKey('attendanceRules',{workStart:'09:30',workEnd:'18:30',leaveTypes:['annual','sick','personal','overtime'],labels:{annual:'年假',sick:'病假',personal:'事假',overtime:'调休'},monthlyStandardDays:20,loadBandLow:0.88,loadBandHigh:1.12});
  saveKey('attendanceRecords',[]);saveKey('punchRecords',[]);saveKey('kpiLibrary',[]);
  saveKey('performanceCycles',cycles);saveKey('talentMatrix',talentMatrix);saveKey('successionPlans',[]);
  saveKey('notifications',[]);saveKey('positionRecruitTags',{});saveKey('recruitmentCandidates',[]);
  saveKey('recruitmentPositionMetrics',{});saveKey('recruitmentPipeline',[]);saveKey('interviewerPool',[]);
  saveKey('orgSettings',{productLineHeadEmployeeId:2001});saveKey('orgChangeRequests',[]);
  saveKey('rosterColumnSettings',null);saveKey('_seedVersion',21);
  var GLOBAL_USERS_KEY='tm_global_users';
  var existingUsers=[];
  try{
    if(window.TM._idb&&!window.TM._idb.isFallback()&&window.TM._idb.isReady()){var idbVal2=window.TM._idb.loadKey(GLOBAL_USERS_KEY,null);if(idbVal2)existingUsers=idbVal2;}
    if(!existingUsers.length){var rawU=localStorage.getItem(GLOBAL_USERS_KEY);if(rawU)existingUsers=JSON.parse(rawU)||[];}
  }catch(_){}
  var mgrMods2=['dashboard','roster','org','recruitment','talent','performance','attendance'];
  var mgrOps2=TM.RM_ALL_OPS_ON?TM.RM_ALL_OPS_ON():{};
  var newAccounts=[
    {username:'zhao.my',email:'zhao.my@demo.com',password:'123',role:'manager',realName:'赵明远',employeeId:2001,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'qian.xf',email:'qian.xf@demo.com',password:'123',role:'manager',realName:'钱晓峰',employeeId:2002,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'sun.wh',email:'sun.wh@demo.com',password:'123',role:'manager',realName:'孙伟华',employeeId:2003,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'li.tt',email:'li.tt@demo.com',password:'123',role:'manager',realName:'李婷婷',employeeId:2004,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'zhou.jg',email:'zhou.jg@demo.com',password:'123',role:'manager',realName:'周建国',employeeId:2005,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'wu.lh',email:'wu.lh@demo.com',password:'123',role:'manager',realName:'吴丽华',employeeId:2006,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'zheng.zq',email:'zheng.zq@demo.com',password:'123',role:'manager',realName:'郑志强',employeeId:2010,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'wang.hy',email:'wang.hy@demo.com',password:'123',role:'manager',realName:'王海燕',employeeId:2011,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'feng.dw',email:'feng.dw@demo.com',password:'123',role:'manager',realName:'冯大伟',employeeId:2012,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'chen.sy',email:'chen.sy@demo.com',password:'123',role:'manager',realName:'陈思远',employeeId:2013,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'yang.xy',email:'yang.xy@demo.com',password:'123',role:'manager',realName:'杨秀英',employeeId:2014,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
    {username:'huang.wb',email:'huang.wb@demo.com',password:'123',role:'manager',realName:'黄文博',employeeId:2015,homeLineId:lid,rmStatus:'active',managerPermissions:{modules:mgrMods2.slice(),ops:Object.assign({},mgrOps2)}},
  ];
  var merged=new Map();
  existingUsers.forEach(function(u){merged.set(String(u.email||'').toLowerCase(),u);});
  newAccounts.forEach(function(u){merged.set(String(u.email||'').toLowerCase(),u);});
  var nid=1,finalUsers=[];
  merged.forEach(function(u){u.id=nid++;finalUsers.push(u);});
  localStorage.setItem(GLOBAL_USERS_KEY,JSON.stringify(finalUsers));
  if(window.TM._idb&&window.TM._idb.saveKey&&!window.TM._idb.isFallback()){window.TM._idb.saveKey(GLOBAL_USERS_KEY,finalUsers);}
  return{seeded:true,employeeCount:employees.length,reviewCount:reviews.length};
}
TM.seedMultiLevelOrg = seedMultiLevelOrg;

})(window.TM);
