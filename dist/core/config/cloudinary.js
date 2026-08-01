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
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadAnswerImage = uploadAnswerImage;
exports.uploadProfileImage = uploadProfileImage;
const cloudinary_1 = require("cloudinary");
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || '',
});
exports.default = cloudinary_1.v2;
/**
 * Upload a file buffer to Cloudinary under the `quickpeek/answers` folder.
 * Returns the secure URL. Throws if Cloudinary creds are not configured.
 */
function uploadAnswerImage(buffer) {
    return __awaiter(this, void 0, void 0, function* () {
        return uploadImage(buffer, 'quickpeek/answers');
    });
}
function uploadProfileImage(buffer) {
    return __awaiter(this, void 0, void 0, function* () {
        return uploadImage(buffer, 'quickpeek/profiles');
    });
}
function uploadImage(buffer, folder) {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
        throw new Error('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME missing)');
    }
    return new Promise((resolve, reject) => {
        const stream = cloudinary_1.v2.uploader.upload_stream({ folder, resource_type: 'image' }, (error, result) => {
            if (error || !result)
                return reject(error || new Error('Cloudinary upload failed'));
            resolve(result.secure_url);
        });
        stream.end(buffer);
    });
}
