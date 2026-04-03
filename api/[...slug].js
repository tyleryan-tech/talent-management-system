/**
 * Vercel Serverless：直接运行 Express 后端（SQLite 存 /tmp，冷启动自动 seed 演示数据）。
 * 无需额外后端平台，全部在 Vercel 免费版上运行。
 *
 * 关键：Vercel 运行时已读取并解析 req.body（JSON），但 Express 的 body-parser
 * 会再次尝试从流中读取——此时流已消费完毕，body 会变成 undefined。
 * 设置 req._body = true 告诉 body-parser 跳过流读取，直接使用已有的 req.body。
 */
const createApp = require('../server/src/app');

module.exports = (req, res) => {
  if (req.body !== undefined && req.body !== null) {
    req._body = true;
  }
  const app = createApp();
  app(req, res);
};
