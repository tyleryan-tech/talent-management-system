(function () {
  const { computed, onMounted, ref, watch } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useHrScopeStore = window.TM.useHrScopeStore;
  const createOrgScopeBindings = window.TM.createOrgScopeBindings;
  const loadEcharts = window.TM.loadEcharts;

  function parseHeaderToYm(h, defaultYear) {
    const s = String(h).trim().replace(/^\uFEFF/, '').replace(/\s/g, '');
    let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    m = s.match(/^(\d{4})年(\d{1,2})月?$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    m = s.match(/^(\d{4})\.(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})月$/);
    if (m && defaultYear) return `${defaultYear}-${m[1].padStart(2, '0')}`;
    return null;
  }

  function inferDefaultYearFromHeaders(headers) {
    let y = 0;
    headers.forEach((h) => {
      const ym = parseHeaderToYm(h, new Date().getFullYear());
      if (ym) {
        const yy = Number(ym.slice(0, 4));
        if (yy > y) y = yy;
      }
    });
    return y || new Date().getFullYear();
  }

  function normalizeYmCell(val, defaultYear) {
    const s = String(val).trim();
    const fromH = parseHeaderToYm(s, defaultYear);
    if (fromH) return fromH;
    return null;
  }

  function collectChildDeptIds(rootId, departments) {
    const ids = new Set([Number(rootId)]);
    let added = true;
    while (added) {
      added = false;
      (departments || []).forEach((d) => {
        if (d.parentId != null && ids.has(Number(d.parentId)) && !ids.has(Number(d.id))) {
          ids.add(Number(d.id));
          added = true;
        }
      });
    }
    return ids;
  }

  function quarterMonths(year, q) {
    const y = Number(year);
    const qi = Number(q);
    const start = (qi - 1) * 3 + 1;
    return [0, 1, 2].map((i) => `${y}-${String(start + i).padStart(2, '0')}`);
  }

  function yearMonths(year) {
    const y = String(year);
    return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  }

  function periodMonths(period, monthVal, yearVal, qVal) {
    if (period === 'month') return [monthVal];
    if (period === 'quarter') return quarterMonths(yearVal, qVal);
    if (period === 'year') return yearMonths(yearVal);
    return [];
  }

  function getRecordAvgDaily(data, eid, ym) {
    const r = data.attendanceRecords.find((x) => x.employeeId === eid && x.month === ym);
    if (!r || r.avgDailyHours == null || Number.isNaN(Number(r.avgDailyHours))) return null;
    return Number(r.avgDailyHours);
  }

  function employeePeriodAvgDaily(data, eid, months) {
    const vals = [];
    months.forEach((ym) => {
      const v = getRecordAvgDaily(data, eid, ym);
      if (v != null) vals.push(v);
    });
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  }

  function teamMeanPeriodAvgDaily(data, employeeIds, months) {
    const perPerson = [];
    employeeIds.forEach((eid) => {
      const a = employeePeriodAvgDaily(data, eid, months);
      if (a != null) perPerson.push(a);
    });
    if (!perPerson.length) return null;
    return Math.round((perPerson.reduce((x, y) => x + y, 0) / perPerson.length) * 100) / 100;
  }

  function parseAvgHoursTable(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
    if (!lines.length) return [];
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(sep).map((c) => c.trim().replace(/^"|"$/g, '').replace(/^\uFEFF/, ''));
    const lower = (h) => String(h).toLowerCase().replace(/\s/g, '');
    const isIdCol = (h, i) => {
      const k = lower(h);
      return k === '工号' || k === 'staffid' || k === 'employeeid' || k === 'id' || (i === 0 && /工号|编号|staff|employee|id/i.test(h));
    };
    const isNameCol = (h) => /姓名|name/i.test(h);
    const isMonthCol = (h) => /月|month|ym|period/i.test(h) && !/工时|小时|平均/.test(h);
    const isHoursCol = (h) => /平均工时|日均|每天|工时|小时|avg|hours/i.test(h);

    let idIdx = headers.findIndex((h, i) => isIdCol(h, i));
    if (idIdx < 0) idIdx = 0;
    const nameIdx = headers.findIndex((h) => isNameCol(h));
    const defY = inferDefaultYearFromHeaders(headers);
    const monthColIdxs = [];
    headers.forEach((h, i) => {
      if (i === idIdx || i === nameIdx) return;
      const ym = parseHeaderToYm(h, defY);
      if (ym) monthColIdxs.push({ i, ym });
    });

    const out = [];
    if (monthColIdxs.length) {
      for (let li = 1; li < lines.length; li += 1) {
        const cells = lines[li].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
        const rawId = cells[idIdx];
        if (rawId == null || rawId === '') continue;
        const employeeId = Number(String(rawId).replace(/\D/g, '') || rawId);
        if (Number.isNaN(employeeId)) continue;
        const name = nameIdx >= 0 ? cells[nameIdx] : '';
        monthColIdxs.forEach(({ i, ym }) => {
          const v = parseFloat(String(cells[i] || '').replace(/,/g, ''));
          if (!Number.isNaN(v) && v >= 0) out.push({ employeeId, name, ym, avgDailyHours: v });
        });
      }
      return out;
    }

    const mi = headers.findIndex((h) => isMonthCol(h));
    const hi = headers.findIndex((h) => isHoursCol(h));
    if (mi < 0 || hi < 0) return [];
    for (let li = 1; li < lines.length; li += 1) {
      const cells = lines[li].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
      const rawId = cells[idIdx];
      if (rawId == null || rawId === '') continue;
      const employeeId = Number(String(rawId).replace(/\D/g, '') || rawId);
      if (Number.isNaN(employeeId)) continue;
      const name = nameIdx >= 0 ? cells[nameIdx] : '';
      const ym = normalizeYmCell(cells[mi], defY);
      const v = parseFloat(String(cells[hi] || '').replace(/,/g, ''));
      if (!ym || Number.isNaN(v) || v < 0) continue;
      out.push({ employeeId, name, ym, avgDailyHours: v });
    }
    return out;
  }

  function parseAvgHoursJson(text) {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    const out = [];
    const defY = new Date().getFullYear();
    arr.forEach((o) => {
      if (!o || typeof o !== 'object') return;
      const employeeId = Number(o.employeeId ?? o['Staff ID'] ?? o.工号);
      if (Number.isNaN(employeeId)) return;
      const name = o.name ?? o['Display Name'] ?? o.姓名 ?? '';
      if (o.ym && o.avgDailyHours != null) {
        const ym = normalizeYmCell(o.ym, defY);
        const v = Number(o.avgDailyHours);
        if (ym && !Number.isNaN(v) && v >= 0) out.push({ employeeId, name, ym, avgDailyHours: v });
        return;
      }
      Object.keys(o).forEach((k) => {
        const ym = parseHeaderToYm(k, defY);
        if (!ym) return;
        const v = Number(o[k]);
        if (!Number.isNaN(v) && v >= 0) out.push({ employeeId, name, ym, avgDailyHours: v });
      });
    });
    return out;
  }

  window.TM.HrbpAttendance = {
    name: 'HrbpAttendance',
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
        <h3 class="section-title">Attendance & working-time rules</h3>
        <p class="muted small">Standard day length = end time − start time. Imported <strong>average daily hours</strong> are compared to that standard to derive load ratio and band (using the limits below).</p>
        <form class="form-grid" @submit.prevent="saveRules">
          <label class="field"><span>Work start</span><input v-model="rules.workStart" type="time" required /></label>
          <label class="field"><span>Work end</span><input v-model="rules.workEnd" type="time" required /></label>
          <label class="field"><span>Standard working days per month</span><input v-model.number="rules.monthlyStandardDays" type="number" min="1" max="31" step="1" required /></label>
          <label class="field"><span>Load ratio lower bound (below = under-loaded)</span><input v-model.number="rules.loadBandLow" type="number" min="0.5" max="1" step="0.01" required /></label>
          <label class="field"><span>Load ratio upper bound (above = over-loaded)</span><input v-model.number="rules.loadBandHigh" type="number" min="1" max="2" step="0.01" required /></label>
          <label class="field full"><span>Leave types (English keys, comma-separated)</span>
            <input v-model="leaveTypesStr" />
          </label>
          <button type="submit" class="btn btn-primary">Save rules & recalculate</button>
        </form>
        <p class="muted small load-legend">
          <span class="tag load-under">Under-loaded</span> daily hours clearly below the standard day;
          <span class="tag load-normal">Normal</span> between the bounds;
          <span class="tag load-over">Over-loaded</span> daily hours clearly above the standard day.
        </p>
      </section>

      <section class="card pad">
        <h3 class="section-title">Import monthly average hours</h3>
        <p class="muted small">Columns: <strong>Staff ID</strong>, <strong>Name</strong> (optional, for checks), and <strong>per-month average daily hours</strong> (hours/day). Supports <strong>wide</strong> sheets (one column per month, e.g. 2025-01) or <strong>long</strong> format (Staff ID, Name, Month, Avg hours). Multiple months in one import are split automatically.</p>
        <div class="toolbar wrap">
          <label class="btn btn-primary file-label">
            Choose file & import
            <input type="file" accept=".csv,.txt,.json,text/csv,application/json" class="hidden-file" @change="onFile" />
          </label>
          <button type="button" class="btn btn-secondary" @click="downloadTemplate">Download CSV template (wide)</button>
        </div>
        <p class="muted small">JSON arrays are also accepted, e.g. <code>{ "employeeId": 1005, "2025-01": 9.2, "2025-02": 8.8 }</code> or <code>{ "ym":"2025-01", "avgDailyHours": 9 }</code> with the same staff id field names as in CSV.</p>
      </section>

      <section class="card pad">
        <h3 class="section-title">Employee engagement (hours)</h3>
        <p class="muted small">Based on imported <strong>average daily hours</strong>; view by month, quarter average, or year average (months without data are skipped).</p>
        <div class="toolbar wrap" style="align-items:flex-end">
          <label class="field inline"><span>Employee</span>
            <select v-model.number="engEmpId" class="input">
              <option v-for="e in scopedActiveEmployees" :key="e.id" :value="e.id">{{ e.name }} ({{ e.id }})</option>
            </select>
          </label>
          <label class="field inline"><span>Period</span>
            <select v-model="engPeriod" class="input">
              <option value="month">Single month</option>
              <option value="quarter">Quarter average</option>
              <option value="year">Year average</option>
            </select>
          </label>
          <label v-if="engPeriod === 'month'" class="field inline"><span>Month</span>
            <select v-model="engMonth" class="input"><option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</option></select>
          </label>
          <template v-if="engPeriod === 'quarter'">
            <label class="field inline"><span>Year</span>
              <select v-model.number="engQYear" class="input"><option v-for="y in yearOptions" :key="'qy'+y" :value="y">{{ y }}</option></select>
            </label>
            <label class="field inline"><span>Quarter</span>
              <select v-model.number="engQuarter" class="input">
                <option :value="1">Q1</option><option :value="2">Q2</option><option :value="3">Q3</option><option :value="4">Q4</option>
              </select>
            </label>
          </template>
          <label v-if="engPeriod === 'year'" class="field inline"><span>Year</span>
            <select v-model.number="engYearOnly" class="input"><option v-for="y in yearOptions" :key="'ey'+y" :value="y">{{ y }}</option></select>
          </label>
        </div>
        <p v-if="engEmpResult != null"><strong>Avg daily hours (selected period)</strong>: {{ engEmpResult }} h/day</p>
        <p v-else class="muted small">No imported data for the selected period.</p>
        <div ref="engChartRef" class="chart-box short"></div>
      </section>

      <section class="card pad">
        <h3 class="section-title">Team engagement (hours)</h3>
        <p class="muted small">For the selected team (including sub-departments), <strong>mean</strong> daily hours: average each person’s months with data in the period, then average across people who have data.</p>
        <div class="toolbar wrap" style="align-items:flex-end">
          <label class="field inline"><span>Team</span>
            <select v-model.number="teamDeptId" class="input">
              <option :value="0">All in scope</option>
              <option v-for="d in teamDeptOptions" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
          </label>
          <label class="field inline"><span>Period</span>
            <select v-model="teamPeriod" class="input">
              <option value="month">Single month</option>
              <option value="quarter">Quarter average</option>
              <option value="year">Year average</option>
            </select>
          </label>
          <label v-if="teamPeriod === 'month'" class="field inline"><span>Month</span>
            <select v-model="teamMonth" class="input"><option v-for="m in monthOptions" :key="'tm'+m" :value="m">{{ m }}</option></select>
          </label>
          <template v-if="teamPeriod === 'quarter'">
            <label class="field inline"><span>Year</span>
              <select v-model.number="teamQYear" class="input"><option v-for="y in yearOptions" :key="'tqy'+y" :value="y">{{ y }}</option></select>
            </label>
            <label class="field inline"><span>Quarter</span>
              <select v-model.number="teamQuarter" class="input">
                <option :value="1">Q1</option><option :value="2">Q2</option><option :value="3">Q3</option><option :value="4">Q4</option>
              </select>
            </label>
          </template>
          <label v-if="teamPeriod === 'year'" class="field inline"><span>Year</span>
            <select v-model.number="teamYearOnly" class="input"><option v-for="y in yearOptions" :key="'ty'+y" :value="y">{{ y }}</option></select>
          </label>
        </div>
        <p v-if="teamEngResult != null"><strong>Team mean daily hours</strong>: {{ teamEngResult }} h/day ({{ teamSampleCount }} with data)</p>
        <p v-else class="muted small">No imported data for this team and period.</p>
        <div ref="teamChartRef" class="chart-box short"></div>
      </section>

      <section class="card pad">
        <h3 class="section-title">Load summary</h3>
        <div class="toolbar inline">
          <select v-model="month" class="input" @change="onMonthChange">
            <option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</option>
          </select>
          <button v-if="hasPunchInMonth" type="button" class="btn btn-ghost btn-sm" @click="recompute">Recalculate from punches</button>
        </div>
        <p v-if="hasPunchInMonth" class="muted small">Punch data for this month will replace imported daily averages when you recalculate.</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee</th><th>Department</th><th>Avg daily (h)</th><th>Punch days</th><th>Std. days</th>
              <th>Actual month hours (h)</th><th>Expected month hours (h)</th><th>Load ratio</th><th>Load band</th><th>Late count</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in summaryRows" :key="r.employeeId + '-' + r.month">
              <td>{{ empName(r.employeeId) }}</td>
              <td>{{ deptOfEmp(r.employeeId) }}</td>
              <td>{{ displayAvgDaily(r) != null ? displayAvgDaily(r) : '—' }}</td>
              <td>{{ r.presentDays != null ? r.presentDays : '—' }}</td>
              <td>{{ r.workDays }}</td>
              <td>{{ r.actualWorkHours != null ? r.actualWorkHours : '—' }}</td>
              <td>{{ r.expectedMonthHours != null ? r.expectedMonthHours : '—' }}</td>
              <td>{{ r.loadRatio != null ? r.loadRatio : '—' }}</td>
              <td><span v-if="r.loadTier" :class="['tag', tierClass(r.loadTier)]">{{ tierLabel(r.loadTier) }}</span><span v-else class="muted">—</span></td>
              <td>{{ r.lateCount != null ? r.lateCount : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card pad">
        <h3 class="section-title">Leave / OT approvals</h3>
        <table class="data-table">
          <thead>
            <tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th>Approver</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr v-for="l in leaveRowsScoped" :key="l.id">
              <td>{{ empName(l.employeeId) }}</td>
              <td>{{ typeLabel(l.type) }}</td>
              <td>{{ l.startDate }} ~ {{ l.endDate }}</td>
              <td class="cell-clip">{{ l.reason }}</td>
              <td>{{ empName(l.approverId) }}</td>
              <td><span class="tag" :data-st="l.status">{{ statusLabel(l.status) }}</span></td>
            </tr>
          </tbody>
        </table>
      </section>
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
      } = createOrgScopeBindings(data, hrScope);

      const rules = ref({
        workStart: '09:30',
        workEnd: '18:30',
        monthlyStandardDays: 20,
        loadBandLow: 0.88,
        loadBandHigh: 1.12,
        leaveTypes: [],
        labels: {},
        ...data.attendanceRules,
      });
      const leaveTypesStr = ref((data.attendanceRules.leaveTypes || []).join(', '));

      const leaveRowsScoped = computed(() =>
        data.leaveRequests.filter((l) => {
          const emp = data.employees.find((e) => e.id === l.employeeId);
          return emp && employeeInScope(emp);
        }),
      );

      const monthSet = computed(() => {
        const s = new Set();
        data.punchRecords.forEach((p) => {
          if (p.date && p.date.length >= 7) s.add(p.date.slice(0, 7));
        });
        data.attendanceRecords.forEach((r) => {
          if (r.month) s.add(r.month);
        });
        const arr = [...s].sort();
        if (!arr.length) arr.push(new Date().toISOString().slice(0, 7));
        return arr;
      });

      const month = ref(
        data.attendanceRecords[0]?.month
          || data.punchRecords[0]?.date?.slice(0, 7)
          || monthSet.value[0],
      );

      const monthOptions = computed(() => {
        const s = new Set(monthSet.value);
        s.add(month.value);
        return [...s].sort();
      });

      const yearOptions = computed(() => {
        const ys = new Set();
        monthSet.value.forEach((m) => ys.add(Number(m.slice(0, 4))));
        const y0 = new Date().getFullYear();
        [y0 - 1, y0, y0 + 1].forEach((y) => ys.add(y));
        return [...ys].sort((a, b) => a - b);
      });

      const hasPunchInMonth = computed(() =>
        data.punchRecords.some((p) => String(p.date).startsWith(month.value)),
      );

      const scopedActiveEmployees = computed(() =>
        data.employees.filter((e) => e.status !== 'leave' && employeeInScope(e)).sort((a, b) => a.id - b.id),
      );

      const teamDeptOptions = computed(() => {
        const set = scopeDeptIds.value;
        return data.departments.filter((d) => set == null || set.has(Number(d.id)));
      });

      const engEmpId = ref(null);
      const engPeriod = ref('month');
      const engMonth = ref(month.value);
      const engQYear = ref(new Date().getFullYear());
      const engQuarter = ref(1);
      const engYearOnly = ref(new Date().getFullYear());

      const teamDeptId = ref(0);
      const teamPeriod = ref('month');
      const teamMonth = ref(month.value);
      const teamQYear = ref(new Date().getFullYear());
      const teamQuarter = ref(1);
      const teamYearOnly = ref(new Date().getFullYear());

      watch(scopedActiveEmployees, (list) => {
        if (!list.length) return;
        if (engEmpId.value == null || !list.some((e) => e.id === engEmpId.value)) {
          engEmpId.value = list[0].id;
        }
      }, { immediate: true });

      watch(monthOptions, (opts) => {
        if (!opts.includes(engMonth.value)) engMonth.value = opts[opts.length - 1];
        if (!opts.includes(teamMonth.value)) teamMonth.value = opts[opts.length - 1];
      }, { immediate: true });

      function empIdsInTeamDept(deptId) {
        let emps = scopedActiveEmployees.value;
        if (deptId != null && deptId !== 0) {
          const sub = collectChildDeptIds(deptId, data.departments);
          emps = emps.filter((e) => sub.has(Number(e.departmentId)));
        }
        return emps.map((e) => e.id);
      }

      const engMonthsList = computed(() => {
        if (engPeriod.value === 'month') return periodMonths('month', engMonth.value, null, null);
        if (engPeriod.value === 'quarter') return periodMonths('quarter', null, engQYear.value, engQuarter.value);
        return periodMonths('year', null, engYearOnly.value, null);
      });

      const engEmpResult = computed(() => {
        if (engEmpId.value == null) return null;
        return employeePeriodAvgDaily(data, engEmpId.value, engMonthsList.value);
      });

      const teamMonthsList = computed(() => {
        if (teamPeriod.value === 'month') return periodMonths('month', teamMonth.value, null, null);
        if (teamPeriod.value === 'quarter') return periodMonths('quarter', null, teamQYear.value, teamQuarter.value);
        return periodMonths('year', null, teamYearOnly.value, null);
      });

      const teamEngStats = computed(() => {
        const ids = empIdsInTeamDept(teamDeptId.value);
        const per = [];
        ids.forEach((eid) => {
          const a = employeePeriodAvgDaily(data, eid, teamMonthsList.value);
          if (a != null) per.push(a);
        });
        const mean = per.length
          ? Math.round((per.reduce((x, y) => x + y, 0) / per.length) * 100) / 100
          : null;
        return { mean, n: per.length };
      });

      const teamEngResult = computed(() => teamEngStats.value.mean);
      const teamSampleCount = computed(() => teamEngStats.value.n);

      const summaryRows = computed(() => {
        const emps = data.employees.filter((e) => e.status !== 'leave' && employeeInScope(e));
        return emps.map((emp) => {
          const r = data.attendanceRecords.find((x) => x.employeeId === emp.id && x.month === month.value);
          if (r) return r;
          return {
            employeeId: emp.id,
            month: month.value,
            workDays: rules.value.monthlyStandardDays || 20,
            presentDays: null,
            actualWorkHours: null,
            expectedMonthHours: null,
            loadRatio: null,
            loadTier: null,
            lateCount: null,
            avgDailyHours: null,
          };
        });
      });

      const engChartRef = ref(null);
      const teamChartRef = ref(null);
      let engChartInst;
      let teamChartInst;

      async function drawEngChart() {
        const echarts = await loadEcharts();
        if (!engChartRef.value || engEmpId.value == null) return;
        if (!engChartInst) engChartInst = echarts.init(engChartRef.value);
        const months = engMonthsList.value;
        const vals = months.map((ym) => getRecordAvgDaily(data, engEmpId.value, ym));
        const hasAny = vals.some((v) => v != null);
        if (!hasAny) {
          engChartInst.setOption({
            title: { text: 'No data', left: 'center', top: 'center', textStyle: { color: '#94a3b8', fontSize: 13 } },
            xAxis: { show: false },
            yAxis: { show: false },
            series: [],
          });
          return;
        }
        engChartInst.setOption({
          title: { show: false },
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: months, axisLabel: { color: '#64748b' } },
          yAxis: { type: 'value', name: 'h/day', splitLine: { lineStyle: { type: 'dashed' } } },
          series: [{
            type: 'line',
            smooth: true,
            data: vals.map((v) => (v == null ? null : v)),
            connectNulls: false,
            itemStyle: { color: '#6366f1' },
          }],
        });
      }

      async function drawTeamChart() {
        const echarts = await loadEcharts();
        if (!teamChartRef.value) return;
        if (!teamChartInst) teamChartInst = echarts.init(teamChartRef.value);
        const months = teamMonthsList.value;
        const ids = empIdsInTeamDept(teamDeptId.value);
        const seriesData = months.map((ym) => teamMeanPeriodAvgDaily(data, ids, [ym]));
        const hasAny = seriesData.some((v) => v != null);
        if (!hasAny) {
          teamChartInst.setOption({
            title: { text: 'No data', left: 'center', top: 'center', textStyle: { color: '#94a3b8', fontSize: 13 } },
            xAxis: { show: false },
            yAxis: { show: false },
            series: [],
          });
          return;
        }
        teamChartInst.setOption({
          title: { show: false },
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: months, axisLabel: { color: '#64748b' } },
          yAxis: { type: 'value', name: 'Mean h/day', splitLine: { lineStyle: { type: 'dashed' } } },
          series: [{
            type: 'bar',
            data: seriesData.map((v) => (v == null ? null : v)),
            itemStyle: { color: '#0ea5e9', borderRadius: [4, 4, 0, 0] },
          }],
        });
      }

      watch([
        () => data.attendanceRecords.length,
        engEmpId,
        engPeriod,
        engMonth,
        engQYear,
        engQuarter,
        engYearOnly,
        teamDeptId,
        teamPeriod,
        teamMonth,
        teamQYear,
        teamQuarter,
        teamYearOnly,
      ], () => {
        drawEngChart();
        drawTeamChart();
      }, { deep: true });

      function displayAvgDaily(r) {
        if (r.avgDailyHours != null && !Number.isNaN(Number(r.avgDailyHours))) {
          return Math.round(Number(r.avgDailyHours) * 100) / 100;
        }
        if (r.presentDays > 0 && r.actualWorkHours != null) {
          return Math.round((r.actualWorkHours / r.presentDays) * 100) / 100;
        }
        return null;
      }

      function empName(id) {
        return data.employees.find((e) => e.id === id)?.name || id;
      }
      function deptOfEmp(eid) {
        const e = data.employees.find((x) => x.id === eid);
        if (!e) return '-';
        return data.departments.find((d) => d.id === e.departmentId)?.name || '-';
      }
      function typeLabel(t) {
        return data.attendanceRules.labels?.[t] || t;
      }
      function statusLabel(s) {
        return { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[s] || s;
      }
      function tierLabel(t) {
        return { under: 'Under-loaded', normal: 'Normal', over: 'Over-loaded' }[t] || t;
      }
      function tierClass(t) {
        return { under: 'load-under', normal: 'load-normal', over: 'load-over' }[t] || '';
      }

      function recompute() {
        data.recomputeAttendanceFromPunches(month.value);
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Recalculated from punches: ' + month.value, type: 'success' } }));
      }

      function onMonthChange() {
        if (hasPunchInMonth.value) {
          data.recomputeAttendanceFromPunches(month.value);
        }
      }

      function saveRules() {
        const types = leaveTypesStr.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
        const labels = { ...rules.value.labels };
        types.forEach((t) => { if (!labels[t]) labels[t] = t; });
        data.saveAttendanceRules({
          workStart: rules.value.workStart,
          workEnd: rules.value.workEnd,
          monthlyStandardDays: rules.value.monthlyStandardDays,
          loadBandLow: rules.value.loadBandLow,
          loadBandHigh: rules.value.loadBandHigh,
          leaveTypes: types,
          labels,
        });
        rules.value = { ...rules.value, ...data.attendanceRules };
        leaveTypesStr.value = (data.attendanceRules.leaveTypes || []).join(', ');
        data.refreshImportedAttendanceMetrics();
        if (data.punchRecords.some((p) => String(p.date).startsWith(month.value))) {
          data.recomputeAttendanceFromPunches(month.value);
        }
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Rules saved', type: 'success' } }));
      }

      function downloadTemplate() {
        const csv = '\uFEFFStaff ID,Name,2025-01,2025-02,2025-03\n1005,Sample,9.2,9.0,8.8\n1006,Sample 2,8.5,8.6,\n';
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'monthly_avg_hours_template.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      }

      function onFile(ev) {
        const file = ev.target.files?.[0];
        ev.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            let rows = [];
            const text = reader.result;
            if (file.name.endsWith('.json') || text.trim().startsWith('[')) {
              rows = parseAvgHoursJson(text);
            } else {
              rows = parseAvgHoursTable(text);
            }
            if (!rows.length) throw new Error('No valid rows (need staff ID + month + average hours)');
            const set = scopeDeptIds.value;
            let nameMismatch = 0;
            const filtered = rows.filter((row) => {
              const eid = Number(row.employeeId);
              const emp = data.employees.find((e) => e.id === eid);
              if (!emp) return false;
              if (set != null && !set.has(Number(emp.departmentId))) return false;
              if (row.name && String(emp.name).trim() !== String(row.name).trim()) nameMismatch += 1;
              return true;
            });
            if (!filtered.length) throw new Error('No valid rows: staff ID missing or out of org scope');
            data.importAttendanceAvgDailyHours(filtered);
            const yms = [...new Set(filtered.map((r) => r.ym))].sort();
            if (yms.length) month.value = yms[yms.length - 1];
            let msg = `Wrote ${filtered.length} employee-month average-hour row(s)`;
            if (nameMismatch) msg += ` (${nameMismatch} name mismatch vs roster; imported by staff ID)`;
            window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: msg, type: 'success' } }));
          } catch (err) {
            window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Import failed: ' + err.message, type: 'error' } }));
          }
        };
        reader.readAsText(file, 'UTF-8');
      }

      onMounted(() => {
        rules.value = { ...rules.value, ...data.attendanceRules };
        if (!rules.value.monthlyStandardDays) rules.value.monthlyStandardDays = 20;
        if (rules.value.loadBandLow == null) rules.value.loadBandLow = 0.88;
        if (rules.value.loadBandHigh == null) rules.value.loadBandHigh = 1.12;
        if (data.punchRecords.some((p) => String(p.date).startsWith(month.value))) {
          data.recomputeAttendanceFromPunches(month.value);
        }
        drawEngChart();
        drawTeamChart();
        window.addEventListener('resize', () => {
          engChartInst?.resize();
          teamChartInst?.resize();
        });
      });

      return {
        data,
        rules,
        leaveTypesStr,
        month,
        monthOptions,
        yearOptions,
        hasPunchInMonth,
        scopeDeptIds,
        scopeRootDeptUi,
        deptScopeOptions,
        scopeHint,
        summaryRows,
        leaveRowsScoped,
        scopedActiveEmployees,
        teamDeptOptions,
        engEmpId,
        engPeriod,
        engMonth,
        engQYear,
        engQuarter,
        engYearOnly,
        engEmpResult,
        engChartRef,
        teamDeptId,
        teamPeriod,
        teamMonth,
        teamQYear,
        teamQuarter,
        teamYearOnly,
        teamEngResult,
        teamSampleCount,
        teamChartRef,
        empName,
        deptOfEmp,
        typeLabel,
        statusLabel,
        tierLabel,
        tierClass,
        displayAvgDaily,
        saveRules,
        downloadTemplate,
        onFile,
        recompute,
        onMonthChange,
      };
    },
  };
})();
