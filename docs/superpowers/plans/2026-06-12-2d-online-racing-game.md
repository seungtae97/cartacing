# 2D Online Racing Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable browser-based 2D top-down racing game with Socket.IO multiplayer for up to 12 participants and AI-filled empty slots.

**Architecture:** A Node.js server hosts static files, owns the authoritative simulation, and broadcasts snapshots over Socket.IO. The browser client renders the race on Canvas, sends input state, and displays lobby, HUD, and results.

**Tech Stack:** Node.js, Express, Socket.IO, HTML5 Canvas, vanilla JavaScript, Node test runner.

---

## File Structure

- `package.json`: npm metadata, runtime dependencies, and scripts.
- `server/game.js`: pure game constants, state creation, physics, AI, checkpoint, ranking, collision, and snapshot logic.
- `server/game.test.js`: Node test-runner coverage for participant caps, movement, laps, and ranking helpers.
- `server/index.js`: Express static server, Socket.IO connection handling, input handling, simulation loop, and room reset events.
- `public/index.html`: browser app shell with lobby, canvas, HUD, and results panel.
- `public/styles.css`: responsive arcade racing UI.
- `public/client.js`: Socket.IO client, keyboard input, Canvas rendering, HUD updates, and join/reset flow.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `server/game.js`
- Create: `server/game.test.js`
- Create: `server/index.js`
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/client.js`

- [ ] **Step 1: Create npm project metadata**

Create `package.json` with:

```json
{
  "name": "cartacing",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node server/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.19.2",
    "socket.io": "^4.7.5"
  }
}
```

- [ ] **Step 2: Add placeholder files**

Create empty implementation files so the project layout is fixed before behavior is added.

- [ ] **Step 3: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and dependencies install without errors.

- [ ] **Step 4: Commit scaffold**

Run:

```bash
git add package.json package-lock.json server public
git commit -m "chore: scaffold racing game project"
```

## Task 2: Pure Game Simulation

**Files:**
- Modify: `server/game.js`
- Modify: `server/game.test.js`

- [ ] **Step 1: Write tests for core state and ranking**

Add tests that import from `server/game.js` and assert:

- `MAX_PARTICIPANTS` is 12.
- `createInitialState()` creates 12 cars when no humans are connected.
- `addHumanPlayer()` rejects the 13th human.
- `applyPlayerInput()` stores compact input state.
- `updateGame()` moves a car forward when throttle is active.
- `rankCars()` sorts by finish status, lap, checkpoint, and progress.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: tests fail because exported functions do not exist yet.

- [ ] **Step 3: Implement `server/game.js`**

Implement:

- Constants for participant limit, lap count, tick rate, car size, speed, friction, and track geometry.
- `createInitialState()`
- `addHumanPlayer(state, socketId, nickname)`
- `removeHumanPlayer(state, socketId)`
- `applyPlayerInput(state, socketId, input)`
- `updateGame(state, dtMs)`
- `rankCars(state)`
- `buildSnapshot(state)`
- AI input generation for non-human cars.
- Track boundary collision using inner and outer oval bounds.
- Simple car-to-car separation.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit simulation**

Run:

```bash
git add server/game.js server/game.test.js
git commit -m "feat: add racing simulation"
```

## Task 3: Multiplayer Server

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Implement Express and Socket.IO server**

Add:

- Express static hosting for `public`.
- HTTP server on `PORT` or `3000`.
- Socket.IO connection lifecycle.
- `join` event for nicknames.
- `input` event for controls.
- `resetRace` event.
- Fixed interval game loop using `TICK_RATE`.
- `snapshot`, `joined`, `joinError`, and `serverInfo` events.

- [ ] **Step 2: Run server smoke test**

Run: `npm start`

Expected: console prints the local URL and the process stays running.

- [ ] **Step 3: Commit server**

Run:

```bash
git add server/index.js
git commit -m "feat: add multiplayer server"
```

## Task 4: Browser Client And Rendering

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/client.js`

- [ ] **Step 1: Build app shell**

Create a lobby with nickname input and join button, a full browser game canvas, HUD fields for position/lap/speed/player count, and a results panel.

- [ ] **Step 2: Implement Socket.IO client flow**

Connect to the server, send `join`, track the assigned player ID, send input changes, receive snapshots, handle join errors, and request race resets.

- [ ] **Step 3: Implement controls**

Support WASD and arrow keys. Send booleans for throttle, brake, left, and right only when input changes.

- [ ] **Step 4: Implement Canvas renderer**

Draw:

- Asphalt background.
- Outer and inner track boundaries.
- Start line and checkpoint markers.
- Cars with player labels.
- Local player highlight.
- Race countdown/status text.
- Ranking sidebar data through DOM HUD.

- [ ] **Step 5: Commit client**

Run:

```bash
git add public/index.html public/styles.css public/client.js
git commit -m "feat: add racing web client"
```

## Task 5: End-To-End Verification

**Files:**
- Modify only if verification finds defects.

- [ ] **Step 1: Run automated tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Start local server**

Run: `npm start`

Expected: the game is available at `http://localhost:3000`.

- [ ] **Step 3: Browser verification**

Open `http://localhost:3000` and verify:

- A user can join with a nickname.
- The race renders without a blank canvas.
- The player car responds to controls.
- AI cars move.
- Lap, position, speed, and participant count update.
- A second browser tab can join and both clients see synchronized cars.
- The race ends with results after 3 laps.
- Reset starts a new race.

- [ ] **Step 4: Commit fixes if needed**

If defects were found, commit with a focused message such as:

```bash
git add server public
git commit -m "fix: polish racing game verification issues"
```

## Self-Review

- Spec coverage: multiplayer, 12 participant cap, AI fill, 3 laps, Canvas rendering, server-authoritative state, HUD, results, and local verification are covered.
- Placeholder scan: no `TODO` or `TBD` items are present.
- Type consistency: server functions are consistently named across tests, server, and client plan sections.
