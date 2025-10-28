"""
Evidence Validator Module
Validates claim evidence with multi-tier verification including:
- Link integrity and provenance checking
- Repository forensics for GitHub/GitLab projects
- Cross-section triangulation
- Artifact credibility scoring
"""

import re
import json
import requests
import hashlib
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from urllib.parse import urlparse
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Optional imports with graceful fallbacks
try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False

try:
    from git import Repo
    HAS_GIT = True
except ImportError:
    HAS_GIT = False

try:
    from pydriller import Repository as PyDrillerRepo
    HAS_PYDRILLER = True
except ImportError:
    HAS_PYDRILLER = False

# Handle both modular and flat imports
try:
    from config.prompts import EVIDENCE_VALIDATION_PROMPT, SCORING_CONFIG
except ImportError:
    from prompts import EVIDENCE_VALIDATION_PROMPT, SCORING_CONFIG

logger = logging.getLogger(__name__)

class EvidenceValidator:
    """
    Multi-tier evidence validation system with artifact verification
    and repository forensics capabilities
    """
    
    # Artifact credibility tiers
    ARTIFACT_TIERS = {
        'doi_arxiv': {
            'patterns': [r'doi\.org', r'arxiv\.org', r'dl\.acm\.org', r'ieee\.org'],
            'weight': 1.0,
            'category': 'academic'
        },
        'github_active': {
            'patterns': [r'github\.com', r'gitlab\.com', r'bitbucket\.org'],
            'weight': 0.9,
            'category': 'repository'
        },
        'corporate_blog': {
            'patterns': [r'medium\.com/@[\w]+company', r'engineering\.\w+\.com', r'tech\.\w+\.com'],
            'weight': 0.8,
            'category': 'corporate'
        },
        'portfolio': {
            'patterns': [r'portfolio', r'herokuapp\.com', r'netlify\.app', r'vercel\.app'],
            'weight': 0.7,
            'category': 'personal'
        },
        'personal_blog': {
            'patterns': [r'medium\.com/@[\w]+$', r'dev\.to', r'hashnode\.dev', r'blogger\.com'],
            'weight': 0.6,
            'category': 'personal'
        },
        'certificate': {
            'patterns': [r'coursera\.org', r'udacity\.com', r'credly\.com', r'linkedin\.com/learning'],
            'weight': 0.7,
            'category': 'certification'
        }
    }
    
    def __init__(self, 
                 gemini_client: Any,
                 enable_async: bool = True,
                 max_concurrent_checks: int = 5):
        """
        Initialize evidence validator
        
        Args:
            gemini_client: Configured Gemini API client
            enable_async: Use async for link checking
            max_concurrent_checks: Max concurrent HTTP requests
        """
        self.gemini_client = gemini_client
        self.enable_async = enable_async
        self.max_concurrent_checks = max_concurrent_checks
        self.session = None
        self.executor = ThreadPoolExecutor(max_workers=max_concurrent_checks)
        
    async def __aenter__(self):
        """Async context manager entry"""
        if self.enable_async:
            self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
            
    def validate_evidence(self, 
                         claims: List[Dict],
                         full_cv_text: str,
                         check_links: bool = True,
                         deep_repo_analysis: bool = True) -> Dict[str, Any]:
        """
        Validate evidence for all claims
        
        Args:
            claims: List of extracted claims
            full_cv_text: Complete CV text for cross-reference
            check_links: Perform HTTP status checks on URLs
            deep_repo_analysis: Perform repository forensics
            
        Returns:
            Validation results with scores and findings
        """
        validation_start = datetime.now()
        
        # Prepare claims for validation
        claims_json = json.dumps(claims, default=str)
        
        # Get LLM-based validation
        llm_validations = self._get_llm_validation(claims_json, full_cv_text)
        
        # Enhance with technical validations
        validations = []
        
        for i, claim in enumerate(claims):
            # Start with LLM validation if available
            base_validation = llm_validations[i] if i < len(llm_validations) else {}
            
            # Add link integrity checks
            if check_links and claim.get('links_artifacts'):
                link_results = self._validate_links(claim['links_artifacts'])
                base_validation['link_integrity'] = link_results
                
            # Add repository forensics
            if deep_repo_analysis:
                repo_links = [url for url in claim.get('links_artifacts', []) 
                            if any(host in url for host in ['github.com', 'gitlab.com'])]
                            
                if repo_links:
                    repo_analysis = self._analyze_repositories(repo_links, claim)
                    base_validation['repository_forensics'] = repo_analysis
                    
            # Cross-section triangulation
            triangulation = self._cross_validate_claim(claim, claims, full_cv_text)
            base_validation['triangulation'] = triangulation
            
            # Calculate final evidence score
            final_score = self._calculate_evidence_score(base_validation)
            base_validation['final_evidence_score'] = final_score
            base_validation['claim_id'] = claim['claim_id']
            
            # Determine verification status
            base_validation['verification_status'] = self._determine_status(final_score)
            
            validations.append(base_validation)
            
        # Calculate consistency score
        consistency_score = self._calculate_consistency_score(validations, claims)
        
        return {
            'validations': validations,
            'consistency_score': consistency_score,
            'validation_time': (datetime.now() - validation_start).total_seconds(),
            'summary': self._generate_validation_summary(validations)
        }
        
    def _get_llm_validation(self, claims_json: str, full_cv_text: str) -> List[Dict]:
        """
        Get validation from Gemini LLM
        """
        prompt = EVIDENCE_VALIDATION_PROMPT.format(
            claims_json=claims_json,
            full_cv_text=full_cv_text
        )
        
        try:
            response = self.gemini_client.generate_content(
                prompt,
                generation_config={
                    'temperature': 0.2,
                    'top_p': 0.95,
                    'max_output_tokens': 4096
                }
            )
            
            result = json.loads(response.text)
            return result.get('validations', [])
            
        except Exception as e:
            logger.error(f"LLM validation failed: {e}")
            # Return empty validations as fallback
            return [{}] * len(json.loads(claims_json))
            
    def _validate_links(self, urls: List[str]) -> Dict[str, Any]:
        """
        Check link integrity and gather metadata
        """
        results = {
            'total_links': len(urls),
            'valid_links': 0,
            'broken_links': 0,
            'link_details': []
        }
        
        for url in urls:
            try:
                # Parse URL
                parsed = urlparse(url)
                domain = parsed.netloc
                
                # Determine artifact tier
                tier = 'unknown'
                weight = 0.3
                
                for tier_name, tier_config in self.ARTIFACT_TIERS.items():
                    if any(re.search(pattern, url) for pattern in tier_config['patterns']):
                        tier = tier_name
                        weight = tier_config['weight']
                        break
                        
                # Check HTTP status (with timeout)
                try:
                    response = requests.head(url, timeout=5, allow_redirects=True)
                    status_code = response.status_code
                    is_valid = status_code < 400
                    
                    # Try to get last modified
                    last_modified = response.headers.get('Last-Modified', 'unknown')
                    
                except requests.RequestException:
                    status_code = 0
                    is_valid = False
                    last_modified = 'unknown'
                    
                if is_valid:
                    results['valid_links'] += 1
                else:
                    results['broken_links'] += 1
                    
                results['link_details'].append({
                    'url': url,
                    'domain': domain,
                    'tier': tier,
                    'weight': weight,
                    'status_code': status_code,
                    'is_valid': is_valid,
                    'last_modified': last_modified
                })
                
            except Exception as e:
                logger.warning(f"Link validation failed for {url}: {e}")
                results['broken_links'] += 1
                
        # Calculate weighted link score
        if results['link_details']:
            results['weighted_score'] = sum(
                link['weight'] for link in results['link_details'] if link['is_valid']
            ) / len(results['link_details'])
        else:
            results['weighted_score'] = 0.0
            
        return results
        
    def _analyze_repositories(self, repo_urls: List[str], claim: Dict) -> Dict[str, Any]:
        """
        Perform deep repository analysis
        """
        repo_analysis = {
            'repositories_analyzed': len(repo_urls),
            'findings': []
        }
        
        for url in repo_urls:
            try:
                # Extract owner and repo name
                parts = url.rstrip('/').split('/')
                if 'github.com' in url and len(parts) >= 2:
                    owner = parts[-2]
                    repo_name = parts[-1]
                    
                    # Get repo info via API
                    api_url = f"https://api.github.com/repos/{owner}/{repo_name}"
                    response = requests.get(api_url, timeout=10)
                    
                    if response.status_code == 200:
                        repo_data = response.json()
                        
                        # Get commit statistics
                        commits_url = f"{api_url}/commits"
                        commits_response = requests.get(commits_url, timeout=10)
                        commits = commits_response.json() if commits_response.status_code == 200 else []
                        
                        # Analyze repository characteristics
                        analysis = {
                            'url': url,
                            'stars': repo_data.get('stargazers_count', 0),
                            'forks': repo_data.get('forks_count', 0),
                            'created_at': repo_data.get('created_at', ''),
                            'last_updated': repo_data.get('updated_at', ''),
                            'language': repo_data.get('language', 'unknown'),
                            'has_readme': 'README' in str(repo_data.get('default_branch', '')),
                            'total_commits': len(commits),
                            'is_fork': repo_data.get('fork', False),
                            'open_issues': repo_data.get('open_issues_count', 0)
                        }
                        
                        # Check if dates align with claim
                        if claim.get('time_period', {}).get('start_date'):
                            claim_date = claim['time_period']['start_date']
                            repo_created = repo_data.get('created_at', '')[:10]
                            
                            if repo_created and claim_date < repo_created:
                                analysis['date_mismatch'] = f"Claim predates repo creation"
                                
                        # Calculate activity score
                        analysis['activity_score'] = self._calculate_repo_activity_score(analysis)
                        
                        # Check for meaningful contributions
                        if commits:
                            # Look for author in recent commits
                            analysis['author_commits'] = self._check_author_commits(commits, claim)
                            
                        repo_analysis['findings'].append(analysis)
                        
            except Exception as e:
                logger.warning(f"Repository analysis failed for {url}: {e}")
                repo_analysis['findings'].append({
                    'url': url,
                    'error': str(e),
                    'activity_score': 0.0
                })
                
        # Calculate overall repository credibility
        if repo_analysis['findings']:
            scores = [f.get('activity_score', 0) for f in repo_analysis['findings']]
            repo_analysis['avg_activity_score'] = sum(scores) / len(scores)
        else:
            repo_analysis['avg_activity_score'] = 0.0
            
        return repo_analysis
        
    def _calculate_repo_activity_score(self, repo_data: Dict) -> float:
        """
        Calculate repository activity/credibility score
        """
        score = 0.0
        
        # Stars and forks (max 0.3)
        if repo_data.get('stars', 0) > 0:
            score += min(0.15, repo_data['stars'] * 0.01)
        if repo_data.get('forks', 0) > 0:
            score += min(0.15, repo_data['forks'] * 0.02)
            
        # Has README (0.2)
        if repo_data.get('has_readme'):
            score += 0.2
            
        # Commit activity (max 0.3)
        commits = repo_data.get('total_commits', 0)
        if commits > 10:
            score += 0.3
        elif commits > 5:
            score += 0.2
        elif commits > 0:
            score += 0.1
            
        # Not a fork (0.1)
        if not repo_data.get('is_fork'):
            score += 0.1
            
        # Recent activity (0.1)
        if repo_data.get('last_updated'):
            last_update = datetime.fromisoformat(repo_data['last_updated'].replace('Z', '+00:00'))
            if (datetime.now(last_update.tzinfo) - last_update).days < 180:
                score += 0.1
                
        return min(1.0, score)
        
    def _check_author_commits(self, commits: List[Dict], claim: Dict) -> Dict:
        """
        Check for author's commits in repository
        """
        # This would need email/username from CV to properly match
        # For now, return basic commit analysis
        
        if not commits:
            return {'found': False, 'commit_count': 0}
            
        first_commit_date = commits[-1].get('commit', {}).get('author', {}).get('date', '')
        last_commit_date = commits[0].get('commit', {}).get('author', {}).get('date', '')
        
        return {
            'found': True,  # Would need author matching logic
            'commit_count': len(commits),
            'first_commit': first_commit_date[:10] if first_commit_date else '',
            'last_commit': last_commit_date[:10] if last_commit_date else '',
            'commit_density': len(commits) / max(30, (datetime.now() - datetime.fromisoformat(first_commit_date.replace('Z', '+00:00'))).days) if first_commit_date else 0
        }
        
    def _cross_validate_claim(self, 
                            claim: Dict, 
                            all_claims: List[Dict],
                            full_text: str) -> Dict[str, Any]:
        """
        Cross-validate claim across CV sections
        """
        validation = {
            'skill_used_in_project': False,
            'dates_consistent': True,
            'tech_timeline_valid': True,
            'cross_references': []
        }
        
        # For skill claims, check if used in projects/work
        if claim['category'] == 'skill':
            technologies = claim.get('technologies_mentioned', [])
            
            for tech in technologies:
                tech_lower = tech.lower()
                
                # Look for usage in other claims
                for other_claim in all_claims:
                    if other_claim['claim_id'] != claim['claim_id']:
                        if tech_lower in other_claim['claim_text'].lower():
                            validation['skill_used_in_project'] = True
                            validation['cross_references'].append({
                                'technology': tech,
                                'used_in': other_claim['category'],
                                'claim_id': other_claim['claim_id']
                            })
                            break
                            
        # Check date consistency
        if claim.get('time_period', {}).get('start_date'):
            claim_dates = claim['time_period']
            
            # Look for overlapping full-time positions
            if claim['category'] == 'work_experience':
                for other_claim in all_claims:
                    if (other_claim['claim_id'] != claim['claim_id'] and 
                        other_claim['category'] == 'work_experience' and
                        other_claim.get('time_period', {}).get('start_date')):
                        
                        other_dates = other_claim['time_period']
                        
                        # Check for overlap
                        if self._check_date_overlap(claim_dates, other_dates):
                            validation['dates_consistent'] = False
                            validation['date_conflict'] = {
                                'claim_id': other_claim['claim_id'],
                                'type': 'overlapping_positions'
                            }
                            
        # Validate technology timeline
        try:
            from modules.claim_extractor import ClaimExtractor
        except ImportError:
            from claim_extractor import ClaimExtractor
        
        for tech in claim.get('technologies_mentioned', []):
            tech_lower = tech.lower()
            
            if tech_lower in ClaimExtractor.TECH_RELEASE_DATES:
                release_date = ClaimExtractor.TECH_RELEASE_DATES[tech_lower]
                
                if claim.get('time_period', {}).get('start_date'):
                    if claim['time_period']['start_date'] < release_date:
                        validation['tech_timeline_valid'] = False
                        validation['tech_timeline_issues'] = validation.get('tech_timeline_issues', [])
                        validation['tech_timeline_issues'].append({
                            'technology': tech,
                            'claimed_use': claim['time_period']['start_date'],
                            'public_release': release_date
                        })
                        
        return validation
        
    def _check_date_overlap(self, dates1: Dict, dates2: Dict) -> bool:
        """
        Check if two date ranges overlap
        """
        try:
            start1 = datetime.fromisoformat(dates1.get('start_date', '2000-01'))
            end1 = datetime.fromisoformat(dates1.get('end_date', '2030-12'))
            start2 = datetime.fromisoformat(dates2.get('start_date', '2000-01'))
            end2 = datetime.fromisoformat(dates2.get('end_date', '2030-12'))
            
            return start1 <= end2 and start2 <= end1
            
        except:
            return False
            
    def _calculate_evidence_score(self, validation: Dict) -> float:
        """
        Calculate final evidence score combining all factors
        """
        score = 0.0
        weights = SCORING_CONFIG['evidence_tier_weights']
        
        # Base LLM score (0-0.4)
        if validation.get('evidence_score'):
            score += validation['evidence_score'] * 0.4
            
        # Link integrity (0-0.2)
        if validation.get('link_integrity'):
            score += validation['link_integrity'].get('weighted_score', 0) * 0.2
            
        # Repository forensics (0-0.2)
        if validation.get('repository_forensics'):
            score += validation['repository_forensics'].get('avg_activity_score', 0) * 0.2
            
        # Cross-validation (0-0.2)
        triangulation = validation.get('triangulation', {})
        
        triangulation_score = 0.0
        if triangulation.get('skill_used_in_project'):
            triangulation_score += 0.4
        if triangulation.get('dates_consistent'):
            triangulation_score += 0.3
        if triangulation.get('tech_timeline_valid'):
            triangulation_score += 0.3
            
        score += triangulation_score * 0.2
        
        return min(1.0, score)
        
    def _determine_status(self, score: float) -> str:
        """
        Determine verification status based on score
        """
        if score >= 0.8:
            return 'verified'
        elif score >= 0.4:
            return 'partial'
        elif score >= 0.2:
            return 'unverified'
        else:
            return 'red_flag'
            
    def _calculate_consistency_score(self, 
                                    validations: List[Dict],
                                    claims: List[Dict]) -> float:
        """
        Calculate overall consistency score across all validations
        """
        if not validations:
            return 0.0
            
        consistency_factors = []
        
        # Date consistency
        date_conflicts = sum(1 for v in validations 
                           if not v.get('triangulation', {}).get('dates_consistent', True))
        date_consistency = 1.0 - (date_conflicts / len(validations))
        consistency_factors.append(date_consistency)
        
        # Tech timeline validity
        tech_issues = sum(1 for v in validations
                        if not v.get('triangulation', {}).get('tech_timeline_valid', True))
        tech_consistency = 1.0 - (tech_issues / len(validations))
        consistency_factors.append(tech_consistency)
        
        # Skills usage consistency
        skill_claims = [c for c in claims if c['category'] == 'skill']
        if skill_claims:
            used_skills = sum(1 for v in validations
                            if v.get('triangulation', {}).get('skill_used_in_project'))
            skill_consistency = used_skills / len(skill_claims)
            consistency_factors.append(skill_consistency)
            
        # Link validity
        link_validations = [v for v in validations if v.get('link_integrity')]
        if link_validations:
            valid_links = sum(v['link_integrity']['valid_links'] 
                            for v in link_validations)
            total_links = sum(v['link_integrity']['total_links']
                            for v in link_validations)
            if total_links > 0:
                link_consistency = valid_links / total_links
                consistency_factors.append(link_consistency)
                
        return sum(consistency_factors) / len(consistency_factors) if consistency_factors else 0.0
        
    def _generate_validation_summary(self, validations: List[Dict]) -> Dict:
        """
        Generate summary of validation results
        """
        total = len(validations)
        
        if total == 0:
            return {
                'total_validated': 0,
                'verified': 0,
                'partial': 0,
                'unverified': 0,
                'red_flags': 0
            }
            
        status_counts = {
            'verified': sum(1 for v in validations if v.get('verification_status') == 'verified'),
            'partial': sum(1 for v in validations if v.get('verification_status') == 'partial'),
            'unverified': sum(1 for v in validations if v.get('verification_status') == 'unverified'),
            'red_flag': sum(1 for v in validations if v.get('verification_status') == 'red_flag')
        }
        
        return {
            'total_validated': total,
            'verified': status_counts['verified'],
            'verified_pct': (status_counts['verified'] / total) * 100,
            'partial': status_counts['partial'],
            'partial_pct': (status_counts['partial'] / total) * 100,
            'unverified': status_counts['unverified'],
            'unverified_pct': (status_counts['unverified'] / total) * 100,
            'red_flags': status_counts['red_flag'],
            'red_flag_pct': (status_counts['red_flag'] / total) * 100,
            'avg_evidence_score': sum(v.get('final_evidence_score', 0) for v in validations) / total
        }