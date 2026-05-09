/**
 * AI Analyst regression tests.
 * Verifies native backend payloads and the legacy Streamlit fallback helpers.
 */
(function () {
  const { describe } = window.TM._testRunner;
  const TM = window.TM;

  describe('AI Analyst Embed & Wake URLs', function (it) {
    it('should append embed=true for iframe rendering', function (assert) {
      var url = TM.aiAnalystUtils.buildEmbedUrl('https://demo.streamlit.app/hr');
      assert.equal(url, 'https://demo.streamlit.app/hr?embed=true');
    });

    it('should preserve existing query params when building embed URL', function (assert) {
      var url = TM.aiAnalystUtils.buildEmbedUrl('https://demo.streamlit.app/hr?line=1');
      assert.equal(url, 'https://demo.streamlit.app/hr?line=1&embed=true');
    });

    it('should remove embed/cache params for manual wake URL', function (assert) {
      var url = TM.aiAnalystUtils.buildWakeUrl('https://demo.streamlit.app/hr?embed=true&_tm_reload=123&line=1');
      assert.equal(url, 'https://demo.streamlit.app/hr?line=1');
    });

    it('should append signed context params for authenticated iframe rendering', function (assert) {
      var url = TM.aiAnalystUtils.buildContextUrl('https://demo.streamlit.app/hr?embed=true', 'ctx.123', 2);
      assert.equal(url, 'https://demo.streamlit.app/hr?embed=true&tm_ctx=ctx.123&lineId=2');
    });

    it('should detect Streamlit Cloud hosts', function (assert) {
      assert.equal(TM.aiAnalystUtils.isStreamlitCloudUrl('https://demo.streamlit.app'), true);
      assert.equal(TM.aiAnalystUtils.isStreamlitCloudUrl('http://localhost:8501'), false);
    });

    it('should use local analyst service when local app points at Streamlit Cloud', function (assert) {
      var loc = { protocol: 'file:', hostname: '' };
      assert.equal(TM.aiAnalystUtils.shouldUseLocalAnalystUrl('https://demo.streamlit.app', loc), true);
    });

    it('should keep Streamlit Cloud URL for deployed app origins', function (assert) {
      var loc = { protocol: 'https:', hostname: 'talent.example.com' };
      assert.equal(TM.aiAnalystUtils.shouldUseLocalAnalystUrl('https://demo.streamlit.app', loc), false);
    });
  });

  describe('AI Analyst Native Backend Payload', function (it) {
    it('should build chat payload with line and department scope', function (assert) {
      var payload = TM.aiAnalystUtils.buildChatPayload(2, 10, '  分析绩效风险  ');
      assert.equal(payload.lineId, 2);
      assert.equal(payload.scopeRootDepartmentId, 10);
      assert.equal(payload.question, '分析绩效风险');
    });

    it('should omit empty department scope from chat payload', function (assert) {
      var payload = TM.aiAnalystUtils.buildChatPayload(1, null, '团队概况');
      assert.equal(payload.lineId, 1);
      assert.equal(Object.prototype.hasOwnProperty.call(payload, 'scopeRootDepartmentId'), false);
      assert.equal(payload.question, '团队概况');
    });

    it('should format known backend scope labels', function (assert) {
      assert.equal(TM.aiAnalystUtils.scopeText('manager_subtree'), '本人及下属');
      assert.equal(TM.aiAnalystUtils.scopeText('hrbp_dept_subtree'), '组织范围');
      assert.equal(TM.aiAnalystUtils.scopeText('local_browser'), '浏览器本地');
    });

    it('should build a local browser data profile for pure frontend mode', function (assert) {
      var profile = TM.aiAnalystUtils.buildLocalDataProfile({
        employees: [
          { id: 1, name: 'A', status: 'active', departmentId: 10 },
          { id: 2, name: 'B', status: 'leave', departmentId: 10 },
        ],
        departments: [{ id: 10, name: '研发部' }],
        positions: [{ id: 100, departmentId: 10, level: 'E' }],
        performanceReviews: [
          { id: 1, employeeId: 1, status: 'finalized', finalGrade: 'A' },
          { id: 2, employeeId: 2, status: 'rm_pending', finalGrade: '' },
        ],
        attendanceRecords: [{ id: 1, employeeId: 1, avgDailyHours: 9.5 }],
        recruitmentPipeline: [{ id: 'C1', team: '研发部', offering: 'accepted' }],
      }, { permissions: { scope: 'local_browser' } });
      assert.equal(profile.totals.employees, 2);
      assert.equal(profile.totals.activeEmployees, 1);
      assert.equal(profile.performance.latestFinalizedCount, 1);
      assert.equal(profile.performance.latestFinalGradeCounts.A, 1);
      assert.equal(profile.attendance.avgDailyHours, 9.5);
      assert.equal(profile.recruitment.offerCounts.accepted, 1);
    });

    it('should return local summary text without backend', function (assert) {
      var answer = TM.aiAnalystUtils.buildLocalAnswer('考勤工时是否异常', {
        totals: { employees: 2, activeEmployees: 2, departments: 1 },
        attendance: { recordCount: 1, avgDailyHours: 9.5 },
        performance: { latestFinalGradeCounts: {} },
        recruitment: { pipelineCount: 0, offerCounts: {} },
      });
      assert.ok(answer.indexOf('纯前端模式') >= 0);
      assert.ok(answer.indexOf('考勤发现') >= 0);
    });
  });

  describe('AI Analyst Permissions', function (it, beforeEach, afterEach) {
    var auth = TM.useAuthStore();
    var originalUser;

    beforeEach(function () {
      originalUser = auth.currentUser ? { ...auth.currentUser } : null;
    });

    afterEach(function () {
      auth.currentUser = originalUser;
    });

    it('should deny AI Analyst to a normal manager by default', function (assert) {
      auth.currentUser = {
        id: 9001,
        username: 'rm-no-ai',
        role: 'manager',
        rmStatus: 'active',
        managerPermissions: {
          modules: (TM.MGR_DEFAULT_MODULES || []).slice(),
          ops: {},
        },
      };
      assert.equal(auth.canAccessModule('ai_analyst'), false);
    });

    it('should allow AI Analyst after super admin grants manager module access', function (assert) {
      auth.currentUser = {
        id: 9002,
        username: 'rm-ai',
        role: 'manager',
        rmStatus: 'active',
        managerPermissions: {
          modules: (TM.MGR_DEFAULT_MODULES || []).concat(['ai_analyst']),
          ops: {},
        },
      };
      assert.equal(auth.canAccessModule('ai_analyst'), true);
    });

    it('should allow HRBP admin to access AI Analyst by default', function (assert) {
      auth.currentUser = {
        id: 9003,
        username: 'hrbp-ai',
        role: 'hrbp',
        hrbpSubType: 'admin',
      };
      assert.equal(auth.canAccessModule('ai_analyst'), true);
    });
  });
})();
