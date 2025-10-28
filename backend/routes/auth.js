const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateEmail, validatePassword } = require('../utils/helpers');
const { sendPasswordResetEmail, sendPasswordResetLink } = require('../utils/email');
const crypto = require('crypto');

const router = express.Router();

// LOGIN
router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt:', { email: req.body.email, hasPassword: !!req.body.password });
    
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    console.log('Querying database for user:', email);

    // Get user with roles
    const userResult = await pool.query(`
      SELECT u.*, array_agg(r.name) AS roles 
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

    // Prevent Admins from using normal login; must use /auth/admin/login
    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (roles.includes('Admin')) {
      return res.status(403).json({ error: 'Admin must use admin login' });
    }

    // Generate JWT token with shorter expiration for session-based auth
    const token = jwt.sign(
      { userId: user.id, email: user.email, loginTime: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({ message: 'Login successful', token, user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN LOGIN (separate audience and stricter TTL)
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Get user with roles
    const userResult = await pool.query(`
      SELECT u.*, array_agg(r.name) AS roles 
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

    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!roles.includes('Admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Issue admin-scoped token (shorter expiry)
    const secret = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET;
    const token = jwt.sign(
      { userId: user.id, email: user.email, loginTime: Date.now(), aud: 'admin', admin: true },
      secret,
      { expiresIn: '1h' }
    );

    const { password: _pw, ...userWithoutPassword } = user;
    res.json({ message: 'Admin login successful', token, user: userWithoutPassword });
  } catch (error) {
    console.error('Admin login error:', error);
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

// Change password (authenticated)
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Verify current password (req.user should have password hash)
    const isValidPassword = await bcrypt.compare(currentPassword, req.user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// REQUEST PASSWORD RESET (send tokenized link)
router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;

    // Always return success to avoid enumeration
    if (!email || !validateEmail(email)) {
      return res.status(200).json({ message: 'If an account exists for this email, a reset link has been sent' });
    }

    const userResult = await pool.query(
      `SELECT id, name, email FROM users WHERE email = $1 AND status = 'active'`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(200).json({ message: 'If an account exists for this email, a reset link has been sent' });
    }

    const user = userResult.rows[0];

    // Create token and store hashed
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Invalidate previous unused tokens for this user
    await pool.query(
      'UPDATE password_resets SET used = TRUE, used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used = FALSE',
      [user.id]
    );

    await pool.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    const resetUrl = `${process.env.FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

    // Send email asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        await sendPasswordResetLink(user.email, user.name, resetUrl);
      } catch (emailErr) {
        console.error('Failed to send password reset link:', emailErr);
      }
    });

    return res.json({ message: 'If an account exists for this email, a reset link has been sent' });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// RESET PASSWORD USING TOKEN
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
       FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.token_hash = $1
       ORDER BY pr.created_at DESC
       LIMIT 1`,
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

    // Update user password and mark token used in a transaction-like sequence
    await pool.query('BEGIN');
    try {
      await pool.query('UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, record.user_id]);
      await pool.query('UPDATE password_resets SET used = TRUE, used_at = CURRENT_TIMESTAMP WHERE id = $1', [record.id]);
      await pool.query('COMMIT');
    } catch (txErr) {
      await pool.query('ROLLBACK');
      throw txErr;
    }

    // Send confirmation email asynchronously
    setImmediate(async () => {
      try {
        await sendPasswordResetEmail(record.email, record.name);
      } catch (emailErr) {
        console.error('Failed to send password reset confirmation:', emailErr);
      }
    });

    return res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password with token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// RESET PASSWORD BY EMAIL (no token — will reset immediately if email exists)
// Note: this endpoint is typically less secure — keep only if that's intentional for your app.
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

    const userResult = await pool.query(
      `SELECT id, name, email FROM users WHERE email = $1 AND status = 'active'`,
      [email]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal whether the email exists to avoid enumeration
      return res.status(200).json({ message: 'If an account exists for this email, the password has been reset' });
    }

    const user = userResult.rows[0];

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, user.id]
    );

    // Send confirmation email (async)
    setImmediate(async () => {
      try {
        await sendPasswordResetEmail(user.email, user.name);
      } catch (emailErr) {
        console.error('Failed to send password reset email:', emailErr);
      }
    });

    res.json({ message: 'If an account exists for this email, the password has been reset' });
  } catch (error) {
    console.error('Reset password (by email) error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
