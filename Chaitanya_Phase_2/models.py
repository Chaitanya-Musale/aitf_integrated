"""
AI Models and Screening Engine
Integrated with evidence-based scoring algorithms
"""

import google.generativeai as genai
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import json
import re
from datetime import datetime
from config import SystemConfig
from evidence_engine import EvidenceUnit, EvidenceExtractor, RedFlagDetector, PositiveBoosterEngine
from scoring_engine import ScoringEngine

class GeminiScreeningEngine:
    """
    Core AI screening engine with evidence-based algorithms
    """
    
    def __init__(self, api_key):
        """Initialize Gemini API and scoring engines"""
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(SystemConfig.GEMINI_MODEL)
        self.candidates_db = []
        self.scoring_engine = ScoringEngine()
        
    def analyze_candidate(self, resume_text, job_description, additional_context=""):
        """
        Full evidence-based analysis with mathematical rigor
        """
        
        # Step 1: Get AI to extract evidence units (with fallback)
        ai_analysis = self._get_ai_evidence_extraction(resume_text, job_description, additional_context)
        
        if "error" in ai_analysis and "AI extraction failed" not in str(ai_analysis.get('error', '')):
            return ai_analysis
        
        # Step 2: Convert to EvidenceUnit objects
        evidence_units = EvidenceExtractor.extract_from_ai_analysis(
            ai_analysis.get('evidence_units', [])
        )
        
        # If no evidence units or too few, use smart fallback parser
        if len(evidence_units) < 3:
            fallback_units = self._smart_evidence_extraction(resume_text, job_description)
            evidence_units.extend(fallback_units)
        
        # Ensure minimum evidence
        if len(evidence_units) == 0:
            evidence_units = self._create_minimal_evidence(resume_text)
        
        # Step 3: Calculate evidence density
        word_count = len(resume_text.split())
        evidence_density = EvidenceExtractor.calculate_evidence_density(evidence_units, word_count)
        
        # Step 4: Calculate all 11 metrics using our algorithms
        metrics_11 = ScoringEngine.calculate_all_11_metrics(evidence_units)
        
        # Step 5: Detect red flags
        red_flags = RedFlagDetector.detect_red_flags(evidence_units, resume_text)
        
        # Step 6: Apply red flag penalties to SR score
        base_sr_score = metrics_11.get('SR', {}).get('score', 70)
        adjusted_sr_score = RedFlagDetector.apply_red_flag_penalties(base_sr_score, red_flags)
        metrics_11['SR']['score'] = adjusted_sr_score
        
        # Step 7: Calculate positive boosters
        booster_points, boosters_applied = PositiveBoosterEngine.calculate_boosters(evidence_units)
        
        # Step 8: Calculate confidence
        confidence_analysis = ScoringEngine.calculate_confidence(evidence_units, metrics_11, resume_text)
        
        # Step 9: Detect seniority level
        seniority = self._detect_seniority(evidence_units, ai_analysis, resume_text)
        
        # Step 10: Calculate final weighted score
        final_score = ScoringEngine.calculate_final_score(
            metrics_11,
            seniority,
            confidence_analysis['overall_confidence'],
            booster_points
        )
        
        # Step 11: Determine tier
        tier = ScoringEngine.determine_tier(final_score, confidence_analysis['overall_confidence'])
        
        # Step 12: Extract better strengths and concerns
        strengths, concerns = self._extract_strengths_concerns(evidence_units, metrics_11, ai_analysis)
        
        # Step 13: Build complete analysis
        analysis = {
            'candidate_name': self._extract_name(resume_text, ai_analysis),
            'detected_seniority': seniority,
            'seniority_detected': seniority,
            
            'evidence_units': [eu.to_dict() for eu in evidence_units],
            'evidence_density': round(evidence_density, 2),
            'evidence_count': len(evidence_units),
            'word_count': word_count,
            
            'metrics_11': self._format_metrics_11(metrics_11),
            
            'confidence_analysis': confidence_analysis,
            'confidence_score': confidence_analysis['overall_confidence'],
            
            'red_flags': red_flags,
            'red_flag_count': len(red_flags),
            
            'positive_boosters': {
                'points': booster_points,
                'applied': boosters_applied
            },
            
            'final_weighted_score': round(final_score, 2),
            'raw_score_no_confidence': round(final_score / (0.9 + 0.1 * confidence_analysis['overall_confidence']), 2),
            
            'recommendation': {
                'tier': tier,
                'tier_rationale': self._generate_tier_rationale(tier, final_score, confidence_analysis),
                'strengths_summary': strengths,
                'concerns_summary': concerns,
                'what_moved_needle': self._identify_key_factors(metrics_11, booster_points)
            },
            
            'interview_recommendations': {
                'focus_areas': ai_analysis.get('interview_focus_areas', self._generate_interview_focus(metrics_11, seniority)),
                'questions': ai_analysis.get('suggested_questions', [])
            },
            
            'next_steps': self._generate_next_steps(tier, confidence_analysis),
            
            'timestamp': datetime.now().isoformat(),
            'framework_version': 'evidence_based_v2.0_algorithmic',
            
            # Legacy compatibility
            'technical_match_score': metrics_11.get('TDB', {}).get('score', 0),
            'experience_relevance_score': metrics_11.get('XR', {}).get('score', 0),
            'culture_fit_score': (metrics_11.get('LC', {}).get('score', 0) + metrics_11.get('CE', {}).get('score', 0)) / 2,
            'growth_potential_score': metrics_11.get('GA', {}).get('score', 0),
            'overall_recommendation': tier,
            'recommendation_rationale': self._generate_tier_rationale(tier, final_score, confidence_analysis),
            'key_strengths': strengths,
            'key_weaknesses': concerns
        }
        
        # Generate embedding for semantic search
        embedding = self.get_candidate_embedding(resume_text)
        if embedding is not None:
            analysis['embedding'] = embedding.tolist()
        
        self.candidates_db.append(analysis)
        return analysis
    
    def _get_ai_evidence_extraction(self, resume_text, job_description, additional_context):
        """Use AI to extract evidence units"""
        
        # Truncate for API limits
        resume_excerpt = resume_text[:4000]
        job_excerpt = job_description[:1000]
        
        prompt = f"""Analyze this resume and extract evidence as JSON.
JOB DESCRIPTION:
{job_excerpt}
RESUME:
{resume_excerpt}
Extract specific evidence from the resume. For each job, project, skill, or achievement, create an evidence unit.
Return ONLY valid JSON (no markdown, no extra text):
{{
  "candidate_name": "Full Name from Resume",
  "evidence_units": [
    {{
      "type": "role",
      "claim": "Software Engineer at Google",
      "context": "Google, Mountain View, 2020-2023, Built scalable APIs",
      "time": {{"start": 2020, "end": 2023, "months": 36}},
      "org": {{"company": "Google", "industry": "Tech", "size": "Large"}},
      "signals": {{"team_size": "5", "users": "1M"}},
      "seniority_signals": ["led team", "mentored juniors"],
      "credibility_score": 0.8,
      "rationale": "Has company, dates, specific role details"
    }},
    {{
      "type": "project",
      "claim": "Built recommendation engine",
      "context": "Python, TensorFlow, 2022, Improved CTR by 25%",
      "time": {{"start": 2022, "end": 2022, "months": 6}},
      "signals": {{"delta": "25% CTR improvement", "tech": "Python, TensorFlow"}},
      "credibility_score": 0.8,
      "rationale": "Quantified impact with tech stack"
    }},
    {{
      "type": "skill_use",
      "claim": "Expert in Python, JavaScript, React",
      "context": "Used in multiple projects, 5+ years",
      "time": {{"months": 60}},
      "signals": {{"proficiency": "expert"}},
      "credibility_score": 0.6,
      "rationale": "Mentioned multiple times with context"
    }}
  ],
  "key_strengths": ["Strong Python/ML experience", "Proven impact with metrics", "Leadership experience"],
  "key_concerns": ["Limited frontend experience", "Gap in 2021"],
  "interview_focus_areas": ["Deep dive on ML projects", "Leadership style", "System design"],
  "suggested_questions": ["Tell me about the recommendation engine", "How did you measure that 25% improvement?"]
}}
Extract 5-10 evidence units covering roles, projects, skills, achievements. Be specific and thorough."""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    top_p=0.9,
                    top_k=40,
                    max_output_tokens=6000,
                )
            )
            
            # Extract response
            try:
                response_text = response.text
            except ValueError:
                response_text = ""
                for candidate in response.candidates:
                    for part in candidate.content.parts:
                        if hasattr(part, 'text'):
                            response_text += part.text
            
            # Clean and parse
            response_text = self._clean_json_response(response_text)
            
            try:
                parsed = json.loads(response_text)
                
                # Validate we got evidence units
                if parsed.get('evidence_units') and len(parsed['evidence_units']) > 0:
                    return parsed
                else:
                    print("AI returned empty evidence_units, using fallback")
                    return {"candidate_name": parsed.get('candidate_name', 'Unknown'), "evidence_units": []}
                    
            except json.JSONDecodeError as e:
                print(f"JSON parse error: {e}")
                return {"candidate_name": "Unknown", "evidence_units": []}
                
        except Exception as e:
            print(f"AI extraction error: {e}")
            return {"candidate_name": "Unknown", "evidence_units": []}
    
    def _clean_json_response(self, text):
        """Clean JSON response from AI"""
        # Remove markdown
        text = re.sub(r'```json\s*', '', text)
        text = re.sub(r'```\s*', '', text)
        
        # Remove text before first {
        text = re.sub(r'^[^{]*', '', text)
        
        # Remove text after last }
        text = re.sub(r'[^}]*$', '', text)
        
        # Fix trailing commas
        text = re.sub(r',(\s*[}\]])', r'\1', text)
        
        return text.strip()
    
    def _smart_evidence_extraction(self, resume_text, job_description):
        """Smart fallback: extract evidence using regex and heuristics"""
        evidence_units = []
        
        # Extract years of experience mentions
        year_patterns = re.findall(r'(\d+)\+?\s*years?', resume_text, re.IGNORECASE)
        if year_patterns:
            years = max([int(y) for y in year_patterns])
            eu = EvidenceUnit(
                type_='role',
                claim=f'Professional experience: {years}+ years',
                context=f'Stated in resume',
                time_info={'months': years * 12}
            )
            eu.credibility_score = 0.6
            eu.credibility_rationale = "Experience duration stated in resume"
            evidence_units.append(eu)
        
        # Extract skills mentioned
        common_skills = ['Python', 'Java', 'JavaScript', 'React', 'Node', 'AWS', 'Docker', 
                        'Kubernetes', 'SQL', 'MongoDB', 'Machine Learning', 'AI', 'TypeScript',
                        'Angular', 'Vue', 'Django', 'Flask', 'Spring', 'C++', 'C#', 'Go', 'Rust']
        
        skills_found = []
        for skill in common_skills:
            if re.search(r'\b' + re.escape(skill) + r'\b', resume_text, re.IGNORECASE):
                skills_found.append(skill)
        
        if skills_found:
            eu = EvidenceUnit(
                type_='skill_use',
                claim=f'Technical skills: {", ".join(skills_found[:10])}',
                context=f'Mentioned in resume',
                signals={'skills': skills_found}
            )
            eu.credibility_score = 0.7
            eu.credibility_rationale = f"Skills explicitly mentioned: {len(skills_found)} technologies"
            evidence_units.append(eu)
        
        # Extract education
        edu_patterns = [
            r'(Bachelor|B\.?S\.?|B\.?Tech|B\.?E\.?|Master|M\.?S\.?|M\.?Tech|PhD|Ph\.?D\.?).{0,50}(Computer Science|Engineering|CS|Software)',
            r'(IIT|MIT|Stanford|Harvard|Berkeley|CMU|IIIT).{0,30}(Computer|Engineering|CS)'
        ]
        
        for pattern in edu_patterns:
            match = re.search(pattern, resume_text, re.IGNORECASE)
            if match:
                eu = EvidenceUnit(
                    type_='cert',
                    claim=f'Education: {match.group(0)[:100]}',
                    context='Formal education background'
                )
                eu.credibility_score = 0.8
                eu.credibility_rationale = "Educational qualification mentioned"
                evidence_units.append(eu)
                break
        
        # Extract companies/organizations
        company_patterns = re.findall(r'(Google|Microsoft|Amazon|Apple|Facebook|Meta|Netflix|Tesla|IBM|Oracle|Intel|Adobe|Salesforce|Uber|Airbnb|Twitter|LinkedIn)\s*,?\s*(\d{4})?', resume_text, re.IGNORECASE)
        
        for company_match in company_patterns[:3]:
            company = company_match[0]
            year = company_match[1] if company_match[1] else None
            
            eu = EvidenceUnit(
                type_='role',
                claim=f'Experience at {company}',
                context=f'Worked at {company}' + (f' in {year}' if year else ''),
                org_info={'company': company, 'industry': 'Tech', 'size': 'Large'}
            )
            
            if year:
                eu.time = {'start': int(year), 'months': 12}
                eu.credibility_score = 0.8
                eu.credibility_rationale = "Major company with dates"
            else:
                eu.credibility_score = 0.6
                eu.credibility_rationale = "Major company mentioned"
            
            evidence_units.append(eu)
        
        # Extract quantified achievements
        impact_patterns = [
            r'(\d+)%\s*(increase|improvement|reduction|faster|growth)',
            r'(reduced|increased|improved|optimized).{0,30}by\s*(\d+)%',
            r'(\d+)x\s*(faster|better|more|improvement)'
        ]
        
        for pattern in impact_patterns:
            matches = re.findall(pattern, resume_text, re.IGNORECASE)
            for match in matches[:3]:
                eu = EvidenceUnit(
                    type_='impact',
                    claim=f'Quantified impact: {" ".join([str(m) for m in match if m])}',
                    context='Achievement with measurable outcome',
                    signals={'delta': match[0] if len(match) > 0 else 'significant'}
                )
                eu.credibility_score = 0.9
                eu.credibility_rationale = "Quantified impact metric"
                evidence_units.append(eu)
        
        # Extract projects
        project_keywords = ['built', 'developed', 'created', 'designed', 'implemented', 'launched']
        for keyword in project_keywords:
            pattern = rf'{keyword}\s+([^.!?\n]{{30,150}})'
            matches = re.findall(pattern, resume_text, re.IGNORECASE)
            
            for match in matches[:2]:
                eu = EvidenceUnit(
                    type_='project',
                    claim=f'{keyword.title()} {match[:80]}...',
                    context=f'Project work described'
                )
                eu.credibility_score = 0.6
                eu.credibility_rationale = "Project description found"
                evidence_units.append(eu)
        
        # Extract leadership indicators
        leadership_keywords = ['led', 'managed', 'mentored', 'team of', 'supervised', 'coordinated']
        for keyword in leadership_keywords:
            if re.search(r'\b' + keyword + r'\b', resume_text, re.IGNORECASE):
                eu = EvidenceUnit(
                    type_='role',
                    claim=f'Leadership: {keyword} team/individuals',
                    context='Leadership experience indicated',
                    seniority_signals=[keyword]
                )
                eu.credibility_score = 0.6
                eu.credibility_rationale = "Leadership keyword found"
                evidence_units.append(eu)
                break
        
        return evidence_units[:15]  # Limit to 15 evidence units
    
    def _create_minimal_evidence(self, resume_text):
        """Absolute minimal fallback"""
        eu = EvidenceUnit(
            type_='role',
            claim='Professional background indicated',
            context=resume_text[:200],
            time_info={'months': 24}
        )
        eu.credibility_score = 0.4
        eu.credibility_rationale = "Minimal evidence - requires manual review"
        return [eu]
    
    def _extract_name(self, resume_text, ai_analysis):
        """Extract candidate name"""
        ai_name = ai_analysis.get('candidate_name', '')
        
        if ai_name and ai_name != 'Unknown' and len(ai_name) > 2:
            return ai_name
        
        # Try to extract from first line
        lines = [l.strip() for l in resume_text.split('\n') if l.strip()]
        if lines:
            first_line = lines[0]
            # Remove common prefixes
            first_line = re.sub(r'(Resume|CV|Curriculum Vitae)\s*:?\s*', '', first_line, flags=re.IGNORECASE)
            
            # Check if looks like a name (2-5 words, capitalized, no weird chars)
            if re.match(r'^[A-Z][a-z]+(\s+[A-Z][a-z]+){1,3}$', first_line):
                return first_line
        
        # Try email
        email_match = re.search(r'[\w\.-]+@[\w\.-]+', resume_text)
        if email_match:
            email = email_match.group(0)
            name_part = email.split('@')[0]
            return name_part.replace('.', ' ').replace('_', ' ').title()
        
        return "Candidate"
    
    def _detect_seniority(self, evidence_units, ai_analysis, resume_text):
        """Detect seniority level"""
        
        # Count years
        years = []
        for eu in evidence_units:
            if eu.time.get('months'):
                years.append(eu.time['months'] / 12.0)
        
        total_years = sum(years) if years else 0
        
        # Count leadership signals
        leadership_count = sum(1 for eu in evidence_units if eu.seniority_signals)
        
        # Check title keywords
        title_lower = resume_text.lower()
        
        if total_years >= 10 or leadership_count >= 3 or any(kw in title_lower for kw in ['lead', 'staff', 'principal', 'architect', 'director']):
            return 'lead'
        elif total_years >= 5 or leadership_count >= 1 or 'senior' in title_lower:
            return 'senior'
        elif total_years >= 2 or 'engineer' in title_lower:
            return 'mid'
        else:
            return 'junior'
    
    def _extract_strengths_concerns(self, evidence_units, metrics_11, ai_analysis):
        """Extract meaningful strengths and concerns"""
        
        # Get from AI first
        ai_strengths = ai_analysis.get('key_strengths', [])
        ai_concerns = ai_analysis.get('key_concerns', [])
        
        strengths = []
        concerns = []
        
        # Add AI strengths if good
        if ai_strengths and len(ai_strengths) > 0:
            strengths.extend(ai_strengths[:3])
        
        # Add metric-based strengths
        for code, data in metrics_11.items():
            score = data.get('score', 0)
            if score >= 80:
                metric_names = {
                    'TDB': 'Strong technical depth and breadth',
                    'OI': 'Proven track record with quantified impact',
                    'LC': 'Demonstrated leadership and collaboration',
                    'XR': 'Highly relevant experience',
                    'SC': 'Experience with complex systems'
                }
                if code in metric_names and metric_names[code] not in strengths:
                    strengths.append(metric_names[code])
        
        # Add evidence-based strengths
        for eu in evidence_units:
            if eu.credibility_score >= 0.8:
                if eu.type == 'impact' and len(strengths) < 5:
                    strengths.append(f"Measurable achievements: {eu.claim[:60]}")
                elif eu.type == 'role' and 'Major company' not in str(strengths):
                    if eu.org.get('company'):
                        strengths.append(f"Experience at {eu.org['company']}")
        
        # Ensure at least 3 strengths
        if len(strengths) < 3:
            strengths.extend([
                'Relevant professional background',
                'Technical skills aligned with requirements',
                'Clear career progression'
            ])
        
        # Add AI concerns
        if ai_concerns and len(ai_concerns) > 0:
            concerns.extend(ai_concerns[:2])
        
        # Add metric-based concerns
        for code, data in metrics_11.items():
            score = data.get('score', 0)
            if score < 40:
                metric_concerns = {
                    'TDB': 'Limited technical depth in required areas',
                    'OI': 'Lack of quantified impact metrics',
                    'XR': 'Experience may not be directly relevant',
                    'LC': 'Limited leadership experience shown'
                }
                if code in metric_concerns and len(concerns) < 3:
                    concerns.append(metric_concerns[code])
        
        # Ensure at least 2 concerns
        if len(concerns) < 2:
            concerns.extend([
                'Requires verification of key claims',
                'Some gaps in evidence quality'
            ])
        
        return strengths[:5], concerns[:3]
    
    def _generate_interview_focus(self, metrics_11, seniority):
        """Generate interview focus areas based on metrics"""
        focus = []
        
        # Check weak areas
        for code, data in metrics_11.items():
            score = data.get('score', 0)
            if score < 60:
                focus_map = {
                    'TDB': 'Deep dive into technical skills and experience',
                    'OI': 'Verify impact claims with specific examples',
                    'LC': 'Assess leadership and collaboration capabilities',
                    'XR': 'Validate experience relevance and depth'
                }
                if code in focus_map:
                    focus.append(focus_map[code])
        
        # Add seniority-specific focus
        if seniority in ['senior', 'lead']:
            focus.append('System design and architecture discussion')
            focus.append('Leadership philosophy and team management')
        else:
            focus.append('Problem-solving approach and learning ability')
            focus.append('Team collaboration and communication style')
        
        return focus[:5]
    
    def _format_metrics_11(self, metrics_dict):
        """Format metrics for output"""
        formatted = {}
        
        metric_names = {
            'TDB': 'TDB_technical_depth_breadth',
            'XR': 'XR_experience_relevance',
            'OI': 'OI_outcome_impact',
            'SC': 'SC_systems_complexity',
            'DA': 'DA_domain_alignment',
            'LC': 'LC_leadership_collab',
            'CE': 'CE_communication_quality',
            'GA': 'GA_growth_adaptability',
            'SR': 'SR_stability_risk',
            'AC': 'AC_availability',
            'CF': 'CF_compensation_fit'
        }
        
        for code, full_name in metric_names.items():
            formatted[full_name] = metrics_dict.get(code, {'score': 0, 'rationale': 'Not calculated'})
        
        return formatted
    
    def _generate_tier_rationale(self, tier, score, confidence_analysis):
        """Generate tier explanation"""
        if tier == "Fast-Track":
            return f"Outstanding candidate with score {score:.1f}/100 and high confidence ({confidence_analysis['overall_confidence']:.2f}). Strong match across multiple dimensions."
        elif tier == "Advance to Interview":
            return f"Strong candidate with score {score:.1f}/100. Meets requirements with good evidence quality."
        elif tier == "Hold/More Info":
            return f"Moderate fit (score {score:.1f}/100) or insufficient confidence ({confidence_analysis['overall_confidence']:.2f}). Requires additional review or information."
        else:
            return f"Score {score:.1f}/100 below threshold. Significant gaps in requirements or evidence."
    
    def _identify_key_factors(self, metrics_11, booster_points):
        """Identify top factors"""
        sorted_metrics = sorted(metrics_11.items(), key=lambda x: x[1].get('score', 0), reverse=True)
        top_2 = [f"{code}: {data.get('score', 0):.0f}" for code, data in sorted_metrics[:2]]
        
        factors = f"Top metrics: {', '.join(top_2)}"
        
        if booster_points > 0:
            factors += f" | Boosters: +{booster_points} pts"
        
        return factors
    
    def _generate_next_steps(self, tier, confidence_analysis):
        """Generate next steps"""
        if tier == "Fast-Track":
            return "Schedule technical interview immediately. Prioritize in pipeline."
        elif tier == "Advance to Interview":
            return "Move to standard interview process. Review key strengths beforehand."
        elif tier == "Hold/More Info":
            if confidence_analysis['overall_confidence'] < 0.5:
                return "Request additional information or clarification before proceeding."
            else:
                return "Hold for now. Consider for future roles or if pipeline is light."
        else:
            return "Thank and archive. Does not meet minimum requirements."
    
    # ========================================================================
    # HYBRID SEARCH: SEMANTIC + KEYWORD FALLBACK
    # ========================================================================
    
    def get_candidate_embedding(self, resume_text):
        """Generate vector embedding for semantic search"""
        try:
            # Truncate text to avoid token limits
            text_excerpt = resume_text[:2000]
            
            result = genai.embed_content(
                model=SystemConfig.EMBEDDING_MODEL,
                content=text_excerpt,
                task_type="retrieval_document"
            )
            
            embedding = np.array(result['embedding'])
            print(f"✓ Generated embedding with {len(embedding)} dimensions")
            return embedding
            
        except Exception as e:
            print(f"⚠️ Embedding generation failed: {e}")
            return None
    
    def search_candidates(self, query, top_k=5):
        """
        Hybrid search: Semantic (embedding-based) + Keyword fallback
        """
        if not self.candidates_db:
            return "❌ No candidates in database yet. Analyze some candidates first!"
        
        print(f"🔍 Searching for: '{query}' across {len(self.candidates_db)} candidates")
        
        # Try semantic search first
        semantic_results = self._semantic_search(query, top_k)
        
        # If semantic search fails or returns nothing, use keyword search
        if not semantic_results:
            print("⚠️ Semantic search failed, using keyword fallback")
            keyword_results = self._keyword_search(query, top_k)
            return self._format_search_results(keyword_results, query, search_type="keyword")
        
        return self._format_search_results(semantic_results, query, search_type="semantic")
    
    def _semantic_search(self, query, top_k=5):
        """Semantic search using embeddings"""
        try:
            # Get query embedding
            query_result = genai.embed_content(
                model=SystemConfig.EMBEDDING_MODEL,
                content=query,
                task_type="retrieval_query"
            )
            query_embedding = np.array(query_result['embedding']).reshape(1, -1)
            
            results = []
            candidates_with_embeddings = 0
            
            for idx, candidate in enumerate(self.candidates_db):
                if 'embedding' in candidate:
                    candidates_with_embeddings += 1
                    candidate_embedding = np.array(candidate['embedding']).reshape(1, -1)
                    similarity = cosine_similarity(query_embedding, candidate_embedding)[0][0]
                    
                    # Lowered threshold from 0.75 to 0.5 for better results
                    if similarity >= 0.5:
                        results.append({
                            'candidate_index': idx + 1,
                            'candidate_name': candidate.get('candidate_name', 'Unknown'),
                            'final_score': candidate.get('final_weighted_score', 0),
                            'recommendation': candidate.get('overall_recommendation', 'N/A'),
                            'similarity_score': round(similarity * 100, 2),
                            'seniority': candidate.get('seniority_detected', 'N/A'),
                            'evidence_count': candidate.get('evidence_count', 0)
                        })
            
            print(f"✓ Semantic search: {candidates_with_embeddings} candidates with embeddings, {len(results)} matches found")
            
            # Sort by similarity
            results.sort(key=lambda x: x['similarity_score'], reverse=True)
            return results[:top_k]
            
        except Exception as e:
            print(f"⚠️ Semantic search error: {e}")
            return None
    
    def _keyword_search(self, query, top_k=5):
        """Keyword-based fallback search"""
        query_lower = query.lower()
        query_terms = set(re.findall(r'\w+', query_lower))
        
        results = []
        
        for idx, candidate in enumerate(self.candidates_db):
            # Search in candidate name, evidence units, strengths
            searchable_text = ""
            searchable_text += candidate.get('candidate_name', '').lower() + " "
            searchable_text += str(candidate.get('key_strengths', [])).lower() + " "
            searchable_text += str(candidate.get('seniority_detected', '')).lower() + " "
            
            # Add evidence unit claims
            for eu in candidate.get('evidence_units', []):
                searchable_text += eu.get('claim', '').lower() + " "
                searchable_text += eu.get('context', '').lower() + " "
            
            # Count matching terms
            searchable_terms = set(re.findall(r'\w+', searchable_text))
            matches = len(query_terms.intersection(searchable_terms))
            
            if matches > 0:
                # Calculate match percentage
                match_pct = (matches / len(query_terms)) * 100
                
                results.append({
                    'candidate_index': idx + 1,
                    'candidate_name': candidate.get('candidate_name', 'Unknown'),
                    'final_score': candidate.get('final_weighted_score', 0),
                    'recommendation': candidate.get('overall_recommendation', 'N/A'),
                    'similarity_score': round(match_pct, 2),
                    'seniority': candidate.get('seniority_detected', 'N/A'),
                    'evidence_count': candidate.get('evidence_count', 0),
                    'matched_terms': matches
                })
        
        print(f"✓ Keyword search: {len(results)} matches found")
        
        # Sort by match percentage
        results.sort(key=lambda x: (x['similarity_score'], x['final_score']), reverse=True)
        return results[:top_k]
    
    def _format_search_results(self, results, query, search_type="semantic"):
        """Format search results for display"""
        if not results:
            return f"""### 🔍 Search Results for: "{query}"
**No matches found.** Try:
- Using different keywords
- Being more general (e.g., "Python developer" instead of "Senior Python Django developer with 5+ years")
- Checking if you've analyzed any candidates yet
"""
        
        search_method = "🎯 Semantic Search" if search_type == "semantic" else "🔤 Keyword Search"
        
        output = f"""### 🔍 Search Results for: "{query}"
**{search_method}** | Found {len(results)} match(es)
---
"""
        
        for i, r in enumerate(results, 1):
            output += f"""**#{i}. {r['candidate_name']}** 
- 📊 **Score:** {r['final_score']:.1f}/100
- 🎯 **Match:** {r['similarity_score']:.1f}% 
- 🏆 **Tier:** {r['recommendation']}
- 💼 **Level:** {r['seniority'].title()}
- 📝 **Evidence:** {r['evidence_count']} units
{f"- 🔑 **Matched Terms:** {r['matched_terms']}" if 'matched_terms' in r else ''}
"""
        
        if search_type == "keyword":
            output += "\n💡 *Tip: Keyword search was used. For better results, ensure embeddings are working properly.*\n"
        
        return output
    
    # ========================================================================
    # SESSION STATISTICS
    # ========================================================================
    
    def get_session_statistics(self):
        """Session stats"""
        if not self.candidates_db:
            return "No candidates analyzed yet."
        
        scores = [c.get('final_weighted_score', 0) for c in self.candidates_db]
        
        fast_track = sum(1 for s in scores if s >= SystemConfig.TIER_FAST_TRACK)
        interview = sum(1 for s in scores if SystemConfig.TIER_INTERVIEW <= s < SystemConfig.TIER_FAST_TRACK)
        hold = sum(1 for s in scores if SystemConfig.TIER_HOLD <= s < SystemConfig.TIER_INTERVIEW)
        no_go = sum(1 for s in scores if s < SystemConfig.TIER_HOLD)
        
        total = len(self.candidates_db)
        
        result = "### Session Statistics\n\n"
        result += f"**Total:** {total}\n\n"
        result += f"- 🚀 Fast-Track: {fast_track}\n"
        result += f"- ✅ Interview: {interview}\n"
        result += f"- ⚠️ Hold: {hold}\n"
        result += f"- ❌ No-Go: {no_go}\n\n"
        result += f"**Avg Score:** {np.mean(scores):.1f}/100\n"
        result += f"**Range:** {min(scores):.1f} - {max(scores):.1f}\n"
        
        return result