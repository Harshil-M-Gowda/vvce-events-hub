// ── Student Profile Controller ────────────────────────────────────────────────
const db = require('../config/database')
const path = require('path')

// GET /api/students/profile
exports.getProfile = async (req, res) => {
  const userId = req.user.id
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email, u.role,
             s.usn, s.year, s.semester, s.branch, s.section, s.interests,
             sp.phone, sp.linkedin, sp.github, sp.skills, sp.bio,
             sp.resume_url, sp.achievements, sp.photo_url,
             COALESCE(ap.total_points, 0) as total_points
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      LEFT JOIN activity_points ap ON ap.student_id = u.id
      WHERE u.id = $1
    `, [userId])

    if (!rows.length) return res.status(404).json({ message: 'Profile not found' })

    const profile = rows[0]
    // Parse JSONB fields
    if (typeof profile.interests === 'string') profile.interests = JSON.parse(profile.interests)
    if (typeof profile.skills === 'string') profile.skills = JSON.parse(profile.skills)
    if (typeof profile.achievements === 'string') profile.achievements = JSON.parse(profile.achievements)

    // Semester-wise points
    const semPts = await db.query(
      'SELECT semester, points FROM semester_activity_points WHERE student_id=$1 ORDER BY semester',
      [userId]
    )
    profile.semester_points = semPts.rows

    // Stats
    const stats = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM registrations WHERE student_id=$1) as registered_events,
        (SELECT COUNT(*) FROM certificates WHERE student_id=$1) as certificates,
        (SELECT COUNT(*) FROM registrations r
         JOIN events e ON e.id=r.event_id
         WHERE r.student_id=$1 AND e.event_date >= NOW()) as upcoming_events
    `, [userId])
    profile.stats = stats.rows[0]

    res.json({ data: profile })
  } catch (err) {
    console.error('Get profile error:', err)
    res.status(500).json({ message: 'Failed to fetch profile' })
  }
}

// PATCH /api/students/profile
exports.updateProfile = async (req, res) => {
  const userId = req.user.id
  const {
    phone, linkedin, github, skills, bio, achievements,
    name, year, semester, branch, section, interests
  } = req.body

  const client = await db.getClient()
  try {
    await client.query('BEGIN')

    // Update users table (name)
    if (name) {
      await client.query('UPDATE users SET name=$1 WHERE id=$2', [name, userId])
    }

    // Update students table
    const studentFields = { year, semester, branch, section }
    const studentUpdates = Object.entries(studentFields).filter(([, v]) => v !== undefined)
    if (studentUpdates.length || interests !== undefined) {
      const cols = studentUpdates.map(([k], i) => `${k}=$${i + 2}`)
      const vals = studentUpdates.map(([, v]) => v)
      if (interests !== undefined) {
        cols.push(`interests=$${vals.length + 2}`)
        vals.push(JSON.stringify(interests))
      }
      if (cols.length) {
        await client.query(
          `UPDATE students SET ${cols.join(',')} WHERE user_id=$1`,
          [userId, ...vals]
        )
      }
    }

    // Upsert student_profiles
    const profileData = { phone, linkedin, github, bio }
    const profileVals = Object.entries(profileData).filter(([, v]) => v !== undefined)

    const extraCols = []
    const extraVals = []
    if (skills !== undefined) { extraCols.push('skills'); extraVals.push(JSON.stringify(skills)) }
    if (achievements !== undefined) { extraCols.push('achievements'); extraVals.push(JSON.stringify(achievements)) }

    const allCols = [...profileVals.map(([k]) => k), ...extraCols]
    const allVals = [...profileVals.map(([, v]) => v), ...extraVals]

    if (allCols.length) {
      const setClauses = allCols.map((c, i) => `${c}=$${i + 2}`).join(',')
      await client.query(`
        INSERT INTO student_profiles (user_id, ${allCols.join(',')})
        VALUES ($1, ${allVals.map((_, i) => `$${i + 2}`).join(',')})
        ON CONFLICT (user_id) DO UPDATE SET ${setClauses}, updated_at=NOW()
      `, [userId, ...allVals])
    }

    await client.query('COMMIT')
    res.json({ message: 'Profile updated successfully' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Update profile error:', err)
    res.status(500).json({ message: 'Failed to update profile', error: err.message })
  } finally {
    client.release()
  }
}

// POST /api/students/upload-photo
exports.uploadPhoto = async (req, res) => {
  const userId = req.user.id
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })

  const photoUrl = `/uploads/${req.file.filename}`
  try {
    await db.query(`
      INSERT INTO student_profiles (user_id, photo_url)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET photo_url=$2, updated_at=NOW()
    `, [userId, photoUrl])
    res.json({ message: 'Photo uploaded', photo_url: photoUrl })
  } catch (err) {
    res.status(500).json({ message: 'Upload failed' })
  }
}

// POST /api/students/upload-resume
exports.uploadResume = async (req, res) => {
  const userId = req.user.id
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })

  const resumeUrl = `/uploads/${req.file.filename}`
  try {
    await db.query(`
      INSERT INTO student_profiles (user_id, resume_url)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET resume_url=$2, updated_at=NOW()
    `, [userId, resumeUrl])
    res.json({ message: 'Resume uploaded', resume_url: resumeUrl })
  } catch (err) {
    res.status(500).json({ message: 'Upload failed' })
  }
}
