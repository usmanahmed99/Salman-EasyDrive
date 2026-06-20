# 03 — Admin authentication & route guard

**Goal:** Only authorized accounts reach the admin portal; the dev bypass works locally and is
disabled in production.
**Surface:** `/admin`, `/api/auth/*`, `/api/admin/me`.
**Data:** owner + notallowed aliases (see [00-synthetic-data.md](00-synthetic-data.md)).

---

## Part A — Developer sign-in (OAuth unconfigured)

### Setup

In `.dev.vars`, blank out Google OAuth, then restart `npm run dev`:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_EMAILS=easydrivingca+owner@gmail.com,easydrivingca@gmail.com
```

### AUTH-06 — Dev sign-in appears and works — **P1**

1. Open `http://localhost:5173/admin`.
2. **Expected:** Sign-in screen with "Sign in with Google" **and** "Developer sign-in (local)".
3. Click **Developer sign-in (local)**.
4. **Expected:** Portal loads; sidebar footer shows the owner email.
5. Open `http://localhost:5173/api/admin/me`.
6. **Expected:** JSON `{"user":{...,"role":"owner"}}`.
7. **Verify in D1** that a session + user row exist:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT email, role FROM users;"
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT COUNT(*) AS sessions FROM sessions;"
   ```

### AUTH-04 — Sign out

1. Click the **Sign out** icon in the sidebar footer.
2. **Expected:** Returns to the sign-in screen; `/api/admin/me` now returns **401**.

---

## Part B — Google OAuth (production-equivalent)

### Setup

Restore real credentials in `.dev.vars` and restart:

```text
GOOGLE_CLIENT_ID=<your client id>
GOOGLE_CLIENT_SECRET=<your client secret>
GOOGLE_REDIRECT_URI=http://localhost:8787/api/auth/google/callback
ADMIN_EMAILS=easydrivingca+owner@gmail.com,easydrivingca@gmail.com
```

In Google Cloud Console, add `http://localhost:8787/api/auth/google/callback` as an authorized
redirect URI, and add the owner Google account as a **test user**.

### AUTH-05 — Dev bypass is disabled — **P0**

1. Open `/admin`.
2. **Expected:** Only "Sign in with Google" — the developer button is **gone**.
3. In the browser console, attempt the bypass directly:

   ```js
   await fetch('/api/auth/dev-login', {method:'POST', credentials:'include'}).then(r=>r.status)
   ```

4. **Expected:** `404` (route inert when `GOOGLE_CLIENT_ID` is set).

### AUTH-02 — Authorized Google login — **P0**

1. Click **Sign in with Google**, choose the **owner** account (in `ADMIN_EMAILS`).
2. **Expected:** Redirects back to `/admin`, signed in. `/api/admin/me` returns the user.
3. **Verify:** a `google_connections` row exists with an **encrypted** refresh token:

   ```bash
   npx wrangler d1 execute easy-driving-booking --local --command "SELECT google_email, substr(encrypted_refresh_token,1,12) AS token_prefix, status FROM google_connections;"
   ```

   The token prefix is opaque base64 (contains a `.` IV separator), **not** a readable Google token.

### AUTH-03 — Unauthorized account rejected — **P0**

1. Sign out. Click **Sign in with Google**, choose `easydrivingca+notallowed@gmail.com`
   (not in `ADMIN_EMAILS`, and no existing user row).
2. **Expected:** Rejected with **"This Google account is not authorized"** (HTTP 403,
   `admin_not_allowed`). No session created.

### AUTH-07 — Redirect URI mismatch (negative)

1. Temporarily change `GOOGLE_REDIRECT_URI` to a value not registered in Google Console; restart.
2. Attempt sign-in.
3. **Expected:** Google shows **`redirect_uri_mismatch`** — confirms exact-match requirement.
4. Restore the correct URI and restart.

---

## AUTH-01 — Route guard (no session) — **P0**

1. In a private/incognito window (no cookies), open `http://localhost:5173/admin`.
2. **Expected:** Sign-in screen; admin screens not rendered.
3. Hit an admin API directly:

   ```bash
   curl -i http://localhost:8787/api/admin/centers
   ```

4. **Expected:** `401 Unauthorized` JSON.

---

## Pass criteria

AUTH-01, 02, 03, 05 (P0) pass. AUTH-04, 06, 07 (P1) pass. Leave the environment in
**OAuth-configured** state (Part B) for the remaining cases unless a case says otherwise.
