"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("./../../../api/middlewares/authMiddleware");
const ratingsMiddleware_1 = require("./../middlewares/ratingsMiddleware");
const ratingsController_1 = require("../controllers/ratingsController");
const router = (0, express_1.Router)();
router.post('/', authMiddleware_1.authenticateToken, ratingsMiddleware_1.validateAnswerRatingsCreation, ratingsController_1.rateAnswer); // Create question
exports.default = router;
