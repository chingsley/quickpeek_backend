type DBConfig = { url: { [key: string]: string; }; };
export default {
  port: process.env.PORT || 3000,
  bcryptSaltRound: process.env.BCRYPT_SALT_ROUND,
  jwtSecret: process.env.JWT_SECRET,
  db: {
    url: {
      dev: process.env.DATABASE_URL,
      test: process.env.DATABASE_URL_TEST,
    }
  } as DBConfig,
};