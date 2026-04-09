/**
 * 应用入口：全局构建 + 普通脚本（支持 file:// 双击打开）
 */
(async function () {
  const { createApp } = Vue;
  const { createPinia } = Pinia;
  const TM = window.TM;

  if (TM.serverSync && typeof TM.serverSync.initFromQuery === 'function') {
    TM.serverSync.initFromQuery();
  }
  if (TM.serverSync && typeof TM.serverSync.validateAndRecoverApiBase === 'function') {
    await TM.serverSync.validateAndRecoverApiBase();
  }

  const pinia = createPinia();
  const app = createApp({ template: '<router-view />' });
  app.use(pinia);

  const productLineStore = TM.useProductLineStore();
  const dataStore = TM.useDataStore();
  const authStore = TM.useAuthStore();
  const hrScopeStore = TM.useHrScopeStore();
  const ss = TM.serverSync;
  const useServer = ss && ss.isEnabled && ss.isEnabled();

  productLineStore.hydrate();
  authStore.restoreSession();
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
    if (lineId != null && !TM.lineHasEmployeeStorage(lineId)) {
      TM.seedAllData(lineId);
      window.__TM_FIRST_SEED__ = true;
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
