const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('./auth');

function attachWebSocket(httpServer, db) {
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  /** @type {Map<object, { userId?: number, lineId?: number }>} */
  const meta = new Map();

  wss.on('connection', (ws, req) => {
    meta.set(ws, {});
    const q = new URL(req.url || '', 'http://localhost').searchParams;
    const token = q.get('token');
    if (token) {
      try {
        const payload = jwt.verify(token, getJwtSecret());
        const row = db.prepare('SELECT id FROM login_users WHERE id = ?').get(payload.sub);
        if (row) meta.get(ws).userId = row.id;
      } catch {
        /* ignore */
      }
    }

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === 'auth' && msg.token) {
        try {
          const payload = jwt.verify(msg.token, getJwtSecret());
          const row = db.prepare('SELECT id FROM login_users WHERE id = ?').get(payload.sub);
          if (row) {
            meta.get(ws).userId = row.id;
            ws.send(JSON.stringify({ type: 'auth_ok' }));
          }
        } catch {
          ws.send(JSON.stringify({ type: 'auth_error' }));
        }
        return;
      }
      if (msg.type === 'subscribe' && msg.lineId != null) {
        if (!meta.get(ws).userId) {
          ws.send(JSON.stringify({ type: 'error', message: 'auth required' }));
          return;
        }
        const lid = Number(msg.lineId);
        if (!Number.isNaN(lid)) meta.get(ws).lineId = lid;
        ws.send(JSON.stringify({ type: 'subscribed', lineId: lid }));
      }
    });

    ws.on('close', () => meta.delete(ws));
  });

  function broadcastLine(lineId, version) {
    const lid = Number(lineId);
    const payload = JSON.stringify({
      type: 'workspace_updated',
      lineId: lid,
      version,
      at: new Date().toISOString(),
    });
    wss.clients.forEach((ws) => {
      if (ws.readyState !== 1) return;
      const m = meta.get(ws);
      if (m && m.lineId === lid) ws.send(payload);
    });
  }

  return { broadcastLine, wss };
}

module.exports = { attachWebSocket };
