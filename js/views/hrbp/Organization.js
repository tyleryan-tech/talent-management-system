(function () {
  const { computed, onMounted, onUnmounted, ref, watch } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useAuthStore = window.TM.useAuthStore;
  const loadEcharts = window.TM.loadEcharts;

  function recruitTagEntry(tags, deptId, positionId) {
    if (!tags || typeof tags !== 'object') return null;
    const v = tags[`${Number(deptId)}-${Number(positionId)}`];
    if (v === true) return { priority: 'medium' };
    if (v && typeof v === 'object') {
      const p = ['high', 'medium', 'low'].includes(v.priority) ? v.priority : 'medium';
      return { priority: p };
    }
    return null;
  }

  function isRecruitTagged(tags, deptId, positionId) {
    return recruitTagEntry(tags, deptId, positionId) != null;
  }

  /** Tooltip 等 HTML 片段中插入用户数据前转义，满足安全基线、避免姓名等破坏结构 */
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 某部门下的岗位编制节点（与人名分行；空岗可标待招） */
  function buildPositionNodes(deptId, data, ec) {
    const G = ec.graphic.LinearGradient;
    const fillFilled = new G(0, 0, 0, 1, [{ offset: 0, color: '#ecfdf5' }, { offset: 1, color: '#d1fae5' }]);
    const fillVacant = new G(0, 0, 0, 1, [{ offset: 0, color: '#f8fafc' }, { offset: 1, color: '#e8eef5' }]);
    const tags = data.positionRecruitTags || {};
    return [...data.positions]
      .filter((p) => p.departmentId === deptId)
      .sort((a, b) => String(a.name).localeCompare(b.name, 'zh-Hans-CN'))
      .map((p) => {
        const assignees = data.employees.filter(
          (e) => e.positionId === p.id && e.departmentId === deptId && e.status !== 'leave',
        );
        const vacant = assignees.length === 0;
        const recEntry = recruitTagEntry(tags, deptId, p.id);
        const recruiting = vacant && recEntry != null;
        const recruitPr = recruiting ? recEntry.priority : null;
        const empDisplay = vacant
          ? (recruiting ? 'Open' : '\u3000')
          : assignees.map((e) => String(e.name).replace(/[{}|]/g, '')).join('\n');
        const safePn = String(p.name).replace(/[{}|]/g, '');
        const safeEm = String(empDisplay).replace(/[{}|]/g, '');
        /** 人名纵向排列时按行数拉高节点，避免与相邻岗位重叠 */
        const emLineCount = vacant ? 1 : Math.max(1, assignees.length);
        const boxH = Math.max(48, 26 + emLineCount * 16 + 6);
        const boxW = 128;
        let recruitBorder = '#f59e0b';
        let recruitEmColor = '#b45309';
        if (recruiting) {
          if (recruitPr === 'high') {
            recruitBorder = '#dc2626';
            recruitEmColor = '#b91c1c';
          } else if (recruitPr === 'low') {
            recruitBorder = '#64748b';
            recruitEmColor = '#475569';
          }
        }
        return {
          name: p.name,
          meta: {
            type: 'position',
            deptId,
            positionId: p.id,
            positionLevel: p.level || '',
            headName: '',
            count: assignees.length,
            vacant,
            recruiting,
            recruitPriority: recruitPr,
          },
          symbol: 'roundRect',
          symbolSize: [boxW, boxH],
          itemStyle: {
            color: vacant ? fillVacant : fillFilled,
            borderColor: recruiting ? recruitBorder : vacant ? '#94a3b8' : '#10b981',
            borderWidth: recruiting ? (recruitPr === 'high' ? 2.5 : 2) : 1.5,
            shadowBlur: 10,
            shadowColor: 'rgba(15, 23, 42, 0.1)',
            borderRadius: 8,
          },
          label: {
            show: true,
            position: 'inside',
            verticalAlign: 'middle',
            align: 'center',
            formatter: `{pn|${safePn}}\n{em|${safeEm}}`,
            rich: {
              pn: {
                fontSize: 12,
                fontWeight: '600',
                color: '#0f172a',
                align: 'center',
                padding: [4, 6, 2, 6],
                lineHeight: 16,
              },
              em: {
                fontSize: 11,
                fontWeight: recruiting ? '600' : vacant ? '400' : '500',
                color: recruiting ? recruitEmColor : vacant ? '#cbd5e1' : '#047857',
                align: 'center',
                padding: [0, 6, 4, 6],
                lineHeight: 16,
              },
            },
          },
          emphasis: {
            itemStyle: { shadowBlur: 18, borderWidth: 2 },
          },
          children: [],
        };
      });
  }

  /** 根据部门下岗位数等估算初始缩放，使默认视图尽量完整落在画布内 */
  function computeOrgTreeZoom(data) {
    let maxPos = 0;
    (data.departments || []).forEach((d) => {
      const n = data.positions.filter((p) => p.departmentId === d.id).length;
      maxPos = Math.max(maxPos, n);
    });
    const roots = (data.departments || []).filter((d) => d.parentId == null).length;
    let z = 1;
    if (maxPos >= 7) z = 0.5;
    else if (maxPos >= 6) z = 0.58;
    else if (maxPos >= 5) z = 0.66;
    else if (maxPos >= 4) z = 0.76;
    if (roots >= 6) z *= 0.9;
    else if (roots >= 5) z *= 0.94;
    return Math.max(0.32, Math.min(1, z));
  }

  /** 部门树 + 每部门下挂载岗位子节点 */
  function buildTree(deps, parentId, data, depth, ec) {
    const G = ec.graphic.LinearGradient;
    const tier = Math.min(depth, 2);
    const fills = [
      new G(0, 0, 0, 1, [{ offset: 0, color: '#a5b4fc' }, { offset: 1, color: '#6366f1' }]),
      new G(0, 0, 0, 1, [{ offset: 0, color: '#c4b5fd' }, { offset: 1, color: '#7c3aed' }]),
      new G(0, 0, 0, 1, [{ offset: 0, color: '#e2e8f0' }, { offset: 1, color: '#cbd5e1' }]),
    ];
    const borders = ['#4338ca', '#6d28d9', '#94a3b8'];
    const labelMain = tier < 2 ? '#ffffff' : '#0f172a';
    const labelSub = tier < 2 ? 'rgba(255,255,255,0.88)' : '#64748b';

    return deps
      .filter((d) => (d.parentId == null ? parentId == null : d.parentId === parentId))
      .sort((a, b) => String(a.name).localeCompare(b.name, 'zh-Hans-CN'))
      .map((d) => {
        const head = data.employees.find((e) => e.id === d.managerId);
        const count = data.employees.filter((e) => e.departmentId === d.id && e.status !== 'leave').length;
        const posCount = data.positions.filter((p) => p.departmentId === d.id).length;
        const sub = head
          ? `${head.name} · ${count} on duty · ${posCount} slots`
          : `${count} on duty · ${posCount} slots`;
        const safeName = String(d.name).replace(/[{}|]/g, '');
        const safeSub = String(sub).replace(/[{}|]/g, '');
        const subDeptChildren = buildTree(deps, d.id, data, depth + 1, ec);
        const posChildren = buildPositionNodes(d.id, data, ec);
        return {
          name: d.name,
          meta: { type: 'department', deptId: d.id, headName: head?.name || '', count, posCount },
          symbol: 'roundRect',
          symbolSize: depth === 0 ? [124, 52] : depth === 1 ? [116, 48] : [104, 44],
          itemStyle: {
            color: fills[tier],
            borderColor: borders[tier],
            borderWidth: tier < 2 ? 2 : 1,
            shadowBlur: 16,
            shadowColor: 'rgba(79, 70, 229, 0.22)',
            borderRadius: 10,
          },
          label: {
            show: true,
            position: 'inside',
            verticalAlign: 'middle',
            align: 'center',
            formatter: `{nm|${safeName}}\n{sm|${safeSub}}`,
            rich: {
              nm: {
                fontSize: depth === 0 ? 13 : 12,
                fontWeight: '600',
                color: labelMain,
                align: 'center',
                padding: [2, 6, 2, 6],
              },
              sm: {
                fontSize: 10,
                color: labelSub,
                align: 'center',
                lineHeight: 15,
                padding: [0, 6, 0, 6],
              },
            },
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 26,
              shadowColor: 'rgba(79, 70, 229, 0.35)',
              borderWidth: 3,
            },
          },
          children: [...subDeptChildren, ...posChildren],
        };
      });
  }

  window.TM.HrbpOrg = {
  name: 'HrbpOrganization',
  template: `
    <div class="page-stack">
      <div class="toolbar card pad wrap">
        <button type="button" class="btn btn-primary" @click="openDept('create')">Add department</button>
        <button type="button" class="btn btn-secondary" @click="openPos('create')">Add headcount slot</button>
        <span class="muted">Drag department rows to change hierarchy: drop on another department to make it a child; drop on the <strong>top-level zone</strong> below to clear parent. <strong>All changes go through approval</strong> (see requests below).</span>
      </div>
      <section class="card pad">
        <h3 class="section-title">Organization change approval</h3>
        <p class="muted small">Adding/removing departments, changing reporting lines, and adding/removing/updating headcount slots require approval from each department head in order, with the <strong>product line owner</strong> as final approver. Managers can act in <strong>Org approvals</strong> in the sidebar.</p>
        <p class="muted small">Tagging <strong>open roles</strong> or recruiting priority on vacant slots is recruiting maintenance and <strong>does not</strong> need org-structure approval (same rules as Recruitment).</p>
        <label class="field inline" style="margin-bottom:12px">
          <span>Product line owner (final approver)</span>
          <select v-model.number="orgOwnerId" class="input">
            <option v-for="e in data.employees" :key="'own-'+e.id" :value="e.id">{{ e.name }} ({{ e.id }})</option>
          </select>
        </label>
        <table v-if="orgRequestsSorted.length" class="data-table compact">
          <thead>
            <tr><th>Title</th><th>Type</th><th>Status</th><th>Pending approver</th><th>Chain</th><th>Submitted</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="r in orgRequestsSorted" :key="r.id">
              <td class="cell-clip">{{ r.title }}</td>
              <td>{{ orgTypeLabel(r.type) }}</td>
              <td>{{ orgStatusLabel(r.status) }}</td>
              <td>{{ r.pendingApproverId != null ? empName(r.pendingApproverId) : '—' }}</td>
              <td class="cell-clip muted small">{{ chainNames(r.approvalChain) }}</td>
              <td>{{ r.submittedAt }}</td>
              <td class="row-actions">
                <template v-if="r.status === 'pending' && canApproveAsMe(r)">
                  <button type="button" class="btn-link" @click="approveOrgReq(r)">Approve</button>
                  <button type="button" class="btn-link danger" @click="rejectOrgReq(r)">Reject</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted small">No approval records yet.</p>
      </section>
      <div class="card pad">
        <h3 class="section-title">Department list (drag to adjust hierarchy)</h3>
        <div
          class="dept-drop-root"
          :class="{ 'drag-over': rootDropOver }"
          @dragover.prevent="onRootDragOver"
          @dragleave="onRootDragLeave($event)"
          @drop.prevent="onDropAsRoot"
        >
          <i class="fa-solid fa-layer-group"></i> Drop here: set as top-level (no parent)
        </div>
        <table class="data-table compact dept-drag-table">
          <thead><tr><th class="col-drag"></th><th>Department</th><th>Parent</th><th>Head</th><th>Slots</th><th>Filled</th><th></th></tr></thead>
          <tbody>
            <tr
              v-for="row in deptRowsFlat"
              :key="row.dept.id"
              class="dept-row"
              :class="{ 'drag-over': dropTargetDeptId === row.dept.id, 'is-dragging': draggingDeptId === row.dept.id }"
              draggable="true"
              @dragstart="onDeptDragStart($event, row.dept)"
              @dragend="onDeptDragEnd"
              @dragover.prevent="onDeptDragOver($event, row.dept)"
              @dragleave="onDeptDragLeave(row.dept)"
              @drop.prevent="onDeptDrop($event, row.dept)"
            >
              <td class="col-drag" title="Drag to reorder"><i class="fa-solid fa-grip-vertical muted"></i></td>
              <td :style="{ paddingLeft: (12 + row.depth * 16) + 'px' }">
                <span v-if="row.depth" class="dept-tree-prefix muted">└ </span>{{ row.dept.name }}
              </td>
              <td>{{ parentDeptName(row.dept.parentId) }}</td>
              <td>{{ empName(row.dept.managerId) }}</td>
              <td>{{ deptPositionCount(row.dept.id) }}</td>
              <td>{{ deptOnDutyCount(row.dept.id) }}</td>
              <td class="dept-row-actions">
                <button type="button" class="btn-link" @click.stop="openPos('create', null, row.dept.id)">New slot</button>
                <button type="button" class="btn-link" @click="openDept('edit', row.dept)">Edit</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card pad org-chart-card">
        <h3 class="section-title">Organization chart</h3>
        <p class="muted small org-chart-hint">Root is the <strong>product line</strong> (owner defaults to the product department head from master data if set, else the first top-level department head). Reporting lines flow top-down. <strong>Structural changes</strong> are not applied until approved. <strong>Position nodes</strong> stack names vertically; empty slots grow taller when needed. <strong>Click a department</strong> to expand/collapse children and <strong>slots</strong>; <strong>right-click</strong> a department to <strong>add a headcount slot</strong> (with approval; optional “mark open after create”). <strong>Click a slot</strong> for incumbents; only <strong>vacant</strong> slots can be tagged open / priority (no org approval). Open-role borders: <strong class="recruit-legend high">High</strong>, <strong class="recruit-legend medium">Medium</strong>, <strong class="recruit-legend low">Low</strong>.</p>
        <div ref="chartRef" class="chart-tall org-chart-canvas"></div>
        <h4 class="subsection-title">Active headcount by department</h4>
        <p class="muted small">Active (non-terminated) employees per department; matches department nodes on the chart.</p>
        <div ref="deptCountBarRef" class="chart-box short dept-in-org-bar"></div>
      </div>

      <div class="card pad">
        <h3 class="section-title">Open recruiting slots</h3>
        <p class="muted small">Slots marked <strong>open</strong> that are still vacant; sorted <strong>High → Medium → Low</strong> priority. Adjust or clear here (<strong>no org approval</strong>). Syncs to <router-link to="/hrbp/recruitment">Recruitment · overview</router-link> (upload process data there).</p>
        <table v-if="recruitListRows.length" class="data-table compact recruit-list-table">
          <thead><tr><th>Priority</th><th>Department</th><th>Role</th><th>Level</th><th></th></tr></thead>
          <tbody>
            <tr v-for="row in recruitListRows" :key="row.key">
              <td>
                <select class="recruit-priority-select" :value="row.priority" @change="onRecruitPriorityChange(row, $event)">
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </td>
              <td>{{ row.deptName }}</td>
              <td>{{ row.positionName }}</td>
              <td>{{ row.level }}</td>
              <td><button type="button" class="btn-link danger" @click="removeRecruitRow(row)">Clear open tag</button></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted small">No open vacant slots. Expand a department on the chart, click a vacant slot, and mark it open to add it here.</p>
      </div>

      <div v-if="deptModal" class="modal-backdrop" @click.self="deptModal = false">
        <div class="modal card">
          <h3>{{ deptMode === 'create' ? 'Add department' : 'Edit department' }}</h3>
          <form class="form-grid" @submit.prevent="saveDept">
            <label class="field"><span>Name</span><input v-model="deptForm.name" required /></label>
            <label class="field"><span>Parent department</span>
              <select v-model="deptForm.parentId">
                <option :value="null">None (top-level)</option>
                <option v-for="d in data.departments" :key="d.id" :value="d.id" :disabled="d.id === deptForm.id">{{ d.name }}</option>
              </select>
            </label>
            <label class="field"><span>Department head</span>
              <select v-model.number="deptForm.managerId">
                <option v-for="e in data.employees" :key="e.id" :value="e.id">{{ e.name }}</option>
              </select>
            </label>
            <div class="modal-actions">
              <button v-if="deptMode === 'edit'" type="button" class="btn btn-ghost danger" @click="removeDept">Delete</button>
              <button type="button" class="btn btn-ghost" @click="deptModal = false">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>

      <div v-if="posModal" class="modal-backdrop" @click.self="posModal = false">
        <div class="modal card">
          <h3>{{ posMode === 'create' ? 'Add headcount slot' : 'Edit headcount slot' }}</h3>
          <form class="form-grid" @submit.prevent="savePos">
            <label class="field"><span>Department</span>
              <select v-model.number="posForm.departmentId" required>
                <option v-for="d in data.departments" :key="d.id" :value="d.id">{{ d.name }}</option>
              </select>
            </label>
            <label class="field"><span>Job function</span>
              <select v-if="posMode === 'create'" v-model="posForm.name" required>
                <option
                  v-for="t in jobTradesList"
                  :key="t"
                  :value="t"
                  :disabled="positionTradeTaken(t)"
                >{{ t }}{{ positionTradeTaken(t) ? ' (taken)' : '' }}</option>
              </select>
              <select v-else v-model="posForm.name" required>
                <option v-for="t in jobTradesList" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <p v-if="posMode === 'create' && !tradesAvailableForCreate.length" class="muted small" style="grid-column:1/-1">All seven job functions already have slots in this department; edit or remove an existing slot first.</p>
            <label class="field"><span>Level</span>
              <select v-model="posForm.level" required>
                <option v-for="lv in jobLevelsList" :key="lv" :value="lv">{{ lv }}</option>
              </select>
            </label>
            <label v-if="posMode === 'create'" class="field full pos-create-options">
              <span class="checkbox-inline">
                <input type="checkbox" v-model="posMarkRecruitAfterCreate" />
                Mark as open after create (adds vacant slot to open list; set priority later)
              </span>
            </label>
            <div class="modal-actions">
              <button v-if="posMode === 'edit'" type="button" class="btn btn-ghost danger" @click="removePos">Delete</button>
              <button type="button" class="btn btn-ghost" @click="posModal = false">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="posMode === 'create' && !tradesAvailableForCreate.length">Save</button>
            </div>
          </form>
        </div>
      </div>

      <div v-if="slotModal && slotPosition" class="modal-backdrop" @click.self="closeSlotModal">
        <div class="modal card wide">
          <h3>Headcount slot · {{ slotPosition.name }}</h3>
          <div class="form-grid" style="margin-bottom:12px">
            <p class="muted small" style="grid-column:1/-1">Department: <strong>{{ deptName(slotCtx.deptId) }}</strong> · Level: <strong>{{ slotPosition.level || '—' }}</strong></p>
            <div style="grid-column:1/-1">
              <div class="muted small" style="margin-bottom:6px">Incumbents</div>
              <ul v-if="slotAssignees.length" class="member-list">
                <li v-for="e in slotAssignees" :key="e.id">{{ e.name }} · {{ statusLabel(e.status) }}</li>
              </ul>
              <p v-else class="muted small">No incumbents (empty on chart; you can mark as open)</p>
            </div>
            <label v-if="slotRecruiting" class="field" style="grid-column:1/-1">
              <span>Recruiting priority</span>
              <select :value="slotRecruitPriority" @change="onSlotRecruitPriorityChange($event)">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
          <div class="modal-actions" style="flex-wrap:wrap;gap:8px">
            <button v-if="slotVacant" type="button" class="btn" :class="slotRecruiting ? 'btn-secondary' : 'btn-primary'" @click="toggleRecruitSlot">
              {{ slotRecruiting ? 'Clear open tag' : 'Mark as open' }}
            </button>
            <button type="button" class="btn btn-secondary" @click="openPosFromSlot">Edit slot</button>
            <button type="button" class="btn btn-ghost" @click="closeSlotModal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const data = useDataStore();
    const auth = useAuthStore();
    const chartRef = ref(null);
    const deptCountBarRef = ref(null);
    let chartInst;
    let deptBarInst;
    let echartsLib;

    const deptModal = ref(false);
    const deptMode = ref('create');
    const deptForm = ref({ name: '', parentId: null, managerId: null, id: null });

    const posModal = ref(false);
    const posMode = ref('create');
    const posForm = ref({ name: '', level: 'EE', departmentId: 1, id: null });
    const posMarkRecruitAfterCreate = ref(false);

    const jobTradesList = computed(() => window.TM.JOB_TRADES || ['Frontend', 'Mobile', 'Backend', 'SDET', 'QA', 'Algorithm', 'Big Data']);
    const jobLevelsList = computed(() => window.TM.JOB_LEVELS || ['E', 'SE', 'EE', 'SEE', 'AM', 'M', 'PE', 'SM']);

    /** 与 persist 中 departmentId 可能为数字或字符串的情况兼容，避免误判「已有编制」而隐藏可选工种 */
    function tradeNamesTakenInDept(deptId) {
      const depId = Number(deptId);
      if (Number.isNaN(depId)) return new Set();
      return new Set(
        data.positions
          .filter((p) => Number(p.departmentId) === depId)
          .map((p) => String(p.name || '').trim()),
      );
    }

    function positionTradeTaken(trade) {
      const taken = tradeNamesTakenInDept(posForm.value?.departmentId);
      return taken.has(String(trade || '').trim());
    }

    const tradesAvailableForCreate = computed(() => {
      const depId = Number(posForm.value?.departmentId);
      const list = jobTradesList.value;
      if (Number.isNaN(depId)) return [...list];
      const taken = tradeNamesTakenInDept(depId);
      return list.filter((t) => !taken.has(t));
    });

    const slotModal = ref(false);
    const slotCtx = ref(null);

    const draggingDeptId = ref(null);
    const dropTargetDeptId = ref(null);
    const rootDropOver = ref(false);

    const orgOwnerId = computed({
      get() {
        const v = data.orgSettings?.productLineOwnerEmployeeId;
        if (v != null && data.employees.some((e) => e.id === Number(v))) return Number(v);
        return null;
      },
      set(v) {
        data.updateOrgSettings({ productLineOwnerEmployeeId: v != null ? Number(v) : null });
      },
    });

    const orgRequestsSorted = computed(() => [...(data.orgChangeRequests || [])].sort((a, b) => Number(b.id) - Number(a.id)));

    function orgTypeLabel(t) {
      return {
        dept_create: 'Add department',
        dept_delete: 'Remove department',
        dept_update: 'Department change',
        position_create: 'Add headcount slot',
        position_delete: 'Remove headcount slot',
        position_update: 'Update headcount slot',
      }[t] || t;
    }
    function orgStatusLabel(s) {
      return { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }[s] || s;
    }
    function chainNames(ids) {
      return (ids || []).map((id) => empName(id)).join(' → ');
    }
    function canApproveAsMe(r) {
      const me = auth.currentUser?.employeeId;
      return me != null && Number(r.pendingApproverId) === Number(me);
    }
    function approveOrgReq(r) {
      if (!canApproveAsMe(r)) return;
      if (data.approveOrgChangeRequest(r.id, auth.currentUser.employeeId)) {
        renderChart();
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Approved', type: 'success' } }));
      } else {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Action failed', type: 'error' } }));
      }
    }
    function rejectOrgReq(r) {
      if (!canApproveAsMe(r)) return;
      const note = window.prompt('Rejection reason (optional)', '') || '';
      if (data.rejectOrgChangeRequest(r.id, auth.currentUser.employeeId, note)) {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Rejected', type: 'info' } }));
      }
    }

    /** 按树形深度优先展开，用于缩进展示 */
    function flattenDepartments(deps) {
      const list = deps || [];
      const byParent = (pid) => list
        .filter((d) => (pid == null ? d.parentId == null : d.parentId === pid))
        .sort((a, b) => String(a.name).localeCompare(b.name, 'zh-Hans-CN'));
      const walk = (pid, depth) => byParent(pid).flatMap((d) => [{ dept: d, depth }, ...walk(d.id, depth + 1)]);
      return walk(null, 0);
    }

    const deptRowsFlat = computed(() => flattenDepartments(data.departments));

    /** newParent 是否在当前拖拽部门的子树内（会造成环） */
    function isDescendantOf(ancestorId, candId) {
      const children = data.departments.filter((d) => d.parentId === ancestorId);
      for (const c of children) {
        if (c.id === candId) return true;
        if (isDescendantOf(c.id, candId)) return true;
      }
      return false;
    }

    function canSetParent(dragId, newParentId) {
      if (newParentId == null) return true;
      if (newParentId === dragId) return false;
      if (isDescendantOf(dragId, newParentId)) return false;
      return true;
    }

    function onDeptDragStart(e, d) {
      draggingDeptId.value = d.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(d.id));
      try {
        e.dataTransfer.setData('application/x-tm-dept', String(d.id));
      } catch (_) { /* IE */ }
    }

    function onDeptDragEnd() {
      draggingDeptId.value = null;
      dropTargetDeptId.value = null;
      rootDropOver.value = false;
    }

    function onDeptDragOver(e, targetDept) {
      e.dataTransfer.dropEffect = 'move';
      const from = draggingDeptId.value;
      if (from == null || !canSetParent(from, targetDept.id)) {
        dropTargetDeptId.value = null;
        return;
      }
      dropTargetDeptId.value = targetDept.id;
    }

    function onDeptDragLeave(targetDept) {
      if (dropTargetDeptId.value === targetDept.id) dropTargetDeptId.value = null;
    }

    function onDeptDrop(e, targetDept) {
      const fromId = draggingDeptId.value ?? Number(e.dataTransfer.getData('text/plain'));
      dropTargetDeptId.value = null;
      if (!fromId || fromId === targetDept.id) return;
      if (!canSetParent(fromId, targetDept.id)) {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Cannot move a department under itself or its descendants', type: 'error' } }));
        return;
      }
      const dragged = data.departments.find((d) => d.id === fromId);
      const oldP = dragged ? dragged.parentId : null;
      if (oldP === targetDept.id) return;
      data.submitOrgChangeRequest({
        type: 'dept_update',
        title: `Reporting line: "${dragged?.name || fromId}" → parent "${targetDept.name}"`,
        payload: { id: fromId, patch: { parentId: targetDept.id }, prevParentId: oldP },
      });
      renderChart();
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Submitted for approval: department reporting line', type: 'success' } }));
    }

    function onRootDragOver(e) {
      e.dataTransfer.dropEffect = 'move';
      rootDropOver.value = true;
    }

    function onRootDragLeave(e) {
      const rel = e.relatedTarget;
      if (!rel || !e.currentTarget.contains(rel)) rootDropOver.value = false;
    }

    function onDropAsRoot(e) {
      rootDropOver.value = false;
      const fromId = draggingDeptId.value ?? Number(e.dataTransfer.getData('text/plain'));
      if (!fromId) return;
      const dragged = data.departments.find((d) => d.id === fromId);
      const oldP = dragged ? dragged.parentId : null;
      if (oldP == null) return;
      data.submitOrgChangeRequest({
        type: 'dept_update',
        title: `Reporting line: "${dragged?.name || fromId}" → top-level`,
        payload: { id: fromId, patch: { parentId: null }, prevParentId: oldP },
      });
      renderChart();
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Submitted for approval: set as top-level department', type: 'success' } }));
    }

    const slotPosition = computed(() => {
      const c = slotCtx.value;
      if (!c) return null;
      return data.positions.find((p) => p.id === c.positionId) || null;
    });

    const slotAssignees = computed(() => {
      const c = slotCtx.value;
      if (!c) return [];
      return data.employees.filter(
        (e) => e.positionId === c.positionId && e.departmentId === c.deptId && e.status !== 'leave',
      );
    });

    const slotVacant = computed(() => slotAssignees.value.length === 0);

    const slotRecruiting = computed(() => {
      const c = slotCtx.value;
      if (!c || !slotVacant.value) return false;
      return data.isPositionRecruitTagged(c.deptId, c.positionId);
    });

    const slotRecruitPriority = computed(() => {
      const c = slotCtx.value;
      if (!c) return 'medium';
      return data.getPositionRecruitPriority(c.deptId, c.positionId) || 'medium';
    });

    const recruitPriorityOrder = { high: 0, medium: 1, low: 2 };

    const recruitListRows = computed(() => {
      const tags = data.positionRecruitTags || {};
      const rows = [];
      Object.keys(tags).forEach((key) => {
        const m = key.match(/^(\d+)-(\d+)$/);
        if (!m) return;
        const deptId = Number(m[1]);
        const positionId = Number(m[2]);
        const p = data.positions.find((x) => x.id === positionId && x.departmentId === deptId);
        if (!p) return;
        const assignees = data.employees.filter(
          (e) => e.positionId === positionId && e.departmentId === deptId && e.status !== 'leave',
        );
        if (assignees.length > 0) return;
        const priority = data.getPositionRecruitPriority(deptId, positionId) || 'medium';
        rows.push({
          key,
          deptId,
          positionId,
          deptName: data.departments.find((d) => d.id === deptId)?.name || '—',
          positionName: p.name,
          level: p.level || '—',
          priority,
        });
      });
      rows.sort((a, b) => {
        const d = recruitPriorityOrder[a.priority] - recruitPriorityOrder[b.priority];
        if (d !== 0) return d;
        return `${a.deptName}${a.positionName}`.localeCompare(`${b.deptName}${b.positionName}`, 'zh-Hans-CN');
      });
      return rows;
    });

    function deptPositionCount(deptId) {
      return data.positions.filter((p) => p.departmentId === deptId).length;
    }

    function deptOnDutyCount(deptId) {
      return data.employees.filter((e) => e.departmentId === deptId && e.status !== 'leave').length;
    }

    function deptName(id) {
      return data.departments.find((d) => d.id === id)?.name || '-';
    }
    function parentDeptName(pid) {
      if (pid == null) return '—';
      return deptName(pid);
    }
    function empName(eid) {
      return data.employees.find((e) => e.id === eid)?.name || '—';
    }
    function posName(id) {
      return data.positions.find((p) => p.id === id)?.name || '-';
    }
    function statusLabel(s) {
      return { active: 'Active', probation: 'Probation', leave: 'Leaving' }[s] || s;
    }

    function drawDeptCountBar() {
      if (!deptCountBarRef.value || !echartsLib) return;
      const deptCount = {};
      data.employees.filter((e) => e.status !== 'leave').forEach((e) => {
        const d = data.departments.find((x) => x.id === e.departmentId);
        const name = d?.name || 'Unassigned';
        deptCount[name] = (deptCount[name] || 0) + 1;
      });
      const keys = Object.keys(deptCount).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
      const vals = keys.map((k) => deptCount[k]);
      if (!deptBarInst) deptBarInst = echartsLib.init(deptCountBarRef.value);
      deptBarInst.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '8%', right: '4%', bottom: keys.length > 5 ? '24%' : '14%', top: '12%' },
        xAxis: {
          type: 'category',
          data: keys,
          axisLabel: { color: '#64748b', interval: 0, rotate: keys.length > 5 ? 30 : 0 },
        },
        yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed' } } },
        series: [{
          type: 'bar',
          name: 'Active headcount',
          data: vals,
          itemStyle: { color: '#f59e0b', borderRadius: [6, 6, 0, 0] },
        }],
      });
    }

    function productLineLeaderName() {
      const pd = data.departments.find((d) => d.name === 'Product' || d.name === '产品部');
      if (pd?.managerId != null) {
        const nm = empName(pd.managerId);
        if (nm && nm !== '—') return nm;
      }
      const roots = [...data.departments]
        .filter((d) => d.parentId == null)
        .sort((a, b) => Number(a.id) - Number(b.id));
      for (let i = 0; i < roots.length; i += 1) {
        const r = roots[i];
        if (r.managerId == null) continue;
        const nm = empName(r.managerId);
        if (nm && nm !== '—') return nm;
      }
      return '—';
    }

    function renderChart() {
      if (!chartRef.value || !echartsLib) return;
      const ec = echartsLib;
      const G = ec.graphic.LinearGradient;
      const roots = buildTree(data.departments, null, data, 0, ec);
      const headCount = data.employees.filter((e) => e.status !== 'leave').length;
      const leader = String(productLineLeaderName()).replace(/[{}|]/g, '');
      const subLabel = `Owner: ${leader} · ${headCount} active · click to expand`;
      const treeZoom = computeOrgTreeZoom(data);
      const treeData = [{
        name: 'Product line',
        meta: { type: 'root', deptId: null, headName: leader, count: headCount },
        symbol: 'roundRect',
        symbolSize: [152, 54],
        itemStyle: {
          color: new G(0, 0, 0, 1, [{ offset: 0, color: '#312e81' }, { offset: 1, color: '#1e1b4b' }]),
          borderColor: '#6366f1',
          borderWidth: 2,
          shadowBlur: 22,
          shadowColor: 'rgba(49, 46, 129, 0.45)',
          borderRadius: 12,
        },
        label: {
          show: true,
          position: 'inside',
          verticalAlign: 'middle',
          formatter: '{rt|Product line}\n{rs|' + subLabel + '}',
          rich: {
            rt: { color: '#fff', fontSize: 15, fontWeight: '700', align: 'center', padding: [4, 8, 2, 8] },
            rs: { color: 'rgba(255,255,255,0.78)', fontSize: 10, lineHeight: 16, align: 'center', padding: [0, 8, 4, 8] },
          },
        },
        emphasis: {
          itemStyle: { shadowBlur: 32, shadowColor: 'rgba(99, 102, 241, 0.5)', borderWidth: 3 },
        },
        children: roots,
      }];
      if (!chartInst) chartInst = ec.init(chartRef.value, null, { renderer: 'canvas' });
      chartInst.setOption({
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          enterable: true,
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          borderColor: '#334155',
          borderWidth: 1,
          padding: [10, 14],
          textStyle: { color: '#f1f5f9', fontSize: 12 },
          formatter(p) {
            const m = p.data?.meta;
            const nm = escapeHtml(p.name || '');
            if (m?.type === 'root' || (m && m.deptId == null && m.type !== 'position')) {
              return `<div style="font-weight:600;margin-bottom:6px">${nm}</div>`
                + `<div style="opacity:.9;line-height:1.6">Product line owner: <b>${escapeHtml(m.headName || '—')}</b></div>`
                + `<div style="opacity:.9;line-height:1.6">Active employees: <b>${escapeHtml(m.count)}</b></div>`
                + `<div style="opacity:.65;font-size:11px;margin-top:6px">Click child nodes to expand departments and slots</div>`;
            }
            if (m?.type === 'position') {
              const dname = data.departments.find((d) => d.id === m.deptId)?.name || '—';
              const nameList = data.employees
                .filter((e) => e.positionId === m.positionId && e.departmentId === m.deptId && e.status !== 'leave')
                .map((e) => e.name);
              const namesHtml = nameList.length
                ? nameList.map((n) => `<div style="margin:2px 0">${escapeHtml(n)}</div>`).join('')
                : '(empty)';
              const rec = m.vacant && data.isPositionRecruitTagged(m.deptId, m.positionId);
              const pr = rec ? (data.getPositionRecruitPriority(m.deptId, m.positionId) || 'medium') : null;
              const prEn = pr === 'high' ? 'High' : pr === 'low' ? 'Low' : 'Medium';
              return `<div style="font-weight:600;margin-bottom:6px">${nm}</div>`
                + `<div style="opacity:.9;line-height:1.65">Department: <b>${escapeHtml(dname)}</b></div>`
                + `<div style="opacity:.9">Level: <b>${escapeHtml(m.positionLevel || '—')}</b></div>`
                + `<div style="opacity:.9">Incumbents:</div><div style="opacity:.95;line-height:1.5">${namesHtml}</div>`
                + (m.vacant ? `<div style="opacity:.85;margin-top:4px">${rec ? `Marked <b>open</b> · priority <b>${prEn}</b>` : 'Not marked open; click node to tag'}</div>` : '')
                + `<div style="opacity:.55;font-size:11px;margin-top:8px">Click node for details</div>`;
            }
            if (!m) return nm;
            const pc = m.posCount != null ? m.posCount : data.positions.filter((p) => p.departmentId === m.deptId).length;
            return `<div style="font-weight:600;margin-bottom:6px">${nm}</div>`
              + `<div style="opacity:.9;line-height:1.65">Head: <b>${escapeHtml(m.headName || '—')}</b></div>`
              + `<div style="opacity:.9">Headcount slots: <b>${escapeHtml(pc)}</b> · Filled: <b>${escapeHtml(m.count)}</b></div>`
              + `<div style="opacity:.55;font-size:11px;margin-top:8px">Click to expand; <b>right-click</b> to add a slot here</div>`;
          },
        },
        series: [{
          type: 'tree',
          data: treeData,
          top: '1%',
          left: '1%',
          bottom: '1%',
          right: '1%',
          orient: 'TB',
          layout: 'orthogonal',
          edgeShape: 'curve',
          roam: true,
          zoom: treeZoom,
          scaleLimit: { min: 0.22, max: 2.8 },
          symbolOffset: [0, 0],
          initialTreeDepth: 2,
          layerPadding: 26,
          nodePadding: 12,
          lineStyle: {
            color: '#9ca8f0',
            width: 2,
            curveness: 0.45,
          },
          emphasis: {
            focus: 'descendant',
            blurScope: 'coordinateSystem',
            lineStyle: { width: 3, color: '#6366f1' },
          },
          blur: {
            itemStyle: { opacity: 0.25 },
            label: { opacity: 0.25 },
          },
          expandAndCollapse: true,
          animationDuration: 380,
          animationDurationUpdate: 280,
        }],
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          chartInst.resize();
        });
      });
      chartInst.off('click');
      chartInst.on('click', (params) => {
        const meta = params.data?.meta;
        if (meta?.type === 'position') {
          slotCtx.value = { deptId: meta.deptId, positionId: meta.positionId };
          slotModal.value = true;
        }
      });
      chartInst.off('contextmenu');
      chartInst.on('contextmenu', (params) => {
        params.event?.event?.preventDefault?.();
        params.event?.event?.stopPropagation?.();
        const meta = params.data?.meta;
        if (meta?.type === 'department') {
          openPos('create', null, meta.deptId);
        }
      });
      drawDeptCountBar();
    }

    watch(
      () => [data.orgSettings?.productLineOwnerEmployeeId, data.employees.length],
      () => {
        if (data.orgSettings?.productLineOwnerEmployeeId != null) return;
        if (!data.employees.length) return;
        const first = [...data.employees].filter((e) => e.status !== 'leave').sort((a, b) => a.id - b.id)[0];
        if (first) data.updateOrgSettings({ productLineOwnerEmployeeId: first.id });
      },
      { immediate: true },
    );

    onMounted(async () => {
      echartsLib = await loadEcharts();
      renderChart();
      window.addEventListener('resize', () => {
        chartInst?.resize();
        deptBarInst?.resize();
      });
    });

    watch(
      () => [
        data.departments.length,
        data.employees.length,
        data.positions.length,
        data.departments.map((d) => `${d.id}:${d.parentId ?? ''}`).join('|'),
        data.employees.map((e) => `${e.id}:${e.status}:${e.departmentId}:${e.positionId ?? ''}`).join('|'),
        data.positions.map((p) => `${p.id}:${p.departmentId}:${p.name}:${p.level}`).join('|'),
        JSON.stringify(data.positionRecruitTags || {}),
        JSON.stringify(data.orgChangeRequests || []),
      ],
      () => { if (chartInst) renderChart(); },
    );

    watch(
      () => [posModal.value, posMode.value, posForm.value?.departmentId, data.positions.length],
      () => {
        if (!posModal.value || posMode.value !== 'create') return;
        const avail = tradesAvailableForCreate.value;
        if (!avail.length) return;
        if (!avail.includes(posForm.value.name)) {
          posForm.value.name = avail[0];
        }
      },
    );

    onUnmounted(() => {
      chartInst?.dispose();
      deptBarInst?.dispose();
    });

    function openDept(mode, row) {
      deptMode.value = mode;
      if (mode === 'create') {
        deptForm.value = { name: '', parentId: null, managerId: data.employees[0]?.id };
      } else {
        deptForm.value = { ...row };
      }
      deptModal.value = true;
    }

    function saveDept() {
      if (deptMode.value === 'create') {
        data.submitOrgChangeRequest({
          type: 'dept_create',
          title: `Add department: ${deptForm.value.name}`,
          payload: {
            name: deptForm.value.name,
            parentId: deptForm.value.parentId,
            managerId: deptForm.value.managerId,
          },
        });
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Submitted for approval: new department', type: 'success' } }));
      } else {
        const orig = data.departments.find((d) => d.id === deptForm.value.id);
        if (!orig) return;
        const patch = {};
        if (deptForm.value.name !== orig.name) patch.name = deptForm.value.name;
        if (deptForm.value.parentId !== orig.parentId) patch.parentId = deptForm.value.parentId;
        if (Number(deptForm.value.managerId) !== Number(orig.managerId)) patch.managerId = deptForm.value.managerId;
        if (Object.keys(patch).length === 0) {
          deptModal.value = false;
          return;
        }
        data.submitOrgChangeRequest({
          type: 'dept_update',
          title: `Update department "${orig.name}"`,
          payload: { id: orig.id, patch, prevParentId: orig.parentId },
        });
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Submitted for approval: department update', type: 'success' } }));
      }
      deptModal.value = false;
      renderChart();
    }

    function removeDept() {
      if (!confirm('Submit removal of this department? Effective after approval.')) return;
      const d = deptForm.value;
      data.submitOrgChangeRequest({
        type: 'dept_delete',
        title: `Remove department "${d.name}"`,
        payload: { id: d.id },
      });
      deptModal.value = false;
      renderChart();
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Submitted for approval: remove department', type: 'success' } }));
    }

    function openPos(mode, row, presetDeptId) {
      posMode.value = mode;
      posMarkRecruitAfterCreate.value = false;
      const list = window.TM.JOB_TRADES || ['Frontend', 'Mobile', 'Backend', 'SDET', 'QA', 'Algorithm', 'Big Data'];
      if (mode === 'create') {
        const did = presetDeptId != null && !Number.isNaN(Number(presetDeptId))
          ? Number(presetDeptId)
          : Number(data.departments[0]?.id);
        const taken = tradeNamesTakenInDept(did);
        const first = list.find((t) => !taken.has(t)) || list[0];
        posForm.value = { name: first, level: 'EE', departmentId: did };
      } else {
        posForm.value = { ...row };
      }
      posModal.value = true;
    }

    function savePos() {
      if (posMode.value === 'create') {
        const { name, level, departmentId } = posForm.value;
        const depId = Number(departmentId);
        const taken = tradeNamesTakenInDept(depId);
        if (taken.has(String(name || '').trim())) {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'This department already has that job slot', type: 'error' } }));
          return;
        }
        data.submitOrgChangeRequest({
          type: 'position_create',
          title: `Add headcount slot: ${name} (dept ${deptName(depId)})`,
          payload: {
            departmentId: depId,
            name,
            level,
            markRecruitAfter: !!posMarkRecruitAfterCreate.value,
          },
        });
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Submitted for approval: new headcount slot', type: 'success' } }));
      } else {
        const orig = data.positions.find((p) => p.id === posForm.value.id);
        if (!orig) return;
        const patch = {};
        if (String(posForm.value.name).trim() !== String(orig.name).trim()) patch.name = posForm.value.name;
        if (String(posForm.value.level).trim() !== String(orig.level || '').trim()) patch.level = posForm.value.level;
        if (Number(posForm.value.departmentId) !== Number(orig.departmentId)) patch.departmentId = Number(posForm.value.departmentId);
        if (Object.keys(patch).length === 0) {
          posModal.value = false;
          return;
        }
        data.submitOrgChangeRequest({
          type: 'position_update',
          title: `Update headcount slot "${orig.name}"`,
          payload: { id: orig.id, patch },
        });
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Submitted for approval: update headcount slot', type: 'success' } }));
      }
      posModal.value = false;
      posMarkRecruitAfterCreate.value = false;
      renderChart();
    }

    function removePos() {
      if (!confirm('Submit removal of this headcount slot? Effective after approval.')) return;
      const p = posForm.value;
      data.submitOrgChangeRequest({
        type: 'position_delete',
        title: `Remove headcount slot "${p.name}"`,
        payload: { id: p.id },
      });
      posModal.value = false;
      renderChart();
      window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Submitted for approval: remove headcount slot', type: 'success' } }));
    }

    function closeSlotModal() {
      slotModal.value = false;
      slotCtx.value = null;
    }

    function toggleRecruitSlot() {
      const c = slotCtx.value;
      if (!c) return;
      data.togglePositionRecruit(c.deptId, c.positionId);
      renderChart();
    }

    function onRecruitPriorityChange(row, ev) {
      data.setPositionRecruitPriority(row.deptId, row.positionId, ev.target.value);
      renderChart();
    }

    function removeRecruitRow(row) {
      data.setPositionRecruitTagged(row.deptId, row.positionId, false);
      renderChart();
    }

    function onSlotRecruitPriorityChange(ev) {
      const c = slotCtx.value;
      if (!c) return;
      data.setPositionRecruitPriority(c.deptId, c.positionId, ev.target.value);
      renderChart();
    }

    function openPosFromSlot() {
      const p = slotPosition.value;
      if (!p) return;
      closeSlotModal();
      openPos('edit', p);
    }

    return {
      data, auth, orgOwnerId, orgRequestsSorted, orgTypeLabel, orgStatusLabel, chainNames, canApproveAsMe, approveOrgReq, rejectOrgReq,
      chartRef, deptCountBarRef, deptModal, deptMode, deptForm,
      posModal, posMode, posForm, posMarkRecruitAfterCreate, jobTradesList, jobLevelsList, tradesAvailableForCreate, positionTradeTaken,
      slotModal, slotCtx, slotPosition, slotAssignees, slotVacant, slotRecruiting, slotRecruitPriority,
      recruitListRows, onRecruitPriorityChange, removeRecruitRow, onSlotRecruitPriorityChange,
      deptName, parentDeptName, empName, posName, statusLabel,
      deptPositionCount, deptOnDutyCount,
      deptRowsFlat, draggingDeptId, dropTargetDeptId, rootDropOver,
      onDeptDragStart, onDeptDragEnd, onDeptDragOver, onDeptDragLeave, onDeptDrop,
      onRootDragOver, onRootDragLeave, onDropAsRoot,
      openDept, saveDept, removeDept, openPos, savePos, removePos,
      closeSlotModal, toggleRecruitSlot, openPosFromSlot,
    };
  },
};
})();
