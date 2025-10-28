"""
PDF text extraction with multiple methods
"""
import io
import logging
import PyPDF2
import pdfplumber
from typing import Optional
from config import Config

logger = logging.getLogger(__name__)

class PDFExtractor:
    """Extracts text from PDF files with fallback to OCR"""
    
    @staticmethod
    def extract_text(pdf_content: bytes) -> str:
        """Extract text from PDF with multiple methods"""
        text = ""
        
        # Method 1: Try pdfplumber (best for most PDFs)
        try:
            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            
            if text.strip():
                logger.info("Text extracted using pdfplumber")
                return text
        except Exception as e:
            logger.warning(f"pdfplumber failed: {e}")
        
        # Method 2: Try PyPDF2
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            
            if text.strip():
                logger.info("Text extracted using PyPDF2")
                return text
        except Exception as e:
            logger.warning(f"PyPDF2 failed: {e}")
        
        # Method 3: OCR for scanned PDFs (if enabled)
        if Config.ENABLE_OCR:
            try:
                from pdf2image import convert_from_bytes
                import pytesseract
                
                logger.info("Attempting OCR extraction...")
                images = convert_from_bytes(pdf_content)
                for i, image in enumerate(images):
                    page_text = pytesseract.image_to_string(image)
                    text += page_text + "\n"
                    logger.debug(f"OCR extracted page {i+1}")
                
                if text.strip():
                    logger.info("Text extracted using OCR")
                    return text
            except ImportError:
                logger.warning("OCR libraries not installed (pdf2image, pytesseract)")
            except Exception as e:
                logger.warning(f"OCR failed: {e}")
        
        logger.error("All text extraction methods failed")
        return text
    
    @staticmethod
    def extract_metadata(pdf_content: bytes) -> dict:
        """Extract PDF metadata"""
        metadata = {}
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
            if pdf_reader.metadata:
                metadata = {
                    'title': pdf_reader.metadata.get('/Title', ''),
                    'author': pdf_reader.metadata.get('/Author', ''),
                    'subject': pdf_reader.metadata.get('/Subject', ''),
                    'creator': pdf_reader.metadata.get('/Creator', ''),
                    'pages': len(pdf_reader.pages)
                }
        except Exception as e:
            logger.warning(f"Could not extract metadata: {e}")
        
        return metadata