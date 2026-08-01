"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errCodeConstants = exports.dbConstants = exports.PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE = void 0;
exports.PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE = 'P2002';
var db_constants_1 = require("./db.constants");
Object.defineProperty(exports, "dbConstants", { enumerable: true, get: function () { return __importDefault(db_constants_1).default; } });
var errorCode_constants_1 = require("./errorCode.constants");
Object.defineProperty(exports, "errCodeConstants", { enumerable: true, get: function () { return __importDefault(errorCode_constants_1).default; } });
