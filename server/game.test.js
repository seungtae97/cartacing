import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PARTICIPANTS,
  addHumanPlayer,
  applyPlayerInput,
  buildSnapshot,
  createInitialState,
  rankCars,
  removeHumanPlayer,
  updateGame
} from "./game.js";

test("initial state fills the race with twelve AI cars", () => {
  const state = createInitialState();

  assert.equal(MAX_PARTICIPANTS, 12);
  assert.equal(state.cars.length, 12);
  assert.equal(state.cars.filter((car) => car.kind === "ai").length, 12);
  assert.equal(state.race.totalLaps, 3);
});

test("human players occupy slots first and the thirteenth human is rejected", () => {
  const state = createInitialState();

  for (let i = 0; i < MAX_PARTICIPANTS; i += 1) {
    const result = addHumanPlayer(state, `socket-${i}`, `Driver ${i}`);
    assert.equal(result.ok, true);
    assert.equal(result.car.kind, "human");
  }

  const rejected = addHumanPlayer(state, "socket-13", "Too Late");
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /full/i);
  assert.equal(state.cars.filter((car) => car.kind === "human").length, 12);
});

test("removing a human player refills the slot with an AI car", () => {
  const state = createInitialState();
  const joined = addHumanPlayer(state, "socket-a", "Ada");

  removeHumanPlayer(state, "socket-a");

  assert.equal(joined.ok, true);
  assert.equal(state.cars.length, 12);
  assert.equal(state.cars.some((car) => car.socketId === "socket-a"), false);
  assert.equal(state.cars.filter((car) => car.kind === "ai").length, 12);
});

test("player input is compacted to boolean controls", () => {
  const state = createInitialState();
  const joined = addHumanPlayer(state, "socket-a", "Ada");

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

test("throttle input moves a human car forward", () => {
  const state = createInitialState();
  const joined = addHumanPlayer(state, "socket-a", "Ada");
  const startX = joined.car.x;
  const startY = joined.car.y;

  applyPlayerInput(state, "socket-a", { throttle: true });
  updateGame(state, 500);

  const moved = Math.hypot(joined.car.x - startX, joined.car.y - startY);
  assert.ok(moved > 1);
  assert.ok(joined.car.speed > 0);
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

test("snapshot exposes race data without mutable input objects", () => {
  const state = createInitialState();
  const joined = addHumanPlayer(state, "socket-a", "Ada");
  applyPlayerInput(state, "socket-a", { throttle: true });

  const snapshot = buildSnapshot(state);
  const car = snapshot.cars.find((entry) => entry.id === joined.car.id);

  assert.equal(snapshot.cars.length, 12);
  assert.equal(car.name, "Ada");
  assert.equal(car.input, undefined);
  assert.equal(snapshot.race.totalLaps, 3);
});
