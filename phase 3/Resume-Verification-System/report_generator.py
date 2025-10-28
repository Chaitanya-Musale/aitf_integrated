"""
Report Generator Module - Simplified for HF Spaces
Generates comprehensive verification reports in multiple formats
"""

import json
import csv
import io
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
import pandas as pd
import logging

logger = logging.getLogger(__name__)

class ReportGenerator:
    """
    Generate comprehensive reports with multiple export formats
    """
    
    def __init__(self):
        """Initialize report generator"""
        self.styles = {}
    
    def generate_comprehensive_report(self, analysis_results: Dict[str, Any], output_format: str = 'pdf') -> Any:
        """Generate report in specified format"""
        if output_format == 'pdf':
            return self._generate_pdf_report(analysis_results)
        elif output_format == 'csv':
            return self._generate_csv_report(analysis_results)
        elif output_format == 'json':
            return self._generate_json_report(analysis_results)
        elif output_format == 'html':
            return self._generate_html_report(analysis_results)
        else:
            raise ValueError(f"Unsupported format: {output_format}")
    
    def _generate_pdf_report(self, results: Dict[str, Any]) -> bytes:
        """Generate simple PDF report"""
        # Simplified PDF generation for HF Spaces
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.lib.units import inch
            
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=letter)
            story = []
            styles = getSampleStyleSheet()
            
            # Title
            story.append(Paragraph("Resume Verification Report", styles['Title']))
            story.append(Spacer(1, 20))
            
            # Summary
            summary_text = f"""
            Final Score: {results.get('final_score', 0):.1f}/100<br/>
            Risk Level: {results.get('risk_assessment', 'Unknown')}<br/>
            Total Claims: {results.get('total_claims', 0)}<br/>
            Verified: {results.get('verified_claims', 0)}<br/>
            Red Flags: {results.get('total_red_flags', 0)}<br/>
            """
            story.append(Paragraph(summary_text, styles['Normal']))
            
            # Build PDF
            doc.build(story)
            buffer.seek(0)
            return buffer.getvalue()
            
        except ImportError:
            # Fallback if reportlab not available
            return b"PDF generation not available. Please use HTML or JSON format."
    
    def _generate_csv_report(self, results: Dict[str, Any]) -> str:
        """Generate CSV report"""
        output = io.StringIO()
        
        if results.get('claims'):
            # Create DataFrame from claims
            claims_data = []
            for claim in results['claims'][:100]:  # Limit to 100
                claims_data.append({
                    'claim_id': claim.get('claim_id', ''),
                    'claim_text': claim.get('claim_text', ''),
                    'category': claim.get('category', ''),
                    'verifiability_level': claim.get('verifiability_level', ''),
                    'evidence_present': claim.get('evidence_present', '')
                })
            
            df = pd.DataFrame(claims_data)
            df.to_csv(output, index=False)
        
        return output.getvalue()
    
    def _generate_json_report(self, results: Dict[str, Any]) -> str:
        """Generate JSON report"""
        # Clean results for JSON serialization
        clean_results = self._clean_for_json(results)
        return json.dumps(clean_results, indent=2, default=str)
    
    def _generate_html_report(self, results: Dict[str, Any]) -> str:
        """Generate HTML report"""
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Resume Verification Report</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .header {{ background: #4a90e2; color: white; padding: 20px; }}
                .score {{ font-size: 36px; font-weight: bold; }}
                .card {{ background: #f5f5f5; padding: 15px; margin: 10px 0; }}
                .red-flag {{ background: #ffebee; border-left: 4px solid #f44336; padding: 10px; margin: 5px 0; }}
                table {{ width: 100%; border-collapse: collapse; }}
                th, td {{ padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Resume Verification Report</h1>
                <p>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
            </div>
            
            <div class="card">
                <h2>Summary</h2>
                <div class="score">{results.get('final_score', 0):.0f}/100</div>
                <p>Risk Level: {results.get('risk_assessment', 'Unknown').upper()}</p>
                <p>Total Claims: {results.get('total_claims', 0)}</p>
                <p>Verified: {results.get('verified_claims', 0)}</p>
                <p>Red Flags: {results.get('total_red_flags', 0)}</p>
            </div>
            
            <div class="card">
                <h2>Red Flags</h2>
                {self._generate_red_flags_html(results.get('red_flags', []))}
            </div>
            
            <div class="card">
                <h2>Recommendation</h2>
                <p>{results.get('recommendation', 'No recommendation available')}</p>
            </div>
        </body>
        </html>
        """
        return html
    
    def _generate_red_flags_html(self, red_flags: List[Dict]) -> str:
        """Generate HTML for red flags"""
        if not red_flags:
            return "<p>No red flags detected</p>"
        
        html = ""
        for flag in red_flags[:10]:  # Limit to 10
            html += f'<div class="red-flag">'
            html += f'<strong>[{flag.get("severity", "").upper()}]</strong> '
            html += f'{flag.get("description", "No description")}'
            html += '</div>'
        
        return html
    
    def _clean_for_json(self, obj: Any) -> Any:
        """Clean object for JSON serialization"""
        if isinstance(obj, dict):
            return {k: self._clean_for_json(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._clean_for_json(item) for item in obj]
        elif isinstance(obj, datetime):
            return obj.isoformat()
        elif hasattr(obj, '__dict__'):
            return self._clean_for_json(obj.__dict__)
        else:
            return obj
    
    def _compile_interview_questions(self, results: Dict[str, Any]) -> List[str]:
        """Compile interview questions from analysis"""
        questions = []
        seen = set()
        
        # From red flags
        if results.get('red_flags'):
            for flag in results['red_flags'][:10]:
                if flag.get('interview_probe'):
                    q = flag['interview_probe']
                    if q not in seen:
                        questions.append(q)
                        seen.add(q)
        
        # Add general questions if needed
        if len(questions) < 5:
            general = [
                "Walk me through your most challenging project.",
                "Can you provide references for your achievements?",
                "What metrics did you use to measure success?",
                "How do you stay current with technology?",
                "Describe a failure and what you learned."
            ]
            
            for q in general:
                if q not in seen and len(questions) < 10:
                    questions.append(q)
                    seen.add(q)
        
        return questions
    
    def generate_interview_checklist(self, results: Dict[str, Any]) -> str:
        """Generate interview checklist"""
        checklist = "INTERVIEW CHECKLIST\n"
        checklist += "=" * 40 + "\n\n"
        
        checklist += f"Date: {datetime.now().strftime('%Y-%m-%d')}\n"
        checklist += f"Risk Level: {results.get('risk_assessment', 'Unknown')}\n"
        checklist += f"Final Score: {results.get('final_score', 0):.0f}/100\n\n"
        
        checklist += "KEY QUESTIONS:\n"
        questions = self._compile_interview_questions(results)
        
        for i, q in enumerate(questions[:10], 1):
            checklist += f"{i}. {q}\n"
            checklist += "   [ ] Answered\n\n"
        
        checklist += "\nDOCUMENTS TO REQUEST:\n"
        checklist += "[ ] Portfolio/GitHub\n"
        checklist += "[ ] References\n"
        checklist += "[ ] Certificates\n"
        checklist += "[ ] Work samples\n\n"
        
        checklist += "FINAL ASSESSMENT:\n"
        checklist += "[ ] Recommend\n"
        checklist += "[ ] Recommend with reservations\n"
        checklist += "[ ] Do not recommend\n"
        
        return checklist