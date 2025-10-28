"""Enhanced selection sheet generator with new features"""

import logging
import json
from datetime import datetime
from pathlib import Path
from jinja2 import Template
from typing import Dict, List, Optional
from analyzer import GeminiAnalyzer, normalize_skills
from templates import SheetTemplateManager, HTML_TEMPLATE

# Configure logging
logger = logging.getLogger(__name__)

# Configuration constants
REQUIRED_SKILL_WEIGHT = 0.7
NICE_TO_HAVE_WEIGHT = 0.3
SEMANTIC_MATCH_WEIGHT = 0.2
PERSISTENCE_ENABLED = True
AUDIT_TRAIL_ENABLED = True

class SelectionSheetGenerator:
    """Enhanced selection sheet generator with semantic matching and persistence"""
    
    def __init__(self):
        self.template_manager = SheetTemplateManager()
        self.analyzer = GeminiAnalyzer()
        self.generated_sheets = []
        self.audit_trail = []
    
    def generate_sheet(self, candidate, job, application):
        """Generate complete selection sheet with enhanced features"""
        try:
            print(f"\n🎯 Generating selection sheet for {candidate.name} - {job.title}")
            
            # Start audit trail
            audit_entry = {
                "timestamp": datetime.now().isoformat(),
                "candidate": candidate.name,
                "job": job.title,
                "model_version": "v2.0",
                "events": []
            }
            
            # Select template
            template = self.template_manager.select_template(job, candidate)
            print(f"  ✓ Template selected: {job.role_type}")
            audit_entry["events"].append("Template selected")
            
            # Analyze career with date awareness
            print("  🔍 Analyzing career trajectory...")
            trajectory_analysis = self.analyzer.analyze_career_trajectory(candidate)
            audit_entry["events"].append("Career analyzed")
            
            # Generate diverse interview questions
            print("  💭 Generating interview questions...")
            interview_questions = self.analyzer.generate_interview_questions(candidate, job)
            audit_entry["events"].append(f"Generated {len(interview_questions)} questions")
            
            # Identify red flags with evidence
            print("  🚩 Checking for red flags...")
            red_flags = self.analyzer.identify_red_flags(candidate)
            audit_entry["events"].append(f"Identified {len(red_flags)} red flags")
            
            # Enhanced skill matching with semantic similarity
            print("  🎯 Calculating skill match...")
            skill_match = self._calculate_enhanced_skill_match(candidate, job)
            audit_entry["events"].append(f"Skill match: {skill_match['overall_score']}%")
            
            # Rubric-based scoring
            print("  📊 Calculating rubric scores...")
            rubric_scores = self.analyzer.calculate_rubric_scores(candidate, job, template)
            audit_entry["events"].append(f"Rubric confidence: {rubric_scores['confidence']}")
            
            # Generate enhanced summary
            print("  📝 Generating summary...")
            summary = self._generate_enhanced_summary(
                candidate, job, trajectory_analysis, skill_match, 
                red_flags, rubric_scores
            )
            
            # Compile comprehensive sheet
            sheet = {
                "metadata": {
                    "generated_at": datetime.now().isoformat(),
                    "candidate_id": candidate.candidate_id,
                    "job_id": job.job_id,
                    "application_id": application.application_id,
                    "template_type": job.role_type,
                    "model_version": "v2.0",
                    "generator_version": "2.0"
                },
                "candidate_info": {
                    "name": candidate.name,
                    "email": candidate.email,
                    "contact": candidate.contact,
                    "current_role": candidate.current_role,
                    "experience_years": candidate.experience_years,
                    "skills": candidate.skills if candidate.skills else [],
                    "normalized_skills": list(normalize_skills(candidate.skills)) if candidate.skills else [],
                    "education": candidate.education if candidate.education else [],
                    "linkedin_url": candidate.linkedin_url,
                    "github_url": candidate.github_url,
                    "portfolio_url": candidate.portfolio_url
                },
                "job_info": {
                    "title": job.title,
                    "role_type": job.role_type,
                    "seniority": job.seniority,
                    "required_skills": job.required_skills if job.required_skills else [],
                    "nice_to_have_skills": job.nice_to_have_skills if job.nice_to_have_skills else [],
                    "normalized_required": list(normalize_skills(job.required_skills)) if job.required_skills else []
                },
                "analysis": {
                    "executive_summary": summary,
                    "skill_match_score": skill_match["overall_score"],
                    "skill_breakdown": skill_match["breakdown"],
                    "semantic_match": skill_match.get("semantic_match", {}),
                    "career_trajectory": trajectory_analysis,
                    "red_flags": red_flags,
                    "rubric_scores": rubric_scores
                },
                "interview_guide": {
                    "recommended_questions": interview_questions,
                    "evaluation_criteria": template["evaluation_criteria"],
                    "question_categories": self._categorize_questions(interview_questions)
                },
                "audit_trail": audit_entry if AUDIT_TRAIL_ENABLED else None
            }
            
            self.generated_sheets.append(sheet)
            if AUDIT_TRAIL_ENABLED:
                self.audit_trail.append(audit_entry)
                
            print(f"  ✅ Sheet generated successfully!")
            
            # Persist to JSON if enabled
            if PERSISTENCE_ENABLED:
                self._persist_sheet(sheet, candidate.name, job.job_id)
            
            return sheet
            
        except Exception as e:
            logger.error(f"Failed to generate sheet for {candidate.name}: {e}")
            raise
    
    def _calculate_enhanced_skill_match(self, candidate, job) -> Dict:
        """Calculate enhanced skill match with semantic similarity"""
        # Normalize skills for better matching
        candidate_skills = normalize_skills(candidate.skills)
        required_skills = normalize_skills(job.required_skills)
        nice_to_have = normalize_skills(job.nice_to_have_skills)
        
        # Calculate exact matches
        required_matches = len(candidate_skills & required_skills)
        nice_matches = len(candidate_skills & nice_to_have)
        
        # Calculate scores
        if len(required_skills) > 0:
            required_score = (required_matches / len(required_skills)) * 100
        else:
            required_score = 100.0 if len(candidate_skills) > 0 else 0.0
        
        if len(nice_to_have) > 0:
            nice_score = (nice_matches / len(nice_to_have)) * 100
        else:
            nice_score = 0.0
        
        # Semantic similarity (simplified - in production use embeddings)
        semantic_score = self._calculate_semantic_similarity(
            candidate_skills, required_skills | nice_to_have
        )
        
        # Calculate weighted overall score
        overall_score = (
            required_score * REQUIRED_SKILL_WEIGHT + 
            nice_score * NICE_TO_HAVE_WEIGHT +
            semantic_score * SEMANTIC_MATCH_WEIGHT
        )
        
        # Generate match explanations
        match_explanations = self._generate_match_explanations(
            candidate_skills, required_skills, nice_to_have
        )
        
        return {
            "overall_score": round(overall_score, 1),
            "breakdown": {
                "required_skills": {
                    "matched": required_matches,
                    "total": len(required_skills),
                    "percentage": round(required_score, 1),
                    "matched_skills": list(candidate_skills & required_skills)
                },
                "nice_to_have": {
                    "matched": nice_matches,
                    "total": len(nice_to_have),
                    "percentage": round(nice_score, 1),
                    "matched_skills": list(candidate_skills & nice_to_have)
                }
            },
            "semantic_match": {
                "score": round(semantic_score, 1),
                "related_skills": self._find_related_skills(candidate_skills, required_skills)
            },
            "match_explanations": match_explanations
        }
    
    def _calculate_semantic_similarity(self, candidate_skills: set, job_skills: set) -> float:
        """Calculate semantic similarity between skill sets"""
        # Simplified semantic matching - in production, use embeddings
        semantic_matches = 0
        
        # Check for related skills
        skill_families = {
            "frontend": {"react", "vue", "angular", "javascript", "typescript", "css", "html"},
            "backend": {"python", "java", "nodejs", "ruby", "go", "php"},
            "database": {"postgresql", "mysql", "mongodb", "redis", "elasticsearch"},
            "cloud": {"aws", "google cloud", "azure", "kubernetes", "docker"},
            "data": {"pandas", "numpy", "tensorflow", "pytorch", "scikit-learn"}
        }
        
        for family, family_skills in skill_families.items():
            candidate_in_family = candidate_skills & family_skills
            job_in_family = job_skills & family_skills
            if candidate_in_family and job_in_family and not (candidate_in_family & job_in_family):
                semantic_matches += 0.5  # Partial credit for same family
        
        max_possible = len(job_skills) if job_skills else 1
        return min(100, (semantic_matches / max_possible) * 100)
    
    def _find_related_skills(self, candidate_skills: set, required_skills: set) -> List[str]:
        """Find semantically related skills"""
        related = []
        
        # Simple relatedness check
        skill_relations = {
            "kubernetes": ["docker", "containerization"],
            "react": ["javascript", "frontend"],
            "aws": ["cloud", "infrastructure"],
            "python": ["django", "flask", "fastapi"]
        }
        
        for req_skill in required_skills:
            if req_skill in skill_relations:
                for related_skill in skill_relations[req_skill]:
                    if related_skill in candidate_skills:
                        related.append(f"{related_skill} (related to {req_skill})")
                        
        return related[:5]  # Limit to 5
    
    def _generate_match_explanations(self, candidate_skills: set, 
                                    required_skills: set, nice_to_have: set) -> List[str]:
        """Generate explanations for skill matches"""
        explanations = []
        
        # Perfect matches
        perfect_matches = candidate_skills & required_skills
        if perfect_matches:
            explanations.append(f"Perfect match on: {', '.join(list(perfect_matches)[:3])}")
        
        # Missing critical skills
        missing_required = required_skills - candidate_skills
        if missing_required and len(missing_required) <= 2:
            explanations.append(f"Missing: {', '.join(missing_required)}")
        
        # Bonus skills
        bonus_matches = candidate_skills & nice_to_have
        if bonus_matches:
            explanations.append(f"Bonus skills: {', '.join(list(bonus_matches)[:3])}")
            
        return explanations
    
    def _generate_enhanced_summary(self, candidate, job, trajectory, 
                                  skill_match, red_flags, rubric_scores) -> str:
        """Generate enhanced executive summary with confidence and insights"""
        skill_score = skill_match.get('overall_score', 0)
        semantic_score = skill_match.get('semantic_match', {}).get('score', 0)
        confidence = rubric_scores.get('confidence', 0)
        concerns = len(red_flags) if red_flags else 0
        
        summary_parts = []
        
        # Basic info with confidence
        summary_parts.append(
            f"{candidate.name} is a {candidate.current_role} with "
            f"{candidate.experience_years} years of experience."
        )
        
        # Enhanced skill assessment
        if skill_score >= 80:
            summary_parts.append(f"Excellent skill match ({skill_score}%) for {job.title}.")
        elif skill_score >= 60:
            summary_parts.append(f"Good skill match ({skill_score}%) for {job.title}.")
        else:
            summary_parts.append(f"Moderate skill match ({skill_score}%) for {job.title}.")
        
        # Add semantic match insight
        if semantic_score > 20:
            summary_parts.append(f"Shows related expertise (semantic match: {semantic_score}%).")
        
        # Career trajectory insight
        progression = trajectory.get('progression_summary', '')
        if progression:
            summary_parts.append(progression)
        
        # Growth rate
        growth_rate = trajectory.get('growth_rate', '')
        if growth_rate == 'fast':
            summary_parts.append("Demonstrates rapid career growth.")
        elif growth_rate == 'slow':
            summary_parts.append("Shows steady, consistent progression.")
        
        # Confidence level
        if confidence >= 0.7:
            summary_parts.append(f"High confidence assessment (confidence: {confidence:.0%}).")
        elif confidence >= 0.5:
            summary_parts.append(f"Moderate confidence assessment (confidence: {confidence:.0%}).")
        else:
            summary_parts.append("Limited data available for full assessment.")
        
        # Concerns
        if concerns > 0:
            summary_parts.append(f"{concerns} area(s) require clarification.")
        
        # Enhanced recommendation
        if skill_score >= 80 and concerns == 0 and confidence >= 0.7:
            summary_parts.append("Strong candidate - recommend fast-track to technical interview.")
        elif skill_score >= 60 and confidence >= 0.5:
            summary_parts.append("Promising candidate - recommend standard interview process.")
        elif semantic_score > 50:
            summary_parts.append("Consider for interview - shows relevant adjacent skills.")
        else:
            summary_parts.append("Consider for alternative roles or gather more information.")
        
        return " ".join(summary_parts)
    
    def _categorize_questions(self, questions: List[Dict]) -> Dict[str, List[Dict]]:
        """Categorize questions by type"""
        categories = {}
        for q in questions:
            category = q.get('category', 'general')
            if category not in categories:
                categories[category] = []
            categories[category].append(q)
        return categories
    
    def _persist_sheet(self, sheet: Dict, candidate_name: str, job_id: int):
        """Persist sheet to JSON for audit trail"""
        try:
            output_dir = Path("selection_sheets")
            output_dir.mkdir(exist_ok=True)
            
            safe_name = candidate_name.replace(' ', '_').replace('/', '_')
            json_filename = output_dir / f"sheet_{safe_name}_{job_id}.json"
            
            with open(json_filename, 'w', encoding='utf-8') as f:
                json.dump(sheet, f, indent=2, ensure_ascii=False)
                
            logger.info(f"Persisted sheet to {json_filename}")
            
        except Exception as e:
            logger.error(f"Failed to persist sheet: {e}")
    
    def export_to_html(self, sheet):
        """Export sheet to HTML with enhanced features and accessibility"""
        template = Template(HTML_TEMPLATE)
        
        # Safely extract data with defaults
        candidate_info = sheet.get("candidate_info", {})
        job_info = sheet.get("job_info", {})
        analysis = sheet.get("analysis", {})
        interview_guide = sheet.get("interview_guide", {})
        metadata = sheet.get("metadata", {})
        
        career_trajectory = analysis.get("career_trajectory", {})
        skill_breakdown = analysis.get("skill_breakdown", {})
        semantic_match = analysis.get("semantic_match", {})
        rubric_scores = analysis.get("rubric_scores", {})
        
        # Format URLs for auto-linking
        linkedin_url = candidate_info.get("linkedin_url", "")
        github_url = candidate_info.get("github_url", "")
        portfolio_url = candidate_info.get("portfolio_url", "")
        
        return template.render(
            name=candidate_info.get("name", "Unknown"),
            title=job_info.get("title", "Position"),
            role_type=job_info.get("role_type", "Unknown"),
            score=analysis.get("skill_match_score", 0),
            summary=analysis.get("executive_summary", "No summary available"),
            current_role=candidate_info.get("current_role", "Not specified"),
            experience=candidate_info.get("experience_years", 0),
            email=candidate_info.get("email", "Not provided"),
            contact=candidate_info.get("contact", "Not provided"),
            linkedin_url=linkedin_url,
            github_url=github_url,
            portfolio_url=portfolio_url,
            skills=candidate_info.get("skills", [])[:10],
            matched_required=skill_breakdown.get("required_skills", {}).get("matched_skills", []),
            matched_nice=skill_breakdown.get("nice_to_have", {}).get("matched_skills", []),
            semantic_score=semantic_match.get("score", 0),
            related_skills=semantic_match.get("related_skills", []),
            match_explanations=analysis.get("match_explanations", []),
            progression=career_trajectory.get("progression_summary", ""),
            growth_rate=career_trajectory.get("growth_rate", "Unknown"),
            tenure_data=career_trajectory.get("tenure_per_role", []),
            strengths=career_trajectory.get("strengths", [])[:5],
            red_flags=analysis.get("red_flags", []),
            questions=interview_guide.get("recommended_questions", [])[:5],
            question_categories=interview_guide.get("question_categories", {}),
            rubric_scores=rubric_scores.get("criterion_scores", []),
            confidence=rubric_scores.get("confidence", 0),
            generated_at=metadata.get("generated_at", datetime.now().isoformat()),
            model_version=metadata.get("model_version", "Unknown")
        )