"""
init_db.py — 从种子数据逻辑创建 SQLite 数据库 (talent_hub.db)
运行方式: python init_db.py
生成结果: 同目录下 talent_hub.db
"""

import math
import os
import random
import re
import sqlite3
from datetime import date, datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "talent_hub.db")

# ── 常量 ──────────────────────────────────────────────
SURNAMES = [
    "张", "王", "李", "赵", "陈", "刘", "杨", "黄", "周", "吴",
    "徐", "孙", "马", "胡", "朱", "郭", "何", "林", "罗", "高",
    "郑", "梁", "谢", "宋", "唐", "韩", "冯", "董", "程", "曹",
    "袁", "邓", "彭", "苏", "蒋", "蔡", "贾", "丁", "魏", "薛",
    "叶", "阎", "余", "潘", "杜", "戴", "夏", "钟", "汪", "田",
]
GIVEN = [
    "明远", "晓峰", "伟华", "婷婷", "建国", "丽华", "志强", "海燕", "大伟", "思远",
    "秀英", "文博", "小明", "文静", "子轩", "雅琪", "浩然", "天宇", "雨薇", "晨曦",
    "博文", "诗涵", "宇飞", "佳怡", "嘉诚", "雪莹", "思源", "俊杰", "梦琪", "泽宇",
    "欣怡", "浩宇", "美琪", "文杰", "雨辰", "子涵", "瑞祥", "雅婷", "凯文", "明辉",
    "静怡", "志远", "慧敏", "鹏飞", "雨萱", "伟杰", "嘉怡", "文涛",
]
TRADES = ["Frontend", "Mobile", "Backend", "SDET", "QA", "Algorithm", "Big Data"]
LEVELS = ["E", "SE", "EE", "SEE", "AM", "M", "PE", "SM"]
GRADES = ["A+", "A", "A-", "B+", "B", "C", "C-"]
WEIGHTS = [3, 10, 15, 30, 25, 12, 5]
GRAD_SCHOOLS = [
    "清华大学", "北京大学", "浙江大学", "复旦大学", "上海交通大学",
    "华中科技大学", "武汉大学", "西安交通大学", "北京航空航天大学",
    "同济大学", "中山大学", "南京大学",
]
MGMT_PLANS = ["—", "年度评审", "高潜力人才计划", "跨部门轮岗", "继任观察", "保留计划"]
SALARY_BANDS = ["below_min", "p25", "p50", "p75", "above_max"]
PERF_MAP = ["A", "B", "C"]
POT_MAP = ["H", "M", "L"]

cum_w = []
s = 0
for w in WEIGHTS:
    s += w
    cum_w.append(s)


def gen_name(seq: int) -> str:
    return SURNAMES[seq % 50] + GIVEN[(seq * 3 + 7) % 48]


def pad_ymd(y: int, m: int, d: int) -> str:
    return f"{y}-{m:02d}-{d:02d}"


def add_years(iso: str, dy: int) -> str:
    dt = datetime.strptime(iso[:10], "%Y-%m-%d")
    try:
        return dt.replace(year=dt.year + dy).strftime("%Y-%m-%d")
    except ValueError:
        return dt.replace(year=dt.year + dy, day=28).strftime("%Y-%m-%d")


def seeded_rand(seed: int):
    x = seed

    def _next():
        nonlocal x
        x = (x * 1103515245 + 12345) & 0x7FFFFFFF
        return x / 0x7FFFFFFF

    return _next


def pick_grade(rng, bias: int) -> str:
    r = rng() * 100
    idx = next((i for i, c in enumerate(cum_w) if r < c), 3)
    idx = max(0, min(6, idx + bias))
    return GRADES[idx]


def gen_workdays(y: int, mo: int) -> list[str]:
    days = []
    dim = (date(y, mo + 1, 1) - timedelta(days=1)).day if mo < 12 else 31
    for d in range(1, dim + 1):
        dt = date(y, mo, d)
        if dt.weekday() < 5:
            days.append(pad_ymd(y, mo, d))
    return days


# ── Schema DDL ────────────────────────────────────────
DDL = """
CREATE TABLE IF NOT EXISTS departments (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL    COMMENT '部门名称',
    parent_id   INTEGER             COMMENT '上级部门ID',
    manager_id  INTEGER             COMMENT '部门负责人员工ID',
    hc_plan     INTEGER DEFAULT 0   COMMENT '编制计划'
);

CREATE TABLE IF NOT EXISTS positions (
    id              INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL    COMMENT '工种/岗位名称',
    level           TEXT                COMMENT '职级',
    department_id   INTEGER             COMMENT '所属部门ID',
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS employees (
    id                  INTEGER PRIMARY KEY,
    name                TEXT    NOT NULL    COMMENT '员工姓名',
    gender              TEXT                COMMENT '性别',
    birthday            TEXT                COMMENT '出生日期',
    department_id       INTEGER             COMMENT '所属部门ID',
    position_id         INTEGER             COMMENT '岗位ID',
    manager_id          INTEGER             COMMENT '直属上级员工ID',
    hire_date           TEXT                COMMENT '入职日期',
    status              TEXT                COMMENT '在职状态(active/probation/leave)',
    phone               TEXT                COMMENT '手机号',
    email               TEXT                COMMENT '邮箱',
    org_role            TEXT                COMMENT '组织角色(PIC/RM/空)',
    grad_school         TEXT                COMMENT '毕业院校',
    career_start_date   TEXT                COMMENT '参加工作日期',
    level_start_date    TEXT                COMMENT '当前职级起始日期',
    management_plan     TEXT                COMMENT '管理计划',
    salary_band         TEXT                COMMENT '薪酬分位(below_min/p25/p50/p75/above_max)',
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (position_id)   REFERENCES positions(id)
);

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY,
    username        TEXT    NOT NULL    COMMENT '用户名',
    email           TEXT                COMMENT '登录邮箱',
    role            TEXT                COMMENT '角色(hrbp/manager)',
    real_name       TEXT                COMMENT '真实姓名',
    employee_id     INTEGER             COMMENT '关联员工ID',
    super_admin     INTEGER DEFAULT 0   COMMENT '是否超级管理员',
    hrbp_sub_type   TEXT                COMMENT 'HRBP子类型(super_admin/intern等)'
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id              INTEGER PRIMARY KEY,
    employee_id     INTEGER    COMMENT '请假员工ID',
    type            TEXT       COMMENT '假期类型(annual/sick/personal/overtime)',
    start_date      TEXT       COMMENT '开始日期',
    end_date        TEXT       COMMENT '结束日期',
    reason          TEXT       COMMENT '请假原因',
    status          TEXT       COMMENT '审批状态(pending/approved/rejected)',
    approver_id     INTEGER    COMMENT '审批人员工ID',
    created_at      TEXT       COMMENT '创建时间',
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS performance_cycles (
    id          INTEGER PRIMARY KEY,
    name        TEXT       COMMENT '周期名称',
    cycle_type  TEXT       COMMENT '周期类型(half_year/year)',
    start_date  TEXT       COMMENT '周期开始日期',
    end_date    TEXT       COMMENT '周期结束日期',
    status      TEXT       COMMENT '周期状态(open/closed)'
);

CREATE TABLE IF NOT EXISTS performance_reviews (
    id                  INTEGER PRIMARY KEY,
    employee_id         INTEGER    COMMENT '被评估员工ID',
    reviewer_id         INTEGER    COMMENT '评估人(汇报经理)员工ID',
    cycle_id            INTEGER    COMMENT '绩效周期ID',
    rm_initial_grade    TEXT       COMMENT '经理初评等级',
    final_grade         TEXT       COMMENT '最终等级',
    status              TEXT       COMMENT '流程状态(rm_pending/rm_evaluated/in_approval/pl_pending/calibrated/pl_approved/finalized)',
    rm_comment          TEXT       COMMENT '经理评语',
    output_description  TEXT       COMMENT '产出描述',
    calibrated_by       INTEGER    COMMENT '校准人员工ID',
    calibrated_at       TEXT       COMMENT '校准时间',
    created_at          TEXT       COMMENT '创建时间',
    FOREIGN KEY (employee_id)  REFERENCES employees(id),
    FOREIGN KEY (cycle_id)     REFERENCES performance_cycles(id)
);

CREATE TABLE IF NOT EXISTS trainings (
    id              INTEGER PRIMARY KEY,
    title           TEXT       COMMENT '培训名称',
    description     TEXT       COMMENT '培训描述',
    category        TEXT       COMMENT '培训类别',
    duration_hours  REAL       COMMENT '培训时长(小时)'
);

CREATE TABLE IF NOT EXISTS employee_trainings (
    id              INTEGER PRIMARY KEY,
    employee_id     INTEGER    COMMENT '员工ID',
    training_id     INTEGER    COMMENT '培训ID',
    status          TEXT       COMMENT '培训状态(in_progress/completed)',
    recommended_by  INTEGER    COMMENT '推荐人员工ID',
    completion_date TEXT       COMMENT '完成日期',
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (training_id) REFERENCES trainings(id)
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id              INTEGER PRIMARY KEY,
    employee_id     INTEGER    COMMENT '员工ID',
    month           TEXT       COMMENT '月份(YYYY-MM)',
    avg_daily_hours REAL       COMMENT '日均工时',
    work_days       INTEGER    COMMENT '出勤天数',
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS talent_matrix (
    employee_id       INTEGER PRIMARY KEY  COMMENT '员工ID',
    performance       TEXT       COMMENT '绩效评级(A/B/C)',
    potential         TEXT       COMMENT '潜力评级(H/M/L)',
    development_plan  TEXT       COMMENT '发展计划',
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS succession_plans (
    id              INTEGER PRIMARY KEY,
    position_id     INTEGER    COMMENT '目标岗位ID',
    successor_ids   TEXT       COMMENT '继任者员工ID列表(逗号分隔)',
    note            TEXT       COMMENT '备注',
    FOREIGN KEY (position_id) REFERENCES positions(id)
);

CREATE TABLE IF NOT EXISTS recruitment_pipeline (
    id                  TEXT PRIMARY KEY   COMMENT '候选人编号',
    recruit_date        TEXT       COMMENT '招聘日期',
    name                TEXT       COMMENT '候选人姓名',
    team                TEXT       COMMENT '目标团队',
    position            TEXT       COMMENT '目标岗位',
    recruit_type        TEXT       COMMENT '招聘类型(campus/social)',
    recruiter           TEXT       COMMENT '招聘负责人',
    hr_screening        TEXT       COMMENT 'HR筛选结果(pass/fail/pending)',
    hr_interview        TEXT       COMMENT 'HR面试结果',
    interview1          TEXT       COMMENT '一面结果',
    interview1_by       TEXT       COMMENT '一面面试官',
    interview2          TEXT       COMMENT '二面结果',
    interview2_by       TEXT       COMMENT '二面面试官',
    interview_final     TEXT       COMMENT '终面结果',
    interview_final_by  TEXT       COMMENT '终面面试官',
    score               TEXT       COMMENT '评分',
    offering            TEXT       COMMENT 'Offer状态(accepted/pending/declined)',
    onboard_date        TEXT       COMMENT '入职日期',
    comments            TEXT       COMMENT '备注',
    yoe                 TEXT       COMMENT '工作年限'
);

CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY,
    employee_id INTEGER    COMMENT '接收人员工ID',
    title       TEXT       COMMENT '通知标题',
    message     TEXT       COMMENT '通知内容',
    read        INTEGER    COMMENT '是否已读(0/1)',
    created_at  TEXT       COMMENT '创建时间',
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);
"""


def create_tables(cur: sqlite3.Cursor):
    clean_ddl = re.sub(r"\s+COMMENT\s+'[^']*'", "", DDL)
    cur.executescript(clean_ddl)


# ── 数据生成（与 seed.js 对齐） ───────────────────────
def seed_data(cur: sqlite3.Cursor):
    # --- Departments ---
    departments = [
        (1, "技术部", None, 1002, 0), (2, "产品部", None, 1003, 0),
        (3, "市场部", None, 1004, 0), (4, "运营部", None, 1005, 0),
        (5, "前端开发组", 1, 1006, 0), (6, "后端开发组", 1, 1007, 0),
        (7, "算法工程组", 1, 1008, 0), (8, "质量保障组", 1, 1009, 0),
        (9, "产品策略组", 2, 1010, 0), (10, "产品设计组", 2, 1011, 0),
        (11, "数据分析组", 2, 1012, 0), (12, "品牌推广组", 3, 1013, 0),
        (13, "渠道运营组", 3, 1014, 0), (14, "市场分析组", 3, 1015, 0),
        (15, "客户成功组", 4, 1016, 0), (16, "商务拓展组", 4, 1017, 0),
        (17, "项目管理组", 4, 1018, 0), (18, "技术支持组", 4, 1019, 0),
        (19, "人力资源部", None, 1001, 0),
    ]
    cur.executemany("INSERT INTO departments VALUES (?,?,?,?,?)", departments)

    # --- Positions (230 slots) ---
    leaf_depts = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    top_depts = [1, 2, 3, 4, 19]
    positions = []
    nxp, lvl_seq = 101, 0
    for did in leaf_depts:
        for t in TRADES:
            positions.append((nxp, t, LEVELS[lvl_seq % 8], did))
            nxp += 1; lvl_seq += 1
    for did in top_depts:
        for ti in range(4):
            positions.append((nxp, TRADES[ti % 7], LEVELS[lvl_seq % 8], did))
            nxp += 1; lvl_seq += 1
    while len(positions) < 230:
        di = leaf_depts[(len(positions) - 118) % 14]
        positions.append((nxp, TRADES[len(positions) % 7], LEVELS[lvl_seq % 8], di))
        nxp += 1; lvl_seq += 1
    cur.executemany("INSERT INTO positions VALUES (?,?,?,?)", positions)

    pos_map = {p[0]: p for p in positions}

    def find_pos_in_dept(dept_id, trade):
        for p in positions:
            if p[3] == dept_id and p[1] == trade:
                return p[0]
        for p in positions:
            if p[3] == dept_id:
                return p[0]
        return positions[0][0]

    # --- Employees (210) ---
    CORE = [
        (1001, "张文华", 19, "Big Data", 1002, "2016-03-01", "active", "PIC"),
        (1002, "陈志伟", 1, "Backend", None, "2015-01-10", "active", "PIC"),
        (1003, "李明远", 2, "Frontend", 1002, "2016-06-15", "active", "PIC"),
        (1004, "王雅琴", 3, "Frontend", 1002, "2016-09-01", "active", "PIC"),
        (1005, "刘建国", 4, "Backend", 1002, "2017-02-20", "active", "PIC"),
        (1006, "杨浩然", 5, "Frontend", 1002, "2018-03-10", "active", "RM"),
        (1007, "黄博文", 6, "Backend", 1002, "2018-05-20", "active", "RM"),
        (1008, "周子轩", 7, "Algorithm", 1002, "2018-08-01", "active", "RM"),
        (1009, "吴思远", 8, "QA", 1002, "2018-11-15", "active", "RM"),
        (1010, "孙雅琪", 9, "Frontend", 1003, "2019-01-10", "active", "RM"),
        (1011, "马天宇", 10, "Mobile", 1003, "2019-04-01", "active", "RM"),
        (1012, "朱诗涵", 11, "Big Data", 1003, "2019-06-20", "active", "RM"),
        (1013, "郑晓峰", 12, "Frontend", 1004, "2019-02-15", "active", "RM"),
        (1014, "何文静", 13, "Backend", 1004, "2019-05-10", "active", "RM"),
        (1015, "林佳怡", 14, "Algorithm", 1004, "2019-09-01", "active", "RM"),
        (1016, "高嘉诚", 15, "Backend", 1005, "2019-03-20", "active", "RM"),
        (1017, "郑志强", 16, "Frontend", 1005, "2019-07-01", "active", "RM"),
        (1018, "王海燕", 17, "Mobile", 1005, "2019-10-15", "active", "RM"),
        (1019, "刘雨薇", 18, "SDET", 1005, "2020-01-06", "active", "RM"),
    ]
    status_rot = ["active"] * 6 + ["probation", "leave"]
    employees_raw = []

    for c in CORE:
        eid, nm, dept, trade, mgr, hire, st, role = c
        employees_raw.append({
            "id": eid, "name": nm, "gender": "男" if eid % 2 == 0 else "女",
            "birthday": pad_ymd(1978 + (eid % 20), 1 + (eid % 12), 1 + (eid % 28)),
            "department_id": dept, "position_id": find_pos_in_dept(dept, trade),
            "manager_id": mgr, "hire_date": hire, "status": st,
            "phone": f"138{str(10000000 + eid)[-8:]}", "email": f"emp{eid}@company.com",
            "org_role": role,
        })

    IC_DIST = [
        (5, 1006, 15), (6, 1007, 15), (7, 1008, 14), (8, 1009, 13),
        (9, 1010, 12), (10, 1011, 12), (11, 1012, 12), (12, 1013, 12),
        (13, 1014, 11), (14, 1015, 11), (15, 1016, 12), (16, 1017, 11),
        (17, 1018, 11), (18, 1019, 10),
    ]
    ic_id, name_seq = 1020, 20
    for dept, mgr, count in IC_DIST:
        for _ in range(count):
            emp_idx = ic_id - 1001
            employees_raw.append({
                "id": ic_id, "name": gen_name(name_seq),
                "gender": "男" if name_seq % 2 == 0 else "女",
                "birthday": pad_ymd(1985 + (emp_idx % 15), 1 + (emp_idx % 12), 1 + (emp_idx % 28)),
                "department_id": dept,
                "position_id": find_pos_in_dept(dept, TRADES[(name_seq * 3) % 7]),
                "manager_id": mgr,
                "hire_date": pad_ymd(2017 + (emp_idx % 8), 1 + ((emp_idx * 3) % 12), 1 + ((emp_idx * 7) % 28)),
                "status": status_rot[emp_idx % 8],
                "phone": f"138{str(10000000 + ic_id)[-8:]}",
                "email": f"emp{ic_id}@company.com", "org_role": "",
            })
            ic_id += 1; name_seq += 1

    HIRED_TEAMS = [
        (5, 1006), (6, 1007), (7, 1008), (9, 1010), (10, 1011),
        (12, 1013), (13, 1014), (15, 1016), (16, 1017), (18, 1019),
    ]
    for h in range(10):
        hid = 1201 + h
        dept, mgr = HIRED_TEAMS[h]
        employees_raw.append({
            "id": hid, "name": gen_name(name_seq + 100 + h),
            "gender": "男" if h % 2 == 0 else "女",
            "birthday": pad_ymd(1992 + (h % 8), 1 + (h % 12), 1 + (h % 28)),
            "department_id": dept,
            "position_id": find_pos_in_dept(dept, TRADES[h % 7]),
            "manager_id": mgr,
            "hire_date": pad_ymd(2026, 1 + (h % 3), 15 + h),
            "status": "active",
            "phone": f"138{str(10000000 + hid)[-8:]}",
            "email": f"emp{hid}@company.com", "org_role": "",
        })

    for i, e in enumerate(employees_raw):
        e["grad_school"] = GRAD_SCHOOLS[i % 12]
        e["career_start_date"] = add_years(e["hire_date"], -2 - (i % 5))
        e["level_start_date"] = add_years(e["hire_date"], -(i % 3))
        e["management_plan"] = MGMT_PLANS[i % 6]
        e["salary_band"] = SALARY_BANDS[i % 5] if i < 80 else ""

    cur.executemany(
        """INSERT INTO employees (id,name,gender,birthday,department_id,position_id,
           manager_id,hire_date,status,phone,email,org_role,grad_school,
           career_start_date,level_start_date,management_plan,salary_band)
           VALUES (:id,:name,:gender,:birthday,:department_id,:position_id,
           :manager_id,:hire_date,:status,:phone,:email,:org_role,:grad_school,
           :career_start_date,:level_start_date,:management_plan,:salary_band)""",
        employees_raw,
    )

    # --- Users ---
    users = [
        (1, "hrbp", "hrbp@company.com", "hrbp", "张文华", 1001, 1, "super_admin"),
        (2, "manager", "manager@company.com", "manager", "陈志伟", 1002, 0, None),
        (3, "superadmin", "superadmin@company.com", "hrbp", "Super Admin", None, 1, "super_admin"),
        (4, "intern", "intern@company.com", "hrbp", "实习生", None, 0, "intern"),
        (5, "tyler.yan", "tyler.yan@shopee.com", "hrbp", "Tyler Yan", None, 1, "super_admin"),
        (6, "li.my", "emp1003@company.com", "manager", "李明远", 1003, 0, None),
        (7, "yang.hr", "emp1006@company.com", "manager", "杨浩然", 1006, 0, None),
        (8, "huang.bw", "emp1007@company.com", "manager", "黄博文", 1007, 0, None),
    ]
    cur.executemany("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)", users)

    # --- Leave requests ---
    leaves = [
        (1, 1020, "annual", "2026-03-10", "2026-03-12", "家庭旅行", "pending", 1006, "2026-03-01"),
        (2, 1025, "sick", "2026-02-05", "2026-02-06", "身体不适", "approved", 1007, "2026-02-04"),
        (3, 1040, "annual", "2026-04-01", "2026-04-03", "年假休息", "pending", 1010, "2026-03-18"),
        (4, 1060, "overtime", "2026-03-15", "2026-03-15", "加班调休", "rejected", 1013, "2026-03-14"),
        (5, 1080, "sick", "2026-01-20", "2026-01-21", "感冒发烧", "approved", 1016, "2026-01-19"),
        (6, 1100, "annual", "2026-04-10", "2026-04-14", "出国旅行", "pending", 1018, "2026-03-25"),
    ]
    cur.executemany("INSERT INTO leave_requests VALUES (?,?,?,?,?,?,?,?,?)", leaves)

    # --- Performance cycles ---
    cycles = [
        (1, "H1 2022", "half_year", "2022-01-01", "2022-06-30", "closed"),
        (2, "FY 2022", "year", "2022-01-01", "2022-12-31", "closed"),
        (3, "H1 2023", "half_year", "2023-01-01", "2023-06-30", "closed"),
        (4, "FY 2023", "year", "2023-01-01", "2023-12-31", "closed"),
        (5, "H1 2024", "half_year", "2024-01-01", "2024-06-30", "closed"),
        (6, "FY 2024", "year", "2024-01-01", "2024-12-31", "closed"),
        (7, "H1 2025", "half_year", "2025-01-01", "2025-06-30", "closed"),
        (8, "FY 2025", "year", "2025-01-01", "2025-12-31", "closed"),
        (9, "H1 2026", "half_year", "2026-01-01", "2026-06-30", "open"),
    ]
    cur.executemany("INSERT INTO performance_cycles VALUES (?,?,?,?,?,?)", cycles)

    # --- Performance reviews ---
    active_emps = [e for e in employees_raw if e["status"] != "leave"]
    reviews = []
    rid = 1
    for e in active_emps:
        rng = seeded_rand(e["id"] * 7 + 31)
        bias = int(rng() * 3) - 1
        hire_y = int(e["hire_date"][:4])
        hire_m = int(e["hire_date"][5:7])
        for cy in cycles:
            cy_id, cy_name, _, cy_start, cy_end, cy_status = cy
            cy_y = int(cy_start[:4]); cy_m = int(cy_start[5:7])
            if cy_y < hire_y or (cy_y == hire_y and cy_m < hire_m):
                continue
            reviewer = e["manager_id"] or 1001
            if cy_id == 9:
                roll = rng(); rm_g = pick_grade(rng, bias)
                if roll < 0.18:
                    st, rm_g, fg = "rm_pending", "", ""
                elif roll < 0.28:
                    st, fg = "rm_evaluated", ""
                elif roll < 0.42:
                    st, fg = "in_approval", ""
                elif roll < 0.55:
                    st, fg = "pl_pending", ""
                elif roll < 0.65:
                    st, fg = "calibrated", rm_g
                elif roll < 0.78:
                    st, fg = "pl_approved", ""
                else:
                    st, fg = "finalized", rm_g
                cal_by = 1001 if st in ("calibrated", "pl_approved", "finalized") else None
                cal_at = "2026-03-28" if cal_by else None
                reviews.append((
                    rid, e["id"], reviewer, cy_id, rm_g, fg, st,
                    "H1 2026 评估评语" if st != "rm_pending" else "",
                    "本周期产出总结" if st != "rm_pending" else "",
                    cal_by, cal_at, "2026-03-15",
                ))
            else:
                g = pick_grade(rng, bias)
                reviews.append((
                    rid, e["id"], reviewer, cy_id, g, g, "finalized",
                    f"{cy_name} 绩效评语", "产出符合预期",
                    1001, cy_end, cy_start,
                ))
            rid += 1

    cur.executemany(
        """INSERT INTO performance_reviews
           (id,employee_id,reviewer_id,cycle_id,rm_initial_grade,final_grade,status,
            rm_comment,output_description,calibrated_by,calibrated_at,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        reviews,
    )

    # --- Trainings ---
    trainings_data = [
        (1, "Vue 3 实战", "响应式原理与 Composition API", "技术", 8),
        (2, "沟通与影响力", "职场沟通与向上管理", "软技能", 4),
        (3, "数据驱动的产品决策", "指标体系与 A/B 测试基础", "产品", 6),
        (4, "销售漏斗管理", "B2B 管线拆解", "销售", 5),
    ]
    cur.executemany("INSERT INTO trainings VALUES (?,?,?,?,?)", trainings_data)

    emp_trainings = [
        (1, 1020, 1, "in_progress", 1006, None),
        (2, 1025, 2, "completed", 1007, "2026-02-01"),
        (3, 1040, 3, "in_progress", 1010, None),
        (4, 1060, 4, "completed", 1013, "2026-01-15"),
    ]
    cur.executemany("INSERT INTO employee_trainings VALUES (?,?,?,?,?,?)", emp_trainings)

    # --- Attendance records ---
    PUNCH_MONTHS = [(2025, 10), (2025, 11), (2025, 12), (2026, 1), (2026, 2), (2026, 3)]
    TIER_TARGETS = [
        (18, 10, 10), (18, 50, 10), (19, 20, 8), (19, 50, 10), (20, 25, 12),
    ]
    att_records = []
    att_id = 1
    for i, e in enumerate(active_emps):
        out_h, out_m, j = TIER_TARGETS[i % 5]
        in_h, in_m = 9, (i * 7 + 3) % 30
        for y, m in PUNCH_MONTHS:
            wd = len(gen_workdays(y, m)) - random.randint(0, 1)
            base_h = (out_h + out_m / 60) - (in_h + in_m / 60)
            avg = round((base_h + (random.random() - 0.5) * (j / 30)) * 10) / 10
            avg = max(6.0, min(16.0, avg))
            att_records.append((att_id, e["id"], f"{y}-{m:02d}", avg, max(1, wd)))
            att_id += 1
    cur.executemany("INSERT INTO attendance_records VALUES (?,?,?,?,?)", att_records)

    # --- Talent matrix ---
    talent = [
        (e["id"], PERF_MAP[i % 3], POT_MAP[(i // 3) % 3], "")
        for i, e in enumerate(active_emps)
    ]
    cur.executemany("INSERT INTO talent_matrix VALUES (?,?,?,?)", talent)

    # --- Succession plans ---
    succ = [
        (1, find_pos_in_dept(5, "Frontend"), "1020,1021", "前端开发组 · 高级前端继任池"),
        (2, find_pos_in_dept(6, "Backend"), "1035,1036", "后端开发组 · 核心后端继任池"),
        (3, find_pos_in_dept(7, "Algorithm"), "1050,1051", "算法工程组 · 算法专家继任池"),
        (4, find_pos_in_dept(9, "Frontend"), "1064,1065", "产品策略组 · 产品经理继任池"),
    ]
    cur.executemany("INSERT INTO succession_plans VALUES (?,?,?,?)", succ)

    # --- Recruitment pipeline (100 candidates) ---
    CAND_STAGES = [
        (10, "pass", "pass", "pass", "pass", "pass", "accepted", True),
        (8, "pass", "pass", "pass", "pass", "pass", "accepted", False),
        (5, "pass", "pass", "pass", "pass", "pass", "pending", False),
        (5, "pass", "pass", "pass", "pass", "pass", "declined", False),
        (8, "pass", "pass", "pass", "pass", "pending", "", False),
        (10, "pass", "pass", "pass", "pending", "", "", False),
        (12, "pass", "pass", "pending", "", "", "", False),
        (5, "pass", "pass", "fail", "", "", "", False),
        (4, "pass", "pass", "pass", "fail", "", "", False),
        (4, "pass", "pass", "pass", "pass", "fail", "", False),
        (8, "pass", "pending", "", "", "", "", False),
        (7, "pending", "", "", "", "", "", False),
        (10, "fail", "", "", "", "", "", False),
    ]
    OPEN_SLOTS = [
        (5, "Frontend"), (5, "Mobile"), (5, "Backend"), (6, "Backend"),
        (6, "SDET"), (6, "Algorithm"), (7, "Algorithm"), (7, "Big Data"),
        (8, "QA"), (8, "SDET"), (9, "Frontend"), (9, "Mobile"),
        (10, "Frontend"), (10, "Mobile"), (11, "Big Data"), (11, "Algorithm"),
        (12, "Frontend"), (12, "Backend"), (13, "Frontend"), (13, "Mobile"),
        (14, "Algorithm"), (14, "Frontend"), (15, "Backend"), (15, "Frontend"),
        (16, "Frontend"), (16, "Backend"), (17, "Mobile"), (17, "QA"),
        (18, "SDET"), (18, "Backend"),
    ]
    dept_by_id = {d[0]: d[1] for d in departments}
    recruiters_list = ["赵敏", "孙磊", "周婷", "林芳"]
    hr_screeners = ["李娜", "刘洋", "张华"]
    interviewers_list = ["张伟", "王强", "陈静", "刘洋", "李敏"]
    pipeline = []
    cand_idx, slot_idx = 0, 0
    for stage in CAND_STAGES:
        n, hr, hri, i1, i2, iF, off, ob = stage
        for _ in range(n):
            cand_idx += 1
            slot = OPEN_SLOTS[slot_idx % len(OPEN_SLOTS)]; slot_idx += 1
            team_name = dept_by_id.get(slot[0], "技术部")
            date_off = cand_idx * 2
            mo = min(date_off // 30 + 1, 4)
            dy = max(1, min(28, (date_off % 28) + 1))
            ob_date = pad_ymd(2026, 1 + (cand_idx % 3), min(28, 10 + (cand_idx % 15))) if ob else ""
            scr = ""
            if off in ("accepted", "pending", "declined"):
                scr = str(3 + (cand_idx % 3))
            elif i1 in ("pass", "fail"):
                scr = str(2 + (cand_idx % 3))
            comment = ""
            if hr == "fail": comment = "简历不符合要求"
            elif i1 == "fail": comment = "面试未通过"
            elif i2 == "fail": comment = "技术深度不足"
            elif iF == "fail": comment = "终面未通过"
            elif off == "declined": comment = "候选人拒绝offer"
            pipeline.append((
                f"P{cand_idx:03d}", pad_ymd(2026, mo, dy),
                gen_name(200 + cand_idx), team_name, slot[1],
                "campus" if cand_idx % 3 == 0 else "social",
                recruiters_list[cand_idx % 4],
                hr, hri,
                i1, interviewers_list[cand_idx % 5] if i1 else "",
                i2, interviewers_list[(cand_idx + 1) % 5] if i2 else "",
                iF, interviewers_list[(cand_idx + 2) % 5] if iF else "",
                scr, off, ob_date, comment, str(cand_idx % 10),
            ))
    cur.executemany(
        """INSERT INTO recruitment_pipeline VALUES
           (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        pipeline,
    )

    # --- Notifications ---
    notifs = [
        (1, 1020, "培训推荐", "你的经理推荐了 \"Vue 3 实战\"", 0, "2026-03-18"),
        (2, 1002, "绩效周期提醒", "H1 2026 绩效评估已开启，请尽快完成团队评估", 0, "2026-03-15"),
        (3, 1006, "审批待处理", "有3位团队成员的绩效评估待您提交", 0, "2026-03-20"),
    ]
    cur.executemany("INSERT INTO notifications VALUES (?,?,?,?,?,?)", notifs)


def main():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"已删除旧数据库：{DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print("创建表结构…")
    create_tables(cur)

    print("写入种子数据…")
    seed_data(cur)

    conn.commit()

    # 统计
    tables = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    print(f"\n{'='*50}")
    print(f"数据库创建完成: {DB_PATH}")
    print(f"{'='*50}")
    for (t,) in tables:
        cnt = cur.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
        print(f"  {t:30s} {cnt:>6,} 行")
    print(f"{'='*50}")

    conn.close()


if __name__ == "__main__":
    main()
