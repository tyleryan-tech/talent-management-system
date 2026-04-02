/**
 * 绩效管理：等级档、审批链、周期展示、数据迁移规范化
 */
(function (TM) {
  TM.PERF_GRADE_OPTIONS = ['A+', 'A', 'A-', 'B+', 'B', 'C', 'C-'];
  TM.PERF_CYCLE_TYPE_LABEL = { half_year: 'Half-year review', year: 'Annual review' };

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
    let nextId = (() => {
      const cur = rmEmployeeId != null ? byId.get(Number(rmEmployeeId)) : null;
      return cur != null ? cur.managerId : null;
    })();
    const seen = new Set();
    while (nextId != null && !seen.has(Number(nextId))) {
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

  /** 展示用：已归档看最终等级，流程中看 RM 初评 */
  TM.effectivePerfGrade = function effectivePerfGrade(review) {
    if (!review) return '—';
    if (review.status === 'finalized' && review.finalGrade) return String(review.finalGrade).trim();
    if (review.rmInitialGrade) return String(review.rmInitialGrade).trim();
    return '—';
  };

  function isValidGrade(g) {
    return TM.PERF_GRADE_OPTIONS.includes(String(g || '').trim());
  }

  /**
   * 将旧版（自评/综合分/KPI）记录迁移为新结构；幂等。
   * @returns {boolean} 是否有字段被改写
   */
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
      }
      if (!['rm_pending', 'in_approval', 'finalized', 'rejected'].includes(status)) {
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

      if (finalGrade && !isValidGrade(finalGrade)) {
        finalGrade = 'B';
        rowChanged = true;
      }
      if (rmInitialGrade && !isValidGrade(rmInitialGrade)) {
        rmInitialGrade = 'B';
        rowChanged = true;
      }

      let approvalChain = Array.isArray(r.approvalChain)
        ? r.approvalChain.map(Number).filter((id) => !Number.isNaN(id))
        : [];
      let approvalStepIndex = r.approvalStepIndex != null ? Number(r.approvalStepIndex) : 0;
      let pendingApproverId = r.pendingApproverId != null ? Number(r.pendingApproverId) : null;
      const approvalLog = Array.isArray(r.approvalLog) ? [...r.approvalLog] : [];

      if (status === 'finalized') {
        if (!finalGrade && rmInitialGrade) {
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
        if (approvalStepIndex !== 0) {
          approvalStepIndex = 0;
          rowChanged = true;
        }
        if (pendingApproverId !== reviewerId) {
          pendingApproverId = reviewerId;
          rowChanged = true;
        }
      } else if (status === 'in_approval') {
        if (!approvalChain.length && reviewerId != null) {
          approvalChain = TM.buildApprovalChainAboveRm(store, reviewerId);
          rowChanged = true;
        }
        if (!approvalChain.length) {
          status = 'finalized';
          if (!finalGrade && rmInitialGrade) finalGrade = rmInitialGrade;
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

      if (raw.scores !== undefined) {
        delete r.scores;
        rowChanged = true;
      }
      if (raw.overallScore !== undefined) {
        delete r.overallScore;
        rowChanged = true;
      }

      const historyPerformance = String(r.historyPerformance ?? '').trim()
        || (String(r.comments || '').slice(0, 400));
      const outputDescription = String(r.outputDescription ?? '').trim();
      const prevH = r.prevCycleAvgHours != null && r.prevCycleAvgHours !== ''
        ? Math.round(Number(r.prevCycleAvgHours) * 10) / 10
        : null;
      const comments = String(r.comments ?? '').trim();
      const devAdvice = String(r.devAdvice ?? '').trim();
      const createdAt = r.createdAt || new Date().toISOString().slice(0, 10);

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
      };
      delete out.scores;
      delete out.overallScore;

      if (String(raw.historyPerformance ?? '').trim() !== historyPerformance) rowChanged = true;
      if (String(raw.outputDescription ?? '').trim() !== outputDescription) rowChanged = true;

      if (rowChanged) changed = true;
      return out;
    });

    store.performanceReviews = nextList;
    return changed;
  };
})(window.TM);
