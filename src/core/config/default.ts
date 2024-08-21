export default {
  port: process.env.PORT || 3000,
  bcryptSaltRound: process.env.BCRYPT_SALT_ROUND,
  jwtSecret: process.env.JWT_SECRET,
};