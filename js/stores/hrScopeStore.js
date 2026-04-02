(function () {
  const { defineStore } = Pinia;
  const loadKey = window.TM.loadKey;
  const saveKey = window.TM.saveKey;
  const LEGACY_KEY = 'hrScopeRootDepartmentId';

  function scopeRead() {
    const pl = window.TM.useProductLineStore?.();
    const lid = pl?.currentLineId;
    if (lid == null) return loadKey(LEGACY_KEY, null);
    return window.TM.loadKeyForLine(lid, LEGACY_KEY, null);
  }

  function scopeWrite(val) {
    const pl = window.TM.useProductLineStore?.();
    const lid = pl?.currentLineId;
    if (lid == null) {
      saveKey(LEGACY_KEY, val);
      return;
    }
    window.TM.saveKeyForLine(lid, LEGACY_KEY, val);
  }

  window.TM.useHrScopeStore = defineStore('hrScope', {
    state: () => ({
      scopeRootDepartmentId: null,
    }),
    actions: {
      hydrate() {
        const raw = scopeRead();
        if (raw === null || raw === undefined || raw === '') {
          this.scopeRootDepartmentId = null;
          return;
        }
        const n = Number(raw);
        this.scopeRootDepartmentId = Number.isNaN(n) ? null : n;
      },
      setScopeRootDepartmentId(id) {
        if (id === null || id === undefined || id === '' || Number(id) === 0) {
          this.scopeRootDepartmentId = null;
          scopeWrite(null);
        } else {
          const n = Number(id);
          this.scopeRootDepartmentId = Number.isNaN(n) ? null : n;
          scopeWrite(this.scopeRootDepartmentId);
        }
        const ss = window.TM.serverSync;
        const auth = window.TM.useAuthStore?.();
        if (ss && ss.isEnabled && ss.isEnabled() && auth && auth.isHrbp
          && typeof ss.schedulePullAfterScopeChange === 'function') {
          ss.schedulePullAfterScopeChange();
        }
      },
    },
  });
})();
