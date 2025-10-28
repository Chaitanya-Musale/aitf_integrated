"""
Google Cloud Storage handler for CV files
"""
import os
import json
import logging
from typing import List, Dict
from google.cloud import storage
from google.cloud.exceptions import NotFound
from config import Config

logger = logging.getLogger(__name__)

class GCSHandler:
    """Handles Google Cloud Storage operations"""
    
    def __init__(self):
        # Set credentials if provided
        if Config.GOOGLE_APPLICATION_CREDENTIALS:
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = Config.GOOGLE_APPLICATION_CREDENTIALS
        
        self.client = storage.Client(project=Config.GCP_PROJECT_ID)
        self.bucket = self.client.bucket(Config.GCS_BUCKET)
        logger.info(f"Connected to GCS bucket: {Config.GCS_BUCKET}")
    
    def list_pdfs(self, prefix: str = "cvs/") -> List[str]:
        """List all PDF files in the bucket"""
        blobs = self.bucket.list_blobs(prefix=prefix)
        pdf_files = [blob.name for blob in blobs if blob.name.lower().endswith('.pdf')]
        logger.info(f"Found {len(pdf_files)} PDF files in bucket")
        return pdf_files
    
    def download_pdf(self, blob_name: str) -> bytes:
        """Download a PDF file from GCS"""
        try:
            blob = self.bucket.blob(blob_name)
            content = blob.download_as_bytes()
            logger.info(f"Downloaded {blob_name} ({len(content)} bytes)")
            return content
        except NotFound:
            logger.error(f"File not found: {blob_name}")
            raise
        except Exception as e:
            logger.error(f"Error downloading {blob_name}: {e}")
            raise
    
    def upload_json(self, data: Dict, destination: str) -> str:
        """Upload JSON data to GCS"""
        try:
            blob = self.bucket.blob(destination)
            blob.upload_from_string(
                json.dumps(data, indent=2, ensure_ascii=False),
                content_type='application/json'
            )
            logger.info(f"Uploaded JSON to {destination}")
            return f"gs://{Config.GCS_BUCKET}/{destination}"
        except Exception as e:
            logger.error(f"Error uploading JSON: {e}")
            raise
    
    def upload_html(self, html_content: str, destination: str) -> str:
        """Upload HTML content to GCS"""
        try:
            blob = self.bucket.blob(destination)
            blob.upload_from_string(html_content, content_type='text/html')
            logger.info(f"Uploaded HTML to {destination}")
            return f"gs://{Config.GCS_BUCKET}/{destination}"
        except Exception as e:
            logger.error(f"Error uploading HTML: {e}")
            raise
    
    def file_exists(self, blob_name: str) -> bool:
        """Check if a file exists in GCS"""
        blob = self.bucket.blob(blob_name)
        return blob.exists()
    
    def get_file_metadata(self, blob_name: str) -> Dict:
        """Get metadata for a file in GCS"""
        try:
            blob = self.bucket.blob(blob_name)
            blob.reload()
            return {
                'name': blob.name,
                'size': blob.size,
                'content_type': blob.content_type,
                'created': blob.time_created,
                'updated': blob.updated,
                'md5_hash': blob.md5_hash,
                'etag': blob.etag
            }
        except Exception as e:
            logger.error(f"Error getting metadata for {blob_name}: {e}")
            return {}