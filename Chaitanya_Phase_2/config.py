"""
Configuration file for AI Screening System
Research-grade evidence-based framework
"""

class SystemConfig:
    """System configuration - all tunable parameters"""
    
    # ========== GEMINI AI CONFIGURATION ==========
    GEMINI_MODEL = "gemini-2.5-flash"
    GEMINI_TEMPERATURE = 0.3
    GEMINI_TOP_P = 0.95
    GEMINI_TOP_K = 40
    GEMINI_MAX_TOKENS = 8192
    
    # ========== EMBEDDING CONFIGURATION ==========
    EMBEDDING_MODEL = "models/text-embedding-004"
    EMBEDDING_DIMENSION = 768
    SIMILARITY_THRESHOLD = 0.75
    
    # ========== TIER THRESHOLDS ==========
    TIER_FAST_TRACK = 85
    TIER_INTERVIEW = 75
    TIER_HOLD = 60
    MIN_CONFIDENCE_FAST_TRACK = 0.7
    MIN_CONFIDENCE_INTERVIEW = 0.5
    
    # ========== 11-METRIC WEIGHTS BY SENIORITY ==========
    # Based on research framework - each row sums to 100
    SENIORITY_WEIGHTS = {
        'junior': {
            'TDB': 15, 'XR': 10, 'OI': 8, 'SC': 5,
            'DA': 5, 'LC': 6, 'CE': 6, 'GA': 8,
            'SR': 3, 'AC': 2, 'CF': 2
        },
        'mid': {
            'TDB': 22, 'XR': 15, 'OI': 12, 'SC': 8,
            'DA': 6, 'LC': 7, 'CE': 5, 'GA': 5,
            'SR': 6, 'AC': 3, 'CF': 2
        },
        'senior': {
            'TDB': 28, 'XR': 16, 'OI': 14, 'SC': 10,
            'DA': 6, 'LC': 8, 'CE': 4, 'GA': 4,
            'SR': 7, 'AC': 3, 'CF': 1
        },
        'lead': {
            'TDB': 30, 'XR': 15, 'OI': 16, 'SC': 12,
            'DA': 5, 'LC': 12, 'CE': 3, 'GA': 4,
            'SR': 7, 'AC': 3, 'CF': 3
        }
    }
    
    # ========== CREDIBILITY SCORING ==========
    CREDIBILITY_EXTERNAL_VERIFIABLE = 1.0
    CREDIBILITY_QUANTIFIED_WITH_CONTEXT = 0.8
    CREDIBILITY_DESCRIPTIVE_PLAUSIBLE = 0.6
    CREDIBILITY_GENERIC_CLAIM = 0.3
    CREDIBILITY_UNVERIFIABLE = 0.0
    
    # ========== DIMINISHING RETURNS PARAMETERS ==========
    SIGMOID_MU = 50  # Median score target
    SIGMOID_SIGMA = 15  # Spread control
    EU_CONTRIBUTION_CAP = 0.25  # Max 25% from single EU
    
    # ========== RECENCY DECAY ==========
    RECENCY_DECAY_TAU_SKILLS = 36  # months
    RECENCY_DECAY_TAU_CERTS = 24  # months
    
    # ========== EVIDENCE DENSITY ==========
    EVIDENCE_DENSITY_EPSILON = 0.1
    MIN_EVIDENCE_THRESHOLD = 2  # Min EUs per metric for coverage
    
    # ========== CONFIDENCE CALCULATION ==========
    CONFIDENCE_ALPHA = 0.4  # Weight for avg credibility
    CONFIDENCE_BETA = 0.4   # Weight for coverage ratio
    CONFIDENCE_GAMMA = 0.2  # Weight for consistency
    
    # ========== RED FLAG DETECTION ==========
    MAX_JOB_GAP_MONTHS = 6
    MAX_JOB_CHANGES_3YEARS = 4
    MIN_JOB_DURATION_MONTHS = 6
    
    RED_FLAG_PENALTIES = {
        'high': 0.50,    # Reduce risk score by 50%
        'medium': 0.30,  # Reduce risk score by 30%
        'low': 0.10      # Reduce risk score by 10%
    }
    
    # ========== POSITIVE BOOSTERS ==========
    BOOSTER_AWARD = 5
    BOOSTER_PATENT = 5
    BOOSTER_MAJOR_OSS = 3
    BOOSTER_PUBLICATION = 4
    BOOSTER_CAP = 15  # Max total boost
    
    # ========== SPECIAL CASE KEYWORDS ==========
    CAREER_BREAK_INDICATORS = [
        'education', 'study', 'degree', 'university', 'college',
        'caregiving', 'family', 'parental leave', 'sabbatical',
        'relocation', 'visa', 'immigration'
    ]
    
    FREELANCE_INDICATORS = [
        'freelance', 'contractor', 'consultant', 'independent',
        'contract', 'self-employed', 'consulting'
    ]
    
    LAYOFF_INDICATORS = [
        'layoff', 'downsizing', 'restructuring', 'company closure',
        'acquisition', 'merger', 'pandemic'
    ]
    
    @classmethod
    def get_config_display(cls):
        """Returns formatted configuration for UI display"""
        return f"""
### 🔧 System Configuration (Evidence-Based Framework v2.0)
**AI Model:**
- Model: `{cls.GEMINI_MODEL}`
- Temperature: {cls.GEMINI_TEMPERATURE}
- Max Tokens: {cls.GEMINI_MAX_TOKENS:,}
**11-Metric Weights by Seniority:**
| Metric | Junior | Mid | Senior | Lead |
|--------|--------|-----|--------|------|
| TDB    | {cls.SENIORITY_WEIGHTS['junior']['TDB']} | {cls.SENIORITY_WEIGHTS['mid']['TDB']} | {cls.SENIORITY_WEIGHTS['senior']['TDB']} | {cls.SENIORITY_WEIGHTS['lead']['TDB']} |
| XR     | {cls.SENIORITY_WEIGHTS['junior']['XR']} | {cls.SENIORITY_WEIGHTS['mid']['XR']} | {cls.SENIORITY_WEIGHTS['senior']['XR']} | {cls.SENIORITY_WEIGHTS['lead']['XR']} |
| OI     | {cls.SENIORITY_WEIGHTS['junior']['OI']} | {cls.SENIORITY_WEIGHTS['mid']['OI']} | {cls.SENIORITY_WEIGHTS['senior']['OI']} | {cls.SENIORITY_WEIGHTS['lead']['OI']} |
**Tier Thresholds:**
- 🚀 Fast-Track: ≥{cls.TIER_FAST_TRACK} (conf ≥{cls.MIN_CONFIDENCE_FAST_TRACK})
- ✅ Interview: ≥{cls.TIER_INTERVIEW}
- ⚠️ Hold: {cls.TIER_HOLD}-{cls.TIER_INTERVIEW-1}
- ❌ No-Go: <{cls.TIER_HOLD}
**Mathematical Rigor:**
- ✓ Sigmoid diminishing returns (μ={cls.SIGMOID_MU}, σ={cls.SIGMOID_SIGMA})
- ✓ Recency decay (τ_skills={cls.RECENCY_DECAY_TAU_SKILLS}, τ_certs={cls.RECENCY_DECAY_TAU_CERTS} months)
- ✓ Evidence density normalization
- ✓ Outlier capping (max {cls.EU_CONTRIBUTION_CAP*100:.0f}% per EU)
- ✓ Confidence = {cls.CONFIDENCE_ALPHA}×cred + {cls.CONFIDENCE_BETA}×coverage + {cls.CONFIDENCE_GAMMA}×consistency
**Red Flag Detection:**
- Job gaps >{cls.MAX_JOB_GAP_MONTHS} months
- Job changes >{cls.MAX_JOB_CHANGES_3YEARS} in 3 years
- Short tenures <{cls.MIN_JOB_DURATION_MONTHS} months
- Context-aware penalties (career breaks, freelance, layoffs handled fairly)
**Positive Boosters:**
- Awards: +{cls.BOOSTER_AWARD} | Patents: +{cls.BOOSTER_PATENT}
- Major OSS: +{cls.BOOSTER_MAJOR_OSS} | Publications: +{cls.BOOSTER_PUBLICATION}
- Total cap: {cls.BOOSTER_CAP} points
"""