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

- Web app placeholder without Phaser scene or canvas mounting yet
- NestJS server with a `/health` endpoint
- Socket.IO-ready gateway placeholder
- Prisma schema with only `User` and `Character`
- Shared package for cross-project type contracts

