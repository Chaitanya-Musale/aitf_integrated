#!/bin/bash

# Deploy AI Services to Google Cloud Run
# Make sure you have gcloud CLI installed and authenticated

set -e  # Exit on error

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AI Services Cloud Run Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project configuration
read -p "Enter your GCP Project ID: " PROJECT_ID
read -p "Enter region (default: us-central1): " REGION
REGION=${REGION:-us-central1}

read -p "Enter your Gemini API Key: " GEMINI_API_KEY

if [ -z "$GEMINI_API_KEY" ]; then
    echo -e "${RED}Error: Gemini API key is required${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "  Project ID: $PROJECT_ID"
echo "  Region: $REGION"
echo ""

# Set project
gcloud config set project $PROJECT_ID

echo -e "${GREEN}Step 1: Deploying Phase 2 - AI Candidate Screening${NC}"
echo ""

cd Chaitanya_Phase_2

# Build and submit
echo "Building and submitting Phase 2..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/phase2-ai-screening

# Deploy
echo "Deploying Phase 2 to Cloud Run..."
gcloud run deploy phase2-ai-screening \
  --image gcr.io/$PROJECT_ID/phase2-ai-screening \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="$GEMINI_API_KEY" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 180 \
  --max-instances 10 \
  --quiet

# Get Phase 2 URL
PHASE2_URL=$(gcloud run services describe phase2-ai-screening \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)')

echo -e "${GREEN}✓ Phase 2 deployed successfully!${NC}"
echo "  URL: $PHASE2_URL"
echo ""

cd ..

echo -e "${GREEN}Step 2: Deploying Phase 3 - Resume Verification${NC}"
echo ""

cd "phase 3/Resume-Verification-System"

# Build and submit
echo "Building and submitting Phase 3..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/phase3-resume-verification

# Deploy
echo "Deploying Phase 3 to Cloud Run..."
gcloud run deploy phase3-resume-verification \
  --image gcr.io/$PROJECT_ID/phase3-resume-verification \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="$GEMINI_API_KEY" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 180 \
  --max-instances 10 \
  --quiet

# Get Phase 3 URL
PHASE3_URL=$(gcloud run services describe phase3-resume-verification \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)')

echo -e "${GREEN}✓ Phase 3 deployed successfully!${NC}"
echo "  URL: $PHASE3_URL"
echo ""

cd ../..

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete! 🎉${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Update your backend environment variables:"
echo ""
echo "   PHASE2_SERVICE_URL=$PHASE2_URL"
echo "   PHASE3_SERVICE_URL=$PHASE3_URL"
echo ""
echo "2. Test the health endpoints:"
echo ""
echo "   curl $PHASE2_URL/health"
echo "   curl $PHASE3_URL/health"
echo ""
echo "3. Restart your backend service with the new environment variables"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo ""
echo "  # View Phase 2 logs:"
echo "  gcloud run services logs read phase2-ai-screening --region $REGION --limit 50"
echo ""
echo "  # View Phase 3 logs:"
echo "  gcloud run services logs read phase3-resume-verification --region $REGION --limit 50"
echo ""
echo "  # Update environment variables later:"
echo "  gcloud run services update phase2-ai-screening --set-env-vars GEMINI_API_KEY=new_key --region $REGION"
echo ""
