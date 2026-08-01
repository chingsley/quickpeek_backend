"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const authMiddleware_1 = require("./../../../api/middlewares/authMiddleware");
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const uploadMiddleware_1 = require("../../../api/middlewares/uploadMiddleware");
const userMiddleware_1 = require("../middlewares/userMiddleware");
const router = (0, express_1.Router)();
// Auth
router.post('/', userMiddleware_1.validateUserRegistration, userController_1.registerUser);
router.post('/login', userMiddleware_1.validateUserLogin, userController_1.loginUser);
// Profile (authenticated user)
router.get('/', authMiddleware_1.authenticateToken, userController_1.getUserProfile);
router.put('/', authMiddleware_1.authenticateToken, userMiddleware_1.validateUserProfileUpdate, userController_1.updateUserProfile);
router.post('/profile-image', authMiddleware_1.authenticateToken, uploadMiddleware_1.profileImageUpload, userController_1.uploadUserProfileImage);
// Public profile
router.get('/:id/profile', authMiddleware_1.authenticateToken, userController_1.getPublicUserProfile);
exports.default = router;
