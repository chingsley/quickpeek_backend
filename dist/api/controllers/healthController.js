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
exports.checkCacheHealth = exports.checkHealth = void 0;
const redis_1 = __importDefault(require("../../core/config/redis"));
const checkHealth = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.status(200).send('Server is running...');
});
exports.checkHealth = checkHealth;
const checkCacheHealth = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.query;
    const cacheKey = `userRating:${userId}`;
    const cachedRating = yield redis_1.default.get(cacheKey);
    console.log(cachedRating);
    if (cachedRating) {
        return res.status(200).json({
            message: "result found",
            data: JSON.parse(cachedRating)
        });
    }
    return res.status(200).json({
        message: "no result found in cache",
        data: {}
    });
});
exports.checkCacheHealth = checkCacheHealth;
