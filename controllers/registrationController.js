const { query, withTransaction } = require('../config/db');
const { sendEmail, emailTemplates } = require('../utils/email');
const { generateShortToken } = require('../utils/jwt');

// ── REGISTER FOR EVENT ────────────────────────────────────
const registerForEvent = async (req, res, next) => {
  try {
    const { event_id, team_name, teammates } = req.body;

    // Get student record
    const studentRes = await query('SELECT * FROM students WHERE user_id = $1', [req.user.id]);
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student profile not found.' });
    const student = studentRes.rows[0];

    // Get event
    const eventRes = await query(
      `SELECT e.*, (e.max_participants - COUNT(r.id)) AS seats_left
       FROM events e LEFT JOIN registrations r ON e.id = r.event_id AND r.status='confirmed'
       WHERE e.id = $1 AND e.status = 'approved' GROUP BY e.id`,
      [event_id]
    );
    if (!eventRes.rows.length) return res.status(404).json({ error: 'Event not found or not open for registration.' });
    const event = eventRes.rows[0];

    if (parseInt(event.seats_left) <= 0) return res.status(400).json({ error: 'Event is fully booked.' });
    if (new Date(event.event_date) < new Date()) return res.status(400).json({ error: 'Registration for this event has closed.' });

    // Check duplicate
    const dup = await query('SELECT id FROM registrations WHERE event_id=$1 AND student_id=$2', [event_id, student.id]);
    if (dup.rows.length) return res.status(409).json({ error: 'You have already registered for this event.' });

    await withTransaction(async (client) => {
      let teamId = null;

      // Handle team registration
      if (event.allow_teams && team_name && teammates?.length > 0) {
        const teamRes = await client.query(
          'INSERT INTO teams (name, event_id, leader_id) VALUES ($1,$2,$3) RETURNING id',
          [team_name, event_id, req.user.id]
        );
        teamId = teamRes.rows[0].id;

        // Add leader to team
        await client.query(
          'INSERT INTO team_members (team_id, student_id, approved) VALUES ($1,$2,TRUE)',
          [teamId, student.id]
        );

        // Invite teammates
        for (const email of teammates) {
          if (!email.endsWith('@vvce.ac.in')) continue;
          const tmUser = await client.query('SELECT u.id, u.full_name, s.id AS student_id FROM users u JOIN students s ON u.id=s.user_id WHERE u.email=$1', [email]);
          if (!tmUser.rows.length) continue;
          const tm = tmUser.rows[0];

          await client.query(
            'INSERT INTO team_members (team_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [teamId, tm.student_id]
          );

          // Send invite email
          const approveLink = `${process.env.FRONTEND_URL}/team-invite?team=${teamId}&student=${tm.student_id}`;
          const { subject, html } = emailTemplates.teamInvite(tm.full_name, req.user.full_name, team_name, event.title, approveLink);
          await sendEmail({ to: email, subject, html }).catch(console.error);
        }
      }

      // Create registration (pending if paid event)
      const regStatus = parseFloat(event.registration_fee) > 0 ? 'pending' : 'confirmed';
      const regRes = await client.query(
        'INSERT INTO registrations (event_id, student_id, team_id, status) VALUES ($1,$2,$3,$4) RETURNING *',
        [event_id, student.id, teamId, regStatus]
      );

      if (regStatus === 'confirmed') {
        // Send confirmation email
        const { subject, html } = emailTemplates.registrationConfirm(
          req.user.full_name, event.title,
          new Date(event.event_date).toLocaleDateString('en-IN'), event.venue
        );
        await sendEmail({ to: req.user.email, subject, html }).catch(console.error);

        // Create notification
        await client.query(
          "INSERT INTO notifications (user_id, type, title, message) VALUES ($1,'registration',$2,$3)",
          [req.user.id, 'Registration Confirmed!', `You are registered for ${event.title}`]
        );
      }

      return { registration: regRes.rows[0], requires_payment: regStatus === 'pending' };
    }).then((result) => {
      res.status(201).json({
        ...result,
        message: result.requires_payment
          ? 'Registration initiated. Please complete payment to confirm.'
          : 'Registration confirmed successfully!',
      });
    });
  } catch (err) { next(err); }
};

// ── GET MY REGISTRATIONS ───────────────────────────────────
const getMyRegistrations = async (req, res, next) => {
  try {
    const studentRes = await query('SELECT id FROM students WHERE user_id = $1', [req.user.id]);
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found.' });
    const result = await query(
      `SELECT r.*, e.title, e.event_date, e.start_time, e.venue, e.category,
              e.poster_url, e.status AS event_status, c.name AS club_name,
              t.name AS team_name, p.status AS payment_status
       FROM registrations r
       JOIN events e ON r.event_id = e.id
       LEFT JOIN clubs c ON e.club_id = c.id
       LEFT JOIN teams t ON r.team_id = t.id
       LEFT JOIN payments p ON r.id = p.registration_id
       WHERE r.student_id = $1
       ORDER BY e.event_date DESC`,
      [studentRes.rows[0].id]
    );
    const now = new Date();
    const upcoming  = result.rows.filter(r => new Date(r.event_date) >= now);
    const completed = result.rows.filter(r => new Date(r.event_date) < now);
    res.json({ upcoming, completed, total: result.rows.length });
  } catch (err) { next(err); }
};

// ── GET EVENT REGISTRATIONS (admin) ───────────────────────
const getEventRegistrations = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.*, u.full_name, u.email, s.usn, s.branch, s.current_year,
              t.name AS team_name, p.status AS payment_status, p.amount
       FROM registrations r
       JOIN students s ON r.student_id = s.id
       JOIN users u ON s.user_id = u.id
       LEFT JOIN teams t ON r.team_id = t.id
       LEFT JOIN payments p ON r.id = p.registration_id
       WHERE r.event_id = $1
       ORDER BY r.registered_at`,
      [req.params.eventId]
    );
    res.json({ participants: result.rows, total: result.rows.length });
  } catch (err) { next(err); }
};

// ── CANCEL REGISTRATION ────────────────────────────────────
const cancelRegistration = async (req, res, next) => {
  try {
    const studentRes = await query('SELECT id FROM students WHERE user_id = $1', [req.user.id]);
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found.' });
    const result = await query(
      "UPDATE registrations SET status='cancelled' WHERE id=$1 AND student_id=$2 RETURNING *",
      [req.params.id, studentRes.rows[0].id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Registration not found.' });
    res.json({ message: 'Registration cancelled.' });
  } catch (err) { next(err); }
};

// ── APPROVE TEAM INVITE ────────────────────────────────────
const approveTeamInvite = async (req, res, next) => {
  try {
    const { team_id } = req.params;
    const studentRes = await query('SELECT id FROM students WHERE user_id = $1', [req.user.id]);
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found.' });
    await query(
      'UPDATE team_members SET approved=TRUE, approved_at=NOW() WHERE team_id=$1 AND student_id=$2',
      [team_id, studentRes.rows[0].id]
    );
    res.json({ message: 'Team invitation accepted.' });
  } catch (err) { next(err); }
};

module.exports = { registerForEvent, getMyRegistrations, getEventRegistrations, cancelRegistration, approveTeamInvite };
