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
  signInWithCredential,
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

// ─── Native Apple/Google SDK sign-in ─────────────────────────────────────
// These bypass Firebase's OAuth handler (keshah-app.firebaseapp.com/__/auth/…)
// which is what causes the ugly blank grey page + "CONTINUE TO THE APP"
// fallback button in mobile Safari + in-app browsers.
//
// Instead: use Apple's / Google's official web JS SDKs, which render the
// provider's native sign-in sheet directly on our keshah.com page. Get an
// ID token back, then swap it for a Firebase session via
// signInWithCredential — preserves the same Firebase UID as the built-in
// Firebase provider would produce, so mobile-app parity is maintained.
//
// Apple: requires Sign in with Apple JS
// (https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js)
// loaded via <Script> in the caller's layout.
//
// Google: requires Google Identity Services
// (https://accounts.google.com/gsi/client) loaded the same way.

// Ambient window globals for the two SDKs. Loose typing on purpose — we
// only touch a couple of methods, exhaustive typings for both SDKs would
// be a lot of noise for little safety win.
declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (opts: {
          clientId: string;
          scope: string;
          redirectURI: string;
          state?: string;
          nonce?: string;
          usePopup?: boolean;
        }) => void;
        signIn: (opts?: {
          clientId?: string;
          scope?: string;
          redirectURI?: string;
          state?: string;
          nonce?: string;
          usePopup?: boolean;
        }) => Promise<{
          authorization: {
            id_token: string;
            code: string;
            state?: string;
          };
          user?: {
            email?: string;
            name?: { firstName?: string; lastName?: string };
          };
        }>;
      };
    };
    google?: {
      accounts: {
        id: {
          initialize: (opts: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          prompt: (
            cb?: (notification: {
              isNotDisplayed: () => boolean;
              isSkippedMoment: () => boolean;
              isDismissedMoment: () => boolean;
              getNotDisplayedReason: () => string;
              getSkippedReason: () => string;
              getDismissedReason: () => string;
            }) => void,
          ) => void;
        };
        oauth2: {
          initTokenClient: (opts: {
            client_id: string;
            scope: string;
            callback: (resp: {
              access_token: string;
              error?: string;
            }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

// Apple Services ID from Firebase Console → Apple provider config.
// Must match what's registered under Apple Developer → Certificates,
// Identifiers & Profiles → Services IDs.
const APPLE_SERVICES_ID = "com.keshah.app.web";

// Google OAuth Web application client ID — from Google Cloud Console →
// APIs & Services → Credentials → "Web client (auto created by Google
// Service)". Authorized JavaScript origins must include the domain we
// call google.accounts.id.initialize from (www.keshah.com + keshah.com).
// NOT the iOS client ID (used by the mobile app — different type,
// no JS origins).
const GOOGLE_OAUTH_CLIENT_ID =
  "33815207242-qudn77k1tlfhj2irfcju8fcs13fqu46k.apps.googleusercontent.com";

// Poll for a globally-loaded SDK. The <Script> tag is `strategy="afterInteractive"`,
// so it's usually available before the user taps a button. If not, we wait
// up to 6s (300 * 20ms) before giving up.
async function waitForGlobal<T>(
  getter: () => T | undefined,
  timeoutMs = 6000,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = getter();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("SDK failed to load in time");
}

/** Generate a cryptographic nonce for Apple ID token binding. Apple
 * requires a nonce that's included in the ID token so we can verify
 * the token was issued for this specific sign-in attempt (blocks replay).
 * We pass the raw nonce (not hashed) — Apple accepts either and Firebase's
 * signInWithCredential is expecting the raw form. Skipping the hash lets
 * us stay synchronous inside the user-tap handler (mobile Safari blocks
 * popups if there's any async work between the tap and window.open). */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Track init once per page so we don't re-init on every sign-in call.
let appleInitialized = false;

/** Initialize the Apple SDK. Safe to call multiple times. Should be called
 * on page mount (via useEffect) so that when the user taps Continue with
 * Apple, AppleID.auth.signIn() runs synchronously and mobile Safari treats
 * it as a direct user gesture — required to open the sign-in popup. */
export function initAppleSignIn(): void {
  if (typeof window === "undefined") return;
  if (appleInitialized) return;
  if (!window.AppleID) return; // SDK still loading; caller will retry
  window.AppleID.auth.init({
    clientId: APPLE_SERVICES_ID,
    scope: "name email",
    redirectURI: `${window.location.origin}/start/success`,
    usePopup: true,
  });
  appleInitialized = true;
}

/** Native Sign in with Apple — no Firebase OAuth handler.
 *
 * CRITICAL: this function MUST be called synchronously from the user's
 * click handler. Any await before AppleID.auth.signIn() drops the "user
 * gesture" flag in mobile Safari and the popup gets blocked. Only await
 * the returned promise, which does its own async work internally. */
export function signInWithAppleNative(): Promise<SignInResult> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Not in a browser"));
  }
  if (!window.AppleID) {
    return Promise.reject(
      new Error("Apple SDK not loaded — try again in a moment"),
    );
  }
  if (!appleInitialized) initAppleSignIn();

  // Generate + pass nonce SYNCHRONOUSLY. Firebase needs the same raw
  // nonce string to verify the ID token's `nonce` claim, so we hold it
  // in closure across the promise chain.
  const rawNonce = generateNonce();

  // signIn() opens the popup synchronously here; the returned promise
  // resolves when Apple posts back via postMessage from the popup.
  const signInPromise = window.AppleID.auth.signIn({
    nonce: rawNonce,
    usePopup: true,
  });

  return signInPromise.then(async (response) => {
    const idToken = response.authorization.id_token;
    const email = response.user?.email;
    const name = response.user?.name
      ? [response.user.name.firstName, response.user.name.lastName]
          .filter(Boolean)
          .join(" ")
      : undefined;

    const credential = new OAuthProvider("apple.com").credential({
      idToken,
      rawNonce,
    });
    const cred = await signInWithCredential(ensureAuth(), credential);

    // Apple only returns email + name on the FIRST sign-in ever for a
    // given (app, Apple ID) pair. On subsequent sign-ins, both are
    // omitted. Fall back to Firebase's stored values.
    const user = cred.user;
    return {
      uid: user.uid,
      email: email ?? user.email ?? null,
      displayName: name ?? user.displayName ?? null,
      providerId: "apple.com",
    };
  });
}

/** Sign in with Google — uses Firebase's signInWithPopup which opens
 * accounts.google.com in a well-behaved popup. Google's OAuth popup is
 * reliable on mobile Safari (unlike Apple's, which is why we bypass
 * Firebase for Apple). Google Identity Services' One Tap only shows if
 * the user is already signed into a Google account, so it's the wrong
 * primitive for a button-click flow.
 *
 * MUST be called synchronously from the click handler so the popup opens
 * with an active user gesture. */
export function signInWithGoogleNative(): Promise<SignInResult> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  // signInWithPopup returns a promise; the popup opens synchronously
  // inside this call, preserving the user gesture from the tap handler.
  return signInWithPopup(ensureAuth(), provider).then((cred) => ({
    uid: cred.user.uid,
    email: cred.user.email,
    displayName: cred.user.displayName,
    providerId: "google.com",
  }));
}
