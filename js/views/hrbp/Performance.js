(function () {
  const { computed, onMounted, ref, watch } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useHrScopeStore = window.TM.useHrScopeStore;
  const createOrgScopeBindings = window.TM.createOrgScopeBindings;
  const loadEcharts = window.TM.loadEcharts;
  const TM = window.TM;

  window.TM.HrbpPerformance = {
    name: 'HrbpPerformance',
    template: `
    <div class="page-stack">
      <div class="card pad org-scope-bar">
        <div class="org-scope-row">
          <label class="field inline org-scope-select">
            <span><i class="fa-solid fa-sitemap"></i> Organization scope</span>
            <select v-model.number="scopeRootDeptUi" class="input">
              <option :value="0">Product line</option>
              <option v-for="opt in deptScopeOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
            </select>
          </label>
          <p class="muted small org-scope-hint">{{ scopeHint }}</p>
        </div>
      </div>

      <div class="card pad" v-if="currentCycle">
        <p class="muted small" style="margin:0">
          <strong>Current performance cycle</strong>: {{ currentCycle.name }}
          <span class="tag" style="margin-left:8px">{{ cycleTypeLabel(currentCycle) }}</span>
          <span class="muted">({{ currentCycle.startDate }} ~ {{ currentCycle.endDate }})</span>
        </p>
      </div>

      <section class="card pad">
        <h3 class="section-title">Performance cycles</h3>
        <p class="muted small">Only <strong>half-year</strong> and <strong>annual</strong> cycle types; the open cycle is treated as current.</p>
        <table class="data-table compact">
          <thead><tr><th>Name</th><th>Type</th><th>Period</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="c in data.performanceCycles" :key="c.id">
              <td>{{ c.name }}</td>
              <td>{{ cycleTypeLabel(c) }}</td>
              <td>{{ c.startDate }} ~ {{ c.endDate }}</td>
              <td>{{ c.status === 'open' ? 'Open' : 'Closed' }}</td>
              <td><button type="button" class="btn-link" @click="editCycle(c)">Edit</button></td>
            </tr>
          </tbody>
        </table>
        <button type="button" class="btn btn-secondary btn-sm" @click="openCycleCreate">Add cycle</button>
      </section>

      <section class="card pad">
        <h3 class="section-title">Performance reviews</h3>
        <p class="muted small">No self-assessment; RM submits initial review and chain approves. When complete, only HRBP may change the final grade. List is filtered by organization scope.</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee</th><th>RM</th><th>Cycle</th><th>History</th><th>Output summary</th>
              <th>RM grade</th><th>Prev-cycle avg hours</th><th>Final grade</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in reviewsScoped" :key="r.id">
              <td>{{ empName(r.employeeId) }}</td>
              <td>{{ empName(r.reviewerId) }}</td>
              <td>{{ cycleLabel(r) }}</td>
              <td class="cell-clip">{{ r.historyPerformance || '—' }}</td>
              <td class="cell-clip">{{ r.outputDescription || '—' }}</td>
              <td>{{ r.rmInitialGrade || '—' }}</td>
              <td>{{ r.prevCycleAvgHours != null ? r.prevCycleAvgHours + ' h/day' : '—' }}</td>
              <td><strong>{{ r.status === 'finalized' ? (r.finalGrade || '—') : '—' }}</strong></td>
              <td>{{ statusText(r) }}</td>
              <td class="row-actions">
                <button type="button" class="btn-link" @click="openDetail(r)">Details</button>
                <button v-if="r.status === 'finalized'" type="button" class="btn-link" @click="openHrbpAdjust(r)">Adjust grade</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card pad">
        <h3 class="section-title">Final grade distribution</h3>
        <p v-if="finalizedCount" class="muted small">{{ finalizedCount }} archived record(s) in scope with a final grade.</p>
        <p v-else class="muted small">No archived records in scope.</p>
        <div ref="chartRef" class="chart-box"></div>
      </section>

      <div v-if="cycleModal" class="modal-backdrop" @click.self="cycleModal = false">
        <div class="modal card">
          <h3>{{ cycleForm.id ? 'Edit cycle' : 'Add cycle' }}</h3>
          <form class="form-grid" @submit.prevent="saveCycle">
            <label class="field"><span>Name</span><input v-model="cycleForm.name" required /></label>
            <label class="field"><span>Type</span>
              <select v-model="cycleForm.cycleType" class="input">
                <option value="half_year">Half-year review</option>
                <option value="year">Annual review</option>
              </select>
            </label>
            <label class="field"><span>Start</span><input v-model="cycleForm.startDate" type="date" required /></label>
            <label class="field"><span>End</span><input v-model="cycleForm.endDate" type="date" required /></label>
            <label class="field"><span>Status</span>
              <select v-model="cycleForm.status"><option value="open">Open</option><option value="closed">Closed</option></select>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="cycleModal = false">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>

      <div v-if="detailRow" class="modal-backdrop" @click.self="detailRow = null">
        <div class="modal card wide">
          <h3>Review details · {{ empName(detailRow.employeeId) }}</h3>
          <div class="kv-grid" style="margin-bottom:12px">
            <div><span class="muted">Cycle</span><div>{{ cycleLabel(detailRow) }}</div></div>
            <div><span class="muted">Status</span><div>{{ statusText(detailRow) }}</div></div>
            <div><span class="muted">RM initial</span><div>{{ detailRow.rmInitialGrade || '—' }}</div></div>
            <div><span class="muted">Final grade</span><div>{{ detailRow.status === 'finalized' ? (detailRow.finalGrade || '—') : '—' }}</div></div>
            <div class="full"><span class="muted">History</span><div>{{ detailRow.historyPerformance || '—' }}</div></div>
            <div class="full"><span class="muted">Output (RM)</span><div>{{ detailRow.outputDescription || '—' }}</div></div>
            <div><span class="muted">Prev-cycle avg hours</span><div>{{ detailRow.prevCycleAvgHours != null ? detailRow.prevCycleAvgHours + ' h/day' : '—' }}</div></div>
            <div class="full"><span class="muted">Approval log</span>
              <ul class="muted small" style="margin:4px 0;padding-left:1.2rem">
                <li v-for="(log, i) in (detailRow.approvalLog || [])" :key="i">
                  {{ log.at }} · {{ empName(log.approverId) }} · {{ log.action }}{{ log.note ? ': ' + log.note : '' }}
                </li>
                <li v-if="!(detailRow.approvalLog || []).length">—</li>
              </ul>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="detailRow = null">Close</button>
            <button v-if="detailRow.status === 'finalized'" type="button" class="btn btn-primary" @click="openHrbpAdjust(detailRow); detailRow = null">Adjust grade</button>
          </div>
        </div>
      </div>

      <div v-if="adjustRow" class="modal-backdrop" @click.self="adjustRow = null">
        <div class="modal card">
          <h3>HRBP: adjust final grade · {{ empName(adjustRow.employeeId) }}</h3>
          <p class="muted small">Only after the full approval chain is complete; managers cannot edit here.</p>
          <form class="form-grid" @submit.prevent="saveHrbpAdjust">
            <label class="field"><span>Final grade</span>
              <select v-model="adjustGrade" class="input" required>
                <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="adjustRow = null">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
    setup() {
      const data = useDataStore();
      const hrScope = useHrScopeStore();
      const { scopeRootDeptUi, deptScopeOptions, scopeHint, employeeInScope } = createOrgScopeBindings(data, hrScope);

      const gradeOptions = TM.PERF_GRADE_OPTIONS;

      const reviewsScoped = computed(() =>
        data.performanceReviews.filter((r) => {
          const emp = data.employees.find((e) => e.id === r.employeeId);
          return emp && employeeInScope(emp);
        }),
      );

      const currentCycle = computed(() => {
        const list = data.performanceCycles || [];
        const open = list.filter((c) => c.status === 'open');
        if (open.length === 1) return open[0];
        if (open.length > 1) {
          return [...open].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];
        }
        return [...list].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] || null;
      });

      const finalizedScoped = computed(() =>
        reviewsScoped.value.filter((r) => r.status === 'finalized' && r.finalGrade && gradeOptions.includes(String(r.finalGrade).trim())),
      );

      const finalizedCount = computed(() => finalizedScoped.value.length);

      const gradeDist = computed(() => {
        const m = {};
        gradeOptions.forEach((g) => { m[g] = 0; });
        finalizedScoped.value.forEach((r) => {
          const g = String(r.finalGrade).trim();
          if (m[g] != null) m[g] += 1;
        });
        return m;
      });

      const chartRef = ref(null);
      const cycleModal = ref(false);
      const cycleForm = ref({
        name: '', cycleType: 'half_year', startDate: '', endDate: '', status: 'open', id: null,
      });
      const detailRow = ref(null);
      const adjustRow = ref(null);
      const adjustGrade = ref('B');

      function empName(id) {
        return data.employees.find((e) => e.id === id)?.name || id;
      }
      function cycleTypeLabel(c) {
        const en = { half_year: 'Half-year review', year: 'Annual review' };
        return en[c?.cycleType] || TM.PERF_CYCLE_TYPE_LABEL[c?.cycleType] || (c?.cycleType === 'year' ? 'Annual review' : 'Half-year review');
      }
      function cycleLabel(r) {
        return TM.reviewCycleLabel(data, r);
      }
      function statusText(r) {
        const map = {
          rm_pending: 'Pending RM review',
          in_approval: `In approval${r.pendingApproverId ? ' (waiting: ' + empName(r.pendingApproverId) + ')' : ''}`,
          finalized: 'Archived',
          rejected: 'Rejected',
        };
        return map[r.status] || r.status;
      }

      function openDetail(r) {
        detailRow.value = r;
      }
      function openHrbpAdjust(r) {
        adjustRow.value = r;
        adjustGrade.value = (r.finalGrade && gradeOptions.includes(String(r.finalGrade).trim()))
          ? String(r.finalGrade).trim()
          : 'B';
      }
      function saveHrbpAdjust() {
        const row = adjustRow.value;
        if (!row) return;
        if (data.hrbpAdjustFinalGrade(row.id, adjustGrade.value)) {
          adjustRow.value = null;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Final grade updated', type: 'success' } }));
        }
      }

      function openCycleCreate() {
        cycleForm.value = {
          name: '', cycleType: 'half_year', startDate: '', endDate: '', status: 'open', id: null,
        };
        cycleModal.value = true;
      }
      function editCycle(c) {
        cycleForm.value = {
          ...c,
          cycleType: c.cycleType === 'year' ? 'year' : 'half_year',
        };
        cycleModal.value = true;
      }
      function saveCycle() {
        const f = cycleForm.value;
        const payload = {
          name: f.name,
          cycleType: f.cycleType === 'year' ? 'year' : 'half_year',
          startDate: f.startDate,
          endDate: f.endDate,
          status: f.status,
        };
        if (f.id) data.updateCycle(f.id, payload);
        else data.addCycle(payload);
        cycleModal.value = false;
      }

      let chartInst;
      async function drawChart() {
        const echarts = await loadEcharts();
        if (!chartRef.value) return;
        if (!chartInst) chartInst = echarts.init(chartRef.value);
        const g = gradeDist.value;
        const total = Object.values(g).reduce((a, b) => a + b, 0);
        if (!total) {
          chartInst.setOption({
            title: {
              text: 'No archived data',
              left: 'center',
              top: 'center',
              textStyle: { color: '#64748b', fontSize: 14, fontWeight: 400 },
            },
            tooltip: { show: false },
            series: [{ type: 'pie', radius: '68%', data: [] }],
          });
          return;
        }
        const pieData = gradeOptions.map((name) => ({ name, value: g[name] || 0 })).filter((x) => x.value > 0);
        chartInst.setOption({
          title: { show: false },
          tooltip: {
            trigger: 'item',
            formatter: (p) => {
              const pct = total ? ((Number(p.value) / total) * 100).toFixed(1) : '0';
              return `${p.name}: ${p.value} (${pct}%)`;
            },
          },
          series: [{
            type: 'pie',
            radius: '68%',
            label: {
              formatter: (p) => {
                const v = Number(p.value);
                if (!v) return '';
                const pct = total ? ((v / total) * 100).toFixed(1) : '0';
                return `${p.name}\n${pct}%`;
              },
            },
            labelLine: { show: true },
            data: pieData,
          }],
        });
      }

      onMounted(() => {
        drawChart();
        window.addEventListener('resize', () => chartInst?.resize());
      });

      watch(gradeDist, () => { drawChart(); }, { deep: true });
      watch(reviewsScoped, () => { drawChart(); }, { deep: true });
      watch(() => hrScope.scopeRootDepartmentId, () => { drawChart(); });

      return {
        data,
        gradeOptions,
        chartRef,
        cycleModal,
        cycleForm,
        detailRow,
        adjustRow,
        adjustGrade,
        finalizedCount,
        scopeRootDeptUi,
        deptScopeOptions,
        scopeHint,
        reviewsScoped,
        currentCycle,
        empName,
        cycleTypeLabel,
        cycleLabel,
        statusText,
        openCycleCreate,
        editCycle,
        saveCycle,
        openDetail,
        openHrbpAdjust,
        saveHrbpAdjust,
      };
    },
  };
})();
