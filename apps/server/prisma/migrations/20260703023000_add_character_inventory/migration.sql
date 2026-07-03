CREATE TABLE "CharacterItem" (
  "id" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CharacterItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CharacterItem_characterId_idx" ON "CharacterItem"("characterId");
CREATE INDEX "CharacterItem_characterId_itemKey_idx" ON "CharacterItem"("characterId", "itemKey");

ALTER TABLE "CharacterItem"
  ADD CONSTRAINT "CharacterItem_characterId_fkey"
  FOREIGN KEY ("characterId")
  REFERENCES "Character"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
