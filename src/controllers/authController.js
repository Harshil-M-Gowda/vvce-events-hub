// ── Auth Controller V3 ─────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const db   = require('../config/database')
const { sendMail } = require('../config/email')

const VVCE_DOMAIN = '@vvce.ac.in'

const generateToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' })

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const {
      name, usn, email, password, role,
      year, semester, branch, section, department, phone, interests,
      designation,
      // Prior AICTE
      has_prior_points, prior_points,
    } = req.body

    if (!email.endsWith(VVCE_DOMAIN))
      return res.status(400).json({ success: false, message: 'Only VVCE institutional email IDs are allowed' })

    const existing = await db.query('SELECT id FROM users WHERE email=$1', [email])
    if (existing.rows.length)
      return res.status(409).json({ success: false, message: 'Email already registered' })

    const passwordHash = await bcrypt.hash(password, 12)
    const verifyToken  = uuidv4()
    const upperName    = name.toUpperCase()

    const client = await db.getClient()
    try {
      await client.query('BEGIN')

      const userResult = await client.query(
        `INSERT INTO users (name, email, password_hash, role, email_verify_token, is_verified)
         VALUES ($1,$2,$3,$4,$5,false) RETURNING id`,
        [upperName, email, passwordHash, role || 'student', verifyToken]
      )
      const userId = userResult.rows[0].id

      if (role === 'student' || !role) {
        await client.query(
          `INSERT INTO students (user_id, usn, year, semester, branch, section, department, phone, interests)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [userId, usn?.toUpperCase() || null, year || null, semester || null,
           branch || null, section || null, department || null, phone || null,
           JSON.stringify(interests || [])]
        )
        // AICTE points
        const priorPts = has_prior_points === true || has_prior_points === 'true'
          ? Math.max(parseInt(prior_points) || 0, 0) : 0

        await client.query(
          `INSERT INTO activity_points (student_id, total_points) VALUES ($1,$2)`,
          [userId, priorPts]
        )
        if (priorPts > 0) {
          await client.query(
            `INSERT INTO imported_aicte_points (student_id, points, note) VALUES ($1,$2,'Imported at registration')`,
            [userId, priorPts]
          )
          await client.query(
            `INSERT INTO activity_points_log (student_id, points, reason) VALUES ($1,$2,'Prior AICTE points imported')`,
            [userId, priorPts]
          )
        }
      } else if (role === 'authority') {
        await client.query(
          `INSERT INTO authorities (user_id, designation) VALUES ($1,$2)`,
          [userId, designation || 'Faculty']
        )
      }

      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`
    sendMail({
      to: email,
      subject: 'Verify your VVCE Events Hub account',
      html: `<p>Hello <strong>${upperName}</strong>,</p>
             <p>Please verify your email: <a href="${verifyUrl}">Click here</a></p>`,
    }).catch(() => {})

    res.status(201).json({ success: true, message: 'Registration successful. Check your email to verify your account.' })
  } catch (err) { next(err) }
}

// POST /api/auth/verify-email
const verifyEmailToken = async (req, res, next) => {
  try {
    // Accept token from body (POST) or query (GET fallback)
    const token = req.body?.token || req.query?.token
    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token is required.' })
    }
    const result = await db.query(
      `UPDATE users SET is_verified=true, email_verify_token=NULL
       WHERE email_verify_token=$1 RETURNING id, name, email, role`,
      [token]
    )
    if (!result.rows.length) {
      // Check if already verified (token already consumed)
      const alreadyVerified = await db.query(
        `SELECT id, email FROM users WHERE is_verified=true AND email_verify_token IS NULL
         LIMIT 1`
      )
      // Always return the same message to avoid token enumeration
      return res.status(400).json({
        success: false,
        message: 'This verification link is invalid or has already been used. If your account is already verified, try logging in.'
      })
    }
    res.json({ success: true, message: 'Email verified successfully! You can now log in.' })
  } catch (err) { next(err) }
}

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body

    const result = await db.query(
      `SELECT u.*, s.usn, s.year, s.semester, s.branch, s.section, s.department, s.phone,
              a.designation
       FROM users u
       LEFT JOIN students s ON s.user_id=u.id
       LEFT JOIN authorities a ON a.user_id=u.id
       WHERE u.email=$1`,
      [email]
    )
    if (!result.rows.length)
      return res.status(401).json({ success: false, message: 'Invalid email or password' })

    const user = result.rows[0]

    if (user.role === 'pending_club_admin')
      return res.status(403).json({ success: false, message: 'Your club account is awaiting approval from the Dean Student Welfare.' })

    if (!user.is_active)
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact admin.' })

    if (!user.is_verified)
      return res.status(403).json({ success: false, message: 'Please verify your email before logging in.' })

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid)
      return res.status(401).json({ success: false, message: 'Invalid email or password' })

    await db.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id])

    const token = generateToken(user.id, user.role)

    const userPayload = {
      id: user.id, name: user.name, email: user.email, role: user.role,
      usn: user.usn, year: user.year, semester: user.semester,
      branch: user.branch, section: user.section, department: user.department,
      phone: user.phone, designation: user.designation,
    }

    res.json({ success: true, token, user: userPayload })
  } catch (err) { next(err) }
}

// POST /api/auth/forgot-password
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body
    const result = await db.query('SELECT id, name FROM users WHERE email=$1', [email])
    // Always respond same (anti-enumeration)
    if (result.rows.length) {
      const token   = uuidv4()
      const expires = new Date(Date.now() + 60 * 60 * 1000) // 1h
      await db.query('UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3',
        [token, expires, result.rows[0].id])
      const url = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
      sendMail({
        to: email,
        subject: 'Reset your VVCE Events Hub password',
        html: `<p>Hello <strong>${result.rows[0].name}</strong>,</p>
               <p>Click to reset your password (expires in 1 hour): <a href="${url}">Reset Password</a></p>`,
      }).catch(() => {})
    }
    res.json({ success: true, message: 'If that email exists, you will receive a reset link.' })
  } catch (err) { next(err) }
}

// POST /api/auth/reset-password
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body
    const result = await db.query(
      'SELECT id FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()',
      [token]
    )
    if (!result.rows.length)
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' })
    const hash = await bcrypt.hash(password, 12)
    await db.query('UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2',
      [hash, result.rows[0].id])
    res.json({ success: true, message: 'Password reset successfully.' })
  } catch (err) { next(err) }
}

// GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_verified, u.last_login,
              s.usn, s.year, s.semester, s.branch, s.section, s.department, s.phone, s.interests,
              a.designation,
              COALESCE(ap.total_points, 0) as total_points
       FROM users u
       LEFT JOIN students s ON s.user_id=u.id
       LEFT JOIN authorities a ON a.user_id=u.id
       LEFT JOIN activity_points ap ON ap.student_id=u.id
       WHERE u.id=$1`,
      [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' })
    const user = rows[0]
    delete user.password_hash
    res.json({ success: true, data: user })
  } catch (err) { next(err) }
}

module.exports = { register, verifyEmailToken, login, forgotPassword, resetPassword, getMe }
