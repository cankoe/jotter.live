/**
 * Google Identity Services (GIS) OAuth for Google Drive.
 *
 * Key rule: requestAccessToken() ALWAYS opens a popup (GIS has no
 * silent/iframe mode). So we NEVER call it without a user gesture.
 *
 * - signIn() = user clicks a button → popup → token
 * - getAccessToken() = pure localStorage check → token or AUTH_EXPIRED
 * - No background refresh, no timers, no hidden iframes
 */

const CLIENT_ID = "669755857434-qvta604cln191dmgqh4pnvb9snd6dvq9.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_KEY = "jotter-gdrive-token";

interface StoredToken {
  access_token: string;
  expires_at: number;
}

// --- Token storage ---

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

// --- GIS token client (singleton) ---

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

// --- Public API ---

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
 * Request a token via GIS popup.
 * ONLY call from user-gesture contexts (button clicks).
 * Concurrent calls share the same promise (singleton).
 */
export function signIn(): Promise<string> {
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

export function signOut(): void {
  const token = getStoredToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token, () => {});
  }
  clearToken();
  tokenClient = null;
  pendingSignIn = null;
}

/**
 * Get a valid access token. Pure localStorage check.
 * NEVER calls GIS, NEVER opens a popup.
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
