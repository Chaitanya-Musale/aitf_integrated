#!/bin/bash

# Stop script for AI Services

echo "Stopping AI Services..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to stop a service
stop_service() {
    local service_name=$1
    local pid_file=$2

    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "Stopping $service_name (PID: $pid)..."
            kill "$pid"
            rm "$pid_file"
            echo -e "${GREEN}✓ $service_name stopped${NC}"
        else
            echo -e "${RED}$service_name was not running${NC}"
            rm "$pid_file"
        fi
    else
        echo "$service_name PID file not found (service may not be running)"
    fi
}

# Stop both services
stop_service "Phase 2 (AI Screening)" "logs/phase2.pid"
stop_service "Phase 3 (Resume Verification)" "logs/phase3.pid"

echo ""
echo -e "${GREEN}AI Services stopped successfully!${NC}"
