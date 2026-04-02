(function () {
  const { computed, ref } = Vue;
  const useDataStore = window.TM.useDataStore;

  const PRIORITY_EN = { high: 'High', medium: 'Medium', low: 'Low' };
  const RECRUIT_ORDER = { high: 0, medium: 1, low: 2 };

  function ensureXLSX() {
    if (typeof XLSX === 'undefined') throw new Error('Excel library failed to load. Check your network and refresh.');
    return XLSX;
  }

  function cellToDateString(v) {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    if (typeof v === 'number' && v > 20000) {
      const utc = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(utc);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const s = String(v ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) return s.replace(/\//g, '-').slice(0, 10);
    return s || '';
  }

  function parseTriBool(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (['是', '1', 'true', 'y', 'yes', '通过'].includes(s)) return true;
    if (['否', '0', 'false', 'n', 'no', '不通过', '未通过'].includes(s)) return false;
    return null;
  }

  function parseOfferRejected(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (['是', '1', 'true', 'y', 'yes', '拒绝', '已拒绝'].includes(s)) return true;
    if (['否', '0', 'false', 'n', 'no', '未拒绝', '接受'].includes(s)) return false;
    return null;
  }

  function num(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  function daysBetween(isoA, isoB) {
    const a = new Date(isoA);
    const b = new Date(isoB);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }

  function posKey(deptId, posId) {
    return `${Number(deptId)}-${Number(posId)}`;
  }

  /** First non-empty among legacy (Chinese) and English column keys */
  function rowPick(row, ...keys) {
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (row[k] != null && row[k] !== '') return row[k];
    }
    return undefined;
  }

  function buildOpenRecruitRows(data) {
    const tags = data.positionRecruitTags || {};
    const rows = [];
    Object.keys(tags).forEach((key) => {
      const m = key.match(/^(\d+)-(\d+)$/);
      if (!m) return;
      const deptId = Number(m[1]);
      const positionId = Number(m[2]);
      const p = data.positions.find((x) => x.id === positionId && x.departmentId === deptId);
      if (!p) return;
      const assignees = data.employees.filter(
        (e) => e.positionId === positionId && e.departmentId === deptId && e.status !== 'leave',
      );
      if (assignees.length > 0) return;
      const priority = data.getPositionRecruitPriority(deptId, positionId) || 'medium';
      rows.push({
        key,
        deptId,
        positionId,
        deptName: data.departments.find((d) => d.id === deptId)?.name || '—',
        positionName: p.name,
        level: p.level || '—',
        priority,
      });
    });
    rows.sort((a, b) => {
      const d = RECRUIT_ORDER[a.priority] - RECRUIT_ORDER[b.priority];
      if (d !== 0) return d;
      return `${a.deptName}${a.positionName}`.localeCompare(`${b.deptName}${b.positionName}`, 'en');
    });
    return rows;
  }

  function defaultMetrics() {
    return {
      cnPassedTotal: 0,
      cvPending: 0,
      offerTalking: 0,
      pendingOnboard: 0,
      onboarded: 0,
      remainingSlots: 0,
      positionOpenDate: '',
      positionCloseDate: '',
    };
  }

  window.TM.HrbpRecruitment = {
    name: 'HrbpRecruitment',
    template: `
    <div class="page-stack">
      <div class="card pad">
        <h2 class="section-title">Recruitment</h2>
        <p class="muted small">Open roles stay in sync with <strong>Organization · open recruiting slots</strong> (only vacant slots marked open). Maintaining open tags, priority, and process uploads here <strong>does not</strong> require org-structure approval. Upload templates below for funnel and candidate rows.</p>
        <div class="recruit-tabs">
          <button type="button" :class="['btn', 'btn-sm', tab === 'overview' ? 'btn-primary' : 'btn-ghost']" @click="tab = 'overview'">Role overview</button>
          <button type="button" :class="['btn', 'btn-sm', tab === 'perf' ? 'btn-primary' : 'btn-ghost']" @click="tab = 'perf'">Recruiting metrics</button>
        </div>
      </div>

      <div v-show="tab === 'overview'" class="card pad">
        <div class="toolbar wrap" style="margin-bottom:12px">
          <button type="button" class="btn btn-secondary" @click="downloadTemplate">Download data template (Excel)</button>
          <label class="btn btn-ghost file-label">
            Upload data
            <input type="file" accept=".xlsx,.xls" class="hidden-file" @change="onUpload" />
          </label>
          <span class="muted small">Template has <strong>Position metrics</strong> and <strong>Candidates</strong> sheets; metrics merge by position key with existing data.</span>
        </div>
        <h3 class="section-title">Role overview (open slots)</h3>
        <p v-if="!overviewRows.length" class="muted small">No open vacant slots. Mark vacant slots as open on the <strong>Organization</strong> page.</p>
        <div v-else class="table-card roster-scroll">
          <table class="data-table compact">
            <thead>
              <tr>
                <th>Department</th><th>Slot</th><th>Level</th><th>Priority</th>
                <th>CN pass total</th><th>CV pending</th><th>Offer talks</th><th>Pending onboard</th><th>Onboarded</th><th>Remaining open</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in overviewRows" :key="r.key">
                <td>{{ r.deptName }}</td>
                <td>{{ r.positionName }}</td>
                <td>{{ r.level }}</td>
                <td><span class="tag" :data-recruit-p="r.priority">{{ priorityEn(r.priority) }}</span></td>
                <td>{{ mFor(r.key).cnPassedTotal }}</td>
                <td>{{ mFor(r.key).cvPending }}</td>
                <td>{{ mFor(r.key).offerTalking }}</td>
                <td>{{ mFor(r.key).pendingOnboard }}</td>
                <td>{{ mFor(r.key).onboarded }}</td>
                <td>{{ mFor(r.key).remainingSlots }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-show="tab === 'perf'" class="page-stack-inner">
        <div class="card pad">
          <h3 class="section-title">Candidate cycle (resume pass → offer end)</h3>
          <p class="muted small">From <strong>Candidates</strong> rows with both dates; duration in calendar days.</p>
          <table v-if="candidateDurationRows.length" class="data-table compact">
            <thead><tr><th>Candidate</th><th>Position key</th><th>Resume pass</th><th>Offer end</th><th>Days</th></tr></thead>
            <tbody>
              <tr v-for="row in candidateDurationRows" :key="row.id">
                <td>{{ row.name }} ({{ row.id }})</td>
                <td>{{ row.key }}</td>
                <td>{{ row.resume }}</td>
                <td>{{ row.offer }}</td>
                <td>{{ row.days }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted small">No valid rows yet (upload the template and fill dates).</p>
          <p class="recruit-stat-line"><strong>Mean candidate cycle:</strong> {{ avgCandidateDays != null ? avgCandidateDays + ' days' : '—' }}</p>
        </div>

        <div class="card pad">
          <h3 class="section-title">Requisition close & scores</h3>
          <table v-if="positionCloseRows.length" class="data-table compact">
            <thead><tr><th>Position key</th><th>Open</th><th>Close</th><th>Days open</th><th>Share scored ≥4</th></tr></thead>
            <tbody>
              <tr v-for="row in positionCloseRows" :key="row.key">
                <td>{{ row.key }}</td>
                <td>{{ row.open }}</td>
                <td>{{ row.close || '—' }}</td>
                <td>{{ row.closeDays != null ? row.closeDays : '—' }}</td>
                <td>{{ row.score4Rate }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted small">No position metrics yet.</p>
          <p class="recruit-stat-line"><strong>Mean days open (closed reqs):</strong> {{ avgCloseDays != null ? avgCloseDays + ' days' : '—' }}</p>
          <p class="recruit-stat-line"><strong>All candidates scored ≥4:</strong> {{ globalScore4Rate }}</p>
        </div>

        <div class="card pad">
          <h3 class="section-title">Resume & interview pass rates (by position)</h3>
          <table v-if="funnelByPosition.length" class="data-table compact">
            <thead>
              <tr>
                <th>Position key</th><th>Resume screen pass</th><th>Round 1 pass</th><th>Round 2 pass</th><th>Final pass</th>
                <th>Offer declines</th><th>Decline rate</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in funnelByPosition" :key="row.key">
                <td>{{ row.key }}</td>
                <td>{{ row.resumeRate }}</td>
                <td>{{ row.r1 }}</td>
                <td>{{ row.r2 }}</td>
                <td>{{ row.rf }}</td>
                <td>{{ row.rejectN }}</td>
                <td>{{ row.rejectRate }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted small">No candidate rows yet.</p>
          <h4 class="subsection-title">Simple average across positions</h4>
          <ul class="recruit-avg-list muted small">
            <li>Mean resume pass: <strong>{{ avgResumeRate }}</strong></li>
            <li>Mean round 1 pass: <strong>{{ avgR1 }}</strong></li>
            <li>Mean round 2 pass: <strong>{{ avgR2 }}</strong></li>
            <li>Mean final pass: <strong>{{ avgRf }}</strong></li>
            <li>Mean offer declines per req: <strong>{{ avgRejectN }}</strong> · mean decline rate: <strong>{{ avgRejectRate }}</strong></li>
          </ul>
          <p class="muted small" style="margin-top:10px">Weighted across <strong>all candidates</strong>:</p>
          <ul class="recruit-avg-list muted small">
            <li>Resume pass: <strong>{{ pooledResumeRate }}</strong></li>
            <li>Round 1 pass: <strong>{{ pooledR1 }}</strong></li>
            <li>Round 2 pass: <strong>{{ pooledR2 }}</strong></li>
            <li>Final pass: <strong>{{ pooledRf }}</strong></li>
            <li>Offer declines / rate: <strong>{{ pooledReject }}</strong></li>
          </ul>
        </div>
      </div>
    </div>
  `,
    setup() {
      const data = useDataStore();
      const tab = ref('overview');

      const overviewRows = computed(() => buildOpenRecruitRows(data));

      function mFor(key) {
        const raw = (data.recruitmentPositionMetrics || {})[key] || {};
        const d = defaultMetrics();
        return {
          cnPassedTotal: num(raw.cnPassedTotal, d.cnPassedTotal),
          cvPending: num(raw.cvPending, d.cvPending),
          offerTalking: num(raw.offerTalking, d.offerTalking),
          pendingOnboard: num(raw.pendingOnboard, d.pendingOnboard),
          onboarded: num(raw.onboarded, d.onboarded),
          remainingSlots: num(raw.remainingSlots, d.remainingSlots),
          positionOpenDate: raw.positionOpenDate || '',
          positionCloseDate: raw.positionCloseDate || '',
        };
      }

      function priorityEn(p) {
        return PRIORITY_EN[p] || p || '—';
      }

      const candidates = computed(() => data.recruitmentCandidates || []);

      const candidateDurationRows = computed(() => {
        const out = [];
        (candidates.value || []).forEach((c) => {
          const r = cellToDateString(c.resumePassDate);
          const o = cellToDateString(c.offerEndDate);
          const d = daysBetween(r, o);
          if (d == null || d < 0) return;
          out.push({
            id: c.id,
            name: c.name || '—',
            key: posKey(c.departmentId, c.positionId),
            resume: r,
            offer: o,
            days: d,
          });
        });
        return out;
      });

      const avgCandidateDays = computed(() => {
        const rows = candidateDurationRows.value;
        if (!rows.length) return null;
        const s = rows.reduce((a, x) => a + x.days, 0);
        return Math.round((s / rows.length) * 10) / 10;
      });

      const positionCloseRows = computed(() => {
        const metrics = data.recruitmentPositionMetrics || {};
        const keys = Object.keys(metrics);
        const rows = [];
        keys.forEach((key) => {
          const m = metrics[key] || {};
          const open = cellToDateString(m.positionOpenDate);
          const close = cellToDateString(m.positionCloseDate);
          let closeDays = null;
          if (open && close) closeDays = daysBetween(open, close);
          const cands = (candidates.value || []).filter(
            (c) => posKey(c.departmentId, c.positionId) === key,
          );
          const scored = cands.filter((c) => c.overallScore != null && !Number.isNaN(Number(c.overallScore)));
          const ge4 = scored.filter((c) => Number(c.overallScore) >= 4).length;
          const score4Rate = scored.length ? `${Math.round((ge4 / scored.length) * 1000) / 10}% (${ge4}/${scored.length})` : '—';
          rows.push({ key, open: open || '—', close, closeDays, score4Rate });
        });
        return rows.sort((a, b) => a.key.localeCompare(b.key));
      });

      const avgCloseDays = computed(() => {
        const nums = positionCloseRows.value.map((r) => r.closeDays).filter((x) => x != null);
        if (!nums.length) return null;
        const s = nums.reduce((a, x) => a + x, 0);
        return Math.round((s / nums.length) * 10) / 10;
      });

      const globalScore4Rate = computed(() => {
        const cands = candidates.value || [];
        const scored = cands.filter((c) => c.overallScore != null && !Number.isNaN(Number(c.overallScore)));
        if (!scored.length) return '—';
        const ge4 = scored.filter((c) => Number(c.overallScore) >= 4).length;
        return `${Math.round((ge4 / scored.length) * 1000) / 10}% (${ge4}/${scored.length})`;
      });

      function rateStr(passed, decided) {
        if (!decided) return '—';
        return `${Math.round((passed / decided) * 1000) / 10}% (${passed}/${decided})`;
      }

      function funnelForKey(key) {
        const cands = (candidates.value || []).filter(
          (c) => posKey(c.departmentId, c.positionId) === key,
        );
        const resP = cands.filter((c) => c.resumeScreenPass === true).length;
        const resD = cands.filter((c) => c.resumeScreenPass === true || c.resumeScreenPass === false).length;
        const r1p = cands.filter((c) => c.round1Pass === true).length;
        const r1d = cands.filter((c) => c.round1Pass === true || c.round1Pass === false).length;
        const r2p = cands.filter((c) => c.round2Pass === true).length;
        const r2d = cands.filter((c) => c.round2Pass === true || c.round2Pass === false).length;
        const rfp = cands.filter((c) => c.roundFinalPass === true).length;
        const rfd = cands.filter((c) => c.roundFinalPass === true || c.roundFinalPass === false).length;
        const offerDecided = cands.filter(
          (c) => c.offerRejected === true || c.offerRejected === false || cellToDateString(c.offerEndDate),
        ).length;
        const rejectN = cands.filter((c) => c.offerRejected === true).length;
        const rejectRate = offerDecided ? `${Math.round((rejectN / offerDecided) * 1000) / 10}% (${rejectN}/${offerDecided})` : '—';
        return {
          key,
          resumeRate: rateStr(resP, resD),
          r1: rateStr(r1p, r1d),
          r2: rateStr(r2p, r2d),
          rf: rateStr(rfp, rfd),
          rejectN,
          rejectRate,
          _ar: resD ? resP / resD : null,
          _a1: r1d ? r1p / r1d : null,
          _a2: r2d ? r2p / r2d : null,
          _af: rfd ? rfp / rfd : null,
          _rn: rejectN,
          _rd: offerDecided ? rejectN / offerDecided : null,
          _od: offerDecided,
        };
      }

      const funnelByPosition = computed(() => {
        const keySet = new Set();
        (candidates.value || []).forEach((c) => keySet.add(posKey(c.departmentId, c.positionId)));
        Object.keys(data.recruitmentPositionMetrics || {}).forEach((k) => keySet.add(k));
        return Array.from(keySet).sort().map((k) => funnelForKey(k));
      });

      function avgOf(arr) {
        const v = arr.filter((x) => x != null && !Number.isNaN(x));
        if (!v.length) return '—';
        return `${Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 1000) / 10}%`;
      }

      const avgResumeRate = computed(() => avgOf(funnelByPosition.value.map((x) => x._ar)));
      const avgR1 = computed(() => avgOf(funnelByPosition.value.map((x) => x._a1)));
      const avgR2 = computed(() => avgOf(funnelByPosition.value.map((x) => x._a2)));
      const avgRf = computed(() => avgOf(funnelByPosition.value.map((x) => x._af)));

      const avgRejectN = computed(() => {
        const rows = funnelByPosition.value.filter((x) => x._od > 0);
        if (!rows.length) return '—';
        const s = rows.reduce((a, x) => a + x._rn, 0);
        return `${Math.round((s / rows.length) * 10) / 10}`;
      });

      const avgRejectRate = computed(() => avgOf(funnelByPosition.value.map((x) => x._rd)));

      function poolRate(isPass, isDecided) {
        const c = candidates.value || [];
        const p = c.filter(isPass).length;
        const d = c.filter(isDecided).length;
        return d ? `${Math.round((p / d) * 1000) / 10}% (${p}/${d})` : '—';
      }

      const pooledResumeRate = computed(() => poolRate(
        (x) => x.resumeScreenPass === true,
        (x) => x.resumeScreenPass === true || x.resumeScreenPass === false,
      ));
      const pooledR1 = computed(() => poolRate(
        (x) => x.round1Pass === true,
        (x) => x.round1Pass === true || x.round1Pass === false,
      ));
      const pooledR2 = computed(() => poolRate(
        (x) => x.round2Pass === true,
        (x) => x.round2Pass === true || x.round2Pass === false,
      ));
      const pooledRf = computed(() => poolRate(
        (x) => x.roundFinalPass === true,
        (x) => x.roundFinalPass === true || x.roundFinalPass === false,
      ));
      const pooledReject = computed(() => {
        const c = candidates.value || [];
        const decided = c.filter(
          (x) => x.offerRejected === true || x.offerRejected === false || cellToDateString(x.offerEndDate),
        );
        const n = decided.length;
        const rej = c.filter((x) => x.offerRejected === true).length;
        if (!n) return '—';
        return `${rej} · ${Math.round((rej / n) * 1000) / 10}% (${rej}/${n})`;
      });

      function downloadTemplate() {
        try {
          const XLSX = ensureXLSX();
          const wb = XLSX.utils.book_new();

          const explain = [
            ['Recruitment data template — instructions'],
            [''],
            ['1. Position metrics: one row per open position key (Department ID and Position slot ID must match the app). Funnel and hiring progress; open/close dates for time open.'],
            ['2. Candidates: one row per candidate; department and slot IDs align with metrics.'],
            ['3. Boolean columns: Yes / No (or 1 / 0). Overall score: 1–5.'],
            ['4. After upload: candidate sheet replaces entirely; position metrics merge by key.'],
            ['5. Overview lists only keys from Organization open slots; other keys still feed metrics if candidates reference them.'],
          ];
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(explain), 'Instructions');

          const posHeaders = [
            'Department ID', 'Position slot ID', 'CN screen pass total', 'CV pending', 'Offer in discussion', 'Pending onboard', 'Onboarded', 'Remaining open reqs', 'Position open date', 'Position close date',
          ];
          const posSample = [
            1, 101, 10, 3, 2, 1, 0, 1, '2025-01-05', '',
          ];
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([posHeaders, posSample]), 'Position metrics');

          const candHeaders = [
            'Candidate ID', 'Candidate name', 'Department ID', 'Position slot ID', 'Resume pass date', 'Offer end date', 'Overall score',
            'Resume screen pass', 'Round 1 pass', 'Round 2 pass', 'Final round pass', 'Offer declined',
          ];
          const candSample = [
            'C001', 'Sample candidate', 1, 101, '2025-01-10', '2025-02-20', 4, 'Yes', 'Yes', 'Yes', 'Yes', 'No',
          ];
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([candHeaders, candSample]), 'Candidates');

          XLSX.writeFile(wb, 'recruitment_data_template.xlsx');
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Template downloaded', type: 'success' } }));
        } catch (e) {
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: e.message, type: 'error' } }));
        }
      }

      function onUpload(ev) {
        const file = ev.target.files?.[0];
        ev.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const XLSX = ensureXLSX();
            const wb = XLSX.read(reader.result, { type: 'array', cellDates: true });
            const namePos = wb.SheetNames.find((n) => n.includes('岗位过程') || /position\s*metrics/i.test(n));
            const nameCand = wb.SheetNames.find((n) => n.includes('候选人') || /^candidates$/i.test(n));
            const metricsPatch = {};
            if (namePos) {
              const sh = wb.Sheets[namePos];
              const json = XLSX.utils.sheet_to_json(sh, { defval: '' });
              json.forEach((row) => {
                const deptId = num(rowPick(row, 'Department ID', '部门ID', '部门 ID'));
                const posId = num(rowPick(row, 'Position slot ID', '编制ID', '编制 ID'));
                if (!deptId || !posId) return;
                const key = posKey(deptId, posId);
                metricsPatch[key] = {
                  cnPassedTotal: num(rowPick(row, 'CN screen pass total', 'CN筛选总通过数', 'CN Passed Total')),
                  cvPending: num(rowPick(row, 'CV pending', 'CV待筛选数', 'CV Pending')),
                  offerTalking: num(rowPick(row, 'Offer in discussion', 'Offer沟通人数', 'Offer Talking')),
                  pendingOnboard: num(rowPick(row, 'Pending onboard', '待入职数', 'Pending Onboard')),
                  onboarded: num(rowPick(row, 'Onboarded', '已入职数')),
                  remainingSlots: num(rowPick(row, 'Remaining open reqs', '剩余待招数', 'Remaining Slots')),
                  positionOpenDate: cellToDateString(rowPick(row, 'Position open date', '岗位开放日期')),
                  positionCloseDate: cellToDateString(rowPick(row, 'Position close date', '岗位关闭日期')),
                };
              });
            }
            let newCands = null;
            if (nameCand) {
              const sh = wb.Sheets[nameCand];
              const json = XLSX.utils.sheet_to_json(sh, { defval: '' });
              newCands = [];
              json.forEach((row) => {
                const id = String(rowPick(row, 'Candidate ID', '候选人ID', '候选人 ID') ?? '').trim();
                if (!id) return;
                newCands.push({
                  id,
                  name: String(rowPick(row, 'Candidate name', '候选人姓名', 'Candidate Name') ?? '').trim(),
                  departmentId: num(rowPick(row, 'Department ID', '部门ID', '部门 ID')),
                  positionId: num(rowPick(row, 'Position slot ID', '编制ID', '编制 ID')),
                  resumePassDate: cellToDateString(rowPick(row, 'Resume pass date', '简历通过日期')),
                  offerEndDate: cellToDateString(rowPick(row, 'Offer end date', 'Offer沟通结束日期', 'Offer End Date')),
                  overallScore: (() => {
                    const raw = rowPick(row, 'Overall score', '综合评分');
                    if (raw === '' || raw == null) return null;
                    const n = num(raw, NaN);
                    return Number.isNaN(n) ? null : n;
                  })(),
                  resumeScreenPass: parseTriBool(rowPick(row, 'Resume screen pass', '简历筛选通过')),
                  round1Pass: parseTriBool(rowPick(row, 'Round 1 pass', '一面通过')),
                  round2Pass: parseTriBool(rowPick(row, 'Round 2 pass', '二面通过')),
                  roundFinalPass: parseTriBool(rowPick(row, 'Final round pass', '终面通过')),
                  offerRejected: parseOfferRejected(rowPick(row, 'Offer declined', 'Offer已拒绝', 'Offer Declined')),
                });
              });
            }
            const nextMetrics = { ...(data.recruitmentPositionMetrics || {}), ...metricsPatch };
            data.recruitmentPositionMetrics = nextMetrics;
            if (newCands) data.recruitmentCandidates = newCands;
            data.persistAll();
            window.dispatchEvent(new CustomEvent('tm-toast', {
              detail: { message: `Imported ${Object.keys(metricsPatch).length} position metric row(s)` + (newCands ? `, ${newCands.length} candidate(s)` : ''), type: 'success' },
            }));
          } catch (e) {
            window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Import failed: ' + e.message, type: 'error' } }));
          }
        };
        reader.readAsArrayBuffer(file);
      }

      return {
        data, tab, overviewRows, mFor, priorityEn,
        candidateDurationRows, avgCandidateDays, positionCloseRows, avgCloseDays, globalScore4Rate,
        funnelByPosition, avgResumeRate, avgR1, avgR2, avgRf, avgRejectN, avgRejectRate,
        pooledResumeRate, pooledR1, pooledR2, pooledRf, pooledReject,
        downloadTemplate, onUpload,
      };
    },
  };
})();
