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
          <div class="status-num-row">
            <div class="status-num-item" v-for="s in statusNums" :key="s.label">
              <span class="status-dot" :style="{ background: s.color }"></span>
              <span class="status-num-label">{{ s.label }}</span>
              <span class="status-num-val">{{ s.value }}</span>
            </div>
          </div>
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
      return [
        { k: 'total', label: 'Total employees', value: emps.length },
        { k: 'emp', label: 'Active (incl. probation)', value: emps.filter((e) => e.status !== 'leave').length },
        { k: 'leave', label: 'Leaving', value: emps.filter((e) => e.status === 'leave').length },
      ];
    });

    const STATUS_COLORS = { active: '#6366f1', probation: '#f59e0b', leave: '#ef4444' };
    const statusNums = computed(() => {
      const emps = data.employees;
      const cnt = { active: 0, probation: 0, leave: 0 };
      emps.forEach((e) => { cnt[e.status] = (cnt[e.status] || 0) + 1; });
      return [
        { label: 'Active', value: cnt.active, color: STATUS_COLORS.active },
        { label: 'Probation', value: cnt.probation, color: STATUS_COLORS.probation },
        { label: 'Leaving', value: cnt.leave, color: STATUS_COLORS.leave },
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
          tooltip: {
            trigger: 'item',
            formatter: (p) => `${p.name}<br/><b>${p.value}</b> 人 (${p.percent}%)`,
          },
          legend: { orient: 'horizontal', bottom: 4, textStyle: { color: '#64748b', fontSize: 12 } },
          series: [{
            type: 'pie',
            radius: ['42%', '65%'],
            center: ['50%', '45%'],
            label: {
              show: true,
              formatter: (p) => `{val|${p.value}}\n{pct|${p.percent}%}`,
              rich: {
                val: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', lineHeight: 22 },
                pct: { fontSize: 11, color: '#64748b', lineHeight: 16 },
              },
            },
            labelLine: { length: 10, length2: 8 },
            data: [
              { name: 'Active', value: st.active || 0, itemStyle: { color: '#6366f1' } },
              { name: 'Probation', value: st.probation || 0, itemStyle: { color: '#f59e0b' } },
              { name: 'Leaving', value: st.leave || 0, itemStyle: { color: '#ef4444' } },
            ],
          }],
        });
        window.addEventListener('resize', () => c2.resize());
      }
    });

    return { stats, statusNums, chartDept, chartStatus };
  },
};
})();
