"use client";

// Firebase Auth client for web funnel sign-in.
//
// Keeps the user's identity portable between web and mobile: whichever
// provider they use here (Apple/Google/email) produces a deterministic
// Firebase UID. Signing into the mobile app with the same provider yields
// the same UID, and RC entitlements tied to that UID follow the user.
//
// Config below points at the same `keshah-app` Firebase project the iOS
// and Android apps use — required for UID alignment across platforms.
// These values are embedded in every Firebase web client bundle; they're
// public by design and safe to commit.

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup,
  type Auth,
  type User,
} from "firebase/auth";

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDkpZmpH9NBZ8ax9TMJSSsPddQ9SVxbO5w",
  authDomain: "keshah-app.firebaseapp.com",
  databaseURL: "https://keshah-app-default-rtdb.firebaseio.com",
  projectId: "keshah-app",
  storageBucket: "keshah-app.appspot.com",
  messagingSenderId: "33815207242",
  appId: "1:33815207242:web:af67261883aff7e182b5b3",
  measurementId: "G-HK5MKVTRPS",
};

function ensureApp(): FirebaseApp {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0];
    return app;
  }
  app = initializeApp(FIREBASE_CONFIG);
  return app;
}

function ensureAuth(): Auth {
  if (authInstance) return authInstance;
  authInstance = getAuth(ensureApp());
  return authInstance;
}

export interface SignInResult {
  uid: string;
  email: string | null;
  displayName: string | null;
  providerId: "google.com" | "apple.com" | "password";
}

function toResult(user: User, providerId: SignInResult["providerId"]): SignInResult {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    providerId,
  };
}

export async function signInWithGoogle(): Promise<SignInResult> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const auth = ensureAuth();
  const existing = auth.currentUser;
  // If we already have an anonymous session (from PhoneNumber step on
  // /startindia), upgrade it via linkWithPopup so the same UID survives
  // and the lead doc seamlessly becomes the paying user's doc.
  if (existing && existing.isAnonymous) {
    try {
      const cred = await linkWithPopup(existing, provider);
      return toResult(cred.user, "google.com");
    } catch (err: unknown) {
      // credential-already-in-use: the Google account already has a Firebase
      // user. Fall back to signing into that account, abandoning the anon
      // session. The phone we wrote to the anon UID is orphaned but the user
      // still gets through signup.
      const code = (err as { code?: string })?.code;
      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        // eslint-disable-next-line no-console
        console.warn("[firebase-client] linkWithPopup conflict, falling back to signInWithPopup");
      } else {
        throw err;
      }
    }
  }
  const cred = await signInWithPopup(auth, provider);
  return toResult(cred.user, "google.com");
}

export async function signInWithApple(): Promise<SignInResult> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  const cred = await signInWithPopup(ensureAuth(), provider);
  return toResult(cred.user, "apple.com");
}

/** Redirect-based sign-in for mobile browsers + in-app browsers where
 *  signInWithPopup silently fails or opens a broken Firebase handler
 *  page. Navigates the WHOLE page to the provider (Apple/Google) and
 *  returns via a full-page redirect back to the caller's URL. The caller
 *  must invoke completeRedirectSignIn() on mount to pick up the result. */
export async function redirectToGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithRedirect(ensureAuth(), provider);
}

export async function redirectToApple(): Promise<void> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  await signInWithRedirect(ensureAuth(), provider);
}

/** Called on mount by pages that use the redirect flow. Returns the
 *  SignInResult once, or null if no redirect result is pending. */
export async function completeRedirectSignIn(): Promise<SignInResult | null> {
  const result = await getRedirectResult(ensureAuth());
  if (!result) return null;
  // Firebase's OAuthCredential doesn't expose providerId reliably from
  // getRedirectResult, so derive it from the user's providerData.
  const providerId =
    (result.user.providerData[0]?.providerId as SignInResult["providerId"]) ??
    "password";
  return toResult(result.user, providerId);
}

export async function signUpWithEmail(email: string, password: string): Promise<SignInResult> {
  const auth = ensureAuth();
  const existing = auth.currentUser;
  // Same anon-upgrade pattern as signInWithGoogle: if there's an anonymous
  // session, link credentials so the UID survives the upgrade.
  if (existing && existing.isAnonymous) {
    try {
      const credential = EmailAuthProvider.credential(email, password);
      const cred = await linkWithCredential(existing, credential);
      return toResult(cred.user, "password");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        // eslint-disable-next-line no-console
        console.warn("[firebase-client] linkWithCredential conflict, falling back to createUserWithEmailAndPassword");
      } else {
        throw err;
      }
    }
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return toResult(cred.user, "password");
}

/** Sign in anonymously and return the resulting Firebase UID. Used by
 *  the PhoneNumber step on /startindia so we can save a lead doc keyed
 *  by a real UID before the user has signed up. The anon account is
 *  upgraded to a real account via linkWithCredential at the SignUp step. */
export async function signInAnonymous(): Promise<string> {
  const auth = ensureAuth();
  // If we already have an anon user (e.g., user navigated back and forward),
  // reuse it instead of creating a new one each time.
  if (auth.currentUser && auth.currentUser.isAnonymous) {
    return auth.currentUser.uid;
  }
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  const cred = await signInWithEmailAndPassword(ensureAuth(), email, password);
  return toResult(cred.user, "password");
}

export function currentUser(): User | null {
  return ensureAuth().currentUser;
}

export async function getIdToken(): Promise<string | null> {
  const user = currentUser();
  if (!user) return null;
  return user.getIdToken();
}
