"""
Scoring Engine with Mathematical Rigor
Implements sigmoid, diminishing returns, confidence calculations
"""

import math
import numpy as np
from config import SystemConfig
from evidence_engine import EvidenceExtractor

class ScoringEngine:
    """Implements research-grade scoring algorithms"""
    
    @staticmethod
    def sigmoid_score(raw_value, mu=50, sigma=15):
        """
        Apply sigmoid transformation for diminishing returns
        
        Args:
            raw_value: Raw accumulated score
            mu: Median target (default 50)
            sigma: Spread control (default 15)
            
        Returns:
            Score between 0-100 with diminishing returns
        """
        normalized = (raw_value - mu) / sigma
        sigmoid_val = 1 / (1 + math.exp(-normalized))
        return sigmoid_val * 100
    
    @staticmethod
    def calculate_metric_from_eus(evidence_units, metric_type, weights=None, apply_recency=True):
        """
        Calculate a single metric score from evidence units
        
        Args:
            evidence_units: List of EvidenceUnit objects
            metric_type: Which metric to calculate (TDB, XR, OI, etc.)
            weights: Optional custom weights
            apply_recency: Whether to apply recency decay
            
        Returns:
            Score 0-100 with diminishing returns applied
        """
        # Filter relevant EUs for this metric
        relevant_eus = ScoringEngine._filter_eus_for_metric(evidence_units, metric_type)
        
        if not relevant_eus:
            return 0
        
        # Calculate raw weighted sum
        raw_score = 0
        contributions = []
        
        for eu in relevant_eus:
            # Base contribution from credibility
            contribution = eu.credibility_score * 10  # Scale to 0-10 per EU
            
            # Apply recency decay if applicable
            if apply_recency and eu.time.get('end'):
                current_year = 2025
                years_ago = current_year - eu.time.get('end', current_year)
                months_ago = years_ago * 12
                
                tau = SystemConfig.RECENCY_DECAY_TAU_SKILLS
                if metric_type in ['GA']:  # Growth/certs decay faster
                    tau = SystemConfig.RECENCY_DECAY_TAU_CERTS
                
                recency_weight = EvidenceExtractor.calculate_recency_weight(months_ago, tau)
                contribution *= recency_weight
            
            # Apply complexity multipliers for specific metrics
            if metric_type == 'SC':  # Systems Complexity
                if 'distributed' in eu.context.lower() or 'scale' in eu.context.lower():
                    contribution *= 1.5
            
            if metric_type == 'OI':  # Outcome & Impact
                if eu.signals.get('delta'):
                    contribution *= 1.3
            
            # Cap single EU contribution
            max_contribution = SystemConfig.EU_CONTRIBUTION_CAP * 100
            contribution = min(contribution, max_contribution)
            
            contributions.append(contribution)
            raw_score += contribution
        
        # Apply diminishing returns via sigmoid
        final_score = ScoringEngine.sigmoid_score(
            raw_score, 
            mu=SystemConfig.SIGMOID_MU,
            sigma=SystemConfig.SIGMOID_SIGMA
        )
        
        return min(100, max(0, final_score))
    
    @staticmethod
    def _filter_eus_for_metric(evidence_units, metric_type):
        """Filter evidence units relevant to a specific metric"""
        
        # Mapping of metrics to relevant EU types and keywords
        metric_filters = {
            'TDB': ['skill_use', 'project', 'role'],  # Technical Depth & Breadth
            'XR': ['role', 'project'],  # Experience Relevance
            'OI': ['impact', 'project'],  # Outcome & Impact
            'SC': ['project', 'role'],  # Systems Complexity
            'DA': ['role', 'project'],  # Domain Alignment
            'LC': ['role'],  # Leadership & Collaboration
            'CE': ['project', 'publication', 'cert'],  # Communication & Evidence
            'GA': ['cert', 'skill_use', 'project'],  # Growth & Adaptability
            'SR': ['role'],  # Stability & Risk
            'AC': ['role'],  # Availability
            'CF': ['role']  # Compensation Fit
        }
        
        relevant_types = metric_filters.get(metric_type, [])
        
        filtered = []
        for eu in evidence_units:
            if eu.type in relevant_types:
                filtered.append(eu)
            # Also include if metric-specific keywords in context
            elif metric_type == 'OI' and eu.signals.get('delta'):
                filtered.append(eu)
            elif metric_type == 'LC' and any(kw in eu.context.lower() for kw in ['lead', 'manage', 'mentor', 'team']):
                filtered.append(eu)
        
        return filtered
    
    @staticmethod
    def calculate_all_11_metrics(evidence_units):
        """Calculate all 11 metrics with research-grade algorithms"""
        
        metrics = {}
        
        metric_codes = ['TDB', 'XR', 'OI', 'SC', 'DA', 'LC', 'CE', 'GA', 'SR', 'AC', 'CF']
        
        for code in metric_codes:
            score = ScoringEngine.calculate_metric_from_eus(
                evidence_units, 
                code,
                apply_recency=(code in ['XR', 'GA'])  # Only apply recency to certain metrics
            )
            
            metrics[code] = {
                'score': round(score, 1),
                'rationale': f'Calculated from {len(ScoringEngine._filter_eus_for_metric(evidence_units, code))} evidence units'
            }
        
        return metrics
    
    @staticmethod
    def calculate_confidence(evidence_units, metrics, resume_text):
        """
        Calculate analysis confidence using formula:
        confidence = α*(avg_credibility) + β*(coverage_ratio) + γ*(consistency)
        """
        
        # Component 1: Average Credibility
        if evidence_units:
            avg_credibility = sum(eu.credibility_score for eu in evidence_units) / len(evidence_units)
        else:
            avg_credibility = 0.0
        
        # Component 2: Coverage Ratio
        # How many metrics have sufficient evidence (≥ MIN_EVIDENCE_THRESHOLD EUs)
        coverage_count = 0
        total_metrics = 11
        
        for metric_code in ['TDB', 'XR', 'OI', 'SC', 'DA', 'LC', 'CE', 'GA', 'SR', 'AC', 'CF']:
            relevant_eus = ScoringEngine._filter_eus_for_metric(evidence_units, metric_code)
            if len(relevant_eus) >= SystemConfig.MIN_EVIDENCE_THRESHOLD:
                coverage_count += 1
        
        coverage_ratio = coverage_count / total_metrics
        
        # Component 3: Consistency Score
        # Check for date conflicts, contradictions
        consistency = ScoringEngine._calculate_consistency(evidence_units)
        
        # Final confidence calculation
        confidence = (
            SystemConfig.CONFIDENCE_ALPHA * avg_credibility +
            SystemConfig.CONFIDENCE_BETA * coverage_ratio +
            SystemConfig.CONFIDENCE_GAMMA * consistency
        )
        
        # Identify data gaps
        data_gaps = []
        for metric_code in ['TDB', 'XR', 'OI', 'SC', 'DA', 'LC', 'CE', 'GA', 'SR', 'AC', 'CF']:
            relevant_eus = ScoringEngine._filter_eus_for_metric(evidence_units, metric_code)
            if len(relevant_eus) < SystemConfig.MIN_EVIDENCE_THRESHOLD:
                data_gaps.append(f"Insufficient evidence for {metric_code}")
        
        return {
            'overall_confidence': round(confidence, 2),
            'avg_credibility': round(avg_credibility, 2),
            'coverage_ratio': round(coverage_ratio, 2),
            'consistency_score': round(consistency, 2),
            'data_gaps': data_gaps[:3],  # Top 3 gaps
            'confidence_explanation': ScoringEngine._generate_confidence_explanation(confidence, coverage_ratio, avg_credibility)
        }
    
    @staticmethod
    def _calculate_consistency(evidence_units):
        """Check for contradictions and inconsistencies"""
        
        # Extract all dates
        dates = []
        for eu in evidence_units:
            if eu.time.get('start'):
                dates.append(('start', eu.time['start'], eu.claim))
            if eu.time.get('end'):
                dates.append(('end', eu.time['end'], eu.claim))
        
        # Check for impossible dates (future, or too old)
        current_year = 2025
        issues = 0
        
        for date_type, year, claim in dates:
            if year > current_year:
                issues += 1
            if year < 1990:  # Assuming no one has 35+ year history relevant
                issues += 1
        
        # Check for overlaps in full-time roles
        # (Simplified - in production, would be more sophisticated)
        
        # Return consistency score (1.0 = perfect, 0.0 = many issues)
        if len(dates) == 0:
            return 0.5  # Neutral if no dates
        
        consistency = max(0, 1.0 - (issues / len(dates)))
        return consistency
    
    @staticmethod
    def _generate_confidence_explanation(confidence, coverage, credibility):
        """Generate human-readable confidence explanation"""
        if confidence >= 0.8:
            return "High confidence - strong evidence across most metrics with good verification"
        elif confidence >= 0.6:
            return "Moderate confidence - decent evidence but some gaps in coverage or credibility"
        elif confidence >= 0.4:
            return "Low-moderate confidence - limited evidence or verification, some metrics underrepresented"
        else:
            return "Low confidence - insufficient evidence, significant data gaps, or verification issues"
    
    @staticmethod
    def calculate_final_score(metrics, seniority, confidence, boosters=0):
        """
        Calculate final weighted score using seniority-specific weights
        
        Args:
            metrics: Dict of 11 metric scores
            seniority: 'junior', 'mid', 'senior', or 'lead'
            confidence: Confidence score 0-1
            boosters: Positive booster points
            
        Returns:
            Final score 0-100 with confidence adjustment
        """
        
        weights = SystemConfig.SENIORITY_WEIGHTS.get(seniority, SystemConfig.SENIORITY_WEIGHTS['senior'])
        
        # Calculate weighted sum
        raw_score = sum([
            metrics.get('TDB', {}).get('score', 0) * weights['TDB'],
            metrics.get('XR', {}).get('score', 0) * weights['XR'],
            metrics.get('OI', {}).get('score', 0) * weights['OI'],
            metrics.get('SC', {}).get('score', 0) * weights['SC'],
            metrics.get('DA', {}).get('score', 0) * weights['DA'],
            metrics.get('LC', {}).get('score', 0) * weights['LC'],
            metrics.get('CE', {}).get('score', 0) * weights['CE'],
            metrics.get('GA', {}).get('score', 0) * weights['GA'],
            metrics.get('SR', {}).get('score', 0) * weights['SR'],
            metrics.get('AC', {}).get('score', 0) * weights['AC'],
            metrics.get('CF', {}).get('score', 0) * weights['CF']
        ]) / 100.0  # Weights sum to 100, so divide to get 0-100 scale
        
        # Add boosters (capped)
        raw_score += boosters
        
        # Apply confidence adjustment
        # confidence_adjusted = raw * (0.9 + 0.1 * confidence)
        # This means: low confidence (0) = 90% of score, high confidence (1) = 100% of score
        adjusted_score = raw_score * (0.9 + 0.1 * confidence)
        
        return min(100, max(0, adjusted_score))
    
    @staticmethod
    def determine_tier(final_score, confidence):
        """Determine candidate tier with confidence guardrails"""
        
        if final_score >= SystemConfig.TIER_FAST_TRACK and confidence >= SystemConfig.MIN_CONFIDENCE_FAST_TRACK:
            return "Fast-Track"
        elif final_score >= SystemConfig.TIER_INTERVIEW and confidence >= SystemConfig.MIN_CONFIDENCE_INTERVIEW:
            return "Advance to Interview"
        elif final_score >= SystemConfig.TIER_HOLD:
            return "Hold/More Info"
        elif confidence < SystemConfig.MIN_CONFIDENCE_INTERVIEW:
            return "Hold/More Info"  # Low confidence even with decent score
        else:
            return "No-Go"
    
    @staticmethod
    def apply_tiebreaker(candidates):
        """
        Apply tie-breaking rules: higher OI → higher TDB → higher confidence → lower SR
        
        Args:
            candidates: List of candidate analysis dicts
            
        Returns:
            Sorted list by tiebreaker rules
        """
        
        def tiebreaker_key(candidate):
            metrics = candidate.get('metrics_11', {})
            confidence = candidate.get('confidence_score', 0)
            
            return (
                metrics.get('OI_outcome_impact', {}).get('score', 0),
                metrics.get('TDB_technical_depth_breadth', {}).get('score', 0),
                confidence,
                100 - metrics.get('SR_stability_risk', {}).get('score', 0)  # Lower SR is better for tiebreak
            )
        
        return sorted(candidates, key=tiebreaker_key, reverse=True)