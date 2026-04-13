package workspace

import (
	"testing"
)

func TestToInt(t *testing.T) {
	tests := []struct {
		input    interface{}
		expected int
	}{
		{42, 42},
		{3.14, 3},
		{float64(100), 100},
		{"123", 123},
		{"abc", 0},
		{nil, 0},
	}
	for _, tt := range tests {
		got := toInt(tt.input)
		if got != tt.expected {
			t.Errorf("toInt(%v) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}

func TestVisibleEmployeeIds(t *testing.T) {
	employees := []interface{}{
		map[string]interface{}{"id": 1, "managerId": nil},
		map[string]interface{}{"id": 2, "managerId": 1},
		map[string]interface{}{"id": 3, "managerId": 1},
		map[string]interface{}{"id": 4, "managerId": 2},
		map[string]interface{}{"id": 5, "managerId": 3},
	}

	vis := VisibleEmployeeIds(1, employees)
	if len(vis) != 5 {
		t.Errorf("Expected 5 visible employees for root manager, got %d", len(vis))
	}

	vis2 := VisibleEmployeeIds(2, employees)
	if len(vis2) != 2 {
		t.Errorf("Expected 2 visible employees for manager 2, got %d", len(vis2))
	}
	if !vis2[2] || !vis2[4] {
		t.Error("Manager 2 should see self (2) and subordinate (4)")
	}
}

func TestDeptIdsInOrgScope(t *testing.T) {
	departments := []interface{}{
		map[string]interface{}{"id": 1, "parentId": nil},
		map[string]interface{}{"id": 2, "parentId": 1},
		map[string]interface{}{"id": 3, "parentId": 1},
		map[string]interface{}{"id": 4, "parentId": 2},
	}

	scope := DeptIdsInOrgScope(0, departments)
	if scope != nil {
		t.Error("Root 0 should return nil (no restriction)")
	}

	scope1 := DeptIdsInOrgScope(1, departments)
	if len(scope1) != 4 {
		t.Errorf("Root 1 should include all 4 departments, got %d", len(scope1))
	}

	scope2 := DeptIdsInOrgScope(2, departments)
	if len(scope2) != 2 {
		t.Errorf("Root 2 should include 2 departments (2, 4), got %d", len(scope2))
	}

	scopeInvalid := DeptIdsInOrgScope(999, departments)
	if len(scopeInvalid) != 0 {
		t.Errorf("Invalid root should return empty set, got %d", len(scopeInvalid))
	}
}

func TestApplyPatch(t *testing.T) {
	workspace := map[string]interface{}{
		"employees": []interface{}{
			map[string]interface{}{"id": float64(1), "name": "Alice"},
			map[string]interface{}{"id": float64(2), "name": "Bob"},
		},
		"departments": []interface{}{},
	}

	patch := map[string]interface{}{
		"employees": map[string]interface{}{
			"upsert": []interface{}{
				map[string]interface{}{"id": float64(3), "name": "Charlie"},
				map[string]interface{}{"id": float64(1), "name": "Alice Updated"},
			},
			"removeIds": []interface{}{float64(2)},
		},
	}

	result := ApplyPatch(workspace, patch)
	emps := result["employees"].([]interface{})
	if len(emps) != 2 {
		t.Errorf("Expected 2 employees after patch, got %d", len(emps))
	}

	alice := emps[0].(map[string]interface{})
	if alice["name"] != "Alice Updated" {
		t.Errorf("Alice should be updated, got %v", alice["name"])
	}

	charlie := emps[1].(map[string]interface{})
	if charlie["name"] != "Charlie" {
		t.Errorf("Charlie should be added, got %v", charlie["name"])
	}
}

func TestStripUserPasswords(t *testing.T) {
	data := map[string]interface{}{
		"users": []interface{}{
			map[string]interface{}{"id": 1, "email": "test@test.com", "password": "secret123"},
		},
	}
	stripped := StripUserPasswords(data)
	users := stripped["users"].([]interface{})
	user := users[0].(map[string]interface{})
	if _, hasPassword := user["password"]; hasPassword {
		t.Error("Password should be stripped")
	}
	if user["email"] != "test@test.com" {
		t.Error("Email should remain")
	}
}

func TestParseScopeRootDeptID(t *testing.T) {
	tests := []struct {
		input    string
		expected int
	}{
		{"", 0},
		{"0", 0},
		{"-1", 0},
		{"abc", 0},
		{"5", 5},
		{"100", 100},
	}
	for _, tt := range tests {
		got := ParseScopeRootDeptID(tt.input)
		if got != tt.expected {
			t.Errorf("ParseScopeRootDeptID(%q) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}
