"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../../../api/middlewares/authMiddleware");
const adminMiddleware_1 = require("../../../api/middlewares/adminMiddleware");
const categoryController_1 = require("../controllers/categoryController");
const categoryMiddleware_1 = require("../middlewares/categoryMiddleware");
const router = (0, express_1.Router)();
// Public
router.get('/', categoryController_1.listCategories);
// Admin only
router.post('/', authMiddleware_1.authenticateToken, adminMiddleware_1.requireAdmin, categoryMiddleware_1.validateCreateCategory, categoryController_1.createCategory);
router.put('/:id', authMiddleware_1.authenticateToken, adminMiddleware_1.requireAdmin, categoryMiddleware_1.validateUpdateCategory, categoryController_1.updateCategory);
router.delete('/:id', authMiddleware_1.authenticateToken, adminMiddleware_1.requireAdmin, categoryController_1.deleteCategory);
exports.default = router;
