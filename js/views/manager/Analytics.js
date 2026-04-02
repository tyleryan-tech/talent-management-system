(function () {
  const { computed, onMounted, ref } = Vue;
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
    const subsIds = computed(() => data.employees.filter((e) => e.managerId === me.value).map((e) => e.id));

    onMounted(async () => {
      const echarts = await loadEcharts();
      const ids = subsIds.value;

      const reviews = data.performanceReviews.filter(
        (r) => ids.includes(r.employeeId) && r.status === 'finalized' && r.finalGrade && GRADES.includes(String(r.finalGrade).trim()),
      );
      const gm = {};
      GRADES.forEach((g) => { gm[g] = 0; });
      reviews.forEach((r) => {
        const g = String(r.finalGrade).trim();
        if (gm[g] != null) gm[g] += 1;
      });
      const pieData = GRADES.map((k) => ({ name: k, value: gm[k] })).filter((x) => x.value > 0);
      const ch1 = echarts.init(c1.value);
      ch1.setOption({
        tooltip: { trigger: 'item' },
        series: [{ type: 'pie', radius: ['40%', '65%'], data: pieData.length ? pieData : [{ name: 'None', value: 0 }] }],
      });

      const recs = data.attendanceRecords.filter((r) => ids.includes(r.employeeId));
      const months = [...new Set(recs.map((r) => r.month))].sort();
      const rates = months.map((m) => {
        const chunk = recs.filter((r) => r.month === m);
        if (!chunk.length) return 0;
        return Math.round(chunk.reduce((a, b) => a + b.attendanceRate, 0) / chunk.length);
      });
      const ch2 = echarts.init(c2.value);
      ch2.setOption({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: months },
        yAxis: { type: 'value', max: 100 },
        series: [{ type: 'line', smooth: true, data: rates, areaStyle: { opacity: 0.08 }, itemStyle: { color: '#10b981' } }],
      });

      const trains = data.employeeTrainings.filter((t) => ids.includes(t.employeeId));
      const done = trains.filter((t) => t.status === 'completed').length;
      const prog = trains.filter((t) => t.status === 'in_progress').length;
      const ch3 = echarts.init(c3.value);
      ch3.setOption({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['Completed', 'In progress', 'Not enrolled'] },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar',
          data: [done, prog, Math.max(0, ids.length - trains.length)],
          itemStyle: { color: '#6366f1', borderRadius: [6, 6, 0, 0] },
        }],
      });

      window.addEventListener('resize', () => {
        ch1.resize();
        ch2.resize();
        ch3.resize();
      });
    });

    return { c1, c2, c3 };
  },
};
})();
