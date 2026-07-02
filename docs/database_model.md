# Database Model

## Current Scope

The current Prisma schema intentionally covers only account authentication and basic character ownership. It contains two models.

## User

- Unique account identity
- Unique email
- Password hash for local authentication
- Timestamps
- One-to-many relation to characters

### User Fields

- `id`
- `email`
- `passwordHash`
- `createdAt`
- `updatedAt`

## Character

- Unique character identity
- Unique name
- Ownership relation to a user
- Basic progression and spawn state
- Timestamps

### Character Fields

- `id`
- `userId`
- `name`
- `gender`
- `level`
- `experience`
- `health`
- `maxHealth`
- `mana`
- `maxMana`
- `x`
- `y`
- `z`
- `createdAt`
- `updatedAt`

## Defaults

- New characters start at level `1`
- New characters start with `0` experience
- New characters start with `100 / 100` health
- New characters start with `50 / 50` mana
- New characters start at position `x=100`, `y=100`, `z=0`

## Constraints

- A user can own multiple characters
- User emails are unique
- Character names are unique
- Character names must be 3 to 20 characters long and contain only letters and spaces
- Character gender must be either `male` or `female`

## Notes

- This is not the final game database design.
- Authentication currently uses local email and password credentials.
- Inventory, items, quests, combat state, and world persistence are intentionally deferred.
