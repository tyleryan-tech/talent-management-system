# 人才管理系统

基于 **Vue 3 + Vue Router 4 + Pinia 2 + ECharts 5** 的单页应用。支持两种运行模式：

- **纯前端模式**：数据保存在浏览器 `localStorage`，无需后端
- **服务端同步模式**：前端 + Vercel Serverless（Express + SQLite），数据通过 API 同步

## 快速开始

### 方式一：本地静态（最简单）

```bash
# 双击 index.html 直接打开（需联网加载 CDN 依赖）
# 或使用静态服务器
npx --yes serve .
```

### 方式二：Vercel 全栈部署（当前线上架构）

当前 `api/[...slug].js` **直接内嵌 Express 应用**（非代理模式），请求路径：

```
浏览器 → https://your-app.vercel.app/api/* → Vercel Serverless Function → Express (server/src/app.js) → /tmp/talent-hub.db (SQLite)
```

部署步骤：
1. Push 代码到 GitHub `main` 分支，Vercel 自动部署
2. 无需设置 `TM_API_ORIGIN` 环境变量（已改为同源直连）
3. `index.html` 中 `<meta name="tm-api-base" content="__SAME_ORIGIN__">` 让 API 请求走同源 `/api/*`

> **注意**：Vercel `/tmp` 非持久存储，冷启动后数据会重新 seed。生产环境需迁移至云数据库。

### 方式三：独立 Node 服务（持久数据）

```bash
cd server
cp .env.example .env   # 编辑 JWT_SECRET 等
npm install && npm start
```

仓库包含 `render.yaml` 可一键部署到 Render。

## 默认演示账号

| 邮箱 | 密码 | 角色 |
|------|------|------|
| `hrbp@company.com` | `123` | HRBP |
| `manager@company.com` | `123` | 汇报经理 |
| `superadmin@company.com` | `123` | 超级管理员 |

登录页需选择与账号一致的角色页签（HRBP / 汇报经理）。

## 首次启动

若本地无数据，会自动生成约 120 名演示员工及配套的部门、编制、绩效、考勤等模拟数据。

## 项目结构

```
index.html              # 入口（全局 Vue/Router/Pinia + 顺序加载 js）
css/app.css             # 全局样式
js/
  main.js               # 启动、Pinia 创建、数据 hydrate、服务端同步
  router.js             # Hash 路由与权限守卫
  seed.js               # 演示数据生成
  storage.js            # localStorage 读写（按产品线隔离）
  storageIDB.js         # IndexedDB 大数据存储
  stores/
    authStore.js        # 认证、角色、权限（RBAC）
    dataStore.js        # 核心数据 store（员工、部门、绩效、考勤等）
    productLineStore.js # 产品线管理与切换
    hrScopeStore.js     # HRBP 组织范围（部门子树过滤）
    domains/            # 域级 metadata（用于调试分组）
  utils/
    serverSync.js       # 服务端 API 通信与 WebSocket
    performanceWorkflow.js  # 绩效审批链与评分逻辑
    orgApprovalChain.js     # 组织变更审批链
    orgScope.js         # 部门子树与四页共用的范围绑定
    attendanceCalc.js   # 考勤计算（工时着色、月度聚合）
    fieldMapper.js      # Excel 导入字段智能映射（Dice 系数 + 同义词）
    observability.js    # Sentry 错误上报（可选）
  constants/
    jobTrades.js        # 7 种工种名称
    jobLevels.js        # 编制职级（E/SE/EE/SEE/AM/M/PE/SM）
    thresholds.js       # 考勤着色阈值、飞行风险评分参数
  views/
    Login.js / Layout.js / Profile.js
    hrbp/               # HRBP 视图（仪表盘、花名册、组织、招聘、人才、绩效、考勤、用户管理）
    manager/            # 经理视图（仪表盘、花名册、组织审批、绩效、培训等）
  composables/          # 可复用组合函数（分页、排序、导入等）
api/[...slug].js        # Vercel Serverless 入口（内嵌 Express）
server/                 # 独立 Node.js 后端（Express + SQLite + JWT + bcrypt）
go-server/              # 备选 Go 后端
vercel.json             # Vercel 路由配置（SPA rewrite + 函数配置）
tests/                  # 浏览器内测试（dataStore CRUD、性能工作流等）
```

## 核心功能

- **花名册**：员工信息管理、Excel 导入导出、智能字段映射
- **组织管理**：部门树、编制管理、组织变更审批流
- **绩效管理**：多周期（年度/半年度）、RM 评估 → 多级审批 → HRBP 校准 → PL 负责人批准 → 归档
- **人才盘点**：九宫格矩阵、高潜人才识别、继任计划、飞行风险评估
- **考勤管理**：打卡数据导入、工时分析、部门/个人考勤概览
- **招聘管理**：Pipeline 管理、面试官池、数据透视分析
- **培训管理**：课程管理、员工培训记录

## 数据说明

- **产品线隔离**：各产品线数据存储在 `localStorage` 键 `tm_L{id}_*` 下，互不干扰
- **多标签页感知**：当其他标签页修改数据时，会提示用户刷新
- **密码安全**：本地存储的用户密码经哈希处理，服务端使用 bcrypt
- 清除站点数据可恢复为首次进入状态并重新 seed

## 技术栈

- **前端**：Vue 3（全局构建）、Vue Router 4（Hash 模式）、Pinia 2、ECharts 5、Font Awesome 6
- **后端**：Node.js + Express、SQLite（better-sqlite3）、JWT、bcrypt
- **部署**：Vercel（前端 + Serverless API）/ Render（独立 Node 服务）

---

仅供演示与原型使用。
