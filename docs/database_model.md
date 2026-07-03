# Database Model

## Current Scope

The current Prisma schema covers account authentication, basic character ownership, the monster catalog, and simple persistent character inventory.

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

## CharacterItem

- Unique inventory item row
- Ownership relation to a character
- Server-owned item key
- Quantity for stackable or repeated items
- Timestamps

### CharacterItem Fields

- `id`
- `characterId`
- `itemKey`
- `quantity`
- `createdAt`
- `updatedAt`

## Monster

- Static monster catalog row
- Server-owned monster identity and balance values
- Timestamps

### Monster Fields

- `id`
- `name`
- `level`
- `maxHealth`
- `experienceReward`
- `respawnMs`
- `createdAt`
- `updatedAt`

## Character

- Unique character identity
- Unique name
- Ownership relation to a user
- Basic progression and spawn state
- One-to-many relation to inventory items
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
- Character inventory rows are deleted when their owning character is deleted
- Inventory rows are indexed by `characterId` and by `characterId, itemKey`
- The current MVP treats each `CharacterItem` row as one inventory slot and enforces a 10-slot limit in server code

## Notes

- This is not the final game database design.
- Authentication currently uses local email and password credentials.
- Item definitions and loot tables are currently hardcoded in server code.
- Corpse state, live monster state, quests, equipment, and broader world persistence are intentionally deferred.
