export const MAX_PARTICIPANTS = 12;
export const TOTAL_LAPS = 3;
export const TICK_RATE = 30;

const WORLD_WIDTH = 2600;
const WORLD_HEIGHT = 1700;
const POINT_COUNT = 192;
const CAR_RADIUS = 18;
const NORMAL_MAX_FORWARD_SPEED = 450;
const BOOST_MAX_FORWARD_SPEED = 780;
const MAX_REVERSE_SPEED = -150;
const NORMAL_ACCELERATION = 320;
const BOOST_ACCELERATION = 900;
const BRAKE_FORCE = 430;
const FRICTION = 0.986;
const TURN_RATE = 3.35;
const COUNTDOWN_MS = 4000;
const RESPAWN_LOCK_MS = 2000;
const BOOST_DURATION_MS = 2600;

const INPUT_DEFAULTS = Object.freeze({
  throttle: false,
  brake: false,
  left: false,
  right: false
});

const COLORS = [
  "#ff4d4d",
  "#3ea7ff",
  "#ffd33e",
  "#49d17d",
  "#b779ff",
  "#ff8f3e",
  "#40e0d0",
  "#ff6fb1",
  "#d4f85f",
  "#6f83ff",
  "#f4f4f4",
  "#37c871"
];

const CIRCUIT_DEFS = [
  {
    id: "monaco",
    name: "모나코",
    country: "모나코",
    width: 124,
    baseRadiusX: 890,
    baseRadiusY: 560,
    harmonics: [[2, 0.18, 0.4], [3, -0.13, 1.9], [5, 0.1, -0.7], [9, 0.045, 2.4]],
    wobbleX: [[4, 110, 0.5], [7, 64, 1.8]],
    wobbleY: [[3, 80, -0.8], [8, 58, 0.2]],
    rotation: -0.42
  },
  {
    id: "silverstone",
    name: "실버스톤",
    country: "영국",
    width: 146,
    baseRadiusX: 970,
    baseRadiusY: 515,
    harmonics: [[2, -0.09, 0.1], [4, 0.16, 1.2], [6, -0.06, 2.6], [10, 0.035, -0.4]],
    wobbleX: [[3, 88, -1.2], [8, 72, 0.8]],
    wobbleY: [[5, 92, 0.3], [9, 45, 2.1]],
    rotation: 0.16
  },
  {
    id: "suzuka",
    name: "스즈카",
    country: "일본",
    width: 136,
    figureEight: true,
    baseRadiusX: 900,
    baseRadiusY: 500,
    harmonics: [[2, 0.2, 0.7], [3, 0.1, -1.1], [5, -0.08, 2.3], [11, 0.04, 0.6]],
    wobbleX: [[2, 220, 0.1], [6, 90, 1.4]],
    wobbleY: [[2, 150, 1.7], [7, 64, -0.5]],
    rotation: -0.08
  },
  {
    id: "spa",
    name: "스파",
    country: "벨기에",
    width: 154,
    baseRadiusX: 1030,
    baseRadiusY: 580,
    harmonics: [[2, 0.22, -0.8], [3, -0.15, 1.1], [4, 0.1, 2.4], [8, 0.05, -1.5]],
    wobbleX: [[5, 120, 0.9], [9, 70, -0.2]],
    wobbleY: [[4, 95, 2.3], [10, 52, 1.1]],
    rotation: 0.34
  },
  {
    id: "monza",
    name: "몬차",
    country: "이탈리아",
    width: 158,
    baseRadiusX: 1000,
    baseRadiusY: 500,
    harmonics: [[2, -0.08, 0.2], [3, 0.11, -1.7], [6, 0.06, 0.5], [12, -0.03, 1.8]],
    wobbleX: [[4, 95, 2.2], [9, 60, 0.4]],
    wobbleY: [[3, 75, -0.7], [8, 42, 1.9]],
    rotation: -0.18
  },
  {
    id: "interlagos",
    name: "인터라고스",
    country: "브라질",
    width: 138,
    baseRadiusX: 930,
    baseRadiusY: 530,
    harmonics: [[2, 0.13, 2.1], [3, 0.15, -0.6], [5, -0.11, 1.5], [9, 0.05, -2.0]],
    wobbleX: [[3, 115, -0.3], [7, 68, 2.0]],
    wobbleY: [[4, 86, 0.8], [11, 48, -1.2]],
    rotation: 0.54
  }
];

export const CIRCUITS = CIRCUIT_DEFS.map(buildCircuit);

let nextStateId = 1;

export function createInitialState(options = {}) {
  const circuit = getCircuit(options.circuitId);
  return {
    id: `race-${nextStateId++}`,
    timeMs: 0,
    room: {
      id: options.roomId || `room-${nextStateId}`,
      name: normalizeRoomName(options.roomName),
      createdAt: Date.now()
    },
    circuit,
    race: {
      status: "lobby",
      totalLaps: TOTAL_LAPS,
      countdownRemainingMs: 0,
      startedAt: null,
      finishedAt: null
    },
    cars: []
  };
}

export function addHumanPlayer(state, socketId, nickname) {
  const existing = state.cars.find((car) => car.socketId === socketId);
  if (existing) return { ok: true, car: existing };
  if (state.cars.length >= MAX_PARTICIPANTS) return { ok: false, error: "방이 가득 찼습니다." };
  if (state.race.status !== "lobby") return { ok: false, error: "이미 시작된 방입니다." };

  const slot = state.cars.length;
  const car = createCar({
    id: `human-${socketId}`,
    socketId,
    name: normalizeName(nickname),
    slot,
    isHost: slot === 0,
    circuit: state.circuit
  });
  state.cars.push(car);
  return { ok: true, car };
}

export function removeHumanPlayer(state, socketId) {
  const removedIndex = state.cars.findIndex((car) => car.socketId === socketId);
  if (removedIndex === -1) return;

  const wasHost = state.cars[removedIndex].isHost;
  state.cars.splice(removedIndex, 1);
  state.cars.forEach((car, index) => {
    car.slot = index;
    car.color = COLORS[index % COLORS.length];
    car.position = index + 1;
    car.isHost = wasHost && index === 0 ? true : car.isHost && !wasHost;
  });
  if (state.cars.length > 0 && !state.cars.some((car) => car.isHost)) state.cars[0].isHost = true;
}

export function setPlayerReady(state, socketId, ready) {
  const car = state.cars.find((entry) => entry.socketId === socketId);
  if (!car || state.race.status !== "lobby") return { ok: false, error: "준비 상태를 바꿀 수 없습니다." };
  car.ready = Boolean(ready);
  return { ok: true, car };
}

export function canStartRace(state) {
  return state.race.status === "lobby" && state.cars.length > 0 && state.cars.every((car) => car.ready);
}

export function startRace(state, socketId) {
  const host = state.cars.find((car) => car.socketId === socketId && car.isHost);
  if (!host) return { ok: false, error: "방장만 게임을 시작할 수 있습니다." };
  if (!canStartRace(state)) return { ok: false, error: "모든 참가자가 준비해야 합니다." };

  state.timeMs = 0;
  state.race.status = "countdown";
  state.race.countdownRemainingMs = COUNTDOWN_MS;
  state.race.startedAt = Date.now();
  state.race.finishedAt = null;
  state.cars.forEach((car, index) => resetCarForRace(car, index, state.circuit));
  return { ok: true };
}

export function returnToLobby(state) {
  if (state.race.status !== "finished") return { ok: false, error: "아직 종료된 레이스가 아닙니다." };
  state.timeMs = 0;
  state.race.status = "lobby";
  state.race.countdownRemainingMs = 0;
  state.race.startedAt = null;
  state.race.finishedAt = null;
  state.cars.forEach((car, index) => {
    car.ready = false;
    resetCarForRace(car, index, state.circuit);
  });
  return { ok: true };
}

export function kickPlayer(state, hostSocketId, targetSocketId) {
  const host = state.cars.find((car) => car.socketId === hostSocketId && car.isHost);
  if (!host) return { ok: false, error: "방장만 강퇴할 수 있습니다." };
  if (hostSocketId === targetSocketId) return { ok: false, error: "자기 자신은 강퇴할 수 없습니다." };
  const target = state.cars.find((car) => car.socketId === targetSocketId);
  if (!target) return { ok: false, error: "대상을 찾을 수 없습니다." };
  removeHumanPlayer(state, targetSocketId);
  return { ok: true, kicked: target };
}

export function applyPlayerInput(state, socketId, input = {}) {
  const car = state.cars.find((entry) => entry.socketId === socketId);
  if (!car) return;
  car.input = compactInput(input);
}

export function respawnPlayer(state, socketId) {
  if (state.race.status !== "running") return { ok: false, error: "레이스 중에만 리스폰할 수 있습니다." };
  const car = state.cars.find((entry) => entry.socketId === socketId);
  if (!car || car.finished) return { ok: false, error: "리스폰할 수 없습니다." };
  placeCarOnTrackCenter(car, state.circuit, car.trackPosition);
  car.speed = 0;
  car.input = { ...INPUT_DEFAULTS };
  car.respawnUntil = state.timeMs + RESPAWN_LOCK_MS;
  car.invulnerableUntil = state.timeMs + RESPAWN_LOCK_MS;
  return { ok: true, car };
}

export function updateGame(state, dtMs) {
  separateCars(state);
  if (state.race.status === "countdown") {
    const remainingBeforeTick = state.race.countdownRemainingMs;
    state.race.countdownRemainingMs = Math.max(0, state.race.countdownRemainingMs - dtMs);
    if (state.race.countdownRemainingMs > 0) return;
    state.race.status = "running";
    dtMs = Math.max(0, dtMs - remainingBeforeTick);
    if (dtMs === 0) return;
  }
  if (state.race.status !== "running") return;

  const dt = Math.min(dtMs, 100) / 1000;
  state.timeMs += dtMs;
  for (const car of state.cars) {
    if (car.finished || car.respawnUntil > state.timeMs) continue;
    applyBoostZone(car, state);
    updateCarPhysics(car, car.input, dt, state.timeMs);
    constrainToTrack(car, state.circuit);
    updateProgress(car, state);
    applyBoostZone(car, state);
  }
  separateCars(state);
  rankCars(state).forEach((car, index) => {
    car.position = index + 1;
  });
  if (state.cars.length > 0 && state.cars.every((car) => car.finished) && state.race.status !== "finished") {
    state.race.status = "finished";
    state.race.finishedAt = state.timeMs;
  }
}

export function rankCars(state) {
  return [...state.cars].sort((a, b) => {
    if (a.finished || b.finished) {
      if (a.finished && b.finished) return a.finishedAt - b.finishedAt;
      return a.finished ? -1 : 1;
    }
    if (a.lap !== b.lap) return b.lap - a.lap;
    if (a.checkpoint !== b.checkpoint) return b.checkpoint - a.checkpoint;
    return b.progress - a.progress;
  });
}

export function buildSnapshot(state) {
  return {
    id: state.id,
    timeMs: Math.round(state.timeMs),
    room: { ...state.room },
    circuit: serializeCircuit(state.circuit),
    race: { ...state.race, canStart: canStartRace(state) },
    cars: rankCars(state).map((car) => ({
      id: car.id,
      socketId: car.socketId,
      kind: car.kind,
      name: car.name,
      color: car.color,
      x: round(car.x),
      y: round(car.y),
      angle: round(car.angle, 1000),
      speed: Math.round(car.speed),
      lap: car.lap,
      checkpoint: car.checkpoint,
      progress: round(car.progress, 1000),
      position: car.position,
      ready: car.ready,
      isHost: car.isHost,
      boosting: car.boostUntil > state.timeMs,
      boostRemainingMs: Math.max(0, Math.ceil(car.boostUntil - state.timeMs)),
      respawning: car.respawnUntil > state.timeMs,
      respawnRemainingMs: Math.max(0, Math.ceil(car.respawnUntil - state.timeMs)),
      invulnerable: car.invulnerableUntil > state.timeMs,
      finished: car.finished,
      finishedAt: car.finishedAt
    }))
  };
}

export function listCircuitSummaries() {
  return CIRCUITS.map((circuit) => serializeCircuit(circuit));
}

function buildCircuit(definition) {
  const points = [];
  for (let i = 0; i < POINT_COUNT; i += 1) {
    const angle = (i / POINT_COUNT) * Math.PI * 2;
    let radiusScale = 1;
    for (const [multiple, amount, phase] of definition.harmonics) {
      radiusScale += Math.sin(angle * multiple + phase) * amount;
    }
    let localX = Math.cos(angle) * definition.baseRadiusX * radiusScale;
    let localY = Math.sin(angle) * definition.baseRadiusY * radiusScale;
    if (definition.figureEight) {
      localX += Math.sin(angle * 2) * 260;
      localY += Math.sin(angle) * Math.cos(angle) * 210;
    }
    for (const [multiple, amount, phase] of definition.wobbleX || []) localX += Math.sin(angle * multiple + phase) * amount;
    for (const [multiple, amount, phase] of definition.wobbleY || []) localY += Math.cos(angle * multiple + phase) * amount;
    const rotated = rotate(localX, localY, definition.rotation);
    points.push({ x: WORLD_WIDTH / 2 + rotated.x, y: WORLD_HEIGHT / 2 + rotated.y });
  }

  const circuit = {
    ...definition,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    centerX: WORLD_WIDTH / 2,
    centerY: WORLD_HEIGHT / 2,
    points,
    checkpoints: buildCheckpoints(points),
    boostZones: buildBoostZones(points)
  };
  circuit.length = calculateCircuitLength(points);
  return circuit;
}

function buildCheckpoints(points) {
  return Array.from({ length: 8 }, (_unused, index) => {
    const pointIndex = Math.floor((index / 8) * points.length);
    return { index: pointIndex, point: points[pointIndex] };
  });
}

function buildBoostZones(points) {
  const starts = [0.13, 0.29, 0.46, 0.63, 0.78, 0.91];
  const length = Math.max(7, Math.floor(points.length * 0.035));
  return starts.map((start, index) => {
    const startIndex = Math.floor(points.length * start);
    const endIndex = (startIndex + length) % points.length;
    return { id: `boost-${index + 1}`, startIndex, endIndex, length };
  });
}

function calculateCircuitLength(points) {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    total += Math.hypot(next.x - points[i].x, next.y - points[i].y);
  }
  return Math.round(total);
}

function getCircuit(circuitId) {
  return CIRCUITS.find((circuit) => circuit.id === circuitId) || CIRCUITS[0];
}

function createCar({ id, socketId, name, slot, isHost, circuit }) {
  const car = {
    id,
    socketId,
    kind: "human",
    name,
    color: COLORS[slot % COLORS.length],
    slot,
    isHost,
    ready: false,
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
    angle: 0,
    speed: 0,
    lap: 0,
    checkpoint: 0,
    progress: 0,
    trackPosition: 0,
    totalProgress: 0,
    position: slot + 1,
    finished: false,
    finishedAt: null,
    boostUntil: 0,
    respawnUntil: 0,
    invulnerableUntil: 0,
    input: { ...INPUT_DEFAULTS }
  };
  resetCarForRace(car, slot, circuit);
  return car;
}

function resetCarForRace(car, slot, circuit) {
  const spawn = getSpawn(circuit, slot);
  car.slot = slot;
  car.color = COLORS[slot % COLORS.length];
  car.x = spawn.x;
  car.y = spawn.y;
  car.previousX = spawn.x;
  car.previousY = spawn.y;
  car.angle = spawn.angle;
  car.speed = 0;
  car.lap = 0;
  car.checkpoint = 0;
  car.progress = 0;
  car.trackPosition = spawn.trackPosition;
  car.totalProgress = 0;
  car.position = slot + 1;
  car.finished = false;
  car.finishedAt = null;
  car.boostUntil = 0;
  car.respawnUntil = 0;
  car.invulnerableUntil = 0;
  car.input = { ...INPUT_DEFAULTS };
}

function getSpawn(circuit, slot) {
  const row = Math.floor(slot / 4);
  const col = slot % 4;
  const pointIndex = (circuit.points.length - 3 - row * 2 + circuit.points.length) % circuit.points.length;
  const point = circuit.points[pointIndex];
  const next = circuit.points[(pointIndex + 1) % circuit.points.length];
  const tangent = Math.atan2(next.y - point.y, next.x - point.x);
  const normal = tangent + Math.PI / 2;
  const lateral = (col - 1.5) * 34;
  return {
    x: point.x + Math.cos(normal) * lateral,
    y: point.y + Math.sin(normal) * lateral,
    angle: tangent,
    trackPosition: pointIndex
  };
}

function placeCarOnTrackCenter(car, circuit, trackPosition) {
  const index = ((Math.round(trackPosition) % circuit.points.length) + circuit.points.length) % circuit.points.length;
  const point = circuit.points[index];
  const next = circuit.points[(index + 1) % circuit.points.length];
  car.x = point.x;
  car.y = point.y;
  car.previousX = point.x;
  car.previousY = point.y;
  car.angle = Math.atan2(next.y - point.y, next.x - point.x);
  car.trackPosition = index;
}

function compactInput(input) {
  return {
    throttle: Boolean(input.throttle),
    brake: Boolean(input.brake),
    left: Boolean(input.left),
    right: Boolean(input.right)
  };
}

function updateCarPhysics(car, input, dt, timeMs) {
  car.previousX = car.x;
  car.previousY = car.y;
  const boosting = car.boostUntil > timeMs;
  const acceleration = boosting ? BOOST_ACCELERATION : NORMAL_ACCELERATION;
  const maxForwardSpeed = boosting ? BOOST_MAX_FORWARD_SPEED : NORMAL_MAX_FORWARD_SPEED;

  if (input.throttle) car.speed += acceleration * dt;
  if (input.brake) car.speed -= BRAKE_FORCE * dt;
  car.speed = clamp(car.speed, MAX_REVERSE_SPEED, maxForwardSpeed);
  car.speed *= Math.pow(boosting ? 0.992 : FRICTION, dt * 60);

  const movementFactor = Math.min(1, Math.abs(car.speed) / 120);
  const steering = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  car.angle += steering * TURN_RATE * movementFactor * dt * Math.sign(car.speed || 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

function constrainToTrack(car, circuit) {
  const nearest = findNearestTrackPosition(circuit, car.x, car.y);
  const maxDistance = circuit.width / 2 - CAR_RADIUS + 24;
  if (nearest.distance <= maxDistance) return;
  car.x = car.previousX;
  car.y = car.previousY;
  car.speed *= 0.38;
  car.angle += 0.06;
}

function updateProgress(car, state) {
  const nearest = findNearestTrackPosition(state.circuit, car.x, car.y);
  const trackLength = state.circuit.points.length;
  let delta = nearest.position - car.trackPosition;
  if (delta < -trackLength / 2) delta += trackLength;
  if (delta > trackLength / 2) delta -= trackLength;
  if (delta > 0) car.totalProgress += delta;

  car.trackPosition = nearest.position;
  car.lap = Math.min(TOTAL_LAPS, Math.floor(car.totalProgress / trackLength));
  car.progress = (car.totalProgress % trackLength) / trackLength;
  car.checkpoint = Math.floor(car.progress * state.circuit.checkpoints.length);
  if (car.lap >= TOTAL_LAPS) {
    car.finished = true;
    car.finishedAt = state.timeMs;
    car.speed = 0;
  }
}

function applyBoostZone(car, state) {
  if (car.speed <= 0) return;
  if (isInsideBoostZone(state.circuit, car.trackPosition)) {
    if (car.boostUntil <= state.timeMs) {
      car.speed = Math.max(car.speed, 560);
    }
    car.boostUntil = Math.max(car.boostUntil, state.timeMs + BOOST_DURATION_MS);
  }
}

function isInsideBoostZone(circuit, trackPosition) {
  const normalized = ((trackPosition % circuit.points.length) + circuit.points.length) % circuit.points.length;
  return circuit.boostZones.some((zone) => {
    if (zone.startIndex <= zone.endIndex) return normalized >= zone.startIndex && normalized <= zone.endIndex;
    return normalized >= zone.startIndex || normalized <= zone.endIndex;
  });
}

function separateCars(state) {
  const cars = state.cars || state;
  const now = state.timeMs ?? 0;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.invulnerableUntil > now || b.invulnerableUntil > now) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = CAR_RADIUS * 1.8;
      if (distance > 0 && distance < minDistance) {
        const overlap = (minDistance - distance) / 2;
        const nx = dx / distance;
        const ny = dy / distance;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        a.speed *= 0.58;
        b.speed *= 0.58;
      }
    }
  }
}

function findNearestTrackPosition(circuit, x, y) {
  let best = { distance: Number.POSITIVE_INFINITY, position: 0 };
  for (let i = 0; i < circuit.points.length; i += 1) {
    const start = circuit.points[i];
    const end = circuit.points[(i + 1) % circuit.points.length];
    const projection = projectPointToSegment(x, y, start, end);
    if (projection.distance < best.distance) best = { distance: projection.distance, position: i + projection.t };
  }
  return best;
}

function projectPointToSegment(x, y, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = clamp(((x - start.x) * dx + (y - start.y) * dy) / lengthSquared, 0, 1);
  const px = start.x + dx * t;
  const py = start.y + dy * t;
  return { t, distance: Math.hypot(x - px, y - py) };
}

function serializeCircuit(circuit) {
  return {
    id: circuit.id,
    name: circuit.name,
    country: circuit.country,
    width: circuit.width,
    length: circuit.length,
    worldWidth: circuit.worldWidth,
    worldHeight: circuit.worldHeight,
    centerX: circuit.centerX,
    centerY: circuit.centerY,
    points: circuit.points.map((point) => ({ x: round(point.x), y: round(point.y) })),
    checkpoints: circuit.checkpoints.map((checkpoint) => ({
      index: checkpoint.index,
      point: { x: round(checkpoint.point.x), y: round(checkpoint.point.y) }
    })),
    boostZones: circuit.boostZones.map((zone) => ({ ...zone }))
  };
}

function rotate(x, y, angle) {
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}

function normalizeName(nickname) {
  const value = String(nickname ?? "").trim().slice(0, 18);
  return value || "드라이버";
}

function normalizeRoomName(roomName) {
  const value = String(roomName ?? "").trim().slice(0, 24);
  return value || "새 레이스 방";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, scale = 100) {
  return Math.round(value * scale) / scale;
}
