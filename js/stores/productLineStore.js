/**
 * 产品线：多租户隔离；业务数据按当前产品线前缀持久化
 */
(function () {
  const { defineStore } = Pinia;
  const TM = window.TM;
  const REGISTRY_KEY = TM.PRODUCT_LINE_REGISTRY_KEY || 'tm_product_lines';

  function emptyLineSnapshot() {
    return {
      employees: [],
      departments: [],
      positions: [],
      leaveRequests: [],
      performanceReviews: [],
      trainings: [],
      employeeTrainings: [],
      users: [
        {
          id: 1,
          username: 'hrbp',
          email: 'hrbp@company.com',
          password: '123',
          role: 'hrbp',
          superAdmin: true,
          hrbpSubType: 'super_admin',
          realName: 'HRBP Super Admin',
          employeeId: null,
        },
        {
          id: 2,
          username: 'manager',
          email: 'manager@company.com',
          password: '123',
          role: 'manager',
          realName: 'Reporting Manager',
          employeeId: null,
        },
        {
          id: 3,
          username: 'superadmin',
          email: 'superadmin@company.com',
          password: '123',
          role: 'hrbp',
          superAdmin: true,
          realName: 'Super Admin',
          employeeId: null,
        },
      ],
      attendanceRules: {
        workStart: '09:30',
        workEnd: '18:30',
        leaveTypes: ['annual', 'sick', 'personal', 'overtime'],
        labels: { annual: 'Annual', sick: 'Sick', personal: 'Personal', overtime: 'Comp time' },
        monthlyStandardDays: 20,
        loadBandLow: 0.88,
        loadBandHigh: 1.12,
      },
      attendanceRecords: [],
      punchRecords: [],
      kpiLibrary: [],
      performanceCycles: [],
      talentMatrix: [],
      successionPlans: [],
      notifications: [],
      positionRecruitTags: {},
      recruitmentCandidates: [],
      recruitmentPositionMetrics: {},
      orgSettings: { productLineOwnerEmployeeId: null },
      orgChangeRequests: [],
      rosterColumnSettings: null,
    };
  }

  window.TM.useProductLineStore = defineStore('productLine', {
    state: () => ({
      lines: [],
      currentLineId: null,
    }),
    getters: {
      currentLine: (s) => s.lines.find((l) => l.id === s.currentLineId) || null,
    },
    actions: {
      hydrate() {
        TM.migrateLegacyStorageToProductLines();
        const reg = TM.loadKey(REGISTRY_KEY, null);
        if (reg && Array.isArray(reg.lines) && reg.lines.length) {
          this.lines = reg.lines;
          let cur = reg.currentLineId ?? reg.lines[0].id;
          if (!this.lines.some((l) => l.id === cur)) cur = this.lines[0].id;
          this.currentLineId = cur;
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        this.lines = [{ id: 1, name: 'Default product line', createdAt: today }];
        this.currentLineId = 1;
        this.persistRegistry();
      },
      persistRegistry() {
        TM.saveKey(REGISTRY_KEY, { lines: this.lines, currentLineId: this.currentLineId });
      },
      async createLine(name) {
        const auth = TM.useAuthStore();
        if (!auth.isHrbp) return false;
        const data = TM.useDataStore();
        const ss = TM.serverSync;
        const nm = String(name || '').trim() || 'New product line';
        const today = new Date().toISOString().slice(0, 10);
        if (ss && typeof ss.cancelPendingPush === 'function') ss.cancelPendingPush();
        data.persistAll({ skipRemote: true });
        let id;
        if (ss && ss.isEnabled && ss.isEnabled()) {
          try {
            const line = await ss.createProductLineOnServer(nm);
            id = Number(line.id);
            this.lines.push({
              id,
              name: line.name || nm,
              createdAt: line.createdAt || today,
            });
            this.currentLineId = id;
            this.persistRegistry();
            if (typeof TM.seedAllData === 'function') {
              TM.seedAllData(id);
              data.hydrate();
              if (ss && typeof ss.cancelPendingPush === 'function') ss.cancelPendingPush();
            } else {
              data.importSnapshot(emptyLineSnapshot());
            }
            data.persistAll({ skipRemote: true });
          } catch (e) {
            window.dispatchEvent(new CustomEvent('tm-toast', {
              detail: { message: e.body?.error || e.message || '创建产品线失败', type: 'error' },
            }));
            return false;
          }
        } else {
          const maxId = this.lines.reduce((m, l) => Math.max(m, l.id), 0);
          id = maxId + 1;
          const displayName = nm || `Product line ${id}`;
          this.lines.push({ id, name: displayName, createdAt: today });
          this.currentLineId = id;
          this.persistRegistry();
          if (typeof TM.seedAllData === 'function') {
            TM.seedAllData(id);
            data.hydrate();
          } else {
            data.importSnapshot(emptyLineSnapshot());
            data.persistAll();
          }
        }
        TM.useHrScopeStore().setScopeRootDepartmentId(null);
        this.syncAuthForCurrentLine();
        if (ss && ss.isEnabled && ss.isEnabled()) ss.connectWs(id);
        window.dispatchEvent(new CustomEvent('tm-product-line-changed', { detail: { lineId: id } }));
        window.dispatchEvent(new CustomEvent('tm-toast', {
          detail: { message: 'Product line created with full demo data (including roster).', type: 'success' },
        }));
        return true;
      },
      async switchToLine(lineId) {
        const id = Number(lineId);
        if (Number.isNaN(id) || !this.lines.some((l) => l.id === id)) return false;
        if (id === this.currentLineId) return true;
        const data = TM.useDataStore();
        const ss = TM.serverSync;
        // 取消所有挂起的推送：切换前先落盘但不推送；推送时序混乱会导致"同步失败"弹窗
        if (ss && typeof ss.cancelPendingPush === 'function') ss.cancelPendingPush();
        data.persistAll({ skipRemote: true });
        this.currentLineId = id;
        this.persistRegistry();
        const hr = TM.useHrScopeStore();
        hr.hydrate();
        if (ss && ss.isEnabled && ss.isEnabled()) {
          try {
            await ss.pullWorkspaceQuiet(id);
          } catch (e) {
            const status = e?.status || 0;
            if (status === 401 || status === 403) {
              window.dispatchEvent(new CustomEvent('tm-toast', {
                detail: { message: e.body?.error || e.message || '加载产品线数据失败', type: 'error' },
              }));
              return false;
            }
            // 非鉴权错误（网络超时、冷启动等）：回退本地缓存，取消 hydrate 内部触发的推送
            data.hydrate();
            if (ss && typeof ss.cancelPendingPush === 'function') ss.cancelPendingPush();
          }
          ss.connectWs(id);
        } else {
          data.hydrate();
          if (ss && typeof ss.cancelPendingPush === 'function') ss.cancelPendingPush();
        }
        const root = hr.scopeRootDepartmentId;
        if (root != null && !data.departments.some((d) => d.id === root)) {
          hr.setScopeRootDepartmentId(null);
        }
        this.syncAuthForCurrentLine();
        window.dispatchEvent(new CustomEvent('tm-product-line-changed', { detail: { lineId: id } }));
        return true;
      },
      /**
       * HRBP：删除指定产品线及其本地/服务端数据；至少保留一条产品线。
       * @param {number} [lineId] 默认当前选中的产品线
       */
      async removeLine(lineId) {
        const auth = TM.useAuthStore();
        if (!auth.isHrbp) return false;
        if (this.lines.length <= 1) {
          window.dispatchEvent(new CustomEvent('tm-toast', {
            detail: { message: '至少需要保留一条产品线。', type: 'error' },
          }));
          return false;
        }
        const id = lineId != null ? Number(lineId) : Number(this.currentLineId);
        if (Number.isNaN(id) || !this.lines.some((l) => l.id === id)) return false;
        const data = TM.useDataStore();
        const ss = TM.serverSync;
        if (ss && typeof ss.cancelPendingPush === 'function') ss.cancelPendingPush();
        data.persistAll({ skipRemote: true });
        const removedName = this.lines.find((l) => l.id === id)?.name || String(id);
        if (ss && ss.isEnabled && ss.isEnabled()) {
          try {
            await ss.deleteProductLineOnServer(id);
          } catch (e) {
            window.dispatchEvent(new CustomEvent('tm-toast', {
              detail: { message: e.body?.error || e.message || '删除产品线失败', type: 'error' },
            }));
            return false;
          }
        }
        this.lines = this.lines.filter((l) => l.id !== id);
        if (this.currentLineId === id) {
          this.currentLineId = this.lines[0].id;
        }
        this.persistRegistry();
        TM.clearLineStorage(id);
        const hr = TM.useHrScopeStore();
        hr.hydrate();
        if (ss && ss.isEnabled && ss.isEnabled()) {
          try {
            await ss.pullWorkspaceQuiet(this.currentLineId);
          } catch {
            data.hydrate();
            if (ss && typeof ss.cancelPendingPush === 'function') ss.cancelPendingPush();
          }
          ss.connectWs(this.currentLineId);
        } else {
          data.hydrate();
          if (ss && typeof ss.cancelPendingPush === 'function') ss.cancelPendingPush();
        }
        const root = hr.scopeRootDepartmentId;
        if (root != null && !data.departments.some((d) => d.id === root)) {
          hr.setScopeRootDepartmentId(null);
        }
        this.syncAuthForCurrentLine();
        window.dispatchEvent(new CustomEvent('tm-product-line-changed', { detail: { lineId: this.currentLineId } }));
        window.dispatchEvent(new CustomEvent('tm-toast', {
          detail: { message: `已移除产品线：${removedName}`, type: 'success' },
        }));
        return true;
      },
      syncAuthForCurrentLine() {
        const auth = TM.useAuthStore();
        const data = TM.useDataStore();
        if (!auth.isLoggedIn) return;
        const cu = auth.currentUser;
        const u = data.users.find((x) => x.id === cu.id
          || x.username === cu.username
          || (cu.email && String(x.email || '').toLowerCase() === String(cu.email).toLowerCase()));
        if (!u) {
          auth.logout();
          auth.persistSession();
          if (TM.router) TM.router.push('/login');
          window.dispatchEvent(new CustomEvent('tm-toast', {
            detail: { message: 'This account is not in the current product line. Please sign in again.', type: 'error' },
          }));
          return;
        }
        auth.currentUser = { ...u };
        auth.persistSession();
        auth.enrichCurrentUserFromEmployee();
      },
    },
  });
})();
