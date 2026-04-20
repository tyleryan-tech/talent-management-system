"""
analyst.py — Text-to-SQL 引擎：意图理解 → 多维度查询计划 → 结果综合分析
"""

import json
import logging
import re
from typing import Any, Generator

from openai import OpenAI

logger = logging.getLogger("ai-analyst.llm")

# ── HR 领域知识（精简版）────────────────────────────────
HR_DOMAIN_KNOWLEDGE = """
【分析模式与必查维度】
■ 人员/部门/团队概况 → 人数统计(性别/状态)、职级分布、绩效分布、薪酬分位、平均司龄
■ 员工个人详情 → 基本信息+部门+岗位+职级、绩效历史、人才矩阵、薪酬分位
■ 绩效分析 → 各等级人数占比、按部门对比、绩效与薪酬交叉
■ 人才盘点/留人风险 → 九宫格分布、高绩效+低薪酬(流失风险)、高潜力明细
■ 薪酬分析 → 各分位人数、按部门/职级对比、薪酬与绩效交叉
■ 考勤分析 → 各部门平均工时、出勤天数、工时异常员工
■ 招聘分析 → 各阶段漏斗、校招vs社招、offer接受率
■ 培训分析 → 完成率、各类别参与人数、人均时长

【HR概念→字段映射】
司龄→julianday('now')-julianday(hire_date) | 工作年限→julianday('now')-julianday(career_start_date)
高绩效→final_grade IN('A+','A','A-') AND status='finalized' | 低绩效→final_grade IN('C','C-')
高潜力→talent_matrix.potential='H' | 流失风险→高绩效+salary_band IN('below_min','p25')
新员工→hire_date>=date('now','-6 months') | 试用期→status='probation' | 在职→status='active'
""".strip()


def compress_schema(schema: str) -> str:
    """Remove NULL/NOT NULL markers and collapse type names to save tokens."""
    s = re.sub(r"\s+(NOT\s+)?NULL\b", "", schema, flags=re.IGNORECASE)
    s = re.sub(r"VARCHAR\(\d+\)", "TEXT", s, flags=re.IGNORECASE)
    s = re.sub(r"\n\s*\n", "\n", s)
    return s.strip()


class HRAnalyst:
    """Text-to-SQL 引擎：意图分解 → 多查询计划 → 综合分析。"""

    def __init__(self, api_key: str, base_url: str, model: str):
        if not api_key:
            raise ValueError("DEEPSEEK_API_KEY 未配置，请检查 .env 文件")
        self._client = OpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        logger.info("LLM 客户端就绪（model=%s）", model)

    # ── 核心：意图理解 + 多查询计划生成（支持 streaming）────
    def plan_queries(
        self, schema: str, question: str, *, stream: bool = False
    ) -> "list[dict] | Generator[str, None, list[dict]]":
        compact_schema = compress_schema(schema)
        system_prompt = (
            "你是资深HR数据分析师，精通Text-to-SQL。理解用户意图，分解为多个查询维度，每个维度生成一条SQL。\n\n"
            "【输出格式——严格JSON数组】\n"
            '[{"label":"维度说明","sql":"SELECT ..."},...]\n'
            "只返回JSON数组，无其他文字，不用Markdown代码块。\n\n"
            "【查询数量】简单1-2条，一般2-3条，综合4-6条，最多6条。\n\n"
            f"{HR_DOMAIN_KNOWLEDGE}\n\n"
            "【SQL规则】只SELECT；末尾LIMIT(明细100,统计50)；表名字段名双引号；ASCII运算符；绩效取status='finalized'。\n"
            "【SQLite语法】date('now') | date('now','-6 months') | julianday('now')-julianday(col) | strftime('%Y',col) | ROUND(expr,n)\n\n"
            f"【Schema】\n{compact_schema}"
        )

        if stream:
            return self._plan_queries_stream(system_prompt, question)

        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question},
            ],
            temperature=0.0,
            max_tokens=4096,
        )

        raw = response.choices[0].message.content.strip()
        logger.info("LLM 查询计划原始输出：%s", raw[:500])
        return self._finalize_plan(raw)

    def _plan_queries_stream(
        self, system_prompt: str, question: str
    ) -> Generator[str, None, list[dict]]:
        """Streaming variant: yields raw chunks, returns parsed queries."""
        resp = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question},
            ],
            temperature=0.0,
            max_tokens=4096,
            stream=True,
        )
        chunks: list[str] = []
        for part in resp:
            delta = part.choices[0].delta.content if part.choices else None
            if delta:
                chunks.append(delta)
                yield delta
        raw = "".join(chunks).strip()
        logger.info("LLM 查询计划原始输出（stream）：%s", raw[:500])
        return self._finalize_plan(raw)

    def _finalize_plan(self, raw: str) -> list[dict]:
        queries = self._parse_query_plan(raw)
        if not queries:
            logger.warning("多查询解析失败，回退到单查询模式")
            sql = self._extract_sql(raw)
            queries = [{"label": "查询结果", "sql": sql}]
        logger.info("查询计划：%d 条查询", len(queries))
        return queries

    # ── 综合分析（支持 streaming）──────────────────────────
    def synthesize(
        self,
        question: str,
        query_results: list[dict[str, Any]],
        *,
        stream: bool = False,
    ) -> "str | Generator[str, None, None]":
        data_sections = []
        total_rows = 0
        all_masked: set[str] = set()

        for i, qr in enumerate(query_results, 1):
            result = qr.get("result", {})
            rows = result.get("rows", [])
            row_count = result.get("row_count", 0)
            masked = result.get("masked_fields", [])
            total_rows += row_count
            all_masked.update(masked)

            preview_limit = 3 if row_count <= 3 else 15
            preview = json.dumps(rows[:preview_limit], ensure_ascii=False, default=str)
            data_sections.append(
                f"### 维度{i}：{qr['label']}\n"
                f"SQL: {qr['sql']}\n"
                f"返回{row_count}行\n"
                f"数据：\n{preview}"
            )

        if total_rows == 0:
            msg = "所有查询结果均为空，未找到匹配的数据。请尝试换一种问法或放宽条件。"
            if stream:
                def _empty():
                    yield msg
                return _empty()
            return msg

        system_prompt = (
            "你是资深HR数据分析专家，擅长从多维度数据提炼业务洞察。\n"
            "综合所有维度数据生成分析报告。结构：\n"
            "1.**核心结论**(1-2句) 2.**多维度分析**(具体数字,交叉分析) 3.**风险提示** 4.**管理建议**(2-4条)\n"
            "格式：Markdown排版，数字精确(如35.2%)，对比用表格，全程中文，脱敏字段不还原。"
        )

        user_msg = (
            f"**用户问题**：{question}\n"
            f"**维度数**：{len(query_results)}　**总行数**：{total_rows}\n"
            + (f"**脱敏字段**：{', '.join(all_masked)}\n" if all_masked else "")
            + "\n---\n\n"
            + "\n\n---\n\n".join(data_sections)
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ]

        if stream:
            return self._synthesize_stream(messages)

        response = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=0.3,
            max_tokens=4096,
        )
        summary = response.choices[0].message.content.strip()
        logger.info("综合分析完成（%d 字符）", len(summary))
        return summary

    def _synthesize_stream(self, messages: list[dict]) -> Generator[str, None, None]:
        resp = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=0.3,
            max_tokens=4096,
            stream=True,
        )
        for part in resp:
            delta = part.choices[0].delta.content if part.choices else None
            if delta:
                yield delta

    # ── 兼容：单查询模式 ──────────────────────────────────
    def generate_sql(self, schema: str, question: str) -> str:
        queries = self.plan_queries(schema, question)
        return queries[0]["sql"] if queries else "SELECT '无法生成查询' AS message;"

    def summarize(
        self, question: str, sql: str, result: dict[str, Any]
    ) -> str:
        return self.synthesize(
            question, [{"label": "查询结果", "sql": sql, "result": result}]
        )

    # ── 内部：解析 LLM 输出的查询计划 JSON ────────────────
    @staticmethod
    def _parse_query_plan(raw: str) -> list[dict]:
        md_match = re.search(r"```(?:json)?\s*\n?(.*?)```", raw, re.DOTALL)
        text = md_match.group(1).strip() if md_match else raw.strip()

        bracket_match = re.search(r"\[.*\]", text, re.DOTALL)
        if bracket_match:
            text = bracket_match.group(0)

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("JSON 解析失败，原始文本：%s", text[:300])
            return []

        if not isinstance(data, list):
            return []

        queries = []
        for item in data:
            if isinstance(item, dict) and "sql" in item:
                label = item.get("label", f"查询 {len(queries)+1}")
                sql = item["sql"].strip()
                if sql.upper().startswith("SELECT"):
                    queries.append({"label": label, "sql": sql})
        return queries

    @staticmethod
    def _extract_sql(raw: str) -> str:
        md_match = re.search(
            r"```(?:sql)?\s*\n?(.*?)```", raw, re.DOTALL | re.IGNORECASE
        )
        if md_match:
            return md_match.group(1).strip()
        lines = [
            line
            for line in raw.strip().splitlines()
            if not line.strip().startswith("--") and line.strip()
        ]
        return "\n".join(lines).strip()
