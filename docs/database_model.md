# Database Model

## Current Scope

The current Prisma schema covers account authentication, character ownership, persistent combat progression, a small monster catalog, and persistent character item instances for containers and equipment.

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
- Class selection, combat progression, and spawn state
- One-to-many relation to inventory items
- Timestamps

### Character Fields

- `id`
- `userId`
- `name`
- `gender`
- `characterClass`
- `level`
- `experience`
- `health`
- `maxHealth`
- `mana`
- `maxMana`
- `fistLevel`
- `fistProgress`
- `swordLevel`
- `swordProgress`
- `axeLevel`
- `axeProgress`
- `clubLevel`
- `clubProgress`
- `distanceLevel`
- `distanceProgress`
- `shieldingLevel`
- `shieldingProgress`
- `magicLevel`
- `magicLevelProgress`
- `fishingLevel`
- `fishingProgress`
- `foodExpiresAt`
- `x`
- `y`
- `z`
- `createdAt`
- `updatedAt`

## Defaults

- New characters start at level `1`
- New characters start with `0` experience
- New characters start with `150 / 150` health
- New characters start with `55 / 55` mana
- New characters start with weapon skills, shielding, and fishing at level `10` with `0` stored progress
- New characters start with magic level `0` and `0` stored progress
- New characters start at position `x=100`, `y=100`, `z=0`
- New characters receive a starter backpack, leather armor, and a small stack of starter potions through character creation or migration
- Non-hunter characters start with a dagger and wooden shield equipped
- Hunter characters start with a bow equipped, a quiver equipped in the shield slot, arrows stored in that quiver, and a crossbow plus bolts in the backpack

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
- Item definitions are currently hardcoded in the shared package, while loot tables remain hardcoded in the server runtime.
- Live monster state, corpse state, and ground items remain in memory only.
- The current schema already persists combat-relevant progression such as experience, level, health, mana, weapon skills, shielding, magic level, fishing, and the active food timer.
