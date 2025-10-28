# API (Selected)

Note: This is a selected reference based on implemented routes in `backend/routes/candidates.js` and common auth/user flows used by the frontend.

## Candidates
- `POST /api/candidates/upload-resumes`
  - Upload PDF/DOC/DOCX file(s); returns parsed fields and `resume_url` after OCR (Gemini) and storage (GCS).
- `POST /api/candidates/upload-certificates`
  - Upload certificates; returns array of URLs.
- `GET /api/candidates/round/:roundId`
  - List candidates for a round; optional `?status=` filter.
- `POST /api/candidates/:candidateId/round/:roundId/next`
  - Advance status within the round or move to next round when `completed`.
- `POST /api/candidates/:candidateId/round/:roundId/reject`
  - Mark as `rejected` (frontend may collect reasons prior to this call).
- `PUT /api/candidates/:candidateId/round/:roundId/status`
  - Set explicit status among `fresh|in_progress|scheduled|completed|rejected`.
- `POST /api/candidates`
  - Create candidate(s); when `roundId` is provided, adds to that round.

## Jobs
- Common operations used by frontend (`jobService`):
  - `GET /api/jobs?status=active|archived`
  - `GET /api/jobs/:id`
  - `POST /api/jobs` (HR only)
  - `PUT /api/jobs/:id` (HR only)
  - `PUT /api/jobs/:id/status` (archive/activate) (HR only)
  - `DELETE /api/jobs/:id` (HR only)

## Users & Auth
- `POST /api/auth/login` → JWT
- `POST /api/auth/reset-link` → sends 30m reset link
- `POST /api/auth/reset` → consume token to set new password
- `GET /api/users` (Admin)
- `POST /api/users` (Admin)
- `PUT /api/users/:id` (Admin)
- `PUT /api/users/:id/status` (Admin)
- `DELETE /api/users/:id` (Admin)
- `PUT /api/users/:id/roles` (Admin)

All protected endpoints require `Authorization: Bearer <token>` and role checks.
