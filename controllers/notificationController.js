const { query } = require('../config/db');

const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [req.user.id, parseInt(limit), offset]
    );
    const unread = await query('SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=FALSE', [req.user.id]);
    res.json({ notifications: result.rows, unread_count: parseInt(unread.rows[0].count) });
  } catch (err) { next(err); }
};

const markAsRead = async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Marked as read.' });
  } catch (err) { next(err); }
};

const markAllAsRead = async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read=TRUE WHERE user_id=$1', [req.user.id]);
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) { next(err); }
};

module.exports = { getNotifications, markAsRead, markAllAsRead };
