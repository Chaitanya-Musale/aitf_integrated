"""
CV Processing Pipeline - Main Orchestrator
"""
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import asdict
from concurrent.futures import ThreadPoolExecutor

from config import Config
from gcp.gcp_handler import GCSHandler
from gcp.pdf_extractor import PDFExtractor
from gcp.cv_parser import GeminiCVParser
from datab.db_manager import DatabaseManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CVProcessingPipeline:
    """Main pipeline orchestrator"""
    
    def __init__(self):
        self.gcs_handler = GCSHandler()
        self.pdf_extractor = PDFExtractor()
        self.gemini_parser = GeminiCVParser()
        self.db_manager = DatabaseManager()
        self.executor = ThreadPoolExecutor(max_workers=Config.MAX_WORKERS)
    
    def process_single_cv(self, pdf_path: str) -> Optional[int]:
        """Process a single CV file"""
        try:
            logger.info(f"Processing: {pdf_path}")
            
            # Download PDF from GCS
            pdf_content = self.gcs_handler.download_pdf(pdf_path)
            
            # Extract text
            text = self.pdf_extractor.extract_text(pdf_content)
            if not text.strip():
                logger.warning(f"No text extracted from {pdf_path}")
                return None
            
            # Parse with Gemini
            parsed_cv = self.gemini_parser.parse_cv(text, pdf_path)
            
            # Upload parsed JSON to GCS
            json_path = f"parsed/{Path(pdf_path).stem}_parsed.json"
            gcs_json_url = self.gcs_handler.upload_json(asdict(parsed_cv), json_path)
            
            # Store in database
            candidate_id = self.db_manager.insert_candidate(parsed_cv, gcs_json_url)
            
            return candidate_id
            
        except Exception as e:
            logger.error(f"Error processing {pdf_path}: {e}")
            return None
    
    def process_batch(self, pdf_paths: List[str]) -> Dict[str, Any]:
        """Process a batch of CV files"""
        results = {
            'successful': [],
            'failed': [],
            'total': len(pdf_paths)
        }
        
        # Process files concurrently
        futures = []
        for pdf_path in pdf_paths:
            future = self.executor.submit(self.process_single_cv, pdf_path)
            futures.append((pdf_path, future))
        
        # Collect results
        for pdf_path, future in futures:
            try:
                candidate_id = future.result(timeout=60)
                if candidate_id:
                    results['successful'].append({
                        'file': pdf_path,
                        'candidate_id': candidate_id
                    })
                else:
                    results['failed'].append({
                        'file': pdf_path,
                        'error': 'Processing failed'
                    })
            except Exception as e:
                results['failed'].append({
                    'file': pdf_path,
                    'error': str(e)
                })
        
        return results
    
    def run_full_pipeline(self, prefix: str = "cvs/") -> Dict[str, Any]:
        """Run the complete pipeline for all CVs in GCS"""
        logger.info("Starting full CV processing pipeline")
        
        # List all PDFs in bucket
        pdf_files = self.gcs_handler.list_pdfs(prefix)
        
        if not pdf_files:
            logger.warning("No PDF files found to process")
            return {'message': 'No files found'}
        
        # Process in batches
        all_results = {
            'successful': [],
            'failed': [],
            'total': 0,
            'batches': []
        }
        
        for i in range(0, len(pdf_files), Config.BATCH_SIZE):
            batch = pdf_files[i:i+Config.BATCH_SIZE]
            logger.info(f"Processing batch {i//Config.BATCH_SIZE + 1} ({len(batch)} files)")
            
            batch_results = self.process_batch(batch)
            
            all_results['successful'].extend(batch_results['successful'])
            all_results['failed'].extend(batch_results['failed'])
            all_results['batches'].append({
                'batch_number': i//Config.BATCH_SIZE + 1,
                'files_processed': len(batch),
                'successful': len(batch_results['successful']),
                'failed': len(batch_results['failed'])
            })
        
        all_results['total'] = len(pdf_files)
        all_results['success_rate'] = (
            len(all_results['successful']) / len(pdf_files) * 100 
            if pdf_files else 0
        )
        
        # Generate summary report
        self._generate_report(all_results)
        
        logger.info(f"Pipeline completed: {len(all_results['successful'])} successful, "
                   f"{len(all_results['failed'])} failed")
        
        return all_results
    
    def _generate_report(self, results: Dict[str, Any]):
        """Generate and upload processing report"""
        report = {
            'timestamp': datetime.now().isoformat(),
            'summary': {
                'total_files': results['total'],
                'successful': len(results['successful']),
                'failed': len(results['failed']),
                'success_rate': results['success_rate']
            },
            'batches': results['batches'],
            'failed_files': results['failed']
        }
        
        # Upload report to GCS
        report_path = f"reports/processing_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        self.gcs_handler.upload_json(report, report_path)
        
        logger.info(f"Report uploaded to {report_path}")

class PipelineIntegration:
    """Integrates parsed CVs with the AI Selection Sheet Generator"""
    
    def __init__(self):
        self.db_manager = DatabaseManager()
        self.gcs_handler = GCSHandler()
    
    def prepare_candidates_for_ai_pipeline(self, limit: int = 100) -> List[Any]:
        """Prepare candidate data for AI pipeline processing"""
        
        # Import your existing Candidate model
        from models import Candidate
        
        # Get candidates from database
        raw_candidates = self.db_manager.get_candidates_for_pipeline(limit)
        
        # Convert to Candidate objects for AI pipeline
        candidates = []
        for data in raw_candidates:
            candidate = Candidate(
                candidate_id=data['candidate_id'],
                name=data['name'],
                email=data['email'],
                contact=data['contact'],
                resume_link=data['resume_link'],
                parsed_info=data['parsed_info'],
                experience_years=data['experience_years'] or 0,
                current_role=data['current_role'] or 'Not Specified',
                skills=data['skills'] or [],
                education=data['education'] or [],
                linkedin_url=data.get('linkedin_url'),
                github_url=data.get('github_url'),
                portfolio_url=data.get('portfolio_url')
            )
            candidates.append(candidate)
        
        logger.info(f"Prepared {len(candidates)} candidates for AI pipeline")
        return candidates
    
    def prepare_jobs_for_matching(self, limit: int = 50) -> List[Any]:
        """Prepare job data for matching"""
        
        # Import your existing Job model
        from models import Job
        
        # Get jobs from database
        raw_jobs = self.db_manager.get_jobs_for_matching(limit)
        
        # Convert to Job objects
        jobs = []
        for data in raw_jobs:
            job = Job(
                job_id=data['job_id'],
                title=data['title'],
                description=data['description'],
                status=data['status'],
                role_type=data['role_type'] or 'engineering',
                seniority=data['seniority'] or 'mid',
                required_skills=data['required_skills'] or [],
                nice_to_have_skills=data['nice_to_have_skills'] or [],
                special_requirements=data['special_requirements'] or [],
                team_size=data.get('team_size'),
                reports_to=data.get('reports_to')
            )
            jobs.append(job)
        
        logger.info(f"Prepared {len(jobs)} jobs for matching")
        return jobs
    
    def run_complete_workflow(self, cv_prefix: str = "cvs/"):
        """Run complete workflow: Parse CVs -> Generate Selection Sheets"""
        
        # Step 1: Process CVs
        print("\n" + "="*60)
        print("STEP 1: Processing CVs from GCS")
        print("="*60)
        
        cv_pipeline = CVProcessingPipeline()
        cv_results = cv_pipeline.run_full_pipeline(cv_prefix)
        
        print(f"✓ Processed {len(cv_results['successful'])} CVs successfully")
        
        # Step 2: Prepare data for AI pipeline
        print("\n" + "="*60)
        print("STEP 2: Preparing data for AI Selection Sheet Generator")
        print("="*60)
        
        candidates = self.prepare_candidates_for_ai_pipeline()
        jobs = self.prepare_jobs_for_matching()
        
        print(f"✓ Loaded {len(candidates)} candidates")
        print(f"✓ Loaded {len(jobs)} jobs")
        
        # Step 3: Generate Selection Sheets
        print("\n" + "="*60)
        print("STEP 3: Generating AI Selection Sheets")
        print("="*60)
        
        from generator import SelectionSheetGenerator
        from models import Application
        
        generator = SelectionSheetGenerator()
        sheets_generated = 0
        
        # Create applications and generate sheets
        for job in jobs[:3]:  # Process first 3 jobs as example
            for candidate in candidates[:5]:  # Match with first 5 candidates
                try:
                    # Create application
                    application = Application(
                        application_id=sheets_generated + 1,
                        candidate_id=candidate.candidate_id,
                        job_id=job.job_id,
                        application_date=datetime.now(),
                        overall_status='in_review',
                        stage='initial_screen'
                    )
                    
                    # Generate selection sheet
                    sheet = generator.generate_sheet(candidate, job, application)
                    
                    # Export to HTML
                    html_content = generator.export_to_html(sheet)
                    
                    # Upload to GCS
                    html_path = f"selection_sheets/{candidate.name}_{job.job_id}.html"
                    gcs_url = self.gcs_handler.upload_html(html_content, html_path)
                    
                    # Create application in database
                    app_id = self.db_manager.create_application(
                        candidate.candidate_id, 
                        job.job_id, 
                        gcs_url
                    )
                    
                    sheets_generated += 1
                    print(f"  ✓ Generated sheet: {candidate.name} -> {job.title}")
                    
                except Exception as e:
                    logger.error(f"Error generating sheet: {e}")
        
        print(f"\n✓ Generated {sheets_generated} selection sheets")
        print("\n" + "="*60)
        print("WORKFLOW COMPLETE")
        print("="*60)

def main():
    """Main execution function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='CV Processing Pipeline')
    parser.add_argument('--mode', 
                       choices=['process', 'list', 'integrate', 'workflow'],
                       default='process',
                       help='Operation mode')
    parser.add_argument('--prefix', default='cvs/',
                       help='GCS prefix for CV files')
    parser.add_argument('--file', help='Process single file')
    parser.add_argument('--limit', type=int, default=100,
                       help='Limit number of records to process')
    
    args = parser.parse_args()
    
    if args.mode == 'list':
        # List available CVs
        handler = GCSHandler()
        files = handler.list_pdfs(args.prefix)
        print(f"\nFound {len(files)} PDF files:")
        for f in files[:10]:  # Show first 10
            print(f"  - {f}")
        if len(files) > 10:
            print(f"  ... and {len(files) - 10} more")
    
    elif args.mode == 'process':
        # Process CVs
        pipeline = CVProcessingPipeline()
        
        if args.file:
            # Process single file
            result = pipeline.process_single_cv(args.file)
            if result:
                print(f"✓ Successfully processed: Candidate ID {result}")
            else:
                print("✗ Processing failed")
        else:
            # Process all files
            results = pipeline.run_full_pipeline(args.prefix)
            print(f"\n=== Processing Complete ===")
            print(f"Total Files: {results['total']}")
            print(f"Successful: {len(results['successful'])}")
            print(f"Failed: {len(results['failed'])}")
            print(f"Success Rate: {results['success_rate']:.1f}%")
    
    elif args.mode == 'integrate':
        # Prepare data for AI pipeline
        integration = PipelineIntegration()
        candidates = integration.prepare_candidates_for_ai_pipeline(args.limit)
        print(f"\n✓ {len(candidates)} candidates ready for AI pipeline")
    
    elif args.mode == 'workflow':
        # Run complete workflow
        integration = PipelineIntegration()
        integration.run_complete_workflow(args.prefix)

if __name__ == "__main__":
    main()