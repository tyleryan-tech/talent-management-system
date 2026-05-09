# Talent Hub 后端服务

为「人才管理」前端提供 **多用户同时登录**、**共享同一套产品线数据**、**乐观并发版本号** 与 **WebSocket 实时刷新**。

## 功能概要

- **SQLite** 持久化：产品线列表 + 每条产品线一份完整工作区 JSON（与前端 `exportSnapshot` 结构一致，并附加 `hrScopeRootDepartmentId`）。
- **JWT** 登录：账号与密码哈希存在服务端 `login_users` 表（与演示数据一致：`hrbp@company.com` / `manager@company.com` / `superadmin@company.com`，密码均为 `123`）。
- **PUT /api/workspace/:lineId**：请求体携带 `clientVersion`，与服务器版本一致才写入；成功后版本号 +1，并通过 WebSocket 向订阅该产品线的客户端广播 `workspace_updated`。
- **AI 数据分析**：`/api/ai-analyst/*` 已合入主后端，复用登录态、产品线和服务端读裁剪；未配置模型密钥时返回内置分析摘要。
- 前端在启用同步后，会在本地 **继续写入 localStorage 作为缓存**，并以防抖方式向服务器推送变更。

## 运行要求

- Node.js **18+**
- 在项目根目录执行：

```bash
cd server
npm install
copy .env.example .env
npm start
```

默认监听 `http://localhost:3000`。首次启动会在 `server/data/` 下创建数据库，并写入 **默认产品线 + 演示工作区（约 120 名员工）** 与上述登录账号。

## 前端如何连接

1. **推荐**：用本地静态服务器打开前端页面（勿用 `file://`，否则浏览器会拦截跨域请求），例如：

   ```bash
   npx --yes serve "c:\Users\26104\Desktop\人才管理" -p 8080
   ```

2. 在浏览器访问时带上 API 地址参数，例如：

   `http://localhost:8080/产品线人才管理系统.html#/login?api=http://localhost:3000`

   首次打开后会把 `http://localhost:3000` 记入 `localStorage` 键 `tm_api_base`，之后可直接打开页面。

3. 使用演示账号登录后，多个浏览器/用户登录 **同一服务器** 即可看到 **同一份数据**；一方保存后，其他方会在约数百毫秒内收到推送并自动拉取最新快照。

## 生产环境注意

- 将 `.env` 中 `JWT_SECRET` 改为足够长的随机串。
- 将 `CORS_ORIGIN` 设为实际前端域名（勿长期使用 `*`）。
- 数据量增大时可迁移至 PostgreSQL/MySQL，并保留「产品线维度 JSON 快照 + 版本号」或改为细粒度 API。
- 当前工作区 PUT 为 **整表替换**，适合中小规模；超大规模建议拆分为按实体 CRUD 与增量同步。

## 数据可见范围（GET）

- **HRBP / 超级管理员**  
  - 默认：完整工作区；`users[].password` 会被剔除。  
  - 若带查询参数 **`scopeRootDepartmentId=<部门id>`**，则与前端顶部「组织范围」一致：仅返回 **该部门及其子部门** 内员工及相关业务数据（部门列表含向上父链便于树形展示）；考勤规则、培训字典、KPI 库、考核周期等 **产品线级配置仍为全量**。  
  - 若参数指向不存在的部门，则 **忽略该参数** 并返回全量，响应中带 `deptScopeIgnored`。  
  - 响应体 `scope`：`full` | `hrbp_dept_subtree`；`scopeRootDepartmentId` 与请求一致（全量时为 `null`）。
- **汇报经理**：仅返回 **本人工号 + 递归下属** 相关员工、部门（含向上父链）、编制、请假/绩效/考勤/通知/九宫格/继任（继任池按 `successorIds` 与下属交集）等；`users` 仅保留 **当前登录邮箱匹配** 或 **employeeId 在下属集合内** 的账号行。
- 响应体字段 **`scope`**：`full` | `manager_subtree` | `manager_no_employee`。

## 写入方式

- **`POST /api/workspace/:lineId/patch`**（推荐）：`{ clientVersion, patch }`。`patch` 按集合携带 `upsert` / `removeIds`（与前端 `buildWorkspacePatch` 一致）。经理仅能改允许字段，服务端会校验所有变更均在管辖范围内。
- **`PUT /api/workspace/:lineId`**：仅 **HRBP / 超级管理员** 可用，整表替换（兼容首包或极大变更）。

前端默认在「有基线快照」时用 **patch**；无基线时 HRBP 走 **PUT**，经理会先拉取再 **patch**。

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | `{ identifier, password }` → `{ token, user }` |
| GET | /api/auth/me | Bearer JWT，返回当前用户 |
| GET | /api/product-lines | 产品线列表 |
| POST | /api/product-lines | HRBP 创建产品线 |
| DELETE | /api/product-lines/:id | HRBP 删除产品线（至少保留一条） |
| GET | /api/workspace/:lineId | 获取快照、`version`、`scope` |
| POST | /api/workspace/:lineId/patch | 增量合并（所有已登录角色；经理受限） |
| PUT | /api/workspace/:lineId | 整表保存（仅 HRBP / 超级管理员） |
| GET | /api/ai-analyst/context | 获取当前 AI 分析上下文和数据概览 |
| POST | /api/ai-analyst/chat | 基于当前权限范围生成 AI/内置分析 |
| WS | /ws?token=JWT | 连接后发送 `{ type:'subscribe', lineId }` |

健康检查：`GET /health`
