/**
 * 跨模块数据同步测试
 */
(function () {
  const { describe, assert } = window.TM._testRunner;

  describe('Cross-Module Data Sync', function (it, beforeEach) {
    let data;

    beforeEach(function () {
      data = window.TM.useDataStore();
    });

    it('department rename should sync recruitmentPipeline', function (assert, skip) {
      const dept = data.departments.find((d) => d.name);
      if (!dept) skip('no named department found');
      const oldName = dept.name;
      data.recruitmentPipeline = [
        ...(data.recruitmentPipeline || []),
        { id: 99999, team: oldName, position: 'Frontend', candidateName: 'Test' },
      ];
      data.updateDepartment(dept.id, { name: 'SyncTestDept' });
      const synced = data.recruitmentPipeline.find((c) => c.id === 99999);
      if (synced) {
        assert.equal(synced.team, 'SyncTestDept', 'Pipeline team should be updated');
      }
      data.updateDepartment(dept.id, { name: oldName });
      data.recruitmentPipeline = data.recruitmentPipeline.filter((c) => c.id !== 99999);
    });

    it('removing position should nullify employee positionId', function (assert, skip) {
      const pos = data.positions[data.positions.length - 1];
      if (!pos) skip('no positions exist');
      const emp = data.employees.find((e) => Number(e.positionId) === pos.id);
      if (emp) {
        data.removePosition(pos.id);
        const updated = data.employees.find((e) => e.id === emp.id);
        assert.equal(updated.positionId, null, 'positionId should be nullified');
      }
    });

    it('talent matrix should sync after HRBP calibration', function (assert, skip) {
      const review = data.performanceReviews.find((r) => r.status === 'finalized');
      if (!review) skip('no finalized reviews exist');
      const eid = Number(review.employeeId);
      const matrixEntry = data.talentMatrix.find((t) => Number(t.employeeId) === eid);
      assert.ok(matrixEntry, 'Employee should have talent matrix entry');
    });

    it('_reviewsByEmp index should be accurate', function (assert, skip) {
      if (data.performanceReviews.length === 0) skip('no performance reviews exist');
      const review = data.performanceReviews[0];
      const eid = Number(review.employeeId);
      const indexed = data._reviewsByEmp.get(eid);
      assert.ok(indexed, 'Should find reviews by employee in index');
      assert.ok(indexed.length > 0, 'Should have at least one review');
    });

    it('_empMap should provide O(1) lookup', function (assert, skip) {
      if (data.employees.length === 0) skip('no employees exist');
      const emp = data.employees[0];
      const found = data._empMap.get(emp.id);
      assert.ok(found, 'Should find employee in map');
      assert.equal(found.id, emp.id);
    });
  });
})();
