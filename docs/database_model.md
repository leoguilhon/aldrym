# Database Model

## Current Scope

The initial Prisma schema is intentionally minimal and contains only two models.

## User

- Unique account identity
- Unique email
- Timestamps
- One-to-many relation to characters

## Character

- Unique character identity
- Unique name
- Basic level field
- Ownership relation to a user
- Timestamps

## Notes

- This is not the final game database design.
- Inventory, items, quests, combat state, and world persistence are intentionally deferred.
