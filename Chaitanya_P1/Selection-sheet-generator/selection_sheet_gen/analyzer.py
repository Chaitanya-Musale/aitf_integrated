"""Enhanced AI-powered analysis using Google Gemini with new features"""

import json
import re
import hashlib
import logging
from datetime import datetime, timedelta
from collections import OrderedDict
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from pydantic import BaseModel, Field, ValidationError
import google.generativeai as genai
from config import GEMINI_API_KEY, GEMINI_MODEL

# Configure logging
logger = logging.getLogger(__name__)

# Configuration constants
CACHE_MAX_SIZE = 100
CACHE_EXPIRY_HOURS = 24
JOB_HOPPING_THRESHOLD = 1.5
MODEL_VERSION = "v2.0"

# ============================================================================
# SKILL NORMALIZATION AND ONTOLOGY
# ============================================================================

# Skill aliases for canonical mapping
SKILL_ALIASES = {
    "gke": "kubernetes",
    "k8s": "kubernetes",
    "postgres": "postgresql",
    "psql": "postgresql",
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "node": "nodejs",
    "react.js": "react",
    "vue.js": "vue",
    "docker-compose": "docker",
    "aws-ec2": "aws",
    "aws-s3": "aws",
    "aws-rds": "aws",
    "gcp": "google cloud",
    "azure": "microsoft azure",
}

def normalize_skill(skill: str) -> str:
    """Normalize a single skill to canonical form"""
    if not skill:
        return ""
    # Lowercase and strip whitespace
    skill = re.sub(r'\s+', ' ', skill.strip().lower())
    # Apply canonical mapping
    return SKILL_ALIASES.get(skill, skill)

def normalize_skills(skills: List[str]) -> set:
    """Normalize a list of skills to canonical form"""
    return {normalize_skill(s) for s in (skills or []) if s}

# ============================================================================
# PYDANTIC SCHEMAS FOR VALIDATION
# ============================================================================

class InterviewQuestion(BaseModel):
    """Schema for interview question"""
    question: str
    purpose: str
    follow_up: str
    red_flags: str = ""
    category: str = Field(default="general", description="Category: technical, behavioral, system_design, debugging")
    seniority_level: str = Field(default="mid", description="junior, mid, senior, lead")

class CareerTrajectory(BaseModel):
    """Schema for career trajectory analysis"""
    progression_summary: str
    growth_rate: str = Field(pattern="^(fast|steady|slow)$")
    key_transitions: List[str] = []
    expertise_evolution: str
    strengths: List[str] = []
    potential_concerns: List[str] = []
    tenure_per_role: Optional[List[Dict[str, Any]]] = []
    
class RedFlag(BaseModel):
    """Schema for red flags"""
    issue: str
    severity: str = Field(pattern="^(low|medium|high)$")
    suggested_probe: str
    evidence: Optional[str] = ""

class RubricScore(BaseModel):
    """Schema for rubric-based scoring"""
    criterion: str
    score: int = Field(ge=1, le=5)
    weight: float = Field(ge=0, le=1)
    evidence: str = ""
    confidence: float = Field(ge=0, le=1)

# ============================================================================
# CIRCUIT BREAKER FOR API RESILIENCE
# ============================================================================

class CircuitBreaker:
    """Circuit breaker pattern for API calls"""
    def __init__(self, threshold: int = 5, cooldown: int = 60):
        self.failure_count = 0
        self.open_until = 0
        self.threshold = threshold
        self.cooldown_seconds = cooldown
        
    def allow(self) -> bool:
        """Check if requests are allowed"""
        import time
        return time.time() >= self.open_until
        
    def record_success(self):
        """Record a successful request"""
        self.failure_count = 0
        
    def record_failure(self):
        """Record a failed request"""
        import time
        self.failure_count += 1
        if self.failure_count >= self.threshold:
            self.open_until = time.time() + self.cooldown_seconds
            logger.warning(f"Circuit breaker opened until {datetime.fromtimestamp(self.open_until)}")

# ============================================================================
# ENHANCED LRU CACHE
# ============================================================================

class LRUCache:
    """Enhanced LRU Cache with model version awareness"""
    
    def __init__(self, max_size: int = CACHE_MAX_SIZE):
        self.cache = OrderedDict()
        self.max_size = max_size
        self.expiry_hours = CACHE_EXPIRY_HOURS
    
    def _make_key(self, prompt: str) -> str:
        """Generate cache key including model version"""
        content = f"{GEMINI_MODEL}:{MODEL_VERSION}:{prompt}"
        return hashlib.sha256(content.encode()).hexdigest()
    
    def get(self, prompt: str) -> Optional[Any]:
        key = self._make_key(prompt)
        if key in self.cache:
            value, timestamp = self.cache.pop(key)
            if datetime.now() - timestamp < timedelta(hours=self.expiry_hours):
                self.cache[key] = (value, timestamp)  # Move to end
                return value
        return None
    
    def set(self, prompt: str, value: Any):
        key = self._make_key(prompt)
        if key in self.cache:
            self.cache.pop(key)
        elif len(self.cache) >= self.max_size:
            self.cache.popitem(last=False)  # Remove oldest
        self.cache[key] = (value, datetime.now())

# ============================================================================
# ENHANCED GEMINI ANALYZER
# ============================================================================

class GeminiAnalyzer:
    """Enhanced AI-powered analysis using Google Gemini"""
    
    # Few-shot examples for better prompting
    FEW_SHOT_TRAJECTORY = """
    Example output:
    {
        "progression_summary": "Strong upward trajectory from junior developer to tech lead in 6 years",
        "growth_rate": "fast",
        "key_transitions": ["Developer to Senior Developer (2 years)", "Senior to Tech Lead (3 years)"],
        "expertise_evolution": "Evolved from frontend focus to full-stack with team leadership",
        "strengths": ["Technical depth", "Leadership growth", "Domain expertise"],
        "potential_concerns": ["Rapid role changes might indicate instability"],
        "tenure_per_role": [{"role": "Developer", "months": 24}, {"role": "Senior Dev", "months": 36}]
    }
    """
    
    FEW_SHOT_QUESTIONS = """
    Example output:
    [
        {
            "question": "Describe a time when you had to optimize a slow database query in production",
            "purpose": "Assess practical database optimization skills",
            "follow_up": "What monitoring did you implement to prevent recurrence?",
            "red_flags": "Only theoretical knowledge, no real examples",
            "category": "technical",
            "seniority_level": "senior"
        }
    ]
    """
    
    def __init__(self):
        genai.configure(api_key=GEMINI_API_KEY)
        self.model = genai.GenerativeModel(GEMINI_MODEL)
        self.cache = LRUCache()
        self.circuit_breaker = CircuitBreaker()
    
    def _call_gemini(self, prompt: str, use_cache: bool = True) -> str:
        """Call Gemini API with circuit breaker and caching"""
        # Check cache first
        if use_cache:
            cached = self.cache.get(prompt)
            if cached:
                logger.debug("Cache hit for prompt")
                return cached
        
        # Check circuit breaker
        if not self.circuit_breaker.allow():
            logger.warning("Circuit breaker is open, using fallback")
            return self._get_fallback_response(prompt)
        
        try:
            response = self.model.generate_content(prompt)
            result = response.text
            
            # Record success and cache
            self.circuit_breaker.record_success()
            if use_cache:
                self.cache.set(prompt, result)
            
            return result
            
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            self.circuit_breaker.record_failure()
            return self._get_fallback_response(prompt)
    
    def _parse_json_response(self, response: str, expected_type: type) -> Any:
        """Safely parse JSON response with validation"""
        try:
            # Extract JSON from response
            if expected_type == dict:
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
            else:  # list
                json_match = re.search(r'\[.*\]', response, re.DOTALL)
            
            if json_match:
                parsed = json.loads(json_match.group())
                if isinstance(parsed, expected_type):
                    return parsed
                    
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing failed: {e}")
        except Exception as e:
            logger.error(f"Unexpected error parsing response: {e}")
        
        return None
    
    def analyze_career_trajectory(self, candidate) -> Dict:
        """Analyze career with date awareness and tenure calculation"""
        work_history = candidate.parsed_info.get('work_history', [])
        
        if not work_history:
            logger.warning(f"No work history for {candidate.name}")
            return self._get_default_trajectory(candidate)
        
        # Calculate tenure for each role
        tenure_data = self._calculate_tenure(work_history)
        
        work_history_str = json.dumps(work_history, indent=2)
        skills_str = ', '.join(candidate.skills[:10]) if candidate.skills else 'Not specified'
        
        prompt = f"""
        Analyze this candidate's career trajectory with detailed insights:
        
        Name: {candidate.name}
        Years of Experience: {candidate.experience_years}
        Current Role: {candidate.current_role}
        Skills: {skills_str}
        Work History: {work_history_str}
        Tenure Analysis: {json.dumps(tenure_data, indent=2)}
        
        {self.FEW_SHOT_TRAJECTORY}
        
        Provide a JSON response with these keys:
        - progression_summary: Brief 2-3 sentence summary
        - growth_rate: "fast", "steady", or "slow"  
        - key_transitions: List of major role changes with timeframes
        - expertise_evolution: How their expertise evolved
        - strengths: List of 3-5 strengths based on evidence
        - potential_concerns: Any concerns or gaps
        - tenure_per_role: List of dicts with role and months
        
        Return only valid JSON.
        """
        
        response = self._call_gemini(prompt)
        parsed = self._parse_json_response(response, dict)
        
        if parsed:
            try:
                # Validate with Pydantic
                CareerTrajectory(**parsed)
                return parsed
            except ValidationError as e:
                logger.error(f"Validation error: {e}")
                
        return self._get_default_trajectory(candidate)
    
    def _calculate_tenure(self, work_history: List[Dict]) -> List[Dict]:
        """Calculate tenure for each role"""
        tenure_data = []
        for job in work_history:
            duration = job.get('duration', '')
            # Parse duration string (e.g., "2021-2024")
            match = re.match(r'(\d{4})-(\d{4})', duration)
            if match:
                start_year, end_year = match.groups()
                months = (int(end_year) - int(start_year)) * 12
                tenure_data.append({
                    'company': job.get('company', 'Unknown'),
                    'role': job.get('role', 'Unknown'),
                    'months': months,
                    'years': months / 12
                })
        return tenure_data
    
    def generate_interview_questions(self, candidate, job) -> List[Dict]:
        """Generate diverse, seniority-appropriate interview questions"""
        if not job.required_skills:
            return self._get_default_questions(job)
        
        # Determine question categories based on role
        categories = self._get_question_categories(job)
        
        prompt = f"""
        Generate 5 diverse interview questions for:
        
        Candidate: {candidate.name}
        Role: {job.title}
        Seniority: {job.seniority}
        Required Skills: {', '.join(job.required_skills)}
        Categories needed: {', '.join(categories)}
        
        {self.FEW_SHOT_QUESTIONS}
        
        Provide as JSON array with each question having:
        - question: The specific question to ask
        - purpose: What it assesses
        - follow_up: A probing follow-up question
        - red_flags: What to watch for
        - category: One of {categories}
        - seniority_level: Appropriate for {job.seniority}
        
        Ensure questions are diverse across categories and appropriate for seniority.
        No duplicate questions or topics.
        
        Return only valid JSON array.
        """
        
        response = self._call_gemini(prompt)
        parsed = self._parse_json_response(response, list)
        
        if parsed and len(parsed) > 0:
            validated = []
            for q in parsed[:5]:
                try:
                    validated.append(InterviewQuestion(**q).dict())
                except ValidationError:
                    continue
            return validated if validated else self._get_default_questions(job)
            
        return self._get_default_questions(job)
    
    def _get_question_categories(self, job) -> List[str]:
        """Determine question categories based on role"""
        base = ["technical", "behavioral"]
        
        if job.seniority in ["senior", "lead", "principal"]:
            base.extend(["system_design", "leadership"])
        
        if job.role_type == "engineering":
            base.append("debugging")
        elif job.role_type == "management":
            base.extend(["team_building", "strategy"])
            
        return base[:5]  # Max 5 categories
    
    def calculate_rubric_scores(self, candidate, job, template) -> Dict:
        """Calculate rubric-based scores with confidence"""
        criteria = template.get("evaluation_criteria", {})
        scores = []
        
        for criterion, config in criteria.items():
            score_data = self._score_criterion(candidate, job, criterion, config)
            try:
                validated = RubricScore(**score_data)
                scores.append(validated.dict())
            except ValidationError:
                continue
        
        # Calculate overall score and confidence
        if scores:
            weighted_sum = sum(s['score'] * s['weight'] for s in scores)
            total_weight = sum(s['weight'] for s in scores)
            overall_score = (weighted_sum / total_weight) * 20 if total_weight > 0 else 0
            avg_confidence = sum(s['confidence'] for s in scores) / len(scores)
        else:
            overall_score = 0
            avg_confidence = 0
        
        return {
            "overall_score": round(overall_score, 1),
            "confidence": round(avg_confidence, 2),
            "criterion_scores": scores
        }
    
    def _score_criterion(self, candidate, job, criterion: str, config: Dict) -> Dict:
        """Score a single criterion"""
        # Simple heuristic scoring - in production, this would use more sophisticated analysis
        score = 3  # Default middle score
        confidence = 0.5
        evidence = ""
        
        if criterion == "technical_depth":
            skill_overlap = len(set(candidate.skills) & set(job.required_skills))
            score = min(5, 1 + skill_overlap)
            confidence = 0.7 if candidate.skills else 0.3
            evidence = f"Matches {skill_overlap} required skills"
            
        elif criterion == "leadership" and candidate.current_role:
            if any(term in candidate.current_role.lower() for term in ["lead", "manager", "head"]):
                score = 4
                confidence = 0.8
                evidence = "Current leadership role"
        
        return {
            "criterion": criterion,
            "score": score,
            "weight": config.get("weight", 0.1),
            "evidence": evidence,
            "confidence": confidence
        }
    
    def identify_red_flags(self, candidate) -> List[Dict]:
        """Enhanced red flag identification with evidence"""
        red_flags = []
        
        # Employment gaps with evidence
        if 'employment_gap' in candidate.parsed_info:
            gap_info = candidate.parsed_info['employment_gap']
            red_flags.append({
                "issue": f"Employment gap: {gap_info.get('period', 'Unknown period')}",
                "severity": "medium",
                "suggested_probe": "Can you explain this gap in employment?",
                "evidence": f"Gap identified in resume: {gap_info.get('period', '')}"
            })
        
        # Job hopping with calculation
        work_history = candidate.parsed_info.get('work_history', [])
        if work_history and candidate.experience_years > 0:
            avg_tenure = candidate.experience_years / len(work_history)
            
            if avg_tenure < JOB_HOPPING_THRESHOLD and len(work_history) > 2:
                red_flags.append({
                    "issue": f"Frequent job changes (avg {avg_tenure:.1f} years per role)",
                    "severity": "low",
                    "suggested_probe": "What motivates your career moves?",
                    "evidence": f"{len(work_history)} jobs in {candidate.experience_years} years"
                })
        
        # Validate red flags
        validated = []
        for flag in red_flags:
            try:
                validated.append(RedFlag(**flag).dict())
            except ValidationError:
                validated.append(flag)  # Use original if validation fails
                
        return validated
    
    def _get_default_trajectory(self, candidate) -> Dict:
        """Default trajectory when API fails or no data"""
        return {
            "progression_summary": f"{candidate.name} has {candidate.experience_years} years of experience",
            "growth_rate": "steady",
            "key_transitions": [],
            "expertise_evolution": "Technical expertise development",
            "strengths": candidate.skills[:5] if candidate.skills else [],
            "potential_concerns": [],
            "tenure_per_role": []
        }
    
    def _get_default_questions(self, job) -> List[Dict]:
        """Default questions when API fails"""
        skill = job.required_skills[0] if job.required_skills else "relevant technologies"
        return [
            {
                "question": f"Describe your experience with {skill}",
                "purpose": "Assess technical depth",
                "follow_up": "What challenges did you face?",
                "red_flags": "Vague or theoretical answers",
                "category": "technical",
                "seniority_level": job.seniority or "mid"
            }
        ]
    
    def _get_fallback_response(self, prompt: str) -> str:
        """Enhanced fallback responses"""
        if "career trajectory" in prompt.lower():
            return json.dumps(self._get_default_trajectory(None))
        elif "interview" in prompt.lower():
            return json.dumps(self._get_default_questions(None))
        else:
            return json.dumps({"status": "fallback", "message": "Analysis pending"})