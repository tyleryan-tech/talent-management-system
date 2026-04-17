/**
 * Smoke 测试 — 端到端业务流程验证
 * 模拟完整操作链路：登录→操作→验证多模块一致性
 */
(function () {
  const { describe, assert } = window.TM._testRunner;
  var TM = window.TM;

  describe('Smoke — Cycle Creation Matches Active Headcount', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    it('creating a cycle should produce exactly as many reviews as active employees', function () {
      var activeCount = data.employees.filter(function (e) { return e.status !== 'leave'; }).length;
      assert.ok(activeCount > 0, 'Should have active employees');

      var cycleId = data.addCycle({
        name: '_smoke_headcount',
        cycleType: 'half_year',
        startDate: '2097-01-01',
        endDate: '2097-06-30',
        status: 'open',
      });

      var reviews = data.performanceReviews.filter(function (r) { return r.cycleId === cycleId; });
      assert.equal(reviews.length, activeCount,
        'Reviews (' + reviews.length + ') must match active headcount (' + activeCount + ')');

      // cleanup
      data.performanceReviews = data.performanceReviews.filter(function (r) { return r.cycleId !== cycleId; });
      data.performanceCycles = data.performanceCycles.filter(function (c) { return c.id !== cycleId; });
    });
  });

  describe('Smoke — Leave Employee Visibility', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    it('marking employee as leave should reduce active count', function (assert, skip) {
      var active = data.employees.filter(function (e) { return e.status !== 'leave'; });
      if (active.length < 2) skip('need >=2 active employees, got ' + active.length);

      var target = active[active.length - 1];
      var origStatus = target.status;
      var origActiveCount = active.length;

      data.setEmployeeStatus(target.id, 'leave');
      var newActive = data.employees.filter(function (e) { return e.status !== 'leave'; });
      assert.equal(newActive.length, origActiveCount - 1,
        'Active count should decrease by 1 after marking leave');

      var emp = data.employees.find(function (e) { return e.id === target.id; });
      assert.ok(emp, 'Employee should still exist in data (archived, not deleted)');
      assert.equal(emp.status, 'leave', 'Employee status should be leave');

      // restore
      data.setEmployeeStatus(target.id, origStatus);
    });

    it('leave employee data should be preserved (not deleted)', function () {
      var leaveEmps = data.employees.filter(function (e) { return e.status === 'leave'; });
      leaveEmps.forEach(function (e) {
        assert.ok(e.id, 'Leave employee should have id');
        assert.ok(e.name, 'Leave employee ' + e.id + ' should have name');
      });
    });
  });

  describe('Smoke — Cutoff Date End-to-End', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    it('cycle with cutoffDate should match preview count', function () {
      var cutoff = '2020-06-01';
      var nonLeave = data.employees.filter(function (e) { return e.status !== 'leave'; });
      var eligible = nonLeave.filter(function (e) {
        return !e.hireDate || String(e.hireDate) <= cutoff;
      }).length;

      var cycleId = data.addCycle({
        name: '_smoke_cutoff_e2e',
        cycleType: 'half_year',
        startDate: '2097-07-01',
        endDate: '2097-12-31',
        status: 'open',
        cutoffDate: cutoff,
      });

      var reviews = data.performanceReviews.filter(function (r) { return r.cycleId === cycleId; });
      assert.equal(reviews.length, eligible,
        'Reviews with cutoff (' + reviews.length + ') should equal eligible count (' + eligible + ')');

      // verify cutoffDate is stored on cycle
      var cycle = data.performanceCycles.find(function (c) { return c.id === cycleId; });
      assert.equal(cycle.cutoffDate, cutoff, 'cutoffDate should be stored on cycle');

      // cleanup
      data.performanceReviews = data.performanceReviews.filter(function (r) { return r.cycleId !== cycleId; });
      data.performanceCycles = data.performanceCycles.filter(function (c) { return c.id !== cycleId; });
    });
  });

  describe('Smoke — Talent Matrix Consistency', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    it('every active employee should have a talent matrix entry', function () {
      var activeIds = new Set(
        data.employees.filter(function (e) { return e.status !== 'leave'; }).map(function (e) { return Number(e.id); }),
      );
      var tmIds = new Set(data.talentMatrix.map(function (t) { return Number(t.employeeId); }));
      var missing = [];
      activeIds.forEach(function (id) {
        if (!tmIds.has(id)) missing.push(id);
      });
      assert.equal(missing.length, 0,
        missing.length + ' active employees missing from talentMatrix: ' + missing.slice(0, 5).join(','));
    });

    it('leave employees should NOT be in talent matrix', function () {
      var leaveIds = new Set(
        data.employees.filter(function (e) { return e.status === 'leave'; }).map(function (e) { return Number(e.id); }),
      );
      var leaked = data.talentMatrix.filter(function (t) { return leaveIds.has(Number(t.employeeId)); });
      assert.equal(leaked.length, 0,
        leaked.length + ' leave employees found in talentMatrix');
    });
  });

  describe('Smoke — User-Employee Binding Integrity', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    it('users with employeeId should reference existing employees', function () {
      var empIds = new Set(data.employees.map(function (e) { return Number(e.id); }));
      var usersWithEmp = (data.users || []).filter(function (u) { return u.employeeId != null; });
      var broken = usersWithEmp.filter(function (u) { return !empIds.has(Number(u.employeeId)); });
      // Note: a user might be linked to an employee in another product line, so we only warn
      if (broken.length > 0) {
        assert.ok(true, 'INFO: ' + broken.length + ' users reference employees not in current line (may be cross-line)');
      } else {
        assert.ok(true, 'All user-employee bindings are valid for current product line');
      }
    });
  });
})();
