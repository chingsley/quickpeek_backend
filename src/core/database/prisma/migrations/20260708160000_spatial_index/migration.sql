-- Spatial index for location queries.
--
-- The current schema stores latitude/longitude as plain DOUBLE PRECISION and
-- runs a Haversine distance in SQL on every query. To speed up the bounding-box
-- pre-filter we add a functional GIST index over a geography point. This
-- requires the PostGIS extension.
--
-- PostGIS may not be installed in every environment (e.g. the local dev DB).
-- We guard the whole block with a check for the extension's existence so
-- the migration is safe to deploy even where PostGIS is absent — the queries
-- still work without the index, just slower.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'postgis'
  ) THEN
    -- locations: index for "nearby users / responders" queries.
    CREATE INDEX IF NOT EXISTS "locations_geog_idx"
      ON "locations" USING GIST ( (geography(point(longitude, latitude))) );

    -- questions: index for "nearby questions" queries.
    CREATE INDEX IF NOT EXISTS "questions_geog_idx"
      ON "questions" USING GIST ( (geography(point(longitude, latitude))) );

    RAISE NOTICE 'PostGIS spatial indexes created.';
  ELSE
    RAISE NOTICE 'PostGIS extension not loaded; skipping spatial indexes (queries still work).';
  END IF;
END $$;
