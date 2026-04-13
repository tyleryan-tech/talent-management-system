/**
 * Roster column definitions, fuzzy header matching, and default layout (non-module).
 */
(function (w) {
  const TM = w.TM || (w.TM = {});

  const DEFS = [
    {
      key: 'staffId',
      defaultLabel: 'Staff ID',
      exportable: true,
      excelAliases: ['Staff ID', 'staff id', 'employee id', 'emp id', '工号', '员工编号'],
      keywords: ['staff', 'employee', 'emp', 'id', 'badge', 'number', '工号', '编号'],
    },
    {
      key: 'displayName',
      defaultLabel: 'Display Name',
      exportable: true,
      excelAliases: ['Display Name', '姓名', 'Name', '员工姓名', '员工名'],
      keywords: ['name', 'display', 'full', '姓名', '名字'],
    },
    {
      key: 'teamPath',
      defaultLabel: 'Team Path',
      exportable: true,
      excelAliases: ['Team Path', '团队路径', '组织路径', 'Path'],
      keywords: ['path', 'hierarchy', 'org path', '团队', '路径'],
    },
    {
      key: 'team',
      defaultLabel: 'Team',
      exportable: true,
      excelAliases: ['Team', '部门', 'Dept', 'Department'],
      keywords: ['team', 'dept', 'department', '部门', '科室'],
    },
    {
      key: 'teamId',
      defaultLabel: 'Team ID',
      exportable: true,
      excelAliases: ['Team ID', '部门ID', 'Department ID', 'Dept ID'],
      keywords: ['team id', 'dept id', 'department id', '部门'],
    },
    {
      key: 'jobFunction',
      defaultLabel: 'Job Function',
      exportable: true,
      excelAliases: ['Job Function', '工种', '岗位', 'Job', 'Role'],
      keywords: ['job', 'function', 'trade', 'role', '工种', '岗位'],
    },
    {
      key: 'jobFunctionSlotId',
      defaultLabel: 'Job Function Slot ID',
      exportable: true,
      excelAliases: ['Job Function Slot ID', '工种编制ID', 'Position ID', 'Slot ID', '编制ID'],
      keywords: ['slot', 'position id', '编制', '岗位id'],
    },
    {
      key: 'rank',
      defaultLabel: 'Rank',
      exportable: true,
      excelAliases: ['Rank', '职级', 'Level', 'Grade'],
      keywords: ['rank', 'level', 'grade', '职级', '级别'],
    },
    {
      key: 'title',
      defaultLabel: 'Title',
      exportable: true,
      excelAliases: ['Title', '组织角色', 'Org Role', 'IC'],
      keywords: ['title', 'org role', 'ic', 'pic', 'rm', '组织角色'],
    },
    {
      key: 'age',
      defaultLabel: 'Age',
      exportable: true,
      excelAliases: ['Age', '年龄', '岁数'],
      keywords: ['age', '年龄'],
    },
    {
      key: 'payPosition',
      defaultLabel: 'Pay position',
      exportable: true,
      excelAliases: ['Pay position', '薪资段位', 'Pay band', 'Salary band'],
      keywords: ['pay', 'salary', 'band', 'position', 'p25', '薪资'],
    },
    {
      key: 'performance',
      defaultLabel: 'Performance',
      exportable: true,
      excelAliases: ['Performance', '绩效', '绩效记录'],
      keywords: ['performance', 'review', '绩效'],
    },
    {
      key: 'school',
      defaultLabel: 'School',
      exportable: true,
      excelAliases: ['School', '毕业院校', 'University', 'College'],
      keywords: ['school', 'university', 'college', 'grad', '院校', '毕业'],
    },
    {
      key: 'yoe',
      defaultLabel: 'YoE',
      exportable: true,
      excelAliases: ['YoE', '工龄', 'Years of experience', 'Work exp'],
      keywords: ['yoe', 'experience', 'tenure', 'career', '工龄'],
    },
    {
      key: 'companyTenure',
      defaultLabel: 'Company tenure',
      exportable: true,
      excelAliases: ['Company tenure', '入司年限', '司龄'],
      keywords: ['company', 'tenure', '司龄', '入司'],
    },
    {
      key: 'tenureInCurrentRank',
      defaultLabel: 'Tenure In Current Rank',
      exportable: true,
      excelAliases: ['Tenure In Current Rank', '同职级停留', 'Rank tenure'],
      keywords: ['tenure', 'rank', 'current', '同职级', '停留'],
    },
    {
      key: 'potential',
      defaultLabel: 'Potential',
      exportable: true,
      excelAliases: ['Potential', '潜力', '九宫格'],
      keywords: ['potential', '九宫', '潜力'],
    },
    {
      key: 'managementPlan',
      defaultLabel: 'Management plan',
      exportable: true,
      excelAliases: ['Management plan', '管理计划', 'Dev plan'],
      keywords: ['management', 'plan', 'dev', '管理计划'],
    },
    {
      key: 'reportingManager',
      defaultLabel: 'Reporting Manager',
      exportable: true,
      excelAliases: ['Reporting Manager', '汇报经理', 'Manager ID', 'Line manager'],
      keywords: ['manager', 'reporting', 'line', '汇报', '经理'],
    },
    {
      key: 'status',
      defaultLabel: 'Status',
      exportable: true,
      excelAliases: ['Status', '状态', 'Employment status'],
      keywords: ['status', 'state', 'employment', '状态'],
    },
    {
      key: 'statusLabel',
      defaultLabel: 'Status Label',
      exportable: true,
      excelAliases: ['Status Label', '状态说明'],
      keywords: ['status label', '说明'],
    },
    {
      key: 'gender',
      defaultLabel: 'Gender',
      exportable: true,
      excelAliases: ['Gender', '性别'],
      keywords: ['gender', 'sex', '性别'],
    },
    {
      key: 'birthday',
      defaultLabel: 'Birthday',
      exportable: true,
      excelAliases: ['Birthday', '生日', 'DOB', 'Date of birth'],
      keywords: ['birth', 'dob', '生日'],
    },
    {
      key: 'hireDate',
      defaultLabel: 'Hire Date',
      exportable: true,
      excelAliases: ['Hire Date', '入职日期', 'Join date'],
      keywords: ['hire', 'join', 'onboard', '入职'],
    },
    {
      key: 'careerStartDate',
      defaultLabel: 'Career Start Date',
      exportable: true,
      excelAliases: ['Career Start Date', '参加工作日期', 'Career start'],
      keywords: ['career', 'start', '工作', '参加'],
    },
    {
      key: 'rankStartDate',
      defaultLabel: 'Rank Start Date',
      exportable: true,
      excelAliases: ['Rank Start Date', '现任职级起始日', 'Level start'],
      keywords: ['rank start', 'level start', '职级起始'],
    },
    {
      key: 'mobile',
      defaultLabel: 'Mobile',
      exportable: true,
      excelAliases: ['Mobile', '手机', 'Phone', 'Tel'],
      keywords: ['mobile', 'phone', 'cell', '手机', '电话'],
    },
    {
      key: 'email',
      defaultLabel: 'Email',
      exportable: true,
      excelAliases: ['Email', '邮箱', 'E-mail'],
      keywords: ['email', 'mail', '邮箱'],
    },
    {
      key: 'avgHours6m',
      defaultLabel: 'Avg Hours (6m)',
      exportable: true,
      excelAliases: ['Avg Hours 6m', '6个月平均工时', '日均工时'],
      keywords: ['hours', '工时', 'avg', 'attendance', '考勤', '出勤'],
    },
  ];

  const BY_KEY = Object.fromEntries(DEFS.map((d) => [d.key, d]));

  function defaultColumnSettings() {
    const order = [
      'staffId', 'displayName', 'teamPath', 'team', 'jobFunction', 'rank', 'title', 'age', 'payPosition',
      'performance', 'school', 'yoe', 'companyTenure', 'tenureInCurrentRank', 'potential', 'managementPlan',
      'reportingManager', 'status', 'avgHours6m',
    ];
    return {
      version: 1,
      columns: order.map((key) => ({ key, visible: true, label: '' })),
    };
  }

  function normalizeRosterColumnSettings(raw) {
    const fallback = defaultColumnSettings();
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns) || !raw.columns.length) {
      return fallback;
    }
    const valid = new Set(DEFS.map((d) => d.key));
    const cols = raw.columns
      .filter((c) => c && valid.has(c.key))
      .map((c) => ({
        key: c.key,
        visible: c.visible !== false,
        label: String(c.label || '').trim(),
      }));
    if (!cols.length) return fallback;
    const seen = new Set(cols.map((c) => c.key));
    DEFS.forEach((d) => {
      if (!seen.has(d.key)) cols.push({ key: d.key, visible: false, label: '' });
    });
    return { version: 1, columns: cols };
  }

  function resolveColumns(settings) {
    const norm = normalizeRosterColumnSettings(settings);
    return norm.columns.map((c) => {
      const def = BY_KEY[c.key];
      return {
        ...c,
        defaultLabel: def.defaultLabel,
        exportable: def.exportable,
        labelResolved: c.label || def.defaultLabel,
      };
    });
  }

  function visibleResolvedColumns(settings) {
    return resolveColumns(settings).filter((c) => c.visible);
  }

  function normalizeHeaderToken(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[_\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function diceCoefficient(a, b) {
    const A = normalizeHeaderToken(a);
    const B = normalizeHeaderToken(b);
    if (!A.length || !B.length) return 0;
    if (A === B) return 1;
    const bigrams = (str) => {
      const g = [];
      for (let i = 0; i < str.length - 1; i += 1) g.push(str.slice(i, i + 2));
      return g;
    };
    const ga = bigrams(` ${A} `);
    const gb = new Map();
    const bg = bigrams(` ${B} `);
    bg.forEach((x) => {
      gb.set(x, (gb.get(x) || 0) + 1);
    });
    let inter = 0;
    ga.forEach((x) => {
      const n = gb.get(x) || 0;
      if (n > 0) {
        inter += 1;
        gb.set(x, n - 1);
      }
    });
    return (2 * inter) / (ga.length + bg.length);
  }

  function scoreHeaderForField(header, def) {
    const h = normalizeHeaderToken(header);
    if (!h) return 0;
    let best = 0;
    const pool = [def.defaultLabel, ...(def.excelAliases || []), ...(def.keywords || [])];
    pool.forEach((t) => {
      const tn = normalizeHeaderToken(t);
      if (!tn) return;
      if (h === tn) {
        best = 1;
        return;
      }
      if (h.includes(tn) || tn.includes(h)) {
        const shorter = Math.min(h.length, tn.length);
        const longer = Math.max(h.length, tn.length);
        if (shorter / longer >= 0.5) best = Math.max(best, 0.88);
      }
      best = Math.max(best, diceCoefficient(h, tn));
    });
    return best;
  }

  /**
   * Greedy one-to-one match: Excel column header string -> field key
   * @returns {Record<string, string>} fieldKey -> exact header key as in file
   */
  function buildFieldToExcelMap(headerList) {
    const headers = (headerList || []).map((h) => String(h));
    const fieldKeys = DEFS.map((d) => d.key);
    const pairs = [];
    headers.forEach((header, index) => {
      fieldKeys.forEach((fk) => {
        const sc = scoreHeaderForField(header, BY_KEY[fk]);
        pairs.push({ header, index, fieldKey: fk, sc });
      });
    });
    pairs.sort((a, b) => b.sc - a.sc);
    const map = {};
    const usedIdx = new Set();
    const usedFk = new Set();
    const MIN = 0.4;
    pairs.forEach(({ header, index, fieldKey, sc }) => {
      if (sc < MIN) return;
      if (usedIdx.has(index) || usedFk.has(fieldKey)) return;
      usedIdx.add(index);
      usedFk.add(fieldKey);
      map[fieldKey] = header;
    });
    return map;
  }

  /**
   * Headers left-to-right: each maps to best unused field; remaining fields hidden.
   */
  function proposeColumnsFromHeaders(headerList) {
    const headers = (headerList || []).map((h) => String(h).trim()).filter(Boolean);
    const assignedFields = new Set();
    const ordered = [];
    const unmatched = [];
    const matchedPreview = [];
    const MIN = 0.4;
    headers.forEach((h) => {
      let bestK = null;
      let bestS = MIN;
      DEFS.forEach((d) => {
        if (assignedFields.has(d.key)) return;
        const s = scoreHeaderForField(h, d);
        if (s > bestS) {
          bestS = s;
          bestK = d.key;
        }
      });
      if (bestK) {
        assignedFields.add(bestK);
        ordered.push({ key: bestK, visible: true, label: h });
        matchedPreview.push({ header: h, fieldKey: bestK, score: bestS });
      } else {
        unmatched.push(h);
        matchedPreview.push({ header: h, fieldKey: null, score: 0 });
      }
    });
    DEFS.forEach((d) => {
      if (!assignedFields.has(d.key)) ordered.push({ key: d.key, visible: false, label: '' });
    });
    return {
      columns: normalizeRosterColumnSettings({ version: 1, columns: ordered }).columns,
      unmatched,
      matchedPreview,
    };
  }

  TM.rosterFieldDefs = DEFS;
  TM.rosterFieldByKey = BY_KEY;
  TM.defaultRosterColumnSettings = defaultColumnSettings;
  TM.normalizeRosterColumnSettings = normalizeRosterColumnSettings;
  TM.resolveRosterColumns = resolveColumns;
  TM.visibleRosterColumns = visibleResolvedColumns;
  TM.buildRosterFieldToExcelMap = buildFieldToExcelMap;
  TM.proposeRosterColumnsFromHeaders = proposeColumnsFromHeaders;
  TM.scoreRosterHeaderForField = scoreHeaderForField;
})(window);
