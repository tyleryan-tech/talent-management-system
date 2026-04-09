(function () {
  const { computed, onMounted, ref, watch, nextTick } = Vue;
  const useDataStore = window.TM.useDataStore;
  const loadEcharts = window.TM.loadEcharts;
  const chartPrefs = window.TM.chartPrefs;

  window.TM.HrbpDashboard = {
  name: 'HrbpDashboard',
  components: {
    HrbpAnalyticsPanel: window.TM.HrbpAnalytics,
    CustomChartCard: window.TM.CustomChartCard,
  },
  template: `
    <div class="page-stack">
      <!-- Stat cards -->
      <div class="stat-row">
        <div class="stat-card card" v-for="s in stats" :key="s.k">
          <div class="muted">{{ s.label }}</div>
          <div class="stat-num">{{ s.value }}</div>
        </div>
      </div>

      <!-- Chart visibility toolbar -->
      <div class="dash-chart-toolbar card pad">
        <div class="dash-chart-toolbar-row">
          <span class="dash-chart-toolbar-label"><i class="fa-solid fa-chart-column"></i> Charts</span>
          <span v-if="allHiddenCharts.length" class="dash-hidden-count">{{ allHiddenCharts.length }} hidden</span>

          <div class="dash-chart-toolbar-actions">
            <!-- Restore hidden charts (built-in + custom) -->
            <template v-if="allHiddenCharts.length">
              <button
                v-for="hc in allHiddenCharts" :key="hc.id"
                type="button"
                class="btn btn-ghost btn-sm dash-restore-btn"
                @click="chartPrefs.toggleVisibility(hc.id)"
                :title="'Show: ' + hc.label"
              ><i class="fa-solid fa-eye"></i> {{ hc.label }}</button>
            </template>

            <!-- Customize panel toggle -->
            <div class="col-picker-wrap">
              <button type="button" :class="['btn btn-ghost btn-sm chart-customize-btn', showPanel && 'btn-active']" @click.stop="showPanel = !showPanel">
                <i class="fa-solid fa-sliders"></i> Customize
              </button>
              <div v-if="showPanel" class="col-picker-panel chart-pref-panel" @click.stop>
                <div class="col-picker-header">
                  <span><i class="fa-solid fa-sliders"></i> Chart preferences</span>
                  <button class="col-picker-close" @click="showPanel = false">✕</button>
                </div>
                <div class="col-picker-list">
                  <template v-for="section in ['Dashboard', 'Analytics']" :key="section">
                    <div class="chart-pref-section-label">{{ section }}</div>
                    <div v-for="chart in chartPrefs.ALL_CHARTS.filter(c => c.section === section)" :key="chart.id" class="col-picker-row">
                      <label class="col-picker-check">
                        <input type="checkbox" :checked="chartPrefs.isVisible(chart.id)" @change="chartPrefs.toggleVisibility(chart.id)" />
                        <span :class="!chartPrefs.isVisible(chart.id) && 'col-picker-hidden-label'">{{ chart.label }}</span>
                      </label>
                    </div>
                  </template>
                  <template v-if="chartPrefs.customCharts.length">
                    <div class="chart-pref-section-label">Custom charts</div>
                    <div v-for="cc in chartPrefs.customCharts" :key="cc.id" class="col-picker-row">
                      <span style="flex:1;font-size:.85rem">{{ cc.title }}</span>
                      <button type="button" class="col-th-btn col-th-btn-hide" @click="chartPrefs.removeCustomChart(cc.id)" title="Remove">✕</button>
                    </div>
                  </template>
                </div>
                <div class="col-picker-footer" style="gap:6px;flex-wrap:wrap">
                  <button type="button" class="btn btn-ghost btn-sm" @click="chartPrefs.resetDefaults()">Reset defaults</button>
                  <button type="button" class="btn btn-primary btn-sm" @click="showPanel=false; showAddChart=true">
                    <i class="fa-solid fa-plus"></i> Add custom chart
                  </button>
                </div>
              </div>
              <div v-if="showPanel" class="col-picker-overlay" @click="showPanel=false"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dashboard built-in charts (hidden = completely gone, not placeholder) -->
      <div class="grid-2" v-if="chartPrefs.isVisible('dash-dept') || chartPrefs.isVisible('dash-status')">
        <div v-if="chartPrefs.isVisible('dash-dept')" class="card pad">
          <div class="chart-card-header">
            <h3 class="section-title">Headcount by department</h3>
            <button type="button" class="chart-hide-btn" @click="chartPrefs.toggleVisibility('dash-dept')" title="Hide this chart"><i class="fa-solid fa-eye-slash"></i></button>
          </div>
          <div ref="chartDept" class="chart-box"></div>
        </div>

        <div v-if="chartPrefs.isVisible('dash-status')" class="card pad">
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
      </div>

      <!-- Custom charts from user (only visible ones) -->
      <template v-if="visibleCustomCharts.length">
        <h3 class="section-title" style="margin-top:1rem;margin-bottom:.5rem">
          <i class="fa-solid fa-wand-magic-sparkles"></i> My charts
        </h3>
        <div class="custom-charts-grid">
          <CustomChartCard
            v-for="cc in visibleCustomCharts"
            :key="cc.id"
            :config="cc"
            @hide="chartPrefs.toggleVisibility"
            @remove="chartPrefs.removeCustomChart"
          />
        </div>
      </template>

      <!-- Add custom chart modal -->
      <div v-if="showAddChart" class="modal-backdrop" @click.self="showAddChart=false">
        <div class="modal card" style="max-width:420px">
          <h3><i class="fa-solid fa-chart-column"></i> Add custom chart</h3>
          <form @submit.prevent="saveCustomChart">
            <label class="field">
              <span>Chart title</span>
              <input v-model="newChart.title" class="input" required placeholder="e.g. Rank distribution" />
            </label>
            <label class="field">
              <span>Group by</span>
              <select v-model="newChart.groupBy" class="input">
                <option v-for="o in chartPrefs.GROUP_BY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </label>
            <label class="field">
              <span>Chart type</span>
              <select v-model="newChart.chartType" class="input">
                <option v-for="o in chartPrefs.CHART_TYPES" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </label>
            <label class="field">
              <span>Employee scope</span>
              <select v-model="newChart.scope" class="input">
                <option value="active">Active only (excl. Leaving)</option>
                <option value="all">All employees (incl. Leaving)</option>
              </select>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="showAddChart=false">Cancel</button>
              <button type="submit" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Add chart</button>
            </div>
          </form>
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

    const showPanel = ref(false);
    const showAddChart = ref(false);
    const newChart = ref({ title: '', groupBy: 'rank', chartType: 'bar', scope: 'active' });

    const hiddenDashCharts = computed(() =>
      chartPrefs.ALL_CHARTS
        .filter((c) => c.section === 'Dashboard' && !chartPrefs.isVisible(c.id))
    );

    const hiddenCustomCharts = computed(() =>
      chartPrefs.customCharts
        .filter((c) => !chartPrefs.isVisible(c.id))
        .map((c) => ({ id: c.id, label: c.title }))
    );

    const allHiddenCharts = computed(() => [
      ...hiddenDashCharts.value,
      ...hiddenCustomCharts.value,
    ]);

    const visibleCustomCharts = computed(() =>
      chartPrefs.customCharts.filter((c) => chartPrefs.isVisible(c.id))
    );

    function saveCustomChart() {
      if (!newChart.value.title.trim()) return;
      chartPrefs.addCustomChart({ ...newChart.value });
      showAddChart.value = false;
      newChart.value = { title: '', groupBy: 'rank', chartType: 'bar', scope: 'active' };
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Custom chart added', type: 'success' } }));
    }

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

    watch(() => chartPrefs.hidden.slice(), () => {
      nextTick(() => {
        if (chartPrefs.isVisible('dash-dept'))    renderDept();
        if (chartPrefs.isVisible('dash-status'))  renderStatus();
      });
    });

    return {
      stats, statusNums, chartDept, chartStatus, chartPrefs,
      showPanel, showAddChart, newChart, saveCustomChart,
      allHiddenCharts, visibleCustomCharts,
    };
  },
};
})();
