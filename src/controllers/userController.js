const { query } = require('../config/database');
const bcrypt = require('bcryptjs');

// GET /api/users/profile
const getProfile = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at, u.last_login,
              s.usn, s.year, s.semester, s.branch, s.section, s.interests,
              a.designation,
              COALESCE(ap.total_points, 0) as activity_points
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN authorities a ON a.user_id = u.id
       LEFT JOIN activity_points ap ON ap.student_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// PATCH /api/users/profile
const updateProfile = async (req, res, next) => {
  try {
    const { name, year, semester, branch, section, interests } = req.body;
    if (name) {
      await query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name.toUpperCase(), req.user.id]);
    }
    if (req.user.role === 'student') {
      await query(
        `UPDATE students SET year = COALESCE($1, year), semester = COALESCE($2, semester),
         branch = COALESCE($3, branch), section = COALESCE($4, section),
         interests = COALESCE($5, interests)
         WHERE user_id = $6`,
        [year, semester, branch, section, interests ? JSON.stringify(interests) : null, req.user.id]
      );
    }
    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) { next(err); }
};

// PATCH /api/users/change-password
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) { next(err); }
};

// GET /api/users/dashboard/student
const getStudentDashboard = async (req, res, next) => {
  try {
    const id = req.user.id;
    const [regs, certs, points, upcoming, notifications] = await Promise.all([
      query(`SELECT COUNT(*) FROM registrations WHERE student_id = $1 AND status = 'confirmed'`, [id]),
      query(`SELECT COUNT(*) FROM certificates WHERE student_id = $1`, [id]),
      query(`SELECT COALESCE(total_points, 0) as total FROM activity_points WHERE student_id = $1`, [id]),
      query(
        `SELECT e.id, e.name, e.event_date, e.event_time, e.venue, e.club_name, e.category, e.poster_url
         FROM registrations r JOIN events e ON e.id = r.event_id
         WHERE r.student_id = $1 AND r.status = 'confirmed' AND e.event_date >= CURRENT_DATE
         ORDER BY e.event_date ASC LIMIT 5`, [id]
      ),
      query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`, [id]),
    ]);

    res.json({
      success: true,
      data: {
        total_registrations: parseInt(regs.rows[0].count),
        total_certificates: parseInt(certs.rows[0].count),
        activity_points: parseInt(points.rows[0]?.total || 0),
        unread_notifications: parseInt(notifications.rows[0].count),
        upcoming_events: upcoming.rows,
      },
    });
  } catch (err) { next(err); }
};

// GET /api/users/dashboard/admin
const getAdminDashboard = async (req, res, next) => {
  try {
    const id = req.user.id;
    const [events, totalRegs, revenue, monthly] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE approval_status='approved') as approved,
             COUNT(*) FILTER (WHERE approval_status='pending') as pending
             FROM events WHERE created_by = $1`, [id]),
      query(`SELECT COUNT(*) FROM registrations r JOIN events e ON e.id = r.event_id
             WHERE e.created_by = $1 AND r.status = 'confirmed'`, [id]),
      query(`SELECT COALESCE(SUM(p.amount),0) as total FROM payments p
             JOIN events e ON e.id = p.event_id
             WHERE e.created_by = $1 AND p.status = 'success'`, [id]),
      query(`SELECT TO_CHAR(r.created_at, 'Mon') as month,
             EXTRACT(MONTH FROM r.created_at) as month_num,
             COUNT(*) as count
             FROM registrations r JOIN events e ON e.id = r.event_id
             WHERE e.created_by = $1 AND r.status = 'confirmed'
             AND r.created_at >= NOW() - INTERVAL '6 months'
             GROUP BY month, month_num ORDER BY month_num`, [id]),
    ]);

    res.json({
      success: true,
      data: {
        events: events.rows[0],
        total_registrations: parseInt(totalRegs.rows[0].count),
        total_revenue: parseFloat(revenue.rows[0].total),
        monthly_registrations: monthly.rows,
      },
    });
  } catch (err) { next(err); }
};

// GET /api/users/dashboard/authority
const getAuthorityDashboard = async (req, res, next) => {
  try {
    const [pending, events, clubs, participants, schedule] = await Promise.all([
      query(`SELECT COUNT(*) FROM events WHERE approval_status = 'pending' AND is_active = true`),
      query(`SELECT COUNT(*) FROM events WHERE is_active = true AND EXTRACT(MONTH FROM event_date) = EXTRACT(MONTH FROM NOW())`),
      query(`SELECT COUNT(DISTINCT club_name) FROM events WHERE is_active = true`),
      query(`SELECT COUNT(*) FROM registrations WHERE status = 'confirmed'`),
      query(
        `SELECT e.name, e.event_time, e.venue, u.name as organizer, e.club_name
         FROM events e JOIN users u ON u.id = e.created_by
         WHERE e.event_date = CURRENT_DATE AND e.approval_status = 'approved' AND e.is_active = true
         ORDER BY e.event_time`
      ),
    ]);

    res.json({
      success: true,
      data: {
        pending_approvals: parseInt(pending.rows[0].count),
        events_this_month: parseInt(events.rows[0].count),
        active_clubs: parseInt(clubs.rows[0].count),
        total_participants: parseInt(participants.rows[0].count),
        todays_schedule: schedule.rows,
      },
    });
  } catch (err) { next(err); }
};

// GET /api/users/clubs  — authority: all clubs summary
const getClubsSummary = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.club_name,
              COUNT(DISTINCT e.id) as total_events,
              COUNT(DISTINCT r.student_id) as total_participants,
              COUNT(DISTINCT e.id) FILTER (WHERE e.event_date >= CURRENT_DATE) as upcoming_events,
              MAX(e.event_date) as last_event_date
       FROM events e
       LEFT JOIN registrations r ON r.event_id = e.id AND r.status = 'confirmed'
       WHERE e.is_active = true
       GROUP BY e.club_name
       ORDER BY total_events DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/users/all  — authority only: list all users
const getAllUsers = async (req, res, next) => {
  try {
    const { role, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const values = [parseInt(limit), offset];
    let where = '';
    if (role) { values.unshift(role); where = `WHERE u.role = $1`; }

    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.is_verified, u.is_active, u.created_at,
              s.usn, s.branch, s.year
       FROM users u LEFT JOIN students s ON s.user_id = u.id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

module.exports = { getProfile, updateProfile, changePassword, getStudentDashboard, getAdminDashboard, getAuthorityDashboard, getClubsSummary, getAllUsers };
