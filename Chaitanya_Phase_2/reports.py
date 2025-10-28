from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from io import BytesIO
from datetime import datetime  # FIXED: Added missing import

class ReportGenerator:
    """Generate PDF reports"""
    
    @staticmethod
    def generate_pdf(analysis):
        """Create comprehensive PDF report"""
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter,
                              rightMargin=72, leftMargin=72,
                              topMargin=72, bottomMargin=18)
        
        styles = getSampleStyleSheet()
        story = []
        
        # Title
        title = Paragraph(f"<b>AI Candidate Screening Report</b>", styles['Title'])
        story.append(title)
        story.append(Spacer(1, 20))
        
        # Candidate Info
        story.append(Paragraph(f"<b>Candidate:</b> {analysis.get('candidate_name', 'N/A')}", styles['Normal']))
        story.append(Paragraph(f"<b>Analysis Date:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
        story.append(Spacer(1, 20))
        
        # Final Score
        story.append(Paragraph("<b>FINAL SCORE</b>", styles['Heading2']))
        score_text = f"{analysis.get('final_weighted_score', 0):.1f}/100 - {analysis.get('overall_recommendation', 'N/A')}"
        story.append(Paragraph(score_text, styles['Normal']))
        story.append(Spacer(1, 20))
        
        # Score Breakdown
        story.append(Paragraph("<b>SCORE BREAKDOWN</b>", styles['Heading2']))
        breakdown_data = [
            ['Category', 'Score'],
            ['Technical Match', f"{analysis.get('technical_match_score', 0)}/100"],
            ['Experience Relevance', f"{analysis.get('experience_relevance_score', 0)}/100"],
            ['Culture Fit', f"{analysis.get('culture_fit_score', 0)}/100"],
            ['Growth Potential', f"{analysis.get('growth_potential_score', 0)}/100"],
        ]
        
        t = Table(breakdown_data, colWidths=[3*inch, 2*inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 14),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(t)
        story.append(Spacer(1, 20))
        
        # Recommendation
        story.append(Paragraph("<b>RECOMMENDATION</b>", styles['Heading2']))
        story.append(Paragraph(analysis.get('recommendation_rationale', 'No rationale provided'), styles['Normal']))
        story.append(Spacer(1, 20))
        
        # Key Strengths
        story.append(Paragraph("<b>KEY STRENGTHS</b>", styles['Heading2']))
        for strength in analysis.get('key_strengths', []):
            story.append(Paragraph(f"• {strength}", styles['Normal']))
        story.append(Spacer(1, 20))
        
        # Interview Questions
        story.append(Paragraph("<b>RECOMMENDED INTERVIEW QUESTIONS</b>", styles['Heading2']))
        for q in analysis.get('recommended_interview_questions', [])[:5]:
            story.append(Paragraph(f"• {q}", styles['Normal']))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer