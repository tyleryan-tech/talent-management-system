const { buildHrContext } = require('./aiKnowledge');
const { localAnswer } = require('./aiDataset');

const DEFAULT_TIMEOUT_MS = 8500;
const MAX_QUESTION_CHARS = 1200;
const MAX_DATASET_CHARS = 52000;

function modelConfig() {
  const deepseekKey = process.env.DEEPSEEK_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const apiKey = deepseekKey || openaiKey;
  const baseUrl = String(
    process.env.DEEPSEEK_BASE_URL
    || process.env.OPENAI_BASE_URL
    || (deepseekKey ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1'),
  ).trim().replace(/\/+$/, '');
  const model = String(
    process.env.DEEPSEEK_MODEL
    || process.env.OPENAI_MODEL
    || (deepseekKey ? 'deepseek-chat' : 'gpt-4o-mini'),
  ).trim();
  const timeoutMs = Number(process.env.AI_ANALYST_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  return { apiKey, baseUrl, model, timeoutMs };
}

function isAiModelConfigured() {
  return !!modelConfig().apiKey;
}

function compactDataset(dataset) {
  const json = JSON.stringify(dataset, null, 2);
  if (json.length <= MAX_DATASET_CHARS) return json;
  const slim = {
    ...dataset,
    employeeSamples: (dataset.employeeSamples || []).slice(0, 30),
    organization: {
      ...dataset.organization,
      departments: (dataset.organization?.departments || []).slice(0, 15),
    },
    performance: {
      ...dataset.performance,
      byDepartment: (dataset.performance?.byDepartment || []).slice(0, 8),
    },
  };
  return JSON.stringify(slim, null, 2).slice(0, MAX_DATASET_CHARS);
}

function validateQuestion(question) {
  const text = String(question || '').trim();
  if (!text) {
    const err = new Error('请输入要分析的问题');
    err.status = 400;
    err.code = 'AI_EMPTY_QUESTION';
    throw err;
  }
  if (text.length > MAX_QUESTION_CHARS) {
    const err = new Error(`问题过长，请控制在 ${MAX_QUESTION_CHARS} 字以内`);
    err.status = 400;
    err.code = 'AI_QUESTION_TOO_LONG';
    throw err;
  }
  return text;
}

async function callChatCompletion(messages, config) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), config.timeoutMs);
  try {
    const resp = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
        max_tokens: 1800,
      }),
    });
    const text = await resp.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!resp.ok) {
      const err = new Error(body?.error?.message || body?.error || resp.statusText || 'AI 模型调用失败');
      err.status = resp.status;
      throw err;
    }
    const answer = body?.choices?.[0]?.message?.content;
    if (!answer) throw new Error('AI 模型未返回有效内容');
    return String(answer).trim();
  } finally {
    clearTimeout(tid);
  }
}

async function answerQuestion(questionInput, dataset, authContext) {
  const question = validateQuestion(questionInput);
  const config = modelConfig();
  if (!config.apiKey) {
    return {
      mode: 'local_summary',
      model: null,
      answer: localAnswer(question, dataset),
      warning: '未配置 AI 模型密钥，已返回系统内置分析摘要。',
    };
  }

  const hrContext = buildHrContext(question, authContext);
  const dataJson = compactDataset(dataset);
  const messages = [
    {
      role: 'system',
      content: [
        '你是人才管理系统内置的 HR 数据分析助手。',
        '你只能基于服务端传入的当前权限范围数据回答，不能声称看到了范围外数据。',
        '不得编造员工、候选人、薪酬、绩效或审批事实。',
        '涉及高敏感事项时，用“风险线索/建议复核/需人工确认”，不要替代正式审批或制度结论。',
        '输出 Markdown，结构为：核心结论、多维度分析、风险提示、建议动作。',
        hrContext,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户问题：${question}`,
        '当前权限范围内的数据集 JSON 如下：',
        dataJson,
      ].join('\n\n'),
    },
  ];

  try {
    return {
      mode: 'model',
      model: config.model,
      answer: await callChatCompletion(messages, config),
      warning: '',
    };
  } catch (e) {
    return {
      mode: 'local_fallback',
      model: config.model,
      answer: localAnswer(question, dataset),
      warning: `AI 模型暂不可用，已返回系统内置分析摘要：${e.message || '调用失败'}`,
    };
  }
}

module.exports = {
  answerQuestion,
  isAiModelConfigured,
  modelConfig,
  validateQuestion,
};
