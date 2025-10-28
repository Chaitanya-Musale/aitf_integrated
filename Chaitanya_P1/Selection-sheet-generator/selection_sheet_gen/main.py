"""
Main execution script - Enhanced with standalone support for Node.js integration
"""
import logging
import sys
import json
from pathlib import Path
from datetime import datetime
from generator import SelectionSheetGenerator
from utils import create_mock_data, load_data_from_database, safe_get_by_id, sanitize_filename
from models import Candidate, Job, Application

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def process_resume_from_text(resume_text: str) -> dict:
    """
    Process a single resume text and return parsed data
    Used by standalone scripts
    """
    from gcp.cv_parser import GeminiCVParser
    from dataclasses import asdict
    
    parser = GeminiCVParser()
    parsed_cv = parser.parse_cv(resume_text, "uploaded_resume")
    
    return asdict(parsed_cv)

def generate_candidate_assessment(parsed_data: dict) -> dict:
    """
    Generate candidate assessment sheet from parsed data
    Used by standalone scripts
    """
    # Create Candidate object
    candidate = Candidate(
        candidate_id=0,
        name=parsed_data.get("name", "Unknown"),
        email=parsed_data.get("email", ""),
        contact=parsed_data.get("phone", ""),
        resume_link="",
        parsed_info={
            "work_history": parsed_data.get("work_history", []),
            "achievements": parsed_data.get("achievements", [])
        },
        experience_years=parsed_data.get("years_of_experience", 0) or 0,
        current_role=parsed_data.get("current_role", "Not Specified"),
        skills=parsed_data.get("technical_skills", []),
        education=parsed_data.get("education", []),
        linkedin_url=parsed_data.get("linkedin_url"),
        github_url=parsed_data.get("github_url"),
        portfolio_url=parsed_data.get("portfolio_url")
    )
    
    # Create generic job for assessment
    job = Job(
        job_id=0,
        title="Candidate Assessment",
        description="General candidate evaluation",
        status="assessment",
        role_type="engineering",
        seniority="mid",
        required_skills=candidate.skills[:5] if candidate.skills else [],
        nice_to_have_skills=[],
        special_requirements=[]
    )
    
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
    html = generator.export_to_html(sheet)
    
    return {
        "selection_sheet_json": sheet,
        "selection_sheet_html": html
    }

def main():
    """Main execution function with database integration"""
    print("=" * 80)
    print("AI SELECTION SHEET GENERATOR - DATABASE INTEGRATED VERSION")
    print("=" * 80)
    
    try:
        # Parse arguments
        import argparse
        parser = argparse.ArgumentParser(description='AI Selection Sheet Generator')
        parser.add_argument('--source', choices=['mock', 'database'], 
                          default='database',
                          help='Data source: mock or database')
        parser.add_argument('--output', choices=['local', 'gcs', 'both'], 
                          default='both',
                          help='Output location: local files, GCS, or both')
        parser.add_argument('--limit-candidates', type=int, default=10,
                          help='Limit number of candidates to process')
        parser.add_argument('--limit-jobs', type=int, default=5,
                          help='Limit number of jobs to process')
        
        args = parser.parse_args()
        
        # Create output directory if it doesn't exist
        output_dir = Path("selection_sheets")
        output_dir.mkdir(exist_ok=True)
        logger.info(f"Output directory: {output_dir}")
        
        # Load data based on source
        print(f"\n📊 Loading data from {args.source}...")
        if args.source == 'database':
            candidates, jobs, applications = load_data_from_database(
                args.limit_candidates, 
                args.limit_jobs
            )
        else:
            candidates, jobs, applications = create_mock_data()
        
        print(f"✓ Loaded {len(candidates)} candidates, {len(jobs)} jobs, "
              f"{len(applications)} applications")
        
        # Validate data
        if not candidates:
            logger.error("No candidates found")
            return []
        if not jobs:
            logger.error("No jobs found")
            return []
        if not applications:
            logger.error("No applications found")
            return []
        
        # Initialize generator and GCS handler
        generator = SelectionSheetGenerator()
        gcs_handler = None
        
        if args.output in ['gcs', 'both']:
            try:
                from gcp.gcp_handler import GCSHandler
                gcs_handler = GCSHandler()
                print("✓ Connected to GCS")
            except Exception as e:
                logger.error(f"Failed to connect to GCS: {e}")
                if args.output == 'gcs':
                    raise
                gcs_handler = None
        
        # Track statistics
        successful_sheets = []
        failed_applications = []
        
        # Process applications
        print(f"\n🚀 Processing {len(applications)} applications...")
        print("-" * 60)
        
        for i, application in enumerate(applications):
            try:
                # Get candidate and job
                candidate = safe_get_by_id(candidates, application.candidate_id, 'candidate_id')
                job = safe_get_by_id(jobs, application.job_id, 'job_id')
                
                # Validate lookup results
                if not candidate:
                    logger.error(f"Candidate not found for application {application.application_id}")
                    failed_applications.append(application.application_id)
                    continue
                
                if not job:
                    logger.error(f"Job not found for application {application.application_id}")
                    failed_applications.append(application.application_id)
                    continue
                
                # Generate sheet
                print(f"\n[{i+1}/{len(applications)}] Processing: {candidate.name} -> {job.title}")
                sheet = generator.generate_sheet(candidate, job, application)
                successful_sheets.append(sheet)
                
                # Export to HTML
                html_content = generator.export_to_html(sheet)
                
                # Create safe filename
                safe_name = sanitize_filename(candidate.name)
                filename_base = f"sheet_{safe_name}_{job.job_id}"
                
                # Save locally if needed
                if args.output in ['local', 'both']:
                    try:
                        local_path = output_dir / f"{filename_base}.html"
                        with open(local_path, 'w', encoding='utf-8') as f:
                            f.write(html_content)
                        print(f"  📄 Saved locally: {local_path}")
                    except Exception as e:
                        logger.error(f"Failed to save locally: {e}")
                
                # Upload to GCS if needed
                if gcs_handler and args.output in ['gcs', 'both']:
                    try:
                        gcs_path = f"selection_sheets/{filename_base}.html"
                        gcs_url = gcs_handler.upload_html(html_content, gcs_path)
                        print(f"  ☁️ Uploaded to GCS: {gcs_url}")
                    except Exception as e:
                        logger.error(f"Failed to upload to GCS: {e}")
                
                # Also save JSON version locally
                if args.output in ['local', 'both']:
                    try:
                        json_path = output_dir / f"{filename_base}.json"
                        with open(json_path, 'w', encoding='utf-8') as f:
                            json.dump(sheet, f, indent=2, ensure_ascii=False)
                        logger.debug(f"Saved JSON: {json_path}")
                    except Exception as e:
                        logger.error(f"Failed to save JSON: {e}")
                
            except Exception as e:
                logger.error(f"Failed to process application {application.application_id}: {e}")
                failed_applications.append(application.application_id)
                continue
        
        # Print summary
        print(f"\n{'='*80}")
        print(f"✅ COMPLETED")
        print(f"  - Successful: {len(successful_sheets)} sheets")
        print(f"  - Failed: {len(failed_applications)} applications")
        print(f"  - Output: {args.output}")
        print(f"{'='*80}")
        
        return successful_sheets
        
    except Exception as e:
        logger.error(f"Fatal error in main execution: {e}")
        print(f"\n❌ FATAL ERROR: {e}")
        sys.exit(1)

def run_integrated_pipeline():
    """Run the complete integrated pipeline"""
    print("=" * 80)
    print("RUNNING COMPLETE INTEGRATED PIPELINE")
    print("=" * 80)
    
    try:
        from cv_pipeline import PipelineIntegration
        
        integration = PipelineIntegration()
        integration.run_complete_workflow()
        
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Check if running integrated pipeline
    if len(sys.argv) > 1 and sys.argv[1] == '--pipeline':
        run_integrated_pipeline()
    else:
        try:
            sheets = main()
            sys.exit(0 if sheets else 1)
        except KeyboardInterrupt:
            print("\n\n🛑 Process interrupted by user")
            sys.exit(130)
        except Exception as e:
            logger.error(f"Unhandled exception: {e}")
            sys.exit(1)