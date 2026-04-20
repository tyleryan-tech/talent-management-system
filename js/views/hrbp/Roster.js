(function () {
  const { computed, ref, reactive, watch } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useProductLineStore = window.TM.useProductLineStore;
  const useAuthStore = window.TM.useAuthStore;

/** Excel column headers (English) — import also accepts legacy Chinese keys */
const RCOL = {
  STAFF_ID: 'Staff ID',
  DISPLAY_NAME: 'Display Name',
  TEAM_PATH: 'Team Path',
  TEAM_ID: 'Team ID',
  TEAM: 'Team',
  JOB_FUNCTION_SLOT_ID: 'Job Function Slot ID',
  JOB_FUNCTION: 'Job Function',
  RANK: 'Rank',
  TITLE: 'Title',
  AGE: 'Age',
  PAY_POSITION: 'Pay position',
  SCHOOL: 'School',
  YOE: 'YoE',
  TENURE_IN_CURRENT_RANK: 'Tenure In Current Rank',
  REPORTING_MANAGER: 'Reporting Manager',
  GENDER: 'Gender',
  BIRTHDAY: 'Birthday',
  HIRE_DATE: 'Hire Date',
  CAREER_START_DATE: 'Career Start Date',
  RANK_START_DATE: 'Rank Start Date',
  POTENTIAL: 'Potential',
  MANAGEMENT_PLAN: 'Management Plan',
  STATUS: 'Status',
  STATUS_LABEL: 'Status Label',
  MOBILE: 'Mobile',
  EMAIL: 'Email',
};

function cell(row, ...keys) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k) && row[k] !== undefined && row[k] !== null) {
      return row[k];
    }
  }
  return '';
}

/** Import: fuzzy-mapped Excel column first, then canonical / legacy headers */
const IMPORT_ALIASES = {
  staffId: [RCOL.STAFF_ID, '工号', 'Staff ID'],
  displayName: [RCOL.DISPLAY_NAME, '姓名', 'Display Name'],
  teamPath: [RCOL.TEAM_PATH, '团队路径'],
  teamId: [RCOL.TEAM_ID, '部门ID', 'Team ID'],
  team: [RCOL.TEAM, '部门', 'Team'],
  jobFunctionSlotId: [RCOL.JOB_FUNCTION_SLOT_ID, '工种编制ID', '岗位ID', 'Position ID'],
  jobFunction: [RCOL.JOB_FUNCTION, '工种', '岗位', 'Job Function'],
  rank: [RCOL.RANK, '职级'],
  title: [RCOL.TITLE, '组织角色', 'Title'],
  age: [RCOL.AGE, '年龄', 'Age'],
  payPosition: [RCOL.PAY_POSITION, '薪资段位', 'salaryBand'],
  potential: [RCOL.POTENTIAL, '潜力'],
  managementPlan: [RCOL.MANAGEMENT_PLAN, '管理计划'],
  reportingManager: [RCOL.REPORTING_MANAGER, '汇报经理工号', 'Reporting Manager Staff ID'],
  hireDate: [RCOL.HIRE_DATE, '入职日期'],
  careerStartDate: [RCOL.CAREER_START_DATE, '参加工作日期'],
  rankStartDate: [RCOL.RANK_START_DATE, '现任职级起始日'],
  school: [RCOL.SCHOOL, '毕业院校'],
  status: [RCOL.STATUS, '状态'],
  statusLabel: [RCOL.STATUS_LABEL, '状态说明'],
  gender: [RCOL.GENDER, '性别'],
  birthday: [RCOL.BIRTHDAY, '生日'],
  mobile: [RCOL.MOBILE, '手机'],
  email: [RCOL.EMAIL, '邮箱'],
};

function importCell(row, fieldKey, map) {
  const head = (map && map[fieldKey]) ? [map[fieldKey]] : [];
  const rest = IMPORT_ALIASES[fieldKey] || [];
  return cell(row, ...head, ...rest);
}

function buildImportFieldMap(json) {
  if (!json || !json.length) return {};
  const headers = Object.keys(json[0] || {});
  return window.TM.buildRosterFieldToExcelMap(headers);
}

const statusMap = { active: 'Active', probation: 'Probation', leave: 'Leaving' };
const POT_LABELS = { H: 'High', M: 'Medium', L: 'Low' };
const tenureFmt = () => window.TM.tenureFormat;

function tenureHuman(fromStr) {
  if (!fromStr) return '—';
  const from = new Date(fromStr);
  if (Number.isNaN(from.getTime())) return '—';
  const to = new Date();
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0 && m === 0) return 'Under 1 mo';
  if (y === 0) return `${m} mo`;
  if (m === 0) return `${y} yr`;
  return `${y} yr ${m} mo`;
}

function parsePotentialCell(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === 'H' || s === '高') return 'H';
  if (u === 'M' || s === '中') return 'M';
  if (u === 'L' || s === '低') return 'L';
  return null;
}

function ensureXLSX() {
  if (typeof XLSX === 'undefined') throw new Error('Excel library failed to load. Check your network and refresh.');
  return XLSX;
}

function cellToDateString(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000) {
    const utc = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(utc);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) return s.replace(/\//g, '-').slice(0, 10);
  return s || '';
}

function parseStatus(v) {
  const s = String(v ?? '').trim().toLowerCase();
  const raw = String(v ?? '').trim();
  if (['active', '在职', '正式'].includes(raw) || s === 'active') return 'active';
  if (['probation', '试用期', '试用'].includes(raw) || s === 'probation') return 'probation';
  if (['leave', '离职'].includes(raw) || s === 'leave') return 'leave';
  return 'active';
}

const SALARY_BAND_LABELS = {
  below_min: 'below min',
  p25: 'P25',
  p50: 'P50',
  p75: 'P75',
  above_max: 'above max',
};

function normalizeOrgRole(v) {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'IC' || s === 'PIC' || s === 'RM') return s;
  return '';
}

function parseSalaryBandCell(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  const lo = raw.toLowerCase().replace(/\s+/g, ' ');
  if (lo.includes('below') && lo.includes('min')) return 'below_min';
  if (raw.includes('低于')) return 'below_min';
  if (lo.includes('above') && lo.includes('max')) return 'above_max';
  if (raw.includes('高于')) return 'above_max';
  if (/^p?\s*25$/i.test(raw.trim()) || raw.trim() === '25') return 'p25';
  if (/^p?\s*50$/i.test(raw.trim()) || raw.trim() === '50') return 'p50';
  if (/^p?\s*75$/i.test(raw.trim()) || raw.trim() === '75') return 'p75';
  const compact = lo.replace(/\s/g, '');
  if (compact === 'below_min' || compact === 'belowmin') return 'below_min';
  if (compact === 'above_max' || compact === 'abovemax') return 'above_max';
  if (compact === 'p25') return 'p25';
  if (compact === 'p50') return 'p50';
  if (compact === 'p75') return 'p75';
  return '';
}

function salaryBandDisplay(key) {
  const k = String(key || '').trim();
  return SALARY_BAND_LABELS[k] || '—';
}

function perfStatusEn(s) {
  const m = {
    rm_pending: 'Pending RM review',
    in_approval: 'In approval',
    finalized: 'Archived',
    rejected: 'Rejected',
    self: 'Pending RM review',
    manager: 'In approval',
    hr: 'In approval',
    completed: 'Archived',
  };
  return m[s] || String(s || '—');
}

  /* ── Roster field-mapper schema ── */
  const ROSTER_SCHEMA = [
    { key: 'staffId', label: 'Staff ID', aliases: ['工号','Staff ID','Employee ID','员工编号','ID'], keywords: ['staff','id','工号'], required: false },
    { key: 'displayName', label: 'Display Name', aliases: ['姓名','Display Name','Name','员工姓名','名字'], keywords: ['name','姓名'], required: true },
    { key: 'team', label: 'Team', aliases: ['部门','Team','Department','团队'], keywords: ['team','dept','部门'] },
    { key: 'teamPath', label: 'Team Path', aliases: ['团队路径','Team Path','Org Path'], keywords: ['path','路径'] },
    { key: 'jobFunction', label: 'Job Function', aliases: ['工种','岗位','Job Function','Position','职位'], keywords: ['job','function','岗位','工种'] },
    { key: 'rank', label: 'Rank', aliases: ['职级','Rank','Level','等级'], keywords: ['rank','level','职级'] },
    { key: 'title', label: 'Title/Org Role', aliases: ['组织角色','Title','Org Role','IC','PIC','RM'], keywords: ['title','role','角色'] },
    { key: 'age', label: 'Age', aliases: ['年龄','Age'], keywords: ['age','年龄'] },
    { key: 'gender', label: 'Gender', aliases: ['性别','Gender','Sex'], keywords: ['gender','性别'] },
    { key: 'birthday', label: 'Birthday', aliases: ['生日','Birthday','出生日期','Date of Birth','DOB'], keywords: ['birthday','生日','出生'] },
    { key: 'payPosition', label: 'Salary Band', aliases: ['薪资段位','salaryBand','Pay Position','Salary Band'], keywords: ['salary','pay','薪资'] },
    { key: 'potential', label: 'Potential', aliases: ['潜力','Potential'], keywords: ['potential','潜力'] },
    { key: 'managementPlan', label: 'Management Plan', aliases: ['管理计划','Management Plan'], keywords: ['management','plan','管理'] },
    { key: 'reportingManager', label: 'Reporting Manager', aliases: ['汇报经理工号','Reporting Manager Staff ID','汇报经理','Manager ID'], keywords: ['reporting','manager','汇报','经理'] },
    { key: 'hireDate', label: 'Hire Date', aliases: ['入职日期','Hire Date','Join Date','入职时间'], keywords: ['hire','入职'] },
    { key: 'careerStartDate', label: 'Career Start', aliases: ['参加工作日期','Career Start Date','工作开始日期'], keywords: ['career','start','工作日期'] },
    { key: 'rankStartDate', label: 'Rank Start', aliases: ['现任职级起始日','Rank Start Date','职级起始'], keywords: ['rank start','职级起始'] },
    { key: 'school', label: 'School', aliases: ['毕业院校','School','University','学校'], keywords: ['school','院校','university'] },
    { key: 'status', label: 'Status', aliases: ['状态','Status','Employment Status'], keywords: ['status','状态'] },
    { key: 'statusLabel', label: 'Status Label', aliases: ['状态说明','Status Label','状态备注'], keywords: ['status label','说明'] },
    { key: 'mobile', label: 'Mobile', aliases: ['手机','Mobile','Phone','电话'], keywords: ['mobile','phone','手机'] },
    { key: 'email', label: 'Email', aliases: ['邮箱','Email','E-mail','电子邮件'], keywords: ['email','mail','邮箱'] },
  ];

  window.TM.HrbpRoster = {
  name: 'HrbpRoster',
  components: { FieldMapDialog: window.TM.FieldMapDialog },
  template: `
    <div class="page-stack roster-page-stack">
      <FieldMapDialog
        :visible="rfmapVisible"
        :mapping="rfmapMapping"
        :fileHeaders="rfmapHeaders"
        :title="rfmapTitle"
        @confirm="rfmapOnConfirm"
        @cancel="rfmapVisible = false"
      />
      <div class="card pad roster-toolbar-card">
        <div class="toolbar roster-toolbar-actions">
          <input v-model.trim="q" type="search" class="input search" placeholder="Search name, email, mobile…" />
          <button type="button" :class="['btn btn-sm', showArchived ? 'btn-warning' : 'btn-ghost']" @click="showArchived = !showArchived" :title="showArchived ? '当前显示全部（含已离职），点击隐藏' : '点击查看已离职员工档案'">
            <i :class="['fa-solid', showArchived ? 'fa-eye' : 'fa-archive']"></i>
            {{ showArchived ? '隐藏离职' : '离职存档 (' + archivedCount + ')' }}
          </button>
          <button v-if="hasActiveFilters" type="button" class="btn btn-ghost btn-sm" @click="clearRosterFilters"><i class="fa-solid fa-xmark"></i> Clear filters</button>
          <button v-if="auth.hasPermission('roster.add')" type="button" class="btn btn-primary" @click="openCreate">Add employee</button>
          <button v-if="auth.isHrbp" type="button" class="btn btn-danger" :disabled="!selectedIds.length" @click="batchDeleteEmployees">Delete selected</button>
          <button v-if="auth.hasPermission('roster.export')" type="button" class="btn btn-secondary" @click="exportExcel">Export Excel</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="downloadExcelTemplate">Download import template</button>
          <div class="col-picker-wrap">
            <button type="button" :class="['btn btn-ghost btn-sm', showColPicker ? 'btn-active' : '']" @click.stop="showColPicker = !showColPicker" title="Show/hide columns and adjust order">
              <i class="fa-solid fa-table-columns"></i> Columns <span class="col-picker-count">({{ visibleRosterColumns.length }}/{{ allRosterColumns.length }})</span>
            </button>
            <div v-if="showColPicker" class="col-picker-panel" @click.stop>
              <div class="col-picker-header">
                <span>Column visibility &amp; order</span>
                <button type="button" class="col-picker-close" @click="showColPicker = false">✕</button>
              </div>
              <div class="col-picker-list">
                <div v-for="(col, idx) in allRosterColumns" :key="col.key" class="col-picker-row">
                  <label class="col-picker-check">
                    <input type="checkbox" :checked="col.visible" @change="toggleColumnVisibility(col.key, $event.target.checked)" />
                    <span :class="{ 'col-picker-hidden-label': !col.visible }">{{ col.labelResolved }}</span>
                  </label>
                  <div class="col-picker-move-btns">
                    <button type="button" class="col-th-btn" :disabled="idx === 0" @click="quickMoveColumn(col.key, -1)" title="Move up">↑</button>
                    <button type="button" class="col-th-btn" :disabled="idx === allRosterColumns.length - 1" @click="quickMoveColumn(col.key, 1)" title="Move down">↓</button>
                  </div>
                </div>
              </div>
              <div class="col-picker-footer">
                <button type="button" class="btn btn-ghost btn-sm" @click="showAllColumns">Show all</button>
                <button type="button" class="btn btn-ghost btn-sm" @click="resetColumnSettingsDefault">Reset defaults</button>
              </div>
            </div>
          </div>
          <div v-if="showColPicker" class="col-picker-overlay" @click="showColPicker = false"></div>
          <label v-if="auth.isHrbp" class="btn btn-ghost file-label" title="Use the first row of a spreadsheet to set visible columns, order, and header labels (fuzzy match)">
            Build columns from file
            <input type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="hidden-file" @change="onUploadLayoutHeaders" />
          </label>
          <label v-if="auth.isHrbp" class="btn btn-ghost file-label" title="Append rows; Staff ID conflicts get new IDs; modules sync immediately">
            Append Excel
            <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="hidden-file" @change="appendImportExcel" />
          </label>
          <label v-if="auth.hasPermission('roster.import')" class="btn btn-ghost file-label" title="Replace entire roster with all rows in the file (unlike Append)">
            Replace import Excel
            <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="hidden-file" @change="importExcel" />
          </label>
        </div>
      </div>
      <div class="card table-card roster-scroll">
        <div class="roster-table-viewport">
        <table class="data-table compact">
          <thead>
            <tr>
              <th v-if="auth.isHrbp" class="roster-sel"><input type="checkbox" title="Select all in current filter" :checked="allFilteredSelected" @change="toggleSelectAllFiltered($event.target.checked)" /></th>
              <th v-for="col in visibleRosterColumns" :key="col.key"
                :class="{ 'roster-col-path': col.key === 'teamPath', 'col-th-has-filter': !!colFilterType(col.key) }">
                <div class="col-th-top">
                  <span class="col-th-label">{{ col.labelResolved }}</span>
                  <span class="col-th-actions">
                    <button type="button" class="col-th-btn" @click.stop="quickMoveColumn(col.key, -1)" title="Move left">◀</button>
                    <button type="button" class="col-th-btn" @click.stop="quickMoveColumn(col.key, 1)" title="Move right">▶</button>
                    <button type="button" class="col-th-btn col-th-btn-hide" @click.stop="quickHideColumn(col.key)" title="Hide this column">✕</button>
                  </span>
                </div>
                <template v-if="colFilterType(col.key) === 'dept'">
                  <select v-model="colFilters[col.key]" :class="['col-filter-sel', colFilters[col.key] ? 'col-filter-active' : '']">
                    <option value="">All</option>
                    <option v-for="d in data.departments" :key="d.id" :value="String(d.id)">{{ d.name }}</option>
                  </select>
                </template>
                <template v-else-if="colFilterType(col.key) === 'status'">
                  <select v-model="colFilters[col.key]" :class="['col-filter-sel', colFilters[col.key] ? 'col-filter-active' : '']">
                    <option value="">All</option>
                    <option value="active">Active</option>
                    <option value="probation">Probation</option>
                    <option value="leave">Leaving</option>
                  </select>
                </template>
                <template v-else-if="colFilterType(col.key) === 'potential'">
                  <select v-model="colFilters[col.key]" :class="['col-filter-sel', colFilters[col.key] ? 'col-filter-active' : '']">
                    <option value="">All</option>
                    <option value="H">High (H)</option>
                    <option value="M">Medium (M)</option>
                    <option value="L">Low (L)</option>
                    <option value="__unset__">Not on grid</option>
                  </select>
                </template>
                <template v-else-if="colFilterType(col.key) === 'level'">
                  <select v-model="colFilters[col.key]" :class="['col-filter-sel', colFilters[col.key] ? 'col-filter-active' : '']">
                    <option value="">All</option>
                    <option v-for="lv in levelFilterOptions" :key="lv" :value="lv">{{ lv }}</option>
                  </select>
                </template>
                <template v-else-if="colFilterType(col.key) === 'gender'">
                  <select v-model="colFilters[col.key]" :class="['col-filter-sel', colFilters[col.key] ? 'col-filter-active' : '']">
                    <option value="">All</option>
                    <option value="男">Male</option>
                    <option value="女">Female</option>
                  </select>
                </template>
                <template v-else-if="colFilterType(col.key) === 'title'">
                  <select v-model="colFilters[col.key]" :class="['col-filter-sel', colFilters[col.key] ? 'col-filter-active' : '']">
                    <option value="">All</option>
                    <option value="IC">IC</option>
                    <option value="PIC">PIC</option>
                    <option value="RM">RM</option>
                  </select>
                </template>
                <template v-else-if="colFilterType(col.key) === 'payPosition'">
                  <select v-model="colFilters[col.key]" :class="['col-filter-sel', colFilters[col.key] ? 'col-filter-active' : '']">
                    <option value="">All</option>
                    <option value="below_min">Below min</option>
                    <option value="p25">P25</option>
                    <option value="p50">P50</option>
                    <option value="p75">P75</option>
                    <option value="above_max">Above max</option>
                  </select>
                </template>
                <template v-else-if="colFilterType(col.key) === 'text'">
                  <input v-model="colFilters[col.key]" type="search" class="col-filter-input"
                    :class="{ 'col-filter-active': colFilters[col.key] }" placeholder="filter…" />
                </template>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in filtered" :key="e.id">
              <td v-if="auth.isHrbp" class="roster-sel"><input type="checkbox" :checked="selectedSet.has(e.id)" @change="toggleSelectRow(e.id)" /></td>
              <td v-for="col in visibleRosterColumns" :key="col.key"
                class="roster-td-clip"
                :class="rosterTdClass(col.key)"
                :style="rosterTdStyle(col.key)"
                :title="rosterCellTitle(col.key, e)">
                <template v-if="col.key === 'displayName'">
                  <button type="button" class="linklike" @click="openDetail(e)">{{ e.name }}</button>
                </template>
                <template v-else-if="col.key === 'performance'">
                  <span class="perf-grade-inline"><template v-for="(pg, gi) in perfGradesList(e.id)"><span v-if="gi">, </span><b v-if="pg.annual" class="perf-annual">{{ pg.grade }}</b><span v-else class="perf-half">{{ pg.grade }}</span></template></span>
                </template>
                <template v-else-if="col.key === 'avgHours6m'">
                  <span :class="rosterHoursClass(e.id)">{{ rosterTextCell(col.key, e) }}</span>
                </template>
                <template v-else>{{ rosterTextCell(col.key, e) }}</template>
              </td>
              <td class="row-actions">
                <button v-if="auth.hasPermission('roster.edit')" type="button" class="btn-link" @click="openEdit(e)">Edit</button>
                <button v-if="e.status !== 'leave' && auth.hasPermission('roster.leave')" type="button" class="btn-link danger" @click="doLeave(e)">Mark Leaving</button>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      <div v-if="modal" class="modal-backdrop" @click.self="modal = null">
        <div class="modal card wide">
          <h3>{{ modalMode === 'create' ? 'Add employee' : 'Edit employee' }}</h3>
          <form class="form-grid" @submit.prevent="saveEmployee">
            <label class="field"><span>Display Name</span><input v-model="form.name" required /></label>
            <label class="field"><span>Gender</span>
              <select v-model="form.gender"><option value="男">Male</option><option value="女">Female</option></select>
            </label>
            <label class="field"><span>Birthday</span><input v-model="form.birthday" type="date" /></label>
            <label class="field"><span>Team</span>
              <select v-model.number="form.departmentId" required>
                <option v-for="d in data.departments" :key="d.id" :value="d.id">{{ d.name }}</option>
              </select>
            </label>
            <label class="field"><span>Job Function slot</span>
              <select v-model.number="form.positionId" required>
                <option v-for="p in positionsInDept" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </label>
            <label class="field"><span>Reporting Manager</span>
              <select v-model="form.managerId">
                <option value="">None</option>
                <option v-for="e in data.employees" :key="e.id" :value="e.id">{{ e.name }} ({{ e.id }})</option>
              </select>
            </label>
            <label class="field"><span>Hire date</span><input v-model="form.hireDate" type="date" required /></label>
            <label class="field"><span>Career start (YoE)</span><input v-model="form.careerStartDate" type="date" /></label>
            <label class="field"><span>Rank start date</span><input v-model="form.levelStartDate" type="date" /></label>
            <label class="field full"><span>School</span><input v-model="form.gradSchool" placeholder="e.g. Zhejiang University" /></label>
            <label class="field"><span>Potential (9-box)</span>
              <select v-model="form.potential" class="input">
                <option value="H">High (H)</option>
                <option value="M">Medium (M)</option>
                <option value="L">Low (L)</option>
              </select>
            </label>
            <label class="field full"><span>Management plan</span><textarea v-model="form.managementPlan" rows="2" placeholder="e.g. succession watch, training"></textarea></label>
            <label class="field"><span>Status</span>
              <select v-model="form.status">
                <option value="active">Active</option>
                <option value="probation">Probation</option>
                <option value="leave">Leaving</option>
              </select>
            </label>
            <label class="field"><span>Title</span>
              <select v-model="form.orgRole" class="input">
                <option value="">—</option>
                <option value="IC">IC (Individual Contributor)</option>
                <option value="PIC">PIC (People in Charge)</option>
                <option value="RM">RM (Resource Manager)</option>
              </select>
            </label>
            <label class="field"><span>Pay position</span>
              <select v-model="form.salaryBand" class="input">
                <option value="">—</option>
                <option value="below_min">Below min</option>
                <option value="p25">P25</option>
                <option value="p50">P50</option>
                <option value="p75">P75</option>
                <option value="above_max">Above max</option>
              </select>
            </label>
            <label class="field"><span>Age (years)</span>
              <input v-model="form.age" type="text" inputmode="numeric" placeholder="Leave blank to derive from birthday" />
            </label>
            <label class="field"><span>Mobile</span><input v-model="form.phone" /></label>
            <label class="field"><span>Email</span><input v-model="form.email" type="email" /></label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="modal = null">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>

      <div v-if="detail" class="modal-backdrop" @click.self="detail = null">
        <div class="modal card wide roster-detail-modal">
          <h3>Employee profile · {{ detail.name }}</h3>
          <div class="kv-grid">
            <div v-for="(v,k) in detailRows" :key="k"><span class="muted">{{ k }}</span><div>{{ v }}</div></div>
          </div>
          <h4 class="subsection-title">绩效记录</h4>
          <div v-if="detailReviews.length" style="margin-bottom:8px">
            <span class="muted small">历次绩效: </span>
            <span class="perf-grade-inline" style="font-size:0.95rem"><template v-for="(pg, gi) in perfGradesList(detail.id)"><span v-if="gi">, </span><b v-if="pg.annual" class="perf-annual">{{ pg.grade }}</b><span v-else class="perf-half">{{ pg.grade }}</span></template></span>
          </div>
          <p v-if="!detailReviews.length" class="muted small">暂无绩效记录</p>
          <div v-else class="roster-perf-wrap">
            <table class="data-table compact roster-perf-table">
              <thead><tr><th>周期</th><th>类型</th><th>最终等级</th><th>RM 评级</th><th>状态</th><th>RM</th></tr></thead>
              <tbody>
                <tr v-for="r in detailReviews" :key="r.id">
                  <td>{{ reviewCycleLabel(r) }}</td>
                  <td>{{ reviewCycleType(r) }}</td>
                  <td><strong>{{ (r.status === 'finalized' || r.status === 'calibrated') ? (r.finalGrade || '—') : '—' }}</strong></td>
                  <td>{{ r.rmInitialGrade || '—' }}</td>
                  <td>{{ perfStatusEn(r.status) }}</td>
                  <td>{{ mgrName(r.reviewerId) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <button type="button" class="btn btn-primary" style="margin-top:12px" @click="detail = null">Close</button>
        </div>
      </div>

      <div v-if="fieldEditorOpen" class="modal-backdrop" @click.self="fieldEditorOpen = false">
        <div class="modal card wide roster-field-editor-modal">
          <h3>Roster column settings</h3>
          <p class="muted small">Toggle visibility, edit header labels, and reorder. Import template and Excel export follow this layout. Fuzzy import always maps file headers to fields automatically.</p>
          <div class="roster-field-editor-list">
            <div v-for="(c, idx) in fieldEditorRows" :key="c.key" class="roster-field-editor-row">
              <label class="roster-field-editor-check"><input type="checkbox" v-model="c.visible" /> <span>{{ fieldDefLabel(c.key) }}</span></label>
              <input v-model="c.label" class="input roster-field-editor-input" :placeholder="fieldDefLabel(c.key)" />
              <div class="roster-field-editor-move">
                <button type="button" class="btn btn-ghost btn-sm" :disabled="idx === 0" @click="moveFieldRow(idx, -1)" title="Move up">↑</button>
                <button type="button" class="btn btn-ghost btn-sm" :disabled="idx === fieldEditorRows.length - 1" @click="moveFieldRow(idx, 1)" title="Move down">↓</button>
              </div>
            </div>
          </div>
          <div class="modal-actions" style="flex-wrap:wrap;gap:8px">
            <button type="button" class="btn btn-ghost" @click="resetRosterFieldsDefault">Reset to default</button>
            <button type="button" class="btn btn-ghost" @click="fieldEditorOpen = false">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveRosterFieldEditor">Save</button>
          </div>
        </div>
      </div>

      <div v-if="layoutPreview" class="modal-backdrop" @click.self="layoutPreview = null">
        <div class="modal card wide">
          <h3>Columns from file</h3>
          <p class="muted small">Review fuzzy matches. Headers from your file become column labels where matched. Unmatched columns are listed below and ignored.</p>
          <table class="data-table compact" style="margin-top:10px">
            <thead><tr><th>File header</th><th>Matched field</th><th>Score</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in layoutPreview.matchedPreview" :key="i">
                <td>{{ r.header }}</td>
                <td>{{ r.fieldKey ? fieldDefLabel(r.fieldKey) : '—' }}</td>
                <td>{{ r.fieldKey ? (Math.round(r.score * 100) + '%') : '—' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="layoutPreview.unmatched.length" class="muted small" style="margin-top:10px">Unmatched: {{ layoutPreview.unmatched.join(', ') }}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="layoutPreview = null">Cancel</button>
            <button type="button" class="btn btn-primary" @click="applyLayoutFromPreview">Apply layout</button>
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const data = useDataStore();
    const productLine = useProductLineStore();
    const auth = useAuthStore();
    const zs = window.TM.useZoneScope(data);
    const q = ref('');
    const debouncedQ = ref('');
    let _qTimer = null;
    watch(q, (v) => {
      if (_qTimer) clearTimeout(_qTimer);
      _qTimer = setTimeout(() => { debouncedQ.value = v; }, 300);
    });
    const colFilters = reactive({});
    const modal = ref(false);
    const modalMode = ref('create');
    const form = ref({});
    const detail = ref(null);
    const selectedIds = ref([]);
    const fieldEditorOpen = ref(false);
    const fieldEditorRows = ref([]);
    const layoutPreview = ref(null);
    const showColPicker = ref(false);

    /** 所有列（含隐藏），用于 Columns 面板 */
    const allRosterColumns = computed(() => {
      const s = data.rosterColumnSettings || window.TM.defaultRosterColumnSettings();
      return window.TM.resolveRosterColumns(s);
    });

    /** Fields that other modules depend on: map from fieldKey → module names */
    const FIELD_DEPS = {
      name:           ['Organization', 'Performance', 'Attendance', 'Talent', 'Recruitment'],
      displayName:    ['Organization', 'Performance', 'Attendance', 'Talent'],
      team:           ['Organization', 'Analytics'],
      rank:           ['Performance', 'Analytics', 'Organization'],
      status:         ['Dashboard', 'Analytics'],
      hireDate:       ['Attendance'],
      potential:      ['Talent (9-box)'],
      positionId:     ['Performance', 'Organization'],
    };

    /** Warn (toast) if hiding a field that other modules depend on; returns true to proceed anyway. */
    function _warnFieldDep(key) {
      const deps = FIELD_DEPS[key];
      if (!deps || !deps.length) return true;
      const msg = `隐藏字段 "${key}" 可能影响：${deps.join('、')} 等模块的数据展示。如需恢复，可在 Columns 面板重新显示。`;
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: msg, type: 'warning' } }));
      return true;
    }

    function _getColSettings() {
      const s = data.rosterColumnSettings || window.TM.defaultRosterColumnSettings();
      return { version: 1, columns: JSON.parse(JSON.stringify(s.columns)) };
    }

    function quickHideColumn(key) {
      _warnFieldDep(key);
      const s = _getColSettings();
      const col = s.columns.find((c) => c.key === key);
      if (col) {
        col.visible = false;
        data.setRosterColumnSettings(s);
        const label = col.label || col.key;
        window.dispatchEvent(new CustomEvent('tm-toast', {
          detail: { message: `已隐藏字段「${label}」，可点击工具栏 Columns 按钮恢复显示`, type: 'info' },
        }));
      }
    }

    function toggleColumnVisibility(key, visible) {
      if (!visible) _warnFieldDep(key);
      const s = _getColSettings();
      const col = s.columns.find((c) => c.key === key);
      if (col) { col.visible = !!visible; data.setRosterColumnSettings(s); }
    }

    function showAllColumns() {
      const s = _getColSettings();
      s.columns.forEach((c) => { c.visible = true; });
      data.setRosterColumnSettings(s);
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已显示全部字段', type: 'success' } }));
    }

    function quickMoveColumn(key, delta) {
      const s = _getColSettings();
      const idx = s.columns.findIndex((c) => c.key === key);
      if (idx < 0) return;
      const j = idx + delta;
      if (j < 0 || j >= s.columns.length) return;
      const tmp = s.columns[idx]; s.columns[idx] = s.columns[j]; s.columns[j] = tmp;
      data.setRosterColumnSettings(s);
    }

    function resetColumnSettingsDefault() {
      data.setRosterColumnSettings(window.TM.defaultRosterColumnSettings());
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Column layout reset to default', type: 'success' } }));
    }

    const COLUMN_FILTER_TYPE = {
      team: 'dept', teamPath: 'dept',
      status: 'status', statusLabel: 'status',
      potential: 'potential',
      rank: 'level',
      gender: 'gender',
      title: 'title',
      payPosition: 'payPosition',
      // teamId / jobFunctionSlotId 是内部 ID，不需要列筛选
      teamId: 'none', jobFunctionSlotId: 'none',
    };
    function colFilterType(key) {
      const t = COLUMN_FILTER_TYPE[key];
      if (t === 'none') return null;
      return t || 'text';
    }

    const hasActiveFilters = computed(() =>
      Object.values(colFilters).some((v) => v !== '' && v != null)
    );

    const visibleRosterColumns = computed(() => window.TM.visibleRosterColumns(
      data.rosterColumnSettings || window.TM.defaultRosterColumnSettings(),
    ));

    const positionsInDept = computed(() => {
      const dep = form.value.departmentId;
      return data.positions.filter((p) => p.departmentId === dep);
    });

    const levelFilterOptions = computed(() => {
      const set = new Set();
      data.positions.forEach((p) => {
        if (p.level != null && String(p.level).trim() !== '') set.add(String(p.level).trim());
      });
      return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    });

    const _tmMap = computed(() => {
      const m = new Map();
      (data.talentMatrix || []).forEach((x) => m.set(Number(x.employeeId), x));
      return m;
    });
    function potentialCodeForEmployee(eid) {
      const m = _tmMap.value.get(Number(eid));
      if (!m) return null;
      const p = String(m.potential || '').trim().toUpperCase();
      if (p === 'H' || p === 'M' || p === 'L') return p;
      return null;
    }

    const showArchived = ref(false);
    const archivedCount = computed(() =>
      zs.scopedEmployees.value.filter((e) => e.status === 'leave').length,
    );

    const filtered = computed(() => {
      let list = showArchived.value
        ? [...zs.scopedEmployees.value]
        : [...zs.scopedActiveEmployees.value];
      Object.entries(colFilters).forEach(([key, val]) => {
        if (val === '' || val == null) return;
        const ft = colFilterType(key);
        if (!ft) return;
        if (ft === 'dept') {
          const id = Number(val);
          list = list.filter((e) => e.departmentId === id);
        } else if (ft === 'status') {
          list = list.filter((e) => e.status === val);
        } else if (ft === 'potential') {
          if (val === '__unset__') list = list.filter((e) => potentialCodeForEmployee(e.id) == null);
          else list = list.filter((e) => potentialCodeForEmployee(e.id) === val);
        } else if (ft === 'level') {
          list = list.filter((e) => posLevel(e.positionId) === val);
        } else if (ft === 'gender') {
          list = list.filter((e) => String(e.gender || '').trim() === val);
        } else if (ft === 'title') {
          list = list.filter((e) => normalizeOrgRole(e.orgRole) === val);
        } else if (ft === 'payPosition') {
          list = list.filter((e) => e.salaryBand === val);
        } else if (ft === 'text') {
          const s = String(val).toLowerCase();
          list = list.filter((e) => String(rosterTextCell(key, e) ?? '').toLowerCase().includes(s));
        }
      });
      if (debouncedQ.value) {
        const s = debouncedQ.value.toLowerCase();
        list = list.filter((e) =>
          [
            e.name, e.email, e.phone, String(e.id), e.gradSchool, e.managementPlan,
            teamPathForDept(e.departmentId), normalizeOrgRole(e.orgRole), salaryBandDisplay(e.salaryBand),
          ].some((x) => String(x || '').toLowerCase().includes(s)));
      }
      return list.sort((a, b) => a.id - b.id);
    });

    const selectedSet = computed(() => new Set(selectedIds.value.map((x) => Number(x))));

    const allFilteredSelected = computed(() => {
      const list = filtered.value;
      if (!list.length) return false;
      return list.every((e) => selectedSet.value.has(Number(e.id)));
    });

    function toggleSelectRow(id) {
      const n = Number(id);
      const s = new Set(selectedIds.value.map(Number));
      if (s.has(n)) s.delete(n);
      else s.add(n);
      selectedIds.value = [...s];
    }

    function toggleSelectAllFiltered(on) {
      const idsInView = new Set(filtered.value.map((e) => Number(e.id)));
      if (on) {
        const s = new Set(selectedIds.value.map(Number));
        idsInView.forEach((id) => s.add(id));
        selectedIds.value = [...s];
      } else {
        selectedIds.value = selectedIds.value.filter((id) => !idsInView.has(Number(id)));
      }
    }

    function batchDeleteEmployees() {
      if (!auth.isHrbp) return;
      const ids = selectedIds.value.map(Number).filter((x) => !Number.isNaN(x));
      if (!ids.length) return;
      if (!confirm(`Permanently remove ${ids.length} employee(s) from the roster?\nLinked performance, attendance, training, 9-box, and other Staff ID–scoped data will be removed. This cannot be undone.`)) return;
      const { removed } = data.removeEmployeesByIds(ids);
      selectedIds.value = [];
      auth.enrichCurrentUserFromEmployee();
      window.dispatchEvent(new CustomEvent('tm-toast', {
        detail: { message: `Removed ${removed} employee(s); modules are in sync`, type: 'success' },
      }));
    }

    function clearRosterFilters() {
      Object.keys(colFilters).forEach((k) => { colFilters[k] = ''; });
      q.value = '';
    }

    function teamPathForDept(deptId) {
      const lineName = productLine.currentLine?.name || 'Product line';
      const deps = data.departments;
      const chain = [];
      let cur = deps.find((d) => d.id === deptId);
      let guard = 0;
      while (cur && guard < 64) {
        chain.push(cur.name);
        cur = cur.parentId != null ? deps.find((d) => d.id === cur.parentId) : null;
        guard += 1;
      }
      chain.reverse();
      return [lineName, ...chain].join(' > ');
    }

    function displayAge(e) {
      if (e.age != null && e.age !== '' && !Number.isNaN(Number(e.age))) {
        const n = Math.floor(Number(e.age));
        if (n >= 0 && n <= 130) return String(n);
      }
      const b = e.birthday;
      if (!b) return '—';
      const d = new Date(b);
      if (Number.isNaN(d.getTime())) return '—';
      const today = new Date();
      let a = today.getFullYear() - d.getFullYear();
      const md = today.getMonth() - d.getMonth();
      if (md < 0 || (md === 0 && today.getDate() < d.getDate())) a -= 1;
      return `${Math.max(0, a)} (est.)`;
    }

    function orgRoleDisplay(ov) {
      return normalizeOrgRole(ov) || '—';
    }

    function reviewCycleLabel(r) {
      return window.TM.reviewCycleLabel(data, r);
    }
    function reviewCycleType(r) {
      const c = window.TM.reviewCycleRecord(data, r);
      return c ? (window.TM.PERF_CYCLE_TYPE_LABEL[c.cycleType] || '半年绩效') : '—';
    }
    function rosterReviewNote(r) {
      const parts = [r.outputDescription, r.historyPerformance, r.comments].filter(Boolean);
      return parts.length ? parts.join('; ') : '—';
    }
    function reviewsForEmployee(eid) {
      return [...(data._reviewsByEmp.get(Number(eid)) || [])]
        .sort((a, b) => window.TM.reviewSortStamp(data, b).localeCompare(window.TM.reviewSortStamp(data, a)));
    }

    function perfSummaryText(eid) {
      return window.TM.allGradesPlainText(reviewsForEmployee(eid), data.performanceCycles);
    }

    function perfGradesHtml(eid) {
      const html = window.TM.allGradesForDisplay(reviewsForEmployee(eid), data.performanceCycles);
      return html || '—';
    }
    function perfGradesList(eid) {
      return window.TM.allGradesStructured(reviewsForEmployee(eid), data.performanceCycles);
    }

    const detailReviews = computed(() => {
      if (!detail.value) return [];
      return reviewsForEmployee(detail.value.id);
    });

    function deptName(id) {
      return data._deptMap.get(id)?.name || '-';
    }
    function posName(id) {
      return data._posMap.get(id)?.name || '-';
    }
    function mgrName(id) {
      if (id == null) return '-';
      return data._empMap.get(id)?.name || id;
    }

    function posLevel(pid) {
      return data._posMap.get(pid)?.level || '—';
    }

    function companyTenureLabel(e) {
      const tf = window.TM.tenureFormat;
      return tf ? tf.companyTenureLabel(e) : tenureHuman(e.hireDate);
    }

    function levelTenureLabel(e) {
      const tf = window.TM.tenureFormat;
      return tf ? tf.levelTenureLabel(e) : tenureHuman(e.levelStartDate);
    }

    function potentialDisplay(employeeId) {
      const m = data.talentMatrix.find((x) => Number(x.employeeId) === Number(employeeId));
      const p = m?.potential;
      if (!p) return '—';
      return `${POT_LABELS[p] || ''} (${p})`;
    }

    function fieldDefLabel(key) {
      return window.TM.rosterFieldByKey[key]?.defaultLabel || key;
    }

    function rosterHoursClass(eid) {
      const a = window.TM.attendance;
      if (!a) return '';
      const months = a.periodMonths('6month');
      const v = a.empAvgHours(data._attIdx, eid, months);
      return a.hoursClass(v);
    }

    function rosterTdClass(key) {
      const parts = [];
      if (key === 'teamPath') parts.push('cell-clip', 'roster-col-path');
      if (key === 'school' || key === 'managementPlan') parts.push('cell-clip');
      return parts.join(' ');
    }

    function rosterTdStyle(key) {
      if (key === 'school') return { maxWidth: '7rem' };
      if (key === 'managementPlan') return { maxWidth: '8rem' };
      return {};
    }

    function rosterTextCell(key, e) {
      switch (key) {
        case 'staffId': return e.id;
        case 'displayName': return e.name;
        case 'teamPath': return teamPathForDept(e.departmentId);
        case 'team': return deptName(e.departmentId);
        case 'jobFunction': return posName(e.positionId);
        case 'rank': return posLevel(e.positionId);
        case 'title': return orgRoleDisplay(e.orgRole);
        case 'age': return displayAge(e);
        case 'payPosition': return salaryBandDisplay(e.salaryBand);
        case 'school': return e.gradSchool || '—';
        case 'yoe': return tenureHuman(e.careerStartDate);
        case 'companyTenure': return companyTenureLabel(e);
        case 'tenureInCurrentRank': return `${posLevel(e.positionId)} ${levelTenureLabel(e)}`;
        case 'potential': return potentialDisplay(e.id);
        case 'managementPlan': return e.managementPlan || '—';
        case 'reportingManager': return mgrName(e.managerId);
        case 'status': return statusMap[e.status] || e.status;
        case 'teamId': return e.departmentId;
        case 'jobFunctionSlotId': return e.positionId;
        case 'gender': return e.gender || '—';
        case 'birthday': return e.birthday || '—';
        case 'hireDate': return e.hireDate || '—';
        case 'careerStartDate': return e.careerStartDate || '—';
        case 'rankStartDate': return e.levelStartDate || '—';
        case 'mobile': return e.phone || '—';
        case 'email': return e.email || '—';
        case 'statusLabel': return statusMap[e.status] || '—';
        case 'avgHours6m': {
          const att = window.TM.attendance;
          if (!att) return '—';
          const months = att.periodMonths('6month');
          const v = att.empAvgHours(data._attIdx, e.id, months);
          return v != null ? v : '—';
        }
        default: return '—';
      }
    }

    function rosterCellTitle(key, e) {
      if (key === 'performance') return perfSummaryText(e.id);
      return String(rosterTextCell(key, e) ?? '');
    }

    function exportColumnsResolved() {
      let cols = window.TM.resolveRosterColumns(
        data.rosterColumnSettings || window.TM.defaultRosterColumnSettings(),
      ).filter((c) => c.visible && c.exportable);
      if (!cols.length) {
        cols = window.TM.resolveRosterColumns(window.TM.defaultRosterColumnSettings())
          .filter((c) => c.visible && c.exportable);
      }
      return cols;
    }

    function exportCellValue(key, e) {
      switch (key) {
        case 'staffId': return e.id;
        case 'displayName': return e.name;
        case 'gender': return e.gender;
        case 'birthday': return e.birthday;
        case 'teamPath': return teamPathForDept(e.departmentId);
        case 'teamId': return e.departmentId;
        case 'team': return deptName(e.departmentId);
        case 'jobFunctionSlotId': return e.positionId;
        case 'jobFunction': return posName(e.positionId);
        case 'rank': return posLevel(e.positionId);
        case 'title': return normalizeOrgRole(e.orgRole) || '';
        case 'age': return (e.age != null && e.age !== '' && !Number.isNaN(Number(e.age)) ? Math.floor(Number(e.age)) : '');
        case 'payPosition': return e.salaryBand || '';
        case 'school': return e.gradSchool || '';
        case 'careerStartDate': return e.careerStartDate || '';
        case 'rankStartDate': return e.levelStartDate || (window.TM.tenureFormat?.effectiveLevelStartYmd(e) ?? '');
        case 'yoe': return tenureHuman(e.careerStartDate);
        case 'companyTenure': return companyTenureLabel(e);
        case 'tenureInCurrentRank': return levelTenureLabel(e);
        case 'potential': return data.talentMatrix.find((x) => Number(x.employeeId) === e.id)?.potential || '';
        case 'managementPlan': return e.managementPlan || '';
        case 'reportingManager': return e.managerId ?? '';
        case 'hireDate': return e.hireDate || (window.TM.tenureFormat?.effectiveHireYmd(e) ?? '');
        case 'status': return e.status;
        case 'statusLabel': return statusMap[e.status] || e.status;
        case 'mobile': return e.phone;
        case 'email': return e.email;
        case 'performance': return perfSummaryText(e.id);
        case 'performanceHtml': return perfGradesHtml(e.id);
        default: return '';
      }
    }

    function openRosterFieldEditor() {
      if (!auth.isHrbp) return;
      const src = (data.rosterColumnSettings && data.rosterColumnSettings.columns && data.rosterColumnSettings.columns.length)
        ? data.rosterColumnSettings.columns
        : window.TM.defaultRosterColumnSettings().columns;
      fieldEditorRows.value = JSON.parse(JSON.stringify(src));
      fieldEditorOpen.value = true;
    }

    function saveRosterFieldEditor() {
      data.setRosterColumnSettings({
        version: 1,
        columns: fieldEditorRows.value.map((c) => ({
          key: c.key,
          visible: !!c.visible,
          label: String(c.label || '').trim(),
        })),
      });
      fieldEditorOpen.value = false;
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Roster columns saved', type: 'success' } }));
    }

    function moveFieldRow(idx, delta) {
      const arr = [...fieldEditorRows.value];
      const j = idx + delta;
      if (j < 0 || j >= arr.length) return;
      const t = arr[idx];
      arr[idx] = arr[j];
      arr[j] = t;
      fieldEditorRows.value = arr;
    }

    function resetRosterFieldsDefault() {
      fieldEditorRows.value = JSON.parse(JSON.stringify(window.TM.defaultRosterColumnSettings().columns));
    }

    function onUploadLayoutHeaders(ev) {
      if (!auth.isHrbp) return;
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          let headers = [];
          if (/\.csv$/i.test(file.name)) {
            const text = String(reader.result);
            const line = text.split(/\r?\n/).find((l) => String(l).trim().length);
            if (!line) throw new Error('Empty file');
            const sep = line.includes('\t') ? '\t' : ',';
            headers = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, '').replace(/^\uFEFF/, ''));
          } else {
            const XLSX = ensureXLSX();
            const wb = XLSX.read(reader.result, { type: 'array', cellDates: true });
            const sn = wb.SheetNames[0];
            if (!sn) throw new Error('Workbook is empty');
            const sheet = wb.Sheets[sn];
            const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            const row0 = matrix[0] || [];
            headers = row0.map((c) => String(c ?? '').trim()).filter((x) => x.length);
          }
          const prop = window.TM.proposeRosterColumnsFromHeaders(headers);
          layoutPreview.value = prop;
        } catch (err) {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: err.message, type: 'error' } }));
        }
      };
      if (/\.csv$/i.test(file.name)) reader.readAsText(file, 'UTF-8');
      else reader.readAsArrayBuffer(file);
    }

    function applyLayoutFromPreview() {
      if (!layoutPreview.value) return;
      data.setRosterColumnSettings({ version: 1, columns: layoutPreview.value.columns });
      layoutPreview.value = null;
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Roster layout applied from file', type: 'success' } }));
    }

    function openCreate() {
      modalMode.value = 'create';
      const hd = new Date().toISOString().slice(0, 10);
      form.value = {
        name: '', gender: '男', birthday: '1990-01-01', departmentId: data.departments[0]?.id,
        positionId: data.positions.find((p) => p.departmentId === data.departments[0]?.id)?.id,
        managerId: '', hireDate: hd, careerStartDate: hd, levelStartDate: hd, status: 'active',
        gradSchool: '', managementPlan: '', potential: 'M',
        orgRole: '', salaryBand: '', age: '',
        phone: '', email: '',
      };
      modal.value = true;
    }

    function openEdit(e) {
      modalMode.value = 'edit';
      const m = data.talentMatrix.find((x) => Number(x.employeeId) === Number(e.id));
      form.value = {
        ...e,
        orgRole: normalizeOrgRole(e.orgRole) || '',
        salaryBand: (() => {
          const k = String(e.salaryBand || '').trim();
          if (SALARY_BAND_LABELS[k]) return k;
          return parseSalaryBandCell(e.salaryBand) || '';
        })(),
        age: e.age != null && e.age !== '' && !Number.isNaN(Number(e.age)) ? Number(e.age) : '',
        managerId: e.managerId == null ? '' : e.managerId,
        potential: m?.potential || 'M',
      };
      modal.value = true;
    }

    function saveEmployee() {
      const f = { ...form.value };
      const potential = f.potential || 'M';
      delete f.potential;
      f.managerId = f.managerId === '' || f.managerId == null ? null : Number(f.managerId);
      f.departmentId = Number(f.departmentId);
      f.positionId = Number(f.positionId);
      f.gradSchool = String(f.gradSchool ?? '').trim();
      f.managementPlan = String(f.managementPlan ?? '').trim();
      f.orgRole = normalizeOrgRole(f.orgRole);
      f.salaryBand = SALARY_BAND_LABELS[f.salaryBand] ? f.salaryBand : '';
      const ag = f.age;
      f.age = (ag === '' || ag == null || String(ag).trim() === '' || Number.isNaN(Number(ag)))
        ? null
        : Math.min(130, Math.max(0, Math.floor(Number(ag))));
      if (modalMode.value === 'create') {
        const id = data.addEmployee(f);
        data.upsertTalentCell(id, 'B', potential);
      } else {
        data.updateEmployee(f.id, f);
        const perf = data.talentMatrix.find((x) => Number(x.employeeId) === Number(f.id))?.performance || 'B';
        data.upsertTalentCell(f.id, perf, potential);
        const auth = window.TM.useAuthStore();
        if (auth.isLoggedIn && Number(auth.currentUser.employeeId) === Number(f.id)) {
          auth.enrichCurrentUserFromEmployee();
        }
      }
      modal.value = null;
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Saved', type: 'success' } }));
    }

    function doLeave(e) {
      if (!confirm(`Mark ${e.name} as leaving (pending offboard)?`)) return;
      data.setEmployeeStatus(e.id, 'leave');
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Status updated', type: 'success' } }));
    }

    function openDetail(e) {
      detail.value = e;
    }

    const detailRows = computed(() => {
      if (!detail.value) return {};
      const e = detail.value;
      return {
        'Staff ID': e.id,
        'Display Name': e.name,
        Gender: e.gender,
        Birthday: e.birthday,
        'Team Path': teamPathForDept(e.departmentId),
        Team: deptName(e.departmentId),
        'Job Function': posName(e.positionId),
        Rank: posLevel(e.positionId),
        'Title (IC/PIC/RM)': orgRoleDisplay(e.orgRole),
        Age: displayAge(e),
        'Pay position': salaryBandDisplay(e.salaryBand),
        School: e.gradSchool || '—',
        YoE: tenureHuman(e.careerStartDate),
        'Company tenure': companyTenureLabel(e),
        'Tenure In Current Rank': `${posLevel(e.positionId)} · ${levelTenureLabel(e)}`,
        Potential: potentialDisplay(e.id),
        'Management plan': e.managementPlan || '—',
        'Reporting Manager': mgrName(e.managerId),
        'Hire date': e.hireDate || `(system) ${tenureFmt().effectiveHireYmd(e)}`,
        'Career start date': e.careerStartDate || '—',
        'Rank start date': e.levelStartDate || `(system) ${tenureFmt().effectiveLevelStartYmd(e)}`,
        Status: statusMap[e.status],
        Mobile: e.phone,
        Email: e.email,
      };
    });

    function exportExcel() {
      try {
        const XLSX = ensureXLSX();
        const cols = exportColumnsResolved();
        const src = showArchived.value ? zs.scopedEmployees.value : zs.scopedActiveEmployees.value;
        const rows = [...src].sort((a, b) => a.id - b.id).map((e) => {
          const row = {};
          cols.forEach((col) => {
            row[col.labelResolved] = exportCellValue(col.key, e);
          });
          return row;
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Roster');
        XLSX.writeFile(wb, `Roster_${new Date().toISOString().slice(0, 10)}.xlsx`);
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Excel exported', type: 'success' } }));
      } catch (err) {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: err.message, type: 'error' } }));
      }
    }

    function templateSampleValue(key) {
      const d0 = data.departments[0];
      const p0 = data.positions.find((p) => p.departmentId === d0?.id) || data.positions[0];
      const samples = {
        staffId: 10001,
        displayName: 'Sample',
        gender: '男',
        birthday: '1990-01-01',
        teamPath: '(optional)',
        teamId: d0?.id ?? 1,
        team: d0?.name ?? '技术部',
        jobFunctionSlotId: p0?.id ?? 101,
        jobFunction: p0?.name ?? 'Frontend',
        rank: 'EE',
        title: 'IC',
        age: '',
        payPosition: 'p50',
        performance: '—',
        school: 'Sample University',
        careerStartDate: '2018-07-01',
        rankStartDate: '2023-01-01',
        yoe: '—',
        companyTenure: '—',
        tenureInCurrentRank: '—',
        potential: 'M',
        managementPlan: 'Annual review',
        reportingManager: '',
        hireDate: '2024-06-01',
        status: 'active',
        statusLabel: 'Active',
        mobile: '13800000000',
        email: 'demo@company.com',
      };
      return samples[key] != null ? samples[key] : '';
    }

    function downloadExcelTemplate() {
      try {
        const XLSX = ensureXLSX();
        const cols = exportColumnsResolved();
        const row = {};
        cols.forEach((col) => {
          row[col.labelResolved] = templateSampleValue(col.key);
        });
        const ws = XLSX.utils.json_to_sheet([row]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Roster');
        XLSX.writeFile(wb, 'Roster_Import_Template.xlsx');
      } catch (err) {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: err.message, type: 'error' } }));
      }
    }

    function resolveDeptId(row, map) {
      const id = Number(importCell(row, 'teamId', map));
      if (id && data.departments.some((d) => d.id === id)) return id;
      const name = String(importCell(row, 'team', map)).trim();
      const d = data.departments.find((x) => x.name === name);
      if (d) return d.id;
      return data.departments[0]?.id ?? 1;
    }

    function resolvePosId(row, deptId, map) {
      const id = Number(importCell(row, 'jobFunctionSlotId', map));
      if (id && data.positions.some((p) => p.id === id)) return id;
      const name = String(importCell(row, 'jobFunction', map)).trim();
      let p = data.positions.find((x) => x.name === name && x.departmentId === deptId);
      if (!p) p = data.positions.find((x) => x.name === name);
      if (p) return p.id;
      return data.positions.find((x) => x.departmentId === deptId)?.id ?? data.positions[0]?.id ?? 101;
    }

    /** append：与已有工号或本批已占工号冲突时自动顺延；覆盖导入行为与原先一致 */
    function parseSheetJsonToList(json, append, fieldMap) {
      const map = fieldMap || buildImportFieldMap(json);
      let maxId = data.employees.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);
      const reserved = new Set();
      if (append) {
        data.employees.forEach((e) => reserved.add(Number(e.id)));
      }
      const list = [];
      const matrixPatches = [];
      json.forEach((row) => {
        const name = String(importCell(row, 'displayName', map)).trim();
        if (!name) return;
        let id = Number(importCell(row, 'staffId', map));
        if (append) {
          if (!id || Number.isNaN(id) || reserved.has(id)) {
            maxId += 1;
            id = maxId;
            while (reserved.has(id)) {
              maxId += 1;
              id = maxId;
            }
          } else {
            maxId = Math.max(maxId, id);
          }
          reserved.add(id);
        } else if (!id || Number.isNaN(id)) {
          maxId += 1;
          id = maxId;
        } else {
          maxId = Math.max(maxId, id);
        }
        const deptId = resolveDeptId(row, map);
        const positionId = resolvePosId(row, deptId, map);
        const mid = importCell(row, 'reportingManager', map);
        let managerId = null;
        if (mid !== '' && mid != null && mid !== undefined && String(mid).trim() !== '') {
          const midNum = Number(mid);
          if (!Number.isNaN(midNum) && midNum > 0) {
            managerId = midNum;
          } else {
            const midStr = String(mid).trim().toLowerCase();
            var match = data.employees.find((e) =>
              String(e.name || '').trim().toLowerCase() === midStr
              || String(e.id) === midStr,
            );
            if (!match) match = list.find((e) =>
              String(e.name || '').trim().toLowerCase() === midStr
              || String(e.id) === midStr,
            );
            if (match) managerId = match.id;
          }
        }
        const pot = parsePotentialCell(importCell(row, 'potential', map));
        if (pot) matrixPatches.push({ id, pot });
        const hd = cellToDateString(importCell(row, 'hireDate', map)) || '2020-01-01';
        const career = cellToDateString(importCell(row, 'careerStartDate', map)) || '';
        const lvl = cellToDateString(importCell(row, 'rankStartDate', map)) || '';
        const ageRaw = importCell(row, 'age', map);
        let ageNum = null;
        if (ageRaw !== '' && ageRaw != null && String(ageRaw).trim() !== '') {
          const n = Math.floor(Number(ageRaw));
          if (!Number.isNaN(n) && n >= 0 && n <= 130) ageNum = n;
        }
        list.push({
          id,
          name,
          gender: String(importCell(row, 'gender', map) || '男').trim() || '男',
          birthday: cellToDateString(importCell(row, 'birthday', map)) || '1990-01-01',
          departmentId: deptId,
          positionId,
          managerId: managerId != null && !Number.isNaN(managerId) ? managerId : null,
          hireDate: hd,
          careerStartDate: career || hd,
          levelStartDate: lvl || hd,
          gradSchool: String(importCell(row, 'school', map)).trim(),
          managementPlan: String(importCell(row, 'managementPlan', map)).trim(),
          orgRole: normalizeOrgRole(importCell(row, 'title', map) || row.orgRole),
          salaryBand: parseSalaryBandCell(importCell(row, 'payPosition', map)),
          age: ageNum,
          status: (() => {
            const stRaw = importCell(row, 'status', map);
            const stLabel = importCell(row, 'statusLabel', map);
            const pick = (stRaw !== '' && stRaw != null && String(stRaw).trim() !== '') ? stRaw : stLabel;
            return parseStatus(pick);
          })(),
          phone: String(importCell(row, 'mobile', map)).trim(),
          email: String(importCell(row, 'email', map)).trim(),
        });
      });
      return { list, matrixPatches };
    }

    function runAfterRosterImport(listLen) {
      auth.enrichCurrentUserFromEmployee();
      var newRMCount = detectAndCreateRMAccounts();
      var msg = `Processed ${listLen} employee(s); 9-box and modules are in sync`;
      if (newRMCount > 0) msg += `。发现 ${newRMCount} 名新 RM，已创建待审批账号`;
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: msg, type: 'success' } }));
    }

    function detectAndCreateRMAccounts() {
      var mgrIds = new Set();
      (data.employees || []).forEach(function (e) {
        if (e.managerId) mgrIds.add(Number(e.managerId));
      });
      var existingEmpIds = new Set();
      (data.users || []).forEach(function (u) { if (u.employeeId != null) existingEmpIds.add(Number(u.employeeId)); });
      var maxId = (data.users || []).reduce(function (m, u) { return Math.max(m, Number(u.id) || 0); }, 0);
      var count = 0;
      mgrIds.forEach(function (eid) {
        if (existingEmpIds.has(eid)) return;
        var emp = data.employees.find(function (e) { return e.id === eid; });
        if (!emp) return;
        maxId++;
        var email = emp.email || (String(emp.name || 'rm').toLowerCase().replace(/\s+/g, '') + '@company.com');
        data.users.push({
          id: maxId,
          username: email.split('@')[0],
          email: email,
          password: '123',
          realName: emp.name,
          role: 'manager',
          employeeId: eid,
          homeLineId: window.TM.useProductLineStore().currentLineId,
          rmStatus: 'pending_approval',
          rmNominationSource: '花名册导入识别',
          managerPermissions: { modules: window.TM.MGR_MODULES.slice(), ops: window.TM.RM_ALL_OPS_ON() },
        });
        count++;
      });
      if (count > 0) { data._markDirty('users'); data.persistAll(); }
      return count;
    }

    /* ── Field Map Dialog state for Roster ── */
    const rfmapVisible = ref(false);
    const rfmapMapping = ref([]);
    const rfmapHeaders = ref([]);
    const rfmapTitle = ref('花名册字段映射确认');
    let rfmapPendingJson = null;
    let rfmapPendingMode = null;

    function rfmapOnConfirm(confirmedMapping) {
      rfmapVisible.value = false;
      const headerToField = {};
      confirmedMapping.forEach((m) => { if (m.header) headerToField[m.header] = m.fieldKey; });
      const fieldMap = {};
      Object.entries(headerToField).forEach(([h, fk]) => { fieldMap[fk] = h; });
      if (rfmapPendingMode === 'replace') commitRosterImport(rfmapPendingJson, false, fieldMap);
      else if (rfmapPendingMode === 'append') commitRosterImport(rfmapPendingJson, true, fieldMap);
      rfmapPendingJson = null;
      rfmapPendingMode = null;
    }

    function rosterUploadCommon(ev, mode) {
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const XLSX = ensureXLSX();
          const wb = XLSX.read(reader.result, { type: 'array', cellDates: true });
          const sn = wb.SheetNames[0];
          if (!sn) throw new Error('Workbook is empty');
          const json = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' });
          if (!json.length) throw new Error('No data rows under header');
          const headers = Object.keys(json[0]);
          const mapping = window.TM.fieldMapper.match(ROSTER_SCHEMA, headers);
          const allExact = mapping.every((m) => !m.header || m.confidence === 'exact');
          if (allExact && mapping.filter((m) => m.header).length >= 3) {
            const fieldMap = {};
            mapping.forEach((m) => { if (m.header) fieldMap[m.fieldKey] = m.header; });
            commitRosterImport(json, mode === 'append', fieldMap);
          } else {
            rfmapPendingJson = json;
            rfmapPendingMode = mode;
            rfmapHeaders.value = headers;
            rfmapMapping.value = mapping;
            rfmapTitle.value = mode === 'append' ? '花名册追加 — 字段映射确认' : '花名册导入 — 字段映射确认';
            rfmapVisible.value = true;
          }
        } catch (err) {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: (mode === 'append' ? 'Append' : 'Import') + ' failed: ' + err.message, type: 'error' } }));
        }
      };
      reader.readAsArrayBuffer(file);
    }

    function commitRosterImport(json, append, fieldMap) {
      try {
        const { list, matrixPatches } = parseSheetJsonToList(json, append, fieldMap);
        if (!list.length) throw new Error('No valid rows (Display Name is required)');
        if (append) {
          data.addEmployeesBatch(list);
        } else {
          data.employees = list;
          data.syncEmployeeLinkedDataFromRoster();
          data._markDirty('employees');
        }
        matrixPatches.forEach(({ id, pot }) => {
          const perf = data.talentMatrix.find((x) => Number(x.employeeId) === Number(id))?.performance || 'B';
          data.upsertTalentCell(id, perf, pot, { skipPersist: true });
        });
        data.persistAll();
        runAfterRosterImport(list.length);
      } catch (err) {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Import failed: ' + err.message, type: 'error' } }));
      }
    }

    function importExcel(ev) { rosterUploadCommon(ev, 'replace'); }
    function appendImportExcel(ev) { if (!auth.isHrbp) return; rosterUploadCommon(ev, 'append'); }

    return {
      auth,
      data, q, colFilters, showArchived, archivedCount,
      selectedIds, selectedSet, allFilteredSelected, toggleSelectRow, toggleSelectAllFiltered, batchDeleteEmployees,
      levelFilterOptions, filtered, statusMap, clearRosterFilters,
      deptName, posName, posLevel, mgrName, tenureHuman, companyTenureLabel, levelTenureLabel, potentialDisplay,
      teamPathForDept, displayAge, orgRoleDisplay, salaryBandDisplay, perfSummaryText, perfGradesHtml, perfGradesList, perfStatusEn, reviewCycleLabel, reviewCycleType, rosterReviewNote,
      modal, modalMode, form, positionsInDept,
      openCreate, openEdit, saveEmployee, doLeave, openDetail, detail, detailRows, detailReviews,
      exportExcel, importExcel, appendImportExcel, downloadExcelTemplate,
      visibleRosterColumns, allRosterColumns, rosterTextCell, rosterTdClass, rosterTdStyle, rosterCellTitle, rosterHoursClass,
      colFilterType, hasActiveFilters,
      showColPicker, quickHideColumn, quickMoveColumn, toggleColumnVisibility, showAllColumns, resetColumnSettingsDefault,
      fieldEditorOpen, fieldEditorRows, layoutPreview,
      openRosterFieldEditor, saveRosterFieldEditor, moveFieldRow, resetRosterFieldsDefault, fieldDefLabel,
      onUploadLayoutHeaders, applyLayoutFromPreview,
      rfmapVisible, rfmapMapping, rfmapHeaders, rfmapTitle, rfmapOnConfirm,
    };
  },
};
})();
