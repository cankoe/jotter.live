/**
 * Google OAuth for Google Drive — unified web + native.
 *
 * Web: GIS popup flow (unchanged)
 * Native (Capacitor iOS/Android): @capawesome/capacitor-google-sign-in
 *
 * Both flows produce the same { access_token, expires_at } in localStorage.
 * All downstream code (google-drive.ts, sync-engine.ts) is unaffected.
 */

import { Capacitor } from "@capacitor/core";

const CLIENT_ID = "669755857434-qvta604cln191dmgqh4pnvb9snd6dvq9.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_KEY = "jotter-gdrive-token";

interface StoredToken {
  access_token: string;
  expires_at: number;
}

// --- Token storage (shared by both flows) ---

function getStoredToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function storeToken(accessToken: string, expiresIn: number): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token: accessToken,
    expires_at: Date.now() + expiresIn * 1000,
  }));
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// --- GIS token client (web only) ---

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let resolveAuth: ((token: string) => void) | null = null;
let rejectAuth: ((err: Error) => void) | null = null;
let pendingSignIn: Promise<string> | null = null;

function getTokenClient(): google.accounts.oauth2.TokenClient {
  if (tokenClient) return tokenClient;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      if (response.error) {
        rejectAuth?.(new Error(response.error_description || response.error));
      } else {
        const expiresIn = parseInt(response.expires_in, 10) || 3600;
        storeToken(response.access_token, expiresIn);
        resolveAuth?.(response.access_token);
      }
      resolveAuth = null;
      rejectAuth = null;
    },
    error_callback: (err) => {
      const msg = err.type === "popup_failed_to_open"
        ? "POPUP_BLOCKED"
        : err.type === "popup_closed"
        ? "Sign-in cancelled"
        : err.message || "OAuth error";
      rejectAuth?.(new Error(msg));
      resolveAuth = null;
      rejectAuth = null;
    },
  });

  return tokenClient;
}

function signInWeb(): Promise<string> {
  if (pendingSignIn) return pendingSignIn;

  pendingSignIn = new Promise<string>((resolve, reject) => {
    resolveAuth = resolve;
    rejectAuth = reject;
    const client = getTokenClient();
    client.requestAccessToken({
      prompt: hasToken() ? "" : "consent",
    });
  }).finally(() => {
    pendingSignIn = null;
  });

  return pendingSignIn;
}

function signOutWeb(): void {
  const token = getStoredToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token, () => {});
  }
  clearToken();
  tokenClient = null;
  pendingSignIn = null;
}

// --- Native sign-in (Capacitor plugin) ---

let nativeInitialized = false;

async function ensureNativeInit(): Promise<void> {
  if (nativeInitialized) return;
  const { GoogleSignIn } = await import("@capawesome/capacitor-google-sign-in");
  await GoogleSignIn.initialize({
    clientId: CLIENT_ID,
    scopes: [SCOPE],
  });
  nativeInitialized = true;
}

async function signInNative(): Promise<string> {
  await ensureNativeInit();
  const { GoogleSignIn } = await import("@capawesome/capacitor-google-sign-in");
  const result = await GoogleSignIn.signIn();

  if (!result.accessToken) {
    throw new Error("No access token returned from native sign-in");
  }

  // Native tokens typically expire in 3600s (1 hour), same as GIS
  storeToken(result.accessToken, 3600);
  return result.accessToken;
}

async function signOutNative(): Promise<void> {
  try {
    await ensureNativeInit();
    const { GoogleSignIn } = await import("@capawesome/capacitor-google-sign-in");
    await GoogleSignIn.signOut();
  } catch { /* ignore sign-out errors */ }
  clearToken();
}

// --- Public API (unchanged signatures) ---

/** Is the token present AND not expired? */
export function isSignedIn(): boolean {
  const token = getStoredToken();
  return token !== null && Date.now() < token.expires_at;
}

/** Is there any token stored (possibly expired)? */
export function hasToken(): boolean {
  return getStoredToken() !== null;
}

/**
 * Request a token via GIS popup (web) or native Google Sign-In (Capacitor).
 * ONLY call from user-gesture contexts (button clicks).
 */
export function signIn(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    return signInNative();
  }
  return signInWeb();
}

export function signOut(): void {
  if (Capacitor.isNativePlatform()) {
    signOutNative(); // fire-and-forget async
  } else {
    signOutWeb();
  }
}

/**
 * Get a valid access token. Pure localStorage check.
 * NEVER opens a popup or triggers sign-in.
 * Throws AUTH_EXPIRED if token is missing or expired.
 */
export function getAccessToken(): string {
  const token = getStoredToken();
  if (token && Date.now() < token.expires_at - 60_000) {
    return token.access_token;
  }
  throw new Error("AUTH_EXPIRED");
}

/** Clear the cached token */
export function invalidateToken(): void {
  clearToken();
}
