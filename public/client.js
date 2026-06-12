const socket = io();

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const joinPanel = document.querySelector("#joinPanel");
const joinForm = document.querySelector("#joinForm");
const nicknameInput = document.querySelector("#nickname");
const connectionStatus = document.querySelector("#connectionStatus");
const positionEl = document.querySelector("#position");
const lapEl = document.querySelector("#lap");
const speedEl = document.querySelector("#speed");
const playersEl = document.querySelector("#players");
const leaderboardEl = document.querySelector("#leaderboard");
const resultsPanel = document.querySelector("#resultsPanel");
const resultsEl = document.querySelector("#results");
const resetButton = document.querySelector("#resetButton");
const raceAgainButton = document.querySelector("#raceAgainButton");

const keys = new Set();
let snapshot = null;
let localCarId = null;
let lastInput = {};
let joined = false;

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

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nickname = nicknameInput.value.trim() || `Driver ${Math.floor(Math.random() * 1000)}`;
  socket.emit("join", { nickname });
});

resetButton.addEventListener("click", () => {
  socket.emit("resetRace");
});

raceAgainButton.addEventListener("click", () => {
  resultsPanel.classList.add("hidden");
  socket.emit("resetRace");
});

window.addEventListener("keydown", (event) => {
  if (!inputMap[event.code]) {
    return;
  }
  event.preventDefault();
  keys.add(event.code);
  sendInputIfChanged();
});

window.addEventListener("keyup", (event) => {
  if (!inputMap[event.code]) {
    return;
  }
  event.preventDefault();
  keys.delete(event.code);
  sendInputIfChanged();
});

socket.on("connect", () => {
  connectionStatus.textContent = "Connected. Enter a nickname to race.";
});

socket.on("disconnect", () => {
  connectionStatus.textContent = "Disconnected. Reconnecting...";
  joined = false;
  joinPanel.classList.remove("hidden");
});

socket.on("serverInfo", (info) => {
  connectionStatus.textContent = `Connected as ${info.socketId.slice(0, 5)}.`;
});

socket.on("joined", (payload) => {
  localCarId = payload.carId;
  joined = true;
  joinPanel.classList.add("hidden");
  canvas.focus();
});

socket.on("joinError", (payload) => {
  connectionStatus.textContent = payload.message;
});

socket.on("snapshot", (nextSnapshot) => {
  snapshot = nextSnapshot;
  updateHud();
});

function sendInputIfChanged() {
  if (!joined) {
    return;
  }

  const input = {
    throttle: keys.has("ArrowUp") || keys.has("KeyW"),
    brake: keys.has("ArrowDown") || keys.has("KeyS"),
    left: keys.has("ArrowLeft") || keys.has("KeyA"),
    right: keys.has("ArrowRight") || keys.has("KeyD")
  };

  if (JSON.stringify(input) === JSON.stringify(lastInput)) {
    return;
  }

  lastInput = input;
  socket.emit("input", input);
}

function updateHud() {
  if (!snapshot) {
    return;
  }

  const localCar = snapshot.cars.find((car) => car.id === localCarId);
  const humans = snapshot.cars.filter((car) => car.kind === "human").length;
  playersEl.textContent = `${humans}/12`;

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
    ...snapshot.cars.slice(0, 12).map((car) => {
      const item = document.createElement("li");
      item.className = car.id === localCarId ? "local" : "";
      item.textContent = `${car.name} ${car.finished ? "FIN" : `L${Math.min(car.lap + 1, snapshot.race.totalLaps)}`}`;
      return item;
    })
  );

  if (snapshot.race.status === "finished") {
    showResults();
  }
}

function showResults() {
  resultsPanel.classList.remove("hidden");
  resultsEl.replaceChildren(
    ...snapshot.cars.map((car) => {
      const item = document.createElement("li");
      item.textContent = `${car.name} - ${car.finishedAt ? `${(car.finishedAt / 1000).toFixed(1)}s` : "DNF"}`;
      return item;
    })
  );
}

function render() {
  resizeCanvas();
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (!snapshot) {
    drawLoading();
    requestAnimationFrame(render);
    return;
  }

  drawWorld();
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

function drawLoading() {
  context.fillStyle = "#163f2a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8fbff";
  context.font = "700 24px system-ui";
  context.textAlign = "center";
  context.fillText("Connecting...", canvas.width / 2, canvas.height / 2);
}

function drawWorld() {
  const world = getWorldTransform();
  context.save();
  context.setTransform(world.scale, 0, 0, world.scale, world.offsetX, world.offsetY);

  drawGrass();
  drawTrack();
  drawCheckpoints();
  for (const car of [...snapshot.cars].reverse()) {
    drawCar(car);
  }
  context.restore();
}

function getWorldTransform() {
  const scale = Math.min(canvas.width / 2000, canvas.height / 1300);
  return {
    scale,
    offsetX: (canvas.width - 2000 * scale) / 2,
    offsetY: (canvas.height - 1300 * scale) / 2
  };
}

function drawGrass() {
  context.fillStyle = "#286c43";
  context.fillRect(0, 0, 2000, 1300);
  context.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 80; i += 1) {
    context.fillRect((i * 97) % 2000, (i * 151) % 1300, 42, 3);
  }
}

function drawTrack() {
  const track = snapshot.track;
  context.save();
  context.translate(track.centerX, track.centerY);

  context.fillStyle = "#2b3035";
  context.beginPath();
  context.ellipse(0, 0, track.outerRadiusX, track.outerRadiusY, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#286c43";
  context.beginPath();
  context.ellipse(0, 0, track.innerRadiusX, track.innerRadiusY, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "#f8fbff";
  context.lineWidth = 7;
  context.setLineDash([34, 28]);
  context.beginPath();
  context.ellipse(0, 0, 595, 330, 0, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);

  context.strokeStyle = "#111820";
  context.lineWidth = 16;
  context.beginPath();
  context.ellipse(0, 0, track.outerRadiusX, track.outerRadiusY, 0, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.ellipse(0, 0, track.innerRadiusX, track.innerRadiusY, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawCheckpoints() {
  const track = snapshot.track;
  context.save();
  context.translate(track.centerX, track.centerY);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const x1 = Math.cos(angle) * track.innerRadiusX;
    const y1 = Math.sin(angle) * track.innerRadiusY;
    const x2 = Math.cos(angle) * track.outerRadiusX;
    const y2 = Math.sin(angle) * track.outerRadiusY;
    context.strokeStyle = i === 0 ? "#f4c542" : "rgba(255,255,255,0.18)";
    context.lineWidth = i === 0 ? 10 : 4;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }
  context.restore();
}

function drawCar(car) {
  context.save();
  context.translate(car.x, car.y);
  context.rotate(car.angle);

  context.fillStyle = car.color;
  context.strokeStyle = car.id === localCarId ? "#ffffff" : "rgba(0,0,0,0.55)";
  context.lineWidth = car.id === localCarId ? 6 : 3;
  roundedRect(-24, -14, 48, 28, 7);
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(255,255,255,0.82)";
  roundedRect(4, -9, 15, 18, 4);
  context.fill();
  context.restore();

  context.font = "700 20px system-ui";
  context.textAlign = "center";
  context.lineWidth = 4;
  context.strokeStyle = "rgba(0,0,0,0.75)";
  context.fillStyle = "#ffffff";
  context.strokeText(car.name, car.x, car.y - 34);
  context.fillText(car.name, car.x, car.y - 34);
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

render();
