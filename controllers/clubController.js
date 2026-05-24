const { query } = require('../config/db');

const getClubs = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.*, u.full_name AS admin_name,
              COUNT(DISTINCT e.id) AS total_events,
              COUNT(DISTINCT r.id) AS total_participants
       FROM clubs c
       LEFT JOIN admins a ON c.admin_id = a.id
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN events e ON c.id = e.club_id AND e.status = 'approved'
       LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'confirmed'
       GROUP BY c.id, u.full_name
       ORDER BY c.name`
    );
    res.json({ clubs: result.rows });
  } catch (err) { next(err); }
};

const createClub = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const adminRes = await query('SELECT id FROM admins WHERE user_id=$1', [req.user.id]);
    if (!adminRes.rows.length) return res.status(403).json({ error: 'Admin profile not found.' });
    const result = await query(
      'INSERT INTO clubs (name, description, admin_id) VALUES ($1,$2,$3) RETURNING *',
      [name, description, adminRes.rows[0].id]
    );
    res.status(201).json({ club: result.rows[0] });
  } catch (err) { next(err); }
};

const getClubStats = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.id, c.name,
              COUNT(DISTINCT e.id) AS events_conducted,
              COUNT(DISTINCT r.id) AS total_participants,
              COALESCE(SUM(p.amount),0) AS total_revenue,
              c.is_active
       FROM clubs c
       LEFT JOIN events e ON c.id = e.club_id AND e.status IN ('approved','completed')
       LEFT JOIN registrations r ON e.id = r.event_id AND r.status='confirmed'
       LEFT JOIN payments p ON r.id = p.registration_id AND p.status='completed'
       GROUP BY c.id, c.name, c.is_active
       ORDER BY events_conducted DESC`
    );
    res.json({ clubs: result.rows });
  } catch (err) { next(err); }
};

module.exports = { getClubs, createClub, getClubStats };
