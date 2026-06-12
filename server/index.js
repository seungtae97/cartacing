import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  CIRCUITS,
  TICK_RATE,
  addHumanPlayer,
  applyPlayerInput,
  buildSnapshot,
  createInitialState,
  kickPlayer,
  listCircuitSummaries,
  removeHumanPlayer,
  setPlayerReady,
  startRace,
  updateGame
} from "./game.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

const rooms = new Map();
let nextRoomNumber = 1;
let lastTick = Date.now();

app.use(express.static(publicDir));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    rooms: rooms.size,
    players: [...rooms.values()].reduce((sum, room) => sum + room.cars.length, 0)
  });
});

io.on("connection", (socket) => {
  socket.emit("serverInfo", {
    socketId: socket.id,
    tickRate: TICK_RATE,
    circuits: listCircuitSummaries()
  });
  socket.emit("roomList", buildRoomList());

  socket.on("listRooms", () => {
    socket.emit("roomList", buildRoomList());
  });

  socket.on("createRoom", (payload = {}) => {
    leaveCurrentRoom(socket);
    const roomId = createRoomId();
    const state = createInitialState({
      roomId,
      roomName: payload.roomName,
      circuitId: payload.circuitId || CIRCUITS[0].id
    });
    rooms.set(roomId, state);
    joinStateRoom(socket, state, payload.nickname);
    broadcastRoomList();
  });

  socket.on("joinRoom", (payload = {}) => {
    const state = rooms.get(payload.roomId);
    if (!state) {
      socket.emit("roomError", { message: "방을 찾을 수 없습니다." });
      return;
    }
    leaveCurrentRoom(socket);
    joinStateRoom(socket, state, payload.nickname);
    broadcastRoomList();
  });

  socket.on("leaveRoom", () => {
    leaveCurrentRoom(socket);
    broadcastRoomList();
  });

  socket.on("setReady", (payload = {}) => {
    const state = getSocketRoom(socket);
    if (!state) return;
    const result = setPlayerReady(state, socket.id, payload.ready);
    if (!result.ok) {
      socket.emit("roomError", { message: result.error });
      return;
    }
    broadcastRoom(state);
    broadcastRoomList();
  });

  socket.on("startRace", () => {
    const state = getSocketRoom(socket);
    if (!state) return;
    const result = startRace(state, socket.id);
    if (!result.ok) {
      socket.emit("roomError", { message: result.error });
      return;
    }
    broadcastRoom(state);
    broadcastRoomList();
  });

  socket.on("kickPlayer", (payload = {}) => {
    const state = getSocketRoom(socket);
    if (!state) return;
    const result = kickPlayer(state, socket.id, payload.socketId);
    if (!result.ok) {
      socket.emit("roomError", { message: result.error });
      return;
    }
    const targetSocket = io.sockets.sockets.get(payload.socketId);
    if (targetSocket) {
      targetSocket.leave(state.room.id);
      targetSocket.data.roomId = null;
      targetSocket.emit("kicked", { message: "방장에 의해 강퇴되었습니다." });
      targetSocket.emit("roomList", buildRoomList());
    }
    broadcastRoom(state);
    broadcastRoomList();
  });

  socket.on("input", (input) => {
    const state = getSocketRoom(socket);
    if (!state) return;
    applyPlayerInput(state, socket.id, input);
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
    broadcastRoomList();
  });
});

setInterval(() => {
  const now = Date.now();
  const dtMs = now - lastTick;
  lastTick = now;

  for (const state of rooms.values()) {
    updateGame(state, dtMs);
    if (state.cars.length > 0) {
      broadcastRoom(state);
    }
  }
}, 1000 / TICK_RATE);

httpServer.listen(port, host, () => {
  console.log(`Cartacing 서버 실행 중: http://${host}:${port}`);
});

function joinStateRoom(socket, state, nickname) {
  const result = addHumanPlayer(state, socket.id, nickname);
  if (!result.ok) {
    socket.emit("roomError", { message: result.error });
    return;
  }

  socket.data.roomId = state.room.id;
  socket.join(state.room.id);
  socket.emit("joined", {
    carId: result.car.id,
    socketId: socket.id,
    roomId: state.room.id
  });
  broadcastRoom(state);
}

function leaveCurrentRoom(socket) {
  const state = getSocketRoom(socket);
  if (!state) {
    return;
  }

  removeHumanPlayer(state, socket.id);
  socket.leave(state.room.id);
  socket.data.roomId = null;

  if (state.cars.length === 0) {
    rooms.delete(state.room.id);
    return;
  }

  broadcastRoom(state);
}

function getSocketRoom(socket) {
  if (!socket.data.roomId) {
    return null;
  }
  return rooms.get(socket.data.roomId) || null;
}

function broadcastRoom(state) {
  io.to(state.room.id).emit("snapshot", buildSnapshot(state));
}

function broadcastRoomList() {
  io.emit("roomList", buildRoomList());
}

function buildRoomList() {
  return [...rooms.values()].map((state) => ({
    id: state.room.id,
    name: state.room.name,
    circuitId: state.circuit.id,
    circuitName: state.circuit.name,
    status: state.race.status,
    players: state.cars.length,
    maxPlayers: 12,
    readyPlayers: state.cars.filter((car) => car.ready).length,
    hostName: state.cars.find((car) => car.isHost)?.name || "없음"
  }));
}

function createRoomId() {
  const id = `room-${String(nextRoomNumber).padStart(3, "0")}`;
  nextRoomNumber += 1;
  return id;
}
