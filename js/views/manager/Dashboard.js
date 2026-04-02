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
    </div>
  `,
  setup() {
    const auth = useAuthStore();
    const data = useDataStore();
    const me = computed(() => auth.currentUser?.employeeId);

    const subs = computed(() => data.employees.filter((e) => e.managerId === me.value));

    const stats = computed(() => [
      { k: 'team', label: 'Direct reports', value: subs.value.length },
      { k: 'train', label: 'Trainings in progress', value: data.employeeTrainings.filter((t) => subs.value.some((s) => s.id === t.employeeId) && t.status === 'in_progress').length },
    ]);

    return { stats };
  },
};
})();
