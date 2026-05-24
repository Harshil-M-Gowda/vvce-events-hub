const { query } = require('../config/database');

// GET /api/notifications  — user's notifications
const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(limit), offset]
    );
    const unread = await query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false', [req.user.id]
    );
    res.json({ success: true, data: result.rows, unread_count: parseInt(unread.rows[0].count) });
  } catch (err) { next(err); }
};

// PATCH /api/notifications/:id/read
const markAsRead = async (req, res, next) => {
  try {
    await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Marked as read' });
  } catch (err) { next(err); }
};

// PATCH /api/notifications/read-all
const markAllAsRead = async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) { next(err); }
};

// POST /api/notifications/send  — admin/authority can broadcast
const sendNotification = async (req, res, next) => {
  try {
    const { title, message, target_role, event_id } = req.body;

    let users;
    if (target_role) {
      users = await query('SELECT id FROM users WHERE role = $1 AND is_active = true', [target_role]);
    } else if (event_id) {
      users = await query(
        `SELECT DISTINCT r.student_id as id FROM registrations r
         WHERE r.event_id = $1 AND r.status = 'confirmed'`, [event_id]
      );
    } else {
      users = await query('SELECT id FROM users WHERE is_active = true');
    }

    const values = users.rows.map(u =>
      `(${u.id}, '${title.replace(/'/g, "''")}', '${message.replace(/'/g, "''")}', ${event_id ? event_id : 'NULL'})`
    ).join(',');

    if (values) {
      await query(
        `INSERT INTO notifications (user_id, title, message, event_id) VALUES ${values}`
      );
    }

    res.json({ success: true, message: `Notification sent to ${users.rows.length} users.` });
  } catch (err) { next(err); }
};

// DELETE /api/notifications/:id
const deleteNotification = async (req, res, next) => {
  try {
    await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) { next(err); }
};

// Helper — called internally by other controllers to create notifications
const createNotification = async (userId, title, message, eventId = null) => {
  try {
    await query(
      'INSERT INTO notifications (user_id, title, message, event_id) VALUES ($1, $2, $3, $4)',
      [userId, title, message, eventId]
    );
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead, sendNotification, deleteNotification, createNotification };
