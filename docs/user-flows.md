# User Flows

## Admin (flow + sequence)
Textual flow

- Admin logs in. On success, the Admin lands on the Dashboard for user and role management.
- Roles can be created, updated, or deleted. Deleting or modifying base roles (`Admin`, `HR`, `Interviewer`) is blocked.
- Admin creates a user, assigns one or more roles, and the system sends an email with an auto‑generated password.
- The new user either logs in with that password or requests a password reset. A unique reset link is emailed and expires in 30 minutes. The user sets a new password via the link.
- Admin can activate, deactivate, or delete users. Destructive actions require confirmation prompts.

Textual sequence

1) Admin submits login credentials; backend returns a JWT; Admin sees the dashboard.
2) Admin creates/updates roles and users; base roles are protected from deletion.
3) After creating a user and assigning roles, the system emails credentials to the user.
4) If the user chooses “Forgot password,” the system emails a unique reset link (30‑minute expiry). User sets a new password via that link.
5) Admin can activate/deactivate/delete users; confirmations guard destructive actions.

## HR (single diagram + sequence)
Textual flow

- HR dashboard has two areas: Candidate Management and Job Management.
- Candidate Management:
  - Upload resume (PDF/DOC/DOCX). The file is stored in GCS and its link saved in the database.
  - The resume is parsed by Gemini OCR into structured JSON; the form fields auto‑fill.
  - HR may add work experiences and upload certificates (also stored in GCS), then save the candidate.
  - HR can edit, inactivate, or delete candidates.
- Job Management:
  - HR creates jobs with name, description, number of rounds, round details, and evaluation parameters.
  - On creation, a Google Sheet is created automatically with one tab per round.
  - As candidates move between statuses, the sheet is updated.
- Candidate lifecycle within a job round: fresh → in_progress → scheduled → completed → accepted/rejected.
  - After completion, HR/interviewer records evaluations and accepts or rejects.
  - On rejection, reasons are captured and a personalized rejection email is sent.
  - On acceptance (e.g., moving from Round 1 to Round 2), Slack automation ensures the job channel exists, posts/pins the screening sheet, and invites participants. If a participant is not in the workspace, an email invite is sent.

Textual sequence

1) HR uploads a resume; backend saves it to GCS and parses it via Gemini OCR; frontend auto‑fills the form.
2) HR saves the candidate and/or creates a job; backend creates a Google Sheet with tabs per round.
3) HR assigns interviewers, schedules interviews, and marks completion; backend updates the sheet.
4) On acceptance: status advances (and, if applicable, Slack channel setup/posting/invites occur).
5) On rejection: backend sends a personalized rejection email and updates status.

## Interviewer (single diagram + sequence)
Textual flow

- Interviewer logs in and opens the dashboard.
- The interviewer selects a job and a round to view assigned candidates.
- From a candidate profile, the interviewer can view the resume and certificates and fill out the evaluation.
- On submission, the candidate’s status may be updated according to permissions, and the sheet sync runs.

Textual sequence

1) Interviewer opens the dashboard; the system loads visible jobs and round candidates (optionally filtered to assigned ones).
2) Interviewer opens a candidate profile; resume/certificate links are loaded from storage for viewing.
3) Interviewer submits the evaluation; backend records feedback and may update status.
4) The sheets sync updates the corresponding round tab.
