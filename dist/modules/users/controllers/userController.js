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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicUserProfile = exports.uploadUserProfileImage = exports.updateUserProfile = exports.getUserProfile = exports.loginUser = exports.registerUser = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const default_1 = __importDefault(require("../../../core/config/default"));
const client_2 = __importDefault(require("../../../core/database/prisma/client"));
const deviceUpdateQueue_1 = require("../../../core/queues/deviceUpdateQueue");
const index_1 = require("./../../../common/constants/index");
const ratings_1 = require("../../../common/utils/ratings");
const cloudinary_1 = require("../../../core/config/cloudinary");
const JWT_SECRET = default_1.default.jwtSecret;
const JWT_EXPIRES_IN = default_1.default.jwtExpiresIn;
const BCRYPT_SALT_ROUND = default_1.default.bcryptSaltRound;
const formatRating = (r) => ({
    averageRating: r.averageRating,
    reviewsCount: r.reviewsCount,
});
const registerUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const _b = req.body, { password, longitude: _______, latitude: _____ } = _b, rest = __rest(_b, ["password", "longitude", "latitude"]);
        const hashedPassword = yield bcrypt_1.default.hash(password, parseInt(BCRYPT_SALT_ROUND));
        const newUser = yield client_2.default.user.create({
            data: Object.assign(Object.assign({}, rest), { password: hashedPassword, isVerified: false }),
        });
        const { password: _, createdAt: __, updatedAt: ___ } = newUser, sanitizedUser = __rest(newUser, ["password", "createdAt", "updatedAt"]);
        res.status(201).json({
            message: 'User registered successfully',
            data: { user: sanitizedUser },
        });
    }
    catch (error) {
        let errCode = index_1.errCodeConstants.SERVER.UNKNOWN_ERROR;
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            if (error.code === index_1.PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE) {
                const uniqueField = (_a = error.meta) === null || _a === void 0 ? void 0 : _a.target;
                let errorMessage = 'Unique constraint violation';
                if (uniqueField && uniqueField.includes('email')) {
                    errorMessage = 'Email is already in use';
                    errCode = index_1.errCodeConstants.REGISTRATION.EMAIL_CONFLICT;
                }
                else if (uniqueField && uniqueField.includes('username')) {
                    errorMessage = 'Username is already exists. Choose a different username';
                    errCode = index_1.errCodeConstants.REGISTRATION.USERNAME_CONFLICT;
                }
                return res.status(409).json({ error: errorMessage, code: errCode });
            }
        }
        res.status(500).json({ error: 'Error registering user', errCode });
    }
});
exports.registerUser = registerUser;
const loginUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, deviceType, deviceToken, notificationsEnabled, locationSharingEnabled } = req.body;
        const user = yield client_2.default.user.findUnique({
            where: { email },
            include: {
                location: {
                    select: {
                        longitude: true,
                        latitude: true,
                    }
                }
            }
        });
        if (!user || !(yield bcrypt_1.default.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        yield deviceUpdateQueue_1.deviceUpdateQueue.add({
            userId: user.id,
            deviceType,
            deviceToken,
            notificationsEnabled,
            locationSharingEnabled
        });
        const { password: _, createdAt: __, updatedAt: ___ } = user, sanitizedUser = __rest(user, ["password", "createdAt", "updatedAt"]);
        res.status(200).json({ message: 'Login successful', data: { user: sanitizedUser, token } });
    }
    catch (error) {
        res.status(500).json({ error: 'Error logging in' });
    }
});
exports.loginUser = loginUser;
/**
 * GET /api/v1/users
 * Authenticated user's profile with role-scoped ratings.
 */
const getUserProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const user = yield client_2.default.user.findUnique({
            where: { id: userId },
            include: {
                location: { select: { latitude: true, longitude: true } },
            },
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const [asResponder, asQuestioner] = yield Promise.all([
            (0, ratings_1.getUserRatingByRole)(userId, client_1.RatingRole.AS_RESPONDER),
            (0, ratings_1.getUserRatingByRole)(userId, client_1.RatingRole.AS_QUESTIONER),
        ]);
        const { password } = user, safeUser = __rest(user, ["password"]);
        return res.status(200).json({
            message: 'Successful',
            data: Object.assign(Object.assign({}, safeUser), { asResponder: formatRating(asResponder), asQuestioner: formatRating(asQuestioner) }),
        });
    }
    catch (error) {
        console.error('getUserProfile error:', error);
        return res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});
exports.getUserProfile = getUserProfile;
/**
 * PUT /api/v1/users
 * Updates editable profile fields (name, username, notificationsEnabled,
 * locationSharingEnabled, deviceToken, profileImageUrl).
 */
const updateUserProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = req.user.userId;
        const { name, username, notificationsEnabled, locationSharingEnabled, deviceToken, profileImageUrl } = req.body;
        const updated = yield client_2.default.user.update({
            where: { id: userId },
            data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (name !== undefined ? { name } : {})), (username !== undefined ? { username } : {})), (notificationsEnabled !== undefined ? { notificationsEnabled } : {})), (locationSharingEnabled !== undefined ? { locationSharingEnabled } : {})), (deviceToken !== undefined ? { deviceToken } : {})), (profileImageUrl !== undefined ? { profileImageUrl } : {})),
            include: {
                location: { select: { latitude: true, longitude: true } },
            },
        });
        const [asResponder, asQuestioner] = yield Promise.all([
            (0, ratings_1.getUserRatingByRole)(userId, client_1.RatingRole.AS_RESPONDER),
            (0, ratings_1.getUserRatingByRole)(userId, client_1.RatingRole.AS_QUESTIONER),
        ]);
        const { password } = updated, safeUser = __rest(updated, ["password"]);
        return res.status(200).json({
            message: 'Profile updated successfully',
            data: Object.assign(Object.assign({}, safeUser), { asResponder: formatRating(asResponder), asQuestioner: formatRating(asQuestioner) }),
        });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === index_1.PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE) {
            const uniqueField = (_a = error.meta) === null || _a === void 0 ? void 0 : _a.target;
            let errorMessage = 'Unique constraint violation';
            if (uniqueField && uniqueField.includes('username')) {
                errorMessage = 'Username already exists. Choose a different username.';
            }
            return res.status(409).json({ error: errorMessage });
        }
        console.error('updateUserProfile error:', error);
        return res.status(500).json({ error: 'Failed to update user profile' });
    }
});
exports.updateUserProfile = updateUserProfile;
/**
 * POST /api/v1/users/profile-image
 * Uploads a profile image via multipart form field `image`.
 */
const uploadUserProfileImage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        let profileImageUrl;
        try {
            profileImageUrl = yield (0, cloudinary_1.uploadProfileImage)(file.buffer);
        }
        catch (uploadErr) {
            console.error('Profile image upload failed:', uploadErr);
            return res.status(400).json({ error: (uploadErr === null || uploadErr === void 0 ? void 0 : uploadErr.message) || 'Image upload failed' });
        }
        const updated = yield client_2.default.user.update({
            where: { id: userId },
            data: { profileImageUrl },
            include: {
                location: { select: { latitude: true, longitude: true } },
            },
        });
        const [asResponder, asQuestioner] = yield Promise.all([
            (0, ratings_1.getUserRatingByRole)(userId, client_1.RatingRole.AS_RESPONDER),
            (0, ratings_1.getUserRatingByRole)(userId, client_1.RatingRole.AS_QUESTIONER),
        ]);
        const { password } = updated, safeUser = __rest(updated, ["password"]);
        return res.status(200).json({
            message: 'Profile image updated successfully',
            data: Object.assign(Object.assign({}, safeUser), { asResponder: formatRating(asResponder), asQuestioner: formatRating(asQuestioner) }),
        });
    }
    catch (error) {
        console.error('uploadUserProfileImage error:', error);
        return res.status(500).json({ error: 'Failed to upload profile image' });
    }
});
exports.uploadUserProfileImage = uploadUserProfileImage;
/**
 * GET /api/v1/users/:id/profile
 * Public profile with role-scoped ratings, activity counts, and revealed reviews.
 */
const getPublicUserProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const page = Math.max(parseInt(String(req.query.page || '1'), 10), 1);
        const limit = Math.min(Math.max(parseInt(String(req.query.limit || '10'), 10), 1), 50);
        const skip = (page - 1) * limit;
        const user = yield client_2.default.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                username: true,
                profileImageUrl: true,
                createdAt: true,
            },
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const [asResponder, asQuestioner, questionsAnsweredCount, questionsAskedCount, reviews, reviewsTotal] = yield Promise.all([
            (0, ratings_1.getUserRatingByRole)(id, client_1.RatingRole.AS_RESPONDER),
            (0, ratings_1.getUserRatingByRole)(id, client_1.RatingRole.AS_QUESTIONER),
            client_2.default.answerRequest.count({
                where: { responderId: id, status: 'ACCEPTED' },
            }),
            client_2.default.question.count({ where: { userId: id } }),
            client_2.default.review.findMany({
                where: { rateeId: id, isRevealed: true },
                orderBy: { revealedAt: 'desc' },
                skip,
                take: limit,
                include: {
                    rater: {
                        select: { id: true, name: true, username: true, profileImageUrl: true },
                    },
                },
            }),
            client_2.default.review.count({ where: { rateeId: id, isRevealed: true } }),
        ]);
        return res.status(200).json({
            message: 'Successful',
            data: Object.assign(Object.assign({}, user), { asResponder: formatRating(asResponder), asQuestioner: formatRating(asQuestioner), questionsAnsweredCount,
                questionsAskedCount, reviews: reviews.map((review) => {
                    var _a, _b;
                    return ({
                        id: review.id,
                        stars: review.stars,
                        comment: review.comment,
                        raterRole: review.raterRole,
                        createdAt: review.createdAt.toISOString(),
                        revealedAt: (_b = (_a = review.revealedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
                        rater: {
                            id: review.rater.id,
                            name: review.rater.name,
                            username: review.rater.username,
                            profileImageUrl: review.rater.profileImageUrl,
                        },
                    });
                }), reviewsPagination: {
                    page,
                    limit,
                    total: reviewsTotal,
                    hasMore: skip + reviews.length < reviewsTotal,
                } }),
        });
    }
    catch (error) {
        console.error('getPublicUserProfile error:', error);
        return res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});
exports.getPublicUserProfile = getPublicUserProfile;
