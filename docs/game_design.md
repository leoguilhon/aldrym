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
- Auto-attack damage only lands while the selected target is on an adjacent cardinal tile
- The server rolls temporary original player melee damage from 8 to 16
- Monsters follow the nearest player within 8 SQM and remain still when no player is close enough
- Alive monsters occupy their tile and cannot be walked through by players
- Defeated monsters grant experience to the attacking character, leave a corpse on the map, show a respawn warning shortly before returning, and respawn at their original spawn position after a short delay
- Level thresholds are temporary MVP values: level 1 to 2 at 100 XP, level 2 to 3 at 250 XP, and level 3+ at `level * level * 100`
- Level-up increases max health by 10, max mana by 5, and restores health and mana to max

Loot, inventory, equipment, skills, spells, monster damage, player death, PvP, NPCs, and quests are intentionally outside this step.

