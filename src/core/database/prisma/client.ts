import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from '../../config/default';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: resolveDatabaseUrl(),
    },
  },
});

export default prisma;
