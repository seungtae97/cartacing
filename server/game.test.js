import test from "node:test";
import assert from "node:assert/strict";
import {
  CIRCUITS,
  MAX_PARTICIPANTS,
  addHumanPlayer,
  applyPlayerInput,
  buildSnapshot,
  canStartRace,
  createInitialState,
  kickPlayer,
  rankCars,
  removeHumanPlayer,
  returnToLobby,
  respawnPlayer,
  setPlayerReady,
  startRace,
  updateGame
} from "./game.js";

test("at least five long dynamic circuits are available with preview and boost zones", () => {
  assert.ok(CIRCUITS.length >= 5);
  assert.ok(CIRCUITS.some((circuit) => circuit.name.includes("모나코")));
  assert.ok(CIRCUITS.every((circuit) => circuit.points.length >= 180));
  assert.ok(CIRCUITS.every((circuit) => circuit.length > 5200));
  assert.ok(CIRCUITS.every((circuit) => circuit.boostZones.length >= 5));
});

test("new rooms start without AI cars and remember the selected circuit", () => {
  const state = createInitialState({ roomName: "저녁 레이스", circuitId: "monza" });

  assert.equal(MAX_PARTICIPANTS, 12);
  assert.equal(state.room.name, "저녁 레이스");
  assert.equal(state.circuit.id, "monza");
  assert.equal(state.cars.length, 0);
  assert.equal(state.race.status, "lobby");
});

test("first human becomes host and the thirteenth human is rejected", () => {
  const state = createInitialState();

  for (let i = 0; i < MAX_PARTICIPANTS; i += 1) {
    const result = addHumanPlayer(state, `socket-${i}`, `드라이버 ${i}`);
    assert.equal(result.ok, true);
    assert.equal(result.car.kind, "human");
    assert.equal(result.car.isHost, i === 0);
  }

  const rejected = addHumanPlayer(state, "socket-13", "늦은 참가자");
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /가득/i);
  assert.equal(state.cars.length, 12);
});

test("ready state gates host race start", () => {
  const state = createInitialState();
  const host = addHumanPlayer(state, "host", "방장").car;
  addHumanPlayer(state, "guest", "참가자");

  assert.equal(canStartRace(state), false);
  setPlayerReady(state, "host", true);
  setPlayerReady(state, "guest", true);
  assert.equal(canStartRace(state), true);

  const started = startRace(state, "host");
  assert.equal(started.ok, true);
  assert.equal(state.race.status, "countdown");
  updateGame(state, 4000);
  assert.equal(state.race.status, "running");
  assert.equal(host.ready, true);
});

test("only the host can kick another player", () => {
  const state = createInitialState();
  addHumanPlayer(state, "host", "방장");
  addHumanPlayer(state, "guest", "참가자");

  const denied = kickPlayer(state, "guest", "host");
  assert.equal(denied.ok, false);

  const kicked = kickPlayer(state, "host", "guest");
  assert.equal(kicked.ok, true);
  assert.equal(state.cars.some((car) => car.socketId === "guest"), false);
});

test("removing the host assigns host to the next player without adding AI", () => {
  const state = createInitialState();
  addHumanPlayer(state, "host", "방장");
  const guest = addHumanPlayer(state, "guest", "참가자").car;

  removeHumanPlayer(state, "host");

  assert.equal(state.cars.length, 1);
  assert.equal(guest.isHost, true);
  assert.equal(state.cars.some((car) => car.kind === "ai"), false);
});

test("player input is compacted to boolean controls", () => {
  const state = createInitialState();
  const joined = addHumanPlayer(state, "socket-a", "민수");

  applyPlayerInput(state, "socket-a", {
    throttle: 1,
    brake: 0,
    left: true,
    right: false,
    ignored: true
  });

  assert.deepEqual(joined.car.input, {
    throttle: true,
    brake: false,
    left: true,
    right: false
  });
});

test("race movement works only after the host starts the race", () => {
  const state = createInitialState();
  const joined = addHumanPlayer(state, "socket-a", "민수");
  setPlayerReady(state, "socket-a", true);
  applyPlayerInput(state, "socket-a", { throttle: true });

  updateGame(state, 500);
  assert.equal(joined.car.speed, 0);

  startRace(state, "socket-a");
  applyPlayerInput(state, "socket-a", { throttle: true });
  updateGame(state, 3999);
  assert.equal(joined.car.speed, 0);
  updateGame(state, 500);
  assert.ok(joined.car.speed > 0);
});

test("driving backward across the start line does not add laps", () => {
  const state = createInitialState({ circuitId: "monza" });
  const joined = addHumanPlayer(state, "socket-a", "민수").car;
  setPlayerReady(state, "socket-a", true);
  startRace(state, "socket-a");
  updateGame(state, 4000);

  joined.trackPosition = 1;
  joined.totalProgress = 1;
  joined.x = state.circuit.points[state.circuit.points.length - 1].x;
  joined.y = state.circuit.points[state.circuit.points.length - 1].y;
  updateGame(state, 16);

  assert.equal(joined.lap, 0);
});

test("boost zones make a car much faster for a few seconds", () => {
  const state = createInitialState({ circuitId: "monza" });
  const car = addHumanPlayer(state, "socket-a", "민수").car;
  setPlayerReady(state, "socket-a", true);
  startRace(state, "socket-a");
  updateGame(state, 4000);

  const boost = state.circuit.boostZones[0];
  const boostIndex = (boost.startIndex + 2) % state.circuit.points.length;
  const point = state.circuit.points[boostIndex];
  const next = state.circuit.points[(boostIndex + 1) % state.circuit.points.length];
  car.x = point.x;
  car.y = point.y;
  car.angle = Math.atan2(next.y - point.y, next.x - point.x);
  car.trackPosition = boostIndex;
  car.speed = 440;
  applyPlayerInput(state, "socket-a", { throttle: true });
  updateGame(state, 100);

  assert.ok(car.boostUntil > state.timeMs);
  assert.ok(car.speed > 500);
  updateGame(state, 1000);
  assert.ok(car.boostUntil > state.timeMs);
});

test("respawn places a stuck car on the track center and locks movement for two seconds", () => {
  const state = createInitialState({ circuitId: "monza" });
  const car = addHumanPlayer(state, "socket-a", "민수").car;
  setPlayerReady(state, "socket-a", true);
  startRace(state, "socket-a");
  updateGame(state, 4000);
  car.x = 20;
  car.y = 20;
  car.speed = 200;

  const result = respawnPlayer(state, "socket-a");
  assert.equal(result.ok, true);
  assert.equal(car.speed, 0);
  assert.ok(car.respawnUntil > state.timeMs);
  assert.ok(car.invulnerableUntil > state.timeMs);

  applyPlayerInput(state, "socket-a", { throttle: true });
  updateGame(state, 1000);
  assert.equal(car.speed, 0);
  updateGame(state, 1200);
  applyPlayerInput(state, "socket-a", { throttle: true });
  updateGame(state, 300);
  assert.ok(car.speed > 0);
});

test("finished races can return to the same room lobby", () => {
  const state = createInitialState();
  const car = addHumanPlayer(state, "socket-a", "민수").car;
  setPlayerReady(state, "socket-a", true);
  startRace(state, "socket-a");
  updateGame(state, 4000);
  car.finished = true;
  updateGame(state, 16);
  assert.equal(state.race.status, "finished");

  const result = returnToLobby(state);
  assert.equal(result.ok, true);
  assert.equal(state.race.status, "lobby");
  assert.equal(car.ready, false);
  assert.equal(car.finished, false);
});

test("colliding cars are separated and slowed down", () => {
  const state = createInitialState();
  const a = addHumanPlayer(state, "a", "A").car;
  const b = addHumanPlayer(state, "b", "B").car;
  a.x = 1000;
  a.y = 650;
  a.speed = 200;
  b.x = 1005;
  b.y = 650;
  b.speed = 200;

  updateGame(state, 16);

  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 30);
  assert.ok(a.speed < 200);
  assert.ok(b.speed < 200);
});

test("rankCars sorts by finish, lap, checkpoint, and progress", () => {
  const state = createInitialState();
  state.cars = [
    { id: "behind", finished: false, lap: 0, checkpoint: 1, progress: 0.5 },
    { id: "ahead", finished: false, lap: 1, checkpoint: 0, progress: 0.1 },
    { id: "winner", finished: true, finishedAt: 1000, lap: 3, checkpoint: 0, progress: 0 },
    { id: "runner-up", finished: true, finishedAt: 1200, lap: 3, checkpoint: 0, progress: 0 }
  ];

  assert.deepEqual(
    rankCars(state).map((car) => car.id),
    ["winner", "runner-up", "ahead", "behind"]
  );
});

test("snapshot exposes Korean room and preview data without mutable input objects", () => {
  const state = createInitialState({ roomName: "한국어 방", circuitId: "suzuka" });
  const joined = addHumanPlayer(state, "socket-a", "민수");
  applyPlayerInput(state, "socket-a", { throttle: true });

  const snapshot = buildSnapshot(state);
  const car = snapshot.cars.find((entry) => entry.id === joined.car.id);

  assert.equal(snapshot.room.name, "한국어 방");
  assert.equal(snapshot.circuit.name, "스즈카");
  assert.ok(snapshot.circuit.points.length >= 180);
  assert.ok(snapshot.circuit.boostZones.length >= 5);
  assert.equal(snapshot.cars.length, 1);
  assert.equal(car.name, "민수");
  assert.equal(car.input, undefined);
  assert.equal(snapshot.race.totalLaps, 3);
});
