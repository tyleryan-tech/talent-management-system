/**
 * Vercel Serverless：将 /api/* 转发到独立 Node 后端（环境变量 TM_API_ORIGIN，无尾斜杠）。
 * 前端可设 meta tm-api-base=__SAME_ORIGIN__ 或 localStorage tm_api_base 为当前站点 origin。
 */
module.exports = async (req, res) => {
  const origin = process.env.TM_API_ORIGIN;
  if (!origin || typeof origin !== 'string') {
    res.status(503).json({
      error:
        '后端未配置：请在 Vercel 项目 Environment Variables 中设置 TM_API_ORIGIN（Node API 根地址，无尾斜杠，例如 https://your-api.example.com）。',
      code: 'TM_API_ORIGIN_MISSING',
    });
    return;
  }

  const base = String(origin).replace(/\/$/, '');
  let slug = req.query.slug;
  if (slug == null) slug = [];
  else if (!Array.isArray(slug)) slug = [slug];
  const sub = slug.map((s) => String(s)).join('/');
  const pathPart = sub ? `/api/${sub}` : '/api';

  let search = '';
  try {
    const u = new URL(req.url, 'http://localhost');
    search = u.search || '';
  } catch {
    /* ignore */
  }

  const dest = `${base}${pathPart}${search}`;

  const hop = {};
  const ct = req.headers['content-type'];
  if (ct) hop['content-type'] = ct;
  const auth = req.headers.authorization;
  if (auth) hop.authorization = auth;
  const acc = req.headers.accept;
  if (acc) hop.accept = acc;

  const method = (req.method || 'GET').toUpperCase();
  let body;
  if (!['GET', 'HEAD'].includes(method)) {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
      req.on('error', reject);
    });
  }

  let fr;
  try {
    fr = await fetch(dest, { method, headers: hop, body, redirect: 'manual' });
  } catch (e) {
    res.status(502).json({
      error: `无法连接后端：${e && e.message ? e.message : String(e)}`,
      code: 'UPSTREAM_UNREACHABLE',
    });
    return;
  }

  const buf = Buffer.from(await fr.arrayBuffer());
  res.status(fr.status);
  fr.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (['content-encoding', 'transfer-encoding', 'connection'].includes(k)) return;
    try {
      res.setHeader(key, value);
    } catch {
      /* ignore invalid hop-by-hop names */
    }
  });
  res.send(buf);
};
