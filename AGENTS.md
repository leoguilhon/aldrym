# Aldrym Agent Guide

## Creative Direction

Aldrym is an original 2D browser-based old-school MMORPG. The intended feel is slow progression, dangerous exploration, meaningful travel, simple but tense combat, valuable loot, and multiplayer social friction in a top-down tile-based world.

## Originality Rules

- The game is heavily inspired by classic Tibia-like MMORPG gameplay loops and pacing.
- Do not copy or reuse Tibia, CipSoft, OpenTibia, or third-party assets, texts, maps, quests, formulas, UI, data files, or protected material.
- Generic fantasy terms and creature names may be used when they are common genre vocabulary.

## Engineering Rules

- The server must be authoritative for movement, combat, loot, inventory, XP, and quests.
- Do not trust the client for game state.
- Do not save every movement step directly to PostgreSQL.
- Implement small, isolated tasks.
- Prefer simple, readable code.
- Keep shared contracts in packages/shared when used by both client and server.
- Update documentation when architecture changes.
- Keep development and documentation in English, even when user prompts are written in Portuguese.


## Language Rules

- The user may give prompts and instructions in Portuguese.
- All repository content must be written in English unless explicitly requested otherwise.
- Code, comments, documentation, commit messages, branch names, file names, folder names, database models, API routes, WebSocket events, variables, functions, classes, tests, logs, and error messages must use English.
- Do not mix Portuguese and English in code or documentation.
- When the user explains a feature in Portuguese, translate the intent into clear English naming before implementing it.
- Keep public-facing game text in English by default for now, unless localization is explicitly requested later.

## Commit Rules

- Keep commit history organized by using the same commit structure across the project.
- Write commit messages in English using the format `type(scope): short imperative summary`.
- Prefer small, focused commits that cover one logical change at a time.
- Use clear types such as `chore`, `docs`, `feat`, `fix`, `refactor`, and `test`.


## Image Generation Rule

Whenever generating visual assets for the project, always follow the art direction defined in `ART_DIRECTION.md` and `PROMPT_TEMPLATES.md`.

All generated assets must preserve:
- classic top-down MMORPG perspective
- old-school pixel art style
- strong readability at small scale
- dense handcrafted environment design
- original fantasy content
- a visual feel strongly inspired by classic Tibia-style gameplay

Do not generate assets in styles that are realistic, painterly, 3D, glossy, overly cartoonish, or inconsistent with the established visual direction.
