# Integrations

## Google Sheets

Text overview

- On job creation, the backend creates a Google Sheet and one tab per round, returning the sheet URL.
- On candidate events (create, status change, interviewer assignment), the backend triggers the `SheetSyncService` to append or update rows in the appropriate round tab.
- Sync is best‑effort and designed not to block user actions.

## Slack (with Email Invites)

Text overview

- When a candidate advances (e.g., from Round 1 to Round 2), the backend runs a Slack workflow via `slack.js`.
- The workflow ensures a dedicated job channel exists, posts and pins the screening sheet, and invites participants.
- If an invitee is not in the Slack workspace, Slack dispatches an email invitation with the channel link.
- If already in the workspace, the user is added to the channel (optionally followed by an email notification).

## GCS (Storage)

Text overview

- Resumes and certificates uploaded by the frontend are forwarded to the backend and stored in Google Cloud Storage.
- The backend returns public URLs which are saved in the database and displayed in the UI for quick access.

## Email

Text overview

- New user onboarding: after creating a user and assigning roles, the system sends an email with an auto‑generated password.
- Password reset: users can request a unique reset link which expires in 30 minutes and allows setting a new password.
- Candidate rejection: when rejecting a candidate, a personalized rejection email is sent to the candidate.
- Slack invites: for non‑workspace members, Slack sends email invitations that include the channel link.
