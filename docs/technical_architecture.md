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

## Current Foundation

- Web app with React Router pages for login, registration, character selection, character creation, and an authenticated offline world-entry route
- Frontend authentication state stored in localStorage-backed React context
- NestJS server with a `/health` endpoint and REST modules for authentication and character management
- Socket.IO-ready gateway placeholder
- Prisma schema with `User` and `Character` for account ownership and spawn state
- Shared package for API and gameplay-adjacent type contracts

## Offline Client Prototype

- `apps/web` now mounts a local Phaser scene at `/game/:characterId`
- The page fetches the selected character through the authenticated REST API before the client is created
- The Phaser prototype uses a generated tile grid with local-only movement, collision, and camera follow
- No gameplay Socket.IO events or backend movement validation are wired yet; this step is intentionally offline-only
