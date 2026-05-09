/**
 * 服务端同步：多用户共享产品线工作区、乐观并发版本号、WebSocket 推送刷新
 * 启用方式（任选）：
 * 1) 打开页面时在地址栏加参数：?api=http://localhost:3000
 * 2) 在控制台执行：localStorage.setItem('tm_api_base','http://localhost:3000'); location.reload()
 * 3) index.html 中 <meta name="tm-api-base" content="__SAME_ORIGIN__" />（与页面同域 /api，需网关反代，见 vercel.json + api/[...slug].js）
 */
(function (w) {
  w.TM = w.TM || {};

  const TOKEN_KEY = 'tm_api_token';
  const API_BASE_KEY = 'tm_api_base';
  const PUSH_DEBOUNCE_MS = 550;
  const REFRESH_DEBOUNCE_MS = 400;

  let apiBase = '';
  /** @type {'none'|'url'|'meta'|'storage'} */
  let apiBaseSource = 'none';
  /** 可选：与 tm-api-base 同源反代时，WebSocket 需直连后端，例如 <meta name="tm-ws-base" content="wss://api.example.com" /> */
  let wsOriginOverride = '';
  let pushTimer = null;
  let refreshTimer = null;
  let scopePullTimer = null;
  let ws = null;
  let wsLineSubscribed = null;
  /** @type {Map<number, number>} */
  const versionByLineId = new Map();
  /** @type {Map<number, object>} 与服务器版本对齐的完整 data 快照（用于增量 diff） */
  const lastSyncedDataByLineId = new Map();

  function deepClone(o) {
    try {
      return JSON.parse(JSON.stringify(o));
    } catch {
      return null;
    }
  }

  function applyWsMeta() {
    wsOriginOverride = '';
    try {
      const wm = w.document.querySelector('meta[name="tm-ws-base"]');
      const wc = wm?.getAttribute('content');
      if (wc && String(wc).trim()) {
        const raw = String(wc).trim().replace(/\/$/, '');
        const u = new URL(raw);
        if (
          u.protocol === 'https:' || u.protocol === 'http:'
          || u.protocol === 'wss:' || u.protocol === 'ws:'
        ) {
          wsOriginOverride = `${u.protocol}//${u.host}`;
        }
      }
    } catch {
      wsOriginOverride = '';
    }
  }

  const serverSync = {
    isApplyingRemote: false,

    initFromQuery() {
      apiBase = '';
      apiBaseSource = 'none';
      wsOriginOverride = '';
      try {
        const hash = w.location.hash || '';
        const q = hash.includes('?') ? hash.slice(hash.indexOf('?')) : w.location.search;
        const params = new URLSearchParams(q);
        const api = params.get('api');
        if (api && String(api).trim()) {
          let u = String(api).trim().replace(/\/$/, '');
          if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
          const envMeta = w.document.querySelector('meta[name="tm-env"]');
          const env = envMeta?.getAttribute('content') || 'production';
          if (env !== 'development') {
            console.warn('[serverSync] ?api= 参数仅允许在 development 环境下使用，已忽略');
          } else {
            try {
              const parsed = new URL(u);
              const allowed = ['localhost', '127.0.0.1', '0.0.0.0'];
              if (!allowed.includes(parsed.hostname) && parsed.hostname !== w.location.hostname) {
                console.warn('[serverSync] ?api= 仅允许 localhost 或同域地址，已拒绝:', parsed.hostname);
              } else {
                w.localStorage.setItem(API_BASE_KEY, u);
                apiBase = u;
                apiBaseSource = 'url';
                applyWsMeta();
                return;
              }
            } catch {
              console.warn('[serverSync] ?api= 地址格式无效');
            }
          }
        }
      } catch {
        /* ignore */
      }
      try {
        const m = w.document.querySelector('meta[name="tm-api-base"]');
        const c = m?.getAttribute('content');
        if (c != null) {
          const t = String(c).trim();
          if (t && t !== '__OFF__') {
            if (t === '__SAME_ORIGIN__') {
              if (w.location.protocol === 'http:' || w.location.protocol === 'https:') {
                apiBase = w.location.origin.replace(/\/$/, '');
                apiBaseSource = 'meta';
                applyWsMeta();
                return;
              }
              apiBase = '';
              apiBaseSource = 'none';
              applyWsMeta();
              return;
            }
            if (/^https?:\/\//i.test(t)) {
              apiBase = t.replace(/\/$/, '');
              apiBaseSource = 'meta';
              applyWsMeta();
              return;
            }
          }
        }
      } catch {
        /* ignore */
      }
      apiBase = String(w.localStorage.getItem(API_BASE_KEY) || '').trim().replace(/\/$/, '');
      apiBaseSource = apiBase ? 'storage' : 'none';
      applyWsMeta();
    },

    /** 若 localStorage 误填为「与当前页同源」且本站无真实 API，则清除并退回纯本地登录，避免 Vercel 等平台返回 404 HTML */
    async validateAndRecoverApiBase() {
      if (!apiBase || apiBaseSource !== 'storage') return true;
      const origin = w.location.origin.replace(/\/$/, '');
      const baseNorm = apiBase.replace(/\/$/, '');
      if (baseNorm !== origin) return true;
      try {
        const r = await fetch(`${apiBase}/api/health`, { method: 'GET' });
        if (!r.ok) throw new Error('bad status');
        const j = await r.json().catch(() => ({}));
        if (j.service !== 'talent-hub-server') throw new Error('bad body');
        return true;
      } catch {
        try {
          w.localStorage.removeItem(API_BASE_KEY);
        } catch {
          /* ignore */
        }
        apiBase = '';
        apiBaseSource = 'none';
        try {
          w.dispatchEvent(new CustomEvent('tm-toast', {
            detail: {
              message:
                '已关闭服务端同步：接口根地址曾与本站相同但无法访问 /api/health。请勿将前端站点域名存为 tm_api_base；未配置反代时请删除该项并用本地账号登录。',
              type: 'warning',
            },
          }));
        } catch {
          /* ignore */
        }
        return false;
      }
    },

    isEnabled() {
      return !!apiBase;
    },

    getApiBase() {
      return apiBase;
    },

    getApiBaseSource() {
      return apiBaseSource;
    },

    getToken() {
      try {
        return w.sessionStorage.getItem(TOKEN_KEY) || '';
      } catch {
        return '';
      }
    },

    setToken(t) {
      try {
        if (t) w.sessionStorage.setItem(TOKEN_KEY, t);
        else w.sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
    },

    async fetchJson(path, options) {
      const url = `${apiBase}/api${path}`;
      const headers = { ...(options?.headers || {}) };
      const tok = serverSync.getToken();
      if (tok) headers.Authorization = `Bearer ${tok}`;
      if (options?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
      const res = await fetch(url, { ...options, headers });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      if (!res.ok) {
        const raw = data && typeof data.raw === 'string' ? data.raw : '';
        let msg = data?.error || res.statusText || '请求失败';
        if (res.status === 404 || /NOT_FOUND/i.test(raw)) {
          msg =
            '接口返回 404。若已启用服务端同步，请确认「接口根地址」指向真实 Node 后端（含 /api），不要将纯静态站点域名当作 API；部署到 Vercel 时请配置 TM_API_ORIGIN 反代或填写独立后端 URL。';
        }
        const err = new Error(msg);
        err.status = res.status;
        err.body = data;
        throw err;
      }
      return data;
    },

    wsUrl() {
      const base = wsOriginOverride || apiBase;
      const u = new URL(base);
      if (u.protocol === 'https:') u.protocol = 'wss:';
      else if (u.protocol === 'http:') u.protocol = 'ws:';
      u.pathname = '/ws';
      u.search = '';
      u.hash = '';
      return u.toString();
    },

    connectWs(lineId) {
      if (!serverSync.isEnabled() || !serverSync.getToken()) {
        serverSync.disconnectWs();
        return;
      }
      const lid = Number(lineId);
      if (ws && wsLineSubscribed === lid && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'subscribe', lineId: lid }));
        return;
      }
      serverSync.disconnectWs();
      const url = serverSync.wsUrl();
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      wsLineSubscribed = lid;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token: serverSync.getToken() }));
        ws.send(JSON.stringify({ type: 'subscribe', lineId: lid }));
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'workspace_updated' && Number(msg.lineId) === lid) {
          if (msg.version != null) versionByLineId.set(lid, Number(msg.version));
          serverSync.scheduleRefreshFromServer();
        }
      };
      ws.onclose = () => {
        if (wsLineSubscribed === lid) ws = null;
      };
    },

    disconnectWs() {
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      ws = null;
      wsLineSubscribed = null;
    },

    /** 切换产品线前调用，取消尚未发出的推送，避免把新线数据误推到旧版本号 */
    cancelPendingPush() {
      clearTimeout(pushTimer);
      pushTimer = null;
    },

    scheduleWorkspacePush() {
      if (!serverSync.isEnabled() || !serverSync.getToken()) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        pushTimer = null;
        serverSync.pushWorkspaceNow().catch((e) => {
          if (e.status === 409) {
            w.dispatchEvent(new CustomEvent('tm-toast', {
              detail: { message: '数据已被其他用户更新，已为您刷新为最新版本。', type: 'warning' },
            }));
            serverSync.scheduleRefreshFromServer(true);
          } else {
            w.dispatchEvent(new CustomEvent('tm-toast', {
              detail: { message: `同步失败：${e.message || '网络错误'}`, type: 'error' },
            }));
          }
        });
      }, PUSH_DEBOUNCE_MS);
    },

    async pushWorkspaceNow() {
      if (!serverSync.isEnabled() || !serverSync.getToken() || serverSync.isApplyingRemote) return;
      const pl = w.TM.useProductLineStore?.();
      const data = w.TM.useDataStore?.();
      const hr = w.TM.useHrScopeStore?.();
      const auth = w.TM.useAuthStore?.();
      if (!pl || !data || !hr) return;
      const lineId = pl.currentLineId;
      if (lineId == null) return;

      const lineKey = Number(lineId);
      let clientVersion = versionByLineId.get(lineKey);
      if (clientVersion == null) {
        await serverSync.pullWorkspaceQuiet(lineKey);
        clientVersion = versionByLineId.get(lineKey) ?? 0;
      }

      const buildPatch = w.TM.buildWorkspacePatch;
      const scopedLine = hr && (hr.scopeRootDepartmentId != null && Number(hr.scopeRootDepartmentId) > 0);
      const canFullPut = !!(auth && auth.isHrbp && !scopedLine);
      let last = lastSyncedDataByLineId.get(lineKey);

      const nextPayload = () => ({
        hrScopeRootDepartmentId: hr.scopeRootDepartmentId,
        ...data.exportSnapshot(),
      });

      if (!last) {
        if (canFullPut) {
          const payload = nextPayload();
          const out = await serverSync.fetchJson(`/workspace/${lineId}`, {
            method: 'PUT',
            body: JSON.stringify({ clientVersion, data: payload }),
          });
          if (out?.version != null) versionByLineId.set(lineKey, Number(out.version));
          lastSyncedDataByLineId.set(lineKey, deepClone(payload));
          return;
        }
        await serverSync.pullWorkspaceQuiet(lineKey);
        last = lastSyncedDataByLineId.get(lineKey);
        if (!last) throw new Error('无法加载服务器基线数据');
      }

      const cur = nextPayload();
      const patch = typeof buildPatch === 'function' ? buildPatch(last, cur) : null;
      if (!patch) return;

      const patchStr = JSON.stringify({ clientVersion, patch });
      const fullStr = JSON.stringify({ clientVersion, data: cur });
      const usePatch = !canFullPut || patchStr.length <= fullStr.length * 0.92;

      if (usePatch) {
        const out = await serverSync.fetchJson(`/workspace/${lineId}/patch`, {
          method: 'POST',
          body: JSON.stringify({ clientVersion, patch }),
        });
        if (out?.version != null) versionByLineId.set(lineKey, Number(out.version));
        lastSyncedDataByLineId.set(lineKey, deepClone(cur));
        return;
      }

      const out = await serverSync.fetchJson(`/workspace/${lineId}`, {
        method: 'PUT',
        body: JSON.stringify({ clientVersion, data: cur }),
      });
      if (out?.version != null) versionByLineId.set(lineKey, Number(out.version));
      lastSyncedDataByLineId.set(lineKey, deepClone(cur));
    },

    scheduleRefreshFromServer(immediate) {
      if (!serverSync.isEnabled() || !serverSync.getToken()) return;
      clearTimeout(refreshTimer);
      const run = () => {
        refreshTimer = null;
        serverSync.pullWorkspaceQuiet().catch(() => {});
      };
      if (immediate) run();
      else refreshTimer = setTimeout(run, REFRESH_DEBOUNCE_MS);
    },

    /** HRBP 修改顶部「组织范围」后重新拉取与服务端一致的子集 */
    schedulePullAfterScopeChange() {
      if (!serverSync.isEnabled() || !serverSync.getToken()) return;
      clearTimeout(scopePullTimer);
      scopePullTimer = setTimeout(() => {
        scopePullTimer = null;
        serverSync.pullWorkspaceQuiet().catch(() => {});
      }, 380);
    },

    workspaceQueryString() {
      const hr = w.TM.useHrScopeStore?.();
      const auth = w.TM.useAuthStore?.();
      if (!hr || !auth || !auth.isHrbp) return '';
      const root = hr.scopeRootDepartmentId;
      if (root == null || root === '' || Number(root) === 0 || Number.isNaN(Number(root))) return '';
      return `?scopeRootDepartmentId=${encodeURIComponent(String(root))}`;
    },

    async pullWorkspaceQuiet(lineIdOpt) {
      const pl = w.TM.useProductLineStore?.();
      const data = w.TM.useDataStore?.();
      const hr = w.TM.useHrScopeStore?.();
      if (!pl || !data || !hr) return;
      const lineId = lineIdOpt != null ? Number(lineIdOpt) : Number(pl.currentLineId);
      if (Number.isNaN(lineId)) return;

      const q = serverSync.workspaceQueryString();
      const res = await serverSync.fetchJson(`/workspace/${lineId}${q}`);
      const body = res.data || {};
      const ver = Number(res.version) || 1;
      versionByLineId.set(lineId, ver);

      const hrScope = body.hrScopeRootDepartmentId != null ? body.hrScopeRootDepartmentId : null;
      const { hrScopeRootDepartmentId: _h, ...rest } = body;

      serverSync.isApplyingRemote = true;
      try {
        data.importSnapshot(rest, { skipPersist: true });
        hr.setScopeRootDepartmentId(hrScope == null || hrScope === '' ? null : Number(hrScope));
        data.persistAll({ skipRemote: true });
        const merged = {
          hrScopeRootDepartmentId: hr.scopeRootDepartmentId,
          ...data.exportSnapshot(),
        };
        lastSyncedDataByLineId.set(lineId, deepClone(merged));
      } finally {
        serverSync.isApplyingRemote = false;
      }
    },

    async hydrateProductLinesFromServer(productLineStore) {
      const res = await serverSync.fetchJson('/product-lines');
      const lines = (res.lines || []).map((x) => ({
        id: x.id,
        name: x.name,
        createdAt: x.createdAt,
      }));
      if (!lines.length) throw new Error('服务器未返回产品线');
      productLineStore.lines = lines;
      if (!lines.some((l) => l.id === productLineStore.currentLineId)) {
        productLineStore.currentLineId = lines[0].id;
      }
      productLineStore.persistRegistry();
    },

    async verifySession(authStore) {
      if (!serverSync.getToken()) return;
      try {
        const res = await serverSync.fetchJson('/auth/me');
        if (res?.user) {
          authStore.currentUser = { ...res.user };
          authStore.enrichCurrentUserFromEmployee();
          authStore.persistSession();
        }
      } catch {
        serverSync.setToken('');
        authStore.logout();
        authStore.persistSession();
      }
    },

    async login(identifier, password) {
      const res = await serverSync.fetchJson('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      serverSync.setToken(res.token);
      return { ok: true, user: res.user, token: res.token };
    },

    logout() {
      clearTimeout(scopePullTimer);
      scopePullTimer = null;
      serverSync.setToken('');
      serverSync.disconnectWs();
      lastSyncedDataByLineId.clear();
    },

    async createProductLineOnServer(name) {
      const res = await serverSync.fetchJson('/product-lines', {
        method: 'POST',
        body: JSON.stringify({ name: name || 'New product line' }),
      });
      return res.line;
    },

    async deleteProductLineOnServer(id) {
      await serverSync.fetchJson(`/product-lines/${id}`, { method: 'DELETE' });
    },
  };

  w.TM.serverSync = serverSync;
})(window);
