// src/config/migrate.js
// Run: node src/config/migrate.js
require('dotenv').config();
const { query, pool } = require('./db');

const migrations = [
  // ── USERS (base auth table) ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('student','admin','authority')),
    is_verified   BOOLEAN DEFAULT FALSE,
    verify_token  VARCHAR(255),
    reset_token   VARCHAR(255),
    reset_expires TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── STUDENTS ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS students (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name   VARCHAR(255) NOT NULL,
    usn         VARCHAR(20) UNIQUE NOT NULL,
    year        VARCHAR(10) NOT NULL,
    semester    VARCHAR(10) NOT NULL,
    branch      VARCHAR(10) NOT NULL,
    section     VARCHAR(5) NOT NULL,
    interests   TEXT[] DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── ADMINS (club/event managers) ─────────────────────────
  `CREATE TABLE IF NOT EXISTS admins (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name   VARCHAR(255) NOT NULL,
    club_name   VARCHAR(255) NOT NULL,
    designation VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── AUTHORITIES (faculty/dean/principal) ─────────────────
  `CREATE TABLE IF NOT EXISTS authorities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name   VARCHAR(255) NOT NULL,
    designation VARCHAR(100) NOT NULL,
    department  VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── EVENTS ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    club_name       VARCHAR(255) NOT NULL,
    description     TEXT,
    event_date      DATE NOT NULL,
    event_time      TIME NOT NULL,
    venue           VARCHAR(255) NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 100,
    registration_fee NUMERIC(10,2) DEFAULT 0,
    poster_url      VARCHAR(500),
    category        VARCHAR(50) NOT NULL DEFAULT 'Technical',
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','completed')),
    approved_by     UUID REFERENCES authorities(id),
    approved_at     TIMESTAMPTZ,
    likes_count     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── REGISTRATIONS ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS registrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    participation   VARCHAR(10) NOT NULL DEFAULT 'solo' CHECK (participation IN ('solo','team')),
    team_id         UUID,
    status          VARCHAR(20) NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('pending','confirmed','cancelled')),
    payment_status  VARCHAR(20) DEFAULT 'not_required'
                    CHECK (payment_status IN ('not_required','pending','paid','failed')),
    payment_id      UUID,
    registered_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, student_id)
  )`,

  // ── TEAMS ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    team_name   VARCHAR(255) NOT NULL,
    leader_id   UUID NOT NULL REFERENCES students(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── TEAM MEMBERS ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS team_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES students(id),
    status      VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
    invite_token VARCHAR(255),
    joined_at   TIMESTAMPTZ,
    UNIQUE(team_id, student_id)
  )`,

  // ── PAYMENTS ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id     UUID NOT NULL REFERENCES registrations(id),
    student_id          UUID NOT NULL REFERENCES students(id),
    amount              NUMERIC(10,2) NOT NULL,
    method              VARCHAR(20) CHECK (method IN ('upi','card','netbanking')),
    razorpay_order_id   VARCHAR(255),
    razorpay_payment_id VARCHAR(255),
    razorpay_signature  VARCHAR(500),
    status              VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','success','failed','refunded')),
    receipt_url         VARCHAR(500),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── CERTIFICATES ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS certificates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    certificate_url VARCHAR(500),
    uploaded_by     UUID REFERENCES admins(id),
    uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, student_id)
  )`,

  // ── ACTIVITY POINTS ───────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS activity_points (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    points      INTEGER NOT NULL DEFAULT 0,
    category    VARCHAR(50),
    awarded_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, event_id)
  )`,

  // ── ATTENDANCE ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS attendance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    is_present      BOOLEAN DEFAULT FALSE,
    marked_at       TIMESTAMPTZ,
    marked_by       UUID REFERENCES admins(id),
    UNIQUE(event_id, student_id)
  )`,

  // ── NOTIFICATIONS ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    message     TEXT NOT NULL,
    type        VARCHAR(50) DEFAULT 'info',
    is_read     BOOLEAN DEFAULT FALSE,
    link        VARCHAR(500),
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ── EVENT LIKES (students liking events) ─────────────────
  `CREATE TABLE IF NOT EXISTS event_likes (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, event_id)
  )`,

  // ── EVENT SAVES (bookmarks) ───────────────────────────────
  `CREATE TABLE IF NOT EXISTS event_saves (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, event_id)
  )`,

  // ── INDEXES ───────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`,
  `CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date)`,
  `CREATE INDEX IF NOT EXISTS idx_events_category ON events(category)`,
  `CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_registrations_student ON registrations(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_points_student ON activity_points(student_id)`,

  // ── updated_at trigger function ───────────────────────────
  `CREATE OR REPLACE FUNCTION update_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
   $$ LANGUAGE plpgsql`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_users_updated_at') THEN
       CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_events_updated_at') THEN
       CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events
       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
     END IF;
   END $$`,
];

async function migrate() {
  console.log('🚀 Running VVCE Events Hub DB migrations...\n');
  for (let i = 0; i < migrations.length; i++) {
    try {
      await query(migrations[i]);
      const first = migrations[i].trim().split('\n')[0].slice(0, 60);
      console.log(`  ✅ [${i + 1}/${migrations.length}] ${first}`);
    } catch (err) {
      console.error(`  ❌ Migration ${i + 1} failed:`, err.message);
      process.exit(1);
    }
  }
  console.log('\n✨ All migrations completed successfully!');
  await pool.end();
}

migrate();
