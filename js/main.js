/**
 * 应用入口：全局构建 + 普通脚本（支持 file:// 双击打开）
 */
(async function () {
  const { createApp } = Vue;
  const { createPinia } = Pinia;
  const TM = window.TM;

  // Initialize IndexedDB storage (A-2: replace localStorage)
  if (TM._idb && typeof TM._idb.init === 'function') {
    try {
      await TM._idb.init();
      TM._idb.activate();
    } catch (e) {
      console.warn('[IDB] Init failed, using localStorage fallback:', e);
    }
  }

  if (TM.serverSync && typeof TM.serverSync.initFromQuery === 'function') {
    TM.serverSync.initFromQuery();
  }
  if (TM.serverSync && typeof TM.serverSync.validateAndRecoverApiBase === 'function') {
    await TM.serverSync.validateAndRecoverApiBase();
  }

  // Initialize observability / Sentry (T-2)
  if (TM.observability) {
    TM.observability.installGlobalHandlers();
    TM.observability.init().catch(() => {});
  }

  const pinia = createPinia();
  const app = createApp({ template: '<router-view />' });

  // Vue error handler with Sentry integration
  if (TM.observability) {
    TM.observability.installVueErrorHandler(app);
  }
  app.config.errorHandler = app.config.errorHandler || function (err, vm, info) {
    console.error('[Vue Error]', err, info);
  };
  // Toast notification for user-visible errors
  const _origHandler = app.config.errorHandler;
  app.config.errorHandler = function (err, vm, info) {
    if (typeof _origHandler === 'function') _origHandler(err, vm, info);
    window.dispatchEvent(new CustomEvent('tm-toast', {
      detail: { message: '系统发生错误，请刷新页面重试。如问题持续请联系管理员。', type: 'error' },
    }));
  };

  app.use(pinia);

  const productLineStore = TM.useProductLineStore();
  const dataStore = TM.useDataStore();
  const authStore = TM.useAuthStore();
  const hrScopeStore = TM.useHrScopeStore();
  const ss = TM.serverSync;
  const useServer = ss && ss.isEnabled && ss.isEnabled();

  productLineStore.hydrate();
  authStore.restoreSession();
  // Set Sentry user context
  if (TM.observability && authStore.isLoggedIn && authStore.currentUser) {
    TM.observability.setUser(authStore.currentUser);
  }
  // Restore chart preferences for the already-logged-in user
  if (TM.chartPrefs && authStore.isLoggedIn) {
    TM.chartPrefs.reload(authStore.currentUser?.email || authStore.currentUser?.username || '');
  }

  let dataLoadedFromServer = false;
  if (useServer && ss.getToken()) {
    await ss.verifySession(authStore);
    if (authStore.isLoggedIn) {
      try {
        await ss.hydrateProductLinesFromServer(productLineStore);
        hrScopeStore.hydrate();
        await ss.pullWorkspaceQuiet();
        ss.connectWs(productLineStore.currentLineId);
        dataLoadedFromServer = true;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[serverSync] pull failed, falling back to local cache:', e);
      }
    }
  }

  const lineId = productLineStore.currentLineId;
  if (!dataLoadedFromServer) {
    try {
      if (lineId != null && !TM.lineHasEmployeeStorage(lineId)) {
        TM.seedAllData(lineId);
        window.__TM_FIRST_SEED__ = true;
      } else if (lineId != null) {
        const sv = TM.loadKeyForLine(lineId, '_seedVersion', 0);
        if (sv < 13) {
          if (typeof TM.seedPipelineDemo === 'function') TM.seedPipelineDemo(lineId);
        }
        if (sv < 16) {
          if (typeof TM.seedAttendanceDemo === 'function') TM.seedAttendanceDemo(lineId);
        }
        if (sv < 17) {
          if (typeof TM.seedPerformanceDemo === 'function') TM.seedPerformanceDemo(lineId);
          TM.saveKeyForLine(lineId, '_seedVersion', 17);
        }
      }
    } catch (seedErr) {
      console.error('[TM] 数据初始化/迁移失败，使用已有缓存数据:', seedErr);
    }
    dataStore.hydrate();
  }

  hrScopeStore.hydrate();
  if (hrScopeStore.scopeRootDepartmentId != null
    && !dataStore.departments.some((d) => d.id === hrScopeStore.scopeRootDepartmentId)) {
    hrScopeStore.setScopeRootDepartmentId(null);
  }
  app.use(TM.router);
  productLineStore.syncAuthForCurrentLine();
  authStore.enrichCurrentUserFromEmployee();
  app.mount('#app');

  if (window.__TM_FIRST_SEED__) {
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('tm-toast', {
        detail: { message: 'Demo data has been generated and saved locally. Explore any module.', type: 'success' },
      }));
    });
  }
})();
