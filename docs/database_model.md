# Database Model

## Current Scope

The current Prisma schema covers account authentication, basic character ownership, the monster catalog, and persistent character item instances for containers and equipment.

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
- Location type: container or equipment, with root retained only for legacy migration state
- Optional root/container slot index
- Optional parent container item id
- Optional equipment slot name
- Timestamps

### CharacterItem Fields

- `id`
- `characterId`
- `itemKey`
- `quantity`
- `locationType`
- `slotIndex`
- `containerItemId`
- `equipmentSlot`
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
- Character item rows are deleted when their owning character is deleted
- Inventory rows are indexed by `characterId`, `characterId, itemKey`, `characterId, locationType`, `characterId, containerItemId`, and `characterId, equipmentSlot`
- The current MVP uses the equipped backpack as the carried inventory
- Equipment slots are persisted as `CharacterItem` rows with `locationType=equipment` and an `equipmentSlot`
- Container contents are persisted as `CharacterItem` rows with `locationType=container`, a `containerItemId`, and a `slotIndex`

## Notes

- This is not the final game database design.
- Authentication currently uses local email and password credentials.
- Item definitions and loot tables are currently hardcoded in server code.
- Corpse state, live monster state, quests, item stats, item use effects, and broader world persistence are intentionally deferred.
