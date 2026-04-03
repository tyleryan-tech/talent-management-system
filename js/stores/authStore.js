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
              console.warn('[auth] 服务端不可用，降级为本地账号登录', e.message || e);
              return this._localLogin(identifier, password);
            }
            const msg = e.body?.error || e.message || '登录失败';
            return { ok: false, message: msg };
          }
        }
        return this._localLogin(identifier, password);
      },
      _localLogin(identifier, password) {
        const data = useDataStore();
        const id = String(identifier || '').trim();
        const idLower = id.toLowerCase();
        const u = data.users.find((x) => {
          if (x.password !== password) return false;
          const un = String(x.username || '').trim();
          const em = String(x.email || '').trim().toLowerCase();
          return un === id || (em && em === idLower);
        });
        if (!u) return { ok: false, message: 'Invalid email/username or password' };
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
