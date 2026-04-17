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
  if (!productLineStore.lines.some((l) => l.id === 3)) {
    productLineStore.lines.push({ id: 3, name: '多层级测试线', createdAt: new Date().toISOString().slice(0, 10) });
    productLineStore.persistRegistry();
  }

  function _clearLineScopedData(lid) {
    if (typeof TM.clearLineStorage === 'function') {
      TM.clearLineStorage(lid);
    }
    var prefix = 'tm_L' + lid + '_';
    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) toRemove.push(k);
    }
    toRemove.forEach(function (k) { localStorage.removeItem(k); });
  }
  function _clearGlobalUsers() {
    try { localStorage.removeItem('tm_global_users'); } catch (_) {}
    if (TM._idb && TM._idb.saveKey && !TM._idb.isFallback()) {
      TM._idb.saveKey('tm_global_users', null);
    }
  }
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
  const _setLoading = (v) => window.dispatchEvent(new CustomEvent('tm-loading', { detail: { loading: v } }));
  if (useServer && ss.getToken()) {
    _setLoading(true);
    await ss.verifySession(authStore);
    if (authStore.isLoggedIn) {
      try {
        await ss.hydrateProductLinesFromServer(productLineStore);
        hrScopeStore.hydrate();
        await ss.pullWorkspaceQuiet();
        ss.connectWs(productLineStore.currentLineId);
        dataLoadedFromServer = true;
      } catch (e) {
        console.warn('[serverSync] pull failed, falling back to local cache:', e);
      }
    }
    _setLoading(false);
  }

  const lineId = productLineStore.currentLineId;
  if (!dataLoadedFromServer) {
    try {
      if (lineId === 3 && typeof TM.seedMultiLevelOrg === 'function'
          && TM.loadKeyForLine(3, '_multiLevelSeeded', 0) < 6) {
        _clearLineScopedData(3);
        _clearGlobalUsers();
        TM.seedMultiLevelOrg(3);
        TM.saveKeyForLine(3, '_multiLevelSeeded', 6);
        window.__TM_FIRST_SEED__ = true;
      } else if (lineId != null && !TM.lineHasEmployeeStorage(lineId)) {
        _clearGlobalUsers();
        TM.seedAllData(lineId);
        window.__TM_FIRST_SEED__ = true;
      } else if (lineId != null) {
        const sv = TM.loadKeyForLine(lineId, '_seedVersion', 0);
        if (sv < 21) {
          _clearLineScopedData(lineId);
          _clearGlobalUsers();
          if (lineId === 3 && typeof TM.seedMultiLevelOrg === 'function') {
            TM.seedMultiLevelOrg(3);
            TM.saveKeyForLine(3, '_multiLevelSeeded', 6);
          } else {
            TM.seedAllData(lineId);
          }
          TM.saveKeyForLine(lineId, '_seedVersion', 21);
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
        detail: { message: '演示数据已生成并保存到本地，可以开始使用各模块。', type: 'success' },
      }));
    });
  }

  // Multi-tab awareness: detect when another tab writes to localStorage
  let _storageToastShown = false;
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith('tm_')) return;
    if (_storageToastShown) return;
    _storageToastShown = true;
    window.dispatchEvent(new CustomEvent('tm-toast', {
      detail: { message: '其他标签页已更新数据，建议刷新页面以获取最新内容', type: 'warning' },
    }));
    setTimeout(() => { _storageToastShown = false; }, 30000);
  });
})();
