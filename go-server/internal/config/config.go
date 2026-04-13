package config

import (
	"log"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port         int
	DBPath       string
	JWTSecret    string
	CORSOrigins  []string
}

func Load() *Config {
	port := 3000
	if p := os.Getenv("PORT"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			port = v
		}
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "data/talent-hub.db"
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("[FATAL] 环境变量 JWT_SECRET 未设置。请在 .env 中配置一个安全的随机密钥。")
	}

	var origins []string
	if raw := os.Getenv("CORS_ORIGINS"); raw != "" {
		for _, s := range strings.Split(raw, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				origins = append(origins, s)
			}
		}
	}

	return &Config{
		Port:        port,
		DBPath:      dbPath,
		JWTSecret:   jwtSecret,
		CORSOrigins: origins,
	}
}
