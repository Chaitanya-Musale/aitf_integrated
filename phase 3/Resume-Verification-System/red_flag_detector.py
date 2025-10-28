"""
Red Flag Detector Module
Comprehensive red flag detection including:
- Role-achievement mismatches
- Timeline inconsistencies  
- Metric implausibility
- Buzzword density analysis
- Sole credit detection
- SOTA guardrails
"""

import re
import json
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from collections import Counter
import logging
import statistics

# Handle both modular and flat imports
try:
    from config.prompts import RED_FLAG_DETECTION_PROMPT, SCORING_CONFIG, INTERVIEW_TEMPLATES
except ImportError:
    from prompts import RED_FLAG_DETECTION_PROMPT, SCORING_CONFIG, INTERVIEW_TEMPLATES

logger = logging.getLogger(__name__)

class RedFlagDetector:
    """
    Advanced red flag detection with seniority-aware thresholds
    and automated interview question generation
    """
    
    # Role-achievement mismatch patterns
    LEADERSHIP_CLAIMS = [
        'led', 'architected', 'designed', 'spearheaded', 'pioneered',
        'founded', 'established', 'managed', 'directed', 'headed',
        'orchestrated', 'championed', 'drove', 'transformed'
    ]
    
    SOLE_CREDIT_PATTERNS = [
        'single-handedly', 'solely', 'independently', 'alone',
        'exclusively', 'entirely by myself', 'without assistance'
    ]
    
    # Unrealistic metrics thresholds
    METRIC_THRESHOLDS = {
        'percentage_increase': {
            '1_month': 50,    # >50% in 1 month is suspicious
            '3_months': 100,   # >100% in 3 months
            '6_months': 200,   # >200% in 6 months
            '12_months': 500   # >500% in 1 year
        },
        'user_growth': {
            'startup': 10000,  # >10k users for early startup
            'mid_stage': 100000,
            'enterprise': 1000000
        },
        'cost_reduction': {
            'max_percentage': 80,  # >80% cost reduction is rare
            'typical_range': (10, 40)
        }
    }
    
    # Vague buzzwords to detect
    BUZZWORDS = [
        'synergy', 'leverage', 'innovative', 'cutting-edge', 
        'revolutionary', 'disruptive', 'transformative', 'passionate',
        'driven', 'results-oriented', 'thought-leader', 'guru',
        'ninja', 'rockstar', 'unicorn', 'game-changer', 'paradigm',
        'bleeding-edge', 'next-generation', 'best-in-class'
    ]
    
    # Technical claim patterns
    VAGUE_TECH_CLAIMS = [
        r'worked on\s+\w+',
        r'involved in\s+\w+',
        r'contributed to\s+\w+',
        r'participated in\s+\w+',
        r'assisted with\s+\w+',
        r'helped with\s+\w+',
        r'exposure to\s+\w+'
    ]
    
    def __init__(self, 
                 gemini_client: Any,
                 strictness_level: str = 'medium'):
        """
        Initialize red flag detector
        
        Args:
            gemini_client: Configured Gemini API client
            strictness_level: 'low', 'medium', or 'high'
        """
        self.gemini_client = gemini_client
        self.strictness_level = strictness_level
        self.severity_multipliers = {
            'low': 0.7,
            'medium': 1.0,
            'high': 1.3
        }
        
    def detect_red_flags(self,
                         validated_claims: Dict,
                         seniority_level: str,
                         role_type: Optional[str] = None) -> Dict[str, Any]:
        """
        Detect red flags in validated claims
        
        Args:
            validated_claims: Claims with validation results
            seniority_level: Detected or specified seniority
            role_type: Type of role (engineering, research, etc.)
            
        Returns:
            Red flags with severity and interview questions
        """
        detection_start = datetime.now()
        
        # Get LLM-based detection
        llm_flags = self._get_llm_red_flags(validated_claims, seniority_level, role_type)
        
        # Perform rule-based detection
        rule_flags = self._detect_rule_based_flags(validated_claims, seniority_level)
        
        # Merge and deduplicate flags
        all_flags = self._merge_red_flags(llm_flags, rule_flags)
        
        # Generate interview questions
        for flag in all_flags:
            flag['interview_questions'] = self._generate_interview_questions(flag)
            
        # Calculate credibility and risk scores
        scores = self._calculate_scores(all_flags, validated_claims, seniority_level)
        
        # Determine auto-reject candidates
        critical_flags = [f for f in all_flags if f['severity'] == 'critical']
        auto_reject = len(critical_flags) >= 2  # 2+ critical flags
        
        return {
            'red_flags': all_flags,
            'credibility_score': scores['credibility'],
            'consistency_score': scores['consistency'],
            'final_score': scores['final'],
            'risk_assessment': scores['risk_level'],
            'auto_reject': auto_reject,
            'detection_time': (datetime.now() - detection_start).total_seconds(),
            'summary': self._generate_summary(all_flags, scores),
            'seniority_adjustment': scores.get('seniority_adjustment', 0)
        }
        
    def _get_llm_red_flags(self,
                          validated_claims: Dict,
                          seniority_level: str,
                          role_type: Optional[str]) -> List[Dict]:
        """
        Get red flags from Gemini LLM
        """
        prompt = RED_FLAG_DETECTION_PROMPT.format(
            validated_claims_json=json.dumps(validated_claims, default=str),
            seniority_level=seniority_level,
            role_type=role_type or 'general'
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
            return result.get('red_flags', [])
            
        except Exception as e:
            logger.error(f"LLM red flag detection failed: {e}")
            return []
            
    def _detect_rule_based_flags(self,
                                validated_claims: Dict,
                                seniority_level: str) -> List[Dict]:
        """
        Detect red flags using rule-based patterns
        """
        flags = []
        
        claims = validated_claims.get('claims', [])
        validations = validated_claims.get('validations', [])
        
        # Create claim-validation mapping
        validation_map = {v['claim_id']: v for v in validations}
        
        for claim in claims:
            claim_flags = []
            validation = validation_map.get(claim['claim_id'], {})
            
            # 1. Role-Achievement Mismatch
            mismatch_flag = self._check_role_achievement_mismatch(claim, seniority_level)
            if mismatch_flag:
                claim_flags.append(mismatch_flag)
                
            # 2. Sole Credit Detection
            sole_credit_flag = self._check_sole_credit(claim)
            if sole_credit_flag:
                claim_flags.append(sole_credit_flag)
                
            # 3. Timeline Issues
            timeline_flags = self._check_timeline_issues(claim, validation)
            claim_flags.extend(timeline_flags)
            
            # 4. Metric Implausibility
            metric_flags = self._check_metric_plausibility(claim)
            claim_flags.extend(metric_flags)
            
            # 5. Vagueness Detection
            vague_flag = self._check_vagueness(claim)
            if vague_flag:
                claim_flags.append(vague_flag)
                
            # 6. Over-claiming Detection
            overclaim_flag = self._check_overclaiming(claim, claims)
            if overclaim_flag:
                claim_flags.append(overclaim_flag)
                
            flags.extend(claim_flags)
            
        # 7. Global pattern detection
        global_flags = self._detect_global_patterns(claims, validations)
        flags.extend(global_flags)
        
        return flags
        
    def _check_role_achievement_mismatch(self, 
                                        claim: Dict,
                                        seniority_level: str) -> Optional[Dict]:
        """
        Check for role-achievement mismatches
        """
        claim_text = claim.get('claim_text', '').lower()
        
        # Check for leadership claims in junior roles
        if seniority_level in ['junior', 'intern']:
            for leadership_word in self.LEADERSHIP_CLAIMS:
                if leadership_word in claim_text:
                    # Check duration if available
                    duration = claim.get('time_period', {}).get('duration_months', 12)
                    
                    if duration < 6:  # Less than 6 months
                        return {
                            'flag_id': f"mismatch_{claim['claim_id'][:8]}",
                            'severity': 'high',
                            'category': 'mismatch',
                            'affected_claims': [claim['claim_id']],
                            'description': f"Leadership claim '{leadership_word}' in {seniority_level} role with {duration} months tenure",
                            'interview_probe': f"Can you elaborate on how you {leadership_word} this initiative as a {seniority_level}?",
                            'requires_proof': True
                        }
                        
        # Check for senior achievements without senior title
        if seniority_level in ['junior', 'mid'] and claim.get('category') == 'work_experience':
            senior_patterns = [
                r'report(?:ed|ing)?\s+to\s+(?:CEO|CTO|VP|President)',
                r'managed?\s+\d+\+?\s+(?:people|engineers|developers)',
                r'budget\s+of\s+\$?\d+M\+?'
            ]
            
            for pattern in senior_patterns:
                if re.search(pattern, claim_text, re.IGNORECASE):
                    return {
                        'flag_id': f"senior_claim_{claim['claim_id'][:8]}",
                        'severity': 'medium',
                        'category': 'mismatch',
                        'affected_claims': [claim['claim_id']],
                        'description': f"Senior-level achievement claimed for {seniority_level} position",
                        'interview_probe': "Can you walk through the organizational structure and your specific role?",
                        'requires_proof': True
                    }
                    
        return None
        
    def _check_sole_credit(self, claim: Dict) -> Optional[Dict]:
        """
        Detect sole credit claims for team projects
        """
        claim_text = claim.get('claim_text', '').lower()
        
        for pattern in self.SOLE_CREDIT_PATTERNS:
            if pattern in claim_text:
                # Check if it's a significant project
                metrics = claim.get('quantifiable_metrics', [])
                
                if metrics or 'team' in claim_text or 'project' in claim_text:
                    return {
                        'flag_id': f"sole_credit_{claim['claim_id'][:8]}",
                        'severity': 'medium',
                        'category': 'overclaim',
                        'affected_claims': [claim['claim_id']],
                        'description': f"Claims sole credit with pattern '{pattern}'",
                        'interview_probe': "Who else was involved in this project and what were their contributions?",
                        'requires_proof': False
                    }
                    
        return None
        
    def _check_timeline_issues(self, 
                              claim: Dict,
                              validation: Dict) -> List[Dict]:
        """
        Check for timeline inconsistencies
        """
        flags = []
        
        # Check tech timeline from validation
        triangulation = validation.get('triangulation', {})
        
        if not triangulation.get('tech_timeline_valid', True):
            tech_issues = triangulation.get('tech_timeline_issues', [])
            
            for issue in tech_issues:
                flags.append({
                    'flag_id': f"tech_timeline_{claim['claim_id'][:8]}",
                    'severity': 'high',
                    'category': 'timeline',
                    'affected_claims': [claim['claim_id']],
                    'description': f"{issue['technology']} claimed before release ({issue['public_release']})",
                    'interview_probe': f"Can you clarify when and how you used {issue['technology']}?",
                    'requires_proof': True
                })
                
        # Check for impossibly short durations
        if claim.get('time_period', {}).get('duration_months'):
            duration = claim['time_period']['duration_months']
            
            # Complex project in very short time
            if 'built' in claim.get('claim_text', '').lower() and duration < 1:
                flags.append({
                    'flag_id': f"short_duration_{claim['claim_id'][:8]}",
                    'severity': 'medium',
                    'category': 'timeline',
                    'affected_claims': [claim['claim_id']],
                    'description': f"Complex project claimed in {duration} months",
                    'interview_probe': "Can you walk through the timeline and development phases of this project?",
                    'requires_proof': False
                })
                
        return flags
        
    def _check_metric_plausibility(self, claim: Dict) -> List[Dict]:
        """
        Check if metrics are plausible
        """
        flags = []
        metrics = claim.get('quantifiable_metrics', [])
        
        for metric in metrics:
            # Check percentage improvements
            pct_match = re.search(r'(\d+)%\s*(increase|improvement|growth)', metric, re.IGNORECASE)
            
            if pct_match:
                percentage = int(pct_match.group(1))
                duration = claim.get('time_period', {}).get('duration_months', 12)
                
                # Check against thresholds
                if duration <= 1 and percentage > self.METRIC_THRESHOLDS['percentage_increase']['1_month']:
                    severity = 'high' if percentage > 200 else 'medium'
                    
                    flags.append({
                        'flag_id': f"metric_pct_{claim['claim_id'][:8]}",
                        'severity': severity,
                        'category': 'implausible',
                        'affected_claims': [claim['claim_id']],
                        'description': f"{percentage}% improvement in {duration} month(s)",
                        'interview_probe': f"Can you explain the baseline and methodology for the {percentage}% improvement?",
                        'requires_proof': True
                    })
                    
            # Check user numbers
            user_match = re.search(r'(\d+)([MKB]?)\+?\s*users?', metric, re.IGNORECASE)
            
            if user_match:
                number = int(user_match.group(1))
                multiplier = {'K': 1000, 'M': 1000000, 'B': 1000000000}.get(user_match.group(2), 1)
                total_users = number * multiplier
                
                # Check if reasonable for claimed context
                if claim.get('category') == 'project' and total_users > 100000:
                    if 'startup' in claim.get('claim_text', '').lower():
                        flags.append({
                            'flag_id': f"users_{claim['claim_id'][:8]}",
                            'severity': 'medium',
                            'category': 'implausible',
                            'affected_claims': [claim['claim_id']],
                            'description': f"{total_users:,} users claimed for startup project",
                            'interview_probe': "Can you share the user acquisition strategy and growth metrics?",
                            'requires_proof': True
                        })
                        
        return flags
        
    def _check_vagueness(self, claim: Dict) -> Optional[Dict]:
        """
        Check for vague claims without specifics
        """
        claim_text = claim.get('claim_text', '')
        claim_text_lower = claim_text.lower()
        
        # Count buzzwords
        buzzword_count = sum(1 for buzz in self.BUZZWORDS if buzz in claim_text_lower)
        word_count = len(claim_text.split())
        
        if word_count > 0:
            buzzword_density = buzzword_count / word_count
            
            if buzzword_density > 0.2:  # >20% buzzwords
                return {
                    'flag_id': f"buzzword_{claim['claim_id'][:8]}",
                    'severity': 'low',
                    'category': 'vague',
                    'affected_claims': [claim['claim_id']],
                    'description': f"High buzzword density ({buzzword_density:.0%})",
                    'interview_probe': "Can you provide specific examples of how this was implemented?",
                    'requires_proof': False
                }
                
        # Check for vague technical claims
        for pattern in self.VAGUE_TECH_CLAIMS:
            if re.search(pattern, claim_text_lower):
                # Check if lacks specifics
                if not claim.get('quantifiable_metrics') and not claim.get('links_artifacts'):
                    return {
                        'flag_id': f"vague_tech_{claim['claim_id'][:8]}",
                        'severity': 'low',
                        'category': 'vague',
                        'affected_claims': [claim['claim_id']],
                        'description': f"Vague technical claim without specifics",
                        'interview_probe': "What was your specific contribution and technical approach?",
                        'requires_proof': False
                    }
                    
        return None
        
    def _check_overclaiming(self, claim: Dict, all_claims: List[Dict]) -> Optional[Dict]:
        """
        Check for patterns of over-claiming
        """
        # Count "expert" level skills
        if claim.get('category') == 'skill':
            expert_skills = [c for c in all_claims 
                           if c.get('category') == 'skill' and 
                           'expert' in c.get('claim_text', '').lower()]
                           
            if len(expert_skills) > 15:
                return {
                    'flag_id': f"expert_overflow_{claim['claim_id'][:8]}",
                    'severity': 'medium',
                    'category': 'overclaim',
                    'affected_claims': [c['claim_id'] for c in expert_skills],
                    'description': f"{len(expert_skills)} expert-level skills claimed",
                    'interview_probe': "Which 3-5 technologies would you consider your strongest expertise?",
                    'requires_proof': False
                }
                
        # Check if all projects are "successful" with no challenges
        if claim.get('category') == 'project':
            project_claims = [c for c in all_claims if c.get('category') == 'project']
            success_words = ['successful', 'achieved', 'exceeded', 'delivered']
            
            all_successful = all(
                any(word in c.get('claim_text', '').lower() for word in success_words)
                for c in project_claims
            )
            
            if all_successful and len(project_claims) > 3:
                return {
                    'flag_id': f"all_success_{claim['claim_id'][:8]}",
                    'severity': 'low',
                    'category': 'overclaim',
                    'affected_claims': [c['claim_id'] for c in project_claims],
                    'description': "All projects claimed as successful with no challenges mentioned",
                    'interview_probe': "What was the most challenging project and how did you overcome obstacles?",
                    'requires_proof': False
                }
                
        return None
        
    def _detect_global_patterns(self,
                               claims: List[Dict],
                               validations: List[Dict]) -> List[Dict]:
        """
        Detect patterns across all claims
        """
        flags = []
        
        # 1. Check for employment gaps
        work_claims = [c for c in claims if c.get('category') == 'work_experience']
        
        if len(work_claims) >= 2:
            # Sort by date
            dated_claims = [c for c in work_claims 
                          if c.get('time_period', {}).get('start_date')]
            dated_claims.sort(key=lambda x: x['time_period']['start_date'])
            
            for i in range(len(dated_claims) - 1):
                curr_end = dated_claims[i].get('time_period', {}).get('end_date', '2099-12')
                next_start = dated_claims[i + 1].get('time_period', {}).get('start_date', '2000-01')
                
                # Calculate gap
                try:
                    gap_months = self._calculate_month_gap(curr_end, next_start)
                    
                    if gap_months > 3:  # >3 month gap
                        flags.append({
                            'flag_id': f"employment_gap_{i}",
                            'severity': 'medium' if gap_months > 12 else 'low',
                            'category': 'timeline',
                            'affected_claims': [dated_claims[i]['claim_id'], 
                                              dated_claims[i + 1]['claim_id']],
                            'description': f"{gap_months} month employment gap",
                            'interview_probe': f"Can you walk me through your activities between {curr_end} and {next_start}?",
                            'requires_proof': False
                        })
                except:
                    pass
                    
        # 2. Check validation consistency
        unverified_count = sum(1 for v in validations 
                             if v.get('verification_status') in ['unverified', 'red_flag'])
                             
        if validations and unverified_count / len(validations) > 0.5:
            flags.append({
                'flag_id': 'low_verification_rate',
                'severity': 'high',
                'category': 'pattern',
                'affected_claims': [],
                'description': f"{unverified_count}/{len(validations)} claims lack evidence",
                'interview_probe': "Can you provide references or portfolio examples for your key achievements?",
                'requires_proof': True
            })
            
        return flags
        
    def _calculate_month_gap(self, date1: str, date2: str) -> int:
        """
        Calculate months between two dates
        """
        try:
            # Parse dates (assuming YYYY-MM format)
            d1 = datetime.strptime(date1[:7], '%Y-%m')
            d2 = datetime.strptime(date2[:7], '%Y-%m')
            
            # Calculate difference
            diff = d2 - d1
            months = diff.days / 30
            
            return max(0, int(months))
        except:
            return 0
            
    def _merge_red_flags(self, 
                        llm_flags: List[Dict],
                        rule_flags: List[Dict]) -> List[Dict]:
        """
        Merge and deduplicate red flags
        """
        all_flags = []
        seen_descriptions = set()
        
        # Prioritize LLM flags (generally more nuanced)
        for flag in llm_flags:
            key = flag.get('description', '')[:50]
            if key and key not in seen_descriptions:
                all_flags.append(flag)
                seen_descriptions.add(key)
                
        # Add unique rule-based flags
        for flag in rule_flags:
            key = flag.get('description', '')[:50]
            if key and key not in seen_descriptions:
                all_flags.append(flag)
                seen_descriptions.add(key)
                
        # Apply strictness multiplier
        multiplier = self.severity_multipliers.get(self.strictness_level, 1.0)
        
        for flag in all_flags:
            # Adjust severity based on strictness
            if multiplier > 1.0 and flag['severity'] == 'low':
                flag['severity'] = 'medium'
            elif multiplier > 1.0 and flag['severity'] == 'medium':
                flag['severity'] = 'high'
            elif multiplier < 1.0 and flag['severity'] == 'high':
                flag['severity'] = 'medium'
                
        return all_flags
        
    def _generate_interview_questions(self, flag: Dict) -> List[str]:
        """
        Generate targeted interview questions for a red flag
        """
        questions = []
        
        # Use template if available
        if flag.get('interview_probe'):
            questions.append(flag['interview_probe'])
            
        # Generate additional questions based on category
        category = flag.get('category', '')
        
        if category == 'mismatch':
            questions.append("Can you describe the team structure and your reporting relationships?")
            questions.append("What specific decisions were you responsible for making?")
            
        elif category == 'timeline':
            questions.append("Can you walk through the project timeline month by month?")
            questions.append("What were the key milestones and deliverables?")
            
        elif category == 'implausible':
            questions.append("What was the baseline before your intervention?")
            questions.append("Can you explain the methodology used to measure this improvement?")
            
        elif category == 'vague':
            questions.append("Can you provide a specific example of a problem you solved?")
            questions.append("What was your exact technical contribution to this project?")
            
        elif category == 'overclaim':
            questions.append("Who else contributed to this achievement and what were their roles?")
            questions.append("What challenges or failures did you encounter?")
            
        return questions[:3]  # Limit to 3 questions per flag
        
    def _calculate_scores(self,
                         flags: List[Dict],
                         validated_claims: Dict,
                         seniority_level: str) -> Dict[str, Any]:
        """
        Calculate credibility and risk scores
        """
        # Start with base scores
        credibility_score = 100
        
        # Deduct for red flags
        for flag in flags:
            severity_deductions = SCORING_CONFIG['red_flag_severity_scores']
            deduction = severity_deductions.get(flag['severity'], 0)
            credibility_score += deduction  # Note: deductions are negative
            
        # Factor in validation scores
        validations = validated_claims.get('validations', [])
        
        if validations:
            avg_evidence_score = sum(v.get('final_evidence_score', 0) for v in validations) / len(validations)
            evidence_adjustment = (avg_evidence_score - 0.5) * 40  # ±20 points
            credibility_score += evidence_adjustment
            
        # Get consistency score from validations
        consistency_score = validated_claims.get('consistency_score', 0.5) * 100
        
        # Apply seniority adjustments
        seniority_config = SCORING_CONFIG['seniority_thresholds'].get(seniority_level, {})
        
        # Calculate buzzword density
        claims = validated_claims.get('claims', [])
        
        if claims:
            total_text = ' '.join(c.get('claim_text', '') for c in claims)
            word_count = len(total_text.split())
            buzzword_count = sum(total_text.lower().count(buzz) for buzz in self.BUZZWORDS)
            buzzword_density = buzzword_count / word_count if word_count > 0 else 0
            
            # Apply penalty if exceeds threshold
            max_buzzword = seniority_config.get('max_buzzword_density', 0.3)
            
            if buzzword_density > max_buzzword:
                credibility_score -= (buzzword_density - max_buzzword) * 50
                
        # Calculate final score (weighted average)
        weights = SCORING_CONFIG['weights']
        final_score = (
            credibility_score * weights['credibility'] +
            consistency_score * weights['consistency']
        )
        
        # Ensure scores are in valid range
        credibility_score = max(0, min(100, credibility_score))
        consistency_score = max(0, min(100, consistency_score))
        final_score = max(0, min(100, final_score))
        
        # Determine risk level
        if final_score >= 75:
            risk_level = 'low'
        elif final_score >= 50:
            risk_level = 'medium'
        elif final_score >= 25:
            risk_level = 'high'
        else:
            risk_level = 'critical'
            
        return {
            'credibility': credibility_score,
            'consistency': consistency_score,
            'final': final_score,
            'risk_level': risk_level,
            'seniority_adjustment': f"Applied {seniority_level} thresholds"
        }
        
    def _generate_summary(self, flags: List[Dict], scores: Dict) -> Dict:
        """
        Generate summary of red flag findings
        """
        if not flags:
            return {
                'total_flags': 0,
                'critical': 0,
                'high': 0,
                'medium': 0,
                'low': 0,
                'top_concerns': [],
                'recommendation': 'No significant concerns detected'
            }
            
        # Count by severity
        severity_counts = Counter(f['severity'] for f in flags)
        
        # Get top concerns (critical and high severity)
        top_concerns = [
            f['description'] for f in flags 
            if f['severity'] in ['critical', 'high']
        ][:5]
        
        # Generate recommendation
        if scores['risk_level'] == 'critical':
            recommendation = 'High risk - Recommend thorough verification or rejection'
        elif scores['risk_level'] == 'high':
            recommendation = 'Significant concerns - Detailed interview verification required'
        elif scores['risk_level'] == 'medium':
            recommendation = 'Moderate concerns - Standard interview with targeted questions'
        else:
            recommendation = 'Low risk - Proceed with standard interview process'
            
        return {
            'total_flags': len(flags),
            'critical': severity_counts.get('critical', 0),
            'high': severity_counts.get('high', 0),
            'medium': severity_counts.get('medium', 0),
            'low': severity_counts.get('low', 0),
            'top_concerns': top_concerns,
            'recommendation': recommendation
        }