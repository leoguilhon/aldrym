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

The current playable scope is a technical combat MVP on the local map:

- Six monsters are registered in the database and spawned in fixed walkable positions for the current local-map MVP: Rat, Wolf, Troll, Goblin, Rotworm, and Orc
- Players select a visible monster for auto-attack by right-clicking it, or by pressing Space to target the nearest visible monster
- Pressing Space stops the current auto-attack target when one is active
- Auto-attack damage only lands while the selected target is on an adjacent tile, including diagonals
- The server rolls temporary original player melee damage from 8 to 16
- Monsters follow the nearest player within 8 SQM and remain still when no player is close enough
- Alive monsters occupy their tile and cannot be walked through by players
- Defeated monsters grant experience to the attacking character, leave a corpse on the map, show a respawn warning shortly before returning, and respawn at their original spawn position after a short delay
- Defeated monsters can create corpses containing simple original loot, such as coins, creature parts, a chipped dagger, or a small health flask
- Monster corpses have 8 slots; stackable items can still merge into an existing matching stack
- Players can open corpses by right-clicking them and can take loot only from the same tile or an adjacent tile, including diagonals
- The carried inventory is the equipped backpack and the items inside it. Backpack contents are shown only after opening the backpack, such as by right-clicking it in the equipment panel.
- If a character has no backpack equipped, corpse loot can only be taken when the item can be equipped directly into an empty compatible equipment slot.
- Players can drag items from equipment or open backpacks onto the game viewport to drop them on a walkable tile in direct contact with the character.
- Players can pick up ground items by right-clicking them from the same tile or an adjacent tile, including diagonals, or by dragging them into a backpack compartment or compatible equipment slot.
- Characters have persisted equipment slots for head, body, legs, weapon, shield, feet, and backpack.
- A basic backpack is an equippable 20-slot container. Backpack items can hold items and other backpacks when server-side nesting validation allows it.
- The game screen uses a more complete MMORPG-style client composition with a central Phaser viewport, right-side character/inventory/status panels, equipment slots, backpack windows, and a small loot window
- Level thresholds are temporary MVP values: level 1 to 2 at 100 XP, level 2 to 3 at 250 XP, and level 3+ at `level * level * 100`
- Level-up increases max health by 10, max mana by 5, and restores health and mana to max

Item stats, item use effects, item trading, shops, skills, spells, monster damage, player death, PvP, NPCs, and quests are intentionally outside this step.

