(function () {
  const { computed, onMounted, onUnmounted, ref, watch, nextTick } = Vue;
  const useAuthStore = window.TM.useAuthStore;
  const useDataStore = window.TM.useDataStore;
  const loadEcharts = window.TM.loadEcharts;
  const TM = window.TM;

  window.TM.MgrPerformance = {
    name: 'MgrPerformance',
    template: `
    <div class="page-stack">
      <div class="recruit-tabs">
        <button type="button" :class="['btn','btn-sm', tab==='eval'?'btn-primary':'btn-ghost']" @click="tab='eval'">
          <i class="fa-solid fa-scale-balanced"></i> 评估与审批
          <span v-if="todoList.length" class="perf-badge">{{ todoList.length }}</span>
        </button>
        <button type="button" :class="['btn','btn-sm', tab==='history'?'btn-primary':'btn-ghost']" @click="tab='history'">
          <i class="fa-solid fa-clock-rotate-left"></i> 团队绩效
        </button>
        <button type="button" :class="['btn','btn-sm', tab==='communication'?'btn-primary':'btn-ghost']" @click="tab='communication'">
          <i class="fa-solid fa-comments"></i> 绩效沟通
        </button>
      </div>

      <!-- ===== Tab 1: Evaluation & Approval ===== -->
      <template v-if="tab==='eval'">
        <div class="card pad" v-if="currentCycle">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <p class="muted small" style="margin:0">
              <strong>当前周期</strong>: {{ currentCycle.name }}
              <span class="tag" style="margin-left:8px">{{ cycleTypeLabel(currentCycle) }}</span>
            </p>
            <label class="field inline" style="margin:0">
              <span>子团队</span>
              <select v-model.number="distRoot" class="input" style="min-width:140px">
                <option :value="me">我的团队</option>
                <option v-for="opt in subMgrOptions" :key="opt.id" :value="opt.id">{{ opt.name }} ({{ opt.n }})</option>
              </select>
            </label>
          </div>
        </div>

        <!-- Inline grade distribution chart + status cards -->
        <div class="perf-overview-row">
          <div class="card pad" style="flex:2;min-width:0">
            <h3 class="section-title">团队绩效等级分布 <span class="muted small">（不含本人）</span></h3>
            <div ref="distChartRef" class="chart-box" style="height:220px"></div>
            <div class="perf-asum-bar">
              <span><strong>A+/A/A- 合计:</strong> {{ aSumCount }} 人</span>
              <span v-if="aSumPct !== null">({{ aSumPct }}%)</span>
            </div>
          </div>
          <div class="card pad" style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:8px">
            <h3 class="section-title">状态统计</h3>
            <div v-for="s in statusCards" :key="s.key" class="perf-status-card-mini" :class="'perf-sc-'+s.key">
              <span class="perf-sc-num">{{ s.count }}</span>
              <span class="perf-sc-label">{{ s.label }}</span>
            </div>
          </div>
        </div>

        <!-- Pending tasks (my own) -->
        <div class="card pad" v-if="todoList.length">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <h3 class="section-title" style="margin:0">我的待办 <span class="perf-badge">{{ todoList.length }}</span></h3>
            <button v-if="batchApproveCount && canApproveAll && auth.hasPermission('perf.approve')" type="button" class="btn btn-primary btn-xs" @click="batchApprove">
              <i class="fa-solid fa-check-double"></i> 一键审批 ({{ batchApproveCount }})
            </button>
            <span v-if="batchApproveCount && !canApproveAll" class="muted small" style="color:#e67700">
              <i class="fa-solid fa-triangle-exclamation"></i> 下级团队尚有未完成的评估/审批，暂不可提交上级
            </span>
          </div>
          <table class="data-table compact">
            <thead><tr><th>员工</th><th>当前等级</th><th>绩效评语</th><th>任务类型</th><th></th></tr></thead>
            <tbody>
              <tr v-for="r in todoList" :key="r.id">
                <td>{{ empName(r.employeeId) }}</td>
                <td>{{ r.rmInitialGrade || '—' }}</td>
                <td class="cell-clip" style="max-width:160px" :title="r.rmComment||''">{{ r.rmComment || '—' }}</td>
                <td>{{ todoKind(r) }}</td>
                <td>
                  <button v-if="r.status==='rm_pending' && auth.hasPermission('perf.evaluate')" type="button" class="btn btn-primary btn-xs" @click="openTask(r)">评估</button>
                  <button v-if="r.status==='in_approval' && canApproveAll && auth.hasPermission('perf.approve')" type="button" class="btn btn-primary btn-xs" @click="openTask(r)">审批</button>
                  <button v-if="r.status==='in_approval' && !canApproveAll" type="button" class="btn btn-ghost btn-xs" disabled title="下级团队尚有未完成任务">审批</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card pad" v-else>
          <p class="muted small" style="margin:0"><i class="fa-solid fa-check-circle" style="color:#10b981"></i> 没有待处理任务。</p>
        </div>

        <!-- Subordinate pending tasks (proxy + urge) -->
        <div class="card pad" v-if="subordinatePending.length">
          <h3 class="section-title">下级待办 <span class="muted small">（可催促或代办）</span></h3>
          <div v-for="sub in subordinatePending" :key="sub.rm.id" style="margin-bottom:16px;border-bottom:1px solid #e2e8f0;padding-bottom:12px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
              <strong>{{ sub.rm.name }}</strong>
              <span class="muted small">({{ sub.email }})</span>
              <button v-if="auth.hasPermission('perf.urge')" type="button" class="btn btn-secondary btn-xs" @click="urgeSubordinate(sub)">
                <i class="fa-solid fa-bell"></i> 催促
              </button>
            </div>
            <table class="data-table compact">
              <thead><tr><th>员工</th><th>状态</th><th>等级</th><th></th></tr></thead>
              <tbody>
                <tr v-for="r in sub.reviews" :key="r.id">
                  <td>{{ empName(r.employeeId) }}</td>
                  <td><span class="tag" :class="'perf-st-'+r.status">{{ statusLabel(r.status) }}</span></td>
                  <td>{{ r.rmInitialGrade || '—' }}</td>
                  <td>
                    <button v-if="r.status==='rm_pending' && auth.hasPermission('perf.proxy')" type="button" class="btn btn-xs btn-secondary" @click="openProxyEval(r)">代评估</button>
                    <button v-if="r.status==='in_approval' && auth.hasPermission('perf.proxy')" type="button" class="btn btn-xs btn-secondary" @click="openProxyApproval(r)">代审批</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Full team review list -->
        <div class="card pad">
          <h3 class="section-title">团队评估列表 <span class="muted small">({{ teamReviewsCurrentCycle.length }} 条)</span></h3>
          <div style="overflow-x:auto">
            <table class="data-table compact">
              <thead><tr><th>员工</th><th>RM</th><th>RM 评估</th><th>绩效评语</th><th>状态</th><th>最终等级</th></tr></thead>
              <tbody>
                <tr v-for="r in teamReviewsCurrentCycle" :key="r.id">
                  <td>{{ empName(r.employeeId) }}</td>
                  <td>{{ empName(r.reviewerId) }}</td>
                  <td>{{ r.rmInitialGrade || '—' }}</td>
                  <td class="cell-clip" style="max-width:160px" :title="r.rmComment||''">{{ r.rmComment || '—' }}</td>
                  <td><span class="tag" :class="'perf-st-'+r.status">{{ statusLabel(r.status) }}</span></td>
                  <td><strong>{{ (r.status==='calibrated'||r.status==='finalized') ? (r.finalGrade||'—') : '—' }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ===== Tab 2: Team History ===== -->
      <template v-if="tab==='history'">
        <div class="card pad">
          <h3 class="section-title">团队绩效历史</h3>
          <label class="field inline" style="margin-bottom:12px">
            <span>周期</span>
            <select v-model.number="histCycleId" class="input">
              <option :value="0">全部周期</option>
              <option v-for="c in allCycles" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <div style="overflow-x:auto">
            <table class="data-table compact">
              <thead><tr><th>员工</th><th>RM</th><th>周期</th><th>RM 评估</th><th>最终等级</th><th>状态</th></tr></thead>
              <tbody>
                <tr v-for="r in historyFiltered" :key="r.id">
                  <td>{{ empName(r.employeeId) }}</td>
                  <td>{{ empName(r.reviewerId) }}</td>
                  <td>{{ cycleLabel(r) }}</td>
                  <td>{{ r.rmInitialGrade || '—' }}</td>
                  <td><strong>{{ (r.status==='calibrated'||r.status==='finalized') ? (r.finalGrade||'—') : '—' }}</strong></td>
                  <td><span class="tag" :class="'perf-st-'+r.status">{{ statusLabel(r.status) }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ===== Tab 3: Communication ===== -->
      <template v-if="tab==='communication'">
        <div class="card pad">
          <h3 class="section-title">绩效沟通</h3>
          <p class="muted small">已归档的直属下级绩效，可记录沟通内容。</p>
          <table class="data-table compact">
            <thead><tr><th>员工</th><th>周期</th><th>最终等级</th><th>沟通状态</th><th></th></tr></thead>
            <tbody>
              <tr v-for="r in commDirectList" :key="r.id">
                <td>{{ empName(r.employeeId) }}</td>
                <td>{{ cycleLabel(r) }}</td>
                <td><strong>{{ r.finalGrade || '—' }}</strong></td>
                <td>{{ r.communicatedAt ? '已沟通 ('+r.communicatedAt+')' : '未沟通' }}</td>
                <td><button v-if="auth.hasPermission('perf.communicate')" type="button" class="btn-link" @click="openCommTask(r)">{{ r.communicatedAt ? '编辑' : '沟通' }}</button></td>
              </tr>
            </tbody>
          </table>
          <p v-if="!commDirectList.length" class="muted small">暂无需要沟通的记录。</p>
        </div>
      </template>

      <!-- ===== RM Evaluation Modal ===== -->
      <div v-if="rmModal" class="modal-backdrop" @click.self="rmModal=false">
        <div class="modal card wide">
          <h3>绩效评估 · {{ empName(rmTarget.employeeId) }} · {{ cycleLabel(rmTarget) }}</h3>
          <form class="form-grid" @submit.prevent="submitRm">
            <label class="field"><span>绩效等级</span>
              <select v-model="rmForm.rmInitialGrade" class="input" required>
                <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <label class="field full"><span>绩效评语 <span class="muted small">（必填）</span></span>
              <textarea v-model="rmForm.rmComment" rows="3" required placeholder="评估该员工本周期表现…"></textarea>
            </label>
            <label class="field full"><span>产出总结 <span class="muted small">（必填）</span></span>
              <textarea v-model="rmForm.outputDescription" rows="3" required placeholder="关键成果描述…"></textarea>
            </label>
            <label class="field full"><span>发展建议</span>
              <textarea v-model="rmForm.devAdvice" rows="2" placeholder="可选"></textarea>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="rmModal=false">取消</button>
              <button type="submit" class="btn btn-primary">提交至审批</button>
            </div>
          </form>
        </div>
      </div>

      <!-- ===== Approval Modal (上级审批 + 可校准等级) ===== -->
      <div v-if="apprModal" class="modal-backdrop" @click.self="apprModal=false">
        <div class="modal card wide">
          <h3>审批 · {{ empName(apprTarget.employeeId) }}</h3>
          <div class="kv-grid" style="margin-bottom:12px">
            <div><span class="muted">当前建议等级</span><div><strong>{{ apprTarget.rmInitialGrade }}</strong></div></div>
            <div><span class="muted">提交人</span><div>{{ empName(apprTarget.reviewerId) }}</div></div>
            <div class="full"><span class="muted">绩效评语</span><div>{{ apprTarget.rmComment || '—' }}</div></div>
            <div class="full"><span class="muted">产出说明</span><div class="cell-clip">{{ apprTarget.outputDescription || '—' }}</div></div>
          </div>
          <div class="form-grid">
            <label class="field"><span>校准等级 <span class="muted small">（可调整）</span></span>
              <select v-model="apprGrade" class="input">
                <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <label class="field full"><span>审批备注</span>
              <textarea v-model="apprNote" rows="2" placeholder="调整理由或审批意见…"></textarea>
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="apprModal=false">取消</button>
            <button type="button" class="btn btn-secondary" @click="doReject"><i class="fa-solid fa-arrow-rotate-left"></i> 驳回至下级</button>
            <button type="button" class="btn btn-primary" @click="doApprove"><i class="fa-solid fa-check"></i> 通过</button>
          </div>
        </div>
      </div>

      <!-- ===== Proxy Evaluation Modal ===== -->
      <div v-if="proxyEvalModal" class="modal-backdrop" @click.self="proxyEvalModal=false">
        <div class="modal card wide">
          <h3>代评估 · {{ empName(proxyEvalTarget.employeeId) }} · {{ cycleLabel(proxyEvalTarget) }}</h3>
          <p class="muted small">原 RM: {{ empName(proxyEvalTarget.reviewerId) }}</p>
          <form class="form-grid" @submit.prevent="submitProxyEval">
            <label class="field"><span>绩效等级</span>
              <select v-model="proxyEvalForm.rmInitialGrade" class="input" required>
                <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <label class="field full"><span>绩效评语 <span class="muted small">（必填）</span></span>
              <textarea v-model="proxyEvalForm.rmComment" rows="3" required placeholder="评估该员工本周期表现…"></textarea>
            </label>
            <label class="field full"><span>产出总结 <span class="muted small">（必填）</span></span>
              <textarea v-model="proxyEvalForm.outputDescription" rows="3" required placeholder="关键成果描述…"></textarea>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="proxyEvalModal=false">取消</button>
              <button type="submit" class="btn btn-primary">提交至审批</button>
            </div>
          </form>
        </div>
      </div>

      <!-- ===== Proxy Approval Modal ===== -->
      <div v-if="proxyApprModal" class="modal-backdrop" @click.self="proxyApprModal=false">
        <div class="modal card wide">
          <h3>代审批 · {{ empName(proxyApprTarget.employeeId) }}</h3>
          <div class="kv-grid" style="margin-bottom:12px">
            <div><span class="muted">当前建议等级</span><div><strong>{{ proxyApprTarget.rmInitialGrade }}</strong></div></div>
            <div><span class="muted">原审批人</span><div>{{ empName(proxyApprTarget.pendingApproverId) }}</div></div>
            <div class="full"><span class="muted">绩效评语</span><div>{{ proxyApprTarget.rmComment || '—' }}</div></div>
          </div>
          <div class="form-grid">
            <label class="field"><span>校准等级 <span class="muted small">（可调整）</span></span>
              <select v-model="proxyApprGrade" class="input">
                <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <label class="field full"><span>审批备注</span>
              <textarea v-model="proxyApprNote" rows="2" placeholder="审批意见…"></textarea>
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="proxyApprModal=false">取消</button>
            <button type="button" class="btn btn-secondary" @click="doProxyReject"><i class="fa-solid fa-arrow-rotate-left"></i> 驳回</button>
            <button type="button" class="btn btn-primary" @click="doProxyApprove"><i class="fa-solid fa-check"></i> 通过</button>
          </div>
        </div>
      </div>

      <!-- ===== Communication Modal ===== -->
      <div v-if="commTaskModal" class="modal-backdrop" @click.self="commTaskModal=false">
        <div class="modal card">
          <h3>绩效沟通 · {{ empName(commTaskTarget.employeeId) }}</h3>
          <p class="muted small">最终等级: <strong>{{ commTaskTarget.finalGrade }}</strong></p>
          <form class="form-grid" @submit.prevent="doCommTask">
            <label class="field full"><span>沟通记录</span>
              <textarea v-model="commTaskNotes" rows="4" placeholder="记录关键沟通信息…" required></textarea>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="commTaskModal=false">取消</button>
              <button type="submit" class="btn btn-primary">保存</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
    setup() {
      const auth = useAuthStore();
      const data = useDataStore();
      const gradeOptions = TM.PERF_GRADE_OPTIONS;

      const tab = ref('eval');
      const me = computed(() => auth.currentUser?.employeeId);

      const allCycles = computed(() =>
        [...(data.performanceCycles || [])].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))),
      );
      const currentCycle = computed(() => allCycles.value.find((c) => c.status === 'open') || allCycles.value[0] || null);

      const subtreeIds = computed(() => me.value ? TM.collectSubtreeEmployeeIds(data, me.value) : new Set());
      const directIds = computed(() => new Set(data.employees.filter((e) => e.managerId === me.value).map((e) => e.id)));

      function empName(id) { return data._empMap.get(id)?.name || id; }
      function cycleLabel(r) { return TM.reviewCycleLabel(data, r); }
      function cycleTypeLabel(c) { return TM.PERF_CYCLE_TYPE_LABEL[c?.cycleType] || '半年绩效'; }
      function statusLabel(s) { return TM.PERF_STATUS_LABEL[s] || s; }

      function todoKind(r) {
        if (r.status === 'rm_pending') return 'RM 评估';
        if (r.status === 'in_approval') {
          const chain = r.approvalChain || [];
          const idx = chain.indexOf(Number(me.value));
          if (idx === 0) return '审批（第一级）';
          return `审批（第 ${idx + 1} 级）`;
        }
        return '审批';
      }

      /* ── Distribution ── */
      const distRoot = ref(null);
      watch(me, (m) => { if (m && distRoot.value == null) distRoot.value = m; }, { immediate: true });

      const subMgrOptions = computed(() => {
        const subs = data.employees.filter((e) => e.managerId === me.value && e.status !== 'leave');
        return subs
          .filter((e) => data.employees.some((x) => x.managerId === e.id && x.status !== 'leave'))
          .map((e) => ({ id: e.id, name: e.name, n: TM.collectSubtreeEmployeeIds(data, e.id).size }));
      });

      const distEmpSet = computed(() => {
        const root = distRoot.value || me.value;
        return root ? TM.collectSubtreeEmployeeIds(data, root) : new Set();
      });

      const teamReviewsCurrentCycle = computed(() => {
        const set = distEmpSet.value;
        if (!currentCycle.value) return [];
        return data.performanceReviews.filter((r) =>
          r.cycleId === currentCycle.value.id && set.has(r.employeeId),
        );
      });

      const statusCards = computed(() => {
        const rv = teamReviewsCurrentCycle.value;
        return [
          { key: 'rm_pending', label: '待 RM 评估', count: rv.filter((r) => r.status === 'rm_pending').length },
          { key: 'in_approval', label: '审批中', count: rv.filter((r) => r.status === 'in_approval').length },
          { key: 'pl_approved', label: '待校准', count: rv.filter((r) => r.status === 'pl_approved').length },
          { key: 'calibrated', label: '已校准', count: rv.filter((r) => r.status === 'calibrated').length },
          { key: 'finalized', label: '已归档', count: rv.filter((r) => r.status === 'finalized').length },
        ];
      });

      const distGradeDist = computed(() => {
        const m = {};
        gradeOptions.forEach((g) => { m[g] = 0; });
        teamReviewsCurrentCycle.value
          .filter((r) => ((r.status === 'finalized' || r.status === 'calibrated') && r.finalGrade) || (r.status !== 'rm_pending' && r.rmInitialGrade))
          .forEach((r) => {
            const g = String((r.status === 'finalized' || r.status === 'calibrated') ? r.finalGrade : r.rmInitialGrade).trim();
            if (m[g] != null) m[g]++;
          });
        return m;
      });

      const aSumCount = computed(() => {
        const d = distGradeDist.value;
        return (d['A+'] || 0) + (d['A'] || 0) + (d['A-'] || 0);
      });
      const aSumPct = computed(() => {
        const total = Object.values(distGradeDist.value).reduce((a, b) => a + b, 0);
        if (!total) return null;
        return ((aSumCount.value / total) * 100).toFixed(1);
      });

      const distChartRef = ref(null);
      let distChart = null;

      async function drawDistChart() {
        const ec = await loadEcharts();
        if (!distChartRef.value) return;
        if (distChart && distChart.getDom() !== distChartRef.value) {
          distChart.dispose();
          distChart = null;
        }
        if (!distChart) distChart = ec.init(distChartRef.value);
        const g = distGradeDist.value;
        const total = Object.values(g).reduce((a, b) => a + b, 0);
        const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#3b82f6', '#8b5cf6'];
        if (!total) {
          distChart.setOption({ title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#94a3b8', fontSize: 14, fontWeight: 400 } }, xAxis: { show: false }, yAxis: { show: false }, series: [] }, true);
          return;
        }
        distChart.setOption({
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: 40, right: 20, top: 24, bottom: 28 },
          xAxis: { type: 'category', data: gradeOptions, axisLabel: { color: '#64748b', fontWeight: 600 } },
          yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed' } } },
          series: [{
            type: 'bar', name: '人数',
            data: gradeOptions.map((k, i) => ({
              value: g[k] || 0,
              itemStyle: { color: colors[i], borderRadius: [6, 6, 0, 0] },
            })),
            barMaxWidth: 40,
            label: {
              show: true, position: 'top', fontSize: 11, fontWeight: 600,
              formatter: (p) => {
                if (!p.value) return '';
                const pct = total ? ((p.value / total) * 100).toFixed(0) : '0';
                return `${p.value} (${pct}%)`;
              },
            },
          }],
        }, true);
      }

      let _distTimer = null;
      function scheduleDist() {
        if (_distTimer) clearTimeout(_distTimer);
        _distTimer = setTimeout(() => { _distTimer = null; drawDistChart(); }, 200);
      }

      onMounted(() => { nextTick(() => drawDistChart()); window.addEventListener('resize', scheduleDist); });
      onUnmounted(() => { distChart?.dispose(); window.removeEventListener('resize', scheduleDist); });
      watch([distGradeDist, distRoot], () => { scheduleDist(); });
      watch(tab, (v) => { if (v === 'eval') nextTick(() => drawDistChart()); });

      /* ── canApproveAll: all subordinate evaluations/approvals done before I can approve ── */
      const canApproveAll = computed(() => {
        if (!currentCycle.value || !me.value) return true;
        const sub = subtreeIds.value;
        return !data.performanceReviews.some((r) => {
          if (r.cycleId !== currentCycle.value.id) return false;
          if (!sub.has(r.employeeId)) return false;
          if (r.status === 'rm_pending') return true;
          if (r.status === 'in_approval') {
            const pa = Number(r.pendingApproverId);
            return pa !== Number(me.value) && sub.has(pa);
          }
          return false;
        });
      });

      /* ── My tasks ── */
      const todoList = computed(() => {
        const m = me.value;
        if (!m) return [];
        const out = [];
        data.performanceReviews.forEach((r) => {
          if (r.status === 'rm_pending' && Number(r.pendingApproverId) === Number(m)
            && Number(r.reviewerId) === Number(m) && directIds.value.has(r.employeeId)) {
            out.push(r);
          }
          if (r.status === 'in_approval' && Number(r.pendingApproverId) === Number(m)) {
            out.push(r);
          }
        });
        return out;
      });

      /* ── Subordinate pending (for urge + proxy) ── */
      const subordinatePending = computed(() => {
        const m = me.value;
        if (!m || !currentCycle.value) return [];
        const directSubs = data.employees.filter((e) => e.managerId === m && e.status !== 'leave');
        return directSubs.map((rm) => {
          const rmSubtree = TM.collectSubtreeEmployeeIds(data, rm.id);
          const reviews = data.performanceReviews.filter((r) => {
            if (r.cycleId !== currentCycle.value.id) return false;
            if (!rmSubtree.has(r.employeeId) && r.employeeId !== rm.id) return false;
            if (r.status === 'rm_pending') return true;
            if (r.status === 'in_approval') {
              const pa = Number(r.pendingApproverId);
              return pa !== Number(m);
            }
            return false;
          });
          const emp = data._empMap.get(rm.id);
          return {
            rm,
            email: emp?.email || `${rm.name}@company.com`,
            reviews,
            total: reviews.length,
          };
        }).filter((x) => x.total > 0);
      });

      /* ── Urge subordinate ── */
      function urgeSubordinate(sub) {
        const today = new Date().toISOString().slice(0, 10);
        const nid = () => (data.notifications || []).reduce((m, n) => Math.max(m, n.id || 0), 0) + 1;
        const evalList = sub.reviews.filter((r) => r.status === 'rm_pending');
        const apprList = sub.reviews.filter((r) => r.status === 'in_approval');
        const lines = [];
        if (evalList.length) {
          lines.push(`【待评估】${evalList.length} 人: ${evalList.map((r) => empName(r.employeeId)).join('、')}`);
        }
        if (apprList.length) {
          lines.push(`【待审批】${apprList.length} 人: ${apprList.map((r) => empName(r.employeeId)).join('、')}`);
        }
        data.notifications.push({
          id: nid(), employeeId: sub.rm.id,
          title: '绩效催促',
          message: `您的上级 ${empName(me.value)} 催促您尽快完成以下绩效待办：\n${lines.join('\n')}\n（催促邮件已发送至 ${sub.email}）`,
          read: false, createdAt: today,
        });
        data.persistKeys('notifications');
        window.dispatchEvent(new CustomEvent('tm-toast', {
          detail: { message: `催促邮件已发送至 ${sub.email}`, type: 'success' },
        }));
      }

      /* ── RM Evaluation Modal ── */
      const rmModal = ref(false);
      const rmTarget = ref(null);
      const rmForm = ref({ rmInitialGrade: 'B', rmComment: '', outputDescription: '', devAdvice: '' });

      const apprModal = ref(false);
      const apprTarget = ref(null);
      const apprNote = ref('');
      const apprGrade = ref('B');

      function openTask(r) {
        if (r.status === 'rm_pending' && Number(r.reviewerId) === Number(me.value)) {
          rmTarget.value = r;
          rmForm.value = {
            rmInitialGrade: gradeOptions.includes(String(r.rmInitialGrade).trim()) ? String(r.rmInitialGrade).trim() : 'B',
            rmComment: r.rmComment || '',
            outputDescription: r.outputDescription || '',
            devAdvice: r.devAdvice || '',
          };
          rmModal.value = true;
          return;
        }
        if (r.status === 'in_approval') {
          apprTarget.value = r;
          apprGrade.value = gradeOptions.includes(String(r.rmInitialGrade).trim()) ? String(r.rmInitialGrade).trim() : 'B';
          apprNote.value = '';
          apprModal.value = true;
        }
      }

      function submitRm() {
        const r = rmTarget.value;
        if (!r) return;
        const payload = {
          rmInitialGrade: rmForm.value.rmInitialGrade,
          rmComment: rmForm.value.rmComment,
          outputDescription: rmForm.value.outputDescription,
          devAdvice: rmForm.value.devAdvice,
          historyPerformance: r.historyPerformance || '',
          prevCycleAvgHours: r.prevCycleAvgHours,
          comments: r.comments || '',
        };
        if (data.submitRmPerformanceReview(r.id, payload, { actorId: me.value })) {
          rmModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已提交审批', type: 'success' } }));
        } else {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '提交失败', type: 'error' } }));
        }
      }

      function doApprove() {
        const r = apprTarget.value;
        if (!r || !me.value) return;
        if (data.approvePerformanceReview(r.id, me.value, apprNote.value, apprGrade.value)) {
          apprModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已通过', type: 'success' } }));
        }
      }
      function doReject() {
        const r = apprTarget.value;
        if (!r || !me.value) return;
        const chain = r.approvalChain || [];
        const pendingId = Number(r.pendingApproverId);
        const idx = chain.indexOf(pendingId);
        const targetLabel = idx > 0
          ? empName(chain[idx - 1])
          : empName(r.reviewerId) + '（RM）';
        if (!confirm(`确认驳回？将退回至「${targetLabel}」进行校准。`)) return;
        if (data.rejectPerformanceReview(r.id, me.value, apprNote.value)) {
          apprModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已驳回至下级', type: 'info' } }));
        }
      }

      /* ── Batch approve ── */
      const batchApproveCount = computed(() =>
        todoList.value.filter((r) => r.status === 'in_approval' && Number(r.pendingApproverId) === Number(me.value)).length,
      );
      function batchApprove() {
        if (!canApproveAll.value) return;
        const targets = todoList.value.filter(
          (r) => r.status === 'in_approval' && Number(r.pendingApproverId) === Number(me.value),
        );
        if (!targets.length) return;
        if (!confirm(`确认一键审批 ${targets.length} 条记录？\n将以当前建议等级直接通过。`)) return;
        let ok = 0;
        targets.forEach((r) => {
          if (data.approvePerformanceReview(r.id, me.value, '一键审批通过', r.rmInitialGrade)) ok++;
        });
        window.dispatchEvent(new CustomEvent('tm-toast', {
          detail: { message: `已审批通过 ${ok}/${targets.length} 条`, type: ok ? 'success' : 'error' },
        }));
      }

      /* ── Proxy evaluation (for subordinate's tasks) ── */
      const proxyEvalModal = ref(false);
      const proxyEvalTarget = ref(null);
      const proxyEvalForm = ref({ rmInitialGrade: 'B', rmComment: '', outputDescription: '' });
      function openProxyEval(r) {
        proxyEvalTarget.value = r;
        proxyEvalForm.value = {
          rmInitialGrade: gradeOptions.includes(String(r.rmInitialGrade || '').trim()) ? String(r.rmInitialGrade).trim() : 'B',
          rmComment: r.rmComment || '',
          outputDescription: r.outputDescription || '',
        };
        proxyEvalModal.value = true;
      }
      function submitProxyEval() {
        const r = proxyEvalTarget.value;
        if (!r) return;
        const payload = {
          rmInitialGrade: proxyEvalForm.value.rmInitialGrade,
          rmComment: proxyEvalForm.value.rmComment,
          outputDescription: proxyEvalForm.value.outputDescription,
          devAdvice: '',
          historyPerformance: r.historyPerformance || '',
          prevCycleAvgHours: r.prevCycleAvgHours,
          comments: r.comments || '',
        };
        if (data.submitRmPerformanceReview(r.id, payload, { actorId: me.value })) {
          proxyEvalModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已代替 RM 提交评估', type: 'success' } }));
        } else {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '提交失败', type: 'error' } }));
        }
      }

      /* ── Proxy approval (for subordinate's tasks) ── */
      const proxyApprModal = ref(false);
      const proxyApprTarget = ref(null);
      const proxyApprGrade = ref('B');
      const proxyApprNote = ref('');
      function openProxyApproval(r) {
        proxyApprTarget.value = r;
        proxyApprGrade.value = gradeOptions.includes(String(r.rmInitialGrade || '').trim()) ? String(r.rmInitialGrade).trim() : 'B';
        proxyApprNote.value = '';
        proxyApprModal.value = true;
      }
      function doProxyApprove() {
        const r = proxyApprTarget.value;
        if (!r) return;
        if (data.approvePerformanceReview(r.id, me.value, proxyApprNote.value, proxyApprGrade.value)) {
          proxyApprModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已代替审批通过', type: 'success' } }));
        }
      }
      function doProxyReject() {
        const r = proxyApprTarget.value;
        if (!r) return;
        if (!confirm('确认驳回至下级？')) return;
        if (data.rejectPerformanceReview(r.id, me.value, proxyApprNote.value)) {
          proxyApprModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已驳回', type: 'info' } }));
        }
      }

      /* ── Communication ── */
      const commDirectList = computed(() => {
        const m = me.value;
        if (!m) return [];
        return data.performanceReviews.filter((r) =>
          r.status === 'finalized' && directIds.value.has(r.employeeId)
          && currentCycle.value && r.cycleId === currentCycle.value.id,
        );
      });

      const commTaskModal = ref(false);
      const commTaskTarget = ref(null);
      const commTaskNotes = ref('');
      function openCommTask(r) {
        commTaskTarget.value = r;
        commTaskNotes.value = r.communicationNotes || '';
        commTaskModal.value = true;
      }
      function doCommTask() {
        if (!commTaskTarget.value) return;
        if (data.recordCommunication(commTaskTarget.value.id, commTaskNotes.value)) {
          commTaskModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '沟通记录已保存', type: 'success' } }));
        }
      }

      /* ── History Tab ── */
      const histCycleId = ref(0);
      const historyFiltered = computed(() => {
        const set = subtreeIds.value;
        let list = data.performanceReviews.filter((r) => set.has(r.employeeId));
        if (histCycleId.value) list = list.filter((r) => r.cycleId === histCycleId.value);
        return [...list].sort((a, b) => TM.reviewSortStamp(data, b).localeCompare(TM.reviewSortStamp(data, a)));
      });

      return {
        auth,
        tab, me, gradeOptions, allCycles, currentCycle,
        cycleTypeLabel, cycleLabel, statusLabel, empName, todoKind,
        distRoot, subMgrOptions, distChartRef, statusCards, teamReviewsCurrentCycle, aSumCount, aSumPct,
        canApproveAll,
        todoList, openTask,
        rmModal, rmTarget, rmForm, submitRm,
        apprModal, apprTarget, apprNote, apprGrade, doApprove, doReject,
        batchApproveCount, batchApprove,
        subordinatePending, urgeSubordinate,
        proxyEvalModal, proxyEvalTarget, proxyEvalForm, openProxyEval, submitProxyEval,
        proxyApprModal, proxyApprTarget, proxyApprGrade, proxyApprNote, openProxyApproval, doProxyApprove, doProxyReject,
        commDirectList, commTaskModal, commTaskTarget, commTaskNotes, openCommTask, doCommTask,
        histCycleId, historyFiltered,
      };
    },
  };
})();
