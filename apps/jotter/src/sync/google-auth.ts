const CLIENT_ID = "669755857434-qvta604cln191dmgqh4pnvb9snd6dvq9.apps.googleusercontent.com";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_KEY = "jotter-gdrive-token";
const VERIFIER_KEY = "jotter-pkce-verifier";

function getRedirectUri(): string {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return `${location.protocol}//${location.host}`;
  }
  return "https://jotter.live";
}

interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// --- PKCE helpers ---

function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- Token storage ---

function getStoredToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function storeToken(token: StoredToken): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// --- Public API ---

export function isSignedIn(): boolean {
  return getStoredToken() !== null;
}

export async function signIn(): Promise<void> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });

  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

export function signOut(): void {
  clearToken();
}

export async function getAccessToken(): Promise<string> {
  const token = getStoredToken();
  if (!token) throw new Error("Not signed in to Google Drive");

  // If token expires within 5 minutes, refresh it
  if (Date.now() > token.expires_at - 5 * 60 * 1000) {
    return refreshAccessToken(token.refresh_token);
  }

  return token.access_token;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!resp.ok) {
    // If refresh fails, clear tokens — user needs to re-auth
    clearToken();
    throw new Error("Failed to refresh Google Drive token. Please sign in again.");
  }

  const data = await resp.json();
  const token: StoredToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + (data.expires_in as number) * 1000,
  };
  storeToken(token);
  return token.access_token;
}

/**
 * Call this on page load, before app init.
 * If the URL has a ?code= parameter from Google OAuth redirect,
 * exchanges it for tokens, stores them, and cleans the URL.
 */
export async function handleOAuthRedirect(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) {
    console.warn("OAuth code found but no PKCE verifier in sessionStorage");
    cleanUrl();
    return;
  }

  try {
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: getRedirectUri(),
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Token exchange failed: ${err}`);
    }

    const data = await resp.json();
    const token: StoredToken = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in as number) * 1000,
    };
    storeToken(token);
  } catch (err) {
    console.error("OAuth token exchange failed:", err);
  } finally {
    sessionStorage.removeItem(VERIFIER_KEY);
    cleanUrl();
  }
}

function cleanUrl(): void {
  const url = new URL(window.location.href);
  url.search = "";
  window.history.replaceState({}, "", url.toString());
}
