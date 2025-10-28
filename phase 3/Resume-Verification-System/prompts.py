"""
Prompt templates for Gemini Flash 2.5 API interactions
Temperature settings and structured prompts for different analysis stages
"""

CLAIM_EXTRACTION_PROMPT = """
You are an expert technical recruiter analyzing a CV for factual claims and credibility.
Temperature: 0.1 for precision

Section Type: {section_type}
Section Text: {section_text}
Seniority Level: {seniority_level}

Task: Extract ALL factual claims with extreme precision. Focus on:

1. Work Experience Claims:
   - Job titles, companies, dates, team sizes
   - Specific responsibilities and technologies used
   - Quantifiable achievements (metrics, percentages, timelines)
   - Leadership/architectural claims

2. Project Claims:
   - Project names, descriptions, outcomes
   - Technical stack used, deployment status
   - Team role and contribution level
   - Measurable results (users, performance gains, cost savings)

3. Skills Claims (EXCLUDING EDUCATION):
   - Programming languages with proficiency levels
   - Frameworks, tools, platforms
   - Certifications with dates
   - Domain expertise claims

4. Research/Publication Claims:
   - Paper titles, conference venues, citations
   - SOTA claims with specific metrics
   - Patents, open-source contributions

Output JSON format:
{{
  "claims": [
    {{
      "claim_id": "unique_id",
      "claim_text": "exact text from CV",
      "category": "work_experience|project|skill|research",
      "subcategory": "specific_type",
      "quantifiable_metrics": ["list of numbers/percentages/dates"],
      "technologies_mentioned": ["tech1", "tech2"],
      "time_period": {{
        "start_date": "YYYY-MM or null",
        "end_date": "YYYY-MM or null",
        "duration_months": "number or null"
      }},
      "seniority_claim": "junior|mid|senior|lead|architect|none",
      "verifiability_level": "high|medium|low",
      "evidence_present": "direct|contextual|none",
      "links_artifacts": ["URLs if any"],
      "needs_clarification": ["specific points to verify"]
    }}
  ],
  "metadata": {{
    "total_claims": "number",
    "buzzword_density": "0.0-1.0",
    "specificity_score": "0.0-1.0"
  }}
}}

IMPORTANT: 
- Extract ONLY explicit claims, not inferences
- Mark vague claims ("worked on cutting-edge AI") with low verifiability
- Flag role-achievement mismatches for interview
- Note if metrics seem unrealistic for timeframe
- Skip education verification completely
"""

EVIDENCE_VALIDATION_PROMPT = """
You are validating evidence for CV claims.
Temperature: 0.2 for balanced analysis

Claims to validate:
{claims_json}

Full CV text for cross-reference:
{full_cv_text}

For EACH claim, assess:

1. Direct Evidence:
   - Links to repositories, portfolios, demos (check if provided)
   - Certificates, publications (with identifiers)
   - Company/project websites mentioned

2. Contextual Evidence:
   - Technical depth in descriptions
   - Specific tool versions, configurations
   - Problem-solution narratives with details

3. Cross-Section Validation:
   - Skills mentioned MUST appear in at least one project/work
   - Dates must be consistent across sections
   - Technologies should align with timeframes (no React before 2013)

4. Metric Sanity:
   - Is "500% growth in 1 month" realistic?
   - Do team sizes match achievement scope?
   - Are research metrics within known SOTA bounds?

Output JSON:
{{
  "validations": [
    {{
      "claim_id": "from_input",
      "evidence_score": 0.0-1.0,
      "evidence_type": "direct|contextual|cross_referenced|missing",
      "supporting_sections": ["list of CV sections with evidence"],
      "artifacts_found": [
        {{
          "type": "github|publication|certificate|website",
          "url": "if_present",
          "needs_verification": true/false
        }}
      ],
      "cross_validation": {{
        "skill_used_in_project": true/false,
        "dates_consistent": true/false,
        "tech_timeline_valid": true/false
      }},
      "metric_analysis": {{
        "realistic": true/false,
        "explanation": "why realistic or not"
      }},
      "triangulation_result": "verified|partial|unverified|red_flag"
    }}
  ],
  "consistency_score": 0.0-1.0
}}
"""

RED_FLAG_DETECTION_PROMPT = """
You are detecting credibility red flags in CV claims.
Temperature: 0.2 for pattern detection

Analyzed claims with validation:
{validated_claims_json}

Seniority Level: {seniority_level}
Role Type: {role_type}

Detect these RED FLAGS:

1. Role-Achievement Mismatch:
   - "Led/Architected" in junior roles or <6 month tenure
   - Senior achievements with entry-level titles
   - Sole credit for large team projects

2. Timeline Issues:
   - Overlapping full-time positions
   - Technologies used before public release
   - Impossibly short project durations for scope

3. Metric Implausibility:
   - Extreme percentages without context (500%+ improvements)
   - SOTA claims exceeding published benchmarks
   - Unrealistic user numbers or scale claims

4. Vagueness Patterns:
   - High buzzword density without specifics
   - Missing metrics on all achievements
   - No technical depth for "expert" claims

5. Over-claiming:
   - Too many "expert" level skills (>15)
   - All projects "successful" with no challenges
   - Pattern of superlatives without evidence

Output JSON:
{{
  "red_flags": [
    {{
      "flag_id": "unique_id",
      "severity": "critical|high|medium|low",
      "category": "timeline|implausible|vague|overclaim|mismatch",
      "affected_claims": ["claim_ids"],
      "description": "specific issue",
      "interview_probe": "suggested question to clarify",
      "auto_reject": false,
      "requires_proof": true/false
    }}
  ],
  "credibility_score": 0-100,
  "seniority_adjustment": "applied adjustment based on level",
  "risk_assessment": "low|medium|high|critical"
}}
"""

SOTA_VERIFICATION_PROMPT = """
You are verifying research and technical achievement claims against known benchmarks.
Temperature: 0.1 for factual accuracy

Research/Technical claims:
{research_claims_json}

Verify against known SOTA (State-of-the-Art) as of {current_date}:

For each claim:
1. Identify the benchmark/dataset/metric
2. Check if numbers exceed published SOTA
3. Look for required context (dataset, conditions, hardware)
4. Assess if improvement magnitude is plausible

Known SOTA baselines to reference:
- ImageNet accuracy: ~92% (2024)
- BERT-base F1 on SQUAD: ~93%
- GPT-3 perplexity: varies by dataset
- Object detection mAP: ~60-65% on COCO

Output JSON:
{{
  "sota_validations": [
    {{
      "claim_id": "from_input",
      "benchmark": "identified benchmark/dataset",
      "claimed_metric": "number",
      "known_sota": "published baseline",
      "exceeds_sota": true/false,
      "has_context": true/false,
      "missing_details": ["dataset", "evaluation protocol", "hardware"],
      "plausibility": "plausible|unlikely|impossible",
      "verification_status": "needs_clarification|likely_valid|red_flag",
      "interview_questions": ["specific technical questions"]
    }}
  ]
}}
"""

REPOSITORY_ANALYSIS_PROMPT = """
Analyze repository evidence for verification.
Temperature: 0.1

Repository URL: {repo_url}
Repository metrics: {repo_metrics}
Claimed contributions: {claimed_contributions}

Assess:
1. Commit density and authorship
2. First commit vs claim date alignment  
3. README quality and documentation depth
4. Issues/PRs linked to claimed features
5. Code complexity matching claimed scope
6. Dependencies matching claimed tech stack

Output credibility score and specific findings.
"""

# Scoring calibration parameters
SCORING_CONFIG = {
    "weights": {
        "credibility": 0.6,
        "consistency": 0.4
    },
    "seniority_thresholds": {
        "senior": {
            "min_evidence_score": 0.7,
            "max_buzzword_density": 0.2,
            "min_specificity": 0.8
        },
        "mid": {
            "min_evidence_score": 0.5,
            "max_buzzword_density": 0.3,
            "min_specificity": 0.6
        },
        "junior": {
            "min_evidence_score": 0.3,
            "max_buzzword_density": 0.4,
            "min_specificity": 0.4
        },
        "intern": {
            "min_evidence_score": 0.2,
            "max_buzzword_density": 0.5,
            "min_specificity": 0.3
        }
    },
    "evidence_tier_weights": {
        "doi_arxiv": 1.0,
        "github_active": 0.9,
        "company_blog": 0.8,
        "personal_blog": 0.6,
        "no_artifact": 0.3
    },
    "red_flag_severity_scores": {
        "critical": -30,
        "high": -20,
        "medium": -10,
        "low": -5
    }
}

# Bias mitigation configuration
FAIRNESS_CONFIG = {
    "protected_attributes": [
        "school", "university", "college", "age", "gender", 
        "nationality", "ethnicity", "religion", "marital status"
    ],
    "pii_patterns": {
        "phone": r"\+?[\d\s\-\(\)]+",
        "email": r"[\w\.-]+@[\w\.-]+\.\w+",
        "address": r"\d+\s+[\w\s,]+\d{5}",
        "ssn": r"\d{3}-\d{2}-\d{4}"
    }
}

# Interview question templates
INTERVIEW_TEMPLATES = {
    "unverified_claim": "You mentioned {claim}. Can you provide more details about {specific_aspect}?",
    "metric_clarification": "You achieved {metric}. What was the baseline and methodology?",
    "timeline_gap": "Can you walk me through your activities between {start} and {end}?",
    "tech_depth": "You listed {technology} expertise. Can you describe a specific challenge you solved with it?",
    "sole_credit": "You mentioned {achievement}. Who else was involved and what was your specific contribution?",
    "sota_claim": "Your research shows {metric} performance. How does this compare to published baselines?"
}