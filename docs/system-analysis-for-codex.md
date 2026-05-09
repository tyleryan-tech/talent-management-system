# 人才管理系统代码梳理与 Codex 工作规范

本文档基于当前仓库代码阅读生成，目标是给后续开发、测试和 Codex 协作提供系统级上下文。凡是从代码能看到实现、但不能确认它就是正式业务政策的内容，均标记为 **需人工确认**。本文不编造未在代码中出现的 HR 政策。

## 1. 技术栈和项目结构

### 当前主线

- 前端主线是 `index.html` 加 `js/` 普通脚本顺序加载，不是 `src/` 下的 Vite/TypeScript 结构。
- 前端依赖通过 CDN 加载：Vue 3.4.27、Vue Router 4.4.0、Pinia 2.2.1、SheetJS `xlsx` 0.18.5、Font Awesome。ECharts 通过 `js/utils/echartsLoader.js` 按需加载。
- 状态管理以 Pinia store 为核心：`dataStore` 保存 HR 业务工作区，`authStore` 保存登录态与权限，`productLineStore` 保存产品线，`hrScopeStore` 保存 HRBP 组织范围。
- 本地存储支持 `localStorage` 与 IndexedDB；业务数据按产品线键 `tm_L{lineId}_{key}` 隔离，用户数据走全局键 `tm_global_users`。
- 服务端同步由 `js/utils/serverSync.js` 实现：GET 拉取工作区、PUT 全量保存、POST patch 增量保存、版本号乐观并发、WebSocket 或轮询刷新。

### 后端

- Vercel Serverless 入口是 `api/[...slug].js`，直接调用 `server/src/app.js` 的 Express app。
- 独立 Node 后端位于 `server/`，主要依赖 Express、better-sqlite3、JWT、bcryptjs、cookie-parser、CORS、express-rate-limit、ws。
- Go 兼容后端位于 `go-server/`，使用 Gin、SQLite、JWT、Gorilla WebSocket，API 设计兼容当前前端 `serverSync.js`。
- AI 分析服务位于 `ai-analyst/`，是 Streamlit + OpenAI + SQLAlchemy/pandas 的独立分析应用，使用自己的一套 SQLite 分析表。

### 主要目录

| 路径 | 作用 |
|---|---|
| `index.html` | 当前前端入口，按固定顺序加载所有脚本 |
| `js/views/` | 页面组件，分 HRBP、manager、admin 视图 |
| `js/stores/` | Pinia stores，核心业务状态和权限 |
| `js/utils/` | 服务端同步、绩效流、组织审批链、考勤计算、字段映射等 |
| `js/constants/` | 工种、职级、阈值常量 |
| `server/src/` | Node/Express 后端 |
| `api/[...slug].js` | Vercel Serverless 包装入口 |
| `go-server/` | 兼容 API 的 Go 后端 |
| `ai-analyst/` | AI 数据分析服务 |
| `tests/` | 浏览器内测试运行器与用例 |
| `src/` | Vite/TypeScript 结构，目前不是主线 |

## 2. 核心 HR 业务模块

| 模块 | 主要文件 | 代码中已确认的职责 |
|---|---|---|
| 员工花名册 | `js/views/hrbp/Roster.js`, `js/stores/dataStore.js` | 员工主数据增删改、状态标记、Excel 导入导出、列配置、薪资段位展示 |
| 组织与编制 | `js/views/hrbp/Organization.js`, `js/utils/orgApprovalChain.js` | 部门树、目标 HC、空编招聘标记、组织调整审批 |
| 绩效管理 | `js/views/hrbp/Performance.js`, `js/views/manager/Performance.js`, `js/utils/performanceWorkflow.js` | 周期创建、RM 初评、逐级审批、HRBP 校准、产品线负责人审批、归档、沟通、申诉 |
| 人才盘点 | `js/views/hrbp/Talent.js` | 九宫格、潜力评级、发展计划、高潜列表、继任计划、飞行风险启发式评分 |
| 考勤 | `js/views/hrbp/Attendance.js`, `js/utils/attendanceCalc.js` | 打卡导入、日均工时统计、部门/个人视图、工时颜色分层 |
| 招聘 | `js/views/hrbp/Recruitment.js` | 招聘 pipeline、候选人导入导出、面试官池、开放岗位关联 |
| 培训 | `js/views/manager/Training.js` | 课程与员工培训推荐/状态 |
| 请假 | `js/views/manager/Leaves.js`, `dataStore.leaveRequests` | 请假记录与状态更新 |
| 用户、角色、产品线 | `js/stores/authStore.js`, `js/views/admin/UserManagement.js`, `js/views/admin/ProductLines.js` | 登录、模块/操作权限、超级管理员、产品线创建删除切换 |
| AI 分析 | `js/views/hrbp/AiAnalyst.js`, `ai-analyst/` | 嵌入 Streamlit 分析应用，读取分析库回答数据问题 |

## 3. 数据库表结构和关键字段含义

### 3.1 Node/Go 后端物理 SQLite 表

当前 Node 与 Go 后端物理表基本一致。真正的业务数据主要作为 JSON 存在 `workspace_snapshots.json` 中。

| 表 | 字段 | 含义 |
|---|---|---|
| `product_lines` | `id` | 产品线主键，自增 |
|  | `name` | 产品线名称 |
|  | `created_at` | 创建日期 |
| `workspace_snapshots` | `line_id` | 产品线 ID，主键，关联 `product_lines.id` |
|  | `json` | 完整工作区 JSON，包含员工、部门、绩效、考勤等集合 |
|  | `version` | 乐观并发版本号，写入时要求 `clientVersion` 一致 |
|  | `updated_at` | 最近更新时间 |
| `login_users` | `id` | 登录用户主键 |
|  | `email` | 登录邮箱，唯一 |
|  | `password_hash` | bcrypt 密码哈希 |
|  | `username` | 用户名，可用于登录 |
|  | `role` | 角色，代码中主要为 `hrbp` 或 `manager`；超管通过 `super_admin` 标记映射 |
|  | `real_name` | 真实姓名 |
|  | `employee_id` | 关联员工 ID，可为空 |
|  | `super_admin` | 0/1，是否超级管理员 |

### 3.2 工作区 JSON 的逻辑业务集合

这些集合不是 Node 后端中的独立表，但在前端 store、服务端快照、patch 合并和 AI 分析映射中承担“业务表”角色。

| 集合 | 关键字段 | 含义 |
|---|---|---|
| `employees` | `id`, `staffId`, `name`/`displayName` | 员工主键、工号、姓名 |
|  | `departmentId`, `positionId`, `managerId` | 部门、岗位/编制、直属上级 |
|  | `hireDate`, `status` | 入职日期、状态；代码中状态为 `active`/`probation`/`leave` |
|  | `orgRole` | 组织角色：`IC`/`PIC`/`RM` 或空 |
|  | `salaryBand` | 薪资段位：`below_min`/`p25`/`p50`/`p75`/`above_max`，无实际薪资金额 |
|  | `careerStartDate`, `levelStartDate`, `gradSchool`, `managementPlan`, `age` | 扩展画像字段 |
| `departments` | `id`, `name`, `parentId`, `managerId`, `hcPlan` | 部门树、负责人、计划编制 |
| `positions` | `id`, `name`, `level`, `departmentId`, `reportingManagerId` | 目标 HC/岗位槽位；`name` 规范为 7 类工种，`level` 规范为 8 个职级 |
| `users` | `id`, `username`, `email`, `role`, `realName`, `employeeId` | 前端本地用户数据 |
|  | `superAdmin`, `hrbpSubType`, `rmStatus`, `allowedModules`, `allowedLineIds`, `managerPermissions` | 权限配置 |
| `leaveRequests` | `id`, `employeeId`, `type`, `startDate`, `endDate`, `reason`, `status`, `approverId`, `createdAt` | 请假申请；类型示例为年假、病假、事假、调休 |
| `performanceCycles` | `id`, `name`, `cycleType`, `startDate`, `endDate`, `status`, `cutoffDate` | 绩效周期；`cycleType` 为 `half_year`/`year` |
| `performanceReviews` | `id`, `employeeId`, `reviewerId`, `cycleId`, `status` | 员工在周期内的一条绩效评估 |
|  | `rmInitialGrade`, `finalGrade`, `approvalChain`, `approvalStepIndex`, `pendingApproverId`, `approvalLog` | 初评、终评、审批链与日志 |
|  | `historyPerformance`, `outputDescription`, `prevCycleAvgHours`, `comments`, `devAdvice`, `rmComment` | 绩效输入与评语 |
|  | `communicatedAt`, `appealDeadline`, `appealStatus`, `appealReason`, `appealResult` | 沟通与申诉 |
| `trainings` | `id`, `title`, `description`, `category`, `durationHours` | 培训课程 |
| `employeeTrainings` | `id`, `employeeId`, `trainingId`, `status`, `recommendedBy`, `completionDate` | 员工培训记录 |
| `attendanceRules` | `workStart`, `workEnd`, `leaveTypes`, `labels`, `monthlyStandardDays`, `loadBandLow`, `loadBandHigh` | 考勤规则与负荷阈值 |
| `punchRecords` | `id`, `employeeId`, `date`, `time` | 原始打卡事件 |
| `attendanceRecords` | `id`, `employeeId`, `month`, `avgDailyHours`, `workDays`, `presentDays`, `lateCount`, `attendanceRate`, `actualWorkHours`, `expectedMonthHours`, `loadRatio`, `loadTier` | 月度考勤统计 |
| `kpiLibrary` | `id` 等 | KPI 库；当前代码仅有基础增删改入口 |
| `talentMatrix` | `employeeId`, `performance`, `potential`, `developmentPlan` | 九宫格；`performance` 为 A/B/C，`potential` 为 H/M/L |
| `successionPlans` | `id`, `positionId`, `successorIds`, `note` | 继任计划 |
| `notifications` | `id`, `employeeId`, `title`, `message`, `read`, `createdAt` | 通知 |
| `positionRecruitTags` | key: `departmentId-positionId`, value: `{ priority }` | 空编/岗位招聘标记，优先级 `high`/`medium`/`low` |
| `recruitmentPipeline` | `id`, `recruitDate`, `name`, `team`, `position`, `recruitType`, `recruiter`, interview/offer 字段 | 招聘候选人流程表 |
| `interviewerPool` | `id`, `employeeId`, `trades`, `levels` | 面试官池 |
| `orgSettings` | `productLineHeadEmployeeId` | 产品线负责人 |
| `orgChangeRequests` | `id`, `type`, `payload`, `status`, `approvalChain`, `pendingApproverId`, `log` | 组织变更审批单 |
| `rosterColumnSettings` | `version`, `columns` | 花名册列顺序、显隐和表头 |
| `hrScopeRootDepartmentId` | 数字或 `null` | HRBP 顶部组织范围；`null`/0 表示全产品线 |

### 3.3 AI 分析服务表

`ai-analyst/init_db.py` 建立一套分析用 SQLite 表，字段多为工作区集合的 snake_case 映射：`departments`、`positions`、`employees`、`users`、`leave_requests`、`performance_cycles`、`performance_reviews`、`trainings`、`employee_trainings`、`attendance_records`、`talent_matrix`、`succession_plans`、`recruitment_pipeline`、`notifications`。它用于自然语言查询与分析，不是当前前端写入的权威数据源。

## 4. 从代码中推断出的业务规则

### 代码已明确体现

- 花名册员工主数据是多数模块的事实来源。员工被新增、删除、离职或切换岗位后，会同步清理或补齐九宫格、绩效、考勤、请假、培训、通知、继任等引用。
- `leave` 状态员工不进入活跃员工统计，不进入新绩效周期生成，不保留在九宫格中；`active` 与 `probation` 在多数“非离职”逻辑中被同等纳入。
- 彻底删除员工会清理部门负责人、汇报关系、产品线负责人、岗位候选人、考勤、打卡、请假、培训、继任候选等引用；但不会因为当前产品线缺少员工就清空全局 `users.employeeId`。
- 新绩效周期创建时，为所有非 `leave` 且未晚于 `cutoffDate` 入职的员工生成 `rm_pending` 评估记录。
- RM 初评必须选择有效等级，且 `outputDescription` 不能为空；保存后状态从 `rm_pending` 到 `rm_evaluated`。
- RM 批量提交会把同一 RM、同一周期下所有 `rm_evaluated` 记录推进到审批链；无上级审批链时直接进入 `pl_pending`。
- 绩效审批链从 RM 的上级开始向上，遇到产品线负责人前停止；产品线负责人审批是 HRBP 校准后的单独阶段。
- 绩效状态流代码为：`rm_pending` → `rm_evaluated` → `in_approval` → `pl_pending` → `calibrated` → `pl_approved` → `finalized`。另有 `rejected` 兼容状态，但当前驳回更多是回退到上一级或 RM。
- 逐级审批在某一级审批人完成其所有待审批记录后，自动推进该级所有记录到下一审批人或 `pl_pending`。
- 整批驳回会驳回同一 RM、同一周期、同一审批步骤的所有 `in_approval` 记录。
- 绩效沟通只允许在 `finalized` 或 `pl_approved` 状态记录；沟通后申诉期代码设置为 3 天。
- 申诉只允许在 `finalized`、已沟通、未过申诉期、且没有已处理/待处理申诉的记录上发起；HRBP 处理申诉可调整最终等级。
- 年度绩效归档后会同步九宫格 performance：有 C/C- 为 C；A 档年度等级占比 >= 50% 且无 C/C- 为 A；否则为 B。
- 组织变更由 HRBP、超级管理员或产品线负责人提交时会自动生效；普通经理提交时生成 `orgChangeRequests`，按部门负责人向上加产品线负责人的链路审批，全部通过后才应用 payload。
- HRBP 组织范围为“选中部门及全部子部门”；配置类数据如考勤规则仍按产品线全量保留。
- 经理可见范围是本人加递归下属；服务端 GET 会裁剪员工、部门、岗位、请假、绩效、考勤、打卡、通知、九宫格、继任、用户等数据。
- 服务端写入使用乐观锁，`clientVersion` 不一致返回版本冲突。
- HRBP/超级管理员可全量 PUT 工作区；经理只能走 patch，且服务端校验 patch 键和员工范围。
- Excel 导入入口使用 `TM.fieldMapper.match(schema, headers)` 和 `FieldMapDialog` 做字段映射；不能依赖固定列位置。

### 需人工确认

- **需人工确认**：`probation` 员工在代码中通常按“非离职”处理，是否所有绩效、考勤、人才盘点都应纳入试用期员工，需要业务确认。
- **需人工确认**：绩效等级 `A+` 到 `C-`、数字分数到等级的阈值、年度 A/B/C 汇总规则是否为正式绩效政策。代码实现了规则，但看不到制度来源。
- **需人工确认**：绩效沟通后 3 天申诉期是否为正式申诉政策。
- **需人工确认**：组织变更中 HRBP/产品线负责人免审批是否符合正式授权矩阵。
- **需人工确认**：请假仅有状态与审批人字段，代码未实现假期余额、法定假期、日期冲突、半天假等政策。
- **需人工确认**：考勤 `09:30-18:30`、每月标准 20 天、负荷阈值 0.88/1.12、工时颜色阈值 9.5/10/10.5/11 是否仅为演示配置，还是正式考勤政策。
- **需人工确认**：薪资段位仅作为离散标签和风险启发式输入，代码未包含实际薪资、薪酬计算、调薪或审批政策。
- **需人工确认**：`orgSettings.productLineHeadEmployeeId` 是当前主代码使用字段；测试里还出现 `productLineOwnerEmployeeId`，需确认是否存在历史字段需要迁移或统一。

## 5. 权限、审批、薪资、考勤等高风险逻辑

### 权限

- 前端路由、菜单、按钮与 store 权限共同控制可见性；后端仍必须校验写入，不能只依赖前端隐藏按钮。
- HRBP 子类型包括 `super_admin`、`admin`、`intern`；普通 HRBP admin 默认可访问模块，但可通过 `disabledOps` 禁用操作。
- 经理权限由 `managerPermissions.modules` 和 `managerPermissions.ops` 控制；`rmStatus === 'pending_approval'` 时仅允许 dashboard/performance 的有限访问。
- 产品线负责人被视为 `super_admin` 等效权限。
- 服务端 GET/POST patch 会按角色裁剪或校验；全量 PUT 只允许 HRBP/超级管理员。
- 高风险点：前端 `auth.hasPermission()`、路由守卫、服务端 `workspaceScope`/`workspacePatch` 必须同步变更。

### 审批

- 组织审批 pending 状态下 payload 不应用；最后一级审批通过后才调用 `applyOrgChangeRequestPayload()`。这是防止未审批变更污染主数据的关键逻辑。
- 绩效审批中，HRBP/超级管理员可作为代理审批或驳回；上级经理也可代下级审批。**需人工确认**：代操作范围是否符合正式授权。
- 整批驳回是高风险流程，因为它会改变多个评估记录；已有测试覆盖同一 RM、同一周期、同一步骤的批量回退。
- 绩效归档要求同一周期所有记录为 `pl_approved` 或 `finalized`，否则不归档。

### 薪资

- 当前只有 `salaryBand`/`payPosition` 标签，没有工资数额、薪资计算、薪酬审批、调薪历史。
- `below_min` 和 `p25` 会增加人才流失风险分；`below_min`/`above_max` 在人才列表中有风险/低风险样式。
- 招聘 pipeline 中有 `cash`、`basePackage` 等 offer 字段，但未看到薪酬政策或计算逻辑。**需人工确认**：这些字段是否需要权限隔离、脱敏或审批。

### 考勤

- 上传打卡数据会通过字段映射识别员工、日期、时间；当前 `Attendance.js` 调用 `data.importRawPunches(rows, { replace: true })`，会替换现有打卡记录并重算考勤，属于高风险入口。
- `attendanceCalc.recomputeRecords()` 按员工和月份聚合原始打卡，以每日最早/最晚打卡计算日工时，再得到月均日工时。
- `dataStore.recomputeAttendanceFromPunches()` 里存在使用 `clockIn/clockOut` 的路径，而当前导入的 `punchRecords` 是 `date/time` 事件形态。**需人工确认**：该函数是否仍被业务使用，是否需要统一原始打卡模型。
- 考勤颜色分层是 UI 规则，不应直接等同于劳动合规判断。**需人工确认**：是否需要异常申诉、补卡、请假扣减、节假日排班等正式规则。

### 产品线与同步

- 产品线切换前必须 `flushBeforeLineSwitch()`，再切换 `currentLineId`，再 hydrate/pull；否则脏数据可能写入错误产品线。
- 服务端同步有 550ms push debounce，切换产品线时会取消 pending push。
- Vercel 的 SQLite 在 `/tmp/talent-hub.db`，冷启动后可能重新 seed；不能作为生产持久数据。
- 本地用户使用简单 hash，仅适合演示；服务端使用 bcrypt + JWT。

## 6. 现有测试框架、测试命令和测试覆盖情况

### 测试框架

- 主测试框架是浏览器内轻量 runner：`tests/test-runner.js`。
- 打开 `tests/index.html` 后会加载主线脚本、seed 数据，并自动运行所有测试；也可在浏览器控制台执行 `TM._testRunner.runAll()`。
- 根目录 `package.json` 的 `test:browser` 只是提示打开 `tests/index.html`，没有自动跑无头浏览器。
- Go 后端有标准 Go 单元测试，位于 `go-server/internal/auth/auth_test.go` 和 `go-server/internal/workspace/scope_test.go`。

### 测试命令

```bash
# 前端主线测试
# 用浏览器打开 tests/index.html

# Vite/TypeScript 结构的构建检查（注意：这不是当前 index.html 主线）
npm run build:vite

# Go 兼容后端测试
cd go-server
go test ./...
```

### 覆盖情况

- 通过静态 grep 统计，`tests/` 下约有 22 个 `describe`、65 个 `it` 用例。
- 已覆盖：员工 CRUD、组织基础操作、绩效基础流程、绩效整批驳回、产品线切换隔离、数据一致性、视图 computed、AI Analyst URL、若干 smoke 流程。
- Go 测试覆盖：JWT 生成/解析、完整工作区访问判定、经理可见员工集合、组织范围、patch 合并、用户密码剔除、scope 参数解析。
- 未看到覆盖或覆盖不足：Node Express 路由集成测试、登录限流/CORS/cookie 安全、Vercel Serverless body 兼容、真实浏览器导入 Excel、服务端 409 冲突恢复、WebSocket/轮询刷新、薪资字段权限、考勤上传替换策略、AI 分析 SQL 安全边界。
- 本次仅新增文档，未运行测试。

## 7. 推荐的开发原则

1. 明确运行模式：纯前端、本地 IndexedDB/localStorage、Vercel Serverless、独立 Node、Go 后端。
2. 员工主数据以 `employees` 为单一事实来源；审批未通过的组织/员工变更不得写入权威集合。
3. UI 可见范围、store 过滤、服务端读裁剪、服务端写校验必须一致。
4. 产品线数据只写 `tm_L{lineId}_*`；全局用户只写 `tm_global_users`。
5. 产品线/组织范围/角色切换必须同步落盘再切上下文，再 hydrate 或 pull。
6. 新增集合、字段或导入字段时，同时更新：seed、dataStore hydrate/export/import、server patch 白名单、测试、AI 分析映射（如适用）。
7. 新增 Excel/CSV 导入必须使用字段映射 schema，不硬编码列序。
8. 面向用户的 toast/错误提示使用中文；技术细节写日志或监控。
9. 高风险流程优先服务端校验，前端校验只作为体验优化。
10. 设计和查询按约 1 万名员工规模评估，避免 O(n²) 大面积扫描进入核心交互路径；必要时维护索引 getter 或服务端拆分。

## 8. 推荐的测试规则

1. 修改 store action、computed、持久化、权限范围、产品线切换、绩效、导入导出后，必须运行 `tests/index.html` 或明确说明未运行。
2. 新增 store action 至少增加一个正向用例和一个边界/异常用例。
3. 修复 bug 必须补回归测试，放在最贴近的测试文件。
4. 修改服务端 scope/patch/auth 时，补 Node 路由测试或 Go 对等测试；至少覆盖读裁剪和写拒绝。
5. 修改绩效流必须覆盖：状态流转、审批链、代理操作、整批驳回、归档前置条件、九宫格同步。
6. 修改产品线或同步逻辑必须覆盖：切换前 flush、脏键清理、当前线写入目标、全局用户不被污染、版本冲突。
7. 修改导入逻辑必须覆盖：字段映射、缺失必填列、重复主键、无效外键、追加与替换差异。
8. 修改考勤逻辑必须覆盖：原始打卡聚合、单日单次打卡、跨月、替换策略、手工导入 `avgDailyHours` 与打卡重算共存。
9. 修改权限逻辑必须同时验证 HRBP、manager、superAdmin/productLineHead、pending RM、intern 等角色。

## 9. 适合写入 AGENTS.md 的 Codex 工作规范

以下规则适合精简后写入 `AGENTS.md`：

1. 进入项目先判断当前任务影响的是 `index.html + js/` 主线、`server/` Node 后端、`api/` Vercel 包装、`go-server/` 兼容后端，还是 `ai-analyst/`。
2. 默认不要把 `src/` Vite 结构当成当前生产主线；除非用户明确要求 Vite/TS 方向。
3. 业务数据修改必须同时检查 HRBP、经理、超级管理员/产品线负责人的可见范围和写入权限。
4. 员工主数据以 `employees` 为权威；未审批通过的变更不得写入主集合或展示为已保存。
5. 产品线作用域数据使用 `tm_L{lineId}_*`；全局用户使用 `tm_global_users`，不得因单产品线操作清空跨线用户绑定。
6. 切换产品线、组织范围、角色前，必须同步落盘脏数据并取消 pending push，再切上下文并 hydrate/pull。
7. 服务端读裁剪和写校验必须与前端范围一致；经理 patch 不得越过本人及递归下属范围。
8. 新增上传/导入入口必须使用 `TM.fieldMapper.match(schema, headers)` 和 `FieldMapDialog`。
9. 修改绩效、组织审批、薪资段位、考勤导入、权限、产品线同步等高风险逻辑时，必须补或更新测试。
10. 所有从代码推断但无法确认的业务政策，必须在方案和文档中标记“需人工确认”，不得编造公司制度。

## 读取过的关键文件

- `AGENTS.md`
- `README.md`
- `PROJECT_RULES.md`
- `.cursor/rules/deployment-context.mdc`
- `.cursor/rules/talent-system-principles.mdc`
- `index.html`
- `package.json`
- `vite.config.ts`
- `js/main.js`
- `js/router.js`
- `js/storage.js`
- `js/storageIDB.js`
- `js/seed.js`
- `js/stores/dataStore.js`
- `js/stores/authStore.js`
- `js/stores/productLineStore.js`
- `js/stores/hrScopeStore.js`
- `js/utils/serverSync.js`
- `js/utils/workspaceSnapshotDiff.js`
- `js/utils/performanceWorkflow.js`
- `js/utils/orgApprovalChain.js`
- `js/utils/orgScope.js`
- `js/utils/attendanceCalc.js`
- `js/utils/fieldMapper.js`
- `js/utils/rosterFieldConfig.js`
- `js/constants/jobTrades.js`
- `js/constants/jobLevels.js`
- `js/constants/thresholds.js`
- `js/views/hrbp/Roster.js`
- `js/views/hrbp/Organization.js`
- `js/views/hrbp/Performance.js`
- `js/views/hrbp/Talent.js`
- `js/views/hrbp/Attendance.js`
- `js/views/hrbp/Recruitment.js`
- `js/views/manager/Performance.js`
- `js/views/manager/Leaves.js`
- `js/views/manager/Training.js`
- `js/views/admin/UserManagement.js`
- `js/views/admin/ProductLines.js`
- `api/[...slug].js`
- `server/README.md`
- `server/package.json`
- `server/src/app.js`
- `server/src/db.js`
- `server/src/auth.js`
- `server/src/routes.js`
- `server/src/workspaceScope.js`
- `server/src/workspacePatch.js`
- `go-server/README.md`
- `go-server/go.mod`
- `go-server/internal/db/db.go`
- `go-server/internal/workspace/scope.go`
- `go-server/internal/auth/auth_test.go`
- `go-server/internal/workspace/scope_test.go`
- `ai-analyst/requirements.txt`
- `ai-analyst/init_db.py`
- `ai-analyst/database.py`
- `ai-analyst/analyst.py`
- `ai-analyst/app.py`
- `tests/index.html`
- `tests/test-runner.js`
- `tests/test-employee-crud.js`
- `tests/test-performance-workflow.js`
- `tests/test-organization.js`
- `tests/test-data-sync.js`
- `tests/test-data-consistency.js`
- `tests/test-product-line-switch.js`
- `tests/test-team-reject.js`
- `tests/test-view-computed.js`
- `tests/test-ai-analyst.js`
- `tests/test-smoke.js`
