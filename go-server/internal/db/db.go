package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

func Open(dbPath string) *sql.DB {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Fatalf("Cannot create DB directory %s: %v", dir, err)
	}
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_foreign_keys=ON")
	if err != nil {
		log.Fatalf("Cannot open database: %v", err)
	}
	db.SetMaxOpenConns(1)
	return db
}

func InitSchema(db *sql.DB) {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS product_lines (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS workspace_snapshots (
			line_id INTEGER PRIMARY KEY REFERENCES product_lines(id) ON DELETE CASCADE,
			json TEXT NOT NULL,
			version INTEGER NOT NULL DEFAULT 1,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS login_users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			username TEXT,
			role TEXT NOT NULL,
			real_name TEXT,
			employee_id INTEGER,
			super_admin INTEGER NOT NULL DEFAULT 0
		)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			log.Fatalf("Schema init failed: %v", err)
		}
	}
}

func BootSeed(db *sql.DB) {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM product_lines").Scan(&count); err != nil {
		log.Fatalf("Cannot check product_lines: %v", err)
	}
	if count > 0 {
		return
	}

	today := time.Now().Format("2006-01-02")
	now := time.Now().Format(time.RFC3339)
	demo := BuildDemoWorkspace()
	demoJSON, _ := json.Marshal(demo)

	tx, _ := db.Begin()
	tx.Exec("INSERT INTO product_lines (id, name, created_at) VALUES (?, ?, ?)", 1, "Default product line", today)
	tx.Exec("INSERT INTO workspace_snapshots (line_id, json, version, updated_at) VALUES (?, ?, 1, ?)", 1, string(demoJSON), now)

	seedUsers := []struct {
		Email      string
		Password   string
		Username   string
		Role       string
		RealName   string
		EmployeeID *int
		SuperAdmin int
	}{
		{"hrbp@company.com", "123", "hrbp", "hrbp", "HRBP Admin", nil, 0},
		{"manager@company.com", "123", "manager", "manager", "Reporting Manager", intPtr(1005), 0},
		{"superadmin@company.com", "123", "superadmin", "hrbp", "Super Admin", nil, 1},
	}
	for _, u := range seedUsers {
		hash, _ := bcrypt.GenerateFromPassword([]byte(u.Password), 10)
		tx.Exec(`INSERT INTO login_users (email, password_hash, username, role, real_name, employee_id, super_admin)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			u.Email, string(hash), u.Username, u.Role, u.RealName, u.EmployeeID, u.SuperAdmin)
	}
	tx.Commit()
	log.Println("[db] Seeded default product line, demo workspace, and login users.")
}

func intPtr(v int) *int { return &v }

// ─── Queries ────────────────────────────────────────────────────────

type ProductLine struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type WorkspaceRow struct {
	LineID    int
	JSON      string
	Version   int
	UpdatedAt string
}

type LoginUser struct {
	ID           int
	Email        string
	PasswordHash string
	Username     string
	Role         string
	RealName     string
	EmployeeID   *int
	SuperAdmin   int
}

func ListProductLines(db *sql.DB) ([]ProductLine, error) {
	rows, err := db.Query("SELECT id, name, created_at FROM product_lines ORDER BY id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var lines []ProductLine
	for rows.Next() {
		var l ProductLine
		rows.Scan(&l.ID, &l.Name, &l.CreatedAt)
		lines = append(lines, l)
	}
	return lines, nil
}

func GetWorkspace(db *sql.DB, lineID int) (*WorkspaceRow, error) {
	row := db.QueryRow("SELECT line_id, json, version, updated_at FROM workspace_snapshots WHERE line_id = ?", lineID)
	var ws WorkspaceRow
	err := row.Scan(&ws.LineID, &ws.JSON, &ws.Version, &ws.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &ws, nil
}

func UpdateWorkspaceIfVersion(db *sql.DB, lineID, clientVersion int, jsonStr string) (int, string, error) {
	var currentVersion int
	err := db.QueryRow("SELECT version FROM workspace_snapshots WHERE line_id = ?", lineID).Scan(&currentVersion)
	if err == sql.ErrNoRows {
		return 0, "no_workspace", fmt.Errorf("no workspace")
	}
	if err != nil {
		return 0, "", err
	}
	if currentVersion != clientVersion {
		return currentVersion, "version_mismatch", fmt.Errorf("version mismatch")
	}
	nextV := currentVersion + 1
	now := time.Now().Format(time.RFC3339)
	_, err = db.Exec("UPDATE workspace_snapshots SET json = ?, version = ?, updated_at = ? WHERE line_id = ?",
		jsonStr, nextV, now, lineID)
	if err != nil {
		return 0, "", err
	}
	return nextV, "", nil
}

func CreateProductLine(db *sql.DB, name string) (*ProductLine, error) {
	today := time.Now().Format("2006-01-02")
	now := time.Now().Format(time.RFC3339)

	res, err := db.Exec("INSERT INTO product_lines (name, created_at) VALUES (?, ?)", name, today)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()

	empty := BuildEmptyWorkspace()
	emptyJSON, _ := json.Marshal(empty)
	db.Exec("INSERT INTO workspace_snapshots (line_id, json, version, updated_at) VALUES (?, ?, 1, ?)",
		id, string(emptyJSON), now)

	return &ProductLine{ID: int(id), Name: name, CreatedAt: today}, nil
}

func DeleteProductLine(db *sql.DB, lineID int) (string, error) {
	var n int
	db.QueryRow("SELECT COUNT(*) FROM product_lines").Scan(&n)
	if n <= 1 {
		return "last_line", fmt.Errorf("至少保留一条产品线")
	}
	var exists int
	err := db.QueryRow("SELECT id FROM product_lines WHERE id = ?", lineID).Scan(&exists)
	if err == sql.ErrNoRows {
		return "not_found", fmt.Errorf("产品线不存在")
	}
	db.Exec("DELETE FROM product_lines WHERE id = ?", lineID)
	return "", nil
}

func FindLoginUserByEmail(db *sql.DB, email string) (*LoginUser, error) {
	row := db.QueryRow("SELECT id, email, password_hash, username, role, real_name, employee_id, super_admin FROM login_users WHERE lower(email) = lower(?)", email)
	return scanLoginUser(row)
}

func FindLoginUserByUsername(db *sql.DB, username string) (*LoginUser, error) {
	row := db.QueryRow("SELECT id, email, password_hash, username, role, real_name, employee_id, super_admin FROM login_users WHERE lower(username) = lower(?)", username)
	return scanLoginUser(row)
}

func FindLoginUserByID(db *sql.DB, id int) (*LoginUser, error) {
	row := db.QueryRow("SELECT id, email, password_hash, username, role, real_name, employee_id, super_admin FROM login_users WHERE id = ?", id)
	return scanLoginUser(row)
}

func scanLoginUser(row *sql.Row) (*LoginUser, error) {
	var u LoginUser
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Username, &u.Role, &u.RealName, &u.EmployeeID, &u.SuperAdmin)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}
