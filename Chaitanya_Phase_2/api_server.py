"""
Flask API Server for AI Candidate Screening System
Exposes REST endpoints for Phase 2 features
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
import tempfile
import base64

# Import our modules
from config import SystemConfig
from models import GeminiScreeningEngine
from utils import DocumentParser, HTMLFormatter
from visualizations import CandidateVisualizations

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend integration

# Global screening engine instance
screening_engine = None


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'AI Candidate Screening'}), 200


@app.route('/api/analyze', methods=['POST'])
def analyze_candidate():
    """
    Analyze a candidate's resume against a job description

    Request body:
    {
        "api_key": "gemini_api_key",
        "resume_file": "base64_encoded_file_content",
        "filename": "resume.pdf",
        "job_description": "job description text",
        "additional_context": "optional context"
    }
    """
    global screening_engine

    try:
        data = request.json

        # Validate required fields
        api_key = data.get('api_key')
        resume_b64 = data.get('resume_file')
        filename = data.get('filename', 'resume.pdf')
        job_desc = data.get('job_description')
        additional_context = data.get('additional_context', '')

        if not api_key:
            return jsonify({'error': 'API key is required'}), 400

        if not resume_b64:
            return jsonify({'error': 'Resume file is required'}), 400

        if not job_desc:
            return jsonify({'error': 'Job description is required'}), 400

        # Initialize engine if needed
        if screening_engine is None or screening_engine.api_key != api_key:
            try:
                screening_engine = GeminiScreeningEngine(api_key)
            except Exception as e:
                return jsonify({'error': f'Failed to initialize engine: {str(e)}'}), 500

        # Decode base64 file and save temporarily
        try:
            file_content = base64.b64decode(resume_b64)
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp_file:
                tmp_file.write(file_content)
                tmp_file_path = tmp_file.name
        except Exception as e:
            return jsonify({'error': f'Failed to decode resume file: {str(e)}'}), 400

        # Parse resume
        try:
            resume_text = DocumentParser.parse_resume(tmp_file_path)
            if resume_text.startswith("❌") or resume_text.startswith("⚠️"):
                return jsonify({'error': resume_text}), 400
        finally:
            # Clean up temp file
            if os.path.exists(tmp_file_path):
                os.remove(tmp_file_path)

        # Analyze candidate
        analysis = screening_engine.analyze_candidate(resume_text, job_desc, additional_context)

        if "error" in analysis:
            return jsonify({'error': analysis['error']}), 500

        # Generate visualizations (as base64 encoded images)
        try:
            radar_chart = CandidateVisualizations.create_radar_chart(analysis)
            confidence = analysis.get('confidence_score', analysis.get('confidence_analysis', {}).get('overall_confidence', None))
            gauge_chart = CandidateVisualizations.create_gauge_chart(
                analysis.get('final_weighted_score', 0),
                confidence
            )

            # Convert plotly figures to JSON for frontend rendering
            radar_json = radar_chart.to_json() if radar_chart else None
            gauge_json = gauge_chart.to_json() if gauge_chart else None
        except Exception as e:
            radar_json = None
            gauge_json = None

        # Generate HTML report
        html_report = HTMLFormatter.format_analysis_html(analysis)

        response = {
            'success': True,
            'analysis': analysis,
            'html_report': html_report,
            'radar_chart': radar_json,
            'gauge_chart': gauge_json
        }

        return jsonify(response), 200

    except Exception as e:
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500


@app.route('/api/search', methods=['POST'])
def search_candidates():
    """
    Search through analyzed candidates

    Request body:
    {
        "api_key": "gemini_api_key",
        "query": "search query"
    }
    """
    global screening_engine

    try:
        data = request.json
        api_key = data.get('api_key')
        query = data.get('query')

        if not api_key or not query:
            return jsonify({'error': 'API key and query are required'}), 400

        if screening_engine is None:
            return jsonify({'error': 'No candidates analyzed yet. Please analyze at least one candidate first.'}), 400

        results = screening_engine.search_candidates(query)

        return jsonify({
            'success': True,
            'results': results
        }), 200

    except Exception as e:
        return jsonify({'error': f'Search failed: {str(e)}'}), 500


@app.route('/api/stats', methods=['POST'])
def get_statistics():
    """
    Get session statistics

    Request body:
    {
        "api_key": "gemini_api_key"
    }
    """
    global screening_engine

    try:
        data = request.json
        api_key = data.get('api_key')

        if not api_key:
            return jsonify({'error': 'API key is required'}), 400

        if screening_engine is None:
            return jsonify({'error': 'No candidates analyzed yet'}), 400

        stats = screening_engine.get_session_statistics()

        return jsonify({
            'success': True,
            'statistics': stats
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to get statistics: {str(e)}'}), 500


@app.route('/api/config', methods=['GET'])
def get_config():
    """Get system configuration"""
    try:
        config_display = SystemConfig.get_config_display()
        return jsonify({
            'success': True,
            'config': config_display
        }), 200
    except Exception as e:
        return jsonify({'error': f'Failed to get config: {str(e)}'}), 500


if __name__ == '__main__':
    # Run on port 5001 to avoid conflicts
    app.run(host='0.0.0.0', port=5001, debug=False)
