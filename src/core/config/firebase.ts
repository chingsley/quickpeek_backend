// var admin = require("firebase-admin");
import admin from 'firebase-admin';
import path from 'path';

const serviceAccountPath = process.env.FIREBASE_CREDENTIAL_PATH || 'should_provide_FIREBASE_CREDENTIAL_PATH_in_env';
var serviceAccount = require(path.resolve(serviceAccountPath));


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export default admin;