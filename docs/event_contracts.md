# Event Contracts

This document defines the first multiplayer world events used by the browser client and authoritative server.

## Client to Server

- `world:join`
  - Payload: `WorldJoinRequest`
  - Shape: `{ characterId: string }`
  - Purpose: Ask the server to join the single shared world with a character owned by the authenticated account.
- `player:move`
  - Payload: `PlayerMoveRequest`
  - Shape: `{ direction: "up" | "down" | "left" | "right" }`
  - Purpose: Send movement intent only. The server computes the next position and validates collision.

## Server to Client

- `world:joined`
  - Payload: `WorldJoinedEvent`
  - Shape: `{ player: WorldPlayer }`
  - Purpose: Confirm that the authenticated socket joined the world successfully.
- `world:players`
  - Payload: `WorldPlayersEvent`
  - Shape: `{ players: WorldPlayer[] }`
  - Purpose: Send the current online player list after a successful join.
- `player:joined`
  - Payload: `PlayerJoinedEvent`
  - Shape: `{ player: WorldPlayer }`
  - Purpose: Broadcast a newly joined player to everyone else already online.
- `player:moved`
  - Payload: `PlayerMovedEvent`
  - Shape: `{ player: WorldPlayer }`
  - Purpose: Broadcast authoritative movement results to all connected clients, including the moving player.
- `player:left`
  - Payload: `PlayerLeftEvent`
  - Shape: `{ characterId: string }`
  - Purpose: Remove a disconnected player from other clients.
- `world:error`
  - Payload: `WorldErrorEvent`
  - Shape: `{ message: string; code?: string }`
  - Purpose: Report join or protocol errors such as unauthenticated access or invalid movement requests.

## Notes

- Socket connections are authenticated with the same JWT token used by the REST API.
- The server keeps live world positions in memory.
- Character position is persisted only when a joined socket disconnects, not on every movement step.
