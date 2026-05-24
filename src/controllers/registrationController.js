const { query, transaction } = require('../config/database');
const { sendMail } = require('../config/email');
const { registrationConfirm, teamInvite } = require('../utils/emailTemplates');
const { v4: uuidv4 } = require('uuid');

// POST /api/registrations
const registerForEvent = async (req, res, next) => {
  try {
    const { event_id, team_name, teammates } = req.body;
    const studentId = req.user.id;

    const event = await query(
      `SELECT e.*, COUNT(r.id) FILTER (WHERE r.status = 'confirmed') as reg_count
       FROM events e LEFT JOIN registrations r ON r.event_id = e.id
       WHERE e.id = $1 AND e.is_active = true AND e.approval_status = 'approved'
       GROUP BY e.id`,
      [event_id]
    );
    if (!event.rows.length) return res.status(404).json({ success: false, message: 'Event not found or not approved' });
    const ev = event.rows[0];

    if (parseInt(ev.reg_count) >= ev.max_participants) {
      return res.status(400).json({ success: false, message: 'Event is full' });
    }

    const alreadyReg = await query(
      `SELECT id FROM registrations WHERE event_id = $1 AND student_id = $2 AND status != 'cancelled'`, [event_id, studentId]
    );
    if (alreadyReg.rows.length) {
      return res.status(409).json({ success: false, message: 'You are already registered for this event' });
    }

    await transaction(async (client) => {
      // Register primary student
      await client.query(
        `INSERT INTO registrations (event_id, student_id, team_name, status, is_team_leader)
         VALUES ($1, $2, $3, 'confirmed', true)`,
        [event_id, studentId, team_name || null]
      );

      // Send confirmation to primary
      const userResult = await client.query('SELECT name, email FROM users WHERE id = $1', [studentId]);
      const user = userResult.rows[0];
      await sendMail({ to: user.email, subject: `Registration Confirmed: ${ev.name}`, html: registrationConfirm(user.name, ev) });

      // Handle teammates
      if (teammates && teammates.length > 0) {
        for (const email of teammates) {
          if (!email.endsWith('@vvce.ac.in')) continue;

          const tmResult = await client.query('SELECT id, name FROM users WHERE email = $1', [email]);
          if (!tmResult.rows.length) continue;
          const tm = tmResult.rows[0];

          const inviteToken = uuidv4();
          await client.query(
            `INSERT INTO registrations (event_id, student_id, team_name, status, is_team_leader, invite_token)
             VALUES ($1, $2, $3, 'pending', false, $4)
             ON CONFLICT (event_id, student_id) DO NOTHING`,
            [event_id, tm.id, team_name, inviteToken]
          );

          const approvalUrl = `${process.env.FRONTEND_URL}/team-invite?token=${inviteToken}`;
          await sendMail({
            to: email,
            subject: `Team Invitation: ${ev.name}`,
            html: teamInvite(tm.name, user.name, ev, approvalUrl),
          });
        }
      }

      // Update activity points for confirmed student
      await client.query(
        `INSERT INTO activity_points (student_id, total_points) VALUES ($1, 0)
         ON CONFLICT (student_id) DO UPDATE SET total_points = activity_points.total_points`,
        [studentId]
      );
    });

    res.status(201).json({ success: true, message: 'Registration confirmed! Confirmation email sent.' });
  } catch (err) { next(err); }
};

// POST /api/registrations/team-approve
const approveTeamInvite = async (req, res, next) => {
  try {
    const { token, action } = req.body; // action: 'accept' | 'decline'
    const result = await query('SELECT * FROM registrations WHERE invite_token = $1 AND status = $2', [token, 'pending']);
    if (!result.rows.length) return res.status(400).json({ success: false, message: 'Invalid or expired invitation' });

    const reg = result.rows[0];
    const newStatus = action === 'accept' ? 'confirmed' : 'cancelled';
    await query('UPDATE registrations SET status = $1, invite_token = NULL WHERE id = $2', [newStatus, reg.id]);

    if (action === 'accept') {
      const [user, event] = await Promise.all([
        query('SELECT name, email FROM users WHERE id = $1', [reg.student_id]),
        query('SELECT * FROM events WHERE id = $1', [reg.event_id]),
      ]);
      await sendMail({ to: user.rows[0].email, subject: `Confirmed: ${event.rows[0].name}`, html: registrationConfirm(user.rows[0].name, event.rows[0]) });
    }

    res.json({ success: true, message: action === 'accept' ? 'You have joined the team!' : 'Invitation declined.' });
  } catch (err) { next(err); }
};

// GET /api/registrations/my  — student's own registrations
const getMyRegistrations = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.*, e.name as event_name, e.event_date, e.event_time, e.venue, e.club_name, e.category, e.poster_url
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       WHERE r.student_id = $1 AND r.status != 'cancelled'
       ORDER BY e.event_date ASC`,
      [req.user.id]
    );
    const now = new Date();
    const upcoming = result.rows.filter(r => new Date(r.event_date) >= now);
    const completed = result.rows.filter(r => new Date(r.event_date) < now);
    res.json({ success: true, upcoming, completed });
  } catch (err) { next(err); }
};

// GET /api/registrations/event/:eventId  — admin/authority only
const getEventRegistrations = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.*, u.name, u.email, s.usn, s.branch, s.year, s.section,
              att.attended
       FROM registrations r
       JOIN users u ON u.id = r.student_id
       JOIN students s ON s.user_id = r.student_id
       LEFT JOIN attendance att ON att.registration_id = r.id
       WHERE r.event_id = $1
       ORDER BY r.team_name NULLS LAST, u.name`,
      [req.params.eventId]
    );
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (err) { next(err); }
};

// DELETE /api/registrations/:id  — cancel own registration
const cancelRegistration = async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM registrations WHERE id = $1 AND student_id = $2', [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Registration not found' });

    const event = await query('SELECT event_date FROM events WHERE id = $1', [result.rows[0].event_id]);
    if (new Date(event.rows[0].event_date) < new Date()) {
      return res.status(400).json({ success: false, message: 'Cannot cancel registration for a past event' });
    }

    await query('UPDATE registrations SET status = $1, updated_at = NOW() WHERE id = $2', ['cancelled', req.params.id]);
    res.json({ success: true, message: 'Registration cancelled' });
  } catch (err) { next(err); }
};

module.exports = { registerForEvent, approveTeamInvite, getMyRegistrations, getEventRegistrations, cancelRegistration };
