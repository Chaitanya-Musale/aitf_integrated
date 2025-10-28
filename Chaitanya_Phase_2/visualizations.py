"""
Visualization components for candidate analysis
"""

import plotly.graph_objects as go

class CandidateVisualizations:
    """Generate interactive visualizations for analysis"""
    
    @staticmethod
    def create_radar_chart(analysis):
        """
        Create radar chart showing 11-metric breakdown
        Now displays comprehensive evidence-based scoring
        """
        
        # Get 11 metrics
        metrics_data = analysis.get('metrics_11', {})
        
        # If new format not available, fall back to old 4-metric format
        if not metrics_data:
            scores = {
                'Technical<br>Match': analysis.get('technical_match_score', 0),
                'Experience<br>Relevance': analysis.get('experience_relevance_score', 0),
                'Culture<br>Fit': analysis.get('culture_fit_score', 0),
                'Growth<br>Potential': analysis.get('growth_potential_score', 0)
            }
        else:
            # New 11-metric format
            scores = {
                'Technical<br>Depth': metrics_data.get('TDB_technical_depth_breadth', {}).get('score', 0),
                'Experience<br>Relevance': metrics_data.get('XR_experience_relevance', {}).get('score', 0),
                'Outcome &<br>Impact': metrics_data.get('OI_outcome_impact', {}).get('score', 0),
                'Systems<br>Complexity': metrics_data.get('SC_systems_complexity', {}).get('score', 0),
                'Domain<br>Alignment': metrics_data.get('DA_domain_alignment', {}).get('score', 0),
                'Leadership &<br>Collab': metrics_data.get('LC_leadership_collab', {}).get('score', 0),
                'Communication<br>Quality': metrics_data.get('CE_communication_quality', {}).get('score', 0),
                'Growth &<br>Adaptability': metrics_data.get('GA_growth_adaptability', {}).get('score', 0),
                'Stability &<br>Risk': metrics_data.get('SR_stability_risk', {}).get('score', 0),
                'Availability': metrics_data.get('AC_availability', {}).get('score', 0),
                'Compensation<br>Fit': metrics_data.get('CF_compensation_fit', {}).get('score', 0)
            }
        
        categories = list(scores.keys())
        values = list(scores.values())
        
        fig = go.Figure()
        
        # Add the main score trace
        fig.add_trace(go.Scatterpolar(
            r=values,
            theta=categories,
            fill='toself',
            name='Candidate Score',
            line_color='rgb(99, 110, 250)',
            fillcolor='rgba(99, 110, 250, 0.3)',
            marker=dict(size=6),
            hovertemplate='<b>%{theta}</b><br>Score: %{r:.1f}/100<extra></extra>'
        ))
        
        # Add benchmark line at 75 (good score)
        fig.add_trace(go.Scatterpolar(
            r=[75] * len(categories),
            theta=categories,
            line=dict(color='rgba(34, 197, 94, 0.4)', dash='dash', width=1),
            name='Target (75)',
            showlegend=True,
            hovertemplate='Target: 75<extra></extra>'
        ))
        
        fig.update_layout(
            polar=dict(
                radialaxis=dict(
                    visible=True,
                    range=[0, 100],
                    tickfont=dict(size=10),
                    gridcolor='#e5e7eb',
                    showticklabels=True
                ),
                angularaxis=dict(
                    gridcolor='#e5e7eb',
                    tickfont=dict(size=10)
                )
            ),
            showlegend=True,
            legend=dict(
                x=0.5,
                y=-0.15,
                xanchor='center',
                orientation='h'
            ),
            title={
                'text': "📊 11-Metric Evidence-Based Scoring" if metrics_data else "📊 Candidate Score Breakdown",
                'x': 0.5,
                'xanchor': 'center',
                'font': {'size': 14, 'color': '#374151'}
            },
            height=550,
            paper_bgcolor='white',
            plot_bgcolor='white',
            margin=dict(t=80, b=80, l=80, r=80)
        )
        
        return fig
    
    @staticmethod
    def create_gauge_chart(score, confidence=None):
        """
        Create gauge chart for final weighted score with confidence indicator
        
        Args:
            score: Final weighted score (0-100)
            confidence: Optional confidence score (0-1)
        """
        
        # Create main gauge
        fig = go.Figure()
        
        # Main score gauge
        fig.add_trace(go.Indicator(
            mode="gauge+number",
            value=score,
            domain={'x': [0, 1], 'y': [0.25, 1]},
            title={
                'text': "Final Weighted Score",
                'font': {'size': 18, 'color': '#374151'}
            },
            number={
                'font': {'size': 36, 'color': '#111827'},
                'suffix': "/100"
            },
            gauge={
                'axis': {
                    'range': [None, 100],
                    'tickwidth': 1,
                    'tickcolor': "#6b7280"
                },
                'bar': {'color': "#636EFA", 'thickness': 0.7},
                'bgcolor': "white",
                'borderwidth': 2,
                'bordercolor': "#e5e7eb",
                'steps': [
                    {'range': [0, 60], 'color': '#fee2e2'},      # Needs Review
                    {'range': [60, 75], 'color': '#fef3c7'},     # Hold
                    {'range': [75, 85], 'color': '#dbeafe'},     # Interview
                    {'range': [85, 100], 'color': '#d1fae5'}     # Fast-Track
                ],
                'threshold': {
                    'line': {'color': "#10b981", 'width': 3},
                    'thickness': 0.75,
                    'value': 85  # Fast-track threshold
                }
            }
        ))
        
        # Add confidence indicator if provided
        if confidence is not None:
            fig.add_trace(go.Indicator(
                mode="number+gauge",
                value=confidence * 100,
                domain={'x': [0.25, 0.75], 'y': [0, 0.25]},
                title={
                    'text': "Confidence",
                    'font': {'size': 12, 'color': '#6b7280'}
                },
                number={
                    'font': {'size': 20, 'color': '#374151'},
                    'suffix': "%"
                },
                gauge={
                    'shape': "bullet",
                    'axis': {'range': [0, 100]},
                    'bar': {'color': "#10b981" if confidence >= 0.7 else "#f59e0b" if confidence >= 0.5 else "#ef4444"},
                    'bgcolor': "#f3f4f6",
                    'borderwidth': 0,
                    'steps': [
                        {'range': [0, 50], 'color': '#fee2e2'},
                        {'range': [50, 70], 'color': '#fef3c7'},
                        {'range': [70, 100], 'color': '#d1fae5'}
                    ]
                }
            ))
        
        fig.update_layout(
            paper_bgcolor='white',
            height=400,
            margin=dict(l=20, r=20, t=60, b=20),
            annotations=[
                dict(
                    text="<b>Tiers:</b> 85+ Fast-Track | 75-84 Interview | 60-74 Hold | <60 Review",
                    x=0.5, y=-0.05,
                    xref="paper", yref="paper",
                    showarrow=False,
                    font=dict(size=10, color='#6b7280')
                )
            ]
        )
        
        return fig
    
    @staticmethod
    def create_confidence_breakdown(confidence_analysis):
        """
        Create visualization for confidence analysis breakdown
        
        Args:
            confidence_analysis: Dict with credibility, coverage, consistency scores
        """
        if not confidence_analysis:
            return None
        
        components = {
            'Avg Credibility': confidence_analysis.get('avg_credibility', 0) * 100,
            'Coverage Ratio': confidence_analysis.get('coverage_ratio', 0) * 100,
            'Consistency': confidence_analysis.get('consistency_score', 0) * 100
        }
        
        fig = go.Figure()
        
        fig.add_trace(go.Bar(
            x=list(components.keys()),
            y=list(components.values()),
            marker=dict(
                color=['#3b82f6', '#10b981', '#8b5cf6'],
                line=dict(color='#e5e7eb', width=1)
            ),
            text=[f"{v:.1f}%" for v in components.values()],
            textposition='outside',
            hovertemplate='<b>%{x}</b><br>%{y:.1f}%<extra></extra>'
        ))
        
        fig.update_layout(
            title="Confidence Score Components",
            yaxis=dict(
                title="Score (%)",
                range=[0, 105],
                gridcolor='#e5e7eb'
            ),
            paper_bgcolor='white',
            plot_bgcolor='white',
            height=300,
            margin=dict(l=40, r=40, t=60, b=40)
        )
        
        return fig
    
    @staticmethod
    def create_comparison_chart(candidates_scores):
        """
        Create bar chart comparing multiple candidates
        (For future enhancement - batch processing)
        """
        if not candidates_scores:
            return None
        
        names = [c['name'] for c in candidates_scores]
        scores = [c['score'] for c in candidates_scores]
        
        fig = go.Figure()
        
        fig.add_trace(go.Bar(
            x=names,
            y=scores,
            marker_color='rgb(99, 110, 250)',
            text=[f"{s:.1f}" for s in scores],
            textposition='outside',
            hovertemplate='<b>%{x}</b><br>Score: %{y:.1f}/100<extra></extra>'
        ))
        
        # Add threshold lines
        fig.add_hline(
            y=80,
            line_dash="dash",
            line_color="green",
            annotation_text="Strong Match (80+)",
            annotation_position="right"
        )
        fig.add_hline(
            y=60,
            line_dash="dash",
            line_color="orange",
            annotation_text="Potential Match (60+)",
            annotation_position="right"
        )
        
        fig.update_layout(
            title="Candidate Comparison",
            yaxis_title="Final Score",
            yaxis_range=[0, 105],
            height=400,
            showlegend=False,
            paper_bgcolor='white',
            plot_bgcolor='white',
            xaxis={'categoryorder': 'total descending'}
        )
        
        return fig