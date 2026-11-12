# ITSC-4155-Capstone-Project
UNC Charlotte Capstone Course (ITSC 4155 - Software Development)

Definition of Ready: Clear user story, testable acceptance criteria, an estimate of five
points or fewer, and no unresolved blockers.

Definition of Done: Reviewed, merged, and matching its acceptance criteria

## Persistent data

The API stores accounts, profiles, parsed resume drafts, uploaded resume files, sessions,
applications, and saved jobs. Each record is associated with the authenticated account; the
server derives that account from its session cookie rather than accepting a user ID from the
browser. Resume files (PDF/DOCX, up to 10 MB) are stored privately with the account, can be
downloaded while signed in, and can be deleted. Removing a saved job deletes that user's
saved-job record.

JobSwipe uses MongoDB for local development and production. The server requires
`MONGODB_URI` and starts listening only after connecting and checking its indexes.
Startup logs distinguish the MongoDB connection step from the HTTP server becoming
ready. Automated tests can inject an isolated SQLite fixture without connecting to
the team's database. Existing local SQLite files are not migrated by this change.

## Deploy on Render

The included `render.yaml` builds the Vite frontend and serves it with the Express API from
one Render web service. Persistent records are stored in MongoDB Atlas; the Render service's
local filesystem is not used as the production database.

MiniLM is prepared during the Render build and warmed in a worker thread after the
HTTP server starts. Requests use keyword ranking immediately while the model is
loading, unavailable, or serving another semantic request. Once ready, refresh
matches to use MiniLM. There are no runtime model downloads. The worker uses one
ONNX inference thread, a startup timeout, an inference timeout, and serialized
inference. It shares the instance's memory; this change does not guarantee that
a free instance has enough RAM. Set `MATCHING_MODE=keyword` and redeploy to disable
model loading, or use a larger instance if measurements show memory pressure.

Embedding vectors are cached in MongoDB's `embedding_cache` collection for 30 days.
Keys include the pinned model version, text hash, and account ID for profile vectors.
Job vectors are shared. Raw resume/profile text is not stored in this cache.
Changed text or a changed model version produces a new key. Deleting an account
removes its persisted profile vectors; cache failures fall back to computing vectors.
Cache records have no public API.

For an existing manually configured Render service, update its Build Command to
`npm ci --include=dev && npm run build:render` and set `MATCHING_MODE=minilm`.
Existing settings may override the Blueprint. Keep `MONGODB_URI` and health check
path `/api/health`. That endpoint reports `matching: loading|ready|unavailable|disabled`;
a missing model never makes the API health check fail. Logs report warm-up duration
and process RSS. A failed worker stays unavailable until restart rather than looping.

For local development, run `npm run model:prepare` once before `npm run server`.
The pinned model files are stored under `.cache/models/minilm`, ignored by Git.
`MINILM_MODEL_DIR` can override that location; it must be the same at build and runtime.
A failed model download fails the Render build so it cannot silently deploy missing
files. If you deliberately deploy without model files, choose keyword mode.

1. Create a MongoDB Atlas cluster and a database user with access to the application
   database. Configure Atlas network access to allow connections from Render. For services
   without static outbound IPs, Atlas may need a broad IP allowlist; use a private network or
   static outbound IP where available.
2. In Atlas, copy the application connection string and replace its username, password, and
   database name as needed. URL-encode special characters in the credentials.
3. In Render, create a new Blueprint from this repository and provide `MONGODB_URI` when
   prompted. The blueprint sets `DB_NAME=jobswipe`. Greenhouse is the default job source and needs no API key. Set
   `GREENHOUSE_BOARDS` if you want to override the default employer boards,
   and `GEMINI_API_KEY` if you want Gemini features.
4. Render runs `npm ci --include=dev && npm run build:render`, then `npm start`. The service listens on Render's
   assigned `PORT`; `/api/health` is its health check. The same-origin frontend/API setup
   does not require an `APP_ORIGINS` override.

For local development, copy `.env.example` to `.env` and set `MONGODB_URI` to a
development MongoDB database (local MongoDB or a separate Atlas database).
Set `DB_NAME` if using a database other than `jobswipe`. Then run
`npm run server` and `npm run dev` in separate terminals. Keep the production
database separate from local development and tests.

The Greenhouse provider already caches public job boards in memory for ten minutes.
This cache resets when the service restarts and is separate from saved jobs and
application history in MongoDB. Render's `/api/health` route does not read listings
or depend on the API rate limiter.

## Google sign-in

Google sign-in is optional and keeps email/password accounts working. Copy `.env.example`
to `.env` if needed, configure a Google OAuth **Web application** client, and set
`GOOGLE_CLIENT_ID`. In Render, add the same environment variable to the service and restart
it. Register the exact frontend origins in Google Cloud, including the Render HTTPS origin.

Existing accounts require their JobSwipe password once before Google is linked. New Google
users choose Job seeker or Recruiter. MongoDB Google sign-in uses transactions and requires
a replica set, as provided by Atlas. See [authentication setup and verification](docs/authentication.md#google-sign-in).

### Chrome autofill extension

See [installing and using JobSwipe Autofill](docs/local-application-review.md)
to fill supported Greenhouse applications from the regular JobSwipe app.

Discover reads hosted listings from Discord, Cloudflare, Figma, and Robinhood by default.
Set `GREENHOUSE_BOARDS` to a comma-separated list of up to eight Greenhouse board
names to override them. Only standard hosted Greenhouse URLs are included so the
Chrome extension can recognize the destination. Swipe right to open the employer
form in a new tab and record **Started**; choose **Save** to bookmark it instead.
For the legacy Adzuna provider, set `JOB_PROVIDER=adzuna` and configure its API keys.

## Recruiter applicant review

Recruiter accounts can review existing JobSwipe-tracked applications by job opening.
The dashboard does not import applicants who applied only on an employer's site.

1. For a demo, create a test recruiter with any email. In production, verify their
   employer before granting access. Obtain their account ID from the
   authenticated `/api/auth/me` response or your admin database.
2. Set `RECRUITER_COMPANIES` to a JSON object mapping account IDs to exact company
   names used in job listings, for example `{"recruiter-account-id":"Example Software"}`.
   On Render, set it in **Environment** and redeploy. Recruiters cannot grant
   themselves access by editing their profile.
3. As the job seeker, select **Mark applied & share** after completing the
   external application (or simulate it with demo data). If already marked
   **Applied**, select **Share with company**. This shares application details, contact information,
   relevant profile fields, and the current saved résumé. Applicants can stop sharing.
4. As the recruiter, open **Applicants** and select a job opening. Status updates
   appear on the applicant's Applications page after refresh.

Existing applications stay private until shared. Sensitive demographic fields
are not collected or displayed as part of applicant review.

For the demo company picker, set `DEMO_RECRUITER_IDS` and `DEMO_APPLICANT_IDS`
to the corresponding comma-separated JobSwipe test account IDs instead of
mapping the demo recruiter to one company. Use synthetic applicants and résumés.
Every company with an application shared by a listed demo applicant appears in
the picker. The demo recruiter cannot read or update any other applicant's data.
Leave both settings unset outside the demo.
