export const MAX_PARTICIPANTS = 12;
export const TOTAL_LAPS = 3;
export const TICK_RATE = 30;

const TRACK = {
  centerX: 1000,
  centerY: 650,
  outerRadiusX: 820,
  outerRadiusY: 470,
  innerRadiusX: 370,
  innerRadiusY: 190
};

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

const INPUT_DEFAULTS = Object.freeze({
  throttle: false,
  brake: false,
  left: false,
  right: false
});

const MAX_FORWARD_SPEED = 430;
const MAX_REVERSE_SPEED = -160;
const ACCELERATION = 300;
const BRAKE_FORCE = 410;
const FRICTION = 0.985;
const TURN_RATE = 3.2;
const CAR_RADIUS = 18;
const CHECKPOINTS = 8;

let nextStateId = 1;

export function createInitialState() {
  const state = {
    id: `race-${nextStateId++}`,
    timeMs: 0,
    race: {
      status: "running",
      totalLaps: TOTAL_LAPS,
      startedAt: Date.now(),
      finishedAt: null
    },
    cars: []
  };

  refillAiCars(state);
  return state;
}

export function addHumanPlayer(state, socketId, nickname) {
  const existing = state.cars.find((car) => car.socketId === socketId);
  if (existing) {
    return { ok: true, car: existing };
  }

  const aiSlot = state.cars.find((car) => car.kind === "ai");
  if (!aiSlot && state.cars.filter((car) => car.kind === "human").length >= MAX_PARTICIPANTS) {
    return { ok: false, error: "Race room is full." };
  }

  const slot = aiSlot ? state.cars.indexOf(aiSlot) : state.cars.length;
  const car = createCar({
    id: `human-${socketId}`,
    socketId,
    kind: "human",
    name: normalizeName(nickname),
    slot
  });

  if (aiSlot) {
    state.cars[slot] = car;
  } else {
    state.cars.push(car);
  }

  return { ok: true, car };
}

export function removeHumanPlayer(state, socketId) {
  const index = state.cars.findIndex((car) => car.socketId === socketId);
  if (index === -1) {
    return;
  }

  state.cars[index] = createCar({
    id: `ai-${index + 1}`,
    kind: "ai",
    name: `CPU ${index + 1}`,
    slot: index
  });
}

export function applyPlayerInput(state, socketId, input = {}) {
  const car = state.cars.find((entry) => entry.socketId === socketId);
  if (!car || car.kind !== "human") {
    return;
  }

  car.input = compactInput(input);
}

export function updateGame(state, dtMs) {
  const dt = Math.min(dtMs, 100) / 1000;
  state.timeMs += dtMs;

  for (const car of state.cars) {
    if (car.finished) {
      continue;
    }

    const input = car.kind === "ai" ? getAiInput(car) : car.input;
    updateCarPhysics(car, input, dt);
    constrainToTrack(car);
    updateProgress(car, state);
  }

  separateCars(state.cars);
  state.cars.forEach((car, index) => {
    car.position = index + 1;
  });

  rankCars(state).forEach((car, index) => {
    car.position = index + 1;
  });

  if (state.cars.every((car) => car.finished) && state.race.status !== "finished") {
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
    track: TRACK,
    race: { ...state.race },
    cars: rankCars(state).map((car) => ({
      id: car.id,
      socketId: car.socketId,
      kind: car.kind,
      name: car.name,
      color: car.color,
      x: Math.round(car.x * 100) / 100,
      y: Math.round(car.y * 100) / 100,
      angle: Math.round(car.angle * 1000) / 1000,
      speed: Math.round(car.speed),
      lap: car.lap,
      checkpoint: car.checkpoint,
      progress: Math.round(car.progress * 1000) / 1000,
      position: car.position,
      finished: car.finished,
      finishedAt: car.finishedAt
    }))
  };
}

function createCar({ id, socketId = null, kind, name, slot }) {
  const spawn = getSpawn(slot);
  return {
    id,
    socketId,
    kind,
    name,
    color: COLORS[slot % COLORS.length],
    slot,
    x: spawn.x,
    y: spawn.y,
    previousX: spawn.x,
    previousY: spawn.y,
    angle: spawn.angle,
    speed: 0,
    lap: 0,
    checkpoint: 0,
    progress: 0,
    position: slot + 1,
    finished: false,
    finishedAt: null,
    input: { ...INPUT_DEFAULTS }
  };
}

function getSpawn(slot) {
  const row = Math.floor(slot / 4);
  const col = slot % 4;
  return {
    x: TRACK.centerX - 88 + col * 58,
    y: TRACK.centerY + TRACK.outerRadiusY - 72 - row * 48,
    angle: -Math.PI / 2
  };
}

function refillAiCars(state) {
  for (let slot = 0; slot < MAX_PARTICIPANTS; slot += 1) {
    if (!state.cars[slot]) {
      state.cars[slot] = createCar({
        id: `ai-${slot + 1}`,
        kind: "ai",
        name: `CPU ${slot + 1}`,
        slot
      });
    }
  }
}

function compactInput(input) {
  return {
    throttle: Boolean(input.throttle),
    brake: Boolean(input.brake),
    left: Boolean(input.left),
    right: Boolean(input.right)
  };
}

function normalizeName(nickname) {
  const value = String(nickname ?? "").trim().slice(0, 18);
  return value || "Driver";
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

function getAiInput(car) {
  const targetAngle = Math.atan2(car.y - TRACK.centerY, car.x - TRACK.centerX) + Math.PI / 2;
  let diff = normalizeAngle(targetAngle - car.angle);

  return {
    throttle: true,
    brake: false,
    left: diff < -0.08,
    right: diff > 0.08
  };
}

function constrainToTrack(car) {
  const outer = ellipseValue(car.x, car.y, TRACK.outerRadiusX - CAR_RADIUS, TRACK.outerRadiusY - CAR_RADIUS);
  const inner = ellipseValue(car.x, car.y, TRACK.innerRadiusX + CAR_RADIUS, TRACK.innerRadiusY + CAR_RADIUS);

  if (outer > 1 || inner < 1) {
    car.x = car.previousX;
    car.y = car.previousY;
    car.speed *= -0.28;
    car.angle += 0.08;
  }
}

function updateProgress(car, state) {
  const angle = normalizePositiveAngle(Math.atan2(car.y - TRACK.centerY, car.x - TRACK.centerX) + Math.PI / 2);
  const checkpoint = Math.floor((angle / (Math.PI * 2)) * CHECKPOINTS);
  const progress = angle / (Math.PI * 2);

  if (checkpoint === (car.checkpoint + 1) % CHECKPOINTS) {
    car.checkpoint = checkpoint;
    if (checkpoint === 0) {
      car.lap += 1;
      if (car.lap >= TOTAL_LAPS) {
        car.finished = true;
        car.finishedAt = state.timeMs;
        car.speed = 0;
      }
    }
  } else if (checkpoint > car.checkpoint) {
    car.checkpoint = checkpoint;
  }

  car.progress = progress;
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
        a.speed *= 0.94;
        b.speed *= 0.94;
      }
    }
  }
}

function ellipseValue(x, y, radiusX, radiusY) {
  const dx = (x - TRACK.centerX) / radiusX;
  const dy = (y - TRACK.centerY) / radiusY;
  return dx * dx + dy * dy;
}

function normalizeAngle(angle) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function normalizePositiveAngle(angle) {
  let result = angle % (Math.PI * 2);
  if (result < 0) {
    result += Math.PI * 2;
  }
  return result;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
