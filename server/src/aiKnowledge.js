const TOPICS = [
  {
    key: 'recruitment',
    title: '招聘',
    keywords: ['招聘', '候选', '简历', '面试', 'offer', 'Offer', '录用', '漏斗'],
    rules: [
      '招聘遵循先内后外、公平公正、计划性、任职资格准入、经济适用原则。',
      '招聘需求应基于业务规划、人员流动、人才结构等提出，并经过 GM/HRM 审核。',
      '候选人资料、面试评价和 Offer 信息属于敏感信息，需要保密。',
    ],
    lenses: [
      '按岗位、部门、招聘类型拆解招聘漏斗。',
      '关注 HR 筛选、一面、二面、终面、Offer 接受率等转化环节。',
      '样本量不足时不能过度解读。',
    ],
    risks: ['不要建议收集与岗位无关或可能构成歧视的信息。'],
  },
  {
    key: 'performance',
    title: '绩效',
    keywords: ['绩效', '评级', '等级', '初评', '校准', '归档', '申诉', 'review'],
    rules: [
      '绩效流程包含 RM 初评、多级审批、HRBP 校准、产品线负责人审批、归档。',
      '归档前不得把未完成审批的结果当作最终结论。',
      '高绩效通常指最终等级 A+/A/A- 且流程已 finalized；低绩效通常指 C/C-。',
    ],
    lenses: [
      '按部门、职级、经理、周期观察等级分布。',
      '区分已归档结果与流程中结果，避免混用。',
      '对异常分布、低绩效集中、高绩效低薪酬等情况给出风险提示。',
    ],
  },
  {
    key: 'promotion',
    title: '晋升',
    keywords: ['晋升', '提名', '升职', '职级', 'rank', 'promotion', '答辩'],
    rules: [
      '晋升基础要求包含任职时间、绩效、价值观，能力是决定性因素。',
      '不存在仅因 tenure 自动晋升。',
      '晋升结果需校准后确认，提名和审批过程保密。',
    ],
    lenses: ['结合绩效、职级任职时间、价值观证据、潜力和业务影响评估晋升准备度。'],
    risks: ['不得把 AI 建议表述为最终晋升结论。'],
  },
  {
    key: 'transfer',
    title: '内部调动',
    keywords: ['调动', '转岗', '转组', '内部流动', 'transfer', '跨地', '跨国'],
    rules: [
      '内部调动通常要求当前岗位满 1 年、过去 1 年绩效 B 及以上。',
      '调动生效日为每月 1 日，至少预留 1 个月交接期。',
      '跨地或跨国调动涉及转出地离职、资产归还、转入地入职和资产领取。',
    ],
    lenses: ['检查 tenure、历史绩效、交接周期、目标岗位匹配度。'],
  },
  {
    key: 'resignation',
    title: '离职',
    keywords: ['离职', 'last working day', 'LWD', '辞职', '离职面谈', '交接'],
    rules: [
      '正式员工至少提前 30 天申请；试用期员工和实习生至少提前 3 天申请。',
      '离职申请需经过 Product Line 审批，HRBP 可进行离职面谈并启动后续流程。',
      'Last Working Day 办理包括工作交接、IT 资产归还、财务确认、行政工卡归还、HR 社保公积金/假期确认、离职证明。',
    ],
    lenses: ['分析离职员工的部门、经理、绩效、司龄、关键岗位和交接风险。'],
    risks: ['扣款、赔偿、经济补偿等法律敏感表述需 HR/法务确认。'],
  },
  {
    key: 'attendance',
    title: '考勤',
    keywords: ['考勤', '工时', '出勤', '打卡', '负荷', '加班', '请假'],
    rules: [
      '当前系统考勤基于打卡导入和月度聚合。',
      '正式排班、节假日、请假扣减、补卡和异常申诉规则需要按公司制度进一步确认。',
    ],
    lenses: [
      '按部门、月份、员工观察平均日工时、出勤天数和负荷异常。',
      '对高负荷和低出勤只提示风险，不直接给纪律处分结论。',
    ],
  },
  {
    key: 'values',
    title: '价值观',
    keywords: ['价值观', '用户至上', '顺势应变', '分秒必争', '全力以赴', '保持谦逊'],
    rules: [
      '公司价值观包括用户至上、顺势应变、分秒必争、全力以赴、保持谦逊。',
      '价值观适合作为绩效或晋升的定性维度，应保存行为证据和例子。',
    ],
    lenses: ['回答中应要求结合具体行为证据，避免泛泛评价。'],
  },
];

const GENERAL_RULES = [
  '员工主数据以 employees 为单一事实来源。',
  '审批未通过的变更不得展示为已生效或已保存。',
  '页面可见范围、store 过滤、服务端裁剪和写入校验必须一致。',
  '薪酬、绩效、晋升、离职、调动、招聘 Offer、候选人评价属于高敏感主题。',
];

function detectTopics(question) {
  const q = String(question || '').toLowerCase();
  return TOPICS.filter((topic) => topic.keywords.some((k) => q.includes(String(k).toLowerCase())));
}

function buildHrContext(question, authContext) {
  const topics = detectTopics(question);
  const lines = ['【公司 HRBP 知识库依据】'];
  GENERAL_RULES.forEach((rule) => lines.push(`- ${rule}`));

  if (authContext) {
    const productLine = authContext.productLine?.name;
    const scope = authContext.permissions?.scope;
    if (productLine || scope) {
      lines.push('【当前访问上下文】');
      if (productLine) lines.push(`- 当前产品线：${productLine}。回答必须限定在当前产品线语境下。`);
      if (scope) lines.push(`- 当前数据范围：${scope}。不得声称已看到范围外数据。`);
    }
  }

  if (topics.length) {
    lines.push('【命中的 HR 主题规则】');
    topics.forEach((topic) => {
      lines.push(`## ${topic.title}`);
      topic.rules.forEach((rule) => lines.push(`- 规则：${rule}`));
      topic.lenses.forEach((lens) => lines.push(`- 分析口径：${lens}`));
      (topic.risks || []).forEach((risk) => lines.push(`- 风险边界：${risk}`));
    });
  } else {
    lines.push('【通用回答口径】');
    lines.push('- 先基于数据给结论，再说明限制和建议；不能把样本不足的数据过度归因。');
  }

  lines.push('【输出要求】');
  lines.push('- 全程中文，明确区分数据发现、制度依据、风险提示和管理建议。');
  lines.push('- 对未在数据中验证的内容使用“建议核实/需确认”，不得编造成已发生事实。');
  return lines.join('\n');
}

module.exports = {
  buildHrContext,
  detectTopics,
};
