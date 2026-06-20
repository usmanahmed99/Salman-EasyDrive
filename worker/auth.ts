import type { Env, SessionUser } from "./types";
import { cookie, encrypt, getCookies, HttpError, randomToken, sha256, uuid } from "./utils";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const raw = getCookies(request).eds_session;
  if (!raw) return null;
  const hash = await sha256(raw);
  const row = await env.DB.prepare(`
    SELECT users.id, users.email, users.name, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.id_hash = ? AND sessions.expires_at > datetime('now') AND users.enabled = 1
  `).bind(hash).first<SessionUser>();
  if (row) {
    env.DB.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id_hash = ?").bind(hash).run().catch(() => undefined);
  }
  return row || null;
}

export async function requireUser(request: Request, env: Env) {
  const user = await getSessionUser(request, env);
  if (!user) throw new HttpError(401, "Please sign in to continue.", "unauthorized");
  return user;
}

const LOGIN_SCOPES = ["openid", "email", "profile"];
const CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events"
];

export function googleAuthorizationUrl(env: Env, state: string, purpose: "login" | "calendar") {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    scope: (purpose === "calendar" ? CALENDAR_SCOPES : LOGIN_SCOPES).join(" ")
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function handleGoogleStart(env: Env, purpose: "login" | "calendar" = "login") {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(503, "Google OAuth is not configured.", "oauth_not_configured");
  }
  // Encode the purpose into the state value so the callback can read it without
  // an extra cookie. Format: "<purpose>:<randomToken>"
  const state = `${purpose}:${randomToken(24)}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: googleAuthorizationUrl(env, state, purpose),
      "Set-Cookie": cookie("eds_oauth_state", state, { maxAge: 600, sameSite: "Lax" })
    }
  });
}

export async function handleGoogleCallback(request: Request, env: Env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getCookies(request).eds_oauth_state;
  if (!code || !state || !expectedState || state !== expectedState) {
    throw new HttpError(400, "OAuth state validation failed.", "invalid_oauth_state");
  }

  // State format is "<purpose>:<token>". Fall back to "login" for legacy states
  // that predate this format (no colon separator).
  const colonIdx = state.indexOf(":");
  const purpose = colonIdx > 0 ? state.slice(0, colonIdx) : "login";

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code"
    })
  });
  const token = await tokenResponse.json() as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !token.access_token) {
    console.error("[google_oauth] token exchange failed", { status: tokenResponse.status, error: token.error, error_description: token.error_description });
    throw new HttpError(502, token.error_description || "Google sign-in failed.", "google_oauth_failed");
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const profile = await profileResponse.json() as { email: string; name?: string };
  if (!profile.email) throw new HttpError(502, "Google did not return an email address.", "google_profile_failed");

  const allowlist = (env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const existing = await env.DB.prepare("SELECT id, role FROM users WHERE email = ?").bind(profile.email.toLowerCase()).first<{ id: string; role: string }>();
  if (allowlist.length && !allowlist.includes(profile.email.toLowerCase()) && !existing) {
    throw new HttpError(403, "This Google account is not authorized.", "admin_not_allowed");
  }

  const userId = existing?.id || uuid();
  await env.DB.prepare(`
    INSERT INTO users(id, email, name, role) VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP
  `).bind(userId, profile.email.toLowerCase(), profile.name || profile.email, existing?.role || "owner").run();

  // Only store the calendar refresh token when this was an explicit calendar-connect
  // flow. Login-only OAuth uses minimal scopes and must never displace the system
  // calendar connection that belongs to the designated calendar account.
  if (purpose === "calendar" && token.refresh_token) {
    const encryptedToken = await encrypt(env.TOKEN_ENCRYPTION_KEY, token.refresh_token);
    await env.DB.prepare("DELETE FROM google_connections WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare(`
      INSERT INTO google_connections(id, user_id, google_email, encrypted_refresh_token, scopes)
      VALUES (?, ?, ?, ?, ?)
    `).bind(uuid(), userId, profile.email, encryptedToken, token.scope || "").run();
  }

  const rawSession = randomToken(32);
  const sessionHash = await sha256(rawSession);
  const csrf = randomToken(18);
  const expires = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions(id_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(sessionHash, userId, csrf, expires).run();

  const headers = new Headers({
    Location: `${env.APP_BASE_URL.replace(/\/$/, "")}/admin`,
    "Set-Cookie": cookie("eds_session", rawSession, { maxAge: SESSION_TTL_SECONDS, sameSite: "Lax" })
  });
  headers.append("Set-Cookie", cookie("eds_oauth_state", "", { maxAge: 0, sameSite: "Lax" }));
  return new Response(null, { status: 302, headers });
}

export function devLoginAvailable(env: Env) {
  // The dev bypass is only active when Google OAuth is not configured, which is the
  // case for local development. Once GOOGLE_CLIENT_ID is set (cloud), this is inert.
  return !env.GOOGLE_CLIENT_ID;
}

export async function handleDevLogin(request: Request, env: Env) {
  if (!devLoginAvailable(env)) {
    throw new HttpError(404, "Not found.", "not_found");
  }
  const email = ((env.ADMIN_EMAILS || "owner@example.com").split(",")[0] || "owner@example.com").trim().toLowerCase();
  const name = email.split("@")[0].replace(/(^|[._-])(\w)/g, (_, sep, ch) => (sep ? " " : "") + ch.toUpperCase()).trim() || "Owner";

  const existing = await env.DB.prepare("SELECT id, role FROM users WHERE email = ?").bind(email).first<{ id: string; role: string }>();
  const userId = existing?.id || uuid();
  await env.DB.prepare(`
    INSERT INTO users(id, email, name, role) VALUES (?, ?, ?, 'owner')
    ON CONFLICT(email) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP
  `).bind(userId, email, name).run();

  const rawSession = randomToken(32);
  const sessionHash = await sha256(rawSession);
  const csrf = randomToken(18);
  const expires = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions(id_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(sessionHash, userId, csrf, expires).run();

  return new Response(JSON.stringify({ user: { id: userId, email, name, role: existing?.role || "owner" } }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": cookie("eds_session", rawSession, { maxAge: SESSION_TTL_SECONDS, sameSite: "Lax" })
    }
  });
}

export async function logout(request: Request, env: Env) {
  const raw = getCookies(request).eds_session;
  if (raw) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(raw)).run();
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": cookie("eds_session", "", { maxAge: 0 }) }
  });
}
