const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateEmail, validatePassword } = require('../utils/helpers');
const { sendPasswordResetEmail, sendPasswordResetLink } = require('../utils/email');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const userResult = await pool.query(`
      SELECT u.*, array_agg(r.name) as roles 
      FROM users u 
      LEFT JOIN user_roles ur ON u.id = ur.user_id 
      LEFT JOIN roles r ON ur.role_id = r.id 
      WHERE u.email = $1 AND u.status = 'active'
      GROUP BY u.id
    `, [email]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials or account inactive' });
    }

    const user = userResult.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const { password: _, ...userWithoutPassword } = user;
    res.json({ message: 'Login successful', token, user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const { password, ...userWithoutPassword } = req.user;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, req.user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy direct reset (optional)
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;
    if (!email || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Email, new password and confirmation are required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const userResult = await pool.query("SELECT id, name, email FROM users WHERE email = $1 AND status = 'active'", [email]);
    if (userResult.rows.length === 0) {
      return res.status(200).json({ message: 'If an account exists for this email, the password has been reset' });
    }

    const user = userResult.rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, user.id]);

    setImmediate(async () => {
      try { await sendPasswordResetEmail(user.email, user.name); } catch (e) { console.error('Email error:', e); }
    });

    res.json({ message: 'If an account exists for this email, the password has been reset' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request password reset (tokenized link)
router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validateEmail(email)) {
      return res.status(200).json({ message: 'If an account exists for this email, a reset link has been sent' });
    }

    const userResult = await pool.query("SELECT id, name, email FROM users WHERE email = $1 AND status = 'active'", [email]);
    if (userResult.rows.length === 0) {
      return res.status(200).json({ message: 'If an account exists for this email, a reset link has been sent' });
    }

    const user = userResult.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await pool.query('UPDATE password_resets SET used = TRUE, used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used = FALSE', [user.id]);
    await pool.query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [user.id, tokenHash, expiresAt]);

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    setImmediate(async () => {
      try { await sendPasswordResetLink(user.email, user.name, resetUrl); } catch (e) { console.error('Email error:', e); }
    });

    return res.json({ message: 'If an account exists for this email, a reset link has been sent' });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password using token
router.post('/reset-password-token', async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Token, new password and confirmation are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const prResult = await pool.query(
      `SELECT pr.id, pr.user_id, pr.expires_at, pr.used, u.email, u.name
       FROM password_resets pr JOIN users u ON u.id = pr.user_id
       WHERE pr.token_hash = $1 ORDER BY pr.created_at DESC LIMIT 1`,
      [tokenHash]
    );

    if (prResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const record = prResult.rows[0];
    if (record.used || new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, record.user_id]);
    await pool.query('UPDATE password_resets SET used = TRUE, used_at = CURRENT_TIMESTAMP WHERE id = $1', [record.id]);

    setImmediate(async () => {
      try { await sendPasswordResetEmail(record.email, record.name); } catch (e) { console.error('Email error:', e); }
    });

    return res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password with token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
