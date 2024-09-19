var admin = require("firebase-admin");
import firebaseConfig from "./firebase.config";


var serviceAccount = JSON.stringify(firebaseConfig);

console.log('>>>\nserviceAccount: ', serviceAccount, '\n<<<');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export default admin;