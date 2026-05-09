"""
app.py — Streamlit 对话界面（HR AI 数据分析助手）
多查询计划架构：意图分解 → 多维度查询 → 综合分析
启动命令：streamlit run ai-analyst/app.py --server.headless true
"""

import hashlib
import html
import json
import logging
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote as _url_quote

import streamlit as st
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(
            os.path.join(os.path.dirname(__file__), "analyst.log"),
            encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger("ai-analyst.app")

from analyst import HRAnalyst
from auth_context import context_label, verify_context_token
from database import HRDatabase

# ── 页面配置 ───────────────────────────────────────────
st.set_page_config(
    page_title="HR 数据分析助手",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
    /* ── 与主系统一致的设计变量 ── */
    :root {
        --tm-bg: #f4f6f9;
        --tm-surface: #ffffff;
        --tm-text: #1e293b;
        --tm-muted: #64748b;
        --tm-border: #e2e8f0;
        --tm-primary: #4f46e5;
        --tm-primary-hover: #4338ca;
        --tm-radius: 10px;
        --tm-font: 'Segoe UI', system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
    }

    /* ── 全局字体 & 背景 ── */
    html, body, [data-testid="stAppViewContainer"],
    .main, .block-container, .stApp {
        font-family: var(--tm-font) !important;
        color: var(--tm-text) !important;
    }
    .stApp {
        background: var(--tm-bg) !important;
    }

    /* ── 字号统一（Streamlit 默认偏大） ── */
    .stApp, .stMarkdown, .stMarkdown p, .stMarkdown li,
    [data-testid="stChatMessageContent"],
    [data-testid="stChatMessageContent"] p,
    [data-testid="stChatMessageContent"] li {
        font-size: 0.875rem !important;
        line-height: 1.65 !important;
    }
    .stApp h1, [data-testid="stSidebar"] h1 { font-size: 1.1rem !important; font-weight: 700 !important; }
    .stApp h2 { font-size: 1rem !important; font-weight: 600 !important; }
    .stApp h3 { font-size: 0.9375rem !important; font-weight: 600 !important; }
    .stApp h4 { font-size: 0.875rem !important; font-weight: 600 !important; }
    [data-testid="stChatMessageContent"] h3 {
        font-size: 0.9375rem !important;
        margin-top: 0.75rem !important;
    }
    .stCaption, .stCaption p { font-size: 0.8125rem !important; color: var(--tm-muted) !important; }

    /* ── 侧边栏 ── */
    [data-testid="stSidebar"] {
        min-width: 280px;
        background: var(--tm-surface) !important;
        border-right: 1px solid var(--tm-border) !important;
    }
    [data-testid="stSidebar"] * {
        color: var(--tm-text) !important;
    }
    [data-testid="stSidebar"] .stCaption,
    [data-testid="stSidebar"] .stCaption p {
        color: var(--tm-muted) !important;
    }
    [data-testid="stSidebar"] .stButton > button {
        background: var(--tm-bg) !important;
        color: var(--tm-text) !important;
        border: 1px solid var(--tm-border) !important;
        border-radius: 8px !important;
        font-size: 0.8125rem !important;
        padding: 0.4rem 0.75rem !important;
        font-weight: 400 !important;
        transition: background 0.15s, border-color 0.15s !important;
    }
    [data-testid="stSidebar"] .stButton > button:hover {
        background: #eef2ff !important;
        border-color: var(--tm-primary) !important;
        color: var(--tm-primary) !important;
    }
    [data-testid="stSidebar"] hr {
        border-color: var(--tm-border) !important;
    }

    /* ── 主聊天区 ── */
    [data-testid="stChatMessage"] {
        border-radius: var(--tm-radius) !important;
        border: 1px solid var(--tm-border) !important;
        background: var(--tm-surface) !important;
        padding: 0.75rem 1rem !important;
        margin-bottom: 0.75rem !important;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04) !important;
    }
    [data-testid="stChatInput"] textarea,
    [data-testid="stChatInput"] input {
        font-family: var(--tm-font) !important;
        font-size: 0.875rem !important;
        border-radius: 8px !important;
        border: 1px solid var(--tm-border) !important;
    }
    [data-testid="stChatInput"] textarea:focus,
    [data-testid="stChatInput"] input:focus {
        border-color: var(--tm-primary) !important;
        box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.15) !important;
    }

    /* ── Status / expander 组件 ── */
    [data-testid="stExpander"] {
        border: 1px solid var(--tm-border) !important;
        border-radius: 8px !important;
        background: var(--tm-surface) !important;
    }
    [data-testid="stExpander"] summary {
        font-size: 0.8125rem !important;
        font-weight: 600 !important;
    }
    details[data-testid="stExpander"] p {
        font-size: 0.8125rem !important;
    }
    .stStatusWidget {
        font-size: 0.8125rem !important;
    }
    .stStatusWidget label {
        font-size: 0.8125rem !important;
    }

    /* ── 表格 ── */
    .stApp table {
        font-size: 0.8125rem !important;
        border-collapse: collapse !important;
    }
    .stApp table th {
        background: var(--tm-bg) !important;
        color: var(--tm-muted) !important;
        font-weight: 600 !important;
        font-size: 0.8125rem !important;
        padding: 6px 10px !important;
        border-bottom: 2px solid var(--tm-border) !important;
        white-space: nowrap !important;
    }
    .stApp table td {
        padding: 5px 10px !important;
        border-bottom: 1px solid var(--tm-border) !important;
        color: var(--tm-text) !important;
    }
    .stApp table tr:hover td {
        background: #f8fafc !important;
    }

    /* ── 代码块 ── */
    .stApp code, .stApp pre {
        font-size: 0.8125rem !important;
    }

    /* ── 自定义辅助类 ── */
    .status-ok   { color: #22c55e; font-weight: 600; font-size: 0.8125rem; }
    .status-fail { color: #ef4444; font-weight: 600; font-size: 0.8125rem; }
    .sql-box     { background: #1e293b; color: #e2e8f0; padding: 10px 14px;
                   border-radius: 8px; font-family: ui-monospace, monospace;
                   font-size: 0.75rem; overflow-x: auto; margin: 4px 0 8px; }
    .dim-header  { margin: 0.5rem 0 0.25rem; font-weight: 600; color: var(--tm-primary);
                   font-size: 0.8125rem; }

    /* ── 复制按钮 ── */
    .copy-report-btn {
        display: inline-flex; align-items: center; gap: 4px;
        background: var(--tm-bg); color: var(--tm-muted);
        border: 1px solid var(--tm-border); border-radius: 6px;
        padding: 3px 10px; font-size: 0.75rem; cursor: pointer;
        transition: all 0.15s; float: right; margin-top: -2rem;
    }
    .copy-report-btn:hover {
        background: #eef2ff; color: var(--tm-primary);
        border-color: var(--tm-primary);
    }

    /* ── 隐藏 Streamlit 默认 header/footer ── */
    #MainMenu, header[data-testid="stHeader"], footer,
    [data-testid="stToolbar"] { display: none !important; }
</style>
""", unsafe_allow_html=True)


def _cfg(key: str, default: str = "") -> str:
    """Read config: Streamlit secrets → env var → default."""
    try:
        return st.secrets[key]
    except (KeyError, FileNotFoundError):
        return os.getenv(key, default)


# ── 单例初始化 ─────────────────────────────────────────
@st.cache_resource(show_spinner="正在连接数据库与 AI 服务…")
def init_services():
    db_url = _cfg("DATABASE_URL")
    api_key = _cfg("DEEPSEEK_API_KEY")
    base_url = _cfg("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    model = _cfg("DEEPSEEK_MODEL", "deepseek-chat")

    errors = []
    if not db_url:
        errors.append("DATABASE_URL 未配置")
    if not api_key:
        errors.append("DEEPSEEK_API_KEY 未配置")
    if errors:
        return None, None, None, errors

    try:
        db = HRDatabase(db_url)
        schema = db.get_schema()
    except Exception as e:
        logger.exception("数据库初始化失败")
        return None, None, None, [f"数据库连接失败：{e}"]

    try:
        llm = HRAnalyst(api_key, base_url, model)
    except Exception as e:
        logger.exception("LLM 初始化失败")
        return None, None, None, [f"AI 服务初始化失败：{e}"]

    return db, llm, schema, []


db, llm, schema, init_errors = init_services()


def _bool_cfg(key: str, default: bool = False) -> bool:
    raw = _cfg(key, "true" if default else "false")
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _query_param(key: str) -> str:
    try:
        val = st.query_params.get(key, "")
        if isinstance(val, list):
            return str(val[0] if val else "")
        return str(val or "")
    except Exception:
        try:
            val = st.experimental_get_query_params().get(key, [""])
            return str(val[0] if val else "")
        except Exception:
            return ""


def _load_auth_context() -> tuple[dict | None, str | None]:
    required = _bool_cfg("AI_ANALYST_AUTH_REQUIRED", True)
    token = _query_param("tm_ctx")
    if not required and not token:
        return None, None
    secret = _cfg("AI_ANALYST_SESSION_SECRET") or _cfg("JWT_SECRET")
    try:
        return verify_context_token(token, secret), None
    except PermissionError as e:
        return None, str(e)


auth_context, auth_error = _load_auth_context()
if auth_error:
    st.error(auth_error)
    st.info("请从人才管理主系统的「AI 数据分析」菜单进入。")
    st.stop()

# ── 聊天历史持久化 ────────────────────────────────────
_HISTORY_PATH = Path(__file__).parent / "chat_history.json"
_MAX_HISTORY_MESSAGES = 40
_MAX_QUESTION_CHARS = 500


def _normalise_messages(messages: list[dict]) -> list[dict]:
    clean: list[dict] = []
    for item in messages:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str):
            continue
        clean.append({"role": role, "content": content})
    return clean[-_MAX_HISTORY_MESSAGES:]


def _load_history() -> list[dict]:
    try:
        if _HISTORY_PATH.exists():
            data = json.loads(_HISTORY_PATH.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return _normalise_messages(data)
    except Exception:
        logger.warning("读取聊天历史失败，已忽略")
    return []


def _save_history(messages: list[dict]):
    try:
        messages = _normalise_messages(messages)
        _HISTORY_PATH.write_text(
            json.dumps(messages, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        st.session_state.messages = messages
    except Exception:
        logger.warning("保存聊天历史失败")


# ── 缓存层：查询计划缓存（相同问题 10 分钟内复用）──────
@st.cache_data(ttl=600, show_spinner=False)
def cached_plan_queries(_schema_hash: str, question: str, auth_context_key: str) -> list[dict]:
    ctx = json.loads(auth_context_key) if auth_context_key else None
    return llm.plan_queries(schema, question, stream=False, auth_context=ctx)


def _question_hash(q: str) -> str:
    return hashlib.md5(q.encode()).hexdigest()[:12]


# ── 侧边栏 ────────────────────────────────────────────
with st.sidebar:
    st.markdown("#### HR 数据分析助手")
    st.caption("输入中文问题，AI 自动查询并生成分析报告")

    st.divider()

    if init_errors:
        for err in init_errors:
            st.error(err)
        st.info("请在 `ai-analyst/.env` 中配置好环境变量后重启。")
        st.stop()

    st.markdown(
        '<span class="status-ok">● 数据库已连接</span>&emsp;'
        '<span class="status-ok">● AI 服务就绪</span>',
        unsafe_allow_html=True,
    )
    label = context_label(auth_context)
    if label:
        st.caption(label)

    st.divider()
    st.markdown("**常见问题**")
    examples = [
        "帮我全面分析一下公司的人员情况",
        "哪些员工绩效很好但薪酬偏低，有流失风险",
        "对比各部门的绩效和薪酬水平",
        "试用期员工有哪些，整体情况如何",
        "高潜力人才的详细画像",
        "最近半年新入职员工的融入情况",
        "各部门工时和出勤有什么差异",
        "招聘漏斗各环节的转化率如何",
    ]
    for q in examples:
        if st.button(q, key=f"ex_{q}", use_container_width=True):
            st.session_state["pending_question"] = q

    st.divider()
    if st.button("🗑️ 清空对话记录", use_container_width=True):
        st.session_state.messages = []
        _save_history([])
        st.rerun()

    with st.expander("数据库 Schema", expanded=False):
        st.code(schema or "（未加载）", language="sql")

    st.caption(
        "仅执行 SELECT 查询 · 敏感字段自动脱敏 · 每条查询最多 100 行"
    )

# ── 主区域：对话历史 ──────────────────────────────────
st.markdown("#### 对话")

if "messages" not in st.session_state:
    st.session_state.messages = _load_history()

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# ── 辅助：渲染 Markdown 表格 ──────────────────────────
def _md_cell(value) -> str:
    s = "" if value is None else str(value)
    return html.escape(s).replace("|", "\\|").replace("\n", " ")


def render_table(rows, columns):
    if not rows:
        return
    header = "| " + " | ".join(_md_cell(c) for c in columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    body = "\n".join(
        "| " + " | ".join(_md_cell(row.get(c, "")) for c in columns) + " |"
        for row in rows[:50]
    )
    st.markdown(f"{header}\n{sep}\n{body}")
    if len(rows) > 50:
        st.caption(f"（仅显示前 50 行，共 {len(rows)} 行）")


# ── 处理输入 ──────────────────────────────────────────
pending = st.session_state.pop("pending_question", None)
user_input = st.chat_input("请输入您的问题，例如：帮我分析一下研发部门的整体情况")
question = (pending or user_input or "").strip()

if question:
    if len(question) > _MAX_QUESTION_CHARS:
        st.warning(f"问题过长，请控制在 {_MAX_QUESTION_CHARS} 个字符以内。")
        st.stop()

    st.session_state.messages.append({"role": "user", "content": question})
    st.session_state.messages = _normalise_messages(st.session_state.messages)
    with st.chat_message("user"):
        st.markdown(question)

    with st.chat_message("assistant"):
        answer_parts: list[str] = []
        schema_h = _question_hash(schema or "")
        auth_context_key = json.dumps(auth_context or {}, ensure_ascii=False, sort_keys=True)

        # ── Step 1: 意图理解 + 查询计划（带缓存）────────
        with st.status(
            "🧠 正在理解问题并制定查询计划…", expanded=True
        ) as status:
            try:
                t0 = time.time()
                queries = cached_plan_queries(schema_h, question, auth_context_key)
                t_plan = time.time() - t0
                n = len(queries)
                dims = "、".join(q["label"] for q in queries)
                cache_hint = "（缓存）" if t_plan < 0.5 else ""
                if not queries:
                    raise RuntimeError("未生成可执行查询计划")
                status.update(
                    label=f"✅ 已分解为 {n} 个查询维度（{t_plan:.1f}s{cache_hint}）：{dims}",
                    state="complete",
                )
            except Exception as e:
                logger.exception("查询计划生成失败")
                st.error(f"查询计划生成失败：{e}")
                answer_parts.append(f"❌ 查询计划生成失败：{e}")
                st.session_state.messages.append(
                    {"role": "assistant", "content": "\n\n".join(answer_parts)}
                )
                _save_history(st.session_state.messages)
                st.stop()

        # ── Step 2: 逐维度执行查询 ───────────────────
        query_results = []
        total_rows = 0
        all_masked = set()

        for i, q in enumerate(queries, 1):
            label = q["label"]
            sql = q["sql"]

            with st.status(
                f"🔍 [{i}/{len(queries)}] {label}…", expanded=False
            ) as status:
                try:
                    t0 = time.time()
                    result = db.execute_safe(sql)
                    t_exec = time.time() - t0
                    rc = result["row_count"]
                    masked = result.get("masked_fields", [])
                    total_rows += rc
                    all_masked.update(masked)

                    query_results.append(
                        {"label": label, "sql": sql, "result": result}
                    )

                    status_label = f"✅ {label}：{rc} 行（{t_exec:.1f}s）"
                    if masked:
                        status_label += f"　⚠️ 脱敏：{', '.join(masked)}"
                    status.update(label=status_label, state="complete")

                except PermissionError as e:
                    status.update(
                        label=f"🚫 {label}：安全拦截", state="error"
                    )
                    logger.warning("安全拦截 [%s]: %s", label, e)
                except Exception as e:
                    status.update(
                        label=f"❌ {label}：执行出错", state="error"
                    )
                    logger.exception("SQL 执行失败 [%s]", label)

        # ── 展示各维度数据（可折叠） ─────────────────
        if query_results:
            with st.expander(
                f"📋 查询数据明细（{len(query_results)} 个维度，共 {total_rows} 行）",
                expanded=False,
            ):
                for i, qr in enumerate(query_results):
                    result = qr["result"]
                    safe_label = html.escape(str(qr["label"]))
                    safe_sql = html.escape(str(qr["sql"]))
                    st.markdown(
                        f'<p class="dim-header">📌 {safe_label}'
                        f'（{result["row_count"]} 行）</p>',
                        unsafe_allow_html=True,
                    )
                    st.markdown(
                        f'<div class="sql-box">{safe_sql}</div>',
                        unsafe_allow_html=True,
                    )
                    if result["rows"]:
                        render_table(result["rows"], result["columns"])
                    else:
                        st.caption("（无数据）")
                    if i < len(query_results) - 1:
                        st.markdown("---")

            answer_parts.append(
                f"共查询 **{len(query_results)}** 个维度，返回 **{total_rows}** 行数据。"
            )
        else:
            st.warning("所有查询均未返回结果，请尝试换一种问法。")
            answer_parts.append("所有查询均未返回结果。")
            st.session_state.messages.append(
                {"role": "assistant", "content": "\n\n".join(answer_parts)}
            )
            _save_history(st.session_state.messages)
            st.stop()

        # ── Step 3: AI 综合分析（流式输出）────────────
        st.markdown("---")
        st.markdown("#### 综合分析报告")
        report_placeholder = st.empty()
        try:
            t0 = time.time()
            stream_gen = llm.synthesize(question, query_results, stream=True, auth_context=auth_context)
            chunks: list[str] = []
            for chunk in stream_gen:
                chunks.append(chunk)
                report_placeholder.markdown("".join(chunks))
            summary = "".join(chunks)
            t_sum = time.time() - t0
            logger.info("综合分析完成（%.1fs，流式）", t_sum)
        except Exception as e:
            logger.exception("AI 综合分析失败")
            summary = (
                "综合分析生成失败，但各维度查询数据已显示在上方。\n\n"
                f"（错误：{e}）"
            )
            report_placeholder.markdown(summary)

        summary_text = summary if isinstance(summary, str) else ""
        answer_parts.append(summary_text)

        # ── 复制按钮 ──
        _encoded = _url_quote(summary_text, safe="")
        st.markdown(
            f'<button class="copy-report-btn" onclick="'
            f"navigator.clipboard.writeText(decodeURIComponent(this.dataset.text))"
            f".then(()=>{{this.innerHTML='✅ 已复制';setTimeout(()=>this.innerHTML='📋 复制报告',1500)}})"
            f'" data-text="{_encoded}">📋 复制报告</button>',
            unsafe_allow_html=True,
        )

        full_answer = "\n\n".join(answer_parts)
        st.session_state.messages.append(
            {"role": "assistant", "content": full_answer}
        )
        _save_history(st.session_state.messages)
