# Codex Knowledge Base

本文档目录用于让 Codex 快速理解本人才管理系统。它把现有代码、已有项目规则、浏览器测试、后端接口，以及 HRBP 制度资料整理成可执行的开发上下文。

## 阅读顺序

1. `AGENTS.md`
2. `docs/codex-knowledge/codebase-map.md`
3. `docs/codex-knowledge/business-rules.md`
4. `docs/codex-knowledge/development-principles.md`
5. `docs/codex-knowledge/testing-rules.md`
6. `docs/codex-knowledge/test-maintenance-mode.md`
7. `docs/codex-knowledge/source-inventory.md`
7. 如需更完整背景，再读 `docs/system-analysis-for-codex.md`

## 资料来源

- 当前代码仓库：`D:\Users\tyler.yan\Desktop\人才管理`
- 已有项目规则：`AGENTS.md`、`PROJECT_RULES.md`、`.cursor/rules/*.mdc`
- 已有系统梳理：`docs/system-analysis-for-codex.md`
- HRBP 业务资料：`D:\Users\tyler.yan\Downloads\HRBP知识库-20260509T022450Z-3-001.zip`

## 使用边界

- 代码里能确认的行为，可以作为当前系统实现依据。
- HRBP 文档里能确认的制度，可以作为业务设计依据。
- 两者冲突时，先输出差异和风险，等用户确认后再实现。
- 所有薪酬、考勤、绩效、晋升、离职、调动、审批和员工状态相关规则，默认属于高风险规则。
