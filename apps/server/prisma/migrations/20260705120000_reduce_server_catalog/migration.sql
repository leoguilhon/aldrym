UPDATE "CharacterItem"
SET "itemKey" = 'brown_backpack'
WHERE "itemKey" = 'basic_backpack';

DELETE FROM "CharacterItem"
WHERE "itemKey" IN ('rat_tail', 'beetle_shell', 'moss_fang', 'small_health_flask');

DELETE FROM "Monster"
WHERE "id" NOT IN ('rat', 'troll');
