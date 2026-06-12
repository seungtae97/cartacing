import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  TICK_RATE,
  addHumanPlayer,
  applyPlayerInput,
  buildSnapshot,
  createInitialState,
  removeHumanPlayer,
  updateGame
} from "./game.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT || 3000);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

let state = createInitialState();
let lastTick = Date.now();

app.use(express.static(publicDir));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    players: state.cars.filter((car) => car.kind === "human").length
  });
});

io.on("connection", (socket) => {
  socket.emit("serverInfo", {
    socketId: socket.id,
    tickRate: TICK_RATE
  });
  socket.emit("snapshot", buildSnapshot(state));

  socket.on("join", (payload = {}) => {
    const result = addHumanPlayer(state, socket.id, payload.nickname);
    if (!result.ok) {
      socket.emit("joinError", { message: result.error });
      return;
    }

    socket.emit("joined", {
      carId: result.car.id,
      socketId: socket.id
    });
    io.emit("snapshot", buildSnapshot(state));
  });

  socket.on("input", (input) => {
    applyPlayerInput(state, socket.id, input);
  });

  socket.on("resetRace", () => {
    const humans = state.cars
      .filter((car) => car.kind === "human")
      .map((car) => ({
        socketId: car.socketId,
        name: car.name
      }));

    state = createInitialState();
    for (const human of humans) {
      addHumanPlayer(state, human.socketId, human.name);
    }
    io.emit("snapshot", buildSnapshot(state));
  });

  socket.on("disconnect", () => {
    removeHumanPlayer(state, socket.id);
    io.emit("snapshot", buildSnapshot(state));
  });
});

setInterval(() => {
  const now = Date.now();
  const dtMs = now - lastTick;
  lastTick = now;
  updateGame(state, dtMs);
  io.emit("snapshot", buildSnapshot(state));
}, 1000 / TICK_RATE);

httpServer.listen(port, () => {
  console.log(`Cartacing server running at http://localhost:${port}`);
});
