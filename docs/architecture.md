# Architecture

## Network Architecture
Text overview

- Client: Browser runs the Next.js frontend (`frontend/`).
- Frontend calls the Express backend API (`backend/`) over HTTP(S) using REST endpoints under `/api`.
- Backend connects to PostgreSQL for persistent data storage.
- File uploads are sent from frontend to backend and stored in Google Cloud Storage (GCS); URLs are saved in DB.
- Resume parsing is performed by Gemini OCR (File API) via backend utilities.
- Google Sheets API is used to create sheets and tabs per round and to update rows as candidates move between statuses.
- Slack API is used to ensure a job channel exists, post/pin the screening sheet, and invite participants.
- Email service is used for onboarding credentials, password resets (30-minute expiry links), rejection emails, and Slack workspace invites when needed.
- JWT tokens are included in Authorization headers for protected requests.

## Server Architecture
Text overview

- Entry point: Express application receives HTTP requests.
- Middleware layer: `authenticateToken` enforces JWT auth; `requireRole` gates role-based access; includes error handling.
- Routes layer: feature modules like `users`, `auth`, `candidates` (including rounds and assignments).
- Service layer: orchestrates business logic (e.g., `SheetSyncService` for sheet updates, transitions, and best‑effort syncs).
- Utilities: third-party adapters (`parser.js` for Gemini OCR, `gcs.js` for uploads, `sheets.js` for Google Sheets, `slack.js` for Slack actions).
- Database access: shared PostgreSQL pool for queries and transactions.
- External services: Gemini OCR, GCS, Google Sheets, Slack, Email providers.
- Response: handlers return JSON responses to the client after completing business logic and integrations.
