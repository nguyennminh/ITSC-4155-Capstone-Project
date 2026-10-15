# ITSC-4155-Capstone-Project
UNC Charlotte Capstone Course (ITSC 4155 - Software Development)

Definition of Ready: Clear user story, testable acceptance criteria, an estimate of five
points or fewer, and no unresolved blockers.

Definition of Done: Reviewed, merged, and matching its acceptance criteria

## Persistent data

The API stores accounts, profiles, resume drafts, sessions, applications, and saved jobs.
Each record is associated with the authenticated account; the server derives that account
from its session cookie rather than accepting a user ID from the browser. Removing a saved
job deletes that user's saved-job record.

For local development, the server uses SQLite at `server/data/jobswipe.sqlite` by default.
When `MONGODB_URI` is set, it uses MongoDB instead. Production startup refuses to use
SQLite, so a deployment cannot silently fall back to an ephemeral local database. Database
read/write failures are logged by the server and returned as a retryable API error.

## Deploy on Render

The included `render.yaml` builds the Vite frontend and serves it with the Express API from
one Render web service. Persistent records are stored in MongoDB Atlas; the Render service's
local filesystem is not used as the production database.

1. Create a MongoDB Atlas cluster and a database user with access to the application
   database. Configure Atlas network access to allow connections from Render. For services
   without static outbound IPs, Atlas may need a broad IP allowlist; use a private network or
   static outbound IP where available.
2. In Atlas, copy the application connection string and replace its username, password, and
   database name as needed. URL-encode special characters in the credentials.
3. In Render, create a new Blueprint from this repository and provide `MONGODB_URI` when
   prompted. The blueprint sets `DB_NAME=jobswipe`. Configure `ADZUNA_APP_ID`,
   `ADZUNA_APP_KEY`, and `GEMINI_API_KEY` in the Render service if those integrations are
   enabled for the deployment.
4. Render runs `npm ci && npm run build`, then `npm start`. The service listens on Render's
   assigned `PORT`; `/api/health` is its health check. The same-origin frontend/API setup
   does not require an `APP_ORIGINS` override.

For local MongoDB development, set `MONGODB_URI` and optionally `DB_NAME` in an untracked
`.env` file. Without a MongoDB URI, non-production runs continue to use local SQLite.
