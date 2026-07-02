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

- Web app with React Router pages for login, registration, character selection, character creation, and an authenticated world-entry route
- Frontend authentication state stored in localStorage-backed React context
- NestJS server with a `/health` endpoint and REST modules for authentication and character management
- Socket.IO world gateway with JWT-authenticated connections
- Prisma schema with `User` and `Character` for account ownership and spawn state
- Shared package for API, world map, and gameplay-adjacent type contracts

## World Join and Movement

- `apps/web` mounts the Phaser client at `/game/:characterId` after the selected character is verified through the authenticated REST API
- The client opens a Socket.IO connection with the JWT token in the connection auth payload
- `apps/server` authenticates sockets, verifies character ownership on `world:join`, and tracks online players in a small in-memory world state
- Movement is intent-based: the client sends directions and the server calculates the next tile using the shared map rules
- The same shared local map definition is used for spawn clamping and blocked-tile validation on both the frontend and backend
- Character position is saved to PostgreSQL only when a joined socket disconnects
