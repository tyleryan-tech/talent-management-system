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
        <p class="hint muted">Demo: <strong>hrbp@company.com / 123</strong> (HRBP 超级管理员) · <strong>manager@company.com / 123</strong> (汇报经理) · <strong>intern@company.com / 123</strong> (实习生)</p>
      </div>
    </div>
  `,
  setup() {
    const router = useRouter();
    const route = useRoute();
    const auth = useAuthStore();
    const productLine = useProductLineStore();
    const hrScope = useHrScopeStore();
    const username = ref('tyler.yan@shopee.com');
    const password = ref('123');
    const rolePick = ref('hrbp');
    const error = ref('');
    const serverMode = computed(() => {
      const ss = window.TM.serverSync;
      return !!(ss && ss.isEnabled && ss.isEnabled());
    });

    function pickRole(r) {
      rolePick.value = r;
      username.value = r === 'hrbp' ? 'tyler.yan@shopee.com' : 'manager@company.com';
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
      // Load per-user chart preferences
      if (window.TM.chartPrefs) {
        window.TM.chartPrefs.reload(auth.currentUser?.email || auth.currentUser?.username || '');
      }
      const ss = window.TM.serverSync;
      const hasServerToken = ss && ss.getToken && ss.getToken();
      if (hasServerToken) {
        try {
          await ss.hydrateProductLinesFromServer(productLine);
          hrScope.hydrate();
          await ss.pullWorkspaceQuiet();
          productLine.syncAuthForCurrentLine();
          auth.enrichCurrentUserFromEmployee();
          ss.connectWs(productLine.currentLineId);
        } catch (e) {
          console.warn('[login] 服务端数据加载失败，以本地数据继续', e.message || e);
          window.dispatchEvent(new CustomEvent('tm-toast', {
            detail: { message: '服务端数据加载失败，已使用本地数据登录。', type: 'warning' },
          }));
        }
      }
      const redir = route.query.redirect;
      const safeRedirect = typeof redir === 'string'
        && /^\/(?:hrbp|manager|profile)(?:\/|$)/.test(redir);
      if (safeRedirect) router.push(redir);
      else router.push(auth.isHrbp ? '/hrbp/dashboard' : '/manager/dashboard');
    }

    return { username, password, rolePick, error, pickRole, onSubmit, serverMode };
  },
};
})();
