(function () {
  const { computed, onMounted, onUnmounted, ref } = Vue;
  const useAuthStore = window.TM.useAuthStore;
  const useDataStore = window.TM.useDataStore;
  const loadEcharts = window.TM.loadEcharts;

const GRADES = window.TM.PERF_GRADE_OPTIONS || ['A+', 'A', 'A-', 'B+', 'B', 'C', 'C-'];

  window.TM.MgrAnalytics = {
  name: 'MgrAnalytics',
  template: `
    <div class="page-stack">
      <div class="grid-2">
        <div class="card pad"><h3 class="section-title">Team performance mix</h3><div ref="c1" class="chart-box"></div></div>
        <div class="card pad"><h3 class="section-title">Team attendance rate (demo)</h3><div ref="c2" class="chart-box"></div></div>
      </div>
      <div class="card pad">
        <h3 class="section-title">Training completion</h3>
        <div ref="c3" class="chart-box short"></div>
      </div>
    </div>
  `,
  setup() {
    const auth = useAuthStore();
    const data = useDataStore();
    const c1 = ref(null);
    const c2 = ref(null);
    const c3 = ref(null);

    const me = computed(() => auth.currentUser?.employeeId);
    const subsIds = computed(() => data.employees.filter((e) => e.managerId === me.value && e.status !== 'leave').map((e) => e.id));

    let ch1 = null, ch2 = null, ch3 = null;
    let echartsLib = null;

    function handleResize() {
      if (ch1) ch1.resize();
      if (ch2) ch2.resize();
      if (ch3) ch3.resize();
    }

    function drawAll() {
      if (!echartsLib) return;
      const ids = subsIds.value;
      const idsSet = new Set(ids);

      const reviews = data.performanceReviews.filter(
        (r) => idsSet.has(r.employeeId) && r.status === 'finalized' && r.finalGrade && GRADES.includes(String(r.finalGrade).trim()),
      );
      var latestByEmp = {};
      reviews.forEach((r) => {
        var prev = latestByEmp[r.employeeId];
        if (!prev || (r.cycleId || 0) > (prev.cycleId || 0)) latestByEmp[r.employeeId] = r;
      });
      const gm = {};
      GRADES.forEach((g) => { gm[g] = 0; });
      Object.values(latestByEmp).forEach((r) => {
        const g = String(r.finalGrade).trim();
        if (gm[g] != null) gm[g] += 1;
      });
      const pieData = GRADES.map((k) => ({ name: k, value: gm[k] })).filter((x) => x.value > 0);
      if (!ch1 && c1.value) ch1 = echartsLib.init(c1.value);
      if (ch1) ch1.setOption({
        tooltip: { trigger: 'item' },
        series: [{ type: 'pie', radius: ['40%', '65%'], data: pieData.length ? pieData : [{ name: 'None', value: 0 }] }],
      });

      const recs = data.attendanceRecords.filter((r) => idsSet.has(r.employeeId));
      const months = [...new Set(recs.map((r) => r.month))].sort();
      const rates = months.map((m) => {
        const chunk = recs.filter((r) => r.month === m);
        if (!chunk.length) return 0;
        return Math.round(chunk.reduce((a, b) => a + b.attendanceRate, 0) / chunk.length);
      });
      if (!ch2 && c2.value) ch2 = echartsLib.init(c2.value);
      if (ch2) ch2.setOption({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: months },
        yAxis: { type: 'value', max: 100 },
        series: [{ type: 'line', smooth: true, data: rates, areaStyle: { opacity: 0.08 }, itemStyle: { color: '#10b981' } }],
      });

      const trains = data.employeeTrainings.filter((t) => idsSet.has(t.employeeId));
      var enrolledEmpIds = new Set(trains.map((t) => t.employeeId));
      const done = new Set(trains.filter((t) => t.status === 'completed').map((t) => t.employeeId)).size;
      const prog = new Set(trains.filter((t) => t.status === 'in_progress').map((t) => t.employeeId)).size;
      const notEnrolled = Math.max(0, ids.length - enrolledEmpIds.size);
      if (!ch3 && c3.value) ch3 = echartsLib.init(c3.value);
      if (ch3) ch3.setOption({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['Completed', 'In progress', 'Not enrolled'] },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar',
          data: [done, prog, notEnrolled],
          itemStyle: { color: '#6366f1', borderRadius: [6, 6, 0, 0] },
        }],
      });
    }

    let _redrawTimer = null;
    function debouncedRedraw() {
      if (_redrawTimer) clearTimeout(_redrawTimer);
      _redrawTimer = setTimeout(function () { _redrawTimer = null; drawAll(); }, 300);
    }

    let unsubStore = null;

    onMounted(async () => {
      echartsLib = await loadEcharts();
      drawAll();
      unsubStore = data.$subscribe(function () { debouncedRedraw(); });
      window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
      if (typeof unsubStore === 'function') unsubStore();
      window.removeEventListener('resize', handleResize);
      if (ch1) { ch1.dispose(); ch1 = null; }
      if (ch2) { ch2.dispose(); ch2 = null; }
      if (ch3) { ch3.dispose(); ch3 = null; }
    });

    return { c1, c2, c3 };
  },
};
})();
