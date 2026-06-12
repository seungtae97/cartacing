const socket = io();

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const menuPanel = document.querySelector("#menuPanel");
const roomPanel = document.querySelector("#roomPanel");
const nicknameInput = document.querySelector("#nickname");
const roomNameInput = document.querySelector("#roomName");
const circuitSelect = document.querySelector("#circuitSelect");
const createRoomButton = document.querySelector("#createRoomButton");
const refreshRoomsButton = document.querySelector("#refreshRoomsButton");
const roomListEl = document.querySelector("#roomList");
const connectionStatus = document.querySelector("#connectionStatus");
const roomTitleEl = document.querySelector("#roomTitle");
const roomMetaEl = document.querySelector("#roomMeta");
const participantListEl = document.querySelector("#participantList");
const readyButton = document.querySelector("#readyButton");
const startButton = document.querySelector("#startButton");
const leaveButton = document.querySelector("#leaveButton");
const positionEl = document.querySelector("#position");
const lapEl = document.querySelector("#lap");
const speedEl = document.querySelector("#speed");
const playersEl = document.querySelector("#players");
const leaderboardEl = document.querySelector("#leaderboard");
const countdownOverlay = document.querySelector("#countdownOverlay");
const resultsPanel = document.querySelector("#resultsPanel");
const resultsEl = document.querySelector("#results");
const backToLobbyButton = document.querySelector("#backToLobbyButton");

const keys = new Set();
let circuits = [];
let rooms = [];
let snapshot = null;
let localCarId = null;
let localSocketId = null;
let joined = false;
let lastInput = {};

const inputMap = {
  ArrowUp: "throttle",
  KeyW: "throttle",
  ArrowDown: "brake",
  KeyS: "brake",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right"
};

createRoomButton.addEventListener("click", () => {
  socket.emit("createRoom", {
    nickname: getNickname(),
    roomName: roomNameInput.value.trim(),
    circuitId: circuitSelect.value
  });
});

refreshRoomsButton.addEventListener("click", () => socket.emit("listRooms"));
circuitSelect.addEventListener("change", () => {
  if (!snapshot) drawPreview();
});

readyButton.addEventListener("click", () => {
  const localCar = getLocalCar();
  socket.emit("setReady", { ready: !localCar?.ready });
});

startButton.addEventListener("click", () => socket.emit("startRace"));
leaveButton.addEventListener("click", leaveRoom);
backToLobbyButton.addEventListener("click", () => socket.emit("returnToLobby"));

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") {
    event.preventDefault();
    socket.emit("respawn");
    return;
  }
  if (!inputMap[event.code]) return;
  event.preventDefault();
  keys.add(event.code);
  sendInputIfChanged();
}, true);

window.addEventListener("keyup", (event) => {
  if (!inputMap[event.code]) return;
  event.preventDefault();
  keys.delete(event.code);
  sendInputIfChanged();
}, true);

socket.on("connect", () => {
  connectionStatus.textContent = "서버에 연결되었습니다.";
  socket.emit("listRooms");
});

socket.on("disconnect", () => {
  connectionStatus.textContent = "연결이 끊겼습니다. 다시 연결 중입니다.";
  joined = false;
  menuPanel.classList.remove("hidden");
  roomPanel.classList.add("hidden");
  syncShellState();
});

socket.on("serverInfo", (info) => {
  localSocketId = info.socketId;
  circuits = info.circuits || [];
  renderCircuitOptions();
});

socket.on("roomList", (nextRooms) => {
  rooms = nextRooms || [];
  renderRoomList();
});

socket.on("joined", (payload) => {
  localCarId = payload.carId;
  joined = true;
  menuPanel.classList.add("hidden");
  roomPanel.classList.remove("hidden");
  resultsPanel.classList.add("hidden");
  syncShellState();
  canvas.focus();
});

socket.on("snapshot", (nextSnapshot) => {
  const previousStatus = snapshot?.race.status;
  snapshot = nextSnapshot;
  if (joined && (snapshot.race.status === "running" || snapshot.race.status === "countdown")) {
    canvas.focus();
  }
  if (previousStatus === "finished" && snapshot.race.status === "lobby") {
    resultsPanel.classList.add("hidden");
  }
  updateHud();
  updateRoomPanel();
  updateCountdown();
  syncShellState();
});

socket.on("roomError", (payload) => {
  connectionStatus.textContent = payload.message;
});

socket.on("kicked", (payload) => {
  joined = false;
  snapshot = null;
  localCarId = null;
  menuPanel.classList.remove("hidden");
  roomPanel.classList.add("hidden");
  resultsPanel.classList.add("hidden");
  connectionStatus.textContent = payload.message;
  syncShellState();
});

function renderCircuitOptions() {
  circuitSelect.replaceChildren(
    ...circuits.map((circuit) => {
      const option = document.createElement("option");
      option.value = circuit.id;
      option.textContent = `${circuit.name} (${circuit.country})`;
      return option;
    })
  );
  if (!snapshot) drawPreview();
}

function renderRoomList() {
  if (rooms.length === 0) {
    roomListEl.innerHTML = '<p class="empty-state">열린 방이 없습니다. 새 방을 만들어보세요.</p>';
    return;
  }

  roomListEl.replaceChildren(
    ...rooms.map((room) => {
      const card = document.createElement("article");
      card.className = "room-card";

      const body = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = room.name;
      const meta = document.createElement("span");
      meta.textContent = `${room.circuitName} · ${statusText(room.status)} · ${room.players}/${room.maxPlayers}명 · 준비 ${room.readyPlayers}명 · 방장 ${room.hostName}`;
      body.append(title, meta);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = room.status === "lobby" ? "입장" : "진행 중";
      button.disabled = room.status !== "lobby" || room.players >= room.maxPlayers;
      button.addEventListener("click", () => {
        socket.emit("joinRoom", { roomId: room.id, nickname: getNickname() });
      });

      card.append(body, button);
      return card;
    })
  );
}

function updateRoomPanel() {
  if (!snapshot || !joined) return;

  const localCar = getLocalCar();
  const isHost = Boolean(localCar?.isHost);
  roomTitleEl.textContent = snapshot.room.name;
  roomMetaEl.textContent = `${snapshot.circuit.name} · ${statusText(snapshot.race.status)} · ${snapshot.cars.length}/12명`;

  participantListEl.replaceChildren(
    ...snapshot.cars.map((car) => {
      const row = document.createElement("div");
      row.className = "participant";

      const text = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = `${car.name}${car.id === localCarId ? " (나)" : ""}`;
      const meta = document.createElement("small");
      const labels = [];
      if (car.isHost) labels.push("방장");
      labels.push(car.ready ? "준비 완료" : "대기 중");
      if (car.respawning) labels.push("리스폰 중");
      if (car.finished) labels.push("완주");
      meta.textContent = labels.join(" · ");
      text.append(name, meta);
      row.append(text);

      if (isHost && !car.isHost && snapshot.race.status === "lobby") {
        const kick = document.createElement("button");
        kick.type = "button";
        kick.textContent = "강퇴";
        kick.addEventListener("click", () => socket.emit("kickPlayer", { socketId: car.socketId }));
        row.append(kick);
      }
      return row;
    })
  );

  readyButton.textContent = localCar?.ready ? "준비 취소" : "준비";
  readyButton.disabled = snapshot.race.status !== "lobby";
  startButton.disabled = !isHost || !snapshot.race.canStart;
  leaveButton.disabled = false;
}

function updateHud() {
  if (!snapshot) return;

  const localCar = getLocalCar();
  playersEl.textContent = `${snapshot.cars.length}/12`;
  if (localCar) {
    positionEl.textContent = `${localCar.position}`;
    lapEl.textContent = `${Math.min(localCar.lap + 1, snapshot.race.totalLaps)}/${snapshot.race.totalLaps}`;
    speedEl.textContent = `${Math.max(0, localCar.speed)}`;
  } else {
    positionEl.textContent = "--";
    lapEl.textContent = "--";
    speedEl.textContent = "0";
  }

  leaderboardEl.replaceChildren(
    ...snapshot.cars.map((car) => {
      const item = document.createElement("li");
      item.className = car.id === localCarId ? "local" : "";
      const lapText = car.finished ? "완주" : `${Math.min(car.lap + 1, snapshot.race.totalLaps)}랩`;
      item.textContent = `${car.name} ${lapText}`;
      return item;
    })
  );

  if (snapshot.race.status === "finished") showResults();
}

function updateCountdown() {
  if (!snapshot || snapshot.race.status !== "countdown") {
    countdownOverlay.classList.add("hidden");
    return;
  }
  const remaining = snapshot.race.countdownRemainingMs;
  const label = remaining <= 800 ? "GO" : String(Math.ceil((remaining - 800) / 1000));
  countdownOverlay.textContent = label;
  countdownOverlay.classList.remove("hidden");
}

function showResults() {
  resultsPanel.classList.remove("hidden");
  resultsEl.replaceChildren(
    ...snapshot.cars.map((car) => {
      const item = document.createElement("li");
      item.textContent = `${car.name} - ${car.finishedAt ? `${(car.finishedAt / 1000).toFixed(1)}초` : "미완주"}`;
      return item;
    })
  );
}

function leaveRoom() {
  socket.emit("leaveRoom");
  joined = false;
  snapshot = null;
  localCarId = null;
  menuPanel.classList.remove("hidden");
  roomPanel.classList.add("hidden");
  resultsPanel.classList.add("hidden");
  syncShellState();
  socket.emit("listRooms");
}

function syncShellState() {
  document.body.classList.toggle("in-room", joined);
  document.body.classList.toggle(
    "race-active",
    joined && (snapshot?.race.status === "countdown" || snapshot?.race.status === "running")
  );
}

function sendInputIfChanged() {
  if (!joined || snapshot?.race.status !== "running") return;

  const input = {
    throttle: keys.has("ArrowUp") || keys.has("KeyW"),
    brake: keys.has("ArrowDown") || keys.has("KeyS"),
    left: keys.has("ArrowLeft") || keys.has("KeyA"),
    right: keys.has("ArrowRight") || keys.has("KeyD")
  };
  if (JSON.stringify(input) === JSON.stringify(lastInput)) return;
  lastInput = input;
  socket.emit("input", input);
}

setInterval(sendInputIfChanged, 50);

function render() {
  resizeCanvas();
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!snapshot) {
    drawPreview();
  } else {
    drawWorld();
  }
  requestAnimationFrame(render);
}

function resizeCanvas() {
  const scale = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * scale);
  const height = Math.floor(canvas.clientHeight * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawIdleBackground() {
  context.fillStyle = "#245d3c";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255,255,255,0.06)";
  for (let i = 0; i < 90; i += 1) {
    context.fillRect((i * 113) % canvas.width, (i * 157) % canvas.height, 48, 4);
  }
}

function drawPreview() {
  const circuit = getSelectedCircuit();
  if (!circuit) {
    drawIdleBackground();
    return;
  }

  const world = getWorldTransform(circuit);
  context.save();
  context.setTransform(world.scale, 0, 0, world.scale, world.offsetX, world.offsetY);
  drawGrass(circuit);
  drawTrack(circuit);
  drawCheckpoints(circuit);
  drawStartDirection(circuit);
  drawPreviewTitle(circuit);
  context.restore();
}

function drawWorld() {
  const circuit = snapshot.circuit;
  const world = getWorldTransform(circuit);
  context.save();
  context.setTransform(world.scale, 0, 0, world.scale, world.offsetX, world.offsetY);
  drawGrass(circuit);
  drawTrack(circuit);
  drawCheckpoints(circuit);
  drawStartDirection(circuit);
  for (const car of [...snapshot.cars].reverse()) drawCar(car);
  if (snapshot.race.status === "lobby") drawCenterText("모든 참가자가 준비하면 방장이 시작할 수 있습니다.");
  context.restore();
}

function getWorldTransform(circuit) {
  const width = circuit?.worldWidth || 2600;
  const height = circuit?.worldHeight || 1700;
  const padding = snapshot ? 92 : 64;
  const availableWidth = Math.max(1, canvas.width - padding * 2);
  const availableHeight = Math.max(1, canvas.height - padding * 2);
  const scale = Math.min(availableWidth / width, availableHeight / height);
  return {
    scale,
    offsetX: (canvas.width - width * scale) / 2,
    offsetY: (canvas.height - height * scale) / 2
  };
}

function drawGrass(circuit) {
  const width = circuit?.worldWidth || 2600;
  const height = circuit?.worldHeight || 1700;
  context.fillStyle = "#286c43";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 130; i += 1) {
    context.fillRect((i * 97) % width, (i * 151) % height, 42, 3);
  }
}

function drawTrack(circuit) {
  drawTrackLine(circuit.points, circuit.width + 28, "#111820", []);
  drawTrackLine(circuit.points, circuit.width, "#2b3035", []);
  drawBoostZones(circuit);
  drawTrackLine(circuit.points, 7, "#f8fbff", [36, 28]);
}

function drawTrackLine(points, width, color, dash) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash(dash);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
  context.stroke();
  context.restore();
}

function drawBoostZones(circuit) {
  for (const zone of circuit.boostZones || []) {
    drawBoostPatch(circuit.points, zone, "#39f5ff", zone.zoneWidth);
    drawBoostPatch(circuit.points, zone, "#fff06a", 7);
  }
}

function drawBoostPatch(points, zone, color, width) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = width > 10 ? 0.85 : 1;
  context.beginPath();
  const first = offsetTrackPoint(points, zone.startIndex, zone.sideOffset);
  context.moveTo(first.x, first.y);
  for (let step = 1; step <= zone.length; step += 1) {
    const point = offsetTrackPoint(points, zone.startIndex + step, zone.sideOffset);
    context.lineTo(point.x, point.y);
  }
  context.stroke();
  context.restore();
}

function offsetTrackPoint(points, rawIndex, offset) {
  const index = ((rawIndex % points.length) + points.length) % points.length;
  const point = points[index];
  const next = points[(index + 1) % points.length];
  const tangent = Math.atan2(next.y - point.y, next.x - point.x);
  const normal = tangent + Math.PI / 2;
  return {
    x: point.x + Math.cos(normal) * offset,
    y: point.y + Math.sin(normal) * offset
  };
}

function drawCheckpoints(circuit) {
  for (const checkpoint of circuit.checkpoints) {
    const point = checkpoint.point;
    const next = circuit.points[(checkpoint.index + 1) % circuit.points.length];
    const angle = Math.atan2(next.y - point.y, next.x - point.x) + Math.PI / 2;
    const half = circuit.width / 2;
    context.strokeStyle = checkpoint.index === 0 ? "#f4c542" : "rgba(255,255,255,0.22)";
    context.lineWidth = checkpoint.index === 0 ? 10 : 4;
    context.beginPath();
    context.moveTo(point.x - Math.cos(angle) * half, point.y - Math.sin(angle) * half);
    context.lineTo(point.x + Math.cos(angle) * half, point.y + Math.sin(angle) * half);
    context.stroke();
  }
}

function drawStartDirection(circuit) {
  const start = circuit.checkpoints[0];
  if (!start) return;

  const point = start.point;
  const next = circuit.points[(start.index + 6) % circuit.points.length];
  const angle = Math.atan2(next.y - point.y, next.x - point.x);
  const arrowX = point.x + Math.cos(angle) * 118;
  const arrowY = point.y + Math.sin(angle) * 118;

  context.save();
  context.translate(arrowX, arrowY);
  context.rotate(angle);
  context.fillStyle = "#ffe76a";
  context.strokeStyle = "rgba(0,0,0,0.7)";
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(48, 0);
  context.lineTo(-18, -30);
  context.lineTo(-4, -8);
  context.lineTo(-58, -8);
  context.lineTo(-58, 8);
  context.lineTo(-4, 8);
  context.lineTo(-18, 30);
  context.closePath();
  context.stroke();
  context.fill();
  context.restore();

  const labelX = arrowX + Math.cos(angle - Math.PI / 2) * 72;
  const labelY = arrowY + Math.sin(angle - Math.PI / 2) * 72;
  context.font = "900 24px system-ui";
  context.textAlign = "center";
  context.lineWidth = 6;
  context.strokeStyle = "rgba(0,0,0,0.72)";
  context.fillStyle = "#ffffff";
  context.strokeText("진행 방향", labelX, labelY);
  context.fillText("진행 방향", labelX, labelY);
}

function drawPreviewTitle(circuit) {
  context.font = "900 54px system-ui";
  context.textAlign = "center";
  context.lineWidth = 8;
  context.strokeStyle = "rgba(0,0,0,0.65)";
  context.fillStyle = "#ffffff";
  context.strokeText(`${circuit.name} 미리보기`, circuit.worldWidth / 2, 150);
  context.fillText(`${circuit.name} 미리보기`, circuit.worldWidth / 2, 150);
  context.font = "800 28px system-ui";
  const detail = `길이 ${Math.round(circuit.length).toLocaleString("ko-KR")}m · 부스트존 ${circuit.boostZones.length}개`;
  context.strokeText(detail, circuit.worldWidth / 2, 196);
  context.fillText(detail, circuit.worldWidth / 2, 196);
}

function drawCar(car) {
  if (car.respawning && Math.floor(Date.now() / 160) % 2 === 0) return;
  context.save();
  context.translate(car.x, car.y);
  context.rotate(car.angle);
  context.globalAlpha = car.invulnerable ? 0.65 : 1;

  context.fillStyle = "rgba(0,0,0,0.55)";
  roundedRect(-28, -18, 56, 36, 9);
  context.fill();

  context.fillStyle = "#111318";
  roundedRect(-23, -18, 10, 8, 3);
  context.fill();
  roundedRect(13, -18, 10, 8, 3);
  context.fill();
  roundedRect(-23, 10, 10, 8, 3);
  context.fill();
  roundedRect(13, 10, 10, 8, 3);
  context.fill();

  context.fillStyle = car.color;
  context.strokeStyle = car.id === localCarId ? "#ffffff" : "rgba(0,0,0,0.72)";
  context.lineWidth = car.id === localCarId ? 5 : 3;
  roundedRect(-26, -14, 52, 28, 9);
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(255,255,255,0.18)";
  roundedRect(-10, -10, 20, 20, 5);
  context.fill();
  context.fillStyle = "#bfefff";
  roundedRect(3, -9, 14, 18, 4);
  context.fill();
  context.fillStyle = "rgba(255,255,255,0.78)";
  roundedRect(-17, -8, 9, 16, 3);
  context.fill();

  context.fillStyle = "#fff2b3";
  roundedRect(20, -9, 4, 7, 2);
  context.fill();
  roundedRect(20, 2, 4, 7, 2);
  context.fill();
  context.fillStyle = "#ff4e4e";
  roundedRect(-25, -9, 4, 7, 2);
  context.fill();
  roundedRect(-25, 2, 4, 7, 2);
  context.fill();

  context.strokeStyle = "rgba(255,255,255,0.5)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-2, -11);
  context.lineTo(14, -11);
  context.stroke();

  if (car.boosting) {
    context.fillStyle = "rgba(57,245,255,0.75)";
    context.beginPath();
    context.moveTo(-27, -8);
    context.lineTo(-43, 0);
    context.lineTo(-27, 8);
    context.closePath();
    context.fill();
  }

  context.restore();

  context.font = "700 20px system-ui";
  context.textAlign = "center";
  context.lineWidth = 4;
  context.strokeStyle = "rgba(0,0,0,0.75)";
  context.fillStyle = "#ffffff";
  context.strokeText(car.name, car.x, car.y - 34);
  context.fillText(car.name, car.x, car.y - 34);
}

function drawCenterText(text) {
  context.font = "800 32px system-ui";
  context.textAlign = "center";
  context.lineWidth = 7;
  context.strokeStyle = "rgba(0,0,0,0.65)";
  context.fillStyle = "#ffffff";
  const circuit = snapshot?.circuit || getSelectedCircuit();
  const x = (circuit?.worldWidth || 2600) / 2;
  const y = (circuit?.worldHeight || 1700) / 2;
  context.strokeText(text, x, y);
  context.fillText(text, x, y);
}

function roundedRect(x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function getNickname() {
  return nicknameInput.value.trim() || `드라이버 ${Math.floor(Math.random() * 1000)}`;
}

function getLocalCar() {
  return snapshot?.cars.find((car) => car.id === localCarId) || null;
}

function getSelectedCircuit() {
  return circuits.find((circuit) => circuit.id === circuitSelect.value) || circuits[0] || null;
}

function statusText(status) {
  if (status === "lobby") return "대기 중";
  if (status === "countdown") return "카운트다운";
  if (status === "running") return "진행 중";
  if (status === "finished") return "종료";
  return status;
}

render();
