/**
 * HRBP User Management — super_admin only
 * Features:
 *   - HRBP user CRUD (super_admin / admin / intern)
 *   - Manager permission matrix (module access + granular ops)
 *   - RM nomination approval queue
 */
(function () {
  const { computed, ref, reactive, watch } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useAuthStore = window.TM.useAuthStore;

  const SUBTYPE_LABELS = { super_admin: 'HRBP 超级管理员', admin: 'HRBP 管理员', intern: '实习生', product_line_owner: '产品线负责人' };
  const ROLE_LABELS = { hrbp: 'HRBP', manager: '汇报经理', product_line_owner: '产品线负责人' };
  const MODULE_LABELS = {
    dashboard: 'Dashboard', roster: '花名册', org: '组织管理',
    recruitment: '招聘管理', talent: '人才盘点', performance: '绩效', attendance: '考勤',
    ai_analyst: 'AI 数据分析',
  };
  const RM_STATUS_LABELS = { pending_approval: '待审批', active: '已激活', revoked: '已撤销' };
  const RM_STATUS_CLASS = { pending_approval: 'tag-warn', active: 'tag-ok', revoked: 'tag-err' };

  function toast(msg, type) {
    window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: msg, type: type || 'info' } }));
  }

  window.TM.HrbpUserManagement = {
    name: 'HrbpUserManagement',
    template: `
    <div class="page-stack">
      <div class="card pad">
        <h2 class="section-title"><i class="fa-solid fa-user-shield"></i> 用户管理</h2>
        <p class="muted small">管理所有用户的角色、模块访问和操作权限。仅 HRBP 超级管理员可操作。</p>
      </div>

      <!-- Tabs -->
      <div class="recruit-tabs" style="margin-bottom:0">
        <button type="button" :class="['btn','btn-sm', tab==='users'?'btn-primary':'btn-ghost']" @click="tab='users'">
          <i class="fa-solid fa-users"></i> 用户列表
        </button>
        <button type="button" :class="['btn','btn-sm', tab==='pending'?'btn-primary':'btn-ghost']" @click="tab='pending'">
          <i class="fa-solid fa-clock"></i> RM 审批队列
          <span v-if="pendingRMs.length" class="perf-badge">{{ pendingRMs.length }}</span>
        </button>
        <button type="button" :class="['btn','btn-sm', tab==='perms'?'btn-primary':'btn-ghost']" @click="tab='perms'">
          <i class="fa-solid fa-table-cells"></i> 权限总览
        </button>
        <button type="button" :class="['btn','btn-sm', tab==='nominate'?'btn-primary':'btn-ghost']" @click="tab='nominate'">
          <i class="fa-solid fa-user-plus"></i> 提名 RM
        </button>
      </div>

      <!-- ═══ Tab 1: User list ═══ -->
      <template v-if="tab==='users'">
        <div class="card pad">
          <div class="toolbar wrap" style="gap:8px;margin-bottom:12px">
            <button type="button" class="btn btn-primary btn-sm" @click="openAdd"><i class="fa-solid fa-plus"></i> 新增用户</button>
            <label class="field inline" style="margin-left:auto">
              <span>筛选</span>
              <select v-model="filterRole" class="input input-sm" style="min-width:120px">
                <option value="">全部</option>
                <option value="hrbp">HRBP</option>
                <option value="manager">汇报经理</option>
                <option value="product_line_owner">产品线负责人</option>
              </select>
            </label>
          </div>
          <div style="overflow:auto">
            <table class="data-table compact">
              <thead>
                <tr>
                  <th>用户名</th><th>邮箱</th><th>姓名</th><th>角色</th>
                  <th>子类型 / 状态</th><th>关联员工</th><th>产品线</th><th>模块</th><th style="min-width:80px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in filteredUsers" :key="u.id" :class="{ 'um-pending-row': u.rmStatus === 'pending_approval' }">
                  <td style="font-weight:600">{{ u.username }}</td>
                  <td class="muted small">{{ u.email || '—' }}</td>
                  <td>{{ u.realName || '—' }}</td>
                  <td><span class="tag" :class="listRoleTagClass(u)">{{ roleLabel(u) }}</span></td>
                  <td>
                    <span v-if="isPlHead(u)" class="tag tag-product-line-head">产品线负责人</span>
                    <span v-else-if="u.role === 'hrbp'" class="tag" :class="subTypeClass(u)">{{ subTypeLabel(u) }}</span>
                    <span v-else class="tag" :class="rmStatusClass(u)">{{ rmStatusLabel(u) }}</span>
                  </td>
                  <td class="muted small">{{ empName(u.employeeId, u.homeLineId) }}</td>
                  <td class="muted small">{{ userLineLabel(u) }}</td>
                  <td>
                    <template v-if="u.role === 'hrbp' && u.hrbpSubType === 'intern'">
                      <span v-for="m in allHrbpModules" :key="m" class="tag tag-mod" :class="{ 'tag-mod-on': internHasModule(u, m), 'tag-mod-off': !internHasModule(u, m) }" style="margin-right:2px;font-size:0.7rem">{{ moduleLabel(m) }}</span>
                    </template>
                    <template v-else-if="u.role === 'manager' && !isPlHead(u)">
                      <span v-for="m in allMgrModules" :key="m" class="tag tag-mod" :class="{ 'tag-mod-on': mgrHasModule(u, m), 'tag-mod-off': !mgrHasModule(u, m) }" style="margin-right:2px;font-size:0.7rem">{{ moduleLabel(m) }}</span>
                    </template>
                    <span v-else class="muted small">全部</span>
                  </td>
                  <td class="row-actions">
                    <button v-if="canEditUser(u)" type="button" class="btn btn-ghost btn-sm" @click="openEdit(u)" title="编辑"><i class="fa-solid fa-pen"></i></button>
                    <button v-if="u.role==='manager' && !isPlHead(u)" type="button" class="btn btn-ghost btn-sm" @click="openPermEdit(u)" title="权限配置"><i class="fa-solid fa-sliders"></i></button>
                    <button v-if="canDeleteUser(u)" type="button" class="btn btn-ghost btn-sm" style="color:#dc2626" @click="deleteUser(u)" title="删除"><i class="fa-solid fa-trash"></i></button>
                  </td>
                </tr>
                <tr v-if="!filteredUsers.length"><td colspan="9" class="muted" style="text-align:center;padding:1.5rem">暂无用户</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ═══ Tab 2: Pending RM approvals ═══ -->
      <template v-if="tab==='pending'">
        <div class="card pad">
          <h3 class="section-title">待审批的 RM 账号</h3>
          <p class="muted small">员工在上传文档中被识别为 RM，或在系统中被提名为 RM 后，需要 HRBP 超级管理员审批确认其操作权限。</p>
          <table v-if="pendingRMs.length" class="data-table compact" style="margin-top:12px">
            <thead><tr><th>用户名</th><th>邮箱</th><th>姓名</th><th>关联员工</th><th>提名来源</th><th></th></tr></thead>
            <tbody>
              <tr v-for="u in pendingRMs" :key="u.id">
                <td style="font-weight:600">{{ u.username }}</td>
                <td class="muted small">{{ u.email || '—' }}</td>
                <td>{{ u.realName || '—' }}</td>
                <td class="muted small">{{ empName(u.employeeId, u.homeLineId) }}</td>
                <td class="muted small">{{ u.rmNominationSource || '手动创建' }}</td>
                <td class="row-actions">
                  <button type="button" class="btn btn-primary btn-sm" @click="approveRM(u)"><i class="fa-solid fa-check"></i> 审批并配置</button>
                  <button type="button" class="btn btn-ghost btn-sm" style="color:#dc2626" @click="rejectRM(u)"><i class="fa-solid fa-xmark"></i> 拒绝</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted small" style="margin-top:12px">当前没有待审批的 RM 账号。</p>
        </div>
      </template>

      <!-- ═══ Tab 3: Permission overview matrix ═══ -->
      <template v-if="tab==='perms'">
        <div class="card pad">
          <h3 class="section-title">权限总览</h3>
          <p class="muted small">所有用户的模块访问与操作权限一览。绿色 ✓ 表示拥有权限，红色 ✕ 表示无权限。超级管理员可点击切换权限。</p>
          <div style="overflow:auto;margin-top:12px">
            <table class="data-table compact um-perm-matrix">
              <thead>
                <tr>
                  <th rowspan="2" style="min-width:120px">用户</th>
                  <th rowspan="2">角色</th>
                  <th :colspan="allMgrModules.length" class="um-group-header">模块访问</th>
                  <th :colspan="permDefs.length" class="um-group-header">操作权限</th>
                </tr>
                <tr>
                  <th v-for="m in allMgrModules" :key="'mh-'+m" class="um-perm-th" :title="moduleLabel(m)">{{ moduleLabel(m) }}</th>
                  <th v-for="d in permDefs" :key="'ph-'+d.key" class="um-perm-th" :title="d.label + '：' + d.desc">{{ d.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in allUsers" :key="'pm-'+u.id">
                  <td style="font-weight:600;white-space:nowrap">{{ u.realName || u.username }}</td>
                  <td><span class="tag" :class="permRoleTagClass(u)" style="font-size:0.7rem">{{ roleLabel(u) }}</span></td>
                  <td v-for="m in allMgrModules" :key="'mc-'+u.id+'-'+m"
                      class="um-perm-cell" :class="[userHasModule(u, m) ? 'um-perm-on' : 'um-perm-off', canTogglePerm(u) ? 'um-perm-clickable' : '']"
                      @click="toggleMatrixModule(u, m)">
                    {{ userHasModule(u, m) ? '✓' : '✕' }}
                  </td>
                  <td v-for="d in permDefs" :key="'pc-'+u.id+'-'+d.key"
                      class="um-perm-cell" :class="[userHasOp(u, d.key) ? 'um-perm-on' : 'um-perm-off', canTogglePerm(u) && userHasModule(u, d.module) ? 'um-perm-clickable' : '', !userHasModule(u, d.module) ? 'um-perm-disabled' : '']"
                      @click="toggleMatrixOp(u, d.key)">
                    {{ userHasOp(u, d.key) ? '✓' : '✕' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ═══ Tab 4: Nominate RM ═══ -->
      <template v-if="tab==='nominate'">
        <div class="card pad">
          <h3 class="section-title">提名员工为汇报经理</h3>
          <p class="muted small">从现有员工中选择，为其创建 RM 系统账号。提名后账号进入待审批状态，需在"RM 审批队列"中确认并配置权限后方可使用。</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;max-width:600px">
            <label class="field"><span>选择员工</span>
              <select v-model.number="nomEmpId" class="input">
                <option :value="null">— 请选择 —</option>
                <option v-for="e in nominatableEmps" :key="e.id" :value="e.id">{{ e.name }} ({{ e.id }})</option>
              </select>
            </label>
            <label class="field"><span>设置密码</span>
              <input v-model.trim="nomPassword" type="password" class="input" placeholder="登录密码" autocomplete="new-password" />
            </label>
          </div>
          <button type="button" class="btn btn-primary" style="margin-top:12px" :disabled="!nomEmpId || !nomPassword" @click="nominateRM">
            <i class="fa-solid fa-user-plus"></i> 提名为 RM
          </button>
        </div>
      </template>

      <!-- ═══ Edit / Add user modal ═══ -->
      <div v-if="modalOpen" class="modal-backdrop" @click.self="modalOpen = false">
        <div class="modal card" style="max-width:560px">
          <h3>{{ modalMode === 'add' ? '新增用户' : '编辑用户' }}</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
            <label class="field"><span>用户名</span><input v-model.trim="form.username" class="input" /></label>
            <label class="field"><span>邮箱</span><input v-model.trim="form.email" class="input" /></label>
            <label class="field"><span>密码</span><input v-model.trim="form.password" type="password" class="input" autocomplete="new-password" :placeholder="modalMode === 'edit' ? '留空不修改' : '设置密码'" /></label>
            <label class="field"><span>真实姓名</span><input v-model.trim="form.realName" class="input" /></label>
            <label class="field"><span>角色</span>
              <select v-model="form.role" class="input">
                <option value="hrbp">HRBP</option>
                <option value="manager">汇报经理</option>
                <option value="product_line_owner">产品线负责人</option>
              </select>
            </label>
            <label v-if="form.role === 'hrbp'" class="field"><span>HRBP 子类型</span>
              <select v-model="form.hrbpSubType" class="input">
                <option value="super_admin">超级管理员</option>
                <option value="admin">管理员</option>
                <option value="intern">实习生</option>
              </select>
            </label>
            <label class="field"><span>关联员工</span>
              <div class="um-emp-search" style="position:relative">
                <input v-model="empSearchText" class="input" placeholder="搜索员工姓名或 ID…"
                  @focus="empDropOpen = true" @input="empDropOpen = true" @blur="empDropOpen = false" autocomplete="off" />
                <button v-if="form.employeeId != null" type="button" class="um-emp-clear" @click="clearEmpLink" title="清除关联">&times;</button>
                <div v-if="empDropOpen && filteredEmpOptions.length" class="um-emp-dropdown">
                  <div class="um-emp-drop-item" style="color:var(--muted);font-style:italic" @mousedown.prevent="selectEmp(null)">— 不关联 —</div>
                  <div v-for="e in filteredEmpOptions" :key="e.id" class="um-emp-drop-item" @mousedown.prevent="selectEmp(e)">
                    {{ e.name }} ({{ e.id }})
                  </div>
                </div>
              </div>
            </label>
          </div>
          <div v-if="form.role === 'hrbp' && form.hrbpSubType === 'intern'" style="margin-top:16px">
            <h4 class="section-title" style="font-size:0.875rem">实习生模块权限</h4>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
              <label v-for="m in allHrbpModules" :key="m" class="um-mod-toggle" :class="{ disabled: m === 'recruitment' }">
                <input type="checkbox" :checked="form.allowedModules.includes(m)" :disabled="m === 'recruitment'" @change="toggleModule(m, $event)" />
                <span>{{ moduleLabel(m) }}</span>
              </label>
            </div>
          </div>
          <div v-if="showLinePerms" style="margin-top:16px">
            <h4 class="section-title" style="font-size:0.875rem">产品线权限</h4>
            <p class="muted small" style="margin-bottom:8px">选择该用户可访问的产品线。未选中的产品线对该用户不可见。</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              <label v-for="l in allProductLines" :key="l.id" class="um-mod-toggle">
                <input type="checkbox" :checked="form.allowedLineIds.includes(l.id)" @change="toggleLineId(l.id, $event)" />
                <span>{{ l.name }}</span>
              </label>
            </div>
          </div>
          <div class="modal-actions" style="margin-top:16px">
            <button type="button" class="btn btn-ghost" @click="modalOpen = false">取消</button>
            <button type="button" class="btn btn-primary" @click="saveUser">保存</button>
          </div>
        </div>
      </div>

      <!-- ═══ RM permission config modal ═══ -->
      <div v-if="permModalOpen" class="modal-backdrop" @click.self="permModalOpen = false">
        <div class="modal card" style="max-width:720px;max-height:85vh;overflow-y:auto">
          <h3><i class="fa-solid fa-sliders"></i> RM 权限配置 — {{ permTarget?.realName || permTarget?.username }}</h3>
          <p class="muted small">为该汇报经理配置可访问的模块和具体操作权限。</p>

          <h4 class="section-title" style="font-size:0.875rem;margin-top:16px">模块访问</h4>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <label v-for="m in allMgrModules" :key="'pm-'+m" class="um-mod-toggle" :class="{ disabled: m === 'dashboard' }">
              <input type="checkbox" :checked="permForm.modules.includes(m)" :disabled="m === 'dashboard'" @change="togglePermModule(m, $event)" />
              <span>{{ moduleLabel(m) }}</span>
            </label>
          </div>

          <h4 class="section-title" style="font-size:0.875rem;margin-top:20px">操作权限</h4>
          <div v-for="grp in permGroups" :key="grp.module" style="margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <strong style="font-size:0.85rem">{{ moduleLabel(grp.module) }}</strong>
              <span class="muted small">({{ grp.defs.filter(d => permForm.ops[d.key] !== false).length }}/{{ grp.defs.length }})</span>
              <button type="button" class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:0.75rem" @click="toggleGroupAll(grp, true)">全开</button>
              <button type="button" class="btn btn-ghost btn-sm" style="font-size:0.75rem" @click="toggleGroupAll(grp, false)">全关</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px">
              <label v-for="d in grp.defs" :key="d.key" class="um-op-toggle" :class="{ 'um-op-disabled': !permForm.modules.includes(grp.module) }">
                <input type="checkbox" :checked="permForm.ops[d.key] !== false" :disabled="!permForm.modules.includes(grp.module)" @change="permForm.ops[d.key] = $event.target.checked" />
                <span>
                  <strong>{{ d.label }}</strong>
                  <span class="muted small" style="display:block;font-size:0.72rem;line-height:1.2">{{ d.desc }}</span>
                </span>
              </label>
            </div>
          </div>

          <div class="modal-actions" style="margin-top:16px">
            <button type="button" class="btn btn-ghost" @click="permModalOpen = false">取消</button>
            <button type="button" class="btn btn-primary" @click="savePermissions">保存权限</button>
          </div>
        </div>
      </div>
    </div>
  `,
    setup() {
      const data = useDataStore();
      const auth = useAuthStore();

      if (!auth.canManageUsers) {
        window.dispatchEvent(new CustomEvent('tm-toast', {
          detail: { message: '无权访问用户管理页面', type: 'error' },
        }));
        window.TM.router?.push(auth.isHrbp ? '/hrbp/dashboard' : '/manager/dashboard');
        return {};
      }

      const allHrbpModules = window.TM.HRBP_MODULES;
      const allMgrModules = window.TM.MGR_MODULES;
      const defaultMgrModules = window.TM.MGR_DEFAULT_MODULES || allMgrModules.filter(function (m) { return m !== 'ai_analyst'; });
      const permDefs = window.TM.RM_PERM_DEFS;
      const productLineStore = window.TM.useProductLineStore();

      function emptyForm() {
        const curLineId = productLineStore.currentLineId;
        return {
          username: '', email: '', password: '', realName: '',
          role: 'hrbp', hrbpSubType: 'admin', employeeId: null,
          allowedModules: ['recruitment'],
          allowedLineIds: curLineId ? [curLineId] : [],
        };
      }

      const tab = ref('users');
      const filterRole = ref('');
      const modalOpen = ref(false);
      const modalMode = ref('add');
      const editingUserId = ref(null);
      const form = ref(emptyForm());

      const permModalOpen = ref(false);
      const permTarget = ref(null);
      const permForm = reactive({ modules: [], ops: {} });

      const nomEmpId = ref(null);
      const nomPassword = ref('');

      const empSearchText = ref('');
      const empDropOpen = ref(false);

      const allProductLines = computed(() => productLineStore.lines || []);
      const showLinePerms = computed(() => {
        if (allProductLines.value.length <= 1) return false;
        const r = form.value.role;
        if (r === 'hrbp') {
          const sub = form.value.hrbpSubType;
          return sub === 'admin' || sub === 'intern';
        }
        return false;
      });
      function toggleLineId(lineId, ev) {
        const ids = form.value.allowedLineIds;
        if (ev.target.checked) { if (!ids.includes(lineId)) ids.push(lineId); }
        else { const idx = ids.indexOf(lineId); if (idx >= 0) ids.splice(idx, 1); }
      }

      const allUsers = computed(() => data.users || []);
      const filteredUsers = computed(() => {
        const users = allUsers.value;
        if (!filterRole.value) return users;
        if (filterRole.value === 'product_line_owner') {
          return users.filter(function (u) { return isPlHead(u); });
        }
        return users.filter(function (u) {
          if (isPlHead(u)) return filterRole.value === 'manager';
          if (filterRole.value === 'hrbp') return u.role === 'hrbp';
          return u.role === filterRole.value;
        });
      });
      const pendingRMs = computed(() =>
        allUsers.value.filter(function (u) { return u.role === 'manager' && u.rmStatus === 'pending_approval'; }),
      );
      const empOptions = computed(() =>
        (data.employees || []).filter(function (e) { return e.status !== 'leave'; }),
      );
      const nominatableEmps = computed(() => {
        const existingEmpIds = new Set();
        allUsers.value.forEach(function (u) { if (u.employeeId != null) existingEmpIds.add(u.employeeId); });
        return empOptions.value.filter(function (e) { return !existingEmpIds.has(e.id); });
      });

      const filteredEmpOptions = computed(function () {
        const q = (empSearchText.value || '').trim().toLowerCase();
        const list = empOptions.value;
        if (!q) return list.slice(0, 50);
        return list.filter(function (e) {
          return (e.name && e.name.toLowerCase().indexOf(q) >= 0)
            || String(e.id).indexOf(q) >= 0
            || (e.email && e.email.toLowerCase().indexOf(q) >= 0);
        }).slice(0, 50);
      });

      const permGroups = computed(function () {
        const moduleOrder = allMgrModules;
        const groups = [];
        const map = {};
        permDefs.forEach(function (d) {
          if (!map[d.module]) {
            map[d.module] = { module: d.module, defs: [] };
            groups.push(map[d.module]);
          }
          map[d.module].defs.push(d);
        });
        groups.sort(function (a, b) { return moduleOrder.indexOf(a.module) - moduleOrder.indexOf(b.module); });
        return groups;
      });

      function roleLabel(u) {
        if (isPlHead(u)) return '产品线负责人';
        return ROLE_LABELS[u.role] || u.role;
      }
      function subTypeLabel(u) { return SUBTYPE_LABELS[u.hrbpSubType] || (u.superAdmin ? '超级管理员' : '管理员'); }
      function subTypeClass(u) {
        const st = u.hrbpSubType || (u.superAdmin ? 'super_admin' : 'admin');
        return 'tag-' + st.replace(/_/g, '-');
      }
      function isPlHead(u) {
        if (u.employeeId == null) return false;
        const ownerId = data.orgSettings?.productLineHeadEmployeeId;
        return ownerId != null && ownerId !== '' && Number(ownerId) === Number(u.employeeId);
      }
      function empName(eid, homeLineId) {
        if (eid == null) return '—';
        var e = data.employees.find(function (x) { return x.id === eid; });
        if (e) return e.name + ' (' + eid + ')';
        if (homeLineId != null && homeLineId !== productLineStore.currentLineId) {
          var lineEmps = window.TM.loadKeyForLine(homeLineId, 'employees', null);
          if (Array.isArray(lineEmps)) {
            var found = lineEmps.find(function (x) { return x.id === eid; });
            if (found) return found.name + ' (' + eid + ')';
          }
        }
        return String(eid);
      }
      function userLineLabel(u) {
        if (u.superAdmin || u.hrbpSubType === 'super_admin') return '全部';
        if (isPlHead(u)) return '全部';
        if (Array.isArray(u.allowedLineIds) && u.allowedLineIds.length) {
          var lines = productLineStore.lines || [];
          var names = u.allowedLineIds.map(function (id) {
            var l = lines.find(function (x) { return x.id === id; });
            return l ? l.name : String(id);
          });
          return names.join('、');
        }
        var hlid = u.homeLineId;
        if (hlid != null) {
          var hl = (productLineStore.lines || []).find(function (x) { return x.id === hlid; });
          return hl ? hl.name : String(hlid);
        }
        var curLine = (productLineStore.lines || []).find(function (x) { return x.id === productLineStore.currentLineId; });
        return curLine ? curLine.name : '当前';
      }
      function internHasModule(u, m) {
        if (m === 'recruitment') return true;
        return (u.allowedModules || []).includes(m);
      }
      function mgrHasModule(u, m) {
        if (m === 'dashboard') return true;
        const perms = u.managerPermissions;
        if (!perms || !perms.modules) return defaultMgrModules.includes(m);
        return perms.modules.includes(m);
      }
      function moduleLabel(m) { return MODULE_LABELS[m] || m; }
      function moduleShort(m) {
        return { dashboard: 'D', roster: 'R', org: 'O', recruitment: '招', talent: 'T', performance: 'P', attendance: 'A', ai_analyst: 'AI' }[m] || m.charAt(0).toUpperCase();
      }
      function rmStatusLabel(u) {
        if (u.rmStatus === 'pending_approval') return '待审批';
        if (u.rmStatus === 'revoked') return '已撤销';
        return '已激活';
      }
      function rmStatusClass(u) {
        return RM_STATUS_CLASS[u.rmStatus] || 'tag-ok';
      }

      function selectEmp(e) {
        if (e) {
          form.value.employeeId = e.id;
          empSearchText.value = e.name + ' (' + e.id + ')';
        } else {
          form.value.employeeId = null;
          empSearchText.value = '';
        }
        empDropOpen.value = false;
      }
      function clearEmpLink() {
        form.value.employeeId = null;
        empSearchText.value = '';
      }

      function listRoleTagClass(u) {
        if (isPlHead(u)) return 'tag-product-line-head';
        return u.role === 'hrbp' ? 'tag-hrbp' : 'tag-mgr';
      }
      function permRoleTagClass(u) {
        if (isPlHead(u)) return 'tag-product-line-head';
        return u.role === 'hrbp' ? 'tag-hrbp' : 'tag-mgr';
      }

      function userHasModule(u, m) {
        if (u.role === 'hrbp') {
          const st = u.hrbpSubType || (u.superAdmin ? 'super_admin' : 'admin');
          if (st === 'super_admin') return true;
          if (st === 'admin' || st === 'product_line_owner') {
            if (!u.allowedModules) return true;
            return u.allowedModules.includes(m);
          }
          if (m === 'recruitment') return true;
          return (u.allowedModules || []).includes(m);
        }
        if (u.role === 'manager') {
          if (isPlHead(u)) return true;
          return mgrHasModule(u, m);
        }
        return true;
      }
      function userHasOp(u, key) {
        const def = permDefs.find(function (d) { return d.key === key; });
        const mod = def ? def.module : key.split('.')[0];
        if (u.role === 'hrbp') {
          const st = u.hrbpSubType || (u.superAdmin ? 'super_admin' : 'admin');
          if (st === 'super_admin') return true;
          if (!userHasModule(u, mod)) return false;
          if (st === 'admin' || st === 'product_line_owner') {
            if (u.disabledOps && u.disabledOps[key]) return false;
          }
          if (st === 'intern') {
            if (u.disabledOps && u.disabledOps[key]) return false;
          }
          return true;
        }
        if (u.role === 'manager') {
          if (isPlHead(u)) return true;
          if (u.rmStatus === 'pending_approval') return false;
          if (!userHasModule(u, mod)) return false;
          const perms = u.managerPermissions;
          if (!perms || !perms.ops) return true;
          return perms.ops[key] !== false;
        }
        return true;
      }

      function canTogglePerm(u) {
        if (auth.effectiveSubType !== 'super_admin') return false;
        if (isPlHead(u)) return false;
        if (u.role === 'hrbp') {
          const st = u.hrbpSubType || (u.superAdmin ? 'super_admin' : 'admin');
          if (st === 'super_admin') return false;
          return true;
        }
        if (u.role === 'manager') {
          return true;
        }
        return false;
      }
      function toggleMatrixModule(u, m) {
        if (!canTogglePerm(u)) return;
        const moduleOps = permDefs.filter(function (d) { return d.module === m; }).map(function (d) { return d.key; });
        if (u.role === 'hrbp') {
          const st = u.hrbpSubType || (u.superAdmin ? 'super_admin' : 'admin');
          if (st === 'intern') {
            if (m === 'recruitment') return;
            const mods = u.allowedModules || [];
            const idx = mods.indexOf(m);
            if (idx >= 0) {
              mods.splice(idx, 1);
              if (!u.disabledOps) u.disabledOps = {};
              moduleOps.forEach(function (k) { u.disabledOps[k] = true; });
            } else {
              mods.push(m);
              if (u.disabledOps) { moduleOps.forEach(function (k) { delete u.disabledOps[k]; }); }
            }
            u.allowedModules = mods;
          } else if (st === 'admin' || st === 'product_line_owner') {
            let turningOff;
            if (!u.allowedModules) {
              u.allowedModules = allHrbpModules.filter(function (x) { return x !== m; });
              turningOff = true;
            } else {
              const mi = u.allowedModules.indexOf(m);
              if (mi >= 0) { u.allowedModules.splice(mi, 1); turningOff = true; }
              else { u.allowedModules.push(m); turningOff = false; }
            }
            if (turningOff) {
              if (!u.disabledOps) u.disabledOps = {};
              moduleOps.forEach(function (k) { u.disabledOps[k] = true; });
            } else {
              if (u.disabledOps) { moduleOps.forEach(function (k) { delete u.disabledOps[k]; }); }
            }
          }
        } else if (u.role === 'manager') {
          if (m === 'dashboard') return;
          const perms = u.managerPermissions || { modules: defaultMgrModules.slice(), ops: window.TM.RM_ALL_OPS_ON() };
          const mi2 = perms.modules.indexOf(m);
          if (mi2 >= 0) {
            perms.modules.splice(mi2, 1);
            moduleOps.forEach(function (k) { perms.ops[k] = false; });
          } else {
            perms.modules.push(m);
            moduleOps.forEach(function (k) { perms.ops[k] = true; });
          }
          u.managerPermissions = perms;
        }
        if (u.id === auth.currentUser?.id) {
          auth.currentUser = { ...auth.currentUser, ...u };
          auth.persistSession();
        }
        data._markDirty('users'); data.persistAll();
      }
      function toggleMatrixOp(u, key) {
        if (!canTogglePerm(u)) return;
        const def = permDefs.find(function (d) { return d.key === key; });
        const mod = def ? def.module : key.split('.')[0];
        if (!userHasModule(u, mod)) return;
        if (u.role === 'hrbp') {
          const st = u.hrbpSubType || (u.superAdmin ? 'super_admin' : 'admin');
          if (st === 'admin' || st === 'product_line_owner' || st === 'intern') {
            if (!u.disabledOps) u.disabledOps = {};
            u.disabledOps[key] = !u.disabledOps[key];
            if (!u.disabledOps[key]) delete u.disabledOps[key];
            if (u.id === auth.currentUser?.id) {
              auth.currentUser = { ...auth.currentUser, disabledOps: { ...(u.disabledOps || {}) } };
              auth.persistSession();
            }
            data._markDirty('users'); data.persistAll();
          }
        } else if (u.role === 'manager') {
          const perms = u.managerPermissions || { modules: defaultMgrModules.slice(), ops: window.TM.RM_ALL_OPS_ON() };
          perms.ops[key] = perms.ops[key] === false ? true : false;
          u.managerPermissions = perms;
          if (u.id === auth.currentUser?.id) {
            auth.currentUser = { ...auth.currentUser, managerPermissions: perms };
            auth.persistSession();
          }
          data._markDirty('users'); data.persistAll();
        }
      }

      function canEditUser(u) {
        if (u.id === auth.currentUser?.id) return true;
        return auth.effectiveSubType === 'super_admin';
      }
      function canDeleteUser(u) {
        if (u.id === auth.currentUser?.id) return false;
        return auth.effectiveSubType === 'super_admin';
      }

      /* ── User CRUD ── */
      function openAdd() {
        modalMode.value = 'add';
        editingUserId.value = null;
        form.value = emptyForm();
        empSearchText.value = '';
        modalOpen.value = true;
      }
      function openEdit(u) {
        modalMode.value = 'edit';
        editingUserId.value = u.id;
        let formRole = u.role || 'hrbp';
        const formSubType = u.hrbpSubType || (u.superAdmin ? 'super_admin' : 'admin');
        if (u.employeeId != null && data.orgSettings?.productLineHeadEmployeeId === u.employeeId) {
          formRole = 'product_line_owner';
        }
        form.value = {
          username: u.username || '', email: u.email || '', password: '', realName: u.realName || '',
          role: formRole, hrbpSubType: formSubType,
          employeeId: u.employeeId ?? null, allowedModules: [...(u.allowedModules || ['recruitment'])],
          allowedLineIds: [...(u.allowedLineIds || (productLineStore.currentLineId ? [productLineStore.currentLineId] : []))],
        };
        if (u.employeeId != null) {
          const emp = (data.employees || []).find(function (e) { return e.id === u.employeeId; });
          empSearchText.value = emp ? emp.name + ' (' + emp.id + ')' : String(u.employeeId);
        } else {
          empSearchText.value = '';
        }
        modalOpen.value = true;
      }
      function toggleModule(m, ev) {
        const mods = form.value.allowedModules;
        if (ev.target.checked) { if (!mods.includes(m)) mods.push(m); }
        else { const idx = mods.indexOf(m); if (idx >= 0 && m !== 'recruitment') mods.splice(idx, 1); }
      }
      function saveUser() {
        const f = form.value;
        if (!f.username && !f.email) { toast('请填写用户名或邮箱', 'error'); return; }
        if (modalMode.value === 'add') {
          if (!f.password) { toast('新用户必须设置密码', 'error'); return; }
          const dup = data.users.find(function (u) {
            return (f.username && u.username === f.username) || (f.email && String(u.email || '').toLowerCase() === f.email.toLowerCase());
          });
          if (dup) { toast('用户名或邮箱已存在', 'error'); return; }
          const maxId = data.users.reduce(function (m, u) { return Math.max(m, Number(u.id) || 0); }, 0);
          const newUser = {
            id: maxId + 1, username: f.username, email: f.email, password: f.password, realName: f.realName,
            role: f.role, employeeId: f.employeeId, homeLineId: productLineStore.currentLineId,
          };
          if (f.role === 'product_line_owner') {
            newUser.role = 'manager';
            newUser.rmStatus = 'active';
            newUser.managerPermissions = { modules: allMgrModules.slice(), ops: window.TM.RM_ALL_OPS_ON() };
            if (f.employeeId != null) {
              data.orgSettings = { ...data.orgSettings, productLineHeadEmployeeId: f.employeeId };
              data._markDirty('orgSettings');
            }
          } else if (f.role === 'hrbp') {
            newUser.hrbpSubType = f.hrbpSubType;
            if (f.hrbpSubType === 'super_admin') newUser.superAdmin = true;
            if (f.hrbpSubType === 'intern') newUser.allowedModules = [...f.allowedModules];
            if (f.hrbpSubType === 'admin' || f.hrbpSubType === 'intern') {
              newUser.allowedLineIds = [...f.allowedLineIds];
            }
          } else {
            newUser.rmStatus = 'pending_approval';
            newUser.managerPermissions = { modules: defaultMgrModules.slice(), ops: window.TM.RM_ALL_OPS_ON() };
            newUser.rmNominationSource = '手动创建';
          }
          data.users.push(newUser);
        } else {
          const user = data.users.find(function (u) { return u.id === editingUserId.value; });
          if (!user) { toast('用户不存在', 'error'); return; }
          user.username = f.username; user.email = f.email; user.realName = f.realName; user.employeeId = f.employeeId;
          if (f.password) user.password = f.password;
          if (f.role === 'product_line_owner') {
            user.role = 'manager';
            user.hrbpSubType = undefined;
            user.superAdmin = false;
            user.allowedModules = undefined;
            user.allowedLineIds = undefined;
            if (!user.managerPermissions) {
              user.managerPermissions = { modules: allMgrModules.slice(), ops: window.TM.RM_ALL_OPS_ON() };
            }
            user.rmStatus = 'active';
            if (f.employeeId != null) {
              data.orgSettings = { ...data.orgSettings, productLineHeadEmployeeId: f.employeeId };
              data._markDirty('orgSettings');
            }
          } else if (f.role === 'hrbp') {
            user.role = 'hrbp';
            user.hrbpSubType = f.hrbpSubType;
            user.superAdmin = f.hrbpSubType === 'super_admin';
            user.allowedModules = f.hrbpSubType === 'intern' ? [...f.allowedModules] : undefined;
            if (f.hrbpSubType === 'admin' || f.hrbpSubType === 'intern') {
              user.allowedLineIds = [...f.allowedLineIds];
            } else {
              user.allowedLineIds = undefined;
            }
            user.managerPermissions = undefined; user.rmStatus = undefined;
          } else {
            user.role = f.role;
            user.hrbpSubType = undefined; user.superAdmin = undefined; user.allowedModules = undefined;
            user.allowedLineIds = undefined;
            if (!user.managerPermissions) {
              user.managerPermissions = { modules: defaultMgrModules.slice(), ops: window.TM.RM_ALL_OPS_ON() };
            }
            if (!user.rmStatus) user.rmStatus = 'pending_approval';
          }
          var plhEid = data.orgSettings?.productLineHeadEmployeeId;
          if (f.role !== 'product_line_owner' && user.employeeId != null && plhEid != null && Number(plhEid) === Number(user.employeeId)) {
            data.orgSettings = { ...data.orgSettings, productLineHeadEmployeeId: null };
            data._markDirty('orgSettings');
          }
          if (user.id === auth.currentUser?.id) {
            auth.currentUser = { ...auth.currentUser, ...user };
            auth.persistSession();
          }
        }
        data._markDirty('users'); data.persistAll();
        modalOpen.value = false;
        toast(modalMode.value === 'add' ? '用户已创建' : '用户已更新', 'success');
      }
      function deleteUser(u) {
        if (!window.confirm('确定删除用户「' + (u.username || u.email) + '」？此操作不可恢复。')) return;
        const idx = data.users.findIndex(function (x) { return x.id === u.id; });
        if (idx >= 0) { data.users.splice(idx, 1); data._markDirty('users'); data.persistAll(); toast('用户已删除', 'success'); }
      }

      /* ── RM permission config ── */
      function openPermEdit(u) {
        permTarget.value = u;
        const perms = u.managerPermissions || {};
        permForm.modules = [...(perms.modules || defaultMgrModules.slice())];
        const ops = perms.ops || window.TM.RM_ALL_OPS_ON();
        permForm.ops = {};
        permDefs.forEach(function (d) { permForm.ops[d.key] = ops[d.key] !== false; });
        permModalOpen.value = true;
      }
      function togglePermModule(m, ev) {
        if (ev.target.checked) { if (!permForm.modules.includes(m)) permForm.modules.push(m); }
        else { const idx = permForm.modules.indexOf(m); if (idx >= 0 && m !== 'dashboard') permForm.modules.splice(idx, 1); }
      }
      function toggleGroupAll(grp, val) {
        grp.defs.forEach(function (d) { permForm.ops[d.key] = val; });
      }
      function savePermissions() {
        const u = data.users.find(function (x) { return x.id === permTarget.value?.id; });
        if (!u) return;
        u.managerPermissions = {
          modules: [...permForm.modules],
          ops: { ...permForm.ops },
        };
        if (u.id === auth.currentUser?.id) {
          auth.currentUser = { ...auth.currentUser, managerPermissions: u.managerPermissions };
          auth.persistSession();
        }
        data._markDirty('users'); data.persistAll();
        permModalOpen.value = false;
        toast('权限已更新', 'success');
      }

      /* ── RM approval ── */
      const _approvalPending = ref(null);
      function approveRM(u) {
        permTarget.value = u;
        _approvalPending.value = u.id;
        const perms = u.managerPermissions || {};
        permForm.modules = [...(perms.modules || defaultMgrModules.slice())];
        const ops = perms.ops || window.TM.RM_ALL_OPS_ON();
        permForm.ops = {};
        permDefs.forEach(function (d) { permForm.ops[d.key] = ops[d.key] !== false; });
        permModalOpen.value = true;
      }
      watch(permModalOpen, function (v) {
        if (!v) _approvalPending.value = null;
      });
      const _origSavePerms = savePermissions;
      savePermissions = function () {
        const pendingId = _approvalPending.value;
        _origSavePerms();
        if (pendingId != null) {
          const u = data.users.find(function (x) { return x.id === pendingId; });
          if (u && u.rmStatus === 'pending_approval') {
            u.rmStatus = 'active';
            if (u.id === auth.currentUser?.id) {
              auth.currentUser = { ...auth.currentUser, rmStatus: 'active', managerPermissions: u.managerPermissions };
              auth.persistSession();
            }
            data._markDirty('users'); data.persistAll();
            toast('RM 账号已审批激活', 'success');
          }
        }
      };
      function rejectRM(u) {
        if (!window.confirm('确定拒绝「' + (u.realName || u.username) + '」的 RM 权限申请？')) return;
        u.rmStatus = 'revoked';
        data._markDirty('users'); data.persistAll();
        toast('已拒绝', 'info');
      }

      /* ── RM nomination ── */
      function nominateRM() {
        const empId = nomEmpId.value;
        const pwd = nomPassword.value;
        if (!empId || !pwd) return;
        const emp = data.employees.find(function (e) { return e.id === empId; });
        if (!emp) { toast('员工不存在', 'error'); return; }
        const existing = data.users.find(function (u) { return u.employeeId === empId; });
        if (existing) { toast('该员工已关联用户账号', 'error'); return; }
        const maxId = data.users.reduce(function (m, u) { return Math.max(m, Number(u.id) || 0); }, 0);
        const email = emp.email || (emp.name + '@company.com').toLowerCase().replace(/\s+/g, '');
        data.users.push({
          id: maxId + 1,
          username: email.split('@')[0],
          email: email,
          password: pwd,
          realName: emp.name,
          role: 'manager',
          employeeId: empId,
          homeLineId: productLineStore.currentLineId,
          rmStatus: 'pending_approval',
          rmNominationSource: '系统提名',
          managerPermissions: { modules: defaultMgrModules.slice(), ops: window.TM.RM_ALL_OPS_ON() },
        });
        data._markDirty('users'); data.persistAll();
        nomEmpId.value = null; nomPassword.value = '';
        toast('已提名「' + emp.name + '」为 RM，请在审批队列中确认', 'success');
        tab.value = 'pending';
      }

      return {
        data, auth, tab, allHrbpModules, allMgrModules, permDefs, permGroups,
        filterRole, filteredUsers, allUsers, pendingRMs, empOptions, nominatableEmps,
        filteredEmpOptions, empSearchText, empDropOpen, selectEmp, clearEmpLink,
        roleLabel, subTypeLabel, subTypeClass, isPlHead, empName,
        listRoleTagClass, permRoleTagClass,
        internHasModule, mgrHasModule, moduleLabel, moduleShort,
        rmStatusLabel, rmStatusClass,
        userHasModule, userHasOp,
        canTogglePerm, toggleMatrixModule, toggleMatrixOp,
        canEditUser, canDeleteUser,
        modalOpen, modalMode, form, openAdd, openEdit, toggleModule, saveUser, deleteUser,
        permModalOpen, permTarget, permForm, openPermEdit, togglePermModule, toggleGroupAll, savePermissions,
        approveRM, rejectRM,
        nomEmpId, nomPassword, nominateRM,
        allProductLines, showLinePerms, toggleLineId, userLineLabel,
      };
    },
  };
})();
