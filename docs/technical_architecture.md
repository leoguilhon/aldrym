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
- Prisma schema with `User`, `Character`, `CharacterItem`, and `Monster` for account ownership, character spawn state, combat progression, item instances, equipment/container placement, and monster catalog data
- Shared package for API, world map, item definitions, and Tibia-inspired gameplay formulas such as experience thresholds, class-relative skill advancement, attack, defense, armor, health, mana, and food regeneration
- In-memory PvE world state for the current local-map combat slice, including the active troll spawn, corpses, and ground items

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
- On world join, the gateway sends current in-memory corpses, current in-memory ground items, the selected character's persisted equipment slots, the contents of the equipped backpack, and a derived `character:updated` summary containing skills, food state, and combat stats.
- Combat is session-based: the client sends only a targeted visible monster id or stop intent, and the server owns the auto-attack loop
- The server validates screen-range targetability, monster life state, and authenticated world join state before starting combat. Active combat continues until stopped, the target dies, the target is lost, or the monster leaves the player's screen-range target area.
- Player melee hits are still gated by adjacent range on every combat tick, while monsters retaliate through their own server-owned pursuit and attack loop.
- Attack, defense, and armor resolution now follow a Tibia-inspired structure: attack value is derived from level, active weapon skill, weapon attack, and fight stance; defense value is derived from weapon or shield defense, the corresponding defense skill, and fight stance; armor reduces the remaining damage through a random reduction range based on total equipped armor.
- Character skills are persisted per weapon family plus shielding, magic level, and fishing. Skill progression requirements are class-relative and use Tibia-inspired exponential point requirements.
- Equipment stats are server-authored through shared item definitions. Weapon `attack`, weapon or shield `defense`, shield modifiers, and armor pieces all feed the authoritative combat calculation.
- Monsters follow the nearest player within 8 SQM with server-authoritative tile movement and remain still when no player is close enough. The current troll spawn retreats when it reaches its low-health threshold.
- Defeated monsters are kept in memory as corpses, show a client respawn warning shortly before returning, respawn after their configured delay at their original spawn tile, and are not persisted to PostgreSQL
- Character experience, level-up stat changes, skill progression, and food timer changes are persisted to PostgreSQL when they change
- Defeated monsters roll server-side loot tables into in-memory corpse contents. The current local-map slice removed the old rat spawn and uses a single troll with a longer 30-second respawn.
- Corpse interaction is intent-based: the client sends only corpse ids, corpse item ids, and requested quantities, and the server validates same-tile or adjacent contact, including diagonals, before writing inventory
- Ground item interaction is intent-based: dropped items are kept in memory for the current world process, the client sends only item ids, and the server validates ownership on drop plus direct contact on pickup.
- Character inventory is persisted in PostgreSQL through `CharacterItem`; each row is an item instance located inside a container item or in an equipment slot. Root inventory may exist only as legacy migration state and is not a valid target for new inventory actions.
- Stackable items merge only when they share the same item key and container location. Non-stackable items remain separate instances.
- The current MVP treats the equipped backpack as the carried inventory, with persisted equipment slots and item-defined container capacities such as the 20-slot basic backpack.
- Food consumption is authoritative. Edible items add to a persisted food timer up to a 1,200-second cap, and a server tick regenerates health and mana over time while a character is fed.
- Player death and respawn are not implemented yet. Incoming damage currently clamps health at `1` as a temporary safeguard while the death loop is still pending.
## World Safety and Combat Controls

The shared local map contract defines protection-zone rectangles alongside terrain. The server is authoritative for zone restrictions: monsters cannot enter, acquire, follow, or damage protected players, and player combat sessions stop when the player enters a protected tile.

Combat stance, chase mode, and open-PvP preference are server-owned per online session. Follow mode uses the normal movement cooldown and collision checks; it never permits the client to choose a resulting position.
