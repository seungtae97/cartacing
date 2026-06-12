export const MAX_PARTICIPANTS = 12;
export const TOTAL_LAPS = 3;
export const TICK_RATE = 30;

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1300;
const POINT_COUNT = 96;
const CAR_RADIUS = 18;
const MAX_FORWARD_SPEED = 450;
const MAX_REVERSE_SPEED = -150;
const ACCELERATION = 320;
const BRAKE_FORCE = 430;
const FRICTION = 0.986;
const TURN_RATE = 3.35;

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
    width: 118,
    baseRadiusX: 610,
    baseRadiusY: 385,
    harmonics: [
      [2, 0.13, 0.4],
      [3, -0.09, 1.9],
      [5, 0.06, -0.7]
    ],
    rotation: -0.42
  },
  {
    id: "silverstone",
    name: "실버스톤",
    country: "영국",
    width: 140,
    baseRadiusX: 700,
    baseRadiusY: 360,
    harmonics: [
      [2, -0.08, 0.1],
      [4, 0.12, 1.2],
      [6, -0.04, 2.6]
    ],
    rotation: 0.16
  },
  {
    id: "suzuka",
    name: "스즈카",
    country: "일본",
    width: 128,
    figureEight: true,
    baseRadiusX: 640,
    baseRadiusY: 340,
    harmonics: [
      [2, 0.16, 0.7],
      [3, 0.08, -1.1],
      [5, -0.05, 2.3]
    ],
    rotation: -0.08
  },
  {
    id: "spa",
    name: "스파",
    country: "벨기에",
    width: 150,
    baseRadiusX: 760,
    baseRadiusY: 395,
    harmonics: [
      [2, 0.18, -0.8],
      [3, -0.12, 1.1],
      [4, 0.07, 2.4]
    ],
    rotation: 0.34
  },
  {
    id: "monza",
    name: "몬차",
    country: "이탈리아",
    width: 152,
    baseRadiusX: 730,
    baseRadiusY: 330,
    harmonics: [
      [2, -0.05, 0.2],
      [3, 0.07, -1.7],
      [6, 0.04, 0.5]
    ],
    rotation: -0.18
  },
  {
    id: "interlagos",
    name: "인터라고스",
    country: "브라질",
    width: 132,
    baseRadiusX: 660,
    baseRadiusY: 365,
    harmonics: [
      [2, 0.1, 2.1],
      [3, 0.12, -0.6],
      [5, -0.08, 1.5]
    ],
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
      startedAt: null,
      finishedAt: null
    },
    cars: []
  };
}

export function addHumanPlayer(state, socketId, nickname) {
  const existing = state.cars.find((car) => car.socketId === socketId);
  if (existing) {
    return { ok: true, car: existing };
  }

  if (state.cars.length >= MAX_PARTICIPANTS) {
    return { ok: false, error: "방이 가득 찼습니다." };
  }

  if (state.race.status !== "lobby") {
    return { ok: false, error: "이미 시작된 방입니다." };
  }

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
  if (removedIndex === -1) {
    return;
  }

  const wasHost = state.cars[removedIndex].isHost;
  state.cars.splice(removedIndex, 1);
  state.cars.forEach((car, index) => {
    car.slot = index;
    car.color = COLORS[index % COLORS.length];
    car.position = index + 1;
    car.isHost = wasHost && index === 0 ? true : car.isHost && !wasHost;
  });

  if (state.cars.length > 0 && !state.cars.some((car) => car.isHost)) {
    state.cars[0].isHost = true;
  }
}

export function setPlayerReady(state, socketId, ready) {
  const car = state.cars.find((entry) => entry.socketId === socketId);
  if (!car || state.race.status !== "lobby") {
    return { ok: false, error: "준비 상태를 바꿀 수 없습니다." };
  }
  car.ready = Boolean(ready);
  return { ok: true, car };
}

export function canStartRace(state) {
  return state.race.status === "lobby" && state.cars.length > 0 && state.cars.every((car) => car.ready);
}

export function startRace(state, socketId) {
  const host = state.cars.find((car) => car.socketId === socketId && car.isHost);
  if (!host) {
    return { ok: false, error: "방장만 게임을 시작할 수 있습니다." };
  }
  if (!canStartRace(state)) {
    return { ok: false, error: "모든 참가자가 준비해야 합니다." };
  }

  state.timeMs = 0;
  state.race.status = "running";
  state.race.startedAt = Date.now();
  state.race.finishedAt = null;
  state.cars.forEach((car, index) => resetCarForRace(car, index, state.circuit));
  return { ok: true };
}

export function kickPlayer(state, hostSocketId, targetSocketId) {
  const host = state.cars.find((car) => car.socketId === hostSocketId && car.isHost);
  if (!host) {
    return { ok: false, error: "방장만 강퇴할 수 있습니다." };
  }
  if (hostSocketId === targetSocketId) {
    return { ok: false, error: "자기 자신은 강퇴할 수 없습니다." };
  }
  const target = state.cars.find((car) => car.socketId === targetSocketId);
  if (!target) {
    return { ok: false, error: "대상을 찾을 수 없습니다." };
  }
  removeHumanPlayer(state, targetSocketId);
  return { ok: true, kicked: target };
}

export function applyPlayerInput(state, socketId, input = {}) {
  const car = state.cars.find((entry) => entry.socketId === socketId);
  if (!car) {
    return;
  }
  car.input = compactInput(input);
}

export function updateGame(state, dtMs) {
  separateCars(state.cars);

  if (state.race.status !== "running") {
    return;
  }

  const dt = Math.min(dtMs, 100) / 1000;
  state.timeMs += dtMs;

  for (const car of state.cars) {
    if (car.finished) {
      continue;
    }

    updateCarPhysics(car, car.input, dt);
    constrainToTrack(car, state.circuit);
    updateProgress(car, state);
  }

  separateCars(state.cars);
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
      if (a.finished && b.finished) {
        return a.finishedAt - b.finishedAt;
      }
      return a.finished ? -1 : 1;
    }

    if (a.lap !== b.lap) {
      return b.lap - a.lap;
    }

    if (a.checkpoint !== b.checkpoint) {
      return b.checkpoint - a.checkpoint;
    }

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
      finished: car.finished,
      finishedAt: car.finishedAt
    }))
  };
}

export function listCircuitSummaries() {
  return CIRCUITS.map((circuit) => ({
    id: circuit.id,
    name: circuit.name,
    country: circuit.country
  }));
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
      localX += Math.sin(angle * 2) * 190;
      localY += Math.sin(angle) * Math.cos(angle) * 145;
    }

    const rotated = rotate(localX, localY, definition.rotation);
    points.push({
      x: WORLD_WIDTH / 2 + rotated.x,
      y: WORLD_HEIGHT / 2 + rotated.y
    });
  }

  return {
    ...definition,
    centerX: WORLD_WIDTH / 2,
    centerY: WORLD_HEIGHT / 2,
    points,
    checkpoints: buildCheckpoints(points)
  };
}

function buildCheckpoints(points) {
  return Array.from({ length: 8 }, (_unused, index) => {
    const pointIndex = Math.floor((index / 8) * points.length);
    return {
      index: pointIndex,
      point: points[pointIndex]
    };
  });
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
    position: slot + 1,
    finished: false,
    finishedAt: null,
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
  car.trackPosition = 0;
  car.position = slot + 1;
  car.finished = false;
  car.finishedAt = null;
  car.input = { ...INPUT_DEFAULTS };
}

function getSpawn(circuit, slot) {
  const row = Math.floor(slot / 4);
  const col = slot % 4;
  const pointIndex = (circuit.points.length - 2 - row * 2 + circuit.points.length) % circuit.points.length;
  const point = circuit.points[pointIndex];
  const next = circuit.points[(pointIndex + 1) % circuit.points.length];
  const tangent = Math.atan2(next.y - point.y, next.x - point.x);
  const normal = tangent + Math.PI / 2;
  const lateral = (col - 1.5) * 34;
  return {
    x: point.x + Math.cos(normal) * lateral,
    y: point.y + Math.sin(normal) * lateral,
    angle: tangent
  };
}

function compactInput(input) {
  return {
    throttle: Boolean(input.throttle),
    brake: Boolean(input.brake),
    left: Boolean(input.left),
    right: Boolean(input.right)
  };
}

function updateCarPhysics(car, input, dt) {
  car.previousX = car.x;
  car.previousY = car.y;

  if (input.throttle) {
    car.speed += ACCELERATION * dt;
  }
  if (input.brake) {
    car.speed -= BRAKE_FORCE * dt;
  }

  car.speed = clamp(car.speed, MAX_REVERSE_SPEED, MAX_FORWARD_SPEED);
  car.speed *= Math.pow(FRICTION, dt * 60);

  const movementFactor = Math.min(1, Math.abs(car.speed) / 120);
  const steering = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  car.angle += steering * TURN_RATE * movementFactor * dt * Math.sign(car.speed || 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

function constrainToTrack(car, circuit) {
  const nearest = findNearestTrackPosition(circuit, car.x, car.y);
  const maxDistance = circuit.width / 2 - CAR_RADIUS + 24;
  if (nearest.distance <= maxDistance) {
    return;
  }

  car.x = car.previousX;
  car.y = car.previousY;
  car.speed *= 0.38;
  car.angle += 0.06;
}

function updateProgress(car, state) {
  const nearest = findNearestTrackPosition(state.circuit, car.x, car.y);
  const nextPosition = nearest.position;
  const checkpoint = Math.floor((nextPosition / state.circuit.points.length) * state.circuit.checkpoints.length);

  if (car.trackPosition > state.circuit.points.length * 0.82 && nextPosition < state.circuit.points.length * 0.18) {
    car.lap += 1;
    if (car.lap >= TOTAL_LAPS) {
      car.finished = true;
      car.finishedAt = state.timeMs;
      car.speed = 0;
    }
  }

  car.trackPosition = nextPosition;
  car.checkpoint = checkpoint;
  car.progress = nextPosition / state.circuit.points.length;
}

function separateCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
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
  let best = {
    distance: Number.POSITIVE_INFINITY,
    position: 0
  };

  for (let i = 0; i < circuit.points.length; i += 1) {
    const start = circuit.points[i];
    const end = circuit.points[(i + 1) % circuit.points.length];
    const projection = projectPointToSegment(x, y, start, end);
    if (projection.distance < best.distance) {
      best = {
        distance: projection.distance,
        position: i + projection.t
      };
    }
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
  return {
    t,
    distance: Math.hypot(x - px, y - py)
  };
}

function serializeCircuit(circuit) {
  return {
    id: circuit.id,
    name: circuit.name,
    country: circuit.country,
    width: circuit.width,
    centerX: circuit.centerX,
    centerY: circuit.centerY,
    points: circuit.points.map((point) => ({ x: round(point.x), y: round(point.y) })),
    checkpoints: circuit.checkpoints.map((checkpoint) => ({
      index: checkpoint.index,
      point: { x: round(checkpoint.point.x), y: round(checkpoint.point.y) }
    }))
  };
}

function rotate(x, y, angle) {
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle)
  };
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
