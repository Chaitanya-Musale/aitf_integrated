const express = require('express');
const multer = require('multer');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadResume } = require('../utils/gcs');
const { createRecruitmentSheet, updateCandidateInRoundSheet } = require('../utils/sheets');
const Slack = require('../utils/slack');
const SheetSyncService = require('../services/sheetSync');
const { parseResume, parseResumeFromPdfBuffer } = require('../utils/parser');
const { sendRejectionEmail, sendFinalOfferEmail } = require('../utils/email');
const { generateOfferEmail } = require('../utils/gemini');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || 
        file.mimetype === 'application/msword' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOC/DOCX files are allowed'));
    }
  }
});

// ============================================================================
// AI INTEGRATION FUNCTIONS
// ============================================================================

/**
 * Parse resume using Python + Gemini AI
 */
async function parseResumeWithPython(text) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '../python/parse_resume_standalone.py');
    const python = spawn('python3', [pythonScript]);
    
    let dataString = '';
    let errorString = '';
    
    python.stdout.on('data', (data) => {
      dataString += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorString += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Python parsing error:', errorString);
        reject(new Error(`Resume parsing failed: ${errorString}`));
      } else {
        try {
          const parsed = JSON.parse(dataString);
          if (!parsed.success) {
            reject(new Error(parsed.error || 'Parsing failed'));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      }
    });
    
    python.stdin.write(text);
    python.stdin.end();
  });
}

/**
 * Generate selection sheet using Python + AI
 */
async function generateSelectionSheetWithPython(parsedCandidate) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '../python/generate_assessment_standalone.py');
    const python = spawn('python3', [pythonScript]);
    
    let dataString = '';
    let errorString = '';
    
    python.stdout.on('data', (data) => {
      dataString += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorString += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Selection sheet generation error:', errorString);
        reject(new Error(`Sheet generation failed: ${errorString}`));
      } else {
        try {
          const result = JSON.parse(dataString);
          if (!result.success) {
            reject(new Error(result.error || 'Sheet generation failed'));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      }
    });
    
    python.stdin.write(JSON.stringify(parsedCandidate));
    python.stdin.end();
  });
}

/**
 * Map Python parsed data to Node.js/DB format
 */
function mapPythonToDBFormat(pythonData, resume_url = '') {
  return {
    name: pythonData.name || 'Unknown',
    email: pythonData.email || '',
    contact: pythonData.phone || '',
    resume_url: resume_url,
    college: pythonData.education && pythonData.education[0] 
      ? pythonData.education[0].institution 
      : '',
    degree: pythonData.education && pythonData.education[0] 
      ? pythonData.education[0].degree 
      : '',
    graduation_year: pythonData.education && pythonData.education[0] 
      ? pythonData.education[0].year 
      : null,
    years_experience: pythonData.years_of_experience || 0,
    skills_summary: (pythonData.technical_skills || []).join(', '),
    work_history: pythonData.work_history || [],
    educations: pythonData.education || [],
    remarks: pythonData.summary || '',
    linkedin_url: pythonData.linkedin_url || null,
    github_url: pythonData.github_url || null,
    portfolio_url: pythonData.portfolio_url || null,
    parsing_confidence: pythonData.parsing_confidence || 0.0
  };
}

// ============================================================================
// ROUTES
// ============================================================================

// Move candidate to next logical status within a round, or to next round if completed
router.post('/:candidateId/round/:roundId/next', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { candidateId, roundId } = req.params;

    // Load current candidate_round and round/job info
    const cr = await client.query(`
      SELECT cr.status, c.email, c.name, ir.id as round_id, ir.name as round_name, ir.round_order,
             j.id as job_id, j.name as job_name, j.sheet_id
      FROM candidate_rounds cr
      JOIN candidates c ON c.id = cr.candidate_id
      JOIN interview_rounds ir ON ir.id = cr.round_id
      JOIN jobs j ON j.id = ir.job_id
      WHERE cr.candidate_id = $1 AND cr.round_id = $2
    `, [candidateId, roundId]);
    if (cr.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Candidate round assignment not found' });
    }
    const row = cr.rows[0];

    console.log('[Next] Transition request', { candidateId, roundId, currentStatus: row.status, roundOrder: row.round_order, jobId: row.job_id });

    // Determine next status
    const order = ['fresh', 'in_progress', 'scheduled', 'completed'];
    let currentIdx = order.indexOf(row.status);
    if (currentIdx === -1) currentIdx = 0;

    let newStatus = row.status;
    let movedToRoundId = null;
    let movedToRoundName = null;
    let movedToRoundOrder = null;

    if (row.status !== 'completed') {
      newStatus = order[Math.min(currentIdx + 1, order.length - 1)];
      await client.query('UPDATE candidate_rounds SET status = $1 WHERE candidate_id = $2 AND round_id = $3', [newStatus, candidateId, roundId]);
      console.log('[Next] Advanced within round', { candidateId, roundId, newStatus });
      // Sync to sheet (async, non-blocking)
      SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
        console.warn('Sheet sync failed:', e.message);
      });
    } else {
      // Move to next round if exists
      const next = await client.query('SELECT id, name, round_order FROM interview_rounds WHERE job_id = $1 AND round_order = $2', [row.job_id, row.round_order + 1]);

      if (next.rows.length === 0) {
        // No next round: mark as accepted in current round
        newStatus = 'accepted';
        await client.query('UPDATE candidate_rounds SET status = $1 WHERE candidate_id = $2 AND round_id = $3', [newStatus, candidateId, roundId]);
        console.log('[Next] No further rounds; marking accepted in current round', { candidateId, roundId });
        // Sync current round status (async, non-blocking)
        SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
          console.warn('Sheet sync failed:', e.message);
        });
      } else {
        // Mark as accepted in current round and add to next round as fresh
        await client.query('UPDATE candidate_rounds SET status = $1 WHERE candidate_id = $2 AND round_id = $3', ['accepted', candidateId, roundId]);
        
        movedToRoundId = next.rows[0].id;
        movedToRoundName = next.rows[0].name;
        movedToRoundOrder = next.rows[0].round_order;
        console.log('[Next] Moving to next round', { candidateId, fromRoundId: roundId, toRoundId: movedToRoundId, toRoundOrder: movedToRoundOrder });
        // Ensure candidate_round exists for next round
        await client.query(`
          INSERT INTO candidate_rounds (candidate_id, round_id, status)
          VALUES ($1, $2, 'fresh')
          ON CONFLICT (candidate_id, round_id) DO NOTHING
        `, [candidateId, movedToRoundId]);
        newStatus = 'accepted'; // Status in current round
        // Sync to both current and next round sheets (async, non-blocking)
        Promise.all([
          SheetSyncService.syncCandidateToSheet(candidateId, roundId),
          SheetSyncService.syncCandidateToSheet(candidateId, movedToRoundId)
        ]).catch(e => {
          console.warn('Sheet sync failed:', e.message);
        });
      }
    }

    await client.query('COMMIT');

    // After commit: if moved into Round >= 2, trigger Slack workflow (best-effort)
    if (movedToRoundId) {
      try {
        if (movedToRoundOrder >= 2) {
          // Load job + candidate minimal details for Slack helper
          console.log('[Next] Triggering Slack ensureRound2ChannelAndInvite', { candidateId, jobId: row.job_id, movedToRoundId });
          setImmediate(async () => {
            try {
              const jobRes = await pool.query('SELECT id, name, sheet_url FROM jobs WHERE id = $1', [row.job_id]);
              const job = jobRes.rows[0] || { id: row.job_id, name: row.job_name, sheet_url: null };
              await Slack.ensureRound2ChannelAndInvite(job.id, job.name, job.sheet_url, row.email, row.name);
            } catch (e) {
              console.warn('Slack workflow (next->round2) failed:', e.message);
            }
          });
        } else {
          console.log('[Next] Moved to round not equal to 2, Slack not triggered', { movedToRoundOrder });
        }
      } catch (_) { /* ignore */ }
    }

    // After commit: if this was the last round (no movedToRoundId) and newStatus is accepted -> send final offer email (best-effort)
    if (!movedToRoundId && newStatus === 'accepted') {
      setImmediate(async () => {
        try {
          // Aggregate feedback across all rounds for this candidate in this job
          const fbRes = await pool.query(`
            SELECT string_agg(coalesce(cr.feedback, ''), '\n') AS feedback
            FROM candidate_rounds cr
            JOIN interview_rounds ir ON ir.id = cr.round_id
            WHERE cr.candidate_id = $1 AND ir.job_id = $2
          `, [candidateId, row.job_id]);
          const feedbackSummary = (fbRes.rows[0]?.feedback || '').trim();

          // Generate email content using Gemini (with fallback)
          const { subject, body } = await generateOfferEmail(row.name, row.job_name, feedbackSummary);

          // Send email
          await sendFinalOfferEmail(row.email, row.name, subject, body);
        } catch (e) {
          console.warn('Final offer email workflow failed:', e.message);
        }
      });
    }

    return res.json({ message: 'Transitioned', newStatus, movedToRoundId, movedToRoundName });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Next transition error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Reject candidate in a round
router.post('/:candidateId/round/:roundId/reject', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { candidateId, roundId } = req.params;
    const result = await pool.query(
      `UPDATE candidate_rounds SET status = 'rejected' WHERE candidate_id = $1 AND round_id = $2 RETURNING *`,
      [candidateId, roundId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate round assignment not found' });
    }

    // Get candidate and job details for email
    const candidateDetailsQuery = `
      SELECT 
        c.name, 
        c.email, 
        cr.feedback,
        cr.rejection_reason,
        j.name as job_name,
        ir.name as round_name
      FROM candidates c
      JOIN candidate_rounds cr ON c.id = cr.candidate_id
      JOIN interview_rounds ir ON cr.round_id = ir.id
      JOIN jobs j ON ir.job_id = j.id
      WHERE c.id = $1 AND cr.round_id = $2
    `;
    
    const candidateDetails = await pool.query(candidateDetailsQuery, [candidateId, roundId]);
    
    if (candidateDetails.rows.length > 0) {
      const candidate = candidateDetails.rows[0];
      
      // Send rejection email (async, non-blocking)
      sendRejectionEmail(
        candidate.email,
        candidate.name,
        candidate.rejection_reason || 'We have decided not to move forward with your application at this time.',
        candidate.feedback,
        candidate.job_name,
        candidate.round_name
      ).catch(e => {
        console.warn('Rejection email failed:', e.message);
      });
    }

    // Sync to sheet (async, non-blocking)
    SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
      console.warn('Sheet sync failed:', e.message);
    });

    res.json({ message: 'Rejected', newStatus: 'rejected' });
  } catch (error) {
    console.error('Reject transition error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Per-round candidate status counts
router.get('/round/:roundId/counts', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { roundId } = req.params;
    const result = await pool.query(
      `SELECT status, COUNT(*)::int as count FROM candidate_rounds WHERE round_id = $1 GROUP BY status`,
      [roundId]
    );
    const counts = { fresh: 0, in_progress: 0, scheduled: 0, completed: 0, rejected: 0 };
    for (const row of result.rows) counts[row.status] = row.count;
    res.json({ counts });
  } catch (error) {
    console.error('Get round counts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get candidates for a specific round
router.get('/round/:roundId', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { roundId } = req.params;
    const { status } = req.query;

    // First, update any scheduled interviews that have passed their end time to 'completed'
    // Convert UTC scheduled_time to Asia/Kolkata timezone and add duration_minutes
    await pool.query(`
      UPDATE candidate_rounds 
      SET status = 'completed'
      WHERE round_id = $1 
        AND status = 'scheduled' 
        AND scheduled_time IS NOT NULL
        AND (scheduled_time AT TIME ZONE 'Asia/Kolkata' + 
             INTERVAL '1 minute' * (
               SELECT duration_minutes 
               FROM interview_rounds 
               WHERE id = $1
             )) < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
    `, [roundId]);

    let query = `
      SELECT c.*, 
             cr.status as round_status,
             cr.scheduled_time,
             cr.meet_link,
             cr.remarks,
             cr.rejection_reason,
             cr.assigned_interviewers,
             cr.evaluation_scores,
             cr.feedback,
             cr.requested_reassignment,
             ir.name as round_name, 
             ir.evaluation_parameters,
             ir.duration_minutes,
             j.name as job_name,
             COALESCE(
               (SELECT array_agg(u.name) 
                FROM interview_assignments ia 
                JOIN users u ON ia.interviewer_id = u.id 
                WHERE ia.candidate_id = c.id AND ia.round_id = cr.round_id), 
               ARRAY[]::text[]
             ) as assigned_interviewers
      FROM candidates c
      JOIN candidate_rounds cr ON c.id = cr.candidate_id
      JOIN interview_rounds ir ON cr.round_id = ir.id
      JOIN jobs j ON ir.job_id = j.id
      WHERE cr.round_id = $1
    `;
    
    const params = [roundId];
    
    if (status) {
      query += ' AND cr.status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query(query, params);

    res.json({ candidates: result.rows });
  } catch (error) {
    console.error('Get candidates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload certificates for work experience (HR only)
router.post('/upload-certificates', authenticateToken, requireRole(['HR', 'Admin']), upload.array('certificates', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedUrls = [];

    for (const file of req.files) {
      try {
        const url = await uploadResume(file.buffer, file.originalname, file.mimetype);
        if (url) {
          uploadedUrls.push(url);
        }
      } catch (e) {
        console.warn('Certificate upload failed for', file.originalname, e.message);
        uploadedUrls.push(null);
      }
    }

    res.json({
      message: 'Certificates uploaded successfully',
      urls: uploadedUrls
    });
  } catch (error) {
    console.error('Upload certificates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload and parse resumes with AI (HR only)
router.post('/upload-resumes', authenticateToken, requireRole(['HR', 'Admin']), upload.array('resumes', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // pdf-parse removed: we now rely on Gemini OCR for PDFs and DOC/DOCX

    const parsedCandidates = [];
    const processingErrors = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      let text = '';
      let resume_url = null;

      console.log(`\n[${i+1}/${req.files.length}] Processing: ${file.originalname}`);

      // Step 1: Upload original to GCS
      try {
        const url = await uploadResume(file.buffer, file.originalname, file.mimetype);
        if (url) {
          resume_url = url;
          console.log(`  ✓ Uploaded to GCS: ${url}`);
        }
      } catch (e) {
        console.warn('  ⚠ GCS upload failed:', e.message);
      }

      const isPdf = !!(file.mimetype && file.mimetype.toLowerCase().includes('pdf'));
      const isDoc = !!(file.mimetype && (
        file.mimetype === 'application/msword' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ));
      let parsed;
      if (isPdf || isDoc) {
        console.log('[GeminiOCR] Using Gemini File API for', file.originalname);
        parsed = await parseResumeFromPdfBuffer(file.buffer, file.mimetype, file.originalname, `Candidate ${i + 1}`);
      } else {
        parsed = await parseResume('', `Candidate ${i + 1}`);
      }
      parsedCandidates.push({
        fileName: file.originalname,
        ...parsed,
        resume_url: resume_url || '',
        mimeType: file.mimetype,
      });
    }

    res.json({
      message: 'Resumes processed',
      candidates: parsedCandidates,
      total: req.files.length,
      successful: parsedCandidates.filter(c => !c.processing_error).length,
      failed: processingErrors.length,
      errors: processingErrors
    });

  } catch (error) {
    console.error('Upload resumes error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Create candidates with file upload (HR only)
router.post('/', authenticateToken, requireRole(['HR', 'Admin']), upload.array('resumes', 1), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { candidates: candidatesData, roundId } = req.body;
    let candidates = [];

    // Parse candidates data if it's a string
    if (typeof candidatesData === 'string') {
      candidates = JSON.parse(candidatesData);
    } else {
      candidates = candidatesData || [];
    }

    if (!candidates || candidates.length === 0) {
      return res.status(400).json({ error: 'No candidates provided' });
    }

    if (!roundId) {
      return res.status(400).json({ error: 'Round ID is required' });
    }

    const createdCandidates = [];

    // Load round and job metadata (for Sheets + Slack)
    let roundMeta = null;
    try {
      const r = await client.query(`
        SELECT ir.id as round_id, ir.name as round_name, ir.round_order, ir.job_id, j.name as job_name, j.sheet_id, j.sheet_url
        FROM interview_rounds ir JOIN jobs j ON ir.job_id = j.id WHERE ir.id = $1
      `, [roundId]);
      roundMeta = r.rows[0] || null;
    } catch (_) { /* ignore */ }

    const toInviteOnSlack = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      let resumeUrl = candidate.resume_url || null;

      // Upload resume if file is provided
      if (req.files && req.files[i]) {
        const file = req.files[i];
        try {
          resumeUrl = await uploadResume(file.buffer, file.originalname, file.mimetype);
        } catch (uploadError) {
          console.error('Resume upload error:', uploadError);
          // Continue without resume URL if upload fails
        }
      }

      // Check if candidate already exists
      const existingCandidate = await client.query(
        'SELECT id FROM candidates WHERE email = $1',
        [candidate.email]
      );
      // Normalize ai_summary for jsonb column
      const aiSummaryObj = (() => {
        try {
          if (candidate.ai_summary && typeof candidate.ai_summary === 'string') return JSON.parse(candidate.ai_summary);
          if (candidate.ai_summary && typeof candidate.ai_summary === 'object') return candidate.ai_summary;
        } catch (_) {}
        return null;
      })();

      let candidateId;
      if (existingCandidate.rows.length > 0) {
        // Update existing candidate
        candidateId = existingCandidate.rows[0].id;
        if (resumeUrl || aiSummaryObj) {
          await client.query(
            'UPDATE candidates SET resume_url = COALESCE($1, resume_url), ai_summary = COALESCE($2, ai_summary) WHERE id = $3',
            [resumeUrl, aiSummaryObj, candidateId]
          );
        }
        // For Slack later
        toInviteOnSlack.push({ email: candidate.email, name: candidate.name });
      } else {
        // Create new candidate with enhanced fields
        const finalResumeUrl = resumeUrl || candidate.resume_url || null;
        const result = await client.query(
          `INSERT INTO candidates (
            name, email, contact, resume_url,
            college_name, degree, graduation_year, years_experience,
            skills_summary, remarks, ai_summary
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            candidate.name,
            candidate.email,
            candidate.contact,
            finalResumeUrl,
            candidate.college || candidate.college_name || null,
            candidate.degree,
            candidate.graduation_year ? parseInt(candidate.graduation_year) : null,
            candidate.years_experience || 0,
            candidate.skills_summary,
            candidate.remarks,
            aiSummaryObj,
          ]
        );
        const created = { ...result.rows[0], resume_url: finalResumeUrl };
        candidateId = created.id;
        createdCandidates.push(created);
        // For Slack later
        toInviteOnSlack.push({ email: candidate.email, name: candidate.name });
      }

      // Add candidate to round
      await client.query(`
        INSERT INTO candidate_rounds (candidate_id, round_id, status)
        VALUES ($1, $2, 'fresh')
        ON CONFLICT (candidate_id, round_id) DO NOTHING
      `, [candidateId, roundId]);

      // If selection sheet HTML exists, save it locally
      if (candidate.selection_sheet_html) {
        try {
          const fs = require('fs').promises;
          const outputDir = path.join(__dirname, '../selection_sheets');
          
          // Create directory if it doesn't exist
          await fs.mkdir(outputDir, { recursive: true });
          
          // Save HTML file
          const fileName = `sheet_${candidateId}_${Date.now()}.html`;
          const filePath = path.join(outputDir, fileName);
          await fs.writeFile(filePath, candidate.selection_sheet_html, 'utf-8');
          
          console.log(`  ✓ Saved selection sheet: ${filePath}`);
          
          // Store file path in candidate_rounds remarks
          await client.query(
            'UPDATE candidate_rounds SET remarks = $1 WHERE candidate_id = $2 AND round_id = $3',
            [`Selection sheet: selection_sheets/${fileName}`, candidateId, roundId]
          );
        } catch (e) {
          console.warn('Failed to save selection sheet:', e.message);
        }
      }

      // Sync to Google Sheet (async, non-blocking)
      SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
        console.warn('Sheet sync failed for candidate:', candidate.email, e.message);
      });
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Candidates created successfully',
      candidates: createdCandidates,
      roundId: roundId,
      resumeUploaded: createdCandidates.some(c => c.resume_url)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create candidates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Update candidate status in round
router.put('/:candidateId/round/:roundId/status', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { candidateId, roundId } = req.params;
    const { status } = req.body;

    const validStatuses = ['fresh', 'in_progress', 'scheduled', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      'UPDATE candidate_rounds SET status = $1 WHERE candidate_id = $2 AND round_id = $3 RETURNING *',
      [status, candidateId, roundId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate round assignment not found' });
    }

    // Sync to sheet (async, non-blocking)
    SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
      console.warn('Sheet sync failed:', e.message);
    });

    res.json({
      message: 'Candidate status updated successfully',
      candidateRound: result.rows[0]
    });
  } catch (error) {
    console.error('Update candidate status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign interviewers to candidate
router.post('/:candidateId/round/:roundId/assign-interviewers', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { candidateId, roundId } = req.params;
    const { interviewerIds } = req.body;

    if (!interviewerIds || interviewerIds.length === 0) {
      return res.status(400).json({ error: 'At least one interviewer must be assigned' });
    }

    // Remove existing assignments
    await client.query(
      'DELETE FROM interview_assignments WHERE candidate_id = $1 AND round_id = $2',
      [candidateId, roundId]
    );

    // Create new assignments
    for (const interviewerId of interviewerIds) {
      await client.query(
        'INSERT INTO interview_assignments (candidate_id, round_id, interviewer_id) VALUES ($1, $2, $3)',
        [candidateId, roundId, interviewerId]
      );
    }

    // Update candidate status to in_progress
    await client.query(
      'UPDATE candidate_rounds SET status = $1 WHERE candidate_id = $2 AND round_id = $3',
      ['in_progress', candidateId, roundId]
    );

    await client.query('COMMIT');

    // Sync to sheet (async, non-blocking)
    SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
      console.warn('Sheet sync failed:', e.message);
    });

    res.json({ message: 'Interviewers assigned successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Assign interviewers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all interviewers (users with Interviewer role)
router.get('/interviewers', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT u.id, u.name, u.email
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name IN ('Interviewer', 'Technical Team', 'Management') 
      AND u.status = 'active'
      ORDER BY u.name
    `);

    res.json({ interviewers: result.rows });
  } catch (error) {
    console.error('Get interviewers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get candidates for a specific round and interviewer (Interviewer role)
router.get('/round/:roundId/interviewer/:interviewerId', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { roundId, interviewerId } = req.params;

    // Verify the interviewer is assigned to this round or user has HR/Admin role
    const userRoles = req.user.roles || [];
    const isHROrAdmin = userRoles.includes('HR') || userRoles.includes('Admin');
    
    if (!isHROrAdmin && parseInt(interviewerId) !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view your own assignments.' });
    }

    // First, update any scheduled interviews that have passed their end time to 'completed'
    // Convert UTC scheduled_time to Asia/Kolkata timezone and add duration_minutes
    await pool.query(`
      UPDATE candidate_rounds 
      SET status = 'completed'
      WHERE round_id = $1 
        AND status = 'scheduled' 
        AND scheduled_time IS NOT NULL
        AND (scheduled_time AT TIME ZONE 'Asia/Kolkata' + 
             INTERVAL '1 minute' * (
               SELECT duration_minutes 
               FROM interview_rounds 
               WHERE id = $1
             )) < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
    `, [roundId]);

    const result = await pool.query(`
      SELECT DISTINCT
        c.id,
        c.name,
        c.email,
        c.contact,
        c.resume_url,
        c.cgpa_percentage,
        c.years_experience,
        c.skills_summary,
        c.college_name,
        c.degree,
        c.graduation_year,
        c.experience_level,
        c.remarks,
        c.work_history,
        c.educations,
        cr.status as round_status,
        cr.assigned_at,
        cr.scheduled_time,
        cr.interviewer_name,
        cr.meet_link,
        cr.remarks as round_remarks,
        cr.rejection_reason,
        cr.evaluation_scores,
        cr.feedback,
        COALESCE(
          (SELECT array_agg(u.name) 
           FROM interview_assignments ia 
           JOIN users u ON ia.interviewer_id = u.id 
           WHERE ia.candidate_id = c.id AND ia.round_id = cr.round_id), 
          ARRAY[]::text[]
        ) as assigned_interviewers
      FROM candidates c
      JOIN candidate_rounds cr ON c.id = cr.candidate_id
      JOIN interview_assignments ia ON c.id = ia.candidate_id AND cr.round_id = ia.round_id
      WHERE cr.round_id = $1 AND ia.interviewer_id = $2
      ORDER BY cr.assigned_at DESC
    `, [roundId, interviewerId]);

    res.json({ candidates: result.rows });
  } catch (error) {
    console.error('Get candidates by round and interviewer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get assigned interviewers for a candidate and round
router.get('/:candidateId/round/:roundId/interviewers', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { candidateId, roundId } = req.params;

    const result = await pool.query(`
      SELECT u.id, u.name, u.email
      FROM interview_assignments ia
      JOIN users u ON ia.interviewer_id = u.id
      WHERE ia.candidate_id = $1 AND ia.round_id = $2
      ORDER BY u.name
    `, [candidateId, roundId]);

    res.json({ interviewers: result.rows });
  } catch (error) {
    console.error('Get assigned interviewers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update multi-interviewer evaluation (supports multiple interviewers' evaluations)
router.put('/:candidateId/round/:roundId/multi-evaluation', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { candidateId, roundId } = req.params;
    const { allEvaluations } = req.body;

    // Convert evaluation data to JSON string
    const evaluationsJson = JSON.stringify(allEvaluations || {});

    const result = await pool.query(
      'UPDATE candidate_rounds SET evaluation_scores = $1 WHERE candidate_id = $2 AND round_id = $3 RETURNING *',
      [evaluationsJson, candidateId, roundId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate round assignment not found' });
    }

    // Sync to sheet (async, non-blocking)
    SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
      console.warn('Sheet sync failed:', e.message);
    });

    res.json({ message: 'Multi-interviewer evaluation updated successfully' });
  } catch (error) {
    console.error('Update multi-interviewer evaluation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete candidate from a round (HR only)
router.delete('/:candidateId/round/:roundId', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { candidateId, roundId } = req.params;
    
    // Get candidate email before deletion for sheet sync
    const candidateResult = await client.query(
      'SELECT c.email FROM candidates c WHERE c.id = $1',
      [candidateId]
    );
    
    // Delete interview assignments for this candidate in this round
    await client.query(
      'DELETE FROM interview_assignments WHERE candidate_id = $1 AND round_id = $2',
      [candidateId, roundId]
    );
    
    // Delete candidate from round
    const del = await client.query(
      'DELETE FROM candidate_rounds WHERE candidate_id = $1 AND round_id = $2 RETURNING *',
      [candidateId, roundId]
    );
    
    if (del.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Candidate not found in this round' });
    }

    await client.query('COMMIT');

    // Remove from sheet (async, non-blocking)
    if (candidateResult.rows.length > 0) {
      SheetSyncService.removeCandidateFromSheet(candidateResult.rows[0].email, roundId).catch(e => {
        console.warn('Sheet removal failed:', e.message);
      });
    }

    res.json({ message: 'Candidate removed from round and interview assignments deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete candidate from round error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Move candidate back to fresh status
router.post('/:candidateId/round/:roundId/move-to-fresh', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { candidateId, roundId } = req.params;
    
    const result = await pool.query(
      'UPDATE candidate_rounds SET status = $1, requested_reassignment = FALSE WHERE candidate_id = $2 AND round_id = $3 RETURNING *',
      ['fresh', candidateId, roundId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate round assignment not found' });
    }

    // Sync to sheet (async, non-blocking)
    SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
      console.warn('Sheet sync failed:', e.message);
    });

    res.json({ message: 'Candidate moved back to fresh status', newStatus: 'fresh' });
  } catch (error) {
    console.error('Move to fresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update candidate remarks
router.put('/:candidateId/round/:roundId/remarks', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { candidateId, roundId } = req.params;
    const { remarks } = req.body;

    const result = await pool.query(
      'UPDATE candidate_rounds SET remarks = $1 WHERE candidate_id = $2 AND round_id = $3 RETURNING *',
      [remarks, candidateId, roundId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate round assignment not found' });
    }

    // Sync to sheet (async, non-blocking)
    SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
      console.warn('Sheet sync failed:', e.message);
    });

    res.json({ message: 'Remarks updated successfully' });
  } catch (error) {
    console.error('Update remarks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject candidate with reason
router.post('/:candidateId/round/:roundId/reject-with-reason', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { candidateId, roundId } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const result = await pool.query(
      'UPDATE candidate_rounds SET status = $1, rejection_reason = $2 WHERE candidate_id = $3 AND round_id = $4 RETURNING *',
      ['rejected', reason.trim(), candidateId, roundId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate round assignment not found' });
    }

    // Get candidate and job details for email
    const candidateDetailsQuery = `
      SELECT 
        c.name, 
        c.email, 
        cr.feedback,
        cr.rejection_reason,
        j.name as job_name,
        ir.name as round_name
      FROM candidates c
      JOIN candidate_rounds cr ON c.id = cr.candidate_id
      JOIN interview_rounds ir ON cr.round_id = ir.id
      JOIN jobs j ON ir.job_id = j.id
      WHERE c.id = $1 AND cr.round_id = $2
    `;
    
    const candidateDetails = await pool.query(candidateDetailsQuery, [candidateId, roundId]);
    
    if (candidateDetails.rows.length > 0) {
      const candidate = candidateDetails.rows[0];
      
      // Send rejection email (async, non-blocking)
      sendRejectionEmail(
        candidate.email,
        candidate.name,
        candidate.rejection_reason,
        candidate.feedback,
        candidate.job_name,
        candidate.round_name
      ).catch(e => {
        console.warn('Rejection email failed:', e.message);
      });
    }

    // Sync to sheet (async, non-blocking)
    SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
      console.warn('Sheet sync failed:', e.message);
    });

    res.json({ message: 'Candidate rejected with reason', newStatus: 'rejected' });
  } catch (error) {
    console.error('Reject with reason error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete candidate permanently
router.delete('/:candidateId', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { candidateId } = req.params;

    // Delete from candidate_rounds first (foreign key constraint)
    await client.query('DELETE FROM candidate_rounds WHERE candidate_id = $1', [candidateId]);
    
    // Delete from interview_assignments
    await client.query('DELETE FROM interview_assignments WHERE candidate_id = $1', [candidateId]);
    
    // Delete the candidate
    const result = await client.query('DELETE FROM candidates WHERE id = $1 RETURNING *', [candidateId]);
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Candidate not found' });
    }

    await client.query('COMMIT');
    res.json({ message: 'Candidate deleted permanently' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete candidate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Get all candidates (for candidate management)
router.get('/', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT c.*, 
             COALESCE(c.status, 'active') as status
      FROM candidates c
    `;
    
    const params = [];
    
    if (status) {
      query += ' WHERE COALESCE(c.status, \'active\') = $1';
      params.push(status);
    }
    
    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query(query, params);

    res.json({ candidates: result.rows });
  } catch (error) {
    console.error('Get all candidates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create standalone candidate (not tied to any job initially)
router.post('/standalone', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const candidateData = req.body;
    // Normalize ai_summary for jsonb
    let aiSummaryObj = null;
    try {
      if (candidateData.ai_summary && typeof candidateData.ai_summary === 'string') aiSummaryObj = JSON.parse(candidateData.ai_summary);
      else if (candidateData.ai_summary && typeof candidateData.ai_summary === 'object') aiSummaryObj = candidateData.ai_summary;
    } catch (_) { aiSummaryObj = null; }

    // Check if candidate already exists
    const existingCandidate = await pool.query(
      'SELECT id FROM candidates WHERE email = $1',
      [candidateData.email]
    );

    if (existingCandidate.rows.length > 0) {
      return res.status(400).json({ error: 'Candidate with this email already exists' });
    }

    // Create new candidate
    const result = await pool.query(`
      INSERT INTO candidates (
        name, email, contact, resume_url,
        college_name, degree, graduation_year, years_experience, 
        skills_summary, work_history, educations, remarks, status, ai_summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *
    `, [
      candidateData.name,
      candidateData.email,
      candidateData.contact,
      candidateData.resume_url,
      candidateData.college_name,
      candidateData.degree,
      candidateData.graduation_year ? parseInt(candidateData.graduation_year) : null,
      candidateData.years_experience || 0,
      candidateData.skills_summary,
      candidateData.work_history,
      candidateData.educations,
      candidateData.remarks,
      'active',
      aiSummaryObj
    ]);

    res.status(201).json({
      message: 'Candidate created successfully',
      candidate: result.rows[0]
    });
  } catch (error) {
    console.error('Create standalone candidate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update candidate
router.put('/:candidateId', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const candidateData = req.body;
    let aiSummaryObj = null;
    try {
      if (candidateData.ai_summary && typeof candidateData.ai_summary === 'string') aiSummaryObj = JSON.parse(candidateData.ai_summary);
      else if (candidateData.ai_summary && typeof candidateData.ai_summary === 'object') aiSummaryObj = candidateData.ai_summary;
    } catch (_) { aiSummaryObj = null; }

    // Check if email is being changed and if it conflicts with another candidate
    if (candidateData.email) {
      const existingCandidate = await pool.query(
        'SELECT id FROM candidates WHERE email = $1 AND id != $2',
        [candidateData.email, candidateId]
      );

      if (existingCandidate.rows.length > 0) {
        return res.status(400).json({ error: 'Another candidate with this email already exists' });
      }
    }

    const result = await pool.query(`
      UPDATE candidates SET
        name = $1, email = $2, contact = $3, resume_url = $4,
        college_name = $5, degree = $6, graduation_year = $7, years_experience = $8,
        skills_summary = $9, work_history = $10, educations = $11, remarks = $12,
        ai_summary = COALESCE($13, ai_summary),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $14 RETURNING *
    `, [
      candidateData.name,
      candidateData.email,
      candidateData.contact,
      candidateData.resume_url,
      candidateData.college_name,
      candidateData.degree,
      candidateData.graduation_year ? parseInt(candidateData.graduation_year) : null,
      candidateData.years_experience || 0,
      candidateData.skills_summary,
      candidateData.work_history,
      candidateData.educations,
      candidateData.remarks,
      aiSummaryObj,
      candidateId
    ]);

    res.json({
      message: 'Candidate updated successfully',
      candidate: result.rows[0]
    });
  } catch (error) {
    console.error('Update candidate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update candidate status (active/inactive)
router.put('/:candidateId/status', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { status } = req.body;

    const validStatuses = ['active', 'inactive'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      'UPDATE candidates SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, candidateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    res.json({
      message: 'Candidate status updated successfully',
      candidate: result.rows[0]
    });
  } catch (error) {
    console.error('Update candidate status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add existing candidates to a job round
router.post('/add-to-round', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { candidateIds, roundId } = req.body;

    if (!candidateIds || candidateIds.length === 0) {
      return res.status(400).json({ error: 'No candidates selected' });
    }

    if (!roundId) {
      return res.status(400).json({ error: 'Round ID is required' });
    }

    // Add candidates to round
    for (const candidateId of candidateIds) {
      await client.query(`
        INSERT INTO candidate_rounds (candidate_id, round_id, status)
        VALUES ($1, $2, 'fresh')
        ON CONFLICT (candidate_id, round_id) DO NOTHING
      `, [candidateId, roundId]);

      // Sync to sheet (async, non-blocking)
      SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
        console.warn('Sheet sync failed for candidate:', candidateId, e.message);
      });
    }

    await client.query('COMMIT');

    res.json({
      message: `${candidateIds.length} candidate(s) added to round successfully`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add candidates to round error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Get available candidates for a job (not already in any round of the job)
router.get('/available-for-job/:jobId', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const result = await pool.query(`
      SELECT c.*
      FROM candidates c
      WHERE c.status = 'active'
      AND c.id NOT IN (
        SELECT DISTINCT cr.candidate_id
        FROM candidate_rounds cr
        JOIN interview_rounds ir ON cr.round_id = ir.id
        WHERE ir.job_id = $1
      )
      ORDER BY c.created_at DESC
    `, [jobId]);

    res.json({ candidates: result.rows });
  } catch (error) {
    console.error('Get available candidates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update candidate evaluation (scores and feedback)
router.put('/:candidateId/round/:roundId/evaluation', authenticateToken, requireRole(['HR', 'Admin', 'Interviewer']), async (req, res) => {
  try {
    const { candidateId, roundId } = req.params;
    const { evaluationScores, feedback } = req.body;

    // Convert evaluation scores to JSON string
    const scoresJson = JSON.stringify(evaluationScores || []);

    const result = await pool.query(
      'UPDATE candidate_rounds SET evaluation_scores = $1, feedback = $2 WHERE candidate_id = $3 AND round_id = $4 RETURNING *',
      [scoresJson, feedback, candidateId, roundId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate round assignment not found' });
    }

    // Sync to sheet (async, non-blocking)
    SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
      console.warn('Sheet sync failed:', e.message);
    });

    res.json({ message: 'Evaluation updated successfully' });
  } catch (error) {
    console.error('Update evaluation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sheet sync queue status (for monitoring)
router.get('/sync-queue-status', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const status = SheetSyncService.getQueueStatus();
    res.json({
      message: 'Sheet sync queue status',
      ...status
    });
  } catch (error) {
    console.error('Get sync queue status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear sheet sync queue (emergency use only)
router.post('/clear-sync-queue', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const clearedCount = SheetSyncService.clearQueue();
    res.json({
      message: `Cleared ${clearedCount} requests from sync queue`,
      clearedCount
    });
  } catch (error) {
    console.error('Clear sync queue error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List final offers: candidates accepted in the last round of their job
router.get('/offers', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    // For each job, last round is the one with max(round_order)
    const result = await pool.query(`
      WITH last_rounds AS (
        SELECT ir.job_id, MAX(ir.round_order) AS last_order
        FROM interview_rounds ir
        GROUP BY ir.job_id
      )
      SELECT 
        c.id AS candidate_id,
        c.name AS candidate_name,
        c.email AS candidate_email,
        c.resume_url,
        c.years_experience,
        j.id AS job_id,
        j.name AS job_name,
        ir.id AS round_id,
        ir.name AS round_name,
        cr.scheduled_time,
        cr.feedback
      FROM candidate_rounds cr
      JOIN interview_rounds ir ON cr.round_id = ir.id
      JOIN last_rounds lr ON lr.job_id = ir.job_id AND lr.last_order = ir.round_order
      JOIN candidates c ON c.id = cr.candidate_id
      JOIN jobs j ON j.id = ir.job_id
      WHERE cr.status = 'accepted'
      ORDER BY COALESCE(cr.assigned_at, c.updated_at, c.created_at) DESC NULLS LAST
    `);

    res.json({ offers: result.rows });
  } catch (error) {
    console.error('List offers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;