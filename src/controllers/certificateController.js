// ── Certificate Controller V2 ─────────────────────────────────────────────────
const db = require('../config/database')
const { sendMail } = require('../config/email')
const path = require('path')
const fs   = require('fs')

// ── Admin: upload platform certificate for a student ─────────────────────────
const uploadCertificate = async (req, res, next) => {
  try {
    const { event_id, student_id, aicte_points, title } = req.body
    if (!req.file) return res.status(400).json({ success: false, message: 'Certificate file is required' })

    const event = await db.query('SELECT * FROM events WHERE id=$1 AND created_by=$2', [event_id, req.user.id])
    if (!event.rows.length) return res.status(403).json({ success: false, message: 'Event not found or access denied' })

    const reg = await db.query(
      `SELECT r.id FROM registrations r WHERE r.event_id=$1 AND r.student_id=$2 AND r.status='confirmed'`,
      [event_id, student_id]
    )
    if (!reg.rows.length) return res.status(400).json({ success: false, message: 'Student has no confirmed registration' })

    const file_url  = `/uploads/${req.file.filename}`
    const points    = parseInt(aicte_points) || event.rows[0].aicte_points_value || 0
    const certTitle = title || event.rows[0].name

    await db.query('BEGIN')
    try {
      await db.query(
        `INSERT INTO certificates (event_id, student_id, file_url, aicte_points, uploaded_by, cert_type, title, is_verified)
         VALUES ($1,$2,$3,$4,$5,'platform',$6,true)`,
        [event_id, student_id, file_url, points, req.user.id, certTitle]
      )
      if (points > 0 && event.rows[0].gives_aicte_points) {
        await db.query(
          `INSERT INTO activity_points (student_id, total_points) VALUES ($1,$2)
           ON CONFLICT (student_id) DO UPDATE SET total_points=activity_points.total_points+$2, updated_at=NOW()`,
          [student_id, points]
        )
        await db.query(
          `INSERT INTO activity_points_log (student_id, event_id, points, reason) VALUES ($1,$2,$3,'Platform event participation')`,
          [student_id, event_id, points]
        )
      }
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }

    // Notify student non-blocking
    const student = await db.query('SELECT name, email FROM users WHERE id=$1', [student_id])
    if (student.rows.length) {
      sendMail({
        to: student.rows[0].email,
        subject: `Your certificate for ${event.rows[0].name} is ready!`,
        html: `<p>Hello <strong>${student.rows[0].name}</strong>,</p>
               <p>Your certificate for <strong>${event.rows[0].name}</strong> is now available on VVCE Events Hub.</p>
               ${points > 0 ? `<p>You've earned <strong>${points} AICTE Activity Points</strong>! 🎉</p>` : ''}`,
      }).catch(() => {})
    }

    res.status(201).json({ success: true, message: 'Certificate uploaded successfully.' })
  } catch (err) { next(err) }
}

// ── Admin: bulk upload for all confirmed registrations ────────────────────────
const bulkUploadCertificates = async (req, res, next) => {
  try {
    const { event_id, aicte_points } = req.body
    if (!req.file) return res.status(400).json({ success: false, message: 'Certificate file is required' })

    const event = await db.query('SELECT * FROM events WHERE id=$1 AND created_by=$2', [event_id, req.user.id])
    if (!event.rows.length) return res.status(403).json({ success: false, message: 'Event not found or access denied' })

    const students = await db.query(
      `SELECT r.student_id, u.name, u.email FROM registrations r
       JOIN users u ON u.id=r.student_id WHERE r.event_id=$1 AND r.status='confirmed'`,
      [event_id]
    )

    const file_url = `/uploads/${req.file.filename}`
    const points   = parseInt(aicte_points) || event.rows[0].aicte_points_value || 0
    let count = 0

    for (const s of students.rows) {
      try {
        await db.query(
          `INSERT INTO certificates (event_id, student_id, file_url, aicte_points, uploaded_by, cert_type, title, is_verified)
           VALUES ($1,$2,$3,$4,$5,'platform',$6,true)`,
          [event_id, s.student_id, file_url, points, req.user.id, event.rows[0].name]
        )
        if (points > 0 && event.rows[0].gives_aicte_points) {
          await db.query(
            `INSERT INTO activity_points (student_id, total_points) VALUES ($1,$2)
             ON CONFLICT (student_id) DO UPDATE SET total_points=activity_points.total_points+$2, updated_at=NOW()`,
            [s.student_id, points]
          )
          await db.query(
            `INSERT INTO activity_points_log (student_id, event_id, points, reason) VALUES ($1,$2,$3,'Platform event participation')`,
            [s.student_id, event_id, points]
          )
        }
        count++
      } catch {}
    }

    res.json({ success: true, message: `Certificates uploaded for ${count} student(s).` })
  } catch (err) { next(err) }
}

// ── Student: upload external/prior certificate ───────────────────────────────
const uploadExternalCertificate = async (req, res, next) => {
  try {
    const { title, notes, event_id } = req.body
    if (!req.file) return res.status(400).json({ success: false, message: 'Certificate file is required' })
    if (!title)    return res.status(400).json({ success: false, message: 'Title is required' })

    const file_url = `/uploads/${req.file.filename}`
    const { rows } = await db.query(
      `INSERT INTO certificates (event_id, student_id, file_url, aicte_points, uploaded_by, cert_type, title, notes, is_verified)
       VALUES ($1,$2,$3,0,$2,'external',$4,$5,false) RETURNING *`,
      [event_id || null, req.user.id, file_url, title, notes || null]
    )
    res.status(201).json({ success: true, data: rows[0], message: 'Certificate uploaded. It will be verified by admin.' })
  } catch (err) { next(err) }
}

// ── Student: get my certificates ─────────────────────────────────────────────
const getMyCertificates = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, e.name as event_name, e.event_date, e.club_name, e.category
       FROM certificates c
       LEFT JOIN events e ON e.id=c.event_id
       WHERE c.student_id=$1
       ORDER BY c.created_at DESC`,
      [req.user.id]
    )
    res.json({ success: true, data: rows })
  } catch (err) { next(err) }
}

// ── Student / Admin: get activity points breakdown ────────────────────────────
const getActivityPoints = async (req, res, next) => {
  try {
    const studentId = req.params.studentId || req.user.id

    const [summary, imported, log, semPts] = await Promise.all([
      db.query('SELECT total_points FROM activity_points WHERE student_id=$1', [studentId]),
      db.query('SELECT points, note FROM imported_aicte_points WHERE student_id=$1', [studentId]),
      db.query(
        `SELECT apl.*, e.name as event_name, e.event_date, e.gives_aicte_points
         FROM activity_points_log apl
         LEFT JOIN events e ON e.id=apl.event_id
         WHERE apl.student_id=$1 ORDER BY apl.created_at DESC`,
        [studentId]
      ),
      db.query(
        'SELECT semester, points FROM semester_activity_points WHERE student_id=$1 ORDER BY semester',
        [studentId]
      ),
    ])

    const importedPts = imported.rows[0]?.points || 0
    const earnedPts   = (summary.rows[0]?.total_points || 0) - importedPts

    res.json({
      success: true,
      total_points:    summary.rows[0]?.total_points || 0,
      imported_points: importedPts,
      earned_points:   Math.max(earnedPts, 0),
      semester_points: semPts.rows,
      history: log.rows,
    })
  } catch (err) { next(err) }
}

// ── Admin/Authority: get certs for an event ───────────────────────────────────
const getEventCertificates = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, u.name as student_name, s.usn, s.branch, s.year
       FROM certificates c
       JOIN users u ON u.id=c.student_id
       JOIN students s ON s.user_id=c.student_id
       WHERE c.event_id=$1 ORDER BY u.name`,
      [req.params.eventId]
    )
    res.json({ success: true, data: rows })
  } catch (err) { next(err) }
}

// ── Admin/Authority: get certs for a specific student ─────────────────────────
const getStudentCertificates = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, e.name as event_name, e.event_date, e.club_name, e.category,
              u.name as student_name, s.usn, s.branch
       FROM certificates c
       LEFT JOIN events e ON e.id=c.event_id
       JOIN users u ON u.id=c.student_id
       JOIN students s ON s.user_id=c.student_id
       WHERE c.student_id=$1 ORDER BY c.created_at DESC`,
      [req.params.studentId]
    )
    res.json({ success: true, data: rows })
  } catch (err) { next(err) }
}

// ── Admin: verify an external certificate ─────────────────────────────────────
const verifyCertificate = async (req, res, next) => {
  try {
    const { id } = req.params
    const { is_verified, aicte_points } = req.body
    const pts = parseInt(aicte_points) || 0

    const { rows } = await db.query(
      `UPDATE certificates SET is_verified=$1, aicte_points=$2, updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [!!is_verified, pts, id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Certificate not found' })

    // Award points if verifying
    if (is_verified && pts > 0) {
      await db.query(
        `INSERT INTO activity_points (student_id, total_points) VALUES ($1,$2)
         ON CONFLICT (student_id) DO UPDATE SET total_points=activity_points.total_points+$2, updated_at=NOW()`,
        [rows[0].student_id, pts]
      )
      await db.query(
        `INSERT INTO activity_points_log (student_id, event_id, points, reason) VALUES ($1,$2,$3,'External certificate verified')`,
        [rows[0].student_id, rows[0].event_id, pts]
      )
    }

    res.json({ success: true, message: 'Certificate updated', data: rows[0] })
  } catch (err) { next(err) }
}

// ── DELETE certificate ─────────────────────────────────────────────────────────
const deleteCertificate = async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM certificates WHERE id=$1 AND (student_id=$2 OR $3)',
      [req.params.id, req.user.id, req.user.role !== 'student']
    )
    if (!rowCount) return res.status(404).json({ message: 'Certificate not found or access denied' })
    res.json({ success: true, message: 'Certificate deleted' })
  } catch (err) { next(err) }
}

module.exports = {
  uploadCertificate, bulkUploadCertificates, uploadExternalCertificate,
  getMyCertificates, getActivityPoints, getEventCertificates,
  getStudentCertificates, verifyCertificate, deleteCertificate,
}
