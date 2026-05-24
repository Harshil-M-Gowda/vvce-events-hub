-- ============================================================
--  VVCE Events Hub — Full Database Schema
--  Run: psql -U postgres -d vvce_events -f migrations/schema.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fast text search

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(120) NOT NULL,
  email                 VARCHAR(255) NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  role                  VARCHAR(20) NOT NULL DEFAULT 'student'
                          CHECK (role IN ('student', 'admin', 'authority')),
  is_verified           BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  email_verify_token    UUID,
  reset_token           UUID,
  reset_token_expires   TIMESTAMPTZ,
  last_login            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ─── STUDENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  usn       VARCHAR(20) UNIQUE,
  year      VARCHAR(20),
  semester  VARCHAR(10),
  branch    VARCHAR(10),
  section   VARCHAR(5),
  interests JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUTHORITIES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS authorities (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  designation  VARCHAR(80) NOT NULL DEFAULT 'Faculty',
  department   VARCHAR(80),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── EVENTS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(200) NOT NULL,
  club_name           VARCHAR(120) NOT NULL,
  description         TEXT,
  event_date          DATE NOT NULL,
  event_time          VARCHAR(20) NOT NULL,
  venue               VARCHAR(200) NOT NULL,
  max_participants    INTEGER NOT NULL DEFAULT 100,
  registration_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
  category            VARCHAR(40) NOT NULL
                        CHECK (category IN ('Technical','Cultural','Sports','Workshop','Management','Non-Technical','Other')),
  poster_url          TEXT,
  approval_status     VARCHAR(30) NOT NULL DEFAULT 'pending'
                        CHECK (approval_status IN ('pending','approved','rejected','changes_requested')),
  approval_remarks    TEXT,
  approved_by         INTEGER REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  created_by          INTEGER NOT NULL REFERENCES users(id),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_date         ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_status       ON events(approval_status);
CREATE INDEX IF NOT EXISTS idx_events_category     ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_created_by   ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_name_trgm    ON events USING gin(name gin_trgm_ops);

-- ─── REGISTRATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registrations (
  id             SERIAL PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_name      VARCHAR(100),
  status         VARCHAR(20) NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('confirmed','pending','cancelled')),
  is_team_leader BOOLEAN NOT NULL DEFAULT false,
  invite_token   UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_reg_event   ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_reg_student ON registrations(student_id);
CREATE INDEX IF NOT EXISTS idx_reg_status  ON registrations(status);

-- ─── PAYMENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  SERIAL PRIMARY KEY,
  event_id            INTEGER NOT NULL REFERENCES events(id),
  student_id          INTEGER NOT NULL REFERENCES users(id),
  amount              NUMERIC(10,2) NOT NULL,
  method              VARCHAR(20) CHECK (method IN ('upi','card','netbanking','free')),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','success','failed','refunded')),
  transaction_ref     VARCHAR(80) UNIQUE,
  gateway_payment_id  VARCHAR(120),
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_event   ON payments(event_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_status  ON payments(status);

-- ─── ATTENDANCE ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  attended        BOOLEAN NOT NULL DEFAULT false,
  marked_by       INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_att_event ON attendance(event_id);

-- ─── CERTIFICATES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url      TEXT NOT NULL,
  aicte_points  INTEGER NOT NULL DEFAULT 0,
  uploaded_by   INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_cert_student ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_cert_event   ON certificates(event_id);

-- ─── ACTIVITY POINTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_points (
  student_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_points  INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_points_log (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    INTEGER REFERENCES events(id),
  points      INTEGER NOT NULL,
  reason      VARCHAR(200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apl_student ON activity_points_log(student_id);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  message     TEXT NOT NULL,
  event_id    INTEGER REFERENCES events(id),
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- ─── TRIGGERS: auto-update updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN VALUES ('users'),('events'),('registrations'),('attendance'),('certificates'),('activity_points') LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s;
       CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t
    );
  END LOOP;
END $$;
