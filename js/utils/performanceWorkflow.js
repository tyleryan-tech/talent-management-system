/**
 * 绩效管理：等级档、审批链、周期展示、跨模块成绩展示、数据迁移规范化
 */
(function (TM) {
  TM.PERF_GRADE_OPTIONS = ['A+', 'A', 'A-', 'B+', 'B', 'C', 'C-'];
  TM.PERF_CYCLE_TYPE_LABEL = { half_year: '半年绩效', year: '年度绩效' };
  TM.PERF_CYCLE_TYPE_LABEL_EN = { half_year: 'Half-year', year: 'Annual' };

  TM.PERF_VALID_STATUSES = ['rm_pending', 'rm_evaluated', 'in_approval', 'pl_pending', 'calibrated', 'pl_approved', 'finalized', 'rejected'];

  TM.PERF_STATUS_LABEL = {
    rm_pending: '待 RM 评估',
    rm_evaluated: '已评估（待提交）',
    in_approval: '逐级审批中',
    pl_pending: '待 HRBP 校准',
    calibrated: '已校准（待产品线审批）',
    pl_approved: '产品线已审批（待归档）',
    finalized: '已归档',
    rejected: '已驳回',
  };

  /** actorId 是否在 targetId 的汇报链上方 */
  TM.isManagerOf = function isManagerOf(data, actorId, targetId) {
    if (Number(actorId) === Number(targetId)) return false;
    const byId = data._empMap || new Map((data.employees || []).map((e) => [e.id, e]));
    let cur = byId.get(Number(targetId));
    const seen = new Set();
    while (cur && cur.managerId != null) {
      const mid = Number(cur.managerId);
      if (seen.has(mid)) break;
      seen.add(mid);
      if (mid === Number(actorId)) return true;
      cur = byId.get(mid);
    }
    return false;
  };

  TM.scoreToDetailedGrade = function scoreToDetailedGrade(score) {
    const n = Number(score);
    if (Number.isNaN(n)) return 'B';
    if (n >= 93) return 'A+';
    if (n >= 88) return 'A';
    if (n >= 83) return 'A-';
    if (n >= 78) return 'B+';
    if (n >= 72) return 'B';
    if (n >= 65) return 'C';
    return 'C-';
  };

  TM.buildApprovalChainAboveRm = function buildApprovalChainAboveRm(data, rmEmployeeId) {
    const chain = [];
    const emps = data.employees || [];
    const byId = new Map(emps.map((e) => [e.id, e]));
    const plHeadId = data.orgSettings?.productLineHeadEmployeeId != null
      ? Number(data.orgSettings.productLineHeadEmployeeId) : null;
    let nextId = (() => {
      const cur = rmEmployeeId != null ? byId.get(Number(rmEmployeeId)) : null;
      return cur != null ? cur.managerId : null;
    })();
    const seen = new Set();
    while (nextId != null && !seen.has(Number(nextId))) {
      if (plHeadId != null && Number(nextId) === plHeadId) break;
      seen.add(Number(nextId));
      chain.push(Number(nextId));
      const m = byId.get(Number(nextId));
      nextId = m ? m.managerId : null;
    }
    return chain;
  };

  TM.collectSubtreeEmployeeIds = function collectSubtreeEmployeeIds(data, managerEmpId) {
    const out = new Set();
    const walk = (mgrId) => {
      (data.employees || []).filter((e) => e.managerId === mgrId && e.status !== 'leave').forEach((sub) => {
        out.add(sub.id);
        walk(sub.id);
      });
    };
    walk(Number(managerEmpId));
    return out;
  };

  TM.reviewCycleRecord = function reviewCycleRecord(data, review) {
    const cid = review.cycleId;
    if (cid == null) return null;
    return (data.performanceCycles || []).find((x) => x.id === Number(cid)) || null;
  };

  TM.reviewCycleLabel = function reviewCycleLabel(data, review) {
    const c = TM.reviewCycleRecord(data, review);
    if (c) return c.name;
    return String(review.cycle || '').trim() || '—';
  };

  TM.reviewSortStamp = function reviewSortStamp(data, review) {
    const c = TM.reviewCycleRecord(data, review);
    if (c && c.startDate) return String(c.startDate);
    return String(review.createdAt || '');
  };

  TM.effectivePerfGrade = function effectivePerfGrade(review) {
    if (!review) return '—';
    const hasF = review.status === 'finalized' || review.status === 'calibrated' || review.status === 'pl_approved' || review.status === 'pl_pending';
    if (hasF && review.finalGrade) return String(review.finalGrade).trim();
    if (review.rmInitialGrade) return String(review.rmInitialGrade).trim();
    return '—';
  };

  /**
   * Compute talent-review performance rating (A/B/C) from annual reviews.
   *   A: annual A-tier (A+/A/A-) >= 50 % AND no C/C-
   *   B: annual B-tier (B+/B) majority, no C/C-
   *   C: has any C/C-
   */
  TM.computePerfRatingFromReviews = function computePerfRatingFromReviews(reviews, cycles) {
    const cycleMap = new Map((cycles || []).map((c) => [c.id, c]));
    const annualGrades = (reviews || [])
      .filter((r) => {
        if (r.status !== 'finalized' || !r.finalGrade) return false;
        const c = cycleMap.get(r.cycleId);
        return c && c.cycleType === 'year';
      })
      .map((r) => String(r.finalGrade).trim());
    if (!annualGrades.length) return 'B';
    const total = annualGrades.length;
    const aTier = annualGrades.filter((g) => g === 'A+' || g === 'A' || g === 'A-').length;
    const hasCTier = annualGrades.some((g) => g === 'C' || g === 'C-');
    if (hasCTier) return 'C';
    if (aTier / total >= 0.5) return 'A';
    return 'B';
  };

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Build HTML string of all finalized grades for an employee, most-recent first.
   * Half-year grades render in normal weight; annual grades render bold.
   * @param {Array} reviews - performanceReviews filtered for one employee
   * @param {Array} cycles  - performanceCycles
   * @returns {string} HTML string like '<b class="perf-annual">A</b>, <span class="perf-half">B+</span>, ...'
   */
  TM.allGradesForDisplay = function allGradesForDisplay(reviews, cycles) {
    const cycleMap = new Map((cycles || []).map((c) => [c.id, c]));
    const DONE = { finalized: 1, calibrated: 1, pl_approved: 1 };
    const finalized = (reviews || []).filter((r) => DONE[r.status] && r.finalGrade);
    finalized.sort((a, b) => {
      const ca = cycleMap.get(a.cycleId);
      const cb = cycleMap.get(b.cycleId);
      const sa = ca ? ca.startDate : (a.createdAt || '');
      const sb = cb ? cb.startDate : (b.createdAt || '');
      return String(sb).localeCompare(String(sa));
    });
    if (!finalized.length) return '';
    return finalized.map((r) => {
      const c = cycleMap.get(r.cycleId);
      const g = escapeHtml(String(r.finalGrade).trim());
      if (c && c.cycleType === 'year') {
        return '<b class="perf-annual">' + g + '</b>';
      }
      return '<span class="perf-half">' + g + '</span>';
    }).join(', ');
  };

  TM.allGradesStructured = function allGradesStructured(reviews, cycles) {
    const cycleMap = new Map((cycles || []).map((c) => [c.id, c]));
    const DONE = { finalized: 1, calibrated: 1, pl_approved: 1 };
    const finalized = (reviews || []).filter((r) => DONE[r.status] && r.finalGrade);
    finalized.sort((a, b) => {
      const ca = cycleMap.get(a.cycleId);
      const cb = cycleMap.get(b.cycleId);
      const sa = ca ? ca.startDate : (a.createdAt || '');
      const sb = cb ? cb.startDate : (b.createdAt || '');
      return String(sb).localeCompare(String(sa));
    });
    return finalized.map((r) => {
      const c = cycleMap.get(r.cycleId);
      return { grade: String(r.finalGrade).trim(), annual: !!(c && c.cycleType === 'year') };
    });
  };

  /**
   * Plain text version for export / hover.
   */
  TM.allGradesPlainText = function allGradesPlainText(reviews, cycles) {
    const cycleMap = new Map((cycles || []).map((c) => [c.id, c]));
    const DONE = { finalized: 1, calibrated: 1, pl_approved: 1 };
    const finalized = (reviews || []).filter((r) => DONE[r.status] && r.finalGrade);
    finalized.sort((a, b) => {
      const ca = cycleMap.get(a.cycleId);
      const cb = cycleMap.get(b.cycleId);
      const sa = ca ? ca.startDate : (a.createdAt || '');
      const sb = cb ? cb.startDate : (b.createdAt || '');
      return String(sb).localeCompare(String(sa));
    });
    if (!finalized.length) return '—';
    return finalized.map((r) => String(r.finalGrade).trim()).join(', ');
  };

  function isValidGrade(g) {
    return TM.PERF_GRADE_OPTIONS.includes(String(g || '').trim());
  }

  TM.normalizePerformanceReviewsStore = function normalizePerformanceReviewsStore(store) {
    const cycles = store.performanceCycles || [];
    const byName = new Map(cycles.map((c) => [String(c.name || '').trim(), c]));
    const openCycle = cycles.find((c) => c.status === 'open') || cycles[0];
    let changed = false;

    const nextList = (store.performanceReviews || []).map((raw) => {
      const r = { ...raw };
      let rowChanged = false;

      let cycleId = r.cycleId != null ? Number(r.cycleId) : NaN;
      if (!cycles.some((x) => x.id === cycleId)) {
        const legacyName = typeof r.cycle === 'string' ? r.cycle.trim() : '';
        const hit = legacyName ? byName.get(legacyName) : null;
        if (hit) cycleId = hit.id;
        else if (openCycle) cycleId = openCycle.id;
        else cycleId = 1;
        rowChanged = true;
      }

      const emp = store.employees.find((e) => e.id === r.employeeId);
      let reviewerId = r.reviewerId != null ? Number(r.reviewerId) : null;
      if (reviewerId == null && emp && emp.managerId != null) {
        reviewerId = Number(emp.managerId);
        rowChanged = true;
      }

      let status = r.status;
      if (status === 'self') {
        status = 'rm_pending';
        rowChanged = true;
      } else if (status === 'completed') {
        status = 'finalized';
        rowChanged = true;
      } else if (status === 'manager' || status === 'hr') {
        status = 'in_approval';
        rowChanged = true;
      } else if (status === 'pl_approved' && !r._newFlowPlApproved) {
        status = 'pl_pending';
        rowChanged = true;
      }
      if (!TM.PERF_VALID_STATUSES.includes(status)) {
        status = 'rm_pending';
        rowChanged = true;
      }

      let rmInitialGrade = String(r.rmInitialGrade || '').trim();
      let finalGrade = String(r.finalGrade || '').trim();

      if (raw.overallScore != null && raw.overallScore !== '') {
        const g = TM.scoreToDetailedGrade(raw.overallScore);
        if (status === 'finalized' && !finalGrade) {
          finalGrade = g;
          rowChanged = true;
        }
        if (!rmInitialGrade) {
          rmInitialGrade = g;
          rowChanged = true;
        }
      }

      if (finalGrade && !isValidGrade(finalGrade)) { finalGrade = 'B'; rowChanged = true; }
      if (rmInitialGrade && !isValidGrade(rmInitialGrade)) { rmInitialGrade = 'B'; rowChanged = true; }

      let approvalChain = Array.isArray(r.approvalChain)
        ? r.approvalChain.map(Number).filter((id) => !Number.isNaN(id))
        : [];
      let approvalStepIndex = r.approvalStepIndex != null ? Number(r.approvalStepIndex) : 0;
      let pendingApproverId = r.pendingApproverId != null ? Number(r.pendingApproverId) : null;
      const approvalLog = Array.isArray(r.approvalLog) ? [...r.approvalLog] : [];

      if (status === 'finalized' || status === 'calibrated' || status === 'pl_approved' || status === 'pl_pending') {
        if ((status === 'finalized' || status === 'calibrated' || status === 'pl_approved') && !finalGrade && rmInitialGrade) {
          finalGrade = rmInitialGrade;
          rowChanged = true;
        }
        if (pendingApproverId != null) {
          pendingApproverId = null;
          rowChanged = true;
        }
      } else if (status === 'rejected') {
        if (pendingApproverId != null) {
          pendingApproverId = null;
          rowChanged = true;
        }
      } else if (status === 'rm_pending') {
        const built = TM.buildApprovalChainAboveRm(store, reviewerId);
        if (JSON.stringify(approvalChain) !== JSON.stringify(built)) {
          approvalChain = built;
          rowChanged = true;
        }
        if (approvalStepIndex !== 0) { approvalStepIndex = 0; rowChanged = true; }
        if (pendingApproverId !== reviewerId) { pendingApproverId = reviewerId; rowChanged = true; }
      } else if (status === 'rm_evaluated') {
        if (pendingApproverId != null) { pendingApproverId = null; rowChanged = true; }
      } else if (status === 'in_approval') {
        if (!approvalChain.length && reviewerId != null) {
          approvalChain = TM.buildApprovalChainAboveRm(store, reviewerId);
          rowChanged = true;
        }
        if (!approvalChain.length) {
          status = 'pl_pending';
          pendingApproverId = null;
          rowChanged = true;
        } else {
          if (pendingApproverId == null || !approvalChain.includes(pendingApproverId)) {
            pendingApproverId = approvalChain[0];
            approvalStepIndex = 0;
            rowChanged = true;
          } else {
            const idx = approvalChain.indexOf(pendingApproverId);
            if (idx >= 0 && idx !== approvalStepIndex) {
              approvalStepIndex = idx;
              rowChanged = true;
            }
          }
        }
      }

      if (raw.scores !== undefined) { delete r.scores; rowChanged = true; }
      if (raw.overallScore !== undefined) { delete r.overallScore; rowChanged = true; }

      const historyPerformance = String(r.historyPerformance ?? '').trim()
        || (String(r.comments || '').slice(0, 400));
      const outputDescription = String(r.outputDescription ?? '').trim();
      const prevH = r.prevCycleAvgHours != null && r.prevCycleAvgHours !== ''
        ? Math.round(Number(r.prevCycleAvgHours) * 10) / 10
        : null;
      const comments = String(r.comments ?? '').trim();
      const devAdvice = String(r.devAdvice ?? '').trim();
      const createdAt = r.createdAt || new Date().toISOString().slice(0, 10);
      const rmComment = String(r.rmComment ?? '').trim();
      const communicationNotes = String(r.communicationNotes ?? '').trim();
      const communicatedAt = r.communicatedAt || null;
      const appealDeadline = r.appealDeadline || null;
      const calibratedBy = r.calibratedBy ?? null;
      const calibratedAt = r.calibratedAt || null;

      if (historyPerformance !== String(raw.historyPerformance ?? '').trim()) rowChanged = true;
      if (outputDescription !== String(raw.outputDescription ?? '').trim()) rowChanged = true;
      if (comments !== String(raw.comments ?? '').trim()) rowChanged = true;

      const out = {
        ...r,
        cycleId,
        reviewerId,
        status,
        rmInitialGrade,
        finalGrade,
        approvalChain,
        approvalStepIndex,
        pendingApproverId,
        approvalLog,
        historyPerformance,
        outputDescription,
        prevCycleAvgHours: prevH,
        comments,
        devAdvice,
        createdAt,
        rmComment,
        communicationNotes,
        communicatedAt,
        appealDeadline,
        calibratedBy,
        calibratedAt,
      };
      delete out.scores;
      delete out.overallScore;

      if (rowChanged) changed = true;
      return out;
    });

    store.performanceReviews = nextList;
    return changed;
  };
})(window.TM);
