#!/usr/bin/env python3
"""
Standalone Resume Parser - Called from Node.js
Reads resume text from stdin, parses with Gemini, outputs JSON to stdout
"""
import sys
import json
import os
from pathlib import Path

# Add parent directory to path to import modules
sys.path.insert(0, str(Path(__file__).parent))

from gcp.cv_parser import GeminiCVParser
from dataclasses import asdict

def main():
    try:
        # Read resume text from stdin
        resume_text = sys.stdin.read()
        
        if not resume_text or not resume_text.strip():
            error_result = {
                "error": "No resume text provided",
                "success": False
            }
            print(json.dumps(error_result), file=sys.stderr)
            sys.exit(1)
        
        # Initialize parser
        parser = GeminiCVParser()
        
        # Parse CV
        parsed_cv = parser.parse_cv(resume_text, "uploaded_resume.pdf")
        
        # Convert to dictionary
        result = asdict(parsed_cv)
        result["success"] = True
        
        # Output JSON to stdout
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "success": False,
            "name": "Parse Error",
            "email": "",
            "phone": ""
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()