package workspace

import (
	"encoding/json"
	"strconv"
	"strings"
)

// StripUserPasswords removes password fields from user objects in workspace data.
func StripUserPasswords(data map[string]interface{}) map[string]interface{} {
	out := copyMap(data)
	if users, ok := out["users"]; ok {
		if arr, ok := users.([]interface{}); ok {
			stripped := make([]interface{}, len(arr))
			for i, u := range arr {
				if m, ok := u.(map[string]interface{}); ok {
					nm := copyMap(m)
					delete(nm, "password")
					stripped[i] = nm
				} else {
					stripped[i] = u
				}
			}
			out["users"] = stripped
		}
	}
	return out
}

// VisibleEmployeeIds returns a set of employee IDs visible to a manager (self + all subordinates).
func VisibleEmployeeIds(rootManagerEmpID int, employees []interface{}) map[int]bool {
	byManager := make(map[int][]int)
	for _, e := range employees {
		emp, ok := e.(map[string]interface{})
		if !ok {
			continue
		}
		mid := toInt(emp["managerId"])
		eid := toInt(emp["id"])
		if mid != 0 && eid != 0 {
			byManager[mid] = append(byManager[mid], eid)
		}
	}

	out := map[int]bool{rootManagerEmpID: true}
	stack := append([]int{}, byManager[rootManagerEmpID]...)
	for len(stack) > 0 {
		id := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if out[id] {
			continue
		}
		out[id] = true
		stack = append(stack, byManager[id]...)
	}
	return out
}

// VisibleDepartmentIds returns department IDs for visible employees + ancestor departments.
func VisibleDepartmentIds(visEmp map[int]bool, employees, departments []interface{}) map[int]bool {
	byID := make(map[int]map[string]interface{})
	for _, d := range departments {
		dm, ok := d.(map[string]interface{})
		if !ok {
			continue
		}
		byID[toInt(dm["id"])] = dm
	}

	deptIds := make(map[int]bool)
	for _, e := range employees {
		emp, ok := e.(map[string]interface{})
		if !ok {
			continue
		}
		eid := toInt(emp["id"])
		did := toInt(emp["departmentId"])
		if visEmp[eid] && did != 0 {
			deptIds[did] = true
		}
	}

	ancestors := make(map[int]bool)
	for did := range deptIds {
		ancestors[did] = true
		cur := byID[did]
		for cur != nil {
			pid := toInt(cur["parentId"])
			if pid == 0 || ancestors[pid] {
				break
			}
			ancestors[pid] = true
			cur = byID[pid]
		}
	}
	return ancestors
}

// DeptIdsInOrgScope returns the set of department IDs in a subtree rooted at rootDeptID.
func DeptIdsInOrgScope(rootDeptID int, departments []interface{}) map[int]bool {
	if rootDeptID == 0 {
		return nil
	}
	found := false
	byParent := make(map[int][]map[string]interface{})
	for _, d := range departments {
		dm, ok := d.(map[string]interface{})
		if !ok {
			continue
		}
		did := toInt(dm["id"])
		if did == rootDeptID {
			found = true
		}
		pid := toInt(dm["parentId"])
		byParent[pid] = append(byParent[pid], dm)
	}
	if !found {
		return map[int]bool{}
	}

	out := make(map[int]bool)
	var walk func(int)
	walk = func(id int) {
		out[id] = true
		for _, child := range byParent[id] {
			walk(toInt(child["id"]))
		}
	}
	walk(rootDeptID)
	return out
}

// ShapeWorkspaceForReader applies access-control scoping to workspace data.
func ShapeWorkspaceForReader(raw map[string]interface{}, role string, superAdmin bool, employeeID *int, scopeRootDeptID int) map[string]interface{} {
	isHRBP := superAdmin || role == "hrbp" || role == "super_admin"

	if isHRBP {
		stripped := StripUserPasswords(raw)
		if scopeRootDeptID > 0 {
			return filterByDeptSubtree(stripped, scopeRootDeptID)
		}
		return stripped
	}

	if role == "manager" && employeeID != nil {
		return filterForManager(raw, *employeeID)
	}

	return StripUserPasswords(raw)
}

func filterByDeptSubtree(data map[string]interface{}, rootDeptID int) map[string]interface{} {
	departments := toSlice(data["departments"])
	sub := DeptIdsInOrgScope(rootDeptID, departments)
	if sub == nil || len(sub) == 0 {
		return data
	}

	employees := filterSliceByInt(toSlice(data["employees"]), "departmentId", sub)
	visEmp := collectIDs(employees)
	empIn := func(v interface{}) bool { return visEmp[toInt(v)] }

	out := copyMap(data)
	out["employees"] = employees
	out["departments"] = filterSliceByInt(departments, "id", sub)
	out["positions"] = filterSliceByInt(toSlice(data["positions"]), "departmentId", sub)
	out["leaveRequests"] = filterSliceByEmpField(toSlice(data["leaveRequests"]), "employeeId", empIn)
	out["performanceReviews"] = filterSliceByEmpField(toSlice(data["performanceReviews"]), "employeeId", empIn)
	out["employeeTrainings"] = filterSliceByEmpField(toSlice(data["employeeTrainings"]), "employeeId", empIn)
	out["attendanceRecords"] = filterSliceByEmpField(toSlice(data["attendanceRecords"]), "employeeId", empIn)
	out["punchRecords"] = filterSliceByEmpField(toSlice(data["punchRecords"]), "employeeId", empIn)
	out["notifications"] = filterSliceByEmpField(toSlice(data["notifications"]), "employeeId", empIn)
	out["talentMatrix"] = filterSliceByEmpField(toSlice(data["talentMatrix"]), "employeeId", empIn)
	return out
}

func filterForManager(data map[string]interface{}, empID int) map[string]interface{} {
	employees := toSlice(data["employees"])
	departments := toSlice(data["departments"])
	visEmp := VisibleEmployeeIds(empID, employees)
	visDept := VisibleDepartmentIds(visEmp, employees, departments)

	empIn := func(v interface{}) bool { return visEmp[toInt(v)] }

	out := copyMap(data)
	out["employees"] = filterSlice(employees, func(e map[string]interface{}) bool { return visEmp[toInt(e["id"])] })
	out["departments"] = filterSlice(toSlice(data["departments"]), func(d map[string]interface{}) bool { return visDept[toInt(d["id"])] })
	out["positions"] = filterSlice(toSlice(data["positions"]), func(p map[string]interface{}) bool { return visDept[toInt(p["departmentId"])] })
	out["leaveRequests"] = filterSliceByEmpField(toSlice(data["leaveRequests"]), "employeeId", empIn)
	out["performanceReviews"] = filterSlice(toSlice(data["performanceReviews"]), func(r map[string]interface{}) bool {
		return empIn(r["employeeId"]) || toInt(r["reviewerId"]) == empID
	})
	out["employeeTrainings"] = filterSliceByEmpField(toSlice(data["employeeTrainings"]), "employeeId", empIn)
	out["attendanceRecords"] = filterSliceByEmpField(toSlice(data["attendanceRecords"]), "employeeId", empIn)
	out["punchRecords"] = filterSliceByEmpField(toSlice(data["punchRecords"]), "employeeId", empIn)
	out["notifications"] = filterSliceByEmpField(toSlice(data["notifications"]), "employeeId", empIn)
	out["talentMatrix"] = filterSliceByEmpField(toSlice(data["talentMatrix"]), "employeeId", empIn)
	out["recruitmentCandidates"] = []interface{}{}
	out["orgChangeRequests"] = []interface{}{}
	out = StripUserPasswords(out)
	return out
}

// ─── Helpers ─────────────────────────────────────────────

func copyMap(m map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func toInt(v interface{}) int {
	switch n := v.(type) {
	case int:
		return n
	case float64:
		return int(n)
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	case string:
		i, _ := strconv.Atoi(n)
		return i
	}
	return 0
}

func toSlice(v interface{}) []interface{} {
	if arr, ok := v.([]interface{}); ok {
		return arr
	}
	return nil
}

func collectIDs(items []interface{}) map[int]bool {
	m := make(map[int]bool)
	for _, item := range items {
		if mp, ok := item.(map[string]interface{}); ok {
			id := toInt(mp["id"])
			if id != 0 {
				m[id] = true
			}
		}
	}
	return m
}

func filterSlice(items []interface{}, pred func(map[string]interface{}) bool) []interface{} {
	var out []interface{}
	for _, item := range items {
		if mp, ok := item.(map[string]interface{}); ok && pred(mp) {
			out = append(out, item)
		}
	}
	if out == nil {
		return []interface{}{}
	}
	return out
}

func filterSliceByInt(items []interface{}, field string, allowed map[int]bool) []interface{} {
	return filterSlice(items, func(m map[string]interface{}) bool {
		return allowed[toInt(m[field])]
	})
}

func filterSliceByEmpField(items []interface{}, field string, empIn func(interface{}) bool) []interface{} {
	return filterSlice(items, func(m map[string]interface{}) bool {
		return empIn(m[field])
	})
}

// ─── Patch Operations ─────────────────────────────────────

type IDCollection struct {
	Key   string
	IDKey string
}

var IDCollections = []IDCollection{
	{"employees", "id"}, {"departments", "id"}, {"positions", "id"},
	{"leaveRequests", "id"}, {"performanceReviews", "id"}, {"trainings", "id"},
	{"employeeTrainings", "id"}, {"attendanceRecords", "id"}, {"punchRecords", "id"},
	{"kpiLibrary", "id"}, {"performanceCycles", "id"}, {"talentMatrix", "employeeId"},
	{"successionPlans", "id"}, {"notifications", "id"}, {"recruitmentCandidates", "id"},
	{"orgChangeRequests", "id"},
}

func ApplyPatch(workspace, patch map[string]interface{}) map[string]interface{} {
	next := copyMap(workspace)

	if v, ok := patch["hrScopeRootDepartmentId"]; ok {
		next["hrScopeRootDepartmentId"] = v
	}

	for _, col := range IDCollections {
		if spec, ok := patch[col.Key]; ok {
			specMap, isMap := spec.(map[string]interface{})
			if isMap {
				next[col.Key] = applyIDCollectionPatch(toSlice(next[col.Key]), specMap, col.IDKey)
			}
		}
	}

	scalarReplace := []string{"attendanceRules", "orgSettings", "rosterColumnSettings",
		"positionRecruitTags", "recruitmentPositionMetrics"}
	for _, k := range scalarReplace {
		if v, ok := patch[k]; ok {
			next[k] = v
		}
	}

	if spec, ok := patch["users"]; ok {
		if specMap, isMap := spec.(map[string]interface{}); isMap {
			next["users"] = applyIDCollectionPatch(toSlice(next["users"]), specMap, "id")
		}
	}

	return next
}

func applyIDCollectionPatch(arr []interface{}, spec map[string]interface{}, idKey string) []interface{} {
	m := make(map[int]interface{})
	var order []int
	for _, item := range arr {
		if mp, ok := item.(map[string]interface{}); ok {
			id := toInt(mp[idKey])
			if _, exists := m[id]; !exists {
				order = append(order, id)
			}
			m[id] = copyMap(mp)
		}
	}

	if removeIDs, ok := spec["removeIds"].([]interface{}); ok {
		for _, rid := range removeIDs {
			id := toInt(rid)
			delete(m, id)
		}
	}

	if upsert, ok := spec["upsert"].([]interface{}); ok {
		for _, item := range upsert {
			if mp, ok := item.(map[string]interface{}); ok {
				id := toInt(mp[idKey])
				if id != 0 {
					if _, exists := m[id]; !exists {
						order = append(order, id)
					}
					m[id] = copyMap(mp)
				}
			}
		}
	}

	var result []interface{}
	for _, id := range order {
		if v, exists := m[id]; exists {
			result = append(result, v)
		}
	}
	if result == nil {
		return []interface{}{}
	}
	return result
}

// ValidateManagerPatch checks that a manager only modifies data within their scope.
func ValidateManagerPatch(patch map[string]interface{}, employeeID int, workspace map[string]interface{}) error {
	employees := toSlice(workspace["employees"])
	vis := VisibleEmployeeIds(employeeID, employees)

	allowed := map[string]bool{
		"hrScopeRootDepartmentId": true, "employees": true, "leaveRequests": true,
		"performanceReviews": true, "employeeTrainings": true, "attendanceRecords": true,
		"punchRecords": true, "notifications": true, "talentMatrix": true, "successionPlans": true,
	}

	for k := range patch {
		if !allowed[k] {
			return &PatchError{Message: "经理无权修改字段：" + k}
		}
	}

	if empPatch, ok := patch["employees"].(map[string]interface{}); ok {
		if upsert, ok := empPatch["upsert"].([]interface{}); ok {
			for _, item := range upsert {
				if mp, ok := item.(map[string]interface{}); ok {
					if !vis[toInt(mp["id"])] {
						return &PatchError{Message: "经理仅能修改下属员工数据"}
					}
				}
			}
		}
	}

	return nil
}

type PatchError struct {
	Message string
}

func (e *PatchError) Error() string {
	return e.Message
}

// ValidateAndApplyPatch validates and applies a patch based on user role.
func ValidateAndApplyPatch(workspace, patch map[string]interface{}, role string, superAdmin bool, employeeID *int) (map[string]interface{}, error) {
	isHRBP := superAdmin || role == "hrbp" || role == "super_admin"
	if isHRBP {
		return ApplyPatch(workspace, patch), nil
	}
	if role == "manager" && employeeID != nil {
		if err := ValidateManagerPatch(patch, *employeeID, workspace); err != nil {
			return nil, err
		}
		return ApplyPatch(workspace, patch), nil
	}
	return nil, &PatchError{Message: "无权修改工作区"}
}

// HasFullWorkspaceAccess checks if a user has full write access.
func HasFullWorkspaceAccess(role string, superAdmin bool) bool {
	return superAdmin || role == "hrbp" || role == "super_admin"
}

// ParseScopeRootDeptID parses and validates a scope root department ID query param.
func ParseScopeRootDeptID(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return 0
	}
	return n
}
