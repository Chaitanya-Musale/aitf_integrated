"""
Claim Extractor Module
Extracts and categorizes factual claims from CV sections using Gemini Flash 2.5
Implements seniority-aware extraction and buzzword detection
"""

import json
import re
import hashlib
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import logging

# Handle both modular and flat imports
try:
    from config.prompts import CLAIM_EXTRACTION_PROMPT, SCORING_CONFIG
except ImportError:
    from prompts import CLAIM_EXTRACTION_PROMPT, SCORING_CONFIG

logger = logging.getLogger(__name__)

@dataclass
class Claim:
    """Data class for structured claim representation"""
    claim_id: str
    claim_text: str
    category: str
    subcategory: str
    quantifiable_metrics: List[str]
    technologies_mentioned: List[str]
    time_period: Dict[str, Any]
    seniority_claim: str
    verifiability_level: str
    evidence_present: str
    links_artifacts: List[str]
    needs_clarification: List[str]
    section_source: str
    confidence_score: float
    extraction_timestamp: str

class ClaimExtractor:
    """
    Extracts structured claims from CV text using LLM
    Implements multi-stage extraction with calibrated confidence scoring
    """
    
    # Technology timeline for validation
    TECH_RELEASE_DATES = {
        'react': '2013-05',
        'vue': '2014-02', 
        'angular': '2010-10',
        'tensorflow': '2015-11',
        'pytorch': '2016-09',
        'kubernetes': '2014-06',
        'docker': '2013-03',
        'swift': '2014-06',
        'rust': '2010-07',
        'go': '2009-11',
        'typescript': '2012-10',
        'graphql': '2015-07',
        'next.js': '2016-10',
        'flutter': '2017-05',
        'deno': '2018-05',
        'svelte': '2016-11'
    }
    
    # Seniority keywords for classification
    SENIORITY_MARKERS = {
        'senior': ['senior', 'sr.', 'principal', 'staff', 'distinguished'],
        'lead': ['lead', 'architect', 'head', 'director', 'manager'],
        'mid': ['engineer', 'developer', 'analyst', 'specialist'],
        'junior': ['junior', 'jr.', 'associate', 'entry', 'graduate'],
        'intern': ['intern', 'trainee', 'apprentice', 'co-op']
    }
    
    def __init__(self, gemini_client: Any, enable_caching: bool = True):
        """
        Initialize claim extractor
        
        Args:
            gemini_client: Configured Gemini API client
            enable_caching: Cache extracted claims for efficiency
        """
        self.gemini_client = gemini_client
        self.enable_caching = enable_caching
        self.claim_cache = {} if enable_caching else None
        
    def extract_claims(self, 
                       parsed_cv: Dict[str, Any],
                       seniority_level: Optional[str] = None) -> Dict[str, Any]:
        """
        Extract all claims from parsed CV
        
        Args:
            parsed_cv: Parsed CV data from CVParser
            seniority_level: Override detected seniority level
            
        Returns:
            Structured claims with metadata and scoring
        """
        all_claims = []
        extraction_metadata = {
            'start_time': datetime.now().isoformat(),
            'sections_processed': [],
            'total_tokens_used': 0,
            'cache_hits': 0
        }
        
        # Auto-detect seniority if not provided
        if not seniority_level:
            seniority_level = self._detect_seniority_level(parsed_cv['raw_text'])
            
        # Process each section
        sections_to_process = ['work_experience', 'projects', 'skills', 'research']
        
        for section_name in sections_to_process:
            if section_name in parsed_cv['sections']:
                section_text = parsed_cv['sections'][section_name]
                
                if not section_text.strip():
                    continue
                    
                # Check cache
                cache_key = self._generate_cache_key(section_text, seniority_level)
                
                if self.enable_caching and cache_key in self.claim_cache:
                    section_claims = self.claim_cache[cache_key]
                    extraction_metadata['cache_hits'] += 1
                else:
                    # Extract claims using Gemini
                    section_claims = self._extract_section_claims(
                        section_text, 
                        section_name,
                        seniority_level
                    )
                    
                    if self.enable_caching:
                        self.claim_cache[cache_key] = section_claims
                        
                # Add section source to each claim
                for claim in section_claims:
                    claim['section_source'] = section_name
                    claim['extraction_timestamp'] = datetime.now().isoformat()
                    
                all_claims.extend(section_claims)
                extraction_metadata['sections_processed'].append(section_name)
                
        # Post-process claims
        all_claims = self._post_process_claims(all_claims, parsed_cv)
        
        # Calculate aggregate metrics
        metrics = self._calculate_claim_metrics(all_claims)
        
        extraction_metadata['end_time'] = datetime.now().isoformat()
        
        return {
            'claims': all_claims,
            'seniority_level': seniority_level,
            'metrics': metrics,
            'extraction_metadata': extraction_metadata
        }
        
    def _detect_seniority_level(self, text: str) -> str:
        """
        Auto-detect seniority level from CV text
        """
        text_lower = text.lower()
        
        # Check for seniority markers in order of precedence
        for level, markers in self.SENIORITY_MARKERS.items():
            for marker in markers:
                if marker in text_lower:
                    # Additional validation for context
                    pattern = rf'\b{marker}\s+\w+\s+(engineer|developer|analyst|scientist|designer)'
                    if re.search(pattern, text_lower):
                        return level
                        
        # Check years of experience
        exp_pattern = r'(\d+)\+?\s*years?\s*(of)?\s*experience'
        exp_matches = re.findall(exp_pattern, text_lower)
        
        if exp_matches:
            years = max(int(match[0]) for match in exp_matches)
            if years >= 8:
                return 'senior'
            elif years >= 3:
                return 'mid'
            elif years >= 1:
                return 'junior'
                
        return 'mid'  # Default to mid-level
        
    def _extract_section_claims(self,
                               section_text: str,
                               section_type: str,
                               seniority_level: str) -> List[Dict]:
        """
        Extract claims from a specific CV section using Gemini
        """
        # Prepare prompt
        prompt = CLAIM_EXTRACTION_PROMPT.format(
            section_type=section_type,
            section_text=section_text,
            seniority_level=seniority_level
        )
        
        try:
            # Call Gemini API with low temperature for precision
            response = self.gemini_client.generate_content(
                prompt,
                generation_config={
                    'temperature': 0.1,
                    'top_p': 0.95,
                    'max_output_tokens': 4096
                }
            )
            
            # Parse JSON response
            result = json.loads(response.text)
            claims_data = result.get('claims', [])
            
            # Convert to Claim objects and validate
            claims = []
            for claim_dict in claims_data:
                # Add unique ID if not present
                if 'claim_id' not in claim_dict:
                    claim_dict['claim_id'] = self._generate_claim_id(claim_dict['claim_text'])
                    
                # Add confidence score based on evidence and specificity
                claim_dict['confidence_score'] = self._calculate_confidence_score(claim_dict)
                
                # Validate and clean claim
                if self._validate_claim(claim_dict):
                    claims.append(claim_dict)
                    
            return claims
            
        except Exception as e:
            logger.error(f"Gemini extraction failed for {section_type}: {e}")
            # Fallback to rule-based extraction
            return self._fallback_extraction(section_text, section_type)
            
    def _fallback_extraction(self, text: str, section_type: str) -> List[Dict]:
        """
        Rule-based fallback extraction if LLM fails
        """
        claims = []
        
        # Extract claims based on section type
        if section_type == 'work_experience':
            claims.extend(self._extract_work_claims(text))
        elif section_type == 'projects':
            claims.extend(self._extract_project_claims(text))
        elif section_type == 'skills':
            claims.extend(self._extract_skill_claims(text))
        elif section_type == 'research':
            claims.extend(self._extract_research_claims(text))
            
        return claims
        
    def _extract_work_claims(self, text: str) -> List[Dict]:
        """
        Extract work experience claims using patterns
        """
        claims = []
        
        # Job title pattern
        title_pattern = r'^([A-Z][A-Za-z\s]+)\s*(?:at|@|-)\s*([A-Z][A-Za-z\s&]+)'
        
        # Achievement pattern
        achievement_pattern = r'(?:•|\-|\*)\s*(.+?)(?:\n|$)'
        
        # Metric pattern
        metric_pattern = r'(\d+%?)\s*(increase|decrease|improvement|reduction|growth)'
        
        lines = text.split('\n')
        current_role = None
        
        for line in lines:
            # Check for job title
            title_match = re.match(title_pattern, line)
            if title_match:
                current_role = {
                    'title': title_match.group(1).strip(),
                    'company': title_match.group(2).strip()
                }
                
            # Extract achievements
            achievement_match = re.match(achievement_pattern, line)
            if achievement_match and current_role:
                achievement_text = achievement_match.group(1)
                
                # Look for metrics
                metrics = re.findall(metric_pattern, achievement_text)
                
                claim = {
                    'claim_id': self._generate_claim_id(achievement_text),
                    'claim_text': achievement_text,
                    'category': 'work_experience',
                    'subcategory': 'achievement',
                    'quantifiable_metrics': [f"{m[0]} {m[1]}" for m in metrics],
                    'technologies_mentioned': self._extract_technologies(achievement_text),
                    'time_period': {},
                    'seniority_claim': 'none',
                    'verifiability_level': 'medium' if metrics else 'low',
                    'evidence_present': 'contextual',
                    'links_artifacts': self._extract_urls(achievement_text),
                    'needs_clarification': [],
                    'confidence_score': 0.5
                }
                
                claims.append(claim)
                
        return claims
        
    def _extract_project_claims(self, text: str) -> List[Dict]:
        """
        Extract project claims
        """
        claims = []
        
        # Project patterns
        project_pattern = r'(?:Project|Built|Developed|Created|Designed)\s*:?\s*(.+?)(?:\n|$)'
        
        for match in re.finditer(project_pattern, text, re.IGNORECASE):
            project_text = match.group(1)
            
            claim = {
                'claim_id': self._generate_claim_id(project_text),
                'claim_text': project_text,
                'category': 'project',
                'subcategory': 'development',
                'quantifiable_metrics': self._extract_metrics(project_text),
                'technologies_mentioned': self._extract_technologies(project_text),
                'time_period': {},
                'seniority_claim': 'none',
                'verifiability_level': 'medium',
                'evidence_present': 'contextual',
                'links_artifacts': self._extract_urls(project_text),
                'needs_clarification': [],
                'confidence_score': 0.6
            }
            
            claims.append(claim)
            
        return claims
        
    def _extract_skill_claims(self, text: str) -> List[Dict]:
        """
        Extract skill claims (excluding education)
        """
        claims = []
        
        # Common skill patterns
        skill_patterns = [
            r'(?:Languages?|Programming)\s*:?\s*(.+?)(?:\n|$)',
            r'(?:Frameworks?|Libraries?)\s*:?\s*(.+?)(?:\n|$)',
            r'(?:Tools?|Platforms?)\s*:?\s*(.+?)(?:\n|$)',
            r'(?:Databases?|Data)\s*:?\s*(.+?)(?:\n|$)'
        ]
        
        for pattern in skill_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                skills_text = match.group(1)
                
                # Split by common delimiters
                individual_skills = re.split(r'[,;|•\-\*]', skills_text)
                
                for skill in individual_skills:
                    skill = skill.strip()
                    if skill and len(skill) > 1:
                        
                        # Check for proficiency level
                        proficiency = 'not_specified'
                        if any(word in skill.lower() for word in ['expert', 'advanced', 'proficient']):
                            proficiency = 'expert'
                        elif any(word in skill.lower() for word in ['intermediate', 'working']):
                            proficiency = 'intermediate'
                        elif any(word in skill.lower() for word in ['basic', 'beginner', 'familiar']):
                            proficiency = 'basic'
                            
                        claim = {
                            'claim_id': self._generate_claim_id(skill),
                            'claim_text': skill,
                            'category': 'skill',
                            'subcategory': 'technical',
                            'quantifiable_metrics': [],
                            'technologies_mentioned': [skill.split('(')[0].strip()],
                            'time_period': {},
                            'seniority_claim': 'none',
                            'verifiability_level': 'low',
                            'evidence_present': 'none',
                            'links_artifacts': [],
                            'needs_clarification': ['usage_context', 'project_examples'],
                            'confidence_score': 0.4,
                            'proficiency_level': proficiency
                        }
                        
                        claims.append(claim)
                        
        return claims
        
    def _extract_research_claims(self, text: str) -> List[Dict]:
        """
        Extract research and publication claims
        """
        claims = []
        
        # Publication patterns
        pub_patterns = [
            r'(?:Published?|Paper|Article)\s*:?\s*"?(.+?)"?\s*(?:in|at)\s*(.+?)(?:\n|$)',
            r'"(.+?)"\s*(?:,|\.)\s*(.+?)\s*(?:Conference|Journal|Symposium)',
            r'(?:Presented?|Talk)\s*:?\s*(.+?)\s*(?:at|in)\s*(.+?)(?:\n|$)'
        ]
        
        for pattern in pub_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                title = match.group(1) if match.group(1) else ''
                venue = match.group(2) if len(match.groups()) > 1 else ''
                
                claim = {
                    'claim_id': self._generate_claim_id(title),
                    'claim_text': f"{title} - {venue}".strip(' -'),
                    'category': 'research',
                    'subcategory': 'publication',
                    'quantifiable_metrics': self._extract_metrics(text),
                    'technologies_mentioned': self._extract_technologies(title),
                    'time_period': {},
                    'seniority_claim': 'none',
                    'verifiability_level': 'high',
                    'evidence_present': 'none',
                    'links_artifacts': self._extract_urls(text),
                    'needs_clarification': ['venue_reputation', 'citation_count', 'peer_review_status'],
                    'confidence_score': 0.7
                }
                
                claims.append(claim)
                
        return claims
        
    def _post_process_claims(self, 
                            claims: List[Dict], 
                            parsed_cv: Dict) -> List[Dict]:
        """
        Post-process claims for consistency and enhancement
        """
        # Remove duplicates
        unique_claims = []
        seen_ids = set()
        
        for claim in claims:
            if claim['claim_id'] not in seen_ids:
                unique_claims.append(claim)
                seen_ids.add(claim['claim_id'])
                
        # Enhance with cross-references
        for claim in unique_claims:
            # Check if technologies appear in other sections
            if claim['technologies_mentioned']:
                tech_usage_count = 0
                for other_claim in unique_claims:
                    if other_claim['claim_id'] != claim['claim_id']:
                        for tech in claim['technologies_mentioned']:
                            if tech.lower() in other_claim['claim_text'].lower():
                                tech_usage_count += 1
                                
                claim['cross_reference_count'] = tech_usage_count
                
            # Validate technology timeline
            for tech in claim.get('technologies_mentioned', []):
                tech_lower = tech.lower()
                if tech_lower in self.TECH_RELEASE_DATES:
                    release_date = self.TECH_RELEASE_DATES[tech_lower]
                    if 'time_period' in claim and claim['time_period'].get('start_date'):
                        claim_date = claim['time_period']['start_date']
                        if claim_date < release_date:
                            claim['needs_clarification'].append(
                                f"{tech} used before public release ({release_date})"
                            )
                            
        return unique_claims
        
    def _calculate_confidence_score(self, claim: Dict) -> float:
        """
        Calculate confidence score for a claim
        """
        score = 0.5  # Base score
        
        # Evidence present
        if claim.get('evidence_present') == 'direct':
            score += 0.3
        elif claim.get('evidence_present') == 'contextual':
            score += 0.15
            
        # Verifiability level
        if claim.get('verifiability_level') == 'high':
            score += 0.2
        elif claim.get('verifiability_level') == 'medium':
            score += 0.1
            
        # Has metrics
        if claim.get('quantifiable_metrics'):
            score += 0.15
            
        # Has artifacts/links
        if claim.get('links_artifacts'):
            score += 0.2
            
        # Needs clarification (negative)
        if claim.get('needs_clarification'):
            score -= 0.1 * len(claim['needs_clarification'])
            
        return max(0.1, min(1.0, score))
        
    def _calculate_claim_metrics(self, claims: List[Dict]) -> Dict:
        """
        Calculate aggregate metrics for all claims
        """
        if not claims:
            return {
                'total_claims': 0,
                'avg_confidence': 0,
                'buzzword_density': 0,
                'specificity_score': 0
            }
            
        # Category distribution
        category_counts = {}
        for claim in claims:
            cat = claim.get('category', 'unknown')
            category_counts[cat] = category_counts.get(cat, 0) + 1
            
        # Evidence distribution
        evidence_counts = {}
        for claim in claims:
            ev = claim.get('evidence_present', 'none')
            evidence_counts[ev] = evidence_counts.get(ev, 0) + 1
            
        # Calculate buzzword density
        buzzwords = ['innovative', 'cutting-edge', 'revolutionary', 'transformative',
                    'disruptive', 'passionate', 'driven', 'thought-leader']
        
        total_words = sum(len(claim['claim_text'].split()) for claim in claims)
        buzzword_count = 0
        
        for claim in claims:
            text_lower = claim['claim_text'].lower()
            for buzzword in buzzwords:
                buzzword_count += text_lower.count(buzzword)
                
        # Calculate specificity (has metrics, technologies, or links)
        specific_claims = sum(
            1 for claim in claims
            if claim.get('quantifiable_metrics') or 
               claim.get('technologies_mentioned') or
               claim.get('links_artifacts')
        )
        
        return {
            'total_claims': len(claims),
            'category_distribution': category_counts,
            'evidence_distribution': evidence_counts,
            'avg_confidence': sum(claim.get('confidence_score', 0) for claim in claims) / len(claims),
            'claims_with_metrics': sum(1 for claim in claims if claim.get('quantifiable_metrics')),
            'claims_with_artifacts': sum(1 for claim in claims if claim.get('links_artifacts')),
            'buzzword_density': buzzword_count / total_words if total_words > 0 else 0,
            'specificity_score': specific_claims / len(claims) if claims else 0,
            'high_confidence_claims': sum(1 for claim in claims if claim.get('confidence_score', 0) > 0.7),
            'low_confidence_claims': sum(1 for claim in claims if claim.get('confidence_score', 0) < 0.4)
        }
        
    def _generate_claim_id(self, text: str) -> str:
        """
        Generate unique ID for a claim
        """
        return hashlib.md5(text.encode()).hexdigest()[:12]
        
    def _generate_cache_key(self, text: str, seniority: str) -> str:
        """
        Generate cache key for section
        """
        return hashlib.md5(f"{text}:{seniority}".encode()).hexdigest()
        
    def _validate_claim(self, claim: Dict) -> bool:
        """
        Validate claim structure and content
        """
        required_fields = ['claim_text', 'category']
        
        for field in required_fields:
            if field not in claim or not claim[field]:
                return False
                
        # Check claim text length
        if len(claim['claim_text']) < 5 or len(claim['claim_text']) > 1000:
            return False
            
        return True
        
    def _extract_technologies(self, text: str) -> List[str]:
        """
        Extract technology names from text
        """
        # Common technology patterns
        tech_keywords = [
            'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'ruby', 'go',
            'react', 'angular', 'vue', 'django', 'flask', 'spring', 'node.js',
            'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins',
            'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy',
            'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
            'git', 'agile', 'scrum', 'ci/cd', 'devops'
        ]
        
        text_lower = text.lower()
        found_tech = []
        
        for tech in tech_keywords:
            if tech in text_lower:
                found_tech.append(tech)
                
        return found_tech
        
    def _extract_metrics(self, text: str) -> List[str]:
        """
        Extract quantifiable metrics from text
        """
        patterns = [
            r'\d+%',
            r'\$[\d,]+[MKB]?',
            r'\d+x',
            r'\d+\+',
            r'\d+(?:\.\d+)?[MKB]?\s*(?:users?|customers?|clients?)',
            r'\d+(?:\.\d+)?[MKB]?\s*(?:revenue|sales|growth)',
            r'\d+(?:\.\d+)?%?\s*(?:increase|decrease|improvement|reduction)'
        ]
        
        metrics = []
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            metrics.extend(matches)
            
        return list(set(metrics))
        
    def _extract_urls(self, text: str) -> List[str]:
        """
        Extract URLs from text
        """
        url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
        urls = re.findall(url_pattern, text)
        return urls