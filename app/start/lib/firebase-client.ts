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
        signIn: () => Promise<{
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
 * requires a raw nonce that's included in the ID token so we can verify
 * the token was issued for this specific sign-in attempt (blocks replay).
 * Firebase's signInWithCredential also takes the raw nonce. */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 hex of the nonce — Apple wants the hashed nonce sent in the
 * init call; the raw nonce comes back embedded in the ID token so Firebase
 * can bind. */
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Native Sign in with Apple — no Firebase OAuth handler, no popup dance.
 * On iOS Safari the OS-level Apple sheet renders directly on the page.
 * On desktop, a popup opens to appleid.apple.com. Either way, we get back
 * an ID token and immediately exchange it for a Firebase session. */
export async function signInWithAppleNative(): Promise<SignInResult> {
  const AppleID = await waitForGlobal(() => window.AppleID);
  const rawNonce = generateNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  AppleID.auth.init({
    clientId: APPLE_SERVICES_ID,
    scope: "name email",
    redirectURI: `${window.location.origin}/start/success`,
    nonce: hashedNonce,
    usePopup: true,
  });

  const response = await AppleID.auth.signIn();
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

  // Apple only returns email + name on the FIRST sign-in ever for a given
  // (app, Apple ID) pair. On subsequent sign-ins, both are omitted. Fall
  // back to Firebase's stored values (populated from the first sign-in).
  const user = cred.user;
  const finalEmail = email ?? user.email ?? null;
  const finalName = name ?? user.displayName ?? null;
  return {
    uid: user.uid,
    email: finalEmail,
    displayName: finalName,
    providerId: "apple.com",
  };
}

/** Native Sign in with Google — same pattern. Uses Google Identity
 * Services' ID token flow so we get a JWT back directly, no page
 * redirects. */
export async function signInWithGoogleNative(): Promise<SignInResult> {
  const google = await waitForGlobal(() => window.google);
  const idToken = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Google sign-in prompt not displayed"));
    }, 30000);

    google.accounts.id.initialize({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      callback: (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (response.credential) {
          resolve(response.credential);
        } else {
          reject(new Error("Google sign-in returned no credential"));
        }
      },
      // FedCM is Chrome's cookie-less identity API — enabled by default
      // in Chrome 128+. Keeps the sheet working when third-party cookies
      // are blocked.
      use_fedcm_for_prompt: true,
      auto_select: false,
      cancel_on_tap_outside: false,
    });

    google.accounts.id.prompt((notification) => {
      // If the One Tap prompt is suppressed (already dismissed recently,
      // FedCM blocked, etc.) the callback above never fires. Reject so
      // the caller can fall back.
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(
          new Error(
            `Google prompt suppressed: ${notification.getNotDisplayedReason?.() ?? notification.getSkippedReason?.() ?? "unknown"}`,
          ),
        );
      }
    });
  });

  const credential = GoogleAuthProvider.credential(idToken);
  const cred = await signInWithCredential(ensureAuth(), credential);
  return {
    uid: cred.user.uid,
    email: cred.user.email,
    displayName: cred.user.displayName,
    providerId: "google.com",
  };
}
