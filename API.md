# ATF Inc Recruitment Platform – API Reference

Base URL: `http://<host>:<port>/api`

Auth: JWT Bearer token unless marked Public. Roles are enforced per route.

---

## Auth (`/auth`)

- POST `/auth/login`
  - Body: `{ email, password }`
  - Returns: `{ token, user }`

- GET `/auth/profile` (Auth)
  - Returns: `{ user }` (current user profile)

- PUT `/auth/change-password` (Auth)
  - Body: `{ currentPassword, newPassword }`
  - Returns: `{ message }`

- POST `/auth/request-password-reset`
  - Body: `{ email }`
  - Returns: `{ message }` (best-effort)

- POST `/auth/reset-password-token`
  - Body: `{ token, newPassword, confirmPassword }`
  - Returns: `{ message }`

- POST `/auth/reset-password`
  - Body: `{ email, newPassword, confirmPassword }`
  - Returns: `{ message }`

---

## Users (`/users`) [Admin]

- GET `/users`
  - Query: `?status=active|inactive` (optional)
  - Returns: `{ users: [...] }`

- POST `/users`
  - Body: `{ name, email, password, status }`
  - Returns: `{ user }`

- PUT `/users/:id`
  - Body: `{ name?, email?, password?, status? }`
  - Returns: `{ user }`

- PUT `/users/:id/status`
  - Body: `{ status: 'active'|'inactive' }`
  - Returns: `{ user }`

- PUT `/users/:id/roles`
  - Body: `{ roles: ['HR','Interviewer',...] }`
  - Returns: `{ message }`

- DELETE `/users/:id`
  - Returns: `{ message }`

---

## Roles (`/roles`)

- GET `/roles` (Auth)
  - Returns: `{ roles: [...] }`

- POST `/roles` [Admin]
  - Body: `{ name, description }`
  - Returns: `{ role }`

- PUT `/roles/:id` [Admin]
  - Body: `{ name?, description? }`
  - Returns: `{ role }`

- DELETE `/roles/:id` [Admin]
  - Returns: `{ message }`

---

## Jobs (`/jobs`)

- GET `/jobs` [HR|Admin]
  - Purpose: List jobs for HR/Admin by status.
  - Query: `?status=active|archived` (default: active)
  - Returns: `{ jobs: [...] }`

- GET `/jobs/interviewer/:interviewerId` [Interviewer|HR|Admin]
  - Purpose: List jobs where the interviewer has assigned candidates.
  - Query: `?status=active|archived`
  - Returns: `{ jobs: [...] }` where interviewer is assigned

- GET `/jobs/:id` (Auth)
  - Purpose: Get a job and its rounds.
  - Returns: `{ job: { ..., rounds: [...] } }`

- POST `/jobs` [HR|Admin]
  - Purpose: Create a job and its interview rounds.
  - Body: `{ name, description, rounds: [{ name, start_date, end_date, duration_minutes, evaluation_parameters: [...] }] }`
  - Returns: `{ job }`

- PUT `/jobs/:id` [HR|Admin]
  - Purpose: Update a job and recreate its rounds.
  - Body: `{ name, description, rounds: [...] }` (recreates rounds)
  - Returns: `{ job }`

- PUT `/jobs/:id/status` [HR|Admin]
  - Purpose: Archive/activate a job.
  - Body: `{ status: 'active'|'archived' }`
  - Returns: `{ message, job }`

- DELETE `/jobs/:id` [HR|Admin]
  - Purpose: Delete a job (cascades to related records as configured).
  - Returns: `{ message, job }`

---

## Candidates (`/candidates`)

General

- GET `/candidates` [HR|Admin]
  - Purpose: List candidates for candidate management.
  - Query: `?status=active|inactive` (optional)
  - Returns: `{ candidates: [...] }`

- POST `/candidates` [HR|Admin]
  - Purpose: Create candidate(s), optionally tying to a round.
  - Multipart (optional resume file index-aligned with `candidates`)
  - Body: `{ candidates: [...], roundId }` (JSON string or object)
  - Returns: `{ message, candidates: [...], roundId }`

- POST `/candidates/standalone` [HR|Admin]
  - Purpose: Create a candidate not initially tied to a job.
  - Body: `{ name, email, ... }`
  - Returns: `{ message, candidate }`

- PUT `/candidates/:candidateId` [HR|Admin]
  - Purpose: Update a candidate's profile fields.
  - Body: partial candidate update
  - Returns: `{ message }`

- PUT `/candidates/:candidateId/status` [HR|Admin]
  - Purpose: Activate/deactivate a candidate.
  - Body: `{ status: 'active'|'inactive' }`
  - Returns: `{ message }`

- DELETE `/candidates/:candidateId` [HR|Admin]
  - Purpose: Permanently delete a candidate.
  - Returns: `{ message }`

Uploads & Parsing

- POST `/candidates/upload-resumes` [HR|Admin]
  - Purpose: Upload resumes and parse with OCR to prefill fields.
  - Multipart: `resumes[]` (PDF/DOC/DOCX)
  - Returns: `{ message, candidates: [...] }` (parsed fields)

- POST `/candidates/upload-certificates` [HR|Admin]
  - Purpose: Upload certificates associated with experiences.
  - Multipart: `certificates[]`
  - Returns: `{ message, urls: [...] }`

Round Assignments & Views

- POST `/candidates/:candidateId/round/:roundId/assign-interviewers` [HR|Admin]
  - Purpose: Assign one or more interviewers to a candidate for a round.
  - Body: `{ interviewerIds: [id,...] }`
  - Returns: `{ message }`

- GET `/candidates/interviewers` [HR|Admin]
  - Purpose: List active interviewers.
  - Returns: `{ interviewers: [{ id, name, email }] }`

- GET `/candidates/round/:roundId` (Auth)
  - Purpose: List candidates for a given round, optional by status.
  - Query: `?status=fresh|in_progress|scheduled|completed|rejected` (optional)
  - Returns: `{ candidates: [...] }` for round

- GET `/candidates/round/:roundId/interviewer/:interviewerId` [Interviewer|HR|Admin]
  - Purpose: List candidates assigned to an interviewer for a round.
  - Returns: `{ candidates: [...] }` assigned to interviewer in that round

- GET `/candidates/:candidateId/round/:roundId/interviewers` (Auth)
  - Purpose: List interviewers assigned to a candidate-round.
  - Returns: `{ interviewers: [...] }`

- GET `/candidates/round/:roundId/counts` (Auth)
  - Purpose: Aggregate counts by candidate status in a round.
  - Returns: `{ counts: { fresh, in_progress, scheduled, completed, rejected } }`

- GET `/candidates/available-for-job/:jobId` [HR|Admin]
  - Purpose: List candidates not yet in any round for the job.
  - Returns: `{ candidates: [...] }` not yet in any round for job

- POST `/candidates/add-to-round` [HR|Admin]
  - Purpose: Add multiple candidates to a specific round.
  - Body: `{ candidateIds: [...], roundId }`
  - Returns: `{ message }`

Status Transitions & Feedback

- POST `/candidates/:candidateId/round/:roundId/next` [Interviewer|HR|Admin]
  - Purpose: Move candidate forward in the pipeline or to next round.
  - Returns: `{ message, newStatus, movedToRoundId? }`

- PUT `/candidates/:candidateId/round/:roundId/status` (Auth)
  - Purpose: Manually set candidate status for a round.
  - Body: `{ status }`
  - Returns: `{ message, candidateRound }`

- POST `/candidates/:candidateId/round/:roundId/move-to-fresh` (Auth)
  - Purpose: Reset candidate status to fresh in a round.
  - Returns: `{ message, newStatus: 'fresh' }`

- POST `/candidates/:candidateId/round/:roundId/reject` (Auth)
  - Purpose: Mark candidate as rejected for a round.
  - Returns: `{ message, newStatus: 'rejected' }`

- POST `/candidates/:candidateId/round/:roundId/reject-with-reason` (Auth)
  - Purpose: Reject with an explicit reason.
  - Body: `{ reason }`
  - Returns: `{ message }`

- PUT `/candidates/:candidateId/round/:roundId/remarks` (Auth)
  - Purpose: Add or update HR/interviewer remarks for a round.
  - Body: `{ remarks }`
  - Returns: `{ message }`

- PUT `/candidates/:candidateId/round/:roundId/evaluation` (Auth)
  - Purpose: Save evaluation scores and feedback for a round.
  - Body: `{ evaluationScores, feedback }`
  - Returns: `{ message }`

- PUT `/candidates/:candidateId/round/:roundId/multi-evaluation` (Auth)
  - Purpose: Save multi-interviewer evaluations in one payload.
  - Body: `{ allEvaluations }` (multiple interviewers' inputs)
  - Returns: `{ message }`

- DELETE `/candidates/:candidateId/round/:roundId` [HR|Admin]
  - Purpose: Remove a candidate from a round (and related assignments).
  - Returns: `{ message }`

Utilities (Sheets Sync)

- GET `/candidates/sync-queue-status` [HR|Admin]
  - Returns: `{ queue: {...} }`

- POST `/candidates/clear-sync-queue` [Admin]
  - Returns: `{ cleared: number }`

---

## Calendar (`/calendar`)

- GET `/calendar/health` (Public)
  - Purpose: Health check for calendar routes.
  - Returns: `{ status, message }`

- POST `/calendar/generate-booking-link` [HR|Admin]
  - Purpose: Create a tokenized booking link for a candidate-round.
  - Body: `{ candidateId, roundId, interviewerIds: [...], windowStart, windowEnd, durationMinutes }`
  - Returns: `{ token, bookingUrl }` (share with candidate)

- GET `/calendar/available-slots/:token` (Public with Token)
  - Purpose: Get available slots for a candidate using their token.
  - Returns: `{ slots: [{ start, end }, ...] }`

- POST `/calendar/book-slot/:token` (Public with Token)
  - Purpose: Book a selected slot; creates Google Calendar event with Meet.
  - Body: `{ start }`
  - Returns: `{ message, scheduledTime, meetLink, eventId }`
  - Errors: `409` on conflict; retry with refreshed slots

- POST `/calendar/cleanup-tokens` [HR|Admin]
  - Purpose: Remove expired booking tokens.
  - Returns: `{ message }`

---

## Dashboard (`/dashboard`)

- GET `/dashboard/hr/summary` [HR|Admin]
  - Purpose: HR KPIs — jobs, candidates, and upcoming interviews count.
  - Returns: `{ jobs: { total, active, archived }, candidates: { total, active, inactive }, interviews: { upcoming7d } }`

- GET `/dashboard/hr/interviews` [HR|Admin]
  - Purpose: Candidate→interviewers mapping with job, round, and schedule.
  - Returns: `{ rows: [{ candidate_name, candidate_email, job_name, round_name, scheduled_time, meet_link, interviewers: [{ name }] }] }`

- GET `/dashboard/interviewer/upcoming` [Interviewer|HR|Admin]
  - Purpose: List upcoming interviews for the current (or specified) interviewer.
  - Query (HR/Admin only): `?interviewerId=<id>`
  - Returns: `{ upcoming: [{ scheduled_time, meet_link, candidate_name, candidate_email, job_name, round_name }] }`

---

## Notes

- Most endpoints require `Authorization: Bearer <JWT>` header.
- Role requirements are indicated per route.
- Dates/times are ISO 8601 strings unless noted.
- JSONB columns (e.g., `assigned_interviewers`, dashboard interviewers) expect proper JSON encoding.
