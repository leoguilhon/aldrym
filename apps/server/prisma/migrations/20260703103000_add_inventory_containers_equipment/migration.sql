ALTER TABLE "CharacterItem"
  ADD COLUMN "locationType" TEXT NOT NULL DEFAULT 'root',
  ADD COLUMN "slotIndex" INTEGER,
  ADD COLUMN "containerItemId" TEXT,
  ADD COLUMN "equipmentSlot" TEXT;

WITH numbered_items AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "characterId" ORDER BY "createdAt" ASC, "id" ASC) - 1 AS "nextSlotIndex"
  FROM "CharacterItem"
)
UPDATE "CharacterItem"
SET "slotIndex" = numbered_items."nextSlotIndex"
FROM numbered_items
WHERE "CharacterItem"."id" = numbered_items."id";

ALTER TABLE "CharacterItem"
  ADD CONSTRAINT "CharacterItem_containerItemId_fkey"
  FOREIGN KEY ("containerItemId")
  REFERENCES "CharacterItem"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "CharacterItem_characterId_locationType_idx" ON "CharacterItem"("characterId", "locationType");
CREATE INDEX "CharacterItem_characterId_containerItemId_idx" ON "CharacterItem"("characterId", "containerItemId");
CREATE INDEX "CharacterItem_characterId_equipmentSlot_idx" ON "CharacterItem"("characterId", "equipmentSlot");
