(function () {
  const { computed, onMounted, onUnmounted, ref, watch, nextTick } = Vue;
  const useDataStore = window.TM.useDataStore;
  const useAuthStore = window.TM.useAuthStore;
  const useHrScopeStore = window.TM.useHrScopeStore;
  const createOrgScopeBindings = window.TM.createOrgScopeBindings;
  const loadEcharts = window.TM.loadEcharts;
  const TM = window.TM;

  window.TM.HrbpPerformance = {
    name: 'HrbpPerformance',
    template: `
    <div class="page-stack">
      <div class="recruit-tabs">
        <button type="button" :class="['btn','btn-sm', tab==='eval'?'btn-primary':'btn-ghost']" @click="tab='eval'">
          <i class="fa-solid fa-scale-balanced"></i> 评估与校准
          <span v-if="pendingCalibrationCount" class="perf-badge">{{ pendingCalibrationCount }}</span>
        </button>
        <button type="button" :class="['btn','btn-sm', tab==='communication'?'btn-primary':'btn-ghost']" @click="tab='communication'">
          <i class="fa-solid fa-comments"></i> 沟通与申诉
        </button>
        <button type="button" :class="['btn','btn-sm', tab==='cycles'?'btn-primary':'btn-ghost']" @click="tab='cycles'">
          <i class="fa-solid fa-calendar-days"></i> 绩效周期
        </button>
      </div>

      <!-- ===== Tab 1: Evaluation & Calibration (merged) ===== -->
      <template v-if="tab==='eval'">
        <!-- Filter bar -->
        <div class="card pad org-scope-bar">
          <div class="org-scope-row" style="flex-wrap:wrap;gap:10px;align-items:flex-end">
            <label class="field inline org-scope-select">
              <span><i class="fa-solid fa-sitemap"></i> 组织范围</span>
              <select v-model.number="scopeRootDeptUi" class="input">
                <option :value="0">全产品线</option>
                <option v-for="opt in deptScopeOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
              </select>
            </label>
            <label class="field inline">
              <span>Reporting Manager</span>
              <select v-model.number="rmFilter" class="input">
                <option :value="0">全部 RM</option>
                <option v-for="rm in rmOptions" :key="rm.id" :value="rm.id">{{ rm.name }}</option>
              </select>
            </label>
            <label class="field inline">
              <span>绩效周期</span>
              <select v-model.number="evalCycleId" class="input">
                <option v-for="c in allCycles" :key="c.id" :value="c.id">{{ c.name }} ({{ cycleTypeLabel(c) }})</option>
              </select>
            </label>
            <label class="field inline">
              <span>职级</span>
              <select v-model="levelFilter" class="input">
                <option value="">全部职级</option>
                <option v-for="lv in levelOptions" :key="lv" :value="lv">{{ lv }}</option>
              </select>
            </label>
            <label class="field inline">
              <span>状态</span>
              <select v-model="evalStatusFilter" class="input">
                <option value="">全部</option>
                <option v-for="(lbl,key) in statusLabels" :key="key" :value="key">{{ lbl }}</option>
              </select>
            </label>
          </div>
        </div>

        <!-- Grade distribution chart + status cards row -->
        <div class="perf-overview-row">
          <div class="card pad" style="flex:2;min-width:0">
            <h3 class="section-title">绩效等级分布</h3>
            <p class="muted small">{{ evalSummary }}</p>
            <div ref="evalChartRef" class="chart-box" style="height:260px"></div>
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
            <div style="margin-top:auto;display:flex;flex-direction:column;gap:6px">
              <button type="button" class="btn btn-secondary btn-sm" style="width:100%" @click="remindEval"
                :disabled="remindEvalCount===0">
                <i class="fa-solid fa-bell"></i> 催促评估 ({{ remindEvalCount }})
              </button>
              <button type="button" class="btn btn-secondary btn-sm" style="width:100%" @click="remindCalibration"
                :disabled="remindCalCount===0">
                <i class="fa-solid fa-bell"></i> 催促校准 ({{ remindCalCount }})
              </button>
              <button type="button" class="btn btn-primary btn-sm" style="width:100%" @click="batchCalibrate"
                :disabled="batchCalCount===0">
                <i class="fa-solid fa-check-double"></i> 一键校准 ({{ batchCalCount }})
              </button>
              <button type="button" class="btn btn-sm" style="width:100%"
                :class="canArchive ? 'btn-primary' : 'btn-ghost'"
                :disabled="!canArchive" @click="doArchive">
                <i class="fa-solid fa-box-archive"></i> 归档周期
                <span v-if="archiveHint" class="muted small" style="display:block;font-size:11px">{{ archiveHint }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Evaluation table -->
        <div class="card pad">
          <h3 class="section-title">评估列表 <span class="muted small">({{ evalRows.length }} 条)</span></h3>
          <div style="overflow-x:auto">
            <table class="data-table compact">
              <thead><tr>
                <th>员工</th><th>部门</th><th>RM</th><th>RM 评估</th><th>绩效评语</th><th>状态</th><th>最终等级</th><th>操作</th>
              </tr></thead>
              <tbody>
                <tr v-for="r in evalRows" :key="r.id">
                  <td>{{ empName(r.employeeId) }}</td>
                  <td>{{ empDept(r.employeeId) }}</td>
                  <td>{{ empName(r.reviewerId) }}</td>
                  <td>{{ r.rmInitialGrade || '—' }}</td>
                  <td class="cell-clip" style="max-width:180px" :title="r.rmComment||''">{{ r.rmComment || '—' }}</td>
                  <td><span class="tag" :class="'perf-st-'+r.status">{{ statusLabel(r.status) }}</span></td>
                  <td><strong>{{ (r.status==='calibrated'||r.status==='finalized') ? (r.finalGrade||'—') : '—' }}</strong></td>
                  <td class="row-actions">
                    <button type="button" class="btn-link" @click="openDetail(r)">详情</button>
                    <button v-if="r.status==='rm_pending'" type="button" class="btn btn-xs btn-secondary" @click="openProxyEval(r)">代评估</button>
                    <button v-if="r.status==='in_approval'" type="button" class="btn btn-xs btn-secondary" @click="openProxyApproval(r)">代审批</button>
                    <button v-if="r.status==='pl_approved'" type="button" class="btn btn-primary btn-xs" @click="openCalibrate(r)">校准</button>
                    <button v-if="r.status==='calibrated'" type="button" class="btn-link" @click="openAdjust(r)">调整等级</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ===== Tab 2: Communication ===== -->
      <template v-if="tab==='communication'">
        <div class="card pad">
          <h3 class="section-title">绩效沟通与申诉</h3>
          <p class="muted small">已归档的绩效记录。RM 可记录沟通内容；沟通后 3 天内员工可提起申诉。</p>
          <label class="field inline" style="margin-bottom:12px">
            <span>绩效周期</span>
            <select v-model.number="commCycleId" class="input">
              <option v-for="c in allCycles" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <div style="overflow-x:auto">
            <table class="data-table compact">
              <thead><tr>
                <th>员工</th><th>最终等级</th><th>沟通时间</th><th>申诉截止</th><th>沟通记录</th><th>操作</th>
              </tr></thead>
              <tbody>
                <tr v-for="r in commRows" :key="r.id">
                  <td>{{ empName(r.employeeId) }}</td>
                  <td><strong>{{ r.finalGrade || '—' }}</strong></td>
                  <td>{{ r.communicatedAt || '未沟通' }}</td>
                  <td>{{ r.appealDeadline || '—' }}</td>
                  <td class="cell-clip" style="max-width:200px">{{ r.communicationNotes || '—' }}</td>
                  <td class="row-actions">
                    <button type="button" class="btn-link" @click="openCommModal(r)">{{ r.communicatedAt ? '编辑沟通' : '记录沟通' }}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ===== Tab 3: Cycles ===== -->
      <template v-if="tab==='cycles'">
        <div class="card pad">
          <h3 class="section-title">绩效周期管理</h3>
          <table class="data-table compact">
            <thead><tr><th>名称</th><th>类型</th><th>期间</th><th>状态</th><th></th></tr></thead>
            <tbody>
              <tr v-for="c in allCycles" :key="c.id">
                <td>{{ c.name }}</td>
                <td>{{ cycleTypeLabel(c) }}</td>
                <td>{{ c.startDate }} ~ {{ c.endDate }}</td>
                <td><span class="tag" :class="c.status==='open'?'tag-active':'tag-muted'">{{ c.status==='open'?'进行中':'已关闭' }}</span></td>
                <td><button type="button" class="btn-link" @click="editCycle(c)">编辑</button></td>
              </tr>
            </tbody>
          </table>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:12px" @click="openCycleCreate">新增周期</button>
        </div>
      </template>

      <!-- ===== Modals ===== -->
      <!-- Detail -->
      <div v-if="detailRow" class="modal-backdrop" @click.self="detailRow=null">
        <div class="modal card wide">
          <h3>评估详情 · {{ empName(detailRow.employeeId) }}</h3>
          <div class="kv-grid" style="margin-bottom:12px">
            <div><span class="muted">周期</span><div>{{ cycleLabel(detailRow) }}</div></div>
            <div><span class="muted">状态</span><div><span class="tag" :class="'perf-st-'+detailRow.status">{{ statusLabel(detailRow.status) }}</span></div></div>
            <div><span class="muted">RM 评估</span><div>{{ detailRow.rmInitialGrade || '—' }}</div></div>
            <div><span class="muted">最终等级</span><div><strong>{{ (detailRow.status==='calibrated'||detailRow.status==='finalized') ? (detailRow.finalGrade||'—') : '—' }}</strong></div></div>
            <div class="full"><span class="muted">RM 评语（绩效评语）</span><div>{{ detailRow.rmComment || '—' }}</div></div>
            <div class="full"><span class="muted">产出说明</span><div>{{ detailRow.outputDescription || '—' }}</div></div>
            <div class="full"><span class="muted">沟通记录</span><div>{{ detailRow.communicationNotes || '—' }}</div></div>
            <div><span class="muted">沟通时间</span><div>{{ detailRow.communicatedAt || '—' }}</div></div>
            <div><span class="muted">申诉截止</span><div>{{ detailRow.appealDeadline || '—' }}</div></div>
            <div><span class="muted">校准人</span><div>{{ detailRow.calibratedBy ? empName(detailRow.calibratedBy) : '—' }}</div></div>
            <div class="full"><span class="muted">审批日志</span>
              <ul class="muted small" style="margin:4px 0;padding-left:1.2rem">
                <li v-for="(log,i) in (detailRow.approvalLog||[])" :key="i">
                  {{ log.at }} · {{ empName(log.approverId) }} · {{ log.action }}{{ log.note ? ': '+log.note : '' }}
                </li>
                <li v-if="!(detailRow.approvalLog||[]).length">—</li>
              </ul>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="detailRow=null">关闭</button>
          </div>
        </div>
      </div>

      <!-- HRBP proxy evaluation modal -->
      <div v-if="proxyEvalModal" class="modal-backdrop" @click.self="proxyEvalModal=false">
        <div class="modal card wide">
          <h3>HRBP 代评估 · {{ empName(proxyEvalTarget.employeeId) }} · {{ cycleLabel(proxyEvalTarget) }}</h3>
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
            <label class="field full"><span>发展建议</span>
              <textarea v-model="proxyEvalForm.devAdvice" rows="2" placeholder="可选"></textarea>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="proxyEvalModal=false">取消</button>
              <button type="submit" class="btn btn-primary">提交至审批</button>
            </div>
          </form>
        </div>
      </div>

      <!-- HRBP proxy approval modal -->
      <div v-if="proxyApprModal" class="modal-backdrop" @click.self="proxyApprModal=false">
        <div class="modal card wide">
          <h3>HRBP 代审批 · {{ empName(proxyApprTarget.employeeId) }}</h3>
          <div class="kv-grid" style="margin-bottom:12px">
            <div><span class="muted">当前建议等级</span><div><strong>{{ proxyApprTarget.rmInitialGrade }}</strong></div></div>
            <div><span class="muted">待审批人</span><div>{{ empName(proxyApprTarget.pendingApproverId) }}</div></div>
            <div class="full"><span class="muted">绩效评语</span><div>{{ proxyApprTarget.rmComment || '—' }}</div></div>
            <div class="full"><span class="muted">产出说明</span><div class="cell-clip">{{ proxyApprTarget.outputDescription || '—' }}</div></div>
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
            <button type="button" class="btn btn-secondary" @click="doProxyReject"><i class="fa-solid fa-arrow-rotate-left"></i> 驳回至下级</button>
            <button type="button" class="btn btn-primary" @click="doProxyApprove"><i class="fa-solid fa-check"></i> 通过</button>
          </div>
        </div>
      </div>

      <!-- Calibration modal -->
      <div v-if="calModal" class="modal-backdrop" @click.self="calModal=false">
        <div class="modal card">
          <h3>HRBP 校准 · {{ empName(calTarget.employeeId) }}</h3>
          <p class="muted small">RM 建议等级: <strong>{{ calTarget.rmInitialGrade }}</strong></p>
          <form class="form-grid" @submit.prevent="doCalibrate">
            <label class="field"><span>校准等级</span>
              <select v-model="calGrade" class="input" required>
                <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="calModal=false">取消</button>
              <button type="submit" class="btn btn-primary">确认校准</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Adjust grade modal (calibrated only) -->
      <div v-if="adjustModal" class="modal-backdrop" @click.self="adjustModal=false">
        <div class="modal card">
          <h3>调整等级 · {{ empName(adjustTarget.employeeId) }}</h3>
          <p class="muted small">当前等级: <strong>{{ adjustTarget.finalGrade }}</strong>（归档前可调整）</p>
          <form class="form-grid" @submit.prevent="doAdjust">
            <label class="field"><span>新等级</span>
              <select v-model="adjustGrade" class="input" required>
                <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="adjustModal=false">取消</button>
              <button type="submit" class="btn btn-primary">保存</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Communication modal -->
      <div v-if="commModal" class="modal-backdrop" @click.self="commModal=false">
        <div class="modal card">
          <h3>绩效沟通 · {{ empName(commTarget.employeeId) }}</h3>
          <form class="form-grid" @submit.prevent="doComm">
            <label class="field full"><span>沟通记录</span>
              <textarea v-model="commNotes" rows="4" placeholder="记录沟通关键信息…" required></textarea>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="commModal=false">取消</button>
              <button type="submit" class="btn btn-primary">保存沟通</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Cycle modal -->
      <div v-if="cycleModal" class="modal-backdrop" @click.self="cycleModal=false">
        <div class="modal card">
          <h3>{{ cycleForm.id ? '编辑周期' : '新增周期' }}</h3>
          <form class="form-grid" @submit.prevent="saveCycle">
            <label class="field"><span>名称</span><input v-model="cycleForm.name" required /></label>
            <label class="field"><span>类型</span>
              <select v-model="cycleForm.cycleType" class="input">
                <option value="half_year">半年绩效</option>
                <option value="year">年度绩效</option>
              </select>
            </label>
            <label class="field"><span>开始</span><input v-model="cycleForm.startDate" type="date" required /></label>
            <label class="field"><span>结束</span><input v-model="cycleForm.endDate" type="date" required /></label>
            <label class="field"><span>状态</span>
              <select v-model="cycleForm.status"><option value="open">进行中</option><option value="closed">已关闭</option></select>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="cycleModal=false">取消</button>
              <button type="submit" class="btn btn-primary">保存</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
    setup() {
      const data = useDataStore();
      const auth = useAuthStore();
      const hrScope = useHrScopeStore();
      const _orgScope = createOrgScopeBindings(data, hrScope);
      const { scopeRootDeptUi, deptScopeOptions, scopeHint } = _orgScope;
      const _zs = window.TM.useZoneScope(data);
      function employeeInScope(emp) {
        if (!_zs.employeeInTeam(emp)) return false;
        return _orgScope.employeeInScope(emp);
      }
      const gradeOptions = TM.PERF_GRADE_OPTIONS;
      const statusLabels = TM.PERF_STATUS_LABEL;

      const tab = ref('eval');

      const allCycles = computed(() =>
        [...(data.performanceCycles || [])].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))),
      );
      const currentCycle = computed(() => allCycles.value.find((c) => c.status === 'open') || allCycles.value[0] || null);

      function empName(id) { return data._empMap.get(id)?.name || id; }
      function empDept(eid) {
        const e = data._empMap.get(eid);
        return e ? (data._deptMap.get(e.departmentId)?.name || '—') : '—';
      }
      function cycleTypeLabel(c) { return TM.PERF_CYCLE_TYPE_LABEL[c?.cycleType] || '半年绩效'; }
      function cycleLabel(r) { return TM.reviewCycleLabel(data, r); }
      function statusLabel(s) { return TM.PERF_STATUS_LABEL[s] || s; }

      function reviewsInScope(cycleId) {
        const empMap = data._empMap;
        return data.performanceReviews.filter((r) => {
          if (r.cycleId !== cycleId) return false;
          const emp = empMap.get(r.employeeId);
          return emp && employeeInScope(emp);
        });
      }

      /* ── Merged: Evaluation & Calibration tab ── */
      const evalCycleId = ref(null);
      watch(currentCycle, (c) => { if (c && evalCycleId.value == null) evalCycleId.value = c.id; }, { immediate: true });
      const evalStatusFilter = ref('');
      const rmFilter = ref(0);
      const levelFilter = ref('');

      function empLevel(eid) {
        const e = data._empMap.get(eid);
        if (!e) return '';
        const pos = data._posMap.get(e.positionId);
        return pos ? String(pos.level || '').trim() : '';
      }

      const scopedReviews = computed(() => reviewsInScope(evalCycleId.value));

      const levelOptions = computed(() => {
        const set = new Set();
        scopedReviews.value.forEach((r) => {
          const lv = empLevel(r.employeeId);
          if (lv) set.add(lv);
        });
        return [...set].sort();
      });

      const rmOptions = computed(() => {
        const ids = new Set(scopedReviews.value.map((r) => r.reviewerId));
        const out = [];
        ids.forEach((id) => {
          const e = data._empMap.get(id);
          if (e) out.push({ id: e.id, name: e.name });
        });
        return out.sort((a, b) => a.name.localeCompare(b.name));
      });

      const filteredBase = computed(() => {
        let list = scopedReviews.value;
        if (rmFilter.value) list = list.filter((r) => Number(r.reviewerId) === rmFilter.value);
        if (levelFilter.value) list = list.filter((r) => empLevel(r.employeeId) === levelFilter.value);
        return list;
      });

      const evalRows = computed(() => {
        let list = filteredBase.value;
        if (evalStatusFilter.value) list = list.filter((r) => r.status === evalStatusFilter.value);
        return list;
      });

      const evalDist = computed(() => {
        const m = {};
        gradeOptions.forEach((g) => { m[g] = 0; });
        filteredBase.value
          .filter((r) => ((r.status === 'finalized' || r.status === 'calibrated') && r.finalGrade) || (r.status !== 'rm_pending' && r.rmInitialGrade))
          .forEach((r) => {
            const g = String((r.status === 'finalized' || r.status === 'calibrated') ? r.finalGrade : r.rmInitialGrade).trim();
            if (m[g] != null) m[g]++;
          });
        return m;
      });

      const aSumCount = computed(() => {
        const d = evalDist.value;
        return (d['A+'] || 0) + (d['A'] || 0) + (d['A-'] || 0);
      });
      const aSumPct = computed(() => {
        const total = Object.values(evalDist.value).reduce((a, b) => a + b, 0);
        if (!total) return null;
        return ((aSumCount.value / total) * 100).toFixed(1);
      });

      const evalSummary = computed(() => {
        const total = filteredBase.value.length;
        const calibrated = filteredBase.value.filter((r) => r.status === 'calibrated').length;
        const finalized = filteredBase.value.filter((r) => r.status === 'finalized').length;
        return `共 ${total} 条评估记录，${calibrated} 条已校准，${finalized} 条已归档`;
      });

      const statusCards = computed(() => {
        const base = filteredBase.value;
        return [
          { key: 'rm_pending', label: '待 RM 评估', count: base.filter((r) => r.status === 'rm_pending').length },
          { key: 'in_approval', label: '审批中', count: base.filter((r) => r.status === 'in_approval').length },
          { key: 'pl_approved', label: '待校准', count: base.filter((r) => r.status === 'pl_approved').length },
          { key: 'calibrated', label: '已校准', count: base.filter((r) => r.status === 'calibrated').length },
          { key: 'finalized', label: '已归档', count: base.filter((r) => r.status === 'finalized').length },
        ];
      });

      const pendingCalibrationCount = computed(() =>
        (currentCycle.value ? reviewsInScope(currentCycle.value.id) : []).filter((r) => r.status === 'pl_approved').length,
      );

      /* ── Archive ── */
      const canArchive = computed(() => {
        if (!evalCycleId.value) return false;
        const reviews = data.performanceReviews.filter((r) => r.cycleId === evalCycleId.value);
        if (!reviews.length) return false;
        return reviews.every((r) => r.status === 'calibrated' || r.status === 'finalized');
      });
      const archiveHint = computed(() => {
        if (!evalCycleId.value) return '';
        const reviews = data.performanceReviews.filter((r) => r.cycleId === evalCycleId.value);
        if (!reviews.length) return '无评估记录';
        const notReady = reviews.filter((r) => r.status !== 'calibrated' && r.status !== 'finalized');
        if (!notReady.length) return '';
        return `还有 ${notReady.length} 条未完成校准`;
      });
      function doArchive() {
        if (!canArchive.value || !evalCycleId.value) return;
        const reviews = data.performanceReviews.filter((r) => r.cycleId === evalCycleId.value && r.status === 'calibrated');
        if (!confirm(`确认归档？共 ${reviews.length} 条已校准记录将被归档。\n归档后绩效等级将锁定，任何人不可修改。`)) return;
        if (data.archiveCycleReviews(evalCycleId.value)) {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: `已归档 ${reviews.length} 条绩效记录`, type: 'success' } }));
        }
      }

      /* ── Chart ── */
      const evalChartRef = ref(null);
      let evalChart = null;

      async function drawEvalChart() {
        const ec = await loadEcharts();
        if (!evalChartRef.value) return;
        if (evalChart && evalChart.getDom() !== evalChartRef.value) {
          evalChart.dispose();
          evalChart = null;
        }
        if (!evalChart) evalChart = ec.init(evalChartRef.value);
        const g = evalDist.value;
        const total = Object.values(g).reduce((a, b) => a + b, 0);
        if (!total) {
          evalChart.setOption({
            title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#94a3b8', fontSize: 14, fontWeight: 400 } },
            xAxis: { show: false }, yAxis: { show: false }, series: [],
          }, true);
          return;
        }
        const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#3b82f6', '#8b5cf6'];
        evalChart.setOption({
          title: { show: false },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: 40, right: 20, top: 30, bottom: 30 },
          xAxis: { show: true, type: 'category', data: gradeOptions, axisLabel: { color: '#64748b', fontWeight: 600 } },
          yAxis: { show: true, type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dashed' } } },
          series: [{
            type: 'bar', name: '人数',
            data: gradeOptions.map((k, i) => ({
              value: g[k] || 0,
              itemStyle: { color: colors[i], borderRadius: [6, 6, 0, 0] },
            })),
            label: {
              show: true, position: 'top', fontSize: 12, fontWeight: 600,
              formatter: (p) => {
                if (!p.value) return '';
                const pct = total ? ((p.value / total) * 100).toFixed(1) : '0';
                return `${p.value}\n${pct}%`;
              },
            },
            barMaxWidth: 50,
          }],
        }, true);
      }

      let _chartTimer = null;
      function scheduleChartDraw() {
        if (_chartTimer) clearTimeout(_chartTimer);
        _chartTimer = setTimeout(() => { _chartTimer = null; drawEvalChart(); }, 200);
      }

      onMounted(() => {
        nextTick(() => drawEvalChart());
        window.addEventListener('resize', scheduleChartDraw);
      });
      onUnmounted(() => { evalChart?.dispose(); window.removeEventListener('resize', scheduleChartDraw); });
      watch([evalDist, () => hrScope.scopeRootDepartmentId, evalCycleId, rmFilter, levelFilter], () => { scheduleChartDraw(); });
      watch(tab, (v) => { if (v === 'eval') nextTick(() => drawEvalChart()); });

      /* ── Remind: evaluation (rm_pending + in_approval) ── */
      const remindEvalCount = computed(() =>
        scopedReviews.value.filter((r) => r.status === 'rm_pending' || r.status === 'in_approval').length,
      );

      function remindEval() {
        const targets = scopedReviews.value.filter((r) =>
          (r.status === 'rm_pending' || r.status === 'in_approval') && r.pendingApproverId,
        );
        if (!targets.length) return;
        const byPerson = new Map();
        targets.forEach((r) => {
          const pid = Number(r.pendingApproverId);
          if (!byPerson.has(pid)) byPerson.set(pid, []);
          byPerson.get(pid).push(r);
        });
        const today = new Date().toISOString().slice(0, 10);
        let count = 0;
        const nid = () => (data.notifications || []).reduce((m, n) => Math.max(m, n.id || 0), 0) + 1 + count;
        byPerson.forEach((reviews, pid) => {
          const emp = data._empMap.get(pid);
          const email = emp?.email || `${emp?.name || pid}@company.com`;
          const evalList = reviews.filter((r) => r.status === 'rm_pending');
          const apprList = reviews.filter((r) => r.status === 'in_approval');
          const lines = [];
          if (evalList.length) {
            lines.push(`【待评估】${evalList.length} 人: ${evalList.map((r) => empName(r.employeeId)).join('、')}`);
          }
          if (apprList.length) {
            lines.push(`【待审批】${apprList.length} 人: ${apprList.map((r) => empName(r.employeeId)).join('、')}`);
          }
          data.notifications.push({
            id: nid(), employeeId: pid,
            title: '绩效评估催促',
            message: `您有以下绩效待办任务，请尽快处理：\n${lines.join('\n')}\n（催促邮件已发送至 ${email}）`,
            read: false, createdAt: today,
          });
          count++;
        });
        data.persistKeys('notifications');
        window.dispatchEvent(new CustomEvent('tm-toast', {
          detail: { message: `已向 ${count} 位管理者发送催促通知`, type: 'success' },
        }));
      }

      /* ── Remind: calibration ── */
      const remindCalCount = computed(() =>
        scopedReviews.value.filter((r) => r.status === 'pl_approved').length,
      );

      function remindCalibration() {
        const targets = scopedReviews.value.filter((r) => r.status === 'pl_approved');
        if (!targets.length) return;
        const deptGroups = new Map();
        targets.forEach((r) => {
          const emp = data._empMap.get(r.employeeId);
          const deptId = emp ? emp.departmentId : null;
          if (deptId == null) return;
          const deptName = data._deptMap.get(deptId)?.name || '未知部门';
          if (!deptGroups.has(deptName)) deptGroups.set(deptName, []);
          deptGroups.get(deptName).push(r);
        });

        const today = new Date().toISOString().slice(0, 10);
        const hrbpEid = auth.currentUser?.employeeId;
        if (!hrbpEid) return;
        const nid = () => (data.notifications || []).reduce((m, n) => Math.max(m, n.id || 0), 0) + 1;

        const lines = [];
        deptGroups.forEach((reviews, dept) => {
          const names = reviews.map((r) => empName(r.employeeId)).join('、');
          lines.push(`【${dept}】${reviews.length} 人: ${names}`);
        });
        data.notifications.push({
          id: nid(), employeeId: hrbpEid,
          title: '校准催促',
          message: `共 ${targets.length} 条待 HRBP 校准，按部门分布如下：\n${lines.join('\n')}`,
          read: false, createdAt: today,
        });
        data.persistKeys('notifications');
        window.dispatchEvent(new CustomEvent('tm-toast', {
          detail: { message: `已生成校准催促通知（${targets.length} 条待校准）`, type: 'success' },
        }));
      }

      /* ── Batch calibrate ── */
      const batchCalCount = computed(() =>
        evalRows.value.filter((r) => r.status === 'pl_approved').length,
      );
      function batchCalibrate() {
        const targets = evalRows.value.filter((r) => r.status === 'pl_approved');
        if (!targets.length) return;
        if (!confirm(`确认一键校准 ${targets.length} 条记录？\n将以 RM 建议等级作为最终等级完成校准。`)) return;
        const actor = auth.currentUser?.employeeId;
        let ok = 0;
        targets.forEach((r) => {
          const grade = r.rmInitialGrade || 'B';
          if (data.hrbpCalibrateReview(r.id, grade, actor)) ok++;
        });
        window.dispatchEvent(new CustomEvent('tm-toast', {
          detail: { message: `已完成 ${ok}/${targets.length} 条校准`, type: ok ? 'success' : 'error' },
        }));
      }

      /* ── Detail / Calibrate / Adjust modals ── */
      const detailRow = ref(null);
      function openDetail(r) { detailRow.value = r; }

      const calModal = ref(false);
      const calTarget = ref(null);
      const calGrade = ref('B');
      function openCalibrate(r) {
        calTarget.value = r;
        calGrade.value = r.rmInitialGrade || 'B';
        calModal.value = true;
      }
      function doCalibrate() {
        if (!calTarget.value) return;
        if (data.hrbpCalibrateReview(calTarget.value.id, calGrade.value, auth.currentUser?.employeeId)) {
          calModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '校准完成', type: 'success' } }));
        }
      }

      const adjustModal = ref(false);
      const adjustTarget = ref(null);
      const adjustGrade = ref('B');
      function openAdjust(r) {
        adjustTarget.value = r;
        adjustGrade.value = r.finalGrade || 'B';
        adjustModal.value = true;
      }
      function doAdjust() {
        if (!adjustTarget.value) return;
        if (data.hrbpAdjustFinalGrade(adjustTarget.value.id, adjustGrade.value)) {
          adjustModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '等级已更新', type: 'success' } }));
        }
      }

      /* ── HRBP proxy evaluation ── */
      const proxyEvalModal = ref(false);
      const proxyEvalTarget = ref(null);
      const proxyEvalForm = ref({ rmInitialGrade: 'B', rmComment: '', outputDescription: '', devAdvice: '' });
      function openProxyEval(r) {
        proxyEvalTarget.value = r;
        proxyEvalForm.value = {
          rmInitialGrade: gradeOptions.includes(String(r.rmInitialGrade || '').trim()) ? String(r.rmInitialGrade).trim() : 'B',
          rmComment: r.rmComment || '',
          outputDescription: r.outputDescription || '',
          devAdvice: r.devAdvice || '',
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
          devAdvice: proxyEvalForm.value.devAdvice,
          historyPerformance: r.historyPerformance || '',
          prevCycleAvgHours: r.prevCycleAvgHours,
          comments: r.comments || '',
        };
        const actorId = auth.currentUser?.employeeId;
        if (data.submitRmPerformanceReview(r.id, payload, { actorId, isHrbp: true })) {
          proxyEvalModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已代替 RM 提交评估', type: 'success' } }));
        } else {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '提交失败', type: 'error' } }));
        }
      }

      /* ── HRBP proxy approval ── */
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
        const actorId = auth.currentUser?.employeeId;
        if (data.approvePerformanceReview(r.id, actorId, proxyApprNote.value, proxyApprGrade.value)) {
          proxyApprModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已代替审批通过', type: 'success' } }));
        }
      }
      function doProxyReject() {
        const r = proxyApprTarget.value;
        if (!r) return;
        if (!confirm('确认驳回至下级？')) return;
        const actorId = auth.currentUser?.employeeId;
        if (data.rejectPerformanceReview(r.id, actorId, proxyApprNote.value)) {
          proxyApprModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已驳回至下级', type: 'info' } }));
        }
      }

      /* ── Communication tab ── */
      const commCycleId = ref(null);
      watch(currentCycle, (c) => { if (c && commCycleId.value == null) commCycleId.value = c.id; }, { immediate: true });

      const commRows = computed(() =>
        reviewsInScope(commCycleId.value).filter((r) => r.status === 'finalized'),
      );

      const commModal = ref(false);
      const commTarget = ref(null);
      const commNotes = ref('');
      function openCommModal(r) {
        commTarget.value = r;
        commNotes.value = r.communicationNotes || '';
        commModal.value = true;
      }
      function doComm() {
        if (!commTarget.value) return;
        if (data.recordCommunication(commTarget.value.id, commNotes.value)) {
          commModal.value = false;
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '沟通记录已保存', type: 'success' } }));
        }
      }

      /* ── Cycle CRUD ── */
      const cycleModal = ref(false);
      const cycleForm = ref({ name: '', cycleType: 'half_year', startDate: '', endDate: '', status: 'open', id: null });
      function openCycleCreate() {
        cycleForm.value = { name: '', cycleType: 'half_year', startDate: '', endDate: '', status: 'open', id: null };
        cycleModal.value = true;
      }
      function editCycle(c) {
        cycleForm.value = { ...c, cycleType: c.cycleType === 'year' ? 'year' : 'half_year' };
        cycleModal.value = true;
      }
      function saveCycle() {
        const f = cycleForm.value;
        const payload = {
          name: f.name, cycleType: f.cycleType === 'year' ? 'year' : 'half_year',
          startDate: f.startDate, endDate: f.endDate, status: f.status,
        };
        if (f.id) data.updateCycle(f.id, payload);
        else data.addCycle(payload);
        cycleModal.value = false;
      }

      return {
        tab, gradeOptions, statusLabels, allCycles, currentCycle,
        scopeRootDeptUi, deptScopeOptions, scopeHint,
        empName, empDept, cycleTypeLabel, cycleLabel, statusLabel,
        evalCycleId, evalStatusFilter, rmFilter, rmOptions, levelFilter, levelOptions,
        evalRows, evalDist, evalSummary, evalChartRef, statusCards, pendingCalibrationCount,
        aSumCount, aSumPct,
        canArchive, archiveHint, doArchive,
        remindEvalCount, remindEval, remindCalCount, remindCalibration,
        batchCalCount, batchCalibrate,
        detailRow, openDetail,
        calModal, calTarget, calGrade, openCalibrate, doCalibrate,
        adjustModal, adjustTarget, adjustGrade, openAdjust, doAdjust,
        proxyEvalModal, proxyEvalTarget, proxyEvalForm, openProxyEval, submitProxyEval,
        proxyApprModal, proxyApprTarget, proxyApprGrade, proxyApprNote,
        openProxyApproval, doProxyApprove, doProxyReject,
        commCycleId, commRows, commModal, commTarget, commNotes, openCommModal, doComm,
        cycleModal, cycleForm, openCycleCreate, editCycle, saveCycle,
      };
    },
  };
})();
