const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { generateRandomPassword, validateEmail } = require('../utils/helpers');
const { sendWelcomeEmail } = require('../utils/email');

const router = express.Router();

// Get all users (Admin only)
router.get('/', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.status, u.created_at, u.updated_at,
             array_agg(
               CASE WHEN r.name IS NOT NULL 
               THEN json_build_object('id', r.id, 'name', r.name)
               ELSE NULL END
             ) FILTER (WHERE r.name IS NOT NULL) as roles
      FROM users u 
      LEFT JOIN user_roles ur ON u.id = ur.user_id 
      LEFT JOIN roles r ON ur.role_id = r.id 
      GROUP BY u.id, u.name, u.email, u.status, u.created_at, u.updated_at
      ORDER BY u.created_at DESC
    `);

    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new user (Admin only)
router.post('/', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { name, email, roleIds } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    if (!roleIds || roleIds.length === 0) {
      return res.status(400).json({ error: 'At least one role must be assigned' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if email already exists
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Generate random password
    const randomPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(randomPassword, 8); // Reduced rounds for faster hashing

    // Create user
    const userResult = await client.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, status, created_at',
      [name, email, hashedPassword]
    );

    const newUser = userResult.rows[0];

    // Batch insert roles for better performance
    if (roleIds && roleIds.length > 0) {
      const roleValues = roleIds.map((roleId, index) => `($1, $${index + 2})`).join(', ');
      const roleParams = [newUser.id, ...roleIds];
      
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ${roleValues}`,
        roleParams
      );
    }

    await client.query('COMMIT');

    // Send welcome email asynchronously (don't wait for it)
    setImmediate(async () => {
      try {
        await sendWelcomeEmail(email, name, randomPassword);
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
      }
    });

    res.status(201).json({
      message: 'User created successfully',
      user: newUser
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Update user (Admin only)
router.put('/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { name, roleIds } = req.body;

    // Validate that at least one role is provided
    if (roleIds !== undefined && roleIds.length === 0) {
      return res.status(400).json({ error: 'User must have at least one role assigned' });
    }

    // Update user name if provided
    if (name) {
      await client.query(
        'UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [name, id]
      );
    }

    // Update roles if provided
    if (roleIds !== undefined) {
      // Remove existing roles
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);

      // Add new roles
      if (roleIds && roleIds.length > 0) {
        for (const roleId of roleIds) {
          await client.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
            [id, roleId]
          );
        }
      }
    }

    await client.query('COMMIT');

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Update user status (Admin only)
router.put('/:id/status', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active or inactive' });
    }

    // Prevent admin from deactivating themselves
    if (parseInt(id) === req.user.id && status === 'inactive') {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const result = await pool.query(
      'UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, email, status',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User status updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user (Admin only)
router.delete('/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, name, email', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User deleted successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user roles (Admin only)
router.put('/:id/roles', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { roleIds } = req.body;

    // Remove existing roles
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);

    // Add new roles
    if (roleIds && roleIds.length > 0) {
      for (const roleId of roleIds) {
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [id, roleId]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ message: 'User roles updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update user roles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;