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

- Web app with React Router pages for login, registration, character selection, character creation, and a placeholder world-entry route
- Frontend authentication state stored in localStorage-backed React context
- NestJS server with a `/health` endpoint and REST modules for authentication and character management
- Socket.IO-ready gateway placeholder
- Prisma schema with `User` and `Character` for account ownership and spawn state
- Shared package for API and gameplay-adjacent type contracts
