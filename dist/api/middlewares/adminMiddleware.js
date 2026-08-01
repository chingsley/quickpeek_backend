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
exports.requireAdmin = void 0;
const client_1 = __importDefault(require("../../core/database/prisma/client"));
/**
 * Loads the authenticated user's `isAdmin` flag onto `req.user`.
 * Used together with `authenticateToken` to gate admin-only routes.
 */
const requireAdmin = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const user = yield client_1.default.user.findUnique({
            where: { id: userId },
            select: { isAdmin: true },
        });
        if (!user) {
            return res.status(401).json({ error: 'Session expired, please sign in again' });
        }
        if (!user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    }
    catch (error) {
        console.error('requireAdmin error:', error);
        return res.status(500).json({ error: 'Failed to verify admin access' });
    }
});
exports.requireAdmin = requireAdmin;
