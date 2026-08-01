"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const default_1 = __importDefault(require("../../config/default"));
const env = process.env.NODE_ENV || 'dev';
console.log({ env, db: default_1.default.db.url[env].slice(50) });
const prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: default_1.default.db.url[env],
        },
    },
    // log: ['query', 'info', 'warn', 'error']
});
exports.default = prisma;
