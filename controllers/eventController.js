const { query, withTransaction } = require('../config/db');

// ── GET ALL EVENTS (with filters) ─────────────────────────
const getEvents = async (req, res, next) => {
  try {
    const { category, status = 'approved', search, date, upcoming, page = 1, limit = 12 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['e.status = $1'];
    const params = [status];
    let idx = 2;

    if (category) { conditions.push(`e.category = $${idx++}`); params.push(category); }
    if (search)   { conditions.push(`(e.title ILIKE $${idx} OR e.description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (date)     { conditions.push(`e.event_date = $${idx++}`); params.push(date); }
    if (upcoming === 'true') { conditions.push(`e.event_date >= CURRENT_DATE`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countRes = await query(`SELECT COUNT(*) FROM events e ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const result = await query(
      `SELECT e.*, u.full_name AS organizer_name, c.name AS club_name,
              COUNT(DISTINCT r.id) AS registration_count,
              COUNT(DISTINCT el.user_id) AS like_count,
              (e.max_participants - COUNT(DISTINCT r.id)) AS seats_available
       FROM events e
       LEFT JOIN users u ON e.organizer_id = u.id
       LEFT JOIN clubs c ON e.club_id = c.id
       LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'confirmed'
       LEFT JOIN event_likes el ON e.id = el.event_id
       ${where}
       GROUP BY e.id, u.full_name, c.name
       ORDER BY e.event_date ASC, e.created_at DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, parseInt(limit), offset]
    );

    // If authenticated student, add liked/saved flags
    let events = result.rows;
    if (req.user?.role === 'student') {
      const studentRes = await query('SELECT id FROM students WHERE user_id = $1', [req.user.id]);
      if (studentRes.rows.length) {
        const studentId = studentRes.rows[0].id;
        const likedRes = await query('SELECT event_id FROM event_likes WHERE user_id = $1', [req.user.id]);
        const savedRes = await query('SELECT event_id FROM event_saves WHERE user_id = $1', [req.user.id]);
        const regRes   = await query('SELECT event_id FROM registrations WHERE student_id = $1', [studentId]);
        const liked = new Set(likedRes.rows.map(r => r.event_id));
        const saved = new Set(savedRes.rows.map(r => r.event_id));
        const registered = new Set(regRes.rows.map(r => r.event_id));
        events = events.map(ev => ({
          ...ev,
          is_liked: liked.has(ev.id),
          is_saved: saved.has(ev.id),
          is_registered: registered.has(ev.id),
        }));
      }
    }

    res.json({ events, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
};

// ── GET SINGLE EVENT ──────────────────────────────────────
const getEvent = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.*, u.full_name AS organizer_name, c.name AS club_name,
              COUNT(DISTINCT r.id) AS registration_count,
              (e.max_participants - COUNT(DISTINCT r.id)) AS seats_available
       FROM events e
       LEFT JOIN users u ON e.organizer_id = u.id
       LEFT JOIN clubs c ON e.club_id = c.id
       LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'confirmed'
       WHERE e.id = $1
       GROUP BY e.id, u.full_name, c.name`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Event not found.' });
    res.json({ event: result.rows[0] });
  } catch (err) { next(err); }
};

// ── CREATE EVENT ──────────────────────────────────────────
const createEvent = async (req, res, next) => {
  try {
    const { title, description, club_id, category, event_date, start_time, end_time, venue,
            max_participants, registration_fee, allow_teams, min_team_size, max_team_size, activity_points } = req.body;

    const poster_url = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await query(
      `INSERT INTO events
       (title, description, club_id, organizer_id, category, event_date, start_time, end_time,
        venue, max_participants, registration_fee, poster_url, allow_teams, min_team_size,
        max_team_size, activity_points, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending')
       RETURNING *`,
      [title, description, club_id || null, req.user.id, category, event_date, start_time,
       end_time || null, venue, parseInt(max_participants) || 100,
       parseFloat(registration_fee) || 0, poster_url,
       allow_teams === 'true', parseInt(min_team_size) || 1, parseInt(max_team_size) || 1,
       parseInt(activity_points) || 0]
    );

    // Notify authorities about new pending event
    const authorities = await query("SELECT id FROM users WHERE role = 'authority' AND is_active = TRUE");
    for (const auth of authorities.rows) {
      await query(
        `INSERT INTO notifications (user_id, type, title, message, link)
         VALUES ($1, 'approval', 'New Event Pending Approval', $2, $3)`,
        [auth.id, `"${title}" has been submitted for approval.`, `/approvals/${result.rows[0].id}`]
      );
    }

    res.status(201).json({ event: result.rows[0], message: 'Event submitted for approval.' });
  } catch (err) { next(err); }
};

// ── UPDATE EVENT ──────────────────────────────────────────
const updateEvent = async (req, res, next) => {
  try {
    const existing = await query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Event not found.' });
    const ev = existing.rows[0];
    if (ev.organizer_id !== req.user.id && req.user.role !== 'authority') {
      return res.status(403).json({ error: 'Not authorized to update this event.' });
    }
    const { title, description, event_date, start_time, end_time, venue, max_participants,
            registration_fee, category, allow_teams } = req.body;
    const poster_url = req.file ? `/uploads/${req.file.filename}` : ev.poster_url;

    const result = await query(
      `UPDATE events SET title=$1, description=$2, event_date=$3, start_time=$4, end_time=$5,
       venue=$6, max_participants=$7, registration_fee=$8, category=$9, allow_teams=$10,
       poster_url=$11, status='pending', updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [title||ev.title, description||ev.description, event_date||ev.event_date,
       start_time||ev.start_time, end_time||ev.end_time, venue||ev.venue,
       parseInt(max_participants)||ev.max_participants, parseFloat(registration_fee)||ev.registration_fee,
       category||ev.category, allow_teams!==undefined?allow_teams:ev.allow_teams,
       poster_url, req.params.id]
    );
    res.json({ event: result.rows[0] });
  } catch (err) { next(err); }
};

// ── DELETE EVENT ──────────────────────────────────────────
const deleteEvent = async (req, res, next) => {
  try {
    const result = await query('SELECT organizer_id FROM events WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Event not found.' });
    if (result.rows[0].organizer_id !== req.user.id && req.user.role !== 'authority') {
      return res.status(403).json({ error: 'Not authorized.' });
    }
    await query("UPDATE events SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ message: 'Event cancelled successfully.' });
  } catch (err) { next(err); }
};

// ── LIKE / UNLIKE EVENT ────────────────────────────────────
const toggleLike = async (req, res, next) => {
  try {
    const existing = await query('SELECT 1 FROM event_likes WHERE user_id=$1 AND event_id=$2', [req.user.id, req.params.id]);
    if (existing.rows.length) {
      await query('DELETE FROM event_likes WHERE user_id=$1 AND event_id=$2', [req.user.id, req.params.id]);
      await query('UPDATE events SET likes_count = GREATEST(likes_count-1,0) WHERE id=$1', [req.params.id]);
      return res.json({ liked: false });
    }
    await query('INSERT INTO event_likes (user_id, event_id) VALUES ($1,$2)', [req.user.id, req.params.id]);
    await query('UPDATE events SET likes_count = likes_count+1 WHERE id=$1', [req.params.id]);
    res.json({ liked: true });
  } catch (err) { next(err); }
};

// ── SAVE / UNSAVE EVENT ────────────────────────────────────
const toggleSave = async (req, res, next) => {
  try {
    const existing = await query('SELECT 1 FROM event_saves WHERE user_id=$1 AND event_id=$2', [req.user.id, req.params.id]);
    if (existing.rows.length) {
      await query('DELETE FROM event_saves WHERE user_id=$1 AND event_id=$2', [req.user.id, req.params.id]);
      return res.json({ saved: false });
    }
    await query('INSERT INTO event_saves (user_id, event_id) VALUES ($1,$2)', [req.user.id, req.params.id]);
    res.json({ saved: true });
  } catch (err) { next(err); }
};

// ── CLASH DETECTION ───────────────────────────────────────
const checkClash = async (req, res, next) => {
  try {
    const { date, venue } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required.' });
    const conditions = ["e.event_date = $1", "e.status IN ('approved','pending')"];
    const params = [date];
    if (venue) { conditions.push(`e.venue ILIKE $2`); params.push(`%${venue}%`); }
    const result = await query(
      `SELECT e.id, e.title, e.start_time, e.end_time, e.venue, c.name AS club_name
       FROM events e LEFT JOIN clubs c ON e.club_id = c.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.start_time`,
      params
    );
    res.json({ date, clashing_events: result.rows, has_clash: result.rows.length > 0 });
  } catch (err) { next(err); }
};

// ── ANALYTICS (admin) ──────────────────────────────────────
const getEventAnalytics = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const [regCount, teamCount, revenue, attendanceCount] = await Promise.all([
      query("SELECT COUNT(*) FROM registrations WHERE event_id=$1 AND status='confirmed'", [eventId]),
      query('SELECT COUNT(DISTINCT team_id) FROM registrations WHERE event_id=$1 AND team_id IS NOT NULL', [eventId]),
      query("SELECT COALESCE(SUM(p.amount),0) AS total FROM payments p JOIN registrations r ON p.registration_id=r.id WHERE r.event_id=$1 AND p.status='completed'", [eventId]),
      query("SELECT COUNT(*) FILTER(WHERE status='present') AS present, COUNT(*) AS total FROM attendance WHERE event_id=$1", [eventId]),
    ]);
    res.json({
      total_registrations: parseInt(regCount.rows[0].count),
      total_teams: parseInt(teamCount.rows[0].count),
      revenue_collected: parseFloat(revenue.rows[0].total),
      attendance: attendanceCount.rows[0],
    });
  } catch (err) { next(err); }
};

module.exports = { getEvents, getEvent, createEvent, updateEvent, deleteEvent, toggleLike, toggleSave, checkClash, getEventAnalytics };
