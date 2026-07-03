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
- The first equipment and container foundation is now in place: characters have persisted equipment slots, a basic backpack can be equipped, and item instances can move between the equipped backpack, nested backpacks, equipment, and in-memory ground items through server validation
- Item stats, item use effects, item trading, shops, skills, spells, monster damage, player death, PvP, NPCs, quests, and broader world scalability remain deferred to later phases
