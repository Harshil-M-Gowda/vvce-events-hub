const { query, transaction } = require('../config/database');

// POST /api/attendance/mark  — admin marks attendance for an event
const markAttendance = async (req, res, next) => {
  try {
    const { event_id, attendance_list } = req.body;
    // attendance_list: [{ registration_id, attended: true/false }, ...]

    const event = await query('SELECT id FROM events WHERE id = $1 AND created_by = $2', [event_id, req.user.id]);
    if (!event.rows.length) return res.status(403).json({ success: false, message: 'Event not found or access denied' });

    await transaction(async (client) => {
      for (const record of attendance_list) {
        await client.query(
          `INSERT INTO attendance (event_id, registration_id, attended, marked_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_id, registration_id)
           DO UPDATE SET attended = $3, updated_at = NOW(), marked_by = $4`,
          [event_id, record.registration_id, record.attended, req.user.id]
        );
      }
    });

    res.json({ success: true, message: `Attendance marked for ${attendance_list.length} participants.` });
  } catch (err) { next(err); }
};

// PATCH /api/attendance/:id  — toggle single attendance record
const toggleAttendance = async (req, res, next) => {
  try {
    const { attended } = req.body;
    const result = await query(
      `UPDATE attendance SET attended = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [attended, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Attendance record not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// GET /api/attendance/event/:eventId  — full attendance sheet for event
const getEventAttendance = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT att.*, r.team_name, r.is_team_leader,
              u.name as student_name, u.email,
              s.usn, s.branch, s.year, s.section
       FROM attendance att
       JOIN registrations r ON r.id = att.registration_id
       JOIN users u ON u.id = r.student_id
       JOIN students s ON s.user_id = r.student_id
       WHERE att.event_id = $1
       ORDER BY u.name`,
      [req.params.eventId]
    );

    const total = result.rows.length;
    const present = result.rows.filter(r => r.attended).length;

    res.json({
      success: true,
      data: result.rows,
      summary: { total, present, absent: total - present, percentage: total ? Math.round((present / total) * 100) : 0 },
    });
  } catch (err) { next(err); }
};

// GET /api/attendance/student/my  — student's own attendance across events
const getMyAttendance = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT att.attended, e.name as event_name, e.event_date, e.venue, e.category
       FROM attendance att
       JOIN registrations r ON r.id = att.registration_id
       JOIN events e ON e.id = att.event_id
       WHERE r.student_id = $1
       ORDER BY e.event_date DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/attendance/date/:date  — authority: all events on a given date with attendance summary
const getAttendanceByDate = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.id, e.name, e.venue, e.club_name, e.event_time,
              COUNT(att.id) as total_registered,
              COUNT(att.id) FILTER (WHERE att.attended = true) as present,
              COUNT(att.id) FILTER (WHERE att.attended = false) as absent
       FROM events e
       LEFT JOIN registrations r ON r.event_id = e.id AND r.status = 'confirmed'
       LEFT JOIN attendance att ON att.event_id = e.id AND att.registration_id = r.id
       WHERE e.event_date = $1 AND e.is_active = true
       GROUP BY e.id
       ORDER BY e.event_time`,
      [req.params.date]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

module.exports = { markAttendance, toggleAttendance, getEventAttendance, getMyAttendance, getAttendanceByDate };
