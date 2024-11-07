import { PrismaClient } from '@prisma/client';
import config from '../../config/default';


const env = process.env.NODE_ENV || 'dev';
console.log({ env, db: config.db.url[env].slice(50) });
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.db.url[env],
    },
  },
});

export default prisma;
