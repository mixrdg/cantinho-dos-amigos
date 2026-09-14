import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(__dirname));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Salas privadas ficam em memória. O código é único enquanto o servidor estiver ativo.
const rooms = new Map();
const PRIVATE_CODE_LENGTH = 10;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function cleanRoom(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
}
function cleanName(value) {
  return String(value || "Convidado").replace(/[<>]/g, "").trim().slice(0, 30) || "Convidado";
}
function send(ws, data) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(data)); } catch (error) { console.error("Erro ao enviar:", error.message); }
  }
}
function broadcast(room, data, except = null) {
  if (!room) return;
  for (const participant of room.values()) if (participant.ws !== except) send(participant.ws, data);
}
function getUsers(room) {
  if (!room) return [];
  return [...room.values()].map(p => ({ id: p.id, name: p.name }));
}
function generatePrivateCode() {
  let code = "";
  do {
    code = "";
    for (let i = 0; i < PRIVATE_CODE_LENGTH; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  } while (rooms.has(code));
  return code;
}

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/health", (req, res) => res.json({ ok: true, name: "Cantinho dos Amigos", status: "online", rooms: rooms.size, time: new Date().toISOString() }));
app.get("/api/status", (req, res) => {
  let users = 0;
  for (const room of rooms.values()) users += room.size;
  res.json({ name: "Cantinho dos Amigos", status: "online", rooms: rooms.size, users });
});

// Cria uma sala privada com código criptograficamente aleatório.
app.post("/api/rooms/create", (req, res) => {
  const code = generatePrivateCode();
  rooms.set(code, new Map());
  res.status(201).json({ ok: true, room: code, private: true });
});

wss.on("connection", ws => {
  const me = { id: crypto.randomUUID(), name: "Convidado", room: null, ws };
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", raw => {
    let message;
    try { message = JSON.parse(raw.toString()); }
    catch { return send(ws, { type: "error", message: "Mensagem inválida." }); }

    if (message.type === "join") {
      const roomCode = cleanRoom(message.room);
      const userName = cleanName(message.name);
      if (roomCode.length < 3) return send(ws, { type: "error", message: "Código da sala inválido." });
      if (me.room) return send(ws, { type: "error", message: "Você já está em uma sala." });

      // Sala criada pelo endpoint é privada; salas manuais continuam permitidas.
      if (!rooms.has(roomCode)) rooms.set(roomCode, new Map());
      const room = rooms.get(roomCode);
      const existingUsers = getUsers(room);
      me.room = roomCode; me.name = userName;
      room.set(me.id, me);

      send(ws, { type: "welcome", id: me.id, room: roomCode, name: me.name, count: room.size, peers: existingUsers });
      broadcast(room, { type: "peer-joined", id: me.id, name: me.name, count: room.size }, ws);
      return;
    }

    if (!me.room) return send(ws, { type: "error", message: "Você ainda não entrou em uma sala." });
    const room = rooms.get(me.room);
    if (!room) return send(ws, { type: "error", message: "Sala não encontrada." });

    if (message.type === "chat") {
      const text = String(message.text || "").trim().slice(0, 500);
      if (text) broadcast(room, { type: "chat", id: me.id, name: me.name, text, time: new Date().toISOString() });
      return;
    }

    if (["offer", "answer", "ice", "renegotiate"].includes(message.type)) {
      const targetId = String(message.to || "");
      const target = room.get(targetId);
      if (!target) return;
      send(target.ws, { ...message, from: me.id });
      return;
    }

    if (message.type === "sync") {
      const allowed = ["play", "pause", "seek", "load"];
      const action = String(message.action || "");
      if (!allowed.includes(action)) return;
      broadcast(room, { type: "sync", action, currentTime: Number(message.currentTime || 0), videoId: message.videoId ? String(message.videoId).slice(0, 200) : null, from: me.id, name: me.name, time: new Date().toISOString() }, ws);
      return;
    }
    if (message.type === "ping") send(ws, { type: "pong", time: new Date().toISOString() });
  });

  ws.on("close", () => {
    if (!me.room) return;
    const room = rooms.get(me.room);
    if (!room) return;
    room.delete(me.id);
    broadcast(room, { type: "peer-left", id: me.id, name: me.name, count: room.size });
    if (room.size === 0) rooms.delete(me.room);
  });
  ws.on("error", error => console.error("WebSocket:", error.message));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);

function shutdown() {
  clearInterval(heartbeat);
  for (const ws of wss.clients) try { ws.close(); } catch {}
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const port = Number(process.env.PORT || 10000);
server.listen(port, "0.0.0.0", () => console.log(`Cantinho dos Amigos online em http://localhost:${port}`));
