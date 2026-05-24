const { query, withTransaction } = require('../config/db');

// ── UPLOAD CERTIFICATE ─────────────────────────────────────
const uploadCertificate = async (req, res, next) => {
  try {
    const { event_id, student_id, activity_points } = req.body;
    const certificate_url = req.file ? `/uploads/${req.file.filename}` : null;
    if (!certificate_url) return res.status(400).json({ error: 'Certificate file is required.' });

    await withTransaction(async (client) => {
      // Upsert certificate
      await client.query(
        `INSERT INTO certificates (event_id, student_id, certificate_url, uploaded_by, activity_points)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (event_id, student_id) DO UPDATE
         SET certificate_url=$3, uploaded_by=$4, activity_points=$5, uploaded_at=NOW()`,
        [event_id, student_id, certificate_url, req.user.id, parseInt(activity_points) || 0]
      );

      // Update student's total activity points
      if (parseInt(activity_points) > 0) {
        await client.query(
          'UPDATE students SET total_activity_points = total_activity_points + $1 WHERE id = $2',
          [parseInt(activity_points), student_id]
        );
        await client.query(
          'INSERT INTO activity_points_history (student_id, event_id, points, description) VALUES ($1,$2,$3,$4)',
          [student_id, event_id, parseInt(activity_points), `Certificate issued for event`]
        );
      }

      // Notify student
      const stuRes = await client.query('SELECT user_id FROM students WHERE id = $1', [student_id]);
      if (stuRes.rows.length) {
        await client.query(
          "INSERT INTO notifications (user_id, type, title, message) VALUES ($1,'certificate',$2,$3)",
          [stuRes.rows[0].user_id, 'Certificate Available! 🏅', 'Your certificate is now available for download.']
        );
      }
    });

    res.status(201).json({ message: 'Certificate uploaded successfully.' });
  } catch (err) { next(err); }
};

// ── BULK UPLOAD CERTIFICATES ───────────────────────────────
const bulkUploadCertificates = async (req, res, next) => {
  try {
    const { event_id, activity_points } = req.body;
    const eventRes = await query("SELECT id FROM events WHERE id=$1", [event_id]);
    if (!eventRes.rows.length) return res.status(404).json({ error: 'Event not found.' });

    // Get all confirmed registrations for this event
    const regRes = await query(
      "SELECT student_id FROM registrations WHERE event_id=$1 AND status='confirmed'",
      [event_id]
    );

    const pts = parseInt(activity_points) || 0;
    let updated = 0;
    for (const row of regRes.rows) {
      await query(
        `INSERT INTO certificates (event_id, student_id, uploaded_by, activity_points)
         VALUES ($1,$2,$3,$4) ON CONFLICT (event_id, student_id) DO UPDATE SET activity_points=$4`,
        [event_id, row.student_id, req.user.id, pts]
      );
      if (pts > 0) {
        await query('UPDATE students SET total_activity_points = total_activity_points + $1 WHERE id = $2', [pts, row.student_id]);
      }
      updated++;
    }
    res.json({ message: `${updated} certificates issued.` });
  } catch (err) { next(err); }
};

// ── GET MY CERTIFICATES ────────────────────────────────────
const getMyCertificates = async (req, res, next) => {
  try {
    const studentRes = await query('SELECT id, total_activity_points FROM students WHERE user_id=$1', [req.user.id]);
    if (!studentRes.rows.length) return res.status(404).json({ error: 'Student not found.' });
    const result = await query(
      `SELECT cert.*, e.title AS event_title, e.event_date, c.name AS club_name
       FROM certificates cert
       JOIN events e ON cert.event_id = e.id
       LEFT JOIN clubs c ON e.club_id = c.id
       WHERE cert.student_id = $1
       ORDER BY cert.uploaded_at DESC`,
      [studentRes.rows[0].id]
    );
    const history = await query(
      'SELECT * FROM activity_points_history WHERE student_id=$1 ORDER BY awarded_at DESC LIMIT 10',
      [studentRes.rows[0].id]
    );
    res.json({
      certificates: result.rows,
      total_points: studentRes.rows[0].total_activity_points,
      points_history: history.rows,
    });
  } catch (err) { next(err); }
};

module.exports = { uploadCertificate, bulkUploadCertificates, getMyCertificates };
