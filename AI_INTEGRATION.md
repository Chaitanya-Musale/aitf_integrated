# AI Integration Documentation

This document describes the integration of AI-powered candidate screening and resume verification features into the AITF Interview System.

## Overview

Two AI-powered analysis systems have been integrated:

1. **Phase 2: AI Candidate Screening** - Evidence-based 11-metric candidate evaluation
2. **Phase 3: Resume Verification** - Comprehensive resume credibility and consistency checking

Both systems use Google Gemini AI and are exposed through Python Flask API servers that integrate with the main Node.js backend.

## Architecture

```
┌─────────────────┐
│  Next.js Frontend│
│   (React)       │
└────────┬────────┘
         │
         │ HTTP/REST
         ▼
┌─────────────────┐
│  Node.js Backend│
│   (Express)     │
└────────┬────────┘
         │
         ├─────────────┬─────────────┐
         │             │             │
         ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Phase 2    │ │   Phase 3    │ │  PostgreSQL  │
│   Flask API  │ │   Flask API  │ │   Database   │
│   (Port 5001)│ │   (Port 5002)│ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

## Setup Instructions

### Prerequisites

1. **Python 3.8+** with pip
2. **Node.js 18+** with npm
3. **PostgreSQL** database
4. **Gemini API Key** from Google AI Studio

### Environment Variables

Add the following to your `backend/.env` file:

```bash
# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# AI Services Configuration
PHASE2_SERVICE_URL=http://localhost:5001
PHASE3_SERVICE_URL=http://localhost:5002
```

### Installation

1. **Install Python Dependencies**

   Phase 2:
   ```bash
   cd Chaitanya_Phase_2
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

   Phase 3:
   ```bash
   cd "phase 3/Resume-Verification-System"
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Install Node.js Dependencies** (if not already done)
   ```bash
   cd backend
   npm install

   cd ../frontend
   npm install
   ```

## Running the Services

### Option 1: Using the Startup Script (Linux/Mac)

```bash
# Start AI services
./start_ai_services.sh

# Stop AI services
./stop_ai_services.sh
```

### Option 2: Manual Start

**Terminal 1 - Phase 2 Service:**
```bash
cd Chaitanya_Phase_2
source venv/bin/activate
python3 api_server.py
```

**Terminal 2 - Phase 3 Service:**
```bash
cd "phase 3/Resume-Verification-System"
source venv/bin/activate
python3 api_server.py
```

**Terminal 3 - Backend:**
```bash
cd backend
npm start
```

**Terminal 4 - Frontend:**
```bash
cd frontend
npm run dev
```

### Verify Services Are Running

Check health endpoints:
```bash
curl http://localhost:5001/health  # Phase 2
curl http://localhost:5002/health  # Phase 3
curl http://localhost:5000/api/ai/health  # Backend proxy
```

## Features

### Phase 2: AI Candidate Screening

**Purpose:** Evidence-based candidate evaluation against job requirements

**Key Features:**
- 11-metric decomposition system
- Sigmoid diminishing returns to prevent resume padding bias
- Recency decay for older experience
- Red flag detection (job gaps, short tenures, etc.)
- Positive signal boosting (awards, patents, publications)
- Confidence scoring
- Radar and gauge visualizations

**API Endpoint:** `POST /api/ai/screening/analyze`

**Request Body:**
```json
{
  "candidateId": 123,
  "jobDescription": "Full job description text...",
  "additionalContext": "Optional context or requirements"
}
```

**Use Case:** Use this when you want to see how well a candidate matches a specific job posting.

### Phase 3: Resume Verification

**Purpose:** Comprehensive resume credibility and consistency checking

**Key Features:**
- Claim extraction and categorization
- Evidence validation
- Timeline consistency checking
- Technology timeline validation (prevents anachronisms)
- Role-achievement mismatch detection
- Red flag detection with severity levels
- Interview strategy generation
- Comprehensive reporting (HTML, JSON, Markdown)

**API Endpoint:** `POST /api/ai/verification/analyze`

**Request Body:**
```json
{
  "candidateId": 123,
  "seniorityLevel": "Mid",
  "strictness": "Medium",
  "deepAnalysis": false
}
```

**Use Case:** Use this to verify the credibility and consistency of a candidate's resume before scheduling interviews.

## Frontend Usage

### Accessing AI Features

1. Log in as an HR user
2. Navigate to the **AI Analysis** tab in the HR dashboard
3. Select a candidate from the dropdown
4. Choose analysis type:
   - **AI Screening**: Requires job description input
   - **Resume Verification**: Configure seniority level and strictness

### Analysis Results

**AI Screening Results:**
- Final weighted score (0-100)
- Confidence level
- 11-metric breakdown with progress bars
- Red flags with severity levels
- Positive signals

**Resume Verification Results:**
- Final score, credibility, and consistency scores
- Risk assessment (LOW, MEDIUM, HIGH, CRITICAL)
- Claims analysis (total, verified, unverified)
- Detailed red flags with interview questions
- Recommendations

## Database Storage

Analysis results are stored in the `candidates` table in the `ai_summary` JSONB column:

```sql
-- Structure of ai_summary field
{
  "type": "phase2_screening" | "phase3_verification",
  "analysis": { /* Full analysis results */ },
  "analyzed_at": "ISO timestamp",
  "analyzed_by": "user_id"
}
```

## API Documentation

### Backend Endpoints

#### Health Check
```
GET /api/ai/health
```
Returns status of both AI services.

#### Phase 2 Analysis
```
POST /api/ai/screening/analyze
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "candidateId": number,
  "jobDescription": string,
  "additionalContext": string (optional)
}
```

#### Phase 3 Analysis
```
POST /api/ai/verification/analyze
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "candidateId": number,
  "seniorityLevel": "Intern" | "Junior" | "Mid" | "Senior" | "Lead",
  "strictness": "Low" | "Medium" | "High",
  "deepAnalysis": boolean
}
```

#### Generate Report
```
POST /api/ai/verification/report
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "analysisResults": object,
  "format": "html" | "json" | "markdown"
}
```

#### Get Analysis History
```
GET /api/ai/candidate/:id/history
Authorization: Bearer <token>
```

## Troubleshooting

### AI Services Won't Start

1. **Check Python version:**
   ```bash
   python3 --version  # Should be 3.8 or higher
   ```

2. **Check if ports are in use:**
   ```bash
   lsof -i :5001  # Phase 2
   lsof -i :5002  # Phase 3
   ```

3. **Check logs:**
   ```bash
   tail -f logs/phase2.log
   tail -f logs/phase3.log
   ```

### Analysis Fails

1. **Verify Gemini API key is set:**
   ```bash
   echo $GEMINI_API_KEY
   ```

2. **Check API rate limits:** Google Gemini has rate limits on the free tier

3. **Verify resume file exists:** The candidate must have a resume uploaded

4. **Check backend logs:**
   ```bash
   # Backend console output will show errors
   ```

### Frontend Shows Service Unavailable

1. **Verify all services are running:**
   ```bash
   curl http://localhost:5001/health
   curl http://localhost:5002/health
   curl http://localhost:5000/api/health
   ```

2. **Check CORS settings** in backend configuration

3. **Verify environment variables** in frontend `.env.local`:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:5000
   ```

## Performance Considerations

- **Analysis Time:**
  - Phase 2 (Screening): 30-60 seconds
  - Phase 3 (Verification): 60-120 seconds
  - Phase 3 with Deep Analysis: 120-180 seconds

- **API Rate Limits:**
  - Google Gemini Free Tier: 60 requests per minute
  - Consider implementing request queuing for high volume

- **Resume File Size:**
  - Recommended: < 5MB
  - Supported formats: PDF, DOCX, TXT

## Security Considerations

1. **API Keys:** Never commit API keys to version control
2. **Authentication:** All AI endpoints require HR role authentication
3. **Data Privacy:** Analysis results contain sensitive candidate information
4. **Rate Limiting:** Backend has rate limiting enabled

## Future Enhancements

Potential improvements for future versions:

1. **Batch Processing:** Analyze multiple candidates at once
2. **Comparison View:** Side-by-side candidate comparisons
3. **Custom Metrics:** Allow HR to define custom evaluation metrics
4. **Machine Learning:** Train models on historical hiring data
5. **Real-time Updates:** WebSocket support for live analysis progress
6. **Export Features:** Bulk export of analysis results
7. **Analytics Dashboard:** Aggregate statistics across all analyses

## Support

For issues or questions:
1. Check logs in `logs/` directory
2. Review this documentation
3. Check the main README.md
4. Contact development team

## Version History

- **v1.0** (2025-01-28): Initial integration of Phase 2 and Phase 3 AI features
