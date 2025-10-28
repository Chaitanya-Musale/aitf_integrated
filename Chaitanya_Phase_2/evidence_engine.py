"""
Evidence Unit Extraction and Processing Engine
Implements the research-grade evidence-based framework
"""

import re
from datetime import datetime
from dateutil import parser as date_parser
import math
from config import SystemConfig

class EvidenceUnit:
    """Represents a single piece of evidence from resume"""
    
    def __init__(self, type_, claim, context, time_info=None, org_info=None, 
                 signals=None, proof=None, seniority_signals=None):
        self.type = type_  # skill_use, project, role, impact, publication, cert
        self.claim = claim
        self.context = context
        self.time = time_info or {}
        self.org = org_info or {}
        self.signals = signals or {}
        self.proof = proof or {}
        self.seniority_signals = seniority_signals or []
        self.credibility_score = 0.0
        self.credibility_rationale = ""
        
    def calculate_credibility(self):
        """Calculate credibility score (0-1) based on evidence quality"""
        score = 0.0
        reasons = []
        
        # Check for external verification (1.0)
        if self.proof.get('link') or self.proof.get('repo') or self.proof.get('patent'):
            score = 1.0
            reasons.append("External verifiable link/proof")
        # Check for quantified impact with context (0.8)
        elif (self.signals.get('delta') or self.signals.get('value')) and \
             self.org.get('company') and self.time.get('start'):
            score = 0.8
            reasons.append("Quantified impact with org and dates")
        # Descriptive but plausible (0.6)
        elif self.context and self.time.get('start') and len(self.context.split()) > 5:
            score = 0.6
            reasons.append("Descriptive with context and timeline")
        # Generic claim (0.3)
        elif self.claim and len(self.claim.split()) > 2:
            score = 0.3
            reasons.append("Generic claim without specifics")
        # Unverifiable (0.0)
        else:
            score = 0.0
            reasons.append("Insufficient evidence")
        
        self.credibility_score = score
        self.credibility_rationale = "; ".join(reasons)
        return score
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'type': self.type,
            'claim': self.claim,
            'context': self.context,
            'time': self.time,
            'org': self.org,
            'signals': self.signals,
            'proof': self.proof,
            'seniority_signals': self.seniority_signals,
            'credibility_score': self.credibility_score,
            'credibility_rationale': self.credibility_rationale
        }


class EvidenceExtractor:
    """Extracts evidence units from resume text and job description"""
    
    @staticmethod
    def extract_from_ai_analysis(ai_evidence_units):
        """Convert AI-generated evidence units to EvidenceUnit objects"""
        evidence_objects = []
        
        for eu_dict in ai_evidence_units:
            eu = EvidenceUnit(
                type_=eu_dict.get('type', 'general'),
                claim=eu_dict.get('claim', ''),
                context=eu_dict.get('context', ''),
                time_info=eu_dict.get('time', {}),
                org_info=eu_dict.get('org', {}),
                signals=eu_dict.get('signals', {}),
                proof=eu_dict.get('proof', {}),
                seniority_signals=eu_dict.get('seniority_signals', [])
            )
            
            # Override AI credibility with our calculation
            eu.credibility_score = eu_dict.get('credibility_score', 0.5)
            eu.credibility_rationale = eu_dict.get('rationale', '')
            
            evidence_objects.append(eu)
        
        return evidence_objects
    
    @staticmethod
    def calculate_evidence_density(evidence_units, resume_word_count):
        """Calculate evidence density per 1000 words"""
        credible_eus = sum(1 for eu in evidence_units if eu.credibility_score >= 0.6)
        density = credible_eus / ((resume_word_count / 1000.0) + SystemConfig.EVIDENCE_DENSITY_EPSILON)
        return density
    
    @staticmethod
    def calculate_recency_weight(months_ago, tau=36):
        """Calculate recency decay weight using exponential decay"""
        if months_ago is None or months_ago < 0:
            return 1.0
        return math.exp(-months_ago / tau)
    
    @staticmethod
    def extract_dates_from_text(text):
        """Extract date ranges from text (best effort)"""
        # Look for year patterns
        years = re.findall(r'\b(19|20)\d{2}\b', text)
        if len(years) >= 2:
            try:
                start_year = int(years[0])
                end_year = int(years[-1]) if years[-1] != years[0] else datetime.now().year
                
                months = (end_year - start_year) * 12
                return {'start': start_year, 'end': end_year, 'months': months}
            except:
                pass
        return {}
    
    @staticmethod
    def detect_impact_signals(text):
        """Detect quantified impact signals in text"""
        signals = {}
        
        # Look for percentage changes
        pct_match = re.search(r'(increased|decreased|reduced|improved|grew)\s+(?:by\s+)?(\d+)%', text, re.I)
        if pct_match:
            signals['delta'] = pct_match.group(2) + '%'
            signals['direction'] = pct_match.group(1).lower()
        
        # Look for multipliers
        mult_match = re.search(r'(\d+)x\s+(faster|improvement|increase)', text, re.I)
        if mult_match:
            signals['multiplier'] = mult_match.group(1) + 'x'
        
        # Look for absolute numbers
        num_match = re.search(r'(\d+(?:,\d+)*)\s+(users|customers|requests|transactions)', text, re.I)
        if num_match:
            signals['scale'] = num_match.group(1) + ' ' + num_match.group(2)
        
        return signals if signals else None


class RedFlagDetector:
    """Detects red flags and applies context-aware penalties"""
    
    @staticmethod
    def detect_red_flags(evidence_units, resume_text):
        """Detect red flags with severity levels"""
        red_flags = []
        
        # Extract job history from evidence units
        job_roles = [eu for eu in evidence_units if eu.type == 'role']
        
        # Check for short tenures
        short_tenures = []
        for eu in job_roles:
            if eu.time.get('months', 999) < SystemConfig.MIN_JOB_DURATION_MONTHS:
                # Check for freelance/contract indicators
                is_freelance = any(keyword in eu.context.lower() 
                                 for keyword in SystemConfig.FREELANCE_INDICATORS)
                if not is_freelance:
                    short_tenures.append(eu)
        
        if short_tenures:
            red_flags.append({
                'flag': f'Short tenure(s): {len(short_tenures)} job(s) < {SystemConfig.MIN_JOB_DURATION_MONTHS} months',
                'severity': 'medium' if len(short_tenures) > 1 else 'low',
                'impact': 'May indicate instability',
                'context_considered': 'Internships and contract roles excluded'
            })
        
        # Check for frequent job changes (in 3-year windows)
        if len(job_roles) >= SystemConfig.MAX_JOB_CHANGES_3YEARS:
            # Calculate if they're within 3 years
            dates = [eu.time.get('start', 0) for eu in job_roles if eu.time.get('start')]
            if dates and len(dates) >= 4:
                dates_sorted = sorted(dates)
                if dates_sorted[-1] - dates_sorted[-4] <= 3:  # Within 3 years
                    red_flags.append({
                        'flag': f'{len(job_roles)} job changes in ≤3 years',
                        'severity': 'medium',
                        'impact': 'Job hopping pattern detected',
                        'context_considered': 'Layoffs and career pivots considered'
                    })
        
        # Check for employment gaps
        gaps = RedFlagDetector._detect_employment_gaps(job_roles, resume_text)
        for gap in gaps:
            red_flags.append(gap)
        
        # Check for conflicting dates
        conflicts = RedFlagDetector._detect_date_conflicts(job_roles)
        if conflicts:
            red_flags.append({
                'flag': 'Overlapping or conflicting employment dates',
                'severity': 'high',
                'impact': 'Timeline inconsistencies detected',
                'context_considered': 'May need clarification'
            })
        
        return red_flags
    
    @staticmethod
    def _detect_employment_gaps(job_roles, resume_text):
        """Detect employment gaps with context awareness"""
        gaps = []
        
        if len(job_roles) < 2:
            return gaps
        
        # Sort by start date
        sorted_roles = sorted([r for r in job_roles if r.time.get('end')], 
                            key=lambda x: x.time.get('end', 0))
        
        for i in range(len(sorted_roles) - 1):
            end_year = sorted_roles[i].time.get('end', 0)
            next_start = sorted_roles[i + 1].time.get('start', 0)
            
            if next_start and end_year:
                gap_months = (next_start - end_year) * 12
                
                if gap_months > SystemConfig.MAX_JOB_GAP_MONTHS:
                    # Check for valid reasons
                    has_reason = any(keyword in resume_text.lower() 
                                   for keyword in SystemConfig.CAREER_BREAK_INDICATORS)
                    
                    severity = 'low' if has_reason else 'medium'
                    
                    gaps.append({
                        'flag': f'Employment gap: ~{int(gap_months)} months between {end_year}-{next_start}',
                        'severity': severity,
                        'impact': 'Gap in employment history',
                        'context_considered': 'Education/caregiving reasons considered' if has_reason else 'No explanation found'
                    })
        
        return gaps
    
    @staticmethod
    def _detect_date_conflicts(job_roles):
        """Detect overlapping job dates (excluding freelance)"""
        # Sort by start date
        sorted_roles = sorted([r for r in job_roles if r.time.get('start')], 
                            key=lambda x: x.time.get('start', 0))
        
        for i in range(len(sorted_roles) - 1):
            role1 = sorted_roles[i]
            role2 = sorted_roles[i + 1]
            
            # Skip if either is freelance
            is_freelance1 = any(kw in role1.context.lower() for kw in SystemConfig.FREELANCE_INDICATORS)
            is_freelance2 = any(kw in role2.context.lower() for kw in SystemConfig.FREELANCE_INDICATORS)
            
            if is_freelance1 or is_freelance2:
                continue
            
            # Check for overlap
            end1 = role1.time.get('end', 9999)
            start2 = role2.time.get('start', 0)
            
            if start2 < end1:
                return True
        
        return False
    
    @staticmethod
    def apply_red_flag_penalties(base_sr_score, red_flags):
        """Apply red flag penalties to Stability & Risk score"""
        final_score = base_sr_score
        
        for flag in red_flags:
            severity = flag.get('severity', 'low')
            penalty = SystemConfig.RED_FLAG_PENALTIES.get(severity, 0.1)
            final_score = final_score * (1 - penalty)
        
        # Floor at 0
        return max(0, final_score)


class PositiveBoosterEngine:
    """Applies positive boosters for exceptional achievements"""
    
    @staticmethod
    def calculate_boosters(evidence_units):
        """Calculate boost points from exceptional achievements"""
        total_boost = 0
        boosts_applied = []
        
        for eu in evidence_units:
            # Check for awards
            if 'award' in eu.proof or 'award' in eu.type:
                total_boost += SystemConfig.BOOSTER_AWARD
                boosts_applied.append(f"Award: {eu.claim[:50]}")
            
            # Check for patents
            if 'patent' in eu.proof or 'patent' in eu.type:
                total_boost += SystemConfig.BOOSTER_PATENT
                boosts_applied.append(f"Patent: {eu.claim[:50]}")
            
            # Check for publications
            if eu.type == 'publication' or 'publication' in eu.proof:
                total_boost += SystemConfig.BOOSTER_PUBLICATION
                boosts_applied.append(f"Publication: {eu.claim[:50]}")
            
            # Check for major OSS contributions
            if eu.proof.get('repo') and ('stars' in str(eu.signals) or 'contributors' in str(eu.signals)):
                total_boost += SystemConfig.BOOSTER_MAJOR_OSS
                boosts_applied.append(f"Major OSS: {eu.claim[:50]}")
        
        # Cap at maximum
        total_boost = min(total_boost, SystemConfig.BOOSTER_CAP)
        
        return total_boost, boosts_applied