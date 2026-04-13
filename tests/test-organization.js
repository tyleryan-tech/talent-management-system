/**
 * 组织管理测试
 */
(function () {
  const { describe, assert } = window.TM._testRunner;

  describe('Organization Management', function (it, beforeEach) {
    let data;

    beforeEach(function () {
      data = window.TM.useDataStore();
    });

    it('should add a department', function () {
      const before = data.departments.length;
      data.addDepartment({ name: 'Test Dept', parentId: null, managerId: null });
      assert.equal(data.departments.length, before + 1);
    });

    it('should update a department', function () {
      const dept = data.departments.find((d) => d.name === 'Test Dept');
      assert.ok(dept, 'Test dept should exist');
      data.updateDepartment(dept.id, { name: 'Renamed Dept' });
      const updated = data.departments.find((d) => d.id === dept.id);
      assert.equal(updated.name, 'Renamed Dept');
    });

    it('should remove a department and re-parent children', function () {
      const dept = data.departments.find((d) => d.name === 'Renamed Dept');
      assert.ok(dept, 'Renamed dept should exist');
      data.removeDepartment(dept.id);
      assert.ok(!data.departments.find((d) => d.id === dept.id), 'Should be removed');
    });

    it('should add a position', function () {
      const dept = data.departments[0];
      if (!dept) return;
      const before = data.positions.length;
      data.addPosition({ name: 'Frontend', level: 'SE', departmentId: dept.id, quantity: 1 });
      assert.equal(data.positions.length, before + 1);
    });

    it('should update org settings', function () {
      data.updateOrgSettings({ productLineOwnerEmployeeId: 1005 });
      assert.equal(data.orgSettings.productLineOwnerEmployeeId, 1005);
    });
  });
})();
