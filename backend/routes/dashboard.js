const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// HR summary counts: jobs and candidates
router.get('/hr/summary', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const [jobsTotal, jobsActive, jobsArchived] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM jobs`),
      pool.query(`SELECT COUNT(*)::int AS count FROM jobs WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*)::int AS count FROM jobs WHERE status = 'archived'`),
    ]);

    const [candTotal, candActive, candInactive] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM candidates`),
      pool.query(`SELECT COUNT(*)::int AS count FROM candidates WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*)::int AS count FROM candidates WHERE status = 'inactive'`),
    ]);

    // Upcoming scheduled interviews count (next 7 days) - only status 'scheduled'
    const upcoming = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM candidate_rounds cr
      WHERE cr.status = 'scheduled'
        AND cr.scheduled_time IS NOT NULL
        AND cr.scheduled_time >= NOW()
        AND cr.scheduled_time < NOW() + INTERVAL '7 days'
    `);

    res.json({
      jobs: {
        total: jobsTotal.rows[0].count,
        active: jobsActive.rows[0].count,
        archived: jobsArchived.rows[0].count,
      },
      candidates: {
        total: candTotal.rows[0].count,
        active: candActive.rows[0].count,
        inactive: candInactive.rows[0].count,
      },
      interviews: {
        upcoming7d: upcoming.rows[0].count,
      }
    });
  } catch (error) {
    console.error('HR summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Interviewer upcoming interviews list
router.get('/interviewer/upcoming', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const interviewerId = req.user.id;

    // If HR/Admin, allow optional query ?interviewerId= to view someone's schedule
    const isHROrAdmin = (req.user.roles || []).some(r => r === 'HR' || r === 'Admin');
    const targetInterviewerId = isHROrAdmin && req.query.interviewerId ? parseInt(req.query.interviewerId, 10) : interviewerId;

    // First, update any scheduled interviews that have passed their end time to 'completed'
    // Convert UTC scheduled_time to Asia/Kolkata timezone and add duration_minutes
    await pool.query(`
      UPDATE candidate_rounds 
      SET status = 'completed'
      WHERE status = 'scheduled' 
        AND scheduled_time IS NOT NULL
        AND (scheduled_time AT TIME ZONE 'Asia/Kolkata' + 
             INTERVAL '1 minute' * (
               SELECT ir.duration_minutes 
               FROM interview_rounds ir 
               WHERE ir.id = candidate_rounds.round_id
             )) < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
    `);

    const result = await pool.query(`
      SELECT 
        cr.scheduled_time,
        cr.meet_link,
        c.id as candidate_id,
        c.name as candidate_name,
        c.email as candidate_email,
        c.resume_url as candidate_resume_url,
        j.name as job_name,
        ir.name as round_name,
        ir.duration_minutes
      FROM candidate_rounds cr
      JOIN candidates c ON c.id = cr.candidate_id
      JOIN interview_rounds ir ON ir.id = cr.round_id
      JOIN jobs j ON j.id = ir.job_id
      JOIN interview_assignments ia ON ia.candidate_id = cr.candidate_id AND ia.round_id = cr.round_id
      WHERE ia.interviewer_id = $1
        AND cr.scheduled_time IS NOT NULL
        AND cr.scheduled_time >= NOW()
        AND cr.status = 'scheduled'
      ORDER BY cr.scheduled_time ASC
      LIMIT 50
    `, [targetInterviewerId]);

    res.json({ upcoming: result.rows });
  } catch (error) {
    console.error('Interviewer upcoming error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// HR: Interviews mapping table (interviewer, candidate, job, round, scheduled_time, meet_link)
router.get('/hr/interviews', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const { status } = req.query;

    // First, update any scheduled interviews that have passed their end time to 'completed'
    // Convert UTC scheduled_time to Asia/Kolkata timezone and add duration_minutes
    await pool.query(`
      UPDATE candidate_rounds 
      SET status = 'completed'
      WHERE status = 'scheduled' 
        AND scheduled_time IS NOT NULL
        AND (scheduled_time AT TIME ZONE 'Asia/Kolkata' + 
             INTERVAL '1 minute' * (
               SELECT ir.duration_minutes 
               FROM interview_rounds ir 
               WHERE ir.id = candidate_rounds.round_id
             )) < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
    `);

    // Build WHERE clause based on status filter
    let whereClause = '';
    let queryParams = [];

    if (status && status !== 'all') {
      whereClause = 'WHERE cr.status = $1';
      queryParams.push(status);
    }

    const result = await pool.query(`
      SELECT 
        c.id AS candidate_id,
        c.name AS candidate_name,
        c.email AS candidate_email,
        c.resume_url AS candidate_resume_url,
        j.id AS job_id,
        j.name AS job_name,
        ir.id AS round_id,
        ir.name AS round_name,
        cr.status,
        cr.scheduled_time,
        cr.meet_link,
        cr.assigned_at,
        cr.requested_reassignment,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object('name', iu.name))
            FILTER (WHERE iu.id IS NOT NULL),
          '[]'::jsonb
        ) AS interviewers
      FROM candidate_rounds cr
      JOIN candidates c ON c.id = cr.candidate_id
      JOIN interview_rounds ir ON ir.id = cr.round_id
      JOIN jobs j ON j.id = ir.job_id
      LEFT JOIN interview_assignments ia ON ia.candidate_id = cr.candidate_id AND ia.round_id = cr.round_id
      LEFT JOIN users iu ON iu.id = ia.interviewer_id
      ${whereClause}
      GROUP BY c.id, c.name, c.email, c.resume_url, j.id, j.name, ir.id, ir.name, cr.status, cr.scheduled_time, cr.meet_link, cr.assigned_at, cr.requested_reassignment
      ORDER BY 
        CASE 
          WHEN cr.scheduled_time IS NOT NULL THEN cr.scheduled_time 
          ELSE cr.assigned_at 
        END DESC
      LIMIT 1000
    `, queryParams);

    res.json({ rows: result.rows });
  } catch (error) {
    console.error('HR interviews mapping error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
module.exports = router;

