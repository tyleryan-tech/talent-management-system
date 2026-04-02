require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const express = require('express');
const cors = require('cors');
const {
  openDatabase, initSchema, bootSeed,
} = require('./db');
const { createRouter } = require('./routes');
const { attachWebSocket } = require('./wsHub');

const PORT = Number(process.env.PORT) || 3000;
const corsOrigin = process.env.CORS_ORIGIN || '*';

const db = openDatabase();
initSchema(db);
bootSeed(db);

const app = express();
app.use(cors({
  origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

const httpServer = http.createServer(app);

const { broadcastLine } = attachWebSocket(httpServer, db);

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'talent-hub-server' });
});

app.use('/api', createRouter(db, broadcastLine));

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Talent Hub API + WebSocket listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`  REST:  http://localhost:${PORT}/api`);
  // eslint-disable-next-line no-console
  console.log(`  WS:    ws://localhost:${PORT}/ws?token=<JWT>`);
});
