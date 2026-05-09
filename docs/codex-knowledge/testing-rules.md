# Testing Rules

## 当前测试入口

前端主线测试是浏览器端测试：

```text
tests/index.html
```

打开后会加载主线脚本、seed 数据并运行测试。控制台可执行：

```js
TM._testRunner.runAll()
```

根目录 `package.json` 已补充命令行自动化入口：

```bash
npm run test:browser
npm run test:server
npm run verify:dev
npm run verify:dev:self-heal
```

其中 `test:browser` 会通过 Playwright 打开 `tests/index.html?autorun=0`，调用 `window.runTests()`，生成 `test-reports/browser-tests-latest.md/json`；`verify:dev` 会汇总浏览器测试、Node API 冒烟测试、Vite/TypeScript 构建，以及环境可用时的 Go 测试，生成 `test-reports/dev-check-latest.md/json`。

Go 后端测试：

```bash
cd go-server
go test ./...
```

Vite/TypeScript 构建检查：

```bash
npm run build:vite
```

注意：`build:vite` 不是当前 `index.html + js/` 主线的完整行为测试。

## 已有测试覆盖

| 文件 | 覆盖重点 |
| --- | --- |
| `tests/test-employee-crud.js` | 员工增删改、批量新增 |
| `tests/test-organization.js` | 部门、岗位、组织设置 |
| `tests/test-performance-workflow.js` | 绩效记录、周期、九宫格基础 |
| `tests/test-team-reject.js` | 绩效整批驳回 |
| `tests/test-product-line-switch.js` | 产品线切换、hydrate、dirty state |
| `tests/test-data-sync.js` | 跨模块同步、索引准确性 |
| `tests/test-data-consistency.js` | 去重、离职排除、cutoff、外键引用 |
| `tests/test-view-computed.js` | 视图 computed、过滤和状态 label |
| `tests/test-smoke.js` | 周期创建、离职可见性、九宫格、用户绑定 |
| `tests/test-ai-analyst.js` | AI Analyst URL 和嵌入逻辑 |

## 何时必须补测试

修改以下内容必须补或更新测试：

- `dataStore` action、computed、hydrate、persist。
- 产品线切换、dirty keys、服务端同步。
- 员工状态和跨模块引用。
- 组织变更审批。
- 绩效周期、初评、审批、整批驳回、校准、归档、申诉。
- HRBP/经理/超管/产品线负责人权限。
- 服务端 scope、patch、auth。
- Excel/CSV/文件导入。
- 考勤导入和重算。
- 薪资段位、Offer、候选人评价等敏感字段。

## 测试自动维护模式

本项目默认把测试维护纳入每个开发任务。Codex/开发者在实现功能时不需要等用户额外提醒，必须自动完成以下闭环：

1. 修改前判断影响范围：前端 store、视图 computed、路由权限、服务端 API、Go 兼容后端、导入导出、数据同步、持久化或构建。
2. 修改功能代码时，同步新增或更新最匹配的测试文件。
3. 新功能至少覆盖一个正向用例和一个边界/异常用例。
4. bug 修复必须补回归用例，确保原复现场景不会再次通过。
5. 高风险业务规则必须覆盖角色、权限范围、数据一致性和审批/状态前置条件。
6. 如果只是文档、注释、纯样式或无运行行为的配置调整，可以不补测试，但最终回复必须说明“不需要新增测试”的原因。
7. 结束前运行 `npm run verify:dev:self-heal`，失败时读取报告、只修复根因并复跑，最多 3 轮。

推荐落点：

| 改动类型 | 优先测试位置 |
| --- | --- |
| `dataStore` action/computed/hydrate/persist | `tests/test-data-consistency.js` 或最匹配的业务测试 |
| 员工增删改、离职、状态 | `tests/test-employee-crud.js`、`tests/test-data-sync.js` |
| 绩效周期、审批、驳回、校准、归档、申诉 | `tests/test-performance-workflow.js`、`tests/test-team-reject.js` |
| 产品线切换、dirty keys、同步上下文 | `tests/test-product-line-switch.js` |
| 组织/岗位/编制/审批 | `tests/test-organization.js` |
| 视图 computed、筛选、状态 label | `tests/test-view-computed.js` |
| 后端鉴权、读裁剪、写校验、版本冲突 | `tests/node-api.test.mjs` 或新增 `tests/node-*.test.mjs` |
| Go 兼容后端 scope/auth/router | `go-server/internal/**/*_test.go` |
| 导入导出/字段映射 | 新增或更新最匹配的浏览器测试，必须使用字段映射入口 |

## 推荐测试策略

小改动：

- 跑相关 `tests/*.js` 覆盖的浏览器测试。
- 补一个正向用例和一个边界/异常用例。

跨模块改动：

- 跑完整 `tests/index.html`。
- 补 smoke 或 data consistency 测试。

后端权限/裁剪改动：

- 补 Node 路由测试或 Go 对等测试。
- 至少覆盖读裁剪和越权写拒绝。

绩效改动：

- 覆盖状态流转、审批链、代理操作、整批驳回、归档前置条件、九宫格同步、申诉窗口。

产品线/同步改动：

- 覆盖切换前 flush、dirty key 清理、当前 lineId 写入目标、全局用户不被污染、版本冲突。

导入改动：

- 覆盖字段映射、缺失必填列、重复主键、无效外键、追加/替换差异。

考勤改动：

- 覆盖单日单次打卡、跨月、替换策略、请假/补卡/异常规则，如果这些规则被引入。

## 开发收尾自动化

每次开发任务结束默认执行：

```bash
npm run verify:dev:self-heal
```

自愈边界：

- 脚本可自动处理缺失 npm 依赖、缺失 Playwright Chromium 等确定性环境问题，并最多复跑 3 轮。
- 业务断言失败、权限裁剪错误、数据污染、构建类型错误必须由 Codex/开发者读取报告后修复根因，再复跑。
- 连续 3 轮仍失败时停止，报告失败项、日志、已执行修复动作和剩余风险。

## 当前测试缺口

- Node Express 路由自动化集成测试不足。
- Vercel Serverless body 兼容和 409 冲突恢复缺少自动化覆盖。
- WebSocket/轮询刷新缺少自动化覆盖。
- 真实浏览器 Excel 导入链路覆盖不足。
- 招聘 offer/薪资字段权限隔离测试不足。
- 离职、调动、晋升模块尚未形成正式测试集。
- AI 分析 SQL 安全边界和数据同步链路需要补充。
