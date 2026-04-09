(function () {
  const { computed, onMounted, ref, watch, nextTick } = Vue;
  const useDataStore = window.TM.useDataStore;
  const loadEcharts = window.TM.loadEcharts;
  const chartPrefs = window.TM.chartPrefs;

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
        <template v-if="chartPrefs.isVisible('dash-dept')">
          <div class="card pad">
            <div class="chart-card-header">
              <h3 class="section-title">Headcount by department</h3>
              <button type="button" class="chart-hide-btn" @click="chartPrefs.toggleVisibility('dash-dept')" title="Hide this chart"><i class="fa-solid fa-eye-slash"></i></button>
            </div>
            <div ref="chartDept" class="chart-box"></div>
          </div>
        </template>
        <div v-else class="card pad chart-hidden-placeholder" @click="chartPrefs.toggleVisibility('dash-dept')">
          <i class="fa-solid fa-chart-bar muted"></i>
          <span class="muted">Headcount by department</span>
          <span class="chart-show-hint">Click to show</span>
        </div>

        <template v-if="chartPrefs.isVisible('dash-status')">
          <div class="card pad">
            <div class="chart-card-header">
              <h3 class="section-title">Employee status</h3>
              <button type="button" class="chart-hide-btn" @click="chartPrefs.toggleVisibility('dash-status')" title="Hide this chart"><i class="fa-solid fa-eye-slash"></i></button>
            </div>
            <div class="status-num-row">
              <div class="status-num-item" v-for="s in statusNums" :key="s.label">
                <span class="status-dot" :style="{ background: s.color }"></span>
                <span class="status-num-label">{{ s.label }}</span>
                <span class="status-num-val">{{ s.value }}</span>
              </div>
            </div>
            <div ref="chartStatus" class="chart-box"></div>
          </div>
        </template>
        <div v-else class="card pad chart-hidden-placeholder" @click="chartPrefs.toggleVisibility('dash-status')">
          <i class="fa-solid fa-chart-pie muted"></i>
          <span class="muted">Employee status</span>
          <span class="chart-show-hint">Click to show</span>
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
    let echartsLib = null;
    let cDept = null;
    let cStatus = null;

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

    async function renderDept() {
      if (!chartDept.value) return;
      if (!echartsLib) echartsLib = await loadEcharts();
      const byDept = {};
      data.departments.forEach((d) => { byDept[d.id] = 0; });
      data.employees.forEach((e) => {
        if (e.status !== 'leave') byDept[e.departmentId] = (byDept[e.departmentId] || 0) + 1;
      });
      const deptNames = data.departments.map((d) => d.name);
      const deptVals = data.departments.map((d) => byDept[d.id] || 0);
      if (cDept) cDept.dispose();
      cDept = echartsLib.init(chartDept.value);
      cDept.setOption({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: deptNames, axisLabel: { color: '#64748b' } },
        yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
        series: [{ type: 'bar', data: deptVals, itemStyle: { color: '#6366f1', borderRadius: [6, 6, 0, 0] } }],
      });
      window.addEventListener('resize', () => cDept && cDept.resize());
    }

    async function renderStatus() {
      if (!chartStatus.value) return;
      if (!echartsLib) echartsLib = await loadEcharts();
      const st = { active: 0, probation: 0, leave: 0 };
      data.employees.forEach((e) => { st[e.status] = (st[e.status] || 0) + 1; });
      if (cStatus) cStatus.dispose();
      cStatus = echartsLib.init(chartStatus.value);
      cStatus.setOption({
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
      window.addEventListener('resize', () => cStatus && cStatus.resize());
    }

    onMounted(() => {
      nextTick(() => {
        renderDept();
        renderStatus();
      });
    });

    // Re-render when a chart is toggled back to visible
    watch(() => chartPrefs.hidden.slice(), () => {
      nextTick(() => {
        if (chartPrefs.isVisible('dash-dept'))    renderDept();
        if (chartPrefs.isVisible('dash-status'))  renderStatus();
      });
    });

    return { stats, statusNums, chartDept, chartStatus, chartPrefs };
  },
};
})();
