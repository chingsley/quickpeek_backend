"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const healthController_1 = require("../controllers/healthController");
const healthController_2 = require("../controllers/healthController");
const router = (0, express_1.Router)();
router.get('/', healthController_1.checkHealth);
router.get('/cache-health', healthController_2.checkCacheHealth);
exports.default = router;
