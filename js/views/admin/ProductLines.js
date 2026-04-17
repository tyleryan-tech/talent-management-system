/**
 * Admin — Product Line Management (super_admin only)
 * Global view: list all product lines, create/delete/rename, assign PLO.
 */
(function () {
  const { computed, ref, reactive } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useAuthStore = window.TM.useAuthStore;

  function toast(msg, type) {
    window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: msg, type: type || 'info' } }));
  }

  window.TM.AdminProductLines = {
    name: 'AdminProductLines',
    template: `
    <div class="page-stack">
      <div class="card pad">
        <h2 class="section-title"><i class="fa-solid fa-layer-group"></i> 产品线管理</h2>
        <p class="muted small">管理所有产品线的创建、删除、重命名和负责人指派。仅超级管理员可操作。</p>
      </div>

      <div class="card pad">
        <div class="toolbar wrap" style="gap:8px;margin-bottom:12px">
          <button type="button" class="btn btn-primary btn-sm" @click="openCreateModal">
            <i class="fa-solid fa-plus"></i> 新增产品线
          </button>
        </div>
        <div style="overflow:auto">
          <table class="data-table compact">
            <thead>
              <tr>
                <th>ID</th>
                <th>产品线名称</th>
                <th>创建日期</th>
                <th>员工数量</th>
                <th>产品线负责人 (PLO)</th>
                <th style="min-width:120px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in lineDetails" :key="line.id">
                <td class="muted small">{{ line.id }}</td>
                <td>
                  <template v-if="renamingId === line.id">
                    <div style="display:flex;gap:6px;align-items:center">
                      <input v-model.trim="renameValue" class="input input-sm" style="width:160px" @keyup.enter="confirmRename(line)" />
                      <button type="button" class="btn btn-primary btn-sm" @click="confirmRename(line)"><i class="fa-solid fa-check"></i></button>
                      <button type="button" class="btn btn-ghost btn-sm" @click="renamingId = null"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                  </template>
                  <template v-else>
                    <span style="font-weight:600">{{ line.name }}</span>
                  </template>
                </td>
                <td class="muted small">{{ line.createdAt || '—' }}</td>
                <td>{{ line.employeeCount }}</td>
                <td>
                  <template v-if="ploEditingId === line.id">
                    <div style="display:flex;gap:6px;align-items:center">
                      <select v-model.number="ploSelectValue" class="input input-sm" style="min-width:160px">
                        <option :value="null">— 不指定 —</option>
                        <option v-for="e in ploEmployeeOptions(line.id)" :key="e.id" :value="e.id">{{ e.name }} ({{ e.id }})</option>
                      </select>
                      <button type="button" class="btn btn-primary btn-sm" @click="confirmPLO(line)"><i class="fa-solid fa-check"></i></button>
                      <button type="button" class="btn btn-ghost btn-sm" @click="ploEditingId = null"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                  </template>
                  <template v-else>
                    <span v-if="line.ploName">{{ line.ploName }}</span>
                    <span v-else class="muted">未指定</span>
                    <button type="button" class="btn btn-ghost btn-sm" style="margin-left:4px" @click="startPLOEdit(line)" title="指派 PLO">
                      <i class="fa-solid fa-pen"></i>
                    </button>
                  </template>
                </td>
                <td class="row-actions">
                  <button type="button" class="btn btn-ghost btn-sm" @click="startRename(line)" title="重命名">
                    <i class="fa-solid fa-pencil"></i>
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    style="color:#dc2626"
                    :disabled="productLine.lines.length <= 1"
                    @click="removeLine(line)"
                    title="删除"
                  >
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>
              <tr v-if="!lineDetails.length">
                <td colspan="6" class="muted" style="text-align:center;padding:1.5rem">暂无产品线</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create modal -->
      <div v-if="createModalOpen" class="modal-backdrop" @click.self="createModalOpen = false">
        <div class="modal card" style="max-width:420px">
          <h3>新增产品线</h3>
          <p class="muted small">创建独立的工作空间（员工、组织、考勤、绩效等），使用演示数据初始化。</p>
          <label class="field" style="margin-top:1rem">
            <span>产品线名称</span>
            <input v-model.trim="newLineName" class="input" placeholder="如：云计算事业部" @keyup.enter="submitCreate" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="createModalOpen = false">取消</button>
            <button type="button" class="btn btn-primary" @click="submitCreate">创建</button>
          </div>
        </div>
      </div>
    </div>
    `,
    setup() {
      const data = useDataStore();
      const auth = useAuthStore();
      const productLine = window.TM.useProductLineStore();

      if (!auth.canManageUsers) {
        toast('无权访问产品线管理', 'error');
        window.TM.router?.push('/hrbp/dashboard');
        return {};
      }

      const createModalOpen = ref(false);
      const newLineName = ref('');
      const renamingId = ref(null);
      const renameValue = ref('');
      const ploEditingId = ref(null);
      const ploSelectValue = ref(null);

      const lineDetails = computed(function () {
        var lines = productLine.lines || [];
        return lines.map(function (line) {
          var emps = window.TM.loadKeyForLine(line.id, 'employees', null);
          var empCount = Array.isArray(emps) ? emps.length : 0;
          var orgSettings = window.TM.loadKeyForLine(line.id, 'orgSettings', null);
          var ploEid = orgSettings ? orgSettings.productLineOwnerEmployeeId : null;
          var ploName = null;
          if (ploEid != null && Array.isArray(emps)) {
            var ploEmp = emps.find(function (e) { return e.id === Number(ploEid); });
            if (ploEmp) ploName = ploEmp.name + ' (' + ploEid + ')';
            else ploName = String(ploEid);
          }
          return {
            id: line.id,
            name: line.name,
            createdAt: line.createdAt,
            employeeCount: empCount,
            ploEid: ploEid,
            ploName: ploName,
          };
        });
      });

      function ploEmployeeOptions(lineId) {
        var emps = window.TM.loadKeyForLine(lineId, 'employees', null);
        if (!Array.isArray(emps)) return [];
        return emps.filter(function (e) { return e.status !== 'leave'; });
      }

      function openCreateModal() {
        newLineName.value = '';
        createModalOpen.value = true;
      }

      async function submitCreate() {
        var name = newLineName.value;
        if (!name) { toast('请输入产品线名称', 'error'); return; }
        var ok = await productLine.createLine(name);
        if (ok) {
          createModalOpen.value = false;
          newLineName.value = '';
          toast('产品线已创建', 'success');
        }
      }

      function startRename(line) {
        renamingId.value = line.id;
        renameValue.value = line.name;
      }

      function confirmRename(line) {
        var newName = renameValue.value;
        if (!newName) { toast('名称不能为空', 'error'); return; }
        var target = productLine.lines.find(function (l) { return l.id === line.id; });
        if (target) {
          target.name = newName;
          productLine.persistRegistry();
          toast('产品线已重命名', 'success');
        }
        renamingId.value = null;
      }

      function startPLOEdit(line) {
        ploEditingId.value = line.id;
        ploSelectValue.value = line.ploEid != null ? Number(line.ploEid) : null;
      }

      function confirmPLO(line) {
        var newPloEid = ploSelectValue.value;
        var orgSettings = window.TM.loadKeyForLine(line.id, 'orgSettings', null) || {};
        orgSettings.productLineOwnerEmployeeId = newPloEid;
        window.TM.saveKeyForLine(line.id, 'orgSettings', orgSettings);

        if (line.id === productLine.currentLineId) {
          data.orgSettings = orgSettings;
          data._markDirty('orgSettings');
          data.persistAll();
        }

        if (newPloEid != null) {
          var emps = window.TM.loadKeyForLine(line.id, 'employees', null);
          var ploEmp = Array.isArray(emps) ? emps.find(function (e) { return e.id === Number(newPloEid); }) : null;
          var existingUser = data.users.find(function (u) { return u.employeeId === Number(newPloEid); });
          if (!existingUser && ploEmp) {
            var maxId = data.users.reduce(function (m, u) { return Math.max(m, Number(u.id) || 0); }, 0);
            var email = ploEmp.email || (ploEmp.name + '@company.com').toLowerCase().replace(/\s+/g, '');
            data.users.push({
              id: maxId + 1,
              username: email.split('@')[0],
              email: email,
              password: '123',
              realName: ploEmp.name,
              role: 'manager',
              employeeId: Number(newPloEid),
              homeLineId: line.id,
              rmStatus: 'active',
              managerPermissions: { modules: (window.TM.MGR_MODULES || []).slice(), ops: window.TM.RM_ALL_OPS_ON() },
            });
            data._markDirty('users');
            data.persistAll();
          }
        }

        ploEditingId.value = null;
        toast('PLO 已更新', 'success');
      }

      async function removeLine(line) {
        if (productLine.lines.length <= 1) {
          toast('至少需要保留一条产品线', 'error');
          return;
        }
        if (!window.confirm(
          '确定移除产品线「' + line.name + '」？\n\n该产品线下的员工、组织、考勤、绩效等数据将被永久删除。此操作不可撤销。'
        )) return;
        await productLine.removeLine(line.id);
        toast('产品线已删除', 'success');
      }

      return {
        productLine, lineDetails,
        createModalOpen, newLineName, openCreateModal, submitCreate,
        renamingId, renameValue, startRename, confirmRename,
        ploEditingId, ploSelectValue, ploEmployeeOptions, startPLOEdit, confirmPLO,
        removeLine,
      };
    },
  };
})();
