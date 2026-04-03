/**
 * 登录态（非模块）
 */
(function () {
  const { defineStore } = Pinia;
  const useDataStore = () => window.TM.useDataStore();

  window.TM.useAuthStore = defineStore('auth', {
    state: () => ({
      currentUser: null,
    }),
    getters: {
      isLoggedIn: (s) => !!s.currentUser,
      role: (s) => s.currentUser?.role || null,
      isHrbp: (s) => s.currentUser?.role === 'hrbp' || s.currentUser?.role === 'super_admin',
      isManager: (s) => s.currentUser?.role === 'manager',
      /** 超级管理员：高危系统级操作（演示：用户标记 superAdmin 或 role === super_admin） */
      isSuperAdmin: (s) => s.currentUser?.superAdmin === true || s.currentUser?.role === 'super_admin',
    },
    actions: {
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
            const isServerDown = status === 0 || status === 502 || status === 503 || status === 504
              || code === 'TM_API_ORIGIN_MISSING' || code === 'UPSTREAM_UNREACHABLE';
            const is404Html = status === 404 && /NOT_FOUND/i.test(String(e.body?.raw || ''));
            if (isServerDown || is404Html) {
              console.warn('[auth] 服务端不可用，降级为本地账号登录', status, e.message || e);
              const local = this._localLogin(identifier, password);
              if (!local.ok) local.message = '服务端暂不可用，本地登录也失败。请稍后重试或刷新页面。';
              return local;
            }
            console.error('[auth] server login failed', status, e.body);
            const debug = e.body?._debug ? ` [debug: ${JSON.stringify(e.body._debug)}]` : '';
            const msg = (e.body?.error || e.message || '登录失败') + debug;
            return { ok: false, message: msg };
          }
        }
        return this._localLogin(identifier, password);
      },
      _ensureFallbackUsers() {
        const data = useDataStore();
        if (data.users && data.users.length > 0) return;
        data.users = [
          { id: 1, username: 'hrbp', email: 'hrbp@company.com', password: '123', role: 'hrbp', realName: 'HRBP Admin', employeeId: null },
          { id: 2, username: 'manager', email: 'manager@company.com', password: '123', role: 'manager', realName: 'Reporting Manager', employeeId: null },
          { id: 3, username: 'superadmin', email: 'superadmin@company.com', password: '123', role: 'hrbp', superAdmin: true, realName: 'Super Admin', employeeId: null },
        ];
      },
      _localLogin(identifier, password) {
        this._ensureFallbackUsers();
        const data = useDataStore();
        const id = String(identifier || '').trim();
        const idLower = id.toLowerCase();
        const u = data.users.find((x) => {
          if (x.password !== password) return false;
          const un = String(x.username || '').trim();
          const em = String(x.email || '').trim().toLowerCase();
          return un === id || (em && em === idLower);
        });
        if (!u) return { ok: false, message: '邮箱/用户名或密码错误' };
        this.currentUser = { ...u };
        this.enrichCurrentUserFromEmployee();
        return { ok: true };
      },
      enrichCurrentUserFromEmployee() {
        if (!this.currentUser) return;
        const data = useDataStore();
        const su = data.users.find((x) => x.id === this.currentUser.id
          || (this.currentUser.username && x.username === this.currentUser.username)
          || (this.currentUser.email && String(x.email || '').toLowerCase() === String(this.currentUser.email).toLowerCase()));
        if (su) this.currentUser = { ...this.currentUser, ...su };
        const uid = this.currentUser?.employeeId;
        if (uid == null) {
          this.currentUser = { ...this.currentUser, orgRole: '' };
          this.persistSession();
          return;
        }
        const emp = data.employees.find((e) => e.id === uid);
        if (!emp) {
          this.currentUser = { ...this.currentUser, employeeId: null, orgRole: '' };
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
        if (this.currentUser) sessionStorage.setItem('tm_session', JSON.stringify(this.currentUser));
        else sessionStorage.removeItem('tm_session');
      },
    },
  });
})();
