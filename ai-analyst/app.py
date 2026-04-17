"""
app.py — Streamlit 侧边栏对话界面（AI 数据分析助手）
启动命令：streamlit run ai-analyst/app.py
"""

import logging
import os
import sys
import time

import streamlit as st
from dotenv import load_dotenv

# ── 加载 .env ──────────────────────────────────────────
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ── 日志 ───────────────────────────────────────────────
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
from database import HRDatabase

# ── 页面配置 ───────────────────────────────────────────
st.set_page_config(
    page_title="HR 数据分析助手",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── 自定义样式 ─────────────────────────────────────────
st.markdown("""
<style>
    .stChatMessage { border-radius: 12px; }
    [data-testid="stSidebar"] { min-width: 320px; }
    .status-ok   { color: #22c55e; font-weight: 600; }
    .status-fail { color: #ef4444; font-weight: 600; }
    .sql-box     { background: #1e293b; color: #e2e8f0; padding: 12px 16px;
                   border-radius: 8px; font-family: 'Fira Code', monospace;
                   font-size: 13px; overflow-x: auto; }
</style>
""", unsafe_allow_html=True)


# ── 单例初始化（缓存于 session） ───────────────────────
@st.cache_resource(show_spinner="正在连接数据库与 AI 服务…")
def init_services():
    db_url = os.getenv("DATABASE_URL", "")
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

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

# ── 侧边栏 ────────────────────────────────────────────
with st.sidebar:
    st.title("🔍 HR 数据分析助手")
    st.caption("输入中文问题 → 自动生成 SQL → 查询数据库 → AI 总结分析")

    st.divider()

    if init_errors:
        for err in init_errors:
            st.error(err)
        st.info("请在 `ai-analyst/.env` 中配置好环境变量后重启。")
        st.stop()

    st.markdown('<span class="status-ok">● 数据库已连接</span>', unsafe_allow_html=True)
    st.markdown('<span class="status-ok">● AI 服务就绪</span>', unsafe_allow_html=True)

    st.divider()
    st.subheader("💡 示例问题")
    examples = [
        "公司各部门的人数分布情况",
        "最近半年入职的员工有哪些",
        "各职级的平均工作年限是多少",
        "绩效评级为A的员工占比多少",
        "哪些部门的离职率最高",
        "男女比例是多少",
    ]
    for q in examples:
        if st.button(q, key=f"ex_{q}", use_container_width=True):
            st.session_state["pending_question"] = q

    st.divider()
    with st.expander("📋 数据库 Schema", expanded=False):
        st.code(schema or "（未加载）", language="sql")

    st.divider()
    st.caption("⚠️ 安全说明")
    st.markdown(
        "- 仅执行 **SELECT** 查询\n"
        "- 敏感字段自动脱敏\n"
        "- 结果最多返回 100 行\n"
        "- 使用只读数据库账号",
        unsafe_allow_html=True,
    )

# ── 主区域：对话历史 ──────────────────────────────────
st.header("💬 对话")

if "messages" not in st.session_state:
    st.session_state.messages = []

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"], unsafe_allow_html=True)

# ── 处理输入 ──────────────────────────────────────────
pending = st.session_state.pop("pending_question", None)
user_input = st.chat_input("请输入您的问题，例如：各部门的人数是多少？")
question = pending or user_input

if question:
    st.session_state.messages.append({"role": "user", "content": question})
    with st.chat_message("user"):
        st.markdown(question)

    with st.chat_message("assistant"):
        answer_parts: list[str] = []

        # Step 1: 生成 SQL
        with st.status("🤖 正在理解问题并生成 SQL…", expanded=True) as status:
            try:
                t0 = time.time()
                sql = llm.generate_sql(schema, question)
                t_sql = time.time() - t0
                status.update(label=f"✅ SQL 已生成（{t_sql:.1f}s）", state="complete")
            except Exception as e:
                logger.exception("SQL 生成失败")
                st.error(f"SQL 生成失败：{e}")
                answer_parts.append(f"❌ SQL 生成失败：{e}")
                st.session_state.messages.append(
                    {"role": "assistant", "content": "\n\n".join(answer_parts)}
                )
                st.stop()

        st.markdown(f'<div class="sql-box">{sql}</div>', unsafe_allow_html=True)
        answer_parts.append(f"```sql\n{sql}\n```")

        # Step 2: 安全校验 + 执行
        with st.status("🔒 安全校验并执行查询…", expanded=True) as status:
            try:
                t0 = time.time()
                result = db.execute_safe(sql)
                t_exec = time.time() - t0
                rc = result["row_count"]
                masked = result.get("masked_fields", [])
                label = f"✅ 查询完成：{rc} 行（{t_exec:.1f}s）"
                if masked:
                    label += f"　⚠️ 已脱敏字段：{', '.join(masked)}"
                status.update(label=label, state="complete")
            except PermissionError as e:
                st.error(str(e))
                answer_parts.append(f"🚫 {e}")
                st.session_state.messages.append(
                    {"role": "assistant", "content": "\n\n".join(answer_parts)}
                )
                st.stop()
            except Exception as e:
                logger.exception("SQL 执行失败")
                st.error(f"查询执行出错：{e}")
                answer_parts.append(f"❌ 查询执行出错：{e}")
                st.session_state.messages.append(
                    {"role": "assistant", "content": "\n\n".join(answer_parts)}
                )
                st.stop()

        if result["rows"]:
            import pandas as pd
            df = pd.DataFrame(result["rows"])
            st.dataframe(df, use_container_width=True, height=min(38 * rc + 40, 420))
            answer_parts.append(f"查询返回 **{rc}** 行数据。")
        else:
            st.info("查询结果为空。")

        # Step 3: AI 分析
        with st.status("📊 AI 正在分析数据…", expanded=True) as status:
            try:
                t0 = time.time()
                summary = llm.summarize(question, sql, result)
                t_sum = time.time() - t0
                status.update(label=f"✅ 分析完成（{t_sum:.1f}s）", state="complete")
            except Exception as e:
                logger.exception("AI 分析失败")
                summary = f"分析生成失败，但查询结果已显示在上方表格中。（错误：{e}）"

        st.markdown("---")
        st.markdown("### 📊 分析总结")
        st.markdown(summary)
        answer_parts.append(summary)

        st.session_state.messages.append(
            {"role": "assistant", "content": "\n\n".join(answer_parts)}
        )
