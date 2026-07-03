# Event Contracts

This document defines the first multiplayer world events used by the browser client and authoritative server.

## Client to Server

- `world:join`
  - Payload: `WorldJoinRequest`
  - Shape: `{ characterId: string }`
  - Purpose: Ask the server to join the single shared world with a character owned by the authenticated account.
- `player:move`
  - Payload: `PlayerMoveRequest`
  - Shape: `{ direction: "up" | "down" | "left" | "right" | "up-left" | "up-right" | "down-left" | "down-right" }`
  - Purpose: Send movement intent only. The server computes the next position and validates collision.
- `combat:attack`
  - Payload: `AttackMonsterRequest`
  - Shape: `{ monsterId: string }`
  - Purpose: Select a specific visible monster for auto-attack, or stop if the same monster is already targeted. The server validates authentication, world join state, target existence, target life state, and screen-range targetability. Damage is still applied only from adjacent melee range.
- `combat:stop`
  - Payload: `StopCombatRequest`
  - Shape: `{ monsterId?: string }`
  - Purpose: Stop the current auto-attack session.

## Server to Client

- `world:joined`
  - Payload: `WorldJoinedEvent`
  - Shape: `{ player: WorldPlayer }`
  - Purpose: Confirm that the authenticated socket joined the world successfully.
- `world:players`
  - Payload: `WorldPlayersEvent`
  - Shape: `{ players: WorldPlayer[] }`
  - Purpose: Send the current online player list after a successful join.
- `world:monsters`
  - Payload: `WorldMonstersEvent`
  - Shape: `{ monsters: WorldMonster[] }`
  - Purpose: Send the current in-memory monster list after a successful join, including alive and defeated monsters.
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
- `monster:damaged`
  - Payload: `MonsterDamagedEvent`
  - Shape: `{ monsterId: string; health: number; maxHealth: number; damage: number }`
  - Purpose: Broadcast server-authoritative damage and updated monster health.
- `monster:died`
  - Payload: `MonsterDiedEvent`
  - Shape: `{ monsterId: string; monster: WorldMonster; experienceReward: number }`
  - Purpose: Broadcast that a monster was defeated and should render as a corpse until respawn.
- `monster:moved`
  - Payload: `MonsterMovedEvent`
  - Shape: `{ monster: WorldMonster }`
  - Purpose: Broadcast server-authoritative monster movement while a monster follows a nearby player.
- `monster:respawning`
  - Payload: `MonsterRespawningEvent`
  - Shape: `{ monsterId: string; x: number; y: number; z: number; respawnDueAt: number }`
  - Purpose: Broadcast that a defeated monster is about to return at its spawn tile.
- `monster:respawned`
  - Payload: `MonsterRespawnedEvent`
  - Shape: `{ monster: WorldMonster }`
  - Purpose: Broadcast that a defeated monster returned at its original spawn position.
- `character:experience-updated`
  - Payload: `CharacterExperienceUpdatedEvent`
  - Shape: `{ characterId: string; experience: number; gainedExperience: number; level: number; health: number; maxHealth: number; mana: number; maxMana: number }`
  - Purpose: Send the attacking player updated persisted progression after a monster defeat.
- `character:level-up`
  - Payload: `CharacterLevelUpEvent`
  - Shape: `{ characterId: string; level: number; health: number; maxHealth: number; mana: number; maxMana: number }`
  - Purpose: Notify the attacking player that a level threshold was reached and restored stats were persisted.
- `character:stats-updated`
  - Payload: `CharacterStatsUpdatedEvent`
  - Shape: `{ characterId: string; health: number; maxHealth: number; mana: number; maxMana: number }`
  - Purpose: Send updated character combat stats after a monster hit.
- `combat:started`
  - Payload: `CombatStartedEvent`
  - Shape: `{ monsterId: string }`
  - Purpose: Confirm that a server-side auto-attack session started.
- `combat:stopped`
  - Payload: `CombatStoppedEvent`
  - Shape: `{ monsterId?: string; reason: "manual" | "target_dead" | "target_lost" | "out_of_range" | "disconnected" }`
  - Purpose: Confirm that a server-side auto-attack session stopped.
- `combat:error`
  - Payload: `CombatErrorEvent`
  - Shape: `{ message: string; code?: string }`
  - Purpose: Report combat-specific errors such as missing world join, dead target, or target out of range.
- `world:error`
  - Payload: `WorldErrorEvent`
  - Shape: `{ message: string; code?: string }`
  - Purpose: Report join or protocol errors such as unauthenticated access or invalid movement requests.

## Notes

- Socket connections are authenticated with the same JWT token used by the REST API.
- The server keeps live world positions and monster state in memory.
- Character position is persisted only when a joined socket disconnects, not on every movement step.
- Player movement is level-paced through a shared speed curve. Level 1 waits 700ms per cardinal tile, each level reduces that by 20ms, diagonal movement waits 40% longer, and the server enforces a 350ms minimum cooldown before the diagonal multiplier.
- Player combat damage is a temporary original MVP roll of 8 to 16 melee damage. Monster damage is intentionally disabled for now. The client never sends damage values.
- Auto-attack sessions are owned by the server and continue until stopped manually, the target dies, the target is lost, or the player leaves the 8 SQM pursuit range.
- Monster pursuit is server-authoritative and proximity-based: alive monsters move toward the nearest player within 8 SQM and remain still when no player is in that range.
- Alive monsters block player movement and cannot be walked through.
- Defeated monsters stay in memory as corpses. The client renders a respawn warning shortly before `respawnDueAt` and removes the warning when the monster respawns.
- Monsters are not persisted to PostgreSQL yet. Character experience, level, health, max health, mana, and max mana are persisted when progression changes.
