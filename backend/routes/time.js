const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { toIso } = require('../utils/time');
const { broadcastToUser, addStream, removeStream, broadcastToAdmins } = require('../realtime/pubsub');
const { logger } = require('../utils/logger');

const router = express.Router();

// Clock in endpoint
router.post('/clock-in', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Check if user already has an active entry (clocked in but not out)
    const activeEntry = await pool.query(
      'SELECT id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL',
      [userId]
    );

    if (activeEntry.rows.length > 0) {
      return res.status(400).json({ error: 'Already clocked in. Please clock out first.' });
    }

    // Create new time entry (automatically approved for regular clock-in)
    const result = await pool.query(
      'INSERT INTO time_entries (user_id, clock_in, is_manual, approval_status) VALUES ($1, CURRENT_TIMESTAMP, $2, $3) RETURNING id, clock_in',
      [userId, false, 'approved']
    );

    const timeEntry = result.rows[0];

    const payload = {
      message: 'Clocked in successfully',
      entry: {
        id: timeEntry.id,
        clockIn: toIso(timeEntry.clock_in),
        clockOut: null
      }
    };
    res.status(201).json(payload);
    // Broadcast event for real-time listeners
    broadcastToUser(userId, 'clock-in', { userId, clockIn: toIso(timeEntry.clock_in) });
  } catch (error) {
    logger.error('Clock in error', { error: error.message, stack: error.stack, userId: req.user.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clock out endpoint
router.post('/clock-out', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find active entry (clocked in but not out)
    const activeEntry = await pool.query(
      'SELECT id, clock_in FROM time_entries WHERE user_id = $1 AND clock_out IS NULL',
      [userId]
    );

    if (activeEntry.rows.length === 0) {
      return res.status(400).json({ error: 'No active clock-in found. Please clock in first.' });
    }

    const entryId = activeEntry.rows[0].id;

    // Update entry with clock out time
    const result = await pool.query(
      'UPDATE time_entries SET clock_out = CURRENT_TIMESTAMP WHERE id = $1 RETURNING clock_in, clock_out',
      [entryId]
    );

    const timeEntry = result.rows[0];

    const payload = {
      message: 'Clocked out successfully',
      entry: {
        id: entryId,
        clockIn: toIso(timeEntry.clock_in),
        clockOut: toIso(timeEntry.clock_out)
      }
    };
    res.json(payload);
  // Determine last clock out (this one) to send to listeners
  broadcastToUser(userId, 'clock-out', { userId, clockOut: toIso(timeEntry.clock_out), lastClockOut: toIso(timeEntry.clock_out), entryId });
  } catch (error) {
    logger.error('Clock out error', { error: error.message, stack: error.stack, userId: req.user.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all time entries for the authenticated user
router.get('/entries', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
  `SELECT id, clock_in, clock_out, is_manual, approval_status,
              CASE WHEN clock_out IS NOT NULL THEN EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600 ELSE NULL END AS hours_worked
         FROM time_entries
         WHERE user_id = $1
         ORDER BY clock_in DESC`,
      [userId]
    );
    const entries = result.rows.map(r => ({
      id: r.id,
      clockIn: toIso(r.clock_in),
      clockOut: r.clock_out ? toIso(r.clock_out) : null,
      hoursWorked: r.hours_worked ? parseFloat(r.hours_worked).toFixed(2) : null,
      isManual: r.is_manual,
      approvalStatus: r.approval_status
    }));
    res.json({ entries });
  } catch (error) {
    logger.error('Get entries error', { error: error.message, stack: error.stack, userId: req.user.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current status (whether user is clocked in or out)
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const activeEntry = await pool.query('SELECT id, clock_in FROM time_entries WHERE user_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1', [userId]);
    if (activeEntry.rows.length > 0) {
      const entry = activeEntry.rows[0];
      return res.json({ status: 'clocked-in', activeEntry: { id: entry.id, clockIn: toIso(entry.clock_in) }, lastClockOut: null });
    }
    // If not clocked in, fetch the most recent completed clock out
    const last = await pool.query('SELECT clock_out FROM time_entries WHERE user_id = $1 AND clock_out IS NOT NULL ORDER BY clock_out DESC LIMIT 1', [userId]);
    return res.json({ status: 'clocked-out', activeEntry: null, lastClockOut: last.rows.length ? toIso(last.rows[0].clock_out) : null });
  } catch (error) {
    logger.error('Get status error', { error: error.message, stack: error.stack, userId: req.user.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a time entry
router.delete('/entry/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const entryId = req.params.id;
    const entryCheck = await pool.query('SELECT id FROM time_entries WHERE id = $1 AND user_id = $2', [entryId, userId]);
    if (entryCheck.rows.length === 0) return res.status(404).json({ error: 'Time entry not found or access denied' });
    const activeCheck = await pool.query('SELECT id FROM time_entries WHERE id = $1 AND clock_out IS NULL', [entryId]);
    if (activeCheck.rows.length > 0) return res.status(400).json({ error: 'Cannot delete an active time entry. Please clock out first.' });
    await pool.query('DELETE FROM time_entries WHERE id = $1', [entryId]);
    return res.json({ message: 'Time entry deleted successfully' });
  } catch (error) {
    logger.error('Delete entry error', { error: error.message, stack: error.stack, userId: req.user.id, entryId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a manual time entry
// SSE stream for authenticated user (their own status)
router.get('/stream', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  // Set headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write('\n');

  addStream(userId, res);

  // Send initial status snapshot
  try {
    const activeEntry = await pool.query('SELECT id, clock_in FROM time_entries WHERE user_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1', [userId]);
    if (activeEntry.rows.length > 0) {
      const entry = activeEntry.rows[0];
      res.write('event: status\n');
      res.write(`data: ${JSON.stringify({ status: 'clocked-in', activeEntry: { id: entry.id, clockIn: toIso(entry.clock_in) }, lastClockOut: null })}\n\n`);
    } else {
      const last = await pool.query('SELECT clock_out FROM time_entries WHERE user_id = $1 AND clock_out IS NOT NULL ORDER BY clock_out DESC LIMIT 1', [userId]);
      res.write('event: status\n');
      res.write(`data: ${JSON.stringify({ status: 'clocked-out', activeEntry: null, lastClockOut: last.rows.length ? toIso(last.rows[0].clock_out) : null })}\n\n`);
    }
  } catch (_) {}

  req.on('close', () => {
    removeStream(userId, res);
  });
});
// Create a manual time entry
router.post('/entry', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { clockIn, clockOut } = req.body;
    logger.debug('create manual entry attempt', { requestId: req.requestId, userId, clockIn, clockOut });
    if (!clockIn) return res.status(400).json({ error: 'Clock in time is required' });
    if (!clockOut || !clockOut.trim()) return res.status(400).json({ error: 'Clock out time is required for manual entries' });
    const clockInDate = new Date(clockIn);
    const clockOutDate = new Date(clockOut);
    if (isNaN(clockInDate.getTime())) return res.status(400).json({ error: 'Invalid clock in time format' });
    if (isNaN(clockOutDate.getTime())) return res.status(400).json({ error: 'Invalid clock out time format' });
    if (clockOutDate <= clockInDate) return res.status(400).json({ error: 'Clock out time must be after clock in time', code: 'CLOCK_ORDER' });
    const overlapCheck = await pool.query(
      `SELECT id FROM time_entries 
       WHERE user_id = $1 
       AND (approval_status IS NULL OR approval_status = 'approved')
       AND (( $2 BETWEEN clock_in AND COALESCE(clock_out, NOW()))
         OR ( $3 BETWEEN clock_in AND COALESCE(clock_out, NOW()))
         OR (clock_in BETWEEN $2 AND $3)
         OR (COALESCE(clock_out, NOW()) BETWEEN $2 AND $3))`,
      [userId, clockInDate, clockOutDate]
    );
    if (overlapCheck.rows.length > 0) return res.status(400).json({ error: 'Time entry overlaps with existing entry', code: 'OVERLAP' });
    const result = await pool.query('INSERT INTO time_entries (user_id, clock_in, clock_out, is_manual, approval_status) VALUES ($1,$2,$3,$4,$5) RETURNING *', [userId, clockInDate, clockOutDate, true, 'pending']);
  const timeEntry = result.rows[0];
  logger.info('manual entry created', { requestId: req.requestId, userId, entryId: timeEntry.id });
    // Audit
    await pool.query(
      `INSERT INTO time_entry_audit (time_entry_id, user_id, action, new_clock_in, new_clock_out, new_approval_status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [timeEntry.id, userId, 'create', timeEntry.clock_in, timeEntry.clock_out, timeEntry.approval_status]
    );
    const hoursWorked = ((clockOutDate.getTime() - clockInDate.getTime()) / 3600000).toFixed(2);
    const payload = {
      message: 'Time entry created successfully',
      entry: {
        id: timeEntry.id,
        clockIn: toIso(timeEntry.clock_in),
        clockOut: toIso(timeEntry.clock_out),
        hoursWorked,
        isManual: true,
        approvalStatus: timeEntry.approval_status
      }
    };
    res.status(201).json(payload);
    broadcastToUser(userId, 'manual-entry-created', {
      userId,
      entry: payload.entry
    });
    // Notify admins of new pending entry
    broadcastToAdmins('pending-entry-created', { userId, entry: payload.entry });
  } catch (error) {
    logger.error('create manual entry failed', { requestId: req.requestId, error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Internal server error', code: 'CREATE_FAIL' });
  }
});

// Update a time entry
router.put('/entry/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const entryId = req.params.id;
  const { clockIn, clockOut } = req.body;
    logger.debug('update entry attempt', { requestId: req.requestId, userId, entryId, clockIn, clockOut });

    // Check if the entry belongs to the authenticated user & gather current state
    const entryCheck = await pool.query(
      'SELECT id, clock_in, clock_out, is_manual, approval_status FROM time_entries WHERE id = $1 AND user_id = $2',
      [entryId, userId]
    );

    if (entryCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found or access denied' });
    }

    // Validate required fields
    if (!clockIn) {
      return res.status(400).json({ error: 'Clock in time is required' });
    }


    // Validate date format and ensure clock out is after clock in if provided
    const clockInDate = new Date(clockIn);
    const clockOutDate = (clockOut && clockOut.trim()) ? new Date(clockOut) : null;

    if (isNaN(clockInDate.getTime())) {
  return res.status(400).json({ error: 'Invalid clock in time format', code: 'INVALID_CLOCK_IN' });
    }

    if (clockOut && clockOut.trim() && isNaN(clockOutDate.getTime())) {
  return res.status(400).json({ error: 'Invalid clock out time format', code: 'INVALID_CLOCK_OUT' });
    }

    if (clockOut && clockOut.trim() && clockOutDate <= clockInDate) {
  return res.status(400).json({ error: 'Clock out time must be after clock in time', code: 'CLOCK_ORDER' });
    }

    // Check for overlapping entries (excluding current entry)
    let overlapCheck;
    if (clockOutDate) {
      // When both clock in and clock out are provided
      overlapCheck = await pool.query(
        `SELECT id FROM time_entries 
         WHERE user_id = $1 AND id != $2
         AND (
           ($3 BETWEEN clock_in AND COALESCE(clock_out, NOW())) OR
           ($4 BETWEEN clock_in AND COALESCE(clock_out, NOW())) OR
           (clock_in BETWEEN $3 AND $4) OR
           (COALESCE(clock_out, NOW()) BETWEEN $3 AND $4)
         )`,
        [userId, entryId, clockInDate, clockOutDate]
      );
    } else {
      // When only clock in is provided (ongoing entry)
      overlapCheck = await pool.query(
        `SELECT id FROM time_entries 
         WHERE user_id = $1 AND id != $2
         AND (
           ($3 BETWEEN clock_in AND COALESCE(clock_out, NOW())) OR
           (clock_in <= $3 AND clock_out IS NULL)
         )`,
        [userId, entryId, clockInDate]
      );
    }

    if (overlapCheck.rows.length > 0) {
  return res.status(400).json({ error: 'Time entry overlaps with existing entry', code: 'OVERLAP' });
    }

    const existing = entryCheck.rows[0];

    // If editing an active (no clock_out) automatic entry, disallow (simplifies state handling)
    if (!existing.clock_out) {
      return res.status(400).json({ error: 'Cannot edit an active (in-progress) time entry. Clock out first.', code: 'ACTIVE_EDIT_FORBIDDEN' });
    }

    // Determine if times actually changed
    const existingClockIn = new Date(existing.clock_in);
    const existingClockOut = existing.clock_out ? new Date(existing.clock_out) : null;
    const timesChanged = existingClockIn.getTime() !== clockInDate.getTime() || (
      (existingClockOut && clockOutDate && existingClockOut.getTime() !== clockOutDate.getTime()) || (!!existingClockOut !== !!clockOutDate)
    );

    // Business rule:
    // Any edit to an automatic entry OR any edit that changes times resets to pending manual review.
    // Also, editing a previously approved or denied manual entry resets to pending.
    const shouldResetToPending = !existing.is_manual || (timesChanged && existing.approval_status !== 'pending') || (existing.is_manual && (existing.approval_status === 'approved' || existing.approval_status === 'denied'));

    const nextApprovalStatus = shouldResetToPending ? 'pending' : existing.approval_status || 'pending';
    const nextIsManual = shouldResetToPending ? true : existing.is_manual;

    // Short-circuit: if nothing changed AND already pending manual, just echo current state
    if (!timesChanged && existing.is_manual && existing.approval_status === 'pending') {
      return res.json({
        message: 'No changes applied (entry already pending review)',
        entry: {
          id: existing.id,
            clockIn: toIso(existing.clock_in),
            clockOut: existing.clock_out ? toIso(existing.clock_out) : null,
            hoursWorked: existing.clock_out ? ((new Date(existing.clock_out).getTime() - new Date(existing.clock_in).getTime()) / 3600000).toFixed(2) : null,
            isManual: true,
            approvalStatus: existing.approval_status
        }
      });
    }

    // Update the time entry (set is_manual if transitioning from automatic or resetting)
    const result = await pool.query(
      'UPDATE time_entries SET clock_in = $1, clock_out = $2, approval_status = $3, is_manual = $4 WHERE id = $5 RETURNING *',
      [clockInDate, clockOutDate, nextApprovalStatus, nextIsManual, entryId]
    );
    await pool.query(
      `INSERT INTO time_entry_audit (time_entry_id, user_id, action, previous_clock_in, previous_clock_out, new_clock_in, new_clock_out, previous_approval_status, new_approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [entryId, userId, 'update', existing.clock_in, existing.clock_out, clockInDate, clockOutDate, existing.approval_status, nextApprovalStatus]
    );

  const timeEntry = result.rows[0];
  logger.info('time entry updated', { requestId: req.requestId, userId, entryId: timeEntry.id, approvalStatus: timeEntry.approval_status });

    // Calculate hours worked if clocked out
    const hoursWorked = clockOutDate ? 
      ((clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60 * 60)).toFixed(2) : 
      null;

    res.json({
      message: shouldResetToPending ? 'Time entry updated and sent for admin review' : 'Time entry updated successfully',
      entry: {
        id: timeEntry.id,
        clockIn: toIso(timeEntry.clock_in),
        clockOut: timeEntry.clock_out ? toIso(timeEntry.clock_out) : null,
        hoursWorked,
        isManual: timeEntry.is_manual,
        approvalStatus: timeEntry.approval_status
      }
    });
    broadcastToUser(userId, 'manual-entry-updated', {
      userId,
      entry: {
        id: timeEntry.id,
        clockIn: toIso(timeEntry.clock_in),
        clockOut: timeEntry.clock_out ? toIso(timeEntry.clock_out) : null,
        hoursWorked,
        isManual: timeEntry.is_manual,
        approvalStatus: timeEntry.approval_status
      }
    });
    if (shouldResetToPending) {
      broadcastToAdmins('pending-entry-updated', {
        userId,
        entry: {
          id: timeEntry.id,
          clockIn: toIso(timeEntry.clock_in),
          clockOut: timeEntry.clock_out ? toIso(timeEntry.clock_out) : null,
          hoursWorked,
          isManual: timeEntry.is_manual,
          approvalStatus: timeEntry.approval_status
        }
      });
    }
  } catch (error) {
  logger.error('update entry failed - entering fallback', { requestId: req.requestId, userId: req.user?.userId, entryId: req.params.id, error: error.message, stack: error.stack });
    // Fallback: flag the entry for admin review instead of hard failing
    try {
      // Ensure the entry still exists and belongs to user before flagging
      const verify = await pool.query(
        'SELECT id, clock_in, clock_out FROM time_entries WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.userId]
      );
      if (verify.rows.length === 0) {
  return res.status(404).json({ error: 'Time entry not found or access denied', code: 'NOT_FOUND' });
      }

      // Mark for review (set to pending) and treat as manual adjustment
      const flagged = await pool.query(
        'UPDATE time_entries SET approval_status = $1, is_manual = COALESCE(is_manual, TRUE) WHERE id = $2 RETURNING id, clock_in, clock_out, approval_status',
        ['pending', req.params.id]
      );
      const flaggedEntry = flagged.rows[0];
      logger.warn('entry flagged for review after update failure', { requestId: req.requestId, userId: req.user.userId, entryId: flaggedEntry.id });
      await pool.query(
        `INSERT INTO time_entry_audit (time_entry_id, user_id, action, previous_clock_in, previous_clock_out, new_clock_in, new_clock_out, previous_approval_status, new_approval_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [flaggedEntry.id, req.user.userId, 'fallback-flag', verify.rows[0].clock_in, verify.rows[0].clock_out, flaggedEntry.clock_in, flaggedEntry.clock_out, verify.rows[0].approval_status || null, flaggedEntry.approval_status]
      );
      const hoursWorked = flaggedEntry.clock_out ? ((new Date(flaggedEntry.clock_out).getTime() - new Date(flaggedEntry.clock_in).getTime()) / 3600000).toFixed(2) : null;

      const responsePayload = {
        message: 'Update encountered an issue; entry flagged for admin review',
        reviewFlagged: true,
        entry: {
          id: flaggedEntry.id,
          clockIn: toIso(flaggedEntry.clock_in),
          clockOut: flaggedEntry.clock_out ? toIso(flaggedEntry.clock_out) : null,
          hoursWorked,
          isManual: true,
          approvalStatus: flaggedEntry.approval_status
        }
      };
      res.status(202).json(responsePayload);
      // Broadcast using existing updated event so clients refresh
      broadcastToUser(req.user.userId, 'manual-entry-updated', {
        userId: req.user.userId,
        entry: responsePayload.entry,
        reviewFlagged: true
      });
      broadcastToAdmins('pending-entry-flagged', { userId: req.user.userId, entry: responsePayload.entry });
    } catch (fallbackErr) {
      logger.error('fallback flag review failed', { requestId: req.requestId, userId: req.user?.userId, entryId: req.params.id, error: fallbackErr.message, stack: fallbackErr.stack });
      return res.status(500).json({ error: 'Internal server error', code: 'FALLBACK_FAIL' });
    }
  }
});

// Get current user's settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(
      `SELECT 
        id, first_name, last_name, email,
        hourly_rate, tax_rate, pay_schedule,
        overtime_enabled, overtime_rate,
        time_format, timezone,
        email_notifications, email_rejection_notifications,
        reminder_notifications, auto_clock_out_enabled,
        auto_clock_out_time, week_start_day
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
        emailNotifications: user.email_notifications !== false,
        emailRejectionNotifications: user.email_rejection_notifications !== false,
        reminderNotifications: user.reminder_notifications !== false,
        autoClockOutEnabled: user.auto_clock_out_enabled === true,
        autoClockOutTime: user.auto_clock_out_time || '18:00:00',
        weekStartDay: user.week_start_day || 'monday'
      }
    });
  } catch (error) {
    logger.error('Get user settings error', { error: error.message, stack: error.stack, userId: req.user.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update current user's settings (preferences only - no pay settings)
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      timeFormat,
      timezone,
      emailNotifications,
      emailRejectionNotifications,
      reminderNotifications,
      autoClockOutEnabled,
      autoClockOutTime,
      weekStartDay
    } = req.body;

    // Validate inputs
    if (timeFormat && !['12', '24'].includes(timeFormat)) {
      return res.status(400).json({ error: 'Time format must be 12 or 24' });
    }
    if (weekStartDay && !['monday', 'sunday'].includes(weekStartDay)) {
      return res.status(400).json({ error: 'Week start day must be monday or sunday' });
    }

    // Build dynamic update query - only allow preference updates
    const updates = [];
    const values = [];
    let paramIndex = 1;

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
    if (emailRejectionNotifications !== undefined) {
      updates.push(`email_rejection_notifications = $${paramIndex++}`);
      values.push(emailRejectionNotifications);
    }
    if (reminderNotifications !== undefined) {
      updates.push(`reminder_notifications = $${paramIndex++}`);
      values.push(reminderNotifications);
    }
    if (autoClockOutEnabled !== undefined) {
      updates.push(`auto_clock_out_enabled = $${paramIndex++}`);
      values.push(autoClockOutEnabled);
    }
    if (autoClockOutTime) {
      updates.push(`auto_clock_out_time = $${paramIndex++}`);
      values.push(autoClockOutTime);
    }
    if (weekStartDay) {
      updates.push(`week_start_day = $${paramIndex++}`);
      values.push(weekStartDay);
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
                overtime_enabled, overtime_rate, time_format, timezone, email_notifications,
                email_rejection_notifications, reminder_notifications, auto_clock_out_enabled,
                auto_clock_out_time, week_start_day
    `;

    const result = await pool.query(query, values);
    const user = result.rows[0];

    res.json({
      message: 'Preferences updated successfully',
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
        emailNotifications: user.email_notifications !== false,
        emailRejectionNotifications: user.email_rejection_notifications !== false,
        reminderNotifications: user.reminder_notifications !== false,
        autoClockOutEnabled: user.auto_clock_out_enabled === true,
        autoClockOutTime: user.auto_clock_out_time || '18:00:00',
        weekStartDay: user.week_start_day || 'monday'
      }
    });
  } catch (error) {
    logger.error('Update user settings error', { error: error.message, stack: error.stack, userId: req.user.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;