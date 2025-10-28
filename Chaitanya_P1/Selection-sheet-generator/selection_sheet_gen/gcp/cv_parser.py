"""
CV parsing using Google Gemini AI
"""
import json
import re
import hashlib
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict, field
import google.generativeai as genai
from config import Config

logger = logging.getLogger(__name__)

@dataclass
class ParsedCV:
    """Structured CV data after parsing"""
    # Basic Information
    name: str
    email: str
    phone: str
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    
    # Professional Summary
    summary: Optional[str] = None
    current_role: Optional[str] = None
    years_of_experience: Optional[int] = None
    
    # Work Experience
    work_history: List[Dict[str, Any]] = field(default_factory=list)
    
    # Education
    education: List[Dict[str, Any]] = field(default_factory=list)
    
    # Skills
    technical_skills: List[str] = field(default_factory=list)
    soft_skills: List[str] = field(default_factory=list)
    languages: List[str] = field(default_factory=list)
    
    # Certifications & Achievements
    certifications: List[Dict[str, Any]] = field(default_factory=list)
    achievements: List[str] = field(default_factory=list)
    
    # Projects
    projects: List[Dict[str, Any]] = field(default_factory=list)
    
    # Metadata
    parsing_confidence: float = 0.0
    parsing_timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    source_file: str = ""
    file_hash: str = ""

class GeminiCVParser:
    """Parses CV text using Google Gemini AI"""
    
    def __init__(self):
        genai.configure(api_key=Config.GEMINI_API_KEY)
        self.model = genai.GenerativeModel(Config.GEMINI_MODEL)
        logger.info(f"Initialized Gemini model: {Config.GEMINI_MODEL}")
    
    def parse_cv(self, text: str, filename: str) -> ParsedCV:
        """Parse CV text into structured format"""
        
        prompt = f"""
        Parse the following CV/Resume text and extract structured information.
        
        Return a JSON object with these fields (use null if not found):
        {{
            "name": "Full name",
            "email": "Email address",
            "phone": "Phone number",
            "location": "City, Country",
            "linkedin_url": "LinkedIn profile URL",
            "github_url": "GitHub profile URL",
            "portfolio_url": "Portfolio/website URL",
            "summary": "Professional summary or objective",
            "current_role": "Current job title",
            "years_of_experience": "Total years of experience as integer",
            "work_history": [
                {{
                    "company": "Company name",
                    "role": "Job title",
                    "duration": "Start-End dates",
                    "location": "Location",
                    "description": "Job description",
                    "achievements": ["Achievement 1", "Achievement 2"]
                }}
            ],
            "education": [
                {{
                    "degree": "Degree name",
                    "field": "Field of study",
                    "institution": "University/College name",
                    "year": "Graduation year",
                    "gpa": "GPA if mentioned",
                    "honors": "Honors/Awards"
                }}
            ],
            "technical_skills": ["Skill1", "Skill2"],
            "soft_skills": ["Skill1", "Skill2"],
            "languages": ["Language1", "Language2"],
            "certifications": [
                {{
                    "name": "Certification name",
                    "issuer": "Issuing organization",
                    "date": "Date obtained",
                    "credential_id": "ID if available"
                }}
            ],
            "achievements": ["Achievement 1", "Achievement 2"],
            "projects": [
                {{
                    "name": "Project name",
                    "description": "Project description",
                    "technologies": ["Tech1", "Tech2"],
                    "url": "Project URL if available",
                    "duration": "Duration"
                }}
            ],
            "parsing_confidence": 0.0
        }}
        
        Important instructions:
        1. Extract email and phone accurately - they are critical
        2. Normalize skill names (e.g., JS -> JavaScript, K8s -> Kubernetes)
        3. Calculate years of experience from work history if not explicitly stated
        4. Set parsing_confidence between 0-1 based on how complete the extraction is
        5. Extract URLs completely including https://
        6. For dates, use format "YYYY-MM" or "YYYY" when possible
        
        CV Text:
        {text[:15000]}  # Limit text to avoid token limits
        
        Return ONLY valid JSON, no additional text.
        """
        
        try:
            response = self.model.generate_content(prompt)
            
            # Extract JSON from response
            json_text = response.text
            json_match = re.search(r'\{.*\}', json_text, re.DOTALL)
            
            if json_match:
                parsed_data = json.loads(json_match.group())
                
                # Create ParsedCV object
                cv = ParsedCV(
                    name=parsed_data.get('name', ''),
                    email=parsed_data.get('email', ''),
                    phone=parsed_data.get('phone', ''),
                    location=parsed_data.get('location'),
                    linkedin_url=parsed_data.get('linkedin_url'),
                    github_url=parsed_data.get('github_url'),
                    portfolio_url=parsed_data.get('portfolio_url'),
                    summary=parsed_data.get('summary'),
                    current_role=parsed_data.get('current_role'),
                    years_of_experience=parsed_data.get('years_of_experience'),
                    work_history=parsed_data.get('work_history', []),
                    education=parsed_data.get('education', []),
                    technical_skills=parsed_data.get('technical_skills', []),
                    soft_skills=parsed_data.get('soft_skills', []),
                    languages=parsed_data.get('languages', []),
                    certifications=parsed_data.get('certifications', []),
                    achievements=parsed_data.get('achievements', []),
                    projects=parsed_data.get('projects', []),
                    parsing_confidence=parsed_data.get('parsing_confidence', 0.5),
                    source_file=filename,
                    file_hash=hashlib.md5(text.encode()).hexdigest()
                )
                
                logger.info(f"Successfully parsed CV for: {cv.name}")
                return cv
            
            raise ValueError("No JSON found in response")
                
        except Exception as e:
            logger.error(f"Error parsing CV with Gemini: {e}")
            
            # Return minimal parsed CV with error
            return ParsedCV(
                name="Parse Error",
                email="",
                phone="",
                source_file=filename,
                parsing_confidence=0.0
            )