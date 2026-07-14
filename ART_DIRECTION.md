# Aldrym Art Direction

This document defines the default visual direction for all generated images and game assets used in Aldrym.

The goal is to keep the project visually consistent across characters, monsters, tiles, props, environments and future UI assets.

All generated art must follow this guide.

---

## 1. Core Style Goal

Aldrym should visually feel like a classic top-down fantasy MMORPG with strong inspiration from the gameplay readability and atmosphere of old-school Tibia-style games.

The goal is not to copy existing copyrighted assets, but to capture the same type of visual language:

- top-down 2D pixel art
- tile-based world design
- compact readable sprites
- dense handcrafted environments
- classic fantasy exploration feeling
- old-school MMORPG readability
- original assets with nostalgic visual DNA

Every asset should feel like it belongs inside a playable classic MMORPG world.

---

## 2. Style Pillars

All assets should prioritize:

- readability at small scale
- strong silhouette
- clean top-down presentation
- classic MMORPG proportions
- handcrafted environment feel
- original fantasy design
- consistency between assets

If there is any doubt, prioritize:
1. readability
2. consistency
3. originality

---

## 3. Perspective

Use:

- top-down perspective
- slightly angled top-down when needed
- tile/grid-based spatial logic
- game-ready viewing angle

Avoid:

- side view
- side-scroller composition
- cinematic perspective
- realistic perspective distortion
- strong isometric bias unless explicitly requested

Everything should feel made for a top-down tile-based MMORPG.

---

## 4. Art Style

Use:

- 2D pixel art
- classic MMORPG sprite language
- crisp readable forms
- dense but controlled environment detail
- compact game-ready sprites
- clear separation between walkable floor, walls, props, characters and monsters

Avoid:

- painterly concept art
- soft blurry rendering
- 3D render look
- realistic shading
- glossy mobile-game visuals
- modern flat-vector style
- excessive stylization that hurts gameplay readability

The image should look like a real in-game asset, not a splash illustration.

---

## 5. World Feel

Aldrym should feel:

- medieval fantasy
- rustic
- adventurous
- dangerous
- handcrafted
- nostalgic
- immersive
- slightly gritty
- readable and playable

The world should look alive, explorable and game-ready.

---

## 6. Environment Direction

Preferred environment types:

- medieval towns
- temple areas
- stone streets
- castles
- taverns
- forests
- swamps
- ruins
- caves
- dark dungeons
- icy caves
- lava caves
- mountain paths
- graveyards

Environments should feel:

- dense
- layered
- readable
- handcrafted
- suitable for exploration and combat

Avoid empty-looking maps or over-detailed maps that become visually noisy.

---

## 7. Color Direction

Use controlled, readable color palettes.

Preferred palette families:

- earthy browns
- stone grays
- moss greens
- muted golds
- forest greens
- dark blues
- lava reds and oranges
- cold ice blues
- torchlight ambers
- parchment and dust tones

Each biome should have its own readable identity.

Examples:

### Towns
- beige stone
- warm whites
- soft greens
- decorative gold accents

### Dungeons
- dark grays
- damp greens
- low warm torch accents
- colder desaturated tones

### Ice caves
- pale blue
- white
- gray rock
- cold contrast

### Lava caves
- dark stone
- red-orange lava
- volcanic contrast
- dramatic warm highlights

Avoid neon palettes or overly saturated cartoon colors.

---

## 8. Character Design

Characters must be:

- small and compact
- easy to read in-game
- clearly class-identifiable
- visually distinct by silhouette
- suitable for top-down gameplay

Every class/outfit should have unique visual identity, not only different colors.

### Warrior
Required traits:
- armor
- broader silhouette
- metal or leather protection
- battle-ready appearance
- clear melee identity

### Mage
Required traits:
- robe or mantle
- cloth-heavy silhouette
- mystical scholar feeling
- beard if appropriate
- visually lighter than warrior

### Hunter
Required traits:
- ranger-style clothing
- visible quiver on the back
- light practical gear
- agile silhouette
- wilderness traveler feeling

### Druid
Required traits:
- rustic clothing
- earthy palette
- natural materials
- primitive or spiritual feeling
- connection to nature

Characters should feel playable and readable even at small sprite scale.

---

## 9. Monster Design

Monsters must be:

- readable at small size
- visually threatening
- strong in silhouette
- suited for top-down combat
- original in design

Use:

- iconic fantasy forms
- clear shape language
- controlled detail
- aggressive or dangerous presence

Avoid:

- overcomplicated anatomy
- excessive realism
- goofy comedy style
- horror realism
- low-readability clutter

Monsters should feel like enemies from a dangerous classic MMORPG world.

---

## 10. Tiles

Tiles must be made for tile-based mapping.

Preferred tile categories:

- grass
- dirt
- sand
- stone floor
- dungeon floor
- cave floor
- swamp floor
- forest ground
- snow
- ice
- lava rock
- temple floor
- wooden floor

Requirements:

- top-down readability
- consistent light logic
- seamless or near-seamless placement
- controlled texture detail
- clear biome identity

Avoid extremely noisy texture that makes maps hard to read.

---

## 11. Props and Structures

Props and structures should support a classic fantasy MMORPG world.

Examples:

- barrels
- crates
- torches
- tables
- chairs
- beds
- bookshelves
- wells
- chests
- signs
- fences
- statues
- bridges
- trees
- bushes
- altars
- pillars
- doors
- market stalls

Requirements:

- readable at small scale
- clear top-down form
- consistent material style
- useful for map composition

---

## 12. Gameplay Scene Direction

When generating gameplay-like scenes, prioritize:

- top-down action readability
- tactical combat feel
- narrow passages when relevant
- dense environment detail
- visible combat interaction
- monster pressure
- exploration atmosphere

Scenes may include:

- player vs monster combat
- hunting situations
- city movement
- dungeon exploration
- biome showcases

Spell and combat effects should be readable, but not excessive.

---

## 13. Lighting and Atmosphere

Lighting should support readability first.

Use:

- soft ambient readability
- torch warmth in interiors and dungeons
- cold ambient light in icy areas
- warm dramatic glow in lava areas
- clear contrast between foreground gameplay elements and floor

Avoid:

- cinematic bloom
- extreme glow
- dramatic realism
- high-contrast effects that hide sprite readability

Atmosphere is important, but clarity comes first.

---

## 14. UI-Compatible Asset Thinking

All assets should be made with implementation in mind.

That means:

- readable in-game
- not dependent on huge canvas size
- clear outlines or clear silhouette separation
- visually useful inside a tile-based game

Even if the art is generated as a standalone image, it should still feel like it could be extracted into a usable game asset.

---

## 15. Item Icon Quality

Inventory item icons must match the quality bar of the current strongest item assets, especially the leather equipment benchmark set:

- `apps/web/public/assets/items/leather_helmet.png`
- `apps/web/public/assets/items/leather_armor.png`
- `apps/web/public/assets/items/leather_legs.png`
- `apps/web/public/assets/items/leather_boots.png`

Use `apps/web/public/assets/items/dagger.png`, `apps/web/public/assets/items/wooden_shield.png`, and `apps/web/public/assets/items/brown_backpack.png` only as secondary category references after the leather-set bar is already matched.

Use these assets as visual references before accepting or committing any new item icon.

Required item icon traits:

- final asset size must be 32x32 PNG with transparent background
- strong dark outline and clear silhouette
- dense hand-pixeled texture, not smooth procedural shapes
- visible material identity through pixel clusters, scuffs, highlights, seams, chips, grain, glass reflections, or metal shine
- compact inventory composition that fills the icon space similarly to the leather equipment benchmark set, with category-specific support from `dagger.png`, `wooden_shield.png`, or `brown_backpack.png` when relevant
- readable at native 32x32 size and still attractive when previewed larger
- consistent contrast, lighting direction, and old-school MMORPG item language

Reject item icons that look:

- flat, vector-like, or made from simple geometric primitives
- too clean, sparse, or low-detail compared to the leather equipment benchmark set
- blurry, painterly, realistic, glossy, or modern mobile-game styled
- undersized inside the 32x32 canvas
- visually disconnected from the existing item set

When generating new item icons, first generate at high quality, then remove the background, crop to the non-transparent subject, and downscale carefully to 32x32. Always inspect the result next to `leather_helmet.png`, `leather_armor.png`, `leather_legs.png`, and `leather_boots.png` before considering it done. For script-generated or regenerated icons, run `python apps/web/scripts/validate_item_icons.py` as an additional quality gate.

---

## 16. Background Rule

For isolated assets, prefer:

- transparent background when appropriate

This usually applies to:

- characters
- monsters
- items
- props

For:

- scenes
- map previews
- biome previews

A full environment background is expected.

---

## 17. Originality Rule

All generated art must be original.

Do not:

- copy Tibia sprites
- recreate official Tibia monsters directly
- redraw official Tibia outfits
- reproduce official UI art
- clone copyrighted maps tile-by-tile
- trace or imitate too literally

Do:

- capture the same gameplay readability
- capture the same top-down MMORPG feel
- capture the same environment density
- create original content with similar visual logic

The style may be strongly inspired, but the assets must remain original.

---

## 18. Negative Style Rules

Do not generate assets that look:

- realistic
- painterly
- 3D rendered
- glossy
- modern mobile-game styled
- overly cartoonish
- too cute
- too abstract
- visually inconsistent with classic top-down MMORPG pixel art

---

## 19. Default Prompt Base

Use this prompt base for most generations:

Create an original 2D pixel art asset for a classic top-down fantasy MMORPG.  
The image should strongly evoke the feel of old-school Tibia-style gameplay, with tile-based readability, compact sprite proportions, dense handcrafted environment detail, and a classic fantasy atmosphere.  
Use a crisp top-down pixel art style, clear silhouette, strong readability, and game-ready design.  
Keep the design original. Do not make it painterly, realistic, blurry, glossy, or 3D-rendered.

---

## 20. Final Rule

Whenever a decision must be made, always choose the option that best preserves:

- classic top-down MMORPG readability
- visual consistency
- original design
- old-school fantasy atmosphere
- game-ready usefulness

All assets should feel like they belong to the same world.
