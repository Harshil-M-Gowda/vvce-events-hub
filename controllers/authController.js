const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/db');
const { generateToken, generateShortToken, verifyToken } = require('../utils/jwt');
const { sendEmail, emailTemplates } = require('../utils/email');

// ── VALIDATE VVCE EMAIL ────────────────────────────────────
const validateVVCEEmail = (email) => {
  if (!email || !email.endsWith('@vvce.ac.in')) {
    throw { status: 400, message: 'Only VVCE institutional email IDs are allowed' };
  }
};

// ── REGISTER STUDENT ──────────────────────────────────────
const registerStudent = async (req, res, next) => {
  try {
    const { full_name, usn, email, password, current_year, semester, branch, section, interests } = req.body;

    validateVVCEEmail(email);

    // Check duplicates
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length) return res.status(409).json({ error: 'Email already registered.' });

    const existingUSN = await query('SELECT id FROM students WHERE usn = $1', [usn]);
    if (existingUSN.rows.length) return res.status(409).json({ error: 'USN already registered.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = uuidv4();

    await withTransaction(async (client) => {
      // Create user
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, verify_token)
         VALUES ($1, $2, 'student', $3, $4) RETURNING id`,
        [email, passwordHash, full_name.toUpperCase(), verifyToken]
      );
      const userId = userRes.rows[0].id;

      // Create student profile
      const studentRes = await client.query(
        `INSERT INTO students (user_id, usn, current_year, semester, branch, section)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, usn.toUpperCase(), current_year, parseInt(semester), branch.toUpperCase(), section.toUpperCase()]
      );
      const studentId = studentRes.rows[0].id;

      // Insert interests
      if (interests && interests.length > 0) {
        const validInterests = ['technical', 'non_technical', 'communication', 'cultural', 'sports', 'management', 'other'];
        for (const interest of interests) {
          if (validInterests.includes(interest)) {
            await client.query(
              'INSERT INTO student_interests (student_id, interest) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [studentId, interest]
            );
          }
        }
      }

      // Send verification email
      const verifyLink = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`;
      const { subject, html } = emailTemplates.verifyEmail(full_name.toUpperCase(), verifyLink);
      await sendEmail({ to: email, subject, html });
    });

    res.status(201).json({
      message: 'Account created successfully. Please check your VVCE email to verify your account.',
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// ── REGISTER ADMIN ─────────────────────────────────────────
const registerAdmin = async (req, res, next) => {
  try {
    const { full_name, email, password, club_name, department } = req.body;
    validateVVCEEmail(email);

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = uuidv4();

    await withTransaction(async (client) => {
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, verify_token)
         VALUES ($1, $2, 'admin', $3, $4) RETURNING id`,
        [email, passwordHash, full_name.toUpperCase(), verifyToken]
      );
      await client.query(
        'INSERT INTO admins (user_id, club_name, department) VALUES ($1, $2, $3)',
        [userRes.rows[0].id, club_name, department]
      );
      const verifyLink = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`;
      const { subject, html } = emailTemplates.verifyEmail(full_name.toUpperCase(), verifyLink);
      await sendEmail({ to: email, subject, html });
    });

    res.status(201).json({ message: 'Admin account created. Please verify your email.' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// ── REGISTER AUTHORITY ─────────────────────────────────────
const registerAuthority = async (req, res, next) => {
  try {
    const { full_name, email, password, designation, department } = req.body;
    validateVVCEEmail(email);

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = uuidv4();

    await withTransaction(async (client) => {
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, verify_token)
         VALUES ($1, $2, 'authority', $3, $4) RETURNING id`,
        [email, passwordHash, full_name.toUpperCase(), verifyToken]
      );
      await client.query(
        'INSERT INTO authorities (user_id, designation, department) VALUES ($1, $2, $3)',
        [userRes.rows[0].id, designation, department]
      );
      const verifyLink = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`;
      const { subject, html } = emailTemplates.verifyEmail(full_name.toUpperCase(), verifyLink);
      await sendEmail({ to: email, subject, html });
    });

    res.status(201).json({ message: 'Authority account created. Please verify your email.' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// ── LOGIN ─────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    validateVVCEEmail(email);

    const result = await query(
      'SELECT id, email, password_hash, role, full_name, is_active, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Your account has been deactivated.' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password.' });

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = generateToken({ userId: user.id, role: user.role });

    // Fetch role-specific profile
    let profile = null;
    if (user.role === 'student') {
      const s = await query(
        `SELECT s.*, array_agg(si.interest) AS interests
         FROM students s LEFT JOIN student_interests si ON s.id = si.student_id
         WHERE s.user_id = $1 GROUP BY s.id`,
        [user.id]
      );
      profile = s.rows[0];
    } else if (user.role === 'admin') {
      const a = await query('SELECT * FROM admins WHERE user_id = $1', [user.id]);
      profile = a.rows[0];
    } else if (user.role === 'authority') {
      const a = await query('SELECT * FROM authorities WHERE user_id = $1', [user.id]);
      profile = a.rows[0];
    }

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        is_verified: user.is_verified,
        profile,
      },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// ── VERIFY EMAIL ──────────────────────────────────────────
const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;
    const result = await query(
      `UPDATE users SET is_verified = TRUE, verify_token = NULL
       WHERE verify_token = $1 AND is_verified = FALSE RETURNING email`,
      [token]
    );
    if (!result.rows.length) {
      return res.status(400).json({ error: 'Invalid or expired verification link.' });
    }
    res.json({ message: 'Email verified successfully. You can now sign in.' });
  } catch (err) { next(err); }
};

// ── FORGOT PASSWORD ────────────────────────────────────────
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    validateVVCEEmail(email);
    const result = await query('SELECT id, full_name FROM users WHERE email = $1', [email]);
    if (!result.rows.length) {
      // Don't reveal whether account exists
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }
    const user = result.rows[0];
    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await query(
      'UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3',
      [resetToken, resetExpires, user.id]
    );
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const { subject, html } = emailTemplates.passwordReset(user.full_name, resetLink);
    await sendEmail({ to: email, subject, html });
    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// ── RESET PASSWORD ─────────────────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const result = await query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_expires > NOW()',
      [token]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Invalid or expired reset token.' });
    const passwordHash = await bcrypt.hash(password, 12);
    await query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL WHERE id = $2',
      [passwordHash, result.rows[0].id]
    );
    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (err) { next(err); }
};

// ── GET PROFILE ────────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    let profile = null;
    const userId = req.user.id;
    if (req.user.role === 'student') {
      const r = await query(
        `SELECT s.*, u.full_name, u.email, u.is_verified,
                array_agg(si.interest) FILTER (WHERE si.interest IS NOT NULL) AS interests
         FROM students s
         JOIN users u ON s.user_id = u.id
         LEFT JOIN student_interests si ON s.id = si.student_id
         WHERE s.user_id = $1 GROUP BY s.id, u.full_name, u.email, u.is_verified`,
        [userId]
      );
      profile = r.rows[0];
    } else if (req.user.role === 'admin') {
      const r = await query(
        `SELECT a.*, u.full_name, u.email, u.is_verified
         FROM admins a JOIN users u ON a.user_id = u.id WHERE a.user_id = $1`,
        [userId]
      );
      profile = r.rows[0];
    } else if (req.user.role === 'authority') {
      const r = await query(
        `SELECT au.*, u.full_name, u.email, u.is_verified
         FROM authorities au JOIN users u ON au.user_id = u.id WHERE au.user_id = $1`,
        [userId]
      );
      profile = r.rows[0];
    }
    res.json({ user: { ...req.user, profile } });
  } catch (err) { next(err); }
};

module.exports = { registerStudent, registerAdmin, registerAuthority, login, verifyEmail, forgotPassword, resetPassword, getProfile };
