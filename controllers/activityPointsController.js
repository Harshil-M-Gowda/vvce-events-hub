const { query } = require('../config/db');

const getActivityPoints = async (req, res, next) => {
  try {
    const studentRes = await query('SELECT id, total_activity_points FROM students WHERE user_id=$1', [req.user.id]);
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found.' });
    const history = await query(
      `SELECT aph.*, e.title AS event_title
       FROM activity_points_history aph
       LEFT JOIN events e ON aph.event_id = e.id
       WHERE aph.student_id = $1 ORDER BY aph.awarded_at DESC`,
      [studentRes.rows[0].id]
    );
    res.json({ total_points: studentRes.rows[0].total_activity_points, history: history.rows });
  } catch (err) { next(err); }
};

const getLeaderboard = async (req, res, next) => {
  try {
    const { branch, limit = 20 } = req.query;
    const conditions = ['s.total_activity_points > 0'];
    const params = [];
    if (branch) { conditions.push(`s.branch = $${params.length+1}`); params.push(branch.toUpperCase()); }
    const result = await query(
      `SELECT u.full_name, s.usn, s.branch, s.current_year, s.total_activity_points,
              RANK() OVER (ORDER BY s.total_activity_points DESC) AS rank
       FROM students s JOIN users u ON s.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.total_activity_points DESC LIMIT $${params.length+1}`,
      [...params, parseInt(limit)]
    );
    res.json({ leaderboard: result.rows });
  } catch (err) { next(err); }
};

module.exports = { getActivityPoints, getLeaderboard };
