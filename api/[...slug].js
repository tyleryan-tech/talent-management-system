/**
 * Vercel Serverless：直接运行 Express 后端（SQLite 存 /tmp，冷启动自动 seed 演示数据）。
 * 无需额外后端平台，全部在 Vercel 免费版上运行。
 */
const createApp = require('../server/src/app');

module.exports = (req, res) => {
  const app = createApp();
  app(req, res);
};
