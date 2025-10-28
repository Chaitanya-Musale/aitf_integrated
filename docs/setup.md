# Setup

## Prerequisites
- Node.js (LTS)
- PostgreSQL
- Google Cloud account (for Sheets and GCS), Slack workspace/app credentials (optional)

## Install
```bash
npm install
cd frontend && npm install
cd ../backend && npm install
```

## Database
- Create a PostgreSQL database.
- Apply schema from `database/schema.sql`.

## Environment
Create `backend/.env` from example and set values:
- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `GCS_BUCKET`, `GCS_PROJECT_ID`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY`
- `SHEETS_CREDENTIALS` or `GOOGLE_APPLICATION_CREDENTIALS`
- `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` (optional)

Create `frontend/.env.local`:
- `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:5000/api`)

## Run (Dev)
```bash
# Terminal A
cd backend
npm run dev

# Terminal B
cd frontend
npm run dev
```
