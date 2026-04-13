(function () {
  const { computed, ref, watch } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useHrScopeStore = window.TM.useHrScopeStore;
  const createOrgScopeBindings = window.TM.createOrgScopeBindings;
  const att = window.TM.attendance;

  function ensureXLSX() {
    if (typeof XLSX === 'undefined') throw new Error('Excel library failed to load. Check your network and refresh.');
    return XLSX;
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

  const PUNCH_SCHEMA = [
    { key: 'employeeId', label: '工号', aliases: ['工号','Staff ID','Employee ID','Badge No','员工编号','ID','staffId'], keywords: ['工号','staff','employee','id','badge','编号'], required: true },
    { key: 'date', label: '日期', aliases: ['日期','Date','Punch Date','打卡日期','考勤日期','Attendance Date'], keywords: ['日期','date','punch','考勤'], required: true },
    { key: 'time', label: '打卡时间', aliases: ['时间','打卡时间','Punch Time','Clock Time','Time','签到时间','刷卡时间'], keywords: ['时间','time','clock','punch','签到','刷卡'], required: true },
  ];

  function splitDatetime(val) {
    const s = String(val || '').trim();
    let m = s.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s*[T ]\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (m) return { date: m[1].replace(/\//g, '-'), time: m[2] };
    return null;
  }

  function normalizeDate(val) {
    if (val instanceof Date && !Number.isNaN(val.getTime())) return val.toISOString().slice(0, 10);
    const s = String(val || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) {
      const parts = s.split('/');
      return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
    }
    if (typeof val === 'number' && val > 20000) {
      const utc = Math.round((val - 25569) * 86400 * 1000);
      const d = new Date(utc);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return s;
  }

  function normalizeTime(val) {
    const s = String(val || '').trim();
    const m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
    if (typeof val === 'number' && val >= 0 && val < 1) {
      const totalMins = Math.round(val * 24 * 60);
      return `${String(Math.floor(totalMins / 60)).padStart(2,'0')}:${String(totalMins % 60).padStart(2,'0')}`;
    }
    return s;
  }

  window.TM.HrbpAttendance = {
    name: 'HrbpAttendance',
    components: { FieldMapDialog: window.TM.FieldMapDialog },
    template: `
    <div class="page-stack">
      <FieldMapDialog
        :visible="fmapVisible"
        :mapping="fmapMapping"
        :fileHeaders="fmapHeaders"
        :title="fmapTitle"
        @confirm="fmapOnConfirm"
        @cancel="fmapVisible = false"
      />
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

      <div class="card pad">
        <h2 class="section-title">考勤分析</h2>
        <div class="recruit-tabs">
          <button type="button" :class="['btn','btn-sm', tab==='overview' ? 'btn-primary':'btn-ghost']" @click="tab='overview'"><i class="fa-solid fa-building"></i> 概览 & 团队</button>
          <button type="button" :class="['btn','btn-sm', tab==='employee' ? 'btn-primary':'btn-ghost']" @click="tab='employee'"><i class="fa-solid fa-user"></i> 员工视图</button>
        </div>
      </div>

      <!-- ══════════ OVERVIEW + TEAM TAB ══════════ -->
      <div v-show="tab==='overview'" class="page-stack-inner">
        <div class="card pad">
          <h3 class="section-title">数据上传</h3>
          <p class="muted small" style="margin-bottom:8px">上传考勤系统导出的原始打卡 Excel 文件。系统自动识别字段（工号、日期、打卡时间），计算每天出勤时长 = 当天最后一次打卡 − 第一次打卡。</p>
          <div class="toolbar wrap" style="gap:8px">
            <label v-if="auth.hasPermission('att.import')" class="btn btn-primary btn-sm file-label">
              <i class="fa-solid fa-upload"></i> 上传打卡数据 (Excel/CSV)
              <input type="file" accept=".xlsx,.xls,.csv" class="hidden-file" @change="onUpload" />
            </label>
            <button type="button" class="btn btn-ghost btn-sm" @click="downloadTemplate"><i class="fa-solid fa-download"></i> 下载模板</button>
            <span class="muted small" style="margin-left:8px">当前共 <strong>{{ punchCount }}</strong> 条打卡记录，覆盖 <strong>{{ punchEmpCount }}</strong> 名员工</span>
          </div>
        </div>

        <div class="att-summary-cards">
          <div class="att-card">
            <div class="att-card-label">数据范围</div>
            <div class="att-card-value">{{ dataRange }}</div>
          </div>
          <div class="att-card">
            <div class="att-card-label">覆盖员工</div>
            <div class="att-card-value">{{ punchEmpCount }} 人</div>
          </div>
          <div class="att-card">
            <div class="att-card-label">上月平均出勤</div>
            <div class="att-card-value" :class="hoursClass(overviewMonthAvg)">{{ overviewMonthAvg != null ? overviewMonthAvg + ' h' : '—' }}</div>
          </div>
          <div class="att-card">
            <div class="att-card-label">过去6个月平均</div>
            <div class="att-card-value" :class="hoursClass(overview6mAvg)">{{ overview6mAvg != null ? overview6mAvg + ' h' : '—' }}</div>
          </div>
        </div>

        <!-- Color legend -->
        <div class="card pad" style="padding-top:8px;padding-bottom:8px">
          <span class="muted small" style="margin-right:8px">色阶：</span>
          <span class="tag hours-t5">≥11h</span>
          <span class="tag hours-t4">10.5-11h</span>
          <span class="tag" style="border:1px solid #cbd5e1">10-10.5h</span>
          <span class="tag hours-t2">9.5-10h</span>
          <span class="tag hours-t1">&lt;9.5h</span>
        </div>

        <!-- Team drill-down -->
        <div class="card pad">
          <h3 class="section-title">团队出勤分析</h3>
          <div class="att-breadcrumb">
            <button type="button" class="att-bc-item" :class="{ active: !teamDrillStack.length }" @click="teamDrillReset">
              <i class="fa-solid fa-building"></i> {{ productLineName }}
            </button>
            <template v-for="(bc, i) in teamDrillStack" :key="bc.id">
              <span class="att-bc-sep">›</span>
              <button type="button" class="att-bc-item" :class="{ active: i === teamDrillStack.length - 1 }" @click="teamDrillTo(i)">{{ bc.name }}</button>
            </template>
          </div>
          <div class="toolbar wrap" style="margin-top:8px;gap:8px">
            <label class="field inline"><span>排序</span>
              <select v-model="teamSortKey" class="input input-sm" style="min-width:100px">
                <option value="month">当月</option>
                <option value="threeMonth">过去3个月</option>
                <option value="sixMonth">过去6个月</option>
              </select>
            </label>
            <button type="button" class="btn btn-ghost btn-sm" @click="teamSortDir = teamSortDir === 'desc' ? 'asc' : 'desc'">
              {{ teamSortDir === 'desc' ? '↓ 降序' : '↑ 升序' }}
            </button>
          </div>
        </div>

        <div class="card pad">
          <div class="table-card att-table-scroll">
          <table class="data-table compact att-team-table">
            <thead>
              <tr>
                <th style="text-align:left">名称</th><th>类型</th>
                <th class="att-sort-th" @click="teamSortKey='month'">当月 <span v-if="teamSortKey==='month'">{{ teamSortDir === 'desc' ? '↓' : '↑' }}</span></th>
                <th class="att-sort-th" @click="teamSortKey='threeMonth'">过去3个月 <span v-if="teamSortKey==='threeMonth'">{{ teamSortDir === 'desc' ? '↓' : '↑' }}</span></th>
                <th class="att-sort-th" @click="teamSortKey='sixMonth'">过去6个月 <span v-if="teamSortKey==='sixMonth'">{{ teamSortDir === 'desc' ? '↓' : '↑' }}</span></th>
                <th>Leader</th><th>Leader 当月</th><th>Leader 6个月</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in teamRowsSorted" :key="row.key"
                :class="{ 'att-row-dept': row.type === 'dept', 'att-row-emp': row.type === 'emp' }"
                @click="row.type === 'dept' ? drillIntoDept(row) : null"
                :style="row.type === 'dept' ? 'cursor:pointer' : ''">
                <td style="text-align:left;font-weight:600">
                  <i v-if="row.type === 'dept'" class="fa-solid fa-folder-open" style="margin-right:4px;color:#64748b"></i>
                  <i v-else class="fa-solid fa-user" style="margin-right:4px;color:#94a3b8"></i>
                  {{ row.name }}
                </td>
                <td class="muted small">{{ row.type === 'dept' ? '部门' : '员工' }}</td>
                <td :class="hoursClass(row.month)">{{ row.month != null ? row.month : '—' }}</td>
                <td :class="hoursClass(row.threeMonth)">{{ row.threeMonth != null ? row.threeMonth : '—' }}</td>
                <td :class="hoursClass(row.sixMonth)">{{ row.sixMonth != null ? row.sixMonth : '—' }}</td>
                <td v-if="row.type === 'dept'" class="muted small">{{ row.leaderName || '—' }}</td>
                <td v-if="row.type === 'dept'" :class="hoursClass(row.leaderMonth)">{{ row.leaderMonth != null ? row.leaderMonth : '—' }}</td>
                <td v-if="row.type === 'dept'" :class="hoursClass(row.leader6m)">{{ row.leader6m != null ? row.leader6m : '—' }}</td>
                <td v-if="row.type === 'emp'" colspan="3"></td>
              </tr>
              <tr v-if="!teamRowsSorted.length"><td colspan="8" class="muted small" style="text-align:center;padding:1.5rem">暂无数据</td></tr>
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <!-- ══════════ EMPLOYEE VIEW TAB ══════════ -->
      <div v-show="tab==='employee'" class="page-stack-inner">
        <div class="card pad">
          <h3 class="section-title">员工出勤分析</h3>
          <p class="muted small" style="margin-bottom:4px">截止上月最后一天。日均出勤 = 所有打卡天数的出勤时长平均值。</p>
          <div style="margin-bottom:8px">
            <span class="tag hours-t5">≥11h</span>
            <span class="tag hours-t4">10.5-11h</span>
            <span class="tag" style="border:1px solid #cbd5e1">10-10.5h</span>
            <span class="tag hours-t2">9.5-10h</span>
            <span class="tag hours-t1">&lt;9.5h</span>
          </div>
          <div class="toolbar wrap" style="gap:8px">
            <label class="field inline"><span>排序</span>
              <select v-model="empSortKey" class="input input-sm" style="min-width:100px">
                <option value="month">当月</option>
                <option value="threeMonth">过去3个月</option>
                <option value="sixMonth">过去6个月</option>
              </select>
            </label>
            <button type="button" class="btn btn-ghost btn-sm" @click="empSortDir = empSortDir === 'desc' ? 'asc' : 'desc'">
              {{ empSortDir === 'desc' ? '↓ 降序' : '↑ 升序' }}
            </button>
          </div>
        </div>
        <div class="card pad">
          <div class="table-card att-table-scroll">
          <table class="data-table compact att-emp-table">
            <thead>
              <tr>
                <th>姓名</th><th>部门</th><th>职级</th>
                <th class="att-sort-th" @click="empSortKey='month'">当月 <span v-if="empSortKey==='month'">{{ empSortDir === 'desc' ? '↓' : '↑' }}</span></th>
                <th class="att-sort-th" @click="empSortKey='threeMonth'">过去3个月 <span v-if="empSortKey==='threeMonth'">{{ empSortDir === 'desc' ? '↓' : '↑' }}</span></th>
                <th class="att-sort-th" @click="empSortKey='sixMonth'">过去6个月 <span v-if="empSortKey==='sixMonth'">{{ empSortDir === 'desc' ? '↓' : '↑' }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in empRowsSorted" :key="row.id" class="att-emp-row" @click="selectEmpDetail(row.id)">
                <td style="font-weight:600">{{ row.name }}</td>
                <td>{{ row.dept }}</td>
                <td><span v-if="row.rank" class="tag tag-level">{{ row.rank }}</span><span v-else class="muted">—</span></td>
                <td :class="hoursClass(row.month)">{{ row.month != null ? row.month : '—' }}</td>
                <td :class="hoursClass(row.threeMonth)">{{ row.threeMonth != null ? row.threeMonth : '—' }}</td>
                <td :class="hoursClass(row.sixMonth)">{{ row.sixMonth != null ? row.sixMonth : '—' }}</td>
              </tr>
              <tr v-if="!empRowsSorted.length"><td colspan="6" class="muted small" style="text-align:center;padding:1.5rem">暂无打卡数据</td></tr>
            </tbody>
          </table>
          </div>
        </div>

        <div v-if="detailEmp" class="card pad">
          <h4 class="section-title">{{ detailEmp.name }} · 每日出勤明细</h4>
          <div class="pivot-filters" style="margin-bottom:8px">
            <label class="pivot-filter-item">
              <span>月份</span>
              <select v-model="detailMonth" class="input input-sm">
                <option v-for="m in detailMonthOptions" :key="m" :value="m">{{ m }}</option>
              </select>
            </label>
          </div>
          <div class="table-card att-table-scroll">
          <table class="data-table compact">
            <thead><tr><th>日期</th><th>首次打卡</th><th>末次打卡</th><th>出勤时长 (h)</th></tr></thead>
            <tbody>
              <tr v-for="d in detailDays" :key="d.date">
                <td>{{ d.date }}</td><td>{{ d.firstIn }}</td><td>{{ d.lastOut }}</td>
                <td :class="hoursClass(d.hours)">{{ d.hours != null ? d.hours : '—' }}</td>
              </tr>
              <tr v-if="!detailDays.length"><td colspan="4" class="muted small" style="text-align:center">该月无打卡记录</td></tr>
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  `,
    setup() {
      const data = useDataStore();
      const auth = window.TM.useAuthStore();
      const hrScope = useHrScopeStore();
      const _orgScope = createOrgScopeBindings(data, hrScope);
      const {
        scopeDeptIds,
        scopeRootDeptUi,
        deptScopeOptions,
        scopeHint,
      } = _orgScope;
      const _zs = window.TM.useZoneScope(data);
      function employeeInScope(emp) {
        if (!_zs.employeeInTeam(emp)) return false;
        return _orgScope.employeeInScope(emp);
      }

      const tab = ref('overview');

      const monthList = computed(() => att.periodMonths('month'));
      const threeMonthList = computed(() => att.periodMonths('3month'));
      const sixMonthList = computed(() => att.periodMonths('6month'));

      const activeEmps = computed(() =>
        data.employees.filter((e) => e.status !== 'leave' && employeeInScope(e)),
      );

      /* ── Field mapper state ── */
      const fmapVisible = ref(false);
      const fmapMapping = ref([]);
      const fmapHeaders = ref([]);
      const fmapTitle = ref('考勤打卡数据 — 字段映射确认');
      let fmapPendingJson = null;

      function fmapOnConfirm(confirmedMapping) {
        fmapVisible.value = false;
        if (fmapPendingJson) commitPunchImport(fmapPendingJson, confirmedMapping);
        fmapPendingJson = null;
      }

      /* ── Upload ── */
      function onUpload(ev) {
        const file = ev.target.files?.[0]; ev.target.value = ''; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const XL = ensureXLSX();
            let json;
            if (/\.csv$/i.test(file.name)) {
              const wb = XL.read(String(reader.result), { type: 'string' });
              json = XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
            } else {
              const wb = XL.read(reader.result, { type: 'array', cellDates: true });
              json = XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
            }
            if (!json || !json.length) { toast('文件为空', 'error'); return; }
            const headers = Object.keys(json[0]);
            const mapping = window.TM.fieldMapper.match(PUNCH_SCHEMA, headers);
            const allExact = mapping.every((m) => !m.header || m.confidence === 'exact');
            if (allExact && mapping.filter((m) => m.header).length >= 2) {
              commitPunchImport(json, mapping);
            } else {
              fmapPendingJson = json;
              fmapHeaders.value = headers;
              fmapMapping.value = mapping;
              fmapVisible.value = true;
            }
          } catch (e) { toast('导入失败: ' + e.message, 'error'); }
        };
        if (/\.csv$/i.test(file.name)) reader.readAsText(file, 'UTF-8'); else reader.readAsArrayBuffer(file);
      }

      function commitPunchImport(json, mapping) {
        const headerToField = {};
        mapping.forEach((m) => { if (m.header) headerToField[m.header] = m.fieldKey; });
        const hasDateCol = Object.values(headerToField).includes('date');
        const hasTimeCol = Object.values(headerToField).includes('time');

        const empIdMap = new Map();
        data.employees.forEach((e) => {
          if (e.staffId) empIdMap.set(String(e.staffId).trim(), e.id);
          empIdMap.set(String(e.id), e.id);
        });

        const rows = [];
        json.forEach((raw) => {
          let eid = null;
          let dateVal = '';
          let timeVal = '';

          Object.keys(raw).forEach((h) => {
            const fk = headerToField[h];
            if (!fk) return;
            if (fk === 'employeeId') {
              const v = String(raw[h] || '').trim().replace(/\D/g, '');
              eid = empIdMap.get(v) || empIdMap.get(String(raw[h]).trim()) || Number(v) || null;
            }
            if (fk === 'date') dateVal = raw[h];
            if (fk === 'time') timeVal = raw[h];
          });

          if (!eid) return;

          if (!hasTimeCol && hasDateCol) {
            const sp = splitDatetime(dateVal);
            if (sp) { dateVal = sp.date; timeVal = sp.time; }
          }
          if (!hasDateCol && !hasTimeCol) {
            Object.keys(raw).forEach((h) => {
              const sp = splitDatetime(raw[h]);
              if (sp && !dateVal) { dateVal = sp.date; timeVal = sp.time; }
            });
          }

          const d = normalizeDate(dateVal);
          const t = normalizeTime(timeVal);
          if (!d || !t) return;
          rows.push({ employeeId: eid, date: d, time: t });
        });

        if (!rows.length) { toast('未解析到有效打卡记录，请检查文件格式', 'error'); return; }
        data.importRawPunches(rows, { replace: true });
        toast(`已导入 ${rows.length} 条打卡记录（覆盖模式）`, 'success');
      }

      function downloadTemplate() {
        try {
          const XL = ensureXLSX();
          const wb = XL.utils.book_new();
          const ws = XL.utils.aoa_to_sheet([
            ['工号', '日期', '打卡时间'],
            [1005, '2026-03-01', '09:02'],
            [1005, '2026-03-01', '18:35'],
            [1005, '2026-03-02', '08:58'],
            [1005, '2026-03-02', '19:10'],
            [1006, '2026-03-01', '09:15'],
            [1006, '2026-03-01', '18:20'],
          ]);
          XL.utils.book_append_sheet(wb, ws, 'Punch');
          XL.writeFile(wb, 'punch_template.xlsx');
        } catch (e) { toast(e.message, 'error'); }
      }

      function toast(msg, type) {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: msg, type } }));
      }

      function empHours(eid, months) {
        return att.empAvgHours(data._attIdx, eid, months);
      }

      /* ── Punch index: compute once, reuse everywhere ── */
      const punchStats = computed(() => {
        const punches = data.punchRecords || [];
        const empSet = new Set();
        let minDate = null, maxDate = null;
        const byEmp = new Map();
        punches.forEach((p) => {
          const eid = Number(p.employeeId);
          empSet.add(eid);
          const d = String(p.date || '').trim();
          if (d.length >= 7) {
            if (!minDate || d < minDate) minDate = d;
            if (!maxDate || d > maxDate) maxDate = d;
          }
          if (!byEmp.has(eid)) byEmp.set(eid, []);
          byEmp.get(eid).push(p);
        });
        return { count: punches.length, empCount: empSet.size, minDate, maxDate, byEmp };
      });

      /* ── Overview stats ── */
      const punchCount = computed(() => punchStats.value.count);
      const punchEmpCount = computed(() => punchStats.value.empCount);
      const dataRange = computed(() => {
        const { minDate, maxDate } = punchStats.value;
        if (!minDate) return '—';
        return minDate.slice(0, 7) + ' ~ ' + maxDate.slice(0, 7);
      });
      const overviewMonthAvg = computed(() => {
        let total = 0, count = 0;
        activeEmps.value.forEach((e) => {
          const v = empHours(e.id, monthList.value);
          if (v != null) { total += v; count++; }
        });
        return count ? Math.round((total / count) * 10) / 10 : null;
      });
      const overview6mAvg = computed(() => {
        let total = 0, count = 0;
        activeEmps.value.forEach((e) => {
          const v = empHours(e.id, sixMonthList.value);
          if (v != null) { total += v; count++; }
        });
        return count ? Math.round((total / count) * 10) / 10 : null;
      });

      /* ── Employee view ── */
      const empSortKey = ref('sixMonth');
      const empSortDir = ref('desc');

      const empRows = computed(() => {
        const dMap = data._deptMap;
        const pMap = data._posMap;
        return activeEmps.value.map((e) => {
          const dept = dMap.get(e.departmentId);
          const pos = pMap.get(e.positionId);
          return {
            id: e.id,
            name: e.name || e.displayName || String(e.id),
            dept: dept?.name || '—',
            rank: pos?.level || e.rank || '',
            month: empHours(e.id, monthList.value),
            threeMonth: empHours(e.id, threeMonthList.value),
            sixMonth: empHours(e.id, sixMonthList.value),
          };
        });
      });

      const empRowsSorted = computed(() => {
        const key = empSortKey.value;
        const dir = empSortDir.value === 'desc' ? -1 : 1;
        return [...empRows.value].sort((a, b) => {
          const va = a[key] ?? -999, vb = b[key] ?? -999;
          return (va - vb) * dir;
        });
      });

      /* ── Employee detail ── */
      const detailEmpId = ref(null);
      const detailEmp = computed(() => {
        if (detailEmpId.value == null) return null;
        return data._empMap.get(detailEmpId.value) || null;
      });

      const detailMonthOptions = computed(() => {
        if (!detailEmpId.value) return [];
        const recs = punchStats.value.byEmp.get(Number(detailEmpId.value)) || [];
        const s = new Set();
        recs.forEach((p) => {
          if (p.date && p.date.length >= 7) s.add(p.date.slice(0, 7));
        });
        return [...s].sort().reverse();
      });

      const detailMonth = ref('');
      watch(detailMonthOptions, (opts) => {
        if (opts.length && !opts.includes(detailMonth.value)) detailMonth.value = opts[0];
      });

      function selectEmpDetail(eid) {
        detailEmpId.value = eid;
        const opts = detailMonthOptions.value;
        if (opts.length) detailMonth.value = opts[0];
      }

      const detailDays = computed(() => {
        if (!detailEmpId.value || !detailMonth.value) return [];
        const eid = Number(detailEmpId.value);
        const prefix = detailMonth.value;
        const empPunches = punchStats.value.byEmp.get(eid) || [];
        const byDate = {};
        empPunches.forEach((p) => {
          const d = String(p.date || '').trim();
          if (!d.startsWith(prefix)) return;
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push(p);
        });
        return Object.keys(byDate).sort().map((date) => {
          const punches = byDate[date];
          const mins = punches.map((p) => att.parsePunchTime(p.time)).filter((m) => !Number.isNaN(m));
          if (mins.length < 2) {
            const only = mins.length === 1;
            const t = only ? punches[0].time : '—';
            return { date, firstIn: t, lastOut: only ? t : '—', hours: null };
          }
          const first = Math.min(...mins);
          const last = Math.max(...mins);
          const fH = String(Math.floor(first / 60)).padStart(2, '0') + ':' + String(first % 60).padStart(2, '0');
          const lH = String(Math.floor(last / 60)).padStart(2, '0') + ':' + String(last % 60).padStart(2, '0');
          const hours = Math.round(((last - first) / 60) * 10) / 10;
          return { date, firstIn: fH, lastOut: lH, hours: hours > 0 ? hours : null };
        });
      });

      /* ── Team view with drill-down ── */
      const productLineName = computed(() => {
        const ls = window.TM.useProductLineStore?.();
        return ls?.currentLine?.name || '产品线';
      });

      const teamDrillStack = ref([]);
      const teamSortKey = ref('sixMonth');
      const teamSortDir = ref('desc');

      function teamDrillReset() { teamDrillStack.value = []; }
      function teamDrillTo(index) { teamDrillStack.value = teamDrillStack.value.slice(0, index + 1); }
      function drillIntoDept(row) {
        if (row.type !== 'dept') return;
        teamDrillStack.value = [...teamDrillStack.value, { id: row.deptId, name: row.name }];
      }

      function deptAvg(deptIds, months) {
        const idx = data._attIdx;
        const monthSet = new Set(months);
        const emps = activeEmps.value.filter((e) => deptIds.has(Number(e.departmentId)));
        let totalH = 0, totalD = 0;
        emps.forEach((e) => {
          const recs = idx.get(e.id) || [];
          recs.forEach((r) => {
            if (monthSet.has(r.month) && r.avgDailyHours != null && r.workDays > 0) {
              totalH += r.avgDailyHours * r.workDays;
              totalD += r.workDays;
            }
          });
        });
        return totalD > 0 ? Math.round((totalH / totalD) * 10) / 10 : null;
      }

      const teamRows = computed(() => {
        const stack = teamDrillStack.value;
        const currentDeptId = stack.length ? stack[stack.length - 1].id : null;

        let childDepts;
        if (currentDeptId == null) {
          const scopeSet = scopeDeptIds.value;
          childDepts = data.departments.filter((d) => {
            if (scopeSet != null && !scopeSet.has(Number(d.id))) return false;
            return d.parentId == null || d.parentId === 0;
          });
        } else {
          childDepts = data.departments.filter((d) => Number(d.parentId) === Number(currentDeptId));
        }

        const rows = [];

        if (childDepts.length > 0) {
          childDepts.forEach((d) => {
            const allIds = collectChildDeptIds(d.id, data.departments);
            const leader = d.managerId ? data._empMap.get(d.managerId) : null;
            rows.push({
              key: 'dept-' + d.id,
              type: 'dept',
              deptId: d.id,
              name: d.name,
              month: deptAvg(allIds, monthList.value),
              threeMonth: deptAvg(allIds, threeMonthList.value),
              sixMonth: deptAvg(allIds, sixMonthList.value),
              leaderName: leader?.name || '',
              leaderMonth: leader ? empHours(leader.id, monthList.value) : null,
              leader6m: leader ? empHours(leader.id, sixMonthList.value) : null,
            });
          });
        }

        if (currentDeptId != null) {
          const directEmps = activeEmps.value.filter((e) => Number(e.departmentId) === Number(currentDeptId));
          directEmps.forEach((e) => {
            rows.push({
              key: 'emp-' + e.id,
              type: 'emp',
              name: e.name || String(e.id),
              month: empHours(e.id, monthList.value),
              threeMonth: empHours(e.id, threeMonthList.value),
              sixMonth: empHours(e.id, sixMonthList.value),
            });
          });
        }

        return rows;
      });

      const teamRowsSorted = computed(() => {
        const key = teamSortKey.value;
        const dir = teamSortDir.value === 'desc' ? -1 : 1;
        const depts = teamRows.value.filter((r) => r.type === 'dept');
        const emps = teamRows.value.filter((r) => r.type === 'emp');
        depts.sort((a, b) => ((a[key] ?? -999) - (b[key] ?? -999)) * dir);
        emps.sort((a, b) => ((a[key] ?? -999) - (b[key] ?? -999)) * dir);
        return [...depts, ...emps];
      });

      function hoursClass(val) { return att.hoursClass(val); }

      return {
        auth, data, tab,
        scopeRootDeptUi, deptScopeOptions, scopeHint,
        fmapVisible, fmapMapping, fmapHeaders, fmapTitle, fmapOnConfirm,
        onUpload, downloadTemplate,
        punchCount, punchEmpCount, dataRange, overviewMonthAvg, overview6mAvg,
        empRows, empRowsSorted, empSortKey, empSortDir,
        selectEmpDetail, detailEmp, detailMonth, detailMonthOptions, detailDays,
        productLineName, teamDrillStack, teamDrillReset, teamDrillTo, drillIntoDept,
        teamRows, teamRowsSorted, teamSortKey, teamSortDir,
        hoursClass,
      };
    },
  };
})();
