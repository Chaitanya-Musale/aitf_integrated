#!/bin/bash

# Startup script for AI Services (Phase 2 and Phase 3)
# This script starts both Python Flask API servers

echo "Starting AI Services..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is not installed${NC}"
    exit 1
fi

# Function to start Phase 2 service
start_phase2() {
    echo -e "${BLUE}Starting Phase 2 - AI Candidate Screening Service...${NC}"
    cd "Chaitanya_Phase_2" || exit

    # Check if virtual environment exists
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment for Phase 2..."
        python3 -m venv venv
    fi

    # Activate virtual environment
    source venv/bin/activate

    # Install dependencies
    echo "Installing Phase 2 dependencies..."
    pip install -q -r requirements.txt

    # Start the API server
    echo -e "${GREEN}Phase 2 API server starting on http://localhost:5001${NC}"
    python3 api_server.py > ../logs/phase2.log 2>&1 &
    echo $! > ../logs/phase2.pid

    cd ..
}

# Function to start Phase 3 service
start_phase3() {
    echo -e "${BLUE}Starting Phase 3 - Resume Verification Service...${NC}"
    cd "phase 3/Resume-Verification-System" || exit

    # Check if virtual environment exists
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment for Phase 3..."
        python3 -m venv venv
    fi

    # Activate virtual environment
    source venv/bin/activate

    # Install dependencies
    echo "Installing Phase 3 dependencies..."
    pip install -q -r requirements.txt

    # Start the API server
    echo -e "${GREEN}Phase 3 API server starting on http://localhost:5002${NC}"
    python3 api_server.py > ../../logs/phase3.log 2>&1 &
    echo $! > ../../logs/phase3.pid

    cd ../..
}

# Create logs directory if it doesn't exist
mkdir -p logs

# Start both services
start_phase2
start_phase3

echo ""
echo -e "${GREEN}✓ AI Services started successfully!${NC}"
echo ""
echo "Phase 2 (AI Screening): http://localhost:5001"
echo "Phase 3 (Resume Verification): http://localhost:5002"
echo ""
echo "Logs are available in:"
echo "  - logs/phase2.log"
echo "  - logs/phase3.log"
echo ""
echo "To stop the services, run: ./stop_ai_services.sh"
