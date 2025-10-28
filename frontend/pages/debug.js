import { useEffect, useState } from 'react';

export default function Debug() {
  const [apiUrl, setApiUrl] = useState('');
  const [backendHealth, setBackendHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Get the API URL from environment
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    setApiUrl(url);

    // Test backend connection
    const testBackend = async () => {
      try {
        const response = await fetch(`${url}/health`);
        const data = await response.json();
        setBackendHealth(data);
      } catch (err) {
        setError(err.message);
      }
    };

    testBackend();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Debug Information</h1>
      
      <h2>Environment Variables</h2>
      <p><strong>NEXT_PUBLIC_API_URL:</strong> {apiUrl}</p>
      <p><strong>NODE_ENV:</strong> {process.env.NODE_ENV}</p>
      
      <h2>Backend Health Check</h2>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {backendHealth && (
        <pre style={{ background: '#f0f0f0', padding: '10px' }}>
          {JSON.stringify(backendHealth, null, 2)}
        </pre>
      )}
      
      <h2>Test API Call</h2>
      <button onClick={async () => {
        try {
          const response = await fetch(`${apiUrl}/debug`);
          const data = await response.json();
          console.log('Backend debug:', data);
          alert('Check console for backend debug info');
        } catch (err) {
          alert('Error: ' + err.message);
        }
      }}>
        Test Backend Debug Endpoint
      </button>
    </div>
  );
}