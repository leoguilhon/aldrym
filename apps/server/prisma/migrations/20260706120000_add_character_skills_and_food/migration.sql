ALTER TABLE "Character"
  ALTER COLUMN "health" SET DEFAULT 150,
  ALTER COLUMN "maxHealth" SET DEFAULT 150,
  ALTER COLUMN "mana" SET DEFAULT 55,
  ALTER COLUMN "maxMana" SET DEFAULT 55,
  ADD COLUMN "fistLevel" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "fistProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "swordLevel" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "swordProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "axeLevel" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "axeProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "clubLevel" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "clubProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "distanceLevel" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "distanceProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shieldingLevel" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "shieldingProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "magicLevel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "magicLevelProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fishingLevel" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "fishingProgress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "foodExpiresAt" TIMESTAMP(3);

UPDATE "Character"
SET
  "maxHealth" = CASE
    WHEN "level" <= 8 THEN 150 + (("level" - 1) * 5)
    WHEN "characterClass" = 'knight' THEN 185 + (("level" - 8) * 15)
    WHEN "characterClass" = 'hunter' THEN 185 + (("level" - 8) * 10)
    ELSE 185 + (("level" - 8) * 5)
  END,
  "maxMana" = CASE
    WHEN "level" <= 8 THEN 55 + (("level" - 1) * 5)
    WHEN "characterClass" = 'knight' THEN 90 + (("level" - 8) * 5)
    WHEN "characterClass" = 'hunter' THEN 90 + (("level" - 8) * 15)
    ELSE 90 + (("level" - 8) * 30)
  END;

UPDATE "Character"
SET
  "health" = "maxHealth",
  "mana" = "maxMana";

INSERT INTO "CharacterItem" ("id", "characterId", "itemKey", "quantity", "locationType", "equipmentSlot", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  "Character"."id",
  'brown_backpack',
  1,
  'equipment',
  'backpack',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Character"
WHERE NOT EXISTS (
  SELECT 1
  FROM "CharacterItem"
  WHERE "CharacterItem"."characterId" = "Character"."id"
    AND "CharacterItem"."locationType" = 'equipment'
    AND "CharacterItem"."equipmentSlot" = 'backpack'
);

INSERT INTO "CharacterItem" ("id", "characterId", "itemKey", "quantity", "locationType", "equipmentSlot", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  "Character"."id",
  'chipped_dagger',
  1,
  'equipment',
  'weapon',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Character"
WHERE NOT EXISTS (
  SELECT 1
  FROM "CharacterItem"
  WHERE "CharacterItem"."characterId" = "Character"."id"
    AND "CharacterItem"."locationType" = 'equipment'
    AND "CharacterItem"."equipmentSlot" = 'weapon'
);

INSERT INTO "CharacterItem" ("id", "characterId", "itemKey", "quantity", "locationType", "equipmentSlot", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  "Character"."id",
  'patched_tunic',
  1,
  'equipment',
  'body',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Character"
WHERE NOT EXISTS (
  SELECT 1
  FROM "CharacterItem"
  WHERE "CharacterItem"."characterId" = "Character"."id"
    AND "CharacterItem"."locationType" = 'equipment'
    AND "CharacterItem"."equipmentSlot" = 'body'
);

INSERT INTO "CharacterItem" ("id", "characterId", "itemKey", "quantity", "locationType", "equipmentSlot", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  "Character"."id",
  'splintered_shield',
  1,
  'equipment',
  'shield',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Character"
WHERE NOT EXISTS (
  SELECT 1
  FROM "CharacterItem"
  WHERE "CharacterItem"."characterId" = "Character"."id"
    AND "CharacterItem"."locationType" = 'equipment'
    AND "CharacterItem"."equipmentSlot" = 'shield'
);
