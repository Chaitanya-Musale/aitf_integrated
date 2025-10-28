#!/usr/bin/env python
"""
Resume Verification System - Installation Test
Tests basic functionality of all modules
"""

import sys
import json
from datetime import datetime

def test_imports():
    """Test that all modules can be imported"""
    print("Testing module imports...")
    
    try:
        from modules.cv_parser import CVParser
        print("  ✓ CV Parser module")
    except ImportError as e:
        print(f"  ✗ CV Parser module: {e}")
        return False
        
    try:
        from modules.claim_extractor import ClaimExtractor
        print("  ✓ Claim Extractor module")
    except ImportError as e:
        print(f"  ✗ Claim Extractor module: {e}")
        return False
        
    try:
        from modules.evidence_validator import EvidenceValidator
        print("  ✓ Evidence Validator module")
    except ImportError as e:
        print(f"  ✗ Evidence Validator module: {e}")
        return False
        
    try:
        from modules.red_flag_detector import RedFlagDetector
        print("  ✓ Red Flag Detector module")
    except ImportError as e:
        print(f"  ✗ Red Flag Detector module: {e}")
        return False
        
    try:
        from modules.sota_checker import SOTAChecker
        print("  ✓ SOTA Checker module")
    except ImportError as e:
        print(f"  ✗ SOTA Checker module: {e}")
        return False
        
    try:
        from utils.gemini_client import GeminiClient, MockGeminiClient
        print("  ✓ Gemini Client utilities")
    except ImportError as e:
        print(f"  ✗ Gemini Client utilities: {e}")
        return False
        
    try:
        from visualization.evidence_heatmap import EvidenceHeatmap
        print("  ✓ Visualization modules")
    except ImportError as e:
        print(f"  ✗ Visualization modules: {e}")
        return False
        
    try:
        from visualization.report_generator import ReportGenerator
        print("  ✓ Report Generator module")
    except ImportError as e:
        print(f"  ✗ Report Generator module: {e}")
        return False
        
    return True

def test_mock_client():
    """Test mock client functionality"""
    print("\nTesting mock client...")
    
    try:
        from utils.gemini_client import MockGeminiClient
        
        client = MockGeminiClient()
        response = client.generate_content("extract claims from resume")
        parsed = client.validate_json_response(response)
        
        if parsed and 'claims' in parsed:
            print("  ✓ Mock client working")
            return True
        else:
            print("  ✗ Mock client not returning expected format")
            return False
            
    except Exception as e:
        print(f"  ✗ Mock client error: {e}")
        return False

def test_sample_parsing():
    """Test parsing a sample text"""
    print("\nTesting CV parser with sample text...")
    
    try:
        from modules.cv_parser import CVParser
        import tempfile
        
        # Create sample CV text
        sample_cv = """
        John Doe
        Senior Software Engineer
        
        WORK EXPERIENCE
        Software Engineer at TechCorp (2020-2023)
        - Developed microservices architecture
        - Improved system performance by 40%
        
        SKILLS
        Python, JavaScript, Docker, Kubernetes
        
        PROJECTS
        Built e-commerce platform serving 10,000 users
        """
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(sample_cv)
            temp_path = f.name
            
        # Parse
        parser = CVParser()
        result = parser.parse(temp_path)
        
        if result and 'sections' in result:
            print("  ✓ Parser successfully processed sample CV")
            print(f"    Found {len(result['sections'])} sections")
            return True
        else:
            print("  ✗ Parser failed to process sample CV")
            return False
            
    except Exception as e:
        print(f"  ✗ Parser error: {e}")
        return False

def test_gradio_import():
    """Test Gradio import"""
    print("\nTesting Gradio import...")
    
    try:
        import gradio as gr
        print(f"  ✓ Gradio version {gr.__version__} imported successfully")
        return True
    except ImportError:
        print("  ✗ Gradio not installed. Run: pip install gradio")
        return False

def main():
    """Run all tests"""
    print("=" * 50)
    print("Resume Verification System - Installation Test")
    print("=" * 50)
    print()
    
    all_passed = True
    
    # Run tests
    if not test_imports():
        all_passed = False
        
    if not test_mock_client():
        all_passed = False
        
    if not test_sample_parsing():
        all_passed = False
        
    if not test_gradio_import():
        all_passed = False
        
    # Summary
    print("\n" + "=" * 50)
    if all_passed:
        print("✅ All tests passed! Installation is working correctly.")
        print("\nYou can now run the application with:")
        print("  python app.py")
    else:
        print("❌ Some tests failed. Please check the errors above.")
        print("\nTry running:")
        print("  pip install -r requirements.txt")
        
    print("=" * 50)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())