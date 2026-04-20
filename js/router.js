/**
 * Hash 路由（非模块，组件来自 window.TM）
 */
(function () {
  const { createRouter, createWebHashHistory } = VueRouter;
  const TM = window.TM;

  const routes = [
    { path: '/login', name: 'login', component: TM.LoginView, meta: { public: true } },
    {
      path: '/hrbp',
      component: TM.LayoutView,
      meta: { zone: 'hrbp' },
      children: [
        { path: '', redirect: '/hrbp/ai-analyst' },
        { path: 'dashboard', name: 'hrbp-dashboard', component: TM.HrbpDashboard, meta: { title: 'Dashboard' } },
        { path: 'roster', name: 'hrbp-roster', component: TM.HrbpRoster, meta: { title: 'Employee roster' } },
        { path: 'org', name: 'hrbp-org', component: TM.HrbpOrg, meta: { title: 'Organization' } },
        { path: 'attendance', name: 'hrbp-attendance', component: TM.HrbpAttendance, meta: { title: 'Attendance' } },
        { path: 'ai-analyst', name: 'hrbp-ai-analyst', component: TM.HrbpAiAnalyst, meta: { title: 'AI 数据分析' } },
        { path: 'performance', name: 'hrbp-performance', component: TM.HrbpPerformance, meta: { title: 'Performance' } },
        { path: 'talent', name: 'hrbp-talent', component: TM.HrbpTalent, meta: { title: 'Talent review' } },
        { path: 'recruitment', name: 'hrbp-recruitment', component: TM.HrbpRecruitment, meta: { title: 'Recruiting' } },
        { path: 'users', redirect: '/admin/users' },
        { path: 'analytics', name: 'hrbp-analytics', redirect: '/hrbp/dashboard' },
      ],
    },
    {
      path: '/manager',
      component: TM.LayoutView,
      meta: { zone: 'manager' },
      children: [
        { path: '', redirect: '/manager/ai-analyst' },
        { path: 'dashboard', name: 'mgr-dashboard', component: TM.HrbpDashboard, meta: { title: 'Dashboard' } },
        { path: 'roster', name: 'mgr-roster', component: TM.HrbpRoster, meta: { title: '花名册' } },
        { path: 'org', name: 'mgr-org', component: TM.HrbpOrg, meta: { title: '组织管理' } },
        { path: 'recruitment', name: 'mgr-recruitment', component: TM.HrbpRecruitment, meta: { title: '招聘管理' } },
        { path: 'talent', name: 'mgr-talent', component: TM.HrbpTalent, meta: { title: '人才盘点' } },
        { path: 'performance', name: 'mgr-performance', component: TM.MgrPerformance, meta: { title: 'Performance' } },
        { path: 'attendance', name: 'mgr-attendance', component: TM.HrbpAttendance, meta: { title: '考勤' } },
        { path: 'ai-analyst', name: 'mgr-ai-analyst', component: TM.HrbpAiAnalyst, meta: { title: 'AI 数据分析' } },
      ],
    },
    {
      path: '/admin',
      component: TM.LayoutView,
      meta: { zone: 'admin' },
      children: [
        { path: '', redirect: '/admin/users' },
        { path: 'users', name: 'admin-users', component: TM.AdminUserManagement, meta: { title: '用户管理', requireSuperAdmin: true } },
        { path: 'product-lines', name: 'admin-product-lines', component: TM.AdminProductLines, meta: { title: '产品线管理', requireSuperAdmin: true } },
      ],
    },
    {
      path: '/profile',
      component: TM.LayoutView,
      children: [{ path: '', name: 'profile', component: TM.ProfileView, meta: { title: 'Profile' } }],
    },
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ];

  const router = createRouter({
    history: createWebHashHistory(),
    routes,
  });

  router.beforeEach((to, from, next) => {
    const auth = TM.useAuthStore();
    if (to.meta.public) {
      if (auth.isLoggedIn && to.name === 'login') {
        if (auth.isHrbp) {
          const HRBP_MODS = window.TM.HRBP_MODULES || [];
          const firstMod = HRBP_MODS.find((m) => auth.canAccessModule(m)) || 'ai_analyst';
          next('/hrbp/' + firstMod.replace(/_/g, '-'));
        } else {
          next('/manager/ai-analyst');
        }
      } else next();
      return;
    }
    if (!auth.isLoggedIn) {
      next({ path: '/login', query: { redirect: to.fullPath } });
      return;
    }
    const canHrbp = auth.isHrbp || auth.isSuperAdmin || auth.isProductLineHead;
    if (to.path.startsWith('/hrbp') && !canHrbp) {
      next('/manager/ai-analyst');
      return;
    }
    if (to.path.startsWith('/manager') && !auth.isManager) {
      next('/hrbp/ai-analyst');
      return;
    }
    if (to.path.startsWith('/admin') && !auth.canManageUsers) {
      next(auth.isHrbp ? '/hrbp/ai-analyst' : '/manager/ai-analyst');
      return;
    }
    if (to.meta.requireSuperAdmin && !auth.canManageUsers) {
      next(auth.isHrbp ? '/hrbp/recruitment' : '/manager/dashboard');
      return;
    }
    if (to.path.startsWith('/hrbp/') && auth.isHrbp) {
      const seg = (to.path.split('/')[2] || '').replace(/-/g, '_');
      if (seg && seg !== 'users') {
        if (!auth.canAccessModule(seg)) {
          const HRBP_MODS = window.TM.HRBP_MODULES || [];
          const fallback = HRBP_MODS.find((m) => auth.canAccessModule(m));
          next(fallback ? '/hrbp/' + fallback : '/hrbp/recruitment');
          return;
        }
      }
    }
    if (to.path.startsWith('/manager/') && auth.isManager) {
      const seg = (to.path.split('/')[2] || '').replace(/-/g, '_');
      if (seg && !auth.canAccessModule(seg)) {
        const MGR_MODS = window.TM.MGR_MODULES || [];
        const fallback = MGR_MODS.find((m) => auth.canAccessModule(m)) || 'dashboard';
        next('/manager/' + fallback);
        return;
      }
    }
    next();
  });

  TM.router = router;
})();
