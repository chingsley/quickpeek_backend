"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jwt_utils_1 = require("../../common/utils/jwt.utils");
const client_1 = __importDefault(require("../../core/database/prisma/client"));
const authenticateToken = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const token = (_a = req.header('Authorization')) === null || _a === void 0 ? void 0 : _a.replace('Bearer ', '');
    if (!token)
        return res.status(401).json({ error: 'Access denied, no token provided' });
    const decoded = (0, jwt_utils_1.verifyToken)(token);
    if (!decoded)
        return res.status(401).json({ error: 'Access denied, invalid token' });
    const user = yield client_1.default.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true },
    });
    if (!user) {
        return res.status(401).json({ error: 'Session expired, please sign in again' });
    }
    req.user = decoded;
    next();
});
exports.authenticateToken = authenticateToken;
