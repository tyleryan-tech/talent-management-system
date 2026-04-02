const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { buildDemoWorkspace } = require('./demoWorkspace');

function openDatabase() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'talent-hub.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_snapshots (
      line_id INTEGER PRIMARY KEY REFERENCES product_lines(id) ON DELETE CASCADE,
      json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username TEXT,
      role TEXT NOT NULL,
      real_name TEXT,
      employee_id INTEGER,
      super_admin INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function bootSeed(db) {
  const lineCount = db.prepare('SELECT COUNT(*) AS c FROM product_lines').get().c;
  if (lineCount > 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const demo = buildDemoWorkspace();

  const insertLine = db.prepare('INSERT INTO product_lines (id, name, created_at) VALUES (?, ?, ?)');
  insertLine.run(1, 'Default product line', today);

  const insertWs = db.prepare(
    'INSERT INTO workspace_snapshots (line_id, json, version, updated_at) VALUES (?, ?, 1, ?)',
  );
  insertWs.run(1, JSON.stringify(demo), new Date().toISOString());

  const insertUser = db.prepare(`
    INSERT INTO login_users (email, password_hash, username, role, real_name, employee_id, super_admin)
    VALUES (@email, @password_hash, @username, @role, @real_name, @employee_id, @super_admin)
  `);

  const hash = (p) => bcrypt.hashSync(p, 10);

  insertUser.run({
    email: 'hrbp@company.com',
    password_hash: hash('123'),
    username: 'hrbp',
    role: 'hrbp',
    real_name: 'HRBP Admin',
    employee_id: null,
    super_admin: 0,
  });
  insertUser.run({
    email: 'manager@company.com',
    password_hash: hash('123'),
    username: 'manager',
    role: 'manager',
    real_name: 'Reporting Manager',
    employee_id: 1005,
    super_admin: 0,
  });
  insertUser.run({
    email: 'superadmin@company.com',
    password_hash: hash('123'),
    username: 'superadmin',
    role: 'hrbp',
    real_name: 'Super Admin',
    employee_id: null,
    super_admin: 1,
  });

  // eslint-disable-next-line no-console
  console.log('[db] Seeded default product line, demo workspace, and login users.');
}

function getWorkspace(db, lineId) {
  const row = db
    .prepare(
      'SELECT line_id, json, version, updated_at FROM workspace_snapshots WHERE line_id = ?',
    )
    .get(lineId);
  return row || null;
}

function listProductLines(db) {
  return db.prepare('SELECT id, name, created_at FROM product_lines ORDER BY id ASC').all();
}

function updateWorkspaceIfVersion(db, lineId, clientVersion, jsonStr) {
  const row = db.prepare('SELECT version FROM workspace_snapshots WHERE line_id = ?').get(lineId);
  if (!row) return { ok: false, reason: 'no_workspace' };
  if (Number(row.version) !== Number(clientVersion)) {
    return { ok: false, reason: 'version_mismatch', currentVersion: row.version };
  }
  const nextV = Number(row.version) + 1;
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE workspace_snapshots SET json = ?, version = ?, updated_at = ? WHERE line_id = ?',
  ).run(jsonStr, nextV, now, lineId);
  return { ok: true, version: nextV };
}

function createProductLine(db, name) {
  const today = new Date().toISOString().slice(0, 10);
  const r = db.prepare('INSERT INTO product_lines (name, created_at) VALUES (?, ?)').run(name, today);
  const id = r.lastInsertRowid;
  const empty = {
    hrScopeRootDepartmentId: null,
    employees: [],
    departments: [],
    positions: [],
    leaveRequests: [],
    performanceReviews: [],
    trainings: [],
    employeeTrainings: [],
    users: [
      {
        id: 1,
        username: 'hrbp',
        email: 'hrbp@company.com',
        password: '123',
        role: 'hrbp',
        realName: 'HRBP Admin',
        employeeId: null,
      },
      {
        id: 2,
        username: 'manager',
        email: 'manager@company.com',
        password: '123',
        role: 'manager',
        realName: 'Reporting Manager',
        employeeId: null,
      },
      {
        id: 3,
        username: 'superadmin',
        email: 'superadmin@company.com',
        password: '123',
        role: 'hrbp',
        superAdmin: true,
        realName: 'Super Admin',
        employeeId: null,
      },
    ],
    attendanceRules: {
      workStart: '09:30',
      workEnd: '18:30',
      leaveTypes: ['annual', 'sick', 'personal', 'overtime'],
      labels: { annual: 'Annual', sick: 'Sick', personal: 'Personal', overtime: 'Comp time' },
      monthlyStandardDays: 20,
      loadBandLow: 0.88,
      loadBandHigh: 1.12,
    },
    attendanceRecords: [],
    punchRecords: [],
    kpiLibrary: [],
    performanceCycles: [],
    talentMatrix: [],
    successionPlans: [],
    notifications: [],
    positionRecruitTags: {},
    recruitmentCandidates: [],
    recruitmentPositionMetrics: {},
    orgSettings: { productLineOwnerEmployeeId: null },
    orgChangeRequests: [],
    rosterColumnSettings: null,
  };
  db.prepare(
    'INSERT INTO workspace_snapshots (line_id, json, version, updated_at) VALUES (?, ?, 1, ?)',
  ).run(id, JSON.stringify(empty), new Date().toISOString());
  return { id, name, createdAt: today };
}

function deleteProductLine(db, lineId) {
  const n = db.prepare('SELECT COUNT(*) AS c FROM product_lines').get().c;
  if (n <= 1) return { ok: false, reason: 'last_line' };
  const row = db.prepare('SELECT id FROM product_lines WHERE id = ?').get(lineId);
  if (!row) return { ok: false, reason: 'not_found' };
  db.prepare('DELETE FROM product_lines WHERE id = ?').run(lineId);
  return { ok: true };
}

function findLoginUserByEmail(db, email) {
  const em = String(email || '').trim().toLowerCase();
  return db
    .prepare('SELECT * FROM login_users WHERE lower(email) = ?')
    .get(em);
}

function findLoginUserByUsername(db, username) {
  const u = String(username || '').trim().toLowerCase();
  return db.prepare('SELECT * FROM login_users WHERE lower(username) = ?').get(u);
}

module.exports = {
  openDatabase,
  initSchema,
  bootSeed,
  getWorkspace,
  listProductLines,
  updateWorkspaceIfVersion,
  createProductLine,
  deleteProductLine,
  findLoginUserByEmail,
  findLoginUserByUsername,
};
