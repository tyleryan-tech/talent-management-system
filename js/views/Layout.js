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
          <span class="brand">Talent Hub</span>
          <button type="button" class="icon-btn nav-toggle" @click="navCollapsed = !navCollapsed" aria-label="Toggle menu">
            <i class="fa-solid fa-bars"></i>
          </button>
        </div>
        <div class="sidebar-product-lines">
          <div class="muted small product-line-label">Product line</div>
          <select
            class="product-line-select"
            :value="productLine.currentLineId"
            title="Switch product line (isolated data)"
            @change="onProductLineChange($event)"
          >
            <option v-for="l in productLine.lines" :key="l.id" :value="l.id">{{ l.name }}</option>
          </select>
          <button v-if="auth.isHrbp" type="button" class="btn product-line-new-btn" @click="openLineModal">
            <i class="fa-solid fa-plus fa-fw"></i><span class="product-line-new-txt">New product line</span>
          </button>
          <button
            v-if="auth.isHrbp && productLine.lines.length > 1"
            type="button"
            class="btn product-line-remove-btn"
            title="删除当前选中的产品线（不可恢复）"
            @click="confirmRemoveProductLine"
          >
            <i class="fa-solid fa-trash-can fa-fw"></i><span class="product-line-remove-txt">移除产品线</span>
          </button>
        </div>
        <div v-if="hasDualAccess" class="sidebar-zone-switch">
          <button type="button" class="zone-btn" :class="{ active: isInHrbpZone }" @click="$router.push('/hrbp/dashboard')"><i class="fa-solid fa-user-shield fa-fw"></i> HRBP</button>
          <button type="button" class="zone-btn" :class="{ active: !isInHrbpZone }" @click="$router.push('/manager/dashboard')"><i class="fa-solid fa-people-group fa-fw"></i> Manager</button>
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
            <router-link to="/profile" class="btn btn-ghost btn-sm"><i class="fa-regular fa-user"></i> Profile</router-link>
            <button type="button" class="btn btn-ghost btn-sm" @click="logout"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sign out</button>
          </div>
        </header>
        <main class="page-content">
          <router-view :key="routerViewKey" />
        </main>
      </div>
      <div v-if="lineModalOpen" class="modal-backdrop" @click.self="lineModalOpen = false">
        <div class="modal card" style="max-width:420px">
          <h3>New product line</h3>
          <p class="muted small">Creates an isolated workspace (employees, org, attendance, performance, etc.). Seeds the same demo data as first launch, including roster. Demo accounts hrbp / manager (password 123) with Staff IDs bound to demo employees.</p>
          <label class="field" style="margin-top:1rem">
            <span>Product line name</span>
            <input v-model.trim="newLineName" class="input" placeholder="e.g. Cloud BU" @keyup.enter="submitNewLine" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="lineModalOpen = false">Cancel</button>
            <button type="button" class="btn btn-primary" @click="submitNewLine">Create</button>
          </div>
        </div>
      </div>
      <div v-if="toast.message" :class="['toast', toast.type]">{{ toast.message }}</div>
    </div>
  `,
  setup() {
    const router = useRouter();
    const r = useRoute();
    const auth = useAuthStore();
    const productLine = useProductLineStore();

    const roleLabel = computed(() => {
      if (!auth.currentUser) return '';
      const sub = auth.effectiveSubType;
      if (sub === 'super_admin') return 'Super Admin';
      if (sub === 'admin') return 'HRBP 管理员';
      if (sub === 'intern') return 'HRBP 实习生';
      if (auth.isProductLineOwner) return '产品线负责人';
      return auth.isHrbp ? 'HRBP' : 'Reporting Manager';
    });
    const navCollapsed = ref(false);
    const lineModalOpen = ref(false);
    const newLineName = ref('');
    const toast = ref({ message: '', type: 'info' });
    let toastTimer;

    function showToast(e) {
      toast.value = { message: e.detail?.message || '', type: e.detail?.type || 'info' };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.value = { message: '', type: 'info' }; }, 4200);
    }

    onMounted(() => window.addEventListener('tm-toast', showToast));
    onUnmounted(() => window.removeEventListener('tm-toast', showToast));

    const allHrbpMenuItems = [
      { to: '/hrbp/dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high', module: 'dashboard' },
      { to: '/hrbp/roster', label: 'Roster', icon: 'fa-solid fa-users', module: 'roster' },
      { to: '/hrbp/org', label: 'Organization', icon: 'fa-solid fa-sitemap', module: 'org' },
      { to: '/hrbp/recruitment', label: 'Recruiting', icon: 'fa-solid fa-user-plus', module: 'recruitment' },
      { to: '/hrbp/talent', label: 'Talent review', icon: 'fa-solid fa-chess-board', module: 'talent' },
      { to: '/hrbp/performance', label: 'Performance', icon: 'fa-solid fa-chart-line', module: 'performance' },
      { to: '/hrbp/attendance', label: 'Attendance', icon: 'fa-solid fa-clock', module: 'attendance' },
      { to: '/hrbp/users', label: '用户管理', icon: 'fa-solid fa-user-shield', superAdminOnly: true },
    ];
    const hrbpMenu = computed(() => {
      return allHrbpMenuItems.filter((item) => {
        if (item.superAdminOnly) return auth.effectiveSubType === 'super_admin';
        if (item.module) return auth.canAccessModule(item.module);
        return true;
      });
    });

    const allMgrMenuItems = [
      { to: '/manager/dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high', module: 'dashboard' },
      { to: '/manager/roster', label: '花名册', icon: 'fa-solid fa-people-group', module: 'roster' },
      { to: '/manager/org', label: '组织管理', icon: 'fa-solid fa-sitemap', module: 'org' },
      { to: '/manager/recruitment', label: '招聘管理', icon: 'fa-solid fa-user-plus', module: 'recruitment' },
      { to: '/manager/talent', label: '人才盘点', icon: 'fa-solid fa-chess-board', module: 'talent' },
      { to: '/manager/performance', label: 'Performance', icon: 'fa-solid fa-clipboard-check', module: 'performance' },
      { to: '/manager/attendance', label: '考勤', icon: 'fa-solid fa-clock', module: 'attendance' },
    ];
    const mgrMenu = computed(() =>
      allMgrMenuItems.filter((item) => auth.canAccessModule(item.module)),
    );

    const canAccessHrbp = computed(() => auth.isHrbp || auth.isSuperAdmin || auth.isProductLineOwner);
    const canAccessMgr = computed(() => auth.isManager);
    const hasDualAccess = computed(() => canAccessHrbp.value && canAccessMgr.value);

    const menu = computed(() => {
      if (r.path.startsWith('/profile')) {
        return canAccessHrbp.value ? hrbpMenu.value : mgrMenu.value;
      }
      if (r.path.startsWith('/hrbp')) return hrbpMenu.value;
      return mgrMenu.value;
    });

    const pageTitle = computed(() => {
      const m = r.matched.find((x) => x.meta?.title);
      return m?.meta?.title || (auth.isHrbp ? 'HRBP workspace' : 'Manager workspace');
    });

    const isInHrbpZone = computed(() => r.path.startsWith('/hrbp'));
    const routerViewKey = computed(() => `${productLine.currentLineId ?? 0}-${r.fullPath}`);

    async function onProductLineChange(ev) {
      const id = Number(ev.target.value);
      if (Number.isNaN(id) || id === productLine.currentLineId) return;
      const ok = await productLine.switchToLine(id);
      if (ok) {
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Product line switched', type: 'success' } }));
      }
    }

    function openLineModal() {
      newLineName.value = '';
      lineModalOpen.value = true;
    }

    async function submitNewLine() {
      const ok = await productLine.createLine(newLineName.value);
      if (ok) {
        lineModalOpen.value = false;
        newLineName.value = '';
      }
    }

    async function confirmRemoveProductLine() {
      if (!auth.isHrbp || productLine.lines.length <= 1) return;
      const cur = productLine.currentLine;
      const name = cur?.name || String(productLine.currentLineId);
      if (!window.confirm(
        `确定移除产品线「${name}」？\n\n该产品线下的员工、组织、考勤、绩效等数据将被永久删除（含浏览器本地与服务端）。此操作不可撤销。`,
      )) return;
      await productLine.removeLine(productLine.currentLineId);
    }

    function logout() {
      auth.logout();
      auth.persistSession();
      router.push('/login');
    }

    return {
      menu, pageTitle, logout, navCollapsed, toast, auth,
      productLine, routerViewKey, onProductLineChange,
      lineModalOpen, newLineName, openLineModal, submitNewLine,
      roleLabel, confirmRemoveProductLine,
      hasDualAccess, isInHrbpZone,
    };
  },
};
})();
