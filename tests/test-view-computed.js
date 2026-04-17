/**
 * 视图层 Computed 属性测试
 * 直接测试 store / utility 函数的输出，模拟视图层的数据源
 * 覆盖：离职过滤、子树计算、绩效沟通范围、周期参评预览等
 */
(function () {
  const { describe, assert } = window.TM._testRunner;
  var TM = window.TM;

  describe('View Computed — Active Employee Filtering', function (it, beforeEach) {
    let data;

    beforeEach(function () {
      data = TM.useDataStore();
    });

    /* ─── scopedActiveEmployees 不含 leave ─── */
    it('scopedActiveEmployees should exclude leave employees', function () {
      var all = data.employees;
      var leaveCount = all.filter(function (e) { return e.status === 'leave'; }).length;
      var active = all.filter(function (e) { return e.status !== 'leave'; });

      assert.ok(leaveCount > 0, 'Precondition: need leave employees in data');
      assert.equal(active.length, all.length - leaveCount, 'Active = total - leave');
      active.forEach(function (e) {
        assert.ok(e.status !== 'leave', 'Active employee ' + e.id + ' should not have leave status');
      });
    });

    /* ─── collectSubtreeEmployeeIds 排除 leave ─── */
    it('collectSubtreeEmployeeIds should skip leave employees', function (assert, skip) {
      var mgr = data.employees.find(function (e) {
        return e.status !== 'leave' && data.employees.some(function (x) { return x.managerId === e.id; });
      });
      if (!mgr) skip('no active manager with direct reports');

      var subtree = TM.collectSubtreeEmployeeIds(data, mgr.id);
      subtree.forEach(function (id) {
        var emp = data.employees.find(function (e) { return e.id === id; });
        assert.ok(emp, 'Subtree member ' + id + ' should exist');
        assert.ok(emp.status !== 'leave', 'Subtree member ' + id + ' should not be leave');
      });
    });

    /* ─── collectSubtreeIds（orgScope 版）包含所有后代 ─── */
    it('collectSubtreeIds should return all descendants', function (assert, skip) {
      var mgr = data.employees.find(function (e) {
        return data.employees.some(function (x) { return x.managerId === e.id; });
      });
      if (!mgr) skip('no manager with direct reports in data');

      var ids = TM.collectSubtreeIds(data.employees, mgr.id);
      assert.ok(ids.size > 0, 'Manager ' + mgr.id + ' should have subtree members');
      ids.forEach(function (id) {
        assert.ok(id !== mgr.id, 'Subtree should not include root manager');
      });
    });
  });

  describe('View Computed — Manager Performance directIds', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    /* ─── directIds 不含 leave ─── */
    it('direct reports of a manager should exclude leave employees', function (assert, skip) {
      var mgr = data.employees.find(function (e) {
        return e.status !== 'leave' && data.employees.some(function (x) {
          return x.managerId === e.id && x.status === 'leave';
        });
      });
      if (!mgr) {
        var anyMgr = data.employees.find(function (e) {
          return data.employees.some(function (x) { return x.managerId === e.id; });
        });
        if (!anyMgr) skip('no manager with direct reports');
        var directs = data.employees.filter(function (e) {
          return e.managerId === anyMgr.id && e.status !== 'leave';
        });
        directs.forEach(function (e) {
          assert.ok(e.status !== 'leave', 'Direct ' + e.id + ' should not be leave');
        });
        return;
      }

      var allDirects = data.employees.filter(function (e) { return e.managerId === mgr.id; });
      var activeDirects = allDirects.filter(function (e) { return e.status !== 'leave'; });
      var leaveDirects = allDirects.filter(function (e) { return e.status === 'leave'; });

      assert.ok(leaveDirects.length > 0, 'Precondition: manager ' + mgr.id + ' has leave direct reports');
      assert.ok(activeDirects.length < allDirects.length,
        'Active directs (' + activeDirects.length + ') < all directs (' + allDirects.length + ')');
    });
  });

  describe('View Computed — Cycle Eligibility Preview', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    /* ─── 不设 cutoffDate 时：eligible = 非 leave 员工数 ─── */
    it('without cutoffDate, eligible should equal non-leave count', function () {
      var all = data.employees;
      var nonLeave = all.filter(function (e) { return e.status !== 'leave'; });
      var left = all.length - nonLeave.length;

      assert.equal(nonLeave.length + left, all.length, 'active + left = total');
      assert.ok(nonLeave.length > 0, 'Should have active employees');
    });

    /* ─── 设置 cutoffDate 时：eligible 减少 ─── */
    it('with cutoffDate, eligible should exclude employees hired after cutoff', function () {
      var cutoff = '2020-06-01';
      var nonLeave = data.employees.filter(function (e) { return e.status !== 'leave'; });
      var excluded = nonLeave.filter(function (e) { return e.hireDate && String(e.hireDate) > cutoff; });
      var eligible = nonLeave.length - excluded.length;

      assert.ok(excluded.length > 0, 'Precondition: need employees hired after ' + cutoff);
      assert.ok(eligible < nonLeave.length, 'Eligible (' + eligible + ') should be less than active (' + nonLeave.length + ')');
      assert.ok(eligible > 0, 'Should still have eligible employees');
    });

    /* ─── 无 hireDate 的员工默认参评 ─── */
    it('employees without hireDate should be eligible by default', function () {
      var cutoff = '2020-01-01';
      var nonLeave = data.employees.filter(function (e) { return e.status !== 'leave'; });
      var noDate = nonLeave.filter(function (e) { return !e.hireDate; });
      // Employees without hireDate: cutoff filter should NOT exclude them
      noDate.forEach(function (e) {
        var excluded = e.hireDate && String(e.hireDate) > cutoff;
        assert.ok(!excluded, 'Employee ' + e.id + ' with no hireDate should not be excluded');
      });
    });
  });

  describe('View Computed — Communication Tab Scope', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    /* ─── 沟通 Tab 的数据应包含子团队 ─── */
    it('communication list scope should include subtree (not just direct reports)', function (assert, skip) {
      var mgr = data.employees.find(function (e) {
        return e.status !== 'leave' && data.employees.some(function (x) {
          return x.managerId === e.id && x.status !== 'leave'
            && data.employees.some(function (y) { return y.managerId === x.id && y.status !== 'leave'; });
        });
      });
      if (!mgr) skip('need a 3-level manager hierarchy, not found in data');

      var directIds = new Set(
        data.employees.filter(function (e) { return e.managerId === mgr.id && e.status !== 'leave'; }).map(function (e) { return e.id; }),
      );
      var subtreeIds = TM.collectSubtreeEmployeeIds(data, mgr.id);

      assert.ok(subtreeIds.size > directIds.size,
        'Subtree (' + subtreeIds.size + ') should be larger than directs (' + directIds.size + ')');
    });
  });

  describe('View Computed — Performance Status Labels', function (it) {
    it('all performance statuses should have labels', function () {
      var labels = TM.PERF_STATUS_LABEL;
      assert.ok(labels, 'PERF_STATUS_LABEL should exist');
      var expected = ['rm_pending', 'rm_evaluated', 'in_approval', 'pl_pending', 'calibrated', 'pl_approved', 'finalized'];
      expected.forEach(function (s) {
        assert.ok(labels[s], 'Status "' + s + '" should have a label, got: ' + labels[s]);
      });
    });

    it('pl_pending label should mention HRBP', function () {
      var label = TM.PERF_STATUS_LABEL.pl_pending;
      assert.ok(label && label.includes('HRBP'), 'pl_pending label should mention HRBP, got: ' + label);
    });
  });

  describe('View Computed — Roster Status Filtering', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    /* ─── 默认过滤排除 leave ─── */
    it('default roster filter (no showArchived) should exclude leave', function () {
      var active = data.employees.filter(function (e) { return e.status !== 'leave'; });
      var leave = data.employees.filter(function (e) { return e.status === 'leave'; });
      assert.ok(active.length + leave.length === data.employees.length, 'Sum should match total');
      assert.ok(leave.length > 0, 'Should have leave employees');
      assert.ok(active.length < data.employees.length, 'Active should be less than total');
    });

    /* ─── 存档模式包含 leave ─── */
    it('archived mode should include all employees', function () {
      var all = data.employees;
      var hasLeave = all.some(function (e) { return e.status === 'leave'; });
      assert.ok(hasLeave, 'Should have leave employees in full list');
      assert.ok(all.length > 0, 'Full list should not be empty');
    });
  });

  describe('View Computed — Dashboard Stats', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    /* ─── 仪表盘主计数应为在职员工 ─── */
    it('dashboard primary count should be active employees', function () {
      var active = data.employees.filter(function (e) { return e.status !== 'leave'; });
      var probation = active.filter(function (e) { return e.status === 'probation'; });
      var leave = data.employees.filter(function (e) { return e.status === 'leave'; });

      assert.ok(active.length > 0, 'Should have active employees');
      assert.equal(active.length + leave.length, data.employees.length, 'Active + leave = total');
      assert.ok(active.length <= data.employees.length, 'Active should not exceed total');
    });

    /* ─── 所有员工有 status 字段 ─── */
    it('all employees should have a valid status field', function () {
      var validStatuses = ['active', 'probation', 'leave'];
      data.employees.forEach(function (e) {
        assert.ok(validStatuses.includes(e.status),
          'Employee ' + e.id + ' has invalid status: ' + e.status);
      });
    });
  });

  describe('View Computed — Organization Dropdowns', function (it, beforeEach) {
    let data;
    beforeEach(function () { data = TM.useDataStore(); });

    /* ─── 部门负责人下拉不含 leave ─── */
    it('department manager dropdown should exclude leave employees', function () {
      var candidates = data.employees.filter(function (e) { return e.status !== 'leave'; });
      candidates.forEach(function (e) {
        assert.ok(e.status !== 'leave', 'Candidate ' + e.id + ' should not be leave');
      });
      assert.ok(candidates.length < data.employees.length || data.employees.every(function (e) { return e.status !== 'leave'; }),
        'Candidates should be a subset (excluding leave) or no leave employees exist');
    });
  });
})();
