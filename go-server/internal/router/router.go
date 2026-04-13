package router

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"talent-hub/internal/auth"
	"talent-hub/internal/config"
	dbpkg "talent-hub/internal/db"
	"talent-hub/internal/middleware"
	"talent-hub/internal/workspace"
	"talent-hub/internal/ws"
)

func New(database *sql.DB, cfg *config.Config, hub *ws.Hub) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.CORS(cfg))

	// Health check at root
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true, "service": "talent-hub-server"})
	})

	// WebSocket endpoint
	r.GET("/ws", func(c *gin.Context) {
		hub.HandleConnection(c.Writer, c.Request)
	})

	api := r.Group("/api")
	api.Use(middleware.APIRateLimit())

	// Health check under /api too
	api.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true, "service": "talent-hub-server"})
	})

	// Auth routes
	api.POST("/auth/login", middleware.LoginRateLimit(), loginHandler(database, cfg.JWTSecret))
	api.GET("/auth/me", middleware.AuthMiddleware(database, cfg.JWTSecret), meHandler())

	// Product lines
	authMW := middleware.AuthMiddleware(database, cfg.JWTSecret)
	api.GET("/product-lines", authMW, listProductLinesHandler(database))
	api.POST("/product-lines", authMW, middleware.RequireHRBP(), createProductLineHandler(database))
	api.DELETE("/product-lines/:id", authMW, middleware.RequireHRBP(), deleteProductLineHandler(database))

	// Workspace
	api.GET("/workspace/:lineId", authMW, getWorkspaceHandler(database))
	api.POST("/workspace/:lineId/patch", authMW, patchWorkspaceHandler(database, hub))
	api.PUT("/workspace/:lineId", authMW, middleware.RequireFullWorkspaceWriter(), putWorkspaceHandler(database, hub))

	return r
}

// ─── Handlers ────────────────────────────────────────────

func loginHandler(database *sql.DB, jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Identifier string `json:"identifier"`
			Email      string `json:"email"`
			Username   string `json:"username"`
			Password   string `json:"password"`
		}
		c.BindJSON(&body)

		id := body.Identifier
		if id == "" {
			id = body.Email
		}
		if id == "" {
			id = body.Username
		}

		result := auth.Authenticate(database, id, body.Password, jwtSecret)
		if !result.OK {
			c.JSON(http.StatusUnauthorized, gin.H{"error": result.Message, "code": "LOGIN_FAILED"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"token": result.Token, "user": result.User})
	}
}

func meHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetAuthUser(c)
		c.JSON(http.StatusOK, gin.H{"user": user})
	}
}

func listProductLinesHandler(database *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		lines, err := dbpkg.ListProductLines(database)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "查询产品线失败"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"lines": lines})
	}
}

func createProductLineHandler(database *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Name string `json:"name"`
		}
		c.BindJSON(&body)
		name := body.Name
		if name == "" {
			name = "New product line"
		}

		line, err := dbpkg.CreateProductLine(database, name)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "创建产品线失败"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"line": line})
	}
}

func deleteProductLineHandler(database *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		reason, err := dbpkg.DeleteProductLine(database, id)
		if err != nil {
			status := http.StatusNotFound
			if reason == "last_line" {
				status = http.StatusBadRequest
			}
			c.JSON(status, gin.H{"error": err.Error(), "code": reason})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func getWorkspaceHandler(database *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		lineID, _ := strconv.Atoi(c.Param("lineId"))
		if lineID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的产品线 ID"})
			return
		}

		row, err := dbpkg.GetWorkspace(database, lineID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取数据失败"})
			return
		}
		if row == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "该产品线暂无数据", "code": "NOT_FOUND"})
			return
		}

		var data map[string]interface{}
		decoder := json.NewDecoder(strings.NewReader(row.JSON))
		decoder.UseNumber()
		if err := decoder.Decode(&data); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "数据损坏"})
			return
		}

		user := middleware.GetAuthUser(c)
		scopeRoot := workspace.ParseScopeRootDeptID(c.Query("scopeRootDepartmentId"))

		var empID *int
		if user.EmployeeID != nil {
			empID = user.EmployeeID
		}

		shaped := workspace.ShapeWorkspaceForReader(data, user.Role, user.SuperAdmin, empID, scopeRoot)

		c.JSON(http.StatusOK, gin.H{
			"lineId":    row.LineID,
			"version":   row.Version,
			"updatedAt": row.UpdatedAt,
			"data":      shaped,
		})
	}
}

func patchWorkspaceHandler(database *sql.DB, hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		lineID, _ := strconv.Atoi(c.Param("lineId"))
		if lineID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的产品线 ID"})
			return
		}

		var body struct {
			ClientVersion json.Number            `json:"clientVersion"`
			Patch         map[string]interface{} `json:"patch"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "需要 clientVersion 与 patch 对象"})
			return
		}

		clientVersion, _ := body.ClientVersion.Int64()

		row, err := dbpkg.GetWorkspace(database, lineID)
		if err != nil || row == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "该产品线暂无数据", "code": "NOT_FOUND"})
			return
		}

		var wsData map[string]interface{}
		decoder := json.NewDecoder(strings.NewReader(row.JSON))
		decoder.UseNumber()
		if err := decoder.Decode(&wsData); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "数据损坏"})
			return
		}

		user := middleware.GetAuthUser(c)
		merged, err := workspace.ValidateAndApplyPatch(wsData, body.Patch, user.Role, user.SuperAdmin, user.EmployeeID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "PATCH_REJECTED"})
			return
		}

		jsonStr, err := json.Marshal(merged)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "合并后数据无法序列化"})
			return
		}

		newVersion, reason, err := dbpkg.UpdateWorkspaceIfVersion(database, lineID, int(clientVersion), string(jsonStr))
		if err != nil {
			if reason == "version_mismatch" {
				c.JSON(http.StatusConflict, gin.H{
					"error":          "数据已被他人更新，请刷新后重试",
					"code":           "VERSION_CONFLICT",
					"currentVersion": newVersion,
				})
				return
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "产品线不存在", "code": "NOT_FOUND"})
			return
		}

		hub.BroadcastLine(lineID, newVersion)
		c.JSON(http.StatusOK, gin.H{"ok": true, "version": newVersion})
	}
}

func putWorkspaceHandler(database *sql.DB, hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		lineID, _ := strconv.Atoi(c.Param("lineId"))
		if lineID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的产品线 ID"})
			return
		}

		var body struct {
			ClientVersion json.Number            `json:"clientVersion"`
			Data          map[string]interface{} `json:"data"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "需要 clientVersion 与 data"})
			return
		}

		clientVersion, _ := body.ClientVersion.Int64()

		jsonStr, err := json.Marshal(body.Data)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data 无法序列化"})
			return
		}

		newVersion, reason, err := dbpkg.UpdateWorkspaceIfVersion(database, lineID, int(clientVersion), string(jsonStr))
		if err != nil {
			if reason == "version_mismatch" {
				c.JSON(http.StatusConflict, gin.H{
					"error":          "数据已被他人更新，请刷新后重试",
					"code":           "VERSION_CONFLICT",
					"currentVersion": newVersion,
				})
				return
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "产品线不存在", "code": "NOT_FOUND"})
			return
		}

		hub.BroadcastLine(lineID, newVersion)
		c.JSON(http.StatusOK, gin.H{"ok": true, "version": newVersion})
	}
}

