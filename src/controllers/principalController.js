// ── Principal Portal Controller ────────────────────────────────────────────────
const db = require('../config/database')
const jwt = require('jsonwebtoken')

const PRINCIPAL_PASSWORD = process.env.PRINCIPAL_PORTAL_PASSWORD || 'principal@vvce'

// POST /api/principal/verify
exports.verifyAccess = async (req, res) => {
  const { password } = req.body
  const userId = req.user.id

  if (password !== PRINCIPAL_PASSWORD)
    return res.status(403).json({ message: 'Access Denied. Incorrect portal password.' })

  const token = jwt.sign({ userId, principalAccess: true }, process.env.JWT_SECRET, { expiresIn: '8h' })
  res.json({ success: true, principalToken: token })
}

// GET /api/principal/availability  — public within authority
exports.getAvailability = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT pa.*, u.name as updated_by_name
       FROM principal_availability pa
       LEFT JOIN users u ON u.id = pa.updated_by
       ORDER BY pa.updated_at DESC LIMIT 1`
    )
    res.json({ data: rows[0] || { status: 'Not Available', note: '', updated_at: null } })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch availability' })
  }
}

// PATCH /api/principal/availability  — principal only
exports.updateAvailability = async (req, res) => {
  const { status, note } = req.body
  const userId = req.user.id
  const VALID = ['Available in Cabin','In Meeting','Outside Campus','Busy','Not Available']
  if (!VALID.includes(status)) return res.status(400).json({ message: 'Invalid status' })

  try {
    // Upsert singleton row
    const existing = await db.query('SELECT id FROM principal_availability LIMIT 1')
    if (existing.rows.length) {
      await db.query(
        'UPDATE principal_availability SET status=$1, note=$2, updated_by=$3, updated_at=NOW() WHERE id=$4',
        [status, note || null, userId, existing.rows[0].id]
      )
    } else {
      await db.query(
        'INSERT INTO principal_availability (status, note, updated_by) VALUES ($1,$2,$3)',
        [status, note || null, userId]
      )
    }
    res.json({ message: 'Availability updated', status })
  } catch (err) {
    res.status(500).json({ message: 'Failed to update availability' })
  }
}

// GET /api/principal/schedule
exports.getSchedule = async (req, res) => {
  const { from, to } = req.query
  try {
    let query = `SELECT * FROM principal_schedule`
    const params = []
    const conditions = []
    if (from) { params.push(from); conditions.push(`schedule_date >= $${params.length}`) }
    if (to)   { params.push(to);   conditions.push(`schedule_date <= $${params.length}`) }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
    query += ' ORDER BY schedule_date ASC, start_time ASC'
    const { rows } = await db.query(query, params)
    res.json({ data: rows })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch schedule' })
  }
}

// POST /api/principal/schedule
exports.addSchedule = async (req, res) => {
  const { schedule_date, start_time, end_time, purpose, location, notes } = req.body
  if (!schedule_date || !start_time || !end_time || !purpose)
    return res.status(400).json({ message: 'Date, start time, end time, and purpose are required' })
  try {
    const { rows } = await db.query(
      `INSERT INTO principal_schedule (schedule_date, start_time, end_time, purpose, location, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [schedule_date, start_time, end_time, purpose, location || null, notes || null, req.user.id]
    )
    res.status(201).json({ data: rows[0], message: 'Schedule added' })
  } catch (err) {
    res.status(500).json({ message: 'Failed to add schedule' })
  }
}

// PATCH /api/principal/schedule/:id
exports.updateSchedule = async (req, res) => {
  const { id } = req.params
  const { schedule_date, start_time, end_time, purpose, location, notes } = req.body
  try {
    const { rows } = await db.query(
      `UPDATE principal_schedule
       SET schedule_date=$1, start_time=$2, end_time=$3, purpose=$4, location=$5, notes=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [schedule_date, start_time, end_time, purpose, location || null, notes || null, id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Schedule not found' })
    res.json({ data: rows[0], message: 'Schedule updated' })
  } catch (err) {
    res.status(500).json({ message: 'Failed to update schedule' })
  }
}

// DELETE /api/principal/schedule/:id
exports.deleteSchedule = async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM principal_schedule WHERE id=$1', [req.params.id])
    if (!rowCount) return res.status(404).json({ message: 'Schedule not found' })
    res.json({ message: 'Schedule deleted' })
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete schedule' })
  }
}
