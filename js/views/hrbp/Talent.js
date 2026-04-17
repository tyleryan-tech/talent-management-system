(function () {
  const { computed, reactive, ref } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useHrScopeStore = window.TM.useHrScopeStore;
  const createOrgScopeBindings = window.TM.createOrgScopeBindings;

const perfOpts = ['A', 'B', 'C'];
const perfOptsGridOrder = ['C', 'B', 'A'];
const potOpts = ['H', 'M', 'L'];

function yearFromCycle(cycle) {
  if (!cycle) return null;
  const m = String(cycle).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

function reviewGradeForDisplay(r) {
  if (!r) return '—';
  if ((r.status === 'finalized' || r.status === 'calibrated') && r.finalGrade) return String(r.finalGrade).trim();
  if (r.rmInitialGrade) return String(r.rmInitialGrade).trim();
  return '—';
}

function tenureFromDate(fromStr) {
  if (!fromStr) return '—';
  const from = new Date(fromStr);
  if (Number.isNaN(from.getTime())) return '—';
  const to = new Date();
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y > 0 && m > 0) return y + 'y ' + m + 'm';
  if (y > 0) return y + 'y';
  return m + 'm';
}

function computeAge(e) {
  if (e.age != null && e.age !== '' && !Number.isNaN(Number(e.age))) {
    const n = Math.floor(Number(e.age));
    if (n >= 0 && n <= 130) return String(n);
  }
  const b = e.birthday;
  if (!b) return '—';
  const bd = new Date(b);
  if (Number.isNaN(bd.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const mDiff = today.getMonth() - bd.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < bd.getDate())) age--;
  return age >= 0 ? String(age) : '—';
}

/* ── High-potential table column definitions (matches uploaded image structure) ── */
const HP_GROUPS = [
  { key: 'basic',  label: '基本信息',         color: '#546e7a', bg: '#eceff1' },
  { key: 'grade',  label: '绩效 & 薪酬',      color: '#e65100', bg: '#fff3e0' },
  { key: 'assess', label: '评估 & 发展',       color: '#bf360c', bg: '#fbe9e7' },
  { key: 'employ', label: '在职信息',          color: '#1565c0', bg: '#e3f2fd' },
  { key: 'action', label: '操作',             color: '#0d47a1', bg: '#bbdefb' },
];

const HP_COLS = [
  { key: 'staffId',       label: 'Staff ID',        group: 'basic',  width: 72  },
  { key: 'name',          label: '姓名',             group: 'basic',  width: 80  },
  { key: 'jobFunction',   label: 'Job Function',     group: 'basic',  width: 90  },
  { key: 'department',    label: '部门',             group: 'basic',  width: 100 },
  { key: 'teamPath',      label: 'Team Path',        group: 'basic',  width: 120 },
  { key: 'orgRole',       label: 'Title',            group: 'basic',  width: 60  },
  { key: 'rank',          label: 'Rank',             group: 'basic',  width: 56  },

  { key: 'performance',   label: '绩效评级',          group: 'grade',  width: 72  },
  { key: 'perfHistory',   label: '绩效历史（近→远）',    group: 'grade',  width: 170, html: true },
  { key: 'potential',     label: '潜力',             group: 'grade',  width: 80  },
  { key: 'payPosition',   label: '薪资段位',          group: 'grade',  width: 80  },
  { key: 'yoe',           label: 'YoE',             group: 'grade',  width: 50  },

  { key: 'flightRisk',    label: 'Flight Risk',      group: 'assess', width: 80  },
  { key: 'devPlan',       label: '发展计划',          group: 'assess', width: 180 },
  { key: 'notes',         label: '备注',             group: 'assess', width: 140 },

  { key: 'companyTenure',  label: '司龄',            group: 'employ', width: 64  },
  { key: 'rankTenure',     label: '职级任期',         group: 'employ', width: 72  },
  { key: 'hireDate',       label: '入职日期',         group: 'employ', width: 88  },
  { key: 'age',            label: '年龄',            group: 'employ', width: 48  },
  { key: 'school',         label: '毕业院校',         group: 'employ', width: 100 },
  { key: 'status',         label: '状态',            group: 'employ', width: 72  },
  { key: 'avgHours6m',     label: '6月均出勤',        group: 'employ', width: 80  },
];

function buildHpGroupSpans() {
  const spans = [];
  let cur = null;
  HP_COLS.forEach((c) => {
    if (cur && cur.key === c.group) { cur.span += 1; }
    else { const g = HP_GROUPS.find((x) => x.key === c.group); cur = { key: c.group, label: g?.label || c.group, color: g?.color || '#333', bg: g?.bg || '#f5f5f5', span: 1 }; spans.push(cur); }
  });
  spans.push({ key: 'action', label: '操作', color: '#0d47a1', bg: '#bbdefb', span: 1 });
  return spans;
}
const HP_GROUP_SPANS = buildHpGroupSpans();

const STATUS_LABEL = { active: 'Active', probation: 'Probation', leave: 'Leaving' };
const PAY_LABELS = { below_min: '< Min', p25: 'P25', p50: 'P50', p75: 'P75', above_max: '> Max' };

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

      <!-- ══════════ NINE-BOX GRID ══════════ -->
      <section class="card pad">
        <h3 class="section-title">Talent Nine-Box</h3>
        <p class="muted small" style="margin-bottom:10px">X: Potential (L→H). Y: Performance (A→C). 高潜高绩效位于右上角。数据实时同步花名册。</p>
        <div class="nine-grid nine-grid-capped">
          <div class="nine-corner muted small">Performance \\ Potential</div>
          <div v-for="pot in potColOrder" :key="'h'+pot" class="nine-col-h">{{ potLabel(pot) }}</div>
          <template v-for="perf in perfRowOrder" :key="perf">
            <div class="nine-row-h">{{ perf }}</div>
            <div v-for="pot in potColOrder" :key="perf+pot" class="nine-cell">
              <div class="nine-cell-head">
                {{ perf }} · {{ potLabel(pot) }}
                <span class="nine-cell-count">({{ cell(perf, pot).length }})</span>
              </div>
              <div class="nine-cell-body">
                <div v-for="e in cell(perf, pot)" :key="e.id" class="nine-emp-item">
                  <button type="button" class="linklike" @click="openPerfHistory(e)">{{ e.name }}</button>
                  <select
                    v-if="auth.hasPermission('talent.potential')"
                    class="input nine-pot-select"
                    :value="employeePotential(e.id)"
                    title="Adjust potential"
                    @click.stop
                    @change="onPotentialChange(e, $event)"
                  >
                    <option v-for="x in potOpts" :key="x" :value="x">{{ potLabel(x) }} ({{ x }})</option>
                  </select>
                  <button v-if="auth.hasPermission('talent.labels')" type="button" class="btn-icon-tweak" title="Edit labels" @click.stop="pickEmp(e)">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </section>

      <!-- ══════════ HIGH-POTENTIAL TABLE (image-matched layout) ══════════ -->
      <section class="card pad">
        <h3 class="section-title">高潜人才分析 <span class="muted small" style="font-weight:400;margin-left:8px">Performance A/B + Potential H</span></h3>
        <p class="muted small" style="margin-bottom:8px">数据实时从花名册 + 绩效 + 九宫格获取。点击姓名查看绩效历史，发展计划/备注可直接编辑。</p>
        <p v-if="!highPotRows.length" class="muted small">当前范围内暂无高潜人才（Performance ≥ B 且 Potential = H）。</p>
        <div v-else class="table-card hp-scroll">
          <table class="hp-table">
            <thead>
              <tr class="hp-group-row">
                <th v-for="g in hpGroupSpans" :key="g.key" :colspan="g.span"
                  class="hp-grp-th" :style="{ background: g.bg, color: g.color }">{{ g.label }}</th>
              </tr>
              <tr class="hp-col-row">
                <th v-for="col in hpCols" :key="col.key" class="hp-col-th"
                  :style="{ minWidth: col.width + 'px' }">{{ col.label }}</th>
                <th class="hp-col-th" style="min-width:80px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in highPotRows" :key="row.employeeId">
                <td>{{ row.staffId }}</td>
                <td class="hp-name-cell">
                  <button type="button" class="linklike" @click="openPerfHistoryById(row.employeeId)">{{ row.name }}</button>
                </td>
                <td>{{ row.jobFunction }}</td>
                <td>{{ row.department }}</td>
                <td class="hp-cell-clip" :title="row.teamPath">{{ row.teamPath }}</td>
                <td>{{ row.orgRole }}</td>
                <td><span v-if="row.rank" class="tag tag-level">{{ row.rank }}</span><span v-else class="muted">—</span></td>

                <td><span class="tag perf-grade-tag">{{ row.performance }}</span></td>
                <td>
                  <span class="perf-grade-inline"><template v-if="row.perfHistoryList && row.perfHistoryList.length"><template v-for="(pg, gi) in row.perfHistoryList"><span v-if="gi">, </span><b v-if="pg.annual" class="perf-annual">{{ pg.grade }}</b><span v-else class="perf-half">{{ pg.grade }}</span></template></template><template v-else>—</template></span>
                </td>
                <td>
                  <select v-if="auth.hasPermission('talent.potential')" class="input nine-pot-select table-inline"
                    :value="row.potential"
                    @change="onPotentialChangeById(row.employeeId, row.performance, $event)">
                    <option v-for="x in potOpts" :key="x" :value="x">{{ potLabel(x) }} ({{ x }})</option>
                  </select>
                  <span v-else class="tag">{{ potLabel(row.potential) }} ({{ row.potential }})</span>
                </td>
                <td><span :class="row.payClass">{{ row.payPosition }}</span></td>
                <td>{{ row.yoe }}</td>

                <td><span :class="row.riskClass">{{ row.flightRisk }}</span></td>
                <td class="hp-edit-cell">
                  <textarea v-if="auth.hasPermission('talent.devPlan')" class="input hp-edit-input" rows="1"
                    :value="row.devPlan"
                    placeholder="发展计划…"
                    @blur="onDevPlanBlur(row.employeeId, $event)"></textarea>
                  <span v-else class="muted small">{{ row.devPlan || '—' }}</span>
                </td>
                <td class="hp-edit-cell">
                  <textarea v-if="auth.hasPermission('talent.labels')" class="input hp-edit-input" rows="1"
                    :value="row.notes"
                    placeholder="备注…"
                    @blur="onNotesBlur(row.employeeId, $event)"></textarea>
                  <span v-else class="muted small">{{ row.notes || '—' }}</span>
                </td>

                <td>{{ row.companyTenure }}</td>
                <td>{{ row.rankTenure }}</td>
                <td>{{ row.hireDate }}</td>
                <td>{{ row.age }}</td>
                <td class="hp-cell-clip" :title="row.school">{{ row.school }}</td>
                <td><span class="tag" :data-status="row.statusKey">{{ row.status }}</span></td>
                <td :class="hoursClass(row.avgHours6m)">{{ row.avgHours6m != null ? row.avgHours6m : '—' }}</td>

                <td>
                  <button v-if="auth.hasPermission('talent.labels')" type="button" class="btn-link" @click="pickEmpById(row.employeeId)" title="Edit labels"><i class="fa-solid fa-pen"></i></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ══════════ SUCCESSION ══════════ -->
      <section class="card pad">
        <h3 class="section-title">Succession</h3>
        <table class="data-table">
          <thead><tr><th>Key position (Target HC)</th><th>Successors</th><th>Note</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in successionPlansScoped" :key="s.id">
              <td>{{ posName(s.positionId) }}</td>
              <td>{{ succNames(s.successorIds) }}</td>
              <td class="cell-clip">{{ s.note }}</td>
              <td><button v-if="auth.hasPermission('talent.succession')" type="button" class="btn-link" @click="editSucc(s)">Edit</button></td>
            </tr>
          </tbody>
        </table>
        <button v-if="auth.hasPermission('talent.succession')" type="button" class="btn btn-secondary btn-sm" @click="openSuccCreate">Add succession plan</button>
      </section>

      <!-- ── Performance history modal ── -->
      <div v-if="perfModal" class="modal-backdrop" @click.self="perfModal = false">
        <div class="modal card wide">
          <h3>Performance grades (3 years) · {{ perfEmp?.name }}</h3>
          <p class="muted small">By calendar year: latest review per employee per year. Grade is <strong>final</strong> if archived, else RM initial.</p>
          <table class="data-table compact" v-if="perfThreeYears.length">
            <thead><tr><th>Year</th><th>Cycle</th><th>Prev-cycle avg hours</th><th>Grade</th></tr></thead>
            <tbody>
              <tr v-for="row in perfThreeYears" :key="row.year">
                <td>{{ row.year }}</td><td>{{ row.cycle }}</td><td>{{ row.hours }}</td>
                <td>
                  <span v-if="row.grade && row.grade !== '—'" class="tag perf-grade-tag">{{ row.grade }}</span>
                  <span v-else class="muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="modal-actions" style="margin-top:1rem">
            <button type="button" class="btn btn-ghost" @click="perfModal = false">Close</button>
            <button v-if="auth.hasPermission('talent.labels')" type="button" class="btn btn-secondary" @click="fromPerfOpenTag">Edit nine-box labels</button>
          </div>
        </div>
      </div>

      <!-- ── Edit labels modal ── -->
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

      <!-- ── Succession modal ── -->
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
    const auth = window.TM.useAuthStore();
    const hrScope = useHrScopeStore();
    const orgScope = createOrgScopeBindings(data, hrScope);
    const {
      scopeDeptIds,
      scopeRootDeptUi,
      deptScopeOptions,
      scopeHint,
      positionDeptInScope,
    } = orgScope;
    const _zs = window.TM.useZoneScope(data);
    function employeeInScope(emp) {
      if (!_zs.employeeInTeam(emp)) return false;
      return orgScope.employeeInScope(emp);
    }

    const positionsForSucc = computed(() => {
      const set = scopeDeptIds.value;
      if (set == null) return data.positions;
      return data.positions.filter((p) => set.has(Number(p.departmentId)));
    });

    const employeesForSucc = computed(() => data.employees.filter((e) => e.status !== 'leave' && employeeInScope(e)));

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
    const potColOrder = ['L', 'M', 'H'];
    const perfRowOrder = ['A', 'B', 'C'];
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

    const nineBoxBuckets = computed(() => {
      const buckets = new Map();
      data.employees.forEach((e) => {
        if (e.status === 'leave') return;
        if (!employeeInScope(e)) return;
        const m = matrixRow(e.id);
        if (!m) return;
        const rating = computedPerfRating(e.id);
        const key = rating + '|' + (m.potential || '');
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(e);
      });
      return buckets;
    });
    function cell(perf, pot) {
      return nineBoxBuckets.value.get(perf + '|' + pot) || [];
    }

    function perfHistoryHtml(employeeId) {
      const list = data._reviewsByEmp.get(Number(employeeId)) || [];
      return window.TM.allGradesForDisplay(list, data.performanceCycles) || '—';
    }
    function perfHistoryList(employeeId) {
      const list = data._reviewsByEmp.get(Number(employeeId)) || [];
      return window.TM.allGradesStructured(list, data.performanceCycles);
    }

    function computedPerfRating(employeeId) {
      const list = data._reviewsByEmp.get(Number(employeeId)) || [];
      return window.TM.computePerfRatingFromReviews(list, data.performanceCycles);
    }

    function lastReviewGrade(employeeId) {
      const list = data._reviewsByEmp.get(Number(employeeId)) || [];
      if (!list.length) return '—';
      const sorted = [...list].sort((a, b) => {
        const cmp = window.TM.reviewSortStamp(data, b).localeCompare(window.TM.reviewSortStamp(data, a));
        if (cmp !== 0) return cmp;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
      return reviewGradeForDisplay(sorted[0]);
    }

    /* ── Department path builder ── */
    function teamPathForEmp(e) {
      const lineStore = window.TM.useProductLineStore?.();
      const lineName = lineStore?.currentLine?.name || '';
      if (!e.departmentId) return lineName || '—';
      const chain = [];
      let dId = e.departmentId;
      let guard = 0;
      while (dId && guard < 20) {
        const dept = data.departments.find((d) => d.id === dId);
        if (!dept) break;
        chain.push(dept.name);
        dId = dept.parentId || null;
        guard++;
      }
      chain.reverse();
      return [lineName, ...chain].filter(Boolean).join(' > ');
    }

    /* ── Flight risk heuristic ── */
    function computeFlightRisk(e, m) {
      const FR = (window.TM.THRESHOLDS && window.TM.THRESHOLDS.FLIGHT_RISK) || { TENURE_MIN_YEARS: 3, TENURE_MAX_YEARS: 5, RANK_STALE_YEARS: 2, HIGH_SCORE: 2, MEDIUM_SCORE: 1 };
      let score = 0;
      const tenure = e.hireDate ? tenureFromDate(e.hireDate) : '—';
      if (tenure !== '—') {
        const match = tenure.match(/(\d+)y/);
        const years = match ? Number(match[1]) : 0;
        if (years >= FR.TENURE_MIN_YEARS && years <= FR.TENURE_MAX_YEARS) score += 1;
      }
      if (e.salaryBand === 'below_min' || e.salaryBand === 'p25') score += 1;
      const rankTenure = e.rankStartDate || e.levelStartDate;
      if (rankTenure) {
        const rm = tenureFromDate(rankTenure).match(/(\d+)y/);
        if (rm && Number(rm[1]) >= FR.RANK_STALE_YEARS) score += 1;
      }
      if (score >= FR.HIGH_SCORE) return 'High';
      if (score >= FR.MEDIUM_SCORE) return 'Medium';
      return 'Low';
    }

    /* ── High-potential rows (comprehensive, matching image) ── */
    const hpCols = HP_COLS;
    const hpGroupSpans = HP_GROUP_SPANS;

    const highPotRows = computed(() => {
      const empMap = data._empMap;
      const posMap = data._posMap;
      const deptMap = data._deptMap;
      const attIdx = data._attIdx;
      const att = window.TM.attendance;
      const months6 = att ? att.periodMonths('6month') : [];
      return data.talentMatrix
        .filter((m) => {
          if (m.potential !== 'H') return false;
          const rating = computedPerfRating(m.employeeId);
          if (!['A', 'B'].includes(rating)) return false;
          const e = empMap.get(m.employeeId);
          return e && e.status !== 'leave' && employeeInScope(e);
        })
        .map((m) => {
          const e = empMap.get(m.employeeId) || {};
          const pos = posMap.get(e.positionId);
          const dept = deptMap.get(e.departmentId);
          const risk = computeFlightRisk(e, m);
          const pay = PAY_LABELS[e.salaryBand] || e.salaryBand || '—';
          const rating = computedPerfRating(m.employeeId);
          return {
            employeeId: m.employeeId,
            staffId: e.staffId || e.id || '—',
            name: e.name || e.displayName || String(m.employeeId),
            jobFunction: e.jobFunction || pos?.name || '—',
            department: dept?.name || '—',
            teamPath: teamPathForEmp(e),
            orgRole: e.title || e.orgRole || '—',
            rank: pos?.level || e.rank || '',
            performance: rating,
            perfHistory: perfHistoryHtml(m.employeeId),
            perfHistoryList: perfHistoryList(m.employeeId),
            potential: m.potential,
            payPosition: pay,
            payClass: e.salaryBand === 'below_min' ? 'tag tag-risk-high' : e.salaryBand === 'above_max' ? 'tag tag-risk-low' : '',
            yoe: e.yoe || e.companyTenure || '—',
            flightRisk: risk,
            riskClass: risk === 'High' ? 'tag tag-risk-high' : risk === 'Medium' ? 'tag tag-risk-med' : 'tag tag-risk-low',
            devPlan: String(m.developmentPlan ?? '').trim(),
            notes: String(e.managementPlan ?? '').trim(),
            companyTenure: tenureFromDate(e.hireDate),
            rankTenure: tenureFromDate(e.rankStartDate || e.levelStartDate),
            hireDate: e.hireDate || '—',
            age: computeAge(e),
            school: e.school || e.gradSchool || '—',
            statusKey: e.status,
            status: STATUS_LABEL[e.status] || e.status || '—',
            avgHours6m: att ? att.empAvgHours(attIdx, e.id, months6) : null,
          };
        })
        .sort((a, b) => {
          const perfOrder = { A: 0, B: 1 };
          const d = (perfOrder[a.performance] ?? 9) - (perfOrder[b.performance] ?? 9);
          return d !== 0 ? d : a.name.localeCompare(b.name, 'zh-Hans-CN');
        });
    });

    function onDevPlanBlur(employeeId, ev) {
      data.setTalentDevelopmentPlan(employeeId, String(ev?.target?.value ?? ''));
    }

    function onNotesBlur(employeeId, ev) {
      const emp = data._empMap.get(employeeId);
      if (emp) {
        emp.managementPlan = String(ev?.target?.value ?? '');
        data.persistKeys('employees');
      }
    }

    function potLabel(p) {
      return { H: 'High', M: 'Medium', L: 'Low' }[p] || p;
    }
    function posName(id) {
      return data._posMap.get(id)?.name || id;
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
        if (!r) return { year: y, cycle: '—', hours: '—', grade: '—' };
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
      const perf = computedPerfRating(e.id);
      data.upsertTalentCell(e.id, perf, next);
    }

    function onPotentialChangeById(employeeId, _performance, ev) {
      const next = String(ev.target?.value ?? '').trim();
      if (!potOpts.includes(next)) return;
      const perf = computedPerfRating(employeeId);
      data.upsertTalentCell(employeeId, perf, next);
    }

    function pickEmp(e) {
      const m = matrixRow(e.id) || { potential: 'M' };
      tagEmp.value = e;
      tagForm.performance = computedPerfRating(e.id);
      tagForm.potential = m.potential;
      tagModal.value = true;
    }

    function pickEmpById(employeeId) {
      const e = data.employees.find((x) => x.id === employeeId);
      if (e) pickEmp(e);
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
      auth, data, perfOpts, perfOptsGridOrder, potOpts, potOrder, potColOrder, perfRowOrder, cell, potLabel, posName, succPosOption, succNames,
      employeePotential, onPotentialChange, onPotentialChangeById,
      scopeRootDeptUi, deptScopeOptions, scopeHint,
      successionPlansScoped, positionsForSucc, positionsForSuccModal, employeesForSuccModal,
      perfModal, perfEmp, perfThreeYears, openPerfHistory, openPerfHistoryById, fromPerfOpenTag,
      tagModal, tagEmp, tagForm, pickEmp, pickEmpById, saveTag,
      succModal, succForm, succMulti, editSucc, openSuccCreate, saveSucc,
      hpCols, hpGroupSpans, highPotRows, onDevPlanBlur, onNotesBlur,
      hoursClass: (v) => window.TM.attendance?.hoursClass(v) || '',
    };
  },
};
})();
