# Codebase Map

## 系统定位

这是一个人才管理原型系统，覆盖花名册、组织、绩效、人才盘点、考勤、招聘、培训、请假、用户与权限、AI 分析等模块。

当前主线是：

- 前端：`index.html` + `js/` 顺序加载脚本。
- 状态管理：Vue 3 全局构建 + Vue Router 4 + Pinia 2。
- 图表：ECharts。
- 当前线上架构：Vercel 静态前端 + Serverless Express API + SQLite 临时数据。
- 数据同步：本地 localStorage/IndexedDB 缓存 + 服务端 workspace snapshot + optimistic version。

`src/` 下的 Vite/TypeScript 结构存在，但当前不要默认当成生产主线。

## 关键入口

| 路径 | 作用 |
| --- | --- |
| `index.html` | 当前前端入口，按固定顺序加载全局脚本 |
| `js/main.js` | 启动、Pinia 创建、数据 hydrate、服务端同步 |
| `js/router.js` | Hash 路由与权限守卫 |
| `js/stores/dataStore.js` | 核心业务 store，员工、部门、绩效、考勤、招聘等 |
| `js/stores/authStore.js` | 登录、角色、权限、会话 |
| `js/stores/productLineStore.js` | 产品线注册表、产品线切换、服务端拉取 |
| `js/stores/hrScopeStore.js` | HRBP 顶部组织范围 |
| `js/utils/serverSync.js` | 服务端 API 通信、patch、轮询/WebSocket |
| `api/[...slug].js` | Vercel Serverless 入口，内嵌 Express app |
| `server/src/app.js` | Node/Express 应用入口 |
| `server/src/routes.js` | Node API 路由 |
| `server/src/db.js` | SQLite 表、seed、workspace snapshot |
| `server/src/workspaceScope.js` | 服务端读裁剪 |
| `server/src/workspacePatch.js` | 服务端 patch 合并与经理写入校验 |
| `server/src/aiDataset.js` | AI 分析只读数据集与内置摘要 |
| `server/src/aiService.js` | AI 模型调用与降级逻辑 |
| `server/src/aiKnowledge.js` | AI 分析 HR 规则上下文 |
| `go-server/` | 兼容当前前端 API 的备选 Go 后端 |
| `ai-analyst/` | 旧版 Streamlit 分析服务，保留为备用入口 |
| `tests/index.html` | 浏览器端测试入口 |

## 业务模块与主要文件

| 模块 | 主要文件 | 当前实现重点 |
| --- | --- | --- |
| 花名册 | `js/views/hrbp/Roster.js`, `dataStore.js` | 员工主数据、导入导出、列配置、状态/薪资段位展示 |
| 组织与编制 | `js/views/hrbp/Organization.js`, `js/utils/orgApprovalChain.js` | 部门树、目标 HC、组织变更审批 |
| 绩效 | `js/views/hrbp/Performance.js`, `js/views/manager/Performance.js`, `js/utils/performanceWorkflow.js` | 周期、RM 初评、多级审批、HRBP 校准、PL 审批、归档、沟通、申诉 |
| 人才盘点 | `js/views/hrbp/Talent.js` | 九宫格、高潜、继任、发展计划、飞行风险 |
| 考勤 | `js/views/hrbp/Attendance.js`, `js/utils/attendanceCalc.js` | 打卡导入、月度聚合、工时/负荷统计 |
| 招聘 | `js/views/hrbp/Recruitment.js` | Pipeline、候选人导入导出、面试官池、岗位关联 |
| 培训 | `js/views/manager/Training.js` | 课程与员工培训记录 |
| 请假 | `js/views/manager/Leaves.js`, `dataStore.leaveRequests` | 请假记录、状态更新 |
| 用户权限 | `js/views/hrbp/UserManagement.js`, `js/views/admin/UserManagement.js`, `authStore.js` | 用户、角色、模块权限、经理审批 |
| 产品线 | `js/views/admin/ProductLines.js`, `productLineStore.js` | 产品线创建、删除、切换与数据隔离 |
| AI 分析 | `js/views/hrbp/AiAnalyst.js`, `server/src/ai*.js` | 主系统原生聊天页 + 同源后端 AI API；旧 Streamlit 保留备用 |

## 数据模型概览

物理 SQLite 表：

- `product_lines`
- `workspace_snapshots`
- `login_users`

业务数据主要保存在 `workspace_snapshots.json` 内，前端通过 `dataStore` 管理逻辑集合：

- `employees`
- `departments`
- `positions`
- `users`
- `leaveRequests`
- `performanceCycles`
- `performanceReviews`
- `attendanceRules`
- `punchRecords`
- `attendanceRecords`
- `recruitmentPipeline`
- `interviewerPool`
- `talentMatrix`
- `successionPlans`
- `trainings`
- `employeeTrainings`
- `notifications`
- `orgChangeRequests`
- `orgSettings`

## API 概览

Node 和 Go 后端目标 API 兼容：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health`, `/api/health` | 健康检查 |
| `POST` | `/api/auth/login` | 登录，返回 token 和 user |
| `GET` | `/api/auth/me` | 获取当前用户 |
| `GET` | `/api/product-lines` | 产品线列表 |
| `POST` | `/api/product-lines` | HRBP 创建产品线 |
| `DELETE` | `/api/product-lines/:id` | HRBP 删除产品线 |
| `GET` | `/api/workspace/:lineId` | 获取 workspace、version、scope |
| `POST` | `/api/workspace/:lineId/patch` | 增量保存，经理受服务端范围校验 |
| `PUT` | `/api/workspace/:lineId` | 全量保存，仅 HRBP/超级管理员 |
| `GET` | `/api/ai-analyst/context` | 当前 AI 分析上下文和数据概览 |
| `POST` | `/api/ai-analyst/chat` | 基于当前权限范围生成模型/内置分析 |
| `WS` | `/ws?token=JWT` | 独立后端可用；Vercel Serverless 不支持长连接 |

## 运行模式

- 纯前端模式：双击 `index.html` 或静态服务器打开，数据保存在浏览器。
- Vercel 模式：`api/[...slug].js` 内嵌 Express，SQLite 位于 `/tmp/talent-hub.db`。
- 独立 Node：`cd server && npm install && npm start`。
- 备选 Go：`cd go-server && go test ./...`，可作为兼容后端演进方向。
- AI Analyst：主路径走同源 `/api/ai-analyst/*`，复用主后端权限裁剪；`ai-analyst/` 仅作为旧版备用服务。
