(function () {
  const { computed, onMounted, onUnmounted, ref, watch } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useHrScopeStore = window.TM.useHrScopeStore;
  const useProductLineStore = window.TM.useProductLineStore;
  const createOrgScopeBindings = window.TM.createOrgScopeBindings;
  const loadEcharts = window.TM.loadEcharts;

  /** Post-graduation work experience buckets (not tenure at company); 5+ years split into bands */
  const WORK_EXP_BUCKETS = ['<1 yr', '1–3 yr', '3–5 yr', '5–8 yr', '8–12 yr', '12–15 yr', '15+ yr'];

  function workExpBucket(years) {
    const y = Number(years) || 0;
    if (y < 1) return '<1 yr';
    if (y < 3) return '1–3 yr';
    if (y < 5) return '3–5 yr';
    if (y < 8) return '5–8 yr';
    if (y < 12) return '8–12 yr';
    if (y < 15) return '12–15 yr';
    return '15+ yr';
  }

  /** QA role: job name exactly "QA" (SDET counts as dev, not QA) */
  function isTestRoleName(name) {
    return String(name || '').trim() === 'QA';
  }

  /** Dev roles: Frontend, Mobile, Backend, SDET (Algorithm / Big Data excluded) */
  function isDevRoleName(name) {
    const n = String(name || '').trim();
    if (n === 'QA') return false;
    return n === 'Frontend' || n === 'Mobile' || n === 'Backend' || n === 'SDET';
  }

  window.TM.HrbpAnalytics = {
    name: 'HrbpAnalytics',
    components: { CustomChartCard: window.TM.CustomChartCard },
    template: `
    <div class="hrbp-analytics-embed">
      <div class="card pad org-scope-bar">
        <div class="org-scope-row">
          <label class="field inline org-scope-select">
            <span><i class="fa-solid fa-sitemap"></i> Organization scope</span>
            <select v-model.number="scopeRootDeptUi" class="input">
              <option :value="0">Product line</option>
              <option v-for="opt in deptScopeOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
            </select>
          </label>
          <label class="field inline org-scope-select">
            <span><i class="fa-solid fa-arrow-up-wide-short"></i> Rank</span>
            <select v-model="analyticsRankFilter" class="input" title="Filters work experience and hire year charts">
              <option value="">All ranks</option>
              <option v-for="lv in levelOptions" :key="'rk-' + lv" :value="lv">{{ lv }}</option>
            </select>
          </label>
          <p class="muted small org-scope-hint">{{ scopeHint }}</p>

          <!-- Customize charts panel -->
          <div class="col-picker-wrap" style="margin-left:auto">
            <button type="button" :class="['btn btn-ghost btn-sm chart-customize-btn', showCustomizePanel && 'btn-active']" @click.stop="showCustomizePanel = !showCustomizePanel">
              <i class="fa-solid fa-sliders"></i> Customize
            </button>
            <div v-if="showCustomizePanel" class="col-picker-panel chart-pref-panel" @click.stop>
              <div class="col-picker-header">
                <span><i class="fa-solid fa-sliders"></i> Chart preferences</span>
                <button class="col-picker-close" @click="showCustomizePanel = false">✕</button>
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
                <button type="button" class="btn btn-primary btn-sm" @click="showCustomizePanel=false; showAddChart=true">
                  <i class="fa-solid fa-plus"></i> Add custom chart
                </button>
              </div>
            </div>
            <div v-if="showCustomizePanel" class="col-picker-overlay" @click="showCustomizePanel=false"></div>
          </div>
        </div>
      </div>

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
      <div class="grid-2">
        <template v-if="chartPrefs.isVisible('anl-trade-hc')">
          <div class="card pad">
            <div class="chart-card-header">
              <h3 class="section-title">各工种在岗人数</h3>
              <button type="button" class="chart-hide-btn" @click="chartPrefs.toggleVisibility('anl-trade-hc')" title="Hide"><i class="fa-solid fa-eye-slash"></i></button>
            </div>
            <p class="muted small">统计当前组织范围内的<strong>在职</strong>员工（不含离职）；工种取编制岗位名称。受上方<strong>职级</strong>筛选影响。</p>
            <div ref="cTradeHc" class="chart-box"></div>
          </div>
        </template>
        <div v-else class="card pad chart-hidden-placeholder" @click="chartPrefs.toggleVisibility('anl-trade-hc')">
          <i class="fa-solid fa-chart-bar muted"></i><span class="muted">各工种在岗人数</span><span class="chart-show-hint">Click to show</span>
        </div>

        <template v-if="chartPrefs.isVisible('anl-level-hc')">
          <div class="card pad">
            <div class="chart-card-header">
              <h3 class="section-title">各职级在岗人数</h3>
              <button type="button" class="chart-hide-btn" @click="chartPrefs.toggleVisibility('anl-level-hc')" title="Hide"><i class="fa-solid fa-eye-slash"></i></button>
            </div>
            <p class="muted small">柱顶数字为人数与占<strong>范围内在职总人数</strong>的比例。受组织范围与职级筛选影响。</p>
            <div ref="cLevelHc" class="chart-box"></div>
          </div>
        </template>
        <div v-else class="card pad chart-hidden-placeholder" @click="chartPrefs.toggleVisibility('anl-level-hc')">
          <i class="fa-solid fa-chart-bar muted"></i><span class="muted">各职级在岗人数</span><span class="chart-show-hint">Click to show</span>
        </div>
      </div>

      <template v-if="chartPrefs.isVisible('anl-avg-tenure')">
        <div class="card pad">
          <div class="chart-card-header">
            <h3 class="section-title">平均工作年限（按维度）</h3>
            <button type="button" class="chart-hide-btn" @click="chartPrefs.toggleVisibility('anl-avg-tenure')" title="Hide"><i class="fa-solid fa-eye-slash"></i></button>
          </div>
          <p class="muted small">按<strong>参加工作日期</strong>起算（与同页「Work experience」分布一致，缺省按规则推算）。<strong>产品线</strong>维度对比各产品线全员，不受左侧部门子树限制；<strong>团队 / 工种 / 绩效 / 职级</strong>维度受组织范围与职级筛选影响。</p>
          <label class="field inline org-scope-select" style="margin-bottom:0.75rem">
            <span><i class="fa-solid fa-layer-group"></i> 分析维度</span>
            <select v-model="avgTenureDimension" class="input">
              <option value="product_line">产品线</option>
              <option value="team">团队（部门）</option>
              <option value="trade">工种</option>
              <option value="last_perf">最近一次已定档绩效</option>
              <option value="rank">职级</option>
            </select>
          </label>
          <div ref="cAvgTenureDim" class="chart-box"></div>
        </div>
      </template>
      <div v-else class="card pad chart-hidden-placeholder" @click="chartPrefs.toggleVisibility('anl-avg-tenure')">
        <i class="fa-solid fa-chart-line muted"></i><span class="muted">平均工作年限（按维度）</span><span class="chart-show-hint">Click to show</span>
      </div>

      <div class="grid-2">
        <template v-if="chartPrefs.isVisible('anl-work-exp')">
          <div class="card pad">
            <div class="chart-card-header">
              <h3 class="section-title">Work experience (since career start)</h3>
              <button type="button" class="chart-hide-btn" @click="chartPrefs.toggleVisibility('anl-work-exp')" title="Hide"><i class="fa-solid fa-eye-slash"></i></button>
            </div>
            <p class="muted small">Based on <strong>career start date</strong> (not company tenure). If missing, approximated from birthday + 22 years. Click a bar for the list.</p>
            <div class="rank-btn-row">
              <button
                v-for="lv in workExpLevelOptions"
                :key="'we-' + lv"
                type="button"
                :class="['rank-btn', workExpRankFilter === lv && 'rank-btn-active']"
                @click="workExpRankFilter = (workExpRankFilter === lv ? '' : lv)"
              >{{ lv }}</button>
              <button
                v-if="workExpRankFilter"
                type="button"
                class="rank-btn rank-btn-clear"
                @click="workExpRankFilter = ''"
              ><i class="fa-solid fa-xmark"></i> All ranks</button>
            </div>
            <div ref="cTenure" class="chart-box"></div>
          </div>
        </template>
        <div v-else class="card pad chart-hidden-placeholder" @click="chartPrefs.toggleVisibility('anl-work-exp')">
          <i class="fa-solid fa-chart-bar muted"></i><span class="muted">Work experience</span><span class="chart-show-hint">Click to show</span>
        </div>

        <template v-if="chartPrefs.isVisible('anl-dev-qa')">
          <div class="card pad">
            <div class="chart-card-header">
              <h3 class="section-title">Dev : QA ratio</h3>
              <button type="button" class="chart-hide-btn" @click="chartPrefs.toggleVisibility('anl-dev-qa')" title="Hide"><i class="fa-solid fa-eye-slash"></i></button>
            </div>
            <p class="muted small">By <strong>job function name</strong>: dev = Frontend / Mobile / Backend / SDET; QA = QA only; Algorithm and Big Data count toward neither. Active employees only.</p>
            <div class="devtest-summary">
              <span>Dev <b>{{ devTest.dev }}</b></span>
              <span>QA <b>{{ devTest.test }}</b></span>
              <span v-if="devTest.test > 0" class="devtest-ratio">Ratio <b>{{ devTest.resultText }}</b></span>
              <span v-else class="muted">No active QA roles; ratio hidden</span>
            </div>
            <div ref="cDevTest" class="chart-box short"></div>
          </div>
        </template>
        <div v-else class="card pad chart-hidden-placeholder" @click="chartPrefs.toggleVisibility('anl-dev-qa')">
          <i class="fa-solid fa-chart-pie muted"></i><span class="muted">Dev : QA ratio</span><span class="chart-show-hint">Click to show</span>
        </div>
      </div>

      <div class="grid-2">
        <template v-if="chartPrefs.isVisible('anl-hire-year')">
          <div class="card pad">
            <div class="chart-card-header">
              <h3 class="section-title">Hire year distribution</h3>
              <button type="button" class="chart-hide-btn" @click="chartPrefs.toggleVisibility('anl-hire-year')" title="Hide"><i class="fa-solid fa-eye-slash"></i></button>
            </div>
            <p class="muted small">Active headcount by hire year (independent filter).</p>
            <div ref="cHireYear" class="chart-box"></div>
          </div>
        </template>
        <div v-else class="card pad chart-hidden-placeholder" @click="chartPrefs.toggleVisibility('anl-hire-year')">
          <i class="fa-solid fa-chart-bar muted"></i><span class="muted">Hire year distribution</span><span class="chart-show-hint">Click to show</span>
        </div>

        <template v-if="chartPrefs.isVisible('anl-trend')">
          <div class="card pad">
            <div class="chart-card-header">
              <h3 class="section-title">Hires &amp; exits (demo)</h3>
              <button type="button" class="chart-hide-btn" @click="chartPrefs.toggleVisibility('anl-trend')" title="Hide"><i class="fa-solid fa-eye-slash"></i></button>
            </div>
            <p class="muted small">Fixed demo series; does not change with org scope.</p>
            <div ref="cTrend" class="chart-box"></div>
          </div>
        </template>
        <div v-else class="card pad chart-hidden-placeholder" @click="chartPrefs.toggleVisibility('anl-trend')">
          <i class="fa-solid fa-chart-line muted"></i><span class="muted">Hires &amp; exits</span><span class="chart-show-hint">Click to show</span>
        </div>
      </div>

      <!-- Custom charts added by user (only visible ones) -->
      <template v-if="visibleCustomCharts.length">
        <div class="custom-charts-section">
          <h3 class="section-title" style="margin-top:1.5rem;margin-bottom:.5rem">
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
        </div>
      </template>

      <div v-if="tenureModalOpen" class="modal-backdrop" @click.self="tenureModalOpen = false">
        <div class="modal card wide">
          <h3>Work experience · {{ tenureModalBucket }}</h3>
          <p class="muted small">{{ tenureModalRows.length }} active employee(s)</p>
          <table class="data-table compact" v-if="tenureModalRows.length">
            <thead>
              <tr><th>Name</th><th>Department</th><th>Job function</th><th>Level</th><th>Career start</th><th>Experience</th></tr>
            </thead>
            <tbody>
              <tr v-for="e in tenureModalRows" :key="e.id">
                <td>{{ e.name }}</td>
                <td>{{ deptLabel(e.departmentId) }}</td>
                <td>{{ posLabel(e.positionId) }}</td>
                <td>{{ levelLabel(e.positionId) }}</td>
                <td>{{ careerStartDisplay(e) }}</td>
                <td>{{ formatWorkExpLabel(e) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted">No employees in this band</p>
          <button type="button" class="btn btn-primary" style="margin-top:1rem" @click="tenureModalOpen = false">Close</button>
        </div>
      </div>
    </div>
  `,
    setup() {
      const data = useDataStore();
      const hrScope = useHrScopeStore();
      const chartPrefs = window.TM.chartPrefs;
      const orgScope = createOrgScopeBindings(data, hrScope);
      const {
        scopeDeptIds,
        scopeRootDeptUi,
        deptScopeOptions,
        scopeHint,
      } = orgScope;
      const zs = window.TM.useZoneScope(data);
      function employeeInScope(emp) {
        if (!zs.employeeInTeam(emp)) return false;
        return orgScope.employeeInScope(emp);
      }
      const cTenure = ref(null);
      const cHireYear = ref(null);
      const cTrend = ref(null);
      const cDevTest = ref(null);
      const cTradeHc = ref(null);
      const cLevelHc = ref(null);
      const cAvgTenureDim = ref(null);

      /** Shared rank filter for hire year + other analytics charts */
      const analyticsRankFilter = ref('');
      /** Independent rank filter for work experience chart only */
      const workExpRankFilter = ref('');
      const avgTenureDimension = ref('team');
      const productLine = useProductLineStore();
      const charts = [];

      const tenureModalOpen = ref(false);
      const tenureModalBucket = ref('');
      const tenureModalRows = ref([]);

      // Customize panel state
      const showCustomizePanel = ref(false);
      const showAddChart = ref(false);
      const newChart = ref({ title: '', groupBy: 'rank', chartType: 'bar', scope: 'active' });

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

      let workExpBucketMembers = {};
      let chTenure;
      let chHireYear;
      let chTrend;
      let chDevTest;
      let chTradeHc;
      let chLevelHc;
      let chAvgTenureDim;
      let echartsLib;
      let unsubStore;

      const devTest = computed(() => {
        const posMap = data._posMap;
        const emps = data.employees.filter((e) => e.status !== 'leave' && employeeInScope(e));
        let dev = 0;
        let test = 0;
        emps.forEach((e) => {
          const nm = posMap.get(e.positionId)?.name || '';
          if (isTestRoleName(nm)) test += 1;
          else if (isDevRoleName(nm)) dev += 1;
        });
        return {
          dev,
          test,
          resultText: test > 0 ? (dev / test).toFixed(1) : '—',
        };
      });

      function activeEmps() {
        return data.employees.filter((e) => e.status !== 'leave' && employeeInScope(e));
      }

      function scopedEmps() {
        let list = activeEmps();
        const lv = analyticsRankFilter.value;
        if (lv) {
          const posMap = data._posMap;
          list = list.filter((e) => {
            const p = posMap.get(e.positionId);
            return p && String(p.level).trim() === lv;
          });
        }
        return list;
      }

      const levelOptions = computed(() => {
        const posMap = data._posMap;
        const set = new Set();
        activeEmps().forEach((e) => {
          const p = posMap.get(e.positionId);
          if (p && p.level != null && String(p.level).trim() !== '') set.add(String(p.level).trim());
        });
        return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
      });

      const workExpLevelOptions = levelOptions;

      function empsForTenure() {
        let list = activeEmps();
        const lv = workExpRankFilter.value;
        if (lv) {
          const posMap = data._posMap;
          list = list.filter((e) => {
            const p = posMap.get(e.positionId);
            return p && String(p.level).trim() === lv;
          });
        }
        return list;
      }

      function empsForHireYear() {
        return scopedEmps();
      }

      function deptLabel(id) {
        return data._deptMap.get(id)?.name || '—';
      }
      function posLabel(id) {
        return data._posMap.get(id)?.name || '—';
      }
      function levelLabel(pid) {
        return data._posMap.get(pid)?.level || '—';
      }

      /** 员工最近一次已定档绩效等级（按周期优先） */
      function lastFinalizedGrade(employeeId) {
        const mine = (data._reviewsByEmp.get(Number(employeeId)) || []).filter((r) =>
          r.status === 'finalized' && String(r.finalGrade || '').trim());
        if (!mine.length) return null;
        mine.sort((a, b) => {
          const c = (Number(b.cycleId) || 0) - (Number(a.cycleId) || 0);
          if (c !== 0) return c;
          return (Number(b.id) || 0) - (Number(a.id) || 0);
        });
        return String(mine[0].finalGrade).trim();
      }

      function workExperienceYearsForChart(e) {
        const tf = window.TM.tenureFormat;
        if (tf && typeof tf.workExperienceYears === 'function') return tf.workExperienceYears(e);
        const d = e.careerStartDate || e.hireDate;
        if (!d) return 0;
        const t = new Date(String(d).slice(0, 10));
        if (Number.isNaN(t.getTime())) return 0;
        return (Date.now() - t.getTime()) / (365.25 * 24 * 3600 * 1000);
      }

      function formatWorkExpLabel(e) {
        const tf = window.TM.tenureFormat;
        if (tf && typeof tf.workExperienceLabel === 'function') return tf.workExperienceLabel(e);
        const y = workExperienceYearsForChart(e);
        return `${(Math.round(y * 10) / 10).toFixed(1)} yr`;
      }

      function careerStartDisplay(e) {
        const tf = window.TM.tenureFormat;
        const ymd = tf && typeof tf.effectiveCareerStartYmd === 'function'
          ? tf.effectiveCareerStartYmd(e)
          : String(e.careerStartDate || e.hireDate || '').slice(0, 10);
        return ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : '—';
      }

      function drawTenure() {
        if (!chTenure || !cTenure.value) return;
        workExpBucketMembers = {};
        WORK_EXP_BUCKETS.forEach((b) => { workExpBucketMembers[b] = []; });
        empsForTenure().forEach((e) => {
          const y = workExperienceYearsForChart(e);
          const b = workExpBucket(y);
          if (workExpBucketMembers[b]) workExpBucketMembers[b].push(e);
        });
        const tenureCounts = WORK_EXP_BUCKETS.map((b) => workExpBucketMembers[b].length);
        const tenureTotal = tenureCounts.reduce((a, b) => a + b, 0);
        chTenure.setOption({
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: 40, right: 20, top: 36, bottom: 40 },
          xAxis: {
            type: 'category',
            data: WORK_EXP_BUCKETS,
            axisLabel: { color: '#64748b', interval: 0, rotate: 28 },
          },
          yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed' } } },
          series: [{
            type: 'bar',
            name: 'Headcount',
            data: tenureCounts,
            itemStyle: { color: '#8b5cf6', borderRadius: [6, 6, 0, 0] },
            cursor: 'pointer',
            barMaxWidth: 50,
            label: {
              show: true, position: 'top', fontSize: 11, fontWeight: 600,
              formatter: function (p) {
                if (!p.value) return '';
                var pct = tenureTotal ? ((p.value / tenureTotal) * 100).toFixed(1) : '0';
                return p.value + '\n' + pct + '%';
              },
            },
          }],
        }, true);
      }

      function drawHireYear() {
        if (!chHireYear) return;
        const hireYearCount = {};
        empsForHireYear().forEach((e) => {
          const h = window.TM.tenureFormat?.effectiveHireYmd(e) ?? e.hireDate;
          if (!h) return;
          const y = new Date(h.slice(0, 10)).getFullYear();
          if (!Number.isNaN(y)) hireYearCount[y] = (hireYearCount[y] || 0) + 1;
        });
        const hireYears = Object.keys(hireYearCount).map(Number).sort((a, b) => a - b);
        chHireYear.setOption({
          tooltip: { trigger: 'axis' },
          xAxis: {
            type: 'category',
            data: hireYears.length ? hireYears.map(String) : ['—'],
            axisLabel: { color: '#64748b' },
          },
          yAxis: { type: 'value', minInterval: 1 },
          series: [{
            type: 'bar',
            data: hireYears.length ? hireYears.map((y) => hireYearCount[y]) : [0],
            itemStyle: { color: '#06b6d4', borderRadius: [6, 6, 0, 0] },
          }],
        });
      }

      function drawTrend() {
        if (!chTrend) return;
        const months = ['2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'];
        const onboard = [1, 2, 0, 2, 1, 1];
        const offboard = [0, 1, 0, 0, 1, 0];
        chTrend.setOption({
          tooltip: { trigger: 'axis' },
          legend: { data: ['Hires', 'Exits'] },
          xAxis: { type: 'category', data: months },
          yAxis: { type: 'value' },
          series: [
            { name: 'Hires', type: 'line', data: onboard, smooth: true },
            { name: 'Exits', type: 'line', data: offboard, smooth: true },
          ],
        });
      }

      function drawDevTest() {
        if (!chDevTest) return;
        const { dev, test } = devTest.value;
        chDevTest.setOption({
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: '10%', right: '8%', bottom: '14%', top: '12%' },
          xAxis: { type: 'category', data: ['Dev', 'QA'], axisLabel: { color: '#64748b' } },
          yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed' } } },
          series: [{
            type: 'bar',
            name: 'Active headcount',
            data: [
              { value: dev, itemStyle: { color: '#6366f1', borderRadius: [6, 6, 0, 0] } },
              { value: test, itemStyle: { color: '#f59e0b', borderRadius: [6, 6, 0, 0] } },
            ],
            barWidth: '40%',
          }],
        });
      }

      function drawTradeHc() {
        if (!chTradeHc) return;
        const trades = window.TM.JOB_TRADES || ['Frontend', 'Mobile', 'Backend', 'SDET', 'QA', 'Algorithm', 'Big Data'];
        const counts = {};
        trades.forEach((t) => { counts[t] = 0; });
        let other = 0;
        const posMap = data._posMap;
        scopedEmps().forEach((e) => {
          const nm = String(posMap.get(e.positionId)?.name || '').trim();
          if (Object.prototype.hasOwnProperty.call(counts, nm)) counts[nm] += 1;
          else other += 1;
        });
        const labels = [...trades];
        const vals = trades.map((t) => counts[t]);
        if (other > 0) {
          labels.push('其他');
          vals.push(other);
        }
        chTradeHc.setOption({
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          xAxis: { type: 'category', data: labels, axisLabel: { color: '#64748b', interval: 0, rotate: 22 } },
          yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed' } } },
          series: [{
            type: 'bar',
            name: '人数',
            data: vals,
            itemStyle: { color: '#0ea5e9', borderRadius: [6, 6, 0, 0] },
          }],
        });
      }

      function drawLevelHc() {
        if (!chLevelHc) return;
        const levels = window.TM.JOB_LEVELS || ['E', 'SE', 'EE', 'SEE', 'AM', 'M', 'PE', 'SM'];
        const list = scopedEmps();
        const total = list.length;
        const counts = {};
        levels.forEach((lv) => { counts[lv] = 0; });
        let other = 0;
        const posMap = data._posMap;
        list.forEach((e) => {
          const lv = String(posMap.get(e.positionId)?.level || '').trim();
          if (Object.prototype.hasOwnProperty.call(counts, lv)) counts[lv] += 1;
          else other += 1;
        });
        const labels = [...levels];
        const vals = levels.map((lv) => counts[lv]);
        if (other > 0) {
          labels.push('其他');
          vals.push(other);
        }
        const labelFmt = (params) => {
          const n = params.value;
          const pct = total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
          return `${n} (${pct}%)`;
        };
        chLevelHc.setOption({
          tooltip: {
            trigger: 'axis',
            formatter(params) {
              const p = params[0];
              const n = p.value;
              const pct = total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
              return `${p.name}<br/>人数：${n}<br/>占比：${pct}%`;
            },
          },
          xAxis: { type: 'category', data: labels, axisLabel: { color: '#64748b' } },
          yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed' } } },
          series: [{
            type: 'bar',
            name: '人数',
            data: vals,
            itemStyle: { color: '#a855f7', borderRadius: [6, 6, 0, 0] },
            label: { show: true, position: 'top', color: '#475569', fontSize: 11, formatter: (p) => labelFmt(p) },
          }],
        });
      }

      function drawAvgTenureDim() {
        if (!chAvgTenureDim) return;
        const dim = avgTenureDimension.value;
        const tf = window.TM.tenureFormat;
        const yfn = (e) => (tf && typeof tf.workExperienceYears === 'function' ? tf.workExperienceYears(e) : workExperienceYearsForChart(e));

        let rows = [];

        if (dim === 'product_line') {
          const loadKeyForLine = window.TM.loadKeyForLine;
          (productLine.lines || []).forEach((line) => {
            const emps = loadKeyForLine(line.id, 'employees') || [];
            const positions = loadKeyForLine(line.id, 'positions') || [];
            let sub = emps.filter((e) => e.status !== 'leave');
            const lv = analyticsRankFilter.value;
            if (lv) {
              sub = sub.filter((e) => {
                const p = positions.find((x) => x.id === e.positionId);
                return p && String(p.level).trim() === lv;
              });
            }
            let avg = 0;
            if (sub.length) {
              let s = 0;
              sub.forEach((e) => { s += yfn(e); });
              avg = Math.round((s / sub.length) * 10) / 10;
            }
            rows.push({ key: `pl-${line.id}`, label: line.name || `产品线 ${line.id}`, avg, n: sub.length });
          });
          rows.sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-Hans-CN'));
        } else if (dim === 'team') {
          const byDept = new Map();
          scopedEmps().forEach((e) => {
            const did = Number(e.departmentId);
            if (!byDept.has(did)) byDept.set(did, []);
            byDept.get(did).push(e);
          });
          rows = Array.from(byDept.entries()).map(([did, emplist]) => ({
            key: `d-${did}`,
            label: deptLabel(did),
            avg: emplist.length ? Math.round((emplist.reduce((s, e) => s + yfn(e), 0) / emplist.length) * 10) / 10 : 0,
            n: emplist.length,
          }));
          rows.sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-Hans-CN'));
        } else if (dim === 'trade') {
          const byT = new Map();
          scopedEmps().forEach((e) => {
            const nm = posLabel(e.positionId);
            if (!byT.has(nm)) byT.set(nm, []);
            byT.get(nm).push(e);
          });
          rows = Array.from(byT.entries()).map(([nm, emplist]) => ({
            key: `t-${nm}`,
            label: nm,
            avg: emplist.length ? Math.round((emplist.reduce((s, e) => s + yfn(e), 0) / emplist.length) * 10) / 10 : 0,
            n: emplist.length,
          }));
          rows.sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-Hans-CN'));
        } else if (dim === 'last_perf') {
          const byG = new Map();
          scopedEmps().forEach((e) => {
            const g = lastFinalizedGrade(e.id);
            const label = g == null ? '无已定档记录' : g;
            if (!byG.has(label)) byG.set(label, []);
            byG.get(label).push(e);
          });
          rows = Array.from(byG.entries()).map(([label, emplist]) => ({
            key: `g-${label}`,
            label,
            avg: emplist.length ? Math.round((emplist.reduce((s, e) => s + yfn(e), 0) / emplist.length) * 10) / 10 : 0,
            n: emplist.length,
          }));
          rows.sort((a, b) => {
            if (a.label === '无已定档记录') return 1;
            if (b.label === '无已定档记录') return -1;
            return String(a.label).localeCompare(String(b.label), 'zh-Hans-CN');
          });
        } else if (dim === 'rank') {
          const byR = new Map();
          scopedEmps().forEach((e) => {
            const lv = levelLabel(e.positionId);
            const label = lv === '—' ? '未填职级' : String(lv);
            if (!byR.has(label)) byR.set(label, []);
            byR.get(label).push(e);
          });
          rows = Array.from(byR.entries()).map(([label, emplist]) => ({
            key: `r-${label}`,
            label,
            avg: emplist.length ? Math.round((emplist.reduce((s, e) => s + yfn(e), 0) / emplist.length) * 10) / 10 : 0,
            n: emplist.length,
          }));
          const order = window.TM.JOB_LEVELS || [];
          rows.sort((a, b) => {
            const ia = order.indexOf(a.label);
            const ib = order.indexOf(b.label);
            if (ia >= 0 || ib >= 0) {
              if (ia < 0 && ib < 0) return String(a.label).localeCompare(String(b.label), 'zh-Hans-CN');
              if (ia < 0) return 1;
              if (ib < 0) return -1;
              return ia - ib;
            }
            return String(a.label).localeCompare(String(b.label), 'zh-Hans-CN');
          });
        }

        const labels = rows.map((r) => r.label);
        const avgs = rows.map((r) => r.avg);
        const ns = rows.map((r) => r.n);

        chAvgTenureDim.setOption({
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter(params) {
              const p = params[0];
              const i = p.dataIndex;
              return `${p.name}<br/>平均工作年限：${avgs[i]} 年<br/>人数：${ns[i]}`;
            },
          },
          grid: { left: '12%', right: '12%', bottom: '8%', top: '6%', containLabel: true },
          xAxis: { type: 'value', name: '年', splitLine: { lineStyle: { type: 'dashed' } } },
          yAxis: {
            type: 'category',
            data: labels.length ? labels : ['—'],
            inverse: true,
            axisLabel: { color: '#64748b', width: 120, overflow: 'truncate' },
          },
          series: [{
            type: 'bar',
            name: '平均年限',
            data: labels.length ? avgs : [0],
            itemStyle: { color: '#22c55e', borderRadius: [0, 6, 6, 0] },
            label: {
              show: true,
              position: 'right',
              color: '#475569',
              fontSize: 11,
              formatter: (p) => {
                const i = p.dataIndex;
                const n = ns[i] != null ? ns[i] : 0;
                return `${p.value} 年 (n=${n})`;
              },
            },
          }],
        });
      }

      function bindTenureClick() {
        if (!chTenure) return;
        chTenure.off('click');
        chTenure.on('click', (params) => {
          if (params.componentType !== 'series') return;
          const name = params.name;
          if (!name || !workExpBucketMembers[name]) return;
          tenureModalBucket.value = name;
          tenureModalRows.value = [...workExpBucketMembers[name]].sort((a, b) => a.name.localeCompare(b.name, 'en'));
          tenureModalOpen.value = true;
        });
      }

      function ensureChart(instance, domRef) {
        if (!echartsLib || !domRef) return null;
        if (instance && instance.getDom() === domRef && !instance.isDisposed?.()) return instance;
        if (instance && !instance.isDisposed?.()) { try { instance.dispose(); } catch (_) {} }
        var c = echartsLib.init(domRef);
        if (charts.indexOf(instance) >= 0) charts.splice(charts.indexOf(instance), 1);
        charts.push(c);
        return c;
      }

      function redrawAll() {
        chTradeHc = ensureChart(chTradeHc, cTradeHc.value);
        chLevelHc = ensureChart(chLevelHc, cLevelHc.value);
        chTenure = ensureChart(chTenure, cTenure.value);
        chHireYear = ensureChart(chHireYear, cHireYear.value);
        chDevTest = ensureChart(chDevTest, cDevTest.value);
        chAvgTenureDim = ensureChart(chAvgTenureDim, cAvgTenureDim.value);
        chTrend = ensureChart(chTrend, cTrend.value);
        drawTenure();
        drawHireYear();
        drawDevTest();
        drawTradeHc();
        drawLevelHc();
        drawAvgTenureDim();
      }

      function safeInit(domRef) {
        return domRef ? echartsLib.init(domRef) : null;
      }

      let _resizeHandler = null;

      onMounted(async () => {
        echartsLib = await loadEcharts();
        chTenure = safeInit(cTenure.value);
        chHireYear = safeInit(cHireYear.value);
        chTrend = safeInit(cTrend.value);
        chDevTest = safeInit(cDevTest.value);
        chTradeHc = safeInit(cTradeHc.value);
        chLevelHc = safeInit(cLevelHc.value);
        chAvgTenureDim = safeInit(cAvgTenureDim.value);
        [chTenure, chHireYear, chTrend, chDevTest, chTradeHc, chLevelHc, chAvgTenureDim]
          .forEach((c) => { if (c) charts.push(c); });

        bindTenureClick();
        drawTrend();
        redrawAll();

        let _redrawTimer = null;
        function debouncedRedraw() {
          if (_redrawTimer) clearTimeout(_redrawTimer);
          _redrawTimer = setTimeout(() => { _redrawTimer = null; redrawAll(); }, 200);
        }

        watch(analyticsRankFilter, () => { debouncedRedraw(); });
        watch(workExpRankFilter, () => { drawTenure(); });
        watch(avgTenureDimension, () => { drawAvgTenureDim(); });
        watch(() => productLine.lines?.length, () => { debouncedRedraw(); });
        watch(levelOptions, (opts) => {
          if (analyticsRankFilter.value && !opts.includes(analyticsRankFilter.value)) {
            analyticsRankFilter.value = '';
          }
          if (workExpRankFilter.value && !opts.includes(workExpRankFilter.value)) {
            workExpRankFilter.value = '';
          }
        });

        unsubStore = data.$subscribe(() => { debouncedRedraw(); });

        watch(() => hrScope.scopeRootDepartmentId, () => { debouncedRedraw(); });

        watch(() => chartPrefs.hidden.slice(), () => {
          Vue.nextTick(() => { debouncedRedraw(); });
        });

        let _resizeTimer = null;
        _resizeHandler = () => {
          if (_resizeTimer) clearTimeout(_resizeTimer);
          _resizeTimer = setTimeout(() => { _resizeTimer = null; charts.forEach((c) => c.resize()); }, 200);
        };
        window.addEventListener('resize', _resizeHandler);
      });

      onUnmounted(() => {
        if (typeof unsubStore === 'function') unsubStore();
        if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
        charts.forEach((c) => c.dispose());
      });

      return {
        cTenure, cHireYear, cTrend, cDevTest, cTradeHc, cLevelHc, cAvgTenureDim,
        scopeRootDeptUi, deptScopeOptions, scopeHint,
        analyticsRankFilter, workExpRankFilter, avgTenureDimension, levelOptions, workExpLevelOptions, devTest,
        tenureModalOpen, tenureModalBucket, tenureModalRows,
        deptLabel, posLabel, levelLabel, formatWorkExpLabel, careerStartDisplay,
        chartPrefs, showCustomizePanel, showAddChart, newChart, saveCustomChart, visibleCustomCharts,
      };
    },
  };
})();
