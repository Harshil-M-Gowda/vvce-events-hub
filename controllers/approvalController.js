const { query, withTransaction } = require('../config/db');
const { sendEmail, emailTemplates } = require('../utils/email');

// ── GET PENDING APPROVALS ─────────────────────────────────
const getPendingApprovals = async (req, res, next) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await query(
      `SELECT e.*, u.full_name AS organizer_name, u.email AS organizer_email,
              c.name AS club_name, COUNT(r.id) AS registration_count
       FROM events e
       JOIN users u ON e.organizer_id = u.id
       LEFT JOIN clubs c ON e.club_id = c.id
       LEFT JOIN registrations r ON e.id = r.event_id
       WHERE e.status = $1
       GROUP BY e.id, u.full_name, u.email, c.name
       ORDER BY e.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, parseInt(limit), offset]
    );
    const total = await query('SELECT COUNT(*) FROM events WHERE status = $1', [status]);
    res.json({ events: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) { next(err); }
};

// ── APPROVE EVENT ─────────────────────────────────────────
const approveEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const eventRes = await query(
      `UPDATE events SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
       WHERE id=$2 AND status='pending' RETURNING *, (SELECT full_name FROM users WHERE id=organizer_id) AS organizer_name,
       (SELECT email FROM users WHERE id=organizer_id) AS organizer_email`,
      [req.user.id, id]
    );
    if (!eventRes.rows.length) return res.status(404).json({ error: 'Event not found or already processed.' });
    const event = eventRes.rows[0];

    // Notify organizer
    await query(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1,'approval',$2,$3)",
      [event.organizer_id, 'Event Approved ✅', `Your event "${event.title}" has been approved!`]
    );

    // Send email
    const { subject, html } = emailTemplates.approvalResult(event.organizer_name, event.title, true, null);
    await sendEmail({ to: event.organizer_email, subject, html }).catch(console.error);

    res.json({ message: 'Event approved.', event });
  } catch (err) { next(err); }
};

// ── REJECT EVENT ──────────────────────────────────────────
const rejectEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Rejection reason is required.' });

    const eventRes = await query(
      `UPDATE events SET status='rejected', approved_by=$1, approved_at=NOW(),
       rejection_reason=$2, updated_at=NOW()
       WHERE id=$3 AND status='pending'
       RETURNING *, (SELECT full_name FROM users WHERE id=organizer_id) AS organizer_name,
       (SELECT email FROM users WHERE id=organizer_id) AS organizer_email`,
      [req.user.id, reason, id]
    );
    if (!eventRes.rows.length) return res.status(404).json({ error: 'Event not found or already processed.' });
    const event = eventRes.rows[0];

    await query(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1,'approval',$2,$3)",
      [event.organizer_id, 'Event Rejected', `Your event "${event.title}" was rejected. Reason: ${reason}`]
    );

    const { subject, html } = emailTemplates.approvalResult(event.organizer_name, event.title, false, reason);
    await sendEmail({ to: event.organizer_email, subject, html }).catch(console.error);

    res.json({ message: 'Event rejected.', event });
  } catch (err) { next(err); }
};

// ── REQUEST CHANGES ───────────────────────────────────────
const requestChanges = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const eventRes = await query('SELECT *, (SELECT email FROM users WHERE id=organizer_id) AS org_email FROM events WHERE id=$1', [req.params.id]);
    if (!eventRes.rows.length) return res.status(404).json({ error: 'Event not found.' });
    const event = eventRes.rows[0];

    await query(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1,'approval',$2,$3)",
      [event.organizer_id, 'Changes Requested', `Please update your event "${event.title}": ${reason}`]
    );

    res.json({ message: 'Change request sent to organizer.' });
  } catch (err) { next(err); }
};

// ── GET APPROVAL STATS ─────────────────────────────────────
const getApprovalStats = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT status, COUNT(*) AS count FROM events GROUP BY status`
    );
    const stats = {};
    result.rows.forEach(r => { stats[r.status] = parseInt(r.count); });
    res.json({ stats });
  } catch (err) { next(err); }
};

module.exports = { getPendingApprovals, approveEvent, rejectEvent, requestChanges, getApprovalStats };
