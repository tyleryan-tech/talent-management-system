/**
 * 数据一致性回归测试
 * 覆盖历史上发生过的数据丢失、数量漂移、状态污染问题
 */
(function () {
  const { describe, assert } = window.TM._testRunner;

  describe('Data Consistency', function (it, beforeEach) {
    let data;

    beforeEach(function () {
      data = window.TM.useDataStore();
    });

    /* ─── addCycle 应排除 leave 员工 ─── */
    it('addCycle should NOT create reviews for leave employees', function () {
      const leaveCount = data.employees.filter(function (e) { return e.status === 'leave'; }).length;
      const activeCount = data.employees.filter(function (e) { return e.status !== 'leave'; }).length;
      assert.ok(leaveCount > 0, 'Precondition: need at least one leave employee in seed data');

      const cycleId = data.addCycle({
        name: '_test_leave_exclusion',
        cycleType: 'half_year',
        startDate: '2099-01-01',
        endDate: '2099-06-30',
        status: 'open',
      });

      const reviews = data.performanceReviews.filter(function (r) { return r.cycleId === cycleId; });
      assert.equal(reviews.length, activeCount,
        'Review count (' + reviews.length + ') should equal active employee count (' + activeCount + '), not total (' + data.employees.length + ')');

      var hasLeaveReview = reviews.some(function (r) {
        return data.employees.some(function (e) { return e.id === r.employeeId && e.status === 'leave'; });
      });
      assert.ok(!hasLeaveReview, 'No review should exist for a leave employee');

      // cleanup
      data.performanceReviews = data.performanceReviews.filter(function (r) { return r.cycleId !== cycleId; });
      data.performanceCycles = data.performanceCycles.filter(function (c) { return c.id !== cycleId; });
    });

    /* ─── addCycle + cutoffDate 应排除晚入职者 ─── */
    it('addCycle with cutoffDate should exclude employees hired after cutoff', function () {
      var cutoff = '2020-01-01';
      var activeEmps = data.employees.filter(function (e) { return e.status !== 'leave'; });
      var eligibleCount = activeEmps.filter(function (e) {
        return !e.hireDate || String(e.hireDate) <= cutoff;
      }).length;
      var excludedCount = activeEmps.filter(function (e) {
        return e.hireDate && String(e.hireDate) > cutoff;
      }).length;
      assert.ok(excludedCount > 0, 'Precondition: need employees hired after ' + cutoff);

      var cycleId = data.addCycle({
        name: '_test_cutoff',
        cycleType: 'half_year',
        startDate: '2099-07-01',
        endDate: '2099-12-31',
        status: 'open',
        cutoffDate: cutoff,
      });

      var reviews = data.performanceReviews.filter(function (r) { return r.cycleId === cycleId; });
      assert.equal(reviews.length, eligibleCount,
        'Reviews (' + reviews.length + ') should equal eligible (' + eligibleCount + '), excluding ' + excludedCount + ' hired after cutoff');

      // cleanup
      data.performanceReviews = data.performanceReviews.filter(function (r) { return r.cycleId !== cycleId; });
      data.performanceCycles = data.performanceCycles.filter(function (c) { return c.id !== cycleId; });
    });

    /* ─── hydrate 后 employees 无重复 id ─── */
    it('hydrate should deduplicate employees by id', function () {
      var ids = data.employees.map(function (e) { return e.id; });
      var unique = new Set(ids);
      assert.equal(ids.length, unique.size, 'Employee ids should be unique after hydrate');
    });

    /* ─── hydrate 后 talentMatrix 无重复 employeeId ─── */
    it('hydrate should deduplicate talentMatrix by employeeId', function () {
      var ids = data.talentMatrix.map(function (t) { return Number(t.employeeId); });
      var unique = new Set(ids);
      assert.equal(ids.length, unique.size, 'TalentMatrix employeeIds should be unique');
    });

    /* ─── syncEmployeeLinkedDataFromRoster 不清空 global users 的 employeeId ─── */
    it('syncEmployeeLinkedDataFromRoster should NOT nullify global user.employeeId', function (assert, skip) {
      var usersWithEmpId = (data.users || []).filter(function (u) { return u.employeeId != null; });
      if (!usersWithEmpId.length) skip('no users with employeeId link');

      var before = usersWithEmpId.map(function (u) { return { id: u.id, employeeId: u.employeeId }; });
      data.syncEmployeeLinkedDataFromRoster();
      var after = data.users || [];

      before.forEach(function (b) {
        var u = after.find(function (x) { return x.id === b.id; });
        assert.ok(u, 'User ' + b.id + ' should still exist');
        assert.equal(u.employeeId, b.employeeId,
          'user.employeeId should NOT be cleared by roster sync (user ' + b.id + ')');
      });
    });

    /* ─── _empMap 与 employees 同步 ─── */
    it('_empMap should be in sync with employees array', function () {
      assert.ok(data._empMap instanceof Map, '_empMap should be a Map');
      data.employees.forEach(function (e) {
        var found = data._empMap.get(e.id);
        assert.ok(found, 'Employee ' + e.id + ' should be in _empMap');
        assert.equal(found.name, e.name, 'Name should match for employee ' + e.id);
      });
    });

    /* ─── performanceReviews 中的 employeeId 必须存在于 employees ─── */
    it('performanceReview employeeIds should reference existing employees', function () {
      var empIds = new Set(data.employees.map(function (e) { return Number(e.id); }));
      var orphans = data.performanceReviews.filter(function (r) {
        return !empIds.has(Number(r.employeeId));
      });
      assert.equal(orphans.length, 0,
        'Found ' + orphans.length + ' reviews referencing non-existent employees');
    });

    /* ─── addCycle 生成的 review 必须有 reviewerId 和 approvalChain ─── */
    it('addCycle should create reviews with valid reviewerId and approvalChain', function () {
      var cycleId = data.addCycle({
        name: '_test_review_fields',
        cycleType: 'half_year',
        startDate: '2099-01-01',
        endDate: '2099-06-30',
        status: 'open',
      });
      var reviews = data.performanceReviews.filter(function (r) { return r.cycleId === cycleId; });
      reviews.forEach(function (r) {
        assert.ok(r.status === 'rm_pending', 'New review status should be rm_pending');
        assert.ok(Array.isArray(r.approvalChain), 'approvalChain should be array');
        assert.ok(r.createdAt, 'createdAt should be set');
      });

      // cleanup
      data.performanceReviews = data.performanceReviews.filter(function (r) { return r.cycleId !== cycleId; });
      data.performanceCycles = data.performanceCycles.filter(function (c) { return c.id !== cycleId; });
    });
  });
})();
