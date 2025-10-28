"""
PostgreSQL database manager for candidate data
"""
import logging
from typing import List, Dict, Optional
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from psycopg2.pool import SimpleConnectionPool
from config import Config
from gcp.cv_parser import ParsedCV

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Manages PostgreSQL database operations"""
    
    def __init__(self):
        self.pool = SimpleConnectionPool(
            1, 20,
            host=Config.DB_HOST,
            port=Config.DB_PORT,
            database=Config.DB_NAME,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD
        )
        logger.info(f"Connected to database: {Config.DB_NAME}")
        self.init_tables()
    
    def get_connection(self):
        return self.pool.getconn()
    
    def put_connection(self, conn):
        self.pool.putconn(conn)
    
    def init_tables(self):
        """Initialize database tables if they don't exist"""
        conn = self.get_connection()
        try:
            with conn.cursor() as cur:
                # Create candidates table (enhanced)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS candidates (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        email VARCHAR(255) UNIQUE NOT NULL,
                        phone VARCHAR(50),
                        location VARCHAR(255),
                        linkedin_url TEXT,
                        github_url TEXT,
                        portfolio_url TEXT,
                        summary TEXT,
                        current_role VARCHAR(255),
                        years_of_experience INTEGER,
                        work_history JSONB,
                        education JSONB,
                        technical_skills TEXT[],
                        soft_skills TEXT[],
                        languages TEXT[],
                        certifications JSONB,
                        achievements TEXT[],
                        projects JSONB,
                        parsing_confidence FLOAT,
                        source_file VARCHAR(500),
                        file_hash VARCHAR(64),
                        gcs_json_url TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        status VARCHAR(50) DEFAULT 'active',
                        CONSTRAINT unique_email_phone UNIQUE(email, phone)
                    )
                """)
                
                # Create parsing_logs table
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS parsing_logs (
                        id SERIAL PRIMARY KEY,
                        file_name VARCHAR(500),
                        file_hash VARCHAR(64),
                        parsing_status VARCHAR(50),
                        parsing_confidence FLOAT,
                        error_message TEXT,
                        candidate_id INTEGER REFERENCES candidates(id),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create jobs table if not exists (for integration)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS jobs (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        status VARCHAR(50) DEFAULT 'active',
                        role_type VARCHAR(100),
                        seniority VARCHAR(50),
                        required_skills TEXT[],
                        nice_to_have_skills TEXT[],
                        special_requirements TEXT[],
                        team_size INTEGER,
                        reports_to VARCHAR(255),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create applications table if not exists
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS applications (
                        id SERIAL PRIMARY KEY,
                        candidate_id INTEGER REFERENCES candidates(id),
                        job_id INTEGER REFERENCES jobs(id),
                        application_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        overall_status VARCHAR(50) DEFAULT 'in_review',
                        stage VARCHAR(100),
                        notes TEXT,
                        selection_sheet_url TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT unique_application UNIQUE(candidate_id, job_id)
                    )
                """)
                
                # Create indexes
                cur.execute("CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_parsing_logs_status ON parsing_logs(parsing_status)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(overall_status)")
                
                conn.commit()
                logger.info("Database tables initialized")
                
        except Exception as e:
            logger.error(f"Error initializing tables: {e}")
            conn.rollback()
            raise
        finally:
            self.put_connection(conn)
    
    def insert_candidate(self, cv: ParsedCV, gcs_json_url: str = None) -> int:
        """Insert or update candidate in database"""
        conn = self.get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Check if candidate exists
                cur.execute("""
                    SELECT id FROM candidates 
                    WHERE email = %s OR (email = '' AND phone = %s AND name = %s)
                """, (cv.email, cv.phone, cv.name))
                
                existing = cur.fetchone()
                
                if existing:
                    # Update existing candidate
                    cur.execute("""
                        UPDATE candidates SET
                            name = %s,
                            phone = %s,
                            location = %s,
                            linkedin_url = %s,
                            github_url = %s,
                            portfolio_url = %s,
                            summary = %s,
                            current_role = %s,
                            years_of_experience = %s,
                            work_history = %s,
                            education = %s,
                            technical_skills = %s,
                            soft_skills = %s,
                            languages = %s,
                            certifications = %s,
                            achievements = %s,
                            projects = %s,
                            parsing_confidence = %s,
                            source_file = %s,
                            file_hash = %s,
                            gcs_json_url = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        RETURNING id
                    """, (
                        cv.name, cv.phone, cv.location,
                        cv.linkedin_url, cv.github_url, cv.portfolio_url,
                        cv.summary, cv.current_role, cv.years_of_experience,
                        Json(cv.work_history), Json(cv.education),
                        cv.technical_skills, cv.soft_skills, cv.languages,
                        Json(cv.certifications), cv.achievements, Json(cv.projects),
                        cv.parsing_confidence, cv.source_file, cv.file_hash,
                        gcs_json_url, existing['id']
                    ))
                    
                    candidate_id = existing['id']
                    logger.info(f"Updated candidate {candidate_id}: {cv.name}")
                    
                else:
                    # Insert new candidate
                    cur.execute("""
                        INSERT INTO candidates (
                            name, email, phone, location,
                            linkedin_url, github_url, portfolio_url,
                            summary, current_role, years_of_experience,
                            work_history, education,
                            technical_skills, soft_skills, languages,
                            certifications, achievements, projects,
                            parsing_confidence, source_file, file_hash,
                            gcs_json_url
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        ) RETURNING id
                    """, (
                        cv.name, cv.email, cv.phone, cv.location,
                        cv.linkedin_url, cv.github_url, cv.portfolio_url,
                        cv.summary, cv.current_role, cv.years_of_experience,
                        Json(cv.work_history), Json(cv.education),
                        cv.technical_skills, cv.soft_skills, cv.languages,
                        Json(cv.certifications), cv.achievements, Json(cv.projects),
                        cv.parsing_confidence, cv.source_file, cv.file_hash,
                        gcs_json_url
                    ))
                    
                    candidate_id = cur.fetchone()['id']
                    logger.info(f"Inserted new candidate {candidate_id}: {cv.name}")
                
                # Log the parsing
                cur.execute("""
                    INSERT INTO parsing_logs (
                        file_name, file_hash, parsing_status, 
                        parsing_confidence, candidate_id
                    ) VALUES (%s, %s, %s, %s, %s)
                """, (
                    cv.source_file, cv.file_hash, 'success',
                    cv.parsing_confidence, candidate_id
                ))
                
                conn.commit()
                return candidate_id
                
        except Exception as e:
            logger.error(f"Error inserting candidate: {e}")
            conn.rollback()
            
            # Log failed parsing
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO parsing_logs (
                            file_name, file_hash, parsing_status, 
                            error_message
                        ) VALUES (%s, %s, %s, %s)
                    """, (
                        cv.source_file, cv.file_hash, 'failed', str(e)
                    ))
                    conn.commit()
            except:
                pass
            
            raise
        finally:
            self.put_connection(conn)
    
    def get_candidates_for_pipeline(self, limit: int = 100) -> List[Dict]:
        """Retrieve candidates for AI pipeline processing"""
        conn = self.get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT 
                        id AS candidate_id,
                        name, email, phone AS contact,
                        current_role, years_of_experience AS experience_years,
                        technical_skills AS skills,
                        education, work_history,
                        source_file AS resume_link,
                        linkedin_url, github_url, portfolio_url,
                        JSONB_BUILD_OBJECT(
                            'work_history', work_history,
                            'achievements', achievements,
                            'projects', projects
                        ) AS parsed_info
                    FROM candidates
                    WHERE status = 'active'
                        AND parsing_confidence >= 0.5
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (limit,))
                
                candidates = cur.fetchall()
                logger.info(f"Retrieved {len(candidates)} candidates for pipeline")
                return candidates
                
        except Exception as e:
            logger.error(f"Error retrieving candidates: {e}")
            raise
        finally:
            self.put_connection(conn)
    
    def get_jobs_for_matching(self, limit: int = 50) -> List[Dict]:
        """Retrieve jobs for matching with candidates"""
        conn = self.get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT 
                        id AS job_id,
                        title, description, status,
                        role_type, seniority,
                        required_skills, nice_to_have_skills,
                        special_requirements, team_size, reports_to
                    FROM jobs
                    WHERE status = 'active'
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (limit,))
                
                jobs = cur.fetchall()
                logger.info(f"Retrieved {len(jobs)} jobs for matching")
                return jobs
                
        except Exception as e:
            logger.error(f"Error retrieving jobs: {e}")
            raise
        finally:
            self.put_connection(conn)
    
    def create_application(self, candidate_id: int, job_id: int, 
                          selection_sheet_url: str = None) -> int:
        """Create an application linking candidate to job"""
        conn = self.get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO applications (
                        candidate_id, job_id, 
                        overall_status, stage, 
                        selection_sheet_url
                    ) VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (candidate_id, job_id) 
                    DO UPDATE SET
                        selection_sheet_url = EXCLUDED.selection_sheet_url,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id
                """, (
                    candidate_id, job_id,
                    'in_review', 'initial_screen',
                    selection_sheet_url
                ))
                
                application_id = cur.fetchone()['id']
                conn.commit()
                
                logger.info(f"Created application {application_id}: "
                          f"Candidate {candidate_id} -> Job {job_id}")
                return application_id
                
        except Exception as e:
            logger.error(f"Error creating application: {e}")
            conn.rollback()
            raise
        finally:
            self.put_connection(conn)