ALTER TABLE "Character"
ADD COLUMN "characterClass" TEXT NOT NULL DEFAULT 'knight';

UPDATE "Character"
SET "characterClass" = 'druid'
WHERE LOWER("name") = 'manny';
