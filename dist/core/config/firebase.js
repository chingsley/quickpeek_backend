"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// var admin = require("firebase-admin");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
const serviceAccountPath = process.env.FIREBASE_CREDENTIAL_PATH || 'should_provide_FIREBASE_CREDENTIAL_PATH_in_env';
var serviceAccount = require(path_1.default.resolve(serviceAccountPath));
firebase_admin_1.default.initializeApp({
    credential: firebase_admin_1.default.credential.cert(serviceAccount)
});
exports.default = firebase_admin_1.default;
