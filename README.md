# ATF Inc – Fall 2025 Intern Recruitment Platform

A full-stack recruitment platform for managing intern hiring rounds, with role-based access, resume parsing (Gemini OCR), Google Sheets sync, Slack notifications, and a modern HR workflow UI.

## Highlights

- **Role-based Access Control**: `Admin`, `HR`, `Interviewer`, `Technical Team`, `Management`.
- **Resume Upload + Parsing (OCR)**: Upload PDF/DOC/DOCX; parsed via Google Gemini File API; uploaded to cloud storage; auto-fills candidate details in the UI.
- **Rounds Management**: Create and manage interview rounds per job; move candidates across `fresh → in_progress → scheduled → completed`, accept/reject flows.
- **Certificates Upload**: Attach certificates to work experiences; URLs generated and visible in candidate profile.
- **Google Sheets Sync**: Best-effort sync of candidate/round updates to job-specific sheets.
- **Slack Automation**: Auto-create/invite to Round 2 Slack channels when a candidate advances.
- **Calendar Integration & Smart Scheduling**: Google Calendar integration with domain-wide delegation; live busy-time checks and server-side race-condition safeguards (advisory locks + conflict re-check) to prevent double-booking.
- **Admin Panel**: Manage users, roles, and status; activate/deactivate users.
- **Clean UI**: Next.js + shadcn/ui + TailwindCSS.

---

## End-to-End Quickstart

1. Install prerequisites
   - Node.js 18+ and npm
   - PostgreSQL 13+
   - A Google Workspace domain (for Calendar) and a Service Account with domain-wide delegation

2. Clone and install
   ```bash
   git clone <repo-url>
   cd fall25_intern_c_recruitment
   npm install
   cd frontend && npm install && cd ../backend && npm install && cd ..
   ```

3. Configure environments
   - Backend: create `backend/.env`
     ```env
     PORT=5000
     FRONTEND_URL=http://localhost:3000
     DATABASE_URL=postgres://user:pass@localhost:5432/atf_recruit
     JWT_SECRET=dev-secret
     
     # Google Service Account for Calendar (domain-wide delegation)
     GOOGLE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
     GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
     GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events,https://www.googleapis.com/auth/calendar.readonly
     GOOGLE_CALENDAR_IMPERSONATION_SUBJECT=<hr_or_interviewer_email_in_domain>
     
     # Optional integrations
     GCS_BUCKET=
     SLACK_BOT_TOKEN=
     SLACK_APP_TOKEN=
     ```
   - Frontend: create `frontend/.env.local`
     ```env
     NEXT_PUBLIC_API_URL=http://localhost:5000/api
     ```

4. Prepare database
   - Create a PostgreSQL database (e.g. `atf_recruit`) and apply schema from `database/schema.sql` if present.
   - The server ensures `password_resets` on boot; other tables come from schema/migrations.

5. Run
   ```bash
   # Terminal A
   cd backend
   npm run dev
   
   # Terminal B
   cd frontend
   npm run dev
   ```
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000/api

---

## Authentication & Login Flows

- **User login (HR/Interviewer/Management/Technical Team)**
  - URL: `/`
  - Calls `POST /api/auth/login`.
  - Issues a standard JWT (4h expiry) and redirects based on role.

- **Admin login (separate flow)**
  - URL: `/admin/login`
  - Calls `POST /api/auth/admin/login`.
  - Only users with the `Admin` role can authenticate.
  - Issues an admin-scoped JWT with `aud='admin'` and shorter expiry (default 1h).
  - Normal login rejects Admin users with `403` (admins must use the admin page).

- **Config (backend/.env)**
  - `JWT_SECRET` — standard user JWTs
  - `JWT_ADMIN_SECRET` — admin JWTs (recommended; falls back to `JWT_SECRET` if unset)

- **Tip**
  - Add a prominent link to `/admin/login` wherever appropriate in your deployment (e.g., footer or internal admin docs).

---

## Google Calendar Setup (for scheduling)

- Create a Google Cloud project and Service Account.
- Enable Google Calendar API.
- Grant domain-wide delegation to the Service Account in Workspace Admin.
- In backend `.env`, set `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `GOOGLE_CALENDAR_IMPERSONATION_SUBJECT` to an HR (or interviewer) user within your domain.
- Scopes required:
  - `https://www.googleapis.com/auth/calendar`
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/calendar.readonly`

The backend will:
- Read busy times for selected interviewers.
- Create Google Meet events and write `meet_link`, `calendar_event_id`, and `scheduled_time` into `candidate_rounds`.
- Guard against race conditions and conflicting bookings server-side.

---

## Booking Flow (Candidate self-scheduling)

- HR assigns interviewers to a candidate-round via the app.
- HR shares a booking link/token with the candidate.
- Candidate picks a slot; backend:
  - Re-validates availability (Google + DB), applies locks, creates the event.
  - Stores on `candidate_rounds`: `scheduled_time`, `meet_link`, `calendar_event_id`, and `assigned_interviewers` (JSON of interviewer names/ids where applicable).
  - Returns 409 if a collision occurs; the frontend refreshes slots automatically.

---

## Dashboards & Navigation

- HR Dashboard (`/hr/dashboard`):
  - KPIs: Total Jobs, Total Candidates, Upcoming Interviews (7d).
  - Click Total Jobs → Job Management; Total Candidates → Candidate Management.
  - Interviews Mapping: Candidate → Interviewers → Job → Round → Scheduled time, searchable/sortable with pagination.
- Interviewer Upcoming (`/interviewer/upcoming`):
  - List of the interviewer’s next interviews with time, candidate, job/round, and Meet link.

---

## Development Scripts

In `/backend`:
```bash
npm run dev   # start Express API with nodemon
```

In `/frontend`:
```bash
npm run dev   # start Next.js app
```

Root:
```bash
npm install   # installs both root and sub-package dependencies (see package.json)
```

---

## Deployment Notes

- Configure env vars per environment; never commit secrets.
- Ensure production CORS `FRONTEND_URL` is set.
- Harden rate limits (`server.js`) and logging.
- If using external object storage (GCS/S3), verify buckets and credentials.

---

## Troubleshooting (Quick)

- 401/403 on API calls
  - Verify JWT token issuance and `NEXT_PUBLIC_API_URL` in `frontend/.env.local`.
- Booking fails with JSON/JSONB errors
  - Ensure `candidate_rounds.assigned_interviewers` is `jsonb` and data is serialized via `JSON.stringify`.
- Calendar event fails to create
  - Check domain-wide delegation, scopes, and `GOOGLE_CALENDAR_IMPERSONATION_SUBJECT`.
- CORS issues
  - Confirm `FRONTEND_URL` in backend `.env` matches your frontend origin.

---

## Glossary

- Candidate Round: A candidate’s status and metadata within a specific job round.
- Interview Assignments: M:N mapping of interviewers to a candidate-round.
- Booking Token: Temporary tokenized link for candidate self-scheduling.

---

## Architecture

- **Frontend** (`frontend/`): Next.js app with client components under `frontend/components/`.
  - Example: `frontend/components/hr/CandidateForm.jsx` handles file upload, shows progress, and auto-fills using parse results.
- **Backend** (`backend/`): Express API with routes under `backend/routes/` and utilities under `backend/utils/`.
  - Example: `backend/routes/candidates.js` exposes resume upload, round status, interviewer assignment.
  - Example: `backend/utils/parser.js` integrates Gemini OCR for PDFs/DOC/DOCX.
- **Database**: PostgreSQL with tables for `users`, `roles`, `user_roles`, `candidates`, `candidate_rounds`, `interview_rounds`, `interview_assignments`, and more.
- **Cloud + Integrations**:
  - GCS (or compatible) upload in `backend/utils/gcs.js` for resumes/certificates.
  - Google Sheets helpers in `backend/utils/sheets.js`.
  - Slack workflows in `backend/utils/slack.js`.

## Tech Stack

- **Frontend**: Next.js, React, shadcn/ui, TailwindCSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **Auth**: JWT (see `backend/middleware/auth.js`, `frontend/lib/auth.js`)
- **OCR/Parsing**: Google Gemini File API via `parseResumeFromPdfBuffer()`
- **Storage**: Google Cloud Storage (configurable)
- **Tooling**: Multer for uploads, Lucide icons for UI

---

## Features (Detailed)

- **Authentication & Roles**
  - JWT-based login; protected routes with `authenticateToken` and `requireRole` middlewares.
  - Roles: Admin, HR, Interviewer, Technical Team, Management.

- **Candidate Management**
  - Create standalone or job-specific candidates.
  - Store `name`, `email`, `contact`, `college_name`, `degree`, `graduation_year`, `years_experience`, `skills_summary`, `remarks`, `resume_url`.
  - Work experiences list with certificate uploads and URLs.

- **Resume Upload & Parsing**
  - Endpoint: `POST /api/candidates/upload-resumes`.
  - Accepts PDF/DOC/DOCX; uploads to storage; parses with Gemini OCR; returns `candidates: [...]` enriched with extracted fields.
  - Frontend `CandidateForm.jsx` auto-fills fields after upload.

- **Rounds & Status Flow**
  - Per job: multiple interview rounds; each candidate-round has a status.
  - Endpoints to move next, reject, move-to-fresh, etc.
  - Advancing to Round 2 triggers Slack channel creation/invite (best effort).

- **Google Sheets Sync**
  - Best-effort sync on status changes, assignments, and candidate creation.

- **Interview Assignments**
  - Assign one or more interviewers to a candidate for a round.

---

## Project Structure

```
backend/
  routes/
    candidates.js          # candidates, rounds, upload-resumes, certificates, assignments, etc.
  utils/
    parser.js              # Gemini OCR parsing
    gcs.js                 # GCS file uploads
    sheets.js              # Google Sheets sync
    slack.js               # Slack workflows
  middleware/
    auth.js                # JWT auth + role checks
frontend/
  components/
    hr/CandidateForm.jsx   # Resume upload, auto-fill, experiences & certificates
  lib/
    auth.js                # Auth token helpers
database/
  schema.sql               # DB schema and seed helpers
```

---

## Environment Variables

Create and configure the following. Examples may exist in `backend/.env.example`.

- **Backend (`backend/.env`)**
  - `DATABASE_URL` – PostgreSQL connection string
  - `JWT_SECRET` – JWT signing key
  - `PORT` – API port (default 5000)
  - `GCS_BUCKET` – GCS bucket name (if using GCS)
  - `GCS_PROJECT_ID`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY` – Service account creds
  - `SHEETS_CREDENTIALS` / `GOOGLE_APPLICATION_CREDENTIALS` – Google API creds
  - `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` – Slack bot credentials (optional)

- **Frontend (`frontend/.env.local`)**
  - `NEXT_PUBLIC_API_URL` – API base URL (e.g., `http://localhost:5000/api`)

---

## Setup & Run (Development)

1. Install dependencies
   ```bash
   npm install
   cd frontend && npm install
   cd ../backend && npm install
   ```

2. Database
   - Create a PostgreSQL DB.
   - Run `database/schema.sql`.
   - Configure `backend/.env` with `DATABASE_URL`.

3. Environment
   - Copy `backend/.env.example` to `backend/.env` and update values.
   - Create `frontend/.env.local` with `NEXT_PUBLIC_API_URL`.

4. Run
   - Root script (if present):
     ```bash
     npm run dev
     ```
   - Or run separately:
     ```bash
     # Terminal A
     cd backend
     npm run dev

     # Terminal B
     cd frontend
     npm run dev
     ```

---

## API Overview (Selected)

- `POST /api/candidates/upload-resumes`
  - Upload PDF/DOC/DOCX; returns `candidates: [ { name, email, contact, college_name, degree, graduation_year, years_experience, skills_summary, work_history, resume_url, ... } ]`.

- `POST /api/candidates`
  - Create candidate(s); can accept file(s) and metadata; ties to a round if `roundId` provided.

- `POST /api/candidates/:candidateId/round/:roundId/next`
  - Move candidate forward within a round, or into the next round if completed.

- `POST /api/candidates/:candidateId/round/:roundId/reject`
  - Reject candidate in a round.

- `GET /api/candidates/round/:roundId`
  - List candidates for a round (optionally filter by `status`).

- `POST /api/candidates/upload-certificates`
  - Upload certificate files; returns public URLs.

- `POST /api/candidates/:candidateId/round/:roundId/assign-interviewers`
  - Assign interviewer IDs to a candidate for a round.

Authentication: All endpoints require JWT and role checks as noted in the route definitions.

---

## User Flows

- **Admin**
  - Manage users and roles (activate/deactivate, assign roles).
  - Oversee jobs and rounds configuration.

- **HR – Add Candidate**
  - Open HR dashboard → Add Candidate.
  - Upload resume (PDF/DOC/DOCX).
  - Wait for auto-fill (Gemini OCR). Adjust details as needed.
  - Optionally add work experiences and upload certificates.
  - Save candidate (optionally tie to a job/round).

- **HR – Manage Rounds**
  - View candidates by round and status.
  - Move next / schedule / complete / reject.
  - On move to Round 2, Slack channel automation may trigger.
  - Sheets sync runs in the background (best effort).

- **Interviewer**
  - View assigned candidates.
  - See candidate details, resume link, and certificates.
  - Provide feedback/scores (if configured in UI).

---

## Security & Notes

- JWT tokens are required for protected routes. Keep `JWT_SECRET` safe.
- Do not commit service account credentials. Use environment variables/secrets.
- OCR uses external APIs; ensure keys and quotas are configured.
- File uploads are validated and size-limited with Multer.

## Troubleshooting

- Resume upload returns 401/403
  - Check auth token in `frontend/lib/auth.js` and `NEXT_PUBLIC_API_URL`.
- Fields not auto-filling
  - Verify `POST /api/candidates/upload-resumes` returns parsed fields.
  - Ensure `backend/utils/parser.js` returns `college_name`, `degree`, `graduation_year`, etc.
- Google Sheets or Slack not triggering
  - Confirm corresponding env vars and service/bot permissions.

---

## License

Proprietary – ATF Inc. Internal use for intern recruitment.