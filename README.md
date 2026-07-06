# Aldrym

Aldrym is an original 2D browser-based old-school MMORPG foundation. This repository captures the technical starting point for a browser game inspired by the pacing and danger of classic Tibia-like MMORPGs while keeping all concrete creative content original.

## Stack

- React
- Vite
- TypeScript
- Phaser
- Node.js
- NestJS
- Socket.IO
- PostgreSQL
- Prisma
- pnpm workspaces

## Folder Structure

```text
aldrym/
  apps/
    server/   # NestJS + Socket.IO + Prisma
    web/      # React + Vite + TypeScript auth and character management client
  packages/
    shared/   # Shared TypeScript types
  docs/
    database_model.md
    event_contracts.md
    game_design.md
    originality_copyright.md
    roadmap.md
    technical_architecture.md
  AGENTS.md
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
  README.md
```

## Local Setup

For a dedicated developer startup guide, see [docs/developer_setup.md](C:/infnet/aldrym/docs/developer_setup.md:1).

1. Enable Corepack if needed:

```powershell
corepack enable
```

2. Install workspace dependencies:

```powershell
corepack pnpm install
```

3. Create the server environment file:

```powershell
Copy-Item apps/server/.env.example apps/server/.env
```

4. Create the web environment file:

```powershell
Copy-Item apps/web/.env.example apps/web/.env
```

5. Start PostgreSQL:

```powershell
docker compose up -d
```

6. Run the initial Prisma migration:

```powershell
corepack pnpm prisma:migrate
```

7. Start the server:

```powershell
corepack pnpm dev:server
```

The development server uses port `41973` by default. If a stale local server is already listening on that port, `dev:server` stops it before starting the new process.

8. Start the web app in another terminal:

```powershell
corepack pnpm dev:web
```

The default frontend API configuration is:

```powershell
VITE_API_BASE_URL="http://localhost:41973"
```

## Useful Commands

```powershell
corepack pnpm install
corepack pnpm build
corepack pnpm typecheck
corepack pnpm prisma:generate
corepack pnpm prisma:migrate
corepack pnpm dev:server
corepack pnpm dev:web
docker compose up -d
docker compose down
```

## Current Scope

The current project already includes a playable local-map vertical slice with a Phaser game canvas, server-authoritative movement, a single-troll PvE loop, corpse loot, backpack and equipment management, Tibia-inspired skill and combat calculations, and food-based regeneration. Spells, player death, PvP, NPCs, quests, and broader world content are still pending.
