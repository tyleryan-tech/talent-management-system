(function () {
  const { computed } = Vue;
  const useAuthStore = window.TM.useAuthStore;
  const useDataStore = window.TM.useDataStore;

  window.TM.MgrDashboard = {
  name: 'MgrDashboard',
  template: `
    <div class="page-stack">
      <div class="stat-row">
        <div class="stat-card card" v-for="s in stats" :key="s.k">
          <div class="muted">{{ s.label }}</div>
          <div class="stat-num">{{ s.value }}</div>
        </div>
      </div>

      <div class="card" v-if="pendingTasks.length" style="margin-top:1rem">
        <h3 style="margin:0 0 0.75rem">待办事项</h3>
        <ul style="list-style:none;padding:0;margin:0">
          <li v-for="t in pendingTasks" :key="t.k" style="padding:0.4rem 0;border-bottom:1px solid var(--border,#e5e5e5);display:flex;align-items:center;gap:0.5rem">
            <i :class="t.icon" style="width:1.25rem;text-align:center;color:var(--accent,#2563eb)"></i>
            <span>{{ t.label }}</span>
            <span class="badge" style="margin-left:auto">{{ t.count }}</span>
          </li>
        </ul>
      </div>

      <div class="card" style="margin-top:1rem" v-if="recentTeam.length">
        <h3 style="margin:0 0 0.75rem">团队成员</h3>
        <table class="data-table">
          <thead><tr><th>姓名</th><th>岗位</th><th>部门</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="e in recentTeam" :key="e.id">
              <td>{{ e.name }}</td>
              <td>{{ positionName(e.positionId) }}</td>
              <td>{{ deptName(e.departmentId) }}</td>
              <td><span :class="['tag', 'tag-' + (e.status||'active')]">{{ statusLabel(e.status) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  setup() {
    const auth = useAuthStore();
    const data = useDataStore();
    const me = computed(() => auth.currentUser?.employeeId);

    const subs = computed(() => data.employees.filter((e) => e.managerId === me.value && e.status !== 'leave'));

    const subIds = computed(() => new Set(subs.value.map((e) => e.id)));

    const pendingEvalCount = computed(() =>
      data.performanceReviews.filter((r) => r.status === 'rm_pending' && subIds.value.has(r.employeeId)).length
    );
    const pendingApprovalCount = computed(() =>
      data.performanceReviews.filter((r) =>
        (r.status === 'rm_evaluated' || r.status === 'pending_approval') &&
        r.approvalChain && r.approvalChain.some((s) => s.managerId === me.value && s.status === 'pending')
      ).length
    );
    const trainingCount = computed(() =>
      data.employeeTrainings.filter((t) => subIds.value.has(t.employeeId) && t.status === 'in_progress').length
    );

    const stats = computed(() => [
      { k: 'team', label: '直属下属', value: subs.value.length },
      { k: 'eval', label: '待评估', value: pendingEvalCount.value },
      { k: 'approval', label: '待审批', value: pendingApprovalCount.value },
      { k: 'train', label: '培训中', value: trainingCount.value },
    ]);

    const pendingTasks = computed(() => {
      const tasks = [];
      if (pendingEvalCount.value > 0) tasks.push({ k: 'eval', icon: 'fa-solid fa-pen-to-square', label: '绩效评估待完成', count: pendingEvalCount.value });
      if (pendingApprovalCount.value > 0) tasks.push({ k: 'appr', icon: 'fa-solid fa-clipboard-check', label: '绩效审批待处理', count: pendingApprovalCount.value });
      if (trainingCount.value > 0) tasks.push({ k: 'train', icon: 'fa-solid fa-graduation-cap', label: '进行中的培训', count: trainingCount.value });
      return tasks;
    });

    const recentTeam = computed(() => subs.value.slice(0, 20));

    const _deptMap = computed(() => new Map(data.departments.map((d) => [d.id, d.name])));
    const _posMap = computed(() => new Map(data.positions.map((p) => [p.id, p.name + (p.level ? ' ' + p.level : '')])));

    function deptName(id) { return _deptMap.value.get(id) || '—'; }
    function positionName(id) { return _posMap.value.get(id) || '—'; }
    function statusLabel(s) {
      const map = { active: '在职', probation: '试用期', leave: '离职', suspended: '停职' };
      return map[s] || s || '在职';
    }

    return { stats, pendingTasks, recentTeam, deptName, positionName, statusLabel };
  },
};
})();
