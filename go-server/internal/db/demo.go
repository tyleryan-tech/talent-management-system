package db

import (
	"fmt"
	"math/rand"
	"time"
)

func BuildDemoWorkspace() map[string]interface{} {
	jobTrades := []string{"Frontend", "Mobile", "Backend", "SDET", "QA", "Algorithm", "Big Data"}
	jobLevels := []string{"E", "SE", "EE", "SEE", "AM", "M", "PE", "SM"}

	departments := []map[string]interface{}{
		{"id": 1, "name": "Engineering", "parentId": nil, "managerId": 1005},
		{"id": 2, "name": "Product", "parentId": nil, "managerId": 1011},
		{"id": 3, "name": "Marketing", "parentId": nil, "managerId": 1015},
		{"id": 4, "name": "Sales", "parentId": nil, "managerId": 1018},
		{"id": 5, "name": "HR", "parentId": nil, "managerId": 1001},
	}

	nextPosID := 101
	levelSeq := 0
	var positions []map[string]interface{}
	for _, d := range departments {
		for _, trade := range jobTrades {
			positions = append(positions, map[string]interface{}{
				"id":           nextPosID,
				"name":         trade,
				"level":        jobLevels[levelSeq%len(jobLevels)],
				"departmentId": d["id"],
			})
			nextPosID++
			levelSeq++
		}
	}

	firstNames := []string{"Wei", "Jing", "Lei", "Min", "Fang", "Yun", "Hao", "Xin", "Tao", "Wen", "Li", "Chen", "Hui", "Dan", "Na", "Bo", "Yu", "Kai", "Lan", "Peng"}
	lastNames := []string{"Zhang", "Li", "Wang", "Liu", "Chen", "Yang", "Zhao", "Huang", "Zhou", "Wu", "Xu", "Sun", "Ma", "Zhu", "Guo", "He", "Hu", "Gao", "Lin", "Luo"}

	rng := rand.New(rand.NewSource(42))
	var employees []map[string]interface{}
	empID := 1001
	for _, d := range departments {
		for i := 0; i < 4; i++ {
			fn := firstNames[rng.Intn(len(firstNames))]
			ln := lastNames[rng.Intn(len(lastNames))]
			pos := positions[rng.Intn(len(positions))]
			hireDate := time.Date(2020+rng.Intn(5), time.Month(1+rng.Intn(12)), 1+rng.Intn(28), 0, 0, 0, 0, time.UTC)
			employees = append(employees, map[string]interface{}{
				"id":           empID,
				"name":         fmt.Sprintf("%s %s", fn, ln),
				"staffId":      fmt.Sprintf("EMP%04d", empID),
				"email":        fmt.Sprintf("%s.%s@company.com", fn, ln),
				"departmentId": d["id"],
				"positionId":   pos["id"],
				"managerId":    d["managerId"],
				"title":        pos["name"],
				"rank":         pos["level"],
				"hireDate":     hireDate.Format("2006-01-02"),
				"status":       "active",
			})
			empID++
		}
	}

	users := []map[string]interface{}{
		{"id": 1, "username": "hrbp", "email": "hrbp@company.com", "password": "123", "role": "hrbp", "realName": "HRBP Admin", "employeeId": nil},
		{"id": 2, "username": "manager", "email": "manager@company.com", "password": "123", "role": "manager", "realName": "Reporting Manager", "employeeId": 1005},
		{"id": 3, "username": "superadmin", "email": "superadmin@company.com", "password": "123", "role": "hrbp", "superAdmin": true, "realName": "Super Admin", "employeeId": nil},
	}

	return map[string]interface{}{
		"hrScopeRootDepartmentId": nil,
		"employees":               employees,
		"departments":             departments,
		"positions":               positions,
		"leaveRequests":           []interface{}{},
		"performanceReviews":      []interface{}{},
		"trainings":               []interface{}{},
		"employeeTrainings":       []interface{}{},
		"users":                   users,
		"attendanceRules": map[string]interface{}{
			"workStart":           "09:30",
			"workEnd":             "18:30",
			"monthlyStandardDays": 20,
			"loadBandLow":        0.88,
			"loadBandHigh":       1.12,
		},
		"attendanceRecords":          []interface{}{},
		"punchRecords":               []interface{}{},
		"kpiLibrary":                 []interface{}{},
		"performanceCycles":          []interface{}{},
		"talentMatrix":               []interface{}{},
		"successionPlans":            []interface{}{},
		"notifications":              []interface{}{},
		"positionRecruitTags":        map[string]interface{}{},
		"recruitmentCandidates":      []interface{}{},
		"recruitmentPositionMetrics": map[string]interface{}{},
		"orgSettings":                map[string]interface{}{"productLineOwnerEmployeeId": nil},
		"orgChangeRequests":          []interface{}{},
		"rosterColumnSettings":       nil,
	}
}

func BuildEmptyWorkspace() map[string]interface{} {
	return map[string]interface{}{
		"hrScopeRootDepartmentId": nil,
		"employees":               []interface{}{},
		"departments":             []interface{}{},
		"positions":               []interface{}{},
		"leaveRequests":           []interface{}{},
		"performanceReviews":      []interface{}{},
		"trainings":               []interface{}{},
		"employeeTrainings":       []interface{}{},
		"users": []map[string]interface{}{
			{"id": 1, "username": "hrbp", "email": "hrbp@company.com", "password": "123", "role": "hrbp", "realName": "HRBP Admin", "employeeId": nil},
			{"id": 2, "username": "manager", "email": "manager@company.com", "password": "123", "role": "manager", "realName": "Reporting Manager", "employeeId": nil},
			{"id": 3, "username": "superadmin", "email": "superadmin@company.com", "password": "123", "role": "hrbp", "superAdmin": true, "realName": "Super Admin", "employeeId": nil},
		},
		"attendanceRules": map[string]interface{}{
			"workStart": "09:30", "workEnd": "18:30",
			"monthlyStandardDays": 20, "loadBandLow": 0.88, "loadBandHigh": 1.12,
		},
		"attendanceRecords":          []interface{}{},
		"punchRecords":               []interface{}{},
		"kpiLibrary":                 []interface{}{},
		"performanceCycles":          []interface{}{},
		"talentMatrix":               []interface{}{},
		"successionPlans":            []interface{}{},
		"notifications":              []interface{}{},
		"positionRecruitTags":        map[string]interface{}{},
		"recruitmentCandidates":      []interface{}{},
		"recruitmentPositionMetrics": map[string]interface{}{},
		"orgSettings":                map[string]interface{}{"productLineOwnerEmployeeId": nil},
		"orgChangeRequests":          []interface{}{},
		"rosterColumnSettings":       nil,
	}
}
