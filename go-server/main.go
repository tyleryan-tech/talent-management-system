package main

import (
	"bufio"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"talent-hub/internal/config"
	"talent-hub/internal/db"
	"talent-hub/internal/router"
	"talent-hub/internal/ws"
)

func loadDotEnv() {
	f, err := os.Open(".env")
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}

func main() {
	loadDotEnv()
	cfg := config.Load()
	database := db.Open(cfg.DBPath)
	defer database.Close()

	db.InitSchema(database)
	db.BootSeed(database)

	hub := ws.NewHub(database, cfg.JWTSecret)
	go hub.Run()

	r := router.New(database, cfg, hub)

	srv := &http.Server{
		Addr:    ":" + strconv.Itoa(cfg.Port),
		Handler: r,
	}

	log.Printf("Talent Hub Go API listening on http://localhost:%d", cfg.Port)
	log.Printf("  REST:  http://localhost:%d/api", cfg.Port)
	log.Printf("  WS:    ws://localhost:%d/ws?token=<JWT>", cfg.Port)

	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("Server failed: %v", err)
		os.Exit(1)
	}
}
