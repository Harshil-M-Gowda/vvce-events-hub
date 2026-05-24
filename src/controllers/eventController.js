// ── Event Controller V3 ────────────────────────────────────────────────────────
const db = require('../config/database')
const { sendMail } = require('../config/email')

// GET /api/events
const getEvents = async (req, res, next) => {
  try {
    const { category, search, date, status = 'approved', page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit
    const values = []
    const where  = ['e.is_active=true', `e.approval_status=$${values.push(status)}`]

    if (category) where.push(`e.category=$${values.push(category)}`)
    if (search)   where.push(`(e.name ILIKE $${values.push('%'+search+'%')} OR e.club_name ILIKE $${values.length})`)
    if (date)     where.push(`e.event_date=$${values.push(date)}`)

    const whereClause = 'WHERE ' + where.join(' AND ')
    const countRes    = await db.query(`SELECT COUNT(*) FROM events e ${whereClause}`, values)
    const total       = parseInt(countRes.rows[0].count)

    values.push(parseInt(limit)); values.push(offset)
    const { rows } = await db.query(
      `SELECT e.*, u.name as creator_name,
              COUNT(r.id) FILTER (WHERE r.status='confirmed') as registered_count
       FROM events e
       JOIN users u ON u.id=e.created_by
       LEFT JOIN registrations r ON r.event_id=e.id
       ${whereClause}
       GROUP BY e.id, u.name
       ORDER BY e.event_date ASC
       LIMIT $${values.length-1} OFFSET $${values.length}`,
      values
    )
    res.json({ success: true, data: rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total/limit) } })
  } catch (err) { next(err) }
}

// GET /api/events/:id
const getEventById = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT e.*, u.name as creator_name,
              COUNT(r.id) FILTER (WHERE r.status='confirmed') as registered_count
       FROM events e JOIN users u ON u.id=e.created_by
       LEFT JOIN registrations r ON r.event_id=e.id
       WHERE e.id=$1 GROUP BY e.id, u.name`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Event not found' })
    res.json({ success: true, data: rows[0] })
  } catch (err) { next(err) }
}

// POST /api/events
const createEvent = async (req, res, next) => {
  try {
    const {
      name, club_name, description, event_date, event_time, venue,
      max_participants, category,
      gives_aicte_points, aicte_points_value,
      requires_payment_proof,
    } = req.body
    const poster_url = req.file ? `/uploads/${req.file.filename}` : null

    // Clash check
    const clash = await db.query(
      `SELECT name, event_time, venue FROM events
       WHERE event_date=$1 AND venue=$2 AND approval_status!='rejected'`,
      [event_date, venue]
    )

    const givesPoints = gives_aicte_points === true || gives_aicte_points === 'true'
    const pointsValue = givesPoints ? (parseInt(aicte_points_value) || 0) : 0
    const reqProof    = requires_payment_proof === true || requires_payment_proof === 'true'

    const { rows } = await db.query(
      `INSERT INTO events
         (name, club_name, description, event_date, event_time, venue, max_participants,
          registration_fee, category, poster_url, created_by, approval_status,
          gives_aicte_points, aicte_points_value, requires_payment_proof)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,'pending',$11,$12,$13) RETURNING *`,
      [name, club_name, description, event_date, event_time, venue,
       max_participants, category, poster_url, req.user.id,
       givesPoints, pointsValue, reqProof]
    )

    // Notify authorities (non-blocking)
    const authorities = await db.query(
      `SELECT u.email, u.name FROM users u WHERE u.role='authority' AND u.is_active=true`
    )
    for (const auth of authorities.rows) {
      sendMail({
        to: auth.email,
        subject: `New Event Approval Request: ${name}`,
        html: `<p>Hello ${auth.name},</p>
               <p>New event <strong>${name}</strong> by ${club_name} on ${event_date} at ${venue} needs your approval.</p>`,
      }).catch(() => {})
    }

    res.status(201).json({
      success: true,
      data: rows[0],
      clash_warning: clash.rows.length ? clash.rows : null,
      message: 'Event created and sent for approval.',
    })
  } catch (err) { next(err) }
}

// PATCH /api/events/:id
const updateEvent = async (req, res, next) => {
  try {
    const {
      name, description, event_date, event_time, venue,
      max_participants, category, gives_aicte_points, aicte_points_value, requires_payment_proof
    } = req.body
    const poster_url = req.file ? `/uploads/${req.file.filename}` : undefined

    const existing = await db.query('SELECT * FROM events WHERE id=$1', [req.params.id])
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Event not found' })

    const ev = existing.rows[0]
    const givesPoints = gives_aicte_points !== undefined
      ? (gives_aicte_points === true || gives_aicte_points === 'true')
      : ev.gives_aicte_points
    const pointsValue = givesPoints ? (parseInt(aicte_points_value) || ev.aicte_points_value || 0) : 0

    const { rows } = await db.query(
      `UPDATE events SET
         name=$1, description=$2, event_date=$3, event_time=$4, venue=$5,
         max_participants=$6, category=$7, gives_aicte_points=$8, aicte_points_value=$9,
         requires_payment_proof=$10,
         poster_url=COALESCE($11, poster_url), updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [name || ev.name, description || ev.description, event_date || ev.event_date,
       event_time || ev.event_time, venue || ev.venue, max_participants || ev.max_participants,
       category || ev.category, givesPoints, pointsValue,
       requires_payment_proof !== undefined ? (requires_payment_proof === true || requires_payment_proof === 'true') : ev.requires_payment_proof,
       poster_url, req.params.id]
    )
    res.json({ success: true, data: rows[0] })
  } catch (err) { next(err) }
}

// PATCH /api/events/:id/approve
const approveEvent = async (req, res, next) => {
  try {
    const { status, remarks } = req.body
    const { rows } = await db.query(
      `UPDATE events SET approval_status=$1, approval_remarks=$2, approved_by=$3, approved_at=NOW(), updated_at=NOW()
       WHERE id=$4 RETURNING *, (SELECT email FROM users WHERE id=created_by) as creator_email,
             (SELECT name FROM users WHERE id=created_by) as creator_name`,
      [status, remarks || null, req.user.id, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'Event not found' })

    sendMail({
      to: rows[0].creator_email,
      subject: `Event ${status === 'approved' ? 'Approved ✅' : 'Status Updated'}: ${rows[0].name}`,
      html: `<p>Hello ${rows[0].creator_name},</p>
             <p>Your event <strong>${rows[0].name}</strong> has been <strong>${status}</strong>.
             ${remarks ? `<br>Remarks: ${remarks}` : ''}</p>`,
    }).catch(() => {})

    res.json({ success: true, data: rows[0] })
  } catch (err) { next(err) }
}

// DELETE /api/events/:id
const deleteEvent = async (req, res, next) => {
  try {
    const { rowCount } = await db.query('UPDATE events SET is_active=false WHERE id=$1', [req.params.id])
    if (!rowCount) return res.status(404).json({ success: false, message: 'Event not found' })
    res.json({ success: true, message: 'Event deleted' })
  } catch (err) { next(err) }
}

// GET /api/events/clash-check
const clashCheck = async (req, res, next) => {
  try {
    const { date, venue } = req.query
    const { rows } = await db.query(
      `SELECT name, event_time, venue, event_date FROM events
       WHERE event_date=$1 AND venue ILIKE $2 AND approval_status!='rejected' AND is_active=true`,
      [date, `%${venue}%`]
    )
    res.json({ success: true, data: rows, has_clash: rows.length > 0 })
  } catch (err) { next(err) }
}

// GET /api/events/:id/analytics
const getEventAnalytics = async (req, res, next) => {
  try {
    const [event, regs, attendance] = await Promise.all([
      db.query('SELECT * FROM events WHERE id=$1', [req.params.id]),
      db.query(`SELECT COUNT(*) FILTER (WHERE status='confirmed') as confirmed,
                       COUNT(*) FILTER (WHERE status='cancelled') as cancelled
                FROM registrations WHERE event_id=$1`, [req.params.id]),
      db.query(`SELECT COUNT(*) FILTER (WHERE attended=true) as attended,
                       COUNT(*) as total
                FROM attendance WHERE event_id=$1`, [req.params.id]),
    ])
    if (!event.rows.length) return res.status(404).json({ success: false, message: 'Event not found' })
    res.json({ success: true, data: { event: event.rows[0], registrations: regs.rows[0], attendance: attendance.rows[0] } })
  } catch (err) { next(err) }
}

module.exports = { getEvents, getEventById, createEvent, updateEvent, approveEvent, deleteEvent, clashCheck, getEventAnalytics }
