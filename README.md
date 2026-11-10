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

Production defaults to `MATCHING_MODE=keyword`. This uses the existing skill-based
ranking without importing or downloading MiniLM, so browsing does not start a local
model on the Render instance. Greenhouse jobs, profile filters, match evidence, and
optional Gemini explanations remain available. For semantic ranking on a server
with sufficient resources, explicitly set `MATCHING_MODE=minilm`. Local development
still defaults to MiniLM. A Blueprint-managed service receives the keyword setting;
for an existing manually configured service, set it in Render's Environment page
and redeploy. This is a resource mitigation, not proof of the earlier restart cause.

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
4. Render runs `npm ci && npm run build`, then `npm start`. The service listens on Render's
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
