const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// First-time user setup endpoint (replaces public registration)
router.post('/setup', async (req, res) => {
  try {
    const { email, provisionToken, password } = req.body;

    if (!email || !provisionToken || !password) {
      return res.status(400).json({ error: 'Email, provision token, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Find user with matching email and provision token
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, provision_token_expires, is_provisioned FROM users WHERE email = $1 AND provision_token = $2',
      [email, provisionToken]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or provision token' });
    }

    const user = result.rows[0];

    // Check if already provisioned
    if (user.is_provisioned) {
      return res.status(400).json({ error: 'User account already set up' });
    }

    // Check if token is expired
    if (user.provision_token_expires && new Date() > new Date(user.provision_token_expires)) {
      return res.status(400).json({ error: 'Provision token has expired' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Update user with password and mark as provisioned
    const updateResult = await pool.query(
      `UPDATE users 
       SET password_hash = $1, is_provisioned = TRUE, provision_token = NULL, provision_token_expires = NULL 
       WHERE id = $2 
       RETURNING id, first_name, last_name, email, is_admin, is_super_user, created_at`,
      [passwordHash, user.id]
    );

    const updatedUser = updateResult.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: updatedUser.id, firstName: updatedUser.first_name, lastName: updatedUser.last_name, email: updatedUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Account setup completed successfully',
      token,
      user: {
        id: updatedUser.id,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        email: updatedUser.email,
        isAdmin: updatedUser.is_admin,
        isSuperUser: updatedUser.is_super_user,
        createdAt: updatedUser.created_at
      }
    });
  } catch (error) {
    logger.error('Account setup error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email only
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, password_hash, is_admin, is_super_user, is_provisioned, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if user account has been provisioned
    if (!user.is_provisioned) {
      return res.status(403).json({ 
        error: 'Account not yet set up. Please use your provision token to complete account setup.',
        needsProvisioning: true
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        isAdmin: user.is_admin,
        isSuperUser: user.is_super_user,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Validate provision token endpoint
router.post('/validate-provision-token', async (req, res) => {
  try {
    const { email, provisionToken } = req.body;

    if (!email || !provisionToken) {
      return res.status(400).json({ error: 'Email and provision token are required' });
    }

    // Find user with matching email and provision token
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, provision_token_expires, is_provisioned FROM users WHERE email = $1 AND provision_token = $2',
      [email, provisionToken]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or provision token' });
    }

    const user = result.rows[0];

    // Check if already provisioned
    if (user.is_provisioned) {
      return res.status(400).json({ error: 'User account already set up' });
    }

    // Check if token is expired
    if (user.provision_token_expires && new Date() > new Date(user.provision_token_expires)) {
      return res.status(400).json({ error: 'Provision token has expired' });
    }

    res.json({
      message: 'Provision token is valid',
      user: {
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      }
    });
  } catch (error) {
    logger.error('Provision token validation error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint (client-side token removal)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logout successful' });
});

module.exports = router;