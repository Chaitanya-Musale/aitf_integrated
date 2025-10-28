#!/usr/bin/env python3
"""
Standalone Candidate Assessment Generator
Reads parsed candidate JSON from stdin, generates assessment sheet
"""
import sys
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from models import Candidate, Job, Application
from generator import SelectionSheetGenerator
from analyzer import normalize_skills

def create_generic_job_for_assessment(candidate_skills):
    """Create a generic job profile for assessment purposes"""
    # Use candidate's skills as required skills for a generic assessment
    top_skills = candidate_skills[:5] if candidate_skills else []
    
    return Job(
        job_id=0,
        title="Candidate Assessment",
        description="General candidate evaluation",
        status="assessment",
        role_type="engineering",  # Default, can be inferred from skills
        seniority="mid",  # Default
        required_skills=top_skills,
        nice_to_have_skills=[],
        special_requirements=[]
    )

def main():
    try:
        # Read parsed candidate data from stdin
        input_data = json.loads(sys.stdin.read())
        
        if not input_data.get("success", False):
            raise ValueError("Invalid parsed candidate data")
        
        # Create Candidate object from parsed data
        candidate = Candidate(
            candidate_id=0,  # Temporary ID
            name=input_data.get("name", "Unknown Candidate"),
            email=input_data.get("email", ""),
            contact=input_data.get("phone", ""),
            resume_link="",  # Will be set by Node.js
            parsed_info={
                "work_history": input_data.get("work_history", []),
                "achievements": input_data.get("achievements", []),
                "certifications": input_data.get("certifications", []),
                "projects": input_data.get("projects", [])
            },
            experience_years=input_data.get("years_of_experience", 0) or 0,
            current_role=input_data.get("current_role", "Not Specified"),
            skills=input_data.get("technical_skills", []),
            education=input_data.get("education", []),
            linkedin_url=input_data.get("linkedin_url"),
            github_url=input_data.get("github_url"),
            portfolio_url=input_data.get("portfolio_url")
        )
        
        # Create generic job for assessment
        job = create_generic_job_for_assessment(candidate.skills)
        
        # Create temporary application
        application = Application(
            application_id=0,
            candidate_id=0,
            job_id=0,
            application_date=datetime.now(),
            overall_status="assessment",
            stage="initial_assessment"
        )
        
        # Generate selection sheet
        generator = SelectionSheetGenerator()
        sheet = generator.generate_sheet(candidate, job, application)
        
        # Export to HTML
        html_content = generator.export_to_html(sheet)
        
        # Prepare output
        output = {
            "success": True,
            "selection_sheet_json": sheet,
            "selection_sheet_html": html_content,
            "candidate_summary": {
                "name": candidate.name,
                "email": candidate.email,
                "experience_years": candidate.experience_years,
                "skills_count": len(candidate.skills),
                "skill_match_score": sheet.get("analysis", {}).get("skill_match_score", 0)
            }
        }
        
        # Output JSON to stdout
        print(json.dumps(output, indent=2, ensure_ascii=False, default=str))
        
    except Exception as e:
        error_output = {
            "success": False,
            "error": str(e),
            "selection_sheet_json": {},
            "selection_sheet_html": ""
        }
        print(json.dumps(error_output), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()