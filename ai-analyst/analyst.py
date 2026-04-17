"""
analyst.py — DeepSeek LLM 集成：Text-to-SQL 生成 + 查询结果分析
"""

import json
import logging
import re
from typing import Any

from openai import OpenAI

logger = logging.getLogger("ai-analyst.llm")


class HRAnalyst:
    """将自然语言问题 → SQL → 结果分析的完整链路。"""

    def __init__(self, api_key: str, base_url: str, model: str):
        if not api_key:
            raise ValueError("DEEPSEEK_API_KEY 未配置，请检查 .env 文件")
        self._client = OpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        logger.info("LLM 客户端就绪（model=%s）", model)

    # ── 第一步：生成 SQL ──────────────────────────────────
    def generate_sql(self, schema: str, question: str) -> str:
        """
        发送数据库 Schema + 用户问题给 LLM，返回纯 SQL 字符串。
        强制约束：只允许 SELECT、必须有 LIMIT、不允许修改操作。
        """
        system_prompt = (
            "你是一位资深数据库分析师，精通 MySQL / PostgreSQL SQL 语法。\n"
            "用户会用中文提问关于 HR 数据的问题，你需要根据以下数据库 Schema 生成 SQL。\n\n"
            "【硬性规则】\n"
            "1. 只能生成 SELECT 语句，绝对禁止 INSERT / UPDATE / DELETE / DROP / ALTER 等写操作。\n"
            "2. 必须在末尾添加 LIMIT（默认 LIMIT 100），防止大查询。\n"
            "3. 只返回纯 SQL，不要包含任何解释文字、Markdown 代码块或注释。\n"
            "4. 如果用户的问题无法用当前 Schema 回答，返回：SELECT '无法回答该问题' AS message;\n"
            "5. 字段名和表名使用反引号包裹以避免关键字冲突。\n\n"
            f"【数据库 Schema】\n{schema}"
        )

        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question},
            ],
            temperature=0.0,
            max_tokens=1024,
        )

        raw = response.choices[0].message.content.strip()
        sql = self._extract_sql(raw)
        logger.info("LLM 生成 SQL：%s", sql[:200])
        return sql

    # ── 第二步：分析查询结果 ──────────────────────────────
    def summarize(
        self, question: str, sql: str, result: dict[str, Any]
    ) -> str:
        """
        将查询结果发给 LLM，生成一段中文分析摘要。
        如果结果为空，直接说明。
        """
        rows = result.get("rows", [])
        row_count = result.get("row_count", 0)
        masked = result.get("masked_fields", [])

        if row_count == 0:
            return "查询结果为空，未找到匹配的数据。请尝试换一种问法或放宽条件。"

        preview = json.dumps(rows[:20], ensure_ascii=False, default=str)

        system_prompt = (
            "你是一位 HR 数据分析专家。用户提出了一个问题，系统已经查询了数据库并得到了结果。\n"
            "请根据查询结果用中文写一段简明扼要的分析总结（3-5 句话），包含关键数字和洞察。\n"
            "不要复述原始数据行，而是提炼有价值的结论。\n"
            "如果数据中存在脱敏字段，不要试图还原或猜测原始值。\n"
            "使用 Markdown 格式排版（支持表格、加粗、列表）。"
        )

        user_msg = (
            f"**用户问题**：{question}\n\n"
            f"**执行的 SQL**：\n```sql\n{sql}\n```\n\n"
            f"**返回行数**：{row_count}"
            + (f"（已达到 LIMIT 上限，可能还有更多数据）" if row_count >= 100 else "")
            + "\n\n"
            + (f"**已脱敏字段**：{', '.join(masked)}\n\n" if masked else "")
            + f"**数据预览（前 20 行）**：\n```json\n{preview}\n```"
        )

        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=2048,
        )

        summary = response.choices[0].message.content.strip()
        logger.info("分析摘要生成完成（%d 字符）", len(summary))
        return summary

    # ── 内部：从 LLM 回复中提取纯 SQL ────────────────────
    @staticmethod
    def _extract_sql(raw: str) -> str:
        """去除 Markdown 代码块标记等干扰，提取纯 SQL。"""
        md_match = re.search(r"```(?:sql)?\s*\n?(.*?)```", raw, re.DOTALL | re.IGNORECASE)
        if md_match:
            return md_match.group(1).strip()
        lines = [
            line for line in raw.strip().splitlines()
            if not line.strip().startswith("--") and line.strip()
        ]
        return "\n".join(lines).strip()
