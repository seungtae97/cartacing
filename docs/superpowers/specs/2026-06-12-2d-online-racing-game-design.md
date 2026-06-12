# 2D Online Racing Game Design

## Goal

Build a browser-based 2D top-down racing game that supports up to 12 participants in one race. The first playable version should make it easy to open the game locally, join a room, race against other connected players, and fill empty slots with AI cars.

## Recommended Approach

Use a Node.js server with Socket.IO for real-time multiplayer and an HTML5 Canvas client for rendering and controls.

This approach keeps the project small enough for a first complete version while still supporting real online play. The server owns the race state, receives player inputs, updates car physics, tracks laps, and broadcasts snapshots to clients. The browser client handles input, rendering, HUD, and basic lobby flow.

## Core Experience

Players open the web game, enter a nickname, and join a race room. Up to 12 human players can participate. If fewer than 12 humans are connected, AI cars fill the remaining slots so the race still feels populated.

The game uses a top-down camera. Cars accelerate, brake, steer, and collide with track boundaries. Each race is 3 laps. During the race, players see their lap, position, speed, and connected player count. When racers finish, the game shows a result table.

## Architecture

### Server

The server is responsible for:

- Hosting the web client.
- Accepting Socket.IO connections.
- Creating and maintaining one default race room.
- Assigning player IDs, nicknames, colors, and spawn positions.
- Receiving compact input state from each client.
- Running the authoritative game loop.
- Simulating human and AI cars.
- Detecting checkpoint and lap progress.
- Broadcasting world snapshots to clients.
- Resetting the race when requested or when enough players are ready.

### Client

The client is responsible for:

- Showing a join screen.
- Capturing keyboard input.
- Sending input state to the server.
- Rendering the track, cars, labels, HUD, countdown, and results.
- Interpolating received state enough to look smooth.
- Showing connection and race status.

## Game Rules

- Maximum race participants: 12.
- Race length: 3 laps.
- Controls: arrow keys or WASD.
- Track: one closed-loop top-down circuit in the first version.
- Human players occupy slots first.
- AI cars occupy remaining slots.
- A race can run with 1 to 12 connected human players.
- Finish order is determined by completed laps, checkpoint progress, and distance along the current segment.

## Physics

The first version uses simple arcade physics:

- Acceleration increases forward speed.
- Brake/reverse reduces or reverses speed.
- Steering rotates the car more strongly while moving.
- Friction gradually slows cars.
- Track wall collision pushes cars back and reduces speed.
- Vehicle-to-vehicle collision uses simple separation and mild speed dampening.

This is intentionally arcade-like rather than realistic.

## Data Flow

1. Client connects with Socket.IO.
2. Client sends `join` with nickname.
3. Server assigns player state and emits the current room snapshot.
4. Client sends `input` messages when controls change.
5. Server updates the simulation on a fixed interval.
6. Server broadcasts `snapshot` messages with car positions, race state, and results.
7. Client renders the newest received state.

## Error Handling

- If a client disconnects, the server removes that human car and allows an AI car to refill the slot.
- If a nickname is empty, the client generates a default name.
- If the room is full, the server rejects the join with a clear message.
- If the socket disconnects, the client returns to a reconnecting state.

## Testing And Verification

Manual verification for the first version:

- Install dependencies successfully.
- Start the server locally.
- Open the game in a browser.
- Join with one player and race against AI cars.
- Open multiple browser tabs and confirm multiplayer synchronization.
- Confirm the race caps at 12 participants.
- Confirm lap counting, ranking, finish results, and reset behavior.

Automated tests can be added around pure simulation helpers once the game loop is separated from Socket.IO transport.

## Initial File Layout

- `package.json`: scripts and dependencies.
- `server/index.js`: HTTP server, Socket.IO setup, authoritative loop.
- `server/game.js`: game constants, simulation, lap logic, AI, collision helpers.
- `public/index.html`: app shell.
- `public/styles.css`: game UI styling.
- `public/client.js`: rendering, input, socket events.

## Out Of Scope For First Version

- Account system.
- Persistent leaderboards.
- Multiple tracks.
- Mobile touch controls.
- Matchmaking.
- Anti-cheat beyond server-authoritative state.
- Production deployment configuration.
