(function () {
  const { computed, onMounted, onUnmounted, ref, watch } = Vue;
  const useAuthStore = window.TM.useAuthStore;
  const useDataStore = window.TM.useDataStore;
  const loadEcharts = window.TM.loadEcharts;

function buildReportTree(data, rootId) {
  const children = data.employees.filter((e) => e.managerId === rootId && e.status !== 'leave');
  return {
    name: data.employees.find((e) => e.id === rootId)?.name || String(rootId),
    meta: { id: rootId },
    children: children.map((c) => buildReportTree(data, c.id)),
  };
}

  window.TM.MgrTeam = {
  name: 'MgrTeam',
  template: `
    <div class="page-stack">
      <div class="grid-2">
        <div class="card pad">
          <h3 class="section-title">Direct reports</h3>
          <table class="data-table">
            <thead><tr><th>Name</th><th>Job function</th><th>Status</th><th>Hire date</th><th></th></tr></thead>
            <tbody>
              <tr v-for="e in direct" :key="e.id">
                <td>{{ e.name }}</td>
                <td>{{ posName(e.positionId) }}</td>
                <td>{{ empStatusEn(e.status) }}</td>
                <td>{{ e.hireDate }}</td>
                <td><button type="button" class="btn-link" @click="detail = e">Details</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card pad">
          <h3 class="section-title">Reporting line (you → team tree)</h3>
          <div ref="chartRef" class="chart-tall"></div>
        </div>
      </div>
      <div v-if="detail" class="modal-backdrop" @click.self="detail = null">
        <div class="modal card wide">
          <h3>{{ detail.name }} · Profile</h3>
          <div class="kv-grid">
            <div v-for="(v,k) in detailKv" :key="k"><span class="muted">{{ k }}</span><div>{{ v }}</div></div>
          </div>
          <h4>Performance history</h4>
          <table class="data-table compact">
            <thead><tr><th>Cycle</th><th>Final grade</th><th>RM initial</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="r in reviewsOf(detail.id)" :key="r.id">
                <td>{{ cycleLabel(r) }}</td>
                <td>{{ (r.status === 'finalized' || r.status === 'calibrated') ? (r.finalGrade || '—') : '—' }}</td>
                <td>{{ r.rmInitialGrade || '—' }}</td>
                <td>{{ perfStatusEn(r.status) }}</td>
              </tr>
            </tbody>
          </table>
          <h4>Leave requests</h4>
          <table class="data-table compact">
            <thead><tr><th>Type</th><th>Dates</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="l in leavesOf(detail.id)" :key="l.id">
                <td>{{ l.type }}</td><td>{{ l.startDate }}~{{ l.endDate }}</td><td>{{ leaveStatusEn(l.status) }}</td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="btn btn-primary" @click="detail = null">Close</button>
        </div>
      </div>
    </div>
  `,
  setup() {
    const auth = useAuthStore();
    const data = useDataStore();
    const chartRef = ref(null);
    const detail = ref(null);
    let chartInst;
    let echartsLib;

    const me = computed(() => auth.currentUser?.employeeId);
    const direct = computed(() => data.employees.filter((e) => e.managerId === me.value));

    function posName(id) {
      return data.positions.find((p) => p.id === id)?.name || '-';
    }
    function deptName(id) {
      return data.departments.find((d) => d.id === id)?.name || '-';
    }

    function empStatusEn(s) {
      return { active: 'Active', probation: 'Probation', leave: 'Leaving' }[s] || s;
    }

    const detailKv = computed(() => {
      if (!detail.value) return {};
      const e = detail.value;
      return {
        'Staff ID': e.id,
        Department: deptName(e.departmentId),
        'Job function': posName(e.positionId),
        Phone: e.phone,
        Email: e.email,
        Status: empStatusEn(e.status),
      };
    });

    function cycleLabel(r) {
      return window.TM.reviewCycleLabel(data, r);
    }
    function perfStatusEn(s) {
      const m = {
        rm_pending: 'Pending RM review',
        in_approval: 'In approval',
        finalized: 'Archived',
        rejected: 'Rejected',
      };
      return m[s] || String(s || '—');
    }
    function leaveStatusEn(s) {
      return { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[s] || s;
    }
    function reviewsOf(eid) {
      return data.performanceReviews
        .filter((r) => r.employeeId === eid)
        .sort((a, b) => window.TM.reviewSortStamp(data, b).localeCompare(window.TM.reviewSortStamp(data, a)));
    }
    function leavesOf(eid) {
      return data.leaveRequests.filter((l) => l.employeeId === eid);
    }

    function draw() {
      if (!chartRef.value || !echartsLib || !me.value) return;
      const treeData = buildReportTree(data, me.value);
      if (!chartInst) chartInst = echartsLib.init(chartRef.value);
      chartInst.setOption({
        tooltip: { trigger: 'item' },
        series: [{
          type: 'tree',
          data: [treeData],
          top: '5%',
          left: '10%',
          bottom: '5%',
          right: '22%',
          symbolSize: 9,
          edgeShape: 'polyline',
          lineStyle: { color: '#94a3b8' },
          label: { color: '#334155' },
          leaves: { label: { position: 'right' } },
          expandAndCollapse: true,
        }],
      });
    }

    onMounted(async () => {
      echartsLib = await loadEcharts();
      draw();
      window.addEventListener('resize', () => chartInst?.resize());
    });

    watch([() => data.employees.length, () => me.value], () => { if (chartInst) draw(); });

    onUnmounted(() => chartInst?.dispose());

    return { direct, chartRef, detail, detailKv, posName, empStatusEn, reviewsOf, leavesOf, cycleLabel, perfStatusEn, leaveStatusEn };
  },
};
})();
