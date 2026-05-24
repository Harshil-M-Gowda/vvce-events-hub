const { query } = require('../config/db');

// ── MARK ATTENDANCE ────────────────────────────────────────
const markAttendance = async (req, res, next) => {
  try {
    const { event_id, student_id, status, notes } = req.body;
    await query(
      `INSERT INTO attendance (event_id, student_id, status, marked_by, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (event_id, student_id) DO UPDATE
       SET status=$3, marked_by=$4, notes=$5, marked_at=NOW()`,
      [event_id, student_id, status || 'present', req.user.id, notes || null]
    );
    res.json({ message: 'Attendance marked.' });
  } catch (err) { next(err); }
};

// ── BULK MARK ATTENDANCE ───────────────────────────────────
const bulkMarkAttendance = async (req, res, next) => {
  try {
    const { event_id, attendees } = req.body;
    for (const { student_id, status } of attendees) {
      await query(
        `INSERT INTO attendance (event_id, student_id, status, marked_by)
         VALUES ($1,$2,$3,$4) ON CONFLICT (event_id, student_id) DO UPDATE SET status=$3, marked_by=$4, marked_at=NOW()`,
        [event_id, student_id, status, req.user.id]
      );
    }
    res.json({ message: `Attendance marked for ${attendees.length} participants.` });
  } catch (err) { next(err); }
};

// ── GET EVENT ATTENDANCE ───────────────────────────────────
const getEventAttendance = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT a.*, u.full_name, u.email, s.usn, s.branch, s.current_year
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       JOIN users u ON s.user_id = u.id
       WHERE a.event_id = $1
       ORDER BY u.full_name`,
      [req.params.eventId]
    );
    const stats = await query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status='present') AS present,
         COUNT(*) FILTER (WHERE status='absent') AS absent,
         COUNT(*) FILTER (WHERE status='late') AS late
       FROM attendance WHERE event_id = $1`,
      [req.params.eventId]
    );
    res.json({ attendance: result.rows, stats: stats.rows[0] });
  } catch (err) { next(err); }
};

// ── GET DATE-BASED EVENTS (Authority) ─────────────────────
const getEventsByDate = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required.' });
    const result = await query(
      `SELECT e.*, u.full_name AS organizer_name, c.name AS club_name,
              COUNT(r.id) AS participant_count
       FROM events e
       LEFT JOIN users u ON e.organizer_id = u.id
       LEFT JOIN clubs c ON e.club_id = c.id
       LEFT JOIN registrations r ON e.id = r.event_id AND r.status='confirmed'
       WHERE e.event_date = $1
       GROUP BY e.id, u.full_name, c.name
       ORDER BY e.start_time`,
      [date]
    );
    res.json({ date, events: result.rows });
  } catch (err) { next(err); }
};

module.exports = { markAttendance, bulkMarkAttendance, getEventAttendance, getEventsByDate };
