# Deployment Guide for AI Services

## Overview

This guide explains how to deploy the Python AI services (Phase 2 and Phase 3) to production alongside your deployed backend.

## Deployment Options

### Option 1: Google Cloud Run (Recommended)

Since your backend is already on Cloud Run, deploy the Flask APIs there too.

#### Prerequisites

- Google Cloud Project ID
- `gcloud` CLI installed and authenticated
- Docker installed locally (for testing)
- Gemini API key

#### Step 1: Build and Test Docker Images Locally

**Phase 2:**
```bash
cd Chaitanya_Phase_2

# Build image
docker build -t phase2-ai-screening .

# Test locally
docker run -p 8080:8080 \
  -e GEMINI_API_KEY="your_api_key_here" \
  phase2-ai-screening

# Test endpoint
curl http://localhost:8080/health
```

**Phase 3:**
```bash
cd "phase 3/Resume-Verification-System"

# Build image
docker build -t phase3-resume-verification .

# Test locally
docker run -p 8081:8080 \
  -e GEMINI_API_KEY="your_api_key_here" \
  phase3-resume-verification

# Test endpoint
curl http://localhost:8081/health
```

#### Step 2: Deploy to Cloud Run

**Phase 2:**
```bash
cd Chaitanya_Phase_2

# Set your project ID
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"  # or your preferred region

# Build and submit to Container Registry
gcloud builds submit --tag gcr.io/$PROJECT_ID/phase2-ai-screening

# Deploy to Cloud Run
gcloud run deploy phase2-ai-screening \
  --image gcr.io/$PROJECT_ID/phase2-ai-screening \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="your_api_key_here" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 180 \
  --max-instances 10

# Get the service URL
gcloud run services describe phase2-ai-screening \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)'
```

**Phase 3:**
```bash
cd "phase 3/Resume-Verification-System"

# Build and submit to Container Registry
gcloud builds submit --tag gcr.io/$PROJECT_ID/phase3-resume-verification

# Deploy to Cloud Run
gcloud run deploy phase3-resume-verification \
  --image gcr.io/$PROJECT_ID/phase3-resume-verification \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="your_api_key_here" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 180 \
  --max-instances 10

# Get the service URL
gcloud run services describe phase3-resume-verification \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)'
```

#### Step 3: Update Backend Environment Variables

Update your backend's environment variables (in Cloud Run console or via gcloud):

```bash
# Get the service URLs from previous commands
export PHASE2_URL="https://phase2-ai-screening-xxx-uc.a.run.app"
export PHASE3_URL="https://phase3-resume-verification-xxx-uc.a.run.app"

# Update your backend service
gcloud run services update your-backend-service \
  --set-env-vars PHASE2_SERVICE_URL=$PHASE2_URL,PHASE3_SERVICE_URL=$PHASE3_URL \
  --region $REGION
```

Or update via Cloud Run console:
1. Go to Cloud Run console
2. Select your backend service
3. Click "Edit & Deploy New Revision"
4. Add environment variables:
   - `PHASE2_SERVICE_URL`: Your Phase 2 Cloud Run URL
   - `PHASE3_SERVICE_URL`: Your Phase 3 Cloud Run URL

---

### Option 2: Heroku

#### Prerequisites
- Heroku account
- Heroku CLI installed

#### Deploy Phase 2

```bash
cd Chaitanya_Phase_2

# Login to Heroku
heroku login

# Create app
heroku create your-app-phase2-ai

# Set environment variables
heroku config:set GEMINI_API_KEY="your_api_key_here" -a your-app-phase2-ai

# Create Procfile
echo "web: gunicorn api_server:app" > Procfile

# Deploy
git init
git add .
git commit -m "Deploy Phase 2"
heroku git:remote -a your-app-phase2-ai
git push heroku master

# Get URL
heroku info -a your-app-phase2-ai | grep "Web URL"
```

#### Deploy Phase 3

```bash
cd "phase 3/Resume-Verification-System"

# Create app
heroku create your-app-phase3-verification

# Set environment variables
heroku config:set GEMINI_API_KEY="your_api_key_here" -a your-app-phase3-verification

# Create Procfile
echo "web: gunicorn api_server:app" > Procfile

# Deploy
git init
git add .
git commit -m "Deploy Phase 3"
heroku git:remote -a your-app-phase3-verification
git push heroku master

# Get URL
heroku info -a your-app-phase3-verification | grep "Web URL"
```

#### Update Backend Environment

Update your backend's `.env` or environment variables:
```bash
PHASE2_SERVICE_URL=https://your-app-phase2-ai.herokuapp.com
PHASE3_SERVICE_URL=https://your-app-phase3-verification.herokuapp.com
```

---

### Option 3: Railway

#### Prerequisites
- Railway account
- Railway CLI installed (optional)

#### Via Railway Dashboard

1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will detect Python and deploy automatically

**For Phase 2:**
- Set root directory: `Chaitanya_Phase_2`
- Add environment variable: `GEMINI_API_KEY`
- Port will be auto-detected

**For Phase 3:**
- Create another service
- Set root directory: `phase 3/Resume-Verification-System`
- Add environment variable: `GEMINI_API_KEY`

5. Get the service URLs from Railway dashboard
6. Update backend environment variables

---

### Option 4: Same Server as Backend

If your backend runs on a VM/VPS, run the Python services on the same server:

```bash
# SSH into your server
ssh your-server

# Navigate to your project
cd /path/to/aitf_integrated

# Run the startup script
./start_ai_services.sh

# Set up systemd services for auto-restart (optional)
sudo nano /etc/systemd/system/phase2-ai.service
```

**systemd service file for Phase 2:**
```ini
[Unit]
Description=Phase 2 AI Screening Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/aitf_integrated/Chaitanya_Phase_2
Environment="PATH=/path/to/aitf_integrated/Chaitanya_Phase_2/venv/bin"
Environment="GEMINI_API_KEY=your_api_key_here"
ExecStart=/path/to/aitf_integrated/Chaitanya_Phase_2/venv/bin/python api_server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start services
sudo systemctl enable phase2-ai
sudo systemctl start phase2-ai

# Check status
sudo systemctl status phase2-ai
```

For this option, use:
```bash
PHASE2_SERVICE_URL=http://localhost:5001
PHASE3_SERVICE_URL=http://localhost:5002
```

---

## Post-Deployment Checklist

- [ ] Both AI services are accessible via their URLs
- [ ] Health check endpoints return 200 OK
- [ ] Backend environment variables are updated
- [ ] Backend can reach AI services (check backend logs)
- [ ] Test an analysis from the frontend
- [ ] Monitor Cloud Run logs for errors
- [ ] Set up monitoring/alerting for service health

## Monitoring

### Cloud Run Logs

```bash
# View Phase 2 logs
gcloud run services logs read phase2-ai-screening --region $REGION --limit 50

# View Phase 3 logs
gcloud run services logs read phase3-resume-verification --region $REGION --limit 50

# Stream logs in real-time
gcloud run services logs tail phase2-ai-screening --region $REGION
```

### Health Checks

Create a simple monitoring script:

```bash
#!/bin/bash

PHASE2_URL="your_phase2_url"
PHASE3_URL="your_phase3_url"

echo "Checking Phase 2..."
curl -f $PHASE2_URL/health || echo "❌ Phase 2 is down"

echo "Checking Phase 3..."
curl -f $PHASE3_URL/health || echo "❌ Phase 3 is down"
```

## Cost Optimization

### Cloud Run Pricing Tips

1. **Use minimum instances wisely:**
   - Set to 0 for development (cold starts acceptable)
   - Set to 1+ for production (faster response)

2. **Memory allocation:**
   - Start with 2Gi
   - Monitor actual usage and adjust down if possible

3. **Request timeout:**
   - Set to 180s (analysis can take time)

4. **Concurrency:**
   - Default is usually fine
   - Increase if you need higher throughput

### Example Cost Estimates

**Low usage (10 analyses/day):**
- ~$0-5/month per service

**Medium usage (100 analyses/day):**
- ~$10-20/month per service

**High usage (1000 analyses/day):**
- ~$50-100/month per service

*Note: Gemini API costs are separate*

## Troubleshooting

### Service Won't Start

```bash
# Check Cloud Build logs
gcloud builds list --limit 5

# Check specific build
gcloud builds log BUILD_ID

# Check Cloud Run logs
gcloud run services logs read phase2-ai-screening --region $REGION --limit 100
```

### Backend Can't Reach AI Services

1. Check environment variables are set correctly
2. Verify Cloud Run services are public (--allow-unauthenticated)
3. Test manually with curl:
   ```bash
   curl https://your-phase2-url.run.app/health
   ```

### High Latency

1. Check Cloud Run region matches backend region
2. Increase CPU allocation
3. Set minimum instances to avoid cold starts
4. Monitor Gemini API response times

## Security Notes

1. **Never commit API keys** to git
2. **Use Secret Manager** for production:
   ```bash
   gcloud secrets create gemini-api-key --data-file=-
   # Paste your key, then Ctrl+D

   gcloud run services update phase2-ai-screening \
     --set-secrets GEMINI_API_KEY=gemini-api-key:latest
   ```
3. **Consider authentication** between backend and AI services for production
4. **Enable Cloud Armor** if you need DDoS protection

## Next Steps

After deployment:
1. Test the integration thoroughly
2. Set up monitoring and alerting
3. Document the service URLs in your team's knowledge base
4. Consider implementing caching for repeated analyses
5. Set up CI/CD for automatic deployments
