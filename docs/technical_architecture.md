# Technical Architecture

## Monorepo Layout

- `apps/web`: React + Vite + TypeScript browser client
- `apps/server`: NestJS + Socket.IO + Prisma authoritative backend
- `packages/shared`: shared TypeScript types
- `docs`: product and architecture documentation

## Architectural Principles

- The server is authoritative for game state and multiplayer rules.
- The client is a presentation and input layer, not a trusted source of truth.
- PostgreSQL persists durable data such as accounts, characters, inventory, progression, and quest state.
- High-frequency movement should be handled in server memory and real-time transport, not written directly to PostgreSQL every step.
- Monster catalog data is stored in PostgreSQL, while live monster state can remain in memory for the current MVP.

## Current Foundation

- Web app with React Router pages for login, registration, character selection, character creation, and an authenticated world-entry route
- Frontend authentication state stored in localStorage-backed React context
- NestJS server with a `/health` endpoint and REST modules for authentication and character management
- Socket.IO world gateway with JWT-authenticated connections
- Prisma schema with `User`, `Character`, `CharacterItem`, and `Monster` for account ownership, character spawn state, simple inventory, and monster catalog data
- Shared package for API, world map, and gameplay-adjacent type contracts
- In-memory PvE monster state for the first local-map spawns based on the current monster catalog

## World Join, Movement, and Combat

- `apps/web` mounts the Phaser client at `/game/:characterId` after the selected character is verified through the authenticated REST API
- The client opens a Socket.IO connection with the JWT token in the connection auth payload
- `apps/server` authenticates sockets, verifies character ownership on `world:join`, and tracks online players in a small in-memory world state
- Movement is intent-based: the client sends directions and the server calculates the next tile using the shared map rules
- Movement pace is controlled by a shared level-based curve and enforced by the server before accepting the next tile step
- The same shared local map definition is used for spawn clamping and blocked-tile validation on both the frontend and backend
- Alive monsters occupy tiles and block player movement on the authoritative server
- Character position is saved to PostgreSQL only when a joined socket disconnects
- On world join, the gateway sends current online players and the current monster list to the client
- On world join, the gateway sends current in-memory corpses and the selected character's persisted inventory to the client
- Combat is session-based: the client sends only a targeted visible monster id or stop intent, and the server owns the auto-attack loop
- The server validates screen-range targetability, monster life state, and authenticated world join state before starting combat. Active combat continues until stopped, the target dies, the target is lost, or the monster leaves the player's screen-range target area.
- Player damage is still gated by adjacent melee range on every combat tick.
- Player damage is temporarily resolved with an original 8 to 16 flat melee roll, while monster damage is intentionally disabled until defensive stats and death rules exist
- Monsters follow the nearest player within 8 SQM with server-authoritative tile movement and remain still when no player is close enough
- Defeated monsters are kept in memory as corpses, show a client respawn warning shortly before returning, respawn after their configured delay at their original spawn tile, and are not persisted to PostgreSQL
- Character experience and level-up stat changes are persisted to PostgreSQL when a monster defeat grants progression
- Defeated monsters roll original server-side loot tables into in-memory corpse contents
- Corpse interaction is intent-based: the client sends only corpse ids, corpse item ids, and requested quantities, and the server validates same-tile or adjacent contact, including diagonals, before writing inventory
- Character inventory is persisted in PostgreSQL through `CharacterItem`; stackable items merge by character and item key, while non-stackable items create separate rows. The current MVP enforces a 10-row slot limit before creating a new inventory row.
