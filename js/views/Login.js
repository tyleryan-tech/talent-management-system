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
            <h1>人才管理系统</h1>
            <p class="muted">浏览器演示 · 数据本地存储<span v-if="serverMode"> · <strong>服务端同步</strong>已开启</span></p>
          </div>
        </div>
        <div class="role-tabs">
          <button type="button" :class="['tab', rolePick === 'hrbp' && 'active']" @click="pickRole('hrbp')">HRBP</button>
          <button type="button" :class="['tab', rolePick === 'manager' && 'active']" @click="pickRole('manager')">汇报经理</button>
        </div>
        <form class="form-grid" @submit.prevent="onSubmit">
          <label class="field">
            <span>邮箱或用户名</span>
            <input v-model.trim="username" type="text" autocomplete="username" placeholder="请输入邮箱或用户名" />
          </label>
          <label class="field">
            <span>密码</span>
            <input v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" />
          </label>
          <p v-if="error" class="form-error">{{ error }}</p>
          <button type="submit" class="btn btn-primary btn-block">登录</button>
        </form>
        
      </div>
    </div>
  `,
  setup() {
    const router = useRouter();
    const route = useRoute();
    const auth = useAuthStore();
    const productLine = useProductLineStore();
    const hrScope = useHrScopeStore();
    const username = ref('');
    const password = ref('');
    const rolePick = ref('hrbp');
    const error = ref('');
    const serverMode = computed(() => {
      const ss = window.TM.serverSync;
      return !!(ss && ss.isEnabled && ss.isEnabled());
    });

    function pickRole(r) {
      rolePick.value = r;
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
        error.value = '该账号不是 HRBP 角色，请切换角色或使用其他账号。';
        auth.logout();
        return;
      }
      if (rolePick.value === 'manager' && auth.currentUser.role !== 'manager') {
        error.value = '该账号不是汇报经理角色，请切换角色或使用其他账号。';
        auth.logout();
        return;
      }
      auth.persistSession();
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

      // Auto-switch to user's allowed / home product line
      const cu = auth.currentUser;
      if (cu) {
        const TM = window.TM;
        var allowedIds = Array.isArray(cu.allowedLineIds) && cu.allowedLineIds.length ? cu.allowedLineIds : null;
        var targetLineId = cu.homeLineId;

        // If homeLineId is outside allowedLineIds, override with first allowed line
        if (allowedIds && targetLineId != null && !allowedIds.includes(targetLineId)) {
          targetLineId = allowedIds[0];
        }
        // If no homeLineId but has allowedLineIds, use first allowed
        if (targetLineId == null && allowedIds) {
          targetLineId = allowedIds[0];
        }
        // Fallback: scan storage for the employee if homeLineId is missing
        if (targetLineId == null && cu.employeeId != null) {
          var curEmps = TM.useDataStore().employees || [];
          if (!curEmps.some(function (e) { return e.id === cu.employeeId; })) {
            var found = (productLine.lines || []).find(function (l) {
              if (l.id === productLine.currentLineId) return false;
              var lineEmps = TM.loadKeyForLine(l.id, 'employees', null);
              return Array.isArray(lineEmps) && lineEmps.some(function (e) { return e.id === cu.employeeId; });
            });
            if (found) targetLineId = found.id;
          }
        }
        if (targetLineId != null && targetLineId !== productLine.currentLineId
            && (productLine.lines || []).some(function (l) { return l.id === targetLineId; })) {
          await productLine.switchToLine(targetLineId);
          auth.enrichCurrentUserFromEmployee();
        }
      }

      const redir = route.query.redirect;
      const safeRedirect = typeof redir === 'string'
        && /^\/(?:hrbp|manager|profile)(?:\/|$)/.test(redir);
      if (safeRedirect) router.push(redir);
      else router.push(auth.isHrbp ? '/hrbp/ai-analyst' : '/manager/ai-analyst');
    }

    return { username, password, rolePick, error, pickRole, onSubmit, serverMode };
  },
};
})();
