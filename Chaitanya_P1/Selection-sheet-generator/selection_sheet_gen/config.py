"""
Central configuration for the recruitment system
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Application configuration from environment variables"""
    
    # GCP Configuration
    GCP_PROJECT_ID = os.getenv('GCP_PROJECT_ID', 'aitf-474614')
    GCS_BUCKET = os.getenv('GCS_BUCKET', 'aitf-internship')
    GOOGLE_APPLICATION_CREDENTIALS = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    
    # Database Configuration
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = int(os.getenv('DB_PORT', 5432))
    DB_NAME = os.getenv('DB_NAME', 'recruitment')
    DB_USER = os.getenv('DB_USER', 'postgres')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '12345678')
    
    # Gemini Configuration
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-pro')
    
    # JWT Configuration
    JWT_SECRET = os.getenv('JWT_SECRET', 'your_super_secret_jwt_key_here')
    JWT_EXPIRES_IN = os.getenv('JWT_EXPIRES_IN', '24h')
    
    # Email Configuration
    EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
    EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
    EMAIL_USER = os.getenv('EMAIL_USER')
    EMAIL_PASS = os.getenv('EMAIL_PASS')
    EMAIL_FROM = os.getenv('EMAIL_FROM')
    
    # Server Configuration
    PORT = int(os.getenv('PORT', 5000))
    NODE_ENV = os.getenv('NODE_ENV', 'development')
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')
    
    # Processing Configuration
    MAX_WORKERS = int(os.getenv('MAX_WORKERS', 5))
    BATCH_SIZE = int(os.getenv('BATCH_SIZE', 10))
    ENABLE_OCR = os.getenv('ENABLE_OCR', 'true').lower() == 'true'
    
    # Cache Configuration
    CACHE_MAX_SIZE = int(os.getenv('CACHE_MAX_SIZE', 100))
    CACHE_EXPIRY_HOURS = int(os.getenv('CACHE_EXPIRY_HOURS', 24))
    
    # Model Configuration
    MODEL_VERSION = "v2.0"
    JOB_HOPPING_THRESHOLD = 1.5

GEMINI_API_KEY = Config.GEMINI_API_KEY
GEMINI_MODEL = Config.GEMINI_MODEL