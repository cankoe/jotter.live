/**
 * Google Identity Services (GIS) based OAuth for Google Drive.
 *
 * Uses a popup flow — no redirects, no client secret, no PKCE.
 * Access tokens are short-lived (1 hour). When expired, the user
 * clicks Sync again and GIS silently refreshes or re-prompts.
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
  const token: StoredToken = {
    access_token: accessToken,
    expires_at: Date.now() + expiresIn * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// --- GIS token client ---

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let resolveAuth: ((token: string) => void) | null = null;
let rejectAuth: ((err: Error) => void) | null = null;

function getTokenClient(): google.accounts.oauth2.TokenClient {
  if (tokenClient) return tokenClient;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      if (response.error) {
        rejectAuth?.(new Error(response.error_description || response.error));
        rejectAuth = null;
        resolveAuth = null;
        return;
      }
      const expiresIn = parseInt(response.expires_in, 10) || 3600;
      storeToken(response.access_token, expiresIn);
      resolveAuth?.(response.access_token);
      resolveAuth = null;
      rejectAuth = null;
    },
    error_callback: (err) => {
      rejectAuth?.(new Error(err.message || "OAuth popup error"));
      rejectAuth = null;
      resolveAuth = null;
    },
  });

  return tokenClient;
}

// --- Public API ---

export function isSignedIn(): boolean {
  const token = getStoredToken();
  return token !== null && Date.now() < token.expires_at;
}

export function hasToken(): boolean {
  return getStoredToken() !== null;
}

/**
 * Request an access token via GIS popup.
 * If user has an active Google session, this may resolve silently.
 * Otherwise, a consent popup opens.
 */
export function signIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    resolveAuth = resolve;
    rejectAuth = reject;
    const client = getTokenClient();
    if (hasToken()) {
      // Try silent refresh first
      client.requestAccessToken({ prompt: "" });
    } else {
      client.requestAccessToken({ prompt: "consent" });
    }
  });
}

export function signOut(): void {
  const token = getStoredToken();
  if (token) {
    // Revoke the token at Google
    google.accounts.oauth2.revoke(token.access_token, () => {});
  }
  clearToken();
  tokenClient = null;
}

/**
 * Get a valid access token. If expired, triggers a refresh via GIS.
 * May open a popup if the Google session has expired.
 */
export async function getAccessToken(): Promise<string> {
  const token = getStoredToken();
  if (token && Date.now() < token.expires_at - 60 * 1000) {
    return token.access_token;
  }
  // Token expired or missing — request a new one
  return signIn();
}
