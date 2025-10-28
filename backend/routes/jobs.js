const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createRecruitmentSheet } = require('../utils/sheets');

const router = express.Router();

// Get all jobs (HR only)
router.get('/', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const { status = 'active' } = req.query;

    const result = await pool.query(`
      SELECT j.*, 
             u.name as created_by_name,
             COUNT(ir.id) as rounds_count
      FROM jobs j 
      LEFT JOIN users u ON j.created_by = u.id
      LEFT JOIN interview_rounds ir ON j.id = ir.job_id
      WHERE j.status = $1
      GROUP BY j.id, u.name
      ORDER BY j.created_at DESC
    `, [status]);

    res.json({ jobs: result.rows });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get jobs for interviewer (only jobs where they have assignments)
router.get('/interviewer/:interviewerId', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { interviewerId } = req.params;
    const { status = 'active' } = req.query;

    // Verify the interviewer can access this data
    const userRoles = req.user.roles || [];
    const isHROrAdmin = userRoles.includes('HR') || userRoles.includes('Admin');
    
    if (!isHROrAdmin && parseInt(interviewerId) !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view your own assignments.' });
    }

    const result = await pool.query(`
      SELECT DISTINCT j.*, 
             u.name as created_by_name,
             COUNT(DISTINCT ir.id) as rounds_count
      FROM jobs j 
      LEFT JOIN users u ON j.created_by = u.id
      LEFT JOIN interview_rounds ir ON j.id = ir.job_id
      LEFT JOIN interview_assignments ia ON ir.id = ia.round_id
      LEFT JOIN candidate_rounds cr ON ia.candidate_id = cr.candidate_id AND ia.round_id = cr.round_id
      WHERE j.status = $1 AND ia.interviewer_id = $2 
      AND cr.status IN ('scheduled', 'completed', 'accepted', 'rejected')
      GROUP BY j.id, u.name
      ORDER BY j.created_at DESC
    `, [status, interviewerId]);

    res.json({ jobs: result.rows });
  } catch (error) {
    console.error('Get jobs for interviewer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single job with rounds
router.get('/:id', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { id } = req.params;

    const jobResult = await pool.query(`
      SELECT j.*, u.name as created_by_name
      FROM jobs j 
      LEFT JOIN users u ON j.created_by = u.id
      WHERE j.id = $1
    `, [id]);

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const roundsResult = await pool.query(`
      SELECT ir.*,
             COUNT(cr.candidate_id) as candidates_count
      FROM interview_rounds ir
      LEFT JOIN candidate_rounds cr ON ir.id = cr.round_id
      WHERE ir.job_id = $1
      GROUP BY ir.id
      ORDER BY ir.round_order, ir.created_at
    `, [id]);

    const job = jobResult.rows[0];
    job.rounds = roundsResult.rows;

    res.json({ job });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new job with rounds (HR only)
router.post('/', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { name, description, rounds } = req.body;
    if (!name || !rounds || rounds.length === 0) {
      return res.status(400).json({ error: 'Job name and at least one round are required' });
    }

    const jobResult = await client.query(
      'INSERT INTO jobs (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, description, req.user.id]
    );

    const job = jobResult.rows[0];

    const createdRounds = [];
    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];
      const evaluationParams = JSON.stringify(round.evaluation_parameters || []);
      const roundResult = await client.query(
        'INSERT INTO interview_rounds (job_id, name, start_date, end_date, duration_minutes, round_order, evaluation_parameters) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [job.id, round.name, round.start_date, round.end_date, round.duration_minutes || 60, i + 1, evaluationParams]
      );
      createdRounds.push(roundResult.rows[0]);
    }

    // Create Google Sheet tabs for each round
    let sheetMeta = null;
    try {
      // Parse evaluation parameters for each round
      const roundsWithParsedParams = createdRounds.map(round => ({
        ...round,
        evaluation_parameters: typeof round.evaluation_parameters === 'string' 
          ? JSON.parse(round.evaluation_parameters) 
          : round.evaluation_parameters || []
      }));

      sheetMeta = await createRecruitmentSheet(name, roundsWithParsedParams);
      if (sheetMeta && sheetMeta.sheetId) {
        // Update job with main sheet info
        await client.query('UPDATE jobs SET sheet_id = $1, sheet_url = $2 WHERE id = $3', 
          [sheetMeta.sheetId, sheetMeta.sheetUrl, job.id]);
        job.sheet_url = sheetMeta.sheetUrl;

        // Update each round with its specific sheet URL and tab name
        if (sheetMeta.roundSheetUrls) {
          for (const roundSheet of sheetMeta.roundSheetUrls) {
            // Store both sheet URL and tab name for sync purposes
            const updateResult = await client.query('UPDATE interview_rounds SET sheet_url = $1 WHERE id = $2 RETURNING id, sheet_url',
              [roundSheet.sheetUrl, roundSheet.roundId]);
            // Update the created rounds array with sheet URLs
            const roundIndex = createdRounds.findIndex(r => r.id === roundSheet.roundId);
            if (roundIndex !== -1) {
              createdRounds[roundIndex].sheet_url = roundSheet.sheetUrl;
            }
          }
        }

        console.log(`✅ Created ${roundsWithParsedParams.length} sheet tabs for job: ${name}`);
      }
    } catch (error) {
      console.error('Error creating Google Sheet tabs:', error);
      // Continue without sheet - don't fail job creation
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Job created successfully',
      job: { ...job, rounds: createdRounds, sheet_url: job.sheet_url }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Update job (HR only)
router.put('/:id', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { name, description, rounds } = req.body;

    // Update job
    const jobResult = await client.query(
      'UPDATE jobs SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [name, description, id]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get existing rounds
    const existingRoundsResult = await client.query(
      'SELECT * FROM interview_rounds WHERE job_id = $1 ORDER BY round_order',
      [id]
    );
    const existingRounds = existingRoundsResult.rows;
    const existingRoundIds = new Set(existingRounds.map(r => r.id));

    const updatedRounds = [];
    const processedRoundIds = new Set();

    if (rounds && rounds.length > 0) {
      for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];
        const evaluationParams = JSON.stringify(round.evaluation_parameters || []);
        
        if (round.id && existingRoundIds.has(round.id)) {
          // Update existing round by ID
          const roundResult = await client.query(
            'UPDATE interview_rounds SET name = $1, start_date = $2, end_date = $3, duration_minutes = $4, round_order = $5, evaluation_parameters = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
            [round.name, round.start_date, round.end_date, round.duration_minutes || 60, i + 1, evaluationParams, round.id]
          );
          updatedRounds.push(roundResult.rows[0]);
          processedRoundIds.add(round.id);
        } else {
          // Create new round
          const roundResult = await client.query(
            'INSERT INTO interview_rounds (job_id, name, start_date, end_date, duration_minutes, round_order, evaluation_parameters) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [id, round.name, round.start_date, round.end_date, round.duration_minutes || 60, i + 1, evaluationParams]
          );
          updatedRounds.push(roundResult.rows[0]);
        }
      }
      
      // Delete any existing rounds that weren't processed (removed from the form)
      for (const existingRound of existingRounds) {
        if (!processedRoundIds.has(existingRound.id)) {
          await client.query('DELETE FROM interview_rounds WHERE id = $1', [existingRound.id]);
        }
      }
    } else {
      // If no rounds provided, delete all existing rounds
      await client.query('DELETE FROM interview_rounds WHERE job_id = $1', [id]);
    }

    await client.query('COMMIT');

    res.json({
      message: 'Job updated successfully',
      job: { ...jobResult.rows[0], rounds: updatedRounds }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update job error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Archive/Unarchive job (HR only)
router.put('/:id/status', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active or archived' });
    }

    const result = await pool.query(
      'UPDATE jobs SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      message: `Job ${status === 'archived' ? 'archived' : 'activated'} successfully`,
      job: result.rows[0]
    });
  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete job (HR only)
router.delete('/:id', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get job details before deletion to access sheet_id
    const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];

    // Delete the job (cascading will handle related records)
    await pool.query('DELETE FROM jobs WHERE id = $1', [id]);

    // Delete Google Sheet if it exists (best-effort)
    if (job.sheet_id) {
      try {
        const { deleteRecruitmentSheet } = require('../utils/sheets');
        await deleteRecruitmentSheet(job.sheet_id);
      } catch (e) {
        console.warn('Failed to delete Google Sheet:', e.message);
        // Don't fail the job deletion if sheet deletion fails
      }
    }

    res.json({
      message: 'Job deleted successfully',
      job: job
    });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;