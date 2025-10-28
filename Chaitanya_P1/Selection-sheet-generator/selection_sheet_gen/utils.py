"""
Utility functions and data helpers
Updated to work with database integration
"""
from datetime import datetime, timedelta
from typing import List, Optional
from models import Candidate, Job, Application
from datab.db_manager import DatabaseManager
import logging

logger = logging.getLogger(__name__)

def create_mock_data():
    """Create mock data for testing (original function maintained for compatibility)"""
    
    candidates = [
        Candidate(
            candidate_id=1,
            name="Alex Chen",
            email="alex.chen@email.com",
            contact="+1-555-0101",
            resume_link="https://example.com/resumes/alex_chen.pdf",
            parsed_info={
                "work_history": [
                    {"company": "TechCorp", "role": "Senior Engineer", "duration": "2021-2024"},
                    {"company": "StartupXYZ", "role": "Full Stack Developer", "duration": "2018-2021"}
                ],
                "achievements": [
                    "Reduced system latency by 40%",
                    "Scaled team from 5 to 20 engineers"
                ]
            },
            experience_years=8,
            current_role="Senior Software Engineer",
            skills=["Python", "JavaScript", "AWS", "Kubernetes", "PostgreSQL"],
            education=[{"degree": "BS Computer Science", "university": "UC Berkeley", "year": 2016}],
            linkedin_url="https://linkedin.com/in/alexchen",
            github_url="https://github.com/alexchen"
        ),
        Candidate(
            candidate_id=2,
            name="Sarah Williams",
            email="sarah.w@email.com",
            contact="+1-555-0102",
            resume_link="https://example.com/resumes/sarah_w.pdf",
            parsed_info={
                "work_history": [
                    {"company": "MegaCorp", "role": "Engineering Manager", "duration": "2020-2024"}
                ],
                "employment_gap": {"period": "March-June 2020", "reason": "Sabbatical"}
            },
            experience_years=10,
            current_role="Engineering Manager",
            skills=["Team Leadership", "Python", "System Design", "Agile"],
            education=[{"degree": "MS Computer Science", "university": "Stanford", "year": 2014}]
        )
    ]
    
    jobs = [
        Job(
            job_id=1,
            title="Senior Backend Engineer",
            description="Build scalable backend services",
            status="active",
            role_type="engineering",
            seniority="senior",
            required_skills=["Python", "AWS", "Kubernetes"],
            nice_to_have_skills=["Go", "Redis"],
            special_requirements=[]
        ),
        Job(
            job_id=2,
            title="Engineering Manager",
            description="Lead our platform team",
            status="active",
            role_type="management",
            seniority="senior",
            required_skills=["Team Leadership", "System Design", "Python"],
            nice_to_have_skills=["Kubernetes"],
            special_requirements=["security_clearance"]
        )
    ]
    
    applications = [
        Application(
            application_id=1,
            candidate_id=1,
            job_id=1,
            application_date=datetime.now() - timedelta(days=3),
            overall_status="in_review",
            stage="technical_screen"
        ),
        Application(
            application_id=2,
            candidate_id=2,
            job_id=2,
            application_date=datetime.now() - timedelta(days=5),
            overall_status="in_review",
            stage="initial_screen"
        )
    ]
    
    return candidates, jobs, applications

def load_data_from_database(limit_candidates: int = 100, limit_jobs: int = 50):
    """Load data from database instead of mock data"""
    try:
        db_manager = DatabaseManager()
        
        # Get candidates from database
        raw_candidates = db_manager.get_candidates_for_pipeline(limit_candidates)
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
        
        # Get jobs from database
        raw_jobs = db_manager.get_jobs_for_matching(limit_jobs)
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
        
        # Create applications for all combinations (or load existing)
        applications = []
        app_id = 1
        for job in jobs:
            for candidate in candidates[:5]:  # Limit to first 5 candidates per job
                application = Application(
                    application_id=app_id,
                    candidate_id=candidate.candidate_id,
                    job_id=job.job_id,
                    application_date=datetime.now(),
                    overall_status="in_review",
                    stage="initial_screen"
                )
                applications.append(application)
                app_id += 1
        
        logger.info(f"Loaded {len(candidates)} candidates, {len(jobs)} jobs, "
                   f"{len(applications)} applications from database")
        
        return candidates, jobs, applications
        
    except Exception as e:
        logger.error(f"Error loading from database: {e}")
        logger.info("Falling back to mock data")
        return create_mock_data()

def safe_get_by_id(items: List, item_id: int, id_field: str = 'id'):
    """Safely get item by ID from list"""
    for item in items:
        if hasattr(item, id_field) and getattr(item, id_field) == item_id:
            return item
    return None

def sanitize_filename(name: str) -> str:
    """Sanitize filename to avoid filesystem issues"""
    # Replace spaces and special characters
    safe_name = name.replace(' ', '_').replace('/', '_').replace('\\', '_')
    # Remove any other potentially problematic characters
    safe_name = ''.join(c for c in safe_name if c.isalnum() or c in ('_', '-'))
    return safe_name