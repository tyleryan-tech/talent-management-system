# 企业内部人才管理系统（纯前端）

基于 **Vue 3 + Vue Router + Pinia + ECharts** 的单页应用，数据保存在浏览器 **localStorage**，无后端。UI 参考 Moka：侧边导航、卡片式布局。

## 如何运行

1. **双击 `index.html`（推荐日常使用）**  
   使用 Vue / Vue Router / Pinia 的**浏览器全局版**脚本 + 本地普通 `.js` 文件，**不依赖 ES Module**，可在 `file://` 下直接打开。  
   **需要能访问外网**（加载 unpkg / cdnjs / jsDelivr 上的 Vue 与图标等）。完全离线时请用下面方式自行把脚本下载到本地并改 `index.html` 引用路径。

2. **本地静态服务（可选）**  
   与双击效果一致，仅便于多端调试。

   ```bash
   npx --yes serve .
   # 或
   python -m http.server 8080
   ```

## 默认账号

推荐使用 **邮箱** 登录（与产品设计一致）；仍可使用用户名。

| 登录邮箱 / 用户名 | 密码 | 角色       | 说明                         |
|-------------------|------|------------|------------------------------|
| `hrbp@company.com` 或 `hrbp`   | `123` | HRBP       | 人事全模块 + 人力看板        |
| `manager@company.com` 或 `manager`| `123` | 汇报经理   | 下属团队、审批、绩效、培训等 |

登录页需选择与账号一致的角色页签（HRBP / 汇报经理）。旧版本地数据在首次加载时会为上述演示账号自动补全 `email` 字段，便于邮箱登录。

## 首次启动

若本地无数据，会自动写入 **模拟数据**（约 600 名演示员工、部门、工种编制、请假、绩效、培训等），并弹出提示。

**考勤**：HRBP 考勤页支持 **上传打卡 CSV/JSON**，按规则计算月标准工时与 **负荷比**，自动标注 **负荷不足 / 正常负荷 / 超负荷**（阈值可在页面调整）。

**花名册**：列表可按 **部门、状态、潜力（九宫格）、职级、性别** 筛选，支持关键词搜索与 **重置筛选**；支持 **Excel（.xlsx）** 导入导出，依赖页面加载的 [SheetJS](https://sheetjs.com/)（unpkg CDN）。可下载「导入模板」按列填写；**状态** 可写 `active` / `probation` / `leave` 或 **在职 / 试用期 / 离职**。扩展字段包括 **团队路径**（当前产品线名 `>` 自顶向下部门链，由系统计算）、**组织角色（IC / PIC / RM，与登录系统角色独立）**、**年龄**（可填数值，否则按生日推算）、**薪资段位**（存储键 `below_min` / `p25` / `p50` / `p75` / `above_max`，展示为 below min～above max）、**毕业院校、参加工作日期（工龄）、现任职级起始日（同职级停留）、潜力（H/M/L，同步人才九宫格）、管理计划**。点击姓名打开档案弹层，可查看该员工 **全部绩效记录**（与绩效管理模块同源）。**入司年限**、**同职级停留** 列表与导出中按 **「X.X年」**（一位小数）展示；若缺少入职日或现任职级起始日，会按工号等规则 **系统推算演示日期**（档案中仍为空的可看详情/导出列中的推算值）。工龄仍为「X年X个月」式描述。导入将 **整表替换** 当前员工列表，请谨慎操作或先导出备份。

## 项目结构

```
index.html          # 入口（全局 Vue/Router/Pinia + 顺序加载 js）
css/app.css         # 全局样式
js/main.js          # 启动、Pinia、路由、首次 seed
js/storage.js       # localStorage 读写
js/seed.js          # 模拟数据初始化
js/router.js        # Hash 路由与权限守卫
js/stores/          # Pinia：auth、data、hrScope、productLine（产品线隔离）
js/utils/orgScope.js # 部门子树与四页共用的范围绑定
js/constants/jobTrades.js # 七种工种名称（编制名仅允许此类）
js/constants/jobLevels.js # 编制职级（E / SE / EE / SEE / AM / M / PE / SM）
js/utils/tenureFormat.js # 司龄、同职级停留、参加工作年限「X.X年」与缺省日期推算
js/views/           # 页面（Login、Layout、HRBP、经理、个人中心）
js/utils/echartsLoader.js
```

## 数据说明

- **产品线隔离**：左侧栏可**切换产品线**；HRBP 可**新建产品线**，在**多于一条产品线**时可通过「**移除产品线**」删除当前选中的产品线（本地与服务端数据一并删除，**至少保留一条**）。各产品线的员工、部门、编制、考勤、绩效、九宫格等数据分别保存在 `localStorage` 键 `tm_L{产品线id}_*` 下，互不干扰；组织范围（人力看板/考勤等）也按产品线单独记忆。首次打开会将旧版扁平数据自动迁入「默认产品线」。新建产品线为空白业务数据 + 默认登录账号 `hrbp` / `manager`（密码 `123`），需在本线内维护组织与员工；若当前登录用户名在新产品线不存在，将提示重新登录。
- **工种编制（演示）**：产品线统一为 7 种工种——`前端、移动端、后端、测开、测试、算法、大数据`（见 `js/constants/jobTrades.js`）；其中前端/移动端/后端/测开为开发侧，算法与大数据为非开发侧，测试单独统计。每个部门各有同名工种编制一条（`positionId` 按部门区分），花名册仅显示本部门编制。自定义编制名称会在加载时规范为上述七种之一。
- **编制职级**：仅允许 **E、SE、EE、SEE、AM、M、PE、SM**（见 `js/constants/jobLevels.js`）。组织管理里新建/编辑编制为下拉选择；本地旧数据中的 `P1`～`P9` 等会在加载时映射到上述职级，无法识别的值会规范为 `EE`。
- **组织范围**：考勤管理、绩效管理、人才盘点、**仪表盘（人力数据分析区块）**顶部可选 **产品线**（全部部门）或 **某一部门（含其全部子部门）**；选择会写入 `localStorage` 键 `hrScopeRootDepartmentId`，上述页面共用同一范围。规则与 KPI 库、考核周期等仍为产品线级配置；绩效页仅过滤「被评估人」在范围内的记录及统计图。
- 主要键名：`employees`、`departments`、`positions`、`leaveRequests`、`performanceReviews`、`trainings`、`employeeTrainings`、`users`，以及考勤规则、打卡记录、KPI、人才九宫格、继任等扩展键。
- 所有增删改会通过 Pinia 写回 localStorage；**清除站点数据**可恢复为「首次进入」并重新 seed。

## 技术说明

- Vue 3（`vue.global.prod.js`）、Vue Router 4（Hash）、Pinia 2（`pinia.iife.js`，并设置 `window.VueDemi = Vue`）。
- 图表：ECharts 5 按需脚本加载。
- 图标：Font Awesome 6（CDN）。

---

## Vercel 前端 + 真实 Node API（推荐流程）

仓库已默认在 `index.html` 启用 **`<meta name="tm-api-base" content="__SAME_ORIGIN__">`**，与根目录 **`vercel.json`**、**`api/[...slug].js`** 配套：浏览器只访问 **`https://你的项目.vercel.app/api/*`**，由 Vercel Serverless **转发**到你的 Node 服务。

### 1. 部署 Node API（`server/`）

在 Railway、Render、Fly.io、自有 VPS 等运行 **`server/`**（Node + SQLite 等按 `server/.env.example` 配置）。

- 设置 **`JWT_SECRET`**、**`DB_PATH`**（托管环境需持久盘或外部 DB，按平台文档）。  
- **`CORS_ORIGIN`**：若浏览器直连 API 域名，填 **`https://你的前端.vercel.app`**；若仅通过 Vercel 反代访问（页面请求同源 `/api`），用 `*` 或同上均可。  
- 确认公网可访问：**`GET https://你的API域名/health`** 与 **`GET https://你的API域名/api/health`** 返回 JSON 且含 `"service":"talent-hub-server"`。

### 2. 部署前端到 Vercel

- **Root Directory**：仓库根目录（含 `index.html`、`api/`、`vercel.json`）。  
- **Environment Variables**（见根目录 **`vercel.env.example`**）：  
  - **`TM_API_ORIGIN`** = Node API 根地址，**无尾斜杠**，例如 `https://xxx.railway.app`。  
- 保存后 **Redeploy** 一次，使函数读到变量。

### 3. 实时推送（WebSocket）

Vercel 静态/函数上 **没有** 与 Node 同路径的 **`/ws`**。需要推送时，在 **`index.html`** 取消注释 **`tm-ws-base`**，把 `content` 改成与 **`TM_API_ORIGIN` 同主机**，例如：

```html
<meta name="tm-ws-base" content="https://xxx.railway.app" />
```

（脚本会把 `https` 转成 **`wss://`**。）确保托管平台放行 **WebSocket**。

### 4. 本地只跑前端时的覆盖方式

`index.html` 已写死同源 meta 时，本地用 **`npx serve .`** 会指向 `http://localhost:xxxx` 而没有反代。请在地址使用 **查询参数优先**（会写入 `localStorage`）：

- 打开：`http://localhost:8080/?api=http://localhost:3000#/login`  
或临时注释 **`tm-api-base`** 那一行 meta。

### 5. 仍出现 404 / NOT_FOUND 时

- Vercel 上未配置或拼错 **`TM_API_ORIGIN`** → 访问 **`/api/health`** 会得到 **503 JSON**（不是 HTML 404）。  
- 若曾把 **`tm_api_base`** 存成错误值，可控制台执行 **`localStorage.removeItem('tm_api_base'); location.reload()`**。  
- **`vercel.json`** 不会把 **`/api/*`** 重写到 `index.html`，避免登录 POST 拿到 HTML。

### 6. 办公网报证书错误，手机 VPN 却报 404：分别是什么原因？

这是 **两种不同层面** 的问题，容易误以为「VPN 导致了 404」。

| 现象 | 常见原因 |
|------|----------|
| **办公网电脑：`ERR_CERT_COMMON_NAME_INVALID`、不是私密连接** | 公司 **HTTPS 审计 / 杀毒 / 网关** 会用自己的证书「代签」流量（中间人解密）。浏览器看到的证书域名往往是 **防火墙设备名**，与 `*.vercel.app` 不一致，就会报 **通用名称无效**。与站点代码无关；换 **手机热点**、关 HTTPS 扫描，或让网管放行/加白名单后通常可验证。 |
| **手机 VPN：能进 HTTPS，但页面是 Vercel 的 `404: NOT_FOUND`** | 说明 **TLS 已通过**，边缘真实返回了 **没有匹配到静态页/重写**。常见原因：① Vercel 项目 **Root Directory** 不是含 `index.html` 的仓库根（指到了 `server` 等子目录）；② 仓库里 **未提交** `index.html` / 静态资源；③ **重写规则**未把 `/` 指到 `index.html`（本仓库已用显式 `/` + 排除 `/api/` 的规则，拉最新代码后重新部署）。Vercel 控制台里 **部署预览缩略图** 若也是 404，说明与 VPN 无关，是 **部署内容或路由** 问题。 |

### 7. 证书错误：`ERR_CERT_COMMON_NAME_INVALID` /「您的连接不是私密连接」

**含义**：浏览器与当前访问的主机建立 HTTPS 时，收到的 **TLS 证书**里声明的域名（CN/SAN）与 **地址栏里的主机名**不一致，或证书无效。这是 **传输层 / 域名与托管配置** 问题，**不是** Vue 或本仓库业务逻辑能「改一行代码」修好的。

**与本项目的关系**：已检查仓库内无把整页跳转到错误域名的逻辑；`tm-api-base` 为同源时，接口也走当前站点主机名。若整页打开即报错，问题在 **你访问的这个 URL 对应的证书链**（或中间网络），而不是登录表单代码。

**建议按顺序排查**：

1. **改用 Vercel 控制台给出的正式访问地址**  
   - 在 **Vercel → 项目 → Deployments** 点开最新部署，用页面上的 **Visit** 链接打开（不要手改子域名、不要混用旧书签）。  
   - 优先使用 **生产域名**（一般为 **`https://<项目名>.vercel.app`**），而不是带一长串 hash 的 **单次部署预览域名**（形如 `https://<项目名>-<随机串>-<团队>.vercel.app`）。若预览链持续异常，生产别名通常仍可用。

2. **自定义域名**  
   - 若在 **Domains** 里绑了自有域名，需等 **Certificate** 状态为已签发后再用 HTTPS 访问；DNS 指错（例如 CNAME 到错误目标）或仅部分线路生效时，也可能出现证书与域名不匹配。

3. **本机与网络**  
   - 校准 **系统日期与时间**（时间差过大会导致证书被判定无效）。  
   - 关闭或排查 **代理 / VPN / 公司网关 / 杀毒「HTTPS 扫描」**（它们会替换证书，常触发 **COMMON_NAME_INVALID**）。可换 **手机热点** 或 **无痕窗口** 对比。  
   - 确认地址栏是 **`https://` + 合法主机名**，不要用 **IP** 访问 Vercel（证书不会签给裸 IP）。

4. **仍无法解决**  
   - 在 Vercel **同一项目**下新建一次部署并重试；若仅个别地区异常，可看 [Vercel Status](https://www.vercel-status.com/)。  
   - 若只有 **某一浏览器** 报错，尝试更新浏览器或清除该站点数据。

---

## 仅静态、不要后端时

删除或不要设置 **`tm_api_base`**；若保留默认 **`tm-api-base` __SAME_ORIGIN__** 且无 **`TM_API_ORIGIN`**，Vercel 上 **`/api`** 会失败。请临时注释 **`index.html`** 中的 **`tm-api-base`** meta，或仅用本地演示、不部署到 Vercel。

---

仅供演示与原型使用；密码等为明文存储，切勿用于真实环境。
