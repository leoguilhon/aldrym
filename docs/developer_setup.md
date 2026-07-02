# Developer Setup

## Purpose

This document describes the minimum steps required to install dependencies, start the local database, run Prisma migrations, and launch the development servers for Aldrym.

## Prerequisites

- Node.js 24+
- Corepack enabled
- Docker Desktop running

## First-Time Setup

1. Install workspace dependencies:

```powershell
corepack pnpm install
```

2. Create the local server environment file if it does not exist yet:

```powershell
Copy-Item apps/server/.env.example apps/server/.env
```

3. Start PostgreSQL with Docker Compose:

```powershell
docker compose up -d
```

4. Apply the Prisma migration:

```powershell
corepack pnpm prisma:migrate
```

## Start the Project

Run the backend in one terminal:

```powershell
corepack pnpm dev:server
```

Run the frontend in another terminal:

```powershell
corepack pnpm dev:web
```

## Quick Start Command Order

```powershell
corepack pnpm install
docker compose up -d
corepack pnpm prisma:migrate
corepack pnpm dev:server
corepack pnpm dev:web
```

## Local Endpoints

- Web: `http://localhost:5173`
- Server health: `http://localhost:3000/health`

## Stop the Environment

Stop the frontend and backend with `Ctrl+C` in their terminals.

Stop PostgreSQL with:

```powershell
docker compose down
```
