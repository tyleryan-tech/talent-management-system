(function () {
  const { computed, reactive, ref } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useHrScopeStore = window.TM.useHrScopeStore;
  const createOrgScopeBindings = window.TM.createOrgScopeBindings;

const perfOpts = ['A', 'B', 'C'];
/** Nine-box column order: low to high performance, A on the right */
const perfOptsGridOrder = ['C', 'B', 'A'];
const potOpts = ['H', 'M', 'L'];

function yearFromCycle(cycle) {
  if (!cycle) return null;
  const m = String(cycle).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

function reviewGradeForDisplay(r) {
  if (!r) return '—';
  if (r.status === 'finalized' && r.finalGrade) return String(r.finalGrade).trim();
  if (r.rmInitialGrade) return String(r.rmInitialGrade).trim();
  return '—';
}

  window.TM.HrbpTalent = {
  name: 'HrbpTalent',
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
      <section class="card pad">
        <h3 class="section-title">Talent nine-box</h3>
        <p class="muted">X-axis: performance (C left → A right). Y-axis: potential (high / medium / low). Names stay in sync with the <strong>roster</strong>: active employees have a cell (default B/M); Leaving employees are excluded. Cells refresh after product line changes, saves, or roster import.</p>
        <div class="nine-grid">
          <div class="nine-corner muted small">Potential \\ Performance</div>
          <div v-for="p in perfOptsGridOrder" :key="'h'+p" class="nine-col-h">{{ p }}</div>
          <template v-for="pot in potOrder" :key="pot">
            <div class="nine-row-h">{{ potLabel(pot) }}</div>
            <div v-for="perf in perfOptsGridOrder" :key="pot+perf" class="nine-cell">
              <div class="nine-cell-head">{{ potLabel(pot) }} · {{ perf }}</div>
              <ul class="nine-emp-list">
                <li v-for="e in cell(perf, pot)" :key="e.id">
                  <button type="button" class="linklike" @click="openPerfHistory(e)">{{ e.name }}</button>
                  <select
                    class="input nine-pot-select"
                    :value="employeePotential(e.id)"
                    title="Adjust potential"
                    @click.stop
                    @change="onPotentialChange(e, $event)"
                  >
                    <option v-for="x in potOpts" :key="x" :value="x">{{ potLabel(x) }} ({{ x }})</option>
                  </select>
                  <button type="button" class="btn-icon-tweak" title="Adjust performance & potential" @click.stop="pickEmp(e)" aria-label="Edit labels">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                </li>
              </ul>
            </div>
          </template>
        </div>
      </section>
      <section class="card pad">
        <h3 class="section-title">High-potential talent (perf A/B, potential H)</h3>
        <p class="muted small"><strong>Development plan</strong> is free text; saved on blur. Independent from roster “management plan”.</p>
        <div class="table-scroll-wrap">
        <table class="data-table highpot-table">
          <thead><tr><th>Name</th><th>Department</th><th>Last performance</th><th>Potential</th><th>Development plan</th></tr></thead>
          <tbody>
            <tr v-for="row in highPot" :key="row.employeeId">
              <td><button type="button" class="linklike" @click="openPerfHistoryById(row.employeeId)">{{ row.name }}</button></td>
              <td>{{ row.dept }}</td>
              <td>
                <span v-if="row.lastPerformance && row.lastPerformance !== '—'" class="tag perf-grade-tag">{{ row.lastPerformance }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td>
                <select
                  class="input nine-pot-select table-inline"
                  :value="row.potential"
                  title="Adjust potential"
                  @change="onPotentialChangeById(row.employeeId, row.matrixPerformance, $event)"
                >
                  <option v-for="x in potOpts" :key="x" :value="x">{{ potLabel(x) }} ({{ x }})</option>
                </select>
              </td>
              <td class="highpot-devplan-cell">
                <textarea
                  class="input highpot-devplan-input"
                  rows="2"
                  :value="row.developmentPlan"
                  placeholder="Development plan (saved on blur)…"
                  @blur="onHighPotDevPlanBlur(row.employeeId, $event)"
                ></textarea>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>
      <section class="card pad">
        <h3 class="section-title">Succession</h3>
        <table class="data-table">
          <thead><tr><th>Key position (Target HC)</th><th>Successors</th><th>Note</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in successionPlansScoped" :key="s.id">
              <td>{{ posName(s.positionId) }}</td>
              <td>{{ succNames(s.successorIds) }}</td>
              <td class="cell-clip">{{ s.note }}</td>
              <td><button type="button" class="btn-link" @click="editSucc(s)">Edit</button></td>
            </tr>
          </tbody>
        </table>
        <button type="button" class="btn btn-secondary btn-sm" @click="openSuccCreate">Add succession plan</button>
      </section>

      <div v-if="perfModal" class="modal-backdrop" @click.self="perfModal = false">
        <div class="modal card wide">
          <h3>Performance grades (3 years) · {{ perfEmp?.name }}</h3>
          <p class="muted small">By calendar year: latest review per employee per year (by cycle start). Grade is <strong>final</strong> if archived, else RM initial. “Prev-cycle avg hours” comes from that review row.</p>
          <table class="data-table compact" v-if="perfThreeYears.length">
            <thead>
              <tr><th>Year</th><th>Cycle</th><th>Prev-cycle avg hours</th><th>Grade</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in perfThreeYears" :key="row.year">
                <td>{{ row.year }}</td>
                <td>{{ row.cycle }}</td>
                <td>{{ row.hours }}</td>
                <td>
                  <span v-if="row.grade && row.grade !== '—'" class="tag perf-grade-tag">{{ row.grade }}</span>
                  <span v-else class="muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="modal-actions" style="margin-top:1rem;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost" @click="perfModal = false">Close</button>
            <button type="button" class="btn btn-secondary" @click="fromPerfOpenTag">Edit nine-box labels</button>
          </div>
        </div>
      </div>

      <div v-if="tagModal" class="modal-backdrop" @click.self="tagModal = false">
        <div class="modal card">
          <h3>Edit labels · {{ tagEmp?.name }}</h3>
          <form class="form-grid" :key="'tag-' + (tagEmp?.id ?? '')" @submit.prevent="saveTag">
            <label class="field"><span>Performance</span>
              <select v-model="tagForm.performance" class="input">
                <option v-for="x in perfOpts" :key="x" :value="x">{{ x }}</option>
              </select>
            </label>
            <label class="field"><span>Potential</span>
              <select v-model="tagForm.potential" class="input">
                <option v-for="x in potOpts" :key="x" :value="x">{{ potLabel(x) }} ({{ x }})</option>
              </select>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="tagModal = false">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>

      <div v-if="succModal" class="modal-backdrop" @click.self="succModal = false">
        <div class="modal card wide">
          <h3>{{ succForm.id ? 'Edit succession plan' : 'Add succession plan' }}</h3>
          <form class="form-grid" @submit.prevent="saveSucc">
            <label class="field"><span>Key position (Target HC)</span>
              <select v-model.number="succForm.positionId" required>
                <option v-for="p in positionsForSuccModal" :key="p.id" :value="p.id">{{ succPosOption(p) }}</option>
              </select>
            </label>
            <label class="field full"><span>Successors (Ctrl/Cmd + click for multi-select)</span>
              <select v-model="succMulti" multiple class="input multi" size="6">
                <option v-for="e in employeesForSuccModal" :key="e.id" :value="String(e.id)">{{ e.name }} ({{ e.id }})</option>
              </select>
            </label>
            <label class="field full"><span>Note</span><input v-model="succForm.note" /></label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="succModal = false">Cancel</button>
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
    const {
      scopeDeptIds,
      scopeRootDeptUi,
      deptScopeOptions,
      scopeHint,
      employeeInScope,
      positionDeptInScope,
    } = createOrgScopeBindings(data, hrScope);

    const positionsForSucc = computed(() => {
      const set = scopeDeptIds.value;
      if (set == null) return data.positions;
      return data.positions.filter((p) => set.has(Number(p.departmentId)));
    });

    const employeesForSucc = computed(() => data.employees.filter((e) => employeeInScope(e)));

    const employeesForSuccModal = computed(() => {
      const base = employeesForSucc.value;
      const baseIds = new Set(base.map((e) => e.id));
      const picked = (succMulti.value || []).map((x) => Number(x));
      const extra = data.employees.filter((e) => picked.includes(e.id) && !baseIds.has(e.id));
      return [...extra, ...base];
    });

    const positionsForSuccModal = computed(() => {
      const base = positionsForSucc.value;
      const pid = succForm.value?.positionId;
      if (pid == null) return base;
      const cur = data.positions.find((p) => p.id === pid);
      if (!cur || base.some((p) => p.id === cur.id)) return base;
      return [cur, ...base];
    });

    const successionPlansScoped = computed(() =>
      data.successionPlans.filter((s) => positionDeptInScope(s.positionId)),
    );
    const potOrder = ['H', 'M', 'L'];
    const tagModal = ref(false);
    const tagEmp = ref(null);
    const tagForm = reactive({ performance: 'B', potential: 'M' });
    const succModal = ref(false);
    const succForm = ref({ id: null, positionId: data.positions[0]?.id, successorIds: [], note: '' });
    const succMulti = ref([]);

    const perfModal = ref(false);
    const perfEmp = ref(null);
    const perfThreeYears = ref([]);

    function matrixRow(eid) {
      const id = Number(eid);
      return data.talentMatrix.find((x) => Number(x.employeeId) === id);
    }

    function cell(perf, pot) {
      return data.employees.filter((e) => {
        if (e.status === 'leave') return false;
        if (!employeeInScope(e)) return false;
        const m = matrixRow(e.id);
        if (!m) return false;
        return m.performance === perf && m.potential === pot;
      });
    }

    /** Latest review grade for employee (final if archived, else RM initial) */
    function lastReviewGrade(employeeId) {
      const eid = Number(employeeId);
      const list = data.performanceReviews.filter((r) => Number(r.employeeId) === eid);
      if (!list.length) return '—';
      const sorted = [...list].sort((a, b) => {
        const cmp = window.TM.reviewSortStamp(data, b).localeCompare(window.TM.reviewSortStamp(data, a));
        if (cmp !== 0) return cmp;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
      return reviewGradeForDisplay(sorted[0]);
    }

    const highPot = computed(() => {
      return data.talentMatrix
        .filter((m) => {
          if (!['A', 'B'].includes(m.performance) || m.potential !== 'H') return false;
          const e = data.employees.find((x) => x.id === m.employeeId);
          return e && e.status !== 'leave' && employeeInScope(e);
        })
        .map((m) => {
          const e = data.employees.find((x) => x.id === m.employeeId);
          return {
            employeeId: m.employeeId,
            name: e?.name || m.employeeId,
            dept: data.departments.find((d) => d.id === e?.departmentId)?.name || '-',
            matrixPerformance: m.performance,
            lastPerformance: lastReviewGrade(m.employeeId),
            potential: m.potential,
            developmentPlan: String(m.developmentPlan ?? '').trim(),
          };
        });
    });

    function potLabel(p) {
      return { H: 'High', M: 'Medium', L: 'Low' }[p] || p;
    }
    function posName(id) {
      return data.positions.find((p) => p.id === id)?.name || id;
    }
    function succPosOption(p) {
      const d = data.departments.find((x) => x.id === p.departmentId);
      return `${p.name} (${d?.name || '—'} · ${p.level})`;
    }
    function succNames(ids) {
      return (ids || []).map((id) => data.employees.find((e) => e.id === id)?.name || id).join(', ');
    }

    function yearFromReviewRecord(r) {
      const c = window.TM.reviewCycleRecord(data, r);
      if (c && c.startDate) return Number(String(c.startDate).slice(0, 4));
      return yearFromCycle(r.cycle);
    }

    function buildThreeYearRows(employeeId) {
      const reviews = data.performanceReviews.filter((r) => r.employeeId === employeeId);
      const byYear = new Map();
      reviews.forEach((r) => {
        const y = yearFromReviewRecord(r);
        if (y == null) return;
        const prev = byYear.get(y);
        const stamp = window.TM.reviewSortStamp(data, r);
        const prevStamp = prev ? window.TM.reviewSortStamp(data, prev) : '';
        if (!prev || String(stamp).localeCompare(String(prevStamp)) > 0) {
          byYear.set(y, r);
        }
      });
      const nowY = new Date().getFullYear();
      const years = [nowY - 2, nowY - 1, nowY];
      return years.map((y) => {
        const r = byYear.get(y);
        if (!r) {
          return { year: y, cycle: '—', hours: '—', grade: '—' };
        }
        return {
          year: y,
          cycle: window.TM.reviewCycleLabel(data, r),
          hours: r.prevCycleAvgHours != null ? `${r.prevCycleAvgHours} h/day` : '—',
          grade: reviewGradeForDisplay(r),
        };
      });
    }

    function openPerfHistory(e) {
      perfEmp.value = e;
      perfThreeYears.value = buildThreeYearRows(e.id);
      perfModal.value = true;
    }

    function openPerfHistoryById(employeeId) {
      const e = data.employees.find((x) => x.id === employeeId);
      if (e) openPerfHistory(e);
    }

    function fromPerfOpenTag() {
      perfModal.value = false;
      if (perfEmp.value) pickEmp(perfEmp.value);
    }

    function employeePotential(employeeId) {
      const m = matrixRow(employeeId);
      const p = m?.potential;
      return potOpts.includes(p) ? p : 'M';
    }

    function onPotentialChange(e, ev) {
      const next = String(ev.target?.value ?? '').trim();
      if (!potOpts.includes(next)) return;
      const m = matrixRow(e.id);
      const perf = (m?.performance && perfOpts.includes(m.performance)) ? m.performance : 'B';
      data.upsertTalentCell(e.id, perf, next);
    }

    function onPotentialChangeById(employeeId, performance, ev) {
      const next = String(ev.target?.value ?? '').trim();
      if (!potOpts.includes(next)) return;
      const perf = (performance && perfOpts.includes(performance)) ? performance : 'B';
      data.upsertTalentCell(employeeId, perf, next);
    }

    function onHighPotDevPlanBlur(employeeId, ev) {
      const v = String(ev?.target?.value ?? '');
      data.setTalentDevelopmentPlan(employeeId, v);
    }

    function pickEmp(e) {
      const m = matrixRow(e.id) || { performance: 'B', potential: 'M' };
      tagEmp.value = e;
      tagForm.performance = m.performance;
      tagForm.potential = m.potential;
      tagModal.value = true;
    }
    function saveTag() {
      if (tagEmp.value) {
        data.upsertTalentCell(tagEmp.value.id, tagForm.performance, tagForm.potential);
      }
      tagModal.value = false;
    }

    function editSucc(s) {
      succForm.value = { ...s, successorIds: [...(s.successorIds || [])] };
      succMulti.value = succForm.value.successorIds.map(String);
      succModal.value = true;
    }
    function openSuccCreate() {
      const firstP = positionsForSucc.value[0]?.id ?? data.positions[0]?.id;
      succForm.value = { id: null, positionId: firstP, successorIds: [], note: '' };
      succMulti.value = [];
      succModal.value = true;
    }
    function saveSucc() {
      const ids = succMulti.value.map((x) => Number(x));
      data.upsertSuccession({ ...succForm.value, successorIds: ids });
      succModal.value = false;
    }

    return {
      data, perfOpts, perfOptsGridOrder, potOpts, potOrder, cell, highPot, potLabel, posName, succPosOption, succNames,
      employeePotential, onPotentialChange, onPotentialChangeById, onHighPotDevPlanBlur,
      scopeRootDeptUi, deptScopeOptions, scopeHint,
      successionPlansScoped, positionsForSucc, positionsForSuccModal, employeesForSuccModal,
      perfModal, perfEmp, perfThreeYears, openPerfHistory, openPerfHistoryById, fromPerfOpenTag,
      tagModal, tagEmp, tagForm, pickEmp, saveTag,
      succModal, succForm, succMulti, editSucc, openSuccCreate, saveSucc,
    };
  },
};
})();
