const HIGH_GRADES = new Set(['A+', 'A', 'A-']);
const LOW_GRADES = new Set(['C', 'C-']);
const LOW_SALARY_BANDS = new Set(['below_min', 'p25']);

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function round(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function avg(values, digits = 1) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return round(nums.reduce((a, b) => a + b, 0) / nums.length, digits);
}

function inc(obj, key, step = 1) {
  const k = key == null || key === '' ? '未填写' : String(key);
  obj[k] = (obj[k] || 0) + step;
}

function countBy(rows, picker) {
  const out = {};
  arr(rows).forEach((row) => inc(out, picker(row)));
  return out;
}

function topEntries(obj, limit = 8) {
  return Object.entries(obj || {})
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), 'zh-Hans-CN'))
    .slice(0, limit);
}

function byId(rows) {
  const map = new Map();
  arr(rows).forEach((row) => {
    const id = num(row?.id);
    if (id != null) map.set(id, row);
  });
  return map;
}

function cycleSortKey(review, cycleMap) {
  const cycle = cycleMap.get(num(review?.cycleId)) || {};
  return [
    cycle.endDate || '',
    cycle.startDate || '',
    review?.createdAt || '',
    String(review?.id || ''),
  ].join('|');
}

function latestFinalizedReviews(performanceReviews, performanceCycles) {
  const cycleMap = byId(performanceCycles);
  const out = new Map();
  arr(performanceReviews)
    .filter((r) => String(r.status || '') === 'finalized' && String(r.finalGrade || '').trim())
    .sort((a, b) => cycleSortKey(a, cycleMap).localeCompare(cycleSortKey(b, cycleMap)))
    .forEach((review) => {
      const employeeId = num(review.employeeId);
      if (employeeId != null) out.set(employeeId, review);
    });
  return out;
}

function buildEmployeeFacts(workspace, question, latestReviewByEmployee) {
  const employees = arr(workspace.employees);
  const deptMap = byId(workspace.departments);
  const posMap = byId(workspace.positions);
  const talentMap = new Map(arr(workspace.talentMatrix).map((t) => [num(t.employeeId), t]));
  const attendanceByEmp = new Map();

  arr(workspace.attendanceRecords).forEach((row) => {
    const employeeId = num(row.employeeId);
    if (employeeId == null) return;
    if (!attendanceByEmp.has(employeeId)) attendanceByEmp.set(employeeId, []);
    attendanceByEmp.get(employeeId).push(row);
  });

  const q = String(question || '').trim();
  const matched = [];
  const risk = [];
  employees.forEach((employee) => {
    const employeeId = num(employee.id);
    const dept = deptMap.get(num(employee.departmentId));
    const pos = posMap.get(num(employee.positionId));
    const latestReview = latestReviewByEmployee.get(employeeId);
    const talent = talentMap.get(employeeId) || {};
    const attRows = attendanceByEmp.get(employeeId) || [];
    const avgDailyHours = avg(attRows.map((r) => r.avgDailyHours), 1);
    const fact = {
      id: employee.id,
      name: employee.name || '',
      department: dept?.name || '',
      position: pos?.name || '',
      level: pos?.level || '',
      managerId: employee.managerId ?? null,
      status: employee.status || '',
      hireDate: employee.hireDate || '',
      salaryBand: employee.salaryBand || '',
      latestFinalGrade: latestReview?.finalGrade || '',
      talentPerformance: talent.performance || '',
      talentPotential: talent.potential || '',
      avgDailyHours,
    };

    if (q && (
      (employee.name && q.includes(String(employee.name)))
      || (employee.id != null && q.includes(String(employee.id)))
    )) {
      matched.push(fact);
      return;
    }
    if (
      HIGH_GRADES.has(fact.latestFinalGrade)
      || LOW_GRADES.has(fact.latestFinalGrade)
      || fact.talentPotential === 'H'
      || LOW_SALARY_BANDS.has(fact.salaryBand)
      || (avgDailyHours != null && (avgDailyHours >= 10 || avgDailyHours <= 6.5))
    ) {
      risk.push(fact);
    }
  });

  const selected = (matched.length ? matched : risk).slice(0, 80);
  return selected;
}

function buildDepartmentStats(workspace) {
  const employees = arr(workspace.employees);
  const departments = arr(workspace.departments);
  const byDept = new Map();
  departments.forEach((dept) => {
    byDept.set(num(dept.id), {
      id: dept.id,
      name: dept.name || `部门 ${dept.id}`,
      parentId: dept.parentId ?? null,
      managerId: dept.managerId ?? null,
      hcPlan: num(dept.hcPlan) || 0,
      employeeCount: 0,
      activeCount: 0,
      probationCount: 0,
      leaveCount: 0,
    });
  });
  employees.forEach((employee) => {
    const deptId = num(employee.departmentId);
    if (!byDept.has(deptId)) {
      byDept.set(deptId, {
        id: deptId,
        name: '未归属部门',
        parentId: null,
        managerId: null,
        hcPlan: 0,
        employeeCount: 0,
        activeCount: 0,
        probationCount: 0,
        leaveCount: 0,
      });
    }
    const row = byDept.get(deptId);
    row.employeeCount += 1;
    if (employee.status === 'active') row.activeCount += 1;
    else if (employee.status === 'probation') row.probationCount += 1;
    else if (employee.status === 'leave') row.leaveCount += 1;
  });
  return Array.from(byDept.values()).sort((a, b) => b.employeeCount - a.employeeCount);
}

function buildPerformanceStats(workspace, latestReviewByEmployee) {
  const employees = arr(workspace.employees);
  const deptMap = byId(workspace.departments);
  const employeeMap = byId(employees);
  const finalized = Array.from(latestReviewByEmployee.values());
  const latestGrades = finalized.map((r) => String(r.finalGrade || '').trim()).filter(Boolean);
  const statusCounts = countBy(workspace.performanceReviews, (r) => r.status || '未填写');
  const gradeCounts = countBy(latestGrades, (g) => g);
  const byDepartment = {};
  let highCount = 0;
  let lowCount = 0;
  let highPerfLowSalaryCount = 0;

  finalized.forEach((review) => {
    const grade = String(review.finalGrade || '').trim();
    const employee = employeeMap.get(num(review.employeeId)) || {};
    const deptName = deptMap.get(num(employee.departmentId))?.name || '未归属部门';
    if (!byDepartment[deptName]) byDepartment[deptName] = {};
    inc(byDepartment[deptName], grade);
    if (HIGH_GRADES.has(grade)) {
      highCount += 1;
      if (LOW_SALARY_BANDS.has(String(employee.salaryBand || ''))) highPerfLowSalaryCount += 1;
    }
    if (LOW_GRADES.has(grade)) lowCount += 1;
  });

  return {
    reviewCount: arr(workspace.performanceReviews).length,
    latestFinalizedCount: finalized.length,
    statusCounts,
    latestFinalGradeCounts: gradeCounts,
    highPerformanceCount: highCount,
    lowPerformanceCount: lowCount,
    highPerformanceLowSalaryCount: highPerfLowSalaryCount,
    byDepartment: Object.entries(byDepartment).map(([department, grades]) => ({
      department,
      grades,
      finalizedCount: Object.values(grades).reduce((a, b) => a + b, 0),
    })).sort((a, b) => b.finalizedCount - a.finalizedCount).slice(0, 12),
  };
}

function buildAttendanceStats(workspace) {
  const rows = arr(workspace.attendanceRecords);
  const rules = workspace.attendanceRules || {};
  const standardHours = (() => {
    const parse = (value, fallback) => {
      const m = String(value || fallback).match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return Number(m[1]) + Number(m[2]) / 60;
    };
    const start = parse(rules.workStart, '09:30');
    const end = parse(rules.workEnd, '18:30');
    return start != null && end != null && end > start ? end - start : 9;
  })();
  const low = rules.loadBandLow != null ? Number(rules.loadBandLow) : 0.88;
  const high = rules.loadBandHigh != null ? Number(rules.loadBandHigh) : 1.12;
  const monthMap = new Map();
  let highLoadCount = 0;
  let lowLoadCount = 0;
  rows.forEach((row) => {
    const h = num(row.avgDailyHours);
    if (h == null) return;
    const ratio = row.loadRatio != null ? Number(row.loadRatio) : h / standardHours;
    if (ratio > high) highLoadCount += 1;
    if (ratio < low) lowLoadCount += 1;
    const month = row.month || '未填写';
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month).push(h);
  });
  return {
    recordCount: rows.length,
    monthCount: monthMap.size,
    avgDailyHours: avg(rows.map((r) => r.avgDailyHours), 1),
    highLoadCount,
    lowLoadCount,
    byMonth: Array.from(monthMap.entries())
      .map(([month, values]) => ({ month, avgDailyHours: avg(values, 1), recordCount: values.length }))
      .sort((a, b) => String(b.month).localeCompare(String(a.month)))
      .slice(0, 12),
  };
}

function buildRecruitmentStats(workspace) {
  const pipeline = arr(workspace.recruitmentPipeline);
  const candidates = arr(workspace.recruitmentCandidates);
  return {
    pipelineCount: pipeline.length,
    importedCandidateCount: candidates.length,
    teamCounts: countBy(pipeline, (c) => c.team || c.department || '未填写'),
    recruitTypeCounts: countBy(pipeline, (c) => c.recruitType || c.recruit_type || '未填写'),
    hrScreeningCounts: countBy(pipeline, (c) => c.hrScreening || c.hr_screening || '未填写'),
    interview1Counts: countBy(pipeline, (c) => c.interview1 || '未填写'),
    interview2Counts: countBy(pipeline, (c) => c.interview2 || '未填写'),
    finalInterviewCounts: countBy(pipeline, (c) => c.interviewFinal || c.interview_final || '未填写'),
    offerCounts: countBy(pipeline, (c) => c.offering || '未填写'),
  };
}

function buildAiDataset(workspace, context, question) {
  const employees = arr(workspace.employees);
  const positions = arr(workspace.positions);
  const latestReviewByEmployee = latestFinalizedReviews(
    workspace.performanceReviews,
    workspace.performanceCycles,
  );
  const activeEmployees = employees.filter((e) => e.status !== 'leave');
  const departmentStats = buildDepartmentStats(workspace);
  const dataset = {
    generatedAt: new Date().toISOString(),
    context: {
      productLine: context?.productLine || null,
      permissions: context?.permissions || null,
    },
    totals: {
      employees: employees.length,
      activeEmployees: activeEmployees.length,
      departments: arr(workspace.departments).length,
      positions: positions.length,
      users: arr(workspace.users).length,
      leaveRequests: arr(workspace.leaveRequests).length,
      performanceReviews: arr(workspace.performanceReviews).length,
      attendanceRecords: arr(workspace.attendanceRecords).length,
      recruitmentPipeline: arr(workspace.recruitmentPipeline).length,
      recruitmentCandidates: arr(workspace.recruitmentCandidates).length,
    },
    distributions: {
      employeeStatus: countBy(employees, (e) => e.status || '未填写'),
      gender: countBy(employees, (e) => e.gender || '未填写'),
      level: countBy(positions, (p) => p.level || '未填写'),
      departmentTop: topEntries(countBy(employees, (e) => (
        departmentStats.find((d) => num(d.id) === num(e.departmentId))?.name || '未归属部门'
      )), 10),
      talentPerformance: countBy(workspace.talentMatrix, (t) => t.performance || '未填写'),
      talentPotential: countBy(workspace.talentMatrix, (t) => t.potential || '未填写'),
    },
    organization: {
      departments: departmentStats.slice(0, 30),
      hcPlanTotal: departmentStats.reduce((sum, d) => sum + (num(d.hcPlan) || 0), 0),
    },
    performance: buildPerformanceStats(workspace, latestReviewByEmployee),
    attendance: buildAttendanceStats(workspace),
    recruitment: buildRecruitmentStats(workspace),
    employeeSamples: buildEmployeeFacts(workspace, question, latestReviewByEmployee),
  };
  dataset.ratios = {
    activeRate: pct(dataset.totals.activeEmployees, dataset.totals.employees),
    finalizedPerformanceCoverage: pct(
      dataset.performance.latestFinalizedCount,
      dataset.totals.employees,
    ),
  };
  return dataset;
}

function buildDataProfile(dataset) {
  return {
    generatedAt: dataset.generatedAt,
    productLine: dataset.context?.productLine || null,
    permissions: dataset.context?.permissions || null,
    totals: dataset.totals,
    ratios: dataset.ratios,
    employeeStatus: dataset.distributions.employeeStatus,
    departmentTop: dataset.distributions.departmentTop,
    performance: {
      latestFinalizedCount: dataset.performance.latestFinalizedCount,
      latestFinalGradeCounts: dataset.performance.latestFinalGradeCounts,
      highPerformanceCount: dataset.performance.highPerformanceCount,
      lowPerformanceCount: dataset.performance.lowPerformanceCount,
      highPerformanceLowSalaryCount: dataset.performance.highPerformanceLowSalaryCount,
    },
    attendance: {
      recordCount: dataset.attendance.recordCount,
      avgDailyHours: dataset.attendance.avgDailyHours,
      highLoadCount: dataset.attendance.highLoadCount,
      lowLoadCount: dataset.attendance.lowLoadCount,
    },
    recruitment: {
      pipelineCount: dataset.recruitment.pipelineCount,
      offerCounts: dataset.recruitment.offerCounts,
    },
  };
}

function formatCounts(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return '暂无数据';
  return entries.map(([k, v]) => `${k} ${v}`).join('、');
}

function localAnswer(question, dataset) {
  const q = String(question || '');
  const lines = [];
  const scope = dataset.context?.permissions?.scope || '当前权限范围';
  lines.push(`**核心结论**：已基于「${scope}」内的主系统数据生成摘要。当前可见员工 ${dataset.totals.employees} 人，其中非离职 ${dataset.totals.activeEmployees} 人，覆盖 ${dataset.totals.departments} 个部门。`);

  if (/绩效|评级|等级|校准|归档|低绩效|高绩效/i.test(q)) {
    lines.push('');
    lines.push('**绩效发现**');
    lines.push(`- 最新已归档绩效覆盖 ${dataset.performance.latestFinalizedCount} 人，覆盖率 ${dataset.ratios.finalizedPerformanceCoverage}%。`);
    lines.push(`- 最新最终等级分布：${formatCounts(dataset.performance.latestFinalGradeCounts)}。`);
    lines.push(`- 高绩效人数 ${dataset.performance.highPerformanceCount}，低绩效人数 ${dataset.performance.lowPerformanceCount}。`);
    if (dataset.performance.highPerformanceLowSalaryCount) {
      lines.push(`- 高绩效且薪酬分位偏低人数 ${dataset.performance.highPerformanceLowSalaryCount}，建议作为保留风险线索复核。`);
    }
  } else if (/考勤|工时|出勤|负荷|加班/i.test(q)) {
    lines.push('');
    lines.push('**考勤发现**');
    lines.push(`- 当前可见考勤记录 ${dataset.attendance.recordCount} 条，平均日工时 ${dataset.attendance.avgDailyHours ?? '暂无'} 小时。`);
    lines.push(`- 高负荷记录 ${dataset.attendance.highLoadCount} 条，低负荷记录 ${dataset.attendance.lowLoadCount} 条。`);
    if (dataset.attendance.byMonth.length) {
      const latest = dataset.attendance.byMonth[0];
      lines.push(`- 最近月份 ${latest.month} 平均日工时 ${latest.avgDailyHours ?? '暂无'} 小时，记录 ${latest.recordCount} 条。`);
    }
  } else if (/招聘|候选|面试|offer|Offer|漏斗/i.test(q)) {
    lines.push('');
    lines.push('**招聘发现**');
    lines.push(`- 当前 pipeline 候选人 ${dataset.recruitment.pipelineCount} 人，导入候选人 ${dataset.recruitment.importedCandidateCount} 人。`);
    lines.push(`- Offer 状态分布：${formatCounts(dataset.recruitment.offerCounts)}。`);
    lines.push(`- HR 筛选分布：${formatCounts(dataset.recruitment.hrScreeningCounts)}。`);
  } else if (/人才|九宫格|潜力|继任|保留|流失/i.test(q)) {
    lines.push('');
    lines.push('**人才发现**');
    lines.push(`- 九宫格绩效分布：${formatCounts(dataset.distributions.talentPerformance)}。`);
    lines.push(`- 潜力分布：${formatCounts(dataset.distributions.talentPotential)}。`);
    lines.push(`- 高绩效低薪酬线索 ${dataset.performance.highPerformanceLowSalaryCount} 人，建议结合经理反馈、关键岗位和继任计划复核。`);
  } else {
    lines.push('');
    lines.push('**整体概览**');
    lines.push(`- 员工状态：${formatCounts(dataset.distributions.employeeStatus)}。`);
    lines.push(`- 部门人数 Top：${dataset.distributions.departmentTop.map((d) => `${d.label} ${d.count}`).join('、') || '暂无数据'}。`);
    lines.push(`- 绩效最新等级：${formatCounts(dataset.performance.latestFinalGradeCounts)}。`);
    lines.push(`- 招聘 pipeline：${dataset.recruitment.pipelineCount} 人。`);
  }

  lines.push('');
  lines.push('**风险提示**：以上结果只代表当前账号、当前产品线和当前组织范围内的数据；涉及薪酬、绩效、晋升、离职、调动、招聘 Offer 或候选人评价时，应由 HRBP/管理者结合制度和事实证据复核。');
  lines.push('');
  lines.push('**建议动作**：优先核对样本量、审批状态和数据更新时间，再把异常项拆到部门、经理、岗位或周期维度做二次分析。');
  return lines.join('\n');
}

module.exports = {
  buildAiDataset,
  buildDataProfile,
  localAnswer,
};
