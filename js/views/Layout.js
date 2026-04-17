(function () {
  const { computed, onMounted, onUnmounted, ref } = Vue;
  const { useRoute, useRouter } = VueRouter;
  const useAuthStore = window.TM.useAuthStore;
  const useProductLineStore = window.TM.useProductLineStore;

  window.TM.LayoutView = {
  name: 'AppLayout',
  template: `
    <div class="layout" :class="{ 'nav-collapsed': navCollapsed }">
      <aside class="sidebar">
        <div class="sidebar-head">
          <div class="logo-dot sm"></div>
          <span class="brand">人才管理</span>
          <button type="button" class="icon-btn nav-toggle" @click="navCollapsed = !navCollapsed" aria-label="Toggle menu">
            <i class="fa-solid fa-bars"></i>
          </button>
        </div>
        <div v-if="hasDualAccess || isInAdminZone || isSuperAdmin" class="sidebar-zone-switch">
          <button type="button" class="zone-btn" :class="{ active: isInHrbpZone }" @click="$router.push('/hrbp/dashboard')"><i class="fa-solid fa-user-shield fa-fw"></i> HRBP</button>
          <button v-if="canAccessMgr" type="button" class="zone-btn" :class="{ active: isInMgrZone }" @click="$router.push('/manager/dashboard')"><i class="fa-solid fa-people-group fa-fw"></i> Manager</button>
          <template v-if="isSuperAdmin">
            <button type="button" class="zone-btn" :class="{ active: isInAdminZone }" @click="$router.push('/admin/users')"><i class="fa-solid fa-shield-halved fa-fw"></i> 管理</button>
          </template>
        </div>
        <div class="sidebar-product-lines" v-if="showProductLineSection && !isInAdminZone">
          <div class="muted small product-line-label">Product line</div>
          <template v-if="productLine.canSwitchLine || isSuperAdmin">
            <select
              class="product-line-select"
              :value="productLine.currentLineId"
              title="切换产品线"
              @change="onProductLineChange($event)"
            >
              <option v-for="l in productLine.accessibleLines" :key="l.id" :value="l.id">{{ l.name }}</option>
            </select>
          </template>
          <template v-else>
            <div class="product-line-select" style="padding:6px 10px;font-size:0.85rem;color:var(--text)">{{ productLine.currentLine?.name || '—' }}</div>
          </template>
        </div>
        <nav class="side-nav">
          <router-link
            v-for="item in menu"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            active-class="active"
          >
            <i :class="['fa-fw', item.icon]"></i>
            <span>{{ item.label }}</span>
          </router-link>
        </nav>
      </aside>
      <div class="main-wrap">
        <header class="topbar">
          <div class="topbar-title">
            <span>{{ pageTitle }}</span>
            <span class="muted topbar-user" v-if="auth.currentUser">{{ auth.currentUser.realName }} · {{ roleLabel }}</span>
            <span class="muted topbar-user" v-if="productLine.currentLine">Product line: {{ productLine.currentLine.name }}</span>
          </div>
          <div class="topbar-actions">
            <router-link to="/profile" class="btn btn-ghost btn-sm"><i class="fa-regular fa-user"></i> 个人设置</router-link>
            <button type="button" class="btn btn-ghost btn-sm" @click="logout"><i class="fa-solid fa-arrow-right-from-bracket"></i> 退出登录</button>
          </div>
        </header>
        <main class="page-content">
          <router-view :key="routerViewKey" />
        </main>
      </div>
      
      <div v-if="toast.message" :class="['toast', toast.type]" role="status" aria-live="polite">{{ toast.message }}</div>
      <div v-if="globalLoading" class="global-loading-bar"><div class="global-loading-bar-inner"></div></div>
    </div>
  `,
  setup() {
    const router = useRouter();
    const r = useRoute();
    const auth = useAuthStore();
    const productLine = useProductLineStore();

    const roleLabel = computed(() => {
      if (!auth.currentUser) return '';
      if (auth.isProductLineHead) return '产品线负责人';
      const sub = auth.effectiveSubType;
      if (sub === 'super_admin') return 'Super Admin';
      if (sub === 'admin') return 'HRBP 管理员';
      if (sub === 'intern') return 'HRBP 实习生';
      return auth.isHrbp ? 'HRBP' : '汇报经理';
    });
    const navCollapsed = ref(false);
    const toast = ref({ message: '', type: 'info' });
    const globalLoading = ref(false);
    let toastTimer;

    function showToast(e) {
      toast.value = { message: e.detail?.message || '', type: e.detail?.type || 'info' };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.value = { message: '', type: 'info' }; }, 4200);
    }
    function onLoading(e) { globalLoading.value = !!e.detail?.loading; }

    onMounted(() => { window.addEventListener('tm-toast', showToast); window.addEventListener('tm-loading', onLoading); });
    onUnmounted(() => { window.removeEventListener('tm-toast', showToast); window.removeEventListener('tm-loading', onLoading); });

    const allHrbpMenuItems = [
      { to: '/hrbp/dashboard', label: '仪表盘', icon: 'fa-solid fa-gauge-high', module: 'dashboard' },
      { to: '/hrbp/roster', label: '花名册', icon: 'fa-solid fa-users', module: 'roster' },
      { to: '/hrbp/org', label: '组织管理', icon: 'fa-solid fa-sitemap', module: 'org' },
      { to: '/hrbp/recruitment', label: '招聘管理', icon: 'fa-solid fa-user-plus', module: 'recruitment' },
      { to: '/hrbp/talent', label: '人才盘点', icon: 'fa-solid fa-chess-board', module: 'talent' },
      { to: '/hrbp/performance', label: '绩效管理', icon: 'fa-solid fa-chart-line', module: 'performance' },
      { to: '/hrbp/attendance', label: '考勤管理', icon: 'fa-solid fa-clock', module: 'attendance' },
      { to: '/hrbp/ai-analyst', label: 'AI 数据分析', icon: 'fa-solid fa-robot', module: 'ai_analyst' },
    ];
    const allAdminMenuItems = [
      { to: '/admin/users', label: '用户管理', icon: 'fa-solid fa-user-shield' },
      { to: '/admin/product-lines', label: '产品线管理', icon: 'fa-solid fa-layer-group' },
    ];
    const adminMenu = computed(() => allAdminMenuItems);
    const hrbpMenu = computed(() => {
      return allHrbpMenuItems.filter((item) => {
        if (item.superAdminOnly) return auth.effectiveSubType === 'super_admin';
        if (item.module) return auth.canAccessModule(item.module);
        return true;
      });
    });

    const allMgrMenuItems = [
      { to: '/manager/dashboard', label: '仪表盘', icon: 'fa-solid fa-gauge-high', module: 'dashboard' },
      { to: '/manager/roster', label: '花名册', icon: 'fa-solid fa-people-group', module: 'roster' },
      { to: '/manager/org', label: '组织管理', icon: 'fa-solid fa-sitemap', module: 'org' },
      { to: '/manager/recruitment', label: '招聘管理', icon: 'fa-solid fa-user-plus', module: 'recruitment' },
      { to: '/manager/talent', label: '人才盘点', icon: 'fa-solid fa-chess-board', module: 'talent' },
      { to: '/manager/performance', label: '绩效管理', icon: 'fa-solid fa-clipboard-check', module: 'performance' },
      { to: '/manager/attendance', label: '考勤管理', icon: 'fa-solid fa-clock', module: 'attendance' },
      { to: '/manager/ai-analyst', label: 'AI 数据分析', icon: 'fa-solid fa-robot', module: 'ai_analyst' },
    ];
    const mgrMenu = computed(() =>
      allMgrMenuItems.filter((item) => auth.canAccessModule(item.module)),
    );

    const isSuperAdmin = computed(() => auth.effectiveSubType === 'super_admin');
    const showProductLineSection = computed(() => {
      if (isSuperAdmin.value) return true;
      return productLine.canSwitchLine;
    });

    const canAccessHrbp = computed(() => auth.isHrbp || auth.isSuperAdmin || auth.isProductLineHead);
    const canAccessMgr = computed(() => auth.isManager);
    const hasDualAccess = computed(() => canAccessHrbp.value && canAccessMgr.value);

    const isInAdminZone = computed(() => r.path.startsWith('/admin'));
    const isInHrbpZone = computed(() => r.path.startsWith('/hrbp'));
    const isInMgrZone = computed(() => r.path.startsWith('/manager'));

    const menu = computed(() => {
      if (r.path.startsWith('/admin')) return adminMenu.value;
      if (r.path.startsWith('/profile')) {
        return canAccessHrbp.value ? hrbpMenu.value : mgrMenu.value;
      }
      if (r.path.startsWith('/hrbp')) return hrbpMenu.value;
      return mgrMenu.value;
    });

    const pageTitle = computed(() => {
      const m = r.matched.find((x) => x.meta?.title);
      return m?.meta?.title || (auth.isHrbp ? 'HRBP 工作台' : '经理工作台');
    });

    const routerViewKey = computed(() => {
      if (r.path.startsWith('/admin')) return 'admin-' + r.fullPath;
      return (productLine.currentLineId ?? 0) + '-' + r.fullPath;
    });

    async function onProductLineChange(ev) {
      const id = Number(ev.target.value);
      if (Number.isNaN(id) || id === productLine.currentLineId) return;
      const ok = await productLine.switchToLine(id);
      if (ok) {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Product line switched', type: 'success' } }));
      }
    }

    function logout() {
      auth.logout();
      auth.persistSession();
      router.push('/login');
    }

    return {
      menu, pageTitle, logout, navCollapsed, toast, globalLoading, auth,
      productLine, routerViewKey, onProductLineChange,
      roleLabel, canAccessMgr,
      hasDualAccess, isInHrbpZone, isInMgrZone, isInAdminZone,
      isSuperAdmin, showProductLineSection,
    };
  },
};
})();
