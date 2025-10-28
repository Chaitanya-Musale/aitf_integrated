"""
Utility functions for document parsing and formatting
"""

import PyPDF2
import docx
from datetime import datetime

class DocumentParser:
    """Handles document parsing for multiple file formats"""
    
    @staticmethod
    def extract_text_from_pdf(file):
        """Extract text from PDF file"""
        try:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            return text.strip()
        except Exception as e:
            return f"❌ Error reading PDF: {str(e)}"
    
    @staticmethod
    def extract_text_from_docx(file):
        """Extract text from DOCX file"""
        try:
            doc = docx.Document(file)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            return text.strip()
        except Exception as e:
            return f"❌ Error reading DOCX: {str(e)}"
    
    @staticmethod
    def extract_text_from_txt(file):
        """Extract text from TXT file"""
        try:
            content = file.read()
            if isinstance(content, bytes):
                return content.decode('utf-8').strip()
            return content.strip()
        except Exception as e:
            return f"❌ Error reading TXT: {str(e)}"
    
    @classmethod
    def parse_resume(cls, file):
        """Universal resume parser - supports PDF, DOCX, TXT"""
        if file is None:
            return "⚠️ No file uploaded"
        
        file_name = file.name.lower()
        
        if file_name.endswith('.pdf'):
            return cls.extract_text_from_pdf(file)
        elif file_name.endswith('.docx'):
            return cls.extract_text_from_docx(file)
        elif file_name.endswith('.txt'):
            return cls.extract_text_from_txt(file)
        else:
            return "❌ Unsupported format. Please upload PDF, DOCX, or TXT."


class HTMLFormatter:
    """HTML formatting utilities for analysis display"""
    
    @staticmethod
    def format_analysis_html(analysis):
        """Create comprehensive HTML report with evidence-based framework"""
        
        if "error" in analysis:
            return f"""
            <div style="background: #fee; border-left: 4px solid #c00; padding: 20px; border-radius: 8px;">
                <h3 style="color: #c00; margin-top: 0;">❌ Analysis Error</h3>
                <p><strong>Error:</strong> {analysis.get('error', 'Unknown error')}</p>
                {('<p><strong>Hint:</strong> ' + analysis.get('hint', '') + '</p>') if 'hint' in analysis else ''}
            </div>
            """
        
        # Get recommendation
        rec = analysis.get('recommendation', {})
        tier = rec.get('tier', analysis.get('overall_recommendation', 'Unknown'))
        confidence = analysis.get('confidence_score', analysis.get('confidence_analysis', {}).get('overall_confidence', 0))
        
        tier_colors = {
            "Fast-Track": "#10b981",
            "Advance to Interview": "#3b82f6",
            "Hold/More Info": "#f59e0b",
            "No-Go": "#ef4444",
            "Strong Match": "#10b981",
            "Potential Match": "#f59e0b"
        }
        tier_color = tier_colors.get(tier, "#6b7280")
        
        # Get metrics
        metrics = analysis.get('metrics_11', {})
        
        # Get boosters
        boosters = analysis.get('positive_boosters', {})
        booster_points = boosters.get('points', 0)
        
        html = f"""
        <div style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
                <h2 style="margin: 0; color: #111827;">
                    👤 {analysis.get('candidate_name', 'Candidate Analysis')}
                </h2>
                <div style="display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap;">
                    <span style="color: #6b7280; font-size: 14px;">
                        📅 {datetime.now().strftime('%B %d, %Y at %I:%M %p')}
                    </span>
                    <span style="color: #6b7280; font-size: 14px;">
                        🎯 Seniority: {analysis.get('seniority_detected', analysis.get('detected_seniority', 'N/A')).title()}
                    </span>
                    <span style="color: #6b7280; font-size: 14px;">
                        📊 Framework: {analysis.get('framework_version', 'v2.0')}
                    </span>
                    <span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                        ✓ Evidence-Based Algorithms
                    </span>
                </div>
            </div>
            
            <!-- Final Score & Tier -->
            <div style="background: linear-gradient(135deg, {tier_color}15 0%, {tier_color}05 100%); 
                        border-left: 4px solid {tier_color}; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                    <div style="flex: 1;">
                        <h3 style="margin: 0; color: {tier_color}; font-size: 24px;">{tier}</h3>
                        <p style="margin: 8px 0 0 0; color: #374151;">
                            {rec.get('tier_rationale', analysis.get('recommendation_rationale', 'No explanation provided'))}
                        </p>
                        <div style="margin-top: 12px; display: flex; gap: 16px; flex-wrap: wrap;">
                            <span style="background: white; padding: 6px 12px; border-radius: 6px; font-size: 13px;">
                                📊 Raw Score: {analysis.get('raw_score_no_confidence', analysis.get('final_weighted_score', 0)):.1f}
                            </span>
                            <span style="background: white; padding: 6px 12px; border-radius: 6px; font-size: 13px;">
                                ✅ Confidence: {confidence:.2f}
                            </span>
                            {(f'<span style="background: white; padding: 6px 12px; border-radius: 6px; font-size: 13px;">🌟 Boosters: +{booster_points}</span>') if booster_points > 0 else ''}
                            <span style="background: white; padding: 6px 12px; border-radius: 6px; font-size: 13px;">
                                📝 Evidence: {analysis.get('evidence_count', 0)} units ({analysis.get('evidence_density', 0):.2f}/1k words)
                            </span>
                        </div>
                    </div>
                    <div style="text-align: center; min-width: 120px;">
                        <div style="font-size: 48px; font-weight: bold; color: {tier_color};">
                            {analysis.get('final_weighted_score', 0):.1f}
                        </div>
                        <div style="font-size: 14px; color: #6b7280;">Final Score</div>
                    </div>
                </div>
            </div>
            
            <!-- Key Factors -->
            <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                <h4 style="margin: 0 0 8px 0; color: #1e40af;">🎯 What Moved the Needle</h4>
                <p style="margin: 0; color: #374151; font-weight: 500;">
                    {rec.get('what_moved_needle', 'Analysis based on evidence quality and metric scores')}
                </p>
            </div>
            
            <!-- 11-Metric Breakdown -->
            <div style="margin-bottom: 24px;">
                <h3 style="color: #111827; margin: 0 0 16px 0;">📊 11-Metric Evidence-Based Scoring</h3>
                
                <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                    <div style="background: #f9fafb; padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">
                        <span style="display: inline-block; width: 40%;">Core Fit (60%)</span>
                        <span>Score</span>
                    </div>
                    
                    {HTMLFormatter._format_metric_row('TDB', 'Technical Depth & Breadth', metrics.get('TDB_technical_depth_breadth', {}))}
                    {HTMLFormatter._format_metric_row('XR', 'Experience Relevance', metrics.get('XR_experience_relevance', {}))}
                    {HTMLFormatter._format_metric_row('OI', 'Outcome & Impact', metrics.get('OI_outcome_impact', {}))}
                    {HTMLFormatter._format_metric_row('SC', 'Systems Complexity', metrics.get('SC_systems_complexity', {}))}
                    
                    <div style="background: #f9fafb; padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; margin-top: 8px;">
                        <span style="display: inline-block; width: 40%;">Context Fit (25%)</span>
                        <span>Score</span>
                    </div>
                    
                    {HTMLFormatter._format_metric_row('DA', 'Domain Alignment', metrics.get('DA_domain_alignment', {}))}
                    {HTMLFormatter._format_metric_row('LC', 'Leadership & Collaboration', metrics.get('LC_leadership_collab', {}))}
                    {HTMLFormatter._format_metric_row('CE', 'Communication & Evidence', metrics.get('CE_communication_quality', {}))}
                    {HTMLFormatter._format_metric_row('GA', 'Growth & Adaptability', metrics.get('GA_growth_adaptability', {}))}
                    
                    <div style="background: #f9fafb; padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: bold; margin-top: 8px;">
                        <span style="display: inline-block; width: 40%;">Risk & Logistics (15%)</span>
                        <span>Score</span>
                    </div>
                    
                    {HTMLFormatter._format_metric_row('SR', 'Stability & Risk', metrics.get('SR_stability_risk', {}))}
                    {HTMLFormatter._format_metric_row('AC', 'Availability', metrics.get('AC_availability', {}))}
                    {HTMLFormatter._format_metric_row('CF', 'Compensation Fit', metrics.get('CF_compensation_fit', {}))}
                </div>
                
                <div style="margin-top: 12px; padding: 12px; background: #f0fdf4; border-radius: 6px; font-size: 13px; color: #166534;">
                    <strong>✓ Algorithmic Features Applied:</strong> Sigmoid diminishing returns • Recency decay • Evidence density normalization • Outlier capping • Confidence adjustment
                </div>
            </div>
            
            <!-- Confidence Analysis -->
            {HTMLFormatter._format_confidence_section(analysis.get('confidence_analysis', {}))}
            
            <!-- Evidence Units (Top 5) -->
            {HTMLFormatter._format_evidence_units(analysis.get('evidence_units', [])[:5])}
            
            <!-- Positive Boosters -->
            {HTMLFormatter._format_positive_boosters(boosters)}
            
            <!-- Strengths & Concerns -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                <div>
                    <h4 style="color: #10b981; margin: 0 0 12px 0;">✅ Key Strengths</h4>
                    <ul style="margin: 0; padding-left: 20px; color: #374151;">
                        {''.join([f'<li style="margin-bottom: 8px;">{s}</li>' for s in (rec.get('strengths_summary', analysis.get('key_strengths', [])))])}
                    </ul>
                </div>
                <div>
                    <h4 style="color: #ef4444; margin: 0 0 12px 0;">⚠️ Areas of Concern</h4>
                    <ul style="margin: 0; padding-left: 20px; color: #374151;">
                        {''.join([f'<li style="margin-bottom: 8px;">{w}</li>' for w in (rec.get('concerns_summary', analysis.get('key_weaknesses', [])))])}
                    </ul>
                </div>
            </div>
            
            <!-- Red Flags -->
            {HTMLFormatter._format_red_flags(analysis.get('red_flags', []))}
            
            <!-- Interview Recommendations -->
            {HTMLFormatter._format_interview_section(analysis.get('interview_recommendations', analysis.get('interview_focus_areas', [])))}
            
            <!-- Next Steps -->
            <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; border-radius: 8px;">
                <h4 style="margin: 0 0 8px 0; color: #10b981;">🎯 Recommended Next Steps</h4>
                <p style="margin: 0; color: #374151; font-weight: 500;">
                    {analysis.get('next_steps', rec.get('decision', 'Review and decide'))}
                </p>
            </div>
            
        </div>
        """
        
        return html
    
    @staticmethod
    def _format_metric_row(code, name, metric_data):
        """Format a single metric row"""
        if not metric_data:
            return ""
        
        score = metric_data.get('score', 0)
        rationale = metric_data.get('rationale', 'No rationale provided')
        
        color = "#10b981" if score >= 80 else "#f59e0b" if score >= 60 else "#ef4444"
        
        return f"""
        <div style="padding: 12px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
            <div style="flex: 1;">
                <div style="font-weight: 500; color: #374151;">
                    <span style="color: #6b7280; font-size: 12px;">{code}</span> {name}
                </div>
                <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">{rationale}</div>
            </div>
            <div style="text-align: right;">
                <span style="font-size: 20px; font-weight: bold; color: {color};">{score:.0f}</span>
                <span style="color: #6b7280; font-size: 14px;">/100</span>
            </div>
        </div>
        """
    
    @staticmethod
    def _format_confidence_section(confidence_data):
        """Format confidence analysis section"""
        if not confidence_data:
            return ""
        
        conf = confidence_data.get('overall_confidence', 0)
        color = "#10b981" if conf >= 0.7 else "#f59e0b" if conf >= 0.5 else "#ef4444"
        
        return f"""
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h4 style="margin: 0 0 12px 0; color: #111827;">🎯 Analysis Confidence</h4>
            <div style="display: flex; gap: 24px; flex-wrap: wrap;">
                <div>
                    <div style="font-size: 24px; font-weight: bold; color: {color};">{conf:.2f}</div>
                    <div style="font-size: 12px; color: #6b7280;">Overall</div>
                </div>
                <div>
                    <div style="font-size: 18px; font-weight: bold;">{confidence_data.get('avg_credibility', 0):.2f}</div>
                    <div style="font-size: 12px; color: #6b7280;">Avg Credibility</div>
                </div>
                <div>
                    <div style="font-size: 18px; font-weight: bold;">{confidence_data.get('coverage_ratio', 0):.2f}</div>
                    <div style="font-size: 12px; color: #6b7280;">Coverage</div>
                </div>
                <div>
                    <div style="font-size: 18px; font-weight: bold;">{confidence_data.get('consistency_score', 0):.2f}</div>
                    <div style="font-size: 12px; color: #6b7280;">Consistency</div>
                </div>
                <div style="flex: 1; min-width: 200px;">
                    <div style="font-size: 13px; color: #374151;">
                        {confidence_data.get('confidence_explanation', 'No explanation')}
                    </div>
                </div>
            </div>
            {('<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;"><strong>Data Gaps:</strong> ' + ', '.join(confidence_data.get('data_gaps', [])) + '</div>') if confidence_data.get('data_gaps') else ''}
        </div>
        """
    
    @staticmethod
    def _format_evidence_units(evidence_units):
        """Format evidence units display"""
        if not evidence_units:
            return ""
        
        html = """
        <div style="background: #eff6ff; border: 1px solid #dbeafe; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h4 style="margin: 0 0 12px 0; color: #2563eb;">🔍 Top Evidence Units</h4>
        """
        
        for eu in evidence_units:
            cred = eu.get('credibility_score', 0)
            cred_color = "#10b981" if cred >= 0.8 else "#f59e0b" if cred >= 0.6 else "#ef4444"
            
            html += f"""
            <div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="font-weight: 500; color: #374151;">{eu.get('claim', 'N/A')}</div>
                        <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">{eu.get('context', 'No context')}</div>
                        <div style="font-size: 12px; color: #6b7280; margin-top: 4px; font-style: italic;">
                            {eu.get('credibility_rationale', eu.get('rationale', ''))}
                        </div>
                    </div>
                    <div style="background: {cred_color}20; color: {cred_color}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">
                        {cred:.1f}
                    </div>
                </div>
            </div>
            """
        
        html += "</div>"
        return html
    
    @staticmethod
    def _format_positive_boosters(boosters):
        """Format positive boosters section"""
        if not boosters or boosters.get('points', 0) == 0:
            return ""
        
        applied = boosters.get('applied', [])
        points = boosters.get('points', 0)
        
        return f"""
        <div style="background: #fef3c7; border: 1px solid #fde047; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h4 style="margin: 0 0 12px 0; color: #92400e;">🌟 Positive Boosters (+{points} points)</h4>
            <ul style="margin: 0; padding-left: 20px; color: #78350f;">
                {''.join([f'<li style="margin-bottom: 4px;">{boost}</li>' for boost in applied])}
            </ul>
        </div>
        """
    
    @staticmethod
    def _format_red_flags(red_flags):
        """Format red flags section"""
        if not red_flags or len(red_flags) == 0:
            return """
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                <h4 style="margin: 0; color: #166534;">✅ No Red Flags Detected</h4>
                <p style="margin: 8px 0 0 0; color: #15803d; font-size: 14px;">Clean employment history with no concerning patterns.</p>
            </div>
            """
        
        return f"""
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h4 style="margin: 0 0 12px 0; color: #dc2626;">🚩 Red Flags & Context ({len(red_flags)} detected)</h4>
            {''.join([f'''
            <div style="margin-bottom: 12px; padding: 12px; background: white; border-radius: 6px;">
                <div style="font-weight: 500; color: #dc2626;">{flag.get("flag", "")}</div>
                <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">
                    <strong>Severity:</strong> {flag.get("severity", "unknown").title()} | 
                    <strong>Impact:</strong> {flag.get("impact", "N/A")}
                </div>
                {('<div style="font-size: 12px; color: #374151; margin-top: 4px; font-style: italic;">' + flag.get("context_considered", "") + '</div>') if flag.get("context_considered") else ''}
            </div>
            ''' for flag in red_flags])}
        </div>
        """
    
    @staticmethod
    def _format_interview_section(interview_data):
        """Format interview recommendations"""
        if isinstance(interview_data, dict):
            focus_areas = interview_data.get('focus_areas', [])
            questions = interview_data.get('questions', [])
        else:
            focus_areas = interview_data if isinstance(interview_data, list) else []
            questions = []
        
        if not focus_areas:
            return ""
        
        return f"""
        <div style="background: #eff6ff; border: 1px solid #dbeafe; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h4 style="margin: 0 0 12px 0; color: #2563eb;">💡 Interview Focus Areas</h4>
            <ol style="margin: 0; padding-left: 20px; color: #374151;">
                {''.join([f'<li style="margin-bottom: 8px;">{area}</li>' for area in focus_areas])}
            </ol>
            {('<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #dbeafe;"><strong>Suggested Questions:</strong><ul style="margin-top: 8px;">' + ''.join([f'<li style="margin-bottom: 4px;">{q}</li>' for q in questions]) + '</ul></div>') if questions else ''}
        </div>
        """