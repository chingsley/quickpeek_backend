-- Drop answerRadiusKm from questions; replaced by boolean restrictToNearby.
-- The radius itself is now market-wide config (see market_configs table).
ALTER TABLE "questions" DROP COLUMN "answerRadiusKm",
ADD COLUMN "restrictToNearby" BOOLEAN NOT NULL DEFAULT false;

-- Market-wide runtime config (single row keyed by `key`).
CREATE TABLE "market_configs" (
    "key"   TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "market_configs_pkey" PRIMARY KEY ("key")
);

-- Seed default near-me radius. Mirrors the previous NEAR_ME_RADIUS env value.
INSERT INTO "market_configs" ("key", "value") VALUES ('nearMeRadiusKm', 5);
