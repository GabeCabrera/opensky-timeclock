/**
 * Admin Routes
 * -------------
 * These routes cover: manual time entry approvals, user lifecycle (create/provision/update/delete),
 * pay & preference settings, and dashboard statistics.
 *
 * Design Notes:
 * - Authorization: Layered middleware (authenticateToken -> requireAdmin / requireSuperUser) keeps
 *   role logic centralized & composable.
 * - Manual Entry Review: We restrict approval actions to entries flagged is_manual=TRUE and still
 *   in 'pending' state to avoid double processing races.
 * - Approval Metadata: approval_status, approved_by (FK -> users), approval_date (timestamp),
 *   approval_notes (nullable text added via migration 0001). When adding new metadata fields,
 *   ensure migrations run before referencing them here.
 * - Query Style: Simplicity > abstraction; raw parameterized SQL chosen over an ORM to keep
 *   transparency and control for performance tuning.
 * - Future Enhancements (see backlog): audit trail table, pagination for users & entries,
 *   soft deletes, rate limiter for admin actions, search filters.
 */
const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sendMail, mailerStatus } = require('../utils/mailer');
const { logger } = require('../utils/logger');
const { addAdminStream, removeAdminStream } = require('../realtime/pubsub');

const router = express.Router();

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    
    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
  logger.error('Admin check error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to check if user is super user
const requireSuperUser = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query('SELECT is_super_user FROM users WHERE id = $1', [userId]);
    
    if (result.rows.length === 0 || !result.rows[0].is_super_user) {
      return res.status(403).json({ error: 'Super user access required' });
    }
    
    next();
  } catch (error) {
  logger.error('Super user check error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin SSE stream for pending entry events (placed after middleware definitions)
router.get('/time/stream', authenticateToken, requireAdmin, async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write('\n');
  addAdminStream(res);
  try {
    const countRes = await pool.query("SELECT COUNT(*) FROM time_entries WHERE is_manual = TRUE AND approval_status = 'pending'");
    res.write('event: pending-summary\n');
    res.write(`data: ${JSON.stringify({ pendingCount: parseInt(countRes.rows[0].count, 10) })}\n\n`);
  } catch (_) {}
  req.on('close', () => removeAdminStream(res));
});

// Get all pending manual time entries
// NOTE: Deliberately limits to 'pending'; approved/denied history should eventually live
// in a separate endpoint with pagination & filters to avoid overloading this list.
router.get('/pending-entries', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        te.id, te.clock_in, te.clock_out,
        te.approval_status, te.created_at, te.approval_notes,
        u.first_name, u.last_name, u.email,
        CASE 
          WHEN te.clock_out IS NOT NULL THEN 
            EXTRACT(EPOCH FROM (te.clock_out - te.clock_in)) / 3600
          ELSE NULL 
        END as hours_worked
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE te.is_manual = TRUE AND te.approval_status = 'pending'
       ORDER BY te.created_at DESC`
    );

    const entries = result.rows.map(entry => ({
      id: entry.id,
      clockIn: entry.clock_in,
      clockOut: entry.clock_out,
      approvalStatus: entry.approval_status,
      approvalNotes: entry.approval_notes || null,
      createdAt: entry.created_at,
      hoursWorked: entry.hours_worked ? parseFloat(entry.hours_worked).toFixed(2) : null,
      user: {
        firstName: entry.first_name,
        lastName: entry.last_name,
        email: entry.email
      }
    }));

    res.json({ entries });
  } catch (error) {
    logger.error('Get pending entries error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve or deny a time entry
// Concurrency Guard: We re-check approval_status to prevent repeated decisions. A future
// enhancement could add a WHERE approval_status='pending' clause and verify rowCount === 1.
router.patch('/entry/:id/approval', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const adminId = req.user.userId;

    // Validate status
    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "approved" or "denied"' });
    }

    // Check if entry exists and is manual
    const entryCheck = await pool.query(
      'SELECT id, approval_status FROM time_entries WHERE id = $1 AND is_manual = TRUE',
      [id]
    );

    if (entryCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Manual time entry not found' });
    }

    if (entryCheck.rows[0].approval_status !== 'pending') {
      return res.status(400).json({ error: 'Time entry has already been reviewed' });
    }

    // Update approval status and optionally notes (approval_notes added by migration)
    const result = await pool.query(
      `UPDATE time_entries 
       SET approval_status = $1, approved_by = $2, approval_date = CURRENT_TIMESTAMP, approval_notes = COALESCE($3, approval_notes)
       WHERE id = $4 
       RETURNING *`,
      [status, adminId, notes || null, id]
    );

    const entry = result.rows[0];
    // Audit approval
    await pool.query(
      `INSERT INTO time_entry_audit (time_entry_id, user_id, action, previous_clock_in, previous_clock_out, new_clock_in, new_clock_out, previous_approval_status, new_approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [entry.id, adminId, status === 'approved' ? 'approve' : 'deny', entry.clock_in, entry.clock_out, entry.clock_in, entry.clock_out, 'pending', entry.approval_status]
    );
    const hoursWorked = entry.clock_out ? ((new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000).toFixed(2) : null;

    res.json({
      message: `Time entry ${status} successfully`,
      entry: {
        id: entry.id,
        clockIn: entry.clock_in,
        clockOut: entry.clock_out,
        workDescription: entry.work_description,
        approvalStatus: entry.approval_status,
        approvalNotes: entry.approval_notes || null,
        approvedAt: entry.approval_date,
        hoursWorked
      }
    });
  } catch (error) {
    logger.error('Approval error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get admin dashboard stats
// Aggregates are lightweight; if this expands significantly consider materialized views
// or a nightly rollup for expensive time spans.
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await Promise.all([
      // Pending entries count
      pool.query('SELECT COUNT(*) FROM time_entries WHERE is_manual = TRUE AND approval_status = \'pending\''),
      // Total manual entries this month
      pool.query(`
        SELECT COUNT(*) FROM time_entries 
        WHERE is_manual = TRUE 
        AND clock_in >= date_trunc('month', CURRENT_DATE)
      `),
      // Approved this week
      pool.query(`
        SELECT COUNT(*) FROM time_entries 
        WHERE is_manual = TRUE AND approval_status = 'approved'
        AND approval_date >= date_trunc('week', CURRENT_DATE)
      `),
      // Denied this week
      pool.query(`
        SELECT COUNT(*) FROM time_entries 
        WHERE is_manual = TRUE AND approval_status = 'denied'
        AND approval_date >= date_trunc('week', CURRENT_DATE)
      `)
    ]);

    res.json({
      pendingEntries: parseInt(stats[0].rows[0].count),
      totalManualThisMonth: parseInt(stats[1].rows[0].count),
      approvedThisWeek: parseInt(stats[2].rows[0].count),
      deniedThisWeek: parseInt(stats[3].rows[0].count)
    });
  } catch (error) {
    logger.error('Admin stats error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new user account (admin only)
// Provision Flow: user is created with a one-time provision_token (expires in 7 days) used
// to set an initial password during setup. Tokens are regenerated on demand.
router.post('/create-user', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, isAdmin = false } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Check if user already exists (by email only)
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Generate secure provision token
    const provisionToken = crypto.randomBytes(32).toString('hex');
    
    // Set token expiration to 7 days from now
    const tokenExpires = new Date();
    tokenExpires.setDate(tokenExpires.getDate() + 7);

    // Create user with provision token
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, is_admin, is_provisioned, provision_token, provision_token_expires) 
       VALUES ($1, $2, $3, $4, FALSE, $5, $6) 
       RETURNING id, first_name, last_name, email, is_admin, created_at`,
      [firstName, lastName, email, isAdmin, provisionToken, tokenExpires]
    );

    const user = result.rows[0];

    // Fire-and-forget invite email (soft fail logs)
    const baseAppUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const provisionLink = `${baseAppUrl.replace(/\/$/, '')}/setup?email=${encodeURIComponent(email)}&token=${provisionToken}`;
    sendMail({
      to: email,
      subject: 'You have been invited to OpenSky Time Clock',
      html: `<p>Hello ${firstName || ''},</p>
        <p>You have been invited to set up your OpenSky Time Clock account.</p>
        <p><strong>Provision Token:</strong> ${provisionToken}</p>
        <p>This token expires on ${tokenExpires.toLocaleDateString()}.</p>
        <p><a style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:600" href="${provisionLink}">Complete Your Account Setup</a></p>
        <p>If the button above does not work, copy and paste this URL into your browser:<br><span style="word-break:break-all;color:#555">${provisionLink}</span></p>
        <p>If you were not expecting this email you can ignore it.</p>`
    }).catch(()=>{});
    // Construct a direct onboarding link (already used above in the email body)

    res.status(201).json({
      message: 'User account created successfully',
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        isAdmin: user.is_admin,
        createdAt: user.created_at
      },
      provisionToken,
      provisionTokenExpires: tokenExpires,
      provisionLink
    });
  } catch (error) {
    logger.error('Create user error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (for admin user management)
// TODO: Add pagination; current approach loads all users which will not scale indefinitely.
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, is_admin, is_super_user, is_provisioned, provision_token_expires, created_at,
       hourly_rate, tax_rate, pay_schedule, overtime_enabled, overtime_rate, time_format, timezone, email_notifications,
       (SELECT COUNT(*) FROM time_entries WHERE user_id = users.id) as total_entries,
       (SELECT COUNT(*) FROM time_entries WHERE user_id = users.id AND is_manual = TRUE) as manual_entries
       FROM users ORDER BY created_at DESC`
    );

    const users = result.rows.map(user => ({
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      isAdmin: user.is_admin,
      isSuperUser: user.is_super_user,
      isProvisioned: user.is_provisioned,
      provisionTokenExpires: user.provision_token_expires,
      createdAt: user.created_at,
      // Pay settings
      hourlyRate: user.hourly_rate || 0,
      taxRate: user.tax_rate || 25,
      paySchedule: user.pay_schedule || 'bi-weekly',
      overtimeEnabled: user.overtime_enabled || false,
      overtimeRate: 1.5, // Fixed at 1.5
      // Preferences
      timeFormat: user.time_format || '12',
      timezone: user.timezone || 'America/New_York',
      emailNotifications: user.email_notifications !== false,
      stats: {
        totalEntries: parseInt(user.total_entries),
        manualEntries: parseInt(user.manual_entries)
      }
    }));

    res.json({ users });
  } catch (error) {
    logger.error('Get users error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Payroll: current period hours & estimated gross pay per user
// Determines period range based on each user's pay_schedule:
//  - weekly: current calendar week (date_trunc('week', CURRENT_DATE) .. +7d)
//  - bi-weekly: current week plus previous week (start current week -7d .. +7d)
//  - monthly: current calendar month (date_trunc('month', CURRENT_DATE) .. next month)
// Simplifications:
//  - Overtime threshold: 40h weekly, 80h bi-weekly, 160h monthly. Overtime applied only if user.overtime_enabled.
//  - All time entries with a clock_out inside the window and a non-null clock_out are counted fully; no proration for spanning entries.
router.get('/payroll/period-hours', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Fetch minimal user pay context
    const usersResult = await pool.query(`
      SELECT id, hourly_rate, pay_schedule, overtime_enabled
      FROM users
      WHERE is_provisioned = TRUE
    `);

    const now = new Date();
    const weekStart = new Date(now);
    // Align weekStart to Monday (Postgres date_trunc('week') equivalent)
    const day = weekStart.getDay(); // 0=Sun
    const diffToMonday = (day + 6) % 7; // number of days since Monday
    weekStart.setDate(weekStart.getDate() - diffToMonday);
    weekStart.setHours(0,0,0,0);
    const nextWeekStart = new Date(weekStart); nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const rows = [];
    for (const u of usersResult.rows) {
      const schedule = u.pay_schedule || 'bi-weekly';
      let periodStart, periodEnd, overtimeThreshold;
      switch (schedule) {
        case 'weekly':
          periodStart = weekStart;
          periodEnd = nextWeekStart;
          overtimeThreshold = 40;
          break;
        case 'monthly':
          periodStart = monthStart;
          periodEnd = nextMonthStart;
          overtimeThreshold = 160; // approx 4 * 40
          break;
        case 'bi-weekly':
        default:
          periodStart = prevWeekStart; // include previous week
          periodEnd = nextWeekStart;   // end at start of next week
          overtimeThreshold = 80;
          break;
      }

      // Query total hours in period (clock_out filter ensures completed entries). Use clock_in range for inclusion.
      const hoursResult = await pool.query(`
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600), 0) AS hours
        FROM time_entries
        WHERE user_id = $1
          AND clock_out IS NOT NULL
          AND clock_in >= $2
          AND clock_in < $3
      `, [u.id, periodStart.toISOString(), periodEnd.toISOString()]);

      const totalHours = parseFloat(hoursResult.rows[0].hours);
      const overtimeEnabled = !!u.overtime_enabled;
      const regularHours = overtimeEnabled ? Math.min(totalHours, overtimeThreshold) : totalHours;
      const overtimeHours = overtimeEnabled ? Math.max(0, totalHours - overtimeThreshold) : 0;
      const rate = parseFloat(u.hourly_rate) || 0;
      const overtimeRateMultiplier = 1.5;
      const estGross = (regularHours * rate) + (overtimeHours * rate * overtimeRateMultiplier);

      rows.push({
        userId: u.id,
        schedule,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        hours: Number(totalHours.toFixed(2)),
        regularHours: Number(regularHours.toFixed(2)),
        overtimeHours: Number(overtimeHours.toFixed(2)),
        estGross: Number(estGross.toFixed(2)),
        hourlyRate: Number(rate.toFixed(2)),
        overtimeEnabled
      });
    }

    res.json({ period: { generatedAt: new Date().toISOString() }, users: rows });
  } catch (error) {
    logger.error('Payroll period hours error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: paginated time entries for a specific user with optional filters
// Query params: page (1-based), pageSize (default 25, max 100), approval (pending|approved|denied|all), manual (true|false|all)
router.get('/users/:userId/time-entries', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSizeRaw = parseInt(req.query.pageSize, 10);
    const pageSize = Math.min(100, pageSizeRaw > 0 ? pageSizeRaw : 25);
    const approval = (req.query.approval || 'all').toString();
    const manual = (req.query.manual || 'all').toString();

    const whereParts = ['user_id = $1'];
    const params = [userId];
    let paramIdx = params.length;
    if (approval !== 'all') {
      paramIdx += 1; params.push(approval);
      whereParts.push(`approval_status = $${paramIdx}`);
    }
    if (manual !== 'all') {
      paramIdx += 1; params.push(manual === 'true');
      whereParts.push(`is_manual = $${paramIdx}`);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const totalResult = await pool.query(`SELECT COUNT(*) FROM time_entries ${whereClause}`, params);
    const total = parseInt(totalResult.rows[0].count, 10) || 0;
    const entriesResult = await pool.query(
  `SELECT id, clock_in, clock_out, is_manual, approval_status, approval_notes, created_at
       FROM time_entries
       ${whereClause}
       ORDER BY clock_in DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    const entries = entriesResult.rows.map(r => ({
      id: r.id,
      clockIn: r.clock_in,
      clockOut: r.clock_out,
      isManual: r.is_manual,
      approvalStatus: r.approval_status,
      approvalNotes: r.approval_notes,
      createdAt: r.created_at,
    }));

    res.json({ page, pageSize, total, entries });
  } catch (error) {
    logger.error('Admin user time entries error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: current time status for a specific user (mirrors /time/status logic but for arbitrary user)
router.get('/users/:userId/time-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const activeResult = await pool.query(
      `SELECT id, clock_in FROM time_entries
       WHERE user_id = $1 AND clock_out IS NULL
       ORDER BY clock_in DESC LIMIT 1`,
      [userId]
    );
    if (activeResult.rows.length > 0) {
      const row = activeResult.rows[0];
      return res.json({ status: 'clocked-in', activeEntry: { id: row.id, clockIn: row.clock_in } });
    }
    return res.json({ status: 'clocked-out', activeEntry: null });
  } catch (error) {
    logger.error('Admin user time status error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get full user details (identity + contact + pay + prefs + stats)
router.get('/users/:userId/full', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const userResult = await pool.query(
      `SELECT 
        id, first_name, last_name, email, is_admin, is_super_user, is_provisioned, provision_token_expires, created_at,
        hourly_rate, tax_rate, pay_schedule, overtime_enabled, overtime_rate, time_format, timezone, email_notifications,
        address_line1, address_line2, city, state, postal_code, country, phone, mobile_phone
       FROM users WHERE id = $1`,
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const u = userResult.rows[0];
    // Aggregate stats
    const statsResult = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM time_entries WHERE user_id = $1) as total_entries,
        (SELECT COUNT(*) FROM time_entries WHERE user_id = $1 AND is_manual = TRUE) as manual_entries
      `,
      [userId]
    );
    const s = statsResult.rows[0];
    res.json({
      user: {
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        isAdmin: u.is_admin,
        isSuperUser: u.is_super_user,
        isProvisioned: u.is_provisioned,
        provisionTokenExpires: u.provision_token_expires,
        createdAt: u.created_at,
        hourlyRate: u.hourly_rate || 0,
        taxRate: u.tax_rate || 25,
        paySchedule: u.pay_schedule || 'bi-weekly',
        overtimeEnabled: u.overtime_enabled || false,
        overtimeRate: u.overtime_rate || 1.5,
        timeFormat: u.time_format || '12',
        timezone: u.timezone || 'America/New_York',
        emailNotifications: u.email_notifications !== false,
        // Contact
        addressLine1: u.address_line1 || '',
        addressLine2: u.address_line2 || '',
        city: u.city || '',
        state: u.state || '',
        postalCode: u.postal_code || '',
        country: u.country || '',
        phone: u.phone || '',
        mobilePhone: u.mobile_phone || '',
        stats: {
          totalEntries: parseInt(s.total_entries || '0'),
          manualEntries: parseInt(s.manual_entries || '0')
        }
      }
    });
  } catch (error) {
    logger.error('Get full user details error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user contact details (admin or super user)
router.put('/users/:userId/contact', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phone,
      mobilePhone
    } = req.body;

    // Basic validation (optional tighter rules later)
    if (phone && phone.length > 40) {
      return res.status(400).json({ error: 'Phone too long' });
    }

    const result = await pool.query(
      `UPDATE users SET 
        address_line1 = $1,
        address_line2 = $2,
        city = $3,
        state = $4,
        postal_code = $5,
        country = $6,
        phone = $7,
        mobile_phone = $8,
        updated_at = NOW()
       WHERE id = $9
       RETURNING id, address_line1, address_line2, city, state, postal_code, country, phone, mobile_phone`,
      [addressLine1 || null, addressLine2 || null, city || null, state || null, postalCode || null, country || null, phone || null, mobilePhone || null, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const row = result.rows[0];
    res.json({
      message: 'Contact details updated',
      contact: {
        addressLine1: row.address_line1 || '',
        addressLine2: row.address_line2 || '',
        city: row.city || '',
        state: row.state || '',
        postalCode: row.postal_code || '',
        country: row.country || '',
        phone: row.phone || '',
        mobilePhone: row.mobile_phone || ''
      }
    });
  } catch (error) {
    logger.error('Update user contact error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Regenerate provision token for a user
// Only permitted for non-provisioned accounts to avoid invalidating active credentials.
router.post('/regenerate-provision-token/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists and is not provisioned
    const userResult = await pool.query(
      'SELECT id, email, is_provisioned, first_name, last_name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.is_provisioned) {
      return res.status(400).json({ error: 'User account is already provisioned' });
    }

    // Generate new provision token
    const provisionToken = crypto.randomBytes(32).toString('hex');
    
    // Set token expiration to 7 days from now
    const tokenExpires = new Date();
    tokenExpires.setDate(tokenExpires.getDate() + 7);

    // Update user with new provision token
    await pool.query(
      'UPDATE users SET provision_token = $1, provision_token_expires = $2 WHERE id = $3',
      [provisionToken, tokenExpires, userId]
    );

    // Email updated token
    const baseAppUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const provisionLink = `${baseAppUrl.replace(/\/$/, '')}/setup?email=${encodeURIComponent(user.email)}&token=${provisionToken}`;
    sendMail({
      to: user.email,
      subject: 'Your provisioning token has been regenerated',
      html: `<p>Hello ${user.first_name || ''},</p>
        <p>Your provisioning token has been regenerated and is valid for the next 7 days.</p>
        <p><strong>New Provision Token:</strong> ${provisionToken}</p>
        <p><a style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:600" href="${provisionLink}">Resume Account Setup</a></p>
        <p>If the button above does not work, copy and paste this URL into your browser:<br><span style="word-break:break-all;color:#555">${provisionLink}</span></p>`
    }).catch(()=>{});
    res.json({
      message: 'Provision token regenerated successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      },
      provisionToken,
      provisionTokenExpires: tokenExpires,
      provisionLink
    });
  } catch (error) {
    logger.error('Regenerate provision token error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit user (super user only)
// Rule: Only super users can modify privilege elevations (admin/super). Simpler to enforce
// by restricting route rather than conditional field filtering.
router.put('/users/:userId', authenticateToken, requireSuperUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, isAdmin, isSuperUser } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Check if user exists
    const userResult = await pool.query('SELECT id, first_name, last_name, email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email already exists for other users
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Update user
    const result = await pool.query(
      'UPDATE users SET first_name = $1, last_name = $2, email = $3, is_admin = $4, is_super_user = $5 WHERE id = $6 RETURNING id, first_name, last_name, email, is_admin, is_super_user, created_at',
      [firstName, lastName, email, !!isAdmin, !!isSuperUser, userId]
    );

    const updatedUser = result.rows[0];

    res.json({
      message: 'User updated successfully',
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
    logger.error('Edit user error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user (super user only)
// Hard delete with ON DELETE CASCADE on time entries. Consider soft delete + restore in future.
router.delete('/users/:userId', authenticateToken, requireSuperUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.userId;

    // Prevent user from deleting themselves
    if (parseInt(userId) === currentUserId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists
  const userResult = await pool.query('SELECT id, email, first_name, last_name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

  // Delete user (this will cascade delete their time entries due to foreign key constraint)
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  logger.info('Admin user deleted', { by: currentUserId, target: userId, email: user.email });

    res.json({
      message: 'User deleted successfully',
      deletedUser: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (error) {
    logger.error('Delete user error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user settings
// Separation: Distinct endpoint isolates pay/preference editing logic from identity edits.
router.get('/user/:userId/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(
      `SELECT 
        id, first_name, last_name, email,
        hourly_rate, tax_rate, pay_schedule,
        overtime_enabled, overtime_rate,
        time_format, timezone,
        email_notifications
      FROM users 
      WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        hourlyRate: user.hourly_rate || 0,
        taxRate: user.tax_rate || 25,
        paySchedule: user.pay_schedule || 'bi-weekly',
        overtimeEnabled: user.overtime_enabled || false,
        overtimeRate: user.overtime_rate || 1.5,
        timeFormat: user.time_format || '12',
        timezone: user.timezone || 'America/New_York',
        emailNotifications: user.email_notifications !== false
      }
    });
  } catch (error) {
    logger.error('Get user settings error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user settings with hierarchical permissions
// Hierarchy Rules Recap: super users > admins > regular users. Admins blocked from editing
// their own pay or other admins/supers. Extend here if adding roles.
router.put('/user/:userId/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.userId;
    const {
      hourlyRate,
      taxRate,
      paySchedule,
      overtimeEnabled,
      timeFormat,
      timezone,
      emailNotifications
    } = req.body;

    // Get current user's permissions
    const currentUserResult = await pool.query(
      'SELECT is_admin, is_super_user FROM users WHERE id = $1', 
      [currentUserId]
    );
    
    if (currentUserResult.rows.length === 0) {
      return res.status(403).json({ error: 'User not found' });
    }

    const currentUser = currentUserResult.rows[0];
    const isSuperUser = currentUser.is_super_user;
    const isAdmin = currentUser.is_admin;

    // Get target user's info
    const targetUserResult = await pool.query(
      'SELECT is_admin, is_super_user FROM users WHERE id = $1', 
      [userId]
    );
    
    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const targetUser = targetUserResult.rows[0];

    // Enforce hierarchical rules:
    // 1. Super users can edit anyone's pay
    // 2. Admins can edit employees' pay but not their own or other admins'/super users'
    // 3. Regular users cannot edit anyone's pay (handled by requireAdmin middleware)
    
    if (!isSuperUser) {
      // If current user is admin but not super user
      if (currentUserId.toString() === userId.toString()) {
        return res.status(403).json({ error: 'Admins cannot edit their own pay settings' });
      }
      
      if (targetUser.is_admin || targetUser.is_super_user) {
        return res.status(403).json({ error: 'Admins cannot edit other admins\' or super users\' pay settings' });
      }
    }

    // Validate inputs
    if (hourlyRate !== undefined && (isNaN(hourlyRate) || hourlyRate < 0)) {
      return res.status(400).json({ error: 'Invalid hourly rate' });
    }
    
    if (taxRate !== undefined && (isNaN(taxRate) || taxRate < 0 || taxRate > 100)) {
      return res.status(400).json({ error: 'Tax rate must be between 0 and 100' });
    }

    if (paySchedule && !['weekly', 'bi-weekly', 'bi-monthly', 'monthly'].includes(paySchedule)) {
      return res.status(400).json({ error: 'Invalid pay schedule' });
    }

    if (timeFormat && !['12', '24'].includes(timeFormat)) {
      return res.status(400).json({ error: 'Time format must be 12 or 24' });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (hourlyRate !== undefined) {
      updates.push(`hourly_rate = $${paramIndex++}`);
      values.push(hourlyRate);
    }
    if (taxRate !== undefined) {
      updates.push(`tax_rate = $${paramIndex++}`);
      values.push(taxRate);
    }
    if (paySchedule) {
      updates.push(`pay_schedule = $${paramIndex++}`);
      values.push(paySchedule);
    }
    if (overtimeEnabled !== undefined) {
      updates.push(`overtime_enabled = $${paramIndex++}`);
      values.push(overtimeEnabled);
    }
    // Always set overtime rate to 1.5 and overtime threshold to 40
    updates.push(`overtime_rate = $${paramIndex++}`);
    values.push(1.5);
    
    if (timeFormat) {
      updates.push(`time_format = $${paramIndex++}`);
      values.push(timeFormat);
    }
    if (timezone) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(timezone);
    }
    if (emailNotifications !== undefined) {
      updates.push(`email_notifications = $${paramIndex++}`);
      values.push(emailNotifications);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    const query = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, first_name, last_name, email, hourly_rate, tax_rate, pay_schedule,
                overtime_enabled, overtime_rate, time_format, timezone, email_notifications
    `;

    const result = await pool.query(query, values);
    const user = result.rows[0];

    res.json({
      message: 'User settings updated successfully',
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        hourlyRate: user.hourly_rate || 0,
        taxRate: user.tax_rate || 25,
        paySchedule: user.pay_schedule || 'bi-weekly',
        overtimeEnabled: user.overtime_enabled || false,
        overtimeRate: 1.5, // Fixed at 1.5
        overtimeThreshold: 40, // Fixed at 40 hours
        timeFormat: user.time_format || '12',
        timezone: user.timezone || 'America/New_York',
        emailNotifications: user.email_notifications !== false
      }
    });
  } catch (error) {
    logger.error('Update user settings error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

// Test email endpoint (super user only) placed after main export definition but before additional routes.
// Allows super users to validate Resend configuration without triggering user invites.
router.post('/email/test', authenticateToken, requireSuperUser, async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Recipient (to) required' });
    const status = mailerStatus();
    if (!status.enabled) {
      return res.status(503).json({ error: 'Mailer disabled', mailer: status });
    }
    const info = await sendMail({
      to,
      subject: 'OpenSky Time Clock Test Email',
      html: `<p>This is a test email confirming email configuration at ${new Date().toISOString()}.</p><p>If you expected HTML formatting, it is working.</p>`
    });
    res.json({ message: 'Test email attempted', result: info, mailer: mailerStatus() });
  } catch (e) {
    logger.error('Test email error', { error: e.message });
    res.status(500).json({ error: 'Failed to send test email', details: e.message, mailer: mailerStatus() });
  }
});

// Lightweight status endpoint (no send) for admins (super user) to inspect provider state
router.get('/email/status', authenticateToken, requireSuperUser, (req, res) => {
  try {
    const status = mailerStatus();
    res.json({ mailer: status });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get mailer status', details: e.message });
  }
});

// History endpoint (placed near export for now; could reorganize later):
router.get('/time-entry/:id/history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const audit = await pool.query(
      `SELECT id, action, previous_clock_in, previous_clock_out, new_clock_in, new_clock_out, previous_approval_status, new_approval_status, created_at, user_id
       FROM time_entry_audit WHERE time_entry_id = $1 ORDER BY created_at ASC, id ASC`,
      [id]
    );
    res.json({ history: audit.rows.map(r => ({
      id: r.id,
      action: r.action,
      previousClockIn: r.previous_clock_in,
      previousClockOut: r.previous_clock_out,
      newClockIn: r.new_clock_in,
      newClockOut: r.new_clock_out,
      previousApprovalStatus: r.previous_approval_status,
      newApprovalStatus: r.new_approval_status,
      createdAt: r.created_at,
      userId: r.user_id
    })) });
  } catch (e) {
    logger.error('Get history error', { error: e.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});