const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const calendarService = require('../utils/calendar');
const bookingTokenService = require('../utils/bookingToken');
const { sendBookingEmail } = require('../utils/email');

const router = express.Router();

// Health check endpoint for calendar routes
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Calendar routes are working',
    timestamp: new Date().toISOString()
  });
});

// Generate booking link and send to candidate (HR only)
router.post('/generate-booking-link', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { candidateId, roundId, interviewerIds } = req.body;

    if (!candidateId || !roundId || !interviewerIds || interviewerIds.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get candidate and round information
    const candidateResult = await client.query(`
      SELECT c.*, cr.status
      FROM candidates c
      JOIN candidate_rounds cr ON c.id = cr.candidate_id
      WHERE c.id = $1 AND cr.round_id = $2
    `, [candidateId, roundId]);

    if (candidateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate or round assignment not found' });
    }

    const candidate = candidateResult.rows[0];

    // Get round information
    const roundResult = await client.query(`
      SELECT ir.*, j.name as job_name
      FROM interview_rounds ir
      JOIN jobs j ON ir.job_id = j.id
      WHERE ir.id = $1
    `, [roundId]);

    if (roundResult.rows.length === 0) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const round = roundResult.rows[0];

    // Validate interviewer IDs
    const interviewerResult = await client.query(`
      SELECT id, name, email FROM users WHERE id = ANY($1)
    `, [interviewerIds]);

    if (interviewerResult.rows.length !== interviewerIds.length) {
      return res.status(400).json({ error: 'Some interviewer IDs are invalid' });
    }

    const interviewers = interviewerResult.rows;

    // Create booking token (we'll use dummy slot times for now)
    const dummyStart = new Date();
    const dummyEnd = new Date(dummyStart.getTime() + 60 * 60 * 1000);
    
    const bookingToken = await bookingTokenService.createBookingToken(
      candidateId,
      roundId,
      interviewerIds,
      dummyStart,
      dummyEnd
    );

    // Update candidate_rounds with booking token
    await client.query(`
      UPDATE candidate_rounds 
      SET booking_token = $1, status = 'in_progress'
      WHERE candidate_id = $2 AND round_id = $3
    `, [bookingToken.token, candidateId, roundId]);

    // Store interviewer assignments
    await client.query(`
      DELETE FROM interview_assignments 
      WHERE candidate_id = $1 AND round_id = $2
    `, [candidateId, roundId]);

    for (const interviewerId of interviewerIds) {
      await client.query(`
        INSERT INTO interview_assignments (candidate_id, round_id, interviewer_id)
        VALUES ($1, $2, $3)
      `, [candidateId, roundId, interviewerId]);
    }

    await client.query('COMMIT');

    // Generate booking URL
    const bookingUrl = `${process.env.FRONTEND_URL}/book-slot/${bookingToken.token}`;

    // Send booking email to candidate
    try {
      await sendBookingEmail(
        candidate.email,
        candidate.name,
        round.name,
        round.job_name,
        interviewers.map(i => i.name),
        bookingUrl,
        bookingToken.expires_at
      );
    } catch (emailError) {
      console.error('Failed to send booking email:', emailError);
      // Don't fail the request if email fails
    }

    // Update Google Sheets with status change to 'in_progress' (async, non-blocking)
    const SheetSyncService = require('../services/sheetSync');
    SheetSyncService.syncCandidateToSheet(candidateId, roundId).catch(e => {
      console.warn('Sheet sync failed after booking link generation:', e.message);
    });

    res.json({
      message: 'Booking link generated and sent to candidate',
      bookingUrl,
      token: bookingToken.token,
      expiresAt: bookingToken.expires_at
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Generate booking link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Get available slots for booking (public endpoint with token)
router.get('/available-slots/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const slotsData = await bookingTokenService.getAvailableSlots(token);
    
    res.json({
      candidate: {
        name: slotsData.bookingData.candidate_name,
        email: slotsData.bookingData.candidate_email
      },
      round: {
        name: slotsData.bookingData.round_name,
        jobName: slotsData.bookingData.job_name,
        duration: slotsData.round.duration_minutes || 60
      },
      availableSlots: slotsData.availableSlots,
      expiresAt: slotsData.bookingData.expires_at
    });

  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Book a specific slot (public endpoint with token)
router.post('/book-slot/:token', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { token } = req.params;
    const { slotStart, slotEnd } = req.body;

    if (!slotStart || !slotEnd) {
      return res.status(400).json({ error: 'Slot start and end times are required' });
    }

    const startTime = new Date(slotStart);
    const endTime = new Date(slotEnd);

    // Validate booking token
    const bookingData = await bookingTokenService.getBookingToken(token);
    if (!bookingData) {
      return res.status(400).json({ error: 'Invalid or expired booking token' });
    }

    // Check if slot is still available
    const slotsData = await bookingTokenService.getAvailableSlots(token);
    const isSlotAvailable = slotsData.availableSlots.some(slot => 
      new Date(slot.start).getTime() === startTime.getTime() &&
      new Date(slot.end).getTime() === endTime.getTime()
    );

    if (!isSlotAvailable) {
      return res.status(400).json({ error: 'Selected slot is no longer available' });
    }

    // Get interviewer emails
    const interviewerResult = await client.query(`
      SELECT id, name, email FROM users WHERE id = ANY($1)
    `, [bookingData.interviewer_ids]);

    const interviewerEmails = interviewerResult.rows.map(row => row.email);
    const assignedInterviewers = interviewerResult.rows.map(row => ({ id: row.id, name: row.name, email: row.email }));

    // Concurrency guard 1: take advisory locks per interviewer+slot start
    for (const interviewerId of bookingData.interviewer_ids) {
      const lockKey = `${interviewerId}-${startTime.toISOString()}`;
      const lockRes = await client.query(`SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked`, [lockKey]);
      if (!lockRes.rows[0].locked) {
        return res.status(409).json({ error: 'That slot is being booked by someone else. Please pick another slot.' });
      }
    }

    // Concurrency guard 2: re-check DB conflicts within transaction and lock conflicting rows
    const conflictRes = await client.query(`
      SELECT 1
      FROM candidate_rounds cr
      JOIN interview_assignments ia 
        ON cr.candidate_id = ia.candidate_id AND cr.round_id = ia.round_id
      WHERE ia.interviewer_id = ANY($1)
        AND cr.scheduled_time IS NOT NULL
        AND cr.scheduled_time < $3
        AND (cr.scheduled_time + ($3::timestamptz - $2::timestamptz)) > $2
      LIMIT 1
      FOR UPDATE
    `, [bookingData.interviewer_ids, startTime, endTime]);

    if (conflictRes.rows.length > 0) {
      return res.status(409).json({ error: 'Selected slot has just been taken. Please choose another slot.' });
    }

    // Build event summary: Job Name Round Interview Time
    const timeStr = new Date(startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const summary = `${bookingData.job_name} ${bookingData.round_name} Interview ${timeStr}`;

    // Create calendar event (single event in primary interviewer's calendar)
    const calendarEvent = await calendarService.createCalendarEvent(
      bookingData.candidate_email,
      bookingData.candidate_name,
      interviewerEmails,
      startTime,
      endTime,
      summary
    );

    // Update candidate_rounds with booking details
    await client.query(`
      UPDATE candidate_rounds 
      SET scheduled_time = $1, 
          meet_link = $2, 
          calendar_event_id = $3,
          assigned_interviewers = $4::jsonb,
          status = 'scheduled'
      WHERE candidate_id = $5 AND round_id = $6
    `, [startTime, calendarEvent.meetLink, calendarEvent.eventId, JSON.stringify(assignedInterviewers), bookingData.candidate_id, bookingData.round_id]);

    // Mark token as used
    await bookingTokenService.markTokenAsUsed(token);

    await client.query('COMMIT');

    // Update Google Sheets with scheduled status and time (async, non-blocking)
    const SheetSyncService = require('../services/sheetSync');
    SheetSyncService.syncCandidateToSheet(bookingData.candidate_id, bookingData.round_id).catch(e => {
      console.warn('Sheet sync failed after slot booking:', e.message);
    });

    res.json({
      message: 'Slot booked successfully',
      scheduledTime: startTime,
      meetLink: calendarEvent.meetLink,
      calendarLink: calendarEvent.htmlLink
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Book slot error:', error);
    res.status(500).json({ error: 'Failed to book slot. Please try again.' });
  } finally {
    client.release();
  }
});


// Request reassignment (public endpoint with token)
router.post('/request-reassignment/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Validate booking token
    const bookingData = await bookingTokenService.getBookingToken(token);
    if (!bookingData) {
      return res.status(400).json({ error: 'Invalid or expired booking token' });
    }

    // Update candidate_rounds to mark reassignment requested
    await pool.query(`
      UPDATE candidate_rounds 
      SET requested_reassignment = TRUE 
      WHERE candidate_id = $1 AND round_id = $2
    `, [bookingData.candidate_id, bookingData.round_id]);

    console.log(`✅ Reassignment requested for candidate ${bookingData.candidate_id}, round ${bookingData.round_id}`);

    res.json({
      message: 'Reassignment request submitted successfully',
      candidateId: bookingData.candidate_id,
      roundId: bookingData.round_id
    });

  } catch (error) {
    console.error('Request reassignment error:', error);
    res.status(500).json({ error: 'Failed to request reassignment. Please try again.' });
  }
});

// Cleanup expired tokens (internal endpoint)
router.post('/cleanup-tokens', authenticateToken, requireRole(['HR', 'Admin']), async (req, res) => {
  try {
    const cleanedCount = await bookingTokenService.cleanupExpiredTokens();
    res.json({ message: `Cleaned up ${cleanedCount} expired tokens` });
  } catch (error) {
    console.error('Cleanup tokens error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;