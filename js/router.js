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
        { path: '', redirect: '/hrbp/dashboard' },
        { path: 'dashboard', name: 'hrbp-dashboard', component: TM.HrbpDashboard, meta: { title: 'Dashboard' } },
        { path: 'roster', name: 'hrbp-roster', component: TM.HrbpRoster, meta: { title: 'Employee roster' } },
        { path: 'org', name: 'hrbp-org', component: TM.HrbpOrg, meta: { title: 'Organization' } },
        { path: 'attendance', name: 'hrbp-attendance', component: TM.HrbpAttendance, meta: { title: 'Attendance' } },
        { path: 'performance', name: 'hrbp-performance', component: TM.HrbpPerformance, meta: { title: 'Performance' } },
        { path: 'talent', name: 'hrbp-talent', component: TM.HrbpTalent, meta: { title: 'Talent review' } },
        { path: 'recruitment', name: 'hrbp-recruitment', component: TM.HrbpRecruitment, meta: { title: 'Recruiting' } },
        { path: 'analytics', name: 'hrbp-analytics', redirect: '/hrbp/dashboard' },
      ],
    },
    {
      path: '/manager',
      component: TM.LayoutView,
      meta: { zone: 'manager' },
      children: [
        { path: '', redirect: '/manager/dashboard' },
        { path: 'dashboard', name: 'mgr-dashboard', component: TM.MgrDashboard, meta: { title: 'Dashboard' } },
        { path: 'team', name: 'mgr-team', component: TM.MgrTeam, meta: { title: 'My team' } },
        { path: 'performance', name: 'mgr-performance', component: TM.MgrPerformance, meta: { title: 'Performance reviews' } },
        { path: 'leaves', name: 'mgr-leaves', component: TM.MgrLeaves, meta: { title: 'Leave approvals' } },
        { path: 'training', name: 'mgr-training', component: TM.MgrTraining, meta: { title: 'Training' } },
        { path: 'analytics', name: 'mgr-analytics', component: TM.MgrAnalytics, meta: { title: 'Team analytics' } },
        { path: 'org-approvals', name: 'mgr-org-approvals', component: TM.MgrOrgApprovals, meta: { title: 'Org approvals' } },
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
        next(auth.isHrbp ? '/hrbp/dashboard' : '/manager/dashboard');
      } else next();
      return;
    }
    if (!auth.isLoggedIn) {
      next({ path: '/login', query: { redirect: to.fullPath } });
      return;
    }
    const canHrbp = auth.isHrbp || auth.isSuperAdmin;
    if (to.path.startsWith('/hrbp') && !canHrbp) {
      next('/manager/dashboard');
      return;
    }
    if (to.path.startsWith('/manager') && !auth.isManager) {
      next('/hrbp/dashboard');
      return;
    }
    next();
  });

  TM.router = router;
})();
