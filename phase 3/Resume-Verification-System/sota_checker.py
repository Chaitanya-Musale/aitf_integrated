"""
SOTA Checker Module
Verifies research and technical claims against known State-of-the-Art benchmarks
Includes automatic benchmark lookup and plausibility assessment
"""

import re
import json
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import logging

# Handle both modular and flat imports
try:
    from config.prompts import SOTA_VERIFICATION_PROMPT
except ImportError:
    from prompts import SOTA_VERIFICATION_PROMPT

logger = logging.getLogger(__name__)

class SOTAChecker:
    """
    Verifies research claims against known SOTA benchmarks
    with automatic "Needs Clarification" flagging
    """
    
    # Known SOTA benchmarks (as of 2025)
    SOTA_BENCHMARKS = {
        # Computer Vision
        'imagenet': {
            'accuracy': {
                '2020': 88.5,
                '2021': 90.2,
                '2022': 91.5,
                '2023': 92.0,
                '2024': 92.4,
                '2025': 92.8
            },
            'top5_accuracy': {
                '2024': 98.9,
                '2025': 99.1
            },
            'dataset_size': 1281167,
            'classes': 1000
        },
        'coco': {
            'map': {  # mean Average Precision
                '2020': 52.5,
                '2021': 58.7,
                '2022': 61.3,
                '2023': 63.1,
                '2024': 64.8,
                '2025': 65.5
            },
            'map50': {
                '2024': 85.2,
                '2025': 86.1
            }
        },
        'cifar10': {
            'accuracy': {
                '2020': 98.5,
                '2021': 99.0,
                '2022': 99.2,
                '2023': 99.3,
                '2024': 99.4,
                '2025': 99.5
            }
        },
        'cifar100': {
            'accuracy': {
                '2020': 91.3,
                '2021': 93.5,
                '2022': 94.8,
                '2023': 95.5,
                '2024': 96.1,
                '2025': 96.5
            }
        },
        
        # NLP Benchmarks
        'squad': {
            'f1': {
                '2020': 93.0,
                '2021': 94.5,
                '2022': 95.8,
                '2023': 96.5,
                '2024': 97.2,
                '2025': 97.8
            },
            'em': {  # Exact Match
                '2024': 91.5,
                '2025': 92.3
            }
        },
        'glue': {
            'average': {
                '2020': 88.5,
                '2021': 90.1,
                '2022': 91.8,
                '2023': 92.9,
                '2024': 93.5,
                '2025': 94.2
            }
        },
        'superglue': {
            'average': {
                '2020': 84.6,
                '2021': 88.2,
                '2022': 90.5,
                '2023': 92.1,
                '2024': 93.0,
                '2025': 93.8
            }
        },
        'wmt': {  # Machine Translation
            'bleu': {
                '2023': 38.5,
                '2024': 41.2,
                '2025': 43.1
            }
        },
        
        # Speech Recognition
        'librispeech': {
            'wer_clean': {  # Word Error Rate
                '2020': 2.3,
                '2021': 1.8,
                '2022': 1.4,
                '2023': 1.1,
                '2024': 0.9,
                '2025': 0.7
            },
            'wer_other': {
                '2024': 2.3,
                '2025': 1.9
            }
        },
        
        # Reinforcement Learning
        'atari': {
            'average_score': {
                '2020': 5000,
                '2021': 8500,
                '2022': 12000,
                '2023': 15000,
                '2024': 18000,
                '2025': 21000
            }
        },
        
        # Medical AI
        'chexpert': {
            'auc': {
                '2022': 0.94,
                '2023': 0.95,
                '2024': 0.96,
                '2025': 0.97
            }
        },
        
        # Recommendation Systems
        'movielens': {
            'rmse': {
                '2023': 0.75,
                '2024': 0.72,
                '2025': 0.69
            }
        }
    }
    
    # Metric patterns to extract
    METRIC_PATTERNS = {
        'accuracy': r'(\d+(?:\.\d+)?)\s*%?\s*accuracy',
        'f1': r'f1[\s\-_]*score[\s:]*(\d+(?:\.\d+)?)',
        'precision': r'precision[\s:]*(\d+(?:\.\d+)?)',
        'recall': r'recall[\s:]*(\d+(?:\.\d+)?)',
        'bleu': r'bleu[\s\-_]*(?:score)?[\s:]*(\d+(?:\.\d+)?)',
        'perplexity': r'perplexity[\s:]*(\d+(?:\.\d+)?)',
        'wer': r'wer[\s:]*(\d+(?:\.\d+)?)',
        'cer': r'cer[\s:]*(\d+(?:\.\d+)?)',
        'map': r'map[@\s]*(\d+)?[\s:]*(\d+(?:\.\d+)?)',
        'auc': r'auc[\s:]*(\d+(?:\.\d+)?)',
        'rmse': r'rmse[\s:]*(\d+(?:\.\d+)?)',
        'mae': r'mae[\s:]*(\d+(?:\.\d+)?)'
    }
    
    # Dataset name variations
    DATASET_ALIASES = {
        'imagenet': ['imagenet', 'ilsvrc', 'imagenet-1k', 'imagenet1k'],
        'coco': ['coco', 'ms-coco', 'mscoco', 'coco2017', 'coco2014'],
        'squad': ['squad', 'squad2.0', 'squad1.1', 'squadv2', 'squadv1'],
        'glue': ['glue', 'glue-benchmark'],
        'cifar10': ['cifar10', 'cifar-10'],
        'cifar100': ['cifar100', 'cifar-100'],
        'wmt': ['wmt', 'wmt14', 'wmt16', 'wmt19', 'wmt22'],
        'librispeech': ['librispeech', 'libri-speech'],
        'movielens': ['movielens', 'ml-1m', 'ml-20m', 'ml-latest']
    }
    
    def __init__(self, 
                 gemini_client: Any,
                 year_context: int = 2025):
        """
        Initialize SOTA checker
        
        Args:
            gemini_client: Configured Gemini API client
            year_context: Current year for benchmark comparison
        """
        self.gemini_client = gemini_client
        self.year_context = year_context
        
    def verify_research_claims(self,
                              claims: List[Dict],
                              deep_check: bool = True) -> Dict[str, Any]:
        """
        Verify research and technical achievement claims
        
        Args:
            claims: List of claims to verify
            deep_check: Perform deep SOTA verification
            
        Returns:
            SOTA validation results
        """
        research_claims = self._extract_research_claims(claims)
        
        if not research_claims:
            return {
                'sota_validations': [],
                'summary': {
                    'total_research_claims': 0,
                    'exceeds_sota': 0,
                    'needs_clarification': 0,
                    'verified': 0
                }
            }
            
        # Get LLM verification
        if deep_check:
            llm_validations = self._get_llm_sota_verification(research_claims)
        else:
            llm_validations = []
            
        # Perform rule-based verification
        validations = []
        
        for claim in research_claims:
            # Start with LLM validation if available
            base_validation = next(
                (v for v in llm_validations if v.get('claim_id') == claim['claim_id']),
                {}
            )
            
            # Extract metrics and benchmarks
            metrics = self._extract_metrics(claim['claim_text'])
            benchmark = self._identify_benchmark(claim['claim_text'])
            
            # Verify against known SOTA
            verification = self._verify_against_sota(metrics, benchmark, claim)
            
            # Merge validations
            validation = {
                **base_validation,
                **verification,
                'claim_id': claim['claim_id'],
                'claim_text': claim['claim_text']
            }
            
            # Generate interview questions
            validation['interview_questions'] = self._generate_research_questions(validation)
            
            validations.append(validation)
            
        # Generate summary
        summary = self._generate_sota_summary(validations)
        
        return {
            'sota_validations': validations,
            'summary': summary
        }
        
    def _extract_research_claims(self, claims: List[Dict]) -> List[Dict]:
        """
        Filter claims that are research/technical achievements
        """
        research_claims = []
        
        research_keywords = [
            'sota', 'state-of-the-art', 'benchmark', 'baseline', 'outperform',
            'accuracy', 'f1', 'precision', 'recall', 'bleu', 'perplexity',
            'published', 'paper', 'conference', 'journal', 'arxiv',
            'model', 'algorithm', 'method', 'approach', 'technique'
        ]
        
        for claim in claims:
            claim_text_lower = claim.get('claim_text', '').lower()
            
            # Check if it's research-related
            is_research = (
                claim.get('category') == 'research' or
                any(keyword in claim_text_lower for keyword in research_keywords)
            )
            
            # Check if has metrics
            has_metrics = bool(claim.get('quantifiable_metrics')) or \
                         any(pattern in claim_text_lower for pattern in ['%', 'score', 'rate'])
                         
            if is_research and has_metrics:
                research_claims.append(claim)
                
        return research_claims
        
    def _get_llm_sota_verification(self, research_claims: List[Dict]) -> List[Dict]:
        """
        Get SOTA verification from Gemini
        """
        claims_json = json.dumps(research_claims, default=str)
        current_date = datetime.now().strftime('%Y-%m-%d')
        
        prompt = SOTA_VERIFICATION_PROMPT.format(
            research_claims_json=claims_json,
            current_date=current_date
        )
        
        try:
            response = self.gemini_client.generate_content(
                prompt,
                generation_config={
                    'temperature': 0.1,
                    'top_p': 0.95,
                    'max_output_tokens': 4096
                }
            )
            
            result = json.loads(response.text)
            return result.get('sota_validations', [])
            
        except Exception as e:
            logger.error(f"LLM SOTA verification failed: {e}")
            return []
            
    def _extract_metrics(self, text: str) -> Dict[str, float]:
        """
        Extract metrics from claim text
        """
        metrics = {}
        text_lower = text.lower()
        
        for metric_name, pattern in self.METRIC_PATTERNS.items():
            matches = re.findall(pattern, text_lower)
            
            if matches:
                # Handle different match formats
                if isinstance(matches[0], tuple):
                    # For patterns with multiple groups (like mAP@50)
                    value = matches[0][-1]  # Take the last group (the number)
                else:
                    value = matches[0]
                    
                try:
                    metrics[metric_name] = float(value)
                except:
                    continue
                    
        # Also look for generic percentage claims
        pct_pattern = r'(\d+(?:\.\d+)?)\s*%'
        pct_matches = re.findall(pct_pattern, text)
        
        if pct_matches and not metrics:
            metrics['percentage'] = float(pct_matches[0])
            
        return metrics
        
    def _identify_benchmark(self, text: str) -> Optional[str]:
        """
        Identify which benchmark/dataset is referenced
        """
        text_lower = text.lower()
        
        for benchmark, aliases in self.DATASET_ALIASES.items():
            for alias in aliases:
                if alias in text_lower:
                    return benchmark
                    
        # Check for direct benchmark names
        for benchmark in self.SOTA_BENCHMARKS.keys():
            if benchmark in text_lower:
                return benchmark
                
        return None
        
    def _verify_against_sota(self,
                            metrics: Dict[str, float],
                            benchmark: Optional[str],
                            claim: Dict) -> Dict:
        """
        Verify metrics against known SOTA
        """
        if not metrics:
            return {
                'benchmark': benchmark,
                'claimed_metrics': {},
                'verification_status': 'no_metrics',
                'needs_clarification': ['No quantifiable metrics found']
            }
            
        if not benchmark:
            return {
                'benchmark': 'unknown',
                'claimed_metrics': metrics,
                'verification_status': 'needs_clarification',
                'needs_clarification': ['Benchmark/dataset not identified']
            }
            
        # Get SOTA for this benchmark
        sota_data = self.SOTA_BENCHMARKS.get(benchmark, {})
        
        exceeds_sota = False
        plausibility = 'unknown'
        missing_details = []
        comparisons = []
        
        for metric_name, metric_value in metrics.items():
            # Find corresponding SOTA metric
            sota_metric = None
            
            # Try to match metric name
            if metric_name in sota_data:
                year_data = sota_data[metric_name]
                
                # Get most recent SOTA
                if isinstance(year_data, dict):
                    recent_year = str(self.year_context)
                    
                    if recent_year in year_data:
                        sota_metric = year_data[recent_year]
                    else:
                        # Get closest year
                        available_years = sorted(year_data.keys())
                        if available_years:
                            sota_metric = year_data[available_years[-1]]
                            
            if sota_metric is not None:
                # Compare with SOTA
                # For error rates (WER, CER), lower is better
                if metric_name in ['wer', 'cer', 'rmse', 'mae']:
                    exceeds_sota = metric_value < sota_metric
                    improvement = ((sota_metric - metric_value) / sota_metric) * 100
                else:
                    # For accuracy metrics, higher is better
                    exceeds_sota = metric_value > sota_metric
                    improvement = ((metric_value - sota_metric) / sota_metric) * 100
                    
                comparisons.append({
                    'metric': metric_name,
                    'claimed': metric_value,
                    'sota': sota_metric,
                    'exceeds': exceeds_sota,
                    'improvement_pct': improvement
                })
                
                # Check plausibility
                if abs(improvement) > 10:  # >10% improvement
                    plausibility = 'unlikely'
                    missing_details.append(f"Large improvement ({improvement:.1f}%) needs justification")
                elif abs(improvement) > 5:  # 5-10% improvement
                    plausibility = 'possible'
                    missing_details.append("Moderate improvement needs verification")
                else:
                    plausibility = 'plausible'
                    
        # Check for missing context
        if not claim.get('links_artifacts'):
            missing_details.append("No paper/code link provided")
            
        # Determine verification status
        if exceeds_sota and plausibility == 'unlikely':
            verification_status = 'red_flag'
        elif exceeds_sota and plausibility == 'possible':
            verification_status = 'needs_clarification'
        elif not comparisons:
            verification_status = 'needs_clarification'
        else:
            verification_status = 'likely_valid'
            
        return {
            'benchmark': benchmark,
            'claimed_metrics': metrics,
            'sota_comparisons': comparisons,
            'exceeds_sota': exceeds_sota,
            'plausibility': plausibility,
            'verification_status': verification_status,
            'missing_details': missing_details,
            'has_context': bool(claim.get('links_artifacts')),
            'needs_clarification': missing_details if missing_details else []
        }
        
    def _generate_research_questions(self, validation: Dict) -> List[str]:
        """
        Generate interview questions for research claims
        """
        questions = []
        
        # Base questions for all research claims
        questions.append("Can you walk through your experimental setup and evaluation methodology?")
        
        # Questions based on verification status
        status = validation.get('verification_status', '')
        
        if status == 'red_flag':
            questions.append("Your results significantly exceed published SOTA. What novel techniques enabled this improvement?")
            questions.append("Has this work been peer-reviewed or replicated independently?")
            
        elif status == 'needs_clarification':
            benchmark = validation.get('benchmark', 'your benchmark')
            questions.append(f"What specific variant or split of {benchmark} did you evaluate on?")
            questions.append("What were the baseline models you compared against?")
            
        # Questions for missing details
        if not validation.get('has_context'):
            questions.append("Can you share the paper or technical report for this work?")
            
        # Questions about specific metrics
        comparisons = validation.get('sota_comparisons', [])
        
        if comparisons:
            for comp in comparisons[:1]:  # Ask about top comparison
                if comp['exceeds']:
                    questions.append(
                        f"You achieved {comp['claimed']:.1f} {comp['metric']} vs SOTA of {comp['sota']:.1f}. "
                        "What were the key innovations?"
                    )
                    
        return questions[:4]  # Limit to 4 questions
        
    def _generate_sota_summary(self, validations: List[Dict]) -> Dict:
        """
        Generate summary of SOTA validations
        """
        if not validations:
            return {
                'total_research_claims': 0,
                'exceeds_sota': 0,
                'needs_clarification': 0,
                'verified': 0,
                'red_flags': 0
            }
            
        exceeds_count = sum(1 for v in validations if v.get('exceeds_sota'))
        
        status_counts = {
            'likely_valid': 0,
            'needs_clarification': 0,
            'red_flag': 0,
            'no_metrics': 0
        }
        
        for v in validations:
            status = v.get('verification_status', 'unknown')
            if status in status_counts:
                status_counts[status] += 1
                
        # Get benchmarks used
        benchmarks = list(set(v.get('benchmark') for v in validations if v.get('benchmark')))
        
        # Calculate average improvement for SOTA-exceeding claims
        improvements = []
        
        for v in validations:
            for comp in v.get('sota_comparisons', []):
                if comp['exceeds']:
                    improvements.append(abs(comp['improvement_pct']))
                    
        avg_improvement = sum(improvements) / len(improvements) if improvements else 0
        
        return {
            'total_research_claims': len(validations),
            'exceeds_sota': exceeds_count,
            'needs_clarification': status_counts['needs_clarification'],
            'verified': status_counts['likely_valid'],
            'red_flags': status_counts['red_flag'],
            'no_metrics': status_counts['no_metrics'],
            'benchmarks_referenced': benchmarks,
            'avg_sota_improvement': avg_improvement,
            'recommendation': self._get_research_recommendation(status_counts, exceeds_count)
        }
        
    def _get_research_recommendation(self, status_counts: Dict, exceeds_count: int) -> str:
        """
        Generate recommendation based on SOTA verification
        """
        if status_counts['red_flag'] > 0:
            return "Research claims require immediate verification - significant SOTA exceedance without justification"
        elif status_counts['needs_clarification'] > 2:
            return "Multiple research claims need clarification - prepare detailed technical questions"
        elif exceeds_count > 0 and status_counts['likely_valid'] > 0:
            return "Strong research profile with SOTA results - verify with technical deep-dive"
        elif status_counts['no_metrics'] > 0:
            return "Research claims lack quantifiable metrics - request specific performance numbers"
        else:
            return "Research claims appear reasonable - standard technical verification recommended"