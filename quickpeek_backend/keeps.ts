// Load environment variables from .env.test
// const testEnv = dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });
// console.log({ dbUrl: process.env.DATABASE_URL, testEnv, __dirname });

// const prisma = new PrismaClient({
//   datasources: {
//     db: {
//       url: testEnv.parsed!.DATABASE_URL,
//     },
//   },
// });

// Mock the module containing sendNotification
// jest.mock('../../../src/core/jobs/notifyNearbyUsersJob', () => {
//   const actualModule = jest.requireActual('../../../src/core/jobs/notifyNearbyUsersJob');
//   return {
//     ...actualModule,
//     sendNotification: jest.fn(),
//   };
// });



// env.test
// DATABASE_URL="postgresql://kingsleyeneja:chinonxo@localhost:5432/quickpeek_test_db?schema=public"
// JWT_SECRET="your_jwt_secret"
// BCRYPT_SALT_ROUND="10"
// RADIUS_OF_CONCERN_IN_KM="10"