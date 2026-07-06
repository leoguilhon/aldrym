# Roadmap

## MVP Phases

1. Foundation
2. Login and character creation
3. Offline map rendering and local movement
4. Multiplayer movement and world join
5. Simple PvE monsters and combat
6. Loot and inventory
7. NPC and quests

## Current Focus

- The loot and inventory step is now in place: defeated monsters create in-memory corpses with server-rolled loot, players can open and take loot from corpses through server validation, and character inventory persists in PostgreSQL
- The first authoritative combat progression slice is now in place: Tibia-inspired experience, health, mana, weapon skills, shielding, food-based regeneration, and equipment-driven attack, defense, and armor are all wired through the server
- Spells, magic damage, player death, PvP, NPCs, quests, and broader world scalability remain deferred to later phases
