"""
Evidence Heatmap Visualization - Simplified for HF Spaces
Creates interactive heatmaps showing evidence strength across CV sections
"""

import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

class EvidenceHeatmap:
    """
    Generate interactive evidence heatmaps and visualizations
    """
    
    def __init__(self, theme: str = 'plotly_white'):
        """Initialize heatmap generator"""
        self.theme = theme
        self.color_schemes = {
            'evidence': ['#d32f2f', '#f57c00', '#fbc02d', '#689f38', '#388e3c'],
            'credibility': ['#b71c1c', '#e65100', '#f57c00', '#fbc02d', '#33691e'],
            'diverging': px.colors.diverging.RdYlGn
        }
    
    def create_evidence_heatmap(self, validations: List[Dict], claims: List[Dict]) -> go.Figure:
        """Create heatmap showing evidence strength for each claim"""
        # Simple heatmap for HF Spaces
        sections = {}
        
        for i, claim in enumerate(claims[:20]):  # Limit for performance
            section = claim.get('section_source', 'unknown')
            category = claim.get('category', 'other')
            
            if section not in sections:
                sections[section] = {}
            
            if category not in sections[section]:
                sections[section][category] = []
            
            validation = validations[i] if i < len(validations) else {}
            sections[section][category].append({
                'claim_text': claim.get('claim_text', '')[:50],
                'evidence_score': validation.get('final_evidence_score', 0.5),
                'status': validation.get('verification_status', 'unknown')
            })
        
        # Create matrix
        section_names = list(sections.keys())[:5]  # Limit sections
        categories = list(set(cat for sec in sections.values() for cat in sec.keys()))[:5]
        
        matrix = []
        hover_text = []
        
        for section in section_names:
            row = []
            hover_row = []
            
            for category in categories:
                if category in sections.get(section, {}):
                    scores = [item['evidence_score'] for item in sections[section][category]]
                    avg_score = sum(scores) / len(scores) if scores else 0
                    row.append(avg_score)
                    hover_row.append(f"{section} - {category}: {avg_score:.2f}")
                else:
                    row.append(0)
                    hover_row.append("No claims")
            
            matrix.append(row)
            hover_text.append(hover_row)
        
        # Create figure
        fig = go.Figure(data=go.Heatmap(
            z=matrix,
            x=categories,
            y=section_names,
            colorscale='RdYlGn',
            colorbar=dict(title="Evidence Strength"),
            hovertext=hover_text,
            hovertemplate='%{hovertext}<extra></extra>'
        ))
        
        fig.update_layout(
            title="Evidence Strength by Section",
            xaxis_title="Category",
            yaxis_title="Section",
            template=self.theme,
            height=400
        )
        
        return fig
    
    def create_credibility_dashboard(self, scores: Dict[str, Any], red_flags: List[Dict]) -> go.Figure:
        """Create credibility dashboard"""
        # Create subplots
        fig = make_subplots(
            rows=2, cols=2,
            subplot_titles=('Final Score', 'Red Flags', 'Score Components', 'Risk Level'),
            specs=[[{'type': 'indicator'}, {'type': 'bar'}],
                   [{'type': 'bar'}, {'type': 'indicator'}]]
        )
        
        # Final Score Gauge
        fig.add_trace(
            go.Indicator(
                mode="gauge+number",
                value=scores.get('final', 75),
                title={'text': "Score"},
                gauge={'axis': {'range': [0, 100]},
                       'bar': {'color': "darkblue"},
                       'steps': [
                           {'range': [0, 50], 'color': "lightgray"},
                           {'range': [50, 75], 'color': "gray"},
                           {'range': [75, 100], 'color': "lightgreen"}
                       ]}
            ),
            row=1, col=1
        )
        
        # Red Flag Distribution
        if red_flags:
            severity_counts = {}
            for flag in red_flags[:10]:
                sev = flag.get('severity', 'unknown')
                severity_counts[sev] = severity_counts.get(sev, 0) + 1
            
            fig.add_trace(
                go.Bar(
                    x=list(severity_counts.keys()),
                    y=list(severity_counts.values()),
                    marker_color=['red', 'orange', 'yellow', 'green']
                ),
                row=1, col=2
            )
        
        # Score Components
        fig.add_trace(
            go.Bar(
                x=['Credibility', 'Consistency'],
                y=[scores.get('credibility', 75), scores.get('consistency', 75)],
                marker_color=['blue', 'green']
            ),
            row=2, col=1
        )
        
        # Risk Indicator
        risk_map = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
        risk_value = risk_map.get(scores.get('risk_level', 'medium'), 2)
        
        fig.add_trace(
            go.Indicator(
                mode="number",
                value=risk_value,
                title={'text': f"Risk: {scores.get('risk_level', 'medium').upper()}"}
            ),
            row=2, col=2
        )
        
        fig.update_layout(
            template=self.theme,
            showlegend=False,
            height=600,
            title_text="Credibility Dashboard"
        )
        
        return fig
    
    def create_claim_distribution(self, claims: List[Dict]) -> go.Figure:
        """Create pie chart of claim distribution"""
        category_counts = {}
        
        for claim in claims[:50]:  # Limit for performance
            cat = claim.get('category', 'unknown')
            category_counts[cat] = category_counts.get(cat, 0) + 1
        
        fig = go.Figure(data=[go.Pie(
            labels=list(category_counts.keys()),
            values=list(category_counts.values()),
            hole=0.3
        )])
        
        fig.update_layout(
            title="Claim Distribution",
            template=self.theme,
            height=400
        )
        
        return fig
    
    def create_validation_summary(self, validations: List[Dict], claims: List[Dict]) -> go.Figure:
        """Create validation summary donut chart"""
        status_counts = {
            'verified': 0,
            'partial': 0,
            'unverified': 0,
            'red_flag': 0
        }
        
        for validation in validations[:50]:  # Limit
            status = validation.get('verification_status', 'unknown')
            if status in status_counts:
                status_counts[status] += 1
        
        fig = go.Figure(data=[go.Pie(
            labels=['Verified', 'Partial', 'Unverified', 'Red Flag'],
            values=[status_counts['verified'], status_counts['partial'],
                   status_counts['unverified'], status_counts['red_flag']],
            hole=0.4,
            marker=dict(colors=['green', 'yellow', 'orange', 'red'])
        )])
        
        total = sum(status_counts.values())
        verified_pct = (status_counts['verified'] / total * 100) if total > 0 else 0
        
        fig.add_annotation(
            text=f"{verified_pct:.0f}%<br>Verified",
            x=0.5, y=0.5,
            font=dict(size=20),
            showarrow=False
        )
        
        fig.update_layout(
            title="Verification Status",
            template=self.theme,
            height=400
        )
        
        return fig
    
    def create_timeline_gantt(self, claims: List[Dict]) -> go.Figure:
        """Create timeline visualization"""
        # Simplified timeline for HF Spaces
        timeline_data = []
        
        for claim in claims[:10]:  # Limit
            if claim.get('time_period', {}).get('start_date'):
                timeline_data.append({
                    'Task': claim.get('claim_text', '')[:30],
                    'Start': claim['time_period']['start_date'],
                    'Finish': claim['time_period'].get('end_date', '2025-12')
                })
        
        if not timeline_data:
            fig = go.Figure()
            fig.add_annotation(
                text="No timeline data available",
                x=0.5, y=0.5,
                showarrow=False
            )
            return fig
        
        # Create simple timeline
        fig = go.Figure()
        
        for i, item in enumerate(timeline_data):
            fig.add_trace(go.Scatter(
                x=[item['Start'], item['Finish']],
                y=[i, i],
                mode='lines+markers',
                name=item['Task'],
                line=dict(width=10),
                showlegend=False
            ))
        
        fig.update_layout(
            title="Career Timeline",
            xaxis_title="Date",
            yaxis_title="Position",
            template=self.theme,
            height=400
        )
        
        return fig
    
    def export_figures_to_html(self, figures: List[go.Figure], output_path: str) -> None:
        """Export figures to HTML"""
        from plotly.offline import plot
        
        html_divs = []
        for fig in figures:
            html_div = plot(fig, output_type='div', include_plotlyjs=False)
            html_divs.append(html_div)
        
        html_string = f'''
        <html>
        <head>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <title>Resume Verification Report</title>
        </head>
        <body>
            <h1>Resume Verification Report</h1>
            {''.join(f'<div>{div}</div>' for div in html_divs)}
        </body>
        </html>
        '''
        
        with open(output_path, 'w') as f:
            f.write(html_string)
        
        logger.info(f"Exported to {output_path}")