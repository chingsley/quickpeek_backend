"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileImageUpload = void 0;
const multer_1 = __importDefault(require("multer"));
/**
 * In-memory multer storage for profile image uploads. We hold the file in
 * memory and stream it to Cloudinary from the controller; nothing is written
 * to disk. Single field named `image`, max 5MB, images only.
 */
exports.profileImageUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
    },
}).single('image');
