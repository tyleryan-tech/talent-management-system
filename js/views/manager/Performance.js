(function () {
  const { computed, onMounted, ref, watch } = Vue;
  const useAuthStore = window.TM.useAuthStore;
  const useDataStore = window.TM.useDataStore;
  const loadEcharts = window.TM.loadEcharts;
  const TM = window.TM;

  window.TM.MgrPerformance = {
    name: 'MgrPerformance',
    template: `
    <div class="page-stack">
      <div class="card pad" v-if="currentCycle">
        <p class="muted small" style="margin:0">
          <strong>Current performance cycle</strong>: {{ currentCycle.name }}
          <span class="tag" style="margin-left:8px">{{ cycleTypeLabel(currentCycle) }}</span>
        </p>
      </div>

      <section class="card pad">
        <h3 class="section-title">To-dos</h3>
        <p class="muted small">No self-assessment. As RM, submit output and initial grade; as an approver, advance or send back to RM.</p>
        <table class="data-table">
          <thead><tr><th>Employee</th><th>Cycle</th><th>Step</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in todoList" :key="r.id">
              <td>{{ empName(r.employeeId) }}</td>
              <td>{{ cycleLabel(r) }}</td>
              <td>{{ todoKind(r) }}</td>
              <td><button type="button" class="btn-link" @click="openTask(r)">Open</button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!todoList.length" class="muted small">Nothing pending.</p>
      </section>

      <section class="card pad">
        <h3 class="section-title">Team review history</h3>
        <p class="muted small">All reviews for your team subtree.</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee</th><th>RM</th><th>Cycle</th><th>RM grade</th><th>Final grade</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in history" :key="r.id">
              <td>{{ empName(r.employeeId) }}</td>
              <td>{{ empName(r.reviewerId) }}</td>
              <td>{{ cycleLabel(r) }}</td>
              <td>{{ r.rmInitialGrade || '—' }}</td>
              <td>{{ r.status === 'finalized' ? (r.finalGrade || '—') : '—' }}</td>
              <td>{{ statusText(r) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card pad">
        <h3 class="section-title">Final grade mix (team)</h3>
        <div class="org-scope-row" style="margin-bottom:12px;flex-wrap:wrap;gap:12px;align-items:flex-end">
          <label class="field inline">
            <span>Team scope</span>
            <select v-model.number="statsRootManagerId" class="input">
              <option :value="me">My team (full subtree)</option>
              <option v-for="opt in subManagerOptions" :key="opt.id" :value="opt.id">
                Sub-team: {{ opt.name }} ({{ opt.n }})
              </option>
            </select>
          </label>
        </div>
        <p v-if="statsFinalizedCount" class="muted small">{{ statsFinalizedCount }} archived in the selected scope.</p>
        <p v-else class="muted small">No archived records in this scope.</p>
        <div ref="chartRef" class="chart-box"></div>
      </section>

      <div v-if="rmModalRow" class="modal-backdrop" @click.self="rmModalRow = null">
        <div class="modal card wide">
          <h3>RM review · {{ empName(rmModalRow.employeeId) }} · {{ cycleLabel(rmModalRow) }}</h3>
          <form class="form-grid" @submit.prevent="submitRm">
            <label class="field full"><span>Past performance summary</span>
              <textarea v-model="rmForm.historyPerformance" rows="2" placeholder="Prior review highlights" required></textarea>
            </label>
            <label class="field full"><span>Output summary (RM)</span>
              <textarea v-model="rmForm.outputDescription" rows="3" required placeholder="Key results this cycle"></textarea>
            </label>
            <label class="field"><span>RM initial grade</span>
              <select v-model="rmForm.rmInitialGrade" class="input" required>
                <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <label class="field"><span>Prior-cycle avg hours (h/day)</span>
              <input v-model.number="rmForm.prevCycleAvgHours" type="number" step="0.1" min="0" max="24" placeholder="Optional" />
            </label>
            <label class="field full"><span>Comments</span><textarea v-model="rmForm.comments" rows="2"></textarea></label>
            <label class="field full"><span>Development suggestions</span><textarea v-model="rmForm.devAdvice" rows="2"></textarea></label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="rmModalRow = null">Cancel</button>
              <button type="submit" class="btn btn-primary">Submit to approval</button>
            </div>
          </form>
        </div>
      </div>

      <div v-if="apprModalRow" class="modal-backdrop" @click.self="apprModalRow = null">
        <div class="modal card">
          <h3>Approve · {{ empName(apprModalRow.employeeId) }}</h3>
          <p class="muted small">RM initial: {{ apprModalRow.rmInitialGrade }}; output: {{ (apprModalRow.outputDescription || '').slice(0, 80) }}{{ (apprModalRow.outputDescription || '').length > 80 ? '…' : '' }}</p>
          <label class="field full"><span>Approval note (optional)</span><textarea v-model="apprNote" rows="2"></textarea></label>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="apprModalRow = null">Cancel</button>
            <button type="button" class="btn btn-secondary" @click="doReject">Send back to RM</button>
            <button type="button" class="btn btn-primary" @click="doApprove">Approve</button>
          </div>
        </div>
      </div>
    </div>
  `,
    setup() {
      const auth = useAuthStore();
      const data = useDataStore();
      const me = computed(() => auth.currentUser?.employeeId);
      const gradeOptions = TM.PERF_GRADE_OPTIONS;

      const subtreeIds = computed(() => {
        if (!me.value) return new Set();
        return TM.collectSubtreeEmployeeIds(data, me.value);
      });

      const directIds = computed(() => new Set(
        data.employees.filter((e) => e.managerId === me.value).map((e) => e.id),
      ));

      const subManagerOptions = computed(() => {
        const subs = data.employees.filter((e) => e.managerId === me.value && e.status !== 'leave');
        return subs
          .filter((e) => data.employees.some((x) => x.managerId === e.id && x.status !== 'leave'))
          .map((e) => ({
            id: e.id,
            name: e.name,
            n: TM.collectSubtreeEmployeeIds(data, e.id).size,
          }));
      });

      const statsRootManagerId = ref(null);
      watch(me, (m) => {
        if (m != null && (statsRootManagerId.value == null || statsRootManagerId.value === 0)) {
          statsRootManagerId.value = m;
        }
      }, { immediate: true });

      const statsEmployeeSet = computed(() => {
        const root = statsRootManagerId.value || me.value;
        if (!root) return new Set();
        return TM.collectSubtreeEmployeeIds(data, root);
      });

      const currentCycle = computed(() => {
        const list = data.performanceCycles || [];
        const open = list.filter((c) => c.status === 'open');
        if (open.length === 1) return open[0];
        if (open.length > 1) {
          return [...open].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];
        }
        return [...list].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] || null;
      });

      const todoList = computed(() => {
        const m = me.value;
        if (!m) return [];
        const out = [];
        data.performanceReviews.forEach((r) => {
          if (r.status === 'rm_pending' && Number(r.pendingApproverId) === Number(m)
            && Number(r.reviewerId) === Number(m) && directIds.value.has(r.employeeId)) {
            out.push(r);
          }
          if (r.status === 'in_approval' && Number(r.pendingApproverId) === Number(m)) {
            out.push(r);
          }
        });
        return out;
      });

      const history = computed(() => {
        const set = subtreeIds.value;
        const list = data.performanceReviews.filter((r) => set.has(r.employeeId));
        return [...list].sort((a, b) => TM.reviewSortStamp(data, b).localeCompare(TM.reviewSortStamp(data, a)));
      });

      const statsFinalized = computed(() => {
        const set = statsEmployeeSet.value;
        return data.performanceReviews.filter(
          (r) => set.has(r.employeeId) && r.status === 'finalized' && r.finalGrade && gradeOptions.includes(String(r.finalGrade).trim()),
        );
      });

      const statsFinalizedCount = computed(() => statsFinalized.value.length);

      const statsGradeDist = computed(() => {
        const m = {};
        gradeOptions.forEach((g) => { m[g] = 0; });
        statsFinalized.value.forEach((r) => {
          const g = String(r.finalGrade).trim();
          if (m[g] != null) m[g] += 1;
        });
        return m;
      });

      const chartRef = ref(null);
      let chartInst;

      async function drawChart() {
        const echarts = await loadEcharts();
        if (!chartRef.value) return;
        if (!chartInst) chartInst = echarts.init(chartRef.value);
        const g = statsGradeDist.value;
        const total = Object.values(g).reduce((a, b) => a + b, 0);
        if (!total) {
          chartInst.setOption({
            title: {
              text: 'No archived data',
              left: 'center',
              top: 'center',
              textStyle: { color: '#64748b', fontSize: 14, fontWeight: 400 },
            },
            series: [{ type: 'pie', radius: '65%', data: [] }],
          });
          return;
        }
        const pieData = gradeOptions.map((name) => ({ name, value: g[name] || 0 })).filter((x) => x.value > 0);
        chartInst.setOption({
          tooltip: {
            trigger: 'item',
            formatter: (p) => {
              const pct = total ? ((Number(p.value) / total) * 100).toFixed(1) : '0';
              return `${p.name}: ${p.value} (${pct}%)`;
            },
          },
          series: [{
            type: 'pie',
            radius: '65%',
            label: { formatter: (p) => (Number(p.value) ? `${p.name}\n${((Number(p.value) / total) * 100).toFixed(1)}%` : '') },
            data: pieData,
          }],
        });
      }

      onMounted(() => {
        drawChart();
        window.addEventListener('resize', () => chartInst?.resize());
      });
      watch([statsGradeDist, statsRootManagerId], () => { drawChart(); }, { deep: true });

      function empName(id) {
        return data.employees.find((e) => e.id === id)?.name || id;
      }
      function cycleLabel(r) {
        return TM.reviewCycleLabel(data, r);
      }
      function cycleTypeLabel(c) {
        const en = { half_year: 'Half-year review', year: 'Annual review' };
        return en[c?.cycleType] || TM.PERF_CYCLE_TYPE_LABEL[c?.cycleType] || 'Half-year review';
      }
      function statusText(r) {
        const map = {
          rm_pending: 'Pending RM review',
          in_approval: 'In approval',
          finalized: 'Archived',
          rejected: 'Rejected',
        };
        return map[r.status] || r.status;
      }
      function todoKind(r) {
        if (r.status === 'rm_pending') return 'RM initial review';
        return 'Chain approval';
      }

      const rmModalRow = ref(null);
      const apprModalRow = ref(null);
      const apprNote = ref('');
      const rmForm = ref({
        historyPerformance: '',
        outputDescription: '',
        rmInitialGrade: 'B',
        prevCycleAvgHours: null,
        comments: '',
        devAdvice: '',
      });

      function openTask(r) {
        if (r.status === 'rm_pending' && Number(r.reviewerId) === Number(me.value)) {
          rmModalRow.value = r;
          rmForm.value = {
            historyPerformance: r.historyPerformance || '',
            outputDescription: r.outputDescription || '',
            rmInitialGrade: gradeOptions.includes(String(r.rmInitialGrade).trim()) ? String(r.rmInitialGrade).trim() : 'B',
            prevCycleAvgHours: r.prevCycleAvgHours,
            comments: r.comments || '',
            devAdvice: r.devAdvice || '',
          };
          return;
        }
        if (r.status === 'in_approval' && Number(r.pendingApproverId) === Number(me.value)) {
          apprModalRow.value = r;
          apprNote.value = '';
        }
      }

      function submitRm() {
        const r = rmModalRow.value;
        if (!r) return;
        if (data.submitRmPerformanceReview(r.id, { ...rmForm.value })) {
          rmModalRow.value = null;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Submitted', type: 'success' } }));
        } else {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Submit failed — check required fields and grade', type: 'error' } }));
        }
      }

      function doApprove() {
        const r = apprModalRow.value;
        if (!r || !me.value) return;
        if (data.approvePerformanceReview(r.id, me.value, apprNote.value)) {
          apprModalRow.value = null;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Approved', type: 'success' } }));
        }
      }
      function doReject() {
        const r = apprModalRow.value;
        if (!r || !me.value) return;
        if (!confirm('Send this review back to the RM for changes?')) return;
        if (data.rejectPerformanceReview(r.id, me.value, apprNote.value)) {
          apprModalRow.value = null;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Sent back to RM', type: 'info' } }));
        }
      }

      return {
        me,
        gradeOptions,
        currentCycle,
        cycleTypeLabel,
        todoList,
        history,
        chartRef,
        statsRootManagerId,
        subManagerOptions,
        statsFinalizedCount,
        empName,
        cycleLabel,
        statusText,
        todoKind,
        openTask,
        rmModalRow,
        rmForm,
        submitRm,
        apprModalRow,
        apprNote,
        doApprove,
        doReject,
      };
    },
  };
})();
