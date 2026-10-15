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
logout revokes it server-side and expires the cookie. Production requires HTTPS
and `APP_ORIGINS` configured with the site's allowed origins. Keep the existing
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
MFA, social login, and role-permission redesign are separate work.
