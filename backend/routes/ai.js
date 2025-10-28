/**
 * AI Analysis Routes
 * Proxy routes to Python Flask API servers for Phase 2 and Phase 3 features
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const pool = require('../config/database');

// Configuration for Python AI services
const PHASE2_SERVICE_URL = process.env.PHASE2_SERVICE_URL || 'http://localhost:5001';
const PHASE3_SERVICE_URL = process.env.PHASE3_SERVICE_URL || 'http://localhost:5002';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Health check for AI services
 */
router.get('/health', async (req, res) => {
  try {
    const [phase2Health, phase3Health] = await Promise.allSettled([
      axios.get(`${PHASE2_SERVICE_URL}/health`, { timeout: 5000 }),
      axios.get(`${PHASE3_SERVICE_URL}/health`, { timeout: 5000 })
    ]);

    res.json({
      phase2: {
        status: phase2Health.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        url: PHASE2_SERVICE_URL
      },
      phase3: {
        status: phase3Health.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        url: PHASE3_SERVICE_URL
      }
    });
  } catch (error) {
    console.error('AI health check error:', error.message);
    res.status(500).json({ error: 'Failed to check AI services health' });
  }
});

/**
 * Phase 2: AI Candidate Screening
 * POST /api/ai/screening/analyze
 */
router.post('/screening/analyze', authenticateToken, authorizeRoles(['hr', 'admin']), async (req, res) => {
  try {
    const { candidateId, jobDescription, additionalContext } = req.body;

    if (!candidateId) {
      return res.status(400).json({ error: 'Candidate ID is required' });
    }

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required' });
    }

    // Get candidate's resume from database
    const candidateResult = await pool.query(
      'SELECT id, name, resume_url, email FROM candidates WHERE id = $1',
      [candidateId]
    );

    if (candidateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const candidate = candidateResult.rows[0];

    // Check if resume exists
    if (!candidate.resume_url) {
      return res.status(400).json({ error: 'Candidate does not have a resume uploaded' });
    }

    // Download resume file from GCS or local storage
    // For now, we'll assume the resume_url is accessible
    // In production, you'd fetch from GCS using the helper
    const resumePath = candidate.resume_url;

    // Read file and convert to base64
    let resumeBase64;
    try {
      if (fs.existsSync(resumePath)) {
        const resumeBuffer = fs.readFileSync(resumePath);
        resumeBase64 = resumeBuffer.toString('base64');
      } else {
        return res.status(404).json({ error: 'Resume file not found on server' });
      }
    } catch (fileError) {
      console.error('Error reading resume:', fileError);
      return res.status(500).json({ error: 'Failed to read resume file' });
    }

    // Call Phase 2 API
    const phase2Response = await axios.post(
      `${PHASE2_SERVICE_URL}/api/analyze`,
      {
        api_key: GEMINI_API_KEY,
        resume_file: resumeBase64,
        filename: resumePath.split('/').pop(),
        job_description: jobDescription,
        additional_context: additionalContext || ''
      },
      { timeout: 120000 } // 2 minute timeout
    );

    const analysisResult = phase2Response.data;

    // Store analysis result in database
    if (analysisResult.success) {
      await pool.query(
        `UPDATE candidates
         SET ai_summary = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify({
          type: 'phase2_screening',
          analysis: analysisResult.analysis,
          analyzed_at: new Date().toISOString(),
          analyzed_by: req.user.id
        }), candidateId]
      );
    }

    res.json({
      success: true,
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email
      },
      analysis: analysisResult
    });

  } catch (error) {
    console.error('Phase 2 analysis error:', error.message);
    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Phase 2 service error'
      });
    }
    res.status(500).json({ error: 'Failed to analyze candidate' });
  }
});

/**
 * Phase 3: Resume Verification
 * POST /api/ai/verification/analyze
 */
router.post('/verification/analyze', authenticateToken, authorizeRoles(['hr', 'admin']), async (req, res) => {
  try {
    const {
      candidateId,
      seniorityLevel = 'Mid',
      strictness = 'Medium',
      deepAnalysis = false
    } = req.body;

    if (!candidateId) {
      return res.status(400).json({ error: 'Candidate ID is required' });
    }

    // Get candidate's resume from database
    const candidateResult = await pool.query(
      'SELECT id, name, resume_url, email FROM candidates WHERE id = $1',
      [candidateId]
    );

    if (candidateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const candidate = candidateResult.rows[0];

    if (!candidate.resume_url) {
      return res.status(400).json({ error: 'Candidate does not have a resume uploaded' });
    }

    // Read file and convert to base64
    let resumeBase64;
    const resumePath = candidate.resume_url;
    try {
      if (fs.existsSync(resumePath)) {
        const resumeBuffer = fs.readFileSync(resumePath);
        resumeBase64 = resumeBuffer.toString('base64');
      } else {
        return res.status(404).json({ error: 'Resume file not found on server' });
      }
    } catch (fileError) {
      console.error('Error reading resume:', fileError);
      return res.status(500).json({ error: 'Failed to read resume file' });
    }

    // Call Phase 3 API
    const phase3Response = await axios.post(
      `${PHASE3_SERVICE_URL}/api/analyze`,
      {
        api_key: GEMINI_API_KEY,
        resume_file: resumeBase64,
        filename: resumePath.split('/').pop(),
        seniority_level: seniorityLevel,
        strictness: strictness,
        deep_analysis: deepAnalysis
      },
      { timeout: 180000 } // 3 minute timeout for deep analysis
    );

    const analysisResult = phase3Response.data;

    // Store analysis result in database
    if (analysisResult.success) {
      await pool.query(
        `UPDATE candidates
         SET ai_summary = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify({
          type: 'phase3_verification',
          analysis: analysisResult.analysis,
          analyzed_at: new Date().toISOString(),
          analyzed_by: req.user.id
        }), candidateId]
      );
    }

    res.json({
      success: true,
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email
      },
      analysis: analysisResult
    });

  } catch (error) {
    console.error('Phase 3 analysis error:', error.message);
    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Phase 3 service error'
      });
    }
    res.status(500).json({ error: 'Failed to verify resume' });
  }
});

/**
 * Generate report from Phase 3 analysis
 * POST /api/ai/verification/report
 */
router.post('/verification/report', authenticateToken, authorizeRoles(['hr', 'admin']), async (req, res) => {
  try {
    const { analysisResults, format = 'html' } = req.body;

    if (!analysisResults) {
      return res.status(400).json({ error: 'Analysis results are required' });
    }

    // Call Phase 3 report generation API
    const reportResponse = await axios.post(
      `${PHASE3_SERVICE_URL}/api/generate-report`,
      {
        analysis_results: analysisResults,
        format: format
      },
      { timeout: 30000 }
    );

    res.json(reportResponse.data);

  } catch (error) {
    console.error('Report generation error:', error.message);
    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Report generation failed'
      });
    }
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * Get AI analysis history for a candidate
 * GET /api/ai/candidate/:id/history
 */
router.get('/candidate/:id/history', authenticateToken, authorizeRoles(['hr', 'admin']), async (req, res) => {
  try {
    const candidateId = req.params.id;

    const result = await pool.query(
      `SELECT id, name, email, ai_summary, updated_at
       FROM candidates
       WHERE id = $1`,
      [candidateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const candidate = result.rows[0];

    res.json({
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email
      },
      ai_summary: candidate.ai_summary,
      last_updated: candidate.updated_at
    });

  } catch (error) {
    console.error('Get AI history error:', error);
    res.status(500).json({ error: 'Failed to get AI analysis history' });
  }
});

module.exports = router;
