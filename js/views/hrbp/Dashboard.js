(function () {
  const { computed, onMounted, ref } = Vue;
  const useDataStore = window.TM.useDataStore;
  const loadEcharts = window.TM.loadEcharts;

  window.TM.HrbpDashboard = {
  name: 'HrbpDashboard',
  components: {
    HrbpAnalyticsPanel: window.TM.HrbpAnalytics,
  },
  template: `
    <div class="page-stack">
      <div class="stat-row">
        <div class="stat-card card" v-for="s in stats" :key="s.k">
          <div class="muted">{{ s.label }}</div>
          <div class="stat-num">{{ s.value }}</div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card pad">
          <h3 class="section-title">Headcount by department</h3>
          <div ref="chartDept" class="chart-box"></div>
        </div>
        <div class="card pad">
          <h3 class="section-title">Employee status</h3>
          <div ref="chartStatus" class="chart-box"></div>
        </div>
      </div>
      <div class="dash-analytics-wrap">
        <h2 class="section-title dash-merged-section-title">Workforce analytics</h2>
        <HrbpAnalyticsPanel />
      </div>
    </div>
  `,
  setup() {
    const data = useDataStore();
    const chartDept = ref(null);
    const chartStatus = ref(null);

    const stats = computed(() => {
      const emps = data.employees;
      const active = emps.filter((e) => e.status === 'active').length;
      return [
        { k: 'emp', label: 'Active employees', value: emps.filter((e) => e.status !== 'leave').length },
        { k: 'active', label: 'Regular active', value: active },
      ];
    });

    onMounted(async () => {
      const echarts = await loadEcharts();
      const byDept = {};
      data.departments.forEach((d) => { byDept[d.id] = 0; });
      data.employees.forEach((e) => {
        if (e.status !== 'leave') byDept[e.departmentId] = (byDept[e.departmentId] || 0) + 1;
      });
      const deptNames = data.departments.map((d) => d.name);
      const deptVals = data.departments.map((d) => byDept[d.id] || 0);

      if (chartDept.value) {
        const c = echarts.init(chartDept.value);
        c.setOption({
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: deptNames, axisLabel: { color: '#64748b' } },
          yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
          series: [{ type: 'bar', data: deptVals, itemStyle: { color: '#6366f1', borderRadius: [6, 6, 0, 0] } }],
        });
        window.addEventListener('resize', () => c.resize());
      }

      const st = { active: 0, probation: 0, leave: 0 };
      data.employees.forEach((e) => { st[e.status] = (st[e.status] || 0) + 1; });
      if (chartStatus.value) {
        const c2 = echarts.init(chartStatus.value);
        c2.setOption({
          tooltip: { trigger: 'item' },
          series: [{
            type: 'pie',
            radius: ['42%', '68%'],
            data: [
              { name: 'Active', value: st.active || 0 },
              { name: 'Probation', value: st.probation || 0 },
              { name: 'Terminated', value: st.leave || 0 },
            ],
          }],
        });
        window.addEventListener('resize', () => c2.resize());
      }
    });

    return { stats, chartDept, chartStatus };
  },
};
})();
