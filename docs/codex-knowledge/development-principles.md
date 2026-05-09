# Development Principles

## Codex 工作方式

处理需求前先判断影响范围：

- 当前主线前端：`index.html` + `js/`
- Vite/TypeScript 结构：`src/`
- Node/Vercel 后端：`api/`、`server/`
- Go 兼容后端：`go-server/`
- AI 分析服务：`ai-analyst/`

除非用户明确要求，不要把 `src/` 当成当前生产主线。

## 高风险需求必须先出方案

以下需求不要直接编码：

- 员工状态。
- 权限和组织范围。
- 绩效周期、审批、校准、归档、申诉。
- 组织变更审批。
- 招聘 offer、薪酬字段、候选人评价。
- 离职、调动、年假、考勤。
- 产品线切换和数据同步。
- 服务端 workspace scope 和 patch。

先输出：

1. 业务影响分析。
2. 涉及的代码模块。
3. 涉及的 HRBP 规则和需人工确认项。
4. 数据模型和 API 影响。
5. 权限、审计、数据一致性风险。
6. 测试计划。
7. 预计修改文件。

## 代码修改原则

- 优先沿用现有 `dataStore`、`authStore`、`productLineStore`、`serverSync` 模式。
- 做最小、聚焦的改动。
- 不重写整个模块，除非用户明确确认。
- 不把未确认制度写死进代码。
- 不硬编码人员姓名、办公室地址、年度绩效日程、审批人、政策阈值。
- 新增字段要同步 seed、hydrate、export/import、服务端 patch 白名单、测试和 AI 分析映射。
- 新增导入入口必须使用 `TM.fieldMapper.match(schema, headers)` 和 `FieldMapDialog`。

## 数据一致性原则

- `employees` 是员工主数据事实来源。
- 审批中的变更存在审批单，不提前写入主集合。
- 产品线作用域数据与全局数据严格分离。
- 切换产品线/角色/周期前，必须同步落盘，取消 pending push，再切换并 hydrate/pull。
- 从 localStorage/IndexedDB/服务端 snapshot 加载时，要防御历史脏数据。

## 权限原则

权限必须在四层一致：

- 页面和按钮可见性。
- Pinia store 过滤和 computed。
- 服务端 GET 裁剪。
- 服务端 POST/PUT 写入校验。

重点角色：

- HRBP。
- HRBP super admin / admin / intern。
- 汇报经理。
- 待审批经理。
- 产品线负责人。
- 超级管理员。

## 后端原则

- Vercel `/tmp` SQLite 只适合演示，不适合生产。
- 独立 Node 或 Go 后端应保留 workspace version 乐观并发。
- 经理写入必须走 patch，并由服务端验证员工范围。
- 全量 PUT 只允许 HRBP/超级管理员。
- 生产化前必须规划外部数据库、监控、告警、审计、备份和权限最小化。
