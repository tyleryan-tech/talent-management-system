package middleware

import (
	"database/sql"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"talent-hub/internal/auth"
	"talent-hub/internal/config"
	"talent-hub/internal/db"
)

func CORS(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		allowed := false
		if len(cfg.CORSOrigins) == 0 || origin == "" {
			allowed = true
		} else {
			for _, o := range cfg.CORSOrigins {
				if o == origin {
					allowed = true
					break
				}
			}
		}
		if allowed {
			c.Header("Access-Control-Allow-Origin", origin)
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func AuthMiddleware(database *sql.DB, jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(strings.ToLower(header), "bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录", "code": "UNAUTHORIZED"})
			return
		}
		tokenStr := strings.TrimSpace(header[7:])
		claims, err := auth.ParseToken(tokenStr, jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "登录已失效", "code": "UNAUTHORIZED"})
			return
		}
		sub, _ := claims["sub"].(float64)
		user, _ := db.FindLoginUserByID(database, int(sub))
		if user == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "登录已失效", "code": "UNAUTHORIZED"})
			return
		}
		pub := auth.ToPublicUser(user)
		c.Set("authUser", pub)
		c.Next()
	}
}

func RequireHRBP() gin.HandlerFunc {
	return func(c *gin.Context) {
		u := GetAuthUser(c)
		if u == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录", "code": "UNAUTHORIZED"})
			return
		}
		if u.Role != "hrbp" && u.Role != "super_admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "需要 HRBP 权限", "code": "FORBIDDEN"})
			return
		}
		c.Next()
	}
}

func RequireFullWorkspaceWriter() gin.HandlerFunc {
	return func(c *gin.Context) {
		u := GetAuthUser(c)
		if auth.HasFullWorkspaceAccess(u) {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": "整表保存仅限 HRBP / 超级管理员；经理端请使用增量同步",
			"code":  "FULL_PUT_FORBIDDEN",
		})
	}
}

func GetAuthUser(c *gin.Context) *auth.PublicUser {
	val, exists := c.Get("authUser")
	if !exists {
		return nil
	}
	u, ok := val.(*auth.PublicUser)
	if !ok {
		return nil
	}
	return u
}

// ─── Rate Limiting ──────────────────────────────────────────────────

type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     int
	window   time.Duration
}

type visitor struct {
	tokens    float64
	lastCheck time.Time
}

func newRateLimiter(rate int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{
		visitors: make(map[string]*visitor),
		rate:     rate,
		window:   window,
	}
	go rl.cleanup()
	return rl
}

func (rl *rateLimiter) cleanup() {
	for {
		time.Sleep(5 * time.Minute)
		rl.mu.Lock()
		for k, v := range rl.visitors {
			if time.Since(v.lastCheck) > 10*time.Minute {
				delete(rl.visitors, k)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[key]
	now := time.Now()
	if !exists {
		rl.visitors[key] = &visitor{tokens: float64(rl.rate) - 1, lastCheck: now}
		return true
	}

	elapsed := now.Sub(v.lastCheck).Seconds()
	refillRate := float64(rl.rate) / rl.window.Seconds()
	v.tokens = math.Min(float64(rl.rate), v.tokens+elapsed*refillRate)
	v.lastCheck = now

	if v.tokens >= 1 {
		v.tokens--
		return true
	}
	return false
}

var (
	loginRL = newRateLimiter(10, time.Minute)
	apiRL   = newRateLimiter(200, time.Minute)
)

func LoginRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !loginRL.allow(ip) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "登录请求过于频繁，请 1 分钟后重试",
				"code":  "RATE_LIMIT",
			})
			return
		}
		c.Next()
	}
}

func APIRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !apiRL.allow(ip) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "请求过于频繁，请稍后重试",
				"code":  "RATE_LIMIT",
			})
			return
		}
		c.Next()
	}
}
