// ── Dean Student Welfare Portal Controller ────────────────────────────────────
const db = require('../config/database')
const jwt = require('jsonwebtoken')

const DEAN_PASSWORD = process.env.DEAN_PORTAL_PASSWORD || 'deanwellfair@vvce'

// POST /api/dean/verify  — verify secondary password
exports.verifyAccess = async (req, res) => {
  const { password } = req.body
  const userId = req.user.id

  if (password !== DEAN_PASSWORD) {
    return res.status(403).json({ message: 'Access Denied. Incorrect portal password.' })
  }

  // Issue a short-lived dean session token
  const deanToken = jwt.sign(
    { userId, deanAccess: true },
    process.env.JWT_SECRET,
    { expiresIn: '4h' }
  )

  // Log access
  await db.query(
    'INSERT INTO dean_portal_logs (user_id, action, details) VALUES ($1, $2, $3)',
    [userId, 'dean_portal_access', JSON.stringify({ timestamp: new Date() })]
  ).catch(() => {})

  res.json({ success: true, deanToken })
}

// GET /api/dean/stats  — dashboard statistics
exports.getStats = async (req, res) => {
  try {
    const [clubs, pending, events, upcomingEvents] = await Promise.all([
      db.query('SELECT COUNT(*) FROM club_admins WHERE is_approved=true'),
      db.query("SELECT COUNT(*) FROM pending_club_approvals WHERE status='pending'"),
      db.query('SELECT COUNT(*) FROM events'),
      db.query("SELECT COUNT(*) FROM events WHERE event_date >= NOW() AND approval_status='approved'"),
    ])

    res.json({
      data: {
        total_clubs: parseInt(clubs.rows[0].count),
        active_clubs: parseInt(clubs.rows[0].count),
        pending_approvals: parseInt(pending.rows[0].count),
        upcoming_events: parseInt(upcomingEvents.rows[0].count),
        total_events: parseInt(events.rows[0].count),
      }
    })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch stats' })
  }
}

// GET /api/dean/events  — event monitoring
exports.getEvents = async (req, res) => {
  const { date, search } = req.query
  try {
    let query = `
      SELECT e.*, u.name as organizer_name,
             COUNT(r.id) as registration_count
      FROM events e
      JOIN users u ON u.id = e.created_by
      LEFT JOIN registrations r ON r.event_id = e.id
    `
    const params = []
    const conditions = []

    if (date) {
      params.push(date)
      conditions.push(`e.event_date = $${params.length}`)
    }
    if (search) {
      params.push(`%${search}%`)
      conditions.push(`e.name ILIKE $${params.length}`)
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
    query += ' GROUP BY e.id, u.name ORDER BY e.event_date ASC'

    const { rows } = await db.query(query, params)
    res.json({ data: rows })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch events' })
  }
}

// GET /api/dean/clash-check  — detect event clashes
exports.detectClashes = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT e1.id as event1_id, e1.name as event1_name, e1.venue as event1_venue,
             e1.event_date, e1.event_time,
             e2.id as event2_id, e2.name as event2_name, e2.venue as event2_venue
      FROM events e1
      JOIN events e2 ON e1.id < e2.id
        AND e1.event_date = e2.event_date
        AND (e1.venue = e2.venue OR e1.event_time = e2.event_time)
        AND e1.approval_status = 'approved'
        AND e2.approval_status = 'approved'
      WHERE e1.event_date >= NOW()
      ORDER BY e1.event_date ASC
    `)
    res.json({ data: rows, clash_count: rows.length })
  } catch (err) {
    res.status(500).json({ message: 'Failed to detect clashes' })
  }
}

// GET /api/dean/logs  — audit logs
exports.getLogs = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT dl.*, u.name as user_name, u.email
      FROM dean_portal_logs dl
      JOIN users u ON u.id = dl.user_id
      ORDER BY dl.created_at DESC
      LIMIT 100
    `)
    res.json({ data: rows })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch logs' })
  }
}
