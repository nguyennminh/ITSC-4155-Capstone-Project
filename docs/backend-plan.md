# Backend infrastructure plan

The delivered app is a frontend scaffold. The following is an implementation
contract for the team, not an already-running server or database.

## Small architecture

React UI -> one Node/Express API -> one database.
The API also calls a resume parser and an approved jobs provider.
Keep API credentials and resume processing on the server.

Suggested eventual folders:
server/index.js, server/routes/auth.js, server/routes/resumes.js,
server/routes/jobs.js, server/routes/applications.js, server/services/matching.js,
server/services/jobProvider.js, server/db/.

Start with a relational database your team knows; do not add microservices,
queues, containers or cloud infrastructure until a concrete need appears.

## API contract to implement

| Method | Path | Responsibility |
| --- | --- | --- |
| POST | /api/auth/register | Validate email, hash password, create account |
| POST | /api/auth/login | Validate credentials and issue secure session cookie |
| POST | /api/auth/logout | Invalidate server session |
| GET/PATCH | /api/profile | Read/update authenticated user's confirmed resume fields and preferences |
| POST | /api/resumes | Private multipart PDF/DOCX upload, validate size/type, return parsing status |
| GET | /api/resumes/:id | Owner-only extracted fields and processing state |
| GET | /api/jobs | Return normalized jobs with id, source, sourceId, title, company, location, mode, type, description, skills, applyUrl |
| GET/POST/DELETE | /api/saved-jobs | List/save/remove records scoped to current user |
| GET/POST/PATCH | /api/applications | List/start/update the user's tracker records |
| GET/PATCH | /api/recruiter/applicants | Authorized recruiter reads/updates applicants for jobs they own |

Use 400 for invalid input, 401 for no session, 403 for forbidden access, and 500
for internal failures. Return safe messages, not stack traces. Validate on the
server even when frontend validation already passed.

## Data model

users: id, email (unique), password_hash, role, created_at.
profiles: user_id (foreign key, unique), name, skills, experience, education,
certifications, preferences.
resumes: id, user_id, private_storage_key, original_name, status, created_at.
jobs: id, source, source_id (unique per source), employer_owner_id (optional),
normalized job fields, apply_url, expires_at.
saved_jobs: user_id + job_id unique pair.
applications: id, user_id, job_id, status, updated_at; unique user/job pair.
Recruiters must not automatically get access to saved jobs or private resumes.
Define consent and an actual application relationship before sharing profiles.

## Implementation order

1. Real backend registration/login with password hashing, secure HttpOnly
cookies, request limits and CSRF protection appropriate to session deployment.
2. Profile CRUD with ownership tests. Never trust a client-supplied user ID.
3. Private uploads: validate MIME/content and extension, 10 MB limit, parser
resource limits, reject unsafe files; delete obsolete private files safely.
4. Parse resume into editable structured fields; user confirms before matching.
5. Approved job API: server-only key, normalized fields, pagination, duplicates,
expiry, timeouts and retry/rate-limit handling. Confirm provider display rights.
6. Replace getJobs() with fetch('/api/jobs', { credentials: 'include' }).
7. Durable saved records and tracker records; then actual matching/feedback.
8. Recruiter ownership and applicant consent; prevent cross-employer access.

External Apply opens a validated HTTPS provider URL. Opening it creates Started,
not Applied. Let users confirm submission. Do not implement universal auto-apply
or automatically send resumes to employers without explicit consent.

## Configuration

Client dev server may proxy /api to http://localhost:3001 when the API exists.
Backend secrets: DATABASE_URL, SESSION_SECRET, JOBS_API_KEY, optional AI_API_KEY.
Commit an .env.example with names and empty values, never actual credentials.
The current app requires no environment variables and makes no external calls.

