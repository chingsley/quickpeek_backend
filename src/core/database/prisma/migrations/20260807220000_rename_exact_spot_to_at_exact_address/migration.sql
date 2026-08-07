-- Rename the tightest location-scope tier and its market-config key.
ALTER TYPE "LocationScope" RENAME VALUE 'EXACT_SPOT' TO 'AT_EXACT_ADDRESS';

UPDATE "market_configs"
SET "key" = 'radiusAtExactAddressKm'
WHERE "key" = 'radiusExactSpotKm';
