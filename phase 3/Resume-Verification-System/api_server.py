"""
Flask API Server for Resume Verification System
Exposes REST endpoints for Phase 3 features
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
import tempfile
import base64
import logging
from typing import Dict, Any

# Import our modules
try:
    from cv_parser import CVParser
    from claim_extractor import ClaimExtractor
    from evidence_validator import EvidenceValidator
    from red_flag_detector import RedFlagDetector
    from sota_checker import SOTAChecker
    from gemini_client import GeminiClient
    from report_generator import ReportGenerator
except ImportError as e:
    print(f"Failed to import modules: {e}")
    raise

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend integration

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global clients (will be initialized per request with API key)
clients = {}


def get_or_create_client(api_key: str) -> Dict[str, Any]:
    """Get or create Gemini client and related objects for an API key"""
    if api_key not in clients:
        try:
            gemini_client = GeminiClient(api_key)
            clients[api_key] = {
                'gemini': gemini_client,
                'cv_parser': CVParser(),
                'claim_extractor': ClaimExtractor(gemini_client),
                'evidence_validator': EvidenceValidator(gemini_client),
                'red_flag_detector': RedFlagDetector(gemini_client),
                'sota_checker': SOTAChecker(gemini_client),
                'report_generator': ReportGenerator()
            }
        except Exception as e:
            logger.error(f"Failed to create client: {e}")
            raise
    return clients[api_key]


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'Resume Verification'}), 200


@app.route('/api/analyze', methods=['POST'])
def analyze_resume():
    """
    Analyze a resume for verification and credibility

    Request body:
    {
        "api_key": "gemini_api_key",
        "resume_file": "base64_encoded_file_content",
        "filename": "resume.pdf",
        "seniority_level": "Mid",  # Intern, Junior, Mid, Senior, Lead
        "strictness": "Medium",     # Low, Medium, High
        "deep_analysis": false
    }
    """
    try:
        data = request.json

        # Validate required fields
        api_key = data.get('api_key')
        resume_b64 = data.get('resume_file')
        filename = data.get('filename', 'resume.pdf')
        seniority_level = data.get('seniority_level', 'Mid')
        strictness = data.get('strictness', 'Medium')
        deep_analysis = data.get('deep_analysis', False)

        if not api_key:
            return jsonify({'error': 'API key is required'}), 400

        if not resume_b64:
            return jsonify({'error': 'Resume file is required'}), 400

        # Get or create client
        try:
            client_objs = get_or_create_client(api_key)
        except Exception as e:
            return jsonify({'error': f'Failed to initialize: {str(e)}'}), 500

        # Decode base64 file and save temporarily
        try:
            file_content = base64.b64decode(resume_b64)
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp_file:
                tmp_file.write(file_content)
                tmp_file_path = tmp_file.name
        except Exception as e:
            return jsonify({'error': f'Failed to decode resume file: {str(e)}'}), 400

        try:
            # Step 1: Parse CV
            logger.info("Parsing CV...")
            parsed_cv = client_objs['cv_parser'].parse(tmp_file_path)

            # Step 2: Extract claims
            logger.info("Extracting claims...")
            claims_result = client_objs['claim_extractor'].extract_claims(
                parsed_cv['full_text'],
                parsed_cv.get('sections', {})
            )
            claims = claims_result.get('claims', [])

            # Step 3: Validate evidence
            logger.info("Validating evidence...")
            validation_result = client_objs['evidence_validator'].validate_resume(
                parsed_cv,
                claims,
                check_links=deep_analysis
            )

            # Step 4: Detect red flags
            logger.info("Detecting red flags...")
            red_flag_result = client_objs['red_flag_detector'].detect_red_flags(
                parsed_cv,
                claims,
                validation_result,
                seniority_level.lower(),
                strictness.lower()
            )

            # Step 5: SOTA check if deep analysis
            sota_result = None
            if deep_analysis:
                logger.info("Checking technology timeline...")
                try:
                    sota_result = client_objs['sota_checker'].check_timeline(
                        claims,
                        parsed_cv.get('timeline', {})
                    )
                except Exception as e:
                    logger.warning(f"SOTA check failed: {e}")

            # Compile results
            consistency_score = min(100, validation_result.get('consistency_score', 0) * 100)

            analysis_results = {
                'parsed_cv': {
                    'sections': list(parsed_cv.get('sections', {}).keys()),
                    'metadata': parsed_cv.get('metadata', {}),
                    'timeline_info': parsed_cv.get('timeline', {})
                },
                'total_claims': len(claims),
                'verified_claims': sum(1 for v in validation_result.get('validations', [])
                                     if v.get('verification_status') == 'verified'),
                'unverified_claims': sum(1 for v in validation_result.get('validations', [])
                                       if v.get('verification_status') == 'unverified'),
                'claims': claims[:50],  # Limit to first 50 for response size
                'claim_metrics': claims_result.get('metrics', {}),
                'validations': validation_result.get('validations', [])[:50],  # Limit
                'consistency_score': consistency_score,
                'red_flags': red_flag_result.get('red_flags', []),
                'credibility_score': red_flag_result.get('credibility_score', 0),
                'final_score': red_flag_result.get('final_score', 0),
                'total_red_flags': len(red_flag_result.get('red_flags', [])),
                'risk_assessment': red_flag_result.get('risk_assessment', 'MEDIUM'),
                'recommendation': red_flag_result.get('summary', {}).get('recommendation', 'No recommendation available'),
                'seniority_level': seniority_level,
                'strictness': strictness,
                'sota_result': sota_result
            }

            logger.info("Analysis complete!")

            return jsonify({
                'success': True,
                'analysis': analysis_results
            }), 200

        finally:
            # Clean up temp file
            if os.path.exists(tmp_file_path):
                os.remove(tmp_file_path)

    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500


@app.route('/api/generate-report', methods=['POST'])
def generate_report():
    """
    Generate a report from analysis results

    Request body:
    {
        "analysis_results": {...},
        "format": "html"  # html, json, or markdown
    }
    """
    try:
        data = request.json
        analysis_results = data.get('analysis_results')
        format_type = data.get('format', 'html')

        if not analysis_results:
            return jsonify({'error': 'Analysis results are required'}), 400

        # Generate report based on format
        if format_type == 'html':
            report = generate_html_report(analysis_results)
        elif format_type == 'json':
            report = json.dumps(analysis_results, indent=2)
        else:
            report = generate_markdown_report(analysis_results)

        return jsonify({
            'success': True,
            'report': report,
            'format': format_type
        }), 200

    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        return jsonify({'error': f'Report generation failed: {str(e)}'}), 500


def generate_html_report(results: Dict) -> str:
    """Generate a simple HTML report"""
    consistency_score = min(100, results.get('consistency_score', 0))

    html = f"""
    <html>
    <head>
        <title>Resume Verification Report</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 20px; }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; }}
            .score-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }}
            .score-card {{ background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; }}
            .section {{ margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 10px; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Resume Verification Report</h1>
            <p>Seniority Level: {results.get('seniority_level', 'Unknown')}</p>
        </div>

        <div class="score-grid">
            <div class="score-card">
                <h2>{results.get('final_score', 0):.1f}</h2>
                <p>Final Score</p>
            </div>
            <div class="score-card">
                <h2>{results.get('credibility_score', 0):.1f}</h2>
                <p>Credibility</p>
            </div>
            <div class="score-card">
                <h2>{consistency_score:.1f}</h2>
                <p>Consistency</p>
            </div>
            <div class="score-card">
                <h2>{results.get('risk_assessment', 'UNKNOWN')}</h2>
                <p>Risk Level</p>
            </div>
        </div>

        <div class="section">
            <h2>Analysis Summary</h2>
            <p><strong>Total Claims:</strong> {results.get('total_claims', 0)}</p>
            <p><strong>Verified Claims:</strong> {results.get('verified_claims', 0)}</p>
            <p><strong>Unverified Claims:</strong> {results.get('unverified_claims', 0)}</p>
            <p><strong>Red Flags:</strong> {results.get('total_red_flags', 0)}</p>
        </div>

        <div class="section">
            <h2>Recommendation</h2>
            <p>{results.get('recommendation', 'No recommendation available')}</p>
        </div>
    </body>
    </html>
    """
    return html


def generate_markdown_report(results: Dict) -> str:
    """Generate a markdown report"""
    consistency_score = min(100, results.get('consistency_score', 0))

    report = f"""
# Resume Verification Report

## Overall Assessment

- **Final Score:** {results.get('final_score', 0):.1f}/100
- **Credibility Score:** {results.get('credibility_score', 0):.1f}/100
- **Consistency Score:** {consistency_score:.1f}/100
- **Risk Level:** {results.get('risk_assessment', 'UNKNOWN')}

## Analysis Summary

- **Total Claims:** {results.get('total_claims', 0)}
- **Verified Claims:** {results.get('verified_claims', 0)}
- **Unverified Claims:** {results.get('unverified_claims', 0)}
- **Red Flags Detected:** {results.get('total_red_flags', 0)}

## Recommendation

{results.get('recommendation', 'No recommendation available')}

## Red Flags

"""
    for i, flag in enumerate(results.get('red_flags', [])[:10], 1):
        report += f"{i}. **[{flag.get('severity', 'unknown').upper()}]** {flag.get('description', 'Issue detected')}\n"

    return report


if __name__ == '__main__':
    # Run on port from environment variable (Cloud Run) or default to 5002
    import os
    port = int(os.environ.get('PORT', 5002))
    app.run(host='0.0.0.0', port=port, debug=False)
