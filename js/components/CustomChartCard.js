/**
 * Renders a single user-defined chart card.
 * Props: config { id, title, groupBy, chartType, scope: 'active'|'all' }
 * Emits: remove(id)
 */
(function () {
  const { ref, onMounted, onUnmounted, computed, watch } = Vue;
  const loadEcharts = window.TM.loadEcharts;

  const STATUS_LABELS = { active: 'Active', probation: 'Probation', leave: 'Leaving' };
  const PALETTE = ['#6366f1','#f59e0b','#10b981','#3b82f6','#ec4899','#8b5cf6','#14b8a6','#f97316','#64748b','#a3e635'];

  function computeEntries(config, data) {
    const emps = config.scope === 'all'
      ? [...data.employees]
      : data.employees.filter((e) => e.status !== 'leave');

    const posMap = data._posMap;
    const deptMap = data._deptMap;
    let tmMap;
    const groups = {};
    emps.forEach((e) => {
      let key = '—';
      switch (config.groupBy) {
        case 'rank': {
          key = posMap.get(e.positionId)?.level || '—'; break;
        }
        case 'team': {
          key = deptMap.get(e.departmentId)?.name || '—'; break;
        }
        case 'status':
          key = STATUS_LABELS[e.status] || e.status; break;
        case 'gender':
          key = e.gender || '—'; break;
        case 'jobFunction': {
          key = posMap.get(e.positionId)?.name || '—'; break;
        }
        case 'potential': {
          if (!tmMap) {
            tmMap = new Map();
            (data.talentMatrix || []).forEach((x) => tmMap.set(Number(x.employeeId), x));
          }
          const m = tmMap.get(Number(e.id));
          key = { H: 'High', M: 'Medium', L: 'Low' }[m?.potential] || 'Not assessed'; break;
        }
        case 'payPosition': {
          const labels = { below_min: 'Below min', p25: 'P25', p50: 'Median', p75: 'P75', above_max: 'Above max' };
          key = labels[e.salaryBand] || '—'; break;
        }
      }
      groups[key] = (groups[key] || 0) + 1;
    });
    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  }

  function buildOption(config, entries) {
    const names = entries.map(([k]) => k);
    const vals  = entries.map(([, v]) => v);
    if (config.chartType === 'pie' || config.chartType === 'donut') {
      return {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', right: 4, top: 'center', type: 'scroll', textStyle: { fontSize: 11 } },
        series: [{
          type: 'pie',
          radius: config.chartType === 'donut' ? ['38%', '66%'] : ['0%', '66%'],
          center: ['38%', '50%'],
          data: entries.map(([name, value], i) => ({ name, value, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
          label: { formatter: '{b}\n{c}', fontSize: 10 },
        }],
      };
    }
    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: names, axisLabel: { fontSize: 10, rotate: names.length > 6 ? 35 : 0, interval: 0 } },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{
        type: 'bar',
        data: vals.map((v, i) => ({ value: v, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
        label: { show: true, position: 'top', fontSize: 10 },
        barMaxWidth: 48,
      }],
    };
  }

  window.TM.CustomChartCard = {
    name: 'CustomChartCard',
    props: { config: { type: Object, required: true } },
    emits: ['remove', 'hide'],
    template: `
      <div class="card pad chart-card-wrap">
        <div class="chart-card-header">
          <h3 class="section-title" style="margin:0">{{ config.title }}</h3>
          <button type="button" class="chart-hide-btn" @click="$emit('hide', config.id)" title="Hide this chart"><i class="fa-solid fa-eye-slash"></i></button>
          <button type="button" class="col-th-btn col-th-btn-hide" @click="$emit('remove', config.id)" title="Delete this chart">✕</button>
        </div>
        <p class="muted small">
          {{ scopeLabel }} &middot; by {{ groupByLabel }}
          <span v-if="entries.length === 0" class="muted"> — no data</span>
        </p>
        <div ref="chartEl" class="chart-box"></div>
      </div>
    `,
    setup(props) {
      const data = window.TM.useDataStore();
      const chartEl = ref(null);
      let inst = null;

      const groupByLabel = computed(() => {
        const o = window.TM.chartPrefs.GROUP_BY_OPTIONS.find((x) => x.value === props.config.groupBy);
        return o?.label || props.config.groupBy;
      });
      const scopeLabel = computed(() => props.config.scope === 'all' ? 'All employees' : 'Active only');
      const entries    = computed(() => computeEntries(props.config, data));

      async function render() {
        if (!chartEl.value) return;
        const echarts = await loadEcharts();
        if (inst) { inst.dispose(); }
        inst = echarts.init(chartEl.value);
        inst.setOption(buildOption(props.config, entries.value));
      }

      watch(entries, () => {
        Vue.nextTick(() => render());
      });

      onMounted(() => { render(); });
      onUnmounted(() => { if (inst) { inst.dispose(); inst = null; } });

      return { chartEl, groupByLabel, scopeLabel, entries };
    },
  };
})();
