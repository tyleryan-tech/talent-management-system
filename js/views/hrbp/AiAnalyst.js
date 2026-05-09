/**
 * AI 数据分析 — 主系统原生分析界面
 */
(function () {
  const { ref, computed, onMounted, nextTick } = Vue;

  function isLocalAppOrigin(loc) {
    var protocol = loc && loc.protocol;
    var hostname = loc && loc.hostname;
    return protocol === 'file:'
      || hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === '::1';
  }

  function readConfiguredAnalystUrl() {
    var meta = document.querySelector('meta[name="tm-ai-analyst-url"]');
    return meta ? (meta.getAttribute('content') || '').trim() : '';
  }

  function isStreamlitCloudUrl(url) {
    try {
      return /\.streamlit\.app$/i.test(new URL(url, window.location.href).hostname);
    } catch {
      return false;
    }
  }

  function shouldUseLocalAnalystUrl(configuredUrl, loc) {
    var val = String(configuredUrl || '').trim();
    if (!isLocalAppOrigin(loc)) return false;
    return !val || val === '__LOCAL__' || isStreamlitCloudUrl(val);
  }

  function resolveLegacyAnalystUrl() {
    var val = readConfiguredAnalystUrl();
    if (shouldUseLocalAnalystUrl(val, window.location)) return 'http://localhost:8501';
    if (!val || val === '__LOCAL__') return 'http://localhost:8501';
    return val.replace(/\/+$/, '');
  }

  function buildEmbedUrl(url) {
    var u = new URL(url, window.location.href);
    u.searchParams.set('embed', 'true');
    return u.href;
  }

  function buildWakeUrl(url) {
    var u = new URL(url, window.location.href);
    u.searchParams.delete('embed');
    u.searchParams.delete('_tm_reload');
    return u.href;
  }

  function buildContextUrl(url, contextToken, lineId) {
    var u = new URL(url, window.location.href);
    if (contextToken) u.searchParams.set('tm_ctx', contextToken);
    if (lineId != null && lineId !== '') u.searchParams.set('lineId', String(lineId));
    return u.href;
  }

  function buildChatPayload(lineId, scopeRootDepartmentId, question) {
    var payload = {
      lineId: Number(lineId),
      question: String(question || '').trim(),
    };
    var root = Number(scopeRootDepartmentId);
    if (Number.isFinite(root) && root > 0) payload.scopeRootDepartmentId = root;
    return payload;
  }

  function statusText(status) {
    return {
      loading: '正在连接',
      ready: '已连接',
      local_ready: '本地摘要',
      forbidden: '无权访问',
      local_only: '需要后端',
      error: '连接异常',
    }[status] || status;
  }

  function scopeText(scope) {
    return {
      full: '全产品线',
      local_browser: '浏览器本地',
      hrbp_dept_subtree: '组织范围',
      manager_subtree: '本人及下属',
      manager_no_employee: '未绑定员工',
    }[scope] || scope || '当前范围';
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function toNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function countBy(rows, picker) {
    var out = {};
    list(rows).forEach(function (row) {
      var key = picker(row);
      var label = key == null || key === '' ? '未填写' : String(key);
      out[label] = (out[label] || 0) + 1;
    });
    return out;
  }

  function formatCounts(obj) {
    var entries = Object.entries(obj || {});
    if (!entries.length) return '暂无数据';
    return entries.map(function (item) { return item[0] + ' ' + item[1]; }).join('、');
  }

  function average(values) {
    var nums = list(values).map(Number).filter(Number.isFinite);
    if (!nums.length) return null;
    var total = nums.reduce(function (sum, n) { return sum + n; }, 0);
    return Math.round((total / nums.length) * 10) / 10;
  }

  function mapById(rows) {
    var out = new Map();
    list(rows).forEach(function (row) {
      var id = toNumber(row && row.id);
      if (id != null) out.set(id, row);
    });
    return out;
  }

  function deptSubtreeIds(departments, rootDeptId) {
    var root = toNumber(rootDeptId);
    if (root == null || root <= 0) return null;
    var deps = list(departments);
    if (!deps.some(function (d) { return toNumber(d.id) === root; })) return new Set();
    var byParent = new Map();
    deps.forEach(function (d) {
      var pid = d.parentId == null ? '__root__' : toNumber(d.parentId);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(d);
    });
    var out = new Set();
    function walk(id) {
      out.add(Number(id));
      list(byParent.get(Number(id))).forEach(function (child) { walk(child.id); });
    }
    walk(root);
    return out;
  }

  function managerVisibleEmployeeIds(employees, rootEmployeeId) {
    var root = toNumber(rootEmployeeId);
    if (root == null) return new Set();
    var byManager = new Map();
    list(employees).forEach(function (e) {
      var managerId = toNumber(e.managerId);
      if (managerId == null) return;
      if (!byManager.has(managerId)) byManager.set(managerId, []);
      byManager.get(managerId).push(toNumber(e.id));
    });
    var out = new Set([root]);
    var stack = list(byManager.get(root)).slice();
    while (stack.length) {
      var id = Number(stack.pop());
      if (out.has(id)) continue;
      out.add(id);
      list(byManager.get(id)).forEach(function (childId) { stack.push(childId); });
    }
    return out;
  }

  function filterLocalSnapshot(snapshot, authUser, scopeRootDepartmentId) {
    var src = snapshot || {};
    var employees = list(src.employees);
    var departments = list(src.departments);
    var visibleEmployees = employees;
    var scope = 'local_browser';

    if (authUser && String(authUser.role || '') === 'manager' && authUser.employeeId != null) {
      var mgrIds = managerVisibleEmployeeIds(employees, authUser.employeeId);
      visibleEmployees = employees.filter(function (e) { return mgrIds.has(toNumber(e.id)); });
      scope = 'manager_subtree';
    } else {
      var deptIds = deptSubtreeIds(departments, scopeRootDepartmentId);
      if (deptIds && deptIds.size) {
        visibleEmployees = employees.filter(function (e) { return deptIds.has(toNumber(e.departmentId)); });
        scope = 'hrbp_dept_subtree';
      }
    }

    var empIds = new Set(visibleEmployees.map(function (e) { return toNumber(e.id); }));
    var deptIdsVisible = new Set(visibleEmployees.map(function (e) { return toNumber(e.departmentId); }));
    var deptNamesVisible = new Set(departments.filter(function (d) {
      return deptIdsVisible.has(toNumber(d.id));
    }).map(function (d) { return String(d.name || '').trim(); }));
    var positions = list(src.positions).filter(function (p) { return deptIdsVisible.has(toNumber(p.departmentId)); });

    return {
      data: {
        ...src,
        employees: visibleEmployees,
        departments: departments.filter(function (d) { return deptIdsVisible.has(toNumber(d.id)); }),
        positions: positions,
        performanceReviews: list(src.performanceReviews).filter(function (r) { return empIds.has(toNumber(r.employeeId)); }),
        attendanceRecords: list(src.attendanceRecords).filter(function (r) { return empIds.has(toNumber(r.employeeId)); }),
        talentMatrix: list(src.talentMatrix).filter(function (r) { return empIds.has(toNumber(r.employeeId)); }),
        leaveRequests: list(src.leaveRequests).filter(function (r) { return empIds.has(toNumber(r.employeeId)); }),
        recruitmentPipeline: list(src.recruitmentPipeline).filter(function (r) {
          var team = String(r.team || '').trim();
          return !deptNamesVisible.size || !team || deptNamesVisible.has(team);
        }),
      },
      scope: scope,
    };
  }

  function buildLocalDataProfile(snapshot, context) {
    var data = snapshot || {};
    var employees = list(data.employees);
    var activeEmployees = employees.filter(function (e) { return e.status !== 'leave'; });
    var finalized = list(data.performanceReviews).filter(function (r) {
      return r.status === 'finalized' && String(r.finalGrade || '').trim();
    });
    return {
      generatedAt: new Date().toISOString(),
      productLine: context && context.productLine ? context.productLine : null,
      permissions: context && context.permissions ? context.permissions : null,
      totals: {
        employees: employees.length,
        activeEmployees: activeEmployees.length,
        departments: list(data.departments).length,
        positions: list(data.positions).length,
        performanceReviews: list(data.performanceReviews).length,
        attendanceRecords: list(data.attendanceRecords).length,
        recruitmentPipeline: list(data.recruitmentPipeline).length,
        recruitmentCandidates: list(data.recruitmentCandidates).length,
      },
      employeeStatus: countBy(employees, function (e) { return e.status || '未填写'; }),
      departmentTop: Object.entries(countBy(employees, function (e) {
        var dept = list(data.departments).find(function (d) { return toNumber(d.id) === toNumber(e.departmentId); });
        return dept ? dept.name : '未归属部门';
      })).map(function (item) {
        return { label: item[0], count: item[1] };
      }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8),
      performance: {
        latestFinalizedCount: finalized.length,
        latestFinalGradeCounts: countBy(finalized, function (r) { return r.finalGrade || '未填写'; }),
      },
      attendance: {
        recordCount: list(data.attendanceRecords).length,
        avgDailyHours: average(list(data.attendanceRecords).map(function (r) { return r.avgDailyHours; })),
      },
      recruitment: {
        pipelineCount: list(data.recruitmentPipeline).length,
        offerCounts: countBy(data.recruitmentPipeline, function (r) { return r.offering || '未填写'; }),
      },
    };
  }

  function buildLocalAnswer(question, dataProfile) {
    var q = String(question || '');
    var profile = dataProfile || {};
    var totals = profile.totals || {};
    var perf = profile.performance || {};
    var att = profile.attendance || {};
    var rec = profile.recruitment || {};
    var lines = [];
    lines.push('**核心结论**：已基于当前浏览器本地数据生成摘要。当前可见员工 '
      + (totals.employees || 0) + ' 人，其中非离职 ' + (totals.activeEmployees || 0)
      + ' 人，覆盖 ' + (totals.departments || 0) + ' 个部门。');

    if (/绩效|评级|等级|校准|归档|低绩效|高绩效/i.test(q)) {
      lines.push('', '**绩效发现**');
      lines.push('- 已归档绩效记录 ' + (perf.latestFinalizedCount || 0) + ' 条。');
      lines.push('- 最终等级分布：' + formatCounts(perf.latestFinalGradeCounts) + '。');
    } else if (/考勤|工时|出勤|负荷|加班/i.test(q)) {
      lines.push('', '**考勤发现**');
      lines.push('- 考勤记录 ' + (att.recordCount || 0) + ' 条，平均日工时 ' + (att.avgDailyHours == null ? '暂无' : att.avgDailyHours) + ' 小时。');
    } else if (/招聘|候选|面试|offer|Offer|漏斗/i.test(q)) {
      lines.push('', '**招聘发现**');
      lines.push('- 招聘 Pipeline 候选人 ' + (rec.pipelineCount || 0) + ' 人。');
      lines.push('- Offer 状态分布：' + formatCounts(rec.offerCounts) + '。');
    } else {
      lines.push('', '**整体概览**');
      lines.push('- 员工状态：' + formatCounts(profile.employeeStatus) + '。');
      lines.push('- 部门人数 Top：' + (list(profile.departmentTop).map(function (d) { return d.label + ' ' + d.count; }).join('、') || '暂无数据') + '。');
      lines.push('- 绩效最新等级：' + formatCounts(perf.latestFinalGradeCounts) + '。');
      lines.push('- 招聘 Pipeline：' + (rec.pipelineCount || 0) + ' 人。');
    }

    lines.push('', '**风险提示**：纯前端模式不会调用后端模型服务，以上为内置摘要；涉及薪酬、绩效、晋升、离职、调动、招聘 Offer 或候选人评价时，仍需 HRBP/管理者人工复核。');
    lines.push('', '**建议动作**：如需模型生成更深入的交叉分析，请使用服务端同步模式登录，并在后端配置 DeepSeek 或 OpenAI-compatible 模型密钥。');
    return lines.join('\n');
  }

  window.TM.aiAnalystUtils = {
    buildEmbedUrl,
    buildContextUrl,
    buildWakeUrl,
    buildChatPayload,
    isLocalAppOrigin,
    isStreamlitCloudUrl,
    shouldUseLocalAnalystUrl,
    scopeText,
    buildLocalDataProfile,
    buildLocalAnswer,
  };

  window.TM.HrbpAiAnalyst = {
    name: 'HrbpAiAnalyst',
    template: `
      <div class="page-stack ai-analyst-page">
        <section class="ai-native-shell">
          <header class="ai-native-header">
            <div>
              <h2>AI 数据分析</h2>
              <div class="ai-native-meta">
                <span class="tag" :data-st="isReady ? 'approved' : 'pending'">
                  {{ statusLabel }}
                </span>
                <span v-if="contextLineName" class="muted small">{{ contextLineName }}</span>
                <span v-if="contextScope" class="muted small">{{ contextScope }}</span>
                <span v-if="modelName" class="muted small">{{ modelName }}</span>
              </div>
            </div>
            <div class="ai-native-actions">
              <button type="button" class="btn btn-outline btn-sm" :disabled="isBusy" @click="refreshContext">
                <i class="fa-solid fa-rotate"></i> 刷新上下文
              </button>
              <button v-if="legacyUrl" type="button" class="btn btn-ghost btn-sm" @click="openLegacyAnalyst">
                <i class="fa-solid fa-up-right-from-square"></i> 旧版服务
              </button>
            </div>
          </header>

          <div v-if="status === 'loading'" class="ai-state-card">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>正在加载当前产品线数据…</span>
          </div>

          <div v-else-if="status === 'forbidden'" class="ai-state-card">
            <i class="fa-solid fa-lock"></i>
            <div>
              <strong>无权访问 AI 数据分析</strong>
              <p>{{ stateMessage }}</p>
            </div>
          </div>

          <div v-else-if="status === 'local_only'" class="ai-state-card">
            <i class="fa-solid fa-server"></i>
            <div>
              <strong>当前为纯前端模式</strong>
              <p>{{ stateMessage }}</p>
            </div>
          </div>

          <div v-else-if="status === 'error'" class="ai-state-card">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <div>
              <strong>AI 分析暂不可用</strong>
              <p>{{ stateMessage }}</p>
            </div>
          </div>

          <template v-else>
            <div class="ai-profile-row">
              <div class="ai-profile-item">
                <span>员工</span>
                <strong>{{ profile.totals?.employees || 0 }}</strong>
              </div>
              <div class="ai-profile-item">
                <span>非离职</span>
                <strong>{{ profile.totals?.activeEmployees || 0 }}</strong>
              </div>
              <div class="ai-profile-item">
                <span>部门</span>
                <strong>{{ profile.totals?.departments || 0 }}</strong>
              </div>
              <div class="ai-profile-item">
                <span>绩效归档</span>
                <strong>{{ profile.performance?.latestFinalizedCount || 0 }}</strong>
              </div>
              <div class="ai-profile-item">
                <span>招聘 Pipeline</span>
                <strong>{{ profile.recruitment?.pipelineCount || 0 }}</strong>
              </div>
            </div>

            <div ref="chatBodyRef" class="ai-chat-body">
              <article
                v-for="(msg, idx) in messages"
                :key="idx"
                class="ai-message"
                :class="'ai-message-' + msg.role"
              >
                <div class="ai-avatar">
                  <i :class="msg.role === 'user' ? 'fa-solid fa-user' : 'fa-solid fa-robot'"></i>
                </div>
                <div class="ai-message-main">
                  <div class="ai-message-head">
                    <strong>{{ msg.role === 'user' ? '我' : 'AI 分析' }}</strong>
                    <span v-if="msg.mode === 'local_summary'" class="tag ghost">内置摘要</span>
                    <span v-else-if="msg.mode === 'local_fallback'" class="tag ghost">模型回退</span>
                    <span v-else-if="msg.mode === 'model'" class="tag ghost">模型分析</span>
                  </div>
                  <div class="ai-message-content">{{ msg.content }}</div>
                  <p v-if="msg.warning" class="ai-warning">{{ msg.warning }}</p>
                </div>
              </article>
              <article v-if="isBusy" class="ai-message ai-message-assistant">
                <div class="ai-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="ai-message-main">
                  <div class="ai-message-head"><strong>AI 分析</strong></div>
                  <div class="ai-thinking">
                    <i class="fa-solid fa-spinner fa-spin"></i> 正在基于当前权限范围分析数据…
                  </div>
                </div>
              </article>
            </div>

            <div class="ai-prompt-row">
              <button
                v-for="p in quickPrompts"
                :key="p"
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="isBusy"
                @click="sendQuestion(p)"
              >{{ p }}</button>
            </div>

            <form class="ai-input-bar" @submit.prevent="sendCurrent">
              <textarea
                v-model="draft"
                class="ai-input"
                rows="2"
                maxlength="1200"
                placeholder="输入要分析的问题"
                :disabled="isBusy"
                @keydown.enter.exact.prevent="sendCurrent"
              ></textarea>
              <button type="submit" class="btn btn-primary ai-send-btn" :disabled="!canSend">
                <i class="fa-solid fa-paper-plane"></i>
              </button>
            </form>
          </template>
        </section>
      </div>
    `,
    setup() {
      var authStore = window.TM.useAuthStore ? window.TM.useAuthStore() : null;
      var productLineStore = window.TM.useProductLineStore ? window.TM.useProductLineStore() : null;
      var hrScopeStore = window.TM.useHrScopeStore ? window.TM.useHrScopeStore() : null;
      var serverSync = window.TM.serverSync;
      var status = ref('loading');
      var stateMessage = ref('');
      var profile = ref({});
      var context = ref(null);
      var draft = ref('');
      var isBusy = ref(false);
      var messages = ref([]);
      var chatBodyRef = ref(null);
      var legacyUrl = readConfiguredAnalystUrl() ? resolveLegacyAnalystUrl() : '';
      var quickPrompts = [
        '帮我分析当前团队整体情况',
        '绩效分布有什么风险',
        '考勤工时是否异常',
        '招聘漏斗哪里需要关注',
      ];

      function canAccessAiAnalyst() {
        if (!authStore || !authStore.isLoggedIn) return false;
        return typeof authStore.canAccessModule === 'function'
          ? authStore.canAccessModule('ai_analyst')
          : true;
      }

      function currentLineId() {
        return productLineStore ? productLineStore.currentLineId : null;
      }

      function currentScopeRoot() {
        var root = hrScopeStore ? hrScopeStore.scopeRootDepartmentId : null;
        return root != null && root !== '' && Number(root) > 0 ? Number(root) : null;
      }

      function queryString() {
        var params = new URLSearchParams();
        var lineId = currentLineId();
        if (lineId != null) params.set('lineId', String(lineId));
        var root = currentScopeRoot();
        if (root != null) params.set('scopeRootDepartmentId', String(root));
        return params.toString();
      }

      function ensureAccess() {
        if (!canAccessAiAnalyst()) {
          status.value = 'forbidden';
          stateMessage.value = '请联系超级管理员在用户管理中开通 AI 数据分析模块权限。';
          return false;
        }
        if (currentLineId() == null) {
          status.value = 'error';
          stateMessage.value = '当前未选择产品线。';
          return false;
        }
        return true;
      }

      function hasNativeApiSession() {
        return !!(serverSync && serverSync.isEnabled && serverSync.isEnabled() && serverSync.getToken());
      }

      function localLineName() {
        if (!productLineStore) return '本地产品线';
        var lineId = currentLineId();
        var line = list(productLineStore.lines).find(function (l) { return Number(l.id) === Number(lineId); });
        return (line && line.name) || '本地产品线';
      }

      function buildLocalContext(scope) {
        var user = authStore && authStore.currentUser ? authStore.currentUser : {};
        return {
          user: {
            id: user.id ?? null,
            username: user.username || '',
            email: user.email || '',
            role: user.role || '',
            realName: user.realName || '',
            employeeId: user.employeeId ?? null,
            superAdmin: user.superAdmin === true,
          },
          productLine: {
            id: currentLineId(),
            name: localLineName(),
          },
          permissions: {
            modules: ['ai_analyst'],
            scope: scope || 'local_browser',
            scopeRootDepartmentId: currentScopeRoot(),
          },
        };
      }

      function refreshLocalContext() {
        var dataStore = window.TM.useDataStore ? window.TM.useDataStore() : null;
        var snapshot = dataStore && typeof dataStore.exportSnapshot === 'function'
          ? dataStore.exportSnapshot()
          : {};
        var filtered = filterLocalSnapshot(snapshot, authStore ? authStore.currentUser : null, currentScopeRoot());
        var localContext = buildLocalContext(filtered.scope);
        context.value = localContext;
        profile.value = buildLocalDataProfile(filtered.data, localContext);
        status.value = 'local_ready';
        stateMessage.value = '';
        if (!messages.value.length) {
          messages.value.push({
            role: 'assistant',
            content: '当前为纯前端模式，已切换为浏览器本地摘要。所有结果只基于当前浏览器内的数据。',
            mode: 'local_summary',
          });
        }
      }

      function scrollToBottom() {
        nextTick(function () {
          var el = chatBodyRef.value;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }

      async function refreshContext() {
        if (!ensureAccess()) return;
        if (!hasNativeApiSession()) {
          refreshLocalContext();
          scrollToBottom();
          return;
        }
        status.value = 'loading';
        stateMessage.value = '';
        try {
          var q = queryString();
          var res = await serverSync.fetchJson('/ai-analyst/context' + (q ? '?' + q : ''), { method: 'GET' });
          context.value = res.context || null;
          profile.value = res.dataProfile || {};
          status.value = 'ready';
          if (!messages.value.length) {
            messages.value.push({
              role: 'assistant',
              content: '已连接当前产品线数据。所有分析都会限定在当前账号可见范围内。',
            });
          }
        } catch (e) {
          if (e.status === 401 || e.status === 403) {
            status.value = 'forbidden';
            stateMessage.value = (e.body && e.body.error) || '当前账号无 AI 数据分析权限。';
          } else {
            status.value = 'error';
            stateMessage.value = (e.body && e.body.error) || e.message || '请稍后重试。';
          }
        } finally {
          scrollToBottom();
        }
      }

      async function sendQuestion(question) {
        var text = String(question || '').trim();
        if (!text || isBusy.value || !isReady.value) return;
        messages.value.push({ role: 'user', content: text });
        draft.value = '';
        isBusy.value = true;
        scrollToBottom();
        try {
          if (status.value === 'local_ready') {
            var dataStore = window.TM.useDataStore ? window.TM.useDataStore() : null;
            var snapshot = dataStore && typeof dataStore.exportSnapshot === 'function'
              ? dataStore.exportSnapshot()
              : {};
            var filtered = filterLocalSnapshot(snapshot, authStore ? authStore.currentUser : null, currentScopeRoot());
            var localContext = buildLocalContext(filtered.scope);
            var localProfile = buildLocalDataProfile(filtered.data, localContext);
            context.value = localContext;
            profile.value = localProfile;
            messages.value.push({
              role: 'assistant',
              content: buildLocalAnswer(text, localProfile),
              mode: 'local_summary',
              warning: '当前为纯前端模式，未调用后端模型服务。',
            });
            return;
          }
          var payload = buildChatPayload(currentLineId(), currentScopeRoot(), text);
          var res = await serverSync.fetchJson('/ai-analyst/chat', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          if (res.dataProfile) profile.value = res.dataProfile;
          if (res.context) context.value = res.context;
          messages.value.push({
            role: 'assistant',
            content: res.answer || '未返回分析结果。',
            mode: res.mode,
            warning: res.warning || '',
          });
        } catch (e) {
          messages.value.push({
            role: 'assistant',
            content: (e.body && e.body.error) || e.message || 'AI 分析失败，请稍后重试。',
            warning: '本次请求未完成。',
          });
        } finally {
          isBusy.value = false;
          scrollToBottom();
        }
      }

      function sendCurrent() {
        sendQuestion(draft.value);
      }

      function openLegacyAnalyst() {
        if (!legacyUrl) return;
        window.open(buildWakeUrl(legacyUrl), '_blank', 'noopener');
      }

      var isReady = computed(function () {
        return status.value === 'ready' || status.value === 'local_ready';
      });
      var canSend = computed(function () {
        return isReady.value && !isBusy.value && String(draft.value || '').trim().length > 0;
      });
      var statusLabel = computed(function () { return statusText(status.value); });
      var contextLineName = computed(function () {
        return context.value && context.value.productLine ? context.value.productLine.name : '';
      });
      var contextScope = computed(function () {
        var scope = context.value && context.value.permissions ? context.value.permissions.scope : '';
        return scope ? scopeText(scope) : '';
      });
      var modelName = computed(function () {
        var mode = messages.value.slice().reverse().find(function (m) { return m.mode; })?.mode;
        if (mode === 'model') return '模型分析';
        if (mode === 'local_summary') return '内置摘要';
        if (mode === 'local_fallback') return '模型回退';
        return '';
      });

      onMounted(function () { refreshContext(); });

      return {
        status,
        isReady,
        stateMessage,
        statusLabel,
        profile,
        contextLineName,
        contextScope,
        modelName,
        draft,
        isBusy,
        canSend,
        messages,
        quickPrompts,
        chatBodyRef,
        legacyUrl,
        refreshContext,
        sendQuestion,
        sendCurrent,
        openLegacyAnalyst,
      };
    },
  };
})();
