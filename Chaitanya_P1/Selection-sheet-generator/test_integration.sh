#!/bin/bash

# Integration Test Script
# Tests Python AI resume parser and selection sheet generator

set -e  # Exit on error

echo "=========================================="
echo "AI Resume Parser Integration Test"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0

# Function to print test result
test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        ((FAILED++))
    fi
}

# Check Python installation
echo "1. Checking Python installation..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "   Found: $PYTHON_VERSION"
    test_result 0 "Python3 installed"
else
    echo "   Python3 not found"
    test_result 1 "Python3 installed"
    exit 1
fi
echo ""

# Check required Python packages
echo "2. Checking Python packages..."
REQUIRED_PACKAGES=("google.generativeai" "pydantic" "jinja2")
for package in "${REQUIRED_PACKAGES[@]}"; do
    if python3 -c "import ${package}" 2>/dev/null; then
        test_result 0 "Package: $package"
    else
        test_result 1 "Package: $package"
        echo -e "   ${YELLOW}Install with: pip install ${package}${NC}"
    fi
done
echo ""

# Check environment variables
echo "3. Checking environment variables..."
if [ -f .env ]; then
    source .env
    test_result 0 ".env file exists"
else
    test_result 1 ".env file exists"
fi

if [ -n "$GEMINI_API_KEY" ]; then
    test_result 0 "GEMINI_API_KEY set"
else
    test_result 1 "GEMINI_API_KEY set"
fi

if [ -n "$GEMINI_MODEL" ]; then
    test_result 0 "GEMINI_MODEL set"
else
    test_result 1 "GEMINI_MODEL set"
fi
echo ""

# Check file structure
echo "4. Checking file structure..."
FILES=(
    "python/parse_resume_standalone.py"
    "python/generate_assessment_standalone.py"
    "python/gcp/cv_parser.py"
    "python/analyzer.py"
    "python/generator.py"
    "python/models.py"
    "python/config.py"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        test_result 0 "File exists: $file"
    else
        test_result 1 "File exists: $file"
    fi
done
echo ""

# Create test resume
echo "5. Creating test resume..."
TEST_RESUME=$(cat << 'EOF'
JOHN DOE
Software Engineer
john.doe@example.com | +1-555-123-4567
LinkedIn: linkedin.com/in/johndoe | GitHub: github.com/johndoe

PROFESSIONAL SUMMARY
Experienced software engineer with 5+ years in full-stack development.
Specializes in Python, JavaScript, and cloud technologies.

WORK EXPERIENCE

Senior Software Engineer - TechCorp Inc.
January 2021 - Present | San Francisco, CA
- Led development of microservices architecture using Python and Kubernetes
- Reduced API latency by 40% through optimization
- Mentored team of 5 junior developers

Software Engineer - StartupXYZ
June 2018 - December 2020 | Remote
- Built RESTful APIs with Django and PostgreSQL
- Implemented CI/CD pipeline with GitHub Actions
- Developed React-based admin dashboard

EDUCATION

Bachelor of Science in Computer Science
University of California, Berkeley
Graduated: May 2018 | GPA: 3.8/4.0

SKILLS

Technical: Python, JavaScript, TypeScript, React, Node.js, Django, PostgreSQL, 
MongoDB, AWS, Kubernetes, Docker, Git, REST APIs, GraphQL

Soft Skills: Team Leadership, Agile Methodology, Technical Writing

CERTIFICATIONS

- AWS Certified Solutions Architect - Associate (2022)
- Certified Kubernetes Administrator (2021)

PROJECTS

E-commerce Platform
- Built scalable platform handling 10k+ daily users
- Technologies: Python, Django, React, PostgreSQL, Redis
- URL: github.com/johndoe/ecommerce

ACHIEVEMENTS

- Reduced infrastructure costs by 30% through AWS optimization
- Published 5 technical articles on Medium (10k+ views)
- Speaker at PyCon 2022
EOF
)

echo "$TEST_RESUME" > /tmp/test_resume.txt
test_result 0 "Test resume created"
echo ""

# Test 1: Parse resume
echo "6. Testing resume parsing..."
if [ -f python/parse_resume_standalone.py ]; then
    PARSE_OUTPUT=$(cat /tmp/test_resume.txt | python3 python/parse_resume_standalone.py 2>&1)
    PARSE_EXIT_CODE=$?
    
    if [ $PARSE_EXIT_CODE -eq 0 ]; then
        # Check if output is valid JSON
        if echo "$PARSE_OUTPUT" | python3 -m json.tool > /dev/null 2>&1; then
            test_result 0 "Resume parsing (valid JSON output)"
            
            # Save for next test
            echo "$PARSE_OUTPUT" > /tmp/parsed_output.json
            
            # Check key fields
            NAME=$(echo "$PARSE_OUTPUT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('name', ''))" 2>/dev/null)
            EMAIL=$(echo "$PARSE_OUTPUT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('email', ''))" 2>/dev/null)
            
            if [ -n "$NAME" ]; then
                test_result 0 "Name extracted: $NAME"
            else
                test_result 1 "Name extracted"
            fi
            
            if [ -n "$EMAIL" ]; then
                test_result 0 "Email extracted: $EMAIL"
            else
                test_result 1 "Email extracted"
            fi
        else
            test_result 1 "Resume parsing (invalid JSON output)"
            echo "Output: $PARSE_OUTPUT"
        fi
    else
        test_result 1 "Resume parsing (exit code: $PARSE_EXIT_CODE)"
        echo "Error: $PARSE_OUTPUT"
    fi
else
    test_result 1 "parse_resume_standalone.py not found"
fi
echo ""

# Test 2: Generate selection sheet
echo "7. Testing selection sheet generation..."
if [ -f /tmp/parsed_output.json ] && [ -f python/generate_assessment_standalone.py ]; then
    SHEET_OUTPUT=$(cat /tmp/parsed_output.json | python3 python/generate_assessment_standalone.py 2>&1)
    SHEET_EXIT_CODE=$?
    
    if [ $SHEET_EXIT_CODE -eq 0 ]; then
        if echo "$SHEET_OUTPUT" | python3 -m json.tool > /dev/null 2>&1; then
            test_result 0 "Selection sheet generation (valid JSON)"
            
            # Check for HTML output
            if echo "$SHEET_OUTPUT" | grep -q "selection_sheet_html"; then
                test_result 0 "HTML content generated"
                
                # Extract and save HTML
                echo "$SHEET_OUTPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
html = data.get('selection_sheet_html', '')
with open('/tmp/test_sheet.html', 'w') as f:
    f.write(html)
print(f'HTML length: {len(html)} characters')
" 2>/dev/null
                
            else
                test_result 1 "HTML content generated"
            fi
            
            # Check for JSON sheet
            if echo "$SHEET_OUTPUT" | grep -q "selection_sheet_json"; then
                test_result 0 "JSON sheet generated"
            else
                test_result 1 "JSON sheet generated"
            fi
        else
            test_result 1 "Selection sheet generation (invalid JSON)"
            echo "Output: $SHEET_OUTPUT"
        fi
    else
        test_result 1 "Selection sheet generation (exit code: $SHEET_EXIT_CODE)"
        echo "Error: $SHEET_OUTPUT"
    fi
else
    test_result 1 "Prerequisites for sheet generation not met"
fi
echo ""

# Test 3: Verify HTML output
echo "8. Verifying HTML output..."
if [ -f /tmp/test_sheet.html ]; then
    HTML_SIZE=$(stat -f%z /tmp/test_sheet.html 2>/dev/null || stat -c%s /tmp/test_sheet.html 2>/dev/null)
    
    if [ "$HTML_SIZE" -gt 1000 ]; then
        test_result 0 "HTML file size reasonable ($HTML_SIZE bytes)"
    else
        test_result 1 "HTML file size too small ($HTML_SIZE bytes)"
    fi
    
    # Check for key HTML elements
    if grep -q "<!DOCTYPE html>" /tmp/test_sheet.html; then
        test_result 0 "Valid HTML structure"
    else
        test_result 1 "Valid HTML structure"
    fi
    
    if grep -q "Skill Match:" /tmp/test_sheet.html; then
        test_result 0 "Selection sheet content present"
    else
        test_result 1 "Selection sheet content present"
    fi
    
    echo -e "   ${YELLOW}Preview HTML at: file:///tmp/test_sheet.html${NC}"
else
    test_result 1 "HTML file not found"
fi
echo ""

# Cleanup
echo "9. Cleanup..."
rm -f /tmp/test_resume.txt /tmp/parsed_output.json /tmp/test_sheet.html
echo "   Temporary files removed"
echo ""

# Final summary
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo "Your integration is ready to use."
    exit 0
else
    echo -e "${RED}✗ Some tests failed.${NC}"
    echo "Please fix the issues above before proceeding."
    exit 1
fi