"""
AI Candidate Screening System - Main Application
Gradio Interface for Hugging Face Spaces
Evidence-Based Framework v2.0
"""

import gradio as gr
import json

# Import our modules
from config import SystemConfig
from models import GeminiScreeningEngine
from utils import DocumentParser, HTMLFormatter
from visualizations import CandidateVisualizations

# ============================================================================
# GLOBAL STATE
# ============================================================================

screening_engine = None

# ============================================================================
# PROCESSING FUNCTIONS
# ============================================================================

def process_candidate(api_key, resume_file, job_desc, additional_context):
    """
    Main processing function for candidate analysis
    """
    global screening_engine
    
    # Validate API key
    if not api_key or api_key.strip() == "":
        return "❌ Please provide a Gemini API key", None, None, None
    
    # Initialize engine if needed
    if screening_engine is None:
        try:
            screening_engine = GeminiScreeningEngine(api_key)
        except Exception as e:
            return f"❌ Failed to initialize engine: {str(e)}", None, None, None
    
    # Parse resume
    resume_text = DocumentParser.parse_resume(resume_file)
    if resume_text.startswith("❌") or resume_text.startswith("⚠️"):
        return resume_text, None, None, None
    
    # Validate job description
    if not job_desc or job_desc.strip() == "":
        return "❌ Please provide a job description", None, None, None
    
    # Analyze candidate
    analysis = screening_engine.analyze_candidate(resume_text, job_desc, additional_context)
    
    if "error" in analysis:
        return f"❌ Analysis error: {analysis['error']}", None, None, None
    
    # Generate outputs
    html_report = HTMLFormatter.format_analysis_html(analysis)
    radar_chart = CandidateVisualizations.create_radar_chart(analysis)
    
    # Pass confidence to gauge chart
    confidence = analysis.get('confidence_score', analysis.get('confidence_analysis', {}).get('overall_confidence', None))
    gauge_chart = CandidateVisualizations.create_gauge_chart(
        analysis.get('final_weighted_score', 0),
        confidence
    )
    
    # Generate JSON download
    json_output = json.dumps(analysis, indent=2)
    
    return html_report, radar_chart, gauge_chart, json_output


def search_database(api_key, search_query):
    """Search candidates in session database"""
    global screening_engine
    
    if screening_engine is None:
        return "❌ Please analyze at least one candidate first"
    
    if not search_query or search_query.strip() == "":
        return "❌ Please enter a search query"
    
    return screening_engine.search_candidates(search_query)


def show_stats(api_key):
    """Show session statistics"""
    global screening_engine
    
    if screening_engine is None:
        return "❌ No candidates analyzed yet"
    
    return screening_engine.get_session_statistics()

# ============================================================================
# GRADIO INTERFACE
# ============================================================================

with gr.Blocks(theme=gr.themes.Soft(), title="AI Candidate Screening System") as demo:
    
    gr.Markdown("""
    # 🤖 AI Candidate Screening System v2.0
    ### Evidence-Based Framework with Mathematical Rigor
    ### Powered by Google Gemini 2.0
    
    **New in v2.0:** Sigmoid diminishing returns • Recency decay • Red flag detection • Confidence scoring • Positive boosters
    """)
    
    with gr.Tabs():
        
        # ====================================================================
        # TAB 1: CANDIDATE ANALYSIS
        # ====================================================================
        with gr.Tab("📋 Candidate Analysis"):
            with gr.Row():
                with gr.Column(scale=2):
                    api_key_input = gr.Textbox(
                        label="🔑 Gemini API Key",
                        placeholder="Enter your Google Gemini API key...",
                        type="password"
                    )
                    gr.Markdown(
                        "[Get API Key](https://aistudio.google.com/app/apikey) | "
                        "[Documentation](https://ai.google.dev/)"
                    )
                    
                    resume_upload = gr.File(
                        label="📄 Upload Resume (PDF, DOCX, TXT)",
                        file_types=[".pdf", ".docx", ".txt"]
                    )
                    
                    job_description = gr.Textbox(
                        label="💼 Job Description",
                        placeholder="Paste the complete job description here...",
                        lines=8
                    )
                    
                    additional_notes = gr.Textbox(
                        label="💡 Additional Context (Optional)",
                        placeholder="Any specific requirements, team fit considerations, or focus areas...",
                        lines=3
                    )
                    
                    analyze_btn = gr.Button(
                        "🚀 Analyze Candidate",
                        variant="primary",
                        size="lg"
                    )
                
                with gr.Column(scale=3):
                    analysis_output = gr.HTML(label="Analysis Results")
                    
                    with gr.Row():
                        radar_plot = gr.Plot(label="11-Metric Breakdown")
                        gauge_plot = gr.Plot(label="Final Score")
                    
                    with gr.Row():
                        json_output = gr.Textbox(
                            label="Raw JSON Output",
                            lines=10,
                            visible=False
                        )
                        download_json_btn = gr.DownloadButton(
                            "📥 Download JSON",
                            visible=True
                        )
            
            # Connect analysis button
            analyze_btn.click(
                fn=process_candidate,
                inputs=[api_key_input, resume_upload, job_description, additional_notes],
                outputs=[analysis_output, radar_plot, gauge_plot, json_output]
            )
            
            # Connect download button
            download_json_btn.click(
                fn=lambda x: x,
                inputs=[json_output],
                outputs=None
            )
        
        # ====================================================================
        # TAB 2: SEMANTIC SEARCH
        # ====================================================================
        with gr.Tab("🔍 Candidate Search"):
            gr.Markdown("""
            ### Natural Language Candidate Search
            Search through analyzed candidates using natural language queries.
            
            **Example queries:**
            - "Backend engineers with Python experience"
            - "Senior candidates available immediately"
            - "Candidates with leadership skills"
            - "Strong technical matches above 85 score"
            """)
            
            with gr.Row():
                search_query = gr.Textbox(
                    label="Search Query",
                    placeholder="Enter your search query...",
                    scale=4
                )
                search_btn = gr.Button("🔍 Search", scale=1, variant="primary")
            
            search_results = gr.Markdown(label="Search Results")
            
            search_btn.click(
                fn=search_database,
                inputs=[api_key_input, search_query],
                outputs=search_results
            )
        
        # ====================================================================
        # TAB 3: SESSION STATISTICS
        # ====================================================================
        with gr.Tab("📊 Session Statistics"):
            gr.Markdown("### Current Session Overview")
            stats_btn = gr.Button("📊 Refresh Statistics", variant="primary")
            stats_output = gr.Markdown()
            
            stats_btn.click(
                fn=show_stats,
                inputs=[api_key_input],
                outputs=stats_output
            )
        
        # ====================================================================
        # TAB 4: SYSTEM CONFIGURATION
        # ====================================================================
        with gr.Tab("⚙️ System Configuration"):
            config_display = gr.Markdown(SystemConfig.get_config_display())
            
            gr.Markdown("""
            ### Evidence-Based Framework v2.0
            
            **Core Innovations:**
            
            1. **Evidence Units (EUs)**: Every claim is extracted as a structured evidence unit with:
               - Type (skill_use, project, role, impact, publication, cert)
               - Credibility score (0-1) based on verifiability
               - Time information for recency decay
               - Quantified signals when available
            
            2. **Sigmoid Diminishing Returns**: Early evidence provides big gains, later evidence smaller gains
               - Prevents "resume padding" bias
               - Ensures concise, high-quality resumes score fairly
               - Formula: `score = 100 * sigmoid((raw - μ)/σ)`
            
            3. **Recency Decay**: Older evidence weighted less heavily
               - Skills: τ=36 months half-life
               - Certifications: τ=24 months half-life
               - Formula: `weight *= exp(-months_since / τ)`
            
            4. **Evidence Density Normalization**: Score per 1000 words
               - Neutralizes length bias
               - Rewards information density
            
            5. **Red Flag Detection**: Context-aware penalties
               - Job gaps, short tenures, frequent switches detected
               - Fair handling of freelance, layoffs, career breaks
               - Severity-based penalties (high: -50%, medium: -30%, low: -10%)
            
            6. **Positive Boosters**: Exceptional achievements rewarded
               - Awards: +5, Patents: +5, Major OSS: +3, Publications: +4
               - Capped at +15 total
            
            7. **Confidence Scoring**: Mathematical confidence in analysis
               - Formula: `0.4×credibility + 0.4×coverage + 0.2×consistency`
               - Used to adjust final scores
               - Low confidence flags for manual review
            
            8. **11-Metric Decomposition**: Comprehensive evaluation
               - Core Fit (60%): TDB, XR, OI, SC
               - Context Fit (25%): DA, LC, CE, GA
               - Risk/Logistics (15%): SR, AC, CF
            
            9. **Seniority Calibration**: Weights adjust by career level
               - Junior: Emphasis on growth potential and breadth
               - Senior: Emphasis on depth, outcomes, and complexity
               - Lead: Emphasis on leadership and strategic impact
            
            **Why This Works:**
            - ✓ Length-invariant: Verbose resumes don't win unfairly
            - ✓ Evidence-based: Only verifiable claims count
            - ✓ Mathematically rigorous: All scores auditable
            - ✓ Fair: Career breaks, pivots handled correctly
            - ✓ Transparent: Every point traceable to evidence
            """)
    
    gr.Markdown("""
    ---
    ### 📚 Quick Start Guide
    1. Get your [Gemini API key](https://aistudio.google.com/app/apikey) (free tier available)
    2. Upload a resume (PDF/DOCX/TXT)
    3. Paste the job description
    4. Click "Analyze Candidate"
    5. Review AI-powered insights with mathematical rigor
    
    **Note:** All data is session-based and not stored permanently.
    
    ---
    
    **Tech Stack:** Gradio • Google Gemini 2.0 • Plotly • scikit-learn • NumPy
    
    **Framework:** Evidence-Based v2.0 with Algorithmic Scoring
    """)

# ============================================================================
# LAUNCH
# ============================================================================

if __name__ == "__main__":
    demo.launch()