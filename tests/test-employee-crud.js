/**
 * 员工 CRUD 核心流程测试
 */
(function () {
  const { describe, assert } = window.TM._testRunner;

  describe('Employee CRUD', function (it, beforeEach) {
    let data;

    beforeEach(function () {
      data = window.TM.useDataStore();
    });

    it('should add an employee', function () {
      const before = data.employees.length;
      data.addEmployee({
        name: 'Test User',
        staffId: 'TEST001',
        email: 'test@test.com',
        departmentId: 1,
        status: 'active',
      });
      assert.equal(data.employees.length, before + 1);
      const added = data.employees[data.employees.length - 1];
      assert.equal(added.name, 'Test User');
      assert.equal(added.staffId, 'TEST001');
    });

    it('should update an employee', function () {
      const emp = data.employees.find((e) => e.staffId === 'TEST001');
      assert.ok(emp, 'Test employee should exist');
      data.updateEmployee(emp.id, { name: 'Updated User' });
      const updated = data.employees.find((e) => e.id === emp.id);
      assert.equal(updated.name, 'Updated User');
    });

    it('should remove employees by ids', function () {
      const emp = data.employees.find((e) => e.staffId === 'TEST001');
      assert.ok(emp, 'Test employee should exist');
      const before = data.employees.length;
      data.removeEmployeesByIds([emp.id]);
      assert.equal(data.employees.length, before - 1);
      assert.ok(!data.employees.find((e) => e.id === emp.id), 'Should be removed');
    });

    it('should batch add employees', function () {
      const before = data.employees.length;
      data.addEmployeesBatch([
        { name: 'Batch1', staffId: 'B001', departmentId: 1, status: 'active' },
        { name: 'Batch2', staffId: 'B002', departmentId: 1, status: 'active' },
      ]);
      assert.equal(data.employees.length, before + 2);
      data.removeEmployeesByIds(
        data.employees.filter((e) => ['B001', 'B002'].includes(e.staffId)).map((e) => e.id),
      );
    });
  });
})();
