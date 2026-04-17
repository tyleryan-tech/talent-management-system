/**
 * 绩效评估工作流测试
 */
(function () {
  const { describe, assert } = window.TM._testRunner;

  describe('Performance Workflow', function (it, beforeEach) {
    let data;

    beforeEach(function () {
      data = window.TM.useDataStore();
    });

    it('should add a performance review', function () {
      const before = data.performanceReviews.length;
      data.addPerformanceReview({
        employeeId: 1001,
        cycleId: 1,
        reviewerId: 1005,
        status: 'rm_pending',
        proposedGrade: 'A',
      });
      assert.equal(data.performanceReviews.length, before + 1);
    });

    it('should update a performance review', function (assert, skip) {
      const review = data.performanceReviews.find((r) => r.employeeId === 1001 && r.status === 'rm_pending');
      if (!review) skip('no rm_pending review for employee 1001');
      data.updateReview(review.id, { proposedGrade: 'B+' });
      const updated = data.performanceReviews.find((r) => r.id === review.id);
      assert.equal(updated.proposedGrade, 'B+');
    });

    it('should add a performance cycle', function () {
      const before = data.performanceCycles.length;
      data.addCycle({
        name: 'Test Cycle 2026H1',
        type: 'half_year',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
      });
      assert.equal(data.performanceCycles.length, before + 1);
    });

    it('should track talent matrix data', function () {
      data.upsertTalentCell(1001, 'A', 'H');
      const cell = data.talentMatrix.find((t) => Number(t.employeeId) === 1001);
      assert.ok(cell, 'Talent matrix entry should exist');
      assert.equal(cell.performance, 'A');
      assert.equal(cell.potential, 'H');
    });
  });
})();
