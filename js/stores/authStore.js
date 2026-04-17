/**
 * 登录态 + 权限体系
 *
 * HRBP sub-types: 'super_admin' | 'admin' | 'intern'
 *   - super_admin: all permissions including user management
 *   - admin: same as super_admin but cannot manage HRBP users
 *   - intern: recruitment only by default; other modules toggled per-user
 *
 * Manager permissions are fully configurable per-user:
 *   - Product-line owner: same as HRBP super_admin
 *   - Other managers: module access + granular operation permissions
 *   - New RMs start as rmStatus='pending_approval' until super_admin confirms
 */
(function () {
  const { defineStore } = Pinia;
  const useDataStore = () => window.TM.useDataStore();

  const HRBP_MODULES = ['dashboard', 'roster', 'org', 'recruitment', 'talent', 'performance', 'attendance'];
  window.TM.HRBP_MODULES = HRBP_MODULES;

  const MGR_MODULES = ['dashboard', 'roster', 'org', 'recruitment', 'talent', 'performance', 'attendance'];
  window.TM.MGR_MODULES = MGR_MODULES;

  /**
   * Every RM operation that can be toggled by a super_admin.
   * Grouped by the module they belong to.
   */
  const RM_PERM_DEFS = [
    { key: 'roster.add',       module: 'roster',      label: '添加员工',       desc: '在花名册中新增员工' },
    { key: 'roster.edit',      module: 'roster',      label: '编辑员工',       desc: '修改团队成员信息' },
    { key: 'roster.leave',     module: 'roster',      label: '标记离职',       desc: '将员工标记为离职状态' },
    { key: 'roster.export',    module: 'roster',      label: '导出 Excel',     desc: '导出花名册数据' },
    { key: 'roster.import',    module: 'roster',      label: '导入 Excel',     desc: '批量导入员工数据' },

    { key: 'org.submitChange', module: 'org',         label: '提交组织变更',   desc: '创建/修改/删除部门和 HC' },
    { key: 'org.approveChange',module: 'org',         label: '审批组织变更',   desc: '审批组织结构变更请求' },
    { key: 'org.hcPlan',       module: 'org',         label: '修改 HC 计划',   desc: '调整部门人员编制计划' },
    { key: 'org.recruitTag',   module: 'org',         label: '标记招聘',       desc: '标记空编岗位为招聘中' },

    { key: 'recruit.add',      module: 'recruitment',  label: '添加/编辑候选人',desc: '在招聘管道中添加或编辑候选人' },
    { key: 'recruit.delete',   module: 'recruitment',  label: '删除候选人',     desc: '从管道中删除候选人' },
    { key: 'recruit.import',   module: 'recruitment',  label: '导入管道',       desc: '通过 Excel 导入候选人数据' },
    { key: 'recruit.export',   module: 'recruitment',  label: '导出管道',       desc: '导出候选人数据' },
    { key: 'recruit.pool',     module: 'recruitment',  label: '管理面试官池',   desc: '管理面试官池成员' },

    { key: 'talent.potential',  module: 'talent',      label: '评估潜力',       desc: '编辑员工潜力评级（H/M/L）' },
    { key: 'talent.labels',     module: 'talent',      label: '编辑标签',       desc: '编辑九宫格标签和备注' },
    { key: 'talent.succession', module: 'talent',      label: '继任计划',       desc: '管理关键岗位继任规划' },
    { key: 'talent.devPlan',    module: 'talent',      label: '发展计划',       desc: '编辑员工个人发展计划' },

    { key: 'perf.evaluate',     module: 'performance', label: '绩效评估',       desc: '提交绩效初评' },
    { key: 'perf.approve',      module: 'performance', label: '审批绩效',       desc: '审批/驳回绩效评估' },
    { key: 'perf.proxy',        module: 'performance', label: '代操作',         desc: '代替下级评估/审批' },
    { key: 'perf.urge',         module: 'performance', label: '催促下级',       desc: '催促下级完成评估/审批' },
    { key: 'perf.communicate',  module: 'performance', label: '绩效沟通',       desc: '记录绩效面谈' },

    { key: 'att.import',        module: 'attendance',  label: '导入考勤',       desc: '上传考勤打卡数据' },
  ];
  window.TM.RM_PERM_DEFS = RM_PERM_DEFS;

  /** Build a default ops map where every permission is ON */
  function allOpsOn() {
    const ops = {};
    RM_PERM_DEFS.forEach(function (d) { ops[d.key] = true; });
    return ops;
  }
  window.TM.RM_ALL_OPS_ON = allOpsOn;

  window.TM.useAuthStore = defineStore('auth', {
    state: () => ({
      currentUser: null,
    }),
    getters: {
      isLoggedIn: (s) => !!s.currentUser,
      role: (s) => s.currentUser?.role || null,
      isHrbp: (s) => s.currentUser?.role === 'hrbp' || s.currentUser?.role === 'super_admin',
      isManager: (s) => s.currentUser?.role === 'manager',
      isSuperAdmin: (s) => s.currentUser?.superAdmin === true || s.currentUser?.role === 'super_admin',

      hrbpSubType() {
        if (!this.isHrbp) return null;
        return this.currentUser?.hrbpSubType || (this.isSuperAdmin ? 'super_admin' : 'admin');
      },
      isProductLineHead() {
        if (!this.currentUser) return false;
        const data = useDataStore();
        const eid = this.currentUser.employeeId;
        const ownerId = data.orgSettings?.productLineHeadEmployeeId;
        return eid != null && ownerId != null && ownerId !== '' && Number(ownerId) === Number(eid);
      },
      effectiveSubType() {
        if (this.isProductLineHead) return 'super_admin';
        if (this.isHrbp) return this.hrbpSubType;
        if (this.isManager) return 'manager';
        return null;
      },
      canManageUsers() {
        return this.effectiveSubType === 'super_admin';
      },
    },
    actions: {
      /* ── Permission checks ── */

      /**
       * Check if the current user has a specific operation permission.
       * HRBP super_admin / admin → always true.
       * HRBP intern → true if the operation's module is in allowedModules.
       * Manager (PL owner) → always true.
       * Manager (normal) → check managerPermissions.ops[key].
       */
      hasPermission(permKey) {
        if (!this.isLoggedIn) return false;
        const sub = this.effectiveSubType;
        if (sub === 'super_admin') return true;
        if (sub === 'admin') {
          if (this.currentUser?.disabledOps && this.currentUser.disabledOps[permKey]) return false;
          return this.canAccessModule((RM_PERM_DEFS.find(function (d) { return d.key === permKey; }) || {}).module || permKey.split('.')[0]);
        }
        if (sub === 'intern') {
          const def = RM_PERM_DEFS.find(function (d) { return d.key === permKey; });
          const mod = def ? def.module : permKey.split('.')[0];
          if (!this.canAccessModule(mod)) return false;
          if (this.currentUser?.disabledOps && this.currentUser.disabledOps[permKey]) return false;
          return true;
        }
        if (this.isManager) {
          if (this.currentUser?.rmStatus === 'pending_approval') return false;
          const defM = RM_PERM_DEFS.find(function (d) { return d.key === permKey; });
          const modM = defM ? defM.module : permKey.split('.')[0];
          if (!this.canAccessModule(modM)) return false;
          const perms = this.currentUser?.managerPermissions;
          if (!perms || !perms.ops) return true;
          return perms.ops[permKey] !== false;
        }
        return true;
      },

      canAccessModule(moduleKey) {
        if (!this.isLoggedIn) return false;
        const sub = this.effectiveSubType;
        if (sub === 'super_admin') return true;
        if (sub === 'admin') {
          const am = this.currentUser?.allowedModules;
          if (!am) return true;
          return am.includes(moduleKey);
        }
        if (sub === 'intern') {
          if (moduleKey === 'recruitment') return true;
          const allowed = this.currentUser?.allowedModules || [];
          return allowed.includes(moduleKey);
        }
        if (this.isManager) {
          if (this.currentUser?.rmStatus === 'pending_approval') {
            return moduleKey === 'dashboard' || moduleKey === 'performance';
          }
          const perms = this.currentUser?.managerPermissions;
          if (!perms || !perms.modules) return true;
          return perms.modules.includes(moduleKey);
        }
        return true;
      },

      /* ── Login / session ── */

      _isProduction() {
        try {
          const m = document.querySelector('meta[name="tm-env"]');
          return (m?.getAttribute('content') || '').trim() === 'production';
        } catch { return false; }
      },
      async login(identifier, password) {
        const ss = window.TM.serverSync;
        if (ss && ss.isEnabled && ss.isEnabled()) {
          try {
            const r = await ss.login(identifier, password);
            this.currentUser = { ...r.user };
            this.enrichCurrentUserFromEmployee();
            return { ok: true };
          } catch (e) {
            const code = e.body?.code || '';
            const status = e.status || 0;
            const isServerDown = status === 0 || status === 404 || status === 500 || status === 502 || status === 503 || status === 504
              || code === 'TM_API_ORIGIN_MISSING' || code === 'UPSTREAM_UNREACHABLE'
              || code === 'FUNCTION_INVOCATION_FAILED';
            if (isServerDown) {
              console.warn('[auth] 服务端不可用，降级为本地账号登录', status, e.message || e);
              return this._localLogin(identifier, password);
            }
            if (status === 401) {
              return this._localLogin(identifier, password);
            }
            const msg = e.body?.error || e.message || '登录失败';
            return { ok: false, message: msg };
          }
        }
        return this._localLogin(identifier, password);
      },
      _ensureFallbackUsers() {
        const data = useDataStore();
        if (data.users && data.users.length > 0) {
          this._migrateUsers();
          return;
        }
        data.users = [
          { id: 1, username: 'hrbp', email: 'hrbp@company.com', password: '123', role: 'hrbp', superAdmin: true, hrbpSubType: 'super_admin', realName: 'HRBP Super Admin', employeeId: null },
          { id: 2, username: 'manager', email: 'manager@company.com', password: '123', role: 'manager', realName: 'Reporting Manager', employeeId: null, rmStatus: 'active', managerPermissions: { modules: MGR_MODULES.slice(), ops: allOpsOn() } },
          { id: 3, username: 'superadmin', email: 'superadmin@company.com', password: '123', role: 'hrbp', superAdmin: true, hrbpSubType: 'super_admin', realName: 'Super Admin', employeeId: null },
          { id: 4, username: 'intern', email: 'intern@company.com', password: '123', role: 'hrbp', hrbpSubType: 'intern', allowedModules: ['recruitment'], realName: 'Intern Demo', employeeId: null },
          { id: 5, username: 'tyler.yan', email: 'tyler.yan@shopee.com', password: '123', role: 'hrbp', superAdmin: true, hrbpSubType: 'super_admin', realName: 'Tyler Yan', employeeId: null },
        ];
        data._markDirty('users');
        data.persistAllSync();
      },
      _migrateUsers() {
        const data = useDataStore();
        if (!data.users) return;
        let dirty = false;
        var plStore = window.TM.useProductLineStore ? window.TM.useProductLineStore() : null;
        var curLineId = plStore ? plStore.currentLineId : null;
        data.users.forEach(function (u) {
          if (u.role === 'hrbp' && !u.hrbpSubType) {
            u.hrbpSubType = u.superAdmin ? 'super_admin' : 'admin';
            dirty = true;
          }
          if (u.role === 'hrbp' && u.hrbpSubType === 'super_admin' && !u.superAdmin) {
            u.superAdmin = true;
            dirty = true;
          }
          if (u.role === 'manager' && !u.rmStatus) {
            u.rmStatus = 'active';
            dirty = true;
          }
          if (u.role === 'manager' && !u.managerPermissions) {
            u.managerPermissions = { modules: MGR_MODULES.slice(), ops: allOpsOn() };
            dirty = true;
          }
          if (u.homeLineId == null && u.employeeId != null && plStore) {
            var TM = window.TM;
            var lines = plStore.lines || [];
            for (var li = 0; li < lines.length; li++) {
              var lineEmps = TM.loadKeyForLine(lines[li].id, 'employees', null);
              if (Array.isArray(lineEmps) && lineEmps.some(function (e) { return e.id === u.employeeId; })) {
                u.homeLineId = lines[li].id;
                dirty = true;
                break;
              }
            }
          }
        });
        const BUILTIN = [
          { username: 'tyler.yan', email: 'tyler.yan@shopee.com', password: '123', role: 'hrbp', superAdmin: true, hrbpSubType: 'super_admin', realName: 'Tyler Yan', employeeId: null },
        ];
        BUILTIN.forEach(function (b) {
          const exists = data.users.some(function (u) {
            return (u.email && u.email.toLowerCase() === b.email.toLowerCase())
              || (u.username && u.username === b.username);
          });
          if (!exists) {
            const maxId = data.users.reduce(function (m, u) { return Math.max(m, Number(u.id) || 0); }, 0);
            data.users.push(Object.assign({ id: maxId + 1 }, b));
            dirty = true;
          }
        });
        if (dirty) { data._markDirty('users'); data.persistAll(); }
      },
      _localLogin(identifier, password) {
        this._ensureFallbackUsers();
        const data = useDataStore();
        const id = String(identifier || '').trim();
        const idLower = id.toLowerCase();
        const _pwMatch = (stored, input) => {
          if (!stored) return false;
          if (stored === input) return true;
          if (stored.startsWith('h$') && typeof window.TM._simpleHash === 'function') {
            return stored === window.TM._simpleHash(input);
          }
          return false;
        };
        let u = data.users.find((x) => {
          if (!_pwMatch(x.password, password)) return false;
          const un = String(x.username || '').trim();
          const em = String(x.email || '').trim().toLowerCase();
          return un === id || (em && em === idLower);
        });
        if (!u) {
          u = data.users.find((x) => {
            if (!_pwMatch(x.password, password)) return false;
            const un = String(x.username || '').trim().toLowerCase();
            const em = String(x.email || '').trim().toLowerCase();
            const rn = String(x.realName || '').trim().toLowerCase();
            return un.startsWith(idLower) || em.startsWith(idLower) || rn.toLowerCase() === idLower;
          });
        }
        if (!u) return { ok: false, message: '邮箱/用户名或密码错误' };
        const { password: _pw, ...safeUser } = u;
        this.currentUser = { ...safeUser };
        this.enrichCurrentUserFromEmployee();
        return { ok: true };
      },
      enrichCurrentUserFromEmployee() {
        if (!this.currentUser) return;
        this._migrateUsers();
        const data = useDataStore();
        const su = data.users.find((x) => x.id === this.currentUser.id
          || (this.currentUser.username && x.username === this.currentUser.username)
          || (this.currentUser.email && String(x.email || '').toLowerCase() === String(this.currentUser.email).toLowerCase()));
        if (su) {
          const { password: _pw, ...safeSu } = su;
          this.currentUser = { ...this.currentUser, ...safeSu };
        }
        const uid = this.currentUser?.employeeId;
        if (uid == null) {
          this.currentUser = { ...this.currentUser, orgRole: '' };
          this.persistSession();
          return;
        }
        const emp = data.employees.find((e) => e.id === uid);
        if (!emp) {
          // Employee not in current product line — keep employeeId intact
          // so Login auto-switch can still find the correct line.
          // Only clear orgRole since we can't determine it cross-line.
          this.currentUser = { ...this.currentUser, orgRole: '' };
          this.persistSession();
          return;
        }
        this.currentUser = {
          ...this.currentUser,
          orgRole: String(emp.orgRole || '').trim(),
        };
        this.persistSession();
      },
      logout() {
        const ss = window.TM.serverSync;
        if (ss && ss.isEnabled && ss.isEnabled() && typeof ss.logout === 'function') ss.logout();
        this.currentUser = null;
      },
      restoreSession() {
        try {
          const raw = sessionStorage.getItem('tm_session');
          if (raw) this.currentUser = JSON.parse(raw);
        } catch {
          this.currentUser = null;
        }
      },
      persistSession() {
        if (this.currentUser) {
          const { password: _pw, ...safe } = this.currentUser;
          sessionStorage.setItem('tm_session', JSON.stringify(safe));
        } else {
          sessionStorage.removeItem('tm_session');
        }
      },
    },
  });
})();
