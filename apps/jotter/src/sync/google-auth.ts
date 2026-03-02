/**
 * Google Identity Services (GIS) based OAuth for Google Drive.
 *
 * Key design:
 * - signIn() is ONLY for user-gesture contexts (button clicks) — may popup
 * - refreshTokenSilently() is for background use — never popups, fails gracefully
 * - getAccessToken() tries silent refresh, throws AUTH_EXPIRED on failure
 * - Singleton promise prevents concurrent calls from clobbering each other
 * - Proactive refresh at 50min to avoid expiry during use
 */

const CLIENT_ID = "669755857434-qvta604cln191dmgqh4pnvb9snd6dvq9.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_KEY = "jotter-gdrive-token";
const REFRESH_MS = 50 * 60 * 1000; // 50 minutes

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
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

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
        scheduleProactiveRefresh();
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

// --- Proactive background refresh ---

function scheduleProactiveRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTokenSilently().catch(() => {});
  }, REFRESH_MS);
}

// On load, schedule refresh for existing token
{
  const token = getStoredToken();
  if (token) {
    const untilRefresh = Math.max(1000, token.expires_at - Date.now() - 10 * 60 * 1000);
    refreshTimer = setTimeout(() => refreshTokenSilently().catch(() => {}), untilRefresh);
  }
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
 * Request a token via GIS. May open a consent popup.
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

/**
 * Try to refresh the token silently (hidden iframe, no popup).
 * Returns the new token, or null if silent refresh fails.
 * Safe to call from timers, 401 handlers, or any background context.
 */
export function refreshTokenSilently(): Promise<string | null> {
  if (!hasToken()) return Promise.resolve(null);
  // Piggyback on an existing signIn if one is running
  if (pendingSignIn) return pendingSignIn.catch(() => null);

  return new Promise<string | null>((resolve) => {
    let settled = false;

    resolveAuth = (token) => {
      if (!settled) { settled = true; resolve(token); }
    };
    rejectAuth = () => {
      if (!settled) { settled = true; resolve(null); }
    };

    const client = getTokenClient();
    client.requestAccessToken({ prompt: "" });

    // Timeout: if GIS doesn't respond in 5s, fail silently
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
        resolveAuth = null;
        rejectAuth = null;
      }
    }, 5000);
  });
}

export function signOut(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const token = getStoredToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token, () => {});
  }
  clearToken();
  tokenClient = null;
  pendingSignIn = null;
}

/**
 * Get a valid access token for API calls.
 * Tries silent refresh if near expiry. NEVER opens a popup.
 * Throws Error("AUTH_EXPIRED") if token can't be refreshed silently.
 */
export async function getAccessToken(): Promise<string> {
  const token = getStoredToken();
  if (token && Date.now() < token.expires_at - 5 * 60 * 1000) {
    return token.access_token;
  }

  // Try silent refresh
  const refreshed = await refreshTokenSilently();
  if (refreshed) return refreshed;

  throw new Error("AUTH_EXPIRED");
}

/** Clear the cached token (e.g. on disconnect) */
export function invalidateToken(): void {
  clearToken();
}
