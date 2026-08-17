import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App;
let db: Firestore;
let auth: Auth;

function getFirebaseAdmin() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
    );
    app = initializeApp({ credential: cert(serviceAccount) });
  } else {
    app = getApps()[0];
  }
  db = getFirestore(app);
  auth = getAuth(app);
  return { app, db, auth };
}

export { getFirebaseAdmin };
