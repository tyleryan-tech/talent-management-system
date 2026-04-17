/**
 * 绩效整批驳回逻辑测试
 * 覆盖：siblings 全部回退、状态正确、权限校验、审批链回退
 */
(function () {
  const { describe, assert } = window.TM._testRunner;

  function setupTeamReviews(data) {
    var emps = data.employees.filter(function (e) { return e.status !== 'leave'; });
    if (emps.length < 4) return null;

    var rm = emps.find(function (e) { return data.employees.some(function (x) { return x.managerId === e.id; }); });
    if (!rm) rm = emps[0];
    var directs = emps.filter(function (e) { return e.managerId === rm.id; }).slice(0, 3);
    if (directs.length < 2) return null;

    var approver = rm.managerId ? data.employees.find(function (e) { return e.id === rm.managerId; }) : null;
    var approverId = approver ? approver.id : rm.id + 9000;

    var cycleId = data.addCycle({
      name: '_test_team_reject_cycle',
      cycleType: 'half_year',
      startDate: '2098-01-01',
      endDate: '2098-06-30',
      status: 'open',
    });

    var reviews = data.performanceReviews.filter(function (r) { return r.cycleId === cycleId; });
    var targetReviews = reviews.filter(function (r) {
      return directs.some(function (d) { return d.id === r.employeeId; });
    });

    targetReviews.forEach(function (r) {
      var i = data.performanceReviews.indexOf(r);
      if (i >= 0) {
        data.performanceReviews[i] = Object.assign({}, r, {
          status: 'in_approval',
          reviewerId: rm.id,
          approvalChain: [approverId],
          approvalStepIndex: 0,
          pendingApproverId: approverId,
        });
      }
    });

    return { cycleId: cycleId, rmId: rm.id, approverId: approverId, directs: directs, reviewCount: targetReviews.length };
  }

  function cleanup(data, cycleId) {
    data.performanceReviews = data.performanceReviews.filter(function (r) { return r.cycleId !== cycleId; });
    data.performanceCycles = data.performanceCycles.filter(function (c) { return c.id !== cycleId; });
  }

  describe('Team Reject (Batch)', function (it, beforeEach) {
    let data;

    beforeEach(function () {
      data = window.TM.useDataStore();
    });

    /* ─── 整批驳回应回退所有 siblings ─── */
    it('rejectTeamPerformanceReviews should reject ALL siblings of same RM+cycle', function (assert, skip) {
      var setup = setupTeamReviews(data);
      if (!setup) skip('insufficient data to build team reviews (need >=4 employees with mgr hierarchy)');

      var inApproval = data.performanceReviews.filter(function (r) {
        return r.cycleId === setup.cycleId && Number(r.reviewerId) === setup.rmId && r.status === 'in_approval';
      });
      assert.ok(inApproval.length >= 2, 'Precondition: need >=2 in_approval reviews, got ' + inApproval.length);

      var anchor = inApproval[0];
      var result = data.rejectTeamPerformanceReviews(anchor.id, setup.approverId, 'test reject');

      assert.ok(result.ok, 'Reject should succeed');
      assert.equal(result.count, inApproval.length,
        'Should reject all ' + inApproval.length + ' siblings, got ' + result.count);

      var remaining = data.performanceReviews.filter(function (r) {
        return r.cycleId === setup.cycleId && Number(r.reviewerId) === setup.rmId && r.status === 'in_approval';
      });
      assert.equal(remaining.length, 0, 'No siblings should remain in_approval after team reject');

      cleanup(data, setup.cycleId);
    });

    /* ─── 驳回后状态应为 rm_pending（第一级审批链） ─── */
    it('rejected reviews should revert to rm_pending when at first approval step', function (assert, skip) {
      var setup = setupTeamReviews(data);
      if (!setup) skip('insufficient team data for reject test');

      var anchor = data.performanceReviews.find(function (r) {
        return r.cycleId === setup.cycleId && Number(r.reviewerId) === setup.rmId && r.status === 'in_approval';
      });
      data.rejectTeamPerformanceReviews(anchor.id, setup.approverId, 'test');

      var reverted = data.performanceReviews.filter(function (r) {
        return r.cycleId === setup.cycleId && Number(r.reviewerId) === setup.rmId;
      });
      reverted.forEach(function (r) {
        if (setup.directs.some(function (d) { return d.id === r.employeeId; })) {
          assert.equal(r.status, 'rm_pending',
            'Review for emp ' + r.employeeId + ' should be rm_pending, got ' + r.status);
        }
      });

      cleanup(data, setup.cycleId);
    });

    /* ─── 驳回后 approvalLog 应有 reject 记录 ─── */
    it('rejected reviews should have reject entry in approvalLog', function (assert, skip) {
      var setup = setupTeamReviews(data);
      if (!setup) skip('insufficient team data for approval log test');

      var anchor = data.performanceReviews.find(function (r) {
        return r.cycleId === setup.cycleId && Number(r.reviewerId) === setup.rmId && r.status === 'in_approval';
      });
      data.rejectTeamPerformanceReviews(anchor.id, setup.approverId, 'logged');

      var review = data.performanceReviews.find(function (r) {
        return r.cycleId === setup.cycleId && setup.directs[0] && r.employeeId === setup.directs[0].id;
      });
      if (review) {
        var lastLog = (review.approvalLog || []).slice(-1)[0];
        assert.ok(lastLog, 'Should have approvalLog entry');
        assert.equal(lastLog.action, 'reject', 'Last log action should be reject');
        assert.ok(String(lastLog.note || '').includes('整批驳回'), 'Note should mention batch reject');
      }

      cleanup(data, setup.cycleId);
    });

    /* ─── 非链上人员不能驳回 ─── */
    it('non-chain actor should NOT be able to reject', function (assert, skip) {
      var setup = setupTeamReviews(data);
      if (!setup) skip('insufficient team data for permission test');

      var anchor = data.performanceReviews.find(function (r) {
        return r.cycleId === setup.cycleId && Number(r.reviewerId) === setup.rmId && r.status === 'in_approval';
      });
      var fakeActorId = 999999;
      var result = data.rejectTeamPerformanceReviews(anchor.id, fakeActorId, 'should fail');

      assert.ok(!result.ok, 'Reject by non-chain actor should fail');
      assert.equal(result.count, 0, 'Count should be 0 for unauthorized reject');

      cleanup(data, setup.cycleId);
    });

    /* ─── 对非 in_approval 状态的 review 驳回应失败 ─── */
    it('reject should fail for non in_approval review', function (assert, skip) {
      var rmPending = data.performanceReviews.find(function (r) { return r.status === 'rm_pending'; });
      if (!rmPending) skip('no rm_pending review exists to test against');
      var result = data.rejectTeamPerformanceReviews(rmPending.id, 1001, '');
      assert.ok(!result.ok, 'Reject of rm_pending review should return ok:false');
    });
  });
})();
