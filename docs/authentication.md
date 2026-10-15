# Account authentication

Registration retains name (1–100 characters after trimming), email, password,
and the optional role (`Job seeker` by default, or `Recruiter`). Emails are
trimmed, lowercased, validated, and limited to 254 characters. Passwords contain
10–128 characters and are never trimmed.

| Endpoint | Success | Failure |
| --- | --- | --- |
| `POST /api/auth/register` | `201 { user }`, signed in immediately | `400` invalid fields; `409` email already registered |
| `POST /api/auth/login` | `200 { user }`, fresh session | `400` invalid fields; `401` incorrect email or password |
| `GET /api/auth/me` | `200 { user }` or `{ user: null }` | Connection/server errors remain retryable |
| `POST /api/auth/logout` | `200 { ok: true }`, including when already signed out | Server errors leave the UI available for retry |

Errors use `{ error: message }`. Unknown accounts and incorrect passwords both
return `Incorrect email or password.` Protected APIs return `401` without a
valid session. Public user objects never include password hashes or session
tokens. Job-seeker registration opens onboarding; recruiter registration opens
the existing recruiter view.

Passwords use salted scrypt hashes. Sessions use random tokens in HttpOnly,
SameSite=Strict cookies (Secure in production), store only token hashes, and
expire after seven days. Login and registration replace the current session;
logout revokes it server-side and expires the cookie. Production requires HTTPS.
Set `APP_ORIGINS` for an explicit frontend allowlist; otherwise the current
site origin and localhost development origins are allowed. Keep the existing
same-origin API deployment and origin checks.

Registration and login share an attempt limit of 20 requests per minute per IP.
Session restoration and logout are outside that attempt limit; all API requests
retain the general 120-request-per-minute limit. A protected API's `401` returns
the UI to login and clears personal state. Authentication errors on the login
form stay on that form.

## Delivery stages

1. Record and verify the existing authentication contract.
2. Handle duplicate account creation reliably and verify credential storage.
3. Verify session protection, logout, and authentication throttling.
4. Complete validation feedback and expired-session handling in the UI.
5. Add dedicated acceptance coverage and run the full verification suite.

Run the relevant checks and make one local commit after each stage. Do not push.
Preserve unrelated working-tree changes. Password reset, email verification,
MFA, and role-permission redesign are separate work. Google sign-in is described below.

## Acceptance coverage and verification

| Acceptance criterion | Coverage |
| --- | --- |
| Create an account with valid information | API validation and password boundaries; browser registration and onboarding |
| Reject an email already in use | Normalized and simultaneous duplicate API requests; browser conflict and recovery |
| Log in with valid credentials | API session issuance; browser reload, logout, and return to the same account |
| Reject invalid credentials with an appropriate error | API uniform credential errors; browser errors, retries, and throttling feedback |
| Never store plaintext passwords | Stored-hash verification, unique salt checks, password whitespace preservation, and public-response exclusions |
| Log out successfully | Server revocation, cookie expiry, token replay rejection, repeated logout, and browser logout/retry |

Earlier password-authentication verification on 2026-10-15 (before this branch's
job-provider changes; current Google implementation results appear below):

- `node --test test/auth.test.js test/auth-client.test.js`: all 11 tests pass.
- Browser suite: all nine tests pass, including eight authentication scenarios
  and the existing resume regression. The existing test now uses accessible
  textbox names for populated textareas and waits for logout before filling
  the login form. A temporary configuration selected the downloaded Chromium
  executable because the local Playwright installer stalled during extraction;
  application configuration and test-server behavior were unchanged.
- `npm run build`: passes.
- `npm test`: 25 tests pass; the existing AI-ranking test cannot load because
  `server/services/jobProvider.js` is missing. Restoring that unrelated module
  is outside this authentication change.

For a standard browser setup, run `npx playwright install chromium`, then
`npm run test:e2e`. Tests use temporary databases and fictional account data.

## Google sign-in

Google supplements email/password using the official Google Identity Services
button and popup callback. No One Tap, Google API authorization, access/refresh
token storage, client secret, account unlinking, or password creation/reset is
included.

### Setup

1. Configure branding, audience, support contact, and test users in a Google
   Cloud project's Google Auth Platform. Create an OAuth client of type
   **Web application**.
2. Register the exact frontend JavaScript origins used by the application:
   `http://localhost:5173`, `http://127.0.0.1:5173`, and the deployed HTTPS origin
   as applicable. This popup callback flow does not use a redirect URI.
3. Set server-side `GOOGLE_CLIENT_ID` in `.env` locally or in Render's service
   environment, then restart the API. The public client ID is supplied at
   runtime; no frontend build variable or client secret is required. The
   Gemini API key is unrelated to Google authentication.
4. Keep the frontend and API on the same origin. Use HTTPS and
   `NODE_ENV=production` for Secure cookies. If hosting adds a Content Security
   Policy or cross-origin opener policy, allow GIS resources and popup support
   as described in Google's setup guide.

When the client ID is absent, the Google control is omitted and password
authentication remains usable. Production MongoDB must support transactions
(a replica set or sharded cluster); MongoDB Atlas provides this. A standalone
local MongoDB server can still serve existing password flows, but use a local
replica set or SQLite to test Google sign-in.

References: [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid),
[button integration](https://developers.google.com/identity/gsi/web/guides/display-button),
[token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token),
[MongoDB transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

### API and account behavior

All endpoints require an allowed `Origin`, JSON content type, and the
same-origin browser cookie. Configured Google endpoints share the existing
20-attempts/minute/IP authentication limiter. An unconfigured start probe only
uses the general API limiter. Responses are uncached; errors use `{ error }`.

| Endpoint | Request | Success |
| --- | --- | --- |
| `POST /api/auth/google/start` | `{}` | `{ enabled: true, clientId, nonce }`, or `{ enabled: false }` |
| `POST /api/auth/google` | `{ credential }` | `200 { user }` or `202 { nextStep, email, name }` |
| `POST /api/auth/google/complete` | `{ name, role }` or `{ password }` | `200 { user }`, or `202` when another completion step is required |

`nextStep` is `complete_profile` or `confirm_password`. New users confirm their
name (1–100 trimmed characters) and choose `Job seeker` or `Recruiter`. Job
seekers enter existing onboarding; recruiters enter the recruiter view.
Google email verification does not set the resume/profile `confirmed` flag.

A Google email matching a password account always requires that account's
password once before linking. Its ID, role, email, profile, resume drafts,
saved jobs, applications, and password access are preserved. Returning users
are identified by Google `sub`, even if their Google email changes. Another
Google identity cannot claim an already-linked account through a matching email.

### Security and storage

The backend uses `google-auth-library` to validate token signatures, issuer,
client audience, and expiry, and requires a subject, verified email, and matching
nonce. ID tokens are never placed in URLs, persistent browser storage, or logs.

Each attempt uses a random HttpOnly, SameSite=Strict cookie, scoped to
`/api/auth/google` and Secure in production. Storage retains only its token
hash, nonce hash, expiry, and necessary verified identity claims. Attempts last
five minutes; restarting replaces the previous attempt. Nonce verification is
atomic. Completing authentication consumes the attempt, with identity attachment
and account creation in the same database transaction. Unique constraints
prevent duplicate email accounts and multiple Google identities per user.
Password proofs are bound to the exact existing account and password hash.

SQLite schema version 1 makes `password_hash` nullable while preserving user
IDs and all foreign-key relationships. MongoDB requires no rewrite of existing
accounts. Both use `google_identities` and `google_attempts`; MongoDB adds unique
indexes and an attempt-expiry TTL index. Queries enforce expiry independently
of TTL cleanup. SQLite prunes expired attempts when new ones start.

Successful sign-in rotates the existing seven-day application session. Logout
revokes that session without signing the user out of their Google account.
Invalid credentials or expired attempts return `401`, provider outages and
database failures `503`, invalid fields `400`, identity conflicts `409`,
disallowed origins `403`, unsupported content types `415`, and throttling `429`.
Authentication failures stay on the login form, with recovery and restart controls.

### Verification and rollout

- Run `npm test`, `npm run build`, and `npm run test:e2e`.
- Google API tests validate real RSA signatures using the production verifier
  and run account scenarios against SQLite. Set `GOOGLE_AUTH_TEST_MONGODB_URI`
  to an isolated test replica set to run the same scenarios against MongoDB.
  Tests create and drop uniquely named `jobswipe_google_test_*` databases;
  never point this variable at a production deployment.
- Browser tests stub GIS and Google API responses, covering both roles,
  linking, cancellation, load/provider/network errors, expiry, session
  restoration, logout, and duplicate submissions. Production has no test bypass.
- Back up the database before deploying. SQLite migration runs on startup;
  MongoDB startup creates indexes without altering existing account records.
  Verify existing password sign-in, saved jobs, applications, and resume data.
- Before enabling production, perform a real Google popup smoke test with
  configured test users: new users in both roles, password-confirmed linking,
  returning sign-in, cancellation, reload, and logout. Automated tests use
  fictional credentials and do not replace this provider check.
- To disable Google, unset `GOOGLE_CLIENT_ID` and restart. Keep the migrated
  schema and a compatible app version; Google-only accounts require Google to
  sign in and must not be assigned an invented password.

Google implementation verification on 2026-10-15:

- All 60 unit/API checks pass with the MongoDB integration scenarios enabled,
  using a temporary local MongoDB replica set. This includes the standard
  suite and eight additional production-adapter scenarios.
- The production build passes. All nine Google browser scenarios and all eight
  existing password-authentication scenarios pass.
- Two existing job/resume browser tests fail because they expect recommendations
  before the current consent/ranking flow. Both failures were reproduced at the
  same assertions in an unchanged `HEAD` copy, without Google implementation
  changes. Job behavior and those tests were left unchanged.
- Browser verification used isolated local ports, a temporary database, and
  the installed Chromium executable. Real-provider popup testing remains a
  prerequisite before enabling production Google sign-in.
