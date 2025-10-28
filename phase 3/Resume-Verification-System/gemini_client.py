"""
Gemini API Client Wrapper
Handles API interactions with rate limiting, retries, and caching
"""

import time
import json
import hashlib
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import logging
from functools import wraps

# Optional imports
try:
    import backoff
    HAS_BACKOFF = True
except ImportError:
    HAS_BACKOFF = False

try:
    from ratelimit import limits, sleep_and_retry
    HAS_RATELIMIT = True
except ImportError:
    HAS_RATELIMIT = False

try:
    import google.generativeai as genai
    from google.generativeai.types import HarmCategory, HarmBlockThreshold
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

logger = logging.getLogger(__name__)

class GeminiClient:
    """
    Wrapper for Google Gemini API with enhanced features:
    - Rate limiting and backoff
    - Response caching
    - Error handling and retries
    - Token usage tracking
    """
    
    # API limits for Gemini Flash 2.5
    RATE_LIMITS = {
        'requests_per_minute': 60,
        'tokens_per_minute': 1000000,
        'requests_per_day': 1500
    }
    
    def __init__(self, 
                 api_key: str,
                 model_name: str = 'gemini-2.0-flash-exp',
                 enable_caching: bool = True,
                 cache_ttl: int = 3600):
        """
        Initialize Gemini client
        
        Args:
            api_key: Google AI API key
            model_name: Gemini model to use
            enable_caching: Enable response caching
            cache_ttl: Cache time-to-live in seconds
        """
        if not api_key:
            raise ValueError("API key is required")
        
        if not HAS_GENAI:
            raise ImportError("google-generativeai package is required")
            
        genai.configure(api_key=api_key)
        
        self.model = genai.GenerativeModel(
            model_name=model_name,
            safety_settings={
                HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
            }
        )
        
        self.model_name = model_name
        self.enable_caching = enable_caching
        self.cache_ttl = cache_ttl
        self.response_cache = {} if enable_caching else None
        
        # Usage tracking
        self.usage_stats = {
            'total_requests': 0,
            'total_tokens': 0,
            'cache_hits': 0,
            'errors': 0,
            'start_time': datetime.now()
        }
        
    def generate_content(self,
                        prompt: str,
                        generation_config: Optional[Dict] = None,
                        use_cache: bool = True) -> Any:
        """
        Generate content with rate limiting and retries
        
        Args:
            prompt: Input prompt for the model
            generation_config: Generation parameters
            use_cache: Whether to use cached response if available
            
        Returns:
            Model response
        """
        # Check cache
        if self.enable_caching and use_cache:
            cache_key = self._get_cache_key(prompt, generation_config)
            cached_response = self._get_cached_response(cache_key)
            
            if cached_response:
                self.usage_stats['cache_hits'] += 1
                logger.debug(f"Cache hit for prompt hash: {cache_key[:8]}")
                return cached_response
                
        # Default generation config
        if generation_config is None:
            generation_config = {
                'temperature': 0.2,
                'top_p': 0.95,
                'top_k': 40,
                'max_output_tokens': 4096,
            }
            
        try:
            # Make API call
            logger.debug(f"Calling Gemini API with {len(prompt)} character prompt")
            
            if HAS_GENAI:
                response = self.model.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(**generation_config)
                )
            else:
                # Fallback for when genai is not available
                class MockResponse:
                    def __init__(self):
                        self.text = json.dumps({"status": "mock", "message": "google-generativeai not installed"})
                response = MockResponse()
            
            # Update usage stats
            self.usage_stats['total_requests'] += 1
            
            # Estimate tokens (rough approximation)
            estimated_tokens = len(prompt) // 4 + len(response.text) // 4
            self.usage_stats['total_tokens'] += estimated_tokens
            
            # Cache response
            if self.enable_caching:
                cache_key = self._get_cache_key(prompt, generation_config)
                self._cache_response(cache_key, response)
                
            return response
            
        except Exception as e:
            self.usage_stats['errors'] += 1
            logger.error(f"Gemini API error: {e}")
            raise
            
    def batch_generate(self,
                      prompts: List[str],
                      generation_config: Optional[Dict] = None,
                      max_concurrent: int = 5) -> List[Any]:
        """
        Generate content for multiple prompts with concurrency control
        
        Args:
            prompts: List of prompts
            generation_config: Generation parameters
            max_concurrent: Maximum concurrent requests
            
        Returns:
            List of responses
        """
        responses = []
        
        # Process in batches to respect rate limits
        for i in range(0, len(prompts), max_concurrent):
            batch = prompts[i:i + max_concurrent]
            
            batch_responses = []
            for prompt in batch:
                try:
                    response = self.generate_content(prompt, generation_config)
                    batch_responses.append(response)
                except Exception as e:
                    logger.error(f"Failed to process prompt: {e}")
                    batch_responses.append(None)
                    
                # Small delay between requests
                time.sleep(0.1)
                
            responses.extend(batch_responses)
            
        return responses
        
    def validate_json_response(self, response: Any) -> Optional[Dict]:
        """
        Validate and parse JSON response
        
        Args:
            response: Gemini API response
            
        Returns:
            Parsed JSON or None if invalid
        """
        try:
            # Extract text from response
            if hasattr(response, 'text'):
                text = response.text
            else:
                text = str(response)
                
            # Clean up response (remove markdown code blocks if present)
            if '```json' in text:
                text = text.split('```json')[1].split('```')[0]
            elif '```' in text:
                text = text.split('```')[1].split('```')[0]
                
            # Parse JSON
            return json.loads(text.strip())
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            logger.debug(f"Raw response: {text[:500]}")
            return None
            
    def _get_cache_key(self, prompt: str, config: Optional[Dict]) -> str:
        """
        Generate cache key for prompt and config
        """
        key_data = f"{prompt}:{json.dumps(config, sort_keys=True) if config else ''}"
        return hashlib.sha256(key_data.encode()).hexdigest()
        
    def _get_cached_response(self, cache_key: str) -> Optional[Any]:
        """
        Get cached response if available and not expired
        """
        if not self.response_cache or cache_key not in self.response_cache:
            return None
            
        cached = self.response_cache[cache_key]
        
        # Check if expired
        if datetime.now() - cached['timestamp'] > timedelta(seconds=self.cache_ttl):
            del self.response_cache[cache_key]
            return None
            
        return cached['response']
        
    def _cache_response(self, cache_key: str, response: Any) -> None:
        """
        Cache response with timestamp
        """
        if self.response_cache is not None:
            self.response_cache[cache_key] = {
                'response': response,
                'timestamp': datetime.now()
            }
            
            # Limit cache size
            if len(self.response_cache) > 100:
                # Remove oldest entries
                sorted_cache = sorted(
                    self.response_cache.items(),
                    key=lambda x: x[1]['timestamp']
                )
                self.response_cache = dict(sorted_cache[-50:])
                
    def get_usage_stats(self) -> Dict[str, Any]:
        """
        Get API usage statistics
        """
        runtime = datetime.now() - self.usage_stats['start_time']
        
        return {
            **self.usage_stats,
            'runtime_seconds': runtime.total_seconds(),
            'avg_tokens_per_request': (
                self.usage_stats['total_tokens'] / self.usage_stats['total_requests']
                if self.usage_stats['total_requests'] > 0 else 0
            ),
            'cache_hit_rate': (
                self.usage_stats['cache_hits'] / self.usage_stats['total_requests']
                if self.usage_stats['total_requests'] > 0 else 0
            ),
            'error_rate': (
                self.usage_stats['errors'] / self.usage_stats['total_requests']
                if self.usage_stats['total_requests'] > 0 else 0
            )
        }
        
    def clear_cache(self) -> None:
        """
        Clear response cache
        """
        if self.response_cache:
            self.response_cache.clear()
            logger.info("Response cache cleared")
            
    def test_connection(self) -> bool:
        """
        Test API connection with a simple prompt
        """
        try:
            response = self.generate_content(
                "Return 'OK' if you can read this",
                generation_config={'temperature': 0, 'max_output_tokens': 10},
                use_cache=False
            )
            return 'OK' in response.text
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False

class MockGeminiClient:
    """
    Mock client for testing without API calls
    """
    
    def __init__(self):
        self.usage_stats = {
            'total_requests': 0,
            'total_tokens': 0,
            'cache_hits': 0,
            'errors': 0,
            'start_time': datetime.now()
        }
        
    def generate_content(self, prompt: str, generation_config: Optional[Dict] = None) -> Any:
        """
        Generate mock response
        """
        self.usage_stats['total_requests'] += 1
        
        # Return mock structured response based on prompt content
        if 'extract' in prompt.lower():
            response = {
                'claims': [
                    {
                        'claim_id': 'mock_001',
                        'claim_text': 'Led development of microservices architecture',
                        'category': 'work_experience',
                        'quantifiable_metrics': ['30% improvement'],
                        'verifiability_level': 'medium'
                    }
                ]
            }
        elif 'validate' in prompt.lower():
            response = {
                'validations': [
                    {
                        'claim_id': 'mock_001',
                        'evidence_score': 0.7,
                        'evidence_type': 'contextual'
                    }
                ]
            }
        elif 'red flag' in prompt.lower():
            response = {
                'red_flags': [
                    {
                        'flag_id': 'flag_001',
                        'severity': 'medium',
                        'description': 'Timeline inconsistency detected'
                    }
                ]
            }
        else:
            response = {'status': 'ok'}
            
        # Create mock response object
        class MockResponse:
            def __init__(self, text):
                self.text = json.dumps(text)
                
        return MockResponse(response)
        
    def validate_json_response(self, response: Any) -> Optional[Dict]:
        """
        Validate mock response
        """
        try:
            return json.loads(response.text)
        except:
            return None
            
    def get_usage_stats(self) -> Dict[str, Any]:
        """
        Get mock usage stats
        """
        return self.usage_stats
        
    def test_connection(self) -> bool:
        """
        Always returns True for mock
        """
        return True