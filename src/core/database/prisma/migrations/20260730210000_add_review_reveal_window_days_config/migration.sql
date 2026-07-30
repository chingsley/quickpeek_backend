INSERT INTO "market_configs" ("key", "value") VALUES ('reviewRevealWindowDays', 14)
ON CONFLICT ("key") DO NOTHING;
