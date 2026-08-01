"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../../../api/middlewares/authMiddleware");
const adminMiddleware_1 = require("../../../api/middlewares/adminMiddleware");
const configController_1 = require("../controllers/configController");
const configMiddleware_1 = require("../middlewares/configMiddleware");
const router = (0, express_1.Router)();
// Public
router.get('/', configController_1.getMarketConfig);
// Admin-only
router.put('/', authMiddleware_1.authenticateToken, adminMiddleware_1.requireAdmin, configMiddleware_1.validateMarketConfigUpdate, configController_1.updateMarketConfig);
exports.default = router;
