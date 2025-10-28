const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all roles
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM roles ORDER BY name');
    res.json({ roles: result.rows });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new role (Admin only)
router.post('/', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    // Check if role already exists
    const existingRole = await pool.query('SELECT id FROM roles WHERE name = $1', [name]);
    if (existingRole.rows.length > 0) {
      return res.status(400).json({ error: 'Role already exists' });
    }

    const result = await pool.query(
      'INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );

    res.status(201).json({
      message: 'Role created successfully',
      role: result.rows[0]
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update role (Admin only)
router.put('/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    // Check if another role with the same name exists
    const existingRole = await pool.query('SELECT id FROM roles WHERE name = $1 AND id != $2', [name, id]);
    if (existingRole.rows.length > 0) {
      return res.status(400).json({ error: 'Role name already exists' });
    }

    const result = await pool.query(
      'UPDATE roles SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name, description || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    res.json({
      message: 'Role updated successfully',
      role: result.rows[0]
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete role (Admin only)
router.delete('/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if it's a base role that cannot be deleted
    const roleResult = await pool.query('SELECT name FROM roles WHERE id = $1', [id]);
    if (roleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const roleName = roleResult.rows[0].name;
    const baseRoles = ['Admin', 'HR', 'Interviewer'];
    
    if (baseRoles.includes(roleName)) {
      return res.status(400).json({ error: `Cannot delete base role '${roleName}'` });
    }

    // Check if role is assigned to any users
    const assignedUsers = await pool.query('SELECT COUNT(*) FROM user_roles WHERE role_id = $1', [id]);
    if (parseInt(assignedUsers.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete role that is assigned to users' });
    }

    const result = await pool.query('DELETE FROM roles WHERE id = $1 RETURNING *', [id]);

    res.json({
      message: 'Role deleted successfully',
      role: result.rows[0]
    });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;