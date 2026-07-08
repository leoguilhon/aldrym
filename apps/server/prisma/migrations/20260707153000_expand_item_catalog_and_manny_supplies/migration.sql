UPDATE "CharacterItem"
SET "itemKey" = CASE
  WHEN "itemKey" = 'chipped_dagger' THEN 'dagger'
  WHEN "itemKey" = 'patched_tunic' THEN 'leather_armor'
  WHEN "itemKey" = 'splintered_shield' THEN 'wooden_shield'
  ELSE "itemKey"
END
WHERE "itemKey" IN ('chipped_dagger', 'patched_tunic', 'splintered_shield');

WITH "MannyKnight" AS (
  SELECT "id"
  FROM "Character"
  WHERE "name" = 'Manny Knight'
),
"ExistingBackpack" AS (
  SELECT
    "CharacterItem"."id",
    "CharacterItem"."characterId"
  FROM "CharacterItem"
  INNER JOIN "MannyKnight"
    ON "MannyKnight"."id" = "CharacterItem"."characterId"
  WHERE "CharacterItem"."locationType" = 'equipment'
    AND "CharacterItem"."equipmentSlot" = 'backpack'
  ORDER BY "CharacterItem"."createdAt" ASC, "CharacterItem"."id" ASC
  LIMIT 1
),
"CreatedBackpack" AS (
  INSERT INTO "CharacterItem" ("id", "characterId", "itemKey", "quantity", "locationType", "equipmentSlot", "createdAt", "updatedAt")
  SELECT
    md5(random()::text || clock_timestamp()::text),
    "MannyKnight"."id",
    'brown_backpack',
    1,
    'equipment',
    'backpack',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "MannyKnight"
  WHERE NOT EXISTS (
    SELECT 1
    FROM "ExistingBackpack"
  )
  RETURNING "id", "characterId"
),
"MannyBackpack" AS (
  SELECT "id", "characterId"
  FROM "ExistingBackpack"
  UNION ALL
  SELECT "id", "characterId"
  FROM "CreatedBackpack"
)
DELETE FROM "CharacterItem"
USING "MannyBackpack"
WHERE "CharacterItem"."characterId" = "MannyBackpack"."characterId"
  AND "CharacterItem"."locationType" = 'container';

WITH "MannyKnight" AS (
  SELECT "id"
  FROM "Character"
  WHERE "name" = 'Manny Knight'
),
"ExistingBackpack" AS (
  SELECT
    "CharacterItem"."id",
    "CharacterItem"."characterId"
  FROM "CharacterItem"
  INNER JOIN "MannyKnight"
    ON "MannyKnight"."id" = "CharacterItem"."characterId"
  WHERE "CharacterItem"."locationType" = 'equipment'
    AND "CharacterItem"."equipmentSlot" = 'backpack'
  ORDER BY "CharacterItem"."createdAt" ASC, "CharacterItem"."id" ASC
  LIMIT 1
)
INSERT INTO "CharacterItem" (
  "id",
  "characterId",
  "itemKey",
  "quantity",
  "locationType",
  "slotIndex",
  "containerItemId",
  "equipmentSlot",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || "SeedItems"."itemKey" || "SeedItems"."slotIndex"::text),
  "ExistingBackpack"."characterId",
  "SeedItems"."itemKey",
  "SeedItems"."quantity",
  'container',
  "SeedItems"."slotIndex",
  "ExistingBackpack"."id",
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ExistingBackpack"
CROSS JOIN (
  VALUES
    ('brown_backpack', 1, 0),
    ('dagger', 1, 1),
    ('small_axe', 1, 2),
    ('wooden_club', 1, 3),
    ('wooden_shield', 1, 4),
    ('leather_armor', 1, 5),
    ('leather_helmet', 1, 6),
    ('leather_legs', 1, 7),
    ('leather_boots', 1, 8),
    ('meat', 1, 9),
    ('gold_coin', 1, 10),
    ('small_health_potion', 50, 11),
    ('small_mana_potion', 50, 12)
) AS "SeedItems" ("itemKey", "quantity", "slotIndex");
