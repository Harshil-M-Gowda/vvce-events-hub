// ── Club Admin Registration & Approval Controller ────────────────────────────
const db = require('../config/database')
const bcrypt = require('bcryptjs')
const { sendMail } = require('../config/email')

// POST /api/clubs/register  — public, no auth needed
exports.registerClub = async (req, res) => {
  const {
    name, email, password,
    club_name, club_category, faculty_coordinator,
    club_email, phone, club_description
  } = req.body

  if (!email || !email.endsWith('@vvce.ac.in'))
    return res.status(400).json({ message: 'Only VVCE institutional email IDs are allowed' })
  if (!password || password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters' })

  const client = await db.getClient()
  try {
    await client.query('BEGIN')

    // Check duplicates
    const exists = await client.query('SELECT id FROM users WHERE email=$1', [email])
    if (exists.rows.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ message: 'Email already registered' })
    }
    const clubExists = await client.query('SELECT id FROM club_admins WHERE club_email=$1', [club_email])
    if (clubExists.rows.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ message: 'Club email already registered' })
    }

    const hash = await bcrypt.hash(password, 12)

    // Create user with pending role
    const userRes = await client.query(`
      INSERT INTO users (name, email, password_hash, role, is_verified, is_active)
      VALUES ($1, $2, $3, 'pending_club_admin', true, false)
      RETURNING id, name, email, role
    `, [name, email, hash])
    const user = userRes.rows[0]

    // Create club_admin record
    const clubRes = await client.query(`
      INSERT INTO club_admins
        (user_id, club_name, club_category, faculty_coordinator, club_email, phone, club_description)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
    `, [user.id, club_name, club_category, faculty_coordinator, club_email, phone, club_description])

    // Create pending approval entry
    await client.query(`
      INSERT INTO pending_club_approvals (club_admin_id, status)
      VALUES ($1, 'pending')
    `, [clubRes.rows[0].id])

    await client.query('COMMIT')

    // Notify dean (non-blocking)
    sendMail({
      to: process.env.DEAN_EMAIL || 'dean.welfare@vvce.ac.in',
      subject: `New Club Registration: ${club_name}`,
      html: `<p>A new club admin has registered and is awaiting approval.</p>
             <p><strong>Club:</strong> ${club_name}<br>
             <strong>Category:</strong> ${club_category}<br>
             <strong>Contact:</strong> ${name} (${email})</p>`
    }).catch(() => {})

    res.status(201).json({
      message: 'Club registration submitted. Awaiting approval from Dean Student Welfare.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Club register error:', err)
    res.status(500).json({ message: 'Registration failed', error: err.message })
  } finally {
    client.release()
  }
}

// GET /api/clubs/pending  — dean only
exports.getPending = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT ca.*, u.name, u.email, pca.id as approval_id, pca.status,
             pca.rejection_reason, pca.created_at as submitted_at
      FROM club_admins ca
      JOIN users u ON u.id = ca.user_id
      JOIN pending_club_approvals pca ON pca.club_admin_id = ca.id
      ORDER BY pca.created_at DESC
    `)
    res.json({ data: rows })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch pending clubs' })
  }
}

// GET /api/clubs/all  — authority
exports.getAllClubs = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT ca.*, u.name, u.email, u.is_active,
             pca.status as approval_status
      FROM club_admins ca
      JOIN users u ON u.id = ca.user_id
      LEFT JOIN pending_club_approvals pca ON pca.club_admin_id = ca.id
      ORDER BY ca.created_at DESC
    `)
    res.json({ data: rows })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch clubs' })
  }
}

// PATCH /api/clubs/:id/approve  — dean only
exports.approveClub = async (req, res) => {
  const { id } = req.params
  const reviewerId = req.user.id

  const client = await db.getClient()
  try {
    await client.query('BEGIN')

    const clubRes = await client.query('SELECT * FROM club_admins WHERE id=$1', [id])
    if (!clubRes.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Club not found' })
    }
    const club = clubRes.rows[0]

    await client.query(`
      UPDATE club_admins SET is_approved=true, approved_by=$1, approved_at=NOW() WHERE id=$2
    `, [reviewerId, id])

    await client.query(`
      UPDATE pending_club_approvals
      SET status='approved', reviewed_by=$1, reviewed_at=NOW()
      WHERE club_admin_id=$2
    `, [reviewerId, id])

    // Activate user as admin
    await client.query(`
      UPDATE users SET role='admin', is_active=true WHERE id=$1
    `, [club.user_id])

    // Log to dean portal
    await client.query(`
      INSERT INTO dean_portal_logs (user_id, action, details)
      VALUES ($1, 'club_approved', $2)
    `, [reviewerId, JSON.stringify({ club_id: id, club_name: club.club_name })])

    await client.query('COMMIT')

    // Notify club admin (non-blocking)
    const userRes = await db.query('SELECT email, name FROM users WHERE id=$1', [club.user_id])
    if (userRes.rows.length) {
      sendMail({
        to: userRes.rows[0].email,
        subject: 'Club Registration Approved — VVCE Events Hub',
        html: `<p>Dear ${userRes.rows[0].name},</p>
               <p>Your club <strong>${club.club_name}</strong> has been approved by the Dean Student Welfare.</p>
               <p>You can now login and start creating events.</p>`
      }).catch(() => {})
    }

    res.json({ message: 'Club approved successfully' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Approve club error:', err)
    res.status(500).json({ message: 'Approval failed' })
  } finally {
    client.release()
  }
}

// PATCH /api/clubs/:id/reject  — dean only
exports.rejectClub = async (req, res) => {
  const { id } = req.params
  const { rejection_reason } = req.body
  const reviewerId = req.user.id

  const client = await db.getClient()
  try {
    await client.query('BEGIN')

    const clubRes = await client.query('SELECT * FROM club_admins WHERE id=$1', [id])
    if (!clubRes.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Club not found' })
    }
    const club = clubRes.rows[0]

    await client.query(`
      UPDATE pending_club_approvals
      SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), rejection_reason=$2
      WHERE club_admin_id=$3
    `, [reviewerId, rejection_reason || 'Not eligible', id])

    // Deactivate user
    await client.query('UPDATE users SET is_active=false WHERE id=$1', [club.user_id])

    await client.query(`
      INSERT INTO dean_portal_logs (user_id, action, details)
      VALUES ($1, 'club_rejected', $2)
    `, [reviewerId, JSON.stringify({ club_id: id, club_name: club.club_name, reason: rejection_reason })])

    await client.query('COMMIT')
    res.json({ message: 'Club rejected' })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ message: 'Rejection failed' })
  } finally {
    client.release()
  }
}
