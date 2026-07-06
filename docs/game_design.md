# Game Design

## Vision

Aldrym aims to evoke the tension, travel friction, and social dependency of classic old-school MMORPGs in a browser-based 2D world.

## Core Pillars

- Slow, meaningful character progression
- Dangerous exploration with real risk
- Simple, readable combat with positional importance
- Valuable loot and equipment upgrades
- Multiplayer interaction in towns, roads, caves, and hunting grounds

## Current Gameplay Scope

The current playable scope is a server-authoritative PvE vertical slice on the local map:

- The current local-map spawn set is intentionally minimal and uses a single troll. The previous rat respawn was removed.
- Players select a visible monster for auto-attack by right-clicking it, or by pressing Space to target the nearest visible monster
- Pressing Space stops the current auto-attack target when one is active
- Auto-attack damage only lands while the selected target is on an adjacent tile, including diagonals
- The server owns both the player attack cadence and the monster retaliation cadence
- Melee attack, defense, armor, health, mana, experience, and skill progression follow a Tibia-inspired structure, including class-relative skill advancement requirements
- Characters persist progress for fist, sword, axe, club, distance, shielding, magic level, and fishing
- Offensive, balanced, and defensive fight stances modify the authoritative attack and defense output
- Equipped items contribute combat values through `attack`, `defense`, shield modifiers, and armor
- Monsters follow the nearest player within 8 SQM and remain still when no player is close enough
- The current troll retreats at low health, respawns after 30 seconds, and can drop gold, meat, or a chipped dagger
- Alive monsters occupy their tile and cannot be walked through by players
- Defeated monsters grant experience to the attacking character, leave a corpse on the map, show a respawn warning shortly before returning, and respawn at their original spawn position after a short delay
- Monster corpses have 8 slots; stackable items can still merge into an existing matching stack
- Players can open corpses by right-clicking them and can take loot only from the same tile or an adjacent tile, including diagonals
- The carried inventory is the equipped backpack and the items inside it. Backpack contents are shown only after opening the backpack, such as by right-clicking it in the equipment panel.
- If a character has no backpack equipped, corpse loot can only be taken when the item can be equipped directly into an empty compatible equipment slot.
- Players can drag items from equipment or open backpacks onto the game viewport to drop them on a walkable tile in direct contact with the character.
- Players can pick up ground items by right-clicking them from the same tile or an adjacent tile, including diagonals, or by dragging them into a backpack compartment or compatible equipment slot.
- Characters have persisted equipment slots for head, body, legs, weapon, shield, feet, and backpack.
- A basic backpack is an equippable 20-slot container. Backpack items can hold items and other backpacks when server-side nesting validation allows it.
- Meat can be used by right-clicking it. Each use adds 180 seconds of food, up to a 1,200-second cap, and fed characters regenerate health and mana over time.
- Monster and player hits show red floating damage numbers in the viewport, while the sidebar health and mana bars mirror the authoritative character state.
- The game screen uses a more complete MMORPG-style client composition with a central Phaser viewport, right-side character/inventory/status panels, equipment slots, backpack windows, and a small loot window
- Character resources use the current Tibia-inspired rookie-to-class progression model, adapted to Aldrym starting classes at level 1 instead of changing vocation later
- Player death and respawn are still pending. Damage currently stops at 1 health as a temporary safeguard.

Spells, magic damage, ranged ammunition, player death, PvP, NPCs, quests, and broader hunting-zone balance are intentionally outside this step.

