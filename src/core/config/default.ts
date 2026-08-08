type DBConfig = { url: { [key: string]: string | undefined; }; };

/**
 * Resolve the Postgres URL for the current process.
 * - `test` → DATABASE_URL_TEST
 * - everything else (dev / development / production / staging) → DATABASE_URL
 */
export function resolveDatabaseUrl(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  const env = nodeEnv || 'dev';
  const url =
    env === 'test' ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;

  if (!url) {
    const expected = env === 'test' ? 'DATABASE_URL_TEST' : 'DATABASE_URL';
    throw new Error(`${expected} is not set (NODE_ENV=${env})`);
  }
  return url;
}

export default {
  port: process.env.PORT || 3000,
  bcryptSaltRound: process.env.BCRYPT_SALT_ROUND,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  db: {
    // Kept for any legacy readers; prefer resolveDatabaseUrl().
    url: {
      dev: process.env.DATABASE_URL,
      development: process.env.DATABASE_URL,
      test: process.env.DATABASE_URL_TEST,
      production: process.env.DATABASE_URL,
      staging: process.env.DATABASE_URL,
    },
  } as DBConfig,
};
