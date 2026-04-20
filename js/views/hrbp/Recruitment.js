(function () {
  const { computed, ref, reactive, nextTick } = Vue;
  const useDataStore = window.TM.useDataStore;

  const PRIORITY_EN = { high: 'P0', medium: 'P1', low: 'P2' };
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

  function parseStageCell(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s || s === '-' || s === '—') return '';
    if (['pass', '通过', 'p', 'yes', '是', '1'].includes(s)) return 'pass';
    if (['fail', '不通过', '未通过', 'f', 'no', '否', '0', 'reject'].includes(s)) return 'fail';
    if (['pending', '待定', 'tbd', 'wait'].includes(s)) return 'pending';
    return '';
  }

  function parseOfferCell(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s || s === '-' || s === '—') return '';
    if (['accepted', '接受', '已接受', 'yes'].includes(s)) return 'accepted';
    if (['declined', '拒绝', '已拒绝', 'no', 'reject'].includes(s)) return 'declined';
    if (['pending', '待定', 'tbd', 'wait'].includes(s)) return 'pending';
    return '';
  }

  function rowPick(row, ...keys) {
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (row[k] != null && row[k] !== '') return row[k];
    }
    return undefined;
  }

  /* ── Pipeline columns ── */
  const STAGE_VALUES = ['', 'pass', 'fail', 'pending'];
  const STAGE_LABELS = { '': '-', pass: 'Pass', fail: 'Fail', pending: 'Pending' };
  const OFFER_VALUES = ['', 'pending', 'accepted', 'declined'];
  const OFFER_LABELS = { '': '-', pending: 'Pending', accepted: 'Accepted', declined: 'Declined' };
  const RECRUIT_TYPE_VALUES = ['', 'social', 'campus'];
  const RECRUIT_TYPE_LABELS = { '': '-', social: '社招', campus: '校招' };

  const PIPE_COLS = [
    { key: 'recruitDate',    label: 'Recruit Date',   group: 'Basic Info',       type: 'date' },
    { key: 'name',           label: 'COD Name',       group: 'Basic Info',       type: 'text' },
    { key: 'team',           label: 'Team',           group: 'Basic Info',       type: 'text' },
    { key: 'position',       label: 'Position',       group: 'Basic Info',       type: 'text' },
    { key: 'hiringLine',     label: 'Hiring Line',    group: 'Basic Info',       type: 'text' },
    { key: 'recruitType',    label: 'Type',           group: 'Basic Info',       type: 'recruitType' },
    { key: 'recruiter',      label: 'Recruiter',      group: 'Basic Info',       type: 'text' },
    { key: 'hrScreening',    label: 'HR Screening',   group: 'Interview Process', type: 'stage' },
    { key: 'hrScreeningBy',  label: 'HR Screener',    group: 'Interview Process', type: 'text' },
    { key: 'hrInterview',    label: 'HR Interview',   group: 'Interview Process', type: 'stage' },
    { key: 'interview1',     label: '1st Interview',  group: 'Interview Process', type: 'stage' },
    { key: 'interview1By',   label: '1st Interviewer', group: 'Interview Process', type: 'text' },
    { key: 'interview2',     label: '2nd Interview',  group: 'Interview Process', type: 'stage' },
    { key: 'interview2By',   label: '2nd Interviewer', group: 'Interview Process', type: 'text' },
    { key: 'interviewFinal', label: 'Final Interview', group: 'Interview Process', type: 'stage' },
    { key: 'interviewFinalBy', label: 'Final Interviewer', group: 'Interview Process', type: 'text' },
    { key: 'score',          label: 'Score',          group: 'Result',           type: 'number' },
    { key: 'offering',       label: 'Offering',       group: 'Result',           type: 'offer' },
    { key: 'onboardDate',    label: 'Onboard Date',   group: 'Result',           type: 'date' },
    { key: 'comments',       label: 'Comments',       group: 'Result',           type: 'text' },
    { key: 'yoe',            label: 'YOE',            group: 'Profile',          type: 'number' },
    { key: 'personnelType',  label: '人员类别',         group: 'Offering Analysis', type: 'text' },
    { key: 'companyLevel',   label: '公司等级',         group: 'Offering Analysis', type: 'text' },
    { key: 'levelPosition',  label: '等级职位',         group: 'Offering Analysis', type: 'text' },
    { key: 'shippedDate',    label: 'Shipped日期',     group: 'Offering Analysis', type: 'date' },
    { key: 'offerBIDate',    label: '6%-offerBI日',    group: 'Offering Analysis', type: 'date' },
    { key: 'cash',           label: '现金',            group: 'Offering Analysis', type: 'text' },
    { key: 'offerMakeScope', label: 'offerMakeScope',  group: 'Offering Analysis', type: 'text' },
    { key: 'workLocation',   label: '工作地点',         group: 'Offering Analysis', type: 'text' },
    { key: 'basePackage',    label: '基本年包',         group: 'Offering Analysis', type: 'text' },
    { key: 'briStart',       label: 'BRI起算',         group: 'Offering Analysis', type: 'date' },
  ];

  /* Schema for field mapper (aliases + keywords for fuzzy matching) */
  const PIPE_SCHEMA = PIPE_COLS.map((c) => {
    const s = { key: c.key, label: c.label, aliases: [], keywords: [] };
    const a = s.aliases; const k = s.keywords;
    switch (c.key) {
      case 'recruitDate': a.push('Recruit Date','Recruitment Date','推荐日期','日期'); k.push('date','recruit'); break;
      case 'name': a.push('COD Name','Candidate Name','候选人','姓名','Name'); k.push('name','候选'); s.required = true; break;
      case 'team': a.push('Team','团队','部门','Department'); k.push('team','dept'); break;
      case 'position': a.push('Position','岗位','职位','Job'); k.push('position','岗位'); break;
      case 'hiringLine': a.push('Hiring Line','HiringLine','招聘线','Line'); k.push('hiring','line'); break;
      case 'recruitType': a.push('Type','类型','Recruit Type','校招社招','招聘类型'); k.push('type','校招','社招'); break;
      case 'recruiter': a.push('Recruiter','招聘负责人','负责人','HR负责人'); k.push('recruiter','负责人'); break;
      case 'hrScreening': a.push('HR Screening','HR筛选','简历筛选'); k.push('screening','筛选'); break;
      case 'hrScreeningBy': a.push('HR Screener','HR筛选人','HR筛选面试官','筛选人'); k.push('screener','筛选人'); break;
      case 'hrInterview': a.push('HR Interview','HR面试'); k.push('hr interview'); break;
      case 'interview1': a.push('1st Interview','一面','First Interview','初试'); k.push('1st','一面','初试'); break;
      case 'interview1By': a.push('1st Interviewer','一面面试官','初试面试官'); k.push('1st interviewer','一面面试官'); break;
      case 'interview2': a.push('2nd Interview','二面','Second Interview','复试'); k.push('2nd','二面','复试'); break;
      case 'interview2By': a.push('2nd Interviewer','二面面试官','复试面试官'); k.push('2nd interviewer','二面面试官'); break;
      case 'interviewFinal': a.push('Final Interview','终面','Final'); k.push('final','终面'); break;
      case 'interviewFinalBy': a.push('Final Interviewer','终面面试官'); k.push('final interviewer','终面面试官'); break;
      case 'score': a.push('Score','评分','分数','综合评分'); k.push('score','评分'); break;
      case 'offering': a.push('Offering','Offer','录用','Offer状态'); k.push('offer','录用'); break;
      case 'onboardDate': a.push('Onboard Date','入职日期','Onboard'); k.push('onboard','入职'); break;
      case 'comments': a.push('Comments','备注','Remarks','说明'); k.push('comment','备注'); break;
      case 'yoe': a.push('YOE','工作年限','经验年限','Years of Experience'); k.push('yoe','年限','experience'); break;
      case 'personnelType': a.push('人员类别','Personnel Type','人员类型'); break;
      case 'companyLevel': a.push('公司等级','Company Level'); break;
      case 'levelPosition': a.push('等级职位','Level Position'); break;
      case 'shippedDate': a.push('Shipped日期','Shipped Date'); break;
      case 'offerBIDate': a.push('6%-offerBI日','OfferBI Date','OfferBI'); break;
      case 'cash': a.push('现金','Cash'); break;
      case 'offerMakeScope': a.push('offerMakeScope','OfferMakeScope','Offer Scope'); break;
      case 'workLocation': a.push('工作地点','Work Location','地点','Location'); k.push('location','地点'); break;
      case 'basePackage': a.push('基本年包','Base Package','年包'); k.push('package','年包'); break;
      case 'briStart': a.push('BRI起算','BRI Start','BRI'); break;
    }
    return s;
  });

  function emptyPipeRow(id) {
    const r = { id };
    PIPE_COLS.forEach((c) => { r[c.key] = ''; });
    return r;
  }

  function pipeUid(list) {
    const max = (list || []).reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0);
    return 'P' + String(max + 1).padStart(3, '0');
  }

  function buildGroupSpans() {
    const groups = [];
    let cur = null;
    PIPE_COLS.forEach((c) => {
      if (cur && cur.group === c.group) { cur.span += 1; }
      else { cur = { group: c.group, span: 1 }; groups.push(cur); }
    });
    return groups;
  }
  const PIPE_GROUPS = buildGroupSpans();

  /* ── Candidate status helper ── */
  function candStatus(c) {
    if (c.onboardDate) return 'onboarded';
    if (c.offering === 'accepted') return 'pendingOnboard';
    if (c.offering === 'declined') return 'rejected';
    if (c.offering === 'pending') return 'inOffer';
    const stages = [c.hrScreening, c.hrInterview, c.interview1, c.interview2, c.interviewFinal];
    if (stages.some((s) => s === 'fail')) return 'rejected';
    if (stages.some((s) => s === 'pending' || s === 'pass')) return 'interviewing';
    return 'cvPending';
  }

  function candHrPassed(c) { return c.hrScreening === 'pass'; }

  /* ── Overview auto-aggregate ── */
  function buildOverviewAuto(data) {
    const tags = data.positionRecruitTags || {};
    const pipeline = data.recruitmentPipeline || [];
    const posMap = data._posMap;
    const deptMap = data._deptMap;

    const groupMap = {};
    function ensureGroup(team, position, level, priority) {
      const gk = `${team}||${position}||${level}||${priority}`;
      if (!groupMap[gk]) groupMap[gk] = { team, position, level, priority, reqHC: 0 };
      return groupMap[gk];
    }

    Object.keys(tags).forEach((key) => {
      const m = key.match(/^(\d+)-(\d+)$/);
      if (!m) return;
      const deptId = Number(m[1]);
      const positionId = Number(m[2]);
      const p = posMap.get(positionId);
      if (!p || p.departmentId !== deptId) return;
      const priority = data.getPositionRecruitPriority(deptId, positionId) || 'medium';
      const deptName = deptMap.get(deptId)?.name || '—';
      ensureGroup(deptName, p.name, p.level || '—', priority).reqHC += 1;
    });

    const pipeByKey = new Map();
    pipeline.forEach((c) => {
      const team = String(c.team || '').trim().toLowerCase();
      const pos = String(c.position || '').trim().toLowerCase();
      const pk = `${team}||${pos}`;
      if (!pipeByKey.has(pk)) pipeByKey.set(pk, []);
      pipeByKey.get(pk).push(c);
    });

    const existingTeamPos = new Set();
    Object.values(groupMap).forEach((g) => {
      existingTeamPos.add(`${g.team.toLowerCase()}||${g.position.toLowerCase()}`);
    });
    pipeline.forEach((c) => {
      const team = String(c.team || '').trim();
      const pos = String(c.position || '').trim();
      if (!team || !pos) return;
      const tpKey = `${team.toLowerCase()}||${pos.toLowerCase()}`;
      if (existingTeamPos.has(tpKey)) return;
      existingTeamPos.add(tpKey);
      const gk = `${team}||${pos}||—||medium`;
      groupMap[gk] = { team, position: pos, level: '—', priority: 'medium', reqHC: 0 };
    });

    const rows = Object.values(groupMap);
    rows.sort((a, b) => {
      const d = (RECRUIT_ORDER[a.priority] ?? 9) - (RECRUIT_ORDER[b.priority] ?? 9);
      return d !== 0 ? d : `${a.team}${a.position}`.localeCompare(`${b.team}${b.position}`, 'zh-Hans-CN');
    });

    function fillPipeStats(row) {
      const teamKey = String(row.team || '').trim().toLowerCase();
      const posKey = String(row.position || '').trim().toLowerCase();
      const pk = `${teamKey}||${posKey}`;
      const cands = pipeByKey.get(pk) || [];
      const sts = cands.map((c) => candStatus(c));
      row.cvPassTotal = cands.filter((c) => candHrPassed(c)).length;
      row.cvPending = sts.filter((s) => s === 'cvPending').length;
      row.interviewing = sts.filter((s) => s === 'interviewing').length;
      row.inOffer = sts.filter((s) => s === 'inOffer').length;
      row.pendingOnboard = sts.filter((s) => s === 'pendingOnboard').length;
      row.onboarded = sts.filter((s) => s === 'onboarded').length;
      row.rejected = sts.filter((s) => s === 'rejected').length;
      row.fulfillRate = row.reqHC > 0 ? Math.round((row.onboarded / row.reqHC) * 100) + '%' : '0%';
      row.offerDeclined = cands.filter((c) => c.offering === 'declined').length;
      row.offerAccepted = cands.filter((c) => c.offering === 'accepted' || c.onboardDate).length;
      const accepted = cands.filter((c) => c.offering === 'accepted' || c.onboardDate);
      const declined = cands.filter((c) => c.offering === 'declined');
      row.accScore3 = accepted.filter((c) => Number(c.score) >= 3).length;
      row.accScore3Pct = accepted.length ? Math.round((row.accScore3 / accepted.length) * 100) + '%' : '—';
      row.accScore4 = accepted.filter((c) => Number(c.score) >= 4).length;
      row.accScore4Pct = accepted.length ? Math.round((row.accScore4 / accepted.length) * 100) + '%' : '—';
      row.rejScore3 = declined.filter((c) => Number(c.score) >= 3).length;
      row.rejScore3Pct = declined.length ? Math.round((row.rejScore3 / declined.length) * 100) + '%' : '—';
      row.rejScore4 = declined.filter((c) => Number(c.score) >= 4).length;
      row.rejScore4Pct = declined.length ? Math.round((row.rejScore4 / declined.length) * 100) + '%' : '—';
    }
    rows.forEach(fillPipeStats);

    const t = { team: 'Current Progress', position: '', level: '', priority: '' };
    t.reqHC = rows.reduce((a, r) => a + r.reqHC, 0);
    ['cvPassTotal','cvPending','interviewing','inOffer','pendingOnboard','onboarded','rejected','offerDeclined','offerAccepted','accScore3','accScore4','rejScore3','rejScore4'].forEach((k) => { t[k] = rows.reduce((a, r) => a + (r[k] || 0), 0); });
    t.fulfillRate = t.reqHC ? Math.round((t.onboarded / t.reqHC) * 100) + '%' : '0%';
    t.accScore3Pct = t.offerAccepted ? Math.round((t.accScore3 / t.offerAccepted) * 100) + '%' : '—';
    t.accScore4Pct = t.offerAccepted ? Math.round((t.accScore4 / t.offerAccepted) * 100) + '%' : '—';
    t.rejScore3Pct = t.offerDeclined ? Math.round((t.rejScore3 / t.offerDeclined) * 100) + '%' : '—';
    t.rejScore4Pct = t.offerDeclined ? Math.round((t.rejScore4 / t.offerDeclined) * 100) + '%' : '—';
    return { rows, totals: t };
  }

  /* ── Metrics pivot helpers ── */
  function pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 + '%' : '—'; }

  function collectUnique(arr, key) {
    const s = new Set();
    arr.forEach((c) => { const v = String(c[key] || '').trim(); if (v) s.add(v); });
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }

  function collectInterviewers(arr) {
    const s = new Set();
    arr.forEach((c) => {
      ['hrScreeningBy','interview1By','interview2By','interviewFinalBy'].forEach((k) => {
        const v = String(c[k] || '').trim();
        if (v) s.add(v);
      });
    });
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }

  function computeMetrics(cands) {
    const total = cands.length;
    const hrDecided = cands.filter((c) => c.hrScreening === 'pass' || c.hrScreening === 'fail').length;
    const hrPass = cands.filter((c) => c.hrScreening === 'pass').length;
    const hrIvDecided = cands.filter((c) => c.hrInterview === 'pass' || c.hrInterview === 'fail').length;
    const hrIvPass = cands.filter((c) => c.hrInterview === 'pass').length;
    const r1Decided = cands.filter((c) => c.interview1 === 'pass' || c.interview1 === 'fail').length;
    const r1Pass = cands.filter((c) => c.interview1 === 'pass').length;
    const r2Decided = cands.filter((c) => c.interview2 === 'pass' || c.interview2 === 'fail').length;
    const r2Pass = cands.filter((c) => c.interview2 === 'pass').length;
    const rfDecided = cands.filter((c) => c.interviewFinal === 'pass' || c.interviewFinal === 'fail').length;
    const rfPass = cands.filter((c) => c.interviewFinal === 'pass').length;
    const scored = cands.filter((c) => Number(c.score) > 0);
    const s3 = scored.filter((c) => Number(c.score) >= 3).length;
    const s4 = scored.filter((c) => Number(c.score) >= 4).length;
    const s5 = scored.filter((c) => Number(c.score) >= 5).length;
    return {
      total,
      hrPassRate: pct(hrPass, hrDecided), hrPass, hrDecided,
      hrIvPassRate: pct(hrIvPass, hrIvDecided), hrIvPass, hrIvDecided,
      r1PassRate: pct(r1Pass, r1Decided), r1Pass, r1Decided,
      r2PassRate: pct(r2Pass, r2Decided), r2Pass, r2Decided,
      rfPassRate: pct(rfPass, rfDecided), rfPass, rfDecided,
      scored: scored.length,
      score3Pct: pct(s3, scored.length), score3: s3,
      score4Pct: pct(s4, scored.length), score4: s4,
      score5Pct: pct(s5, scored.length), score5: s5,
    };
  }

  function computeInterviewerMetrics(cands) {
    const map = {};
    const stages = [
      { stageKey: 'hrScreening', byKey: 'hrScreeningBy', label: 'HR Screening' },
      { stageKey: 'interview1', byKey: 'interview1By', label: '1st Interview' },
      { stageKey: 'interview2', byKey: 'interview2By', label: '2nd Interview' },
      { stageKey: 'interviewFinal', byKey: 'interviewFinalBy', label: 'Final Interview' },
    ];
    stages.forEach(({ stageKey, byKey, label }) => {
      cands.forEach((c) => {
        const interviewer = String(c[byKey] || '').trim();
        if (!interviewer) return;
        const decided = c[stageKey] === 'pass' || c[stageKey] === 'fail';
        if (!decided) return;
        const k = `${interviewer}||${label}`;
        if (!map[k]) map[k] = { interviewer, stage: label, pass: 0, fail: 0, total: 0 };
        map[k].total++;
        if (c[stageKey] === 'pass') map[k].pass++;
        else map[k].fail++;
      });
    });
    const rows = Object.values(map);
    rows.forEach((r) => { r.passRate = pct(r.pass, r.total); });
    rows.sort((a, b) => a.interviewer.localeCompare(b.interviewer) || a.stage.localeCompare(b.stage));
    return rows;
  }

  window.TM.HrbpRecruitment = {
    name: 'HrbpRecruitment',
    components: { FieldMapDialog: window.TM.FieldMapDialog },
    template: `
    <div class="page-stack">
      <FieldMapDialog
        :visible="fmapVisible"
        :mapping="fmapMapping"
        :fileHeaders="fmapHeaders"
        :title="fmapTitle"
        @confirm="fmapOnConfirm"
        @cancel="fmapVisible = false"
      />
      <div class="card pad">
        <h2 class="section-title">Recruitment</h2>
        <div class="recruit-tabs">
          <button type="button" :class="['btn', 'btn-sm', tab === 'overview' ? 'btn-primary' : 'btn-ghost']" @click="tab = 'overview'"><i class="fa-solid fa-table-columns"></i> Role Overview</button>
          <button type="button" :class="['btn', 'btn-sm', tab === 'pipeline' ? 'btn-primary' : 'btn-ghost']" @click="tab = 'pipeline'"><i class="fa-solid fa-bars-progress"></i> Candidate Pipeline</button>
          <button type="button" :class="['btn', 'btn-sm', tab === 'perf' ? 'btn-primary' : 'btn-ghost']" @click="tab = 'perf'"><i class="fa-solid fa-chart-bar"></i> Recruiting Metrics</button>
          <button type="button" :class="['btn', 'btn-sm', tab === 'pool' ? 'btn-primary' : 'btn-ghost']" @click="tab = 'pool'"><i class="fa-solid fa-user-group"></i> Interviewer Pool</button>
        </div>
      </div>

      <!-- ══════════ OVERVIEW TAB ══════════ -->
      <div v-show="tab === 'overview'" class="card pad">
        <h3 class="section-title">Overview — Auto <span class="muted small" style="font-weight:400;margin-left:8px">实时从 Organization 招聘需求 + Pipeline 候选人自动汇总</span></h3>
        <p v-if="!overviewData.rows.length" class="muted small">暂无数据。请先在 <strong>Organization</strong> 模块创建招聘需求，或在 <strong>Candidate Pipeline</strong> 中添加候选人。</p>
        <div v-else class="table-card ov-scroll">
          <table class="ov-table">
            <thead>
              <tr class="ov-group-row">
                <th colspan="5" class="ov-grp ov-grp-info">Overview-Auto</th>
                <th colspan="8" class="ov-grp ov-grp-pipe">Pipeline</th>
                <th colspan="2" class="ov-grp ov-grp-offer">Offer接受情况</th>
                <th colspan="4" class="ov-grp ov-grp-acc">Offers Accepted</th>
                <th colspan="4" class="ov-grp ov-grp-rej">Offer Rejected</th>
              </tr>
              <tr class="ov-col-row">
                <th>Team</th><th>Position</th><th>Idea Rank</th><th>Req HC</th><th>Priority</th>
                <th>CV筛选总通过</th><th>CV待筛选</th><th>面试中</th><th>录用中</th><th>待入职</th><th>已入职</th><th>拒绝</th><th>达成率</th>
                <th>Offer拒绝</th><th>Offer接受</th>
                <th>≥3分</th><th>%</th><th>≥4分</th><th>%</th>
                <th>≥3分</th><th>%</th><th>≥4分</th><th>%</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, ri) in overviewData.rows" :key="ri">
                <td class="ov-info">{{ r.team }}</td><td class="ov-info">{{ r.position }}</td><td class="ov-info">{{ r.level }}</td>
                <td class="ov-info ov-num">{{ r.reqHC }}</td>
                <td class="ov-info"><span class="tag" :data-recruit-p="r.priority">{{ priorityLabel(r.priority) }}</span></td>
                <td class="ov-pipe ov-num">{{ r.cvPassTotal }}</td><td class="ov-pipe ov-num">{{ r.cvPending }}</td>
                <td class="ov-pipe ov-num">{{ r.interviewing }}</td><td class="ov-pipe ov-num">{{ r.inOffer }}</td>
                <td class="ov-pipe ov-num">{{ r.pendingOnboard }}</td>
                <td class="ov-pipe ov-num ov-hl-green">{{ r.onboarded }}</td><td class="ov-pipe ov-num ov-hl-red">{{ r.rejected }}</td>
                <td class="ov-pipe ov-num ov-hl-blue">{{ r.fulfillRate }}</td>
                <td class="ov-offer ov-num">{{ r.offerDeclined }}</td><td class="ov-offer ov-num">{{ r.offerAccepted }}</td>
                <td class="ov-acc ov-num">{{ r.accScore3 }}</td><td class="ov-acc ov-num">{{ r.accScore3Pct }}</td>
                <td class="ov-acc ov-num">{{ r.accScore4 }}</td><td class="ov-acc ov-num">{{ r.accScore4Pct }}</td>
                <td class="ov-rej ov-num">{{ r.rejScore3 }}</td><td class="ov-rej ov-num">{{ r.rejScore3Pct }}</td>
                <td class="ov-rej ov-num">{{ r.rejScore4 }}</td><td class="ov-rej ov-num">{{ r.rejScore4Pct }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="ov-total-row">
                <td class="ov-info" style="font-weight:700">Current Progress</td><td class="ov-info"></td><td class="ov-info"></td>
                <td class="ov-info ov-num" style="font-weight:700">{{ overviewData.totals.reqHC }}</td><td class="ov-info"></td>
                <td class="ov-pipe ov-num">{{ overviewData.totals.cvPassTotal }}</td><td class="ov-pipe ov-num">{{ overviewData.totals.cvPending }}</td>
                <td class="ov-pipe ov-num">{{ overviewData.totals.interviewing }}</td><td class="ov-pipe ov-num">{{ overviewData.totals.inOffer }}</td>
                <td class="ov-pipe ov-num">{{ overviewData.totals.pendingOnboard }}</td>
                <td class="ov-pipe ov-num ov-hl-green">{{ overviewData.totals.onboarded }}</td><td class="ov-pipe ov-num ov-hl-red">{{ overviewData.totals.rejected }}</td>
                <td class="ov-pipe ov-num ov-hl-blue">{{ overviewData.totals.fulfillRate }}</td>
                <td class="ov-offer ov-num">{{ overviewData.totals.offerDeclined }}</td><td class="ov-offer ov-num">{{ overviewData.totals.offerAccepted }}</td>
                <td class="ov-acc ov-num">{{ overviewData.totals.accScore3 }}</td><td class="ov-acc ov-num">{{ overviewData.totals.accScore3Pct }}</td>
                <td class="ov-acc ov-num">{{ overviewData.totals.accScore4 }}</td><td class="ov-acc ov-num">{{ overviewData.totals.accScore4Pct }}</td>
                <td class="ov-rej ov-num">{{ overviewData.totals.rejScore3 }}</td><td class="ov-rej ov-num">{{ overviewData.totals.rejScore3Pct }}</td>
                <td class="ov-rej ov-num">{{ overviewData.totals.rejScore4 }}</td><td class="ov-rej ov-num">{{ overviewData.totals.rejScore4Pct }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- ══════════ PIPELINE TAB ══════════ -->
      <div v-show="tab === 'pipeline'" class="page-stack-inner">
        <div class="card pad">
          <div class="toolbar wrap" style="gap:8px">
            <button v-if="auth.hasPermission('recruit.add')" type="button" class="btn btn-primary btn-sm" @click="addPipeRow"><i class="fa-solid fa-plus"></i> Add candidate</button>
            <button v-if="auth.hasPermission('recruit.delete')" type="button" class="btn btn-danger btn-sm" :disabled="!pipeSelected.size" @click="deletePipeRows">Delete selected ({{ pipeSelected.size }})</button>
            <div style="flex:1"></div>
            <button type="button" class="btn btn-secondary btn-sm" @click="downloadPipeTemplate"><i class="fa-solid fa-download"></i> Download template</button>
            <label v-if="auth.hasPermission('recruit.import')" class="btn btn-ghost btn-sm file-label">
              <i class="fa-solid fa-upload"></i> Upload Excel (replace)
              <input type="file" accept=".xlsx,.xls,.csv" class="hidden-file" @change="uploadPipeline" />
            </label>
            <button v-if="auth.hasPermission('recruit.export')" type="button" class="btn btn-ghost btn-sm" @click="exportPipeline"><i class="fa-solid fa-file-export"></i> Export Excel</button>
          </div>

          <div class="pivot-filters" style="margin-top:8px">
            <label class="pivot-filter-item">
              <span>部门</span>
              <select v-model="pipeFilterTeam" class="input input-sm">
                <option value="">全部</option>
                <option v-for="t in pipeTeamOpts" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <label class="pivot-filter-item">
              <span>岗位</span>
              <select v-model="pipeFilterPos" class="input input-sm">
                <option value="">全部</option>
                <option v-for="p in pipePosOpts" :key="p" :value="p">{{ p }}</option>
              </select>
            </label>
            <label class="pivot-filter-item">
              <span>招聘负责人</span>
              <select v-model="pipeFilterRecruiter" class="input input-sm">
                <option value="">全部</option>
                <option v-for="r in pipeRecruiterOpts" :key="r" :value="r">{{ r }}</option>
              </select>
            </label>
            <label class="pivot-filter-item">
              <span>校招/社招</span>
              <select v-model="pipeFilterType" class="input input-sm">
                <option value="">全部</option>
                <option value="campus">校招</option>
                <option value="social">社招</option>
              </select>
            </label>
            <label class="pivot-filter-item">
              <span>面试官</span>
              <select v-model="pipeFilterInterviewer" class="input input-sm">
                <option value="">全部</option>
                <option v-for="iv in pipeInterviewerOpts" :key="iv" :value="iv">{{ iv }}</option>
              </select>
            </label>
            <label class="pivot-filter-item">
              <span>状态</span>
              <select v-model="pipeFilterStatus" class="input input-sm">
                <option value="">全部</option>
                <option value="cvPending">CV 待筛选</option>
                <option value="interviewing">面试中</option>
                <option value="inOffer">录用中</option>
                <option value="pendingOnboard">待入职</option>
                <option value="onboarded">已入职</option>
                <option value="rejected">已拒绝/淘汰</option>
              </select>
            </label>
            <button v-if="pipeHasFilter" type="button" class="btn btn-ghost btn-sm" style="align-self:flex-end" @click="clearPipeFilters">
              <i class="fa-solid fa-filter-circle-xmark"></i> 清除筛选
            </button>
          </div>
          <p class="muted small" style="margin-top:6px">
            显示 <strong>{{ pipeFilteredRows.length }}</strong> / {{ pipeAllRows.length }} 条候选人
            · 点击单元格编辑 · 面试阶段/Type 单击切换
          </p>
        </div>
        <div class="card pipe-table-card">
          <div class="pipe-scroll-viewport">
          <table class="pipe-table">
            <thead>
              <tr class="pipe-group-row">
                <th class="pipe-th-sel" rowspan="2"></th>
                <th class="pipe-th-idx" rowspan="2">#</th>
                <th v-for="g in pipeGroups" :key="g.group" :colspan="g.span" class="pipe-group-th">{{ g.group }}</th>
                <th rowspan="2" class="pipe-th-act"></th>
              </tr>
              <tr class="pipe-col-row">
                <th v-for="col in pipeCols" :key="col.key" class="pipe-col-th" :class="'pipe-col-' + col.type">{{ col.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in pipeFilteredRows" :key="row.id" :class="{ 'pipe-row-selected': pipeSelected.has(row.id) }">
                <td class="pipe-td-sel"><input type="checkbox" :checked="pipeSelected.has(row.id)" @change="togglePipeSel(row.id)" /></td>
                <td class="pipe-td-idx muted">{{ ri + 1 }}</td>
                <td v-for="col in pipeCols" :key="col.key"
                  :class="pipeTdClass(col, row)"
                  @click="onPipeCellClick(row, col, $event)"
                  @dblclick="onPipeCellDblClick(row, col, $event)">
                  <template v-if="editingCell.rowId === row.id && editingCell.key === col.key">
                    <input v-if="col.type === 'date'" type="date" class="pipe-inline-input" :value="row[col.key]"
                      @blur="commitEdit(row, col.key, $event.target.value)" @keydown.enter="$event.target.blur()" />
                    <input v-else-if="col.type === 'number'" type="number" class="pipe-inline-input" step="any" :value="row[col.key]"
                      @blur="commitEdit(row, col.key, $event.target.value)" @keydown.enter="$event.target.blur()" />
                    <input v-else type="text" class="pipe-inline-input" :value="row[col.key]"
                      @blur="commitEdit(row, col.key, $event.target.value)" @keydown.enter="$event.target.blur()" />
                  </template>
                  <template v-else>
                    <span v-if="col.type === 'stage'" class="pipe-stage-badge" :data-stage="row[col.key]">{{ stageLabel(row[col.key]) }}</span>
                    <span v-else-if="col.type === 'offer'" class="pipe-offer-badge" :data-offer="row[col.key]">{{ offerLabel(row[col.key]) }}</span>
                    <span v-else-if="col.type === 'recruitType'" class="pipe-stage-badge" :data-stage="row[col.key] ? 'pass' : ''">{{ recruitTypeLabel(row[col.key]) }}</span>
                    <span v-else class="pipe-cell-text" :title="row[col.key]">{{ row[col.key] || '' }}</span>
                  </template>
                </td>
                <td class="pipe-td-act">
                  <button v-if="auth.hasPermission('recruit.delete')" type="button" class="btn-link danger" @click="removePipeRow(row.id)" title="Delete row">✕</button>
                </td>
              </tr>
              <tr v-if="!pipeFilteredRows.length">
                <td :colspan="pipeCols.length + 3" class="muted small" style="text-align:center;padding:2rem">
                  <template v-if="pipeAllRows.length">无匹配候选人，请调整筛选条件或 <a href="#" @click.prevent="clearPipeFilters">清除筛选</a></template>
                  <template v-else>No candidates yet. Click <strong>Add candidate</strong> or upload an Excel file.</template>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <!-- ══════════ METRICS (PIVOT) TAB ══════════ -->
      <div v-show="tab === 'perf'" class="page-stack-inner">
        <div class="card pad">
          <h3 class="section-title">Recruiting Metrics — 数据透视</h3>
          <p class="muted small" style="margin-bottom:10px">选择筛选维度和分组维度，指标自动从 Pipeline 数据计算。</p>
          <div class="pivot-filters">
            <label class="pivot-filter-item">
              <span>分组维度</span>
              <select v-model="pivotGroupBy" class="input input-sm">
                <option value="">（不分组 — 汇总）</option>
                <option value="team">部门 (Team)</option>
                <option value="position">岗位 (Position)</option>
                <option value="recruiter">招聘负责人 (Recruiter)</option>
                <option value="recruitType">校招/社招 (Type)</option>
                <option value="interviewer">面试官 (Interviewer)</option>
              </select>
            </label>
            <label class="pivot-filter-item">
              <span>部门</span>
              <select v-model="pivotTeam" class="input input-sm">
                <option value="">全部</option>
                <option v-for="t in pivotTeamOptions" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <label class="pivot-filter-item">
              <span>招聘负责人</span>
              <select v-model="pivotRecruiter" class="input input-sm">
                <option value="">全部</option>
                <option v-for="r in pivotRecruiterOptions" :key="r" :value="r">{{ r }}</option>
              </select>
            </label>
            <label class="pivot-filter-item">
              <span>校招/社招</span>
              <select v-model="pivotRecruitType" class="input input-sm">
                <option value="">全部</option>
                <option value="campus">校招</option>
                <option value="social">社招</option>
              </select>
            </label>
            <label class="pivot-filter-item">
              <span>面试官</span>
              <select v-model="pivotInterviewer" class="input input-sm">
                <option value="">全部</option>
                <option v-for="iv in pivotInterviewerOptions" :key="iv" :value="iv">{{ iv }}</option>
              </select>
            </label>
          </div>
        </div>

        <div class="card pad">
          <h4 class="subsection-title">面试漏斗 & 评分分布</h4>
          <p class="muted small">筛选后共 <strong>{{ pivotFiltered.length }}</strong> 条候选人</p>
          <div class="table-card roster-scroll">
          <table class="data-table compact pivot-table">
            <thead>
              <tr>
                <th v-if="pivotGroupBy">{{ pivotGroupLabel }}</th>
                <th>Total</th>
                <th>简历筛选通过率</th><th>HR面试通过率</th><th>一面通过率</th><th>二面通过率</th><th>终面通过率</th>
                <th>≥3分占比</th><th>≥4分占比</th><th>≥5分占比</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pivotRows" :key="row._key">
                <td v-if="pivotGroupBy" style="font-weight:600">{{ row._key }}</td>
                <td>{{ row.total }}</td>
                <td>{{ row.hrPassRate }} <span class="muted small">({{ row.hrPass }}/{{ row.hrDecided }})</span></td>
                <td>{{ row.hrIvPassRate }} <span class="muted small">({{ row.hrIvPass }}/{{ row.hrIvDecided }})</span></td>
                <td>{{ row.r1PassRate }} <span class="muted small">({{ row.r1Pass }}/{{ row.r1Decided }})</span></td>
                <td>{{ row.r2PassRate }} <span class="muted small">({{ row.r2Pass }}/{{ row.r2Decided }})</span></td>
                <td>{{ row.rfPassRate }} <span class="muted small">({{ row.rfPass }}/{{ row.rfDecided }})</span></td>
                <td>{{ row.score3Pct }} <span class="muted small">({{ row.score3 }}/{{ row.scored }})</span></td>
                <td>{{ row.score4Pct }} <span class="muted small">({{ row.score4 }}/{{ row.scored }})</span></td>
                <td>{{ row.score5Pct }} <span class="muted small">({{ row.score5 }}/{{ row.scored }})</span></td>
              </tr>
              <tr v-if="!pivotRows.length">
                <td :colspan="pivotGroupBy ? 10 : 9" class="muted small" style="text-align:center">无匹配数据</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <div v-if="pivotInterviewerRows.length" class="card pad">
          <h4 class="subsection-title">面试官个人通过率</h4>
          <table class="data-table compact pivot-table">
            <thead><tr><th>面试官</th><th>面试轮次</th><th>通过</th><th>不通过</th><th>总计</th><th>通过率</th></tr></thead>
            <tbody>
              <tr v-for="(row, i) in pivotInterviewerRows" :key="i">
                <td style="font-weight:600">{{ row.interviewer }}</td><td>{{ row.stage }}</td>
                <td class="ov-hl-green">{{ row.pass }}</td><td class="ov-hl-red">{{ row.fail }}</td>
                <td>{{ row.total }}</td><td style="font-weight:600">{{ row.passRate }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ══════════ INTERVIEWER POOL TAB ══════════ -->
      <div v-show="tab === 'pool'" class="page-stack-inner">
        <div class="card pad">
          <h3 class="section-title">面试官池</h3>
          <p class="muted small" style="margin-bottom:10px">从花名册导入面试官，按工种和面试职级分类管理。面试官姓名可在 Pipeline 的 Interviewer 字段中关联。</p>
          <div class="toolbar wrap" style="gap:8px">
            <button v-if="auth.hasPermission('recruit.pool')" type="button" class="btn btn-primary btn-sm" @click="poolShowAdd = true"><i class="fa-solid fa-plus"></i> 添加面试官</button>
          </div>
        </div>

        <!-- Add interviewer modal -->
        <div v-if="poolShowAdd" class="modal-backdrop" @click.self="poolShowAdd = false">
          <div class="modal-box" style="max-width:520px">
            <h3>添加面试官</h3>
            <div class="form-grid" style="grid-template-columns:1fr">
              <label>
                <span class="form-label">选择员工</span>
                <select v-model="poolAddEmpId" class="input">
                  <option :value="null" disabled>-- 请选择 --</option>
                  <option v-for="e in poolAvailableEmps" :key="e.id" :value="e.id">{{ e.name }} · {{ poolEmpDept(e) }} · {{ poolEmpPos(e) }}</option>
                </select>
              </label>
              <label>
                <span class="form-label">面试工种（可多选）</span>
                <div class="pool-check-group">
                  <label v-for="tr in poolTradeList" :key="tr" class="pool-check-item">
                    <input type="checkbox" :value="tr" v-model="poolAddTrades" /> {{ tr }}
                  </label>
                </div>
              </label>
              <label>
                <span class="form-label">面试职级范围（可多选）</span>
                <div class="pool-check-group">
                  <label v-for="lv in poolLevelList" :key="lv" class="pool-check-item">
                    <input type="checkbox" :value="lv" v-model="poolAddLevels" /> {{ lv }}
                  </label>
                </div>
              </label>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="poolShowAdd = false">取消</button>
              <button type="button" class="btn btn-primary" :disabled="!poolAddEmpId || !poolAddTrades.length || !poolAddLevels.length" @click="poolDoAdd">确认添加</button>
            </div>
          </div>
        </div>

        <!-- Edit interviewer modal -->
        <div v-if="poolEditItem" class="modal-backdrop" @click.self="poolEditItem = null">
          <div class="modal-box" style="max-width:520px">
            <h3>编辑面试官</h3>
            <div class="form-grid" style="grid-template-columns:1fr">
              <p style="font-weight:600;margin-bottom:6px">{{ poolEditEmpName }}</p>
              <label>
                <span class="form-label">面试工种</span>
                <div class="pool-check-group">
                  <label v-for="tr in poolTradeList" :key="tr" class="pool-check-item">
                    <input type="checkbox" :value="tr" v-model="poolEditTrades" /> {{ tr }}
                  </label>
                </div>
              </label>
              <label>
                <span class="form-label">面试职级范围</span>
                <div class="pool-check-group">
                  <label v-for="lv in poolLevelList" :key="lv" class="pool-check-item">
                    <input type="checkbox" :value="lv" v-model="poolEditLevels" /> {{ lv }}
                  </label>
                </div>
              </label>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="poolEditItem = null">取消</button>
              <button type="button" class="btn btn-primary" :disabled="!poolEditTrades.length || !poolEditLevels.length" @click="poolDoEdit">保存</button>
            </div>
          </div>
        </div>

        <!-- Pool filter -->
        <div class="card pad">
          <div class="pivot-filters">
            <label class="pivot-filter-item">
              <span>工种</span>
              <select v-model="poolFilterTrade" class="input input-sm">
                <option value="">全部</option>
                <option v-for="tr in poolTradeList" :key="tr" :value="tr">{{ tr }}</option>
              </select>
            </label>
            <label class="pivot-filter-item">
              <span>职级</span>
              <select v-model="poolFilterLevel" class="input input-sm">
                <option value="">全部</option>
                <option v-for="lv in poolLevelList" :key="lv" :value="lv">{{ lv }}</option>
              </select>
            </label>
          </div>
          <p class="muted small" style="margin-top:4px">共 <strong>{{ poolFilteredRows.length }}</strong> 名面试官</p>
        </div>

        <div class="card pad">
          <table class="data-table compact pivot-table">
            <thead>
              <tr>
                <th style="text-align:left">姓名</th>
                <th style="text-align:left">部门</th>
                <th style="text-align:left">岗位</th>
                <th style="text-align:left">当前职级</th>
                <th style="text-align:left">面试工种</th>
                <th style="text-align:left">面试职级范围</th>
                <th>面试场次</th>
                <th>通过率</th>
                <th style="width:80px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in poolFilteredRows" :key="row.id">
                <td style="font-weight:600;text-align:left">{{ row.empName }}</td>
                <td style="text-align:left">{{ row.deptName }}</td>
                <td style="text-align:left">{{ row.posName }}</td>
                <td style="text-align:left"><span class="tag tag-level">{{ row.empLevel }}</span></td>
                <td style="text-align:left"><span v-for="t in row.trades" :key="t" class="tag tag-trade">{{ t }}</span></td>
                <td style="text-align:left"><span v-for="l in row.levels" :key="l" class="tag tag-level">{{ l }}</span></td>
                <td>{{ row.interviewCount }}</td>
                <td :class="row.interviewCount ? '' : 'muted'">{{ row.passRate }}</td>
                <td>
                  <button v-if="auth.hasPermission('recruit.pool')" type="button" class="btn-link" @click="poolStartEdit(row)" title="编辑"><i class="fa-solid fa-pen"></i></button>
                  <button v-if="auth.hasPermission('recruit.pool')" type="button" class="btn-link danger" @click="poolRemove(row.id)" title="移除"><i class="fa-solid fa-trash"></i></button>
                </td>
              </tr>
              <tr v-if="!poolFilteredRows.length">
                <td colspan="9" class="muted small" style="text-align:center;padding:1.5rem">暂无面试官，点击上方「添加面试官」从花名册导入。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
    setup() {
      const data = useDataStore();
      const auth = window.TM.useAuthStore();
      const _zs = window.TM.useZoneScope(data);
      const tab = ref('overview');

      function priorityLabel(p) { return PRIORITY_EN[p] || p || '—'; }
      function recruitTypeLabel(v) { return RECRUIT_TYPE_LABELS[v] || '-'; }

      /* ── Overview ── */
      const overviewData = computed(() => {
        if (!_zs.isManagerZone.value) return buildOverviewAuto(data);
        const proxy = Object.create(data);
        const deptNames = _teamDeptNames.value;
        const origTags = data.positionRecruitTags || {};
        const filteredTags = {};
        if (deptNames) {
          Object.keys(origTags).forEach((key) => {
            const m = key.match(/^(\d+)-(\d+)$/);
            if (!m) return;
            const deptId = Number(m[1]);
            const d = data._deptMap.get(deptId);
            if (d && deptNames.has(d.name)) filteredTags[key] = origTags[key];
          });
        }
        proxy.positionRecruitTags = filteredTags;
        const deptNameSet = deptNames || new Set();
        proxy.recruitmentPipeline = (data.recruitmentPipeline || []).filter((r) => deptNameSet.has(String(r.team || '').trim()));
        return buildOverviewAuto(proxy);
      });

      /* ── Pipeline ── */
      const pipeCols = PIPE_COLS;
      const pipeGroups = PIPE_GROUPS;
      const _teamDeptNames = computed(() => {
        if (!_zs.isManagerZone.value) return null;
        const names = new Set();
        _zs.scopedDepartments.value.forEach((d) => names.add(d.name));
        return names;
      });
      const pipeAllRows = computed(() => {
        const all = data.recruitmentPipeline || [];
        if (!_teamDeptNames.value) return all;
        return all.filter((r) => _teamDeptNames.value.has(String(r.team || '').trim()));
      });
      const pipeSelected = reactive(new Set());

      /* Pipeline filters */
      const pipeFilterTeam = ref('');
      const pipeFilterPos = ref('');
      const pipeFilterRecruiter = ref('');
      const pipeFilterType = ref('');
      const pipeFilterInterviewer = ref('');
      const pipeFilterStatus = ref('');

      const pipeTeamOpts = computed(() => collectUnique(pipeAllRows.value, 'team'));
      const pipePosOpts = computed(() => collectUnique(pipeAllRows.value, 'position'));
      const pipeRecruiterOpts = computed(() => collectUnique(pipeAllRows.value, 'recruiter'));
      const pipeInterviewerOpts = computed(() => collectInterviewers(pipeAllRows.value));

      const pipeHasFilter = computed(() => !!(pipeFilterTeam.value || pipeFilterPos.value || pipeFilterRecruiter.value || pipeFilterType.value || pipeFilterInterviewer.value || pipeFilterStatus.value));

      function clearPipeFilters() {
        pipeFilterTeam.value = '';
        pipeFilterPos.value = '';
        pipeFilterRecruiter.value = '';
        pipeFilterType.value = '';
        pipeFilterInterviewer.value = '';
        pipeFilterStatus.value = '';
      }

      const pipeFilteredRows = computed(() => {
        let list = pipeAllRows.value;
        if (pipeFilterTeam.value) list = list.filter((c) => String(c.team || '').trim() === pipeFilterTeam.value);
        if (pipeFilterPos.value) list = list.filter((c) => String(c.position || '').trim() === pipeFilterPos.value);
        if (pipeFilterRecruiter.value) list = list.filter((c) => String(c.recruiter || '').trim() === pipeFilterRecruiter.value);
        if (pipeFilterType.value) list = list.filter((c) => c.recruitType === pipeFilterType.value);
        if (pipeFilterInterviewer.value) {
          const iv = pipeFilterInterviewer.value;
          list = list.filter((c) => [c.hrScreeningBy, c.interview1By, c.interview2By, c.interviewFinalBy].some((x) => String(x || '').trim() === iv));
        }
        if (pipeFilterStatus.value) list = list.filter((c) => candStatus(c) === pipeFilterStatus.value);
        return list;
      });
      const editingCell = reactive({ rowId: null, key: null });

      function stageLabel(v) { return STAGE_LABELS[v] || '-'; }
      function offerLabel(v) { return OFFER_LABELS[v] || '-'; }

      function pipeTdClass(col, row) {
        const cls = ['pipe-td', 'pipe-td-' + col.type];
        if (col.type === 'stage') cls.push('pipe-stage-' + (row[col.key] || 'empty'));
        if (col.type === 'offer') cls.push('pipe-offer-' + (row[col.key] || 'empty'));
        if (col.type === 'recruitType') cls.push(row[col.key] === 'campus' ? 'pipe-stage-pending' : row[col.key] === 'social' ? 'pipe-stage-pass' : 'pipe-stage-empty');
        if (editingCell.rowId === row.id && editingCell.key === col.key) cls.push('pipe-td-editing');
        return cls.join(' ');
      }

      function cycleStage(current) { const idx = STAGE_VALUES.indexOf(current || ''); return STAGE_VALUES[(idx + 1) % STAGE_VALUES.length]; }
      function cycleOffer(current) { const idx = OFFER_VALUES.indexOf(current || ''); return OFFER_VALUES[(idx + 1) % OFFER_VALUES.length]; }
      function cycleRecruitType(current) { const idx = RECRUIT_TYPE_VALUES.indexOf(current || ''); return RECRUIT_TYPE_VALUES[(idx + 1) % RECRUIT_TYPE_VALUES.length]; }

      function onPipeCellClick(row, col) {
        if (!auth.hasPermission('recruit.add')) return;
        if (col.type === 'stage') { row[col.key] = cycleStage(row[col.key]); savePipeline(); }
        else if (col.type === 'offer') { row[col.key] = cycleOffer(row[col.key]); savePipeline(); }
        else if (col.type === 'recruitType') { row[col.key] = cycleRecruitType(row[col.key]); savePipeline(); }
      }

      function onPipeCellDblClick(row, col, ev) {
        if (!auth.hasPermission('recruit.add')) return;
        if (col.type === 'stage' || col.type === 'offer' || col.type === 'recruitType') return;
        editingCell.rowId = row.id;
        editingCell.key = col.key;
        nextTick(() => { const inp = ev.target.closest('td')?.querySelector('.pipe-inline-input'); if (inp) inp.focus(); });
      }

      function commitEdit(row, key, value) { row[key] = value; editingCell.rowId = null; editingCell.key = null; savePipeline(); }

      function addPipeRow() {
        const list = [...(data.recruitmentPipeline || [])];
        const row = emptyPipeRow(pipeUid(list));
        row.recruitDate = new Date().toISOString().slice(0, 10);
        list.push(row);
        data.recruitmentPipeline = list;
        data._markDirty('recruitmentPipeline');
        data.persistAll();
      }
      function removePipeRow(id) { data.recruitmentPipeline = (data.recruitmentPipeline || []).filter((r) => r.id !== id); pipeSelected.delete(id); data._markDirty('recruitmentPipeline'); data.persistAll(); }
      function deletePipeRows() {
        if (!pipeSelected.size) return;
        if (!confirm(`确认删除选中的 ${pipeSelected.size} 条候选人记录？`)) return;
        const ids = new Set(pipeSelected);
        data.recruitmentPipeline = (data.recruitmentPipeline || []).filter((r) => !ids.has(r.id));
        pipeSelected.clear(); data._markDirty('recruitmentPipeline'); data.persistAll();
      }
      function togglePipeSel(id) { if (pipeSelected.has(id)) pipeSelected.delete(id); else pipeSelected.add(id); }
      function savePipeline() { data.recruitmentPipeline = [...(data.recruitmentPipeline || [])]; data._markDirty('recruitmentPipeline'); data.persistAll(); }

      /* ── Field Map Dialog state ── */
      const fmapVisible = ref(false);
      const fmapMapping = ref([]);
      const fmapHeaders = ref([]);
      const fmapTitle = ref('字段映射确认');
      let fmapPendingJson = null;
      let fmapPendingTarget = null;

      function fmapOnConfirm(confirmedMapping) {
        fmapVisible.value = false;
        if (fmapPendingTarget === 'pipeline') commitPipelineImport(fmapPendingJson, confirmedMapping);
        fmapPendingJson = null;
        fmapPendingTarget = null;
      }

      /* Excel import — step 1: parse file, detect mapping, show dialog */
      function uploadPipeline(ev) {
        const file = ev.target.files?.[0]; ev.target.value = ''; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const XL = ensureXLSX();
            let json;
            if (/\.csv$/i.test(file.name)) { const csvWb = XL.read(String(reader.result), { type: 'string' }); json = XL.utils.sheet_to_json(csvWb.Sheets[csvWb.SheetNames[0]], { defval: '' }); }
            else { const wb = XL.read(reader.result, { type: 'array', cellDates: true }); const sn = wb.SheetNames.find((n) => /pipeline/i.test(n)) || wb.SheetNames[0]; json = XL.utils.sheet_to_json(wb.Sheets[sn], { defval: '' }); }
            if (!json || !json.length) { window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '文件为空', type: 'error' } })); return; }
            const headers = Object.keys(json[0]);
            const mapping = window.TM.fieldMapper.match(PIPE_SCHEMA, headers);
            const allExact = mapping.every((m) => !m.header || m.confidence === 'exact');
            if (allExact && mapping.filter((m) => m.header).length >= 3) {
              commitPipelineImport(json, mapping);
            } else {
              fmapPendingJson = json;
              fmapPendingTarget = 'pipeline';
              fmapHeaders.value = headers;
              fmapMapping.value = mapping;
              fmapTitle.value = 'Pipeline 字段映射确认';
              fmapVisible.value = true;
            }
          } catch (e) { window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '导入失败: ' + e.message, type: 'error' } })); }
        };
        if (/\.csv$/i.test(file.name)) reader.readAsText(file, 'UTF-8'); else reader.readAsArrayBuffer(file);
      }

      /* Excel import — step 2: apply confirmed mapping */
      function commitPipelineImport(json, mapping) {
        const headerToField = {};
        mapping.forEach((m) => { if (m.header) headerToField[m.header] = m.fieldKey; });
        const stageKeys = new Set(['hrScreening','hrInterview','interview1','interview2','interviewFinal']);
        const dateKeys = new Set(['recruitDate','onboardDate','shippedDate','offerBIDate','briStart']);
        var kept = [];
        if (_zs.isManagerZone.value && _teamDeptNames.value) {
          const teamNames = _teamDeptNames.value;
          kept = (data.recruitmentPipeline || []).filter((r) => !teamNames.has(String(r.team || '').trim()));
        }
        const list = [];
        var combined = [...kept];
        json.forEach((row) => {
          const r = emptyPipeRow(pipeUid(combined));
          Object.keys(row).forEach((h) => {
            const fk = headerToField[h];
            if (!fk) return;
            if (stageKeys.has(fk)) { r[fk] = parseStageCell(row[h]); }
            else if (fk === 'offering') { r[fk] = parseOfferCell(row[h]); }
            else if (fk === 'recruitType') {
              const v = String(row[h] ?? '').trim().toLowerCase();
              r[fk] = ['社招','social'].includes(v) ? 'social' : ['校招','campus'].includes(v) ? 'campus' : '';
            }
            else if (dateKeys.has(fk)) { r[fk] = cellToDateString(row[h]); }
            else { r[fk] = String(row[h] ?? '').trim(); }
          });
          if (r.name) { list.push(r); combined.push(r); }
        });
        if (_zs.isManagerZone.value && _teamDeptNames.value) {
          data.recruitmentPipeline = kept.concat(list);
        } else {
          data.recruitmentPipeline = list;
        }
        data._markDirty('recruitmentPipeline');
        data.persistAll();
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: `已导入 ${list.length} 条候选人（${_zs.isManagerZone.value ? '团队范围覆盖' : '全量覆盖'}）`, type: 'success' } }));
      }

      function downloadPipeTemplate() {
        try {
          const XL = ensureXLSX(); const wb = XL.utils.book_new();
          XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet([PIPE_COLS.map((c) => c.label), PIPE_COLS.map((c) => { if (c.type === 'date') return '2026-01-05'; if (c.type === 'stage') return 'pass'; if (c.type === 'offer') return 'pending'; if (c.type === 'recruitType') return 'social'; return ''; })]), 'Pipeline');
          XL.writeFile(wb, 'pipeline_template.xlsx');
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: 'Template downloaded', type: 'success' } }));
        } catch (e) { window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: e.message, type: 'error' } })); }
      }
      function exportPipeline() {
        try {
          const XL = ensureXLSX(); const wb = XL.utils.book_new();
          const rows = pipeAllRows.value.map((r) => PIPE_COLS.map((c) => r[c.key] ?? ''));
          XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet([PIPE_COLS.map((c) => c.label), ...rows]), 'Pipeline');
          XL.writeFile(wb, 'pipeline_export.xlsx');
          window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: `Exported ${rows.length} rows`, type: 'success' } }));
        } catch (e) { window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: e.message, type: 'error' } })); }
      }

      /* ── Metrics Pivot ── */
      const pivotGroupBy = ref('team');
      const pivotTeam = ref('');
      const pivotRecruiter = ref('');
      const pivotRecruitType = ref('');
      const pivotInterviewer = ref('');

      const allPipe = computed(() => {
        const all = data.recruitmentPipeline || [];
        if (!_teamDeptNames.value) return all;
        return all.filter((r) => _teamDeptNames.value.has(String(r.team || '').trim()));
      });
      const pivotTeamOptions = computed(() => collectUnique(allPipe.value, 'team'));
      const pivotRecruiterOptions = computed(() => collectUnique(allPipe.value, 'recruiter'));
      const pivotInterviewerOptions = computed(() => collectInterviewers(allPipe.value));

      const pivotGroupLabel = computed(() => {
        return { team: '部门', position: '岗位', recruiter: '招聘负责人', recruitType: '校招/社招', interviewer: '面试官' }[pivotGroupBy.value] || '';
      });

      const pivotFiltered = computed(() => {
        let list = allPipe.value;
        if (pivotTeam.value) list = list.filter((c) => String(c.team || '').trim() === pivotTeam.value);
        if (pivotRecruiter.value) list = list.filter((c) => String(c.recruiter || '').trim() === pivotRecruiter.value);
        if (pivotRecruitType.value) list = list.filter((c) => c.recruitType === pivotRecruitType.value);
        if (pivotInterviewer.value) {
          const iv = pivotInterviewer.value;
          list = list.filter((c) =>
            [c.hrScreeningBy, c.interview1By, c.interview2By, c.interviewFinalBy].some((x) => String(x || '').trim() === iv),
          );
        }
        return list;
      });

      const pivotRows = computed(() => {
        const filtered = pivotFiltered.value;
        const gb = pivotGroupBy.value;
        if (!gb) {
          const m = computeMetrics(filtered);
          m._key = '合计';
          return [m];
        }
        if (gb === 'interviewer') {
          const byIv = {};
          filtered.forEach((c) => {
            ['hrScreeningBy','interview1By','interview2By','interviewFinalBy'].forEach((k) => {
              const iv = String(c[k] || '').trim();
              if (!iv) return;
              if (!byIv[iv]) byIv[iv] = [];
              byIv[iv].push(c);
            });
          });
          const rows = Object.entries(byIv).map(([key, cands]) => {
            const m = computeMetrics(cands);
            m._key = key;
            return m;
          });
          rows.sort((a, b) => a._key.localeCompare(b._key, 'zh-Hans-CN'));
          return rows;
        }
        const groups = {};
        filtered.forEach((c) => {
          const val = String(c[gb] || '').trim() || '(empty)';
          if (!groups[val]) groups[val] = [];
          groups[val].push(c);
        });
        const rows = Object.entries(groups).map(([key, cands]) => {
          const m = computeMetrics(cands);
          m._key = key;
          return m;
        });
        rows.sort((a, b) => a._key.localeCompare(b._key, 'zh-Hans-CN'));
        return rows;
      });

      const pivotInterviewerRows = computed(() => computeInterviewerMetrics(pivotFiltered.value));

      /* ── Interviewer Pool ── */
      const poolTradeList = computed(() => window.TM.JOB_TRADES || ['Frontend', 'Mobile', 'Backend', 'SDET', 'QA', 'Algorithm', 'Big Data']);
      const poolLevelList = computed(() => window.TM.JOB_LEVELS || ['E', 'SE', 'EE', 'SEE', 'AM', 'M', 'PE', 'SM']);

      const poolShowAdd = ref(false);
      const poolAddEmpId = ref(null);
      const poolAddTrades = ref([]);
      const poolAddLevels = ref([]);

      const poolEditItem = ref(null);
      const poolEditTrades = ref([]);
      const poolEditLevels = ref([]);
      const poolEditEmpName = ref('');

      const poolFilterTrade = ref('');
      const poolFilterLevel = ref('');

      const poolExistingEmpIds = computed(() => new Set((data.interviewerPool || []).map((p) => p.employeeId)));

      const poolAvailableEmps = computed(() => {
        const ids = poolExistingEmpIds.value;
        return (_zs.scopedEmployees.value || [])
          .filter((e) => e.status !== 'leave' && !ids.has(e.id))
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN'));
      });

      function poolEmpDept(e) {
        return data._deptMap.get(e.departmentId)?.name || '—';
      }
      function poolEmpPos(e) {
        const p = data._posMap.get(e.positionId);
        return (p && p.departmentId === e.departmentId) ? p.name : '—';
      }
      function poolEmpLevel(e) {
        const p = data._posMap.get(e.positionId);
        return (p && p.departmentId === e.departmentId) ? (p.level || '—') : '—';
      }

      function poolUid() {
        const pool = data.interviewerPool || [];
        return pool.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
      }

      function poolDoAdd() {
        if (!poolAddEmpId.value || !poolAddTrades.value.length || !poolAddLevels.value.length) return;
        const pool = [...(data.interviewerPool || [])];
        pool.push({
          id: poolUid(),
          employeeId: poolAddEmpId.value,
          trades: [...poolAddTrades.value],
          levels: [...poolAddLevels.value],
        });
        data.interviewerPool = pool;
        data._markDirty('interviewerPool');
        data.persistAll();
        poolShowAdd.value = false;
        poolAddEmpId.value = null;
        poolAddTrades.value = [];
        poolAddLevels.value = [];
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '面试官已添加', type: 'success' } }));
      }

      function poolStartEdit(row) {
        poolEditItem.value = row;
        poolEditTrades.value = [...row.trades];
        poolEditLevels.value = [...row.levels];
        poolEditEmpName.value = row.empName;
      }

      function poolDoEdit() {
        if (!poolEditItem.value) return;
        const pool = [...(data.interviewerPool || [])];
        const idx = pool.findIndex((p) => p.id === poolEditItem.value.id);
        if (idx >= 0) {
          pool[idx] = { ...pool[idx], trades: [...poolEditTrades.value], levels: [...poolEditLevels.value] };
          data.interviewerPool = pool;
          data._markDirty('interviewerPool');
          data.persistAll();
        }
        poolEditItem.value = null;
        window.dispatchEvent(new CustomEvent('tm-toast', { detail: { message: '已保存', type: 'success' } }));
      }

      function poolRemove(id) {
        if (!confirm('确认移除该面试官？')) return;
        data.interviewerPool = (data.interviewerPool || []).filter((p) => p.id !== id);
        data._markDirty('interviewerPool');
        data.persistAll();
      }

      const _interviewerStats = computed(() => {
        const pipe = data.recruitmentPipeline || [];
        const stats = new Map();
        pipe.forEach((c) => {
          const stages = [
            { by: c.hrScreeningBy, result: c.hrScreening },
            { by: c.interview1By, result: c.interview1 },
            { by: c.interview2By, result: c.interview2 },
            { by: c.interviewFinalBy, result: c.interviewFinal },
          ];
          stages.forEach((s) => {
            const name = String(s.by || '').trim();
            if (!name || (s.result !== 'pass' && s.result !== 'fail')) return;
            if (!stats.has(name)) stats.set(name, { count: 0, pass: 0 });
            const st = stats.get(name);
            st.count++;
            if (s.result === 'pass') st.pass++;
          });
        });
        return stats;
      });

      const poolFilteredRows = computed(() => {
        const empMap = data._empMap;
        const pool = data.interviewerPool || [];
        const iStats = _interviewerStats.value;
        let rows = pool.map((p) => {
          const emp = empMap.get(p.employeeId);
          const empName = emp ? emp.name : `(ID:${p.employeeId})`;
          const deptName = emp ? poolEmpDept(emp) : '—';
          const posName = emp ? poolEmpPos(emp) : '—';
          const empLevel = emp ? poolEmpLevel(emp) : '—';

          const nameStr = empName.trim();
          const st = iStats.get(nameStr) || { count: 0, pass: 0 };
          const interviewCount = st.count;
          const passCount = st.pass;

          return {
            id: p.id,
            employeeId: p.employeeId,
            empName: empName,
            deptName,
            posName,
            empLevel,
            trades: p.trades || [],
            levels: p.levels || [],
            interviewCount,
            passRate: interviewCount > 0 ? Math.round((passCount / interviewCount) * 1000) / 10 + '%' : '—',
          };
        });

        if (poolFilterTrade.value) rows = rows.filter((r) => r.trades.includes(poolFilterTrade.value));
        if (poolFilterLevel.value) rows = rows.filter((r) => r.levels.includes(poolFilterLevel.value));

        rows.sort((a, b) => a.empName.localeCompare(b.empName, 'zh-Hans-CN'));
        return rows;
      });

      return {
        auth, data, tab, priorityLabel, recruitTypeLabel,
        overviewData,
        fmapVisible, fmapMapping, fmapHeaders, fmapTitle, fmapOnConfirm,
        pipeCols, pipeGroups, pipeAllRows, pipeFilteredRows, pipeSelected, editingCell,
        pipeFilterTeam, pipeFilterPos, pipeFilterRecruiter, pipeFilterType, pipeFilterInterviewer, pipeFilterStatus,
        pipeTeamOpts, pipePosOpts, pipeRecruiterOpts, pipeInterviewerOpts,
        pipeHasFilter, clearPipeFilters,
        stageLabel, offerLabel, pipeTdClass,
        onPipeCellClick, onPipeCellDblClick, commitEdit,
        addPipeRow, removePipeRow, deletePipeRows, togglePipeSel,
        uploadPipeline, downloadPipeTemplate, exportPipeline,
        pivotGroupBy, pivotTeam, pivotRecruiter, pivotRecruitType, pivotInterviewer,
        pivotTeamOptions, pivotRecruiterOptions, pivotInterviewerOptions,
        pivotGroupLabel, pivotFiltered, pivotRows, pivotInterviewerRows,
        poolTradeList, poolLevelList,
        poolShowAdd, poolAddEmpId, poolAddTrades, poolAddLevels,
        poolAvailableEmps, poolEmpDept, poolEmpPos,
        poolDoAdd,
        poolEditItem, poolEditTrades, poolEditLevels, poolEditEmpName,
        poolStartEdit, poolDoEdit, poolRemove,
        poolFilterTrade, poolFilterLevel, poolFilteredRows,
      };
    },
  };
})();
