CREATE TABLE "Monster" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "maxHealth" INTEGER NOT NULL,
  "experienceReward" INTEGER NOT NULL,
  "respawnMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Monster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Monster_name_key" ON "Monster"("name");

INSERT INTO "Monster" ("id", "name", "level", "maxHealth", "experienceReward", "respawnMs", "updatedAt")
VALUES
  ('rat', 'Rat', 1, 24, 18, 15000, CURRENT_TIMESTAMP),
  ('wolf', 'Wolf', 2, 34, 28, 18000, CURRENT_TIMESTAMP),
  ('troll', 'Troll', 2, 42, 36, 22000, CURRENT_TIMESTAMP),
  ('goblin', 'Goblin', 3, 48, 44, 24000, CURRENT_TIMESTAMP),
  ('rotworm', 'Rotworm', 4, 68, 72, 30000, CURRENT_TIMESTAMP),
  ('orc', 'Orc', 5, 82, 95, 34000, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "level" = EXCLUDED."level",
  "maxHealth" = EXCLUDED."maxHealth",
  "experienceReward" = EXCLUDED."experienceReward",
  "respawnMs" = EXCLUDED."respawnMs",
  "updatedAt" = CURRENT_TIMESTAMP;
