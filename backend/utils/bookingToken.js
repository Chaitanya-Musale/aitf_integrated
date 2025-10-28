const crypto = require('crypto');
const pool = require('../config/database');

class BookingTokenService {
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  async createBookingToken(candidateId, roundId, interviewerIds, slotStart, slotEnd) {
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const result = await pool.query(`
      INSERT INTO booking_tokens (token, candidate_id, round_id, interviewer_ids, slot_start, slot_end, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [token, candidateId, roundId, interviewerIds, slotStart, slotEnd, expiresAt]);

    return result.rows[0];
  }

  async getBookingToken(token) {
    const result = await pool.query(`
      SELECT bt.*, c.name as candidate_name, c.email as candidate_email,
             ir.name as round_name, ir.duration_minutes,
             j.name as job_name
      FROM booking_tokens bt
      JOIN candidates c ON bt.candidate_id = c.id
      JOIN interview_rounds ir ON bt.round_id = ir.id
      JOIN jobs j ON ir.job_id = j.id
      WHERE bt.token = $1 AND bt.expires_at > NOW() AND bt.used = false
    `, [token]);

    return result.rows[0] || null;
  }

  async markTokenAsUsed(token) {
    await pool.query(`
      UPDATE booking_tokens 
      SET used = true 
      WHERE token = $1
    `, [token]);
  }

  async cleanupExpiredTokens() {
    const result = await pool.query(`
      DELETE FROM booking_tokens 
      WHERE expires_at < NOW() OR used = true
    `);
    
    console.log(`Cleaned up ${result.rowCount} expired/used booking tokens`);
    return result.rowCount;
  }

  async getAvailableSlots(token) {
    const bookingData = await this.getBookingToken(token);
    if (!bookingData) {
      throw new Error('Invalid or expired booking token');
    }

    // Get round date range
    const roundResult = await pool.query(`
      SELECT start_date, end_date, duration_minutes
      FROM interview_rounds 
      WHERE id = $1
    `, [bookingData.round_id]);

    if (roundResult.rows.length === 0) {
      throw new Error('Round not found');
    }

    const round = roundResult.rows[0];
    const startDate = new Date(round.start_date);

    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(round.end_date);

    endDate.setHours(23, 59, 59, 999);
    const duration = round.duration_minutes || 60;

    // Import calendar service here to avoid circular dependency
    const calendarService = require('./calendar');
    
    const availableSlots = await calendarService.getCommonAvailableSlots(
      bookingData.interviewer_ids,
      startDate,
      endDate,
      duration
    );

    return {
      bookingData,
      availableSlots,
      round
    };
  }
}

module.exports = new BookingTokenService();