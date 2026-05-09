# AGENTS.md

本文件给 Codex / AI 编码代理使用。进入本项目后，先阅读本文件，再按需阅读 `README.md`、`server/README.md`、`.cursor/rules/*.mdc`。

## Codex 知识库入口

本项目已整理结构化知识库，优先阅读：

- `docs/codex-knowledge/README.md`
- `docs/codex-knowledge/codebase-map.md`
- `docs/codex-knowledge/business-rules.md`
- `docs/codex-knowledge/development-principles.md`
- `docs/codex-knowledge/testing-rules.md`
- `docs/codex-knowledge/prompt-templates.md`
- `docs/codex-knowledge/source-inventory.md`

如果需要完整代码反向梳理，再阅读 `docs/system-analysis-for-codex.md`。

其中 `docs/codex-knowledge/business-rules.md` 已合并 HRBP 制度资料摘要。凡是涉及薪酬、考勤、绩效、晋升、离职、调动、审批、员工状态、招聘 offer 或候选人评价的改动，必须先输出方案和需人工确认项，再等待确认后开发。

## 项目概况

- 这是一个人才管理系统，前端以 `index.html` + `js/` 为当前主线，使用 Vue 3 全局构建、Vue Router 4、Pinia 2、ECharts。
- 后端主线为 `api/[...slug].js` 内嵌 `server/src/app.js` 的 Express 应用，用于 Vercel Serverless；`server/` 也可独立运行。
- `go-server/` 是兼容现有前端 API 的备选 Go 后端。
- `src/` 是 Vite/TypeScript 结构，当前不要默认认为它覆盖 `index.html` 主线。

## 默认工作规则

1. 修改前先判断运行模式：纯前端 `localStorage`、Vercel Serverless 同源 API、独立 Node 后端或 Go 后端。
2. 所有功能必须同时考虑 HRBP、汇报经理、超级管理员/产品线负责人等角色权限。
3. UI 可见范围、前端 store 过滤、服务端 API 裁剪和写入校验必须保持一致。
4. 员工主数据必须保持单一事实来源；审批未通过的变更不得写入权威数据源或展示为已保存。
5. 产品线数据按 `tm_L{lineId}_*` 隔离；全局用户数据使用 `tm_global_users`，不得被产品线作用域操作污染。
6. 切换产品线、周期、角色等上下文前，必须同步落盘脏数据，再切上下文，再 hydrate；切换路径中不得依赖 debounce / setTimeout 写入。
7. 加载本地存储数据时要做防御性校验，包括主键去重、必填字段、外键引用和历史脏数据修复。
8. 新增文件上传/Excel 导入入口时，使用 `TM.fieldMapper.match(schema, headers)` 和 `FieldMapDialog`，不得硬编码列位置。
9. 面向终端用户的提示和报错使用中文；技术细节进入日志、监控或告警。
10. 所有技术方案按约 1 万名员工规模评估，注意并发、批量任务、查询、存储、同步和可观测性。

## 常用入口

- 前端入口：`index.html`
- 路由：`js/router.js`
- 启动与同步：`js/main.js`
- 核心数据 store：`js/stores/dataStore.js`
- 认证与角色：`js/stores/authStore.js`
- 产品线：`js/stores/productLineStore.js`
- HRBP 范围：`js/stores/hrScopeStore.js`
- 服务端同步：`js/utils/serverSync.js`
- 字段映射：`js/utils/fieldMapper.js`
- 后端入口：`api/[...slug].js`、`server/src/app.js`
- 测试入口：`tests/index.html`

## 测试纪律

- 修改 store action、computed、持久化、产品线切换、绩效流程、权限范围、导入导出后，必须运行或明确说明未运行 `tests/index.html`。
- 每次开发任务结束默认运行 `npm run verify:dev:self-heal`，并在最终回复说明 `test-reports/dev-check-latest.md` 的结果；环境缺失导致跳过时必须说明。
- 本项目默认开启“测试自动维护模式”：凡是新增、调整或修复功能，Codex 必须在同一任务内自动评估影响范围，并新增或更新最匹配的测试；用户不需要单独提醒“补测试”。
- 功能行为变更的最低测试要求：一个正向用例、一个边界/异常用例；bug 修复必须补回归用例；权限、产品线、绩效、审批、导入、同步、考勤等高风险改动必须同时覆盖角色/范围/一致性风险。
- 如果某次改动不新增测试，最终回复必须明确说明原因，例如“仅文档变更，无运行行为变化”；不能因为时间或疏忽跳过应补测试。
- 新增 store action 至少补一个正向用例和一个边界/异常用例。
- 修复 bug 时补回归测试，放在最匹配的测试文件中。
- 高风险场景包括：产品线切换、员工状态变更、绩效周期创建、绩效审批/驳回、数据导入。

## 部署注意

- Vercel 当前为演示架构：静态前端 + Serverless Express + `/tmp/talent-hub.db`。
- Vercel `/tmp` 非持久，冷启动可能重新 seed；生产环境必须迁移到外部数据库或独立持久后端。
- Vercel 不支持长连接 WebSocket，前端应使用轮询回退。
- 不要在 `C:\Users\26104` 的旧错误 Git 仓库层级操作；本项目仓库根是 `C:\Users\26104\Desktop\人才管理`。
