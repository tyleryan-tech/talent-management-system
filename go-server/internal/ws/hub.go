package ws

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"talent-hub/internal/auth"
	"talent-hub/internal/db"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type clientMeta struct {
	UserID int
	LineID int
}

type Hub struct {
	mu        sync.RWMutex
	clients   map[*websocket.Conn]*clientMeta
	database  *sql.DB
	jwtSecret string
}

func NewHub(database *sql.DB, jwtSecret string) *Hub {
	return &Hub{
		clients:   make(map[*websocket.Conn]*clientMeta),
		database:  database,
		jwtSecret: jwtSecret,
	}
}

func (h *Hub) Run() {
	// Periodic cleanup of dead connections
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		h.mu.Lock()
		for conn := range h.clients {
			if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second)); err != nil {
				conn.Close()
				delete(h.clients, conn)
			}
		}
		h.mu.Unlock()
	}
}

func (h *Hub) HandleConnection(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ws] Upgrade error: %v", err)
		return
	}

	meta := &clientMeta{}
	h.mu.Lock()
	h.clients[conn] = meta
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		delete(h.clients, conn)
		h.mu.Unlock()
		conn.Close()
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg map[string]interface{}
		if json.Unmarshal(raw, &msg) != nil {
			continue
		}
		h.handleMessage(conn, meta, msg)
	}
}

func (h *Hub) handleMessage(conn *websocket.Conn, meta *clientMeta, msg map[string]interface{}) {
	msgType, _ := msg["type"].(string)

	switch msgType {
	case "auth":
		tokenStr, _ := msg["token"].(string)
		claims, err := auth.ParseToken(tokenStr, h.jwtSecret)
		if err != nil {
			conn.WriteJSON(map[string]string{"type": "auth_error"})
			return
		}
		sub, _ := claims["sub"].(float64)
		user, _ := db.FindLoginUserByID(h.database, int(sub))
		if user != nil {
			meta.UserID = user.ID
			conn.WriteJSON(map[string]string{"type": "auth_ok"})
		} else {
			conn.WriteJSON(map[string]string{"type": "auth_error"})
		}

	case "subscribe":
		if meta.UserID == 0 {
			conn.WriteJSON(map[string]interface{}{"type": "error", "message": "auth required"})
			return
		}
		lineID, _ := msg["lineId"].(float64)
		meta.LineID = int(lineID)
		conn.WriteJSON(map[string]interface{}{"type": "subscribed", "lineId": int(lineID)})
	}
}

func (h *Hub) BroadcastLine(lineID, version int) {
	payload, _ := json.Marshal(map[string]interface{}{
		"type":    "workspace_updated",
		"lineId":  lineID,
		"version": version,
		"at":      time.Now().Format(time.RFC3339),
	})

	h.mu.RLock()
	defer h.mu.RUnlock()
	for conn, meta := range h.clients {
		if meta.LineID == lineID {
			conn.WriteMessage(websocket.TextMessage, payload)
		}
	}
}
