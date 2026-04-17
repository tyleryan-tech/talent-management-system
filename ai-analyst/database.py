"""
database.py — 数据库连接、Schema 读取、SQL 安全校验、执行与脱敏
⚠️ 生产环境请使用【只读数据库账号】配置 DATABASE_URL
"""

import logging
import os
import re
import sqlite3
from typing import Any

from sqlalchemy import create_engine, inspect, text

logger = logging.getLogger("ai-analyst.database")

# ── 危险关键字黑名单 ──────────────────────────────────
_FORBIDDEN_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|RENAME|GRANT|REVOKE|CALL|EXEC|EXECUTE)\b",
    re.IGNORECASE,
)

# ── 敏感字段识别规则 ──────────────────────────────────
_SENSITIVE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"身份证|id_card|identity", re.I), "id_card"),
    (re.compile(r"银行卡|bank_card|bank_account", re.I), "bank_card"),
    (re.compile(r"手机|mobile|phone|电话", re.I), "phone"),
    (re.compile(r"邮箱|email", re.I), "email"),
    (re.compile(r"工资|salary|薪资|薪酬|pay", re.I), "salary"),
]

_MAX_ROWS = 100

# ── SQLite 字段中文注释（SQLite 不支持 COMMENT，手动维护） ─
_COLUMN_COMMENTS: dict[str, dict[str, str]] = {
    "departments": {
        "id": "部门ID", "name": "部门名称", "parent_id": "上级部门ID",
        "manager_id": "部门负责人员工ID", "hc_plan": "编制计划",
    },
    "positions": {
        "id": "岗位ID", "name": "工种/岗位名称", "level": "职级",
        "department_id": "所属部门ID",
    },
    "employees": {
        "id": "员工ID", "name": "员工姓名", "gender": "性别",
        "birthday": "出生日期", "department_id": "所属部门ID",
        "position_id": "岗位ID", "manager_id": "直属上级员工ID",
        "hire_date": "入职日期", "status": "在职状态(active/probation/leave)",
        "phone": "手机号", "email": "邮箱",
        "org_role": "组织角色(PIC=负责人/RM=汇报经理)",
        "grad_school": "毕业院校", "career_start_date": "参加工作日期",
        "level_start_date": "当前职级起始日期", "management_plan": "管理计划",
        "salary_band": "薪酬分位(below_min/p25/p50/p75/above_max)",
    },
    "users": {
        "id": "用户ID", "username": "用户名", "email": "登录邮箱",
        "role": "角色(hrbp/manager)", "real_name": "真实姓名",
        "employee_id": "关联员工ID", "super_admin": "是否超级管理员(0/1)",
        "hrbp_sub_type": "HRBP子类型(super_admin/intern等)",
    },
    "leave_requests": {
        "id": "请假ID", "employee_id": "请假员工ID",
        "type": "假期类型(annual年假/sick病假/personal事假/overtime调休)",
        "start_date": "开始日期", "end_date": "结束日期",
        "reason": "请假原因", "status": "审批状态(pending/approved/rejected)",
        "approver_id": "审批人员工ID", "created_at": "创建时间",
    },
    "performance_cycles": {
        "id": "周期ID", "name": "周期名称",
        "cycle_type": "周期类型(half_year/year)",
        "start_date": "开始日期", "end_date": "结束日期",
        "status": "周期状态(open/closed)",
    },
    "performance_reviews": {
        "id": "评估ID", "employee_id": "被评估员工ID",
        "reviewer_id": "评估人(汇报经理)员工ID", "cycle_id": "绩效周期ID",
        "rm_initial_grade": "经理初评等级(A+/A/A-/B+/B/C/C-)",
        "final_grade": "最终等级", "status": "流程状态(rm_pending/rm_evaluated/in_approval/pl_pending/calibrated/pl_approved/finalized)",
        "rm_comment": "经理评语", "output_description": "产出描述",
        "calibrated_by": "校准人员工ID", "calibrated_at": "校准时间",
        "created_at": "创建时间",
    },
    "trainings": {
        "id": "培训ID", "title": "培训名称", "description": "培训描述",
        "category": "培训类别", "duration_hours": "培训时长(小时)",
    },
    "employee_trainings": {
        "id": "记录ID", "employee_id": "员工ID", "training_id": "培训ID",
        "status": "培训状态(in_progress/completed)",
        "recommended_by": "推荐人员工ID", "completion_date": "完成日期",
    },
    "attendance_records": {
        "id": "记录ID", "employee_id": "员工ID", "month": "月份(YYYY-MM)",
        "avg_daily_hours": "日均工时", "work_days": "出勤天数",
    },
    "talent_matrix": {
        "employee_id": "员工ID", "performance": "绩效评级(A/B/C)",
        "potential": "潜力评级(H高/M中/L低)", "development_plan": "发展计划",
    },
    "succession_plans": {
        "id": "计划ID", "position_id": "目标岗位ID",
        "successor_ids": "继任者员工ID列表(逗号分隔)", "note": "备注",
    },
    "recruitment_pipeline": {
        "id": "候选人编号", "recruit_date": "招聘日期", "name": "候选人姓名",
        "team": "目标团队", "position": "目标岗位",
        "recruit_type": "招聘类型(campus校招/social社招)",
        "recruiter": "招聘负责人", "hr_screening": "HR筛选(pass/fail/pending)",
        "hr_interview": "HR面试结果", "interview1": "一面结果",
        "interview1_by": "一面面试官", "interview2": "二面结果",
        "interview2_by": "二面面试官", "interview_final": "终面结果",
        "interview_final_by": "终面面试官", "score": "综合评分",
        "offering": "Offer状态(accepted/pending/declined)",
        "onboard_date": "入职日期", "comments": "备注", "yoe": "工作年限",
    },
    "notifications": {
        "id": "通知ID", "employee_id": "接收人员工ID",
        "title": "通知标题", "message": "通知内容",
        "read": "是否已读(0/1)", "created_at": "创建时间",
    },
}


class HRDatabase:
    """封装所有数据库操作：读 Schema、校验 SQL、安全执行。"""

    def __init__(self, database_url: str):
        if not database_url:
            raise ValueError("DATABASE_URL 未配置，请检查 .env 文件")

        is_sqlite = database_url.startswith("sqlite")
        connect_args = {}
        kwargs: dict[str, Any] = {"echo": False}

        if is_sqlite:
            db_path = database_url.replace("sqlite:///", "")
            if not os.path.isabs(db_path):
                db_path = os.path.join(os.path.dirname(__file__), db_path)
                database_url = f"sqlite:///{db_path}"
            if not os.path.exists(db_path):
                raise FileNotFoundError(
                    f"数据库文件不存在：{db_path}\n请先运行 python init_db.py 生成数据库。"
                )
            connect_args["check_same_thread"] = False
        else:
            kwargs.update(pool_pre_ping=True, pool_size=5, max_overflow=2)

        self._engine = create_engine(
            database_url, connect_args=connect_args, **kwargs
        )
        logger.info("数据库引擎已创建 (%s)", "SQLite" if is_sqlite else "remote")

    # ── 1. 读取完整 Schema ─────────────────────────────
    def get_schema(self) -> str:
        """返回所有表的描述（表名 / 字段名 / 类型 / 中文注释）。"""
        insp = inspect(self._engine)
        lines: list[str] = []
        for table in sorted(insp.get_table_names()):
            table_comments = _COLUMN_COMMENTS.get(table, {})
            cols_desc: list[str] = []
            for col in insp.get_columns(table):
                col_name = col["name"]
                comment = (
                    col.get("comment")
                    or table_comments.get(col_name, "")
                )
                nullable = "NULL" if col.get("nullable", True) else "NOT NULL"
                cols_desc.append(
                    f"  {col_name}  {col['type']}  {nullable}"
                    + (f"  -- {comment}" if comment else "")
                )
            lines.append(f"TABLE {table} (\n" + "\n".join(cols_desc) + "\n);")
        schema_text = "\n\n".join(lines)
        logger.debug("Schema 读取完成，共 %d 张表", len(insp.get_table_names()))
        return schema_text

    # ── 2. SQL 安全校验 ────────────────────────────────
    @staticmethod
    def validate_sql(sql: str) -> str:
        cleaned = sql.strip().rstrip(";")

        if not cleaned.upper().startswith("SELECT"):
            raise PermissionError("安全拦截：仅允许 SELECT 查询，已阻止非法操作。")

        if _FORBIDDEN_KEYWORDS.search(cleaned):
            match = _FORBIDDEN_KEYWORDS.search(cleaned)
            raise PermissionError(
                f"安全拦截：检测到禁止关键字 「{match.group()}」，已阻止执行。"
            )

        if not re.search(r"\bLIMIT\s+\d+", cleaned, re.IGNORECASE):
            cleaned += f" LIMIT {_MAX_ROWS}"

        return cleaned + ";"

    # ── 3. 执行 SQL 并脱敏 ─────────────────────────────
    def execute_safe(self, sql: str) -> dict[str, Any]:
        safe_sql = self.validate_sql(sql)
        logger.info("执行 SQL：%s", safe_sql[:200])

        with self._engine.connect() as conn:
            result = conn.execute(text(safe_sql))
            columns: list[str] = list(result.keys())
            rows: list[dict] = [dict(zip(columns, row)) for row in result.fetchall()]

        masked_fields = self._mask_sensitive(columns, rows)

        return {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "masked_fields": masked_fields,
        }

    # ── 内部：脱敏处理 ─────────────────────────────────
    @staticmethod
    def _mask_sensitive(columns: list[str], rows: list[dict]) -> list[str]:
        masked: list[str] = []
        for col in columns:
            sensitivity = None
            for pattern, kind in _SENSITIVE_PATTERNS:
                if pattern.search(col):
                    sensitivity = kind
                    break
            if not sensitivity:
                continue
            masked.append(col)
            for row in rows:
                row[col] = _apply_mask(row.get(col), sensitivity)
        return masked


def _apply_mask(value: Any, kind: str) -> str:
    if value is None:
        return ""
    s = str(value)
    if not s:
        return s
    if kind == "phone" and len(s) >= 7:
        return s[:3] + "****" + s[-4:]
    if kind == "id_card" and len(s) >= 10:
        return s[:4] + "**********" + s[-4:]
    if kind == "bank_card" and len(s) >= 8:
        return s[:4] + " **** **** " + s[-4:]
    if kind == "email" and "@" in s:
        local, domain = s.split("@", 1)
        return local[:2] + "***@" + domain
    if kind == "salary":
        return "***"
    return s[:2] + "****" + s[-2:] if len(s) > 4 else "****"
