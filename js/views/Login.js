(function () {
  const { ref, computed } = Vue;
  const { useRouter, useRoute } = VueRouter;
  const useAuthStore = window.TM.useAuthStore;
  const useProductLineStore = window.TM.useProductLineStore;
  const useHrScopeStore = window.TM.useHrScopeStore;

  window.TM.LoginView = {
  name: 'LoginView',
  template: `
    <div class="login-page">
      <div class="login-card card">
        <div class="login-brand">
          <div class="logo-dot"></div>
          <div>
            <h1>Talent Management</h1>
            <p class="muted">Browser demo · Data stored locally<span v-if="serverMode"> · <strong>Server sync</strong> enabled</span></p>
          </div>
        </div>
        <div class="role-tabs">
          <button type="button" :class="['tab', rolePick === 'hrbp' && 'active']" @click="pickRole('hrbp')">HRBP</button>
          <button type="button" :class="['tab', rolePick === 'manager' && 'active']" @click="pickRole('manager')">Reporting Manager</button>
        </div>
        <form class="form-grid" @submit.prevent="onSubmit">
          <label class="field">
            <span>Email or username</span>
            <input v-model.trim="username" type="text" autocomplete="username" placeholder="e.g. hrbp@company.com or hrbp" />
          </label>
          <label class="field">
            <span>Password</span>
            <input v-model="password" type="password" autocomplete="current-password" placeholder="Default: 123" />
          </label>
          <p v-if="error" class="form-error">{{ error }}</p>
          <button type="submit" class="btn btn-primary btn-block">Sign in</button>
        </form>
        <p class="hint muted">Demo: <strong>hrbp@company.com / 123</strong> (HRBP，可新建/移除产品线) · <strong>manager@company.com / 123</strong> (manager) · <strong>superadmin@company.com / 123</strong> (Super Admin). Usernames <strong>hrbp</strong>, <strong>manager</strong>, <strong>superadmin</strong> also work.</p>
      </div>
    </div>
  `,
  setup() {
    const router = useRouter();
    const route = useRoute();
    const auth = useAuthStore();
    const productLine = useProductLineStore();
    const hrScope = useHrScopeStore();
    const username = ref('hrbp@company.com');
    const password = ref('123');
    const rolePick = ref('hrbp');
    const error = ref('');
    const serverMode = computed(() => {
      const ss = window.TM.serverSync;
      return !!(ss && ss.isEnabled && ss.isEnabled());
    });

    function pickRole(r) {
      rolePick.value = r;
      username.value = r === 'hrbp' ? 'hrbp@company.com' : 'manager@company.com';
      password.value = '123';
      error.value = '';
    }

    async function onSubmit() {
      error.value = '';
      const res = await auth.login(username.value, password.value);
      if (!res.ok) {
        error.value = res.message;
        return;
      }
      if (rolePick.value === 'hrbp' && auth.currentUser.role !== 'hrbp' && auth.currentUser.role !== 'super_admin') {
        error.value = 'This account is not HRBP. Switch role or use another account.';
        auth.logout();
        return;
      }
      if (rolePick.value === 'manager' && auth.currentUser.role !== 'manager') {
        error.value = 'This account is not a reporting manager. Switch role or use another account.';
        auth.logout();
        return;
      }
      auth.persistSession();
      const ss = window.TM.serverSync;
      if (ss && ss.isEnabled && ss.isEnabled()) {
        try {
          await ss.hydrateProductLinesFromServer(productLine);
          hrScope.hydrate();
          await ss.pullWorkspaceQuiet();
          productLine.syncAuthForCurrentLine();
          auth.enrichCurrentUserFromEmployee();
          ss.connectWs(productLine.currentLineId);
        } catch (e) {
          const code = e.body?.code || '';
          const status = e.status || 0;
          const isServerDown = status === 0 || status === 502 || status === 503 || status === 504
            || code === 'TM_API_ORIGIN_MISSING' || code === 'UPSTREAM_UNREACHABLE';
          if (isServerDown) {
            console.warn('[login] 服务端不可用，以本地数据继续', e.message || e);
            window.dispatchEvent(new CustomEvent('tm-toast', {
              detail: { message: '服务端暂不可用，已使用本地数据登录。', type: 'warning' },
            }));
          } else {
            error.value = e.body?.error || e.message || '无法从服务器加载数据';
            auth.logout();
            auth.persistSession();
            return;
          }
        }
      }
      const redir = route.query.redirect;
      if (typeof redir === 'string' && redir.startsWith('/')) router.push(redir);
      else router.push(auth.isHrbp ? '/hrbp/dashboard' : '/manager/dashboard');
    }

    return { username, password, rolePick, error, pickRole, onSubmit, serverMode };
  },
};
})();
