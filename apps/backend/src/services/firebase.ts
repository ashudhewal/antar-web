import admin from "firebase-admin";
import { env } from "../config/env.js";

let initialized = false;

export const getFirebaseApp = (): admin.app.App => {
  if (!initialized) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY
      })
    });
    initialized = true;
  }
  return admin.app();
};

export const getAuth = () => getFirebaseApp().auth();
export const getFirestore = () => getFirebaseApp().firestore();
